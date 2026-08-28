import { useEffect, useMemo, useState, memo, type ReactNode } from 'react';
import {
  Package,
  HardHat,
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
  getOrderPillClass,
  MIN_BRH_RANGE,
} from '@/lib/status';
import { isBaugleisEinsatz, isOpenUnexpiredMarketOrder } from '@/lib/orderMarket';
import { bestFleetFit, isOrderElectrified, type AssignmentFit } from '@/lib/traction';
import { useGameClock } from '@/lib/GameClockContext';
import { SectionShell } from '@/components/SectionShell';
import { OrderCostBreakdown } from '@/components/OrderCostBreakdown';
import { WagonShortageBanner } from '@/components/WagonShortageBanner';
import { checkWagonAvailability, wagonShortageLabel } from '@/lib/brh';
import { Button } from '@/components/ui';
import type { Acquisition } from '@/lib/dealer';
import { corridorCountryHint, networkAcceptBlock, type NetworkAccessState } from '@/lib/networkAccess';
import { closureBlockMessage, orderBlockedByClosure, type WorldEventState } from '@/lib/events';
import { FrameworkContractsPanel, type FrameworkContractsPanelProps } from '@/components/FrameworkContractsPanel';
import { exclusiveJobsUnlocked, reputationTier } from '@/lib/reputation';
import { ContextHelpTooltip } from '@/components/ContextHelpTooltip';
import type { HandbookOpenTo } from '@/lib/handbook';
import { buildOrderContractCard, derivedUsableLengthM, locoHasEtcsFleet } from '@/lib/contractCard';

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
  framework?: FrameworkContractsPanelProps;
  bekanntheit?: number;
  companyLevel?: number;
  onOpenHandbook?: (target?: HandbookOpenTo) => void;
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

const MARKET_CELL = 'box-border py-3 px-2 align-middle';
const MARKET_HEAD = `${MARKET_CELL} text-xs font-bold uppercase tracking-wider text-slate-400`;

const MARKET_COL = {
  nr: 'w-[150px] min-w-[150px]',
  typ: 'w-[80px] min-w-[80px]',
  title: 'w-[220px] min-w-[220px]',
  route: 'w-[180px] min-w-[180px]',
  tons: 'w-[110px] min-w-[110px]',
  wagons: 'w-[120px] min-w-[120px]',
  yield: 'w-[100px] min-w-[100px]',
  penalty: 'w-[90px] min-w-[90px]',
  deadline: 'w-[90px] min-w-[90px]',
  action: 'w-[150px] min-w-[150px]',
} as const;

function SortHeader({
  label,
  column,
  extra,
  className,
  align = 'right',
  active,
  dir,
  onSort,
}: {
  label: string;
  column: MarketSortKey;
  extra?: ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
  active: boolean;
  dir: SortDir;
  onSort: (column: MarketSortKey) => void;
}) {
  const justify = align === 'left' ? 'justify-start' : align === 'center' ? 'justify-center' : 'justify-end';
  return (
    <th
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={className}
    >
      <span className={`inline-flex w-full items-center ${justify}`}>
        <button
          type="button"
          onClick={() => onSort(column)}
          className={`inline-flex cursor-pointer items-center gap-1 bg-transparent p-0 text-xs font-bold uppercase tracking-wider ${
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
        {extra}
      </span>
    </th>
  );
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
  framework,
  bekanntheit = 0,
  companyLevel = 1,
  onOpenHandbook,
}: OrderMarketViewProps) {
  const { gameNow, tick } = useGameClock();
  const [filter, setFilter] = useState<'all' | OrderType | 'einsatz' | 'rahmen' | 'exklusiv'>('all');
  const [search, setSearch] = useState('');
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [sortKey, setSortKey] = useState<MarketSortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [certFilter, setCertFilter] = useState<'all' | 'etcs' | 'length'>('all');

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
    else if (filter === 'exklusiv') result = result.filter((o) => o.exclusive === true);
    else if (filter !== 'all' && filter !== 'rahmen') result = result.filter((o) => o.type === filter && !isBaugleisEinsatz(o));
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
    if (certFilter === 'etcs') result = result.filter((o) => Boolean(o.requires_etcs));
    if (certFilter === 'length') {
      result = result.filter((o) => (o.required_wagon_count ?? 0) > 0);
    }
    return result;
  }, [marketOrders, filter, search, certFilter]);

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
      subtitle={`${marketOrders.length} Aufträge · Reputation ${reputationTier(bekanntheit).label} ${bekanntheit}/100${exclusiveJobsUnlocked(bekanntheit) ? ' · Exklusiv-Ganzzüge frei' : ' · Exklusiv ab 70 Reputation'} · Generator: Fuhrpark + Depot-Regionen · Frühspiel: mindestens 3 Leichtaufträge`}
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
            ['rahmen', 'Rahmenverträge'],
            ['exklusiv', 'Exklusiv'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`fi-filter ${filter === key ? 'fi-filter-active' : ''}`}
          >
            {(key === 'baugleis' || key === 'einsatz') && <HardHat className="h-3 w-3" />}
            {key === 'gueterverkehr' && <Package className="h-3 w-3" />}
            {label}
          </button>
        ))}
      </div>
      <div className="fi-filter-bar">
        <button type="button" className={`fi-filter min-h-12 ${certFilter === 'all' ? 'fi-filter-active' : ''}`} onClick={() => setCertFilter('all')}>
          Alle Freigaben
        </button>
        <button type="button" className={`fi-filter min-h-12 ${certFilter === 'etcs' ? 'fi-filter-active' : ''}`} onClick={() => setCertFilter('etcs')}>
          ETCS-Zertifikat
        </button>
        <button type="button" className={`fi-filter min-h-12 ${certFilter === 'length' ? 'fi-filter-active' : ''}`} onClick={() => setCertFilter('length')}>
          Mit Nutzlänge
        </button>
        <span className="fi-filter-meta">
          Reputation {bekanntheit}/100 · Level {companyLevel}
        </span>
      </div>

      {filter === 'rahmen' && framework ? (
        <FrameworkContractsPanel {...framework} />
      ) : (
      <div className="fi-card overflow-x-auto fi-market-table-wrap">
        <table className="fi-table fi-mobile-card-table fi-market-grid-table w-full table-fixed border-collapse md:min-w-[1290px]">
          <colgroup>
            <col className={MARKET_COL.nr} />
            <col className={MARKET_COL.typ} />
            <col className={MARKET_COL.title} />
            <col className={MARKET_COL.route} />
            <col className={MARKET_COL.tons} />
            <col className={MARKET_COL.wagons} />
            <col className={MARKET_COL.yield} />
            <col className={MARKET_COL.penalty} />
            <col className={MARKET_COL.deadline} />
            <col className={MARKET_COL.action} />
          </colgroup>
          <thead>
            <tr>
              <th className={`${MARKET_HEAD} ${MARKET_COL.nr} pl-4 text-left font-mono`}>Auftrags-Nr.</th>
              <th className={`${MARKET_HEAD} ${MARKET_COL.typ} text-center`}>Typ</th>
              <th className={`${MARKET_HEAD} ${MARKET_COL.title} truncate text-left`}>Kunde / Titel</th>
              <th className={`${MARKET_HEAD} ${MARKET_COL.route} truncate text-left`}>
                <span className="inline-flex w-full items-center justify-start">
                  Strecke
                  <ContextHelpTooltip topicId="traktion" onOpenManual={onOpenHandbook} />
                </span>
              </th>
              <SortHeader
                label="Tonnage / Last"
                column="weight"
                active={sortKey === 'weight'}
                dir={sortDir}
                onSort={toggleSort}
                className={`${MARKET_HEAD} ${MARKET_COL.tons} text-right font-mono`}
                extra={<ContextHelpTooltip topicId="hakenlast" onOpenManual={onOpenHandbook} />}
              />
              <th className={`${MARKET_HEAD} ${MARKET_COL.wagons} text-left`}>Wagenpark</th>
              <SortHeader
                label="Ertrag"
                column="yield"
                active={sortKey === 'yield'}
                dir={sortDir}
                onSort={toggleSort}
                className={`${MARKET_HEAD} ${MARKET_COL.yield} text-right font-mono`}
                extra={<ContextHelpTooltip topicId="deckungsbeitrag" onOpenManual={onOpenHandbook} />}
              />
              <SortHeader
                label="Pönale"
                column="penalty"
                active={sortKey === 'penalty'}
                dir={sortDir}
                onSort={toggleSort}
                className={`${MARKET_HEAD} ${MARKET_COL.penalty} text-right font-mono`}
                extra={<ContextHelpTooltip topicId="poenale" onOpenManual={onOpenHandbook} />}
              />
              <SortHeader
                label="Frist"
                column="frist"
                align="center"
                active={sortKey === 'frist'}
                dir={sortDir}
                onSort={toggleSort}
                className={`${MARKET_HEAD} ${MARKET_COL.deadline} text-center font-mono`}
              />
              <th className={`${MARKET_HEAD} ${MARKET_COL.action} pr-4 text-right`}>Status / Aktion</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={10} className="fi-mobile-empty-state py-8 text-center text-slate-500">
                  Keine Aufträge in dieser Ansicht
                </td>
              </tr>
            )}
            {sorted.map((order) => {
              const statusCfg = getOrderStatusConfig(order.status);
              const time = order.deadline
                ? timeRemaining(order.deadline, gameNow, { accepted: order.status !== 'offen' })
                : null;
              const isConstruction = order.type === 'baugleis';
              const einsatz = isBaugleisEinsatz(order);
              const wagonCheck = checkWagonAvailability(order, wagons);
              const shortage = wagonShortageLabel(wagonCheck);
              const gate = orderGate(order);
              const card = buildOrderContractCard(order, wagons, {
                level: companyLevel,
                reputation: bekanntheit,
                hasEtcs: locoHasEtcsFleet(locomotives),
              });
              const titleLine = order.customer ? `${order.customer} · ${order.title}` : order.title;
              const wagonSummary = card.requiredWagonType
                ? `${card.requiredWagonCount ?? 0}x ${card.requiredWagonType}`
                : '—';
              const typeLabel = einsatz ? 'Einsatz' : card.kindLabel;
              return (
                <tr
                  key={order.id}
                  className="fi-deferred-list-row cursor-pointer align-middle hover:bg-slate-800/50 md:h-14"
                  onClick={() => openOrder(order)}
                >
                  <td data-label="Auftrags-Nr." className={`fi-mobile-card-title ${MARKET_CELL} ${MARKET_COL.nr} pl-4 text-left font-mono text-[11px] font-bold whitespace-nowrap text-white`}>
                    {order.order_number}
                  </td>
                  <td data-label="Typ" className={`${MARKET_CELL} ${MARKET_COL.typ} text-center`}>
                    <span
                      className={`inline-flex max-w-full items-center justify-center gap-0.5 truncate ${card.kind === 'baugleis' ? 'fi-pill fi-pill-orange' : card.kind === 'rahmen' ? 'fi-pill fi-pill-gold' : 'fi-pill fi-pill-blue'}`}
                      title={typeLabel}
                    >
                      {isConstruction ? <HardHat className="h-3 w-3 shrink-0" /> : <Package className="h-3 w-3 shrink-0" />}
                      <span className="truncate">{typeLabel}</span>
                    </span>
                  </td>
                  <td
                    data-label="Kunde / Titel"
                    className={`fi-mobile-card-summary fi-market-title-cell ${MARKET_CELL} ${MARKET_COL.title} truncate whitespace-nowrap text-left font-medium text-white`}
                    title={titleLine}
                  >
                    <div className="fi-market-title truncate whitespace-nowrap">{titleLine}</div>
                  </td>
                  <td
                    data-label="Strecke"
                    className={`fi-mobile-card-summary ${MARKET_CELL} ${MARKET_COL.route} truncate text-left text-[11px] text-slate-400`}
                    title={`${order.origin} → ${order.destination}${gate ? ` · ${gate}` : ''}`}
                  >
                    <span className={gate ? 'block truncate font-bold text-rose-400' : 'block truncate'}>
                      {order.origin} → {order.destination}
                    </span>
                  </td>
                  <td data-label="Tonnage / Last" className={`${MARKET_CELL} ${MARKET_COL.tons} text-right font-mono`}>
                    {Number(order.weight_t || 0).toLocaleString('de-DE')} t
                  </td>
                  <td
                    data-label="Wagenpark"
                    className={`${MARKET_CELL} ${MARKET_COL.wagons} truncate text-left text-xs ${shortage ? 'text-rose-400' : 'text-slate-200'}`}
                    title={shortage || wagonSummary}
                  >
                    {wagonSummary}
                  </td>
                  <td data-label="Ertrag" className={`${MARKET_CELL} ${MARKET_COL.yield} text-right font-mono font-semibold text-emerald-400`}>
                    {einsatz && order.daily_rate
                      ? `${formatEuro(order.daily_rate)}/Tag`
                      : formatEuro(Number(order.yield))}
                  </td>
                  <td data-label="Pönale" className={`${MARKET_CELL} ${MARKET_COL.penalty} text-right font-mono text-rose-400`}>
                    {formatPenalty(order)}
                  </td>
                  <td data-label="Frist" className={`${MARKET_CELL} ${MARKET_COL.deadline} text-center font-mono`}>
                    {time ? (
                      <span
                        className={`tabular-nums ${time.critical ? 'font-bold text-rose-400' : time.urgent ? 'font-bold text-amber-400' : 'text-slate-400'}`}
                      >
                        {time.text}
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td data-label="Status / Aktion" className={`fi-mobile-card-actions ${MARKET_CELL} ${MARKET_COL.action} pr-4 text-right`}>
                    <div className="fi-market-row-actions flex flex-col items-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <span className={order.status === 'offen' ? 'fi-pill fi-pill-green' : getOrderPillClass(order.status)}>
                        {order.status === 'offen' ? 'Gültig' : statusCfg.label}
                      </span>
                      {order.status === 'offen' && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => acceptOrder(order)}
                            className="btn-action btn-action-dispo"
                            title={gate ? 'Netzzugang fehlt' : wagonCheck.sufficient ? 'Zur Disposition' : 'Wagen fehlen'}
                          >
                            <ClipboardList className="h-3 w-3" />
                            {gate ? 'Netz' : wagonCheck.sufficient ? 'Dispo' : 'Wagen'}
                          </button>
                          <button type="button" onClick={() => onReject?.(order)} className="btn-action btn-action-reject" title="Ablehnen">
                            <Ban className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                      <button type="button" onClick={() => openOrder(order)} className="btn-action btn-action-detail" title="Details">
                        <Info className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

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
                <div className="-mt-2 flex justify-end">
                  <ContextHelpTooltip topicId="oberleitung" onOpenManual={onOpenHandbook} />
                  <ContextHelpTooltip topicId="nutzlaenge" onOpenManual={onOpenHandbook} />
                </div>
                <DetailRow
                  label="Fuhrpark-Check"
                  value={bestFleetFit(detailOrder, locomotives)?.message ?? 'Kein Triebfahrzeug im Bestand'}
                />
                <DetailRow
                  label="Tonnage"
                  value={`${Number(detailOrder.weight_t || 0).toLocaleString('de-DE')} t`}
                />
                <DetailRow
                  label="Hakenlast"
                  value={hakenlastHint(bestFleetFit(detailOrder, locomotives))}
                />
                <DetailRow
                  label="Nutzlänge"
                  value={usableLengthLabel(detailOrder, wagons)}
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
                <div className="-mt-2 flex justify-end">
                  <ContextHelpTooltip topicId="poenale" onOpenManual={onOpenHandbook} />
                </div>
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

              <div className="flex flex-wrap gap-1.5">
                {buildOrderContractCard(detailOrder, wagons, {
                  level: companyLevel,
                  reputation: bekanntheit,
                  hasEtcs: locoHasEtcsFleet(locomotives),
                }).clearances.map((row) => (
                  <span key={row.id} className={row.met ? 'fi-pill fi-pill-green' : 'fi-pill fi-pill-orange'}>
                    {row.label}: {row.detail}
                  </span>
                ))}
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

              <div className="relative">
                <OrderCostBreakdown order={detailOrder} />
                <div className="absolute right-1 top-1">
                  <ContextHelpTooltip topicId="deckungsbeitrag" onOpenManual={onOpenHandbook} />
                </div>
              </div>

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

function usableLengthLabel(order: Order, wagons: Wagon[]): string {
  const meters = derivedUsableLengthM(order, wagons);
  return meters != null ? `${meters.toLocaleString('de-DE')} m` : '—';
}

function hakenlastHint(fit: AssignmentFit | null | undefined): string {
  if (!fit) return 'Hakenlast im Detail prüfen';
  return `Hakenlast ${fit.trailingLoadT.toLocaleString('de-DE')} t ${fit.ok ? 'trägt die Last' : 'zu gering'}`;
}
