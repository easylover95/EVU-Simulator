import { useRef, useState } from 'react';
import { Archive, ArrowLeft, Clock3, Download, Globe2, LoaderCircle, Medal, Package, Send, TrendingUp, Trophy, Train, Upload, Wallet } from 'lucide-react';
import { SectionShell } from '@/components/SectionShell';
import { RevenueHistoryChart } from '@/components/RevenueHistoryChart';
import { formatEuro } from '@/lib/status';
import { isSupabaseConfigured } from '@/lib/supabase';
import { loadGlobalLeaderboard, publishHistoricalRun, type GlobalLeaderboardEntry } from '@/lib/globalLeaderboard';
import {
  difficultyLabel,
  exportStatisticsArchive,
  formatRunDuration,
  importStatisticsArchive,
  loadCurrentRunStatistics,
  loadStatisticsArchive,
  type HistoricalCompanyStatistics,
} from '@/lib/statisticsArchive';

interface StatisticsArchiveViewProps {
  onBack: () => void;
}

function archiveDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unbekannt';
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function StatValue({ icon, label, value, tone = 'text-slate-100' }: { icon: React.ReactNode; label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-700/80 bg-slate-950/45 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`mt-1 truncate text-sm font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function ArchiveMobileCard({ entry, rank }: { entry: HistoricalCompanyStatistics; rank: number }) {
  return (
    <article className="rounded-lg border border-amber-500/20 bg-slate-950/45 p-3" data-statistics-archive-entry>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-amber-400/35 bg-amber-950/45 text-[11px] font-black text-amber-200">
              {rank}
            </span>
            <h3 className="truncate text-sm font-bold text-white">{entry.companyName}</h3>
          </div>
          <p className="mt-1 pl-8 text-[10px] text-slate-500">{entry.hqLocation || 'Standort nicht hinterlegt'} · {archiveDate(entry.archivedAt)}</p>
        </div>
        <span className="shrink-0 rounded-full border border-sky-400/25 bg-sky-950/35 px-2 py-1 text-[10px] font-bold text-sky-200">
          Lvl {entry.endingLevel}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <StatValue icon={<Medal className="h-3 w-3 text-amber-300" />} label="Modus" value={difficultyLabel(entry.difficulty)} tone="text-amber-100" />
        <StatValue icon={<Clock3 className="h-3 w-3 text-sky-300" />} label="Spieldauer" value={formatRunDuration(entry.startedTick, entry.endedTick)} />
        <StatValue icon={<TrendingUp className="h-3 w-3 text-emerald-300" />} label="Höchster Umsatz" value={formatEuro(entry.peakRevenue)} tone="text-emerald-300" />
        <StatValue icon={<Package className="h-3 w-3 text-sky-300" />} label="Fracht" value={`${entry.freightTonnes.toLocaleString('de-DE')} t`} />
        <StatValue icon={<Train className="h-3 w-3 text-orange-300" />} label="Fahrten" value={entry.completedTrips.toLocaleString('de-DE')} />
        <StatValue icon={<Wallet className="h-3 w-3 text-emerald-300" />} label="Endkapital" value={formatEuro(entry.endingBalance)} tone={entry.endingBalance >= 0 ? 'text-emerald-300' : 'text-rose-300'} />
      </div>
    </article>
  );
}

export function StatisticsArchiveView({ onBack }: StatisticsArchiveViewProps) {
  const [archive, setArchive] = useState(() => loadStatisticsArchive());
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [globalEntries, setGlobalEntries] = useState<GlobalLeaderboardEntry[]>([]);
  const [globalNotice, setGlobalNotice] = useState<string | null>(null);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);
  const current = loadCurrentRunStatistics();

  function handleExport() {
    const json = JSON.stringify(exportStatisticsArchive(), null, 2);
    const file = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `evu-ruhmeshalle-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setImportNotice(`${archive.length} ${archive.length === 1 ? 'Lauf wurde' : 'Läufe wurden'} exportiert.`);
  }

  async function handleImport(file: File | null) {
    if (!file) return;
    try {
      const result = importStatisticsArchive(JSON.parse(await file.text()));
      setArchive(result.archive);
      if (!selectedRunId && result.archive[0]) setSelectedRunId(result.archive[0].id);
      setImportNotice(`${result.added} ${result.added === 1 ? 'Lauf wurde' : 'Läufe wurden'} importiert${result.skipped ? `, ${result.skipped} bereits vorhandene übersprungen` : ''}.`);
    } catch (error) {
      setImportNotice(error instanceof Error ? error.message : 'Die Archivdatei konnte nicht gelesen werden.');
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }

  async function refreshGlobalLeaderboard() {
    if (!isSupabaseConfigured) {
      setGlobalNotice('Globale Rangliste ist für diese Installation nicht konfiguriert.');
      return;
    }
    setGlobalLoading(true);
    try {
      const entries = await loadGlobalLeaderboard();
      setGlobalEntries(entries);
      setGlobalNotice(entries.length ? `${entries.length} globale Läufe geladen.` : 'Noch keine veröffentlichten Läufe vorhanden.');
    } catch (error) {
      setGlobalNotice(error instanceof Error ? error.message : 'Die globale Rangliste ist derzeit nicht erreichbar.');
    } finally {
      setGlobalLoading(false);
    }
  }

  async function publishSelectedRun() {
    const selected = archive.find((entry) => entry.id === (selectedRunId || archive[0]?.id));
    if (!selected) {
      setGlobalNotice('Wähle zuerst einen archivierten Lauf aus.');
      return;
    }
    setGlobalLoading(true);
    try {
      const result = await publishHistoricalRun(selected);
      setGlobalNotice(result.message);
      if (result.status !== 'unavailable') await refreshGlobalLeaderboard();
    } catch (error) {
      setGlobalNotice(error instanceof Error ? error.message : 'Der Lauf konnte nicht veröffentlicht werden.');
    } finally {
      setGlobalLoading(false);
    }
  }

  const bestRevenue = archive.reduce((best, entry) => Math.max(best, entry.peakRevenue), 0);
  const totalFreight = archive.reduce((total, entry) => total + entry.freightTonnes, 0);

  return (
    <SectionShell
      title="Ruhmeshalle"
      subtitle="Archivierte Unternehmensläufe und betriebliche Bestwerte"
      actions={
        <button type="button" onClick={onBack} className="btn-action btn-action-detail">
          <ArrowLeft className="h-3.5 w-3.5" />
          Zu Auswertungen
        </button>
      }
    >
      <section className="rounded-xl border border-amber-500/25 bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950/25 p-4" data-statistics-archive>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">
              <Trophy className="h-3.5 w-3.5" /> Historische Firmendaten
            </p>
            <h2 className="mt-1 text-lg font-bold text-amber-100">Archiv der Eisenbahnunternehmen</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-400">
              Beim bestätigten Spielstand-Reset wird der bisherige Lauf hier lokal gesichert. Das Archiv bleibt beim Neustart erhalten.
            </p>
          </div>
          <div className="flex flex-wrap items-stretch justify-end gap-2">
            <div className="rounded-lg border border-amber-400/25 bg-slate-950/55 px-3 py-2 text-right">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Archivierte Läufe</p>
              <p className="mt-1 text-xl font-black text-amber-200">{archive.length}</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="btn-action btn-action-detail" onClick={handleExport}>
                <Download className="h-3.5 w-3.5" /> JSON exportieren
              </button>
              <button type="button" className="btn-action btn-action-detail" onClick={() => importInputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" /> JSON importieren
              </button>
              <input
                ref={importInputRef}
                type="file"
                className="sr-only"
                accept="application/json,.json"
                aria-label="Ruhmeshalle als JSON importieren"
                onChange={(event) => void handleImport(event.target.files?.[0] ?? null)}
              />
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3">
          <StatValue icon={<TrendingUp className="h-3 w-3 text-emerald-300" />} label="Archivrekord Umsatz" value={formatEuro(bestRevenue)} tone="text-emerald-300" />
          <StatValue icon={<Package className="h-3 w-3 text-sky-300" />} label="Fracht im Archiv" value={`${totalFreight.toLocaleString('de-DE')} t`} />
          <StatValue icon={<Archive className="h-3 w-3 text-amber-300" />} label="Speicherort" value="Nur dieses Gerät" tone="text-amber-100" />
        </div>
        {importNotice && <p className="mt-3 text-xs font-semibold text-sky-200" role="status">{importNotice}</p>}
      </section>

      <section className="game-box p-4" aria-label="Historische Umsatzentwicklung">
        <RevenueHistoryChart entries={archive} />
      </section>

      <section className="game-box p-4" data-global-leaderboard>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-300">
              <Globe2 className="h-3.5 w-3.5" /> Globale Rangliste
            </p>
            <h2 className="mt-1 text-base font-bold text-white">Ruhmeshalle im Vergleich</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-400">
              Veröffentliche nur bewusst einen abgeschlossenen Lauf. Übertragen werden Unternehmensname, Schwierigkeit und aggregierte Kennzahlen – niemals der lokale Spielstand.
            </p>
          </div>
          <button type="button" className="btn-action btn-action-detail" onClick={() => void refreshGlobalLeaderboard()} disabled={globalLoading}>
            {globalLoading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Globe2 className="h-3.5 w-3.5" />} Globale Rangliste laden
          </button>
        </div>

        {!isSupabaseConfigured ? (
          <p className="mt-3 rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-xs leading-relaxed text-slate-400">
            Für diese lokale Installation ist keine Supabase-Rangliste konfiguriert. Die Ruhmeshalle, der JSON-Export und der Import bleiben vollständig offline nutzbar.
          </p>
        ) : (
          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <label className="min-w-0 text-xs font-semibold text-slate-300">
              Lokalen Lauf veröffentlichen
              <select
                className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white"
                value={selectedRunId || archive[0]?.id || ''}
                onChange={(event) => setSelectedRunId(event.target.value)}
                disabled={archive.length === 0 || globalLoading}
              >
                {archive.length === 0 && <option value="">Keine archivierten Läufe</option>}
                {archive.map((entry) => <option key={entry.id} value={entry.id}>{entry.companyName} · {formatEuro(entry.peakRevenue)} · {difficultyLabel(entry.difficulty)}</option>)}
              </select>
            </label>
            <button type="button" className="btn-action btn-action-primary self-end" onClick={() => void publishSelectedRun()} disabled={archive.length === 0 || globalLoading}>
              <Send className="h-3.5 w-3.5" /> Global veröffentlichen
            </button>
          </div>
        )}
        {globalNotice && <p className="mt-3 text-xs font-semibold text-sky-200" role="status">{globalNotice}</p>}
        {globalEntries.length > 0 && (
          <div className="mt-4 space-y-2" aria-label="Globale Highscores">
            {globalEntries.map((entry, index) => (
              <div key={entry.id} className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-sky-400/15 bg-slate-950/35 px-3 py-2">
                <span className="text-center text-sm font-black text-amber-300">{index + 1}</span>
                <div className="min-w-0"><p className="truncate text-sm font-bold text-white">{entry.companyName}</p><p className="text-[10px] text-slate-500">{difficultyLabel(entry.difficulty)} · Lvl {entry.endingLevel} · {entry.completedTrips.toLocaleString('de-DE')} Fahrten</p></div>
                <span className="text-right text-sm font-black tabular-nums text-emerald-300">{formatEuro(entry.peakRevenue)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {current && (
        <section className="game-box p-4">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-300">
            <Medal className="h-3.5 w-3.5" /> Aktueller Unternehmenslauf
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-5">
            <StatValue icon={<Medal className="h-3 w-3 text-amber-300" />} label="Schwierigkeit" value={difficultyLabel(current.difficulty)} tone="text-amber-100" />
            <StatValue icon={<Wallet className="h-3 w-3 text-emerald-300" />} label="Startkapital" value={formatEuro(current.startCapital)} tone="text-emerald-300" />
            <StatValue icon={<Train className="h-3 w-3 text-orange-300" />} label="Absolvierte Fahrten" value={current.completedTrips.toLocaleString('de-DE')} />
            <StatValue icon={<Package className="h-3 w-3 text-sky-300" />} label="Getragene Fracht" value={`${current.freightTonnes.toLocaleString('de-DE')} t`} />
            <StatValue icon={<TrendingUp className="h-3 w-3 text-emerald-300" />} label="Höchster Umsatz" value={formatEuro(current.peakRevenue)} tone="text-emerald-300" />
          </div>
        </section>
      )}

      <section className="game-box overflow-hidden" aria-label="Archivierte Unternehmensläufe">
        <div className="game-box-header flex items-center gap-2">
          <Archive className="h-3.5 w-3.5 text-amber-400" /> Ruhmeshalle – abgeschlossene Läufe
        </div>
        {archive.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <Trophy className="mx-auto h-8 w-8 text-slate-600" aria-hidden />
            <p className="mt-3 text-sm font-bold text-slate-300">Noch keine archivierten Unternehmen</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">Setze einen Spielstand sicher zurück, um dessen Kennzahlen hier dauerhaft zu speichern.</p>
          </div>
        ) : (
          <>
            <div className="space-y-2 p-3 sm:hidden">
              {archive.map((entry, index) => <ArchiveMobileCard key={entry.id} entry={entry} rank={index + 1} />)}
            </div>
            <div className="hidden overflow-x-auto sm:block">
              <table className="fi-table min-w-[760px]">
                <thead>
                  <tr>
                    <th>#</th><th>Unternehmen</th><th>Modus</th><th>Höchster Umsatz</th><th>Fracht</th><th>Fahrten</th><th>Spieldauer</th><th>Endkapital</th>
                  </tr>
                </thead>
                <tbody>
                  {archive.map((entry, index) => (
                    <tr key={entry.id}>
                      <td className="font-bold text-amber-300">{index + 1}</td>
                      <td><span className="block font-bold text-white">{entry.companyName}</span><span className="text-[10px] text-slate-500">{entry.hqLocation || '—'} · {archiveDate(entry.archivedAt)}</span></td>
                      <td className="text-amber-100">{difficultyLabel(entry.difficulty)}</td>
                      <td className="font-bold text-emerald-300">{formatEuro(entry.peakRevenue)}</td>
                      <td>{entry.freightTonnes.toLocaleString('de-DE')} t</td>
                      <td>{entry.completedTrips.toLocaleString('de-DE')}</td>
                      <td>{formatRunDuration(entry.startedTick, entry.endedTick)}</td>
                      <td className={entry.endingBalance >= 0 ? 'font-bold text-emerald-300' : 'font-bold text-rose-300'}>{formatEuro(entry.endingBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </SectionShell>
  );
}
