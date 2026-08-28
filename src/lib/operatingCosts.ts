import type { FuelType, Order } from '@/lib/supabase';
import { isBaugleisEinsatz } from '@/lib/orderMarket';
import { isBaugleisOrder, pdlAzfChargeForOrder, type AzfSource } from '@/lib/pdl';
import { getEnergyPriceMultiplier, getPathCostMultiplier } from '@/lib/events';
import {
  capPathRatePerKm,
  DIESEL_EUR_PER_KM,
  DIESEL_EUR_PER_LITER,
  DIESEL_LITERS_PER_KM,
  ELECTRIC_EUR_PER_KM,
  ELECTRIC_EUR_PER_KWH,
  ELECTRIC_KWH_PER_KM,
  OPERATING_COST_DIFFICULTY_MULTIPLIER,
  TRASSE_BAUGLEIS_FACTOR,
  TRASSE_EUR_PER_TRAIN_KM,
  TRASSE_WEIGHT_EUR_PER_100T_KM,
} from '@/lib/operatingRates';

export {
  DIESEL_EUR_PER_KM,
  DIESEL_EUR_PER_LITER,
  DIESEL_LITERS_PER_KM,
  ELECTRIC_EUR_PER_KM,
  ELECTRIC_EUR_PER_KWH,
  ELECTRIC_KWH_PER_KM,
  OPERATING_COST_DIFFICULTY_MULTIPLIER,
  TRASSE_BAUGLEIS_FACTOR,
  TRASSE_EUR_PER_TRAIN_KM,
  TRASSE_WEIGHT_EUR_PER_100T_KM,
} from '@/lib/operatingRates';

/**
 * Path (Trasse) and energy rates — local game-balancing values.
 *
 * Trassenpreis is capped at the previous live tariff so kilometre costs never
 * rise versus the last shipped build. Energy is deliberately cheap with a
 * narrow customer-friendly market band.
 *
 *   €/Zug-km = TRASSE_EUR_PER_TRAIN_KM + TRASSE_WEIGHT_EUR_PER_100T_KM × (t / 100)
 *   × type factor (1.00 Güterzug, 0.65 Baugleis / Arbeitseinsatz)
 *   then min(rate, legacy ceiling for the same weight)
 *
 * Energie:
 *   Diesel  8,58 €/km  = 4,4 l/km × 1,95 €/l
 *   Strom   5,04 €/km  = 18 kWh/km × 0,28 €/kWh (OHLE)
 *   Dual    Strom on Güterverkehr (electrified main line), Diesel on Baugleis
 */
export type EnergyMode = 'diesel' | 'elektrik';

export interface OrderOperatingCosts {
  distanceKm: number;
  weightT: number;
  daily: boolean;
  pathRatePerKm: number;
  pathCost: number;
  energyMode: EnergyMode;
  energyRatePerKm: number;
  energyCost: number;
  pdlCost: number;
  pdlDaily: number;
  pdlShifts: number;
  azfSource: AzfSource;
  total: number;
  grossYield: number;
  netProfit: number;
  pathFormula: string;
  energyFormula: string;
}

export function trasseTypeFactor(order: Pick<Order, 'type' | 'deployment_days'>): number {
  return order.type === 'baugleis' ? TRASSE_BAUGLEIS_FACTOR : 1;
}

export function pathRatePerKm(order: Pick<Order, 'type' | 'deployment_days' | 'weight_t'>): number {
  const weight = Math.max(0, Number(order.weight_t) || 0);
  const base = TRASSE_EUR_PER_TRAIN_KM + TRASSE_WEIGHT_EUR_PER_100T_KM * (weight / 100);
  const typed = base * trasseTypeFactor(order);
  return capPathRatePerKm(typed, weight, order.type === 'baugleis');
}

/**
 * Calculates the route-dependent infrastructure charge for one spot trip or
 * one operating day of a Baugleis assignment. Event multipliers apply only
 * here so every caller receives the same current disruption surcharge.
 */
export function pathCostForOrder(order: Pick<Order, 'type' | 'deployment_days' | 'weight_t' | 'distance_km'>): number {
  const km = Math.max(0, Number(order.distance_km) || 0);
  const event = getPathCostMultiplier();
  const rate = pathRatePerKm(order) * (Number.isFinite(event) && event > 0 ? Math.min(1, event) : 1);
  return Math.round(rate * km);
}

/**
 * Resolves the mutually exclusive traction-energy mode shown in the UI. Dual
 * locomotives use electric traction for regular freight and diesel on Baugleis.
 */
export function energyModeFor(order: Pick<Order, 'type'>, fuel: FuelType): EnergyMode {
  if (fuel === 'diesel') return 'diesel';
  if (fuel === 'elektrik') return 'elektrik';
  return order.type === 'baugleis' ? 'diesel' : 'elektrik';
}

export function energyRatePerKm(mode: EnergyMode): number {
  const m = getEnergyPriceMultiplier();
  const diesel = DIESEL_EUR_PER_KM * m;
  const electric = ELECTRIC_EUR_PER_KM * m;
  const rate = mode === 'diesel' ? diesel : electric;
  return Number.isFinite(rate) ? rate : mode === 'diesel' ? DIESEL_EUR_PER_KM : ELECTRIC_EUR_PER_KM;
}

export function energyCostForOrder(
  order: Pick<Order, 'type' | 'distance_km'>,
  fuel: FuelType,
): { mode: EnergyMode; rate: number; cost: number } {
  const km = Math.max(0, Number(order.distance_km) || 0);
  const mode = energyModeFor(order, fuel);
  const rate = energyRatePerKm(mode);
  return { mode, rate, cost: Math.round(rate * km) };
}

export function grossYieldForDisplay(order: Order): number {
  if (isBaugleisEinsatz(order) && order.daily_rate != null) {
    return Number(order.daily_rate) || 0;
  }
  return Number(order.yield) || 0;
}

/**
 * Produces the single source of truth for the pre-acceptance margin forecast.
 * It keeps route charges, exactly one energy mode, and any required AZF/PDL
 * expense separate before calculating the local game-balance net profit.
 */
export function calcOrderOperatingCosts(
  order: Order,
  fuel: FuelType = 'diesel',
  azfSource: AzfSource = 'pdl',
): OrderOperatingCosts {
  if (!order) {
    return {
      distanceKm: 0,
      weightT: 0,
      daily: false,
      pathRatePerKm: 0,
      pathCost: 0,
      energyMode: 'diesel',
      energyRatePerKm: DIESEL_EUR_PER_KM,
      energyCost: 0,
      pdlCost: 0,
      pdlDaily: 0,
      pdlShifts: 0,
      azfSource: 'pdl',
      total: 0,
      grossYield: 0,
      netProfit: 0,
      pathFormula: '',
      energyFormula: '',
    };
  }
  const distanceKm = Math.max(0, Number(order.distance_km) || 0);
  const weightT = Math.max(0, Number(order.weight_t) || 0);
  const daily = isBaugleisEinsatz(order);
  const pathRate = pathRatePerKm(order);
  const path = pathCostForOrder(order);
  const energy = energyCostForOrder(order, fuel);
  const pdl = isBaugleisOrder(order) ? pdlAzfChargeForOrder(order, azfSource) : { daily: 0, shifts: 0, total: 0, source: 'pdl' as AzfSource };
  const total = path + energy.cost + pdl.total;
  const gross = grossYieldForDisplay(order);
  const typeLabel = order.type === 'baugleis' ? `${TRASSE_BAUGLEIS_FACTOR.toFixed(2)}× Baugleis` : '1,00× Güterzug';
  const market = getEnergyPriceMultiplier();
  const marketNote =
    Math.abs(market - 1) >= 0.005
      ? ` × ${market.toFixed(2).replace('.', ',')} (Markt)`
      : '';
  return {
    distanceKm,
    weightT,
    daily,
    pathRatePerKm: pathRate,
    pathCost: path,
    energyMode: energy.mode,
    energyRatePerKm: energy.rate,
    energyCost: energy.cost,
    pdlCost: pdl.total,
    pdlDaily: pdl.daily,
    pdlShifts: pdl.shifts,
    azfSource: pdl.source,
    total,
    grossYield: gross,
    netProfit: gross - total,
    pathFormula: `${TRASSE_EUR_PER_TRAIN_KM.toFixed(2).replace('.', ',')} €/Zug-km + ${TRASSE_WEIGHT_EUR_PER_100T_KM.toFixed(2).replace('.', ',')} €/100 t·km × ${typeLabel} (gedeckelt auf Alt-Tarif)`,
    energyFormula:
      energy.mode === 'diesel'
        ? `${DIESEL_LITERS_PER_KM.toFixed(1).replace('.', ',')} l/km × ${DIESEL_EUR_PER_LITER.toFixed(2).replace('.', ',')} €/l${marketNote} = ${energy.rate.toFixed(2).replace('.', ',')} €/km`
        : `${ELECTRIC_KWH_PER_KM} kWh/km × ${ELECTRIC_EUR_PER_KWH.toFixed(2).replace('.', ',')} €/kWh${marketNote} = ${energy.rate.toFixed(2).replace('.', ',')} €/km`,
  };
}

export function energyLabel(mode: EnergyMode): string {
  return mode === 'diesel' ? 'Diesel' : 'Strom (OHLE)';
}
