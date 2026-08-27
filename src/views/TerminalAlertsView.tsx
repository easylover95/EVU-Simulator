import { useMemo } from 'react';
import { AlertTriangle, BellRing, CheckCircle2, ChevronRight, CircleAlert, Info, ShieldAlert } from 'lucide-react';

import type { TerminalAlert, TerminalAlertDestination } from '@/lib/terminalAlerts';
import { useTerminalSimulation } from '@/state/terminalSimulationStore';

function alertStyle(alert: TerminalAlert): { card: string; icon: string; Icon: typeof AlertTriangle } {
  if (alert.severity === 'CRITICAL') return { card: 'border-rose-400/50 bg-rose-950/20', icon: 'text-rose-300', Icon: ShieldAlert };
  if (alert.severity === 'WARNING') return { card: 'border-amber-400/50 bg-amber-950/20', icon: 'text-amber-300', Icon: AlertTriangle };
  return { card: 'border-cyan-400/40 bg-cyan-950/20', icon: 'text-cyan-300', Icon: Info };
}

function destinationLabel(destination: TerminalAlertDestination): string {
  const labels: Record<TerminalAlertDestination, string> = {
    terminal: 'Terminal-Inbound',
    terminalmanagement: 'Terminal-Management',
    terminalanalytics: 'Terminal-Analyse',
    zugbildung: 'Baugleis-Zug',
  };
  return labels[destination];
}

function AlertCard({ alert, onNavigate }: { alert: TerminalAlert; onNavigate: (destination: TerminalAlertDestination) => void }) {
  const acknowledge = useTerminalSimulation((state) => state.acknowledgeAlert);
  const appearance = alertStyle(alert);
  const Icon = appearance.Icon;
  const active = alert.status === 'ACTIVE';
  return (
    <article className={`rounded-xl border p-3 shadow-sm ${appearance.card} ${alert.status === 'RESOLVED' ? 'opacity-65' : ''}`}>
      <div className="flex items-start gap-3"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-current/35 bg-slate-950/30 ${appearance.icon}`}><Icon className="h-5 w-5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className={`text-[10px] font-black uppercase tracking-[0.14em] ${appearance.icon}`}>{alert.severity === 'CRITICAL' ? 'Kritisch' : alert.severity === 'WARNING' ? 'Warnung' : 'Information'} · h {alert.lastObservedTick}</p><h3 className="mt-1 text-sm font-bold text-white">{alert.title}</h3></div><span className={`fi-pill ${alert.status === 'RESOLVED' ? 'fi-pill-gray' : alert.status === 'ACKNOWLEDGED' ? 'fi-pill-blue' : alert.severity === 'CRITICAL' ? 'fi-pill-red' : 'fi-pill-gold'}`}>{alert.status === 'ACTIVE' ? 'Offen' : alert.status === 'ACKNOWLEDGED' ? 'Quittiert' : 'Behoben'}</span></div><p className="mt-2 text-xs leading-relaxed text-slate-300">{alert.description}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-700/60 pt-2.5"><span className="text-xs font-bold text-slate-200"><span className="text-slate-500">{alert.metricLabel}: </span>{alert.metricValue}</span><div className="flex gap-2">{active && <button type="button" onClick={() => acknowledge(alert.id)} className="min-h-9 rounded-lg border border-slate-600 px-2.5 text-xs font-bold text-slate-300 hover:border-emerald-400 hover:text-emerald-200">Quittieren</button>}<button type="button" onClick={() => onNavigate(alert.destination)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-cyan-400/45 bg-cyan-950/30 px-2.5 text-xs font-bold text-cyan-100 hover:bg-cyan-950/60">{destinationLabel(alert.destination)} <ChevronRight className="h-3.5 w-3.5" /></button></div></div></div></div>
    </article>
  );
}

export function TerminalAlertsView({ onNavigate }: { onNavigate: (destination: TerminalAlertDestination) => void }) {
  const alerts = useTerminalSimulation((state) => state.alertsById);
  const ordered = useMemo(() => {
    const priority = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    return Object.values(alerts).sort((left, right) => {
      const statusPriority = { ACTIVE: 0, ACKNOWLEDGED: 1, RESOLVED: 2 };
      return statusPriority[left.status] - statusPriority[right.status]
        || priority[left.severity] - priority[right.severity]
        || right.lastObservedTick - left.lastObservedTick;
    });
  }, [alerts]);
  const activeCount = ordered.filter((alert) => alert.status === 'ACTIVE').length;
  const criticalCount = ordered.filter((alert) => alert.status === 'ACTIVE' && alert.severity === 'CRITICAL').length;

  return (
    <section className="space-y-4" aria-label="Terminal Alert Zentrale">
      <header className="flex flex-col gap-3 border-b border-cyan-400/20 pb-4 md:flex-row md:items-end md:justify-between"><div><div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300"><BellRing className="h-3.5 w-3.5" /> Nachrichten-Zentrale</div><h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">Betriebswarnungen</h2><p className="mt-1 text-sm text-slate-400">Automatisch aus Simulationszustand und Finanzanalyse abgeleitete Risiken. Quittierte Ursachen bleiben in Beobachtung.</p></div><div className="flex gap-2"><span className={`fi-pill ${criticalCount > 0 ? 'fi-pill-red' : 'fi-pill-gray'}`}>{criticalCount} kritisch</span><span className={`fi-pill ${activeCount > 0 ? 'fi-pill-gold' : 'fi-pill-green'}`}>{activeCount} offen</span></div></header>
      {ordered.length > 0 ? <div className="grid gap-3 xl:grid-cols-2">{ordered.map((alert) => <AlertCard key={alert.id} alert={alert} onNavigate={onNavigate} />)}</div> : <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/35 px-6 text-center"><CheckCircle2 className="h-10 w-10 text-emerald-300" /><h3 className="mt-3 text-base font-bold text-white">Keine kritischen Kennzahlen</h3><p className="mt-1 max-w-md text-sm text-slate-400">Beim nächsten bewussten Simulationstick überwacht die Zentrale Liquidität, Deckungsbeiträge, Liegegebühren und Personalunterhalt automatisch.</p></div>}
      {ordered.some((alert) => alert.status === 'RESOLVED') && <p className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs text-slate-400"><CircleAlert className="h-4 w-4 text-slate-500" /> Behobene Warnungen bleiben als nachvollziehbare Historie erhalten.</p>}
    </section>
  );
}
