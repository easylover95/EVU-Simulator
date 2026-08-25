import type { Driver, Order } from '@/lib/supabase';
import { isBaugleisEinsatz } from '@/lib/orderMarket';
import { TICKS_PER_DAY } from '@/lib/storage';

/** Market day rates for leased AZF/RB via Personaldienstleister (incl. Zuschläge + PDL-Marge). */
export const PDL_AZF_DAILY_MIN = 650;
export const PDL_AZF_DAILY_MAX = 850;

export type AzfSource = 'eigen' | 'pdl';

export function isBaugleisOrder(order: Pick<Order, 'type'> | null | undefined): boolean {
  return order?.type === 'baugleis';
}

export function isAzfQualified(driver: Driver | null | undefined): boolean {
  if (!driver) return false;
  const blob = (driver.qualifications ?? []).join(' ').toLowerCase();
  if (blob.includes('azf') || blob.includes('rangierbegleiter') || blob.includes('arbeitszug')) return true;
  return /(^|[^a-z])rb([^a-z]|$)/.test(blob);
}

export function availableAzfStaff(drivers: Driver[], excludeIds: Iterable<string> = []): Driver[] {
  const skip = new Set(excludeIds);
  return drivers.filter((d) => d.status === 'verfuegbar' && isAzfQualified(d) && !skip.has(d.id));
}

function hash01(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/** Deterministic 650–850 € / Schicht, heavier trains at the upper end. */
export function pdlAzfDailyRate(order: Pick<Order, 'id' | 'weight_t'>): number {
  const weight = Math.max(0, Number(order.weight_t) || 0);
  const load = Math.max(0, Math.min(1, (weight - 400) / 1000));
  const jitter = (hash01(order.id ?? '') - 0.5) * 40;
  const raw = PDL_AZF_DAILY_MIN + load * (PDL_AZF_DAILY_MAX - PDL_AZF_DAILY_MIN) + jitter;
  return Math.round(Math.min(PDL_AZF_DAILY_MAX, Math.max(PDL_AZF_DAILY_MIN, raw)));
}

/** Spot-Baugleis: at least one PDL/AZF shift, extra days from typical travel hours. */
export function baugleisSpotShiftDays(order: Pick<Order, 'distance_km' | 'deployment_days'>): number {
  if ((order.deployment_days ?? 0) > 0) return 1;
  const km = Math.max(0, Number(order.distance_km) || 200);
  const hours = Math.max(8, Math.round(km / 80));
  return Math.max(1, Math.round(hours / TICKS_PER_DAY));
}

export function pdlAzfChargeForOrder(
  order: Order,
  source: AzfSource = 'pdl',
): { daily: number; shifts: number; total: number; source: AzfSource } {
  if (!isBaugleisOrder(order) || source === 'eigen') {
    return { daily: 0, shifts: 0, total: 0, source: source === 'eigen' ? 'eigen' : 'pdl' };
  }
  const daily = pdlAzfDailyRate(order);
  if (isBaugleisEinsatz(order)) {
    return { daily, shifts: 1, total: daily, source: 'pdl' };
  }
  const shifts = baugleisSpotShiftDays(order);
  return { daily, shifts, total: daily * shifts, source: 'pdl' };
}

export function autoAzfChoice(
  order: Order,
  drivers: Driver[],
  excludeIds: Iterable<string> = [],
): { source: AzfSource; driver: Driver | null; pdlDaily: number } {
  if (!isBaugleisOrder(order)) {
    return { source: 'pdl', driver: null, pdlDaily: 0 };
  }
  const own = availableAzfStaff(drivers, excludeIds)[0] ?? null;
  if (own) return { source: 'eigen', driver: own, pdlDaily: 0 };
  return { source: 'pdl', driver: null, pdlDaily: pdlAzfDailyRate(order) };
}
