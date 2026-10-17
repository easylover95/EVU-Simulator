import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export const cardClass =
  'app-glass border-white/10 rounded-[1.15rem] p-6 shadow-[0_8px_28px_rgba(0,0,0,0.28)]';

export const cardFlushClass =
  'app-glass border-white/10 rounded-[1.15rem] shadow-[0_8px_28px_rgba(0,0,0,0.28)] overflow-hidden';

export const accentTextClass = 'text-amber-400';
export const accentBorderClass = 'border-amber-500/40';

export const primaryButtonClass =
  'bg-[#f5b942] hover:brightness-105 text-[#1c1c1e] font-semibold px-4 py-2.5 min-h-10 rounded-[0.85rem] shadow-sm transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40';

export const secondaryButtonClass =
  'border border-amber-500/40 bg-white/5 text-amber-300 hover:bg-amber-500/10 font-semibold px-4 py-2.5 min-h-10 rounded-[0.85rem] shadow-sm transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40';

export const dangerButtonClass =
  'border border-rose-500/35 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 font-semibold px-4 py-2.5 min-h-10 rounded-[0.85rem] shadow-sm transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40';

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
      className={`app-glass-header border-b border-white/10 px-4 py-2.5 text-[13px] font-semibold tracking-tight text-[#f2f2f7] ${className}`}
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
        <h2 className="text-[1.35rem] font-semibold tracking-tight text-white">{title}</h2>
        {subtitle && <p className="text-[13px] text-[#8e8e93]">{subtitle}</p>}
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
    <button type="button" className={`inline-flex items-center justify-center gap-1.5 text-[13px] ${base} ${className}`} {...rest}>
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
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs leading-none"
    >
      <span className="text-[10px] font-medium leading-none tracking-normal text-[#8e8e93]">{label}</span>
      <span className={`text-xs font-semibold tabular-nums leading-none ${valueClass}`}>{value}</span>
    </span>
  );
}
