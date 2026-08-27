import type { Metric } from 'web-vitals';

export const WEB_VITALS_BUFFER_KEY = 'evu-web-vitals-buffer';
const MAX_BUFFER_ENTRIES = 100;

type ScreenClass = 'mobile' | 'desktop';
type ConnectionClass = 'slow' | 'standard' | 'unknown';

export interface StoredWebVital {
  name: 'LCP' | 'CLS' | 'INP';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  metricId: string;
  appVersion: string;
  screenClass: ScreenClass;
  connectionClass: ConnectionClass;
  recordedAt: string;
}

let monitoringStarted = false;
let monitoringEnabled = false;
let bufferedMetrics: StoredWebVital[] = [];

function readBuffer(): StoredWebVital[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(WEB_VITALS_BUFFER_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(-MAX_BUFFER_ENTRIES) : [];
  } catch {
    return [];
  }
}

function persistBuffer(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(WEB_VITALS_BUFFER_KEY, JSON.stringify(bufferedMetrics.slice(-MAX_BUFFER_ENTRIES)));
  } catch {
    /* private mode / quota: monitoring must never affect the game */
  }
}

function getScreenClass(): ScreenClass {
  return window.matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop';
}

function getConnectionClass(): ConnectionClass {
  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
  }).connection;
  if (!connection) return 'unknown';
  if (connection.saveData || connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') return 'slow';
  return 'standard';
}

function toStoredMetric(metric: Metric): StoredWebVital | null {
  if (metric.name !== 'LCP' && metric.name !== 'CLS' && metric.name !== 'INP') return null;
  const value = metric.name === 'CLS' ? Number(metric.value.toFixed(4)) : Math.round(metric.value);
  return {
    name: metric.name,
    value,
    rating: metric.rating,
    metricId: metric.id,
    appVersion: 'evu-simulator-vitals-v1',
    screenClass: getScreenClass(),
    connectionClass: getConnectionClass(),
    recordedAt: new Date().toISOString(),
  };
}

function recordMetric(metric: Metric): void {
  if (!monitoringEnabled) return;
  const storedMetric = toStoredMetric(metric);
  if (!storedMetric) return;
  bufferedMetrics.push(storedMetric);
  bufferedMetrics = bufferedMetrics.slice(-MAX_BUFFER_ENTRIES);
  persistBuffer();
}

/**
 * Starts one low-overhead, local-only field monitor. The web-vitals package is
 * imported during idle time so the opt-in path never competes with first paint.
 */
export function startWebVitalsMonitoring(enabled: boolean): void {
  monitoringEnabled = enabled;
  if (!enabled || monitoringStarted || typeof window === 'undefined') return;
  monitoringStarted = true;
  bufferedMetrics = readBuffer();

  const loadMonitor = () => {
    void import('web-vitals').then(({ onCLS, onINP, onLCP }) => {
      onLCP(recordMetric);
      onCLS(recordMetric);
      onINP(recordMetric);
    }).catch(() => {
      monitoringStarted = false;
    });
  };

  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  };
  if (idleWindow.requestIdleCallback) {
    idleWindow.requestIdleCallback(loadMonitor, { timeout: 5_000 });
  } else {
    window.setTimeout(loadMonitor, 1_500);
  }
}

export function loadStoredWebVitals(): StoredWebVital[] {
  return readBuffer();
}
