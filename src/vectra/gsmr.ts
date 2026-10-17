/**
 * GSM-R Zugfunk — ausschließlich Microsoft Edge Neural TTS
 * über den lokalen Vite-Proxy `/api/gsmr-tts` (kostenlos, ohne API-Key).
 * Kein window.speechSynthesis.
 */

import { getRadioVolume } from '@/vectra/gsmrSettings';
import {
  ensureDriversHaveVoices,
  assignDriverVoiceId,
  type VoiceGender,
} from '@/vectra/gsmrVoices';
import {
  getRadioAudioContext,
  playBlobThroughRadio,
  stopRadioPlayback,
} from '@/vectra/gsmrRadioFilter';

export type { VoiceGender } from '@/vectra/gsmrVoices';
export { ensureDriversHaveVoices, assignDriverVoiceId } from '@/vectra/gsmrVoices';

/** Immersive Leitstellen-Status (keine Technik-Begriffe in der UI). */
export type GsmrLinkStatus = 'idle' | 'receiving' | 'connected' | 'free';

let speakGeneration = 0;
let objectUrlCleanup: string | null = null;

export function canSpeak(): boolean {
  return typeof window !== 'undefined';
}

function spokenDriverName(raw: string): string {
  const cleaned = raw.replace(/\bTf\b/gi, '').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Triebfahrzeugführer';
  return parts[parts.length - 1]!.replace(/\./g, '');
}

export function prepareRadioScript(text: string, gender: VoiceGender = 'male'): string {
  let t = text.trim();
  const role = gender === 'female' ? 'Triebfahrzeugführerin' : 'Triebfahrzeugführer';

  t = t.replace(/^([^:]+)\s+über\s+GSM-R:\s*/i, (_m, name: string) => {
    return `Hier ${role} ${spokenDriverName(name)}. `;
  });
  t = t.replace(/^([^:]+):\s*/i, (_m, name: string) => {
    if (/dispo|cvd|infra|personal|zentrale/i.test(name)) {
      return `${name.trim()}. `;
    }
    return `Hier ${role} ${spokenDriverName(name)}. `;
  });

  return t
    .replace(/GSM-R/gi, 'Funk')
    .replace(/\bTf\b/g, role)
    .replace(/\bGZ\s+(\d+)/gi, 'Güterzug $1')
    .replace(/\bRID\b/g, 'Gefahrgut')
    .replace(/\bCvD\b/g, 'Chef vom Dienst')
    .replace(/Anweisung\?/gi, 'Bitte um Anweisung.')
    .replace(/Disposition\?/gi, 'Wie wollen wir verfahren?')
    .replace(/Sofortmaßnahme\?/gi, 'Was ist die Sofortmaßnahme?')
    .replace(/—/g, '. ')
    .replace(/–/g, ' bis ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchEdgeNeuralAudio(
  text: string,
  gender: VoiceGender,
  voiceId: string | null | undefined,
  signal: AbortSignal,
): Promise<Blob> {
  const res = await fetch('/api/gsmr-tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, gender, voice: voiceId ?? undefined }),
    signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`GSM-R Empfang fehlgeschlagen (${res.status}) ${detail}`);
  }
  const blob = await res.blob();
  if (blob.size < 200) throw new Error('GSM-R Empfang leer');
  return blob;
}

/** Spielt Neural-Audio als Object-URL (+ optional Web-Audio-Filter). */
async function playNeuralBlob(blob: Blob, generation: number): Promise<void> {
  if (objectUrlCleanup) {
    URL.revokeObjectURL(objectUrlCleanup);
    objectUrlCleanup = null;
  }
  // Object-URL für Streaming-Semantik (Blob → URL → Wiedergabe)
  const url = URL.createObjectURL(blob);
  objectUrlCleanup = url;

  try {
    await playBlobThroughRadio(blob, {
      generation,
      isCurrent: (g) => g === speakGeneration,
    });
  } finally {
    if (objectUrlCleanup === url) {
      URL.revokeObjectURL(url);
      objectUrlCleanup = null;
    }
  }
}

export function warmGsmrVoices(): void {
  /* Edge-Neural läuft on-demand über den lokalen Proxy */
}

export function stopSpeech(): void {
  speakGeneration += 1;
  stopRadioPlayback();
  if (objectUrlCleanup) {
    URL.revokeObjectURL(objectUrlCleanup);
    objectUrlCleanup = null;
  }
}

export interface SpeakGsmrOpts {
  gender?: VoiceGender;
  voiceId?: string | null;
  /** Anzeigename für Statuszeile */
  driverName?: string;
  onStatus?: (status: GsmrLinkStatus) => void;
}

export function speakGsmr(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
  opts?: SpeakGsmrOpts,
): void {
  const gender: VoiceGender = opts?.gender ?? 'male';
  const voiceId = opts?.voiceId ?? null;
  const onStatus = opts?.onStatus;
  const generation = ++speakGeneration;

  stopRadioPlayback();
  if (objectUrlCleanup) {
    URL.revokeObjectURL(objectUrlCleanup);
    objectUrlCleanup = null;
  }

  const spoken = prepareRadioScript(text, gender);
  if (!spoken) {
    onStatus?.('free');
    onEnd?.();
    return;
  }

  const controller = new AbortController();
  const genAtStart = generation;

  void (async () => {
    onStatus?.('receiving');
    onStart?.();

    try {
      const blob = await fetchEdgeNeuralAudio(spoken, gender, voiceId, controller.signal);
      if (genAtStart !== speakGeneration) return;

      onStatus?.('connected');
      await playNeuralBlob(blob, genAtStart);
    } catch {
      // Kein robotischer Browser-TTS-Fallback — Leitung endet still
      if (genAtStart === speakGeneration) {
        onStatus?.('free');
      }
    } finally {
      if (genAtStart === speakGeneration) {
        onStatus?.('free');
        onEnd?.();
      }
    }
  })();
}

export function playRingTone(): void {
  try {
    const ctx = getRadioAudioContext();
    if (!ctx) return;
    void ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1100;
    f.Q.value = 1.2;
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.value = 0.03 * getRadioVolume();
    o.connect(f);
    f.connect(g);
    g.connect(ctx.destination);
    o.start();
    window.setTimeout(() => {
      o.frequency.value = 740;
    }, 140);
    window.setTimeout(() => {
      o.stop();
    }, 320);
  } catch {
    /* ignore */
  }
}

/** Formatierte Statuszeile für die Leitstellen-UI (immersiv). */
export function formatGsmrStatus(status: GsmrLinkStatus, driverName?: string): string {
  switch (status) {
    case 'receiving':
      return '[ GSM-R SIGNAL WIRD EMPFANGEN... ]';
    case 'connected':
      return `[ FUNKVERBINDUNG STEHT — Tf ${driverName?.trim() || '—'} ]`;
    case 'free':
      return '[ LEITUNG BEENDET / FREI ]';
    default:
      return '[ LEITUNG BEENDET / FREI ]';
  }
}
