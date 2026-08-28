import type { Company, Driver, Notification } from '@/lib/supabase';
import { isNewGameDay, loadJson, saveJson } from '@/lib/storage';
import { newNotificationId } from '@/lib/gameTime';
import { GAME_EPOCH_ISO } from '@/lib/gameTime';
import { marketRefreshDayKey } from '@/lib/orderMarket';
import {
  pickSeriesForHire,
  seriesLabel,
  XP_PER_AZF_TRIP,
  XP_PER_SECOND_TF,
  XP_PER_TF_TRIP,
  XP_RANK_2,
  XP_RANK_3,
} from '@/lib/personal';

export const STAFF_META_KEY = 'evu-staff-meta';
export const EXTRA_DRIVERS_KEY = 'evu-extra-drivers';
export const JOB_BOARD_KEY = 'evu-job-board';
export const JOB_BOARD_DAY_KEY = 'evu-job-board-day';

export type StaffRole = 'tf' | 'wagenpruefer' | 'azf';
export type StaffRank = 1 | 2 | 3;
export type StaffTrainingKind = 'rank' | 'series';

export interface StaffMeta {
  driverId: string;
  role: StaffRole;
  rank: StaffRank;
  salary: number;
  trainingUntilTick: number | null;
  xp: number;
  seriesIds: string[];
  trainingKind: StaffTrainingKind | null;
  trainingSeriesId: string | null;
}

export interface RecruitOffer {
  role: StaffRole;
  rank: StaffRank;
  name: string;
  hiringCost: number;
  salary: number;
  minBekanntheit: number;
  qualifications: string[];
}

export const MONTHLY_SALARY: Record<StaffRole, Record<StaffRank, number>> = {
  tf: { 1: 3200, 2: 4100, 3: 5200 },
  wagenpruefer: { 1: 5600, 2: 6800, 3: 8200 },
  azf: { 1: 3800, 2: 4200, 3: 4600 },
};

export function salaryFor(role: StaffRole, rank: StaffRank): number {
  return MONTHLY_SALARY[role][rank];
}

export const RECRUIT_OFFERS: RecruitOffer[] = [
  {
    role: 'tf',
    rank: 1,
    name: 'Triebfahrzeugführer Rang 1',
    hiringCost: 2450,
    salary: salaryFor('tf', 1),
    minBekanntheit: 0,
    qualifications: ['Tf'],
  },
  {
    role: 'tf',
    rank: 2,
    name: 'Triebfahrzeugführer Rang 2',
    hiringCost: 3900,
    salary: salaryFor('tf', 2),
    minBekanntheit: 20,
    qualifications: ['Tf'],
  },
  {
    role: 'tf',
    rank: 3,
    name: 'Triebfahrzeugführer Rang 3',
    hiringCost: 6200,
    salary: salaryFor('tf', 3),
    minBekanntheit: 40,
    qualifications: ['Tf'],
  },
  {
    role: 'azf',
    rank: 1,
    name: 'Arbeitszugführer / Rangierbegleiter Rang 1',
    hiringCost: 2100,
    salary: salaryFor('azf', 1),
    minBekanntheit: 0,
    qualifications: ['AZF', 'RB'],
  },
  {
    role: 'azf',
    rank: 2,
    name: 'Arbeitszugführer / Rangierbegleiter Rang 2',
    hiringCost: 3400,
    salary: salaryFor('azf', 2),
    minBekanntheit: 15,
    qualifications: ['AZF', 'RB'],
  },
  {
    role: 'azf',
    rank: 3,
    name: 'Arbeitszugführer / Rangierbegleiter Rang 3',
    hiringCost: 5100,
    salary: salaryFor('azf', 3),
    minBekanntheit: 30,
    qualifications: ['AZF', 'RB'],
  },
  {
    role: 'wagenpruefer',
    rank: 1,
    name: 'Wagenprüfer Rang 1',
    hiringCost: 2800,
    salary: salaryFor('wagenpruefer', 1),
    minBekanntheit: 0,
    qualifications: ['Wagenprüfer', 'Stufe 1'],
  },
  {
    role: 'wagenpruefer',
    rank: 2,
    name: 'Wagenprüfer Rang 2',
    hiringCost: 4100,
    salary: salaryFor('wagenpruefer', 2),
    minBekanntheit: 18,
    qualifications: ['Wagenprüfer', 'Stufe 2'],
  },
  {
    role: 'wagenpruefer',
    rank: 3,
    name: 'Wagenprüfer Rang 3',
    hiringCost: 5600,
    salary: salaryFor('wagenpruefer', 3),
    minBekanntheit: 35,
    qualifications: ['Wagenprüfer', 'Stufe 3'],
  },
];

export interface JobListing {
  id: string;
  personName: string;
  role: StaffRole;
  rank: StaffRank;
  roleLabel: string;
  hiringCost: number;
  salary: number;
  minBekanntheit: number;
  qualifications: string[];
  seriesIds: string[];
}

const MARKET_FIRST = [
  'Markus',
  'Stefan',
  'Uwe',
  'Thomas',
  'Michael',
  'Andreas',
  'Jürgen',
  'Peter',
  'Klaus',
  'Ralf',
  'Bernd',
  'Frank',
  'Dirk',
  'Holger',
  'Martin',
  'Daniel',
  'Christian',
  'Matthias',
  'Thorsten',
  'Sven',
  'Heiko',
  'Jens',
  'Torsten',
  'Volker',
  'Ingo',
  'Kai',
  'Oliver',
  'Patrick',
  'Rainer',
  'Wolfgang',
  'Anja',
  'Katrin',
  'Sandra',
  'Nicole',
  'Claudia',
  'Petra',
  'Silke',
  'Tanja',
];
const MARKET_LAST = [
  'Weber',
  'Klein',
  'Wagner',
  'Schäfer',
  'Braun',
  'Richter',
  'Wolf',
  'Neumann',
  'Schwarz',
  'Krüger',
  'Hoffmann',
  'Schneider',
  'Becker',
  'Lange',
  'Köhler',
  'Werner',
  'Scholz',
  'Hahn',
  'Vogel',
  'Keller',
  'Schmitt',
  'Böhm',
  'Schubert',
  'Lorenz',
  'Bergmann',
  'Friedrich',
  'Günther',
  'Seidel',
];

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

function roundTo(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step);
}

function jitterAmount(rng: () => number, base: number, spread: number, step: number): number {
  const factor = 1 + (rng() * 2 - 1) * spread;
  return roundTo(base * factor, step);
}

function pickMarketName(rng: () => number, used: Set<string>): string {
  let personName = `${MARKET_FIRST[Math.floor(rng() * MARKET_FIRST.length)]} ${MARKET_LAST[Math.floor(rng() * MARKET_LAST.length)]}`;
  let guard = 0;
  while (used.has(personName) && guard < 60) {
    personName = `${MARKET_FIRST[Math.floor(rng() * MARKET_FIRST.length)]} ${MARKET_LAST[Math.floor(rng() * MARKET_LAST.length)]}`;
    guard += 1;
  }
  if (used.has(personName)) personName = `${personName} ${used.size + 1}`;
  used.add(personName);
  return personName;
}

function rankFromRng(rng: () => number): StaffRank {
  const r = rng();
  if (r < 0.55) return 1;
  if (r < 0.85) return 2;
  return 3;
}

export function staffRoleFullLabel(role: StaffRole, rank: StaffRank): string {
  if (role === 'tf') return `Triebfahrzeugführer · Qualifikationsstufe ${rank}`;
  if (role === 'azf') return `Arbeitszugführer / Rangierbegleiter · Qualifikationsstufe ${rank}`;
  return `Wagenprüfer · Qualifikationsstufe ${rank}`;
}

function hashDayKey(day: string | number): number {
  const s = String(day);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function generateJobBoard(dayKey: number | string, existingNames: string[]): JobListing[] {
  const rng = mulberry32(hashDayKey(dayKey) ^ 0x9e3779b9);
  const used = new Set(existingNames);
  const slots: StaffRole[] = ['tf', 'tf', 'tf', 'azf', 'azf', 'wagenpruefer', 'wagenpruefer'];
  const listings: JobListing[] = [];
  for (let i = 0; i < slots.length; i++) {
    const role = slots[i];
    const rank: StaffRank = i === 0 || i === 4 ? 1 : rankFromRng(rng);
    const offer = RECRUIT_OFFERS.find((o) => o.role === role && o.rank === rank) ?? RECRUIT_OFFERS[0];
    const personName = pickMarketName(rng, used);
    const seriesIds = pickSeriesForHire(rng, offer.rank, offer.role);
    const seriesLabels = seriesIds.map((id) => seriesLabel(id));
    listings.push({
      id: `job-${dayKey}-${i}-${personName.replace(/\s+/g, '').slice(0, 12)}`,
      personName,
      role: offer.role,
      rank: offer.rank,
      roleLabel: staffRoleFullLabel(offer.role, offer.rank),
      hiringCost: jitterAmount(rng, offer.hiringCost, 0.16, 50),
      salary: jitterAmount(rng, offer.salary, 0.12, 50),
      minBekanntheit: Math.max(0, offer.minBekanntheit + (rng() < 0.2 ? 5 : 0)),
      qualifications: [...offer.qualifications, `Stufe ${offer.rank}`, ...seriesLabels],
      seriesIds,
    });
  }
  return listings;
}

interface StoredJobBoard {
  day: string;
  listings: JobListing[];
}

export function loadJobBoardState(): StoredJobBoard | null {
  const loaded = loadJson<StoredJobBoard | null>(JOB_BOARD_KEY, null);
  if (!loaded || typeof loaded !== 'object' || !Array.isArray(loaded.listings)) return null;
  if (typeof loaded.day !== 'string' || loaded.day.length === 0) return null;
  return {
    day: loaded.day,
    listings: loaded.listings.filter((row) => row && typeof row.personName === 'string').map((row) => ({
      ...row,
      seriesIds: Array.isArray(row.seriesIds) ? row.seriesIds.filter((id) => typeof id === 'string') : [],
    })),
  };
}

export function saveJobBoardState(state: StoredJobBoard): void {
  saveJson(JOB_BOARD_KEY, state);
  saveJson(JOB_BOARD_DAY_KEY, state.day);
}

export function ensureDailyJobBoard(
  tick: number,
  extraMinutes: number,
  existingNames: string[],
): JobListing[] {
  const day = marketRefreshDayKey(tick, extraMinutes);
  const stored = loadJobBoardState();
  if (stored && stored.day === day) return stored.listings;
  const listings = generateJobBoard(day, existingNames);
  saveJobBoardState({ day, listings });
  return listings;
}

export function removeJobListing(listingId: string): JobListing[] {
  const stored = loadJobBoardState();
  if (!stored) return [];
  const listings = stored.listings.filter((row) => row.id !== listingId);
  saveJobBoardState({ ...stored, listings });
  return listings;
}

export function listingAsOffer(listing: JobListing): RecruitOffer {
  return {
    role: listing.role,
    rank: listing.rank,
    name: listing.roleLabel,
    hiringCost: listing.hiringCost,
    salary: listing.salary,
    minBekanntheit: listing.minBekanntheit,
    qualifications: listing.qualifications.filter(
      (q) => q === 'Tf' || q === 'AZF' || q === 'RB' || q.startsWith('Stufe'),
    ),
  };
}

export function listingToStaffMeta(
  listing: JobListing,
  driverId: string,
  extraSeriesIds: string[] = [],
): StaffMeta {
  return {
    driverId,
    role: listing.role,
    rank: listing.rank,
    salary: listing.salary,
    trainingUntilTick: null,
    xp: listing.rank === 3 ? 120 : listing.rank === 2 ? 40 : 0,
    seriesIds: [...new Set([...(listing.seriesIds ?? []), ...extraSeriesIds])],
    trainingKind: null,
    trainingSeriesId: null,
  };
}

export const TRAINING_COST: Record<StaffRank, number> = { 1: 0, 2: 2200, 3: 3800 };
export const TRAINING_TICKS = 24;
export const RANK_QUICK_PAY_FACTOR = 1.4;

export function nextRankTraining(rank: StaffRank): { nextRank: StaffRank; cost: number; durationTicks: number; durationDays: number } | null {
  if (rank >= 3) return null;
  const nextRank = (rank + 1) as StaffRank;
  return {
    nextRank,
    cost: TRAINING_COST[nextRank],
    durationTicks: TRAINING_TICKS,
    durationDays: Math.max(1, Math.round(TRAINING_TICKS / 24)),
  };
}

export function rankQuickPayCost(rank: StaffRank): number | null {
  const quote = nextRankTraining(rank);
  if (!quote) return null;
  return Math.round(quote.cost * RANK_QUICK_PAY_FACTOR);
}

const FIRST_NAMES = ['Lena', 'Jonas', 'Mara', 'Tim', 'Nina', 'Felix', 'Sara', 'Omar', 'Greta', 'Paul', 'Lea', 'Ben'];
const LAST_NAMES = ['Krüger', 'Schmitt', 'Neumann', 'Wolf', 'Schäfer', 'Koch', 'Bauer', 'Krause', 'Lorenz', 'Vogel'];

export function loadStaffMeta(): Record<string, StaffMeta> {
  const loaded = loadJson<Record<string, StaffMeta> | null>(STAFF_META_KEY, null);
  if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) return {};
  const next: Record<string, StaffMeta> = {};
  for (const [id, entry] of Object.entries(loaded)) {
    if (!entry || typeof entry !== 'object') continue;
    const salary = Number(entry.salary);
    next[id] = {
      driverId: typeof entry.driverId === 'string' ? entry.driverId : id,
      role: entry.role === 'wagenpruefer' ? 'wagenpruefer' : entry.role === 'azf' ? 'azf' : 'tf',
      rank: entry.rank === 2 || entry.rank === 3 ? entry.rank : 1,
      salary: Number.isFinite(salary) && salary > 0 ? salary : salaryFor('tf', 1),
      trainingUntilTick: entry.trainingUntilTick ?? null,
      xp: Math.max(0, Number(entry.xp) || 0),
      seriesIds: Array.isArray(entry.seriesIds)
        ? entry.seriesIds.filter((sid): sid is string => typeof sid === 'string')
        : [],
      trainingKind: entry.trainingKind === 'series' || entry.trainingKind === 'rank' ? entry.trainingKind : null,
      trainingSeriesId: typeof entry.trainingSeriesId === 'string' ? entry.trainingSeriesId : null,
    };
  }
  return next;
}

export function saveStaffMeta(meta: Record<string, StaffMeta>): void {
  saveJson(STAFF_META_KEY, meta);
}

export function loadExtraDrivers(): Driver[] {
  const loaded = loadJson<Driver[] | null>(EXTRA_DRIVERS_KEY, null);
  return Array.isArray(loaded) ? loaded : [];
}

export function saveExtraDrivers(drivers: Driver[]): void {
  saveJson(EXTRA_DRIVERS_KEY, drivers);
}

export function inferStaffMeta(driver: Driver): StaffMeta {
  const quals = (driver.qualifications ?? []).join(' ').toLowerCase();
  const hasAzf =
    quals.includes('azf') ||
    quals.includes('rangierbegleiter') ||
    /\brb\b/.test(quals) ||
    quals.includes('arbeitszug');
  const hasTf = quals.includes('tf');
  const hasWp = quals.includes('wagenprüfer') || quals.includes('wagenpruefer');
  let rank: StaffRank = 1;
  if (quals.includes('stufe 3')) rank = 3;
  else if (quals.includes('stufe 2')) rank = 2;
  const role: StaffRole = hasWp && !hasTf && !hasAzf ? 'wagenpruefer' : hasAzf && !hasTf ? 'azf' : 'tf';
  return {
    driverId: driver.id,
    role,
    rank,
    salary: salaryFor(role, rank),
    trainingUntilTick: null,
    xp: rank === 3 ? 120 : rank === 2 ? 40 : 12,
    seriesIds: role === 'tf' ? ['br218'] : [],
    trainingKind: null,
    trainingSeriesId: null,
  };
}

export function staffRoleLabel(role: StaffRole): string {
  if (role === 'tf') return 'Tf';
  if (role === 'azf') return 'AZF/RB';
  return 'Wp';
}

export function ensureStaffMeta(drivers: Driver[], existing: Record<string, StaffMeta>): Record<string, StaffMeta> {
  const next = { ...existing };
  for (const driver of drivers) {
    if (!next[driver.id]) {
      next[driver.id] = inferStaffMeta(driver);
      continue;
    }
    const entry = next[driver.id];
    const seriesIds =
      entry.role === 'tf' && (!entry.seriesIds || entry.seriesIds.length === 0) ? ['br218'] : (entry.seriesIds ?? []);
    next[driver.id] = {
      ...entry,
      salary: entry.salary > 0 ? entry.salary : salaryFor(entry.role, entry.rank),
      xp: Math.max(0, Number(entry.xp) || 0),
      seriesIds,
      trainingKind: entry.trainingKind ?? null,
      trainingSeriesId: entry.trainingSeriesId ?? null,
    };
  }
  return next;
}

export function randomStaffName(existing: Driver[]): string {
  const used = new Set(existing.map((d) => d.name));
  for (let i = 0; i < 40; i++) {
    const name = `${FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]}`;
    if (!used.has(name)) return name;
  }
  return `${FIRST_NAMES[0]} ${LAST_NAMES[0]} ${existing.length + 1}`;
}

export function buildRecruit(offer: RecruitOffer, name: string): Driver {
  return {
    id: newNotificationId(),
    name,
    status: 'verfuegbar',
    qualifications: offer.qualifications,
    hours_worked: 0,
    max_hours: 48,
    last_rest_end: GAME_EPOCH_ISO,
    shift_start: null,
    phone: null,
    created_at: new Date().toISOString(),
    recovery_hours_left: null,
  };
}

export function processPayrollTick(
  meta: Record<string, StaffMeta>,
  company: Company,
  prevTick: number,
  nextTick: number,
): { company: Company; notifications: Omit<Notification, 'id'>[] } {
  if (!isNewGameDay(prevTick, nextTick)) return { company, notifications: [] };
  const daily = Object.values(meta ?? {}).reduce((s, m) => {
    const salary = Number(m?.salary);
    return Number.isFinite(salary) && salary > 0 ? s + Math.round(salary / 30) : s;
  }, 0);
  if (daily <= 0) return { company, notifications: [] };
  return {
    company: { ...company, balance: company.balance - daily },
    notifications: [],
  };
}

export function applyOperatingXp(meta: StaffMeta, gained: number): StaffMeta {
  const xp = Math.max(0, (meta.xp ?? 0) + Math.max(0, gained));
  let rank = meta.rank;
  let salary = meta.salary;
  if (xp >= XP_RANK_3 && rank < 3) {
    rank = 3;
    salary = Math.max(salary, salaryFor(meta.role, 3));
  } else if (xp >= XP_RANK_2 && rank < 2) {
    rank = 2;
    salary = Math.max(salary, salaryFor(meta.role, 2));
  }
  return { ...meta, xp, rank, salary };
}

export function grantCrewExperience(
  meta: Record<string, StaffMeta>,
  crew: { driverId?: string | null; secondId?: string | null; azfId?: string | null },
): Record<string, StaffMeta> {
  const next = { ...meta };
  const bump = (id: string | null | undefined, amount: number) => {
    if (!id || !next[id]) return;
    next[id] = applyOperatingXp(next[id], amount);
  };
  bump(crew.driverId, XP_PER_TF_TRIP);
  bump(crew.secondId, XP_PER_SECOND_TF);
  bump(crew.azfId, XP_PER_AZF_TRIP);
  return next;
}

export function completeDueTraining(
  drivers: Driver[],
  meta: Record<string, StaffMeta>,
  tick: number,
): { drivers: Driver[]; meta: Record<string, StaffMeta> } {
  let nextDrivers = drivers;
  const nextMeta = { ...meta };
  for (const [id, entry] of Object.entries(nextMeta)) {
    if (entry.trainingUntilTick == null || entry.trainingUntilTick > tick) continue;
    const driver = nextDrivers.find((d) => d.id === id);
    if (!driver) continue;
    if (entry.trainingKind === 'series' && entry.trainingSeriesId) {
      const seriesIds = [...new Set([...(entry.seriesIds ?? []), entry.trainingSeriesId])];
      nextMeta[id] = {
        ...entry,
        seriesIds,
        trainingUntilTick: null,
        trainingKind: null,
        trainingSeriesId: null,
      };
      nextDrivers = nextDrivers.map((d) =>
        d.id === id ? { ...d, status: d.status === 'pause' ? 'verfuegbar' : d.status } : d,
      );
      continue;
    }
    const rank = Math.min(3, (entry.rank + 1) as number) as StaffRank;
    const offer = RECRUIT_OFFERS.find((o) => o.role === entry.role && o.rank === rank);
    nextMeta[id] = {
      ...entry,
      rank,
      salary: offer?.salary ?? entry.salary + 800,
      trainingUntilTick: null,
      trainingKind: null,
      trainingSeriesId: null,
    };
    nextDrivers = nextDrivers.map((d) =>
      d.id === id
        ? {
            ...d,
            status: d.status === 'pause' ? 'verfuegbar' : d.status,
            qualifications: offer?.qualifications ?? d.qualifications,
          }
        : d,
    );
  }
  return { drivers: nextDrivers, meta: nextMeta };
}
