import type { Locomotive } from '@/lib/supabase';
import { LOCO_OFFERS } from '@/lib/dealer';
import { etcsMitigatedDelay } from '@/lib/networkAccess';
import { TICKS_PER_DAY } from '@/lib/storage';
import { offerIdFromDesignation } from '@/lib/workshop';

export type SeriesId = string;
export type StaffRank = 1 | 2 | 3;

export const XP_PER_TF_TRIP = 22;
export const XP_PER_SECOND_TF = 16;
export const XP_PER_AZF_TRIP = 10;
export const XP_RANK_2 = 80;
export const XP_RANK_3 = 200;

const SERIES_TRAIN_COST: Record<string, number> = {
  rangier: 1_800,
  diesel: 2_800,
  elektro: 3_600,
  hybrid: 4_200,
};

const SERIES_TRAIN_DAYS: Record<string, number> = {
  rangier: 1,
  diesel: 1,
  elektro: 2,
  hybrid: 2,
};

export function seriesIdForLoco(loco: Pick<Locomotive, 'designation'> | null | undefined): string | null {
  if (!loco) return null;
  return offerIdFromDesignation(loco.designation) ?? null;
}

export function seriesLabel(id: string | null | undefined): string {
  if (!id) return '—';
  const offer = LOCO_OFFERS.find((o) => o.id === id);
  if (offer?.displayName) return offer.displayName.replace(' · ', ' ');
  return id.toUpperCase();
}

export function allSeriesIds(): string[] {
  return LOCO_OFFERS.map((o) => o.id);
}

export function fleetSeriesIds(locos: Locomotive[] | null | undefined): string[] {
  const ids = new Set<string>();
  for (const loco of locos ?? []) {
    const id = seriesIdForLoco(loco);
    if (id) ids.add(id);
  }
  return [...ids];
}

export const HIRE_SERIES_NACHSCHULUNG_PER_CLASS = 2_200;

export function hireNachschulungFee(missingCount: number): number {
  return Math.max(0, Math.round(missingCount)) * HIRE_SERIES_NACHSCHULUNG_PER_CLASS;
}

/** Exact offer id, then designation/BR tokens from free-text quals (e.g. BR 218, Vectron, G 2000). */
export function seriesIdFromQualText(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const byId = LOCO_OFFERS.find((o) => o.id.toLowerCase() === trimmed.toLowerCase());
  if (byId) return byId.id;
  const byLabel = LOCO_OFFERS.find((o) => {
    const name = o.displayName.toLowerCase();
    const des = o.designation.toLowerCase();
    const q = trimmed.toLowerCase();
    return name === q || des === q || name.replace(' · ', ' ') === q;
  });
  if (byLabel) return byLabel.id;
  return offerIdFromDesignation(trimmed);
}

export function coveredSeriesIds(
  seriesIds: string[] | null | undefined,
  qualifications?: string[] | null,
): Set<string> {
  const have = new Set(seriesIds ?? []);
  for (const q of qualifications ?? []) {
    const id = seriesIdFromQualText(q);
    if (id) have.add(id);
  }
  return have;
}

export function driverHasSeries(
  seriesIds: string[] | null | undefined,
  seriesId: string | null | undefined,
  qualifications?: string[] | null,
): boolean {
  if (!seriesId) return true;
  return coveredSeriesIds(seriesIds, qualifications).has(seriesId);
}

export function seriesDispatchBlock(
  loco: Pick<Locomotive, 'designation'> | null | undefined,
  seriesIds: string[] | null | undefined,
): string | null {
  const id = seriesIdForLoco(loco);
  if (!id) return null;
  if (driverHasSeries(seriesIds, id)) return null;
  return `Keine Baureihen-Freigabe für ${seriesLabel(id)}. Tf in der Personalakte nachschulen.`;
}

export function missingFleetSeries(
  seriesIds: string[] | null | undefined,
  locos: Locomotive[],
  qualifications?: string[] | null,
): string[] {
  const have = coveredSeriesIds(seriesIds, qualifications);
  return fleetSeriesIds(locos).filter((id) => !have.has(id));
}

export function seriesTrainingQuote(seriesId: string): { cost: number; durationDays: number; durationTicks: number } {
  const offer = LOCO_OFFERS.find((o) => o.id === seriesId);
  const seg = offer?.segment ?? 'diesel';
  const durationDays = SERIES_TRAIN_DAYS[seg] ?? 1;
  return {
    cost: SERIES_TRAIN_COST[seg] ?? 2_800,
    durationDays,
    durationTicks: durationDays * TICKS_PER_DAY,
  };
}

export function pickSeriesForHire(rng: () => number, rank: StaffRank, role: 'tf' | 'azf' | 'wagenpruefer'): string[] {
  if (role !== 'tf') return [];
  const pool = allSeriesIds();
  const want = rank === 1 ? 1 : rank === 2 ? (rng() < 0.5 ? 2 : 1) : rng() < 0.45 ? 3 : 2;
  const picked = new Set<string>();
  if (rng() < 0.5) picked.add('br218');
  let guard = 0;
  while (picked.size < want && guard < 40) {
    picked.add(pool[Math.floor(rng() * pool.length)] ?? 'br218');
    guard += 1;
  }
  return [...picked];
}

export function staffRuntimeFactor(xp: number, rank: StaffRank): number {
  const fromXp = Math.min(0.08, (Math.max(0, xp) / 360) * 0.08);
  const fromRank = (rank - 1) * 0.015;
  return Math.max(0.88, 1 - fromXp - fromRank);
}

export function staffDelayFactor(xp: number, rank: StaffRank): number {
  const fromXp = Math.min(0.32, (Math.max(0, xp) / 280) * 0.32);
  const fromRank = (rank - 1) * 0.08;
  return Math.max(0.45, 1 - fromXp - fromRank);
}

export function staffEfficiencyPct(xp: number, rank: StaffRank): number {
  return Math.round((1 - staffRuntimeFactor(xp, rank)) * 1000) / 10;
}

export function composeTripDelay(
  baseTicks: number,
  hasEtcs: boolean,
  xp: number,
  rank: StaffRank,
): number {
  const afterEtcs = etcsMitigatedDelay(baseTicks, hasEtcs);
  return Math.max(0, Math.round(afterEtcs * staffDelayFactor(xp, rank)));
}

export function applyStaffRuntime(baseTicks: number, xp: number, rank: StaffRank): number {
  if (baseTicks <= 0) return baseTicks;
  return Math.max(1, Math.round(baseTicks * staffRuntimeFactor(xp, rank)));
}

export function xpProgressToNextRank(xp: number, rank: StaffRank): { current: number; nextAt: number | null; label: string } {
  if (rank >= 3) return { current: xp, nextAt: null, label: 'Höchste Qualifikationsstufe' };
  const nextAt = rank === 1 ? XP_RANK_2 : XP_RANK_3;
  return { current: xp, nextAt, label: `Noch ${Math.max(0, nextAt - xp)} XP bis Stufe ${rank + 1}` };
}
