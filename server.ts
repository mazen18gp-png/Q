import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { createInitialAppState } from './src/data/seedData.ts';
import type {
  AlarmRecord,
  AuditEvent,
  ExtractedReading,
  MonitoringAppState,
  MonitoringSession,
  ScreenCaptureRecord,
  UserRole,
} from './src/types/monitoring.ts';
import {
  canCaptureScreen,
  computeSessionCompletion,
  evaluateReadingDeviation,
  extractReadingMap,
  generateSessionId,
  generateTimeSlotsFromShifts,
} from './src/utils/monitoringLogic.ts';

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'monitoring-store.json');

function loadState(): MonitoringAppState {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    const initial = createInitialAppState();
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(raw) as MonitoringAppState;
  } catch {
    const initial = createInitialAppState();
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
}

function saveState(state: MonitoringAppState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
  fs.renameSync(tmpPath, DB_PATH);
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function resolveImageToBase64(imageDataUrl?: string, imageUrl?: string): { mimeType: string; data: string } | null {
  if (imageDataUrl && imageDataUrl.startsWith('data:')) {
    const match = /^data:([^;]+);base64,(.+)$/.exec(imageDataUrl);
    if (match) {
      return { mimeType: match[1], data: match[2] };
    }
  }
  if (imageUrl && imageUrl.startsWith('/src/assets/images/')) {
    const safeRel = imageUrl.replace(/^\//, '');
    const resolved = path.resolve(process.cwd(), safeRel);
    const allowedDir = path.resolve(process.cwd(), 'src/assets/images');
    if (resolved.startsWith(allowedDir) && fs.existsSync(resolved)) {
      const buf = fs.readFileSync(resolved);
      const ext = path.extname(resolved).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
      return { mimeType, data: buf.toString('base64') };
    }
  }
  return null;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  let state = loadState();

  app.get('/api/state', (_req, res) => {
    res.json(state);
  });

  app.post('/api/sessions', (req, res) => {
    const { machineId, scheduledDate, scheduledTime, assignedOperator, shift } = req.body as {
      machineId: string;
      scheduledDate: string;
      scheduledTime: string;
      assignedOperator?: string;
      shift?: string;
    };

    const machine = state.machines.find((m) => m.id === machineId);
    if (!machine) {
      res.status(404).json({ error: 'Machine not found.' });
      return;
    }

    const id = generateSessionId(machine.code, scheduledDate, scheduledTime);
    if (state.sessions.some((s) => s.id === id)) {
      res.status(409).json({ error: `Session ${id} already exists.` });
      return;
    }

    const recipe = state.recipes.find((r) => r.id === machine.approvedRecipeId);
    const screens: ScreenCaptureRecord[] = machine.requiredScreenIds
      .map((screenId, idx): ScreenCaptureRecord | null => {
        const tmpl = state.screenTemplates.find((t) => t.id === screenId);
        if (!tmpl) return null;
        return {
          screenId: tmpl.id,
          screenName: tmpl.name,
          order: idx + 1,
          mandatory: true,
          status: 'pending',
          ocrStatus: 'idle',
          retakeCount: 0,
          readings: tmpl.expectedParameters.map((p) => {
            const recParam = recipe?.parameters[p.key];
            return {
              key: p.key,
              label: p.label,
              unit: p.unit,
              extractedValue: null,
              verifiedValue: null,
              approvedTarget: recParam?.target ?? p.targetValue,
              toleranceMin: recParam?.min ?? p.toleranceMin,
              toleranceMax: recParam?.max ?? p.toleranceMax,
              ocrConfidence: 0,
              manuallyCorrected: false,
              verified: false,
              deviationFlag: 'none',
            };
          }),
        };
      })
      .filter((s): s is ScreenCaptureRecord => s !== null);

    const nowIso = new Date().toISOString().slice(0, 19);
    const newSession: MonitoringSession = {
      id,
      machineId: machine.id,
      machineName: machine.name,
      controllerModel: machine.controllerModel,
      product: machine.currentProduct,
      mold: machine.currentMold,
      shift: shift || machine.shift,
      scheduledDate,
      scheduledTime,
      scheduledAtIso: `${scheduledDate}T${scheduledTime}:00`,
      gracePeriodMinutes: state.scheduleConfig.gracePeriodMinutes,
      assignedOperator: assignedOperator || machine.assignedOperator,
      status: 'in_progress',
      complianceState: 'pending',
      completionPercent: 0,
      screens,
      alarms: [],
      corrections: [],
      auditLog: [
        {
          id: `AUD-${Date.now()}`,
          timestamp: nowIso,
          actor: assignedOperator || machine.assignedOperator,
          role: 'operator',
          action: 'Session Started',
          detail: `Started multi-screen monitoring session for ${machine.name}.`,
        },
      ],
      recipeId: machine.approvedRecipeId,
      createdAt: nowIso,
      isImmutableHistorical: false,
    };

    state.sessions.unshift(newSession);
    saveState(state);
    res.status(201).json(newSession);
  });

  app.post('/api/sessions/:id/screens/:screenId/verify', (req, res) => {
    const { id, screenId } = req.params;
    const {
      imageUrl,
      imageDataUrl,
      readings,
      actor,
      role,
      isRetake,
      notes,
    } = req.body as {
      imageUrl?: string;
      imageDataUrl?: string;
      readings: ExtractedReading[];
      actor: string;
      role: UserRole;
      isRetake?: boolean;
      notes?: string;
    };

    const sessionIdx = state.sessions.findIndex((s) => s.id === id);
    if (sessionIdx === -1) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }

    const session = state.sessions[sessionIdx];
    if (session.isImmutableHistorical) {
      res.status(409).json({
        error: 'Historical session is immutable and cannot be overwritten.',
      });
      return;
    }

    const guard = canCaptureScreen(session.screens, screenId, Boolean(isRetake));
    if (!guard.allowed) {
      res.status(409).json({ error: guard.reason });
      return;
    }

    const screenIdx = session.screens.findIndex((sc) => sc.screenId === screenId);
    if (screenIdx === -1) {
      res.status(404).json({ error: 'Screen not found in session.' });
      return;
    }

    const hasPhoto = Boolean(imageUrl || imageDataUrl);
    if (!hasPhoto) {
      res.status(400).json({ error: 'Photograph evidence is required before verification.' });
      return;
    }

    const nowIso = new Date().toISOString().slice(0, 19);
    const recipe = state.recipes.find((r) => r.id === session.recipeId);
    const completedHistory = state.sessions
      .filter(
        (s) =>
          s.machineId === session.machineId &&
          s.id !== session.id &&
          s.status === 'completed'
      )
      .sort((a, b) => a.scheduledAtIso.localeCompare(b.scheduledAtIso));
    const prevSession = completedHistory.length > 0 ? completedHistory[completedHistory.length - 1] : null;
    const prevMap = prevSession ? extractReadingMap(prevSession) : {};

    const newCorrections: AuditEvent[] = [];
    const newAlarms: AlarmRecord[] = [];

    const evaluatedReadings: ExtractedReading[] = readings.map((r) => {
      const recTarget = recipe?.parameters[r.key]?.target;
      const recentVals = completedHistory
        .map((hs) => extractReadingMap(hs)[r.key])
        .filter((v): v is number => v !== null && v !== undefined);

      const deviationFlag = r.verified
        ? evaluateReadingDeviation(r, prevMap[r.key], recentVals, recTarget)
        : 'none';

      if (r.manuallyCorrected) {
        newCorrections.push({
          id: `COR-${Date.now()}-${r.key}`,
          timestamp: nowIso,
          actor: actor || session.assignedOperator,
          role: role || 'operator',
          action: 'OCR Reading Corrected',
          detail: `${r.label}: OCR ${r.extractedValue ?? 'N/A'} ${r.unit} corrected to ${r.verifiedValue} ${r.unit}${r.correctionReason ? ` (${r.correctionReason})` : ''}`,
        });
      }

      if (deviationFlag !== 'none') {
        newAlarms.push({
          id: `ALM-${Date.now()}-${r.key}`,
          timestamp: nowIso,
          severity:
            deviationFlag === 'unauthorized_recipe' || deviationFlag === 'sudden_change'
              ? 'critical'
              : 'warning',
          type: deviationFlag,
          parameterKey: r.key,
          message: `${r.label} (${r.verifiedValue} ${r.unit}) triggered ${deviationFlag.replace(/_/g, ' ')} against approved target ${r.approvedTarget} ${r.unit}.`,
          acknowledged: false,
        });
      }

      return {
        ...r,
        deviationFlag,
      };
    });

    const existingScreen = session.screens[screenIdx];
    const allVerified =
      evaluatedReadings.length > 0 &&
      evaluatedReadings.every((r) => r.verified && r.verifiedValue !== null && !Number.isNaN(r.verifiedValue));

    const updatedScreen: ScreenCaptureRecord = {
      ...existingScreen,
      imageUrl: imageUrl ?? existingScreen.imageUrl,
      imageDataUrl: imageDataUrl ?? existingScreen.imageDataUrl,
      capturedAt: nowIso,
      capturedBy: actor || session.assignedOperator,
      ocrStatus: 'extracted',
      readings: evaluatedReadings,
      status: allVerified ? 'completed' : 'captured_unverified',
      retakeCount: isRetake ? existingScreen.retakeCount + 1 : existingScreen.retakeCount,
      notes: notes ?? existingScreen.notes,
    };

    const updatedScreens = [...session.screens];
    updatedScreens[screenIdx] = updatedScreen;

    const completion = computeSessionCompletion(updatedScreens);
    const filteredOldAlarms = session.alarms.filter(
      (a) => !evaluatedReadings.some((er) => er.key === a.parameterKey)
    );

    const updatedSession: MonitoringSession = {
      ...session,
      screens: updatedScreens,
      completionPercent: completion.completionPercent,
      complianceState: completion.complianceState,
      status: session.status === 'scheduled' ? 'in_progress' : session.status,
      alarms: [...filteredOldAlarms, ...newAlarms],
      corrections: [...session.corrections, ...newCorrections],
      auditLog: [
        ...session.auditLog,
        {
          id: `AUD-${Date.now()}`,
          timestamp: nowIso,
          actor: actor || session.assignedOperator,
          role: role || 'operator',
          action: isRetake
            ? 'Screen Photo Retaken'
            : allVerified
              ? 'Screen Verified'
              : 'Screen Captured (Unverified)',
          detail: `${updatedScreen.screenName} ${allVerified ? 'verified and marked completed' : 'saved with unverified readings'}.`,
        },
      ],
    };

    state.sessions[sessionIdx] = updatedSession;
    saveState(state);
    res.json(updatedSession);
  });

  app.post('/api/sessions/:id/screens/additional', (req, res) => {
    const { id } = req.params;
    const { templateId, customName, actor, role } = req.body as {
      templateId?: string;
      customName?: string;
      actor?: string;
      role?: UserRole;
    };

    const sessionIdx = state.sessions.findIndex((s) => s.id === id);
    if (sessionIdx === -1) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }

    const session = state.sessions[sessionIdx];
    if (session.isImmutableHistorical) {
      res.status(409).json({ error: 'Historical session is immutable.' });
      return;
    }

    const template = templateId
      ? state.screenTemplates.find((t) => t.id === templateId)
      : undefined;
    const nextOrder = session.screens.length + 1;
    const newScreenId = template
      ? `${template.id}-ADD-${Date.now()}`
      : `SCR-ADD-${Date.now()}`;

    const newScreen: ScreenCaptureRecord = {
      screenId: newScreenId,
      screenName: customName?.trim() || template?.name || `Additional Parameter Screen ${nextOrder}`,
      order: nextOrder,
      mandatory: false,
      isAdditional: true,
      status: 'pending',
      ocrStatus: 'idle',
      retakeCount: 0,
      readings: (template?.expectedParameters ?? [
        {
          key: `aux_param_${nextOrder}`,
          label: 'Auxiliary Reading',
          unit: 'bar',
          targetValue: 50,
          toleranceMin: 45,
          toleranceMax: 55,
        },
      ]).map((p) => ({
        key: p.key,
        label: p.label,
        unit: p.unit,
        extractedValue: null,
        verifiedValue: null,
        approvedTarget: p.targetValue,
        toleranceMin: p.toleranceMin,
        toleranceMax: p.toleranceMax,
        ocrConfidence: 0,
        manuallyCorrected: false,
        verified: false,
        deviationFlag: 'none',
      })),
    };

    const nowIso = new Date().toISOString().slice(0, 19);
    const updatedScreens = [...session.screens, newScreen];
    const updatedSession: MonitoringSession = {
      ...session,
      screens: updatedScreens,
      auditLog: [
        ...session.auditLog,
        {
          id: `AUD-${Date.now()}`,
          timestamp: nowIso,
          actor: actor || session.assignedOperator,
          role: role || 'operator',
          action: 'Additional Screen Added',
          detail: `Added supplementary screen "${newScreen.screenName}".`,
        },
      ],
    };

    state.sessions[sessionIdx] = updatedSession;
    saveState(state);
    res.status(201).json(updatedSession);
  });

  app.post('/api/sessions/:id/finalize', (req, res) => {
    const { id } = req.params;
    const { actor, role } = req.body as { actor?: string; role?: UserRole };

    const sessionIdx = state.sessions.findIndex((s) => s.id === id);
    if (sessionIdx === -1) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }

    const session = state.sessions[sessionIdx];
    if (session.isImmutableHistorical) {
      res.status(409).json({ error: 'Session is already finalized and locked.' });
      return;
    }

    const completion = computeSessionCompletion(session.screens);
    if (!completion.isFullyCompleted) {
      res.status(400).json({
        error: `Cannot finalize session: ${completion.missingPhotosCount} mandatory photo(s) missing and ${completion.unverifiedReadingsCount} unverified reading(s) remain.`,
      });
      return;
    }

    const nowIso = new Date().toISOString().slice(0, 19);
    const updatedSession: MonitoringSession = {
      ...session,
      status: 'completed',
      completionPercent: 100,
      complianceState: completion.complianceState,
      completedAt: nowIso,
      isImmutableHistorical: true,
      auditLog: [
        ...session.auditLog,
        {
          id: `AUD-${Date.now()}`,
          timestamp: nowIso,
          actor: actor || session.assignedOperator,
          role: role || 'operator',
          action: 'Session Finalized & Locked',
          detail: `Completed with compliance state: ${completion.complianceState}. Historical record sealed.`,
        },
      ],
    };

    state.sessions[sessionIdx] = updatedSession;
    saveState(state);
    res.json(updatedSession);
  });

  app.post('/api/sessions/:id/alarms/:alarmId/acknowledge', (req, res) => {
    const { id, alarmId } = req.params;
    const { actor, role } = req.body as { actor?: string; role?: UserRole };
    const sessionIdx = state.sessions.findIndex((s) => s.id === id);
    if (sessionIdx === -1) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }
    const session = state.sessions[sessionIdx];
    const nowIso = new Date().toISOString().slice(0, 19);
    const updated: MonitoringSession = {
      ...session,
      alarms: session.alarms.map((a) =>
        a.id === alarmId ? { ...a, acknowledged: true } : a
      ),
      auditLog: [
        ...session.auditLog,
        {
          id: `AUD-${Date.now()}`,
          timestamp: nowIso,
          actor: actor || 'Engineering Lead',
          role: role || 'administrator',
          action: 'Alarm Acknowledged',
          detail: `Acknowledged alarm ${alarmId}.`,
        },
      ],
    };
    state.sessions[sessionIdx] = updated;
    saveState(state);
    res.json(updated);
  });

  app.put('/api/config/schedule', (req, res) => {
    const { intervalHours, gracePeriodMinutes, shifts, updatedBy } = req.body as {
      intervalHours: number;
      gracePeriodMinutes: number;
      shifts: MonitoringAppState['scheduleConfig']['shifts'];
      updatedBy?: string;
    };

    const timeSlots = generateTimeSlotsFromShifts(intervalHours, shifts);
    const nowIso = new Date().toISOString().slice(0, 19);

    state.scheduleConfig = {
      intervalHours,
      gracePeriodMinutes,
      shifts,
      timeSlots,
      updatedBy: updatedBy || 'Plant Administrator',
      updatedAt: nowIso,
    };

    // Update grace period on unstarted scheduled sessions
    state.sessions = state.sessions.map((s) =>
      s.status === 'scheduled' && !s.isImmutableHistorical
        ? { ...s, gracePeriodMinutes }
        : s
    );

    saveState(state);
    res.json(state.scheduleConfig);
  });

  app.put('/api/config/machines/:machineId', (req, res) => {
    const { machineId } = req.params;
    const { requiredScreenIds, assignedOperator, currentProduct, currentMold } = req.body as {
      requiredScreenIds: string[];
      assignedOperator?: string;
      currentProduct?: string;
      currentMold?: string;
    };

    const idx = state.machines.findIndex((m) => m.id === machineId);
    if (idx === -1) {
      res.status(404).json({ error: 'Machine not found.' });
      return;
    }

    state.machines[idx] = {
      ...state.machines[idx],
      requiredScreenIds,
      assignedOperator: assignedOperator ?? state.machines[idx].assignedOperator,
      currentProduct: currentProduct ?? state.machines[idx].currentProduct,
      currentMold: currentMold ?? state.machines[idx].currentMold,
    };

    saveState(state);
    res.json(state.machines[idx]);
  });

  // Gemini Vision OCR Extraction Route (Server-Side Only)
  app.post('/api/ocr/extract', async (req, res) => {
    const { imageDataUrl, imageUrl, expectedParameters, screenName } = req.body as {
      imageDataUrl?: string;
      imageUrl?: string;
      screenName: string;
      expectedParameters: { key: string; label: string; unit: string }[];
    };

    const imagePart = resolveImageToBase64(imageDataUrl, imageUrl);
    if (!imagePart) {
      res.status(400).json({ error: 'Valid HMI screen image data is required for extraction.' });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured in Secrets. Configure it to enable automated Vision OCR, or enter/verify values manually below.',
      });
      return;
    }

    try {
      const paramListText = expectedParameters
        .map((p) => `- key: "${p.key}", label: "${p.label}", unit: "${p.unit}"`)
        .join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: imagePart.mimeType,
                data: imagePart.data,
              },
            },
            {
              text: `You are an industrial HMI optical parameter reader inspecting a photograph of "${screenName}".
Extract the ACTUAL numeric value visible on the controller screen for each parameter below. Return confidence (0 to 1). If a parameter is not clearly visible on the screen, set found to false and extractedValue to 0.
Parameters:
${paramListText}`,
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              readings: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    key: { type: Type.STRING },
                    extractedValue: { type: Type.NUMBER },
                    confidence: { type: Type.NUMBER },
                    found: { type: Type.BOOLEAN },
                  },
                },
              },
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{"readings":[]}').trim()) as {
        readings: { key: string; extractedValue: number; confidence: number; found: boolean }[];
      };

      res.json({ readings: parsed.readings ?? [] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Vision OCR request failed.';
      res.status(502).json({ error: `Vision OCR error: ${message}` });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist/index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MoldWatch server listening on http://localhost:${PORT}`);
  });
}

startServer();
