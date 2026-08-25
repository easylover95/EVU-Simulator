import type { Wagon } from '@/lib/supabase';
import { loadJson, saveJson } from '@/lib/storage';

export const DEPOT_STATE_KEY = 'evu-depot-state';

export const BASE_LOCO_BERTHS = 2;
/** Start: 25 Wagen-Stellplätze für den 10-Wagen-Starterpark plus Reserve. */
export const BASE_WAGON_BERTHS = 25;
export const BASE_WORKSHOP_SLOTS = 2;

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
  return { purchasedIds: [] };
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
  return BASE_LOCO_BERTHS + addedFor(state ?? emptyDepotState(), 'loco');
}

export function wagonBerthCap(state: DepotState | null | undefined): number {
  return BASE_WAGON_BERTHS + addedFor(state ?? emptyDepotState(), 'wagon');
}

export function workshopSlotCap(state: DepotState | null | undefined): number {
  return BASE_WORKSHOP_SLOTS + addedFor(state ?? emptyDepotState(), 'workshop');
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
  return { purchasedIds: [...state.purchasedIds, expansion.id] };
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
  const ids = (raw as DepotState).purchasedIds;
  if (!Array.isArray(ids)) return emptyDepotState();
  const known = new Set(DEPOT_EXPANSIONS.map((e) => e.id));
  return { purchasedIds: ids.filter((id): id is string => typeof id === 'string' && known.has(id)) };
}

export function loadDepotState(): DepotState {
  return normalizeDepotState(loadJson<unknown>(DEPOT_STATE_KEY, null));
}

export function saveDepotState(state: DepotState): void {
  saveJson(DEPOT_STATE_KEY, state);
}
