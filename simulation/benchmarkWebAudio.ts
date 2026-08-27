import { closeSoundContext, playSoundEffect } from '../src/lib/webAudio';

const metrics = {
  oscillators: 0,
  gains: 0,
  buffers: 0,
  sources: 0,
  filters: 0,
  closes: 0,
};

class MockAudioParam {
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
}

class MockNode {
  connect() {
    return this;
  }
}

class MockAudioContext {
  state = 'running';
  currentTime = 1;
  sampleRate = 44_100;
  destination = new MockNode();

  createOscillator() {
    metrics.oscillators += 1;
    return Object.assign(new MockNode(), { frequency: new MockAudioParam(), type: 'sine', start() {}, stop() {} });
  }

  createGain() {
    metrics.gains += 1;
    return Object.assign(new MockNode(), { gain: new MockAudioParam() });
  }

  createBuffer(_channels: number, length: number) {
    metrics.buffers += 1;
    return { getChannelData: () => new Float32Array(length) };
  }

  createBufferSource() {
    metrics.sources += 1;
    return Object.assign(new MockNode(), { buffer: null, start() {}, stop() {} });
  }

  createBiquadFilter() {
    metrics.filters += 1;
    return Object.assign(new MockNode(), { frequency: new MockAudioParam(), Q: new MockAudioParam(), type: 'bandpass' });
  }

  resume() {
    this.state = 'running';
    return Promise.resolve();
  }

  close() {
    metrics.closes += 1;
    this.state = 'closed';
    return Promise.resolve();
  }
}

function setGlobal(name: string, value: unknown) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  return () => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as Record<string, unknown>)[name];
  };
}

let clockMs = 1_000;
const restoreWindow = setGlobal('window', { AudioContext: MockAudioContext });
const restoreDocument = setGlobal('document', { visibilityState: 'visible' });
const restorePerformance = setGlobal('performance', { now: () => clockMs });

try {
  const simultaneousTrains = 5_000;
  const beforeBurst = process.hrtime.bigint();
  for (let index = 0; index < simultaneousTrains; index += 1) {
    playSoundEffect('switch', true);
    playSoundEffect('announcement', true);
    playSoundEffect('departure', true);
  }
  const burstDurationMs = Number(process.hrtime.bigint() - beforeBurst) / 1_000_000;
  const burstMetrics = { ...metrics };

  // 300 kurze Betriebswellen über sechs virtuelle Sekunden: Fahrten, Warnungen und Bremsungen.
  const beforeSustained = process.hrtime.bigint();
  for (let wave = 0; wave < 300; wave += 1) {
    clockMs += 20;
    playSoundEffect('departure', true);
    playSoundEffect('switch', true);
    playSoundEffect('announcement', true);
    playSoundEffect('brake', true);
    playSoundEffect('warning', true);
  }
  const sustainedDurationMs = Number(process.hrtime.bigint() - beforeSustained) / 1_000_000;
  const totalMetrics = { ...metrics };

  await closeSoundContext();

  const pass =
    burstMetrics.oscillators === 7 &&
    burstMetrics.gains === 8 &&
    burstMetrics.buffers === 1 &&
    burstMetrics.sources === 1 &&
    burstDurationMs < 500 &&
    sustainedDurationMs < 1_000 &&
    metrics.closes === 1;

  console.log(JSON.stringify({
    simultaneousTrains,
    burstCalls: simultaneousTrains * 3,
    burstDurationMs: Number(burstDurationMs.toFixed(3)),
    sustainedWaves: 300,
    sustainedCalls: 1_500,
    sustainedDurationMs: Number(sustainedDurationMs.toFixed(3)),
    burstMetrics,
    totalMetrics,
    pass,
  }, null, 2));

  if (!pass) process.exitCode = 1;
} finally {
  restorePerformance();
  restoreDocument();
  restoreWindow();
}
