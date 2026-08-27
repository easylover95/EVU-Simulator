/**
 * Terminal-Logistics domain
 *
 * Pure domain rules for the Schwerlast-Terminal module. Persistence adapters must
 * call these functions inside their database transaction before storing a train,
 * wagon load, transfer, or approval. A lower position_in_train is the wagon that
 * is unloaded first at the construction site (Baustellenseite).
 */

export type {
  CargoCategory,
  CargoType,
  CargoTypeId,
  CargoUnit,
  CargoUnitId,
  CargoUnitStatus,
  Terminal,
  TerminalId,
  Train,
  TrainEvent,
  TrainEventId,
  TrainEventStatus,
  TrainEventType,
  TrainId,
  TrainStatus,
  Wagon,
  WagonId,
  WagonLoad,
  WagonStatus,
} from './terminalEntities';

import type {
  CargoType,
  CargoTypeId,
  CargoUnit,
  CargoUnitId,
  Terminal,
  Train,
  TrainEvent,
  Wagon,
  WagonId,
  WagonLoad,
} from './terminalEntities';

export type ValidationCode =
  | 'INVALID_NUMERIC_VALUE'
  | 'STORAGE_CAPACITY_EXCEEDED'
  | 'SPECIAL_CRANE_REQUIRED'
  | 'CRANE_CAPACITY_EXCEEDED'
  | 'WAGON_NOT_AT_TRAIN_TERMINAL'
  | 'WAGON_NOT_ASSIGNED_TO_TRAIN'
  | 'WAGON_LOAD_NOT_IN_TRAIN'
  | 'MISSING_TRAIN_POSITION'
  | 'DUPLICATE_TRAIN_POSITION'
  | 'NON_CONTIGUOUS_TRAIN_POSITION'
  | 'DUPLICATE_CARGO_ASSIGNMENT'
  | 'UNKNOWN_CARGO_TYPE'
  | 'CARGO_UNIT_NOT_AT_TRAIN_TERMINAL'
  | 'CARGO_UNIT_NOT_LOADABLE'
  | 'CARGO_UNIT_TYPE_MISMATCH'
  | 'SINGLE_CARGO_EXCEEDS_WAGON_PAYLOAD'
  | 'WAGON_PAYLOAD_EXCEEDED'
  | 'TRACK_LENGTH_EXCEEDED'
  | 'MULTIPLE_PRIORITIES_ON_WAGON'
  | 'CONSTRUCTION_SITE_ORDER_INVALID'
  | 'LUE_GENEHMIGUNG_ERFORDERLICH';

export interface ValidationIssue {
  code: ValidationCode;
  severity: 'ERROR' | 'WARNING';
  message: string;
  entityId?: string;
  details?: Record<string, number | string | boolean>;
}

export interface StorageCheckResult {
  allowed: boolean;
  projectedStorageUsedSqm: number;
  issues: ValidationIssue[];
}

export interface CraneTransferCheckResult {
  allowed: boolean;
  issues: ValidationIssue[];
}

export interface TrainMetrics {
  totalLengthMeters: number;
  totalWeightTons: number;
  totalPayloadTons: number;
  remainingTrackLengthMeters: number;
  outOfGaugeCargoCount: number;
  isOrderValid: boolean;
}

/** Vollständiger, konsistenter Snapshot, der vor Inspektion oder Abfahrt geprüft wird. */
export interface TrainFeasibilityInput {
  terminal: Terminal;
  train: Train;
  wagons: Wagon[];
  cargoTypes: CargoType[];
  cargoUnits: CargoUnit[];
  wagonLoads: WagonLoad[];
  trainEvents: TrainEvent[];
}

export interface TrainFeasibilityResult {
  canDispatch: boolean;
  requiresOutOfGaugeApproval: boolean;
  metrics: TrainMetrics;
  issues: ValidationIssue[];
  /** Add this event exactly once if a train contains LÜ cargo and no event exists. */
  requiredEvents: Array<Pick<TrainEvent, 'trainId' | 'type' | 'status'>>;
}

const EPSILON = 0.0001;

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function rounded(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function numericIssue(label: string, value: number, entityId?: string): ValidationIssue | null {
  if (isFiniteNonNegative(value)) return null;
  return {
    code: 'INVALID_NUMERIC_VALUE',
    severity: 'ERROR',
    message: `${label} muss eine endliche, nicht negative Zahl sein.`,
    entityId,
    details: { value: String(value) },
  };
}

/**
 * Validates whether a physical cargo lot can occupy the terminal storage area.
 * The caller writes currentStorageUsedSqm only after this passes in the same
 * transaction in which the CargoUnit state changes to IN_STORAGE.
 */
export function checkStorageAllocation(
  terminal: Terminal,
  cargoUnit: Pick<CargoUnit, 'id' | 'storageAreaSqm'>,
): StorageCheckResult {
  const issues: ValidationIssue[] = [];
  const terminalValues: Array<[string, number]> = [
    ['Terminal-Lagerfläche', terminal.storageAreaSqm],
    ['Aktuelle Terminalauslastung', terminal.currentStorageUsedSqm],
    ['Lagerflächenbedarf der Fracht', cargoUnit.storageAreaSqm],
  ];

  for (const [label, value] of terminalValues) {
    const issue = numericIssue(label, value, cargoUnit.id);
    if (issue) issues.push(issue);
  }

  const projectedStorageUsedSqm = rounded(terminal.currentStorageUsedSqm + cargoUnit.storageAreaSqm);
  if (issues.length === 0 && projectedStorageUsedSqm - terminal.storageAreaSqm > EPSILON) {
    issues.push({
      code: 'STORAGE_CAPACITY_EXCEEDED',
      severity: 'ERROR',
      message: `Die Lagerfläche von ${terminal.name} reicht nicht aus.`,
      entityId: cargoUnit.id,
      details: {
        capacitySqm: terminal.storageAreaSqm,
        projectedStorageUsedSqm,
      },
    });
  }

  return {
    allowed: issues.every((issue) => issue.severity !== 'ERROR'),
    projectedStorageUsedSqm,
    issues,
  };
}

/**
 * Checks a single lifting operation (ship/aircraft/truck → terminal).
 * A special-crane check is deliberately separate from the tonnage check so the
 * UI can explain the exact operational blocker.
 */
export function checkCraneTransfer(
  terminal: Terminal,
  cargoType: CargoType,
): CraneTransferCheckResult {
  const issues: ValidationIssue[] = [];
  const values: Array<[string, number, string]> = [
    ['Krantragfähigkeit', terminal.maxCraneCapacityTons, terminal.id],
    ['Frachtgewicht', cargoType.weightTons, cargoType.id],
  ];
  for (const [label, value, entityId] of values) {
    const issue = numericIssue(label, value, entityId);
    if (issue) issues.push(issue);
  }

  if (cargoType.requiresSpecialCrane && !terminal.hasSpecialCrane) {
    issues.push({
      code: 'SPECIAL_CRANE_REQUIRED',
      severity: 'ERROR',
      message: `${cargoType.name} benötigt einen Spezialkran, der am Terminal nicht verfügbar ist.`,
      entityId: cargoType.id,
    });
  }

  if (isFiniteNonNegative(cargoType.weightTons)
    && isFiniteNonNegative(terminal.maxCraneCapacityTons)
    && cargoType.weightTons - terminal.maxCraneCapacityTons > EPSILON) {
    issues.push({
      code: 'CRANE_CAPACITY_EXCEEDED',
      severity: 'ERROR',
      message: `${cargoType.name} überschreitet die Krantragfähigkeit von ${terminal.name}.`,
      entityId: cargoType.id,
      details: {
        cargoWeightTons: cargoType.weightTons,
        craneCapacityTons: terminal.maxCraneCapacityTons,
      },
    });
  }

  return { allowed: issues.every((issue) => issue.severity !== 'ERROR'), issues };
}

function cargoTypesForWagon(
  wagon: Wagon,
  loadsByWagon: Map<WagonId, WagonLoad[]>,
  cargoTypeById: Map<CargoTypeId, CargoType>,
  issues: ValidationIssue[],
): CargoType[] {
  const cargoTypes: CargoType[] = [];
  for (const load of loadsByWagon.get(wagon.id) ?? []) {
    const cargoType = cargoTypeById.get(load.cargoTypeId);
    if (!cargoType) {
      issues.push({
        code: 'UNKNOWN_CARGO_TYPE',
        severity: 'ERROR',
        message: `Die Wagenladung ${load.cargoUnitId} verweist auf einen unbekannten Frachttyp.`,
        entityId: load.cargoUnitId,
      });
      continue;
    }
    cargoTypes.push(cargoType);
  }
  return cargoTypes;
}

function orderIsValid(wagons: Wagon[], cargoTypesByWagon: Map<WagonId, CargoType[]>, issues: ValidationIssue[]): boolean {
  const positioned = wagons
    .filter((wagon) => wagon.positionInTrain !== null)
    .sort((a, b) => (a.positionInTrain ?? 0) - (b.positionInTrain ?? 0));

  let lastPriority = Number.NEGATIVE_INFINITY;
  let valid = true;
  for (const wagon of positioned) {
    const priorities = [...new Set((cargoTypesByWagon.get(wagon.id) ?? []).map(
      (cargoType) => cargoType.priorityOrderForConstructionSite,
    ))].sort((a, b) => a - b);

    if (priorities.length > 1) {
      valid = false;
      issues.push({
        code: 'MULTIPLE_PRIORITIES_ON_WAGON',
        severity: 'ERROR',
        message: `Wagen ${wagon.uicWagonType} enthält Güter mit mehreren Baustellenprioritäten und ist nicht eindeutig entladbar.`,
        entityId: wagon.id,
        details: { priorities: priorities.join(',') },
      });
      continue;
    }

    if (priorities.length === 1) {
      const priority = priorities[0];
      if (priority < lastPriority) {
        valid = false;
        issues.push({
          code: 'CONSTRUCTION_SITE_ORDER_INVALID',
          severity: 'ERROR',
          message: 'Die Wagenreihung verletzt die erforderliche Baustellen-Lieferreihenfolge.',
          entityId: wagon.id,
          details: { previousPriority: lastPriority, currentPriority: priority },
        });
      }
      lastPriority = Math.max(lastPriority, priority);
    }
  }
  return valid;
}

/**
 * Performs all pre-dispatch checks for a train formation.
 *
 * This function contains no I/O and can be used by the live UI, API service and
 * server-side transaction. The caller must persist `metrics` as the train's
 * denormalized totals and persist any `requiredEvents` transactionally.
 */
export function checkTrainFeasibility(input: TrainFeasibilityInput): TrainFeasibilityResult {
  const { terminal, train, wagons, cargoTypes, cargoUnits, wagonLoads, trainEvents } = input;
  const issues: ValidationIssue[] = [];
  const cargoTypeById = new Map(cargoTypes.map((cargoType) => [cargoType.id, cargoType]));
  const cargoUnitById = new Map(cargoUnits.map((cargoUnit) => [cargoUnit.id, cargoUnit]));
  const loadsByWagon = new Map<WagonId, WagonLoad[]>();
  const knownWagonIds = new Set(wagons.map((wagon) => wagon.id));
  const seenCargoUnitIds = new Set<CargoUnitId>();

  const trackIssue = numericIssue('Nutzlänge des Terminalgleises', terminal.trackLengthMeters, terminal.id);
  if (trackIssue) issues.push(trackIssue);

  for (const wagon of wagons) {
    for (const [label, value] of [
      ['Wagenzuladung', wagon.maxPayloadTons],
      ['Länge über Puffer', wagon.lengthOverBuffersMeters],
      ['Leergewicht', wagon.tareWeightTons ?? 0],
    ] as Array<[string, number]>) {
      const issue = numericIssue(label, value, wagon.id);
      if (issue) issues.push(issue);
    }

    if (wagon.currentTerminalId !== terminal.id) {
      issues.push({
        code: 'WAGON_NOT_AT_TRAIN_TERMINAL',
        severity: 'ERROR',
        message: `Wagen ${wagon.uicWagonType} befindet sich nicht am Terminal ${terminal.name}.`,
        entityId: wagon.id,
      });
    }
    if (wagon.currentTrainId !== train.id) {
      issues.push({
        code: 'WAGON_NOT_ASSIGNED_TO_TRAIN',
        severity: 'ERROR',
        message: `Wagen ${wagon.uicWagonType} ist dem Zug nicht zugeordnet.`,
        entityId: wagon.id,
      });
    }
    if (wagon.positionInTrain === null || !Number.isInteger(wagon.positionInTrain) || wagon.positionInTrain < 1) {
      issues.push({
        code: 'MISSING_TRAIN_POSITION',
        severity: 'ERROR',
        message: `Wagen ${wagon.uicWagonType} benötigt eine eindeutige Position im Zugverband.`,
        entityId: wagon.id,
      });
    }
  }

  const positionCount = new Map<number, number>();
  for (const wagon of wagons) {
    if (wagon.positionInTrain !== null && Number.isInteger(wagon.positionInTrain) && wagon.positionInTrain > 0) {
      positionCount.set(wagon.positionInTrain, (positionCount.get(wagon.positionInTrain) ?? 0) + 1);
    }
  }
  for (const [position, count] of positionCount) {
    if (count > 1) {
      issues.push({
        code: 'DUPLICATE_TRAIN_POSITION',
        severity: 'ERROR',
        message: `Die Zugposition ${position} wurde mehrfach vergeben.`,
        details: { position, count },
      });
    }
  }
  const sortedPositions = [...positionCount.keys()].sort((a, b) => a - b);
  for (let expected = 1; expected <= sortedPositions.length; expected += 1) {
    if (sortedPositions[expected - 1] !== expected) {
      issues.push({
        code: 'NON_CONTIGUOUS_TRAIN_POSITION',
        severity: 'ERROR',
        message: 'Die Wagenpositionen müssen ohne Lücke bei 1 beginnen.',
        entityId: train.id,
        details: { expectedPosition: expected, actualPosition: sortedPositions[expected - 1] ?? -1 },
      });
      break;
    }
  }

  for (const load of wagonLoads) {
    if (!knownWagonIds.has(load.wagonId)) {
      issues.push({
        code: 'WAGON_LOAD_NOT_IN_TRAIN',
        severity: 'ERROR',
        message: `Die Wagenladung ${load.cargoUnitId} verweist auf einen Wagen, der nicht im Zugverband steht.`,
        entityId: load.wagonId,
      });
    }
    if (!loadsByWagon.has(load.wagonId)) loadsByWagon.set(load.wagonId, []);
    loadsByWagon.get(load.wagonId)?.push(load);

    if (seenCargoUnitIds.has(load.cargoUnitId)) {
      issues.push({
        code: 'DUPLICATE_CARGO_ASSIGNMENT',
        severity: 'ERROR',
        message: `Die Frachtpartie ${load.cargoUnitId} ist mehreren Wagenladungen zugewiesen.`,
        entityId: load.cargoUnitId,
      });
    }
    seenCargoUnitIds.add(load.cargoUnitId);

    const cargoUnit = cargoUnitById.get(load.cargoUnitId);
    if (!cargoUnit) {
      issues.push({
        code: 'CARGO_UNIT_NOT_LOADABLE',
        severity: 'ERROR',
        message: `Die Frachtpartie ${load.cargoUnitId} existiert nicht.`,
        entityId: load.cargoUnitId,
      });
      continue;
    }
    if (cargoUnit.cargoTypeId !== load.cargoTypeId) {
      issues.push({
        code: 'CARGO_UNIT_TYPE_MISMATCH',
        severity: 'ERROR',
        message: `Die Frachtpartie ${load.cargoUnitId} stimmt nicht mit dem ausgewählten Frachttyp überein.`,
        entityId: load.cargoUnitId,
        details: {
          cargoUnitTypeId: cargoUnit.cargoTypeId,
          loadCargoTypeId: load.cargoTypeId,
        },
      });
    }
    if (cargoUnit.currentTerminalId !== terminal.id) {
      issues.push({
        code: 'CARGO_UNIT_NOT_AT_TRAIN_TERMINAL',
        severity: 'ERROR',
        message: `Die Frachtpartie ${load.cargoUnitId} befindet sich nicht am Abfahrtsterminal.`,
        entityId: load.cargoUnitId,
      });
    }
    if (cargoUnit.status !== 'IN_STORAGE') {
      issues.push({
        code: 'CARGO_UNIT_NOT_LOADABLE',
        severity: 'ERROR',
        message: `Die Frachtpartie ${load.cargoUnitId} ist nicht aus dem Terminallager ladbar.`,
        entityId: load.cargoUnitId,
        details: { cargoStatus: cargoUnit.status },
      });
    }
  }

  const cargoTypesByWagon = new Map<WagonId, CargoType[]>();
  let totalPayloadTons = 0;
  let outOfGaugeCargoCount = 0;
  for (const wagon of wagons) {
    const wagonCargoTypes = cargoTypesForWagon(wagon, loadsByWagon, cargoTypeById, issues);
    cargoTypesByWagon.set(wagon.id, wagonCargoTypes);

    let wagonPayloadTons = 0;
    for (const cargoType of wagonCargoTypes) {
      const weightIssue = numericIssue('Frachtgewicht', cargoType.weightTons, cargoType.id);
      if (weightIssue) {
        issues.push(weightIssue);
        continue;
      }
      wagonPayloadTons += cargoType.weightTons;
      outOfGaugeCargoCount += cargoType.isOutOfGauge ? 1 : 0;
      if (cargoType.weightTons - wagon.maxPayloadTons > EPSILON) {
        issues.push({
          code: 'SINGLE_CARGO_EXCEEDS_WAGON_PAYLOAD',
          severity: 'ERROR',
          message: `${cargoType.name} überschreitet die maximale Zuladung von Wagen ${wagon.uicWagonType}.`,
          entityId: wagon.id,
          details: { cargoWeightTons: cargoType.weightTons, maxPayloadTons: wagon.maxPayloadTons },
        });
      }
    }
    totalPayloadTons += wagonPayloadTons;
    if (wagonPayloadTons - wagon.maxPayloadTons > EPSILON) {
      issues.push({
        code: 'WAGON_PAYLOAD_EXCEEDED',
        severity: 'ERROR',
        message: `Die Gesamtzuladung von Wagen ${wagon.uicWagonType} überschreitet seine Nutzlast.`,
        entityId: wagon.id,
        details: { wagonPayloadTons: rounded(wagonPayloadTons), maxPayloadTons: wagon.maxPayloadTons },
      });
    }
  }

  const totalLengthMeters = rounded(wagons.reduce((sum, wagon) => sum + wagon.lengthOverBuffersMeters, 0));
  const totalWeightTons = rounded(totalPayloadTons + wagons.reduce((sum, wagon) => sum + (wagon.tareWeightTons ?? 0), 0));
  if (totalLengthMeters - terminal.trackLengthMeters > EPSILON) {
    issues.push({
      code: 'TRACK_LENGTH_EXCEEDED',
      severity: 'ERROR',
      message: `Der Zug ist ${rounded(totalLengthMeters - terminal.trackLengthMeters)} m länger als die Nutzlänge von ${terminal.name}.`,
      entityId: train.id,
      details: { totalLengthMeters, trackLengthMeters: terminal.trackLengthMeters },
    });
  }

  const orderConstraintsAreMet = orderIsValid(wagons, cargoTypesByWagon, issues);
  const positionsAreValid = !issues.some((issue) => (
    issue.code === 'MISSING_TRAIN_POSITION'
    || issue.code === 'DUPLICATE_TRAIN_POSITION'
    || issue.code === 'NON_CONTIGUOUS_TRAIN_POSITION'
  ));
  const isOrderValid = positionsAreValid && orderConstraintsAreMet;
  const requiresOutOfGaugeApproval = outOfGaugeCargoCount > 0;
  const lueEvent = trainEvents.find((event) => event.trainId === train.id && event.type === 'LUE_GENEHMIGUNG_ERFORDERLICH');
  const lueApprovalGranted = lueEvent?.status === 'APPROVED';
  const requiredEvents: TrainFeasibilityResult['requiredEvents'] = [];

  if (requiresOutOfGaugeApproval && !lueApprovalGranted) {
    issues.push({
      code: 'LUE_GENEHMIGUNG_ERFORDERLICH',
      severity: 'ERROR',
      message: 'Der Zug enthält Lademaßüberschreitungen und benötigt eine genehmigte LÜ-Freigabe.',
      entityId: train.id,
      details: { outOfGaugeCargoCount },
    });
    if (!lueEvent) {
      requiredEvents.push({
        trainId: train.id,
        type: 'LUE_GENEHMIGUNG_ERFORDERLICH',
        status: 'OPEN',
      });
    }
  }

  const metrics: TrainMetrics = {
    totalLengthMeters,
    totalWeightTons,
    totalPayloadTons: rounded(totalPayloadTons),
    remainingTrackLengthMeters: rounded(terminal.trackLengthMeters - totalLengthMeters),
    outOfGaugeCargoCount,
    isOrderValid,
  };

  return {
    canDispatch: issues.every((issue) => issue.severity !== 'ERROR'),
    requiresOutOfGaugeApproval,
    metrics,
    issues,
    requiredEvents,
  };
}

/** Returns the only denormalized train fields a persistence layer may write. */
export function trainDerivedFields(result: TrainFeasibilityResult): Pick<Train, 'totalLengthMeters' | 'totalWeightTons' | 'isOrderValid'> {
  return {
    totalLengthMeters: result.metrics.totalLengthMeters,
    totalWeightTons: result.metrics.totalWeightTons,
    isOrderValid: result.metrics.isOrderValid,
  };
}
