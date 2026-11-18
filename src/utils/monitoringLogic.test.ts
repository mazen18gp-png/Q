import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDashboardStats,
  canCaptureScreen,
  compareSessionReadings,
  computeSessionCompletion,
  evaluateReadingDeviation,
  evaluateReminderAndOverdue,
  generateSessionId,
  generateTimeSlotsFromShifts,
} from './monitoringLogic';
import type { ApprovedRecipe, MonitoringSession, ScreenCaptureRecord } from '../types/monitoring';

function makeScreen(overrides: Partial<ScreenCaptureRecord> = {}): ScreenCaptureRecord {
  return {
    screenId: 'SCR-INJ',
    screenName: 'Injection Parameters Screen',
    order: 1,
    mandatory: true,
    status: 'pending',
    ocrStatus: 'idle',
    retakeCount: 0,
    readings: [
      {
        key: 'injection_pressure',
        label: 'Injection Pressure',
        unit: 'MPa',
        extractedValue: null,
        verifiedValue: null,
        approvedTarget: 115,
        toleranceMin: 110,
        toleranceMax: 120,
        ocrConfidence: 0,
        manuallyCorrected: false,
        verified: false,
        deviationFlag: 'none',
      },
    ],
    ...overrides,
  };
}

test('generateSessionId formats machine, date, and time cleanly', () => {
  assert.equal(generateSessionId('HM-001', '2026-11-17', '08:00'), 'HM-001-20261117-0800');
});

test('computeSessionCompletion blocks compliance if mandatory readings are missing or unverified', () => {
  const screens: ScreenCaptureRecord[] = [
    makeScreen({
      screenId: 'SCR-1',
      order: 1,
      status: 'completed',
      imageUrl: '/img1.jpg',
      readings: [
        {
          key: 'p1',
          label: 'Pressure',
          unit: 'MPa',
          extractedValue: 115,
          verifiedValue: 115,
          approvedTarget: 115,
          toleranceMin: 110,
          toleranceMax: 120,
          ocrConfidence: 0.98,
          manuallyCorrected: false,
          verified: true,
          deviationFlag: 'none',
        },
      ],
    }),
    makeScreen({
      screenId: 'SCR-2',
      order: 2,
      status: 'captured_unverified',
      imageUrl: '/img2.jpg',
      readings: [
        {
          key: 't1',
          label: 'Zone 1',
          unit: 'C',
          extractedValue: 215,
          verifiedValue: 215,
          approvedTarget: 215,
          toleranceMin: 210,
          toleranceMax: 220,
          ocrConfidence: 0.95,
          manuallyCorrected: false,
          verified: false, // unverified OCR!
          deviationFlag: 'none',
        },
      ],
    }),
    makeScreen({
      screenId: 'SCR-3',
      order: 3,
      status: 'pending',
    }),
    makeScreen({
      screenId: 'SCR-4',
      order: 4,
      status: 'pending',
    }),
  ];

  const result = computeSessionCompletion(screens);
  assert.equal(result.completionPercent, 25);
  assert.equal(result.isFullyCompleted, false);
  assert.equal(result.missingPhotosCount, 2);
  assert.equal(result.unverifiedReadingsCount, 1);
  assert.notEqual(result.complianceState, 'compliant');
});

test('canCaptureScreen prevents accidental duplication unless explicit retake', () => {
  const screens = [
    makeScreen({ screenId: 'SCR-1', status: 'completed' }),
    makeScreen({ screenId: 'SCR-2', status: 'pending' }),
  ];

  const dup = canCaptureScreen(screens, 'SCR-1', false);
  assert.equal(dup.allowed, false);

  const retake = canCaptureScreen(screens, 'SCR-1', true);
  assert.equal(retake.allowed, true);

  const next = canCaptureScreen(screens, 'SCR-2', false);
  assert.equal(next.allowed, true);
});

test('evaluateReminderAndOverdue respects grace period and does not classify missed as process deviation', () => {
  const session: MonitoringSession = {
    id: 'HM-001-20261117-0800',
    machineId: 'M1',
    machineName: 'Haitian M01',
    controllerModel: 'Haitian TechMotion',
    product: 'Plastic Bumper',
    mold: 'Bumper Mold 01',
    shift: 'Shift A',
    scheduledDate: '2026-11-17',
    scheduledTime: '08:00',
    scheduledAtIso: '2026-11-17T08:00:00',
    gracePeriodMinutes: 20,
    assignedOperator: 'Marcus Chen',
    status: 'overdue',
    complianceState: 'non_compliant_missing',
    completionPercent: 0,
    screens: [makeScreen()],
    alarms: [],
    corrections: [],
    auditLog: [],
    recipeId: 'REC-1',
    createdAt: '2026-11-17T06:00:00',
    isImmutableHistorical: false,
  };

  const inGrace = evaluateReminderAndOverdue(session, '2026-11-17T08:15:00');
  assert.equal(inGrace.state, 'due_in_grace');
  assert.equal(inGrace.graceRemainingMinutes, 5);
  assert.equal(inGrace.shouldGenerateOverdueAlert, false);

  const overdue = evaluateReminderAndOverdue(session, '2026-11-17T08:30:00');
  assert.equal(overdue.state, 'overdue');
  assert.equal(overdue.minutesDelta, 10);
  assert.equal(overdue.shouldGenerateOverdueAlert, true);
  assert.notEqual(session.complianceState, 'deviations_detected');
});

test('evaluateReadingDeviation detects drift, sudden change, repeated deviation, and unauthorized recipe change', () => {
  const baseReading = {
    key: 'injection_pressure',
    approvedTarget: 115,
    toleranceMin: 110,
    toleranceMax: 120,
  };

  // Unauthorized recipe change (target altered from 115 to 125)
  assert.equal(
    evaluateReadingDeviation({ ...baseReading, approvedTarget: 125, verifiedValue: 125 }, 115, [], 115),
    'unauthorized_recipe'
  );

  // Sudden change (> 1.25x tolSpan and > 6% jump from 112 to 128)
  assert.equal(
    evaluateReadingDeviation({ ...baseReading, verifiedValue: 128 }, 112, [113, 112], 115),
    'sudden_change'
  );

  // Repeated deviation (out of tolerance now + 2 prior out of tolerance)
  assert.equal(
    evaluateReadingDeviation({ ...baseReading, verifiedValue: 122 }, 121.5, [121, 121.5], 115),
    'repeated_deviation'
  );

  // Drift (out of tolerance once)
  assert.equal(
    evaluateReadingDeviation({ ...baseReading, verifiedValue: 121.5 }, 119, [116, 119], 115),
    'drift'
  );

  // Nominal
  assert.equal(
    evaluateReadingDeviation({ ...baseReading, verifiedValue: 115.4 }, 115.0, [115.1, 115.0], 115),
    'none'
  );
});

test('generateTimeSlotsFromShifts builds expected 2-hour schedule across shifts', () => {
  const slots = generateTimeSlotsFromShifts(2, [
    { id: 'A', name: 'Shift A', startTime: '06:00', endTime: '14:00', active: true },
    { id: 'B', name: 'Shift B', startTime: '14:00', endTime: '22:00', active: true },
  ]);
  assert.deepEqual(slots, ['06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00']);
});

test('compareSessionReadings computes numeric deltas against approved recipe', () => {
  const session: MonitoringSession = {
    id: 'HM-001-20261117-0800',
    machineId: 'M1',
    machineName: 'Haitian M01',
    controllerModel: 'Haitian TechMotion',
    product: 'Plastic Bumper',
    mold: 'Bumper Mold 01',
    shift: 'Shift A',
    scheduledDate: '2026-11-17',
    scheduledTime: '08:00',
    scheduledAtIso: '2026-11-17T08:00:00',
    gracePeriodMinutes: 20,
    assignedOperator: 'Marcus Chen',
    status: 'completed',
    complianceState: 'deviations_detected',
    completionPercent: 100,
    screens: [
      makeScreen({
        status: 'completed',
        imageUrl: '/img.jpg',
        readings: [
          {
            key: 'injection_pressure',
            label: 'Injection Pressure',
            unit: 'MPa',
            extractedValue: 121.5,
            verifiedValue: 121.5,
            approvedTarget: 115,
            toleranceMin: 110,
            toleranceMax: 120,
            ocrConfidence: 0.96,
            manuallyCorrected: false,
            verified: true,
            deviationFlag: 'drift',
          },
        ],
      }),
    ],
    alarms: [],
    corrections: [],
    auditLog: [],
    recipeId: 'REC-1',
    createdAt: '2026-11-17T08:00:00',
    isImmutableHistorical: true,
  };

  const recipe: ApprovedRecipe = {
    id: 'REC-1',
    name: 'Bumper Std v2',
    machineId: 'M1',
    product: 'Plastic Bumper',
    mold: 'Bumper Mold 01',
    version: '2.1',
    approvedBy: 'QA Lead',
    approvedAt: '2026-11-01T09:00:00',
    parameters: {
      injection_pressure: {
        target: 115,
        min: 110,
        max: 120,
        unit: 'MPa',
        label: 'Injection Pressure',
      },
    },
  };

  const rows = compareSessionReadings(session, recipe);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].delta, 6.5);
  assert.equal(rows[0].flag, 'drift');
});

test('calculateDashboardStats aggregates compliance and missing items accurately', () => {
  const s1: MonitoringSession = {
    id: 'S1',
    machineId: 'M1',
    machineName: 'Haitian M01',
    controllerModel: 'TM',
    product: 'Bumper',
    mold: 'M01',
    shift: 'Shift A',
    scheduledDate: '2026-11-17',
    scheduledTime: '06:00',
    scheduledAtIso: '2026-11-17T06:00:00',
    gracePeriodMinutes: 20,
    assignedOperator: 'Marcus',
    status: 'completed',
    complianceState: 'compliant',
    completionPercent: 100,
    screens: [
      makeScreen({
        status: 'completed',
        imageUrl: '/a.jpg',
        readings: [
          {
            key: 'p',
            label: 'P',
            unit: 'MPa',
            extractedValue: 115,
            verifiedValue: 115,
            approvedTarget: 115,
            toleranceMin: 110,
            toleranceMax: 120,
            ocrConfidence: 0.99,
            manuallyCorrected: false,
            verified: true,
            deviationFlag: 'none',
          },
        ],
      }),
    ],
    alarms: [],
    corrections: [],
    auditLog: [],
    recipeId: 'R1',
    createdAt: '2026-11-17T06:00:00',
    isImmutableHistorical: true,
  };

  const s2: MonitoringSession = {
    ...s1,
    id: 'S2',
    status: 'overdue',
    complianceState: 'non_compliant_missing',
    completionPercent: 0,
    screens: [makeScreen()],
    isImmutableHistorical: false,
  };

  const stats = calculateDashboardStats([s1, s2]);
  assert.equal(stats.totalScheduled, 2);
  assert.equal(stats.completed, 1);
  assert.equal(stats.overdue, 1);
  assert.equal(stats.compliant, 1);
  assert.equal(stats.missingPhotosCount, 1);
  assert.equal(stats.overallCompletionPercent, 50);
});
