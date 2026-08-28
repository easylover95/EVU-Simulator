import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  Briefcase,
  CheckCircle2,
  Clock3,
  GraduationCap,
  Info,
  Phone,
  ShieldCheck,
  Stethoscope,
  User,
  Users,
  X,
} from 'lucide-react';
import type { Driver, Locomotive } from '@/lib/supabase';
import { driverStatusWithRecovery, formatEuro, getDriverStatusConfig, getDriverPillClass } from '@/lib/status';
import { QualificationBadge } from '@/components/Badges';
import { useGameClock } from '@/lib/GameClockContext';
import { hoursBetween } from '@/lib/gameTime';
import { Button, Card } from '@/components/ui';
import { SectionShell } from '@/components/SectionShell';
import { type JobListing, type StaffMeta } from '@/lib/jobcenter';
import { canSpend } from '@/lib/bank';
import {
  fleetSeriesIds,
  hireNachschulungFee,
  missingFleetSeries,
  seriesLabel,
  seriesQuickPayQuote,
  seriesTrainingQuote,
  staffEfficiencyPct,
  xpProgressToNextRank,
} from '@/lib/personal';
import { nextRankTraining, rankQuickPayCost, type StaffRole } from '@/lib/jobcenter';
import { TICKS_PER_DAY } from '@/lib/storage';

type HireMode = 'standard' | 'quickpay';

interface PersonnelViewProps {
  drivers: Driver[];
  locomotives: Locomotive[];
  listings: JobListing[];
  loading: boolean;
  onGesundmelden?: (driverId: string) => void;
  staffMeta?: Record<string, StaffMeta>;
  bekanntheit?: number;
  onRecruit?: (listing: JobListing, withFleetTraining?: boolean) => boolean;
  onStartTraining?: (driverId: string, seriesId: string, instant?: boolean) => boolean;
  onStartRankTraining?: (driverId: string, instant?: boolean) => boolean;
  balance?: number;
  overdraftLimit?: number;
  staffCap?: number;
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
  onStartRankTraining,
  balance = 0,
  overdraftLimit = 0,
  staffCap,
}: PersonnelViewProps) {
  const { gameNow, tick } = useGameClock();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [pendingHire, setPendingHire] = useState<JobListing | null>(null);
  const [hireMode, setHireMode] = useState<HireMode | null>(null);
  const [trainDriverId, setTrainDriverId] = useState<string | null>(null);
  const [pendingTrainingSeriesId, setPendingTrainingSeriesId] = useState<string | null>(null);
  const [trainingInstant, setTrainingInstant] = useState(false);
  const [roleFilter, setRoleFilter] = useState<'all' | StaffRole>('all');
  const [pendingAttestDriverId, setPendingAttestDriverId] = useState<string | null>(null);

  const detailDriver = drivers.find((driver) => driver.id === detailId) ?? null;
  const trainDriver = drivers.find((driver) => driver.id === trainDriverId) ?? null;
  const pendingAttestDriver = drivers.find((driver) => driver.id === pendingAttestDriverId) ?? null;
  const trainMeta = trainDriver ? staffMeta[trainDriver.id] : undefined;
  const trainOptions = trainMeta ? missingFleetSeries(trainMeta.seriesIds, locomotives) : [];
  const fleetIds = useMemo(() => fleetSeriesIds(locomotives), [locomotives]);

  const stats = useMemo(() => {
    return {
      total: drivers.length,
      verfuegbar: drivers.filter((driver) => driver.status === 'verfuegbar').length,
      imEinsatz: drivers.filter((driver) => driver.status === 'im_einsatz').length,
      nichtVerfuegbar: drivers.filter(
        (driver) => driver.status === 'pause' || driver.status === 'krank' || driver.status === 'urlaub',
      ).length,
    };
  }, [drivers]);

  const closeHireFlow = () => {
    setHireMode(null);
    setPendingHire(null);
  };

  const closeTrainingFlow = () => {
    setPendingTrainingSeriesId(null);
    setTrainDriverId(null);
    setTrainingInstant(false);
  };

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
      subtitle={`${drivers.length}${staffCap != null ? ` / ${staffCap}` : ''} Mitarbeiter · Tf, Werkstatt (AZF/RB) und Wagenprüfer`}
      tutorialId="tutorial-personal"
    >
      {onRecruit && (
        <Card className="p-4" data-tutorial="tutorial-jobcenter">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <div className="flex items-center gap-2 text-amber-400">
                <Briefcase className="h-4 w-4" />
                <h3 className="text-sm font-bold text-white">Jobbörse</h3>
              </div>
              <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-slate-400">
                Täglich neue Kandidaten mit individuellen Gehältern, Rangstufen und Baureihen-Freigaben. Prüfe vor der
                Einstellung den Fuhrpark-Fit und entscheide anschließend bewusst zwischen regulärer Einstellung und
                Quick-Pay-Nachschulung.
              </p>
            </div>
            <div className="personnel-security-note">
              <ShieldCheck className="h-3.5 w-3.5" />
              Jede Buchung wird bestätigt
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(
              [
                ['all', 'Alle'],
                ['tf', 'Triebfahrzeugführer'],
                ['azf', 'Werkstatt / AZF'],
                ['wagenpruefer', 'Wagenprüfer'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setRoleFilter(id === 'all' ? 'all' : id)}
                className={`fi-filter min-h-12 px-3 ${roleFilter === id || (id === 'all' && roleFilter === 'all') ? 'fi-filter-active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {listings
              .filter((listing) => roleFilter === 'all' || listing.role === roleFilter)
              .map((listing) => {
              const locked = bekanntheit < listing.minBekanntheit;
              const isTf = listing.role === 'tf';
              const missing = isTf ? missingFleetSeries(listing.seriesIds, locomotives, listing.qualifications) : [];
              const hasFleetFitContext = isTf && fleetIds.length > 0;
              const quickPayFee = hireNachschulungFee(missing.length);
              const quickPayTotal = listing.hiringCost + quickPayFee;
              const housingFull = staffCap != null && drivers.length >= staffCap;
              const canHire = !housingFull && canSpend(balance, listing.hiringCost, overdraftLimit);
              const canQuickPay = !housingFull && canSpend(balance, quickPayTotal, overdraftLimit);

              return (
                <article key={listing.id} className="personnel-candidate">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-white">{listing.personName}</p>
                      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                        {listing.roleLabel}
                      </p>
                    </div>
                    {hasFleetFitContext && missing.length === 0 && (
                      <span className="personnel-fit personnel-fit--good">
                        <CheckCircle2 className="h-3 w-3" />
                        passend
                      </span>
                    )}
                  </div>

                  <div className="mt-3 space-y-2">
                    <CandidateFact label="Qualifikation" value={listing.qualifications.filter((q) => !q.startsWith('BR') && !q.includes('·')).join(', ')} />
                    {isTf && (
                      <div>
                        <p className="personnel-fact-label">Baureihen-Freigaben</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {listing.seriesIds.length > 0 ? (
                            listing.seriesIds.map((id) => (
                              <span key={id} className="series-badge">
                                {seriesLabel(id)}
                              </span>
                            ))
                          ) : (
                            <span className="text-[11px] text-slate-500">Keine Freigabe hinterlegt</span>
                          )}
                        </div>
                      </div>
                    )}

                    {hasFleetFitContext && missing.length > 0 && (
                      <div className="personnel-fit personnel-fit--attention">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          Offen: {missing.map((id) => seriesLabel(id)).join(', ')}
                          <strong> Quick-Pay: +{formatEuro(quickPayFee)}</strong>
                        </span>
                      </div>
                    )}
                    {isTf && !hasFleetFitContext && (
                      <p className="text-[11px] leading-relaxed text-slate-500">
                        Ohne eigene Lokomotive ist noch kein Baureihen-Fit zu prüfen.
                      </p>
                    )}
                  </div>

                  <div className="personnel-candidate-costs">
                    <span>Einstellung</span>
                    <strong>{formatEuro(listing.hiringCost)}</strong>
                    <span>Monatsgehalt</span>
                    <strong>{formatEuro(listing.salary)}</strong>
                  </div>

                  {housingFull ? (
                    <div className="mt-3 text-[11px] font-semibold text-amber-400">
                      Personal-Kapazität voll — weitere Betriebsstelle oder Lok-Ausbau nötig.
                    </div>
                  ) : locked ? (
                    <div className="mt-3 text-[11px] font-semibold text-amber-400">Ab Bekanntheit {listing.minBekanntheit}</div>
                  ) : (
                    <button
                      type="button"
                      className="btn-gold mt-3 min-h-12 w-full"
                      disabled={!canHire && !(missing.length > 0 && canQuickPay)}
                      onClick={() => setPendingHire(listing)}
                    >
                      Einstellung prüfen
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </Card>
      )}

      {pendingHire && !hireMode && (
        <HireReviewModal
          listing={pendingHire}
          locomotives={locomotives}
          balance={balance}
          overdraftLimit={overdraftLimit}
          onClose={closeHireFlow}
          onChoose={setHireMode}
        />
      )}

      {pendingHire && hireMode && (
        <HireCommitModal
          listing={pendingHire}
          mode={hireMode}
          locomotives={locomotives}
          balance={balance}
          overdraftLimit={overdraftLimit}
          onBack={() => setHireMode(null)}
          onClose={closeHireFlow}
          onConfirm={() => {
            const ok = onRecruit?.(pendingHire, hireMode === 'quickpay') ?? false;
            if (ok) closeHireFlow();
          }}
        />
      )}

      {trainDriver && trainMeta && !pendingTrainingSeriesId && (
        <TrainingSelectionModal
          driver={trainDriver}
          options={trainOptions}
          balance={balance}
          overdraftLimit={overdraftLimit}
          onClose={closeTrainingFlow}
          onSelect={(seriesId) => setPendingTrainingSeriesId(seriesId)}
        />
      )}

      {trainDriver && trainMeta && pendingTrainingSeriesId && (
        <TrainingCommitModal
          driver={trainDriver}
          seriesId={pendingTrainingSeriesId}
          instant={trainingInstant}
          balance={balance}
          overdraftLimit={overdraftLimit}
          onBack={() => setPendingTrainingSeriesId(null)}
          onClose={closeTrainingFlow}
          onToggleInstant={() => setTrainingInstant((v) => !v)}
          onConfirm={() => {
            const ok = onStartTraining?.(trainDriver.id, pendingTrainingSeriesId, trainingInstant) ?? false;
            if (ok) closeTrainingFlow();
          }}
        />
      )}

      {pendingAttestDriver && (
        <ErsatzattestConfirmModal
          driver={pendingAttestDriver}
          onClose={() => setPendingAttestDriverId(null)}
          onConfirm={() => {
            onGesundmelden?.(pendingAttestDriver.id);
            setPendingAttestDriverId(null);
          }}
        />
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KPICard label="Gesamt" value={stats.total} icon={<Users className="h-4 w-4" />} color="text-slate-300" />
        <KPICard label="Verfügbar" value={stats.verfuegbar} icon={<CheckCircle2 className="h-4 w-4" />} color="text-emerald-400" />
        <KPICard label="Im Einsatz" value={stats.imEinsatz} icon={<User className="h-4 w-4" />} color="text-sky-400" />
        <KPICard label="Nicht verfügbar" value={stats.nichtVerfuegbar} icon={<AlertCircle className="h-4 w-4" />} color="text-rose-400" />
      </div>

      <div className="fi-card overflow-x-auto">
        <table className="fi-table fi-mobile-card-table">
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
                <td colSpan={9} className="fi-mobile-empty-state py-8 text-center text-slate-500">
                  Kein Personal im Bestand
                </td>
              </tr>
            )}
            {drivers
              .filter((driver) => {
                if (roleFilter === 'all') return true;
                return (staffMeta[driver.id]?.role ?? inferRole(driver)) === roleFilter;
              })
              .map((driver) => {
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
              const daysLeft =
                meta?.trainingUntilTick != null && meta.trainingUntilTick > tick
                  ? Math.max(1, Math.ceil((meta.trainingUntilTick - tick) / TICKS_PER_DAY))
                  : 0;

              return (
                <tr key={driver.id}>
                  <td data-label="Name" className="fi-mobile-card-title">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-sm border border-slate-600 bg-slate-800 text-[10px] font-bold text-slate-400">
                        {driver.name
                          .split(' ')
                          .map((name) => name[0])
                          .join('')
                          .slice(0, 2)}
                      </span>
                      <span className="font-bold text-white">{driver.name}</span>
                    </div>
                  </td>
                  <td data-label="Status">
                    <span className={getDriverPillClass(driver.status)}>
                      <span className={`status-dot ${cfg.dot} ${driver.status === 'im_einsatz' ? 'animate-pulse' : ''}`} />
                      {statusLabel}
                    </span>
                  </td>
                  <td data-label="Qualifikationen">
                    <div className="flex flex-wrap gap-1">
                      {driver.qualifications.map((qualification) => (
                        <QualificationBadge key={qualification} qual={qualification} />
                      ))}
                      {(meta?.seriesIds ?? []).map((id) => (
                        <span key={id} className="series-badge">
                          {seriesLabel(id)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td data-label="48h" className={`font-bold tabular-nums ${hoursColor}`}>
                    {driver.hours_worked}/{driver.max_hours}h
                  </td>
                  <td data-label="Ruhezeit" className={`tabular-nums ${restOk ? 'text-slate-300' : 'font-bold text-rose-400'}`}>
                    {restHours}h{restOk ? '' : ' ⚠'}
                  </td>
                  <td data-label="Schicht" className="tabular-nums text-slate-300">{shiftHours !== null ? `${shiftHours}h` : '—'}</td>
                  <td data-label="Rang / Gehalt" className="text-[11px] text-slate-300">
                    {meta
                      ? `${meta.role === 'tf' ? 'Tf' : meta.role === 'azf' ? 'AZF/RB' : 'Wp'} ${meta.rank} · ${meta.xp ?? 0} XP · ${formatEuro(meta.salary)}`
                      : '—'}
                    {daysLeft > 0 && (
                      <span className="mt-1 flex items-center gap-1 font-semibold text-sky-300">
                        <Clock3 className="h-3 w-3" />
                        Schulung {daysLeft} T.{meta?.trainingSeriesId ? ` · ${seriesLabel(meta.trainingSeriesId)}` : ''}
                      </span>
                    )}
                  </td>
                  <td data-label="Telefon">
                    {driver.phone ? (
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <Phone className="h-2.5 w-2.5 text-slate-600" />
                        {driver.phone}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td data-label="Aktionen" className="fi-mobile-card-actions">
                    <div className="flex flex-wrap gap-1">
                      <button type="button" onClick={() => setDetailId(driver.id)} className="btn-action btn-action-detail">
                        <Info className="h-3 w-3" /> Details
                      </button>
                      {canTrain && (
                        <button type="button" onClick={() => setTrainDriverId(driver.id)} className="btn-action btn-action-dispo min-h-12">
                          <GraduationCap className="h-3 w-3" /> Schulung
                        </button>
                      )}
                      {onStartRankTraining && meta && meta.rank < 3 && meta.trainingUntilTick == null && (
                        <button type="button" className="btn-action btn-action-detail min-h-12" onClick={() => setDetailId(driver.id)}>
                          Stufe {meta.rank + 1}
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
          onRequestGesundmelden={
            onGesundmelden
              ? () => {
                  setDetailId(null);
                  setPendingAttestDriverId(detailDriver.id);
                }
              : undefined
          }
          onOpenTraining={
            onStartTraining && staffMeta[detailDriver.id]?.role === 'tf'
              ? () => {
                  setDetailId(null);
                  setTrainDriverId(detailDriver.id);
                }
              : undefined
          }
          onStartRankTraining={
            onStartRankTraining
              ? (instant) => {
                  const ok = onStartRankTraining(detailDriver.id, instant);
                  if (ok) setDetailId(null);
                }
              : undefined
          }
          balance={balance}
          overdraftLimit={overdraftLimit}
        />
      )}
    </SectionShell>
  );
}

function inferRole(driver: Driver): StaffRole {
  const blob = (driver.qualifications ?? []).join(' ').toLowerCase();
  if (blob.includes('wagenprüfer') || blob.includes('wagenpruefer')) return 'wagenpruefer';
  if (blob.includes('azf') || blob.includes('rangierbegleiter') || /\brb\b/.test(blob)) return 'azf';
  return 'tf';
}

function CandidateFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="personnel-fact-label">{label}</p>
      <p className="mt-0.5 text-[11px] font-medium text-slate-300">{value || '—'}</p>
    </div>
  );
}

function HireReviewModal({
  listing,
  locomotives,
  balance,
  overdraftLimit,
  onClose,
  onChoose,
}: {
  listing: JobListing;
  locomotives: Locomotive[];
  balance: number;
  overdraftLimit: number;
  onClose: () => void;
  onChoose: (mode: HireMode) => void;
}) {
  const fleetIds = fleetSeriesIds(locomotives);
  const isTf = listing.role === 'tf';
  const missing = isTf ? missingFleetSeries(listing.seriesIds, locomotives, listing.qualifications) : [];
  const quickPayFee = hireNachschulungFee(missing.length);
  const quickPayTotal = listing.hiringCost + quickPayFee;
  const baseAffordable = canSpend(balance, listing.hiringCost, overdraftLimit);
  const quickPayAffordable = canSpend(balance, quickPayTotal, overdraftLimit);
  const fit = isTf && fleetIds.length > 0 && missing.length === 0;

  return (
    <ModalShell title="Kandidat prüfen" onClose={onClose} labelledBy="hire-review-title">
      <div className="personnel-modal-profile">
        <div>
          <p className="text-sm font-bold text-white">{listing.personName}</p>
          <p className="mt-0.5 text-[11px] font-semibold text-amber-300">{listing.roleLabel}</p>
        </div>
        {fit && (
          <span className="personnel-fit personnel-fit--good">
            <CheckCircle2 className="h-3.5 w-3.5" /> Fuhrpark-Fit
          </span>
        )}
      </div>

      <div className="mt-4 space-y-3">
        <ModalFact label="Einstellungsgebühr" value={formatEuro(listing.hiringCost)} emphasis />
        <ModalFact label="Monatsgehalt" value={formatEuro(listing.salary)} />
        {isTf && (
          <div className="personnel-modal-block">
            <p className="personnel-fact-label">Vorhandene Baureihen-Freigaben</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {listing.seriesIds.map((id) => (
                <span key={id} className="series-badge">
                  {seriesLabel(id)}
                </span>
              ))}
            </div>
          </div>
        )}
        {missing.length > 0 && (
          <div className="personnel-modal-warning">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="text-xs font-bold">Fehlende Freigaben im eigenen Fuhrpark</p>
              <p className="mt-1 text-[11px] leading-relaxed text-amber-100/90">
                {missing.map((id) => seriesLabel(id)).join(', ')}
              </p>
            </div>
          </div>
        )}
        {isTf && fleetIds.length === 0 && (
          <p className="text-[11px] leading-relaxed text-slate-500">Ohne eigenen Fuhrpark ist noch kein Baureihen-Fit erforderlich.</p>
        )}
      </div>

      <div className="mt-5 border-t border-amber-500/15 pt-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Einstellungsweg wählen</p>
        <div className="mt-2 grid gap-2">
          <button
            type="button"
            className="personnel-choice-card"
            disabled={!baseAffordable}
            onClick={() => onChoose('standard')}
          >
            <span>
              <strong>Regulär einstellen</strong>
              <small>{missing.length > 0 ? 'Freigaben später einzeln schulen' : 'Kandidat passt zur aktuellen Auswahl'}</small>
            </span>
            <b>{formatEuro(listing.hiringCost)}</b>
          </button>
          {missing.length > 0 && (
            <button
              type="button"
              className="personnel-choice-card personnel-choice-card--quickpay"
              disabled={!quickPayAffordable}
              onClick={() => onChoose('quickpay')}
            >
              <span>
                <strong>Inkl. Quick-Pay-Nachschulung</strong>
                <small>{missing.length} fehlende {missing.length === 1 ? 'Klasse' : 'Klassen'} sofort freigeben</small>
              </span>
              <b>{formatEuro(quickPayTotal)}</b>
            </button>
          )}
        </div>
        {!baseAffordable && !quickPayAffordable && (
          <p className="mt-2 text-[11px] font-semibold text-rose-400">Für diese Einstellung reicht der verfügbare Rahmen nicht aus.</p>
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Abbrechen
        </Button>
      </div>
    </ModalShell>
  );
}

function HireCommitModal({
  listing,
  mode,
  locomotives,
  balance,
  overdraftLimit,
  onBack,
  onClose,
  onConfirm,
}: {
  listing: JobListing;
  mode: HireMode;
  locomotives: Locomotive[];
  balance: number;
  overdraftLimit: number;
  onBack: () => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const missing =
    listing.role === 'tf' ? missingFleetSeries(listing.seriesIds, locomotives, listing.qualifications) : [];
  const includesQuickPay = mode === 'quickpay' && missing.length > 0;
  const quickPayFee = includesQuickPay ? hireNachschulungFee(missing.length) : 0;
  const total = listing.hiringCost + quickPayFee;
  const affordable = canSpend(balance, total, overdraftLimit);

  return (
    <ModalShell title="Einstellung verbindlich bestätigen" onClose={onClose} labelledBy="hire-commit-title" elevated>
      <div className="personnel-confirm-heading">
        <Banknote className="h-5 w-5" />
        <div>
          <p className="text-sm font-bold text-white">{listing.personName} einstellen?</p>
          <p className="mt-0.5 text-[11px] text-slate-400">Diese Entscheidung bucht Kosten und entfernt den Kandidaten aus der heutigen Börse.</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <CostLine label="Einstellungsgebühr" value={listing.hiringCost} />
        {includesQuickPay && <CostLine label={`Quick-Pay · ${missing.length} Baureihen`} value={quickPayFee} />}
        <div className="flex items-center justify-between border-t border-amber-500/20 pt-2 text-sm font-bold text-white">
          <span>Einmalige Gesamtkosten</span>
          <span className="fi-gold">{formatEuro(total)}</span>
        </div>
      </div>
      <div className="mt-4 rounded-lg border border-sky-500/25 bg-sky-950/25 p-3 text-[11px] leading-relaxed text-sky-100">
        {includesQuickPay
          ? `Direkte Wirkung: ${listing.personName} wird eingestellt und erhält sofort die Freigaben für ${missing.map((id) => seriesLabel(id)).join(', ')}.`
          : `Direkte Wirkung: ${listing.personName} wird mit den vorhandenen Qualifikationen in den Dienstplan aufgenommen.`}
      </div>
      {!affordable && <p className="mt-3 text-[11px] font-semibold text-rose-400">Der verfügbare Rahmen reicht für diese Buchung nicht aus.</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onBack}>
          Zurück
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Abbrechen
        </Button>
        <Button disabled={!affordable} onClick={onConfirm}>
          Verbindlich einstellen
        </Button>
      </div>
    </ModalShell>
  );
}

function TrainingSelectionModal({
  driver,
  options,
  balance,
  overdraftLimit,
  onClose,
  onSelect,
}: {
  driver: Driver;
  options: string[];
  balance: number;
  overdraftLimit: number;
  onClose: () => void;
  onSelect: (seriesId: string) => void;
}) {
  return (
    <ModalShell title={`Baureihen-Schulung · ${driver.name}`} onClose={onClose} labelledBy="training-select-title">
      <p className="text-[11px] leading-relaxed text-slate-400">
        Wähle eine fehlende Baureihe aus dem eigenen Fuhrpark. Die reguläre Schulung bindet den Tf für die angegebene Dauer;
        die Buchung wird im nächsten Schritt separat bestätigt.
      </p>
      {options.length === 0 ? (
        <p className="mt-4 text-sm text-slate-300">Alle Baureihen im Bestand sind bereits freigegeben.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {options.map((seriesId) => {
            const quote = seriesTrainingQuote(seriesId);
            const affordable = canSpend(balance, quote.cost, overdraftLimit);
            return (
              <button
                key={seriesId}
                type="button"
                className="personnel-training-option"
                disabled={!affordable}
                onClick={() => onSelect(seriesId)}
              >
                <span>
                  <strong>{seriesLabel(seriesId)}</strong>
                  <small>
                    <Clock3 className="h-3 w-3" /> {quote.durationDays} {quote.durationDays === 1 ? 'Tag' : 'Tage'} nicht einsetzbar
                  </small>
                </span>
                <b>{formatEuro(quote.cost)}</b>
              </button>
            );
          })}
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Schließen
        </Button>
      </div>
    </ModalShell>
  );
}

function TrainingCommitModal({
  driver,
  seriesId,
  instant,
  balance,
  overdraftLimit,
  onBack,
  onClose,
  onToggleInstant,
  onConfirm,
}: {
  driver: Driver;
  seriesId: string;
  instant: boolean;
  balance: number;
  overdraftLimit: number;
  onBack: () => void;
  onClose: () => void;
  onToggleInstant: () => void;
  onConfirm: () => void;
}) {
  const wait = seriesTrainingQuote(seriesId);
  const quick = seriesQuickPayQuote(seriesId);
  const quote = instant ? quick : wait;
  const affordable = canSpend(balance, quote.cost, overdraftLimit);

  return (
    <ModalShell title="Nachschulung bestätigen" onClose={onClose} labelledBy="training-commit-title" elevated>
      <div className="personnel-confirm-heading">
        <GraduationCap className="h-5 w-5" />
        <div>
          <p className="text-sm font-bold text-white">{seriesLabel(seriesId)} freigeben?</p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {instant ? `Quick-Pay Sofortqualifikation für ${driver.name}.` : `Reguläre Nachschulung für ${driver.name}.`}
          </p>
        </div>
      </div>
      <button type="button" className="personnel-choice-card mt-3 min-h-12" onClick={onToggleInstant}>
        <span>
          <strong>{instant ? 'Quick-Pay aktiv' : 'Optional: Quick-Pay Sofort'}</strong>
          <small>
            {instant
              ? 'Freigabe sofort, ohne Ruhezeiten neu zu definieren'
              : `${wait.durationDays} ${wait.durationDays === 1 ? 'Tag' : 'Tage'} gebunden, günstiger`}
          </small>
        </span>
        <b>{formatEuro(quick.cost)}</b>
      </button>
      <div className="mt-4 space-y-2">
        <CostLine label={instant ? 'Quick-Pay' : 'Schulungskosten'} value={quote.cost} />
        <div className="flex items-center justify-between text-xs text-slate-300">
          <span>Dauer</span>
          <span className="font-semibold text-amber-300">
            {instant ? 'Sofort' : `${quote.durationDays} ${quote.durationDays === 1 ? 'Tag' : 'Tage'}`}
          </span>
        </div>
      </div>
      {!affordable && <p className="mt-3 text-[11px] font-semibold text-rose-400">Der verfügbare Rahmen reicht für diese Schulung nicht aus.</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onBack}>
          Zurück
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Abbrechen
        </Button>
        <Button disabled={!affordable} onClick={onConfirm}>
          {instant ? 'Sofort freigeben' : 'Schulung verbindlich starten'}
        </Button>
      </div>
    </ModalShell>
  );
}

function ModalShell({
  title,
  children,
  onClose,
  labelledBy,
  elevated = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  labelledBy: string;
  elevated?: boolean;
}) {
  return (
    <div className={`modal-scrim fixed inset-0 ${elevated ? 'z-[76]' : 'z-[70]'} flex items-center justify-center p-4`} onClick={onClose}>
      <section
        className="app-glass w-full max-w-md rounded-xl border-amber-500/30 p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        <div className="flex items-center justify-between gap-3">
          <h3 id={labelledBy} className="text-sm font-bold text-white">
            {title}
          </h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-white/5 hover:text-white" aria-label="Dialog schließen">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function ModalFact({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-slate-400">{label}</span>
      <span className={emphasis ? 'fi-gold font-bold' : 'font-semibold text-slate-200'}>{value}</span>
    </div>
  );
}

function CostLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-xs text-slate-300">
      <span>{label}</span>
      <span className="font-semibold">{formatEuro(value)}</span>
    </div>
  );
}

function ErsatzattestConfirmModal({
  driver,
  onClose,
  onConfirm,
}: {
  driver: Driver;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalShell title="Ersatzattest bestätigen" onClose={onClose} labelledBy="ersatzattest-confirm-title" elevated>
      <div className="personnel-confirm-heading">
        <Stethoscope className="h-5 w-5" />
        <div>
          <p className="text-sm font-bold text-white">{driver.name} gesundmelden?</p>
          <p className="mt-0.5 text-[11px] text-slate-400">Diese Statusänderung ist nur für einen kurzfristigen Ersatz attestiert.</p>
        </div>
      </div>
      <div className="mt-4 rounded-lg border border-emerald-500/25 bg-emerald-950/25 p-3 text-[11px] leading-relaxed text-emerald-100">
        Direkte Wirkung: Der Tf wird wieder als verfügbar geführt. Ruhezeit und Schichtbeginn werden auf den aktuellen Spielzeitpunkt zurückgesetzt.
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Abbrechen
        </Button>
        <Button onClick={onConfirm}>Status verbindlich ändern</Button>
      </div>
    </ModalShell>
  );
}

function DriverDetailModal({
  driver,
  meta,
  locomotives,
  gameNow,
  onClose,
  onRequestGesundmelden,
  onOpenTraining,
  onStartRankTraining,
  balance = 0,
  overdraftLimit = 0,
}: {
  driver: Driver;
  meta?: StaffMeta;
  locomotives: Locomotive[];
  gameNow: Date;
  onClose: () => void;
  onRequestGesundmelden?: () => void;
  onOpenTraining?: () => void;
  onStartRankTraining?: (instant: boolean) => void;
  balance?: number;
  overdraftLimit?: number;
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
      <section className="fi-card w-full max-w-md" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="driver-detail-title">
        <div className="fi-card-header flex items-center justify-between">
          <span id="driver-detail-title" className="flex items-center gap-2">
            <User className="h-3.5 w-3.5 text-amber-500" />
            {driver.name}
          </span>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-white" aria-label="Personalakte schließen">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <span className={getDriverPillClass(driver.status)}>
              <span className={`status-dot ${cfg.dot}`} />
              {statusLabel}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailRow label="Wochenstunden" value={`${driver.hours_worked}/${driver.max_hours} h`} />
            <DetailRow label="Ruhezeit" value={`${restHours}h her${restOk ? '' : ' (!)'}`} />
            <DetailRow label="Schicht" value={shiftHours !== null ? `seit ${shiftHours}h` : '—'} />
            <DetailRow label="Telefon" value={driver.phone ?? '—'} />
            <DetailRow label="Erfahrung" value={`${xp} XP · Stufe ${rank}`} />
            <DetailRow label="Effizienz" value={`+${staffEfficiencyPct(xp, rank).toLocaleString('de-DE')} % Fahrplan`} />
          </div>
          <p className="text-[11px] text-slate-400">{progress.label}</p>
          <div>
            <div className="text-[10px] font-bold uppercase text-slate-500">Qualifikationen</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {driver.qualifications.map((qualification) => (
                <QualificationBadge key={qualification} qual={qualification} />
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
                <p className="mt-1 text-[11px] text-amber-300">Offen im Fuhrpark: {missing.map((id) => seriesLabel(id)).join(', ')}</p>
              )}
            </div>
          )}
          {onOpenTraining && meta?.role === 'tf' && missing.length > 0 && meta.trainingUntilTick == null && (
            <Button className="min-h-12 w-full" onClick={onOpenTraining}>
              <GraduationCap className="h-3.5 w-3.5" /> Schulung prüfen
            </Button>
          )}
          {onStartRankTraining && meta && meta.rank < 3 && meta.trainingUntilTick == null && (() => {
            const quote = nextRankTraining(meta.rank);
            const quick = rankQuickPayCost(meta.rank);
            if (!quote || quick == null) return null;
            const canWait = canSpend(balance, quote.cost, overdraftLimit);
            const canQuick = canSpend(balance, quick, overdraftLimit);
            return (
              <div className="grid gap-2">
                <Button className="min-h-12 w-full" disabled={!canWait} onClick={() => onStartRankTraining(false)}>
                  Stufe {quote.nextRank} · {formatEuro(quote.cost)} · {quote.durationDays} Tag
                </Button>
                <Button className="min-h-12 w-full" disabled={!canQuick} onClick={() => onStartRankTraining(true)}>
                  Quick-Pay Stufe {quote.nextRank} · {formatEuro(quick)}
                </Button>
              </div>
            );
          })()}
          {showErsatzattest && (
            <button
              type="button"
              onClick={onRequestGesundmelden}
              className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-emerald-600 bg-emerald-900/30 px-3 py-2 text-xs font-bold uppercase text-emerald-300 hover:bg-emerald-800/50"
            >
              <Stethoscope className="h-3.5 w-3.5" />
              Kurzfristig gesundmelden (Ersatzattest)
            </button>
          )}
        </div>
      </section>
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
