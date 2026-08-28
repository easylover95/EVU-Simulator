import { memo, useMemo } from 'react';
import {
  AlertTriangle,
  ClipboardList,
  Clock,
  HardHat,
  Package,
  UserCog,
} from 'lucide-react';
import type { Driver, Locomotive, Order, Wagon } from '@/lib/supabase';
import {
  clampOrderMinBrh,
  formatEuro,
  getLocoStatusConfig,
  getOrderTypeConfig,
  timeRemaining,
} from '@/lib/status';
import { getLocoDisplayName } from '@/lib/locoPhotos';
import { BAUGLEIS_MIN_DRIVERS, isBaugleisEinsatz, requiredDriversFor } from '@/lib/orderMarket';
import { evaluateAssignmentFit, isOrderElectrified, trailingLoadT } from '@/lib/traction';
import { ensureMaintenance, isLocoDeployable } from '@/lib/workshop';
import { OrderCostBreakdown } from '@/components/OrderCostBreakdown';
import { availableAzfStaff, isBaugleisOrder, pdlAzfChargeForOrder } from '@/lib/pdl';
import { restStatusHint, REST_WARNING } from '@/lib/restRules';
import type { StaffMeta } from '@/lib/jobcenter';
import { seriesIdForLoco, seriesLabel } from '@/lib/personal';
import { WagonShortageBanner } from '@/components/WagonShortageBanner';
import type { Acquisition } from '@/lib/dealer';
import type { WorldEventState } from '@/lib/events';
import type { HandbookOpenTo } from '@/lib/handbook';
import { checkWagonAvailability } from '@/lib/brh';
import { calculateTrainBrh } from '@/lib/brh';
import {
  type AzfMode,
  type DispatchStep,
  azfReady,
  collectDispatchBlockers,
  canConfirmDispatch,
  forecastCosts,
  qualificationPreview,
  restRowsFor,
  trainLengthPreview,
  trainWeightPreview,
} from '@/lib/dispatchPlan';
import { buildOrderContractCard } from '@/lib/contractCard';
import { QualificationGapBadges } from '@/components/QualificationGapBadges';

const STEPS: ReadonlyArray<{ id: DispatchStep; label: string }> = [
  { id: 1, label: 'Auftrag' },
  { id: 2, label: 'Lok' },
  { id: 3, label: 'Wagen & Personal' },
  { id: 4, label: 'Fahrbereit' },
];

export interface DispatchStepperProps {
  step: DispatchStep;
  onStep: (step: DispatchStep) => void;
  orders: Order[];
  locomotives: Locomotive[];
  drivers: Driver[];
  wagons: Wagon[];
  selectedOrder: Order | null;
  selectedLoco: string;
  selectedDriver: string;
  selectedDriver2: string;
  azfMode: AzfMode;
  selectedAzfId: string;
  onSelectOrder: (order: Order | null) => void;
  onSelectLoco: (id: string) => void;
  onSelectDriver: (id: string) => void;
  onSelectDriver2: (id: string) => void;
  onAzfMode: (mode: AzfMode) => void;
  onSelectAzf: (id: string) => void;
  staffMeta: Record<string, StaffMeta>;
  gameNow: Date;
  tick: number;
  submitting: boolean;
  worldEvents?: WorldEventState;
  onAssign: () => void;
  onOpenHandbook?: (target?: HandbookOpenTo) => void;
  onOpenNetworkDealer?: (pack?: string) => void;
  onBuyMissingWagons?: (typeCode: string, qty: number) => void;
  onQuickAcquireWagons?: (typeCode: string, qty: number, how: Acquisition) => void;
  onOpenBuildings?: () => void;
  freeBerths?: number;
}

const OrderTile = memo(function OrderTile({
  order,
  selected,
  gameNow,
  wagons,
  onSelect,
}: {
  order: Order;
  selected: boolean;
  gameNow: Date;
  wagons: Wagon[];
  onSelect: (order: Order) => void;
}) {
  const typeCfg = getOrderTypeConfig(order.type);
  const card = buildOrderContractCard(order, wagons);
  const time = order.deadline ? timeRemaining(order.deadline, gameNow, { accepted: false }) : null;
  return (
    <button
      type="button"
      onClick={() => onSelect(order)}
      className={`tap-select-card w-full text-left ${selected ? 'tap-select-card--on' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase ${typeCfg.text}`}>
          {card.kind === 'baugleis' ? <HardHat className="h-3 w-3" /> : <Package className="h-3 w-3" />}
          {card.kindLabel}
        </span>
        <span className="font-mono text-[10px] text-slate-500">{order.order_number}</span>
      </div>
      <div className="mt-1 text-xs font-medium text-white">{order.title}</div>
      <div className="mt-0.5 text-[10px] text-slate-500">
        {order.origin} → {order.destination}
      </div>
      <div className="mt-1 flex flex-wrap gap-2 text-[10px]">
        <span className="font-bold text-emerald-400">
          DB {formatEuro(card.contribution)}
          {isBaugleisEinsatz(order) ? '/Tag' : ''}
        </span>
        <span className="text-slate-400">{card.tonnageT.toLocaleString('de-DE')} t</span>
        <span className="text-rose-300">Pönale {card.penaltyLabel}</span>
        {time && (
          <span className={`ml-auto font-bold ${time.critical ? 'text-rose-400' : time.urgent ? 'text-amber-400' : 'text-slate-400'}`}>
            <Clock className="mr-0.5 inline h-2.5 w-2.5" />
            {time.text}
          </span>
        )}
      </div>
    </button>
  );
});

const LocoTile = memo(function LocoTile({
  loco,
  order,
  selected,
  staffMeta,
  driverId,
  onSelect,
}: {
  loco: Locomotive;
  order: Order;
  selected: boolean;
  staffMeta: Record<string, StaffMeta>;
  driverId: string;
  onSelect: (id: string) => void;
}) {
  const maint = ensureMaintenance(loco);
  const deployable = isLocoDeployable(maint);
  const fit = evaluateAssignmentFit(order, loco);
  const series = seriesLabel(seriesIdForLoco(loco));
  const hasSeries = driverId ? staffMeta[driverId]?.seriesIds?.includes(seriesIdForLoco(loco) ?? '') : true;
  const cfg = getLocoStatusConfig(loco.status);
  return (
    <button
      type="button"
      onClick={() => onSelect(loco.id)}
      disabled={!deployable || fit?.ok === false}
      className={`tap-select-card w-full text-left disabled:cursor-not-allowed disabled:opacity-45 ${selected ? 'tap-select-card--on' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-white">{getLocoDisplayName(loco.designation)}</span>
        <span className="text-[10px] uppercase text-slate-400">{cfg.label}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-400">
        <span>{loco.fuel_type === 'elektrik' ? 'Elektro' : loco.fuel_type === 'dual' ? 'Dual' : 'Diesel'}</span>
        <span>Hakenlast {trailingLoadT(loco).toLocaleString('de-DE')} t</span>
        <span>Reichweite {loco.fuel_level}%</span>
        <span>Wartung {Math.round(maint.maintenance?.conditionPct ?? 100)}% · {cfg.label}</span>
        <span className={hasSeries ? 'text-emerald-300' : 'text-amber-300'}>
          {series}
          {driverId && !hasSeries ? ' · Tf ohne Freigabe' : ''}
        </span>
      </div>
    </button>
  );
});

export const DispatchStepper = memo(function DispatchStepper({
  step,
  onStep,
  orders,
  locomotives,
  drivers,
  wagons,
  selectedOrder,
  selectedLoco,
  selectedDriver,
  selectedDriver2,
  azfMode,
  selectedAzfId,
  onSelectOrder,
  onSelectLoco,
  onSelectDriver,
  onSelectDriver2,
  onAzfMode,
  onSelectAzf,
  staffMeta,
  gameNow,
  tick,
  submitting,
  worldEvents,
  onAssign,
  onOpenNetworkDealer,
  onBuyMissingWagons,
  onQuickAcquireWagons,
  onOpenBuildings,
  freeBerths,
}: DispatchStepperProps) {
  const einsatzOrder = isBaugleisEinsatz(selectedOrder);
  const baugleisOrder = isBaugleisOrder(selectedOrder);
  const selectedLocoObj = useMemo(
    () => locomotives.find((loco) => loco.id === selectedLoco) ?? null,
    [locomotives, selectedLoco],
  );
  const selectedDriverObj = useMemo(
    () => drivers.find((driver) => driver.id === selectedDriver) ?? null,
    [drivers, selectedDriver],
  );
  const selectedDriver2Obj = useMemo(
    () => drivers.find((driver) => driver.id === selectedDriver2) ?? null,
    [drivers, selectedDriver2],
  );
  const availableLocos = useMemo(() => {
    return locomotives.filter((loco) => isLocoDeployable(ensureMaintenance(loco)));
  }, [locomotives]);
  const availableDrivers = useMemo(
    () =>
      drivers.filter(
        (driver) => driver.status === 'verfuegbar' && (driver.qualifications ?? []).some((q) => q.toLowerCase() === 'tf'),
      ),
    [drivers],
  );
  const availableAzf = useMemo(
    () => availableAzfStaff(drivers, [selectedDriver, selectedDriver2].filter(Boolean)),
    [drivers, selectedDriver, selectedDriver2],
  );
  const plan = useMemo(
    () =>
      collectDispatchBlockers({
        order: selectedOrder,
        loco: selectedLocoObj,
        driver: selectedDriverObj,
        driver2: selectedDriver2Obj,
        azfMode,
        azfId: selectedAzfId,
        availableAzfIds: availableAzf.map((row) => row.id),
        wagons,
        staffMeta,
        tick,
        worldEvents,
      }),
    [
      selectedOrder,
      selectedLocoObj,
      selectedDriverObj,
      selectedDriver2Obj,
      azfMode,
      selectedAzfId,
      availableAzf,
      wagons,
      staffMeta,
      tick,
      worldEvents,
    ],
  );
  const gaps = useMemo(
    () =>
      qualificationPreview({
        order: selectedOrder,
        loco: selectedLocoObj,
        driver: selectedDriverObj,
        driver2: selectedDriver2Obj,
        wagons,
        staffMeta,
      }),
    [selectedOrder, selectedLocoObj, selectedDriverObj, selectedDriver2Obj, wagons, staffMeta],
  );
  const restRows = useMemo(
    () => restRowsFor([selectedDriverObj, selectedDriver2Obj], gameNow),
    [selectedDriverObj, selectedDriver2Obj, gameNow],
  );
  const brhCheck = useMemo(() => {
    if (!selectedOrder || !selectedLocoObj) return null;
    return calculateTrainBrh(selectedLocoObj, selectedOrder, wagons);
  }, [selectedOrder, selectedLocoObj, wagons]);
  const wagonCheck = useMemo(
    () => (selectedOrder ? checkWagonAvailability(selectedOrder, wagons) : null),
    [selectedOrder, wagons],
  );
  const pdlQuote = selectedOrder && baugleisOrder ? pdlAzfChargeForOrder(selectedOrder, 'pdl') : null;
  const costs = forecastCosts(selectedOrder, selectedLocoObj?.fuel_type, azfMode);
  const ready = canConfirmDispatch(plan) && azfReady({
    order: selectedOrder,
    azfMode,
    azfId: selectedAzfId,
    availableAzfIds: availableAzf.map((row) => row.id),
  });
  const card = selectedOrder ? buildOrderContractCard(selectedOrder, wagons) : null;
  const restWarn = restRows.filter((row) => row.status.violated);

  return (
    <div className="fi-card min-w-0">
      <div className="fi-card-header flex items-center gap-2">
        <ClipboardList className="h-3.5 w-3.5 text-amber-500" />
        Dispo in 4 Schritten · Tipp-Auswahl
      </div>
      <div className="dispatch-stepper-nav" role="tablist" aria-label="Dispositions-Schritte">
        {STEPS.map((row) => (
          <button
            key={row.id}
            type="button"
            role="tab"
            aria-selected={step === row.id}
            className={`dispatch-step ${step === row.id ? 'dispatch-step--on' : ''}`}
            onClick={() => onStep(row.id)}
          >
            <span>{row.id}</span>
            {row.label}
          </button>
        ))}
      </div>
      <div className="space-y-3 p-3">
        {step === 1 && (
          <div className="max-h-[min(52vh,420px)] space-y-1 overflow-y-auto">
            {orders.length === 0 && <p className="py-8 text-center text-xs text-slate-500">Keine offenen Aufträge</p>}
            {orders.map((order) => (
              <OrderTile
                key={order.id}
                order={order}
                selected={selectedOrder?.id === order.id}
                gameNow={gameNow}
                wagons={wagons}
                onSelect={(next) => {
                  onSelectOrder(next);
                  onStep(2);
                }}
              />
            ))}
          </div>
        )}

        {step === 2 && (
          <>
            {!selectedOrder ? (
              <p className="py-8 text-center text-xs text-slate-500">Zuerst einen Auftrag in Schritt 1 wählen.</p>
            ) : (
              <>
                <p className="text-[10px] text-slate-500">
                  {isOrderElectrified(selectedOrder) ? 'Oberleitung vorhanden' : 'ohne Fahrdraht'} · Hakenlast muss {selectedOrder.weight_t.toLocaleString('de-DE')} t tragen
                  {einsatzOrder ? ' · nur Diesel/Dual-Baulok' : ''}
                </p>
                <div className="max-h-[min(48vh,380px)] space-y-1 overflow-y-auto">
                  {availableLocos.map((loco) => (
                    <LocoTile
                      key={loco.id}
                      loco={loco}
                      order={selectedOrder}
                      selected={selectedLoco === loco.id}
                      staffMeta={staffMeta}
                      driverId={selectedDriver}
                      onSelect={(id) => {
                        onSelectLoco(id);
                        onStep(3);
                      }}
                    />
                  ))}
                  {availableLocos.length === 0 && (
                    <p className="text-[11px] text-rose-400">Keine einsatzbereiten Triebfahrzeuge.</p>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {step === 3 && (
          <>
            {!selectedOrder ? (
              <p className="py-8 text-center text-xs text-slate-500">Auftrag und Lok zuerst wählen.</p>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-3 text-[11px]">
                  <div className="rounded-sm border border-slate-700 bg-slate-900/40 p-2">
                    Nutzlänge {trainLengthPreview(selectedOrder, wagons)?.toLocaleString('de-DE') ?? '—'} m
                  </div>
                  <div className="rounded-sm border border-slate-700 bg-slate-900/40 p-2">
                    Gesamtgewicht {trainWeightPreview(selectedOrder, selectedLocoObj, wagons)?.toLocaleString('de-DE') ?? '—'} t
                  </div>
                  <div className="rounded-sm border border-slate-700 bg-slate-900/40 p-2">
                    Brh-Soll {clampOrderMinBrh(selectedOrder.type, selectedOrder.min_brh)}
                  </div>
                </div>
                <QualificationGapBadges gaps={gaps} />
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase text-slate-400">
                    {einsatzOrder ? 'Tf 1 (Schicht A)' : 'Triebfahrzeugführer'}
                  </p>
                  <div className="space-y-1">
                    {availableDrivers.map((driver) => {
                      const rest = restRowsFor([driver], gameNow)[0];
                      const series = seriesIdForLoco(selectedLocoObj);
                      const missing = series && !staffMeta[driver.id]?.seriesIds?.includes(series);
                      const on = selectedDriver === driver.id;
                      return (
                        <button
                          key={driver.id}
                          type="button"
                          onClick={() => onSelectDriver(driver.id)}
                          className={`tap-select-card w-full text-left ${on ? 'tap-select-card--on' : ''}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-white">{driver.name}</span>
                            <span className="text-[10px] text-slate-400">{rest?.dutyLabel}</span>
                          </div>
                          <div className="mt-0.5 text-[10px] text-slate-400">
                            {rest?.remainingHours ?? 0}h im 48h-Fenster frei · Ruhe {rest?.status.restHours ?? 0}h
                            {missing ? ` · keine ${seriesLabel(series)}` : ''}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {einsatzOrder && (
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase text-slate-400">Tf 2 (Schicht B)</p>
                    <div className="space-y-1">
                      {availableDrivers
                        .filter((driver) => driver.id !== selectedDriver)
                        .map((driver) => {
                          const rest = restRowsFor([driver], gameNow)[0];
                          const on = selectedDriver2 === driver.id;
                          return (
                            <button
                              key={driver.id}
                              type="button"
                              onClick={() => onSelectDriver2(driver.id)}
                              className={`tap-select-card w-full text-left ${on ? 'tap-select-card--on' : ''}`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-white">{driver.name}</span>
                                <span className="text-[10px] text-slate-400">{rest?.dutyLabel}</span>
                              </div>
                            </button>
                          );
                        })}
                    </div>
                    {availableDrivers.length < BAUGLEIS_MIN_DRIVERS && (
                      <p className="mt-1 text-[10px] text-rose-400">
                        Mindestens {BAUGLEIS_MIN_DRIVERS} verfügbare Tf für den Schichtwechsel
                      </p>
                    )}
                  </div>
                )}
                {baugleisOrder && (
                  <div className="rounded-sm border border-orange-400/70 bg-orange-950/30 p-2.5">
                    <div className="text-[11px] font-bold uppercase text-orange-200">AZF/RB</div>
                    <div className="mt-2 grid gap-2">
                      <button
                        type="button"
                        disabled={availableAzf.length === 0}
                        onClick={() => {
                          onAzfMode('eigen');
                          onSelectAzf(availableAzf[0]?.id ?? '');
                        }}
                        className={`tap-select-card text-left ${azfMode === 'eigen' ? 'tap-select-card--on' : ''}`}
                      >
                        <UserCog className="mr-1 inline h-3 w-3" />
                        Eigenes Personal
                        <span className="mt-0.5 block text-[10px] text-slate-400">
                          {availableAzf.length === 0 ? 'Kein freier AZF/RB' : `${availableAzf.length} verfügbar`}
                        </span>
                      </button>
                      {azfMode === 'eigen' && availableAzf.length > 0 && (
                        <div className="space-y-1">
                          {availableAzf.map((person) => (
                            <button
                              key={person.id}
                              type="button"
                              onClick={() => onSelectAzf(person.id)}
                              className={`tap-select-card w-full text-left ${selectedAzfId === person.id ? 'tap-select-card--on' : ''}`}
                            >
                              {person.name}
                            </button>
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          onAzfMode('pdl');
                          onSelectAzf('');
                        }}
                        className={`tap-select-card text-left ${azfMode === 'pdl' ? 'tap-select-card--on' : ''}`}
                      >
                        PDL buchen
                        {pdlQuote && (
                          <span className="mt-0.5 block text-[10px] text-orange-300">{formatEuro(pdlQuote.daily)} / Schicht</span>
                        )}
                      </button>
                    </div>
                  </div>
                )}
                {restRows.length > 0 && (
                  <div className="rounded-sm border border-slate-700 bg-slate-900/40 p-2 text-[11px] text-slate-300">
                    {restRows.map((row) => (
                      <div key={row.driverId}>
                        {row.name}: {row.dutyLabel} · {row.remainingHours}h Arbeitsfenster · Ruhe {row.status.restHours}h
                      </div>
                    ))}
                  </div>
                )}
                {wagonCheck && selectedOrder.required_wagon_type && !wagonCheck.sufficient && (
                  <WagonShortageBanner
                    check={wagonCheck}
                    onQuickAcquire={onQuickAcquireWagons}
                    onOpenDealer={onBuyMissingWagons}
                    onOpenBuildings={onOpenBuildings}
                    freeBerths={freeBerths}
                  />
                )}
                {brhCheck && (
                  <p className={`text-[11px] ${brhCheck.passed ? 'text-emerald-300' : 'text-rose-300'}`}>{brhCheck.message}</p>
                )}
                <button type="button" className="btn-gold w-full" onClick={() => onStep(4)}>
                  Zur Abfahrt prüfen
                </button>
              </>
            )}
          </>
        )}

        {step === 4 && (
          <>
            {!selectedOrder ? (
              <p className="py-8 text-center text-xs text-slate-500">Dispo unvollständig.</p>
            ) : (
              <div className="space-y-3">
                <div className="rounded-sm border border-amber-600/40 bg-amber-900/15 p-2">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Abfahrt</div>
                  <div className="text-xs font-bold text-white">{selectedOrder.title}</div>
                  <div className="text-[10px] text-slate-500">
                    {selectedOrder.origin} → {selectedOrder.destination}
                    {einsatzOrder ? ` · ${requiredDriversFor(selectedOrder)} Tf` : ''}
                  </div>
                  {card && (
                    <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-400">
                      <span>{card.tractionLabel}</span>
                      <span>{card.tonnageT.toLocaleString('de-DE')} t</span>
                      {card.usableLengthM != null && <span>{card.usableLengthM.toLocaleString('de-DE')} m Nutzlänge</span>}
                    </div>
                  )}
                </div>
                <OrderCostBreakdown
                  order={selectedOrder}
                  fuelType={selectedLocoObj?.fuel_type}
                  compact
                  azfSource={azfMode === 'eigen' ? 'eigen' : 'pdl'}
                  azfUnresolved={baugleisOrder && azfMode === 'none'}
                />
                {costs && (
                  <p className="text-[11px] text-slate-300">
                    Kostenprognose {formatEuro(costs.total)} · Deckungsbeitrag {formatEuro(costs.netProfit)}
                  </p>
                )}
                {restWarn.length > 0 && (
                  <div className="flex items-start gap-2 rounded-sm border border-rose-500 bg-rose-950/40 p-2 text-[11px] text-rose-200">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div>
                      <div className="font-bold">{REST_WARNING}</div>
                      <p>Zuweisung bleibt möglich. {restWarn.map((row) => restStatusHint(row.status)).filter(Boolean).join(' · ')}</p>
                    </div>
                  </div>
                )}
                <QualificationGapBadges gaps={gaps} />
                {plan.length > 0 && (
                  <ul className="space-y-1 rounded-sm border border-rose-600/50 bg-rose-950/30 p-2 text-[11px] text-rose-200">
                    {plan.map((row) => (
                      <li key={row.code}>
                        Schritt {row.step}: {row.message}
                      </li>
                    ))}
                  </ul>
                )}
                {plan.some((row) => row.code === 'network') && onOpenNetworkDealer && (
                  <button type="button" className="text-[10px] font-bold uppercase text-amber-300 underline" onClick={() => onOpenNetworkDealer()}>
                    Zum Händler / Netzzugang
                  </button>
                )}
                <button type="button" onClick={onAssign} disabled={!ready || submitting} className="btn-gold w-full disabled:cursor-not-allowed disabled:opacity-30">
                  {submitting ? 'Wird zugewiesen…' : 'Zug abfahren / Bestätigen'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});
