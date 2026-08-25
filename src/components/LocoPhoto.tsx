import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Boxes, Fuel, Train, Zap } from 'lucide-react';
import {
  getLocoDisplayName,
  getLocoPhotoUrls,
  getWagonPhotoUrls,
  inferDriveKind,
  locoGlassTone,
} from '@/lib/locoPhotos';

export const PHOTO_CARD_IMG_CLASS = 'w-full h-40 object-cover rounded-t-xl border-b border-amber-500/20';

interface LocoPhotoProps {
  designation: string;
  catalogId?: string;
  kind?: 'loco' | 'wagon';
  alt?: string;
  className?: string;
}

export function LocoPhoto({ designation, catalogId, kind = 'loco', alt, className }: LocoPhotoProps) {
  const urls = useMemo(
    () => (kind === 'wagon' ? getWagonPhotoUrls(designation, catalogId) : getLocoPhotoUrls(designation, catalogId)),
    [catalogId, designation, kind],
  );
  const [index, setIndex] = useState(0);
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    setIndex(0);
    setExhausted(false);
  }, [catalogId, designation, kind]);

  if (exhausted || index >= urls.length) {
    const tone = locoGlassTone(designation);
    const label = kind === 'wagon' ? designation : getLocoDisplayName(designation);
    const drive = kind === 'loco' ? inferDriveKind(designation) : null;
    return (
      <div
        className={`relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-br ${tone.from} ${tone.to} ${className ?? ''}`}
        role="img"
        aria-label={alt ?? label}
      >
        <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-md" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(251,191,36,0.12),transparent_55%)]" />
        <div className="relative flex flex-col items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-6 py-4 shadow-inner backdrop-blur-md">
          <div className="flex items-center gap-2">
            {kind === 'wagon' ? (
              <Boxes className={`h-7 w-7 ${tone.accent}`} />
            ) : (
              <>
                <Train className={`h-7 w-7 ${tone.accent}`} />
                {drive === 'elektrik' && <Zap className="h-5 w-5 text-sky-300" />}
                {drive === 'diesel' && <Fuel className="h-5 w-5 text-amber-300" />}
                {drive === 'dual' && (
                  <>
                    <Zap className="h-5 w-5 text-sky-300" />
                    <Fuel className="h-5 w-5 text-amber-300" />
                  </>
                )}
              </>
            )}
          </div>
          <div className={`max-w-[12rem] text-center text-[11px] font-bold leading-tight ${tone.accent}`}>{label}</div>
        </div>
      </div>
    );
  }

  return (
    <img
      key={`${kind}-${catalogId ?? designation}-${index}`}
      src={urls[index]}
      alt={alt ?? designation}
      className={className ?? 'h-full w-full object-cover'}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        if (index + 1 < urls.length) {
          setIndex((i) => i + 1);
        } else {
          setExhausted(true);
        }
      }}
    />
  );
}

export function PhotoCardHeader({
  designation,
  catalogId,
  kind = 'loco',
  alt,
  children,
}: {
  designation: string;
  catalogId?: string;
  kind?: 'loco' | 'wagon';
  alt?: string;
  children?: ReactNode;
}) {
  return (
    <div className="relative">
      <LocoPhoto
        designation={designation}
        catalogId={catalogId}
        kind={kind}
        alt={alt}
        className={PHOTO_CARD_IMG_CLASS}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900 to-transparent px-3 pb-2 pt-12">
        {children}
      </div>
    </div>
  );
}
