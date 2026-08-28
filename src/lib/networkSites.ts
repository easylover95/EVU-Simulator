export const STARTER_SITE_ID = 'duisburg';

export type SiteFreightCategory = 'gleisbau' | 'stahl' | 'chemie' | 'energie' | 'intermodal';

export type DepotRegion = 'ruhr' | 'nord' | 'sued' | 'ost' | 'mitte' | 'west';

export interface NetworkSiteRoute {
  origin: string;
  destination: string;
  distanceKm: number;
  electrified: boolean;
}

export interface NetworkSite {
  id: string;
  name: string;
  city: string;
  nodeLabel: string;
  region: DepotRegion;
  cost: number;
  unlockLevel: number;
  addLocoBerths: number;
  addWagonBerths: number;
  addWorkshopSlots: number;
  addStaffSlots: number;
  flavor: string;
  cargoHint: string;
  categories: SiteFreightCategory[];
  stations: string[];
  routes: NetworkSiteRoute[];
  starter?: boolean;
}

/**
 * Betriebsstellen an realen Knoten des bestehenden Netzes.
 * Starter Duisburg ist bereits in BASE_*-Kapazität enthalten (add* = 0).
 * Zukäufe erhöhen Lok-, Wagen- und Personal-Kapazität proportional.
 */
export const NETWORK_SITES: readonly NetworkSite[] = [
  {
    id: STARTER_SITE_ID,
    name: 'EVU-Betriebshof Duisburg',
    city: 'Duisburg',
    nodeLabel: 'Duisburg Hafen',
    region: 'ruhr',
    cost: 0,
    unlockLevel: 1,
    addLocoBerths: 0,
    addWagonBerths: 0,
    addWorkshopSlots: 0,
    addStaffSlots: 0,
    flavor: 'Schwergut und Stahl im Ruhrgebiet',
    cargoHint: 'Coil, Erz, Kohle',
    categories: ['stahl', 'energie'],
    stations: ['Duisburg', 'Duisburg Hafen', 'Dortmund'],
    starter: true,
    routes: [
      { origin: 'Duisburg Hafen', destination: 'Dortmund', distanceKm: 55, electrified: true },
      { origin: 'Duisburg Hafen', destination: 'Anschlussgleis Thyssen', distanceKm: 22, electrified: false },
    ],
  },
  {
    id: 'hamburg-hafen',
    name: 'Hinterland-Terminal Hamburg Hafen',
    city: 'Hamburg',
    nodeLabel: 'Hamburg Hafen',
    region: 'nord',
    cost: 82_000,
    unlockLevel: 2,
    addLocoBerths: 3,
    addWagonBerths: 24,
    addWorkshopSlots: 1,
    addStaffSlots: 6,
    flavor: 'Hafen-Hinterland Hamburg',
    cargoHint: 'Seecontainer, Hinterlandboxen',
    categories: ['intermodal', 'chemie'],
    stations: ['Hamburg Hafen', 'Hamburg Billwerder', 'Hamburg'],
    routes: [
      { origin: 'Hamburg Hafen', destination: 'Hannover', distanceKm: 180, electrified: true },
      { origin: 'Hamburg Hafen', destination: 'Berlin', distanceKm: 290, electrified: true },
      { origin: 'Hamburg Billwerder', destination: 'Anschlussgleis Raffinerie', distanceKm: 28, electrified: false },
    ],
  },
  {
    id: 'maschen-rbf',
    name: 'Rangierbahnhof Maschen',
    city: 'Maschen',
    nodeLabel: 'Maschen Rbf',
    region: 'nord',
    cost: 96_000,
    unlockLevel: 3,
    addLocoBerths: 3,
    addWagonBerths: 28,
    addWorkshopSlots: 1,
    addStaffSlots: 6,
    flavor: 'Massen- und Ganzzüge über Maschen Rbf',
    cargoHint: 'Erz, Kohle, Getreide',
    categories: ['energie', 'stahl'],
    stations: ['Maschen Rbf', 'Hamburg', 'Hannover'],
    routes: [
      { origin: 'Maschen Rbf', destination: 'Hannover', distanceKm: 155, electrified: true },
      { origin: 'Maschen Rbf', destination: 'Leipzig Hbf', distanceKm: 340, electrified: true },
    ],
  },
  {
    id: 'muenchen-ost',
    name: 'Betriebsstelle München Ost',
    city: 'München',
    nodeLabel: 'München Ost',
    region: 'sued',
    cost: 108_000,
    unlockLevel: 3,
    addLocoBerths: 3,
    addWagonBerths: 24,
    addWorkshopSlots: 1,
    addStaffSlots: 6,
    flavor: 'Süddeutschland und Alpine Zulaufstrecken',
    cargoHint: 'Intermodal, Papier, Biomasse',
    categories: ['intermodal', 'energie'],
    stations: ['München Ost', 'München-Riem', 'Augsburg', 'Ingolstadt'],
    routes: [
      { origin: 'München Ost', destination: 'Augsburg', distanceKm: 62, electrified: true },
      { origin: 'München-Riem', destination: 'Innsbruck', distanceKm: 175, electrified: true },
      { origin: 'München Ost', destination: 'Baugleis Ingolstadt', distanceKm: 85, electrified: false },
    ],
  },
  {
    id: 'koeln-gremberg',
    name: 'Knoten Köln-Gremberg',
    city: 'Köln',
    nodeLabel: 'Köln-Gremberg',
    region: 'west',
    cost: 88_000,
    unlockLevel: 2,
    addLocoBerths: 2,
    addWagonBerths: 20,
    addWorkshopSlots: 1,
    addStaffSlots: 5,
    flavor: 'Rheinschiene und Chemie-Zubringer',
    cargoHint: 'Kesselwagen, Container',
    categories: ['chemie', 'intermodal'],
    stations: ['Köln', 'Köln-Gremberg', 'Köln-Niehl'],
    routes: [
      { origin: 'Köln-Gremberg', destination: 'Frankfurt', distanceKm: 190, electrified: true },
      { origin: 'Köln', destination: 'Duisburg', distanceKm: 65, electrified: true },
    ],
  },
  {
    id: 'leipzig-engelsdorf',
    name: 'Rangierbahnhof Leipzig-Engelsdorf',
    city: 'Leipzig',
    nodeLabel: 'Leipzig-Engelsdorf',
    region: 'ost',
    cost: 74_000,
    unlockLevel: 2,
    addLocoBerths: 2,
    addWagonBerths: 20,
    addWorkshopSlots: 1,
    addStaffSlots: 5,
    flavor: 'Ostkorridor Mitteldeutschland',
    cargoHint: 'Schotter, Kali, Baustoffe',
    categories: ['gleisbau', 'energie'],
    stations: ['Leipzig Hbf', 'Leipzig-Engelsdorf', 'Halle', 'Dresden'],
    routes: [
      { origin: 'Leipzig-Engelsdorf', destination: 'Halle', distanceKm: 35, electrified: true },
      { origin: 'Leipzig Hbf', destination: 'Dresden', distanceKm: 120, electrified: true },
      { origin: 'Leipzig Hbf', destination: 'Baugleis Halle', distanceKm: 35, electrified: false },
    ],
  },
  {
    id: 'mannheim-rbf',
    name: 'Mannheim Rangierbahnhof',
    city: 'Mannheim',
    nodeLabel: 'Mannheim Rbf',
    region: 'mitte',
    cost: 91_000,
    unlockLevel: 3,
    addLocoBerths: 2,
    addWagonBerths: 22,
    addWorkshopSlots: 1,
    addStaffSlots: 5,
    flavor: 'Chemiepark und Südwest-Korridor',
    cargoHint: 'Chemikalien, Kraftstoff',
    categories: ['chemie', 'stahl'],
    stations: ['Mannheim', 'Mannheim Rbf', 'Ludwigshafen Chemiepark', 'Karlsruhe'],
    routes: [
      { origin: 'Ludwigshafen Chemiepark', destination: 'Mannheim', distanceKm: 20, electrified: true },
      { origin: 'Mannheim Rbf', destination: 'Karlsruhe', distanceKm: 70, electrified: true },
      { origin: 'Ludwigshafen Chemiepark', destination: 'Anschlussgleis Werk Süd', distanceKm: 8, electrified: false },
    ],
  },
] as const;

export interface SiteCapacityBonus {
  loco: number;
  wagon: number;
  workshop: number;
  staff: number;
}

export function networkSiteById(id: string | null | undefined): NetworkSite | undefined {
  if (!id) return undefined;
  return NETWORK_SITES.find((site) => site.id === id);
}

export function knownNetworkSiteIds(): Set<string> {
  return new Set(NETWORK_SITES.map((site) => site.id));
}

export function normalizeOwnedSiteIds(ids: unknown): string[] {
  const known = knownNetworkSiteIds();
  const raw = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && known.has(id)) : [];
  if (!raw.includes(STARTER_SITE_ID)) return [STARTER_SITE_ID, ...raw];
  return [...new Set(raw)];
}

export function siteCapacityBonus(ownedSiteIds: string[] | null | undefined): SiteCapacityBonus {
  const owned = new Set(normalizeOwnedSiteIds(ownedSiteIds));
  return NETWORK_SITES.reduce(
    (sum, site) => {
      if (!owned.has(site.id) || site.starter) return sum;
      return {
        loco: sum.loco + site.addLocoBerths,
        wagon: sum.wagon + site.addWagonBerths,
        workshop: sum.workshop + site.addWorkshopSlots,
        staff: sum.staff + site.addStaffSlots,
      };
    },
    { loco: 0, wagon: 0, workshop: 0, staff: 0 },
  );
}

export function ownedNetworkSites(ownedSiteIds: string[] | null | undefined): NetworkSite[] {
  const owned = new Set(normalizeOwnedSiteIds(ownedSiteIds));
  return NETWORK_SITES.filter((site) => owned.has(site.id));
}

export function purchasableNetworkSites(ownedSiteIds: string[] | null | undefined): NetworkSite[] {
  const owned = new Set(normalizeOwnedSiteIds(ownedSiteIds));
  return NETWORK_SITES.filter((site) => !site.starter && !owned.has(site.id));
}

export function ownedRegions(ownedSiteIds: string[] | null | undefined): DepotRegion[] {
  return [...new Set(ownedNetworkSites(ownedSiteIds).map((site) => site.region))];
}

export function siteStations(ownedSiteIds: string[] | null | undefined): string[] {
  return ownedNetworkSites(ownedSiteIds).flatMap((site) => site.stations);
}

export const RELOCATION_COST = 650;

export function regionLabel(region: DepotRegion): string {
  switch (region) {
    case 'ruhr':
      return 'Ruhrgebiet';
    case 'nord':
      return 'Nord / Häfen';
    case 'sued':
      return 'Süddeutschland';
    case 'ost':
      return 'Mitteldeutschland Ost';
    case 'mitte':
      return 'Rhein-Main / Südwest';
    case 'west':
      return 'Rheinschiene';
    default:
      return region;
  }
}
