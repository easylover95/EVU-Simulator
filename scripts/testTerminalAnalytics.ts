import { strict as assert } from 'node:assert';

import { createGameplayEventEngine, createTerminalGameProgress, createTerminalOperationalState } from '../src/lib/terminalGameplay';
import { buildTerminalAnalytics } from '../src/lib/terminalAnalytics';
import type { TerminalSimulationSnapshot } from '../src/state/terminalSimulationStore';

const snapshot: TerminalSimulationSnapshot = {
  currentTick: 5,
  companyBalanceCents: 2_000_000,
  nextEventSequence: 5,
  terminalsById: {
    'terminal-analytics': {
      id: 'terminal-analytics', name: 'Analyse-Terminal', trackLengthMeters: 180, maxCraneCapacityTons: 250, storageAreaSqm: 900, currentStorageUsedSqm: 0, hasSpecialCrane: true,
    },
  },
  cargoTypesById: {
    ballast: { id: 'ballast', name: 'Gleisschotter', category: 'TRACK_BALLAST', weightTons: 50, requiresSpecialCrane: false, isOutOfGauge: false, priorityOrderForConstructionSite: 1 },
    bridge: { id: 'bridge', name: 'Brückenteil', category: 'BRIDGE_SECTION', weightTons: 50, requiresSpecialCrane: true, isOutOfGauge: true, priorityOrderForConstructionSite: 2 },
  },
  cargoUnitsById: {
    'unit-ballast': { id: 'unit-ballast', cargoTypeId: 'ballast', currentTerminalId: 'terminal-analytics', storageAreaSqm: 30, status: 'DELIVERED' },
    'unit-bridge': { id: 'unit-bridge', cargoTypeId: 'bridge', currentTerminalId: 'terminal-analytics', storageAreaSqm: 50, status: 'DELIVERED' },
  },
  wagonsById: {
    'wagon-ballast': { id: 'wagon-ballast', uicWagonType: 'Fccs', maxPayloadTons: 70, lengthOverBuffersMeters: 12, currentTerminalId: 'terminal-analytics', currentTrainId: 'train-nord', positionInTrain: 1, status: 'IN_TRANSIT' },
    'wagon-bridge': { id: 'wagon-bridge', uicWagonType: 'Uaai Tieflader', maxPayloadTons: 150, lengthOverBuffersMeters: 24, currentTerminalId: 'terminal-analytics', currentTrainId: 'train-nord', positionInTrain: 2, status: 'IN_TRANSIT' },
  },
  trainsById: {
    'train-nord': { id: 'train-nord', terminalId: 'terminal-analytics', destinationConstructionSite: 'Brücke Nord', totalLengthMeters: 36, totalWeightTons: 140, status: 'DELIVERED', isOrderValid: true },
  },
  trainEventsById: {},
  wagonLoads: [
    { wagonId: 'wagon-ballast', cargoUnitId: 'unit-ballast', cargoTypeId: 'ballast' },
    { wagonId: 'wagon-bridge', cargoUnitId: 'unit-bridge', cargoTypeId: 'bridge' },
  ],
  inboundArrivalsById: {},
  berthChargesById: {},
  dispatchOrdersById: {},
  gameplayEventsById: {},
  gameplayEventEngine: createGameplayEventEngine(),
  operationalState: createTerminalOperationalState(),
  majorProjectsById: {
    'project-nord': { id: 'project-nord', trainId: 'train-nord', label: 'Brücke Nord', rewardCents: 1_000_000, reputationReward: 20, deliveryDurationTicks: 3, status: 'COMPLETED', dispatchedTick: 1, deliveryDueTick: 4, completedTick: 4 },
  },
  gameProgress: createTerminalGameProgress({ grossRevenueCents: 1_000_000 }),
  activeScenarioId: null,
  terminalUpgradesById: {},
  specialistsById: {},
  staffChargesById: {},
  persistence: { status: 'IDLE', lastSavedAt: null, errorMessage: null },
  eventLog: [
    { id: 'upgrade', tick: 2, type: 'UPGRADE_STARTED', severity: 'INFO', message: 'Ausbau', amountCents: 100_000 },
    { id: 'berth', tick: 3, type: 'BERTH_FEE_BOOKED', severity: 'WARNING', message: 'Liegegebühr', amountCents: 5_000 },
    { id: 'revenue', tick: 4, type: 'MAJOR_PROJECT_COMPLETED', severity: 'SUCCESS', message: 'Projekt', amountCents: 1_000_000 },
    { id: 'staff', tick: 4, type: 'STAFF_COST_BOOKED', severity: 'WARNING', message: 'Personal', amountCents: 10_000 },
    { id: 'event', tick: 5, type: 'GAMEPLAY_EVENT_RESOLVED', severity: 'WARNING', message: 'Entscheidung', amountCents: -2_000 },
  ],
};

const analytics = buildTerminalAnalytics(snapshot, 4);

// 1. Einnahmen und jede geforderte Ausgabenkategorie werden exakt aus dem
//    vorhandenen Ereignisprotokoll abgeleitet, nicht geschätzt.
assert.equal(analytics.totals.revenueCents, 1_000_000);
assert.equal(analytics.totals.expenseCents, 117_000);
assert.equal(analytics.totals.operatingResultCents, 883_000);
assert.equal(analytics.totals.expensesByCategory.AUSBAU, 100_000);
assert.equal(analytics.totals.expensesByCategory.LIEGEGEBUEHR, 5_000);
assert.equal(analytics.totals.expensesByCategory.PERSONAL, 10_000);
assert.equal(analytics.totals.expensesByCategory.EREIGNISSTRAFE, 2_000);

// 2. Die Zeitreihe bleibt auf die letzten Ticks begrenzt und weist die
//    Einnahmen und Ausgaben den korrekten Simulationsstunden zu.
assert.deepEqual(analytics.ticks.map((line) => line.tick), [2, 3, 4, 5]);
assert.equal(analytics.ticks.find((line) => line.tick === 4)?.revenueCents, 1_000_000);
assert.equal(analytics.ticks.find((line) => line.tick === 4)?.expenseCents, 10_000);

// 3. Zug-, Fracht- und Gleisanalysen verteilen reale Projekterlöse und alle
//    erfassten Kosten umsatzgewichtet; so bleibt der Deckungsbeitrag prüfbar.
assert.equal(analytics.trainContribution[0]?.label, 'Brücke Nord');
assert.equal(analytics.trainContribution[0]?.contributionMarginCents, 883_000);
assert.equal(analytics.cargoContribution.length, 2);
assert.equal(analytics.cargoContribution[0]?.revenueCents, 500_000);
assert.equal(analytics.cargoContribution[0]?.allocatedExpenseCents, 58_500);
assert.equal(analytics.trackContribution[0]?.throughputTons, 100);

console.log('Terminal-Analytics-Tests: alle Prüfungen bestanden.');
