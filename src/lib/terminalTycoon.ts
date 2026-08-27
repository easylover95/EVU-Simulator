import type { TerminalId } from '@/lib/terminalEntities';

export type TerminalUpgradeKind =
  | 'HEAVY_LIFT_CRANE'
  | 'STORAGE_ZONE'
  | 'SIDING_TRACK'
  | 'LUE_CLEARANCE_DESK';

export type TerminalUpgradeStatus = 'LOCKED' | 'AVAILABLE' | 'BUILDING' | 'COMPLETED';

/**
 * Catalog record for the later `terminal_upgrade_definitions` table. Effects
 * are declarative so terminal capacities are always derived, never hand-edited.
 */
export interface TerminalUpgradeDefinition {
  id: string;
  kind: TerminalUpgradeKind;
  name: string;
  description: string;
  capitalCostCents: number;
  constructionTicks: number;
  requiredUpgradeIds: string[];
  effects: {
    craneCapacityDeltaTons?: number;
    storageAreaDeltaSqm?: number;
    trackLengthDeltaMeters?: number;
    enablesSpecialCrane?: boolean;
    unlocksOutOfGaugeContracts?: boolean;
  };
}

/**
 * Relational target: `terminal_upgrades`, linked by `terminal_id` and
 * `upgrade_definition_id`. A single terminal can hold one instance per upgrade.
 */
export interface TerminalUpgrade {
  id: string;
  terminalId: TerminalId;
  definitionId: string;
  status: TerminalUpgradeStatus;
  startedTick: number | null;
  completedTick: number | null;
}

export type SpecialistRole = 'CRANE_OPERATOR' | 'WAGON_MASTER' | 'LUE_INSPECTOR';
export type SpecialistStatus = 'CANDIDATE' | 'EMPLOYED' | 'ON_LEAVE';

/**
 * Relational target: `specialists`; upkeep is debited only while status is
 * `EMPLOYED`. Effect fields remain declarative and composable per terminal.
 */
export interface Specialist {
  id: string;
  terminalId: TerminalId;
  role: SpecialistRole;
  name: string;
  status: SpecialistStatus;
  upkeepCentsPerTick: number;
  hiredTick: number | null;
}

export interface SpecialistDefinition {
  role: SpecialistRole;
  title: string;
  description: string;
  upkeepCentsPerTick: number;
  effects: {
    craneThroughputBonusPercent?: number;
    trainErrorRiskReductionPercent?: number;
    enablesOutOfGaugeDispatch?: boolean;
  };
}

export interface TerminalStaffEffects {
  upkeepCentsPerTick: number;
  craneThroughputBonusPercent: number;
  trainErrorRiskReductionPercent: number;
  allowsOutOfGaugeDispatch: boolean;
}

export type CampaignScenarioId = 'REGIONAL_TERMINAL' | 'DUISBURG_HARBOR';

/**
 * Campaign configuration; `snapshot` creation lives in `terminalScenarios.ts`
 * to avoid coupling this pure catalog to Zustand or browser persistence.
 */
export interface CampaignScenario {
  id: CampaignScenarioId;
  title: string;
  subtitle: string;
  difficulty: 'EINSTEIGER' | 'FORTGESCHRITTEN';
  briefing: string;
  victoryDescription: string;
  lossDescription: string;
  startingBalanceCents: number;
  startingReputation: number;
  reputationTarget: number;
  revenueTargetCents: number;
  requiredMajorProjects: number;
  warningAfterNegativeTicks: number;
  insolvencyAfterNegativeTicks: number;
  randomSeed: number;
}

export const TERMINAL_UPGRADE_CATALOG: readonly TerminalUpgradeDefinition[] = [
  {
    id: 'heavy-lift-crane',
    kind: 'HEAVY_LIFT_CRANE',
    name: 'Schwerlastkran 250 t',
    description: 'Ersetzt den Standardumschlag durch einen Kran für schwere und LÜ-relevante Bauteile.',
    capitalCostCents: 4_800_000,
    constructionTicks: 8,
    requiredUpgradeIds: [],
    effects: { craneCapacityDeltaTons: 170, enablesSpecialCrane: true, unlocksOutOfGaugeContracts: true },
  },
  {
    id: 'storage-zone-north',
    kind: 'STORAGE_ZONE',
    name: 'Lagerzone Nord',
    description: 'Erschließt zusätzliche befestigte Stellfläche für Baugleismaterial und Schwerlastteile.',
    capitalCostCents: 1_250_000,
    constructionTicks: 5,
    requiredUpgradeIds: [],
    effects: { storageAreaDeltaSqm: 600 },
  },
  {
    id: 'siding-track-east',
    kind: 'SIDING_TRACK',
    name: 'Abstellgleis Ost',
    description: 'Verlängert die verfügbare Zugbildungskapazität für Baugleiszüge.',
    capitalCostCents: 2_100_000,
    constructionTicks: 6,
    requiredUpgradeIds: ['storage-zone-north'],
    effects: { trackLengthDeltaMeters: 120 },
  },
  {
    id: 'lue-clearance-desk',
    kind: 'LUE_CLEARANCE_DESK',
    name: 'LÜ-Prüfstelle',
    description: 'Schafft einen standardisierten Prozess für anspruchsvolle Lademaßüberschreitungen.',
    capitalCostCents: 900_000,
    constructionTicks: 4,
    requiredUpgradeIds: ['heavy-lift-crane'],
    effects: { unlocksOutOfGaugeContracts: true },
  },
];

export const SPECIALIST_CATALOG: readonly SpecialistDefinition[] = [
  {
    role: 'CRANE_OPERATOR',
    title: 'Kranführer',
    description: 'Erhöht die planbare Umschlagleistung und stabilisiert schwere Hebevorgänge.',
    upkeepCentsPerTick: 7_500,
    effects: { craneThroughputBonusPercent: 20 },
  },
  {
    role: 'WAGON_MASTER',
    title: 'Wagenmeister',
    description: 'Reduziert Fehlerrisiken in der Zugbildung und bei der technischen Übergabe.',
    upkeepCentsPerTick: 6_500,
    effects: { trainErrorRiskReductionPercent: 30 },
  },
  {
    role: 'LUE_INSPECTOR',
    title: 'LÜ-Prüfer',
    description: 'Erlaubt die fachliche Prüfung anspruchsvoller Lademaßüberschreitungen vor der Abfahrt.',
    upkeepCentsPerTick: 9_000,
    effects: { enablesOutOfGaugeDispatch: true, trainErrorRiskReductionPercent: 15 },
  },
];

export const CAMPAIGN_SCENARIOS: readonly CampaignScenario[] = [
  {
    id: 'REGIONAL_TERMINAL',
    title: 'Das kleine Regional-Terminal',
    subtitle: 'Wenig Kapital, begrenzte Technik, klare erste Ausbauschritte.',
    difficulty: 'EINSTEIGER',
    briefing: 'Baue aus einem lokalen Umschlagplatz ein verlässliches Baugleis-Terminal auf. Investitionen müssen eng getaktet werden.',
    victoryDescription: 'Gewinn durch 2.000.000 € Umsatz, 2 Großprojekte oder 80 Reputationspunkte.',
    lossDescription: 'Nach 10 aufeinanderfolgenden Stunden negativer Liquidität ist das Terminal insolvent.',
    startingBalanceCents: 3_500_000,
    startingReputation: 8,
    reputationTarget: 80,
    revenueTargetCents: 200_000_000,
    requiredMajorProjects: 2,
    warningAfterNegativeTicks: 3,
    insolvencyAfterNegativeTicks: 10,
    randomSeed: 11,
  },
  {
    id: 'DUISBURG_HARBOR',
    title: 'Der Duisburger Großhafen',
    subtitle: 'Hohe Kapazität und starke Verträge – aber teure Spezialisten und knappe Zeitfenster.',
    difficulty: 'FORTGESCHRITTEN',
    briefing: 'Übernimm ein leistungsfähiges Schwerlastterminal mit ambitionierten Infrastrukturverträgen und hohen laufenden Verpflichtungen.',
    victoryDescription: 'Gewinn durch 8.000.000 € Umsatz, 3 Großprojekte oder 140 Reputationspunkte.',
    lossDescription: 'Nach 8 aufeinanderfolgenden Stunden negativer Liquidität ist der Betrieb insolvent.',
    startingBalanceCents: 12_000_000,
    startingReputation: 28,
    reputationTarget: 140,
    revenueTargetCents: 800_000_000,
    requiredMajorProjects: 3,
    warningAfterNegativeTicks: 2,
    insolvencyAfterNegativeTicks: 8,
    randomSeed: 47,
  },
];

export function getUpgradeDefinition(definitionId: string): TerminalUpgradeDefinition | null {
  return TERMINAL_UPGRADE_CATALOG.find((upgrade) => upgrade.id === definitionId) ?? null;
}

export function getSpecialistDefinition(role: SpecialistRole): SpecialistDefinition {
  const definition = SPECIALIST_CATALOG.find((candidate) => candidate.role === role);
  if (!definition) throw new Error(`Unbekannte Spezialistenrolle: ${role}`);
  return definition;
}

export function calculateTerminalStaffEffects(specialists: Iterable<Specialist>): TerminalStaffEffects {
  const effects: TerminalStaffEffects = {
    upkeepCentsPerTick: 0,
    craneThroughputBonusPercent: 0,
    trainErrorRiskReductionPercent: 0,
    allowsOutOfGaugeDispatch: false,
  };
  for (const specialist of specialists) {
    if (specialist.status !== 'EMPLOYED') continue;
    const definition = getSpecialistDefinition(specialist.role);
    effects.upkeepCentsPerTick += specialist.upkeepCentsPerTick;
    effects.craneThroughputBonusPercent += definition.effects.craneThroughputBonusPercent ?? 0;
    effects.trainErrorRiskReductionPercent += definition.effects.trainErrorRiskReductionPercent ?? 0;
    effects.allowsOutOfGaugeDispatch ||= definition.effects.enablesOutOfGaugeDispatch === true;
  }
  return effects;
}

export function completedUpgradeIds(upgrades: Iterable<TerminalUpgrade>, terminalId: TerminalId): Set<string> {
  return new Set(
    [...upgrades]
      .filter((upgrade) => upgrade.terminalId === terminalId && upgrade.status === 'COMPLETED')
      .map((upgrade) => upgrade.definitionId),
  );
}
