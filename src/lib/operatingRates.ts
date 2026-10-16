/**
 * Shared path / energy rates. Imported by operating cost and Baugleis pricing
 * so the two layers cannot drift.
 *
 * Previous live values (kept as documented ceiling, never exceeded):
 *   difficulty 1.08 × 9,60 €/Zug-km = 10,368 €/Zug-km
 *   difficulty 1.08 × 0,36 €/100 t·km
 *   Diesel 4,8 l/km × 2,40 €/l × 1,08 = 12,442 €/km
 *   Strom 20 kWh/km × 0,42 €/kWh × 1,08 = 9,072 €/km
 *
 * Current player-friendly rates are strictly below those ceilings.
 */
export const LEGACY_TRASSE_EUR_PER_TRAIN_KM = 9.6 * 1.08;
export const LEGACY_TRASSE_WEIGHT_EUR_PER_100T_KM = 0.36 * 1.08;
export const LEGACY_DIESEL_EUR_PER_KM = 4.8 * 2.4 * 1.08;
export const LEGACY_ELECTRIC_EUR_PER_KM = 20 * 0.42 * 1.08;

/** Path charges: no operating-cost uplift; slightly below the previous live tariff. */
export const OPERATING_COST_DIFFICULTY_MULTIPLIER = 1;
export const TRASSE_EUR_PER_TRAIN_KM = 8.9;
export const TRASSE_WEIGHT_EUR_PER_100T_KM = 0.32;
export const TRASSE_BAUGLEIS_FACTOR = 0.65;

export const DIESEL_LITERS_PER_KM = 4.4;
export const DIESEL_EUR_PER_LITER = 1.95;
export const DIESEL_EUR_PER_KM = DIESEL_LITERS_PER_KM * DIESEL_EUR_PER_LITER;

export const ELECTRIC_KWH_PER_KM = 18;
export const ELECTRIC_EUR_PER_KWH = 0.28;
export const ELECTRIC_EUR_PER_KM = ELECTRIC_KWH_PER_KM * ELECTRIC_EUR_PER_KWH;

/** Mild, customer-friendly energy market band (never a punishing spike). */
export const ENERGY_MARKET_MIN = 0.92;
export const ENERGY_MARKET_MAX = 1.06;

/** Path events may discount, never surcharge above the base tariff. */
export const PATH_MARKET_MIN = 0.94;
export const PATH_MARKET_MAX = 1;

export function clampEnergyMarketMultiplier(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(ENERGY_MARKET_MAX, Math.max(ENERGY_MARKET_MIN, value));
}

export function clampPathMarketMultiplier(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(PATH_MARKET_MAX, Math.max(PATH_MARKET_MIN, value));
}

export function legacyPathRatePerKm(weightT: number, baugleis: boolean): number {
  const weight = Math.max(0, weightT);
  const base = LEGACY_TRASSE_EUR_PER_TRAIN_KM + LEGACY_TRASSE_WEIGHT_EUR_PER_100T_KM * (weight / 100);
  return base * (baugleis ? TRASSE_BAUGLEIS_FACTOR : 1);
}

export function capPathRatePerKm(rate: number, weightT: number, baugleis: boolean): number {
  const ceiling = legacyPathRatePerKm(weightT, baugleis);
  if (!Number.isFinite(rate)) return ceiling;
  return Math.min(rate, ceiling);
}
