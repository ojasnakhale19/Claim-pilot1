/**
 * Provider interfaces and types for multimodal AI integration
 */

export type VehicleView = 'top' | 'bottom' | 'left' | 'right';

export interface VehicleInfo {
  make: string;
  model: string;
  year?: number;
  variant?: string;
}

export interface DamageDetection {
  id: string;
  view: VehicleView;
  className: string;
  confidence: number;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  originalImageWidth?: number;
  originalImageHeight?: number;
}

export interface MultimodalProvider {
  name: string;
  modelId: string;
  analyzeImages(input: MultimodalAnalysisInput): Promise<MultimodalAnalysisOutput>;
  testConnection(): Promise<boolean>;
}

export interface MultimodalAnalysisInput {
  vehicle: VehicleInfo;
  views: Array<{
    view: VehicleView;
    imageBase64: string;
    mimeType: string;
    detections: DamageDetection[];
  }>;
  locale?: string;
  currency?: string;
}

export interface MultimodalAnalysisOutput {
  damageItems: MultimodalDamageItem[];
  aiObservations: AIDamageObservation[];
  duplicateDetectionWarnings: DuplicateWarning[];
  overallReasoning: string;
  confidence: number;
  limitations: string[];
}

export interface MultimodalDamageItem {
  component: string;
  view: VehicleView;
  detectionIds: string[];
  damageType: string;
  severity: 'minor' | 'moderate' | 'severe' | 'uncertain';
  evidence: string[];
  confidence: number;
  recommendation: 'repair' | 'replace' | 'inspect' | 'undetermined';
  reasoning: string;
  assumptions: string[];
}

export interface AIDamageObservation {
  component: string;
  view: VehicleView;
  description: string;
  severity: 'minor' | 'moderate' | 'severe' | 'uncertain';
  confidence: number;
  reasoning: string;
  boundingBoxHint?: { x: number; y: number; width: number; height: number };
}

export interface DuplicateWarning {
  detectionIds: string[];
  views: VehicleView[];
  message: string;
}

export interface ProviderRequestOptions {
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

export interface ProviderError extends Error {
  code?: string;
  statusCode?: number;
  retryable?: boolean;
}