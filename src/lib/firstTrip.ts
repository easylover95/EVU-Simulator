import type { Order, Wagon } from '@/lib/supabase';
import { checkWagonAvailability } from '@/lib/brh';
import { applyFreightPricing, isOpenUnexpiredMarketOrder } from '@/lib/orderMarket';
import { GAME_EPOCH, tickToIso } from '@/lib/gameTime';
import { clampOrderMinBrh } from '@/lib/status';

export const FIRST_TRIP_DONE_KEY = 'evu-first-trip-done';

/** Open market order the player can accept with current wagons. */
export function isOrderFleetReady(
  order: Pick<Order, 'required_wagon_type' | 'required_wagon_count' | 'status'>,
  wagons: Wagon[],
): boolean {
  return checkWagonAvailability(order, wagons).sufficient;
}

function availableWagonPacks(wagons: Wagon[]): Array<{ type: string; count: number }> {
  const byType = new Map<string, number>();
  for (const wagon of wagons) {
    if (wagon.status !== 'verfuegbar') continue;
    const count = Math.max(0, Number(wagon.count) || 0);
    if (count <= 0) continue;
    const type = wagon.type_code;
    byType.set(type, (byType.get(type) ?? 0) + count);
  }
  return [...byType.entries()]
    .map(([type, count]) => ({ type, count }))
    .filter((pack) => pack.count >= 4)
    .sort((a, b) => b.count - a.count);
}

function bridgeOrderTitle(type: string): { title: string; cargo: string; origin: string; destination: string } {
  if (type === 'Eanos') {
    return {
      title: 'Holztransport Bayreuth–Regensburg',
      cargo: 'Schnittholz',
      origin: 'Bayreuth',
      destination: 'Regensburg',
    };
  }
  if (type === 'Res') {
    return {
      title: 'Stahlcoils Salzgitter–Dortmund',
      cargo: 'Coils',
      origin: 'Salzgitter',
      destination: 'Dortmund',
    };
  }
  return {
    title: `Regionalfracht ${type}`,
    cargo: 'Stückgut',
    origin: 'Duisburg',
    destination: 'Dortmund',
  };
}

/** Inject 1–2 light offers that match the current wagon fleet (early-game bridge). */
export function ensureFleetReadyMarketOrders(
  orders: Order[],
  wagons: Wagon[],
  tick: number,
  now: Date = new Date(),
): Order[] {
  const open = orders.filter((order) => isOpenUnexpiredMarketOrder(order, now));
  const ready = open.filter((order) => isOrderFleetReady(order, wagons));
  if (ready.length >= 2) return orders;

  const packs = availableWagonPacks(wagons);
  if (packs.length === 0) return orders;

  const usedNumbers = new Set(orders.map((order) => order.order_number));
  const next = [...orders];
  const need = Math.max(0, 2 - ready.length);
  let injected = 0;

  for (const pack of packs) {
    if (injected >= need) break;
    const alreadyReadyOfType = ready.some(
      (order) => (order.required_wagon_type ?? '').toLowerCase() === pack.type.toLowerCase(),
    );
    if (alreadyReadyOfType) continue;

    const count = Math.min(6, Math.max(4, pack.count >= 6 ? 6 : pack.count));
    if (count > pack.count) continue;
    const meta = bridgeOrderTitle(pack.type);
    const day = String(now.getDate()).padStart(2, '0');
    let orderNumber = `AIX-START-${pack.type.toUpperCase()}-${day}${injected + 1}`;
    let suffix = 1;
    while (usedNumbers.has(orderNumber)) {
      orderNumber = `AIX-START-${pack.type.toUpperCase()}-${day}${injected + 1}-${suffix}`;
      suffix += 1;
    }
    usedNumbers.add(orderNumber);

    const draft: Order = {
      id: `starter-bridge-${pack.type.toLowerCase()}-${tick}-${injected}`,
      order_number: orderNumber,
      type: 'gueterverkehr',
      title: meta.title,
      origin: meta.origin,
      destination: meta.destination,
      distance_km: 120,
      weight_t: count * 58,
      yield: 5_900,
      penalty: 250,
      deadline: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(),
      status: 'offen',
      notes: `Einstiegsauftrag: ${count}× ${pack.type} · ${meta.cargo}. Passt zu deinem aktuellen Wagenpark.`,
      min_brh: clampOrderMinBrh('gueterverkehr', 65),
      required_wagon_type: pack.type,
      required_wagon_count: count,
      sperrpause_start: null,
      sperrpause_end: null,
      penalty_per_min: 0,
      created_at: tickToIso(tick) || GAME_EPOCH.toISOString(),
      customer: 'EVU Mentoring Spot',
      customer_id: 'starter-bridge',
      origin_country: 'D',
      destination_country: 'D',
      requires_etcs: false,
      contract_id: null,
      deployment_days: null,
      daily_rate: null,
      required_drivers: 1,
    };
    next.unshift(applyFreightPricing(draft));
    injected += 1;
  }

  return injected > 0 ? next : orders;
}

/** Ready orders first, then lighter wagon counts, then higher yield. */
export function sortOrdersFleetReadyFirst(orders: Order[], wagons: Wagon[]): Order[] {
  return [...orders].sort((a, b) => {
    const aReady = isOrderFleetReady(a, wagons) ? 0 : 1;
    const bReady = isOrderFleetReady(b, wagons) ? 0 : 1;
    if (aReady !== bReady) return aReady - bReady;
    const aCount = Math.max(0, Number(a.required_wagon_count) || 99);
    const bCount = Math.max(0, Number(b.required_wagon_count) || 99);
    if (aCount !== bCount) return aCount - bCount;
    const yieldCmp = (Number(b.yield) || 0) - (Number(a.yield) || 0);
    if (yieldCmp !== 0) return yieldCmp;
    return a.order_number.localeCompare(b.order_number);
  });
}

/** Best starter-friendly open order for the guided first trip. */
export function pickGuidedFirstOrder(orders: Order[], wagons: Wagon[], now: Date): Order | null {
  const open = orders.filter((order) => isOpenUnexpiredMarketOrder(order, now));
  const ready = sortOrdersFleetReadyFirst(
    open.filter((order) => isOrderFleetReady(order, wagons)),
    wagons,
  );
  return ready[0] ?? null;
}

export function hasCompletedFirstTrip(): boolean {
  try {
    return localStorage.getItem(FIRST_TRIP_DONE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markFirstTripDone(): void {
  try {
    localStorage.setItem(FIRST_TRIP_DONE_KEY, '1');
  } catch {
    /* private mode */
  }
}
