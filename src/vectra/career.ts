import type { CareerState, DispatcherRank, Grade, ShiftReport, ShiftStats } from '@/vectra/types';

/**
 * Orientierungsgrößen Monatsbrutto EVU-Disponent Güterverkehr (DE, Mittelstand).
 * Schichtlohn = Monatsbrutto / typische Schichten pro Monat (Wechselschicht).
 *
 * Rangaufstieg: EXP + Mindestschichten — nie nach einer einzelnen Schicht.
 */
export const SHIFTS_PER_MONTH = 18;

export type IncidentTier = 'junior' | 'senior' | 'cvd';

export const RANK_META: Record<
  DispatcherRank,
  {
    label: string;
    /** Parallele Züge unter Disposition. */
    maxTrains: number;
    monthlyGrossEuro: number;
    expToNext: number | null;
    minShiftsForPromo: number | null;
    budget: number;
    /** Incident-Wahrscheinlichkeit pro Spielminute. */
    incidentRate: number;
    /** Gleichzeitige offene GSM-R-Meldungen. */
    maxOpenIncidents: number;
    /** Welche Incident-Pools aktiv sind. */
    incidentTiers: IncidentTier[];
    hints: string[];
  }
> = {
  1: {
    label: 'Junior-Disponent',
    maxTrains: 4,
    monthlyGrossEuro: 3_650,
    expToNext: 520,
    minShiftsForPromo: 12,
    budget: 4_500,
    incidentRate: 0.032,
    maxOpenIncidents: 1,
    incidentTiers: ['junior'],
    hints: [
      'Probezeit · 4 Züge',
      'Einfache Lenkzeit- und Technikmeldungen',
      'Max. 1 offener GSM-R-Anruf',
      'Beförderung erst nach 12 Schichten + EXP',
    ],
  },
  2: {
    label: 'Senior-Disponent',
    maxTrains: 7,
    monthlyGrossEuro: 4_600,
    expToNext: 960,
    minShiftsForPromo: 16,
    budget: 9_000,
    incidentRate: 0.052,
    maxOpenIncidents: 2,
    incidentTiers: ['junior', 'senior'],
    hints: [
      '7 parallele Züge · mehr RID',
      'Kundenfenster, Kreuzungskonflikte, Gefahrgut',
      'Bis 2 offene Meldungen gleichzeitig',
      'Beförderung zum CvD erst nach 16 Senior-Schichten + EXP',
    ],
  },
  3: {
    label: 'Schichtleiter / CvD',
    maxTrains: 10,
    monthlyGrossEuro: 5_700,
    expToNext: null,
    minShiftsForPromo: null,
    budget: 18_000,
    incidentRate: 0.078,
    maxOpenIncidents: 3,
    incidentTiers: ['junior', 'senior', 'cvd'],
    hints: [
      'Vollast · 10 Züge im Netz',
      'Großstörungen, Korridorsperren, Personalengpässe',
      'Bis 3 parallele GSM-R-Anrufe',
      'Höchster Rang — Schichtverantwortung',
    ],
  },
};

/** Anteil einer Schicht am Monatsbrutto (Wechselschicht-Betrieb). */
export function shiftBaseWage(rank: DispatcherRank): number {
  return Math.round(RANK_META[rank].monthlyGrossEuro / SHIFTS_PER_MONTH);
}

export function defaultCareer(): CareerState {
  return {
    displayName: '',
    roleLabel: 'Disponent / Disponentin',
    rank: 1,
    exp: 0,
    shiftsCompleted: 0,
    shiftsAtRank: 0,
    punctualityHistory: [],
    totalEarnedEuro: 0,
  };
}

export function careerTitle(c: CareerState): string {
  const name = c.displayName.trim();
  return name ? `${RANK_META[c.rank].label} ${name}` : RANK_META[c.rank].label;
}

/** Leistungszulage pro Schicht (getrennt von Note/Pünktlichkeit-Anzeige). */
const GRADE_BONUS: Record<Grade, number> = { S: 140, A: 85, B: 35, C: 0 };
const GRADE_EXP: Record<Grade, number> = { S: 22, A: 14, B: 8, C: 3 };

export function gradeFromStats(punct: number, stats: ShiftStats, openCritical: number): { grade: Grade; reason: string } {
  if (punct >= 90 && stats.incidentsResolved >= 1 && openCritical === 0 && stats.totalDelayAdded <= 20) {
    return { grade: 'S', reason: 'Hohe Pünktlichkeit, saubere Meldungsarbeit' };
  }
  if (punct >= 80 && openCritical <= 1) {
    return { grade: 'A', reason: 'Solide Schicht mit geringen Abweichungen' };
  }
  if (punct >= 60 || stats.incidentsResolved > 0) {
    return { grade: 'B', reason: 'Betrieb gehalten — Luft nach oben' };
  }
  return { grade: 'C', reason: 'Hohe Verspätung oder offene Störungen' };
}

/** EXP pro Schicht gedeckelt — viele Meldungen sollen keinen Sofort-Aufstieg ermöglichen. */
export function computeShiftExp(punct: number, grade: Grade, stats: ShiftStats): number {
  const incidentExp = Math.min(stats.incidentsResolved, 3) * 5;
  const lenkExp = Math.min(stats.lenkzeitAverted, 2) * 4;
  let exp = 10 + Math.round(punct / 8) + incidentExp + lenkExp + GRADE_EXP[grade];
  if (punct >= 90) exp += 8;
  return Math.min(55, Math.max(6, exp));
}

export function buildPayroll(
  career: CareerState,
  punct: number,
  grade: Grade,
  stats: ShiftStats,
): { wageBase: number; punctualityBonus: number; wageTotal: number; expGained: number } {
  const wageBase = shiftBaseWage(career.rank);
  // Leistungszulage: Pünktlichkeitsanteil + Notenzulage (nicht als „Note in €“ anzeigen)
  const punctualityBonus = Math.round(wageBase * 0.2 * (punct / 100)) + GRADE_BONUS[grade];
  const wageTotal =
    wageBase + punctualityBonus + Math.min(stats.incidentsResolved, 5) * 25 + stats.lenkzeitAverted * 40;
  const expGained = computeShiftExp(punct, grade, stats);
  return { wageBase, punctualityBonus, wageTotal, expGained };
}

export function canPromote(career: CareerState): boolean {
  const meta = RANK_META[career.rank];
  if (meta.expToNext == null || meta.minShiftsForPromo == null) return false;
  return career.exp >= meta.expToNext && career.shiftsAtRank >= meta.minShiftsForPromo;
}

export function promoProgressLabel(career: CareerState): string {
  const meta = RANK_META[career.rank];
  if (meta.expToNext == null || meta.minShiftsForPromo == null) {
    return 'Höchster Rang erreicht';
  }
  const expPart = `${Math.min(career.exp, meta.expToNext)} / ${meta.expToNext} EXP`;
  const shiftPart = `${Math.min(career.shiftsAtRank, meta.minShiftsForPromo)} / ${meta.minShiftsForPromo} Schichten`;
  if (canPromote(career)) return `${expPart} · bereit zur Beförderung`;
  const needExp = Math.max(0, meta.expToNext - career.exp);
  const needShifts = Math.max(0, meta.minShiftsForPromo - career.shiftsAtRank);
  if (needExp > 0 && needShifts > 0) {
    return `${expPart} · ${shiftPart} (noch ${needExp} EXP, ${needShifts} Schichten)`;
  }
  if (needExp > 0) return `${expPart} · ${shiftPart} (noch ${needExp} EXP)`;
  return `${expPart} · ${shiftPart} (noch ${needShifts} Schichten)`;
}

export function applyShiftCareer(
  career: CareerState,
  report: Pick<ShiftReport, 'punctualityPct' | 'expGained' | 'wageTotal'>,
): CareerState {
  let rank = career.rank;
  let exp = career.exp + report.expGained;
  let shiftsAtRank = career.shiftsAtRank + 1;

  // Maximal eine Stufe pro Schicht — und nur mit EXP + Mindestschichten
  const meta = RANK_META[rank];
  if (
    rank < 3 &&
    meta.expToNext != null &&
    meta.minShiftsForPromo != null &&
    exp >= meta.expToNext &&
    shiftsAtRank >= meta.minShiftsForPromo
  ) {
    exp -= meta.expToNext;
    rank = (rank + 1) as DispatcherRank;
    shiftsAtRank = 0;
  }

  if (rank === 3) exp = Math.min(exp, 999);

  const history = [...career.punctualityHistory, report.punctualityPct].slice(-12);
  return {
    ...career,
    rank,
    exp,
    shiftsAtRank,
    shiftsCompleted: career.shiftsCompleted + 1,
    punctualityHistory: history,
    totalEarnedEuro: career.totalEarnedEuro + report.wageTotal,
  };
}
