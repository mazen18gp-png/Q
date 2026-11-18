import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Lock,
  Search,
} from 'lucide-react';
import type {
  ApprovedRecipe,
  MonitoringSession,
  UserRole,
} from '../types/monitoring';
import {
  exportAllSessionsToExcel,
  exportSessionToExcel,
  exportSessionToPdf,
} from '../utils/exportUtils';
import { ComplianceLabel, DeviationFlagLabel, SessionStatusLabel } from './StatusText';

interface HistoryArchiveViewProps {
  sessions: MonitoringSession[];
  recipes: ApprovedRecipe[];
  role: UserRole;
  onAcknowledgeAlarm: (sessionId: string, alarmId: string) => Promise<void>;
}

export function HistoryArchiveView({
  sessions,
  recipes,
  onAcknowledgeAlarm,
}: HistoryArchiveViewProps) {
  const [search, setSearch] = useState('');
  const [machineFilter, setMachineFilter] = useState('all');
  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    sessions.find((s) => s.status === 'completed' || s.status === 'missed')?.id ??
      sessions[0]?.id ??
      ''
  );
  const [lightboxImage, setLightboxImage] = useState<{ src: string; title: string } | null>(null);

  const machines = useMemo(() => {
    const map = new Map<string, string>();
    sessions.forEach((s) => map.set(s.machineId, s.machineName));
    return Array.from(map.entries());
  }, [sessions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions
      .filter((s) => {
        if (machineFilter !== 'all' && s.machineId !== machineFilter) return false;
        if (q) {
          const hay = `${s.id} ${s.machineName} ${s.product} ${s.mold} ${s.assignedOperator}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.scheduledAtIso.localeCompare(a.scheduledAtIso));
  }, [sessions, search, machineFilter]);

  const selectedSession = useMemo(
    () => filtered.find((s) => s.id === selectedSessionId) ?? filtered[0] ?? null,
    [filtered, selectedSessionId]
  );

  const selectedRecipe = selectedSession
    ? recipes.find((r) => r.id === selectedSession.recipeId)
    : undefined;

  return (
    <div className="space-y-5">
      {/* Header & Bulk Export */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Immutable Historical Traceability Archive
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Every monitoring session retains original photographs, extracted OCR values, operator corrections, alarms, and audit logs without overwriting prior records.
          </p>
        </div>

        <button
          type="button"
          onClick={() => exportAllSessionsToExcel(filtered)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-slate-300 bg-white text-slate-800 rounded-md hover:bg-slate-50 whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          Export Full Archive (.xlsx)
        </button>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Ledger (5 cols) */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="p-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter archive..."
                aria-label="Filter historical sessions"
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded"
              />
            </div>
            <select
              aria-label="Filter archive by machine"
              value={machineFilter}
              onChange={(e) => setMachineFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
            >
              <option value="all">All Machines</option>
              {machines.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="divide-y divide-slate-200 max-h-[680px] overflow-y-auto">
            {filtered.map((s) => {
              const isSelected = selectedSession?.id === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedSessionId(s.id)}
                  className={`w-full text-left px-4 py-3 space-y-1 transition-colors ${
                    isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-900">
                      {s.id}
                    </span>
                    <SessionStatusLabel status={s.status} />
                  </div>
                  <div className="text-xs text-slate-700">
                    {s.machineName} · {s.product} · {s.mold}
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {s.assignedOperator} · {s.shift}
                    </span>
                    <span className="font-mono tabular-nums">
                      {s.alarms.length} alarm(s) · {s.corrections.length} edit(s)
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Right Detailed Traceability Record (7 cols) */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-5 space-y-5">
          {!selectedSession ? (
            <p className="text-xs text-slate-500 text-center py-8">Select a session to inspect its audit record.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold font-mono text-slate-900">
                      {selectedSession.id}
                    </h3>
                    {selectedSession.isImmutableHistorical && (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                        <Lock className="w-3 h-3" aria-hidden="true" />
                        Immutable Record
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    {selectedSession.machineName} ({selectedSession.controllerModel}) ·{' '}
                    {selectedSession.product} · {selectedSession.mold}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span>Operator: {selectedSession.assignedOperator}</span>
                    <span aria-hidden="true">·</span>
                    <ComplianceLabel state={selectedSession.complianceState} />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => exportSessionToExcel(selectedSession, selectedRecipe)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-800 rounded hover:bg-slate-50 whitespace-nowrap"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                    Export Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => exportSessionToPdf(selectedSession, selectedRecipe)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded hover:bg-slate-800 whitespace-nowrap"
                  >
                    <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                    Export PDF
                  </button>
                </div>
              </div>

              {/* Original Retained Photographs */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-semibold text-slate-800">
                  Retained Original Screen Photographs
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {selectedSession.screens.map((sc) => {
                    const imgSrc = sc.imageDataUrl || sc.imageUrl;
                    return (
                      <div
                        key={sc.screenId}
                        className="border border-slate-200 rounded-md overflow-hidden bg-slate-50"
                      >
                        {imgSrc ? (
                          <button
                            type="button"
                            onClick={() =>
                              setLightboxImage({
                                src: imgSrc,
                                title: `${selectedSession.id} — ${sc.screenName}`,
                              })
                            }
                            className="block w-full text-left group"
                          >
                            <img
                              src={imgSrc}
                              alt={`${sc.screenName} photographic record`}
                              referrerPolicy="no-referrer"
                              className="w-full h-24 object-cover group-hover:opacity-90 transition-opacity"
                            />
                            <div className="p-2 text-xs">
                              <div className="font-medium text-slate-800 truncate">
                                {sc.order}. {sc.screenName.replace(' Screen', '')}
                              </div>
                              <div className="text-slate-500 font-mono text-[11px]">
                                {sc.capturedAt ? sc.capturedAt.slice(11, 19) : 'Captured'}
                              </div>
                            </div>
                          </button>
                        ) : (
                          <div className="h-24 flex items-center justify-center text-xs text-slate-400 px-2 text-center">
                            No photograph ({sc.status})
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Extracted Data & Corrections */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-800">
                  Extracted & Verified Parameter Readings
                </h4>
                <div className="overflow-x-auto border border-slate-200 rounded-md">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <th className="py-2 px-3">Parameter</th>
                        <th className="py-2 px-3 text-right">OCR</th>
                        <th className="py-2 px-3 text-right">Verified</th>
                        <th className="py-2 px-3 text-right">Target</th>
                        <th className="py-2 px-3">Flag / Correction</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {selectedSession.screens.flatMap((sc) =>
                        sc.readings.map((r) => (
                          <tr key={`${sc.screenId}-${r.key}`}>
                            <td className="py-2 px-3 font-medium text-slate-900">
                              {r.label} <span className="text-slate-400">({r.unit})</span>
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600">
                              {r.extractedValue ?? '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                              {r.verifiedValue ?? '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-500">
                              {r.approvedTarget}
                            </td>
                            <td className="py-2 px-3">
                              <DeviationFlagLabel flag={r.deviationFlag} />
                              {r.manuallyCorrected && (
                                <div className="text-[11px] text-amber-700 mt-0.5">
                                  Corrected{r.correctionReason ? `: ${r.correctionReason}` : ''}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Alarms & Audit Trail */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-slate-800">
                    Alarm Records ({selectedSession.alarms.length})
                  </h4>
                  {selectedSession.alarms.length === 0 ? (
                    <p className="text-xs text-slate-500 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      No alarms recorded in this session.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {selectedSession.alarms.map((alm) => (
                        <div
                          key={alm.id}
                          className="p-2.5 border border-slate-200 rounded bg-slate-50 text-xs space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className={`font-semibold ${
                                alm.severity === 'critical' ? 'text-red-700' : 'text-amber-700'
                              }`}
                            >
                              {alm.type.replace(/_/g, ' ')}
                            </span>
                            <span className="font-mono text-[11px] text-slate-500">
                              {alm.timestamp.replace('T', ' ')}
                            </span>
                          </div>
                          <p className="text-slate-700">{alm.message}</p>
                          {!alm.acknowledged ? (
                            <button
                              type="button"
                              onClick={() => onAcknowledgeAlarm(selectedSession.id, alm.id)}
                              className="text-xs font-medium text-blue-700 hover:underline"
                            >
                              Acknowledge Alarm
                            </button>
                          ) : (
                            <span className="text-[11px] text-emerald-700 font-medium">
                              Acknowledged
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-slate-800">
                    User & Audit Trail ({selectedSession.auditLog.length + selectedSession.corrections.length})
                  </h4>
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {[...selectedSession.corrections, ...selectedSession.auditLog]
                      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
                      .map((ev) => (
                        <div
                          key={ev.id}
                          className="p-2.5 border border-slate-200 rounded text-xs space-y-0.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-800">{ev.action}</span>
                            <span className="font-mono text-[11px] text-slate-500">
                              {ev.timestamp.replace('T', ' ')}
                            </span>
                          </div>
                          <div className="text-slate-600">{ev.detail}</div>
                          <div className="text-[11px] text-slate-500">
                            By {ev.actor} ({ev.role})
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Lightbox Modal for Retained Photograph */}
      {lightboxImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightboxImage.title}
          className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-6"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="bg-white rounded-lg max-w-3xl w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-semibold font-mono text-slate-900">
                {lightboxImage.title}
              </span>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Close
              </button>
            </div>
            <div className="bg-slate-950 p-3">
              <img
                src={lightboxImage.src}
                alt={lightboxImage.title}
                referrerPolicy="no-referrer"
                className="w-full max-h-[70vh] object-contain mx-auto"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
