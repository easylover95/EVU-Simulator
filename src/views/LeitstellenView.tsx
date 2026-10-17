import { Suspense, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Briefcase, Clock3, MapPin, Pause, Play, Radio, Train, Users } from 'lucide-react';
import { TrackingMapSurface } from '@/components/TrackingMapSurface';
import type { WorldEventState } from '@/lib/events';
import { CLOCK_SPEEDS, formatGameDateTime, type ClockSpeed } from '@/lib/gameTime';
import {
  buildDutyDrivers,
  buildRollingStock,
  buildTrainRuns,
  formatDelayHours,
  openIncidents,
  type DutyDriver,
  type Incident,
  type TrainRun,
} from '@/lib/leitstelle';
import type { NetworkStatus } from '@/lib/networkStatus';
import {
  careerFullTitle,
  rankDef,
  type DispatcherCareer,
} from '@/lib/dispatcherCareer';
import {
  SHIFT_WINDOWS,
  formatShiftHours,
  handoverIncomingKind,
  isHandoverWindow,
  scheduledShiftAt,
  type ActiveShift,
} from '@/lib/shifts';
import type { AssignmentWithDetails, Company, Driver, Locomotive, Wagon } from '@/lib/supabase';
import { formatEuro } from '@/lib/status';

export interface LeitstellenViewProps {
  company: Company | null;
  assignments: AssignmentWithDetails[];
  locomotives: Locomotive[];
  drivers: Driver[];
  wagons: Wagon[];
  tick: number;
  gameNow: Date;
  worldEvents: WorldEventState;
  incidents: Incident[];
  networkStatus?: NetworkStatus;
  activeShift: ActiveShift | null;
  career: DispatcherCareer;
  clockRunning: boolean;
  clockSpeed: ClockSpeed;
  onSetClockRunning: (running: boolean) => void;
  onSetClockSpeed: (speed: ClockSpeed) => void;
  onRequestLogin: () => void;
  onEndShift: () => void;
  onResolveIncident: (incidentId: string, optionId: string) => void;
  onOpenOffice: (view: 'auftragsmarkt' | 'disposition' | 'bank' | 'werkstatt') => void;
}

function severityClass(severity: Incident['severity']): string {
  if (severity === 'critical') return 'border-rose-500/50 bg-rose-950/40 text-rose-100';
  if (severity === 'warn') return 'border-amber-500/40 bg-amber-950/30 text-amber-100';
  return 'border-slate-600/50 bg-slate-900/40 text-slate-200';
}

function runStatusLabel(status: TrainRun['status']): string {
  switch (status) {
    case 'geplant':
      return 'Geplant';
    case 'unterwegs':
      return 'Unterwegs';
    case 'halt':
      return 'Halt';
    case 'gestoert':
      return 'Gestört';
    case 'ankunft':
      return 'Ankunft';
    case 'abgebrochen':
      return 'Abgebrochen';
    default:
      return status;
  }
}

export function LeitstellenView({
  company,
  assignments,
  locomotives,
  drivers,
  wagons,
  tick,
  gameNow,
  worldEvents,
  incidents,
  networkStatus = 'online',
  activeShift,
  career,
  clockRunning,
  clockSpeed,
  onSetClockRunning,
  onSetClockSpeed,
  onRequestLogin,
  onEndShift,
  onResolveIncident,
  onOpenOffice,
}: LeitstellenViewProps) {
  const trainRuns = useMemo(() => buildTrainRuns(assignments, tick, incidents), [assignments, tick, incidents]);
  const dutyDrivers = useMemo(
    () => buildDutyDrivers(drivers, trainRuns, company?.hq_location?.trim() || 'Duisburg'),
    [drivers, trainRuns, company?.hq_location],
  );
  const rollingStock = useMemo(
    () => buildRollingStock(locomotives, trainRuns, company?.hq_location?.trim() || 'Duisburg'),
    [locomotives, trainRuns, company?.hq_location],
  );
  const queue = useMemo(() => openIncidents({ incidents }), [incidents]);
  const closures = worldEvents.closures ?? [];

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [mapSelectedId, setMapSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedIncidentId && queue.some((i) => i.id === selectedIncidentId)) return;
    if (queue[0]) setSelectedIncidentId(queue[0].id);
    else setSelectedIncidentId(null);
  }, [queue, selectedIncidentId]);

  useEffect(() => {
    const fromIncident = queue.find((i) => i.id === selectedIncidentId)?.affectedTrainRunId;
    if (fromIncident) {
      setSelectedRunId(fromIncident);
      setMapSelectedId(fromIncident);
      return;
    }
    if (selectedRunId && trainRuns.some((r) => r.id === selectedRunId)) return;
    const firstLive = trainRuns.find((r) => r.status === 'unterwegs' || r.status === 'gestoert' || r.status === 'geplant');
    setSelectedRunId(firstLive?.id ?? trainRuns[0]?.id ?? null);
  }, [queue, selectedIncidentId, selectedRunId, trainRuns]);

  const selectedRun = trainRuns.find((r) => r.id === selectedRunId) ?? null;
  const selectedIncident = queue.find((i) => i.id === selectedIncidentId) ?? null;
  const selectedDriver: DutyDriver | null = selectedRun?.driverId
    ? dutyDrivers.find((d) => d.id === selectedRun.driverId) ?? null
    : null;
  const selectedStock = selectedRun
    ? rollingStock.find((r) => r.id === selectedRun.locoId) ?? null
    : null;
  const selectedAssignment = selectedRun
    ? assignments.find((a) => a.id === selectedRun.assignmentId) ?? null
    : null;

  const criticalCount = trainRuns.filter((r) => r.status === 'gestoert' || r.delayMinutes >= 60).length;
  const openOrders = assignments.filter((a) => a.status === 'aktiv' || a.status === 'geplant').length;

  function handleMapSelect(id: string | null) {
    setMapSelectedId(id);
    if (!id) return;
    if (id.startsWith('loco:')) {
      const locoId = id.slice('loco:'.length);
      const run = trainRuns.find((r) => r.locoId === locoId);
      if (run) setSelectedRunId(run.id);
      return;
    }
    if (trainRuns.some((r) => r.id === id)) setSelectedRunId(id);
  }

  const onDuty = Boolean(activeShift?.active);
  const scheduled = scheduledShiftAt(gameNow);
  const handover = isHandoverWindow(gameNow);
  const incoming = handoverIncomingKind(gameNow);
  const dutyKind = onDuty ? activeShift!.kind : scheduled;
  const dutyWin = SHIFT_WINDOWS[dutyKind];
  const rank = rankDef(career.rank);
  const activeTrainCount = assignments.filter((a) => a.status === 'aktiv' || a.status === 'geplant').length;
  const atTrainCap = activeTrainCount >= rank.maxConcurrentTrains;

  return (
    <div className="leitstelle-shell flex min-h-[calc(100vh-9.5rem)] flex-col gap-3 lg:min-h-[calc(100vh-8.5rem)]">
      <div className="flex flex-wrap items-end justify-between gap-2 px-0.5">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-100">Leitstelle</h2>
          <p className="text-xs text-slate-400">
            {careerFullTitle(career)} · {formatGameDateTime(gameNow)} · {dutyWin.label} (
            {formatShiftHours(dutyKind)})
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="btn-ghost-sm" onClick={() => onOpenOffice('auftragsmarkt')}>
            <Briefcase className="h-3 w-3" />
            Büro / Markt
          </button>
          <button type="button" className="btn-ghost-sm" onClick={() => onOpenOffice('disposition')}>
            Disposition
          </button>
        </div>
      </div>

      {handover && (
        <div className="flex items-start gap-2 rounded-md border border-sky-400/35 bg-sky-950/35 px-3 py-2 text-xs text-sky-100">
          <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" />
          <div>
            <strong className="font-bold">Schichtübergabe aktiv</strong>
            <span className="text-sky-100/80">
              {' '}
              — Ablöser ({incoming ? SHIFT_WINDOWS[incoming].label : 'Folgeschicht'}) ist im Dienst
              (1 h Überlappung).
            </span>
          </div>
        </div>
      )}

      <div className="leitstelle-split grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(280px,30%)_minmax(0,70%)]">
        {/* Dispo-Terminal 30% */}
        <aside className="fi-card flex min-h-[420px] flex-col overflow-hidden lg:min-h-0">
          <div className="fi-card-header flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <Radio className="h-3.5 w-3.5 text-amber-400" />
              Dispo-Terminal
            </span>
            <span className="fi-tick text-[10px] font-bold tabular-nums">{queue.length} offen</span>
          </div>

          <div className="space-y-2 border-b border-slate-700/60 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
                <Clock3 className="h-3.5 w-3.5 text-amber-400" />
                {onDuty ? (
                  <span>
                    Im Dienst · <strong className="text-amber-200">{dutyWin.short}</strong>
                  </span>
                ) : (
                  <span className="text-slate-400">Außer Dienst</span>
                )}
              </div>
              {onDuty ? (
                <button type="button" className="btn-ghost-sm" onClick={onEndShift}>
                  Schichtübergabe durchführen
                </button>
              ) : (
                <button type="button" className="btn-gold-sm" onClick={onRequestLogin}>
                  Dienst antreten
                </button>
              )}
            </div>
            {atTrainCap && career.rank < 3 && (
              <p className="text-[10px] text-amber-300/90">
                Rang-Limit: max. {rank.maxConcurrentTrains} Züge gleichzeitig ({activeTrainCount}/
                {rank.maxConcurrentTrains}).
              </p>
            )}
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                title="Pause"
                onClick={() => onSetClockRunning(false)}
                className={`app-topbar-ctrl ${!clockRunning ? 'is-on is-pause' : ''}`}
              >
                <Pause className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Play"
                onClick={() => onSetClockRunning(true)}
                className={`app-topbar-ctrl ${clockRunning ? 'is-on is-play' : ''}`}
                disabled={!onDuty}
              >
                <Play className="h-3.5 w-3.5" />
              </button>
              {CLOCK_SPEEDS.map((speed) => (
                <button
                  key={speed}
                  type="button"
                  onClick={() => onSetClockSpeed(speed)}
                  className={`app-topbar-ctrl text-[10px] font-bold ${clockSpeed === speed ? 'is-on' : ''}`}
                  disabled={!onDuty}
                >
                  {speed}x
                </button>
              ))}
            </div>
            {!onDuty && (
              <p className="text-[10px] leading-relaxed text-slate-500">
                Erst Dienst antreten — dann läuft die Simulation für diese Schicht.
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-1.5 border-b border-slate-700/60 px-3 py-2 text-center">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Kapital</div>
              <div className="text-xs font-bold tabular-nums text-emerald-300">
                {formatEuro(company?.balance ?? 0)}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Züge</div>
              <div className="text-xs font-bold tabular-nums text-slate-200">{openOrders}</div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Kritisch</div>
              <div className={`text-xs font-bold tabular-nums ${criticalCount > 0 ? 'text-rose-300' : 'text-slate-200'}`}>
                {criticalCount}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            <section>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Störungen</div>
              {queue.length === 0 ? (
                <p className="rounded-md border border-slate-700/50 bg-slate-950/40 px-3 py-2 text-xs text-slate-400">
                  Alles ruhig — keine offenen Störungen.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {queue.slice(0, 5).map((inc) => (
                    <li key={inc.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedIncidentId(inc.id);
                          if (inc.affectedTrainRunId) {
                            setSelectedRunId(inc.affectedTrainRunId);
                            setMapSelectedId(inc.affectedTrainRunId);
                          }
                        }}
                        className={`w-full rounded-md border px-2.5 py-2 text-left transition ${severityClass(inc.severity)} ${
                          selectedIncidentId === inc.id ? 'ring-1 ring-amber-400/70' : ''
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <div className="min-w-0">
                            <div className="truncate text-xs font-bold">{inc.title}</div>
                            <div className="text-[10px] opacity-80">
                              {inc.type === 'sperrung' ? 'Streckensperrung' : inc.type}
                            </div>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Ausgewählter Zug</div>
              {!selectedRun ? (
                <p className="text-xs text-slate-500">Kein Zug aktiv. Auftrag in der Disposition starten.</p>
              ) : (
                <div className="space-y-2 rounded-md border border-slate-700/60 bg-slate-950/40 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-slate-100">{selectedRun.label}</div>
                      <div className="truncate text-[11px] text-slate-400">
                        {selectedAssignment?.order?.origin ?? '—'} → {selectedAssignment?.order?.destination ?? '—'}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                        selectedRun.status === 'gestoert'
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-slate-700/60 text-slate-300'
                      }`}
                    >
                      {runStatusLabel(selectedRun.status)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <div className="text-slate-500">Soll</div>
                      <div className="font-bold tabular-nums text-slate-200">Tick {selectedRun.plannedArrivalTick}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Ist-ETA</div>
                      <div className="font-bold tabular-nums text-slate-200">Tick {selectedRun.actualEtaTick}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Verspätung</div>
                      <div
                        className={`font-bold tabular-nums ${
                          selectedRun.delayMinutes > 0 ? 'text-amber-300' : 'text-emerald-300'
                        }`}
                      >
                        {formatDelayHours(selectedRun.delayMinutes)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Fracht</div>
                      <div className="truncate font-bold text-slate-200">
                        {selectedRun.cargo.tons} t · {selectedRun.cargo.goodsType}
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-slate-700/50 pt-2 text-[11px] text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <Train className="h-3 w-3 text-amber-400/80" />
                      <span className="text-slate-300">
                        {selectedStock?.classId ?? 'Lok'} · {selectedStock?.conditionPct ?? '—'} %
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <MapPin className="h-3 w-3 text-sky-400/80" />
                      <span className="text-slate-300">
                        {selectedDriver?.name ?? 'Kein Tf'}
                        {selectedDriver
                          ? ` · ${Math.round(selectedDriver.remainingDutyMinutes / 60)} h Rest`
                          : ''}
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-amber-400/90 transition-all"
                      style={{ width: `${Math.round(selectedRun.progress01 * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </section>

            {selectedIncident && (
              <section>
                <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Aktion</div>
                <div className="space-y-1.5">
                  {selectedIncident.options.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className="btn-gold-sm w-full justify-center text-left"
                      onClick={() => onResolveIncident(selectedIncident.id, opt.id)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>

          <div className="flex gap-1 border-t border-slate-700/60 p-2">
            <button type="button" className="btn-ghost-sm flex-1" onClick={() => onOpenOffice('bank')}>
              Bank
            </button>
            <button type="button" className="btn-ghost-sm flex-1" onClick={() => onOpenOffice('werkstatt')}>
              Werkstatt
            </button>
          </div>
        </aside>

        {/* Netzkarte 70% */}
        <section className="fi-card flex min-h-[380px] flex-col overflow-hidden lg:min-h-0">
          <div className="fi-card-header flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Train className="h-3.5 w-3.5 text-sky-400" />
              Netzkarte — eigene Flotte
            </span>
            <span className="fi-tick text-[10px] font-bold tabular-nums">
              {closures.filter((c) => c.untilTick > tick).length} Sperrungen
            </span>
          </div>
          <div className="relative min-h-0 flex-1">
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-xs text-slate-500">Karte wird geladen…</div>
              }
            >
              <TrackingMapSurface
                networkStatus={networkStatus}
                assignments={assignments}
                wagons={wagons}
                tick={tick}
                locomotives={locomotives}
                hqLocation={company?.hq_location}
                selectedId={mapSelectedId}
                onSelect={handleMapSelect}
                onOpenTrainDispatch={(assignmentId) => {
                  setSelectedRunId(assignmentId);
                  setMapSelectedId(assignmentId);
                  const hit = queue.find((i) => i.assignmentId === assignmentId);
                  if (hit) setSelectedIncidentId(hit.id);
                }}
                closures={closures}
                highlightClosureIds={
                  selectedIncident?.closureId ? [selectedIncident.closureId] : queue.map((i) => i.closureId).filter(Boolean) as string[]
                }
                variant="fill"
              />
            </Suspense>
          </div>
        </section>
      </div>
    </div>
  );
}
