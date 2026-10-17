/**
 * Feste Microsoft Edge Neural-Voice-IDs pro Triebfahrzeugführer.
 * Kein Browser-SpeechSynthesis — nur Voice-Zuweisung für den GSM-R-Proxy.
 */

import type { Driver, DriverGender } from '@/vectra/types';

export type VoiceGender = DriverGender;

/** Jung / dynamisch */
export const VOICE_KILLIAN = 'de-DE-KillianNeural';
/** Erfahren / tief */
export const VOICE_CONRAD = 'de-DE-ConradNeural';
/** Klassisch */
export const VOICE_RALF = 'de-DE-RalfNeural';
/** Weiblich */
export const VOICE_KATJA = 'de-DE-KatjaNeural';

export const MALE_NEURAL_IDS = [VOICE_KILLIAN, VOICE_CONRAD, VOICE_RALF] as const;
export const FEMALE_NEURAL_IDS = [VOICE_KATJA] as const;

export type NeuralVoiceId =
  | (typeof MALE_NEURAL_IDS)[number]
  | (typeof FEMALE_NEURAL_IDS)[number];

function stableIndex(key: string, modulo: number): number {
  if (modulo <= 0) return 0;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % modulo;
}

export function pickNeuralVoiceId(gender: VoiceGender, seed: string): NeuralVoiceId {
  if (gender === 'female') return VOICE_KATJA;
  return MALE_NEURAL_IDS[stableIndex(seed, MALE_NEURAL_IDS.length)]!;
}

export function normalizeDriverGender(driver: Driver): Driver {
  const gender: DriverGender = driver.gender === 'female' ? 'female' : 'male';
  return {
    ...driver,
    gender,
    ttsVoiceId: driver.ttsVoiceId ?? null,
  };
}

/**
 * Weist einem Tf fest eine Neural-Voice-ID zu.
 * Einmal gesetzt, bleibt sie über den gesamten Spielverlauf gleich.
 */
export function assignDriverVoiceId(driver: Driver): Driver {
  const normalized = normalizeDriverGender(driver);
  if (normalized.ttsVoiceId) return normalized;
  return {
    ...normalized,
    ttsVoiceId: pickNeuralVoiceId(normalized.gender, `${normalized.id}|${normalized.name}`),
  };
}

export function ensureDriversHaveVoices(drivers: Driver[]): Driver[] {
  return drivers.map(assignDriverVoiceId);
}

/** @deprecated — Stimmen kommen vom Edge-Proxy; Warmup ist optional. */
export function warmGsmrVoiceCache(): void {
  /* no-op: Neural-Audio läuft über /api/gsmr-tts */
}

export function inferDriverGender(name: string): DriverGender {
  const first = name.trim().split(/\s+/)[0]?.replace(/\./g, '') ?? '';
  if (/^(E|Mara|Anna|Julia|Sabrina|Laura)$/i.test(first)) return 'female';
  return 'male';
}
