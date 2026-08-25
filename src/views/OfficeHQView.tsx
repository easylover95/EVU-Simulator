import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Clock, FolderClosed, Map, Monitor, NotebookPen, Radio, Train, Trophy } from 'lucide-react';
import type { AchievementCategory } from '@/lib/achievements';

export type OfficeDestination =
  | 'fuhrpark'
  | 'dashboard'
  | 'disposition'
  | 'personal'
  | 'auftragsmarkt'
  | 'posteingang'
  | 'bank';

interface OfficeHQViewProps {
  onNavigate: (view: OfficeDestination) => void;
  onEditCompany: () => void;
  onOpenGallery?: () => void;
  galleryUnlocked?: number;
  galleryTotal?: number;
  galleryCategoryUnlocked?: Partial<Record<AchievementCategory, boolean>>;
}

/** Native size of `public/assets/leitstelle_bg.png` (cover-mapping). */
const BG_W = 6144;
const BG_H = 4096;

type HotspotShape = 'rect' | 'arch' | 'round';

interface OfficeHotspot {
  id: string;
  label: string;
  dest: OfficeDestination | 'gallery';
  /** Percent of the source image, not the viewport. */
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  shape: HotspotShape;
  Icon: typeof Monitor;
}

const HOTSPOTS: OfficeHotspot[] = [
  {
    id: 'gallery',
    label: 'Erfolge & Meilensteine',
    dest: 'gallery',
    // Source % of leitstelle_bg.png. 16:9 cover → visible ~14.2 / 16.4 / 11.0 × 9.8
    // (upper-right steam-loco frame, left of window; not ceiling 5.4, not lower row 21.4).
    x: 14.2,
    y: 21.6,
    w: 11.0,
    h: 8.3,
    z: 3,
    shape: 'rect',
    Icon: Trophy,
  },
  {
    id: 'window',
    label: 'Fuhrpark & Händler',
    dest: 'fuhrpark',
    x: 33.2,
    y: 6.8,
    w: 41.4,
    h: 40.6,
    z: 1,
    shape: 'arch',
    Icon: Train,
  },
  {
    id: 'map',
    label: 'Karte',
    dest: 'disposition',
    x: 76.2,
    y: 6.4,
    w: 21.8,
    h: 44.2,
    z: 2,
    shape: 'rect',
    Icon: Map,
  },
  {
    id: 'folders',
    label: 'Firma',
    dest: 'personal',
    x: 77.8,
    y: 53.8,
    w: 11.6,
    h: 18.4,
    z: 3,
    shape: 'rect',
    Icon: FolderClosed,
  },
  {
    id: 'monitors',
    label: 'PC öffnen',
    dest: 'dashboard',
    x: 3.4,
    y: 46.8,
    w: 29.6,
    h: 22.4,
    z: 4,
    shape: 'rect',
    Icon: Monitor,
  },
  {
    id: 'radio',
    label: 'Nachrichten',
    dest: 'posteingang',
    x: 43.6,
    y: 58.8,
    w: 20.2,
    h: 13.6,
    z: 5,
    shape: 'rect',
    Icon: Radio,
  },
  {
    id: 'clock',
    label: 'Finanzen',
    dest: 'bank',
    x: 65.8,
    y: 65.4,
    w: 6.4,
    h: 10.2,
    z: 5,
    shape: 'round',
    Icon: Clock,
  },
  {
    id: 'notebook',
    label: 'Notizbuch',
    dest: 'auftragsmarkt',
    x: 31.5,
    y: 73.2,
    w: 30.5,
    h: 16.4,
    z: 5,
    shape: 'rect',
    Icon: NotebookPen,
  },
];

function coverHotspotStyle(
  boxW: number,
  boxH: number,
  hs: Pick<OfficeHotspot, 'x' | 'y' | 'w' | 'h' | 'z'>,
): CSSProperties {
  if (boxW < 1 || boxH < 1) return { display: 'none' };
  const scale = Math.max(boxW / BG_W, boxH / BG_H);
  const dw = BG_W * scale;
  const dh = BG_H * scale;
  const ox = (boxW - dw) / 2;
  const oy = (boxH - dh) / 2;
  return {
    left: ox + (hs.x / 100) * dw,
    top: oy + (hs.y / 100) * dh,
    width: (hs.w / 100) * dw,
    height: (hs.h / 100) * dh,
    zIndex: hs.z,
  };
}

export function OfficeHQView({
  onNavigate,
  onOpenGallery,
  galleryUnlocked = 0,
  galleryTotal = 0,
}: OfficeHQViewProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <div ref={sceneRef} className="office-scene" data-tutorial="tutorial-office-intro">
      {HOTSPOTS.map((hs) => (
        <button
          key={hs.id}
          type="button"
          data-tutorial={
            hs.id === 'monitors'
              ? 'tutorial-office-monitors'
              : hs.id === 'window'
                ? 'tutorial-office-window'
                : hs.id === 'map'
                  ? 'tutorial-office-map'
                  : hs.id === 'gallery'
                    ? 'tutorial-office-gallery'
                    : undefined
          }
          className={`office-hotspot office-hotspot--${hs.shape}${hs.id === 'gallery' ? ' office-hotspot--gallery' : ''}`}
          style={coverHotspotStyle(box.w, box.h, hs)}
          onClick={() => {
            if (hs.dest === 'gallery') onOpenGallery?.();
            else onNavigate(hs.dest);
          }}
          aria-label={
            hs.id === 'gallery' && galleryTotal > 0
              ? `${hs.label} (${galleryUnlocked} von ${galleryTotal})`
              : hs.label
          }
        >
          <span className="office-hotspot-chip">
            <hs.Icon className="office-hotspot-icon" aria-hidden />
            {hs.id === 'gallery' ? `Erfolge ${galleryUnlocked}/${galleryTotal}` : hs.label}
          </span>
        </button>
      ))}
    </div>
  );
}
