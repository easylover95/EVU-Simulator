import { defaultCareer } from '@/vectra/career';
import { EMPLOYERS, type EmployerId } from '@/vectra/employers';
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
  /** 0–1 Lautstärke Neural/Browser-TTS */
  ttsVolume: number;
  /** 0–1 GSM-R Funk-Klick / Klingel */
  radioVolume: number;
  /** Standard-Zeitraffer beim Schichtstart */
  defaultSpeed: ClockSpeed;
}

export interface SaveGame {
  version: 1;
  savedAt: string;
  employerId: EmployerId;
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

export function defaultSave(employerId: EmployerId = 'rrc'): SaveGame {
  const employer = EMPLOYERS.find((e) => e.id === employerId) ?? EMPLOYERS[0]!;
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    employerId: employer.id,
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

export function loadSave(): SaveGame | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveGame;
    if (!parsed || parsed.version !== 1 || !parsed.career || !parsed.employerId) return null;
    const drivers = (parsed.drivers ?? []).map((d) => ({
      ...d,
      gender: d.gender === 'female' ? ('female' as const) : ('male' as const),
      ttsVoiceId: typeof d.ttsVoiceId === 'string' ? d.ttsVoiceId : null,
    }));
    return {
      ...defaultSave(parsed.employerId),
      ...parsed,
      drivers,
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
      career: { ...defaultCareer(), ...parsed.career },
    };
  } catch {
    return null;
  }
}

export function writeSave(save: SaveGame): void {
  const payload: SaveGame = {
    ...save,
    version: 1,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
}

export function exportSaveJson(save: SaveGame): string {
  return JSON.stringify({ ...save, savedAt: new Date().toISOString() }, null, 2);
}

export function importSaveJson(json: string): SaveGame | null {
  try {
    const parsed = JSON.parse(json) as SaveGame;
    if (!parsed?.career || !parsed.employerId) return null;
    const drivers = (parsed.drivers ?? []).map((d) => ({
      ...d,
      gender: d.gender === 'female' ? ('female' as const) : ('male' as const),
      ttsVoiceId: typeof d.ttsVoiceId === 'string' ? d.ttsVoiceId : null,
    }));
    return {
      ...defaultSave(parsed.employerId),
      ...parsed,
      version: 1,
      drivers,
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
    };
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
