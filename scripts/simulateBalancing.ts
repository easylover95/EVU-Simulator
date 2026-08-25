/**
 * Headless Wirtschafts-Simulation (kein React / kein UI).
 *
 * Start:  npm run simulate
 * Optionen:  --days 730   --seed 1
 */
import './polyfillSimEnv.ts';

import type {
  AssignmentWithDetails,
  Company,
  Driver,
  Locomotive,
  Order,
  Wagon,
} from '@/lib/supabase';
import {
  DEFAULT_OVERDRAFT,
  INSURANCE_CATALOG,
  LOAN_AMOUNTS,
  LOAN_OFFERS,
  MAX_LOAN_PRINCIPAL,
  OVERDRAFT_TIERS,
  canChangeOverdraftLimit,
  canSpend,
  isLoanAmountUnlocked,
  isOverdraftTierUnlocked,
  loanDailyPayment,
  normalizeOverdraftLimit,
  overdraftRateForLimit,
  processBankTick,
  pushBooking,
  seedBankBookings,
  syncSanierung,
  type BankState,
  type InsuranceId,
} from '@/lib/bank';
import {
  acceptContract,
  canAcceptIndustrial,
  defaultFreightContracts,
  industrialDailyOperatingCost,
  industrialPayableDaily,
  processFreightContractsTick,
  type IndustrialContract,
} from '@/lib/freightContracts';
import {
  WAGON_OFFERS,
  buildPurchasedWagons,
  ensureUsedStock,
  migrateDealerState,
  offerForLoco,
  processLeasesTick,
  quoteWagonDeal,
  type DealerState,
} from '@/lib/dealer';
import {
  applyTickToAssignments,
  applyTickToDrivers,
  newNotificationId,
  tickToDate,
  tickToIso,
} from '@/lib/gameTime';
import { completeDueTraining, ensureStaffMeta, processPayrollTick, type StaffMeta } from '@/lib/jobcenter';
import { calcOrderOperatingCosts } from '@/lib/operatingCosts';
import { processDepotTick } from '@/lib/dailyFixedCosts';
import {
  canBuyDepotExpansion,
  emptyDepotState,
  ensureDepotFits,
  locoBerthCap,
  nextExpansion,
  purchaseDepotExpansion,
  wagonBerthCap,
  wagonUnitCount,
  type DepotState,
} from '@/lib/depot';
import { autoAzfChoice, isBaugleisOrder } from '@/lib/pdl';
import {
  generateMarketOrders,
  isBaugleisEinsatz,
  isConstructionLoco,
  isOpenUnexpiredMarketOrder,
  purgeExpiredOpenOrders,
  refreshMarketOrders,
  requiredDriversFor,
  standingFromCompany,
} from '@/lib/orderMarket';
import { grantCompanyXp, xpForCompletedOrder } from '@/lib/progression';
import { processRentalTick, saveRentalState, type RentalState } from '@/lib/rental';
import { processAdvertisingTick, type AdvertisingState } from '@/lib/advertising';
import {
  processBaugleisDeploymentsTick,
  startBaugleisDeployment,
  type BaugleisDeployment,
} from '@/lib/baugleisDeployments';
import { SEED_COMPANY, SEED_DRIVERS, SEED_LOCOMOTIVES, SEED_WAGONS } from '@/lib/seed';
import { formatEuro } from '@/lib/status';
import { TICKS_PER_DAY, isNewGameDay } from '@/lib/storage';
import { assignmentProgress } from '@/lib/tracking';
import {
  WAGON_JOB_RATES,
  applyCompletedJob,
  newWagonJobId,
  type WagonJob,
  type WagonJobKind,
} from '@/lib/wagonJobs';
import {
  canBookWorkshopJob,
  completeWorkshopJob,
  ensureMaintenance,
  fristFor,
  isHuValid,
  isLocoDeployable,
  jobLabel,
  processMaintenanceDay,
  quoteWorkshopJob,
  syncLocoStatus,
  type WorkshopChannel,
  type WorkshopJob,
  type WorkshopJobKind,
} from '@/lib/workshop';

const DEFAULT_DAYS = 730;
const CASH_RESERVE = 40_000;
const LOAN_TRIGGER = 20_000;

interface Milestone {
  day: number;
  tick: number;
  kind: 'level' | 'dispo' | 'sanierung' | 'insolvenz';
  detail: string;
}

interface SimStats {
  income: number;
  expense: number;
  trainKm: number;
  tripsCompleted: number;
  ordersBooked: number;
  wagonsBought: number;
  loansTaken: number;
}

interface SimState {
  company: Company;
  bank: BankState;
  locomotives: Locomotive[];
  drivers: Driver[];
  wagons: Wagon[];
  orders: Order[];
  assignments: AssignmentWithDetails[];
  assignmentWagons: Map<string, string[]>;
  chargedTripIds: string[];
  staffMeta: Record<string, StaffMeta>;
  dealer: DealerState;
  workshopJobs: WorkshopJob[];
  wagonJobs: WagonJob[];
  ads: AdvertisingState;
  industrial: IndustrialContract[];
  rentals: RentalState;
  deployments: BaugleisDeployment[];
  depot: DepotState;
  stats: SimStats;
  milestones: Milestone[];
  gameOver: boolean;
  gameOverReason: string | null;
}

function parseArgs(argv: string[]): { days: number; seed: number | null } {
  let days = DEFAULT_DAYS;
  let seed: number | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if ((arg === '--days' || arg === '-d') && next) {
      const n = Number(next);
      if (Number.isFinite(n) && n > 0) days = Math.floor(n);
      i += 1;
    } else if (arg.startsWith('--days=')) {
      const n = Number(arg.slice('--days='.length));
      if (Number.isFinite(n) && n > 0) days = Math.floor(n);
    } else if ((arg === '--seed' || arg === '-s') && next) {
      const n = Number(next);
      if (Number.isFinite(n)) seed = n;
      i += 1;
    }
  }
  return { days, seed };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gameDay(tick: number): number {
  return Math.floor(Math.max(0, tick) / TICKS_PER_DAY) + 1;
}

function ensureDepotRoom(state: SimState, kind: 'loco' | 'wagon', extra: number): boolean {
  while (true) {
    const cap = kind === 'wagon' ? wagonBerthCap(state.depot) : locoBerthCap(state.depot);
    const used = kind === 'wagon' ? wagonUnitCount(state.wagons) : state.locomotives.length;
    if (used + extra <= cap) return true;
    const next = nextExpansion(state.depot, kind);
    if (!next || !canBuyDepotExpansion(state.depot, next, state.company.level)) return false;
    if (!trySpend(state, next.cost, `Depotausbau ${next.label}`)) return false;
    state.depot = purchaseDepotExpansion(state.depot, next);
  }
}

function noteCashDelta(state: SimState, before: number, after: number): void {
  const delta = after - before;
  if (delta > 0) state.stats.income += delta;
  else if (delta < 0) state.stats.expense += -delta;
}

function book(state: SimState, label: string, amount: number, atTick?: number): void {
  const tick = atTick ?? state.company.tick;
  state.bank = pushBooking(state.bank, {
    tick,
    createdAt: tickToIso(tick),
    label,
    amount,
  });
  noteCashDelta(state, 0, amount);
}

function trySpend(state: SimState, amount: number, label: string): boolean {
  if (amount <= 0) return true;
  if (!canSpend(state.company.balance, amount, state.bank.overdraftLimit)) return false;
  state.company = { ...state.company, balance: state.company.balance - amount };
  book(state, label, -amount);
  return true;
}

function credit(state: SimState, amount: number, label: string, atTick?: number): void {
  if (amount === 0) return;
  state.company = { ...state.company, balance: state.company.balance + amount };
  book(state, label, amount, atTick);
}

function addMilestone(state: SimState, kind: Milestone['kind'], detail: string): void {
  state.milestones.push({ day: gameDay(state.company.tick), tick: state.company.tick, kind, detail });
}

function emptyRental(tick: number): RentalState {
  return { wagonRentals: [], hireRequests: [], activeHires: [], lastProcessedTick: tick };
}

function emptyDealer(tick: number): DealerState {
  return migrateDealerState(
    { catalogVersion: 0, leases: [], usedStock: [], usedStockTick: 0 },
    tick,
  );
}

function resetStarterFleet(): { locos: Locomotive[]; drivers: Driver[]; wagons: Wagon[] } {
  const locos = SEED_LOCOMOTIVES.map((loco) => {
    const hydrated = ensureMaintenance({ ...loco });
    const status = isHuValid(hydrated) ? ('frei' as const) : ('stillgelegt' as const);
    return syncLocoStatus({ ...hydrated, status });
  });
  const drivers = SEED_DRIVERS.map((d) => ({
    ...d,
    status: 'verfuegbar' as const,
    recovery_hours_left: 0,
    shift_start: null,
  }));
  const wagons = SEED_WAGONS.map((w) =>
    w.status === 'wartung' ? { ...w, status: 'verfuegbar' as const } : { ...w },
  );
  return { locos, drivers, wagons };
}

function createState(): SimState {
  const company: Company = { ...SEED_COMPANY, tick: 0 };
  const { locos, drivers, wagons } = resetStarterFleet();
  saveRentalState(emptyRental(0));
  return {
    company,
    bank: {
      overdraftLimit: DEFAULT_OVERDRAFT,
      overdraftDailyRate: overdraftRateForLimit(DEFAULT_OVERDRAFT),
      loans: [],
      insurances: { gueterschaden: false, haftpflicht: false },
      bookings: seedBankBookings(company.balance, 0, company.updated_at),
      lastProcessedTick: 0,
      sanierungStartTick: null,
      insolvent: false,
    },
    locomotives: locos,
    drivers,
    wagons,
    orders: generateMarketOrders(0, undefined, standingFromCompany(company)),
    assignments: [],
    assignmentWagons: new Map(),
    chargedTripIds: [],
    staffMeta: ensureStaffMeta(drivers, {}),
    dealer: emptyDealer(0),
    workshopJobs: [],
    wagonJobs: [],
    ads: { campaigns: [] },
    industrial: defaultFreightContracts(),
    rentals: emptyRental(0),
    deployments: [],
    depot: ensureDepotFits(emptyDepotState(), locos.length, wagonUnitCount(wagons), 0),
    stats: {
      income: 0,
      expense: 0,
      trainKm: 0,
      tripsCompleted: 0,
      ordersBooked: 0,
      wagonsBought: 0,
      loansTaken: 0,
    },
    milestones: [],
    gameOver: false,
    gameOverReason: null,
  };
}

function debitSpotTripCosts(state: SimState, assignment: AssignmentWithDetails, atTick: number): void {
  const order = assignment.order;
  if (!order || isBaugleisEinsatz(order)) return;
  if (state.chargedTripIds.includes(assignment.id)) return;
  const fuel =
    assignment.locomotive?.fuel_type ??
    state.locomotives.find((l) => l.id === assignment.locomotive_id)?.fuel_type ??
    'diesel';
  const costs = calcOrderOperatingCosts(
    order,
    fuel,
    assignment.pdl_azf_daily && assignment.pdl_azf_daily > 0 ? 'pdl' : 'eigen',
  );
  state.chargedTripIds = [...state.chargedTripIds, assignment.id];
  if (costs.total <= 0) return;
  const pathEnergy = costs.pathCost + costs.energyCost;
  if (pathEnergy > 0) book(state, `Trasse/Energie ${order.order_number}`, -pathEnergy, atTick);
  if (costs.pdlCost > 0) book(state, `PDL AZF/RB ${order.order_number}`, -costs.pdlCost, atTick);
  state.company = { ...state.company, balance: state.company.balance - costs.total };
}

function completeDueWagonJobs(state: SimState, atTick: number): void {
  const due = state.wagonJobs.filter((job) => job.completeAtTick <= atTick);
  if (due.length === 0) return;
  state.wagonJobs = state.wagonJobs.filter((job) => job.completeAtTick > atTick);
  const now = tickToDate(atTick);
  for (const job of due) {
    state.wagons = state.wagons.map((w) => (w.id === job.wagonId ? applyCompletedJob(w, job.kind, now) : w));
  }
}

function completeDueWorkshopJobs(state: SimState, atTick: number): void {
  const due = state.workshopJobs.filter((job) => job.completeAtTick <= atTick);
  if (due.length === 0) return;
  state.workshopJobs = state.workshopJobs.filter((job) => job.completeAtTick > atTick);
  const date = tickToIso(atTick).slice(0, 10);
  state.locomotives = state.locomotives.map((loco) => {
    const job = due.find((j) => j.locoId === loco.id);
    return job ? completeWorkshopJob(loco, job.kind, date) : loco;
  });
}

function availableWagonCount(state: SimState, typeCode: string): number {
  return state.wagons
    .filter((w) => w.type_code === typeCode && w.status === 'verfuegbar')
    .reduce((s, w) => s + w.count, 0);
}

function allocateWagonPacks(state: SimState, order: Order): Wagon[] | null {
  const type = order.required_wagon_type;
  const need = order.required_wagon_count ?? 0;
  if (!type || need <= 0) return [];
  const packs = state.wagons.filter((w) => w.type_code === type && w.status === 'verfuegbar');
  const used: Wagon[] = [];
  let remaining = need;
  for (const pack of packs) {
    used.push(pack);
    remaining -= pack.count;
    if (remaining <= 0) break;
  }
  return remaining > 0 ? null : used;
}

function fleetBookValue(state: SimState): number {
  let value = 0;
  for (const loco of state.locomotives) {
    const offer = offerForLoco(loco);
    value += offer?.sellPrice ?? Math.round((loco.purchase_price ?? 0) * 0.48);
  }
  for (const wagon of state.wagons) {
    const offer = WAGON_OFFERS.find((o) => o.type_code === wagon.type_code);
    value += (offer?.sellPriceEach ?? 5_000) * wagon.count;
  }
  return value;
}

function liveLoanPrincipal(state: SimState): number {
  return state.bank.loans.reduce((s, l) => s + (Number(l.principal) || 0), 0);
}

function takeLoanIfNeeded(state: SimState): void {
  const balance = state.company.balance;
  const limit = state.bank.overdraftLimit;
  const stressed = balance < LOAN_TRIGGER || balance < -limit * 0.35 || state.bank.sanierungStartTick != null;
  if (!stressed) return;
  const room = MAX_LOAN_PRINCIPAL - liveLoanPrincipal(state);
  if (room < 25_000) return;
  const offer = LOAN_OFFERS[LOAN_OFFERS.length - 1];
  const amounts = [...LOAN_AMOUNTS]
    .filter((n) => n <= room && isLoanAmountUnlocked(n, state.company.level))
    .sort((a, b) => a - b);
  const amount = amounts.find((n) => n >= 50_000) ?? amounts[0];
  if (!amount || !offer) return;
  const dailyPayment = loanDailyPayment(amount, offer.termDays, offer.annualPct);
  state.company = { ...state.company, balance: state.company.balance + amount };
  state.bank = {
    ...pushBooking(state.bank, {
      tick: state.company.tick,
      createdAt: tickToIso(state.company.tick),
      label: `Darlehen ${offer.label}`,
      amount,
    }),
    loans: [
      ...state.bank.loans,
      {
        id: newNotificationId(),
        principal: amount,
        remaining: amount,
        termDays: offer.termDays,
        dailyPayment,
        interestLabel: offer.label,
        startedTick: state.company.tick,
      },
    ],
  };
  state.stats.income += amount;
  state.stats.loansTaken += 1;
}

function raiseDispoIfUnlocked(state: SimState): void {
  if (!canChangeOverdraftLimit(state.company.balance)) return;
  const level = state.company.level;
  let best = normalizeOverdraftLimit(state.bank.overdraftLimit);
  for (const tier of OVERDRAFT_TIERS) {
    if (isOverdraftTierUnlocked(tier, level) && tier > best) best = tier;
  }
  if (best === state.bank.overdraftLimit) return;
  state.bank = {
    ...state.bank,
    overdraftLimit: best,
    overdraftDailyRate: overdraftRateForLimit(best),
  };
  addMilestone(state, 'dispo', `Dispo-Stufe ${formatEuro(best)} (EVU-Level ${level})`);
}

function applyOrderXp(state: SimState, order: Order): void {
  const xp = grantCompanyXp(state.company, xpForCompletedOrder(order));
  state.company = xp.company;
  for (const lvl of xp.newLevels) addMilestone(state, 'level', `EVU-Level ${lvl}`);
  if (xp.newLevels.length > 0) {
    raiseDispoIfUnlocked(state);
    const standing = standingFromCompany(state.company);
    state.orders = refreshMarketOrders(state.orders, state.company.tick, standing);
  }
}

function enableInsurances(state: SimState): void {
  (Object.keys(INSURANCE_CATALOG) as InsuranceId[]).forEach((id) => {
    if (state.bank.insurances[id]) return;
    const cost = INSURANCE_CATALOG[id].dailyCost;
    if (state.company.balance < CASH_RESERVE) return;
    if (!trySpend(state, cost, `Versicherung ${INSURANCE_CATALOG[id].name}`)) return;
    state.bank = { ...state.bank, insurances: { ...state.bank.insurances, [id]: true } };
  });
}

function startWorkshop(
  state: SimState,
  loco: Locomotive,
  kind: WorkshopJobKind,
  channel: WorkshopChannel,
): boolean {
  const ready = ensureMaintenance(loco);
  if (canBookWorkshopJob(ready, state.workshopJobs, kind, channel, state.company.tick)) return false;
  const quote = quoteWorkshopJob(ready, kind, channel);
  const job: WorkshopJob = {
    id: newNotificationId(),
    locoId: loco.id,
    kind,
    channel,
    occupiesSlot: quote.occupiesSlot,
    queuedAtTick: state.company.tick,
    completeAtTick: state.company.tick + quote.durationTicks,
    cost: quote.cost,
    overdueMalus: quote.overdueMalus,
  };
  if (!trySpend(state, quote.cost, jobLabel(job))) return false;
  state.workshopJobs = [...state.workshopJobs, job];
  state.locomotives = state.locomotives.map((l) =>
    l.id === loco.id ? { ...ensureMaintenance(l), status: 'wartung' as const } : l,
  );
  if (quote.durationTicks <= 0) completeDueWorkshopJobs(state, state.company.tick);
  return true;
}

function maintainFleet(state: SimState): void {
  for (const loco of [...state.locomotives]) {
    const ready = ensureMaintenance(loco);
    if (ready.status === 'einsatz') continue;
    if (state.workshopJobs.some((j) => j.locoId === ready.id && j.completeAtTick > state.company.tick)) continue;

    const hu = fristFor(ready, 'HU');
    const zu = fristFor(ready, 'ZU');
    const f = fristFor(ready, 'F');
    const needsRepair = ready.status === 'wartung';

    const tryKind = (kind: WorkshopJobKind): boolean => {
      if (startWorkshop(state, ready, kind, 'eigen')) return true;
      return startWorkshop(state, ready, kind, 'fremdvergabe');
    };

    if (needsRepair) {
      tryKind('reparatur');
      continue;
    }
    if (hu.overdue || hu.daysRemaining < 40 || hu.remainingFraction < 0.08) {
      tryKind('HU');
      continue;
    }
    if (zu.overdue || zu.remainingFraction < 0.06) {
      tryKind('ZU');
      continue;
    }
    if (f.overdue || f.daysRemaining <= 2 || f.kmRemaining <= 1_500) {
      tryKind('F');
    }
  }
}

function startWagonJob(state: SimState, wagon: Wagon, kind: WagonJobKind): boolean {
  const rates = WAGON_JOB_RATES[kind];
  if (state.wagonJobs.some((j) => j.wagonId === wagon.id)) return false;
  if (!trySpend(state, rates.cost, rates.label)) return false;
  if (rates.ticks === 0) {
    state.wagons = state.wagons.map((w) =>
      w.id === wagon.id ? applyCompletedJob(w, kind, tickToDate(state.company.tick)) : w,
    );
    return true;
  }
  state.wagonJobs = [
    ...state.wagonJobs,
    {
      id: newWagonJobId(),
      wagonId: wagon.id,
      kind,
      queuedAtTick: state.company.tick,
      completeAtTick: state.company.tick + rates.ticks,
    },
  ];
  if (kind === 'rev') {
    state.wagons = state.wagons.map((w) => (w.id === wagon.id ? { ...w, status: 'wartung' as const } : w));
  }
  return true;
}

function maintainWagons(state: SimState): void {
  for (const wagon of [...state.wagons]) {
    if (wagon.status !== 'frist_abgelaufen') continue;
    const kind: WagonJobKind = wagon.frist_level >= 3 ? 'rev' : 'extend_6m';
    startWagonJob(state, wagon, kind);
  }
}

function buyMissingWagons(state: SimState, typeCode: string, missing: number): boolean {
  const offer = WAGON_OFFERS.find((o) => o.type_code === typeCode);
  if (!offer || missing <= 0) return false;
  const qty = missing <= 2 ? missing : Math.max(missing, 4);
  if (!ensureDepotRoom(state, 'wagon', qty)) return false;
  const quote = quoteWagonDeal(offer, qty);
  const buy = state.company.balance - quote.buyPrice >= CASH_RESERVE * 0.5;
  if (buy && trySpend(state, quote.buyPrice, `Kauf ${quote.qty}× ${offer.type_code}`)) {
    const pack = buildPurchasedWagons(offer, quote.qty);
    state.wagons = [...state.wagons, pack];
    state.stats.wagonsBought += quote.qty;
    return true;
  }
  const pack = buildPurchasedWagons(offer, quote.qty);
  state.wagons = [...state.wagons, pack];
  state.dealer = {
    ...state.dealer,
    leases: [
      ...state.dealer.leases,
      {
        id: newNotificationId(),
        kind: 'wagon',
        assetId: pack.id,
        label: `${quote.qty}× ${offer.type_code}`,
        dailyCost: quote.leaseDaily,
        startedTick: state.company.tick,
      },
    ],
  };
  state.stats.wagonsBought += quote.qty;
  return true;
}

function pickLoco(state: SimState, order: Order): Locomotive | undefined {
  const free = state.locomotives.filter((l) => isLocoDeployable(ensureMaintenance(l)));
  const pool = isBaugleisEinsatz(order) ? free.filter(isConstructionLoco) : free;
  const preferElectric = order.type === 'gueterverkehr';
  const ranked = [...pool].sort((a, b) => {
    if (preferElectric) {
      const score = (l: Locomotive) => (l.fuel_type === 'elektrik' ? 2 : l.fuel_type === 'dual' ? 1 : 0);
      return score(b) - score(a);
    }
    return (b.power_kw ?? 0) - (a.power_kw ?? 0);
  });
  return ranked[0];
}

function pickDrivers(state: SimState, order: Order): Driver[] {
  const need = requiredDriversFor(order);
  const free = state.drivers.filter(
    (d) =>
      d.status === 'verfuegbar' &&
      d.qualifications.some((q) => q.toLowerCase() === 'tf'),
  );
  return free.slice(0, need);
}

function orderNet(order: Order, fuel: Locomotive['fuel_type']): number {
  const costs = calcOrderOperatingCosts(order, fuel);
  if (isBaugleisEinsatz(order)) {
    const days = order.deployment_days ?? 1;
    return (costs.grossYield - costs.total) * days;
  }
  return costs.netProfit;
}

function assignOrder(state: SimState, order: Order, loco: Locomotive, drivers: Driver[], packs: Wagon[]): void {
  const tick = state.company.tick;
  const gameNowIso = tickToIso(tick);
  const updatedDrivers = drivers.map((d) => ({ ...d, status: 'im_einsatz' as const, shift_start: gameNowIso }));
  const azfPick = isBaugleisOrder(order)
    ? autoAzfChoice(
        order,
        state.drivers,
        updatedDrivers.map((d) => d.id),
      )
    : { source: 'pdl' as const, driver: null, pdlDaily: 0 };
  const updatedAzf =
    azfPick.driver && isBaugleisOrder(order)
      ? { ...azfPick.driver, status: 'im_einsatz' as const, shift_start: gameNowIso }
      : undefined;
  const updatedLoco: Locomotive = { ...loco, status: 'einsatz' };
  const updatedOrder: Order = { ...order, status: 'zugewiesen' };
  const assignment: AssignmentWithDetails = {
    id: newNotificationId(),
    order_id: order.id,
    locomotive_id: loco.id,
    driver_id: updatedDrivers[0].id,
    second_driver_id: updatedDrivers[1]?.id ?? null,
    azf_driver_id: updatedAzf?.id ?? null,
    pdl_azf_daily: isBaugleisOrder(order) && azfPick.source === 'pdl' ? azfPick.pdlDaily : 0,
    assigned_at: gameNowIso,
    status: isBaugleisEinsatz(order) ? 'aktiv' : 'geplant',
    order: updatedOrder,
    locomotive: updatedLoco,
    driver: updatedDrivers[0],
    second_driver: updatedDrivers[1],
    azf_driver: updatedAzf,
  };
  state.assignments = [assignment, ...state.assignments];
  state.orders = state.orders.map((o) => (o.id === order.id ? updatedOrder : o));
  state.locomotives = state.locomotives.map((l) => (l.id === loco.id ? updatedLoco : l));
  state.drivers = state.drivers.map((d) => {
    if (updatedDrivers.some((u) => u.id === d.id)) return updatedDrivers.find((u) => u.id === d.id)!;
    if (updatedAzf && d.id === updatedAzf.id) return updatedAzf;
    return d;
  });
  const packIds = new Set(packs.map((p) => p.id));
  state.wagons = state.wagons.map((w) => (packIds.has(w.id) ? { ...w, status: 'im_einsatz' as const } : w));
  state.assignmentWagons.set(assignment.id, [...packIds]);
  if (isBaugleisEinsatz(order) && updatedDrivers[1]) {
    state.deployments = startBaugleisDeployment({
      order: updatedOrder,
      locomotiveId: loco.id,
      driverIds: [updatedDrivers[0].id, updatedDrivers[1].id] as [string, string],
      assignmentId: assignment.id,
      tick,
      existing: state.deployments,
      fuelType: loco.fuel_type,
      pdlAzfDaily: assignment.pdl_azf_daily ?? 0,
      azfDriverId: assignment.azf_driver_id ?? null,
    });
  }
  state.stats.ordersBooked += 1;
}

function bookProfitableOrders(state: SimState): void {
  const now = tickToDate(state.company.tick);
  const open = state.orders
    .filter((o) => isOpenUnexpiredMarketOrder(o, now))
    .map((o) => {
      const loco = pickLoco(state, o);
      const fuel = loco?.fuel_type ?? 'diesel';
      return { order: o, net: orderNet(o, fuel) };
    })
    .filter((row) => row.net > 0)
    .sort((a, b) => b.net - a.net);

  const deployable = () => state.locomotives.filter((l) => isLocoDeployable(ensureMaintenance(l))).length;

  for (const { order } of open) {
    if (isBaugleisEinsatz(order) && deployable() < 3) continue;
    const loco = pickLoco(state, order);
    if (!loco) break;
    const drivers = pickDrivers(state, order);
    if (drivers.length < requiredDriversFor(order)) continue;

    let packs = allocateWagonPacks(state, order);
    if (!packs) {
      const type = order.required_wagon_type;
      const need = order.required_wagon_count ?? 0;
      if (type && need > 0) {
        const missing = need - availableWagonCount(state, type);
        buyMissingWagons(state, type, missing);
        packs = allocateWagonPacks(state, order);
      }
    }
    if (!packs) continue;
    assignOrder(state, order, loco, drivers, packs);
  }
}

function refreshMarketIfNeeded(state: SimState, force: boolean): void {
  const now = tickToDate(state.company.tick);
  const open = state.orders.filter((o) => isOpenUnexpiredMarketOrder(o, now)).length;
  if (!force && open >= 6) return;
  state.orders = refreshMarketOrders(state.orders, state.company.tick, standingFromCompany(state.company));
}

function acceptIndustrial(state: SimState): void {
  for (const contract of state.industrial) {
    if (contract.status !== 'available') continue;
    if (!canAcceptIndustrial(contract, state.company)) continue;
    const net = industrialPayableDaily(contract, state.company) - industrialDailyOperatingCost(contract);
    if (net <= 0) continue;
    state.industrial = acceptContract(state.industrial, contract.id, state.company.tick);
  }
}

function completeFinishedTrips(state: SimState): void {
  const tick = state.company.tick;
  for (const assignment of [...state.assignments]) {
    if (assignment.status !== 'aktiv' && assignment.status !== 'geplant') continue;
    if (isBaugleisEinsatz(assignment.order)) continue;
    if (assignmentProgress(assignment, tick) < 100) continue;

    state.assignments = state.assignments.map((a) =>
      a.id === assignment.id ? { ...a, status: 'abgeschlossen' as const } : a,
    );
    state.orders = state.orders.map((o) =>
      o.id === assignment.order_id ? { ...o, status: 'abgeschlossen' as const } : o,
    );
    state.locomotives = state.locomotives.map((l) =>
      l.id === assignment.locomotive_id
        ? syncLocoStatus({ ...ensureMaintenance(l), status: isHuValid(l) ? 'frei' : 'stillgelegt' })
        : l,
    );
    const secondId = assignment.second_driver_id;
    const azfId = assignment.azf_driver_id;
    state.drivers = state.drivers.map((d) =>
      d.id === assignment.driver_id || d.id === secondId || d.id === azfId
        ? { ...d, status: 'verfuegbar' as const, shift_start: null }
        : d,
    );
    const wagonIds = state.assignmentWagons.get(assignment.id) ?? [];
    if (wagonIds.length > 0) {
      const free = new Set(wagonIds);
      state.wagons = state.wagons.map((w) =>
        free.has(w.id) && w.status === 'im_einsatz' ? { ...w, status: 'verfuegbar' as const } : w,
      );
      state.assignmentWagons.delete(assignment.id);
    }

    debitSpotTripCosts(state, assignment, tick);
    const yieldAmt = assignment.order ? Number(assignment.order.yield) : 0;
    if (yieldAmt > 0) {
      const tkmPart = assignment.order?.tkm_revenue
        ? ` inkl. ${assignment.order.tkm_revenue.toLocaleString('de-DE')} € tkm`
        : '';
      credit(state, yieldAmt, `Frachterlös ${assignment.order?.order_number ?? ''}${tkmPart}`, tick);
    }
    const deadline = assignment.order?.deadline;
    const penaltyAmt = Number(assignment.order?.penalty) || 0;
    if (deadline && penaltyAmt > 0 && new Date(deadline).getTime() < tickToDate(tick).getTime()) {
      state.company = { ...state.company, balance: state.company.balance - penaltyAmt };
      book(state, `Pönale ${assignment.order?.order_number ?? ''}`, -penaltyAmt, tick);
    }
    if (assignment.order) {
      applyOrderXp(state, assignment.order);
      state.stats.trainKm += Number(assignment.order.distance_km) || 0;
      state.stats.tripsCompleted += 1;
    }
  }
}

function advanceOneTick(state: SimState): void {
  const prevTick = state.company.tick;
  const nextTick = prevTick + 1;
  const gameNowIso = tickToIso(nextTick);
  state.company = { ...state.company, tick: nextTick, updated_at: gameNowIso };

  const { drivers: tickedDrivers } = applyTickToDrivers(state.drivers, gameNowIso);
  let nextDrivers = tickedDrivers;
  const trained = completeDueTraining(nextDrivers, state.staffMeta, nextTick);
  nextDrivers = trained.drivers;
  state.staffMeta = trained.meta;
  state.drivers = nextDrivers;

  const { assignments: nextAssignments, activatedIds } = applyTickToAssignments(state.assignments);
  state.assignments = nextAssignments;
  for (const id of activatedIds) {
    const started = nextAssignments.find((a) => a.id === id);
    if (started) debitSpotTripCosts(state, started, nextTick);
  }

  completeDueWagonJobs(state, nextTick);
  completeDueWorkshopJobs(state, nextTick);

  if (isNewGameDay(prevTick, nextTick)) {
    const maint = processMaintenanceDay(state.locomotives, state.assignments, state.workshopJobs, nextTick);
    state.locomotives = maint.locos;
    state.dealer = ensureUsedStock(state.dealer, nextTick);
  }

  const beforeBank = state.company.balance;
  const bankTick = processBankTick(state.bank, state.company, nextTick);
  state.bank = bankTick.state;
  state.company = bankTick.company;
  noteCashDelta(state, beforeBank, state.company.balance);

  const adTick = processAdvertisingTick(state.ads, state.company, nextTick);
  state.ads = adTick.state;

  const beforeContracts = state.company.balance;
  const contractTick = processFreightContractsTick(state.industrial, state.company, prevTick, nextTick);
  state.company = contractTick.company;
  state.industrial = contractTick.list;
  if (state.company.balance !== beforeContracts) {
    book(state, 'Industrie-Frachtverträge', state.company.balance - beforeContracts, nextTick);
  }
  if (contractTick.operatingKm > 0) state.stats.trainKm += contractTick.operatingKm;

  const beforeLease = state.company.balance;
  const leaseTick = processLeasesTick(state.dealer, state.company, prevTick, nextTick);
  state.company = leaseTick.company;
  if (state.company.balance !== beforeLease) {
    book(state, 'Leasingraten', state.company.balance - beforeLease, nextTick);
  }

  const beforePay = state.company.balance;
  const pay = processPayrollTick(state.staffMeta, state.company, prevTick, nextTick);
  state.company = pay.company;
  if (state.company.balance !== beforePay) {
    book(state, 'Gehaltslauf', state.company.balance - beforePay, nextTick);
  }

  const beforeDepot = state.company.balance;
  const depotTick = processDepotTick(
    state.company,
    prevTick,
    nextTick,
    state.locomotives,
    state.wagons,
  );
  state.company = depotTick.company;
  if (state.company.balance !== beforeDepot) {
    book(state, 'Standort / Standgeld', state.company.balance - beforeDepot, nextTick);
  }

  const beforeRent = state.company.balance;
  const rentalTick = processRentalTick(state.rentals, state.company, nextDrivers, prevTick, nextTick);
  state.company = rentalTick.company;
  state.rentals = rentalTick.state;
  if (state.company.balance !== beforeRent) {
    book(state, 'Vermietung / Gestellung', state.company.balance - beforeRent, nextTick);
  }

  const einsatzTick = processBaugleisDeploymentsTick(state.deployments, state.company, prevTick, nextTick);
  state.company = einsatzTick.company;
  state.deployments = einsatzTick.list;
  if (einsatzTick.payout !== 0) book(state, 'Baugleis-Einsätze', einsatzTick.payout, nextTick);
  if (einsatzTick.operatingCost > 0) book(state, 'Baugleis Trasse/Energie/PDL', -einsatzTick.operatingCost, nextTick);

  const gameNowDate = tickToDate(nextTick);
  let nextOrders = state.orders;
  if (einsatzTick.completedOrderIds.length > 0) {
    const done = new Set(einsatzTick.completedOrderIds);
    nextOrders = nextOrders.map((o) => (done.has(o.id) ? { ...o, status: 'abgeschlossen' as const } : o));
    for (const assignment of state.assignments) {
      if (!done.has(assignment.order_id) || !assignment.order) continue;
      applyOrderXp(state, assignment.order);
      state.stats.trainKm += Number(assignment.order.distance_km) || 0;
      state.stats.tripsCompleted += 1;
    }
  }
  state.orders = purgeExpiredOpenOrders(nextOrders, gameNowDate);

  if (einsatzTick.completedAssignmentIds.length > 0) {
    const doneA = new Set(einsatzTick.completedAssignmentIds);
    state.assignments = state.assignments.map((a) =>
      doneA.has(a.id) ? { ...a, status: 'abgeschlossen' as const } : a,
    );
    for (const id of doneA) {
      const wagonIds = state.assignmentWagons.get(id) ?? [];
      if (wagonIds.length === 0) continue;
      const free = new Set(wagonIds);
      state.wagons = state.wagons.map((w) =>
        free.has(w.id) && w.status === 'im_einsatz' ? { ...w, status: 'verfuegbar' as const } : w,
      );
      state.assignmentWagons.delete(id);
    }
  }
  if (einsatzTick.freedLocoIds.length > 0) {
    const freedL = new Set(einsatzTick.freedLocoIds);
    state.locomotives = state.locomotives.map((l) =>
      freedL.has(l.id)
        ? syncLocoStatus({ ...ensureMaintenance(l), status: isHuValid(l) ? 'frei' : 'stillgelegt' })
        : l,
    );
  }
  if (einsatzTick.freedDriverIds.length > 0) {
    const freedD = new Set(einsatzTick.freedDriverIds);
    state.drivers = nextDrivers.map((d) =>
      freedD.has(d.id) ? { ...d, status: 'verfuegbar' as const, shift_start: null } : d,
    );
  }
}

function runAi(state: SimState, newDay: boolean): void {
  completeFinishedTrips(state);
  if (newDay) {
    takeLoanIfNeeded(state);
    raiseDispoIfUnlocked(state);
    enableInsurances(state);
    maintainFleet(state);
    maintainWagons(state);
    acceptIndustrial(state);
    refreshMarketIfNeeded(state, true);
  } else {
    refreshMarketIfNeeded(state, false);
  }
  bookProfitableOrders(state);
}

function applySanierung(state: SimState): void {
  const result = syncSanierung(state.bank, state.company.balance, state.company.tick, state.company.updated_at);
  if (!result.changed) return;
  state.bank = result.state;
  if (result.started) {
    addMilestone(
      state,
      'sanierung',
      `Insolvenz-Warnung (14-Tage-Frist): Konto ${formatEuro(state.company.balance)} unter Dispo ${formatEuro(state.bank.overdraftLimit)}`,
    );
  }
  if (result.failed || result.state.insolvent) {
    state.gameOver = true;
    state.gameOverReason = `Konto ${formatEuro(state.company.balance)} bleibt unter dem Dispo-Limit von ${formatEuro(state.bank.overdraftLimit)}. 14-tägige Sanierung abgelaufen.`;
    addMilestone(state, 'insolvenz', `Game Over — ${state.gameOverReason}`);
  }
}

function pad(label: string, width = 28): string {
  return label.padEnd(width, ' ');
}

function printReport(state: SimState, daysRequested: number, startBalance: number): void {
  const daysRun = Math.max(1, Math.min(daysRequested, gameDay(state.company.tick)));
  const profit = state.stats.income - state.stats.expense;
  const perDay = profit / daysRun;
  const perKm = state.stats.trainKm > 0 ? profit / state.stats.trainKm : 0;
  const fleet = fleetBookValue(state);
  const line = '─'.repeat(64);

  console.log('');
  console.log(line);
  console.log(' EVU-Balancing · Headless-Simulation');
  console.log(line);
  console.log(` ${pad('Spieltage')} ${daysRun} / ${daysRequested}  (Tick ${state.company.tick})`);
  console.log(` ${pad('Status')} ${state.gameOver ? 'GAME OVER' : 'laufend beendet'}`);
  console.log('');
  console.log(' Finale Bilanz');
  console.log(` ${pad('Kontostand')} ${formatEuro(state.company.balance)}  (Start ${formatEuro(startBalance)})`);
  console.log(` ${pad('Gesamteinnahmen')} ${formatEuro(state.stats.income)}`);
  console.log(` ${pad('Gesamtausgaben')} ${formatEuro(state.stats.expense)}`);
  console.log(` ${pad('Saldo (Ein − Aus)')} ${formatEuro(profit)}`);
  console.log(` ${pad('Fuhrpark-Wert (Verkauf)')} ${formatEuro(fleet)}`);
  console.log(` ${pad('EVU-Level / XP')} ${state.company.level}  ·  ${state.company.xp} / ${state.company.xp_next} XP`);
  console.log(` ${pad('Dispo-Rahmen')} ${formatEuro(state.bank.overdraftLimit)}`);
  console.log(` ${pad('Offene Darlehen')} ${state.bank.loans.length}  (${formatEuro(state.bank.loans.reduce((s, l) => s + l.remaining, 0))} Rest)`);
  console.log('');
  console.log(' Betrieb');
  console.log(` ${pad('Aufträge gebucht')} ${state.stats.ordersBooked}`);
  console.log(` ${pad('Fahrten abgeschlossen')} ${state.stats.tripsCompleted}`);
  console.log(` ${pad('Zug-Kilometer')} ${Math.round(state.stats.trainKm).toLocaleString('de-DE')} km`);
  console.log(` ${pad('Wagen beschafft')} ${state.stats.wagonsBought}`);
  console.log(` ${pad('Darlehen gezogen')} ${state.stats.loansTaken}`);
  console.log(` ${pad('Loks / Wagenpacks')} ${state.locomotives.length} / ${state.wagons.length}  (Depot ${locoBerthCap(state.depot)} Loks · ${wagonBerthCap(state.depot)} Wagen)`);
  console.log('');
  console.log(' Gewinnkennzahlen');
  console.log(` ${pad('Ø Gewinn / Spieltag')} ${formatEuro(Math.round(perDay))}`);
  console.log(` ${pad('Ø Gewinn / Zug-km')} ${formatEuro(Math.round(perKm * 100) / 100)}`);
  console.log('');
  console.log(' Meilensteine');
  const marks = state.milestones.filter((m) => m.kind === 'level' || m.kind === 'dispo');
  if (marks.length === 0) {
    console.log('  keine Level- oder Dispo-Aufstiege');
  } else {
    for (const m of marks) {
      console.log(`  Tag ${String(m.day).padStart(4, ' ')}  ${m.detail}`);
    }
  }
  console.log('');
  console.log(' Kritisches Balancing');
  const warnings = state.milestones.filter((m) => m.kind === 'sanierung' || m.kind === 'insolvenz');
  if (warnings.length === 0) {
    console.log('  keine Insolvenz-Warnung, kein Game Over');
  } else {
    for (const m of warnings) {
      console.log(`  Tag ${String(m.day).padStart(4, ' ')}  ${m.detail}`);
    }
  }
  if (state.gameOver && state.gameOverReason) {
    console.log(`  Ursache: ${state.gameOverReason}`);
  }
  console.log(line);
  console.log('');
}

function main(): void {
  const { days, seed } = parseArgs(process.argv.slice(2));
  if (seed != null) Math.random = mulberry32(seed);

  const state = createState();
  const startBalance = state.company.balance;
  const totalTicks = days * TICKS_PER_DAY;

  console.log(
    `Starte Balancing-Simulation: ${days} Spieltage (${totalTicks} Stunden-Ticks)${seed != null ? `, Seed ${seed}` : ''} …`,
  );

  for (let i = 0; i < totalTicks; i += 1) {
    const newDay = state.company.tick % TICKS_PER_DAY === 0;
    runAi(state, newDay);
    advanceOneTick(state);
    completeFinishedTrips(state);
    applySanierung(state);

    if (state.gameOver) break;
    if ((i + 1) % (TICKS_PER_DAY * 30) === 0) {
      const day = gameDay(state.company.tick);
      process.stdout.write(
        `  Tag ${day}: Konto ${formatEuro(state.company.balance)} · Lvl ${state.company.level} · Fahrten ${state.stats.tripsCompleted}\n`,
      );
    }
  }

  printReport(state, days, startBalance);
}

main();
