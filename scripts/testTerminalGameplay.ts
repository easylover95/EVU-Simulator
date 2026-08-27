import { strict as assert } from 'node:assert';

import {
  createGameplayEventEngine,
  createTerminalGameProgress,
  createTerminalOperationalState,
  rollGameplayEvent,
  type MajorProject,
} from '../src/lib/terminalGameplay';
import type { Train } from '../src/lib/terminalEntities';
import {
  createTerminalSimulationStore,
  type TerminalSimulationSnapshot,
} from '../src/state/terminalSimulationStore';

function snapshot(overrides: Partial<TerminalSimulationSnapshot> = {}): TerminalSimulationSnapshot {
  return {
    currentTick: 0,
    companyBalanceCents: 0,
    nextEventSequence: 0,
    terminalsById: {},
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
    gameplayEventEngine: createGameplayEventEngine(),
    operationalState: createTerminalOperationalState(),
    majorProjectsById: {},
    gameProgress: createTerminalGameProgress(),
    eventLog: [],
    ...overrides,
    activeScenarioId: overrides.activeScenarioId ?? null,
    terminalUpgradesById: overrides.terminalUpgradesById ?? {},
    specialistsById: overrides.specialistsById ?? {},
    staffChargesById: overrides.staffChargesById ?? {},
    persistence: overrides.persistence ?? { status: 'IDLE', lastSavedAt: null, errorMessage: null },
  };
}

function hasEvent(state: { eventLog: Array<{ type: string }> }, type: string): boolean {
  return state.eventLog.some((event) => event.type === type);
}

// 1. Der Event-Roll ist deterministisch, der nächste Roll ist getaktet und ein
//    offenes Ereignis verhindert eine unfaire Kaskade weiterer Störungen.
const fairRoll = rollGameplayEvent(createGameplayEventEngine(1), {
  currentTick: 4,
  hasOpenEvent: false,
  terminalIds: ['terminal-a'],
  constructionSites: ['ABS 9, Bauabschnitt 3'],
  scheduledInboundArrivalIds: ['arrival-a'],
});
assert.equal(fairRoll.event?.kind, 'CONSTRUCTION_SITE_CLOSURE');
assert.equal(fairRoll.event?.choices.length, 2);
assert.equal(fairRoll.event?.choices[0]?.immediateCostCents, 3_200_000);
const suppressedRoll = rollGameplayEvent(fairRoll.engine, {
  currentTick: 12,
  hasOpenEvent: true,
  terminalIds: ['terminal-a'],
  constructionSites: ['ABS 9, Bauabschnitt 3'],
  scheduledInboundArrivalIds: ['arrival-a'],
});
assert.equal(suppressedRoll.event, null);

// 2. Jede Auswahl materialisiert exakt den zuvor dargestellten Effekt: Bei
//    regulärer Baustellenfreigabe entstehen keine verdeckten Kosten, die Sperre
//    und der Reputationsnachteil sind aber explizit im Store festgehalten.
if (!fairRoll.event) throw new Error('Expected deterministic gameplay event.');
const choiceStore = createTerminalSimulationStore(snapshot({
  currentTick: 4,
  companyBalanceCents: 5_000_000,
  gameplayEventsById: { [fairRoll.event.id]: fairRoll.event },
  gameplayEventEngine: fairRoll.engine,
}));
const resolution = choiceStore.getState().resolveGameplayEvent(fairRoll.event.id, 'WAIT_FOR_CLEARANCE');
assert.equal(resolution.resolved, true);
assert.equal(choiceStore.getState().companyBalanceCents, 5_000_000);
assert.equal(choiceStore.getState().gameplayEventsById[fairRoll.event.id].status, 'RESOLVED');
assert.equal(choiceStore.getState().operationalState.constructionSiteClosedUntilTick['ABS 9, Bauabschnitt 3'], 8);
assert.equal(choiceStore.getState().gameProgress.reputationPoints, 0);
assert.equal(hasEvent(choiceStore.getState(), 'GAMEPLAY_EVENT_RESOLVED'), true);

// 3. Ein erfolgreich ausgeliefertes Großprojekt belohnt Liquidität und
//    Reputation, schließt den Zug ab und löst beim konfigurierten Meilenstein
//    transparent den Gewinnzustand aus.
const projectTrain: Train = {
  id: 'train-project',
  terminalId: 'terminal-project',
  destinationConstructionSite: 'Brücke Nord',
  totalLengthMeters: 55,
  totalWeightTons: 180,
  status: 'DISPATCHED',
  isOrderValid: true,
};
const project: MajorProject = {
  id: 'project-nord',
  trainId: projectTrain.id,
  label: 'Brücke Nord',
  rewardCents: 8_500_000,
  reputationReward: 25,
  deliveryDurationTicks: 1,
  status: 'IN_TRANSIT',
  dispatchedTick: 0,
  deliveryDueTick: 1,
  completedTick: null,
};
const projectStore = createTerminalSimulationStore(snapshot({
  companyBalanceCents: 2_000_000,
  trainsById: { [projectTrain.id]: projectTrain },
  majorProjectsById: { [project.id]: project },
  gameProgress: createTerminalGameProgress({ reputationTarget: 100, requiredMajorProjects: 1 }),
}));
projectStore.getState().advanceTick();
assert.equal(projectStore.getState().majorProjectsById[project.id].status, 'COMPLETED');
assert.equal(projectStore.getState().trainsById[projectTrain.id].status, 'DELIVERED');
assert.equal(projectStore.getState().companyBalanceCents, 10_500_000);
assert.equal(projectStore.getState().gameProgress.status, 'WON');
assert.equal(hasEvent(projectStore.getState(), 'MAJOR_PROJECT_COMPLETED'), true);
assert.equal(hasEvent(projectStore.getState(), 'GAME_WON'), true);

// 4. Negative Liquidität verursacht erst eine deutlich sichtbare Warnstufe und
//    führt nur bei dauerhaftem Defizit zum Verlustzustand.
const insolvencyStore = createTerminalSimulationStore(snapshot({
  companyBalanceCents: -1,
  gameProgress: createTerminalGameProgress({
    warningAfterNegativeTicks: 2,
    insolvencyAfterNegativeTicks: 3,
  }),
}));
insolvencyStore.getState().advanceTick();
assert.equal(insolvencyStore.getState().gameProgress.status, 'ACTIVE');
insolvencyStore.getState().advanceTick();
assert.equal(insolvencyStore.getState().gameProgress.status, 'INSOLVENCY_WARNING');
assert.equal(hasEvent(insolvencyStore.getState(), 'LIQUIDITY_WARNING'), true);
insolvencyStore.getState().advanceTick();
assert.equal(insolvencyStore.getState().gameProgress.status, 'INSOLVENT');
assert.equal(hasEvent(insolvencyStore.getState(), 'TERMINAL_INSOLVENT'), true);

console.log('Terminal-Gameplay-Tests: alle Prüfungen bestanden.');
