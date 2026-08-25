import type { AssignmentWithDetails, Wagon } from '@/lib/supabase';
import { calculateTrainBrh } from '@/lib/brh';
import { GAME_EPOCH, MS_PER_TICK } from '@/lib/gameTime';
import { getLocoDisplayName } from '@/lib/locoPhotos';
import { etcsRuntimeTicks, locoHasEtcs } from '@/lib/networkAccess';
import { applyStaffRuntime } from '@/lib/personal';
import { lerpLatLng, lookupStation, type StationCoord } from '@/lib/stations';

export interface TrackedTrain {
  id: string;
  orderNumber: string;
  title: string;
  originLabel: string;
  destLabel: string;
  locoName: string;
  wagonSummary: string;
  driverName: string;
  totalMassT: number;
  availableBrh: number;
  requiredBrh: number;
  currentSpeed: number;
  progress: number;
  etaTicks: number;
  lat: number;
  lng: number;
  from: StationCoord;
  to: StationCoord;
  status: string;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function isoToTick(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.round((ms - GAME_EPOCH.getTime()) / MS_PER_TICK);
}

function travelSpanTicks(assignment: AssignmentWithDetails): { start: number; end: number } {
  const start = isoToTick(assignment.assigned_at) ?? 0;
  const hasEtcs = locoHasEtcs(assignment.locomotive);
  const delay = Math.max(0, Number(assignment.delay_ticks) || 0);
  const xp = Math.max(0, Number(assignment.crew_xp) || 0);
  const rank = assignment.crew_rank === 2 || assignment.crew_rank === 3 ? assignment.crew_rank : 1;
  const deadlineTick = isoToTick(assignment.order?.deadline ?? null);
  if (deadlineTick != null && deadlineTick > start) {
    const planned = applyStaffRuntime(etcsRuntimeTicks(deadlineTick - start, hasEtcs), xp, rank);
    return { start, end: start + planned + delay };
  }
  const km = assignment.order?.distance_km ?? 200;
  const hours = Math.max(8, Math.round(km / 80));
  return { start, end: start + applyStaffRuntime(etcsRuntimeTicks(hours, hasEtcs), xp, rank) + delay };
}

/** Prefer assignment.progress; otherwise ticks elapsed vs deadline (1 tick = 1 in-game hour). */
export function assignmentProgress(assignment: AssignmentWithDetails, tick: number): number {
  const stored = assignment.progress;
  if (typeof stored === 'number' && Number.isFinite(stored)) {
    return clamp(stored, 0, 100);
  }
  if (assignment.status === 'geplant') return 0;
  if (assignment.status === 'abgeschlossen') return 100;
  const { start, end } = travelSpanTicks(assignment);
  const span = Math.max(1, end - start);
  return clamp(((tick - start) / span) * 100, 0, 100);
}

export function isAssignmentArrived(assignment: AssignmentWithDetails, tick: number): boolean {
  if (assignment.status !== 'aktiv' && assignment.status !== 'geplant') return false;
  return assignmentProgress(assignment, tick) >= 100;
}

export function etaFromProgress(assignment: AssignmentWithDetails, progress: number): number {
  if (progress >= 100) return 0;
  const { start, end } = travelSpanTicks(assignment);
  const span = Math.max(1, end - start);
  return Math.max(0, Math.ceil(((100 - progress) / 100) * span));
}

export function buildTrackedTrain(
  assignment: AssignmentWithDetails,
  tick: number,
  wagons: Wagon[],
): TrackedTrain | null {
  const order = assignment.order;
  const loco = assignment.locomotive;
  const driver = assignment.driver;
  if (!order || !loco || !driver) return null;
  if (assignment.status !== 'geplant' && assignment.status !== 'aktiv') return null;

  const progress = assignmentProgress(assignment, tick);
  const from = lookupStation(order.origin);
  const to = lookupStation(order.destination);
  const pos = lerpLatLng(from, to, progress / 100);
  const brh = calculateTrainBrh(loco, order, wagons);
  const etaTicks = etaFromProgress(assignment, progress);
  const cruise = loco.max_speed ?? 80;
  const currentSpeed =
    assignment.status === 'geplant' || progress >= 100 ? 0 : Math.round(Math.min(cruise, Math.max(35, cruise * 0.7)));
  const wagonSummary =
    order.required_wagon_type && order.required_wagon_count
      ? `${order.required_wagon_count}× ${order.required_wagon_type}`
      : `${brh.breakdown.wagonCount}× ${brh.breakdown.wagonType ?? 'Wagen'}`;

  return {
    id: assignment.id,
    orderNumber: order.order_number,
    title: order.title,
    originLabel: from.label,
    destLabel: to.label,
    locoName: getLocoDisplayName(loco.designation),
    wagonSummary,
    driverName: driver.name,
    totalMassT: brh.breakdown.totalWeight,
    availableBrh: brh.availableBrh,
    requiredBrh: brh.requiredBrh,
    currentSpeed,
    progress,
    etaTicks,
    lat: pos.lat,
    lng: pos.lng,
    from,
    to,
    status: assignment.status,
  };
}

export function buildTrackedTrains(
  assignments: AssignmentWithDetails[],
  tick: number,
  wagons: Wagon[],
): TrackedTrain[] {
  return assignments
    .map((a) => buildTrackedTrain(a, tick, wagons))
    .filter((t): t is TrackedTrain => t != null);
}

export const LOCO_MARKER_PREFIX = 'loco:';

export function locoMarkerId(locoId: string): string {
  return `${LOCO_MARKER_PREFIX}${locoId}`;
}
