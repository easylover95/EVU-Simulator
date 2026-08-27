import type { TerminalId, TrainId } from '@/lib/terminalEntities';

/** RNG and cadence are persisted in the snapshot, so a save game remains reproducible. */
export const EVENT_ROLL_INTERVAL_TICKS = 4;
export const EVENT_COOLDOWN_TICKS = 8;
export const GAMEPLAY_EVENT_PROBABILITY = 0.35;
export const DEFAULT_DELIVERY_DURATION_TICKS = 6;

export type GameplayEventKind =
  | 'CRANE_MAINTENANCE'
  | 'CONSTRUCTION_SITE_CLOSURE'
  | 'INBOUND_SHIPMENT_DELAY';

export type GameplayEventStatus = 'OPEN' | 'RESOLVED';
export type GameplayEventChoiceId =
  | 'MAINTAIN_NOW'
  | 'DEFER_MAINTENANCE'
  | 'BUY_PRIORITY_ACCESS'
  | 'WAIT_FOR_CLEARANCE'
  | 'EXPEDITE_INBOUND'
  | 'ACCEPT_INBOUND_DELAY';

/**
 * Every choice exposes its immediate financial impact before it is selected.
 * Deferred operational impact is stated in `consequence` and stored in the
 * event ledger after resolution.
 */
export interface GameplayEventChoice {
  id: GameplayEventChoiceId;
  label: string;
  consequence: string;
  immediateCostCents: number;
  reputationDelta: number;
}

/**
 * Relational target references for the later `gameplay_events` table. One event
 * targets exactly one operational object; the optional fields remain foreign
 * keys rather than embedded entity copies.
 */
export interface GameplayEventTarget {
  terminalId?: TerminalId;
  constructionSite?: string;
  inboundArrivalId?: string;
}

export interface GameplayEvent {
  id: string;
  kind: GameplayEventKind;
  status: GameplayEventStatus;
  createdTick: number;
  title: string;
  description: string;
  target: GameplayEventTarget;
  choices: readonly GameplayEventChoice[];
  resolvedChoiceId: GameplayEventChoiceId | null;
  resolvedTick: number | null;
}

/** Persisted event-engine state. It never reads Math.random or wall-clock time. */
export interface GameplayEventEngine {
  randomSeed: number;
  nextSequence: number;
  nextRollTick: number;
  cooldownUntilTick: number;
}

/** Temporary restrictions created by the player's explicit event decision. */
export interface TerminalOperationalState {
  craneMaintenanceUntilTickByTerminal: Record<TerminalId, number>;
  reducedCraneCapacityUntilTickByTerminal: Record<TerminalId, number>;
  constructionSiteClosedUntilTick: Record<string, number>;
}

export type MajorProjectStatus = 'PLANNED' | 'IN_TRANSIT' | 'COMPLETED' | 'FAILED';

/**
 * Relationally this maps to `major_projects`, linked to a dedicated train.
 * Revenue is credited only when the train is delivered, never on dispatch.
 */
export interface MajorProject {
  id: string;
  trainId: TrainId;
  label: string;
  rewardCents: number;
  reputationReward: number;
  deliveryDurationTicks: number;
  status: MajorProjectStatus;
  dispatchedTick: number | null;
  deliveryDueTick: number | null;
  completedTick: number | null;
}

export type TerminalGameStatus = 'ACTIVE' | 'INSOLVENCY_WARNING' | 'WON' | 'INSOLVENT';

/**
 * Progression is deliberately simple and visible: a terminal wins by reaching
 * either the reputation target or the required number of major projects.
 * Sustained negative liquidity gets a warning before a terminal becomes insolvent.
 */
export interface TerminalGameProgress {
  status: TerminalGameStatus;
  reputationPoints: number;
  reputationTarget: number;
  /** Kumulierte, durch Projektabschlüsse realisierte Umsätze in Cent. */
  grossRevenueCents: number;
  /** Optionaler Umsatzmeilenstein; hohe Defaultwerte deaktivieren ihn implizit. */
  revenueTargetCents: number;
  completedMajorProjects: number;
  requiredMajorProjects: number;
  consecutiveNegativeTicks: number;
  warningAfterNegativeTicks: number;
  insolvencyAfterNegativeTicks: number;
}

export interface GameplayEventContext {
  currentTick: number;
  hasOpenEvent: boolean;
  terminalIds: TerminalId[];
  constructionSites: string[];
  scheduledInboundArrivalIds: string[];
}

export interface GameplayEventRollResult {
  engine: GameplayEventEngine;
  event: GameplayEvent | null;
}

export interface GameplayResolutionEffect {
  cashDeltaCents: number;
  reputationDelta: number;
  craneMaintenanceUntilTick?: { terminalId: TerminalId; untilTick: number };
  reducedCraneCapacityUntilTick?: { terminalId: TerminalId; untilTick: number };
  constructionSiteClosedUntilTick?: { constructionSite: string; untilTick: number };
  inboundArrivalExpectedTick?: { inboundArrivalId: string; expectedArrivalTick: number };
}

export function createGameplayEventEngine(randomSeed = 1): GameplayEventEngine {
  return {
    randomSeed: randomSeed >>> 0,
    nextSequence: 0,
    nextRollTick: EVENT_ROLL_INTERVAL_TICKS,
    cooldownUntilTick: 0,
  };
}

export function createTerminalGameProgress(overrides: Partial<TerminalGameProgress> = {}): TerminalGameProgress {
  return {
    status: 'ACTIVE',
    reputationPoints: 0,
    reputationTarget: 100,
    grossRevenueCents: 0,
    revenueTargetCents: Number.MAX_SAFE_INTEGER,
    completedMajorProjects: 0,
    requiredMajorProjects: 3,
    consecutiveNegativeTicks: 0,
    warningAfterNegativeTicks: 4,
    insolvencyAfterNegativeTicks: 12,
    ...overrides,
  };
}

export function createTerminalOperationalState(): TerminalOperationalState {
  return {
    craneMaintenanceUntilTickByTerminal: {},
    reducedCraneCapacityUntilTickByTerminal: {},
    constructionSiteClosedUntilTick: {},
  };
}

function nextRandom(seed: number): { seed: number; value: number } {
  const nextSeed = (Math.imul(1_664_525, seed >>> 0) + 1_013_904_223) >>> 0;
  return { seed: nextSeed, value: nextSeed / 4_294_967_296 };
}

function createEvent(
  kind: GameplayEventKind,
  id: string,
  tick: number,
  target: GameplayEventTarget,
): GameplayEvent {
  switch (kind) {
    case 'CRANE_MAINTENANCE':
      return {
        id,
        kind,
        status: 'OPEN',
        createdTick: tick,
        title: 'Geplante Kranwartung',
        description: 'Die Zustandsüberwachung meldet eine fällige Wartung am Schwerlastkran. Entscheide transparent zwischen geplanter Stilllegung und begrenztem Weiterbetrieb.',
        target,
        choices: [
          { id: 'MAINTAIN_NOW', label: 'Wartung jetzt durchführen', consequence: '18.000 € sofort; der Kran steht für exakt 2 Simulationsstunden still und ist danach ohne Kapazitätsabschlag verfügbar.', immediateCostCents: 1_800_000, reputationDelta: 1 },
          { id: 'DEFER_MAINTENANCE', label: 'Wartung kontrolliert verschieben', consequence: '6.000 € Zuschlag; für exakt 4 Simulationsstunden sinkt die nutzbare Krantragfähigkeit auf 50 %.', immediateCostCents: 600_000, reputationDelta: -1 },
        ],
        resolvedChoiceId: null,
        resolvedTick: null,
      };
    case 'CONSTRUCTION_SITE_CLOSURE':
      return {
        id,
        kind,
        status: 'OPEN',
        createdTick: tick,
        title: 'Temporäre Baustellensperrung',
        description: 'Das Zielfenster der Baustelle ist wegen einer Sicherheitsfreigabe eingeschränkt. Ohne priorisierten Zugang werden Abfahrten dorthin transparent blockiert.',
        target,
        choices: [
          { id: 'BUY_PRIORITY_ACCESS', label: 'Priorisiertes Zeitfenster buchen', consequence: '32.000 € sofort; die Sperrung wird für diesen Bauabschnitt aufgehoben.', immediateCostCents: 3_200_000, reputationDelta: 2 },
          { id: 'WAIT_FOR_CLEARANCE', label: 'Reguläre Freigabe abwarten', consequence: 'Keine Sofortkosten; Abfahrten zu diesem Bauabschnitt bleiben für 4 Simulationsstunden gesperrt.', immediateCostCents: 0, reputationDelta: -1 },
        ],
        resolvedChoiceId: null,
        resolvedTick: null,
      };
    case 'INBOUND_SHIPMENT_DELAY':
      return {
        id,
        kind,
        status: 'OPEN',
        createdTick: tick,
        title: 'Verspätete Schwergut-Ankunft',
        description: 'Das eingehende Schiff meldet eine Verzögerung im Zulauf. Du kannst den beschleunigten Umlauf einkaufen oder die verlässliche, aber spätere Ankunft akzeptieren.',
        target,
        choices: [
          { id: 'EXPEDITE_INBOUND', label: 'Beschleunigten Zulauf buchen', consequence: '14.000 € sofort; Ankunft ist zur nächsten Simulationsstunde vorgesehen.', immediateCostCents: 1_400_000, reputationDelta: 1 },
          { id: 'ACCEPT_INBOUND_DELAY', label: 'Verspätung akzeptieren', consequence: 'Keine Sofortkosten; die Ankunft verschiebt sich um 3 Simulationsstunden.', immediateCostCents: 0, reputationDelta: -1 },
        ],
        resolvedChoiceId: null,
        resolvedTick: null,
      };
  }
}

/**
 * Performs a reproducible fair roll. There is at most one open event, rolls are
 * spaced apart and a fixed cooldown prevents unfair event cascades.
 */
export function rollGameplayEvent(
  engine: GameplayEventEngine,
  context: GameplayEventContext,
): GameplayEventRollResult {
  if (
    context.hasOpenEvent
    || context.currentTick < engine.nextRollTick
    || context.currentTick < engine.cooldownUntilTick
  ) {
    return { engine, event: null };
  }

  const chanceRoll = nextRandom(engine.randomSeed);
  const advancedEngine: GameplayEventEngine = {
    ...engine,
    randomSeed: chanceRoll.seed,
    nextRollTick: context.currentTick + EVENT_ROLL_INTERVAL_TICKS,
  };
  if (chanceRoll.value >= GAMEPLAY_EVENT_PROBABILITY) return { engine: advancedEngine, event: null };

  const candidates: Array<{ kind: GameplayEventKind; target: GameplayEventTarget }> = [];
  for (const terminalId of context.terminalIds) candidates.push({ kind: 'CRANE_MAINTENANCE', target: { terminalId } });
  for (const constructionSite of context.constructionSites) candidates.push({ kind: 'CONSTRUCTION_SITE_CLOSURE', target: { constructionSite } });
  for (const inboundArrivalId of context.scheduledInboundArrivalIds) candidates.push({ kind: 'INBOUND_SHIPMENT_DELAY', target: { inboundArrivalId } });
  if (candidates.length === 0) return { engine: advancedEngine, event: null };

  const selectionRoll = nextRandom(advancedEngine.randomSeed);
  const selected = candidates[Math.floor(selectionRoll.value * candidates.length)] ?? candidates[0];
  const nextSequence = advancedEngine.nextSequence + 1;
  const nextEngine: GameplayEventEngine = {
    ...advancedEngine,
    randomSeed: selectionRoll.seed,
    nextSequence,
    cooldownUntilTick: context.currentTick + EVENT_COOLDOWN_TICKS,
  };
  return {
    engine: nextEngine,
    event: createEvent(selected.kind, `gameplay-event-${context.currentTick}-${nextSequence}`, context.currentTick, selected.target),
  };
}

/** Validates and materializes the consequence of a fully disclosed player choice. */
export function resolveGameplayEvent(
  event: GameplayEvent,
  choiceId: GameplayEventChoiceId,
  currentTick: number,
): GameplayResolutionEffect | null {
  if (event.status !== 'OPEN' || !event.choices.some((choice) => choice.id === choiceId)) return null;
  const choice = event.choices.find((candidate) => candidate.id === choiceId);
  if (!choice) return null;
  const base: GameplayResolutionEffect = {
    cashDeltaCents: -choice.immediateCostCents,
    reputationDelta: choice.reputationDelta,
  };

  switch (choiceId) {
    case 'MAINTAIN_NOW':
      return event.target.terminalId ? { ...base, craneMaintenanceUntilTick: { terminalId: event.target.terminalId, untilTick: currentTick + 2 } } : null;
    case 'DEFER_MAINTENANCE':
      return event.target.terminalId ? { ...base, reducedCraneCapacityUntilTick: { terminalId: event.target.terminalId, untilTick: currentTick + 4 } } : null;
    case 'BUY_PRIORITY_ACCESS':
      return base;
    case 'WAIT_FOR_CLEARANCE':
      return event.target.constructionSite ? { ...base, constructionSiteClosedUntilTick: { constructionSite: event.target.constructionSite, untilTick: currentTick + 4 } } : null;
    case 'EXPEDITE_INBOUND':
      return event.target.inboundArrivalId ? { ...base, inboundArrivalExpectedTick: { inboundArrivalId: event.target.inboundArrivalId, expectedArrivalTick: currentTick + 1 } } : null;
    case 'ACCEPT_INBOUND_DELAY':
      return event.target.inboundArrivalId ? { ...base, inboundArrivalExpectedTick: { inboundArrivalId: event.target.inboundArrivalId, expectedArrivalTick: currentTick + 3 } } : null;
  }
}

export function effectiveCraneCapacityTons(
  baseCapacityTons: number,
  operationalState: TerminalOperationalState,
  terminalId: TerminalId,
  currentTick: number,
): number {
  if ((operationalState.craneMaintenanceUntilTickByTerminal[terminalId] ?? -1) > currentTick) return 0;
  if ((operationalState.reducedCraneCapacityUntilTickByTerminal[terminalId] ?? -1) > currentTick) {
    return baseCapacityTons * 0.5;
  }
  return baseCapacityTons;
}

export function isConstructionSiteClosed(
  operationalState: TerminalOperationalState,
  constructionSite: string,
  currentTick: number,
): boolean {
  return (operationalState.constructionSiteClosedUntilTick[constructionSite] ?? 0) > currentTick;
}

/**
 * Evaluates game status after every money-changing tick. The warning starts well
 * before insolvency and a recovered balance resets the negative-liquidity timer.
 */
export function evaluateTerminalGameProgress(
  progress: TerminalGameProgress,
  companyBalanceCents: number,
): TerminalGameProgress {
  if (progress.status === 'WON' || progress.status === 'INSOLVENT') return progress;
  const consecutiveNegativeTicks = companyBalanceCents < 0 ? progress.consecutiveNegativeTicks + 1 : 0;
  const hasWon = progress.reputationPoints >= progress.reputationTarget
    || progress.grossRevenueCents >= progress.revenueTargetCents
    || progress.completedMajorProjects >= progress.requiredMajorProjects;
  if (hasWon) return { ...progress, status: 'WON', consecutiveNegativeTicks };
  if (consecutiveNegativeTicks >= progress.insolvencyAfterNegativeTicks) {
    return { ...progress, status: 'INSOLVENT', consecutiveNegativeTicks };
  }
  if (consecutiveNegativeTicks >= progress.warningAfterNegativeTicks) {
    return { ...progress, status: 'INSOLVENCY_WARNING', consecutiveNegativeTicks };
  }
  return { ...progress, status: 'ACTIVE', consecutiveNegativeTicks };
}
