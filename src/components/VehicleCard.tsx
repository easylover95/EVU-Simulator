import { memo, type ReactNode } from 'react';
import { PhotoCardHeader } from '@/components/LocoPhoto';

export const vehicleCardClass =
  'app-glass overflow-hidden rounded-xl border-amber-500/30 shadow-xl';

export const vehicleCardBodyClass = 'p-5';

export function VehiclePriceBox({
  label,
  value,
  listValue,
}: {
  label: string;
  value: string;
  listValue?: string;
}) {
  return (
    <div className="app-glass-panel rounded-lg border border-amber-500/20 py-1.5 text-center">
      <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="flex flex-wrap items-baseline justify-center gap-1.5 font-bold tabular-nums">
        {listValue && (
          <span className="text-[10px] font-semibold text-slate-500 line-through decoration-slate-500">
            {listValue}
          </span>
        )}
        <span className="text-amber-300">{value}</span>
      </div>
    </div>
  );
}

export const VehicleCard = memo(function VehicleCard({
  designation,
  catalogId,
  kind = 'loco',
  alt,
  overlay,
  badges,
  children,
  className = '',
  photoClassName = '',
}: {
  designation: string;
  catalogId?: string;
  kind?: 'loco' | 'wagon';
  alt?: string;
  overlay?: ReactNode;
  badges?: ReactNode;
  children: ReactNode;
  className?: string;
  photoClassName?: string;
}) {
  return (
    <article className={`${vehicleCardClass} ${className}`}>
      <div className={`relative ${photoClassName}`}>
        <PhotoCardHeader designation={designation} catalogId={catalogId} kind={kind} alt={alt}>
          {overlay}
        </PhotoCardHeader>
        {badges && <div className="absolute left-2 top-2 z-10 flex flex-wrap gap-1">{badges}</div>}
      </div>
      <div className={vehicleCardBodyClass}>{children}</div>
    </article>
  );
});
