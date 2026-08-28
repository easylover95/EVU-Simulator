import { clampReputation } from '@/lib/storage';

/** Exclusive Ganzzüge appear from this reputation score. */
export const EXCLUSIVE_REPUTATION = 70;
export const EXCLUSIVE_YIELD_FACTOR = 1.48;

export interface ReputationTier {
  min: number;
  id: 'start' | 'regional' | 'trusted' | 'premium' | 'leader';
  label: string;
  hint: string;
}

export const REPUTATION_TIERS: readonly ReputationTier[] = [
  { min: 0, id: 'start', label: 'Newcomer', hint: 'Spotmarkt und Einstiegsverträge' },
  { min: 25, id: 'regional', label: 'Regionalpartner', hint: 'Mehr Industrieangebote in der Fläche' },
  { min: 50, id: 'trusted', label: 'Vertrauenswürdig', hint: 'Rahmenverträge mit höherer Frequenz' },
  { min: 70, id: 'premium', label: 'Premium-EVU', hint: 'Exklusive hochrentable Ganzzüge' },
  { min: 85, id: 'leader', label: 'Marktführer', hint: 'Beste Konditionen und exklusive Korridore' },
] as const;

export function reputationTier(score: number | null | undefined): ReputationTier {
  const value = clampReputation(score ?? 0);
  let current = REPUTATION_TIERS[0]!;
  for (const tier of REPUTATION_TIERS) {
    if (value >= tier.min) current = tier;
  }
  return current;
}

export function reputationBarClass(score: number | null | undefined): string {
  const id = reputationTier(score).id;
  if (id === 'leader' || id === 'premium') return 'bg-emerald-500';
  if (id === 'trusted') return 'bg-amber-500';
  if (id === 'regional') return 'bg-sky-500';
  return 'bg-rose-500';
}

export function reputationTextClass(score: number | null | undefined): string {
  const id = reputationTier(score).id;
  if (id === 'leader' || id === 'premium') return 'text-emerald-400';
  if (id === 'trusted') return 'text-amber-400';
  if (id === 'regional') return 'text-sky-400';
  return 'text-rose-400';
}

export function exclusiveJobsUnlocked(score: number | null | undefined): boolean {
  return clampReputation(score ?? 0) >= EXCLUSIVE_REPUTATION;
}

/** Reputation gained when a framework contract is fully covered for the game day. */
export function reputationGainForFulfilledContract(departuresDone: number): number {
  const done = Math.max(1, Math.round(Number(departuresDone) || 1));
  return Math.min(4, 1 + done);
}

export function nextReputationUnlock(score: number | null | undefined): ReputationTier | null {
  const value = clampReputation(score ?? 0);
  return REPUTATION_TIERS.find((tier) => tier.min > value) ?? null;
}
