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


---

# Implementation Memory: Streckennetz, Fahrplan & Finanzmanagement

## Delivered in this iteration

The transport section now contains **Streckennetz & Fahrplan**. `routeNetwork.ts` converts the fixed canonical stations and trunk corridors into a validated graph, derives a shortest route, persists named route plans and stores noncommitted timetable entries. `NetworkPlannerView.tsx` renders the graph as an accessible SVG surface, presents a daily service strip and requires an explicit confirmation before any route or timetable state is saved or deleted. A timetable entry deliberately does not create an assignment; it opens the existing Disposition so all locomotive, crew, wagon, Brh, ETCS, rest-period and closure checks remain mandatory.

The bank domain now distinguishes **loan drawdown**, **principal repayment**, **interest expense** and **investment cash flow**. New `BankLoan` records retain principal and interest remaining separately. Legacy loans are normalized on load. Daily credit service writes separate interest and repayment bookings. `financialStatements.ts` derives a management GuV, balance sheet, liquidity, debt, free credit room and debt service from the existing game state. The balance-sheet equity is the residual management-book equity, so the visible balance check is always a direct `assets − liabilities − equity` control.

The Bank view now uses staged confirmation for loan drawdowns, overdraft changes, insurance status and special repayments. The Finance view has a liquidity / operating-result / debt / credit-room cockpit, 30-day GuV, separated financing and investment cashflow information, and an explicit management balance sheet. Fleet values are derived from the existing dealer catalogue; leased assets are excluded.

## Validation

The domain smoke test in `scripts/routeFinanceSmoke.ts` passed through the project TypeScript runtime. It validates a canonical route and timetable window, the split of daily debt service into principal and interest, exclusion of repayment from GuV net income, and a zero balance-sheet difference. The final `tsc --noEmit`, production Vite build and `git diff --check` also passed. The Vite build still emits the pre-existing large-main-chunk warning; it does not block the application.

The isolated browser session could load the application, but its hierarchical navigation did not expose a stable testable subnavigation state after the local first-run profile bootstrap. No mutable operation was executed in the visual session, and no visual test artefact was retained. The source, domain smoke test, type check and production build are clean.

## Known modeling boundaries

The reports are **management accounting for the game**, not statutory accounting. There is no tax, receivables, depreciation schedule or historical opening-equity ledger in the existing simulation. The balance sheet therefore uses live cash, current dealer-derived owned fleet value, active principal debt, overdraft and residual management-book equity. This scope is intentional and documented in `STRUCTURE.md`.


## Decommission note: Streckennetz & Fahrplan

The player-facing **Streckennetz & Fahrplan** area was removed after product review because its stored route and timetable intentions did not cause a direct operational effect and therefore added avoidable interface complexity. `src/lib/routeNetwork.ts`, `src/views/NetworkPlannerView.tsx`, the related `App.tsx` persistence/callback layer and the navigation item were removed. Existing Disposition, Tourenplaner and Leaflet live tracking continue to own operational assignment and location visibility.
