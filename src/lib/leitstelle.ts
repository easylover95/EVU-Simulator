/**
 * Leitstelle domain layer: TrainRun / DutyDriver / RollingStock / Incident.
 * Adapters over Assignment, supabase Driver, Locomotive, WorldEvent closures.
 */
import type {
  AssignmentWithDetails,
  Driver as DbDriver,
  Locomotive,
  Order,
} from '@/lib/supabase';
import {
  orderBlockedByClosure,
  type LineClosure,
} from '@/lib/events';
import { newNotificationId } from '@/lib/gameTime';
import { lookupStation } from '@/lib/stations';
import { loadJson, saveJson } from '@/lib/storage';
import {
  assignmentProgress,
  etaFromProgress,
  isoToTick,
} from '@/lib/tracking';
import { isHuValid } from '@/lib/workshop';

export const LEITSTELLE_INCIDENTS_KEY = 'evu-leitstelle-incidents';

export type TrainRunStatus =
  | 'geplant'
  | 'unterwegs'
  | 'halt'
  | 'gestoert'
  | 'ankunft'
  | 'abgebrochen';

/** Laufender Zug / Dispositionseinheit (View-Model über Assignment). */
export interface TrainRun {
  id: string;
  label: string;
  orderId: string | null;
  assignmentId: string;
  path: { fromStationId: string; toStationId: string; viaStationIds?: string[] };
  plannedArrivalTick: number;
  actualEtaTick: number;
  delayMinutes: number;
  currentStationId: string | null;
  progress01: number;
  cargo: { goodsType: string; tons: number; customerId?: string };
  locoId: string;
  driverId: string | null;
  status: TrainRunStatus;
  activeIncidentIds: string[];
}

/** Leitstelle-Driver (Plan: Driver) — mapped from supabase Driver. */
export interface DutyDriver {
  id: string;
  name: string;
  qualifications: string[];
  remainingDutyMinutes: number;
  status: 'frei' | 'gebunden' | 'pause' | 'krank' | 'unterwegs';
  boundTrainRunId: string | null;
  homeDepotId: string;
}

export interface RollingStock {
  id: string;
  classId: string;
  locationStationId: string;
  status: 'frei' | 'einsatz' | 'wartung' | 'schaden' | 'stillgelegt';
  conditionPct: number;
  huValid: boolean;
  faultCode: string | null;
}

export type IncidentSeverity = 'info' | 'warn' | 'critical';
export type IncidentStatus = 'offen' | 'in_arbeit' | 'erledigt' | 'eskaliert';
export type IncidentType =
  | 'lenkzeit'
  | 'lokschaden'
  | 'sperrung'
  | 'personalausfall'
  | 'kundenfenster'
  | 'trasse';

export interface IncidentOption {
  id: string;
  label: string;
  costEuro: number;
  delayDeltaMinutes: number;
  riskFlags?: string[];
}

export interface Incident {
  id: string;
  type: IncidentType;
  title: string;
  locationStationId: string | null;
  affectedTrainRunId: string | null;
  /** LineClosure.id when type === 'sperrung' */
  closureId?: string | null;
  assignmentId?: string | null;
  severity: IncidentSeverity;
  createdTick: number;
  deadlineTick: number | null;
  options: IncidentOption[];
  status: IncidentStatus;
  resolvedOptionId?: string | null;
}

export interface LeitstelleIncidentStore {
  incidents: Incident[];
  /** One-time bootstrap so Incident #1 is playable without waiting for RNG. */
  autoClosureSpawned?: boolean;
}

export interface ResolveIncidentResult {
  incidents: Incident[];
  /** Assignment id that received extra delay_ticks (hours). */
  delayAssignmentId: string | null;
  delayTicksAdd: number;
  costEuro: number;
  /** Cancel this assignment (Auftrag umbuchen). */
  cancelAssignmentId: string | null;
  ledgerLabel: string | null;
}

const TICK_MINUTES = 60;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function stationId(label: string): string {
  return lookupStation(label).label;
}

function goodsLabel(order: Order | undefined): string {
  if (!order) return 'Fracht';
  return order.title?.split(/[–—-]/)[0]?.trim() || order.type || 'Fracht';
}

function zugLabel(assignment: AssignmentWithDetails): string {
  const loco = assignment.locomotive;
  const orderNumber = assignment.order?.order_number ?? '';
  const digits = (orderNumber || loco?.name || '0000').replace(/\D/g, '');
  const num = (digits.slice(-4) || '0000').padStart(4, '0');
  return `${loco?.designation ?? 'Lok'} · GZ ${num}`;
}

export function loadIncidentStore(): LeitstelleIncidentStore {
  const loaded = loadJson<LeitstelleIncidentStore | null>(LEITSTELLE_INCIDENTS_KEY, null);
  if (!loaded || !Array.isArray(loaded.incidents)) return { incidents: [] };
  return { incidents: loaded.incidents };
}

export function saveIncidentStore(store: LeitstelleIncidentStore): void {
  saveJson(LEITSTELLE_INCIDENTS_KEY, store);
}

export function openIncidents(store: LeitstelleIncidentStore): Incident[] {
  return store.incidents.filter((i) => i.status === 'offen' || i.status === 'in_arbeit');
}

function mapDriverStatus(d: DbDriver): DutyDriver['status'] {
  if (d.status === 'krank') return 'krank';
  if (d.status === 'pause' || d.status === 'urlaub') return 'pause';
  if (d.status === 'im_einsatz') return 'unterwegs';
  return 'frei';
}

function mapLocoStatus(loco: Locomotive): RollingStock['status'] {
  if (loco.status === 'stillgelegt') return 'stillgelegt';
  if (loco.status === 'wartung' || loco.status === 'v1') return 'wartung';
  if (loco.status === 'einsatz') return 'einsatz';
  if (loco.maintenance?.fault) return 'schaden';
  return 'frei';
}

export function buildDutyDrivers(
  drivers: DbDriver[],
  trainRuns: TrainRun[],
  homeDepotId: string,
): DutyDriver[] {
  const boundByDriver = new Map<string, string>();
  for (const run of trainRuns) {
    if (run.driverId) boundByDriver.set(run.driverId, run.id);
  }
  return drivers.map((d) => {
    const remainingHours = Math.max(0, (d.max_hours ?? 10) - (d.hours_worked ?? 0));
    const bound = boundByDriver.get(d.id) ?? null;
    let status = mapDriverStatus(d);
    if (bound && status === 'frei') status = 'gebunden';
    return {
      id: d.id,
      name: d.name,
      qualifications: d.qualifications ?? [],
      remainingDutyMinutes: Math.round(remainingHours * TICK_MINUTES),
      status,
      boundTrainRunId: bound,
      homeDepotId,
    };
  });
}

export function buildRollingStock(
  locos: Locomotive[],
  trainRuns: TrainRun[],
  hqLocation: string,
): RollingStock[] {
  const runByLoco = new Map(trainRuns.map((r) => [r.locoId, r]));
  const hq = stationId(hqLocation || 'Duisburg');
  return locos.map((loco) => {
    const run = runByLoco.get(loco.id);
    return {
      id: loco.id,
      classId: loco.designation,
      locationStationId: run?.currentStationId ?? hq,
      status: mapLocoStatus(loco),
      conditionPct: loco.maintenance?.conditionPct ?? 100,
      huValid: isHuValid(loco),
      faultCode: loco.maintenance?.fault?.kind ?? null,
    };
  });
}

export function buildTrainRuns(
  assignments: AssignmentWithDetails[],
  tick: number,
  incidents: Incident[],
): TrainRun[] {
  const openByAssignment = new Map<string, string[]>();
  for (const inc of incidents) {
    if (inc.status !== 'offen' && inc.status !== 'in_arbeit') continue;
    if (!inc.assignmentId) continue;
    const list = openByAssignment.get(inc.assignmentId) ?? [];
    list.push(inc.id);
    openByAssignment.set(inc.assignmentId, list);
  }

  const runs: TrainRun[] = [];
  for (const a of assignments) {
    if (a.status !== 'geplant' && a.status !== 'aktiv' && a.status !== 'abgebrochen') continue;
    const order = a.order;
    if (!order && a.status !== 'abgebrochen') continue;

    const progressPct = assignmentProgress(a, tick);
    const progress01 = clamp01(progressPct / 100);
    const etaTicks = etaFromProgress(a, progressPct);
    const startTick = isoToTick(a.assigned_at) ?? tick;
    const deadlineTick = isoToTick(order?.deadline ?? null);
    const plannedArrivalTick =
      deadlineTick != null && deadlineTick > startTick
        ? deadlineTick
        : startTick + Math.max(8, Math.round((order?.distance_km ?? 200) / 80));
    const actualEtaTick = tick + etaTicks;
    const activeIncidentIds = openByAssignment.get(a.id) ?? [];

    let status: TrainRunStatus;
    if (a.status === 'abgebrochen') status = 'abgebrochen';
    else if (progress01 >= 1) status = 'ankunft';
    else if (activeIncidentIds.length > 0) status = 'gestoert';
    else if (a.status === 'geplant') status = 'geplant';
    else status = 'unterwegs';

    const fromLabel = order?.origin ?? 'Duisburg';
    const toLabel = order?.destination ?? 'Dortmund';

    runs.push({
      id: a.id,
      label: zugLabel(a),
      orderId: a.order_id,
      assignmentId: a.id,
      path: {
        fromStationId: stationId(fromLabel),
        toStationId: stationId(toLabel),
      },
      plannedArrivalTick,
      actualEtaTick,
      delayMinutes: Math.max(0, actualEtaTick - plannedArrivalTick) * TICK_MINUTES,
      currentStationId: progress01 <= 0.05 ? stationId(fromLabel) : progress01 >= 0.95 ? stationId(toLabel) : null,
      progress01,
      cargo: {
        goodsType: goodsLabel(order),
        tons: order?.weight_t ?? 0,
      },
      locoId: a.locomotive_id,
      driverId: a.driver_id,
      status,
      activeIncidentIds,
    });
  }
  return runs;
}

function closureOptions(closure: LineClosure, tick: number): IncidentOption[] {
  const remainHours = Math.max(1, closure.untilTick - tick);
  const waitHours = Math.min(12, remainHours);
  const detourHours = 3;
  return [
    {
      id: 'umleiten',
      label: `Umleiten (+${detourHours} h, ${closure.extraCost.toLocaleString('de-DE')} €)`,
      costEuro: closure.extraCost,
      delayDeltaMinutes: detourHours * TICK_MINUTES,
      riskFlags: ['trasse'],
    },
    {
      id: 'warten',
      label: `Warten (+${waitHours} h, 0 €)`,
      costEuro: 0,
      delayDeltaMinutes: waitHours * TICK_MINUTES,
      riskFlags: ['frist'],
    },
    {
      id: 'abbrechen',
      label: 'Auftrag umbuchen (Zug abbrechen)',
      costEuro: 0,
      delayDeltaMinutes: 0,
      riskFlags: ['kunde'],
    },
  ];
}

/**
 * Creates open Sperrung-incidents for active/planned trains hit by closures.
 * Auto-escalates open incidents when their closure expires.
 */
export function syncClosureIncidents(
  store: LeitstelleIncidentStore,
  closures: LineClosure[],
  assignments: AssignmentWithDetails[],
  tick: number,
): LeitstelleIncidentStore {
  const closureById = new Map(closures.filter((c) => c.untilTick > tick).map((c) => [c.id, c]));
  let incidents = store.incidents.map((inc) => {
    if (inc.type !== 'sperrung' || (inc.status !== 'offen' && inc.status !== 'in_arbeit')) return inc;
    if (!inc.closureId || closureById.has(inc.closureId)) return inc;
    return { ...inc, status: 'eskaliert' as const };
  });

  for (const closure of closureById.values()) {
    for (const a of assignments) {
      if (a.status !== 'aktiv' && a.status !== 'geplant') continue;
      const order = a.order;
      if (!order) continue;
      if (!orderBlockedByClosure(order, tick, [closure])) continue;

      const exists = incidents.some(
        (i) =>
          i.type === 'sperrung' &&
          i.closureId === closure.id &&
          i.assignmentId === a.id &&
          (i.status === 'offen' || i.status === 'in_arbeit' || i.status === 'erledigt' || i.status === 'eskaliert'),
      );
      if (exists) continue;

      incidents = [
        ...incidents,
        {
          id: newNotificationId(),
          type: 'sperrung',
          title: `Sperrung ${closure.origin}–${closure.destination}`,
          locationStationId: stationId(closure.origin),
          affectedTrainRunId: a.id,
          closureId: closure.id,
          assignmentId: a.id,
          severity: 'critical',
          createdTick: tick,
          deadlineTick: closure.untilTick,
          options: closureOptions(closure, tick),
          status: 'offen',
        },
      ];
    }
  }

  // Refresh option labels for open incidents (remaining wait time).
  incidents = incidents.map((inc) => {
    if (inc.type !== 'sperrung' || inc.status !== 'offen' || !inc.closureId) return inc;
    const closure = closureById.get(inc.closureId);
    if (!closure) return inc;
    return { ...inc, options: closureOptions(closure, tick) };
  });

  return { incidents };
}

export function resolveIncident(
  store: LeitstelleIncidentStore,
  incidentId: string,
  optionId: string,
): ResolveIncidentResult {
  const incident = store.incidents.find((i) => i.id === incidentId);
  const empty: ResolveIncidentResult = {
    incidents: store.incidents,
    delayAssignmentId: null,
    delayTicksAdd: 0,
    costEuro: 0,
    cancelAssignmentId: null,
    ledgerLabel: null,
  };
  if (!incident || (incident.status !== 'offen' && incident.status !== 'in_arbeit')) return empty;

  const option = incident.options.find((o) => o.id === optionId);
  if (!option) return empty;

  const delayTicksAdd = Math.round(option.delayDeltaMinutes / TICK_MINUTES);
  const nextIncidents = store.incidents.map((i) =>
    i.id === incidentId
      ? { ...i, status: 'erledigt' as const, resolvedOptionId: optionId }
      : i,
  );

  if (optionId === 'abbrechen') {
    return {
      incidents: nextIncidents,
      delayAssignmentId: null,
      delayTicksAdd: 0,
      costEuro: 0,
      cancelAssignmentId: incident.assignmentId ?? null,
      ledgerLabel: null,
    };
  }

  return {
    incidents: nextIncidents,
    delayAssignmentId: incident.assignmentId ?? null,
    delayTicksAdd,
    costEuro: option.costEuro,
    cancelAssignmentId: null,
    ledgerLabel:
      option.costEuro > 0
        ? optionId === 'umleiten'
          ? 'Umleitung / Trasse'
          : 'Leitstelle / Disposition'
        : null,
  };
}

/** Delay minutes shown as compact hours for UI. */
export function formatDelayHours(delayMinutes: number): string {
  const h = Math.max(0, Math.round(delayMinutes / TICK_MINUTES));
  if (h <= 0) return 'pünktlich';
  return `+${h} h`;
}

export interface AutoClosureSpawnResult {
  store: LeitstelleIncidentStore;
  closure: LineClosure | null;
}

/**
 * If there is an active/planned train and no live closure yet, spawn one on that
 * corridor once — so Incident #1 is immediately playable in the Leitstelle.
 */
export function maybeSpawnClosureForLeitstelle(
  store: LeitstelleIncidentStore,
  closures: LineClosure[],
  assignments: AssignmentWithDetails[],
  tick: number,
): AutoClosureSpawnResult {
  if (store.autoClosureSpawned) return { store, closure: null };
  if (closures.some((c) => c.untilTick > tick)) {
    return { store: { ...store, autoClosureSpawned: true }, closure: null };
  }
  const target = assignments.find(
    (a) => (a.status === 'aktiv' || a.status === 'geplant') && a.order,
  );
  if (!target?.order) return { store, closure: null };

  const closure: LineClosure = {
    id: newNotificationId(),
    origin: target.order.origin,
    destination: target.order.destination,
    untilTick: tick + 18,
    extraCost: 1_400,
  };
  return {
    store: { ...store, autoClosureSpawned: true },
    closure,
  };
}
