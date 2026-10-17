/**
 * EVU Leitstelle — 3-Schicht-Modell mit Übergabe-Puffer und Abschlussbericht.
 * Früh 06–15 · Spät 14–23 · Nacht 22–07 (je 1h Überlappung).
 */
import type { ShiftPayroll } from '@/lib/dispatcherCareer';
import { newNotificationId } from '@/lib/gameTime';
import { loadJson, saveJson } from '@/lib/storage';

export const SHIFT_STATE_KEY = 'evu-leitstelle-shift';

export type ShiftKind = 'frueh' | 'spaet' | 'nacht';
export type DispatcherGrade = 'S' | 'A' | 'B' | 'C';

export interface ShiftWindow {
  kind: ShiftKind;
  label: string;
  short: string;
  startHour: number;
  endHour: number;
}

export const SHIFT_WINDOWS: Record<ShiftKind, ShiftWindow> = {
  frueh: { kind: 'frueh', label: 'Frühschicht', short: 'Früh', startHour: 6, endHour: 15 },
  spaet: { kind: 'spaet', label: 'Spätschicht', short: 'Spät', startHour: 14, endHour: 23 },
  nacht: { kind: 'nacht', label: 'Nachtschicht', short: 'Nacht', startHour: 22, endHour: 7 },
};

export const SHIFT_ORDER: ShiftKind[] = ['frueh', 'spaet', 'nacht'];

export interface ShiftTrainLog {
  assignmentId: string;
  label: string;
  locoName: string;
  origin: string;
  dest: string;
  late: boolean;
  completed: boolean;
  cancelled: boolean;
  delayMinutes: number;
}

export interface ShiftIncidentLog {
  incidentId: string;
  title: string;
  optionId: string | null;
  optionLabel: string;
  costEuro: number;
  resolved: boolean;
  atTick: number;
}

export interface ShiftStats {
  revenueEuro: number;
  incidentCostEuro: number;
  penaltyEuro: number;
  trains: Record<string, ShiftTrainLog>;
  incidents: ShiftIncidentLog[];
  onTimeCompletions: number;
  lateCompletions: number;
  cancelledCount: number;
}

export interface ActiveShift {
  id: string;
  kind: ShiftKind;
  startedAtTick: number;
  /** Absolute game ms (epoch-based) when shift started — for end comparison. */
  startedAtGameMs: number;
  /** Absolute game ms when this shift is scheduled to end. */
  endsAtGameMs: number;
  active: boolean;
  stats: ShiftStats;
}

export interface OpenHandoverItem {
  assignmentId: string;
  label: string;
  locoName: string;
  origin: string;
  dest: string;
  delayMinutes: number;
  status: string;
  note: string;
}

export interface ShiftReport {
  shiftId: string;
  kind: ShiftKind;
  label: string;
  startedLabel: string;
  endedLabel: string;
  balanceEuro: number;
  revenueEuro: number;
  incidentCostEuro: number;
  penaltyEuro: number;
  punctualityPct: number;
  grade: DispatcherGrade;
  gradeReason: string;
  trains: ShiftTrainLog[];
  resolvedIncidents: ShiftIncidentLog[];
  openHandover: OpenHandoverItem[];
  nextKind: ShiftKind;
  nextLabel: string;
  /** Persönlicher Lohnstreifen (nach Karriere-Auswertung). */
  payroll?: ShiftPayroll | null;
  careerTitle?: string | null;
}

export interface ShiftState {
  current: ActiveShift | null;
  lastReport: ShiftReport | null;
  /** Pending report waiting for player acknowledgement. */
  pendingReport: ShiftReport | null;
  /** Übergabebuch für das Briefing der Folgeschicht. */
  handoverBook: OpenHandoverItem[];
}

function emptyStats(): ShiftStats {
  return {
    revenueEuro: 0,
    incidentCostEuro: 0,
    penaltyEuro: 0,
    trains: {},
    incidents: [],
    onTimeCompletions: 0,
    lateCompletions: 0,
    cancelledCount: 0,
  };
}

export function defaultShiftState(): ShiftState {
  return { current: null, lastReport: null, pendingReport: null, handoverBook: [] };
}

export function loadShiftState(): ShiftState {
  const loaded = loadJson<ShiftState | null>(SHIFT_STATE_KEY, null);
  if (!loaded || typeof loaded !== 'object') return defaultShiftState();
  return {
    current: loaded.current ?? null,
    lastReport: loaded.lastReport ?? null,
    pendingReport: loaded.pendingReport ?? null,
    handoverBook: Array.isArray(loaded.handoverBook) ? loaded.handoverBook : [],
  };
}

export function saveShiftState(state: ShiftState): void {
  saveJson(SHIFT_STATE_KEY, state);
}

export function nextShiftKind(kind: ShiftKind): ShiftKind {
  const idx = SHIFT_ORDER.indexOf(kind);
  return SHIFT_ORDER[(idx + 1) % SHIFT_ORDER.length]!;
}

/** Primary scheduled shift at wall-clock game time (outside overlap preference). */
export function scheduledShiftAt(date: Date): ShiftKind {
  const h = date.getHours();
  if (h >= 6 && h < 14) return 'frueh';
  if (h >= 14 && h < 22) return 'spaet';
  return 'nacht';
}

/**
 * 1h handover buffers: 06–07, 14–15, 22–23.
 * During these windows the relieving dispatcher is considered on duty.
 */
export function isHandoverWindow(date: Date): boolean {
  const h = date.getHours();
  return h === 6 || h === 14 || h === 22;
}

export function handoverIncomingKind(date: Date): ShiftKind | null {
  const h = date.getHours();
  if (h === 6) return 'frueh';
  if (h === 14) return 'spaet';
  if (h === 22) return 'nacht';
  return null;
}

export function handoverOutgoingKind(date: Date): ShiftKind | null {
  const h = date.getHours();
  if (h === 6) return 'nacht';
  if (h === 14) return 'frueh';
  if (h === 22) return 'spaet';
  return null;
}

export function computeShiftEndMs(start: Date, kind: ShiftKind): number {
  const end = new Date(start.getTime());
  const win = SHIFT_WINDOWS[kind];
  if (kind === 'nacht') {
    if (start.getHours() >= 22) {
      end.setDate(end.getDate() + 1);
      end.setHours(7, 0, 0, 0);
    } else {
      end.setHours(7, 0, 0, 0);
      if (end.getTime() <= start.getTime()) {
        end.setDate(end.getDate() + 1);
      }
    }
  } else {
    end.setHours(win.endHour, 0, 0, 0);
    if (end.getTime() <= start.getTime()) {
      end.setDate(end.getDate() + 1);
    }
  }
  return end.getTime();
}

export function startShift(
  state: ShiftState,
  kind: ShiftKind,
  tick: number,
  gameNow: Date,
): ShiftState {
  if (state.current?.active) return state;
  const shift: ActiveShift = {
    id: newNotificationId(),
    kind,
    startedAtTick: tick,
    startedAtGameMs: gameNow.getTime(),
    endsAtGameMs: computeShiftEndMs(gameNow, kind),
    active: true,
    stats: emptyStats(),
  };
  return { ...state, current: shift, pendingReport: null };
}

export function noteShiftTrain(
  state: ShiftState,
  entry: Omit<ShiftTrainLog, 'completed' | 'cancelled' | 'late'> & {
    completed?: boolean;
    cancelled?: boolean;
    late?: boolean;
  },
): ShiftState {
  const cur = state.current;
  if (!cur?.active) return state;
  const prev = cur.stats.trains[entry.assignmentId];
  const nextEntry: ShiftTrainLog = {
    assignmentId: entry.assignmentId,
    label: entry.label,
    locoName: entry.locoName,
    origin: entry.origin,
    dest: entry.dest,
    delayMinutes: entry.delayMinutes,
    late: entry.late ?? prev?.late ?? false,
    completed: entry.completed ?? prev?.completed ?? false,
    cancelled: entry.cancelled ?? prev?.cancelled ?? false,
  };
  return {
    ...state,
    current: {
      ...cur,
      stats: {
        ...cur.stats,
        trains: { ...cur.stats.trains, [entry.assignmentId]: nextEntry },
      },
    },
  };
}

export function noteShiftSettlement(
  state: ShiftState,
  input: {
    assignmentId: string;
    label: string;
    locoName: string;
    origin: string;
    dest: string;
    revenueEuro: number;
    penaltyEuro: number;
    late: boolean;
    delayMinutes: number;
  },
): ShiftState {
  let next = noteShiftTrain(state, {
    assignmentId: input.assignmentId,
    label: input.label,
    locoName: input.locoName,
    origin: input.origin,
    dest: input.dest,
    delayMinutes: input.delayMinutes,
    late: input.late,
    completed: true,
    cancelled: false,
  });
  const cur = next.current;
  if (!cur?.active) return next;
  const stats = { ...cur.stats };
  stats.revenueEuro += Math.max(0, input.revenueEuro);
  stats.penaltyEuro += Math.max(0, input.penaltyEuro);
  if (input.late) stats.lateCompletions += 1;
  else stats.onTimeCompletions += 1;
  return { ...next, current: { ...cur, stats } };
}

export function noteShiftIncidentResolved(
  state: ShiftState,
  input: {
    incidentId: string;
    title: string;
    optionId: string;
    optionLabel: string;
    costEuro: number;
    atTick: number;
  },
): ShiftState {
  const cur = state.current;
  if (!cur?.active) return state;
  const without = cur.stats.incidents.filter((i) => i.incidentId !== input.incidentId);
  const log: ShiftIncidentLog = {
    incidentId: input.incidentId,
    title: input.title,
    optionId: input.optionId,
    optionLabel: input.optionLabel,
    costEuro: input.costEuro,
    resolved: true,
    atTick: input.atTick,
  };
  return {
    ...state,
    current: {
      ...cur,
      stats: {
        ...cur.stats,
        incidents: [...without, log],
        incidentCostEuro: cur.stats.incidentCostEuro + Math.max(0, input.costEuro),
      },
    },
  };
}

export function noteShiftCancel(
  state: ShiftState,
  input: {
    assignmentId: string;
    label: string;
    locoName: string;
    origin: string;
    dest: string;
    delayMinutes: number;
  },
): ShiftState {
  let next = noteShiftTrain(state, {
    ...input,
    late: input.delayMinutes > 0,
    completed: false,
    cancelled: true,
  });
  const cur = next.current;
  if (!cur?.active) return next;
  return {
    ...next,
    current: {
      ...cur,
      stats: { ...cur.stats, cancelledCount: cur.stats.cancelledCount + 1 },
    },
  };
}

function punctualityPct(stats: ShiftStats): number {
  const total = stats.onTimeCompletions + stats.lateCompletions;
  if (total <= 0) return 100;
  return Math.round((stats.onTimeCompletions / total) * 100);
}

export function computeDispatcherGrade(stats: ShiftStats, openCritical: number): {
  grade: DispatcherGrade;
  reason: string;
} {
  const balance = stats.revenueEuro - stats.incidentCostEuro - stats.penaltyEuro;
  const punct = punctualityPct(stats);
  const resolved = stats.incidents.filter((i) => i.resolved).length;
  const cancels = stats.cancelledCount;

  if (balance >= 0 && punct >= 90 && cancels === 0 && openCritical === 0) {
    return { grade: 'S', reason: 'Stabile Bilanz, hohe Pünktlichkeit, saubere Übergabe' };
  }
  if (balance >= -2_000 && punct >= 75 && cancels <= 1) {
    return { grade: 'A', reason: 'Solide Disposition mit geringen Abweichungen' };
  }
  if (punct >= 50 || resolved > 0) {
    return { grade: 'B', reason: 'Betrieb gehalten, aber Luft nach oben' };
  }
  return { grade: 'C', reason: 'Hohe Verspätung oder ungelöste Störungen' };
}

export function buildShiftReport(
  shift: ActiveShift,
  endedAt: Date,
  openHandover: OpenHandoverItem[],
  formatStarted: string,
  formatEnded: string,
): ShiftReport {
  const stats = shift.stats;
  const balanceEuro = stats.revenueEuro - stats.incidentCostEuro - stats.penaltyEuro;
  const punct = punctualityPct(stats);
  const openCritical = openHandover.filter((o) => o.delayMinutes >= 60 || o.status === 'gestoert').length;
  const { grade, reason } = computeDispatcherGrade(stats, openCritical);
  const next = nextShiftKind(shift.kind);
  return {
    shiftId: shift.id,
    kind: shift.kind,
    label: SHIFT_WINDOWS[shift.kind].label,
    startedLabel: formatStarted,
    endedLabel: formatEnded,
    balanceEuro,
    revenueEuro: stats.revenueEuro,
    incidentCostEuro: stats.incidentCostEuro,
    penaltyEuro: stats.penaltyEuro,
    punctualityPct: punct,
    grade,
    gradeReason: reason,
    trains: Object.values(stats.trains).sort((a, b) => a.label.localeCompare(b.label, 'de')),
    resolvedIncidents: stats.incidents.filter((i) => i.resolved),
    openHandover,
    nextKind: next,
    nextLabel: SHIFT_WINDOWS[next].label,
  };
}

export function endShift(
  state: ShiftState,
  endedAt: Date,
  openHandover: OpenHandoverItem[],
  formatStarted: string,
  formatEnded: string,
): ShiftState {
  const cur = state.current;
  if (!cur?.active) return state;
  const report = buildShiftReport(cur, endedAt, openHandover, formatStarted, formatEnded);
  return {
    current: { ...cur, active: false },
    lastReport: report,
    pendingReport: report,
    handoverBook: openHandover,
  };
}

export function attachPayrollToReport(
  state: ShiftState,
  payroll: ShiftPayroll,
  careerTitle: string,
): ShiftState {
  const report = state.pendingReport ?? state.lastReport;
  if (!report) return state;
  const withPay: ShiftReport = { ...report, payroll, careerTitle };
  return {
    ...state,
    pendingReport: state.pendingReport ? withPay : state.pendingReport,
    lastReport: withPay,
  };
}

export function acknowledgeShiftReport(state: ShiftState): ShiftState {
  return { ...state, pendingReport: null };
}

export function formatShiftHours(kind: ShiftKind): string {
  const w = SHIFT_WINDOWS[kind];
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(w.startHour)}:00–${pad(w.endHour)}:00`;
}

export function gradeTone(grade: DispatcherGrade): string {
  switch (grade) {
    case 'S':
      return 'text-emerald-300 border-emerald-400/40 bg-emerald-950/40';
    case 'A':
      return 'text-sky-300 border-sky-400/40 bg-sky-950/40';
    case 'B':
      return 'text-amber-300 border-amber-400/40 bg-amber-950/40';
    default:
      return 'text-rose-300 border-rose-400/40 bg-rose-950/40';
  }
}
