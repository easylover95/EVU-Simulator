import { strict as assert } from 'node:assert';

import {
  createGameplayEventEngine,
  createTerminalGameProgress,
  createTerminalOperationalState,
} from '../src/lib/terminalGameplay';
import {
  createTerminalSimulationStore,
  type InboundArrival,
  type TerminalSimulationSnapshot,
} from '../src/state/terminalSimulationStore';
import type {
  CargoType,
  CargoUnit,
  Terminal,
  Train,
  Wagon,
  WagonLoad,
} from '../src/lib/terminalEntities';

const terminal: Terminal = {
  id: 'terminal-duisburg',
  name: 'Terminal Duisburg-Ruhrort',
  trackLengthMeters: 120,
  maxCraneCapacityTons: 250,
  storageAreaSqm: 1_000,
  currentStorageUsedSqm: 400,
  hasSpecialCrane: true,
};

const ballast: CargoType = {
  id: 'cargo-ballast',
  name: 'Schotter',
  category: 'TRACK_BALLAST',
  weightTons: 60,
  requiresSpecialCrane: false,
  isOutOfGauge: false,
  priorityOrderForConstructionSite: 1,
};

const sleepers: CargoType = {
  id: 'cargo-sleepers',
  name: 'Gleisschwellen',
  category: 'TRACK_SLEEPERS',
  weightTons: 50,
  requiresSpecialCrane: false,
  isOutOfGauge: false,
  priorityOrderForConstructionSite: 2,
};

const bridgePart: CargoType = {
  id: 'cargo-bridge',
  name: 'Brückenteil',
  category: 'BRIDGE_SECTION',
  weightTons: 100,
  requiresSpecialCrane: true,
  isOutOfGauge: true,
  priorityOrderForConstructionSite: 3,
};

function cargoUnit(id: string, cargoTypeId: string): CargoUnit {
  return {
    id,
    cargoTypeId,
    currentTerminalId: terminal.id,
    storageAreaSqm: 25,
    status: 'IN_STORAGE',
  };
}

function train(id: string): Train {
  return {
    id,
    terminalId: terminal.id,
    destinationConstructionSite: 'ABS 9, Bauabschnitt 3',
    totalLengthMeters: 0,
    totalWeightTons: 0,
    status: 'IN_INSPECTION',
    isOrderValid: false,
  };
}

function wagon(
  id: string,
  trainId: string,
  positionInTrain: number,
  maxPayloadTons: number,
  lengthOverBuffersMeters: number,
): Wagon {
  return {
    id,
    uicWagonType: 'Res',
    maxPayloadTons,
    lengthOverBuffersMeters,
    tareWeightTons: 20,
    currentTerminalId: terminal.id,
    currentTrainId: trainId,
    positionInTrain,
    status: 'ASSEMBLING',
  };
}

function baseSnapshot(overrides: Partial<TerminalSimulationSnapshot> = {}): TerminalSimulationSnapshot {
  return {
    currentTick: 0,
    companyBalanceCents: 100_000,
    nextEventSequence: 0,
    terminalsById: { [terminal.id]: terminal },
    cargoTypesById: {
      [ballast.id]: ballast,
      [sleepers.id]: sleepers,
      [bridgePart.id]: bridgePart,
    },
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
  };
}

function hasBlocker(result: { emittedEvents: Array<{ blockerCodes?: string[] }> }, code: string): boolean {
  return result.emittedEvents.some((event) => event.blockerCodes?.includes(code));
}

// 1. Zeit vergeht nur durch die explizite Aktion; jede zusätzliche Stunde nach
//    Ende der Freiliegezeit bucht genau eine unveränderliche Liegegebühr.
const arrival: InboundArrival = {
  id: 'arrival-helios',
  terminalId: terminal.id,
  mode: 'SHIP',
  label: 'MS Helios',
  cargoUnitIds: [],
  status: 'BERTHED',
  freeBerthUntilTick: 0,
  laytimeFeeCentsPerTick: 125,
};
const laytimeStore = createTerminalSimulationStore(baseSnapshot({
  inboundArrivalsById: { [arrival.id]: arrival },
}));
assert.equal(laytimeStore.getState().currentTick, 0);
const firstTick = laytimeStore.getState().advanceTick();
assert.equal(firstTick.currentTick, 1);
assert.equal(firstTick.berthCharges.length, 1);
assert.equal(laytimeStore.getState().companyBalanceCents, 99_875);
const secondTick = laytimeStore.getState().advanceTick();
assert.equal(secondTick.currentTick, 2);
assert.equal(Object.keys(laytimeStore.getState().berthChargesById).length, 2);
assert.equal(laytimeStore.getState().companyBalanceCents, 99_750);

// 2. Eine LÜ-Fracht blockiert die geplante Abfahrt, erzeugt ein Freigabeereignis
//    und darf nach bewusster Genehmigung erst in einem neu geplanten Tick fahren.
const lueTrain = train('train-lue');
const lueWagons = [
  wagon('wagon-ballast', lueTrain.id, 1, 70, 12),
  wagon('wagon-sleepers', lueTrain.id, 2, 60, 16),
  wagon('wagon-bridge', lueTrain.id, 3, 150, 24),
];
const lueUnits = [
  cargoUnit('unit-ballast', ballast.id),
  cargoUnit('unit-sleepers', sleepers.id),
  cargoUnit('unit-bridge', bridgePart.id),
];
const lueLoads: WagonLoad[] = [
  { wagonId: lueWagons[0].id, cargoUnitId: lueUnits[0].id, cargoTypeId: ballast.id },
  { wagonId: lueWagons[1].id, cargoUnitId: lueUnits[1].id, cargoTypeId: sleepers.id },
  { wagonId: lueWagons[2].id, cargoUnitId: lueUnits[2].id, cargoTypeId: bridgePart.id },
];
const lueStore = createTerminalSimulationStore(baseSnapshot({
  trainsById: { [lueTrain.id]: lueTrain },
  wagonsById: Object.fromEntries(lueWagons.map((item) => [item.id, item])),
  cargoUnitsById: Object.fromEntries(lueUnits.map((item) => [item.id, item])),
  wagonLoads: lueLoads,
}));
assert.equal(lueStore.getState().scheduleTrainDeparture(lueTrain.id, 1).scheduled, true);
const blockedLueTick = lueStore.getState().advanceTick();
assert.equal(blockedLueTick.dispatchAttempts[0]?.dispatched, false);
assert.equal(lueStore.getState().trainsById[lueTrain.id].status, 'IN_INSPECTION');
const lueEventId = 'train-event-train-lue-lue_genehmigung_erforderlich';
assert.equal(lueStore.getState().trainEventsById[lueEventId]?.status, 'OPEN');
assert.equal(lueStore.getState().resolveTrainEvent(lueEventId, 'APPROVED'), true);
assert.equal(lueStore.getState().scheduleTrainDeparture(lueTrain.id, 2).scheduled, true);
const dispatchedLueTick = lueStore.getState().advanceTick();
assert.equal(dispatchedLueTick.dispatchAttempts[0]?.dispatched, true);
assert.equal(lueStore.getState().trainsById[lueTrain.id].status, 'DISPATCHED');
assert.equal(lueStore.getState().wagonsById['wagon-bridge'].status, 'IN_TRANSIT');
assert.equal(lueStore.getState().terminalsById[terminal.id].currentStorageUsedSqm, 325);

// 3. Die Ereignisschleife nutzt dieselbe Phase-2-Prüfung für Überlänge,
//    Überladung und Baustellenreihenfolge; der Zug bleibt im Inspektionsstatus.
const invalidTrain = train('train-invalid');
const invalidWagons = [
  wagon('wagon-bridge-invalid', invalidTrain.id, 1, 90, 125),
  wagon('wagon-ballast-invalid', invalidTrain.id, 2, 70, 12),
];
const invalidUnits = [
  cargoUnit('unit-bridge-invalid', bridgePart.id),
  cargoUnit('unit-ballast-invalid', ballast.id),
];
const invalidLoads: WagonLoad[] = [
  { wagonId: invalidWagons[0].id, cargoUnitId: invalidUnits[0].id, cargoTypeId: bridgePart.id },
  { wagonId: invalidWagons[1].id, cargoUnitId: invalidUnits[1].id, cargoTypeId: ballast.id },
];
const invalidStore = createTerminalSimulationStore(baseSnapshot({
  trainsById: { [invalidTrain.id]: invalidTrain },
  wagonsById: Object.fromEntries(invalidWagons.map((item) => [item.id, item])),
  cargoUnitsById: Object.fromEntries(invalidUnits.map((item) => [item.id, item])),
  wagonLoads: invalidLoads,
}));
assert.equal(invalidStore.getState().scheduleTrainDeparture(invalidTrain.id, 1).scheduled, true);
const invalidTick = invalidStore.getState().advanceTick();
assert.equal(invalidTick.dispatchAttempts[0]?.dispatched, false);
assert.equal(invalidStore.getState().trainsById[invalidTrain.id].status, 'IN_INSPECTION');
assert.equal(hasBlocker(invalidTick, 'TRACK_LENGTH_EXCEEDED'), true);
assert.equal(hasBlocker(invalidTick, 'SINGLE_CARGO_EXCEEDS_WAGON_PAYLOAD'), true);
assert.equal(hasBlocker(invalidTick, 'CONSTRUCTION_SITE_ORDER_INVALID'), true);

// 4. Der mobile Tap-to-Select-Workflow ergänzt Wagen am Zugende und aktualisiert
//    die denormalisierten Live-Metriken nach jeder Wagen- oder Frachtzuweisung.
const formationTrain = { ...train('train-formation'), status: 'ASSEMBLING' as const };
const selectableWagon = wagon('wagon-selectable', formationTrain.id, 1, 70, 12);
const selectableCargo = cargoUnit('unit-selectable', ballast.id);
const formationStore = createTerminalSimulationStore(baseSnapshot({
  trainsById: { [formationTrain.id]: formationTrain },
  wagonsById: {
    [selectableWagon.id]: {
      ...selectableWagon,
      currentTrainId: null,
      positionInTrain: null,
      status: 'AVAILABLE',
    },
  },
  cargoUnitsById: { [selectableCargo.id]: selectableCargo },
}));
assert.equal(formationStore.getState().assignWagonToTrain(selectableWagon.id, formationTrain.id).changed, true);
assert.equal(formationStore.getState().wagonsById[selectableWagon.id].positionInTrain, 1);
assert.equal(formationStore.getState().assignCargoToWagon(selectableCargo.id, selectableWagon.id).changed, true);
assert.equal(formationStore.getState().trainsById[formationTrain.id].totalLengthMeters, 12);
assert.equal(formationStore.getState().trainsById[formationTrain.id].totalWeightTons, 80);
assert.equal(formationStore.getState().removeCargoFromWagon(selectableCargo.id, selectableWagon.id).changed, true);
assert.equal(formationStore.getState().removeWagonFromTrain(selectableWagon.id, formationTrain.id).changed, true);
assert.equal(formationStore.getState().wagonsById[selectableWagon.id].currentTrainId, null);

console.log('Terminal-Simulation-Store-Tests: alle Prüfungen bestanden.');
