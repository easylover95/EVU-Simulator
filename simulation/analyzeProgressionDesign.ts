import { XP_NEXT_GROWTH } from '../src/lib/progression';
import { defaultOverdraftForLevel } from '../src/lib/bank';

type Stage = 'early' | 'mid' | 'late';

interface OverdraftDesignRow {
  level: number;
  stage: Stage;
  currentLimit: number;
  proposedCeiling: number;
  purchaseLockAt: number;
  dailyRateAtHalfOrLess: number;
  dailyRateAtHighUse: number;
  dailyRateAtCriticalUse: number;
}

interface CashScenario {
  id: string;
  level: number;
  days: number;
  openingBalance: number;
  dailyOperatingCashflow: number;
  shockDay: number;
  shockCost: number;
}

const PROPOSED_CEILINGS: Record<number, number> = {
  1: 25_000,
  2: 35_000,
  3: 50_000,
  4: 65_000,
  5: 80_000,
  6: 100_000,
  7: 120_000,
  8: 140_000,
  9: 155_000,
  10: 175_000,
};

function stageForLevel(level: number): Stage {
  if (level <= 3) return 'early';
  if (level <= 7) return 'mid';
  return 'late';
}

/** Level 10 is a financial soft cap; later progress gives access and reliability, not a larger cash line. */
function proposedOverdraftCeiling(level: number): number {
  const normalized = Math.max(1, Math.floor(level));
  return PROPOSED_CEILINGS[Math.min(10, normalized)] ?? 175_000;
}

function progressiveDailyRate(balance: number, ceiling: number): number {
  const used = Math.max(0, -balance);
  const utilization = ceiling > 0 ? used / ceiling : 0;
  if (utilization <= 0.5) return 0.00035;
  if (utilization <= 0.85) return 0.00055;
  return 0.0008;
}

function progressCurve(maxLevel: number): Array<{ level: number; xpForNext: number; cumulativeXpFromStart: number }> {
  let xpForNext = 1_000;
  let cumulative = 0;
  const rows = [];
  for (let level = 1; level <= maxLevel; level += 1) {
    rows.push({ level, xpForNext, cumulativeXpFromStart: cumulative });
    cumulative += xpForNext;
    xpForNext = Math.max(1, Math.round(xpForNext * XP_NEXT_GROWTH));
  }
  return rows;
}

function simulateScenario(scenario: CashScenario, ceiling: number) {
  let balance = scenario.openingBalance;
  let interestPaid = 0;
  let peakDispoUsed = 0;
  let daysNegative = 0;
  let dayRecovered: number | null = null;
  let investmentLockDays = 0;
  const timeline: Array<{ day: number; balance: number; interest: number; utilization: number; investmentLocked: boolean }> = [];

  for (let day = 1; day <= scenario.days; day += 1) {
    balance += scenario.dailyOperatingCashflow;
    if (day === scenario.shockDay) balance -= scenario.shockCost;
    let interest = 0;
    if (balance < 0) {
      const rate = progressiveDailyRate(balance, ceiling);
      interest = Math.max(1, Math.round(Math.abs(balance) * rate));
      balance -= interest;
      interestPaid += interest;
      daysNegative += 1;
    }
    const used = Math.max(0, -balance);
    peakDispoUsed = Math.max(peakDispoUsed, used);
    const utilization = ceiling > 0 ? used / ceiling : 0;
    const investmentLocked = utilization >= 0.6;
    if (investmentLocked) investmentLockDays += 1;
    if (dayRecovered == null && scenario.shockDay < day && balance >= 0) dayRecovered = day;
    timeline.push({ day, balance: Math.round(balance), interest, utilization, investmentLocked });
  }

  return {
    ...scenario,
    ceiling,
    finalBalance: Math.round(balance),
    interestPaid,
    peakDispoUsed: Math.round(peakDispoUsed),
    peakUtilization: ceiling > 0 ? peakDispoUsed / ceiling : 0,
    daysNegative,
    dayRecovered,
    investmentLockDays,
    insolvent: balance < -ceiling || peakDispoUsed > ceiling,
    timeline,
  };
}

const overdraftCurve: OverdraftDesignRow[] = Array.from({ length: 20 }, (_, offset) => {
  const level = offset + 1;
  const proposedCeiling = proposedOverdraftCeiling(level);
  return {
    level,
    stage: stageForLevel(level),
    currentLimit: defaultOverdraftForLevel(level),
    proposedCeiling,
    purchaseLockAt: Math.round(proposedCeiling * 0.6),
    dailyRateAtHalfOrLess: 0.00035,
    dailyRateAtHighUse: 0.00055,
    dailyRateAtCriticalUse: 0.0008,
  };
});

const scenarios: CashScenario[] = [
  {
    id: 'fruehspiel_defekt',
    level: 2,
    days: 21,
    openingBalance: 3_000,
    dailyOperatingCashflow: 1_800,
    shockDay: 3,
    shockCost: 18_000,
  },
  {
    id: 'mittelspiel_werkstatt',
    level: 6,
    days: 30,
    openingBalance: 12_000,
    dailyOperatingCashflow: 3_500,
    shockDay: 5,
    shockCost: 52_000,
  },
  {
    id: 'spaetspiel_flottenausfall',
    level: 10,
    days: 45,
    openingBalance: 18_000,
    dailyOperatingCashflow: 6_500,
    shockDay: 3,
    shockCost: 145_000,
  },
];

const simulatedScenarios = scenarios.map((scenario) => simulateScenario(scenario, proposedOverdraftCeiling(scenario.level)));
const xpCurve = progressCurve(25);

const report = {
  assumptions: {
    model: 'Softcap bei Kernstufe 20, danach Meilenstein-/Zertifizierungssystem ohne Reset',
    XP_NEXT_GROWTH,
    proposedFinancialSoftcapLevel: 10,
    proposedOverdraftFinancialCap: 175_000,
    purchaseLockUtilization: 0.6,
    progressiveDailyRates: {
      utilizationUpTo50Pct: 0.00035,
      utilization50To85Pct: 0.00055,
      utilizationAbove85Pct: 0.0008,
    },
    note: 'Szenarien verwenden lokale illustrative Netto-Cashflows nach operativer Leistung. Sie sind keine reale Finanzmarktprognose.',
  },
  xpCurve: xpCurve.filter((row) => [1, 2, 3, 5, 10, 15, 20, 21, 25].includes(row.level)),
  overdraftCurve,
  scenarios: simulatedScenarios.map(({ timeline, ...summary }) => {
    // The compact report intentionally omits daily rows; scenario details remain in the simulator.
    void timeline;
    return summary;
  }),
};

console.log(JSON.stringify(report, null, 2));
