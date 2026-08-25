import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_OVERDRAFT,
  INSURANCE_BASE_DAILY,
  LOAN_OFFERS,
  OVERDRAFT_DAILY_RATE,
  checkLoanCredit,
  loanDailyPayment,
  loanPaymentBreakdown,
  processBankTick,
  type BankLoan,
  type BankState,
} from '../src/lib/bank';
import { LOCO_OFFERS, quoteWagonDeal, wagonOfferByTypeCode } from '../src/lib/dealer';
import { processDepotTick } from '../src/lib/dailyFixedCosts';
import { buildContractRunOrder, contractTripYield, defaultFreightContracts, type IndustrialContract } from '../src/lib/freightContracts';
import { ensureStaffMeta, processPayrollTick, salaryFor, type StaffMeta } from '../src/lib/jobcenter';
import { calcOrderOperatingCosts } from '../src/lib/operatingCosts';
import { computeSpotYield } from '../src/lib/orderMarket';
import { fleetBookValue } from '../src/lib/financialStatements';
import { hireNachschulungFee } from '../src/lib/personal';
import { grantCompanyXp, xpForCompletedOrder } from '../src/lib/progression';
import { SEED_COMPANY, SEED_DRIVERS, SEED_LOCOMOTIVES, SEED_ORDERS, SEED_WAGONS } from '../src/lib/seed';
import { TICKS_PER_DAY } from '../src/lib/storage';
import type { Company, FuelType, Locomotive, Order, Wagon } from '../src/lib/supabase';
import { WAGON_JOB_RATES } from '../src/lib/wagonJobs';
import { clearLocoFault, locoHasFault, processMaintenanceDay, quoteWorkshopJob, revisedMaintenance } from '../src/lib/workshop';

const DAYS = 365;
const OUT_DIR = join(process.cwd(), 'simulation', 'output');
const FIRST_INVESTMENT_THRESHOLD = 600_000;
const SECOND_INVESTMENT_THRESHOLD = 850_000;
const LOAN_PRINCIPAL = 250_000;
const GROWTH_LOAN_TERM_DAYS = 180;
const SIMULATION_RANDOM_SEED = 0x5EED2026;
const TF_HIRING_COST = 2_450;

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
  locomotiveInvestment: number;
  wagonInvestment: number;
  loanProceeds: number;
  loanInterest: number;
  loanPrincipal: number;
  unplannedRepairs: number;
}

interface FleetAsset {
  locomotive: Locomotive;
  series: string;
  acquiredDay: number;
  route: 'coil' | 'eanos' | 'bulk' | 'intermodal';
  unavailableUntilDay: number | null;
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
  investmentCosts: number;
  loanService: number;
  tkm: number;
  locomotiveCount: number;
  wagonUnits: number;
  activeTrips: number;
  unplannedRepairCosts: number;
  unavailableLocomotives: number;
}

interface RiskEvent {
  day: number;
  locomotiveId: string;
  series: string;
  fault: string;
  repairCost: number;
  downtimeDays: number;
  lostTrips: number;
}

interface InvestmentEvent {
  day: number;
  kind: 'credit-and-br232' | 'br140';
  balanceBefore: number;
  loanProceeds: number;
  locomotiveCost: number;
  wagonCost: number;
  personnelCost: number;
  balanceAfter: number;
  fleetSize: number;
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
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

function add(ledger: Ledger, key: keyof Ledger, amount: number): void {
  ledger[key] += Math.max(0, Math.round(amount));
}

function makeLoco(offerId: string, acquiredDay: number): Locomotive {
  const offer = LOCO_OFFERS.find((row) => row.id === offerId);
  assert(offer, `Lokangebot ${offerId} fehlt.`);
  return {
    id: `dynamic-${offer.id}-${acquiredDay}`,
    designation: offer.designation,
    name: offer.displayName,
    status: 'einsatz',
    fuel_type: offer.fuel_type,
    fuel_level: 100,
    brake_pct: 100,
    last_service: '2026-08-25',
    power_kw: offer.power_kw,
    max_speed: offer.max_speed,
    weight_t: offer.weight_t,
    created_at: '2026-08-25T00:00:00.000Z',
    country_packages: ['D'],
    maintenance: revisedMaintenance(),
  };
}

function makeWagon(typeCode: string, count: number, acquiredDay: number): { wagon: Wagon; cost: number } {
  const offer = wagonOfferByTypeCode(typeCode);
  assert(offer, `Wagenangebot ${typeCode} fehlt.`);
  const quote = quoteWagonDeal(offer, count);
  return {
    cost: quote.buyPrice,
    wagon: {
      id: `dynamic-${typeCode.toLowerCase()}-${acquiredDay}`,
      type_code: offer.type_code,
      type_name: offer.type_name,
      category: offer.category,
      capacity_t: offer.capacity_t,
      brake_position: offer.brake_position,
      tare_weight_t: offer.tare_weight_t,
      length_mm: offer.length_mm,
      status: 'im_einsatz',
      frist_level: 1,
      frist_date: '2027-08-25',
      count,
      created_at: '2026-08-25T00:00:00.000Z',
    },
  };
}

function createStaff(): Record<string, StaffMeta> {
  const meta = ensureStaffMeta(SEED_DRIVERS, {});
  meta['dynamic-initial-tf'] = {
    driverId: 'dynamic-initial-tf', role: 'tf', rank: 1, salary: salaryFor('tf', 1), trainingUntilTick: null,
    xp: 0, seriesIds: ['br218'], trainingKind: null, trainingSeriesId: null,
  };
  meta['dynamic-wagenpruefer'] = {
    driverId: 'dynamic-wagenpruefer', role: 'wagenpruefer', rank: 1, salary: salaryFor('wagenpruefer', 1), trainingUntilTick: null,
    xp: 0, seriesIds: [], trainingKind: null, trainingSeriesId: null,
  };
  return meta;
}

function addTf(staff: Record<string, StaffMeta>, id: string, seriesId: string): void {
  staff[id] = {
    driverId: id, role: 'tf', rank: 1, salary: salaryFor('tf', 1), trainingUntilTick: null,
    xp: 0, seriesIds: [seriesId], trainingKind: null, trainingSeriesId: null,
  };
}

function requireCoilContract(): IndustrialContract {
  const result = defaultFreightContracts().find((contract) => contract.id === 'fc-ruhr-coil');
  assert(result, 'Der Coil-Startervertrag fehlt.');
  return result;
}

function spotOrder(input: { day: number; company: Company; id: string; number: string; title: string; distanceKm: number; weightT: number; category: 'energie' | 'intermodal'; wagonType: string; wagonCount: number }): Order {
  const priced = computeSpotYield('gueterverkehr', input.distanceKm, input.weightT, input.category, input.company);
  return {
    id: input.id,
    order_number: input.number,
    type: 'gueterverkehr',
    title: input.title,
    origin: 'Simulation', destination: 'Simulation',
    distance_km: input.distanceKm, weight_t: input.weightT, yield: priced.yield, penalty: 0,
    deadline: '2027-08-25T00:00:00.000Z', status: 'offen', notes: 'Dynamische Skalierungssimulation',
    min_brh: 62, required_wagon_type: input.wagonType, required_wagon_count: input.wagonCount,
    sperrpause_start: null, sperrpause_end: null, penalty_per_min: 0,
    created_at: '2026-08-25T00:00:00.000Z', customer: 'Simulation', customer_id: input.id,
    origin_country: 'D', destination_country: 'D', requires_etcs: false, contract_id: null,
    deployment_days: null, daily_rate: null, required_drivers: 1,
  };
}

function starterFleet(): { fleet: FleetAsset[]; wagons: Wagon[] } {
  return {
    fleet: SEED_LOCOMOTIVES.map((loco, index) => ({
      locomotive: { ...loco, status: 'einsatz', maintenance: revisedMaintenance() },
      series: 'BR 218', acquiredDay: 0, route: index === 0 ? 'coil' : 'eanos', unavailableUntilDay: null,
    })),
    wagons: SEED_WAGONS.map((wagon) => ({ ...wagon, status: 'im_einsatz' })),
  };
}

function csv(rows: DailySnapshot[]): string {
  const header = 'Tag;Level;Bekanntheit;Kontostand;Erlöse;Betriebskosten;Fixkosten;Wartungskosten;Investitionen;Kreditdienst;Tonnenkilometer;Lokanzahl;Wageneinheiten;AktiveFahrten;UngeplanteReparaturen;NichtVerfügbareLoks';
  return [header, ...rows.map((row) => [row.day, row.level, row.reputation, row.balance, row.revenue, row.operatingCosts, row.fixedCosts, row.maintenanceCosts, row.investmentCosts, row.loanService, row.tkm, row.locomotiveCount, row.wagonUnits, row.activeTrips, row.unplannedRepairCosts, row.unavailableLocomotives].join(';'))].join('\n') + '\n';
}

function run(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const startCapital = SEED_COMPANY.balance;
  let company: Company = { ...SEED_COMPANY };
  const bank = createBankState();
  const staff = createStaff();
  const { fleet, wagons } = starterFleet();
  const coil = requireCoilContract();
  const ledger: Ledger = {
    contractRevenue: 0, spotRevenue: 0, pathEnergy: 0, payroll: 0, depot: 0, insurance: 0,
    maintenance: 0, wagonRevision: 0, quickPay: 0, hiring: 0, locomotiveInvestment: 0,
    wagonInvestment: 0, loanProceeds: 0, loanInterest: 0, loanPrincipal: 0, unplannedRepairs: 0,
  };
  const daily: DailySnapshot[] = [];
  const investments: InvestmentEvent[] = [];
  const riskEvents: RiskEvent[] = [];
  const random = createSeededRandom(SIMULATION_RANDOM_SEED);
  const growthLoanOffer = LOAN_OFFERS.find((offer) => offer.termDays === GROWTH_LOAN_TERM_DAYS);
  assert(growthLoanOffer, 'Das verschärfte 180-Tage-Kreditangebot fehlt.');
  const routeContribution = new Map<string, number>();
  const seriesContribution = new Map<string, number>();
  let totalTkm = 0;
  let totalTons = 0;
  let completedTrips = 0;
  let lowestBalance = startCapital;
  let firstNegativeDay: number | null = null;

  // Initial operations staff: one additional BR-218 Tf and one Wagenprüfer.
  company = { ...company, balance: company.balance - TF_HIRING_COST - hireNachschulungFee(1) };
  add(ledger, 'hiring', TF_HIRING_COST);
  add(ledger, 'quickPay', hireNachschulungFee(1));

  for (let day = 1; day <= DAYS; day += 1) {
    const prevTick = (day - 1) * TICKS_PER_DAY;
    const nextTick = day * TICKS_PER_DAY;
    company = { ...company, tick: nextTick };
    let dayInvestments = 0;

    if (investments.length === 0 && company.level >= 5 && company.balance >= FIRST_INVESTMENT_THRESHOLD) {
      const before = company.balance;
      const br232 = LOCO_OFFERS.find((offer) => offer.id === 'br232');
      assert(br232, 'BR 232 fehlt im Händlerkatalog.');
      const wagonsFor232 = makeWagon('Eanos', 12, day);
      const creditCheck = checkLoanCredit({
        requestedPrincipal: LOAN_PRINCIPAL,
        cashBalance: company.balance,
        fleetBookValue: fleetBookValue(fleet.map((asset) => asset.locomotive), wagons, null),
        outstandingLoanPrincipal: bank.loans.reduce((sum, loan) => sum + loan.principalRemaining, 0),
        overdraftUsed: Math.max(0, -company.balance),
      });
      if (creditCheck.approved) {
        const dailyPayment = loanDailyPayment(LOAN_PRINCIPAL, growthLoanOffer.termDays, growthLoanOffer.annualPct);
      const totalRepayment = dailyPayment * growthLoanOffer.termDays;
      const loan: BankLoan = {
        id: `sim-loan-${day}`, principal: LOAN_PRINCIPAL, remaining: totalRepayment,
        principalRemaining: LOAN_PRINCIPAL, interestRemaining: totalRepayment - LOAN_PRINCIPAL,
        termDays: growthLoanOffer.termDays, dailyPayment, interestLabel: growthLoanOffer.label, startedTick: nextTick,
      };
      bank.loans.push(loan);
      company = { ...company, balance: company.balance + LOAN_PRINCIPAL };
      add(ledger, 'loanProceeds', LOAN_PRINCIPAL);
      company = { ...company, balance: company.balance - br232.buyPrice - wagonsFor232.cost - TF_HIRING_COST - hireNachschulungFee(1) };
      add(ledger, 'locomotiveInvestment', br232.buyPrice);
      add(ledger, 'wagonInvestment', wagonsFor232.cost);
      add(ledger, 'hiring', TF_HIRING_COST);
      add(ledger, 'quickPay', hireNachschulungFee(1));
      dayInvestments = br232.buyPrice + wagonsFor232.cost + TF_HIRING_COST + hireNachschulungFee(1);
      fleet.push({ locomotive: makeLoco('br232', day), series: 'BR 232', acquiredDay: day, route: 'bulk', unavailableUntilDay: null });
      wagons.push(wagonsFor232.wagon);
      addTf(staff, `dynamic-br232-tf-${day}`, 'br232');
      investments.push({ day, kind: 'credit-and-br232', balanceBefore: before, loanProceeds: LOAN_PRINCIPAL, locomotiveCost: br232.buyPrice, wagonCost: wagonsFor232.cost, personnelCost: TF_HIRING_COST + hireNachschulungFee(1), balanceAfter: company.balance, fleetSize: fleet.length });
      }
    }

    if (investments.length === 1 && company.balance >= SECOND_INVESTMENT_THRESHOLD) {
      const before = company.balance;
      const br140 = LOCO_OFFERS.find((offer) => offer.id === 'br140');
      assert(br140, 'BR 140 fehlt im Händlerkatalog.');
      const wagonsFor140 = makeWagon('Sggrss', 6, day);
      company = { ...company, balance: company.balance - br140.buyPrice - wagonsFor140.cost - TF_HIRING_COST - hireNachschulungFee(1) };
      add(ledger, 'locomotiveInvestment', br140.buyPrice);
      add(ledger, 'wagonInvestment', wagonsFor140.cost);
      add(ledger, 'hiring', TF_HIRING_COST);
      add(ledger, 'quickPay', hireNachschulungFee(1));
      dayInvestments += br140.buyPrice + wagonsFor140.cost + TF_HIRING_COST + hireNachschulungFee(1);
      fleet.push({ locomotive: makeLoco('br140', day), series: 'BR 140/143', acquiredDay: day, route: 'intermodal', unavailableUntilDay: null });
      wagons.push(wagonsFor140.wagon);
      addTf(staff, `dynamic-br140-tf-${day}`, 'br140');
      investments.push({ day, kind: 'br140', balanceBefore: before, loanProceeds: 0, locomotiveCost: br140.buyPrice, wagonCost: wagonsFor140.cost, personnelCost: TF_HIRING_COST + hireNachschulungFee(1), balanceAfter: company.balance, fleetSize: fleet.length });
    }

    for (const asset of fleet) {
      if (asset.unavailableUntilDay != null && day > asset.unavailableUntilDay) {
        asset.locomotive = { ...clearLocoFault(asset.locomotive), status: 'einsatz' };
        asset.unavailableUntilDay = null;
      }
    }

    const previouslyFaulty = new Set(fleet.filter((asset) => locoHasFault(asset.locomotive)).map((asset) => asset.locomotive.id));
    const maintenanceTick = processMaintenanceDay(
      fleet.map((asset) => asset.locomotive),
      [],
      [],
      nextTick,
      company.level,
      random,
    );
    const maintainedById = new Map(maintenanceTick.locos.map((loco) => [loco.id, loco]));
    for (const asset of fleet) {
      asset.locomotive = maintainedById.get(asset.locomotive.id) ?? asset.locomotive;
    }

    let dayMaintenance = 0;
    let dayUnplannedRepairs = 0;
    for (const asset of fleet) {
      if (previouslyFaulty.has(asset.locomotive.id) || !locoHasFault(asset.locomotive)) continue;
      const repair = quoteWorkshopJob(asset.locomotive, 'reparatur', 'fremdvergabe');
      company = { ...company, balance: company.balance - repair.cost };
      add(ledger, 'unplannedRepairs', repair.cost);
      dayMaintenance += repair.cost;
      dayUnplannedRepairs += repair.cost;
      const fault = asset.locomotive.maintenance?.fault?.kind ?? 'unbekannt';
      asset.unavailableUntilDay = day + repair.durationDays - 1;
      riskEvents.push({
        day,
        locomotiveId: asset.locomotive.id,
        series: asset.series,
        fault,
        repairCost: repair.cost,
        downtimeDays: repair.durationDays,
        lostTrips: repair.durationDays,
      });
    }

    const trips = fleet
      .filter((asset) => asset.unavailableUntilDay == null)
      .map((asset) => {
      if (asset.route === 'coil') {
        return { key: 'BR 218 · Coil-Rahmenvertrag', series: asset.series, order: buildContractRunOrder(coil, nextTick, company), contract: true, fuel: asset.locomotive.fuel_type };
      }
      if (asset.route === 'eanos') {
        return { key: 'BR 218 · Eanos-Spotverkehr', series: asset.series, order: spotOrder({ day, company, id: `eanos-${day}`, number: `DYN-EANOS-${day}`, title: 'Eanos-Spotverkehr', distanceKm: 120, weightT: 800, category: 'energie', wagonType: 'Eanos', wagonCount: 4 }), contract: false, fuel: asset.locomotive.fuel_type };
      }
      if (asset.route === 'bulk') {
        return { key: 'BR 232 · Bulk-Spotverkehr', series: asset.series, order: spotOrder({ day, company, id: `bulk-${day}`, number: `DYN-BULK-${day}`, title: 'Bulk-Spotverkehr', distanceKm: 90, weightT: 700, category: 'energie', wagonType: 'Eanos', wagonCount: 12 }), contract: false, fuel: asset.locomotive.fuel_type };
      }
      return { key: 'BR 140/143 · Intermodal-Spotverkehr', series: asset.series, order: spotOrder({ day, company, id: `intermodal-${day}`, number: `DYN-INTER-${day}`, title: 'Intermodal-Spotverkehr', distanceKm: 520, weightT: 500, category: 'intermodal', wagonType: 'Sggrss', wagonCount: 6 }), contract: false, fuel: asset.locomotive.fuel_type };
    });

    let dayRevenue = 0;
    let dayOperating = 0;
    let dayTkm = 0;
    let dayTons = 0;
    for (const trip of trips) {
      const revenue = trip.contract ? contractTripYield(coil, company) : Number(trip.order.yield) || 0;
      const order = { ...trip.order, yield: revenue };
      const costs = calcOrderOperatingCosts(order, trip.fuel as FuelType, 'eigen');
      const contribution = revenue - costs.total;
      company = { ...company, balance: company.balance + contribution };
      dayRevenue += revenue;
      dayOperating += costs.total;
      dayTkm += order.distance_km * order.weight_t;
      dayTons += order.weight_t;
      completedTrips += 1;
      add(ledger, trip.contract ? 'contractRevenue' : 'spotRevenue', revenue);
      add(ledger, 'pathEnergy', costs.total);
      routeContribution.set(trip.key, (routeContribution.get(trip.key) ?? 0) + contribution);
      seriesContribution.set(trip.series, (seriesContribution.get(trip.series) ?? 0) + contribution);
      company = grantCompanyXp(company, xpForCompletedOrder(order)).company;
    }
    totalTkm += dayTkm;
    totalTons += dayTons;

    for (const asset of fleet) {
      if (day > asset.acquiredDay && (day - asset.acquiredDay) % 90 === 0) {
        const quote = quoteWorkshopJob(asset.locomotive, 'F', 'fremdvergabe');
        company = { ...company, balance: company.balance - quote.cost };
        add(ledger, 'maintenance', quote.cost);
        dayMaintenance += quote.cost;
      }
    }
    if (day === 180 || day === 360) {
      for (const wagon of wagons.slice(0, 2)) {
        company = { ...company, balance: company.balance - WAGON_JOB_RATES.rev.cost };
        add(ledger, 'wagonRevision', WAGON_JOB_RATES.rev.cost);
        dayMaintenance += WAGON_JOB_RATES.rev.cost;
      }
    }

    const expectedService = bank.loans.reduce((sum, loan) => {
      const split = loanPaymentBreakdown(loan);
      return { principal: sum.principal + split.principal, interest: sum.interest + split.interest };
    }, { principal: 0, interest: 0 });
    const beforeBank = company.balance;
    const bankTick = processBankTick(bank, company, nextTick);
    company = bankTick.company;
    Object.assign(bank, bankTick.state);
    const bankCost = beforeBank - company.balance;
    assert.equal(bankCost, INSURANCE_BASE_DAILY + expectedService.principal + expectedService.interest, 'Der Bankdienst muss aus Versicherung, Tilgung und Zinsen bestehen.');
    add(ledger, 'insurance', INSURANCE_BASE_DAILY);
    add(ledger, 'loanInterest', expectedService.interest);
    add(ledger, 'loanPrincipal', expectedService.principal);

    const beforePayroll = company.balance;
    company = processPayrollTick(staff, company, prevTick, nextTick).company;
    const payrollCost = beforePayroll - company.balance;
    add(ledger, 'payroll', payrollCost);

    const beforeDepot = company.balance;
    company = processDepotTick(company, prevTick, nextTick, fleet.map((asset) => asset.locomotive), wagons).company;
    const depotCost = beforeDepot - company.balance;
    add(ledger, 'depot', depotCost);

    lowestBalance = Math.min(lowestBalance, company.balance);
    if (company.balance < 0 && firstNegativeDay == null) firstNegativeDay = day;
    daily.push({ day, level: company.level, reputation: company.reputation, balance: company.balance, revenue: dayRevenue, operatingCosts: dayOperating, fixedCosts: bankCost + payrollCost + depotCost, maintenanceCosts: dayMaintenance, investmentCosts: dayInvestments, loanService: expectedService.principal + expectedService.interest, tkm: dayTkm, locomotiveCount: fleet.length, wagonUnits: wagons.reduce((sum, wagon) => sum + wagon.count, 0), activeTrips: trips.length, unplannedRepairCosts: dayUnplannedRepairs, unavailableLocomotives: fleet.filter((asset) => asset.unavailableUntilDay != null).length });
  }

  const revenue = ledger.contractRevenue + ledger.spotRevenue;
  const cashOut = ledger.pathEnergy + ledger.payroll + ledger.depot + ledger.insurance + ledger.maintenance + ledger.wagonRevision + ledger.unplannedRepairs + ledger.quickPay + ledger.hiring + ledger.locomotiveInvestment + ledger.wagonInvestment + ledger.loanInterest + ledger.loanPrincipal;
  const reconciliation = startCapital + ledger.loanProceeds + revenue - cashOut;
  assert.equal(company.balance, reconciliation, 'Der dynamische Kontostand muss vollständig mit dem Ledger abgestimmt sein.');
  const result = {
    scenario: 'dynamic-fleet-growth-365-v2-hard-mode', days: DAYS, startCapital, endCapital: company.balance,
    netCashChange: company.balance - startCapital, lowestBalance, firstNegativeDay, financiallyStable: company.balance >= 0 && !bank.insolvent,
    finalLevel: company.level, finalReputation: company.reputation, totalRevenue: revenue, cashOut, cashOperatingResult: revenue - (cashOut - ledger.locomotiveInvestment - ledger.wagonInvestment - ledger.loanPrincipal),
    transport: { completedTrips, totalTkm, totalTonsMoved: totalTons, finalLocomotives: fleet.length, finalWagonUnits: wagons.reduce((sum, wagon) => sum + wagon.count, 0), finalActiveTripsPerDay: fleet.filter((asset) => asset.unavailableUntilDay == null).length },
    financing: {
      initialLoanProceeds: ledger.loanProceeds,
      principalRepaid: ledger.loanPrincipal,
      interestPaid: ledger.loanInterest,
      principalOutstanding: bank.loans.reduce((sum, loan) => sum + loan.principalRemaining, 0),
    },
    investments,
    risks: {
      randomSeed: SIMULATION_RANDOM_SEED,
      unplannedFaultCount: riskEvents.length,
      unplannedRepairCost: ledger.unplannedRepairs,
      totalDowntimeDays: riskEvents.reduce((sum, event) => sum + event.downtimeDays, 0),
      totalLostTrips: riskEvents.reduce((sum, event) => sum + event.lostTrips, 0),
      events: riskEvents,
    },
    difficulty: {
      operatingCostMultiplier: 1.08,
      growthLoan: { termDays: growthLoanOffer.termDays, annualPct: growthLoanOffer.annualPct },
      maxDebtToEquityRatio: 1.25,
    },
    costs: ledger, series: [...seriesContribution.entries()].map(([seriesId, contribution]) => ({ seriesId, contribution })).sort((a, b) => b.contribution - a.contribution), routes: [...routeContribution.entries()].map(([route, contribution]) => ({ route, contribution })).sort((a, b) => b.contribution - a.contribution), reconciliation,
  };

  writeFileSync(join(OUT_DIR, 'dynamic-freight-year-365.json'), JSON.stringify(result, null, 2) + '\n', 'utf8');
  writeFileSync(join(OUT_DIR, 'dynamic-freight-year-365-daily.csv'), csv(daily), 'utf8');
  console.log(JSON.stringify(result, null, 2));
}

run();
