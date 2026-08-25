# Dynamische Flotteninvestition: 365-Tage-Güterverkehrssimulation

## Investitionsregeln

Die Erweiterung wird nicht an einem festen Kalendertag ausgelöst. Sie prüft vor jedem virtuellen Betriebstag den Kontostand und den erreichten EVU-Level. Damit bleibt der Ablauf mit unverändertem Startzustand reproduzierbar, reagiert aber auf die tatsächlich erwirtschaftete Liquidität.

| Priorität | Auslöser | Maßnahme | Beschaffungswert | Zusätzlicher Einsatz |
| --- | --- | --- | ---: | --- |
| 1 | Level mindestens 5, Kontostand mindestens 600.000 € und Debt-Equity-Prüfung bestanden | Aufnahme eines Darlehens über 250.000 € mit 180 Tagen Laufzeit zu 4,5 % p.a.; Kauf einer BR 232 und 12 Eanos | 659.200 € | Ein täglicher Bulk-Spotlauf über 90 km mit 700 t. |
| 2 | Nach der ersten Investition Kontostand mindestens 850.000 € | Kauf einer BR 140/143 und 6 Sggrss | 554.400 € | Ein täglicher Intermodal-Spotlauf über 520 km mit 500 t. |

Die BR 232 wird durch den Kredit mitfinanziert. Der Darlehensdienst folgt der vorhandenen Rate aus `loanDailyPayment` und der vorhandenen Aufteilung in Zins und Tilgung aus `processBankTick`. Die Kreditvergabe ist nur zulässig, wenn der Verschuldungsgrad aus gesamter verzinslicher Schuld und Eigenkapital nach Auszahlung höchstens 1,25× beträgt. Die zweite Investition wird vollständig aus erwirtschafteter Liquidität finanziert.

## Betriebliche Skalierung

Die ursprünglichen zwei Starterfahrten laufen unverändert weiter. Jede zusätzlich beschaffte Lok löst einen zusätzlichen täglichen Güterlauf mit eigener Wagenkapazität, eigener Trassen- und Energieabrechnung sowie einem zusätzlichen Tf Rang 1 aus. Für die neue Baureihe wird beim Kauf eine Quick-Pay-Nachschulung für den neu eingestellten Tf gebucht.

| Bestand | Zuglauf | Baureihe | Wagen | Physische Nutzlast |
| --- | --- | --- | --- | ---: |
| Ausgangsbetrieb | Coil-Rahmenvertrag, 55 km | BR 218 | 6× Res | 360 t |
| Ausgangsbetrieb | Eanos-Spotverkehr, 120 km | BR 218 | 4× Eanos | 800 t |
| Erweiterung 1 | Bulk-Spotverkehr, 90 km | BR 232 | 12× Eanos | 700 t |
| Erweiterung 2 | Intermodal-Spotverkehr, 520 km | BR 140/143 | 6× Sggrss | 500 t |

## Verschärfte Kosten-, Standort- und Risikoregeln

Trassen- und Energiekosten enthalten einen allgemeinen Kostenaufschlag von 8 %. Die Grundmiete des Standorts deckt nur zwei Lok- und zehn Wageneinheiten. Jede zusätzliche Lok erzeugt 620 € zusätzlichen Tagesaufwand für Stellplatz und Hallenkapazität; jede zusätzliche Wageneinheit kostet 42 € pro Tag. Inaktive Fahrzeuge verursachen zusätzliches Standgeld.

Jede aktive Lok erhält ab 90 Tagen nach ihrer Inbetriebnahme alle 90 Tage eine extern vergebene F-Fristarbeit. Ab Level 3 und Spieltag 90 können aktive Loks mit einer täglichen Wahrscheinlichkeit von 0,45 % außerplanmäßig ausfallen. Die Reparatur wird in diesem Headless-Szenario unmittelbar beauftragt, dauert drei Tage und enthält einen 60-%-Schadenaufschlag zusätzlich zur Fremdvergabe. Während des Werkstattaufenthalts fährt die betroffene Lok keinen Güterlauf.

Damit der Jahresvergleich reproduzierbar bleibt, verwendet der Headless-Lauf einen festen Pseudozufalls-Seed `1592598566`. Die Laufzeitdaten speichern jeden Schaden, die Dauer sowie den zugehörigen Reparaturaufwand. Neue Wagen bleiben im Anschaffungsjahr fristgültig; die Starterwagen behalten Revisionen an Tag 180 und 360.

> Investitionsschwellen, Beschaffungsreihenfolge, Risikowahrscheinlichkeiten und die Kostenverschärfung sind Spielannahmen. Preise, Gehälter, Quick-Pay, Frachterlöse sowie die Ausgangsformeln für Trasse und Energie stammen aus dem lokalen Regelwerk. Es werden keine externen Markt- oder Finanzdaten verwendet.
