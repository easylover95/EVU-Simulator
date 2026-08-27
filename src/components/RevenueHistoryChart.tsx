import type { HistoricalCompanyStatistics } from '@/lib/statisticsArchive';

interface RevenueHistoryChartProps {
  entries: HistoricalCompanyStatistics[];
}

const WIDTH = 640;
const HEIGHT = 220;
const PADDING = { top: 24, right: 18, bottom: 40, left: 62 };

function compactEuro(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function shortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', { month: 'short', year: '2-digit' }).format(date);
}

/** Visualisiert reale, abgeschlossene Unternehmensläufe zeitlich nach Archivierungsdatum. */
export function RevenueHistoryChart({ entries }: RevenueHistoryChartProps) {
  const points = [...entries]
    .sort((a, b) => Date.parse(a.archivedAt) - Date.parse(b.archivedAt))
    .slice(-24);

  if (points.length === 0) {
    return (
      <div className="flex min-h-[180px] items-center justify-center px-4 text-center text-xs leading-relaxed text-slate-500">
        Der Umsatzverlauf erscheint nach dem ersten archivierten Unternehmenslauf.
      </div>
    );
  }

  const maxRevenue = Math.max(...points.map((entry) => entry.totalRevenue), 1);
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const x = (index: number) => PADDING.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const y = (value: number) => PADDING.top + plotHeight - (value / maxRevenue) * plotHeight;
  const line = points.map((entry, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(entry.totalRevenue)}`).join(' ');
  const area = `${line} L ${x(points.length - 1)} ${PADDING.top + plotHeight} L ${x(0)} ${PADDING.top + plotHeight} Z`;
  const ticks = [0, 0.5, 1];
  const labelIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  const totalRevenue = points.reduce((sum, entry) => sum + entry.totalRevenue, 0);

  return (
    <div className="w-full" data-revenue-history-chart>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2 px-1">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300">Umsatzentwicklung</p>
          <p className="mt-1 text-xs text-slate-400">Gesamtumsatz je archiviertem Unternehmenslauf, chronologisch</p>
        </div>
        <p className="text-right text-sm font-black tabular-nums text-emerald-300">{compactEuro(totalRevenue)}</p>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="block h-auto w-full overflow-visible"
        role="img"
        aria-label={`Historischer Umsatzverlauf aus ${points.length} archivierten Unternehmensläufen. Höchstwert ${compactEuro(maxRevenue)}.`}
      >
        <defs>
          <linearGradient id="revenue-history-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => {
          const tickY = y(maxRevenue * tick);
          return (
            <g key={tick}>
              <line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={tickY} y2={tickY} stroke="rgba(148,163,184,0.22)" strokeDasharray="3 5" />
              <text x={PADDING.left - 8} y={tickY + 4} textAnchor="end" fill="#94a3b8" fontSize="10">{compactEuro(maxRevenue * tick)}</text>
            </g>
          );
        })}
        <path d={area} fill="url(#revenue-history-area)" />
        <path d={line} fill="none" stroke="#34d399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((entry, index) => (
          <g key={entry.id}>
            <circle cx={x(index)} cy={y(entry.totalRevenue)} r="5" fill="#0f172a" stroke="#6ee7b7" strokeWidth="2.5">
              <title>{`${entry.companyName}: ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(entry.totalRevenue)}`}</title>
            </circle>
            {labelIndexes.includes(index) && (
              <text x={x(index)} y={HEIGHT - 14} textAnchor="middle" fill="#94a3b8" fontSize="10">{shortDate(entry.archivedAt)}</text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
