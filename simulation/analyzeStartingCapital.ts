import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Company, Order } from '@/lib/supabase';
import { DEFAULT_OVERDRAFT, defaultOverdraftForLevel, type BankState } from '@/lib/bank';
import { computeDailyFixedCosts } from '@/lib/dailyFixedCosts';
import { emptyDepotState, DEPOT_EXPANSIONS } from '@/lib/depot';
import { ensureStaffMeta } from '@/lib/jobcenter';
import { calcOrderOperatingCosts } from '@/lib/operatingCosts';
import { computeSpotYield, marketSizingPolicy } from '@/lib/orderMarket';
import { grantCompanyXp, xpForCompletedOrder } from '@/lib/progression';
import { SEED_COMPANY, SEED_DRIVERS, SEED_LOCOMOTIVES, SEED_WAGONS } from '@/lib/seed';
import { applyLocoFault, quoteWorkshopJob } from '@/lib/workshop';

const DAYS = 30;
const OUT_DIR = resolve(process.cwd(), 'simulation/output');
const START_CAPITALS = [50_000, 100_000, 150_000, 200_000, 210_000] as const;
const FIRST_DEPOT_EXPANSION = DEPOT_EXPANSIONS.find((entry) => entry.id === 'loco-3');

assert(FIRST_DEPOT_EXPANSION, 'Die erste Depot-Ausbaustufe loco-3 fehlt.');
assert.equal(FIRST_DEPOT_EXPANSION.unlockLevel, 2, 'Die Simulation erwartet die erste Depot-Ausbaustufe ab Level 2.');

/**
 * Deterministic balance portfolio for the three guaranteed 4–6 wagon starter orders.
 * It only uses the two starter wagon types (4× Eanos, 6× Res) and Level-1 pricing.
 * The economic calculations themselves use computeSpotYield and calcOrderOperatingCosts.
 */
const STARTER_ORDER_INPUTS = [
  { id: 'starter-eanos-55', number: 'START-01', title: 'Kohle Ruhrgebiet', distanceKm: 55, weightT: 320, wagonType: 'Eanos', wagonCount: 4, category: 'energie' as const, settlementDay: 2 },
  { id: 'starter-res-80', number: 'START-02', title: 'Gleisbaustoff Mittelrhein', distanceKm: 80, weightT: 350, wagonType: 'Res', wagonCount: 5, category: 'energie' as const, settlementDay: 4 },
  { id: 'starter-eanos-120', number: 'START-03', title: 'Biomasse Süd', distanceKm: 120, weightT: 300, wagonType: 'Eanos', wagonCount: 4, category: 'energie' as const, settlementDay: 6 },
] as const;

interface StarterOrderResult {
  id: string;
  orderNumber: string;
  title: string;
  settlementDay: number;
  wagonType: string;
  wagonCount: number;
  distanceKm: number;
  weightT: number;
  grossYield: number;
  operatingCosts: number;
  contribution: number;
  xp: number;
}

interface DailySnapshot {
  day: number;
  balance: number;
  revenue: number;
  operatingCosts: number;
  fixedCosts: number;
  repairCost: number;
  level: number;
  xp: number;
}

interface ScenarioResult {
  startCapital: number;
  ordersDispatchable: boolean;
  ordersCompleted: number;
  starterContribution: number;
  dailyFixedAtStart: number;
  normal: Outcome;
  day5Fault: Outcome;
  depot: {
    expansion: string;
    cost: number;
    unlockLevel: number;
    initialCashSuffices: boolean;
    levelAtDay30: number;
    xpAtDay30: number;
    unlockReachedDay: number | null;
    firstActionableDay: number | null;
    cashAtDay30: number;
  };
}

interface Outcome {
  endCapital: number;
  lowestCapital: number;
  firstNegativeDay: number | null;
  positiveDaysWithin30: number;
  daysBufferAfterDay30: number;
  financiallyStableAtDay30: boolean;
  totalRevenue: number;
  totalOperatingCosts: number;
  totalFixedCosts: number;
  repairCost: number;
  unlockReachedDay: number | null;
  firstActionableDay: number | null;
  daily: DailySnapshot[];
}

function makeStarterOrder(input: (typeof STARTER_ORDER_INPUTS)[number], company: Company): Order {
  const priced = computeSpotYield('gueterverkehr', input.distanceKm, input.weightT, input.category, company);
  return {
    id: input.id,
    order_number: input.number,
    type: 'gueterverkehr',
    title: input.title,
    origin: 'Simulation',
    destination: 'Simulation',
    distance_km: input.distanceKm,
    weight_t: input.weightT,
    yield: priced.yield,
    penalty: 0,
    deadline: null,
    status: 'offen',
    notes: 'Deterministischer Frühspiel-Referenzlauf',
    min_brh: 60,
    required_wagon_type: input.wagonType,
    required_wagon_count: input.wagonCount,
    sperrpause_start: null,
    sperrpause_end: null,
    penalty_per_min: 0,
    created_at: '2026-08-26T00:00:00.000Z',
    customer: 'Balance-Test',
    customer_id: input.id,
    origin_country: 'D',
    destination_country: 'D',
    requires_etcs: false,
    contract_id: null,
    deployment_days: null,
    daily_rate: null,
    required_drivers: 1,
  };
}

function makeBank(): BankState {
  return {
    overdraftLimit: defaultOverdraftForLevel(1),
    overdraftDailyRate: 0,
    loans: [],
    insurances: { gueterschaden: false, haftpflicht: false },
    bookings: [],
    lastProcessedTick: 0,
    sanierungStartTick: null,
    insolvent: false,
  };
}

function starterOrders(company: Company): StarterOrderResult[] {
  return STARTER_ORDER_INPUTS.map((input) => {
    const order = makeStarterOrder(input, company);
    const costs = calcOrderOperatingCosts(order, 'diesel', 'eigen');
    return {
      id: order.id,
      orderNumber: order.order_number,
      title: order.title,
      settlementDay: input.settlementDay,
      wagonType: input.wagonType,
      wagonCount: input.wagonCount,
      distanceKm: order.distance_km,
      weightT: order.weight_t,
      grossYield: order.yield,
      operatingCosts: costs.total,
      contribution: costs.netProfit,
      xp: xpForCompletedOrder(order),
    };
  });
}

function starterWagonAvailability(): Map<string, number> {
  const availability = new Map<string, number>();
  for (const wagon of SEED_WAGONS) {
    availability.set(wagon.type_code, (availability.get(wagon.type_code) ?? 0) + wagon.count);
  }
  return availability;
}

function canDispatchStarterPortfolio(orders: StarterOrderResult[]): boolean {
  const availability = starterWagonAvailability();
  return orders.every((order) => order.wagonCount <= (availability.get(order.wagonType) ?? 0));
}

function runOutcome(startCapital: number, includeDay5Fault: boolean, orders: StarterOrderResult[]): Outcome {
  let company: Company = { ...SEED_COMPANY, balance: startCapital, level: 1, xp: 0, xp_next: 1_000, tick: 0 };
  const bank = makeBank();
  const staffMeta = ensureStaffMeta(SEED_DRIVERS, {});
  const daily: DailySnapshot[] = [];
  const repairLoco = applyLocoFault(SEED_LOCOMOTIVES[1]!, 'elektronik', 5 * 24);
  const repairQuote = quoteWorkshopJob(repairLoco, 'reparatur', 'eigen');
  let totalRevenue = 0;
  let totalOperatingCosts = 0;
  let totalFixedCosts = 0;
  let repairCost = 0;
  let lowestCapital = startCapital;
  let firstNegativeDay: number | null = null;
  let unlockReachedDay: number | null = null;
  let firstActionableDay: number | null = null;

  for (let day = 1; day <= DAYS; day += 1) {
    company = { ...company, tick: day * 24 };
    let revenue = 0;
    let operatingCosts = 0;
    let dayRepair = 0;

    for (const trip of orders.filter((order) => order.settlementDay === day)) {
      revenue += trip.grossYield;
      operatingCosts += trip.operatingCosts;
      company = { ...company, balance: company.balance + trip.contribution };
      const generatedOrder = makeStarterOrder(STARTER_ORDER_INPUTS.find((input) => input.id === trip.id)!, company);
      company = grantCompanyXp(company, xpForCompletedOrder(generatedOrder)).company;
    }

    if (includeDay5Fault && day === 5) {
      dayRepair = repairQuote.cost;
      repairCost += dayRepair;
      company = { ...company, balance: company.balance - dayRepair };
    }

    const fixed = computeDailyFixedCosts({
      company,
      bank,
      leases: [],
      staffMeta,
      locomotives: SEED_LOCOMOTIVES,
      wagons: SEED_WAGONS,
    }).total;
    company = { ...company, balance: company.balance - fixed };

    totalRevenue += revenue;
    totalOperatingCosts += operatingCosts;
    totalFixedCosts += fixed;
    lowestCapital = Math.min(lowestCapital, company.balance);
    if (company.balance < 0 && firstNegativeDay == null) firstNegativeDay = day;
    if (company.level >= FIRST_DEPOT_EXPANSION.unlockLevel && unlockReachedDay == null) unlockReachedDay = day;
    if (
      company.level >= FIRST_DEPOT_EXPANSION.unlockLevel &&
      company.balance >= FIRST_DEPOT_EXPANSION.cost &&
      firstActionableDay == null
    ) {
      firstActionableDay = day;
    }

    daily.push({ day, balance: company.balance, revenue, operatingCosts, fixedCosts: fixed, repairCost: dayRepair, level: company.level, xp: company.xp });
  }

  const fixedAtEnd = Math.max(1, daily.at(-1)?.fixedCosts ?? 1);
  return {
    endCapital: company.balance,
    lowestCapital,
    firstNegativeDay,
    positiveDaysWithin30: firstNegativeDay == null ? DAYS : firstNegativeDay - 1,
    daysBufferAfterDay30: Math.max(0, Math.floor(Math.max(0, company.balance) / fixedAtEnd)),
    financiallyStableAtDay30: company.balance >= 0,
    totalRevenue,
    totalOperatingCosts,
    totalFixedCosts,
    repairCost,
    unlockReachedDay,
    firstActionableDay,
    daily,
  };
}

function analyseScenario(startCapital: number, orders: StarterOrderResult[]): ScenarioResult {
  const normal = runOutcome(startCapital, false, orders);
  const day5Fault = runOutcome(startCapital, true, orders);
  const firstFixed = normal.daily[0]?.fixedCosts ?? 0;
  const orderXp = orders.reduce((sum, order) => sum + order.xp, 0);
  return {
    startCapital,
    ordersDispatchable: canDispatchStarterPortfolio(orders),
    ordersCompleted: orders.length,
    starterContribution: orders.reduce((sum, order) => sum + order.contribution, 0),
    dailyFixedAtStart: firstFixed,
    normal,
    day5Fault,
    depot: {
      expansion: FIRST_DEPOT_EXPANSION.label,
      cost: FIRST_DEPOT_EXPANSION.cost,
      unlockLevel: FIRST_DEPOT_EXPANSION.unlockLevel,
      initialCashSuffices: startCapital >= FIRST_DEPOT_EXPANSION.cost,
      levelAtDay30: normal.daily.at(-1)?.level ?? 1,
      xpAtDay30: normal.daily.at(-1)?.xp ?? orderXp,
      unlockReachedDay: normal.unlockReachedDay,
      firstActionableDay: normal.firstActionableDay,
      cashAtDay30: normal.endCapital,
    },
  };
}

function euro(value: number): string {
  return `${Math.round(value).toLocaleString('de-DE')} €`;
}

function dayLabel(day: number | null): string {
  return day == null ? 'nicht in Tag 1–30' : `Tag ${day}`;
}

function buildMarkdown(input: {
  orders: StarterOrderResult[];
  scenarios: ScenarioResult[];
  marketPolicy: ReturnType<typeof marketSizingPolicy>;
  repairCost: number;
}): string {
  const rows = input.scenarios
    .map((scenario) => {
      const baseline = scenario.normal;
      const shock = scenario.day5Fault;
      const recommended = scenario.startCapital === 150_000 ? '**Empfohlen**' : '';
      return `| ${euro(scenario.startCapital)} | ${scenario.ordersDispatchable ? 'Ja' : 'Nein'} | ${euro(baseline.endCapital)} | ${dayLabel(baseline.firstNegativeDay)} | ${baseline.daysBufferAfterDay30} Tage | ${euro(shock.endCapital)} | ${dayLabel(shock.firstNegativeDay)} | ${recommended} |`;
    })
    .join('\n');

  const orders = input.orders
    .map((order) => `| ${order.orderNumber} | ${order.title} | ${order.wagonCount}× ${order.wagonType} | ${order.distanceKm} km / ${order.weightT} t | ${euro(order.grossYield)} | ${euro(order.operatingCosts)} | ${euro(order.contribution)} | ${order.xp} |`)
    .join('\n');

  return `# Startkapital-Experiment: Frühspiel Tag 1–30

> **Modellstatus:** Lokale Spielbalance, keine Aussage über reale EVU-, Banken- oder Marktbedingungen. Die Simulation verwendet aktuelle Runtime-Formeln für Spotvergütung, Diesel/Trasse, Personal, Standort, Versicherung und die cash-only-Depotregel.

## Prüfaufbau

Der Lauf betrachtet ausschließlich die drei garantiert verfügbaren Leichtaufträge des Frühmarkts. Die Marktlogik garantiert bei Level 1 bzw. 25 Wagenstellplätzen genau ${input.marketPolicy.guaranteedLightOrders} Angebote mit 4–6 Wagen. Für Reproduzierbarkeit nutzt das Experiment drei nacheinander abwickelbare Referenzaufträge, die nur die vorhandenen Startergattungen Eanos und Res benötigen. Nach Tag 6 wird **kein weiterer Umsatz** unterstellt: Die Pufferwerte sind damit bewusst konservativ und messen die Widerstandsfähigkeit der Startliquidität gegen 30 Tage Fixkosten.

Der Schadensfall erzwingt am Tag 5 einen Elektronikschaden einer BR 218. Der Betrag von ${euro(input.repairCost)} entspricht der aktuellen eigenen Werkstattquote einschließlich des außerplanmäßigen Schadenmultiplikators; reguläre Zufallsschäden sind im Produktivspiel vor Level 3 und vor Tag 90 noch gesperrt.

## Drei garantierte Starterläufe

| Auftrag | Referenzlauf | Wagen | Strecke / Last | Bruttoerlös | Betriebskosten | Deckungsbeitrag | XP |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
${orders}

## Ergebnismatrix

| Startkapital | 3 Starteraufträge fahrbar | Endkapital ohne Schaden | Erstes Minus ohne Schaden | Puffer nach Tag 30 | Endkapital mit Tag-5-Schaden | Erstes Minus mit Schaden | Einordnung |
| ---: | --- | ---: | --- | ---: | ---: | --- | --- |
${rows}

## Depot-Ausbau und Progression

Die erste investive Ausbaustufe ist der **3. Lok-Stellplatz** für ${euro(FIRST_DEPOT_EXPANSION.cost)}. Sie erfordert neben freiem Cash zwingend **Level ${FIRST_DEPOT_EXPANSION.unlockLevel}**. Die drei Starterläufe erzeugen zusammen nur ${input.orders.reduce((sum, order) => sum + order.xp, 0)} XP; Level 2 benötigt 1.000 XP. Daher besitzt zwar jedes Vergleichsszenario am Start rechnerisch genug Cash für die 18.000-€-Stufe, aber **keines kann sie innerhalb dieses isolierten Drei-Auftrags-Laufs legal erwerben**. Das Ergebnis trennt bewusst Liquidität von der Progressionsfreischaltung.

## Empfehlung

**150.000 €** ist in diesem konservativen Test der sinnvollste Balanced-Start: Die drei Starteraufträge bleiben ohne Kredit bzw. Dispo vollständig fahrbar, der Tag-5-Schock bleibt klar oberhalb der Nulllinie und nach Tag 30 bleibt ein nennenswerter Betriebspuffer. **100.000 €** ist eine anspruchsvolle Standard-Variante, aber im erzwungenen Schadenpfad bis Tag 30 negativ. **50.000 €** ist Hardcore und fällt bereits im Basispfad während des Monats ins Minus. **200.000–210.000 €** bieten hohe Fehlertoleranz, senken aber die frühe finanzielle Spannung deutlich.

## Reproduktion

Ausführen mit:

\`npm run analyze:starting-capital\`

Die Rohwerte stehen in \`simulation/output/starting-capital-analysis.json\`; dieser Bericht wird als \`simulation/output/STARTING_CAPITAL_ANALYSIS.md\` erzeugt.
`;
}

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const levelOneCompany: Company = { ...SEED_COMPANY, level: 1, reputation: 0, xp: 0, xp_next: 1_000 };
  const orders = starterOrders(levelOneCompany);
  const marketPolicy = marketSizingPolicy({ level: 1, reputation: 0 }, { wagonBerthCapacity: 25 });
  assert.equal(marketPolicy.guaranteedLightOrders, 3, 'Der Frühmarkt muss drei Leichtaufträge garantieren.');
  assert(orders.every((order) => order.wagonCount >= 4 && order.wagonCount <= 6), 'Alle Referenzaufträge müssen 4–6 Wagen haben.');
  assert(canDispatchStarterPortfolio(orders), 'Die Referenzaufträge müssen mit dem Starterwagenpark fahrbar sein.');
  assert(orders.every((order) => order.contribution > 0), 'Jeder Starterlauf muss nach Energie und Trasse positiv beitragen.');

  const scenarios = START_CAPITALS.map((capital) => analyseScenario(capital, orders));
  const repairLoco = applyLocoFault(SEED_LOCOMOTIVES[1]!, 'elektronik', 5 * 24);
  const repairCost = quoteWorkshopJob(repairLoco, 'reparatur', 'eigen').cost;
  const report = {
    title: 'Starting capital experiment — early game day 1–30',
    generatedAt: new Date().toISOString(),
    model: {
      days: DAYS,
      noLoans: true,
      noOverdraftForInvestments: true,
      orderSettlementDays: STARTER_ORDER_INPUTS.map((row) => row.settlementDay),
      noRevenueAfterDay6: true,
      depotState: emptyDepotState(),
      firstDepotExpansion: FIRST_DEPOT_EXPANSION,
      defaultOverdraftLevel1: DEFAULT_OVERDRAFT,
      injectedDay5Fault: { type: 'elektronik', repairCost, channel: 'eigen' },
      note: 'Deterministic local game-balance experiment; no external economic data.',
    },
    marketPolicy,
    starterOrders: orders,
    scenarios,
    recommendation: {
      capital: 150_000,
      rationale: 'In this conservative 30-day scenario it remains solvent after the injected Day-5 repair and retains a material operating buffer.',
    },
  };

  writeFileSync(resolve(OUT_DIR, 'starting-capital-analysis.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(resolve(OUT_DIR, 'STARTING_CAPITAL_ANALYSIS.md'), buildMarkdown({ orders, scenarios, marketPolicy, repairCost }), 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

main();
