# Startkapital-Experiment: Frühspiel Tag 1–30

> **Modellstatus:** Lokale Spielbalance, keine Aussage über reale EVU-, Banken- oder Marktbedingungen. Die Simulation verwendet aktuelle Runtime-Formeln für Spotvergütung, Diesel/Trasse, Personal, Standort, Versicherung und die cash-only-Depotregel.

## Prüfaufbau

Der Lauf betrachtet ausschließlich die drei garantiert verfügbaren Leichtaufträge des Frühmarkts. Die Marktlogik garantiert bei Level 1 bzw. 25 Wagenstellplätzen genau 3 Angebote mit 4–6 Wagen. Für Reproduzierbarkeit nutzt das Experiment drei nacheinander abwickelbare Referenzaufträge, die nur die vorhandenen Startergattungen Eanos und Res benötigen. Nach Tag 6 wird **kein weiterer Umsatz** unterstellt: Die Pufferwerte sind damit bewusst konservativ und messen die Widerstandsfähigkeit der Startliquidität gegen 30 Tage Fixkosten.

Der Schadensfall erzwingt am Tag 5 einen Elektronikschaden einer BR 218. Der Betrag von 7.680 € entspricht der aktuellen eigenen Werkstattquote einschließlich des außerplanmäßigen Schadenmultiplikators; reguläre Zufallsschäden sind im Produktivspiel vor Level 3 und vor Tag 90 noch gesperrt.

## Drei garantierte Starterläufe

| Auftrag | Referenzlauf | Wagen | Strecke / Last | Bruttoerlös | Betriebskosten | Deckungsbeitrag | XP |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| START-01 | Kohle Ruhrgebiet | 4× Eanos | 55 km / 320 t | 2.644 € | 1.323 € | 1.321 € | 17 |
| START-02 | Gleisbaustoff Mittelrhein | 5× Res | 80 km / 350 t | 3.130 € | 1.933 € | 1.197 € | 20 |
| START-03 | Biomasse Süd | 4× Eanos | 120 km / 300 t | 3.505 € | 2.877 € | 628 € | 22 |

## Ergebnismatrix

| Startkapital | 3 Starteraufträge fahrbar | Endkapital ohne Schaden | Erstes Minus ohne Schaden | Puffer nach Tag 30 | Endkapital mit Tag-5-Schaden | Erstes Minus mit Schaden | Einordnung |
| ---: | --- | ---: | --- | ---: | ---: | --- | --- |
| 50.000 € | Ja | -50.821 € | Tag 16 | 0 Tage | -58.592 € | Tag 14 |  |
| 100.000 € | Ja | -564 € | Tag 30 | 0 Tage | -8.247 € | Tag 28 |  |
| 150.000 € | Ja | 49.436 € | nicht in Tag 1–30 | 14 Tage | 41.756 € | nicht in Tag 1–30 | **Empfohlen** |
| 200.000 € | Ja | 99.436 € | nicht in Tag 1–30 | 28 Tage | 91.756 € | nicht in Tag 1–30 |  |
| 210.000 € | Ja | 109.436 € | nicht in Tag 1–30 | 31 Tage | 101.756 € | nicht in Tag 1–30 |  |

## Depot-Ausbau und Progression

Die erste investive Ausbaustufe ist der **3. Lok-Stellplatz** für 18.000 €. Sie erfordert neben freiem Cash zwingend **Level 2**. Die drei Starterläufe erzeugen zusammen nur 59 XP; Level 2 benötigt 1.000 XP. Daher besitzt zwar jedes Vergleichsszenario am Start rechnerisch genug Cash für die 18.000-€-Stufe, aber **keines kann sie innerhalb dieses isolierten Drei-Auftrags-Laufs legal erwerben**. Das Ergebnis trennt bewusst Liquidität von der Progressionsfreischaltung.

## Empfehlung

**150.000 €** ist in diesem konservativen Test der sinnvollste Balanced-Start: Die drei Starteraufträge bleiben ohne Kredit bzw. Dispo vollständig fahrbar, der Tag-5-Schock bleibt klar oberhalb der Nulllinie und nach Tag 30 bleibt ein nennenswerter Betriebspuffer. **100.000 €** ist eine anspruchsvolle Standard-Variante, aber im erzwungenen Schadenpfad bis Tag 30 negativ. **50.000 €** ist Hardcore und fällt bereits im Basispfad während des Monats ins Minus. **200.000–210.000 €** bieten hohe Fehlertoleranz, senken aber die frühe finanzielle Spannung deutlich.

## Reproduktion

Ausführen mit:

`npm run analyze:starting-capital`

Die Rohwerte stehen in `simulation/output/starting-capital-analysis.json`; dieser Bericht wird als `simulation/output/STARTING_CAPITAL_ANALYSIS.md` erzeugt.
