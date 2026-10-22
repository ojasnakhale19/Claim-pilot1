/**
 * Provider factory and exports for ClaimPilot AI multimodal AI integration
 */

export { MultimodalProvider, MultimodalAnalysisInput, MultimodalAnalysisOutput, MultimodalDamageItem, AIDamageObservation, DuplicateWarning, ProviderRequestOptions, ProviderError } from './types';
export { GeminiProvider } from './geminiProvider';
export { OpenAIProvider } from './openaiProvider';

import { MultimodalProvider } from './types';
import { GeminiProvider } from './geminiProvider';
import { OpenAIProvider } from './openaiProvider';

export type ProviderType = 'gemini' | 'openai';

export interface ProviderFactoryConfig {
  type: ProviderType;
  apiKey: string;
  modelId?: string;
  baseUrl?: string;
}

export function createProvider(config: ProviderFactoryConfig): MultimodalProvider {
  switch (config.type) {
    case 'gemini':
      return new GeminiProvider({
        apiKey: config.apiKey,
        modelId: config.modelId,
        baseUrl: config.baseUrl,
      });
    case 'openai':
      return new OpenAIProvider({
        apiKey: config.apiKey,
        modelId: config.modelId,
        baseUrl: config.baseUrl,
      });
    default:
      throw new Error(`Unknown provider type: ${(config as ProviderFactoryConfig).type}`);
  }
}

export function getDefaultModelId(type: ProviderType): string {
  switch (type) {
    case 'gemini':
      return 'gemini-1.5-flash-latest';
    case 'openai':
      return 'gpt-4o-mini';
    default:
      return '';
  }
}

export function validateProviderConfig(config: ProviderFactoryConfig): { valid: boolean; error?: string } {
  if (!config.apiKey || config.apiKey.trim() === '') {
    return { valid: false, error: 'API key is required' };
  }

  if (config.type === 'gemini' && !config.apiKey.startsWith('AIza')) {
    return { valid: false, error: 'Gemini API key should start with "AIza"' };
  }

  if (config.type === 'openai' && !config.apiKey.startsWith('sk-')) {
    return { valid: false, error: 'OpenAI API key should start with "sk-"' };
  }

  return { valid: true };
}