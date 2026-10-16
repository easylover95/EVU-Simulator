import { useEffect, useMemo, useState, memo } from 'react';
import {
  Package,
  HardHat,
  Clock,
  Search,
  Info,
  ClipboardList,
  Ban,
  Timer,
  RefreshCw,
  ChevronsUpDown,
} from 'lucide-react';
import type { Locomotive, Order, OrderType, Wagon } from '@/lib/supabase';
import {
  formatEuro,
  timeRemaining,
  clampOrderMinBrh,
  getOrderStatusConfig,
  getOrderTypeConfig,
  getOrderPillClass,
  MIN_BRH_RANGE,
} from '@/lib/status';
import { isBaugleisEinsatz, isOpenUnexpiredMarketOrder } from '@/lib/orderMarket';
import { bestFleetFit, isOrderElectrified } from '@/lib/traction';
import { useGameClock } from '@/lib/GameClockContext';
import { SectionShell } from '@/components/SectionShell';
import { OrderCostBreakdown } from '@/components/OrderCostBreakdown';
import { WagonShortageBanner } from '@/components/WagonShortageBanner';
import { checkWagonAvailability, wagonShortageLabel } from '@/lib/brh';
import { Button } from '@/components/ui';
import type { Acquisition } from '@/lib/dealer';
import { corridorCountryHint, networkAcceptBlock, type NetworkAccessState } from '@/lib/networkAccess';
import { closureBlockMessage, orderBlockedByClosure, type WorldEventState } from '@/lib/events';

interface OrderMarketViewProps {
  orders: Order[];
  wagons: Wagon[];
  loading: boolean;
  onDisponieren?: (order: Order) => void;
  onOpenDisposition?: () => void;
  onReject?: (order: Order) => void;
  onRefreshMarket?: () => void;
  marketRefreshLocked?: boolean;
  onCleanupExpired?: () => void;
  onBuyMissingWagons?: (typeCode: string, qty: number) => void;
  onQuickAcquireWagons?: (typeCode: string, qty: number, how: Acquisition) => void;
  onOpenBuildings?: () => void;
  freeBerths?: number;
  networkAccess?: NetworkAccessState;
  locomotives?: Locomotive[];
  worldEvents?: WorldEventState;
  onOpenNetworkDealer?: () => void;
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

function formatPenalty(order: Order): string {
  if (order.type === 'baugleis' && Number(order.penalty_per_min) > 0) {
    return `${formatEuro(Number(order.penalty_per_min))}/Min`;
  }
  return formatEuro(Number(order.penalty));
}

type MarketSortKey = 'weight' | 'yield' | 'penalty' | 'frist';
type SortDir = 'asc' | 'desc';

function penaltySortValue(order: Order): number {
  if (order.type === 'baugleis' && Number(order.penalty_per_min) > 0) {
    return Number(order.penalty_per_min);
  }
  return Number(order.penalty) || 0;
}

function marketSortValue(order: Order, key: MarketSortKey, now: Date): number {
  switch (key) {
    case 'weight':
      return Number(order.weight_t) || 0;
    case 'yield':
      return Number(order.yield) || 0;
    case 'penalty':
      return penaltySortValue(order);
    case 'frist':
      return order.deadline ? new Date(order.deadline).getTime() - now.getTime() : Number.NEGATIVE_INFINITY;
  }
}

function SortHeader({
  label,
  column,
  active,
  dir,
  onSort,
}: {
  label: string;
  column: MarketSortKey;
  active: boolean;
  dir: SortDir;
  onSort: (column: MarketSortKey) => void;
}) {
  return (
    <th aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex cursor-pointer items-center gap-1 bg-transparent p-0 font-bold uppercase tracking-wide ${
          active ? 'text-amber-300' : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        {label}
        {active ? (
          <span aria-hidden className="text-[10px] leading-none">
            {dir === 'asc' ? '▲' : '▼'}
          </span>
        ) : (
          <ChevronsUpDown aria-hidden className="h-3 w-3 text-slate-600" />
        )}
      </button>
    </th>
  );
}

function durationBadge(days: number): { label: string; className: string } {
  if (days >= 180) return { label: `MEGA ${days} Tage`, className: 'fi-pill fi-pill-gold' };
  if (days >= 90) return { label: `Langzeit ${days} Tage`, className: 'fi-pill fi-pill-orange' };
  return { label: `${days} Tage`, className: 'fi-pill fi-pill-orange' };
}

export const OrderMarketView = memo(function OrderMarketView({
  orders,
  wagons,
  loading,
  onDisponieren,
  onOpenDisposition,
  onReject,
  onRefreshMarket,
  marketRefreshLocked = false,
  onCleanupExpired,
  onBuyMissingWagons,
  onQuickAcquireWagons,
  onOpenBuildings,
  freeBerths,
  networkAccess,
  locomotives = [],
  worldEvents,
  onOpenNetworkDealer,
}: OrderMarketViewProps) {
  const { gameNow, tick } = useGameClock();
  const [filter, setFilter] = useState<'all' | OrderType | 'einsatz'>('all');
  const [search, setSearch] = useState('');
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [sortKey, setSortKey] = useState<MarketSortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const toggleSort = (column: MarketSortKey) => {
    if (sortKey === column) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
      return;
    }
    setSortKey(column);
    setSortDir('desc');
  };

  function openOrder(order: Order) {
    setDetailOrder(order);
  }

  function orderGate(order: Order): string | null {
    const closed = orderBlockedByClosure(order, tick, worldEvents?.closures);
    if (closed) return closureBlockMessage(closed, tick);
    if (networkAccess) return networkAcceptBlock(order, networkAccess, locomotives);
    return null;
  }

  function acceptOrder(order: Order) {
    const gate = orderGate(order);
    if (gate) {
      setDetailOrder(order);
      return;
    }
    const check = checkWagonAvailability(order, wagons);
    if (!check.sufficient) {
      setDetailOrder(order);
      return;
    }
    onDisponieren?.(order);
  }

  useEffect(() => {
    onCleanupExpired?.();
  }, [onCleanupExpired, gameNow]);

  const marketOrders = useMemo(
    () => orders.filter((o) => isOpenUnexpiredMarketOrder(o, gameNow)),
    [orders, gameNow],
  );

  const filtered = useMemo(() => {
    let result = marketOrders;
    if (filter === 'einsatz') result = result.filter((o) => isBaugleisEinsatz(o));
    else if (filter !== 'all') result = result.filter((o) => o.type === filter && !isBaugleisEinsatz(o));
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(
        (o) =>
          o.title.toLowerCase().includes(s) ||
          o.order_number.toLowerCase().includes(s) ||
          o.origin.toLowerCase().includes(s) ||
          o.destination.toLowerCase().includes(s) ||
          (o.customer ?? '').toLowerCase().includes(s),
      );
    }
    return result;
  }, [marketOrders, filter, search]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const cmp = marketSortValue(a, sortKey, gameNow) - marketSortValue(b, sortKey, gameNow);
      if (cmp === 0) return a.order_number.localeCompare(b.order_number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDir, gameNow]);

  const fleetFits = useMemo(() => {
    const next = new Map<string, ReturnType<typeof bestFleetFit>>();
    for (const order of sorted) next.set(order.id, bestFleetFit(order, locomotives));
    return next;
  }, [sorted, locomotives]);

  const marketActions = (
    <div className="fi-market-actions flex flex-wrap items-center gap-2">
      {onOpenDisposition && (
        <Button onClick={onOpenDisposition} className="whitespace-nowrap">
          <ClipboardList className="h-3 w-3" />
          Zur Disposition
        </Button>
      )}
      {onRefreshMarket && (
        <span
          className="inline-flex"
          title={marketRefreshLocked ? 'Heute bereits aktualisiert' : 'Nur 1× pro Ingame-Tag möglich'}
        >
          <button
            type="button"
            onClick={onRefreshMarket}
            disabled={marketRefreshLocked}
            aria-label={marketRefreshLocked ? 'Heute bereits aktualisiert' : 'Neue Aufträge laden'}
            className="btn-action btn-action-detail disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-slate-900/80"
          >
            <RefreshCw className="h-3 w-3" />
            {marketRefreshLocked ? 'Heute aktualisiert' : 'Neue Aufträge'}
          </button>
        </span>
      )}
      <div className="fi-market-search relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suchen..."
          className="w-full rounded-lg border border-slate-600 bg-slate-900 py-1.5 pl-7 pr-2 text-xs text-white outline-none focus:border-amber-500"
        />
      </div>
    </div>
  );

  if (loading) {
    return (
      <SectionShell title="Frachtbörse" subtitle="Spot-Aufträge und Baustelleneinsätze" actions={marketActions}>
        <div className="flex h-64 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-amber-500" />
        </div>
      </SectionShell>
    );
  }

  return (
    <SectionShell
      title="Frachtbörse"
      subtitle={`${marketOrders.length} Aufträge · Generator berücksichtigt Fuhrpark (E-/Diesel, Hakenlast) · Frühspiel: mindestens 3 Leichtaufträge mit 4–6 Wagen · Schwere Züge ab Level 3 + 36 Wagen-Stellplätzen · Brh Güter ${MIN_BRH_RANGE.gueterverkehr.min}–${MIN_BRH_RANGE.gueterverkehr.max} · Bau ${MIN_BRH_RANGE.baugleis.min}–${MIN_BRH_RANGE.baugleis.max}`}
      actions={marketActions}
      tutorialId="tutorial-frachtboerse"
    >

      <div className="fi-filter-bar">
        {(
          [
            ['all', 'Alle'],
            ['gueterverkehr', 'Güterverkehr'],
            ['baugleis', 'Baustelle'],
            ['einsatz', 'Baugleis-Einsatz'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`fi-filter ${filter === key ? 'fi-filter-active' : ''}`}
          >
            {(key === 'baugleis' || key === 'einsatz') && <HardHat className="h-3 w-3" />}
            {key === 'gueterverkehr' && <Package className="h-3 w-3" />}
            {label}
          </button>
        ))}
      </div>

      <div className="fi-card overflow-x-auto">
        <table className="fi-table fi-mobile-card-table">
          <thead>
            <tr>
              <th>Auftrags-Nr.</th>
              <th>Typ</th>
              <th>Kunde / Titel</th>
              <th>Strecke</th>
              <SortHeader label="Last (t)" column="weight" active={sortKey === 'weight'} dir={sortDir} onSort={toggleSort} />
              <th title="Erforderliche Bremshundertstel (Mindest-Bremsleistung für diese Strecke)">
                Mindest-Brh
              </th>
              <SortHeader label="Ertrag (€)" column="yield" active={sortKey === 'yield'} dir={sortDir} onSort={toggleSort} />
              <SortHeader label="Pönale" column="penalty" active={sortKey === 'penalty'} dir={sortDir} onSort={toggleSort} />
              <SortHeader label="Frist" column="frist" active={sortKey === 'frist'} dir={sortDir} onSort={toggleSort} />
              <th>Status</th>
              <th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={11} className="fi-mobile-empty-state py-8 text-center text-slate-500">
                  Keine Aufträge in dieser Ansicht
                </td>
              </tr>
            )}
            {sorted.map((order) => {
              const typeCfg = getOrderTypeConfig(order.type);
              const statusCfg = getOrderStatusConfig(order.status);
              const time = order.deadline
                ? timeRemaining(order.deadline, gameNow, { accepted: order.status !== 'offen' })
                : null;
              const minBrh = clampOrderMinBrh(order.type, order.min_brh);
              const isConstruction = order.type === 'baugleis';
              const einsatz = isBaugleisEinsatz(order);
              const badge = einsatz && order.deployment_days ? durationBadge(order.deployment_days) : null;
              const wagonCheck = checkWagonAvailability(order, wagons);
              const shortage = wagonShortageLabel(wagonCheck);
              const gate = orderGate(order);
              return (
                <tr key={order.id} className="fi-deferred-list-row cursor-pointer" onClick={() => openOrder(order)}>
                  <td data-label="Auftrag" className="fi-mobile-card-title font-mono text-[11px] font-bold text-white">{order.order_number}</td>
                  <td data-label="Typ">
                    <div className="flex flex-col items-start gap-1">
                      <span className={`inline-flex items-center gap-1 ${isConstruction ? 'fi-pill fi-pill-orange' : 'fi-pill fi-pill-blue'}`}>
                        {isConstruction ? <HardHat className="h-3 w-3" /> : <Package className="h-3 w-3" />}
                        {einsatz ? 'Baugleis-Einsatz' : typeCfg.label}
                      </span>
                      {badge && <span className={badge.className}>{badge.label}</span>}
                    </div>
                  </td>
                  <td data-label="Fracht" className="fi-mobile-card-summary max-w-[240px] font-medium text-white">
                    <div>{order.title}</div>
                    {order.customer && <div className="text-[10px] font-normal text-slate-500">{order.customer}</div>}
                    {shortage && <div className="mt-0.5 text-[10px] font-bold text-rose-400">{shortage}</div>}
                    {fleetFits.get(order.id)?.ok && (
                      <div className="mt-0.5 text-[10px] font-semibold text-emerald-400">
                        Fuhrpark passt · {fleetFits.get(order.id)?.message}
                      </div>
                    )}
                    {fleetFits.get(order.id) && !fleetFits.get(order.id)?.ok && locomotives.length > 0 && (
                      <div className="mt-0.5 text-[10px] font-semibold text-amber-300">
                        {fleetFits.get(order.id)?.message}
                      </div>
                    )}
                  </td>
                  <td data-label="Strecke" className="fi-mobile-card-summary whitespace-nowrap text-[11px] text-slate-400">
                    {order.origin} → {order.destination}
                    <span className="ml-1 text-slate-600">({order.distance_km} km · {corridorCountryHint(order)})</span>
                    <div className="mt-0.5 text-[10px] font-semibold text-sky-300/90">
                      {isOrderElectrified(order) ? 'Fahrdraht / E-Lok möglich' : 'Ohne Oberleitung · Diesel/Dual'}
                      {order.special ? ' · Spezialauftrag' : ''}
                    </div>
                    {gate && <div className="mt-0.5 text-[10px] font-bold text-rose-400">{gate}</div>}
                  </td>
                  <td data-label="Last" className="tabular-nums">{Number(order.weight_t || 0).toLocaleString('de-DE')} t</td>
                  <td data-label="Mindest-Brh" className="font-bold tabular-nums text-amber-300">{minBrh}</td>
                  <td data-label="Ertrag" className="font-bold tabular-nums text-emerald-400">
                    {einsatz && order.daily_rate
                      ? `${formatEuro(order.daily_rate)}/Tag`
                      : formatEuro(Number(order.yield))}
                    {einsatz && order.daily_rate && (
                      <div className="text-[10px] font-normal text-slate-500">{formatEuro(Number(order.yield))} gesamt</div>
                    )}
                  </td>
                  <td data-label="Pönale" className="tabular-nums text-rose-300/90">{formatPenalty(order)}</td>
                  <td data-label="Frist">
                    {time ? (
                      <span
                        className={`inline-flex items-center gap-1 font-bold tabular-nums ${time.critical ? 'text-rose-400' : time.urgent ? 'text-amber-400' : 'text-slate-400'}`}
                      >
                        {time.critical && <span className="status-dot animate-pulse bg-rose-400" />}
                        <Clock className="h-3 w-3" />
                        {time.text}
                        <span className="font-normal text-slate-600">T{tick}</span>
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td data-label="Status">
                    <span className={order.status === 'offen' ? 'fi-pill fi-pill-green' : getOrderPillClass(order.status)}>
                      {order.status === 'offen' ? 'Gültig' : statusCfg.label}
                    </span>
                  </td>
                  <td data-label="Aktionen" className="fi-mobile-card-actions">
                    <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                      {order.status === 'offen' && (
                        <>
                          <button onClick={() => acceptOrder(order)} className="btn-action btn-action-dispo">
                            <ClipboardList className="h-3 w-3" />{' '}
                            {gate ? 'Netzzugang fehlt' : wagonCheck.sufficient ? 'Zur Disposition' : 'Wagen fehlen'}
                          </button>
                          <button onClick={() => onReject?.(order)} className="btn-action btn-action-reject">
                            <Ban className="h-3 w-3" /> Ablehnen
                          </button>
                        </>
                      )}
                      <button onClick={() => openOrder(order)} className="btn-action btn-action-detail">
                        <Info className="h-3 w-3" /> Details
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {detailOrder && (
        <div
      className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setDetailOrder(null)}
        >
          <div className="fi-card max-w-xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="fi-card-header flex items-center justify-between">
              <span className="flex items-center gap-2">
                {detailOrder.type === 'baugleis' ? (
                  <HardHat className="h-3.5 w-3.5 text-amber-500" />
                ) : (
                  <Package className="h-3.5 w-3.5 text-amber-500" />
                )}
                {detailOrder.order_number}
              </span>
              <button onClick={() => setDetailOrder(null)} className="text-slate-500 hover:text-white">
                ✕
              </button>
            </div>
            <div className="space-y-3 p-4">
              <div className="text-sm font-bold text-white">{detailOrder.title}</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailRow label="Streckenprofil" value={`${detailOrder.origin} → ${detailOrder.destination} · ${detailOrder.distance_km} km · ${corridorCountryHint(detailOrder)}`} />
                <DetailRow
                  label="Fahrleitung"
                  value={
                    isOrderElectrified(detailOrder)
                      ? 'Elektrifiziert — E-Lok, Dual und Diesel zulässig'
                      : 'Keine Oberleitung — nur Diesel oder Dual, Hakenlast prüfen'
                  }
                />
                <DetailRow
                  label="Fuhrpark-Check"
                  value={bestFleetFit(detailOrder, locomotives)?.message ?? 'Kein Triebfahrzeug im Bestand'}
                />
                <DetailRow
                  label="Mindest-Brh"
                  value={`${clampOrderMinBrh(detailOrder.type, detailOrder.min_brh)} (${(MIN_BRH_RANGE[detailOrder.type] ?? MIN_BRH_RANGE.gueterverkehr).min}–${(MIN_BRH_RANGE[detailOrder.type] ?? MIN_BRH_RANGE.gueterverkehr).max})`}
                />
                <DetailRow
                  label="Wagenbedarf"
                  value={
                    detailOrder.required_wagon_type
                      ? `${detailOrder.required_wagon_count}× ${detailOrder.required_wagon_type}`
                      : '—'
                  }
                />
                {detailOrder.customer && <DetailRow label="Kunde" value={detailOrder.customer} />}
                {isBaugleisEinsatz(detailOrder) && detailOrder.deployment_days && (
                  <DetailRow
                    label="Einsatzdauer"
                    value={`${detailOrder.deployment_days} Tage · ${detailOrder.required_drivers ?? 2} Tf Schichtwechsel · Diesel-/Baulok`}
                  />
                )}
                <DetailRow
                  label={isBaugleisEinsatz(detailOrder) ? 'Garantieerlös' : 'Ertrag'}
                  value={
                    isBaugleisEinsatz(detailOrder) && detailOrder.daily_rate
                      ? `${formatEuro(detailOrder.daily_rate)} / Tag · ${formatEuro(Number(detailOrder.yield))} Vertrag`
                      : formatEuro(Number(detailOrder.yield))
                  }
                />
                {(detailOrder.tkm_revenue || detailOrder.eur_per_tkm) && (
                  <DetailRow
                    label="Tonnenkilometer"
                    value={`${(detailOrder.distance_km * detailOrder.weight_t).toLocaleString('de-DE')} tkm · ${detailOrder.eur_per_tkm ? `${detailOrder.eur_per_tkm.toFixed(3).replace('.', ',')} €/tkm` : '—'} (im Ertrag enthalten)`}
                  />
                )}
                <DetailRow label="Pönale" value={formatPenalty(detailOrder)} />
                {detailOrder.sperrpause_start && (
                  <DetailRow
                    label="Sperrpause"
                    value={`${detailOrder.sperrpause_start} – ${detailOrder.sperrpause_end} Uhr`}
                  />
                )}
                <DetailRow
                  label="Status"
                  value={detailOrder.status === 'offen' ? 'Gültig' : getOrderStatusConfig(detailOrder.status).label}
                />
              </div>

              {orderGate(detailOrder) && (
                <p className="rounded-sm border border-rose-500/50 bg-rose-950/40 p-2 text-[11px] font-bold text-rose-200">
                  {orderGate(detailOrder)}{' '}
                  {onOpenNetworkDealer && (
                    <button type="button" className="underline" onClick={onOpenNetworkDealer}>
                      Zum Händler
                    </button>
                  )}
                </p>
              )}

              <OrderCostBreakdown order={detailOrder} />

              <WagonShortageBanner
                check={checkWagonAvailability(detailOrder, wagons)}
                onQuickAcquire={onQuickAcquireWagons}
                onOpenDealer={onBuyMissingWagons}
                onOpenBuildings={onOpenBuildings}
                freeBerths={freeBerths}
              />

              {detailOrder.status === 'offen' && (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="secondary" onClick={() => setDetailOrder(null)}>
                    Schließen
                  </Button>
                  <Button
                    disabled={!checkWagonAvailability(detailOrder, wagons).sufficient || !!orderGate(detailOrder)}
                    onClick={() => {
                      if (!checkWagonAvailability(detailOrder, wagons).sufficient || orderGate(detailOrder)) return;
                      setDetailOrder(null);
                      onDisponieren?.(detailOrder);
                    }}
                  >
                    Zur Disposition
                  </Button>
                </div>
              )}

              {detailOrder.type === 'baugleis' && detailOrder.sperrpause_start && detailOrder.sperrpause_end && (
                <SperrpauseBanner
                  start={detailOrder.sperrpause_start}
                  end={detailOrder.sperrpause_end}
                  penaltyPerMin={Number(detailOrder.penalty_per_min)}
                  now={gameNow}
                />
              )}

              {detailOrder.notes && (
                <div className="rounded-sm border border-slate-700 bg-slate-800/50 p-2 text-xs text-slate-400">
                  {detailOrder.notes}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </SectionShell>
  );
});

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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-slate-800 pb-1">
      <div className="text-[10px] font-bold uppercase text-slate-500">{label}</div>
      <div className="text-sm font-medium text-white">{value}</div>
    </div>
  );
}
