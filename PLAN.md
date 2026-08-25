# Game Plan: EVU-Simulator – Handbuch & Personalverwaltung

## Risk Tasks

### 1. Zahlungs- und Statussicherheit bei kombinierten Personalaktionen

- **Why isolated:** Eine Einstellung mit Quick-Pay-Nachschulung kombiniert mehrere Folgen: einmalige Zahlung, neue Personalakte, neue Baureihen-Freigaben und Entfernung aus der Tagesbörse. Eine falsche Reihenfolge könnte Teilzustände oder einen Fehlklick ohne eindeutige Bestätigung verursachen.
- **Approach:** Die bestehende zentrale Aktion `handleRecruit` bleibt die einzige Quelle der Zustandsänderung. Die Oberfläche berechnet eine Vorschau aus denselben Domänenfunktionen und ruft die Aktion erst aus einem dedizierten Bestätigungsdialog auf. Sofort-Nachschulung fügt die fehlenden Fuhrpark-Baureihen direkt zur Personalakte hinzu; die reguläre Einzelschulung bleibt zeitgebunden und pausiert den Tf.
- **Verify:** Abbrechen verändert weder Kontostand, Börse noch Personalbestand. Bestätigen einer Standard-Einstellung belastet nur die Einstellungsgebühr. Bestätigen einer Quick-Pay-Einstellung belastet Gebühr und Nachschulung genau einmal und zeigt die fehlenden Freigaben anschließend im Mitarbeiterprofil. Unzureichende Mittel sperren die bestätigende Aktion sichtbar.

## Main Build

Ein kategoriales Handbuch ersetzt die flache Themenliste. Es enthält die Bereiche Einstieg, Betrieb, Fuhrpark, Personal, Finanzen und Hilfe, eine kompakte Inhaltsübersicht und gezielt ausführliche Personalinformationen. Die Navigation ist auf Desktop als Icon-Leiste und auf schmalen Ansichten als horizontale Registerleiste lesbar. Die Themen erklären bereits implementierte Mechaniken ohne neue Regeln zu erfinden.

Die Personalansicht erhält einen klaren Entscheidungsfluss für Kandidaten: Fuhrpark-Fit, bekannte Baureihen, fehlende Freigaben, Einstellungskosten und der Quick-Pay-Preis werden vor der Buchung sichtbar. Die reguläre Nachschulung wird als Auswahlansicht mit je Baureihe ausgewiesen; die tatsächliche Buchung ist davon getrennt und muss bestätigt werden. Aktive Schulungen bleiben als Status an der Personalakte sichtbar.

- **Assets needed:** Die generierte UI-Referenz unter `/home/ubuntu/webdev-static-assets/evu-tycoon-ui-reference.png`; keine neue Laufzeitgrafik erforderlich, da die Erweiterung UI-zentriert ist und existierende Büro- und Lok-Bilder verwendet.
- **Verify:**
  - Das Handbuch öffnet, schließt und wechselt Kategorien ohne Hintergrundinteraktion oder Überlauf.
  - Die Kategorie Personal erklärt Einstellung, Fuhrpark-Fit, Quick-Pay und reguläre Baureihenschulung in konsistenter Terminologie.
  - Kandidatenkarten zeigen Qualifikationen, Fuhrpark-Fit, Kosten und fehlende Freigaben in einer direkt scannbaren Reihenfolge.
  - Jede zahlungs- oder statusverändernde Personalaktion besitzt einen isolierten Bestätigungsdialog mit Effekt, Preis und sekundärer Abbruchaktion.
  - Alle Buttons sind erreichbar, Tastaturfokus bleibt sinnvoll im Dialog, und die mobile Ansicht verhindert horizontalen Layoutbruch.
  - Die TypeScript-Prüfung besteht, der Produktions-Build erstellt sich, und der laufende Browser zeigt keine Laufzeitfehler.
  - Referenzbild-Konsistenz: dunkelblaues Graphitglas, sparsame Amber-Akzente, klare Informationshierarchie und sichtbare Kostenentscheidungen.

## Constraints

Der vorhandene Vite/React-Stack und die lokale Web-App-Struktur bleiben erhalten. Es wird kein Babylon- oder neuer 3D-Canvas integriert, da der laufende Simulator bereits eine 2D-Büro-UI besitzt und die angeforderten Features verwaltungsorientiert sind.
