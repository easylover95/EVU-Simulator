import { strict as assert } from 'node:assert';
import {
  checkCraneTransfer,
  checkStorageAllocation,
  checkTrainFeasibility,
  type CargoType,
  type CargoUnit,
  type Terminal,
  type Train,
  type TrainEvent,
  type Wagon,
  type WagonLoad,
} from '../src/lib/terminalLogistics';

const terminal: Terminal = {
  id: 'terminal-duisburg',
  name: 'Terminal Duisburg-Ruhrort',
  trackLengthMeters: 120,
  maxCraneCapacityTons: 250,
  storageAreaSqm: 1_000,
  currentStorageUsedSqm: 760,
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

const validTrain: Train = {
  id: 'train-a',
  terminalId: terminal.id,
  destinationConstructionSite: 'ABS 9 Nürnberg–Ingolstadt, Bauabschnitt 3',
  totalLengthMeters: 0,
  totalWeightTons: 0,
  status: 'ASSEMBLING',
  isOrderValid: false,
};

function storedCargo(id: string, cargoTypeId: string): CargoUnit {
  return {
    id,
    cargoTypeId,
    currentTerminalId: terminal.id,
    storageAreaSqm: 20,
    status: 'IN_STORAGE',
  };
}

const validWagons: Wagon[] = [
  {
    id: 'wagon-fccs',
    uicWagonType: 'Fccs',
    maxPayloadTons: 70,
    lengthOverBuffersMeters: 12,
    tareWeightTons: 22,
    currentTerminalId: terminal.id,
    currentTrainId: validTrain.id,
    positionInTrain: 1,
    status: 'ASSEMBLING',
  },
  {
    id: 'wagon-res',
    uicWagonType: 'Res',
    maxPayloadTons: 60,
    lengthOverBuffersMeters: 19.9,
    tareWeightTons: 19,
    currentTerminalId: terminal.id,
    currentTrainId: validTrain.id,
    positionInTrain: 2,
    status: 'ASSEMBLING',
  },
];

const validUnits = [
  storedCargo('unit-ballast', ballast.id),
  storedCargo('unit-sleepers', sleepers.id),
];

const validLoads: WagonLoad[] = [
  { wagonId: validWagons[0].id, cargoUnitId: validUnits[0].id, cargoTypeId: ballast.id },
  { wagonId: validWagons[1].id, cargoUnitId: validUnits[1].id, cargoTypeId: sleepers.id },
];

function hasCode(result: { issues: Array<{ code: string }> }, code: string): boolean {
  return result.issues.some((issue) => issue.code === code);
}

// 1. A standard, correctly ordered construction train may dispatch.
const feasible = checkTrainFeasibility({
  terminal,
  train: validTrain,
  wagons: validWagons,
  cargoTypes: [ballast, sleepers, bridgePart],
  cargoUnits: validUnits,
  wagonLoads: validLoads,
  trainEvents: [],
});
assert.equal(feasible.canDispatch, true);
assert.equal(feasible.metrics.totalLengthMeters, 31.9);
assert.equal(feasible.metrics.totalWeightTons, 151);
assert.equal(feasible.metrics.isOrderValid, true);

// 2. An LÜ load creates a required approval event; approved LÜ freight may dispatch.
const lueWagon: Wagon = {
  id: 'wagon-uaai',
  uicWagonType: 'Uaai Tieflader',
  maxPayloadTons: 150,
  lengthOverBuffersMeters: 24,
  tareWeightTons: 35,
  currentTerminalId: terminal.id,
  currentTrainId: validTrain.id,
  positionInTrain: 3,
  status: 'ASSEMBLING',
};
const lueUnit = storedCargo('unit-bridge', bridgePart.id);
const lueLoad: WagonLoad = { wagonId: lueWagon.id, cargoUnitId: lueUnit.id, cargoTypeId: bridgePart.id };

const lueBlocked = checkTrainFeasibility({
  terminal,
  train: validTrain,
  wagons: [...validWagons, lueWagon],
  cargoTypes: [ballast, sleepers, bridgePart],
  cargoUnits: [...validUnits, lueUnit],
  wagonLoads: [...validLoads, lueLoad],
  trainEvents: [],
});
assert.equal(lueBlocked.canDispatch, false);
assert.equal(lueBlocked.requiresOutOfGaugeApproval, true);
assert.equal(hasCode(lueBlocked, 'LUE_GENEHMIGUNG_ERFORDERLICH'), true);
assert.deepEqual(lueBlocked.requiredEvents, [{
  trainId: validTrain.id,
  type: 'LUE_GENEHMIGUNG_ERFORDERLICH',
  status: 'OPEN',
}]);

const lueApproval: TrainEvent = {
  id: 'event-lue-approved',
  trainId: validTrain.id,
  type: 'LUE_GENEHMIGUNG_ERFORDERLICH',
  status: 'APPROVED',
  createdAt: '2026-08-27T10:00:00.000Z',
  resolvedAt: '2026-08-27T12:00:00.000Z',
};
const lueApproved = checkTrainFeasibility({
  terminal,
  train: validTrain,
  wagons: [...validWagons, lueWagon],
  cargoTypes: [ballast, sleepers, bridgePart],
  cargoUnits: [...validUnits, lueUnit],
  wagonLoads: [...validLoads, lueLoad],
  trainEvents: [lueApproval],
});
assert.equal(lueApproved.canDispatch, true);

// 3. Track length, payload and the construction sequence are independent hard gates.
const invalidWagons: Wagon[] = [
  { ...validWagons[0], positionInTrain: 2 },
  {
    ...lueWagon,
    maxPayloadTons: 90,
    lengthOverBuffersMeters: 125,
    positionInTrain: 1,
  },
];
const invalid = checkTrainFeasibility({
  terminal,
  train: validTrain,
  wagons: invalidWagons,
  cargoTypes: [ballast, sleepers, bridgePart],
  cargoUnits: [validUnits[0], lueUnit],
  wagonLoads: [validLoads[0], lueLoad],
  trainEvents: [lueApproval],
});
assert.equal(invalid.canDispatch, false);
assert.equal(invalid.metrics.isOrderValid, false);
assert.equal(hasCode(invalid, 'TRACK_LENGTH_EXCEEDED'), true);
assert.equal(hasCode(invalid, 'SINGLE_CARGO_EXCEEDS_WAGON_PAYLOAD'), true);
assert.equal(hasCode(invalid, 'CONSTRUCTION_SITE_ORDER_INVALID'), true);

// 4. A single lift and a storage reservation are independently validated before booking.
const oversizedBridge: CargoType = { ...bridgePart, id: 'cargo-oversized-bridge', weightTons: 260 };
const craneResult = checkCraneTransfer(terminal, oversizedBridge);
assert.equal(craneResult.allowed, false);
assert.equal(hasCode(craneResult, 'CRANE_CAPACITY_EXCEEDED'), true);

const storageResult = checkStorageAllocation(terminal, {
  id: 'unit-large-bridge',
  storageAreaSqm: 250,
});
assert.equal(storageResult.allowed, false);
assert.equal(storageResult.projectedStorageUsedSqm, 1_010);
assert.equal(hasCode(storageResult, 'STORAGE_CAPACITY_EXCEEDED'), true);

console.log('Terminal-Logistics-Domänentests: alle Prüfungen bestanden.');
