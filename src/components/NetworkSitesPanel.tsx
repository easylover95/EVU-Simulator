import { memo, useMemo, useState } from 'react';
import { MapPin, TrainFront, Warehouse } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { formatEuro } from '@/lib/status';
import {
  canBuyNetworkSite,
  canRelocateLoco,
  freeSiteLocoBerths,
  isNetworkSiteOwned,
  locoStation,
  siteLocoBerthCap,
  staffHousingCap,
  type DepotState,
} from '@/lib/depot';
import {
  NETWORK_SITES,
  RELOCATION_COST,
  regionLabel,
  type NetworkSite,
} from '@/lib/networkSites';
import type { Locomotive } from '@/lib/supabase';

export const NetworkSitesPanel = memo(function NetworkSitesPanel({
  depot,
  companyLevel,
  balance,
  locomotives,
  onBuySite,
  onRelocate,
}: {
  depot: DepotState;
  companyLevel: number;
  balance: number;
  locomotives: Locomotive[];
  onBuySite: (siteId: string) => boolean;
  onRelocate: (locoId: string, siteId: string) => boolean;
}) {
  const [relocateLocoId, setRelocateLocoId] = useState<string | null>(null);
  const sites = useMemo(() => [...NETWORK_SITES], []);
  const relocatable = useMemo(
    () => locomotives.filter((loco) => loco.status !== 'einsatz' && loco.status !== 'stillgelegt'),
    [locomotives],
  );
  const staffCap = staffHousingCap(depot);

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-400">
            <Warehouse className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Betriebsstellen-Netz</h3>
            <p className="mt-1 text-xs text-slate-400">
              Neue Depots an Bahnknoten erhöhen Lok-, Wagen- und Personal-Kapazität und schalten regionale Fracht frei.
              Umstationierung kostet {formatEuro(RELOCATION_COST)} (Lichtfahrt, ohne Uhrzeit-Tick).
            </p>
            <p className="mt-2 text-[11px] text-amber-200">Personal-Kapazität {staffCap} Tf-Dienstplätze</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sites.map((site) => (
          <SiteCard
            key={site.id}
            site={site}
            depot={depot}
            companyLevel={companyLevel}
            balance={balance}
            locomotives={locomotives}
            onBuySite={onBuySite}
          />
        ))}
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2 text-amber-400">
          <TrainFront className="h-4 w-4" />
          <h3 className="text-sm font-bold text-white">Umstationierung</h3>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          Triebfahrzeuge zwischen eigenen Betriebsstätten verschieben. Loks im Einsatz bleiben gesperrt.
        </p>
        <div className="mt-3 grid gap-2">
          {relocatable.length === 0 && (
            <p className="text-xs text-slate-500">Keine freie Lok zur Umstationierung.</p>
          )}
          {relocatable.map((loco) => {
            const here = locoStation(depot, loco.id);
            const open = relocateLocoId === loco.id;
            return (
              <div key={loco.id} className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-white">
                      {loco.designation} · {loco.name}
                    </p>
                    <p className="text-[11px] text-slate-400">Standort: {sites.find((s) => s.id === here)?.name ?? here}</p>
                  </div>
                  <Button className="min-h-12" variant="secondary" onClick={() => setRelocateLocoId(open ? null : loco.id)}>
                    {open ? 'Schließen' : 'Umstationieren'}
                  </Button>
                </div>
                {open && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {sites
                      .filter((site) => isNetworkSiteOwned(depot, site.id) && site.id !== here)
                      .map((site) => {
                        const check = canRelocateLoco(depot, locomotives, loco.id, site.id);
                        return (
                          <button
                            key={site.id}
                            type="button"
                            disabled={!check.ok || balance < check.cost}
                            onClick={() => {
                              if (onRelocate(loco.id, site.id)) setRelocateLocoId(null);
                            }}
                            className="min-h-12 rounded-lg border border-amber-500/30 bg-slate-950 px-3 py-2 text-left text-[11px] text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <span className="font-bold text-white">{site.name}</span>
                            <span className="mt-0.5 block text-slate-400">
                              {check.ok
                                ? `${formatEuro(check.cost)} · ${freeSiteLocoBerths(depot, locomotives, site.id)} frei`
                                : check.message}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
});

const SiteCard = memo(function SiteCard({
  site,
  depot,
  companyLevel,
  balance,
  locomotives,
  onBuySite,
}: {
  site: NetworkSite;
  depot: DepotState;
  companyLevel: number;
  balance: number;
  locomotives: Locomotive[];
  onBuySite: (siteId: string) => boolean;
}) {
  const owned = isNetworkSiteOwned(depot, site.id);
  const canBuy = canBuyNetworkSite(depot, site, companyLevel);
  const occ = locomotives.filter((loco) => locoStation(depot, loco.id) === site.id).length;
  const cap = siteLocoBerthCap(depot, site.id);
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-300">{regionLabel(site.region)}</p>
          <h3 className="text-sm font-bold text-white">{site.name}</h3>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
            <MapPin className="h-3 w-3 text-sky-400" />
            {site.nodeLabel}
          </p>
        </div>
        <span className="text-[10px] font-bold uppercase text-amber-200">{owned ? 'Im Bestand' : `Lvl ${site.unlockLevel}`}</span>
      </div>
      <p className="mt-2 text-xs text-slate-400">{site.flavor}</p>
      <p className="mt-1 text-[11px] text-slate-500">
        {owned
          ? `Loks ${occ}/${cap}`
          : `+${site.addLocoBerths} Lok · +${site.addWagonBerths} Wagen · +${site.addStaffSlots} Tf`}
      </p>
      {!owned && !site.starter && (
        <Button
          className="mt-3 min-h-12 w-full"
          disabled={!canBuy || balance < site.cost}
          onClick={() => onBuySite(site.id)}
        >
          {canBuy ? `Erwerben · ${formatEuro(site.cost)}` : `Ab Level ${site.unlockLevel}`}
        </Button>
      )}
    </Card>
  );
});
