import {
  HANDBOOK_CATEGORIES,
  handbookCategoryCount,
  resolveHandbookTarget,
  searchHandbookArticles,
} from '../src/lib/handbook';

function requireCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Handbuch: ${message}`);
}

requireCondition(handbookCategoryCount() === 6, 'Es müssen genau sechs Kategorien existieren.');
requireCondition(HANDBOOK_CATEGORIES[0]?.id === 'einstieg', 'Erste Kategorie muss Einstieg sein.');
requireCondition(
  HANDBOOK_CATEGORIES.map((category) => category.id).join(',') === 'einstieg,gueter,baugleis,fuhrpark,personal,finanzen',
  'Kategorie-Reihenfolge muss der Spezifikation entsprechen.',
);

const titles = HANDBOOK_CATEGORIES.map((category) => category.label);
requireCondition(titles[0]!.includes('Einstieg'), 'Kategorie 1 Label');
requireCondition(titles[1]!.includes('Güterverkehr'), 'Kategorie 2 Label');
requireCondition(titles[2]!.includes('Baugleis'), 'Kategorie 3 Label');
requireCondition(titles[3]!.includes('Fuhrpark'), 'Kategorie 4 Label');
requireCondition(titles[4]!.includes('Personal'), 'Kategorie 5 Label');
requireCondition(titles[5]!.includes('Finanzen'), 'Kategorie 6 Label');

const haken = searchHandbookArticles('Hakenlast');
requireCondition(haken.some((hit) => hit.article.id === 'hakenlast'), 'Suche Hakenlast muss den Artikel finden.');
requireCondition(haken.every((hit) => hit.categoryId === 'fuhrpark' || hit.article.keywords.includes('hakenlast') || /hakenlast/i.test(hit.article.title + hit.article.body.join(' '))), 'Hakenlast-Treffer müssen inhaltlich passen.');

const poenale = searchHandbookArticles('Pönale');
requireCondition(poenale.some((hit) => hit.article.id === 'poenale'), 'Suche Pönale muss den Artikel finden.');

const umlaut = searchHandbookArticles('Nutzlaenge');
requireCondition(umlaut.some((hit) => hit.article.id === 'nutzlaenge'), 'Suche ohne Umlaut muss Nutzlänge finden.');

requireCondition(searchHandbookArticles('x').length === 0, 'Ein-Zeichen-Suche darf nicht matchen.');
requireCondition(searchHandbookArticles('zzzz-kein-treffer').length === 0, 'Unbekannter Begriff ohne Treffer.');

const deep = resolveHandbookTarget({ articleId: 'deckungsbeitrag' });
requireCondition(deep.categoryId === 'gueter' && deep.articleId === 'deckungsbeitrag', 'Deep-Link muss Kategorie aus dem Artikel ableiten.');

const fallback = resolveHandbookTarget({ categoryId: 'personal' });
requireCondition(fallback.categoryId === 'personal' && fallback.articleId === HANDBOOK_CATEGORIES.find((c) => c.id === 'personal')?.articles[0]?.id, 'Kategorie-Deep-Link öffnet den ersten Artikel.');

const exclusive = searchHandbookArticles('Reputation 70');
requireCondition(exclusive.length > 0, 'Suche nach Exklusiv-Schwelle muss treffen.');

console.log('Handbuch-Suche und Kategorien: ok');
