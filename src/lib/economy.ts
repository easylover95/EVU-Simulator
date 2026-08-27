export const COMPANY_ECONOMY_KEY = 'evu-company-economy';

import { clampReputation, loadJson, saveJson } from '@/lib/storage';

export interface CompanyEconomy {
  balance: number;
  reputation: number;
  lastTick: number;
  level?: number;
}

export function loadCompanyEconomy(): CompanyEconomy | null {
  const loaded = loadJson<CompanyEconomy | null>(COMPANY_ECONOMY_KEY, null);
  if (!loaded || !Number.isFinite(loaded.balance)) return null;
  return {
    balance: loaded.balance,
    reputation: clampReputation(loaded.reputation ?? 0),
    lastTick: Number(loaded.lastTick) || 0,
    level: Math.max(1, Math.floor(Number(loaded.level) || 1)),
  };
}

export function saveCompanyEconomy(economy: CompanyEconomy): void {
  saveJson(COMPANY_ECONOMY_KEY, {
    balance: economy.balance,
    reputation: clampReputation(economy.reputation),
    lastTick: economy.lastTick,
    level: Math.max(1, Math.floor(Number(economy.level) || 1)),
  });
}

export function applyEconomy<T extends { balance: number; reputation: number; tick: number }>(
  company: T,
  economy: CompanyEconomy | null,
): T {
  if (!economy) return company;
  return {
    ...company,
    balance: economy.balance,
    reputation: clampReputation(economy.reputation),
  };
}
