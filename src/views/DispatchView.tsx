import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import {
  ClipboardList,
  Train,
  User,
  Check,
  X,
  Clock,
  Package,
  HardHat,
  Gauge,
  Boxes,
  AlertTriangle,
  CheckCircle2,
  Info,
  MapPin,
  Pause,
  Wrench,
  RefreshCw,
  Monitor,
  UserCog,
} from 'lucide-react';
import type {
  Locomotive,
  Driver,
  Order,
  AssignmentWithDetails,
  Wagon,
} from '@/lib/supabase';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  formatEuro,
  timeRemaining,
  clampOrderMinBrh,
  getOrderTypeConfig,
  getAssignmentStatusConfig,
  getAssignmentPillClass,
  getLocoPillClass,
  getLocoStatusConfig,
} from '@/lib/status';
import { calculateTrainBrh, checkWagonAvailability, wagonShortageLabel } from '@/lib/brh';
import type { Acquisition } from '@/lib/dealer';
import { WagonShortageBanner } from '@/components/WagonShortageBanner';
import { getLocoDisplayName } from '@/lib/locoPhotos';
import { useGameClock } from '@/lib/GameClockContext';
import { assignmentProgress, etaFromProgress, locoMarkerId } from '@/lib/tracking';
import { SectionShell } from '@/components/SectionShell';
import { Button } from '@/components/ui';
import {
  BAUGLEIS_MIN_DRIVERS,
  isBaugleisEinsatz,
  isConstructionLoco,
  isExpiredOpenOffer,
  requiredDriversFor,
} from '@/lib/orderMarket';
import { ensureMaintenance, isLocoDeployable } from '@/lib/workshop';
import type { BaugleisDeployment } from '@/lib/baugleisDeployments';
import { canStartBaugleisEinsatz, deploymentDailyOperating } from '@/lib/baugleisDeployments';
import { OrderCostBreakdown } from '@/components/OrderCostBreakdown';
import { availableAzfStaff, isBaugleisOrder, pdlAzfChargeForOrder } from '@/lib/pdl';
import { driverRestStatus, restStatusHint, REST_WARNING } from '@/lib/restRules';
import {
  corridorCountryHint,
  networkDispatchBlock,
  type NetworkAccessState,
} from '@/lib/networkAccess';
import { closureBlockMessage, orderBlockedByClosure, type WorldEventState } from '@/lib/events';
import { seriesDispatchBlock, seriesIdForLoco, seriesLabel } from '@/lib/personal';
import type { StaffMeta } from '@/lib/jobcenter';

const LiveTrackingMap = lazy(() =>
  import('@/components/LiveTrackingMap').then((m) => ({ default: m.LiveTrackingMap })),
);

interface DispatchViewProps {
  orders: Order[];
  locomotives: Locomotive[];
  drivers: Driver[];
  assignments: AssignmentWithDetails[];
  wagons: Wagon[];
  loading: boolean;
  onDataChange: () => void;
  preselectOrder?: Order | null;
  onLocalAssign?: (
    order: Order,
    locomotiveId: string,
    driverId: string,
    secondDriverId?: string,
    azf?: { driverId: string | null },
  ) => void;
  deployments?: BaugleisDeployment[];
  onLocalComplete?: (assignment: AssignmentWithDetails) => void;
  onLocalCancel?: (assignment: AssignmentWithDetails) => void;
  hqLocation?: string;
  onBackOffice?: () => void;
  onBackPc?: () => void;
  onBuyMissingWagons?: (typeCode: string, qty: number) => void;
  onQuickAcquireWagons?: (typeCode: string, qty: number, how: Acquisition) => void;
  onOpenBuildings?: () => void;
  freeBerths?: number;
  networkAccess?: NetworkAccessState;
  worldEvents?: WorldEventState;
  staffMeta?: Record<string, StaffMeta>;
  onOpenNetworkDealer?: (pack?: string) => void;
}

type AzfMode = 'none' | 'eigen' | 'pdl';
type FleetFilter = 'alle' | 'fahrend' | 'stehend' | 'wartung';

type FleetEntry =
  | {
      kind: 'train';
      id: string;
      assignment: AssignmentWithDetails;
      progress: number;
      etaTicks: number;
    }
  | {
      kind: 'loco';
      id: string;
      loco: Locomotive;
      parked: 'stehend' | 'wartung';
    };

function zugLabel(loco: Locomotive, orderNumber?: string): string {
  const digits = (orderNumber ?? loco.name).replace(/\D/g, '');
  const num = (digits.slice(-4) || '0000').padStart(4, '0');
  return `${loco.designation} - Zug #${num}`;
}

function etaLabel(ticks: number): string {
  if (ticks <= 0) return 'Angekommen';
  if (ticks === 1) return 'ETA 1 Tick';
  return `ETA ${ticks} Ticks`;
}

export function DispatchView({
  orders,
  locomotives,
  drivers,
  assignments,
  wagons,
  loading,
  onDataChange,
  preselectOrder,
  onLocalAssign,
  onLocalComplete,
  onLocalCancel,
  deployments = [],
  hqLocation,
  onBackOffice,
  onBackPc,
  onBuyMissingWagons,
  onQuickAcquireWagons,
  onOpenBuildings,
  freeBerths,
  networkAccess,
  worldEvents,
  staffMeta = {},
  onOpenNetworkDealer,
}: DispatchViewProps) {
  const { gameNow, tick } = useGameClock();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(preselectOrder ?? null);
  const [selectedLoco, setSelectedLoco] = useState<string>('');
  const [selectedDriver, setSelectedDriver] = useState<string>('');
  const [selectedDriver2, setSelectedDriver2] = useState<string>('');
  const [azfMode, setAzfMode] = useState<AzfMode>('none');
  const [selectedAzfId, setSelectedAzfId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fleetFilter, setFleetFilter] = useState<FleetFilter>('alle');
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [fitRequest, setFitRequest] = useState(0);
  const [refreshRequest, setRefreshRequest] = useState(0);

  useEffect(() => {
    if (preselectOrder) {
      setSelectedOrder(preselectOrder);
      setSelectedLoco('');
      setSelectedDriver('');
      setSelectedDriver2('');
      setAzfMode('none');
      setSelectedAzfId('');
    }
  }, [preselectOrder]);

  const openOrders = useMemo(
    () => orders.filter((o) => o.status === 'offen' && !isExpiredOpenOffer(o, gameNow)),
    [orders, gameNow],
  );
  const einsatzOrder = isBaugleisEinsatz(selectedOrder);
  const baugleisOrder = isBaugleisOrder(selectedOrder);
  const availableLocos = useMemo(() => {
    const free = locomotives.filter((l) => isLocoDeployable(ensureMaintenance(l)));
    if (einsatzOrder) return free.filter(isConstructionLoco);
    return free;
  }, [locomotives, einsatzOrder]);
  const availableDrivers = useMemo(
    () =>
      drivers.filter(
        (d) => d.status === 'verfuegbar' && (d.qualifications ?? []).some((q) => q.toLowerCase() === 'tf'),
      ),
    [drivers],
  );
  const availableAzf = useMemo(() => {
    const skip = [selectedDriver, selectedDriver2].filter(Boolean);
    return availableAzfStaff(drivers, skip);
  }, [drivers, selectedDriver, selectedDriver2]);
  const availableAzfIds = availableAzf.map((p) => p.id).join('|');

  useEffect(() => {
    if (azfMode !== 'eigen') return;
    if (!availableAzfIds) {
      setAzfMode('none');
      setSelectedAzfId('');
      return;
    }
    const ids = availableAzfIds.split('|');
    if (!ids.includes(selectedAzfId)) setSelectedAzfId(ids[0] ?? '');
  }, [azfMode, availableAzfIds, selectedAzfId]);
  const availableDrivers2 = useMemo(
    () => availableDrivers.filter((d) => d.id !== selectedDriver),
    [availableDrivers, selectedDriver],
  );
  const activeAssignments = useMemo(
    () => assignments.filter((a) => a.status === 'geplant' || a.status === 'aktiv'),
    [assignments],
  );

  const assignedLocoIds = useMemo(() => new Set(activeAssignments.map((a) => a.locomotive_id)), [activeAssignments]);

  const fleetEntries = useMemo((): FleetEntry[] => {
    const trains: FleetEntry[] = activeAssignments
      .filter((a) => a.order && a.locomotive && a.driver)
      .map((assignment) => {
        const progress = assignmentProgress(assignment, tick);
        return {
          kind: 'train' as const,
          id: assignment.id,
          assignment,
          progress,
          etaTicks: etaFromProgress(assignment, progress),
        };
      });

    const idle: FleetEntry[] = locomotives
      .filter((l) => !assignedLocoIds.has(l.id))
      .map((loco) => ({
        kind: 'loco' as const,
        id: locoMarkerId(loco.id),
        loco,
        parked:
          loco.status === 'wartung' || loco.status === 'v1' || loco.status === 'stillgelegt'
            ? ('wartung' as const)
            : ('stehend' as const),
      }));

    return [...trains, ...idle];
  }, [activeAssignments, locomotives, assignedLocoIds, tick]);

  const filteredFleet = useMemo(() => {
    return fleetEntries.filter((entry) => {
      if (fleetFilter === 'alle') return true;
      if (entry.kind === 'train') {
        const moving = entry.assignment.status === 'aktiv' && entry.progress > 0;
        const standing = entry.assignment.status === 'geplant' || entry.progress === 0;
        if (fleetFilter === 'fahrend') return moving;
        if (fleetFilter === 'stehend') return standing;
        return false;
      }
      if (fleetFilter === 'fahrend') return false;
      if (fleetFilter === 'stehend') return entry.parked === 'stehend';
      return entry.parked === 'wartung';
    });
  }, [fleetEntries, fleetFilter]);

  const selectedLocoObj = useMemo(() => locomotives.find((l) => l.id === selectedLoco) || null, [locomotives, selectedLoco]);
  const selectedDriverObj = useMemo(() => drivers.find((d) => d.id === selectedDriver) || null, [drivers, selectedDriver]);
  const selectedDriver2Obj = useMemo(() => drivers.find((d) => d.id === selectedDriver2) || null, [drivers, selectedDriver2]);
  const brhCheck = useMemo(() => {
    if (!selectedOrder || !selectedLocoObj) return null;
    return calculateTrainBrh(selectedLocoObj, selectedOrder, wagons);
  }, [selectedOrder, selectedLocoObj, wagons]);
  const wagonCheck = useMemo(() => {
    if (!selectedOrder) return null;
    return checkWagonAvailability(selectedOrder, wagons);
  }, [selectedOrder, wagons]);
  const einsatzBlock = selectedOrder
    ? canStartBaugleisEinsatz(selectedOrder, selectedLocoObj ?? undefined, selectedDriverObj ?? undefined, selectedDriver2Obj ?? undefined)
    : null;
  const pdlQuote = useMemo(
    () => (selectedOrder && baugleisOrder ? pdlAzfChargeForOrder(selectedOrder, 'pdl') : null),
    [selectedOrder, baugleisOrder],
  );
  const restWarn = useMemo(() => {
    const rows = [selectedDriverObj, selectedDriver2Obj].filter(Boolean) as Driver[];
    const hits = rows
      .map((d) => ({ driver: d, status: driverRestStatus(d, gameNow) }))
      .filter((row) => row.status.violated);
    return hits;
  }, [selectedDriverObj, selectedDriver2Obj, gameNow]);
  const locoNetBlock = selectedOrder && selectedLocoObj ? networkDispatchBlock(selectedOrder, selectedLocoObj) : null;
  const seriesBlock = selectedLocoObj
    ? seriesDispatchBlock(selectedLocoObj, selectedDriver ? staffMeta[selectedDriver]?.seriesIds : [])
    : null;
  const seriesBlock2 =
    selectedLocoObj && selectedDriver2
      ? seriesDispatchBlock(selectedLocoObj, staffMeta[selectedDriver2]?.seriesIds)
      : null;
  const lineClosure = selectedOrder
    ? orderBlockedByClosure(selectedOrder, tick, worldEvents?.closures)
    : null;

  const azfReady =
    !baugleisOrder ||
    azfMode === 'pdl' ||
    (azfMode === 'eigen' && !!selectedAzfId && availableAzf.some((p) => p.id === selectedAzfId));

  const driversReady = einsatzOrder
    ? !!selectedDriver && !!selectedDriver2 && selectedDriver !== selectedDriver2
    : !!selectedDriver;
  const canAssign =
    !!selectedOrder &&
    !!selectedLoco &&
    driversReady &&
    azfReady &&
    !einsatzBlock &&
    !locoNetBlock &&
    !seriesBlock &&
    !seriesBlock2 &&
    !lineClosure &&
    (!brhCheck || brhCheck.passed) &&
    (!wagonCheck || wagonCheck.sufficient);

  async function handleAssign() {
    if (!selectedOrder || !selectedLoco || !selectedDriver) return;
    if (einsatzOrder && !selectedDriver2) {
      setError(`Baugleis-Einsatz: ${BAUGLEIS_MIN_DRIVERS} Tf im Schichtwechsel erforderlich`);
      return;
    }
    if (baugleisOrder && !azfReady) {
      setError('Baugleis: Arbeitszugführer / Rangierbegleiter (eigen oder PDL) ist Pflicht');
      return;
    }
    if (wagonCheck && !wagonCheck.sufficient) {
      setError(wagonShortageLabel(wagonCheck) ?? 'Nicht genügend Wagen — Zuweisung blockiert');
      return;
    }
    const azfPayload = baugleisOrder
      ? { driverId: azfMode === 'eigen' ? selectedAzfId : null }
      : undefined;
    setSubmitting(true);
    setError(null);
    try {
      if (!isSupabaseConfigured) {
        onLocalAssign?.(
          selectedOrder,
          selectedLoco,
          selectedDriver,
          einsatzOrder ? selectedDriver2 : undefined,
          azfPayload,
        );
        setSelectedOrder(null);
        setSelectedLoco('');
        setSelectedDriver('');
        setSelectedDriver2('');
        setAzfMode('none');
        setSelectedAzfId('');
        return;
      }
      const { error: assignErr } = await supabase.from('assignments').insert({
        order_id: selectedOrder.id,
        locomotive_id: selectedLoco,
        driver_id: selectedDriver,
        status: 'geplant',
      });
      if (assignErr) throw assignErr;
      const { error: orderErr } = await supabase.from('orders').update({ status: 'zugewiesen' }).eq('id', selectedOrder.id);
      if (orderErr) throw orderErr;
      const { error: locoErr } = await supabase.from('locomotives').update({ status: 'einsatz' }).eq('id', selectedLoco);
      if (locoErr) throw locoErr;
      const { error: driverErr } = await supabase.from('drivers').update({ status: 'im_einsatz', shift_start: gameNow.toISOString() }).eq('id', selectedDriver);
      if (driverErr) throw driverErr;
      if (einsatzOrder && selectedDriver2) {
        await supabase.from('drivers').update({ status: 'im_einsatz', shift_start: gameNow.toISOString() }).eq('id', selectedDriver2);
        onLocalAssign?.(
          selectedOrder,
          selectedLoco,
          selectedDriver,
          selectedDriver2,
          azfPayload,
        );
      }
      setSelectedOrder(null);
      setSelectedLoco('');
      setSelectedDriver('');
      setSelectedDriver2('');
      setAzfMode('none');
      setSelectedAzfId('');
      onDataChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleComplete(a: AssignmentWithDetails) {
    setSubmitting(true);
    try {
      if (!isSupabaseConfigured) {
        onLocalComplete?.(a);
        return;
      }
      await supabase.from('assignments').update({ status: 'abgeschlossen' }).eq('id', a.id);
      await supabase.from('orders').update({ status: 'abgeschlossen' }).eq('id', a.order_id);
      await supabase.from('locomotives').update({ status: 'frei' }).eq('id', a.locomotive_id);
      await supabase.from('drivers').update({ status: 'verfuegbar', shift_start: null }).eq('id', a.driver_id);
      if (a.second_driver_id) {
        await supabase.from('drivers').update({ status: 'verfuegbar', shift_start: null }).eq('id', a.second_driver_id);
      }
      onDataChange();
    } catch {
      setError('Fehler beim Abschließen');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(a: AssignmentWithDetails) {
    setSubmitting(true);
    try {
      if (!isSupabaseConfigured) {
        onLocalCancel?.(a);
        return;
      }
      await supabase.from('assignments').update({ status: 'abgebrochen' }).eq('id', a.id);
      await supabase.from('orders').update({ status: 'offen' }).eq('id', a.order_id);
      await supabase.from('locomotives').update({ status: 'frei' }).eq('id', a.locomotive_id);
      await supabase.from('drivers').update({ status: 'verfuegbar', shift_start: null }).eq('id', a.driver_id);
      if (a.second_driver_id) {
        await supabase.from('drivers').update({ status: 'verfuegbar', shift_start: null }).eq('id', a.second_driver_id);
      }
      onDataChange();
    } catch {
      setError('Fehler beim Abbrechen');
    } finally {
      setSubmitting(false);
    }
  }

  function handleRefresh() {
    onDataChange();
    setRefreshRequest((n) => n + 1);
  }

  const dispatchActions = (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={() => setFitRequest((n) => n + 1)} className="btn-gold-sm">
        <MapPin className="h-3 w-3" />
        Meine Flotte anzeigen
      </button>
      <button type="button" onClick={handleRefresh} className="btn-action btn-action-detail">
        <RefreshCw className="h-3 w-3" />
        Aktualisieren
      </button>
      {onBackPc && (
        <button type="button" onClick={onBackPc} className="btn-action btn-action-dispo">
          <Monitor className="h-3 w-3" />
          Zurück zum PC
        </button>
      )}
    </div>
  );

  if (loading) {
    return (
      <SectionShell title="Disposition" subtitle="Live-Tracking, Flotte und Einsatzplanung" actions={dispatchActions}>
        <div className="flex h-64 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-amber-500" />
        </div>
      </SectionShell>
    );
  }

  return (
    <SectionShell title="Disposition" subtitle="Live-Tracking, Flotte und Einsatzplanung (Brh / Wagen)" actions={dispatchActions} tutorialId="tutorial-disposition">

      {error && (
        <div className="rounded-md border border-rose-600/60 bg-rose-900/30 px-3 py-2 text-xs text-rose-300">{error}</div>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="fi-card overflow-hidden">
          <div className="fi-card-header flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Train className="h-3.5 w-3.5 text-sky-400" />
              LIVE Tracking — Europäische Bahnkarte
            </span>
            <span className="fi-tick text-[10px] font-bold tabular-nums">{activeAssignments.length} Züge</span>
          </div>
          <div className="h-[min(62vh,560px)] min-h-[380px]">
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-xs text-slate-500">Karte wird geladen…</div>
              }
            >
              <LiveTrackingMap
                assignments={activeAssignments}
                wagons={wagons}
                tick={tick}
                locomotives={locomotives}
                hqLocation={hqLocation}
                selectedId={selectedMarkerId}
                onSelect={setSelectedMarkerId}
                fitRequest={fitRequest}
                refreshRequest={refreshRequest}
                variant="fill"
              />
            </Suspense>
          </div>
        </div>

        <aside className="fi-card flex max-h-[min(62vh,560px)] min-h-[380px] flex-col overflow-hidden">
          <div className="fi-card-header">Züge & Flotte</div>
          <div className="fi-filter-bar shrink-0">
            {(
              [
                ['alle', 'Alle'],
                ['fahrend', 'Fahrend'],
                ['stehend', 'Stehend'],
                ['wartung', 'Pause/Wartung'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFleetFilter(id)}
                className={`fi-filter flex-1 justify-center px-1.5 ${fleetFilter === id ? 'fi-filter-active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-2">
            {filteredFleet.length === 0 && (
              <div className="py-8 text-center text-xs text-slate-500">Keine Fahrzeuge in diesem Filter</div>
            )}
            {filteredFleet.map((entry) => {
              const selected = selectedMarkerId === entry.id;
              if (entry.kind === 'train') {
                const { assignment, progress } = entry;
                const order = assignment.order!;
                const loco = assignment.locomotive!;
                const driver = assignment.driver!;
                const moving = assignment.status === 'aktiv' && progress > 0;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setSelectedMarkerId(entry.id)}
                    className={`w-full rounded-sm border p-2.5 text-left transition-colors ${
                      selected ? 'border-amber-500 bg-amber-900/20' : 'border-[#1e293b] bg-slate-900/40 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-white">{zugLabel(loco, order.order_number)}</span>
                      <span className={getAssignmentPillClass(assignment.status)}>
                        {moving ? 'Fahrend' : 'Stehend'}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      {order.origin} → {order.destination}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500">
                      <User className="h-3 w-3 text-sky-400" />
                      {driver.name}
                      {assignment.second_driver ? ` · ${assignment.second_driver.name}` : ''}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full rounded-full bg-sky-400" style={{ width: `${Math.min(100, progress)}%` }} />
                      </div>
                      <span className="w-8 text-right text-[10px] font-bold tabular-nums text-sky-300">{Math.round(progress)}%</span>
                    </div>
                    <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{etaLabel(entry.etaTicks)}</div>
                  </button>
                );
              }

              const cfg = getLocoStatusConfig(entry.loco.status);
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelectedMarkerId(entry.id)}
                  className={`w-full rounded-sm border p-2.5 text-left transition-colors ${
                    selected ? 'border-amber-500 bg-amber-900/20' : 'border-[#1e293b] bg-slate-900/40 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-white">{zugLabel(entry.loco)}</span>
                    <span className={getLocoPillClass(entry.loco.status)}>{cfg.label}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                    {entry.parked === 'wartung' ? (
                      <Wrench className="h-3 w-3 text-rose-400" />
                    ) : (
                      <Pause className="h-3 w-3 text-amber-400" />
                    )}
                    {entry.parked === 'wartung' ? 'Pause/Wartung' : `Stehend · ${hqLocation || 'Duisburg'}`}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-slate-500">{entry.loco.name}</div>
                </button>
              );
            })}
          </div>
        </aside>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="fi-card">
          <div className="fi-card-header flex items-center gap-2">
            <ClipboardList className="h-3.5 w-3.5 text-amber-500" />
            Offene Aufträge ({openOrders.length})
          </div>
          <div className="max-h-[420px] space-y-1 overflow-y-auto p-2">
            {openOrders.length === 0 && (
              <div className="py-8 text-center text-xs text-slate-500">Keine offenen Aufträge</div>
            )}
            {openOrders.map((order) => {
              const typeCfg = getOrderTypeConfig(order.type);
              const time = order.deadline
                ? timeRemaining(order.deadline, gameNow, { accepted: false })
                : null;
              const isSelected = selectedOrder?.id === order.id;
              const minBrh = clampOrderMinBrh(order.type, order.min_brh);
              return (
                <button
                  key={order.id}
                  onClick={() => {
                    setSelectedOrder(order);
                    setSelectedLoco('');
                    setSelectedDriver('');
                    setSelectedDriver2('');
                    setAzfMode('none');
                    setSelectedAzfId('');
                    setError(null);
                  }}
                  className={`w-full rounded-sm border p-2 text-left transition-all ${
                    isSelected ? 'border-amber-500 bg-amber-900/20' : 'border-slate-700 bg-slate-800/30 hover:border-slate-600 hover:bg-slate-700/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase ${typeCfg.text}`}>
                      {order.type === 'baugleis' ? <HardHat className="h-3 w-3" /> : <Package className="h-3 w-3" />}
                      {isBaugleisEinsatz(order) && order.deployment_days
                        ? `Einsatz ${order.deployment_days}d`
                        : typeCfg.label}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">{order.order_number}</span>
                  </div>
                  <div className="mt-1 text-xs font-medium text-white">{order.title}</div>
                  <div className="mt-0.5 text-[10px] text-slate-500">{order.origin} → {order.destination}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]">
                    <span className="font-bold text-emerald-400">
                      {isBaugleisEinsatz(order) && order.daily_rate
                        ? `${formatEuro(order.daily_rate)}/Tag`
                        : formatEuro(Number(order.yield))}
                    </span>
                    <span className="flex items-center gap-0.5 text-slate-500"><Gauge className="h-2.5 w-2.5" />Brh {minBrh}</span>
                    {order.required_wagon_type && (
                      <span className="flex items-center gap-0.5 text-orange-300"><Boxes className="h-2.5 w-2.5" />{order.required_wagon_count}× {order.required_wagon_type}</span>
                    )}
                    {time && (
                      <span className={`ml-auto font-bold ${time.critical ? 'text-rose-400' : time.urgent ? 'text-amber-400' : 'text-slate-400'}`}>
                        <Clock className="mr-0.5 inline h-2.5 w-2.5" />{time.text}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="fi-card">
          <div className="fi-card-header flex items-center gap-2">
            <Train className="h-3.5 w-3.5 text-amber-500" /> Zuweisung erstellen
          </div>
          <div className="p-3 space-y-3">
            {!selectedOrder ? (
              <div className="py-10 text-center text-xs text-slate-500">
                Wählen Sie einen offenen Auftrag aus, um eine Zuweisung zu erstellen.
              </div>
            ) : (
              <>
                <div className="rounded-sm border border-amber-600/40 bg-amber-900/15 p-2">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Ausgewählter Auftrag</div>
                  <div className="mt-0.5 text-xs font-bold text-white">{selectedOrder.title}</div>
                  <div className="text-[10px] text-slate-500">{selectedOrder.order_number} · {selectedOrder.origin} → {selectedOrder.destination}</div>
                  {einsatzOrder && (
                    <div className="mt-1 text-[10px] text-amber-300">
                      Bindet 1 Diesellok + {requiredDriversFor(selectedOrder)} Tf + AZF/RB für {selectedOrder.deployment_days} Tage
                      {selectedOrder.daily_rate ? ` · ${formatEuro(selectedOrder.daily_rate)}/Tag` : ''}
                    </div>
                  )}
                </div>

                <OrderCostBreakdown
                  order={selectedOrder}
                  fuelType={selectedLocoObj?.fuel_type}
                  compact
                  azfSource={azfMode === 'eigen' ? 'eigen' : 'pdl'}
                  azfUnresolved={baugleisOrder && azfMode === 'none'}
                />

                <div>
                  <label className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400">
                    <Train className="h-3 w-3" /> Triebfahrzeug
                    {einsatzOrder && <span className="font-normal normal-case text-amber-400/80">· Diesel / Dual (BR 218, V 90 / BR 290)</span>}
                  </label>
                  <select
                    value={selectedLoco}
                    onChange={(e) => setSelectedLoco(e.target.value)}
                    className="w-full rounded-sm border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-white outline-none focus:border-amber-500"
                  >
                    <option value="">— Bitte wählen —</option>
                    {availableLocos.map((loco) => (
                      <option key={loco.id} value={loco.id}>
                        {getLocoDisplayName(loco.designation)} · Brh {loco.brake_pct}% · Kraftstoff {loco.fuel_level}%
                      </option>
                    ))}
                  </select>
                  {availableLocos.length === 0 && (
                    <p className="mt-1 text-[10px] text-rose-400">
                      {einsatzOrder
                        ? 'Keine freie Diesel-/Dual-Lok für den Baugleis-Einsatz'
                        : 'Keine einsatzbereiten Triebfahrzeuge (HU ungültig / stillgelegt / belegt)'}
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400">
                    <User className="h-3 w-3" /> {einsatzOrder ? 'Tf 1 (Schicht A)' : 'Triebfahrzeugführer'}
                  </label>
                  <select
                    value={selectedDriver}
                    onChange={(e) => {
                      setSelectedDriver(e.target.value);
                      if (e.target.value === selectedDriver2) setSelectedDriver2('');
                    }}
                    className="w-full rounded-sm border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-white outline-none focus:border-amber-500"
                  >
                    <option value="">— Bitte wählen —</option>
                    {availableDrivers.map((driver) => {
                      const rest = driverRestStatus(driver, gameNow);
                      return (
                      <option key={driver.id} value={driver.id}>
                        {driver.name} · {driver.qualifications.join(', ')} · {driver.hours_worked}/{driver.max_hours}h
                        {seriesIdForLoco(selectedLocoObj) &&
                        !staffMeta[driver.id]?.seriesIds?.includes(seriesIdForLoco(selectedLocoObj) ?? '')
                          ? ` · keine ${seriesLabel(seriesIdForLoco(selectedLocoObj))}`
                          : ''}
                        {rest.violated ? ' · Ruhezeit!' : ''}
                      </option>
                      );
                    })}
                  </select>
                  {availableDrivers.length === 0 && <p className="mt-1 text-[10px] text-rose-400">Keine verfügbaren Tf verfügbar</p>}
                </div>

                {einsatzOrder && (
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400">
                      <User className="h-3 w-3" /> Tf 2 (Schicht B / Ruhe)
                    </label>
                    <select
                      value={selectedDriver2}
                      onChange={(e) => setSelectedDriver2(e.target.value)}
                      className="w-full rounded-sm border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-white outline-none focus:border-amber-500"
                    >
                      <option value="">— Zweiten Tf wählen —</option>
                      {availableDrivers2.map((driver) => {
                        const rest = driverRestStatus(driver, gameNow);
                        return (
                        <option key={driver.id} value={driver.id}>
                          {driver.name} · {driver.qualifications.join(', ')} · {driver.hours_worked}/{driver.max_hours}h
                          {seriesIdForLoco(selectedLocoObj) &&
                          !staffMeta[driver.id]?.seriesIds?.includes(seriesIdForLoco(selectedLocoObj) ?? '')
                            ? ` · keine ${seriesLabel(seriesIdForLoco(selectedLocoObj))}`
                            : ''}
                          {rest.violated ? ' · Ruhezeit!' : ''}
                        </option>
                        );
                      })}
                    </select>
                    {availableDrivers.length < BAUGLEIS_MIN_DRIVERS && (
                      <p className="mt-1 text-[10px] text-rose-400">
                        Zuweisung blockiert — mindestens {BAUGLEIS_MIN_DRIVERS} verfügbare Tf für den Schichtwechsel
                      </p>
                    )}
                  </div>
                )}

                {baugleisOrder && selectedOrder && (
                  <div data-tutorial="tutorial-pdl" className="rounded-sm border border-orange-400/70 bg-orange-950/30 p-2.5 shadow-[inset_0_0_0_1px_rgba(251,146,60,0.15)]">
                    <div className="flex items-start gap-2">
                      <HardHat className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wide text-orange-200">
                          Zusatzpersonal erforderlich
                        </div>
                        <div className="mt-0.5 text-xs font-semibold text-white">
                          Arbeitszugführer / Rangierbegleiter (AZF/RB)
                        </div>
                        <p className="mt-1 text-[10px] leading-relaxed text-orange-100/70">
                          Baugleis-Regel: ohne AZF/RB darf der Zug nicht abfahren. Eigenes Personal oder
                          Personaldienstleister (PDL) wählen.
                        </p>
                      </div>
                    </div>

                    <div className="mt-2.5 grid gap-2">
                      <label
                        className={`flex cursor-pointer items-start gap-2 rounded-sm border px-2.5 py-2 transition-colors ${
                          azfMode === 'eigen'
                            ? 'border-orange-400 bg-orange-900/40'
                            : availableAzf.length === 0
                              ? 'cursor-not-allowed border-slate-700 bg-slate-900/40 opacity-50'
                              : 'border-slate-600 bg-slate-900/50 hover:border-orange-400/50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="azf-source"
                          className="mt-0.5 accent-orange-400"
                          checked={azfMode === 'eigen'}
                          disabled={availableAzf.length === 0}
                          onChange={() => {
                            setAzfMode('eigen');
                            setSelectedAzfId(availableAzf[0]?.id ?? '');
                          }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1 text-[11px] font-bold text-white">
                            <UserCog className="h-3 w-3 text-orange-300" />
                            Eigenes Personal (AZF/RB)
                          </span>
                          <span className="mt-0.5 block text-[10px] text-slate-400">
                            {availableAzf.length === 0
                              ? 'Kein freier AZF/RB im Personalstamm — Option gesperrt'
                              : `${availableAzf.length} verfügbar · keine PDL-Tagessätze`}
                          </span>
                          {azfMode === 'eigen' && availableAzf.length > 0 && (
                            <select
                              value={selectedAzfId}
                              onChange={(e) => setSelectedAzfId(e.target.value)}
                              className="mt-1.5 w-full rounded-sm border border-orange-400/40 bg-slate-950 px-2 py-1 text-[11px] text-white outline-none focus:border-orange-400"
                            >
                              {availableAzf.map((person) => (
                                <option key={person.id} value={person.id}>
                                  {person.name} · {(person.qualifications ?? []).join(', ')}
                                </option>
                              ))}
                            </select>
                          )}
                        </span>
                      </label>

                      <label
                        className={`flex cursor-pointer items-start gap-2 rounded-sm border px-2.5 py-2 transition-colors ${
                          azfMode === 'pdl'
                            ? 'border-orange-400 bg-orange-900/40'
                            : 'border-slate-600 bg-slate-900/50 hover:border-orange-400/50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="azf-source"
                          className="mt-0.5 accent-orange-400"
                          checked={azfMode === 'pdl'}
                          onChange={() => {
                            setAzfMode('pdl');
                            setSelectedAzfId('');
                          }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2 text-[11px] font-bold text-white">
                            <span>Personaldienstleister (PDL) buchen</span>
                            {pdlQuote && (
                              <span className="tabular-nums text-orange-300">{formatEuro(pdlQuote.daily)} / Schicht</span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-[10px] text-slate-400">
                            Tagessatz 650–850 €
                            {pdlQuote && pdlQuote.shifts > 1
                              ? ` · ${pdlQuote.shifts} Schichten = ${formatEuro(pdlQuote.total)}`
                              : einsatzOrder
                                ? ' · täglich während des Einsatzes'
                                : ' · einmalig mit der Fahrt'}
                          </span>
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                {selectedOrder && (
                  <p className="text-[10px] text-slate-500">
                    Netz {corridorCountryHint(selectedOrder)}
                  </p>
                )}

                {restWarn.length > 0 && (
                  <div className="flex items-start gap-2 rounded-sm border border-rose-500 bg-rose-950/40 p-2 text-[11px] text-rose-200">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                    <div>
                      <div className="font-bold uppercase tracking-wide text-rose-300">{REST_WARNING}</div>
                      <p className="mt-0.5">
                        Zuweisung bleibt möglich. {restWarn.map((row) => restStatusHint(row.status)).filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                )}

                {lineClosure && (
                  <div className="flex items-start gap-2 rounded-sm border border-rose-600 bg-rose-950/50 p-2 text-[11px] text-rose-200">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="font-bold">{closureBlockMessage(lineClosure, tick)}</span>
                  </div>
                )}

                {(seriesBlock || seriesBlock2) && (
                  <div className="flex items-start gap-2 rounded-sm border border-amber-500 bg-amber-950/40 p-2 text-[11px] text-amber-100">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="font-bold">{seriesBlock2 ?? seriesBlock}</span>
                  </div>
                )}

                {locoNetBlock && (
                  <div className="flex items-start gap-2 rounded-sm border border-amber-500 bg-amber-950/40 p-2 text-[11px] text-amber-100">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div>
                      <div className="font-bold">{locoNetBlock}</div>
                      {onOpenNetworkDealer && (
                        <button
                          type="button"
                          className="mt-1 text-[10px] font-bold uppercase text-amber-300 underline"
                          onClick={() => onOpenNetworkDealer()}
                        >
                          Zum Händler / Netzzugang
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {wagonCheck && selectedOrder.required_wagon_type && (
                  <div className={`flex items-start gap-2 rounded-sm border p-2 text-[11px] ${wagonCheck.sufficient ? 'border-emerald-600 bg-emerald-900/20 text-emerald-300' : 'border-rose-600 bg-rose-900/20 text-rose-300'}`}>
                    {wagonCheck.sufficient ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <span className="font-bold">Wagenkomposition</span>
                      <div className="mt-0.5">{selectedOrder.required_wagon_count}× {selectedOrder.required_wagon_type} erforderlich · {wagonCheck.available} verfügbar</div>
                      {!wagonCheck.sufficient && (
                        <>
                          <div className="mt-0.5 font-bold">{wagonShortageLabel(wagonCheck) ?? 'Nicht genügend Wagen verfügbar — Zuweisung blockiert!'}</div>
                          <div className="mt-2">
                            <WagonShortageBanner
                              check={wagonCheck}
                              onQuickAcquire={onQuickAcquireWagons}
                              onOpenDealer={onBuyMissingWagons}
                              onOpenBuildings={onOpenBuildings}
                              freeBerths={freeBerths}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {brhCheck && (
                  <div className={`rounded-sm border p-2.5 text-[11px] ${brhCheck.passed ? 'border-emerald-600 bg-emerald-900/20 text-emerald-300' : 'border-rose-600 bg-rose-900/20 text-rose-300'}`}>
                    <div className="flex items-start gap-2">
                      {brhCheck.passed ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                      <div className="flex-1">
                        <span className="font-bold">Bremshundertstel-Prüfung (Brh)</span>
                        <div className="mt-0.5">{brhCheck.message}</div>
                      </div>
                    </div>
                    <div className="mt-2 border-t border-slate-700/50 pt-2">
                      <div className="font-bold text-slate-400">Zug gesamt: <span className={brhCheck.passed ? 'text-emerald-300' : 'text-rose-300'}>{brhCheck.availableBrh} Brh</span></div>
                      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-slate-400">
                        <div>Lok: <span className="font-medium text-slate-300">{brhCheck.breakdown.locoWeight}t</span> / Bremsmasse <span className="font-medium text-slate-300">{brhCheck.breakdown.locoBrakeWeight}t</span></div>
                        {brhCheck.breakdown.wagonCount > 0 && brhCheck.breakdown.wagonType ? (
                          <div>{brhCheck.breakdown.wagonCount}× {brhCheck.breakdown.wagonType} (Stlg {brhCheck.breakdown.brakePosition}): <span className="font-medium text-slate-300">{brhCheck.breakdown.wagonWeight}t</span> / Bremsmasse <span className="font-medium text-slate-300">{brhCheck.breakdown.wagonBrakeWeight}t</span></div>
                        ) : (
                          <div>Wagen: <span className="text-slate-500">keine benötigt</span></div>
                        )}
                      </div>
                      <div className="mt-1 text-slate-400">
                        Formel: ({brhCheck.breakdown.locoBrakeWeight}t + {brhCheck.breakdown.wagonBrakeWeight}t) / {brhCheck.breakdown.totalWeight}t × 100 = <span className={brhCheck.passed ? 'font-bold text-emerald-300' : 'font-bold text-rose-300'}>{brhCheck.availableBrh}</span>
                        <span className="ml-2 text-slate-500">| Mindest-Brh: <span className="font-bold text-slate-300">{brhCheck.requiredBrh}</span></span>
                      </div>
                    </div>
                    {!brhCheck.passed && (
                      <div className="mt-2 flex items-center gap-1 font-bold text-rose-300">
                        <Info className="h-3 w-3" />Zuweisung blockiert — Bremsleistung unzureichend
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={handleAssign}
                  disabled={!canAssign || submitting}
                  className="btn-gold w-full disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {submitting ? 'Wird zugewiesen…' : 'Zug abfahren / Bestätigen'}
                </button>
                {einsatzBlock && selectedLoco && (
                  <p className="text-center text-[10px] text-rose-400">{einsatzBlock}</p>
                )}
                {baugleisOrder && !azfReady && (
                  <p className="text-center text-[10px] text-orange-300">
                    Zuweisung blockiert — AZF/RB (eigenes Personal) oder PDL auswählen
                  </p>
                )}
                {!canAssign && selectedLoco && selectedDriver && !einsatzBlock && azfReady && (
                  <p className="text-center text-[10px] text-rose-400">Zuweisung blockiert — Prüfungen oben beachten</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="fi-card">
        <div className="fi-card-header flex items-center gap-2">
          <ClipboardList className="h-3.5 w-3.5 text-sky-500" /> Aktive Zuweisungen ({activeAssignments.length})
        </div>
        <div className="overflow-x-auto">
          <table className="fi-table">
            <thead>
              <tr>
                <th>Auftrag</th>
                <th>Strecke</th>
                <th>Lok</th>
                <th>Tf</th>
                <th>Fortschritt</th>
                <th>Frist</th>
                <th>Status</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {activeAssignments.length === 0 && (
                <tr><td colSpan={8} className="py-6 text-center text-slate-500">Keine aktiven Zuweisungen</td></tr>
              )}
              {activeAssignments.map((a) => {
                const aCfg = getAssignmentStatusConfig(a.status);
                const order = a.order;
                const loco = a.locomotive;
                const driver = a.driver;
                if (!order || !loco || !driver) return null;
                const time = order.deadline
                  ? timeRemaining(order.deadline, gameNow, { accepted: true })
                  : null;
                const progress = assignmentProgress(a, tick);
                const dep = deployments.find((d) => d.assignmentId === a.id);
                const einsatzOpex = dep ? deploymentDailyOperating(dep) : 0;
                return (
                  <tr key={a.id}>
                    <td className="text-slate-300">{order.title}</td>
                    <td className="text-[11px] text-slate-400">{order.origin} → {order.destination}</td>
                    <td className="text-slate-300">{getLocoDisplayName(loco.designation)}</td>
                    <td className="text-slate-300">
                      {driver.name}
                      {a.second_driver ? ` · ${a.second_driver.name}` : ''}
                      {isBaugleisOrder(order) && (
                        <div className="text-[10px] text-orange-300">
                          {a.azf_driver?.name
                            ? `AZF/RB ${a.azf_driver.name}`
                            : a.pdl_azf_daily
                              ? `PDL AZF/RB ${formatEuro(a.pdl_azf_daily)}/Tag`
                              : 'AZF/RB offen'}
                        </div>
                      )}
                    </td>
                    <td className="min-w-[110px]">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                          <div className="h-full rounded-full bg-sky-400" style={{ width: `${Math.min(100, progress)}%` }} />
                        </div>
                        <span className="w-8 text-right text-[10px] font-bold tabular-nums text-sky-300">{Math.round(progress)}%</span>
                      </div>
                    </td>
                    <td>
                      {time && (
                        <span className={`font-bold ${time.critical ? 'text-rose-400' : time.urgent ? 'text-amber-400' : 'text-slate-400'}`}>
                          {time.text}
                        </span>
                      )}
                    </td>
                    <td><span className={getAssignmentPillClass(a.status)}>{aCfg.label}</span></td>
                    <td>
                      <div className="flex gap-1">
                        {!isBaugleisEinsatz(order) && (
                          <button onClick={() => handleComplete(a)} disabled={submitting} title="Abschließen" className="btn-action border-emerald-600 bg-emerald-900/30 text-emerald-300 hover:bg-emerald-800/50">
                            <Check className="h-3 w-3" />Fertig
                          </button>
                        )}
                        {isBaugleisEinsatz(order) && (
                          <span className="text-[10px] font-bold uppercase text-amber-400">
                            {dep?.remainingDays ?? order.deployment_days} Tage
                            {einsatzOpex > 0 ? ` · −${formatEuro(einsatzOpex)}/Tag Betrieb` : ''}
                          </span>
                        )}
                        <button onClick={() => handleCancel(a)} disabled={submitting} title="Abbrechen" className="btn-action border-rose-600 bg-rose-900/30 text-rose-300 hover:bg-rose-800/50">
                          <X className="h-3 w-3" />Abbr.
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </SectionShell>
  );
}
