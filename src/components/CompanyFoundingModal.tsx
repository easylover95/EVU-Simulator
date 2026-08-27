import { useEffect, useState } from 'react';
import { Building2, MapPin, RotateCcw, ShieldAlert, Star, Train, Volume2, Zap } from 'lucide-react';
import { DEFAULT_EVU_NAME, DEFAULT_HQ_LOCATION } from '@/lib/companyProfile';

interface CompanyFoundingModalProps {
  mode: 'found' | 'edit';
  initialName?: string;
  initialLocation?: string;
  corporateRankLabel?: string;
  onSave: (name: string, hqLocation: string, startCapital?: number) => void;
  onCancel?: () => void;
  onReplayTutorial?: () => void;
  onResetGame?: () => void;
  powerSaving?: boolean;
  onTogglePowerSaving?: () => void;
  webVitalsOptIn?: boolean;
  onToggleWebVitalsOptIn?: () => void;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
}

export function CompanyFoundingModal({
  mode,
  initialName,
  initialLocation,
  corporateRankLabel,
  onSave,
  onCancel,
  onReplayTutorial,
  onResetGame,
  powerSaving = false,
  onTogglePowerSaving,
  webVitalsOptIn = false,
  onToggleWebVitalsOptIn,
  soundEnabled = false,
  onToggleSound,
}: CompanyFoundingModalProps) {
  const [name, setName] = useState(initialName?.trim() || DEFAULT_EVU_NAME);
  const [hqLocation, setHqLocation] = useState(initialLocation?.trim() || DEFAULT_HQ_LOCATION);
  const [startCapital, setStartCapital] = useState(150_000);

  useEffect(() => {
    setName(initialName?.trim() || DEFAULT_EVU_NAME);
    setHqLocation(initialLocation?.trim() || DEFAULT_HQ_LOCATION);
  }, [initialName, initialLocation]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(name.trim() || DEFAULT_EVU_NAME, hqLocation.trim() || DEFAULT_HQ_LOCATION, mode === 'found' ? startCapital : undefined);
  }

  const canCancel = mode === 'edit' && Boolean(onCancel);

  return (
    <div className="modal-scrim fixed inset-0 z-[70] flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="fi-card max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto shadow-[0_0_40px_rgba(251,191,36,0.12)]"
      >
        <div className="fi-card-header flex items-center gap-2">
          <Train className="h-3.5 w-3.5 text-amber-400" />
          {mode === 'found' ? 'Unternehmen gründen' : 'Firma bearbeiten'}
        </div>
        <div className="space-y-4 p-5">
          <p className="text-xs leading-relaxed text-slate-400">
            {mode === 'found'
              ? 'Willkommen. Lege Namen, Sitz und Startbedingungen deines Eisenbahnverkehrsunternehmens fest.'
              : 'Name und Standort werden in der Kopfzeile, der Zentrale und im Büro übernommen.'}
          </p>
          {mode === 'edit' && corporateRankLabel && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-950/25 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-300">
                <Star className="h-3 w-3" /> Konzern-Rang
              </div>
              <p className="mt-1 text-sm font-bold text-amber-100">{corporateRankLabel}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">Details und dauerhafte Meilensteinpunkte findest du unter Auswertungen. Der Rang löst keinen Spielstands-Reset aus.</p>
            </div>
          )}
          {mode === 'found' && (
            <fieldset>
              <legend className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                <ShieldAlert className="h-3 w-3 text-amber-400" /> Startkapital &amp; Schwierigkeitsgrad
              </legend>
              <div className="grid gap-2">
                {[
                  {
                    capital: 50_000,
                    title: 'Hardcore Simulation',
                    description: '50.000 € · Enge Puffer, hohes Risiko',
                    accent: 'border-rose-500/45 bg-rose-950/20 text-rose-100',
                  },
                  {
                    capital: 150_000,
                    title: 'Standard / Einsteiger',
                    description: '150.000 € · Ausgewogene Balance',
                    accent: 'border-amber-400/60 bg-amber-950/35 text-amber-100',
                  },
                  {
                    capital: 250_000,
                    title: 'Komfort Modus',
                    description: '250.000 € · Hohe Fehlertoleranz',
                    accent: 'border-sky-400/45 bg-sky-950/20 text-sky-100',
                  },
                ].map((option) => {
                  const selected = startCapital === option.capital;
                  return (
                    <label
                      key={option.capital}
                      className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                        selected ? option.accent : 'border-slate-700 bg-slate-950/35 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      <input
                        type="radio"
                        name="start-capital"
                        value={option.capital}
                        checked={selected}
                        onChange={() => setStartCapital(option.capital)}
                        className="h-4 w-4 shrink-0 accent-amber-400"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-bold">{option.title}</span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-slate-400">{option.description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}
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
          {mode === 'edit' && onTogglePowerSaving && (
            <section className="rounded-lg border border-emerald-500/25 bg-emerald-950/15 px-3 py-3" aria-labelledby="power-saving-title">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 id="power-saving-title" className="flex items-center gap-1.5 text-xs font-bold text-emerald-100"><Zap className="h-3.5 w-3.5 text-emerald-300" /> Energiesparmodus</h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">Reduziert Blur, Schatten, Animationen und Kartenfilter. Ideal für ältere Smartphones und längere Spielsitzungen.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={powerSaving}
                  aria-label="Energiesparmodus umschalten"
                  onClick={onTogglePowerSaving}
                  className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors ${powerSaving ? 'border-emerald-300 bg-emerald-500' : 'border-slate-600 bg-slate-900'}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${powerSaving ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
              </div>
              <p className={`mt-2 text-[10px] font-bold ${powerSaving ? 'text-emerald-300' : 'text-slate-500'}`}>{powerSaving ? 'Aktiv: reduzierte Darstellung wird auf diesem Gerät gespeichert.' : 'Inaktiv: vollständige Frachtimperium-Effekte sind aktiv.'}</p>
            </section>
          )}
          {mode === 'edit' && onToggleSound && (
            <section className="rounded-lg border border-amber-500/25 bg-amber-950/15 px-3 py-3" aria-labelledby="sound-effects-title">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 id="sound-effects-title" className="flex items-center gap-1.5 text-xs font-bold text-amber-100"><Volume2 className="h-3.5 w-3.5 text-amber-300" /> Soundeffekte</h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">Optionale Abfahrts-, Brems-, Bestätigungs- und Warnklänge. Sie werden lokal im Browser erzeugt und laden keine Audiodateien.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={soundEnabled}
                  aria-label="Soundeffekte umschalten"
                  onClick={onToggleSound}
                  className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors ${soundEnabled ? 'border-amber-300 bg-amber-500' : 'border-slate-600 bg-slate-900'}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${soundEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
              </div>
              <p className={`mt-2 text-[10px] font-bold ${soundEnabled ? 'text-amber-300' : 'text-slate-500'}`}>{soundEnabled ? 'Aktiv: Klänge werden nach bestätigten Spielaktionen abgespielt.' : 'Inaktiv: Das Spiel bleibt vollständig stumm.'}</p>
            </section>
          )}
          {mode === 'edit' && onToggleWebVitalsOptIn && (
            <section className="rounded-lg border border-sky-500/25 bg-sky-950/15 px-3 py-3" aria-labelledby="web-vitals-title">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 id="web-vitals-title" className="flex items-center gap-1.5 text-xs font-bold text-sky-100">Anonyme Leistungsdaten</h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">Erfasst ausschließlich LCP, CLS und INP lokal. Es werden keine Spielstände, Finanzwerte oder persönlichen Daten übertragen.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={webVitalsOptIn}
                  aria-label="Anonyme Leistungsdaten umschalten"
                  onClick={onToggleWebVitalsOptIn}
                  className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors ${webVitalsOptIn ? 'border-sky-300 bg-sky-500' : 'border-slate-600 bg-slate-900'}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${webVitalsOptIn ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
              </div>
              <p className={`mt-2 text-[10px] font-bold ${webVitalsOptIn ? 'text-sky-300' : 'text-slate-500'}`}>{webVitalsOptIn ? 'Aktiv: Werte werden nur lokal in diesem Browser gepuffert.' : 'Inaktiv: Es werden keine Web-Vitals erfasst.'}</p>
            </section>
          )}
          {mode === 'edit' && onResetGame && (
            <section className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-3 py-3" aria-labelledby="new-company-title">
              <div className="flex items-start gap-2">
                <RotateCcw className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" aria-hidden />
                <div className="min-w-0">
                  <h3 id="new-company-title" className="text-xs font-bold text-rose-100">Neues Unternehmen gründen</h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                    Löscht den lokalen Spielstand und öffnet anschließend die Schwierigkeitsauswahl.
                  </p>
                  <button
                    type="button"
                    onClick={onResetGame}
                    className="mt-2 btn-action border-rose-500/60 bg-rose-950/50 text-rose-100 hover:bg-rose-900/60"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    Spiel zurücksetzen
                  </button>
                </div>
              </div>
            </section>
          )}
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
