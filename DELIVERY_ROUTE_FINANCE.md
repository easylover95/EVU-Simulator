# Übergabe: Streckennetz, Fahrplan & Finanzmanagement

## Ergebnis

Der EVU-Simulator besitzt nun einen eigenständigen Arbeitsbereich **„Streckennetz & Fahrplan“** sowie ein ausgebautes **Finanz-, Bilanz-, GuV- und Kreditmanagement**. Beide Bereiche folgen dem bestehenden Frachtimperium-Stil mit dunklen Glasflächen, amberfarbenen Commit-Aktionen, semantischen Statusfarben und isolierten Sicherheitsdialogen.

| Bereich | Umsetzung |
| --- | --- |
| Streckennetz | Interaktiver, zugänglicher SVG-Graph auf Basis der vorhandenen kanonischen Stationen und Stammkorridore. Die Planung leitet automatisch einen validen kürzesten Pfad und die Streckenlänge ab. |
| Routenarchiv | Benannte Routen werden lokal gespeichert, können ausgewählt und nach einer expliziten Sicherheitsbestätigung gelöscht werden. |
| Fahrplan | Vorgemerkte Zugläufe erscheinen auf einer Tagesachse mit Abfahrt, Ankunft, Auftrag und Route. Einträge bleiben bewusst planend; sie erzeugen keine Assignment-Instanz. |
| Disposition | Ein Fahrplanauftrag öffnet die vorhandene Disposition. Lok-, Personal-, Wagen-, Baureihen-, Brh-, ETCS-, Ruhezeit- und Sperrenprüfungen bleiben unverändert obligatorisch. |
| Management-GuV | 30-Spieltage-Sicht für Frachterlöse, Betrieb, Leasing, Personal, Standort, Versicherung, Zinsaufwand, Strafen und Ergebnis. |
| Bilanz | Managementbilanz mit Liquidität, Fuhrpark-Sachanlagen, Dispo, offener Kreditrestschuld, Eigenkapital und sichtbarer Bilanzdifferenz. |
| Kreditmanagement | Kreditaufnahme, Dispo-Änderung, Versicherung und Sondertilgung sind zweistufig abgesichert. Aktive Kredite zeigen Restschuld, Restzinsen und Tagesrate getrennt. |
| Buchungslogik | Kreditaufnahme, Tilgung, Zinsen und Investitionen werden separat kategorisiert. Tilgung und Investitionscashflow verfälschen das GuV-Ergebnis nicht. |

## Fachliche Grundlage

Die Bilanz ist als **Managementsicht des Spielzustands** konzipiert. Sie verwendet ausschließlich vorhandene Simulationsdaten: positiven Kontosaldo als liquide Mittel, dealerbasierte Werte für eigene Lokomotiven und Wagen, Dispo, aktive Kreditrestschuld sowie daraus abgeleitetes Eigenkapital. Leasing-Fahrzeuge sind nicht in den Sachanlagen enthalten. Es gibt bewusst keine Steuer-, Forderungs-, Abschreibungs- oder historische Eröffnungsbilanzlogik, da diese Daten im bisherigen Spielmodell nicht existieren.

> Kreditaufnahme ist ein Finanzierungscashflow. Tilgung reduziert Liquidität und Kreditrestschuld. Nur der Zinsanteil wird als Aufwand in der GuV erfasst.

## Betroffene Dateien

| Datei | Änderung |
| --- | --- |
| `src/lib/routeNetwork.ts` | Persistenter Routen- und Fahrplan-Graph, Pfadsuche, Validierung und Zeitfensterbildung. |
| `src/views/NetworkPlannerView.tsx` | SVG-Streckennetz-Editor, Routenarchiv, Tagesfahrplan und Planungsbestätigungen. |
| `src/lib/financialStatements.ts` | Abgeleitete Management-GuV, Bilanz, Liquiditäts- und Kreditkennzahlen. |
| `src/lib/bank.ts` | Kreditmigration sowie getrennte Kategorien für Aufnahme, Tilgung, Zinsen und Investition. |
| `src/views/FinanceView.tsx` | Finanz-Cockpit, GuV, Bilanz und Cashflow-Hinweise. |
| `src/views/BankView.tsx` | Sicherheitsmodale und detailliertere Restschuld-/Restzinsanzeige. |
| `src/App.tsx`, `src/lib/navigation.ts` | Zentraler Planungszustand, Commit-Callbacks, Navigation und Finanzdatenübergabe. |
| `scripts/routeFinanceSmoke.ts` | Zustandsfreier Domänen-Smoketest. |
| `ASSETS.md`, `PLAN.md`, `STRUCTURE.md`, `MEMORY.md` | Visuelles Zielbild, Entscheidungsregeln, Architektur und Wartungswissen. |

## Qualitätssicherung

| Prüfung | Ergebnis |
| --- | --- |
| Domänen-Smoketest | Erfolgreich. Validiert Routenkonstruktion, Fahrplanfenster, Kreditdienst-Split, GuV-Abgrenzung und Bilanzdifferenz. |
| TypeScript | Erfolgreich mit `./node_modules/.bin/tsc --noEmit -p tsconfig.app.json`. |
| Produktions-Build | Erfolgreich mit `./node_modules/.bin/vite build`. |
| Diff-Prüfung | Erfolgreich mit `git diff --check`. |

Der Produktions-Build meldet weiterhin die bereits bekannte Warnung zum großen Haupt-Chunk über 500 kB. Sie blockiert den Build nicht. Für eine spätere Optimierung können große Ansichten per dynamischem Import getrennt geladen werden.

## Prüfhinweis

Die visuelle Referenz unter `assets/reference-route-finance-cockpit.png` dient ausschließlich als Stilziel und wird nicht zur Laufzeit gebündelt. Die lokale Browserprüfung konnte nach der Erstprofil-Initialisierung keine stabile hierarchische Untermenünavigation automatisieren; deshalb wurde kein klickender UI-Test als Nachweis beibehalten. Die Codepfade, der Domänen-Smoketest, die Typprüfung und der Produktions-Build sind erfolgreich.
