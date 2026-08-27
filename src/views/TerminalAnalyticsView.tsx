import { useMemo, useState } from 'react';
import { BarChart3, ChevronRight, CircleDollarSign, Gauge, PackageSearch, ReceiptText, TrendingDown, TrendingUp } from 'lucide-react';

import { Button, Card, CardFlush, CardHeader, StatPill } from '@/components/ui';
import { buildTerminalAnalytics, type AnalyticsExpenseCategory, type AnalyticsTick, type ContributionRow } from '@/lib/terminalAnalytics';
import { useTerminalSimulation } from '@/state/terminalSimulationStore';

function euro(cents: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits }).format(cents / 100);
}

function percent(value: number | null): string {
  return value == null ? '—' : `${(value * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;
}

function linePath(values: number[], width: number, height: number, maximum: number): string {
  if (values.length === 0) return '';
  const horizontal = values.length === 1 ? 0 : width / (values.length - 1);
  return values.map((value, index) => {
    const x = index * horizontal;
    const y = height - ((value / maximum) * height);
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
}

function FinanceLineChart({ ticks }: { ticks: AnalyticsTick[] }) {
  const dimensions = { width: 640, height: 190, left: 6, top: 8, bottom: 24 };
  const chartHeight = dimensions.height - dimensions.top - dimensions.bottom;
  const chartWidth = dimensions.width - dimensions.left * 2;
  const maximum = Math.max(1, ...ticks.flatMap((tick) => [tick.revenueCents, tick.expenseCents]));
  const revenuePath = linePath(ticks.map((tick) => tick.revenueCents), chartWidth, chartHeight, maximum);
  const expensePath = linePath(ticks.map((tick) => tick.expenseCents), chartWidth, chartHeight, maximum);
  const hasActivity = ticks.some((tick) => tick.revenueCents > 0 || tick.expenseCents > 0);

  return (
    <div className="relative rounded-lg border border-slate-700/80 bg-slate-950/55 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.12em]">
        <div className="flex items-center gap-3"><span className="flex items-center gap-1.5 text-emerald-300"><i className="h-2 w-2 rounded-full bg-emerald-400" /> Einnahmen</span><span className="flex items-center gap-1.5 text-rose-300"><i className="h-2 w-2 rounded-full bg-rose-400" /> Ausgaben</span></div>
        <span className="text-slate-500">Skala bis {euro(maximum)}</span>
      </div>
      {hasActivity ? <svg viewBox={`0 0 ${dimensions.width} ${dimensions.height}`} className="h-48 w-full overflow-visible" role="img" aria-label="Einnahmen und Ausgaben je Simulationsstunde">
        {[0.25, 0.5, 0.75, 1].map((fraction) => <line key={fraction} x1={dimensions.left} x2={dimensions.width - dimensions.left} y1={dimensions.top + chartHeight * (1 - fraction)} y2={dimensions.top + chartHeight * (1 - fraction)} stroke="rgba(100,116,139,0.24)" strokeWidth="1" />)}
        <g transform={`translate(${dimensions.left}, ${dimensions.top})`}>
          <path d={revenuePath} fill="none" stroke="#34d399" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <path d={expensePath} fill="none" stroke="#fb7185" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          {ticks.map((tick, index) => {
            const x = ticks.length === 1 ? 0 : index * (chartWidth / (ticks.length - 1));
            return <g key={tick.tick}><circle cx={x} cy={chartHeight - ((tick.revenueCents / maximum) * chartHeight)} r="3.5" fill="#34d399" /><circle cx={x} cy={chartHeight - ((tick.expenseCents / maximum) * chartHeight)} r="3.5" fill="#fb7185" /></g>;
          })}
        </g>
        {ticks.map((tick, index) => {
          const x = dimensions.left + (ticks.length === 1 ? 0 : index * (chartWidth / (ticks.length - 1)));
          if (index !== 0 && index !== ticks.length - 1 && index % Math.ceil(ticks.length / 5) !== 0) return null;
          return <text key={tick.tick} x={x} y={dimensions.height - 5} textAnchor="middle" fill="#64748b" fontSize="11">h {tick.tick}</text>;
        })}
      </svg> : <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-slate-700 px-6 text-center text-sm text-slate-500">Noch keine buchungsrelevanten Einnahmen oder Ausgaben im ausgewählten Zeitfenster.</div>}
    </div>
  );
}

function ExpenseSplit({ expenses }: { expenses: Record<AnalyticsExpenseCategory, number> }) {
  const config: Array<{ key: AnalyticsExpenseCategory; label: string; color: string }> = [
    { key: 'PERSONAL', label: 'Personalunterhalt', color: 'bg-cyan-400' },
    { key: 'AUSBAU', label: 'Ausbaukosten', color: 'bg-violet-400' },
    { key: 'LIEGEGEBUEHR', label: 'Liegegebühren', color: 'bg-amber-400' },
    { key: 'EREIGNISSTRAFE', label: 'Strafen & Ereignisse', color: 'bg-rose-400' },
  ];
  const total = Object.values(expenses).reduce((sum, amount) => sum + amount, 0);
  return (
    <div className="space-y-3">
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-950/80">
        {config.map(({ key, color }) => expenses[key] > 0 && <div key={key} className={color} style={{ width: `${(expenses[key] / Math.max(1, total)) * 100}%` }} />)}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {config.map(({ key, label, color }) => <div key={key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-700/70 bg-slate-950/35 px-2.5 py-2 text-xs"><span className="flex min-w-0 items-center gap-2 text-slate-300"><i className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`} /> <span className="truncate">{label}</span></span><span className="shrink-0 font-bold tabular-nums text-slate-100">{euro(expenses[key])}</span></div>)}
      </div>
    </div>
  );
}

function ContributionTable({ rows, emptyLabel }: { rows: ContributionRow[]; emptyLabel: string }) {
  if (rows.length === 0) return <div className="rounded-lg border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">{emptyLabel}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="fi-table min-w-[37rem]">
        <thead><tr><th>Leistungsträger</th><th className="text-right">Umsatz</th><th className="text-right">Zurechenbare Kosten</th><th className="text-right">Deckungsbeitrag</th><th className="text-right">Marge</th><th className="text-right">Umschlag</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}><td><span className="font-bold text-slate-100">{row.label}</span><span className="ml-2 text-[10px] text-slate-500">{row.completedUnits} Projekt{row.completedUnits === 1 ? '' : 'e'}</span></td><td className="text-right font-semibold tabular-nums text-emerald-300">{euro(row.revenueCents)}</td><td className="text-right font-semibold tabular-nums text-rose-300">−{euro(row.allocatedExpenseCents)}</td><td className={`text-right font-black tabular-nums ${row.contributionMarginCents >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{euro(row.contributionMarginCents)}</td><td className="text-right font-bold tabular-nums text-slate-200">{percent(row.marginPercent)}</td><td className="text-right tabular-nums text-cyan-200">{row.throughputTons.toLocaleString('de-DE', { maximumFractionDigits: 1 })} t</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export function TerminalAnalyticsView({ onOpenManagement }: { onOpenManagement: () => void }) {
  const snapshot = useTerminalSimulation((state) => state);
  const [breakdown, setBreakdown] = useState<'ZUEGE' | 'FRACHT' | 'GLEISE'>('ZUEGE');
  const analytics = useMemo(() => buildTerminalAnalytics(snapshot, 48), [snapshot]);
  const contribution = breakdown === 'ZUEGE'
    ? analytics.trainContribution
    : breakdown === 'FRACHT'
      ? analytics.cargoContribution
      : analytics.trackContribution;
  const contributionTitle = breakdown === 'ZUEGE' ? 'Züge nach Deckungsbeitrag' : breakdown === 'FRACHT' ? 'Frachtarten nach Deckungsbeitrag' : 'Gleise nach Deckungsbeitrag';

  return (
    <section className="space-y-4" aria-label="Terminal Analytics">
      <header className="flex flex-col gap-3 border-b border-cyan-400/20 pb-4 md:flex-row md:items-end md:justify-between">
        <div><div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300"><BarChart3 className="h-3.5 w-3.5" /> Terminal Intelligence</div><h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">Finanz- und Umschlaganalyse</h2><p className="mt-1 text-sm text-slate-400">Realisierte Buchungen der letzten 48 Simulationsstunden, ohne Prognosen oder verdeckte Schätzungen.</p></div>
        <div className="flex flex-wrap gap-2"><StatPill label="Zeitraum" value={`${analytics.ticks.length} h`} valueClass="text-cyan-300" /><Button variant="secondary" className="min-h-10" onClick={onOpenManagement}>Management <ChevronRight className="h-4 w-4" /></Button></div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-3"><div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Einnahmen</p><TrendingUp className="h-4 w-4 text-emerald-300" /></div><p className="mt-1 text-xl font-black tabular-nums text-emerald-300">{euro(analytics.totals.revenueCents)}</p><p className="mt-1 text-[10px] text-slate-500">Aus Großprojektabschlüssen</p></Card>
        <Card className="p-3"><div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Ausgaben</p><TrendingDown className="h-4 w-4 text-rose-300" /></div><p className="mt-1 text-xl font-black tabular-nums text-rose-300">{euro(analytics.totals.expenseCents)}</p><p className="mt-1 text-[10px] text-slate-500">Personal, Ausbau, Liegezeit, Ereignisse</p></Card>
        <Card className="p-3"><div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Operatives Ergebnis</p><CircleDollarSign className={`h-4 w-4 ${analytics.totals.operatingResultCents >= 0 ? 'text-emerald-300' : 'text-rose-300'}`} /></div><p className={`mt-1 text-xl font-black tabular-nums ${analytics.totals.operatingResultCents >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{euro(analytics.totals.operatingResultCents)}</p><p className="mt-1 text-[10px] text-slate-500">Einnahmen minus erfasste Kosten</p></Card>
        <Card className="p-3"><div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Umschlag</p><Gauge className="h-4 w-4 text-cyan-300" /></div><p className="mt-1 text-xl font-black tabular-nums text-cyan-300">{analytics.totals.throughputTons.toLocaleString('de-DE', { maximumFractionDigits: 1 })} t</p><p className="mt-1 text-[10px] text-slate-500">{analytics.totals.completedProjectCount} abgeschlossene Großprojekte</p></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.8fr)]">
        <CardFlush><CardHeader><span className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-300" /> Einnahmen vs. Ausgaben</span><span className="text-slate-500">je Simulationsstunde</span></CardHeader><div className="p-3 md:p-4"><FinanceLineChart ticks={analytics.ticks} /></div></CardFlush>
        <CardFlush><CardHeader><span className="flex items-center gap-2"><ReceiptText className="h-4 w-4 text-amber-300" /> Kostenstruktur</span><span className="text-slate-500">erfasst</span></CardHeader><div className="p-3 md:p-4"><ExpenseSplit expenses={analytics.totals.expensesByCategory} /></div></CardFlush>
      </div>

      <CardFlush><CardHeader><span className="flex items-center gap-2"><PackageSearch className="h-4 w-4 text-cyan-300" /> Profitabilitäts-Analyse</span><span className="text-slate-500">Kosten nach realisiertem Umsatz verteilt</span></CardHeader><div className="p-3 md:p-4"><div className="mb-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar" role="tablist" aria-label="Deckungsbeitragsansicht">{([{ id: 'ZUEGE', label: 'Züge' }, { id: 'FRACHT', label: 'Frachtarten' }, { id: 'GLEISE', label: 'Gleise' }] as const).map((item) => <button key={item.id} type="button" role="tab" aria-selected={breakdown === item.id} onClick={() => setBreakdown(item.id)} className={`min-h-10 shrink-0 rounded-lg border px-3 text-xs font-bold transition ${breakdown === item.id ? 'border-cyan-400 bg-cyan-950/45 text-cyan-100' : 'border-slate-700 bg-slate-950/40 text-slate-400 hover:border-slate-500'}`}>{item.label}</button>)}</div><h3 className="mb-3 text-sm font-bold text-slate-200">{contributionTitle}</h3><ContributionTable rows={contribution} emptyLabel="Noch keine abgeschlossenen Großprojekte im Auswertungszeitraum. Nach der ersten Lieferung erscheinen Zug-, Fracht- und Gleisbeiträge hier automatisch." /></div></CardFlush>
    </section>
  );
}
