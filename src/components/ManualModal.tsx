import { memo, useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { BookOpen, Search, X } from 'lucide-react';
import { Button } from '@/components/ui';
import {
  HANDBOOK_CATEGORIES,
  handbookCategoryById,
  resolveHandbookTarget,
  searchHandbookArticles,
  type HandbookCategoryId,
  type HandbookOpenTo,
} from '@/lib/handbook';

export interface ManualModalProps {
  onClose: () => void;
  onReplayTutorial: () => void;
  openTo?: HandbookOpenTo | null;
}

export const ManualModal = memo(function ManualModal({ onClose, onReplayTutorial, openTo }: ManualModalProps) {
  const initial = resolveHandbookTarget(openTo);
  const [categoryId, setCategoryId] = useState<HandbookCategoryId>(initial.categoryId);
  const [articleId, setArticleId] = useState(initial.articleId);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const next = resolveHandbookTarget(openTo);
    setCategoryId(next.categoryId);
    setArticleId(next.articleId);
    setQuery('');
  }, [openTo]);

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const searchHits = useMemo(() => searchHandbookArticles(query), [query]);
  const searching = query.trim().length >= 2;
  const category = handbookCategoryById(categoryId);
  const article = category.articles.find((entry) => entry.id === articleId) ?? category.articles[0];

  const selectCategory = useCallback((id: HandbookCategoryId) => {
    const next = handbookCategoryById(id);
    setCategoryId(next.id);
    setArticleId(next.articles[0]?.id ?? 'quick-guide');
    setQuery('');
  }, []);

  const selectArticle = useCallback((nextCategory: HandbookCategoryId, nextArticle: string) => {
    setCategoryId(nextCategory);
    setArticleId(nextArticle);
    setQuery('');
  }, []);

  const onSearchKey = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' && searchHits[0]) {
        selectArticle(searchHits[0].categoryId, searchHits[0].article.id);
      }
    },
    [searchHits, selectArticle],
  );

  return (
    <div className="modal-scrim fixed inset-0 z-[80] flex items-stretch justify-center md:items-center md:p-4" onClick={onClose}>
      <section
        className="app-glass help-handbook flex min-h-[100dvh] w-full max-w-5xl flex-col overflow-hidden rounded-none shadow-2xl md:max-h-[min(90vh,48rem)] md:min-h-0 md:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-handbook-title"
      >
        <header className="app-glass-header flex shrink-0 flex-col gap-3 border-b border-amber-500/20 px-4 py-3 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 text-amber-200">
              <BookOpen className="h-4 w-4 shrink-0" />
              <div>
                <h2 id="help-handbook-title" className="text-sm font-bold uppercase tracking-wide">
                  Betriebs-Handbuch
                </h2>
                <p className="mt-0.5 text-[10px] font-medium normal-case tracking-normal text-slate-500">
                  Spielregeln dieses Builds — ohne erfundene Systeme
                </p>
              </div>
            </div>
            <button
              type="button"
              className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md p-1 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
              onClick={onClose}
              aria-label="Handbuch schließen"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onSearchKey}
              placeholder="Suche in allen Artikeln …"
              className="w-full rounded-lg border border-slate-600 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-amber-500"
              aria-label="Handbuch durchsuchen"
            />
          </label>
        </header>

        <div className="help-handbook-layout min-h-0 flex-1">
          <nav className="help-handbook-nav no-scrollbar" aria-label="Handbuch-Kategorien">
            {HANDBOOK_CATEGORIES.map((entry) => {
              const isActive = entry.id === category.id && !searching;
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={`help-handbook-nav-item min-h-12 ${isActive ? 'is-active' : ''}`}
                  onClick={() => selectCategory(entry.id)}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="md:hidden">{entry.shortLabel}</span>
                  <span className="hidden md:inline">{entry.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="help-handbook-content overflow-y-auto p-4 sm:p-5" role="region" aria-live="polite">
            {searching ? (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300/80">Suchergebnisse</p>
                <h3 className="mt-1 text-base font-bold text-white">
                  {searchHits.length === 0 ? 'Keine Treffer' : `${searchHits.length} Artikel`}
                </h3>
                <div className="mt-3 grid gap-2">
                  {searchHits.map((hit) => (
                    <button
                      key={`${hit.categoryId}-${hit.article.id}`}
                      type="button"
                      className="help-handbook-topic w-full text-left"
                      onClick={() => selectArticle(hit.categoryId, hit.article.id)}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wide text-amber-200/80">{hit.categoryLabel}</p>
                      <h4 className="mt-0.5 text-sm font-bold text-white">{hit.article.title}</h4>
                      <p className="mt-1 text-[12px] leading-relaxed text-slate-400">{hit.article.summary}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="help-handbook-hero">
                  <span className="help-handbook-hero-icon">
                    <BookOpen className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300/80">{category.eyebrow}</p>
                    <h3 className="mt-0.5 text-base font-bold text-white">{category.label}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-300">{category.intro}</p>
                  </div>
                </div>

                <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar pb-1 md:flex-wrap md:overflow-visible">
                  {category.articles.map((entry) => {
                    const active = entry.id === article?.id;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        className={`min-h-12 shrink-0 rounded-full border px-3 text-[11px] font-bold uppercase tracking-wide ${
                          active
                            ? 'border-amber-400 bg-amber-500/20 text-amber-100'
                            : 'border-slate-600 bg-slate-900/60 text-slate-400'
                        }`}
                        onClick={() => setArticleId(entry.id)}
                      >
                        {entry.title}
                      </button>
                    );
                  })}
                </div>

                {article && (
                  <article className="help-handbook-topic mt-4" id={`handbook-article-${article.id}`}>
                    <h4 className="text-sm font-bold text-white">{article.title}</h4>
                    <p className="mt-1 text-xs font-medium text-amber-200/90">{article.summary}</p>
                    <div className="mt-3 space-y-2">
                      {article.body.map((paragraph) => (
                        <p key={paragraph.slice(0, 48)} className="text-[13px] leading-relaxed text-slate-300">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                    {article.notes?.map((note) => (
                      <p key={note.slice(0, 40)} className="mt-3 text-[12px] font-semibold leading-relaxed text-amber-300/90">
                        {note}
                      </p>
                    ))}
                  </article>
                )}
              </>
            )}
          </div>
        </div>

        <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-amber-500/15 px-4 py-3 sm:px-5">
          <Button variant="secondary" onClick={onReplayTutorial}>
            Tutorial wiederholen
          </Button>
          <Button onClick={onClose}>Schließen</Button>
        </footer>
      </section>
    </div>
  );
});
