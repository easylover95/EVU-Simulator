import { useMemo, useState } from 'react';
import { ClipboardList, Train, User } from 'lucide-react';
import type { AssignmentWithDetails, Driver, Locomotive, Order, Wagon } from '@/lib/supabase';
import { formatEuro, getOrderTypeConfig } from '@/lib/status';
import { isBaugleisEinsatz, isExpiredOpenOffer } from '@/lib/orderMarket';
import { useGameClock } from '@/lib/GameClockContext';
import { ensureMaintenance, isLocoDeployable } from '@/lib/workshop';
import { getLocoDisplayName } from '@/lib/locoPhotos';
import { Button, Card } from '@/components/ui';
import { SectionShell } from '@/components/SectionShell';
import { WagonShortageBanner } from '@/components/WagonShortageBanner';
import { checkWagonAvailability } from '@/lib/brh';
import { driverRestStatus, restStatusHint, REST_WARNING } from '@/lib/restRules';
import type { Acquisition } from '@/lib/dealer';
import { seriesDispatchBlock, seriesIdForLoco, seriesLabel } from '@/lib/personal';
import type { StaffMeta } from '@/lib/jobcenter';

interface TourPlannerViewProps {
  orders: Order[];
  locomotives: Locomotive[];
  drivers: Driver[];
  wagons?: Wagon[];
  staffMeta?: Record<string, StaffMeta>;
  onAssign: (order: Order, locomotiveId: string, driverId: string) => void;
  onOpenDisposition: () => void;
  onBuyMissingWagons?: (typeCode: string, qty: number) => void;
  onQuickAcquireWagons?: (typeCode: string, qty: number, how: Acquisition) => void;
  onOpenBuildings?: () => void;
  freeBerths?: number;
}

export function TourPlannerView({
  orders,
  locomotives,
  drivers,
  wagons = [],
  staffMeta = {},
  onAssign,
  onOpenDisposition,
  onBuyMissingWagons,
  onQuickAcquireWagons,
  onOpenBuildings,
  freeBerths,
}: TourPlannerViewProps) {
  const { gameNow } = useGameClock();
  const open = useMemo(
    () => orders.filter((o) => o.status === 'offen' && !isExpiredOpenOffer(o, gameNow)),
    [orders, gameNow],
  );
  const locos = useMemo(
    () => locomotives.filter((l) => isLocoDeployable(ensureMaintenance(l))),
    [locomotives],
  );
  const tfs = useMemo(
    () => drivers.filter((d) => d.status === 'verfuegbar' && d.qualifications.some((q) => q.toLowerCase() === 'tf')),
    [drivers],
  );
  const [orderId, setOrderId] = useState('');
  const [locoId, setLocoId] = useState('');
  const [driverId, setDriverId] = useState('');
  const selected = open.find((o) => o.id === orderId) ?? null;
  const wagonCheck = selected ? checkWagonAvailability(selected, wagons) : null;
  const selectedTf = tfs.find((d) => d.id === driverId) ?? null;
  const selectedLoco = locos.find((l) => l.id === locoId) ?? null;
  const restWarn = selectedTf ? driverRestStatus(selectedTf, gameNow) : null;
  const seriesBlock = selectedLoco
    ? seriesDispatchBlock(selectedLoco, driverId ? staffMeta[driverId]?.seriesIds : [])
    : null;

  return (
    <SectionShell
      title="Tourenplaner"
      subtitle="Schnelle Zuweisung — detaillierte Brh-Prüfung in der Disposition"
      actions={
        <Button variant="secondary" onClick={onOpenDisposition}>
          <ClipboardList className="h-3.5 w-3.5" /> Zur Disposition
        </Button>
      }
    >
      <Card>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-[10px] font-bold uppercase text-slate-500">
            Auftrag
            <select
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-amber-500/30 bg-slate-950 px-2 py-2 text-xs text-white"
            >
              <option value="">— wählen —</option>
              {open.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.order_number} · {o.title}
                  {isBaugleisEinsatz(o) ? ` · Einsatz ${o.deployment_days}d` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-bold uppercase text-slate-500">
            Lok
            <select
              value={locoId}
              onChange={(e) => setLocoId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-amber-500/30 bg-slate-950 px-2 py-2 text-xs text-white"
            >
              <option value="">— wählen —</option>
              {locos.map((l) => (
                <option key={l.id} value={l.id}>
                  {getLocoDisplayName(l.designation)} · {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-bold uppercase text-slate-500">
            Tf
            <select
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-amber-500/30 bg-slate-950 px-2 py-2 text-xs text-white"
            >
              <option value="">— wählen —</option>
              {tfs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {selectedLoco && seriesIdForLoco(selectedLoco) && !staffMeta[d.id]?.seriesIds?.includes(seriesIdForLoco(selectedLoco) ?? '')
                    ? ` · keine ${seriesLabel(seriesIdForLoco(selectedLoco))}`
                    : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        {selected && (
          <p className="mt-3 text-xs text-slate-400">
            {selected.origin} → {selected.destination} · {formatEuro(Number(selected.yield))} ·{' '}
            {getOrderTypeConfig(selected.type).label}
            {isBaugleisEinsatz(selected) && (
              <span className="mt-1 block text-amber-300">
                Baugleis-Einsatz braucht 2 Tf + AZF/RB — bitte in der Disposition zuweisen.
              </span>
            )}
            {selected.type === 'baugleis' && !isBaugleisEinsatz(selected) && (
              <span className="mt-1 block text-amber-300">
                Spot-Baugleis: AZF/RB per PDL, falls kein eigenes Personal — Zuweisung hier oder in der Disposition.
              </span>
            )}
          </p>
        )}
        {seriesBlock && <p className="mt-3 text-xs font-bold text-amber-300">{seriesBlock}</p>}
        {restWarn?.violated && (
          <p className="mt-3 text-xs font-bold text-rose-300">
            {REST_WARNING}. Zuweisung bleibt möglich — {restStatusHint(restWarn)}.
          </p>
        )}
        {wagonCheck && !wagonCheck.sufficient && (
          <div className="mt-3">
            <WagonShortageBanner
              check={wagonCheck}
              onQuickAcquire={onQuickAcquireWagons}
              onOpenDealer={onBuyMissingWagons}
              onOpenBuildings={onOpenBuildings}
              freeBerths={freeBerths}
            />
          </div>
        )}
        <Button
          className="mt-4"
          disabled={!selected || !locoId || !driverId || isBaugleisEinsatz(selected) || !!(wagonCheck && !wagonCheck.sufficient) || !!seriesBlock}
          onClick={() => {
            if (!selected) return;
            if (wagonCheck && !wagonCheck.sufficient) return;
            onAssign(selected, locoId, driverId);
            setOrderId('');
            setLocoId('');
            setDriverId('');
          }}
        >
          <Train className="h-3.5 w-3.5" /> Tour anlegen
        </Button>
      </Card>
    </SectionShell>
  );
}

interface TourOverviewViewProps {
  assignments: AssignmentWithDetails[];
  onOpenDisposition: () => void;
}

export function TourOverviewView({ assignments, onOpenDisposition }: TourOverviewViewProps) {
  const live = assignments.filter((a) => a.status === 'geplant' || a.status === 'aktiv');
  const done = assignments.filter((a) => a.status === 'abgeschlossen' || a.status === 'abgebrochen');

  return (
    <SectionShell
      title="Tourenübersicht"
      subtitle={`${live.length} laufend · ${done.length} historisch`}
      actions={
        <Button variant="secondary" onClick={onOpenDisposition}>
          <ClipboardList className="h-3.5 w-3.5" /> Disposition
        </Button>
      }
    >
      <Card className="p-0">
        <table className="fi-table">
          <thead>
            <tr>
              <th>Auftrag</th>
              <th>Strecke</th>
              <th>Lok</th>
              <th>Tf</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {assignments.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500">
                  Keine Touren
                </td>
              </tr>
            )}
            {assignments.map((a) => (
              <tr key={a.id}>
                <td className="text-white">{a.order?.title ?? a.order_id}</td>
                <td className="text-slate-400">
                  {a.order ? `${a.order.origin} → ${a.order.destination}` : '—'}
                </td>
                <td>{a.locomotive ? getLocoDisplayName(a.locomotive.designation) : '—'}</td>
                <td>
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3 w-3 text-amber-400" />
                    {a.driver?.name ?? '—'}
                  </span>
                </td>
                <td className="uppercase text-amber-300">{a.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </SectionShell>
  );
}
