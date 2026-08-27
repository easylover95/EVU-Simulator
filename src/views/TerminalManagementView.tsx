import { useMemo, useState, type ReactNode } from 'react';
import {
  ArchiveRestore,
  BadgeEuro,
  BriefcaseBusiness,
  ChevronRight,
  HardHat,
  Save,
  Sparkles,
  Trash2,
  Trophy,
  UserRoundPlus,
  Wrench,
  X,
} from 'lucide-react';

import { Button, Card, StatPill } from '@/components/ui';
import { CAMPAIGN_SCENARIOS, SPECIALIST_CATALOG, TERMINAL_UPGRADE_CATALOG, calculateTerminalStaffEffects } from '@/lib/terminalTycoon';
import { useTerminalSimulation } from '@/state/terminalSimulationStore';

function euro(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100);
}

function panelReason(reason?: string): string {
  const labels: Record<string, string> = {
    GAME_NOT_ACTIVE: 'Der Spielstand ist bereits beendet.',
    TERMINAL_NOT_FOUND: 'Das ausgewählte Terminal existiert nicht.',
    UNKNOWN_UPGRADE: 'Dieser Ausbau ist nicht verfügbar.',
    ALREADY_COMPLETED: 'Dieser Ausbau ist bereits abgeschlossen.',
    ALREADY_BUILDING: 'Dieser Ausbau befindet sich bereits im Bau.',
    PREREQUISITE_MISSING: 'Die erforderlichen Vorbedingungen sind noch nicht erfüllt.',
    INSUFFICIENT_CAPITAL: 'Die verfügbare Liquidität reicht für diese Investition nicht aus.',
    ALREADY_EMPLOYED: 'Diese Fachrolle ist bereits am Terminal besetzt.',
  };
  return labels[reason ?? ''] ?? 'Die Aktion konnte nicht ausgeführt werden.';
}

function ManagementSheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-end bg-slate-950/75 backdrop-blur-sm md:items-center md:justify-center md:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 cursor-default" type="button" aria-label="Management schließen" onClick={onClose} />
      <section className="relative max-h-[84dvh] w-full overflow-hidden rounded-t-2xl border border-cyan-400/30 bg-slate-950 shadow-2xl md:max-w-2xl md:rounded-2xl">
        <header className="flex items-center justify-between border-b border-cyan-400/20 px-4 py-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">Terminal-Management</p>
            <h3 className="mt-0.5 text-base font-bold text-white">{title}</h3>
          </div>
          <button className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-600 text-slate-300 hover:border-cyan-300 hover:text-cyan-100" type="button" onClick={onClose} aria-label="Schließen"><X className="h-5 w-5" /></button>
        </header>
        <div className="max-h-[calc(84dvh-5.25rem)] overflow-y-auto p-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">{children}</div>
      </section>
    </div>
  );
}

export function TerminalManagementView({ onOpenTerminal }: { onOpenTerminal: () => void }) {
  const state = useTerminalSimulation((snapshot) => snapshot);
  const [sheet, setSheet] = useState<'UPGRADES' | 'STAFF' | 'SAVE' | 'SCENARIO' | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const data = useMemo(() => {
    const terminal = Object.values(state.terminalsById)[0] ?? null;
    const upgrades = terminal
      ? TERMINAL_UPGRADE_CATALOG.map((definition) => ({
        definition,
        upgrade: Object.values(state.terminalUpgradesById).find((candidate) => candidate.terminalId === terminal.id && candidate.definitionId === definition.id) ?? null,
      }))
      : [];
    const staff = terminal ? Object.values(state.specialistsById).filter((specialist) => specialist.terminalId === terminal.id) : [];
    return { terminal, upgrades, staff, staffEffects: calculateTerminalStaffEffects(staff) };
  }, [state.specialistsById, state.terminalUpgradesById, state.terminalsById]);

  const startUpgrade = (definitionId: string) => {
    if (!data.terminal) return;
    const result = state.startTerminalUpgrade(data.terminal.id, definitionId);
    setFeedback(result.started ? 'Ausbau beauftragt. Die Fertigstellung erfolgt beim bewussten Fortsetzen der Simulation.' : panelReason(result.reason));
  };
  const hire = (role: Parameters<typeof state.hireSpecialist>[1]) => {
    if (!data.terminal) return;
    const result = state.hireSpecialist(data.terminal.id, role);
    setFeedback(result.hired ? `${result.specialist?.name} wurde eingestellt; die Unterhaltskosten beginnen mit dem nächsten Tick.` : panelReason(result.reason));
  };
  const save = () => {
    const result = state.saveGame();
    setFeedback(result.status === 'SAVED' ? `Spielstand gespeichert (${result.lastSavedAt ?? 'jetzt'}).` : (result.errorMessage ?? 'Speichern nicht möglich.'));
  };
  const load = () => {
    const result = state.loadGame();
    setFeedback(result.status === 'SAVED' ? `Spielstand geladen (${result.lastSavedAt ?? 'ohne Zeitstempel'}).` : (result.errorMessage ?? 'Laden nicht möglich.'));
  };
  const clear = () => {
    const result = state.clearSavedGame();
    setFeedback(result.status === 'IDLE' ? 'Lokaler Terminal-Spielstand wurde gelöscht.' : (result.errorMessage ?? 'Löschen nicht möglich.'));
  };

  return (
    <section className="space-y-4" aria-label="Terminal Management">
      <header className="flex flex-col gap-3 border-b border-cyan-400/20 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300"><BriefcaseBusiness className="h-3.5 w-3.5" /> Tycoon-Leitstelle</div>
          <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">Terminal-Management</h2>
          <p className="mt-1 text-sm text-slate-400">Investitionen, Fachkräfte und Spielstände steuern – mit vollständig tickbasierten Folgen.</p>
        </div>
        <Button variant="secondary" className="min-h-10" onClick={onOpenTerminal}>Zur Terminalübersicht <ChevronRight className="h-4 w-4" /></Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <Card className="p-3"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Liquidität</p><p className={`mt-1 text-xl font-bold tabular-nums ${state.companyBalanceCents < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>{euro(state.companyBalanceCents)}</p><p className="mt-1 text-[10px] text-slate-500">Stunde {state.currentTick}</p></Card>
        <Card className="p-3"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Umsatz</p><p className="mt-1 text-xl font-bold tabular-nums text-cyan-300">{euro(state.gameProgress.grossRevenueCents)}</p><p className="mt-1 text-[10px] text-slate-500">Ziel: {euro(state.gameProgress.revenueTargetCents)}</p></Card>
        <Card className="p-3"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Reputation</p><p className="mt-1 text-xl font-bold tabular-nums text-amber-300">{state.gameProgress.reputationPoints} / {state.gameProgress.reputationTarget}</p><p className="mt-1 text-[10px] text-slate-500">Großprojekte: {state.gameProgress.completedMajorProjects}/{state.gameProgress.requiredMajorProjects}</p></Card>
        <Card className="p-3"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Speicherstatus</p><p className={`mt-1 text-xl font-bold ${state.persistence.status === 'SAVED' ? 'text-emerald-300' : state.persistence.status === 'ERROR' ? 'text-rose-300' : 'text-slate-300'}`}>{state.persistence.status === 'SAVED' ? 'Gesichert' : state.persistence.status === 'ERROR' ? 'Fehler' : 'Bereit'}</p><p className="mt-1 truncate text-[10px] text-slate-500">{state.persistence.lastSavedAt ?? 'Noch kein lokaler Spielstand'}</p></Card>
      </div>

      {feedback && <div className="flex items-start justify-between gap-3 rounded-xl border border-cyan-400/35 bg-cyan-950/25 px-3 py-2.5 text-sm text-cyan-100"><span>{feedback}</span><button type="button" className="text-cyan-300 hover:text-white" onClick={() => setFeedback(null)} aria-label="Hinweis schließen"><X className="h-4 w-4" /></button></div>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          { id: 'UPGRADES' as const, icon: Wrench, title: 'Terminalausbau', text: data.terminal ? `${data.upgrades.filter((item) => item.upgrade?.status === 'COMPLETED').length}/${data.upgrades.length} Investitionen abgeschlossen` : 'Szenario wählen, um zu investieren' },
          { id: 'STAFF' as const, icon: HardHat, title: 'Fachpersonal', text: `${data.staff.length} Spezialisten · ${euro(data.staffEffects.upkeepCentsPerTick)} / Tick` },
          { id: 'SAVE' as const, icon: Save, title: 'Spielstand', text: 'Manuell sichern, laden oder lokalen Speicher bereinigen' },
          { id: 'SCENARIO' as const, icon: Trophy, title: 'Kampagne', text: state.activeScenarioId ? (CAMPAIGN_SCENARIOS.find((scenario) => scenario.id === state.activeScenarioId)?.title ?? 'Aktiv') : 'Szenario wählen und neu starten' },
        ].map((item) => {
          const Icon = item.icon;
          return <button key={item.id} type="button" onClick={() => setSheet(item.id)} className="min-h-28 rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-left transition hover:border-cyan-400/65 hover:bg-cyan-950/25 focus:outline-none focus:ring-2 focus:ring-cyan-400"><Icon className="h-5 w-5 text-cyan-300" /><p className="mt-3 text-sm font-bold text-white">{item.title}</p><p className="mt-1 text-xs leading-relaxed text-slate-400">{item.text}</p></button>;
        })}
      </div>

      {sheet === 'UPGRADES' && <ManagementSheet title="Investitionen und Ausbau" onClose={() => setSheet(null)}>
        {!data.terminal ? <p className="rounded-lg border border-dashed border-slate-700 p-5 text-center text-sm text-slate-400">Wähle zuerst eine Kampagne aus.</p> : <div className="space-y-2">{data.upgrades.map(({ definition, upgrade }) => {
          const status = upgrade?.status ?? 'AVAILABLE';
          const building = status === 'BUILDING';
          const completed = status === 'COMPLETED';
          const finishesAt = upgrade?.startedTick == null ? null : upgrade.startedTick + definition.constructionTicks;
          return <article key={definition.id} className={`rounded-xl border p-3 ${completed ? 'border-emerald-400/35 bg-emerald-950/15' : building ? 'border-amber-400/45 bg-amber-950/15' : 'border-slate-700 bg-slate-900/60'}`}><div className="flex items-start justify-between gap-3"><div><h4 className="text-sm font-bold text-white">{definition.name}</h4><p className="mt-1 text-xs leading-relaxed text-slate-400">{definition.description}</p></div><StatPill label="Bauzeit" value={`${definition.constructionTicks} h`} valueClass="text-cyan-300" /></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-700/60 pt-3"><span className="text-xs font-bold tabular-nums text-amber-300">{euro(definition.capitalCostCents)}</span>{completed ? <span className="fi-pill fi-pill-green">Abgeschlossen</span> : building ? <span className="fi-pill fi-pill-gold">Fertig ab h {finishesAt}</span> : <Button disabled={status === 'LOCKED'} className="min-h-10" onClick={() => startUpgrade(definition.id)}>{status === 'LOCKED' ? 'Voraussetzung fehlt' : 'Beauftragen'}</Button>}</div></article>;
        })}</div>}
      </ManagementSheet>}

      {sheet === 'STAFF' && <ManagementSheet title="Fachpersonal und Spezialisten" onClose={() => setSheet(null)}>
        <div className="mb-3 rounded-lg border border-cyan-400/20 bg-cyan-950/20 p-3 text-xs leading-relaxed text-cyan-100/85">Aktive Effekte: <strong>+{data.staffEffects.craneThroughputBonusPercent}% Umschlagleistung</strong>, <strong>−{data.staffEffects.trainErrorRiskReductionPercent}% Fehlerrisiko</strong> und {data.staffEffects.allowsOutOfGaugeDispatch ? <strong>LÜ-Prüfung freigeschaltet</strong> : <strong>keine LÜ-Prüfung verfügbar</strong>}.</div>
        <div className="space-y-2">{SPECIALIST_CATALOG.map((definition) => {
          const employed = data.staff.some((specialist) => specialist.role === definition.role && specialist.status === 'EMPLOYED');
          return <article key={definition.role} className={`rounded-xl border p-3 ${employed ? 'border-emerald-400/35 bg-emerald-950/15' : 'border-slate-700 bg-slate-900/60'}`}><div className="flex items-start gap-3"><UserRoundPlus className="mt-0.5 h-5 w-5 text-cyan-300" /><div className="min-w-0 flex-1"><h4 className="text-sm font-bold text-white">{definition.title}</h4><p className="mt-1 text-xs leading-relaxed text-slate-400">{definition.description}</p></div></div><div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-700/60 pt-3"><span className="text-xs font-bold tabular-nums text-amber-300">{euro(definition.upkeepCentsPerTick)} / Tick</span>{employed ? <span className="fi-pill fi-pill-green">Beschäftigt</span> : <Button disabled={!data.terminal} className="min-h-10" onClick={() => hire(definition.role)}>Einstellen</Button>}</div></article>;
        })}</div>
      </ManagementSheet>}

      {sheet === 'SAVE' && <ManagementSheet title="Speichern und Laden" onClose={() => setSheet(null)}>
        <div className="space-y-3"><p className="rounded-lg border border-slate-700 bg-slate-900/55 p-3 text-xs leading-relaxed text-slate-300">Der Spielstand wird versioniert im lokalen Browserspeicher abgelegt. Nach jedem erfolgreichen Tick und jedem Szenariostart wird außerdem automatisch gesichert.</p><Button className="min-h-12 w-full" onClick={save}><Save className="h-4 w-4" /> Jetzt speichern</Button><Button variant="secondary" className="min-h-12 w-full" onClick={load}><ArchiveRestore className="h-4 w-4" /> Lokalen Spielstand laden</Button><Button variant="secondary" className="min-h-12 w-full border-rose-400/40 text-rose-200 hover:bg-rose-950/35" onClick={clear}><Trash2 className="h-4 w-4" /> Lokalen Spielstand löschen</Button></div>
      </ManagementSheet>}

      {sheet === 'SCENARIO' && <ManagementSheet title="Kampagne auswählen" onClose={() => setSheet(null)}>
        <div className="space-y-3">{CAMPAIGN_SCENARIOS.map((scenario) => <article key={scenario.id} className={`rounded-xl border p-4 ${state.activeScenarioId === scenario.id ? 'border-cyan-400/60 bg-cyan-950/25' : 'border-slate-700 bg-slate-900/60'}`}><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-300">{scenario.difficulty}</p><h4 className="mt-1 text-base font-bold text-white">{scenario.title}</h4><p className="mt-1 text-xs text-slate-400">{scenario.subtitle}</p></div><BadgeEuro className="h-5 w-5 text-cyan-300" /></div><p className="mt-3 text-xs leading-relaxed text-slate-300">{scenario.briefing}</p><dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-700/60 pt-3 text-xs"><div><dt className="text-slate-500">Startkapital</dt><dd className="font-bold text-emerald-300">{euro(scenario.startingBalanceCents)}</dd></div><div><dt className="text-slate-500">Sieg</dt><dd className="font-bold text-slate-200">{scenario.victoryDescription}</dd></div></dl><div className="mt-3 flex justify-end"><Button onClick={() => { const result = state.startCampaignScenario(scenario.id); setFeedback(result.started ? `Kampagne „${scenario.title}“ gestartet und lokal gesichert.` : 'Kampagne konnte nicht gestartet werden.'); if (result.started) setSheet(null); }}><Sparkles className="h-4 w-4" /> Kampagne starten</Button></div></article>)}</div>
      </ManagementSheet>}
    </section>
  );
}
