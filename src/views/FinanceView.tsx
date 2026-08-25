import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Wallet, Star, ClipboardList, Package, Landmark, Scale, ArrowRight, CircleDollarSign } from 'lucide-react';
import type { Company, Locomotive, Order, Wagon } from '@/lib/supabase';
import { formatEuro, getOrderStatusConfig, getOrderTypeConfig, getOrderPillClass } from '@/lib/status';
import { formatTickLabel } from '@/lib/gameTime';
import { SectionShell } from '@/components/SectionShell';
import { DailyFixedCostsCard } from '@/components/DailyFixedCostsCard';
import type { DailyFixedCosts } from '@/lib/dailyFixedCosts';
import {
  LOAN_TIER_TABLE,
  OVERDRAFT_TIER_TABLE,
  isLoanAmountUnlocked,
  isOverdraftTierUnlocked,
  normalizeOverdraftLimit,
  type BankState,
  type PnlSummary,
} from '@/lib/bank';
import { computeFinanceSnapshot, type BalanceSheet } from '@/lib/financialStatements';
import type { DealerState } from '@/lib/dealer';

interface FinanceViewProps {
  company: Company | null;
  orders: Order[];
  dailyFixed?: DailyFixedCosts;
  bank?: BankState;
  locomotives?: Locomotive[];
  wagons?: Wagon[];
  dealer?: DealerState;
  onEditCompany?: () => void;
  onOpenBank?: () => void;
}

export function FinanceView({ company, orders, dailyFixed, bank, locomotives = [], wagons = [], dealer, onEditCompany, onOpenBank }: FinanceViewProps) {
  const stats = useMemo(() => {
    const completed = orders.filter((o) => o.status === 'abgeschlossen');
    const open = orders.filter((o) => o.status === 'offen');
    const zugewiesen = orders.filter((o) => o.status === 'zugewiesen');
    return {
      completedCount: completed.length,
      completedRevenue: completed.reduce((s, o) => s + Number(o.yield), 0),
      openCount: open.length,
      openVolume: open.reduce((s, o) => s + Number(o.yield), 0),
      zugewiesenCount: zugewiesen.length,
      zugewiesenVolume: zugewiesen.reduce((s, o) => s + Number(o.yield), 0),
      potentialPenalty: open.reduce((s, o) => s + Number(o.penalty), 0),
    };
  }, [orders]);

  const finance = useMemo(
    () => computeFinanceSnapshot({ company, bank, locomotives, wagons, dealer, periodDays: 30 }),
    [company, bank, locomotives, wagons, dealer],
  );
  const xpPct = company && company.xp_next > 0 ? Math.min(100, (company.xp / company.xp_next) * 100) : 0;
  const repColor = (company?.reputation ?? 0) >= 70 ? 'text-emerald-400' : (company?.reputation ?? 0) >= 40 ? 'text-amber-400' : 'text-rose-400';
  const repBarColor = (company?.reputation ?? 0) >= 70 ? 'bg-emerald-500' : (company?.reputation ?? 0) >= 40 ? 'bg-amber-500' : 'bg-rose-500';

  return (
    <SectionShell
      title="Konto"
      subtitle="GuV, Auftragswerte und wirtschaftliche Kennzahlen"
      actions={
        onEditCompany ? (
          <button type="button" onClick={onEditCompany} className="btn-action btn-action-detail">
            Firma bearbeiten
          </button>
        ) : undefined
      }
    >

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Wallet className="h-4 w-4 text-emerald-400" />} label="Liquidität" value={formatEuro(finance.liquidity)} tone={finance.liquidity >= 0 ? 'positive' : 'negative'} detail={finance.liquidity >= 0 ? 'Sofort verfügbare Mittel' : `Dispo genutzt ${formatEuro(finance.balanceSheet.overdraft)}`} />
        <MetricCard icon={<TrendingUp className="h-4 w-4 text-sky-400" />} label="Operatives Ergebnis" value={formatEuro(finance.operatingResult)} tone={finance.operatingResult >= 0 ? 'positive' : 'negative'} detail="vor Zinsaufwand · 30 Spieltage" />
        <MetricCard icon={<Landmark className="h-4 w-4 text-rose-400" />} label="Verbindlichkeiten" value={formatEuro(finance.outstandingDebt)} tone={finance.outstandingDebt > 0 ? 'negative' : 'neutral'} detail={`${bank?.loans.length ?? 0} Darlehen · Dispo ${formatEuro(finance.balanceSheet.overdraft)}`} />
        <MetricCard icon={<CircleDollarSign className="h-4 w-4 text-amber-400" />} label="Freier Kreditrahmen" value={formatEuro(finance.freeCreditRoom)} tone="neutral" detail={`Tagesdienst ${formatEuro(finance.dailyDebtService)}`} action={onOpenBank ? <button type="button" onClick={onOpenBank} className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 hover:text-amber-100">Kreditmanagement <ArrowRight className="h-3 w-3" /></button> : undefined} />
      </div>

      {/* Kontostand & Level */}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="game-box">
          <div className="game-box-header flex items-center gap-2">
            <Wallet className="h-3.5 w-3.5 text-emerald-400" /> Kontostand
          </div>
          <div className="p-4">
            <div className="text-2xl font-bold fi-gold">{formatEuro(company?.balance ?? 0)}</div>
            <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <TrendingUp className="h-3 w-3 text-emerald-500" />
              +{formatEuro(stats.completedRevenue)} aus abgeschlossenen Aufträgen
            </div>
          </div>
        </div>

        <div className="game-box">
          <div className="game-box-header flex items-center gap-2">
            <Star className="h-3.5 w-3.5 text-amber-400" /> Unternehmen-Level
          </div>
          <div className="p-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-amber-400">Lvl {company?.level ?? 0}</span>
              <span className="text-xs text-slate-500">{company?.xp ?? 0} / {company?.xp_next ?? 0} XP</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-sm border border-slate-700 bg-slate-800">
              <div className="h-full bg-amber-500 transition-all duration-500" style={{ width: `${xpPct}%` }} />
            </div>
          </div>
        </div>

        <div className="game-box">
          <div className="game-box-header flex items-center gap-2">
            <Star className="h-3.5 w-3.5 text-sky-400" /> Bekanntheit
          </div>
          <div className="p-4">
            <div className={`text-2xl font-bold ${repColor}`}>{company?.reputation ?? 0}/100</div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-sm border border-slate-700 bg-slate-800">
              <div className={`h-full ${repBarColor} transition-all duration-500`} style={{ width: `${company?.reputation ?? 0}%` }} />
            </div>
          </div>
        </div>
      </div>

      {dailyFixed && <DailyFixedCostsCard costs={dailyFixed} />}

      {bank && <PnlCard pnl={finance.pnl} />}

      {bank && <BalanceSheetCard balanceSheet={finance.balanceSheet} debtToFleetRatio={finance.debtToFleetRatio} />}

      {bank && (
        <div className="grid gap-3 lg:grid-cols-2">
        <div className="game-box">
          <div className="game-box-header">Dispo-Staffel</div>
          <div className="overflow-x-auto p-3">
            <p className="mb-2 text-[11px] text-slate-400">
              Aktueller Rahmen {formatEuro(bank.overdraftLimit)}. Level 1: 20.000 € · Level 10: 250.000 €.
            </p>
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
                  const unlocked = isOverdraftTierUnlocked(row.limit, company?.level ?? 1);
                  const selected = normalizeOverdraftLimit(bank.overdraftLimit) === row.limit;
                  return (
                    <tr key={row.limit}>
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
        </div>
        <div className="game-box">
          <div className="game-box-header">Darlehen-Staffel</div>
          <div className="overflow-x-auto p-3">
            <p className="mb-2 text-[11px] text-slate-400">
              Kleinkredite früh, Großdarlehen erst mit dem Unternehmens-Level. 25.000 € ab Level 1, 1.000.000 € ab
              Level 10.
            </p>
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
                  const unlocked = isLoanAmountUnlocked(row.amount, company?.level ?? 1);
                  return (
                    <tr key={row.amount}>
                      <td className="tabular-nums">Lvl {row.unlockLevel}</td>
                      <td className="font-bold text-white">{formatEuro(row.amount)}</td>
                      <td className={unlocked ? 'text-emerald-400' : 'text-slate-500'}>
                        {unlocked ? 'Freigeschaltet' : `ab Level ${row.unlockLevel}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      )}

      {/* Umsatz-Kennzahlen */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <div className="game-box p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-slate-500">Offenes Volumen</span>
            <Package className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-1 text-lg font-bold text-amber-400">{formatEuro(stats.openVolume)}</div>
          <div className="text-[10px] text-slate-500">{stats.openCount} Aufträge</div>
        </div>
        <div className="game-box p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-slate-500">Zugewiesen</span>
            <ClipboardList className="h-4 w-4 text-sky-400" />
          </div>
          <div className="mt-1 text-lg font-bold text-sky-400">{formatEuro(stats.zugewiesenVolume)}</div>
          <div className="text-[10px] text-slate-500">{stats.zugewiesenCount} Aufträge</div>
        </div>
        <div className="game-box p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-slate-500">Umsatz realisiert</span>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-1 text-lg font-bold text-emerald-400">{formatEuro(stats.completedRevenue)}</div>
          <div className="text-[10px] text-slate-500">{stats.completedCount} abgeschlossen</div>
        </div>
        <div className="game-box p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-slate-500">Pönale-Risiko</span>
            <TrendingDown className="h-4 w-4 text-rose-400" />
          </div>
          <div className="mt-1 text-lg font-bold text-rose-400">{formatEuro(stats.potentialPenalty)}</div>
          <div className="text-[10px] text-slate-500">bei Verzug</div>
        </div>
      </div>

      {/* Auftrags-Tabelle */}
      <div className="game-box">
        <div className="game-box-header">Auftrags-Erträge im Überblick</div>
        <div className="overflow-x-auto">
          <table className="fi-table">
            <thead>
              <tr>
                <th>Auftragsnr.</th>
                <th>Typ</th>
                <th>Titel</th>
                <th>Status</th>
                <th className="text-right">Ertrag</th>
                <th className="text-right">Pönale</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const typeCfg = getOrderTypeConfig(order.type);
                const statusCfg = getOrderStatusConfig(order.status);
                return (
                  <tr key={order.id}>
                    <td className="font-mono text-slate-400">{order.order_number}</td>
                    <td>
                      <span className={`font-medium ${typeCfg.text}`}>{typeCfg.label}</span>
                    </td>
                    <td className="text-slate-300">{order.title}</td>
                    <td>
                      <span className={getOrderPillClass(order.status)}>{statusCfg.label}</span>
                    </td>
                    <td className="text-right font-bold text-emerald-400">{formatEuro(Number(order.yield))}</td>
                    <td className="text-right font-medium text-rose-400">
                      {order.type === 'baugleis' && order.penalty_per_min > 0
                        ? `${formatEuro(Number(order.penalty_per_min))}/Min`
                        : formatEuro(Number(order.penalty))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Spiel-Takt */}
      <div className="game-box">
        <div className="game-box-header">Spiel-Informationen</div>
        <div className="grid grid-cols-2 gap-4 p-4 md:grid-cols-5">
          <div>
            <div className="text-[10px] font-bold uppercase text-slate-500">Betriebszeit</div>
            <div className="mt-1 text-sm font-bold fi-tick">{formatTickLabel(company?.tick ?? 0)}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-slate-500">Firmenname</div>
            <div className="mt-1 text-sm font-bold text-white">{company?.name ?? '—'}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-slate-500">Standort</div>
            <div className="mt-1 text-sm font-bold text-sky-300">{company?.hq_location ?? '—'}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-slate-500">Erfahrung</div>
            <div className="mt-1 text-sm font-bold text-amber-400">{company?.xp ?? 0} XP</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-slate-500">Nächstes Level</div>
            <div className="mt-1 text-sm font-bold text-slate-300">{company?.xp_next ?? 0} XP</div>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

function PnlCard({ pnl }: { pnl: PnlSummary }) {
  return (
    <div className="game-box">
      <div className="game-box-header flex items-center justify-between gap-2">
        <span>Gewinn- und Verlustrechnung (30 Spieltage)</span>
        <span className={`text-[10px] font-bold uppercase ${pnl.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          {pnl.net >= 0 ? 'Überschuss' : 'Fehlbetrag'} {formatEuro(pnl.net)}
        </span>
      </div>
      <div className="overflow-x-auto p-3">
        <table className="fi-table">
          <thead>
            <tr>
              <th>Position</th>
              <th className="text-right">Betrag</th>
            </tr>
          </thead>
          <tbody>
            {pnl.lines.map((line) => (
              <tr key={line.id}>
                <td className={line.id === 'fracht' ? 'text-emerald-200' : 'text-slate-300'}>{line.label}</td>
                <td
                  className={`text-right font-bold tabular-nums ${
                    line.amount > 0 ? 'text-emerald-400' : line.amount < 0 ? 'text-rose-400' : 'text-slate-500'
                  }`}
                >
                  {formatEuro(line.amount)}
                </td>
              </tr>
            ))}
            <tr>
              <td className="font-bold text-white">Ergebnis</td>
              <td className={`text-right font-bold tabular-nums ${pnl.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatEuro(pnl.net)}
              </td>
            </tr>
          </tbody>
        </table>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-sky-500/20 bg-sky-950/15 p-2 text-[10px] text-slate-400">Kreditaufnahmen (Cashflow): <span className="font-bold text-sky-200">{formatEuro(pnl.financingCashIn)}</span></div>
          <div className="rounded-lg border border-amber-500/20 bg-amber-950/15 p-2 text-[10px] text-slate-400">Tilgungen (Cashflow): <span className="font-bold text-amber-200">{formatEuro(pnl.principalRepayments)}</span></div>
          <div className="rounded-lg border border-violet-500/20 bg-violet-950/15 p-2 text-[10px] text-slate-400">Investitionen (Cashflow): <span className="font-bold text-violet-200">{formatEuro(pnl.investmentCashFlow)}</span></div>
        </div>
        <p className="mt-2 text-[10px] text-slate-500">GuV aus denselben Bankbuchungen wie das Kontoblatt. Kreditaufnahmen und Tilgungen verändern Liquidität beziehungsweise Restschuld, nicht das operative Ergebnis; nur Zinsen sind Finanzaufwand.</p>
      </div>
    </div>
  );
}


function MetricCard({
  icon,
  label,
  value,
  detail,
  tone,
  action,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: 'positive' | 'negative' | 'neutral';
  action?: React.ReactNode;
}) {
  const valueClass = tone === 'positive' ? 'text-emerald-400' : tone === 'negative' ? 'text-rose-400' : 'text-amber-300';
  return (
    <div className="game-box p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase text-slate-500">{label}</span>
        {icon}
      </div>
      <div className={`mt-1 text-lg font-bold tabular-nums ${valueClass}`}>{value}</div>
      <div className="mt-0.5 text-[10px] text-slate-500">{detail}</div>
      {action}
    </div>
  );
}

function BalanceSheetCard({ balanceSheet, debtToFleetRatio }: { balanceSheet: BalanceSheet; debtToFleetRatio: number | null }) {
  const differenceOk = Math.abs(balanceSheet.difference) < 0.01;
  return (
    <div className="game-box">
      <div className="game-box-header flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2"><Scale className="h-3.5 w-3.5 text-sky-400" /> Bilanz · Managementsicht</span>
        <span className={`text-[10px] font-bold uppercase ${differenceOk ? 'text-emerald-400' : 'text-rose-400'}`}>
          Differenz {formatEuro(balanceSheet.difference)}
        </span>
      </div>
      <div className="grid gap-0 lg:grid-cols-2">
        <BalanceColumn title="Aktiva" lines={balanceSheet.assets} total={balanceSheet.assetsTotal} />
        <BalanceColumn
          title="Passiva"
          lines={[
            ...balanceSheet.liabilities,
            { id: 'equity', label: 'Eigenkapital', amount: balanceSheet.equity, tone: balanceSheet.equity >= 0 ? 'positive' : 'negative' },
          ]}
          total={balanceSheet.liabilitiesTotal + balanceSheet.equity}
        />
      </div>
      <div className="border-t border-slate-800 px-3 py-2 text-[10px] text-slate-500">
        Fuhrpark zu aktuellem Management-Buchwert, geleaste Fahrzeuge ausgeschlossen.{' '}
        {debtToFleetRatio == null
          ? 'Kein Fuhrparkwert zur Verschuldungsquote verfügbar.'
          : `Verschuldung / Fuhrpark: ${(debtToFleetRatio * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %.`}
      </div>
    </div>
  );
}

function BalanceColumn({ title, lines, total }: { title: string; lines: BalanceSheet['assets']; total: number }) {
  return (
    <div className="p-3 first:border-b lg:first:border-b-0 lg:first:border-r lg:first:border-slate-800">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">{title}</div>
      {lines.map((line) => (
        <div key={line.id} className="flex items-center justify-between gap-3 py-1 text-xs">
          <span className="text-slate-300">{line.label}</span>
          <span className={`font-bold tabular-nums ${line.tone === 'positive' ? 'text-emerald-400' : line.tone === 'negative' || line.tone === 'warning' ? 'text-rose-400' : 'text-white'}`}>
            {formatEuro(line.amount)}
          </span>
        </div>
      ))}
      <div className="mt-2 flex items-center justify-between border-t border-slate-700 pt-2 text-xs font-bold text-white">
        <span>Summe</span>
        <span className="tabular-nums">{formatEuro(total)}</span>
      </div>
    </div>
  );
}
