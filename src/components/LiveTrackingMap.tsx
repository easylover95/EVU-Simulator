import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CircleDot, ClipboardList, Gauge, Info, Layers3, RadioTower, Train, User, Wrench, X } from 'lucide-react';
import type { AssignmentWithDetails, Locomotive, Wagon } from '@/lib/supabase';
import { RAIL_STATIONS, lookupStation, TRUNK_CORRIDORS } from '@/lib/stations';
import { buildTrackedTrains, locoMarkerId, type TrackedTrain } from '@/lib/tracking';
import { getAssignmentPillClass, getLocoPillClass, getLocoStatusConfig } from '@/lib/status';
import { getLocoDisplayName } from '@/lib/locoPhotos';

type MapStyle = 'voyager' | 'satellite' | 'dark' | 'osm';

type BaseLayerPreset = {
  url: string;
  attribution: string;
  className?: string;
};

const BASE_LAYER_PRESETS: Record<MapStyle, BaseLayerPreset> = {
  voyager: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO Voyager',
    className: 'fi-map-base-voyager',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics',
    className: 'fi-map-base-satellite',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO Dark Matter',
    className: 'fi-map-base-dark',
  },
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap-Mitwirkende',
    className: 'fi-map-base-osm',
  },
};

const MAP_STYLE_OPTIONS: Array<{ id: MapStyle; label: string; description: string }> = [
  { id: 'voyager', label: 'Standard', description: 'Topografie & Grenzen' },
  { id: 'satellite', label: 'Satellit', description: 'Luftbild mit EVU-Korridoren' },
  { id: 'dark', label: 'Dunkel', description: 'Nacht-Leitstelle' },
  { id: 'osm', label: 'OpenStreetMap', description: 'Freie Basiskarte' },
];

interface LiveTrackingMapProps {
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
}

function trainIcon(kind: 'live' | 'planned' | 'parked' | 'maint', selected: boolean): L.DivIcon {
  const cls =
    kind === 'live'
      ? 'is-live'
      : kind === 'maint'
        ? 'is-maint'
        : kind === 'parked'
          ? 'is-parked'
          : 'is-planned';
  return L.divIcon({
    className: 'fi-train-marker',
    html: `<div class="fi-train-glyph ${cls}${selected ? ' is-selected' : ''}">
      <span class="fi-train-beacon"></span>
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2">
        <rect x="4" y="5" width="16" height="11" rx="2"/>
        <circle cx="8" cy="18" r="1.6"/>
        <circle cx="16" cy="18" r="1.6"/>
        <path d="M8 9h8"/>
      </svg>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function trackedRouteStyle(status: 'aktiv' | 'geplant', selected: boolean) {
  const live = status === 'aktiv';
  const color = live ? '#f59e0b' : '#38bdf8';
  return {
    glow: { color, weight: live ? 12 : 8, opacity: live ? 0.26 : 0.16, lineCap: 'round' as const, lineJoin: 'round' as const },
    core: {
      color: selected ? '#fde68a' : color,
      weight: live ? 3.4 : 2.2,
      opacity: live ? 0.96 : 0.78,
      dashArray: live ? undefined : '5 7',
      lineCap: 'round' as const,
      lineJoin: 'round' as const,
    },
  };
}

interface ParkedLoco {
  id: string;
  loco: Locomotive;
  lat: number;
  lng: number;
}

export function LiveTrackingMap({
  assignments,
  wagons,
  tick,
  locomotives = [],
  hqLocation,
  selectedId: controlledSelectedId,
  onSelect,
  onOpenTrainDispatch,
  fitRequest = 0,
  refreshRequest = 0,
  variant = 'card',
}: LiveTrackingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const linesRef = useRef<Map<string, L.LayerGroup>>(new Map());
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const tracksRef = useRef<TrackedTrain[]>([]);
  const parkedRef = useRef<ParkedLoco[]>([]);
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const [mapStyle, setMapStyle] = useState<MapStyle>('osm');
  const [stylePickerOpen, setStylePickerOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);

  const selectedId = controlledSelectedId !== undefined ? controlledSelectedId : internalSelected;

  function select(id: string | null) {
    onSelect?.(id);
    if (controlledSelectedId === undefined) setInternalSelected(id);
  }
  const selectRef = useRef(select);
  selectRef.current = select;

  const trains = useMemo(() => buildTrackedTrains(assignments, tick, wagons), [assignments, tick, wagons]);
  tracksRef.current = trains;

  const assignedLocoIds = useMemo(() => {
    const ids = new Set<string>();
    for (const a of assignments) {
      if (a.status === 'geplant' || a.status === 'aktiv') ids.add(a.locomotive_id);
    }
    return ids;
  }, [assignments]);

  const parked = useMemo((): ParkedLoco[] => {
    const base = lookupStation(hqLocation || 'Duisburg');
    const idle = locomotives.filter((l) => !assignedLocoIds.has(l.id));
    return idle.map((loco, index) => {
      const angle = (index / Math.max(1, idle.length)) * Math.PI * 2;
      return {
        id: locoMarkerId(loco.id),
        loco,
        lat: base.lat + Math.cos(angle) * 0.06,
        lng: base.lng + Math.sin(angle) * 0.09,
      };
    });
  }, [locomotives, assignedLocoIds, hqLocation]);
  parkedRef.current = parked;

  const selectedTrain = trains.find((t) => t.id === selectedId) ?? null;
  const selectedParked = parked.find((p) => p.id === selectedId) ?? null;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [51.16, 10.45],
      zoom: 6,
      minZoom: 5,
      maxZoom: 12,
      zoomControl: false,
      attributionControl: true,
    });

    // Keep native Leaflet zoom controls away from the compact map header on all viewports.
    L.control.zoom({ position: 'bottomleft' }).addTo(map);

    const corridorPane = map.createPane('fi-corridors');
    corridorPane.style.zIndex = '330';
    for (const [fromKey, toKey] of TRUNK_CORRIDORS) {
      const from = RAIL_STATIONS[fromKey];
      const to = RAIL_STATIONS[toKey];
      const corridor: L.LatLngExpression[] = [[from.lat, from.lng], [to.lat, to.lng]];
      L.polyline(corridor, { pane: 'fi-corridors', color: '#062a4a', weight: 10, opacity: 0.72, lineCap: 'round' }).addTo(map);
      L.polyline(corridor, { pane: 'fi-corridors', color: '#00b7ff', weight: 3, opacity: 0.96, lineCap: 'round' }).addTo(map);
    }

    for (const station of Object.values(RAIL_STATIONS)) {
      L.circleMarker([station.lat, station.lng], {
        radius: 10,
        color: '#0284c7',
        fillColor: '#38bdf8',
        fillOpacity: 0.2,
        opacity: 0.88,
        weight: 2,
      }).addTo(map);
      L.circleMarker([station.lat, station.lng], {
        radius: 5,
        color: '#e0f2fe',
        fillColor: '#075985',
        fillOpacity: 1,
        opacity: 1,
        weight: 2.2,
      })
        .bindTooltip(station.label, {
          className: 'fi-map-tooltip fi-station-tooltip',
          direction: 'right',
          offset: [8, 0],
          permanent: true,
          opacity: 1,
        })
        .addTo(map);
    }

    mapRef.current = map;
    const markerLayers = markersRef.current;
    const lineLayers = linesRef.current;
    const raf = window.requestAnimationFrame(() => map.invalidateSize());
    const t = window.setTimeout(() => map.invalidateSize(), 200);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t);
      markerLayers.clear();
      lineLayers.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    baseLayerRef.current?.remove();
    baseLayerRef.current = null;

    const preset = BASE_LAYER_PRESETS[mapStyle];
    const options: L.TileLayerOptions = {
      attribution: preset.attribution,
      maxZoom: 19,
      className: preset.className,
    };
    if (preset.url.includes('{s}')) options.subdomains = 'abcd';
    const baseLayer = L.tileLayer(preset.url, options).addTo(map);
    baseLayerRef.current = baseLayer;

    return () => {
      if (baseLayerRef.current === baseLayer) baseLayerRef.current = null;
      baseLayer.remove();
    };
  }, [mapStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set<string>();
    for (const train of trains) {
      seen.add(train.id);
      const latlng: L.LatLngExpression = [train.lat, train.lng];
      const kind = train.status === 'aktiv' ? 'live' : 'planned';
      let marker = markersRef.current.get(train.id);
      if (!marker) {
        const id = train.id;
        marker = L.marker(latlng, {
          icon: trainIcon(kind, selectedId === id),
          zIndexOffset: 800,
        })
          .bindTooltip(`${train.orderNumber} – ${train.title}`, {
            className: 'fi-map-tooltip',
            direction: 'top',
            offset: [0, -14],
          })
          .on('click', () => {
            const found = tracksRef.current.find((t) => t.id === id);
            selectRef.current(found?.id ?? id);
          })
          .addTo(map);
        markersRef.current.set(train.id, marker);
      } else {
        marker.setLatLng(latlng);
        marker.setIcon(trainIcon(kind, selectedId === train.id));
      }

      const route: L.LatLngExpression[] = [
        [train.from.lat, train.from.lng],
        [train.lat, train.lng],
        [train.to.lat, train.to.lng],
      ];
      const style = trackedRouteStyle(train.status === 'aktiv' ? 'aktiv' : 'geplant', selectedId === train.id);
      let line = linesRef.current.get(train.id);
      if (!line) {
        line = L.layerGroup([
          L.polyline(route, style.glow),
          L.polyline(route, style.core),
        ]).addTo(map);
        linesRef.current.set(train.id, line);
      } else {
        const layers = line.getLayers().filter((layer): layer is L.Polyline => layer instanceof L.Polyline);
        layers[0]?.setLatLngs(route).setStyle(style.glow);
        layers[1]?.setLatLngs(route).setStyle(style.core);
      }
    }

    for (const parkedLoco of parked) {
      seen.add(parkedLoco.id);
      const latlng: L.LatLngExpression = [parkedLoco.lat, parkedLoco.lng];
      const kind =
        parkedLoco.loco.status === 'wartung' ||
        parkedLoco.loco.status === 'v1' ||
        parkedLoco.loco.status === 'stillgelegt'
          ? 'maint'
          : 'parked';
      let marker = markersRef.current.get(parkedLoco.id);
      if (!marker) {
        const id = parkedLoco.id;
        marker = L.marker(latlng, {
          icon: trainIcon(kind, selectedId === id),
          zIndexOffset: 600,
        })
          .bindTooltip(`${getLocoDisplayName(parkedLoco.loco.designation)} · ${parkedLoco.loco.name}`, {
            className: 'fi-map-tooltip',
            direction: 'top',
            offset: [0, -14],
          })
          .on('click', () => {
            const found = parkedRef.current.find((p) => p.id === id);
            selectRef.current(found?.id ?? id);
          })
          .addTo(map);
        markersRef.current.set(parkedLoco.id, marker);
      } else {
        marker.setLatLng(latlng);
        marker.setIcon(trainIcon(kind, selectedId === parkedLoco.id));
      }
    }

    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
        linesRef.current.get(id)?.remove();
        linesRef.current.delete(id);
      }
    }
  }, [trains, parked, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const exists = trains.some((t) => t.id === selectedId) || parked.some((p) => p.id === selectedId);
    if (!exists) selectRef.current(null);
  }, [selectedId, trains, parked]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const marker = markersRef.current.get(selectedId);
    if (!marker) return;
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 8), { animate: true });
  }, [selectedId]);

  useEffect(() => {
    if (!fitRequest) return;
    const map = mapRef.current;
    if (!map) return;
    const pts: L.LatLngExpression[] = [];
    for (const marker of markersRef.current.values()) pts.push(marker.getLatLng());
    if (pts.length === 0) {
      for (const station of Object.values(RAIL_STATIONS)) pts.push([station.lat, station.lng]);
    }
    if (pts.length === 0) return;
    map.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 8, animate: true });
  }, [fitRequest]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t = window.setTimeout(() => map.invalidateSize(), 40);
    return () => window.clearTimeout(t);
  }, [refreshRequest, variant]);

  const mapBlock = (
    <div className="relative h-full min-h-[360px] w-full">
      <div ref={containerRef} data-map-style={mapStyle} className={`${variant === 'fill' ? 'h-full min-h-[420px]' : 'h-[440px]'} fi-live-map w-full`} />
      <div data-map-status className="pointer-events-none absolute left-3 top-3 z-[500] flex items-center gap-2 rounded-md border border-sky-400/25 bg-slate-950/80 px-2.5 py-1.5 shadow-[0_0_20px_rgba(14,165,233,0.16)] backdrop-blur-sm">
        <RadioTower className="h-3.5 w-3.5 text-sky-300" />
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-sky-100">Live-Leitstelle</span>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
        <span className="text-[10px] font-semibold tabular-nums text-slate-300">{trains.filter((train) => train.status === 'aktiv').length} aktiv</span>
      </div>
      <div className="absolute left-3 top-14 z-[500] pointer-events-auto">
        <button
          type="button"
          title="Kartenlegende öffnen"
          aria-label="Kartenlegende öffnen"
          aria-expanded={legendOpen}
          data-map-legend-trigger
          onClick={() => setLegendOpen((open) => !open)}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-orange-300/35 bg-slate-950/90 text-orange-100 shadow-[0_0_16px_rgba(249,115,22,0.16)] backdrop-blur-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
        >
          <Info className="h-4 w-4 text-orange-300" />
          <span className="sr-only">Legende</span>
        </button>
      </div>
      {legendOpen && (
        <>
          <div className="absolute left-3 top-14 z-[700] hidden max-h-[300px] w-72 overflow-y-auto overscroll-contain rounded-lg border border-orange-300/30 bg-slate-950/95 p-3 text-slate-200 shadow-[0_14px_34px_rgba(2,6,23,0.72)] backdrop-blur-sm md:block">
            <MapLegendContent onClose={() => setLegendOpen(false)} />
          </div>
          {createPortal(
            <div className="md:hidden">
              <button
                type="button"
                aria-label="Kartenlegende schließen"
                className="fixed inset-0 z-[650] bg-slate-950/35"
                onClick={() => setLegendOpen(false)}
              />
              <div
                role="dialog"
                aria-label="Karten- und Live-Tracking-Legende"
                data-map-legend-panel
                className="fixed inset-x-3 bottom-[calc(8rem+env(safe-area-inset-bottom))] z-[700] max-h-[calc(100dvh-10rem)] overflow-y-auto overscroll-contain rounded-lg border border-orange-300/30 bg-slate-950/95 p-3 text-slate-200 shadow-[0_14px_34px_rgba(2,6,23,0.72)] backdrop-blur-sm"
              >
                <MapLegendContent onClose={() => setLegendOpen(false)} />
              </div>
            </div>,
            document.body,
          )}
        </>
      )}
      <div className="absolute right-3 top-3 z-[500] pointer-events-auto">
        <button
          type="button"
          title="Kartendarstellung wählen"
          aria-label="Kartendarstellung wählen"
          aria-expanded={stylePickerOpen}
          data-map-style-trigger
          onClick={() => setStylePickerOpen((open) => !open)}
          className="flex min-h-9 items-center gap-1.5 rounded-md border border-sky-400/35 bg-slate-950/88 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-sky-100 shadow-[0_0_18px_rgba(14,165,233,0.18)] backdrop-blur-sm"
        >
          <Layers3 className="h-3.5 w-3.5 text-sky-300" />
          <span className="hidden sm:inline">Karte</span>
        </button>
        {stylePickerOpen && (
          <div className="mt-1.5 w-48 overflow-hidden rounded-md border border-sky-400/30 bg-slate-950/95 p-1 shadow-[0_10px_30px_rgba(2,6,23,0.55)] backdrop-blur-sm">
            <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">Kartendarstellung</div>
            {MAP_STYLE_OPTIONS.map((option) => {
              const active = mapStyle === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  data-map-style-option={option.id}
                  onClick={() => {
                    setMapStyle(option.id);
                    setStylePickerOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded px-2 py-2 text-left ${active ? 'bg-sky-400/18 text-sky-100' : 'text-slate-300 hover:bg-slate-800/80'}`}
                >
                  <span className="text-[11px] font-bold">{option.label}</span>
                  <span className="text-right text-[9px] text-slate-500">{option.description}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute right-14 top-3 z-[500] hidden items-center gap-1.5 rounded-md border border-slate-500/20 bg-slate-950/72 px-2 py-1.5 text-[10px] text-slate-300 shadow-lg backdrop-blur-sm md:flex">
        <CircleDot className="h-3 w-3 text-sky-300" /> Knoten · Live-Loks · Fahrkorridore
      </div>
      {selectedTrain && (
        <div className="absolute bottom-3 left-3 right-3 z-[500] mx-auto max-w-lg sm:left-auto sm:right-3 sm:w-80">
          <TrainOpsCard
            train={selectedTrain}
            onClose={() => select(null)}
            onOpenDispatch={onOpenTrainDispatch ? () => onOpenTrainDispatch(selectedTrain.id) : undefined}
          />
        </div>
      )}
      {selectedParked && (
        <div className="absolute bottom-3 left-3 right-3 z-[500] mx-auto max-w-lg sm:left-auto sm:right-3 sm:w-80">
          <ParkedLocoCard parked={selectedParked} hqLocation={hqLocation} onClose={() => select(null)} />
        </div>
      )}
    </div>
  );

  if (variant === 'fill') {
    return <div className="h-full min-h-[420px] overflow-hidden">{mapBlock}</div>;
  }

  return (
    <div className="fi-card overflow-hidden">
      <div className="fi-card-header flex items-center justify-between">
        <span className="flex items-center gap-2">
          <Train className="h-3.5 w-3.5 text-sky-400" />
          LIVE Tracking — Europäische Bahnkarte
        </span>
        <span className="fi-tick text-[10px] font-bold tabular-nums">{trains.length} Züge unterwegs</span>
      </div>
      {mapBlock}
    </div>
  );
}

function MapLegendContent({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange-200">Karten- & Tracking-Legende</span>
        <button
          type="button"
          title="Legende schließen"
          aria-label="Legende schließen"
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-2">
        <LegendRow label="EVU-Fahrkorridor" detail="Hellblau: geplante oder aktive Spielroute">
          <span className="block h-1.5 w-8 rounded-full bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.9)]" />
        </LegendRow>
        <LegendRow label="Aktive Lok" detail="Goldener Marker: Fortschritt laut Spieltick">
          <span className="relative block h-3 w-8"><span className="absolute left-3 top-0 h-3 w-3 rounded-sm border border-amber-100 bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]" /></span>
        </LegendRow>
        <LegendRow label="Bahnknoten" detail="Blauer Doppelmarker: Station im Spielnetz">
          <span className="relative block h-4 w-8"><span className="absolute left-3 top-0.5 h-3 w-3 rounded-full border-2 border-sky-100 bg-sky-800" /><span className="absolute left-[13px] top-[5px] h-1.5 w-1.5 rounded-full bg-sky-300" /></span>
        </LegendRow>
        <LegendRow label="Grundkarte" detail="Freie, schlüssellose Basiskarte; weitere Stile oben rechts">
          <span className="block h-3 w-8 rounded-sm border border-emerald-200/70 bg-[linear-gradient(135deg,#d7efe2_0%,#b4cfe1_48%,#d9e4b4_100%)]" />
        </LegendRow>
      </div>
    </>
  );
}

function LegendRow({ label, detail, children }: { label: string; detail: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[2.25rem_1fr] items-center gap-1.5">
      <span className="flex h-4 items-center justify-center">{children}</span>
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold leading-tight text-slate-100">{label}</span>
        <span className="hidden text-[8px] leading-tight text-slate-500 md:block">{detail}</span>
      </span>
    </div>
  );
}

function TrainOpsCard({
  train,
  onClose,
  onOpenDispatch,
}: {
  train: TrackedTrain;
  onClose: () => void;
  onOpenDispatch?: () => void;
}) {
  const brhOk = train.availableBrh >= train.requiredBrh;
  return (
    <div className="fi-card border border-sky-500/40 shadow-[0_0_24px_rgba(56,189,248,0.25)]">
      <div className="fi-card-header flex items-center justify-between">
        <span className="truncate text-[11px] normal-case tracking-normal text-white">
          {train.orderNumber} – {train.title}
        </span>
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-white" title="Schließen">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-2 p-3 text-[11px]">
        <div className="flex items-center justify-between gap-2">
          <span className={getAssignmentPillClass(train.status)}>{train.status === 'aktiv' ? 'Im Dienst' : 'Geplant'}</span>
          <span className="text-slate-500">
            {train.originLabel} → {train.destLabel}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-200">
          <Train className="h-3 w-3 text-amber-400" />
          {train.locoName} + {train.wagonSummary}
        </div>
        <div className="flex items-center gap-1.5 text-slate-200">
          <User className="h-3 w-3 text-sky-400" />
          {train.driverName}
        </div>
        <div className="app-glass-panel grid grid-cols-3 gap-2 rounded-sm border border-slate-600/40 p-2">
          <OpsStat label="Masse" value={`${train.totalMassT.toLocaleString('de-DE')} t`} />
          <OpsStat
            label="Brh"
            value={`${train.availableBrh}/${train.requiredBrh}`}
            tone={brhOk ? 'ok' : 'bad'}
          />
          <OpsStat
            label="v"
            value={
              <span className="inline-flex items-center gap-0.5">
                <Gauge className="h-3 w-3" />
                {train.currentSpeed} km/h
              </span>
            }
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase text-slate-500">
            <span>Fortschritt {Math.round(train.progress)}%</span>
            <span className="fi-tick normal-case tracking-normal">ETA {train.etaTicks} Ticks</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)] transition-all duration-500"
              style={{ width: `${Math.max(2, Math.min(100, train.progress))}%` }}
            />
          </div>
        </div>
        {onOpenDispatch && (
          <button
            type="button"
            data-open-train-dispatch={train.id}
            onClick={onOpenDispatch}
            className="btn-gold-sm w-full justify-center"
          >
            <ClipboardList className="h-3 w-3" />
            Zugdisposition öffnen
          </button>
        )}
      </div>
    </div>
  );
}

function ParkedLocoCard({
  parked,
  hqLocation,
  onClose,
}: {
  parked: ParkedLoco;
  hqLocation?: string;
  onClose: () => void;
}) {
  const cfg = getLocoStatusConfig(parked.loco.status);
  return (
    <div className="fi-card border border-amber-500/30 shadow-[0_0_24px_rgba(251,191,36,0.15)]">
      <div className="fi-card-header flex items-center justify-between">
        <span className="truncate text-[11px] normal-case tracking-normal text-white">
          {getLocoDisplayName(parked.loco.designation)}
        </span>
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-white" title="Schließen">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-2 p-3 text-[11px]">
        <div className="flex items-center justify-between">
          <span className={getLocoPillClass(parked.loco.status)}>{cfg.label}</span>
          <span className="font-mono text-slate-400">{parked.loco.name}</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-300">
          {parked.loco.status === 'wartung' || parked.loco.status === 'v1' || parked.loco.status === 'stillgelegt' ? (
            <Wrench className="h-3 w-3 text-rose-400" />
          ) : (
            <Train className="h-3 w-3 text-amber-400" />
          )}
          Standort {hqLocation || 'Duisburg'}
        </div>
      </div>
    </div>
  );
}

function OpsStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: 'ok' | 'bad';
}) {
  const color = tone === 'ok' ? 'text-emerald-300' : tone === 'bad' ? 'text-rose-300' : 'text-white';
  return (
    <div>
      <div className="text-[9px] font-bold uppercase text-slate-500">{label}</div>
      <div className={`font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
