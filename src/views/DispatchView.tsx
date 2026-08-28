import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import {
  ClipboardList,
  Train,
  User,
  Check,
  X,
  MapPin,
  Pause,
  Wrench,
  RefreshCw,
  Monitor,
} from 'lucide-react';
import type {
  Locomotive,
  Driver,
  Order,
  AssignmentWithDetails,
  Wagon,
} from '@/lib/supabase';
import { isSupabaseConfigured } from '@/lib/supabase';
import { getSupabaseClient } from '@/lib/supabaseClient';
import {
  formatEuro,
  timeRemaining,
  getAssignmentStatusConfig,
  getAssignmentPillClass,
  getLocoPillClass,
  getLocoStatusConfig,
} from '@/lib/status';
import { calculateTrainBrh, checkWagonAvailability, wagonShortageLabel } from '@/lib/brh';
import type { Acquisition } from '@/lib/dealer';
import { getLocoDisplayName } from '@/lib/locoPhotos';
import { useGameClock } from '@/lib/GameClockContext';
import { assignmentProgress, etaFromProgress, locoMarkerId } from '@/lib/tracking';
import { SectionShell } from '@/components/SectionShell';
import {
  BAUGLEIS_MIN_DRIVERS,
  isBaugleisEinsatz,
  isExpiredOpenOffer,
} from '@/lib/orderMarket';
import { evaluateAssignmentFit } from '@/lib/traction';
import type { BaugleisDeployment } from '@/lib/baugleisDeployments';
import { canStartBaugleisEinsatz, deploymentDailyOperating } from '@/lib/baugleisDeployments';
import { availableAzfStaff, isBaugleisOrder } from '@/lib/pdl';
import { networkDispatchBlock } from '@/lib/networkAccess';
import { orderBlockedByClosure, type WorldEventState } from '@/lib/events';
import { seriesDispatchBlock } from '@/lib/personal';
import type { StaffMeta } from '@/lib/jobcenter';
import { TrackingMapSurface } from '@/components/TrackingMapSurface';
import type { NetworkStatus } from '@/lib/networkStatus';
import type { HandbookOpenTo } from '@/lib/handbook';
import { DispatchStepper } from '@/components/DispatchStepper';
import type { AzfMode, DispatchStep } from '@/lib/dispatchPlan';

interface DispatchViewProps {
  orders: Order[];
  locomotives: Locomotive[];
  drivers: Driver[];
  assignments: AssignmentWithDetails[];
  wagons: Wagon[];
  loading: boolean;
  onDataChange: () => void;
  preselectOrder?: Order | null;
  preselectLocoId?: string | null;
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
  onBackPc?: () => void;
  onBuyMissingWagons?: (typeCode: string, qty: number) => void;
  onQuickAcquireWagons?: (typeCode: string, qty: number, how: Acquisition) => void;
  onOpenBuildings?: () => void;
  freeBerths?: number;
  worldEvents?: WorldEventState;
  staffMeta?: Record<string, StaffMeta>;
  onOpenNetworkDealer?: (pack?: string) => void;
  networkStatus?: NetworkStatus;
  onOpenHandbook?: (target?: HandbookOpenTo) => void;
}

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
  preselectLocoId,
  onLocalAssign,
  onLocalComplete,
  onLocalCancel,
  deployments = [],
  hqLocation,
  onBackPc,
  onBuyMissingWagons,
  onQuickAcquireWagons,
  onOpenBuildings,
  freeBerths,
  worldEvents,
  staffMeta = {},
  onOpenNetworkDealer,
  networkStatus = 'online',
  onOpenHandbook,
}: DispatchViewProps) {
  const { gameNow, tick } = useGameClock();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(preselectOrder ?? null);
  const [selectedLoco, setSelectedLoco] = useState<string>('');
  const [selectedDriver, setSelectedDriver] = useState<string>('');
  const [selectedDriver2, setSelectedDriver2] = useState<string>('');
  const [azfMode, setAzfMode] = useState<AzfMode>('none');
  const [selectedAzfId, setSelectedAzfId] = useState<string>('');
  const [dispatchStep, setDispatchStep] = useState<DispatchStep>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fleetFilter, setFleetFilter] = useState<FleetFilter>('alle');
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const activeAssignmentRef = useRef<HTMLTableRowElement | null>(null);
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
      setDispatchStep(2);
    }
  }, [preselectOrder]);

  useEffect(() => {
    if (!preselectLocoId) return;
    setSelectedLoco(preselectLocoId);
    setSelectedDriver('');
    setSelectedDriver2('');
    setAzfMode('none');
    setSelectedAzfId('');
    setDispatchStep(2);
  }, [preselectLocoId]);

  const openOrders = useMemo(
    () => orders.filter((o) => o.status === 'offen' && !isExpiredOpenOffer(o, gameNow)),
    [orders, gameNow],
  );
  const einsatzOrder = isBaugleisEinsatz(selectedOrder);
  const baugleisOrder = isBaugleisOrder(selectedOrder);
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
  const tractionFit = useMemo(() => {
    if (!selectedOrder || !selectedLocoObj) return null;
    return evaluateAssignmentFit(selectedOrder, selectedLocoObj);
  }, [selectedOrder, selectedLocoObj]);
  const wagonCheck = useMemo(() => {
    if (!selectedOrder) return null;
    return checkWagonAvailability(selectedOrder, wagons);
  }, [selectedOrder, wagons]);
  const einsatzBlock = selectedOrder
    ? canStartBaugleisEinsatz(selectedOrder, selectedLocoObj ?? undefined, selectedDriverObj ?? undefined, selectedDriver2Obj ?? undefined)
    : null;
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
    (!tractionFit || tractionFit.ok) &&
    (!brhCheck || brhCheck.passed) &&
    (!wagonCheck || wagonCheck.sufficient);

  async function handleAssign() {
    if (!selectedOrder || !selectedLoco || !selectedDriver) return;
    if (!canAssign) {
      setError(
        einsatzBlock ??
          seriesBlock2 ??
          seriesBlock ??
          locoNetBlock ??
          (tractionFit && !tractionFit.ok ? tractionFit.message : 'Zuweisung blockiert — Fahrbereit-Schritt prüfen'),
      );
      return;
    }
    if (einsatzOrder && !selectedDriver2) {
      setError(`Baugleis-Einsatz: ${BAUGLEIS_MIN_DRIVERS} Tf im Schichtwechsel erforderlich`);
      return;
    }
    if (tractionFit && !tractionFit.ok) {
      setError(tractionFit.message);
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
        setDispatchStep(1);
        return;
      }
      const client = await getSupabaseClient();
      if (!client) throw new Error('Online-Persistenz konnte nicht geladen werden');
      const { error: assignErr } = await client.from('assignments').insert({
        order_id: selectedOrder.id,
        locomotive_id: selectedLoco,
        driver_id: selectedDriver,
        status: 'geplant',
      });
      if (assignErr) throw assignErr;
      const { error: orderErr } = await client.from('orders').update({ status: 'zugewiesen' }).eq('id', selectedOrder.id);
      if (orderErr) throw orderErr;
      const { error: locoErr } = await client.from('locomotives').update({ status: 'einsatz' }).eq('id', selectedLoco);
      if (locoErr) throw locoErr;
      const { error: driverErr } = await client.from('drivers').update({ status: 'im_einsatz', shift_start: gameNow.toISOString() }).eq('id', selectedDriver);
      if (driverErr) throw driverErr;
      if (einsatzOrder && selectedDriver2) {
        await client.from('drivers').update({ status: 'im_einsatz', shift_start: gameNow.toISOString() }).eq('id', selectedDriver2);
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
      setDispatchStep(1);
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
      const client = await getSupabaseClient();
      if (!client) throw new Error('Online-Persistenz konnte nicht geladen werden');
      await client.from('assignments').update({ status: 'abgeschlossen' }).eq('id', a.id);
      await client.from('orders').update({ status: 'abgeschlossen' }).eq('id', a.order_id);
      await client.from('locomotives').update({ status: 'frei' }).eq('id', a.locomotive_id);
      await client.from('drivers').update({ status: 'verfuegbar', shift_start: null }).eq('id', a.driver_id);
      if (a.second_driver_id) {
        await client.from('drivers').update({ status: 'verfuegbar', shift_start: null }).eq('id', a.second_driver_id);
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
      const client = await getSupabaseClient();
      if (!client) throw new Error('Online-Persistenz konnte nicht geladen werden');
      await client.from('assignments').update({ status: 'abgebrochen' }).eq('id', a.id);
      await client.from('orders').update({ status: 'offen' }).eq('id', a.order_id);
      await client.from('locomotives').update({ status: 'frei' }).eq('id', a.locomotive_id);
      await client.from('drivers').update({ status: 'verfuegbar', shift_start: null }).eq('id', a.driver_id);
      if (a.second_driver_id) {
        await client.from('drivers').update({ status: 'verfuegbar', shift_start: null }).eq('id', a.second_driver_id);
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

  function handleOpenTrainDispatch(assignmentId: string) {
    setSelectedMarkerId(assignmentId);
    window.requestAnimationFrame(() => {
      activeAssignmentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  const dispatchActions = (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => {
          setMapOpen(true);
          setFitRequest((n) => n + 1);
        }}
        className="btn-gold-sm"
      >
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
            {mapOpen ? (
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center text-xs text-slate-500">Karte wird geladen…</div>
                }
              >
                <TrackingMapSurface
                  networkStatus={networkStatus}
                  assignments={assignments}
                  wagons={wagons}
                  tick={tick}
                  locomotives={locomotives}
                  hqLocation={hqLocation}
                  selectedId={selectedMarkerId}
                  onSelect={setSelectedMarkerId}
                  onOpenTrainDispatch={handleOpenTrainDispatch}
                  fitRequest={fitRequest}
                  refreshRequest={refreshRequest}
                  variant="fill"
                />
              </Suspense>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <MapPin className="h-8 w-8 text-sky-400/80" aria-hidden />
                <div>
                  <p className="text-sm font-bold text-slate-200">Live Tracking bei Bedarf laden</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Die Europakarte wird erst geöffnet, wenn du sie wirklich benötigst. Das hält die Disposition schneller.
                  </p>
                </div>
                <button type="button" onClick={() => setMapOpen(true)} className="btn-gold-sm">
                  <MapPin className="h-3 w-3" />
                  Live Tracking öffnen
                </button>
              </div>
            )}
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

      <DispatchStepper
        step={dispatchStep}
        onStep={setDispatchStep}
        orders={openOrders}
        locomotives={locomotives}
        drivers={drivers}
        wagons={wagons}
        selectedOrder={selectedOrder}
        selectedLoco={selectedLoco}
        selectedDriver={selectedDriver}
        selectedDriver2={selectedDriver2}
        azfMode={azfMode}
        selectedAzfId={selectedAzfId}
        onSelectOrder={(order) => {
          setSelectedOrder(order);
          setSelectedLoco('');
          setSelectedDriver('');
          setSelectedDriver2('');
          setAzfMode('none');
          setSelectedAzfId('');
          setError(null);
        }}
        onSelectLoco={setSelectedLoco}
        onSelectDriver={(id) => {
          setSelectedDriver(id);
          if (id === selectedDriver2) setSelectedDriver2('');
        }}
        onSelectDriver2={setSelectedDriver2}
        onAzfMode={setAzfMode}
        onSelectAzf={setSelectedAzfId}
        staffMeta={staffMeta}
        gameNow={gameNow}
        tick={tick}
        submitting={submitting}
        worldEvents={worldEvents}
        onAssign={handleAssign}
        onOpenHandbook={onOpenHandbook}
        onOpenNetworkDealer={onOpenNetworkDealer}
        onBuyMissingWagons={onBuyMissingWagons}
        onQuickAcquireWagons={onQuickAcquireWagons}
        onOpenBuildings={onOpenBuildings}
        freeBerths={freeBerths}
      />

      <div className="fi-card">
        <div className="fi-card-header flex items-center gap-2">
          <ClipboardList className="h-3.5 w-3.5 text-sky-500" /> Aktive Zuweisungen ({activeAssignments.length})
        </div>
        <div className="overflow-x-auto">
          <table className="fi-table fi-mobile-card-table">
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
                <tr><td colSpan={8} className="fi-mobile-empty-state py-6 text-center text-slate-500">Keine aktiven Zuweisungen</td></tr>
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
                  <tr
                    key={a.id}
                    ref={selectedMarkerId === a.id ? activeAssignmentRef : undefined}
                    data-active-train-dispatch={a.id}
                    className={selectedMarkerId === a.id ? 'bg-amber-900/20 outline outline-1 outline-amber-500/70' : ''}
                  >
                    <td data-label="Auftrag" className="fi-mobile-card-title text-slate-300">{order.title}</td>
                    <td data-label="Strecke" className="fi-mobile-card-summary text-[11px] text-slate-400">{order.origin} → {order.destination}</td>
                    <td data-label="Lok" className="text-slate-300">{getLocoDisplayName(loco.designation)}</td>
                    <td data-label="Tf" className="text-slate-300">
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
                    <td data-label="Fortschritt" className="min-w-[110px]">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                          <div className="h-full rounded-full bg-sky-400" style={{ width: `${Math.min(100, progress)}%` }} />
                        </div>
                        <span className="w-8 text-right text-[10px] font-bold tabular-nums text-sky-300">{Math.round(progress)}%</span>
                      </div>
                    </td>
                    <td data-label="Frist">
                      {time && (
                        <span className={`font-bold ${time.critical ? 'text-rose-400' : time.urgent ? 'text-amber-400' : 'text-slate-400'}`}>
                          {time.text}
                        </span>
                      )}
                    </td>
                    <td data-label="Status"><span className={getAssignmentPillClass(a.status)}>{aCfg.label}</span></td>
                    <td data-label="Aktionen" className="fi-mobile-card-actions">
                      <div className="flex flex-wrap gap-1">
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
