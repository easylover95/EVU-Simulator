import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Star, Train, Wallet, X } from 'lucide-react';
import { DISPATCHER_RANKS, type DispatcherRank } from '@/lib/dispatcherCareer';
import { formatEuro } from '@/lib/status';
import { gradeTone, type ShiftReport } from '@/lib/shifts';

export interface ShiftHandoverModalProps {
  report: ShiftReport;
  onStartNext: () => void;
  onClose: () => void;
}

export function ShiftHandoverModal({ report, onStartNext, onClose }: ShiftHandoverModalProps) {
  const pay = report.payroll;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shift-handover-title"
        className="app-glass flex max-h-[min(92vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-amber-400/25 shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-700/60 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-300/90">
              Schichtabschluss · Lohnstreifen
            </p>
            <h2 id="shift-handover-title" className="text-lg font-bold text-slate-50">
              {report.label}
            </h2>
            <p className="text-xs text-slate-400">
              {report.careerTitle ? `${report.careerTitle} · ` : ''}
              {report.startedLabel} → {report.endedLabel}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`rounded-md border px-2.5 py-1 text-center ${gradeTone(report.grade)}`}
              title={report.gradeReason}
            >
              <div className="text-[9px] font-bold uppercase tracking-wide opacity-80">Score</div>
              <div className="text-xl font-black leading-none">{report.grade}</div>
            </div>
            <button type="button" className="app-topbar-ctrl" onClick={onClose} aria-label="Schließen">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          {pay && (
            <section className="rounded-md border border-emerald-500/30 bg-emerald-950/25 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300/90">
                <Wallet className="h-3.5 w-3.5" />
                Persönlicher Lohnstreifen
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Kpi label="Schichtlohn" value={formatEuro(pay.baseWageEuro)} />
                <Kpi label="Pünktlichkeitsbonus" value={formatEuro(pay.punctualityBonusEuro)} tone="good" />
                <Kpi label="Leistungszulage" value={formatEuro(pay.gradeBonusEuro + pay.incidentBonusEuro)} />
                <Kpi label="Auszahlung" value={formatEuro(pay.totalWageEuro)} tone="good" />
              </div>
              <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-400/25 bg-slate-950/40 px-2.5 py-2">
                <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                <div className="min-w-0 text-xs">
                  <div className="font-bold text-amber-100">+{pay.expGained} EXP</div>
                  <div className="text-slate-400">
                    {pay.promoted ? (
                      <span className="text-emerald-300">
                        Beförderung → {DISPATCHER_RANKS[pay.rankAfter as DispatcherRank].label}
                      </span>
                    ) : pay.expToNext == null ? (
                      'Maximalrang erreicht'
                    ) : (
                      `${pay.expIntoRank} / ${pay.expToNext} EXP bis ${
                        pay.rankAfter < 3
                          ? DISPATCHER_RANKS[(pay.rankAfter + 1) as DispatcherRank].label
                          : 'nächster Rang'
                      }`
                    )}
                  </div>
                  {pay.expToNext != null && (
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-amber-400/90"
                        style={{
                          width: `${Math.min(100, Math.round((pay.expIntoRank / pay.expToNext) * 100))}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Kpi label="Betriebsbilanz" value={formatEuro(report.balanceEuro)} tone={report.balanceEuro >= 0 ? 'good' : 'bad'} />
            <Kpi label="Einnahmen" value={formatEuro(report.revenueEuro)} />
            <Kpi label="Störung/Pönale" value={formatEuro(-(report.incidentCostEuro + report.penaltyEuro))} tone="bad" />
            <Kpi label="Pünktlichkeit" value={`${report.punctualityPct} %`} tone={report.punctualityPct >= 80 ? 'good' : 'warn'} />
          </section>

          <p className="text-xs text-slate-400">{report.gradeReason}</p>

          <section>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <Train className="h-3.5 w-3.5" />
              Gefahrene Züge & Loks
            </h3>
            {report.trains.length === 0 ? (
              <Empty>Keine Züge in dieser Schicht erfasst.</Empty>
            ) : (
              <ul className="space-y-1">
                {report.trains.map((t) => (
                  <li
                    key={t.assignmentId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-700/50 bg-slate-950/40 px-2.5 py-1.5 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-slate-100">{t.label}</div>
                      <div className="truncate text-slate-400">
                        {t.locoName} · {t.origin} → {t.dest}
                      </div>
                    </div>
                    <StatusPill
                      cancelled={t.cancelled}
                      completed={t.completed}
                      late={t.late}
                      delayMinutes={t.delayMinutes}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Gelöste Incidents / Tf-Anrufe
            </h3>
            {report.resolvedIncidents.length === 0 ? (
              <Empty>Keine Störungen bearbeitet.</Empty>
            ) : (
              <ul className="space-y-1">
                {report.resolvedIncidents.map((inc) => (
                  <li
                    key={inc.incidentId}
                    className="rounded-md border border-slate-700/50 bg-slate-950/40 px-2.5 py-1.5 text-xs"
                  >
                    <div className="font-bold text-slate-100">{inc.title}</div>
                    <div className="text-slate-400">
                      {inc.optionLabel}
                      {inc.costEuro > 0 ? ` · ${formatEuro(inc.costEuro)}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <AlertTriangle className="h-3.5 w-3.5" />
              Offene Vorgänge für die Folgeschicht
            </h3>
            {report.openHandover.length === 0 ? (
              <Empty>Keine offenen Züge — saubere Übergabe.</Empty>
            ) : (
              <ul className="space-y-1">
                {report.openHandover.map((o) => (
                  <li
                    key={o.assignmentId}
                    className="rounded-md border border-amber-500/30 bg-amber-950/20 px-2.5 py-1.5 text-xs"
                  >
                    <div className="font-bold text-amber-100">{o.label}</div>
                    <div className="text-amber-100/70">
                      {o.locoName} · {o.origin} → {o.dest}
                    </div>
                    <div className="mt-0.5 text-amber-200/80">{o.note}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-700/60 px-4 py-3">
          <button type="button" className="btn-ghost-sm" onClick={onClose}>
            Später
          </button>
          <button type="button" className="btn-gold-sm" onClick={onStartNext}>
            Nächste Schicht starten · {report.nextLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'bad' | 'warn';
}) {
  const color =
    tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-rose-300' : tone === 'warn' ? 'text-amber-300' : 'text-slate-100';
  return (
    <div className="rounded-md border border-slate-700/50 bg-slate-950/40 px-2.5 py-2">
      <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-slate-700/40 bg-slate-950/30 px-3 py-2 text-xs text-slate-500">{children}</p>;
}

function StatusPill({
  cancelled,
  completed,
  late,
  delayMinutes,
}: {
  cancelled: boolean;
  completed: boolean;
  late: boolean;
  delayMinutes: number;
}) {
  if (cancelled) {
    return <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">Abgebrochen</span>;
  }
  if (completed && late) {
    return (
      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
        Verspätet{delayMinutes > 0 ? ` +${Math.round(delayMinutes / 60)} h` : ''}
      </span>
    );
  }
  if (completed) {
    return <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">Pünktlich</span>;
  }
  return <span className="rounded bg-slate-600/40 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">Unterwegs</span>;
}
