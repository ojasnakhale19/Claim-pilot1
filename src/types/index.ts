export interface Claim {
  id: string;
  customerId: string;
  customerName: string;
  policyNumber: string;
  vehicle: Vehicle;
  incidentDate: string;
  incidentDescription: string;
  repairLocation: string;
  status: ClaimStatus;
  damageType: DamageType;
  severity: Severity;
  estimatedRepairCost: number;
  createdAt: string;
  updatedAt: string;
  assessmentId?: string;
  settlementId?: string;
}

export interface Vehicle {
  registrationNumber: string;
  make: string;
  model: string;
  year: number;
  variant?: string;
  color?: string;
  vin?: string;
}

export type ClaimStatus =
  | 'draft'
  | 'evidence_uploaded'
  | 'assessing'
  | 'assessed'
  | 'negotiating'
  | 'settled'
  | 'escalated'
  | 'closed';

export type DamageType =
  | 'collision'
  | 'scratch'
  | 'dent'
  | 'glass_breakage'
  | 'theft_vandalism'
  | 'weather'
  | 'fire'
  | 'other';

export type Severity = 'minor' | 'moderate' | 'severe' | 'uncertain';

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  policyNumber: string;
  avatar?: string;
}

export interface DamageComponent {
  id: string;
  component: string;
  damageType: string;
  severity: Severity;
  confidence: number;
  repairMethod: string;
  safetyConcern: boolean;
  estimatedCost: number;
  details?: string;
  annotations?: Annotation[];
}

export interface Annotation {
  id: string;
  componentId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  color: string;
}

export interface Assessment {
  id: string;
  claimId: string;
  status: AssessmentStatus;
  components: DamageComponent[];
  overallConfidence: number;
  totalEstimatedCost: number;
  assessedAt: string;
  assessedBy: 'ai' | 'human';
  notes?: string;
}

export type AssessmentStatus = 'pending' | 'completed' | 'review_required' | 'rejected';

export interface CostBreakdown {
  id: string;
  claimId: string;
  items: CostItem[];
  subtotal: number;
  taxes: number;
  total: number;
  currency: string;
  generatedAt: string;
}

export interface CostItem {
  id: string;
  component: string;
  category: 'parts' | 'labour' | 'paint_materials' | 'taxes' | 'other';
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface SettlementRange {
  id: string;
  claimId: string;
  estimatedGarageCost: number;
  minSettlement: number;
  recommendedOffer: number;
  maxSettlement: number;
  currency: string;
  policyRules: PolicyRule[];
  generatedAt: string;
}

export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  impact: number;
  type: 'deduction' | 'adjustment' | 'cap';
}

export interface Settlement {
  id: string;
  claimId: string;
  status: SettlementStatus;
  offeredAmount: number;
  acceptedAmount?: number;
  settlementRange: SettlementRange;
  conversation: Message[];
  currentOffer: number;
  negotiationRound: number;
  startedAt: string;
  completedAt?: string;
  confirmedAt?: string;
  escalatedAt?: string;
  escalationReason?: string;
}

export type SettlementStatus =
  | 'initiated'
  | 'negotiating'
  | 'offer_pending'
  | 'accepted'
  | 'confirmed'
  | 'escalated'
  | 'rejected';

export interface Message {
  id: string;
  settlementId: string;
  sender: 'customer' | 'ai' | 'system';
  content: string;
  timestamp: string;
  type: 'text' | 'offer' | 'counteroffer' | 'confirmation' | 'system';
  metadata?: {
    amount?: number;
    breakdown?: CostBreakdown;
    action?: string;
  };
}

export interface EscalationCase {
  id: string;
  claimId: string;
  reason: EscalationReason;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  status: 'pending' | 'in_review' | 'resolved' | 'returned_to_settlement';
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  reviewNotes?: string;
}

export type EscalationReason =
  | 'low_image_quality'
  | 'conflicting_evidence'
  | 'uncertain_component'
  | 'suspected_duplicate'
  | 'high_repair_cost'
  | 'offer_out_of_range'
  | 'potential_safety_damage'
  | 'customer_request'
  | 'policy_dispute'
  | 'other';

export interface AuditEvent {
  id: string;
  claimId: string;
  event: string;
  actor: string;
  description: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface AnalyticsData {
  claimsOverTime: TimeSeriesData[];
  automatedVsEscalated: CategoryData[];
  avgRepairCost: TimeSeriesData[];
  avgSettlementAmount: TimeSeriesData[];
  acceptanceRate: TimeSeriesData[];
  damageTypeDistribution: CategoryData[];
  severityDistribution: CategoryData[];
  escalationReasons: CategoryData[];
}

export interface TimeSeriesData {
  date: string;
  value: number;
  label?: string;
}

export interface CategoryData {
  name: string;
  value: number;
  color?: string;
}

export interface KPIData {
  totalClaims: number;
  aiAssessedClaims: number;
  assessmentCompletionRate: number;
  avgSettlementTime: number;
  settlementTimeChange: number;
  humanReviewRequired: number;
  totalClaimsChange: number;
  aiAssessedChange: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  preferences: UserPreferences;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  currency: string;
  dateFormat: string;
  notifications: NotificationPreferences;
  display: DisplayPreferences;
}

export interface NotificationPreferences {
  email: boolean;
  push: boolean;
  sms: boolean;
  claimUpdates: boolean;
  settlementUpdates: boolean;
  escalationAlerts: boolean;
  weeklyDigest: boolean;
}

export interface DisplayPreferences {
  density: 'comfortable' | 'compact' | 'spacious';
  sidebarCollapsed: boolean;
  animations: boolean;
  reducedMotion: boolean;
}

export interface DemoSettings {
  settlementPolicy: SettlementPolicySettings;
  escalationThresholds: EscalationThresholdSettings;
  assessmentConfidence: AssessmentConfidenceSettings;
  demoMode: boolean;
}

export interface SettlementPolicySettings {
  minSettlementPercentage: number;
  recommendedOfferPercentage: number;
  maxSettlementPercentage: number;
  depreciationRate: number;
  deductibleAmount: number;
}

export interface EscalationThresholdSettings {
  highRepairCost: number;
  lowConfidence: number;
  maxNegotiationRounds: number;
  timeLimitMinutes: number;
}

export interface AssessmentConfidenceSettings {
  autoApproveThreshold: number;
  reviewThreshold: number;
  rejectThreshold: number;
}