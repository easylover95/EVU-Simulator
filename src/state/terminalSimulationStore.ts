import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

import {
  checkTrainFeasibility,
  trainDerivedFields,
  type TrainFeasibilityResult,
  type ValidationCode,
} from '@/lib/terminalLogistics';
import { createScenarioSnapshot } from '@/lib/terminalScenarios';
import {
  clearTerminalSnapshot,
  loadTerminalSnapshot,
  saveTerminalSnapshot,
  type TerminalPersistenceMeta,
} from '@/lib/terminalPersistence';
import {
  CAMPAIGN_SCENARIOS,
  TERMINAL_UPGRADE_CATALOG,
  calculateTerminalStaffEffects,
  completedUpgradeIds,
  getSpecialistDefinition,
  getUpgradeDefinition,
  type CampaignScenarioId,
  type Specialist,
  type SpecialistRole,
  type TerminalUpgrade,
} from '@/lib/terminalTycoon';
import {
  createGameplayEventEngine,
  createTerminalGameProgress,
  createTerminalOperationalState,
  evaluateTerminalGameProgress,
  isConstructionSiteClosed,
  resolveGameplayEvent as resolveGameplayEventEffect,
  rollGameplayEvent,
  type GameplayEvent,
  type GameplayEventChoiceId,
  type GameplayEventEngine,
  type MajorProject,
  type TerminalGameProgress,
  type TerminalOperationalState,
} from '@/lib/terminalGameplay';
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
  /** Fällige Simulationsstunde für eine geplante Ankunft; nur für `SCHEDULED` gesetzt. */
  expectedArrivalTick?: number | null;
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
  | 'TRAIN_DISPATCHED'
  | 'INBOUND_ARRIVED'
  | 'GAMEPLAY_EVENT_OFFERED'
  | 'GAMEPLAY_EVENT_RESOLVED'
  | 'CONSTRUCTION_SITE_BLOCKED'
  | 'MAJOR_PROJECT_COMPLETED'
  | 'LIQUIDITY_WARNING'
  | 'GAME_WON'
  | 'TERMINAL_INSOLVENT'
  | 'UPGRADE_STARTED'
  | 'UPGRADE_COMPLETED'
  | 'SPECIALIST_HIRED'
  | 'STAFF_COST_BOOKED'
  | 'SAVE_COMPLETED'
  | 'SAVE_FAILED'
  | 'SCENARIO_STARTED';

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

/** Buchung der Unterhaltskosten für beschäftigte Spezialisten. */
export interface StaffCharge {
  id: string;
  tick: number;
  amountCents: number;
  specialistIds: string[];
  description: string;
}

export interface DispatchAttemptResult {
  trainId: TrainId;
  dispatched: boolean;
  feasibility: TrainFeasibilityResult | null;
  /** A lifecycle problem outside the Phase-2 feasibility calculation. */
  reason?: 'TRAIN_NOT_FOUND' | 'TERMINAL_NOT_FOUND' | 'TRAIN_NOT_IN_INSPECTION' | 'GAME_NOT_ACTIVE' | 'LUE_SPECIALIST_REQUIRED';
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

  /** Persisted Phase-5 gameplay loop: offers, effects, projects and win/loss state. */
  gameplayEventsById: Record<string, GameplayEvent>;
  gameplayEventEngine: GameplayEventEngine;
  operationalState: TerminalOperationalState;
  majorProjectsById: Record<string, MajorProject>;
  gameProgress: TerminalGameProgress;

  /** Tycoon progression, all serializable for local save games. */
  activeScenarioId: CampaignScenarioId | null;
  terminalUpgradesById: Record<string, TerminalUpgrade>;
  specialistsById: Record<string, Specialist>;
  staffChargesById: Record<string, StaffCharge>;
  persistence: TerminalPersistenceMeta;
  eventLog: TerminalSimulationEvent[];
}

export interface ScheduleTrainDepartureResult {
  scheduled: boolean;
  order?: TrainDispatchOrder;
  reason?: 'TRAIN_NOT_FOUND' | 'INVALID_DEPARTURE_TICK' | 'ACTIVE_ORDER_ALREADY_EXISTS' | 'GAME_NOT_ACTIVE';
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

export interface GameplayEventResolutionResult {
  resolved: boolean;
  reason?: 'EVENT_NOT_FOUND' | 'EVENT_NOT_OPEN' | 'INVALID_CHOICE';
}

export interface UpgradeStartResult {
  started: boolean;
  reason?: 'UNKNOWN_UPGRADE' | 'TERMINAL_NOT_FOUND' | 'GAME_NOT_ACTIVE' | 'ALREADY_COMPLETED' | 'ALREADY_BUILDING' | 'PREREQUISITE_MISSING' | 'INSUFFICIENT_CAPITAL';
}

export interface HireSpecialistResult {
  hired: boolean;
  reason?: 'TERMINAL_NOT_FOUND' | 'GAME_NOT_ACTIVE' | 'ALREADY_EMPLOYED';
  specialist?: Specialist;
}

export interface CampaignStartResult {
  started: boolean;
  reason?: 'UNKNOWN_SCENARIO';
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
  /** Resolves an offered operational event with a fully disclosed player choice. */
  resolveGameplayEvent: (eventId: string, choiceId: GameplayEventChoiceId) => GameplayEventResolutionResult;
  /** Beauftragt einen Ausbau; Kapital wird gebucht, Abschluss erfolgt nach Bauzeit über Ticks. */
  startTerminalUpgrade: (terminalId: TerminalId, definitionId: string) => UpgradeStartResult;
  /** Stellt einen Spezialisten direkt am Terminal ein; seine Kosten laufen pro Tick auf. */
  hireSpecialist: (terminalId: TerminalId, role: SpecialistRole) => HireSpecialistResult;
  /** Speichert den vollständigen serialisierbaren Spielzustand explizit im Browser. */
  saveGame: () => TerminalPersistenceMeta;
  /** Lädt einen validierten, versionierten Browser-Spielstand. */
  loadGame: () => TerminalPersistenceMeta;
  /** Löscht ausschließlich den browserlokalen Terminal-Spielstand. */
  clearSavedGame: () => TerminalPersistenceMeta;
  /** Startet eine neue Kampagne mit deren vollständigem, konfiguriertem Snapshot. */
  startCampaignScenario: (scenarioId: CampaignScenarioId) => CampaignStartResult;
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
  gameplayEventsById: {},
  gameplayEventEngine: createGameplayEventEngine(),
  operationalState: createTerminalOperationalState(),
  majorProjectsById: {},
  gameProgress: createTerminalGameProgress(),
  activeScenarioId: null,
  terminalUpgradesById: {},
  specialistsById: {},
  staffChargesById: {},
  persistence: { status: 'IDLE', lastSavedAt: null, errorMessage: null },
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
    gameplayEventsById: { ...snapshot.gameplayEventsById },
    gameplayEventEngine: { ...snapshot.gameplayEventEngine },
    operationalState: {
      craneMaintenanceUntilTickByTerminal: { ...snapshot.operationalState.craneMaintenanceUntilTickByTerminal },
      reducedCraneCapacityUntilTickByTerminal: { ...snapshot.operationalState.reducedCraneCapacityUntilTickByTerminal },
      constructionSiteClosedUntilTick: { ...snapshot.operationalState.constructionSiteClosedUntilTick },
    },
    majorProjectsById: { ...snapshot.majorProjectsById },
    gameProgress: { ...snapshot.gameProgress },
    terminalUpgradesById: { ...snapshot.terminalUpgradesById },
    specialistsById: { ...snapshot.specialistsById },
    staffChargesById: { ...snapshot.staffChargesById },
    persistence: { ...snapshot.persistence },
    eventLog: snapshot.eventLog.slice(-MAX_SIMULATION_EVENT_LOG_ENTRIES),
  };
}

function isTerminalSimulationSnapshot(value: unknown): value is TerminalSimulationSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TerminalSimulationSnapshot>;
  return (
    typeof candidate.currentTick === 'number'
    && typeof candidate.companyBalanceCents === 'number'
    && typeof candidate.nextEventSequence === 'number'
    && typeof candidate.terminalsById === 'object'
    && candidate.terminalsById !== null
    && typeof candidate.cargoTypesById === 'object'
    && candidate.cargoTypesById !== null
    && typeof candidate.cargoUnitsById === 'object'
    && candidate.cargoUnitsById !== null
    && typeof candidate.wagonsById === 'object'
    && candidate.wagonsById !== null
    && typeof candidate.trainsById === 'object'
    && candidate.trainsById !== null
    && typeof candidate.gameplayEventsById === 'object'
    && candidate.gameplayEventsById !== null
    && typeof candidate.majorProjectsById === 'object'
    && candidate.majorProjectsById !== null
    && typeof candidate.terminalUpgradesById === 'object'
    && candidate.terminalUpgradesById !== null
    && typeof candidate.specialistsById === 'object'
    && candidate.specialistsById !== null
    && typeof candidate.staffChargesById === 'object'
    && candidate.staffChargesById !== null
    && typeof candidate.gameProgress === 'object'
    && candidate.gameProgress !== null
    && typeof candidate.gameProgress.status === 'string'
    && typeof candidate.gameProgress.reputationPoints === 'number'
    && typeof candidate.gameProgress.grossRevenueCents === 'number'
    && typeof candidate.gameplayEventEngine === 'object'
    && candidate.gameplayEventEngine !== null
    && typeof candidate.operationalState === 'object'
    && candidate.operationalState !== null
    && typeof candidate.persistence === 'object'
    && candidate.persistence !== null
    && Array.isArray(candidate.eventLog)
  );
}

function persistSimulationSnapshot(snapshot: TerminalSimulationSnapshot): TerminalPersistenceMeta {
  const result = saveTerminalSnapshot(snapshot, simulationTimestamp(snapshot.currentTick));
  return {
    status: result.status,
    lastSavedAt: result.savedAt ?? null,
    errorMessage: result.errorMessage ?? null,
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
    gameplayEventsById: initial?.gameplayEventsById ?? {},
    gameplayEventEngine: initial?.gameplayEventEngine ?? createGameplayEventEngine(),
    operationalState: initial?.operationalState ?? createTerminalOperationalState(),
    majorProjectsById: initial?.majorProjectsById ?? {},
    gameProgress: initial?.gameProgress ?? createTerminalGameProgress(),
    activeScenarioId: initial?.activeScenarioId ?? null,
    terminalUpgradesById: initial?.terminalUpgradesById ?? {},
    specialistsById: initial?.specialistsById ?? {},
    staffChargesById: initial?.staffChargesById ?? {},
    persistence: initial?.persistence ?? { status: 'IDLE', lastSavedAt: null, errorMessage: null },
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

function evaluateProgressAfterImmediateTransaction(
  progress: TerminalGameProgress,
  companyBalanceCents: number,
): TerminalGameProgress {
  if (progress.status === 'WON' || progress.status === 'INSOLVENT') return progress;
  if (
    progress.reputationPoints >= progress.reputationTarget
    || progress.completedMajorProjects >= progress.requiredMajorProjects
  ) return { ...progress, status: 'WON' };
  if (companyBalanceCents >= 0) return { ...progress, status: 'ACTIVE', consecutiveNegativeTicks: 0 };
  // A decision may create a deficit, but only completed simulation ticks count
  // toward the warning and insolvency windows.
  return progress;
}

function progressDrafts(
  previous: TerminalGameProgress,
  next: TerminalGameProgress,
  tick: number,
): SimulationEventDraft[] {
  if (previous.status === next.status) return [];
  if (next.status === 'INSOLVENCY_WARNING') {
    return [{
      tick,
      type: 'LIQUIDITY_WARNING',
      severity: 'WARNING',
      message: `Liquiditätswarnung: Konto seit ${next.consecutiveNegativeTicks} Simulationsstunden negativ. Bis zur Insolvenz verbleiben ${Math.max(0, next.insolvencyAfterNegativeTicks - next.consecutiveNegativeTicks)} Stunden.`,
    }];
  }
  if (next.status === 'INSOLVENT') {
    return [{
      tick,
      type: 'TERMINAL_INSOLVENT',
      severity: 'ERROR',
      message: 'Terminal insolvent: Die Liquidität blieb trotz Vorwarnung zu lange negativ.',
    }];
  }
  if (next.status === 'WON') {
    return [{
      tick,
      type: 'GAME_WON',
      severity: 'SUCCESS',
      message: `Großprojekt-Meilenstein erreicht: ${next.completedMajorProjects}/${next.requiredMajorProjects} Projekte, Umsatz ${next.grossRevenueCents}/${next.revenueTargetCents} Cent, Reputation ${next.reputationPoints}/${next.reputationTarget}.`,
    }];
  }
  return [];
}

function completeTerminalUpgrades(
  snapshot: TerminalSimulationSnapshot,
  tick: number,
): { snapshot: TerminalSimulationSnapshot; drafts: SimulationEventDraft[] } {
  const terminalUpgradesById = { ...snapshot.terminalUpgradesById };
  const terminalsById = { ...snapshot.terminalsById };
  const drafts: SimulationEventDraft[] = [];

  for (const upgrade of Object.values(snapshot.terminalUpgradesById)) {
    if (upgrade.status !== 'BUILDING' || upgrade.startedTick == null) continue;
    const definition = getUpgradeDefinition(upgrade.definitionId);
    const terminal = terminalsById[upgrade.terminalId];
    if (!definition || !terminal || tick < upgrade.startedTick + definition.constructionTicks) continue;
    terminalUpgradesById[upgrade.id] = { ...upgrade, status: 'COMPLETED', completedTick: tick };
    terminalsById[terminal.id] = {
      ...terminal,
      trackLengthMeters: terminal.trackLengthMeters + (definition.effects.trackLengthDeltaMeters ?? 0),
      maxCraneCapacityTons: terminal.maxCraneCapacityTons + (definition.effects.craneCapacityDeltaTons ?? 0),
      storageAreaSqm: terminal.storageAreaSqm + (definition.effects.storageAreaDeltaSqm ?? 0),
      hasSpecialCrane: terminal.hasSpecialCrane || definition.effects.enablesSpecialCrane === true,
    };
    drafts.push({
      tick,
      type: 'UPGRADE_COMPLETED',
      severity: 'SUCCESS',
      entityId: upgrade.id,
      message: `Ausbau „${definition.name}“ ist abgeschlossen. ${definition.description}`,
    });
  }

  for (const upgrade of Object.values(terminalUpgradesById)) {
    if (upgrade.status !== 'LOCKED') continue;
    const definition = getUpgradeDefinition(upgrade.definitionId);
    if (!definition) continue;
    const completed = completedUpgradeIds(Object.values(terminalUpgradesById), upgrade.terminalId);
    if (definition.requiredUpgradeIds.every((requirement) => completed.has(requirement))) {
      terminalUpgradesById[upgrade.id] = { ...upgrade, status: 'AVAILABLE' };
    }
  }
  return { snapshot: { ...snapshot, terminalUpgradesById, terminalsById }, drafts };
}

function bookStaffUpkeep(
  snapshot: TerminalSimulationSnapshot,
  tick: number,
): { snapshot: TerminalSimulationSnapshot; drafts: SimulationEventDraft[] } {
  const employed = Object.values(snapshot.specialistsById).filter((specialist) => specialist.status === 'EMPLOYED');
  const effects = calculateTerminalStaffEffects(employed);
  if (employed.length === 0 || effects.upkeepCentsPerTick <= 0) return { snapshot, drafts: [] };
  const id = `staff-charge-${tick}`;
  if (snapshot.staffChargesById[id]) return { snapshot, drafts: [] };
  const charge: StaffCharge = {
    id,
    tick,
    amountCents: effects.upkeepCentsPerTick,
    specialistIds: employed.map((specialist) => specialist.id),
    description: `Personalunterhalt für ${employed.length} Fachkraft${employed.length === 1 ? '' : 'kräfte'} in Simulationsstunde ${tick}.`,
  };
  return {
    snapshot: {
      ...snapshot,
      companyBalanceCents: snapshot.companyBalanceCents - charge.amountCents,
      staffChargesById: { ...snapshot.staffChargesById, [charge.id]: charge },
    },
    drafts: [{
      tick,
      type: 'STAFF_COST_BOOKED',
      severity: 'WARNING',
      entityId: charge.id,
      amountCents: charge.amountCents,
      message: `${charge.description} Belastung: ${charge.amountCents} Cent.`,
    }],
  };
}

function terminalCanHandleOutOfGauge(
  snapshot: TerminalSimulationSnapshot,
  terminalId: TerminalId,
): boolean {
  const completed = completedUpgradeIds(Object.values(snapshot.terminalUpgradesById), terminalId);
  const hasOutOfGaugeInfrastructure = TERMINAL_UPGRADE_CATALOG.some(
    (definition) => definition.effects.unlocksOutOfGaugeContracts && completed.has(definition.id),
  );
  const staffEffects = calculateTerminalStaffEffects(
    Object.values(snapshot.specialistsById).filter((specialist) => specialist.terminalId === terminalId),
  );
  return hasOutOfGaugeInfrastructure && staffEffects.allowsOutOfGaugeDispatch;
}

function advanceScheduledArrivals(
  snapshot: TerminalSimulationSnapshot,
  tick: number,
): { snapshot: TerminalSimulationSnapshot; drafts: SimulationEventDraft[] } {
  const inboundArrivalsById = { ...snapshot.inboundArrivalsById };
  const drafts: SimulationEventDraft[] = [];
  for (const arrival of Object.values(snapshot.inboundArrivalsById)) {
    const blockedByOpenDelayEvent = Object.values(snapshot.gameplayEventsById).some(
      (event) => event.status === 'OPEN' && event.kind === 'INBOUND_SHIPMENT_DELAY' && event.target.inboundArrivalId === arrival.id,
    );
    if (
      arrival.status !== 'SCHEDULED'
      || arrival.expectedArrivalTick == null
      || arrival.expectedArrivalTick > tick
      || blockedByOpenDelayEvent
    ) continue;
    inboundArrivalsById[arrival.id] = { ...arrival, status: 'BERTHED' };
    drafts.push({
      tick,
      type: 'INBOUND_ARRIVED',
      severity: 'INFO',
      entityId: arrival.id,
      message: `${arrival.label} hat das Terminal erreicht und belegt einen Liegeplatz.`,
    });
  }
  return { snapshot: { ...snapshot, inboundArrivalsById }, drafts };
}

function completeDueMajorProjects(
  snapshot: TerminalSimulationSnapshot,
  tick: number,
): { snapshot: TerminalSimulationSnapshot; drafts: SimulationEventDraft[] } {
  const majorProjectsById = { ...snapshot.majorProjectsById };
  const trainsById = { ...snapshot.trainsById };
  const cargoUnitsById = { ...snapshot.cargoUnitsById };
  const drafts: SimulationEventDraft[] = [];
  let companyBalanceCents = snapshot.companyBalanceCents;
  let gameProgress = snapshot.gameProgress;

  for (const project of Object.values(snapshot.majorProjectsById)) {
    if (project.status !== 'IN_TRANSIT' || project.deliveryDueTick == null || project.deliveryDueTick > tick) continue;
    majorProjectsById[project.id] = { ...project, status: 'COMPLETED', completedTick: tick };
    companyBalanceCents += project.rewardCents;
    gameProgress = {
      ...gameProgress,
      reputationPoints: gameProgress.reputationPoints + project.reputationReward,
      grossRevenueCents: gameProgress.grossRevenueCents + project.rewardCents,
      completedMajorProjects: gameProgress.completedMajorProjects + 1,
    };
    const train = trainsById[project.trainId];
    if (train) trainsById[train.id] = { ...train, status: 'DELIVERED' };
    const wagonIds = new Set(
      Object.values(snapshot.wagonsById)
        .filter((wagon) => wagon.currentTrainId === project.trainId)
        .map((wagon) => wagon.id),
    );
    for (const load of snapshot.wagonLoads) {
      if (!wagonIds.has(load.wagonId)) continue;
      const cargoUnit = cargoUnitsById[load.cargoUnitId];
      if (cargoUnit) cargoUnitsById[cargoUnit.id] = { ...cargoUnit, status: 'DELIVERED' };
    }
    drafts.push({
      tick,
      type: 'MAJOR_PROJECT_COMPLETED',
      severity: 'SUCCESS',
      entityId: project.id,
      amountCents: project.rewardCents,
      message: `Großprojekt „${project.label}“ erfolgreich abgeschlossen. Erlös: ${project.rewardCents} Cent; Reputation: +${project.reputationReward}.`,
    });
  }

  return {
    snapshot: {
      ...snapshot,
      majorProjectsById,
      trainsById,
      cargoUnitsById,
      companyBalanceCents,
      gameProgress,
    },
    drafts,
  };
}

function offerGameplayEvent(
  snapshot: TerminalSimulationSnapshot,
  tick: number,
): { snapshot: TerminalSimulationSnapshot; drafts: SimulationEventDraft[] } {
  const roll = rollGameplayEvent(snapshot.gameplayEventEngine, {
    currentTick: tick,
    hasOpenEvent: Object.values(snapshot.gameplayEventsById).some((event) => event.status === 'OPEN'),
    terminalIds: Object.keys(snapshot.terminalsById),
    constructionSites: [...new Set(
      Object.values(snapshot.trainsById)
        .filter((train) => train.status === 'ASSEMBLING' || train.status === 'IN_INSPECTION')
        .map((train) => train.destinationConstructionSite),
    )],
    scheduledInboundArrivalIds: Object.values(snapshot.inboundArrivalsById)
      .filter((arrival) => arrival.status === 'SCHEDULED')
      .map((arrival) => arrival.id),
  });
  if (!roll.event) return { snapshot: { ...snapshot, gameplayEventEngine: roll.engine }, drafts: [] };
  return {
    snapshot: {
      ...snapshot,
      gameplayEventEngine: roll.engine,
      gameplayEventsById: { ...snapshot.gameplayEventsById, [roll.event.id]: roll.event },
    },
    drafts: [{
      tick,
      type: 'GAMEPLAY_EVENT_OFFERED',
      severity: 'WARNING',
      entityId: roll.event.id,
      message: `${roll.event.title}: ${roll.event.description}`,
    }],
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
  if (snapshot.gameProgress.status === 'WON' || snapshot.gameProgress.status === 'INSOLVENT') {
    return {
      snapshot,
      attempt: { trainId, dispatched: false, feasibility: null, reason: 'GAME_NOT_ACTIVE' },
      drafts: [{
        tick,
        type: 'TRAIN_DISPATCH_BLOCKED',
        severity: 'ERROR',
        entityId: trainId,
        message: 'Der Spielstand ist beendet; es können keine weiteren Abfahrten disponiert werden.',
      }],
    };
  }
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
  const constructionSiteBlocked = isConstructionSiteClosed(snapshot.operationalState, train.destinationConstructionSite, tick)
    || Object.values(snapshot.gameplayEventsById).some(
      (event) => event.status === 'OPEN' && event.kind === 'CONSTRUCTION_SITE_CLOSURE' && event.target.constructionSite === train.destinationConstructionSite,
    );
  let nextSnapshot: TerminalSimulationSnapshot = {
    ...snapshot,
    trainsById: { ...snapshot.trainsById, [trainId]: derivedTrain },
    trainEventsById: eventMaterialization.trainEventsById,
  };

  if (constructionSiteBlocked) {
    return {
      snapshot: nextSnapshot,
      attempt: { trainId, dispatched: false, feasibility },
      drafts: [
        ...eventMaterialization.drafts,
        {
          tick,
          type: 'CONSTRUCTION_SITE_BLOCKED',
          severity: 'WARNING',
          entityId: trainId,
          message: `Zug ${trainId} wartet auf ein freies Baustellenzeitfenster für ${train.destinationConstructionSite}.`,
        },
      ],
    };
  }

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

  if (feasibility.requiresOutOfGaugeApproval && !terminalCanHandleOutOfGauge(snapshot, train.terminalId)) {
    return {
      snapshot: nextSnapshot,
      attempt: { trainId, dispatched: false, feasibility, reason: 'LUE_SPECIALIST_REQUIRED' },
      drafts: [{
        tick,
        type: 'TRAIN_DISPATCH_BLOCKED',
        severity: 'ERROR',
        entityId: trainId,
        message: `Zug ${trainId} enthält LÜ-Fracht. Schwerlasttechnik/LÜ-Prüfstelle und ein beschäftigter LÜ-Prüfer sind vor der Abfahrt erforderlich.`,
      }],
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

  const majorProjectsById = Object.fromEntries(Object.entries(nextSnapshot.majorProjectsById).map(([projectId, project]) => {
    if (project.trainId !== trainId || project.status !== 'PLANNED') return [projectId, project];
    return [projectId, {
      ...project,
      status: 'IN_TRANSIT' as const,
      dispatchedTick: tick,
      deliveryDueTick: tick + Math.max(1, project.deliveryDurationTicks),
    }];
  }));

  nextSnapshot = {
    ...nextSnapshot,
    terminalsById,
    majorProjectsById,
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
  if (snapshot.gameProgress.status === 'WON' || snapshot.gameProgress.status === 'INSOLVENT') {
    return {
      snapshot,
      result: {
        previousTick,
        currentTick: previousTick,
        berthCharges: [],
        dispatchAttempts: [],
        emittedEvents: [],
      },
    };
  }
  const currentTick = previousTick + 1;
  const berthCharges: BerthCharge[] = [];
  const drafts: SimulationEventDraft[] = [];
  let workingSnapshot: TerminalSimulationSnapshot = {
    ...snapshot,
    currentTick,
    berthChargesById: { ...snapshot.berthChargesById },
  };

  const completedUpgrades = completeTerminalUpgrades(workingSnapshot, currentTick);
  workingSnapshot = completedUpgrades.snapshot;
  drafts.push(...completedUpgrades.drafts);

  const staffUpkeep = bookStaffUpkeep(workingSnapshot, currentTick);
  workingSnapshot = staffUpkeep.snapshot;
  drafts.push(...staffUpkeep.drafts);

  const arrivals = advanceScheduledArrivals(workingSnapshot, currentTick);
  workingSnapshot = arrivals.snapshot;
  drafts.push(...arrivals.drafts);

  for (const arrival of Object.values(workingSnapshot.inboundArrivalsById)) {
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

  const completedProjects = completeDueMajorProjects(workingSnapshot, currentTick);
  workingSnapshot = completedProjects.snapshot;
  drafts.push(...completedProjects.drafts);

  const evaluatedProgress = evaluateTerminalGameProgress(
    workingSnapshot.gameProgress,
    workingSnapshot.companyBalanceCents,
  );
  drafts.push(...progressDrafts(workingSnapshot.gameProgress, evaluatedProgress, currentTick));
  workingSnapshot = { ...workingSnapshot, gameProgress: evaluatedProgress };

  if (evaluatedProgress.status !== 'WON' && evaluatedProgress.status !== 'INSOLVENT') {
    const offeredEvent = offerGameplayEvent(workingSnapshot, currentTick);
    workingSnapshot = offeredEvent.snapshot;
    drafts.push(...offeredEvent.drafts);
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
        if (state.gameProgress.status === 'WON' || state.gameProgress.status === 'INSOLVENT') {
          result = { scheduled: false, reason: 'GAME_NOT_ACTIVE' };
          return state;
        }
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

    resolveGameplayEvent: (eventId, choiceId) => {
      let result: GameplayEventResolutionResult = { resolved: false, reason: 'EVENT_NOT_FOUND' };
      set((state) => {
        const event = state.gameplayEventsById[eventId];
        if (!event) return state;
        if (event.status !== 'OPEN') {
          result = { resolved: false, reason: 'EVENT_NOT_OPEN' };
          return state;
        }
        const effect = resolveGameplayEventEffect(event, choiceId, state.currentTick);
        if (!effect) {
          result = { resolved: false, reason: 'INVALID_CHOICE' };
          return state;
        }

        const operationalState: TerminalOperationalState = {
          craneMaintenanceUntilTickByTerminal: { ...state.operationalState.craneMaintenanceUntilTickByTerminal },
          reducedCraneCapacityUntilTickByTerminal: { ...state.operationalState.reducedCraneCapacityUntilTickByTerminal },
          constructionSiteClosedUntilTick: { ...state.operationalState.constructionSiteClosedUntilTick },
        };
        if (effect.craneMaintenanceUntilTick) {
          operationalState.craneMaintenanceUntilTickByTerminal[effect.craneMaintenanceUntilTick.terminalId] = effect.craneMaintenanceUntilTick.untilTick;
        }
        if (effect.reducedCraneCapacityUntilTick) {
          operationalState.reducedCraneCapacityUntilTickByTerminal[effect.reducedCraneCapacityUntilTick.terminalId] = effect.reducedCraneCapacityUntilTick.untilTick;
        }
        if (effect.constructionSiteClosedUntilTick) {
          operationalState.constructionSiteClosedUntilTick[effect.constructionSiteClosedUntilTick.constructionSite] = effect.constructionSiteClosedUntilTick.untilTick;
        }
        const inboundArrivalsById = { ...state.inboundArrivalsById };
        if (effect.inboundArrivalExpectedTick) {
          const arrival = inboundArrivalsById[effect.inboundArrivalExpectedTick.inboundArrivalId];
          if (arrival) inboundArrivalsById[arrival.id] = { ...arrival, expectedArrivalTick: effect.inboundArrivalExpectedTick.expectedArrivalTick };
        }
        const resolvedEvent: GameplayEvent = {
          ...event,
          status: 'RESOLVED',
          resolvedChoiceId: choiceId,
          resolvedTick: state.currentTick,
        };
        const gameProgressBeforeEvaluation = {
          ...state.gameProgress,
          reputationPoints: Math.max(0, state.gameProgress.reputationPoints + effect.reputationDelta),
        };
        const companyBalanceCents = state.companyBalanceCents + effect.cashDeltaCents;
        const gameProgress = evaluateProgressAfterImmediateTransaction(gameProgressBeforeEvaluation, companyBalanceCents);
        const choice = event.choices.find((candidate) => candidate.id === choiceId);
        const withEvents = appendEventDrafts({
          ...snapshotFromState(state),
          companyBalanceCents,
          gameplayEventsById: { ...state.gameplayEventsById, [eventId]: resolvedEvent },
          operationalState,
          inboundArrivalsById,
          gameProgress,
        }, [
          {
            tick: state.currentTick,
            type: 'GAMEPLAY_EVENT_RESOLVED',
            severity: effect.cashDeltaCents < 0 ? 'WARNING' : 'INFO',
            entityId: eventId,
            amountCents: effect.cashDeltaCents,
            message: `${event.title}: „${choice?.label ?? choiceId}“ gewählt. ${choice?.consequence ?? ''}`,
          },
          ...progressDrafts(state.gameProgress, gameProgress, state.currentTick),
        ]);
        result = { resolved: true };
        return withEvents.snapshot;
      });
            return result;
    },

    startTerminalUpgrade: (terminalId, definitionId) => {
      let result: UpgradeStartResult = { started: false, reason: 'UNKNOWN_UPGRADE' };
      set((state) => {
        if (state.gameProgress.status === 'WON' || state.gameProgress.status === 'INSOLVENT') {
          result = { started: false, reason: 'GAME_NOT_ACTIVE' };
          return state;
        }
        const terminal = state.terminalsById[terminalId];
        const definition = getUpgradeDefinition(definitionId);
        if (!terminal) {
          result = { started: false, reason: 'TERMINAL_NOT_FOUND' };
          return state;
        }
        if (!definition) return state;
        const existing = Object.values(state.terminalUpgradesById).find(
          (upgrade) => upgrade.terminalId === terminalId && upgrade.definitionId === definitionId,
        );
        if (existing?.status === 'COMPLETED') {
          result = { started: false, reason: 'ALREADY_COMPLETED' };
          return state;
        }
        if (existing?.status === 'BUILDING') {
          result = { started: false, reason: 'ALREADY_BUILDING' };
          return state;
        }
        const completed = completedUpgradeIds(Object.values(state.terminalUpgradesById), terminalId);
        if (!definition.requiredUpgradeIds.every((requirement) => completed.has(requirement))) {
          result = { started: false, reason: 'PREREQUISITE_MISSING' };
          return state;
        }
        if (state.companyBalanceCents < definition.capitalCostCents) {
          result = { started: false, reason: 'INSUFFICIENT_CAPITAL' };
          return state;
        }
        const upgrade: TerminalUpgrade = {
          id: existing?.id ?? `upgrade-${terminalId}-${definitionId}`,
          terminalId,
          definitionId,
          status: 'BUILDING',
          startedTick: state.currentTick,
          completedTick: null,
        };
        const withEvents = appendEventDrafts({
          ...snapshotFromState(state),
          companyBalanceCents: state.companyBalanceCents - definition.capitalCostCents,
          terminalUpgradesById: { ...state.terminalUpgradesById, [upgrade.id]: upgrade },
        }, [{
          tick: state.currentTick,
          type: 'UPGRADE_STARTED',
          severity: 'INFO',
          entityId: upgrade.id,
          amountCents: definition.capitalCostCents,
          message: `Ausbau „${definition.name}“ beauftragt. Kosten: ${definition.capitalCostCents} Cent; Fertigstellung ab Simulationsstunde ${state.currentTick + definition.constructionTicks}.`,
        }]);
        result = { started: true };
        return withEvents.snapshot;
      });
      return result;
    },

    hireSpecialist: (terminalId, role) => {
      let result: HireSpecialistResult = { hired: false, reason: 'TERMINAL_NOT_FOUND' };
      set((state) => {
        if (state.gameProgress.status === 'WON' || state.gameProgress.status === 'INSOLVENT') {
          result = { hired: false, reason: 'GAME_NOT_ACTIVE' };
          return state;
        }
        if (!state.terminalsById[terminalId]) return state;
        const existing = Object.values(state.specialistsById).find(
          (specialist) => specialist.terminalId === terminalId && specialist.role === role && specialist.status === 'EMPLOYED',
        );
        if (existing) {
          result = { hired: false, reason: 'ALREADY_EMPLOYED' };
          return state;
        }
        const definition = getSpecialistDefinition(role);
        const specialist: Specialist = {
          id: `specialist-${terminalId}-${role.toLowerCase()}`,
          terminalId,
          role,
          name: definition.title,
          status: 'EMPLOYED',
          upkeepCentsPerTick: definition.upkeepCentsPerTick,
          hiredTick: state.currentTick,
        };
        const withEvents = appendEventDrafts({
          ...snapshotFromState(state),
          specialistsById: { ...state.specialistsById, [specialist.id]: specialist },
        }, [{
          tick: state.currentTick,
          type: 'SPECIALIST_HIRED',
          severity: 'INFO',
          entityId: specialist.id,
          message: `${definition.title} eingestellt. Laufender Unterhalt: ${definition.upkeepCentsPerTick} Cent pro Simulationsstunde.`,
        }]);
        result = { hired: true, specialist };
        return withEvents.snapshot;
      });
      return result;
    },

    saveGame: () => {
      const meta = persistSimulationSnapshot(snapshotFromState(get()));
      set({ persistence: meta });
      return meta;
    },

    loadGame: () => {
      const result = loadTerminalSnapshot(isTerminalSimulationSnapshot);
      const meta: TerminalPersistenceMeta = {
        status: result.status,
        lastSavedAt: result.savedAt ?? null,
        errorMessage: result.errorMessage ?? null,
      };
      if (!result.ok || !result.snapshot) {
        set({ persistence: meta });
        return meta;
      }
      set({ ...normaliseSnapshot(result.snapshot), persistence: meta });
      return meta;
    },

    clearSavedGame: () => {
      const result = clearTerminalSnapshot();
      const meta: TerminalPersistenceMeta = {
        status: result.status,
        lastSavedAt: null,
        errorMessage: result.errorMessage ?? null,
      };
      set({ persistence: meta });
      return meta;
    },

    startCampaignScenario: (scenarioId) => {
      if (!CAMPAIGN_SCENARIOS.some((scenario) => scenario.id === scenarioId)) return { started: false, reason: 'UNKNOWN_SCENARIO' };
      const scenario = CAMPAIGN_SCENARIOS.find((candidate) => candidate.id === scenarioId)!;
      const startedSnapshot = createScenarioSnapshot(scenarioId);
      const withEvents = appendEventDrafts(startedSnapshot, [{
        tick: 0,
        type: 'SCENARIO_STARTED',
        severity: 'INFO',
        entityId: scenario.id,
        message: `Kampagne „${scenario.title}“ gestartet. ${scenario.briefing}`,
      }]);
      const persistence = persistSimulationSnapshot(withEvents.snapshot);
      set({ ...withEvents.snapshot, persistence });
      return { started: true };
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
      let advanced = false;
      set((state) => {
        const transition = advanceTerminalTick(snapshotFromState(state));
        result = transition.result;
        advanced = transition.result.currentTick > transition.result.previousTick;
        return transition.snapshot;
      });
      if (!result) throw new Error('Terminal-Tick konnte nicht ausgeführt werden.');
      if (advanced) set({ persistence: persistSimulationSnapshot(snapshotFromState(get())) });
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
          // A newly offered operational decision pauses fast-forwarding fairly.
          if (transition.result.emittedEvents.some((event) => event.type === 'GAMEPLAY_EVENT_OFFERED')) break;
          if (snapshot.gameProgress.status === 'WON' || snapshot.gameProgress.status === 'INSOLVENT') break;
        }
        result = {
          previousTick,
          currentTick: snapshot.currentTick,
          tickResults,
        };
        return snapshot;
      });
      const completedDay = result as AdvanceDayResult | null;
      if (!completedDay) throw new Error('Terminal-Tag konnte nicht ausgeführt werden.');
      if (completedDay.currentTick > completedDay.previousTick) set({ persistence: persistSimulationSnapshot(snapshotFromState(get())) });
      return completedDay;
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
    gameplayEventsById: state.gameplayEventsById,
    gameplayEventEngine: state.gameplayEventEngine,
    operationalState: state.operationalState,
    majorProjectsById: state.majorProjectsById,
    gameProgress: state.gameProgress,
    activeScenarioId: state.activeScenarioId,
    terminalUpgradesById: state.terminalUpgradesById,
    specialistsById: state.specialistsById,
    staffChargesById: state.staffChargesById,
    persistence: state.persistence,
    eventLog: state.eventLog,
  };
}

/** Application singleton. No interval is attached; UI actions explicitly advance time. */
export const terminalSimulationStore = createTerminalSimulationStore();

/** Convenience hook for future React views; use selectors to minimize re-renders. */
export function useTerminalSimulation<T>(selector: (state: TerminalSimulationState) => T): T {
  return useStore(terminalSimulationStore, selector);
}
