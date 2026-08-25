import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ChevronRight,
  Clock3,
  ListTree,
  MapPin,
  Network,
  Route,
  Save,
  Train,
  Trash2,
  X,
} from 'lucide-react';
import type { Company, Order } from '@/lib/supabase';
import { formatEuro } from '@/lib/status';
import { Button, Card, CardFlush, CardHeader } from '@/components/ui';
import { SectionShell } from '@/components/SectionShell';
import {
  RAIL_STATIONS,
  type StationCoord,
} from '@/lib/stations';
import {
  ROUTE_EDGES,
  buildRoutePlan,
  createTimetableEntry,
  plannedTravelTicks,
  type RouteNetworkState,
  type RoutePlan,
  type StationKey,
  type TimetableEntry,
} from '@/lib/routeNetwork';
import { TICKS_PER_DAY } from '@/lib/storage';

interface NetworkPlannerViewProps {
  company: Company | null;
  orders: Order[];
  network: RouteNetworkState;
  onSaveRoutePlan: (plan: RoutePlan) => void;
  onDeleteRoutePlan: (routePlanId: string) => void;
  onSaveTimetableEntry: (entry: TimetableEntry) => void;
  onDeleteTimetableEntry: (entryId: string) => void;
  onOpenDisposition: (order: Order) => void;
}

const STATION_KEYS = Object.keys(RAIL_STATIONS) as StationKey[];
const MAP_BOUNDS = STATION_KEYS.reduce(
  (bounds, key) => {
    const station = RAIL_STATIONS[key];
    return {
      minLat: Math.min(bounds.minLat, station.lat),
      maxLat: Math.max(bounds.maxLat, station.lat),
      minLng: Math.min(bounds.minLng, station.lng),
      maxLng: Math.max(bounds.maxLng, station.lng),
    };
  },
  { minLat: Number.POSITIVE_INFINITY, maxLat: Number.NEGATIVE_INFINITY, minLng: Number.POSITIVE_INFINITY, maxLng: Number.NEGATIVE_INFINITY },
);

type PendingCommit =
  | { kind: 'route'; plan: RoutePlan }
  | { kind: 'timetable'; entry: TimetableEntry; plan: RoutePlan; order: Order }
  | { kind: 'delete-route'; plan: RoutePlan; dependentEntries: number }
  | { kind: 'delete-timetable'; entry: TimetableEntry };

function projectStation(station: StationCoord): { x: number; y: number } {
  const width = Math.max(0.01, MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng);
  const height = Math.max(0.01, MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat);
  return {
    x: 6 + ((station.lng - MAP_BOUNDS.minLng) / width) * 88,
    y: 8 + (1 - (station.lat - MAP_BOUNDS.minLat) / height) * 82,
  };
}

function clockLabel(tick: number): string {
  const hour = ((Math.round(tick) % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
  return `${String(hour).padStart(2, '0')}:00`;
}

function routeLabel(plan: RoutePlan): string {
  return plan.stationKeys.map((key) => RAIL_STATIONS[key].label).join(' → ');
}

export function NetworkPlannerView({
  company,
  orders,
  network,
  onSaveRoutePlan,
  onDeleteRoutePlan,
  onSaveTimetableEntry,
  onDeleteTimetableEntry,
  onOpenDisposition,
}: NetworkPlannerViewProps) {
  const tick = company?.tick ?? 0;
  const [from, setFrom] = useState<StationKey>('duisburg');
  const [to, setTo] = useState<StationKey>('muenchen');
  const [routeName, setRouteName] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(network.plans[0]?.id ?? null);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [departureHour, setDepartureHour] = useState(8);
  const [pending, setPending] = useState<PendingCommit | null>(null);

  const candidate = useMemo(() => buildRoutePlan(routeName, from, to, tick), [routeName, from, to, tick]);
  const selectedPlan = network.plans.find((plan) => plan.id === selectedPlanId) ?? null;
  const displayedPlan = selectedPlan ?? candidate;
  const selectedEdgeIds = new Set(displayedPlan?.edgeIds ?? []);
  const displayedLastStation = displayedPlan?.stationKeys[displayedPlan.stationKeys.length - 1] ?? null;
  const openOrders = useMemo(() => orders.filter((order) => order.status === 'offen'), [orders]);
  const selectedOrder = openOrders.find((order) => order.id === selectedOrderId) ?? null;
  const dayStart = Math.floor(tick / TICKS_PER_DAY) * TICKS_PER_DAY;
  const todayEntries = network.timetableEntries
    .filter((entry) => entry.departureTick < dayStart + TICKS_PER_DAY && entry.arrivalTick > dayStart)
    .sort((a, b) => a.departureTick - b.departureTick);

  function chooseStation(key: StationKey) {
    if (key === from) {
      setFrom(to);
      setTo(key);
      return;
    }
    if (key === to) {
      setTo(from);
      setFrom(key);
      return;
    }
    setTo(key);
  }

  function stageRouteSave() {
    if (!candidate) return;
    setPending({ kind: 'route', plan: candidate });
  }

  function stageTimetableSave() {
    if (!selectedPlan || !selectedOrder) return;
    const entry = createTimetableEntry({
      routePlan: selectedPlan,
      orderId: selectedOrder.id,
      orderNumber: selectedOrder.order_number,
      label: selectedOrder.title,
      departureTick: dayStart + departureHour,
      tick,
    });
    if (!entry) return;
    setPending({ kind: 'timetable', entry, plan: selectedPlan, order: selectedOrder });
  }

  function confirmPending() {
    if (!pending) return;
    if (pending.kind === 'route') {
      onSaveRoutePlan(pending.plan);
      setSelectedPlanId(pending.plan.id);
      setRouteName('');
    }
    if (pending.kind === 'timetable') {
      onSaveTimetableEntry(pending.entry);
      setSelectedOrderId('');
    }
    if (pending.kind === 'delete-route') {
      onDeleteRoutePlan(pending.plan.id);
      if (selectedPlanId === pending.plan.id) setSelectedPlanId(null);
    }
    if (pending.kind === 'delete-timetable') onDeleteTimetableEntry(pending.entry.id);
    setPending(null);
  }

  return (
    <SectionShell
      title="Streckennetz & Fahrplan"
      subtitle="Korridore planen, Zugläufe vormerken und anschließend sicher disponieren"
      tutorialId="tutorial-network-planner"
    >
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_330px]">
        <CardFlush>
          <CardHeader>
            <span className="inline-flex items-center gap-2">
              <Network className="h-3.5 w-3.5 text-sky-400" />
              Streckennetz-Editor
            </span>
            <span className="fi-tick text-[10px] normal-case tracking-normal">{ROUTE_EDGES.length} Korridore</span>
          </CardHeader>
          <div className="relative min-h-[460px] overflow-hidden bg-[#07101d]">
            <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(56,189,248,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,.045)_1px,transparent_1px)] [background-size:28px_28px]" />
            <svg
              viewBox="0 0 100 100"
              className="relative z-[1] h-[460px] w-full"
              role="img"
              aria-label="Interaktives Streckennetz mit deutschen Bahnknoten"
            >
              <defs>
                <filter id="route-glow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="1.1" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {ROUTE_EDGES.map((edge) => {
                const a = projectStation(RAIL_STATIONS[edge.from]);
                const b = projectStation(RAIL_STATIONS[edge.to]);
                const selected = selectedEdgeIds.has(edge.id);
                return (
                  <line
                    key={edge.id}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={selected ? '#f59e0b' : '#1e3a5f'}
                    strokeWidth={selected ? 1.2 : 0.55}
                    strokeLinecap="round"
                    filter={selected ? 'url(#route-glow)' : undefined}
                  />
                );
              })}
              {STATION_KEYS.map((key) => {
                const point = projectStation(RAIL_STATIONS[key]);
                const isFrom = displayedPlan?.stationKeys[0] === key;
                const isTo = displayedLastStation === key;
                const onRoute = displayedPlan?.stationKeys.includes(key) ?? false;
                const fill = isFrom || isTo ? '#f59e0b' : onRoute ? '#fbbf24' : '#07101d';
                const stroke = isFrom || isTo || onRoute ? '#fbbf24' : '#38bdf8';
                return (
                  <g
                    key={key}
                    role="button"
                    tabIndex={0}
                    aria-label={`${RAIL_STATIONS[key].label} als Zielknoten wählen`}
                    onClick={() => chooseStation(key)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        chooseStation(key);
                      }
                    }}
                    className="cursor-pointer outline-none"
                  >
                    <circle cx={point.x} cy={point.y} r={isFrom || isTo ? 2.1 : 1.45} fill={fill} stroke={stroke} strokeWidth="0.55" />
                    <text x={point.x + 2.2} y={point.y + 0.8} fill={onRoute ? '#fde68a' : '#cbd5e1'} fontSize="2.45" fontWeight={onRoute ? 700 : 500}>
                      {RAIL_STATIONS[key].label}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="absolute bottom-3 left-3 z-[2] max-w-xs rounded-xl border border-amber-500/30 bg-slate-950/90 p-3 shadow-xl backdrop-blur-md">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-amber-200">
                <Route className="h-3.5 w-3.5" /> {displayedPlan ? displayedPlan.label : 'Route vorbereiten'}
              </div>
              {displayedPlan ? (
                <>
                  <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-white">
                    <MapPin className="h-3.5 w-3.5 text-amber-400" />
                    {RAIL_STATIONS[displayedPlan.stationKeys[0]].label}
                    <ChevronRight className="h-3 w-3 text-slate-500" />
                    {RAIL_STATIONS[displayedLastStation ?? displayedPlan.stationKeys[0]].label}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {displayedPlan.stationKeys.length} Knoten · {displayedPlan.distanceKm.toLocaleString('de-DE')} km · ca.{' '}
                    {plannedTravelTicks(displayedPlan.distanceKm)} Ticks
                  </p>
                </>
              ) : (
                <p className="mt-2 text-[11px] text-slate-400">Bitte zwei verbundene Stationen wählen.</p>
              )}
            </div>
            <div className="absolute right-3 top-3 z-[2] rounded-lg border border-sky-500/20 bg-slate-950/85 px-2.5 py-2 text-[10px] text-slate-400 backdrop-blur-md">
              <span className="mr-2 inline-block h-2 w-2 rounded-full border border-sky-400 bg-slate-950" /> Knoten
              <span className="ml-3 mr-2 inline-block h-2 w-2 rounded-full bg-amber-400" /> gewählte Route
            </div>
          </div>
        </CardFlush>

        <div className="space-y-3">
          <Card>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <ListTree className="h-3.5 w-3.5 text-amber-400" /> Neue Route
            </div>
            <div className="mt-3 grid gap-2">
              <label className="text-[10px] font-bold uppercase text-slate-500">
                Bezeichnung
                <input
                  value={routeName}
                  onChange={(event) => setRouteName(event.target.value)}
                  placeholder={`${RAIL_STATIONS[from].label} – ${RAIL_STATIONS[to].label}`}
                  className="mt-1 w-full rounded-lg border border-amber-500/30 bg-slate-950 px-2.5 py-2 text-xs text-white outline-none focus:border-amber-400"
                />
              </label>
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <StationSelect label="Start" value={from} onChange={setFrom} />
                <ArrowRight className="mb-2 h-4 w-4 text-amber-400" />
                <StationSelect label="Ziel" value={to} onChange={setTo} />
              </div>
              <p className="rounded-lg border border-slate-700/80 bg-slate-950/60 px-2.5 py-2 text-[11px] text-slate-400">
                Knoten auf der Karte wählen oder Start und Ziel direkt einstellen. Der Pfad wird ausschließlich aus freigegebenen Stammkorridoren gebildet.
              </p>
              <Button disabled={!candidate} onClick={stageRouteSave}>
                <Save className="h-3.5 w-3.5" /> Route zur Bestätigung
              </Button>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <span className="inline-flex items-center gap-2"><Train className="h-3.5 w-3.5 text-sky-400" /> Routenarchiv</span>
              <span>{network.plans.length} gespeichert</span>
            </div>
            <div className="mt-3 max-h-[215px] space-y-1.5 overflow-y-auto pr-1">
              {network.plans.length === 0 && <p className="py-4 text-center text-xs text-slate-500">Noch keine gespeicherten Routen</p>}
              {network.plans.map((plan) => {
                const selected = selectedPlanId === plan.id;
                return (
                  <div key={plan.id} className={`rounded-lg border p-2 ${selected ? 'border-amber-500/60 bg-amber-950/25' : 'border-slate-800 bg-slate-950/50'}`}>
                    <button type="button" onClick={() => setSelectedPlanId(plan.id)} className="block w-full text-left">
                      <div className="truncate text-xs font-bold text-white">{plan.label}</div>
                      <div className="mt-0.5 truncate text-[10px] text-slate-500">{routeLabel(plan)}</div>
                      <div className="mt-1 text-[10px] font-semibold text-amber-300">{plan.distanceKm.toLocaleString('de-DE')} km · {plan.stationKeys.length} Knoten</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPending({ kind: 'delete-route', plan, dependentEntries: network.timetableEntries.filter((entry) => entry.routePlanId === plan.id).length })}
                      className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-rose-300 hover:text-rose-200"
                    >
                      <Trash2 className="h-3 w-3" /> Löschen
                    </button>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_330px]">
        <CardFlush>
          <CardHeader>
            <span className="inline-flex items-center gap-2"><CalendarClock className="h-3.5 w-3.5 text-amber-400" /> Fahrplan — aktueller Spieltag</span>
            <span className="fi-tick text-[10px] normal-case tracking-normal">Tag {Math.floor(tick / TICKS_PER_DAY) + 1}</span>
          </CardHeader>
          <div className="overflow-x-auto p-4">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-[190px_repeat(24,minmax(0,1fr))] border-b border-slate-700/80 text-[9px] font-bold text-slate-500">
                <div className="pb-2 uppercase tracking-wide">Zuglauf</div>
                {Array.from({ length: 24 }, (_, hour) => <div key={hour} className="pb-2 text-center">{String(hour).padStart(2, '0')}</div>)}
              </div>
              <div className="space-y-1 pt-2">
                {todayEntries.length === 0 && <div className="py-8 text-center text-xs text-slate-500">Keine vorgemerkten Zugläufe an diesem Spieltag</div>}
                {todayEntries.map((entry) => {
                  const plan = network.plans.find((row) => row.id === entry.routePlanId);
                  const start = Math.max(0, entry.departureTick - dayStart);
                  const end = Math.min(TICKS_PER_DAY, entry.arrivalTick - dayStart);
                  const left = (start / TICKS_PER_DAY) * 100;
                  const width = Math.max(2.7, ((end - start) / TICKS_PER_DAY) * 100);
                  return (
                    <div key={entry.id} className="grid grid-cols-[190px_1fr] items-center gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[11px] font-bold text-white">{entry.orderNumber} · {entry.label}</div>
                        <div className="truncate text-[10px] text-slate-500">{plan ? routeLabel(plan) : 'Route nicht verfügbar'}</div>
                      </div>
                      <div className="relative h-8 overflow-hidden rounded-md border border-slate-800 bg-slate-950/60 [background-image:linear-gradient(90deg,rgba(71,85,105,.38)_1px,transparent_1px)] [background-size:4.1667%_100%]">
                        <div className="absolute top-1/2 h-4 -translate-y-1/2 rounded-sm border border-amber-300/70 bg-amber-500/35 px-1.5 text-center text-[9px] font-bold leading-4 text-amber-100" style={{ left: `${left}%`, width: `${width}%` }}>
                          {clockLabel(entry.departureTick)}–{clockLabel(entry.arrivalTick)}
                        </div>
                        <button type="button" onClick={() => setPending({ kind: 'delete-timetable', entry })} className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded bg-slate-950/80 text-slate-500 hover:text-rose-300" aria-label={`${entry.label} aus Fahrplan löschen`}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </CardFlush>

        <Card>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            <Clock3 className="h-3.5 w-3.5 text-amber-400" /> Zuglauf vormerken
          </div>
          {!selectedPlan ? (
            <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-950/15 p-3 text-xs text-amber-100">Wähle zuerst eine gespeicherte Route aus dem Archiv.</p>
          ) : (
            <div className="mt-3 space-y-2.5">
              <div className="rounded-lg border border-sky-500/20 bg-sky-950/15 p-2.5 text-[11px] text-slate-300">
                <div className="font-bold text-sky-200">{selectedPlan.label}</div>
                <div className="mt-0.5 text-slate-400">{selectedPlan.distanceKm.toLocaleString('de-DE')} km · ca. {plannedTravelTicks(selectedPlan.distanceKm)} Ticks</div>
              </div>
              <label className="block text-[10px] font-bold uppercase text-slate-500">
                Auftrag
                <select value={selectedOrderId} onChange={(event) => setSelectedOrderId(event.target.value)} className="mt-1 w-full rounded-lg border border-amber-500/30 bg-slate-950 px-2.5 py-2 text-xs text-white">
                  <option value="">— offenen Auftrag wählen —</option>
                  {openOrders.map((order) => <option key={order.id} value={order.id}>{order.order_number} · {order.title} · {formatEuro(Number(order.yield))}</option>)}
                </select>
              </label>
              <label className="block text-[10px] font-bold uppercase text-slate-500">
                Abfahrt
                <select value={departureHour} onChange={(event) => setDepartureHour(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-amber-500/30 bg-slate-950 px-2.5 py-2 text-xs text-white">
                  {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00 Uhr</option>)}
                </select>
              </label>
              <Button disabled={!selectedOrder} onClick={stageTimetableSave}>
                <CalendarClock className="h-3.5 w-3.5" /> Zum Fahrplan vormerken
              </Button>
              {selectedOrder && <Button variant="secondary" onClick={() => onOpenDisposition(selectedOrder)}>In Disposition öffnen <ArrowRight className="h-3.5 w-3.5" /></Button>}
            </div>
          )}
        </Card>
      </div>

      {pending && <NetworkConfirmModal pending={pending} onCancel={() => setPending(null)} onConfirm={confirmPending} />}
    </SectionShell>
  );
}

function StationSelect({ label, value, onChange }: { label: string; value: StationKey; onChange: (value: StationKey) => void }) {
  return (
    <label className="text-[10px] font-bold uppercase text-slate-500">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value as StationKey)} className="mt-1 w-full rounded-lg border border-amber-500/30 bg-slate-950 px-2 py-2 text-xs text-white">
        {STATION_KEYS.map((key) => <option key={key} value={key}>{RAIL_STATIONS[key].label}</option>)}
      </select>
    </label>
  );
}

function NetworkConfirmModal({ pending, onCancel, onConfirm }: { pending: PendingCommit; onCancel: () => void; onConfirm: () => void }) {
  const title = pending.kind === 'route'
    ? 'Route speichern'
    : pending.kind === 'timetable'
      ? 'Zuglauf vormerken'
      : pending.kind === 'delete-route'
        ? 'Route löschen'
        : 'Fahrplaneintrag löschen';
  const destructive = pending.kind === 'delete-route' || pending.kind === 'delete-timetable';
  const body = pending.kind === 'route'
    ? <><p className="text-sm text-slate-300">Die neue Route wird im Planungsarchiv gespeichert. Sie ändert noch keine Einsatz-, Personal- oder Finanzdaten.</p><ConfirmFacts rows={[["Route", pending.plan.label], ["Verlauf", routeLabel(pending.plan)], ["Umfang", `${pending.plan.distanceKm.toLocaleString('de-DE')} km · ${pending.plan.stationKeys.length} Knoten`]]} /></>
    : pending.kind === 'timetable'
      ? <><p className="text-sm text-slate-300">Der Zuglauf wird nur vorgemerkt. Für die tatsächliche Fahrt ist anschließend die vollständige Disposition mit allen Betriebsprüfungen nötig.</p><ConfirmFacts rows={[["Auftrag", `${pending.order.order_number} · ${pending.order.title}`], ["Route", pending.plan.label], ["Zeitfenster", `${clockLabel(pending.entry.departureTick)}–${clockLabel(pending.entry.arrivalTick)} Uhr`], ["Finanzwirkung", "Keine bis zur Disposition"]]} /></>
      : pending.kind === 'delete-route'
        ? <><p className="text-sm text-slate-300">Die Route und ihre abhängigen Fahrplaneinträge werden aus der Planungsansicht entfernt. Bestehende Einsatzaufträge bleiben unverändert.</p><ConfirmFacts rows={[["Route", pending.plan.label], ["Abhängige Fahrpläne", String(pending.dependentEntries)], ["Finanzwirkung", "Keine"]]} /></>
        : <><p className="text-sm text-slate-300">Der vorgemerkte Zuglauf wird entfernt. Auftrag, Fuhrpark, Personal und Kontostand ändern sich nicht.</p><ConfirmFacts rows={[["Zuglauf", `${pending.entry.orderNumber} · ${pending.entry.label}`], ["Zeitfenster", `${clockLabel(pending.entry.departureTick)}–${clockLabel(pending.entry.arrivalTick)} Uhr`], ["Finanzwirkung", "Keine"]]} /></>;
  return (
    <div className="modal-scrim fixed inset-0 z-[90] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="app-glass w-full max-w-lg rounded-2xl p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="network-confirm-title" onClick={(event) => event.stopPropagation()}>
        <div className={`flex items-center gap-2 text-sm font-bold uppercase tracking-wide ${destructive ? 'text-rose-200' : 'text-amber-200'}`}>
          {destructive ? <AlertTriangle className="h-4 w-4" /> : <Network className="h-4 w-4" />}
          <h2 id="network-confirm-title">{title}</h2>
        </div>
        <div className="mt-3">{body}</div>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={onCancel}>Abbrechen</Button><Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm}>{destructive ? 'Endgültig löschen' : 'Verbindlich speichern'}</Button></div>
      </div>
    </div>
  );
}

function ConfirmFacts({ rows }: { rows: Array<[string, string]> }) {
  return <dl className="mt-4 divide-y divide-slate-700/70 overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950/50 text-xs">{rows.map(([label, value]) => <div key={label} className="flex items-start justify-between gap-4 px-3 py-2"><dt className="text-slate-500">{label}</dt><dd className="text-right font-semibold text-white">{value}</dd></div>)}</dl>;
}
