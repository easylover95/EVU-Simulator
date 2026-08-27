import { useMemo, useState } from 'react';
import { Train, Fuel, Zap, ClipboardList, Search, Info, Boxes, Handshake, Cpu } from 'lucide-react';
import type { Locomotive, Wagon } from '@/lib/supabase';
import { formatEuro, getLocoStatusConfig, getLocoPillClass, getWagonPillClass, getWagonStatusConfig } from '@/lib/status';
import { ProgressBar } from '@/components/Badges';
import { EtcsBadge } from '@/components/EtcsBadge';
import { EtcsRetrofitModal } from '@/components/EtcsRetrofitModal';
import { PhotoCardHeader } from '@/components/LocoPhoto';
import { getLocoDisplayName } from '@/lib/locoPhotos';
import { offerForLoco } from '@/lib/dealer';
import {
  allFristen,
  canBookWorkshopJob,
  CONDITION_CLASSES,
  ensureMaintenance,
  etcsRetrofitConfirmWarning,
  formatFristPair,
  isLocoDeployable,
  locoHasEtcsEquipment,
  quoteWorkshopJob,
  usedWorkshopSlots,
  WORKSHOP_LEVELS,
  type WorkshopChannel,
  type WorkshopJob,
  type WorkshopJobKind,
} from '@/lib/workshop';
import { useGameClock } from '@/lib/GameClockContext';
import { SectionShell } from '@/components/SectionShell';
import { DepotUpgradePanel } from '@/components/DepotUpgradePanel';
import { VehicleCard } from '@/components/VehicleCard';
import { WagonRentModal } from '@/components/WagonRentModal';
import { Button } from '@/components/ui';
import { activeWagonRental, type RentalState, type RentalTermMonths } from '@/lib/rental';
import { locoBerthCap, workshopSlotCap, type DepotState } from '@/lib/depot';
import { canSpend } from '@/lib/bank';
import { activeLivery, liveryCssClass } from '@/lib/achievements';
import type { AchievementState } from '@/lib/achievements';

interface FleetViewProps {
  locomotives: Locomotive[];
  wagons: Wagon[];
  rentals: RentalState;
  workshopJobs?: WorkshopJob[];
  depot: DepotState;
  companyLevel: number;
  balance: number;
  overdraftLimit?: number;
  loading: boolean;
  onDisponieren?: (loco: Locomotive) => void;
  onOpenWagenpark?: () => void;
  onRentWagons: (wagonId: string, months: RentalTermMonths) => boolean;
  onBuyDepotExpansion: (expansionId: string) => boolean;
  onStartWorkshopJob?: (locoId: string, kind: WorkshopJobKind, channel?: WorkshopChannel) => boolean;
  workshopDiscountPct?: number;
  achievements?: AchievementState | null;
}

const fuelTypeLabel: Record<string, string> = {
  diesel: 'Diesel',
  elektrik: 'Elektrik',
  dual: 'Dual',
};

export function FleetView({
  locomotives,
  wagons,
  rentals,
  workshopJobs = [],
  depot,
  companyLevel,
  balance,
  overdraftLimit = 0,
  loading,
  onDisponieren,
  onOpenWagenpark,
  onRentWagons,
  onBuyDepotExpansion,
  onStartWorkshopJob,
  workshopDiscountPct = 0,
  achievements = null,
}: FleetViewProps) {
  const { tick } = useGameClock();
  const slotsUsed = usedWorkshopSlots(workshopJobs, tick);
  const workshopCap = workshopSlotCap(depot);
  const locoCap = locoBerthCap(depot);
  const [search, setSearch] = useState('');
  const [detailLoco, setDetailLoco] = useState<Locomotive | null>(null);
  const [pendingEtcs, setPendingEtcs] = useState<Locomotive | null>(null);
  const [rentWagonId, setRentWagonId] = useState<string | null>(null);
  const [rentMonths, setRentMonths] = useState<RentalTermMonths>(6);
  const rentWagon = rentWagonId ? wagons.find((w) => w.id === rentWagonId) ?? null : null;
  const pendingEtcsReady = pendingEtcs ? ensureMaintenance(pendingEtcs) : null;
  const pendingQuote = pendingEtcsReady ? quoteWorkshopJob(pendingEtcsReady, 'etcs', 'eigen', workshopDiscountPct) : null;
  const pendingBlocked = pendingEtcsReady
    ? canBookWorkshopJob(pendingEtcsReady, workshopJobs, 'etcs', 'eigen', tick, workshopCap)
    : null;
  const pendingCanPay = pendingQuote ? canSpend(balance, pendingQuote.cost, overdraftLimit) : false;
  const pendingWarning = pendingEtcsReady
    ? etcsRetrofitConfirmWarning(pendingBlocked, pendingCanPay, balance, formatEuro)
    : null;

  const filtered = useMemo(() => {
    if (!search) return locomotives;
    const s = search.toLowerCase();
    return locomotives.filter((l) => {
      const typeName = getLocoDisplayName(l.designation).toLowerCase();
      return (
        l.designation.toLowerCase().includes(s) ||
        l.name.toLowerCase().includes(s) ||
        typeName.includes(s) ||
        l.status.toLowerCase().includes(s)
      );
    });
  }, [locomotives, search]);

  const detailTypeLabel = detailLoco ? getLocoDisplayName(detailLoco.designation) : '';
  const livery = activeLivery(achievements);

  const fleetActions = (
    <div className="flex items-center gap-2">
      {onOpenWagenpark && (
        <Button onClick={onOpenWagenpark}>
          <Boxes className="h-3 w-3" />
          Wagendienst
        </Button>
      )}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suchen..."
          className="w-40 rounded-lg border border-slate-600 bg-slate-900 py-1.5 pl-7 pr-2 text-xs text-white outline-none focus:border-amber-500"
        />
      </div>
    </div>
  );

  if (loading) {
    return (
      <SectionShell title="Fuhrpark" subtitle="Triebfahrzeuge im Bestand" actions={fleetActions}>
        <div className="flex h-64 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-amber-500" />
        </div>
      </SectionShell>
    );
  }

  return (
    <SectionShell
      title="Fuhrpark"
      subtitle={`${locomotives.length} / ${locoCap} Triebfahrzeuge · Werkstatt ${slotsUsed}/${workshopCap} Slots`}
      actions={fleetActions}
      tutorialId="tutorial-fuhrpark"
    >
      <DepotUpgradePanel
        compact
        depot={depot}
        companyLevel={companyLevel}
        balance={balance}
        locoCount={locomotives.length}
        wagons={wagons}
        workshopUsed={slotsUsed}
        onBuy={onBuyDepotExpansion}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((raw) => {
          const loco = ensureMaintenance(raw);
          const cfg = getLocoStatusConfig(loco.status);
          const typeLabel = getLocoDisplayName(loco.designation);
          const subtitle = loco.name !== typeLabel ? loco.name : loco.designation;
          const fristen = allFristen(loco);
          const cls = CONDITION_CLASSES[loco.maintenance?.conditionClass ?? 1];
          const deployable = isLocoDeployable(loco);
          return (
            <VehicleCard
              key={loco.id}
              className="fi-deferred-list-card"
              designation={loco.designation}
              catalogId={offerForLoco(loco)?.id}
              alt={`${typeLabel} ${loco.name}`}
              photoClassName={liveryCssClass(livery?.id)}
              overlay={
                <>
                  <div className="text-sm font-bold text-white">{typeLabel}</div>
                  <div className="font-mono text-[11px] text-amber-100/80">{subtitle}</div>
                </>
              }
              badges={
                <span className="inline-flex items-center gap-1">
                  <span className={getLocoPillClass(loco.status)}>
                    <span className={`status-dot ${cfg.dot} ${loco.status === 'einsatz' ? 'animate-pulse' : ''}`} />
                    {cfg.label}
                  </span>
                  {locoHasEtcsEquipment(loco) && <EtcsBadge />}
                  {livery && (
                    <span className="rounded-full border border-amber-500/40 bg-slate-950/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-200">
                      Lackierung: {livery.label}
                    </span>
                  )}
                </span>
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-white">{typeLabel}</div>
                  <div className="font-mono text-[11px] text-slate-400">{subtitle}</div>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-300">
                  {loco.fuel_type === 'elektrik' || loco.fuel_type === 'dual' ? (
                    <Zap className="h-3 w-3 text-amber-400" />
                  ) : (
                    <Fuel className="h-3 w-3 text-amber-400" />
                  )}
                  {fuelTypeLabel[loco.fuel_type] ?? loco.fuel_type}
                </span>
              </div>
              <div className="mt-3 space-y-3">
                <ProgressBar value={loco.fuel_level} label="Kraftstoff" tone="fuel" />
                <ProgressBar value={loco.brake_pct} label="Bremsleistung" tone="brake" />
                <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                  <Spec label="kW" value={loco.power_kw?.toLocaleString('de-DE') ?? '—'} />
                  <Spec label="km/h" value={loco.max_speed != null ? String(loco.max_speed) : '—'} />
                  <Spec label="t" value={loco.weight_t != null ? String(loco.weight_t) : '—'} />
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-800/60 px-2 py-1.5 text-left text-[10px]">
                  <div className="font-bold text-slate-300">
                    Zustand {loco.maintenance?.conditionPct ?? 100}% · {cls.label}
                  </div>
                  <div className="mt-1 space-y-0.5 text-slate-400">
                    {WORKSHOP_LEVELS.map((level) => {
                      const pair = formatFristPair(fristen[level]);
                      return (
                        <div key={level}>
                          {level}{' '}
                          <span className={pair.overdue ? 'animate-pulse font-bold text-rose-400' : 'text-amber-300'}>
                            {pair.days} / {pair.km}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(deployable || loco.status === 'einsatz') && (
                    <button type="button" onClick={() => onDisponieren?.(loco)} className="btn-action btn-action-dispo">
                      <ClipboardList className="h-3 w-3" /> {loco.status === 'einsatz' ? 'Zur Disposition' : 'Disponieren'}
                    </button>
                  )}
                  {!deployable && loco.status !== 'einsatz' && (
                    <span className="px-1 text-[10px] font-bold uppercase text-rose-400">Nicht einsatzbereit</span>
                  )}
                  <button type="button" onClick={() => setDetailLoco(loco)} className="btn-action btn-action-detail">
                    <Info className="h-3 w-3" /> Details
                  </button>
                  {!locoHasEtcsEquipment(loco) && onStartWorkshopJob && (
                    <button
                      type="button"
                      onClick={() => setPendingEtcs(loco)}
                      className="btn-action etcs-retrofit-btn"
                    >
                      <Cpu className="h-3 w-3" /> ETCS nachrüsten
                    </button>
                  )}
                </div>
              </div>
            </VehicleCard>
          );
        })}
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-bold uppercase tracking-wide text-amber-400">Wagengruppen</h3>
        <p className="mb-3 text-[11px] text-slate-500">
          Eigene Gruppen an Partner-EVUs vermieten — tägliche Miete, Vollkasko beim Mieter.
        </p>
        {wagons.length === 0 ? (
          <p className="text-xs text-slate-500">Noch keine Wagengruppen im Bestand.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {wagons.map((wagon) => {
              const rental = activeWagonRental(rentals, wagon.id);
              const cfg = getWagonStatusConfig(wagon.status);
              return (
                <VehicleCard
                  key={wagon.id}
                  className="fi-deferred-list-card"
                  designation={wagon.type_code}
                  catalogId={wagon.type_code.toLowerCase()}
                  kind="wagon"
                  alt={`${wagon.count}× ${wagon.type_code} ${wagon.type_name}`}
                  overlay={
                    <>
                      <div className="text-sm font-bold text-white">
                        {wagon.count}× {wagon.type_code}
                      </div>
                      <div className="text-[11px] text-amber-100/80">{wagon.type_name}</div>
                    </>
                  }
                  badges={
                    <span className={getWagonPillClass(wagon.status)}>
                      {rental ? 'Vermietet' : cfg.label}
                    </span>
                  }
                >
                  <div className="text-sm font-bold text-white">
                    {wagon.count}× {wagon.type_code} · {wagon.type_name}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    {wagon.capacity_t} t · Bremse {wagon.brake_position}
                    {rental && (
                      <span className="block font-bold text-emerald-400">
                        {rental.partnerName} · {formatEuro(rental.dailyIncome)}/Tag · Vollkasko
                      </span>
                    )}
                  </div>
                  {wagon.status === 'verfuegbar' && !rental && (
                    <div className="mt-3">
                      <Button className="w-full" onClick={() => setRentWagonId(wagon.id)}>
                        <Handshake className="h-3.5 w-3.5" /> Wagengruppe vermieten
                      </Button>
                    </div>
                  )}
                </VehicleCard>
              );
            })}
          </div>
        )}
      </div>

      {rentWagon && (
        <WagonRentModal
          wagon={rentWagon}
          months={rentMonths}
          onMonths={setRentMonths}
          onCancel={() => setRentWagonId(null)}
          onConfirm={() => {
            if (onRentWagons(rentWagon.id, rentMonths)) setRentWagonId(null);
          }}
        />
      )}

      {detailLoco && (
        <div
          className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setDetailLoco(null)}
        >
          <div className="fi-card max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="fi-card-header flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Train className="h-3.5 w-3.5 text-amber-500" />
                {detailTypeLabel}
              </span>
              <button onClick={() => setDetailLoco(null)} className="text-slate-500 hover:text-white">
                ✕
              </button>
            </div>
            <div className={liveryCssClass(livery?.id)}>
            <PhotoCardHeader
              designation={detailLoco.designation}
              catalogId={offerForLoco(detailLoco)?.id}
              alt={`${detailTypeLabel} ${detailLoco.name}`}
            >
              <div className="text-sm font-bold text-white">{detailTypeLabel}</div>
              <div className="font-mono text-[11px] text-amber-100/80">{detailLoco.designation}</div>
            </PhotoCardHeader>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              {detailTypeLabel !== detailLoco.designation && (
                <DetailRow label="Typ" value={detailTypeLabel} />
              )}
              <DetailRow label="Baureihe" value={detailLoco.designation} />
              {detailLoco.name !== detailTypeLabel && (
                <DetailRow label="Fahrzeugnummer" value={detailLoco.name} />
              )}
              <DetailRow label="Antrieb" value={fuelTypeLabel[detailLoco.fuel_type] ?? detailLoco.fuel_type} />
              <DetailRow label="Status" value={getLocoStatusConfig(detailLoco.status).label} />
              <DetailRow label="Kraftstoff" value={`${detailLoco.fuel_level}%`} />
              <DetailRow label="Bremsleistung" value={`${detailLoco.brake_pct}%`} />
              <DetailRow label="Leistung" value={`${detailLoco.power_kw?.toLocaleString('de-DE') ?? '—'} kW`} />
              <DetailRow label="Höchstgeschw." value={`${detailLoco.max_speed ?? '—'} km/h`} />
              <DetailRow label="Masse" value={`${detailLoco.weight_t ?? '—'} t`} />
              <DetailRow
                label="Letzter Dienst"
                value={
                  detailLoco.last_service
                    ? new Intl.DateTimeFormat('de-DE').format(new Date(detailLoco.last_service))
                    : '—'
                }
              />
              <DetailRow
                label="Zustand"
                value={`${ensureMaintenance(detailLoco).maintenance?.conditionPct ?? 100}% · ${
                  CONDITION_CLASSES[ensureMaintenance(detailLoco).maintenance?.conditionClass ?? 1].label
                }`}
              />
              {WORKSHOP_LEVELS.map((level) => {
                const pair = formatFristPair(allFristen(ensureMaintenance(detailLoco))[level]);
                return (
                  <DetailRow
                    key={level}
                    label={`${level} Rest`}
                    value={`${pair.days} / ${pair.km}`}
                  />
                );
              })}
              {(detailLoco.country_packages?.length ?? 0) > 0 && (
                <DetailRow label="Länderpakete" value={(detailLoco.country_packages ?? []).join(', ')} />
              )}
              <DetailRow
                label="Lackierung"
                value={livery ? livery.label : 'Serie'}
              />
              <DetailRow
                label="Ausrüstung"
                value={[
                  detailLoco.pzb !== false ? 'PZB (Serie)' : null,
                  ...(detailLoco.equipment ?? [])
                    .filter((id) => id !== 'pzb')
                    .map((id) => (id === 'etcs' ? 'ETCS' : id === 'funkfernsteuerung' ? 'Funkfernsteuerung' : id)),
                ]
                  .filter(Boolean)
                  .join(', ')}
              />
            </div>
            {!locoHasEtcsEquipment(detailLoco) && onStartWorkshopJob && (
              <div className="border-t border-slate-800 p-4">
                <Button className="etcs-retrofit-btn w-full" onClick={() => setPendingEtcs(detailLoco)}>
                  <Cpu className="h-3.5 w-3.5" /> ETCS nachrüsten
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {pendingEtcsReady && pendingQuote && onStartWorkshopJob && (
        <EtcsRetrofitModal
          locoName={`${getLocoDisplayName(pendingEtcsReady.designation)} · ${pendingEtcsReady.name}`}
          cost={pendingQuote.cost}
          listCost={pendingQuote.listCost}
          durationDays={pendingQuote.durationDays}
          warning={pendingWarning}
          confirmDisabled={Boolean(pendingWarning)}
          onCancel={() => setPendingEtcs(null)}
          onConfirm={() => {
            const ok = onStartWorkshopJob(pendingEtcsReady.id, 'etcs', 'eigen');
            if (ok) {
              setPendingEtcs(null);
              setDetailLoco(null);
            }
            return ok;
          }}
        />
      )}
    </SectionShell>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/60 py-1.5">
      <div className="text-[9px] font-bold uppercase text-slate-500">{label}</div>
      <div className="font-bold text-white">{value}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-slate-800 pb-1">
      <div className="text-[10px] font-bold uppercase text-slate-500">{label}</div>
      <div className="text-sm font-medium text-white">{value}</div>
    </div>
  );
}
