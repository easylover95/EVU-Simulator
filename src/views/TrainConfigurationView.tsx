import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Gauge,
  PackagePlus,
  Plus,
  TrainFront,
  X,
} from 'lucide-react';

import { Button, Card, CardFlush, CardHeader, StatPill } from '@/components/ui';
import { createTerminalDemoSnapshot } from '@/lib/terminalDemo';
import { checkTrainFeasibility } from '@/lib/terminalLogistics';
import type { CargoType, CargoUnit, Wagon } from '@/lib/terminalEntities';
import { useTerminalSimulation } from '@/state/terminalSimulationStore';

function formatNumber(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits }).format(value);
}

function reasonLabel(reason?: string): string {
  const labels: Record<string, string> = {
    TRAIN_NOT_ASSEMBLING: 'Der Zug kann außerhalb der Zugbildung nicht verändert werden.',
    WAGON_UNAVAILABLE: 'Dieser Wagen ist aktuell nicht verfügbar.',
    WAGON_ALREADY_ASSIGNED: 'Dieser Wagen gehört bereits zu einem Zugverband.',
    TERMINAL_MISMATCH: 'Wagen und Fracht müssen sich am Abfahrtsterminal befinden.',
    PAYLOAD_EXCEEDED: 'Die Nutzlast dieses Wagens würde überschritten.',
    CARGO_ALREADY_ASSIGNED: 'Diese Frachtpartie ist bereits einem Wagen zugewiesen.',
    CARGO_NOT_IN_STORAGE: 'Nur eingelagerte Fracht darf zugewiesen werden.',
  };
  return labels[reason ?? ''] ?? 'Die gewünschte Änderung konnte nicht ausgeführt werden.';
}

function useTerminalDemoBootstrap(): boolean {
  const terminalCount = useTerminalSimulation((state) => Object.keys(state.terminalsById).length);
  const replaceSnapshot = useTerminalSimulation((state) => state.replaceSnapshot);
  useEffect(() => {
    if (terminalCount === 0) replaceSnapshot(createTerminalDemoSnapshot());
  }, [replaceSnapshot, terminalCount]);
  return terminalCount > 0;
}

interface BottomSheetProps {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}

function BottomSheet({ title, children, onClose }: BottomSheetProps) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-slate-950/75 p-0 backdrop-blur-[2px] md:items-center md:justify-center md:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Auswahl schließen" onClick={onClose} />
      <section className="relative max-h-[82dvh] w-full overflow-hidden rounded-t-2xl border border-amber-500/35 bg-slate-950 shadow-2xl md:max-w-xl md:rounded-2xl">
        <header className="flex items-center justify-between border-b border-amber-500/20 px-4 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300">Tap-to-Select</p>
            <h3 className="mt-0.5 text-base font-bold text-white">{title}</h3>
          </div>
          <button type="button" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-600 text-slate-300 hover:border-amber-400 hover:text-amber-200" onClick={onClose} aria-label="Auswahl schließen">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="max-h-[calc(82dvh-5.25rem)] overflow-y-auto p-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">{children}</div>
      </section>
    </div>
  );
}

interface TrainFormationCardProps {
  wagon: Wagon;
  cargoEntries: Array<{ unit: CargoUnit; type: CargoType }>;
  onSelectCargo: () => void;
  onRemoveWagon: () => void;
  onRemoveCargo: (cargoUnitId: string) => void;
}

function TrainFormationCard({ wagon, cargoEntries, onSelectCargo, onRemoveWagon, onRemoveCargo }: TrainFormationCardProps) {
  const payload = cargoEntries.reduce((sum, entry) => sum + entry.type.weightTons, 0);
  return (
    <article className="rounded-xl border border-slate-700/90 bg-slate-950/45 p-3 shadow-inner shadow-black/20">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-cyan-400/40 bg-cyan-400/10 text-xs font-black tabular-nums text-cyan-200">{wagon.positionInTrain}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-bold text-slate-100">{wagon.uicWagonType}</h4>
            <span className="text-xs tabular-nums text-slate-500">{formatNumber(wagon.lengthOverBuffersMeters)} m LÜP</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Nutzlast {formatNumber(payload)} / {formatNumber(wagon.maxPayloadTons)} t</p>
        </div>
        <button type="button" onClick={onRemoveWagon} className="min-h-10 rounded-lg border border-slate-600 px-2 text-[10px] font-bold uppercase tracking-wide text-slate-400 hover:border-rose-400 hover:text-rose-300" aria-label={`${wagon.uicWagonType} aus Zug entfernen`}>
          Lösen
        </button>
      </div>

      <div className="mt-3 space-y-2 border-t border-slate-700/60 pt-3">
        {cargoEntries.map(({ unit, type }) => (
          <div key={unit.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${type.isOutOfGauge ? 'border-amber-400/50 bg-amber-950/25' : 'border-slate-700 bg-slate-900/50'}`}>
            {type.isOutOfGauge ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" /> : <ClipboardCheck className="h-4 w-4 shrink-0 text-cyan-300" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-slate-100">{type.name}</p>
              <p className="text-[10px] text-slate-400">{formatNumber(type.weightTons)} t · Schritt {type.priorityOrderForConstructionSite}</p>
            </div>
            {type.isOutOfGauge && <span className="fi-pill fi-pill-gold">LÜ</span>}
            <button type="button" onClick={() => onRemoveCargo(unit.id)} className="min-h-9 rounded-md px-2 text-[10px] font-bold uppercase text-slate-400 hover:bg-rose-950/40 hover:text-rose-300">Entfernen</button>
          </div>
        ))}
        <button type="button" onClick={onSelectCargo} className="flex min-h-12 w-full items-center justify-between rounded-lg border border-dashed border-cyan-400/45 bg-cyan-950/15 px-3 text-left text-xs font-bold text-cyan-200 transition hover:bg-cyan-900/30">
          <span className="flex items-center gap-2"><PackagePlus className="h-4 w-4" /> Fracht zuweisen</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}

function MetricCard({ label, value, hint, tone = 'cyan', progress }: { label: string; value: React.ReactNode; hint: string; tone?: 'cyan' | 'amber' | 'emerald' | 'rose'; progress?: number }) {
  const colors = {
    cyan: 'text-cyan-300 bg-cyan-400',
    amber: 'text-amber-300 bg-amber-400',
    emerald: 'text-emerald-300 bg-emerald-400',
    rose: 'text-rose-300 bg-rose-400',
  }[tone];
  const [textColor, fillColor] = colors.split(' ');
  return (
    <Card className="p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${textColor}`}>{value}</p>
      {progress !== undefined && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-950"><div className={`h-full rounded-full ${fillColor}`} style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></div>}
      <p className="mt-1 text-[10px] leading-snug text-slate-500">{hint}</p>
    </Card>
  );
}

export function TrainConfigurationView({ onBack }: { onBack: () => void }) {
  const ready = useTerminalDemoBootstrap();
  const state = useTerminalSimulation((snapshot) => snapshot);
  const [selectedTrainId, setSelectedTrainId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ mode: 'WAGON' } | { mode: 'CARGO'; wagonId: string } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const data = useMemo(() => {
    const trains = Object.values(state.trainsById);
    const train = trains.find((candidate) => candidate.id === selectedTrainId) ?? trains[0];
    if (!train) return null;
    const terminal = state.terminalsById[train.terminalId];
    if (!terminal) return null;
    const wagons = Object.values(state.wagonsById)
      .filter((wagon) => wagon.currentTrainId === train.id)
      .sort((left, right) => (left.positionInTrain ?? 0) - (right.positionInTrain ?? 0));
    const wagonIds = new Set(wagons.map((wagon) => wagon.id));
    const loadsByWagon = new Map<string, Array<{ unit: CargoUnit; type: CargoType }>>();
    for (const load of state.wagonLoads.filter((candidate) => wagonIds.has(candidate.wagonId))) {
      const unit = state.cargoUnitsById[load.cargoUnitId];
      const type = state.cargoTypesById[load.cargoTypeId];
      if (!unit || !type) continue;
      const entries = loadsByWagon.get(load.wagonId) ?? [];
      entries.push({ unit, type });
      loadsByWagon.set(load.wagonId, entries);
    }
    const feasibility = checkTrainFeasibility({
      terminal,
      train,
      wagons,
      cargoTypes: Object.values(state.cargoTypesById),
      cargoUnits: Object.values(state.cargoUnitsById),
      wagonLoads: state.wagonLoads.filter((candidate) => wagonIds.has(candidate.wagonId)),
      trainEvents: Object.values(state.trainEventsById).filter((event) => event.trainId === train.id),
    });
    const availableWagons = Object.values(state.wagonsById).filter((wagon) => (
      wagon.currentTerminalId === terminal.id
      && wagon.currentTrainId === null
      && (wagon.status === 'AVAILABLE' || wagon.status === 'RESERVED')
    ));
    const assignedCargoUnitIds = new Set(state.wagonLoads.map((load) => load.cargoUnitId));
    const availableCargo = Object.values(state.cargoUnitsById)
      .filter((unit) => unit.currentTerminalId === terminal.id && unit.status === 'IN_STORAGE' && !assignedCargoUnitIds.has(unit.id))
      .map((unit) => ({ unit, type: state.cargoTypesById[unit.cargoTypeId] }))
      .filter((entry): entry is { unit: CargoUnit; type: CargoType } => Boolean(entry.type));

    return { trains, train, terminal, wagons, loadsByWagon, feasibility, availableWagons, availableCargo };
  }, [selectedTrainId, state]);

  useEffect(() => {
    if (!selectedTrainId && data?.train) setSelectedTrainId(data.train.id);
  }, [data?.train, selectedTrainId]);

  if (!ready || !data) {
    return <div className="app-glass rounded-xl p-5 text-sm text-slate-400">Zugbildungsdaten werden vorbereitet …</div>;
  }

  const { train, terminal, trains, wagons, loadsByWagon, feasibility, availableWagons, availableCargo } = data;
  const lengthPercent = terminal.trackLengthMeters > 0 ? (feasibility.metrics.totalLengthMeters / terminal.trackLengthMeters) * 100 : 0;
  const hardIssues = feasibility.issues.filter((issue) => issue.severity === 'ERROR');
  const assignWagon = (wagonId: string) => {
    const result = state.assignWagonToTrain(wagonId, train.id);
    setFeedback(result.changed ? 'Wagen wurde als nächste Baustellenposition ergänzt.' : reasonLabel(result.reason));
    if (result.changed) setSheet(null);
  };
  const assignCargo = (cargoUnitId: string, wagonId: string) => {
    const result = state.assignCargoToWagon(cargoUnitId, wagonId);
    setFeedback(result.changed ? 'Frachtpartie wurde dem Wagen zugewiesen.' : reasonLabel(result.reason));
    if (result.changed) setSheet(null);
  };

  return (
    <section className="space-y-4" aria-label="Baugleis Zugkonfiguration">
      <header className="flex flex-col gap-3 border-b border-amber-500/20 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300"><TrainFront className="h-3.5 w-3.5" /> Outbound · Baugleis-Disposition</div>
          <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">Zugkonfiguration</h2>
          <p className="mt-1 text-sm text-slate-400">Reihung erfolgt von Baustellenseite: Position 1 wird zuerst entladen.</p>
        </div>
        <Button variant="secondary" className="min-h-10" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Terminalübersicht</Button>
      </header>

      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar" aria-label="Zug auswählen">
        {trains.map((candidate) => (
          <button key={candidate.id} type="button" onClick={() => setSelectedTrainId(candidate.id)} className={`min-h-11 shrink-0 rounded-lg border px-3 text-left text-xs font-bold transition ${candidate.id === train.id ? 'border-amber-400 bg-amber-400/15 text-amber-200' : 'border-slate-700 bg-slate-950/50 text-slate-400 hover:border-slate-500'}`}>
            <span className="block">{candidate.destinationConstructionSite}</span>
            <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide opacity-70">{candidate.status}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <MetricCard label="Zuglänge" value={<>{formatNumber(feasibility.metrics.totalLengthMeters)} <span className="text-sm text-slate-400">/ {formatNumber(terminal.trackLengthMeters)} m</span></>} hint={lengthPercent > 100 ? 'Gleislänge überschritten' : `${formatNumber(feasibility.metrics.remainingTrackLengthMeters)} m Restlänge`} tone={lengthPercent > 100 ? 'rose' : 'cyan'} progress={lengthPercent} />
        <MetricCard label="Gesamtgewicht" value={`${formatNumber(feasibility.metrics.totalWeightTons)} t`} hint={`${formatNumber(feasibility.metrics.totalPayloadTons)} t Zuladung`} tone="cyan" />
        <MetricCard label="Baustellenreihung" value={feasibility.metrics.isOrderValid ? 'Korrekt' : 'Prüfen'} hint="Priorität aufsteigend ab Position 1" tone={feasibility.metrics.isOrderValid ? 'emerald' : 'rose'} />
        <MetricCard label="LÜ-Status" value={feasibility.requiresOutOfGaugeApproval ? 'Freigabe' : 'Frei'} hint={feasibility.requiresOutOfGaugeApproval ? 'Genehmigung vor Abfahrt erforderlich' : 'Keine LÜ-Fracht zugewiesen'} tone={feasibility.requiresOutOfGaugeApproval ? 'amber' : 'emerald'} />
      </div>

      {feedback && <div className="flex items-start justify-between gap-3 rounded-xl border border-cyan-400/30 bg-cyan-950/25 px-3 py-2.5 text-sm text-cyan-100"><span>{feedback}</span><button type="button" className="text-cyan-300 hover:text-white" onClick={() => setFeedback(null)} aria-label="Hinweis schließen"><X className="h-4 w-4" /></button></div>}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_20rem]">
        <CardFlush>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2"><TrainFront className="h-4 w-4 text-cyan-300" /> Zugverband · {train.destinationConstructionSite}</span>
              <StatPill label="Wagen" value={wagons.length} valueClass="text-cyan-300" />
            </div>
          </CardHeader>
          <div className="space-y-3 p-3 md:p-4">
            <div className="rounded-lg border border-amber-500/20 bg-amber-950/15 px-3 py-2 text-xs leading-relaxed text-amber-100/85">
              <strong>Bedienung:</strong> Wähle einen Wagen oder eine Frachtpartie aus der Liste. Die UI ergänzt Wagen immer am Zugende; es gibt kein Drag & Drop.
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {wagons.map((wagon) => <TrainFormationCard key={wagon.id} wagon={wagon} cargoEntries={loadsByWagon.get(wagon.id) ?? []} onSelectCargo={() => setSheet({ mode: 'CARGO', wagonId: wagon.id })} onRemoveWagon={() => {
                const result = state.removeWagonFromTrain(wagon.id, train.id);
                setFeedback(result.changed ? 'Wagen und seine temporären Ladungen wurden gelöst.' : reasonLabel(result.reason));
              }} onRemoveCargo={(cargoUnitId) => {
                const result = state.removeCargoFromWagon(cargoUnitId, wagon.id);
                setFeedback(result.changed ? 'Frachtpartie wurde wieder dem Lager zugeordnet.' : reasonLabel(result.reason));
              }} />)}
              {wagons.length === 0 && <p className="rounded-xl border border-dashed border-slate-600 p-6 text-center text-sm text-slate-500">Noch kein Wagen im Zugverband.</p>}
            </div>
            <button type="button" onClick={() => setSheet({ mode: 'WAGON' })} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-cyan-400/55 bg-cyan-950/20 px-4 text-sm font-bold text-cyan-200 transition hover:bg-cyan-900/35">
              <Plus className="h-5 w-5" /> Wagen antippen und hinzufügen
            </button>
          </div>
        </CardFlush>

        <aside className="space-y-3">
          <Card className={hardIssues.length > 0 ? 'border-rose-400/45 bg-rose-950/20 p-4' : 'border-emerald-400/35 bg-emerald-950/15 p-4'}>
            <div className="flex items-start gap-3">
              {hardIssues.length > 0 ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />}
              <div>
                <p className={`text-sm font-bold ${hardIssues.length > 0 ? 'text-rose-100' : 'text-emerald-100'}`}>{hardIssues.length > 0 ? 'Abfahrt derzeit gesperrt' : 'Zugbildung fachlich zulässig'}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{hardIssues.length > 0 ? 'Die folgenden Regeln müssen vor der Übergabe an die Inspektion gelöst werden.' : 'Kapazität und Baustellenfolge erfüllen die Live-Prüfung.'}</p>
              </div>
            </div>
            {hardIssues.length > 0 && <ul className="mt-3 space-y-2 border-t border-rose-400/20 pt-3">{hardIssues.slice(0, 4).map((issue, index) => <li key={`${issue.code}-${index}`} className="text-xs leading-relaxed text-rose-100/85">{issue.message}</li>)}</ul>}
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2"><Gauge className="h-4 w-4 text-amber-300" /><p className="text-xs font-bold uppercase tracking-wide text-amber-200">Disposition</p></div>
            <dl className="mt-3 space-y-2 text-xs"><div className="flex justify-between gap-3"><dt className="text-slate-500">Status</dt><dd className="font-bold text-slate-200">{train.status}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Terminalgleis</dt><dd className="font-bold tabular-nums text-slate-200">{formatNumber(terminal.trackLengthMeters)} m</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Freie Wagen</dt><dd className="font-bold tabular-nums text-cyan-300">{availableWagons.length}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Freie Fracht</dt><dd className="font-bold tabular-nums text-cyan-300">{availableCargo.length}</dd></div></dl>
          </Card>
        </aside>
      </div>

      {sheet?.mode === 'WAGON' && <BottomSheet title="Wagen zum Zugverband hinzufügen" onClose={() => setSheet(null)}>
        <p className="mb-3 text-xs leading-relaxed text-slate-400">Tippe einen verfügbaren Wagen an. Er wird automatisch als letzte Position eingereiht.</p>
        <div className="space-y-2">{availableWagons.map((wagon) => <button key={wagon.id} type="button" onClick={() => assignWagon(wagon.id)} className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/75 px-3 text-left transition hover:border-cyan-300 hover:bg-cyan-950/25"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300"><TrainFront className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-100">{wagon.uicWagonType}</span><span className="mt-0.5 block text-xs text-slate-400">{formatNumber(wagon.maxPayloadTons)} t · {formatNumber(wagon.lengthOverBuffersMeters)} m LÜP</span></span><ChevronRight className="h-4 w-4 text-cyan-300" /></button>)}{availableWagons.length === 0 && <p className="rounded-xl border border-dashed border-slate-700 p-5 text-center text-sm text-slate-500">Keine passenden Wagen verfügbar.</p>}</div>
      </BottomSheet>}

      {sheet?.mode === 'CARGO' && <BottomSheet title="Frachtpartie zuweisen" onClose={() => setSheet(null)}>
        <p className="mb-3 text-xs leading-relaxed text-slate-400">Tippe eine eingelagerte Frachtpartie an. Die Nutzlast wird vor der Übernahme geprüft.</p>
        <div className="space-y-2">{availableCargo.map(({ unit, type }) => <button key={unit.id} type="button" onClick={() => assignCargo(unit.id, sheet.wagonId)} className={`flex min-h-16 w-full items-center gap-3 rounded-xl border px-3 text-left transition ${type.isOutOfGauge ? 'border-amber-400/40 bg-amber-950/25 hover:border-amber-300' : 'border-slate-700 bg-slate-900/75 hover:border-cyan-300 hover:bg-cyan-950/25'}`}><span className={`flex h-9 w-9 items-center justify-center rounded-lg ${type.isOutOfGauge ? 'bg-amber-400/15 text-amber-300' : 'bg-cyan-400/10 text-cyan-300'}`}>{type.isOutOfGauge ? <AlertTriangle className="h-4 w-4" /> : <PackagePlus className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-sm font-bold text-slate-100">{type.name}{type.isOutOfGauge && <span className="fi-pill fi-pill-gold">LÜ</span>}</span><span className="mt-0.5 block text-xs text-slate-400">{formatNumber(type.weightTons)} t · Schritt {type.priorityOrderForConstructionSite}</span></span><ChevronRight className={`h-4 w-4 ${type.isOutOfGauge ? 'text-amber-300' : 'text-cyan-300'}`} /></button>)}{availableCargo.length === 0 && <p className="rounded-xl border border-dashed border-slate-700 p-5 text-center text-sm text-slate-500">Keine eingelagerte Frachtpartie verfügbar.</p>}</div>
      </BottomSheet>}
    </section>
  );
}
