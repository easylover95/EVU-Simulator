import type { Wagon } from '@/lib/supabase';
import { formatEuro } from '@/lib/status';
import {
  RENTAL_TERMS,
  rentalDailyIncome,
  rentalMonthlyIncome,
  rentalTermLabel,
  type RentalTermMonths,
} from '@/lib/rental';
import { Button } from '@/components/ui';

export function WagonRentModal({
  wagon,
  months,
  onMonths,
  onCancel,
  onConfirm,
}: {
  wagon: Wagon;
  months: RentalTermMonths;
  onMonths: (m: RentalTermMonths) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const daily = rentalDailyIncome(wagon.category, wagon.count, months);
  return (
    <div className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="fi-card max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="fi-card-header">Wagengruppe vermieten</div>
        <div className="space-y-3 p-4">
          <p className="text-xs text-slate-400">
            {wagon.count}× {wagon.type_code} {wagon.type_name} an ein fremdes EVU. Miete kommt täglich aufs
            Firmenkonto. Vollkasko immer inklusive — Schäden trägt der Mieter, keine Werkstattkosten bei euch.
          </p>
          <div className="space-y-1.5">
            <div className="text-[10px] font-bold uppercase text-slate-500">Laufzeit</div>
            {RENTAL_TERMS.map((term) => {
              const termDaily = rentalDailyIncome(wagon.category, wagon.count, term);
              const selected = term === months;
              return (
                <button
                  key={term}
                  type="button"
                  onClick={() => onMonths(term)}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left ${
                    selected
                      ? 'border-emerald-400 bg-emerald-950/40 text-white'
                      : 'border-amber-500/20 bg-slate-950/50 text-slate-300 hover:border-amber-400/50'
                  }`}
                >
                  <span className="text-xs font-bold">{rentalTermLabel(term)}</span>
                  <span className="text-[11px] font-bold text-emerald-400">{formatEuro(termDaily)}/Tag</span>
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2 text-center text-[11px]">
            <div className="app-glass-panel rounded-lg border border-amber-500/20 py-2">
              <div className="text-[9px] font-bold uppercase text-slate-500">Tagesmiete</div>
              <div className="font-bold text-emerald-400">{formatEuro(daily)}</div>
            </div>
            <div className="app-glass-panel rounded-lg border border-amber-500/20 py-2">
              <div className="text-[9px] font-bold uppercase text-slate-500">≈ 30 Tage</div>
              <div className="font-bold text-amber-300">{formatEuro(rentalMonthlyIncome(daily))}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={onConfirm}>
              Freigeben
            </Button>
            <Button variant="secondary" className="flex-1" onClick={onCancel}>
              Abbrechen
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
