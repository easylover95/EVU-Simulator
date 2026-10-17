import { lerpLatLng, lookupStation, pointAlongLatLngPath, railRouteLatLngs, RAIL_STATIONS } from '@/lib/stations';
import { RANK_META } from '@/vectra/career';
import type { Corridor, CorridorNode, DispatcherRank, Driver, Locomotive, TrainRun } from '@/vectra/types';

export const NODES: CorridorNode[] = [
  { id: 'dortmund', label: 'Dortmund', x: 22, y: 18 },
  { id: 'duisburg', label: 'Duisburg', x: 14, y: 24 },
  { id: 'koeln', label: 'Köln', x: 26, y: 38 },
  { id: 'mannheim', label: 'Mannheim', x: 42, y: 48 },
  { id: 'frankfurt', label: 'Frankfurt', x: 48, y: 44 },
  { id: 'nuernberg', label: 'Nürnberg', x: 68, y: 58 },
  { id: 'muenchen', label: 'München', x: 78, y: 78 },
];

/** Legacy-Korridore (nur noch Fallback / Distanzschätzung). */
export const CORRIDORS: Corridor[] = [
  { id: 'do-du', from: 'dortmund', to: 'duisburg', lengthKm: 55 },
  { id: 'du-ko', from: 'duisburg', to: 'koeln', lengthKm: 70 },
  { id: 'ko-ma', from: 'koeln', to: 'mannheim', lengthKm: 210 },
  { id: 'ma-ff', from: 'mannheim', to: 'frankfurt', lengthKm: 85 },
  { id: 'ff-nu', from: 'frankfurt', to: 'nuernberg', lengthKm: 230 },
  { id: 'nu-mu', from: 'nuernberg', to: 'muenchen', lengthKm: 170 },
];

type OdPair = {
  origin: string;
  destination: string;
  cargo: string;
  dangerousGoods?: boolean;
  plannedDurationMin: number;
};

/** Deutschlandweite OD-Paare — Karte zeigt nur aktive Läufe. */
const OD_POOL: OdPair[] = [
  { origin: 'Hamburg', destination: 'München', cargo: 'Container', plannedDurationMin: 420 },
  { origin: 'Hamburg', destination: 'Köln', cargo: 'Intermodal', plannedDurationMin: 280 },
  { origin: 'Berlin', destination: 'München', cargo: 'Automobile', plannedDurationMin: 380 },
  { origin: 'Berlin', destination: 'Frankfurt', cargo: 'Papierrollen', plannedDurationMin: 300 },
  { origin: 'Dortmund', destination: 'Basel', cargo: 'Stahlcoils', plannedDurationMin: 340 },
  { origin: 'Duisburg', destination: 'Nürnberg', cargo: 'Kohle', plannedDurationMin: 320 },
  { origin: 'Köln', destination: 'Leipzig', cargo: 'Container', plannedDurationMin: 290 },
  { origin: 'Köln', destination: 'München', cargo: 'Chemikalien (RID)', dangerousGoods: true, plannedDurationMin: 360 },
  { origin: 'Mannheim', destination: 'Hamburg', cargo: 'Kesselwagen (RID)', dangerousGoods: true, plannedDurationMin: 400 },
  { origin: 'Mannheim', destination: 'Berlin', cargo: 'Intermodal', plannedDurationMin: 370 },
  { origin: 'Frankfurt', destination: 'Passau', cargo: 'Automotive (Just-in-Time)', plannedDurationMin: 310 },
  { origin: 'Frankfurt', destination: 'Hannover', cargo: 'Schrott', plannedDurationMin: 220 },
  { origin: 'Stuttgart', destination: 'Hamburg', cargo: 'Automobile', plannedDurationMin: 390 },
  { origin: 'Stuttgart', destination: 'Berlin', cargo: 'Maschinen', plannedDurationMin: 360 },
  { origin: 'München', destination: 'Dortmund', cargo: 'Container', plannedDurationMin: 350 },
  { origin: 'München', destination: 'Köln', cargo: 'Chemikalien (RID)', dangerousGoods: true, plannedDurationMin: 330 },
  { origin: 'Nürnberg', destination: 'Hamburg', cargo: 'Holz', plannedDurationMin: 380 },
  { origin: 'Leipzig', destination: 'Mannheim', cargo: 'Getreide', plannedDurationMin: 300 },
  { origin: 'Hannover', destination: 'München', cargo: 'Stahlcoils', plannedDurationMin: 340 },
  { origin: 'Dresden', destination: 'Köln', cargo: 'Container', plannedDurationMin: 360 },
  { origin: 'Karlsruhe', destination: 'Berlin', cargo: 'Intermodal', plannedDurationMin: 390 },
  { origin: 'Augsburg', destination: 'Duisburg', cargo: 'Automobile', plannedDurationMin: 320 },
  { origin: 'Basel', destination: 'Hamburg', cargo: 'Kesselwagen (RID)', dangerousGoods: true, plannedDurationMin: 450 },
  { origin: 'Halle', destination: 'Stuttgart', cargo: 'Papierrollen', plannedDurationMin: 310 },
];

function estimateKm(origin: string, destination: string): number {
  const a = lookupStation(origin);
  const b = lookupStation(destination);
  const dLat = (a.lat - b.lat) * 111;
  const dLng = (a.lng - b.lng) * 75;
  return Math.max(80, Math.round(Math.hypot(dLat, dLng) * 1.25));
}

function corridorKey(origin: string, destination: string): string {
  return `${origin}→${destination}`;
}

export function createSeedLocos(hqCity = 'Dortmund'): Locomotive[] {
  return [
    { id: 'loco-1', model: 'Vectron MS', unitNumber: '193 501', status: 'bereit', location: 'Köln' },
    { id: 'loco-2', model: 'Vectron MS', unitNumber: '193 518', status: 'bereit', location: 'Frankfurt' },
    { id: 'loco-3', model: 'TRAXX F140', unitNumber: '185 204', status: 'bereit', location: 'Nürnberg' },
    { id: 'loco-4', model: 'TRAXX F140', unitNumber: '185 211', status: 'bereit', location: hqCity },
    { id: 'loco-5', model: 'EuroDual', unitNumber: '159 001', status: 'bereit', location: 'München' },
    { id: 'loco-6', model: 'EuroDual', unitNumber: '159 014', status: 'wartung', location: hqCity },
    { id: 'loco-7', model: 'Vectron MS', unitNumber: '193 540', status: 'bereit', location: 'Mannheim' },
    { id: 'loco-8', model: 'TRAXX F140', unitNumber: '185 228', status: 'bereit', location: 'Duisburg' },
    { id: 'loco-9', model: 'EuroDual', unitNumber: '159 022', status: 'bereit', location: 'Frankfurt' },
    { id: 'loco-10', model: 'Vectron MS', unitNumber: '193 555', status: 'bereit', location: hqCity },
  ];
}

export function createSeedDrivers(): Driver[] {
  const roster: Array<{ name: string; gender: Driver['gender'] }> = [
    { name: 'M. Berger', gender: 'male' },
    { name: 'S. Krause', gender: 'male' },
    { name: 'A. Hoffmann', gender: 'male' },
    { name: 'T. Richter', gender: 'male' },
    { name: 'J. Neumann', gender: 'male' },
    { name: 'K. Schäfer', gender: 'male' },
    { name: 'L. Wagner', gender: 'male' },
    { name: 'P. Fischer', gender: 'male' },
    { name: 'R. Becker', gender: 'male' },
    { name: 'C. Schulz', gender: 'male' },
  ];
  const maleIds = ['de-DE-KillianNeural', 'de-DE-ConradNeural', 'de-DE-RalfNeural'] as const;
  return roster.map((row, i) => ({
    id: `tf-${i + 1}`,
    name: row.name,
    gender: row.gender,
    /** Feste Edge-Neural-Stimme — bleibt über die gesamte Karriere gleich. */
    ttsVoiceId: row.gender === 'male' ? maleIds[i % maleIds.length]! : 'de-DE-KatjaNeural',
    remainingDutyMinutes: 420 - i * 18,
    maxDutyMinutes: 540,
    status: i === 8 ? 'krank' : i === 7 ? 'pause' : 'bereit',
    assignedTrainId: null,
    satisfaction: 72 + (i % 5) * 4,
  }));
}

function bindRun(run: TrainRun, drivers: Driver[], locos: Locomotive[]): void {
  const d = drivers.find((x) => x.id === run.driverId);
  if (d) {
    d.status = 'in_fahrt';
    d.assignedTrainId = run.id;
  }
  const l = locos.find((x) => x.id === run.locoId);
  if (l) {
    l.status = 'in_fahrt';
    l.location = run.origin;
  }
}

function buildRunFromOd(
  od: OdPair,
  id: string,
  trainNumber: string,
  driverId: string,
  locoId: string,
  progress: number,
  delayMinutes: number,
): TrainRun {
  const duration = od.plannedDurationMin || Math.round(estimateKm(od.origin, od.destination) / 0.9);
  return {
    id,
    trainNumber,
    cargo: od.cargo,
    origin: od.origin,
    destination: od.destination,
    progress,
    plannedDurationMin: duration,
    elapsedMin: Math.round(duration * progress),
    delayMinutes,
    driverId,
    locoId,
    status: 'unterwegs',
    corridorId: corridorKey(od.origin, od.destination),
    dangerousGoods: Boolean(od.dangerousGoods),
  };
}

/** Startflotte je Rang — OD aus deutschlandweitem Pool. */
export function createSeedTrains(
  drivers: Driver[],
  locos: Locomotive[],
  rank: DispatcherRank = 1,
): TrainRun[] {
  const max = RANK_META[rank].maxTrains;
  const usableLocos = locos.filter((l) => l.status !== 'wartung');
  const usableDrivers = drivers.filter((d) => d.status !== 'krank');
  const count = Math.min(max, OD_POOL.length, usableLocos.length, usableDrivers.length);
  const runs: TrainRun[] = [];

  for (let i = 0; i < count; i++) {
    const od = OD_POOL[i % OD_POOL.length]!;
    const progress = 0.12 + (i % 6) * 0.1;
    const run = buildRunFromOd(
      od,
      `run-${i + 1}`,
      `GZ ${51200 + i * 173}`,
      usableDrivers[i]!.id,
      usableLocos[i]!.id,
      progress,
      i % 4 === 0 ? 8 : i % 3 === 0 ? 3 : 0,
    );
    bindRun(run, drivers, locos);
    runs.push(run);
  }
  return runs;
}

/**
 * Hält die aktive Zugzahl auf Rang-Niveau: nach Ankunft neue Läufe mit frischen OD.
 */
export function refillTrainsToRank(
  trains: TrainRun[],
  drivers: Driver[],
  locos: Locomotive[],
  rank: DispatcherRank,
): TrainRun[] {
  const max = RANK_META[rank].maxTrains;
  const active = trains.filter((t) => t.status === 'unterwegs' || t.status === 'halt' || t.status === 'gestoert');
  if (active.length >= max) return trains;

  const next = trains.map((t) => ({ ...t }));
  const nextDrivers = drivers;
  const nextLocos = locos;
  let need = max - active.length;
  let seq = next.length + 1;

  while (need > 0) {
    const freeDriver = nextDrivers.find((d) => d.status === 'bereit' && d.remainingDutyMinutes > 90);
    const freeLoco = nextLocos.find((l) => l.status === 'bereit');
    if (!freeDriver || !freeLoco) break;

    const od = OD_POOL[(seq * 5 + rank * 3) % OD_POOL.length]!;
    const run = buildRunFromOd(
      od,
      `run-${Date.now().toString(36)}-${seq}`,
      `GZ ${50000 + ((seq * 37) % 40000)}`,
      freeDriver.id,
      freeLoco.id,
      0.05 + (seq % 5) * 0.04,
      seq % 3 === 0 ? 4 : 0,
    );
    bindRun(run, nextDrivers, nextLocos);
    next.push(run);
    seq += 1;
    need -= 1;
  }

  return next;
}

/** Beim Schichtantritt / nach Beförderung: Flotte auf Rang-Soll bringen. */
export function scaleFleetForRank(
  trains: TrainRun[],
  drivers: Driver[],
  locos: Locomotive[],
  rank: DispatcherRank,
): { trains: TrainRun[]; drivers: Driver[]; locos: Locomotive[] } {
  const nextDrivers = drivers.map((d) => ({ ...d }));
  const nextLocos = locos.map((l) => ({ ...l }));
  let nextTrains = trains.map((t) => ({ ...t }));
  nextTrains = refillTrainsToRank(nextTrains, nextDrivers, nextLocos, rank);
  return { trains: nextTrains, drivers: nextDrivers, locos: nextLocos };
}

export function nodeById(id: string): CorridorNode {
  return NODES.find((n) => n.id === id) ?? NODES[0]!;
}

export function corridorById(id: string): Corridor {
  return CORRIDORS.find((c) => c.id === id) ?? CORRIDORS[0]!;
}

/** Position entlang der gerouteten Zugstrecke (Knotennetz). */
export function trainLatLngForRun(train: Pick<TrainRun, 'origin' | 'destination' | 'progress'>): {
  lat: number;
  lng: number;
} {
  const path = railRouteLatLngs(train.origin, train.destination);
  return pointAlongLatLngPath(path, train.progress);
}

/** @deprecated — nutze trainLatLngForRun */
export function trainLatLng(corridorId: string, progress: number): { lat: number; lng: number } {
  const parts = corridorId.split('→');
  if (parts.length === 2) {
    return trainLatLngForRun({ origin: parts[0]!, destination: parts[1]!, progress });
  }
  const c = corridorById(corridorId);
  const a = RAIL_STATIONS[c.from] ?? { lat: 50.1, lng: 8.7, label: '' };
  const b = RAIL_STATIONS[c.to] ?? { lat: 48.1, lng: 11.6, label: '' };
  return lerpLatLng(a, b, progress);
}
