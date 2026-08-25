import { useRef } from 'react';
import { Cpu } from 'lucide-react';
import { formatEuro } from '@/lib/status';
import { Button } from '@/components/ui';

export function EtcsRetrofitModal({
  locoName,
  cost,
  listCost,
  durationDays,
  warning,
  confirmDisabled = false,
  onCancel,
  onConfirm,
}: {
  locoName: string;
  cost: number;
  listCost?: number;
  durationDays: number;
  warning?: string | null;
  confirmDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => boolean;
}) {
  const lock = useRef(false);
  const blocked = Boolean(warning) || confirmDisabled;

  return (
    <div
      className="modal-scrim fixed inset-0 z-[70] flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="app-glass w-full max-w-md rounded-xl border-amber-500/30 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="etcs-retrofit-title"
      >
        <h3 id="etcs-retrofit-title" className="flex items-center gap-2 text-sm font-bold text-white">
          <Cpu className="h-4 w-4 text-sky-400" />
          ETCS-Nachrüstung bestätigen
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-slate-200">
          Lok{' '}
          <span className="font-bold text-white">{locoName}</span>
        </p>
        <ul className="app-glass-panel mt-3 space-y-1 rounded-lg border border-amber-500/20 p-3 text-[12px] text-slate-300">
          <li className="flex justify-between gap-3">
            <span>Kosten (Händler-ETCS-Preis)</span>
            <span className="tabular-nums font-bold text-amber-200">
              {listCost != null && listCost > cost ? (
                <>
                  <span className="mr-1.5 text-[10px] font-semibold text-slate-500 line-through">{formatEuro(listCost)}</span>
                  {formatEuro(cost)}
                </>
              ) : (
                formatEuro(cost)
              )}
            </span>
          </li>
          <li className="flex justify-between gap-3">
            <span>Dauer</span>
            <span className="font-bold text-white">
              {durationDays === 1 ? '1 Ingame-Tag' : `${durationDays} Ingame-Tage`}
            </span>
          </li>
        </ul>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
          Es wird ein eigener Werkstatt-Slot benötigt. Die Kosten werden erst nach Bestätigung abgebucht.
        </p>
        {warning && (
          <p className="mt-3 rounded-lg border border-rose-500/50 bg-rose-950/50 px-3 py-2 text-sm font-bold leading-relaxed text-rose-200">
            {warning}
          </p>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Abbrechen
          </Button>
          <Button
            disabled={blocked}
            onClick={() => {
              if (blocked || lock.current) return;
              lock.current = true;
              const ok = onConfirm();
              lock.current = false;
              if (!ok) return;
            }}
          >
            Ja, ETCS nachrüsten (Kosten bezahlen)
          </Button>
        </div>
      </div>
    </div>
  );
}
