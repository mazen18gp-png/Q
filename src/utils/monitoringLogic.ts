import type {
  AlarmRecord,
  ApprovedRecipe,
  ComparisonRow,
  ComplianceState,
  DeviationFlag,
  ExtractedReading,
  MonitoringSession,
  ScreenCaptureRecord,
  ShiftDefinition,
} from '../types/monitoring';

export function generateSessionId(machineCode: string, dateStr: string, timeStr: string): string {
  const cleanDate = dateStr.replace(/-/g, '');
  const cleanTime = timeStr.replace(/:/g, '');
  return `${machineCode}-${cleanDate}-${cleanTime}`;
}

export function isScreenCompleted(screen: ScreenCaptureRecord): boolean {
  const hasPhoto = Boolean(screen.imageUrl || screen.imageDataUrl);
  if (!hasPhoto) return false;
  if (screen.readings.length === 0) return false;
  return screen.readings.every((r) => r.verified && r.verifiedValue !== null && !Number.isNaN(r.verifiedValue));
}

export function computeSessionCompletion(screens: ScreenCaptureRecord[]): {
  completionPercent: number;
  completedMandatoryCount: number;
  totalMandatoryCount: number;
  missingPhotosCount: number;
  unverifiedReadingsCount: number;
  isFullyCompleted: boolean;
  hasAnyDeviations: boolean;
  complianceState: ComplianceState;
} {
  const mandatoryScreens = screens.filter((s) => s.mandatory);
  const totalMandatoryCount = mandatoryScreens.length;

  let completedMandatoryCount = 0;
  let missingPhotosCount = 0;
  let unverifiedReadingsCount = 0;
  let hasAnyDeviations = false;

  for (const screen of screens) {
    const hasPhoto = Boolean(screen.imageUrl || screen.imageDataUrl);
    if (screen.mandatory && !hasPhoto) {
      missingPhotosCount += 1;
    }

    const unverifiedInScreen = screen.readings.filter(
      (r) => !r.verified || r.verifiedValue === null || Number.isNaN(r.verifiedValue)
    ).length;

    if (hasPhoto && (screen.readings.length === 0 || unverifiedInScreen > 0)) {
      unverifiedReadingsCount += Math.max(1, unverifiedInScreen);
    }

    if (screen.readings.some((r) => r.deviationFlag !== 'none')) {
      hasAnyDeviations = true;
    }

    if (screen.mandatory && isScreenCompleted(screen)) {
      completedMandatoryCount += 1;
    }
  }

  const completionPercent =
    totalMandatoryCount === 0
      ? 100
      : Math.round((completedMandatoryCount / totalMandatoryCount) * 100);

  const isFullyCompleted =
    totalMandatoryCount > 0 &&
    completedMandatoryCount === totalMandatoryCount &&
    unverifiedReadingsCount === 0;

  let complianceState: ComplianceState = 'pending';
  if (isFullyCompleted) {
    complianceState = hasAnyDeviations ? 'deviations_detected' : 'compliant';
  } else if (missingPhotosCount > 0 || unverifiedReadingsCount > 0) {
    complianceState = hasAnyDeviations ? 'deviations_detected' : 'non_compliant_missing';
  }

  return {
    completionPercent,
    completedMandatoryCount,
    totalMandatoryCount,
    missingPhotosCount,
    unverifiedReadingsCount,
    isFullyCompleted,
    hasAnyDeviations,
    complianceState,
  };
}

export function canCaptureScreen(
  screens: ScreenCaptureRecord[],
  targetScreenId: string,
  isRetake: boolean
): { allowed: boolean; reason?: string } {
  const screen = screens.find((s) => s.screenId === targetScreenId);
  if (!screen) {
    return { allowed: false, reason: 'Target screen is not part of this session.' };
  }
  if (screen.status === 'completed' && !isRetake) {
    return {
      allowed: false,
      reason: `Screen "${screen.screenName}" is already verified and completed. Use Retake Photo to replace it.`,
    };
  }
  return { allowed: true };
}

export function getNextPendingScreenId(screens: ScreenCaptureRecord[]): string | null {
  const ordered = [...screens].sort((a, b) => a.order - b.order);
  const nextMandatory = ordered.find((s) => s.mandatory && s.status !== 'completed');
  if (nextMandatory) return nextMandatory.screenId;
  const nextAny = ordered.find((s) => s.status !== 'completed');
  return nextAny ? nextAny.screenId : null;
}

export function evaluateReminderAndOverdue(
  session: MonitoringSession,
  nowIso: string
): {
  state: 'completed' | 'upcoming' | 'due_in_grace' | 'overdue';
  minutesDelta: number;
  graceRemainingMinutes: number;
  shouldGenerateOverdueAlert: boolean;
} {
  if (session.status === 'completed') {
    return {
      state: 'completed',
      minutesDelta: 0,
      graceRemainingMinutes: 0,
      shouldGenerateOverdueAlert: false,
    };
  }

  const nowMs = new Date(nowIso).getTime();
  const scheduledMs = new Date(session.scheduledAtIso).getTime();
  const diffMinutes = Math.round((nowMs - scheduledMs) / 60000);

  if (diffMinutes < 0) {
    return {
      state: 'upcoming',
      minutesDelta: Math.abs(diffMinutes),
      graceRemainingMinutes: session.gracePeriodMinutes,
      shouldGenerateOverdueAlert: false,
    };
  }

  if (diffMinutes <= session.gracePeriodMinutes) {
    return {
      state: 'due_in_grace',
      minutesDelta: diffMinutes,
      graceRemainingMinutes: Math.max(0, session.gracePeriodMinutes - diffMinutes),
      shouldGenerateOverdueAlert: false,
    };
  }

  return {
    state: 'overdue',
    minutesDelta: diffMinutes - session.gracePeriodMinutes,
    graceRemainingMinutes: 0,
    shouldGenerateOverdueAlert: true,
  };
}

export function buildOverdueAlarm(session: MonitoringSession, nowIso: string): AlarmRecord {
  return {
    id: `ALM-OVR-${session.id}`,
    timestamp: nowIso,
    severity: 'warning',
    type: 'overdue',
    message: `Monitoring session ${session.id} overdue for ${session.machineName} (Assigned: ${session.assignedOperator}). Missed reading logged for compliance — not classified as a process deviation.`,
    acknowledged: false,
  };
}

export function evaluateReadingDeviation(
  reading: Pick<
    ExtractedReading,
    'key' | 'verifiedValue' | 'approvedTarget' | 'toleranceMin' | 'toleranceMax'
  >,
  previousSessionValue: number | null | undefined,
  recentHistoricalValues: number[],
  recipeTargetValue?: number
): DeviationFlag {
  const val = reading.verifiedValue;
  if (val === null || Number.isNaN(val)) return 'none';

  const effectiveTarget = recipeTargetValue ?? reading.approvedTarget;
  const tolSpan = Math.max(0.001, reading.toleranceMax - reading.toleranceMin);

  // 1. Unauthorized recipe change: recipe setpoint or verified value differs > 12% from approved recipe target
  //    or reading approvedTarget itself was altered from approved recipe
  if (
    recipeTargetValue !== undefined &&
    Math.abs(reading.approvedTarget - recipeTargetValue) > 0.001
  ) {
    return 'unauthorized_recipe';
  }
  if (effectiveTarget !== 0 && Math.abs(val - effectiveTarget) / Math.abs(effectiveTarget) > 0.12) {
    return 'unauthorized_recipe';
  }

  // 2. Sudden change compared to previous session (> 1.5x tolerance span or > 8% jump)
  if (previousSessionValue !== null && previousSessionValue !== undefined) {
    const jump = Math.abs(val - previousSessionValue);
    const pctJump = previousSessionValue !== 0 ? jump / Math.abs(previousSessionValue) : 0;
    if (jump > tolSpan * 1.25 && pctJump > 0.06) {
      return 'sudden_change';
    }
  }

  const isOutOfTolerance = val < reading.toleranceMin || val > reading.toleranceMax;

  // 3. Repeated deviation: out of tolerance now AND at least 2 of last 3 historical values were out of tolerance
  if (isOutOfTolerance && recentHistoricalValues.length >= 2) {
    const priorDeviations = recentHistoricalValues
      .slice(-3)
      .filter((v) => v < reading.toleranceMin || v > reading.toleranceMax).length;
    if (priorDeviations >= 2) {
      return 'repeated_deviation';
    }
  }

  // 4. Parameter drift: outside tolerance OR monotonically drifting close to boundary
  if (isOutOfTolerance) {
    return 'drift';
  }

  if (recentHistoricalValues.length >= 2) {
    const last = recentHistoricalValues[recentHistoricalValues.length - 1];
    const prev = recentHistoricalValues[recentHistoricalValues.length - 2];
    const monotonicUp = val > last && last > prev && val > reading.approvedTarget + tolSpan * 0.35;
    const monotonicDown = val < last && last < prev && val < reading.approvedTarget - tolSpan * 0.35;
    if (monotonicUp || monotonicDown) {
      return 'drift';
    }
  }

  return 'none';
}

export function extractReadingMap(session: MonitoringSession): Record<string, number | null> {
  const map: Record<string, number | null> = {};
  for (const screen of session.screens) {
    for (const reading of screen.readings) {
      map[reading.key] = reading.verifiedValue ?? reading.extractedValue;
    }
  }
  return map;
}

export function compareSessionReadings(
  targetSession: MonitoringSession,
  baselineSessionOrRecipe: MonitoringSession | ApprovedRecipe,
  previousSessionForMachine?: MonitoringSession | null,
  historicalSessionsForMachine: MonitoringSession[] = []
): ComparisonRow[] {
  const isRecipe = 'parameters' in baselineSessionOrRecipe;
  const baselineMap: Record<string, number | null> = isRecipe
    ? Object.fromEntries(
        Object.entries(baselineSessionOrRecipe.parameters).map(([k, v]) => [k, v.target])
      )
    : extractReadingMap(baselineSessionOrRecipe);

  const prevMap = previousSessionForMachine ? extractReadingMap(previousSessionForMachine) : {};

  const rows: ComparisonRow[] = [];
  for (const screen of targetSession.screens) {
    for (const reading of screen.readings) {
      const targetValue = reading.verifiedValue ?? reading.extractedValue;
      const baselineValue = baselineMap[reading.key] ?? reading.approvedTarget;

      let delta: number | null = null;
      let percentDelta: number | null = null;
      if (targetValue !== null && baselineValue !== null && baselineValue !== undefined) {
        delta = Number((targetValue - baselineValue).toFixed(2));
        percentDelta =
          baselineValue !== 0
            ? Number((((targetValue - baselineValue) / baselineValue) * 100).toFixed(2))
            : 0;
      }

      const historyVals = historicalSessionsForMachine
        .filter((s) => s.id !== targetSession.id && s.status === 'completed')
        .sort((a, b) => a.scheduledAtIso.localeCompare(b.scheduledAtIso))
        .map((s) => extractReadingMap(s)[reading.key])
        .filter((v): v is number => v !== null && v !== undefined);

      const recipeTarget = isRecipe ? baselineValue ?? undefined : undefined;
      const computedFlag = evaluateReadingDeviation(
        {
          key: reading.key,
          verifiedValue: targetValue,
          approvedTarget: reading.approvedTarget,
          toleranceMin: reading.toleranceMin,
          toleranceMax: reading.toleranceMax,
        },
        prevMap[reading.key],
        historyVals,
        recipeTarget
      );

      rows.push({
        key: reading.key,
        label: reading.label,
        unit: reading.unit,
        screenName: screen.screenName,
        baselineValue: baselineValue ?? null,
        targetValue,
        delta,
        percentDelta,
        toleranceMin: reading.toleranceMin,
        toleranceMax: reading.toleranceMax,
        flag: reading.deviationFlag !== 'none' ? reading.deviationFlag : computedFlag,
      });
    }
  }

  return rows;
}

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => Number(n));
  return (h || 0) * 60 + (m || 0);
}

function formatMinutes(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function generateTimeSlotsFromShifts(
  intervalHours: number,
  shifts: ShiftDefinition[]
): string[] {
  const safeIntervalMinutes = Math.max(30, Math.round(intervalHours * 60));
  const slots = new Set<string>();

  for (const shift of shifts) {
    if (!shift.active) continue;
    const start = parseMinutes(shift.startTime);
    let end = parseMinutes(shift.endTime);
    if (end <= start) {
      end += 1440; // overnight shift
    }
    for (let t = start; t < end; t += safeIntervalMinutes) {
      slots.add(formatMinutes(t));
    }
  }

  return Array.from(slots).sort();
}

export function calculateDashboardStats(sessions: MonitoringSession[]): {
  totalScheduled: number;
  completed: number;
  overdue: number;
  missed: number;
  inProgress: number;
  missingPhotosCount: number;
  unverifiedOcrCount: number;
  compliant: number;
  withDeviations: number;
  overallCompletionPercent: number;
} {
  let completed = 0;
  let overdue = 0;
  let missed = 0;
  let inProgress = 0;
  let missingPhotosCount = 0;
  let unverifiedOcrCount = 0;
  let compliant = 0;
  let withDeviations = 0;
  let completionSum = 0;

  for (const session of sessions) {
    completionSum += session.completionPercent;
    if (session.status === 'completed') completed += 1;
    if (session.status === 'overdue') overdue += 1;
    if (session.status === 'missed') missed += 1;
    if (session.status === 'in_progress') inProgress += 1;

    if (session.complianceState === 'compliant') compliant += 1;
    if (session.complianceState === 'deviations_detected') withDeviations += 1;

    const comp = computeSessionCompletion(session.screens);
    if (session.status !== 'scheduled') {
      missingPhotosCount += comp.missingPhotosCount;
      unverifiedOcrCount += comp.unverifiedReadingsCount;
    }
  }

  const totalScheduled = sessions.length;
  const overallCompletionPercent =
    totalScheduled === 0 ? 0 : Math.round(completionSum / totalScheduled);

  return {
    totalScheduled,
    completed,
    overdue,
    missed,
    inProgress,
    missingPhotosCount,
    unverifiedOcrCount,
    compliant,
    withDeviations,
    overallCompletionPercent,
  };
}
