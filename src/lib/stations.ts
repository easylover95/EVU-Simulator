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
  maschen: { lat: 53.4, lng: 10.11, label: 'Maschen Rbf' },
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
  'duisburg hafen': 'duisburg',
  mannheim: 'mannheim',
  'mannheim rbf': 'mannheim',
  karlsruhe: 'karlsruhe',
  basel: 'basel',
  maschen: 'maschen',
  'maschen rbf': 'maschen',
  'hamburg hafen': 'hamburg',
  'muenchen ost': 'muenchen',
  'koeln gremberg': 'koeln',
  'leipzig engelsdorf': 'leipzig',
};

export const TRUNK_CORRIDORS: Array<[keyof typeof RAIL_STATIONS, keyof typeof RAIL_STATIONS]> = [
  ['hamburg', 'hannover'],
  ['hannover', 'fulda'],
  ['fulda', 'nuernberg'],
  ['nuernberg', 'muenchen'],
  ['nuernberg', 'ingolstadt'],
  ['ingolstadt', 'muenchen'],
  ['koeln', 'frankfurt'],
  ['frankfurt', 'wuerzburg'],
  ['wuerzburg', 'nuernberg'],
  ['wuerzburg', 'fulda'],
  ['leipzig', 'halle'],
  ['leipzig', 'nuernberg'],
  ['passau', 'regensburg'],
  ['regensburg', 'nuernberg'],
  ['bayreuth', 'nuernberg'],
  ['bayreuth', 'regensburg'],
  ['salzgitter', 'hannover'],
  ['stuttgart', 'augsburg'],
  ['augsburg', 'muenchen'],
  ['ludwigshafen', 'mannheim'],
  ['mannheim', 'frankfurt'],
  ['frankfurt', 'koeln'],
  ['koeln', 'duisburg'],
  ['duisburg', 'dortmund'],
  ['hamburg', 'maschen'],
  ['maschen', 'hannover'],
  ['passau', 'augsburg'],
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
