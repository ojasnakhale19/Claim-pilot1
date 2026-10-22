/**
 * Provider Adapter - bridges the MultimodalProvider interface to the AIProvider interface
 */

import { AIProvider, DamageAssessmentInput, AssessmentResult, VehicleView, DamageDetection } from '../aiService';
import { MultimodalProvider, MultimodalAnalysisInput, MultimodalAnalysisOutput, MultimodalDamageItem, AIDamageObservation } from './types';

export class MultimodalProviderAdapter implements AIProvider {
  name: string;
  modelId: string;
  private provider: MultimodalProvider;

  constructor(provider: MultimodalProvider) {
    this.provider = provider;
    this.name = provider.name;
    this.modelId = provider.modelId;
  }

  async testConnection(): Promise<boolean> {
    return this.provider.testConnection();
  }

  async assessDamage(input: DamageAssessmentInput): Promise<AssessmentResult> {
    // Convert input to multimodal format
    const multimodalInput = await this.convertToMultimodalInput(input);
    
    // Call the multimodal provider
    const multimodalOutput = await this.provider.analyzeImages(multimodalInput);
    
    // Convert output to assessment result
    return this.convertToAssessmentResult(input, multimodalOutput);
  }

  private async convertToMultimodalInput(input: DamageAssessmentInput): Promise<MultimodalAnalysisInput> {
    // Group detections by view
    const detectionsByView = new Map<VehicleView, DamageDetection[]>();
    input.detections.forEach(d => {
      const existing = detectionsByView.get(d.view) || [];
      existing.push(d);
      detectionsByView.set(d.view, existing);
    });

    // Build views array with images and detections
    const viewKeys = Array.from({ length: 4 }, (_, i) => ['top', 'bottom', 'left', 'right'][i] as VehicleView)
      .filter(view => input.photos[view]);

    const views = await Promise.all(viewKeys.map(async (view) => {
      const photo = input.photos[view]!;
      const base64 = typeof photo === 'string' ? photo : await this.fileToBase64(photo);
      const mimeType = typeof photo === 'string' ? 'image/jpeg' : photo.type || 'image/jpeg';
      
      return {
        view,
        imageBase64: base64,
        mimeType,
        detections: detectionsByView.get(view) || [],
      };
    }));

    return {
      vehicle: input.vehicle,
      views,
      locale: input.locale || 'en-IN',
      currency: input.currency || 'INR',
    };
  }

  private async fileToBase64(file: Blob | File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  private convertToAssessmentResult(
    input: DamageAssessmentInput,
    output: MultimodalAnalysisOutput
  ): AssessmentResult {
    const damageItems = this.convertDamageItems(output);
    const aiObservations = this.convertObservations(output);
    const repairRecommendations = this.convertRecommendations(damageItems);
    const itemizedRepair = this.buildItemizedEstimate(damageItems, 'repair');
    const itemizedReplace = this.buildItemizedEstimate(damageItems, 'replace');
    const grossCost = this.calculateGrossCost(damageItems);
    const settlementScenarios = this.buildSettlementScenarios(grossCost);

    const viewsReceived = Object.keys(input.photos).filter(k => input.photos[k as VehicleView]) as VehicleView[];
    const allViews: VehicleView[] = ['top', 'bottom', 'left', 'right'];
    const viewsMissing = allViews.filter(v => !viewsReceived.includes(v));

    return {
      mode: 'hybrid',
      vehicle: input.vehicle,
      damageItems,
      totalEstimatedRepairCost: grossCost,
      recommendedSettlement: settlementScenarios[1].netSettlement, // recommended
      assumptions: [
        'AI visual analysis supplemented with local pricing database',
        'Damage severity assessed from 2D images only',
        'Hidden damage not visible in photos may exist',
      ],
      limitations: [
        ...output.limitations,
        'Cannot verify hidden structural damage',
        'Cannot assess internal mechanical damage',
        'Airbag deployment status unknown',
        'Final costs require physical inspection',
      ],
      report: {
        claimSummary: {
          vehicle: input.vehicle,
          photosReceived: viewsReceived,
          photosMissing: viewsMissing,
          assessmentDate: new Date().toISOString(),
          assessmentMode: 'hybrid',
        },
        yoloDetections: input.detections,
        corroboratedDamage: damageItems,
        uncertainDetections: input.detections.filter(d => d.confidence < 0.5),
        aiObservations,
        repairRecommendations,
        itemizedRepairEstimate: itemizedRepair,
        itemizedReplaceEstimate: itemizedReplace,
        grossRepairCost: grossCost,
        settlementScenarios,
        assumptions: [
          'AI visual analysis supplemented with local pricing database',
          'Damage severity assessed from 2D images only',
          'Hidden damage not visible in photos may exist',
        ],
        limitations: [
          ...output.limitations,
          'Cannot verify hidden structural damage',
          'Cannot assess internal mechanical damage',
          'Airbag deployment status unknown',
          'Final costs require physical inspection',
        ],
        inspectionRecommendations: [
          'Physical inspection recommended for all structural components',
          'Hidden damage not visible in photos may exist',
          'Airbag deployment and safety systems not assessed from photos',
        ],
      },
    };
  }

  private convertDamageItems(output: MultimodalAnalysisOutput) {
    return output.damageItems.map((item: MultimodalDamageItem, index: number) => ({
      id: `hybrid-${index}`,
      component: item.component,
      view: item.view,
      detectionIds: item.detectionIds,
      damageType: item.damageType,
      severity: item.severity,
      evidence: item.evidence,
      confidence: item.confidence,
      recommendation: item.recommendation,
      // These will be populated from local pricing database
      repairCost: { min: 0, max: 0, currency: 'INR' },
      replaceCost: { min: 0, max: 0, currency: 'INR' },
      reasoning: item.reasoning,
      assumptions: item.assumptions,
    }));
  }

  private convertObservations(output: MultimodalAnalysisOutput) {
    return output.aiObservations.map((obs: AIDamageObservation, index: number) => ({
      id: `ai-obs-${index}`,
      component: obs.component,
      view: obs.view,
      description: obs.description,
      severity: obs.severity,
      confidence: obs.confidence,
      reasoning: obs.reasoning,
      boundingBoxHint: obs.boundingBoxHint,
    }));
  }

  private convertRecommendations(damageItems: ReturnType<typeof this.convertDamageItems>) {
    return damageItems.map(item => ({
      component: item.component,
      view: item.view,
      detectionIds: item.detectionIds,
      recommendation: item.recommendation === 'undetermined' ? 'inspect' : item.recommendation,
      repairCost: item.repairCost,
      replaceCost: item.replaceCost,
      reasoning: item.reasoning,
      assumptions: item.assumptions,
      safetyConsiderations: item.severity === 'severe' ? ['Structural integrity should be verified by physical inspection'] : [],
    }));
  }

  private buildItemizedEstimate(items: ReturnType<typeof this.convertDamageItems>, mode: 'repair' | 'replace') {
    const estimateItems = items.map((item: { component: string; severity: string; damageType: string; recommendation: string; repairCost: { min: number; max: number; currency: string }; replaceCost: { min: number; max: number; currency: string } }) => ({
      component: item.component,
      operation: mode as 'repair' | 'replace' | 'paint' | 'labor' | 'other',
      cost: mode === 'repair' ? item.repairCost : item.replaceCost,
      notes: `${item.severity} ${item.damageType} - ${item.recommendation}`,
    }));

    const subtotalMin = estimateItems.reduce((sum: number, i: { cost: { min: number } }) => sum + i.cost.min, 0);
    const subtotalMax = estimateItems.reduce((sum: number, i: { cost: { max: number } }) => sum + i.cost.max, 0);
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

  private calculateGrossCost(items: ReturnType<typeof this.convertDamageItems>) {
    return {
      min: items.reduce((sum: number, i: { repairCost: { min: number } }) => sum + i.repairCost.min, 0),
      max: items.reduce((sum: number, i: { repairCost: { max: number } }) => sum + i.repairCost.max, 0),
      currency: 'INR',
    };
  }

  private buildSettlementScenarios(grossCost: { min: number; max: number; currency: string }) {
    return [
      {
        id: 'low',
        label: 'Conservative Settlement',
        description: 'Lower bound estimate with higher depreciation and deductible',
        grossRepairCost: grossCost,
        deductible: { min: 5000, max: 10000, currency: 'INR' },
        depreciation: { min: Math.round(grossCost.min * 0.3), max: Math.round(grossCost.max * 0.3), currency: 'INR' },
        otherAdjustments: { min: 0, max: 0, currency: 'INR' },
        netSettlement: {
          min: Math.round(grossCost.min * 0.5),
          max: Math.round(grossCost.max * 0.6),
          currency: 'INR',
        },
        assumptions: ['High depreciation (30%)', 'Standard deductible applied'],
        recommendedPath: 'repair' as const,
      },
      {
        id: 'recommended',
        label: 'Recommended Settlement',
        description: 'Balanced estimate with standard depreciation',
        grossRepairCost: grossCost,
        deductible: { min: 2500, max: 5000, currency: 'INR' },
        depreciation: { min: Math.round(grossCost.min * 0.2), max: Math.round(grossCost.max * 0.2), currency: 'INR' },
        otherAdjustments: { min: 0, max: 0, currency: 'INR' },
        netSettlement: {
          min: Math.round(grossCost.min * 0.65),
          max: Math.round(grossCost.max * 0.75),
          currency: 'INR',
        },
        assumptions: ['Standard depreciation (20%)', 'Typical deductible'],
        recommendedPath: 'mixed' as const,
      },
      {
        id: 'high',
        label: 'Optimistic Settlement',
        description: 'Upper bound with minimal depreciation',
        grossRepairCost: grossCost,
        deductible: { min: 0, max: 2500, currency: 'INR' },
        depreciation: { min: Math.round(grossCost.min * 0.1), max: Math.round(grossCost.max * 0.1), currency: 'INR' },
        otherAdjustments: { min: 0, max: 0, currency: 'INR' },
        netSettlement: {
          min: Math.round(grossCost.min * 0.8),
          max: Math.round(grossCost.max * 0.9),
          currency: 'INR',
        },
        assumptions: ['Low depreciation (10%)', 'Minimal or waived deductible'],
        recommendedPath: 'replace' as const,
      },
    ];
  }
}