import type { ReactNode } from 'react';
import type { Company, Driver, Locomotive, Wagon } from '@/lib/supabase';
import { formatEuro } from '@/lib/status';
import {
  emptyDepotState,
  locoBerthCap,
  wagonBerthCap,
  wagonUnitCount,
  type DepotState,
} from '@/lib/depot';

/** Snapshot of the live operating state used by shared section KPI strips. */
export interface SectionPulse {
  company: Company | null;
  locomotives: Locomotive[];
  drivers: Driver[];
  wagons: Wagon[];
  depot?: DepotState;
}

export interface SectionKpi {
  label: string;
  value: ReactNode;
  hint?: string;
}

/** Returns the number of locomotive berths available in the current depot configuration. */
export function yardBerthCap(depot: DepotState | null | undefined): number {
  return locoBerthCap(depot ?? emptyDepotState());
}

/** Calculates vacant locomotive berths while protecting the UI from negative capacities. */
export function freeYardBerths(depot: DepotState | null | undefined, parkedLocos: number): number {
  return Math.max(0, yardBerthCap(depot) - parkedLocos);
}

/**
 * Builds the compact, cross-section KPI strip from the current operating snapshot.
 * This presentation-neutral function intentionally contains no component state, so
 * every screen derives identical capacity and liquidity figures.
 */
export function buildDefaultKpis(pulse: SectionPulse): SectionKpi[] {
  const level = pulse.company?.level ?? 1;
  const depot = pulse.depot ?? emptyDepotState();
  const berths = locoBerthCap(depot);
  const parked = pulse.locomotives.length;
  const wagonCap = wagonBerthCap(depot);
  const wagonUnits = wagonUnitCount(pulse.wagons);
  const activeLocos = pulse.locomotives.filter((loco) => loco.status === 'einsatz').length;
  const staff = pulse.drivers.length;
  const xp = pulse.company?.xp ?? 0;
  const xpNext = pulse.company?.xp_next ?? 0;

  return [
    {
      label: 'Stellplätze',
      value: `${parked} / ${berths}`,
      hint: `Loks · Wagen ${wagonUnits}/${wagonCap}`,
    },
    {
      label: 'Verfügbares Kapital',
      value: formatEuro(pulse.company?.balance ?? 0),
    },
    {
      label: 'Aktive Fahrzeuge / Personal',
      value: `${activeLocos} / ${staff}`,
      hint: 'Im Einsatz · Mitarbeiter',
    },
    {
      label: 'Firmen-Level',
      value: `Lvl ${level}`,
      hint: xpNext > 0 ? `${xp} / ${xpNext} XP` : undefined,
    },
  ];
}
