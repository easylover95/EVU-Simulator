import { useState } from 'react';
import { ChevronLeft, ChevronRight, GraduationCap, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui';
import { TUTORIAL_STEPS, TUTORIAL_STEP_COUNT } from '@/lib/tutorial';

interface TutorialModalProps {
  onComplete: () => void;
  onSkip: () => void;
}

export function TutorialModal({ onComplete, onSkip }: TutorialModalProps) {
  const [index, setIndex] = useState(0);
  const step = TUTORIAL_STEPS[index] ?? TUTORIAL_STEPS[0];
  const last = index >= TUTORIAL_STEP_COUNT - 1;
  const Icon = step.icon;
  const warn = step.tone === 'warn';
  const progressPct = ((index + 1) / TUTORIAL_STEP_COUNT) * 100;

  return (
    <div className="modal-scrim fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="app-glass w-full max-w-lg overflow-hidden rounded-xl shadow-[0_0_48px_rgba(251,191,36,0.16)]">
        <div className="fi-card-header flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2">
            <GraduationCap className="h-3.5 w-3.5 text-amber-400" />
            Einführung
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Schritt {index + 1} von {TUTORIAL_STEP_COUNT}
          </span>
        </div>

        <div className="h-1 bg-slate-900">
          <div
            className="h-full bg-amber-400 transition-[width] duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="space-y-4 p-5">
          <div
            className={`flex items-start gap-3 rounded-sm border p-3 ${
              warn
                ? 'border-orange-400/70 bg-orange-950/35'
                : 'border-amber-500/25 bg-slate-950/50'
            }`}
          >
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border ${
                warn
                  ? 'border-orange-400/50 bg-orange-900/40 text-orange-300'
                  : 'border-amber-500/30 bg-slate-900 text-amber-400'
              }`}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white">{step.title}</h2>
              {warn && (
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-300">
                  Achtung — kostet bares Geld
                </p>
              )}
            </div>
          </div>

          <p className="text-sm leading-relaxed text-slate-300">{step.description}</p>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
            <button
              type="button"
              onClick={onSkip}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 hover:text-amber-300"
            >
              <SkipForward className="h-3.5 w-3.5" /> Tutorial überspringen
            </button>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
                <ChevronLeft className="h-3.5 w-3.5" /> Zurück
              </Button>
              {last ? (
                <Button onClick={onComplete}>
                  Los geht’s <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button onClick={() => setIndex((i) => Math.min(TUTORIAL_STEP_COUNT - 1, i + 1))}>
                  Weiter <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
