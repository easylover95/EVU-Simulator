import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui';
import { wagonShortageLabel, type WagonAvailability } from '@/lib/brh';
import { quoteWagonDeal, wagonOfferByTypeCode, type Acquisition } from '@/lib/dealer';
import { formatEuro } from '@/lib/status';

export function WagonShortageBanner({
  check,
  onQuickAcquire,
  onOpenDealer,
  onOpenBuildings,
  freeBerths,
}: {
  check: WagonAvailability;
  onQuickAcquire?: (typeCode: string, qty: number, how: Acquisition) => void;
  onOpenDealer?: (typeCode: string, qty: number) => void;
  onOpenBuildings?: () => void;
  freeBerths?: number;
}) {
  const label = wagonShortageLabel(check);
  if (!label || !check.type || check.missing <= 0) return null;

  const offer = wagonOfferByTypeCode(check.type);
  const quote = offer ? quoteWagonDeal(offer, check.missing) : null;
  const berthBlocked = freeBerths != null && check.missing > freeBerths;

  return (
    <div className="rounded-lg border border-rose-500/50 bg-rose-950/40 p-3">
      <div className="flex items-start gap-2 text-rose-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{label}</p>
          <p className="mt-1 text-[11px] text-rose-300/80">
            Frei {check.available} von {check.required}× {check.type}. Auftrag erst annehmen oder
            zuweisen, wenn der Bestand reicht.
          </p>
          {berthBlocked && (
            <p className="mt-1 text-[11px] font-bold text-amber-300">
              Stellplätze reichen nicht ({freeBerths} frei, {check.missing} benötigt). Depot unter
              Gebäude ausbauen.
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {onQuickAcquire && quote && !berthBlocked && (
              <>
                <Button
                  className="px-3 py-1.5"
                  onClick={() => onQuickAcquire(check.type!, check.missing, 'leasing')}
                >
                  Quick-Lease {check.missing}× {check.type} · {formatEuro(quote.leaseDaily)}/Tag
                </Button>
                <Button
                  className="px-3 py-1.5"
                  onClick={() => onQuickAcquire(check.type!, check.missing, 'kauf')}
                >
                  Quick-Buy {check.missing}× {check.type} · {formatEuro(quote.buyPrice)}
                </Button>
              </>
            )}
            {berthBlocked && onOpenBuildings && (
              <Button className="px-3 py-1.5" onClick={onOpenBuildings}>
                Depot ausbauen
              </Button>
            )}
            {onOpenDealer && (
              <Button variant="secondary" className="px-3 py-1.5" onClick={() => onOpenDealer(check.type!, check.missing)}>
                Zum Händler
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
