# Architecture: EVU-Simulator – Handbuch & Personalverwaltung

## Ownership model

The simulator remains a React/Vite application. The UI layer is responsible for rendering and temporary interaction state only. Existing domain modules remain authoritative for all game rules and mutations. `App.tsx` continues to own runtime company, staff, fleet and job-board state, because it already reconciles local persistence, Supabase persistence and the simulation clock in one place.

| Layer | Existing owner | Responsibility after this iteration |
| --- | --- | --- |
| Application state and commits | `src/App.tsx` | Supply data to views; apply the only state-changing callbacks for recruitment and training; book money, persist staff and halt the clock while higher-level overlays are open. |
| Personnel domain | `src/lib/personal.ts` | Determine fleet-series coverage and gaps, compute training quotes and hire-time Quick-Pay fees, and provide labels. No presentation logic belongs here. |
| Personnel persistence | `src/lib/jobcenter.ts` | Represent job listings and staff metadata, construct recruits, remove filled offers and complete time-based regular series training. |
| Handbook UI | `src/components/HelpHandbookModal.tsx` | Own selected category and render deterministic topic metadata. It exposes no money or game-state action beyond tutorial replay and close. |
| Personnel UI | `src/views/PersonnelView.tsx` | Own selected candidate, selected driver, selected series and the staged confirmation state. It computes previews from domain helpers, then calls the `App.tsx` callbacks only after confirmation. |
| Shared visual language | `src/index.css`, `src/components/ui.tsx` | Supply the glass surfaces, table patterns, Amber primary action hierarchy and accessible button styles. |

## Personnel interaction state

The personal view models a deliberate UI state machine rather than directly committing from a card click.

| UI state | Trigger | Allowed outcome | Commit callback |
| --- | --- | --- | --- |
| Job-board browsing | Initial view | Inspect candidate and select “Einstellung prüfen” | None |
| Hire preview | Candidate selected | Cancel or choose standard hire / Quick-Pay package | None |
| Hire confirmation | Action package selected | Cancel or confirm | `onRecruit(listing, withFleetTraining)` |
| Training selection | “Schulung” for eligible Tf | Select a missing series or close | None |
| Training confirmation | Series selected | Cancel or confirm | `onStartTraining(driverId, seriesId)` |
| Training active | Regular training started | Display only until the simulation completes it | Simulation tick and `completeDueTraining` |

Every state-changing choice is therefore separated from its final commit. `onRecruit` remains atomic from the UI’s perspective: it handles affordability, debit, staff creation, metadata creation and job-board removal. `onStartTraining` remains atomic for normal training: it books the selected quote, marks the training record and pauses the driver.

## Handbook information model

Handbook content is declarative metadata, grouped by category. Categories use short operational descriptions and dedicated records; content must cite only gameplay rules that exist in code. The Personal category receives a compact decision map explaining the difference between immediate Quick-Pay coverage and time-bound regular training.

```text
HelpHandbookModal
 ├─ handbook category navigation
 ├─ selected-category header and overview
 ├─ topic cards / operational table
 └─ footer actions (replay tutorial, close)

PersonnelView
 ├─ job board and candidate cards
 ├─ personnel KPIs and current staff table
 ├─ HirePreviewModal
 │   └─ HireConfirmationModal
 ├─ TrainingSelectionModal
 │   └─ TrainingConfirmationModal
 └─ DriverDetailModal
```

## Responsive and accessibility rules

A semantic button owns each interactive tab, action and close control. The current category is marked with `aria-pressed` or the corresponding tab state; all dialogs retain `role="dialog"`, an accessible label and a click barrier. On desktop, handbook categories appear in a narrow vertical rail. On small screens, that rail becomes an overflow-safe horizontal tab row before content. No confirmation dialog is closed by accidental action on its underlying card; it must use its own scrim and explicit cancel button.

## Data integrity rules

The UI must never reimplement price calculations. Candidate Quick-Pay amounts use `hireNachschulungFee(missing.length)` and regular sessions use `seriesTrainingQuote(seriesId)`. Missing series are always resolved through `missingFleetSeries`, including any recognised text qualification. Displayed capability chips are cosmetic; `App.tsx` callbacks independently validate the commit before writing state.
