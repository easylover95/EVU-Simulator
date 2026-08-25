import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_OVERDRAFT,
  INSURANCE_BASE_DAILY,
  OVERDRAFT_DAILY_RATE,
  processBankTick,
  type BankState,
} from '../src/lib/bank';
import { processDepotTick } from '../src/lib/dailyFixedCosts';
import {
  buildContractRunOrder,
  contractTripYield,
  defaultFreightContracts,
  type IndustrialContract,
} from '../src/lib/freightContracts';
import { ensureStaffMeta, processPayrollTick, salaryFor, type StaffMeta } from '../src/lib/jobcenter';
import { calcOrderOperatingCosts } from '../src/lib/operatingCosts';
import { computeSpotYield } from '../src/lib/orderMarket';
import { hireNachschulungFee } from '../src/lib/personal';
import { grantCompanyXp, xpForCompletedOrder } from '../src/lib/progression';
import { SEED_COMPANY, SEED_DRIVERS, SEED_LOCOMOTIVES, SEED_ORDERS, SEED_WAGONS } from '../src/lib/seed';
import { TICKS_PER_DAY } from '../src/lib/storage';
import type { Company, Locomotive, Order, Wagon } from '../src/lib/supabase';
import { WAGON_JOB_RATES } from '../src/lib/wagonJobs';
import { clearLocoFault, locoHasFault, processMaintenanceDay, quoteWorkshopJob, revisedMaintenance } from '../src/lib/workshop';

const DAYS = 365;
const OUT_DIR = join(process.cwd(), 'simulation', 'output');
const MAINTENANCE_DAYS = new Set([90, 180, 270, 360]);
const WAGON_REVISION_DAYS = new Set([180, 360]);
const SIMULATION_RANDOM_SEED = 0x5EED2026;

interface Ledger {
  contractRevenue: number;
  spotRevenue: number;
  pathEnergy: number;
  payroll: number;
  depot: number;
  insurance: number;
  maintenance: number;
  wagonRevision: number;
  quickPay: number;
  hiring: number;
  unplannedRepairs: number;
}

interface DailySnapshot {
  day: number;
  level: number;
  reputation: number;
  balance: number;
  revenue: number;
  operatingCosts: number;
  fixedCosts: number;
  maintenanceCosts: number;
  tkm: number;
  unplannedRepairCosts: number;
  unavailableLocomotives: number;
}

interface RiskEvent {
  day: number;
  locomotiveId: string;
  fault: string;
  repairCost: number;
  downtimeDays: number;
  lostTrips: number;
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

function euro(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

function createBankState(): BankState {
  return {
    overdraftLimit: DEFAULT_OVERDRAFT,
    overdraftDailyRate: OVERDRAFT_DAILY_RATE,
    loans: [],
    insurances: { gueterschaden: false, haftpflicht: false },
    bookings: [],
    lastProcessedTick: 0,
    sanierungStartTick: null,
    insolvent: false,
  };
}

function activeFleet(): { locomotives: Locomotive[]; wagons: Wagon[] } {
  return {
    locomotives: SEED_LOCOMOTIVES.map((loco) => ({
      ...loco,
      status: 'einsatz',
      maintenance: revisedMaintenance(),
    })),
    wagons: SEED_WAGONS.map((wagon) => ({ ...wagon, status: 'im_einsatz' })),
  };
}

function createStaff(): Record<string, StaffMeta> {
  const meta = ensureStaffMeta(SEED_DRIVERS, {});
  meta['sim-quickpay-tf'] = {
    driverId: 'sim-quickpay-tf',
    role: 'tf',
    rank: 1,
    salary: salaryFor('tf', 1),
    trainingUntilTick: null,
    xp: 0,
    seriesIds: ['br218'],
    trainingKind: null,
    trainingSeriesId: null,
  };
  meta['sim-wagenpruefer'] = {
    driverId: 'sim-wagenpruefer',
    role: 'wagenpruefer',
    rank: 1,
    salary: salaryFor('wagenpruefer', 1),
    trainingUntilTick: null,
    xp: 0,
    seriesIds: [],
    trainingKind: null,
    trainingSeriesId: null,
  };
  return meta;
}

function requireCoilContract(): IndustrialContract {
  const coil = defaultFreightContracts().find((contract) => contract.id === 'fc-ruhr-coil');
  assert(coil, 'Der Starter-Rahmenvertrag fc-ruhr-coil fehlt.');
  return coil;
}

function buildSpotOrder(day: number, company: Company): Order {
  const source = SEED_ORDERS.find((order) => order.required_wagon_type === 'Eanos');
  assert(source, 'Der Eanos-Starterauftrag fehlt.');
  const priced = computeSpotYield('gueterverkehr', source.distance_km, source.weight_t, 'energie', company);
  return {
    ...source,
    id: `sim-eanos-${day}`,
    order_number: `SIM-EANOS-${String(day).padStart(3, '0')}`,
    yield: priced.yield,
    status: 'offen',
  };
}

function addCost(ledger: Ledger, id: keyof Ledger, amount: number): void {
  ledger[id] += Math.max(0, Math.round(amount));
}

function addIncome(ledger: Ledger, id: 'contractRevenue' | 'spotRevenue', amount: number): void {
  ledger[id] += Math.max(0, Math.round(amount));
}

function csv(rows: DailySnapshot[]): string {
  const header = 'Tag;Level;Bekanntheit;Kontostand;Erlöse;Betriebskosten;Fixkosten;Wartungskosten;Tonnenkilometer;UngeplanteReparaturen;NichtVerfügbareLoks';
  const body = rows.map((row) => [
    row.day,
    row.level,
    row.reputation,
    row.balance,
    row.revenue,
    row.operatingCosts,
    row.fixedCosts,
    row.maintenanceCosts,
    row.tkm,
    row.unplannedRepairCosts,
    row.unavailableLocomotives,
  ].join(';'));
  return [header, ...body].join('\n') + '\n';
}

function run(): void {
  mkdirSync(OUT_DIR, { recursive: true });

  const startCapital = SEED_COMPANY.balance;
  let company: Company = { ...SEED_COMPANY };
  const bank = createBankState();
  const staff = createStaff();
  const { locomotives, wagons } = activeFleet();
  const coil = requireCoilContract();
  const ledger: Ledger = {
    contractRevenue: 0,
    spotRevenue: 0,
    pathEnergy: 0,
    payroll: 0,
    depot: 0,
    insurance: 0,
    maintenance: 0,
    wagonRevision: 0,
    quickPay: 0,
    hiring: 0,
    unplannedRepairs: 0,
  };
  const daily: DailySnapshot[] = [];
  const riskEvents: RiskEvent[] = [];
  const random = createSeededRandom(SIMULATION_RANDOM_SEED);
  const unavailableUntilDay = new Map<string, number>();
  const seriesProfit = new Map<string, number>();
  const classProfit = new Map<string, number>();
  let tkm = 0;
  let totalTonsMoved = 0;
  let completedTrips = 0;
  let contractTrips = 0;
  let spotTrips = 0;
  let contractRenewals = 0;
  let maintenanceJobs = 0;
  let wagonRevisionJobs = 0;
  let lowestBalance = startCapital;
  let firstNegativeDay: number | null = null;

  // Day 1 personnel decision: one TF with one missing series is hired and instantly trained.
  const quickPayHire = 2_450;
  const quickPayTraining = hireNachschulungFee(1);
  company = { ...company, balance: company.balance - quickPayHire - quickPayTraining };
  addCost(ledger, 'hiring', quickPayHire);
  addCost(ledger, 'quickPay', quickPayTraining);

  for (let day = 1; day <= DAYS; day += 1) {
    const prevTick = (day - 1) * TICKS_PER_DAY;
    const nextTick = day * TICKS_PER_DAY;
    company = { ...company, tick: nextTick };

    if (day === 1 || (day - 1) % coil.periodDays === 0) contractRenewals += 1;

    for (let index = 0; index < locomotives.length; index += 1) {
      const loco = locomotives[index];
      const until = unavailableUntilDay.get(loco.id);
      if (until != null && day > until) {
        locomotives[index] = { ...clearLocoFault(loco), status: 'einsatz' };
        unavailableUntilDay.delete(loco.id);
      }
    }

    const previouslyFaulty = new Set(locomotives.filter(locoHasFault).map((loco) => loco.id));
    const maintenanceTick = processMaintenanceDay(locomotives, [], [], nextTick, company.level, random);
    for (let index = 0; index < locomotives.length; index += 1) {
      locomotives[index] = maintenanceTick.locos[index] ?? locomotives[index];
    }

    let dayMaintenance = 0;
    let dayUnplannedRepairs = 0;
    for (const loco of locomotives) {
      if (previouslyFaulty.has(loco.id) || !locoHasFault(loco)) continue;
      const repair = quoteWorkshopJob(loco, 'reparatur', 'fremdvergabe');
      company = { ...company, balance: company.balance - repair.cost };
      addCost(ledger, 'unplannedRepairs', repair.cost);
      dayMaintenance += repair.cost;
      dayUnplannedRepairs += repair.cost;
      unavailableUntilDay.set(loco.id, day + repair.durationDays - 1);
      riskEvents.push({
        day,
        locomotiveId: loco.id,
        fault: loco.maintenance?.fault?.kind ?? 'unbekannt',
        repairCost: repair.cost,
        downtimeDays: repair.durationDays,
        lostTrips: repair.durationDays,
      });
    }

    const coilOrder = buildContractRunOrder(coil, nextTick, company);
    const spotOrder = buildSpotOrder(day, company);
    const trips = [
      { key: 'BR 218 · Coil-Rahmenvertrag', order: coilOrder, source: 'contract' as const, fuel: locomotives[0].fuel_type, available: !unavailableUntilDay.has(locomotives[0].id) },
      { key: 'BR 218 · Eanos-Spotverkehr', order: spotOrder, source: 'spot' as const, fuel: locomotives[1].fuel_type, available: !unavailableUntilDay.has(locomotives[1].id) },
    ].filter((trip) => trip.available);

    let dayRevenue = 0;
    let dayOperating = 0;
    let dayTkm = 0;
    for (const trip of trips) {
      const revenue = trip.source === 'contract'
        ? contractTripYield(coil, company)
        : Number(trip.order.yield) || 0;
      const pricedOrder = { ...trip.order, yield: revenue };
      const costs = calcOrderOperatingCosts(pricedOrder, trip.fuel, 'eigen');
      const contribution = revenue - costs.total;
      company = { ...company, balance: company.balance + contribution };
      dayRevenue += revenue;
      dayOperating += costs.total;
      dayTkm += (Number(pricedOrder.distance_km) || 0) * (Number(pricedOrder.weight_t) || 0);
      totalTonsMoved += Number(pricedOrder.weight_t) || 0;
      completedTrips += 1;
      if (trip.source === 'contract') {
        contractTrips += 1;
        addIncome(ledger, 'contractRevenue', revenue);
      } else {
        spotTrips += 1;
        addIncome(ledger, 'spotRevenue', revenue);
      }
      addCost(ledger, 'pathEnergy', costs.total);
      seriesProfit.set(trip.key, (seriesProfit.get(trip.key) ?? 0) + contribution);
      classProfit.set('BR 218', (classProfit.get('BR 218') ?? 0) + contribution);
      company = grantCompanyXp(company, xpForCompletedOrder(pricedOrder)).company;
    }
    tkm += dayTkm;

    if (MAINTENANCE_DAYS.has(day)) {
      for (const loco of locomotives) {
        const quote = quoteWorkshopJob(loco, 'F', 'fremdvergabe');
        company = { ...company, balance: company.balance - quote.cost };
        addCost(ledger, 'maintenance', quote.cost);
        dayMaintenance += quote.cost;
        maintenanceJobs += 1;
      }
    }
    if (WAGON_REVISION_DAYS.has(day)) {
      for (const wagon of wagons) {
        const revision = WAGON_JOB_RATES.rev.cost;
        company = { ...company, balance: company.balance - revision };
        addCost(ledger, 'wagonRevision', revision);
        dayMaintenance += revision;
        wagonRevisionJobs += 1;
      }
    }

    const beforeBank = company.balance;
    const bankTick = processBankTick(bank, company, nextTick);
    company = bankTick.company;
    const bankCost = beforeBank - company.balance;
    assert.equal(bankCost, INSURANCE_BASE_DAILY, 'Ohne Kredit und Dispo muss nur die Versicherungsgrundpauschale anfallen.');
    addCost(ledger, 'insurance', bankCost);
    Object.assign(bank, bankTick.state);

    const beforePayroll = company.balance;
    company = processPayrollTick(staff, company, prevTick, nextTick).company;
    const payrollCost = beforePayroll - company.balance;
    addCost(ledger, 'payroll', payrollCost);

    const beforeDepot = company.balance;
    company = processDepotTick(company, prevTick, nextTick, locomotives, wagons).company;
    const depotCost = beforeDepot - company.balance;
    addCost(ledger, 'depot', depotCost);

    lowestBalance = Math.min(lowestBalance, company.balance);
    if (company.balance < 0 && firstNegativeDay == null) firstNegativeDay = day;
    daily.push({
      day,
      level: company.level,
      reputation: company.reputation,
      balance: company.balance,
      revenue: dayRevenue,
      operatingCosts: dayOperating,
      fixedCosts: bankCost + payrollCost + depotCost,
      maintenanceCosts: dayMaintenance,
      tkm: dayTkm,
      unplannedRepairCosts: dayUnplannedRepairs,
      unavailableLocomotives: unavailableUntilDay.size,
    });
  }

  const totalRevenue = ledger.contractRevenue + ledger.spotRevenue;
  const totalCosts = ledger.pathEnergy + ledger.payroll + ledger.depot + ledger.insurance + ledger.maintenance + ledger.wagonRevision + ledger.unplannedRepairs + ledger.quickPay + ledger.hiring;
  const reconciliation = startCapital + totalRevenue - totalCosts;
  assert.equal(company.balance, reconciliation, 'Der Kontostand muss mit dem Ergebnis-Ledger übereinstimmen.');
  const routes = [...seriesProfit.entries()]
    .map(([route, contribution]) => ({ route, contribution }))
    .sort((a, b) => b.contribution - a.contribution);
  const series = [...classProfit.entries()]
    .map(([seriesId, contribution]) => ({ seriesId, contribution }))
    .sort((a, b) => b.contribution - a.contribution);
  const result = {
    scenario: 'starter-freight-baseline-365-v2-hard-mode',
    days: DAYS,
    startCapital,
    endCapital: company.balance,
    netCashChange: company.balance - startCapital,
    lowestBalance,
    firstNegativeDay,
    financiallyStable: company.balance >= 0 && !bank.insolvent,
    finalLevel: company.level,
    finalReputation: company.reputation,
    totalRevenue,
    totalCosts,
    operatingProfitBeforeFixedCosts: totalRevenue - ledger.pathEnergy,
    operatingResultAfterAllCosts: totalRevenue - totalCosts,
    transport: {
      completedTrips,
      contractTrips,
      spotTrips,
      contractRenewals,
      totalTkm: tkm,
      totalTonsMoved,
    },
    costs: ledger,
    risks: {
      randomSeed: SIMULATION_RANDOM_SEED,
      unplannedFaultCount: riskEvents.length,
      unplannedRepairCost: ledger.unplannedRepairs,
      totalDowntimeDays: riskEvents.reduce((sum, event) => sum + event.downtimeDays, 0),
      totalLostTrips: riskEvents.reduce((sum, event) => sum + event.lostTrips, 0),
      events: riskEvents,
    },
    maintenance: {
      scheduledFJobs: maintenanceJobs,
      wagonRevisionJobs,
      externalFJobCost: quoteWorkshopJob(locomotives[0], 'F', 'fremdvergabe').cost,
      wagonRevisionUnitCost: WAGON_JOB_RATES.rev.cost,
    },
    series,
    routes,
    reconciliation,
  };

  writeFileSync(join(OUT_DIR, 'freight-year-365.json'), JSON.stringify(result, null, 2) + '\n', 'utf8');
  writeFileSync(join(OUT_DIR, 'freight-year-365-daily.csv'), csv(daily), 'utf8');

  console.log(JSON.stringify(result, null, 2));
  console.log(`\nJahressimulation abgeschlossen: ${euro(startCapital)} → ${euro(company.balance)} | ${completedTrips} Fahrten | ${tkm.toLocaleString('de-DE')} tkm`);
}

run();
