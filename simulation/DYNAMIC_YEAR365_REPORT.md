# Jahresauswertung: Dynamische Flotteninvestition im Güterverkehr

> **Ergebnis:** Die regelbasierte Erweiterung von zwei auf vier Lokomotiven bleibt im simulierten Jahr zahlungsfähig. Sie steigert den Jahresumsatz um **2.315.528 €** und das Endkapital um **182.076 €** gegenüber dem Basisszenario. Nach Abzug der offenen Kreditrestschuld verbleibt gegenüber dem Basisszenario ein Liquiditätsvorsprung von **28.591 €**.

![Kapital, Flotte und Kosten](output/dynamic-freight-year-365-analysis.png)

## Vergleich zum Basisszenario

| Kennzahl | Basis | Dynamische Flotte | Veränderung |
| --- | ---: | ---: | ---: |
| Endkapital | 1.435.459 € | **1.617.535 €** | **+182.076 €** |
| Erlöse | 4.005.169 € | **6.320.697 €** | **+2.315.528 €** |
| Cash-Abfluss inkl. Investitionen | 2.779.710 € | 5.163.162 € | +2.383.452 € |
| Güterfahrten | 730 | **941** | +211 |
| Transportvolumen | 42.267.000 tkm | **69.744.000 tkm** | **+65,00 %** |
| Bewegte Gütermenge | 423.400 t | **556.700 t** | +133.300 t |
| Lokomotiven zum Jahresende | 2 | **4** | +2 |
| Wageneinheiten zum Jahresende | 10 | **28** | +18 |
| Finanzielle Stabilität | Ja | **Ja** | unverändert |

## Triggerbasierte Investitionen

| Tag | Auslöser und Maßnahme | Kapitalwirkung | Operative Wirkung |
| ---: | --- | ---: | --- |
| 227 | Kontostand 600.428 €, Level mindestens 5: Kredit über 250.000 €, Kauf BR 232 plus 12× Eanos und neuer Tf mit Quick-Pay | Kapital nach Buchung 186.578 € | Drei tägliche Güterläufe |
| 294 | Kontostand 854.650 €: Kauf BR 140/143 plus 6× Sggrss und neuer Tf mit Quick-Pay | Kapital nach Buchung 295.600 € | Vier tägliche Güterläufe |

Die Anschaffungswerte der Lokomotiven betragen zusammen 970.000 €, die Wageninvestitionen 243.600 €. Durch die vorhandene Mengenrabattlogik kostet das 12-Eanos-Paket 109.200 € und das 6-Sggrss-Paket 134.400 €.[1]

## Kreditwirkung und Liquidität

| Finanzierung | Betrag |
| --- | ---: |
| Kreditaufnahme | 250.000 € |
| Tilgung im Simulationsjahr | 96.515 € |
| Zinsaufwand im Simulationsjahr | 2.731 € |
| Offene Kreditrestschuld zum Jahresende | **153.485 €** |
| Kreditbereinigte Liquidität der dynamischen Flotte | 1.464.050 € |
| Kreditbereinigter Vorsprung gegenüber der Basis | **28.591 €** |

Der Kredit erhöht nicht den Umsatz selbst, sondern verschiebt die erste Erweiterung auf Tag 227 in einen Bereich, in dem die operative Zusatzkapazität noch 139 Betriebstage Erlöse generiert. Die höhere Cash-Position zum Jahresende ist deshalb nur zusammen mit der offenen Restschuld und dem zusätzlichen Fuhrpark zu bewerten.

## Kostenverteilung und operative Beiträge

| Kostenblock | Dynamischer Jahreswert |
| --- | ---: |
| Trasse und Energie | 2.538.349 € |
| Standort und Depot | 1.040.250 € |
| Personal inkl. Neueinstellungen und Quick-Pay | 221.947 € |
| Lok- und Wagenwartung | 18.745 € |
| Versicherung | 31.025 € |
| Kreditdienst aus Zins und Tilgung | 99.246 € |
| Lokinvestitionen | 970.000 € |
| Wageninvestitionen | 243.600 € |

| Baureihe | Beitrag vor Fixkosten |
| --- | ---: |
| BR 218 | 2.503.924 € |
| BR 232 | 662.752 € |
| BR 140/143 | 615.672 € |

Die BR 218 bleibt aufgrund der ganzjährigen Nutzung die stärkste Einzelbaureihe. Die BR 232 und BR 140/143 tragen zusammen 1.278.424 € bei, obwohl sie erst an den Tagen 227 und 294 in Betrieb gehen. Dies erklärt die sichtbare Beschleunigung der Kapitalentwicklung nach dem zweiten Kauf.[2]

## Modellbasis und Grenzen

| Offenlegung | Festlegung |
| --- | --- |
| **Basis** | Cash-basierte Managementrechnung über Erlöse, Trasse/Energie, Personal, Standort, Wartung, Investitionen, Zins und Tilgung. |
| **Zeit** | 365 virtuelle Tage ab dem Starterunternehmen. |
| **Annahmen** | Schwellenwerte 600.000 € und 850.000 €; Kredit 250.000 € mit 360 Tagen Laufzeit zu 2,8 % p.a.; zusätzliche Güterläufe werden sofort nach Beschaffung gefahren. |
| **Quellen und Confidence** | Katalogpreise, Darlehenslogik, Personal-, Wartungs-, Frachterlös- und Betriebskosten stammen vollständig aus dem lokalen Simulatorcode und dem reproduzierbaren Lauf.[1] [2] Die Aussagekraft ist hoch für dieses Szenario, nicht für zufällige Schäden, andere Beschaffungsreihenfolgen, abweichende Vertragsverfügbarkeit oder reale EVU-Finanzen. |
| **Compliance** | Dies ist eine Analyse einer Spielsimulation und keine persönliche Finanzberatung. |

## References

[1]: ../src/lib/dealer.ts "Lok- und Wagenkatalog"
[2]: output/dynamic-freight-year-365.json "Ergebnisdaten des dynamischen 365-Tage-Laufs"
