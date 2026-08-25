import type { Notification, Wagon, WagonStatus } from '@/lib/supabase';
import { newNotificationId } from '@/lib/gameTime';

export const WAGON_JOBS_KEY = 'evu-wagon-jobs';
export const WAGON_PATCHES_KEY = 'evu-wagon-patches';

export type WagonJobKind = 'extend_3m' | 'extend_6m' | 'rev';

export interface WagonJob {
  id: string;
  wagonId: string;
  kind: WagonJobKind;
  queuedAtTick: number;
  completeAtTick: number;
}

export interface WagonPatch {
  status: WagonStatus;
  frist_level: number;
  frist_date: string | null;
}

export const WAGON_JOB_RATES: Record<
  WagonJobKind,
  {
    cost: number;
    ticks: number;
    months: number;
    fristLevel: number;
    resetFrist: boolean;
    label: string;
    durationLabel: string;
  }
> = {
  extend_3m: {
    cost: 160,
    ticks: 0,
    months: 3,
    fristLevel: 1,
    resetFrist: false,
    label: 'Fristverlängerung +3 Monate',
    durationLabel: 'Sofort / 1 Takt',
  },
  extend_6m: {
    cost: 320,
    ticks: 1,
    months: 6,
    fristLevel: 2,
    resetFrist: false,
    label: 'Fristverlängerung +6 Monate',
    durationLabel: '1 Takt',
  },
  rev: {
    cost: 1280,
    ticks: 3,
    months: 6,
    fristLevel: 1,
    resetFrist: true,
    label: 'Voll-Revision (REV)',
    durationLabel: '3 Takte',
  },
};

export function loadWagonJobs(): WagonJob[] {
  try {
    const raw = localStorage.getItem(WAGON_JOBS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WagonJob[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveWagonJobs(jobs: WagonJob[]): void {
  localStorage.setItem(WAGON_JOBS_KEY, JSON.stringify(jobs));
}

export function loadWagonPatches(): Record<string, WagonPatch> {
  try {
    const raw = localStorage.getItem(WAGON_PATCHES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, WagonPatch>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveWagonPatches(patches: Record<string, WagonPatch>): void {
  localStorage.setItem(WAGON_PATCHES_KEY, JSON.stringify(patches));
}

export function mergeWagonPatches(wagons: Wagon[], patches: Record<string, WagonPatch>): Wagon[] {
  if (Object.keys(patches).length === 0) return wagons;
  return wagons.map((wagon) => {
    const patch = patches[wagon.id];
    return patch ? { ...wagon, ...patch } : wagon;
  });
}

export function wagonPatchFrom(wagon: Wagon): WagonPatch {
  return {
    status: wagon.status,
    frist_level: wagon.frist_level,
    frist_date: wagon.frist_date,
  };
}

export function addMonthsIso(base: Date, months: number): string {
  const next = new Date(base.getTime());
  next.setMonth(next.getMonth() + months);
  return next.toISOString().slice(0, 10);
}

export function extendFristDate(current: string | null, months: number, now: Date): string {
  const parsed = current ? new Date(current) : null;
  const base = parsed && !Number.isNaN(parsed.getTime()) && parsed.getTime() > now.getTime() ? parsed : now;
  return addMonthsIso(base, months);
}

/** 180-day window matches WagonParkView fristPercent (100%). */
export function fullRevisionDate(now: Date): string {
  const next = new Date(now.getTime());
  next.setDate(next.getDate() + 180);
  return next.toISOString().slice(0, 10);
}

export function applyCompletedJob(wagon: Wagon, kind: WagonJobKind, now: Date): Wagon {
  const rates = WAGON_JOB_RATES[kind];
  const frist_date = rates.resetFrist ? fullRevisionDate(now) : extendFristDate(wagon.frist_date, rates.months, now);
  return {
    ...wagon,
    status: 'verfuegbar',
    frist_level: rates.fristLevel,
    frist_date,
  };
}

export function jobCompletionNotification(wagon: Wagon, kind: WagonJobKind, createdAt: string): Omit<Notification, 'id'> {
  const rates = WAGON_JOB_RATES[kind];
  const fristLabel = wagon.frist_date
    ? new Intl.DateTimeFormat('de-DE').format(new Date(wagon.frist_date))
    : 'zurückgesetzt';
  return {
    type: 'success',
    title: `${rates.label} abgeschlossen`,
    message: `${wagon.type_code} (${wagon.count} Stk) ist wieder VERFÜGBAR · Frist ${fristLabel} · Stufe ${wagon.frist_level}.`,
    read: false,
    created_at: createdAt,
  };
}

export function jobQueuedNotification(wagon: Wagon, kind: WagonJobKind, createdAt: string): Omit<Notification, 'id'> {
  const rates = WAGON_JOB_RATES[kind];
  return {
    type: 'info',
    title: `${rates.label} beauftragt`,
    message:
      kind === 'rev'
        ? `${wagon.type_code} geht in die Werkstatt (${rates.durationLabel}). Kosten ${rates.cost.toLocaleString('de-DE')} €.`
        : `${wagon.type_code}: ${rates.label} läuft (${rates.durationLabel}). Kosten ${rates.cost.toLocaleString('de-DE')} €.`,
    read: false,
    created_at: createdAt,
  };
}

export function insufficientFundsNotification(kind: WagonJobKind, createdAt: string): Omit<Notification, 'id'> {
  const rates = WAGON_JOB_RATES[kind];
  return {
    type: 'warning',
    title: 'Zahlung abgelehnt',
    message: `Unzureichende Mittel für ${rates.label} (${rates.cost.toLocaleString('de-DE')} €).`,
    read: false,
    created_at: createdAt,
  };
}

export function newWagonJobId(): string {
  return newNotificationId();
}

export function ticksRemaining(job: WagonJob, tick: number): number {
  return Math.max(0, job.completeAtTick - tick);
}
