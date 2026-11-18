import {
  Archive,
  Camera,
  GitCompareArrows,
  LayoutDashboard,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { UserRole } from '../types/monitoring';

export type ActiveView =
  | 'dashboard'
  | 'capture'
  | 'compare'
  | 'history'
  | 'schedule';

interface SidebarProps {
  activeView: ActiveView;
  onSelectView: (view: ActiveView) => void;
  role: UserRole;
  onChangeRole: (role: UserRole) => void;
  overdueCount: number;
  activeCaptureSessionId: string | null;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  activeView,
  onSelectView,
  role,
  onChangeRole,
  overdueCount,
  activeCaptureSessionId,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const navItems: {
    id: ActiveView;
    label: string;
    icon: typeof LayoutDashboard;
    meta?: string;
  }[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      meta: overdueCount > 0 ? `${overdueCount} overdue` : undefined,
    },
    {
      id: 'capture',
      label: 'Guided Capture',
      icon: Camera,
      meta: activeCaptureSessionId ? activeCaptureSessionId.slice(-4) : undefined,
    },
    {
      id: 'compare',
      label: 'Comparisons',
      icon: GitCompareArrows,
    },
    {
      id: 'history',
      label: 'History Archive',
      icon: Archive,
    },
    {
      id: 'schedule',
      label: 'Schedule & Config',
      icon: SlidersHorizontal,
      meta: role === 'administrator' ? 'Admin' : 'View',
    },
  ];

  const handleNav = (view: ActiveView) => {
    onSelectView(view);
    onCloseMobile();
  };

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[252px] shrink-0 bg-white border-r border-slate-200 flex flex-col justify-between transition-transform duration-150 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          <div className="h-14 px-5 border-b border-slate-200 flex items-center justify-between">
            <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
              MoldWatch
            </span>
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close navigation menu"
              className="p-1.5 text-slate-500 hover:text-slate-900 lg:hidden"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <nav className="p-3 space-y-1" aria-label="Primary Navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNav(item.id)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.meta && (
                    <span
                      className={`text-xs font-mono tabular-nums shrink-0 ${
                        item.id === 'dashboard' && overdueCount > 0
                          ? 'text-red-700 font-semibold'
                          : 'text-slate-500'
                      }`}
                    >
                      {item.meta}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-200 space-y-3">
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1.5">Active Role</p>
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-md">
              <button
                type="button"
                onClick={() => onChangeRole('operator')}
                className={`px-2 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  role === 'operator'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Operator
              </button>
              <button
                type="button"
                onClick={() => onChangeRole('administrator')}
                className={`px-2 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  role === 'administrator'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Admin
              </button>
            </div>
          </div>
          <div className="text-xs text-slate-500 leading-relaxed">
            <div className="font-medium text-slate-700">
              {role === 'administrator' ? 'Dr. Sarah Lindqvist' : 'Marcus Chen'}
            </div>
            <div>
              {role === 'administrator' ? 'Process Engineering · Admin' : 'Shift A · Bay A Line 01'}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
