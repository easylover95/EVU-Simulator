import type {
  CargoType,
  CargoUnit,
  Terminal,
  Train,
  Wagon,
  WagonLoad,
} from '@/lib/terminalEntities';
import {
  createGameplayEventEngine,
  createTerminalGameProgress,
  createTerminalOperationalState,
} from '@/lib/terminalGameplay';
import type { InboundArrival, TerminalSimulationSnapshot } from '@/state/terminalSimulationStore';

/**
 * Deterministic preview data for the Phase-4 screens. A later persistence
 * adapter replaces this snapshot through `terminalSimulationStore.replaceSnapshot`.
 */
export function createTerminalDemoSnapshot(): TerminalSimulationSnapshot {
  const terminal: Terminal = {
    id: 'terminal-duisburg-rheinhafen',
    name: 'Intermodalterminal Duisburg-Rheinhafen',
    trackLengthMeters: 180,
    maxCraneCapacityTons: 250,
    storageAreaSqm: 1_000,
    currentStorageUsedSqm: 260,
    hasSpecialCrane: true,
  };

  const cargoTypes: CargoType[] = [
    {
      id: 'cargo-schotter',
      name: 'Gleisschotter',
      category: 'TRACK_BALLAST',
      weightTons: 60,
      requiresSpecialCrane: false,
      isOutOfGauge: false,
      priorityOrderForConstructionSite: 1,
    },
    {
      id: 'cargo-schwellen',
      name: 'Betonschwellen',
      category: 'TRACK_SLEEPERS',
      weightTons: 52,
      requiresSpecialCrane: false,
      isOutOfGauge: false,
      priorityOrderForConstructionSite: 2,
    },
    {
      id: 'cargo-trafogehause',
      name: 'Trafogehäuse',
      category: 'TRANSFORMER_HOUSING',
      weightTons: 120,
      requiresSpecialCrane: true,
      isOutOfGauge: true,
      priorityOrderForConstructionSite: 3,
    },
    {
      id: 'cargo-brueckenteil',
      name: 'Brückensegment',
      category: 'BRIDGE_SECTION',
      weightTons: 180,
      requiresSpecialCrane: true,
      isOutOfGauge: true,
      priorityOrderForConstructionSite: 4,
    },
    {
      id: 'cargo-turbinenteil',
      name: 'Turbinenteil',
      category: 'TURBINE_COMPONENT',
      weightTons: 210,
      requiresSpecialCrane: true,
      isOutOfGauge: true,
      priorityOrderForConstructionSite: 5,
    },
  ];

  const cargoUnits: CargoUnit[] = [
    { id: 'unit-schotter-a', cargoTypeId: 'cargo-schotter', currentTerminalId: terminal.id, storageAreaSqm: 50, status: 'IN_STORAGE' },
    { id: 'unit-schwellen-a', cargoTypeId: 'cargo-schwellen', currentTerminalId: terminal.id, storageAreaSqm: 45, status: 'IN_STORAGE' },
    { id: 'unit-trafo-a', cargoTypeId: 'cargo-trafogehause', currentTerminalId: terminal.id, storageAreaSqm: 65, status: 'IN_STORAGE' },
    { id: 'unit-bruecke-a', cargoTypeId: 'cargo-brueckenteil', currentTerminalId: terminal.id, storageAreaSqm: 100, status: 'IN_STORAGE' },
    { id: 'unit-turbine-a', cargoTypeId: 'cargo-turbinenteil', currentTerminalId: terminal.id, storageAreaSqm: 160, status: 'EXPECTED' },
  ];

  const train: Train = {
    id: 'train-baugleis-47',
    terminalId: terminal.id,
    destinationConstructionSite: 'ABS 9, Bauabschnitt 3',
    totalLengthMeters: 31.9,
    totalWeightTons: 153,
    status: 'ASSEMBLING',
    isOrderValid: true,
  };

  const wagons: Wagon[] = [
    { id: 'wagon-fccs-01', uicWagonType: 'Fccs', maxPayloadTons: 70, lengthOverBuffersMeters: 12, tareWeightTons: 22, currentTerminalId: terminal.id, currentTrainId: train.id, positionInTrain: 1, status: 'ASSEMBLING' },
    { id: 'wagon-res-08', uicWagonType: 'Res', maxPayloadTons: 65, lengthOverBuffersMeters: 19.9, tareWeightTons: 19, currentTerminalId: terminal.id, currentTrainId: train.id, positionInTrain: 2, status: 'ASSEMBLING' },
    { id: 'wagon-uaai-02', uicWagonType: 'Uaai Tieflader', maxPayloadTons: 220, lengthOverBuffersMeters: 24, tareWeightTons: 35, currentTerminalId: terminal.id, currentTrainId: null, positionInTrain: null, status: 'AVAILABLE' },
    { id: 'wagon-res-11', uicWagonType: 'Res', maxPayloadTons: 140, lengthOverBuffersMeters: 20, tareWeightTons: 23, currentTerminalId: terminal.id, currentTrainId: null, positionInTrain: null, status: 'AVAILABLE' },
  ];

  const wagonLoads: WagonLoad[] = [
    { wagonId: 'wagon-fccs-01', cargoUnitId: 'unit-schotter-a', cargoTypeId: 'cargo-schotter' },
    { wagonId: 'wagon-res-08', cargoUnitId: 'unit-schwellen-a', cargoTypeId: 'cargo-schwellen' },
  ];

  const inboundArrivals: InboundArrival[] = [
    {
      id: 'arrival-ms-rheinhafen',
      terminalId: terminal.id,
      mode: 'SHIP',
      label: 'MS Rheinland · Schwergutkai 2',
      cargoUnitIds: ['unit-turbine-a'],
      status: 'BERTHED',
      freeBerthUntilTick: 2,
      laytimeFeeCentsPerTick: 12_500,
    },
  ];

  return {
    currentTick: 0,
    companyBalanceCents: 2_400_000,
    nextEventSequence: 0,
    terminalsById: { [terminal.id]: terminal },
    cargoTypesById: Object.fromEntries(cargoTypes.map((item) => [item.id, item])),
    cargoUnitsById: Object.fromEntries(cargoUnits.map((item) => [item.id, item])),
    wagonsById: Object.fromEntries(wagons.map((item) => [item.id, item])),
    trainsById: { [train.id]: train },
    trainEventsById: {},
    wagonLoads,
    inboundArrivalsById: Object.fromEntries(inboundArrivals.map((item) => [item.id, item])),
    berthChargesById: {},
    dispatchOrdersById: {},
    gameplayEventsById: {},
    gameplayEventEngine: createGameplayEventEngine(17),
    operationalState: createTerminalOperationalState(),
    majorProjectsById: {
      'project-abs9-03': {
        id: 'project-abs9-03',
        trainId: train.id,
        label: 'ABS 9 · Bauabschnitt 3',
        rewardCents: 8_500_000,
        reputationReward: 28,
        deliveryDurationTicks: 6,
        status: 'PLANNED',
        dispatchedTick: null,
        deliveryDueTick: null,
        completedTick: null,
      },
    },
    gameProgress: createTerminalGameProgress({
      reputationPoints: 24,
      reputationTarget: 100,
      completedMajorProjects: 0,
      requiredMajorProjects: 3,
    }),
    eventLog: [],
  };
}
