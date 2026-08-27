import { createGameplayEventEngine, createTerminalGameProgress, createTerminalOperationalState } from '@/lib/terminalGameplay';
import type { Terminal } from '@/lib/terminalEntities';
import { CAMPAIGN_SCENARIOS, TERMINAL_UPGRADE_CATALOG, type CampaignScenarioId, type Specialist, type TerminalUpgrade } from '@/lib/terminalTycoon';
import type { TerminalSimulationSnapshot } from '@/state/terminalSimulationStore';

function scenarioById(scenarioId: CampaignScenarioId) {
  const scenario = CAMPAIGN_SCENARIOS.find((candidate) => candidate.id === scenarioId);
  if (!scenario) throw new Error(`Unbekanntes Szenario: ${scenarioId}`);
  return scenario;
}

function baseUpgrades(terminalId: string, completedDefinitionIds: readonly string[]): Record<string, TerminalUpgrade> {
  return Object.fromEntries(TERMINAL_UPGRADE_CATALOG.map((definition) => {
    const completed = completedDefinitionIds.includes(definition.id);
    const upgrade: TerminalUpgrade = {
      id: `upgrade-${terminalId}-${definition.id}`,
      terminalId,
      definitionId: definition.id,
      status: completed ? 'COMPLETED' : definition.requiredUpgradeIds.length === 0 ? 'AVAILABLE' : 'LOCKED',
      startedTick: null,
      completedTick: completed ? 0 : null,
    };
    return [upgrade.id, upgrade];
  }));
}

function specialists(terminalId: string, roles: Specialist['role'][]): Record<string, Specialist> {
  return Object.fromEntries(roles.map((role, index) => {
    const specialist: Specialist = {
      id: `specialist-${terminalId}-${role.toLowerCase()}`,
      terminalId,
      role,
      name: [
        'Mara Kessler',
        'Jonas Albrecht',
        'Aylin Demir',
      ][index] ?? `Fachkraft ${index + 1}`,
      status: 'EMPLOYED',
      upkeepCentsPerTick: role === 'CRANE_OPERATOR' ? 7_500 : role === 'WAGON_MASTER' ? 6_500 : 9_000,
      hiredTick: 0,
    };
    return [specialist.id, specialist];
  }));
}

/**
 * Produces a complete serializable snapshot. Selecting a scenario is a clean
 * new campaign operation; loading an existing save remains a separate action.
 */
export function createScenarioSnapshot(scenarioId: CampaignScenarioId): TerminalSimulationSnapshot {
  const scenario = scenarioById(scenarioId);
  const isDuisburg = scenario.id === 'DUISBURG_HARBOR';
  const terminal: Terminal = isDuisburg
    ? {
      id: 'terminal-duisburg-grosshafen',
      name: 'Duisburger Großhafen · Schwerlastterminal',
      trackLengthMeters: 300,
      maxCraneCapacityTons: 250,
      storageAreaSqm: 2_600,
      currentStorageUsedSqm: 0,
      hasSpecialCrane: true,
    }
    : {
      id: 'terminal-havel-regional',
      name: 'Regional-Terminal Havel',
      trackLengthMeters: 100,
      maxCraneCapacityTons: 80,
      storageAreaSqm: 350,
      currentStorageUsedSqm: 0,
      hasSpecialCrane: false,
    };
  const completedDefinitions = isDuisburg
    ? ['heavy-lift-crane', 'storage-zone-north', 'siding-track-east', 'lue-clearance-desk']
    : [];

  return {
    currentTick: 0,
    companyBalanceCents: scenario.startingBalanceCents,
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
    gameplayEventEngine: createGameplayEventEngine(scenario.randomSeed),
    operationalState: createTerminalOperationalState(),
    majorProjectsById: {},
    gameProgress: createTerminalGameProgress({
      reputationPoints: scenario.startingReputation,
      reputationTarget: scenario.reputationTarget,
      grossRevenueCents: 0,
      revenueTargetCents: scenario.revenueTargetCents,
      completedMajorProjects: 0,
      requiredMajorProjects: scenario.requiredMajorProjects,
      warningAfterNegativeTicks: scenario.warningAfterNegativeTicks,
      insolvencyAfterNegativeTicks: scenario.insolvencyAfterNegativeTicks,
    }),
    activeScenarioId: scenario.id,
    terminalUpgradesById: baseUpgrades(terminal.id, completedDefinitions),
    specialistsById: isDuisburg
      ? specialists(terminal.id, ['CRANE_OPERATOR', 'WAGON_MASTER', 'LUE_INSPECTOR'])
      : {},
    staffChargesById: {},
    persistence: { status: 'IDLE', lastSavedAt: null, errorMessage: null },
    eventLog: [],
  };
}
