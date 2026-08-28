import type { ReactNode } from 'react';
import { FileText, MapPin, Package } from 'lucide-react';
import type { AssignmentWithDetails, Locomotive, Order, Wagon } from '@/lib/supabase';
import { formatEuro, getOrderPillClass, getOrderStatusConfig, getOrderTypeConfig } from '@/lib/status';
import { SectionShell } from '@/components/SectionShell';
import { type IndustrialContract } from '@/lib/freightContracts';
import { checkWagonAvailability, wagonShortageLabel } from '@/lib/brh';
import { WagonShortageBanner } from '@/components/WagonShortageBanner';
import type { Acquisition } from '@/lib/dealer';
import type { NetworkAccessState } from '@/lib/networkAccess';
import { FrameworkContractsPanel } from '@/components/FrameworkContractsPanel';
import type { DepotState } from '@/lib/depot';

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
  depot?: DepotState;
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
  depot,
}: ContractsViewProps) {
  const active = orders.filter((o) => o.status === 'zugewiesen');
  const done = orders.filter((o) => o.status === 'abgeschlossen');
  const rest = orders.filter((o) => o.status === 'offen' || o.status === 'abgelehnt');

  return (
    <SectionShell
      title="Frachtverträge"
      subtitle={`Langfristige Industrieverträge und Spot-Transporte · EVU-Level ${companyLevel} · Bekanntheit ${bekanntheit}`}
    >

      {onAcceptIndustrial && (
        <FrameworkContractsPanel
          industrial={industrial}
          wagons={wagons}
          bekanntheit={bekanntheit}
          companyLevel={companyLevel}
          onAcceptIndustrial={onAcceptIndustrial}
          onDeclineIndustrial={onDeclineIndustrial}
          onBuyMissingWagons={onBuyMissingWagons}
          onQuickAcquireWagons={onQuickAcquireWagons}
          onOpenBuildings={onOpenBuildings}
          freeBerths={freeBerths}
          assignments={assignments}
          companyTick={companyTick}
          onDispatchContract={onDispatchContract}
          networkAccess={networkAccess}
          locomotives={locomotives}
          onOpenNetworkDealer={onOpenNetworkDealer}
          depot={depot}
        />
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
