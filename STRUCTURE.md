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


---

# Architecture: Finanz-Cockpit

## Ownership model

The finance expansion keeps the existing **single mutation boundary**. `App.tsx` owns every persisted state transition; views own only temporary selection and modal state. An assignment remains the only object that marks an order as dispatched, changes a locomotive/driver status or starts cost settlement. Financial statements are derived from the same bank state, company balance and fleet state already used by the simulation; they never create a second cash account.

| Layer | New or extended owner | Responsibility |
| --- | --- | --- |
| Dispatch commit | `src/App.tsx` / existing `handleLocalAssign` | Remains the sole point that creates an assignment and changes fleet, personnel or order status. |
| Debt and booking engine | `src/lib/bank.ts` | Classify loan drawdown, principal repayment and interest separately; process daily debt service; retain migration support for legacy loans. |
| Financial statements | `src/lib/financialStatements.ts` | Calculate management GuV, balance sheet, liquidity and leverage KPIs from live game state. The balance-sheet difference is always exposed and must equal zero. |
| Finance reporting UI | `src/views/FinanceView.tsx` | Render the management cockpit, GuV and balance sheet; contains no balance-changing action. |
| Bank action UI | `src/views/BankView.tsx` | Preview credit, special repayment, overdraft or insurance effects and call an App callback only after a dedicated confirmation dialog. |

## Finance model

The finance layer is a **management accounting view**, not tax or statutory accounting. Amounts are in whole euros and are aligned to the game tick. Loan drawdowns are financing cash inflows, principal repayments are financing cash outflows, and interest is a financing expense. Consequently, GuV never treats a complete loan instalment as interest expense.

| Statement / metric | Source and treatment |
| --- | --- |
| GuV revenue | Bank bookings of type `fracht`. |
| Operating costs | `betrieb`, `leasing`, `gehalt`, `standort`, `versicherung`, `strafe` and other operating bookings. |
| Financing expense | Interest and overdraft interest only. Loan principal repayment is excluded from GuV. |
| Cash / overdraft | Company balance. A positive value is cash; a negative value is a short-term liability. |
| Fleet assets | Current owned locomotives and wagons valued through the existing dealer catalogue. Leased assets are excluded. |
| Loan liability | The outstanding principal per active loan, not the remaining contractual cash payment. |
| Equity | Net assets after liabilities, disclosed as management-book equity because historical opening equity and acquisition history predate this module. |
| Balance check | `assets − liabilities − equity`; any non-zero result is a defect and is rendered as an alert. |

## Debt-service and migration rule

New loans carry `principalRemaining`, `interestRemaining` and total `remaining`. Each daily payment is split into principal and interest before bookings are written. Legacy loans are normalised on load by deriving the unallocated interest as `max(0, remaining − principal)` and treating the residual as principal. This preserves existing saves while allowing correct prospective GuV reporting. A drawdown adds a `kreditaufnahme` booking, principal service a `tilgung` booking and interest a `zinsen` booking.

## Confirmation state machines

| Flow | Preview state | Commit state | Commit callback |
| --- | --- | --- | --- |
| Take loan | Principal, term, payment, interest, total repayment | Confirm credit drawdown | `onTakeLoan` |
| Change overdraft | Old vs. new limit and rate | Confirm limit change | `onSetOverdraft` |
| Special repayment | Loan, principal outstanding, cash effect | Confirm repayment | `onRepayLoan` |
| Toggle insurance | Daily premium and activation/cancellation status | Confirm status change | `onToggleInsurance` |

All confirmation dialogs use a scrim, explicit cancel button, concrete effect summary and a single highlighted commit action. No amount- or status-changing action is committed from the first click.
