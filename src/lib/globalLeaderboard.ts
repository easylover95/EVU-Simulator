import { getSupabaseClient } from '@/lib/supabaseClient';
import { isSupabaseConfigured } from '@/lib/supabase';
import { difficultyLabel, type DifficultyId, type HistoricalCompanyStatistics } from '@/lib/statisticsArchive';

export interface GlobalLeaderboardEntry {
  id: string;
  companyName: string;
  difficulty: DifficultyId;
  peakRevenue: number;
  totalRevenue: number;
  freightTonnes: number;
  completedTrips: number;
  durationTicks: number;
  endingLevel: number;
  endingBalance: number;
  publishedAt: string;
}

function numberOrZero(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function difficulty(value: unknown): DifficultyId {
  return value === 'hardcore' || value === 'komfort' || value === 'standard' ? value : 'standard';
}

function name(value: unknown): string {
  const normalized = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return normalized.slice(0, 48) || 'Unbekanntes EVU';
}

function fromRow(row: Record<string, unknown>): GlobalLeaderboardEntry {
  return {
    id: typeof row.id === 'string' ? row.id : String(row.client_run_id ?? crypto.randomUUID()),
    companyName: name(row.company_name),
    difficulty: difficulty(row.difficulty),
    peakRevenue: numberOrZero(row.peak_revenue),
    totalRevenue: numberOrZero(row.total_revenue),
    freightTonnes: numberOrZero(row.freight_tonnes),
    completedTrips: Math.floor(numberOrZero(row.completed_trips)),
    durationTicks: Math.floor(numberOrZero(row.duration_ticks)),
    endingLevel: Math.max(1, Math.floor(numberOrZero(row.ending_level))),
    endingBalance: numberOrZero(row.ending_balance),
    publishedAt: typeof row.published_at === 'string' ? row.published_at : '',
  };
}

/** Lädt die beste Liste nur auf ausdrücklichen Aufruf der Ruhmeshalle. */
export async function loadGlobalLeaderboard(limit = 20): Promise<GlobalLeaderboardEntry[]> {
  const client = await getSupabaseClient();
  if (!client) return [];

  const { data, error } = await client
    .from('evu_global_leaderboard')
    .select('id, client_run_id, company_name, difficulty, peak_revenue, total_revenue, freight_tonnes, completed_trips, duration_ticks, ending_level, ending_balance, published_at')
    .order('peak_revenue', { ascending: false })
    .order('total_revenue', { ascending: false })
    .order('ending_balance', { ascending: false })
    .limit(Math.max(1, Math.min(50, limit)));

  if (error) throw new Error('Die globale Rangliste konnte nicht geladen werden.');
  return (data ?? []).map((row) => fromRow(row as Record<string, unknown>));
}

export interface PublishLeaderboardResult {
  status: 'published' | 'already-published' | 'unavailable';
  message: string;
}

/**
 * Veröffentlicht ausschließlich eine vom Nutzer bewusst ausgewählte historische Statistikzeile.
 * Lokale Spielstände und Detaildaten werden weder übertragen noch ersetzt.
 */
export async function publishHistoricalRun(entry: HistoricalCompanyStatistics): Promise<PublishLeaderboardResult> {
  if (!isSupabaseConfigured) {
    return { status: 'unavailable', message: 'Globale Rangliste ist für diese Installation nicht konfiguriert.' };
  }
  const client = await getSupabaseClient();
  if (!client) return { status: 'unavailable', message: 'Globale Rangliste ist derzeit nicht erreichbar.' };

  const { error } = await client.from('evu_global_leaderboard').insert({
    client_run_id: entry.id,
    company_name: name(entry.companyName),
    difficulty: entry.difficulty,
    peak_revenue: Math.round(numberOrZero(entry.peakRevenue)),
    total_revenue: Math.round(numberOrZero(entry.totalRevenue)),
    freight_tonnes: Math.round(numberOrZero(entry.freightTonnes)),
    completed_trips: Math.floor(numberOrZero(entry.completedTrips)),
    duration_ticks: Math.max(0, Math.floor(entry.endedTick - entry.startedTick)),
    ending_level: Math.max(1, Math.floor(numberOrZero(entry.endingLevel))),
    ending_balance: Math.round(numberOrZero(entry.endingBalance)),
  });

  if (error?.code === '23505') {
    return { status: 'already-published', message: 'Dieser Lauf ist bereits in der globalen Rangliste veröffentlicht.' };
  }
  if (error) throw new Error('Der Lauf konnte nicht in die globale Rangliste übertragen werden.');
  return { status: 'published', message: `${difficultyLabel(entry.difficulty)} wurde global veröffentlicht.` };
}
