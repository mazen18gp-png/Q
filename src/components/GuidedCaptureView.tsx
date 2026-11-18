import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Lock,
  Plus,
  RotateCcw,
  ScanText,
  Upload,
} from 'lucide-react';
import type {
  ApprovedRecipe,
  ExtractedReading,
  MonitoringSession,
  ScreenCaptureRecord,
  ScreenTemplate,
  UserRole,
} from '../types/monitoring';
import {
  computeSessionCompletion,
  getNextPendingScreenId,
} from '../utils/monitoringLogic';
import { ComplianceLabel, DeviationFlagLabel } from './StatusText';

interface GuidedCaptureViewProps {
  sessions: MonitoringSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  recipes: ApprovedRecipe[];
  screenTemplates: ScreenTemplate[];
  role: UserRole;
  onVerifyScreen: (
    sessionId: string,
    screenId: string,
    payload: {
      imageUrl?: string;
      imageDataUrl?: string;
      readings: ExtractedReading[];
      actor: string;
      role: UserRole;
      isRetake: boolean;
      notes?: string;
    }
  ) => Promise<MonitoringSession>;
  onAddAdditionalScreen: (
    sessionId: string,
    payload: { templateId?: string; customName?: string; actor: string; role: UserRole }
  ) => Promise<MonitoringSession>;
  onFinalizeSession: (
    sessionId: string,
    payload: { actor: string; role: UserRole }
  ) => Promise<MonitoringSession>;
}

export function GuidedCaptureView({
  sessions,
  activeSessionId,
  onSelectSession,
  recipes,
  screenTemplates,
  role,
  onVerifyScreen,
  onAddAdditionalScreen,
  onFinalizeSession,
}: GuidedCaptureViewProps) {
  const capturableSessions = useMemo(
    () => sessions.filter((s) => s.status !== 'missed'),
    [sessions]
  );

  const selectedSession = useMemo(() => {
    return (
      sessions.find((s) => s.id === activeSessionId) ??
      capturableSessions.find((s) => !s.isImmutableHistorical) ??
      capturableSessions[0] ??
      null
    );
  }, [sessions, activeSessionId, capturableSessions]);

  const [selectedScreenId, setSelectedScreenId] = useState<string>('');
  const [retakeMode, setRetakeMode] = useState(false);

  // Working draft state for the active screen
  const [draftImageUrl, setDraftImageUrl] = useState<string | undefined>(undefined);
  const [draftImageDataUrl, setDraftImageDataUrl] = useState<string | undefined>(undefined);
  const [draftReadings, setDraftReadings] = useState<ExtractedReading[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Webcam state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Additional screen modal state
  const [showAddScreen, setShowAddScreen] = useState(false);
  const [addTemplateId, setAddTemplateId] = useState<string>(screenTemplates[5]?.id ?? '');
  const [addCustomName, setAddCustomName] = useState('');

  // Select initial pending screen whenever session changes
  useEffect(() => {
    if (!selectedSession) return;
    const nextPending = getNextPendingScreenId(selectedSession.screens);
    const fallback = selectedSession.screens[0]?.screenId ?? '';
    setSelectedScreenId(nextPending ?? fallback);
    setRetakeMode(false);
    setOcrError(null);
    setSaveError(null);
    setStatusNotice(null);
  }, [selectedSession?.id]);

  const activeScreen: ScreenCaptureRecord | null = useMemo(() => {
    if (!selectedSession) return null;
    return (
      selectedSession.screens.find((sc) => sc.screenId === selectedScreenId) ??
      selectedSession.screens[0] ??
      null
    );
  }, [selectedSession, selectedScreenId]);

  // Sync draft state when active screen changes
  useEffect(() => {
    if (!activeScreen) return;
    setDraftImageUrl(activeScreen.imageUrl);
    setDraftImageDataUrl(activeScreen.imageDataUrl);
    setDraftReadings(activeScreen.readings.map((r) => ({ ...r })));
    setOcrError(null);
    setSaveError(null);
    setRetakeMode(false);
  }, [selectedSession?.id, activeScreen?.screenId]);

  // Cleanup webcam stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  if (!selectedSession || !activeScreen) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
        <p className="text-sm font-medium text-slate-800">No monitoring sessions available.</p>
      </div>
    );
  }

  const recipe = recipes.find((r) => r.id === selectedSession.recipeId);
  const completion = computeSessionCompletion(selectedSession.screens);
  const isLockedCompleted =
    activeScreen.status === 'completed' && !retakeMode;
  const isSessionReadOnly = selectedSession.isImmutableHistorical;

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Browser camera access is not available in this context. Use Upload Photo or Load Controller Sample.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setCameraActive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      });
    } catch {
      setCameraError('Camera permission denied or no camera device detected. Please upload a screen photo instead.');
    }
  };

  const captureFromCamera = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setDraftImageDataUrl(dataUrl);
      setDraftImageUrl(undefined);
      stopCamera();
      setStatusNotice('Camera frame captured. Run Parameter Extraction or verify readings below.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setDraftImageDataUrl(reader.result);
        setDraftImageUrl(undefined);
        setStatusNotice(`Loaded photo "${file.name}". Run Parameter Extraction to read screen values.`);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleLoadControllerSample = () => {
    const matchingTemplate =
      screenTemplates.find((t) => activeScreen.screenId.startsWith(t.id)) ??
      screenTemplates[0];
    setDraftImageUrl(matchingTemplate.sampleImageUrl);
    setDraftImageDataUrl(undefined);
    setStatusNotice(`Captured controller screen photo for ${activeScreen.screenName}.`);
  };

  const handleRunOcr = async () => {
    if (!draftImageUrl && !draftImageDataUrl) {
      setOcrError('Please capture or upload a photograph of this HMI screen first.');
      return;
    }
    setExtracting(true);
    setOcrError(null);
    setStatusNotice(null);

    try {
      const resp = await fetch('/api/ocr/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: draftImageUrl,
          imageDataUrl: draftImageDataUrl,
          screenName: activeScreen.screenName,
          expectedParameters: draftReadings.map((r) => ({
            key: r.key,
            label: r.label,
            unit: r.unit,
          })),
        }),
      });

      const data = (await resp.json()) as {
        error?: string;
        readings?: { key: string; extractedValue: number; confidence: number; found: boolean }[];
      };

      if (!resp.ok) {
        setOcrError(data.error || 'Vision OCR extraction failed.');
        return;
      }

      const extractedMap = new Map(
        (data.readings ?? []).map((item) => [item.key, item])
      );

      setDraftReadings((prev) =>
        prev.map((r) => {
          const hit = extractedMap.get(r.key);
          if (!hit || !hit.found) return r;
          return {
            ...r,
            extractedValue: hit.extractedValue,
            verifiedValue: hit.extractedValue,
            ocrConfidence: hit.confidence ?? 0.92,
            manuallyCorrected: false,
            verified: false,
          };
        })
      );
      setStatusNotice('OCR extraction complete. Review every value against approved tolerances and confirm.');
    } catch {
      setOcrError('Network error reaching Vision OCR service.');
    } finally {
      setExtracting(false);
    }
  };

  const handleReadingChange = (key: string, valueStr: string) => {
    const parsed = valueStr === '' ? null : Number(valueStr);
    setDraftReadings((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const corrected =
          r.extractedValue !== null && parsed !== null && Math.abs(parsed - r.extractedValue) > 0.0001;
        return {
          ...r,
          verifiedValue: parsed,
          manuallyCorrected: corrected || r.manuallyCorrected,
        };
      })
    );
  };

  const handleCorrectionReason = (key: string, reason: string) => {
    setDraftReadings((prev) =>
      prev.map((r) => (r.key === key ? { ...r, correctionReason: reason } : r))
    );
  };

  const handleToggleReadingVerified = (key: string, checked: boolean) => {
    setDraftReadings((prev) =>
      prev.map((r) => (r.key === key ? { ...r, verified: checked } : r))
    );
  };

  const handleVerifyAllReadings = () => {
    setDraftReadings((prev) =>
      prev.map((r) => ({
        ...r,
        verifiedValue: r.verifiedValue ?? r.extractedValue ?? r.approvedTarget,
        extractedValue: r.extractedValue ?? r.approvedTarget,
        verified: true,
      }))
    );
  };

  const handleCompleteScreen = async () => {
    setSaveError(null);
    if (!draftImageUrl && !draftImageDataUrl) {
      setSaveError('A photograph of this HMI screen is mandatory before completing.');
      return;
    }

    const missingValues = draftReadings.some(
      (r) => r.verifiedValue === null || Number.isNaN(r.verifiedValue)
    );
    if (missingValues) {
      setSaveError('All parameter values must be extracted or entered before verification.');
      return;
    }

    const unverified = draftReadings.some((r) => !r.verified);
    if (unverified) {
      setSaveError('Please verify each extracted parameter checkbox (or click Verify All Values).');
      return;
    }

    setSaving(true);
    try {
      const updated = await onVerifyScreen(selectedSession.id, activeScreen.screenId, {
        imageUrl: draftImageUrl,
        imageDataUrl: draftImageDataUrl,
        readings: draftReadings,
        actor: selectedSession.assignedOperator,
        role,
        isRetake: retakeMode,
      });
      setRetakeMode(false);
      const nextId = getNextPendingScreenId(updated.screens);
      if (nextId) {
        setSelectedScreenId(nextId);
        setStatusNotice(`Screen verified. Automatically advanced to next required screen.`);
      } else {
        setStatusNotice('All required screens are completed! You may now finalize this session.');
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save screen verification.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddScreenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await onAddAdditionalScreen(selectedSession.id, {
        templateId: addTemplateId || undefined,
        customName: addCustomName.trim() || undefined,
        actor: selectedSession.assignedOperator,
        role,
      });
      setShowAddScreen(false);
      setAddCustomName('');
      const added = updated.screens[updated.screens.length - 1];
      if (added) {
        setSelectedScreenId(added.screenId);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unable to add screen.');
    }
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    setSaveError(null);
    try {
      await onFinalizeSession(selectedSession.id, {
        actor: selectedSession.assignedOperator,
        role,
      });
      setStatusNotice('Monitoring session finalized and sealed to historical archive.');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Cannot finalize session.');
    } finally {
      setFinalizing(false);
    }
  };

  const activePhotoSrc = draftImageDataUrl || draftImageUrl;

  return (
    <div className="space-y-5">
      {/* Session Selector & Metadata Strip */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="capture-session-select" className="text-xs font-medium text-slate-600">
              Active Session:
            </label>
            <select
              id="capture-session-select"
              value={selectedSession.id}
              onChange={(e) => onSelectSession(e.target.value)}
              className="px-3 py-1.5 text-sm font-mono font-medium bg-white border border-slate-300 rounded-md text-slate-900"
            >
              {capturableSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} · {s.machineName} ({s.completionPercent}%)
                </option>
              ))}
            </select>
            <ComplianceLabel state={selectedSession.complianceState} />
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-slate-500">Session Status</div>
              <div className="text-sm font-semibold font-mono tabular-nums text-slate-900">
                {completion.completionPercent}% completed ({completion.completedMandatoryCount}/
                {completion.totalMandatoryCount} mandatory)
              </div>
            </div>
            {!isSessionReadOnly && (
              <button
                type="button"
                onClick={handleFinalize}
                disabled={!completion.isFullyCompleted || finalizing}
                className="px-4 py-2 text-xs font-medium bg-emerald-700 text-white rounded-md hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-500 transition-colors whitespace-nowrap shrink-0"
              >
                {finalizing ? 'Finalizing...' : 'Finalize Session'}
              </button>
            )}
          </div>
        </div>

        {/* Context Metadata Row (Zero-Pill typographic separators) */}
        <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
          <span>
            <strong className="text-slate-800">Machine:</strong> {selectedSession.machineName}
          </span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span>
            <strong className="text-slate-800">Product:</strong> {selectedSession.product}
          </span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span>
            <strong className="text-slate-800">Mold:</strong> {selectedSession.mold}
          </span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span className="font-mono tabular-nums">
            <strong className="text-slate-800 font-sans">Monitoring Time:</strong> {selectedSession.scheduledTime}
          </span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span>
            <strong className="text-slate-800">Recipe:</strong> {recipe ? `${recipe.name} v${recipe.version}` : selectedSession.recipeId}
          </span>
        </div>

        {!completion.isFullyCompleted && (
          <div className="border-t border-amber-200 bg-amber-50/80 -mx-5 -mb-5 px-5 py-2.5 rounded-b-lg text-xs text-amber-900">
            Compliance Lock: This session cannot be marked compliant or finalized while{' '}
            <span className="font-mono font-semibold">{completion.missingPhotosCount}</span> mandatory screen(s)
            or <span className="font-mono font-semibold">{completion.unverifiedReadingsCount}</span> unverified reading(s) remain.
          </div>
        )}
      </section>

      {/* Main Split Guided Workflow */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Checklist Rail (4 cols) */}
        <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Required Screens Sequence</h2>
            {!isSessionReadOnly && (
              <button
                type="button"
                onClick={() => setShowAddScreen(true)}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                Additional Screen
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-200">
            {selectedSession.screens.map((sc) => {
              const isSelected = sc.screenId === activeScreen.screenId;
              return (
                <button
                  key={sc.screenId}
                  type="button"
                  onClick={() => setSelectedScreenId(sc.screenId)}
                  className={`w-full text-left px-4 py-3 flex items-start justify-between gap-3 transition-colors ${
                    isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-xs font-medium text-slate-900 flex items-center gap-1.5">
                      <span className="font-mono text-slate-500">Screen {sc.order}:</span>
                      <span className="truncate">{sc.screenName}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {sc.mandatory ? 'Mandatory' : 'Additional'} ·{' '}
                      {sc.status === 'completed'
                        ? 'Completed'
                        : sc.status === 'captured_unverified'
                          ? 'Captured (Unverified OCR)'
                          : 'Pending'}
                      {sc.retakeCount > 0 ? ` · ${sc.retakeCount} retake(s)` : ''}
                    </div>
                  </div>
                  <div className="shrink-0 mt-0.5">
                    {sc.status === 'completed' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-label="Completed" />
                    ) : sc.status === 'captured_unverified' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-600" aria-label="Unverified" />
                    ) : (
                      <Clock className="w-4 h-4 text-slate-400" aria-label="Pending" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Right Guided Capture & Verification Workspace (8 cols) */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg p-5 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-200">
            <div>
              <div className="text-xs text-slate-500 font-mono">
                Screen {activeScreen.order} of {selectedSession.screens.length} ·{' '}
                {activeScreen.mandatory ? 'Mandatory Screen' : 'Additional Screen'}
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mt-0.5">
                {activeScreen.screenName}
              </h3>
            </div>

            {activeScreen.status === 'completed' && !isSessionReadOnly && (
              <button
                type="button"
                onClick={() => setRetakeMode((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                {retakeMode ? 'Cancel Retake' : 'Retake Photo'}
              </button>
            )}
          </div>

          {/* Duplicate prevention notice when viewing an already completed screen */}
          {isLockedCompleted && (
            <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-3.5 py-2.5">
              <Lock className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>
                This screen is already verified and locked against accidental duplication. Click{' '}
                <strong>Retake Photo</strong> only if you intentionally want to replace this evidence.
              </span>
            </div>
          )}

          {isSessionReadOnly && (
            <div className="flex items-center gap-2 text-xs text-slate-700 bg-slate-100 border border-slate-200 rounded px-3.5 py-2.5">
              <Lock className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>
                This session has been finalized and sealed in the historical archive. Records are immutable.
              </span>
            </div>
          )}

          {/* Step 1: Photograph Capture Area */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-slate-900">
                1. HMI Screen Photograph
              </h4>
              {!isLockedCompleted && !isSessionReadOnly && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={cameraActive ? stopCamera : startCamera}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-700 rounded hover:bg-slate-50 whitespace-nowrap"
                  >
                    <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                    {cameraActive ? 'Close Camera' : 'Use Camera'}
                  </button>

                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-700 rounded hover:bg-slate-50 cursor-pointer whitespace-nowrap">
                    <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                    Upload Photo
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleFileUpload}
                      className="sr-only"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={handleLoadControllerSample}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded hover:bg-slate-800 whitespace-nowrap"
                  >
                    <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                    Capture Controller Screen
                  </button>
                </div>
              )}
            </div>

            {cameraError && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                {cameraError}
              </p>
            )}

            {cameraActive && (
              <div className="border border-slate-300 rounded-lg overflow-hidden bg-slate-950 p-3 space-y-3">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full max-h-72 object-contain mx-auto rounded"
                />
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={captureFromCamera}
                    className="px-4 py-2 text-xs font-medium bg-blue-700 text-white rounded hover:bg-blue-800"
                  >
                    Snap Frame
                  </button>
                </div>
              </div>
            )}

            {!cameraActive && activePhotoSrc ? (
              <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-950">
                <img
                  src={activePhotoSrc}
                  alt={`${activeScreen.screenName} HMI photograph`}
                  referrerPolicy="no-referrer"
                  className="w-full max-h-56 object-contain mx-auto"
                />
              </div>
            ) : !cameraActive ? (
              <div className="border border-dashed border-slate-300 rounded-lg p-5 text-center bg-slate-50 space-y-1.5">
                <Camera className="w-6 h-6 text-slate-400 mx-auto" aria-hidden="true" />
                <p className="text-xs font-medium text-slate-700">
                  No photograph captured for {activeScreen.screenName} yet.
                </p>
                <p className="text-xs text-slate-500">
                  Use your camera, upload an HMI photo, or click Capture Controller Screen above.
                </p>
              </div>
            ) : null}
          </div>

          {/* Step 2: OCR Extraction */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">
                  2. Extract & Verify Screen Parameters
                </h4>
                <p className="text-xs text-slate-500">
                  Confirm every parameter against approved recipe limits before marking completed.
                </p>
              </div>
              {!isLockedCompleted && !isSessionReadOnly && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRunOcr}
                    disabled={extracting || !activePhotoSrc}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-700 text-white rounded hover:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-500 whitespace-nowrap"
                  >
                    <ScanText className="w-3.5 h-3.5" aria-hidden="true" />
                    {extracting ? 'Extracting via Vision OCR...' : 'Extract Parameters (OCR)'}
                  </button>
                  <button
                    type="button"
                    onClick={handleVerifyAllReadings}
                    className="px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-700 rounded hover:bg-slate-50 whitespace-nowrap"
                  >
                    Verify All Values
                  </button>
                </div>
              )}
            </div>

            {ocrError && (
              <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                {ocrError}
              </div>
            )}
            {statusNotice && (
              <div className="text-xs text-blue-900 bg-blue-50 border border-blue-200 rounded px-3 py-2">
                {statusNotice}
              </div>
            )}

            <div className="overflow-x-auto border border-slate-200 rounded-md">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                    <th className="py-2 px-3">Parameter</th>
                    <th className="py-2 px-3 whitespace-nowrap">Approved Target (Tol)</th>
                    <th className="py-2 px-3 whitespace-nowrap">OCR Extracted</th>
                    <th className="py-2 px-3 whitespace-nowrap">Verified Reading</th>
                    <th className="py-2 px-3 whitespace-nowrap">Status / Correction Note</th>
                    <th className="py-2 px-3 text-center whitespace-nowrap">Verified</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {draftReadings.map((r) => {
                    const outOfRange =
                      r.verifiedValue !== null &&
                      (r.verifiedValue < r.toleranceMin || r.verifiedValue > r.toleranceMax);
                    return (
                      <tr key={r.key} className={outOfRange ? 'bg-red-50/40' : 'bg-white'}>
                        <td className="py-2.5 px-3 font-medium text-slate-900">
                          {r.label}
                          <span className="text-slate-400 ml-1">({r.unit})</span>
                        </td>
                        <td className="py-2.5 px-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                          {r.approvedTarget} ({r.toleranceMin}–{r.toleranceMax})
                        </td>
                        <td className="py-2.5 px-3 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {r.extractedValue !== null ? `${r.extractedValue} ${r.unit}` : '—'}
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="number"
                            step="0.1"
                            aria-label={`Verified value for ${r.label}`}
                            disabled={isLockedCompleted || isSessionReadOnly}
                            value={r.verifiedValue ?? ''}
                            onChange={(e) => handleReadingChange(r.key, e.target.value)}
                            className={`w-24 px-2 py-1 text-xs font-mono tabular-nums border rounded ${
                              outOfRange
                                ? 'border-red-400 bg-red-50 text-red-900'
                                : 'border-slate-300 bg-white text-slate-900'
                            } disabled:bg-slate-100`}
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          {r.deviationFlag !== 'none' ? (
                            <DeviationFlagLabel flag={r.deviationFlag} />
                          ) : outOfRange ? (
                            <span className="text-red-700 font-medium">Out of tolerance</span>
                          ) : (
                            <span className="text-emerald-700">Within tolerance</span>
                          )}
                          {r.manuallyCorrected && !isLockedCompleted && !isSessionReadOnly && (
                            <input
                              type="text"
                              placeholder="Reason for manual correction..."
                              aria-label={`Correction reason for ${r.label}`}
                              value={r.correctionReason ?? ''}
                              onChange={(e) => handleCorrectionReason(r.key, e.target.value)}
                              className="mt-1 block w-full px-2 py-1 text-xs border border-amber-300 rounded bg-amber-50/40"
                            />
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="checkbox"
                            aria-label={`Verify ${r.label}`}
                            disabled={isLockedCompleted || isSessionReadOnly}
                            checked={r.verified}
                            onChange={(e) => handleToggleReadingVerified(r.key, e.target.checked)}
                            className="w-4 h-4 accent-blue-700 cursor-pointer"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {saveError && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                {saveError}
              </p>
            )}

            {!isLockedCompleted && !isSessionReadOnly && (
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCompleteScreen}
                  disabled={saving}
                  className="px-4 py-2 text-xs font-medium bg-blue-700 text-white rounded-md hover:bg-blue-800 disabled:opacity-60 transition-colors"
                >
                  {saving
                    ? 'Saving Verification...'
                    : retakeMode
                      ? 'Save Retaken Screen & Update'
                      : 'Verify & Complete Screen'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Additional Screen Modal */}
      {showAddScreen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-screen-title"
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4">
            <h3 id="add-screen-title" className="text-base font-semibold text-slate-900">
              Add Supplementary Screen
            </h3>
            <form onSubmit={handleAddScreenSubmit} className="space-y-4">
              <div>
                <label htmlFor="add-tmpl" className="block text-xs font-medium text-slate-700 mb-1">
                  Screen Template
                </label>
                <select
                  id="add-tmpl"
                  value={addTemplateId}
                  onChange={(e) => setAddTemplateId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
                >
                  {screenTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                  <option value="">Custom Supplementary Screen</option>
                </select>
              </div>
              <div>
                <label htmlFor="add-custom" className="block text-xs font-medium text-slate-700 mb-1">
                  Custom Screen Name (Optional)
                </label>
                <input
                  id="add-custom"
                  type="text"
                  value={addCustomName}
                  onChange={(e) => setAddCustomName(e.target.value)}
                  placeholder="e.g. Mold Valve Gate Diagnostics"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddScreen(false)}
                  className="px-3.5 py-2 text-xs font-medium border border-slate-300 rounded-md text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-2 text-xs font-medium bg-blue-700 text-white rounded-md hover:bg-blue-800"
                >
                  Add Screen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
