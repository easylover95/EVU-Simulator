import type { FuelType, Locomotive, Order } from '@/lib/supabase';

export type TractionKind = 'diesel' | 'elektrik' | 'dual';

export interface TrailingLoadInput {
  fuel_type: FuelType;
  power_kw?: number | null;
  weight_t?: number | null;
}

/**
 * Approximate German freight Hakenlast (t) on typical Hauptbahn gradients.
 * Rangierlokomotiven get a higher t/kW factor; heavy electrics a lower one.
 */
export function trailingLoadT(loco: TrailingLoadInput): number {
  const kw = Math.max(80, Number(loco.power_kw) || 800);
  const mass = Math.max(16, Number(loco.weight_t) || 80);
  let tPerKw: number;
  if (kw < 600) tPerKw = 1.55;
  else if (loco.fuel_type === 'elektrik') tPerKw = 0.52;
  else if (loco.fuel_type === 'dual') tPerKw = 0.62;
  else tPerKw = 0.92;
  return Math.max(320, Math.round(kw * tPerKw + mass * 0.35));
}

export function isOrderElectrified(
  order: Pick<Order, 'electrified' | 'type' | 'destination'> | null | undefined,
): boolean {
  if (!order) return true;
  if (order.electrified === false) return false;
  if (order.electrified === true) return true;
  if (order.type === 'baugleis') return false;
  const dest = (order.destination ?? '').toLowerCase();
  if (/baugleis|anschluss|werk|baustelle|nebenbahn/.test(dest)) return false;
  return true;
}

export type AssignmentFitCode = 'ok' | 'ohle_missing' | 'trailing_load';

export interface AssignmentFit {
  ok: boolean;
  code: AssignmentFitCode;
  message: string;
  trailingLoadT: number;
  weightT: number;
  electrified: boolean;
  fuel: FuelType;
}

export function evaluateAssignmentFit(
  order: Pick<Order, 'electrified' | 'type' | 'destination' | 'weight_t'> | null | undefined,
  loco: TrailingLoadInput | null | undefined,
): AssignmentFit | null {
  if (!order || !loco) return null;
  const electrified = isOrderElectrified(order);
  const weightT = Math.max(0, Number(order.weight_t) || 0);
  const hook = trailingLoadT(loco);
  const fuel = loco.fuel_type;
  if (fuel === 'elektrik' && !electrified) {
    return {
      ok: false,
      code: 'ohle_missing',
      message: 'Keine Oberleitung auf dieser Strecke — eine E-Lok darf nicht zugewiesen werden.',
      trailingLoadT: hook,
      weightT,
      electrified,
      fuel,
    };
  }
  if (weightT > hook) {
    return {
      ok: false,
      code: 'trailing_load',
      message: `Hakenlast ${hook.toLocaleString('de-DE')} t reicht nicht für ${weightT.toLocaleString('de-DE')} t Fracht.`,
      trailingLoadT: hook,
      weightT,
      electrified,
      fuel,
    };
  }
  const wire = electrified ? 'Oberleitung vorhanden' : 'ohne Oberleitung (Diesel/Dual)';
  return {
    ok: true,
    code: 'ok',
    message: `${fuelLabel(fuel)} · ${wire} · Hakenlast ${hook.toLocaleString('de-DE')} t ≥ ${weightT.toLocaleString('de-DE')} t.`,
    trailingLoadT: hook,
    weightT,
    electrified,
    fuel,
  };
}

export function fuelLabel(fuel: FuelType): string {
  if (fuel === 'elektrik') return 'E-Lok';
  if (fuel === 'dual') return 'Dual-Lok';
  return 'Diesellok';
}

export function locoCanRunUnelectrified(fuel: FuelType): boolean {
  return fuel === 'diesel' || fuel === 'dual';
}

export function locoCanRunElectrified(fuel: FuelType): boolean {
  return fuel === 'elektrik' || fuel === 'dual' || fuel === 'diesel';
}

export interface FleetMarketProfile {
  count: number;
  hasElectric: boolean;
  hasDiesel: boolean;
  hasDual: boolean;
  minTrailingT: number;
  maxTrailingT: number;
  maxOhleTrailingT: number;
  maxUnelectrifiedTrailingT: number;
}

const STARTER_DIESEL_HOOK = trailingLoadT({ fuel_type: 'diesel', power_kw: 1840, weight_t: 80 });

export function analyzeFleetForMarket(locomotives: Locomotive[] | null | undefined): FleetMarketProfile {
  const live = (locomotives ?? []).filter((loco) => loco && loco.status !== 'stillgelegt');
  if (live.length === 0) {
    return {
      count: 0,
      hasElectric: false,
      hasDiesel: true,
      hasDual: false,
      minTrailingT: STARTER_DIESEL_HOOK,
      maxTrailingT: STARTER_DIESEL_HOOK,
      maxOhleTrailingT: STARTER_DIESEL_HOOK,
      maxUnelectrifiedTrailingT: STARTER_DIESEL_HOOK,
    };
  }
  const hooks = live.map((loco) => trailingLoadT(loco));
  const ohle = live.filter((loco) => locoCanRunElectrified(loco.fuel_type)).map((loco) => trailingLoadT(loco));
  const dieselSide = live
    .filter((loco) => locoCanRunUnelectrified(loco.fuel_type))
    .map((loco) => trailingLoadT(loco));
  return {
    count: live.length,
    hasElectric: live.some((loco) => loco.fuel_type === 'elektrik'),
    hasDiesel: live.some((loco) => loco.fuel_type === 'diesel'),
    hasDual: live.some((loco) => loco.fuel_type === 'dual'),
    minTrailingT: Math.min(...hooks),
    maxTrailingT: Math.max(...hooks),
    maxOhleTrailingT: ohle.length > 0 ? Math.max(...ohle) : Math.max(...hooks),
    maxUnelectrifiedTrailingT: dieselSide.length > 0 ? Math.max(...dieselSide) : Math.max(...hooks),
  };
}

export function bestFleetFit(
  order: Pick<Order, 'electrified' | 'type' | 'destination' | 'weight_t'>,
  locomotives: Locomotive[],
): AssignmentFit | null {
  const live = locomotives.filter((loco) => loco.status !== 'stillgelegt');
  if (live.length === 0) return null;
  const fits = live
    .map((loco) => evaluateAssignmentFit(order, loco))
    .filter((row): row is AssignmentFit => row != null);
  const ok = fits.find((row) => row.ok);
  if (ok) return ok;
  return fits[0] ?? null;
}

export function fleetHasMatchingLoco(
  order: Pick<Order, 'electrified' | 'type' | 'destination' | 'weight_t'>,
  locomotives: Locomotive[],
): boolean {
  return locomotives.some((loco) => {
    if (loco.status === 'stillgelegt') return false;
    return evaluateAssignmentFit(order, loco)?.ok === true;
  });
}
