/**
 * Lokaler Vite-Proxy für Microsoft Edge Neural TTS (kostenlos, ohne API-Key).
 * Engine: `node-edge-tts` → Killian / Conrad / Ralf / Katja.
 */

import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { Plugin } from 'vite';

export const VOICE_KILLIAN = 'de-DE-KillianNeural';
export const VOICE_CONRAD = 'de-DE-ConradNeural';
export const VOICE_RALF = 'de-DE-RalfNeural';
export const VOICE_KATJA = 'de-DE-KatjaNeural';

const MALE_VOICES = [VOICE_KILLIAN, VOICE_CONRAD, VOICE_RALF] as const;
const FEMALE_VOICES = [VOICE_KATJA] as const;

const MAX_CHARS = 500;

export type TtsGender = 'male' | 'female';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function synthesizeEdgeVoice(text: string, voice: string): Promise<Buffer> {
  const { EdgeTTS } = await import('node-edge-tts');
  const out = path.join(os.tmpdir(), `gsmr-edge-${voice}-${Date.now()}-${randomBytes(4).toString('hex')}.mp3`);
  const tts = new EdgeTTS({
    voice,
    lang: 'de-DE',
    outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
    rate: '-6%',
    pitch: voice.includes('Conrad') || voice.includes('Ralf') ? '-2Hz' : 'default',
    timeout: 30_000,
  });
  try {
    await tts.ttsPromise(text, out);
    const buf = await fs.readFile(out);
    if (buf.length < 200) throw new Error('empty_audio');
    return buf;
  } finally {
    await fs.unlink(out).catch(() => undefined);
  }
}

function voiceQueue(gender: TtsGender, preferred?: string): string[] {
  const pool = gender === 'female' ? [...FEMALE_VOICES] : [...MALE_VOICES];
  if (!preferred) return pool;
  const rest = pool.filter((v) => v !== preferred);
  return [preferred, ...rest];
}

async function synthesizeEdge(
  text: string,
  gender: TtsGender,
  preferredVoice?: string,
): Promise<{ buf: Buffer; voice: string }> {
  const voices = voiceQueue(gender, preferredVoice);
  const errors: string[] = [];
  for (const voice of voices) {
    try {
      const buf = await synthesizeEdgeVoice(text, voice);
      return { buf, voice };
    } catch (err) {
      errors.push(`${voice}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`edge_neural_failed: ${errors.join(' | ')}`);
}

async function handleTts(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end('Method Not Allowed');
    return;
  }

  try {
    const raw = await readBody(req);
    const parsed = JSON.parse(raw || '{}') as { text?: string; gender?: string; voice?: string };
    const text = String(parsed.text ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_CHARS);
    const gender: TtsGender = parsed.gender === 'female' ? 'female' : 'male';
    const preferredVoice = typeof parsed.voice === 'string' ? parsed.voice.trim() : undefined;

    if (!text) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'text required' }));
      return;
    }

    const { buf, voice } = await synthesizeEdge(text, gender, preferredVoice);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('X-GSMR-TTS-Engine', 'edge-neural');
    res.setHeader('X-GSMR-TTS-Voice', voice);
    res.setHeader('X-GSMR-TTS-Gender', gender);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
      'Access-Control-Expose-Headers',
      'X-GSMR-TTS-Engine, X-GSMR-TTS-Voice, X-GSMR-TTS-Gender',
    );
    res.end(buf);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'tts_failed', message }));
  }
}

/** Vite-Middleware: Edge Neural TTS für GSM-R (ohne API-Key). */
export function gsmrTtsPlugin(): Plugin {
  const mount = (middlewares: {
    use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void;
  }) => {
    middlewares.use((req, res, next) => {
      const url = req.url?.split('?')[0];
      if (url !== '/api/gsmr-tts') {
        next();
        return;
      }
      void handleTts(req, res);
    });
  };

  return {
    name: 'gsmr-edge-tts',
    configureServer(server) {
      mount(server.middlewares);
    },
    configurePreviewServer(server) {
      mount(server.middlewares);
    },
  };
}
