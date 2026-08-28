import { createPortal } from 'react-dom';
import { Ban, HardHat, Package, Timer } from 'lucide-react';
import type { Locomotive, Order, Wagon } from '@/lib/supabase';
import {
  formatEuro,
  clampOrderMinBrh,
  getOrderStatusConfig,
  MIN_BRH_RANGE,
} from '@/lib/status';
import { isBaugleisEinsatz } from '@/lib/orderMarket';
import { bestFleetFit, isOrderElectrified, type AssignmentFit } from '@/lib/traction';
import { OrderCostBreakdown } from '@/components/OrderCostBreakdown';
import { WagonShortageBanner } from '@/components/WagonShortageBanner';
import { checkWagonAvailability } from '@/lib/brh';
import { Button } from '@/components/ui';
import type { Acquisition } from '@/lib/dealer';
import { corridorCountryHint } from '@/lib/networkAccess';
import { ContextHelpTooltip } from '@/components/ContextHelpTooltip';
import type { HandbookOpenTo } from '@/lib/handbook';
import { buildOrderContractCard, derivedUsableLengthM, locoHasEtcsFleet } from '@/lib/contractCard';

export interface ContractDetailsModalProps {
  order: Order;
  wagons: Wagon[];
  locomotives: Locomotive[];
  companyLevel: number;
  bekanntheit: number;
  gameNow: Date;
  gate: string | null;
  onClose: () => void;
  onDisponieren?: (order: Order) => void;
  onOpenHandbook?: (target?: HandbookOpenTo) => void;
  onOpenNetworkDealer?: () => void;
  onBuyMissingWagons?: (typeCode: string, qty: number) => void;
  onQuickAcquireWagons?: (typeCode: string, qty: number, how: Acquisition) => void;
  onOpenBuildings?: () => void;
  freeBerths?: number;
}

function formatPenalty(order: Order): string {
  if (order.type === 'baugleis' && Number(order.penalty_per_min) > 0) {
    return `${formatEuro(Number(order.penalty_per_min))}/Min`;
  }
  return formatEuro(Number(order.penalty));
}

function usableLengthLabel(order: Order, wagons: Wagon[]): string {
  const meters = derivedUsableLengthM(order, wagons);
  return meters != null ? `${meters.toLocaleString('de-DE')} m` : '—';
}

function hakenlastHint(fit: AssignmentFit | null | undefined): string {
  if (!fit) return 'Hakenlast im Detail prüfen';
  return `Hakenlast ${fit.trailingLoadT.toLocaleString('de-DE')} t ${fit.ok ? 'trägt die Last' : 'zu gering'}`;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-slate-800 pb-1">
      <div className="text-[10px] font-bold uppercase text-slate-500">{label}</div>
      <div className="text-sm font-medium text-white">{value}</div>
    </div>
  );
}

function sperrpauseCountdown(
  start: string,
  end: string,
  now: Date,
): { text: string; active: boolean; startsIn: string | null } {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  let inWindow: boolean;
  if (startMinutes < endMinutes) {
    inWindow = currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    inWindow = currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  if (inWindow) {
    let remaining: number;
    if (endMinutes > currentMinutes) {
      remaining = endMinutes - currentMinutes;
    } else {
      remaining = 24 * 60 - currentMinutes + endMinutes;
    }
    const h = Math.floor(remaining / 60);
    const m = remaining % 60;
    return { text: `${h}h ${m}m`, active: true, startsIn: null };
  }

  let untilStart: number;
  if (startMinutes > currentMinutes) {
    untilStart = startMinutes - currentMinutes;
  } else {
    untilStart = 24 * 60 - currentMinutes + startMinutes;
  }
  const h = Math.floor(untilStart / 60);
  const m = untilStart % 60;
  return { text: `${h}h ${m}m`, active: false, startsIn: `${h}h ${m}m` };
}

function SperrpauseBanner({
  start,
  end,
  penaltyPerMin,
  now,
}: {
  start: string;
  end: string;
  penaltyPerMin: number;
  now: Date;
}) {
  const sp = sperrpauseCountdown(start, end, now);
  return (
    <div className={`rounded-sm border p-2.5 ${sp.active ? 'border-rose-500/60 bg-rose-900/30' : 'border-rose-500/30 bg-rose-900/15'}`}>
      <div className="flex items-center gap-2 text-xs font-bold text-rose-300">
        <Ban className="h-3.5 w-3.5" /> Sperrpause-Fenster
      </div>
      <div className="mt-1 text-sm font-medium text-white">
        {start} – {end} Uhr
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-xs text-rose-300/80">Pönale: {formatEuro(penaltyPerMin)} / Min.</span>
        <span className={`flex items-center gap-1 text-sm font-bold ${sp.active ? 'text-rose-300' : 'text-slate-300'}`}>
          <Timer className={`h-3.5 w-3.5 ${sp.active ? 'animate-pulse' : ''}`} />
          {sp.active ? `Aktiv: ${sp.text}` : `in ${sp.startsIn}`}
        </span>
      </div>
    </div>
  );
}

export function ContractDetailsModal({
  order,
  wagons,
  locomotives,
  companyLevel,
  bekanntheit,
  gameNow,
  gate,
  onClose,
  onDisponieren,
  onOpenHandbook,
  onOpenNetworkDealer,
  onBuyMissingWagons,
  onQuickAcquireWagons,
  onOpenBuildings,
  freeBerths,
}: ContractDetailsModalProps) {
  const wagonCheck = checkWagonAvailability(order, wagons);
  const canDispatch = wagonCheck.sufficient && !gate;

  const dialog = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="contract-details-title"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 p-4">
          <h3 id="contract-details-title" className="flex min-w-0 items-center gap-2 text-lg font-bold text-white">
            {order.type === 'baugleis' ? (
              <HardHat className="h-4 w-4 shrink-0 text-amber-500" />
            ) : (
              <Package className="h-4 w-4 shrink-0 text-amber-500" />
            )}
            <span className="truncate">Auftragsdetails · {order.order_number}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            aria-label="Schließen"
          >
            ✕
          </button>
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-6 text-slate-200">
          <div className="text-sm font-bold text-white">{order.title}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailRow
              label="Streckenprofil"
              value={`${order.origin} → ${order.destination} · ${order.distance_km} km · ${corridorCountryHint(order)}`}
            />
            <DetailRow
              label="Fahrleitung"
              value={
                isOrderElectrified(order)
                  ? 'Elektrifiziert — E-Lok, Dual und Diesel zulässig'
                  : 'Keine Oberleitung — nur Diesel oder Dual, Hakenlast prüfen'
              }
            />
            <div className="-mt-2 flex justify-end">
              <ContextHelpTooltip topicId="oberleitung" onOpenManual={onOpenHandbook} />
              <ContextHelpTooltip topicId="nutzlaenge" onOpenManual={onOpenHandbook} />
            </div>
            <DetailRow label="Fuhrpark-Check" value={bestFleetFit(order, locomotives)?.message ?? 'Kein Triebfahrzeug im Bestand'} />
            <DetailRow label="Tonnage" value={`${Number(order.weight_t || 0).toLocaleString('de-DE')} t`} />
            <DetailRow label="Hakenlast" value={hakenlastHint(bestFleetFit(order, locomotives))} />
            <DetailRow label="Nutzlänge" value={usableLengthLabel(order, wagons)} />
            <DetailRow
              label="Mindest-Brh"
              value={`${clampOrderMinBrh(order.type, order.min_brh)} (${(MIN_BRH_RANGE[order.type] ?? MIN_BRH_RANGE.gueterverkehr).min}–${(MIN_BRH_RANGE[order.type] ?? MIN_BRH_RANGE.gueterverkehr).max})`}
            />
            <DetailRow
              label="Wagenbedarf"
              value={order.required_wagon_type ? `${order.required_wagon_count}× ${order.required_wagon_type}` : '—'}
            />
            {order.customer && <DetailRow label="Kunde" value={order.customer} />}
            {isBaugleisEinsatz(order) && order.deployment_days && (
              <DetailRow
                label="Einsatzdauer"
                value={`${order.deployment_days} Tage · ${order.required_drivers ?? 2} Tf Schichtwechsel · Diesel-/Baulok`}
              />
            )}
            <DetailRow
              label={isBaugleisEinsatz(order) ? 'Garantieerlös' : 'Ertrag'}
              value={
                isBaugleisEinsatz(order) && order.daily_rate
                  ? `${formatEuro(order.daily_rate)} / Tag · ${formatEuro(Number(order.yield))} Vertrag`
                  : formatEuro(Number(order.yield))
              }
            />
            {(order.tkm_revenue || order.eur_per_tkm) && (
              <DetailRow
                label="Tonnenkilometer"
                value={`${(order.distance_km * order.weight_t).toLocaleString('de-DE')} tkm · ${order.eur_per_tkm ? `${order.eur_per_tkm.toFixed(3).replace('.', ',')} €/tkm` : '—'} (im Ertrag enthalten)`}
              />
            )}
            <DetailRow label="Pönale" value={formatPenalty(order)} />
            <div className="-mt-2 flex justify-end">
              <ContextHelpTooltip topicId="poenale" onOpenManual={onOpenHandbook} />
            </div>
            {order.sperrpause_start && (
              <DetailRow label="Sperrpause" value={`${order.sperrpause_start} – ${order.sperrpause_end} Uhr`} />
            )}
            <DetailRow
              label="Status"
              value={order.status === 'offen' ? 'Gültig' : getOrderStatusConfig(order.status).label}
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {buildOrderContractCard(order, wagons, {
              level: companyLevel,
              reputation: bekanntheit,
              hasEtcs: locoHasEtcsFleet(locomotives),
            }).clearances.map((row) => (
              <span key={row.id} className={row.met ? 'fi-pill fi-pill-green' : 'fi-pill fi-pill-orange'}>
                {row.label}: {row.detail}
              </span>
            ))}
          </div>

          {gate && (
            <p className="rounded-sm border border-rose-500/50 bg-rose-950/40 p-2 text-[11px] font-bold text-rose-200">
              {gate}{' '}
              {onOpenNetworkDealer && (
                <button type="button" className="underline" onClick={onOpenNetworkDealer}>
                  Zum Händler
                </button>
              )}
            </p>
          )}

          <div className="relative">
            <OrderCostBreakdown order={order} />
            <div className="absolute right-1 top-1">
              <ContextHelpTooltip topicId="deckungsbeitrag" onOpenManual={onOpenHandbook} />
            </div>
          </div>

          <WagonShortageBanner
            check={wagonCheck}
            onQuickAcquire={onQuickAcquireWagons}
            onOpenDealer={onBuyMissingWagons}
            onOpenBuildings={onOpenBuildings}
            freeBerths={freeBerths}
          />

          {order.type === 'baugleis' && order.sperrpause_start && order.sperrpause_end && (
            <SperrpauseBanner
              start={order.sperrpause_start}
              end={order.sperrpause_end}
              penaltyPerMin={Number(order.penalty_per_min)}
              now={gameNow}
            />
          )}

          {order.notes && (
            <div className="rounded-sm border border-slate-700 bg-slate-800/50 p-2 text-xs text-slate-400">{order.notes}</div>
          )}

          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-800 pt-4">
            <Button variant="secondary" onClick={onClose}>
              Schließen
            </Button>
            {order.status === 'offen' && (
              <Button
                disabled={!canDispatch}
                onClick={() => {
                  if (!canDispatch) return;
                  onClose();
                  onDisponieren?.(order);
                }}
              >
                Zur Disposition
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
