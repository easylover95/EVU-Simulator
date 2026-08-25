# Fracht- und Baugleis-Kalkulation: Rebalancing

## Zweck und Geltungsbereich

Dieser Vergleich dokumentiert eine **lokale Spielbalance-Änderung**. Es werden keine externen Markt-, Infrastruktur- oder Energiepreise verwendet. Alle Werte stammen aus dem reproduzierbaren Testlauf `simulation/analyzeFreightPricing.ts` mit EVU-Stufe 1, Bekanntheit 0, 1.000 t Frachtgewicht für die beiden Referenzkorridore und Dieseltraktion.

> Ziel der Änderung: Der Bruttoerlös von Spot-Fracht besteht sichtbar aus einer Sockelpauschale plus einem distanzproportionalen Tonnenkilometer-Anteil. Baugleis-Tagespauschalen decken ihre tägliche Trassen-, Energie- und PDL-Basis und enthalten anschließend eine wirtschaftliche Einsatzmarge.

## Neue Formel

Für Güterverkehr gilt je Segment: **Bruttoerlös = (Sockelpauschale + Tonnenkilometer × €/tkm) × EVU-Multiplikator**. Der Multiplikator beträgt in diesem Test bei Stufe 1 **52 %**. Die reifen Segmentparameter lauten: Bulk 3.500 € + 0,090 €/tkm, Block 4.000 € + 0,100 €/tkm und Intermodal 4.800 € + 0,110 €/tkm.

Für einen Baugleis-Einsatz gilt: **Tagespauschale = geschätzte Trasse + Dieselenergie + AZF/PDL-Basis + Einsatzmarge**. Die Einsatzmarge ergibt sich aus 1.600 € Grundmarge, 7 €/Streckenkilometer, 55 €/100 t und 180 € Risikopuffer; anschließend wirkt der Baugleis-Multiplikator. Die bisherige enge Obergrenze von 8.500 € wurde durch eine reine Sicherheitsgrenze von 25.000 € ersetzt und begrenzt keine regulären Angebote mehr.

## Vergleich Güterverkehr

| Referenzfall | Bisheriger Bruttoerlös | Neuer Bruttoerlös | Bisherige Betriebskosten | Neuer Netto-Gewinn | Veränderung Netto | Effektiver €/tkm neu |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Duisburg–Dortmund, 55 km / 1.000 t | 4.381 € | 4.394 € | 1.468 € | 2.926 € | 13 € | 0,0799 € |
| Bayreuth–Regensburg, 120 km / 1.000 t | 4.817 € | 7.436 € | 3.204 € | 4.232 € | 2.619 € | 0,0620 € |

Der 120-km-Lauf bringt nun **1.306 € mehr Netto-Gewinn** als der 55-km-Lauf. Sein effektiver Erlös pro Tonnenkilometer liegt bei **77,6 %** des kurzen Referenzlaufs; zuvor waren es nur 50,3 %. Damit ist die unerwünschte Distanzdegression deutlich reduziert und der absolute Langstreckenvorteil gesichert.

## Vergleich Baugleis-Tagespauschale

| Baugleis-Fall | Bisherige Tagespauschale | Neue Tagespauschale | Tageskosten | Neue Tagesmarge | Veränderung Tagesmarge |
| --- | ---: | ---: | ---: | ---: | ---: |
| 120 km / 1.000 t | 4.216 € | 5.469 € | 3.383 € | 2.086 € | 1.253 € |
| 285 km / 1.400 t | 5.440 € | 10.299 € | 7.325 € | 2.974 € | 4.859 € |

Der 285-km-Baugleisfall war zuvor mit **-1.885 € pro Tag** defizitär. Nun deckt die Tagespauschale die vollständige Kostenbasis aus Trasse (2.929 €), Diesel (3.546 €) und PDL/AZF (850 €) und lässt eine Einsatzmarge von **2.974 € pro Tag**.

## Automatische Regressionstests

Der Test bricht mit einem Fehler ab, falls der 120-km-Referenzlauf nicht mehr absolut rentabler als der 55-km-Lauf ist, falls sein effektiver €/tkm-Satz unter 75 % des Kurzlaufs fällt oder falls einer der beiden Baugleis-Testfälle negativ wird. Damit bleiben die gewünschten wirtschaftlichen Eigenschaften bei weiteren Balance-Änderungen reproduzierbar abgesichert.

## Grenzen

Die dargestellten Margen beinhalten die streckenabhängigen Trassen-, Energie- und optionalen PDL-Kosten. Sie enthalten keine weiteren unternehmensweiten Fixkosten wie Depot, Versicherungen, Festgehalt oder Kreditdienst. Die Berechnung ist deshalb eine **auftragsbezogene Deckungsbeitragsrechnung innerhalb der Spielsimulation**, keine reale EVU-Kalkulation oder Finanzberatung.

