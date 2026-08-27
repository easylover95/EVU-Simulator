# Entwicklungsroadmap: Schwerlast-Terminal Deutschland

**Stand:** 27. August 2026  
**Rolle:** Technical Lead Development  
**Grundlage:** Abgenommenes GDD „Schwerlast-Terminal Deutschland“

## Architekturleitlinie

Die Umsetzung folgt einer **domain-first**-Reihenfolge. Jede Regel wird zunächst als pure, testbare Funktion im Domänenkern festgelegt, danach in einer einzigen serverseitigen Mutationsgrenze durchgesetzt und erst anschließend in eine interaktive Oberfläche eingebunden. Auf diese Weise bleibt eine Zugbildung im UI schnell und erklärbar, während die finale Abfahrt dennoch nur auf einem konsistenten, transaktional geprüften Datensatz basiert.

> **Unverhandelbare Regel:** Abgeleitete Werte wie Zuglänge, Gesamtgewicht, Baustellenreihenfolge und LÜ-Abfahrtsfreigabe werden nicht von einer React-Komponente als Wahrheit gespeichert. Sie werden im Domänenkern berechnet und bei jeder schreibenden Servermutation erneut validiert.

| Phase | Ergebnis | Abhängigkeit | Risiko, das damit früh eliminiert wird |
|---:|---|---|---|
| 1 | Einheitliches Entitäts- und Persistenzvokabular. | Keine. | Unterschiedliche Feldnamen und unklare Relationen. |
| 2 | Testbarer Regelkern für Umschlag, Lagerung und Zugbildung. | Phase 1. | Unsichtbare fachliche Regelverstöße. |
| 3 | Atomare Speicherung, Reload und State-Synchronisierung. | Phase 1–2. | Doppelbelegung, Race Conditions und Client-Server-Abweichungen. |
| 4 | Responsive operative Arbeitsoberfläche. | Phase 1–3. | UI um falsche oder noch unfertige Datenverträge herum bauen. |
| 5 | Vollständiger Spieltag mit Aufträgen, Ereignissen und Abrechnung. | Phase 1–4. | Nicht balancierter bzw. nicht nachvollziehbarer Gameplay-Loop. |

## Phase 1 – Kanonische Kernentitäten und Datenverträge

Phase 1 definiert die Sprache, die **alle** folgenden Schichten verwenden. Sie liefert die strikt typisierten Entitäten `Terminal`, `CargoType`, `CargoUnit`, `Wagon`, `WagonLoad`, `Train` und `TrainEvent` mit stabilen ID-Typen und Status-Union-Types. Sie legt außerdem fest, welche Beziehungen per Fremdschlüssel und welche Werte nur abgeleitet gespeichert werden dürfen. Der Scope enthält bewusst keine UI-Logik und keine Berechnung.

| Codebereich | Zu implementierender Inhalt |
|---|---|
| `src/lib/terminalEntities.ts` | Exportierte Interfaces, IDs, Katalog- und Status-Union-Types sowie Datenbankbeziehungs-Kommentare. |
| `supabase/migrations/*_schwerlast_terminal_logistics.sql` | Tabellen, Fremdschlüssel, einfache Check-Constraints, Unique-Index für Wagenposition und Verknüpfungstabelle `wagon_loads`. |
| `src/lib/terminalLogistics.ts` | Re-export der kanonischen Typen, damit bestehende Regelaufrufe keinen parallelen Datentyp pflegen. |
| `scripts/testTerminalLogistics.ts` | Aktualisierte Fixtures, die den echten Phase-1-Datenvertrag erfüllen. |

**Definition of Done:** Die Typen werden durch `npm run typecheck` akzeptiert. Die Migration beschreibt sämtliche im GDD verlangten Tabellen einschließlich `trains.terminal_id` als notwendige Ergänzung für die Gleislängenvalidierung. Kein Kernobjekt referenziert ein anderes Objekt eingebettet; Beziehungen laufen nur über IDs.

## Phase 2 – Domänenkern und Business Rules

Phase 2 implementiert ausschließlich fachliche Regeln als pure Funktionen. Die zentrale Funktion `checkTrainFeasibility` erhält einen vollständigen, konsistenten Zug-Snapshot und gibt ein strukturiertes Ergebnis zurück: berechnete Zugkennzahlen, abfahrtsblockierende Fehler, nicht blockierende Hinweise und erforderliche LÜ-Ereignisse. Zusätzliche Funktionen prüfen Lagerflächen und einzelne Kranhübe. Jede Fehlerausgabe besitzt einen maschinenlesbaren Code und eine referenzierbare Entitäts-ID für die spätere UI-Fokussierung.

| Codebereich | Zu implementierender Inhalt |
|---|---|
| `src/lib/terminalLogistics.ts` | Zuglänge, Nutzlast, Wagenposition, Baustellenpriorität, Lagerfläche, Krantragfähigkeit und LÜ-Freigabepflicht. |
| `src/lib/terminalEvents.ts` | Zustandsübergänge für LÜ-Genehmigung, Inspektion und Abfahrt; keine Nebenwirkungen ohne validierten Snapshot. |
| `scripts/testTerminalLogistics.ts` | Positiv-, Negativ-, Randwert- und Reihenfolgetests je Regelgruppe. |
| `scripts/testTerminalEvents.ts` | Erlaubte und verbotene Übergänge des Zug-/Genehmigungsautomaten. |

**Definition of Done:** Die Tests decken mindestens zulässige Zugbildung, einzelne und summierte Überladung, Überlänge, doppelte/lückenhafte Positionen, falsche Baustellenreihenfolge, Kranüberschreitung, Lagerüberlauf sowie offenen und genehmigten LÜ-Fall ab. Die Funktionen führen weder Datenbankzugriffe noch React-State-Updates aus.

## Phase 3 – Persistenz, Transaktionen und State-Management

Phase 3 macht den Regelkern produktionsfähig. Ein Repository lädt die für eine Mutation benötigten Zeilen, eine Service-Funktion sperrt bzw. serialisiert die betroffenen Ressourcen, führt die Domänenprüfung erneut aus und schreibt Wagenzuordnung, Wagenladung, abgeleitete Zugwerte und Ereignisse atomar. Der Client erhält dabei immer einen frisch geladenen `TrainSnapshot` und niemals eine indirekt manipulierte Liste von Einzelobjekten.

| Codebereich | Zu implementierender Inhalt |
|---|---|
| `src/lib/terminalRepository.ts` | Supabase-Mapper zwischen `snake_case`-Zeilen und den Phase-1-TypeScript-Typen. |
| `src/lib/terminalService.ts` bzw. Edge Function | Transaktionale Mutation für Frachtumschlag, Wagenzuordnung, Beladung, Einreihung, LÜ-Antrag und Abfahrt. |
| `src/state/terminalStore.ts` | Clientseitiger Query-/Entwurfszustand, Cache-Invalidierung und Sync-Indikator; keine Regelkopie. |
| `src/lib/terminalSeed.ts` | Deterministische Demo-Daten für ein Terminal, drei Frachtarten, drei Wagenarten und einen Bauauftrag. |
| `scripts/testTerminalPersistence.ts` | Integrationsprüfungen für doppelte Wagen-/Frachtbelegung, Rollback und Reload. |

**Definition of Done:** Zwei konkurrierende Schreibversuche können nicht denselben Wagen oder dieselbe Frachtpartie reservieren. Jede erfolgreiche Mutation liefert einen Snapshot, dessen Kennzahlen aus dem Domänenkern stammen. Jeder nicht erfolgreiche Commit endet ohne Teilzustand.

## Phase 4 – UI-Grundgerüst und operative Zugbildung

Phase 4 setzt die bestehende UI/UX-Architektur als produktive React-Ansicht um. Die Desktop-Version nutzt Wagenpool, Zugband, Bauphasen-Panel und Prüfungsleiste; die mobile Ansicht verwendet dieselben Daten in einem Schrittfluss mit Bottom Sheets. Die Ansicht arbeitet zunächst als Entwurf und übergibt erst bei „Zur Inspektion“ oder „Abfahrt“ den Änderungsauftrag an den Service aus Phase 3.

| Codebereich | Zu implementierender Inhalt |
|---|---|
| `src/views/TerminalOperationsView.tsx` | Leitstand mit KPIs, kritischen Aktionen, Ankünften und Auslastung. |
| `src/views/TrainFormationView.tsx` | Wagenpool, Reihung, Ladungszuordnung, Bauphasen und kontextbezogene Prüfung. |
| `src/components/terminal/*` | `FormationTrack`, `FormationWagonCard`, `FeasibilityPanel`, `CargoAssignmentSheet`, `LueApprovalPanel`. |
| `src/App.tsx` und Router-/View-Regie | Zentraler Zugriff auf Snapshots und Mutationscallbacks, Navigationspunkt „Terminal“. |
| `src/index.css` | Responsive Grid-, Karten-, Status- und Sheet-Muster im bestehenden visuellen System. |

**Definition of Done:** Ein Nutzer kann einen Demo-Bauzug ohne Drag-and-drop-Zwang auf Desktop und Mobil erstellen, die Ursache jedes Fehlers fokussieren und einen genehmigten Zug in die Inspektion überführen. Keine UI-Komponente berechnet abfahrtsrelevante Kennzahlen eigenständig.

## Phase 5 – Gameplay-Loop, Wirtschaft, Ereignisse und Balancing

Phase 5 verbindet Terminaloperationen zu einem spielbaren Wirtschaftskreislauf. Der Simulations-Tick erzeugt Ankünfte und Baugleisabrufe, verändert Liege- und Lagerkosten, bearbeitet Genehmigungen und löst Sperrpausen aus. Abrechnung und Vertragsarchive buchen Umsatz, Kosten, Boni, Strafzahlungen, Reputation und Fortschritt nachvollziehbar. Jeder Ereignistyp liefert Vorwarnzeit, Entscheidungsmöglichkeit und eine protokollierte Auswirkung.

| Codebereich | Zu implementierender Inhalt |
|---|---|
| `src/lib/terminalMarket.ts` | Spotaufträge, Projektabrufe, Anforderungen, Vergütungsbänder und Verfallszeitpunkte. |
| `src/lib/terminalEconomy.ts` | Liegegebühren, Kran- und Lagerkosten, Zugbildungsentgelt, Bonus-/Straflogik und Buchungstexte. |
| `src/lib/terminalTick.ts` | Ankünfte, Fristen, Genehmigungsdauer, Sperrpausen und Zustandsfortschreibung. |
| `src/lib/terminalProgression.ts` | Ausbauvoraussetzungen, Fachruf und Freischaltungen ohne Pay-to-win-Skalierung. |
| `simulation/runTerminalYear.ts` | Mehrfachläufe für Cashflow, Auftragsqualität, Engpässe und Progressionsdauer. |
| `src/views/TerminalProjectArchiveView.tsx` | Zugakte, Projektmeilensteine, Abrechnung und ereignisbezogene Nachvollziehbarkeit. |

**Definition of Done:** Ein Startterminal kann mindestens einen vollständigen Bauauftrag von Inbound bis Abrechnung durchführen. Fehlplanung führt zu nachvollziehbaren Kosten oder Umplanung, aber nicht zu einem unerklärten Reset. Eine Balancing-Simulation belegt, dass fünf bis acht erfolgreiche Frühspielaufträge einen ersten sinnvollen Ausbau ermöglichen.

## Implementierungsreihenfolge und Übergabe

Die Phasen werden strikt nacheinander abgeschlossen. Phase 2 startet erst, wenn Phase 1 typisiert, migriert und testbar ist. Phase 4 wird nicht mit Mock-Regeln vervollständigt, bevor Phase 3 eine autoritative Mutation anbietet. In jedem Pull Request wird die fachliche Regel oder die UI-Funktion anhand einer konkreten `Definition of Done` geprüft. So bleiben Änderungsfolgen klein, rückverfolgbar und im Fehlerfall isolierbar.
