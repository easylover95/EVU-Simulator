import { strict as assert } from 'node:assert';

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  },
});

const {
  TERMINAL_AUDIO_SETTINGS_KEY,
  getTerminalAudioSettings,
  loadTerminalAudioSettings,
  playTerminalSound,
  saveTerminalAudioSettings,
  soundForTerminalEvent,
} = await import('../src/lib/terminalAudio');

// 1. Geräteeinstellungen werden vollständig lokal gespeichert, geladen und auf
//    den sicheren Lautstärkebereich normalisiert.
const saved = saveTerminalAudioSettings({ enabled: false, volume: 1.8 });
assert.deepEqual(saved, { enabled: false, volume: 1 });
assert.equal(values.has(TERMINAL_AUDIO_SETTINGS_KEY), true);
assert.deepEqual(loadTerminalAudioSettings(), { enabled: false, volume: 1 });
assert.deepEqual(getTerminalAudioSettings(), { enabled: false, volume: 1 });
assert.deepEqual(saveTerminalAudioSettings({ enabled: true, volume: -0.25 }), { enabled: true, volume: 0 });

// 2. Die Zuordnung deckt ausschließlich fachlich bestätigte Kernereignisse ab.
assert.equal(soundForTerminalEvent({ type: 'TRAIN_DISPATCHED', severity: 'SUCCESS' }), 'TRAIN_DEPARTURE');
assert.equal(soundForTerminalEvent({ type: 'INBOUND_UNLOADED', severity: 'SUCCESS' }), 'CRANE_HANDLING');
assert.equal(soundForTerminalEvent({ type: 'ALERT_RAISED', severity: 'ERROR' }), 'CRITICAL_ALERT');
assert.equal(soundForTerminalEvent({ type: 'ALERT_RAISED', severity: 'WARNING' }), null);
assert.equal(soundForTerminalEvent({ type: 'TICK_ADVANCED', severity: 'INFO' }), null);

// 3. In Umgebungen ohne Web Audio API und im stummen Modus darf Audio niemals
//    eine Terminalaktion oder die Server-Side-Auswertung unterbrechen.
assert.doesNotThrow(() => playTerminalSound('CLICK'));
assert.doesNotThrow(() => playTerminalSound('TRAIN_DEPARTURE'));

console.log('Terminal-Audio-Tests: alle Prüfungen bestanden.');
