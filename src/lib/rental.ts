import type { Company, Driver, Notification, Wagon, WagonCategory } from '@/lib/supabase';
import { isNewGameDay, loadJson, saveJson, TICKS_PER_DAY } from '@/lib/storage';
import { newNotificationId } from '@/lib/gameTime';
import { formatEuro } from '@/lib/status';

export const RENTAL_STATE_KEY = 'evu-rental-state';

export const RENTAL_TERMS = [1, 3, 6, 12, 18] as const;
export type RentalTermMonths = (typeof RENTAL_TERMS)[number];

/** Extra yield vs 1-month base rent. */
export const RENTAL_TERM_BONUS: Record<RentalTermMonths, number> = {
  1: 0,
  3: 0.1,
  6: 0.2,
  12: 0.35,
  18: 0.5,
};

const DURATION_FACTOR: Record<RentalTermMonths, number> = {
  1: 1 + RENTAL_TERM_BONUS[1],
  3: 1 + RENTAL_TERM_BONUS[3],
  6: 1 + RENTAL_TERM_BONUS[6],
  12: 1 + RENTAL_TERM_BONUS[12],
  18: 1 + RENTAL_TERM_BONUS[18],
};

export function rentalTermLabel(months: RentalTermMonths): string {
  switch (months) {
    case 1:
      return '1 Monat (Grundmiete)';
    case 3:
      return '3 Monate (+10% Einnahmen)';
    case 6:
      return '6 Monate (+20%)';
    case 12:
      return '12 Monate (+35%)';
    case 18:
      return '18 Monate (+50% max. Langzeitrendite)';
  }
}

const CATEGORY_DAILY: Record<WagonCategory, number> = {
  schotter: 38,
  flach: 34,
  container: 52,
  kessel: 58,
  offen: 36,
  schiebewand: 40,
  gedeckt: 41,
};

const PARTNER_EVUS = [
  'Rhein-Ruhr Cargo GmbH',
  'Nordgleis Logistik AG',
  'AlpenTransit GmbH',
  'Westkorridor Rail',
  'Elbe-Weser Freight',
  'Korridor Express GmbH',
  'Hafenbahn Nord',
  'EifelRail Cargo',
  'MainLinie Logistik',
  'ScheldeRail GmbH',
];

export interface WagonRental {
  id: string;
  wagonId: string;
  label: string;
  count: number;
  termMonths: RentalTermMonths;
  dailyIncome: number;
  vollkasko: true;
  partnerName: string;
  startedTick: number;
  endsTick: number;
}

export interface TfHireRequest {
  id: string;
  partnerName: string;
  hourlyRate: number;
  hours: number;
  createdTick: number;
  expiresTick: number;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  driverId?: string;
  driverName?: string;
}

export interface PersonnelHire {
  id: string;
  driverId: string;
  driverName: string;
  partnerName: string;
  hourlyRate: number;
  hours: number;
  startedTick: number;
  endsTick: number;
  totalPay: number;
}

export interface RentalState {
  wagonRentals: WagonRental[];
  hireRequests: TfHireRequest[];
  activeHires: PersonnelHire[];
  lastProcessedTick: number;
}

function emptyState(tick: number): RentalState {
  return {
    wagonRentals: [],
    hireRequests: [],
    activeHires: [],
    lastProcessedTick: tick,
  };
}

export function loadRentalState(tick: number): RentalState {
  const loaded = loadJson<RentalState | null>(RENTAL_STATE_KEY, null);
  if (!loaded) {
    const fresh = emptyState(tick);
    const seeded = { ...fresh, hireRequests: [spawnHireRequest(fresh, tick)] };
    saveRentalState(seeded);
    return seeded;
  }
  return {
    wagonRentals: Array.isArray(loaded.wagonRentals) ? loaded.wagonRentals : [],
    hireRequests: Array.isArray(loaded.hireRequests) ? loaded.hireRequests : [],
    activeHires: Array.isArray(loaded.activeHires) ? loaded.activeHires : [],
    lastProcessedTick: Number.isFinite(loaded.lastProcessedTick) ? loaded.lastProcessedTick : tick,
  };
}

export function saveRentalState(state: RentalState): void {
  saveJson(RENTAL_STATE_KEY, state);
}

export function rentalDailyIncome(category: WagonCategory, count: number, months: RentalTermMonths): number {
  const factor = DURATION_FACTOR[months] ?? 1;
  const per = CATEGORY_DAILY[category] ?? 36;
  return Math.max(20, Math.round(per * Math.max(1, count) * factor));
}

export function rentalMonthlyIncome(daily: number): number {
  return daily * 30;
}

export function pickPartnerName(used: string[] = []): string {
  const free = PARTNER_EVUS.filter((n) => !used.includes(n));
  const pool = free.length > 0 ? free : PARTNER_EVUS;
  return pool[Math.floor(Math.random() * pool.length)] ?? PARTNER_EVUS[0];
}

export function activeWagonRental(state: RentalState, wagonId: string): WagonRental | undefined {
  return state.wagonRentals.find((r) => r.wagonId === wagonId);
}

export function isWagonRented(state: RentalState, wagonId: string): boolean {
  return Boolean(activeWagonRental(state, wagonId));
}

export function rentedWagonIds(state?: RentalState): Set<string> {
  const current = state ?? loadRentalState(0);
  return new Set(current.wagonRentals.map((r) => r.wagonId));
}

export function isDriverHiredOut(state: RentalState, driverId: string): boolean {
  return state.activeHires.some((h) => h.driverId === driverId);
}

export function availableTfDrivers(drivers: Driver[], state: RentalState): Driver[] {
  return drivers.filter(
    (d) =>
      d.status === 'verfuegbar' &&
      !isDriverHiredOut(state, d.id) &&
      d.qualifications.some((q) => q.toLowerCase().includes('tf')),
  );
}

export function startWagonRental(
  state: RentalState,
  wagon: Wagon,
  months: RentalTermMonths,
  tick: number,
): { state: RentalState; rental: WagonRental } {
  const partnerName = pickPartnerName(state.wagonRentals.map((r) => r.partnerName));
  const dailyIncome = rentalDailyIncome(wagon.category, wagon.count, months);
  const rental: WagonRental = {
    id: newNotificationId(),
    wagonId: wagon.id,
    label: `${wagon.count}× ${wagon.type_code} ${wagon.type_name}`,
    count: wagon.count,
    termMonths: months,
    dailyIncome,
    vollkasko: true,
    partnerName,
    startedTick: tick,
    endsTick: tick + months * 30 * TICKS_PER_DAY,
  };
  return {
    state: { ...state, wagonRentals: [...state.wagonRentals, rental] },
    rental,
  };
}

export function acceptHireRequest(
  state: RentalState,
  requestId: string,
  driver: Driver,
  tick: number,
): { state: RentalState; hire: PersonnelHire } | null {
  const request = state.hireRequests.find((r) => r.id === requestId && r.status === 'pending');
  if (!request) return null;
  const hire: PersonnelHire = {
    id: request.id,
    driverId: driver.id,
    driverName: driver.name,
    partnerName: request.partnerName,
    hourlyRate: request.hourlyRate,
    hours: request.hours,
    startedTick: tick,
    endsTick: tick + request.hours,
    totalPay: request.hourlyRate * request.hours,
  };
  return {
    state: {
      ...state,
      hireRequests: state.hireRequests.map((r) =>
        r.id === requestId
          ? { ...r, status: 'accepted' as const, driverId: driver.id, driverName: driver.name }
          : r,
      ),
      activeHires: [...state.activeHires, hire],
    },
    hire,
  };
}

export function declineHireRequest(state: RentalState, requestId: string): RentalState {
  return {
    ...state,
    hireRequests: state.hireRequests.map((r) =>
      r.id === requestId && r.status === 'pending' ? { ...r, status: 'declined' as const } : r,
    ),
  };
}

function spawnHireRequest(state: RentalState, tick: number): TfHireRequest {
  const hours = [8, 10, 12, 16][Math.floor(Math.random() * 4)] ?? 8;
  const hourlyRate = 92 + Math.floor(Math.random() * 78);
  return {
    id: newNotificationId(),
    partnerName: pickPartnerName(state.hireRequests.map((r) => r.partnerName)),
    hourlyRate,
    hours,
    createdTick: tick,
    expiresTick: tick + 36,
    status: 'pending',
  };
}

export interface RentalTickResult {
  state: RentalState;
  company: Company;
  freedWagonIds: string[];
  freedDriverIds: string[];
  notifications: Omit<Notification, 'id'>[];
}

export function processRentalTick(
  state: RentalState,
  company: Company,
  drivers: Driver[],
  prevTick: number,
  nextTick: number,
): RentalTickResult {
  let next = { ...state, lastProcessedTick: nextTick };
  let balance = company.balance;
  const notifications: Omit<Notification, 'id'>[] = [];
  const freedWagonIds: string[] = [];
  const freedDriverIds: string[] = [];
  const payday = isNewGameDay(prevTick, nextTick);
  const createdAt = company.updated_at;

  if (payday) {
    const wagonPay = next.wagonRentals.reduce((s, r) => s + r.dailyIncome, 0);
    if (wagonPay > 0) {
      balance += wagonPay;
      notifications.push({
        type: 'success',
        title: 'Wagenmiete eingegangen',
        message: `${formatEuro(wagonPay)} von Partner-EVUs (Vollkasko, keine Werkstattkosten).`,
        read: false,
        created_at: createdAt,
      });
    }
  }

  const stillRentals: WagonRental[] = [];
  for (const rental of next.wagonRentals) {
    if (rental.endsTick <= nextTick) {
      freedWagonIds.push(rental.wagonId);
      notifications.push({
        type: 'info',
        title: 'Vermietung beendet',
        message: `${rental.label} ist von ${rental.partnerName} zurück. Vollkasko endet.`,
        read: false,
        created_at: createdAt,
      });
    } else {
      stillRentals.push(rental);
    }
  }
  next = { ...next, wagonRentals: stillRentals };

  const stillHires: PersonnelHire[] = [];
  for (const hire of next.activeHires) {
    if (hire.endsTick <= nextTick) {
      balance += hire.totalPay;
      freedDriverIds.push(hire.driverId);
      notifications.push({
        type: 'success',
        title: 'Tf-Gestellung abgeschlossen',
        message: `${hire.driverName} zurück von ${hire.partnerName} · ${formatEuro(hire.totalPay)} (${hire.hourlyRate} €/h × ${hire.hours} h).`,
        read: false,
        created_at: createdAt,
      });
    } else {
      stillHires.push(hire);
    }
  }
  next = { ...next, activeHires: stillHires };

  next = {
    ...next,
    hireRequests: next.hireRequests.map((r) =>
      r.status === 'pending' && r.expiresTick <= nextTick ? { ...r, status: 'expired' as const } : r,
    ),
  };

  if (payday) {
    const pending = next.hireRequests.filter((r) => r.status === 'pending').length;
    const freeTf = availableTfDrivers(drivers, next).length;
    if (pending < 2 && freeTf > 0 && Math.random() < 0.45) {
      const request = spawnHireRequest(next, nextTick);
      next = { ...next, hireRequests: [request, ...next.hireRequests].slice(0, 20) };
      notifications.push({
        type: 'info',
        title: `Anfrage ${request.partnerName}`,
        message: `Tf-Gestellung ${request.hours} h zu ${request.hourlyRate} €/h. Antwort im Posteingang.`,
        read: false,
        created_at: createdAt,
      });
    }
  }

  return {
    state: next,
    company: { ...company, balance },
    freedWagonIds,
    freedDriverIds,
    notifications,
  };
}

export function pendingHireRequests(state: RentalState): TfHireRequest[] {
  return state.hireRequests.filter((r) => r.status === 'pending');
}
