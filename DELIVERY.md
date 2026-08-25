# Übergabe: Handbuch- und Personalverwaltung

## Ergebnis

Der EVU-Simulator verfügt nun über ein **strukturiertes Betriebs-Handbuch** mit Kategorien und ein deutlich klareres Personalmanagement im dunklen, amber-akzentuierten Glasmorphismus-Stil. Die Umsetzung bleibt vollständig im bestehenden React/TypeScript-Stack und verwendet die vorhandenen Domänenregeln für Kosten, Baureihen und Training.

| Bereich | Umsetzung |
| --- | --- |
| Handbuch | Sechs Kategorien mit responsiver Register-Navigation: Einstieg, Betrieb, Fuhrpark, Personal, Finanzen und Hilfe. Die Personal-Kategorie enthält zusätzlich einen dreistufigen Entscheidungsweg für Fuhrpark-Fit und Baureihen. |
| Kandidatenprüfung | Jede Börsenkarte zeigt Rolle, vorhandene Baureihen, Fuhrpark-Fit, fehlende Freigaben, Einstellungsgebühr und Monatsgehalt. |
| Quick-Pay-Nachschulung | Fehlende Baureihen können beim Einstellen als unmittelbar wirksames Gesamtpaket ausgewählt werden. Der Preis wird aus der vorhandenen Domain-Funktion abgeleitet. |
| Reguläre Schulung | Die Auswahl einer Baureihe zeigt Kosten, Dauer und die Auswirkung „nicht einsetzbar“. Die Buchung ist von der Auswahl getrennt. |
| Sicherheitsdialoge | Einstellung, Quick-Pay-Paket, reguläre Baureihenschulung und Ersatzattest benötigen jetzt jeweils eine explizite Bestätigung mit Wirkung und Kosten beziehungsweise Statusfolge. |
| Design | Neue Komponenten verwenden die bestehende Graphit-/Navy-Glasoptik, amberfarbene Primäraktionen, semantische Statusfarben und responsive Karten. |

## Betroffene Dateien

| Datei | Änderung |
| --- | --- |
| `src/components/HelpHandbookModal.tsx` | Komplett zu einem kategorisierten Handbuch mit Register-Navigation ausgebaut. |
| `src/views/PersonnelView.tsx` | Kandidatenprüfung, Quick-Pay-Paket, Trainingsauswahl und verbindliche Bestätigungsdialoge ergänzt. |
| `src/index.css` | Responsive Handbuch-Register, Entscheidungskarten, Kandidaten-Karten und Dialoghierarchie ergänzt. |
| `ASSETS.md` | Visuelles Zielbild und Gestaltungsregeln dokumentiert. |
| `PLAN.md`, `STRUCTURE.md`, `MEMORY.md` | Wiederaufnahmefähige Umsetzungs-, Architektur- und Prüfnotizen angelegt. |

## Qualitätssicherung

Die TypeScript-Prüfung mit `./node_modules/.bin/tsc --noEmit -p tsconfig.app.json` ist erfolgreich durchgelaufen. Der Produktions-Build mit `./node_modules/.bin/vite build` ist ebenfalls erfolgreich. `git diff --check` meldete keine Whitespace-Fehler.

> Der Build weist weiterhin auf einen bestehenden Haupt-Chunk oberhalb von 500 kB hin. Die Warnung blockiert weder den Build noch die neuen Features. Eine spätere Optimierung kann große Ansichten wie Karten- oder 3D-Module per dynamischem Import abtrennen.

## Anwendung des Patches

Falls die Änderungen in eine andere Arbeitskopie übernommen werden sollen, kann der beiliegende Patch aus dem Repository-Wurzelverzeichnis angewendet werden:

```bash
git apply evu-handbuch-personal-update.patch
```
