import type {
  ApprovedRecipe,
  ExtractedReading,
  MachineConfig,
  MonitoringAppState,
  MonitoringSession,
  ScreenCaptureRecord,
  ScreenTemplate,
} from '../types/monitoring';
import { computeSessionCompletion, generateSessionId } from '../utils/monitoringLogic';

export const HMI_SAMPLE_IMAGES = {
  injection: '/src/assets/images/hmi_injection_screen_1794986527412.jpg',
  temperature: '/src/assets/images/hmi_temperature_screen_1794986526993.jpg',
  holding: '/src/assets/images/hmi_holding_screen_1794986528556.jpg',
  cooling: '/src/assets/images/hmi_cooling_screen_1794986529929.jpg',
  plasticizing: '/src/assets/images/hmi_plasticizing_screen_1794986527621.jpg',
};

export const INITIAL_SCREEN_TEMPLATES: ScreenTemplate[] = [
  {
    id: 'SCR-INJ',
    order: 1,
    code: 'INJ-01',
    name: 'Injection Parameters Screen',
    mandatoryByDefault: true,
    description: 'Injection pressure, speed profile, V/P switchover position, shot size, and cushion.',
    sampleImageUrl: HMI_SAMPLE_IMAGES.injection,
    expectedParameters: [
      { key: 'injection_pressure', label: 'Injection Pressure', unit: 'MPa', targetValue: 115.0, toleranceMin: 110.0, toleranceMax: 120.0 },
      { key: 'injection_speed', label: 'Injection Speed', unit: 'mm/s', targetValue: 70.0, toleranceMin: 65.0, toleranceMax: 75.0 },
      { key: 'vp_switchover', label: 'V/P Switchover Position', unit: 'mm', targetValue: 18.0, toleranceMin: 16.5, toleranceMax: 19.5 },
      { key: 'shot_size', label: 'Shot Size', unit: 'mm', targetValue: 142.0, toleranceMin: 140.0, toleranceMax: 144.0 },
      { key: 'cushion', label: 'Cushion', unit: 'mm', targetValue: 5.0, toleranceMin: 3.5, toleranceMax: 6.5 },
    ],
  },
  {
    id: 'SCR-TEMP',
    order: 2,
    code: 'TMP-02',
    name: 'Temperature Parameters Screen',
    mandatoryByDefault: true,
    description: 'Barrel heating zones 1–4, nozzle setpoint/actual, hydraulic oil, and mold temperature.',
    sampleImageUrl: HMI_SAMPLE_IMAGES.temperature,
    expectedParameters: [
      { key: 'temp_zone_1', label: 'Barrel Zone 1', unit: '°C', targetValue: 215.0, toleranceMin: 210.0, toleranceMax: 220.0 },
      { key: 'temp_zone_2', label: 'Barrel Zone 2', unit: '°C', targetValue: 225.0, toleranceMin: 220.0, toleranceMax: 230.0 },
      { key: 'temp_zone_3', label: 'Barrel Zone 3', unit: '°C', targetValue: 230.0, toleranceMin: 225.0, toleranceMax: 235.0 },
      { key: 'temp_zone_4', label: 'Barrel Zone 4', unit: '°C', targetValue: 235.0, toleranceMin: 230.0, toleranceMax: 240.0 },
      { key: 'nozzle_temp', label: 'Nozzle Temperature', unit: '°C', targetValue: 240.0, toleranceMin: 235.0, toleranceMax: 245.0 },
      { key: 'oil_temp', label: 'Hydraulic Oil Temp', unit: '°C', targetValue: 45.0, toleranceMin: 38.0, toleranceMax: 50.0 },
    ],
  },
  {
    id: 'SCR-HOLD',
    order: 3,
    code: 'HLD-03',
    name: 'Holding Pressure & Time Screen',
    mandatoryByDefault: true,
    description: 'Multi-stage packing pressure profile and stage holding durations.',
    sampleImageUrl: HMI_SAMPLE_IMAGES.holding,
    expectedParameters: [
      { key: 'hold_pressure_1', label: 'Stage 1 Hold Pressure', unit: 'MPa', targetValue: 78.0, toleranceMin: 74.0, toleranceMax: 82.0 },
      { key: 'hold_time_1', label: 'Stage 1 Hold Time', unit: 's', targetValue: 3.5, toleranceMin: 3.1, toleranceMax: 3.9 },
      { key: 'hold_pressure_2', label: 'Stage 2 Hold Pressure', unit: 'MPa', targetValue: 62.0, toleranceMin: 58.0, toleranceMax: 66.0 },
      { key: 'hold_time_2', label: 'Stage 2 Hold Time', unit: 's', targetValue: 4.0, toleranceMin: 3.6, toleranceMax: 4.4 },
    ],
  },
  {
    id: 'SCR-COOL',
    order: 4,
    code: 'CYL-04',
    name: 'Cooling Time & Cycle Time Screen',
    mandatoryByDefault: true,
    description: 'Cooling duration, total cycle time, mold open/close times, and clamping force.',
    sampleImageUrl: HMI_SAMPLE_IMAGES.cooling,
    expectedParameters: [
      { key: 'cooling_time', label: 'Cooling Time', unit: 's', targetValue: 18.5, toleranceMin: 17.5, toleranceMax: 19.5 },
      { key: 'total_cycle_time', label: 'Total Cycle Time', unit: 's', targetValue: 34.2, toleranceMin: 32.5, toleranceMax: 36.0 },
      { key: 'clamping_force', label: 'Clamping Force', unit: 'kN', targetValue: 2450, toleranceMin: 2380, toleranceMax: 2520 },
    ],
  },
  {
    id: 'SCR-PLAS',
    order: 5,
    code: 'PLS-05',
    name: 'Plasticizing & Screw Parameters Screen',
    mandatoryByDefault: true,
    description: 'Screw RPM, back pressure, decompression suck-back, plasticizing time, and metering stroke.',
    sampleImageUrl: HMI_SAMPLE_IMAGES.plasticizing,
    expectedParameters: [
      { key: 'screw_speed', label: 'Screw Speed', unit: 'RPM', targetValue: 110, toleranceMin: 100, toleranceMax: 120 },
      { key: 'back_pressure', label: 'Back Pressure', unit: 'MPa', targetValue: 1.4, toleranceMin: 1.1, toleranceMax: 1.7 },
      { key: 'suck_back', label: 'Suck Back Distance', unit: 'mm', targetValue: 4.5, toleranceMin: 3.8, toleranceMax: 5.2 },
      { key: 'plasticizing_time', label: 'Plasticizing Time', unit: 's', targetValue: 7.8, toleranceMin: 7.0, toleranceMax: 8.6 },
    ],
  },
  {
    id: 'SCR-EJECT',
    order: 6,
    code: 'EJC-06',
    name: 'Core Pull & Ejector Profile Screen',
    mandatoryByDefault: false,
    description: 'Optional ejector stroke, forward/retract speed, and core sequence interlocks.',
    sampleImageUrl: HMI_SAMPLE_IMAGES.cooling,
    expectedParameters: [
      { key: 'ejector_stroke', label: 'Ejector Stroke', unit: 'mm', targetValue: 45.0, toleranceMin: 43.0, toleranceMax: 47.0 },
      { key: 'ejector_delay', label: 'Ejector Delay', unit: 's', targetValue: 0.8, toleranceMin: 0.5, toleranceMax: 1.1 },
    ],
  },
  {
    id: 'SCR-HOT',
    order: 7,
    code: 'HRN-07',
    name: 'Hot Runner Manifold Screen',
    mandatoryByDefault: false,
    description: 'Multi-drop hot runner manifold thermal zones for multi-cavity or automotive molds.',
    sampleImageUrl: HMI_SAMPLE_IMAGES.temperature,
    expectedParameters: [
      { key: 'hot_runner_manifold', label: 'Manifold Temperature', unit: '°C', targetValue: 242.0, toleranceMin: 237.0, toleranceMax: 247.0 },
      { key: 'hot_runner_tip', label: 'Valve Gate Tip Temp', unit: '°C', targetValue: 245.0, toleranceMin: 240.0, toleranceMax: 250.0 },
    ],
  },
];

export const INITIAL_MACHINES: MachineConfig[] = [
  {
    id: 'M-HM01',
    code: 'HM-001',
    name: 'Haitian M01',
    controllerModel: 'Haitian TechMotion 320T (KEBA)',
    location: 'Bay A · Line 01',
    currentProduct: 'Plastic Bumper',
    currentMold: 'Bumper Mold 01',
    assignedOperator: 'Marcus Chen',
    shift: 'Shift A (06:00–14:00)',
    requiredScreenIds: ['SCR-INJ', 'SCR-TEMP', 'SCR-HOLD', 'SCR-COOL', 'SCR-PLAS'],
    approvedRecipeId: 'REC-BUMPER-01',
  },
  {
    id: 'M-HM02',
    code: 'HM-002',
    name: 'Haitian M02',
    controllerModel: 'Haitian Mars III 450T (Techmation)',
    location: 'Bay A · Line 02',
    currentProduct: 'Door Trim Panel',
    currentMold: 'Trim Mold 04',
    assignedOperator: 'Elena Rostova',
    shift: 'Shift A (06:00–14:00)',
    requiredScreenIds: ['SCR-INJ', 'SCR-TEMP', 'SCR-HOLD', 'SCR-COOL', 'SCR-PLAS', 'SCR-HOT'],
    approvedRecipeId: 'REC-TRIM-04',
  },
  {
    id: 'M-EM03',
    code: 'EM-003',
    name: 'Engel E03',
    controllerModel: 'Engel CC300 e-mac 180',
    location: 'Bay B · Line 03',
    currentProduct: 'Airbag Housing',
    currentMold: 'Housing Mold 02',
    assignedOperator: 'David Kim',
    shift: 'Shift A (06:00–14:00)',
    requiredScreenIds: ['SCR-INJ', 'SCR-TEMP', 'SCR-HOLD', 'SCR-COOL'],
    approvedRecipeId: 'REC-HOUSING-02',
  },
  {
    id: 'M-KM04',
    code: 'KM-004',
    name: 'KraussMaffei KM04',
    controllerModel: 'KraussMaffei MC6 PX-200',
    location: 'Bay B · Line 04',
    currentProduct: 'Instrument Bezel',
    currentMold: 'Bezel Mold 07',
    assignedOperator: 'Priya Nair',
    shift: 'Shift B (14:00–22:00)',
    requiredScreenIds: ['SCR-INJ', 'SCR-TEMP', 'SCR-HOLD', 'SCR-COOL', 'SCR-PLAS'],
    approvedRecipeId: 'REC-BEZEL-07',
  },
];

export const INITIAL_RECIPES: ApprovedRecipe[] = [
  {
    id: 'REC-BUMPER-01',
    name: 'PP-EPDM Bumper Spec v3.2',
    machineId: 'M-HM01',
    product: 'Plastic Bumper',
    mold: 'Bumper Mold 01',
    version: '3.2',
    approvedBy: 'Dr. Sarah Lindqvist (Process Eng)',
    approvedAt: '2026-10-12T10:00:00',
    parameters: Object.fromEntries(
      INITIAL_SCREEN_TEMPLATES.flatMap((t) => t.expectedParameters).map((p) => [
        p.key,
        { target: p.targetValue, min: p.toleranceMin, max: p.toleranceMax, unit: p.unit, label: p.label },
      ])
    ),
  },
  {
    id: 'REC-TRIM-04',
    name: 'ABS Door Trim Spec v2.0',
    machineId: 'M-HM02',
    product: 'Door Trim Panel',
    mold: 'Trim Mold 04',
    version: '2.0',
    approvedBy: 'Dr. Sarah Lindqvist (Process Eng)',
    approvedAt: '2026-10-20T14:30:00',
    parameters: Object.fromEntries(
      INITIAL_SCREEN_TEMPLATES.flatMap((t) => t.expectedParameters).map((p) => [
        p.key,
        { target: p.targetValue, min: p.toleranceMin, max: p.toleranceMax, unit: p.unit, label: p.label },
      ])
    ),
  },
  {
    id: 'REC-HOUSING-02',
    name: 'PA66-GF30 Housing Spec v4.1',
    machineId: 'M-EM03',
    product: 'Airbag Housing',
    mold: 'Housing Mold 02',
    version: '4.1',
    approvedBy: 'Henrik Sato (QA Director)',
    approvedAt: '2026-11-01T09:15:00',
    parameters: Object.fromEntries(
      INITIAL_SCREEN_TEMPLATES.flatMap((t) => t.expectedParameters).map((p) => [
        p.key,
        { target: p.targetValue, min: p.toleranceMin, max: p.toleranceMax, unit: p.unit, label: p.label },
      ])
    ),
  },
  {
    id: 'REC-BEZEL-07',
    name: 'PC/ABS Instrument Bezel v1.8',
    machineId: 'M-KM04',
    product: 'Instrument Bezel',
    mold: 'Bezel Mold 07',
    version: '1.8',
    approvedBy: 'Dr. Sarah Lindqvist (Process Eng)',
    approvedAt: '2026-11-04T11:00:00',
    parameters: Object.fromEntries(
      INITIAL_SCREEN_TEMPLATES.flatMap((t) => t.expectedParameters).map((p) => [
        p.key,
        { target: p.targetValue, min: p.toleranceMin, max: p.toleranceMax, unit: p.unit, label: p.label },
      ])
    ),
  },
];

function buildReadingsForScreen(
  template: ScreenTemplate,
  overrides: Record<string, { value: number | null; verified?: boolean; flag?: ExtractedReading['deviationFlag']; corrected?: boolean; reason?: string }> = {},
  completed = true
): ExtractedReading[] {
  return template.expectedParameters.map((p) => {
    const ov = overrides[p.key];
    const value = ov ? ov.value : completed ? p.targetValue : null;
    const verified = ov?.verified ?? (completed && value !== null);
    return {
      key: p.key,
      label: p.label,
      unit: p.unit,
      extractedValue: value,
      verifiedValue: verified ? value : value,
      approvedTarget: p.targetValue,
      toleranceMin: p.toleranceMin,
      toleranceMax: p.toleranceMax,
      ocrConfidence: value !== null ? 0.97 : 0,
      manuallyCorrected: ov?.corrected ?? false,
      correctionReason: ov?.reason,
      verified,
      deviationFlag: ov?.flag ?? 'none',
    };
  });
}

function buildScreensForMachine(
  machine: MachineConfig,
  screenStateMap: Record<
    string,
    {
      status: ScreenCaptureRecord['status'];
      capturedAt?: string;
      capturedBy?: string;
      overrides?: Record<string, { value: number | null; verified?: boolean; flag?: ExtractedReading['deviationFlag']; corrected?: boolean; reason?: string }>;
      retakeCount?: number;
    }
  >
): ScreenCaptureRecord[] {
  return machine.requiredScreenIds.map((screenId, idx) => {
    const template = INITIAL_SCREEN_TEMPLATES.find((t) => t.id === screenId)!;
    const st = screenStateMap[screenId];
    const status = st?.status ?? 'pending';
    const hasPhoto = status !== 'pending';

    return {
      screenId: template.id,
      screenName: template.name,
      order: idx + 1,
      mandatory: true,
      status,
      imageUrl: hasPhoto ? template.sampleImageUrl : undefined,
      capturedAt: st?.capturedAt,
      capturedBy: st?.capturedBy,
      ocrStatus: hasPhoto ? 'extracted' : 'idle',
      readings: buildReadingsForScreen(template, st?.overrides ?? {}, status === 'completed'),
      retakeCount: st?.retakeCount ?? 0,
    };
  });
}

function makeCompletedAll(
  machine: MachineConfig,
  timestamp: string,
  operator: string,
  perScreenOverrides: Record<string, Record<string, { value: number | null; verified?: boolean; flag?: ExtractedReading['deviationFlag']; corrected?: boolean; reason?: string }>> = {}
): ScreenCaptureRecord[] {
  const map: Record<string, { status: 'completed'; capturedAt: string; capturedBy: string; overrides: Record<string, { value: number | null; verified?: boolean; flag?: ExtractedReading['deviationFlag']; corrected?: boolean; reason?: string }> }> = {};
  machine.requiredScreenIds.forEach((id) => {
    map[id] = {
      status: 'completed',
      capturedAt: timestamp,
      capturedBy: operator,
      overrides: perScreenOverrides[id] ?? {},
    };
  });
  return buildScreensForMachine(machine, map);
}

function createInitialSessions(): MonitoringSession[] {
  const hm01 = INITIAL_MACHINES[0];
  const hm02 = INITIAL_MACHINES[1];
  const em03 = INITIAL_MACHINES[2];
  const km04 = INITIAL_MACHINES[3];

  const sessions: MonitoringSession[] = [
    // Historical Day -1: 2026-11-16 08:00 HM-001 (Compliant)
    (() => {
      const screens = makeCompletedAll(hm01, '2026-11-16T08:04:00', 'Marcus Chen', {
        'SCR-INJ': {
          injection_pressure: { value: 115.2 },
          injection_speed: { value: 69.5 },
        },
      });
      const comp = computeSessionCompletion(screens);
      return {
        id: generateSessionId(hm01.code, '2026-11-16', '08:00'),
        machineId: hm01.id,
        machineName: hm01.name,
        controllerModel: hm01.controllerModel,
        product: hm01.currentProduct,
        mold: hm01.currentMold,
        shift: 'Shift A (06:00–14:00)',
        scheduledDate: '2026-11-16',
        scheduledTime: '08:00',
        scheduledAtIso: '2026-11-16T08:00:00',
        gracePeriodMinutes: 20,
        assignedOperator: 'Marcus Chen',
        status: 'completed',
        complianceState: comp.complianceState,
        completionPercent: comp.completionPercent,
        screens,
        alarms: [],
        corrections: [],
        auditLog: [
          {
            id: 'AUD-101',
            timestamp: '2026-11-16T08:05:12',
            actor: 'Marcus Chen',
            role: 'operator',
            action: 'Session Finalized',
            detail: 'All 5 mandatory parameter screens photographed and verified within recipe tolerance.',
          },
        ],
        recipeId: hm01.approvedRecipeId,
        createdAt: '2026-11-16T06:00:00',
        completedAt: '2026-11-16T08:05:12',
        isImmutableHistorical: true,
      };
    })(),

    // Historical Day -1: 2026-11-16 14:00 HM-001 (Shift B, Drift started in Zone 4 & Hold Pressure)
    (() => {
      const screens = makeCompletedAll(hm01, '2026-11-16T14:06:00', 'Liam O’Connor', {
        'SCR-INJ': {
          injection_pressure: { value: 118.8 },
          injection_speed: { value: 68.0 },
        },
        'SCR-TEMP': {
          temp_zone_4: { value: 241.5, flag: 'drift', corrected: true, reason: 'OCR misread 241.5 as 241.6; verified against controller' },
        },
      });
      const comp = computeSessionCompletion(screens);
      return {
        id: generateSessionId(hm01.code, '2026-11-16', '14:00'),
        machineId: hm01.id,
        machineName: hm01.name,
        controllerModel: hm01.controllerModel,
        product: hm01.currentProduct,
        mold: hm01.currentMold,
        shift: 'Shift B (14:00–22:00)',
        scheduledDate: '2026-11-16',
        scheduledTime: '14:00',
        scheduledAtIso: '2026-11-16T14:00:00',
        gracePeriodMinutes: 20,
        assignedOperator: 'Liam O’Connor',
        status: 'completed',
        complianceState: comp.complianceState,
        completionPercent: comp.completionPercent,
        screens,
        alarms: [
          {
            id: 'ALM-201',
            timestamp: '2026-11-16T14:06:10',
            severity: 'warning',
            type: 'drift',
            parameterKey: 'temp_zone_4',
            message: 'Barrel Zone 4 (241.5 °C) exceeded upper tolerance (240.0 °C).',
            acknowledged: true,
          },
        ],
        corrections: [
          {
            id: 'COR-201',
            timestamp: '2026-11-16T14:05:45',
            actor: 'Liam O’Connor',
            role: 'operator',
            action: 'OCR Value Corrected',
            detail: 'Barrel Zone 4 updated from 241.6 °C to 241.5 °C after visual check.',
          },
        ],
        auditLog: [
          {
            id: 'AUD-201',
            timestamp: '2026-11-16T14:06:10',
            actor: 'Liam O’Connor',
            role: 'operator',
            action: 'Session Finalized',
            detail: 'Completed 5/5 screens with 1 thermal drift alarm logged.',
          },
        ],
        recipeId: hm01.approvedRecipeId,
        createdAt: '2026-11-16T12:00:00',
        completedAt: '2026-11-16T14:06:10',
        isImmutableHistorical: true,
      };
    })(),

    // Today 2026-11-17 06:00 HM-001 (Completed, Repeated Deviation on Zone 4 + Sudden Change on Injection Pressure)
    (() => {
      const screens = makeCompletedAll(hm01, '2026-11-17T06:07:00', 'Marcus Chen', {
        'SCR-INJ': {
          injection_pressure: { value: 123.4, flag: 'sudden_change' },
          injection_speed: { value: 68.0 },
          vp_switchover: { value: 18.5 },
          cushion: { value: 5.2 },
        },
        'SCR-TEMP': {
          temp_zone_4: { value: 242.2, flag: 'repeated_deviation' },
        },
      });
      const comp = computeSessionCompletion(screens);
      return {
        id: generateSessionId(hm01.code, '2026-11-17', '06:00'),
        machineId: hm01.id,
        machineName: hm01.name,
        controllerModel: hm01.controllerModel,
        product: hm01.currentProduct,
        mold: hm01.currentMold,
        shift: 'Shift A (06:00–14:00)',
        scheduledDate: '2026-11-17',
        scheduledTime: '06:00',
        scheduledAtIso: '2026-11-17T06:00:00',
        gracePeriodMinutes: 20,
        assignedOperator: 'Marcus Chen',
        status: 'completed',
        complianceState: comp.complianceState,
        completionPercent: comp.completionPercent,
        screens,
        alarms: [
          {
            id: 'ALM-301',
            timestamp: '2026-11-17T06:07:05',
            severity: 'critical',
            type: 'sudden_change',
            parameterKey: 'injection_pressure',
            message: 'Injection Pressure jumped to 123.4 MPa (+8.4 MPa vs recipe target 115.0 MPa).',
            acknowledged: false,
          },
          {
            id: 'ALM-302',
            timestamp: '2026-11-17T06:07:05',
            severity: 'warning',
            type: 'repeated_deviation',
            parameterKey: 'temp_zone_4',
            message: 'Barrel Zone 4 (242.2 °C) repeated thermal deviation across consecutive shifts.',
            acknowledged: false,
          },
        ],
        corrections: [],
        auditLog: [
          {
            id: 'AUD-301',
            timestamp: '2026-11-17T06:07:05',
            actor: 'Marcus Chen',
            role: 'operator',
            action: 'Session Finalized',
            detail: 'Completed 5/5 screens. Two parameter deviations flagged for engineering review.',
          },
        ],
        recipeId: hm01.approvedRecipeId,
        createdAt: '2026-11-17T05:30:00',
        completedAt: '2026-11-17T06:07:05',
        isImmutableHistorical: true,
      };
    })(),

    // Today 2026-11-17 06:00 HM-002 (Completed Compliant)
    (() => {
      const screens = makeCompletedAll(hm02, '2026-11-17T06:11:00', 'Elena Rostova');
      const comp = computeSessionCompletion(screens);
      return {
        id: generateSessionId(hm02.code, '2026-11-17', '06:00'),
        machineId: hm02.id,
        machineName: hm02.name,
        controllerModel: hm02.controllerModel,
        product: hm02.currentProduct,
        mold: hm02.currentMold,
        shift: 'Shift A (06:00–14:00)',
        scheduledDate: '2026-11-17',
        scheduledTime: '06:00',
        scheduledAtIso: '2026-11-17T06:00:00',
        gracePeriodMinutes: 20,
        assignedOperator: 'Elena Rostova',
        status: 'completed',
        complianceState: comp.complianceState,
        completionPercent: comp.completionPercent,
        screens,
        alarms: [],
        corrections: [],
        auditLog: [
          {
            id: 'AUD-302',
            timestamp: '2026-11-17T06:11:20',
            actor: 'Elena Rostova',
            role: 'operator',
            action: 'Session Finalized',
            detail: 'All 6 mandatory screens verified and compliant.',
          },
        ],
        recipeId: hm02.approvedRecipeId,
        createdAt: '2026-11-17T05:30:00',
        completedAt: '2026-11-17T06:11:20',
        isImmutableHistorical: true,
      };
    })(),

    // Today 2026-11-17 08:00 HM-001 (IN PROGRESS: 3/5 screens completed = 60% -> primary example session!)
    (() => {
      const screens = buildScreensForMachine(hm01, {
        'SCR-INJ': {
          status: 'completed',
          capturedAt: '2026-11-17T08:03:10',
          capturedBy: 'Marcus Chen',
          overrides: {
            injection_pressure: { value: 115.4 },
            injection_speed: { value: 68.0 },
            vp_switchover: { value: 18.5 },
            shot_size: { value: 142.0 },
            cushion: { value: 5.2 },
          },
        },
        'SCR-TEMP': {
          status: 'completed',
          capturedAt: '2026-11-17T08:04:05',
          capturedBy: 'Marcus Chen',
        },
        'SCR-HOLD': {
          status: 'completed',
          capturedAt: '2026-11-17T08:05:12',
          capturedBy: 'Marcus Chen',
        },
        'SCR-COOL': { status: 'pending' },
        'SCR-PLAS': { status: 'pending' },
      });
      const comp = computeSessionCompletion(screens);
      return {
        id: generateSessionId(hm01.code, '2026-11-17', '08:00'),
        machineId: hm01.id,
        machineName: hm01.name,
        controllerModel: hm01.controllerModel,
        product: hm01.currentProduct,
        mold: hm01.currentMold,
        shift: 'Shift A (06:00–14:00)',
        scheduledDate: '2026-11-17',
        scheduledTime: '08:00',
        scheduledAtIso: '2026-11-17T08:00:00',
        gracePeriodMinutes: 20,
        assignedOperator: 'Marcus Chen',
        status: 'in_progress',
        complianceState: comp.complianceState,
        completionPercent: comp.completionPercent,
        screens,
        alarms: [],
        corrections: [],
        auditLog: [
          {
            id: 'AUD-401',
            timestamp: '2026-11-17T08:03:10',
            actor: 'Marcus Chen',
            role: 'operator',
            action: 'Screen Verified',
            detail: 'Screen 1 (Injection Parameters Screen) captured & verified.',
          },
          {
            id: 'AUD-402',
            timestamp: '2026-11-17T08:04:05',
            actor: 'Marcus Chen',
            role: 'operator',
            action: 'Screen Verified',
            detail: 'Screen 2 (Temperature Parameters Screen) captured & verified.',
          },
          {
            id: 'AUD-403',
            timestamp: '2026-11-17T08:05:12',
            actor: 'Marcus Chen',
            role: 'operator',
            action: 'Screen Verified',
            detail: 'Screen 3 (Holding Pressure & Time Screen) captured & verified.',
          },
        ],
        recipeId: hm01.approvedRecipeId,
        createdAt: '2026-11-17T07:45:00',
        isImmutableHistorical: false,
      };
    })(),

    // Today 2026-11-17 08:00 HM-002 (Completed with Unauthorized Recipe Change on Cooling Time!)
    (() => {
      const screens = makeCompletedAll(hm02, '2026-11-17T08:12:00', 'Elena Rostova', {
        'SCR-COOL': {
          cooling_time: { value: 23.8, flag: 'unauthorized_recipe' },
          total_cycle_time: { value: 39.5, flag: 'drift' },
        },
      });
      const comp = computeSessionCompletion(screens);
      return {
        id: generateSessionId(hm02.code, '2026-11-17', '08:00'),
        machineId: hm02.id,
        machineName: hm02.name,
        controllerModel: hm02.controllerModel,
        product: hm02.currentProduct,
        mold: hm02.currentMold,
        shift: 'Shift A (06:00–14:00)',
        scheduledDate: '2026-11-17',
        scheduledTime: '08:00',
        scheduledAtIso: '2026-11-17T08:00:00',
        gracePeriodMinutes: 20,
        assignedOperator: 'Elena Rostova',
        status: 'completed',
        complianceState: comp.complianceState,
        completionPercent: comp.completionPercent,
        screens,
        alarms: [
          {
            id: 'ALM-402',
            timestamp: '2026-11-17T08:12:05',
            severity: 'critical',
            type: 'unauthorized_recipe',
            parameterKey: 'cooling_time',
            message: 'Cooling Time (23.8 s) deviates +28.6% from approved recipe (18.5 s) — Unauthorized Recipe Change suspected.',
            acknowledged: false,
          },
        ],
        corrections: [],
        auditLog: [
          {
            id: 'AUD-404',
            timestamp: '2026-11-17T08:12:05',
            actor: 'Elena Rostova',
            role: 'operator',
            action: 'Session Finalized',
            detail: 'Completed 6/6 screens; critical unauthorized recipe alert triggered.',
          },
        ],
        recipeId: hm02.approvedRecipeId,
        createdAt: '2026-11-17T07:45:00',
        completedAt: '2026-11-17T08:12:05',
        isImmutableHistorical: true,
      };
    })(),

    // Today 2026-11-17 08:00 EM-003 (OVERDUE — missed grace window, NOT a process deviation)
    (() => {
      const screens = buildScreensForMachine(em03, {
        'SCR-INJ': { status: 'completed', capturedAt: '2026-11-17T08:18:00', capturedBy: 'David Kim' },
        'SCR-TEMP': {
          status: 'captured_unverified',
          capturedAt: '2026-11-17T08:19:10',
          capturedBy: 'David Kim',
          overrides: {
            temp_zone_1: { value: 215.0, verified: false },
            temp_zone_2: { value: 225.0, verified: false },
            temp_zone_3: { value: 230.0, verified: false },
            temp_zone_4: { value: 235.0, verified: false },
            nozzle_temp: { value: 240.0, verified: false },
            oil_temp: { value: 44.2, verified: false },
          },
        },
      });
      const comp = computeSessionCompletion(screens);
      return {
        id: generateSessionId(em03.code, '2026-11-17', '08:00'),
        machineId: em03.id,
        machineName: em03.name,
        controllerModel: em03.controllerModel,
        product: em03.currentProduct,
        mold: em03.currentMold,
        shift: 'Shift A (06:00–14:00)',
        scheduledDate: '2026-11-17',
        scheduledTime: '08:00',
        scheduledAtIso: '2026-11-17T08:00:00',
        gracePeriodMinutes: 20,
        assignedOperator: 'David Kim',
        status: 'overdue',
        complianceState: comp.complianceState,
        completionPercent: comp.completionPercent,
        screens,
        alarms: [
          {
            id: 'ALM-OVR-EM003',
            timestamp: '2026-11-17T08:21:00',
            severity: 'warning',
            type: 'overdue',
            message: 'Session overdue past 20 min grace window (Assigned: David Kim). 2 screens pending, 1 unverified OCR screen.',
            acknowledged: false,
          },
        ],
        corrections: [],
        auditLog: [
          {
            id: 'AUD-405',
            timestamp: '2026-11-17T08:21:00',
            actor: 'System Scheduler',
            role: 'administrator',
            action: 'Overdue Notice Generated',
            detail: 'Grace period (20 min) elapsed with 1/4 mandatory screens verified.',
          },
        ],
        recipeId: em03.approvedRecipeId,
        createdAt: '2026-11-17T07:45:00',
        isImmutableHistorical: false,
      };
    })(),

    // Today 2026-11-17 06:00 KM-004 (MISSED — zero captures, logged for compliance only)
    (() => {
      const screens = buildScreensForMachine(km04, {});
      const comp = computeSessionCompletion(screens);
      return {
        id: generateSessionId(km04.code, '2026-11-17', '06:00'),
        machineId: km04.id,
        machineName: km04.name,
        controllerModel: km04.controllerModel,
        product: km04.currentProduct,
        mold: km04.currentMold,
        shift: 'Shift A (06:00–14:00)',
        scheduledDate: '2026-11-17',
        scheduledTime: '06:00',
        scheduledAtIso: '2026-11-17T06:00:00',
        gracePeriodMinutes: 20,
        assignedOperator: 'Priya Nair',
        status: 'missed',
        complianceState: comp.complianceState,
        completionPercent: 0,
        screens,
        alarms: [
          {
            id: 'ALM-OVR-KM004',
            timestamp: '2026-11-17T08:00:00',
            severity: 'warning',
            type: 'overdue',
            message: 'Missed monitoring session recorded for KraussMaffei KM04 (Operator: Priya Nair). Logged as missed compliance check, not a process deviation.',
            acknowledged: false,
          },
        ],
        corrections: [],
        auditLog: [
          {
            id: 'AUD-406',
            timestamp: '2026-11-17T08:00:00',
            actor: 'System Scheduler',
            role: 'administrator',
            action: 'Missed Session Recorded',
            detail: 'Next scheduled slot began before 06:00 session was captured.',
          },
        ],
        recipeId: km04.approvedRecipeId,
        createdAt: '2026-11-17T05:30:00',
        isImmutableHistorical: true,
      };
    })(),

    // Today 2026-11-17 10:00 HM-001 (Scheduled upcoming)
    (() => {
      const screens = buildScreensForMachine(hm01, {});
      return {
        id: generateSessionId(hm01.code, '2026-11-17', '10:00'),
        machineId: hm01.id,
        machineName: hm01.name,
        controllerModel: hm01.controllerModel,
        product: hm01.currentProduct,
        mold: hm01.currentMold,
        shift: 'Shift A (06:00–14:00)',
        scheduledDate: '2026-11-17',
        scheduledTime: '10:00',
        scheduledAtIso: '2026-11-17T10:00:00',
        gracePeriodMinutes: 20,
        assignedOperator: 'Marcus Chen',
        status: 'scheduled',
        complianceState: 'pending',
        completionPercent: 0,
        screens,
        alarms: [],
        corrections: [],
        auditLog: [],
        recipeId: hm01.approvedRecipeId,
        createdAt: '2026-11-17T06:00:00',
        isImmutableHistorical: false,
      };
    })(),

    // Today 2026-11-17 12:00 HM-001 (Scheduled upcoming)
    (() => {
      const screens = buildScreensForMachine(hm01, {});
      return {
        id: generateSessionId(hm01.code, '2026-11-17', '12:00'),
        machineId: hm01.id,
        machineName: hm01.name,
        controllerModel: hm01.controllerModel,
        product: hm01.currentProduct,
        mold: hm01.currentMold,
        shift: 'Shift A (06:00–14:00)',
        scheduledDate: '2026-11-17',
        scheduledTime: '12:00',
        scheduledAtIso: '2026-11-17T12:00:00',
        gracePeriodMinutes: 20,
        assignedOperator: 'Marcus Chen',
        status: 'scheduled',
        complianceState: 'pending',
        completionPercent: 0,
        screens,
        alarms: [],
        corrections: [],
        auditLog: [],
        recipeId: hm01.approvedRecipeId,
        createdAt: '2026-11-17T06:00:00',
        isImmutableHistorical: false,
      };
    })(),
  ];

  return sessions;
}

export function createInitialAppState(): MonitoringAppState {
  return {
    scheduleConfig: {
      intervalHours: 2,
      gracePeriodMinutes: 20,
      shifts: [
        { id: 'SH-A', name: 'Shift A (Day)', startTime: '06:00', endTime: '14:00', active: true },
        { id: 'SH-B', name: 'Shift B (Afternoon)', startTime: '14:00', endTime: '22:00', active: true },
        { id: 'SH-C', name: 'Shift C (Night)', startTime: '22:00', endTime: '06:00', active: false },
      ],
      timeSlots: ['06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'],
      updatedBy: 'Dr. Sarah Lindqvist',
      updatedAt: '2026-11-17T05:30:00',
    },
    machines: INITIAL_MACHINES,
    recipes: INITIAL_RECIPES,
    screenTemplates: INITIAL_SCREEN_TEMPLATES,
    sessions: createInitialSessions(),
  };
}
