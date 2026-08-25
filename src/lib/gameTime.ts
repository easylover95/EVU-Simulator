import type { AssignmentWithDetails, Driver, DriverStatus, Notification } from '@/lib/supabase';

const GAME_EPOCH_KEY = 'evu-game-epoch-ms';
const GAME_MINUTE_KEY = 'evu-game-minute';

/**
 * Clock formula:
 * - Calendar origin = current system Date.now() on first launch (persisted).
 * - Display time = epoch + (hour-tick × 1h) + leftover game minutes.
 * - Each real second adds `speed` game minutes (1× / 2× / 5×).
 * - Simulation tick stays 1 in-game hour (economy, recovery, tracking, workshop days).
 * - 1 game day at 1× = 24 × 60s = 24 real minutes (2× = 12 min, 5× = 4.8 min).
 * - UI shows weekday + date + time, never a tick counter.
 */
export const MS_PER_TICK = 60 * 60 * 1000;
export const MS_PER_GAME_MINUTE = 60 * 1000;
export const MINUTES_PER_HOUR = 60;
/** Real-time pulse: one interval adds `speed` game minutes. */
export const BASE_TICK_INTERVAL_MS = 1000;
/** Real ms for one 24h game day: 1× 24 min, 2× 12 min, 5× 4.8 min. */
export const MS_PER_GAME_DAY_AT_1X = 24 * MINUTES_PER_HOUR * BASE_TICK_INTERVAL_MS;

function readOrCreateEpochMs(): number {
  const fallback = Date.now();
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(GAME_EPOCH_KEY);
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    localStorage.setItem(GAME_EPOCH_KEY, String(fallback));
    return fallback;
  } catch {
    return fallback;
  }
}

export const GAME_EPOCH = new Date(readOrCreateEpochMs());
export const GAME_EPOCH_ISO = GAME_EPOCH.toISOString();

export function loadGameMinute(): number {
  if (typeof localStorage === 'undefined') return 0;
  try {
    const parsed = Number(localStorage.getItem(GAME_MINUTE_KEY));
    if (!Number.isFinite(parsed)) return 0;
    return ((Math.floor(parsed) % MINUTES_PER_HOUR) + MINUTES_PER_HOUR) % MINUTES_PER_HOUR;
  } catch {
    return 0;
  }
}

export function saveGameMinute(minute: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const normalized = ((Math.floor(minute) % MINUTES_PER_HOUR) + MINUTES_PER_HOUR) % MINUTES_PER_HOUR;
    localStorage.setItem(GAME_MINUTE_KEY, String(normalized));
  } catch {
    /* quota / private mode */
  }
}

export type ClockSpeed = 1 | 2 | 5;

export const CLOCK_SPEEDS: ClockSpeed[] = [1, 2, 5];

const WEEKDAYS_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'] as const;

export const RECOVERY_STATUSES: readonly DriverStatus[] = ['krank', 'pause', 'urlaub'];

export function isRecoveryStatus(status: string): status is DriverStatus {
  return (RECOVERY_STATUSES as readonly string[]).includes(status);
}

export function defaultRecoveryHours(status: string): number {
  switch (status) {
    case 'krank':
      return 12;
    case 'pause':
      return 3;
    case 'urlaub':
      return 24;
    default:
      return 0;
  }
}

export function tickToDate(tick: number, extraMinutes = 0): Date {
  return new Date(
    GAME_EPOCH.getTime() + Math.max(0, tick) * MS_PER_TICK + Math.max(0, extraMinutes) * MS_PER_GAME_MINUTE,
  );
}

export function tickToIso(tick: number): string {
  return tickToDate(tick).toISOString();
}

export function formatGameClock(date: Date): string {
  return formatGameDateTime(date);
}

/** e.g. "Di, 23.08.2026 21:45" */
export function formatGameDateTime(date: Date): string {
  const weekday = WEEKDAYS_DE[date.getDay()];
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${weekday}, ${dd}.${mm}.${yyyy} ${hours}:${minutes}`;
}

/** Calendar label for a simulation tick (no tick number). */
export function formatTickLabel(tick: number): string {
  return formatGameDateTime(tickToDate(tick));
}

export function hoursBetween(fromIso: string, now: Date): number {
  const from = new Date(fromIso).getTime();
  if (!Number.isFinite(from)) return 0;
  return Math.max(0, Math.floor((now.getTime() - from) / MS_PER_TICK));
}

export function normalizeDriver(driver: Driver): Driver {
  if (isRecoveryStatus(driver.status) && driver.recovery_hours_left == null) {
    return { ...driver, recovery_hours_left: defaultRecoveryHours(driver.status) };
  }
  return {
    ...driver,
    recovery_hours_left: driver.recovery_hours_left ?? null,
  };
}

export type RecoveredDriver = { driver: Driver; previousStatus: string };

export function applyTickToDrivers(
  drivers: Driver[],
  gameNowIso: string,
): { drivers: Driver[]; recovered: RecoveredDriver[] } {
  const recovered: RecoveredDriver[] = [];
  const next = drivers.map((driver) => {
    if (driver.status === 'im_einsatz') {
      return { ...driver, hours_worked: Number(driver.hours_worked) + 1 };
    }
    if (driver.status === 'verfuegbar' && Number(driver.hours_worked) > 0) {
      const rest = hoursBetween(driver.last_rest_end, new Date(gameNowIso));
      if (rest >= 8) {
        return { ...driver, hours_worked: 0 };
      }
    }
    if (!isRecoveryStatus(driver.status)) return driver;
    const remaining = (driver.recovery_hours_left ?? defaultRecoveryHours(driver.status)) - 1;
    if (remaining <= 0) {
      const updated: Driver = {
        ...driver,
        status: 'verfuegbar',
        recovery_hours_left: 0,
        last_rest_end: gameNowIso,
        shift_start: null,
      };
      recovered.push({ driver: updated, previousStatus: driver.status });
      return updated;
    }
    return { ...driver, recovery_hours_left: remaining };
  });
  return { drivers: next, recovered };
}

export function applyTickToAssignments(assignments: AssignmentWithDetails[]): {
  assignments: AssignmentWithDetails[];
  activatedIds: string[];
} {
  const activatedIds: string[] = [];
  const next = assignments.map((assignment) => {
    if (assignment.status !== 'geplant') return assignment;
    activatedIds.push(assignment.id);
    return { ...assignment, status: 'aktiv' as const };
  });
  return { assignments: next, activatedIds };
}

export function recoveryNotification(
  driver: Driver,
  previousStatus: string,
): Omit<Notification, 'id'> {
  const reason =
    previousStatus === 'krank' ? 'Krankheit' : previousStatus === 'pause' ? 'Pause' : 'Abwesenheit';
  return {
    type: 'success',
    title: `${driver.name} wieder verfügbar`,
    message: `${driver.name} ist nach ${reason} wieder dienstbereit.`,
    read: false,
    created_at: driver.last_rest_end,
  };
}

export function ersatzattestNotification(driver: Driver, createdAt: string): Omit<Notification, 'id'> {
  return {
    type: 'success',
    title: 'Ersatzattest eingegangen',
    message: `${driver.name} wurde kurzfristig gesundgemeldet und ist wieder verfügbar.`,
    read: false,
    created_at: createdAt,
  };
}

export function newNotificationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `notif-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function mergeDriverAfterFetch(remote: Driver, local?: Driver): Driver {
  const normalized = normalizeDriver(remote);
  if (!local) return normalized;

  if (
    local.status === 'verfuegbar' &&
    isRecoveryStatus(normalized.status)
  ) {
    return {
      ...normalized,
      status: 'verfuegbar',
      recovery_hours_left: 0,
      last_rest_end: local.last_rest_end,
    };
  }

  if (isRecoveryStatus(local.status) && isRecoveryStatus(normalized.status)) {
    const localLeft = local.recovery_hours_left;
    const remoteLeft = normalized.recovery_hours_left;
    if (localLeft != null && remoteLeft != null) {
      return { ...normalized, recovery_hours_left: Math.min(localLeft, remoteLeft) };
    }
    if (localLeft != null) return { ...normalized, recovery_hours_left: localLeft };
  }

  return normalized;
}
