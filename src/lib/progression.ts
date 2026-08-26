import type { Company, Order } from '@/lib/supabase';
import { isBaugleisEinsatz } from '@/lib/orderMarket';
import { clampReputation } from '@/lib/storage';

/** XP needed for level 2 from a fresh start (matches SEED_COMPANY.xp_next). */
export const XP_NEXT_GROWTH = 1.45;

/** The economic progression deliberately ends here; later XP become permanent corporate milestones. */
export const CORE_LEVEL_CAP = 20;
export const CORPORATE_MILESTONE_XP_STEP = 250_000;

/** Bekanntheit rises only via Werbeagentur or EVU-Level. */
export const BEKANNTHEIT_PER_LEVEL = 8;

/** Halved vs. the first balancing pass so EVU-Level langsamer steigen. */
export function xpForCompletedOrder(order: Order): number {
  const yieldAmt = Number(order.yield) || 0;
  if (isBaugleisEinsatz(order)) return Math.max(40, Math.round(yieldAmt / 500));
  return Math.max(12, Math.round(yieldAmt / 160));
}

export function grantCompanyXp(
  company: Company,
  xpGain: number,
): { company: Company; newLevels: number[]; milestoneXpGain: number } {
  const normalizedGain = Math.max(0, Math.round(xpGain));
  let xp = Math.max(0, Math.round(company.xp)) + normalizedGain;
  let level = Math.max(1, Math.min(CORE_LEVEL_CAP, Math.round(company.level)));
  const startedAtCoreCap = level >= CORE_LEVEL_CAP;
  let xpNext = level >= CORE_LEVEL_CAP
    ? CORPORATE_MILESTONE_XP_STEP
    : Math.max(1, Math.round(company.xp_next));
  const newLevels: number[] = [];
  let milestoneXpGain = 0;

  while (level < CORE_LEVEL_CAP && xp >= xpNext) {
    xp -= xpNext;
    level += 1;
    newLevels.push(level);
    xpNext = level >= CORE_LEVEL_CAP
      ? CORPORATE_MILESTONE_XP_STEP
      : Math.max(1, Math.round(xpNext * XP_NEXT_GROWTH));
  }

  if (level >= CORE_LEVEL_CAP) {
    milestoneXpGain = startedAtCoreCap ? normalizedGain : xp;
    xp %= CORPORATE_MILESTONE_XP_STEP;
    xpNext = CORPORATE_MILESTONE_XP_STEP;
  }

  return {
    company: {
      ...company,
      xp,
      level,
      xp_next: xpNext,
      reputation: clampReputation(company.reputation + newLevels.length * BEKANNTHEIT_PER_LEVEL),
    },
    newLevels,
    milestoneXpGain,
  };
}
