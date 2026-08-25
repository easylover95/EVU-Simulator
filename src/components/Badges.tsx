interface StatusBadgeProps {
  label: string;
  color: string;
  text: string;
  dot?: string;
  border?: string;
  pulse?: boolean;
}

export function StatusBadge({
  label,
  color,
  text,
  dot,
  pulse = false,
}: StatusBadgeProps) {
  const pill =
    color.includes('emerald') || text.includes('emerald')
      ? 'fi-pill-green'
      : color.includes('sky') || text.includes('sky')
        ? 'fi-pill-blue'
        : color.includes('amber') || color.includes('orange') || text.includes('amber')
          ? 'fi-pill-orange'
          : color.includes('rose') || text.includes('rose')
            ? 'fi-pill-red'
            : 'fi-pill-green';
  return (
    <span className={`fi-pill ${pill}`}>
      {dot && (
        <span className={`h-1.5 w-1.5 rounded-full ${dot} ${pulse ? 'animate-pulse' : ''}`} />
      )}
      {label}
    </span>
  );
}

interface FuelBarProps {
  level: number;
  label?: string;
}

export function FuelBar({ level, label = 'Kraftstoff' }: FuelBarProps) {
  const color =
    level < 20 ? 'bg-rose-500' : level < 50 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-medium text-slate-300">{level}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${level}%` }}
        />
      </div>
    </div>
  );
}

interface ProgressBarProps {
  value: number;
  label: string;
  tone: 'fuel' | 'brake' | 'frist';
}

export function ProgressBar({ value, label, tone }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const color =
    tone === 'fuel'
      ? pct < 20
        ? 'bg-rose-500'
        : pct < 50
          ? 'bg-amber-500'
          : 'bg-emerald-500'
      : tone === 'brake'
        ? pct >= 90
          ? 'bg-emerald-500'
          : pct >= 75
            ? 'bg-amber-500'
            : 'bg-rose-500'
        : pct < 25
          ? 'bg-rose-500'
          : pct < 55
            ? 'bg-amber-500'
            : 'bg-emerald-500';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="font-bold uppercase tracking-wide text-slate-500">{label}</span>
        <span className="font-medium text-slate-300">{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

interface BrakeBarProps {
  pct: number;
}

export function BrakeBar({ pct }: BrakeBarProps) {
  const color = pct >= 90 ? 'bg-emerald-500' : pct >= 75 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">Bremsleistung</span>
        <span className="font-medium text-slate-300">{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

interface QualificationBadgeProps {
  qual: string;
}

export function QualificationBadge({ qual }: QualificationBadgeProps) {
  const isTf = qual === 'Tf';
  const isStufe3 = qual.includes('Stufe 3');
  const isStufe2 = qual.includes('Stufe 2');
  const color = isTf
    ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
    : isStufe3
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : isStufe2
        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
        : 'bg-slate-500/15 text-slate-300 border-slate-500/30';
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${color}`}
    >
      {qual}
    </span>
  );
}
