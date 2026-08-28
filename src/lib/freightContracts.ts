import type { AssignmentWithDetails, Company, CountryPackage, Notification, Order } from '@/lib/supabase';
import { isNewGameDay, loadJson, saveJson, TICKS_PER_DAY, clampReputation } from '@/lib/storage';
import { newNotificationId, tickToIso } from '@/lib/gameTime';
import { computeSpotYield, freightRevenueMultiplier, type FreightCustomerCategory, type CommercialStanding } from '@/lib/orderMarket';
import { EXCLUSIVE_YIELD_FACTOR, reputationGainForFulfilledContract } from '@/lib/reputation';
import { isNetworkSiteOwned, type DepotState } from '@/lib/depot';
import { calcOrderOperatingCosts } from '@/lib/operatingCosts';
import { sendMessage } from '@/lib/inbox';
import { formatEuro } from '@/lib/status';
import { isoToTick } from '@/lib/tracking';
import { inferCountryFromLabel } from '@/lib/networkAccess';

export const FREIGHT_CONTRACTS_KEY = 'evu-freight-contracts';

export type IndustrialContractStatus = 'available' | 'active' | 'declined' | 'expired';

export interface IndustrialContract {
  id: string;
  title: string;
  partner: string;
  corridor: string;
  periodDays: number;
  dailyDepartures: number;
  dailyRevenue: number;
  minBekanntheit: number;
  minLevel: number;
  status: IndustrialContractStatus;
  acceptedTick?: number;
  endsTick?: number;
  corridorKm?: number;
  trainWeightT?: number;
  tkmDaily?: number;
  /** Wagen-Gattung, die der Vertrag physisch bindet. */
  requiredWagonType?: string;
  requiredWagonCount?: number;
  originCountry?: CountryPackage;
  destCountry?: CountryPackage;
  requiresEtcs?: boolean;
  electrified?: boolean;
  exclusive?: boolean;
  requiredSiteId?: string;
  /** Runs completed in the current game-day (reset after settlement). */
  fulfilledToday?: number;
  lastSettledDay?: number;
}

/** Same per-trip formula as the spot market, times daily departures. */
function industrialDaily(
  category: FreightCustomerCategory,
  km: number,
  weightT: number,
  departures: number,
): {
  dailyRevenue: number;
  tkmDaily: number;
} {
  const trip = computeSpotYield('gueterverkehr', km, weightT, category);
  return {
    dailyRevenue: trip.yield * departures,
    tkmDaily: km * weightT * departures,
  };
}

/** Same Trasse/Energie formula as a spot Güterzug, billed once per daily departure. */
export function industrialDailyOperatingCost(contract: Pick<IndustrialContract, 'corridorKm' | 'trainWeightT' | 'dailyDepartures'>): number {
  const km = Math.max(0, Number(contract.corridorKm) || 0);
  const weightT = Math.max(0, Number(contract.trainWeightT) || 0);
  const stub = {
    type: 'gueterverkehr',
    distance_km: km,
    weight_t: weightT,
    yield: 0,
    deployment_days: null,
  } as Order;
  const costs = calcOrderOperatingCosts(stub, 'elektrik');
  return costs.total * Math.max(1, Number(contract.dailyDepartures) || 1);
}

const CATALOG: Omit<IndustrialContract, 'status'>[] = [
  {
    id: 'fc-ruhr-coil',
    title: 'Coil-Nahverkehr Duisburg–Dortmund',
    partner: 'RuhrCoil Service',
    corridor: 'Duisburg Hafen → Dortmund',
    periodDays: 21,
    dailyDepartures: 1,
    minBekanntheit: 0,
    minLevel: 1,
    corridorKm: 55,
    trainWeightT: 360,
    requiredWagonType: 'Res',
    requiredWagonCount: 6,
    originCountry: 'D',
    destCountry: 'D',
    electrified: true,
    requiredSiteId: 'duisburg',
    ...industrialDaily('stahl', 55, 360, 1),
  },
  {
    id: 'fc-thyssen-coil',
    title: 'Coil-Pendel Duisburg–Salzgitter',
    partner: 'Rhein-Ruhr Stahl AG',
    corridor: 'Duisburg Hafen → Salzgitter',
    periodDays: 30,
    dailyDepartures: 2,
    minBekanntheit: 40,
    minLevel: 4,
    corridorKm: 280,
    trainWeightT: 1000,
    requiredWagonType: 'Res',
    requiredWagonCount: 6,
    electrified: true,
    requiredSiteId: 'duisburg',
    ...industrialDaily('stahl', 280, 1000, 2),
  },
  {
    id: 'fc-basf-kessel',
    title: 'Chemie-Kessel Ludwigshafen–Köln',
    partner: 'ChemWorks Ludwigshafen',
    corridor: 'Ludwigshafen → Köln-Niehl',
    periodDays: 45,
    dailyDepartures: 1,
    minBekanntheit: 32,
    minLevel: 3,
    corridorKm: 280,
    trainWeightT: 600,
    requiredWagonType: 'Zans',
    requiredWagonCount: 8,
    electrified: true,
    requiredSiteId: 'mannheim-rbf',
    ...industrialDaily('chemie', 280, 600, 1),
  },
  {
    id: 'fc-rwe-kohle',
    title: 'Energiekohle Hamm–Gelsenkirchen',
    partner: 'PowerCoal Generation',
    corridor: 'Hamm Uentrop → Gelsenkirchen-Buer',
    periodDays: 60,
    dailyDepartures: 3,
    minBekanntheit: 50,
    minLevel: 5,
    corridorKm: 90,
    trainWeightT: 1200,
    requiredWagonType: 'Eanos',
    requiredWagonCount: 12,
    electrified: true,
    ...industrialDaily('energie', 90, 1200, 3),
  },
  {
    id: 'fc-hhla-box',
    title: 'Intermodal Hamburg–München',
    partner: 'TransLog Intermodal',
    corridor: 'Hamburg Billwerder → München-Riem',
    periodDays: 90,
    dailyDepartures: 1,
    minBekanntheit: 60,
    minLevel: 5,
    corridorKm: 790,
    trainWeightT: 1400,
    requiredWagonType: 'Sggrss',
    requiredWagonCount: 6,
    electrified: true,
    requiredSiteId: 'hamburg-hafen',
    ...industrialDaily('intermodal', 790, 1400, 1),
  },
  {
    id: 'fc-auto-wolfsburg',
    title: 'Fahrzeugteile Wolfsburg–Emden',
    partner: 'AutoTrans Central',
    corridor: 'Wolfsburg → Emden Autowerk',
    periodDays: 120,
    dailyDepartures: 2,
    minBekanntheit: 70,
    minLevel: 5,
    corridorKm: 280,
    trainWeightT: 800,
    requiredWagonType: 'Hbbillns',
    requiredWagonCount: 10,
    electrified: true,
    exclusive: true,
    ...industrialDaily('intermodal', 280, 800, 2),
  },
  {
    id: 'fc-saar-erz',
    title: 'Erzzug Dillingen–Duisburg',
    partner: 'Saar-Erz Logistik',
    corridor: 'Dillingen Saar → Duisburg Hafen',
    periodDays: 45,
    dailyDepartures: 2,
    minBekanntheit: 42,
    minLevel: 4,
    corridorKm: 280,
    trainWeightT: 1300,
    requiredWagonType: 'Eanos',
    requiredWagonCount: 12,
    electrified: true,
    requiredSiteId: 'duisburg',
    ...industrialDaily('stahl', 280, 1300, 2),
  },
  {
    id: 'fc-europort-box',
    title: 'Hinterlandboxen Hamburg–Stuttgart',
    partner: 'EuroPort Container Service',
    corridor: 'Hamburg Billwerder → Stuttgart',
    periodDays: 75,
    dailyDepartures: 1,
    minBekanntheit: 55,
    minLevel: 5,
    corridorKm: 660,
    trainWeightT: 1300,
    requiredWagonType: 'Sggrss',
    requiredWagonCount: 6,
    electrified: true,
    requiredSiteId: 'hamburg-hafen',
    ...industrialDaily('intermodal', 660, 1300, 1),
  },
  {
    id: 'fc-ecowood',
    title: 'Biomasse Passau–Augsburg',
    partner: 'EcoWood Biomasse',
    corridor: 'Passau → Augsburg',
    periodDays: 40,
    dailyDepartures: 1,
    minBekanntheit: 12,
    minLevel: 2,
    corridorKm: 230,
    trainWeightT: 900,
    requiredWagonType: 'Eanos',
    requiredWagonCount: 8,
    electrified: true,
    requiredSiteId: 'muenchen-ost',
    ...industrialDaily('energie', 230, 900, 1),
  },
  {
    id: 'fc-rhein-main-fuel',
    title: 'Kraftstoff Ludwigshafen–Frankfurt',
    partner: 'Rhein-Main Kraftstoff',
    corridor: 'Ludwigshafen → Frankfurt Osthafen',
    periodDays: 50,
    dailyDepartures: 1,
    minBekanntheit: 18,
    minLevel: 3,
    corridorKm: 80,
    trainWeightT: 550,
    requiredWagonType: 'Zans',
    requiredWagonCount: 6,
    electrified: true,
    requiredSiteId: 'mannheim-rbf',
    ...industrialDaily('chemie', 80, 550, 1),
  },
  {
    id: 'fc-hh-erz-ganzzug',
    title: 'Erz-Ganzzug Maschen–Duisburg',
    partner: 'Nordsee Erz AG',
    corridor: 'Maschen Rbf → Duisburg Hafen',
    periodDays: 60,
    dailyDepartures: 2,
    minBekanntheit: 70,
    minLevel: 4,
    corridorKm: 380,
    trainWeightT: 1600,
    requiredWagonType: 'Eanos',
    requiredWagonCount: 14,
    electrified: true,
    exclusive: true,
    requiredSiteId: 'maschen-rbf',
    ...industrialDaily('stahl', 380, 1600, 2),
  },
  {
    id: 'fc-sued-box-exclusive',
    title: 'Premium-Shuttle München Ost–Hamburg',
    partner: 'Alpen-Nord Intermodal',
    corridor: 'München Ost → Hamburg Hafen',
    periodDays: 90,
    dailyDepartures: 1,
    minBekanntheit: 85,
    minLevel: 5,
    corridorKm: 790,
    trainWeightT: 1500,
    requiredWagonType: 'Sggrss',
    requiredWagonCount: 12,
    electrified: true,
    exclusive: true,
    requiredSiteId: 'muenchen-ost',
    ...industrialDaily('intermodal', 790, 1500, 1),
  },
];

export function industrialPayableDaily(
  contract: Pick<IndustrialContract, 'dailyRevenue' | 'exclusive'>,
  standing?: CommercialStanding | Pick<Company, 'level' | 'reputation'> | null,
): number {
  const exclusiveBoost = contract.exclusive ? EXCLUSIVE_YIELD_FACTOR : 1;
  return Math.round(Number(contract.dailyRevenue) * freightRevenueMultiplier(standing) * exclusiveBoost);
}

export function canAcceptIndustrial(
  contract: Pick<IndustrialContract, 'minBekanntheit' | 'minLevel' | 'status' | 'requiredSiteId'>,
  company: Pick<Company, 'level' | 'reputation'>,
  depot?: DepotState | null,
): boolean {
  if (contract.status != null && contract.status !== 'available') return false;
  if (company.level < (contract.minLevel ?? 1) || company.reputation < (contract.minBekanntheit ?? 0)) {
    return false;
  }
  if (contract.requiredSiteId && depot && !isNetworkSiteOwned(depot, contract.requiredSiteId)) {
    return false;
  }
  return true;
}

export function industrialWagonNeed(
  contract: Pick<IndustrialContract, 'requiredWagonType' | 'requiredWagonCount'>,
): Pick<Order, 'required_wagon_type' | 'required_wagon_count'> {
  return {
    required_wagon_type: contract.requiredWagonType ?? null,
    required_wagon_count: contract.requiredWagonCount ?? 0,
  };
}

export function defaultFreightContracts(): IndustrialContract[] {
  return CATALOG.map((c) => ({ ...c, status: 'available' as const }));
}

export function loadFreightContracts(): IndustrialContract[] {
  const loaded = loadJson<IndustrialContract[] | null>(FREIGHT_CONTRACTS_KEY, null);
  if (!Array.isArray(loaded) || loaded.length === 0) {
    const fresh = defaultFreightContracts();
    saveFreightContracts(fresh);
    return fresh;
  }
  const byId = new Map(loaded.filter((c) => c && typeof c === 'object' && c.id).map((c) => [c.id, c]));
  return CATALOG.map((def) => {
    const prev = byId.get(def.id);
    return prev ? { ...def, ...pickKeep(prev) } : { ...def, status: 'available' as const };
  });
}

function pickKeep(
  prev: IndustrialContract,
): Pick<
  IndustrialContract,
  'status' | 'acceptedTick' | 'endsTick' | 'fulfilledToday' | 'lastSettledDay'
> {
  return {
    status: prev.status,
    acceptedTick: prev.acceptedTick,
    endsTick: prev.endsTick,
    fulfilledToday: prev.fulfilledToday,
    lastSettledDay: prev.lastSettledDay,
  };
}

export function requiredDeparturesFor(
  contract: Pick<IndustrialContract, 'dailyDepartures' | 'minLevel'>,
  companyLevel = 1,
): number {
  const cap = Math.max(1, Number(contract.dailyDepartures) || 1);
  const level = Math.max(1, companyLevel);
  if (level <= 2) return 1;
  if (level <= 4) return Math.min(cap, 2);
  return cap;
}

export function contractTripYield(
  contract: Pick<IndustrialContract, 'dailyRevenue' | 'dailyDepartures' | 'exclusive'>,
  standing?: CommercialStanding | Pick<Company, 'level' | 'reputation'> | null,
): number {
  const deps = Math.max(1, Number(contract.dailyDepartures) || 1);
  return Math.round(industrialPayableDaily(contract, standing) / deps);
}

export function contractTripOperatingCost(
  contract: Pick<IndustrialContract, 'corridorKm' | 'trainWeightT' | 'dailyDepartures'>,
): number {
  const deps = Math.max(1, Number(contract.dailyDepartures) || 1);
  return Math.round(industrialDailyOperatingCost(contract) / deps);
}

export function contractMissPenalty(
  contract: Pick<IndustrialContract, 'dailyRevenue' | 'dailyDepartures'>,
  standing?: CommercialStanding | Pick<Company, 'level' | 'reputation'> | null,
): number {
  return Math.max(650, Math.round(contractTripYield(contract, standing) * 0.42) + 400);
}

function splitCorridor(corridor: string): { origin: string; destination: string } {
  const parts = corridor.split(/\s*→\s*|\s+-\s+|\s+–\s+/);
  return {
    origin: (parts[0] ?? corridor).trim(),
    destination: (parts[1] ?? parts[0] ?? corridor).trim(),
  };
}

export function contractCountries(
  contract: Pick<IndustrialContract, 'corridor' | 'originCountry' | 'destCountry'>,
): { origin: CountryPackage; dest: CountryPackage } {
  const { origin, destination } = splitCorridor(contract.corridor);
  return {
    origin: contract.originCountry ?? inferCountryFromLabel(origin),
    dest: contract.destCountry ?? inferCountryFromLabel(destination),
  };
}

export function buildContractRunOrder(
  contract: IndustrialContract,
  tick: number,
  standing?: CommercialStanding | Pick<Company, 'level' | 'reputation'> | null,
  usedNumbers?: Set<string>,
): Order {
  const { origin, destination } = splitCorridor(contract.corridor);
  const countries = contractCountries(contract);
  const km = Math.max(1, Number(contract.corridorKm) || 80);
  const weight = Math.max(1, Number(contract.trainWeightT) || 400);
  const yieldAmt = contractTripYield(contract, standing);
  const hours = Math.max(18, TICKS_PER_DAY - (tick % TICKS_PER_DAY) + 6);
  const deadline = new Date(new Date(tickToIso(tick)).getTime() + hours * 60 * 60 * 1000).toISOString();
  const used = usedNumbers ?? new Set<string>();
  let n = 0;
  let orderNumber = `RV-${contract.id.slice(-6).toUpperCase()}-${tick}`;
  while (used.has(orderNumber)) {
    n += 1;
    orderNumber = `RV-${contract.id.slice(-6).toUpperCase()}-${tick}-${n}`;
  }
  used.add(orderNumber);
  return {
    id: newNotificationId(),
    order_number: orderNumber,
    type: 'gueterverkehr',
    title: `${contract.title} · Vertragslauf`,
    origin,
    destination,
    distance_km: km,
    weight_t: weight,
    yield: yieldAmt,
    penalty: contractMissPenalty(contract, standing),
    deadline,
    status: 'offen',
    notes: `${contract.exclusive ? 'Exklusiv-Ganzzug · ' : ''}Rahmenvertrag ${contract.partner} · ${contract.requiredWagonCount ?? 0}× ${contract.requiredWagonType ?? 'Wagen'}`,
    min_brh: 62,
    required_wagon_type: contract.requiredWagonType ?? null,
    required_wagon_count: contract.requiredWagonCount ?? 0,
    sperrpause_start: null,
    sperrpause_end: null,
    penalty_per_min: 0,
    created_at: tickToIso(tick),
    customer: contract.partner,
    customer_id: contract.id,
    origin_country: countries.origin,
    destination_country: countries.dest,
    requires_etcs: Boolean(contract.requiresEtcs) || countries.origin !== countries.dest || countries.origin === 'CH' || countries.dest === 'CH',
    contract_id: contract.id,
    deployment_days: null,
    daily_rate: null,
    required_drivers: 1,
    electrified: contract.electrified !== false,
    special: contract.exclusive === true,
    exclusive: contract.exclusive === true,
  };
}

export function dayKeyFromTick(tick: number): number {
  return Math.floor(tick / TICKS_PER_DAY);
}

export function markContractRunDispatched(list: IndustrialContract[], contractId: string): IndustrialContract[] {
  return list.map((c) =>
    c.id === contractId && c.status === 'active'
      ? { ...c, fulfilledToday: (c.fulfilledToday ?? 0) + 1 }
      : c,
  );
}

export function pendingContractOrders(orders: Order[], contractId: string): Order[] {
  return orders.filter(
    (o) => o.contract_id === contractId && (o.status === 'offen' || o.status === 'zugewiesen'),
  );
}

export function countContractFulfillment(
  contract: IndustrialContract,
  assignments: AssignmentWithDetails[],
  tick: number,
): number {
  const day = dayKeyFromTick(tick);
  const tracked = Number(contract.fulfilledToday) || 0;
  let fromAssignments = 0;
  for (const a of assignments) {
    const contractId = a.contract_id ?? a.order?.contract_id;
    if (contractId !== contract.id) continue;
    if (a.status === 'abgebrochen') continue;
    const start = isoToTick(a.assigned_at);
    if (start == null) continue;
    if (dayKeyFromTick(start) === day) fromAssignments += 1;
  }
  return Math.max(tracked, fromAssignments);
}

export interface ContractObligation {
  required: number;
  fulfilled: number;
  shortfall: number;
  covered: boolean;
  tripYield: number;
  tripOpex: number;
  missPenalty: number;
  nextDueLabel: string;
}

export function contractObligation(
  contract: IndustrialContract,
  company: Pick<Company, 'level' | 'reputation' | 'tick'>,
  assignments: AssignmentWithDetails[] = [],
): ContractObligation {
  const required = requiredDeparturesFor(contract, company.level);
  const fulfilled = Math.min(required, countContractFulfillment(contract, assignments, company.tick ?? 0));
  const shortfall = Math.max(0, required - fulfilled);
  return {
    required,
    fulfilled,
    shortfall,
    covered: shortfall === 0,
    tripYield: contractTripYield(contract, company),
    tripOpex: contractTripOperatingCost(contract),
    missPenalty: contractMissPenalty(contract, company),
    nextDueLabel: shortfall > 0 ? `${shortfall} Lauf(e) heute offen` : 'Heute erfüllt',
  };
}

export function saveFreightContracts(list: IndustrialContract[]): void {
  saveJson(FREIGHT_CONTRACTS_KEY, list);
}

export function acceptContract(
  list: IndustrialContract[],
  id: string,
  tick: number,
): IndustrialContract[] {
  return list.map((c) =>
    c.id === id && c.status === 'available'
      ? {
          ...c,
          status: 'active' as const,
          acceptedTick: tick,
          endsTick: tick + c.periodDays * TICKS_PER_DAY,
        }
      : c,
  );
}

export function declineContract(list: IndustrialContract[], id: string): IndustrialContract[] {
  return list.map((c) => (c.id === id && c.status === 'available' ? { ...c, status: 'declined' as const } : c));
}

export function processFreightContractsTick(
  list: IndustrialContract[],
  company: Company,
  prevTick: number,
  nextTick: number,
  assignments: AssignmentWithDetails[] = [],
): { list: IndustrialContract[]; company: Company; notifications: Omit<Notification, 'id'>[]; operatingKm: number; daySettlements: { id: string; missed: number }[]; expiredIds: string[] } {
  let nextList = list;
  let nextCompany = company;
  const notifications: Omit<Notification, 'id'>[] = [];
  const payday = isNewGameDay(prevTick, nextTick);
  let operatingKm = 0;
  const settledDay = dayKeyFromTick(prevTick);
  const daySettlements: { id: string; missed: number }[] = [];
  const expiredIds: string[] = [];

  nextList = nextList.map((c) => {
    if (c.status !== 'active') return c;
    if (c.endsTick != null && c.endsTick <= nextTick) {
      notifications.push({
        type: 'info',
        title: 'Frachtvertrag ausgelaufen',
        message: `${c.title} (${c.partner}) ist beendet.`,
        read: false,
        created_at: company.updated_at,
      });
      sendMessage('System', 'Frachtvertrag ausgelaufen', `${c.title} (${c.partner}) ist beendet.`, nextTick);
      expiredIds.push(c.id);
      return { ...c, status: 'expired' as const, fulfilledToday: 0 };
    }
    if (!payday) return c;
    if ((c.lastSettledDay ?? -1) >= settledDay) return { ...c, fulfilledToday: 0 };

    const acceptedDay = c.acceptedTick != null ? dayKeyFromTick(c.acceptedTick) : -1;
    if (acceptedDay === settledDay) {
      return { ...c, fulfilledToday: 0, lastSettledDay: settledDay };
    }

    const need = requiredDeparturesFor(c, company.level);
    const done = Math.min(need, countContractFulfillment(c, assignments, prevTick));
    const missed = Math.max(0, need - done);
    daySettlements.push({ id: c.id, missed });
    let delta = 0;
    if (missed > 0) {
      const rawPenalty = missed * contractMissPenalty(c, company);
      const penalty = Number.isFinite(rawPenalty) ? rawPenalty : 0;
      delta -= penalty;
      const repLoss = Math.min(8, 2 + missed * 2);
      nextCompany = {
        ...nextCompany,
        reputation: clampReputation(nextCompany.reputation - repLoss),
      };
      notifications.push({
        type: 'warning',
        title: 'Vertragsleistung unterdeckt',
        message: `${c.title}: ${done}/${need} Läufe. Vertragsstrafe ${formatEuro(penalty)}, Bekanntheit −${repLoss}.`,
        read: false,
        created_at: company.updated_at,
      });
      sendMessage(
        'Warnung',
        `Rahmenvertrag unterdeckt: ${c.partner}`,
        `${c.title}: ${done} von ${need} Pflichtläufen. Vertragsstrafe ${formatEuro(penalty)} · Bekanntheit −${repLoss}. Wagen, Lok und Tf disponieren.`,
        nextTick,
      );
    } else {
      operatingKm += Math.max(0, Number(c.corridorKm) || 0) * done;
      const repGain = reputationGainForFulfilledContract(done);
      nextCompany = {
        ...nextCompany,
        reputation: clampReputation(nextCompany.reputation + repGain),
      };
      notifications.push({
        type: 'success',
        title: 'Rahmenvertrag erfüllt',
        message: `${c.title}: ${done}/${need} Pflichtläufe disponiert. Reputation +${repGain}.`,
        read: false,
        created_at: company.updated_at,
      });
    }
    if (delta !== 0) {
      nextCompany = { ...nextCompany, balance: nextCompany.balance + delta };
    }
    return { ...c, fulfilledToday: 0, lastSettledDay: settledDay };
  });

  return { list: nextList, company: nextCompany, notifications, operatingKm, daySettlements, expiredIds };
}

export function newLocalId(): string {
  return newNotificationId();
}
