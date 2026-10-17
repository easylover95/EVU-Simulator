import type { ShiftKind } from '@/vectra/types';

export const SHIFT_WINDOWS: Record<
  ShiftKind,
  { label: string; short: string; startHour: number; endHour: number }
> = {
  frueh: { label: 'Frühschicht', short: 'Früh', startHour: 6, endHour: 15 },
  spaet: { label: 'Spätschicht', short: 'Spät', startHour: 14, endHour: 23 },
  nacht: { label: 'Nachtschicht', short: 'Nacht', startHour: 22, endHour: 7 },
};

export const SHIFT_ORDER: ShiftKind[] = ['frueh', 'spaet', 'nacht'];

export function nextShift(kind: ShiftKind): ShiftKind {
  const i = SHIFT_ORDER.indexOf(kind);
  return SHIFT_ORDER[(i + 1) % 3]!;
}

export function formatClock(totalMin: number): string {
  const dayMin = ((Math.floor(totalMin) % 1440) + 1440) % 1440;
  const h = Math.floor(dayMin / 60);
  const m = dayMin % 60;
  const s = Math.floor((totalMin % 1) * 60);
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function formatHm(totalMin: number): string {
  const dayMin = ((Math.floor(totalMin) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(dayMin / 60))}:${pad(dayMin % 60)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function hourOf(totalMin: number): number {
  return Math.floor((((Math.floor(totalMin) % 1440) + 1440) % 1440) / 60);
}

/** Primary shift for wall clock (prefer later window in overlaps). */
export function scheduledShiftAt(totalMin: number): ShiftKind {
  const h = hourOf(totalMin);
  if (h >= 6 && h < 14) return 'frueh';
  if (h >= 14 && h < 22) return 'spaet';
  return 'nacht';
}

/** 06–07, 14–15, 22–23 */
export function isHandoverWindow(totalMin: number): boolean {
  const h = hourOf(totalMin);
  return h === 6 || h === 14 || h === 22;
}

export function shiftHoursLabel(kind: ShiftKind): string {
  const w = SHIFT_WINDOWS[kind];
  return `${pad(w.startHour)}:00–${pad(w.endHour)}:00`;
}

/** Absolute end minute (can exceed day). */
export function computeShiftEndMin(startMin: number, kind: ShiftKind): number {
  const startHour = hourOf(startMin);
  const dayBase = Math.floor(startMin / 1440) * 1440;
  const w = SHIFT_WINDOWS[kind];
  if (kind === 'nacht') {
    if (startHour >= 22) return dayBase + 1440 + 7 * 60;
    return dayBase + 7 * 60;
  }
  let end = dayBase + w.endHour * 60;
  if (end <= startMin) end += 1440;
  return end;
}

export function startMinuteForShift(kind: ShiftKind, nowMin: number): number {
  const dayBase = Math.floor(nowMin / 1440) * 1440;
  const w = SHIFT_WINDOWS[kind];
  if (kind === 'nacht') {
    const h = hourOf(nowMin);
    if (h >= 22 || h < 7) return nowMin;
    return dayBase + 22 * 60;
  }
  return dayBase + w.startHour * 60;
}
