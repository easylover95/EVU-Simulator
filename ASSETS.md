# Assets

**Art direction:** A premium, dark railway-operator tycoon interface set in a 2D headquarters office. The background remains an atmospheric office scene with a desk, rail map, binder wall, locomotive model and unobtrusive hotspots. Functional UI layers use deep navy and graphite glass panels, restrained blur, thin amber-gold borders, white primary copy and slate secondary copy. Information density is disciplined: a narrow KPI topbar, icon-led category rail or responsive tab strip, high-contrast option cards, qualification chips and explicit cost summaries. All monetary or status-changing actions terminate in a compact amber-accented confirmation modal with a visible effect and cost breakdown.

| Asset | Use | File / source | Status |
| --- | --- | --- | --- |
| EVU Tycoon UI reference | Visual QA target for the handbook and personnel workflows | `/home/ubuntu/webdev-static-assets/evu-tycoon-ui-reference.png` | Generated |
| Headquarters office background | Responsive 2D office context behind management UI | `public/assets/leitstelle_bg.webp`, `public/assets/leitstelle_bg-mobile.webp` | Optimized |
| Railway locomotive images | Responsive fleet and qualification images | `public/locos/responsive/*`, `public/wagons/responsive/*` | Optimized |

## Reference-image prompt

> Create a 16:9 in-game screenshot reference for a German railway-operator business simulation running as a 2D office dashboard. Subject: the headquarters office scene remains visible as a softly blurred background with a wide walnut desk, a railway network map on the wall, a brass desk lamp, file binders, a small locomotive model, and five subtle interactive hotspot markers. In the foreground, show a dark, premium, glassmorphism management interface. At top: a slim charcoal-black header with company name, balance KPI, reputation KPI, game date, and compact amber navigation tabs. Main foreground: a large handbook modal with a left vertical category rail for Start, Betrieb, Fuhrpark, Personal, Finanzen, and Hilfe; the active category Personal is glowing amber. The content area presents tabs for Einstellen and Baureihen, an explanatory gold-accented hero strip, and realistic card/table hierarchy. At the right edge, show a candidate card with qualification chips, cost summary and amber action button. Layered over it, show a small confirmation popup with a cost breakdown, training duration, cancel and confirm buttons. Use dark navy, graphite, smoked translucent panels and thin amber-gold borders.

## Implementation constraints

The reference image is an art-direction target, not a pixel-exact asset. The existing React/Tailwind components remain the source of runtime UI. New generated imagery is not required for this iteration because the feature is UI-led and the project already supplies the office and rolling-stock imagery. The reference image must not be committed to the application bundle.

## Visual acceptance criteria

| Area | Criterion |
| --- | --- |
| Handbook | Categories are visually scannable, the selected category has an amber state, and the content never reads as a single unstructured wall of copy. |
| Personnel | Candidate fit, missing series, quick-pay price and later training status are recognisable without reading long explanatory text. |
| Confirmations | The actual commit action is isolated inside a modal, with exact price, duration or immediate effect, and a secondary cancel action. |
| Responsiveness | The modal category rail degrades to a horizontal tab strip; tables and card grids remain usable at narrow widths. |

## Notes

The final UI must retain the existing application’s readable typography and accessible controls. Gold is reserved for navigation, primary actions and carefully scoped attention states; red and green remain semantic warning and success colours.


## Finanz-Cockpit

**Art direction addition:** The finance cockpit is a high-density but calm control-room surface. It uses four numeric metric cards, narrow statement tables, and an explicit balance-check indicator. Amber remains the only color for decisions and commitments; emerald, rose and cyan are purely semantic.

| Asset | Use | File / source | Status |
| --- | --- | --- | --- |
| Finance cockpit reference | Visual QA target for finance reporting | `assets/reference-route-finance-cockpit.png` | Generated — reference only |

### Visual acceptance criteria: finance

| Area | Criterion |
| --- | --- |
| Financial cockpit | Liquidity, operating result, outstanding debt and free credit room are separated as top-level KPIs. Positive cash/result uses emerald; cost/debt uses rose. |
| Statements | The GuV separates revenue, operating costs, personnel, financing and net result. The balance sheet presents assets, liabilities and equity with a visible **0 €** balance check. |
| Confirmations | Taking a loan and making a special repayment requires a cost/status confirmation modal. |

**Implementation constraint:** The generated screenshot is only an art-direction target and is not loaded by the game runtime. The financial cockpit is implemented as accessible TypeScript/HTML/CSS and is driven by the existing local game state.


## Leitstellenkarte: Live-Tracking-Überarbeitung

Die Leaflet-Karte orientiert sich nun funktional am vom Nutzer bereitgestellten Leitstellenreferenzbild: eine dunkle, leicht strukturierte Deutschlandkarte mit permanent lesbaren Knoten, dezent leuchtenden blau-cyanfarbenen Stammkorridoren und klar hervorgehobenen Live-Verbindungen. Aktive Zugläufe erhalten eine warme amberfarbene Glühspur und einen pulsierten Lokmarker; geplante Züge bleiben zurückhaltend cyan, abgestellte Fahrzeuge amber und Wartungsfahrzeuge rot. Die Karte zeigt weiterhin ausschließlich die vorhandenen, tickbasiert berechneten Simulationspositionen; sie simuliert kein externes GPS.

Der Erfolge-Hotspot ist auf den oberen rechten Dampflok-Holzrahmen positioniert. Seine Quellbildwerte sind verbindlich: `left: 14.2%`, `top: 16.4%`, `width: 11.0%`, `height: 9.8%`. Sein Rahmen verwendet dieselbe goldene Interaktionsbehandlung wie die Hauptkacheln für Firma und Finanzen.


## Schwerlast-Terminal-Leitstelle

**Art-direction addition:** Die Schwerlast-Leitstelle verwendet dieselbe dunkle Betriebsführungssprache mit graphitfarbenen Paneelen, feinen Stahlrasterlinien und selektiven Cyan-Datenakzenten. Bernstein signalisiert LÜ-Fracht und sicherheitsrelevante Aufmerksamkeit; Rot kennzeichnet ausschließlich harte Validierungssperren. Mobile Interaktionen setzen auf große Auswahlflächen und Bottom-Sheets statt auf Drag & Drop.

| Asset | Use | File / source | Status |
| --- | --- | --- | --- |
| Terminal UI visual target | Stilreferenz für Inbound- und Outbound-Leitstelle | `/home/ubuntu/terminal-ui-visual-target.png` | Generated — reference only |

**Implementation constraint:** Die Referenz wird nicht in das Produktionsbundle aufgenommen. Die Phase-4-Oberfläche wird mit bestehendem React, Tailwind und den vorhandenen Icon-Komponenten realisiert.
