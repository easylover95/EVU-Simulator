import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { secondaryButtonClass } from '@/components/ui';
import {
  buildDefaultKpis,
  type SectionKpi,
  type SectionPulse,
} from '@/lib/sectionMetrics';

interface SectionPulseBag {
  pulse: SectionPulse;
  onBack: () => void;
}

const SectionPulseContext = createContext<SectionPulseBag | null>(null);

/** Provides a shared operating snapshot to views rendered within the application shell. */
export function SectionPulseProvider({
  pulse,
  onBack,
  children,
}: {
  pulse: SectionPulse;
  onBack: () => void;
  children: ReactNode;
}) {
  const bag = useMemo(() => ({ pulse, onBack }), [pulse, onBack]);
  return <SectionPulseContext.Provider value={bag}>{children}</SectionPulseContext.Provider>;
}

function useSectionPulse(): SectionPulseBag | null {
  return useContext(SectionPulseContext);
}

export function SectionShell({
  title,
  subtitle,
  actions,
  onBack,
  backLabel = 'Zurück zur Zentrale',
  kpis,
  pulse,
  hideBack = false,
  tutorialId,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  kpis?: SectionKpi[];
  pulse?: SectionPulse;
  hideBack?: boolean;
  tutorialId?: string;
  children: ReactNode;
}) {
  const bag = useSectionPulse();
  const live = pulse ?? bag?.pulse;
  const goBack = onBack ?? bag?.onBack;
  const strip = kpis ?? (live ? buildDefaultKpis(live) : []);

  return (
    <div className="space-y-5" data-tutorial={tutorialId}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-amber-500/15 pb-5">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {actions}
          {!hideBack && goBack && (
            <button type="button" onClick={goBack} className={`text-xs ${secondaryButtonClass}`}>
              <ArrowLeft className="h-3.5 w-3.5" />
              {backLabel}
            </button>
          )}
        </div>
      </div>

      {strip.length > 0 && (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          {strip.map((kpi) => (
            <div key={kpi.label} className="app-section-kpi app-glass rounded-xl p-3 text-center">
              <div className="app-section-kpi-label text-[10px] font-bold uppercase tracking-wider text-slate-500">{kpi.label}</div>
              <div className="app-section-kpi-value mt-1 text-lg font-bold tabular-nums text-amber-400">{kpi.value}</div>
              {kpi.hint && <div className="app-section-kpi-hint mt-0.5 text-[10px] text-slate-500">{kpi.hint}</div>}
            </div>
          ))}
        </div>
      )}

      {children}
    </div>
  );
}
