import type { AssignmentWithDetails, Company, Locomotive } from '@/lib/supabase';
import { DEPOT_EXPANSIONS, purchasedSet, type DepotState } from '@/lib/depot';
import { isBaugleisEinsatz } from '@/lib/orderMarket';
import {
  locoHasEtcs,
  orderDestCountry,
  orderOriginCountry,
  orderRequiresEtcs,
} from '@/lib/networkAccess';
import { formatEuro } from '@/lib/status';
import { loadJson, saveJson, TICKS_PER_DAY } from '@/lib/storage';

export const ACHIEVEMENTS_KEY = 'evu-achievements';
export const STARTER_FRAMEWORK_ID = 'fc-ruhr-coil';
export const WORKSHOP_DISCOUNT_CAP = 15;
export const DAMAGE_FREE_DAYS = 90;

export type AchievementCategory = 'transport' | 'fleet' | 'finance' | 'special';
export type LiveryId = 'flottengruen' | 'konzernsilber' | 'werbegold' | 'korridorblau' | 'baugleisocker';
export type AchievementIcon =
  | 'package'
  | 'scale'
  | 'handshake'
  | 'clock'
  | 'train'
  | 'warehouse'
  | 'cpu'
  | 'wrench'
  | 'banknote'
  | 'megaphone'
  | 'building'
  | 'users'
  | 'shield'
  | 'landmark'
  | 'globe'
  | 'radio'
  | 'badge-check'
  | 'file-check'
  | 'list-todo'
  | 'hard-hat';

export type AchievementReward =
  | { kind: 'cash'; amount: number }
  | { kind: 'workshop'; percent: number }
  | { kind: 'livery'; id: LiveryId; label: string };

export interface AchievementProgress {
  current: number;
  target: number;
  unit?: string;
}

export interface AchievementDef {
  id: string;
  name: string;
  aka?: string;
  category: AchievementCategory;
  icon: AchievementIcon;
  condition: string;
  teaser: string;
  artHue: number;
  reward: AchievementReward;
  isMet: (world: AchievementWorld) => boolean;
  progress: (world: AchievementWorld) => AchievementProgress | null;
}

export interface AchievementCounters {
  freightTonnes: number;
  delayFreeTrips: number;
  contractsCompleted: number;
  workshopMaintenances: number;
  internationalOrders: number;
  etcsOrders: number;
  loansPaidOff: number;
  everTookLoan: boolean;
  starterMissedDays: number;
  starterFrameworkClean: boolean;
  spotOrders: number;
  baugleisCompleted: number;
  damageFreeSinceTick: number;
}

export interface AchievementState {
  unlockedIds: string[];
  unlockedAtTick: Record<string, number>;
  counters: AchievementCounters;
}

export interface AchievementWorld {
  tick: number;
  balance: number;
  overdraftLimit: number;
  reputation: number;
  level: number;
  locos: Locomotive[];
  leasedLocoIds: Iterable<string>;
  staffCount: number;
  depot: DepotState;
  counters: AchievementCounters;
}

export const ACHIEVEMENT_CATEGORIES: ReadonlyArray<{ id: AchievementCategory; label: string }> = [
  { id: 'transport', label: 'Transport & Logistik' },
  { id: 'fleet', label: 'Fuhrpark & Technik' },
  { id: 'finance', label: 'Finanzen & Unternehmen' },
  { id: 'special', label: 'Spezial & Risiko' },
];

export function emptyAchievementCounters(): AchievementCounters {
  return {
    freightTonnes: 0,
    delayFreeTrips: 0,
    contractsCompleted: 0,
    workshopMaintenances: 0,
    internationalOrders: 0,
    etcsOrders: 0,
    loansPaidOff: 0,
    everTookLoan: false,
    starterMissedDays: 0,
    starterFrameworkClean: false,
    spotOrders: 0,
    baugleisCompleted: 0,
    damageFreeSinceTick: 0,
  };
}

export function emptyAchievementState(): AchievementState {
  return { unlockedIds: [], unlockedAtTick: {}, counters: emptyAchievementCounters() };
}

function num(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

export function liquidWealth(balance: number, overdraftLimit: number): number {
  return Math.round(num(balance) + Math.max(0, num(overdraftLimit)));
}

export function ownedLocoCount(locos: Locomotive[], leasedLocoIds: Iterable<string>): number {
  const leased = new Set(leasedLocoIds);
  return locos.filter((loco) => !leased.has(loco.id)).length;
}

export function activeLocoCount(locos: Locomotive[]): number {
  return locos.filter((loco) => loco.status !== 'stillgelegt').length;
}

export function fleetAllEtcs(locos: Locomotive[]): boolean {
  return locos.length > 0 && locos.every((loco) => locoHasEtcs(loco));
}

export function isDepotFullyExpanded(depot: DepotState | null | undefined): boolean {
  const owned = purchasedSet(depot);
  return DEPOT_EXPANSIONS.every((expansion) => owned.has(expansion.id));
}

export function damageFreeDays(tick: number, sinceTick: number): number {
  return Math.max(0, Math.floor((num(tick) - num(sinceTick)) / TICKS_PER_DAY));
}

function pct(current: number, target: number, unit?: string): AchievementProgress {
  return { current: Math.min(current, target), target, unit };
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: 'erster-schritt',
    name: 'Erster Schritt',
    category: 'transport',
    icon: 'package',
    condition: 'Erste 1.000 t Fracht befördert (abgeschlossene Aufträge).',
    teaser: 'Eine einmalige Prämie aufs Firmenkonto.',
    artHue: 38,
    reward: { kind: 'cash', amount: 10_000 },
    isMet: (w) => w.counters.freightTonnes >= 1_000,
    progress: (w) => pct(w.counters.freightTonnes, 1_000, 't'),
  },
  {
    id: 'schwergewicht',
    name: 'Schwergewicht',
    category: 'transport',
    icon: 'scale',
    condition: 'Insgesamt 50.000 t Fracht befördert.',
    teaser: 'Eine kräftige Sonderzahlung.',
    artHue: 25,
    reward: { kind: 'cash', amount: 35_000 },
    isMet: (w) => w.counters.freightTonnes >= 50_000,
    progress: (w) => pct(w.counters.freightTonnes, 50_000, 't'),
  },
  {
    id: 'grosskunde',
    name: 'Großkunde',
    category: 'transport',
    icon: 'handshake',
    condition: '25 Industrie- bzw. Rahmenvertragsläufe erfolgreich abgeschlossen.',
    teaser: 'Bonus für verlässliche Vertragstreue.',
    artHue: 210,
    reward: { kind: 'cash', amount: 40_000 },
    isMet: (w) => w.counters.contractsCompleted >= 25,
    progress: (w) => pct(w.counters.contractsCompleted, 25, 'Läufe'),
  },
  {
    id: 'puenktlicher-partner',
    name: 'Pünktlicher Partner',
    category: 'transport',
    icon: 'clock',
    condition: '50 Fahrten ohne Verspätung, Pönale und Ruhezeitverstoß.',
    teaser: 'Prämie für saubere Fahrpläne.',
    artHue: 160,
    reward: { kind: 'cash', amount: 25_000 },
    isMet: (w) => w.counters.delayFreeTrips >= 50,
    progress: (w) => pct(w.counters.delayFreeTrips, 50, 'Fahrten'),
  },
  {
    id: 'flottenzuwachs',
    name: 'Flottenzuwachs',
    category: 'fleet',
    icon: 'train',
    condition: 'Mindestens 5 eigene Loks gleichzeitig (ohne Leasing).',
    teaser: 'Eine Sonderlackierung für den Fuhrpark.',
    artHue: 142,
    reward: { kind: 'livery', id: 'flottengruen', label: 'Flottengrün' },
    isMet: (w) => ownedLocoCount(w.locos, w.leasedLocoIds) >= 5,
    progress: (w) => pct(ownedLocoCount(w.locos, w.leasedLocoIds), 5, 'eigene Loks'),
  },
  {
    id: 'grossbetrieb',
    name: 'Großbetrieb',
    category: 'fleet',
    icon: 'warehouse',
    condition: '15 aktive Lokomotiven im Bestand (nicht stillgelegt).',
    teaser: 'Weitere Flottenlackierung.',
    artHue: 220,
    reward: { kind: 'livery', id: 'konzernsilber', label: 'Konzernsilber' },
    isMet: (w) => activeLocoCount(w.locos) >= 15,
    progress: (w) => pct(activeLocoCount(w.locos), 15, 'aktive Loks'),
  },
  {
    id: 'digitaler-wandel',
    name: 'Digitaler Wandel',
    aka: 'Volldigital',
    category: 'fleet',
    icon: 'cpu',
    condition: 'Gesamte Flotte mit ETCS ausgerüstet (mindestens eine Lok).',
    teaser: 'Permanenter Werkstatt-Rabatt.',
    artHue: 195,
    reward: { kind: 'workshop', percent: 5 },
    isMet: (w) => fleetAllEtcs(w.locos),
    progress: (w) => {
      const etcs = w.locos.filter((loco) => locoHasEtcs(loco)).length;
      const target = Math.max(1, w.locos.length);
      return pct(etcs, target, 'Loks mit ETCS');
    },
  },
  {
    id: 'werkstatt-stammgast',
    name: 'Werkstatt-Stammgast',
    category: 'fleet',
    icon: 'wrench',
    condition: '30 erfolgreiche F-, ZU- oder HU-Arbeiten (keine Reparatur/ETCS).',
    teaser: 'Permanenter Werkstatt-Rabatt.',
    artHue: 12,
    reward: { kind: 'workshop', percent: 5 },
    isMet: (w) => w.counters.workshopMaintenances >= 30,
    progress: (w) => pct(w.counters.workshopMaintenances, 30, 'Fristarbeiten'),
  },
  {
    id: 'erste-million',
    name: 'Erste Million',
    category: 'finance',
    icon: 'banknote',
    condition: 'Liquide Mittel über 1.000.000 € (Kontostand + Dispo-Rahmen).',
    teaser: 'Sonderzahlung aufs Konto.',
    artHue: 48,
    reward: { kind: 'cash', amount: 50_000 },
    isMet: (w) => liquidWealth(w.balance, w.overdraftLimit) > 1_000_000,
    progress: (w) => pct(liquidWealth(w.balance, w.overdraftLimit), 1_000_001, '€ liquide'),
  },
  {
    id: 'werbe-ikone',
    name: 'Werbe-Ikone',
    category: 'finance',
    icon: 'megaphone',
    condition: 'Bekanntheit 100 erreichen.',
    teaser: 'Werbelackierung für den Fuhrpark.',
    artHue: 328,
    reward: { kind: 'livery', id: 'werbegold', label: 'Werbegold' },
    isMet: (w) => w.reputation >= 100,
    progress: (w) => pct(w.reputation, 100, 'Bekanntheit'),
  },
  {
    id: 'grosskonzern',
    name: 'Großkonzern',
    category: 'finance',
    icon: 'building',
    condition: 'Firmen-Level 10 erreichen.',
    teaser: 'Konzernprämie aufs Konto.',
    artHue: 266,
    reward: { kind: 'cash', amount: 50_000 },
    isMet: (w) => w.level >= 10,
    progress: (w) => pct(w.level, 10, 'Level'),
  },
  {
    id: 'arbeitgeber-des-jahres',
    name: 'Arbeitgeber des Jahres',
    category: 'finance',
    icon: 'users',
    condition: 'Mindestens 10 Beschäftigte gleichzeitig (Tf, AZF und übriges Personal).',
    teaser: 'Prämie für den Personalaufbau.',
    artHue: 175,
    reward: { kind: 'cash', amount: 20_000 },
    isMet: (w) => w.staffCount >= 10,
    progress: (w) => pct(w.staffCount, 10, 'Beschäftigte'),
  },
  {
    id: 'schadensfrei',
    name: 'Schadensfrei',
    category: 'special',
    icon: 'shield',
    condition: '3 Spielmonate (90 Tage) ohne ungeplanten Lokschaden (keine Zufallsausfälle, keine ZU-Folgeschäden, keine Unfälle). Geplante F/ZU/HU zählen nicht.',
    teaser: 'Sicherheitsprämie aufs Konto.',
    artHue: 152,
    reward: { kind: 'cash', amount: 30_000 },
    isMet: (w) => damageFreeDays(w.tick, w.counters.damageFreeSinceTick) >= DAMAGE_FREE_DAYS,
    progress: (w) => pct(damageFreeDays(w.tick, w.counters.damageFreeSinceTick), DAMAGE_FREE_DAYS, 'Tage'),
  },
  {
    id: 'infrastruktur-boss',
    name: 'Infrastruktur-Boss',
    category: 'special',
    icon: 'landmark',
    condition: 'Alle Werkstatt-Slots und alle Gleis-/Stellplätze unter Gebäude gekauft.',
    teaser: 'Maximaler Werkstatt-Rabatt.',
    artHue: 32,
    reward: { kind: 'workshop', percent: 5 },
    isMet: (w) => isDepotFullyExpanded(w.depot),
    progress: (w) => pct(purchasedSet(w.depot).size, DEPOT_EXPANSIONS.length, 'Ausbauten'),
  },
  {
    id: 'grenzverkehr',
    name: 'Grenzverkehr',
    category: 'special',
    icon: 'globe',
    condition: 'Ersten internationalen Auftrag mit Länderpaket abschließen (Start- ≠ Zielland).',
    teaser: 'Korridor-Lackierung.',
    artHue: 205,
    reward: { kind: 'livery', id: 'korridorblau', label: 'Korridorblau' },
    isMet: (w) => w.counters.internationalOrders >= 1,
    progress: (w) => pct(w.counters.internationalOrders, 1, 'Auslandsfahrten'),
  },
  {
    id: 'etcs-premiere',
    name: 'ETCS-Premiere',
    category: 'fleet',
    icon: 'radio',
    condition: 'Ersten ETCS-pflichtigen Auftrag erfüllen.',
    teaser: 'Prämie für den Einstieg ins digitale Netz.',
    artHue: 188,
    reward: { kind: 'cash', amount: 15_000 },
    isMet: (w) => w.counters.etcsOrders >= 1,
    progress: (w) => pct(w.counters.etcsOrders, 1, 'ETCS-Aufträge'),
  },
  {
    id: 'schuldenfrei',
    name: 'Schuldenfrei',
    category: 'finance',
    icon: 'badge-check',
    condition: 'Ein aufgenommenes Darlehen vollständig tilgen (Sondertilgung oder letzte Rate).',
    teaser: 'Bonus für saubere Bücher.',
    artHue: 85,
    reward: { kind: 'cash', amount: 25_000 },
    isMet: (w) => w.counters.everTookLoan && w.counters.loansPaidOff >= 1,
    progress: (w) => pct(w.counters.loansPaidOff, 1, 'getilgte Kredite'),
  },
  {
    id: 'rahmen-sauber',
    name: 'Vertragstreue',
    category: 'transport',
    icon: 'file-check',
    condition: 'Starter-Rahmenvertrag (Coil-Nahverkehr Duisburg–Dortmund) ohne Vertragsstrafe zu Ende fahren.',
    teaser: 'Prämie für den sauberen Erstvertrag.',
    artHue: 18,
    reward: { kind: 'cash', amount: 20_000 },
    isMet: (w) => w.counters.starterFrameworkClean,
    progress: (w) => pct(w.counters.starterFrameworkClean ? 1 : 0, 1, 'sauberer Startervertrag'),
  },
  {
    id: 'spot-koenig',
    name: 'Spot-König',
    category: 'transport',
    icon: 'list-todo',
    condition: '100 Spot-Aufträge der Frachtbörse abschließen (ohne Rahmenvertrag/Baugleis).',
    teaser: 'Große Spot-Prämie.',
    artHue: 280,
    reward: { kind: 'cash', amount: 45_000 },
    isMet: (w) => w.counters.spotOrders >= 100,
    progress: (w) => pct(w.counters.spotOrders, 100, 'Spot-Aufträge'),
  },
  {
    id: 'baugleis-pionier',
    name: 'Baugleis-Pionier',
    category: 'special',
    icon: 'hard-hat',
    condition: 'Ersten Baugleis-Einsatz vollständig abschließen.',
    teaser: 'Baustellenlackierung für den Fuhrpark.',
    artHue: 52,
    reward: { kind: 'livery', id: 'baugleisocker', label: 'Baugleisocker' },
    isMet: (w) => w.counters.baugleisCompleted >= 1,
    progress: (w) => pct(w.counters.baugleisCompleted, 1, 'Baugleis-Einsätze'),
  },
];

export const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.fromEntries(
  ACHIEVEMENTS.map((def) => [def.id, def]),
);

export function achievementCount(): number {
  return ACHIEVEMENTS.length;
}

function normalizeCounters(raw: Partial<AchievementCounters> | undefined): AchievementCounters {
  const base = emptyAchievementCounters();
  if (!raw || typeof raw !== 'object') return base;
  return {
    freightTonnes: Math.max(0, num(raw.freightTonnes)),
    delayFreeTrips: Math.max(0, Math.round(num(raw.delayFreeTrips))),
    contractsCompleted: Math.max(0, Math.round(num(raw.contractsCompleted))),
    workshopMaintenances: Math.max(0, Math.round(num(raw.workshopMaintenances))),
    internationalOrders: Math.max(0, Math.round(num(raw.internationalOrders))),
    etcsOrders: Math.max(0, Math.round(num(raw.etcsOrders))),
    loansPaidOff: Math.max(0, Math.round(num(raw.loansPaidOff))),
    everTookLoan: Boolean(raw.everTookLoan),
    starterMissedDays: Math.max(0, Math.round(num(raw.starterMissedDays))),
    starterFrameworkClean: Boolean(raw.starterFrameworkClean),
    spotOrders: Math.max(0, Math.round(num(raw.spotOrders))),
    baugleisCompleted: Math.max(0, Math.round(num(raw.baugleisCompleted))),
    damageFreeSinceTick: Math.max(0, Math.round(num(raw.damageFreeSinceTick))),
  };
}

export function normalizeAchievementState(raw: unknown): AchievementState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyAchievementState();
  const data = raw as Partial<AchievementState>;
  const known = new Set(ACHIEVEMENTS.map((def) => def.id));
  const unlockedIds = (Array.isArray(data.unlockedIds) ? data.unlockedIds : []).filter(
    (id): id is string => typeof id === 'string' && known.has(id),
  );
  const unlockedAtTick: Record<string, number> = {};
  const src = data.unlockedAtTick && typeof data.unlockedAtTick === 'object' ? data.unlockedAtTick : {};
  for (const id of unlockedIds) {
    unlockedAtTick[id] = Math.max(0, num((src as Record<string, number>)[id]));
  }
  return { unlockedIds, unlockedAtTick, counters: normalizeCounters(data.counters) };
}

export function loadAchievementState(): AchievementState {
  return normalizeAchievementState(loadJson<unknown>(ACHIEVEMENTS_KEY, null));
}

export function saveAchievementState(state: AchievementState): void {
  saveJson(ACHIEVEMENTS_KEY, {
    unlockedIds: state.unlockedIds,
    unlockedAtTick: state.unlockedAtTick,
    counters: state.counters,
  });
}

export function workshopDiscountPct(state: AchievementState | null | undefined): number {
  if (!state) return 0;
  let sum = 0;
  for (const id of state.unlockedIds) {
    const reward = ACHIEVEMENT_BY_ID[id]?.reward;
    if (reward?.kind === 'workshop') sum += reward.percent;
  }
  return Math.max(0, Math.min(WORKSHOP_DISCOUNT_CAP, sum));
}

export function unlockedLiveries(state: AchievementState | null | undefined): LiveryId[] {
  if (!state) return [];
  const ids: LiveryId[] = [];
  for (const id of state.unlockedIds) {
    const reward = ACHIEVEMENT_BY_ID[id]?.reward;
    if (reward?.kind === 'livery' && !ids.includes(reward.id)) ids.push(reward.id);
  }
  return ids;
}

export function activeLivery(state: AchievementState | null | undefined): { id: LiveryId; label: string } | null {
  if (!state) return null;
  for (let i = state.unlockedIds.length - 1; i >= 0; i -= 1) {
    const reward = ACHIEVEMENT_BY_ID[state.unlockedIds[i] ?? '']?.reward;
    if (reward?.kind === 'livery') return { id: reward.id, label: reward.label };
  }
  return null;
}

export function rewardLabel(reward: AchievementReward, unlocked: boolean): string {
  if (!unlocked) {
    if (reward.kind === 'cash') return 'Prämie aufs Firmenkonto';
    if (reward.kind === 'workshop') return 'Permanenter Werkstatt-Rabatt';
    return `Sonderlackierung: ${reward.label}`;
  }
  if (reward.kind === 'cash') return `+${formatEuro(reward.amount)} aufs Konto (Sonstiges)`;
  if (reward.kind === 'workshop') {
    return `−${reward.percent} % Werkstattkosten dauerhaft (max. −${WORKSHOP_DISCOUNT_CAP} % gesamt)`;
  }
  return `Lackierung: ${reward.label}`;
}

export function buildAchievementWorld(input: Omit<AchievementWorld, 'counters'> & { counters?: AchievementCounters }): AchievementWorld {
  return {
    ...input,
    counters: input.counters ?? emptyAchievementCounters(),
  };
}

export function dueAchievementIds(state: AchievementState, world: AchievementWorld): string[] {
  const have = new Set(state.unlockedIds);
  return ACHIEVEMENTS.filter((def) => !have.has(def.id) && def.isMet({ ...world, counters: state.counters })).map(
    (def) => def.id,
  );
}

export interface UnlockResult {
  state: AchievementState;
  unlocked: AchievementDef[];
  cashDelta: number;
}

export function unlockAchievements(state: AchievementState, world: AchievementWorld, atTick: number): UnlockResult {
  const due = dueAchievementIds(state, world);
  if (due.length === 0) return { state, unlocked: [], cashDelta: 0 };
  const unlocked: AchievementDef[] = [];
  const unlockedIds = [...state.unlockedIds];
  const unlockedAtTick = { ...state.unlockedAtTick };
  let cashDelta = 0;
  for (const id of due) {
    const def = ACHIEVEMENT_BY_ID[id];
    if (!def) continue;
    unlockedIds.push(id);
    unlockedAtTick[id] = atTick;
    unlocked.push(def);
    if (def.reward.kind === 'cash') cashDelta += def.reward.amount;
  }
  return {
    state: { ...state, unlockedIds, unlockedAtTick },
    unlocked,
    cashDelta,
  };
}

export function noteUnplannedFault(state: AchievementState, atTick: number): AchievementState {
  if (state.counters.damageFreeSinceTick === atTick) return state;
  return {
    ...state,
    counters: { ...state.counters, damageFreeSinceTick: Math.max(0, atTick) },
  };
}

export function noteWorkshopMaintenances(state: AchievementState, count: number): AchievementState {
  if (count <= 0) return state;
  return {
    ...state,
    counters: {
      ...state.counters,
      workshopMaintenances: state.counters.workshopMaintenances + count,
    },
  };
}

export function noteLoanTaken(state: AchievementState): AchievementState {
  if (state.counters.everTookLoan) return state;
  return { ...state, counters: { ...state.counters, everTookLoan: true } };
}

export function noteLoansPaidOff(state: AchievementState, count: number): AchievementState {
  if (count <= 0) return state;
  return {
    ...state,
    counters: { ...state.counters, loansPaidOff: state.counters.loansPaidOff + count },
  };
}

export function noteStarterMiss(state: AchievementState, contractId: string, missed: number): AchievementState {
  if (contractId !== STARTER_FRAMEWORK_ID || missed <= 0) return state;
  return {
    ...state,
    counters: { ...state.counters, starterMissedDays: state.counters.starterMissedDays + 1 },
  };
}

export function noteStarterExpired(state: AchievementState, contractId: string): AchievementState {
  if (contractId !== STARTER_FRAMEWORK_ID) return state;
  if (state.counters.starterFrameworkClean) return state;
  if (state.counters.starterMissedDays > 0) return state;
  return { ...state, counters: { ...state.counters, starterFrameworkClean: true } };
}

export function noteCompletedTrip(
  state: AchievementState,
  assignment: AssignmentWithDetails,
  late: boolean,
): AchievementState {
  const order = assignment.order;
  const tonnes = Math.max(0, num(order?.weight_t));
  const delayed = late || num(assignment.delay_ticks) > 0 || Boolean(assignment.rest_violation);
  const contractId = assignment.contract_id ?? order?.contract_id ?? null;
  const baugleis = isBaugleisEinsatz(order);
  const international = Boolean(
    order && orderOriginCountry(order) !== orderDestCountry(order),
  );
  const etcs = Boolean(order && orderRequiresEtcs(order));
  return {
    ...state,
    counters: {
      ...state.counters,
      freightTonnes: state.counters.freightTonnes + tonnes,
      delayFreeTrips: delayed ? state.counters.delayFreeTrips : state.counters.delayFreeTrips + 1,
      contractsCompleted: contractId ? state.counters.contractsCompleted + 1 : state.counters.contractsCompleted,
      internationalOrders: international ? state.counters.internationalOrders + 1 : state.counters.internationalOrders,
      etcsOrders: etcs ? state.counters.etcsOrders + 1 : state.counters.etcsOrders,
      spotOrders: !contractId && !baugleis ? state.counters.spotOrders + 1 : state.counters.spotOrders,
      baugleisCompleted: baugleis ? state.counters.baugleisCompleted + 1 : state.counters.baugleisCompleted,
    },
  };
}

export function patchAchievementCounters(
  state: AchievementState,
  patch: Partial<AchievementCounters>,
): AchievementState {
  return { ...state, counters: { ...state.counters, ...patch } };
}

export function applyCashReward<T extends Pick<Company, 'balance'>>(company: T, amount: number): T {
  if (amount <= 0) return company;
  return { ...company, balance: company.balance + amount };
}

export function liveryCssClass(id: LiveryId | null | undefined): string {
  if (!id) return '';
  return `loco-livery loco-livery--${id}`;
}
