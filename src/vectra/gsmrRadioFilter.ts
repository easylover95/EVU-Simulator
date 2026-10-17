/**
 * GSM-R Zugfunk-Bandbreite per Web Audio API (ohne externe Pakete).
 * Highpass 300 Hz · Lowpass 3400 Hz · Squelch/Quittungston vor dem Spruch.
 */

import { getRadioVolume, getTtsVolume } from '@/vectra/gsmrSettings';

let sharedCtx: AudioContext | null = null;
let activeSource: AudioBufferSourceNode | null = null;

function AudioCtxClass(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
    null
  );
}

export function getRadioAudioContext(): AudioContext | null {
  const Ctor = AudioCtxClass();
  if (!Ctor) return null;
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new Ctor();
  }
  return sharedCtx;
}

/** Telefon-/GSM-R-Bandbreite: 300–3400 Hz. */
export function createRadioFilterChain(ctx: AudioContext): {
  input: AudioNode;
  output: GainNode;
} {
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 300;
  highpass.Q.value = 0.7;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 3400;
  lowpass.Q.value = 0.7;

  const output = ctx.createGain();
  output.gain.value = getTtsVolume();

  highpass.connect(lowpass);
  lowpass.connect(output);

  return { input: highpass, output };
}

/** Kurzer leiser Funk-Quittungston („Bzzzt“ / Rausch-Squelch). */
export function playSquelch(ctx?: AudioContext | null): void {
  try {
    const audioCtx = ctx ?? getRadioAudioContext();
    if (!audioCtx) return;
    void audioCtx.resume();

    const duration = 0.09;
    const sampleRate = audioCtx.sampleRate;
    const frames = Math.floor(sampleRate * duration);
    const buffer = audioCtx.createBuffer(1, frames, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      const t = i / frames;
      const envelope = Math.sin(Math.PI * Math.min(1, t * 3)) * (1 - t);
      const noise = (Math.random() * 2 - 1) * 0.55;
      const buzz = Math.sin(2 * Math.PI * 1800 * (i / sampleRate)) * 0.35;
      data[i] = (noise + buzz) * envelope * 0.22;
    }

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    const { input, output } = createRadioFilterChain(audioCtx);
    const vol = audioCtx.createGain();
    vol.gain.value = 0.45 * getRadioVolume();
    source.connect(input);
    output.connect(vol);
    vol.connect(audioCtx.destination);
    source.start();
  } catch {
    /* ignore */
  }
}

export function stopRadioPlayback(): void {
  if (activeSource) {
    try {
      activeSource.stop();
    } catch {
      /* already stopped */
    }
    activeSource = null;
  }
}

/** Spielt einen TTS-Blob durch die GSM-R-Filterkette. */
export async function playBlobThroughRadio(
  blob: Blob,
  opts?: { generation?: number; isCurrent?: (g: number) => boolean },
): Promise<void> {
  const ctx = getRadioAudioContext();
  if (!ctx) throw new Error('no_audio_context');
  await ctx.resume();

  playSquelch(ctx);

  const arrayBuf = await blob.arrayBuffer();
  if (opts?.generation != null && opts.isCurrent && !opts.isCurrent(opts.generation)) return;

  const audioBuf = await ctx.decodeAudioData(arrayBuf.slice(0));
  if (opts?.generation != null && opts.isCurrent && !opts.isCurrent(opts.generation)) return;

  stopRadioPlayback();

  const source = ctx.createBufferSource();
  source.buffer = audioBuf;
  activeSource = source;

  const { input, output } = createRadioFilterChain(ctx);
  output.gain.value = getTtsVolume();
  source.connect(input);
  output.connect(ctx.destination);

  await new Promise<void>((resolve, reject) => {
    source.onended = () => {
      if (activeSource === source) activeSource = null;
      resolve();
    };
    try {
      source.start();
    } catch (err) {
      if (activeSource === source) activeSource = null;
      reject(err);
    }
  });
}
