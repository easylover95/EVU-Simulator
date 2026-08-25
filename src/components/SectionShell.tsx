import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Company, Driver, Locomotive, Wagon } from '@/lib/supabase';
import { formatEuro } from '@/lib/status';
import { secondaryButtonClass } from '@/components/ui';
import {
  emptyDepotState,
  locoBerthCap,
  wagonBerthCap,
  wagonUnitCount,
  type DepotState,
} from '@/lib/depot';

/** Live yard snapshot for the compact KPI strip. Provided once from App. */
export interface SectionPulse {
  company: Company | null;
  locomotives: Locomotive[];
  drivers: Driver[];
  wagons: Wagon[];
  depot?: DepotState;
}

export interface SectionKpi {
  label: string;
  value: ReactNode;
  hint?: string;
}

interface SectionPulseBag {
  pulse: SectionPulse;
  onBack: () => void;
}

const SectionPulseContext = createContext<SectionPulseBag | null>(null);

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

export function useSectionPulse(): SectionPulseBag | null {
  return useContext(SectionPulseContext);
}

export function yardBerthCap(depot: DepotState | null | undefined): number {
  return locoBerthCap(depot ?? emptyDepotState());
}

export function freeYardBerths(depot: DepotState | null | undefined, parkedLocos: number): number {
  return Math.max(0, yardBerthCap(depot) - parkedLocos);
}

export function buildDefaultKpis(pulse: SectionPulse): SectionKpi[] {
  const level = pulse.company?.level ?? 1;
  const depot = pulse.depot ?? emptyDepotState();
  const berths = locoBerthCap(depot);
  const parked = pulse.locomotives.length;
  const wagonCap = wagonBerthCap(depot);
  const wagonUnits = wagonUnitCount(pulse.wagons);
  const activeLocos = pulse.locomotives.filter((l) => l.status === 'einsatz').length;
  const staff = pulse.drivers.length;
  const xp = pulse.company?.xp ?? 0;
  const xpNext = pulse.company?.xp_next ?? 0;

  return [
    {
      label: 'Stellplätze',
      value: `${parked} / ${berths}`,
      hint: `Loks · Wagen ${wagonUnits}/${wagonCap}`,
    },
    {
      label: 'Verfügbares Kapital',
      value: formatEuro(pulse.company?.balance ?? 0),
    },
    {
      label: 'Aktive Fahrzeuge / Personal',
      value: `${activeLocos} / ${staff}`,
      hint: 'Im Einsatz · Mitarbeiter',
    },
    {
      label: 'Firmen-Level',
      value: `Lvl ${level}`,
      hint: xpNext > 0 ? `${xp} / ${xpNext} XP` : undefined,
    },
  ];
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
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {strip.map((kpi) => (
            <div
              key={kpi.label}
              className="app-glass rounded-xl p-3 text-center"
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{kpi.label}</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-amber-400">{kpi.value}</div>
              {kpi.hint && <div className="mt-0.5 text-[10px] text-slate-500">{kpi.hint}</div>}
            </div>
          ))}
        </div>
      )}

      {children}
    </div>
  );
}
