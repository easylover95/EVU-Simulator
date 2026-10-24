import { defaultCareer } from '@/vectra/career';
import { clampTier, type CorridorTier } from '@/vectra/corridors';
import { RRC } from '@/vectra/employers';
import { defaultHubId, hubById, type HubId } from '@/vectra/hubs';
import type {
  CareerState,
  ClockSpeed,
  Driver,
  HandoverNote,
  LogEntry,
  Locomotive,
  ShiftKind,
  TrainRun,
} from '@/vectra/types';

export type GameState =
  | 'MAIN_MENU'
  | 'CAREER_SETUP'
  | 'SHIFT_BRIEFING'
  | 'ACTIVE_SHIFT'
  | 'SHIFT_SUMMARY';

export interface GameSettings {
  ttsVolume: number;
  radioVolume: number;
  defaultSpeed: ClockSpeed;
}

export interface SaveGame {
  version: 1;
  savedAt: string;
  /** Immer RRC — Feld bleibt für alte Saves kompatibel. */
  employerId: 'rrc';
  homeHubId: HubId;
  unlockedTier: CorridorTier;
  career: CareerState;
  locos: Locomotive[];
  drivers: Driver[];
  trains: TrainRun[];
  handoverBook: HandoverNote[];
  logEntries: LogEntry[];
  inGameMinutes: number;
  lastShiftKind: ShiftKind | null;
  settings: GameSettings;
}

export const SAVE_KEY = 'evu-vectra-save-v1';
export const SETTINGS_KEY = 'evu-vectra-settings-v1';

export const DEFAULT_SETTINGS: GameSettings = {
  ttsVolume: 1,
  radioVolume: 0.7,
  defaultSpeed: 1,
};

type LegacyDriver = Driver & { ttsVoiceId?: string | null };

function migrateDriver(d: LegacyDriver): Driver {
  const voice =
    (typeof d.voiceId === 'string' && d.voiceId) ||
    (typeof d.ttsVoiceId === 'string' && d.ttsVoiceId) ||
    null;
  return {
    id: d.id,
    name: d.name,
    gender: d.gender === 'female' ? 'female' : 'male',
    voiceId: voice,
    qualifications: Array.isArray(d.qualifications) && d.qualifications.length > 0
      ? d.qualifications
      : ['E-Lok', 'Vectron'],
    remainingDutyMinutes: d.remainingDutyMinutes ?? 420,
    maxDutyMinutes: d.maxDutyMinutes ?? 540,
    status: d.status === 'halt' ? 'halt' : d.status ?? 'bereit',
    assignedTrainId: d.assignedTrainId ?? null,
    satisfaction: d.satisfaction ?? 75,
  };
}

function migrateTrain(t: TrainRun): TrainRun {
  return {
    ...t,
    tonnageT: typeof t.tonnageT === 'number' ? t.tonnageT : 1200,
    currentSpeedKmH: typeof t.currentSpeedKmH === 'number' ? t.currentSpeedKmH : 0,
  };
}

function hubFromLegacyEmployer(employerId: string | undefined): HubId {
  if (employerId === 'sfr') return 'koeln-eifeltor';
  if (employerId === 'tal') return 'muenchen-ost';
  return defaultHubId();
}

export function defaultSave(homeHubId: HubId = defaultHubId()): SaveGame {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    employerId: RRC.id,
    homeHubId,
    unlockedTier: 1,
    career: defaultCareer(),
    locos: [],
    drivers: [],
    trains: [],
    handoverBook: [],
    logEntries: [],
    inGameMinutes: 6 * 60,
    lastShiftKind: null,
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function hasSave(): boolean {
  try {
    return Boolean(localStorage.getItem(SAVE_KEY));
  } catch {
    return false;
  }
}

function normalizeSave(parsed: Partial<SaveGame> & { employerId?: string }): SaveGame | null {
  if (!parsed?.career) return null;
  const homeHubId = (parsed.homeHubId as HubId | undefined) ?? hubFromLegacyEmployer(parsed.employerId);
  hubById(homeHubId); // validate / fallback inside hubById
  const drivers = (parsed.drivers ?? []).map((d) => migrateDriver(d as LegacyDriver));
  const trains = (parsed.trains ?? []).map(migrateTrain);
  return {
    ...defaultSave(homeHubId),
    ...parsed,
    employerId: 'rrc',
    homeHubId,
    unlockedTier: clampTier(Number(parsed.unlockedTier ?? 1)),
    drivers,
    trains,
    version: 1,
    settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
    career: { ...defaultCareer(), ...parsed.career },
  };
}

export function loadSave(): SaveGame | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return normalizeSave(JSON.parse(raw) as Partial<SaveGame>);
  } catch {
    return null;
  }
}

export function writeSave(save: SaveGame): void {
  const payload: SaveGame = {
    ...save,
    employerId: 'rrc',
    version: 1,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
}

export function exportSaveJson(save: SaveGame): string {
  return JSON.stringify({ ...save, employerId: 'rrc', savedAt: new Date().toISOString() }, null, 2);
}

export function importSaveJson(json: string): SaveGame | null {
  try {
    return normalizeSave(JSON.parse(json) as Partial<SaveGame>);
  } catch {
    return null;
  }
}

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as GameSettings) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSettings(settings: GameSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
