import { performance } from 'node:perf_hooks';

import { selectActiveTerminalAlerts } from '@/components/TerminalAlertBanner';
import type { TerminalAlert } from '@/lib/terminalAlerts';

const alertCount = Number(process.argv[2] ?? 20_000);
const iterations = Number(process.argv[3] ?? 100);

const severities: TerminalAlert['severity'][] = ['CRITICAL', 'WARNING', 'INFO'];
const alertsById: Record<string, TerminalAlert> = {};

for (let index = 0; index < alertCount; index += 1) {
  const status: TerminalAlert['status'] = index % 5 === 0 ? 'ACKNOWLEDGED' : 'ACTIVE';
  const severity = severities[index % severities.length];
  alertsById[`alert-${index}`] = {
    id: `alert-${index}`,
    kind: 'STAFF_UPKEEP_RISK',
    severity,
    status,
    destination: 'terminal',
    title: `Testwarnung ${index}`,
    description: 'Synthetischer Lasttest für den Alert-Selektor.',
    metricLabel: 'Testwert',
    metricValue: `${index}`,
    entityId: null,
    createdTick: index,
    lastObservedTick: index,
    acknowledgedTick: status === 'ACKNOWLEDGED' ? index : null,
    resolvedTick: null,
  };
}

const durations: number[] = [];
let resultLength = 0;
let primaryId = '';
for (let iteration = 0; iteration < iterations; iteration += 1) {
  const start = performance.now();
  const result = selectActiveTerminalAlerts(alertsById);
  durations.push(performance.now() - start);
  resultLength = result.length;
  primaryId = result[0]?.id ?? '';
}

durations.sort((left, right) => left - right);
const percentile = (fraction: number) => durations[Math.min(durations.length - 1, Math.floor(durations.length * fraction))] ?? 0;
const total = durations.reduce((sum, value) => sum + value, 0);

console.log(JSON.stringify({
  alertCount,
  activeAlerts: resultLength,
  iterations,
  primaryId,
  minMs: Number(durations[0]?.toFixed(3) ?? 0),
  medianMs: Number(percentile(0.5).toFixed(3)),
  p95Ms: Number(percentile(0.95).toFixed(3)),
  maxMs: Number(durations.at(-1)?.toFixed(3) ?? 0),
  averageMs: Number((total / Math.max(1, iterations)).toFixed(3)),
  pass: resultLength === alertCount - Math.floor(alertCount / 5) && Boolean(primaryId),
}, null, 2));
