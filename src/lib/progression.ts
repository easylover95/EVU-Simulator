import type { Company, Order } from '@/lib/supabase';
import { isBaugleisEinsatz } from '@/lib/orderMarket';
import { clampReputation } from '@/lib/storage';

/** XP needed for level 2 from a fresh start (matches SEED_COMPANY.xp_next). */
export const XP_NEXT_GROWTH = 1.45;

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
): { company: Company; newLevels: number[] } {
  let xp = company.xp + Math.max(0, Math.round(xpGain));
  let level = Math.max(1, company.level);
  let xpNext = Math.max(1, company.xp_next);
  const newLevels: number[] = [];
  while (xp >= xpNext) {
    xp -= xpNext;
    level += 1;
    xpNext = Math.max(1, Math.round(xpNext * XP_NEXT_GROWTH));
    newLevels.push(level);
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
  };
}
