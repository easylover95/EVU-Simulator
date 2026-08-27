import type { CargoCategory, CargoType, Train, Wagon } from '@/lib/terminalEntities';
import type { TerminalSimulationEvent, TerminalSimulationSnapshot } from '@/state/terminalSimulationStore';

export type AnalyticsExpenseCategory = 'PERSONAL' | 'AUSBAU' | 'LIEGEGEBUEHR' | 'EREIGNISSTRAFE';

export interface AnalyticsTick {
  tick: number;
  revenueCents: number;
  expenseCents: number;
  operatingResultCents: number;
  expensesByCategory: Record<AnalyticsExpenseCategory, number>;
}

export interface ContributionRow {
  id: string;
  label: string;
  revenueCents: number;
  allocatedExpenseCents: number;
  contributionMarginCents: number;
  marginPercent: number | null;
  throughputTons: number;
  completedUnits: number;
}

export interface TerminalAnalytics {
  ticks: AnalyticsTick[];
  totals: {
    revenueCents: number;
    expenseCents: number;
    operatingResultCents: number;
    expensesByCategory: Record<AnalyticsExpenseCategory, number>;
    completedProjectCount: number;
    throughputTons: number;
  };
  trainContribution: ContributionRow[];
  cargoContribution: ContributionRow[];
  trackContribution: ContributionRow[];
}

const EMPTY_EXPENSES: Record<AnalyticsExpenseCategory, number> = {
  PERSONAL: 0,
  AUSBAU: 0,
  LIEGEGEBUEHR: 0,
  EREIGNISSTRAFE: 0,
};

function emptyExpenses(): Record<AnalyticsExpenseCategory, number> {
  return { ...EMPTY_EXPENSES };
}

type ContributionInput = Omit<ContributionRow, 'allocatedExpenseCents' | 'contributionMarginCents' | 'marginPercent'>;

function addToMap(map: Map<string, ContributionRow>, update: ContributionInput): void {
  const existing = map.get(update.id);
  if (existing) {
    existing.revenueCents += update.revenueCents;
    existing.throughputTons += update.throughputTons;
    existing.completedUnits += update.completedUnits;
    return;
  }
  map.set(update.id, { ...update, allocatedExpenseCents: 0, contributionMarginCents: 0, marginPercent: null });
}

function applyAllocatedExpenses(rows: Iterable<ContributionRow>, totalExpenseCents: number): ContributionRow[] {
  const result = [...rows];
  const totalRevenue = result.reduce((sum, row) => sum + row.revenueCents, 0);
  return result
    .map((row) => {
      const allocatedExpenseCents = totalRevenue > 0
        ? Math.round((row.revenueCents / totalRevenue) * totalExpenseCents)
        : 0;
      const contributionMarginCents = row.revenueCents - allocatedExpenseCents;
      return {
        ...row,
        allocatedExpenseCents,
        contributionMarginCents,
        marginPercent: row.revenueCents > 0 ? contributionMarginCents / row.revenueCents : null,
      };
    })
    .sort((left, right) => right.contributionMarginCents - left.contributionMarginCents || right.revenueCents - left.revenueCents);
}

function trainLabel(train: Train | undefined, projectLabel: string): string {
  return train ? `${train.destinationConstructionSite}` : projectLabel;
}

function eventExpenseCategory(event: TerminalSimulationEvent): AnalyticsExpenseCategory | null {
  if (event.type === 'STAFF_COST_BOOKED') return 'PERSONAL';
  if (event.type === 'UPGRADE_STARTED') return 'AUSBAU';
  if (event.type === 'BERTH_FEE_BOOKED') return 'LIEGEGEBUEHR';
  if (event.type === 'GAMEPLAY_EVENT_RESOLVED' && (event.amountCents ?? 0) < 0) return 'EREIGNISSTRAFE';
  return null;
}

/**
 * Creates a fast, side-effect-free report from the canonical simulation ledger.
 * It never reads wall-clock time, mutates the store or infers unrecorded revenue.
 */
export function buildTerminalAnalytics(
  snapshot: TerminalSimulationSnapshot,
  maximumTicks = 48,
): TerminalAnalytics {
  const relevantEvents = snapshot.eventLog
    .filter((event) => event.tick >= Math.max(0, snapshot.currentTick - maximumTicks + 1))
    .sort((left, right) => left.tick - right.tick || left.id.localeCompare(right.id));
  const firstTick = relevantEvents.length > 0
    ? relevantEvents[0].tick
    : Math.max(0, snapshot.currentTick - maximumTicks + 1);
  const ticksByNumber = new Map<number, AnalyticsTick>();
  for (let tick = firstTick; tick <= snapshot.currentTick; tick += 1) {
    ticksByNumber.set(tick, {
      tick,
      revenueCents: 0,
      expenseCents: 0,
      operatingResultCents: 0,
      expensesByCategory: emptyExpenses(),
    });
  }

  for (const event of relevantEvents) {
    const line = ticksByNumber.get(event.tick);
    if (!line) continue;
    if (event.type === 'MAJOR_PROJECT_COMPLETED') {
      line.revenueCents += Math.max(0, event.amountCents ?? 0);
      continue;
    }
    const category = eventExpenseCategory(event);
    if (!category) continue;
    const amount = Math.abs(event.amountCents ?? 0);
    line.expenseCents += amount;
    line.expensesByCategory[category] += amount;
  }

  const ticks = [...ticksByNumber.values()].map((line) => ({
    ...line,
    operatingResultCents: line.revenueCents - line.expenseCents,
  }));
  const totals = ticks.reduce<TerminalAnalytics['totals']>((current, line) => ({
    revenueCents: current.revenueCents + line.revenueCents,
    expenseCents: current.expenseCents + line.expenseCents,
    operatingResultCents: current.operatingResultCents + line.operatingResultCents,
    expensesByCategory: {
      PERSONAL: current.expensesByCategory.PERSONAL + line.expensesByCategory.PERSONAL,
      AUSBAU: current.expensesByCategory.AUSBAU + line.expensesByCategory.AUSBAU,
      LIEGEGEBUEHR: current.expensesByCategory.LIEGEGEBUEHR + line.expensesByCategory.LIEGEGEBUEHR,
      EREIGNISSTRAFE: current.expensesByCategory.EREIGNISSTRAFE + line.expensesByCategory.EREIGNISSTRAFE,
    },
    completedProjectCount: current.completedProjectCount,
    throughputTons: current.throughputTons,
  }), {
    revenueCents: 0,
    expenseCents: 0,
    operatingResultCents: 0,
    expensesByCategory: emptyExpenses(),
    completedProjectCount: 0,
    throughputTons: 0,
  });

  const trainRows = new Map<string, ContributionRow>();
  const cargoRows = new Map<string, ContributionRow>();
  const trackRows = new Map<string, ContributionRow>();
  const cargoById = snapshot.cargoUnitsById;
  const cargoTypesById = snapshot.cargoTypesById;
  const wagonsById = snapshot.wagonsById;
  const projects = Object.values(snapshot.majorProjectsById).filter((project) => project.status === 'COMPLETED');

  for (const project of projects) {
    const train = snapshot.trainsById[project.trainId];
    const wagons = Object.values(wagonsById).filter((wagon) => wagon.currentTrainId === project.trainId);
    const wagonIds = new Set(wagons.map((wagon) => wagon.id));
    const loads = snapshot.wagonLoads.filter((load) => wagonIds.has(load.wagonId));
    const cargoEntries = loads.flatMap((load) => {
      const cargoUnit = cargoById[load.cargoUnitId];
      const cargoType = cargoTypesById[load.cargoTypeId];
      return cargoUnit && cargoType ? [{ cargoUnit, cargoType }] : [];
    });
    const throughputTons = cargoEntries.reduce((sum, entry) => sum + entry.cargoType.weightTons, 0);
    totals.completedProjectCount += 1;
    totals.throughputTons += throughputTons;

    addToMap(trainRows, {
      id: project.trainId,
      label: trainLabel(train, project.label),
      revenueCents: project.rewardCents,
      throughputTons,
      completedUnits: 1,
    });
    const terminal = train ? snapshot.terminalsById[train.terminalId] : undefined;
    if (terminal) {
      addToMap(trackRows, {
        id: terminal.id,
        label: `${terminal.name} · Zugbildungsgleis`,
        revenueCents: project.rewardCents,
        throughputTons,
        completedUnits: 1,
      });
    }

    const shareBase = throughputTons > 0 ? throughputTons : cargoEntries.length;
    for (const entry of cargoEntries) {
      const share = throughputTons > 0 ? entry.cargoType.weightTons / shareBase : 1 / Math.max(1, cargoEntries.length);
      addToMap(cargoRows, {
        id: entry.cargoType.id,
        label: entry.cargoType.name,
        revenueCents: Math.round(project.rewardCents * share),
        throughputTons: entry.cargoType.weightTons,
        completedUnits: 1,
      });
    }
  }

  return {
    ticks,
    totals,
    trainContribution: applyAllocatedExpenses(trainRows.values(), totals.expenseCents),
    cargoContribution: applyAllocatedExpenses(cargoRows.values(), totals.expenseCents),
    trackContribution: applyAllocatedExpenses(trackRows.values(), totals.expenseCents),
  };
}

export function cargoCategoryLabel(category: CargoCategory): string {
  const labels: Record<CargoCategory, string> = {
    TRACK_BALLAST: 'Gleisschotter',
    TRACK_SLEEPERS: 'Betonschwellen',
    RAIL_SECTION: 'Schienenprofile',
    BRIDGE_SECTION: 'Brückenteile',
    TURBINE_COMPONENT: 'Turbinenteile',
    TRANSFORMER_HOUSING: 'Trafogehäuse',
    OTHER_HEAVY_CARGO: 'Sonstige Schwerlast',
  };
  return labels[category];
}

export function wagonTrackLabel(wagon: Wagon): string {
  return `${wagon.uicWagonType} · ${wagon.lengthOverBuffersMeters.toLocaleString('de-DE', { maximumFractionDigits: 1 })} m`;
}
