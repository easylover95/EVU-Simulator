import { useMemo, useState } from 'react';
import { CloudOff, MapPin, Train, X } from 'lucide-react';
import type { AssignmentWithDetails, Locomotive, Wagon } from '@/lib/supabase';
import { buildTrackedTrains, locoMarkerId } from '@/lib/tracking';
import { lookupStation } from '@/lib/stations';
import { getLocoDisplayName } from '@/lib/locoPhotos';

const MAP_BOUNDS = { minLat: 47, maxLat: 55.8, minLng: 5.5, maxLng: 15.5 };

type MapPoint = { x: number; y: number };

type ParkedLoco = {
  id: string;
  loco: Locomotive;
  lat: number;
  lng: number;
};

export interface OfflineRailMapProps {
  assignments: AssignmentWithDetails[];
  wagons: Wagon[];
  tick: number;
  locomotives?: Locomotive[];
  hqLocation?: string;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onOpenTrainDispatch?: (assignmentId: string) => void;
  variant?: 'card' | 'fill';
}

function toPoint(lat: number, lng: number): MapPoint {
  const x = ((lng - MAP_BOUNDS.minLng) / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng)) * 100;
  const y = (1 - (lat - MAP_BOUNDS.minLat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat)) * 100;
  return { x: Math.max(4, Math.min(96, x)), y: Math.max(6, Math.min(90, y)) };
}

/**
 * A self-owned offline fallback. It deliberately renders game corridors and
 * locally known positions instead of caching third-party map tiles.
 */
export function OfflineRailMap({
  assignments,
  wagons,
  tick,
  locomotives = [],
  hqLocation,
  selectedId: controlledSelectedId,
  onSelect,
  onOpenTrainDispatch,
  variant = 'card',
}: OfflineRailMapProps) {
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const selectedId = controlledSelectedId === undefined ? internalSelectedId : controlledSelectedId;
  const trains = useMemo(() => buildTrackedTrains(assignments, tick, wagons), [assignments, tick, wagons]);
  const assignedLocoIds = useMemo(
    () => new Set(assignments.filter((assignment) => assignment.status === 'geplant' || assignment.status === 'aktiv').map((assignment) => assignment.locomotive_id)),
    [assignments],
  );
  const parked = useMemo((): ParkedLoco[] => {
    const station = lookupStation(hqLocation || 'Duisburg');
    return locomotives
      .filter((loco) => !assignedLocoIds.has(loco.id))
      .map((loco, index) => ({
        id: locoMarkerId(loco.id),
        loco,
        lat: station.lat + Math.cos(index * 1.8) * 0.09,
        lng: station.lng + Math.sin(index * 1.8) * 0.11,
      }));
  }, [assignedLocoIds, hqLocation, locomotives]);
  const selectedTrain = trains.find((train) => train.id === selectedId) ?? null;
  const selectedParked = parked.find((loco) => loco.id === selectedId) ?? null;

  const select = (id: string | null) => {
    onSelect?.(id);
    if (controlledSelectedId === undefined) setInternalSelectedId(id);
  };

  const mapSurface = (
    <div className="fi-offline-rail-map" data-offline-rail-map>
      <img src="/maps/evu-betriebskarte-de.svg" alt="Offline-Betriebskarte mit Güterverkehrskorridoren" className="fi-offline-rail-map__base" />
      <div className="fi-offline-rail-map__status" role="status">
        <CloudOff className="h-3.5 w-3.5 text-amber-300" aria-hidden />
        <span>Offline-Betriebskarte</span>
        <span className="fi-offline-rail-map__count">{trains.filter((train) => train.status === 'aktiv').length} aktiv</span>
      </div>

      <svg className="fi-offline-rail-map__routes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {trains.map((train) => {
          const from = toPoint(train.from.lat, train.from.lng);
          const current = toPoint(train.lat, train.lng);
          const to = toPoint(train.to.lat, train.to.lng);
          return (
            <g key={train.id}>
              <polyline points={`${from.x},${from.y} ${current.x},${current.y} ${to.x},${to.y}`} className={train.status === 'aktiv' ? 'is-live' : 'is-planned'} />
            </g>
          );
        })}
      </svg>

      {trains.map((train) => {
        const point = toPoint(train.lat, train.lng);
        const selected = selectedId === train.id;
        return (
          <button
            key={train.id}
            type="button"
            className={`fi-offline-rail-map__marker ${train.status === 'aktiv' ? 'is-live' : 'is-planned'}${selected ? ' is-selected' : ''}`}
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
            onClick={() => select(train.id)}
            aria-label={`${train.orderNumber}: ${train.title}, ${train.status === 'aktiv' ? 'aktiv' : 'geplant'}`}
          >
            <Train className="h-3.5 w-3.5" aria-hidden />
          </button>
        );
      })}

      {parked.map((loco) => {
        const point = toPoint(loco.lat, loco.lng);
        const selected = selectedId === loco.id;
        return (
          <button
            key={loco.id}
            type="button"
            className={`fi-offline-rail-map__marker is-parked${selected ? ' is-selected' : ''}`}
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
            onClick={() => select(loco.id)}
            aria-label={`${getLocoDisplayName(loco.loco.designation)}: abgestellt`}
          >
            <MapPin className="h-3.5 w-3.5" aria-hidden />
          </button>
        );
      })}

      {(selectedTrain || selectedParked) && (
        <section className="fi-offline-rail-map__selection" aria-label="Ausgewählte Ressource">
          <button type="button" onClick={() => select(null)} className="fi-offline-rail-map__close" aria-label="Auswahl schließen">
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
          {selectedTrain ? (
            <>
              <p className="fi-offline-rail-map__eyebrow">{selectedTrain.status === 'aktiv' ? 'Im Dienst' : 'Geplant'}</p>
              <h3>{selectedTrain.orderNumber} · {selectedTrain.title}</h3>
              <p>{selectedTrain.originLabel} → {selectedTrain.destLabel}</p>
              <p className="fi-offline-rail-map__detail">{selectedTrain.locoName} · {selectedTrain.wagonSummary}</p>
              {onOpenTrainDispatch && (
                <button type="button" className="btn-gold-sm fi-offline-rail-map__dispatch" onClick={() => onOpenTrainDispatch(selectedTrain.id)}>
                  Zugdisposition öffnen
                </button>
              )}
            </>
          ) : selectedParked ? (
            <>
              <p className="fi-offline-rail-map__eyebrow">Abgestellt</p>
              <h3>{getLocoDisplayName(selectedParked.loco.designation)}</h3>
              <p>{selectedParked.loco.name} · Standort {hqLocation || 'Duisburg'}</p>
            </>
          ) : null}
        </section>
      )}
    </div>
  );

  if (variant === 'fill') return <div className="h-full min-h-[420px]">{mapSurface}</div>;

  return (
    <div className="fi-card overflow-hidden">
      <div className="fi-card-header flex items-center justify-between">
        <span className="flex items-center gap-2"><CloudOff className="h-3.5 w-3.5 text-amber-300" /> Offline-Leitstelle</span>
        <span className="fi-tick text-[10px] font-bold">Lokaler Betrieb</span>
      </div>
      {mapSurface}
    </div>
  );
}
