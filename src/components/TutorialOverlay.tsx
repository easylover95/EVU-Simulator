import { useEffect, useLayoutEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui';
import { TUTORIAL_STEPS, TUTORIAL_STEP_COUNT } from '@/lib/tutorial';
import type { AppView } from '@/lib/navigation';

interface TutorialOverlayProps {
  onComplete: () => void;
  onSkip: () => void;
  onNavigate: (view: AppView) => void;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function placeCard(rect: DOMRect | null, width: number, height: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!rect) {
    return { top: Math.max(24, vh * 0.58), left: clamp(vw / 2 - width / 2, 16, vw - width - 16) };
  }

  const gap = 18;
  const large = rect.width > vw * 0.38 || rect.height > vh * 0.32;
  if (large) {
    return {
      top: clamp(vh - height - 24, 16, vh - height - 16),
      left: clamp(24, 16, vw - width - 16),
    };
  }

  const spaceRight = vw - rect.right;
  const spaceLeft = rect.left;
  const spaceBelow = vh - rect.bottom;

  if (spaceRight > width + gap) {
    return {
      top: clamp(rect.top, 16, vh - height - 16),
      left: rect.right + gap,
    };
  }
  if (spaceLeft > width + gap) {
    return {
      top: clamp(rect.top, 16, vh - height - 16),
      left: rect.left - width - gap,
    };
  }
  if (spaceBelow > height + gap) {
    return {
      top: rect.bottom + gap,
      left: clamp(rect.left, 16, vw - width - 16),
    };
  }
  return {
    top: clamp(rect.top - height - gap, 16, vh - height - 16),
    left: clamp(rect.left, 16, vw - width - 16),
  };
}

export function TutorialOverlay({ onComplete, onSkip, onNavigate }: TutorialOverlayProps) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = TUTORIAL_STEPS[index] ?? TUTORIAL_STEPS[0];
  const last = index >= TUTORIAL_STEP_COUNT - 1;
  const Icon = step.icon;
  const warn = step.tone === 'warn';
  const progressPct = ((index + 1) / TUTORIAL_STEP_COUNT) * 100;
  const showSpotlight = step.spotlight !== false;
  const pad = 10;
  const cardW = Math.min(window.innerWidth - 32, 384);
  const cardH = 300;
  const pos = placeCard(showSpotlight ? rect : null, cardW, cardH);
  const ringClass =
    step.ring === 'arch' ? 'rounded-[40%_40%_12px_12px]' : step.ring === 'round' ? 'rounded-full' : 'rounded-xl';

  useEffect(() => {
    if (step.view) onNavigate(step.view);
  }, [index, step.view, onNavigate]);

  useLayoutEffect(() => {
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      if (!step.targetId) {
        setRect(null);
        return;
      }
      const el = document.querySelector(`[data-tutorial="${step.targetId}"]`);
      if (!el) {
        setRect(null);
        return;
      }
      const next = el.getBoundingClientRect();
      if (next.width < 8 || next.height < 8) {
        setRect(null);
        return;
      }
      setRect(next);
    };
    measure();
    const timers = [50, 160, 360, 700, 1200].map((ms) => window.setTimeout(measure, ms));
    window.addEventListener('resize', measure);
    const scene = document.querySelector('.office-scene');
    const ro = scene ? new ResizeObserver(measure) : null;
    if (scene && ro) ro.observe(scene);
    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, [index, step.targetId, step.view]);

  useEffect(() => {
    const onOfficeClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      const hotspot = target.closest('.office-hotspot');
      if (!hotspot) return;

      const highlighted =
        step.targetId && hotspot.closest(`[data-tutorial="${step.targetId}"]`);
      if (step.advanceOnClick && highlighted) {
        event.preventDefault();
        event.stopPropagation();
        setIndex((i) => Math.min(TUTORIAL_STEP_COUNT - 1, i + 1));
        return;
      }
      if (step.view === 'zentrale') {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener('click', onOfficeClick, true);
    return () => document.removeEventListener('click', onOfficeClick, true);
  }, [step.advanceOnClick, step.targetId, step.view]);

  const hole = rect && showSpotlight
    ? {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[90]">
      {!showSpotlight && <div className="pointer-events-auto absolute inset-0 bg-slate-950/30" />}

      {showSpotlight && hole && (
        <>
          <div className="pointer-events-auto absolute inset-x-0 top-0 bg-slate-950/55" style={{ height: Math.max(0, hole.top) }} />
          <div
            className="pointer-events-auto absolute left-0 bg-slate-950/55"
            style={{ top: hole.top, width: Math.max(0, hole.left), height: hole.height }}
          />
          <div
            className="pointer-events-auto absolute right-0 bg-slate-950/55"
            style={{ top: hole.top, left: hole.left + hole.width, height: hole.height }}
          />
          <div
            className="pointer-events-auto absolute inset-x-0 bottom-0 bg-slate-950/55"
            style={{ top: hole.top + hole.height }}
          />
          <div
            className={`tutorial-spotlight-ring absolute ${ringClass}`}
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
            }}
          />
        </>
      )}

      {showSpotlight && !hole && <div className="pointer-events-auto absolute inset-0 bg-slate-950/70" />}

      <div
        className={`tutorial-card pointer-events-auto absolute w-[min(100%-2rem,24rem)] overflow-hidden rounded-xl app-glass shadow-2xl ${
          warn ? 'tutorial-card--warn' : ''
        }`}
        style={{ top: pos.top, left: pos.left }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-amber-500/15 px-4 py-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Schritt {index + 1} von {TUTORIAL_STEP_COUNT}
          </span>
          <button
            type="button"
            onClick={onSkip}
            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 hover:text-amber-300"
          >
            <SkipForward className="h-3 w-3" /> Überspringen
          </button>
        </div>
        <div className="h-1 bg-slate-950/40">
          <div className="h-full bg-amber-400 transition-[width] duration-300" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="space-y-3 p-4">
          <div
            className={`flex items-start gap-3 rounded-lg border p-3 ${
              warn ? 'border-orange-400/50 bg-orange-950/35' : 'border-amber-500/20 bg-slate-950/35'
            }`}
          >
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${
                warn
                  ? 'border-orange-400/40 bg-orange-900/40 text-orange-300'
                  : 'border-amber-500/25 bg-slate-950/50 text-amber-400'
              }`}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-white">{step.title}</h2>
              {warn && (
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-300">
                  Achtung — kostet bares Geld
                </p>
              )}
              {step.advanceOnClick && (
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-400/80">
                  Markierung anklicken
                </p>
              )}
            </div>
          </div>
          <p className={`text-sm leading-relaxed ${warn ? 'text-orange-100' : 'text-slate-300'}`}>{step.description}</p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
              <ChevronLeft className="h-3.5 w-3.5" /> Zurück
            </Button>
            {last ? (
              <Button onClick={onComplete}>
                Los geht's <ChevronRight className="h-3.5 w-3.5" />
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
  );
}

export { TutorialOverlay as TutorialModal };
