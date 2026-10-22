/**
 * OpenAI Vision Provider for ClaimPilot AI
 * Implements multimodal damage assessment using GPT-4o family models
 */

import {
  MultimodalProvider,
  MultimodalAnalysisInput,
  MultimodalAnalysisOutput,
  ProviderRequestOptions,
} from './types';

interface OpenAIConfig {
  apiKey: string;
  modelId?: string;
  baseUrl?: string;
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: { url: string; detail?: 'low' | 'high' | 'auto' };
  }>;
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature: number;
  max_tokens: number;
  response_format: { type: 'json_object' };
}

interface OpenAIResponse {
  choices?: Array<{
    message: { content: string };
    finish_reason: string;
  }>;
  error?: {
    code: string;
    message: string;
    type: string;
  };
}

export class OpenAIProvider implements MultimodalProvider {
  name = 'openai';
  modelId: string;
  private apiKey: string;
  private baseUrl: string;
  private defaultOptions: Required<ProviderRequestOptions>;

  constructor(config: OpenAIConfig) {
    this.apiKey = config.apiKey;
    this.modelId = config.modelId || 'gpt-4o-mini';
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1/chat/completions';
    this.defaultOptions = {
      timeout: 60000,
      maxRetries: 2,
      retryDelay: 1000,
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.modelId,
          messages: [{ role: 'user', content: 'Test connection' }],
          max_tokens: 10,
        }),
        signal: AbortSignal.timeout(10000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async analyzeImages(input: MultimodalAnalysisInput): Promise<MultimodalAnalysisOutput> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(input);

    const messages: OpenAIMessage[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          ...input.views.map(view => ({
            type: 'image_url' as const,
            image_url: {
              url: `data:${view.mimeType};base64,${view.imageBase64}`,
              detail: 'high' as const,
            },
          })),
        ],
      },
    ];

    const request: OpenAIRequest = {
      model: this.modelId,
      messages,
      temperature: 0.1,
      max_tokens: 8192,
      response_format: { type: 'json_object' },
    };

    const response = await this.makeRequest(request);
    return this.parseResponse(response);
  }

  private buildSystemPrompt(): string {
    return `You are an expert automotive damage assessor for insurance claims. Analyze vehicle photos and YOLO detections to produce a structured damage assessment.

CRITICAL RULES:
1. NEVER claim hidden structural damage has been verified from photos
2. NEVER claim internal mechanical damage has been assessed
3. NEVER claim airbag deployment status is known
4. NEVER claim safety-critical functionality has been verified
5. ALWAYS distinguish visual evidence from estimates
6. ALWAYS state assumptions explicitly
7. ALWAYS recommend physical inspection for structural/safety items

OUTPUT: Return ONLY valid JSON matching the schema. No markdown, no extra text.`;
  }

  private buildUserPrompt(input: MultimodalAnalysisInput): string {
    const detectionsByView = input.views.map(v => ({
      view: v.view,
      detections: v.detections.map(d => ({
        id: d.id,
        class: d.className,
        confidence: d.confidence,
        bbox: d.bbox,
      })),
    }));

    return `VEHICLE: ${input.vehicle.make} ${input.vehicle.model}${input.vehicle.year ? ` (${input.vehicle.year})` : ''}${input.vehicle.variant ? ` - ${input.vehicle.variant}` : ''}

YOLO DETECTIONS BY VIEW:
${JSON.stringify(detectionsByView, null, 2)}

Analyze each image with its corresponding YOLO detections. For each detection, verify if the damage visually corresponds to the detected class and location. Identify:
1. Corroborated damage (YOLO detection matches visual evidence)
2. Uncertain detections (low confidence or visual mismatch)
3. Additional damage NOT detected by YOLO
4. Potential duplicates across views
5. Repair vs replace recommendations with reasoning
6. When physical inspection is required

Return JSON with: damageItems, aiObservations, duplicateDetectionWarnings, overallReasoning, confidence, limitations.`;
  }

  private async makeRequest(request: OpenAIRequest, options: ProviderRequestOptions = {}): Promise<OpenAIResponse> {
    const opts = { ...this.defaultOptions, ...options };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), opts.timeout);

        const response = await fetch(this.baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          const error = new Error(`OpenAI API error: ${response.status} - ${errorText}`) as Error & { statusCode?: number; retryable?: boolean };
          error.statusCode = response.status;
          error.retryable = response.status >= 500 || response.status === 429;
          throw error;
        }

        const data = await response.json();
        return data;
      } catch (error) {
        lastError = error as Error;
        const providerError = error as Error & { statusCode?: number; retryable?: boolean; name?: string };

        if (attempt < opts.maxRetries && (providerError.retryable || providerError.name === 'AbortError')) {
          await new Promise(resolve => setTimeout(resolve, opts.retryDelay * (attempt + 1)));
          continue;
        }
        break;
      }
    }

    throw lastError || new Error('OpenAI request failed');
  }

  private parseResponse(response: OpenAIResponse): MultimodalAnalysisOutput {
    if (response.error) {
      throw new Error(`OpenAI API error: ${response.error.message}`);
    }

    const text = response.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error('Empty response from OpenAI');
    }

    try {
      const parsed = JSON.parse(text);
      return this.validateAndNormalize(parsed);
    } catch (error) {
      throw new Error(`Failed to parse OpenAI response: ${(error as Error).message}`);
    }
  }

  private validateAndNormalize(data: unknown): MultimodalAnalysisOutput {
    const result = data as Record<string, unknown>;

    return {
      damageItems: Array.isArray(result.damageItems) ? result.damageItems.map(this.normalizeDamageItem) : [],
      aiObservations: Array.isArray(result.aiObservations) ? result.aiObservations.map(this.normalizeObservation) : [],
      duplicateDetectionWarnings: Array.isArray(result.duplicateDetectionWarnings) ? result.duplicateDetectionWarnings : [],
      overallReasoning: typeof result.overallReasoning === 'string' ? result.overallReasoning : '',
      confidence: typeof result.confidence === 'number' ? Math.max(0, Math.min(1, result.confidence)) : 0.5,
      limitations: Array.isArray(result.limitations) ? result.limitations.filter(l => typeof l === 'string') : [],
    };
  }

  private normalizeDamageItem(item: unknown): MultimodalAnalysisOutput['damageItems'][0] {
    const i = item as Record<string, unknown>;
    return {
      component: String(i.component || 'Unknown'),
      view: (['top', 'bottom', 'left', 'right'].includes(String(i.view)) ? String(i.view) : 'left') as 'top' | 'bottom' | 'left' | 'right',
      detectionIds: Array.isArray(i.detectionIds) ? i.detectionIds.map(String) : [],
      damageType: String(i.damageType || 'damage'),
      severity: (['minor', 'moderate', 'severe', 'uncertain'].includes(String(i.severity)) ? String(i.severity) : 'uncertain') as 'minor' | 'moderate' | 'severe' | 'uncertain',
      evidence: Array.isArray(i.evidence) ? i.evidence.map(String) : [],
      confidence: typeof i.confidence === 'number' ? Math.max(0, Math.min(1, i.confidence)) : 0.5,
      recommendation: (['repair', 'replace', 'inspect', 'undetermined'].includes(String(i.recommendation)) ? String(i.recommendation) : 'undetermined') as 'repair' | 'replace' | 'inspect' | 'undetermined',
      reasoning: String(i.reasoning || ''),
      assumptions: Array.isArray(i.assumptions) ? i.assumptions.map(String) : [],
    };
  }

  private normalizeObservation(obs: unknown): MultimodalAnalysisOutput['aiObservations'][0] {
    const o = obs as Record<string, unknown>;
    return {
      component: String(o.component || 'Unknown'),
      view: (['top', 'bottom', 'left', 'right'].includes(String(o.view)) ? String(o.view) : 'left') as 'top' | 'bottom' | 'left' | 'right',
      description: String(o.description || ''),
      severity: (['minor', 'moderate', 'severe', 'uncertain'].includes(String(o.severity)) ? String(o.severity) : 'uncertain') as 'minor' | 'moderate' | 'severe' | 'uncertain',
      confidence: typeof o.confidence === 'number' ? Math.max(0, Math.min(1, o.confidence)) : 0.5,
      reasoning: String(o.reasoning || ''),
      boundingBoxHint: o.boundingBoxHint && typeof o.boundingBoxHint === 'object' ? o.boundingBoxHint as { x: number; y: number; width: number; height: number } : undefined,
    };
  }
}