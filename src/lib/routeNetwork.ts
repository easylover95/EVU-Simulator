import { newNotificationId } from '@/lib/gameTime';
import { loadJson, saveJson } from '@/lib/storage';
import { RAIL_STATIONS, TRUNK_CORRIDORS } from '@/lib/stations';

export const ROUTE_NETWORK_STATE_KEY = 'evu-route-network-state';

export type StationKey = keyof typeof RAIL_STATIONS;

export interface RouteEdge {
  id: string;
  from: StationKey;
  to: StationKey;
  distanceKm: number;
}

export interface RoutePlan {
  id: string;
  label: string;
  stationKeys: StationKey[];
  edgeIds: string[];
  distanceKm: number;
  createdAtTick: number;
}

export interface TimetableEntry {
  id: string;
  routePlanId: string;
  orderId: string;
  orderNumber: string;
  label: string;
  departureTick: number;
  arrivalTick: number;
  createdAtTick: number;
}

export interface RouteNetworkState {
  plans: RoutePlan[];
  timetableEntries: TimetableEntry[];
}

const EMPTY_STATE: RouteNetworkState = { plans: [], timetableEntries: [] };

function isStationKey(value: unknown): value is StationKey {
  return typeof value === 'string' && value in RAIL_STATIONS;
}

function edgeId(from: StationKey, to: StationKey): string {
  return [from, to].sort().join('--');
}

function haversineKm(from: StationKey, to: StationKey): number {
  const a = RAIL_STATIONS[from];
  const b = RAIL_STATIONS[to];
  const radiusKm = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(radiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

export const ROUTE_EDGES: RouteEdge[] = TRUNK_CORRIDORS.map(([from, to]) => ({
  id: edgeId(from, to),
  from,
  to,
  distanceKm: haversineKm(from, to),
}));

function routeFromStations(stationKeys: StationKey[]): Omit<RoutePlan, 'id' | 'label' | 'createdAtTick'> | null {
  if (stationKeys.length < 2) return null;
  const edgeIds: string[] = [];
  let distanceKm = 0;
  for (let index = 0; index < stationKeys.length - 1; index += 1) {
    const id = edgeId(stationKeys[index], stationKeys[index + 1]);
    const edge = ROUTE_EDGES.find((row) => row.id === id);
    if (!edge) return null;
    edgeIds.push(id);
    distanceKm += edge.distanceKm;
  }
  return { stationKeys, edgeIds, distanceKm };
}

/** Dijkstra over the fixed canonical trunk corridors; returns an empty list for invalid or disconnected stations. */
export function shortestRoute(from: StationKey, to: StationKey): StationKey[] {
  if (from === to) return [from];
  const nodes = Object.keys(RAIL_STATIONS) as StationKey[];
  const distances = new Map<StationKey, number>(nodes.map((node) => [node, Number.POSITIVE_INFINITY]));
  const previous = new Map<StationKey, StationKey>();
  const unvisited = new Set<StationKey>(nodes);
  distances.set(from, 0);

  while (unvisited.size > 0) {
    let current: StationKey | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const node of unvisited) {
      const candidate = distances.get(node) ?? Number.POSITIVE_INFINITY;
      if (candidate < best) {
        best = candidate;
        current = node;
      }
    }
    if (!current || best === Number.POSITIVE_INFINITY) break;
    if (current === to) break;
    unvisited.delete(current);
    for (const edge of ROUTE_EDGES) {
      const neighbour = edge.from === current ? edge.to : edge.to === current ? edge.from : null;
      if (!neighbour || !unvisited.has(neighbour)) continue;
      const candidate = best + edge.distanceKm;
      if (candidate < (distances.get(neighbour) ?? Number.POSITIVE_INFINITY)) {
        distances.set(neighbour, candidate);
        previous.set(neighbour, current);
      }
    }
  }

  if (!previous.has(to)) return [];
  const path: StationKey[] = [to];
  let cursor: StationKey = to;
  while (cursor !== from) {
    const parent = previous.get(cursor);
    if (!parent) return [];
    path.unshift(parent);
    cursor = parent;
  }
  return path;
}

export function buildRoutePlan(label: string, from: StationKey, to: StationKey, tick: number): RoutePlan | null {
  const stationKeys = shortestRoute(from, to);
  const route = routeFromStations(stationKeys);
  const normalizedLabel = label.trim() || `${RAIL_STATIONS[from].label} – ${RAIL_STATIONS[to].label}`;
  if (!route) return null;
  return {
    id: newNotificationId(),
    label: normalizedLabel.slice(0, 56),
    ...route,
    createdAtTick: Math.max(0, Math.round(tick)),
  };
}

export function plannedTravelTicks(distanceKm: number): number {
  return Math.max(2, Math.ceil(Math.max(1, distanceKm) / 80));
}

export function createTimetableEntry(input: {
  routePlan: RoutePlan;
  orderId: string;
  orderNumber: string;
  label: string;
  departureTick: number;
  arrivalTick?: number;
  tick: number;
}): TimetableEntry | null {
  const departureTick = Math.max(0, Math.round(input.departureTick));
  const arrivalTick = Math.max(
    departureTick + 1,
    Math.round(input.arrivalTick ?? departureTick + plannedTravelTicks(input.routePlan.distanceKm)),
  );
  if (!input.orderId || !input.orderNumber || arrivalTick <= departureTick) return null;
  return {
    id: newNotificationId(),
    routePlanId: input.routePlan.id,
    orderId: input.orderId,
    orderNumber: input.orderNumber,
    label: input.label.trim().slice(0, 56) || input.routePlan.label,
    departureTick,
    arrivalTick,
    createdAtTick: Math.max(0, Math.round(input.tick)),
  };
}

function normalizePlan(value: unknown): RoutePlan | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<RoutePlan>;
  const stationKeys = Array.isArray(row.stationKeys) && row.stationKeys.every(isStationKey) ? row.stationKeys : [];
  const route = routeFromStations(stationKeys);
  if (!route || typeof row.id !== 'string') return null;
  return {
    id: row.id,
    label: typeof row.label === 'string' && row.label.trim() ? row.label.trim().slice(0, 56) : 'Streckenplan',
    ...route,
    createdAtTick: Number.isFinite(row.createdAtTick) ? Math.max(0, Math.round(row.createdAtTick ?? 0)) : 0,
  };
}

function normalizeEntry(value: unknown, plans: RoutePlan[]): TimetableEntry | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<TimetableEntry>;
  if (
    typeof row.id !== 'string' ||
    typeof row.routePlanId !== 'string' ||
    typeof row.orderId !== 'string' ||
    typeof row.orderNumber !== 'string' ||
    !plans.some((plan) => plan.id === row.routePlanId)
  ) {
    return null;
  }
  const departureTick = Number(row.departureTick);
  const arrivalTick = Number(row.arrivalTick);
  if (!Number.isFinite(departureTick) || !Number.isFinite(arrivalTick) || arrivalTick <= departureTick) return null;
  return {
    id: row.id,
    routePlanId: row.routePlanId,
    orderId: row.orderId,
    orderNumber: row.orderNumber,
    label: typeof row.label === 'string' && row.label.trim() ? row.label.trim().slice(0, 56) : 'Fahrplanfahrt',
    departureTick: Math.max(0, Math.round(departureTick)),
    arrivalTick: Math.max(1, Math.round(arrivalTick)),
    createdAtTick: Number.isFinite(row.createdAtTick) ? Math.max(0, Math.round(row.createdAtTick ?? 0)) : 0,
  };
}

export function normalizeRouteNetworkState(value: unknown): RouteNetworkState {
  if (!value || typeof value !== 'object') return { ...EMPTY_STATE };
  const raw = value as Partial<RouteNetworkState>;
  const plans = Array.isArray(raw.plans) ? raw.plans.map(normalizePlan).filter((row): row is RoutePlan => row != null) : [];
  const timetableEntries = Array.isArray(raw.timetableEntries)
    ? raw.timetableEntries.map((row) => normalizeEntry(row, plans)).filter((row): row is TimetableEntry => row != null)
    : [];
  return { plans, timetableEntries };
}

export function loadRouteNetworkState(): RouteNetworkState {
  return normalizeRouteNetworkState(loadJson<unknown>(ROUTE_NETWORK_STATE_KEY, EMPTY_STATE));
}

export function saveRouteNetworkState(state: RouteNetworkState): void {
  saveJson(ROUTE_NETWORK_STATE_KEY, normalizeRouteNetworkState(state));
}

export function upsertRoutePlan(state: RouteNetworkState, plan: RoutePlan): RouteNetworkState {
  return { ...state, plans: [plan, ...state.plans.filter((row) => row.id !== plan.id)] };
}

export function removeRoutePlan(state: RouteNetworkState, routePlanId: string): RouteNetworkState {
  return {
    plans: state.plans.filter((plan) => plan.id !== routePlanId),
    timetableEntries: state.timetableEntries.filter((entry) => entry.routePlanId !== routePlanId),
  };
}

export function upsertTimetableEntry(state: RouteNetworkState, entry: TimetableEntry): RouteNetworkState {
  return {
    ...state,
    timetableEntries: [entry, ...state.timetableEntries.filter((row) => row.id !== entry.id)],
  };
}

export function removeTimetableEntry(state: RouteNetworkState, entryId: string): RouteNetworkState {
  return { ...state, timetableEntries: state.timetableEntries.filter((entry) => entry.id !== entryId) };
}
