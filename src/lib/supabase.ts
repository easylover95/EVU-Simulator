import { createClient } from '@supabase/supabase-js';

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const envUrl = viteEnv?.VITE_SUPABASE_URL?.trim();
const envKey = viteEnv?.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(
  envUrl && /^https?:\/\//i.test(envUrl) && envKey && envKey.length > 0,
);

const supabaseUrl = isSupabaseConfigured ? envUrl! : 'https://placeholder.supabase.co';
const supabaseAnonKey = isSupabaseConfigured
  ? envKey!
  : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJhbm9uIiwiaWF0IjoxfQ.placeholder';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type LocoStatus = 'frei' | 'einsatz' | 'v1' | 'wartung' | 'stillgelegt';
export type FuelType = 'diesel' | 'elektrik' | 'dual';
export type CountryPackage = 'D' | 'A' | 'CH' | 'PL' | 'CZ' | 'IT' | 'NL';
export type ExtraEquipment = 'pzb' | 'etcs' | 'funkfernsteuerung';
/** Selectable dealer extras (PZB is standard, not sold as a surcharge). */
export type SelectableExtraEquipment = Exclude<ExtraEquipment, 'pzb'>;
/** 1 frisch revidiert … 5 HU abgelaufen / Schrott */
export type ConditionClass = 1 | 2 | 3 | 4 | 5;
export type MaintenanceLevel = 'F' | 'ZU' | 'HU';
export type LocoFaultKind = 'antrieb' | 'bremse' | 'elektronik' | 'laufwerk';

export interface LocoFault {
  kind: LocoFaultKind;
  reportedAtTick: number;
}

/** Dual day/km counters since the last F / ZU / HU. */
export interface LocoMaintenance {
  conditionPct: number;
  conditionClass: ConditionClass;
  daysSinceF: number;
  kmSinceF: number;
  daysSinceZU: number;
  kmSinceZU: number;
  daysSinceHU: number;
  kmSinceHU: number;
  /** Set when a mechanical fault is reported; cleared after Reparatur. */
  fault?: LocoFault | null;
}
export type DriverStatus = 'verfuegbar' | 'im_einsatz' | 'pause' | 'urlaub' | 'krank';
export type OrderType = 'gueterverkehr' | 'baugleis';
export type OrderStatus = 'offen' | 'zugewiesen' | 'abgeschlossen' | 'abgelehnt';
export type AssignmentStatus = 'geplant' | 'aktiv' | 'abgeschlossen' | 'abgebrochen';
export type WagonStatus = 'verfuegbar' | 'im_einsatz' | 'wartung' | 'frist_abgelaufen';
export type WagonCategory = 'schotter' | 'flach' | 'container' | 'kessel' | 'offen' | 'schiebewand' | 'gedeckt';
export type BrakePosition = 'G' | 'P' | 'R';
export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Locomotive {
  id: string;
  designation: string;
  name: string;
  status: LocoStatus;
  fuel_type: FuelType;
  fuel_level: number;
  brake_pct: number;
  last_service: string | null;
  power_kw: number | null;
  max_speed: number | null;
  weight_t: number | null;
  created_at: string;
  maintenance?: LocoMaintenance;
  country_packages?: CountryPackage[];
  equipment?: ExtraEquipment[];
  /** Standard train protection. Always included; defaults true and is never charged. */
  pzb?: boolean;
  purchase_price?: number | null;
}

export interface Driver {
  id: string;
  name: string;
  status: DriverStatus;
  qualifications: string[];
  hours_worked: number;
  max_hours: number;
  last_rest_end: string;
  shift_start: string | null;
  phone: string | null;
  created_at: string;
  /** Remaining recovery hours (ticks). Null when not recovering. */
  recovery_hours_left: number | null;
}

export interface Order {
  id: string;
  order_number: string;
  type: OrderType;
  title: string;
  origin: string;
  destination: string;
  distance_km: number;
  weight_t: number;
  yield: number;
  penalty: number;
  deadline: string | null;
  status: OrderStatus;
  notes: string | null;
  min_brh: number;
  required_wagon_type: string | null;
  required_wagon_count: number | null;
  sperrpause_start: string | null;
  sperrpause_end: string | null;
  penalty_per_min: number;
  created_at: string;
  customer?: string | null;
  customer_id?: string | null;
  origin_country?: CountryPackage | null;
  destination_country?: CountryPackage | null;
  requires_etcs?: boolean | null;
  /** Framework / industrial contract this run fulfills. */
  contract_id?: string | null;
  /** Set on long-term Baugleis-Einsätze (15–180 days). */
  deployment_days?: number | null;
  daily_rate?: number | null;
  required_drivers?: number | null;
  eur_per_tkm?: number | null;
  tkm_revenue?: number | null;
}

export interface Assignment {
  id: string;
  order_id: string;
  locomotive_id: string;
  driver_id: string;
  /** Second Tf for Baugleis-Einsätze (shift rotation). */
  second_driver_id?: string | null;
  /** Employed AZF/RB on this tour; null when PDL covers the Baugleis slot. */
  azf_driver_id?: string | null;
  /** PDL AZF/RB day rate billed as variable cost. 0 / omitted = own staff. */
  pdl_azf_daily?: number | null;
  assigned_at: string;
  status: AssignmentStatus;
  /** Optional 0–100 live progress. Derived from ticks vs deadline when omitted. */
  progress?: number | null;
  /** Driver assigned despite 8h rest / 48h window. Risk resolved at settle. */
  rest_violation?: boolean | null;
  /** Extra in-game hours (accidents, Trassenstörungen). */
  delay_ticks?: number | null;
  /** Primary crew skill snapshot at dispatch (Tf XP). */
  crew_xp?: number | null;
  crew_rank?: 1 | 2 | 3 | null;
  contract_id?: string | null;
  /** Wagon pack ids occupied for this run (status im_einsatz). */
  wagon_pack_ids?: string[] | null;
}

export interface AssignmentWithDetails extends Assignment {
  order?: Order;
  locomotive?: Locomotive;
  driver?: Driver;
  second_driver?: Driver;
  azf_driver?: Driver;
}

export interface Wagon {
  id: string;
  type_code: string;
  type_name: string;
  category: WagonCategory;
  capacity_t: number;
  brake_position: BrakePosition;
  tare_weight_t: number;
  length_mm: number | null;
  status: WagonStatus;
  frist_level: number;
  frist_date: string | null;
  count: number;
  created_at: string;
}

export interface Company {
  id: number;
  name: string;
  /** Seat of the EVU headquarters, e.g. Duisburg. Optional for older snapshots. */
  hq_location?: string;
  balance: number;
  reputation: number;
  level: number;
  xp: number;
  xp_next: number;
  tick: number;
  updated_at: string;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}
