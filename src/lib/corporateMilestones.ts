import { loadJson, saveJson } from '@/lib/storage';
import { CORE_LEVEL_CAP, CORPORATE_MILESTONE_XP_STEP } from '@/lib/progression';

export const CORPORATE_MILESTONES_KEY = 'evu-corporate-milestones';

export type CorporateRankId = 'regional' | 'ueberregional' | 'national' | 'europaeisch';

export interface CorporateRank {
  id: CorporateRankId;
  label: string;
  description: string;
  requiredLevel: number;
  requiredMilestoneXp: number;
}

export const CORPORATE_RANKS: readonly CorporateRank[] = [
  {
    id: 'regional',
    label: 'Regionales EVU',
    description: 'Aufbau eines verlässlichen regionalen Güterverkehrsunternehmens.',
    requiredLevel: 1,
    requiredMilestoneXp: 0,
  },
  {
    id: 'ueberregional',
    label: 'Überregionaler Logistiker',
    description: 'Überregionaler Betrieb mit wiederkehrenden Verkehren und wachsender Organisation.',
    requiredLevel: 6,
    requiredMilestoneXp: 0,
  },
  {
    id: 'national',
    label: 'Nationaler Marktführer',
    description: 'National etablierter Betreiber mit ausgereifter Infrastruktur und Verantwortung.',
    requiredLevel: 11,
    requiredMilestoneXp: 0,
  },
  {
    id: 'europaeisch',
    label: 'Europäischer Konzern',
    description: 'Kernlevel 20 abgeschlossen und erste dauerhafte Konzern-Meilensteinzertifizierung erreicht.',
    requiredLevel: CORE_LEVEL_CAP,
    requiredMilestoneXp: CORPORATE_MILESTONE_XP_STEP,
  },
] as const;

export interface CorporateMilestoneState {
  totalXp: number;
  completedMilestones: number;
}

function safePoints(value: unknown): number {
  const points = Math.round(Number(value) || 0);
  return Number.isFinite(points) ? Math.max(0, points) : 0;
}

function normalizeCorporateMilestones(value: Partial<CorporateMilestoneState> | null | undefined): CorporateMilestoneState {
  const totalXp = safePoints(value?.totalXp);
  return {
    totalXp,
    completedMilestones: Math.floor(totalXp / CORPORATE_MILESTONE_XP_STEP),
  };
}

export function loadCorporateMilestones(): CorporateMilestoneState {
  return normalizeCorporateMilestones(loadJson<Partial<CorporateMilestoneState> | null>(CORPORATE_MILESTONES_KEY, null));
}

export function saveCorporateMilestones(state: CorporateMilestoneState): void {
  const normalized = normalizeCorporateMilestones(state);
  saveJson(CORPORATE_MILESTONES_KEY, normalized);
}

export function awardCorporateMilestoneXp(
  state: CorporateMilestoneState,
  xpGain: number,
): CorporateMilestoneState {
  const totalXp = safePoints(state.totalXp) + safePoints(xpGain);
  return {
    totalXp,
    completedMilestones: Math.floor(totalXp / CORPORATE_MILESTONE_XP_STEP),
  };
}

export function corporateRankForProgress(level: number, milestoneXp: number): CorporateRank {
  const normalizedLevel = Math.max(1, Math.min(CORE_LEVEL_CAP, Math.round(Number(level) || 1)));
  const points = safePoints(milestoneXp);
  return [...CORPORATE_RANKS]
    .reverse()
    .find((rank) => normalizedLevel >= rank.requiredLevel && points >= rank.requiredMilestoneXp) ?? CORPORATE_RANKS[0];
}

export function nextCorporateRank(level: number, milestoneXp: number): CorporateRank | null {
  const current = corporateRankForProgress(level, milestoneXp);
  const currentIndex = CORPORATE_RANKS.findIndex((rank) => rank.id === current.id);
  return CORPORATE_RANKS[currentIndex + 1] ?? null;
}

/** Migrates the visible post-cap XP bar into local milestone history once, without changing the company. */
export function migrateVisibleMilestoneXp(
  state: CorporateMilestoneState,
  level: number,
  visibleXp: number,
): CorporateMilestoneState {
  if (level < CORE_LEVEL_CAP || state.totalXp > 0) return state;
  return awardCorporateMilestoneXp(state, visibleXp);
}

export function milestoneXpTowardNext(state: CorporateMilestoneState): number {
  return state.totalXp % CORPORATE_MILESTONE_XP_STEP;
}
