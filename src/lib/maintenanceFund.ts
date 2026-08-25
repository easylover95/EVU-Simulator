import { loadJson, saveJson } from '@/lib/storage';

export const MAINTENANCE_FUND_KEY = 'evu-maintenance-fund';
export const MAINTENANCE_FUND_TARGET_DAYS = 5;

export type MaintenanceFundMovementKind = 'einzahlung' | 'schadendeckung' | 'auszahlung';

export interface MaintenanceFundMovement {
  id: string;
  tick: number;
  kind: MaintenanceFundMovementKind;
  amount: number;
  label: string;
}

export interface MaintenanceFundState {
  balance: number;
  movements: MaintenanceFundMovement[];
}

export interface FundCoverage {
  state: MaintenanceFundState;
  covered: number;
  cashDue: number;
}

const EMPTY_FUND: MaintenanceFundState = { balance: 0, movements: [] };

function safeAmount(value: unknown): number {
  const amount = Math.round(Number(value) || 0);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function normalizeMovement(value: unknown): MaintenanceFundMovement | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<MaintenanceFundMovement>;
  const amount = safeAmount(raw.amount);
  if (!amount || !raw.kind || !raw.label) return null;
  if (raw.kind !== 'einzahlung' && raw.kind !== 'schadendeckung' && raw.kind !== 'auszahlung') return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `fund-${raw.tick ?? 0}-${raw.kind}`,
    tick: Math.max(0, Math.round(Number(raw.tick) || 0)),
    kind: raw.kind,
    amount,
    label: raw.label,
  };
}

export function loadMaintenanceFund(): MaintenanceFundState {
  const saved = loadJson<Partial<MaintenanceFundState> | null>(MAINTENANCE_FUND_KEY, null);
  if (!saved) return { ...EMPTY_FUND };
  return {
    balance: safeAmount(saved.balance),
    movements: Array.isArray(saved.movements)
      ? saved.movements.map(normalizeMovement).filter((entry): entry is MaintenanceFundMovement => entry != null).slice(0, 40)
      : [],
  };
}

export function saveMaintenanceFund(state: MaintenanceFundState): void {
  saveJson(MAINTENANCE_FUND_KEY, {
    balance: safeAmount(state.balance),
    movements: state.movements.slice(0, 40),
  });
}

function addMovement(
  state: MaintenanceFundState,
  movement: Omit<MaintenanceFundMovement, 'id'>,
): MaintenanceFundState {
  const id = `fund-${movement.tick}-${movement.kind}-${state.movements.length + 1}`;
  return { ...state, movements: [{ ...movement, id }, ...state.movements].slice(0, 40) };
}

export function depositMaintenanceFund(state: MaintenanceFundState, amount: number, tick: number): MaintenanceFundState {
  const deposited = safeAmount(amount);
  if (!deposited) return state;
  return addMovement(
    { ...state, balance: state.balance + deposited },
    { tick, kind: 'einzahlung', amount: deposited, label: 'Zuführung aus Betriebsmitteln' },
  );
}

export function withdrawMaintenanceFund(state: MaintenanceFundState, amount: number, tick: number): MaintenanceFundState {
  const withdrawn = Math.min(safeAmount(amount), state.balance);
  if (!withdrawn) return state;
  return addMovement(
    { ...state, balance: state.balance - withdrawn },
    { tick, kind: 'auszahlung', amount: withdrawn, label: 'Freigabe in Betriebsmittel' },
  );
}

/** Deckt außerplanmäßige Reparaturen zuerst aus der gebundenen Risikovorsorge. */
export function coverRepairFromMaintenanceFund(
  state: MaintenanceFundState,
  repairCost: number,
  tick: number,
): FundCoverage {
  const total = safeAmount(repairCost);
  const covered = Math.min(state.balance, total);
  if (!covered) return { state, covered: 0, cashDue: total };
  const next = addMovement(
    { ...state, balance: state.balance - covered },
    { tick, kind: 'schadendeckung', amount: covered, label: 'Deckung außerplanmäßiger Lokreparatur' },
  );
  return { state: next, covered, cashDue: total - covered };
}

export function maintenanceFundTarget(dailyFixedCosts: number): number {
  return Math.max(15_000, Math.round(Math.max(0, dailyFixedCosts) * MAINTENANCE_FUND_TARGET_DAYS));
}
