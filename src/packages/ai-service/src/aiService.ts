/**
 * Hybrid AI Service for ClaimPilot AI
 * Combines local YOLO inference with multimodal vision/LLM reasoning
 */

// ─── Types ────────────────────────────────────────────────────────────────────

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

export interface DamageAssessmentInput {
  vehicle: VehicleInfo;
  photos: Partial<Record<VehicleView, Blob | File | string>>;
  detections: DamageDetection[];
  currency?: string;
  locale?: string;
}

export type AssessmentMode = 'local' | 'hybrid';

export interface MoneyRange {
  min: number;
  max: number;
  currency: string;
}

export interface DamageItem {
  id: string;
  component: string;
  view: VehicleView;
  detectionIds: string[];
  damageType: string;
  severity: 'minor' | 'moderate' | 'severe' | 'uncertain';
  evidence: string[];
  confidence?: number;
  recommendation: 'repair' | 'replace' | 'inspect' | 'undetermined';
  repairCost: MoneyRange;
  replaceCost: MoneyRange;
  reasoning: string;
  assumptions: string[];
}

export interface AdjusterReport {
  claimSummary: {
    vehicle: VehicleInfo;
    photosReceived: VehicleView[];
    photosMissing: VehicleView[];
    assessmentDate: string;
    assessmentMode: AssessmentMode;
  };
  yoloDetections: DamageDetection[];
  corroboratedDamage: DamageItem[];
  uncertainDetections: DamageDetection[];
  aiObservations: AIDamageObservation[];
  repairRecommendations: RepairVsReplaceRecommendation[];
  itemizedRepairEstimate: ItemizedEstimate;
  itemizedReplaceEstimate: ItemizedEstimate;
  grossRepairCost: MoneyRange;
  settlementScenarios: SettlementScenario[];
  assumptions: string[];
  limitations: string[];
  inspectionRecommendations: string[];
}

export interface AIDamageObservation {
  id: string;
  component: string;
  view: VehicleView;
  description: string;
  severity: 'minor' | 'moderate' | 'severe' | 'uncertain';
  confidence: number;
  reasoning: string;
  boundingBoxHint?: { x: number; y: number; width: number; height: number };
}

export interface RepairVsReplaceRecommendation {
  component: string;
  view: VehicleView;
  detectionIds: string[];
  recommendation: 'repair' | 'replace' | 'inspect';
  repairCost: MoneyRange;
  replaceCost: MoneyRange;
  reasoning: string;
  assumptions: string[];
  safetyConsiderations: string[];
}

export interface ItemizedEstimate {
  items: EstimateItem[];
  subtotal: MoneyRange;
  labor: MoneyRange;
  paintAndRefinishing: MoneyRange;
  other: MoneyRange;
  total: MoneyRange;
}

export interface EstimateItem {
  component: string;
  operation: 'repair' | 'replace' | 'paint' | 'labor' | 'other';
  cost: MoneyRange;
  notes?: string;
}

export interface SettlementScenario {
  id: string;
  label: string;
  description: string;
  grossRepairCost: MoneyRange;
  deductible: MoneyRange;
  depreciation: MoneyRange;
  otherAdjustments: MoneyRange;
  netSettlement: MoneyRange;
  assumptions: string[];
  recommendedPath: 'repair' | 'replace' | 'mixed';
}

export interface AssessmentResult {
  mode: AssessmentMode;
  vehicle: VehicleInfo;
  damageItems: DamageItem[];
  totalEstimatedRepairCost: MoneyRange;
  recommendedSettlement: MoneyRange;
  assumptions: string[];
  limitations: string[];
  report: AdjusterReport;
}

// ─── Provider Types ──────────────────────────────────────────────────────────

export interface AIProvider {
  name: string;
  modelId: string;
  assessDamage(input: DamageAssessmentInput): Promise<AssessmentResult>;
  testConnection(): Promise<boolean>;
}

export interface ProviderConfig {
  provider: 'gemini' | 'openai';
  apiKey: string;
  modelId?: string;
  baseUrl?: string;
}

// ─── Schema Validation ────────────────────────────────────────────────────────

import { z } from 'zod';

const DamageItemSchema = z.object({
  id: z.string(),
  component: z.string(),
  view: z.enum(['top', 'bottom', 'left', 'right']),
  detectionIds: z.array(z.string()),
  damageType: z.string(),
  severity: z.enum(['minor', 'moderate', 'severe', 'uncertain']),
  evidence: z.array(z.string()),
  confidence: z.number().min(0).max(1).optional(),
  recommendation: z.enum(['repair', 'replace', 'inspect', 'undetermined']),
  repairCost: z.object({ min: z.number(), max: z.number(), currency: z.string() }),
  replaceCost: z.object({ min: z.number(), max: z.number(), currency: z.string() }),
  reasoning: z.string(),
  assumptions: z.array(z.string()),
});

const AdjusterReportSchema = z.object({
  claimSummary: z.object({
    vehicle: z.object({
      make: z.string(),
      model: z.string(),
      year: z.number().optional(),
      variant: z.string().optional(),
    }),
    photosReceived: z.array(z.enum(['top', 'bottom', 'left', 'right'])),
    photosMissing: z.array(z.enum(['top', 'bottom', 'left', 'right'])),
    assessmentDate: z.string(),
    assessmentMode: z.enum(['local', 'hybrid']),
  }),
  yoloDetections: z.array(z.object({
    id: z.string(),
    view: z.enum(['top', 'bottom', 'left', 'right']),
    className: z.string(),
    confidence: z.number(),
    bbox: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
    originalImageWidth: z.number().optional(),
    originalImageHeight: z.number().optional(),
  })),
  corroboratedDamage: z.array(DamageItemSchema),
  uncertainDetections: z.array(z.object({
    id: z.string(),
    view: z.enum(['top', 'bottom', 'left', 'right']),
    className: z.string(),
    confidence: z.number(),
    bbox: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
  })),
  aiObservations: z.array(z.object({
    id: z.string(),
    component: z.string(),
    view: z.enum(['top', 'bottom', 'left', 'right']),
    description: z.string(),
    severity: z.enum(['minor', 'moderate', 'severe', 'uncertain']),
    confidence: z.number(),
    reasoning: z.string(),
    boundingBoxHint: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional(),
  })),
  repairRecommendations: z.array(z.object({
    component: z.string(),
    view: z.enum(['top', 'bottom', 'left', 'right']),
    detectionIds: z.array(z.string()),
    recommendation: z.enum(['repair', 'replace', 'inspect']),
    repairCost: z.object({ min: z.number(), max: z.number(), currency: z.string() }),
    replaceCost: z.object({ min: z.number(), max: z.number(), currency: z.string() }),
    reasoning: z.string(),
    assumptions: z.array(z.string()),
    safetyConsiderations: z.array(z.string()),
  })),
  itemizedRepairEstimate: z.object({
    items: z.array(z.object({
      component: z.string(),
      operation: z.enum(['repair', 'replace', 'paint', 'labor', 'other']),
      cost: z.object({ min: z.number(), max: z.number(), currency: z.string() }),
      notes: z.string().optional(),
    })),
    subtotal: z.object({ min: z.number(), max: z.number(), currency: z.string() }),
    labor: z.object({ min: z.number(), max: z.number(), currency: z.string() }),
    paintAndRefinishing: z.object({ min: z.number(), max: z.number(), currency: z.string() }),
    other: z.object({ min: z.number(), max: z.number(), currency: z.string() }),
    total: z.object({ min: z.number(), max: z.number(), currency: z.string() }),
  }),
  itemizedReplaceEstimate: z.object({
    items: z.array(z.object({
      component: z.string(),
      operation: z.enum(['repair', 'replace', 'paint', 'labor', 'other']),
      cost: z.object({ min: z.number(), max: z.number(), currency: z.string() }),
      notes: z.string().optional(),
    })),
    subtotal: z.object({ min: z.number(), max: z.number(), currency: z.string() }),
    labor: z.object({ min: z.number(), max: z.number(), currency: z.string() }),
    paintAndRefinishing: z.object({ min: z.number(), max: z.number(), currency: z.string() }),
    other: z.object({ min: z.number(), max: z.number(), currency: z.string() }),
    total: z.object({ min: z.number(), max: z.number(), currency: z.string() }),
  }),
  grossRepairCost: z.object({ min: z.number(), max: z.number(), currency: z.string() }),
  settlementScenarios: z.array(z.object({
    id: z.string(),
    label: z.string(),
    description: z.string(),
    grossRepairCost: z.object({ min: z.number(), max: z.number(), currency: z.string() }),
    deductible: z.object({ min: z.number(), max: z.number(), currency: z.string() }),
    depreciation: z.object({ min: z.number(), max: z.number(), currency: z.string() }),
    otherAdjustments: z.object({ min: z.number(), max: z.number(), currency: z.string() }),
    netSettlement: z.object({ min: z.number(), max: z.number(), currency: z.string() }),
    assumptions: z.array(z.string()),
    recommendedPath: z.enum(['repair', 'replace', 'mixed']),
  })),
  assumptions: z.array(z.string()),
  limitations: z.array(z.string()),
  inspectionRecommendations: z.array(z.string()),
});

const AssessmentResultSchema = z.object({
  mode: z.enum(['local', 'hybrid']),
  vehicle: z.object({
    make: z.string(),
    model: z.string(),
    year: z.number().optional(),
    variant: z.string().optional(),
  }),
  damageItems: z.array(DamageItemSchema),
  totalEstimatedRepairCost: z.object({ min: z.number(), max: z.number(), currency: z.string() }),
  recommendedSettlement: z.object({ min: z.number(), max: z.number(), currency: z.string() }),
  assumptions: z.array(z.string()),
  limitations: z.array(z.string()),
  report: AdjusterReportSchema,
});

export function validateAssessmentResult(data: unknown): AssessmentResult {
  return AssessmentResultSchema.parse(data);
}

export function safeValidateAssessmentResult(data: unknown): { success: boolean; data?: AssessmentResult; error?: string } {
  const result = AssessmentResultSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.message };
}

// ─── Local Pricing Engine ────────────────────────────────────────────────────

import { loadCarPricingData, calculateSettlement, type ModelPricing, type DamageDetection as PricingDamageDetection } from '../../../lib/settlementCalculator';

export class LocalPricingEngine {
  private pricingData: ModelPricing[] = [];
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    this.pricingData = await loadCarPricingData();
    this.loaded = true;
  }

  async calculateLocalAssessment(
    vehicle: VehicleInfo,
    detections: DamageDetection[]
  ): Promise<{
    items: DamageItem[];
    totalRepairCost: MoneyRange;
    settlementRange: MoneyRange;
    assumptions: string[];
    limitations: string[];
  }> {
    await this.load();

    // Convert our detections to pricing format
    const pricingDetections: PricingDamageDetection[] = detections.map(d => ({
      part: d.className,
      severity: d.confidence > 0.7 ? 'severe' : d.confidence > 0.4 ? 'moderate' : 'minor',
      confidence: d.confidence,
      boundingBox: d.bbox,
    }));

    const settlement = calculateSettlement(this.pricingData, {
      manufacturer: vehicle.make,
      model: vehicle.model,
      causeOfDamage: 'accident',
    }, pricingDetections);

    // Build damage items from settlement breakdown
    const items: DamageItem[] = settlement.breakdown.map((b: { part: string; severity: string; approach: string; costMin: number; costMax: number; reasoning: string }, index: number) => ({
      id: `local-${index}`,
      component: b.part,
      view: 'left' as VehicleView, // Default, would need view mapping
      detectionIds: [],
      damageType: b.severity,
      severity: b.severity as 'minor' | 'moderate' | 'severe' | 'uncertain',
      evidence: [`Local pricing database: ${vehicle.make} ${vehicle.model}`],
      confidence: undefined,
      recommendation: (b.approach === 'repair' ? 'repair' : 'replace') as 'repair' | 'replace' | 'inspect' | 'undetermined',
      repairCost: { min: b.costMin, max: b.costMax, currency: 'INR' },
      replaceCost: { min: b.costMin, max: b.costMax, currency: 'INR' },
      reasoning: b.reasoning,
      assumptions: ['Based on local pricing database only', 'No visual AI corroboration'],
    }));

    return {
      items,
      totalRepairCost: { min: settlement.totalRepairMin + settlement.totalReplaceMin, max: settlement.totalRepairMax + settlement.totalReplaceMax, currency: 'INR' },
      settlementRange: { min: settlement.settlementMin, max: settlement.settlementMax, currency: 'INR' },
      assumptions: [
        'Prices from car_parts_expanded.json database',
        'Severity mapped from YOLO confidence scores',
        'No multimodal AI visual verification',
      ],
      limitations: [
        'Limited to parts in pricing database',
        'No inspection of hidden damage',
        'Labor rates are estimates',
      ],
    };
  }

  getPricingData(): ModelPricing[] {
    return this.pricingData;
  }

  findVehiclePricing(manufacturer: string, model: string): ModelPricing | null {
    const normalizedMfg = manufacturer.toLowerCase().trim();
    const normalizedModel = model.toLowerCase().trim();
    return this.pricingData.find(p =>
      p.manufacturer.toLowerCase().includes(normalizedMfg) &&
      p.model.toLowerCase().includes(normalizedModel)
    ) || null;
  }
}

// ─── Hybrid AI Service ───────────────────────────────────────────────────────

export class HybridAIService {
  private localEngine: LocalPricingEngine;
  private provider: AIProvider | null = null;
  private mode: AssessmentMode = 'local';

  constructor() {
    this.localEngine = new LocalPricingEngine();
  }

  setProvider(provider: AIProvider): void {
    this.provider = provider;
  }

  setMode(mode: AssessmentMode): void {
    this.mode = mode;
  }

  getMode(): AssessmentMode {
    return this.mode;
  }

  async assessDamage(input: DamageAssessmentInput): Promise<AssessmentResult> {
    // Always run local assessment first
    const localResult = await this.localEngine.calculateLocalAssessment(input.vehicle, input.detections);

    // If hybrid mode and provider available, enhance with AI
    if (this.mode === 'hybrid' && this.provider) {
      try {
        const aiResult = await this.provider.assessDamage(input);
        return this.mergeAssessments(localResult, aiResult, input);
      } catch (error) {
        console.warn('Hybrid AI assessment failed, falling back to local:', error);
        return this.buildLocalResult(localResult, input);
      }
    }

    return this.buildLocalResult(localResult, input);
  }

  private mergeAssessments(
    local: Awaited<ReturnType<LocalPricingEngine['calculateLocalAssessment']>>,
    ai: AssessmentResult,
    input: DamageAssessmentInput
  ): AssessmentResult {
    // Merge AI observations with local pricing
    // AI provides reasoning, severity, repair vs replace recommendations
    // Local provides grounded pricing from database

    const mergedItems: DamageItem[] = local.items.map(localItem => {
      const aiItem = ai.damageItems.find(d => d.component === localItem.component);
      if (aiItem) {
        return {
          ...localItem,
          severity: aiItem.severity,
          recommendation: aiItem.recommendation,
          reasoning: aiItem.reasoning,
          assumptions: [...localItem.assumptions, ...aiItem.assumptions],
          evidence: [...localItem.evidence, ...aiItem.evidence],
          confidence: aiItem.confidence,
          // Keep local pricing as ground truth
          repairCost: localItem.repairCost,
          replaceCost: localItem.replaceCost,
        };
      }
      return localItem;
    });

    // Add AI-only observations as new items
    ai.damageItems.forEach(aiItem => {
      if (!mergedItems.some(m => m.component === aiItem.component)) {
        mergedItems.push({
          ...aiItem,
          repairCost: aiItem.repairCost,
          replaceCost: aiItem.replaceCost,
        });
      }
    });

    return {
      mode: 'hybrid',
      vehicle: input.vehicle,
      damageItems: mergedItems,
      totalEstimatedRepairCost: ai.totalEstimatedRepairCost,
      recommendedSettlement: ai.recommendedSettlement,
      assumptions: [...local.assumptions, ...ai.assumptions],
      limitations: [...local.limitations, ...ai.limitations],
      report: ai.report,
    };
  }

  private buildLocalResult(
    local: Awaited<ReturnType<LocalPricingEngine['calculateLocalAssessment']>>,
    input: DamageAssessmentInput
  ): AssessmentResult {
    const report = this.buildAdjusterReport(input, local.items, local.assumptions, local.limitations);

    return {
      mode: 'local',
      vehicle: input.vehicle,
      damageItems: local.items,
      totalEstimatedRepairCost: local.totalRepairCost,
      recommendedSettlement: local.settlementRange,
      assumptions: local.assumptions,
      limitations: local.limitations,
      report,
    };
  }

  private buildAdjusterReport(
    input: DamageAssessmentInput,
    items: DamageItem[],
    assumptions: string[],
    limitations: string[]
  ): AdjusterReport {
    const viewsReceived: VehicleView[] = Object.keys(input.photos).filter(k => input.photos[k as VehicleView]) as VehicleView[];
    const allViews: VehicleView[] = ['top', 'bottom', 'left', 'right'];
    const viewsMissing = allViews.filter(v => !viewsReceived.includes(v));

    return {
      claimSummary: {
        vehicle: input.vehicle,
        photosReceived: viewsReceived,
        photosMissing: viewsMissing,
        assessmentDate: new Date().toISOString(),
        assessmentMode: this.mode,
      },
      yoloDetections: input.detections,
      corroboratedDamage: items,
      uncertainDetections: input.detections.filter(d => d.confidence < 0.5),
      aiObservations: [],
      repairRecommendations: items.map(item => ({
        component: item.component,
        view: item.view,
        detectionIds: item.detectionIds,
        recommendation: item.recommendation === 'undetermined' ? 'inspect' : item.recommendation,
        repairCost: item.repairCost,
        replaceCost: item.replaceCost,
        reasoning: item.reasoning,
        assumptions: item.assumptions,
        safetyConsiderations: item.severity === 'severe' ? ['Structural integrity should be verified by physical inspection'] : [],
      })),
      itemizedRepairEstimate: this.buildItemizedEstimate(items, 'repair'),
      itemizedReplaceEstimate: this.buildItemizedEstimate(items, 'replace'),
      grossRepairCost: {
        min: items.reduce((sum, i) => sum + i.repairCost.min, 0),
        max: items.reduce((sum, i) => sum + i.repairCost.max, 0),
        currency: 'INR',
      },
      settlementScenarios: this.buildSettlementScenarios(items),
      assumptions,
      limitations,
      inspectionRecommendations: [
        'Physical inspection recommended for all structural components',
        'Hidden damage not visible in photos may exist',
        'Airbag deployment and safety systems not assessed from photos',
      ],
    };
  }

  private buildItemizedEstimate(items: DamageItem[], mode: 'repair' | 'replace'): ItemizedEstimate {
    const estimateItems: EstimateItem[] = items.map(item => ({
      component: item.component,
      operation: mode,
      cost: mode === 'repair' ? item.repairCost : item.replaceCost,
      notes: `${item.severity} ${item.damageType} - ${item.recommendation}`,
    }));

    const subtotalMin = estimateItems.reduce((sum, i) => sum + i.cost.min, 0);
    const subtotalMax = estimateItems.reduce((sum, i) => sum + i.cost.max, 0);
    const laborMin = Math.round(subtotalMin * 0.35);
    const laborMax = Math.round(subtotalMax * 0.35);
    const paintMin = Math.round(subtotalMin * 0.15);
    const paintMax = Math.round(subtotalMax * 0.15);
    const otherMin = Math.round(subtotalMin * 0.05);
    const otherMax = Math.round(subtotalMax * 0.05);

    return {
      items: estimateItems,
      subtotal: { min: subtotalMin, max: subtotalMax, currency: 'INR' },
      labor: { min: laborMin, max: laborMax, currency: 'INR' },
      paintAndRefinishing: { min: paintMin, max: paintMax, currency: 'INR' },
      other: { min: otherMin, max: otherMax, currency: 'INR' },
      total: {
        min: subtotalMin + laborMin + paintMin + otherMin,
        max: subtotalMax + laborMax + paintMax + otherMax,
        currency: 'INR',
      },
    };
  }

  private buildSettlementScenarios(items: DamageItem[]): SettlementScenario[] {
    const grossMin = items.reduce((sum, i) => sum + i.repairCost.min, 0);
    const grossMax = items.reduce((sum, i) => sum + i.repairCost.max, 0);

    return [
      {
        id: 'low',
        label: 'Conservative Settlement',
        description: 'Lower bound estimate with higher depreciation and deductible',
        grossRepairCost: { min: grossMin, max: grossMax, currency: 'INR' },
        deductible: { min: 5000, max: 10000, currency: 'INR' },
        depreciation: { min: Math.round(grossMin * 0.3), max: Math.round(grossMax * 0.3), currency: 'INR' },
        otherAdjustments: { min: 0, max: 0, currency: 'INR' },
        netSettlement: {
          min: Math.round(grossMin * 0.5),
          max: Math.round(grossMax * 0.6),
          currency: 'INR',
        },
        assumptions: ['High depreciation (30%)', 'Standard deductible applied'],
        recommendedPath: 'repair',
      },
      {
        id: 'recommended',
        label: 'Recommended Settlement',
        description: 'Balanced estimate with standard depreciation',
        grossRepairCost: { min: grossMin, max: grossMax, currency: 'INR' },
        deductible: { min: 2500, max: 5000, currency: 'INR' },
        depreciation: { min: Math.round(grossMin * 0.2), max: Math.round(grossMax * 0.2), currency: 'INR' },
        otherAdjustments: { min: 0, max: 0, currency: 'INR' },
        netSettlement: {
          min: Math.round(grossMin * 0.65),
          max: Math.round(grossMax * 0.75),
          currency: 'INR',
        },
        assumptions: ['Standard depreciation (20%)', 'Typical deductible'],
        recommendedPath: 'mixed',
      },
      {
        id: 'high',
        label: 'Optimistic Settlement',
        description: 'Upper bound with minimal depreciation',
        grossRepairCost: { min: grossMin, max: grossMax, currency: 'INR' },
        deductible: { min: 0, max: 2500, currency: 'INR' },
        depreciation: { min: Math.round(grossMin * 0.1), max: Math.round(grossMax * 0.1), currency: 'INR' },
        otherAdjustments: { min: 0, max: 0, currency: 'INR' },
        netSettlement: {
          min: Math.round(grossMin * 0.8),
          max: Math.round(grossMax * 0.9),
          currency: 'INR',
        },
        assumptions: ['Low depreciation (10%)', 'Minimal or waived deductible'],
        recommendedPath: 'replace',
      },
    ];
  }
}

// ─── Provider Adapter ────────────────────────────────────────────────────────

import { MultimodalProviderAdapter } from './providers/providerAdapter';
import { createProvider, ProviderFactoryConfig } from './providers';

export function createHybridProvider(config: ProviderFactoryConfig): AIProvider {
  const multimodalProvider = createProvider(config);
  return new MultimodalProviderAdapter(multimodalProvider);
}

// Export singleton instance
export const hybridAIService = new HybridAIService();