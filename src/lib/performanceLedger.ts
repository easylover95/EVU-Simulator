import { loadJson, saveJson, TICKS_PER_DAY } from '@/lib/storage';
import { tickToDate } from '@/lib/gameTime';

export const PERFORMANCE_LEDGER_KEY = 'evu-performance-ledger';

export type SeasonId = 'winter' | 'fruehling' | 'sommer' | 'herbst';

export interface PerformanceBucket {
  id: string;
  label: string;
  revenue: number;
  operatingCost: number;
  trips: number;
  tonneKm: number;
}

export interface PerformanceLedger {
  monthly: PerformanceBucket[];
  seasonal: PerformanceBucket[];
  lastTick: number;
}

const SEASONS: ReadonlyArray<{ id: SeasonId; label: string; months: number[] }> = [
  { id: 'winter', label: 'Winter', months: [12, 1, 2] },
  { id: 'fruehling', label: 'Frühling', months: [3, 4, 5] },
  { id: 'sommer', label: 'Sommer', months: [6, 7, 8] },
  { id: 'herbst', label: 'Herbst', months: [9, 10, 11] },
];

function emptyLedger(): PerformanceLedger {
  return { monthly: [], seasonal: [], lastTick: 0 };
}

function finite(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function seasonForMonth(month: number): (typeof SEASONS)[number] {
  return SEASONS.find((row) => row.months.includes(month)) ?? SEASONS[0]!;
}

function upsert(list: PerformanceBucket[], id: string, label: string, patch: Omit<PerformanceBucket, 'id' | 'label'>): PerformanceBucket[] {
  const existing = list.find((row) => row.id === id);
  if (!existing) {
    return [...list, { id, label, ...patch }].slice(-24);
  }
  return list.map((row) =>
    row.id === id
      ? {
          ...row,
          revenue: row.revenue + patch.revenue,
          operatingCost: row.operatingCost + patch.operatingCost,
          trips: row.trips + patch.trips,
          tonneKm: row.tonneKm + patch.tonneKm,
        }
      : row,
  );
}

export function normalizePerformanceLedger(raw: unknown): PerformanceLedger {
  if (!raw || typeof raw !== 'object') return emptyLedger();
  const data = raw as Partial<PerformanceLedger>;
  const clean = (rows: unknown): PerformanceBucket[] =>
    Array.isArray(rows)
      ? rows
          .filter((row) => row && typeof row === 'object' && typeof (row as PerformanceBucket).id === 'string')
          .map((row) => {
            const bucket = row as PerformanceBucket;
            return {
              id: bucket.id,
              label: typeof bucket.label === 'string' ? bucket.label : bucket.id,
              revenue: Math.max(0, finite(bucket.revenue)),
              operatingCost: Math.max(0, finite(bucket.operatingCost)),
              trips: Math.max(0, Math.round(finite(bucket.trips))),
              tonneKm: Math.max(0, finite(bucket.tonneKm)),
            };
          })
      : [];
  return {
    monthly: clean(data.monthly).slice(-24),
    seasonal: clean(data.seasonal).slice(-8),
    lastTick: Math.max(0, Math.round(finite(data.lastTick))),
  };
}

export function loadPerformanceLedger(): PerformanceLedger {
  return normalizePerformanceLedger(loadJson<unknown>(PERFORMANCE_LEDGER_KEY, null));
}

export function savePerformanceLedger(state: PerformanceLedger): void {
  saveJson(PERFORMANCE_LEDGER_KEY, normalizePerformanceLedger(state));
}

export interface DayPerformance {
  revenue: number;
  operatingCost: number;
  trips: number;
  tonneKm: number;
}

export function recordPerformanceDay(state: PerformanceLedger, tick: number, day: DayPerformance): PerformanceLedger {
  const date = tickToDate(tick);
  const monthId = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const monthLabel = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(date);
  const season = seasonForMonth(date.getMonth() + 1);
  const seasonId = `${date.getFullYear()}-${season.id}`;
  const patch = {
    revenue: Math.max(0, finite(day.revenue)),
    operatingCost: Math.max(0, finite(day.operatingCost)),
    trips: Math.max(0, Math.round(finite(day.trips))),
    tonneKm: Math.max(0, finite(day.tonneKm)),
  };
  return {
    monthly: upsert(state.monthly, monthId, monthLabel, patch),
    seasonal: upsert(state.seasonal, seasonId, `${season.label} ${date.getFullYear()}`, patch),
    lastTick: tick,
  };
}

export function operationalEfficiency(bucket: PerformanceBucket | null | undefined): number | null {
  if (!bucket || bucket.operatingCost <= 0) return bucket && bucket.revenue > 0 ? 1 : null;
  return Math.round((bucket.revenue / bucket.operatingCost) * 100) / 100;
}

export function ticksToGameDay(tick: number): number {
  return Math.floor(Math.max(0, tick) / TICKS_PER_DAY);
}
