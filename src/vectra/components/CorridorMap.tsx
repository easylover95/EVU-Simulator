import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { trainLatLngForRun } from '@/vectra/seed';
import { lookupStation, railRouteWaypoints, RAIL_STATIONS } from '@/lib/stations';
import { delayColor } from '@/vectra/simulation';
import type { Incident, TrainRun } from '@/vectra/types';

/** Layer 1: Dark GIS Base (Esri Dark Gray — kein API-Key). */
const DARK_BASE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
const DARK_BASE_ATTR = 'Tiles &copy; Esri — Esri, HERE, Garmin';

/** Layer 2: OpenRailwayMap-Gleise (subtil über Dark Base). */
const ORM_URL = 'https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png';
const ORM_ATTR =
  '<a href="https://www.openrailwaymap.org/">OpenRailwayMap</a> · <a href="https://www.openstreetmap.org/copyright">OSM</a>';

function trainIcon(color: string, label: string, selected: boolean): L.DivIcon {
  return L.divIcon({
    className: 'vr-train-marker',
    html: `<div class="vr-train-glyph${selected ? ' is-selected' : ''}" style="--vr-train-color:${color}">
      <span class="vr-train-label">${label}</span>
    </div>`,
    iconSize: [44, 28],
    iconAnchor: [22, 14],
  });
}

function markerColor(train: TrainRun): string {
  const tone = delayColor(train.delayMinutes, train.status);
  if (tone === 'green') return '#34d399';
  if (tone === 'yellow') return '#fbbf24';
  return '#fb7185';
}

function liveTrains(trains: TrainRun[]): TrainRun[] {
  return trains.filter((t) => t.status === 'unterwegs' || t.status === 'halt' || t.status === 'gestoert');
}

export function CorridorMap({
  trains,
  activeIncident,
  selectedTrainId,
  onSelectTrain,
  hqCity,
}: {
  trains: TrainRun[];
  activeIncident: Incident | null;
  selectedTrainId: string | null;
  onSelectTrain: (id: string) => void;
  hqCity?: string;
}) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const ormLayerRef = useRef<L.TileLayer | null>(null);
  const routeLayersRef = useRef<Map<string, { glow: L.Polyline; core: L.Polyline }>>(new Map());
  const stationLayersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const selectRef = useRef(onSelectTrain);
  const fittedRef = useRef(false);
  selectRef.current = onSelectTrain;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [51.16, 10.45],
      zoom: 6,
      minZoom: 5,
      maxZoom: 16,
      zoomControl: false,
      attributionControl: true,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    mapRef.current = map;

    // Layer 1 — Base GIS (Dark)
    baseLayerRef.current = L.tileLayer(DARK_BASE_URL, {
      attribution: DARK_BASE_ATTR,
      maxZoom: 16,
    }).addTo(map);

    // Layer 2 — Track Network (ORM, gedämpft)
    ormLayerRef.current = L.tileLayer(ORM_URL, {
      subdomains: 'abc',
      maxZoom: 19,
      opacity: 0.55,
      attribution: ORM_ATTR,
    }).addTo(map);

    const raf = window.requestAnimationFrame(() => map.invalidateSize());
    const t = window.setTimeout(() => map.invalidateSize(), 180);
    const el = shellRef.current ?? containerRef.current;
    const ro = new ResizeObserver(() => map.invalidateSize());
    if (el) ro.observe(el);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t);
      ro.disconnect();
      markersRef.current.clear();
      routeLayersRef.current.clear();
      stationLayersRef.current.clear();
      baseLayerRef.current = null;
      ormLayerRef.current = null;
      map.remove();
      mapRef.current = null;
      fittedRef.current = false;
    };
  }, []);

  // Layer 2+ — Neon-Trassen der aktiven Läufe
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const live = liveTrains(trains);
    const blockedId = activeIncident?.trainId ?? null;
    const seenRoutes = new Set<string>();
    const seenStations = new Set<string>();
    const bounds = L.latLngBounds([]);

    function upsertStationMarker(key: string, lat: number, lng: number, label: string, via: boolean) {
      let marker = stationLayersRef.current.get(key);
      if (!marker) {
        marker = L.circleMarker([lat, lng], {
          radius: via ? 3 : 5,
          color: via ? '#1e3a5f' : '#0f172a',
          weight: via ? 1 : 2,
          fillColor: via ? '#38bdf8' : '#64d2ff',
          fillOpacity: via ? 0.7 : 0.95,
        }).addTo(map);
        if (label) {
          marker.bindTooltip(label, {
            permanent: !via,
            direction: 'right',
            offset: [8, 0],
            className: 'vr-map-tooltip',
            opacity: 1,
          });
        }
        stationLayersRef.current.set(key, marker);
      } else {
        marker.setLatLng([lat, lng]);
      }
    }

    for (const train of live) {
      const waypoints = railRouteWaypoints(train.origin, train.destination);
      const path: L.LatLngExpression[] = waypoints.map((p) => [p.lat, p.lng]);
      for (const p of path) bounds.extend(p);
      seenRoutes.add(train.id);

      const hot = train.id === blockedId;
      const selected = selectedTrainId === train.id;
      const coreColor = hot ? '#fb7185' : selected ? '#f5b942' : '#38bdf8';
      const glowColor = hot ? '#fb7185' : '#0ea5e9';

      let layer = routeLayersRef.current.get(train.id);
      if (!layer) {
        const glow = L.polyline(path, {
          color: glowColor,
          weight: 11,
          opacity: 0.22,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(map);
        const core = L.polyline(path, {
          color: coreColor,
          weight: hot || selected ? 5 : 3.5,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
          dashArray: hot ? '8 6' : undefined,
        }).addTo(map);
        layer = { glow, core };
        routeLayersRef.current.set(train.id, layer);
      } else {
        layer.glow.setLatLngs(path);
        layer.core.setLatLngs(path);
        layer.glow.setStyle({ color: glowColor, weight: 11, opacity: 0.22 });
        layer.core.setStyle({
          color: coreColor,
          weight: hot || selected ? 5 : 3.5,
          opacity: 0.95,
          dashArray: hot ? '8 6' : undefined,
        });
      }

      waypoints.forEach((wp, i) => {
        const isEnd = i === 0 || i === waypoints.length - 1;
        const key = wp.key ?? `${train.id}-${i}-${wp.label}`;
        seenStations.add(key);
        upsertStationMarker(key, wp.lat, wp.lng, isEnd ? wp.label : wp.label, !isEnd);
      });
    }

    if (hqCity) {
      seenStations.add(hqCity);
      const hq = Object.values(RAIL_STATIONS).find((s) => s.label === hqCity) ?? lookupStation(hqCity);
      bounds.extend([hq.lat, hq.lng]);
      upsertStationMarker(hqCity, hq.lat, hq.lng, `Hub ${hqCity}`, false);
      stationLayersRef.current.get(hqCity)?.setStyle({
        color: '#f5b942',
        fillColor: '#f5b942',
        radius: 7,
      });
    }

    for (const [id, layer] of routeLayersRef.current) {
      if (!seenRoutes.has(id)) {
        layer.glow.remove();
        layer.core.remove();
        routeLayersRef.current.delete(id);
      }
    }
    for (const [name, marker] of stationLayersRef.current) {
      if (!seenStations.has(name)) {
        marker.remove();
        stationLayersRef.current.delete(name);
      }
    }

    if (bounds.isValid() && (!fittedRef.current || live.length > 0)) {
      map.fitBounds(bounds.pad(0.18), { animate: fittedRef.current });
      fittedRef.current = true;
    }
  }, [trains, activeIncident, selectedTrainId, hqCity]);

  // Layer 3 — Live Telemetrie (Zug-Tags)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const live = liveTrains(trains);
    const seen = new Set<string>();

    for (const train of live) {
      seen.add(train.id);
      const pos = trainLatLngForRun(train);
      const latlng: L.LatLngExpression = [pos.lat, pos.lng];
      const label = train.trainNumber.replace(/^(GZ|DGS)\s+/i, '');
      const color = markerColor(train);
      const selected = selectedTrainId === train.id;
      let marker = markersRef.current.get(train.id);

      const tip = `${train.trainNumber} · ${train.currentSpeedKmH || '—'} km/h · ${train.origin} → ${train.destination}`;

      if (!marker) {
        const id = train.id;
        marker = L.marker(latlng, {
          icon: trainIcon(color, label, selected),
          zIndexOffset: 900,
        })
          .bindTooltip(tip, {
            className: 'vr-map-tooltip',
            direction: 'top',
            offset: [0, -12],
          })
          .on('click', () => selectRef.current(id))
          .addTo(map);
        markersRef.current.set(train.id, marker);
      } else {
        marker.setLatLng(latlng);
        marker.setIcon(trainIcon(color, label, selected));
        marker.setTooltipContent(tip);
      }
    }

    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }
  }, [trains, selectedTrainId]);

  return (
    <div ref={shellRef} className="vr-map-shell">
      <div className="vr-map-layer-badge" aria-hidden>
        DARK GIS · LIVE TELEMETRY
      </div>
      <div ref={containerRef} className="vr-map" aria-label="Dark-GIS Vektorkarte aktive Zugläufe" />
    </div>
  );
}
