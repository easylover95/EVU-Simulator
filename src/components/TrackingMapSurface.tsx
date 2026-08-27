import { lazy, Suspense } from 'react';
import type { AssignmentWithDetails, Locomotive, Wagon } from '@/lib/supabase';
import type { NetworkStatus } from '@/lib/networkStatus';
import { OfflineRailMap } from '@/components/OfflineRailMap';

const LiveTrackingMap = lazy(async () => {
  const module = await import('@/components/LiveTrackingMap');
  return { default: module.LiveTrackingMap };
});

type TrackingMapSurfaceProps = {
  networkStatus: NetworkStatus;
  assignments: AssignmentWithDetails[];
  wagons: Wagon[];
  tick: number;
  locomotives?: Locomotive[];
  hqLocation?: string;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onOpenTrainDispatch?: (assignmentId: string) => void;
  fitRequest?: number;
  refreshRequest?: number;
  variant?: 'card' | 'fill';
};

/**
 * Keeps external map tiles out of offline startup. The self-owned operation map
 * remains fully usable with local game state while the network is unavailable.
 */
export function TrackingMapSurface({ networkStatus, ...mapProps }: TrackingMapSurfaceProps) {
  if (networkStatus === 'offline') return <OfflineRailMap {...mapProps} />;

  return (
    <Suspense fallback={<OfflineRailMap {...mapProps} />}>
      <LiveTrackingMap {...mapProps} />
    </Suspense>
  );
}
