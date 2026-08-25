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
  if (/dispozins|kredittilgung|darlehen/.test(l)) return 'zinsen';
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
  zinsen: 'Zinsen / Kredittilgung',
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
  const penalties = sums.strafe;
  const other = sums.sonstiges;
  const totalCosts = operating + leasing + personnel + depot + insurance + interest + penalties + other;
  const net = revenue + totalCosts;
  const lines: PnlLine[] = (Object.keys(PNL_LABELS) as BankBookingKind[]).map((id) => ({
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
    penalties,
    other,
    totalCosts,
    net,
    lines,
  };
}

export interface BankLoan {
  id: string;
  principal: number;
  remaining: number;
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

export const OVERDRAFT_TIERS = [0, 20_000, 45_000, 70_000, 95_000, 120_000, 145_000, 170_000, 200_000, 225_000, 250_000] as const;
export type OverdraftTier = (typeof OVERDRAFT_TIERS)[number];
export const MAX_OVERDRAFT = 250_000;
/** Standard Dispo: 0,03 % / Tag. Großkunden-Rabatt (250 k€): 0,02 % / Tag. */
export const OVERDRAFT_DAILY_RATE = 0.0003;
export const OVERDRAFT_GROSSKUNDEN_RATE = 0.0002;
export const GROSSKUNDEN_OVERDRAFT = 250_000;
export const DEFAULT_OVERDRAFT = 20_000;
export const SANIERUNG_DAYS = 14;
export const DISPO_LOCK_HINT = 'Anpassung des Dispo-Rahmens bei negativem Saldo nicht möglich';

/** Level 1 starts at 20.000 €. Full 250.000 € from Level 10. */
export const OVERDRAFT_UNLOCK_LEVEL: Record<OverdraftTier, number> = {
  0: 1,
  20_000: 1,
  45_000: 2,
  70_000: 3,
  95_000: 4,
  120_000: 5,
  145_000: 6,
  170_000: 7,
  200_000: 8,
  225_000: 9,
  250_000: 10,
};

export const OVERDRAFT_TIER_TABLE: ReadonlyArray<{
  limit: OverdraftTier;
  unlockLevel: number;
  label: string;
  grosskunde: boolean;
}> = [
  { limit: 0, unlockLevel: 1, label: 'Kein Dispo', grosskunde: false },
  { limit: 20_000, unlockLevel: 1, label: '20.000 €', grosskunde: false },
  { limit: 45_000, unlockLevel: 2, label: '45.000 €', grosskunde: false },
  { limit: 70_000, unlockLevel: 3, label: '70.000 €', grosskunde: false },
  { limit: 95_000, unlockLevel: 4, label: '95.000 €', grosskunde: false },
  { limit: 120_000, unlockLevel: 5, label: '120.000 €', grosskunde: false },
  { limit: 145_000, unlockLevel: 6, label: '145.000 €', grosskunde: false },
  { limit: 170_000, unlockLevel: 7, label: '170.000 €', grosskunde: false },
  { limit: 200_000, unlockLevel: 8, label: '200.000 €', grosskunde: false },
  { limit: 225_000, unlockLevel: 9, label: '225.000 €', grosskunde: false },
  { limit: 250_000, unlockLevel: 10, label: '250.000 € · Großkunde', grosskunde: true },
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

export function overdraftRateForLimit(limit: number): number {
  return limit >= GROSSKUNDEN_OVERDRAFT ? OVERDRAFT_GROSSKUNDEN_RATE : OVERDRAFT_DAILY_RATE;
}

export function isGrosskundenOverdraft(limit: number): boolean {
  return limit >= GROSSKUNDEN_OVERDRAFT;
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

export const LOAN_OFFERS = [
  { termDays: 30, annualPct: 5.2, label: '30 Tage · 5,2 % p.a.' },
  { termDays: 90, annualPct: 4.1, label: '90 Tage · 4,1 % p.a.' },
  { termDays: 180, annualPct: 3.4, label: '180 Tage · 3,4 % p.a.' },
  { termDays: 360, annualPct: 2.8, label: '360 Tage · 2,8 % p.a.' },
] as const;

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
      ? loaded.loans.filter((loan) => loan && typeof loan === 'object' && Number.isFinite(Number(loan.remaining)))
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

export function canSpend(balance: number, amount: number, overdraftLimit: number): boolean {
  return balance - amount >= -overdraftLimit;
}

export interface BankTickResult {
  state: BankState;
  company: Company;
  notifications: Omit<Notification, 'id'>[];
}

export function processBankTick(state: BankState, company: Company, nextTick: number): BankTickResult {
  if (!isNewGameDay(state.lastProcessedTick, nextTick)) {
    return { state: { ...state, lastProcessedTick: nextTick }, company, notifications: [] };
  }

  let next = { ...state, lastProcessedTick: nextTick };
  let balance = company.balance;
  const notifications: Omit<Notification, 'id'>[] = [];
  const createdAt = company.updated_at;

  if (balance < 0) {
    const interest = Math.max(1, Math.round(Math.abs(balance) * next.overdraftDailyRate));
    balance -= interest;
    next = pushBooking(next, {
      tick: nextTick,
      createdAt,
      label: `Dispozinsen (${(next.overdraftDailyRate * 100).toFixed(2)} % / Tag)`,
      amount: -interest,
      kind: 'zinsen' as const,
    });
  }

  const remainingLoans: BankLoan[] = [];
  for (const loan of next.loans) {
    const pay = Math.min(loan.dailyPayment, loan.remaining);
    balance -= pay;
    const remaining = loan.remaining - pay;
    next = pushBooking(next, {
      tick: nextTick,
      createdAt,
      label: `Kredittilgung (${loan.interestLabel})`,
      amount: -pay,
      kind: 'zinsen' as const,
    });
    if (remaining <= 0) {
      notifications.push({
        type: 'success',
        title: 'Kredit getilgt',
        message: `Ein Darlehen über ${formatEuro(loan.principal)} ist vollständig zurückgezahlt.`,
        read: false,
        created_at: createdAt,
      });
    } else {
      remainingLoans.push({ ...loan, remaining });
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
