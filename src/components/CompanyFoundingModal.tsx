import { useEffect, useState } from 'react';
import { Building2, MapPin, Train } from 'lucide-react';
import { DEFAULT_EVU_NAME, DEFAULT_HQ_LOCATION } from '@/lib/companyProfile';

interface CompanyFoundingModalProps {
  mode: 'found' | 'edit';
  initialName?: string;
  initialLocation?: string;
  onSave: (name: string, hqLocation: string) => void;
  onCancel?: () => void;
  onReplayTutorial?: () => void;
}

export function CompanyFoundingModal({
  mode,
  initialName,
  initialLocation,
  onSave,
  onCancel,
  onReplayTutorial,
}: CompanyFoundingModalProps) {
  const [name, setName] = useState(initialName?.trim() || DEFAULT_EVU_NAME);
  const [hqLocation, setHqLocation] = useState(initialLocation?.trim() || DEFAULT_HQ_LOCATION);

  useEffect(() => {
    setName(initialName?.trim() || DEFAULT_EVU_NAME);
    setHqLocation(initialLocation?.trim() || DEFAULT_HQ_LOCATION);
  }, [initialName, initialLocation]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(name.trim() || DEFAULT_EVU_NAME, hqLocation.trim() || DEFAULT_HQ_LOCATION);
  }

  const canCancel = mode === 'edit' && Boolean(onCancel);

  return (
    <div className="modal-scrim fixed inset-0 z-[70] flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="fi-card w-full max-w-md overflow-hidden shadow-[0_0_40px_rgba(251,191,36,0.12)]"
      >
        <div className="fi-card-header flex items-center gap-2">
          <Train className="h-3.5 w-3.5 text-amber-400" />
          {mode === 'found' ? 'Unternehmen gründen' : 'Firma bearbeiten'}
        </div>
        <div className="space-y-4 p-5">
          <p className="text-xs leading-relaxed text-slate-400">
            {mode === 'found'
              ? 'Willkommen. Lege Namen und Sitz deines Eisenbahnverkehrsunternehmens fest. Bestand, Kontostand und Spielstand bleiben erhalten.'
              : 'Name und Standort werden in der Kopfzeile, der Zentrale und im Büro übernommen.'}
          </p>
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <Building2 className="h-3 w-3 text-amber-400" /> EVU-Name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              className="w-full rounded-sm border border-slate-600 bg-slate-900/80 px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
              placeholder={DEFAULT_EVU_NAME}
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <MapPin className="h-3 w-3 text-sky-400" /> Standort / Zentrale
            </span>
            <input
              value={hqLocation}
              onChange={(e) => setHqLocation(e.target.value)}
              maxLength={64}
              className="w-full rounded-sm border border-slate-600 bg-slate-900/80 px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
              placeholder={DEFAULT_HQ_LOCATION}
            />
          </label>
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            {mode === 'edit' && onReplayTutorial && (
              <button
                type="button"
                onClick={onReplayTutorial}
                className="mr-auto btn-action border-amber-600/40 bg-slate-900/60 text-amber-300 hover:bg-amber-950/40"
              >
                Tutorial erneut ansehen
              </button>
            )}
            {canCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="btn-action border-slate-600 bg-slate-900/60 text-slate-300 hover:bg-slate-800"
              >
                Abbrechen
              </button>
            )}
            <button type="submit" className="btn-action border-amber-600 bg-amber-500 text-slate-950 hover:bg-amber-400">
              {mode === 'found' ? 'Unternehmen gründen' : 'Speichern'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
