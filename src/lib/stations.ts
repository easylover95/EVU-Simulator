export interface StationCoord {
  lat: number;
  lng: number;
  label: string;
}

/** Canonical German / European rail nodes used by orders and the live map. */
export const RAIL_STATIONS: Record<string, StationCoord> = {
  koeln: { lat: 50.943, lng: 6.958, label: 'Köln' },
  hamburg: { lat: 53.553, lng: 10.007, label: 'Hamburg' },
  nuernberg: { lat: 49.446, lng: 11.082, label: 'Nürnberg' },
  muenchen: { lat: 48.14, lng: 11.558, label: 'München' },
  leipzig: { lat: 51.345, lng: 12.382, label: 'Leipzig' },
  passau: { lat: 48.574, lng: 13.451, label: 'Passau' },
  fulda: { lat: 50.555, lng: 9.684, label: 'Fulda' },
  ingolstadt: { lat: 48.765, lng: 11.432, label: 'Ingolstadt' },
  bayreuth: { lat: 49.95, lng: 11.578, label: 'Bayreuth' },
  regensburg: { lat: 49.012, lng: 12.099, label: 'Regensburg' },
  salzgitter: { lat: 52.151, lng: 10.415, label: 'Salzgitter' },
  stuttgart: { lat: 48.784, lng: 9.252, label: 'Stuttgart' },
  wuerzburg: { lat: 49.802, lng: 9.936, label: 'Würzburg' },
  augsburg: { lat: 48.365, lng: 10.886, label: 'Augsburg' },
  halle: { lat: 51.48, lng: 11.987, label: 'Halle' },
  ludwigshafen: { lat: 49.481, lng: 8.447, label: 'Ludwigshafen' },
  berlin: { lat: 52.525, lng: 13.369, label: 'Berlin' },
  frankfurt: { lat: 50.107, lng: 8.663, label: 'Frankfurt' },
  hannover: { lat: 52.377, lng: 9.742, label: 'Hannover' },
  dresden: { lat: 51.04, lng: 13.732, label: 'Dresden' },
  dortmund: { lat: 51.518, lng: 7.46, label: 'Dortmund' },
  duisburg: { lat: 51.43, lng: 6.776, label: 'Duisburg' },
  mannheim: { lat: 49.48, lng: 8.47, label: 'Mannheim' },
  karlsruhe: { lat: 48.994, lng: 8.401, label: 'Karlsruhe' },
  basel: { lat: 47.547, lng: 7.59, label: 'Basel' },
};

const GERMANY_CENTER: StationCoord = { lat: 51.16, lng: 10.45, label: 'Mitteleuropa' };

const ALIASES: Record<string, keyof typeof RAIL_STATIONS> = {
  koeln: 'koeln',
  cologne: 'koeln',
  'koeln niehl': 'koeln',
  hamburg: 'hamburg',
  'hamburg billwerder': 'hamburg',
  nuernberg: 'nuernberg',
  nurnberg: 'nuernberg',
  'nuernberg rbf': 'nuernberg',
  muenchen: 'muenchen',
  munchen: 'muenchen',
  'muenchen riem': 'muenchen',
  leipzig: 'leipzig',
  'leipzig hbf': 'leipzig',
  passau: 'passau',
  fulda: 'fulda',
  'baugleis fulda': 'fulda',
  ingolstadt: 'ingolstadt',
  'baugleis ingolstadt': 'ingolstadt',
  bayreuth: 'bayreuth',
  regensburg: 'regensburg',
  salzgitter: 'salzgitter',
  stuttgart: 'stuttgart',
  'stuttgart untertuerkheim': 'stuttgart',
  wuerzburg: 'wuerzburg',
  wurzburg: 'wuerzburg',
  'wuerzburg hbf': 'wuerzburg',
  augsburg: 'augsburg',
  halle: 'halle',
  'baugleis halle': 'halle',
  'baugleis koeln': 'koeln',
  'baugleis duisburg': 'duisburg',
  'baugleis hannover': 'hannover',
  'baugleis wuerzburg': 'wuerzburg',
  'baugleis leipzig': 'leipzig',
  'baugleis stuttgart': 'stuttgart',
  'baugleis berlin': 'berlin',
  'baugleis dresden': 'dresden',
  bremerhaven: 'hamburg',
  wolfsburg: 'salzgitter',
  emden: 'hannover',
  ludwigshafen: 'ludwigshafen',
  'ludwigshafen basf': 'ludwigshafen',
  berlin: 'berlin',
  frankfurt: 'frankfurt',
  hannover: 'hannover',
  dresden: 'dresden',
  dortmund: 'dortmund',
  duisburg: 'duisburg',
  mannheim: 'mannheim',
  karlsruhe: 'karlsruhe',
  basel: 'basel',
};

export const TRUNK_CORRIDORS: Array<[keyof typeof RAIL_STATIONS, keyof typeof RAIL_STATIONS]> = [
  // Nord–Süd
  ['hamburg', 'hannover'],
  ['hannover', 'fulda'],
  ['fulda', 'nuernberg'],
  ['nuernberg', 'muenchen'],
  ['nuernberg', 'ingolstadt'],
  ['ingolstadt', 'muenchen'],
  ['hamburg', 'berlin'],
  ['berlin', 'hannover'],
  ['berlin', 'leipzig'],
  ['berlin', 'dresden'],
  ['dresden', 'leipzig'],
  // West–Ost / Mitte
  ['koeln', 'frankfurt'],
  ['frankfurt', 'wuerzburg'],
  ['wuerzburg', 'nuernberg'],
  ['wuerzburg', 'fulda'],
  ['leipzig', 'halle'],
  ['leipzig', 'nuernberg'],
  ['hannover', 'dortmund'],
  // Rhein / Ruhr / Südwest
  ['mannheim', 'frankfurt'],
  ['frankfurt', 'koeln'],
  ['koeln', 'duisburg'],
  ['duisburg', 'dortmund'],
  ['ludwigshafen', 'mannheim'],
  ['mannheim', 'karlsruhe'],
  ['karlsruhe', 'stuttgart'],
  ['stuttgart', 'mannheim'],
  ['stuttgart', 'augsburg'],
  ['augsburg', 'muenchen'],
  ['karlsruhe', 'basel'],
  // Bayern Ost
  ['passau', 'regensburg'],
  ['regensburg', 'nuernberg'],
  ['bayreuth', 'nuernberg'],
  ['bayreuth', 'regensburg'],
  ['passau', 'augsburg'],
  ['salzgitter', 'hannover'],
];

function fold(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hashOffset(name: string): { lat: number; lng: number } {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return {
    lat: ((hash % 17) - 8) * 0.04,
    lng: (((hash >> 4) % 17) - 8) * 0.04,
  };
}

/** Resolve a free-text origin/destination to lat/lng. Unknown names fall back near Germany's center. */
export function lookupStation(name: string | null | undefined): StationCoord {
  if (!name) return GERMANY_CENTER;
  const key = fold(name);
  const alias = ALIASES[key];
  if (alias) return RAIL_STATIONS[alias];

  for (const [aliasKey, stationKey] of Object.entries(ALIASES)) {
    if (key.includes(aliasKey) || aliasKey.includes(key)) {
      return RAIL_STATIONS[stationKey];
    }
  }

  for (const station of Object.values(RAIL_STATIONS)) {
    if (fold(station.label) && (key.includes(fold(station.label)) || fold(station.label).includes(key))) {
      return station;
    }
  }

  const offset = hashOffset(key);
  return {
    lat: GERMANY_CENTER.lat + offset.lat,
    lng: GERMANY_CENTER.lng + offset.lng,
    label: name,
  };
}

export function lerpLatLng(
  from: StationCoord,
  to: StationCoord,
  t: number,
): { lat: number; lng: number } {
  const k = Math.max(0, Math.min(1, t));
  return {
    lat: from.lat + (to.lat - from.lat) * k,
    lng: from.lng + (to.lng - from.lng) * k,
  };
}

export type StationKey = keyof typeof RAIL_STATIONS;

/** Canonical Station-Key aus Freitext (oder null). */
export function resolveStationKey(name: string | null | undefined): StationKey | null {
  if (!name) return null;
  const key = fold(name);
  const alias = ALIASES[key];
  if (alias) return alias;

  for (const [aliasKey, stationKey] of Object.entries(ALIASES)) {
    if (key.includes(aliasKey) || aliasKey.includes(key)) return stationKey;
  }

  for (const [stationKey, station] of Object.entries(RAIL_STATIONS)) {
    if (fold(station.label) === key) return stationKey as StationKey;
  }
  return null;
}

function haversineKm(a: StationCoord, b: StationCoord): number {
  const dLat = (a.lat - b.lat) * 111;
  const dLng = (a.lng - b.lng) * 75;
  return Math.hypot(dLat, dLng);
}

let adjacencyCache: Map<StationKey, StationKey[]> | null = null;

function railAdjacency(): Map<StationKey, StationKey[]> {
  if (adjacencyCache) return adjacencyCache;
  const g = new Map<StationKey, StationKey[]>();
  const link = (a: StationKey, b: StationKey) => {
    if (!g.has(a)) g.set(a, []);
    if (!g.has(b)) g.set(b, []);
    if (!g.get(a)!.includes(b)) g.get(a)!.push(b);
    if (!g.get(b)!.includes(a)) g.get(b)!.push(a);
  };
  for (const [a, b] of TRUNK_CORRIDORS) link(a, b);
  adjacencyCache = g;
  return g;
}

/** Kürzester Pfad über Hauptknoten (BFS, Kantenlänge ≈ km). */
export function findRailStationPath(fromKey: StationKey, toKey: StationKey): StationKey[] | null {
  if (fromKey === toKey) return [fromKey];
  const g = railAdjacency();
  if (!g.has(fromKey) || !g.has(toKey)) return null;

  const prev = new Map<StationKey, StationKey | null>();
  const dist = new Map<StationKey, number>();
  const queue: StationKey[] = [fromKey];
  prev.set(fromKey, null);
  dist.set(fromKey, 0);

  while (queue.length > 0) {
    // simples Dijkstra ohne Heap — Graph ist klein
    queue.sort((a, b) => (dist.get(a) ?? 1e9) - (dist.get(b) ?? 1e9));
    const cur = queue.shift()!;
    if (cur === toKey) break;
    const curDist = dist.get(cur) ?? 1e9;
    for (const nb of g.get(cur) ?? []) {
      const w = haversineKm(RAIL_STATIONS[cur], RAIL_STATIONS[nb]);
      const next = curDist + w;
      if (next < (dist.get(nb) ?? 1e9)) {
        dist.set(nb, next);
        prev.set(nb, cur);
        if (!queue.includes(nb)) queue.push(nb);
      }
    }
  }

  if (!prev.has(toKey)) return null;
  const path: StationKey[] = [];
  let walk: StationKey | null = toKey;
  while (walk) {
    path.push(walk);
    walk = prev.get(walk) ?? null;
  }
  path.reverse();
  return path;
}

export type RailWaypoint = { lat: number; lng: number; label: string; key?: StationKey };

/**
 * Geometrische Zugstrecke entlang des Knotennetzes (keine Luftlinie).
 * Fallback: direkte Start→Ziel-Linie.
 */
export function railRouteWaypoints(origin: string, destination: string): RailWaypoint[] {
  const fromKey = resolveStationKey(origin);
  const toKey = resolveStationKey(destination);
  const from = lookupStation(origin);
  const to = lookupStation(destination);

  if (fromKey && toKey) {
    const keys = findRailStationPath(fromKey, toKey);
    if (keys && keys.length >= 2) {
      return keys.map((k) => {
        const s = RAIL_STATIONS[k];
        return { lat: s.lat, lng: s.lng, label: s.label, key: k };
      });
    }
  }

  return [
    { lat: from.lat, lng: from.lng, label: from.label || origin },
    { lat: to.lat, lng: to.lng, label: to.label || destination },
  ];
}

export function railRouteLatLngs(
  origin: string,
  destination: string,
): Array<{ lat: number; lng: number }> {
  return railRouteWaypoints(origin, destination).map(({ lat, lng }) => ({ lat, lng }));
}

/** Position auf einer Polyline (0–1 entlang der Gesamtlänge). */
export function pointAlongLatLngPath(
  path: Array<{ lat: number; lng: number }>,
  t: number,
): { lat: number; lng: number } {
  if (path.length === 0) return { lat: GERMANY_CENTER.lat, lng: GERMANY_CENTER.lng };
  if (path.length === 1) return path[0]!;
  const k = Math.max(0, Math.min(1, t));

  const segLens: number[] = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const len = Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 75);
    segLens.push(len);
    total += len;
  }
  if (total <= 0) return path[0]!;

  let remain = k * total;
  for (let i = 0; i < segLens.length; i++) {
    const len = segLens[i]!;
    if (remain <= len) {
      const local = len <= 0 ? 0 : remain / len;
      const a = path[i]!;
      const b = path[i + 1]!;
      return {
        lat: a.lat + (b.lat - a.lat) * local,
        lng: a.lng + (b.lng - a.lng) * local,
      };
    }
    remain -= len;
  }
  return path[path.length - 1]!;
}
