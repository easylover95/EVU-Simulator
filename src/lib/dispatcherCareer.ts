/**
 * Persönliche Disponenten-Karriere: Rang, EXP, Schichtlohn.
 */
import { loadJson, saveJson } from '@/lib/storage';
import type { DispatcherGrade, ShiftReport, ShiftStats } from '@/lib/shifts';

export const DISPATCHER_CAREER_KEY = 'evu-dispatcher-career';

export type DispatcherRank = 1 | 2 | 3;

export interface DispatcherRankDef {
  rank: DispatcherRank;
  label: string;
  shortLabel: string;
  maxConcurrentTrains: number;
  unlocks: string[];
  unlockHints: string[];
  baseWageEuro: number;
  /** EXP needed to reach the next rank; null = max rank. */
  expToNext: number | null;
}

export const DISPATCHER_RANKS: Record<DispatcherRank, DispatcherRankDef> = {
  1: {
    rank: 1,
    label: 'Junior-Disponent',
    shortLabel: 'Junior',
    maxConcurrentTrains: 3,
    unlocks: ['lenkzeit'],
    unlockHints: ['Max. 3 Züge gleichzeitig', 'Einfache Lenkzeit-Incidents'],
    /** Schichtanteil aus ~3.650 € Monatsbrutto / 18 Schichten. */
    baseWageEuro: 203,
    expToNext: 100,
  },
  2: {
    rank: 2,
    label: 'Senior-Disponent',
    shortLabel: 'Senior',
    maxConcurrentTrains: 8,
    unlocks: ['lenkzeit', 'hauptkorridor', 'gefahrgut'],
    unlockHints: ['Hauptkorridore', 'Gefahrgut-Züge'],
    baseWageEuro: 256,
    expToNext: 250,
  },
  3: {
    rank: 3,
    label: 'Schichtleiter',
    shortLabel: 'Schichtleiter',
    maxConcurrentTrains: 99,
    unlocks: ['lenkzeit', 'hauptkorridor', 'gefahrgut', 'grossstoerung', 'notfallbudget'],
    unlockHints: ['Großstörungen', 'Unbegrenztes Notfall-Budget'],
    baseWageEuro: 317,
    expToNext: null,
  },
};

export interface DispatcherCareer {
  displayName: string;
  /** Anrede für UI: „Disponent“ / „Disponentin“ */
  roleLabel: string;
  rank: DispatcherRank;
  exp: number;
  shiftsCompleted: number;
  totalEarnedEuro: number;
}

export interface ShiftPayroll {
  baseWageEuro: number;
  punctualityBonusEuro: number;
  gradeBonusEuro: number;
  incidentBonusEuro: number;
  totalWageEuro: number;
  expGained: number;
  rankBefore: DispatcherRank;
  rankAfter: DispatcherRank;
  promoted: boolean;
  expIntoRank: number;
  expToNext: number | null;
}

export function defaultDispatcherCareer(seedName?: string): DispatcherCareer {
  const name = (seedName ?? '').trim() || 'Alex Weber';
  return {
    displayName: name,
    roleLabel: 'Disponent/in',
    rank: 1,
    exp: 0,
    shiftsCompleted: 0,
    totalEarnedEuro: 0,
  };
}

export function loadDispatcherCareer(seedName?: string): DispatcherCareer {
  const loaded = loadJson<Partial<DispatcherCareer> | null>(DISPATCHER_CAREER_KEY, null);
  const base = defaultDispatcherCareer(seedName);
  if (!loaded || typeof loaded !== 'object') return base;
  const rank = loaded.rank === 2 || loaded.rank === 3 ? loaded.rank : 1;
  return {
    displayName: typeof loaded.displayName === 'string' && loaded.displayName.trim()
      ? loaded.displayName.trim()
      : base.displayName,
    roleLabel: typeof loaded.roleLabel === 'string' && loaded.roleLabel.trim()
      ? loaded.roleLabel.trim()
      : base.roleLabel,
    rank,
    exp: Math.max(0, Number(loaded.exp) || 0),
    shiftsCompleted: Math.max(0, Number(loaded.shiftsCompleted) || 0),
    totalEarnedEuro: Math.max(0, Number(loaded.totalEarnedEuro) || 0),
  };
}

export function saveDispatcherCareer(career: DispatcherCareer): void {
  saveJson(DISPATCHER_CAREER_KEY, career);
}

export function rankDef(rank: DispatcherRank): DispatcherRankDef {
  return DISPATCHER_RANKS[rank];
}

export function careerFullTitle(career: DispatcherCareer): string {
  const def = rankDef(career.rank);
  return `${def.label} ${career.displayName}`;
}

export function expProgress(career: DispatcherCareer): {
  intoRank: number;
  toNext: number | null;
  pct: number;
} {
  const def = rankDef(career.rank);
  if (def.expToNext == null) {
    return { intoRank: career.exp, toNext: null, pct: 100 };
  }
  // EXP is cumulative within current rank band (reset on promote).
  const into = Math.min(career.exp, def.expToNext);
  return {
    intoRank: into,
    toNext: def.expToNext,
    pct: Math.round((into / def.expToNext) * 100),
  };
}

const GRADE_WAGE: Record<DispatcherGrade, number> = { S: 80, A: 40, B: 15, C: 0 };
const GRADE_EXP: Record<DispatcherGrade, number> = { S: 40, A: 25, B: 10, C: 0 };

export function computeShiftPayroll(
  career: DispatcherCareer,
  report: Pick<ShiftReport, 'punctualityPct' | 'grade' | 'resolvedIncidents' | 'penaltyEuro'>,
  stats: ShiftStats,
): ShiftPayroll {
  const def = rankDef(career.rank);
  const baseWageEuro = def.baseWageEuro;
  const punctualityBonusEuro = Math.round(baseWageEuro * 0.35 * (report.punctualityPct / 100));
  const gradeBonusEuro = GRADE_WAGE[report.grade];
  const incidentBonusEuro = report.resolvedIncidents.length * 12;
  // Abgewendete Strafen: Bonus wenn keine Pönale, kleiner Malus bereits in grade
  const penaltyAvoidBonus = report.penaltyEuro <= 0 && stats.onTimeCompletions + stats.lateCompletions > 0 ? 25 : 0;
  const totalWageEuro = baseWageEuro + punctualityBonusEuro + gradeBonusEuro + incidentBonusEuro + penaltyAvoidBonus;

  let expGained =
    25 +
    Math.round(report.punctualityPct / 4) +
    report.resolvedIncidents.length * 8 +
    GRADE_EXP[report.grade];
  if (report.penaltyEuro <= 0) expGained += 10;

  return {
    baseWageEuro,
    punctualityBonusEuro: punctualityBonusEuro + penaltyAvoidBonus,
    gradeBonusEuro,
    incidentBonusEuro,
    totalWageEuro,
    expGained,
    rankBefore: career.rank,
    rankAfter: career.rank,
    promoted: false,
    expIntoRank: career.exp,
    expToNext: def.expToNext,
  };
}

/** Apply EXP/wage bookkeeping; may promote rank (EXP resets into next band). */
export function applyShiftToCareer(
  career: DispatcherCareer,
  payroll: ShiftPayroll,
): { career: DispatcherCareer; payroll: ShiftPayroll } {
  let rank = career.rank;
  let exp = career.exp + payroll.expGained;
  let promoted = false;

  while (rank < 3) {
    const need = DISPATCHER_RANKS[rank].expToNext;
    if (need == null || exp < need) break;
    exp -= need;
    rank = (rank + 1) as DispatcherRank;
    promoted = true;
  }
  if (rank === 3) {
    // Cap display EXP at a soft ceiling for progress bar fullness.
    exp = Math.min(exp, 999);
  }

  const nextCareer: DispatcherCareer = {
    ...career,
    rank,
    exp,
    shiftsCompleted: career.shiftsCompleted + 1,
    totalEarnedEuro: career.totalEarnedEuro + payroll.totalWageEuro,
  };
  const nextDef = rankDef(rank);
  return {
    career: nextCareer,
    payroll: {
      ...payroll,
      rankBefore: career.rank,
      rankAfter: rank,
      promoted,
      expIntoRank: exp,
      expToNext: nextDef.expToNext,
    },
  };
}

export function canHandleConcurrentTrains(career: DispatcherCareer, activeCount: number): boolean {
  return activeCount < rankDef(career.rank).maxConcurrentTrains;
}

export function hasUnlock(career: DispatcherCareer, unlock: string): boolean {
  return rankDef(career.rank).unlocks.includes(unlock);
}
