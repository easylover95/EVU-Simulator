import { useState } from 'react';
import { AlertTriangle, BookOpen, Clock3, UserRound, X } from 'lucide-react';
import {
  careerFullTitle,
  expProgress,
  rankDef,
  type DispatcherCareer,
} from '@/lib/dispatcherCareer';
import {
  SHIFT_ORDER,
  SHIFT_WINDOWS,
  formatShiftHours,
  scheduledShiftAt,
  type OpenHandoverItem,
  type ShiftKind,
} from '@/lib/shifts';

export interface ShiftLoginModalProps {
  career: DispatcherCareer;
  gameNow: Date;
  handoverBook: OpenHandoverItem[];
  preselectKind?: ShiftKind | null;
  onStartDuty: (kind: ShiftKind) => void;
  onClose: () => void;
  onRename?: (name: string) => void;
}

export function ShiftLoginModal({
  career,
  gameNow,
  handoverBook,
  preselectKind,
  onStartDuty,
  onClose,
  onRename,
}: ShiftLoginModalProps) {
  const suggested = preselectKind ?? scheduledShiftAt(gameNow);
  const [kind, setKind] = useState<ShiftKind>(suggested);
  const [nameDraft, setNameDraft] = useState(career.displayName);
  const def = rankDef(career.rank);
  const progress = expProgress(career);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shift-login-title"
        className="app-glass flex max-h-[min(92vh,680px)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-amber-400/30 shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-700/60 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-300/90">Schicht-Anmeldung</p>
            <h2 id="shift-login-title" className="text-lg font-bold text-slate-50">
              Leitstellen-Briefing
            </h2>
            <p className="truncate text-xs text-slate-400">{careerFullTitle(career)}</p>
          </div>
          <button type="button" className="app-topbar-ctrl" onClick={onClose} aria-label="Schließen">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          <section className="rounded-md border border-slate-700/50 bg-slate-950/40 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-200">
              <UserRound className="h-3.5 w-3.5 text-amber-400" />
              Disponenten-Profil
            </div>
            {onRename ? (
              <label className="block text-[11px] text-slate-400">
                Name
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => {
                  const trimmed = nameDraft.trim();
                  if (trimmed && trimmed !== career.displayName) onRename(trimmed);
                }}
                className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-amber-400/60"
              />
              </label>
            ) : (
              <p className="text-sm font-bold text-slate-100">{career.displayName}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded border border-amber-400/30 bg-amber-950/30 px-1.5 py-0.5 font-bold text-amber-200">
                Rang {career.rank} · {def.label}
              </span>
              <span className="text-slate-400">
                {progress.toNext == null
                  ? 'Maximalrang'
                  : `${progress.intoRank} / ${progress.toNext} EXP`}
              </span>
            </div>
            {progress.toNext != null && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-amber-400/90"
                  style={{ width: `${progress.pct}%` }}
                />
              </div>
            )}
            <ul className="mt-2 space-y-0.5 text-[11px] text-slate-400">
              {def.unlockHints.map((hint) => (
                <li key={hint}>· {hint}</li>
              ))}
            </ul>
          </section>

          <section>
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <Clock3 className="h-3.5 w-3.5" />
              Schicht wählen
            </div>
            <div className="grid gap-1.5">
              {SHIFT_ORDER.map((id) => {
                const win = SHIFT_WINDOWS[id];
                const selected = kind === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setKind(id)}
                    className={`rounded-md border px-3 py-2 text-left transition ${
                      selected
                        ? 'border-amber-400/60 bg-amber-950/35 ring-1 ring-amber-400/40'
                        : 'border-slate-700/50 bg-slate-950/40 hover:border-slate-500'
                    }`}
                  >
                    <div className="text-sm font-bold text-slate-100">{win.label}</div>
                    <div className="text-[11px] text-slate-400">{formatShiftHours(id)} Uhr</div>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <BookOpen className="h-3.5 w-3.5" />
              Übergabebuch der Vorgängerschicht
            </div>
            {handoverBook.length === 0 ? (
              <p className="rounded-md border border-emerald-500/25 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-200/90">
                Keine offenen Vorgänge — ruhiger Start.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {handoverBook.map((item) => (
                  <li
                    key={item.assignmentId}
                    className="rounded-md border border-amber-500/30 bg-amber-950/20 px-2.5 py-2 text-xs"
                  >
                    <div className="flex items-start gap-1.5">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                      <div className="min-w-0">
                        <div className="font-bold text-amber-100">{item.label}</div>
                        <div className="text-amber-100/70">
                          {item.origin} → {item.dest}
                        </div>
                        <div className="mt-0.5 text-amber-200/80">{item.note}</div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-700/60 px-4 py-3">
          <button type="button" className="btn-ghost-sm" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn-gold-sm"
            onClick={() => {
              const trimmed = nameDraft.trim();
              if (onRename && trimmed && trimmed !== career.displayName) onRename(trimmed);
              onStartDuty(kind);
            }}
          >
            Dienst antreten
          </button>
        </footer>
      </div>
    </div>
  );
}
