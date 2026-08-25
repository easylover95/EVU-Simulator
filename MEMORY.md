# Implementation Memory: Handbuch & Personalverwaltung

## Delivered in this iteration

The former compact handbook has been replaced with a category-led interface in `src/components/HelpHandbookModal.tsx`. It now has six navigable categories, a responsive rail-to-tab layout, focused explanatory cards and a dedicated Personal decision map. The text is tied to existing gameplay mechanics: disposition, rest periods, maintenance, ETCS, depot capacity, job-board fit, Quick-Pay coverage and time-bound training.

The personnel workflow in `src/views/PersonnelView.tsx` now distinguishes discovery from commitment. A candidate card exposes role, free series, fleet fit, gaps and estimated Quick-Pay cost. Hiring has two guarded stages: first select the hiring path, then confirm the financial effect. The regular series-training flow has the same staged pattern. The existing `App.tsx` callbacks remain the only mutation owners. The pre-existing shortcut for an Ersatzattest is now also routed through a status-change confirmation dialog.

## Domain rules preserved

| Rule | Existing source of truth | UI behaviour |
| --- | --- | --- |
| Missing fleet series | `missingFleetSeries` | Candidate and employee records show the same gaps used by the simulation. |
| Quick-Pay price | `hireNachschulungFee` | The preview price and the eventual recruitment action use the same cost formula. |
| Regular series course | `seriesTrainingQuote` | Cost and duration are previewed before confirmation; `App.tsx` still changes the staff record. |
| Affordability | `canSpend` and `App.tsx` callbacks | Action buttons visibly block impossible purchases, while the commit layer validates independently. |
| Training completion | `completeDueTraining` | No new completion logic was added; scheduled training remains tick-driven. |

## Validation

The final TypeScript check passed via `./node_modules/.bin/tsc --noEmit -p tsconfig.app.json`. The final production build passed via `./node_modules/.bin/vite build`, and `git diff --check` reported no whitespace errors. Vite emitted an existing size warning for the main JavaScript chunk above 500 kB; it does not block the build. The application start screen was captured successfully in a local Chromium session. Fully automated modal navigation was not retained as a verification artefact because the isolated browser session’s pre-existing first-run overlay prevented stable UI-level interaction; the source, type and build checks are clean.

## Follow-up opportunities

Future work can extract the growing personnel dialogs into dedicated components once more HR features are added. The build warning can be addressed separately with route-level dynamic imports for large map or 3D modules; it is unrelated to this UI iteration.
