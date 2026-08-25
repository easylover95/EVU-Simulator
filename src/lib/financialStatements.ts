import type { Company, Locomotive, Wagon } from '@/lib/supabase';
import { MAX_LOAN_PRINCIPAL, summarizePnl, type BankState, type PnlSummary } from '@/lib/bank';
import { offerForLoco, wagonOfferByTypeCode, type DealerState } from '@/lib/dealer';
import { TICKS_PER_DAY } from '@/lib/storage';

export interface StatementLine {
  id: string;
  label: string;
  amount: number;
  tone?: 'positive' | 'negative' | 'neutral' | 'warning';
}

export interface BalanceSheet {
  assets: StatementLine[];
  liabilities: StatementLine[];
  assetsTotal: number;
  liabilitiesTotal: number;
  equity: number;
  difference: number;
  cash: number;
  overdraft: number;
  fleetBookValue: number;
  loanPrincipal: number;
}

export interface FinanceSnapshot {
  pnl: PnlSummary;
  balanceSheet: BalanceSheet;
  liquidity: number;
  operatingResult: number;
  outstandingDebt: number;
  freeCreditRoom: number;
  dailyDebtService: number;
  debtToFleetRatio: number | null;
}

function safeAmount(value: number | null | undefined): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function leasedIds(dealer: DealerState | null | undefined, kind: 'loco' | 'wagon'): Set<string> {
  return new Set((dealer?.leases ?? []).filter((lease) => lease.kind === kind).map((lease) => lease.assetId));
}

/**
 * Management book value, not a statutory valuation: owned fleet is valued from the dealer catalogue,
 * adjusted by the live maintenance condition when available. Leased assets are intentionally excluded.
 */
export function fleetBookValue(
  locomotives: Locomotive[] | null | undefined,
  wagons: Wagon[] | null | undefined,
  dealer: DealerState | null | undefined,
): number {
  const leasedLocos = leasedIds(dealer, 'loco');
  const leasedWagons = leasedIds(dealer, 'wagon');
  const locoValue = (locomotives ?? []).reduce((sum, loco) => {
    if (leasedLocos.has(loco.id)) return sum;
    const offer = offerForLoco(loco);
    const purchase = safeAmount(loco.purchase_price) || safeAmount(offer?.buyPrice);
    const condition = Math.max(0, Math.min(100, safeAmount(loco.maintenance?.conditionPct) || 100));
    const conditionFactor = 0.45 + condition / 100 * 0.55;
    return sum + Math.round(purchase * conditionFactor);
  }, 0);
  const wagonValue = (wagons ?? []).reduce((sum, wagon) => {
    if (leasedWagons.has(wagon.id)) return sum;
    const catalog = safeAmount(wagonOfferByTypeCode(wagon.type_code)?.listUnitPrice);
    return sum + Math.round(catalog * Math.max(0, safeAmount(wagon.count)));
  }, 0);
  return locoValue + wagonValue;
}

export function activeLoanPrincipal(bank: BankState | null | undefined): number {
  return (bank?.loans ?? []).reduce((sum, loan) => sum + Math.max(0, safeAmount(loan.principalRemaining)), 0);
}

export function computeBalanceSheet(input: {
  company: Company | null;
  bank: BankState | null | undefined;
  locomotives?: Locomotive[] | null;
  wagons?: Wagon[] | null;
  dealer?: DealerState | null;
}): BalanceSheet {
  const cashBalance = safeAmount(input.company?.balance);
  const cash = Math.max(0, cashBalance);
  const overdraft = Math.max(0, -cashBalance);
  const fleet = fleetBookValue(input.locomotives, input.wagons, input.dealer);
  const loanPrincipal = activeLoanPrincipal(input.bank);
  const assets: StatementLine[] = [
    { id: 'cash', label: 'Liquide Mittel', amount: cash, tone: 'positive' },
    { id: 'fleet', label: 'Sachanlagen · Fuhrpark', amount: fleet, tone: 'neutral' },
  ];
  const liabilities: StatementLine[] = [
    { id: 'overdraft', label: 'Kurzfristig · Dispo', amount: overdraft, tone: overdraft > 0 ? 'warning' : 'neutral' },
    { id: 'loans', label: 'Langfristig · Kreditrestschuld', amount: loanPrincipal, tone: loanPrincipal > 0 ? 'negative' : 'neutral' },
  ];
  const assetsTotal = assets.reduce((sum, row) => sum + row.amount, 0);
  const liabilitiesTotal = liabilities.reduce((sum, row) => sum + row.amount, 0);
  const equity = assetsTotal - liabilitiesTotal;
  const difference = assetsTotal - liabilitiesTotal - equity;
  return {
    assets,
    liabilities,
    assetsTotal,
    liabilitiesTotal,
    equity,
    difference,
    cash,
    overdraft,
    fleetBookValue: fleet,
    loanPrincipal,
  };
}

export function computeFinanceSnapshot(input: {
  company: Company | null;
  bank: BankState | null | undefined;
  locomotives?: Locomotive[] | null;
  wagons?: Wagon[] | null;
  dealer?: DealerState | null;
  periodDays?: number;
}): FinanceSnapshot {
  const tick = Math.max(0, Math.round(safeAmount(input.company?.tick)));
  const periodDays = Math.max(1, Math.round(input.periodDays ?? 30));
  const pnl = summarizePnl(input.bank?.bookings ?? [], Math.max(0, tick - periodDays * TICKS_PER_DAY), tick);
  const balanceSheet = computeBalanceSheet(input);
  const usedDebt = balanceSheet.overdraft + balanceSheet.loanPrincipal;
  const freeRevolver = Math.max(0, safeAmount(input.bank?.overdraftLimit) - balanceSheet.overdraft);
  const freeLoanRoom = Math.max(0, MAX_LOAN_PRINCIPAL - balanceSheet.loanPrincipal);
  const dailyDebtService = (input.bank?.loans ?? []).reduce(
    (sum, loan) => sum + Math.min(Math.max(0, safeAmount(loan.dailyPayment)), Math.max(0, safeAmount(loan.remaining))),
    0,
  );
  const operatingResult = pnl.revenue + pnl.operating + pnl.leasing + pnl.personnel + pnl.depot + pnl.insurance + pnl.penalties + pnl.other;
  return {
    pnl,
    balanceSheet,
    liquidity: safeAmount(input.company?.balance),
    operatingResult,
    outstandingDebt: usedDebt,
    freeCreditRoom: freeRevolver + freeLoanRoom,
    dailyDebtService,
    debtToFleetRatio: balanceSheet.fleetBookValue > 0 ? usedDebt / balanceSheet.fleetBookValue : null,
  };
}
