export type SoundEffect = 'departure' | 'brake' | 'confirm' | 'warning';

type OscillatorShape = OscillatorType;
type WebAudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  const AudioContextConstructor = window.AudioContext ?? (window as WebAudioWindow).webkitAudioContext;
  if (!AudioContextConstructor) return null;

  if (!context || context.state === 'closed') {
    context = new AudioContextConstructor();
  }
  return context;
}

function createGain(audioContext: AudioContext, volume: number, start: number, duration: number): GainNode {
  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  gain.connect(audioContext.destination);
  return gain;
}

function tone(
  audioContext: AudioContext,
  {
    frequency,
    endFrequency = frequency,
    start,
    duration,
    volume,
    shape = 'sine',
  }: {
    frequency: number;
    endFrequency?: number;
    start: number;
    duration: number;
    volume: number;
    shape?: OscillatorShape;
  },
): void {
  const oscillator = audioContext.createOscillator();
  oscillator.type = shape;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
  oscillator.connect(createGain(audioContext, volume, start, duration));
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function filteredNoise(audioContext: AudioContext, start: number, duration: number, volume: number): void {
  const frameCount = Math.ceil(audioContext.sampleRate * duration);
  const buffer = audioContext.createBuffer(1, frameCount, audioContext.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < samples.length; index += 1) {
    const envelope = 1 - index / samples.length;
    samples[index] = (Math.random() * 2 - 1) * envelope;
  }

  const source = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1_100, start);
  filter.Q.setValueAtTime(2.2, start);
  source.buffer = buffer;
  source.connect(filter);
  filter.connect(createGain(audioContext, volume, start, duration));
  source.start(start);
  source.stop(start + duration + 0.02);
}

function playDeparture(audioContext: AudioContext, start: number): void {
  // Kurzes Abfertigungssignal mit anfahrendem Dieselmotor; bewusst zurückhaltend.
  tone(audioContext, { frequency: 680, start, duration: 0.07, volume: 0.035, shape: 'sine' });
  tone(audioContext, { frequency: 880, start: start + 0.11, duration: 0.1, volume: 0.04, shape: 'sine' });
  tone(audioContext, { frequency: 85, endFrequency: 154, start: start + 0.18, duration: 0.42, volume: 0.055, shape: 'sawtooth' });
}

function playBrake(audioContext: AudioContext, start: number): void {
  // Gefiltertes Bremsenquietschen: keine externe Audiodatei und kein Netzwerkbedarf.
  tone(audioContext, { frequency: 1_500, endFrequency: 520, start, duration: 0.5, volume: 0.028, shape: 'sawtooth' });
  filteredNoise(audioContext, start + 0.04, 0.38, 0.018);
}

function playConfirm(audioContext: AudioContext, start: number): void {
  tone(audioContext, { frequency: 520, start, duration: 0.07, volume: 0.035, shape: 'sine' });
  tone(audioContext, { frequency: 740, start: start + 0.09, duration: 0.12, volume: 0.04, shape: 'sine' });
}

function playWarning(audioContext: AudioContext, start: number): void {
  tone(audioContext, { frequency: 470, start, duration: 0.11, volume: 0.04, shape: 'triangle' });
  tone(audioContext, { frequency: 360, start: start + 0.16, duration: 0.16, volume: 0.045, shape: 'triangle' });
}

/**
 * Spielt einen kurzen synthetischen Effekt nach einer Nutzeraktion ab.
 * Der Manager ist lokal, lädt keine Audiodateien und bricht bei gesperrtem
 * Browser-Audio oder Hintergrundtabs still ab, ohne die Spielinteraktion zu stören.
 */
export function playSoundEffect(effect: SoundEffect, enabled: boolean): void {
  if (!enabled || typeof document === 'undefined' || document.visibilityState === 'hidden') return;

  try {
    const audioContext = getContext();
    if (!audioContext) return;
    if (audioContext.state === 'suspended') {
      void audioContext.resume().catch(() => undefined);
    }

    const start = audioContext.currentTime + 0.02;
    if (effect === 'departure') playDeparture(audioContext, start);
    if (effect === 'brake') playBrake(audioContext, start);
    if (effect === 'confirm') playConfirm(audioContext, start);
    if (effect === 'warning') playWarning(audioContext, start);
  } catch {
    // Audio ist eine optionale UI-Verbesserung; ein Browserfehler darf nie das Spiel blockieren.
  }
}

/** Schließt den Kontext nur für Tests oder bei explizitem Ressourcenabbau. */
export async function closeSoundContext(): Promise<void> {
  if (context && context.state !== 'closed') await context.close();
  context = null;
}
