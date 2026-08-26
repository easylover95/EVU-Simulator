import assert from 'node:assert/strict';
import {
  DEFAULT_OVERDRAFT,
  INSURANCE_BASE_DAILY,
  OVERDRAFT_CRITICAL_DAILY_RATE,
  OVERDRAFT_HIGH_DAILY_RATE,
  OVERDRAFT_SAFE_DAILY_RATE,
  OVERDRAFT_TIERS,
  canSpendInvestment,
  defaultOverdraftForLevel,
  overdraftRateForBalance,
  processBankTick,
  type BankState,
} from '../src/lib/bank';
import {
  awardCorporateMilestoneXp,
  corporateRankForProgress,
  type CorporateMilestoneState,
} from '../src/lib/corporateMilestones';
import { CORE_LEVEL_CAP, CORPORATE_MILESTONE_XP_STEP, grantCompanyXp } from '../src/lib/progression';
import { SEED_COMPANY } from '../src/lib/seed';
import { TICKS_PER_DAY } from '../src/lib/storage';

function bankState(limit: number): BankState {
  return {
    overdraftLimit: limit,
    overdraftDailyRate: OVERDRAFT_SAFE_DAILY_RATE,
    loans: [],
    insurances: { gueterschaden: false, haftpflicht: false },
    bookings: [],
    lastProcessedTick: 0,
    sanierungStartTick: null,
    insolvent: false,
  };
}

assert.deepEqual(OVERDRAFT_TIERS, [0, 25_000, 35_000, 50_000, 65_000, 80_000, 100_000, 120_000, 140_000, 155_000, 175_000]);
assert.equal(DEFAULT_OVERDRAFT, 25_000);
assert.equal(defaultOverdraftForLevel(1), 25_000);
assert.equal(defaultOverdraftForLevel(6), 100_000);
assert.equal(defaultOverdraftForLevel(20), 175_000);

assert.equal(overdraftRateForBalance(-50_000, 100_000), OVERDRAFT_SAFE_DAILY_RATE);
assert.equal(overdraftRateForBalance(-50_001, 100_000), OVERDRAFT_HIGH_DAILY_RATE);
assert.equal(overdraftRateForBalance(-85_001, 100_000), OVERDRAFT_CRITICAL_DAILY_RATE);
assert.equal(canSpendInvestment(10_000, 10_000), true);
assert.equal(canSpendInvestment(10_000, 10_001), false);

const rateBooking = processBankTick(
  bankState(100_000),
  { ...SEED_COMPANY, balance: -60_000, tick: 0 },
  TICKS_PER_DAY,
);
assert.equal(rateBooking.company.balance, -60_033 - INSURANCE_BASE_DAILY);
assert.equal(rateBooking.state.overdraftDailyRate, OVERDRAFT_HIGH_DAILY_RATE);
const interestBooking = rateBooking.state.bookings.find((booking) => booking.kind === 'zinsen');
assert.equal(interestBooking?.amount, -33);
assert.match(interestBooking?.label ?? '', /0,055 %/);

const atCap = grantCompanyXp(
  { ...SEED_COMPANY, level: CORE_LEVEL_CAP, xp: 12_000, xp_next: 1_000, balance: 210_000 },
  800,
);
assert.equal(atCap.company.level, CORE_LEVEL_CAP);
assert.equal(atCap.company.xp, 12_800);
assert.equal(atCap.company.xp_next, CORPORATE_MILESTONE_XP_STEP);
assert.equal(atCap.milestoneXpGain, 800);
assert.equal(atCap.company.balance, 210_000);

const crossingCap = grantCompanyXp(
  { ...SEED_COMPANY, level: CORE_LEVEL_CAP - 1, xp: 999, xp_next: 1_000, balance: 210_000 },
  1_500,
);
assert.equal(crossingCap.company.level, CORE_LEVEL_CAP);
assert.equal(crossingCap.company.xp, 1_499);
assert.equal(crossingCap.milestoneXpGain, 1_499);

const milestones: CorporateMilestoneState = awardCorporateMilestoneXp(
  { totalXp: 0, completedMilestones: 0 },
  CORPORATE_MILESTONE_XP_STEP,
);
assert.equal(milestones.completedMilestones, 1);
assert.equal(corporateRankForProgress(CORE_LEVEL_CAP, milestones.totalXp).label, 'Europäischer Konzern');
assert.equal(corporateRankForProgress(CORE_LEVEL_CAP - 1, milestones.totalXp).label, 'Nationaler Marktführer');

console.log('Progressions- und Dispo-Regression erfolgreich: Staffel, Zinsen, Cash-only-Investitionen, Level-Cap und Konzern-Meilensteine geprüft.');
