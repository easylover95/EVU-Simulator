import { useEffect, useMemo, useRef, useState } from 'react';
import { Fuel, Globe, Handshake, Train, Zap } from 'lucide-react';
import type { Company, CountryPackage, ExtraEquipment, Locomotive, Wagon } from '@/lib/supabase';
import { formatEuro } from '@/lib/status';
import type { DailyFixedCosts } from '@/lib/dailyFixedCosts';
import type { MaintenanceFundState } from '@/lib/maintenanceFund';
import { forecastLocoPurchase, forecastWagonPurchase, type InvestmentForecast } from '@/lib/economyAdvisor';
import { Button, Card, CardFlush, CardHeader } from '@/components/ui';
import { DealerAcquireModal } from '@/components/DealerAcquireModal';
import { SectionShell } from '@/components/SectionShell';
import { freeYardBerths, yardBerthCap } from '@/lib/sectionMetrics';
import { DepotUpgradePanel } from '@/components/DepotUpgradePanel';
import { VehicleCard, VehiclePriceBox } from '@/components/VehicleCard';
import { WagonRentModal } from '@/components/WagonRentModal';
import { WorkshopView } from '@/views/WorkshopView';
import { getLocoDisplayName } from '@/lib/locoPhotos';
import {
  COUNTRY_PACKAGES,
  DEFAULT_LOCO_ACQUIRE,
  EXTRA_EQUIPMENT_OPTIONS,
  extraEquipmentLabel,
  LOCO_OFFERS,
  LOCO_SEGMENTS,
  quoteLocoPurchase,
  usedStockFor,
  quoteWagonDeal,
  wagonVolumeDiscountBadge,
  wagonVolumeDiscountLabel,
  WAGON_OFFERS,
  WAGON_QTY_OPTIONS,
  type Acquisition,
  type DealerState,
  type LocoAcquireOptions,
  type LocoBuyVariant,
  type LocoOffer,
  type WagonOffer,
  type WagonQuote,
} from '@/lib/dealer';
import {
  CONDITION_CLASSES,
  remainingHuFractionFromStock,
  usedWorkshopSlots,
  type WorkshopChannel,
  type WorkshopJob,
  type WorkshopJobKind,
} from '@/lib/workshop';
import { activeWagonRental, type RentalState, type RentalTermMonths } from '@/lib/rental';
import { useGameClock } from '@/lib/GameClockContext';
import { canSpend } from '@/lib/bank';
import { countryPackageLabel, type NetworkAccessState } from '@/lib/networkAccess';
import {
  BASE_WAGON_BERTHS,
  freeWagonBerths,
  wagonBerthCap,
  wagonUnitCount,
  type DepotState,
} from '@/lib/depot';
import type { AchievementState } from '@/lib/achievements';

interface DealerViewProps {
  mode: 'shop' | 'workshop';
  company: Company | null;
  locomotives: Locomotive[];
  wagons: Wagon[];
  dealer: DealerState;
  workshopJobs: WorkshopJob[];
  rentals: RentalState;
  depot: DepotState;
  overdraftLimit: number;
  prefillWagon?: { typeCode: string; qty: number } | null;
  onAcquireLoco: (offerId: string, how: Acquisition, options?: LocoAcquireOptions) => boolean;
  onAcquireWagons: (offerId: string, how: Acquisition, qty: number) => boolean;
  onSellLoco: (locoId: string) => boolean;
  onSellWagonPack: (wagonId: string) => boolean;
  onStartWorkshopJob: (locoId: string, kind: WorkshopJobKind, channel?: WorkshopChannel) => boolean;
  onRentWagons: (wagonId: string, months: RentalTermMonths) => boolean;
  onBuyDepotExpansion: (expansionId: string) => boolean;
  networkAccess?: NetworkAccessState;
  onBuyNetworkPackage?: (id: CountryPackage) => boolean;
  highlightNetwork?: CountryPackage | null;
  workshopDiscountPct?: number;
  achievements?: AchievementState | null;
  dailyFixed: DailyFixedCosts;
  maintenanceFund: MaintenanceFundState;
}

export function DealerView({
  mode,
  company,
  locomotives,
  wagons,
  dealer,
  workshopJobs,
  rentals,
  depot,
  overdraftLimit,
  prefillWagon = null,
  onAcquireLoco,
  onAcquireWagons,
  onSellLoco,
  onSellWagonPack,
  onStartWorkshopJob,
  onRentWagons,
  onBuyDepotExpansion,
  networkAccess,
  onBuyNetworkPackage,
  highlightNetwork = null,
  workshopDiscountPct = 0,
  achievements = null,
  dailyFixed,
  maintenanceFund,
}: DealerViewProps) {
  const { tick } = useGameClock();
  const [rentWagonId, setRentWagonId] = useState<string | null>(null);
  const [rentMonths, setRentMonths] = useState<RentalTermMonths>(6);
  const [acquireError, setAcquireError] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    kind: 'loco' | 'wagon';
    offerId: string;
    how: Acquisition;
    name: string;
    price: number;
    qty?: number;
    wagonGattung?: string;
    warning?: string | null;
    options?: LocoAcquireOptions;
    lines?: { label: string; amount: number }[];
    footnote?: string;
    dueNow?: number;
    forecast?: InvestmentForecast;
  } | null>(null);
  const confirmLock = useRef(false);
  const rentWagon = rentWagonId ? wagons.find((w) => w.id === rentWagonId) ?? null : null;

  const berthCap = yardBerthCap(depot);
  const openBerths = freeYardBerths(depot, locomotives.length);
  const wagonCap = wagonBerthCap(depot);
  const wagonUsed = wagonUnitCount(wagons);

  useEffect(() => {
    if (!prefillWagon) return;
    const el = document.getElementById(`dealer-wagon-${prefillWagon.typeCode}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [prefillWagon]);

  function requestAcquire(
    kind: 'loco' | 'wagon',
    offerId: string,
    how: Acquisition,
    name: string,
    price: number,
    extra?: {
      options?: LocoAcquireOptions;
      lines?: { label: string; amount: number }[];
      footnote?: string;
      dueNow?: number;
      qty?: number;
      wagonGattung?: string;
    },
  ) {
    if (!company) {
      setAcquireError('Kein aktives Unternehmen. Erwerb nicht möglich.');
      return;
    }
    const dueNow = extra?.dueNow ?? (how === 'kauf' ? price : how === 'leasing' && kind === 'wagon' ? price : 0);
    const available = company.balance + overdraftLimit;
    const blockers: string[] = [];
    if (dueNow > 0 && !canSpend(company.balance, dueNow, overdraftLimit)) {
      blockers.push(
        `Nicht genug Kapital (Konto + Dispo). Benötigt ${formatEuro(dueNow)}, verfügbar ${formatEuro(available)} (Dispo ${formatEuro(overdraftLimit)}).`,
      );
    }
    if (kind === 'loco' && openBerths < 1) {
      blockers.push(
        `Keine freien Stellplätze für ${name}. Depot ist voll (${locomotives.length} / ${berthCap}). Ausbau unter Gebäude.`,
      );
    }
    if (kind === 'wagon') {
      const qty = extra?.qty ?? 1;
      const free = freeWagonBerths(depot, wagonUsed);
      if (free < qty) {
        blockers.push(
          `Keine freien Wagen-Stellplätze für ${qty}× ${extra?.wagonGattung ?? 'Wagen'}. Frei ${free} von ${wagonCap}, benötigt ${qty}. Ausbau unter Gebäude.`,
        );
      }
    }
    const warning = blockers.length > 0 ? blockers.join(' ') : null;
    const recurringDailyCost = how === 'leasing' ? price : 0;
    const forecast = kind === 'loco'
      ? (() => {
        const offer = LOCO_OFFERS.find((row) => row.id === offerId);
        return offer ? forecastLocoPurchase({
          company,
          dailyFixed,
          currentLocoCount: locomotives.length,
          currentWagonUnits: wagonUsed,
          offer,
          dueNow,
          maintenanceFund,
          recurringDailyCost,
        }) : undefined;
      })()
      : (() => {
        const offer = WAGON_OFFERS.find((row) => row.id === offerId);
        const qty = extra?.qty ?? 1;
        return offer ? forecastWagonPurchase({
          company,
          dailyFixed,
          currentLocoCount: locomotives.length,
          currentWagonUnits: wagonUsed,
          offer,
          quantity: qty,
          dueNow,
          maintenanceFund,
          recurringDailyCost,
        }) : undefined;
      })();
    setAcquireError(warning);
    setPending({ kind, offerId, how, name, price, warning, dueNow, forecast, ...extra });
  }

  function cancelAcquire() {
    if (confirmLock.current) return;
    setPending(null);
  }

  function confirmAcquire() {
    if (!pending || confirmLock.current) return;
    if (pending.warning) return;
    confirmLock.current = true;
    const { kind, offerId, how, options } = pending;
    const ok =
      kind === 'loco' ? onAcquireLoco(offerId, how, options) : onAcquireWagons(offerId, how, pending.qty ?? 1);
    setPending(null);
    confirmLock.current = false;
    if (!ok) {
      setAcquireError('Erwerb abgebrochen. Bitte Kapital (Konto + Dispo) und freie Stellplätze prüfen.');
    } else {
      setAcquireError(null);
    }
  }

  if (mode === 'workshop') {
    return (
      <WorkshopView
        company={company}
        locomotives={locomotives}
        wagons={wagons}
        workshopJobs={workshopJobs}
        depot={depot}
        tick={tick}
        onStartWorkshopJob={onStartWorkshopJob}
        onBuyDepotExpansion={onBuyDepotExpansion}
        overdraftLimit={overdraftLimit}
        workshopDiscountPct={workshopDiscountPct}
        achievements={achievements}
      />
    );
  }

  return (
    <SectionShell title="Händler" subtitle="Kauf, Verkauf und Leasing von Triebfahrzeugen und Wagen">
      <Card className="border-amber-400/30 bg-amber-950/20 p-4">
        <div className="text-[10px] font-bold uppercase tracking-wide text-amber-300">Depotkapazität</div>
        <p className="mt-1 text-sm font-bold text-amber-100">
          Loks {locomotives.length} / {berthCap} · Wagen {wagonUsed} / {wagonCap}
        </p>
        <p className="mt-1 text-[11px] text-amber-200/70">
          Start: 2 Lok-Gleise und {BASE_WAGON_BERTHS} Wagen-Stellplätze. Weitere Plätze kaufst du gegen Gebühr, sobald
          das Firmen-Level reicht.
        </p>
      </Card>
      <DepotUpgradePanel
        compact
        depot={depot}
        companyLevel={company?.level ?? 1}
        balance={company?.balance ?? 0}
        locoCount={locomotives.length}
        wagons={wagons}
        workshopUsed={usedWorkshopSlots(workshopJobs, tick)}
        onBuy={onBuyDepotExpansion}
      />
      {acquireError && (
        <Card className="border-rose-400/50 bg-rose-950/40 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-rose-300">Erwerb nicht möglich</div>
              <p className="mt-1 text-sm font-bold text-rose-50">{acquireError}</p>
            </div>
            <button
              type="button"
              className="text-rose-300/70 hover:text-white"
              onClick={() => setAcquireError(null)}
              aria-label="Hinweis schließen"
            >
              ✕
            </button>
          </div>
        </Card>
      )}

      {dealer.leases.length > 0 && (
        <Card>
          <div className="text-[10px] font-bold uppercase text-slate-500">Aktive Leasingverträge</div>
          <ul className="mt-2 space-y-1 text-xs text-slate-300">
            {dealer.leases.map((l) => (
              <li key={l.id} className="flex justify-between gap-2">
                <span>{l.label}</span>
                <span className="text-amber-300">{formatEuro(l.dailyCost)} / Tag</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {onBuyNetworkPackage && networkAccess && (
        <Card
          id="dealer-network"
          className={
            highlightNetwork
              ? 'border-amber-400/70 p-4 ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-950'
              : 'p-4'
          }
        >
          <div className="mb-2 flex items-center gap-2 text-amber-400">
            <Globe className="h-4 w-4" />
            <h3 className="text-sm font-bold text-white">Netzzugang / Länderpakete</h3>
          </div>
          <p className="mb-3 text-[11px] text-slate-400">
            Deutschland ist Heimatnetz (inkl.). Ohne Paket keine Aufträge von/nach NL, PL, CZ, A, CH, IT.
            ETCS kaufst du an der Lok.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {COUNTRY_PACKAGES.map((pack) => {
              const owned = networkAccess.packages.includes(pack.id);
              const highlight = highlightNetwork === pack.id;
              return (
                <div
                  key={pack.id}
                  className={`rounded-lg border p-3 ${
                    highlight ? 'border-amber-400 bg-amber-950/40' : 'app-glass-panel border-slate-700'
                  }`}
                >
                  <div className="text-xs font-bold text-white">
                    {pack.id} · {countryPackageLabel(pack.id)}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    {pack.price > 0 ? formatEuro(pack.price) : 'Heimatnetz inkl.'}
                  </div>
                  {owned ? (
                    <div className="mt-2 text-[11px] font-bold text-emerald-400">Freigeschaltet</div>
                  ) : (
                    <Button className="mt-2 px-3 py-1.5" onClick={() => onBuyNetworkPackage(pack.id)}>
                      Netzzugang kaufen
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {LOCO_SEGMENTS.map((segment) => {
        const offers = LOCO_OFFERS.filter((o) => o.segment === segment.id);
        if (offers.length === 0) return null;
        return (
          <section key={segment.id} className="space-y-3">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide text-amber-400">{segment.title}</h3>
              <p className="text-[11px] text-slate-500">{segment.subtitle}</p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {offers.map((offer) => (
                <LocoOfferCard
                  key={offer.id}
                  offer={offer}
                  dealer={dealer}
                  balance={company?.balance ?? null}
                  onRequest={(how, options, quote) =>
                    requestAcquire(
                      'loco',
                      offer.id,
                      how,
                      `${offer.displayName} · ${
                        how === 'leasing'
                          ? 'Leasing'
                          : options.variant === 'used'
                            ? 'Gebraucht (Restfrist)'
                            : 'Frisch revidiert'
                      }`,
                      how === 'leasing' ? offer.leaseDaily : quote.total,
                      {
                        options,
                        lines: how === 'leasing' ? undefined : quote.lines,
                        footnote:
                          how === 'leasing'
                            ? 'Leasing startet frisch revidiert (volle F/ZU/HU). Pakete optional einmalig.'
                            : options.variant === 'used'
                              ? `${quote.conditionLabel} · Gebraucht = Katalog − HU × Verbrauch`
                              : 'Frisch revidiert = Katalogpreis (100 % / neue HU). ETCS/Funk optional.',
                        dueNow: how === 'leasing' ? quote.packages : quote.total,
                      },
                    )
                  }
                />
              ))}
            </div>
          </section>
        );
      })}

      <h3 className="text-sm font-bold uppercase tracking-wide text-amber-400">Güterwagen</h3>
      <p className="text-[11px] text-slate-500">
        Stückzahl wählen — Kauf und Tagesleasing rechnen sich inkl. Mengenrabatt (2–3× −10 %, 4–7× −20 %, 8–11×
        −28 %, 12–15× −35 %, 16×+ −40 % Mega).
      </p>
      {prefillWagon && (
        <p className="rounded-lg border border-amber-400/40 bg-amber-950/30 px-3 py-2 text-[11px] font-bold text-amber-200">
          Bedarf aus Auftrag: {prefillWagon.qty}× {prefillWagon.typeCode} — Katalogkarte vorausgewählt.
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {WAGON_OFFERS.map((offer) => (
          <div
            key={offer.id}
            id={`dealer-wagon-${offer.type_code}`}
            className={
              prefillWagon?.typeCode === offer.type_code
                ? 'rounded-xl ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-950'
                : undefined
            }
          >
          <WagonOfferCard
            offer={offer}
            balance={company?.balance ?? null}
            overdraftLimit={overdraftLimit}
            freeBerths={freeWagonBerths(depot, wagonUsed)}
            wagonCap={wagonCap}
            initialQty={prefillWagon?.typeCode === offer.type_code ? prefillWagon.qty : undefined}
            highlight={prefillWagon?.typeCode === offer.type_code}
            onRequest={(how, quote) => {
              const rabatt = wagonVolumeDiscountLabel(quote.qty);
              requestAcquire(
                'wagon',
                offer.id,
                how,
                `${quote.qty}× ${offer.type_code} · ${offer.type_name}`,
                how === 'leasing' ? quote.leaseDaily : quote.buyPrice,
                {
                  qty: quote.qty,
                  wagonGattung: offer.type_code,
                  dueNow: how === 'leasing' ? quote.leaseDaily : quote.buyPrice,
                  lines: [
                    { label: `${quote.qty}× Liste`, amount: how === 'leasing' ? quote.listLease : quote.listBuy },
                    ...(quote.discount > 0
                      ? [
                          {
                            label: rabatt ?? 'Mengenrabatt',
                            amount:
                              (how === 'leasing' ? quote.leaseDaily : quote.buyPrice) -
                              (how === 'leasing' ? quote.listLease : quote.listBuy),
                          },
                        ]
                      : []),
                  ],
                  footnote: `${quote.payloadT.toLocaleString('de-DE')} t Grenzlast gesamt${
                    rabatt ? ` · ${rabatt}` : ''
                  } · Stellplätze ${wagonUsed} / ${wagonCap}`,
                },
              );
            }}
          />
          </div>
        ))}
      </div>

      <CardFlush>
        <CardHeader>
          <span className="inline-flex items-center gap-2">
            <Train className="h-3.5 w-3.5 text-amber-400" /> Bestand verkaufen
          </span>
        </CardHeader>
        <div className="grid gap-3 p-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-[10px] font-bold uppercase text-slate-500">Loks (frei / stillgelegt)</div>
            <div className="space-y-2">
              {locomotives
                .filter((l) => l.status === 'frei' || l.status === 'stillgelegt')
                .map((loco) => (
                  <div key={loco.id} className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/20 px-3 py-2">
                    <span className="text-xs text-white">
                      {getLocoDisplayName(loco.designation)} · {loco.name}
                    </span>
                    <Button variant="danger" className="px-3 py-1" onClick={() => onSellLoco(loco.id)}>
                      Verkaufen
                    </Button>
                  </div>
                ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-[10px] font-bold uppercase text-slate-500">Wagengruppen</div>
            <div className="space-y-2">
              {wagons
                .filter((w) => w.status === 'verfuegbar' || Boolean(activeWagonRental(rentals, w.id)))
                .map((wagon) => {
                  const rental = activeWagonRental(rentals, wagon.id);
                  return (
                    <div
                      key={wagon.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/20 px-3 py-2"
                    >
                      <span className="text-xs text-white">
                        {wagon.count}× {wagon.type_code}
                        {rental && (
                          <span className="ml-2 text-[10px] font-bold uppercase text-emerald-400">
                            Vermietet · {formatEuro(rental.dailyIncome)}/Tag
                          </span>
                        )}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {!rental && wagon.status === 'verfuegbar' && (
                          <Button className="px-3 py-1" onClick={() => setRentWagonId(wagon.id)}>
                            <Handshake className="h-3 w-3" /> Wagengruppe vermieten
                          </Button>
                        )}
                        {!rental && (
                          <Button variant="danger" className="px-3 py-1" onClick={() => onSellWagonPack(wagon.id)}>
                            Verkaufen
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </CardFlush>
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
      {pending && (
        <DealerAcquireModal
          name={pending.name}
          price={pending.price}
          how={pending.how}
          lines={pending.lines}
          footnote={pending.footnote}
          warning={pending.warning}
          forecast={pending.forecast}
          confirmDisabled={Boolean(pending.warning)}
          wagonQty={pending.kind === 'wagon' ? pending.qty : undefined}
          wagonGattung={pending.wagonGattung}
          onCancel={cancelAcquire}
          onConfirm={confirmAcquire}
        />
      )}
    </SectionShell>
  );
}

function fundsShortHint(shortfall: number): string {
  return `Nicht genügend Guthaben auf dem Konto! Fehlender Betrag: ${formatEuro(shortfall)}`;
}

function WagonOfferCard({
  offer,
  balance,
  overdraftLimit,
  freeBerths,
  wagonCap,
  initialQty,
  highlight = false,
  onRequest,
}: {
  offer: WagonOffer;
  balance: number | null;
  overdraftLimit: number;
  freeBerths: number;
  wagonCap: number;
  initialQty?: number;
  highlight?: boolean;
  onRequest: (how: Acquisition, quote: WagonQuote) => void;
}) {
  const [qty, setQty] = useState(initialQty && initialQty > 0 ? initialQty : 4);
  useEffect(() => {
    if (initialQty && initialQty > 0) setQty(initialQty);
  }, [initialQty]);
  const quote = quoteWagonDeal(offer, qty);
  const rabattBadge = wagonVolumeDiscountBadge(qty);
  const available = (balance ?? 0) + overdraftLimit;
  const buyDue = quote.buyPrice;
  const leaseDue = quote.leaseDaily;
  const canAffordBuy = balance != null && canSpend(balance, buyDue, overdraftLimit);
  const canAffordLease = balance != null && canSpend(balance, leaseDue, overdraftLimit);
  const hasBerths = freeBerths >= qty;
  const buyBlocked = !canAffordBuy || !hasBerths;
  const leaseBlocked = !canAffordLease || !hasBerths;
  const berthHint = !hasBerths
    ? `Keine freien Wagen-Stellplätze für ${qty}× ${offer.type_code}. Frei ${freeBerths} von ${wagonCap}, benötigt ${qty}.`
    : null;
  const buyHint = !canAffordBuy
    ? `Nicht genug Kapital (Konto + Dispo). Benötigt ${formatEuro(buyDue)}, verfügbar ${formatEuro(available)}.`
    : null;
  const leaseHint = !canAffordLease
    ? `Nicht genug Kapital (Konto + Dispo) für die erste Tagesrate ${formatEuro(leaseDue)}.`
    : null;
  const qtyChips = useMemo(() => {
    const set = new Set<number>([...WAGON_QTY_OPTIONS]);
    if (initialQty && initialQty > 0) set.add(initialQty);
    return [...set].sort((a, b) => a - b);
  }, [initialQty]);

  return (
    <VehicleCard
      designation={offer.type_code}
      catalogId={offer.id}
      kind="wagon"
      alt={`${offer.type_code} ${offer.type_name}`}
      overlay={
        <>
          <div className="text-sm font-bold text-white">{offer.type_code}</div>
          <div className="text-[11px] text-amber-100/80">{offer.type_name}</div>
        </>
      }
      badges={
        <>
          {highlight && (
            <span className="rounded bg-amber-400 px-2 py-1 text-[10px] font-bold tracking-wide text-slate-950">
              AUFTRAG
            </span>
          )}
          {rabattBadge ? (
            <span className="rounded bg-emerald-500 px-2 py-1 text-[10px] font-bold tracking-wide text-slate-950">
              {rabattBadge}
            </span>
          ) : (
            <span className="rounded border border-white/20 bg-slate-950/70 px-2 py-1 text-[10px] font-bold tracking-wide text-slate-200">
              LISTE
            </span>
          )}
        </>
      }
    >
      <div className="text-sm font-bold text-white">
        {offer.type_code} · {offer.type_name}
      </div>
      <div className="mt-1 text-[11px] text-slate-400">
        {offer.cargo} · {offer.capacity_t} t / Wagen · Bremse {offer.brake_position} · {offer.tare_weight_t} t Tara ·
        Liste {formatEuro(offer.listUnitPrice)} / Stk · {formatEuro(offer.listUnitLease)} / Stk / Tag
      </div>
      <fieldset className="mt-3">
        <legend className="text-[10px] font-bold uppercase text-slate-500">Stückzahl</legend>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {qtyChips.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setQty(n)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                qty === n
                  ? 'bg-amber-500 text-slate-950'
                  : 'border border-amber-500/30 bg-slate-950/60 text-amber-200 hover:border-amber-400/60'
              }`}
            >
              {n}×
            </button>
          ))}
        </div>
      </fieldset>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <VehiclePriceBox
          label={quote.discount > 0 ? `Sparpreis ${qty}×` : `Kauf ${qty}×`}
          value={formatEuro(quote.buyPrice)}
          listValue={quote.discount > 0 ? formatEuro(quote.listBuy) : undefined}
        />
        <VehiclePriceBox
          label={quote.discount > 0 ? 'Sparpreis/Tag' : 'Leasing/Tag'}
          value={formatEuro(quote.leaseDaily)}
          listValue={quote.discount > 0 ? formatEuro(quote.listLease) : undefined}
        />
        <VehiclePriceBox label="Grenzlast" value={`${quote.payloadT.toLocaleString('de-DE')} t`} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => onRequest('kauf', quote)}>
          {qty}× kaufen
        </Button>
        <Button variant="secondary" onClick={() => onRequest('leasing', quote)}>
          {qty}× leasen
        </Button>
      </div>
      {(buyBlocked || leaseBlocked) && (
        <p className="mt-2 text-[11px] font-bold leading-relaxed text-rose-400">
          {[berthHint, buyHint || leaseHint].filter(Boolean).join(' ')}
        </p>
      )}
    </VehicleCard>
  );
}

function LocoOfferCard({
  offer,
  dealer,
  balance,
  onRequest,
}: {
  offer: LocoOffer;
  dealer: DealerState;
  balance: number | null;
  onRequest: (
    how: Acquisition,
    options: LocoAcquireOptions,
    quote: ReturnType<typeof quoteLocoPurchase>,
  ) => void;
}) {
  const [countries, setCountries] = useState<CountryPackage[]>(['D']);
  const [equipment, setEquipment] = useState<ExtraEquipment[]>([]);
  const stock = usedStockFor(dealer, offer.id);
  const usedQuote = quoteLocoPurchase(offer, 'used', stock, countries, equipment);
  const revisedQuote = quoteLocoPurchase(offer, 'revised', stock, countries, equipment);
  const leaseUpfront = revisedQuote.packages;
  const canBuyUsed = balance != null && usedQuote.total <= balance;
  const canBuyRevised = balance != null && revisedQuote.total <= balance;
  const canLease = leaseUpfront <= 0 || (balance != null && leaseUpfront <= balance);
  const usedShortfall = balance == null ? usedQuote.total : Math.max(0, usedQuote.total - balance);
  const revisedShortfall = balance == null ? revisedQuote.total : Math.max(0, revisedQuote.total - balance);
  const leaseShortfall = balance == null ? leaseUpfront : Math.max(0, leaseUpfront - balance);
  const buyHint = !canBuyUsed
    ? fundsShortHint(usedShortfall)
    : !canBuyRevised
      ? fundsShortHint(revisedShortfall)
      : null;
  const options = (variant: LocoBuyVariant): LocoAcquireOptions => ({
    variant,
    countries,
    equipment,
  });

  function toggleCountry(id: CountryPackage) {
    setCountries((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function toggleEquip(id: ExtraEquipment) {
    setEquipment((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const cls = stock ? CONDITION_CLASSES[stock.conditionClass] : CONDITION_CLASSES[3];
  const huRemaining = stock ? remainingHuFractionFromStock(stock, offer.segment) : 0.45;
  const huConsumedPct = Math.round((1 - huRemaining) * 100);

  return (
    <VehicleCard
      designation={offer.designation}
      catalogId={offer.id}
      alt={offer.displayName}
      overlay={
        <>
          <div className="text-sm font-bold text-white">{offer.displayName}</div>
          <div className="font-mono text-[11px] text-amber-100/80">{offer.designation}</div>
        </>
      }
      badges={
        <>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
              offer.condition === 'gebraucht'
                ? 'border-amber-400/50 bg-amber-950/70 text-amber-200'
                : 'border-emerald-400/40 bg-emerald-950/70 text-emerald-200'
            }`}
          >
            {offer.condition === 'gebraucht' ? 'Gebraucht' : 'Neu'}
          </span>
          {offer.ohleOnly && (
            <span className="rounded-full border border-violet-400/40 bg-violet-950/70 px-2 py-0.5 text-[10px] font-bold text-violet-200">
              nur OL
            </span>
          )}
        </>
      }
    >
      <p className="text-[11px] leading-snug text-slate-400">{offer.blurb}</p>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
        {offer.fuel_type !== 'elektrik' && <Fuel className="h-3 w-3 text-amber-400" />}
        {offer.fuel_type !== 'diesel' && <Zap className="h-3 w-3 text-sky-400" />}
        {offer.power_kw.toLocaleString('de-DE')} kW · {offer.max_speed} km/h · {offer.weight_t} t
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
        <VehiclePriceBox label="Katalog / revidiert" value={formatEuro(offer.buyPrice)} />
        <VehiclePriceBox label="HU exakt" value={formatEuro(offer.huCost)} />
        <VehiclePriceBox label="Gebraucht / Restfrist" value={formatEuro(usedQuote.total)} />
        <VehiclePriceBox label="HU-Abzug" value={formatEuro(usedQuote.restfrist)} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
        <VehiclePriceBox label="Verkauf" value={formatEuro(offer.sellPrice)} />
        <VehiclePriceBox label="Leasing/Tag" value={formatEuro(offer.leaseDaily)} />
      </div>
      {stock && (
        <p className="mt-2 text-[11px] text-slate-400">
          Gebraucht = Katalog − HU × Verbrauch · Restfrist {Math.round(huRemaining * 100)} % · verbraucht{' '}
          {huConsumedPct} % · Abzug {formatEuro(usedQuote.restfrist)}
          {' · '}
          {cls.label}
          {cls.laidUp ? ' · stillgelegt bis HU' : ''} · Klasse {stock.conditionClass}/5
        </p>
      )}
      <fieldset className="mt-3">
        <legend className="text-[10px] font-bold uppercase text-slate-500">Länderpakete</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {COUNTRY_PACKAGES.map((pack) => (
            <label key={pack.id} className="inline-flex items-center gap-1 text-[11px] text-slate-300">
              <input
                type="checkbox"
                checked={countries.includes(pack.id)}
                onChange={() => toggleCountry(pack.id)}
              />
              {pack.id}
              {pack.price > 0 ? ` +${formatEuro(pack.price)}` : ' inkl.'}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-2">
        <legend className="text-[10px] font-bold uppercase text-slate-500">Zusatzausrüstung</legend>
        <p className="mt-1 text-[11px] text-slate-500">PZB-Zugbeeinflussung serienmäßig inklusive.</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {EXTRA_EQUIPMENT_OPTIONS.map((item) => (
            <label key={item.id} className="inline-flex items-center gap-1 text-[11px] text-slate-300">
              <input
                type="checkbox"
                checked={equipment.includes(item.id)}
                onChange={() => toggleEquip(item.id)}
              />
              {extraEquipmentLabel(item.id, offer.buyPrice)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-3 flex flex-wrap gap-2">
        <span title={!canBuyUsed ? fundsShortHint(usedShortfall) : undefined} className="inline-flex">
          <Button
            disabled={!canBuyUsed}
            className={!canBuyUsed ? 'cursor-not-allowed opacity-50 disabled:opacity-50' : undefined}
            onClick={() => {
              if (!canBuyUsed) return;
              onRequest('kauf', options('used'), usedQuote);
            }}
          >
            Gebraucht (Restfrist)
          </Button>
        </span>
        <span title={!canBuyRevised ? fundsShortHint(revisedShortfall) : undefined} className="inline-flex">
          <Button
            disabled={!canBuyRevised}
            className={!canBuyRevised ? 'cursor-not-allowed opacity-50 disabled:opacity-50' : undefined}
            onClick={() => {
              if (!canBuyRevised) return;
              onRequest('kauf', options('revised'), revisedQuote);
            }}
          >
            Frisch revidiert / neue HU
          </Button>
        </span>
        <span title={!canLease ? fundsShortHint(leaseShortfall) : undefined} className="inline-flex">
          <Button
            variant="secondary"
            disabled={!canLease}
            className={!canLease ? 'cursor-not-allowed opacity-50 disabled:opacity-50' : undefined}
            onClick={() => {
              if (!canLease) return;
              onRequest('leasing', { ...DEFAULT_LOCO_ACQUIRE, countries, equipment }, revisedQuote);
            }}
          >
            Leasen
          </Button>
        </span>
      </div>
      {buyHint && <p className="mt-2 text-[11px] font-bold text-rose-400">{buyHint}</p>}
    </VehicleCard>
  );
}

export { WorkshopHint } from '@/views/WorkshopView';

