import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

import {
  checkTrainFeasibility,
  trainDerivedFields,
  type TrainFeasibilityResult,
  type ValidationCode,
} from '@/lib/terminalLogistics';
import type {
  CargoType,
  CargoTypeId,
  CargoUnit,
  CargoUnitId,
  Terminal,
  TerminalId,
  Train,
  TrainEvent,
  TrainEventId,
  TrainEventStatus,
  TrainId,
  Wagon,
  WagonId,
  WagonLoad,
} from '@/lib/terminalEntities';

/** Every terminal tick represents one simulated hour — never a real-time interval. */
export const HOURS_PER_TERMINAL_TICK = 1;
export const TICKS_PER_TERMINAL_DAY = 24;
export const MAX_SIMULATION_EVENT_LOG_ENTRIES = 500;

/**
 * `BERTHED` arrivals occupy a berth and can incur laytime charges. A ship or
 * aircraft changes to `UNLOADED` only through a later inbound operation.
 */
export type InboundArrivalStatus = 'SCHEDULED' | 'BERTHED' | 'UNLOADED' | 'CANCELLED';

/**
 * A ship or freight aircraft waiting for handling at the terminal.
 *
 * Relationally this will become `inbound_arrivals` with a foreign key to
 * `terminals.id`. Cargo IDs reference `cargo_units.id`; cargo units remain the
 * authoritative source for storage and wagon loading.
 */
export interface InboundArrival {
  id: string;
  terminalId: TerminalId;
  mode: 'SHIP' | 'FREIGHT_AIRCRAFT';
  label: string;
  cargoUnitIds: CargoUnitId[];
  status: InboundArrivalStatus;
  /** The first tick after which the terminal invoices laytime, inclusive. */
  freeBerthUntilTick: number;
  /** Charge in euro cents for each occupied tick after free time. */
  laytimeFeeCentsPerTick: number;
}

/** Immutable, auditable booking emitted at most once per arrival and game tick. */
export interface BerthCharge {
  id: string;
  arrivalId: string;
  terminalId: TerminalId;
  tick: number;
  amountCents: number;
  description: string;
}

/** A departure is evaluated only when the player deliberately advances to its tick. */
export type TrainDispatchOrderStatus = 'SCHEDULED' | 'BLOCKED' | 'DISPATCHED' | 'CANCELLED';

export interface TrainDispatchOrder {
  id: string;
  trainId: TrainId;
  departureTick: number;
  status: TrainDispatchOrderStatus;
  lastAttemptTick: number | null;
}

export type TerminalSimulationEventType =
  | 'TICK_ADVANCED'
  | 'BERTH_FEE_BOOKED'
  | 'LUE_APPROVAL_REQUIRED'
  | 'TRAIN_DISPATCH_BLOCKED'
  | 'TRAIN_DISPATCHED';

export interface TerminalSimulationEvent {
  id: string;
  tick: number;
  type: TerminalSimulationEventType;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';
  message: string;
  entityId?: string;
  amountCents?: number;
  blockerCodes?: ValidationCode[];
}

export interface DispatchAttemptResult {
  trainId: TrainId;
  dispatched: boolean;
  feasibility: TrainFeasibilityResult | null;
  /** A lifecycle problem outside the Phase-2 feasibility calculation. */
  reason?: 'TRAIN_NOT_FOUND' | 'TERMINAL_NOT_FOUND' | 'TRAIN_NOT_IN_INSPECTION';
}

export interface AdvanceTickResult {
  previousTick: number;
  currentTick: number;
  berthCharges: BerthCharge[];
  dispatchAttempts: DispatchAttemptResult[];
  emittedEvents: TerminalSimulationEvent[];
}

export interface AdvanceDayResult {
  previousTick: number;
  currentTick: number;
  tickResults: AdvanceTickResult[];
}

/**
 * Serializable part of the terminal state. It deliberately contains no timer.
 * Time advances exclusively through `advanceTick()` or `advanceDay()`.
 */
export interface TerminalSimulationSnapshot {
  currentTick: number;
  /** The terminal's cash account in cents. A berth charge reduces this value. */
  companyBalanceCents: number;
  nextEventSequence: number;

  terminalsById: Record<TerminalId, Terminal>;
  cargoTypesById: Record<CargoTypeId, CargoType>;
  cargoUnitsById: Record<CargoUnitId, CargoUnit>;
  wagonsById: Record<WagonId, Wagon>;
  trainsById: Record<TrainId, Train>;
  trainEventsById: Record<TrainEventId, TrainEvent>;
  wagonLoads: WagonLoad[];

  inboundArrivalsById: Record<string, InboundArrival>;
  berthChargesById: Record<string, BerthCharge>;
  dispatchOrdersById: Record<string, TrainDispatchOrder>;
  eventLog: TerminalSimulationEvent[];
}

export interface ScheduleTrainDepartureResult {
  scheduled: boolean;
  order?: TrainDispatchOrder;
  reason?: 'TRAIN_NOT_FOUND' | 'INVALID_DEPARTURE_TICK' | 'ACTIVE_ORDER_ALREADY_EXISTS';
}

/** Ergebnis einer UI-gesteuerten Zugbildungsaktion. */
export interface FormationMutationResult {
  changed: boolean;
  reason?:
    | 'TRAIN_NOT_FOUND'
    | 'WAGON_NOT_FOUND'
    | 'CARGO_UNIT_NOT_FOUND'
    | 'CARGO_TYPE_NOT_FOUND'
    | 'TRAIN_NOT_ASSEMBLING'
    | 'TERMINAL_MISMATCH'
    | 'WAGON_UNAVAILABLE'
    | 'WAGON_ALREADY_ASSIGNED'
    | 'WAGON_NOT_ASSIGNED'
    | 'CARGO_NOT_IN_STORAGE'
    | 'CARGO_ALREADY_ASSIGNED'
    | 'WAGON_NOT_IN_TRAIN'
    | 'PAYLOAD_EXCEEDED';
}

export interface TerminalSimulationActions {
  /** Replaces the persisted snapshot after a server-side reload. */
  replaceSnapshot: (snapshot: TerminalSimulationSnapshot) => void;
  /** Schedules one deliberate future tick for a train already in inspection. */
  scheduleTrainDeparture: (trainId: TrainId, departureTick: number) => ScheduleTrainDepartureResult;
  /** Resolves an LÜ approval; only a later explicit tick can trigger a departure. */
  resolveTrainEvent: (eventId: TrainEventId, status: Exclude<TrainEventStatus, 'OPEN'>) => boolean;
  /** Updates the physical handling state of an inbound arrival. */
  setInboundArrivalStatus: (arrivalId: string, status: InboundArrivalStatus) => boolean;
  /** Fügt einen verfügbaren Wagen als nächste Baustellenposition an einen Zug an. */
  assignWagonToTrain: (wagonId: WagonId, trainId: TrainId) => FormationMutationResult;
  /** Entfernt einen Wagen und seine temporären Ladungszuweisungen aus einem Zug in Bildung. */
  removeWagonFromTrain: (wagonId: WagonId, trainId: TrainId) => FormationMutationResult;
  /** Ordnet eine eingelagerte Frachtpartie dem selektierten Zugwagen zu. */
  assignCargoToWagon: (cargoUnitId: CargoUnitId, wagonId: WagonId) => FormationMutationResult;
  /** Hebt eine noch nicht abgefahrene Frachtzuweisung wieder auf. */
  removeCargoFromWagon: (cargoUnitId: CargoUnitId, wagonId: WagonId) => FormationMutationResult;
  /** Advances exactly one simulated hour. It never starts an automatic timer. */
  advanceTick: () => AdvanceTickResult;
  /** Advances exactly 24 simulated hours by repeatedly calling the same pure tick logic. */
  advanceDay: () => AdvanceDayResult;
  /** Checks and dispatches a train in the current tick without creating a real-time loop. */
  tryDispatchTrainNow: (trainId: TrainId) => DispatchAttemptResult;
}

export type TerminalSimulationState = TerminalSimulationSnapshot & TerminalSimulationActions;
export type TerminalSimulationStore = StoreApi<TerminalSimulationState>;

type SimulationEventDraft = Omit<TerminalSimulationEvent, 'id'>;

interface DispatchTransition {
  snapshot: TerminalSimulationSnapshot;
  attempt: DispatchAttemptResult;
  drafts: SimulationEventDraft[];
}

interface TickTransition {
  snapshot: TerminalSimulationSnapshot;
  result: AdvanceTickResult;
}

const EMPTY_SNAPSHOT: TerminalSimulationSnapshot = {
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
  eventLog: [],
};

function asNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function normaliseSnapshot(snapshot: TerminalSimulationSnapshot): TerminalSimulationSnapshot {
  return {
    ...snapshot,
    currentTick: Math.max(0, Math.floor(snapshot.currentTick)),
    nextEventSequence: Math.max(0, Math.floor(snapshot.nextEventSequence)),
    terminalsById: { ...snapshot.terminalsById },
    cargoTypesById: { ...snapshot.cargoTypesById },
    cargoUnitsById: { ...snapshot.cargoUnitsById },
    wagonsById: { ...snapshot.wagonsById },
    trainsById: { ...snapshot.trainsById },
    trainEventsById: { ...snapshot.trainEventsById },
    wagonLoads: [...snapshot.wagonLoads],
    inboundArrivalsById: { ...snapshot.inboundArrivalsById },
    berthChargesById: { ...snapshot.berthChargesById },
    dispatchOrdersById: { ...snapshot.dispatchOrdersById },
    eventLog: snapshot.eventLog.slice(-MAX_SIMULATION_EVENT_LOG_ENTRIES),
  };
}

function createInitialSnapshot(initial?: Partial<TerminalSimulationSnapshot>): TerminalSimulationSnapshot {
  return normaliseSnapshot({
    ...EMPTY_SNAPSHOT,
    ...initial,
    terminalsById: initial?.terminalsById ?? {},
    cargoTypesById: initial?.cargoTypesById ?? {},
    cargoUnitsById: initial?.cargoUnitsById ?? {},
    wagonsById: initial?.wagonsById ?? {},
    trainsById: initial?.trainsById ?? {},
    trainEventsById: initial?.trainEventsById ?? {},
    wagonLoads: initial?.wagonLoads ?? [],
    inboundArrivalsById: initial?.inboundArrivalsById ?? {},
    berthChargesById: initial?.berthChargesById ?? {},
    dispatchOrdersById: initial?.dispatchOrdersById ?? {},
    eventLog: initial?.eventLog ?? [],
  });
}

function hydrateTrainMetrics(snapshot: TerminalSimulationSnapshot, trainId: TrainId): TerminalSimulationSnapshot {
  const train = snapshot.trainsById[trainId];
  if (!train) return snapshot;
  const feasibility = getFeasibility(snapshot, train);
  if (!feasibility) return snapshot;
  return {
    ...snapshot,
    trainsById: {
      ...snapshot.trainsById,
      [trainId]: { ...train, ...trainDerivedFields(feasibility) },
    },
  };
}

function simulationTimestamp(tick: number): string {
  // Fixed simulation epoch; does not read the system clock and is fully reproducible.
  const simulationEpochUtc = Date.UTC(2026, 0, 1, 0, 0, 0);
  return new Date(simulationEpochUtc + tick * HOURS_PER_TERMINAL_TICK * 60 * 60 * 1000).toISOString();
}

function appendEventDrafts(
  snapshot: TerminalSimulationSnapshot,
  drafts: SimulationEventDraft[],
): { snapshot: TerminalSimulationSnapshot; emittedEvents: TerminalSimulationEvent[] } {
  let nextEventSequence = snapshot.nextEventSequence;
  const emittedEvents = drafts.map((draft) => {
    nextEventSequence += 1;
    return {
      ...draft,
      id: `terminal-event-${draft.tick}-${nextEventSequence}`,
    };
  });

  return {
    snapshot: {
      ...snapshot,
      nextEventSequence,
      eventLog: [...snapshot.eventLog, ...emittedEvents].slice(-MAX_SIMULATION_EVENT_LOG_ENTRIES),
    },
    emittedEvents,
  };
}

function getFeasibility(snapshot: TerminalSimulationSnapshot, train: Train): TrainFeasibilityResult | null {
  const terminal = snapshot.terminalsById[train.terminalId];
  if (!terminal) return null;

  const wagons = Object.values(snapshot.wagonsById)
    .filter((wagon) => wagon.currentTrainId === train.id);
  const wagonIds = new Set(wagons.map((wagon) => wagon.id));

  return checkTrainFeasibility({
    terminal,
    train,
    wagons,
    cargoTypes: Object.values(snapshot.cargoTypesById),
    cargoUnits: Object.values(snapshot.cargoUnitsById),
    wagonLoads: snapshot.wagonLoads.filter((load) => wagonIds.has(load.wagonId)),
    trainEvents: Object.values(snapshot.trainEventsById).filter((event) => event.trainId === train.id),
  });
}

function materializeRequiredEvents(
  snapshot: TerminalSimulationSnapshot,
  trainId: TrainId,
  feasibility: TrainFeasibilityResult,
  tick: number,
): { trainEventsById: Record<TrainEventId, TrainEvent>; drafts: SimulationEventDraft[] } {
  if (feasibility.requiredEvents.length === 0) {
    return { trainEventsById: snapshot.trainEventsById, drafts: [] };
  }

  const trainEventsById = { ...snapshot.trainEventsById };
  const drafts: SimulationEventDraft[] = [];
  for (const requiredEvent of feasibility.requiredEvents) {
    const id = `train-event-${trainId}-${requiredEvent.type.toLowerCase()}`;
    if (trainEventsById[id]) continue;

    trainEventsById[id] = {
      id,
      trainId,
      type: requiredEvent.type,
      status: requiredEvent.status,
      createdAt: simulationTimestamp(tick),
      resolvedAt: null,
    };
    drafts.push({
      tick,
      type: 'LUE_APPROVAL_REQUIRED',
      severity: 'WARNING',
      entityId: trainId,
      message: `Zug ${trainId} enthält LÜ-Fracht und benötigt eine Genehmigung.`,
    });
  }

  return { trainEventsById, drafts };
}

/**
 * Dispatches only after the exact Phase-2 validation has passed. The helper is
 * pure; no timer, browser API, database access or Zustand API is used here.
 */
function evaluateTrainDispatch(
  snapshot: TerminalSimulationSnapshot,
  trainId: TrainId,
  tick: number,
): DispatchTransition {
  const train = snapshot.trainsById[trainId];
  if (!train) {
    return {
      snapshot,
      attempt: { trainId, dispatched: false, feasibility: null, reason: 'TRAIN_NOT_FOUND' },
      drafts: [{
        tick,
        type: 'TRAIN_DISPATCH_BLOCKED',
        severity: 'ERROR',
        entityId: trainId,
        message: `Zug ${trainId} kann nicht abfahren, weil er nicht existiert.`,
      }],
    };
  }

  const feasibility = getFeasibility(snapshot, train);
  if (!feasibility) {
    return {
      snapshot,
      attempt: { trainId, dispatched: false, feasibility: null, reason: 'TERMINAL_NOT_FOUND' },
      drafts: [{
        tick,
        type: 'TRAIN_DISPATCH_BLOCKED',
        severity: 'ERROR',
        entityId: trainId,
        message: `Zug ${trainId} kann nicht abfahren, weil sein Abfahrtsterminal fehlt.`,
      }],
    };
  }

  const derivedTrain: Train = { ...train, ...trainDerivedFields(feasibility) };
  const eventMaterialization = materializeRequiredEvents(snapshot, trainId, feasibility, tick);
  let nextSnapshot: TerminalSimulationSnapshot = {
    ...snapshot,
    trainsById: { ...snapshot.trainsById, [trainId]: derivedTrain },
    trainEventsById: eventMaterialization.trainEventsById,
  };

  if (train.status !== 'IN_INSPECTION') {
    return {
      snapshot: nextSnapshot,
      attempt: {
        trainId,
        dispatched: false,
        feasibility,
        reason: 'TRAIN_NOT_IN_INSPECTION',
      },
      drafts: [
        ...eventMaterialization.drafts,
        {
          tick,
          type: 'TRAIN_DISPATCH_BLOCKED',
          severity: 'ERROR',
          entityId: trainId,
          message: `Zug ${trainId} muss vor der Abfahrt in der Inspektion stehen.`,
          blockerCodes: feasibility.issues.map((issue) => issue.code),
        },
      ],
    };
  }

  if (!feasibility.canDispatch) {
    return {
      snapshot: nextSnapshot,
      attempt: { trainId, dispatched: false, feasibility },
      drafts: [
        ...eventMaterialization.drafts,
        {
          tick,
          type: 'TRAIN_DISPATCH_BLOCKED',
          severity: 'ERROR',
          entityId: trainId,
          message: `Zug ${trainId} erfüllt die Abfahrtsprüfung nicht.`,
          blockerCodes: feasibility.issues.map((issue) => issue.code),
        },
      ],
    };
  }

  const assignedWagonIds = new Set(
    Object.values(nextSnapshot.wagonsById)
      .filter((wagon) => wagon.currentTrainId === trainId)
      .map((wagon) => wagon.id),
  );
  const loadedCargoUnitIds = new Set(
    nextSnapshot.wagonLoads
      .filter((load) => assignedWagonIds.has(load.wagonId))
      .map((load) => load.cargoUnitId),
  );
  const wagonsById = { ...nextSnapshot.wagonsById };
  for (const wagonId of assignedWagonIds) {
    const wagon = wagonsById[wagonId];
    if (wagon) wagonsById[wagonId] = { ...wagon, status: 'IN_TRANSIT' };
  }
  const cargoUnitsById = { ...nextSnapshot.cargoUnitsById };
  let releasedStorageSqm = 0;
  for (const cargoUnitId of loadedCargoUnitIds) {
    const cargoUnit = cargoUnitsById[cargoUnitId];
    if (!cargoUnit) continue;
    releasedStorageSqm += cargoUnit.storageAreaSqm;
    cargoUnitsById[cargoUnitId] = { ...cargoUnit, status: 'LOADED' };
  }
  const dispatchTerminal = nextSnapshot.terminalsById[train.terminalId];
  const terminalsById = dispatchTerminal
    ? {
      ...nextSnapshot.terminalsById,
      [dispatchTerminal.id]: {
        ...dispatchTerminal,
        currentStorageUsedSqm: Math.max(0, dispatchTerminal.currentStorageUsedSqm - releasedStorageSqm),
      },
    }
    : nextSnapshot.terminalsById;

  nextSnapshot = {
    ...nextSnapshot,
    terminalsById,
    trainsById: {
      ...nextSnapshot.trainsById,
      [trainId]: { ...derivedTrain, status: 'DISPATCHED' },
    },
    wagonsById,
    cargoUnitsById,
  };

  return {
    snapshot: nextSnapshot,
    attempt: { trainId, dispatched: true, feasibility },
    drafts: [
      ...eventMaterialization.drafts,
      {
        tick,
        type: 'TRAIN_DISPATCHED',
        severity: 'SUCCESS',
        entityId: trainId,
        message: `Zug ${trainId} ist nach erfolgreicher Abfahrtsprüfung abgefahren.`,
      },
    ],
  };
}

/**
 * Pure simulation reducer for exactly one manual calendar tick.
 *
 * A blocked departure stays blocked rather than being retried automatically.
 * The player must resolve the cause and schedule a new departure consciously.
 */
export function advanceTerminalTick(snapshot: TerminalSimulationSnapshot): TickTransition {
  const previousTick = snapshot.currentTick;
  const currentTick = previousTick + 1;
  const berthCharges: BerthCharge[] = [];
  const drafts: SimulationEventDraft[] = [];
  let workingSnapshot: TerminalSimulationSnapshot = {
    ...snapshot,
    currentTick,
    berthChargesById: { ...snapshot.berthChargesById },
  };

  for (const arrival of Object.values(snapshot.inboundArrivalsById)) {
    if (arrival.status !== 'BERTHED' || currentTick <= arrival.freeBerthUntilTick) continue;
    if (!Number.isFinite(arrival.laytimeFeeCentsPerTick) || arrival.laytimeFeeCentsPerTick <= 0) continue;

    const id = `berth-charge-${arrival.id}-${currentTick}`;
    if (workingSnapshot.berthChargesById[id]) continue;

    const charge: BerthCharge = {
      id,
      arrivalId: arrival.id,
      terminalId: arrival.terminalId,
      tick: currentTick,
      amountCents: Math.round(arrival.laytimeFeeCentsPerTick),
      description: `Liegegebühr: ${arrival.label} für Simulationsstunde ${currentTick}.`,
    };
    workingSnapshot.berthChargesById[id] = charge;
    berthCharges.push(charge);
    drafts.push({
      tick: currentTick,
      type: 'BERTH_FEE_BOOKED',
      severity: 'WARNING',
      entityId: arrival.id,
      amountCents: charge.amountCents,
      message: `${charge.description} Belastung: ${charge.amountCents} Cent.`,
    });
  }

  const totalBerthFeesCents = berthCharges.reduce((sum, charge) => sum + charge.amountCents, 0);
  if (totalBerthFeesCents > 0) {
    workingSnapshot = {
      ...workingSnapshot,
      companyBalanceCents: workingSnapshot.companyBalanceCents - totalBerthFeesCents,
    };
  }

  const dueOrders = Object.values(workingSnapshot.dispatchOrdersById)
    .filter((order) => order.status === 'SCHEDULED' && order.departureTick <= currentTick)
    .sort((left, right) => left.departureTick - right.departureTick || left.id.localeCompare(right.id));
  const dispatchAttempts: DispatchAttemptResult[] = [];

  for (const order of dueOrders) {
    const transition = evaluateTrainDispatch(workingSnapshot, order.trainId, currentTick);
    workingSnapshot = {
      ...transition.snapshot,
      dispatchOrdersById: {
        ...transition.snapshot.dispatchOrdersById,
        [order.id]: {
          ...order,
          status: transition.attempt.dispatched ? 'DISPATCHED' : 'BLOCKED',
          lastAttemptTick: currentTick,
        },
      },
    };
    dispatchAttempts.push(transition.attempt);
    drafts.push(...transition.drafts);
  }

  drafts.push({
    tick: currentTick,
    type: 'TICK_ADVANCED',
    severity: 'INFO',
    message: `Simulationskalender auf Stunde ${currentTick} fortgeschrieben.`,
  });

  const withEvents = appendEventDrafts(workingSnapshot, drafts);
  return {
    snapshot: withEvents.snapshot,
    result: {
      previousTick,
      currentTick,
      berthCharges,
      dispatchAttempts,
      emittedEvents: withEvents.emittedEvents,
    },
  };
}

/**
 * Creates an isolated Zustand store. Tests create a fresh instance per test;
 * React components consume the singleton exported at the bottom of this file.
 */
export function createTerminalSimulationStore(
  initialSnapshot?: Partial<TerminalSimulationSnapshot>,
): TerminalSimulationStore {
  const initial = createInitialSnapshot(initialSnapshot);

  return createStore<TerminalSimulationState>()((set, get) => ({
    ...initial,

    replaceSnapshot: (snapshot) => set(() => normaliseSnapshot(snapshot)),

    scheduleTrainDeparture: (trainId, departureTick) => {
      let result: ScheduleTrainDepartureResult = { scheduled: false, reason: 'TRAIN_NOT_FOUND' };
      set((state) => {
        if (!state.trainsById[trainId]) return state;
        if (!asNonNegativeInteger(departureTick) || departureTick <= state.currentTick) {
          result = { scheduled: false, reason: 'INVALID_DEPARTURE_TICK' };
          return state;
        }
        const activeOrder = Object.values(state.dispatchOrdersById).find(
          (order) => order.trainId === trainId && order.status === 'SCHEDULED',
        );
        if (activeOrder) {
          result = { scheduled: false, reason: 'ACTIVE_ORDER_ALREADY_EXISTS' };
          return state;
        }

        const order: TrainDispatchOrder = {
          id: `dispatch-order-${trainId}-${departureTick}`,
          trainId,
          departureTick,
          status: 'SCHEDULED',
          lastAttemptTick: null,
        };
        result = { scheduled: true, order };
        return {
          dispatchOrdersById: {
            ...state.dispatchOrdersById,
            [order.id]: order,
          },
        };
      });
      return result;
    },

    resolveTrainEvent: (eventId, status) => {
      let updated = false;
      set((state) => {
        const event = state.trainEventsById[eventId];
        if (!event || event.status !== 'OPEN') return state;
        updated = true;
        return {
          trainEventsById: {
            ...state.trainEventsById,
            [eventId]: {
              ...event,
              status,
              resolvedAt: simulationTimestamp(state.currentTick),
            },
          },
        };
      });
      return updated;
    },

    setInboundArrivalStatus: (arrivalId, status) => {
      let updated = false;
      set((state) => {
        const arrival = state.inboundArrivalsById[arrivalId];
        if (!arrival) return state;
        updated = true;
        return {
          inboundArrivalsById: {
            ...state.inboundArrivalsById,
            [arrivalId]: { ...arrival, status },
          },
        };
      });
      return updated;
    },

    assignWagonToTrain: (wagonId, trainId) => {
      let result: FormationMutationResult = { changed: false, reason: 'WAGON_NOT_FOUND' };
      set((state) => {
        const wagon = state.wagonsById[wagonId];
        const train = state.trainsById[trainId];
        if (!wagon) return state;
        if (!train) {
          result = { changed: false, reason: 'TRAIN_NOT_FOUND' };
          return state;
        }
        if (train.status !== 'ASSEMBLING') {
          result = { changed: false, reason: 'TRAIN_NOT_ASSEMBLING' };
          return state;
        }
        if (wagon.currentTerminalId !== train.terminalId) {
          result = { changed: false, reason: 'TERMINAL_MISMATCH' };
          return state;
        }
        if (wagon.currentTrainId && wagon.currentTrainId !== trainId) {
          result = { changed: false, reason: 'WAGON_ALREADY_ASSIGNED' };
          return state;
        }
        if (wagon.status === 'IN_TRANSIT' || wagon.status === 'MAINTENANCE' || wagon.status === 'INSPECTION_DUE') {
          result = { changed: false, reason: 'WAGON_UNAVAILABLE' };
          return state;
        }
        if (wagon.currentTrainId === trainId) {
          result = { changed: false, reason: 'WAGON_ALREADY_ASSIGNED' };
          return state;
        }
        const highestPosition = Math.max(
          0,
          ...Object.values(state.wagonsById)
            .filter((candidate) => candidate.currentTrainId === trainId)
            .map((candidate) => candidate.positionInTrain ?? 0),
        );
        result = { changed: true };
        return hydrateTrainMetrics({
          ...snapshotFromState(state),
          wagonsById: {
            ...state.wagonsById,
            [wagonId]: {
              ...wagon,
              currentTrainId: trainId,
              positionInTrain: highestPosition + 1,
              status: 'ASSEMBLING',
            },
          },
        }, trainId);
      });
      return result;
    },

    removeWagonFromTrain: (wagonId, trainId) => {
      let result: FormationMutationResult = { changed: false, reason: 'WAGON_NOT_FOUND' };
      set((state) => {
        const wagon = state.wagonsById[wagonId];
        const train = state.trainsById[trainId];
        if (!wagon) return state;
        if (!train) {
          result = { changed: false, reason: 'TRAIN_NOT_FOUND' };
          return state;
        }
        if (train.status !== 'ASSEMBLING') {
          result = { changed: false, reason: 'TRAIN_NOT_ASSEMBLING' };
          return state;
        }
        if (wagon.currentTrainId !== trainId) {
          result = { changed: false, reason: 'WAGON_NOT_ASSIGNED' };
          return state;
        }

        const remainingWagons = Object.values(state.wagonsById)
          .filter((candidate) => candidate.currentTrainId === trainId && candidate.id !== wagonId)
          .sort((left, right) => (left.positionInTrain ?? 0) - (right.positionInTrain ?? 0));
        const wagonsById = { ...state.wagonsById };
        wagonsById[wagonId] = {
          ...wagon,
          currentTrainId: null,
          positionInTrain: null,
          status: 'AVAILABLE',
        };
        remainingWagons.forEach((candidate, index) => {
          wagonsById[candidate.id] = { ...candidate, positionInTrain: index + 1 };
        });
        result = { changed: true };
        return hydrateTrainMetrics({
          ...snapshotFromState(state),
          wagonsById,
          wagonLoads: state.wagonLoads.filter((load) => load.wagonId !== wagonId),
        }, trainId);
      });
      return result;
    },

    assignCargoToWagon: (cargoUnitId, wagonId) => {
      let result: FormationMutationResult = { changed: false, reason: 'CARGO_UNIT_NOT_FOUND' };
      set((state) => {
        const cargoUnit = state.cargoUnitsById[cargoUnitId];
        const wagon = state.wagonsById[wagonId];
        if (!cargoUnit) return state;
        if (!wagon) {
          result = { changed: false, reason: 'WAGON_NOT_FOUND' };
          return state;
        }
        if (!wagon.currentTrainId) {
          result = { changed: false, reason: 'WAGON_NOT_IN_TRAIN' };
          return state;
        }
        const train = state.trainsById[wagon.currentTrainId];
        const cargoType = state.cargoTypesById[cargoUnit.cargoTypeId];
        if (!train) {
          result = { changed: false, reason: 'TRAIN_NOT_FOUND' };
          return state;
        }
        if (!cargoType) {
          result = { changed: false, reason: 'CARGO_TYPE_NOT_FOUND' };
          return state;
        }
        if (train.status !== 'ASSEMBLING') {
          result = { changed: false, reason: 'TRAIN_NOT_ASSEMBLING' };
          return state;
        }
        if (cargoUnit.status !== 'IN_STORAGE') {
          result = { changed: false, reason: 'CARGO_NOT_IN_STORAGE' };
          return state;
        }
        if (cargoUnit.currentTerminalId !== train.terminalId || wagon.currentTerminalId !== train.terminalId) {
          result = { changed: false, reason: 'TERMINAL_MISMATCH' };
          return state;
        }
        if (state.wagonLoads.some((load) => load.cargoUnitId === cargoUnitId)) {
          result = { changed: false, reason: 'CARGO_ALREADY_ASSIGNED' };
          return state;
        }
        const existingWeight = state.wagonLoads
          .filter((load) => load.wagonId === wagonId)
          .reduce((sum, load) => sum + (state.cargoTypesById[load.cargoTypeId]?.weightTons ?? 0), 0);
        if (existingWeight + cargoType.weightTons > wagon.maxPayloadTons) {
          result = { changed: false, reason: 'PAYLOAD_EXCEEDED' };
          return state;
        }

        result = { changed: true };
        return hydrateTrainMetrics({
          ...snapshotFromState(state),
          wagonLoads: [...state.wagonLoads, { wagonId, cargoUnitId, cargoTypeId: cargoType.id }],
        }, train.id);
      });
      return result;
    },

    removeCargoFromWagon: (cargoUnitId, wagonId) => {
      let result: FormationMutationResult = { changed: false, reason: 'WAGON_NOT_FOUND' };
      set((state) => {
        const wagon = state.wagonsById[wagonId];
        if (!wagon) return state;
        if (!wagon.currentTrainId) {
          result = { changed: false, reason: 'WAGON_NOT_IN_TRAIN' };
          return state;
        }
        const train = state.trainsById[wagon.currentTrainId];
        if (!train) {
          result = { changed: false, reason: 'TRAIN_NOT_FOUND' };
          return state;
        }
        if (train.status !== 'ASSEMBLING') {
          result = { changed: false, reason: 'TRAIN_NOT_ASSEMBLING' };
          return state;
        }
        const containsLoad = state.wagonLoads.some(
          (load) => load.wagonId === wagonId && load.cargoUnitId === cargoUnitId,
        );
        if (!containsLoad) {
          result = { changed: false, reason: 'CARGO_ALREADY_ASSIGNED' };
          return state;
        }
        result = { changed: true };
        return hydrateTrainMetrics({
          ...snapshotFromState(state),
          wagonLoads: state.wagonLoads.filter(
            (load) => !(load.wagonId === wagonId && load.cargoUnitId === cargoUnitId),
          ),
        }, train.id);
      });
      return result;
    },

    advanceTick: () => {
      let result: AdvanceTickResult | null = null;
      set((state) => {
        const transition = advanceTerminalTick(snapshotFromState(state));
        result = transition.result;
        return transition.snapshot;
      });
      if (!result) throw new Error('Terminal-Tick konnte nicht ausgeführt werden.');
      return result;
    },

    advanceDay: () => {
      let result: AdvanceDayResult | null = null;
      set((state) => {
        const previousTick = state.currentTick;
        let snapshot = snapshotFromState(state);
        const tickResults: AdvanceTickResult[] = [];
        for (let index = 0; index < TICKS_PER_TERMINAL_DAY; index += 1) {
          const transition = advanceTerminalTick(snapshot);
          snapshot = transition.snapshot;
          tickResults.push(transition.result);
        }
        result = {
          previousTick,
          currentTick: snapshot.currentTick,
          tickResults,
        };
        return snapshot;
      });
      if (!result) throw new Error('Terminal-Tag konnte nicht ausgeführt werden.');
      return result;
    },

    tryDispatchTrainNow: (trainId) => {
      let result: DispatchAttemptResult | null = null;
      set((state) => {
        const transition = evaluateTrainDispatch(snapshotFromState(state), trainId, state.currentTick);
        const withEvents = appendEventDrafts(transition.snapshot, transition.drafts);
        result = transition.attempt;
        return withEvents.snapshot;
      });
      if (!result) throw new Error('Zugabfahrt konnte nicht geprüft werden.');
      return result;
    },
  }));
}

/** Extracts serializable data without exposing action functions to pure reducers. */
function snapshotFromState(state: TerminalSimulationState): TerminalSimulationSnapshot {
  return {
    currentTick: state.currentTick,
    companyBalanceCents: state.companyBalanceCents,
    nextEventSequence: state.nextEventSequence,
    terminalsById: state.terminalsById,
    cargoTypesById: state.cargoTypesById,
    cargoUnitsById: state.cargoUnitsById,
    wagonsById: state.wagonsById,
    trainsById: state.trainsById,
    trainEventsById: state.trainEventsById,
    wagonLoads: state.wagonLoads,
    inboundArrivalsById: state.inboundArrivalsById,
    berthChargesById: state.berthChargesById,
    dispatchOrdersById: state.dispatchOrdersById,
    eventLog: state.eventLog,
  };
}

/** Application singleton. No interval is attached; UI actions explicitly advance time. */
export const terminalSimulationStore = createTerminalSimulationStore();

/** Convenience hook for future React views; use selectors to minimize re-renders. */
export function useTerminalSimulation<T>(selector: (state: TerminalSimulationState) => T): T {
  return useStore(terminalSimulationStore, selector);
}
