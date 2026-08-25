import { useMemo, useState } from 'react';
import { User, Phone, Users, CheckCircle2, AlertCircle, Info, Stethoscope, Briefcase } from 'lucide-react';
import type { Driver, Locomotive } from '@/lib/supabase';
import { driverStatusWithRecovery, formatEuro, getDriverStatusConfig, getDriverPillClass } from '@/lib/status';
import { QualificationBadge } from '@/components/Badges';
import { useGameClock } from '@/lib/GameClockContext';
import { hoursBetween } from '@/lib/gameTime';
import { Button, Card } from '@/components/ui';
import { SectionShell } from '@/components/SectionShell';
import { staffRoleLabel, type JobListing, type StaffMeta } from '@/lib/jobcenter';
import { canSpend } from '@/lib/bank';
import {
  fleetSeriesIds,
  hireNachschulungFee,
  missingFleetSeries,
  seriesLabel,
  seriesTrainingQuote,
  staffEfficiencyPct,
  xpProgressToNextRank,
} from '@/lib/personal';
import { TICKS_PER_DAY } from '@/lib/storage';

interface PersonnelViewProps {
  drivers: Driver[];
  locomotives: Locomotive[];
  listings: JobListing[];
  loading: boolean;
  onGesundmelden?: (driverId: string) => void;
  staffMeta?: Record<string, StaffMeta>;
  bekanntheit?: number;
  onRecruit?: (listing: JobListing, withFleetTraining?: boolean) => boolean;
  onStartTraining?: (driverId: string, seriesId: string) => boolean;
  balance?: number;
  overdraftLimit?: number;
}

export function PersonnelView({
  drivers,
  locomotives,
  listings,
  loading,
  onGesundmelden,
  staffMeta = {},
  bekanntheit = 0,
  onRecruit,
  onStartTraining,
  balance = 0,
  overdraftLimit = 0,
}: PersonnelViewProps) {
  const { gameNow, tick } = useGameClock();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [pendingHire, setPendingHire] = useState<JobListing | null>(null);
  const [trainDriverId, setTrainDriverId] = useState<string | null>(null);
  const detailDriver = drivers.find((d) => d.id === detailId) ?? null;
  const trainDriver = drivers.find((d) => d.id === trainDriverId) ?? null;
  const trainMeta = trainDriver ? staffMeta[trainDriver.id] : undefined;
  const trainOptions = trainMeta ? missingFleetSeries(trainMeta.seriesIds, locomotives) : [];

  const stats = useMemo(() => {
    return {
      total: drivers.length,
      verfuegbar: drivers.filter((d) => d.status === 'verfuegbar').length,
      im_einsatz: drivers.filter((d) => d.status === 'im_einsatz').length,
      nichtVerfuegbar: drivers.filter((d) => d.status === 'pause' || d.status === 'krank' || d.status === 'urlaub')
        .length,
    };
  }, [drivers]);

  if (loading) {
    return (
      <SectionShell title="Personal" subtitle="Triebfahrzeugführer und AZF/RB">
        <div className="flex h-64 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-amber-500" />
        </div>
      </SectionShell>
    );
  }

  return (
    <SectionShell
      title="Personal"
      subtitle={`${drivers.length} Mitarbeiter im Dienstplan · Ruhezeit 8 h · 48-h-Fenster`}
      tutorialId="tutorial-personal"
    >
      {onRecruit && (
        <Card className="p-4" data-tutorial="tutorial-jobcenter">
          <div className="mb-3 flex items-center gap-2 text-amber-400">
            <Briefcase className="h-4 w-4" />
            <h3 className="text-sm font-bold text-white">Jobbörse</h3>
          </div>
          <p className="mb-3 text-xs text-slate-400">
            Täglich neue Kandidaten (wie die Frachtbörse): zufällige Namen, Gehälter, Stufen und Baureihen-Freigaben.
            Einstellung nur nach Bestätigung. Gehälter laufen täglich (Monatsgehalt / 30).
          </p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {listings.map((listing) => {
              const locked = bekanntheit < listing.minBekanntheit;
              return (
                <div key={listing.id} className="app-glass-panel rounded-xl border border-amber-500/20 p-3">
                  <div className="text-xs font-bold text-white">{listing.personName}</div>
                  <div className="mt-0.5 text-[11px] font-semibold text-amber-300">{listing.roleLabel}</div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    Qualifikation {listing.qualifications.filter((q) => !q.startsWith('BR') && !q.includes('·')).join(', ')}
                  </div>
                  {listing.seriesIds.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {listing.seriesIds.map((id) => (
                        <span key={id} className="series-badge">
                          {seriesLabel(id)}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-1 text-[11px] text-slate-400">
                    Gehalt {formatEuro(listing.salary)} / Monat
                  </div>
                  <div className="mt-0.5 text-[11px] font-semibold text-slate-300">
                    Einstellungsgebühr {formatEuro(listing.hiringCost)}
                  </div>
                  {locked ? (
                    <div className="mt-2 text-[11px] text-amber-400">Ab Bekanntheit {listing.minBekanntheit}</div>
                  ) : (
                    <Button className="mt-2 px-3 py-1.5" onClick={() => setPendingHire(listing)}>
                      Einstellen
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {pendingHire && (
        <HireConfirmModal
          listing={pendingHire}
          locomotives={locomotives}
          balance={balance}
          overdraftLimit={overdraftLimit}
          onClose={() => setPendingHire(null)}
          onConfirm={(withTraining) => {
            const ok = onRecruit?.(pendingHire, withTraining) ?? false;
            if (ok) setPendingHire(null);
          }}
        />
      )}

      {trainDriver && trainMeta && (
        <div
          className="modal-scrim fixed inset-0 z-[70] flex items-center justify-center p-4"
          onClick={() => setTrainDriverId(null)}
        >
          <div
            className="app-glass w-full max-w-md rounded-xl border-amber-500/30 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-white">Baureihen-Schulung · {trainDriver.name}</h3>
            <p className="mt-2 text-[11px] text-slate-400">
              Freigabe für eine Baureihe aus dem eigenen Fuhrpark. Der Tf ist während der Schulung nicht einsetzbar.
            </p>
            {trainOptions.length === 0 ? (
              <p className="mt-3 text-sm text-slate-300">Alle Baureihen im Bestand sind bereits geschult.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {trainOptions.map((id) => {
                  const quote = seriesTrainingQuote(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      className="flex w-full items-center justify-between rounded-lg border border-amber-500/25 bg-slate-950/60 px-3 py-2 text-left text-xs text-white hover:border-amber-400"
                      onClick={() => {
                        const ok = onStartTraining?.(trainDriver.id, id) ?? false;
                        if (ok) setTrainDriverId(null);
                      }}
                    >
                      <span>{seriesLabel(id)}</span>
                      <span className="text-amber-300">
                        {formatEuro(quote.cost)} · {quote.durationDays} T.
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" onClick={() => setTrainDriverId(null)}>
                Schließen
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KPICard label="Gesamt" value={stats.total} icon={<Users className="h-4 w-4" />} color="text-slate-300" />
        <KPICard label="Verfügbar" value={stats.verfuegbar} icon={<CheckCircle2 className="h-4 w-4" />} color="text-emerald-400" />
        <KPICard label="Im Einsatz" value={stats.im_einsatz} icon={<User className="h-4 w-4" />} color="text-sky-400" />
        <KPICard label="Nicht verfügbar" value={stats.nichtVerfuegbar} icon={<AlertCircle className="h-4 w-4" />} color="text-rose-400" />
      </div>

      <div className="fi-card overflow-x-auto">
        <table className="fi-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Qualifikationen</th>
              <th>48h</th>
              <th>Ruhezeit</th>
              <th>Schicht</th>
              <th>Rang / Gehalt</th>
              <th>Telefon</th>
              <th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {drivers.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-500">
                  Kein Personal im Bestand
                </td>
              </tr>
            )}
            {drivers.map((driver) => {
              const cfg = getDriverStatusConfig(driver.status);
              const hoursPct = driver.max_hours > 0 ? (driver.hours_worked / driver.max_hours) * 100 : 0;
              const hoursColor = hoursPct >= 85 ? 'text-rose-400' : hoursPct >= 65 ? 'text-amber-400' : 'text-emerald-400';
              const statusLabel = driverStatusWithRecovery(driver.status, driver.recovery_hours_left);
              const restHours = hoursBetween(driver.last_rest_end, gameNow);
              const restOk = restHours >= 8;
              const shiftHours = driver.shift_start ? hoursBetween(driver.shift_start, gameNow) : null;
              const meta = staffMeta[driver.id];
              const canTrain =
                Boolean(onStartTraining) &&
                meta?.role === 'tf' &&
                meta.trainingUntilTick == null &&
                missingFleetSeries(meta.seriesIds, locomotives).length > 0;
              return (
                <tr key={driver.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-sm border border-slate-600 bg-slate-800 text-[10px] font-bold text-slate-400">
                        {driver.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .slice(0, 2)}
                      </span>
                      <span className="font-bold text-white">{driver.name}</span>
                    </div>
                  </td>
                  <td>
                    <span className={getDriverPillClass(driver.status)}>
                      <span className={`status-dot ${cfg.dot} ${driver.status === 'im_einsatz' ? 'animate-pulse' : ''}`} />
                      {statusLabel}
                    </span>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {driver.qualifications.map((q) => (
                        <QualificationBadge key={q} qual={q} />
                      ))}
                      {(meta?.seriesIds ?? []).map((id) => (
                        <span key={id} className="series-badge">
                          {seriesLabel(id)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className={`font-bold tabular-nums ${hoursColor}`}>
                    {driver.hours_worked}/{driver.max_hours}h
                  </td>
                  <td className={`tabular-nums ${restOk ? 'text-slate-300' : 'font-bold text-rose-400'}`}>
                    {restHours}h{restOk ? '' : ' ⚠'}
                  </td>
                  <td className="tabular-nums text-slate-300">{shiftHours !== null ? `${shiftHours}h` : '—'}</td>
                  <td className="text-[11px] text-slate-300">
                    {(() => {
                      if (!meta) return '—';
                      const daysLeft =
                        meta.trainingUntilTick != null && meta.trainingUntilTick > tick
                          ? Math.max(1, Math.ceil((meta.trainingUntilTick - tick) / TICKS_PER_DAY))
                          : 0;
                      const training =
                        daysLeft > 0
                          ? ` · Schulung ${daysLeft} T.${meta.trainingSeriesId ? ` ${seriesLabel(meta.trainingSeriesId)}` : ''}`
                          : '';
                      return `${
                        meta.role === 'tf' ? 'Tf' : meta.role === 'azf' ? 'AZF/RB' : 'Wp'
                      } ${meta.rank} · ${meta.xp ?? 0} XP · ${formatEuro(meta.salary)}${training}`;
                    })()}
                  </td>
                  <td>
                    {driver.phone ? (
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <Phone className="h-2.5 w-2.5 text-slate-600" />
                        {driver.phone}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => setDetailId(driver.id)} className="btn-action btn-action-detail">
                        <Info className="h-3 w-3" /> Details
                      </button>
                      {canTrain && (
                        <button
                          type="button"
                          onClick={() => setTrainDriverId(driver.id)}
                          className="btn-action btn-action-dispo"
                        >
                          Schulung
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

      {detailDriver && (
        <DriverDetailModal
          driver={detailDriver}
          meta={staffMeta[detailDriver.id]}
          locomotives={locomotives}
          gameNow={gameNow}
          onClose={() => setDetailId(null)}
          onGesundmelden={onGesundmelden}
          onOpenTraining={
            onStartTraining && staffMeta[detailDriver.id]?.role === 'tf'
              ? () => {
                  setDetailId(null);
                  setTrainDriverId(detailDriver.id);
                }
              : undefined
          }
        />
      )}
    </SectionShell>
  );
}

function HireConfirmModal({
  listing,
  locomotives,
  balance,
  overdraftLimit,
  onClose,
  onConfirm,
}: {
  listing: JobListing;
  locomotives: Locomotive[];
  balance: number;
  overdraftLimit: number;
  onClose: () => void;
  onConfirm: (withFleetTraining: boolean) => void;
}) {
  const fleetIds = fleetSeriesIds(locomotives);
  const isTf = listing.role === 'tf';
  const missing = isTf ? missingFleetSeries(listing.seriesIds, locomotives, listing.qualifications) : [];
  const showFit = isTf && fleetIds.length > 0 && missing.length === 0;
  const trainingFee = hireNachschulungFee(missing.length);
  const hireTotal = listing.hiringCost + trainingFee;
  const canHireTrained = canSpend(balance, hireTotal, overdraftLimit);
  const shortfall = Math.max(0, hireTotal - (balance + overdraftLimit));

  return (
    <div className="modal-scrim fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="app-glass w-full max-w-md rounded-xl border-amber-500/30 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-bold text-white">Einstellung bestätigen</h3>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          Möchtest du {listing.personName} wirklich einstellen?
        </p>
        <p className="mt-2 text-[11px] text-slate-400">
          {listing.roleLabel} · Einstellungsgebühr {formatEuro(listing.hiringCost)}
        </p>
        {listing.seriesIds.length > 0 && (
          <p className="mt-1 text-[11px] text-slate-400">
            Baureihen: {listing.seriesIds.map((id) => seriesLabel(id)).join(', ')}
          </p>
        )}
        <p className="mt-1 text-[11px] text-slate-500">
          Danach {formatEuro(listing.salary)} Gehalt / Monat ({staffRoleLabel(listing.role)} Rang {listing.rank}).
        </p>
        {missing.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-950/40 px-3 py-2">
            <div className="flex items-start gap-2 text-amber-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="text-xs font-bold">Fehlende Baureihen-Berechtigung für deinen Fuhrpark</p>
                <p className="mt-1 text-[11px] text-amber-100/90">
                  {missing.map((id) => seriesLabel(id)).join(', ')}
                </p>
              </div>
            </div>
          </div>
        )}
        {showFit && (
          <div className="mt-3 rounded-lg border border-emerald-500/35 bg-emerald-950/30 px-3 py-2">
            <div className="flex items-center gap-2 text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <p className="text-xs font-semibold">passt zum Fuhrpark</p>
            </div>
          </div>
        )}
        <div className="mt-4 flex flex-col gap-2">
          {missing.length > 0 && (
            <>
              <Button
                className="w-full whitespace-normal py-2 text-left text-[12px] leading-snug"
                disabled={!canHireTrained}
                onClick={() => onConfirm(true)}
              >
                Direkt inkl. Baureihen-Nachschulung einstellen (Aufpreis: {formatEuro(trainingFee)})
              </Button>
              {!canHireTrained && (
                <p className="text-[11px] text-rose-400">
                  Fehlbetrag {formatEuro(shortfall)} (Einstellungsgebühr + Nachschulung{' '}
                  {formatEuro(hireTotal)}).
                </p>
              )}
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Abbrechen
            </Button>
            <Button onClick={() => onConfirm(false)}>
              Bestätigen
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DriverDetailModal({
  driver,
  meta,
  locomotives,
  gameNow,
  onClose,
  onGesundmelden,
  onOpenTraining,
}: {
  driver: Driver;
  meta?: StaffMeta;
  locomotives: Locomotive[];
  gameNow: Date;
  onClose: () => void;
  onGesundmelden?: (driverId: string) => void;
  onOpenTraining?: () => void;
}) {
  const cfg = getDriverStatusConfig(driver.status);
  const restHours = hoursBetween(driver.last_rest_end, gameNow);
  const restOk = restHours >= 8;
  const shiftHours = driver.shift_start ? hoursBetween(driver.shift_start, gameNow) : null;
  const statusLabel = driverStatusWithRecovery(driver.status, driver.recovery_hours_left);
  const showErsatzattest = driver.status === 'krank';
  const xp = meta?.xp ?? 0;
  const rank = meta?.rank ?? 1;
  const progress = xpProgressToNextRank(xp, rank);
  const missing = meta ? missingFleetSeries(meta.seriesIds, locomotives) : [];

  return (
    <div className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="fi-card max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="fi-card-header flex items-center justify-between">
          <span className="flex items-center gap-2">
            <User className="h-3.5 w-3.5 text-amber-500" />
            {driver.name}
          </span>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            ✕
          </button>
        </div>
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <span className={getDriverPillClass(driver.status)}>
              <span className={`status-dot ${cfg.dot}`} />
              {statusLabel}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <DetailRow label="Wochenstunden" value={`${driver.hours_worked}/${driver.max_hours} h`} />
            <DetailRow label="Ruhezeit" value={`${restHours}h her${restOk ? '' : ' (!)'}`} />
            <DetailRow label="Schicht" value={shiftHours !== null ? `seit ${shiftHours}h` : '—'} />
            <DetailRow label="Telefon" value={driver.phone ?? '—'} />
            <DetailRow label="Erfahrung" value={`${xp} XP · Stufe ${rank}`} />
            <DetailRow
              label="Effizienz"
              value={`+${staffEfficiencyPct(xp, rank).toLocaleString('de-DE')} % Fahrplan`}
            />
          </div>
          <p className="text-[11px] text-slate-400">{progress.label}</p>
          <div>
            <div className="text-[10px] font-bold uppercase text-slate-500">Qualifikationen</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {driver.qualifications.map((q) => (
                <QualificationBadge key={q} qual={q} />
              ))}
            </div>
          </div>
          {meta?.role === 'tf' && (
            <div>
              <div className="text-[10px] font-bold uppercase text-slate-500">Baureihen-Freigaben</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {(meta.seriesIds ?? []).length === 0 && <span className="text-[11px] text-slate-500">Keine</span>}
                {(meta.seriesIds ?? []).map((id) => (
                  <span key={id} className="series-badge">
                    {seriesLabel(id)}
                  </span>
                ))}
              </div>
              {missing.length > 0 && (
                <p className="mt-1 text-[11px] text-amber-300">
                  Offen im Fuhrpark: {missing.map((id) => seriesLabel(id)).join(', ')}
                </p>
              )}
            </div>
          )}
          {onOpenTraining && meta?.role === 'tf' && missing.length > 0 && meta.trainingUntilTick == null && (
            <Button className="w-full" onClick={onOpenTraining}>
              Schulung (Baureihe nachrüsten)
            </Button>
          )}
          {showErsatzattest && (
            <button
              type="button"
              onClick={() => {
                onGesundmelden?.(driver.id);
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-emerald-600 bg-emerald-900/30 px-3 py-2 text-xs font-bold uppercase text-emerald-300 hover:bg-emerald-800/50"
            >
              <Stethoscope className="h-3.5 w-3.5" />
              Kurzfristig gesundmelden (Ersatzattest)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function KPICard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="game-box p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase text-slate-500">{label}</span>
        <span className={color}>{icon}</span>
      </div>
      <div className={`mt-1 text-lg font-bold ${color}`}>{value}</div>
    </div>
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
