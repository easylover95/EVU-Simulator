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


---

# Game Plan: Streckennetz, Fahrplan & Finanzmanagement

## Risk Tasks

### 1. Fahrplan darf keine Dispositionsprüfung umgehen

- **Why isolated:** Ein grafischer Fahrplan kann fälschlich als operative Zuweisung missverstanden werden. Dann könnten Fahrten ohne Lok, Tf, Wagen, Baureihen-, ETCS-, Ruhezeit- oder Streckensperren-Prüfung in den Spielzustand gelangen.
- **Approach:** Route und Fahrplan werden als getrennte Planungsschicht gespeichert. Die Auswahl eines Eintrags kann nur vorbefüllen und zur bestehenden Disposition führen. Ausschließlich `handleLocalAssign` erstellt eine Assignment-Instanz und verändert Auftrag, Lok, Wagen und Personal.
- **Verify:** Das Anlegen, Ändern und Löschen von Planungseinträgen verändert weder Kontostand noch Status von Auftrag, Lok, Wagen oder Personal. Der Start einer Fahrt aus der Planung durchläuft weiterhin alle bestehenden Blockaden.

### 2. Bilanz und GuV müssen Schuldendienst korrekt trennen

- **Why isolated:** Der aktuelle Tagesdienst einer Kreditrate enthält Tilgung und Zins. Wenn die gesamte Rate in der GuV als Zins erscheint, werden Ergebnis, Fremdkapital und Eigenkapital falsch dargestellt.
- **Approach:** Neue Darlehen speichern Resttilgung und Restzinsen getrennt. Der Takt bucht Kreditaufnahme als Finanzierung, Tilgung als Bilanzbewegung und Zinsen als GuV-Aufwand. Altstände werden beim Laden verlustfrei normalisiert.
- **Verify:** Eine Kreditaufnahme erhöht Liquidität und Kreditverbindlichkeit, jedoch nicht Umsatz oder Gewinn. Eine tägliche Rate reduziert Liquidität und Restschuld; nur ihr Zinsanteil vermindert das GuV-Ergebnis. Die Bilanzdifferenz bleibt 0 €.

### 3. Jede neue Verpflichtung erhält eine zweistufige Bestätigung

- **Why isolated:** Kreditaufnahme, Sondertilgung, Dispo-Anpassung, Versicherung und gespeicherte Fahrplanänderungen haben Geld-, Liquiditäts- oder Betriebsfolgen.
- **Approach:** Die erste Aktion öffnet ausschließlich eine Vorschau. Der sichtbare Primärbutton im Modal führt den zentralen Commit-Callback aus. Abbruch verwirft nur lokale UI-Auswahl.
- **Verify:** Ein Abbruch verändert keine Daten. Die Bestätigung zeigt den konkreten Betrag, Zins beziehungsweise Laufzeit, die erwartete Statusfolge und bei Finanzaktionen den Liquiditätseffekt.

## Main Build

Der neue Transportbereich erhält die Ansicht **Streckennetz & Fahrplan**. Sie verwendet die vorhandenen Stationen und Stammkorridore als feste Betriebsgraphik, ermöglicht die Wahl verbundener Knoten, ermittelt den Pfad und die Distanz, speichert benannte Routen und legt zeitgebundene, aber noch nicht disponierte Fahrplanzeilen an. Die Darstellung bleibt ein zugänglicher SVG-Graph mit einem kompakten Tagesband, nicht eine neue Karten-Engine.

Das Finanzmodul wird zu einer Management-Sicht ausgebaut. Oberhalb der Tabellen stehen Liquidität, operatives Ergebnis, Verbindlichkeiten und freier Kreditrahmen. Die GuV gliedert Frachterlöse, Betrieb, Personal, Standort/Leasing, Finanzierung und Ergebnis. Die Bilanz zeigt Cash/Fuhrpark, Kredit- und Dispo-Verbindlichkeiten sowie eine explizite Eigenkapital- und Differenzzeile. Der Bankbereich erhält nachvollziehbare Kreditbedingungen, getrennte Restschuld- und Zahlungsangaben sowie verpflichtende Sicherheitsmodals.

- **Assets needed:** `assets/reference-route-finance-cockpit.png` nur als visuelle QA-Referenz. Keine generierte Laufzeitkarte, da die Karten- und Netzwerkdarstellung als funktionaler SVG-Graph aus Spielzustand entsteht.
- **Verify:**
  - Der Netzwerkeditor zeigt nur kanonische, verbundene Stationen und speichert keine ungültigen Pfade.
  - Der Fahrplan stellt Einträge auf einer Tagesachse dar, ohne die laufenden Tracking-Daten zu überschreiben.
  - Jeder Planungs- und Finanz-Commit hat ein isoliertes Bestätigungsmodal mit sichtbarer Auswirkung.
  - Die GuV zählt Kapitalaufnahme und Tilgung nicht als operativen Ertrag/Aufwand.
  - Aktivseite, Passivseite und Eigenkapital ergeben jederzeit eine Bilanzdifferenz von 0 €.
  - TypeScript-Prüfung, Produktions-Build und `git diff --check` bestehen; die Kerndomänenfunktionen werden anhand repräsentativer Zustände geprüft.

## Constraints

Der vorhandene React/Vite-Stack, die lokale Speicherung und die `App.tsx`-Mutationsebene bleiben bestehen. Bestehende Leaflet-Live-Karte und die Disposition werden nicht ersetzt. Das neue Streckennetz nutzt bewusst keine externen Streckendaten oder Echtzeitfahrplandaten; es ist ein Spielplanungswerkzeug auf Basis der vorhandenen kanonischen Stationen und Korridore.
