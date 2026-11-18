export type UserRole = 'operator' | 'administrator';

export type DeviationFlag =
  | 'none'
  | 'drift'
  | 'sudden_change'
  | 'repeated_deviation'
  | 'unauthorized_recipe';

export type SessionStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'overdue'
  | 'missed';

export type ComplianceState =
  | 'pending'
  | 'compliant'
  | 'non_compliant_missing'
  | 'deviations_detected';

export type ScreenCaptureStatus =
  | 'pending'
  | 'captured_unverified'
  | 'completed';

export interface ParameterSpec {
  key: string;
  label: string;
  unit: string;
  targetValue: number;
  toleranceMin: number;
  toleranceMax: number;
}

export interface ScreenTemplate {
  id: string;
  order: number;
  code: string;
  name: string;
  mandatoryByDefault: boolean;
  description: string;
  sampleImageUrl: string;
  expectedParameters: ParameterSpec[];
}

export interface ApprovedRecipe {
  id: string;
  name: string;
  machineId: string;
  product: string;
  mold: string;
  version: string;
  approvedBy: string;
  approvedAt: string;
  parameters: Record<string, { target: number; min: number; max: number; unit: string; label: string }>;
}

export interface MachineConfig {
  id: string;
  code: string;
  name: string;
  controllerModel: string;
  location: string;
  currentProduct: string;
  currentMold: string;
  assignedOperator: string;
  shift: string;
  requiredScreenIds: string[];
  approvedRecipeId: string;
}

export interface ShiftDefinition {
  id: string;
  name: string;
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  active: boolean;
}

export interface ScheduleConfig {
  intervalHours: number;
  gracePeriodMinutes: number;
  shifts: ShiftDefinition[];
  timeSlots: string[];
  updatedBy: string;
  updatedAt: string;
}

export interface ExtractedReading {
  key: string;
  label: string;
  unit: string;
  extractedValue: number | null;
  verifiedValue: number | null;
  approvedTarget: number;
  toleranceMin: number;
  toleranceMax: number;
  ocrConfidence: number;
  manuallyCorrected: boolean;
  correctionReason?: string;
  verified: boolean;
  deviationFlag: DeviationFlag;
}

export interface ScreenCaptureRecord {
  screenId: string;
  screenName: string;
  order: number;
  mandatory: boolean;
  status: ScreenCaptureStatus;
  imageUrl?: string;
  imageDataUrl?: string;
  capturedAt?: string;
  capturedBy?: string;
  ocrStatus: 'idle' | 'extracting' | 'extracted' | 'failed';
  ocrError?: string;
  readings: ExtractedReading[];
  retakeCount: number;
  isAdditional?: boolean;
  notes?: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: string;
  role: UserRole;
  action: string;
  detail: string;
}

export interface AlarmRecord {
  id: string;
  timestamp: string;
  severity: 'warning' | 'critical';
  type: DeviationFlag | 'overdue';
  parameterKey?: string;
  message: string;
  acknowledged: boolean;
}

export interface MonitoringSession {
  id: string; // e.g., HM-001-20261117-0800
  machineId: string;
  machineName: string;
  controllerModel: string;
  product: string;
  mold: string;
  shift: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:MM
  scheduledAtIso: string;
  gracePeriodMinutes: number;
  assignedOperator: string;
  status: SessionStatus;
  complianceState: ComplianceState;
  completionPercent: number;
  screens: ScreenCaptureRecord[];
  alarms: AlarmRecord[];
  corrections: AuditEvent[];
  auditLog: AuditEvent[];
  recipeId: string;
  createdAt: string;
  completedAt?: string;
  isImmutableHistorical: boolean;
}

export interface MonitoringAppState {
  scheduleConfig: ScheduleConfig;
  machines: MachineConfig[];
  recipes: ApprovedRecipe[];
  screenTemplates: ScreenTemplate[];
  sessions: MonitoringSession[];
}

export interface ComparisonRow {
  key: string;
  label: string;
  unit: string;
  screenName: string;
  baselineValue: number | null;
  targetValue: number | null;
  delta: number | null;
  percentDelta: number | null;
  toleranceMin: number;
  toleranceMax: number;
  flag: DeviationFlag;
}
