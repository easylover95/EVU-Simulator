/** Disponenten-Leitstelle — Rhein-Ruhr Cargo, freie Hub-Wahl. */

export type ShiftKind = 'frueh' | 'spaet' | 'nacht';
export type ClockSpeed = 0 | 1 | 2 | 5;
export type DispatcherRank = 1 | 2 | 3;
export type Grade = 'S' | 'A' | 'B' | 'C';

export type DriverStatus = 'in_fahrt' | 'pause' | 'bereit' | 'krank' | 'halt';
export type LocoModel = 'Vectron MS' | 'TRAXX F140' | 'EuroDual';
export type LocoStatus = 'bereit' | 'in_fahrt' | 'wartung';
export type TrainRunStatus = 'geplant' | 'unterwegs' | 'halt' | 'gestoert' | 'ankunft';

export const DRIVER_STATUS_LABEL: Record<DriverStatus, string> = {
  in_fahrt: 'In Fahrt',
  pause: 'Pause',
  bereit: 'Bereit',
  krank: 'Krank',
  halt: 'Halt',
};

export const LOCO_STATUS_LABEL: Record<LocoStatus, string> = {
  bereit: 'Bereit',
  in_fahrt: 'In Fahrt',
  wartung: 'Wartung',
};

export const TRAIN_STATUS_LABEL: Record<TrainRunStatus, string> = {
  geplant: 'Geplant',
  unterwegs: 'Unterwegs',
  halt: 'Halt',
  gestoert: 'Gestört',
  ankunft: 'Angekommen',
};

export type DriverGender = 'male' | 'female';

export interface Driver {
  id: string;
  name: string;
  gender: DriverGender;
  /** Feste Microsoft-Neural-Voice-ID (z. B. de-DE-ConradNeural). */
  voiceId: string | null;
  qualifications: string[];
  remainingDutyMinutes: number;
  maxDutyMinutes: number;
  status: DriverStatus;
  assignedTrainId: string | null;
  satisfaction: number;
}

export interface Locomotive {
  id: string;
  model: LocoModel;
  unitNumber: string;
  status: LocoStatus;
  location: string;
}

export interface TrainRun {
  id: string;
  trainNumber: string;
  cargo: string;
  /** Netto-Tonnage in t */
  tonnageT: number;
  origin: string;
  destination: string;
  /** 0–1 along corridor path */
  progress: number;
  plannedDurationMin: number;
  elapsedMin: number;
  delayMinutes: number;
  driverId: string;
  locoId: string;
  status: TrainRunStatus;
  corridorId: string;
  dangerousGoods: boolean;
  currentSpeedKmH: number;
}

export interface IncidentOption {
  id: string;
  label: string;
  costEuro: number;
  delayDelta: number;
  satisfactionDelta: number;
  kind: 'sicher' | 'risiko' | 'konservativ';
}

export interface Incident {
  id: string;
  trainId: string;
  driverName: string;
  messageText: string;
  options: IncidentOption[];
  createdAtMin: number;
  resolved: boolean;
  chosenOptionId?: string;
}

export interface LogEntry {
  id: string;
  atMin: number;
  text: string;
  tone: 'info' | 'warn' | 'ok';
}

export interface ShiftState {
  currentShift: ShiftKind | null;
  onDuty: boolean;
  /** Minutes since game-day midnight (0–1439+). */
  inGameMinutes: number;
  punctualityPct: number;
  emergencyBudget: number;
  logEntries: LogEntry[];
  speed: ClockSpeed;
  shiftStartedAtMin: number | null;
  stats: ShiftStats;
}

export interface ShiftStats {
  incidentsResolved: number;
  lenkzeitAverted: number;
  totalDelayAdded: number;
  totalDelaySaved: number;
  wageBase: number;
  punctualityBonus: number;
}

export interface CareerState {
  displayName: string;
  roleLabel: string;
  rank: DispatcherRank;
  /** EXP im aktuellen Rang (Fortschritt zur nächsten Stufe). */
  exp: number;
  shiftsCompleted: number;
  /** Schichten seit der letzten Beförderung / seit Karrierestart. */
  shiftsAtRank: number;
  punctualityHistory: number[];
  totalEarnedEuro: number;
}

export interface HandoverNote {
  trainNumber: string;
  note: string;
  delayMinutes: number;
}

export interface ShiftReport {
  shift: ShiftKind;
  grade: Grade;
  gradeReason: string;
  punctualityPct: number;
  wageTotal: number;
  wageBase: number;
  /** Leistungszulage in € (nicht die Note). */
  punctualityBonus: number;
  incidentsResolved: number;
  lenkzeitAverted: number;
  totalDelayMinutes: number;
  expGained: number;
  /** Fortschrittstext nach der Schicht (EXP + Mindestschichten). */
  rankProgress: string;
  rankBefore: DispatcherRank;
  rankAfter: DispatcherRank;
  promoted: boolean;
  handoverNotes: HandoverNote[];
  nextShift: ShiftKind;
  /** Freigeschalteter Korridor-Tier nach dieser Schicht (falls neu). */
  corridorUnlockMessage: string | null;
  unlockedTierAfter: 1 | 2 | 3 | 4 | 5;
}

export type AppScreen = 'employer' | 'desk' | 'briefing' | 'leitstelle' | 'akte' | 'fuhrpark';

export interface CorridorNode {
  id: string;
  label: string;
  x: number;
  y: number;
}

export interface Corridor {
  id: string;
  from: string;
  to: string;
  /** SVG path length approx for progress */
  lengthKm: number;
}

export interface HubRuntime {
  id: string;
  name: string;
  city: string;
  assignedLocoIds: string[];
  assignedDriverIds: string[];
}
