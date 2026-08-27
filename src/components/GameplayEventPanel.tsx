import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDollarSign, ShieldAlert, Trophy } from 'lucide-react';

import { useTerminalSimulation } from '@/state/terminalSimulationStore';

function euro(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

/**
 * Surface for fully disclosed Phase-5 choices. It deliberately exposes all
 * costs, reputation deltas and operational consequences before a choice commits.
 */
export function GameplayEventPanel() {
  const state = useTerminalSimulation((snapshot) => snapshot);
  const [feedback, setFeedback] = useState<string | null>(null);
  const openEvent = useMemo(
    () => Object.values(state.gameplayEventsById).find((event) => event.status === 'OPEN') ?? null,
    [state.gameplayEventsById],
  );
  const progress = state.gameProgress;

  if (!openEvent && progress.status === 'ACTIVE') return null;

  const stateCard = progress.status === 'WON'
    ? {
      icon: Trophy,
      title: 'Terminal-Meilenstein erreicht',
      body: `Gewonnen: ${progress.completedMajorProjects}/${progress.requiredMajorProjects} Großprojekte abgeschlossen, Reputation ${progress.reputationPoints}/${progress.reputationTarget}.`,
      className: 'border-emerald-400/50 bg-emerald-950/45 text-emerald-50',
    }
    : progress.status === 'INSOLVENT'
      ? {
        icon: ShieldAlert,
        title: 'Terminal insolvent',
        body: `Das Konto blieb ${progress.consecutiveNegativeTicks} Simulationsstunden negativ. Der Betrieb ist beendet.`,
        className: 'border-rose-400/55 bg-rose-950/55 text-rose-50',
      }
      : progress.status === 'INSOLVENCY_WARNING'
        ? {
          icon: AlertTriangle,
          title: 'Liquiditätswarnung',
          body: `Noch ${Math.max(0, progress.insolvencyAfterNegativeTicks - progress.consecutiveNegativeTicks)} Simulationsstunden bis zur Insolvenz. Erzeuge Einnahmen oder senke laufende Kosten.`,
          className: 'border-amber-400/55 bg-amber-950/45 text-amber-50',
        }
        : null;

  const resolve = (choiceId: Parameters<typeof state.resolveGameplayEvent>[1]) => {
    const result = state.resolveGameplayEvent(openEvent!.id, choiceId);
    setFeedback(result.resolved ? 'Entscheidung wurde in das Ereignisprotokoll übernommen.' : 'Die Entscheidung konnte nicht mehr übernommen werden.');
  };

  return (
    <aside className="space-y-3" aria-live="polite">
      {stateCard && (() => {
        const Icon = stateCard.icon;
        return (
          <section className={`rounded-xl border p-4 shadow-xl ${stateCard.className}`}>
            <div className="flex items-start gap-3">
              <Icon className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <h3 className="text-sm font-black">{stateCard.title}</h3>
                <p className="mt-1 text-xs leading-relaxed opacity-90">{stateCard.body}</p>
              </div>
            </div>
          </section>
        );
      })()}

      {openEvent && (
        <section className="rounded-xl border border-amber-400/60 bg-slate-950/95 shadow-2xl shadow-black/40">
          <div className="border-b border-amber-400/25 bg-amber-950/35 px-4 py-3">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-amber-300">
              <AlertTriangle className="h-4 w-4" /> Betriebsentscheidung · Simulationsstunde {openEvent.createdTick}
            </div>
            <h3 className="mt-1 text-base font-bold text-white">{openEvent.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">{openEvent.description}</p>
          </div>
          <div className="space-y-2 p-3">
            {openEvent.choices.map((choice) => (
              <button key={choice.id} type="button" onClick={() => resolve(choice.id)} className="w-full rounded-lg border border-slate-700 bg-slate-900/90 p-3 text-left transition hover:border-amber-400/70 hover:bg-amber-950/25 focus:outline-none focus:ring-2 focus:ring-amber-400">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm font-bold text-slate-100">{choice.label}</span>
                  <span className={`shrink-0 text-xs font-black tabular-nums ${choice.immediateCostCents > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                    {choice.immediateCostCents > 0 ? `−${euro(choice.immediateCostCents)}` : '0 €'}
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{choice.consequence}</p>
                <p className={`mt-2 text-[10px] font-bold uppercase tracking-wide ${choice.reputationDelta < 0 ? 'text-rose-300' : choice.reputationDelta > 0 ? 'text-emerald-300' : 'text-slate-500'}`}>
                  Reputation {choice.reputationDelta > 0 ? '+' : ''}{choice.reputationDelta}
                </p>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 border-t border-slate-700/80 px-4 py-2.5 text-[10px] leading-relaxed text-slate-500">
            <CircleDollarSign className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
            Eine Entscheidung ist notwendig, bevor ein weiteres Zufallsereignis angeboten wird.
          </div>
        </section>
      )}

      {feedback && <p className="flex items-center gap-2 text-xs text-cyan-200"><CheckCircle2 className="h-4 w-4" /> {feedback}</p>}
    </aside>
  );
}
