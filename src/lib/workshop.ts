import type {
  AssignmentWithDetails,
  ConditionClass,
  LocoFaultKind,
  LocoMaintenance,
  Locomotive,
  LocoStatus,
  MaintenanceLevel,
  Notification,
} from '@/lib/supabase';
import { newNotificationId, tickToIso } from '@/lib/gameTime';
import { sendMessage } from '@/lib/inbox';
import { loadJson, saveJson, TICKS_PER_DAY } from '@/lib/storage';
import { BASE_WORKSHOP_SLOTS } from '@/lib/depot';
import { ETCS_RATE, etcsPriceForBase } from '@/lib/etcsPricing';

export const WORKSHOP_JOBS_KEY = 'evu-workshop-jobs';
export const LOCO_MAINT_KEY = 'evu-loco-maintenance';

export type LocoMaintPatch = LocoMaintenance & {
  status?: LocoStatus;
  country_packages?: Locomotive['country_packages'];
  equipment?: Locomotive['equipment'];
  pzb?: boolean;
  purchase_price?: number | null;
};

export function loadLocoMaintPatches(): Record<string, LocoMaintPatch> {
  const loaded = loadJson<Record<string, LocoMaintPatch> | null>(LOCO_MAINT_KEY, null);
  return loaded && typeof loaded === 'object' ? loaded : {};
}

export function saveLocoMaintPatches(patches: Record<string, LocoMaintPatch>): void {
  saveJson(LOCO_MAINT_KEY, patches);
}

export function patchFromLoco(loco: Locomotive): LocoMaintPatch | null {
  if (!loco.maintenance) return null;
  return {
    ...loco.maintenance,
    status: loco.status,
    country_packages: loco.country_packages,
    equipment: loco.equipment,
    pzb: loco.pzb !== false,
    purchase_price: loco.purchase_price,
  };
}

export function applyLocoMaintPatches(
  locos: Locomotive[],
  patches: Record<string, LocoMaintPatch>,
): Locomotive[] {
  return locos.map((loco) => {
    const patch = patches[loco.id];
    if (!patch) return ensureMaintenance({ ...loco, pzb: loco.pzb !== false });
    const { status, country_packages, equipment, pzb, purchase_price, ...maintenance } = patch;
    return syncLocoStatus({
      ...loco,
      maintenance,
      status:
        loco.status === 'einsatz' || loco.status === 'wartung'
          ? loco.status
          : status ?? loco.status,
      country_packages: country_packages ?? loco.country_packages,
      equipment: equipment ?? loco.equipment,
      pzb: pzb ?? loco.pzb !== false,
      purchase_price: purchase_price ?? loco.purchase_price,
    });
  });
}

/** Fristarbeit: 90 days / 60 000 km, 1 day own / 0 fremd (instant), ~2% of HU. */
export const F_INTERVAL_DAYS = 90;
export const F_INTERVAL_KM = 60_000;
export const F_DURATION_DAYS = 1;
export const F_FREMD_DURATION_DAYS = 0;
export const F_COST_OF_HU = 0.02;

/** Safety lock: F/ZU/HU only bookable near due date (or overdue). Reparatur stays open. */
export const WORKSHOP_BOOK_THRESHOLDS = {
  F: { days: 10, km: 3_000 },
  ZU: { days: 30, km: 10_000 },
  HU: { days: 60, km: 20_000 },
} as const;

/** Zwischenuntersuchung: 3 years / 40% of HU km, ~35% of HU cost. Occupies a slot. 3 days own / 1 fremd. */
export const ZU_INTERVAL_DAYS = 3 * 365;
export const ZU_KM_OF_HU = 0.4;
export const ZU_OF_HU = 0.35;
export const ZU_DURATION_DAYS = 3;
export const ZU_FREMD_DURATION_DAYS = 1;
export const ZU_OVERDUE_FAULT_BONUS = 0.5;

/** Hauptuntersuchung: 8 years / full km interval, 8 days own / 4 fremd, full HU cost. */
export const HU_INTERVAL_DAYS = 8 * 365;
export const HU_DURATION_DAYS = 8;
export const HU_FREMD_DURATION_DAYS = 4;

export const FREMDVERGABE_SURCHARGE = 0.25;
export const OVERDUE_MAX_SURCHARGE = 0.6;
export const OVERDUE_DURATION_BONUS = 1.5;
export const DEFAULT_WORKSHOP_SLOTS = BASE_WORKSHOP_SLOTS;
export const LAID_UP_CONDITION_FACTOR = 0.15;
export const BASE_ZU_FAULT_CHANCE = 0.08;
/** Random operational damage: not before 3 in-game months and company level 3. */
export const MIN_FAULT_COMPANY_LEVEL = 3;
export const MIN_FAULT_GAME_DAYS = 90;
/** Aktive Fahrzeuge unterliegen einem täglichen, kleinen aber spürbaren Ausfallrisiko. */
export const FAULT_DAILY_CHANCE_IN_SERVICE = 0.0045;
export const FAULT_DAILY_CHANCE_IDLE = 0.0025;
/** Außerplanmäßige Reparaturen enthalten Diagnose, Expressbeschaffung und Stillstandszuschlag. */
export const FAULT_REPAIR_MULTIPLIER = 1.6;

export const LOCO_FAULT_LABELS: Record<LocoFaultKind, string> = {
  antrieb: 'Antrieb / Motor',
  bremse: 'Bremse',
  elektronik: 'Leittechnik / Elektronik',
  laufwerk: 'Laufwerk / Drehgestell',
};

const FAULT_KINDS: LocoFaultKind[] = ['antrieb', 'bremse', 'elektronik', 'laufwerk'];

export const WORKSHOP_LEVELS: MaintenanceLevel[] = ['F', 'ZU', 'HU'];

export type LocoSegment = 'rangier' | 'diesel' | 'elektro' | 'hybrid';

export interface ConditionClassDef {
  id: ConditionClass;
  label: string;
  factor: number;
  conditionPct: number;
  remainingMin: number;
  remainingMax: number;
  laidUp: boolean;
}

/**
 * Explicit condition-class mapping (used stock + remaining-frist).
 * Factor 1.0 = freshly revised; 0.15 = HU expired / scrap / laid up.
 */
export const CONDITION_CLASSES: Record<ConditionClass, ConditionClassDef> = {
  1: { id: 1, label: 'Frisch revidiert', factor: 1.0, conditionPct: 100, remainingMin: 0.9, remainingMax: 1.0, laidUp: false },
  2: { id: 2, label: 'Gut', factor: 0.8, conditionPct: 80, remainingMin: 0.7, remainingMax: 0.9, laidUp: false },
  3: { id: 3, label: 'Mittel', factor: 0.55, conditionPct: 55, remainingMin: 0.4, remainingMax: 0.7, laidUp: false },
  4: { id: 4, label: 'Verschlissen', factor: 0.35, conditionPct: 35, remainingMin: 0.08, remainingMax: 0.4, laidUp: false },
  5: { id: 5, label: 'HU abgelaufen / Schrott', factor: LAID_UP_CONDITION_FACTOR, conditionPct: 15, remainingMin: 0, remainingMax: 0, laidUp: true },
};

/** HU cost as % of catalog price when no explicit class HU is set (~25–30 %). */
export const HU_COST_PCT: Record<LocoSegment, number> = {
  rangier: 0.27,
  diesel: 0.28,
  elektro: 0.27,
  hybrid: 0.27,
};

/** HU km interval by segment (whichever of days/km hits first). */
export const HU_INTERVAL_KM: Record<LocoSegment, number> = {
  rangier: 400_000,
  diesel: 800_000,
  elektro: 1_200_000,
  hybrid: 1_000_000,
};

/** Exact HU € (hu_kosten) 1:1 by catalog id. Used buy = catalog − HU × consumed. */
export const HU_COST_BY_OFFER_ID = {
  kof3: 25_000,
  v60: 35_000,
  v90: 50_000,
  br218: 60_000,
  br232: 65_000,
  g1206: 69_000,
  br272: 75_000,
  de18: 90_000,
  br140: 65_000,
  br151: 79_000,
  smartron: 120_000,
  traxx: 135_000,
  vectron: 150_000,
  'vectron-dm': 165_000,
  eurodual: 180_000,
} as const;

/** Used stock: typical 30–80 % of the HU interval already consumed (Restfrist of that unit). */
export const USED_HU_CONSUMED_MIN = 0.3;
export const USED_HU_CONSUMED_MAX = 0.8;

export type WorkshopJobKind = 'F' | 'ZU' | 'HU' | 'reparatur' | 'etcs';
export type WorkshopChannel = 'eigen' | 'fremdvergabe';

/** Fremdvergabe duration vs own workshop (game days). F is instant. Reparatur unchanged. */
export const FREMDVERGABE_DURATION_MULT: Record<WorkshopJobKind, number> = {
  F: F_FREMD_DURATION_DAYS / F_DURATION_DAYS,
  ZU: ZU_FREMD_DURATION_DAYS / ZU_DURATION_DAYS,
  HU: HU_FREMD_DURATION_DAYS / HU_DURATION_DAYS,
  reparatur: 1,
  etcs: 1,
};

export interface WorkshopJob {
  id: string;
  locoId: string;
  kind: WorkshopJobKind;
  channel: WorkshopChannel;
  occupiesSlot: boolean;
  queuedAtTick: number;
  completeAtTick: number;
  cost: number;
  overdueMalus: number;
}

export interface WorkshopQuote {
  kind: WorkshopJobKind;
  channel: WorkshopChannel;
  baseCost: number;
  overdueRatio: number;
  overdueMalus: number;
  fremdMalus: number;
  cost: number;
  listCost: number;
  discountPct: number;
  durationDays: number;
  durationTicks: number;
  occupiesSlot: boolean;
  overdue: boolean;
}

export interface FristSnapshot {
  level: MaintenanceLevel;
  daysRemaining: number;
  kmRemaining: number;
  daysInterval: number;
  kmInterval: number;
  overdue: boolean;
  remainingFraction: number;
}

export const WORKSHOP_RATES: Record<
  WorkshopJobKind,
  { label: string; description: string }
> = {
  F: {
    label: 'Fristarbeit (F)',
    description: 'Alle 90 Tage / 60 000 km, 1 Tag eigen / sofort fremd, ca. 2 % der HU. Belegt keinen HU/ZU-Slot.',
  },
  ZU: {
    label: 'Zwischenuntersuchung (ZU)',
    description: 'Alle 3 Jahre / 40 % der HU-km, 3 Tage eigen / 1 Tag fremd. Belegt einen Werkstatt-Slot. +50 % Störungsrisiko bei Überfälligkeit.',
  },
  HU: {
    label: 'Hauptuntersuchung (HU)',
    description: 'Alle 8 Jahre / volles km-Intervall, 8 Tage eigen / 4 Tage fremd. Setzt Zustand auf 100 %. Ohne gültige HU stillgelegt.',
  },
  reparatur: {
    label: 'Reparatur (Schaden / Ausfall)',
    description: 'Lok nach Störung wieder betriebsfähig machen.',
  },
  etcs: {
    label: 'ETCS-Nachrüstung',
    description: '1 Tag im eigenen Slot, gleicher Preis wie ETCS beim Händler (8 % Katalogpreis). Diesel und Elektro.',
  },
};

export function inferLocoSegment(loco: Pick<Locomotive, 'fuel_type' | 'power_kw' | 'max_speed' | 'weight_t'>): LocoSegment {
  if (loco.fuel_type === 'dual') return 'hybrid';
  if (loco.fuel_type === 'elektrik') return 'elektro';
  const power = loco.power_kw ?? 0;
  const speed = loco.max_speed ?? 0;
  const weight = loco.weight_t ?? 0;
  if (power > 0 && power < 1000 && speed <= 90 && weight <= 75) return 'rangier';
  return 'diesel';
}

export function offerIdFromDesignation(designation: string): string | undefined {
  const d = designation.toLowerCase();
  if (d.includes('köf') || d.includes('kof') || d.includes('koef')) return 'kof3';
  if (d.includes('360') || d.includes('365') || d.includes('v 60') || d.includes('v60')) return 'v60';
  if (d.includes('290') || d.includes('294') || d.includes('v 90') || d.includes('v90')) return 'v90';
  if (d.includes('218')) return 'br218';
  if (d.includes('232') || d.includes('ludmilla')) return 'br232';
  if (d.includes('1206')) return 'g1206';
  if (d.includes('272') || d.includes('g 2000') || d.includes('g2000')) return 'br272';
  if (d.includes('de18') || d.includes('de 18')) return 'de18';
  if (d.includes('159') || d.includes('eurodual')) return 'eurodual';
  if (d.includes('248') || (d.includes('dual') && d.includes('vectron'))) return 'vectron-dm';
  if (d.includes('185') || d.includes('186') || d.includes('traxx') || d.includes('f140')) return 'traxx';
  if (d.includes('smartron') || d.includes('192')) return 'smartron';
  if (d.includes('vectron') || d.includes('193')) return 'vectron';
  if (d.includes('151')) return 'br151';
  if (d.includes('140') || d.includes('143')) return 'br140';
  return undefined;
}

export function exactHuCostForOfferId(offerId: string): number | undefined {
  if (Object.prototype.hasOwnProperty.call(HU_COST_BY_OFFER_ID, offerId)) {
    return HU_COST_BY_OFFER_ID[offerId as keyof typeof HU_COST_BY_OFFER_ID];
  }
  return undefined;
}

export function huCostForOffer(offerId: string, buyPrice: number, segment: LocoSegment): number {
  return exactHuCostForOfferId(offerId) ?? Math.round(buyPrice * HU_COST_PCT[segment]);
}

export function huCostForLoco(loco: Locomotive): number {
  const id = offerIdFromDesignation(loco.designation);
  const exact = id ? exactHuCostForOfferId(id) : undefined;
  if (exact != null) return exact;
  if (loco.purchase_price && loco.purchase_price > 0) {
    return huCostForOffer(id ?? '', loco.purchase_price, inferLocoSegment(loco));
  }
  const power = loco.power_kw ?? 1500;
  const list =
    power *
    250 *
    (loco.fuel_type === 'dual' ? 2.2 : loco.fuel_type === 'elektrik' ? 1.15 : 1);
  return huCostForOffer(id ?? '', Math.round(list), inferLocoSegment(loco));
}

/** Same rate as Händler factory ETCS (`etcsPriceForBase` / catalog Grundpreis). */
export const ETCS_RETROFIT_OF_VALUE = ETCS_RATE;
export const ETCS_RETROFIT_DURATION_DAYS = 1;

export function locoMarketValue(loco: Locomotive): number {
  const listed = Number(loco.purchase_price) || 0;
  if (listed > 0) return listed;
  const hu = huCostForLoco(loco);
  const pct = HU_COST_PCT[inferLocoSegment(loco)] || 0.27;
  return Math.max(80_000, Math.round(hu / pct));
}

export function etcsRetrofitCost(loco: Locomotive): number {
  return etcsPriceForBase(locoMarketValue(loco));
}

export function huKmIntervalFor(segment: LocoSegment): number {
  return HU_INTERVAL_KM[segment];
}

export function huDurationDaysForLoco(_loco?: Pick<Locomotive, 'weight_t' | 'power_kw'>): number {
  return HU_DURATION_DAYS;
}

export function zuKmIntervalFor(segment: LocoSegment): number {
  return Math.round(huKmIntervalFor(segment) * ZU_KM_OF_HU);
}

export function conditionClassFromRemaining(remainingFraction: number): ConditionClass {
  if (remainingFraction <= 0) return 5;
  if (remainingFraction >= 0.9) return 1;
  if (remainingFraction >= 0.7) return 2;
  if (remainingFraction >= 0.4) return 3;
  return 4;
}

export function conditionPctFromRemaining(remainingFraction: number): number {
  if (remainingFraction <= 0) return Math.round(LAID_UP_CONDITION_FACTOR * 100);
  return Math.round(clamp(15 + remainingFraction * 85, 15, 100));
}

export function emptyMaintenance(overrides: Partial<LocoMaintenance> = {}): LocoMaintenance {
  return {
    conditionPct: 100,
    conditionClass: 1,
    daysSinceF: 0,
    kmSinceF: 0,
    daysSinceZU: 0,
    kmSinceZU: 0,
    daysSinceHU: 0,
    kmSinceHU: 0,
    fault: null,
    ...overrides,
  };
}

export function revisedMaintenance(): LocoMaintenance {
  return emptyMaintenance({ conditionPct: 100, conditionClass: 1 });
}

export function maintenanceFromElapsed(
  daysSinceHU: number,
  kmSinceHU: number,
  daysSinceZU: number,
  kmSinceZU: number,
  daysSinceF: number,
  kmSinceF: number,
  segment: LocoSegment,
): LocoMaintenance {
  const huFrac = remainingFraction(HU_INTERVAL_DAYS - daysSinceHU, huKmIntervalFor(segment) - kmSinceHU, HU_INTERVAL_DAYS, huKmIntervalFor(segment));
  return {
    daysSinceF,
    kmSinceF,
    daysSinceZU,
    kmSinceZU,
    daysSinceHU,
    kmSinceHU,
    conditionClass: conditionClassFromRemaining(huFrac),
    conditionPct: conditionPctFromRemaining(huFrac),
  };
}

export function ensureMaintenance(loco: Locomotive, now = new Date()): Locomotive {
  if (loco.maintenance) {
    return syncLocoStatus(loco);
  }
  const last = loco.last_service ? new Date(loco.last_service).getTime() : now.getTime();
  const ageDays = Math.max(0, Math.floor((now.getTime() - last) / 86_400_000));
  const segment = inferLocoSegment(loco);
  const fDays = Math.min(ageDays, F_INTERVAL_DAYS);
  const zuDays = Math.min(Math.round(ageDays * 8), Math.round(ZU_INTERVAL_DAYS * 0.45));
  const huDays = Math.min(Math.round(ageDays * 20), Math.round(HU_INTERVAL_DAYS * 0.35));
  const fKm = Math.round((fDays / F_INTERVAL_DAYS) * F_INTERVAL_KM * 0.6);
  const zuKm = Math.round((zuDays / ZU_INTERVAL_DAYS) * zuKmIntervalFor(segment) * 0.6);
  const huKm = Math.round((huDays / HU_INTERVAL_DAYS) * huKmIntervalFor(segment) * 0.6);
  const hydrated: Locomotive = {
    ...loco,
    maintenance: maintenanceFromElapsed(huDays, huKm, zuDays, zuKm, fDays, fKm, segment),
  };
  return syncLocoStatus(hydrated);
}

export function remainingFraction(
  daysRemaining: number,
  kmRemaining: number,
  daysInterval: number,
  kmInterval: number,
): number {
  const dayFrac = daysInterval > 0 ? daysRemaining / daysInterval : 0;
  const kmFrac = kmInterval > 0 ? kmRemaining / kmInterval : 0;
  return clamp(Math.min(dayFrac, kmFrac), 0, 1);
}

export function fristFor(loco: Locomotive, level: MaintenanceLevel): FristSnapshot {
  const m = loco.maintenance ?? emptyMaintenance();
  const segment = inferLocoSegment(loco);
  if (level === 'F') {
    const daysRemaining = F_INTERVAL_DAYS - m.daysSinceF;
    const kmRemaining = F_INTERVAL_KM - m.kmSinceF;
    return {
      level,
      daysRemaining,
      kmRemaining,
      daysInterval: F_INTERVAL_DAYS,
      kmInterval: F_INTERVAL_KM,
      overdue: daysRemaining <= 0 || kmRemaining <= 0,
      remainingFraction: remainingFraction(daysRemaining, kmRemaining, F_INTERVAL_DAYS, F_INTERVAL_KM),
    };
  }
  if (level === 'ZU') {
    const kmInterval = zuKmIntervalFor(segment);
    const daysRemaining = ZU_INTERVAL_DAYS - m.daysSinceZU;
    const kmRemaining = kmInterval - m.kmSinceZU;
    return {
      level,
      daysRemaining,
      kmRemaining,
      daysInterval: ZU_INTERVAL_DAYS,
      kmInterval,
      overdue: daysRemaining <= 0 || kmRemaining <= 0,
      remainingFraction: remainingFraction(daysRemaining, kmRemaining, ZU_INTERVAL_DAYS, kmInterval),
    };
  }
  const kmInterval = huKmIntervalFor(segment);
  const daysRemaining = HU_INTERVAL_DAYS - m.daysSinceHU;
  const kmRemaining = kmInterval - m.kmSinceHU;
  return {
    level: 'HU',
    daysRemaining,
    kmRemaining,
    daysInterval: HU_INTERVAL_DAYS,
    kmInterval,
    overdue: daysRemaining <= 0 || kmRemaining <= 0,
    remainingFraction: remainingFraction(daysRemaining, kmRemaining, HU_INTERVAL_DAYS, kmInterval),
  };
}

export function allFristen(loco: Locomotive): Record<MaintenanceLevel, FristSnapshot> {
  return {
    F: fristFor(loco, 'F'),
    ZU: fristFor(loco, 'ZU'),
    HU: fristFor(loco, 'HU'),
  };
}

export function isHuValid(loco: Locomotive): boolean {
  return !fristFor(loco, 'HU').overdue;
}

export function isLocoLaidUp(loco: Locomotive): boolean {
  return loco.status === 'stillgelegt' || !isHuValid(loco);
}

export function isLocoDeployable(loco: Locomotive): boolean {
  return loco.status === 'frei' && isHuValid(loco) && !locoHasFault(loco);
}

export function syncLocoStatus(loco: Locomotive): Locomotive {
  const m = loco.maintenance;
  if (!m) return loco;
  const hu = fristFor({ ...loco, maintenance: m }, 'HU');
  const nextMaint: LocoMaintenance = {
    ...m,
    conditionClass: conditionClassFromRemaining(hu.remainingFraction),
    conditionPct: conditionPctFromRemaining(hu.remainingFraction),
  };
  let status = loco.status;
  if (!hu.overdue && status === 'stillgelegt' && !nextMaint.fault) status = 'frei';
  if (hu.overdue && status === 'frei') status = 'stillgelegt';
  if (nextMaint.fault && status === 'frei') status = 'wartung';
  if (loco.status === status && loco.maintenance === nextMaint) return loco;
  return { ...loco, status, maintenance: nextMaint };
}

function occupiesSlotFor(kind: WorkshopJobKind, channel: WorkshopChannel): boolean {
  if (kind === 'etcs') return true;
  if (channel === 'fremdvergabe') return false;
  return kind === 'ZU' || kind === 'HU';
}

export function usedWorkshopSlots(jobs: WorkshopJob[], atTick: number): number {
  return jobs.filter((job) => job.occupiesSlot && job.completeAtTick > atTick).length;
}

export function freeWorkshopSlots(jobs: WorkshopJob[], atTick: number, cap = DEFAULT_WORKSHOP_SLOTS): number {
  return Math.max(0, cap - usedWorkshopSlots(jobs, atTick));
}

export function overdueRatioFor(frist: FristSnapshot): number {
  if (!frist.overdue) return 0;
  const daysOver = frist.daysRemaining < 0 ? Math.abs(frist.daysRemaining) / 30 : 0;
  const kmOver = frist.kmRemaining < 0 ? Math.abs(frist.kmRemaining) / Math.max(1, frist.kmInterval * 0.2) : 0;
  return clamp(Math.max(daysOver, kmOver), 0, 1);
}

export function workshopEarlyBookingHint(kind: 'F' | 'ZU' | 'HU'): string {
  const t = WORKSHOP_BOOK_THRESHOLDS[kind];
  return `Erst ab ${t.days} Tagen Restfrist buchbar (oder ${t.km.toLocaleString('de-DE')} km)`;
}

/** True when F/ZU/HU may be booked (near threshold or overdue). Reparatur only with a reported fault. */
export function isWorkshopKindBookable(loco: Locomotive, kind: WorkshopJobKind): boolean {
  if (kind === 'reparatur') return locoHasFault(loco);
  if (kind === 'etcs') return !locoHasEtcsEquipment(loco);
  const frist = fristFor(loco, kind);
  const t = WORKSHOP_BOOK_THRESHOLDS[kind];
  return frist.overdue || frist.daysRemaining <= t.days || frist.kmRemaining <= t.km;
}

export function workshopBookingLockReason(loco: Locomotive, kind: WorkshopJobKind): string | null {
  if (kind === 'reparatur') {
    return locoHasFault(loco) ? null : 'Kein Schaden gemeldet';
  }
  if (kind === 'etcs') {
    return locoHasEtcsEquipment(loco) ? 'ETCS bereits verbaut' : null;
  }
  if (isWorkshopKindBookable(loco, kind)) return null;
  return workshopEarlyBookingHint(kind);
}

export function locoHasEtcsEquipment(loco: Pick<Locomotive, 'equipment'> | null | undefined): boolean {
  return (loco?.equipment ?? []).includes('etcs');
}

export function locoHasFault(loco: Locomotive): boolean {
  return Boolean(loco.maintenance?.fault);
}

export function locoFaultLabel(loco: Locomotive): string | null {
  const kind = loco.maintenance?.fault?.kind;
  return kind ? LOCO_FAULT_LABELS[kind] : null;
}

export function applyLocoFault(loco: Locomotive, kind: LocoFaultKind, atTick: number): Locomotive {
  const current = ensureMaintenance(loco);
  const m = current.maintenance ?? emptyMaintenance();
  if (m.fault) return current;
  const nextStatus: LocoStatus =
    current.status === 'stillgelegt' ? 'stillgelegt' : 'wartung';
  return {
    ...current,
    status: nextStatus,
    maintenance: { ...m, fault: { kind, reportedAtTick: atTick } },
  };
}

export function clearLocoFault(loco: Locomotive): Locomotive {
  const current = ensureMaintenance(loco);
  const m = current.maintenance ?? emptyMaintenance();
  if (!m.fault) return current;
  return syncLocoStatus({
    ...current,
    maintenance: { ...m, fault: null },
  });
}

function pickRandomFaultKind(random: () => number = Math.random): LocoFaultKind {
  return FAULT_KINDS[Math.floor(random() * FAULT_KINDS.length)] ?? 'antrieb';
}

function reportLocoFault(
  loco: Locomotive,
  kind: LocoFaultKind,
  atTick: number,
  inboxTitle: string,
  inboxBody: string,
): { loco: Locomotive; notification: Omit<Notification, 'id'> } {
  const next = applyLocoFault(loco, kind, atTick);
  sendMessage('Warnung', inboxTitle, inboxBody, atTick);
  return {
    loco: next,
    notification: {
      type: 'error',
      title: inboxTitle,
      message: inboxBody,
      read: false,
      created_at: tickToIso(atTick),
    },
  };
}

export function quoteWorkshopJob(
  loco: Locomotive,
  kind: WorkshopJobKind,
  channel: WorkshopChannel,
  discountPct = 0,
): WorkshopQuote {
  const huCost = huCostForLoco(loco);
  let baseCost = huCost;
  let ownDays = HU_DURATION_DAYS;
  let frist = fristFor(loco, 'HU');
  if (kind === 'F') {
    baseCost = Math.max(400, Math.round(huCost * F_COST_OF_HU));
    ownDays = F_DURATION_DAYS;
    frist = fristFor(loco, 'F');
  } else if (kind === 'ZU') {
    baseCost = Math.max(2_000, Math.round(huCost * ZU_OF_HU));
    ownDays = ZU_DURATION_DAYS;
    frist = fristFor(loco, 'ZU');
  } else if (kind === 'reparatur') {
    baseCost = Math.max(1_800, Math.round(huCost * 0.08));
    ownDays = 3;
    frist = fristFor(loco, 'F');
  } else if (kind === 'etcs') {
    baseCost = etcsRetrofitCost(loco);
    ownDays = ETCS_RETROFIT_DURATION_DAYS;
  }
  const overdue = kind === 'reparatur' || kind === 'etcs' ? false : frist.overdue;
  const ratio = kind === 'reparatur' || kind === 'etcs' ? 0 : overdueRatioFor(frist);
  const overdueMalus = ratio * OVERDUE_MAX_SURCHARGE;
  const fremdMalus = channel === 'fremdvergabe' ? FREMDVERGABE_SURCHARGE : 0;
  const faultMalus = kind === 'reparatur' && locoHasFault(loco) ? FAULT_REPAIR_MULTIPLIER : 1;
  const listCost = Math.round(baseCost * (1 + overdueMalus) * (1 + fremdMalus) * faultMalus);
  const cappedDiscount = Math.max(0, Math.min(15, Number(discountPct) || 0));
  const cost = Math.round(listCost * (1 - cappedDiscount / 100));
  const baseDays = channel === 'fremdvergabe' ? ownDays * FREMDVERGABE_DURATION_MULT[kind] : ownDays;
  const durationDays =
    baseDays <= 0 ? 0 : Math.max(1, Math.round(baseDays * (1 + ratio * OVERDUE_DURATION_BONUS)));
  return {
    kind,
    channel,
    baseCost,
    overdueRatio: ratio,
    overdueMalus,
    fremdMalus,
    cost,
    listCost,
    discountPct: cappedDiscount,
    durationDays,
    durationTicks: durationDays * TICKS_PER_DAY,
    occupiesSlot: occupiesSlotFor(kind, channel),
    overdue,
  };
}

export function canBookWorkshopJob(
  loco: Locomotive,
  jobs: WorkshopJob[],
  kind: WorkshopJobKind,
  channel: WorkshopChannel,
  atTick: number,
  cap = DEFAULT_WORKSHOP_SLOTS,
): string | null {
  const tooEarly = workshopBookingLockReason(loco, kind);
  if (tooEarly) return tooEarly;
  if (loco.status === 'einsatz') return 'Lok ist im Einsatz.';
  if (jobs.some((j) => j.locoId === loco.id && j.completeAtTick > atTick)) {
    return 'Diese Lok liegt bereits in der Werkstatt.';
  }
  if (channel === 'fremdvergabe' && kind !== 'etcs') return null;
  const quote = quoteWorkshopJob(loco, kind, channel);
  if (quote.occupiesSlot && freeWorkshopSlots(jobs, atTick, cap) < 1) {
    return kind === 'etcs'
      ? 'Kein freier Werkstatt-Slot für die ETCS-Nachrüstung.'
      : 'Kein freier Werkstatt-Slot. ZU/HU fremdvergeben (+25 %) oder warten.';
  }
  return null;
}

export function etcsRetrofitConfirmWarning(
  blocked: string | null,
  canPay: boolean,
  balance: number,
  formatEuro: (n: number) => string,
): string | null {
  if (blocked?.startsWith('Kein freier Werkstatt-Slot')) return 'kein freier Werkstatt-Slot';
  if (blocked) return blocked;
  if (!canPay) return `Nicht genug Kapital (${formatEuro(balance)} verfügbar).`;
  return null;
}

function migrateJobKind(kind: string): WorkshopJobKind {
  if (kind === 'inspektion' || kind === 'ebo33') return 'F';
  if (kind === 'ebo32') return 'ZU';
  if (kind === 'F' || kind === 'ZU' || kind === 'HU' || kind === 'reparatur' || kind === 'etcs') return kind;
  return 'F';
}

function normalizeJob(raw: WorkshopJob & { kind: string }): WorkshopJob {
  const kind = migrateJobKind(raw.kind);
  const channel: WorkshopChannel = raw.channel === 'fremdvergabe' ? 'fremdvergabe' : 'eigen';
  return {
    id: raw.id,
    locoId: raw.locoId,
    kind,
    channel,
    occupiesSlot: occupiesSlotFor(kind, channel),
    queuedAtTick: raw.queuedAtTick,
    completeAtTick: raw.completeAtTick,
    cost: raw.cost,
    overdueMalus: raw.overdueMalus ?? 0,
  };
}

export function loadWorkshopJobs(): WorkshopJob[] {
  const loaded = loadJson<WorkshopJob[] | null>(WORKSHOP_JOBS_KEY, null);
  if (!Array.isArray(loaded)) return [];
  return loaded.filter((job) => job && typeof job === 'object').map((job) => normalizeJob(job as WorkshopJob & { kind: string }));
}

export function saveWorkshopJobs(jobs: WorkshopJob[]): void {
  saveJson(WORKSHOP_JOBS_KEY, jobs);
}

export function completeWorkshopJob(loco: Locomotive, kind: WorkshopJobKind, isoDate: string): Locomotive {
  const current = ensureMaintenance(loco);
  const m = current.maintenance ?? emptyMaintenance();
  if (kind === 'reparatur') {
    return clearLocoFault({
      ...current,
      status: isHuValid(current) ? 'frei' : 'stillgelegt',
      brake_pct: 100,
      fuel_level: Math.max(current.fuel_level, 80),
      last_service: isoDate,
    });
  }
  if (kind === 'F') {
    return syncLocoStatus({
      ...current,
      status: isHuValid(current) ? 'frei' : 'stillgelegt',
      last_service: isoDate,
      brake_pct: Math.max(current.brake_pct, 95),
      maintenance: {
        ...m,
        daysSinceF: 0,
        kmSinceF: 0,
        conditionPct: Math.min(100, m.conditionPct + 2),
      },
    });
  }
  if (kind === 'ZU') {
    return syncLocoStatus({
      ...current,
      status: isHuValid(current) ? 'frei' : 'stillgelegt',
      last_service: isoDate,
      brake_pct: 100,
      maintenance: {
        ...m,
        daysSinceF: 0,
        kmSinceF: 0,
        daysSinceZU: 0,
        kmSinceZU: 0,
        conditionPct: Math.min(95, m.conditionPct + 15),
      },
    });
  }
  if (kind === 'etcs') {
    const equipment = [...new Set([...(current.equipment ?? []).filter((id) => id !== 'pzb'), 'etcs' as const])];
    return syncLocoStatus({
      ...current,
      equipment,
      status: isHuValid(current) ? (locoHasFault(current) ? 'wartung' : 'frei') : 'stillgelegt',
    });
  }
  return {
    ...current,
    status: 'frei',
    last_service: isoDate,
    brake_pct: 100,
    fuel_level: Math.max(current.fuel_level, 90),
    maintenance: revisedMaintenance(),
  };
}

function dailyKmOnAssignment(assignment: AssignmentWithDetails): number {
  const order = assignment.order;
  if (!order) return 0;
  const km = Math.max(0, Number(order.distance_km) || 0);
  if (order.deployment_days && order.deployment_days > 0) {
    return Math.max(1, Math.round(km / order.deployment_days));
  }
  const hours = Math.max(8, Math.round((km || 200) / 80));
  const days = Math.max(1, Math.round(hours / TICKS_PER_DAY));
  return Math.max(1, Math.round((km || 200) / days));
}

export function processMaintenanceDay(
  locos: Locomotive[],
  assignments: AssignmentWithDetails[],
  jobs: WorkshopJob[],
  atTick: number,
  companyLevel = 1,
  random: () => number = Math.random,
): { locos: Locomotive[]; notifications: Omit<Notification, 'id'>[]; changed: boolean; unplannedFaults: number } {
  const busy = new Set(jobs.filter((j) => j.completeAtTick > atTick).map((j) => j.locoId));
  const activeByLoco = new Map<string, AssignmentWithDetails>();
  for (const a of assignments) {
    if (a.status === 'aktiv' || a.status === 'geplant') activeByLoco.set(a.locomotive_id, a);
  }
  const notifications: Omit<Notification, 'id'>[] = [];
  let changed = false;
  let unplannedFaults = 0;
  const createdAt = tickToIso(atTick);
  const gameDays = Math.floor(atTick / TICKS_PER_DAY);
  const faultsUnlocked = companyLevel >= MIN_FAULT_COMPANY_LEVEL && gameDays >= MIN_FAULT_GAME_DAYS;

  const next = locos.map((raw) => {
    const loco = ensureMaintenance(raw);
    const m = loco.maintenance ?? emptyMaintenance();
    const assignment = activeByLoco.get(loco.id);
    const km = assignment && (loco.status === 'einsatz' || assignment.status === 'aktiv') ? dailyKmOnAssignment(assignment) : 0;
    const advanced: Locomotive = {
      ...loco,
      maintenance: {
        ...m,
        daysSinceF: m.daysSinceF + 1,
        daysSinceZU: m.daysSinceZU + 1,
        daysSinceHU: m.daysSinceHU + 1,
        kmSinceF: m.kmSinceF + km,
        kmSinceZU: m.kmSinceZU + km,
        kmSinceHU: m.kmSinceHU + km,
        fault: m.fault ?? null,
      },
    };
    let synced = syncLocoStatus(advanced);
    if (synced.status === 'stillgelegt' && raw.status !== 'stillgelegt' && raw.status !== 'einsatz' && raw.status !== 'wartung') {
      notifications.push({
        type: 'error',
        title: 'HU abgelaufen — stillgelegt',
        message: `${synced.name} ist ohne gültige HU nicht mehr einsatzbereit.`,
        read: false,
        created_at: createdAt,
      });
    }
    const zu = fristFor(synced, 'ZU');
    if (zu.overdue && !busy.has(synced.id) && !locoHasFault(synced) && synced.status === 'frei') {
      const risk = BASE_ZU_FAULT_CHANCE * (1 + ZU_OVERDUE_FAULT_BONUS);
      if (random() < risk) {
        changed = true;
        unplannedFaults += 1;
        const reported = reportLocoFault(
          synced,
          'elektronik',
          atTick,
          'Störung nach überfälliger ZU',
          `${synced.name}: überfällige Zwischenuntersuchung hat einen Schaden ausgelöst (${LOCO_FAULT_LABELS.elektronik}). Reparatur in der Werkstatt ist jetzt freigeschaltet.`,
        );
        notifications.push(reported.notification);
        return reported.loco;
      }
    }
    const isInService = synced.status === 'einsatz' || assignment?.status === 'aktiv';
    const isIdle = synced.status === 'frei';
    if (faultsUnlocked && !busy.has(synced.id) && !locoHasFault(synced) && (isInService || isIdle)) {
      const chance = isInService ? FAULT_DAILY_CHANCE_IN_SERVICE : FAULT_DAILY_CHANCE_IDLE;
      if (random() < chance) {
        changed = true;
        unplannedFaults += 1;
        const kind = pickRandomFaultKind(random);
        const reported = reportLocoFault(
          synced,
          kind,
          atTick,
          'Außerplanmäßiger Lokschaden',
          `${synced.name}: ${LOCO_FAULT_LABELS[kind]} — Ausfall im ${isInService ? 'Betrieb' : 'Stillstand'}. Die Reparatur ist in der Werkstatt für diese Lok freigeschaltet.`,
        );
        notifications.push(reported.notification);
        return reported.loco;
      }
    }
    if (synced !== raw) changed = true;
    return synced;
  });

  return { locos: next, notifications, changed, unplannedFaults };
}

export function formatFristPair(frist: FristSnapshot): { days: string; km: string; overdue: boolean } {
  const days =
    frist.daysRemaining < 0
      ? `${Math.abs(frist.daysRemaining)} T. überfällig`
      : `${frist.daysRemaining} T.`;
  const km =
    frist.kmRemaining < 0
      ? `${Math.abs(frist.kmRemaining).toLocaleString('de-DE')} km überfällig`
      : `${Math.round(frist.kmRemaining).toLocaleString('de-DE')} km`;
  return { days, km, overdue: frist.overdue };
}

export interface UsedLocoStock {
  offerId: string;
  conditionClass: ConditionClass;
  daysSinceF: number;
  kmSinceF: number;
  daysSinceZU: number;
  kmSinceZU: number;
  daysSinceHU: number;
  kmSinceHU: number;
  conditionPct: number;
  /** Remaining HU interval (1 = neue HU, 0 = fully consumed). Price uses this, never RNG. */
  remainingHuFraction?: number;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickUsedConsumed(rng: () => number): { consumed: number; laidUp: boolean } {
  if (rng() < 0.06) return { consumed: 1, laidUp: true };
  const consumed = USED_HU_CONSUMED_MIN + rng() * (USED_HU_CONSUMED_MAX - USED_HU_CONSUMED_MIN);
  return { consumed, laidUp: false };
}

export function randomUsedStock(offerId: string, segment: LocoSegment, salt = Date.now()): UsedLocoStock {
  const rng = mulberry32(hashString(`${offerId}:${salt}`) || 1);
  const { consumed, laidUp } = pickUsedConsumed(rng);
  const remaining = laidUp ? 0 : clamp(1 - consumed, 1 - USED_HU_CONSUMED_MAX, 1 - USED_HU_CONSUMED_MIN);
  const cls = laidUp ? 5 : conditionClassFromRemaining(remaining);
  const def = CONDITION_CLASSES[cls];
  const huKm = huKmIntervalFor(segment);
  const zuKm = zuKmIntervalFor(segment);
  const daysSinceHU = laidUp
    ? HU_INTERVAL_DAYS + Math.round(rng() * 120)
    : clamp(Math.round(HU_INTERVAL_DAYS * consumed), 0, HU_INTERVAL_DAYS);
  const kmSinceHU = laidUp
    ? huKm + Math.round(rng() * 40_000)
    : clamp(Math.round(huKm * consumed), 0, huKm);
  const daysSinceZU = clamp(Math.round(ZU_INTERVAL_DAYS * Math.min(1, consumed)), 0, ZU_INTERVAL_DAYS);
  const kmSinceZU = clamp(Math.round(zuKm * Math.min(1, consumed)), 0, zuKm);
  const daysSinceF = clamp(Math.round(F_INTERVAL_DAYS * Math.min(1, consumed)), 0, F_INTERVAL_DAYS);
  const kmSinceF = clamp(Math.round(F_INTERVAL_KM * Math.min(1, consumed)), 0, F_INTERVAL_KM);
  return {
    offerId,
    conditionClass: cls,
    daysSinceF,
    kmSinceF,
    daysSinceZU,
    kmSinceZU,
    daysSinceHU,
    kmSinceHU,
    conditionPct: laidUp ? def.conditionPct : conditionPctFromRemaining(remaining),
    remainingHuFraction: remaining,
  };
}

/** True when saved used stock is nearly new (or otherwise outside the 30–80 % wear band). */
export function usedStockNeedsRespin(stock: UsedLocoStock, segment: LocoSegment): boolean {
  if (stock.conditionClass === 5) return false;
  if (stock.conditionClass === 1) return true;
  const consumed = 1 - remainingHuFractionFromStock(stock, segment);
  return consumed < USED_HU_CONSUMED_MIN - 0.02 || consumed > USED_HU_CONSUMED_MAX + 0.02;
}

export function maintenanceFromUsedStock(stock: UsedLocoStock, segment: LocoSegment): LocoMaintenance {
  return maintenanceFromElapsed(
    stock.daysSinceHU,
    stock.kmSinceHU,
    stock.daysSinceZU,
    stock.kmSinceZU,
    stock.daysSinceF,
    stock.kmSinceF,
    segment,
  );
}

export function remainingHuFractionFromStock(stock: UsedLocoStock, segment: LocoSegment): number {
  if (typeof stock.remainingHuFraction === 'number' && Number.isFinite(stock.remainingHuFraction)) {
    return clamp(stock.remainingHuFraction, 0, 1);
  }
  return remainingFraction(
    HU_INTERVAL_DAYS - stock.daysSinceHU,
    huKmIntervalFor(segment) - stock.kmSinceHU,
    HU_INTERVAL_DAYS,
    huKmIntervalFor(segment),
  );
}

/**
 * Used→revised gap: HU × consumed only. consumed = 1 − remaining-frist.
 * 50 % Restfrist → 50 % verbraucht → gap = 0.5 × HU. No hull/scrap/noise.
 */
export function huConsumedGap(huCost: number, remainingFraction: number): number {
  const consumed = clamp(1 - remainingFraction, 0, 1);
  return Math.round(clamp(huCost * consumed, 0, huCost));
}

/**
 * Gebraucht buy price (deterministic):
 *   used = catalog − (exact_HU × consumed_fraction)
 * consumed_fraction = 1 − remaining-frist of that stock unit.
 * No random, surcharge, hull, scrap, or dynamic multiplier.
 */
export function usedBuyPrice(catalogPrice: number, huCost: number, remainingFraction: number): number {
  return Math.max(1, catalogPrice - huConsumedGap(huCost, remainingFraction));
}

export function usedLocoPrice(
  catalogPrice: number,
  huCost: number,
  stock: UsedLocoStock,
  segment: LocoSegment,
): number {
  return usedBuyPrice(catalogPrice, huCost, remainingHuFractionFromStock(stock, segment));
}

/** Frisch revidiert / neue HU = exactly catalog (100 % condition). Packages are added by the dealer quote. */
export function revisedLocoPrice(catalogPrice: number, _huCost = 0): number {
  return Math.round(catalogPrice);
}

export function jobLabel(job: WorkshopJob): string {
  const base = WORKSHOP_RATES[job.kind].label;
  return job.channel === 'fremdvergabe' ? `${base} · Fremdvergabe` : base;
}
