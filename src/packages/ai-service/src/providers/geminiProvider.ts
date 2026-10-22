/**
 * Google Gemini Vision Provider for ClaimPilot AI
 * Implements multimodal damage assessment using Gemini models
 */

import {
  MultimodalProvider,
  MultimodalAnalysisInput,
  MultimodalAnalysisOutput,
  ProviderRequestOptions,
  ProviderError,
  VehicleView,
} from './types';

interface GeminiConfig {
  apiKey: string;
  modelId?: string;
  baseUrl?: string;
}

interface GeminiPart {
  text?: string;
  inline_data?: {
    mime_type: string;
    data: string;
  };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiRequest {
  contents: GeminiContent[];
  generationConfig: {
    temperature: number;
    maxOutputTokens: number;
    responseMimeType: 'application/json';
    responseSchema: object;
  };
  safetySettings?: Array<{
    category: string;
    threshold: string;
  }>;
}

interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{ text: string }>;
    };
    finishReason: string;
  }>;
  promptFeedback?: {
    blockReason: string;
  };
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

export class GeminiProvider implements MultimodalProvider {
  name = 'gemini';
  modelId: string;
  private apiKey: string;
  private baseUrl: string;
  private defaultOptions: Required<ProviderRequestOptions>;

  constructor(config: GeminiConfig) {
    this.apiKey = config.apiKey;
    this.modelId = config.modelId || 'gemini-1.5-flash-latest';
    this.baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta/models';
    this.defaultOptions = {
      timeout: 60000,
      maxRetries: 2,
      retryDelay: 1000,
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/${this.modelId}:generateContent?key=${this.apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Test connection' }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 10 },
        }),
        signal: AbortSignal.timeout(10000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async analyzeImages(input: MultimodalAnalysisInput): Promise<MultimodalAnalysisOutput> {
    const prompt = this.buildPrompt(input);
    const imageParts = input.views.map(view => ({
      inline_data: {
        mime_type: view.mimeType,
        data: view.imageBase64,
      },
    }));

    const request: GeminiRequest = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            ...imageParts,
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        responseSchema: this.getResponseSchema(),
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      ],
    };

    const response = await this.makeRequest(request);
    return this.parseResponse(response);
  }

  private buildPrompt(input: MultimodalAnalysisInput): string {
    const detectionsByView = input.views.map(v => ({
      view: v.view,
      detections: v.detections.map(d => ({
        id: d.id,
        class: d.className,
        confidence: d.confidence,
        bbox: d.bbox,
      })),
    }));

    return `You are an expert automotive damage assessor for insurance claims. Analyze the provided vehicle photos and YOLO detections to produce a structured damage assessment.

VEHICLE: ${input.vehicle.make} ${input.vehicle.model}${input.vehicle.year ? ` (${input.vehicle.year})` : ''}${input.vehicle.variant ? ` - ${input.vehicle.variant}` : ''}

YOLO DETECTIONS BY VIEW:
${JSON.stringify(detectionsByView, null, 2)}

ANALYSIS REQUIREMENTS:
1. For each YOLO detection, verify if the damage visually corresponds to the detected class and location
2. Describe visible damage and severity with uncertainty clearly stated
3. Distinguish actual damage from shadows, reflections, dirt, panel gaps, and artifacts
4. Identify potentially damaged components NOT detected by YOLO (label as AI observations)
5. Detect potential duplicate reports of the same damage across different views
6. Recommend repair vs replace based on visible damage, component material, and assumptions
7. Identify when physical inspection by a mechanic/body shop is needed
8. Estimate repair cost range using reasonable assumptions - explicitly state all assumptions
9. Explain which conclusions are supported by visual evidence vs estimates

CRITICAL LIMITATIONS - YOU MUST NEVER CLAIM:
- Hidden structural damage has been verified
- Internal mechanical damage has been assessed
- Airbag deployment status is known
- Safety-critical functionality has been verified
- Any conclusion is definitive without physical inspection

OUTPUT FORMAT: Return ONLY valid JSON matching the provided schema.`;
  }

  private getResponseSchema(): object {
    return {
      type: 'object',
      properties: {
        damageItems: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              component: { type: 'string' },
              view: { type: 'string', enum: ['top', 'bottom', 'left', 'right'] },
              detectionIds: { type: 'array', items: { type: 'string' } },
              damageType: { type: 'string' },
              severity: { type: 'string', enum: ['minor', 'moderate', 'severe', 'uncertain'] },
              evidence: { type: 'array', items: { type: 'string' } },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              recommendation: { type: 'string', enum: ['repair', 'replace', 'inspect', 'undetermined'] },
              reasoning: { type: 'string' },
              assumptions: { type: 'array', items: { type: 'string' } },
            },
            required: ['component', 'view', 'detectionIds', 'damageType', 'severity', 'evidence', 'confidence', 'recommendation', 'reasoning', 'assumptions'],
          },
        },
        aiObservations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              component: { type: 'string' },
              view: { type: 'string', enum: ['top', 'bottom', 'left', 'right'] },
              description: { type: 'string' },
              severity: { type: 'string', enum: ['minor', 'moderate', 'severe', 'uncertain'] },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              reasoning: { type: 'string' },
              boundingBoxHint: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' },
                  width: { type: 'number' },
                  height: { type: 'number' },
                },
              },
            },
            required: ['component', 'view', 'description', 'severity', 'confidence', 'reasoning'],
          },
        },
        duplicateDetectionWarnings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              detectionIds: { type: 'array', items: { type: 'string' } },
              views: { type: 'array', items: { type: 'string', enum: ['top', 'bottom', 'left', 'right'] } },
              message: { type: 'string' },
            },
            required: ['detectionIds', 'views', 'message'],
          },
        },
        overallReasoning: { type: 'string' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        limitations: { type: 'array', items: { type: 'string' } },
      },
      required: ['damageItems', 'aiObservations', 'duplicateDetectionWarnings', 'overallReasoning', 'confidence', 'limitations'],
    };
  }

  private async makeRequest(request: GeminiRequest, options: ProviderRequestOptions = {}): Promise<GeminiResponse> {
    const opts = { ...this.defaultOptions, ...options };
    const url = `${this.baseUrl}/${this.modelId}:generateContent?key=${this.apiKey}`;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), opts.timeout);

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          const error = new Error(`Gemini API error: ${response.status} - ${errorText}`) as ProviderError;
          error.statusCode = response.status;
          error.retryable = response.status >= 500 || response.status === 429;
          throw error;
        }

        const data = await response.json();
        return data;
      } catch (error) {
        lastError = error as Error;
        const providerError = error as ProviderError & { name?: string };

        if (attempt < opts.maxRetries && (providerError.retryable || providerError.name === 'AbortError')) {
          await new Promise(resolve => setTimeout(resolve, opts.retryDelay * (attempt + 1)));
          continue;
        }
        break;
      }
    }

    throw lastError || new Error('Gemini request failed');
  }

  private parseResponse(response: GeminiResponse): MultimodalAnalysisOutput {
    if (response.error) {
      throw new Error(`Gemini API error: ${response.error.message}`);
    }

    if (response.promptFeedback?.blockReason) {
      throw new Error(`Gemini content blocked: ${response.promptFeedback.blockReason}`);
    }

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Empty response from Gemini');
    }

    try {
      const parsed = JSON.parse(text);
      return this.validateAndNormalize(parsed);
    } catch (error) {
      throw new Error(`Failed to parse Gemini response: ${(error as Error).message}`);
    }
  }

  private validateAndNormalize(data: unknown): MultimodalAnalysisOutput {
    // Basic validation and normalization
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
      view: (['top', 'bottom', 'left', 'right'].includes(String(i.view)) ? String(i.view) : 'left') as VehicleView,
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
      view: (['top', 'bottom', 'left', 'right'].includes(String(o.view)) ? String(o.view) : 'left') as VehicleView,
      description: String(o.description || ''),
      severity: (['minor', 'moderate', 'severe', 'uncertain'].includes(String(o.severity)) ? String(o.severity) : 'uncertain') as 'minor' | 'moderate' | 'severe' | 'uncertain',
      confidence: typeof o.confidence === 'number' ? Math.max(0, Math.min(1, o.confidence)) : 0.5,
      reasoning: String(o.reasoning || ''),
      boundingBoxHint: o.boundingBoxHint && typeof o.boundingBoxHint === 'object' ? o.boundingBoxHint as { x: number; y: number; width: number; height: number } : undefined,
    };
  }
}