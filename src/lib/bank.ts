import type { Company, Notification } from '@/lib/supabase';
import { formatEuro } from '@/lib/status';
import { newNotificationId } from '@/lib/gameTime';
import { isNewGameDay, loadJson, saveJson, TICKS_PER_DAY } from '@/lib/storage';

export const BANK_STATE_KEY = 'evu-bank-state';

export type InsuranceId = 'gueterschaden' | 'haftpflicht';

export type BankBookingKind =
  | 'fracht'
  | 'betrieb'
  | 'leasing'
  | 'gehalt'
  | 'standort'
  | 'versicherung'
  | 'zinsen'
  | 'kreditaufnahme'
  | 'tilgung'
  | 'investition'
  | 'ruecklage'
  | 'strafe'
  | 'sonstiges';

export interface BankBooking {
  id: string;
  tick: number;
  createdAt: string;
  label: string;
  amount: number;
  kind?: BankBookingKind;
}

export function inferBookingKind(label: string, kind?: BankBookingKind): BankBookingKind {
  if (kind) return kind;
  const l = label.toLowerCase();
  if (/frachterl[oö]s|industrie-fracht|baugleis-eins[äa]tze|rahmenvertrag/.test(l)) return 'fracht';
  if (/leasing/.test(l)) return 'leasing';
  if (/gehalt/.test(l)) return 'gehalt';
  if (/standort|standgeld|hallenmiete/.test(l)) return 'standort';
  if (/versicherung/.test(l)) return 'versicherung';
  if (/kreditaufnahme|darlehen.*auszahl/.test(l)) return 'kreditaufnahme';
  if (/^kauf |^verkauf |pakete |depotausbau|netzzugang/.test(l)) return 'investition';
  if (/instandhaltungs-?fonds|wartungsr[üu]cklage|risikovorsorge/.test(l)) return 'ruecklage';
  if (/sondertilgung|kredittilgung|kredit.*tilgung|darlehen.*tilgung/.test(l)) return 'tilgung';
  if (/dispozins|kreditzins|zinsen/.test(l)) return 'zinsen';
  if (/p[öo]nale|bußgeld|bussgeld|eba|vertragsstrafe|strafe|sanktion/.test(l)) return 'strafe';
  if (/trasse|energie|diesel|pdl|betrieb|reparatur/.test(l)) return 'betrieb';
  return 'sonstiges';
}

export interface PnlLine {
  id: BankBookingKind;
  label: string;
  amount: number;
}

export interface PnlSummary {
  fromTick: number;
  toTick: number;
  revenue: number;
  operating: number;
  leasing: number;
  personnel: number;
  depot: number;
  insurance: number;
  interest: number;
  financingCashIn: number;
  principalRepayments: number;
  investmentCashFlow: number;
  maintenanceFundTransfers: number;
  penalties: number;
  other: number;
  totalCosts: number;
  net: number;
  lines: PnlLine[];
}

const PNL_LABELS: Record<BankBookingKind, string> = {
  fracht: 'Frachterlöse',
  betrieb: 'Betrieb (Trasse, Energie, PDL, Reparatur)',
  leasing: 'Leasing',
  gehalt: 'Gehälter',
  standort: 'Standort / Standgeld / Hallenmiete',
  versicherung: 'Versicherungen',
  zinsen: 'Zinsaufwand',
  kreditaufnahme: 'Kreditaufnahme (Finanzierung)',
  tilgung: 'Kredittilgung (Finanzierung)',
  investition: 'Investition / Anlagenverkauf (Cashflow)',
  ruecklage: 'Instandhaltungs-Fonds (Umbuchung)',
  strafe: 'Pönalen / Bußgelder',
  sonstiges: 'Sonstiges',
};

export function summarizePnl(bookings: BankBooking[], fromTick: number, toTick: number): PnlSummary {
  const sums: Record<BankBookingKind, number> = {
    fracht: 0,
    betrieb: 0,
    leasing: 0,
    gehalt: 0,
    standort: 0,
    versicherung: 0,
    zinsen: 0,
    kreditaufnahme: 0,
    tilgung: 0,
    investition: 0,
    ruecklage: 0,
    strafe: 0,
    sonstiges: 0,
  };
  for (const row of bookings) {
    if (row.tick < fromTick || row.tick > toTick) continue;
    const kind = inferBookingKind(row.label, row.kind);
    sums[kind] += Number(row.amount) || 0;
  }
  const revenue = sums.fracht;
  const operating = sums.betrieb;
  const leasing = sums.leasing;
  const personnel = sums.gehalt;
  const depot = sums.standort;
  const insurance = sums.versicherung;
  const interest = sums.zinsen;
  const financingCashIn = sums.kreditaufnahme;
  const principalRepayments = sums.tilgung;
  const investmentCashFlow = sums.investition;
  const maintenanceFundTransfers = sums.ruecklage;
  const penalties = sums.strafe;
  const other = sums.sonstiges;
  const totalCosts = operating + leasing + personnel + depot + insurance + interest + penalties + other;
  const net = revenue + totalCosts;
  const lines: PnlLine[] = (['fracht', 'betrieb', 'leasing', 'gehalt', 'standort', 'versicherung', 'zinsen', 'ruecklage', 'strafe', 'sonstiges'] as BankBookingKind[]).map((id) => ({
    id,
    label: PNL_LABELS[id],
    amount: sums[id],
  }));
  return {
    fromTick,
    toTick,
    revenue,
    operating,
    leasing,
    personnel,
    depot,
    insurance,
    interest,
    financingCashIn,
    principalRepayments,
    investmentCashFlow,
    maintenanceFundTransfers,
    penalties,
    other,
    totalCosts,
    net,
    lines,
  };
}

export interface BankLoan {
  id: string;
  /** Original drawn principal. */
  principal: number;
  /** Remaining contractual cash payment = principal + interest still due. */
  remaining: number;
  /** Outstanding principal shown as a balance-sheet liability. */
  principalRemaining: number;
  /** Contractual interest still due; expensed only as it accrues. */
  interestRemaining: number;
  termDays: number;
  dailyPayment: number;
  interestLabel: string;
  startedTick: number;
}

export interface BankState {
  overdraftLimit: number;
  overdraftDailyRate: number;
  loans: BankLoan[];
  insurances: Record<InsuranceId, boolean>;
  bookings: BankBooking[];
  lastProcessedTick: number;
  /** Tick when balance first fell below −overdraftLimit. Null = no Sanierung. */
  sanierungStartTick: number | null;
  /** True after the 14-day Sanierung window expired while still beyond the limit. */
  insolvent: boolean;
}

/**
 * Notfall-Dispo: bewusst flacher als die frühere 250-k€-Kurve. Er rettet Betrieb und Reparatur,
 * bleibt aber von Stufe 10 an gedeckelt, damit er keine Flottenfinanzierung ersetzt.
 */
export const OVERDRAFT_TIERS = [0, 25_000, 35_000, 50_000, 65_000, 80_000, 100_000, 120_000, 140_000, 155_000, 175_000] as const;
export type OverdraftTier = (typeof OVERDRAFT_TIERS)[number];
export const MAX_OVERDRAFT = 175_000;
export const DEFAULT_OVERDRAFT = 25_000;
export const SANIERUNG_DAYS = 14;
export const DISPO_LOCK_HINT = 'Anpassung des Dispo-Rahmens bei negativem Saldo nicht möglich';

/** Auslastungsabhängige Tageszinsen: günstig nur für kurze operative Überbrückungen. */
export const OVERDRAFT_SAFE_UTILIZATION = 0.5;
export const OVERDRAFT_INVESTMENT_LOCK_UTILIZATION = 0.6;
export const OVERDRAFT_CRITICAL_UTILIZATION = 0.85;
export const OVERDRAFT_SAFE_DAILY_RATE = 0.00035;
export const OVERDRAFT_HIGH_DAILY_RATE = 0.00055;
export const OVERDRAFT_CRITICAL_DAILY_RATE = 0.0008;
/** Compatibility export for views or legacy imports; new calculations use utilization. */
export const OVERDRAFT_DAILY_RATE = OVERDRAFT_SAFE_DAILY_RATE;
export const OVERDRAFT_GROSSKUNDEN_RATE = OVERDRAFT_SAFE_DAILY_RATE;
export const GROSSKUNDEN_OVERDRAFT = MAX_OVERDRAFT;

/** Level 1 starts at 25.000 €. The financial ceiling is 175.000 € from Level 10 onward. */
export const OVERDRAFT_UNLOCK_LEVEL: Record<OverdraftTier, number> = {
  0: 1,
  25_000: 1,
  35_000: 2,
  50_000: 3,
  65_000: 4,
  80_000: 5,
  100_000: 6,
  120_000: 7,
  140_000: 8,
  155_000: 9,
  175_000: 10,
};

export const OVERDRAFT_TIER_TABLE: ReadonlyArray<{
  limit: OverdraftTier;
  unlockLevel: number;
  label: string;
  grosskunde: boolean;
}> = [
  { limit: 0, unlockLevel: 1, label: 'Kein Dispo', grosskunde: false },
  { limit: 25_000, unlockLevel: 1, label: '25.000 €', grosskunde: false },
  { limit: 35_000, unlockLevel: 2, label: '35.000 €', grosskunde: false },
  { limit: 50_000, unlockLevel: 3, label: '50.000 €', grosskunde: false },
  { limit: 65_000, unlockLevel: 4, label: '65.000 €', grosskunde: false },
  { limit: 80_000, unlockLevel: 5, label: '80.000 €', grosskunde: false },
  { limit: 100_000, unlockLevel: 6, label: '100.000 €', grosskunde: false },
  { limit: 120_000, unlockLevel: 7, label: '120.000 €', grosskunde: false },
  { limit: 140_000, unlockLevel: 8, label: '140.000 €', grosskunde: false },
  { limit: 155_000, unlockLevel: 9, label: '155.000 €', grosskunde: false },
  { limit: 175_000, unlockLevel: 10, label: '175.000 € · Notfallrahmen', grosskunde: false },
];

export function defaultOverdraftForLevel(level: number): OverdraftTier {
  const lv = Math.max(1, level);
  let best: OverdraftTier = DEFAULT_OVERDRAFT;
  for (const row of OVERDRAFT_TIER_TABLE) {
    if (row.limit > 0 && row.unlockLevel <= lv) best = row.limit;
  }
  return best;
}

export function overdraftUnlockLevel(tier: number): number {
  return OVERDRAFT_UNLOCK_LEVEL[normalizeOverdraftLimit(tier)];
}

export function isOverdraftTierUnlocked(tier: number, companyLevel: number): boolean {
  return Math.max(1, companyLevel) >= overdraftUnlockLevel(tier);
}

/** Snap legacy 0 / 25k / 50k / 100k / 175k / 250k (and any other value) onto the live Dispo-Stufen + 0. */
export function normalizeOverdraftLimit(raw: number): OverdraftTier {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  let best: OverdraftTier = OVERDRAFT_TIERS[0];
  let bestDist = Infinity;
  for (const tier of OVERDRAFT_TIERS) {
    const dist = Math.abs(tier - n);
    if (dist < bestDist || (dist === bestDist && tier > best)) {
      best = tier;
      bestDist = dist;
    }
  }
  return best;
}

export function canChangeOverdraftLimit(balance: number): boolean {
  return balance >= 0;
}

/**
 * Normalizes the currently used share of the approved operating overdraft to
 * the 0–1 range. Investment checks and tiered daily interest both consume this
 * one value, keeping the Dispo strictly an operational safety net.
 */
export function overdraftUtilization(balance: number, overdraftLimit: number): number {
  const limit = Math.max(0, Number(overdraftLimit) || 0);
  if (limit <= 0) return balance < 0 ? 1 : 0;
  return Math.max(0, Math.min(1, Math.abs(Math.min(0, Number(balance) || 0)) / limit));
}

export function overdraftRateForUtilization(utilization: number): number {
  const used = Math.max(0, Number(utilization) || 0);
  if (used <= OVERDRAFT_SAFE_UTILIZATION) return OVERDRAFT_SAFE_DAILY_RATE;
  if (used <= OVERDRAFT_CRITICAL_UTILIZATION) return OVERDRAFT_HIGH_DAILY_RATE;
  return OVERDRAFT_CRITICAL_DAILY_RATE;
}

/** Resolves the tiered daily Dispo interest rate from the live utilization. */
export function overdraftRateForBalance(balance: number, overdraftLimit: number): number {
  return overdraftRateForUtilization(overdraftUtilization(balance, overdraftLimit));
}

/** Legacy/default display rate for a positive balance; live bookings use overdraftRateForBalance. */
export function overdraftRateForLimit(limit: number): number {
  // The compatibility argument is intentionally retained for legacy callers.
  void limit;
  return OVERDRAFT_SAFE_DAILY_RATE;
}

export function isGrosskundenOverdraft(limit: number): boolean {
  // Gross-customer overdrafts are no longer part of the progression model.
  void limit;
  return false;
}

/** Optional asset purchases must be fully cash-funded; the Dispo remains reserved for operations. */
export function canSpendInvestment(balance: number, amount: number): boolean {
  const due = Math.max(0, Number(amount) || 0);
  return Number(balance) >= due;
}

export function isInvestmentLockedByOverdraft(balance: number, overdraftLimit: number): boolean {
  return overdraftUtilization(balance, overdraftLimit) >= OVERDRAFT_INVESTMENT_LOCK_UTILIZATION;
}

/**
 * Exclusive insolvency predicate: Sanierung starts only when cash is below −chosen Dispo.
 * Outstanding Darlehen principal is a later daily drain, never an insolvency trigger by itself.
 */
export function isBeyondOverdraft(balance: number, overdraftLimit: number): boolean {
  return balance < -overdraftLimit;
}

export interface SanierungSnapshot {
  active: boolean;
  daysRemaining: number;
  startTick: number | null;
  insolvent: boolean;
}

export function sanierungDaysElapsed(startTick: number, tick: number): number {
  return Math.max(0, Math.floor((tick - startTick) / TICKS_PER_DAY));
}

export function sanierungSnapshot(state: BankState, tick: number): SanierungSnapshot {
  if (state.insolvent) {
    return { active: false, daysRemaining: 0, startTick: state.sanierungStartTick, insolvent: true };
  }
  if (state.sanierungStartTick == null) {
    return { active: false, daysRemaining: SANIERUNG_DAYS, startTick: null, insolvent: false };
  }
  const remaining = Math.max(0, SANIERUNG_DAYS - sanierungDaysElapsed(state.sanierungStartTick, tick));
  return {
    active: remaining > 0,
    daysRemaining: remaining,
    startTick: state.sanierungStartTick,
    insolvent: remaining <= 0,
  };
}

export interface SanierungSyncResult {
  state: BankState;
  notifications: Omit<Notification, 'id'>[];
  changed: boolean;
  started: boolean;
  recovered: boolean;
  failed: boolean;
}

/** Start, continue, or clear the 14-day Sanierung window from the insolvency predicate. */
export function syncSanierung(
  state: BankState,
  balance: number,
  tick: number,
  createdAt: string,
): SanierungSyncResult {
  const empty = (next: BankState, extra: Partial<SanierungSyncResult> = {}): SanierungSyncResult => ({
    state: next,
    notifications: [],
    changed: next !== state,
    started: false,
    recovered: false,
    failed: false,
    ...extra,
  });

  if (!isBeyondOverdraft(balance, state.overdraftLimit)) {
    if (state.sanierungStartTick == null && !state.insolvent) {
      return empty(state);
    }
    return empty(
      { ...state, sanierungStartTick: null, insolvent: false },
      {
        changed: true,
        recovered: true,
        notifications: [
          {
            type: 'success',
            title: 'Sanierung beendet',
            message: `Kontostand ${formatEuro(balance)} liegt wieder innerhalb des Kreditrahmens von ${formatEuro(state.overdraftLimit)}.`,
            read: false,
            created_at: createdAt,
          },
        ],
      },
    );
  }

  if (state.insolvent) {
    return empty(state);
  }

  if (state.sanierungStartTick == null) {
    return empty(
      { ...state, sanierungStartTick: tick, insolvent: false },
      {
        changed: true,
        started: true,
        notifications: [
          {
            type: 'warning',
            title: 'Sanierung eingeleitet',
            message: `Kontostand ${formatEuro(balance)} unterschreitet den Dispo-Rahmen von ${formatEuro(state.overdraftLimit)}. ${SANIERUNG_DAYS} Tage Sanierung bis zur Insolvenz.`,
            read: false,
            created_at: createdAt,
          },
        ],
      },
    );
  }

  const snap = sanierungSnapshot(state, tick);
  if (!snap.insolvent) {
    return empty(state);
  }

  return empty(
    { ...state, insolvent: true },
    {
      changed: true,
      failed: true,
      notifications: [
        {
          type: 'error',
          title: 'Insolvenz',
          message: `Die ${SANIERUNG_DAYS}-tägige Sanierung ist abgelaufen. Das Konto liegt weiter unter dem Kreditrahmen von ${formatEuro(state.overdraftLimit)}.`,
          read: false,
          created_at: createdAt,
        },
      ],
    },
  );
}

export const INSURANCE_CATALOG: Record<
  InsuranceId,
  { name: string; dailyCost: number; description: string }
> = {
  gueterschaden: {
    name: 'Güterschaden',
    dailyCost: 180,
    description: 'Deckt Schäden an beförderten Gütern (Haftung gegenüber Absender).',
  },
  haftpflicht: {
    name: 'Haftpflicht',
    dailyCost: 120,
    description: 'Betriebshaftpflicht für Personen- und Sachschäden im Netz.',
  },
};

/** Always-on Betriebsversicherung (Standort/Fuhrpark), unabhängig von optionalen Policen. */
export const INSURANCE_BASE_DAILY = 85;

/**
 * Verschärfte Kreditkonditionen: höhere Zinsen und kürzere Laufzeiten erhöhen
 * den laufenden Schuldendienst und verhindern dauerhaft günstige Langläufer.
 */
export const LOAN_OFFERS = [
  { termDays: 30, annualPct: 6.0, label: '30 Tage · 6,0 % p.a.' },
  { termDays: 60, annualPct: 5.5, label: '60 Tage · 5,5 % p.a.' },
  { termDays: 120, annualPct: 5.0, label: '120 Tage · 5,0 % p.a.' },
  { termDays: 180, annualPct: 4.5, label: '180 Tage · 4,5 % p.a.' },
] as const;

/** Maximaler Verschuldungsgrad: gesamte verzinsliche Schuld / Eigenkapital. */
export const MAX_DEBT_TO_EQUITY_RATIO = 1.25;

export interface LoanCreditCheck {
  approved: boolean;
  existingDebt: number;
  projectedDebt: number;
  equity: number;
  projectedDebtToEquity: number | null;
  maxDebtToEquity: number;
  reason: string | null;
}

/**
 * Bewertet die Darlehensfähigkeit vor Auszahlung. Die Darlehensauszahlung erhöht
 * Cash und Schuld gleich stark; deshalb bleibt das Eigenkapital vor und nach der
 * Auszahlung identisch. Fuhrparkwert wird vom Aufrufer aus dem lokalen Katalog
 * geliefert und Leasingvermögen ist davon ausgeschlossen.
 */
export function checkLoanCredit(input: {
  requestedPrincipal: number;
  cashBalance: number;
  fleetBookValue: number;
  outstandingLoanPrincipal: number;
  overdraftUsed?: number;
}): LoanCreditCheck {
  const requestedPrincipal = Math.max(0, Math.round(Number(input.requestedPrincipal) || 0));
  const cash = Number(input.cashBalance) || 0;
  const fleet = Math.max(0, Number(input.fleetBookValue) || 0);
  const loanDebt = Math.max(0, Number(input.outstandingLoanPrincipal) || 0);
  const overdraft = Math.max(0, Number(input.overdraftUsed) || 0, -cash);
  const existingDebt = loanDebt + overdraft;
  const projectedDebt = existingDebt + requestedPrincipal;
  const equity = Math.round(Math.max(0, cash) + fleet - existingDebt);
  const projectedDebtToEquity = equity > 0 ? projectedDebt / equity : null;
  const approved = requestedPrincipal > 0
    && equity > 0
    && projectedDebtToEquity != null
    && projectedDebtToEquity <= MAX_DEBT_TO_EQUITY_RATIO;
  const reason = approved
    ? null
    : equity <= 0
      ? 'Kredit abgelehnt: Eigenkapital ist nicht positiv.'
      : `Kredit abgelehnt: Verschuldungsgrad ${projectedDebtToEquity?.toFixed(2).replace('.', ',') ?? '—'}× überschreitet die Grenze von ${MAX_DEBT_TO_EQUITY_RATIO.toFixed(2).replace('.', ',')}×.`;
  return { approved, existingDebt, projectedDebt, equity, projectedDebtToEquity, maxDebtToEquity: MAX_DEBT_TO_EQUITY_RATIO, reason };
}

export const LOAN_AMOUNTS = [25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000] as const;
export type LoanAmount = (typeof LOAN_AMOUNTS)[number];
export const MAX_LOAN_PRINCIPAL = 1_000_000;

/**
 * Darlehen-Staffel, analog zur Dispo-Kurve (klein früh, Großkredite spät).
 * 25 k€ ab Lvl 1 · 50 k€ ab Lvl 2 · 100 k€ ab Lvl 3 · 250 k€ ab Lvl 5 · 500 k€ ab Lvl 8 · 1 Mio. ab Lvl 10.
 */
export const LOAN_UNLOCK_LEVEL: Record<LoanAmount, number> = {
  25_000: 1,
  50_000: 2,
  100_000: 3,
  250_000: 5,
  500_000: 8,
  1_000_000: 10,
};

export const LOAN_TIER_TABLE: ReadonlyArray<{ amount: LoanAmount; unlockLevel: number }> = LOAN_AMOUNTS.map(
  (amount) => ({ amount, unlockLevel: LOAN_UNLOCK_LEVEL[amount] }),
);

export function isLoanAmount(amount: number): amount is LoanAmount {
  return (LOAN_AMOUNTS as readonly number[]).includes(amount);
}

export function loanUnlockLevel(amount: number): number {
  return isLoanAmount(amount) ? LOAN_UNLOCK_LEVEL[amount] : Number.POSITIVE_INFINITY;
}

export function isLoanAmountUnlocked(amount: number, companyLevel: number): boolean {
  return Math.max(1, companyLevel) >= loanUnlockLevel(amount);
}

function emptyState(tick: number): BankState {
  return {
    overdraftLimit: DEFAULT_OVERDRAFT,
    overdraftDailyRate: overdraftRateForLimit(DEFAULT_OVERDRAFT),
    loans: [],
    insurances: { gueterschaden: false, haftpflicht: false },
    bookings: [],
    lastProcessedTick: tick,
    sanierungStartTick: null,
    insolvent: false,
  };
}

export function seedBankBookings(balance: number, tick: number, createdAt: string): BankBooking[] {
  return [
    {
      id: newNotificationId(),
      tick,
      createdAt,
      label: 'Kontoeröffnung / Startkapital',
      amount: balance,
      kind: 'sonstiges' as const,
    },
    {
      id: newNotificationId(),
      tick,
      createdAt,
      label: 'Betriebsmittelreserve',
      amount: 0,
      kind: 'sonstiges' as const,
    },
  ];
}

function normalizeLoan(value: unknown): BankLoan | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<BankLoan>;
  const principal = Math.max(0, Number(raw.principal) || 0);
  const statedRemaining = Math.max(0, Number(raw.remaining) || 0);
  if (!Number.isFinite(statedRemaining) || statedRemaining <= 0) return null;
  const principalRemaining = Number.isFinite(Number(raw.principalRemaining))
    ? Math.min(principal, Math.max(0, Number(raw.principalRemaining)))
    : Math.min(principal, statedRemaining);
  const interestRemaining = Number.isFinite(Number(raw.interestRemaining))
    ? Math.max(0, Number(raw.interestRemaining))
    : Math.max(0, statedRemaining - principalRemaining);
  const remaining = principalRemaining + interestRemaining;
  if (remaining <= 0) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newNotificationId(),
    principal,
    remaining,
    principalRemaining,
    interestRemaining,
    termDays: Math.max(1, Math.round(Number(raw.termDays) || 1)),
    dailyPayment: Math.max(1, Math.round(Number(raw.dailyPayment) || remaining)),
    interestLabel: typeof raw.interestLabel === 'string' && raw.interestLabel ? raw.interestLabel : 'Darlehen',
    startedTick: Math.max(0, Math.round(Number(raw.startedTick) || 0)),
  };
}

export function loadBankState(tick: number, balance: number, createdAt: string): BankState {
  const loaded = loadJson<BankState | null>(BANK_STATE_KEY, null);
  if (!loaded || !Array.isArray(loaded.bookings)) {
    const seeded = emptyState(tick);
    seeded.bookings = seedBankBookings(balance, tick, createdAt);
    saveBankState(seeded);
    return seeded;
  }
  const overdraftLimit = normalizeOverdraftLimit(Number(loaded.overdraftLimit) || 0);
  return {
    overdraftLimit,
    overdraftDailyRate: overdraftRateForLimit(overdraftLimit),
    loans: Array.isArray(loaded.loans)
      ? loaded.loans.map(normalizeLoan).filter((loan): loan is BankLoan => loan != null)
      : [],
    insurances: {
      gueterschaden: Boolean(loaded.insurances?.gueterschaden),
      haftpflicht: Boolean(loaded.insurances?.haftpflicht),
    },
    bookings: loaded.bookings,
    lastProcessedTick: Number.isFinite(loaded.lastProcessedTick) ? loaded.lastProcessedTick : tick,
    sanierungStartTick:
      loaded.sanierungStartTick == null || !Number.isFinite(Number(loaded.sanierungStartTick))
        ? null
        : Number(loaded.sanierungStartTick),
    insolvent: Boolean(loaded.insolvent),
  };
}

export function saveBankState(state: BankState): void {
  saveJson(BANK_STATE_KEY, { ...state, bookings: state.bookings.slice(0, 120) });
}

export function pushBooking(state: BankState, booking: Omit<BankBooking, 'id'>): BankState {
  const kind = inferBookingKind(booking.label, booking.kind);
  return {
    ...state,
    bookings: [{ ...booking, kind, id: newNotificationId() }, ...state.bookings].slice(0, 120),
  };
}

export function loanDailyPayment(principal: number, termDays: number, annualPct: number): number {
  const interest = principal * (annualPct / 100) * (termDays / 360);
  return Math.round((principal + interest) / termDays);
}

export interface LoanPaymentBreakdown {
  total: number;
  principal: number;
  interest: number;
}

/** Straight-line payment allocation over the remaining contractual cash service. */
export function loanPaymentBreakdown(loan: BankLoan): LoanPaymentBreakdown {
  const total = Math.max(0, Math.min(loan.dailyPayment, loan.remaining));
  if (total <= 0) return { total: 0, principal: 0, interest: 0 };
  const proportionalInterest = loan.remaining > 0 ? Math.round((total * loan.interestRemaining) / loan.remaining) : 0;
  const minimumInterest = loan.interestRemaining > 0 ? 1 : 0;
  let interest = Math.min(loan.interestRemaining, Math.max(minimumInterest, proportionalInterest));
  const principal = Math.min(loan.principalRemaining, Math.max(0, total - interest));
  const residual = total - principal - interest;
  if (residual > 0) interest = Math.min(loan.interestRemaining, interest + residual);
  return { total, principal, interest };
}

export function canSpend(balance: number, amount: number, overdraftLimit: number): boolean {
  return balance - amount >= -overdraftLimit;
}

export interface BankTickResult {
  state: BankState;
  company: Company;
  notifications: Omit<Notification, 'id'>[];
}

/**
 * Runs financial settlement exactly once per new game day. The order is
 * deliberate: Dispo interest is charged for negative liquidity first, then
 * contractual loan service and the subsequent solvency status are recorded.
 */
export function processBankTick(state: BankState, company: Company, nextTick: number): BankTickResult {
  if (!isNewGameDay(state.lastProcessedTick, nextTick)) {
    return { state: { ...state, lastProcessedTick: nextTick }, company, notifications: [] };
  }

  let next = { ...state, lastProcessedTick: nextTick };
  let balance = company.balance;
  const notifications: Omit<Notification, 'id'>[] = [];
  const createdAt = company.updated_at;

  if (balance < 0) {
    const overdraftDailyRate = overdraftRateForBalance(balance, next.overdraftLimit);
    const interest = Math.max(1, Math.round(Math.abs(balance) * overdraftDailyRate));
    balance -= interest;
    next = pushBooking({ ...next, overdraftDailyRate }, {
      tick: nextTick,
      createdAt,
      label: `Dispozinsen (${(overdraftDailyRate * 100).toFixed(3).replace('.', ',')} % / Tag)`,
      amount: -interest,
      kind: 'zinsen' as const,
    });
  } else if (next.overdraftDailyRate !== OVERDRAFT_SAFE_DAILY_RATE) {
    next = { ...next, overdraftDailyRate: OVERDRAFT_SAFE_DAILY_RATE };
  }

  const remainingLoans: BankLoan[] = [];
  for (const loan of next.loans) {
    const payment = loanPaymentBreakdown(loan);
    balance -= payment.total;
    if (payment.interest > 0) {
      next = pushBooking(next, {
        tick: nextTick,
        createdAt,
        label: `Kreditzinsen (${loan.interestLabel})`,
        amount: -payment.interest,
        kind: 'zinsen' as const,
      });
    }
    if (payment.principal > 0) {
      next = pushBooking(next, {
        tick: nextTick,
        createdAt,
        label: `Kredittilgung (${loan.interestLabel})`,
        amount: -payment.principal,
        kind: 'tilgung' as const,
      });
    }
    const principalRemaining = Math.max(0, loan.principalRemaining - payment.principal);
    const interestRemaining = Math.max(0, loan.interestRemaining - payment.interest);
    const remaining = principalRemaining + interestRemaining;
    if (remaining <= 0) {
      notifications.push({
        type: 'success',
        title: 'Kredit getilgt',
        message: `Ein Darlehen über ${formatEuro(loan.principal)} ist vollständig zurückgezahlt.`,
        read: false,
        created_at: createdAt,
      });
    } else {
      remainingLoans.push({ ...loan, remaining, principalRemaining, interestRemaining });
    }
  }
  next = { ...next, loans: remainingLoans };

  if (INSURANCE_BASE_DAILY > 0) {
    balance -= INSURANCE_BASE_DAILY;
    next = pushBooking(next, {
      tick: nextTick,
      createdAt,
      label: 'Versicherung Grundpauschale',
      amount: -INSURANCE_BASE_DAILY,
      kind: 'versicherung' as const,
    });
  }

  (Object.keys(INSURANCE_CATALOG) as InsuranceId[]).forEach((id) => {
    if (!next.insurances[id]) return;
    const cost = INSURANCE_CATALOG[id].dailyCost;
    balance -= cost;
    next = pushBooking(next, {
      tick: nextTick,
      createdAt,
      label: `Versicherung ${INSURANCE_CATALOG[id].name}`,
      amount: -cost,
      kind: 'versicherung' as const,
    });
  });

  return {
    state: next,
    company: { ...company, balance },
    notifications,
  };
}

export function daysFromTicks(ticks: number): number {
  return Math.max(1, Math.round(ticks / TICKS_PER_DAY));
}
