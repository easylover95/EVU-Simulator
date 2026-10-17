import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Briefcase,
  Clock3,
  Menu,
  Pause,
  Play,
  Radio,
  Settings,
  Train,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import {
  applyShiftCareer,
  buildPayroll,
  careerTitle,
  gradeFromStats,
  promoProgressLabel,
  RANK_META,
  shiftBaseWage,
  SHIFTS_PER_MONTH,
} from '@/vectra/career';
import { CorridorMap } from '@/vectra/components/CorridorMap';
import {
  ensureDriversHaveVoices,
  formatGsmrStatus,
  playRingTone,
  speakGsmr,
  stopSpeech,
  type GsmrLinkStatus,
} from '@/vectra/gsmr';
import { employerById, type Employer } from '@/vectra/employers';
import { createSeedDrivers, createSeedLocos, createSeedTrains, scaleFleetForRank } from '@/vectra/seed';
import type { GameSettings, GameState, SaveGame } from '@/vectra/saveGame';
import {
  computeShiftEndMin,
  formatClock,
  formatHm,
  isHandoverWindow,
  nextShift,
  scheduledShiftAt,
  SHIFT_ORDER,
  SHIFT_WINDOWS,
  shiftHoursLabel,
  startMinuteForShift,
} from '@/vectra/shifts';
import {
  advanceSimulation,
  computePunctuality,
  emptyStats,
  resolveIncidentChoice,
} from '@/vectra/simulation';
import type {
  AppScreen,
  CareerState,
  ClockSpeed,
  HandoverNote,
  Incident,
  LogEntry,
  ShiftKind,
  ShiftReport,
  ShiftState,
  TrainRun,
} from '@/vectra/types';
import { DRIVER_STATUS_LABEL, LOCO_STATUS_LABEL, TRAIN_STATUS_LABEL } from '@/vectra/types';
import '@/vectra/vectra.css';

const SPEEDS: ClockSpeed[] = [0, 1, 2, 5];

type AtmosphereTheme = 'desk' | 'leitstelle' | 'fleet';

function euro(n: number): string {
  return `${Math.round(n).toLocaleString('de-DE')} €`;
}

function Atmosphere({ theme }: { theme: AtmosphereTheme }) {
  return (
    <div className="vr-atmosphere" aria-hidden>
      <div className={`vr-atmosphere-photo vr-atmosphere-photo--${theme}`} />
      <div className="vr-atmosphere-veil" />
    </div>
  );
}

function createWorld(hqCity: string, rank: 1 | 2 | 3 = 1) {
  const seedDrivers = createSeedDrivers();
  const seedLocos = createSeedLocos(hqCity);
  const seedTrains = createSeedTrains(seedDrivers, seedLocos, rank);
  return { seedDrivers, seedLocos, seedTrains };
}

function hydrateFromSave(save: SaveGame) {
  const brand = employerById(save.employerId);
  if (save.locos.length > 0 && save.drivers.length > 0 && save.trains.length > 0) {
    return {
      brand,
      career: save.career,
      locos: save.locos,
      drivers: save.drivers.map((d) => ({
        ...d,
        gender: d.gender === 'female' ? ('female' as const) : ('male' as const),
        ttsVoiceId: typeof d.ttsVoiceId === 'string' ? d.ttsVoiceId : null,
      })),
      trains: save.trains,
      handoverBook: save.handoverBook,
      logEntries: save.logEntries,
      inGameMinutes: save.inGameMinutes,
    };
  }
  const world = createWorld(brand.hqCity, save.career.rank);
  return {
    brand,
    career: save.career,
    locos: world.seedLocos,
    drivers: world.seedDrivers,
    trains: world.seedTrains,
    handoverBook: save.handoverBook,
    logEntries: save.logEntries,
    inGameMinutes: save.inGameMinutes,
  };
}

export interface VectraAppProps {
  save: SaveGame;
  settings: GameSettings;
  phase: Extract<GameState, 'SHIFT_BRIEFING' | 'ACTIVE_SHIFT' | 'SHIFT_SUMMARY'>;
  onPhaseChange: (phase: GameState) => void;
  onPersist: (save: SaveGame) => void;
  onQuitToMainMenu: (save: SaveGame) => void;
  onSettingsChange: (settings: GameSettings) => void;
}

export function VectraApp({
  save,
  settings,
  phase,
  onPhaseChange,
  onPersist,
  onQuitToMainMenu,
  onSettingsChange,
}: VectraAppProps) {
  const boot = useRef(hydrateFromSave(save)).current;
  const [screen, setScreen] = useState<AppScreen>(() =>
    phase === 'ACTIVE_SHIFT' ? 'leitstelle' : 'briefing',
  );
  const [employer] = useState<Employer>(() => boot.brand);
  const [career, setCareer] = useState<CareerState>(() => boot.career);

  const [locos, setLocos] = useState(() => boot.locos);
  const [drivers, setDrivers] = useState(() => boot.drivers);
  const [trains, setTrains] = useState<TrainRun[]>(() => boot.trains);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [activeCall, setActiveCall] = useState<Incident | null>(null);
  const [radioLink, setRadioLink] = useState<GsmrLinkStatus>('idle');
  const [radioDriverName, setRadioDriverName] = useState('');
  const [selectedTrainId, setSelectedTrainId] = useState<string | null>(null);
  const [terminalTab, setTerminalTab] = useState<'inbox' | 'tf' | 'zuege'>('inbox');
  const [briefingKind, setBriefingKind] = useState<ShiftKind>(() => save.lastShiftKind ?? 'frueh');
  const [handoverBook, setHandoverBook] = useState<HandoverNote[]>(() => boot.handoverBook);
  const [report, setReport] = useState<ShiftReport | null>(null);
  const [nameDraft, setNameDraft] = useState(() => boot.career.displayName);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [shift, setShift] = useState<ShiftState>(() => ({
    currentShift: null,
    onDuty: false,
    inGameMinutes: boot.inGameMinutes,
    punctualityPct: 100,
    emergencyBudget: RANK_META[boot.career.rank].budget,
    logEntries: boot.logEntries,
    speed: 0,
    shiftStartedAtMin: null,
    stats: emptyStats(),
  }));

  const shiftEndRef = useRef<number | null>(null);
  const careerRef = useRef(career);
  const trainsRef = useRef(trains);
  const driversRef = useRef(drivers);
  const locosRef = useRef(locos);
  const incidentsRef = useRef(incidents);
  const shiftRef = useRef(shift);
  careerRef.current = career;
  trainsRef.current = trains;
  driversRef.current = drivers;
  locosRef.current = locos;
  incidentsRef.current = incidents;
  shiftRef.current = shift;

  useEffect(() => {
    setDrivers((prev) => ensureDriversHaveVoices(prev));
  }, []);

  const openIncidents = useMemo(() => incidents.filter((i) => !i.resolved), [incidents]);
  const handover = isHandoverWindow(shift.inGameMinutes);
  const onDuty = shift.onDuty && shift.currentShift;

  useEffect(() => {
    if (!shift.onDuty || shift.speed === 0) return;
    const id = window.setInterval(() => {
      const s = shiftRef.current;
      if (!s.onDuty || s.speed === 0) return;
      const delta = s.speed; // game minutes per real second
      const nextMin = s.inGameMinutes + delta;
      const openCount = incidentsRef.current.filter((i) => !i.resolved).length;
      const tick = advanceSimulation(
        trainsRef.current,
        driversRef.current,
        locosRef.current,
        delta,
        openCount,
        nextMin,
        careerRef.current.rank,
      );
      setTrains(tick.trains);
      setDrivers(tick.drivers);
      setLocos(tick.locos);

      let logs = s.logEntries;
      if (tick.log) logs = [tick.log, ...logs].slice(0, 40);

      if (tick.newIncident) {
        setIncidents((prev) => [tick.newIncident!, ...prev]);
        setActiveCall(tick.newIncident);
        setTerminalTab('inbox');
        playRingTone();
        const caller = tick.drivers.find((d) => d.name === tick.newIncident!.driverName);
        const tfName = tick.newIncident.driverName;
        setRadioDriverName(tfName);
        speakGsmr(tick.newIncident.messageText, undefined, undefined, {
          gender: caller?.gender ?? 'male',
          voiceId: caller?.ttsVoiceId ?? null,
          driverName: tfName,
          onStatus: setRadioLink,
        });
        const gsmrLog: LogEntry = {
          id: `log-${Date.now()}`,
          atMin: nextMin,
          text: `GSM-R: ${tick.newIncident.driverName}`,
          tone: 'warn',
        };
        logs = [gsmrLog, ...logs].slice(0, 40);
      }

      const punct = computePunctuality(tick.trains);
      setShift((prev) => ({
        ...prev,
        inGameMinutes: nextMin,
        punctualityPct: punct,
        logEntries: logs,
      }));

      if (shiftEndRef.current != null && nextMin >= shiftEndRef.current) {
        endCurrentShift(tick.trains, punct, s);
      }
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift.onDuty, shift.speed]);

  function openBriefing() {
    setBriefingKind(scheduledShiftAt(shift.inGameMinutes));
    setNameDraft(career.displayName);
    setScreen('briefing');
  }

  function startDuty(kind: ShiftKind) {
    const name = nameDraft.trim() || career.displayName.trim();
    if (!name) return;
    stopSpeech();
    const startMin = Math.max(shift.inGameMinutes, startMinuteForShift(kind, shift.inGameMinutes));
    shiftEndRef.current = computeShiftEndMin(startMin, kind);
    const meta = RANK_META[career.rank];
    const budget = meta.budget;
    const scaled = scaleFleetForRank(trains, drivers, locos, career.rank);
    setTrains(scaled.trains);
    setDrivers(scaled.drivers);
    setLocos(scaled.locos);
    setCareer((c) => ({ ...c, displayName: name }));
    setShift((prev) => ({
      ...prev,
      currentShift: kind,
      onDuty: true,
      inGameMinutes: startMin,
      emergencyBudget: budget,
      speed: settings.defaultSpeed === 0 ? 1 : settings.defaultSpeed,
      shiftStartedAtMin: startMin,
      stats: emptyStats(),
      punctualityPct: computePunctuality(scaled.trains),
      logEntries: [
        {
          id: `log-start-${Date.now()}`,
          atMin: startMin,
          text: `${SHIFT_WINDOWS[kind].label} angetreten — ${meta.label}, ${meta.maxTrains} Züge, Budget ${euro(budget)}`,
          tone: 'ok',
        },
      ],
    }));
    setScreen('leitstelle');
    setActiveCall(null);
    onPhaseChange('ACTIVE_SHIFT');
  }

  function endCurrentShift(liveTrains = trainsRef.current, punct?: number, liveShift = shiftRef.current) {
    if (!liveShift.currentShift || !liveShift.onDuty) return;
    stopSpeech();
    shiftEndRef.current = null;
    const punctNow = punct ?? computePunctuality(liveTrains);
    const openCritical = liveTrains.filter(
      (t) => t.status === 'gestoert' || t.delayMinutes >= 15,
    ).length;
    const { grade, reason } = gradeFromStats(punctNow, liveShift.stats, openCritical);
    const careerNow = careerRef.current;
    const pay = buildPayroll(careerNow, punctNow, grade, liveShift.stats);
    const notes: HandoverNote[] = liveTrains
      .filter((t) => t.status === 'unterwegs' || t.status === 'halt' || t.status === 'gestoert')
      .map((t) => ({
        trainNumber: t.trainNumber,
        note:
          t.status === 'gestoert'
            ? 'Störung offen'
            : t.delayMinutes > 5
              ? `Verspätung +${Math.round(t.delayMinutes)} Min.`
              : 'Unterwegs',
        delayMinutes: t.delayMinutes,
      }));
    setHandoverBook(notes);

    const rankBefore = careerNow.rank;
    const draft: ShiftReport = {
      shift: liveShift.currentShift,
      grade,
      gradeReason: reason,
      punctualityPct: punctNow,
      wageTotal: pay.wageTotal,
      wageBase: pay.wageBase,
      punctualityBonus: pay.punctualityBonus,
      incidentsResolved: liveShift.stats.incidentsResolved,
      lenkzeitAverted: liveShift.stats.lenkzeitAverted,
      totalDelayMinutes: Math.round(
        liveTrains.reduce((s, t) => s + t.delayMinutes, 0) + liveShift.stats.totalDelayAdded,
      ),
      expGained: pay.expGained,
      rankProgress: '',
      rankBefore,
      rankAfter: rankBefore,
      promoted: false,
      handoverNotes: notes,
      nextShift: nextShift(liveShift.currentShift),
    };
    const nextCareer = applyShiftCareer(careerNow, draft);
    draft.rankAfter = nextCareer.rank;
    draft.promoted = nextCareer.rank > rankBefore;
    draft.rankProgress = promoProgressLabel(nextCareer);
    careerRef.current = nextCareer;
    setCareer(nextCareer);
    if (nextCareer.rank > rankBefore) {
      const scaled = scaleFleetForRank(liveTrains, driversRef.current, locosRef.current, nextCareer.rank);
      setTrains(scaled.trains);
      setDrivers(scaled.drivers);
      setLocos(scaled.locos);
    }
    setShift((prev) => ({ ...prev, onDuty: false, speed: 0 }));
    setReport(draft);
    onPhaseChange('SHIFT_SUMMARY');
  }

  function resolveCall(optionId: string) {
    if (!activeCall) return;
    const result = resolveIncidentChoice(activeCall, optionId, trains, drivers);
    if (!result) return;
    stopSpeech();
    setRadioLink('free');
    setTrains(result.trains);
    setDrivers(result.drivers);
    setIncidents((prev) =>
      prev.map((i) =>
        i.id === activeCall.id ? { ...i, resolved: true, chosenOptionId: optionId } : i,
      ),
    );
    setActiveCall(null);
    setShift((prev) => ({
      ...prev,
      emergencyBudget: Math.max(0, prev.emergencyBudget + result.budgetDelta),
      stats: {
        ...prev.stats,
        incidentsResolved: prev.stats.incidentsResolved + 1,
        lenkzeitAverted: prev.stats.lenkzeitAverted + (result.lenkzeitAverted ? 1 : 0),
        totalDelayAdded: prev.stats.totalDelayAdded + Math.max(0, result.delayDelta),
        totalDelaySaved: prev.stats.totalDelaySaved + Math.max(0, -result.delayDelta),
      },
      logEntries: [
        { id: `log-${Date.now()}`, atMin: prev.inGameMinutes, text: result.logText, tone: 'ok' as const },
        ...prev.logEntries,
      ].slice(0, 40),
      punctualityPct: computePunctuality(result.trains),
    }));
  }

  function setSpeed(speed: ClockSpeed) {
    if (!shift.onDuty && speed !== 0) return;
    setShift((prev) => ({ ...prev, speed }));
  }

  function buildSnapshot(): SaveGame {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      employerId: employer.id,
      career,
      locos,
      drivers,
      trains,
      handoverBook,
      logEntries: shift.logEntries,
      inGameMinutes: shift.inGameMinutes,
      lastShiftKind: shift.currentShift ?? save.lastShiftKind,
      settings,
    };
  }

  useEffect(() => {
    if (phase === 'SHIFT_BRIEFING') {
      setReport(null);
      setPauseOpen(false);
      setBriefingKind(scheduledShiftAt(shiftRef.current.inGameMinutes));
      setNameDraft(careerRef.current.displayName);
      setScreen('briefing');
    } else if (phase === 'ACTIVE_SHIFT') {
      setScreen('leitstelle');
    }
  }, [phase]);

  const brand = employer;

  /* ---------- SCREENS ---------- */

  if (screen === 'desk') {
    return (
      <div className="vr-root">
        <Atmosphere theme="desk" />
        <div className="vr-shell">
          <header className="vr-topbar">
            <div className="vr-brand">
              <strong>{brand.legalName}</strong>
              <span>
                {brand.shortName} · {brand.hqCity}
              </span>
            </div>
            <div className="vr-chip">
              <UserRound className="h-3.5 w-3.5" />
              {careerTitle(career)}
            </div>
          </header>
          <main className="vr-main">
            <div className="vr-desk">
              <h1>Disponenten-Schreibtisch</h1>
              <p className="vr-os">
                {brand.legalName} · Leitstelle {brand.hqCity}
              </p>
              <div className="vr-btn-stack">
                <button
                  type="button"
                  className="vr-btn vr-btn-primary"
                  onClick={() => {
                    openBriefing();
                    onPhaseChange('SHIFT_BRIEFING');
                  }}
                >
                  <Clock3 className="h-4 w-4" />
                  Schicht antreten
                </button>
                <button type="button" className="vr-btn" onClick={() => setScreen('akte')}>
                  <BookOpen className="h-4 w-4" />
                  Disponenten-Akte
                </button>
                <button type="button" className="vr-btn" onClick={() => setScreen('fuhrpark')}>
                  <Train className="h-4 w-4" />
                  EVU-Fuhrpark & Tf-Stammdaten
                </button>
                <button
                  type="button"
                  className="vr-btn vr-btn-ghost"
                  onClick={() => onQuitToMainMenu(buildSnapshot())}
                >
                  Hauptmenü
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (screen === 'akte') {
    const meta = RANK_META[career.rank];
    const avg =
      career.punctualityHistory.length === 0
        ? '—'
        : `${Math.round(career.punctualityHistory.reduce((a, b) => a + b, 0) / career.punctualityHistory.length)} %`;
    return (
      <div className="vr-root">
        <Atmosphere theme="desk" />
        <div className="vr-shell">
          <ShellChrome
            brand={brand}
            career={career}
            shift={shift}
            handover={false}
            onDuty={false}
            hasAlert={false}
            onSpeed={() => undefined}
            onEnd={() => setScreen('desk')}
            endLabel="Zurück"
          />
          <main className="vr-main">
            <div className="vr-desk">
              <h1>Disponenten-Akte</h1>
              <p className="vr-os">{career.roleLabel} · {career.displayName}</p>
              <div className="vr-stat-grid is-3">
                <Stat label="Rang" value={`${career.rank} · ${meta.label}`} />
                <Stat label="Monatsbrutto" value={euro(meta.monthlyGrossEuro)} />
                <Stat
                  label="Schichtanteil"
                  value={`${euro(shiftBaseWage(career.rank))} (${SHIFTS_PER_MONTH} Sch./Mon.)`}
                />
                <Stat
                  label="Rang-EXP"
                  value={meta.expToNext ? `${career.exp} / ${meta.expToNext}` : `${career.exp}`}
                />
                <Stat
                  label="Schichten im Rang"
                  value={
                    meta.minShiftsForPromo
                      ? `${career.shiftsAtRank} / ${meta.minShiftsForPromo}`
                      : String(career.shiftsAtRank)
                  }
                />
                <Stat label="Schichten gesamt" value={String(career.shiftsCompleted)} />
                <Stat label="Ø Pünktlichkeit" value={avg} />
                <Stat label="Verdienst gesamt" value={euro(career.totalEarnedEuro)} />
              </div>
              <p className="mt-3 text-xs" style={{ color: 'var(--vr-muted)' }}>
                {promoProgressLabel(career)}
              </p>
              <ul className="mt-2 space-y-1 text-xs" style={{ color: 'var(--vr-muted)' }}>
                {meta.hints.map((h) => (
                  <li key={h}>· {h}</li>
                ))}
              </ul>
              <button type="button" className="vr-btn vr-btn-ghost mt-4 w-full" onClick={() => setScreen('desk')}>
                Zum Schreibtisch
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (screen === 'fuhrpark') {
    return (
      <div className="vr-root">
        <Atmosphere theme="fleet" />
        <div className="vr-shell">
        <ShellChrome
          brand={brand}
          career={career}
          shift={shift}
          handover={false}
          onDuty={false}
          hasAlert={false}
          onSpeed={() => undefined}
          onEnd={() => setScreen('desk')}
          endLabel="Zurück"
        />
        <main className="vr-main grid gap-3 lg:grid-cols-2">
          <section className="vr-panel">
            <div className="vr-panel-h">
              <span>
                Fuhrpark · {locos.length} Loks · Soll {RANK_META[career.rank].maxTrains} Züge · {brand.hqCity}
              </span>
            </div>
            <div className="vr-scroll">
              {locos.map((l) => (
                <div key={l.id} className="vr-item" style={{ cursor: 'default' }}>
                  <strong>
                    {l.model} · {l.unitNumber}
                  </strong>
                  <small>
                    {LOCO_STATUS_LABEL[l.status]} · {l.location}
                  </small>
                </div>
              ))}
            </div>
          </section>
          <section className="vr-panel">
            <div className="vr-panel-h">
              <span>{drivers.length} angestellte Tf</span>
            </div>
            <div className="vr-scroll">
              {drivers.map((d) => (
                <div key={d.id} className="vr-item" style={{ cursor: 'default' }}>
                  <strong>{d.name}</strong>
                  <small>
                    {DRIVER_STATUS_LABEL[d.status]} · Restlenkzeit {Math.round(d.remainingDutyMinutes)} Min. ·
                    Zufriedenheit {d.satisfaction}%
                  </small>
                </div>
              ))}
            </div>
          </section>
          <button type="button" className="vr-btn vr-btn-ghost lg:col-span-2" onClick={() => setScreen('desk')}>
            Zum Schreibtisch
          </button>
        </main>
        </div>
      </div>
    );
  }

  if (screen === 'briefing') {
    return (
      <div className="vr-root">
        <Atmosphere theme="desk" />
        <div className="vr-modal-bg">
          <div className="vr-modal" role="dialog" aria-modal="true" aria-labelledby="brief-title">
            <header>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-amber-300">Schicht-Anmeldung</p>
                <h2 id="brief-title" className="text-lg font-bold text-slate-50">
                  Übergabebuch & Dienstwahl
                </h2>
              </div>
              <button type="button" className="vr-btn vr-btn-ghost" onClick={() => setScreen('desk')} aria-label="Schließen">
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="vr-body space-y-3">
              <label className="block text-xs text-slate-400">
                Name
                <input
                  className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-100"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                />
              </label>
              <div className="text-xs text-slate-400">
                {career.roleLabel} · {RANK_META[career.rank].label} · {RANK_META[career.rank].maxTrains}{' '}
                Züge · bis {RANK_META[career.rank].maxOpenIncidents} parallele Meldungen
              </div>
              <div className="grid gap-1.5">
                {SHIFT_ORDER.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={`vr-btn ${briefingKind === k ? 'vr-btn-primary' : ''}`}
                    onClick={() => setBriefingKind(k)}
                  >
                    {SHIFT_WINDOWS[k].label} · {shiftHoursLabel(k)}
                  </button>
                ))}
              </div>
              <div>
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  <BookOpen className="h-3.5 w-3.5" />
                  Übergabebuch der Vorgängerschicht
                </div>
                {handoverBook.length === 0 ? (
                  <p className="rounded-md border border-emerald-500/25 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-100">
                    Keine offenen Vorgänge — ruhiger Start.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {handoverBook.map((n) => (
                      <li key={n.trainNumber} className="rounded-md border border-amber-500/30 bg-amber-950/20 px-2.5 py-1.5 text-xs">
                        <strong className="text-amber-100">{n.trainNumber}</strong>
                        <div className="text-amber-100/80">{n.note}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <footer>
              <button type="button" className="vr-btn vr-btn-ghost" onClick={() => setScreen('desk')}>
                Abbrechen
              </button>
              <button type="button" className="vr-btn vr-btn-primary" onClick={() => startDuty(briefingKind)}>
                Dienst antreten
              </button>
            </footer>
          </div>
        </div>
      </div>
    );
  }

  /* Leitstelle workspace */
  return (
    <div className="vr-root">
      <Atmosphere theme="leitstelle" />
      <div className="vr-shell">
      <ShellChrome
        brand={brand}
        career={career}
        shift={shift}
        handover={handover}
        onDuty={Boolean(onDuty)}
        hasAlert={Boolean(activeCall)}
        onSpeed={setSpeed}
        onMenu={() => {
          setShift((prev) => ({ ...prev, speed: 0 }));
          setPauseOpen(true);
        }}
        onEnd={() => {
          if (shift.onDuty) endCurrentShift();
          else setScreen('desk');
        }}
        endLabel={shift.onDuty ? 'Schichtübergabe' : 'Schreibtisch'}
      />

      <main className="vr-main">
        <div className="vr-workspace">
          <aside className="vr-panel">
            <div className="vr-panel-h">
              <span className="flex items-center gap-1.5">
                <Radio className="h-3.5 w-3.5 text-amber-400" />
                Dispo-Terminal
              </span>
              <span>{openIncidents.length} offen</span>
            </div>
            <div className="vr-tabs">
              {(
                [
                  ['inbox', 'Meldungen'],
                  ['tf', 'Tf-Lenkzeiten'],
                  ['zuege', 'Zugliste'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`vr-tab ${terminalTab === id ? 'is-on' : ''}`}
                  onClick={() => setTerminalTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="vr-scroll">
              {terminalTab === 'inbox' && (
                <>
                  {openIncidents.length === 0 ? (
                    <p className="text-xs text-slate-500">Keine offenen GSM-R-Anrufe.</p>
                  ) : (
                    openIncidents.map((inc) => (
                      <button
                        key={inc.id}
                        type="button"
                        className={`vr-item is-crit ${activeCall?.id === inc.id ? 'ring-1 ring-amber-400' : ''}`}
                        onClick={() => {
                          setActiveCall(inc);
                          const caller = drivers.find((d) => d.name === inc.driverName);
                          setRadioDriverName(inc.driverName);
                          speakGsmr(inc.messageText, undefined, undefined, {
                            gender: caller?.gender ?? 'male',
                            voiceId: caller?.ttsVoiceId ?? null,
                            driverName: inc.driverName,
                            onStatus: setRadioLink,
                          });
                        }}
                      >
                        <strong className="flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {inc.driverName}
                        </strong>
                        <small>{inc.messageText}</small>
                      </button>
                    ))
                  )}
                  {shift.logEntries.slice(0, 5).map((l) => (
                    <div key={l.id} className="vr-item" style={{ cursor: 'default', opacity: 0.85 }}>
                      <strong>{formatHm(l.atMin)}</strong>
                      <small>{l.text}</small>
                    </div>
                  ))}
                </>
              )}
              {terminalTab === 'tf' &&
                drivers.map((d) => {
                  const low = d.remainingDutyMinutes < 60;
                  const mid = d.remainingDutyMinutes < 120;
                  return (
                    <div key={d.id} className="vr-item" style={{ cursor: 'default' }}>
                      <strong>{d.name}</strong>
                      <small>
                        {DRIVER_STATUS_LABEL[d.status]} ·{' '}
                        <span className={`vr-duty ${low ? 'is-low' : mid ? 'is-mid' : 'is-ok'}`}>
                          {Math.round(d.remainingDutyMinutes)} Min. Rest
                        </span>
                      </small>
                    </div>
                  );
                })}
              {terminalTab === 'zuege' &&
                trains.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="vr-item"
                    onClick={() => setSelectedTrainId(t.id)}
                  >
                    <strong>
                      {t.trainNumber} · {t.cargo}
                      {t.dangerousGoods ? ' · RID' : ''}
                    </strong>
                    <small>
                      {t.origin} → {t.destination} · {TRAIN_STATUS_LABEL[t.status]} · Soll{' '}
                      {t.plannedDurationMin} Min. · Ist {Math.round(t.elapsedMin)} Min. ·{' '}
                      <span className={t.delayMinutes >= 5 ? 'text-amber-300' : 'text-emerald-300'}>
                        {t.delayMinutes <= 0 ? 'Pünktlich' : `+${Math.round(t.delayMinutes)} Min.`}
                      </span>
                    </small>
                  </button>
                ))}
            </div>
            {!onDuty && (
              <div className="border-t border-slate-700/50 p-2">
                <button type="button" className="vr-btn vr-btn-primary w-full" onClick={openBriefing}>
                  Schicht antreten
                </button>
              </div>
            )}
          </aside>

          <section className="vr-panel">
            <div className="vr-panel-h">
              <span className="flex items-center gap-1.5">
                <Train className="h-3.5 w-3.5 text-sky-400" />
                Netzkarte
              </span>
              <span className="flex items-center gap-2 text-[10px]">
                <span className="text-emerald-300">● Pünktlich</span>
                <span className="text-amber-300">● +5–15 Min.</span>
                <span className="text-rose-300">● Störung</span>
              </span>
            </div>
            <CorridorMap
              trains={trains}
              activeIncident={activeCall}
              selectedTrainId={selectedTrainId}
              onSelectTrain={setSelectedTrainId}
              hqCity={brand.hqCity}
            />
          </section>
        </div>
      </main>

      {activeCall && (
        <div className="vr-modal-bg">
          <div className="vr-modal" role="dialog" aria-modal="true" aria-labelledby="gsmr-title">
            <header>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-rose-300">GSM-R-Funkspruch</p>
                <h2 id="gsmr-title" className="text-lg font-bold text-slate-50">
                  {activeCall.driverName}
                </h2>
              </div>
              {(radioLink === 'receiving' || radioLink === 'connected') && (
                <div className={`vr-wave ${radioLink === 'receiving' ? 'is-receiving' : ''}`} aria-hidden>
                  {Array.from({ length: 7 }).map((_, i) => (
                    <span key={i} />
                  ))}
                </div>
              )}
            </header>
            <div className="vr-body space-y-3">
              <p className="vr-gsmr-status" role="status" aria-live="polite">
                {formatGsmrStatus(
                  radioLink === 'idle' ? 'receiving' : radioLink,
                  radioDriverName || activeCall.driverName,
                )}
              </p>
              <p className="text-sm leading-relaxed text-slate-200">{activeCall.messageText}</p>
              <div className="grid gap-1.5">
                {activeCall.options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`vr-btn ${opt.kind === 'sicher' ? 'vr-btn-primary' : ''}`}
                    onClick={() => resolveCall(opt.id)}
                    disabled={shift.emergencyBudget < opt.costEuro && opt.costEuro > 0}
                  >
                    {opt.label}
                    <span className="text-[11px] font-normal opacity-80">
                      {opt.costEuro > 0 ? euro(opt.costEuro) : '0 €'} · {opt.delayDelta >= 0 ? '+' : ''}
                      {opt.delayDelta} Min.
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {pauseOpen && (
        <div className="vr-modal-bg">
          <div className="vr-modal" role="dialog" aria-modal="true" aria-labelledby="pause-title">
            <header>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-amber-300">Pause</p>
                <h2 id="pause-title" className="text-lg font-bold text-slate-50">
                  Menü
                </h2>
              </div>
              <button type="button" className="vr-btn vr-btn-ghost" onClick={() => setPauseOpen(false)} aria-label="Schließen">
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="vr-body space-y-2">
              <button
                type="button"
                className="vr-btn vr-btn-primary w-full"
                onClick={() => {
                  onPersist(buildSnapshot());
                  setPauseOpen(false);
                }}
              >
                Speichern
              </button>
              <button
                type="button"
                className="vr-btn w-full"
                onClick={() => {
                  setSettingsOpen(true);
                }}
              >
                <Settings className="h-4 w-4" />
                Einstellungen
              </button>
              <button
                type="button"
                className="vr-btn w-full"
                onClick={() => {
                  setPauseOpen(false);
                  setScreen('akte');
                }}
              >
                Disponenten-Akte
              </button>
              <button
                type="button"
                className="vr-btn vr-btn-ghost w-full"
                onClick={() => {
                  stopSpeech();
                  setPauseOpen(false);
                  onQuitToMainMenu(buildSnapshot());
                }}
              >
                Beenden · Hauptmenü
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="vr-modal-bg">
          <div className="vr-modal" role="dialog" aria-modal="true">
            <header>
              <h2 className="text-lg font-bold text-slate-50">Einstellungen</h2>
              <button type="button" className="vr-btn vr-btn-ghost" onClick={() => setSettingsOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="vr-body space-y-3 text-sm">
              <label className="block text-xs text-slate-400">
                TTS-Lautstärke ({Math.round(settings.ttsVolume * 100)} %)
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  className="mt-1 w-full"
                  value={settings.ttsVolume}
                  onChange={(e) => onSettingsChange({ ...settings, ttsVolume: Number(e.target.value) })}
                />
              </label>
              <label className="block text-xs text-slate-400">
                GSM-R Funk ({Math.round(settings.radioVolume * 100)} %)
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  className="mt-1 w-full"
                  value={settings.radioVolume}
                  onChange={(e) => onSettingsChange({ ...settings, radioVolume: Number(e.target.value) })}
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {(report || phase === 'SHIFT_SUMMARY') && report && (
        <div className="vr-modal-bg">
          <div className="vr-modal" role="dialog" aria-modal="true">
            <header>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--vr-accent)' }}>
                  Schichtübergabe-Protokoll
                </p>
                <h2 className="text-lg font-bold" style={{ color: 'var(--vr-text)' }}>
                  {SHIFT_WINDOWS[report.shift].label}
                </h2>
              </div>
              <div
                className="rounded-xl border px-2.5 py-1 text-center"
                style={{ borderColor: 'rgba(245,185,66,0.4)', background: 'rgba(245,185,66,0.12)' }}
              >
                <div className="text-[9px] uppercase" style={{ color: 'var(--vr-muted)' }}>
                  Note
                </div>
                <div className="text-xl font-black" style={{ color: 'var(--vr-accent)' }}>
                  {report.grade}
                </div>
              </div>
            </header>
            <div className="vr-body space-y-3 text-sm">
              <p className="text-xs" style={{ color: 'var(--vr-muted)' }}>
                {report.gradeReason}
              </p>
              <div className="vr-stat-grid">
                <Stat label="Schichtlohn" value={euro(report.wageBase)} />
                <Stat label="Leistungszulage" value={euro(report.punctualityBonus)} />
                <Stat label="Note" value={report.grade} />
                <Stat label="Pünktlichkeit" value={`${report.punctualityPct} %`} />
                <Stat label="Meldungen gelöst" value={String(report.incidentsResolved)} />
                <Stat label="Lenkzeit abgewendet" value={String(report.lenkzeitAverted)} />
                <Stat label="EXP diese Schicht" value={`+${report.expGained}`} />
                <Stat
                  label="Rang"
                  value={
                    report.promoted
                      ? `Befördert → ${RANK_META[report.rankAfter].label}`
                      : RANK_META[report.rankAfter].label
                  }
                />
              </div>
              <p className="text-xs" style={{ color: 'var(--vr-muted)' }}>
                Rangfortschritt: {report.rankProgress}
              </p>
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase text-slate-500">Übergabe-Notizen</div>
                {report.handoverNotes.length === 0 ? (
                  <p className="text-xs text-slate-500">Keine offenen Züge.</p>
                ) : (
                  report.handoverNotes.map((n) => (
                    <div key={n.trainNumber} className="text-xs text-amber-100/90">
                      {n.trainNumber}: {n.note}
                    </div>
                  ))
                )}
              </div>
            </div>
            <footer>
              <button
                type="button"
                className="vr-btn vr-btn-ghost"
                onClick={() => {
                  const snap = buildSnapshot();
                  setReport(null);
                  onQuitToMainMenu(snap);
                }}
              >
                Schicht beenden & Hauptmenü
              </button>
              <button
                type="button"
                className="vr-btn vr-btn-primary"
                onClick={() => {
                  setBriefingKind(report.nextShift);
                  setReport(null);
                  onPhaseChange('SHIFT_BRIEFING');
                }}
              >
                Nächste Schicht direkt starten
              </button>
            </footer>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function ShellChrome({
  brand,
  career,
  shift,
  handover,
  onDuty,
  hasAlert,
  onSpeed,
  onMenu,
  onEnd,
  endLabel,
}: {
  brand: Employer;
  career: CareerState;
  shift: ShiftState;
  handover: boolean;
  onDuty: boolean;
  hasAlert: boolean;
  onSpeed: (s: ClockSpeed) => void;
  onMenu?: () => void;
  onEnd: () => void;
  endLabel: string;
}) {
  return (
    <header className="vr-topbar">
      <div className="vr-brand">
        <strong>{brand.legalName}</strong>
        <span>
          {brand.hqCity} · {careerTitle(career)}
          {shift.currentShift ? ` · ${SHIFT_WINDOWS[shift.currentShift].label}` : ''}
        </span>
      </div>
      <div className="vr-metrics">
        <span className="vr-chip">
          <Clock3 className="h-3.5 w-3.5" />
          {formatClock(shift.inGameMinutes)}
        </span>
        <span className="vr-chip">Pünktlichkeit {shift.punctualityPct}%</span>
        <span className="vr-chip">Notfall {euro(shift.emergencyBudget)}</span>
        {handover && (
          <span className="vr-chip is-handover">
            <Users className="h-3.5 w-3.5" />
            Übergabe-Status
          </span>
        )}
        {hasAlert && (
          <span className="vr-chip is-alert">
            <AlertTriangle className="h-3.5 w-3.5" />
            GSM-R-Anruf
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            className={`vr-btn ${shift.speed === s ? 'vr-btn-primary' : 'vr-btn-ghost'}`}
            style={{ padding: '0.35rem 0.55rem', fontSize: '0.7rem' }}
            disabled={!onDuty && s !== 0}
            onClick={() => onSpeed(s)}
            title={s === 0 ? 'Pause' : `${s}x`}
          >
            {s === 0 ? <Pause className="h-3.5 w-3.5" /> : s === 1 ? <Play className="h-3.5 w-3.5" /> : `${s}x`}
          </button>
        ))}
        {onMenu && (
          <button
            type="button"
            className="vr-btn vr-btn-primary"
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.7rem' }}
            onClick={onMenu}
          >
            <Menu className="h-3.5 w-3.5" />
            Pause / Menü
          </button>
        )}
        <button type="button" className="vr-btn vr-btn-ghost" style={{ padding: '0.35rem 0.65rem', fontSize: '0.7rem' }} onClick={onEnd}>
          <Briefcase className="h-3.5 w-3.5" />
          {endLabel}
        </button>
      </div>
    </header>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="vr-stat">
      <label>{label}</label>
      <strong>{value}</strong>
    </div>
  );
}
