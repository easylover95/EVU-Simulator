import { Building2 } from 'lucide-react';
import { Card } from '@/components/ui';
import { SectionShell } from '@/components/SectionShell';
import { DepotUpgradePanel } from '@/components/DepotUpgradePanel';
import {
  nextExpansion,
  workshopSlotCap,
  type DepotState,
} from '@/lib/depot';
import type { Wagon } from '@/lib/supabase';

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
}: BuildingsViewProps) {
  const standort = hqLocation?.trim() || 'Duisburg';
  const workshopCap = workshopSlotCap(depot);
  const workshopFree = Math.max(0, workshopCap - workshopUsed);
  const nextWs = nextExpansion(depot, 'workshop');
  return (
    <SectionShell title="Gebäude" subtitle="Depot und Werkstatt ausbauen">
      <Card>
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-400">
            <Building2 className="h-7 w-7" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Zentrale {standort}</h3>
            <p className="mt-1 text-sm text-slate-400">
              {companyName ?? 'AixRail GmbH'} · mehr Platz für Loks, Wagen und Werkstatt
            </p>
            <p className="mt-2 text-sm font-bold text-amber-100">
              Werkstatt {workshopUsed} / {workshopCap} · {workshopFree} frei
            </p>
            {nextWs && (
              <p className="mt-1 text-[11px] text-slate-500">
                Nächster Ausbau ab Level {nextWs.unlockLevel}
              </p>
            )}
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
    </SectionShell>
  );
}
