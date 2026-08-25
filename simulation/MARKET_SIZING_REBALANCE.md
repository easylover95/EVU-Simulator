# Marktstaffelung für Early-Game-Güteraufträge

## Zweck und Geltungsbereich

Diese Änderung betrifft ausschließlich die **lokale Wirtschaftssimulation** des EVU-Simulators. Sie schafft verlässlich fahrbare kleine Aufträge im Frühspiel und lässt größere Züge erst mit Unternehmensfortschritt sowie erweitertem Wagen-Depot zu. Alle Beträge sind Spielwerte; es wurden keine externen Markt- oder Infrastrukturpreise verwendet.

> Marktprinzip: Kleine Züge sichern den Einstieg, mittlere Züge skalieren nach dem ersten Ausbau und schwere Züge werden erst bei nachweisbarer Depotkapazität freigeschaltet.

## Größenstaffelung

| Marktphase | Voraussetzung | Garantierte kleine Güteraufträge | Sonstige verfügbare Größen |
| --- | --- | ---: | --- |
| Frühspiel | Stufe 1 oder höchstens 25 Wagen-Stellplätze | 3 Aufträge mit 4–6 Wagen | 7–9 Wagen |
| Ausbauphase | Ab Stufe 2 und mindestens 36 Wagen-Stellplätze | 2 Aufträge mit 4–6 Wagen | 7–9 Wagen |
| Schwerverkehr | Ab Stufe 3 und mindestens 36 Wagen-Stellplätze | 2 Aufträge mit 4–6 Wagen | 7–9 und 10–14 Wagen |

Das Gewicht wird nicht mehr unabhängig von der Zuggröße zufällig vergeben. Es ergibt sich aus der Wagenzahl und einer lokalen Nutzlastspanne der Wagengattung. Dadurch entspricht ein kleinerer Zug weniger Tonnenkilometern und erhält proportional weniger Frachtumsatz, behält aber die gleiche Sockelpauschalenlogik.

## Berechnungsbeispiel: 5 gegenüber 11 Eanos

Beide Beispiele verwenden eine 90-km-Strecke, Dieseltraktion, EVU-Stufe 1 und 80 t Nutzlast pro Wagen. Die Auftragsmarge enthält ausschließlich den auftragsbezogenen Bruttoerlös abzüglich Trassen- und Energiekosten, nicht aber unternehmensweite Kosten wie Depot, Versicherungen, Festpersonal oder Kreditdienst.

| Kennzahl | Leichtauftrag: 5 Wagen | Schwerauftrag: 11 Wagen |
| --- | ---: | ---: |
| Zuglast | 400 t | 880 t |
| Transportarbeit | 36.000 tkm | 79.200 tkm |
| Bruttoerlös | 3.505 € | 5.527 € |
| Trassenpreis | −1.073 € | −1.241 € |
| Energie Diesel | −1.120 € | −1.120 € |
| Auftragskosten gesamt | −2.193 € | −2.361 € |
| Netto-Deckungsbeitrag | **+1.312 €** | **+3.166 €** |

Der 5-Wagen-Zug bleibt damit trotz niedrigerer Tonnenkilometer wirtschaftlich positiv. Der 11-Wagen-Zug trägt aufgrund des höheren Gewichts und der größeren Transportarbeit mehr Umsatz und einen höheren absoluten Deckungsbeitrag bei.

## Regressionsprüfung

`simulation/analyzeMarketSizing.ts` prüft automatisch, dass der Startmarkt mindestens drei kleine Güteraufträge enthält, ein ausgebauter Markt mindestens zwei enthält, im Starterdepot keine schweren 10–14-Wagen-Güteraufträge erzeugt werden und ein 5-Wagen-Referenzauftrag nach Trasse und Energie positiv bleibt. Der Test prüft zusätzlich, dass der 11-Wagen-Referenzauftrag einen höheren Brutto- und Nettoertrag erzielt.

Der Test lässt sich mit folgendem Befehl ausführen:

```bash
./node_modules/.bin/tsx --tsconfig tsconfig.app.json simulation/analyzeMarketSizing.ts
```
