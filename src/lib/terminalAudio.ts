import { loadJson, saveJson } from '@/lib/storage';

export const TERMINAL_AUDIO_SETTINGS_KEY = 'evu-terminal-audio-settings';

export interface TerminalAudioSettings {
  enabled: boolean;
  /** Master gain from 0 to 1; persisted independently from every game save. */
  volume: number;
}

export type TerminalSound = 'CLICK' | 'TRAIN_DEPARTURE' | 'CRANE_HANDLING' | 'CRITICAL_ALERT';

export interface AudioRelevantTerminalEvent {
  type: string;
  severity: string;
}

/** Maps only confirmed, audit-loggable simulation transitions to domain sounds. */
export function soundForTerminalEvent(event: AudioRelevantTerminalEvent): TerminalSound | null {
  if (event.type === 'TRAIN_DISPATCHED') return 'TRAIN_DEPARTURE';
  if (event.type === 'INBOUND_UNLOADED') return 'CRANE_HANDLING';
  if (event.type === 'ALERT_RAISED' && event.severity === 'ERROR') return 'CRITICAL_ALERT';
  return null;
}

const DEFAULT_SETTINGS: TerminalAudioSettings = { enabled: true, volume: 0.42 };
let settings: TerminalAudioSettings = normalize(loadJson<Partial<TerminalAudioSettings>>(TERMINAL_AUDIO_SETTINGS_KEY, DEFAULT_SETTINGS));
let context: AudioContext | null = null;

function normalize(candidate: Partial<TerminalAudioSettings> | null | undefined): TerminalAudioSettings {
  return {
    enabled: candidate?.enabled !== false,
    volume: Math.max(0, Math.min(1, Number.isFinite(candidate?.volume) ? Number(candidate?.volume) : DEFAULT_SETTINGS.volume)),
  };
}

export function loadTerminalAudioSettings(): TerminalAudioSettings {
  settings = normalize(loadJson<Partial<TerminalAudioSettings>>(TERMINAL_AUDIO_SETTINGS_KEY, DEFAULT_SETTINGS));
  return settings;
}

export function saveTerminalAudioSettings(next: TerminalAudioSettings): TerminalAudioSettings {
  settings = normalize(next);
  saveJson(TERMINAL_AUDIO_SETTINGS_KEY, settings);
  return settings;
}

export function getTerminalAudioSettings(): TerminalAudioSettings {
  return settings;
}

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextConstructor) return null;
  context ??= new AudioContextConstructor();
  if (context.state === 'suspended') void context.resume().catch(() => undefined);
  return context;
}

function gainNode(audio: AudioContext, now: number, peak: number, releaseSeconds: number): GainNode {
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * settings.volume), now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + releaseSeconds);
  gain.connect(audio.destination);
  return gain;
}

function oscillator(audio: AudioContext, output: AudioNode, frequency: number, type: OscillatorType, start: number, stop: number, endFrequency?: number): void {
  const source = audio.createOscillator();
  source.type = type;
  source.frequency.setValueAtTime(frequency, start);
  if (endFrequency) source.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), stop);
  source.connect(output);
  source.start(start);
  source.stop(stop + 0.015);
}

function click(audio: AudioContext, now: number): void {
  const output = gainNode(audio, now, 0.08, 0.07);
  oscillator(audio, output, 780, 'sine', now, now + 0.06, 440);
}

/** Two pitched oscillators form a short, synthetic railway horn. */
function departure(audio: AudioContext, now: number): void {
  const output = gainNode(audio, now, 0.16, 1.25);
  oscillator(audio, output, 440, 'sawtooth', now, now + 1.15, 392);
  oscillator(audio, output, 660, 'sine', now + 0.04, now + 1.1, 588);
}

/** Low impact plus metallic lift tone; no sampled assets are required. */
function craneHandling(audio: AudioContext, now: number): void {
  const impact = gainNode(audio, now, 0.12, 0.22);
  oscillator(audio, impact, 105, 'triangle', now, now + 0.18, 68);
  const hoist = gainNode(audio, now + 0.08, 0.07, 0.8);
  oscillator(audio, hoist, 280, 'square', now + 0.08, now + 0.75, 520);
}

/** Restrained two-note alert; capped gain avoids a startling or harsh alarm. */
function criticalAlert(audio: AudioContext, now: number): void {
  const first = gainNode(audio, now, 0.11, 0.22);
  oscillator(audio, first, 880, 'sine', now, now + 0.2, 760);
  const second = gainNode(audio, now + 0.31, 0.11, 0.55);
  oscillator(audio, second, 740, 'sine', now + 0.31, now + 0.82, 610);
}

/**
 * Must be called in response to a browser interaction or a confirmed state
 * transition. It silently does nothing in SSR, unsupported browsers or muted mode.
 */
export function playTerminalSound(sound: TerminalSound): void {
  if (!settings.enabled || settings.volume <= 0) return;
  const audio = audioContext();
  if (!audio) return;
  const now = audio.currentTime;
  try {
    if (sound === 'CLICK') click(audio, now);
    if (sound === 'TRAIN_DEPARTURE') departure(audio, now);
    if (sound === 'CRANE_HANDLING') craneHandling(audio, now);
    if (sound === 'CRITICAL_ALERT') criticalAlert(audio, now);
  } catch {
    // Audio must never block a terminal action or player navigation.
  }
}

// Safari exposes the prefixed constructor. The optional declaration keeps the
// feature test strongly typed without forcing any unsupported browser polyfill.
declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
