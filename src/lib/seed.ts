import type {
  AssignmentWithDetails,
  Company,
  Driver,
  Locomotive,
  Notification,
  Order,
  Wagon,
} from '@/lib/supabase';
import { GAME_EPOCH, GAME_EPOCH_ISO, MS_PER_TICK } from '@/lib/gameTime';
import { applyFreightPricing } from '@/lib/orderMarket';

const nowIso = GAME_EPOCH_ISO;

function hoursAgo(hours: number): string {
  return new Date(GAME_EPOCH.getTime() - hours * MS_PER_TICK).toISOString();
}

function hoursAhead(hours: number): string {
  return new Date(GAME_EPOCH.getTime() + hours * MS_PER_TICK).toISOString();
}

/** Shared starter-kit IDs so SQL seed and local fallback stay aligned. */
export const STARTER_IDS = {
  loco218: 'a18e0218-0000-4000-8000-000000000218',
  loco218b: 'a18e0218-0000-4000-8000-000000000219',
  loco218c: 'a18e0218-0000-4000-8000-000000000220',
  loco272: 'a18e0272-0000-4000-8000-000000000272',
  loco272b: 'a18e0272-0000-4000-8000-000000000273',
  locoVectronA: 'a18e0193-0000-4000-8000-000000000193',
  locoVectronB: 'a18e0193-0000-4000-8000-000000000194',
  locoVectronC: 'a18e0193-0000-4000-8000-000000000195',
  driverAndreas: 'a18e0101-0000-4000-8000-000000000101',
  driverJuergen: 'a18e0102-0000-4000-8000-000000000102',
  driverKlaus: 'a18e0103-0000-4000-8000-000000000103',
  driverMarkus: 'a18e0104-0000-4000-8000-000000000104',
  driverMichael: 'a18e0105-0000-4000-8000-000000000105',
  driverPeter: 'a18e0106-0000-4000-8000-000000000106',
  driverStefan: 'a18e0107-0000-4000-8000-000000000107',
  driverThomas: 'a18e0108-0000-4000-8000-000000000108',
  wagonRes: 'a18e0301-0000-4000-8000-000000000301',
  wagonEanos: 'a18e0309-0000-4000-8000-000000000309',
  /** Retired large-fleet starter packs — kept so merge/SQL can drop them. */
  wagonFacns: 'a18e0302-0000-4000-8000-000000000302',
  wagonResMaint: 'a18e0303-0000-4000-8000-000000000303',
  wagonFacnsExpired: 'a18e0304-0000-4000-8000-000000000304',
  wagonSggrss: 'a18e0305-0000-4000-8000-000000000305',
  wagonSggrssMaint: 'a18e0306-0000-4000-8000-000000000306',
  wagonZans: 'a18e0307-0000-4000-8000-000000000307',
  wagonZansExpired: 'a18e0308-0000-4000-8000-000000000308',
  order001: 'a18e0501-0000-4000-8000-000000000501',
  order002: 'a18e0502-0000-4000-8000-000000000502',
  order003: 'a18e0503-0000-4000-8000-000000000503',
  order004: 'a18e0504-0000-4000-8000-000000000504',
  order005: 'a18e0505-0000-4000-8000-000000000505',
  order006: 'a18e0506-0000-4000-8000-000000000506',
  order007: 'a18e0507-0000-4000-8000-000000000507',
  order008: 'a18e0508-0000-4000-8000-000000000508',
  assignPeter: 'a18e0601-0000-4000-8000-000000000601',
  assignStefan: 'a18e0602-0000-4000-8000-000000000602',
  notifWelcome: 'a18e0401-0000-4000-8000-000000000401',
} as const;

export const SEED_COMPANY: Company = {
  id: 1,
  name: 'AixRail GmbH',
  hq_location: 'Duisburg',
  balance: 150000,
  reputation: 0,
  level: 1,
  xp: 0,
  xp_next: 1000,
  tick: 0,
  updated_at: nowIso,
};

export const SEED_LOCOMOTIVES: Locomotive[] = [
  {
    id: STARTER_IDS.loco218,
    designation: 'BR 218',
    name: '218 312-7',
    status: 'frei',
    fuel_type: 'diesel',
    fuel_level: 100,
    brake_pct: 100,
    last_service: '2026-07-15',
    power_kw: 1840,
    max_speed: 140,
    weight_t: 80,
    created_at: nowIso,
    country_packages: ['D'],
  },
  {
    id: STARTER_IDS.loco218b,
    designation: 'BR 218',
    name: '218 389-3',
    status: 'frei',
    fuel_type: 'diesel',
    fuel_level: 100,
    brake_pct: 100,
    last_service: '2026-06-28',
    power_kw: 1840,
    max_speed: 140,
    weight_t: 80,
    created_at: nowIso,
    country_packages: ['D'],
  },
];

export const SEED_DRIVERS: Driver[] = [
  {
    id: STARTER_IDS.driverAndreas,
    name: 'Andreas Fischer',
    status: 'verfuegbar',
    qualifications: ['Tf'],
    hours_worked: 18,
    max_hours: 48,
    last_rest_end: hoursAgo(15),
    shift_start: null,
    phone: '+49 176 3344556',
    created_at: nowIso,
    recovery_hours_left: null,
  },
  {
    id: STARTER_IDS.driverJuergen,
    name: 'Jürgen Hoffmann',
    status: 'verfuegbar',
    qualifications: ['Tf'],
    hours_worked: 12,
    max_hours: 48,
    last_rest_end: hoursAgo(17),
    shift_start: null,
    phone: '+49 170 4455667',
    created_at: nowIso,
    recovery_hours_left: null,
  },
];

/** Retired large-fleet pack IDs so SQL / mergeWithSeed do not keep the old 35-wagon park. */
const RETIRED_STARTER_WAGON_IDS = new Set<string>([
  STARTER_IDS.wagonFacns,
  STARTER_IDS.wagonResMaint,
  STARTER_IDS.wagonFacnsExpired,
  STARTER_IDS.wagonSggrss,
  STARTER_IDS.wagonSggrssMaint,
  STARTER_IDS.wagonZans,
  STARTER_IDS.wagonZansExpired,
]);

/** Exactly 10 starter Güterwagen: 6× Res (Baugleis/Coils) + 4× Eanos (Schüttgut). */
export const SEED_WAGONS: Wagon[] = [
  {
    id: STARTER_IDS.wagonRes,
    type_code: 'Res',
    type_name: 'Flachwagen',
    category: 'flach',
    capacity_t: 60,
    brake_position: 'P',
    tare_weight_t: 19,
    length_mm: 19000,
    status: 'verfuegbar',
    frist_level: 1,
    frist_date: '2027-02-23',
    count: 6,
    created_at: nowIso,
  },
  {
    id: STARTER_IDS.wagonEanos,
    type_code: 'Eanos',
    type_name: 'Offener Güterwagen',
    category: 'offen',
    capacity_t: 61,
    brake_position: 'G',
    tare_weight_t: 22,
    length_mm: 14000,
    status: 'verfuegbar',
    frist_level: 1,
    frist_date: '2027-03-15',
    count: 4,
    created_at: nowIso,
  },
];

const RAW_SEED_ORDERS: Order[] = [
  {
    id: STARTER_IDS.order001,
    order_number: 'EVU-2026-001',
    type: 'gueterverkehr',
    title: 'Holztransport Bayreuth–Regensburg',
    origin: 'Bayreuth',
    destination: 'Regensburg',
    distance_km: 120,
    weight_t: 800,
    yield: 18500,
    penalty: 250,
    deadline: hoursAhead(48),
    status: 'offen',
    notes: 'Schnittholz auf Eanos-Offenwagen, 4 Wagen, Strecke nicht elektrifiziert.',
    min_brh: 65,
    required_wagon_type: 'Eanos',
    required_wagon_count: 4,
    sperrpause_start: null,
    sperrpause_end: null,
    penalty_per_min: 0,
    created_at: nowIso,
    customer: 'EcoWood Biomasse',
    customer_id: 'ecowood',
  },
  {
    id: STARTER_IDS.order002,
    order_number: 'EVU-2026-002',
    type: 'gueterverkehr',
    title: 'Containerzug Hamburg–München',
    origin: 'Hamburg Billwerder',
    destination: 'München-Riem',
    distance_km: 790,
    weight_t: 1400,
    yield: 52000,
    penalty: 800,
    deadline: hoursAhead(72),
    status: 'offen',
    notes: 'Intermodal 6× Sggrss, elektrifizierte Magistrale Hamburg–München.',
    min_brh: 72,
    required_wagon_type: 'Sggrss',
    required_wagon_count: 6,
    sperrpause_start: null,
    sperrpause_end: null,
    penalty_per_min: 0,
    created_at: nowIso,
    customer: 'TransLog Intermodal',
    customer_id: 'translog',
  },
  {
    id: STARTER_IDS.order003,
    order_number: 'EVU-2026-003',
    type: 'baugleis',
    title: 'Schottertransport Baustelle Nürnberg–Ingolstadt',
    origin: 'Nürnberg Rbf',
    destination: 'Baugleis Ingolstadt',
    distance_km: 95,
    weight_t: 1200,
    yield: 42000,
    penalty: 5000,
    deadline: hoursAhead(24),
    status: 'offen',
    notes: 'ZEITKRITISCH! Gleisbau ABS 9, 12× Facns, Sperrpause 22:00–04:00 Uhr.',
    min_brh: 55,
    required_wagon_type: 'Facns',
    required_wagon_count: 12,
    sperrpause_start: '22:00',
    sperrpause_end: '04:00',
    penalty_per_min: 150,
    created_at: nowIso,
    customer: 'Schotter & Gleis Logistik',
    customer_id: 'schotter-gleis',
  },
  {
    id: STARTER_IDS.order004,
    order_number: 'EVU-2026-004',
    type: 'gueterverkehr',
    title: 'Stahlcoils Salzgitter–Stuttgart',
    origin: 'Salzgitter',
    destination: 'Stuttgart-Untertürkheim',
    distance_km: 510,
    weight_t: 1000,
    yield: 31000,
    penalty: 450,
    deadline: hoursAhead(96),
    status: 'offen',
    notes: 'Schwertransport Coils, 6× Res, Achslast beachten.',
    min_brh: 68,
    required_wagon_type: 'Res',
    required_wagon_count: 6,
    sperrpause_start: null,
    sperrpause_end: null,
    penalty_per_min: 0,
    created_at: nowIso,
    customer: 'Rhein-Ruhr Stahl AG',
    customer_id: 'rhein-ruhr-stahl',
  },
  {
    id: STARTER_IDS.order005,
    order_number: 'EVU-2026-005',
    type: 'baugleis',
    title: 'Oberleitungsmaterial Würzburg–Baugleis Fulda',
    origin: 'Würzburg Hbf',
    destination: 'Baugleis Fulda',
    distance_km: 110,
    weight_t: 600,
    yield: 38000,
    penalty: 4500,
    deadline: hoursAhead(30),
    status: 'offen',
    notes: 'ZEITKRITISCH! Oberleitungsneubau, 8× Res, Sperrpause 23:00–05:00 Uhr.',
    min_brh: 58,
    required_wagon_type: 'Res',
    required_wagon_count: 8,
    sperrpause_start: '23:00',
    sperrpause_end: '05:00',
    penalty_per_min: 120,
    created_at: nowIso,
    customer: 'TrackCon Bau',
    customer_id: 'trackcon',
  },
  {
    id: STARTER_IDS.order006,
    order_number: 'EVU-2026-006',
    type: 'gueterverkehr',
    title: 'Getreidetransport Passau–Augsburg',
    origin: 'Passau',
    destination: 'Augsburg',
    distance_km: 230,
    weight_t: 900,
    yield: 16000,
    penalty: 200,
    deadline: hoursAhead(48),
    status: 'offen',
    notes: 'Losschüttgut Getreide, 10× Tads.',
    min_brh: 62,
    required_wagon_type: 'Tads',
    required_wagon_count: 10,
    sperrpause_start: null,
    sperrpause_end: null,
    penalty_per_min: 0,
    created_at: nowIso,
    customer: 'Agrar Donau Getreide',
    customer_id: 'agrar-donau',
  },
  {
    id: STARTER_IDS.order007,
    order_number: 'EVU-2026-007',
    type: 'baugleis',
    title: 'Schwellenlieferung Baustelle Leipzig–Halle',
    origin: 'Leipzig Hbf',
    destination: 'Baugleis Halle',
    distance_km: 35,
    weight_t: 700,
    yield: 28500,
    penalty: 3200,
    deadline: hoursAhead(18),
    status: 'offen',
    notes: 'ZEITKRITISCH! Schwellenersatz, 6× Res, Sperrpause 20:00–03:00 Uhr.',
    min_brh: 62,
    required_wagon_type: 'Res',
    required_wagon_count: 6,
    sperrpause_start: '20:00',
    sperrpause_end: '03:00',
    penalty_per_min: 180,
    created_at: nowIso,
    customer: 'Deutsche Gleisbau GmbH',
    customer_id: 'deutsche-gleisbau',
  },
  {
    id: STARTER_IDS.order008,
    order_number: 'EVU-2026-008',
    type: 'gueterverkehr',
    title: 'Kesselwagen Chemie Ludwigshafen–Köln',
    origin: 'Ludwigshafen Chemiepark',
    destination: 'Köln-Niehl',
    distance_km: 280,
    weight_t: 600,
    yield: 24000,
    penalty: 350,
    deadline: hoursAgo(12),
    status: 'abgeschlossen',
    notes: 'Gefahrgut Zans, 3 Wagen, bereits abgewickelt.',
    min_brh: 74,
    required_wagon_type: 'Zans',
    required_wagon_count: 3,
    sperrpause_start: null,
    sperrpause_end: null,
    penalty_per_min: 0,
    created_at: nowIso,
    customer: 'ChemWorks Ludwigshafen',
    customer_id: 'chemworks',
  },
];

export const SEED_ORDERS: Order[] = RAW_SEED_ORDERS.map((order) => applyFreightPricing(order, SEED_COMPANY));

export const SEED_ASSIGNMENTS: AssignmentWithDetails[] = [];

export const SEED_NOTIFICATIONS: Notification[] = [
  {
    id: STARTER_IDS.notifWelcome,
    type: 'info',
    title: 'Betrieb gestartet',
    message:
      'Start: 150.000 €, 2 Dieselloks (BR 218), 10 Güterwagen (6× Res, 4× Eanos), 2 Triebfahrzeugführer. Bekanntheit 0. Dispo 25.000 €. Weitere Tf und AZF/RB über die Jobbörse, Loks beim Händler.',
    read: false,
    created_at: nowIso,
  },
];

export function mergeWithSeed<T extends { id: string }>(
  remote: T[] | null | undefined,
  seed: T[],
  altKey?: keyof T,
): T[] {
  if (!remote || remote.length === 0) return seed;
  const ids = new Set(remote.map((row) => row.id));
  const alts = altKey ? new Set(remote.map((row) => String(row[altKey] ?? ''))) : null;
  const extra = seed.filter((row) => {
    if (ids.has(row.id)) return false;
    if (alts && altKey && alts.has(String(row[altKey] ?? ''))) return false;
    return true;
  });
  return extra.length === 0 ? remote : [...remote, ...extra];
}

/** Starter packs always come from SEED_WAGONS; purchased extra wagons (other IDs) are kept. */
export function mergeWagonsWithSeed(remote: Wagon[] | null | undefined, seed: Wagon[]): Wagon[] {
  if (!remote || remote.length === 0) return seed;
  const seedIds = new Set(seed.map((row) => row.id));
  const extra = remote.filter((row) => !seedIds.has(row.id) && !RETIRED_STARTER_WAGON_IDS.has(row.id));
  return extra.length === 0 ? seed : [...seed, ...extra];
}
