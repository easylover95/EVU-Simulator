import { useMemo, useState } from 'react';
import { Landmark, Lock, Shield, Wallet, Percent } from 'lucide-react';
import type { Company } from '@/lib/supabase';
import { formatEuro } from '@/lib/status';
import { Button, Card, CardFlush, CardHeader } from '@/components/ui';
import { SectionShell } from '@/components/SectionShell';
import {
  DISPO_LOCK_HINT,
  INSURANCE_BASE_DAILY,
  INSURANCE_CATALOG,
  LOAN_AMOUNTS,
  LOAN_OFFERS,
  LOAN_TIER_TABLE,
  GROSSKUNDEN_OVERDRAFT,
  MAX_LOAN_PRINCIPAL,
  OVERDRAFT_TIER_TABLE,
  OVERDRAFT_TIERS,
  canChangeOverdraftLimit,
  isGrosskundenOverdraft,
  isLoanAmountUnlocked,
  isOverdraftTierUnlocked,
  loanDailyPayment,
  loanUnlockLevel,
  normalizeOverdraftLimit,
  sanierungSnapshot,
  type BankState,
  type InsuranceId,
  type LoanAmount,
} from '@/lib/bank';
import { formatTickLabel } from '@/lib/gameTime';
import { DailyFixedCostsCard } from '@/components/DailyFixedCostsCard';
import type { DailyFixedCosts } from '@/lib/dailyFixedCosts';

interface BankViewProps {
  company: Company | null;
  bank: BankState;
  onTakeLoan: (amount: number, termDays: number, annualPct: number, label: string) => boolean;
  onSetOverdraft: (limit: number) => boolean;
  onToggleInsurance: (id: InsuranceId) => boolean;
  onRepayLoan: (loanId: string) => boolean;
  dailyFixed?: DailyFixedCosts;
}

export function BankView({
  company,
  bank,
  onTakeLoan,
  onSetOverdraft,
  onToggleInsurance,
  onRepayLoan,
  dailyFixed,
}: BankViewProps) {
  const [amount, setAmount] = useState<LoanAmount>(25_000);
  const [offerIdx, setOfferIdx] = useState(1);
  const offer = LOAN_OFFERS[offerIdx];
  const daily = loanDailyPayment(amount, offer.termDays, offer.annualPct);
  const balance = company?.balance ?? 0;
  const companyLevel = company?.level ?? 1;
  const amountUnlocked = isLoanAmountUnlocked(amount, companyLevel);
  const inOverdraft = balance < 0;
  const usedOverdraft = inOverdraft ? Math.abs(balance) : 0;
  const frameLocked = !canChangeOverdraftLimit(balance);
  const currentTier = normalizeOverdraftLimit(bank.overdraftLimit);
  const sliderIndex = Math.max(0, OVERDRAFT_TIERS.indexOf(currentTier));
  const sanierung = sanierungSnapshot(bank, company?.tick ?? 0);

  const booked = useMemo(() => bank.bookings.slice(0, 24), [bank.bookings]);

  function selectTier(tier: number) {
    if (frameLocked) return;
    if (!isOverdraftTierUnlocked(tier, companyLevel)) return;
    onSetOverdraft(tier);
  }

  return (
    <SectionShell title="Bank" subtitle="Konto, Dispo-Kreditrahmen, Darlehen und Versicherungen" tutorialId="tutorial-bank-dispo">

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            <Wallet className="h-3.5 w-3.5 text-emerald-400" /> Kontostand
          </div>
          <div className={`mt-2 text-2xl font-bold ${balance < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {formatEuro(balance)}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {inOverdraft
              ? `Dispo genutzt: ${formatEuro(usedOverdraft)} von ${formatEuro(bank.overdraftLimit)}`
              : `Kreditrahmen ${formatEuro(bank.overdraftLimit)} ungenutzt`}
          </p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            <Percent className="h-3.5 w-3.5 text-amber-400" /> Dispozinsen
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-400">
            {(bank.overdraftDailyRate * 100).toFixed(2)} % / Tag
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Wird an jedem Spieltakt-Tag auf negative Salden gebucht.</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            <Landmark className="h-3.5 w-3.5 text-amber-400" /> Laufende Kredite
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {formatEuro((bank.loans ?? []).reduce((s, l) => s + (Number(l?.remaining) || 0), 0))}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">{(bank.loans ?? []).length} aktive Darlehen</p>
        </Card>
      </div>

      {dailyFixed && <DailyFixedCostsCard costs={dailyFixed} />}

      <div className="grid gap-3 lg:grid-cols-2">
        <CardFlush>
          <CardHeader>Dispo-Kreditrahmen</CardHeader>
          <div className="space-y-3 p-4">
            <p className="text-xs text-slate-400">
              Rahmen bis {formatEuro(GROSSKUNDEN_OVERDRAFT)}. Großkunden-Rabatt senkt den Tageszins auf 0,02&nbsp;%.
              Standard 0,03&nbsp;% / Tag. Höhere Stufen schalten mit dem Firmen-Level frei.
            </p>
            {sanierung.insolvent && (
              <p className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-[11px] font-bold text-rose-200">
                Insolvenz — die Sanierungsfrist ist abgelaufen. Das Konto liegt unter dem Kreditrahmen.
              </p>
            )}
            {sanierung.active && (
              <p className="rounded-lg border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-[11px] font-bold text-amber-200">
                Sanierung: noch {sanierung.daysRemaining} {sanierung.daysRemaining === 1 ? 'Tag' : 'Tage'},
                bis Insolvenz droht. Konto unter dem gewählten Dispo-Limit.
              </p>
            )}
            <div title={frameLocked ? DISPO_LOCK_HINT : undefined} className="space-y-2">
              <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Kreditrahmen
                <input
                  type="range"
                  min={0}
                  max={OVERDRAFT_TIERS.length - 1}
                  step={1}
                  value={sliderIndex}
                  disabled={frameLocked}
                  title={frameLocked ? DISPO_LOCK_HINT : undefined}
                  onChange={(e) => selectTier(OVERDRAFT_TIERS[Number(e.target.value)] ?? currentTier)}
                  className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-800 accent-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {OVERDRAFT_TIER_TABLE.map((row) => {
                  const unlocked = isOverdraftTierUnlocked(row.limit, companyLevel);
                  const selected = currentTier === row.limit;
                  const blocked = frameLocked || !unlocked;
                  const hint = frameLocked
                    ? DISPO_LOCK_HINT
                    : unlocked
                      ? undefined
                      : `Freischaltung ab Level ${row.unlockLevel}`;
                  return (
                    <span key={row.limit} title={hint} className="inline-flex">
                      <Button
                        variant={selected ? 'primary' : 'secondary'}
                        disabled={blocked}
                        title={hint}
                        onClick={() => selectTier(row.limit)}
                      >
                        {!unlocked && <Lock className="h-3 w-3" />}
                        {row.label}
                        {!unlocked && (
                          <span className="font-semibold opacity-80">Freischaltung ab Level {row.unlockLevel}</span>
                        )}
                      </Button>
                    </span>
                  );
                })}
              </div>
            </div>
            {isGrosskundenOverdraft(bank.overdraftLimit) && (
              <p className="text-[11px] font-bold text-emerald-400">Großkunden-Rabatt aktiv — 0,02 % / Tag</p>
            )}
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="fi-table">
                <thead>
                  <tr>
                    <th>Level</th>
                    <th>Dispo</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {OVERDRAFT_TIER_TABLE.filter((row) => row.limit > 0).map((row) => {
                    const unlocked = isOverdraftTierUnlocked(row.limit, companyLevel);
                    const selected = currentTier === row.limit;
                    return (
                      <tr key={row.limit} className={selected ? 'bg-amber-950/40' : undefined}>
                        <td className="tabular-nums">Lvl {row.unlockLevel}</td>
                        <td className="font-bold text-white">{row.label}</td>
                        <td className={unlocked ? 'text-emerald-400' : 'text-slate-500'}>
                          {selected ? 'Aktiv' : unlocked ? 'Freigeschaltet' : `ab Level ${row.unlockLevel}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-500">
              Level 1 startet mit 20.000 € Dispo. Der volle Rahmen von 250.000 € gilt erst ab Level 10.
            </p>
          </div>
        </CardFlush>

        <CardFlush>
          <CardHeader>Darlehen aufnehmen</CardHeader>
          <div className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] font-bold uppercase text-slate-500">
                Betrag
                <select
                  value={amount}
                  onChange={(e) => {
                    const next = Number(e.target.value) as LoanAmount;
                    if (!isLoanAmountUnlocked(next, companyLevel)) return;
                    setAmount(next);
                  }}
                  className="mt-1 w-full rounded-lg border border-amber-500/30 bg-slate-950 px-2 py-1.5 text-xs text-white"
                >
                  {LOAN_AMOUNTS.map((n) => {
                    const unlocked = isLoanAmountUnlocked(n, companyLevel);
                    const required = loanUnlockLevel(n);
                    return (
                      <option
                        key={n}
                        value={n}
                        disabled={!unlocked}
                        className={!unlocked ? 'text-slate-500' : undefined}
                      >
                        {formatEuro(n)}
                        {!unlocked ? ` (ab Level ${required})` : ''}
                      </option>
                    );
                  })}
                </select>
              </label>
              <label className="text-[10px] font-bold uppercase text-slate-500">
                Laufzeit
                <select
                  value={offerIdx}
                  onChange={(e) => setOfferIdx(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-amber-500/30 bg-slate-950 px-2 py-1.5 text-xs text-white"
                >
                  {LOAN_OFFERS.map((o, i) => (
                    <option key={o.termDays} value={i}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-xs text-slate-400">
              Tagesrate {formatEuro(daily)} · Gesamtrückzahlung {formatEuro(daily * offer.termDays)} · max.{' '}
              {formatEuro(MAX_LOAN_PRINCIPAL)}
            </p>
            <Button
              disabled={!amountUnlocked}
              title={!amountUnlocked ? `Freischaltung ab Level ${loanUnlockLevel(amount)}` : undefined}
              onClick={() => {
                if (!amountUnlocked) return;
                onTakeLoan(amount, offer.termDays, offer.annualPct, offer.label);
              }}
            >
              Darlehen auszahlen
            </Button>
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="fi-table">
                <thead>
                  <tr>
                    <th>Level</th>
                    <th>Darlehen</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {LOAN_TIER_TABLE.map((row) => {
                    const unlocked = isLoanAmountUnlocked(row.amount, companyLevel);
                    const selected = amount === row.amount;
                    return (
                      <tr key={row.amount} className={selected ? 'bg-amber-950/40' : undefined}>
                        <td className="tabular-nums">Lvl {row.unlockLevel}</td>
                        <td className="font-bold text-white">{formatEuro(row.amount)}</td>
                        <td className={unlocked ? 'text-emerald-400' : 'text-slate-500'}>
                          {selected ? 'Gewählt' : unlocked ? 'Freigeschaltet' : `ab Level ${row.unlockLevel}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-500">
              25.000 € ab Level 1, 50.000 € ab Level 2. 250.000 / 500.000 / 1.000.000 € erst ab Level 5 / 8 / 10.
            </p>
          </div>
        </CardFlush>
      </div>

      {(bank.loans ?? []).length > 0 && (
        <CardFlush>
          <CardHeader>Aktive Darlehen</CardHeader>
          <div className="overflow-x-auto">
            <table className="fi-table">
              <thead>
                <tr>
                  <th>Kondition</th>
                  <th>Restschuld</th>
                  <th>Tagesrate</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(bank.loans ?? []).map((loan) => (
                  <tr key={loan.id}>
                    <td>{loan.interestLabel}</td>
                    <td className="font-bold text-amber-300">{formatEuro(loan.remaining)}</td>
                    <td>{formatEuro(loan.dailyPayment)}</td>
                    <td>
                      <Button variant="secondary" onClick={() => onRepayLoan(loan.id)}>
                        Sondertilgung
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardFlush>
      )}

      <CardFlush>
        <CardHeader>
          <span className="inline-flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-amber-400" /> Versicherungen
          </span>
        </CardHeader>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <div className="app-glass-panel rounded-xl border border-amber-500/20 p-4 sm:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-bold text-white">Grundpauschale Betrieb</div>
              <span className="text-xs font-bold text-emerald-400">Pflicht</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Tägliche Betriebsversicherung für Standort und Fuhrpark, unabhängig von Zusatzpolicen.
            </p>
            <p className="mt-2 text-xs text-amber-300">{formatEuro(INSURANCE_BASE_DAILY)} / Tag</p>
          </div>
          {(Object.keys(INSURANCE_CATALOG) as InsuranceId[]).map((id) => {
            const def = INSURANCE_CATALOG[id];
            const on = bank.insurances[id];
            return (
              <div key={id} className="app-glass-panel rounded-xl border border-amber-500/20 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-bold text-white">{def.name}</div>
                  <span className={`text-xs font-bold ${on ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {on ? 'Aktiv' : 'Inaktiv'}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">{def.description}</p>
                <p className="mt-2 text-xs text-amber-300">{formatEuro(def.dailyCost)} / Tag</p>
                <Button className="mt-3" variant={on ? 'danger' : 'primary'} onClick={() => onToggleInsurance(id)}>
                  {on ? 'Kündigen' : 'Abschließen'}
                </Button>
              </div>
            );
          })}
        </div>
      </CardFlush>

      <CardFlush>
        <CardHeader>Buchungshistorie</CardHeader>
        <div className="overflow-x-auto">
          <table className="fi-table">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Vorgang</th>
                <th className="text-right">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {booked.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-slate-500">
                    Noch keine Buchungen
                  </td>
                </tr>
              )}
              {booked.map((b) => (
                <tr key={b.id}>
                  <td className="tabular-nums text-slate-500">{formatTickLabel(b.tick)}</td>
                  <td>{b.label}</td>
                  <td className={`text-right font-bold ${b.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {b.amount >= 0 ? '+' : ''}
                    {formatEuro(b.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardFlush>
    </SectionShell>
  );
}
