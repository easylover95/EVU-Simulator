import { Clock3, Users } from 'lucide-react';
import {
  SHIFT_WINDOWS,
  formatShiftHours,
  handoverIncomingKind,
  isHandoverWindow,
  type ActiveShift,
  type ShiftKind,
} from '@/lib/shifts';

export interface ShiftBadgeProps {
  activeShift: ActiveShift | null;
  gameNow: Date;
  onOpenLeitstelle?: () => void;
}

export function ShiftBadge({ activeShift, gameNow, onOpenLeitstelle }: ShiftBadgeProps) {
  const handover = isHandoverWindow(gameNow);
  const incoming = handoverIncomingKind(gameNow);
  const kind: ShiftKind | null = activeShift?.active ? activeShift.kind : null;
  const win = kind ? SHIFT_WINDOWS[kind] : null;

  return (
    <button
      type="button"
      onClick={onOpenLeitstelle}
      title={onOpenLeitstelle ? 'Leitstelle öffnen' : undefined}
      className={`app-shift-badge ${activeShift?.active ? 'is-on-duty' : ''} ${handover ? 'is-handover' : ''}`}
    >
      <span className="app-shift-badge__icon" aria-hidden>
        {handover ? <Users className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
      </span>
      <span className="app-shift-badge__text">
        {activeShift?.active && win ? (
          <>
            <strong>{win.short}</strong>
            <span>{formatShiftHours(win.kind)}</span>
          </>
        ) : (
          <>
            <strong>Außer Dienst</strong>
            <span>Dienst antreten</span>
          </>
        )}
      </span>
      {handover && incoming && (
        <span className="app-shift-badge__handover">Ablöser {SHIFT_WINDOWS[incoming].short}</span>
      )}
    </button>
  );
}
