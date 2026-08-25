import type { AssignmentWithDetails, Company, Driver, Locomotive } from '@/lib/supabase';
import { sendMessage } from '@/lib/inbox';
import { defaultRecoveryHours } from '@/lib/gameTime';
import { locoHasEtcs } from '@/lib/networkAccess';
import { composeTripDelay } from '@/lib/personal';
import { isNewGameDay, loadJson, saveJson, TICKS_PER_DAY } from '@/lib/storage';
import { formatEuro } from '@/lib/status';
import { newNotificationId } from '@/lib/gameTime';

export const WORLD_EVENTS_KEY = 'evu-world-events';

export interface LineClosure {
  id: string;
  origin: string;
  destination: string;
  untilTick: number;
  extraCost: number;
}

export interface WorldEventState {
  lastEventTick: number;
  dieselMultiplier: number;
  dieselUntilTick: number;
  pathCostMultiplier: number;
  pathCostUntilTick: number;
  closures: LineClosure[];
}

const CLOSURE_PAIRS: Array<[string, string]> = [
  ['Duisburg', 'Dortmund'],
  ['Hamburg Billwerder', 'Hannover'],
  ['Frankfurt', 'Köln'],
  ['Leipzig Hbf', 'Halle'],
  ['Mannheim', 'Karlsruhe'],
  ['Passau', 'Augsburg'],
  ['Nürnberg Rbf', 'Baugleis Ingolstadt'],
  ['Berlin', 'Hannover'],
];

let liveDiesel = 1;
let livePath = 1;
let liveClosures: LineClosure[] = [];

export function defaultWorldEvents(tick = 0): WorldEventState {
  return {
    lastEventTick: tick,
    dieselMultiplier: 1,
    dieselUntilTick: 0,
    pathCostMultiplier: 1,
    pathCostUntilTick: 0,
    closures: [],
  };
}

function pruneState(state: WorldEventState, tick: number): WorldEventState {
  const dieselOn = state.dieselUntilTick > tick;
  const pathOn = state.pathCostUntilTick > tick;
  const closures = (state.closures ?? []).filter((c) => c && c.untilTick > tick);
  return {
    ...state,
    dieselMultiplier: dieselOn ? Math.max(1, Number(state.dieselMultiplier) || 1) : 1,
    dieselUntilTick: dieselOn ? state.dieselUntilTick : 0,
    pathCostMultiplier: pathOn ? Math.max(1, Number(state.pathCostMultiplier) || 1) : 1,
    pathCostUntilTick: pathOn ? state.pathCostUntilTick : 0,
    closures,
  };
}

function publishLive(state: WorldEventState): void {
  liveDiesel = state.dieselMultiplier;
  livePath = state.pathCostMultiplier;
  liveClosures = state.closures;
}

export function getDieselPriceMultiplier(): number {
  const n = Number(liveDiesel);
  return Number.isFinite(n) && n > 1 ? n : 1;
}

export function getPathCostMultiplier(): number {
  const n = Number(livePath);
  return Number.isFinite(n) && n > 1 ? n : 1;
}

export function loadWorldEvents(tick = 0): WorldEventState {
  const loaded = loadJson<WorldEventState | null>(WORLD_EVENTS_KEY, null);
  const base = loaded && typeof loaded === 'object' ? loaded : defaultWorldEvents(tick);
  const next = pruneState(
    {
      lastEventTick: Number(base.lastEventTick) || 0,
      dieselMultiplier: Number(base.dieselMultiplier) || 1,
      dieselUntilTick: Number(base.dieselUntilTick) || 0,
      pathCostMultiplier: Number(base.pathCostMultiplier) || 1,
      pathCostUntilTick: Number(base.pathCostUntilTick) || 0,
      closures: Array.isArray(base.closures) ? base.closures : [],
    },
    tick,
  );
  publishLive(next);
  return next;
}

export function saveWorldEvents(state: WorldEventState): void {
  publishLive(state);
  saveJson(WORLD_EVENTS_KEY, state);
}

function labelsMatch(a: string, b: string): boolean {
  const na = a.toLowerCase();
  const nb = b.toLowerCase();
  return na.includes(nb) || nb.includes(na);
}

export function orderBlockedByClosure(
  order: { origin: string; destination: string },
  tick: number,
  closures: LineClosure[] = liveClosures,
): LineClosure | null {
  for (const row of closures) {
    if (row.untilTick <= tick) continue;
    const same =
      (labelsMatch(order.origin, row.origin) && labelsMatch(order.destination, row.destination)) ||
      (labelsMatch(order.origin, row.destination) && labelsMatch(order.destination, row.origin));
    if (same) return row;
  }
  return null;
}

export function closureBlockMessage(closure: LineClosure, tick: number): string {
  const hours = Math.max(1, closure.untilTick - tick);
  return `Streckensperrung ${closure.origin}–${closure.destination} noch ${hours} Spielstunden. Umleitung +${formatEuro(closure.extraCost)} falls trotzdem gefahren wird.`;
}

export interface WorldEventTickInput {
  prevTick: number;
  nextTick: number;
  company: Company;
  drivers: Driver[];
  assignments: AssignmentWithDetails[];
  locos: Locomotive[];
}

export interface WorldEventTickResult {
  state: WorldEventState;
  company: Company;
  drivers: Driver[];
  assignments: AssignmentWithDetails[];
  extraPathCost: number;
  fired: boolean;
}

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function assignmentLoco(a: AssignmentWithDetails, locos: Locomotive[]): Locomotive | undefined {
  return a.locomotive ?? locos.find((l) => l.id === a.locomotive_id);
}

function addAssignmentDelay(a: AssignmentWithDetails, extra: number, locos: Locomotive[]): AssignmentWithDetails {
  const loco = assignmentLoco(a, locos);
  const xp = Math.max(0, Number(a.crew_xp) || 0);
  const rank = a.crew_rank === 2 || a.crew_rank === 3 ? a.crew_rank : 1;
  const add = composeTripDelay(extra, locoHasEtcs(loco), xp, rank);
  return { ...a, delay_ticks: (a.delay_ticks ?? 0) + add };
}

export function processWorldEventsTick(
  state: WorldEventState,
  input: WorldEventTickInput,
): WorldEventTickResult {
  const { prevTick, nextTick, company } = input;
  let next = pruneState(state, nextTick);
  let drivers = input.drivers;
  let assignments = input.assignments;
  let extraPathCost = 0;
  let fired = false;
  let nextCompany = company;

  if (!isNewGameDay(prevTick, nextTick)) {
    publishLive(next);
    return { state: next, company: nextCompany, drivers, assignments, extraPathCost, fired };
  }

  const daysSince = Math.floor((nextTick - (next.lastEventTick || 0)) / TICKS_PER_DAY);
  const chance = daysSince <= 1 ? 0.18 : daysSince <= 3 ? 0.36 : 0.52;
  if (Math.random() > chance) {
    publishLive(next);
    saveWorldEvents(next);
    return { state: next, company: nextCompany, drivers, assignments, extraPathCost, fired };
  }

  const roll = Math.random();
  next = { ...next, lastEventTick: nextTick };
  fired = true;

  if (roll < 0.28) {
    const pair = pick(CLOSURE_PAIRS);
    const hours = randInt(12, 36);
    const extraCost = randInt(900, 2_800);
    const closure: LineClosure = {
      id: newNotificationId(),
      origin: pair[0],
      destination: pair[1],
      untilTick: nextTick + hours,
      extraCost,
    };
    next = { ...next, closures: [...next.closures, closure] };
    assignments = assignments.map((a) => {
      if (a.status !== 'aktiv' && a.status !== 'geplant') return a;
      const order = a.order;
      if (!order) return a;
      if (!orderBlockedByClosure(order, nextTick, [closure])) return a;
      return addAssignmentDelay(a, randInt(3, 8), input.locos);
    });
    sendMessage(
      'Warnung',
      `Streckensperrung ${pair[0]}–${pair[1]}`,
      `Kurzfristige Netzstörung für ${hours} Spielstunden. Betroffene Aufträge sind gesperrt bzw. verspätet. Umleitung ca. ${formatEuro(extraCost)}.`,
      nextTick,
    );
  } else if (roll < 0.52) {
    const idle = drivers.filter((d) => d.status === 'verfuegbar');
    if (idle.length > 0) {
      const victim = pick(idle);
      drivers = drivers.map((d) =>
        d.id === victim.id
          ? { ...d, status: 'krank' as const, recovery_hours_left: defaultRecoveryHours('krank'), shift_start: null }
          : d,
      );
      sendMessage(
        'Warnung',
        `${victim.name} krankgemeldet`,
        `${victim.name} fällt kurzfristig aus (Krankmeldung, ca. 12 Spielstunden). Schichtplan prüfen — Ersatz-Tf disponieren.`,
        nextTick,
      );
    } else {
      fired = false;
      next = { ...next, lastEventTick: state.lastEventTick };
    }
  } else if (roll < 0.78) {
    const hours = randInt(36, 72);
    const multiplier = 1.35 + Math.random() * 0.4;
    next = {
      ...next,
      dieselMultiplier: Math.round(multiplier * 100) / 100,
      dieselUntilTick: nextTick + hours,
    };
    sendMessage(
      'Finanzen',
      'Dieselpreisspitze',
      `Kraftstoff +${Math.round((next.dieselMultiplier - 1) * 100)} % für ca. ${Math.round(hours / TICKS_PER_DAY)} Spieltage. Diesel-Trassen werden teurer (Trasse/Energie).`,
      nextTick,
    );
  } else {
    const hours = randInt(18, 48);
    const mult = 1.12 + Math.random() * 0.18;
    next = {
      ...next,
      pathCostMultiplier: Math.round(mult * 100) / 100,
      pathCostUntilTick: nextTick + hours,
    };
    const delay = randInt(2, 6);
    assignments = assignments.map((a) =>
      a.status === 'aktiv' || a.status === 'geplant' ? addAssignmentDelay(a, delay, input.locos) : a,
    );
    extraPathCost = randInt(400, 1_600);
    nextCompany = { ...nextCompany, balance: nextCompany.balance - extraPathCost };
    sendMessage(
      'Disposition',
      'Trassenstörung im Netz',
      `Zusätzliche Fahrzeit (+${delay} h) und Trassenaufschlag ${formatEuro(extraPathCost)}. Aufschlag ${Math.round((mult - 1) * 100)} % für ${hours} Spielstunden.`,
      nextTick,
    );
  }

  publishLive(next);
  saveWorldEvents(next);
  return { state: next, company: nextCompany, drivers, assignments, extraPathCost, fired };
}
