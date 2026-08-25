# UI-Prüfung Transparenzfunktionen

Stand: 25.08.2026, lokale Produktionsvorschau auf Port 4173.

## Geprüfte Ansichten

- Desktop-Dashboard: Der Block „EVU-Berater“ ist sichtbar. Im frischen Startspielstand zeigt er „Risikovorsorge auffüllen“ und den empfohlenen Fondsbestand von 17.285 €.
- Bank & Vorsorge: Der Fondsbereich zeigt Fondsbestand, Zielwert, Betragseingabe sowie die Aktionen „In Fonds verschieben“ und „Freigeben“. Der Kreditbereich zeigt Laufzeiten mit 6,0 %, 5,5 %, 5,0 % und 4,5 % p.a. sowie die Bonitätszeile „Verschuldungsgrad nach Auszahlung … von maximal 1,25×“.
- Fonds-Sicherheitsmodal: Das Modal zeigt Betrag, Fondsbestand danach, Kontowirkung ohne GuV-Kosten sowie den Vorrang der Rücklage bei gemeldeten Lokschäden. Das Modal wurde anschließend ohne Buchung geschlossen.
- Händler: Der Händler zeigt die neuen Kauf-/Leasingflüsse. Das BR-232-Angebot ist im Produktionsbuild sichtbar; im Startspielstand ist es wegen fehlender Liquidität korrekt gesperrt.

## Hinweis

Die visuelle Prüfung erfolgte ohne eine verbindliche Finanzbuchung, damit der lokale Testspielstand unverändert bleibt.

## BR-232-Leasing-Prognose

Die BR-232-Leasingvorschau wurde im Händler geöffnet, ohne die verbindliche Transaktion abzuschließen. Sichtbar waren:

- Fixkosten vorher/nachher: 3.457 € → 4.289 € pro Tag, also +832 € pro Tag.
- Liquidität nach Erwerb: 210.000 €; Reserve-Ziel: 30.023 €.
- Geschätzter Deckungsbeitrag pro zusätzlichem Tageslauf: 1.288 €, aus zusätzlichem Erlös abzüglich Trasse/Energie.
- Fondsbestand: 0 €; der Berater weist deshalb auf fehlenden Betriebspuffer hin.
- Der Leasingkauf wurde wegen voller Lok-Stellplätze korrekt blockiert; das Modal zeigt dennoch die Entscheidungsprognose und den Ausbauhinweis.

## Mobile-Portrait-Prüfung

Der aktuelle Produktionsbuild wurde zusätzlich mit einer simulierten Gerätebreite von 390 × 844 px geladen. Der Startdialog „Unternehmen gründen“ bleibt vollständig innerhalb des Viewports, die Eingabefelder und der primäre Button sind ohne horizontales Überlaufen sichtbar. Das Leitstellenbild bleibt als Hintergrund erhalten.

Der neue Mobile-Breakpoint reduziert den Topbar-Platzbedarf, macht die Hauptnavigation horizontal scrollbar, verkleinert Touch-Ziele kontrolliert und blendet sekundäre Metadaten aus. Der Desktop-Dashboardbereich wechselt auf ein einspaltiges Layout; der EVU-Berater und die Bank-/Vorsorgekarten können untereinander gelesen werden. Dialoge erhalten auf sehr schmalen Displays eigenes vertikales Scrolling, sodass Kredit-, Fonds- und Investitionsmodale nicht aus dem Viewport laufen.

Der Preview-Link wurde nach dem Build erneut geladen. Die visuelle Prüfung fand ohne verbindliche Finanzbuchung statt.

## Zweite Mobile-Usability-Prüfung

Die Hauptnavigation wurde auf 390 × 844 px durch eine feste, kontrastreiche Bottom-Bar mit fünf gleich großen Touch-Zielen ergänzt. Die Bereiche erscheinen als kurze, verständliche Labels „Home“, „Fracht“, „Flotte“, „Bank“ und „Firma“ mit Icons. Im Startdialog bleibt die Bottom-Bar sichtbar, ohne die Eingabefelder oder den primären Gründungsbutton zu überdecken; der Inhaltsbereich erhält dafür zusätzlichen unteren Sicherheitsabstand.

Die lange Kategorienavigation am oberen Rand bleibt für breitere mobile Geräte erhalten, wird auf sehr schmalen Displays ausgeblendet und durch die Bottom-Bar ersetzt. Dadurch muss der Nutzer nicht mehr nach rechts wischen, um „Finanzen & Bank“ oder „Firma & Personal“ zu finden. Der Portrait-Screenshot bestätigt, dass die fünf Bereiche gleichzeitig sichtbar und mit ausreichend großen Touch-Flächen erreichbar sind.

## Mobile-Usability-Finalprüfung

Der finale Portrait-Build wurde mit 390 × 844 px geprüft. Die Bottom-Bar bleibt mit den fünf Bereichen „Home“, „Fracht“, „Flotte“, „Bank“ und „Firma“ am unteren Rand sichtbar und wird nicht vom Gründungsdialog verdeckt. Der Startdialog bleibt vollständig lesbar und bedienbar. Die zentralen Büro-Hotspots erhalten auf sehr schmalen Displays größere Mindest-Touchflächen und kompaktere, umbrechende Labels.

## Energieanzeige der Auftragskalkulation

Im Produktionspreview wurde ein offener Güterauftrag Bayreuth–Regensburg (120 km, 1.347 t) geprüft. Die Auftragskalkulation zeigt nach dem Trassenpreis eine geschlossene Karte **„Traktionsvergleich“** mit dem Hinweis **„Eine Option wählen · kein Doppelabzug“**. Darin stehen zwei visuell getrennte Alternativen: Diesel mit Energie 1.493 € und Netto +6.019 € sowie E-Lok mit Energie 1.089 € und Netto +6.423 €. Es erscheinen keine zwei gleichzeitig als Abzug zu summierenden Energiezeilen. Der Komponentenpfad für eine bereits ausgewählte Lok übergibt deren `fuel_type` und zeigt dann ausschließlich die tatsächliche Energieart samt Netto-Gewinn.
