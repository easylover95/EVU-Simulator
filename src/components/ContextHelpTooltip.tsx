import { memo, useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, CircleHelp, X } from 'lucide-react';
import { CONTEXT_HELP_TOPICS, type ContextHelpTopicId, type HandbookOpenTo } from '@/lib/handbook';

export interface ContextHelpTooltipProps {
  topicId: ContextHelpTopicId;
  label?: string;
  className?: string;
  onOpenManual?: (target: HandbookOpenTo) => void;
}

function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
}

export const ContextHelpTooltip = memo(function ContextHelpTooltip({
  topicId,
  label,
  className = '',
  onOpenManual,
}: ContextHelpTooltipProps) {
  const topic = CONTEXT_HELP_TOPICS[topicId];
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(isMobileViewport);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const sync = () => setMobile(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((value) => !value), []);

  const openManual = useCallback(() => {
    onOpenManual?.(topic.handbook);
    setOpen(false);
  }, [onOpenManual, topic.handbook]);

  const title = label ?? topic.title;

  return (
    <span className={`inline-flex items-center ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-full text-amber-300/90 hover:bg-amber-500/10 hover:text-amber-100 md:min-h-8 md:min-w-8"
        aria-label={`Hilfe: ${title}`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={(event) => {
          event.stopPropagation();
          toggle();
        }}
      >
        <CircleHelp className="h-4 w-4" aria-hidden />
      </button>
      {open &&
        createPortal(
          <HelpLayer
            id={panelId}
            title={topic.title}
            paragraphs={topic.paragraphs}
            mobile={mobile}
            onClose={close}
            onOpenManual={onOpenManual ? openManual : undefined}
          />,
          document.body,
        )}
    </span>
  );
});

const HelpLayer = memo(function HelpLayer({
  id,
  title,
  paragraphs,
  mobile,
  onClose,
  onOpenManual,
}: {
  id: string;
  title: string;
  paragraphs: string[];
  mobile: boolean;
  onClose: () => void;
  onOpenManual?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90]" role="presentation">
      <button type="button" className="absolute inset-0 bg-slate-950/55" aria-label="Hilfe schließen" onClick={onClose} />
      <section
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className={
          mobile
            ? 'absolute inset-x-0 bottom-0 max-h-[min(88dvh,36rem)] min-h-[12rem] overflow-y-auto rounded-t-2xl border border-amber-500/25 bg-slate-950 p-4 shadow-2xl'
            : 'absolute left-1/2 top-1/2 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-amber-500/25 bg-slate-950 p-4 shadow-2xl'
        }
      >
        {mobile && <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-600" aria-hidden />}
        <div className="flex items-start justify-between gap-3">
          <h3 id={`${id}-title`} className="text-sm font-bold text-amber-100">
            {title}
          </h3>
          <button
            type="button"
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md text-slate-400 hover:text-white"
            aria-label="Hilfe schließen"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 40)} className="text-[13px] leading-relaxed text-slate-300">
              {paragraph}
            </p>
          ))}
        </div>
        {onOpenManual && (
          <button
            type="button"
            className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs font-bold uppercase tracking-wide text-amber-200"
            onClick={onOpenManual}
          >
            <BookOpen className="h-4 w-4" />
            Mehr im Handbuch
          </button>
        )}
      </section>
    </div>
  );
});
