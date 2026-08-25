import { Landmark, Train, Users, Wallet } from 'lucide-react';
import { formatEuro } from '@/lib/status';
import type { DailyFixedCosts } from '@/lib/dailyFixedCosts';

interface DailyFixedCostsCardProps {
  costs: DailyFixedCosts;
  variant?: 'full' | 'compact';
}

function Line({
  label,
  amount,
  muted,
}: {
  label: string;
  amount: number;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 py-1.5 last:border-0">
      <span className={`text-xs ${muted ? 'text-slate-500' : 'text-slate-300'}`}>{label}</span>
      <span className={`text-xs font-bold tabular-nums ${amount > 0 ? 'text-rose-300' : 'text-slate-500'}`}>
        {amount > 0 ? `−${formatEuro(amount)}` : formatEuro(0)}
      </span>
    </div>
  );
}

export function DailyFixedCostsCard({ costs, variant = 'full' }: DailyFixedCostsCardProps) {
  if (!costs) return null;
  const leaseLines = costs.leaseLines ?? [];
  const insuranceLines = costs.insuranceLines ?? [];
  if (variant === 'compact') {
    return (
      <div className="game-box" data-tutorial="tutorial-standgeld">
        <div className="game-box-header flex items-center gap-2">
          <Wallet className="h-3.5 w-3.5 text-rose-400" /> Tägliche Fixkosten
        </div>
        <div className="space-y-1.5 p-3">
          <Line label={`Leasing (${leaseLines.length})`} amount={costs.leasing} />
          <Line label="Bank (Dispo / Versicherung)" amount={costs.overdraftInterest + costs.insurance} />
          <Line
            label="Darlehen (Tilgung/Zins)"
            amount={costs.loanInstallments}
            muted={costs.loanInstallments === 0}
          />
          <Line label={`Personal (${costs.staffCount})`} amount={costs.personnel} />
          <Line
            label={`Standort / Standgeld (${costs.idleLocoCount} Loks, ${costs.idleWagonCount} Wagen inaktiv)`}
            amount={costs.depot}
          />
          <div className="flex items-center justify-between border-t border-slate-700 pt-2">
            <span className="text-[10px] font-bold uppercase text-slate-500">Summe / Spieltag</span>
            <span className="text-sm font-bold tabular-nums text-rose-400">−{formatEuro(costs.total)}</span>
          </div>
          <p className="text-[10px] text-slate-600">Anzeige der bereits laufenden Tagesbuchungen — keine Doppelabbuchung.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="game-box" data-tutorial="tutorial-standgeld">
      <div className="game-box-header flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2">
          <Wallet className="h-3.5 w-3.5 text-rose-400" /> Tägliche Fixkosten
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-rose-300">
          −{formatEuro(costs.total)} / Spieltag
        </span>
      </div>
      <div className="grid gap-0 md:grid-cols-3">
        <div className="border-b border-slate-800 p-3 md:border-b-0 md:border-r">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            <Train className="h-3 w-3 text-amber-400" /> Leasing
          </div>
          {leaseLines.length === 0 ? (
            <p className="text-[11px] text-slate-600">Keine aktiven Leasingverträge</p>
          ) : (
            leaseLines.map((line) => (
              <Line key={line.id} label={line.detail ? `${line.detail}: ${line.label}` : line.label} amount={line.amount} />
            ))
          )}
          <div className="mt-2 flex justify-between text-[11px] font-bold text-slate-400">
            <span>Loks {formatEuro(costs.leasingLoco)}</span>
            <span>Wagen {formatEuro(costs.leasingWagon)}</span>
          </div>
        </div>

        <div className="border-b border-slate-800 p-3 md:border-b-0 md:border-r">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            <Landmark className="h-3 w-3 text-amber-400" /> Bank / Kredit
          </div>
          <Line
            label="Dispozinsen (bei Minus)"
            amount={costs.overdraftInterest}
            muted={costs.overdraftInterest === 0}
          />
          <Line
            label="Darlehen (Tilgung/Zins)"
            amount={costs.loanInstallments}
            muted={costs.loanInstallments === 0}
          />
          {insuranceLines.map((line) => (
            <Line key={line.id} label={line.label} amount={line.amount} />
          ))}
        </div>

        <div className="p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            <Users className="h-3 w-3 text-amber-400" /> Personal
          </div>
          <Line
            label={`${costs.staffCount} Beschäftigte · Gehalt / 30`}
            amount={costs.personnel}
            muted={costs.personnel === 0}
          />
          {(costs.depotLines ?? []).map((line) => (
            <Line key={line.id} label={line.label} amount={line.amount} />
          ))}
          <p className="mt-3 text-[10px] leading-relaxed text-slate-600">
            Dieselben Beträge, die der Spieltag bereits abbucht (Leasing, Dispo, Darlehen, Versicherung, Gehalt, Depot).
            Hier nur Transparenz — keine zweite Abbuchung.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-amber-500/20 bg-slate-950/20 px-4 py-2.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Tägliche Fixkosten gesamt</span>
        <span className="text-lg font-bold tabular-nums text-rose-400">−{formatEuro(costs.total)}</span>
      </div>
    </div>
  );
}
