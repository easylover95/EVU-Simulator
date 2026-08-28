import { memo } from 'react';
import { Factory } from 'lucide-react';
import type { AssignmentWithDetails, Locomotive, Order, Wagon } from '@/lib/supabase';
import { formatEuro } from '@/lib/status';
import { Button, Card } from '@/components/ui';
import {
  canAcceptIndustrial,
  contractObligation,
  industrialPayableDaily,
  industrialWagonNeed,
  requiredDeparturesFor,
  type IndustrialContract,
} from '@/lib/freightContracts';
import { checkWagonAvailability } from '@/lib/brh';
import { WagonShortageBanner } from '@/components/WagonShortageBanner';
import type { Acquisition } from '@/lib/dealer';
import { networkAcceptBlock, type NetworkAccessState } from '@/lib/networkAccess';
import { bestFleetFit } from '@/lib/traction';
import { networkSiteById } from '@/lib/networkSites';
import type { DepotState } from '@/lib/depot';
import { isNetworkSiteOwned } from '@/lib/depot';
import { exclusiveJobsUnlocked, reputationTier } from '@/lib/reputation';
import { buildFrameworkContractCard, locoHasEtcsFleet } from '@/lib/contractCard';

export interface FrameworkContractsPanelProps {
  industrial: IndustrialContract[];
  wagons?: Wagon[];
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

export const FrameworkContractsPanel = memo(function FrameworkContractsPanel({
  industrial,
  wagons = [],
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
}: FrameworkContractsPanelProps) {
  const offers = industrial.filter((c) => c.status === 'available' || c.status === 'active');
  const archive = industrial.filter((c) => c.status === 'declined' || c.status === 'expired');
  const standing = { level: companyLevel, reputation: bekanntheit, tick: companyTick };
  const tier = reputationTier(bekanntheit);

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-amber-300">EVU-Reputation</p>
        <p className="mt-1 text-sm font-bold text-white">
          {tier.label} · {bekanntheit}/100
        </p>
        <p className="mt-1 text-[11px] text-slate-400">
          Zuverlässige Rahmenverträge steigern das Firmen-Image. Ab 70 Punkten erscheinen exklusive Ganzzüge
          {exclusiveJobsUnlocked(bekanntheit) ? ' — Freigabe aktiv.' : '.'} {tier.hint}.
        </p>
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        {offers.map((c) => {
          const payable = industrialPayableDaily(c, standing);
          const activeC = c.status === 'active';
          const siteMissing = Boolean(c.requiredSiteId && depot && !isNetworkSiteOwned(depot, c.requiredSiteId));
          const lockedOffer = c.status === 'available' && (!canAcceptIndustrial(c, standing, depot) || siteMissing);
          const wagonNeed = industrialWagonNeed(c);
          const wagonCheck = checkWagonAvailability(wagonNeed, wagons);
          const obl = activeC ? contractObligation(c, standing, assignments) : null;
          const needRuns = requiredDeparturesFor(c, companyLevel);
          const stub: Pick<Order, 'origin' | 'destination' | 'origin_country' | 'destination_country' | 'requires_etcs' | 'electrified' | 'type' | 'weight_t'> = {
            origin: c.corridor.split('→')[0]?.trim() ?? c.corridor,
            destination: c.corridor.split('→')[1]?.trim() ?? c.corridor,
            origin_country: c.originCountry,
            destination_country: c.destCountry,
            requires_etcs: c.requiresEtcs,
            electrified: c.electrified !== false,
            type: 'gueterverkehr',
            weight_t: c.trainWeightT ?? 0,
          };
          const netBlock = networkAccess ? networkAcceptBlock(stub, networkAccess, locomotives) : null;
          const traction = bestFleetFit(stub, locomotives);
          const site = c.requiredSiteId ? networkSiteById(c.requiredSiteId) : undefined;
          const lockHint = lockedOffer
            ? companyLevel < (c.minLevel ?? 1)
              ? `Ab EVU-Level ${c.minLevel}`
              : siteMissing
                ? `Betriebsstelle ${site?.name ?? c.requiredSiteId} erforderlich`
                : `Ab Reputation ${c.minBekanntheit}`
            : null;
          const card = buildFrameworkContractCard(c, wagons, {
            level: companyLevel,
            reputation: bekanntheit,
            hasEtcs: locoHasEtcsFleet(locomotives),
          });
          return (
            <Card key={c.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 text-amber-400">
                  <Factory className="h-4 w-4" />
                  <h3 className="text-sm font-bold text-white">{c.title}</h3>
                </div>
                <span className="fi-pill fi-pill-gold">Rahmen</span>
              </div>
              <span className="mt-1 inline-block text-[10px] font-bold uppercase text-amber-300">
                {activeC ? 'Aktiv' : lockHint ? lockHint : 'Angebot'}
              </span>
              <p className="mt-1 text-xs text-slate-400">
                {c.partner} · {c.corridor}
                {c.exclusive ? ' · Exklusiv-Ganzzug' : ''}
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
                  <dd className="font-bold text-emerald-400">
                    {formatEuro(obl?.tripYield ?? Math.round(payable / Math.max(1, c.dailyDepartures)))}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-[10px] text-slate-500">
                Nutzlänge {card.usableLengthM != null ? `${card.usableLengthM.toLocaleString('de-DE')} m` : '—'} · {card.tonnageT.toLocaleString('de-DE')} t · {card.tractionLabel}
                · DB {formatEuro(card.contribution)} / Tag
                {c.requiredWagonType ? ` · ${c.requiredWagonCount}× ${c.requiredWagonType}` : ''}
                {site ? ` · Knoten ${site.nodeLabel}` : ''}
              </p>
              <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                {card.clearances.map((row) => (
                  <span key={row.id} className={row.met ? 'text-emerald-300' : 'text-amber-300'}>
                    {row.label}
                  </span>
                ))}
              </div>
              {traction && (
                <p className={`mt-2 text-[11px] ${traction.ok ? 'text-emerald-300' : 'text-rose-400'}`}>{traction.message}</p>
              )}
              {netBlock && (
                <p className="mt-2 text-[11px] font-bold text-rose-400">
                  {netBlock}{' '}
                  {onOpenNetworkDealer && (
                    <button type="button" className="min-h-12 underline" onClick={onOpenNetworkDealer}>
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
                    <Button className="mt-2 min-h-12" disabled={!!netBlock || traction?.ok === false} onClick={() => onDispatchContract(c.id)}>
                      Disponieren
                    </Button>
                  )}
                </div>
              )}
              {!activeC && onAcceptIndustrial && (
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
                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="min-h-12"
                      disabled={lockedOffer || !wagonCheck.sufficient || !!netBlock || traction?.ok === false}
                      onClick={() => onAcceptIndustrial(c.id)}
                    >
                      Annehmen
                    </Button>
                    <Button className="min-h-12" variant="secondary" onClick={() => onDeclineIndustrial?.(c.id)}>
                      Ablehnen
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
      {archive.length > 0 && (
        <p className="text-[11px] text-slate-500">
          Archiv: {archive.map((c) => `${c.title} (${c.status})`).join(' · ')}
        </p>
      )}
    </div>
  );
});
