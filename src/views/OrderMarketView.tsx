import React, { useEffect, useMemo, useState, memo, type ReactNode } from 'react';
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

const marketRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '150px 70px 1fr 180px 80px 100px 90px 80px 80px 150px',
  alignItems: 'center',
  gap: '8px',
  padding: '10px 16px',
};

const marketCellClip: React.CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

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
    <div className={className} role="columnheader">
      <span className={`inline-flex w-full items-center ${justify}`}>
        <button
          type="button"
          onClick={() => onSort(column)}
          className={`inline-flex min-h-11 cursor-pointer items-center gap-1 bg-transparent p-0 text-xs font-bold uppercase tracking-wider ${
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
    </div>
  );
}

type MarketRowHandlers = {
  order: Order;
  wagons: Wagon[];
  locomotives: Locomotive[];
  companyLevel: number;
  bekanntheit: number;
  gameNow: Date;
  gate: string | null;
  onOpen: (order: Order) => void;
  onAccept: (order: Order) => void;
  onReject?: (order: Order) => void;
};

function marketRowModel(props: MarketRowHandlers) {
  const { order, wagons, locomotives, companyLevel, bekanntheit, gameNow } = props;
  const statusCfg = getOrderStatusConfig(order.status);
  const time = order.deadline
    ? timeRemaining(order.deadline, gameNow, { accepted: order.status !== 'offen' })
    : null;
  const isConstruction = order.type === 'baugleis';
  const einsatz = isBaugleisEinsatz(order);
  const wagonCheck = checkWagonAvailability(order, wagons);
  const shortage = wagonShortageLabel(wagonCheck);
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
  const yieldLabel =
    einsatz && order.daily_rate ? `${formatEuro(order.daily_rate)}/Tag` : formatEuro(Number(order.yield));
  return {
    statusCfg,
    time,
    isConstruction,
    wagonCheck,
    shortage,
    card,
    titleLine,
    wagonSummary,
    typeLabel,
    yieldLabel,
  };
}

function TypePill({
  isConstruction,
  kind,
  typeLabel,
}: {
  isConstruction: boolean;
  kind: 'spot' | 'rahmen' | 'baugleis';
  typeLabel: string;
}) {
  const pill =
    kind === 'baugleis' ? 'fi-pill fi-pill-orange' : kind === 'rahmen' ? 'fi-pill fi-pill-gold' : 'fi-pill fi-pill-blue';
  return (
    <span className={`inline-flex max-w-full items-center justify-center gap-0.5 truncate ${pill}`} title={typeLabel}>
      {isConstruction ? <HardHat className="h-3 w-3 shrink-0" /> : <Package className="h-3 w-3 shrink-0" />}
      <span className="truncate">{typeLabel}</span>
    </span>
  );
}

const MarketOrderRow = memo(function MarketOrderRow(props: MarketRowHandlers) {
  const model = marketRowModel(props);
  const { order, gate, onOpen, onAccept } = props;
  return (
    <div
      role="row"
      className="h-14 cursor-pointer border-b border-slate-800 hover:bg-slate-800/40"
      style={marketRowStyle}
      onClick={() => onOpen(order)}
    >
      <div className="overflow-visible font-mono text-sm text-slate-200" title={order.order_number}>
        {order.order_number}
      </div>
      <div className="flex justify-center">
        <TypePill isConstruction={model.isConstruction} kind={model.card.kind} typeLabel={model.typeLabel} />
      </div>
      <div className="text-left font-medium text-white" style={marketCellClip} title={model.titleLine}>
        {model.titleLine}
      </div>
      <div
        className={`text-left text-[11px] ${gate ? 'font-bold text-rose-400' : 'text-slate-400'}`}
        style={marketCellClip}
        title={`${order.origin} → ${order.destination}${gate ? ` · ${gate}` : ''}`}
      >
        {order.origin} → {order.destination}
      </div>
      <div className="text-right font-mono text-slate-200">
        {Number(order.weight_t || 0).toLocaleString('de-DE')} t
      </div>
      <div
        className={`text-left text-xs ${model.shortage ? 'text-rose-400' : 'text-slate-200'}`}
        style={marketCellClip}
        title={model.shortage || model.wagonSummary}
      >
        {model.wagonSummary}
      </div>
      <div className="truncate text-right font-mono font-semibold text-emerald-400" style={marketCellClip}>
        {model.yieldLabel}
      </div>
      <div className="truncate text-right font-mono text-rose-400" style={marketCellClip}>
        {formatPenalty(order)}
      </div>
      <div className="text-center font-mono">
        {model.time ? (
          <span
            className={`tabular-nums ${model.time.critical ? 'font-bold text-rose-400' : model.time.urgent ? 'font-bold text-amber-400' : 'text-slate-400'}`}
          >
            {model.time.text}
          </span>
        ) : (
          <span className="text-slate-500">—</span>
        )}
      </div>
      <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
        <span className={`shrink-0 ${order.status === 'offen' ? 'fi-pill fi-pill-green' : getOrderPillClass(order.status)}`}>
          {order.status === 'offen' ? 'Gültig' : model.statusCfg.label}
        </span>
        {order.status === 'offen' ? (
          <button
            type="button"
            onClick={() => onAccept(order)}
            className="btn-action btn-action-dispo shrink-0"
            title={gate ? 'Netzzugang fehlt' : model.wagonCheck.sufficient ? 'Zur Disposition' : 'Wagen fehlen'}
          >
            <ClipboardList className="h-3 w-3" />
            {gate ? 'Netz' : model.wagonCheck.sufficient ? 'Dispo' : 'Wagen'}
          </button>
        ) : (
          <button type="button" onClick={() => onOpen(order)} className="btn-action btn-action-detail shrink-0" title="Details">
            <Info className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
});

const MarketOrderCard = memo(function MarketOrderCard(props: MarketRowHandlers) {
  const model = marketRowModel(props);
  const { order, gate, onOpen, onAccept, onReject } = props;
  return (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-slate-700 bg-slate-900/80 p-3 text-left">
      <button type="button" onClick={() => onOpen(order)} className="flex w-full flex-col gap-2 text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm text-slate-200">{order.order_number}</span>
          <TypePill isConstruction={model.isConstruction} kind={model.card.kind} typeLabel={model.typeLabel} />
        </div>
        <div className="truncate font-medium text-white">{model.titleLine}</div>
        <div className={`truncate text-xs ${gate ? 'font-bold text-rose-400' : 'text-slate-400'}`}>
          {order.origin} → {order.destination}
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <span className="text-slate-500">Tonnage</span>
          <span className="text-right font-mono">{Number(order.weight_t || 0).toLocaleString('de-DE')} t</span>
          <span className="text-slate-500">Wagen</span>
          <span className={`truncate text-right ${model.shortage ? 'text-rose-400' : 'text-slate-200'}`}>{model.wagonSummary}</span>
          <span className="text-slate-500">Ertrag</span>
          <span className="truncate text-right font-mono font-semibold text-emerald-400">{model.yieldLabel}</span>
          <span className="text-slate-500">Pönale</span>
          <span className="truncate text-right font-mono text-rose-400">{formatPenalty(order)}</span>
          <span className="text-slate-500">Frist</span>
          <span className="text-right font-mono text-slate-300">{model.time?.text ?? '—'}</span>
        </div>
      </button>
      <div className="flex min-h-12 items-center justify-end gap-2">
        <span className={order.status === 'offen' ? 'fi-pill fi-pill-green' : getOrderPillClass(order.status)}>
          {order.status === 'offen' ? 'Gültig' : model.statusCfg.label}
        </span>
        {order.status === 'offen' && (
          <>
            <button type="button" onClick={() => onAccept(order)} className="btn-action btn-action-dispo min-h-12">
              <ClipboardList className="h-3 w-3" />
              {gate ? 'Netz' : model.wagonCheck.sufficient ? 'Dispo' : 'Wagen'}
            </button>
            {onReject && (
              <button type="button" onClick={() => onReject(order)} className="btn-action btn-action-reject min-h-12" title="Ablehnen">
                <Ban className="h-3 w-3" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
});

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
      <div className="fi-card fi-market-table-wrap overflow-x-auto">
        <div className="hidden min-w-[1160px] md:block">
          <div
            className="h-12 border-b border-slate-800 bg-slate-950/90 text-xs font-bold uppercase tracking-wider text-slate-400"
            role="row"
            style={marketRowStyle}
          >
            <div className="text-left font-mono" role="columnheader">
              Auftrags-Nr.
            </div>
            <div className="text-center" role="columnheader">
              Typ
            </div>
            <div className="min-w-0 truncate text-left" role="columnheader">
              Kunde / Titel
            </div>
            <div className="flex min-w-0 items-center justify-start truncate text-left" role="columnheader">
              Strecke
              <ContextHelpTooltip topicId="traktion" onOpenManual={onOpenHandbook} />
            </div>
            <SortHeader
              label="Tonnage"
              column="weight"
              active={sortKey === 'weight'}
              dir={sortDir}
              onSort={toggleSort}
              className="text-right font-mono"
              extra={<ContextHelpTooltip topicId="hakenlast" onOpenManual={onOpenHandbook} />}
            />
            <div className="text-left" role="columnheader">
              Wagen
            </div>
            <SortHeader
              label="Ertrag"
              column="yield"
              active={sortKey === 'yield'}
              dir={sortDir}
              onSort={toggleSort}
              className="text-right font-mono"
              extra={<ContextHelpTooltip topicId="deckungsbeitrag" onOpenManual={onOpenHandbook} />}
            />
            <SortHeader
              label="Pönale"
              column="penalty"
              active={sortKey === 'penalty'}
              dir={sortDir}
              onSort={toggleSort}
              className="text-right font-mono"
              extra={<ContextHelpTooltip topicId="poenale" onOpenManual={onOpenHandbook} />}
            />
            <SortHeader
              label="Frist"
              column="frist"
              align="center"
              active={sortKey === 'frist'}
              dir={sortDir}
              onSort={toggleSort}
              className="text-center font-mono"
            />
            <div className="text-right" role="columnheader">
              Aktion
            </div>
          </div>

          {sorted.length === 0 && (
            <div className="px-4 py-8 text-center text-slate-500">Keine Aufträge in dieser Ansicht</div>
          )}
          {sorted.map((order) => (
            <MarketOrderRow
              key={order.id}
              order={order}
              wagons={wagons}
              locomotives={locomotives}
              companyLevel={companyLevel}
              bekanntheit={bekanntheit}
              gameNow={gameNow}
              gate={orderGate(order)}
              onOpen={openOrder}
              onAccept={acceptOrder}
              onReject={onReject}
            />
          ))}
        </div>

        <div className="space-y-3 p-3 md:hidden">
          {sorted.length === 0 && (
            <div className="py-8 text-center text-slate-500">Keine Aufträge in dieser Ansicht</div>
          )}
          {sorted.map((order) => (
            <MarketOrderCard
              key={order.id}
              order={order}
              wagons={wagons}
              locomotives={locomotives}
              companyLevel={companyLevel}
              bekanntheit={bekanntheit}
              gameNow={gameNow}
              gate={orderGate(order)}
              onOpen={openOrder}
              onAccept={acceptOrder}
              onReject={onReject}
            />
          ))}
        </div>
      </div>
      )}

      {detailOrder && (
        <div
          className="order-detail-scrim modal-scrim fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setDetailOrder(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-detail-title"
            className="order-detail-dialog relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-800 p-4">
              <span id="order-detail-title" className="flex min-w-0 items-center gap-2 font-mono text-sm font-bold text-white">
                {detailOrder.type === 'baugleis' ? (
                  <HardHat className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                ) : (
                  <Package className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                )}
                <span className="truncate">{detailOrder.order_number}</span>
              </span>
              <button
                type="button"
                onClick={() => setDetailOrder(null)}
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center text-lg text-slate-500 hover:text-white"
                aria-label="Schließen"
              >
                ✕
              </button>
            </div>
            <div className="custom-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
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
            <div className="flex shrink-0 justify-end gap-3 border-t border-slate-800 bg-slate-900/90 p-4">
              <Button variant="secondary" onClick={() => setDetailOrder(null)}>
                Schließen
              </Button>
              {detailOrder.status === 'offen' && (
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
