import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileWarning,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import type { ComplianceState, DeviationFlag, SessionStatus } from '../types/monitoring';

export function SessionStatusLabel({ status }: { status: SessionStatus }) {
  switch (status) {
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Completed
        </span>
      );
    case 'in_progress':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          In Progress
        </span>
      );
    case 'overdue':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Overdue
        </span>
      );
    case 'missed':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-800 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Missed
        </span>
      );
    case 'scheduled':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Scheduled
        </span>
      );
  }
}

export function ComplianceLabel({ state }: { state: ComplianceState }) {
  switch (state) {
    case 'compliant':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Compliant
        </span>
      );
    case 'deviations_detected':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 whitespace-nowrap">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Deviations Detected
        </span>
      );
    case 'non_compliant_missing':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
          <FileWarning className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Missing / Unverified
        </span>
      );
    case 'pending':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap">
          Pending Verification
        </span>
      );
  }
}

export function DeviationFlagLabel({ flag }: { flag: DeviationFlag }) {
  switch (flag) {
    case 'unauthorized_recipe':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 whitespace-nowrap">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Unauthorized Recipe Change
        </span>
      );
    case 'sudden_change':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Sudden Change
        </span>
      );
    case 'repeated_deviation':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Repeated Deviation
        </span>
      );
    case 'drift':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Parameter Drift
        </span>
      );
    case 'none':
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Nominal
        </span>
      );
  }
}
