import { memo } from 'react';
import { AlertTriangle, CheckCircle2, GraduationCap, ShieldAlert } from 'lucide-react';
import type { QualificationGap } from '@/lib/qualificationGaps';

export const QualificationGapBadges = memo(function QualificationGapBadges({ gaps }: { gaps: QualificationGap[] }) {
  if (gaps.length === 0) {
    return (
      <div className="flex items-center gap-1.5 rounded-sm border border-emerald-600/40 bg-emerald-950/25 px-2 py-1.5 text-[11px] text-emerald-200">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        Qualifikationen und Bremszettel passen zur Auswahl
      </div>
    );
  }
  return (
    <ul className="space-y-1">
      {gaps.map((gap) => (
        <li
          key={`${gap.kind}-${gap.code}`}
          className={`flex items-start gap-1.5 rounded-sm border px-2 py-1.5 text-[11px] ${
            gap.blocksDispatch
              ? 'border-rose-500/50 bg-rose-950/30 text-rose-100'
              : 'border-amber-500/40 bg-amber-950/25 text-amber-100'
          }`}
        >
          {gap.blocksDispatch ? (
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : gap.kind === 'wagonInspector' ? (
            <GraduationCap className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          )}
          <span>
            <strong className="font-bold">{gap.label}.</strong> {gap.detail}
            {!gap.blocksDispatch && <span className="mt-0.5 block text-[10px] opacity-80">Kein Abfahrt-Gate — nur Transparenz.</span>}
          </span>
        </li>
      ))}
    </ul>
  );
});
