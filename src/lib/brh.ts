import type { Locomotive, Order, Wagon } from '@/lib/supabase';
import { clampOrderMinBrh } from '@/lib/status';
import { rentedWagonIds } from '@/lib/rental';

export interface BrhCheckResult {
  passed: boolean;
  availableBrh: number;
  requiredBrh: number;
  message: string;
  breakdown: {
    locoWeight: number;
    locoBrakeWeight: number;
    wagonWeight: number;
    wagonBrakeWeight: number;
    totalWeight: number;
    totalBrakeWeight: number;
    wagonCount: number;
    wagonType: string | null;
    brakePosition: string | null;
  };
}

const BRAKE_FACTOR: Record<string, number> = { G: 0.8, P: 1.0, R: 1.2 };

const GENERIC_WAGON = {
  tare: 20,
  capacity: 60,
  factor: 0.8,
  type: 'Güterwagen',
  position: 'G',
};

interface AttachedWagons {
  tare: number;
  load: number;
  count: number;
  factor: number;
  type: string;
  position: string;
}

function brakeFactor(position: string): number {
  return BRAKE_FACTOR[position] ?? 0.8;
}

function loadPerWagon(capacity: number, totalLoad: number, count: number): number {
  const n = Math.max(1, count);
  return Math.min(capacity, Math.max(0, totalLoad / n));
}

function resolveAttachedWagons(order: Order, wagons: Wagon[]): AttachedWagons {
  if (order.required_wagon_type && order.required_wagon_count) {
    const matching = wagons.filter(
      (w) => w.type_code.toLowerCase() === order.required_wagon_type!.toLowerCase(),
    );
    const ranked = [...matching].sort(
      (a, b) => brakeFactor(b.brake_position) - brakeFactor(a.brake_position),
    );
    const template = ranked[0];
    const count = Math.max(1, order.required_wagon_count);
    if (template) {
      return {
        tare: template.tare_weight_t,
        load: loadPerWagon(template.capacity_t, order.weight_t, count),
        count,
        factor: brakeFactor(template.brake_position),
        type: template.type_code,
        position: template.brake_position,
      };
    }
    return {
      tare: GENERIC_WAGON.tare,
      load: loadPerWagon(GENERIC_WAGON.capacity, order.weight_t, count),
      count,
      factor: GENERIC_WAGON.factor,
      type: order.required_wagon_type,
      position: GENERIC_WAGON.position,
    };
  }

  const rented = rentedWagonIds();
  const usable = wagons.filter(
    (w) => (w.status === 'verfuegbar' || w.status === 'im_einsatz') && !rented.has(w.id),
  );
  const grouped = new Map<string, { wagon: Wagon; count: number }>();
  for (const w of usable) {
    const existing = grouped.get(w.type_code);
    if (existing) existing.count += w.count;
    else grouped.set(w.type_code, { wagon: w, count: w.count });
  }

  let best: { wagon: Wagon; count: number } | null = null;
  let bestScore = -1;
  for (const group of grouped.values()) {
    const capacity = group.count * group.wagon.capacity_t;
    const covers = capacity >= order.weight_t ? 100000 : capacity;
    const score = covers + brakeFactor(group.wagon.brake_position) * 10;
    if (score > bestScore) {
      bestScore = score;
      best = group;
    }
  }

  if (best) {
    const count = Math.max(1, Math.ceil(order.weight_t / Math.max(1, best.wagon.capacity_t)));
    return {
      tare: best.wagon.tare_weight_t,
      load: loadPerWagon(best.wagon.capacity_t, order.weight_t, count),
      count,
      factor: brakeFactor(best.wagon.brake_position),
      type: best.wagon.type_code,
      position: best.wagon.brake_position,
    };
  }

  const count = Math.max(1, Math.ceil(order.weight_t / GENERIC_WAGON.capacity));
  return {
    tare: GENERIC_WAGON.tare,
    load: loadPerWagon(GENERIC_WAGON.capacity, order.weight_t, count),
    count,
    factor: GENERIC_WAGON.factor,
    type: GENERIC_WAGON.type,
    position: GENERIC_WAGON.position,
  };
}

/**
 * Gesamt-Brh = ((Bremsmasse_Lok + Bremsmasse_Wagen) / (Gesamtmasse_Lok + Gesamtmasse_Wagen)) * 100
 * Always includes locomotive AND attached wagons. Wagon mass is tare + load (not capacity-only).
 */
export function calculateTrainBrh(loco: Locomotive, order: Order, wagons: Wagon[]): BrhCheckResult {
  const requiredBrh = clampOrderMinBrh(order.type, order.min_brh);

  const locoWeight = loco.weight_t ?? 80;
  const locoBrakeWeight = locoWeight * (loco.brake_pct / 100);

  const attached = resolveAttachedWagons(order, wagons);
  const massPerWagon = attached.tare + attached.load;
  const wagonWeight = massPerWagon * attached.count;
  const wagonBrakeWeight = massPerWagon * attached.factor * attached.count;

  const totalWeight = locoWeight + wagonWeight;
  const totalBrakeWeight = locoBrakeWeight + wagonBrakeWeight;
  const availableBrh = totalWeight > 0 ? Math.round((totalBrakeWeight / totalWeight) * 100) : 0;

  const breakdown = {
    locoWeight,
    locoBrakeWeight: Math.round(locoBrakeWeight),
    wagonWeight: Math.round(wagonWeight),
    wagonBrakeWeight: Math.round(wagonBrakeWeight),
    totalWeight: Math.round(totalWeight),
    totalBrakeWeight: Math.round(totalBrakeWeight),
    wagonCount: attached.count,
    wagonType: attached.type,
    brakePosition: attached.position,
  };

  if (availableBrh >= requiredBrh) {
    return {
      passed: true,
      availableBrh,
      requiredBrh,
      message: `Bremshundertstel ausreichend: ${availableBrh} ≥ ${requiredBrh}`,
      breakdown,
    };
  }
  return {
    passed: false,
    availableBrh,
    requiredBrh,
    message: `Bremshundertstel zu niedrig: ${availableBrh} < ${requiredBrh} — Bremsleistung unzureichend!`,
    breakdown,
  };
}

export interface WagonAvailability {
  sufficient: boolean;
  available: number;
  required: number;
  missing: number;
  type: string | null;
}

export function checkWagonAvailability(order: Pick<Order, 'required_wagon_type' | 'required_wagon_count'>, wagons: Wagon[]): WagonAvailability {
  const type = order.required_wagon_type;
  const required = Math.max(0, Number(order.required_wagon_count) || 0);
  if (!type || required <= 0) {
    return { sufficient: true, available: 0, required: 0, missing: 0, type: null };
  }
  const rented = rentedWagonIds();
  const matching = wagons.filter(
    (w) =>
      w.type_code.toLowerCase() === type.toLowerCase() &&
      w.status === 'verfuegbar' &&
      !rented.has(w.id),
  );
  const available = matching.reduce((sum, w) => sum + (Number(w.count) || 0), 0);
  const missing = Math.max(0, required - available);
  return { sufficient: missing === 0, available, required, missing, type };
}

export function wagonShortageLabel(check: WagonAvailability): string | null {
  if (check.sufficient || !check.type || check.missing <= 0) return null;
  return `Es fehlen ${check.missing} Wagen der Gattung ${check.type}`;
}

/** Smallest available packs first so leftover Gattung stays parkable. */
export function pickWagonPacksForOrder(
  order: Pick<Order, 'required_wagon_type' | 'required_wagon_count'>,
  wagons: Wagon[],
): string[] | null {
  const check = checkWagonAvailability(order, wagons);
  if (!check.sufficient || !check.type || check.required <= 0) return [];
  const rented = rentedWagonIds();
  const type = check.type.toLowerCase();
  const packs = wagons
    .filter(
      (w) =>
        w.type_code.toLowerCase() === type &&
        w.status === 'verfuegbar' &&
        !rented.has(w.id) &&
        (Number(w.count) || 0) > 0,
    )
    .sort((a, b) => (Number(a.count) || 0) - (Number(b.count) || 0));
  const ids: string[] = [];
  let need = check.required;
  for (const pack of packs) {
    if (need <= 0) break;
    ids.push(pack.id);
    need -= Number(pack.count) || 0;
  }
  return need > 0 ? null : ids;
}

export function occupyWagonPacks(wagons: Wagon[], packIds: string[]): Wagon[] {
  if (packIds.length === 0) return wagons;
  const ids = new Set(packIds);
  return wagons.map((w) => (ids.has(w.id) ? { ...w, status: 'im_einsatz' as const } : w));
}

export function releaseWagonPacks(wagons: Wagon[], packIds: string[]): Wagon[] {
  if (packIds.length === 0) return wagons;
  const ids = new Set(packIds);
  return wagons.map((w) => (ids.has(w.id) && w.status === 'im_einsatz' ? { ...w, status: 'verfuegbar' as const } : w));
}

/** Legacy assignments without pack ids: free enough im_einsatz packs of the required Gattung. */
export function releaseWagonPacksByNeed(
  order: Pick<Order, 'required_wagon_type' | 'required_wagon_count'> | null | undefined,
  wagons: Wagon[],
): Wagon[] {
  if (!order) return wagons;
  const type = order.required_wagon_type;
  let need = Math.max(0, Number(order.required_wagon_count) || 0);
  if (!type || need <= 0) return wagons;
  const needle = type.toLowerCase();
  const ids: string[] = [];
  for (const w of [...wagons].sort((a, b) => (Number(a.count) || 0) - (Number(b.count) || 0))) {
    if (need <= 0) break;
    if (w.type_code.toLowerCase() !== needle || w.status !== 'im_einsatz') continue;
    ids.push(w.id);
    need -= Number(w.count) || 0;
  }
  return releaseWagonPacks(wagons, ids);
}
