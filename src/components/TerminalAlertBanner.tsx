import { useMemo } from 'react';
import { AlertTriangle, BellRing, ChevronRight } from 'lucide-react';

import { useTerminalSimulation } from '@/state/terminalSimulationStore';
import type { TerminalAlert } from '@/lib/terminalAlerts';

const EMPTY_ALERTS: Record<string, never> = {};

export function selectActiveTerminalAlerts(alertsById: Record<string, TerminalAlert>): TerminalAlert[] {
  const priority = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;
  return Object.values(alertsById)
    .filter((alert) => alert?.status === 'ACTIVE')
    .sort((left, right) => priority[left.severity] - priority[right.severity] || right.lastObservedTick - left.lastObservedTick);
}

function severityStyle(severity: 'CRITICAL' | 'WARNING' | 'INFO'): string {
  if (severity === 'CRITICAL') return 'border-rose-400/55 bg-rose-950/35 text-rose-100';
  if (severity === 'WARNING') return 'border-amber-400/55 bg-amber-950/35 text-amber-100';
  return 'border-cyan-400/45 bg-cyan-950/30 text-cyan-100';
}

/** Compact visual entry point. The full, acknowledged history stays in the alert centre. */
export function TerminalAlertBanner({ onOpenAlerts }: { onOpenAlerts: () => void }) {
  const alertsById = useTerminalSimulation((state) => state.alertsById ?? EMPTY_ALERTS);
  const alerts = useMemo(() => selectActiveTerminalAlerts(alertsById), [alertsById]);
  const primary = alerts[0] ?? null;
  if (!primary) return null;

  return (
    <button
      type="button"
      onClick={onOpenAlerts}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left shadow-lg transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-cyan-300 ${severityStyle(primary.severity)}`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-current/35 bg-slate-950/25"><AlertTriangle className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1"><span className="block text-[10px] font-black uppercase tracking-[0.14em] opacity-75">{alerts.length} aktive Warnung{alerts.length === 1 ? '' : 'en'}</span><span className="mt-0.5 block truncate text-sm font-bold">{primary.title}</span><span className="mt-0.5 block truncate text-xs opacity-85">{primary.metricLabel}: {primary.metricValue}</span></span>
      <span className="flex shrink-0 items-center gap-1 text-xs font-bold">Zentrale <ChevronRight className="h-4 w-4" /></span>
      <BellRing className="sr-only" />
    </button>
  );
}
