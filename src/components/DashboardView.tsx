import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Plus,
  Search,
} from 'lucide-react';
import type {
  MachineConfig,
  MonitoringSession,
  ScheduleConfig,
} from '../types/monitoring';
import {
  calculateDashboardStats,
  evaluateReminderAndOverdue,
} from '../utils/monitoringLogic';
import { ComplianceLabel, SessionStatusLabel } from './StatusText';

interface DashboardViewProps {
  sessions: MonitoringSession[];
  machines: MachineConfig[];
  scheduleConfig: ScheduleConfig;
  referenceTimeIso: string;
  onOpenCapture: (sessionId: string) => void;
  onStartNewSession: (payload: {
    machineId: string;
    scheduledDate: string;
    scheduledTime: string;
  }) => Promise<void>;
  onOpenComparison: (sessionId: string) => void;
}

type StatusFilter =
  | 'all'
  | 'overdue_missed'
  | 'in_progress'
  | 'completed'
  | 'deviations'
  | 'missing_unverified';

export function DashboardView({
  sessions,
  machines,
  scheduleConfig,
  referenceTimeIso,
  onOpenCapture,
  onStartNewSession,
  onOpenComparison,
}: DashboardViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [shiftFilter, setShiftFilter] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [newMachineId, setNewMachineId] = useState(machines[0]?.id ?? '');
  const [newDate, setNewDate] = useState('2026-11-17');
  const [newTime, setNewTime] = useState(scheduleConfig.timeSlots[2] ?? '10:00');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const stats = useMemo(() => calculateDashboardStats(sessions), [sessions]);

  const reminderItems = useMemo(() => {
    return sessions
      .filter((s) => s.status !== 'completed')
      .map((s) => ({
        session: s,
        evalResult: evaluateReminderAndOverdue(s, referenceTimeIso),
      }))
      .filter(
        (item) =>
          item.session.status === 'overdue' ||
          item.session.status === 'missed' ||
          item.evalResult.state === 'overdue' ||
          item.evalResult.state === 'due_in_grace'
      );
  }, [sessions, referenceTimeIso]);

  const filteredSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sessions
      .filter((s) => {
        if (q) {
          const hay = `${s.id} ${s.machineName} ${s.product} ${s.mold} ${s.assignedOperator}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (shiftFilter !== 'all' && !s.shift.toLowerCase().includes(shiftFilter.toLowerCase())) {
          return false;
        }
        switch (statusFilter) {
          case 'overdue_missed':
            return s.status === 'overdue' || s.status === 'missed';
          case 'in_progress':
            return s.status === 'in_progress' || s.status === 'scheduled';
          case 'completed':
            return s.status === 'completed';
          case 'deviations':
            return s.complianceState === 'deviations_detected';
          case 'missing_unverified':
            return (
              s.complianceState === 'non_compliant_missing' ||
              s.screens.some(
                (sc) =>
                  sc.status === 'captured_unverified' ||
                  (sc.mandatory && sc.status === 'pending' && s.status !== 'scheduled')
              )
            );
          default:
            return true;
        }
      })
      .sort((a, b) => b.scheduledAtIso.localeCompare(a.scheduledAtIso));
  }, [sessions, searchQuery, statusFilter, shiftFilter]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      await onStartNewSession({
        machineId: newMachineId,
        scheduledDate: newDate,
        scheduledTime: newTime,
      });
      setShowCreateModal(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Unable to start session.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Reminder & Overdue Alerts Banner */}
      {reminderItems.length > 0 && (
        <section
          aria-label="Monitoring Reminders and Overdue Notifications"
          className="bg-white border border-amber-300 rounded-lg overflow-hidden"
        >
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-amber-900">
              <BellRing className="w-4 h-4 shrink-0 text-amber-700" aria-hidden="true" />
              <h2 className="text-sm font-semibold">
                Monitoring Reminders & Overdue Compliance ({reminderItems.length})
              </h2>
            </div>
            <span className="text-xs text-amber-800 font-mono tabular-nums">
              Interval: Every {scheduleConfig.intervalHours}h · Grace Period: {scheduleConfig.gracePeriodMinutes} min
            </span>
          </div>

          <div className="divide-y divide-slate-200">
            {reminderItems.slice(0, 4).map(({ session, evalResult }) => {
              const isOverdueOrMissed =
                session.status === 'overdue' ||
                session.status === 'missed' ||
                evalResult.state === 'overdue';
              return (
                <div
                  key={session.id}
                  className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`font-semibold ${
                          isOverdueOrMissed ? 'text-red-700' : 'text-amber-800'
                        }`}
                      >
                        {session.status === 'missed'
                          ? 'Missed Session Recorded'
                          : isOverdueOrMissed
                            ? 'Overdue Notification'
                            : `Due in Grace Window (${evalResult.graceRemainingMinutes}m left)`}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">·</span>
                      <span className="font-mono font-medium text-slate-900">{session.id}</span>
                      <span aria-hidden="true" className="text-slate-300">·</span>
                      <span className="text-slate-700">{session.machineName}</span>
                    </div>
                    <p className="text-slate-600">
                      Operator: {session.assignedOperator} · Scheduled {session.scheduledTime} ·{' '}
                      {session.status === 'missed'
                        ? 'Logged as missed compliance check (not classified as a process deviation).'
                        : `${session.completionPercent}% screen verification completed.`}
                    </p>
                  </div>
                  {session.status !== 'missed' && (
                    <button
                      type="button"
                      onClick={() => onOpenCapture(session.id)}
                      className="px-3 py-1.5 text-xs font-medium bg-blue-700 text-white rounded hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
                    >
                      Capture Now
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 5-Column KPI Compliance Strip */}
      <section aria-label="Monitoring Compliance Summary" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">Scheduled Sessions</div>
          <div className="mt-1.5 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {stats.totalScheduled}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Every {scheduleConfig.intervalHours}h schedule
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">Completed</div>
          <div className="mt-1.5 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {stats.completed}
          </div>
          <div className="mt-1 text-xs text-emerald-700 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{stats.compliant} compliant</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">Overdue / Missed</div>
          <div className="mt-1.5 text-2xl font-bold text-red-700 font-mono tabular-nums">
            {stats.overdue + stats.missed}
          </div>
          <div className="mt-1 text-xs text-slate-600 font-mono tabular-nums">
            {stats.overdue} overdue · {stats.missed} missed
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">Missing Photos</div>
          <div className="mt-1.5 text-2xl font-bold text-amber-700 font-mono tabular-nums">
            {stats.missingPhotosCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">Active & overdue screens</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">Unverified OCR</div>
          <div className="mt-1.5 text-2xl font-bold text-amber-700 font-mono tabular-nums">
            {stats.unverifiedOcrCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">Readings awaiting sign-off</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">Deviations Detected</div>
          <div className="mt-1.5 text-2xl font-bold text-red-700 font-mono tabular-nums">
            {stats.withDeviations}
          </div>
          <div className="mt-1 text-xs text-slate-600 font-mono tabular-nums">
            Avg completion: {stats.overallCompletionPercent}%
          </div>
        </div>
      </section>

      {/* Monitoring Sessions Ledger */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Scheduled & Active Monitoring Sessions
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Daily slots: {scheduleConfig.timeSlots.join(' · ')}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-blue-700 text-white rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Schedule Session
          </button>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-md">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'in_progress', label: 'Active & Scheduled' },
                { id: 'overdue_missed', label: 'Overdue / Missed' },
                { id: 'missing_unverified', label: 'Missing / Unverified' },
                { id: 'deviations', label: 'Deviations' },
                { id: 'completed', label: 'Completed' },
              ] as { id: StatusFilter; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  statusFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              aria-label="Filter by production shift"
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-700"
            >
              <option value="all">All Shifts</option>
              <option value="Shift A">Shift A</option>
              <option value="Shift B">Shift B</option>
            </select>

            <div className="relative">
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search session, machine, mold..."
                aria-label="Search monitoring sessions"
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-900 w-56 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>
        </div>

        {/* Data Table */}
        {filteredSessions.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <AlertTriangle className="w-6 h-6 text-slate-400 mx-auto" aria-hidden="true" />
            <p className="text-sm font-medium text-slate-800">No monitoring sessions match these filters</p>
            <p className="text-xs text-slate-500">
              Clear your search query or select All to view all scheduled sessions.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-white">
                  <th className="py-2.5 px-3 whitespace-nowrap">Session ID</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Machine · Mold</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Slot</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Operator</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Completion</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Status</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Compliance</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {filteredSessions.map((session) => {
                  const completedScreens = session.screens.filter(
                    (s) => s.status === 'completed'
                  ).length;
                  const totalScreens = session.screens.length;
                  const shortShift = session.shift.split(' (')[0];
                  return (
                    <tr key={session.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-900 whitespace-nowrap">
                        {session.id}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-900">{session.machineName}</div>
                        <div className="text-slate-500 truncate max-w-[180px]">
                          {session.product} · {session.mold}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-mono tabular-nums text-slate-900">
                          {session.scheduledDate.slice(5)} {session.scheduledTime}
                        </div>
                        <div className="text-slate-500">{shortShift}</div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                        {session.assignedOperator}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-14 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${
                                session.completionPercent === 100
                                  ? 'bg-emerald-600'
                                  : session.status === 'overdue' || session.status === 'missed'
                                    ? 'bg-red-600'
                                    : 'bg-blue-700'
                              }`}
                              style={{ width: `${session.completionPercent}%` }}
                            />
                          </div>
                          <span className="font-mono tabular-nums text-slate-800 font-medium">
                            {session.completionPercent}% ({completedScreens}/{totalScreens})
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <SessionStatusLabel status={session.status} />
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <ComplianceLabel state={session.complianceState} />
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        {session.status === 'completed' || session.isImmutableHistorical ? (
                          <button
                            type="button"
                            onClick={() => onOpenComparison(session.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded hover:bg-slate-100 transition-colors"
                          >
                            Compare
                            <ArrowRight className="w-3 h-3" aria-hidden="true" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onOpenCapture(session.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-blue-700 rounded hover:bg-blue-800 transition-colors"
                          >
                            {session.completionPercent > 0 ? 'Resume' : 'Start'}
                            <ArrowRight className="w-3 h-3" aria-hidden="true" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Schedule New Monitoring Session Modal */}
      {showCreateModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-session-title"
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 id="create-session-title" className="text-base font-semibold text-slate-900">
                Create Scheduled Monitoring Session
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="new-machine"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Machine & Controller
                </label>
                <select
                  id="new-machine"
                  value={newMachineId}
                  onChange={(e) => setNewMachineId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white text-slate-900"
                >
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.code}) — {m.currentProduct}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="new-date"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Monitoring Date
                  </label>
                  <input
                    id="new-date"
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-time"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Scheduled Slot
                  </label>
                  <select
                    id="new-time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md font-mono text-slate-900 bg-white"
                  >
                    {scheduleConfig.timeSlots.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {createError && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {createError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800 disabled:opacity-60"
                >
                  {creating ? 'Creating...' : 'Create & Open Capture'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
