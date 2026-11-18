import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  GitCompareArrows,
  ShieldAlert,
} from 'lucide-react';
import type {
  ApprovedRecipe,
  MonitoringSession,
} from '../types/monitoring';
import { compareSessionReadings } from '../utils/monitoringLogic';
import { DeviationFlagLabel } from './StatusText';

type CompareMode =
  | 'approved_recipe'
  | 'previous_session'
  | 'different_shifts'
  | 'different_days'
  | 'different_molds';

interface ComparisonViewProps {
  sessions: MonitoringSession[];
  recipes: ApprovedRecipe[];
  initialSessionId: string | null;
}

export function ComparisonView({
  sessions,
  recipes,
  initialSessionId,
}: ComparisonViewProps) {
  const comparableSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.screens.some((sc) => sc.readings.some((r) => r.verifiedValue !== null || r.extractedValue !== null)))
        .sort((a, b) => b.scheduledAtIso.localeCompare(a.scheduledAtIso)),
    [sessions]
  );

  const [mode, setMode] = useState<CompareMode>('approved_recipe');
  const [targetSessionId, setTargetSessionId] = useState<string>(
    initialSessionId && comparableSessions.some((s) => s.id === initialSessionId)
      ? initialSessionId
      : comparableSessions[0]?.id ?? ''
  );
  const [customBaselineId, setCustomBaselineId] = useState<string>('');
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  const targetSession = useMemo(
    () => comparableSessions.find((s) => s.id === targetSessionId) ?? comparableSessions[0] ?? null,
    [comparableSessions, targetSessionId]
  );

  const baselineCandidates = useMemo(() => {
    if (!targetSession) return [];
    const others = comparableSessions.filter((s) => s.id !== targetSession.id);
    switch (mode) {
      case 'previous_session':
        return others.filter((s) => s.machineId === targetSession.machineId);
      case 'different_shifts':
        return others.filter((s) => s.shift !== targetSession.shift);
      case 'different_days':
        return others.filter((s) => s.scheduledDate !== targetSession.scheduledDate);
      case 'different_molds':
        return others.filter(
          (s) => s.mold !== targetSession.mold || s.product !== targetSession.product
        );
      default:
        return others;
    }
  }, [comparableSessions, targetSession, mode]);

  const selectedBaselineSession = useMemo(() => {
    if (mode === 'approved_recipe') return null;
    return (
      baselineCandidates.find((s) => s.id === customBaselineId) ??
      baselineCandidates[0] ??
      comparableSessions.find((s) => s.id !== targetSession?.id) ??
      null
    );
  }, [mode, baselineCandidates, customBaselineId, comparableSessions, targetSession]);

  const rows = useMemo(() => {
    if (!targetSession) return [];
    const recipe = recipes.find((r) => r.id === targetSession.recipeId) ?? recipes[0];
    const machineHistory = comparableSessions.filter(
      (s) => s.machineId === targetSession.machineId
    );
    const prevForMachine =
      machineHistory
        .filter((s) => s.scheduledAtIso < targetSession.scheduledAtIso)
        .sort((a, b) => b.scheduledAtIso.localeCompare(a.scheduledAtIso))[0] ?? null;

    const baselineObj =
      mode === 'approved_recipe'
        ? recipe
        : selectedBaselineSession ?? recipe;

    return compareSessionReadings(
      targetSession,
      baselineObj,
      prevForMachine,
      machineHistory
    );
  }, [targetSession, recipes, comparableSessions, mode, selectedBaselineSession]);

  const diagnosticCounts = useMemo(() => {
    return {
      drift: rows.filter((r) => r.flag === 'drift').length,
      sudden: rows.filter((r) => r.flag === 'sudden_change').length,
      repeated: rows.filter((r) => r.flag === 'repeated_deviation').length,
      unauthorized: rows.filter((r) => r.flag === 'unauthorized_recipe').length,
    };
  }, [rows]);

  const displayedRows = useMemo(
    () => (onlyFlagged ? rows.filter((r) => r.flag !== 'none') : rows),
    [rows, onlyFlagged]
  );

  if (!targetSession) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
        <p className="text-sm font-medium text-slate-800">
          Capture at least one monitoring session to run parameter comparisons.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Comparison Controls */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <GitCompareArrows className="w-4 h-4 text-blue-700" aria-hidden="true" />
            <h2 className="text-base font-semibold text-slate-900">
              Session-Based Parameter Comparison & Drift Analysis
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md">
            {(
              [
                { id: 'approved_recipe', label: 'vs Approved Recipe' },
                { id: 'previous_session', label: 'vs Previous Session' },
                { id: 'different_shifts', label: 'Shift vs Shift' },
                { id: 'different_days', label: 'Day vs Day' },
                { id: 'different_molds', label: 'Mold / Product' },
              ] as { id: CompareMode; label: string }[]
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setMode(m.id);
                  setCustomBaselineId('');
                }}
                className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  mode === m.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
          <div>
            <label htmlFor="cmp-target" className="block text-xs font-medium text-slate-600 mb-1">
              Target Monitoring Session
            </label>
            <select
              id="cmp-target"
              value={targetSession.id}
              onChange={(e) => setTargetSessionId(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-md text-slate-900"
            >
              {comparableSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} · {s.machineName} · {s.product} ({s.shift})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="cmp-baseline" className="block text-xs font-medium text-slate-600 mb-1">
              Baseline Reference ({mode === 'approved_recipe' ? 'Approved Master Recipe' : 'Reference Session'})
            </label>
            {mode === 'approved_recipe' ? (
              <div className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-800">
                {recipes.find((r) => r.id === targetSession.recipeId)?.name ?? targetSession.recipeId} ·{' '}
                v{recipes.find((r) => r.id === targetSession.recipeId)?.version ?? '1.0'}
              </div>
            ) : (
              <select
                id="cmp-baseline"
                value={selectedBaselineSession?.id ?? ''}
                onChange={(e) => setCustomBaselineId(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-md text-slate-900"
              >
                {(baselineCandidates.length > 0 ? baselineCandidates : comparableSessions).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id} · {s.machineName} · {s.mold} ({s.scheduledDate} {s.shift})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </section>

      {/* Diagnostic Flags Summary */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Deviation Classification Summary">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">Parameter Drift</div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-amber-700">
            {diagnosticCounts.drift}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">Out of tolerance or trending</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">Sudden Changes</div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-red-700">
            {diagnosticCounts.sudden}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">Step jump vs prior session</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">Repeated Deviations</div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-amber-700">
            {diagnosticCounts.repeated}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">Consecutive multi-session drift</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">Unauthorized Recipe Change</div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-red-700">
            {diagnosticCounts.unauthorized}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">Setpoint &gt;12% off master recipe</div>
        </div>
      </section>

      {/* Comparison Matrix Table */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            Comparing <strong className="font-mono text-slate-900">{targetSession.id}</strong> against{' '}
            <strong className="font-mono text-slate-900">
              {mode === 'approved_recipe'
                ? 'Approved Recipe'
                : selectedBaselineSession?.id ?? 'Baseline'}
            </strong>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyFlagged}
              onChange={(e) => setOnlyFlagged(e.target.checked)}
              className="accent-blue-700"
            />
            Show deviations only
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                <th className="py-2.5 px-4">Screen</th>
                <th className="py-2.5 px-4">Parameter</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Baseline</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Target Reading</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Delta</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">% Drift</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Approved Band</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Diagnostic Flag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {displayedRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
                    No parameter deviations detected in this comparison.
                  </td>
                </tr>
              ) : (
                displayedRows.map((row) => {
                  const isFlagged = row.flag !== 'none';
                  return (
                    <tr
                      key={`${row.screenName}-${row.key}`}
                      className={isFlagged ? 'bg-red-50/30' : 'hover:bg-slate-50'}
                    >
                      <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">
                        {row.screenName.replace(' Screen', '')}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-900">
                        {row.label} <span className="text-slate-400">({row.unit})</span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                        {row.baselineValue !== null ? row.baselineValue : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {row.targetValue !== null ? row.targetValue : '—'}
                      </td>
                      <td
                        className={`py-2.5 px-4 text-right font-mono tabular-nums ${
                          row.delta && row.delta !== 0
                            ? isFlagged
                              ? 'text-red-700 font-semibold'
                              : 'text-slate-700'
                            : 'text-slate-500'
                        }`}
                      >
                        {row.delta !== null ? (row.delta > 0 ? `+${row.delta}` : row.delta) : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                        {row.percentDelta !== null
                          ? `${row.percentDelta > 0 ? '+' : ''}${row.percentDelta}%`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                        {row.toleranceMin} – {row.toleranceMax}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <DeviationFlagLabel flag={row.flag} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
