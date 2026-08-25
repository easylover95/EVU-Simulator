import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui';

interface LogoutConfirmModalProps {
  onCancel: () => void;
  onConfirm: () => void;
}

export function LogoutConfirmModal({ onCancel, onConfirm }: LogoutConfirmModalProps) {
  return (
    <div className="modal-scrim fixed inset-0 z-[85] flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="app-glass w-full max-w-md rounded-2xl p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="logout-confirm-title"
        aria-describedby="logout-confirm-copy"
      >
        <div className="flex items-center gap-2 text-amber-200">
          <LogOut className="h-4 w-4" />
          <h2 id="logout-confirm-title" className="text-sm font-bold uppercase tracking-wide">
            Hauptmenü
          </h2>
        </div>
        <p id="logout-confirm-copy" className="mt-3 text-sm leading-relaxed text-slate-300">
          Wirklich zum Hauptmenü zurückkehren? (Spielstand wird gespeichert)
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Abbrechen
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Speichern und verlassen
          </Button>
        </div>
      </div>
    </div>
  );
}
