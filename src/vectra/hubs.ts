/** Freie HQ-/Hub-Wahl (CTS-Style) — EVU bleibt Rhein-Ruhr Cargo. */

export type HubId =
  | 'duisburg-ruhrort'
  | 'hamburg-altona'
  | 'koeln-eifeltor'
  | 'muenchen-ost'
  | 'altena';

export interface HubDef {
  id: HubId;
  name: string;
  city: string;
  regionHint: string;
  lat: number;
  lng: number;
  /** Station labels for Tier-1 regio OD matching */
  regionStations: string[];
}

export const HUBS: HubDef[] = [
  {
    id: 'duisburg-ruhrort',
    name: 'Duisburg-Ruhrort HQ',
    city: 'Duisburg',
    regionHint: 'Ruhrgebiet · Nahübergaben & Baustellenlogistik',
    lat: 51.45,
    lng: 6.75,
    regionStations: ['Duisburg', 'Dortmund', 'Köln', 'Essen', 'Hagen'],
  },
  {
    id: 'hamburg-altona',
    name: 'Hamburg-Altona Hub',
    city: 'Hamburg',
    regionHint: 'Nord · Hafen-Zubringer & Intermodal',
    lat: 53.55,
    lng: 9.93,
    regionStations: ['Hamburg', 'Hannover', 'Bremen', 'Lübeck'],
  },
  {
    id: 'koeln-eifeltor',
    name: 'Köln-Eifeltor',
    city: 'Köln',
    regionHint: 'Rheinschiene · Container & Chemie',
    lat: 50.9,
    lng: 6.95,
    regionStations: ['Köln', 'Duisburg', 'Dortmund', 'Frankfurt', 'Mannheim'],
  },
  {
    id: 'muenchen-ost',
    name: 'München Ost',
    city: 'München',
    regionHint: 'Süd · Automotive & Alpenvorlauf',
    lat: 48.14,
    lng: 11.6,
    regionStations: ['München', 'Augsburg', 'Nürnberg', 'Stuttgart', 'Passau'],
  },
  {
    id: 'altena',
    name: 'Altena Stützpunkt',
    city: 'Altena',
    regionHint: 'Märkischer Kreis · Regio & Sperrpausen',
    lat: 51.3,
    lng: 7.67,
    regionStations: ['Altena', 'Hagen', 'Dortmund', 'Duisburg', 'Köln'],
  },
];

export function hubById(id: HubId | string | null | undefined): HubDef {
  return HUBS.find((h) => h.id === id) ?? HUBS[0]!;
}

export function defaultHubId(): HubId {
  return 'duisburg-ruhrort';
}
