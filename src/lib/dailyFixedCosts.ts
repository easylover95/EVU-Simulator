import type { Company, Locomotive, Wagon } from '@/lib/supabase';
import { INSURANCE_BASE_DAILY, INSURANCE_CATALOG, type BankLoan, type BankState, type InsuranceId } from '@/lib/bank';
import type { LeaseContract } from '@/lib/dealer';
import type { StaffMeta } from '@/lib/jobcenter';
import { isNewGameDay } from '@/lib/storage';

/** Mirrors processLeasesTick / processPayrollTick / processBankTick / processDepotTick — display only. */

/** Standort-/Hallenmiete, unabhängig von der Auslastung. */
export const HALL_RENT_DAILY = 2850;
/** Gleismiete / Standgeld for locos not in Einsatz (15–30 € band). */
export const IDLE_LOCO_STANDING_DAILY = 26;
/** Gleismiete / Standgeld per idle wagon unit. */
export const IDLE_WAGON_STANDING_DAILY = 18;

export interface DailyFixedCostLine {
  id: string;
  label: string;
  amount: number;
  detail?: string;
}

export interface DailyFixedCosts {
  leasingLoco: number;
  leasingWagon: number;
  leasing: number;
  overdraftInterest: number;
  loanInstallments: number;
  insurance: number;
  bank: number;
  personnel: number;
  depot: number;
  total: number;
  leaseLines: DailyFixedCostLine[];
  loanLines: DailyFixedCostLine[];
  insuranceLines: DailyFixedCostLine[];
  depotLines: DailyFixedCostLine[];
  staffCount: number;
  locoCount: number;
  wagonCount: number;
  idleLocoCount: number;
  idleWagonCount: number;
}

export function previewOverdraftInterest(balance: number, dailyRate: number): number {
  if (balance >= 0) return 0;
  return Math.max(1, Math.round(Math.abs(balance) * dailyRate));
}

export function previewLoanInstallment(loan: BankLoan): number {
  return Math.min(loan.dailyPayment, loan.remaining);
}

export function previewPayrollDaily(meta: Record<string, StaffMeta> | null | undefined): number {
  if (!meta || typeof meta !== 'object') return 0;
  return Object.values(meta).reduce((sum, entry) => {
    if (!entry || typeof entry !== 'object') return sum;
    const salary = Number(entry.salary);
    if (!Number.isFinite(salary) || salary <= 0) return sum;
    return sum + Math.round(salary / 30);
  }, 0);
}

export function isIdleLoco(loco: Pick<Locomotive, 'status'>): boolean {
  return loco.status !== 'einsatz';
}

export function isIdleWagon(wagon: Pick<Wagon, 'status'>): boolean {
  return wagon.status !== 'im_einsatz';
}

export function idleLocoCount(locos: Locomotive[] | null | undefined): number {
  if (!Array.isArray(locos)) return 0;
  return locos.filter(isIdleLoco).length;
}

export function idleWagonUnits(wagons: Wagon[] | null | undefined): number {
  if (!Array.isArray(wagons)) return 0;
  return wagons.filter(isIdleWagon).reduce((s, w) => s + (Number(w.count) || 0), 0);
}

export function previewDepotDaily(locos: Locomotive[] | null | undefined, wagons: Wagon[] | null | undefined): {
  hall: number;
  idleLocos: number;
  idleWagons: number;
  idleLocoCount: number;
  idleWagonCount: number;
  total: number;
} {
  const idleLocoN = idleLocoCount(locos);
  const idleWagonN = idleWagonUnits(wagons);
  const hall = HALL_RENT_DAILY;
  const idleLocos = idleLocoN * IDLE_LOCO_STANDING_DAILY;
  const idleWagons = idleWagonN * IDLE_WAGON_STANDING_DAILY;
  return {
    hall,
    idleLocos,
    idleWagons,
    idleLocoCount: idleLocoN,
    idleWagonCount: idleWagonN,
    total: hall + idleLocos + idleWagons,
  };
}

export function processDepotTick(
  company: Company,
  prevTick: number,
  nextTick: number,
  locos: Locomotive[] | null | undefined,
  wagons: Wagon[] | null | undefined,
): { company: Company; amount: number } {
  if (!isNewGameDay(prevTick, nextTick)) return { company, amount: 0 };
  const amount = previewDepotDaily(locos, wagons).total;
  if (amount <= 0) return { company, amount: 0 };
  return { company: { ...company, balance: company.balance - amount }, amount };
}

const EMPTY_DAILY_FIXED: DailyFixedCosts = {
  leasingLoco: 0,
  leasingWagon: 0,
  leasing: 0,
  overdraftInterest: 0,
  loanInstallments: 0,
  insurance: 0,
  bank: 0,
  personnel: 0,
  depot: 0,
  total: 0,
  leaseLines: [],
  loanLines: [],
  insuranceLines: [],
  depotLines: [],
  staffCount: 0,
  locoCount: 0,
  wagonCount: 0,
  idleLocoCount: 0,
  idleWagonCount: 0,
};

export function computeDailyFixedCosts(input: {
  company: Company | null;
  bank: BankState | null | undefined;
  leases: LeaseContract[] | null | undefined;
  staffMeta: Record<string, StaffMeta> | null | undefined;
  locomotives?: Locomotive[] | null;
  wagons?: Wagon[] | null;
}): DailyFixedCosts {
  try {
    const leases = Array.isArray(input.leases) ? input.leases.filter((lease) => lease && lease.dailyCost > 0) : [];
    const leaseLines: DailyFixedCostLine[] = leases.map((lease) => ({
      id: lease.id,
      label: lease.label,
      amount: Number(lease.dailyCost) || 0,
      detail: lease.kind === 'loco' ? 'Lok-Leasing' : 'Wagen-Leasing',
    }));
    const leasingLoco = leases.filter((l) => l.kind === 'loco').reduce((s, l) => s + (Number(l.dailyCost) || 0), 0);
    const leasingWagon = leases.filter((l) => l.kind === 'wagon').reduce((s, l) => s + (Number(l.dailyCost) || 0), 0);
    const leasing = leasingLoco + leasingWagon;

    const balance = Number(input.company?.balance) || 0;
    const bankState = input.bank;
    const overdraftInterest = previewOverdraftInterest(balance, Number(bankState?.overdraftDailyRate) || 0);
    const loans = Array.isArray(bankState?.loans) ? bankState!.loans.filter((loan) => loan && typeof loan === 'object') : [];
    const loanLines: DailyFixedCostLine[] = loans
      .map((loan) => ({
        id: loan.id,
        label: loan.interestLabel ?? 'Kredit',
        amount: previewLoanInstallment(loan),
        detail: 'Kredittilgung',
      }))
      .filter((line) => line.amount > 0);
    const loanInstallments = loanLines.reduce((s, l) => s + l.amount, 0);

    const insurances = bankState?.insurances ?? { gueterschaden: false, haftpflicht: false };
    const insuranceLines: DailyFixedCostLine[] = [
      {
        id: 'insurance-base',
        label: 'Versicherung Grundpauschale',
        amount: INSURANCE_BASE_DAILY,
      },
      ...(Object.keys(INSURANCE_CATALOG) as InsuranceId[])
        .filter((id) => insurances[id])
        .map((id) => ({
          id,
          label: `Versicherung ${INSURANCE_CATALOG[id].name}`,
          amount: INSURANCE_CATALOG[id].dailyCost,
        })),
    ];
    const insurance = insuranceLines.reduce((s, l) => s + l.amount, 0);

    const staffMeta = input.staffMeta && typeof input.staffMeta === 'object' ? input.staffMeta : {};
    const personnel = previewPayrollDaily(staffMeta);
    const staffCount = Object.values(staffMeta).filter((entry) => entry && typeof entry === 'object').length;
    const locoCount = Array.isArray(input.locomotives) ? input.locomotives.length : 0;
    const wagonCount = Array.isArray(input.wagons)
      ? input.wagons.reduce((s, w) => s + (Number(w?.count) || 0), 0)
      : 0;
    const depotPreview = previewDepotDaily(input.locomotives, input.wagons);
    const depot = depotPreview.total;
    const depotLines: DailyFixedCostLine[] = [
      { id: 'depot-hall', label: 'Standort / Hallenmiete', amount: depotPreview.hall },
      {
        id: 'depot-idle-locos',
        label: `${depotPreview.idleLocoCount} inaktive Loks · Standgeld ${IDLE_LOCO_STANDING_DAILY} €`,
        amount: depotPreview.idleLocos,
      },
      {
        id: 'depot-idle-wagons',
        label: `${depotPreview.idleWagonCount} inaktive Wagen · Gleismiete ${IDLE_WAGON_STANDING_DAILY} €`,
        amount: depotPreview.idleWagons,
      },
    ].filter((line) => line.amount > 0);
    const bank = overdraftInterest + loanInstallments + insurance;
    const total = leasing + bank + personnel + depot;

    return {
      leasingLoco,
      leasingWagon,
      leasing,
      overdraftInterest,
      loanInstallments,
      insurance,
      bank,
      personnel,
      depot,
      total,
      leaseLines,
      loanLines,
      insuranceLines,
      depotLines,
      staffCount,
      locoCount,
      wagonCount,
      idleLocoCount: depotPreview.idleLocoCount,
      idleWagonCount: depotPreview.idleWagonCount,
    };
  } catch {
    return { ...EMPTY_DAILY_FIXED };
  }
}
