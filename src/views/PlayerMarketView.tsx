import { Store } from 'lucide-react';
import { Card } from '@/components/ui';
import { SectionShell } from '@/components/SectionShell';

export function PlayerMarketView() {
  return (
    <SectionShell title="Spieler-Börse" subtitle="Peer-to-Peer-Frachten zwischen EVUs">
      <Card className="flex min-h-[240px] flex-col items-center justify-center text-center">
        <Store className="h-10 w-10 text-amber-400" />
        <h3 className="mt-3 text-lg font-bold text-white">Spieler-Börse kommt</h3>
        <p className="mt-2 max-w-md text-sm text-slate-400">
          Lokal leer — es gibt noch keinen P2P-Markt. Spot-Frachten liegen weiterhin in der Frachtbörse.
        </p>
      </Card>
    </SectionShell>
  );
}
