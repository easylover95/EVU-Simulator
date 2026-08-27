import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ResetGameConfirmModalProps {
  onCancel: () => void;
  onConfirm: () => void;
}

/** Sicherheitsabfrage vor dem vollständigen lokalen Neustart des Unternehmens. */
export function ResetGameConfirmModal({ onCancel, onConfirm }: ResetGameConfirmModalProps) {
  return (
    <div className="modal-scrim fixed inset-0 z-[90] flex items-center justify-center p-4">
      <section
        className="fi-card w-full max-w-md overflow-hidden border-rose-500/45 shadow-[0_0_40px_rgba(244,63,94,0.14)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-game-confirm-title"
        aria-describedby="reset-game-confirm-description"
      >
        <div className="fi-card-header flex items-center gap-2 text-rose-200">
          <AlertTriangle className="h-4 w-4 text-rose-400" aria-hidden />
          Spielstand zurücksetzen
        </div>
        <div className="space-y-4 p-5">
          <p id="reset-game-confirm-description" className="text-sm leading-relaxed text-slate-300">
            Bist du sicher? Alle aktuellen Fortschritte, inklusive Kapital, Fuhrpark, Personal, Kredite,
            Verträge und Erfolge, gehen auf diesem Gerät verloren.
          </p>
          <p className="rounded-lg border border-rose-500/25 bg-rose-950/30 px-3 py-2 text-xs leading-relaxed text-rose-100">
            Nach der Bestätigung startest du direkt wieder mit der Unternehmensgründung und wählst den
            Schwierigkeitsgrad neu.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="btn-action border-slate-600 bg-slate-900/60 text-slate-200 hover:bg-slate-800"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="btn-action border-rose-500 bg-rose-500 text-white hover:bg-rose-400"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Spielstand endgültig löschen
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
