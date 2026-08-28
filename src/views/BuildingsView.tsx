import { Building2 } from 'lucide-react';
import { Card } from '@/components/ui';
import { SectionShell } from '@/components/SectionShell';
import { DepotUpgradePanel } from '@/components/DepotUpgradePanel';
import { NetworkSitesPanel } from '@/components/NetworkSitesPanel';
import {
  BASE_LOCO_BERTHS,
  BASE_WAGON_BERTHS,
  BASE_WORKSHOP_SLOTS,
  nextExpansion,
  workshopSlotCap,
  type DepotState,
} from '@/lib/depot';
import type { Locomotive, Wagon } from '@/lib/supabase';

interface BuildingsViewProps {
  hqLocation?: string;
  companyName?: string;
  depot: DepotState;
  companyLevel: number;
  balance: number;
  locoCount: number;
  wagons: Wagon[];
  workshopUsed: number;
  onBuyExpansion: (expansionId: string) => boolean;
  locomotives: Locomotive[];
  onBuyNetworkSite: (siteId: string) => boolean;
  onRelocateLoco: (locoId: string, siteId: string) => boolean;
}

export function BuildingsView({
  hqLocation,
  companyName,
  depot,
  companyLevel,
  balance,
  locoCount,
  wagons,
  workshopUsed,
  onBuyExpansion,
  locomotives,
  onBuyNetworkSite,
  onRelocateLoco,
}: BuildingsViewProps) {
  const standort = hqLocation?.trim() || 'Duisburg';
  const workshopCap = workshopSlotCap(depot);
  const workshopFree = Math.max(0, workshopCap - workshopUsed);
  const nextWs = nextExpansion(depot, 'workshop');
  return (
    <SectionShell title="Gebäude" subtitle="Zentrale, Depot und Werkstatt-Ausbau">
      <Card>
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-400">
            <Building2 className="h-7 w-7" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Gebäude — Zentrale {standort}</h3>
            <p className="mt-1 text-sm text-slate-400">
              {companyName ?? 'AixRail GmbH'} startet in Duisburg mit {BASE_LOCO_BERTHS} Lok-Stellplätzen,{' '}
              {BASE_WAGON_BERTHS} Wagen-Plätzen und {BASE_WORKSHOP_SLOTS} Werkstatt-Slots. Weitere Knoten (Hamburg Hafen,
              Maschen Rbf, München Ost und weitere) kaufst du als eigene Betriebsstellen — Kapazität in Fuhrpark, Händler
              und Personal wächst mit.
            </p>
            <p className="mt-2 text-sm font-bold text-amber-100">
              Werkstatt aktuell {workshopUsed} / {workshopCap} belegt · {workshopFree} frei
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              {nextWs
                ? `Nächster Werkstatt-Ausbau: ${nextWs.label} ab Level ${nextWs.unlockLevel}. Sind alle eigenen Slots voll, bleibt Fremdvergabe (+25 %, ohne Slot) in der Werkstatt buchbar.`
                : 'Maximale eigene Werkstattkapazität erreicht. Fremdvergabe bleibt als Überlauf verfügbar.'}
            </p>
          </div>
        </div>
      </Card>

      <DepotUpgradePanel
        depot={depot}
        companyLevel={companyLevel}
        balance={balance}
        locoCount={locoCount}
        wagons={wagons}
        workshopUsed={workshopUsed}
        onBuy={onBuyExpansion}
      />

      <NetworkSitesPanel
        depot={depot}
        companyLevel={companyLevel}
        balance={balance}
        locomotives={locomotives}
        onBuySite={onBuyNetworkSite}
        onRelocate={onRelocateLoco}
      />
    </SectionShell>
  );
}
