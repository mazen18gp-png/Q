import { useCallback, useEffect, useMemo, useState } from 'react';
import { Menu } from 'lucide-react';
import type {
  ExtractedReading,
  MonitoringAppState,
  MonitoringSession,
  ShiftDefinition,
  UserRole,
} from './types/monitoring';
import { Sidebar, type ActiveView } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { GuidedCaptureView } from './components/GuidedCaptureView';
import { ComparisonView } from './components/ComparisonView';
import { HistoryArchiveView } from './components/HistoryArchiveView';
import { ScheduleConfigView } from './components/ScheduleConfigView';

const REFERENCE_PLANT_TIME_ISO = '2026-11-17T08:35:00';

export default function App() {
  const [appState, setAppState] = useState<MonitoringAppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [role, setRole] = useState<UserRole>('operator');
  const [activeCaptureSessionId, setActiveCaptureSessionId] = useState<string | null>(
    'HM-001-20261117-0800'
  );
  const [activeCompareSessionId, setActiveCompareSessionId] = useState<string | null>(
    'HM-001-20261117-0600'
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const fetchState = useCallback(async () => {
    try {
      const resp = await fetch('/api/state');
      if (!resp.ok) {
        throw new Error('Failed to load monitoring data.');
      }
      const data = (await resp.json()) as MonitoringAppState;
      setAppState(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to connect to monitoring server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  const overdueCount = useMemo(() => {
    if (!appState) return 0;
    return appState.sessions.filter(
      (s) => s.status === 'overdue' || s.status === 'missed'
    ).length;
  }, [appState]);

  const nextActionableSession = useMemo(() => {
    if (!appState) return null;
    return (
      appState.sessions.find((s) => s.status === 'in_progress') ??
      appState.sessions.find((s) => s.status === 'overdue') ??
      appState.sessions.find((s) => s.status === 'scheduled') ??
      null
    );
  }, [appState]);

  const handleOpenCapture = (sessionId: string) => {
    setActiveCaptureSessionId(sessionId);
    setActiveView('capture');
  };

  const handleOpenComparison = (sessionId: string) => {
    setActiveCompareSessionId(sessionId);
    setActiveView('compare');
  };

  const replaceSessionInState = (updated: MonitoringSession) => {
    setAppState((prev) => {
      if (!prev) return prev;
      const exists = prev.sessions.some((s) => s.id === updated.id);
      return {
        ...prev,
        sessions: exists
          ? prev.sessions.map((s) => (s.id === updated.id ? updated : s))
          : [updated, ...prev.sessions],
      };
    });
  };

  const handleStartNewSession = async (payload: {
    machineId: string;
    scheduledDate: string;
    scheduledTime: string;
  }) => {
    const resp = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await resp.json()) as MonitoringSession & { error?: string };
    if (!resp.ok) {
      throw new Error(data.error || 'Failed to create monitoring session.');
    }
    replaceSessionInState(data);
    setActiveCaptureSessionId(data.id);
    setActiveView('capture');
  };

  const handleVerifyScreen = async (
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
  ): Promise<MonitoringSession> => {
    const resp = await fetch(`/api/sessions/${sessionId}/screens/${screenId}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await resp.json()) as MonitoringSession & { error?: string };
    if (!resp.ok) {
      throw new Error(data.error || 'Failed to verify screen.');
    }
    replaceSessionInState(data);
    return data;
  };

  const handleAddAdditionalScreen = async (
    sessionId: string,
    payload: { templateId?: string; customName?: string; actor: string; role: UserRole }
  ): Promise<MonitoringSession> => {
    const resp = await fetch(`/api/sessions/${sessionId}/screens/additional`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await resp.json()) as MonitoringSession & { error?: string };
    if (!resp.ok) {
      throw new Error(data.error || 'Failed to add supplementary screen.');
    }
    replaceSessionInState(data);
    return data;
  };

  const handleFinalizeSession = async (
    sessionId: string,
    payload: { actor: string; role: UserRole }
  ): Promise<MonitoringSession> => {
    const resp = await fetch(`/api/sessions/${sessionId}/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await resp.json()) as MonitoringSession & { error?: string };
    if (!resp.ok) {
      throw new Error(data.error || 'Failed to finalize session.');
    }
    replaceSessionInState(data);
    return data;
  };

  const handleAcknowledgeAlarm = async (sessionId: string, alarmId: string) => {
    const resp = await fetch(`/api/sessions/${sessionId}/alarms/${alarmId}/acknowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: role === 'administrator' ? 'Dr. Sarah Lindqvist' : 'Marcus Chen',
        role,
      }),
    });
    if (resp.ok) {
      const updated = (await resp.json()) as MonitoringSession;
      replaceSessionInState(updated);
    }
  };

  const handleSaveSchedule = async (payload: {
    intervalHours: number;
    gracePeriodMinutes: number;
    shifts: ShiftDefinition[];
    updatedBy: string;
  }) => {
    const resp = await fetch('/api/config/schedule', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (resp.ok) {
      await fetchState();
    }
  };

  const handleSaveMachineScreens = async (
    machineId: string,
    payload: {
      requiredScreenIds: string[];
      assignedOperator: string;
      currentProduct: string;
      currentMold: string;
    }
  ) => {
    const resp = await fetch(`/api/config/machines/${machineId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (resp.ok) {
      await fetchState();
    }
  };

  const viewTitles: Record<ActiveView, string> = {
    dashboard: 'Monitoring Dashboard',
    capture: 'Guided Multi-Screen Capture',
    compare: 'Session Comparison & Drift Analysis',
    history: 'Historical Traceability Archive',
    schedule: 'Schedule & Machine Configuration',
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <Sidebar
        activeView={activeView}
        onSelectView={setActiveView}
        role={role}
        onChangeRole={setRole}
        overdueCount={overdueCount}
        activeCaptureSessionId={activeCaptureSessionId}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb on left, 1 primary action on right */}
        <header className="sticky top-0 z-20 h-14 bg-white border-b border-slate-200 px-5 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="p-1.5 text-slate-600 hover:text-slate-900 lg:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="text-slate-500 hidden sm:inline">Plant Floor</span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">/</span>
              <h1 className="font-semibold text-slate-900 truncate">
                {viewTitles[activeView]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {nextActionableSession && (
              <button
                type="button"
                onClick={() => handleOpenCapture(nextActionableSession.id)}
                className="px-3.5 py-2 text-xs font-medium bg-blue-700 text-white rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
              >
                {nextActionableSession.status === 'in_progress'
                  ? `Resume ${nextActionableSession.id}`
                  : `Start ${nextActionableSession.id}`}
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-5 lg:p-6 max-w-[1440px] w-full mx-auto">
          {loading ? (
            <div className="space-y-4">
              <div className="h-24 bg-white border border-slate-200 rounded-lg animate-pulse" />
              <div className="h-80 bg-white border border-slate-200 rounded-lg animate-pulse" />
            </div>
          ) : loadError || !appState ? (
            <div className="bg-white border border-red-200 rounded-lg p-6 text-center space-y-3">
              <p className="text-sm font-medium text-red-700">
                {loadError || 'Unable to load monitoring workspace.'}
              </p>
              <button
                type="button"
                onClick={fetchState}
                className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-md"
              >
                Retry Connection
              </button>
            </div>
          ) : (
            <>
              {activeView === 'dashboard' && (
                <DashboardView
                  sessions={appState.sessions}
                  machines={appState.machines}
                  scheduleConfig={appState.scheduleConfig}
                  referenceTimeIso={REFERENCE_PLANT_TIME_ISO}
                  onOpenCapture={handleOpenCapture}
                  onStartNewSession={handleStartNewSession}
                  onOpenComparison={handleOpenComparison}
                />
              )}

              {activeView === 'capture' && (
                <GuidedCaptureView
                  sessions={appState.sessions}
                  activeSessionId={activeCaptureSessionId}
                  onSelectSession={setActiveCaptureSessionId}
                  recipes={appState.recipes}
                  screenTemplates={appState.screenTemplates}
                  role={role}
                  onVerifyScreen={handleVerifyScreen}
                  onAddAdditionalScreen={handleAddAdditionalScreen}
                  onFinalizeSession={handleFinalizeSession}
                />
              )}

              {activeView === 'compare' && (
                <ComparisonView
                  sessions={appState.sessions}
                  recipes={appState.recipes}
                  initialSessionId={activeCompareSessionId}
                />
              )}

              {activeView === 'history' && (
                <HistoryArchiveView
                  sessions={appState.sessions}
                  recipes={appState.recipes}
                  role={role}
                  onAcknowledgeAlarm={handleAcknowledgeAlarm}
                />
              )}

              {activeView === 'schedule' && (
                <ScheduleConfigView
                  role={role}
                  onSwitchToAdmin={() => setRole('administrator')}
                  scheduleConfig={appState.scheduleConfig}
                  machines={appState.machines}
                  screenTemplates={appState.screenTemplates}
                  onSaveSchedule={handleSaveSchedule}
                  onSaveMachineScreens={handleSaveMachineScreens}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
