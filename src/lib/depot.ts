import type { Locomotive, Wagon } from '@/lib/supabase';
import { loadJson, saveJson } from '@/lib/storage';
import {
  RELOCATION_COST,
  STARTER_SITE_ID,
  knownNetworkSiteIds,
  networkSiteById,
  normalizeOwnedSiteIds,
  siteCapacityBonus,
  type NetworkSite,
} from '@/lib/networkSites';

export const DEPOT_STATE_KEY = 'evu-depot-state';

export const BASE_LOCO_BERTHS = 2;
/** Start: 25 Wagen-Stellplätze für den 10-Wagen-Starterpark plus Reserve. */
export const BASE_WAGON_BERTHS = 25;
export const BASE_WORKSHOP_SLOTS = 2;
/** Startpersonal (Seed: 8 Tf) — wächst mit Lok-Ausbauten und neuen Betriebsstellen. */
export const BASE_STAFF_SLOTS = 8;

export type DepotKind = 'loco' | 'wagon' | 'workshop';

export interface DepotExpansion {
  id: string;
  kind: DepotKind;
  add: number;
  cost: number;
  unlockLevel: number;
  label: string;
}

export interface DepotState {
  purchasedIds: string[];
  /** Owned EVU operating sites (always includes the Duisburg starter). */
  ownedSiteIds: string[];
  /** locomotiveId → network site id */
  stationing: Record<string, string>;
}

/** Sequential Ausbauten: Loks ab Lvl 2, Wagen ab Lvl 2, Werkstatt ab Lvl 3 (skaliert mit der Flotte). */
export const DEPOT_EXPANSIONS: readonly DepotExpansion[] = [
  { id: 'loco-3', kind: 'loco', add: 1, cost: 18_000, unlockLevel: 2, label: '3. Lok-Stellplatz' },
  { id: 'loco-4', kind: 'loco', add: 1, cost: 28_000, unlockLevel: 3, label: '4. Lok-Stellplatz' },
  { id: 'loco-6', kind: 'loco', add: 2, cost: 48_000, unlockLevel: 4, label: '+2 Lok-Stellplätze' },
  { id: 'loco-8', kind: 'loco', add: 2, cost: 68_000, unlockLevel: 5, label: '+2 Lok-Stellplätze' },
  { id: 'loco-10', kind: 'loco', add: 2, cost: 88_000, unlockLevel: 6, label: '+2 Lok-Stellplätze' },
  { id: 'loco-13', kind: 'loco', add: 3, cost: 120_000, unlockLevel: 8, label: '+3 Lok-Stellplätze' },
  { id: 'loco-16', kind: 'loco', add: 3, cost: 155_000, unlockLevel: 10, label: '+3 Lok-Stellplätze' },
  { id: 'wagon-36', kind: 'wagon', add: 12, cost: 14_000, unlockLevel: 2, label: '+12 Wagen-Stellplätze' },
  { id: 'wagon-48', kind: 'wagon', add: 12, cost: 22_000, unlockLevel: 3, label: '+12 Wagen-Stellplätze' },
  { id: 'wagon-64', kind: 'wagon', add: 16, cost: 32_000, unlockLevel: 4, label: '+16 Wagen-Stellplätze' },
  { id: 'wagon-84', kind: 'wagon', add: 20, cost: 42_000, unlockLevel: 6, label: '+20 Wagen-Stellplätze' },
  { id: 'wagon-108', kind: 'wagon', add: 24, cost: 58_000, unlockLevel: 8, label: '+24 Wagen-Stellplätze' },
  { id: 'wagon-140', kind: 'wagon', add: 32, cost: 78_000, unlockLevel: 10, label: '+32 Wagen-Stellplätze' },
  { id: 'ws-3', kind: 'workshop', add: 1, cost: 35_000, unlockLevel: 3, label: '3. Werkstatt-Slot' },
  { id: 'ws-4', kind: 'workshop', add: 1, cost: 55_000, unlockLevel: 5, label: '4. Werkstatt-Slot' },
  { id: 'ws-5', kind: 'workshop', add: 1, cost: 80_000, unlockLevel: 8, label: '5. Werkstatt-Slot' },
  { id: 'ws-6', kind: 'workshop', add: 1, cost: 110_000, unlockLevel: 10, label: '6. Werkstatt-Slot' },
  { id: 'ws-7', kind: 'workshop', add: 1, cost: 145_000, unlockLevel: 12, label: '7. Werkstatt-Slot' },
  { id: 'ws-8', kind: 'workshop', add: 1, cost: 185_000, unlockLevel: 14, label: '8. Werkstatt-Slot' },
  { id: 'ws-10', kind: 'workshop', add: 2, cost: 240_000, unlockLevel: 16, label: '+2 Werkstatt-Slots (10)' },
  { id: 'ws-12', kind: 'workshop', add: 2, cost: 310_000, unlockLevel: 18, label: '+2 Werkstatt-Slots (12)' },
] as const;

export function emptyDepotState(): DepotState {
  return { purchasedIds: [], ownedSiteIds: [STARTER_SITE_ID], stationing: {} };
}

export function expansionsFor(kind: DepotKind): DepotExpansion[] {
  return DEPOT_EXPANSIONS.filter((e) => e.kind === kind);
}

export function wagonUnitCount(wagons: Wagon[] | null | undefined): number {
  return (wagons ?? []).reduce((s, w) => s + Math.max(0, Number(w?.count) || 0), 0);
}

export function purchasedSet(state: DepotState | null | undefined): Set<string> {
  return new Set(state?.purchasedIds ?? []);
}

function addedFor(state: DepotState, kind: DepotKind): number {
  const owned = purchasedSet(state);
  return expansionsFor(kind).reduce((s, e) => (owned.has(e.id) ? s + e.add : s), 0);
}

export function locoBerthCap(state: DepotState | null | undefined): number {
  const current = state ?? emptyDepotState();
  return BASE_LOCO_BERTHS + addedFor(current, 'loco') + siteCapacityBonus(current.ownedSiteIds).loco;
}

export function wagonBerthCap(state: DepotState | null | undefined): number {
  const current = state ?? emptyDepotState();
  return BASE_WAGON_BERTHS + addedFor(current, 'wagon') + siteCapacityBonus(current.ownedSiteIds).wagon;
}

export function workshopSlotCap(state: DepotState | null | undefined): number {
  const current = state ?? emptyDepotState();
  return BASE_WORKSHOP_SLOTS + addedFor(current, 'workshop') + siteCapacityBonus(current.ownedSiteIds).workshop;
}

export function staffHousingCap(state: DepotState | null | undefined): number {
  const current = state ?? emptyDepotState();
  return BASE_STAFF_SLOTS + addedFor(current, 'loco') * 2 + siteCapacityBonus(current.ownedSiteIds).staff;
}

export function freeLocoBerths(state: DepotState, parkedLocos: number): number {
  return Math.max(0, locoBerthCap(state) - parkedLocos);
}

export function freeWagonBerths(state: DepotState, units: number): number {
  return Math.max(0, wagonBerthCap(state) - units);
}

export function nextExpansion(state: DepotState, kind: DepotKind): DepotExpansion | null {
  const owned = purchasedSet(state);
  return expansionsFor(kind).find((e) => !owned.has(e.id)) ?? null;
}

export function freeDepotCapacity(state: DepotState, kind: DepotKind, used: number): number {
  const cap =
    kind === 'loco' ? locoBerthCap(state) : kind === 'wagon' ? wagonBerthCap(state) : workshopSlotCap(state);
  return Math.max(0, cap - used);
}

export function isExpansionOwned(state: DepotState, id: string): boolean {
  return purchasedSet(state).has(id);
}

export function canBuyDepotExpansion(
  state: DepotState,
  expansion: DepotExpansion,
  companyLevel: number,
): boolean {
  if (purchasedSet(state).has(expansion.id)) return false;
  const next = nextExpansion(state, expansion.kind);
  if (!next || next.id !== expansion.id) return false;
  return Math.max(1, companyLevel) >= expansion.unlockLevel;
}

export function purchaseDepotExpansion(state: DepotState, expansion: DepotExpansion): DepotState {
  if (purchasedSet(state).has(expansion.id)) return state;
  return { ...state, purchasedIds: [...state.purchasedIds, expansion.id] };
}

export function isNetworkSiteOwned(state: DepotState | null | undefined, siteId: string): boolean {
  return normalizeOwnedSiteIds(state?.ownedSiteIds).includes(siteId);
}

export function canBuyNetworkSite(
  state: DepotState,
  site: NetworkSite,
  companyLevel: number,
): boolean {
  if (site.starter) return false;
  if (isNetworkSiteOwned(state, site.id)) return false;
  return Math.max(1, companyLevel) >= site.unlockLevel;
}

export function purchaseNetworkSite(state: DepotState, siteId: string): DepotState {
  if (isNetworkSiteOwned(state, siteId)) return state;
  if (!networkSiteById(siteId) || siteId === STARTER_SITE_ID) return state;
  return { ...state, ownedSiteIds: normalizeOwnedSiteIds([...(state.ownedSiteIds ?? []), siteId]) };
}

export function locoStation(state: DepotState | null | undefined, locoId: string): string {
  const assigned = state?.stationing?.[locoId];
  const known = knownNetworkSiteIds();
  if (typeof assigned === 'string' && known.has(assigned) && isNetworkSiteOwned(state, assigned)) return assigned;
  return STARTER_SITE_ID;
}

export function siteLocoBerthCap(state: DepotState | null | undefined, siteId: string): number {
  const current = state ?? emptyDepotState();
  const site = networkSiteById(siteId);
  if (!site) return 0;
  if (site.starter) return BASE_LOCO_BERTHS + addedFor(current, 'loco');
  return Math.max(1, site.addLocoBerths);
}

export function locosAtSite(
  state: DepotState | null | undefined,
  locomotives: Array<Pick<Locomotive, 'id'>>,
  siteId: string,
): number {
  return locomotives.filter((loco) => locoStation(state, loco.id) === siteId).length;
}

export function freeSiteLocoBerths(
  state: DepotState | null | undefined,
  locomotives: Array<Pick<Locomotive, 'id'>>,
  siteId: string,
): number {
  return Math.max(0, siteLocoBerthCap(state, siteId) - locosAtSite(state, locomotives, siteId));
}

export function defaultStationForNewLoco(
  state: DepotState | null | undefined,
  locomotives: Array<Pick<Locomotive, 'id'>>,
): string {
  const current = state ?? emptyDepotState();
  const owned = normalizeOwnedSiteIds(current.ownedSiteIds);
  const withSpace = owned.find((id) => freeSiteLocoBerths(current, locomotives, id) > 0);
  return withSpace ?? STARTER_SITE_ID;
}

export function canRelocateLoco(
  state: DepotState,
  locomotives: Array<Pick<Locomotive, 'id' | 'status'>>,
  locoId: string,
  toSiteId: string,
): { ok: boolean; message: string; cost: number } {
  const loco = locomotives.find((row) => row.id === locoId);
  if (!loco) return { ok: false, message: 'Triebfahrzeug nicht gefunden.', cost: 0 };
  if (loco.status === 'einsatz') {
    return { ok: false, message: 'Lok ist im Einsatz und kann nicht umstationiert werden.', cost: 0 };
  }
  if (!isNetworkSiteOwned(state, toSiteId)) {
    return { ok: false, message: 'Ziel-Betriebsstelle gehört dem EVU nicht.', cost: 0 };
  }
  const from = locoStation(state, locoId);
  if (from === toSiteId) return { ok: false, message: 'Die Lok steht bereits an dieser Betriebsstelle.', cost: 0 };
  const others = locomotives.filter((row) => row.id !== locoId);
  if (freeSiteLocoBerths(state, others, toSiteId) <= 0) {
    const site = networkSiteById(toSiteId);
    return {
      ok: false,
      message: `${site?.name ?? toSiteId} hat keine freien Lok-Stellplätze.`,
      cost: 0,
    };
  }
  return { ok: true, message: `Umstationierung nach ${networkSiteById(toSiteId)?.name ?? toSiteId}.`, cost: RELOCATION_COST };
}

export function relocateLoco(state: DepotState, locoId: string, toSiteId: string): DepotState {
  if (!isNetworkSiteOwned(state, toSiteId)) return state;
  return { ...state, stationing: { ...state.stationing, [locoId]: toSiteId } };
}

export function dropStationing(state: DepotState, locoId: string): DepotState {
  if (!state.stationing[locoId]) return state;
  const next = { ...state.stationing };
  delete next[locoId];
  return { ...state, stationing: next };
}

/** Legacy saves with a larger fleet get matching Ausbauten, ohne nochmal zu kassieren. */
export function ensureDepotFits(
  state: DepotState,
  locoCount: number,
  wagonUnits: number,
  workshopUsed: number,
): DepotState {
  let next = state;
  const need: Record<DepotKind, number> = {
    loco: Math.max(0, locoCount - BASE_LOCO_BERTHS),
    wagon: Math.max(0, wagonUnits - BASE_WAGON_BERTHS),
    workshop: Math.max(0, workshopUsed - BASE_WORKSHOP_SLOTS),
  };
  for (const kind of ['loco', 'wagon', 'workshop'] as const) {
    let granted = addedFor(next, kind);
    for (const expansion of expansionsFor(kind)) {
      if (granted >= need[kind]) break;
      if (purchasedSet(next).has(expansion.id)) {
        continue;
      }
      next = purchaseDepotExpansion(next, expansion);
      granted += expansion.add;
    }
  }
  return next;
}

export function normalizeDepotState(raw: unknown): DepotState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyDepotState();
  const record = raw as DepotState;
  const ids = record.purchasedIds;
  const knownExp = new Set(DEPOT_EXPANSIONS.map((e) => e.id));
  const purchasedIds = Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === 'string' && knownExp.has(id))
    : [];
  const knownSites = knownNetworkSiteIds();
  const stationingRaw = record.stationing;
  const stationing: Record<string, string> = {};
  if (stationingRaw && typeof stationingRaw === 'object' && !Array.isArray(stationingRaw)) {
    for (const [locoId, siteId] of Object.entries(stationingRaw)) {
      if (typeof locoId === 'string' && typeof siteId === 'string' && knownSites.has(siteId)) {
        stationing[locoId] = siteId;
      }
    }
  }
  return {
    purchasedIds,
    ownedSiteIds: normalizeOwnedSiteIds(record.ownedSiteIds),
    stationing,
  };
}

export function loadDepotState(): DepotState {
  return normalizeDepotState(loadJson<unknown>(DEPOT_STATE_KEY, null));
}

export function saveDepotState(state: DepotState): void {
  saveJson(DEPOT_STATE_KEY, state);
}
