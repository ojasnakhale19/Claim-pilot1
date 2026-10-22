import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-IN').format(num);
}

export function formatCompactNumber(num: number): string {
  if (num >= 10000000) {
    return (num / 10000000).toFixed(1) + ' Cr';
  }
  if (num >= 100000) {
    return (num / 100000).toFixed(1) + ' L';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + ' K';
  }
  return num.toString();
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

export function generateId(prefix = 'id'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function getFileSizeString(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/');
}

export function isValidImageFile(file: File): boolean {
  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  return validTypes.includes(file.type) && file.size <= 10 * 1024 * 1024;
}

export function isValidVideoFile(file: File): boolean {
  const validTypes = ['video/mp4', 'video/quicktime'];
  return validTypes.includes(file.type) && file.size <= 50 * 1024 * 1024;
}

export function formatDamageType(className: string): string {
  const labels: Record<string, string> = {
    dent: 'Dent',
    scratch: 'Scratch',
    crack: 'Crack',
    'glass shatter': 'Glass Shatter',
    glass_shatter: 'Glass Shatter',
    'lamp broken': 'Lamp Broken',
    lamp_broken: 'Lamp Broken',
    'tire flat': 'Tire Flat',
    tire_flat: 'Tire Flat',
  };
  return labels[className.toLowerCase()] || className.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function createObjectURL(file: File): string {
  return URL.createObjectURL(file);
}

export function revokeObjectURL(url: string): void {
  URL.revokeObjectURL(url);
}

export function downloadAsFile(content: string, filename: string, type = 'text/plain'): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function parseJSONSafely<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((acc, item) => {
    const groupKey = String(item[key]);
    if (!acc[groupKey]) {
      acc[groupKey] = [];
    }
    acc[groupKey].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

export function sortBy<T>(array: T[], key: keyof T, direction: 'asc' | 'desc' = 'asc'): T[] {
  return [...array].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];
    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

export function filterBy<T>(array: T[], predicates: Partial<Record<keyof T, unknown>>): T[] {
  return array.filter(item =>
    Object.entries(predicates).every(([key, value]) => {
      if (value === undefined || value === '') return true;
      const itemValue = item[key as keyof T];
      if (Array.isArray(value)) {
        return value.includes(itemValue);
      }
      return itemValue === value;
    })
  );
}

// ─── API Client ─────────────────────────────────────────────────────────────
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface DamageDetection {
  damage_type: string;
  confidence: number;
  bounding_box_xyxy: number[];
}

export interface ViewResult {
  detection_count: number;
  detections: DamageDetection[];
  annotated_image_base64?: string;
}

export interface AssessmentResponse {
  assessment_id: string;
  created_at: string;
  workflow: string;
  model_name: string;
  confidence_threshold: number;
  image_size: number;
  views: Record<string, ViewResult>;
  detection_counts_by_class: Record<string, number>;
  total_detections: number;
  review_required: boolean;
  review_flags: Array<{ code: string; view: string; message: string }>;
  validation: Record<string, any>;
  limitations: string[];
  estimated_repair_cost_min: number;
  estimated_repair_cost_max: number;
  settlement_offer: number;
  settlement_min: number;
  settlement_max: number;
  severity: 'minor' | 'moderate' | 'severe' | 'uncertain';
  primary_component: string;
  damage_summary: string;
}

export interface GeneralAssessmentResponse {
  assessment_id: string;
  created_at: string;
  model_name: string;
  confidence_threshold: number;
  image_size: number;
  images_analyzed: number;
  results: Array<{
    file_index: number;
    filename: string;
    detection_count: number;
    detections: DamageDetection[];
    annotated_image_base64?: string;
    error?: string;
  }>;
  total_detections: number;
  estimated_repair_cost_min: number;
  estimated_repair_cost_max: number;
  settlement_offer: number;
  settlement_min: number;
  settlement_max: number;
  severity: 'minor' | 'moderate' | 'severe' | 'uncertain';
  primary_component: string;
  damage_summary: string;
  review_required: boolean;
}

export interface ModelInfo {
  model_name: string;
  model_type: string;
  task: string;
  classes: string[];
}

export interface HealthCheck {
  status: string;
  service: string;
}

// ─── Policy-Driven Assessment (New /assess/ endpoint) ─────────────────────────
export interface PolicyDamageDetection {
  damage_type: string;
  confidence: number;
  severity: 'minor' | 'moderate' | 'severe';
  location: string;
  bbox: number[];
  area_percentage: number;
  estimated_cost: number;
}

export interface PolicyDecisionTrace {
  rule_applied: string;
  threshold: string;
  evidence: string;
}

export interface PolicyAssessmentResult {
  assessment_id: string;
  timestamp: string;
  processing_time_ms: number;
  damages_detected: PolicyDamageDetection[];
  total_damages: number;
  decision: 'AUTO_APPROVE' | 'HUMAN_REVIEW' | 'ESCALATE';
  decision_confidence: number;
  decision_trace: PolicyDecisionTrace[];
  model_version: string;
  policy_version: string;
  cv_backend: string;
  human_review_required: boolean;
}

export interface PolicyHealthResponse {
  status: string;
  version: string;
  model_loaded: boolean;
  agent_loaded: boolean;
  model_path: string;
  policies_dir: string;
  uptime_seconds: number;
}

export interface PolicyConfigResponse {
  policy_version: string;
  policy_files: Record<string, string>;
  decision_types: string[];
  severity_levels: string[];
  rules_summary: Record<string, string>;
}

// ─── Transform Functions ──────────────────────────────────────────────────────
/**
 * Convert backend PolicyDamageDetection to frontend DamageDetection
 */
export function transformPolicyDetection(det: PolicyDamageDetection): DamageDetection {
  return {
    damage_type: det.damage_type,
    confidence: det.confidence,
    bounding_box_xyxy: det.bbox,
  };
}

/**
 * Convert backend PolicyAssessmentResult to frontend AssessmentResponse format
 */
export function transformPolicyAssessment(result: PolicyAssessmentResult): AssessmentResponse {
  const views: Record<string, ViewResult> = {};
  
  // Group detections by location/view (approximate since single image)
  const byLocation = result.damages_detected.reduce((acc, det) => {
    const loc = det.location || 'unknown';
    if (!acc[loc]) acc[loc] = [];
    acc[loc].push(transformPolicyDetection(det));
    return acc;
  }, {} as Record<string, DamageDetection[]>);
  
  // Create view results
  Object.entries(byLocation).forEach(([location, detections]) => {
    views[location] = {
      detection_count: detections.length,
      detections,
    };
  });
  
  // If no location info, put all in 'main' view
  if (Object.keys(views).length === 0 && result.damages_detected.length > 0) {
    views['main'] = {
      detection_count: result.damages_detected.length,
      detections: result.damages_detected.map(transformPolicyDetection),
    };
  }
  
  // Count by class
  const detection_counts_by_class = result.damages_detected.reduce((acc, det) => {
    acc[det.damage_type] = (acc[det.damage_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Review flags from decision trace
  const review_flags = result.decision_trace.map(t => ({
    code: t.rule_applied,
    view: 'all',
    message: t.evidence,
  }));
  
  return {
    assessment_id: result.assessment_id,
    created_at: result.timestamp,
    workflow: 'policy_driven_assessment',
    model_name: result.model_version,
    confidence_threshold: 0.25, // Not in response, using default
    image_size: 640, // Not in response, using default
    views,
    detection_counts_by_class,
    total_detections: result.total_damages,
    review_required: result.human_review_required,
    review_flags,
    validation: {},
    limitations: [
      'Single image assessment - may not capture all damage angles',
      'Policy-driven decision - no LLM involved in core decision',
      'Cost estimates are approximate based on damage type/severity',
    ],
    estimated_repair_cost_min: result.damages_detected.reduce((sum, d) => sum + d.estimated_cost, 0),
    estimated_repair_cost_max: result.damages_detected.reduce((sum, d) => sum + Math.round(d.estimated_cost * 1.5), 0),
    settlement_offer: result.damages_detected.reduce((sum, d) => sum + Math.round(d.estimated_cost * 0.7), 0),
    settlement_min: 0,
    settlement_max: 0,
    severity: result.damages_detected.length > 0 
      ? result.damages_detected.reduce((max, d) => {
          const sevRank = { minor: 1, moderate: 2, severe: 3 };
          return sevRank[d.severity] > sevRank[max] ? d.severity : max;
        }, 'minor' as 'minor' | 'moderate' | 'severe')
      : 'uncertain',
    primary_component: result.damages_detected[0]?.location || 'Unknown',
    damage_summary: `${result.total_damages} damage(s) detected. Decision: ${result.decision}. ${result.decision_trace[0]?.evidence || ''}`,
  };
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

export async function checkHealth(): Promise<HealthCheck> {
  const response = await fetch(`${API_BASE_URL}/health`);
  return handleResponse(response);
}

export async function getModelInfo(): Promise<ModelInfo> {
  const response = await fetch(`${API_BASE_URL}/model/info`);
  return handleResponse(response);
}

// ─── Policy-Driven Assessment (New /assess/ endpoint) ─────────────────────────
export interface PolicyAssessmentRequest {
  image: File;
  confidence_threshold?: number;
}

export async function assessPolicy(request: PolicyAssessmentRequest): Promise<AssessmentResponse> {
  const formData = new FormData();
  formData.append('image', request.image);
  formData.append('confidence_threshold', String(request.confidence_threshold ?? 0.25));

  const response = await fetch(`${API_BASE_URL}/assess/`, {
    method: 'POST',
    body: formData,
  });
  
  const result = await handleResponse<PolicyAssessmentResult>(response);
  return transformPolicyAssessment(result);
}

export async function checkPolicyHealth(): Promise<PolicyHealthResponse> {
  const response = await fetch(`${API_BASE_URL}/assess/health`);
  return handleResponse(response);
}

export async function getPolicyConfig(): Promise<PolicyConfigResponse> {
  const response = await fetch(`${API_BASE_URL}/assess/policy`);
  return handleResponse(response);
}

export interface FourViewAssessmentRequest {
  top: File;
  bottom: File;
  left: File;
  right: File;
  confidence_threshold?: number;
  image_size?: number;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_year?: string;
  cause_of_damage?: string;
}

export async function assessFourView(request: FourViewAssessmentRequest): Promise<AssessmentResponse> {
  const formData = new FormData();
  formData.append('top', request.top);
  formData.append('bottom', request.bottom);
  formData.append('left', request.left);
  formData.append('right', request.right);
  formData.append('confidence_threshold', String(request.confidence_threshold ?? 0.25));
  formData.append('image_size', String(request.image_size ?? 640));
  if (request.vehicle_make) formData.append('vehicle_make', request.vehicle_make);
  if (request.vehicle_model) formData.append('vehicle_model', request.vehicle_model);
  if (request.vehicle_year) formData.append('vehicle_year', request.vehicle_year);
  if (request.cause_of_damage) formData.append('cause_of_damage', request.cause_of_damage);

  const response = await fetch(`${API_BASE_URL}/assess/four-view`, {
    method: 'POST',
    body: formData,
  });
  return handleResponse(response);
}

export interface GeneralAssessmentRequest {
  files: File[];
  confidence_threshold?: number;
  image_size?: number;
}

export async function assessGeneral(request: GeneralAssessmentRequest): Promise<GeneralAssessmentResponse> {
  const formData = new FormData();
  request.files.forEach(file => formData.append('files', file));
  formData.append('confidence_threshold', String(request.confidence_threshold ?? 0.25));
  formData.append('image_size', String(request.image_size ?? 640));

  const response = await fetch(`${API_BASE_URL}/assess/general`, {
    method: 'POST',
    body: formData,
  });
  return handleResponse(response);
}

// ─── Video + Four-View Assessment ───────────────────────────────────────────

export interface VideoFourViewAssessmentRequest {
  video: File;
  top: File;
  bottom: File;
  left: File;
  right: File;
  confidence_threshold?: number;
  image_size?: number;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_year?: string;
  cause_of_damage?: string;
}

export interface VideoFrameResult {
  frame_index: number;
  timestamp_ms: number;
  detection_count: number;
  detections: Array<{
    damage_type: string;
    confidence: number;
    bounding_box_xyxy: number[];
  }>;
}

export interface PhotoViewResult {
  detection_count: number;
  detections: DamageDetection[];
  annotated_image_base64?: string;
  error?: string;
}

export interface VideoFourViewAssessmentResponse {
  assessment_id: string;
  timestamp: string;
  processing_time_ms: number;
  video_processed: boolean;
  video_frames_extracted: number;
  video_duration_seconds: number;
  photos_processed: number;
  video_frames: VideoFrameResult[];
  photos: Record<string, PhotoViewResult>;
  all_detections: Array<{
    damage_type: string;
    confidence: number;
    bounding_box_xyxy: number[];
  }>;
  total_detections: number;
  severity: 'minor' | 'moderate' | 'severe' | 'uncertain';
  primary_component: string;
  damage_summary: string;
  estimated_repair_cost_min: number;
  estimated_repair_cost_max: number;
  settlement_offer: number;
  settlement_min: number;
  settlement_max: number;
  limitations: string[];
}

export async function assessVideoFourView(request: VideoFourViewAssessmentRequest): Promise<VideoFourViewAssessmentResponse> {
  const formData = new FormData();
  formData.append('video', request.video);
  formData.append('top', request.top);
  formData.append('bottom', request.bottom);
  formData.append('left', request.left);
  formData.append('right', request.right);
  formData.append('confidence_threshold', String(request.confidence_threshold ?? 0.25));
  formData.append('image_size', String(request.image_size ?? 640));
  if (request.vehicle_make) formData.append('vehicle_make', request.vehicle_make);
  if (request.vehicle_model) formData.append('vehicle_model', request.vehicle_model);
  if (request.vehicle_year) formData.append('vehicle_year', request.vehicle_year);
  if (request.cause_of_damage) formData.append('cause_of_damage', request.cause_of_damage);

  const response = await fetch(`${API_BASE_URL}/assess/video-four-view`, {
    method: 'POST',
    body: formData,
  });
  return handleResponse(response);
}

// ─── ICICI Lombard Screening ───────────────────────────────────────────────

export interface ICICILombardScreeningRequest {
  // Product & Coverage
  product_type: 'private_car_package' | 'standalone_own_damage' | 'bundled_comprehensive' | 'third_party_only' | 'unknown';
  own_damage_cover: boolean;
  
  // Policy Period
  policy_start_date: string; // YYYY-MM-DD
  policy_end_date: string;
  incident_date: string;
  
  // Vehicle Valuation
  idv: number;
  
  // Cost Estimates
  repair_estimate_min: number;
  repair_estimate_max: number;
  retrieval_towing_cost: number;
  estimate_source: 'ai_preliminary' | 'garage_quotation' | 'surveyor_assessed';
  
  // Salvage & Deductible (optional)
  salvage_value?: number;
  deductible?: number;
  
  // Evidence
  four_view_validated: boolean;
  cv_review_required: boolean;
  evidence_concerns: string[];
  detected_damage_classes: string[];
  damage_severity?: string;
  max_detection_confidence?: number;
  
  // Claim Circumstances
  reported_cause?: string;
  driver_licence_valid?: boolean;
  vehicle_use_compliant?: boolean;
  driver_impairment_confirmed?: boolean;
  claim_notified_promptly?: boolean;
  
  // Verification
  policy_schedule_verified: boolean;
  adjuster_confirmed_accident: boolean;
  surveyor_unrepairable: boolean;
}

export interface ICICILombardScreeningResponse {
  outcome: 'standard_partial_loss' | 'potential_ctl' | 'potential_total_loss' | 'surveyor_unrepairable' | 'product_mismatch' | 'incomplete_information' | 'policy_exclusion_review' | 'human_review_required';
  reason_codes: string[];
  explanation: string;
  missing_information: string[];
  human_review_required: boolean;
  decision_is_final: boolean;
  automatic_payment_authorized: boolean;
  ctl_threshold_inr: number;
  repair_plus_retrieval_cost_range_inr: { min: number; max: number };
  cost_as_percent_of_idv_range: { min: number; max: number };
  cash_loss_route_candidate: boolean;
  illustrative_cash_loss_calculation_inr?: {
    idv: number;
    salvage_value: number;
    deductible: number;
    illustrative_cash_loss: number;
  };
  next_steps: string[];
  policy_sources: string[];
  disclaimer: string;
}

export async function screenICICILombardSuitability(request: ICICILombardScreeningRequest): Promise<ICICILombardScreeningResponse> {
  const formData = new FormData();
  
  // Convert request to form data
  Object.entries(request).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        value.forEach(v => formData.append(key, String(v)));
      } else {
        formData.append(key, String(value));
      }
    }
  });

  const response = await fetch(`${API_BASE_URL}/policy/icici-lombard/suitability`, {
    method: 'POST',
    body: formData,
  });
  return handleResponse(response);
}

// Convert base64 to data URL for display
export function base64ToDataUrl(base64: string, mimeType = 'image/jpeg'): string {
  return `data:${mimeType};base64,${base64}`;
}

// ─── Hybrid AI Assessment ───────────────────────────────────────────────────

export interface HybridAssessmentRequest {
  vehicle: {
    make: string;
    model: string;
    year?: number;
    variant?: string;
  };
  views: Record<string, string>; // base64 encoded images
  detections: Record<string, DamageDetection[]>;
  confidence_threshold?: number;
  image_size?: number;
}

export interface HybridDamageItem {
  component: string;
  view: string;
  detectionIds: string[];
  damageType: string;
  severity: 'minor' | 'moderate' | 'severe' | 'uncertain';
  evidence: string[];
  confidence: number;
  recommendation: 'repair' | 'replace' | 'inspect' | 'undetermined';
  reasoning: string;
  assumptions: string[];
}

export interface HybridAIObservation {
  component: string;
  view: string;
  description: string;
  severity: 'minor' | 'moderate' | 'severe' | 'uncertain';
  confidence: number;
  reasoning: string;
  boundingBoxHint?: { x: number; y: number; width: number; height: number };
}

export interface HybridDuplicateWarning {
  detectionIds: string[];
  views: string[];
  message: string;
}

export interface HybridAssessmentResponse {
  assessment_id: string;
  created_at: string;
  workflow: string;
  model_name: string;
  ai_provider: string;
  ai_model: string;
  damage_items: HybridDamageItem[];
  ai_observations: HybridAIObservation[];
  duplicate_warnings: HybridDuplicateWarning[];
  overall_reasoning: string;
  confidence: number;
  limitations: string[];
  estimated_repair_cost_min: number;
  estimated_repair_cost_max: number;
  settlement_offer: number;
  settlement_min: number;
  settlement_max: number;
  severity: 'minor' | 'moderate' | 'severe' | 'uncertain';
  primary_component: string;
  damage_summary: string;
  review_required: boolean;
}

export async function assessHybrid(request: HybridAssessmentRequest): Promise<HybridAssessmentResponse> {
  const response = await fetch(`${API_BASE_URL}/assess/hybrid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return handleResponse(response);
}

// ─── Direct OpenAI 4-View Assessment (primary path, no YOLO gate) ───────────

export interface DirectDamageItem {
  itemId: string;
  component: string;
  damageType: string;
  status: 'confirmed' | 'suspected' | 'uncertain';
  severity: 'minor' | 'moderate' | 'severe' | 'uncertain';
  evidenceViews: string[];
  evidenceDescription: string;
  confidence: number;
  recommendation: 'repair' | 'replace' | 'inspect' | 'no_action_needed';
  repairNotes: string;
  costEstimateMin: number;
  costEstimateMax: number;
  costCurrency: string;
  costAssumptions: string[];
}

export interface DirectAssessmentResponse {
  assessment_id: string;
  created_at: string;
  execution_mode: 'openai_vision' | 'openai_vision_with_yolo_support' | 'local_yolo_fallback' | 'assessment_failed';
  model_name: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_year: string;
  cause_of_damage: string;
  assessment_status: 'completed' | 'inconclusive' | 'insufficient_evidence';
  damage_items: DirectDamageItem[];
  duplicates_resolved: Array<{ description: string; views: string[] }>;
  overall_severity: 'minor' | 'moderate' | 'severe' | 'uncertain';
  overall_confidence: number;
  total_unique_components: number;
  estimated_repair_cost_min: number;
  estimated_repair_cost_max: number;
  settlement_offer: number;
  settlement_min: number;
  settlement_max: number;
  human_review_required: boolean;
  human_review_reasons: string[];
  overall_reasoning: string;
  primary_component: string;
  damage_summary: string;
  limitations: string[];
  review_flags: Array<{ code: string; view: string; message: string }>;
  validation_warnings: Array<{ code: string; view: string; message: string }>;
}

export interface DirectAssessmentRequest {
  top: File;
  bottom: File;
  left: File;
  right: File;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_year?: string;
  cause_of_damage?: string;
}

export async function assessDirect(request: DirectAssessmentRequest): Promise<DirectAssessmentResponse> {
  const formData = new FormData();
  formData.append('top', request.top);
  formData.append('bottom', request.bottom);
  formData.append('left', request.left);
  formData.append('right', request.right);
  if (request.vehicle_make) formData.append('vehicle_make', request.vehicle_make);
  if (request.vehicle_model) formData.append('vehicle_model', request.vehicle_model);
  if (request.vehicle_year) formData.append('vehicle_year', request.vehicle_year);
  if (request.cause_of_damage) formData.append('cause_of_damage', request.cause_of_damage);

  const response = await fetch(`${API_BASE_URL}/assess/direct`, {
    method: 'POST',
    body: formData,
  });
  return handleResponse<DirectAssessmentResponse>(response);
}

// ─── Backend Settlement Negotiation ─────────────────────────────────────────

export interface NegotiateRequest {
  vehicle_company?: string;
  vehicle_model?: string;
  vehicle_year?: string;
  cause_of_damage?: string;
  damage_summary: string;
  severity: string;
  primary_component: string;
  cost_min: number;
  cost_max: number;
  settlement_offer: number;
  settlement_min: number;
  settlement_max: number;
  user_message: string;
  chat_history?: Array<{ sender: string; text: string }>;
  damage_items?: Array<{
    component: string;
    damageType: string;
    severity: string;
    status: string;
    recommendation: string;
    costEstimateMin: number;
    costEstimateMax: number;
    evidenceDescription?: string;
  }>;
  overall_reasoning?: string;
}

export interface NegotiateResponse {
  message: string;
  new_offer?: number;
  is_offer: boolean;
  recommendation?: string;
  exclusion_detected: boolean;
  exclusion_reason: string;
  provider_used: string;
}

export async function negotiate(request: NegotiateRequest): Promise<NegotiateResponse> {
  const response = await fetch(`${API_BASE_URL}/negotiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return handleResponse<NegotiateResponse>(response);
}

// ─── Backend Report Generation ───────────────────────────────────────────────

export interface GenerateReportRequest {
  claim_reference: string;
  vehicle_company?: string;
  vehicle_model?: string;
  vehicle_year?: string;
  vehicle_variant?: string;
  cause_of_damage?: string;
  component?: string;
  damage_type?: string;
  severity?: string;
  repair_approach?: string;
  explanation?: string;
  cost_min?: number;
  cost_max?: number;
  settlement_offer?: number;
  settlement_min?: number;
  settlement_max?: number;
  final_settlement_amount: number;
  gross_repair_min?: number;
  gross_repair_max?: number;
  depreciation_amount?: number;
  depreciation_percentage?: number;
  depreciation_reason?: string;
  deductible_amount?: number;
  net_settlement?: number;
  breakdown_items?: Array<{ category: string; description: string; amount: number; type: string }>;
  exclusions?: Array<{ amount: number; description: string; items: string[] }>;
  chat_history?: Array<{ sender: string; text: string }>;
  assessment_views?: Record<string, { detection_count: number; detections: Array<{ damage_type: string; confidence: number; bounding_box_xyxy?: number[] }> }>;
  damage_items?: Array<Record<string, unknown>>;
}

export interface GenerateReportResponse {
  report: string;
  report_html: string;
  generated_at: string;
  claim_reference: string;
}

export async function generateReportFromBackend(request: GenerateReportRequest): Promise<GenerateReportResponse> {
  const response = await fetch(`${API_BASE_URL}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return handleResponse<GenerateReportResponse>(response);
}

export interface AIProviderStatus {
  provider: string;
  gemini_configured: boolean;
  gemini_model: string;
  openai_configured: boolean;
  openai_model: string;
  hybrid_available: boolean;
}

export async function getAIProviderStatus(): Promise<AIProviderStatus> {
  const response = await fetch(`${API_BASE_URL}/ai/provider/status`);
  return handleResponse(response);
}