import { RANK_META, type IncidentTier } from '@/vectra/career';
import { refillTrainsToRank } from '@/vectra/seed';
import type {
  DispatcherRank,
  Driver,
  Incident,
  IncidentOption,
  LogEntry,
  Locomotive,
  ShiftStats,
  TrainRun,
} from '@/vectra/types';

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyStats(): ShiftStats {
  return {
    incidentsResolved: 0,
    lenkzeitAverted: 0,
    totalDelayAdded: 0,
    totalDelaySaved: 0,
    wageBase: 0,
    punctualityBonus: 0,
  };
}

export function computePunctuality(trains: TrainRun[]): number {
  const active = trains.filter(
    (t) => t.status === 'unterwegs' || t.status === 'halt' || t.status === 'gestoert' || t.status === 'ankunft',
  );
  if (active.length === 0) return 100;
  const onTime = active.filter((t) => t.delayMinutes <= 5).length;
  return Math.round((onTime / active.length) * 100);
}

export function delayColor(delay: number, status: TrainRun['status']): 'green' | 'yellow' | 'red' {
  if (status === 'gestoert' || status === 'halt') return 'red';
  if (delay >= 15) return 'red';
  if (delay >= 5) return 'yellow';
  return 'green';
}

export interface TickResult {
  trains: TrainRun[];
  drivers: Driver[];
  locos: Locomotive[];
  newIncident: Incident | null;
  log: LogEntry | null;
}

export function advanceSimulation(
  trains: TrainRun[],
  drivers: Driver[],
  locos: Locomotive[],
  deltaMin: number,
  openIncidentCount: number,
  gameMin: number,
  rank: DispatcherRank = 1,
): TickResult {
  const meta = RANK_META[rank];
  let nextTrains = trains.map((t) => ({ ...t }));
  let nextDrivers = drivers.map((d) => ({ ...d }));
  let nextLocos = locos.map((l) => ({ ...l }));
  let log: LogEntry | null = null;

  for (const train of nextTrains) {
    if (train.status !== 'unterwegs') continue;
    const speedFactor = train.delayMinutes > 20 ? 0.7 : 1;
    const progressDelta = (deltaMin / train.plannedDurationMin) * speedFactor;
    train.progress = Math.min(1, train.progress + progressDelta);
    train.elapsedMin += deltaMin;

    const expectedProgress = train.elapsedMin / train.plannedDurationMin;
    if (expectedProgress > train.progress + 0.02) {
      train.delayMinutes = Math.min(180, train.delayMinutes + deltaMin * 0.35);
    }

    const driver = nextDrivers.find((d) => d.id === train.driverId);
    if (driver && driver.status === 'in_fahrt') {
      driver.remainingDutyMinutes = Math.max(0, driver.remainingDutyMinutes - deltaMin);
    }

    if (train.progress >= 1) {
      train.status = 'ankunft';
      train.progress = 1;
      if (driver) {
        driver.status = 'bereit';
        driver.assignedTrainId = null;
        driver.remainingDutyMinutes = Math.min(driver.maxDutyMinutes, driver.remainingDutyMinutes + 30);
      }
      const loco = nextLocos.find((l) => l.id === train.locoId);
      if (loco) {
        loco.status = 'bereit';
        loco.location = train.destination;
      }
      log = {
        id: uid('log'),
        atMin: gameMin,
        text: `${train.trainNumber} ist in ${train.destination} angekommen.`,
        tone: 'ok',
      };
    }
  }

  // Nach Ankünften: Flotte wieder auf Rang-Soll auffüllen
  nextTrains = refillTrainsToRank(nextTrains, nextDrivers, nextLocos, rank);

  let newIncident: Incident | null = null;
  if (openIncidentCount < meta.maxOpenIncidents && Math.random() < meta.incidentRate * deltaMin) {
    newIncident = spawnIncident(nextTrains, nextDrivers, gameMin, meta.incidentTiers);
    if (newIncident) {
      const train = nextTrains.find((t) => t.id === newIncident!.trainId);
      if (train) train.status = 'gestoert';
    }
  }

  return { trains: nextTrains, drivers: nextDrivers, locos: nextLocos, newIncident, log };
}

type IncidentTemplate = { tier: IncidentTier; message: string; options: IncidentOption[]; preferRid?: boolean };

function juniorTemplates(driverName: string, train: TrainRun): IncidentTemplate[] {
  return [
    {
      tier: 'junior',
      message: `${driverName} über GSM-R: Restlenkzeit knapp vor ${train.destination}. Anweisung?`,
      options: [
        {
          id: 'taxi',
          label: 'Eil-Taxi Ersatz-Tf (Sicher)',
          costEuro: 420,
          delayDelta: 25,
          satisfactionDelta: 8,
          kind: 'sicher',
        },
        {
          id: 'weiter',
          label: 'Weiterfahrt anordnen (Risiko)',
          costEuro: 0,
          delayDelta: 5,
          satisfactionDelta: -18,
          kind: 'risiko',
        },
        {
          id: 'pause',
          label: 'Ausweichgleis + Pause',
          costEuro: 80,
          delayDelta: 45,
          satisfactionDelta: 4,
          kind: 'konservativ',
        },
      ],
    },
    {
      tier: 'junior',
      message: `${driverName}: Technischer Alarm an ${train.trainNumber}. Lok ruckelt — Disposition?`,
      options: [
        {
          id: 'schlepp',
          label: 'Schlepplok buchen',
          costEuro: 1_800,
          delayDelta: 55,
          satisfactionDelta: 6,
          kind: 'sicher',
        },
        {
          id: 'kriechen',
          label: 'Kriechfahrt bis nächsten Bahnhof',
          costEuro: 0,
          delayDelta: 35,
          satisfactionDelta: -10,
          kind: 'risiko',
        },
        {
          id: 'sichern',
          label: 'Zug sichern, Infra informieren',
          costEuro: 200,
          delayDelta: 70,
          satisfactionDelta: 2,
          kind: 'konservativ',
        },
      ],
    },
    {
      tier: 'junior',
      message: `${driverName}: Baustellenfenster vor ${train.destination} — Trasse blockiert.`,
      options: [
        {
          id: 'umleit',
          label: 'Umleitung freigeben (Teuer)',
          costEuro: 950,
          delayDelta: 40,
          satisfactionDelta: 5,
          kind: 'sicher',
        },
        {
          id: 'kunde',
          label: 'Warten / Kunde informieren',
          costEuro: 0,
          delayDelta: 90,
          satisfactionDelta: -6,
          kind: 'risiko',
        },
        {
          id: 'halte',
          label: 'Zwischenhalt + neue Trasse',
          costEuro: 350,
          delayDelta: 55,
          satisfactionDelta: 1,
          kind: 'konservativ',
        },
      ],
    },
  ];
}

function seniorTemplates(driverName: string, train: TrainRun): IncidentTemplate[] {
  return [
    {
      tier: 'senior',
      preferRid: true,
      message: `${driverName}: RID-Alarm ${train.trainNumber} — Geruch / Druckabfall gemeldet. Sofortmaßnahme?`,
      options: [
        {
          id: 'rid-stop',
          label: 'Zug stoppen, Feuerwehr + RID-Dienst',
          costEuro: 2_400,
          delayDelta: 80,
          satisfactionDelta: 10,
          kind: 'sicher',
        },
        {
          id: 'rid-crawl',
          label: 'Kriechfahrt bis Freiladegleis',
          costEuro: 600,
          delayDelta: 50,
          satisfactionDelta: -8,
          kind: 'risiko',
        },
        {
          id: 'rid-hold',
          label: 'Sichern und Kunde informieren',
          costEuro: 900,
          delayDelta: 100,
          satisfactionDelta: 2,
          kind: 'konservativ',
        },
      ],
    },
    {
      tier: 'senior',
      message: `${driverName}: Kreuzungskonflikt mit Gegenzug vor ${train.destination} — Wer hat Vorrang?`,
      options: [
        {
          id: 'prio-own',
          label: 'Eigenen Zug priorisieren',
          costEuro: 180,
          delayDelta: 10,
          satisfactionDelta: 4,
          kind: 'risiko',
        },
        {
          id: 'prio-other',
          label: 'Gegenzug lassen, eigenen halten',
          costEuro: 0,
          delayDelta: 35,
          satisfactionDelta: -4,
          kind: 'konservativ',
        },
        {
          id: 'prio-slot',
          label: 'Neuen Slot kaufen',
          costEuro: 1_100,
          delayDelta: 5,
          satisfactionDelta: 8,
          kind: 'sicher',
        },
      ],
    },
    {
      tier: 'senior',
      message: `Dispo-Zentrale: Kundenfenster für ${train.cargo} in ${train.destination} droht zu platzen.`,
      options: [
        {
          id: 'kunde-eil',
          label: 'Eiltrasse freigeben',
          costEuro: 1_350,
          delayDelta: -15,
          satisfactionDelta: 12,
          kind: 'sicher',
        },
        {
          id: 'kunde-teil',
          label: 'Teilablieferung anbieten',
          costEuro: 400,
          delayDelta: 20,
          satisfactionDelta: 2,
          kind: 'konservativ',
        },
        {
          id: 'kunde-risiko',
          label: 'Durchdrücken ohne Zuschlag',
          costEuro: 0,
          delayDelta: 8,
          satisfactionDelta: -14,
          kind: 'risiko',
        },
      ],
    },
  ];
}

function cvdTemplates(driverName: string, train: TrainRun): IncidentTemplate[] {
  return [
    {
      tier: 'cvd',
      message: `CvD-Alarm: Korridorsperrung auf dem Laufweg von ${train.trainNumber}. Netzlage kritisch.`,
      options: [
        {
          id: 'cvd-umleit',
          label: 'Großumleitung freigeben',
          costEuro: 3_200,
          delayDelta: 55,
          satisfactionDelta: 6,
          kind: 'sicher',
        },
        {
          id: 'cvd-stau',
          label: 'Staffelhalt — Netz entlasten',
          costEuro: 500,
          delayDelta: 95,
          satisfactionDelta: -2,
          kind: 'konservativ',
        },
        {
          id: 'cvd-break',
          label: 'Durchbruch erzwingen (hohes Risiko)',
          costEuro: 0,
          delayDelta: 25,
          satisfactionDelta: -22,
          kind: 'risiko',
        },
      ],
    },
    {
      tier: 'cvd',
      message: `Personal: Mehrere Tf melden Übermüdung — ${driverName} fordert Schichtentscheidung.`,
      options: [
        {
          id: 'cvd-pool',
          label: 'Springer-Pool aktivieren',
          costEuro: 2_800,
          delayDelta: 30,
          satisfactionDelta: 14,
          kind: 'sicher',
        },
        {
          id: 'cvd-reduce',
          label: 'Zwei Züge zurückstellen',
          costEuro: 700,
          delayDelta: 70,
          satisfactionDelta: 4,
          kind: 'konservativ',
        },
        {
          id: 'cvd-push',
          label: 'Weitermachen bis Grenze',
          costEuro: 0,
          delayDelta: 15,
          satisfactionDelta: -20,
          kind: 'risiko',
        },
      ],
    },
    {
      tier: 'cvd',
      message: `Infra: Oberleitungsstörung — ${train.trainNumber} und Nachbarzüge betroffen.`,
      options: [
        {
          id: 'cvd-diesel',
          label: 'Dieselnachschub / EuroDual umplanen',
          costEuro: 2_100,
          delayDelta: 40,
          satisfactionDelta: 8,
          kind: 'sicher',
        },
        {
          id: 'cvd-wait',
          label: 'Warten auf Infra-Freigabe',
          costEuro: 150,
          delayDelta: 110,
          satisfactionDelta: 0,
          kind: 'konservativ',
        },
        {
          id: 'cvd-split',
          label: 'Zug teilen / Teilablauf',
          costEuro: 1_600,
          delayDelta: 65,
          satisfactionDelta: -6,
          kind: 'risiko',
        },
      ],
    },
  ];
}

function spawnIncident(
  trains: TrainRun[],
  drivers: Driver[],
  gameMin: number,
  tiers: IncidentTier[],
): Incident | null {
  const candidates = trains.filter((t) => t.status === 'unterwegs' || t.status === 'halt');
  if (candidates.length === 0) return null;

  const preferRid = tiers.includes('senior') || tiers.includes('cvd');
  const ridPool = candidates.filter((t) => t.dangerousGoods);
  const train =
    preferRid && ridPool.length > 0 && Math.random() < 0.45
      ? ridPool[Math.floor(Math.random() * ridPool.length)]!
      : candidates[Math.floor(Math.random() * candidates.length)]!;

  const driver = drivers.find((d) => d.id === train.driverId);
  const driverName = driver?.name ?? 'Tf';

  const pool: IncidentTemplate[] = [];
  if (tiers.includes('junior')) pool.push(...juniorTemplates(driverName, train));
  if (tiers.includes('senior')) pool.push(...seniorTemplates(driverName, train));
  if (tiers.includes('cvd')) pool.push(...cvdTemplates(driverName, train));
  if (pool.length === 0) return null;

  // Höhere Tiers etwas häufiger würfeln, wenn verfügbar
  const weighted = pool.flatMap((t) => {
    if (t.tier === 'cvd') return [t, t, t];
    if (t.tier === 'senior') return [t, t];
    return [t];
  });
  const pick = weighted[Math.floor(Math.random() * weighted.length)]!;

  return {
    id: uid('inc'),
    trainId: train.id,
    driverName,
    messageText: pick.message,
    options: pick.options,
    createdAtMin: gameMin,
    resolved: false,
  };
}

export interface ResolveResult {
  trains: TrainRun[];
  drivers: Driver[];
  budgetDelta: number;
  delayDelta: number;
  lenkzeitAverted: boolean;
  logText: string;
}

const HALT_OPTION_IDS = new Set([
  'pause',
  'sichern',
  'halte',
  'rid-stop',
  'rid-hold',
  'prio-other',
  'cvd-stau',
  'cvd-wait',
  'cvd-reduce',
]);

export function resolveIncidentChoice(
  incident: Incident,
  optionId: string,
  trains: TrainRun[],
  drivers: Driver[],
): ResolveResult | null {
  const opt = incident.options.find((o) => o.id === optionId);
  if (!opt) return null;
  const nextTrains = trains.map((t) => ({ ...t }));
  const nextDrivers = drivers.map((d) => ({ ...d }));
  const train = nextTrains.find((t) => t.id === incident.trainId);
  if (!train) return null;

  train.delayMinutes = Math.max(0, train.delayMinutes + opt.delayDelta);
  train.status = HALT_OPTION_IDS.has(opt.id) ? 'halt' : 'unterwegs';
  if (opt.delayDelta < 0) train.delayMinutes = Math.max(0, train.delayMinutes);

  const driver = nextDrivers.find((d) => d.id === train.driverId);
  if (driver) {
    driver.satisfaction = Math.max(0, Math.min(100, driver.satisfaction + opt.satisfactionDelta));
    if (opt.id === 'taxi' || opt.id === 'cvd-pool') {
      driver.remainingDutyMinutes = Math.min(driver.maxDutyMinutes, driver.remainingDutyMinutes + 120);
    }
    if ((opt.id === 'weiter' || opt.id === 'cvd-push') && driver.remainingDutyMinutes < 40) {
      driver.remainingDutyMinutes = Math.max(5, driver.remainingDutyMinutes - 15);
    }
  }

  const lenkzeitAverted = opt.id === 'taxi' || opt.id === 'pause' || opt.id === 'cvd-pool';
  return {
    trains: nextTrains,
    drivers: nextDrivers,
    budgetDelta: -opt.costEuro,
    delayDelta: opt.delayDelta,
    lenkzeitAverted,
    logText: `${incident.driverName}: „${opt.label}“ — ${opt.costEuro > 0 ? `${opt.costEuro} €` : 'ohne Kosten'}, Verspätung ${opt.delayDelta >= 0 ? '+' : ''}${opt.delayDelta} Min.`,
  };
}
