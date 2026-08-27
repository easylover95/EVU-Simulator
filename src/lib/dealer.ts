import type {
  Company,
  CountryPackage,
  ExtraEquipment,
  FuelType,
  Locomotive,
  SelectableExtraEquipment,
  Wagon,
  WagonCategory,
} from '@/lib/supabase';
import { isNewGameDay, loadJson, saveJson, TICKS_PER_DAY } from '@/lib/storage';
import { newNotificationId } from '@/lib/gameTime';
import { GAME_EPOCH_ISO } from '@/lib/gameTime';
import {
  CONDITION_CLASSES,
  HU_COST_BY_OFFER_ID,
  huConsumedGap,
  maintenanceFromUsedStock,
  randomUsedStock,
  remainingHuFractionFromStock,
  revisedLocoPrice,
  revisedMaintenance,
  usedLocoPrice,
  usedStockNeedsRespin,
  type UsedLocoStock,
} from '@/lib/workshop';
import { ETCS_RATE, etcsPriceForBase } from '@/lib/etcsPricing';

export { ETCS_RATE, etcsPriceForBase };

export {
  WORKSHOP_JOBS_KEY,
  WORKSHOP_RATES,
  completeWorkshopJob,
  loadWorkshopJobs,
  saveWorkshopJobs,
  type WorkshopJob,
  type WorkshopJobKind,
  type WorkshopChannel,
} from '@/lib/workshop';

export const DEALER_STATE_KEY = 'evu-dealer-state';
/** Bump when catalog prices, exact HU table, photo set, or used-price formula change. */
export const DEALER_CATALOG_VERSION = 3;
export const EXTRA_FLEET_KEY = 'evu-extra-fleet';
export const SOLD_ASSETS_KEY = 'evu-sold-assets';

export type Acquisition = 'kauf' | 'leasing';
export type LocoSegment = 'rangier' | 'diesel' | 'elektro' | 'hybrid';
export type LocoCondition = 'neu' | 'gebraucht';
export type LocoBuyVariant = 'used' | 'revised';

export interface LocoAcquireOptions {
  variant: LocoBuyVariant;
  countries: CountryPackage[];
  equipment: ExtraEquipment[];
}

export const DEFAULT_LOCO_ACQUIRE: LocoAcquireOptions = {
  variant: 'revised',
  countries: ['D'],
  equipment: [],
};

export const COUNTRY_PACKAGES: {
  id: CountryPackage;
  label: string;
  price: number;
}[] = [
  { id: 'D', label: 'Deutschland', price: 0 },
  { id: 'A', label: 'Österreich', price: 22_000 },
  { id: 'CH', label: 'Schweiz', price: 48_000 },
  { id: 'PL', label: 'Polen', price: 24_000 },
  { id: 'CZ', label: 'Tschechien', price: 21_000 },
  { id: 'IT', label: 'Italien', price: 38_000 },
  { id: 'NL', label: 'Niederlande', price: 26_000 },
];

export const FUNKFERNSTEUERUNG_PRICE = 12_000;

export const EXTRA_EQUIPMENT_OPTIONS: {
  id: SelectableExtraEquipment;
  label: string;
}[] = [
  { id: 'etcs', label: 'ETCS' },
  { id: 'funkfernsteuerung', label: 'Funkfernsteuerung' },
];

const EQUIPMENT_LABELS: Record<ExtraEquipment, string> = {
  pzb: 'PZB',
  etcs: 'ETCS',
  funkfernsteuerung: 'Funkfernsteuerung',
};

/** Catalog Grundpreis only: flat 8 % for every locomotive. */
export function etcsRateForBase(basePrice: number): number {
  // ETCS uses one uniform rate; retain the catalog price parameter for API symmetry.
  void basePrice;
  return ETCS_RATE;
}

function formatEtcsRatePercent(): string {
  return `${(ETCS_RATE * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;
}

/** PZB is standard (0). ETCS is a flat 8 % of catalog buyPrice. Funkfernsteuerung is a fixed 12 000 €. */
export function extraEquipmentPrice(id: ExtraEquipment, basePrice: number): number {
  if (id === 'etcs') return etcsPriceForBase(basePrice);
  if (id === 'funkfernsteuerung') return FUNKFERNSTEUERUNG_PRICE;
  return 0;
}

/** Checkbox: `ETCS 8 % (+116.000 €)`. Confirm line uses the same rate without the euro suffix. */
export function extraEquipmentLabel(id: ExtraEquipment, basePrice: number): string {
  const price = extraEquipmentPrice(id, basePrice);
  if (id === 'pzb' || price <= 0) return EQUIPMENT_LABELS[id];
  if (id === 'etcs') {
    return `${EQUIPMENT_LABELS[id]} ${formatEtcsRatePercent()} (+${price.toLocaleString('de-DE')} €)`;
  }
  return `${EQUIPMENT_LABELS[id]} (+${price.toLocaleString('de-DE')} €)`;
}

export function extraEquipmentLineLabel(id: ExtraEquipment, basePrice: number): string {
  // Detail rows show the percentage only; the price is rendered separately where needed.
  void basePrice;
  if (id === 'etcs') return `${EQUIPMENT_LABELS[id]} ${formatEtcsRatePercent()}`;
  return EQUIPMENT_LABELS[id];
}

export function packageAddonTotal(
  countries: CountryPackage[],
  equipment: ExtraEquipment[],
  basePrice = 0,
): number {
  const country = countries.reduce((sum, id) => {
    const row = COUNTRY_PACKAGES.find((c) => c.id === id);
    return sum + (row?.price ?? 0);
  }, 0);
  const extra = equipment.reduce((sum, id) => sum + extraEquipmentPrice(id, basePrice), 0);
  return country + extra;
}

export interface LocoOffer {
  id: string;
  designation: string;
  displayName: string;
  fuel_type: FuelType;
  power_kw: number;
  max_speed: number;
  weight_t: number;
  /** Catalog price = 100 % condition & new HU. Revised buy price is exactly this. */
  buyPrice: number;
  /** Exact HU cost (hu_kosten). Used = catalog − HU × consumed. */
  huCost: number;
  photo: string;
  sellPrice: number;
  leaseDaily: number;
  segment: LocoSegment;
  condition: LocoCondition;
  ohleOnly?: boolean;
  blurb: string;
}

export interface WagonOffer {
  id: string;
  type_code: string;
  type_name: string;
  category: WagonCategory;
  capacity_t: number;
  brake_position: 'G' | 'P' | 'R';
  tare_weight_t: number;
  length_mm: number;
  listUnitPrice: number;
  listUnitLease: number;
  sellPriceEach: number;
  cargo: string;
  photo?: string;
}

export const WAGON_QTY_OPTIONS = [1, 2, 4, 8, 12, 16] as const;
export type WagonQty = (typeof WAGON_QTY_OPTIONS)[number];

/** Smallest catalog chip ≥ Bedarf, sonst die größte Stufe. */
export function dealerQtyForNeed(need: number): WagonQty {
  const n = Math.max(1, Math.round(need));
  const match = WAGON_QTY_OPTIONS.find((q) => q >= n);
  return match ?? WAGON_QTY_OPTIONS[WAGON_QTY_OPTIONS.length - 1];
}

/** Daily lease ≈ 0.075 % of unit list buy. */
function wagonLeaseFromList(listUnitPrice: number): number {
  return Math.max(1, Math.round(listUnitPrice * 0.00075));
}

/** Sell-back ≈ previous ~42 % of list (avoids buy-below-sell). */
function wagonSellFromList(listUnitPrice: number): number {
  return Math.round(listUnitPrice * 0.42);
}

/** Volume discount vs list total (Kauf and daily lease). */
export function wagonVolumeDiscount(qty: number): number {
  if (qty >= 16) return 0.4;
  if (qty >= 12) return 0.35;
  if (qty >= 8) return 0.28;
  if (qty >= 4) return 0.2;
  if (qty >= 2) return 0.1;
  return 0;
}

export function wagonVolumeDiscountLabel(qty: number): string | null {
  const pct = Math.round(wagonVolumeDiscount(qty) * 100);
  if (pct <= 0) return null;
  if (pct >= 40) return `Mengenrabatt −${pct}% Mega`;
  return `Mengenrabatt −${pct}%`;
}

export function wagonVolumeDiscountBadge(qty: number): string | null {
  const pct = Math.round(wagonVolumeDiscount(qty) * 100);
  return pct > 0 ? `−${pct}%` : null;
}

export interface WagonQuote {
  qty: number;
  discount: number;
  buyPrice: number;
  leaseDaily: number;
  payloadT: number;
  listBuy: number;
  listLease: number;
}

export function quoteWagonDeal(offer: WagonOffer, qty: number): WagonQuote {
  const count = Math.max(1, Math.round(qty));
  const discount = wagonVolumeDiscount(count);
  const listBuy = offer.listUnitPrice * count;
  const listLease = offer.listUnitLease * count;
  return {
    qty: count,
    discount,
    buyPrice: Math.round(listBuy * (1 - discount)),
    leaseDaily: Math.round(listLease * (1 - discount)),
    payloadT: offer.capacity_t * count,
    listBuy,
    listLease,
  };
}

export const LOCO_SEGMENTS: { id: LocoSegment; title: string; subtitle: string }[] = [
  { id: 'rangier', title: 'Rangier- & Bau', subtitle: 'Leichte und schwere Rangierloks' },
  { id: 'diesel', title: 'Gebrauchte Dieselloks', subtitle: 'Gebrauchtmarkt — Bau, Rettung, Strecke' },
  { id: 'elektro', title: 'Elektroloks (nur Oberleitung)', subtitle: 'Fahrdraht erforderlich' },
  { id: 'hybrid', title: 'Hybrid / Dual Mode', subtitle: 'Premium, Oberleitung + Diesel' },
];

/** Catalog = 100 % condition & new HU. Sell-back / lease scale from that. */
function sellFromCatalog(catalog: number): number {
  return Math.round(catalog * 0.48);
}

function leaseFromCatalog(catalog: number): number {
  return Math.max(40, Math.round(catalog / 2600));
}

export const LOCO_OFFERS: LocoOffer[] = [
  {
    id: 'kof3',
    designation: 'Köf III (BR 333)',
    displayName: 'Köf III · BR 333',
    fuel_type: 'diesel',
    power_kw: 240,
    max_speed: 45,
    weight_t: 22,
    buyPrice: 110_000,
    huCost: HU_COST_BY_OFFER_ID.kof3,
    photo: '/locos/responsive/koef3-clean-640.webp',
    sellPrice: sellFromCatalog(110_000),
    leaseDaily: leaseFromCatalog(110_000),
    segment: 'rangier',
    condition: 'gebraucht',
    blurb: 'Kleinste Rangierlok — Werkverschub und kurze Übergaben.',
  },
  {
    id: 'v60',
    designation: 'V 60 (BR 360/365)',
    displayName: 'V 60 · BR 360/365',
    fuel_type: 'diesel',
    power_kw: 478,
    max_speed: 60,
    weight_t: 54,
    buyPrice: 220_000,
    huCost: HU_COST_BY_OFFER_ID.v60,
    photo: '/locos/responsive/v60-clean-640.webp',
    sellPrice: sellFromCatalog(220_000),
    leaseDaily: leaseFromCatalog(220_000),
    segment: 'rangier',
    condition: 'gebraucht',
    blurb: 'Leichte Rangierlok — günstig für Übergabe und Werkverschub.',
  },
  {
    id: 'v90',
    designation: 'V 90 (BR 290/294)',
    displayName: 'V 90 · BR 290/294',
    fuel_type: 'diesel',
    power_kw: 800,
    max_speed: 80,
    weight_t: 68,
    buyPrice: 380_000,
    huCost: HU_COST_BY_OFFER_ID.v90,
    photo: '/locos/responsive/v90-clean-640.webp',
    sellPrice: sellFromCatalog(380_000),
    leaseDaily: leaseFromCatalog(380_000),
    segment: 'rangier',
    condition: 'gebraucht',
    blurb: 'Schwere Rangier- und Übergabelok für Anschlussgleise.',
  },
  {
    id: 'br218',
    designation: 'BR 218',
    displayName: 'BR 218',
    fuel_type: 'diesel',
    power_kw: 1840,
    max_speed: 140,
    weight_t: 80,
    buyPrice: 480_000,
    huCost: HU_COST_BY_OFFER_ID.br218,
    photo: '/locos/responsive/br218-clean-640.webp',
    sellPrice: sellFromCatalog(480_000),
    leaseDaily: leaseFromCatalog(480_000),
    segment: 'diesel',
    condition: 'gebraucht',
    blurb: 'Streckendiesel für Bauzüge und Rettungsfahrten.',
  },
  {
    id: 'br232',
    designation: 'BR 232 Ludmilla',
    displayName: 'BR 232 Ludmilla',
    fuel_type: 'diesel',
    power_kw: 2200,
    max_speed: 120,
    weight_t: 116,
    buyPrice: 550_000,
    huCost: HU_COST_BY_OFFER_ID.br232,
    photo: '/locos/responsive/br232-clean-640.webp',
    sellPrice: sellFromCatalog(550_000),
    leaseDaily: leaseFromCatalog(550_000),
    segment: 'diesel',
    condition: 'gebraucht',
    blurb: 'Sechsachsige Streckendiesel für schwere Bau- und Güterzüge.',
  },
  {
    id: 'g1206',
    designation: 'G 1206 (1500 kW)',
    displayName: 'G 1206 (1500 kW)',
    fuel_type: 'diesel',
    power_kw: 1500,
    max_speed: 100,
    weight_t: 80,
    buyPrice: 620_000,
    huCost: HU_COST_BY_OFFER_ID.g1206,
    photo: '/locos/responsive/g1206-640.webp',
    sellPrice: sellFromCatalog(620_000),
    leaseDaily: leaseFromCatalog(620_000),
    segment: 'diesel',
    condition: 'gebraucht',
    blurb: 'Vierachsige Streckendiesel für Schotter- und Bauverkehre.',
  },
  {
    id: 'br272',
    designation: 'G 2000 BB (BR 272, 2240 kW)',
    displayName: 'G 2000 BB (BR 272, 2240 kW)',
    fuel_type: 'diesel',
    power_kw: 2240,
    max_speed: 120,
    weight_t: 90,
    buyPrice: 780_000,
    huCost: HU_COST_BY_OFFER_ID.br272,
    photo: '/locos/responsive/g2000-640.webp',
    sellPrice: sellFromCatalog(780_000),
    leaseDaily: leaseFromCatalog(780_000),
    segment: 'diesel',
    condition: 'gebraucht',
    blurb: 'Zweiführerstands-Streckendiesel, stärker und teurer als die G 1206.',
  },
  {
    id: 'de18',
    designation: 'DE 18',
    displayName: 'DE 18',
    fuel_type: 'diesel',
    power_kw: 1800,
    max_speed: 120,
    weight_t: 80,
    buyPrice: 950_000,
    huCost: HU_COST_BY_OFFER_ID.de18,
    photo: '/locos/responsive/de18-640.webp',
    sellPrice: sellFromCatalog(950_000),
    leaseDaily: leaseFromCatalog(950_000),
    segment: 'diesel',
    condition: 'neu',
    blurb: 'Moderne Streckendiesel für schwere Güter- und Bauverkehre.',
  },
  {
    id: 'br140',
    designation: 'BR 140 / 143',
    displayName: 'BR 140 / 143',
    fuel_type: 'elektrik',
    power_kw: 3700,
    max_speed: 120,
    weight_t: 83,
    buyPrice: 420_000,
    huCost: HU_COST_BY_OFFER_ID.br140,
    photo: '/locos/responsive/br140-clean-640.webp',
    sellPrice: sellFromCatalog(420_000),
    leaseDaily: leaseFromCatalog(420_000),
    segment: 'elektro',
    condition: 'gebraucht',
    ohleOnly: true,
    blurb: 'E-Oldtimer — nur unter Fahrdraht.',
  },
  {
    id: 'br151',
    designation: 'BR 151',
    displayName: 'BR 151',
    fuel_type: 'elektrik',
    power_kw: 5982,
    max_speed: 120,
    weight_t: 118,
    buyPrice: 520_000,
    huCost: HU_COST_BY_OFFER_ID.br151,
    photo: '/locos/responsive/br140-clean-640.webp',
    sellPrice: sellFromCatalog(520_000),
    leaseDaily: leaseFromCatalog(520_000),
    segment: 'elektro',
    condition: 'gebraucht',
    ohleOnly: true,
    blurb: 'Schwere sechsachsige Güterzuglok — nur unter Fahrdraht.',
  },
  {
    id: 'smartron',
    designation: 'BR 192 (MS-E)',
    displayName: 'BR 192 (MS-E)',
    fuel_type: 'elektrik',
    power_kw: 5600,
    max_speed: 160,
    weight_t: 83,
    buyPrice: 890_000,
    huCost: HU_COST_BY_OFFER_ID.smartron,
    photo: '/locos/responsive/smartron-640.webp',
    sellPrice: sellFromCatalog(890_000),
    leaseDaily: leaseFromCatalog(890_000),
    segment: 'elektro',
    condition: 'neu',
    ohleOnly: true,
    blurb: 'Mittelklasse-E-Lok für den Güterverkehr unter Oberleitung.',
  },
  {
    id: 'traxx',
    designation: 'BR 185 / 186 (MS-E)',
    displayName: 'BR 185 / 186 (MS-E)',
    fuel_type: 'elektrik',
    power_kw: 5600,
    max_speed: 140,
    weight_t: 85,
    buyPrice: 1_150_000,
    huCost: HU_COST_BY_OFFER_ID.traxx,
    photo: '/locos/responsive/traxx185-clean-640.webp',
    sellPrice: sellFromCatalog(1_150_000),
    leaseDaily: leaseFromCatalog(1_150_000),
    segment: 'elektro',
    condition: 'neu',
    ohleOnly: true,
    blurb: 'Bewährte Mehrsystem-E-Lok für den Korridorverkehr.',
  },
  {
    id: 'vectron',
    designation: 'BR 193 (MS-E)',
    displayName: 'BR 193 (MS-E)',
    fuel_type: 'elektrik',
    power_kw: 6400,
    max_speed: 200,
    weight_t: 85,
    buyPrice: 1_450_000,
    huCost: HU_COST_BY_OFFER_ID.vectron,
    photo: '/locos/responsive/vectron193-640.webp',
    sellPrice: sellFromCatalog(1_450_000),
    leaseDaily: leaseFromCatalog(1_450_000),
    segment: 'elektro',
    condition: 'neu',
    ohleOnly: true,
    blurb: 'Premium-Intermodal unter Oberleitung.',
  },
  {
    id: 'vectron-dm',
    designation: 'BR 248 Dual Mode',
    displayName: 'BR 248 Dual Mode',
    fuel_type: 'dual',
    power_kw: 2400,
    max_speed: 160,
    weight_t: 90,
    buyPrice: 1_650_000,
    huCost: HU_COST_BY_OFFER_ID['vectron-dm'],
    photo: '/locos/responsive/vectron248-640.webp',
    sellPrice: sellFromCatalog(1_650_000),
    leaseDaily: leaseFromCatalog(1_650_000),
    segment: 'hybrid',
    condition: 'neu',
    blurb: 'Hybrid: Fahrdraht + Diesel — letzte Meile ohne Umspannen.',
  },
  {
    id: 'eurodual',
    designation: 'BR 159 Dual',
    displayName: 'BR 159 Dual',
    fuel_type: 'dual',
    power_kw: 7000,
    max_speed: 120,
    weight_t: 123,
    buyPrice: 1_950_000,
    huCost: HU_COST_BY_OFFER_ID.eurodual,
    photo: '/locos/responsive/eurodual159-640.webp',
    sellPrice: sellFromCatalog(1_950_000),
    leaseDaily: leaseFromCatalog(1_950_000),
    segment: 'hybrid',
    condition: 'neu',
    blurb: 'Endgame-Hybrid für schwere Ganzzüge auf und neben der Oberleitung.',
  },
];

export const WAGON_OFFERS: WagonOffer[] = [
  {
    id: 'facns',
    type_code: 'Facns',
    type_name: 'Schotterwagen',
    category: 'schotter',
    capacity_t: 70,
    brake_position: 'G',
    tare_weight_t: 24,
    length_mm: 15500,
    listUnitPrice: 12_000,
    listUnitLease: wagonLeaseFromList(12_000),
    sellPriceEach: wagonSellFromList(12_000),
    cargo: 'Schotter, Bettungsmaterial',
  },
  {
    id: 'eanos',
    type_code: 'Eanos',
    type_name: 'Offener Güterwagen',
    category: 'offen',
    capacity_t: 61,
    brake_position: 'G',
    tare_weight_t: 22,
    length_mm: 14000,
    listUnitPrice: 14_000,
    listUnitLease: wagonLeaseFromList(14_000),
    sellPriceEach: wagonSellFromList(14_000),
    cargo: 'Schrott, Kohle, Erz, Holz',
  },
  {
    id: 'res',
    type_code: 'Res',
    type_name: 'Flachwagen',
    category: 'flach',
    capacity_t: 60,
    brake_position: 'P',
    tare_weight_t: 19,
    length_mm: 19000,
    listUnitPrice: 15_000,
    listUnitLease: wagonLeaseFromList(15_000),
    sellPriceEach: wagonSellFromList(15_000),
    cargo: 'Stahlcoils, Brammen, Flachgut',
  },
  {
    id: 'hbbillns',
    type_code: 'Hbbillns',
    type_name: 'Schiebewandwagen',
    category: 'schiebewand',
    capacity_t: 30,
    brake_position: 'P',
    tare_weight_t: 16,
    length_mm: 16500,
    listUnitPrice: 18_000,
    listUnitLease: wagonLeaseFromList(18_000),
    sellPriceEach: wagonSellFromList(18_000),
    cargo: 'Stückgut, Papier, Paletten',
    photo: '/wagons/responsive/hbbillns-640.webp',
  },
  {
    id: 'tads',
    type_code: 'Tads',
    type_name: 'Gedeckter Schüttgutwagen',
    category: 'gedeckt',
    capacity_t: 69,
    brake_position: 'G',
    tare_weight_t: 24,
    length_mm: 16500,
    listUnitPrice: 20_000,
    listUnitLease: wagonLeaseFromList(20_000),
    sellPriceEach: wagonSellFromList(20_000),
    cargo: 'Getreide, Kali, Baustoffe',
  },
  {
    id: 'zans',
    type_code: 'Zans',
    type_name: 'Kesselwagen',
    category: 'kessel',
    capacity_t: 48,
    brake_position: 'G',
    tare_weight_t: 24,
    length_mm: 14000,
    listUnitPrice: 22_000,
    listUnitLease: wagonLeaseFromList(22_000),
    sellPriceEach: wagonSellFromList(22_000),
    cargo: 'Tank, Chemie, Kraftstoff',
  },
  {
    id: 'sggrss',
    type_code: 'Sggrss',
    type_name: 'Containertragwagen',
    category: 'container',
    capacity_t: 90,
    brake_position: 'R',
    tare_weight_t: 17,
    length_mm: 20000,
    listUnitPrice: 28_000,
    listUnitLease: wagonLeaseFromList(28_000),
    sellPriceEach: wagonSellFromList(28_000),
    cargo: 'Container, Wechselbehälter',
  },
];

export const DEALER_WAGON_TYPES = WAGON_OFFERS.map((o) => o.type_code);

export function wagonOfferByTypeCode(typeCode: string): WagonOffer | undefined {
  const t = typeCode.trim().toLowerCase();
  if (!t) return undefined;
  return WAGON_OFFERS.find((o) => o.type_code.toLowerCase() === t);
}

export interface LeaseContract {
  id: string;
  kind: 'loco' | 'wagon';
  assetId: string;
  label: string;
  dailyCost: number;
  startedTick: number;
}

export interface DealerState {
  /** When this ≠ DEALER_CATALOG_VERSION, used stock is rebuilt (leases kept). */
  catalogVersion?: number;
  leases: LeaseContract[];
  usedStock: UsedLocoStock[];
  usedStockTick: number;
}

export interface ExtraFleet {
  locomotives: Locomotive[];
  wagons: Wagon[];
}

export interface SoldAssets {
  locomotives: string[];
  wagons: string[];
}

export function huCostForLocoOffer(offer: LocoOffer): number {
  return offer.huCost;
}

export interface LocoPriceQuote {
  variant: LocoBuyVariant;
  hull: number;
  restfrist: number;
  packages: number;
  total: number;
  lines: { label: string; amount: number }[];
  conditionClass: UsedLocoStock['conditionClass'] | 1;
  conditionLabel: string;
  conditionFactor: number;
}

export function quoteLocoPurchase(
  offer: LocoOffer,
  variant: LocoBuyVariant,
  stock: UsedLocoStock | undefined,
  countries: CountryPackage[],
  equipment: ExtraEquipment[],
): LocoPriceQuote {
  const huCost = huCostForLocoOffer(offer);
  const packages = packageAddonTotal(countries, equipment, offer.buyPrice);
  const countryLines = countries
    .map((id) => COUNTRY_PACKAGES.find((c) => c.id === id))
    .filter((row): row is (typeof COUNTRY_PACKAGES)[number] => row != null && row.price > 0)
    .map((row) => ({ label: `Länderpaket ${row.label}`, amount: row.price }));
  const equipLines = equipment
    .map((id) => ({ id, amount: extraEquipmentPrice(id, offer.buyPrice) }))
    .filter((row) => row.amount > 0)
    .map((row) => ({ label: extraEquipmentLineLabel(row.id, offer.buyPrice), amount: row.amount }));

  if (variant === 'revised' || !stock) {
    const hull = offer.buyPrice;
    const total = revisedLocoPrice(offer.buyPrice, huCost) + packages;
    return {
      variant: 'revised',
      hull,
      restfrist: 0,
      packages,
      total,
      conditionClass: 1,
      conditionLabel: CONDITION_CLASSES[1].label,
      conditionFactor: 1,
      lines: [
        { label: 'Katalogpreis (frisch revidiert / neue HU)', amount: hull },
        ...countryLines,
        ...equipLines,
      ],
    };
  }

  const remaining = remainingHuFractionFromStock(stock, offer.segment);
  const hull = offer.buyPrice;
  const huGap = huConsumedGap(huCost, remaining);
  const consumedPct = Math.round((1 - remaining) * 100);
  const total = usedLocoPrice(offer.buyPrice, huCost, stock, offer.segment) + packages;
  return {
    variant: 'used',
    hull,
    restfrist: huGap,
    packages,
    total,
    conditionClass: stock.conditionClass,
    conditionLabel: CONDITION_CLASSES[stock.conditionClass].label,
    conditionFactor: 1,
    lines: [
      { label: 'Katalogpreis', amount: hull },
      { label: `HU-Abzug (${consumedPct} % Intervall verbraucht)`, amount: -huGap },
      ...countryLines,
      ...equipLines,
    ],
  };
}

const USED_STOCK_REFRESH_DAYS = 14;

export function ensureUsedStock(state: DealerState, tick: number, force = false): DealerState {
  const ageDays = Math.floor(Math.max(0, tick - (state.usedStockTick ?? 0)) / TICKS_PER_DAY);
  const have = new Set((state.usedStock ?? []).map((s) => s.offerId));
  const missing = LOCO_OFFERS.some((o) => !have.has(o.id));
  if (!force && state.usedStock.length === LOCO_OFFERS.length && !missing && ageDays < USED_STOCK_REFRESH_DAYS) {
    return state;
  }
  const keep = force ? [] : state.usedStock;
  const keepById = new Map(keep.map((s) => [s.offerId, s]));
  const usedStock = LOCO_OFFERS.map((offer) => {
    const existing = !force ? keepById.get(offer.id) : undefined;
    if (
      existing &&
      ageDays < USED_STOCK_REFRESH_DAYS &&
      !usedStockNeedsRespin(existing, offer.segment)
    ) {
      return existing;
    }
    return randomUsedStock(offer.id, offer.segment, tick + hashOffer(offer.id));
  });
  return {
    ...state,
    catalogVersion: DEALER_CATALOG_VERSION,
    usedStock,
    usedStockTick: tick,
  };
}

export function refreshUsedStockForOffer(state: DealerState, offerId: string, tick: number): DealerState {
  const offer = LOCO_OFFERS.find((o) => o.id === offerId);
  if (!offer) return state;
  const next = randomUsedStock(offer.id, offer.segment, tick + Date.now());
  return {
    ...state,
    catalogVersion: DEALER_CATALOG_VERSION,
    usedStock: state.usedStock.map((s) => (s.offerId === offerId ? next : s)),
    usedStockTick: state.usedStockTick,
  };
}

export function usedStockFor(state: DealerState, offerId: string): UsedLocoStock | undefined {
  return state.usedStock.find((s) => s.offerId === offerId);
}

function hashOffer(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

export function dealerCatalogIsCurrent(state: DealerState | null | undefined): boolean {
  return (state?.catalogVersion ?? 0) === DEALER_CATALOG_VERSION;
}

/** Rebuild used lots when catalog/HU/photos/formula version changes; keep leases. */
export function migrateDealerState(state: DealerState, nowTick = 0): DealerState {
  const tick = nowTick || state.usedStockTick || 0;
  if (!dealerCatalogIsCurrent(state)) {
    const rebuilt = ensureUsedStock(
      { ...state, usedStock: [], usedStockTick: 0 },
      tick,
      true,
    );
    return { ...rebuilt, catalogVersion: DEALER_CATALOG_VERSION };
  }
  return ensureUsedStock({ ...state, catalogVersion: DEALER_CATALOG_VERSION }, tick);
}

export function loadDealerState(nowTick = 0): DealerState {
  const loaded = loadJson<DealerState | null>(DEALER_STATE_KEY, null);
  const base: DealerState = {
    catalogVersion: Number(loaded?.catalogVersion) || 0,
    leases: Array.isArray(loaded?.leases)
      ? loaded!.leases.filter((lease) => lease && typeof lease === 'object' && Number(lease.dailyCost) >= 0)
      : [],
    usedStock: Array.isArray(loaded?.usedStock) ? loaded!.usedStock : [],
    usedStockTick: Number(loaded?.usedStockTick) || 0,
  };
  const next = migrateDealerState(base, nowTick);
  if (next !== base) saveDealerState(next);
  return next;
}

export function saveDealerState(state: DealerState): void {
  saveJson(DEALER_STATE_KEY, state);
}

export function loadExtraFleet(): ExtraFleet {
  const loaded = loadJson<ExtraFleet | null>(EXTRA_FLEET_KEY, null);
  return {
    locomotives: Array.isArray(loaded?.locomotives)
      ? loaded!.locomotives.map((loco) => ({ ...loco, pzb: loco.pzb !== false }))
      : [],
    wagons: Array.isArray(loaded?.wagons) ? loaded!.wagons : [],
  };
}

export function saveExtraFleet(fleet: ExtraFleet): void {
  saveJson(EXTRA_FLEET_KEY, fleet);
}

export function loadSoldAssets(): SoldAssets {
  const loaded = loadJson<SoldAssets | null>(SOLD_ASSETS_KEY, null);
  return {
    locomotives: Array.isArray(loaded?.locomotives) ? loaded!.locomotives : [],
    wagons: Array.isArray(loaded?.wagons) ? loaded!.wagons : [],
  };
}

export function saveSoldAssets(sold: SoldAssets): void {
  saveJson(SOLD_ASSETS_KEY, sold);
}

export function mergeFleet<T extends { id: string }>(base: T[], extra: T[], soldIds: string[]): T[] {
  const sold = new Set(soldIds);
  const ids = new Set(base.map((x) => x.id));
  const merged = [...base.filter((x) => !sold.has(x.id)), ...extra.filter((x) => !ids.has(x.id) && !sold.has(x.id))];
  return merged;
}

function checkDigit(body: string): number {
  const digits = body.replace(/\D/g, '');
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 2);
  }
  return sum % 10;
}

function designationPrefix(designation: string): string {
  const d = designation.toLowerCase();
  if (d.includes('köf') || d.includes('kof') || d.includes('koef')) return '333';
  if (d.includes('360') || d.includes('365') || d.includes('v 60') || d.includes('v60')) return '360';
  if (d.includes('290') || d.includes('294') || d.includes('v 90') || d.includes('v90')) return '294';
  if (d.includes('218')) return '218';
  if (d.includes('232') || d.includes('ludmilla')) return '232';
  if (d.includes('1206')) return '127';
  if (d.includes('272') || d.includes('g 2000') || d.includes('g2000')) return '272';
  if (d.includes('de18') || d.includes('de 18')) return '418';
  if (d.includes('159') || d.includes('eurodual')) return '159';
  if (d.includes('248') || (d.includes('dual') && d.includes('vectron'))) return '248';
  if (d.includes('185') || d.includes('186') || d.includes('traxx') || d.includes('f140')) return '185';
  if (d.includes('smartron') || d.includes('192')) return '192';
  if (d.includes('193') || d.includes('vectron')) return '193';
  if (d.includes('151')) return '151';
  if (d.includes('140')) return '140';
  if (d.includes('143')) return '143';
  return '193';
}

export function nextLocoName(designation: string, existing: Locomotive[]): string {
  const prefix = designationPrefix(designation);
  const used = new Set(existing.map((l) => l.name));
  for (let n = 401; n < 900; n++) {
    const body = `${prefix} ${String(n).padStart(3, '0')}`;
    const name = `${body}-${checkDigit(body)}`;
    if (!used.has(name)) return name;
  }
  return `${prefix} ${Date.now().toString().slice(-3)}-0`;
}

export function buildPurchasedLoco(
  offer: LocoOffer,
  name: string,
  options: LocoAcquireOptions = DEFAULT_LOCO_ACQUIRE,
  stock?: UsedLocoStock,
): Locomotive {
  const used = options.variant === 'used' && stock;
  const maintenance = used ? maintenanceFromUsedStock(stock, offer.segment) : revisedMaintenance();
  const laidUp = used && CONDITION_CLASSES[stock.conditionClass].laidUp;
  return {
    id: newNotificationId(),
    designation: offer.designation,
    name,
    status: laidUp ? 'stillgelegt' : 'frei',
    fuel_type: offer.fuel_type,
    fuel_level: laidUp ? 20 : 100,
    brake_pct: laidUp ? 40 : 100,
    last_service: GAME_EPOCH_ISO.slice(0, 10),
    power_kw: offer.power_kw,
    max_speed: offer.max_speed,
    weight_t: offer.weight_t,
    created_at: new Date().toISOString(),
    maintenance,
    country_packages: options.countries,
    equipment: options.equipment.filter((id) => id !== 'pzb'),
    pzb: true,
    purchase_price: offer.buyPrice,
  };
}

export function buildPurchasedWagons(offer: WagonOffer, qty = 1): Wagon {
  return {
    id: newNotificationId(),
    type_code: offer.type_code,
    type_name: offer.type_name,
    category: offer.category,
    capacity_t: offer.capacity_t,
    brake_position: offer.brake_position,
    tare_weight_t: offer.tare_weight_t,
    length_mm: offer.length_mm,
    status: 'verfuegbar',
    frist_level: 1,
    frist_date: '2027-08-20',
    count: Math.max(1, Math.round(qty)),
    created_at: new Date().toISOString(),
  };
}

export function offerForLoco(loco: Locomotive): LocoOffer | undefined {
  const d = loco.designation.toLowerCase();
  if (d.includes('köf') || d.includes('kof') || d.includes('koef')) {
    return LOCO_OFFERS.find((o) => o.id === 'kof3');
  }
  if (d.includes('360') || d.includes('365') || d.includes('v 60') || d.includes('v60')) {
    return LOCO_OFFERS.find((o) => o.id === 'v60');
  }
  if (d.includes('290') || d.includes('294') || d.includes('v 90') || d.includes('v90')) {
    return LOCO_OFFERS.find((o) => o.id === 'v90');
  }
  if (d.includes('218')) return LOCO_OFFERS.find((o) => o.id === 'br218');
  if (d.includes('232') || d.includes('ludmilla')) return LOCO_OFFERS.find((o) => o.id === 'br232');
  if (d.includes('1206')) return LOCO_OFFERS.find((o) => o.id === 'g1206');
  if (d.includes('272') || d.includes('g 2000') || d.includes('g2000')) {
    return LOCO_OFFERS.find((o) => o.id === 'br272');
  }
  if (d.includes('de18') || d.includes('de 18')) return LOCO_OFFERS.find((o) => o.id === 'de18');
  if (d.includes('159') || d.includes('eurodual')) return LOCO_OFFERS.find((o) => o.id === 'eurodual');
  if (d.includes('248') || (d.includes('dual') && d.includes('vectron'))) {
    return LOCO_OFFERS.find((o) => o.id === 'vectron-dm');
  }
  if (d.includes('185') || d.includes('186') || d.includes('traxx') || d.includes('f140')) {
    return LOCO_OFFERS.find((o) => o.id === 'traxx');
  }
  if (d.includes('smartron') || d.includes('192')) return LOCO_OFFERS.find((o) => o.id === 'smartron');
  if (d.includes('vectron') || d.includes('193')) return LOCO_OFFERS.find((o) => o.id === 'vectron');
  if (d.includes('151')) return LOCO_OFFERS.find((o) => o.id === 'br151');
  if (d.includes('140') || d.includes('143')) return LOCO_OFFERS.find((o) => o.id === 'br140');
  return LOCO_OFFERS[0];
}

export function processLeasesTick(
  state: DealerState,
  company: Company,
  prevTick: number,
  nextTick: number,
): { state: DealerState; company: Company } {
  if (!isNewGameDay(prevTick, nextTick)) return { state, company };
  const cost = state.leases.reduce((s, l) => s + l.dailyCost, 0);
  if (cost <= 0) return { state, company };
  return { state, company: { ...company, balance: company.balance - cost } };
}

