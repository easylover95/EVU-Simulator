import { strict as assert } from 'node:assert';

import { createGameplayEventEngine, createTerminalGameProgress, createTerminalOperationalState } from '../src/lib/terminalGameplay';
import { TERMINAL_SAVE_STORAGE_KEY } from '../src/lib/terminalPersistence';
import type { Terminal } from '../src/lib/terminalEntities';
import {
  createTerminalSimulationStore,
  type TerminalSimulationSnapshot,
} from '../src/state/terminalSimulationStore';

const terminal: Terminal = {
  id: 'terminal-tycoon',
  name: 'Testterminal',
  trackLengthMeters: 100,
  maxCraneCapacityTons: 80,
  storageAreaSqm: 350,
  currentStorageUsedSqm: 0,
  hasSpecialCrane: false,
};

function snapshot(overrides: Partial<TerminalSimulationSnapshot> = {}): TerminalSimulationSnapshot {
  return {
    currentTick: 0,
    companyBalanceCents: 10_000_000,
    nextEventSequence: 0,
    terminalsById: { [terminal.id]: terminal },
    cargoTypesById: {},
    cargoUnitsById: {},
    wagonsById: {},
    trainsById: {},
    trainEventsById: {},
    wagonLoads: [],
    inboundArrivalsById: {},
    berthChargesById: {},
    dispatchOrdersById: {},
    gameplayEventsById: {},
    gameplayEventEngine: createGameplayEventEngine(99),
    operationalState: createTerminalOperationalState(),
    majorProjectsById: {},
    gameProgress: createTerminalGameProgress({ revenueTargetCents: Number.MAX_SAFE_INTEGER }),
    eventLog: [],
    ...overrides,
    activeScenarioId: overrides.activeScenarioId ?? null,
    terminalUpgradesById: overrides.terminalUpgradesById ?? {},
    specialistsById: overrides.specialistsById ?? {},
    staffChargesById: overrides.staffChargesById ?? {},
    persistence: overrides.persistence ?? { status: 'IDLE', lastSavedAt: null, errorMessage: null },
  };
}

function eventsOf(store: ReturnType<typeof createTerminalSimulationStore>, type: string): boolean {
  return store.getState().eventLog.some((event) => event.type === type);
}

// 1. Eine Investition bucht Kapital sofort, wartet die volle Bauzeit ab und
//    leitet Terminalwerte ausschließlich über ihren Abschluss her.
const upgradeStore = createTerminalSimulationStore(snapshot());
assert.equal(upgradeStore.getState().startTerminalUpgrade(terminal.id, 'heavy-lift-crane').started, true);
assert.equal(upgradeStore.getState().companyBalanceCents, 5_200_000);
for (let tick = 0; tick < 7; tick += 1) upgradeStore.getState().advanceTick();
assert.equal(upgradeStore.getState().terminalsById[terminal.id].maxCraneCapacityTons, 80);
upgradeStore.getState().advanceTick();
assert.equal(upgradeStore.getState().terminalsById[terminal.id].maxCraneCapacityTons, 250);
assert.equal(upgradeStore.getState().terminalsById[terminal.id].hasSpecialCrane, true);
assert.equal(eventsOf(upgradeStore, 'UPGRADE_STARTED'), true);
assert.equal(eventsOf(upgradeStore, 'UPGRADE_COMPLETED'), true);

// 2. Fachpersonal wird einmal eingestellt und erzeugt anschließend pro Tick
//    eine eindeutig auditierbare Unterhaltsbuchung.
const staffStore = createTerminalSimulationStore(snapshot());
assert.equal(staffStore.getState().hireSpecialist(terminal.id, 'LUE_INSPECTOR').hired, true);
staffStore.getState().advanceTick();
assert.equal(staffStore.getState().companyBalanceCents, 9_991_000);
assert.equal(Object.values(staffStore.getState().staffChargesById)[0]?.amountCents, 9_000);
assert.equal(eventsOf(staffStore, 'SPECIALIST_HIRED'), true);
assert.equal(eventsOf(staffStore, 'STAFF_COST_BOOKED'), true);

// 3. Szenarien erzeugen einen vollständigen, eigenständigen Startzustand mit
//    klaren Zielwerten und ohne Übernahme des vorherigen Spielstands.
const scenarioStore = createTerminalSimulationStore(snapshot());
assert.equal(scenarioStore.getState().startCampaignScenario('REGIONAL_TERMINAL').started, true);
assert.equal(scenarioStore.getState().activeScenarioId, 'REGIONAL_TERMINAL');
assert.equal(scenarioStore.getState().companyBalanceCents, 3_500_000);
assert.equal(scenarioStore.getState().gameProgress.revenueTargetCents, 200_000_000);
assert.equal(scenarioStore.getState().terminalsById['terminal-havel-regional'].maxCraneCapacityTons, 80);
assert.equal(eventsOf(scenarioStore, 'SCENARIO_STARTED'), true);

// 4. Jeder erfolgreiche Tick führt im Browser zu einem versionierten Auto-Save.
const values = new Map<string, string>();
const fakeStorage: Storage = {
  length: 0,
  clear: () => values.clear(),
  getItem: (key) => values.get(key) ?? null,
  key: () => null,
  removeItem: (key) => { values.delete(key); },
  setItem: (key, value) => { values.set(key, value); },
};
Object.defineProperty(globalThis, 'window', {
  value: { localStorage: fakeStorage },
  configurable: true,
});
const persistenceStore = createTerminalSimulationStore(snapshot());
persistenceStore.getState().advanceTick();
assert.equal(persistenceStore.getState().persistence.status, 'SAVED');
assert.notEqual(values.get(TERMINAL_SAVE_STORAGE_KEY), undefined);
const loadedMeta = persistenceStore.getState().loadGame();
assert.equal(loadedMeta.status, 'SAVED');

console.log('Terminal-Tycoon-Tests: alle Prüfungen bestanden.');
