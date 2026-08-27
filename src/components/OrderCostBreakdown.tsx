import { Fuel, Route, TrendingDown, Zap } from 'lucide-react';
import type { FuelType, Order } from '@/lib/supabase';
import { formatEuro } from '@/lib/status';
import {
  calcOrderOperatingCosts,
  DIESEL_EUR_PER_KM,
  ELECTRIC_EUR_PER_KM,
  energyLabel,
  type EnergyMode,
} from '@/lib/operatingCosts';
import { isBaugleisOrder, type AzfSource } from '@/lib/pdl';

interface OrderCostBreakdownProps {
  order: Order;
  fuelType?: FuelType | null;
  compact?: boolean;
  azfSource?: AzfSource;
  /** Baugleis: neither own AZF/RB nor PDL chosen yet — hide PDL until the player decides. */
  azfUnresolved?: boolean;
}

function MoneyRow({
  label,
  amount,
  hint,
  tone,
}: {
  label: string;
  amount: number;
  hint?: string;
  tone: 'gross' | 'cost' | 'net';
}) {
  const color =
    tone === 'gross' ? 'text-emerald-400' : tone === 'cost' ? 'text-rose-300' : amount >= 0 ? 'text-emerald-300' : 'text-rose-400';
  const prefix = tone === 'cost' && amount > 0 ? '−' : tone === 'gross' && amount > 0 ? '+' : '';
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-xs text-slate-300">{label}</div>
        {hint && <div className="text-[10px] text-slate-600">{hint}</div>}
      </div>
      <div className={`shrink-0 text-xs font-bold tabular-nums ${color}`}>
        {prefix}
        {formatEuro(Math.abs(amount))}
      </div>
    </div>
  );
}

function energyHint(mode: EnergyMode, km: number): string {
  const rate = mode === 'diesel' ? DIESEL_EUR_PER_KM : ELECTRIC_EUR_PER_KM;
  return `${rate.toFixed(2).replace('.', ',')} €/km × ${km} km · ${energyLabel(mode)}`;
}

export function OrderCostBreakdown({
  order,
  fuelType,
  compact,
  azfSource = 'pdl',
  azfUnresolved = false,
}: OrderCostBreakdownProps) {
  if (!order) return null;
  const source: AzfSource = azfUnresolved ? 'eigen' : azfSource;
  const diesel = calcOrderOperatingCosts(order, 'diesel', source);
  const electric = calcOrderOperatingCosts(order, 'elektrik', source);
  const chosen = fuelType ? calcOrderOperatingCosts(order, fuelType, source) : null;
  const daily = diesel.daily;
  const unit = daily ? ' / Tag' : '';
  const period = daily
    ? 'Täglich während des Einsatzes (parallel zum Tageserlös)'
    : 'Abbuchung beim Start der Fahrt · Erlös bei Abschluss';
  const tkmRevenue = Math.max(0, Number(order.tkm_revenue) || 0);
  const baseRevenue = daily ? 0 : Math.max(0, diesel.grossYield - tkmRevenue);
  const baugleisDieselOnly = isBaugleisOrder(order) && !chosen;

  return (
    <div className={`app-glass-panel rounded-sm border border-amber-500/25 ${compact ? 'p-2.5' : 'p-3'}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-200/90">
          <TrendingDown className="h-3 w-3" />
          {daily ? 'Tageskalkulation' : 'Auftragskalkulation'}
        </div>
        <span className="text-[10px] text-slate-600">{period}</span>
      </div>

      <div className="space-y-1.5">
        {!daily && (
          <>
            <MoneyRow
              label="Sockelpauschale"
              amount={baseRevenue}
              hint="Disposition, Bereitstellung und Zugvorlauf"
              tone="gross"
            />
            <MoneyRow
              label="Tonnenkilometer-Anteil"
              amount={tkmRevenue}
              hint={`${Math.round(Number(order.weight_t) || 0).toLocaleString('de-DE')} t × ${Math.round(Number(order.distance_km) || 0).toLocaleString('de-DE')} km · ${Number(order.eur_per_tkm || 0).toFixed(3).replace('.', ',')} €/tkm effektiv`}
              tone="gross"
            />
          </>
        )}
        <MoneyRow
          label={daily ? 'Brutto-Erlös (Tagespauschale)' : 'Brutto-Erlös'}
          amount={diesel.grossYield}
          hint={
            daily && order.deployment_days
              ? `${order.deployment_days} Tage Vertrag · Kostenbasis plus Einsatzmarge`
              : !daily
                ? 'Sockelpauschale + distanzproportionaler Tonnenkilometer-Anteil'
                : undefined
          }
          tone="gross"
        />
        <MoneyRow
          label={daily ? 'Trassenpreis (täglich)' : 'Trassenpreis'}
          amount={diesel.pathCost}
          hint={`${diesel.pathRatePerKm.toFixed(2).replace('.', ',')} €/Zug-km × ${diesel.distanceKm} km`}
          tone="cost"
        />

        {chosen ? (
          <MoneyRow
            label={daily ? `Energie ${energyLabel(chosen.energyMode)} (täglich)` : `Energie ${energyLabel(chosen.energyMode)}`}
            amount={chosen.energyCost}
            hint={`${energyHint(chosen.energyMode, chosen.distanceKm)} · zugewiesene Lok`}
            tone="cost"
          />
        ) : baugleisDieselOnly ? (
          <MoneyRow
            label={daily ? 'Energie Diesel (Baugleis, täglich)' : 'Energie Diesel (Baugleis)'}
            amount={diesel.energyCost}
            hint="Baugleis-Einsätze benötigen eine Diesel- oder Dual-Lok; kein Stromvergleich möglich"
            tone="cost"
          />
        ) : (
          <div className="rounded-sm border border-sky-400/20 bg-slate-950/40 p-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-sky-200">Traktionsvergleich</span>
              <span className="text-[10px] text-slate-500">Eine Option wählen · kein Doppelabzug</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-sm border border-amber-400/20 bg-amber-400/5 p-2">
                <div className="flex items-center gap-1 text-[10px] font-bold text-amber-200"><Fuel className="h-3 w-3" /> Diesel</div>
                <div className="mt-1 text-[10px] text-slate-400">Energie {formatEuro(diesel.energyCost)}{unit}</div>
                <div className={`mt-1 text-xs font-bold tabular-nums ${diesel.netProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  Netto {diesel.netProfit >= 0 ? '+' : '−'}{formatEuro(Math.abs(diesel.netProfit))}{unit}
                </div>
              </div>
              <div className="rounded-sm border border-sky-400/20 bg-sky-400/5 p-2">
                <div className="flex items-center gap-1 text-[10px] font-bold text-sky-200"><Zap className="h-3 w-3" /> E-Lok</div>
                <div className="mt-1 text-[10px] text-slate-400">Energie {formatEuro(electric.energyCost)}{unit}</div>
                <div className={`mt-1 text-xs font-bold tabular-nums ${electric.netProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  Netto {electric.netProfit >= 0 ? '+' : '−'}{formatEuro(Math.abs(electric.netProfit))}{unit}
                </div>
              </div>
            </div>
          </div>
        )}

        {isBaugleisOrder(order) && azfUnresolved && (
          <MoneyRow
            label="AZF/RB (noch nicht gewählt)"
            amount={0}
            hint="PDL-Tagessatz erscheint hier, sobald Personaldienstleister gewählt ist"
            tone="cost"
          />
        )}
        {isBaugleisOrder(order) && !azfUnresolved && diesel.pdlCost > 0 && (
          <MoneyRow
            label={daily ? 'PDL AZF/RB (täglich)' : `PDL AZF/RB (${diesel.pdlShifts} Schicht${diesel.pdlShifts === 1 ? '' : 'en'})`}
            amount={diesel.pdlCost}
            hint={`${formatEuro(diesel.pdlDaily)} / Tag · Personaldienstleister (650–850 €)`}
            tone="cost"
          />
        )}
        {isBaugleisOrder(order) && !azfUnresolved && diesel.pdlCost === 0 && (
          <MoneyRow
            label="AZF/RB (eigenes Personal)"
            amount={0}
            hint="Fest angestellter Arbeitszugführer — keine PDL-Tagessätze"
            tone="cost"
          />
        )}
      </div>

      <div className="mt-2 space-y-1 border-t border-slate-800 pt-2">
        {chosen ? (
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white">Netto-Gewinn{unit}</span>
            <span className={`text-sm font-bold tabular-nums ${chosen.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {chosen.netProfit >= 0 ? '+' : '−'}
              {formatEuro(Math.abs(chosen.netProfit))}
              {unit}
            </span>
          </div>
        ) : baugleisDieselOnly ? (
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white">Netto bei Diesel{unit}</span>
            <span className={`text-sm font-bold tabular-nums ${diesel.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {diesel.netProfit >= 0 ? '+' : '−'}
              {formatEuro(Math.abs(diesel.netProfit))}
              {unit}
            </span>
          </div>
        ) : (
          <span className="block text-[10px] text-slate-500">Der Traktionsvergleich zeigt zwei Alternativen. Erst nach der Zuweisung wird nur die gewählte Energieart als Abzug gebucht.</span>
        )}
      </div>

      {!compact && (
        <div className="mt-2 flex flex-col gap-1 text-[10px] text-slate-600">
          <span className="inline-flex items-center gap-1">
            <Route className="h-2.5 w-2.5" /> {diesel.pathFormula}
          </span>
          <span className="inline-flex items-center gap-1">
            <Fuel className="h-2.5 w-2.5" /> {chosen ? `Gebuchte Traktion: ${energyLabel(chosen.energyMode)} · ${chosen.energyFormula}` : baugleisDieselOnly ? `Baugleis-Traktion: Diesel · ${diesel.energyFormula}` : `Alternativen: Diesel ${diesel.energyFormula} | Strom ${electric.energyFormula}`}
          </span>
        </div>
      )}
    </div>
  );
}
