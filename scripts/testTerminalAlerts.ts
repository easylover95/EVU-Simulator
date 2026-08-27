import { strict as assert } from 'node:assert';

import { reconcileTerminalAlerts } from '../src/lib/terminalAlerts';
import { createGameplayEventEngine, createTerminalGameProgress, createTerminalOperationalState } from '../src/lib/terminalGameplay';
import { createTerminalSimulationStore, type TerminalSimulationSnapshot } from '../src/state/terminalSimulationStore';

function snapshot(overrides: Partial<TerminalSimulationSnapshot> = {}): TerminalSimulationSnapshot {
  return {
    currentTick: 8,
    companyBalanceCents: -50_000,
    nextEventSequence: 0,
    terminalsById: {
      'terminal-alert': { id: 'terminal-alert', name: 'Alarmterminal', trackLengthMeters: 180, maxCraneCapacityTons: 250, storageAreaSqm: 800, currentStorageUsedSqm: 0, hasSpecialCrane: true },
    },
    cargoTypesById: {}, cargoUnitsById: {}, wagonsById: {}, trainsById: {}, trainEventsById: {}, wagonLoads: [],
    inboundArrivalsById: {}, berthChargesById: {}, dispatchOrdersById: {},
    gameplayEventsById: {}, gameplayEventEngine: createGameplayEventEngine(), operationalState: createTerminalOperationalState(), majorProjectsById: {},
    gameProgress: createTerminalGameProgress({ consecutiveNegativeTicks: 3, warningAfterNegativeTicks: 3, insolvencyAfterNegativeTicks: 10 }),
    activeScenarioId: null, terminalUpgradesById: {}, specialistsById: {}, staffChargesById: {},
    persistence: { status: 'IDLE', lastSavedAt: null, errorMessage: null }, eventLog: [],
    ...overrides,
    alertsById: overrides.alertsById ?? {},
  };
}

// 1. Eine Insolvenzvorwarnung wird als kritischer, klickbarer und eindeutig
//    deduplizierter Alert erstellt.
const liquidity = snapshot();
const firstRun = reconcileTerminalAlerts(liquidity, {});
const liquidityAlert = firstRun.alertsById['alert-insolvency-warning'];
assert.equal(liquidityAlert?.severity, 'CRITICAL');
assert.equal(liquidityAlert?.destination, 'terminalmanagement');
assert.equal(firstRun.raised.length, 1);
const secondRun = reconcileTerminalAlerts(liquidity, firstRun.alertsById);
assert.equal(secondRun.raised.length, 0);
assert.equal(secondRun.alertsById['alert-insolvency-warning'].createdTick, 8);

// 2. Ein realer Projektumsatz mit höheren Ausbaukosten führt zu einer
//    negativen Zugmarge und damit zu einer verlinkten Analysewarnung.
const negativeMargin = snapshot({
  currentTick: 8,
  companyBalanceCents: 500_000,
  gameProgress: createTerminalGameProgress(),
  trainsById: { train: { id: 'train', terminalId: 'terminal-alert', destinationConstructionSite: 'Baustelle Süd', totalLengthMeters: 100, totalWeightTons: 0, status: 'DELIVERED', isOrderValid: true } },
  majorProjectsById: { project: { id: 'project', trainId: 'train', label: 'Baustelle Süd', rewardCents: 100_000, reputationReward: 10, deliveryDurationTicks: 1, status: 'COMPLETED', dispatchedTick: 1, deliveryDueTick: 2, completedTick: 2 } },
  eventLog: [
    { id: 'income', tick: 2, type: 'MAJOR_PROJECT_COMPLETED', severity: 'SUCCESS', message: 'Erlös', amountCents: 100_000 },
    { id: 'upgrade', tick: 3, type: 'UPGRADE_STARTED', severity: 'INFO', message: 'Ausbau', amountCents: 200_000 },
  ],
});
const marginRun = reconcileTerminalAlerts(negativeMargin, {});
const marginAlert = Object.values(marginRun.alertsById).find((alert) => alert.kind === 'NEGATIVE_CONTRIBUTION_MARGIN');
assert.equal(marginAlert?.destination, 'terminalanalytics');
assert.equal(marginAlert?.severity, 'WARNING');

// 3. Stark steigende Liegegebühren werden aus dem tatsächlichen Tickverlauf
//    erkannt; sobald die Ursache verschwindet, wird ein aktiver Alert entwarnt.
const berthRisk = snapshot({
  currentTick: 9,
  companyBalanceCents: 500_000,
  gameProgress: createTerminalGameProgress(),
  eventLog: [
    { id: 'b1', tick: 3, type: 'BERTH_FEE_BOOKED', severity: 'WARNING', message: 'Liege', amountCents: 5_000 },
    { id: 'b2', tick: 4, type: 'BERTH_FEE_BOOKED', severity: 'WARNING', message: 'Liege', amountCents: 5_000 },
    { id: 'b3', tick: 5, type: 'BERTH_FEE_BOOKED', severity: 'WARNING', message: 'Liege', amountCents: 5_000 },
    { id: 'b4', tick: 6, type: 'BERTH_FEE_BOOKED', severity: 'WARNING', message: 'Liege', amountCents: 30_000 },
    { id: 'b5', tick: 7, type: 'BERTH_FEE_BOOKED', severity: 'WARNING', message: 'Liege', amountCents: 30_000 },
    { id: 'b6', tick: 8, type: 'BERTH_FEE_BOOKED', severity: 'WARNING', message: 'Liege', amountCents: 30_000 },
  ],
});
const berthRun = reconcileTerminalAlerts(berthRisk, {});
assert.equal(berthRun.alertsById['alert-rising-berth-fees']?.destination, 'terminal');
const resolvedRun = reconcileTerminalAlerts(snapshot({ currentTick: 10, companyBalanceCents: 500_000, gameProgress: createTerminalGameProgress() }), berthRun.alertsById);
assert.equal(resolvedRun.alertsById['alert-rising-berth-fees'].status, 'RESOLVED');
assert.equal(resolvedRun.resolved.length, 1);

// 4. Der Store wertet Alerts nach einem erfolgreichen Tick aus, schreibt die
//    Auslösung auditierbar mit und erlaubt eine explizite Spielerquittierung.
const integratedStore = createTerminalSimulationStore(liquidity);
const integratedTick = integratedStore.getState().advanceTick();
assert.equal(integratedStore.getState().alertsById['alert-insolvency-warning']?.status, 'ACTIVE');
assert.equal(integratedTick.emittedEvents.some((event) => event.type === 'ALERT_RAISED'), true);
assert.equal(integratedStore.getState().acknowledgeAlert('alert-insolvency-warning'), true);
assert.equal(integratedStore.getState().alertsById['alert-insolvency-warning']?.status, 'ACKNOWLEDGED');
assert.equal(integratedStore.getState().eventLog.some((event) => event.type === 'ALERT_ACKNOWLEDGED'), true);

console.log('Terminal-Alert-Tests: alle Prüfungen bestanden.');
