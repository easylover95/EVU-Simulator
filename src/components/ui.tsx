import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export const cardClass =
  'app-glass border-amber-500/30 rounded-xl p-6 shadow-2xl';

export const cardFlushClass =
  'app-glass border-amber-500/30 rounded-xl shadow-2xl overflow-hidden';

export const accentTextClass = 'text-amber-400';
export const accentBorderClass = 'border-amber-500/50';

export const primaryButtonClass =
  'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-slate-950 font-bold px-4 py-2 rounded-lg shadow-md transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40';

export const secondaryButtonClass =
  'border border-amber-500/50 bg-slate-900/80 text-amber-300 hover:bg-amber-950/50 font-bold px-4 py-2 rounded-lg shadow-md transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40';

export const dangerButtonClass =
  'border border-rose-500/40 bg-rose-950/40 text-rose-200 hover:bg-rose-900/50 font-bold px-4 py-2 rounded-lg shadow-md transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40';

export function Card({ className = '', children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`${cardClass} ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardFlush({ className = '', children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`${cardFlushClass} ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={`app-glass-header border-b border-amber-500/20 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-amber-200 ${className}`}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-lg font-bold text-white">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const base =
    variant === 'danger' ? dangerButtonClass : variant === 'secondary' ? secondaryButtonClass : primaryButtonClass;
  return (
    <button type="button" className={`inline-flex items-center justify-center gap-1.5 text-xs ${base} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function StatPill({
  label,
  value,
  valueClass = 'text-slate-100',
  dataTutorial,
}: {
  label: string;
  value: ReactNode;
  valueClass?: string;
  dataTutorial?: string;
}) {
  return (
    <span
      data-tutorial={dataTutorial}
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-500/30 bg-slate-900/80 px-2.5 py-1 text-xs leading-none"
    >
      <span className="text-[9px] font-bold uppercase leading-none tracking-wider text-slate-500">{label}</span>
      <span className={`text-xs font-bold tabular-nums leading-none ${valueClass}`}>{value}</span>
    </span>
  );
}
