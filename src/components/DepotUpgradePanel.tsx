import { useState } from 'react';
import { Lock, Wrench } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { formatEuro } from '@/lib/status';
import {
  canBuyDepotExpansion,
  expansionsFor,
  freeDepotCapacity,
  isExpansionOwned,
  locoBerthCap,
  nextExpansion,
  wagonBerthCap,
  wagonUnitCount,
  workshopSlotCap,
  type DepotExpansion,
  type DepotKind,
  type DepotState,
} from '@/lib/depot';
import type { Wagon } from '@/lib/supabase';

const KIND_TITLE: Record<DepotKind, string> = {
  loco: 'Lok-Stellplätze',
  wagon: 'Wagen-Stellplätze',
  workshop: 'Werkstatt-Slots',
};

export function DepotUpgradePanel({
  depot,
  companyLevel,
  balance,
  locoCount,
  wagons,
  workshopUsed,
  onBuy,
  compact = false,
}: {
  depot: DepotState;
  companyLevel: number;
  balance: number;
  locoCount: number;
  wagons: Wagon[];
  workshopUsed: number;
  onBuy: (expansionId: string) => boolean;
  compact?: boolean;
}) {
  const [pending, setPending] = useState<DepotExpansion | null>(null);
  const kinds: DepotKind[] = compact
    ? (['loco', 'wagon', 'workshop'].filter((k) => nextExpansion(depot, k as DepotKind)) as DepotKind[])
    : ['loco', 'wagon', 'workshop'];

  const caps = {
    loco: locoBerthCap(depot),
    wagon: wagonBerthCap(depot),
    workshop: workshopSlotCap(depot),
  };
  const used = {
    loco: locoCount,
    wagon: wagonUnitCount(wagons),
    workshop: workshopUsed,
  };

  return (
    <>
      <div className={compact ? 'grid gap-3 lg:grid-cols-3' : 'grid gap-3 lg:grid-cols-3'}>
        {kinds.map((kind) => {
          const next = nextExpansion(depot, kind);
          const rows = compact ? (next ? [next] : []) : expansionsFor(kind);
          return (
            <Card key={kind} className="p-4">
              <div className="text-[10px] font-bold uppercase tracking-wide text-amber-300">{KIND_TITLE[kind]}</div>
              <p className="mt-1 text-sm font-bold text-white">
                {used[kind]} / {caps[kind]} belegt · {freeDepotCapacity(depot, kind, used[kind])} frei
              </p>
              {next && (
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  Nächster Ausbau: {next.label} · {formatEuro(next.cost)} · ab Level {next.unlockLevel}
                  {companyLevel < next.unlockLevel ? ' (noch gesperrt)' : ''}
                </p>
              )}
              {!next && (
                <p className="mt-1 text-[11px] text-slate-500">Keine weiteren Stufen in dieser Linie.</p>
              )}
              <div className="mt-3 space-y-2">
                {rows.map((expansion) => {
                  const owned = isExpansionOwned(depot, expansion.id);
                  const buyable = canBuyDepotExpansion(depot, expansion, companyLevel);
                  const later = !owned && next?.id !== expansion.id;
                  return (
                    <div
                      key={expansion.id}
                      className="app-glass-panel rounded-lg border border-slate-700/70 px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[11px] font-bold text-slate-200">{expansion.label}</div>
                          <div className="text-[10px] text-slate-500">
                            +{expansion.add} · {formatEuro(expansion.cost)} · ab Lvl {expansion.unlockLevel}
                          </div>
                        </div>
                        {owned ? (
                          <span className="text-[10px] font-bold text-emerald-400">Ausgebaut</span>
                        ) : buyable ? (
                          <Button className="px-2 py-1" onClick={() => setPending(expansion)}>
                            Ausbauen
                          </Button>
                        ) : later ? (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500"
                            title="Zuerst den vorherigen Ausbau kaufen"
                          >
                            <Lock className="h-3 w-3" />
                            Reihenfolge
                          </span>
                        ) : (
                          <Button
                            variant="secondary"
                            className="px-2 py-1 opacity-80"
                            onClick={() => setPending(expansion)}
                            title={`Freischaltung ab Level ${expansion.unlockLevel}`}
                          >
                            <Lock className="h-3 w-3" />
                            Ab Lvl {expansion.unlockLevel}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {compact && !next && (
                  <p className="text-[11px] text-slate-500">Maximale Kapazität erreicht.</p>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {pending && (
        <div
          className="modal-scrim fixed inset-0 z-[70] flex items-center justify-center p-4"
          onClick={() => setPending(null)}
        >
          <div
            className="app-glass w-full max-w-md rounded-xl border-amber-500/30 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-white">Depotausbau bestätigen</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Möchtest du {pending.label} für {formatEuro(pending.cost)} wirklich ausbauen?
            </p>
            {companyLevel < pending.unlockLevel && (
              <p className="mt-2 text-[11px] font-bold text-amber-300">
                Freischaltung erst ab Firmen-Level {pending.unlockLevel} (aktuell Level {companyLevel}).
              </p>
            )}
            {balance < pending.cost && (
              <p className="mt-2 text-[11px] font-bold text-rose-400">
                Nicht genug Kapital ({formatEuro(balance)} verfügbar).
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPending(null)}>
                Abbrechen
              </Button>
              <Button
                disabled={balance < pending.cost || companyLevel < pending.unlockLevel}
                onClick={() => {
                  const ok = onBuy(pending.id);
                  if (ok) setPending(null);
                }}
              >
                <Wrench className="h-3 w-3" />
                Bestätigen
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
