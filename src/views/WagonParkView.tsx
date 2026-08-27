import { useEffect, useMemo, useState } from 'react';
import { Package, Search, Info, Wrench, AlertTriangle, Handshake } from 'lucide-react';
import type { Company, Wagon } from '@/lib/supabase';
import {
  getWagonStatusConfig,
  getWagonCategoryConfig,
  getBrakePositionConfig,
  getWagonPillClass,
  formatEuro,
} from '@/lib/status';
import { useGameClock } from '@/lib/GameClockContext';
import {
  ticksRemaining,
  WAGON_JOB_RATES,
  type WagonJob,
  type WagonJobKind,
} from '@/lib/wagonJobs';
import { type RentalState, type RentalTermMonths, type WagonRental } from '@/lib/rental';
import { Button, Card } from '@/components/ui';
import { SectionShell } from '@/components/SectionShell';
import { WagonRentModal } from '@/components/WagonRentModal';

interface WagonParkViewProps {
  wagons: Wagon[];
  loading: boolean;
  company: Company | null;
  jobs: WagonJob[];
  rentals: RentalState;
  onStartWagonJob: (wagonId: string, kind: WagonJobKind) => boolean;
  onRentWagons: (wagonId: string, months: RentalTermMonths) => boolean;
}

function fristPercent(wagon: Wagon, now: Date): number {
  if (wagon.frist_date) {
    const days = (new Date(wagon.frist_date).getTime() - now.getTime()) / 86_400_000;
    return Math.max(0, Math.min(100, (days / 180) * 100));
  }
  if (wagon.frist_level === 3) return 12;
  if (wagon.frist_level === 2) return 45;
  return 85;
}

const JOB_KINDS: WagonJobKind[] = ['extend_3m', 'extend_6m', 'rev'];

export function WagonParkView({
  wagons,
  loading,
  company,
  jobs,
  rentals,
  onStartWagonJob,
  onRentWagons,
}: WagonParkViewProps) {
  const { gameNow, tick } = useGameClock();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'verfuegbar' | 'frist_abgelaufen' | 'wartung'>('all');
  const [detailWagonId, setDetailWagonId] = useState<string | null>(null);
  const [actionWarning, setActionWarning] = useState<string | null>(null);
  const [rentWagonId, setRentWagonId] = useState<string | null>(null);
  const [rentMonths, setRentMonths] = useState<RentalTermMonths>(6);

  const rentByWagon = useMemo(() => {
    const map = new Map<string, WagonRental>();
    for (const rental of rentals.wagonRentals) map.set(rental.wagonId, rental);
    return map;
  }, [rentals.wagonRentals]);

  const jobsByWagon = useMemo(() => {
    const map = new Map<string, WagonJob>();
    for (const job of jobs) map.set(job.wagonId, job);
    return map;
  }, [jobs]);

  const totalCount = useMemo(() => wagons.reduce((sum, w) => sum + w.count, 0), [wagons]);
  const detailWagon = detailWagonId ? wagons.find((w) => w.id === detailWagonId) ?? null : null;

  useEffect(() => {
    if (detailWagonId && !wagons.some((w) => w.id === detailWagonId)) {
      setDetailWagonId(null);
    }
  }, [detailWagonId, wagons]);

  const filtered = useMemo(() => {
    let result = wagons;
    if (filter !== 'all') result = result.filter((w) => w.status === filter);
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(
        (w) => w.type_code.toLowerCase().includes(s) || w.type_name.toLowerCase().includes(s),
      );
    }
    return result;
  }, [wagons, search, filter]);

  function handleJob(wagonId: string, kind: WagonJobKind) {
    const ok = onStartWagonJob(wagonId, kind);
    if (!ok) {
      const rates = WAGON_JOB_RATES[kind];
      setActionWarning(`Unzureichende Mittel — ${rates.label} kostet ${formatEuro(rates.cost)}.`);
      return;
    }
    setActionWarning(null);
  }

  const wagonActions = (
    <div className="relative">
      <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Suchen..."
        className="w-36 rounded-lg border border-slate-600 bg-slate-900 py-1.5 pl-7 pr-2 text-xs text-white outline-none focus:border-amber-500"
      />
    </div>
  );

  if (loading) {
    return (
      <SectionShell title="Wagendienst" subtitle="Güterwagen-Bestand" actions={wagonActions}>
        <div className="flex h-64 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-amber-500" />
        </div>
      </SectionShell>
    );
  }

  return (
    <SectionShell
      title="Wagendienst"
      subtitle={`${totalCount} Wagen in ${wagons.length} Typgruppen · Vermietung an Partner-EVUs mit Vollkasko`}
      actions={wagonActions}
    >

      {rentals.wagonRentals.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2 text-amber-400">
            <Handshake className="h-4 w-4" />
            <h3 className="text-sm font-bold text-white">Aktive Vermietungen</h3>
          </div>
          <ul className="space-y-1 text-xs text-slate-300">
            {rentals.wagonRentals.map((rental) => (
              <li key={rental.id} className="flex flex-wrap justify-between gap-2">
                <span>
                  {rental.label} · {rental.partnerName} · {rental.termMonths} Mon. · Vollkasko
                </span>
                <span className="text-emerald-400">{formatEuro(rental.dailyIncome)} / Tag</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="fi-filter-bar">
        {(
          [
            ['all', 'Alle'],
            ['verfuegbar', 'Verfügbar'],
            ['wartung', 'Wartung'],
            ['frist_abgelaufen', 'Frist abg.'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`fi-filter ${filter === key ? 'fi-filter-active' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="fi-card overflow-x-auto">
        <table className="fi-table">
          <thead>
            <tr>
              <th>Typ</th>
              <th>Bezeichnung</th>
              <th>Kategorie</th>
              <th>Bestand</th>
              <th>Status</th>
              <th>Kapazität</th>
              <th>Bremse</th>
              <th>Frist</th>
              <th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-500">
                  Keine Wagen in dieser Ansicht
                </td>
              </tr>
            )}
            {filtered.map((wagon) => {
              const statusCfg = getWagonStatusConfig(wagon.status);
              const catCfg = getWagonCategoryConfig(wagon.category);
              const brakeCfg = getBrakePositionConfig(wagon.brake_position);
              const fristLabel = wagon.frist_level === 3 ? 'St.3' : wagon.frist_level === 2 ? 'St.2' : 'St.1';
              const remaining = Math.round(fristPercent(wagon, gameNow));
              const pending = jobsByWagon.get(wagon.id);
              const rental = rentByWagon.get(wagon.id);
              return (
                <tr key={wagon.id}>
                  <td className="font-mono text-sm font-bold text-white">{wagon.type_code}</td>
                  <td>{wagon.type_name}</td>
                  <td>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${catCfg.color} ${catCfg.text}`}>
                      {catCfg.label}
                    </span>
                  </td>
                  <td className="font-bold tabular-nums text-white">{wagon.count} Stk</td>
                  <td>
                    <span className={getWagonPillClass(wagon.status)}>
                      {rental ? 'Vermietet' : statusCfg.label}
                    </span>
                    {rental && (
                      <div className="mt-1 text-[10px] font-bold uppercase text-sky-400">
                        {rental.partnerName} · Vollkasko
                      </div>
                    )}
                    {pending && (
                      <div className="mt-1 text-[10px] font-bold uppercase text-amber-400">
                        {WAGON_JOB_RATES[pending.kind].label} · noch {ticksRemaining(pending, tick)} Std.
                      </div>
                    )}
                  </td>
                  <td className="tabular-nums">{wagon.capacity_t} t</td>
                  <td className={`font-bold ${brakeCfg.color}`}>{wagon.brake_position}</td>
                  <td className="tabular-nums text-slate-400">
                    {fristLabel} · {remaining}%
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => setDetailWagonId(wagon.id)} className="btn-action btn-action-detail">
                        <Info className="h-3 w-3" /> Details
                      </button>
                      {wagon.status === 'verfuegbar' && !rental && (
                        <button onClick={() => setRentWagonId(wagon.id)} className="btn-action btn-action-detail">
                          <Handshake className="h-3 w-3" /> Wagengruppe vermieten
                        </button>
                      )}
                      {wagon.status === 'frist_abgelaufen' && !pending && !rental && (
                        <button onClick={() => setDetailWagonId(wagon.id)} className="btn-action btn-action-rev">
                          <Wrench className="h-3 w-3" /> Frist / REV
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {detailWagon && (
        <div
          className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => {
            setDetailWagonId(null);
            setActionWarning(null);
          }}
        >
          <div className="fi-card max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <div className="fi-card-header flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Package className="h-3.5 w-3.5 text-amber-500" />
                {detailWagon.type_code} — {detailWagon.type_name}
              </span>
              <button
                onClick={() => {
                  setDetailWagonId(null);
                  setActionWarning(null);
                }}
                className="text-slate-500 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <DetailRow label="UIC-Kennung" value={detailWagon.type_code} />
              <DetailRow label="Bezeichnung" value={detailWagon.type_name} />
              <DetailRow label="Kategorie" value={getWagonCategoryConfig(detailWagon.category).label} />
              <DetailRow label="Status" value={getWagonStatusConfig(detailWagon.status).label} />
              <DetailRow label="Bestand" value={`${detailWagon.count} Stück`} />
              <DetailRow label="Ladekapazität" value={`${detailWagon.capacity_t} t`} />
              <DetailRow
                label="Bremsstellung"
                value={`${getBrakePositionConfig(detailWagon.brake_position).label} (${detailWagon.brake_position})`}
              />
              <DetailRow label="Eigengewicht" value={`${detailWagon.tare_weight_t} t`} />
              <DetailRow
                label="Länge über Puffer"
                value={detailWagon.length_mm ? `${(detailWagon.length_mm / 1000).toFixed(1)} m` : '—'}
              />
              <DetailRow label="Frist-Level" value={`Wagenprüfer Stufe ${detailWagon.frist_level}`} />
              <DetailRow
                label="Fristablauf"
                value={
                  detailWagon.frist_date
                    ? new Intl.DateTimeFormat('de-DE').format(new Date(detailWagon.frist_date))
                    : '—'
                }
              />
            </div>

            {(detailWagon.status === 'frist_abgelaufen' || jobsByWagon.has(detailWagon.id)) && (
              <div className="border-t border-[#1e293b] p-4">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  EVU-Sammeltarife — Frist / Revision
                </div>
                {jobsByWagon.has(detailWagon.id) ? (
                  <p className="text-xs text-amber-300">
                    {WAGON_JOB_RATES[jobsByWagon.get(detailWagon.id)!.kind].label} läuft noch{' '}
                    {ticksRemaining(jobsByWagon.get(detailWagon.id)!, tick)} Takt
                    {ticksRemaining(jobsByWagon.get(detailWagon.id)!, tick) === 1 ? '' : 'e'}.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {JOB_KINDS.map((kind) => {
                      const rates = WAGON_JOB_RATES[kind];
                      const unaffordable = (company?.balance ?? 0) < rates.cost;
                      return (
                        <button
                          key={kind}
                          type="button"
                          disabled={unaffordable}
                          onClick={() => handleJob(detailWagon.id, kind)}
                          className={`flex w-full items-center justify-between rounded-sm border px-3 py-2 text-left ${
                            unaffordable
                              ? 'cursor-not-allowed border-slate-700 bg-slate-900/40 text-slate-500'
                              : 'border-amber-700/60 bg-slate-900/70 text-slate-200 hover:border-amber-500 hover:bg-slate-800'
                          }`}
                        >
                          <span>
                            <span className="block text-xs font-bold text-white">{rates.label}</span>
                            <span className="text-[10px] uppercase text-slate-400">
                              {rates.durationLabel}
                              {kind === 'extend_3m' && ' · Stufe 1 · VERFÜGBAR'}
                              {kind === 'extend_6m' && ' · Stufe 2 · VERFÜGBAR'}
                              {kind === 'rev' && ' · Werkstatt, danach Frist 100%'}
                            </span>
                          </span>
                          <span className={`text-sm font-bold ${unaffordable ? 'text-rose-400' : 'fi-gold'}`}>
                            {formatEuro(rates.cost)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {actionWarning && (
                  <div className="mt-3 flex items-start gap-2 rounded-sm border border-rose-700/50 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {actionWarning}
                  </div>
                )}
              </div>
            )}
            {detailWagon.status === 'verfuegbar' && !rentByWagon.has(detailWagon.id) && (
              <div className="border-t border-[#1e293b] p-4">
                <Button className="w-full" onClick={() => setRentWagonId(detailWagon.id)}>
                  <Handshake className="h-3.5 w-3.5" /> Wagengruppe vermieten
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {rentWagonId && wagons.find((w) => w.id === rentWagonId) && (
        <WagonRentModal
          wagon={wagons.find((w) => w.id === rentWagonId)!}
          months={rentMonths}
          onMonths={setRentMonths}
          onCancel={() => setRentWagonId(null)}
          onConfirm={() => {
            const ok = onRentWagons(rentWagonId, rentMonths);
            if (ok) setRentWagonId(null);
          }}
        />
      )}
    </SectionShell>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-slate-800 pb-1">
      <div className="text-[10px] font-bold uppercase text-slate-500">{label}</div>
      <div className="text-sm font-medium text-white">{value}</div>
    </div>
  );
}
