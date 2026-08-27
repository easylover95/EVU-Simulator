import { useEffect, useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Box,
  CheckCircle2,
  Clock3,
  Container,
  Plane,
  Ship,
  TrainFront,
  Warehouse,
} from 'lucide-react';

import { GameplayEventPanel } from '@/components/GameplayEventPanel';
import { Button, Card, CardFlush, CardHeader, StatPill } from '@/components/ui';
import { effectiveCraneCapacityTons } from '@/lib/terminalGameplay';
import { createTerminalDemoSnapshot } from '@/lib/terminalDemo';
import { useTerminalSimulation } from '@/state/terminalSimulationStore';

function formatNumber(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits }).format(value);
}

function useTerminalDemoBootstrap(): boolean {
  const terminalCount = useTerminalSimulation((state) => Object.keys(state.terminalsById).length);
  const replaceSnapshot = useTerminalSimulation((state) => state.replaceSnapshot);

  useEffect(() => {
    if (terminalCount === 0) replaceSnapshot(createTerminalDemoSnapshot());
  }, [replaceSnapshot, terminalCount]);

  return terminalCount > 0;
}

export function TerminalInboundView({ onOpenConfiguration }: { onOpenConfiguration: () => void }) {
  const ready = useTerminalDemoBootstrap();
  const state = useTerminalSimulation((snapshot) => snapshot);

  const overview = useMemo(() => {
    const terminal = Object.values(state.terminalsById)[0];
    if (!terminal) return null;
    const cargoUnits = Object.values(state.cargoUnitsById)
      .filter((unit) => unit.currentTerminalId === terminal.id)
      .map((unit) => ({
        unit,
        cargoType: state.cargoTypesById[unit.cargoTypeId],
        assigned: state.wagonLoads.some((load) => load.cargoUnitId === unit.id),
      }))
      .filter((entry) => Boolean(entry.cargoType))
      .sort((left, right) => {
        const leftPriority = left.cargoType?.priorityOrderForConstructionSite ?? 999;
        const rightPriority = right.cargoType?.priorityOrderForConstructionSite ?? 999;
        return leftPriority - rightPriority;
      });
    const berthedArrivals = Object.values(state.inboundArrivalsById)
      .filter((arrival) => arrival.terminalId === terminal.id && arrival.status === 'BERTHED');
    const storagePercent = terminal.storageAreaSqm > 0
      ? Math.min(100, Math.round((terminal.currentStorageUsedSqm / terminal.storageAreaSqm) * 100))
      : 0;

    return { terminal, cargoUnits, berthedArrivals, storagePercent };
  }, [state]);

  if (!ready || !overview) {
    return <div className="app-glass rounded-xl p-5 text-sm text-slate-400">Terminaldaten werden vorbereitet …</div>;
  }

  const { terminal, cargoUnits, berthedArrivals, storagePercent } = overview;
  const effectiveCraneCapacity = effectiveCraneCapacityTons(
    terminal.maxCraneCapacityTons,
    state.operationalState,
    terminal.id,
    state.currentTick,
  );
  const lueCount = cargoUnits.filter(({ cargoType }) => cargoType?.isOutOfGauge).length;
  const nextTick = () => state.advanceTick();

  return (
    <section className="space-y-4" aria-label="Terminal Inbound">
      <header className="flex flex-col gap-3 border-b border-amber-500/20 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300">
            <Warehouse className="h-3.5 w-3.5" /> Inbound · Terminal Leitstelle
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">{terminal.name}</h2>
          <p className="mt-1 text-sm text-slate-400">Ankunft, Umschlag und Zwischenlagerung für Schwerlast- und Baugleisgüter.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatPill label="Simulationsstunde" value={state.currentTick} valueClass="text-cyan-300" />
          <Button variant="secondary" className="min-h-10" onClick={nextTick}>
            <Clock3 className="h-4 w-4" /> +1 Simulationsstunde
          </Button>
          <Button className="min-h-10" onClick={onOpenConfiguration}>
            Zugbildung öffnen <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="border-cyan-400/25 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Lagerauslastung</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-white">
                {formatNumber(terminal.currentStorageUsedSqm, 0)} <span className="text-sm text-slate-400">/ {formatNumber(terminal.storageAreaSqm, 0)} m²</span>
              </p>
            </div>
            <Warehouse className="h-6 w-6 text-cyan-300" />
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-950/80" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={storagePercent} aria-label="Lagerauslastung">
            <div
              className={`h-full rounded-full ${storagePercent >= 85 ? 'bg-rose-400' : storagePercent >= 70 ? 'bg-amber-400' : 'bg-cyan-400'}`}
              style={{ width: `${storagePercent}%` }}
            />
          </div>
          <p className="mt-2 text-xs font-semibold tabular-nums text-slate-400">{storagePercent} % belegt · {formatNumber(terminal.storageAreaSqm - terminal.currentStorageUsedSqm, 0)} m² frei</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Kran-Kapazität</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${effectiveCraneCapacity === 0 ? 'text-rose-300' : effectiveCraneCapacity < terminal.maxCraneCapacityTons ? 'text-amber-300' : 'text-amber-300'}`}>{formatNumber(effectiveCraneCapacity, 0)} t</p>
            </div>
            <Container className="h-6 w-6 text-amber-300" />
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            {effectiveCraneCapacity === 0
              ? 'Kranwartung aktiv · Umschlag pausiert'
              : effectiveCraneCapacity < terminal.maxCraneCapacityTons
                ? `Eingeschränkter Betrieb · regulär ${formatNumber(terminal.maxCraneCapacityTons, 0)} t`
                : terminal.hasSpecialCrane ? 'Spezialkran betriebsbereit' : 'Nur Standardumschlag verfügbar'}
          </div>
        </Card>

        <Card className={lueCount > 0 ? 'border-amber-400/60 bg-amber-950/25 p-4' : 'p-4'}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Sonderfreigaben</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${lueCount > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>{lueCount}</p>
            </div>
            <AlertTriangle className={`h-6 w-6 ${lueCount > 0 ? 'text-amber-300' : 'text-emerald-300'}`} />
          </div>
          <p className="mt-4 text-xs font-semibold text-slate-300">{lueCount > 0 ? 'LÜ-Fracht vor Zugabfahrt prüfen' : 'Keine offene LÜ-Prüfung'}</p>
        </Card>
      </div>

      <GameplayEventPanel />

      <div className="grid gap-4 md:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.85fr)]">
        <CardFlush>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2"><Box className="h-4 w-4 text-cyan-300" /> Wartende Frachtpartien</span>
              <span className="text-slate-500">{cargoUnits.length} Einheiten</span>
            </div>
          </CardHeader>
          <div className="divide-y divide-slate-700/60">
            {cargoUnits.map(({ unit, cargoType, assigned }) => {
              if (!cargoType) return null;
              const isExpected = unit.status === 'EXPECTED';
              return (
                <div key={unit.id} className={`flex min-h-[4.5rem] items-center gap-3 px-4 py-3 ${cargoType.isOutOfGauge ? 'bg-amber-950/25' : 'bg-slate-950/10'}`}>
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${cargoType.isOutOfGauge ? 'border-amber-400/50 bg-amber-400/10 text-amber-300' : 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300'}`}>
                    {cargoType.isOutOfGauge ? <AlertTriangle className="h-4 w-4" /> : <Box className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-bold text-slate-100">{cargoType.name}</p>
                      {cargoType.isOutOfGauge && <span className="fi-pill fi-pill-gold">LÜ</span>}
                      {cargoType.requiresSpecialCrane && <span className="fi-pill fi-pill-blue">Spezialkran</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">{formatNumber(cargoType.weightTons, 1)} t · {formatNumber(unit.storageAreaSqm, 0)} m² · Baustellenschritt {cargoType.priorityOrderForConstructionSite}</p>
                  </div>
                  <span className={`fi-pill ${assigned ? 'fi-pill-blue' : isExpected ? 'fi-pill-orange' : 'fi-pill-green'}`}>
                    {assigned ? 'Zugewiesen' : isExpected ? 'In Ankunft' : 'Eingelagert'}
                  </span>
                </div>
              );
            })}
          </div>
        </CardFlush>

        <CardFlush>
          <CardHeader><span className="flex items-center gap-2"><Ship className="h-4 w-4 text-cyan-300" /> Wartende Ankünfte</span></CardHeader>
          <div className="space-y-3 p-4">
            {berthedArrivals.length > 0 ? berthedArrivals.map((arrival) => {
              const feeStartsIn = Math.max(0, arrival.freeBerthUntilTick - state.currentTick);
              const ModeIcon = arrival.mode === 'SHIP' ? Ship : Plane;
              return (
                <div key={arrival.id} className="rounded-lg border border-slate-700/70 bg-slate-950/35 p-3">
                  <div className="flex items-start gap-2">
                    <ModeIcon className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-100">{arrival.label}</p>
                      <p className="mt-1 text-xs text-slate-400">{arrival.mode === 'SHIP' ? 'Binnenschiff am Liegeplatz' : 'Frachtflugzeug im Umschlagfenster'}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-700/60 pt-2 text-xs">
                    <span className={feeStartsIn === 0 ? 'font-bold text-rose-300' : 'text-slate-400'}>{feeStartsIn === 0 ? 'Liegegebühr aktiv' : `Freiliegezeit: ${feeStartsIn} h`}</span>
                    <span className="font-bold tabular-nums text-amber-300">{formatNumber(arrival.laytimeFeeCentsPerTick / 100, 0)} € / h</span>
                  </div>
                </div>
              );
            }) : <p className="py-4 text-sm text-slate-500">Keine Fahrzeuge warten am Terminal.</p>}
            <div className="rounded-lg border border-cyan-400/20 bg-cyan-950/20 p-3 text-xs leading-relaxed text-cyan-100/80">
              Liegegebühren werden ausschließlich beim bewussten Fortsetzen der Simulation verbucht.
            </div>
            <Button variant="secondary" className="w-full min-h-11" onClick={onOpenConfiguration}>
              <TrainFront className="h-4 w-4" /> Zum Baugleis-Zug
            </Button>
          </div>
        </CardFlush>
      </div>
    </section>
  );
}
