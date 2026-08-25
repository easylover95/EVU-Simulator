import type { ReactNode } from 'react';
import { FileText, MapPin, Package, Factory } from 'lucide-react';
import type { AssignmentWithDetails, Order, Wagon } from '@/lib/supabase';
import { formatEuro, getOrderPillClass, getOrderStatusConfig, getOrderTypeConfig } from '@/lib/status';
import { Button, Card } from '@/components/ui';
import { SectionShell } from '@/components/SectionShell';
import {
  canAcceptIndustrial,
  contractObligation,
  industrialDailyOperatingCost,
  industrialPayableDaily,
  industrialWagonNeed,
  requiredDeparturesFor,
  type IndustrialContract,
} from '@/lib/freightContracts';
import { checkWagonAvailability, wagonShortageLabel } from '@/lib/brh';
import { WagonShortageBanner } from '@/components/WagonShortageBanner';
import type { Acquisition } from '@/lib/dealer';
import { networkAcceptBlock, type NetworkAccessState } from '@/lib/networkAccess';
import type { Locomotive } from '@/lib/supabase';

interface ContractsViewProps {
  orders: Order[];
  wagons?: Wagon[];
  onOpenDisposition?: (order: Order) => void;
  industrial?: IndustrialContract[];
  bekanntheit?: number;
  companyLevel?: number;
  onAcceptIndustrial?: (id: string) => void;
  onDeclineIndustrial?: (id: string) => void;
  onBuyMissingWagons?: (typeCode: string, qty: number) => void;
  onQuickAcquireWagons?: (typeCode: string, qty: number, how: Acquisition) => void;
  onOpenBuildings?: () => void;
  freeBerths?: number;
  assignments?: AssignmentWithDetails[];
  companyTick?: number;
  onDispatchContract?: (id: string) => void;
  networkAccess?: NetworkAccessState;
  locomotives?: Locomotive[];
  onOpenNetworkDealer?: () => void;
}

export function ContractsView({
  orders,
  wagons = [],
  onOpenDisposition,
  industrial = [],
  bekanntheit = 0,
  companyLevel = 1,
  onAcceptIndustrial,
  onDeclineIndustrial,
  onBuyMissingWagons,
  onQuickAcquireWagons,
  onOpenBuildings,
  freeBerths,
  assignments = [],
  companyTick = 0,
  onDispatchContract,
  networkAccess,
  locomotives = [],
  onOpenNetworkDealer,
}: ContractsViewProps) {
  const active = orders.filter((o) => o.status === 'zugewiesen');
  const done = orders.filter((o) => o.status === 'abgeschlossen');
  const rest = orders.filter((o) => o.status === 'offen' || o.status === 'abgelehnt');
  const offers = industrial.filter((c) => c.status === 'available' || c.status === 'active');
  const archive = industrial.filter((c) => c.status === 'declined' || c.status === 'expired');

  return (
    <SectionShell
      title="Frachtverträge"
      subtitle={`Langfristige Industrieverträge und Spot-Transporte · EVU-Level ${companyLevel} · Bekanntheit ${bekanntheit}`}
    >

      {onAcceptIndustrial && (
        <div className="grid gap-3 lg:grid-cols-2">
          {offers.map((c) => {
            const standing = { level: companyLevel, reputation: bekanntheit, tick: companyTick };
            const payable = industrialPayableDaily(c, standing);
            const op = industrialDailyOperatingCost(c);
            const activeC = c.status === 'active';
            const lockedOffer = c.status === 'available' && !canAcceptIndustrial(c, standing);
            const wagonNeed = industrialWagonNeed(c);
            const wagonCheck = checkWagonAvailability(wagonNeed, wagons);
            const obl = activeC ? contractObligation(c, standing, assignments) : null;
            const needRuns = requiredDeparturesFor(c, companyLevel);
            const netBlock = networkAccess
              ? networkAcceptBlock(
                  {
                    origin: c.corridor.split('→')[0]?.trim() ?? c.corridor,
                    destination: c.corridor.split('→')[1]?.trim() ?? c.corridor,
                    origin_country: c.originCountry,
                    destination_country: c.destCountry,
                    requires_etcs: c.requiresEtcs,
                  },
                  networkAccess,
                  locomotives,
                )
              : null;
            const lockHint = lockedOffer
              ? companyLevel < (c.minLevel ?? 1)
                ? `Ab EVU-Level ${c.minLevel}`
                : `Ab Bekanntheit ${c.minBekanntheit}`
              : null;
            return (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 text-amber-400">
                    <Factory className="h-4 w-4" />
                    <h3 className="text-sm font-bold text-white">{c.title}</h3>
                  </div>
                  <span className="text-[10px] font-bold uppercase text-amber-300">
                    {activeC ? 'Aktiv' : lockHint ? lockHint : 'Angebot'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {c.partner} · {c.corridor}
                </p>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <dt className="uppercase text-slate-500">Laufzeit</dt>
                    <dd className="font-bold text-white">{c.periodDays} Tage</dd>
                  </div>
                  <div>
                    <dt className="uppercase text-slate-500">Abfahrten</dt>
                    <dd className="font-bold text-white">{needRuns} / Tag</dd>
                  </div>
                  <div>
                    <dt className="uppercase text-slate-500">Erlös / Lauf</dt>
                    <dd className="font-bold text-emerald-400">{formatEuro(obl?.tripYield ?? Math.round(payable / Math.max(1, c.dailyDepartures)))}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-[10px] text-slate-500">
                  Trasse/Energie {formatEuro(obl?.tripOpex ?? Math.round(op / Math.max(1, c.dailyDepartures)))} / Lauf
                  {c.requiredWagonType ? ` · ${c.requiredWagonCount}× ${c.requiredWagonType}` : ''}
                  {companyLevel < 6 ? ' · Vollpreis steigt mit EVU-Level' : ''}
                </p>
                {netBlock && (
                  <p className="mt-2 text-[11px] font-bold text-rose-400">
                    {netBlock}{' '}
                    {onOpenNetworkDealer && (
                      <button type="button" className="underline" onClick={onOpenNetworkDealer}>
                        Händler
                      </button>
                    )}
                  </p>
                )}
                {activeC && obl && (
                  <div
                    className={`mt-3 rounded-sm border p-2 text-[11px] ${
                      obl.covered
                        ? 'border-emerald-600 bg-emerald-950/30 text-emerald-200'
                        : 'border-rose-500 bg-rose-950/30 text-rose-100'
                    }`}
                  >
                    <div className="font-bold uppercase">
                      {obl.covered ? 'Erfüllt' : 'Unterdeckt'} · {obl.fulfilled}/{obl.required} Läufe
                    </div>
                    <p className="mt-0.5">
                      {obl.nextDueLabel}
                      {!obl.covered ? ` · Vertragsstrafe ${formatEuro(obl.missPenalty)} je Fehlfahrt` : ''}
                    </p>
                    {!wagonCheck.sufficient && (
                      <div className="mt-2">
                        <WagonShortageBanner
                          check={wagonCheck}
                          onQuickAcquire={onQuickAcquireWagons}
                          onOpenDealer={onBuyMissingWagons}
                          onOpenBuildings={onOpenBuildings}
                          freeBerths={freeBerths}
                        />
                      </div>
                    )}
                    {onDispatchContract && (
                      <Button className="mt-2" disabled={!!netBlock} onClick={() => onDispatchContract(c.id)}>
                        Disponieren
                      </Button>
                    )}
                  </div>
                )}
                {!activeC && (
                  <div className="mt-3 space-y-2">
                    {!wagonCheck.sufficient && (
                      <WagonShortageBanner
                        check={wagonCheck}
                        onQuickAcquire={onQuickAcquireWagons}
                        onOpenDealer={onBuyMissingWagons}
                        onOpenBuildings={onOpenBuildings}
                        freeBerths={freeBerths}
                      />
                    )}
                    <div className="flex gap-2">
                      <Button disabled={lockedOffer || !wagonCheck.sufficient || !!netBlock} onClick={() => onAcceptIndustrial(c.id)}>
                        Annehmen
                      </Button>
                      <Button variant="secondary" onClick={() => onDeclineIndustrial?.(c.id)}>
                        Ablehnen
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {archive.length > 0 && (
        <p className="text-[11px] text-slate-500">
          Archiv: {archive.map((c) => `${c.title} (${c.status})`).join(' · ')}
        </p>
      )}

      <ContractSection title={`Laufend (${active.length})`} empty="Keine laufenden Verträge">
        {active.map((order) => (
          <ContractRow
            key={order.id}
            order={order}
            wagons={wagons}
            actionLabel="Zur Disposition"
            onAction={onOpenDisposition}
            onBuyMissing={onBuyMissingWagons}
            onQuickAcquire={onQuickAcquireWagons}
            onOpenBuildings={onOpenBuildings}
            freeBerths={freeBerths}
          />
        ))}
      </ContractSection>

      <ContractSection title={`Erfüllt (${done.length})`} empty="Noch keine erfüllten Verträge">
        {done.map((order) => (
          <ContractRow key={order.id} order={order} />
        ))}
      </ContractSection>

      {rest.length > 0 && (
        <ContractSection title={`Weitere Aufträge (${rest.length})`} empty="">
          {rest.map((order) => (
            <ContractRow
              key={order.id}
              order={order}
              wagons={wagons}
              actionLabel={order.status === 'offen' ? 'Disponieren' : undefined}
              onAction={order.status === 'offen' ? onOpenDisposition : undefined}
              onBuyMissing={order.status === 'offen' ? onBuyMissingWagons : undefined}
              onQuickAcquire={order.status === 'offen' ? onQuickAcquireWagons : undefined}
              onOpenBuildings={onOpenBuildings}
              freeBerths={freeBerths}
            />
          ))}
        </ContractSection>
      )}
    </SectionShell>
  );
}

function ContractSection({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode;
}) {
  const items = Array.isArray(children) ? children.filter(Boolean) : [children];
  return (
    <div className="fi-card">
      <div className="fi-card-header flex items-center gap-2">
        <FileText className="h-3.5 w-3.5 text-amber-400" />
        {title}
      </div>
      <div className="divide-y divide-[#1e293b]">
        {items.length === 0 && empty && (
          <div className="py-8 text-center text-xs text-slate-500">{empty}</div>
        )}
        {children}
      </div>
    </div>
  );
}

function ContractRow({
  order,
  wagons = [],
  actionLabel,
  onAction,
  onBuyMissing,
  onQuickAcquire,
  onOpenBuildings,
  freeBerths,
}: {
  order: Order;
  wagons?: Wagon[];
  actionLabel?: string;
  onAction?: (order: Order) => void;
  onBuyMissing?: (typeCode: string, qty: number) => void;
  onQuickAcquire?: (typeCode: string, qty: number, how: Acquisition) => void;
  onOpenBuildings?: () => void;
  freeBerths?: number;
}) {
  const typeCfg = getOrderTypeConfig(order.type);
  const statusCfg = getOrderStatusConfig(order.status);
  const check = checkWagonAvailability(order, wagons);
  const shortage = order.status === 'offen' || order.status === 'zugewiesen' ? wagonShortageLabel(check) : null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Package className={`h-3 w-3 ${typeCfg.text}`} />
          <span className="text-xs font-bold text-white">{order.title}</span>
          <span className="font-mono text-[10px] text-slate-500">{order.order_number}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
          <MapPin className="h-3 w-3 text-sky-400" />
          {order.origin} → {order.destination}
          <span className="text-slate-600">·</span>
          {order.distance_km} km · {order.weight_t.toLocaleString('de-DE')} t
        </div>
        {shortage && (
          <div className="mt-2 max-w-lg">
            <WagonShortageBanner
              check={check}
              onQuickAcquire={onQuickAcquire}
              onOpenDealer={onBuyMissing}
              onOpenBuildings={onOpenBuildings}
              freeBerths={freeBerths}
            />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={getOrderPillClass(order.status)}>{statusCfg.label}</span>
        <span className="fi-gold text-xs font-bold">{formatEuro(Number(order.yield))}</span>
        {actionLabel && onAction && (
          <button
            type="button"
            disabled={!!shortage}
            onClick={() => {
              if (shortage) return;
              onAction(order);
            }}
            className="btn-gold-sm disabled:cursor-not-allowed disabled:opacity-40"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
