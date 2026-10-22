/**
 * Car Parts Pricing Database
 * Extracted from car_parts_expanded.csv
 * Contains repair/replace costs for each part per manufacturer/model
 */

export interface PartPricing {
  repairMin: number;
  repairMax: number;
  replaceMin: number;
  replaceMax: number;
}

export interface ModelPricing {
  manufacturer: string;
  model: string;
  indicativePrice: number;
  parts: Record<string, PartPricing>;
}

export interface VehicleSelection {
  manufacturer: string;
  model: string;
  causeOfDamage: string;
}

export interface DamageDetection {
  part: string;
  severity: 'minor' | 'moderate' | 'severe' | 'uncertain';
  confidence: number;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export interface SettlementCalculation {
  totalRepairMin: number;
  totalRepairMax: number;
  totalReplaceMin: number;
  totalReplaceMax: number;
  recommendedApproach: 'repair' | 'replace' | 'mixed';
  settlementOffer: number;
  settlementMin: number;
  settlementMax: number;
  breakdown: PartBreakdown[];
}

export interface PartBreakdown {
  part: string;
  severity: 'minor' | 'moderate' | 'severe' | 'uncertain';
  approach: 'repair' | 'replace';
  costMin: number;
  costMax: number;
  reasoning: string;
}

/**
 * CSV Column mapping to part keys
 */
const CSV_PART_MAPPING: Record<string, string> = {
  'Front Bumper_Repair_Min_INR': 'front_bumper_repair_min',
  'Front Bumper_Repair_Max_INR': 'front_bumper_repair_max',
  'Front Bumper_Replace_Min_INR': 'front_bumper_replace_min',
  'Front Bumper_Replace_Max_INR': 'front_bumper_replace_max',
  'Rear Bumper_Repair_Min_INR': 'rear_bumper_repair_min',
  'Rear Bumper_Repair_Max_INR': 'rear_bumper_repair_max',
  'Rear Bumper_Replace_Min_INR': 'rear_bumper_replace_min',
  'Rear Bumper_Replace_Max_INR': 'rear_bumper_replace_max',
  'Headlight Assembly_Repair_Min_INR': 'headlight_repair_min',
  'Headlight Assembly_Repair_Max_INR': 'headlight_repair_max',
  'Headlight Assembly_Replace_Min_INR': 'headlight_replace_min',
  'Headlight Assembly_Replace_Max_INR': 'headlight_replace_max',
  'Tail Light Assembly_Repair_Min_INR': 'tail_light_repair_min',
  'Tail Light Assembly_Repair_Max_INR': 'tail_light_repair_max',
  'Tail Light Assembly_Replace_Min_INR': 'tail_light_replace_min',
  'Tail Light Assembly_Replace_Max_INR': 'tail_light_replace_max',
  'Bonnet Hood_Repair_Min_INR': 'bonnet_hood_repair_min',
  'Bonnet Hood_Repair_Max_INR': 'bonnet_hood_repair_max',
  'Bonnet Hood_Replace_Min_INR': 'bonnet_hood_replace_min',
  'Bonnet Hood_Replace_Max_INR': 'bonnet_hood_replace_max',
  'Fender_Repair_Min_INR': 'fender_repair_min',
  'Fender_Repair_Max_INR': 'fender_repair_max',
  'Fender_Replace_Min_INR': 'fender_replace_min',
  'Fender_Replace_Max_INR': 'fender_replace_max',
  'Front Grille_Repair_Min_INR': 'front_grille_repair_min',
  'Front Grille_Repair_Max_INR': 'front_grille_repair_max',
  'Front Grille_Replace_Min_INR': 'front_grille_replace_min',
  'Front Grille_Replace_Max_INR': 'front_grille_replace_max',
  'Door Panel_Repair_Min_INR': 'door_panel_repair_min',
  'Door Panel_Repair_Max_INR': 'door_panel_repair_max',
  'Door Panel_Replace_Min_INR': 'door_panel_replace_min',
  'Door Panel_Replace_Max_INR': 'door_panel_replace_max',
  'ORVM Side Mirror_Repair_Min_INR': 'orvm_side_mirror_repair_min',
  'ORVM Side Mirror_Repair_Max_INR': 'orvm_side_mirror_repair_max',
  'ORVM Side Mirror_Replace_Min_INR': 'orvm_side_mirror_replace_min',
  'ORVM Side Mirror_Replace_Max_INR': 'orvm_side_mirror_replace_max',
  'Windscreen_Repair_Min_INR': 'windscreen_repair_min',
  'Windscreen_Repair_Max_INR': 'windscreen_repair_max',
  'Windscreen_Replace_Min_INR': 'windscreen_replace_min',
  'Windscreen_Replace_Max_INR': 'windscreen_replace_max',
};

/**
 * AI part name to database part key mapping
 */
const AI_PART_TO_DB_KEY: Record<string, string> = {
  'front bumper': 'front_bumper',
  'rear bumper': 'rear_bumper',
  'front bumper & fender': 'front_bumper',
  'fender': 'fender',
  'headlight': 'headlight',
  'headlight assembly': 'headlight',
  'tail light': 'tail_light',
  'tail light assembly': 'tail_light',
  'bonnet': 'bonnet_hood',
  'bonnet hood': 'bonnet_hood',
  'hood': 'bonnet_hood',
  'front grille': 'front_grille',
  'grille': 'front_grille',
  'door panel': 'door_panel',
  'door': 'door_panel',
  'side mirror': 'orvm_side_mirror',
  'orvm': 'orvm_side_mirror',
  'orvm side mirror': 'orvm_side_mirror',
  'mirror': 'orvm_side_mirror',
  'windscreen': 'windscreen',
  'windshield': 'windscreen',
};

/**
 * Load car pricing data from CSV JSON
 */
export async function loadCarPricingData(): Promise<ModelPricing[]> {
  try {
    const response = await fetch('/car_parts_expanded.json');
    if (!response.ok) throw new Error('Failed to load pricing data');
    const csvData = await response.json();
    return parseCarPricingData(csvData);
  } catch (error) {
    console.error('Failed to load car pricing data:', error);
    return [];
  }
}

/**
 * Parse CSV data into structured pricing objects
 */
function parseCarPricingData(csvData: any[]): ModelPricing[] {
  return csvData.map(row => {
    const parts: Record<string, PartPricing> = {};
    
    Object.entries(CSV_PART_MAPPING).forEach(([csvKey, dbKey]) => {
      const baseKey = dbKey.replace(/_min$|_max$/, '');
      const isRepair = dbKey.includes('repair');
      const isMin = dbKey.endsWith('_min');
      
      if (!parts[baseKey]) {
        parts[baseKey] = { repairMin: 0, repairMax: 0, replaceMin: 0, replaceMax: 0 };
      }
      
      const value = parseInt(row[csvKey] || '0', 10);
      if (isRepair) {
        if (isMin) parts[baseKey].repairMin = value;
        else parts[baseKey].repairMax = value;
      } else {
        if (isMin) parts[baseKey].replaceMin = value;
        else parts[baseKey].replaceMax = value;
      }
    });
    
    return {
      manufacturer: row.Manufacturer,
      model: row.Model,
      indicativePrice: parseInt(row.Indicative_Ex_Showroom_Price_INR || '0', 10),
      parts,
    };
  });
}

/**
 * Find pricing for a specific vehicle
 */
export function findVehiclePricing(
  pricingData: ModelPricing[],
  manufacturer: string,
  model: string
): ModelPricing | null {
  const normalizedMfg = manufacturer.toLowerCase().trim();
  const normalizedModel = model.toLowerCase().trim();
  
  return pricingData.find(p => 
    p.manufacturer.toLowerCase().includes(normalizedMfg) ||
    normalizedMfg.includes(p.manufacturer.toLowerCase())
  )?.parts ? 
    pricingData.find(p => 
      p.manufacturer.toLowerCase().includes(normalizedMfg) &&
      p.model.toLowerCase().includes(normalizedModel)
    ) || null : null;
}

/**
 * Map AI detected part to database part key
 */
function mapAIPartToDBPart(aiPart: string): string | null {
  const normalized = aiPart.toLowerCase().trim();
  
  // Direct match
  if (AI_PART_TO_DB_KEY[normalized]) {
    return AI_PART_TO_DB_KEY[normalized];
  }
  
  // Partial match
  for (const [key, value] of Object.entries(AI_PART_TO_DB_KEY)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value;
    }
  }
  
  return null;
}

/**
 * Determine repair vs replace based on severity
 */
function determineApproach(severity: 'minor' | 'moderate' | 'severe' | 'uncertain'): 'repair' | 'replace' {
  switch (severity) {
    case 'minor': return 'repair';
    case 'moderate': return Math.random() > 0.5 ? 'repair' : 'replace';
    case 'severe': return 'replace';
    case 'uncertain': return 'repair'; // Default to repair for uncertain
    default: return 'repair';
  }
}

/**
 * Calculate settlement based on AI detections and vehicle pricing
 */
export function calculateSettlement(
  pricingData: ModelPricing[],
  vehicle: VehicleSelection,
  detections: DamageDetection[]
): SettlementCalculation {
  const vehiclePricing = findVehiclePricing(pricingData, vehicle.manufacturer, vehicle.model);
  
  if (!vehiclePricing) {
    // Fallback to generic calculation
    return calculateFallbackSettlement(detections);
  }
  
  let totalRepairMin = 0;
  let totalRepairMax = 0;
  let totalReplaceMin = 0;
  let totalReplaceMax = 0;
  const breakdown: PartBreakdown[] = [];
  
  detections.forEach(detection => {
    const dbPartKey = mapAIPartToDBPart(detection.part);
    const approach = determineApproach(detection.severity);
    
    if (dbPartKey && vehiclePricing.parts[dbPartKey]) {
      const pricing = vehiclePricing.parts[dbPartKey];
      let costMin = 0;
      let costMax = 0;
      
      if (approach === 'repair') {
        costMin = pricing.repairMin;
        costMax = pricing.repairMax;
      } else {
        costMin = pricing.replaceMin;
        costMax = pricing.replaceMax;
      }
      
      // Apply severity multiplier
      const severityMultiplier = {
        minor: 0.6,
        moderate: 1.0,
        severe: 1.4,
        uncertain: 0.3,
      }[detection.severity] || 1.0;
      
      costMin = Math.round(costMin * severityMultiplier);
      costMax = Math.round(costMax * severityMultiplier);
      
      if (approach === 'repair') {
        totalRepairMin += costMin;
        totalRepairMax += costMax;
      } else {
        totalReplaceMin += costMin;
        totalReplaceMax += costMax;
      }
      
      breakdown.push({
        part: detection.part,
        severity: detection.severity,
        approach,
        costMin,
        costMax,
        reasoning: `${detection.severity} damage to ${detection.part} - ${approach} recommended based on severity`,
      });
    } else {
      // Fallback for unknown parts
      const fallback = calculateFallbackPartCost(detection.part, detection.severity);
      breakdown.push({
        part: detection.part,
        severity: detection.severity,
        approach: determineApproach(detection.severity),
        costMin: fallback.min,
        costMax: fallback.max,
        reasoning: `${detection.severity} damage to ${detection.part} - estimated cost (part not in database)`,
      });
      
      if (determineApproach(detection.severity) === 'repair') {
        totalRepairMin += fallback.min;
        totalRepairMax += fallback.max;
      } else {
        totalReplaceMin += fallback.min;
        totalReplaceMax += fallback.max;
      }
    }
  });
  
  const totalMin = totalRepairMin + totalReplaceMin;
  const totalMax = totalRepairMax + totalReplaceMax;
  
  // Settlement offer: typically 70-85% of repair cost, adjusted for depreciation
  const depreciationFactor = 0.75; // 25% depreciation for cash settlement
  const settlementOffer = Math.round((totalMin + totalMax) / 2 * depreciationFactor);
  const settlementMin = Math.round(settlementOffer * 0.85);
  const settlementMax = Math.round(settlementOffer * 1.15);
  
  // Determine overall approach
  const recommendedApproach = totalReplaceMin > totalRepairMin ? 'replace' : 
                              totalRepairMin > 0 ? 'repair' : 'mixed';
  
  return {
    totalRepairMin,
    totalRepairMax,
    totalReplaceMin,
    totalReplaceMax,
    recommendedApproach,
    settlementOffer,
    settlementMin,
    settlementMax,
    breakdown,
  };
}

/**
 * Fallback calculation when vehicle not in database
 */
function calculateFallbackSettlement(detections: DamageDetection[]): SettlementCalculation {
  let totalMin = 0;
  let totalMax = 0;
  const breakdown: PartBreakdown[] = [];
  
  detections.forEach(detection => {
    const fallback = calculateFallbackPartCost(detection.part, detection.severity);
    const approach = determineApproach(detection.severity);
    
    breakdown.push({
      part: detection.part,
      severity: detection.severity,
      approach,
      costMin: fallback.min,
      costMax: fallback.max,
      reasoning: `${detection.severity} damage to ${detection.part} - estimated (not in database)`,
    });
    
    totalMin += fallback.min;
    totalMax += fallback.max;
  });
  
  const depreciationFactor = 0.75;
  const settlementOffer = Math.round((totalMin + totalMax) / 2 * depreciationFactor);
  
  return {
    totalRepairMin: totalMin,
    totalRepairMax: totalMax,
    totalReplaceMin: 0,
    totalReplaceMax: 0,
    recommendedApproach: 'mixed',
    settlementOffer,
    settlementMin: Math.round(settlementOffer * 0.85),
    settlementMax: Math.round(settlementOffer * 1.15),
    breakdown,
  };
}

/**
 * Fallback part costs based on part type and severity
 */
function calculateFallbackPartCost(part: string, severity: 'minor' | 'moderate' | 'severe' | 'uncertain'): { min: number; max: number } {
  const baseCosts: Record<string, { min: number; max: number }> = {
    'front bumper': { min: 8000, max: 25000 },
    'rear bumper': { min: 6000, max: 20000 },
    'fender': { min: 10000, max: 35000 },
    'headlight': { min: 5000, max: 40000 },
    'tail light': { min: 3000, max: 15000 },
    'bonnet hood': { min: 12000, max: 45000 },
    'front grille': { min: 3000, max: 12000 },
    'door panel': { min: 15000, max: 50000 },
    'side mirror': { min: 4000, max: 15000 },
    'windscreen': { min: 8000, max: 30000 },
  };
  
  const normalized = part.toLowerCase().trim();
  let base = baseCosts[normalized] || { min: 5000, max: 20000 };
  
  const severityMultiplier = {
    minor: 0.4,
    moderate: 0.7,
    severe: 1.2,
    uncertain: 0.2,
  }[severity] || 1.0;
  
  return {
    min: Math.round(base.min * severityMultiplier),
    max: Math.round(base.max * severityMultiplier),
  };
}

/**
 * Format number with Indian numbering system
 */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Get all manufacturers from pricing data
 */
export function getManufacturers(pricingData: ModelPricing[]): string[] {
  return [...new Set(pricingData.map(p => p.manufacturer))].sort();
}

/**
 * Get models for a manufacturer
 */
export function getModelsForManufacturer(pricingData: ModelPricing[], manufacturer: string): string[] {
  return pricingData
    .filter(p => p.manufacturer === manufacturer)
    .map(p => p.model)
    .sort();
}