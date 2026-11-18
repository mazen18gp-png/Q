import { useMemo, useState } from 'react';
import { CheckCircle2, Lock, Save, SlidersHorizontal } from 'lucide-react';
import type {
  MachineConfig,
  ScheduleConfig,
  ScreenTemplate,
  ShiftDefinition,
  UserRole,
} from '../types/monitoring';
import { generateTimeSlotsFromShifts } from '../utils/monitoringLogic';

interface ScheduleConfigViewProps {
  role: UserRole;
  onSwitchToAdmin: () => void;
  scheduleConfig: ScheduleConfig;
  machines: MachineConfig[];
  screenTemplates: ScreenTemplate[];
  onSaveSchedule: (payload: {
    intervalHours: number;
    gracePeriodMinutes: number;
    shifts: ShiftDefinition[];
    updatedBy: string;
  }) => Promise<void>;
  onSaveMachineScreens: (
    machineId: string,
    payload: {
      requiredScreenIds: string[];
      assignedOperator: string;
      currentProduct: string;
      currentMold: string;
    }
  ) => Promise<void>;
}

export function ScheduleConfigView({
  role,
  onSwitchToAdmin,
  scheduleConfig,
  machines,
  screenTemplates,
  onSaveSchedule,
  onSaveMachineScreens,
}: ScheduleConfigViewProps) {
  const isAdmin = role === 'administrator';

  const [intervalHours, setIntervalHours] = useState(scheduleConfig.intervalHours);
  const [graceMinutes, setGraceMinutes] = useState(scheduleConfig.gracePeriodMinutes);
  const [shifts, setShifts] = useState<ShiftDefinition[]>(scheduleConfig.shifts);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleSavedMsg, setScheduleSavedMsg] = useState<string | null>(null);

  const [selectedMachineId, setSelectedMachineId] = useState(machines[0]?.id ?? '');
  const selectedMachine = useMemo(
    () => machines.find((m) => m.id === selectedMachineId) ?? machines[0],
    [machines, selectedMachineId]
  );

  const [machineScreens, setMachineScreens] = useState<string[]>(
    selectedMachine?.requiredScreenIds ?? []
  );
  const [machineOperator, setMachineOperator] = useState(selectedMachine?.assignedOperator ?? '');
  const [machineProduct, setMachineProduct] = useState(selectedMachine?.currentProduct ?? '');
  const [machineMold, setMachineMold] = useState(selectedMachine?.currentMold ?? '');
  const [savingMachine, setSavingMachine] = useState(false);
  const [machineSavedMsg, setMachineSavedMsg] = useState<string | null>(null);

  const previewSlots = useMemo(
    () => generateTimeSlotsFromShifts(intervalHours, shifts),
    [intervalHours, shifts]
  );

  const handleSelectMachine = (id: string) => {
    setSelectedMachineId(id);
    const m = machines.find((item) => item.id === id);
    if (m) {
      setMachineScreens(m.requiredScreenIds);
      setMachineOperator(m.assignedOperator);
      setMachineProduct(m.currentProduct);
      setMachineMold(m.currentMold);
      setMachineSavedMsg(null);
    }
  };

  const handleToggleShift = (shiftId: string) => {
    setShifts((prev) =>
      prev.map((sh) => (sh.id === shiftId ? { ...sh, active: !sh.active } : sh))
    );
  };

  const handleShiftTimeChange = (shiftId: string, field: 'startTime' | 'endTime', val: string) => {
    setShifts((prev) =>
      prev.map((sh) => (sh.id === shiftId ? { ...sh, [field]: val } : sh))
    );
  };

  const handleToggleScreenForMachine = (screenId: string) => {
    setMachineScreens((prev) =>
      prev.includes(screenId) ? prev.filter((id) => id !== screenId) : [...prev, screenId]
    );
  };

  const handleSaveScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setSavingSchedule(true);
    setScheduleSavedMsg(null);
    try {
      await onSaveSchedule({
        intervalHours,
        gracePeriodMinutes: graceMinutes,
        shifts,
        updatedBy: 'Dr. Sarah Lindqvist',
      });
      setScheduleSavedMsg('Monitoring frequency, grace period, and shift schedule saved.');
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleSaveMachineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !selectedMachine) return;
    setSavingMachine(true);
    setMachineSavedMsg(null);
    try {
      await onSaveMachineScreens(selectedMachine.id, {
        requiredScreenIds: machineScreens,
        assignedOperator: machineOperator,
        currentProduct: machineProduct,
        currentMold: machineMold,
      });
      setMachineSavedMsg(`Required screen configuration saved for ${selectedMachine.name}.`);
    } finally {
      setSavingMachine(false);
    }
  };

  return (
    <div className="space-y-6">
      {!isAdmin && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-amber-900">
            <Lock className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>
              You are viewing schedule & machine configuration in <strong>Operator Read-Only</strong> mode. Switch to Administrator role to modify intervals or required screens.
            </span>
          </div>
          <button
            type="button"
            onClick={onSwitchToAdmin}
            className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded hover:bg-slate-800 whitespace-nowrap"
          >
            Switch to Administrator
          </button>
        </div>
      )}

      {/* Monitoring Interval & Shift Schedule */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
        <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-blue-700" aria-hidden="true" />
            <h2 className="text-base font-semibold text-slate-900">
              Monitoring Frequency, Shifts & Grace Period
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Last updated by {scheduleConfig.updatedBy}
          </span>
        </div>

        <form onSubmit={handleSaveScheduleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label htmlFor="cfg-interval" className="block text-xs font-medium text-slate-700 mb-1">
                Monitoring Interval (Hours)
              </label>
              <select
                id="cfg-interval"
                disabled={!isAdmin}
                value={intervalHours}
                onChange={(e) => setIntervalHours(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white disabled:bg-slate-100"
              >
                <option value={1}>Every 1 Hour</option>
                <option value={2}>Every 2 Hours (Default)</option>
                <option value={3}>Every 3 Hours</option>
                <option value={4}>Every 4 Hours</option>
              </select>
            </div>

            <div>
              <label htmlFor="cfg-grace" className="block text-xs font-medium text-slate-700 mb-1">
                Overdue Reminder Grace Period (Minutes)
              </label>
              <input
                id="cfg-grace"
                type="number"
                min={5}
                max={90}
                disabled={!isAdmin}
                value={graceMinutes}
                onChange={(e) => setGraceMinutes(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md bg-white disabled:bg-slate-100"
              />
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-700">
              Production Shifts & Working Hours
            </h3>
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-md">
              {shifts.map((sh) => (
                <div
                  key={sh.id}
                  className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-4 text-xs"
                >
                  <label className="inline-flex items-center gap-2 font-medium text-slate-900">
                    <input
                      type="checkbox"
                      disabled={!isAdmin}
                      checked={sh.active}
                      onChange={() => handleToggleShift(sh.id)}
                      className="accent-blue-700"
                    />
                    {sh.name}
                  </label>

                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      aria-label={`${sh.name} start time`}
                      disabled={!isAdmin || !sh.active}
                      value={sh.startTime}
                      onChange={(e) => handleShiftTimeChange(sh.id, 'startTime', e.target.value)}
                      className="px-2 py-1 font-mono border border-slate-300 rounded bg-white disabled:bg-slate-100"
                    />
                    <span className="text-slate-400">to</span>
                    <input
                      type="time"
                      aria-label={`${sh.name} end time`}
                      disabled={!isAdmin || !sh.active}
                      value={sh.endTime}
                      onChange={(e) => handleShiftTimeChange(sh.id, 'endTime', e.target.value)}
                      className="px-2 py-1 font-mono border border-slate-300 rounded bg-white disabled:bg-slate-100"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md space-y-1">
            <div className="text-xs font-medium text-slate-700">
              Generated Daily Monitoring Schedule ({previewSlots.length} checks/day)
            </div>
            <div className="text-xs font-mono tabular-nums text-slate-900">
              {previewSlots.length > 0 ? previewSlots.join('  ·  ') : 'No active shift windows'}
            </div>
          </div>

          {scheduleSavedMsg && (
            <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-3 py-2 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {scheduleSavedMsg}
            </p>
          )}

          {isAdmin && (
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingSchedule}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-blue-700 text-white rounded-md hover:bg-blue-800 disabled:opacity-60"
              >
                <Save className="w-3.5 h-3.5" aria-hidden="true" />
                {savingSchedule ? 'Saving Schedule...' : 'Save Schedule Configuration'}
              </button>
            </div>
          )}
        </form>
      </section>

      {/* Per-Machine Required Screens Configuration */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Machine & Controller Required Screen Configuration
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure the mandatory parameter screens required during each session per machine and controller model.
            </p>
          </div>

          <select
            aria-label="Select machine to configure"
            value={selectedMachine?.id ?? ''}
            onChange={(e) => handleSelectMachine(e.target.value)}
            className="px-3 py-2 text-xs font-medium border border-slate-300 rounded-md bg-white text-slate-900"
          >
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.controllerModel})
              </option>
            ))}
          </select>
        </div>

        {selectedMachine && (
          <form onSubmit={handleSaveMachineSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="m-prod" className="block text-xs font-medium text-slate-700 mb-1">
                  Active Product
                </label>
                <input
                  id="m-prod"
                  type="text"
                  disabled={!isAdmin}
                  value={machineProduct}
                  onChange={(e) => setMachineProduct(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md disabled:bg-slate-100"
                />
              </div>
              <div>
                <label htmlFor="m-mold" className="block text-xs font-medium text-slate-700 mb-1">
                  Active Mold
                </label>
                <input
                  id="m-mold"
                  type="text"
                  disabled={!isAdmin}
                  value={machineMold}
                  onChange={(e) => setMachineMold(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md disabled:bg-slate-100"
                />
              </div>
              <div>
                <label htmlFor="m-op" className="block text-xs font-medium text-slate-700 mb-1">
                  Responsible Operator
                </label>
                <input
                  id="m-op"
                  type="text"
                  disabled={!isAdmin}
                  value={machineOperator}
                  onChange={(e) => setMachineOperator(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md disabled:bg-slate-100"
                />
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-700">
                Mandatory Screens for {selectedMachine.name} ({machineScreens.length} selected)
              </h3>
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-md">
                {screenTemplates.map((tmpl) => {
                  const checked = machineScreens.includes(tmpl.id);
                  return (
                    <label
                      key={tmpl.id}
                      className="px-4 py-2.5 flex items-start justify-between gap-4 text-xs cursor-pointer hover:bg-slate-50"
                    >
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          disabled={!isAdmin}
                          checked={checked}
                          onChange={() => handleToggleScreenForMachine(tmpl.id)}
                          className="mt-0.5 accent-blue-700"
                        />
                        <div>
                          <div className="font-medium text-slate-900">
                            {tmpl.name} <span className="font-mono text-slate-400">({tmpl.code})</span>
                          </div>
                          <div className="text-slate-500">{tmpl.description}</div>
                        </div>
                      </div>
                      <span className="font-mono text-slate-500 whitespace-nowrap">
                        {tmpl.expectedParameters.length} params
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {machineSavedMsg && (
              <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-3 py-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {machineSavedMsg}
              </p>
            )}

            {isAdmin && (
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingMachine}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-blue-700 text-white rounded-md hover:bg-blue-800 disabled:opacity-60"
                >
                  <Save className="w-3.5 h-3.5" aria-hidden="true" />
                  {savingMachine ? 'Saving...' : 'Save Machine Screens'}
                </button>
              </div>
            )}
          </form>
        )}
      </section>
    </div>
  );
}
