import type { Company, CountryPackage, Locomotive, Order, OrderType } from '@/lib/supabase';
import { newNotificationId, tickToDate, tickToIso } from '@/lib/gameTime';
import { loadJson, saveJson } from '@/lib/storage';
import { clampOrderMinBrh } from '@/lib/status';
import { DEALER_WAGON_TYPES } from '@/lib/dealer';
import { inferCountryFromLabel } from '@/lib/networkAccess';
import { analyzeFleetForMarket, isOrderElectrified } from '@/lib/traction';
import {
  DIESEL_EUR_PER_KM,
  TRASSE_EUR_PER_TRAIN_KM,
  TRASSE_WEIGHT_EUR_PER_100T_KM,
} from '@/lib/operatingRates';
import { ownedNetworkSites, type DepotRegion } from '@/lib/networkSites';
import { EXCLUSIVE_YIELD_FACTOR, exclusiveJobsUnlocked } from '@/lib/reputation';

export const ORDER_MARKET_KEY = 'evu-order-market';
export const MARKET_REFRESH_DAY_KEY = 'evu-market-refresh-day';

/** Calendar day of the in-game clock (YYYY-MM-DD), used for once-per-day market refresh. */
export function marketRefreshDayKey(tick: number, extraMinutes = 0): string {
  const d = tickToDate(tick, extraMinutes);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function loadMarketRefreshDay(): string | null {
  const value = loadJson<string | null>(MARKET_REFRESH_DAY_KEY, null);
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function saveMarketRefreshDay(day: string): void {
  saveJson(MARKET_REFRESH_DAY_KEY, day);
}

export function isMarketRefreshAvailable(lastDay: string | null, tick: number, extraMinutes = 0): boolean {
  return lastDay !== marketRefreshDayKey(tick, extraMinutes);
}

/** Freight revenue is a transparent combination of preparation fee and ton-kilometre rate. */
export type FreightPriceBand = 'intermodal' | 'block' | 'bulk';

export interface FreightRevenueRate {
  /** Mature (Level 6+) compensation for disposition, wagon provision and readiness. */
  baseFee: number;
  /** Mature (Level 6+) compensation per transported tonne-kilometre. */
  eurPerTkm: number;
}

/**
 * No distance cap is applied: longer routes gain revenue proportionally with their transport work.
 * The player-level multiplier is applied to both components equally and is intentionally visible in the order notes.
 */
export const SPOT_REVENUE_RATES: Record<FreightPriceBand, FreightRevenueRate> = {
  intermodal: { baseFee: 3_500, eurPerTkm: 0.065 },
  block: { baseFee: 2_400, eurPerTkm: 0.06 },
  bulk: { baseFee: 2_000, eurPerTkm: 0.06 },
};

export interface CommercialStanding {
  level?: number;
  reputation?: number;
}

export function standingFromCompany(
  company: Pick<Company, 'level' | 'reputation'> | null | undefined,
): CommercialStanding {
  return {
    level: Math.max(1, Number(company?.level) || 1),
    reputation: Math.max(0, Number(company?.reputation) || 0),
  };
}

/**
 * Level 1–3: 50–55 % of mature rates.
 * Level 4–5 ramp; reputation adds a small bonus only from Level 4.
 */
export function freightRevenueMultiplier(standing?: CommercialStanding | null): number {
  if (standing == null || (standing.level == null && standing.reputation == null)) return 1;
  const level = Math.max(1, Number(standing.level) || 1);
  const rep = Math.max(0, Number(standing.reputation) || 0);
  let m = 1;
  if (level <= 1) m = 0.52;
  else if (level <= 2) m = 0.54;
  else if (level <= 3) m = 0.55;
  else if (level <= 4) m = 0.68;
  else if (level <= 5) m = 0.86;
  else m = 1;
  if (level >= 4) {
    if (rep >= 70) m = Math.min(1, m + 0.08);
    else if (rep >= 50) m = Math.min(1, m + 0.04);
  }
  return m;
}

export function baugleisRevenueMultiplier(standing?: CommercialStanding | null): number {
  return Math.min(1, freightRevenueMultiplier(standing) + 0.12);
}

export function maxSpotDistanceKm(level: number): number {
  if (level <= 1) return 120;
  if (level <= 2) return 190;
  if (level <= 3) return 280;
  if (level <= 4) return 520;
  return 900;
}

/** Interpolation anchors for km / t. Outside this window the factor is clamped to 0…1. */
export const SPOT_INTERP = {
  kmMin: 50,
  kmMax: 800,
  tMin: 400,
  tMax: 1600,
  kmWeight: 0.55,
  tWeight: 0.45,
} as const;

export const BAUGLEIS_DEPLOYMENT_DAYS = [15, 30, 45, 60, 90, 180] as const;
export type BaugleisDuration = (typeof BAUGLEIS_DEPLOYMENT_DAYS)[number];

export function allowedEinsatzDays(level: number): BaugleisDuration[] {
  if (level <= 1) return [15];
  if (level <= 2) return [15, 30];
  if (level <= 3) return [15, 30, 45];
  if (level <= 4) return [15, 30, 45, 60];
  if (level <= 5) return [15, 30, 45, 60, 90];
  return [...BAUGLEIS_DEPLOYMENT_DAYS];
}

export const BAUGLEIS_MIN_DRIVERS = 2;

/**
 * Baugleis deployments are charged per day. The rate covers a default daily operating-cost baseline
 * (route path, diesel and an external AZF allowance) plus a route-/load-sensitive margin for the
 * exclusive locomotive and two-driver capacity.
 */
export const BAUGLEIS_DAILY_FLOOR = 1_200;
/** Safety limit only; regular generated offers stay far below it and are not commercially capped. */
export const BAUGLEIS_DAILY_SAFETY_CEILING = 25_000;
export const BAUGLEIS_SITE_MARGIN_BASE = 1_600;
export const BAUGLEIS_SITE_MARGIN_EUR_PER_KM = 7;
export const BAUGLEIS_SITE_MARGIN_EUR_PER_100T = 55;
export const BAUGLEIS_RISK_BUFFER = 180;

/** Mirrors operatingRates without importing operatingCosts (circular with isBaugleisEinsatz). */
export const BAUGLEIS_BASE_PATH_EUR_PER_TRAIN_KM = TRASSE_EUR_PER_TRAIN_KM;
export const BAUGLEIS_BASE_PATH_EUR_PER_100T_KM = TRASSE_WEIGHT_EUR_PER_100T_KM;
export const BAUGLEIS_PATH_FACTOR = 0.65;
export const BAUGLEIS_DIESEL_EUR_PER_KM = DIESEL_EUR_PER_KM;
export const SPECIAL_ORDER_YIELD_FACTOR = 1.28;
export const BAUGLEIS_PDL_DAILY_MIN = 650;
export const BAUGLEIS_PDL_DAILY_MAX = 850;

export interface BaugleisRateBreakdown {
  dailyRate: number;
  estimatedOperatingCost: number;
  estimatedPathCost: number;
  estimatedEnergyCost: number;
  estimatedPdlCost: number;
  operatingMargin: number;
  baseMargin: number;
}


export type FreightCustomerCategory = 'gleisbau' | 'stahl' | 'chemie' | 'energie' | 'intermodal';

export interface FreightCustomer {
  id: string;
  name: string;
  category: FreightCustomerCategory;
  wagonTypes: string[];
  cargoLabels: string[];
  minLevel?: number;
  minReputation?: number;
  exclusive?: boolean;
}

export const FREIGHT_CUSTOMERS: FreightCustomer[] = [
  {
    id: 'netzbau',
    name: 'NetzBau Deutschland',
    category: 'gleisbau',
    wagonTypes: ['Facns', 'Res'],
    cargoLabels: ['Schotter', 'Schwellen', 'Schienen'],
  },
  {
    id: 'deutsche-gleisbau',
    name: 'Deutsche Gleisbau GmbH',
    category: 'gleisbau',
    wagonTypes: ['Facns', 'Res'],
    cargoLabels: ['Gleisjoche', 'Weichen', 'Schwellen'],
  },
  {
    id: 'schotter-gleis',
    name: 'Schotter & Gleis Logistik',
    category: 'gleisbau',
    wagonTypes: ['Facns'],
    cargoLabels: ['Schotter', 'Bettungsmaterial'],
  },
  {
    id: 'trackcon',
    name: 'TrackCon Bau',
    category: 'gleisbau',
    wagonTypes: ['Facns', 'Res'],
    cargoLabels: ['Oberleitungsmaterial', 'Masten', 'Schotter'],
  },
  {
    id: 'effirail',
    name: 'EffiRail Infra',
    category: 'gleisbau',
    wagonTypes: ['Res', 'Facns'],
    cargoLabels: ['Fertiggleis', 'Schwellen', 'Kleinerisen'],
  },
  {
    id: 'bayerische-gleis',
    name: 'Bayerische Gleis-Union',
    category: 'gleisbau',
    wagonTypes: ['Facns', 'Res'],
    cargoLabels: ['Schotter', 'Schienen', 'Gleisjoche'],
  },
  {
    id: 'rhein-ruhr-stahl',
    name: 'Rhein-Ruhr Stahl AG',
    category: 'stahl',
    wagonTypes: ['Res'],
    cargoLabels: ['Stahlcoils', 'Brammen', 'Warmband'],
    minLevel: 3,
    minReputation: 22,
  },
  {
    id: 'continental-steel',
    name: 'Continental Steel Works',
    category: 'stahl',
    wagonTypes: ['Res'],
    cargoLabels: ['Coil', 'Grobblech', 'Profilstahl'],
    minLevel: 4,
    minReputation: 35,
  },
  {
    id: 'saar-erz',
    name: 'Saar-Erz Logistik',
    category: 'stahl',
    wagonTypes: ['Eanos'],
    cargoLabels: ['Eisenerz', 'Sinter', 'Schrott'],
    minLevel: 3,
    minReputation: 28,
  },
  {
    id: 'chemworks',
    name: 'ChemWorks Ludwigshafen',
    category: 'chemie',
    wagonTypes: ['Zans'],
    cargoLabels: ['Chemikalien', 'Säuren', 'Lösungsmittel'],
    minLevel: 3,
    minReputation: 30,
  },
  {
    id: 'nordchem',
    name: 'NordChem Logistik',
    category: 'chemie',
    wagonTypes: ['Zans'],
    cargoLabels: ['Industriechemikalien', 'Laugen'],
  },
  {
    id: 'rhein-main-kraftstoff',
    name: 'Rhein-Main Kraftstoff',
    category: 'chemie',
    wagonTypes: ['Zans'],
    cargoLabels: ['Kraftstoff', 'Heizöl', 'Kerosin'],
  },
  {
    id: 'rhein-elbe',
    name: 'Rhein-Elbe Energie',
    category: 'energie',
    wagonTypes: ['Eanos'],
    cargoLabels: ['Kraftwerkskohle', 'Petcoke'],
  },
  {
    id: 'powercoal',
    name: 'PowerCoal Generation',
    category: 'energie',
    wagonTypes: ['Eanos'],
    cargoLabels: ['Energiekohle', 'Braunkohle'],
    minLevel: 4,
    minReputation: 40,
  },
  {
    id: 'ecowood',
    name: 'EcoWood Biomasse',
    category: 'energie',
    wagonTypes: ['Eanos'],
    cargoLabels: ['Holzhackschnitzel', 'Pellets', 'Biomasse'],
  },
  {
    id: 'agrar-donau',
    name: 'Agrar Donau Getreide',
    category: 'energie',
    wagonTypes: ['Tads'],
    cargoLabels: ['Getreide', 'Weizen', 'Mais'],
  },
  {
    id: 'kali-werke',
    name: 'Kaliwerke Zielitz',
    category: 'energie',
    wagonTypes: ['Tads'],
    cargoLabels: ['Kali', 'Düngemittel'],
    minLevel: 3,
    minReputation: 25,
  },
  {
    id: 'baustoff-mitte',
    name: 'Baustoff-Logistik Mitte',
    category: 'gleisbau',
    wagonTypes: ['Tads'],
    cargoLabels: ['Baustoffe', 'Zement', 'Kalk'],
  },
  {
    id: 'translog',
    name: 'TransLog Intermodal',
    category: 'intermodal',
    wagonTypes: ['Sggrss'],
    cargoLabels: ['Container', 'Wechselbehälter'],
    minLevel: 4,
    minReputation: 42,
  },
  {
    id: 'europort',
    name: 'EuroPort Container Service',
    category: 'intermodal',
    wagonTypes: ['Sggrss'],
    cargoLabels: ['Seecontainer', 'Hinterlandboxen'],
    minLevel: 5,
    minReputation: 52,
  },
  {
    id: 'autotrans',
    name: 'AutoTrans Central',
    category: 'intermodal',
    wagonTypes: ['Hbbillns', 'Res'],
    cargoLabels: ['Fahrzeugteile', 'CKD-Sätze', 'Karosserien'],
    minLevel: 5,
    minReputation: 58,
  },
  {
    id: 'nord-west-cargo',
    name: 'Nord-West Cargo',
    category: 'intermodal',
    wagonTypes: ['Sggrss'],
    cargoLabels: ['Container', 'Hinterlandboxen'],
    minLevel: 4,
    minReputation: 38,
  },
  {
    id: 'papier-nord',
    name: 'NordPapier Logistik',
    category: 'intermodal',
    wagonTypes: ['Hbbillns'],
    cargoLabels: ['Papier', 'Rollenpapier'],
  },
  {
    id: 'nordsee-erz',
    name: 'Nordsee Erz AG',
    category: 'stahl',
    wagonTypes: ['Eanos'],
    cargoLabels: ['Eisenerz-Ganzzug', 'Pellets Erz'],
    minLevel: 4,
    minReputation: 70,
    exclusive: true,
  },
  {
    id: 'alpen-nord',
    name: 'Alpen-Nord Intermodal',
    category: 'intermodal',
    wagonTypes: ['Sggrss'],
    cargoLabels: ['Premium-Container', 'Ganzzug-Boxen'],
    minLevel: 5,
    minReputation: 85,
    exclusive: true,
  },
];

export const FREIGHT_CUSTOMER_COUNT = FREIGHT_CUSTOMERS.length;

interface RouteTemplate {
  origin: string;
  destination: string;
  distanceKm: number;
  originCountry?: CountryPackage;
  destCountry?: CountryPackage;
  requiresEtcs?: boolean;
  /** Default true (Hauptbahn mit Fahrdraht). False = Anschluss / Bau / Nebenbahn. */
  electrified?: boolean;
  region?: DepotRegion;
}

const ROUTES: Record<FreightCustomerCategory, RouteTemplate[]> = {
  gleisbau: [
    { origin: 'Nürnberg Rbf', destination: 'Baugleis Ingolstadt', distanceKm: 95, electrified: false },
    { origin: 'Würzburg Hbf', destination: 'Baugleis Fulda', distanceKm: 110, electrified: false },
    { origin: 'Leipzig Hbf', destination: 'Baugleis Halle', distanceKm: 35, electrified: false },
    { origin: 'Köln', destination: 'Baugleis Duisburg', distanceKm: 65, electrified: false },
    { origin: 'Hannover', destination: 'Baugleis Fulda', distanceKm: 220, electrified: false },
    { origin: 'Stuttgart', destination: 'Baugleis Würzburg', distanceKm: 180, electrified: false },
    { origin: 'Dresden', destination: 'Baugleis Leipzig', distanceKm: 120, electrified: false },
    { origin: 'München-Riem', destination: 'Baugleis Ingolstadt', distanceKm: 85, electrified: false },
    { origin: 'Frankfurt', destination: 'Baugleis Köln', distanceKm: 190, electrified: false },
    { origin: 'Berlin', destination: 'Baugleis Hannover', distanceKm: 285, electrified: false },
  ],
  stahl: [
    { origin: 'Duisburg', destination: 'Salzgitter', distanceKm: 280 },
    { origin: 'Salzgitter', destination: 'Stuttgart-Untertürkheim', distanceKm: 510 },
    { origin: 'Duisburg', destination: 'Dortmund', distanceKm: 55 },
    { origin: 'Mannheim', destination: 'Karlsruhe', distanceKm: 70 },
    { origin: 'Salzgitter', destination: 'Hannover', distanceKm: 75 },
    { origin: 'Duisburg', destination: 'München-Riem', distanceKm: 620 },
    { origin: 'Duisburg Hafen', destination: 'Anschlussgleis Thyssen', distanceKm: 22, electrified: false },
    { origin: 'Salzgitter', destination: 'Anschlussgleis Walzwerk', distanceKm: 14, electrified: false },
  ],
  chemie: [
    { origin: 'Ludwigshafen Chemiepark', destination: 'Köln-Niehl', distanceKm: 280 },
    { origin: 'Ludwigshafen Chemiepark', destination: 'Mannheim', distanceKm: 20 },
    { origin: 'Hamburg Billwerder', destination: 'Hannover', distanceKm: 180 },
    { origin: 'Frankfurt', destination: 'Köln', distanceKm: 190 },
    { origin: 'Mannheim', destination: 'Basel', distanceKm: 250, destCountry: 'CH', requiresEtcs: true },
    { origin: 'Ludwigshafen Chemiepark', destination: 'Stuttgart', distanceKm: 140 },
    { origin: 'Ludwigshafen Chemiepark', destination: 'Anschlussgleis Werk Süd', distanceKm: 8, electrified: false },
    { origin: 'Hamburg Billwerder', destination: 'Anschlussgleis Raffinerie', distanceKm: 28, electrified: false },
  ],
  energie: [
    { origin: 'Hamburg Billwerder', destination: 'Hannover', distanceKm: 180 },
    { origin: 'Duisburg', destination: 'Dortmund', distanceKm: 55 },
    { origin: 'Leipzig Hbf', destination: 'Halle', distanceKm: 35 },
    { origin: 'Dresden', destination: 'Leipzig Hbf', distanceKm: 120 },
    { origin: 'Passau', destination: 'Augsburg', distanceKm: 230 },
    { origin: 'Bayreuth', destination: 'Regensburg', distanceKm: 120 },
    { origin: 'Hamburg Billwerder', destination: 'Berlin', distanceKm: 290 },
    { origin: 'Bayreuth', destination: 'Anschlussgleis Steinbruch', distanceKm: 18, electrified: false },
    { origin: 'Passau', destination: 'Anschlussgleis Sägewerk', distanceKm: 24, electrified: false },
  ],
  intermodal: [
    { origin: 'Hamburg Billwerder', destination: 'München-Riem', distanceKm: 790 },
    { origin: 'Hamburg Billwerder', destination: 'Stuttgart', distanceKm: 660 },
    { origin: 'Köln', destination: 'München-Riem', distanceKm: 575 },
    { origin: 'Bremerhaven', destination: 'Hannover', distanceKm: 175 },
    { origin: 'Hamburg Billwerder', destination: 'Frankfurt', distanceKm: 495 },
    { origin: 'Duisburg', destination: 'Basel', distanceKm: 430, destCountry: 'CH', requiresEtcs: true },
    { origin: 'Berlin', destination: 'München-Riem', distanceKm: 585 },
    { origin: 'Wolfsburg', destination: 'Emden', distanceKm: 280 },
    { origin: 'Frankfurt', destination: 'Venlo', distanceKm: 240, destCountry: 'NL' },
    { origin: 'Berlin', destination: 'Poznań', distanceKm: 270, destCountry: 'PL' },
    { origin: 'Dresden', destination: 'Praha', distanceKm: 150, destCountry: 'CZ' },
    { origin: 'München-Riem', destination: 'Innsbruck', distanceKm: 175, destCountry: 'A' },
    { origin: 'München-Riem', destination: 'Verona', distanceKm: 430, destCountry: 'IT', requiresEtcs: true },
    { origin: 'Bremerhaven', destination: 'Anschlussgleis Terminal Ost', distanceKm: 12, electrified: false },
    { origin: 'Köln', destination: 'Anschlussgleis Autowerk', distanceKm: 16, electrified: false },
  ],
};

export interface SpotYieldBreakdown {
  yield: number;
  tkm: number;
  eurPerTkm: number;
  tkmRevenue: number;
  baseRevenue: number;
  band: FreightPriceBand;
  factor: number;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function interpolateLoadFactor(
  distanceKm: number,
  weightT: number,
  anchors: { kmMin: number; kmMax: number; tMin: number; tMax: number; kmWeight: number; tWeight: number } = SPOT_INTERP,
): { factor: number; fKm: number; fT: number } {
  const fKm = clamp01((distanceKm - anchors.kmMin) / (anchors.kmMax - anchors.kmMin));
  const fT = clamp01((weightT - anchors.tMin) / (anchors.tMax - anchors.tMin));
  return { factor: anchors.kmWeight * fKm + anchors.tWeight * fT, fKm, fT };
}

export function freightPriceBand(
  category?: FreightCustomerCategory | null,
  type?: OrderType,
): FreightPriceBand {
  if (category === 'intermodal') return 'intermodal';
  if (category === 'stahl' || category === 'chemie') return 'block';
  if (category === 'energie' || category === 'gleisbau') return 'bulk';
  if (type === 'baugleis') return 'bulk';
  return 'bulk';
}

export function freightCategoryForOrder(order: Pick<Order, 'customer_id' | 'customer' | 'type'>): FreightCustomerCategory | undefined {
  return customerById(order.customer_id)?.category ?? customerByName(order.customer)?.category;
}

/** Implied €/tkm of the interpolated trip (display / notes). Not an add-on. */
export function freightTkmRate(
  type: OrderType,
  distanceKm = 400,
  weightT = 1000,
  category?: FreightCustomerCategory | null,
  standing?: CommercialStanding | null,
): number {
  const priced = computeSpotYield(type, distanceKm, weightT, category, standing);
  return priced.eurPerTkm;
}

/**
 * Spot / industrial trip revenue with transparent, proportional scaling.
 * gross = (band base fee + tkm × band €/tkm) × player standing multiplier.
 * Unlike the previous interpolation, no route-length ceiling can make a longer run less profitable than a short run.
 */
export function computeSpotYield(
  type: OrderType,
  distanceKm: number,
  weightT: number,
  category?: FreightCustomerCategory | null,
  standing?: CommercialStanding | null,
): SpotYieldBreakdown {
  const km = Math.max(0, distanceKm);
  const tons = Math.max(0, weightT);
  const tkm = km * tons;
  const band = freightPriceBand(category, type);
  const rate = SPOT_REVENUE_RATES[band];
  const multiplier = freightRevenueMultiplier(standing);
  const baseRevenue = Math.round(rate.baseFee * multiplier);
  const tkmRevenue = Math.round(tkm * rate.eurPerTkm * multiplier);
  const yieldAmt = Math.round(Math.max(400, baseRevenue + tkmRevenue));
  const eurPerTkm = tkm > 0 ? yieldAmt / tkm : 0;
  return {
    yield: yieldAmt,
    tkm,
    eurPerTkm,
    tkmRevenue,
    baseRevenue,
    band,
    factor: 1,
  };
}

export function scaleLegacyAmount(amount: number): number {
  return Math.round(amount);
}

export function isBaugleisEinsatz(order: Order | null | undefined): boolean {
  if (!order) return false;
  return order.type === 'baugleis' && (order.deployment_days ?? 0) > 0;
}

export function isConstructionLoco(loco: Locomotive): boolean {
  return loco.fuel_type === 'diesel' || loco.fuel_type === 'dual';
}

export function requiredDriversFor(order: Order): number {
  if (isBaugleisEinsatz(order)) return BAUGLEIS_MIN_DRIVERS;
  return Math.max(1, order.required_drivers ?? 1);
}

/**
 * Baugleis day rate = estimated daily operating-cost baseline + commercial capacity margin.
 * It responds directly to distance and mass instead of stopping at a fixed revenue cap.
 */
export function computeBaugleisDailyRate(
  _days: number,
  siteKm = 80,
  weightT = 900,
  standing?: CommercialStanding | null,
): BaugleisRateBreakdown {
  const km = Math.max(0, siteKm);
  const tons = Math.max(0, weightT);
  const pathRate = (BAUGLEIS_BASE_PATH_EUR_PER_TRAIN_KM + BAUGLEIS_BASE_PATH_EUR_PER_100T_KM * (tons / 100)) * BAUGLEIS_PATH_FACTOR;
  const estimatedPathCost = Math.round(pathRate * km);
  const estimatedEnergyCost = Math.round(BAUGLEIS_DIESEL_EUR_PER_KM * km);
  const pdlLoad = clamp01((tons - 400) / 1000);
  const estimatedPdlCost = Math.round(BAUGLEIS_PDL_DAILY_MIN + pdlLoad * (BAUGLEIS_PDL_DAILY_MAX - BAUGLEIS_PDL_DAILY_MIN));
  const estimatedOperatingCost = estimatedPathCost + estimatedEnergyCost + estimatedPdlCost;
  const matureMargin =
    BAUGLEIS_SITE_MARGIN_BASE +
    km * BAUGLEIS_SITE_MARGIN_EUR_PER_KM +
    (tons / 100) * BAUGLEIS_SITE_MARGIN_EUR_PER_100T;
  const baseMargin = Math.max(1_400, matureMargin * baugleisRevenueMultiplier(standing));
  const operatingMargin = Math.round(baseMargin + BAUGLEIS_RISK_BUFFER);
  const dailyRate = clampBaugleisDailyRate(estimatedOperatingCost + operatingMargin);
  return {
    dailyRate,
    estimatedOperatingCost,
    estimatedPathCost,
    estimatedEnergyCost,
    estimatedPdlCost,
    operatingMargin,
    baseMargin: Math.round(baseMargin),
  };
}

export function baugleisDailyRate(days: number, siteKm = 80, weightT = 900, standing?: CommercialStanding | null): number {
  return computeBaugleisDailyRate(days, siteKm, weightT, standing).dailyRate;
}

export function clampBaugleisDailyRate(rate: number): number {
  if (!Number.isFinite(rate)) return BAUGLEIS_DAILY_FLOOR;
  return Math.round(Math.max(BAUGLEIS_DAILY_FLOOR, Math.min(BAUGLEIS_DAILY_SAFETY_CEILING, rate)));
}

export function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const current = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.max(1, Math.round((current - start) / 86_400_000));
}

const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function shortOrderId(entropy = Math.random()): string {
  let n = Math.floor(entropy * 32 ** 3);
  if (!Number.isFinite(n) || n < 0) n = Math.floor(Math.random() * 32 ** 3);
  let out = '';
  for (let i = 0; i < 3; i += 1) {
    out = ID_ALPHABET[n % 32] + out;
    n = Math.floor(n / 32);
  }
  return out;
}

/** In-game order number: `AIX-2026-[day-of-year]-[ID]`. */
export function formatOrderNumber(gameDate: Date, shortId: string): string {
  const year = gameDate.getFullYear();
  const doy = String(dayOfYear(gameDate)).padStart(3, '0');
  return `AIX-${year}-${doy}-${shortId}`;
}

export function uniqueOrderNumber(gameDate: Date, used: Set<string>): string {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const candidate = formatOrderNumber(gameDate, shortOrderId());
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  const fallback = formatOrderNumber(gameDate, shortOrderId(Date.now() % 32768));
  used.add(fallback);
  return fallback;
}

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Market sizes are deliberately visible in the generated note and used for Early-Game accessibility. */
export type FreightLoadClass = 'leicht' | 'mittel' | 'schwer';

export interface MarketGenerationContext {
  /** Current wagon-berth capacity, not the free berth count. Defaults to the starter depot. */
  wagonBerthCapacity?: number;
  /** Player locomotives — the generator guarantees matching traction, wire and weight. */
  locomotives?: Locomotive[];
  /** Owned EVU operating sites unlock matching regional corridors. */
  ownedSiteIds?: string[];
}

export interface MarketSizingPolicy {
  guaranteedLightOrders: number;
  allowedClasses: FreightLoadClass[];
  wagonBerthCapacity: number;
}

const FREIGHT_LOAD_RANGES: Record<FreightLoadClass, { min: number; max: number; label: string }> = {
  leicht: { min: 4, max: 6, label: 'Leichtauftrag' },
  mittel: { min: 7, max: 9, label: 'Mittelauftrag' },
  schwer: { min: 10, max: 14, label: 'Schwerauftrag' },
};

/** Typical loaded tonnes per wagon are local balancing values, keeping weight proportional to wagon count. */
const WAGON_PAYLOAD_T: Record<string, { min: number; max: number }> = {
  Facns: { min: 72, max: 96 },
  Eanos: { min: 68, max: 92 },
  Tads: { min: 62, max: 88 },
  Sggrss: { min: 82, max: 110 },
  Zans: { min: 58, max: 78 },
  Hbbillns: { min: 42, max: 62 },
  Res: { min: 55, max: 80 },
};

/**
 * Early depots always receive three 4–6-wagon offers. Larger capacity and company level unlock
 * medium first and heavy jobs later, while at least two light jobs remain on every refresh.
 */
export function marketSizingPolicy(
  standing?: CommercialStanding | null,
  context?: MarketGenerationContext | null,
): MarketSizingPolicy {
  const level = Math.max(1, Number(standing?.level) || 1);
  const wagonBerthCapacity = Math.max(1, Math.round(Number(context?.wagonBerthCapacity) || 25));
  const earlyMarket = level <= 1 || wagonBerthCapacity <= 25;
  const heavyUnlocked = level >= 3 && wagonBerthCapacity >= 36;
  return {
    guaranteedLightOrders: earlyMarket ? 3 : 2,
    allowedClasses: heavyUnlocked ? ['leicht', 'mittel', 'schwer'] : ['leicht', 'mittel'],
    wagonBerthCapacity,
  };
}

export interface WagonNeed {
  count: number;
  weight: number;
  loadClass: FreightLoadClass;
  classLabel: string;
  payloadPerWagon: number;
}

export function wagonNeed(
  type: string,
  loadClass: FreightLoadClass = 'mittel',
  maxWeightT?: number,
): WagonNeed {
  const range = FREIGHT_LOAD_RANGES[loadClass];
  let count = randInt(range.min, range.max);
  const payload = WAGON_PAYLOAD_T[type] ?? { min: 58, max: 82 };
  let payloadPerWagon = randInt(payload.min, payload.max);
  const cap = Number.isFinite(maxWeightT) && (maxWeightT ?? 0) > 0 ? Math.max(180, Math.floor(maxWeightT as number)) : null;
  if (cap != null) {
    while (count * payloadPerWagon > cap && count > 2) count -= 1;
    if (count * payloadPerWagon > cap) {
      payloadPerWagon = Math.max(payload.min, Math.floor(cap / Math.max(1, count)));
    }
  }
  return {
    count,
    weight: count * payloadPerWagon,
    loadClass,
    classLabel: range.label,
    payloadPerWagon,
  };
}

/** Cargo → dealer wagon type. Unknown types fall back to a buyable type. */
export function wagonTypeForCargo(cargo: string, fallback?: string | null): string {
  const c = cargo.toLowerCase();
  if (/schotter|bettung/.test(c)) return 'Facns';
  if (/schrott|erz|sinter|kohle|petcoke|holz|hackschnitzel|pellet|biomasse/.test(c)) return 'Eanos';
  if (/stückgut|stueckgut|papier|palette|packung|fahrzeugteil|ckd/.test(c)) return 'Hbbillns';
  if (/getreide|weizen|mais|gerste|kali|dünger|baustoff|zement|kalk/.test(c)) return 'Tads';
  if (/kessel|chemie|säure|lauge|kraftstoff|heizöl|kerosin|lösungsmittel/.test(c)) return 'Zans';
  if (/container|wechselbehälter|seecontainer|hinterland/.test(c)) return 'Sggrss';
  if (/coil|stahl|blech|bramme|profil|schiene|schwelle|weiche|joch|flach|karosserie/.test(c)) return 'Res';
  return remapRequiredWagonType(fallback, cargo) ?? 'Res';
}

export function remapRequiredWagonType(type: string | null | undefined, cargoHint?: string): string | null {
  if (!type) return type ?? null;
  if (DEALER_WAGON_TYPES.includes(type)) return type;
  const blob = `${type ?? ''} ${cargoHint ?? ''}`.toLowerCase();
  if (/eanos|eanoss|eas\b/.test(blob)) return 'Eanos';
  if (/hbbillns|hbbins|habbins|schiebewand/.test(blob)) return 'Hbbillns';
  if (/tads|tadns|tdggs|gedeckt/.test(blob)) return 'Tads';
  if (/facns|fcs|falns|schotter/.test(blob)) return 'Facns';
  if (/zans|zaes|kessel/.test(blob)) return 'Zans';
  if (/sggrss|sgns|container/.test(blob)) return 'Sggrss';
  if (/res|rmms|flach|coil/.test(blob)) return 'Res';
  if (/schrott|erz|kohle|holz/.test(blob)) return 'Eanos';
  if (/stückgut|stueckgut|papier|palette/.test(blob)) return 'Hbbillns';
  if (/getreide|kali|baustoff/.test(blob)) return 'Tads';
  return 'Res';
}

const SPERRPAUSEN: Array<[string, string, number]> = [
  ['22:00', '04:00', 150],
  ['23:00', '05:00', 120],
  ['20:00', '03:00', 180],
  ['21:00', '04:30', 160],
];

export function applyFreightPricing(order: Order, standing?: CommercialStanding | null): Order {
  if (!order || typeof order !== 'object') {
    return order as Order;
  }
  const category = freightCategoryForOrder(order);
  const priced = computeSpotYield(
    order.type,
    Number(order.distance_km) || 0,
    Number(order.weight_t) || 0,
    category,
    standing,
  );
  const deployment = isBaugleisEinsatz(order);
  const daily = deployment
    ? baugleisDailyRate(
        order.deployment_days ?? 30,
        Number(order.distance_km) || 0,
        Number(order.weight_t) || 0,
        standing,
      )
    : null;
  const penaltyPerMin = Number(order.penalty_per_min) || 0;
  const alignedType = remapRequiredWagonType(
    order.required_wagon_type,
    `${order.title} ${order.notes ?? ''} ${order.customer ?? ''}`,
  );
  const originCountry = order.origin_country ?? inferCountryFromLabel(order.origin);
  const destCountry = order.destination_country ?? inferCountryFromLabel(order.destination);
  const requiresEtcs =
    order.requires_etcs === true || originCountry === 'CH' || destCountry === 'CH' || originCountry !== destCountry;
  const special = order.special === true;
  const exclusive = order.exclusive === true;
  const yieldFactor = exclusive ? EXCLUSIVE_YIELD_FACTOR : special ? SPECIAL_ORDER_YIELD_FACTOR : 1;
  const yieldAmt =
    deployment && daily != null
      ? daily * (order.deployment_days ?? 0)
      : Math.round(priced.yield * yieldFactor);
  const tkmRevenue = Math.round(priced.tkmRevenue * yieldFactor);
  const electrified = isOrderElectrified(order);
  return {
    ...order,
    required_wagon_type: alignedType,
    origin_country: originCountry,
    destination_country: destCountry,
    requires_etcs: requiresEtcs,
    yield: yieldAmt,
    tkm_revenue: tkmRevenue,
    eur_per_tkm: priced.tkm > 0 ? yieldAmt / priced.tkm : priced.eurPerTkm,
    daily_rate: daily,
    penalty: scaleLegacyAmount(Number(order.penalty) || 0),
    penalty_per_min: penaltyPerMin > 0 ? scaleLegacyAmount(penaltyPerMin) : 0,
    electrified,
    special,
    exclusive,
  };
}

function routeCountries(route: RouteTemplate): {
  origin_country: CountryPackage;
  destination_country: CountryPackage;
  requires_etcs: boolean;
} {
  const origin_country = route.originCountry ?? inferCountryFromLabel(route.origin);
  const destination_country = route.destCountry ?? inferCountryFromLabel(route.destination);
  const requires_etcs =
    Boolean(route.requiresEtcs) || origin_country === 'CH' || destination_country === 'CH' || origin_country !== destination_country;
  return { origin_country, destination_country, requires_etcs };
}

function routeIsElectrified(route: RouteTemplate): boolean {
  return route.electrified !== false;
}

function inferRouteRegion(route: Pick<RouteTemplate, 'origin' | 'destination' | 'region'>): DepotRegion {
  if (route.region) return route.region;
  const blob = `${route.origin} ${route.destination}`.toLowerCase();
  if (/duisburg|dortmund|thyssen/.test(blob)) return 'ruhr';
  if (/hamburg|maschen|bremerhaven|emden/.test(blob)) return 'nord';
  if (/münchen|muenchen|augsburg|passau|ingolstadt|innsbruck|verona/.test(blob)) return 'sued';
  if (/leipzig|dresden|halle|berlin|pozna/.test(blob)) return 'ost';
  if (/ludwigshafen|mannheim|karlsruhe|stuttgart|frankfurt/.test(blob)) return 'mitte';
  if (/köln|koeln|venlo/.test(blob)) return 'west';
  return 'ruhr';
}

function pickRoute(
  category: FreightCustomerCategory,
  standing?: CommercialStanding | null,
  electrified?: boolean,
  preferredRegions?: ReadonlySet<DepotRegion> | null,
): RouteTemplate {
  const cap = maxSpotDistanceKm(Math.max(1, Number(standing?.level) || 1));
  const wantWire = electrified !== false;
  const all = ROUTES[category];
  const byWire = all.filter((r) => routeIsElectrified(r) === wantWire);
  const source = byWire.length > 0 ? byWire : wantWire ? all.filter(routeIsElectrified) : all.filter((r) => !routeIsElectrified(r));
  const poolSource = source.length > 0 ? source : all;
  const regional =
    preferredRegions && preferredRegions.size > 0
      ? poolSource.filter((r) => preferredRegions.has(inferRouteRegion(r)))
      : poolSource;
  const scoped = regional.length > 0 ? regional : poolSource;
  const local = scoped.filter((r) => r.distanceKm <= cap);
  const pool = local.length > 0 ? local : [...scoped].sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 2);
  return pick(pool);
}

function loadClassForHook(hookT: number, allowed: FreightLoadClass[], prefer: 'light' | 'heavy' | 'mix'): FreightLoadClass {
  const can = new Set(allowed);
  if (prefer === 'light' || hookT < 900) return 'leicht';
  if (prefer === 'heavy' && can.has('schwer') && hookT >= 1_400) return 'schwer';
  if (can.has('mittel') && hookT >= 700) return prefer === 'heavy' ? (can.has('schwer') ? 'schwer' : 'mittel') : 'mittel';
  return 'leicht';
}

function eligibleCustomers(
  list: FreightCustomer[],
  standing?: CommercialStanding | null,
): FreightCustomer[] {
  const level = Math.max(1, Number(standing?.level) || 1);
  const rep = Math.max(0, Number(standing?.reputation) || 0);
  const next = list.filter(
    (c) =>
      (c.minLevel ?? 1) <= level &&
      (c.minReputation ?? 0) <= rep &&
      (!c.exclusive || exclusiveJobsUnlocked(rep)),
  );
  return next.length > 0 ? next : list.filter((c) => (c.minLevel ?? 1) <= 1 && !c.exclusive);
}

interface SpotBuildOptions {
  asConstructionSpot: boolean;
  loadClass?: FreightLoadClass;
  electrified?: boolean;
  maxWeightT?: number;
  special?: boolean;
  exclusive?: boolean;
  routeOverride?: RouteTemplate;
  regionNote?: string;
  preferredRegions?: ReadonlySet<DepotRegion> | null;
}

function buildSpotOrder(
  customer: FreightCustomer,
  gameDate: Date,
  tick: number,
  usedNumbers: Set<string>,
  standing: CommercialStanding | null | undefined,
  options: SpotBuildOptions,
): Order {
  const asConstructionSpot = options.asConstructionSpot;
  const loadClass = options.loadClass ?? 'mittel';
  const wantWire = options.electrified !== false && !asConstructionSpot && customer.category !== 'gleisbau';
  const route =
    options.routeOverride ?? pickRoute(customer.category, standing, wantWire, options.preferredRegions);
  const electrified = asConstructionSpot || customer.category === 'gleisbau' ? false : routeIsElectrified(route);
  const net = routeCountries(route);
  const cargo = pick(customer.cargoLabels);
  const preferred = wagonTypeForCargo(cargo, pick(customer.wagonTypes));
  const wagonType = customer.wagonTypes.includes(preferred) ? preferred : pick(customer.wagonTypes);
  const need = wagonNeed(wagonType, loadClass, options.maxWeightT);
  const type: OrderType = customer.category === 'gleisbau' || asConstructionSpot ? 'baugleis' : 'gueterverkehr';
  const priced = computeSpotYield(type, route.distanceKm, need.weight, customer.category, standing);
  const exclusive = options.exclusive === true;
  const special = options.special === true || exclusive;
  const yieldFactor = exclusive ? EXCLUSIVE_YIELD_FACTOR : special ? SPECIAL_ORDER_YIELD_FACTOR : 1;
  const yieldAmt = Math.round(priced.yield * yieldFactor);
  const tkmRevenue = Math.round(priced.tkmRevenue * yieldFactor);
  const eurPerTkm = priced.tkm > 0 ? yieldAmt / priced.tkm : priced.eurPerTkm;
  const sperre = type === 'baugleis' ? pick(SPERRPAUSEN) : null;
  const hours = type === 'baugleis' ? randInt(18, 36) : randInt(36, 96);
  const deadline = new Date(gameDate.getTime() + hours * 60 * 60 * 1000).toISOString();
  const wireNote = electrified ? 'elektrifiziert (E-Lok / Dual / Diesel)' : 'ohne Oberleitung (Diesel / Dual, Anschluss oder Baustelle)';
  const specialNote = exclusive
    ? `Exklusiv-Ganzzug · Reputation ${Math.round((EXCLUSIVE_YIELD_FACTOR - 1) * 100)} % Aufschlag · `
    : special
      ? `Spezialauftrag · hochrentabel (+${Math.round((SPECIAL_ORDER_YIELD_FACTOR - 1) * 100)} %) · `
      : '';
  const regionNote = options.regionNote ? `${options.regionNote} · ` : '';
  const titlePrefix = exclusive ? 'Exklusiv · ' : special ? 'Spezial · ' : '';
  const title =
    type === 'baugleis'
      ? `${titlePrefix}${cargo} ${customer.name} · ${route.destination}`
      : `${titlePrefix}${cargo} ${route.origin}–${route.destination}`;

  return {
    id: newNotificationId(),
    order_number: uniqueOrderNumber(gameDate, usedNumbers),
    type,
    title,
    origin: route.origin,
    destination: route.destination,
    distance_km: route.distanceKm,
    weight_t: need.weight,
    yield: yieldAmt,
    penalty: type === 'baugleis' ? scaleLegacyAmount(randInt(2800, 5200)) : scaleLegacyAmount(randInt(180, 800)),
    deadline,
    status: 'offen',
    notes: `${specialNote}${regionNote}${customer.name} · ${wireNote} · ${need.classLabel}: ${need.count}× ${wagonType} · Ø ${need.payloadPerWagon} t/Wagen · ${priced.tkm.toLocaleString('de-DE')} tkm · ${eurPerTkm.toFixed(3).replace('.', ',')} €/tkm (Sockel ${priced.baseRevenue.toLocaleString('de-DE')} € + ${tkmRevenue.toLocaleString('de-DE')} € tkm-Anteil)`,
    min_brh: clampOrderMinBrh(type, type === 'baugleis' ? randInt(50, 65) : randInt(60, 75)),
    required_wagon_type: wagonType,
    required_wagon_count: need.count,
    sperrpause_start: sperre?.[0] ?? null,
    sperrpause_end: sperre?.[1] ?? null,
    penalty_per_min: sperre ? scaleLegacyAmount(sperre[2]) : 0,
    created_at: tickToIso(tick),
    customer: customer.name,
    customer_id: customer.id,
    origin_country: net.origin_country,
    destination_country: net.destination_country,
    requires_etcs: net.requires_etcs,
    contract_id: null,
    deployment_days: null,
    daily_rate: null,
    required_drivers: 1,
    eur_per_tkm: eurPerTkm,
    tkm_revenue: tkmRevenue,
    electrified,
    special,
    exclusive,
  };
}

function buildEinsatzOrder(
  customer: FreightCustomer,
  days: BaugleisDuration,
  gameDate: Date,
  tick: number,
  usedNumbers: Set<string>,
  standing?: CommercialStanding | null,
  maxWeightT?: number,
): Order {
  const route = pickRoute('gleisbau', standing);
  const cargo = pick(customer.cargoLabels);
  const preferred = wagonTypeForCargo(cargo, pick(customer.wagonTypes));
  const wagonType = customer.wagonTypes.includes(preferred) ? preferred : pick(customer.wagonTypes);
  const need = wagonNeed(wagonType, 'mittel', maxWeightT);
  const daily = baugleisDailyRate(days, route.distanceKm, need.weight, standing);
  const priced = computeSpotYield('baugleis', route.distanceKm, need.weight, customer.category, standing);
  const mega = days >= 180;
  const special = days >= 90;
  const label = mega ? 'Mega-Sonderauftrag' : special ? 'Langzeit-Sonderauftrag' : 'Baugleis-Einsatz';

  return {
    id: newNotificationId(),
    order_number: uniqueOrderNumber(gameDate, usedNumbers),
    type: 'baugleis',
    title: `${label} ${days} Tage · ${route.destination}`,
    origin: route.origin,
    destination: route.destination,
    distance_km: route.distanceKm,
    weight_t: need.weight,
    yield: daily * days,
    penalty: scaleLegacyAmount(mega ? 28_000 : 12_000),
    deadline: new Date(gameDate.getTime() + days * 24 * 60 * 60 * 1000).toISOString(),
    status: 'offen',
    notes: `${customer.name} bindet 1 Diesellok (BR 218 / V 90 / BR 290 o. ä.) plus ${BAUGLEIS_MIN_DRIVERS} Tf im Schichtwechsel für ${days} Tage. Tagespauschale ${daily.toLocaleString('de-DE')} € deckt Trasse, Energie und AZF/PDL-Basis plus Einsatzmarge. ${cargo}, ${need.count}× ${wagonType}. Ohne Oberleitung.`,
    min_brh: clampOrderMinBrh('baugleis', randInt(50, 62)),
    required_wagon_type: wagonType,
    required_wagon_count: need.count,
    sperrpause_start: '22:00',
    sperrpause_end: '05:00',
    penalty_per_min: scaleLegacyAmount(200),
    created_at: tickToIso(tick),
    customer: customer.name,
    customer_id: customer.id,
    origin_country: routeCountries(route).origin_country,
    destination_country: routeCountries(route).destination_country,
    requires_etcs: routeCountries(route).requires_etcs,
    contract_id: null,
    deployment_days: days,
    daily_rate: daily,
    required_drivers: BAUGLEIS_MIN_DRIVERS,
    eur_per_tkm: priced.eurPerTkm,
    tkm_revenue: priced.tkmRevenue,
    electrified: false,
    special: mega || special,
  };
}

export function generateMarketOrders(
  tick: number,
  usedNumbers?: Set<string>,
  standing?: CommercialStanding | null,
  context?: MarketGenerationContext | null,
): Order[] {
  const gameDate = tickToDate(tick);
  const used = usedNumbers ?? new Set<string>();
  const level = Math.max(1, Number(standing?.level) || 1);
  const sizing = marketSizingPolicy(standing, context);
  const fleet = analyzeFleetForMarket(context?.locomotives);
  const gleisbau = eligibleCustomers(
    FREIGHT_CUSTOMERS.filter((c) => c.category === 'gleisbau'),
    standing,
  );
  const freight = eligibleCustomers(
    FREIGHT_CUSTOMERS.filter((c) => c.category !== 'gleisbau' && !c.exclusive),
    standing,
  );
  const exclusiveCustomers = eligibleCustomers(
    FREIGHT_CUSTOMERS.filter((c) => c.exclusive),
    standing,
  );
  const sites = ownedNetworkSites(context?.ownedSiteIds);
  const preferredRegions = new Set(sites.map((site) => site.region));
  const orders: Order[] = [];

  const lightCap = Math.min(fleet.minTrailingT * 0.92, fleet.maxOhleTrailingT);
  const heavyCap = fleet.maxOhleTrailingT * 0.92;
  const dieselCap = fleet.maxUnelectrifiedTrailingT * 0.92;

  const guaranteedLight = sizing.guaranteedLightOrders;
  for (let i = 0; i < guaranteedLight; i += 1) {
    orders.push(
      buildSpotOrder(pick(freight), gameDate, tick, used, standing, {
        asConstructionSpot: false,
        loadClass: 'leicht',
        electrified: true,
        maxWeightT: lightCap,
        preferredRegions,
      }),
    );
  }

  const electrifiedCount = 3;
  for (let i = 0; i < electrifiedCount; i += 1) {
    const prefer = i === 0 ? 'light' : i === electrifiedCount - 1 ? 'heavy' : 'mix';
    orders.push(
      buildSpotOrder(pick(freight), gameDate, tick, used, standing, {
        asConstructionSpot: false,
        loadClass: loadClassForHook(fleet.maxOhleTrailingT, sizing.allowedClasses, prefer),
        electrified: true,
        maxWeightT: prefer === 'light' ? lightCap : heavyCap,
        preferredRegions,
      }),
    );
  }

  const unelectrifiedCount = 3;
  for (let i = 0; i < unelectrifiedCount; i += 1) {
    const prefer = i === 0 ? 'light' : 'heavy';
    const fromGleis = i === unelectrifiedCount - 1;
    orders.push(
      buildSpotOrder(pick(fromGleis ? gleisbau : freight), gameDate, tick, used, standing, {
        asConstructionSpot: fromGleis,
        loadClass: loadClassForHook(fleet.maxUnelectrifiedTrailingT, sizing.allowedClasses, prefer),
        electrified: false,
        maxWeightT: dieselCap,
      }),
    );
  }

  orders.push(
    buildSpotOrder(pick(freight), gameDate, tick, used, standing, {
      asConstructionSpot: false,
      loadClass: loadClassForHook(fleet.maxOhleTrailingT, sizing.allowedClasses, 'heavy'),
      electrified: true,
      maxWeightT: heavyCap,
      special: true,
    }),
  );
  orders.push(
    buildSpotOrder(pick(gleisbau), gameDate, tick, used, standing, {
      asConstructionSpot: true,
      loadClass: loadClassForHook(fleet.maxUnelectrifiedTrailingT, sizing.allowedClasses, 'mix'),
      electrified: false,
      maxWeightT: dieselCap,
      special: true,
    }),
  );

  const filler = Math.max(0, randInt(2, 4));
  for (let i = 0; i < filler; i += 1) {
    const wire = i % 2 === 0;
    orders.push(
      buildSpotOrder(pick(freight), gameDate, tick, used, standing, {
        asConstructionSpot: false,
        loadClass: pick(sizing.allowedClasses),
        electrified: wire,
        maxWeightT: wire ? heavyCap : dieselCap,
      }),
    );
  }

  const bauSpot = randInt(1, 2);
  for (let i = 0; i < bauSpot; i += 1) {
    orders.push(
      buildSpotOrder(pick(gleisbau), gameDate, tick, used, standing, {
        asConstructionSpot: true,
        loadClass: pick(sizing.allowedClasses),
        electrified: false,
        maxWeightT: dieselCap,
      }),
    );
  }

  const durations = [...allowedEinsatzDays(level)];
  const einsatzCount = Math.min(durations.length, randInt(2, 4));
  for (let i = 0; i < einsatzCount; i += 1) {
    const idx = Math.floor(Math.random() * durations.length);
    const days = durations.splice(idx, 1)[0] ?? 15;
    orders.push(buildEinsatzOrder(pick(gleisbau), days, gameDate, tick, used, standing, dieselCap));
  }

  if (level >= 6 && !orders.some((o) => o.deployment_days === 180)) {
    if (Math.random() < 0.35) {
      orders.push(buildEinsatzOrder(pick(gleisbau), 180, gameDate, tick, used, standing, dieselCap));
    }
  }

  for (const site of sites) {
    const pool = eligibleCustomers(
      FREIGHT_CUSTOMERS.filter((c) => site.categories.includes(c.category) && !c.exclusive),
      standing,
    );
    if (pool.length === 0 || site.routes.length === 0) continue;
    const siteRoute = pick(site.routes);
    const routeOverride: RouteTemplate = {
      origin: siteRoute.origin,
      destination: siteRoute.destination,
      distanceKm: siteRoute.distanceKm,
      electrified: siteRoute.electrified,
      region: site.region,
    };
    orders.push(
      buildSpotOrder(pick(pool), gameDate, tick, used, standing, {
        asConstructionSpot: !siteRoute.electrified,
        loadClass: loadClassForHook(
          siteRoute.electrified ? fleet.maxOhleTrailingT : fleet.maxUnelectrifiedTrailingT,
          sizing.allowedClasses,
          'mix',
        ),
        electrified: siteRoute.electrified,
        maxWeightT: siteRoute.electrified ? heavyCap : dieselCap,
        routeOverride,
        regionNote: `${site.name}: ${site.flavor}`,
      }),
    );
  }

  if (exclusiveJobsUnlocked(standing?.reputation)) {
    const exclusivePool = exclusiveCustomers.length > 0 ? exclusiveCustomers : freight;
    const exclusiveCount = standing && (standing.reputation ?? 0) >= 85 ? 2 : 1;
    for (let i = 0; i < exclusiveCount; i += 1) {
      const site = sites[i % Math.max(1, sites.length)];
      const siteRoute = site?.routes.find((r) => r.electrified) ?? site?.routes[0];
      const routeOverride: RouteTemplate | undefined = siteRoute
        ? {
            origin: siteRoute.origin,
            destination: siteRoute.destination,
            distanceKm: Math.max(siteRoute.distanceKm, 280),
            electrified: siteRoute.electrified,
            region: site?.region,
          }
        : undefined;
      orders.push(
        buildSpotOrder(pick(exclusivePool), gameDate, tick, used, standing, {
          asConstructionSpot: false,
          loadClass: loadClassForHook(fleet.maxOhleTrailingT, sizing.allowedClasses, 'heavy'),
          electrified: true,
          maxWeightT: heavyCap,
          exclusive: true,
          routeOverride,
          regionNote: 'Exklusivauftrag für Premium-Reputation',
        }),
      );
    }
  }

  return orders;
}

export function refreshMarketOrders(
  existing: Order[],
  tick: number,
  standing?: CommercialStanding | null,
  context?: MarketGenerationContext | null,
): Order[] {
  const keep = existing.filter((o) => o.status !== 'offen');
  const used = new Set(keep.map((o) => o.order_number));
  return [...generateMarketOrders(tick, used, standing, context), ...keep];
}

function gameNowMs(gameNow: Date | number): number {
  return gameNow instanceof Date ? gameNow.getTime() : gameNow;
}

/** True when an unaccepted listing's deadline is already in the past (game time). */
export function isExpiredOpenOffer(order: Pick<Order, 'status' | 'deadline'>, gameNow: Date | number): boolean {
  if (order.status !== 'offen' || !order.deadline) return false;
  const deadlineMs = new Date(order.deadline).getTime();
  return Number.isFinite(deadlineMs) && deadlineMs < gameNowMs(gameNow);
}

/**
 * Frachtbörse listing: status OFFEN (`offen`) and deadline still in the future (gameNow).
 * Assigned (`zugewiesen`), completed (`abgeschlossen`) and rejected (`abgelehnt`) never qualify.
 */
export function isOpenUnexpiredMarketOrder(
  order: Pick<Order, 'status' | 'deadline'>,
  gameNow: Date | number,
): boolean {
  if (order.status !== 'offen' || !order.deadline) return false;
  const deadlineMs = new Date(order.deadline).getTime();
  return Number.isFinite(deadlineMs) && deadlineMs > gameNowMs(gameNow);
}

/** Remove open market listings whose deadline is before gameNow. Assigned contracts are kept. */
export function purgeExpiredOpenOrders(orders: Order[], gameNow: Date | number): Order[] {
  let changed = false;
  const next: Order[] = [];
  for (const order of orders) {
    if (order.contract_id) {
      next.push(order);
      continue;
    }
    if (isExpiredOpenOffer(order, gameNow)) {
      changed = true;
      continue;
    }
    next.push(order);
  }
  return changed ? next : orders;
}

export function loadPersistedOrders(
  gameNow?: Date | number,
  standing?: CommercialStanding | null,
): Order[] | null {
  const loaded = loadJson<Order[] | null>(ORDER_MARKET_KEY, null);
  if (!Array.isArray(loaded) || loaded.length === 0) return null;
  const priced = loaded
    .filter((order): order is Order => Boolean(order && typeof order === 'object' && order.id))
    .map((order) => (order.status === 'offen' ? applyFreightPricing(order, standing) : order));
  return gameNow == null ? priced : purgeExpiredOpenOrders(priced, gameNow);
}

export function savePersistedOrders(orders: Order[]): void {
  saveJson(ORDER_MARKET_KEY, orders);
}

export function customerById(id: string | null | undefined): FreightCustomer | undefined {
  if (!id) return undefined;
  return FREIGHT_CUSTOMERS.find((c) => c.id === id);
}

export function customerByName(name: string | null | undefined): FreightCustomer | undefined {
  if (!name) return undefined;
  return FREIGHT_CUSTOMERS.find((c) => c.name === name);
}
