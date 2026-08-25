import type { Driver } from '@/lib/supabase';
import { hoursBetween } from '@/lib/gameTime';

/** Minimum rest after end of last duty before the next trip is legally clean. */
export const MIN_REST_HOURS = 8;
/** 48h driving window (matches driver.max_hours default). */
export const DRIVING_WINDOW_HOURS = 48;

export const REST_WARNING =
  'Ruhezeiten verletzt — erhöhtes Unfall- und Bußgeldrisiko (EBA)';

export interface DriverRestStatus {
  restHours: number;
  insufficientRest: boolean;
  overHours: boolean;
  violated: boolean;
  hoursWorked: number;
  maxHours: number;
}

export function driverRestStatus(driver: Driver, now: Date): DriverRestStatus {
  const restHours = hoursBetween(driver.last_rest_end, now);
  const hoursWorked = Number(driver.hours_worked) || 0;
  const maxHours = Number(driver.max_hours) || DRIVING_WINDOW_HOURS;
  const insufficientRest = restHours < MIN_REST_HOURS;
  const overHours = hoursWorked >= maxHours;
  return {
    restHours,
    insufficientRest,
    overHours,
    violated: insufficientRest || overHours,
    hoursWorked,
    maxHours,
  };
}

export function restStatusHint(status: DriverRestStatus): string | null {
  if (!status.violated) return null;
  if (status.insufficientRest && status.overHours) {
    return `${REST_WARNING} · nur ${status.restHours}h Ruhe · ${status.hoursWorked}/${status.maxHours}h im 48h-Fenster`;
  }
  if (status.insufficientRest) {
    return `${REST_WARNING} · nur ${status.restHours}h Ruhe (mindestens ${MIN_REST_HOURS}h)`;
  }
  return `${REST_WARNING} · ${status.hoursWorked}/${status.maxHours}h im 48h-Fenster`;
}

export interface RestTripOutcome {
  ebaFine: number;
  reputationLoss: number;
  accident: boolean;
  driverSick: boolean;
  extraPenalty: boolean;
  delayTicks: number;
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Resolve rest-violation risk at trip settle (accident happened en route). */
export function resolveRestTripRisk(): RestTripOutcome {
  const accident = Math.random() < 0.48;
  const driverSick = Math.random() < 0.32 || accident;
  return {
    ebaFine: randInt(12_000, 28_000),
    reputationLoss: accident ? randInt(10, 16) : randInt(6, 10),
    accident,
    driverSick,
    extraPenalty: accident || Math.random() < 0.35,
    delayTicks: accident ? randInt(4, 10) : randInt(2, 5),
  };
}
