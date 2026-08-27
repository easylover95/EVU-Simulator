import { Handshake } from 'lucide-react';
import { formatEuro } from '@/lib/status';
import { Button } from '@/components/ui';
import type { Acquisition } from '@/lib/dealer';
import type { InvestmentForecast } from '@/lib/economyAdvisor';

export function DealerAcquireModal({
  name,
  price,
  how,
  busy = false,
  lines,
  footnote,
  warning,
  confirmDisabled = false,
  wagonQty,
  wagonGattung,
  forecast,
  onCancel,
  onConfirm,
}: {
  name: string;
  price: number;
  how: Acquisition;
  busy?: boolean;
  lines?: { label: string; amount: number }[];
  footnote?: string;
  warning?: string | null;
  confirmDisabled?: boolean;
  wagonQty?: number;
  wagonGattung?: string;
  forecast?: InvestmentForecast;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const verb = how === 'leasing' ? 'leasen' : 'kaufen';
  const priceText = how === 'leasing' ? `${formatEuro(price)} / Tag` : formatEuro(price);
  const blocked = Boolean(warning) || confirmDisabled;

  return (
    <div
      className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="fi-card w-full max-w-xl overflow-hidden shadow-[0_0_40px_rgba(251,191,36,0.12)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dealer-acquire-title"
      >
        <div className="fi-card-header flex items-center gap-2">
          <Handshake className="h-3.5 w-3.5 text-amber-400" />
          <span id="dealer-acquire-title">Erwerb bestätigen</span>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-sm leading-relaxed text-slate-200">
            {wagonQty != null && wagonGattung ? (
              <>
                Möchtest du <span className="font-bold text-white">{wagonQty}</span> Wagen der Gattung{' '}
                <span className="font-bold text-white">{wagonGattung}</span> für{' '}
                <span className="font-bold text-amber-300">{priceText}</span> {verb}?
              </>
            ) : (
              <>
                Möchten Sie <span className="font-bold text-white">{name}</span> wirklich für{' '}
                <span className="font-bold text-amber-300">{priceText}</span> {verb}?
              </>
            )}
          </p>
          {wagonQty != null && wagonGattung && (
            <p className="text-[11px] text-slate-400">{name}</p>
          )}
          {lines && lines.length > 0 && (
            <ul className="app-glass-panel space-y-1 rounded-lg border border-amber-500/20 p-3 text-[11px] text-slate-300">
              {lines.map((line) => (
                <li key={line.label} className="flex justify-between gap-3">
                  <span>{line.label}</span>
                  <span className="tabular-nums text-amber-200">{formatEuro(line.amount)}</span>
                </li>
              ))}
              <li className="flex justify-between gap-3 border-t border-amber-500/20 pt-1 font-bold text-white">
                <span>{how === 'leasing' ? 'Tagesrate' : 'Endpreis'}</span>
                <span className="tabular-nums text-amber-300">{priceText}</span>
              </li>
            </ul>
          )}
          {forecast && <InvestmentForecastPanel forecast={forecast} />}
          {footnote && <p className="text-[11px] text-slate-500">{footnote}</p>}
          {warning && (
            <p className="rounded-lg border border-rose-500/50 bg-rose-950/50 px-3 py-2 text-sm font-bold leading-relaxed text-rose-200">
              {warning}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={onCancel} disabled={busy}>
              Abbrechen
            </Button>
            <Button onClick={onConfirm} disabled={busy || blocked}>
              Ja, verbindlich erwerben
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InvestmentForecastPanel({ forecast }: { forecast: InvestmentForecast }) {
  const tone = forecast.liquidity.tone === 'critical'
    ? { border: 'border-rose-500/45', title: 'text-rose-200', number: 'text-rose-300' }
    : forecast.liquidity.tone === 'caution'
      ? { border: 'border-amber-500/45', title: 'text-amber-200', number: 'text-amber-300' }
      : { border: 'border-emerald-500/35', title: 'text-emerald-200', number: 'text-emerald-300' };
  const contribution = forecast.dailyContribution;
  return (
    <section className={`rounded-lg border ${tone.border} bg-slate-950/45 p-3 text-[11px]`}>
      <div className={`font-bold uppercase tracking-wide ${tone.title}`}>Investitions-Prognose vor Bindung</div>
      <dl className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Fixkosten / Tag</dt>
          <dd className="font-semibold text-white">{formatEuro(forecast.dailyFixedBefore)} → {formatEuro(forecast.dailyFixedAfter)}</dd>
          <dd className={forecast.additionalDailyFixed > 0 ? 'text-amber-300' : 'text-slate-400'}>+{formatEuro(forecast.additionalDailyFixed)} / Tag</dd>
        </div>
        <div>
          <dt className="text-slate-500">Liquidität nach Erwerb</dt>
          <dd className={`font-semibold ${tone.number}`}>{formatEuro(forecast.liquidity.afterCash)}</dd>
          <dd className="text-slate-400">Reserve-Ziel {formatEuro(forecast.liquidity.recommendedReserve)}</dd>
        </div>
        {contribution != null ? (
          <div className="border-t border-slate-700/70 pt-2 sm:col-span-2">
            <dt className="text-slate-500">Geschätzter Deckungsbeitrag / zusätzlichem Tageslauf</dt>
            <dd className={contribution >= 0 ? 'font-semibold text-emerald-300' : 'font-semibold text-rose-300'}>
              {formatEuro(contribution)} <span className="font-normal text-slate-400">aus {formatEuro(forecast.dailyRevenue ?? 0)} Erlös − {formatEuro(forecast.dailyOperatingCost ?? 0)} Trasse/Energie</span>
            </dd>
          </div>
        ) : (
          <div className="border-t border-slate-700/70 pt-2 text-slate-400 sm:col-span-2">{forecast.operationalLabel}</div>
        )}
        <div className="text-slate-400 sm:col-span-2">Instandhaltungs-Fonds: {formatEuro(forecast.maintenanceFundBalance)} · {forecast.liquidity.message}</div>
      </dl>
    </section>
  );
}
