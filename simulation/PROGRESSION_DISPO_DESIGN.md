# Progressions- und Dispo-Entwurf für den EVU-Simulator

## Kurzfassung

Empfohlen wird ein **Kern-Level-Cap bei Stufe 20** mit einem anschließenden **Meilenstein- und Zertifizierungssystem ohne Reset**. Die wirtschaftlich relevante Skalierung endet bewusst früher: Der Disporahmen erreicht bei Stufe 10 seinen festen Notfallrahmen von 175.000 €, während Stufen 11–20 noch Infrastruktur, Fahrzeugkompetenz, Verträge und Organisation freischalten. Nach Stufe 20 werden weitere XP in dauerhafte, nicht-inflationäre Unternehmensmeilensteine überführt.

> Der Dispo ist eine Rettungsleine für operativen Cashflow und Reparaturen – kein Finanzierungsmittel für einen Flottenkauf.

Dieser Vorschlag ersetzt keine reale Banken- oder Marktlogik. Alle Werte sind lokale Spielbalance-Annahmen auf Basis der bestehenden XP-, Depot-, Kredit- und Betriebskostenregeln.

## Implementierungsstatus

Die Regeln dieses Entwurfs sind im Laufzeitcode umgesetzt. `bank.ts` nutzt die Rahmenstufen 25.000 € bis 175.000 € sowie die Zinsbänder 0,035 %, 0,055 % und 0,080 % pro Spieltag anhand der momentanen Dispoauslastung. Kauf von Lokomotiven, Wagen, Depotausbauten, Ausrüstungspaketen und Netzzugang benötigt frei verfügbares Guthaben; operative Kosten wie Reparaturen, Gehalt, Versicherung und Leasingraten können weiterhin den Dispo nutzen.

`progression.ts` begrenzt das wirtschaftliche Kernlevel auf 20. Ab dort zählt Auftrags-XP als dauerhafter Konzern-Meilensteinfortschritt in Schritten von 250.000 XP. Dieser Zustand wird lokal getrennt vom optionalen Cloud-Schema gespeichert. Der Rang ist in der Firmenbearbeitung und in den Auswertungen sichtbar. Es gibt keinen Prestige-Reset: Fuhrpark, Personal, Depot, Kapital, Kredite und Reputation bleiben unangetastet.

Die Regression `npm run test:progression-dispo` prüft Staffel, progressive Zinsbuchung, Cash-only-Investitionen, das Level-20-Cap und den Rang „Europäischer Konzern“ nach dem ersten abgeschlossenen Konzern-Meilenstein.

## Ausgangslage im aktuellen Modell

Die bestehende Unternehmens-XP wächst pro Stufe um den Faktor **1,45**. Von der Startfirma mit 1.000 XP bis Stufe 2 steigen die Anforderungen dadurch schnell: Stufe 10 benötigt kumuliert 60.749 XP, Stufe 20 bereits 2.584.968 XP und Stufe 25 16.580.999 XP. Ohne eine spätere Abflachung wird ein unbegrenztes Levelsystem deshalb mathematisch zwar möglich, für normale Spielverläufe aber kaum noch als Fortschritt wahrnehmbar.

Das aktuelle Dispo-System skaliert dagegen bis 250.000 € an Stufe 10 und bleibt danach faktisch unverändert. Die Kombination aus hohen Limits, einem einheitlichen Tageszins und kreditfinanzierten Flottenkäufen bietet zu wenig Trennung zwischen Notfallliquidität und Wachstumsfinanzierung.

## Vergleich der Progressionsmodelle

| Modell | Langzeitmotivation | Wirtschaftliches Risiko | Empfehlung |
| --- | --- | --- | --- |
| Starres Cap bei 10 | Klare Abschlusslinie, aber frühes Ende | Gering; wenig Zahleninflation | Nicht ausreichend: viele Infrastruktur- und Fuhrparkziele enden zu früh |
| Starres Cap bei 20 | Planbare Kernkampagne und klare Freischaltungen | Gut steuerbar | Sinnvoll als wirtschaftlicher Kern |
| Unbegrenzte Level mit 1,45× XP-Wachstum | Theoretisch endlos, praktisch nach Stufe 15 stark abgeflacht | Gefahr von Belohnungsinflation oder Grind | Nicht empfohlen |
| Prestige mit vollständigem Reset | Hohe Wiederholbarkeit für Roguelite-Spieler | Frust durch Verlust der aufgebauten EVU-Struktur | Nicht passend für eine langfristige Wirtschaftssimulation |
| **Cap 20 + Meilensteine ohne Reset** | Abschluss, Sammelziele und langfristige Anerkennung | Sehr gut steuerbar, da keine zusätzliche Geld- oder Kreditinflation | **Empfohlen** |

### Empfohlene Umsetzung der Stufen

Die Stufen 1–10 bleiben die finanzielle Wachstumsphase. Stufen 11–20 konzentrieren sich auf Spezialisierung: Zuverlässigkeit, bessere Vertragsauswahl, zusätzliche Baugleis-Zertifikate, internationale Ausschreibungsrechte und Betriebskennzahlen. Nach Stufe 20 wird die exponentielle XP-Stufe nicht fortgesetzt; stattdessen erzeugen abgeschlossene Aufträge feste Meilensteinpunkte. Jede Zertifizierung soll ein horizontaler Vorteil sein, beispielsweise eine zusätzliche Ausschreibungsoption oder ein kosmetisches Firmenabzeichen, aber **keinen weiteren Disporahmen und keinen pauschalen Umsatzmultiplikator** geben.

Ein Reset-Prestige wird nicht empfohlen. Die Kernfantasie des Spiels ist das langfristig aufgebaute EVU mit Fuhrpark, Personal, Depot und Reputation. Ein Reset würde genau diese Investitionsgeschichte entwerten. Meilensteine ohne Reset behalten dagegen die Langzeitmotivation bei.

## Vorgeschlagene Dispo-Kurve

| Stufe | Phase | Aktueller Rahmen | Vorgeschlagener Rahmen | Wachstumssperre ab 60 % Nutzung |
| ---: | --- | ---: | ---: | ---: |
| 1 | Frühspiel | 20.000 € | 25.000 € | 15.000 € |
| 2 | Frühspiel | 45.000 € | 35.000 € | 21.000 € |
| 3 | Frühspiel | 70.000 € | 50.000 € | 30.000 € |
| 4 | Mittelspiel | 95.000 € | 65.000 € | 39.000 € |
| 5 | Mittelspiel | 120.000 € | 80.000 € | 48.000 € |
| 6 | Mittelspiel | 145.000 € | 100.000 € | 60.000 € |
| 7 | Mittelspiel | 170.000 € | 120.000 € | 72.000 € |
| 8 | Spätspiel | 200.000 € | 140.000 € | 84.000 € |
| 9 | Spätspiel | 225.000 € | 155.000 € | 93.000 € |
| 10–20+ | Spätspiel / Meilensteine | 250.000 € | **175.000 €** | 105.000 € |

Der Rahmen ist im Frühspiel etwas höher als bisher, schützt also tatsächlich gegen einen einzelnen kleineren Defekt oder einen ungünstigen Zahlungszeitpunkt. Ab Stufe 2 wächst er deutlich flacher als im aktuellen Modell. Damit bleibt ausreichend Spielraum für Reparaturen und laufende Kosten, ohne dass ein immer größerer negativer Saldo als kostenlose Investitionsquelle fungiert.

### Zins- und Sicherungslogik

| Auslastung des Dispos | Tageszins | Regelwirkung |
| --- | ---: | --- |
| 0–50 % | 0,035 % | Kurzfristige operative Überbrückung bleibt tragbar |
| über 50–85 % | 0,055 % | Spürbarer Druck zur Rückführung |
| über 85 % | 0,080 % | Notfallmodus; Sanierung hat Vorrang |

Zusätzlich gelten vier Regeln. Erstens dürfen Lok-, Wagen- und Depotausgaben das Konto nicht in den Dispo ziehen; für Wachstum dienen Cash und reguläre Darlehen. Zweitens werden optionale Investitionen ab 60 % Dispoauslastung gesperrt, bis die Nutzung wieder unter diesen Wert fällt. Drittens wird ab 85 % Auslastung ein Sanierungsmodus angezeigt und nur noch Aufträge mit positivem, sofortigem Deckungsbeitrag sollten freigegeben werden. Viertens soll die bestehende 14-Tage-Sanierung bei Überschreitung des Rahmens erhalten bleiben.

Die vorhandene Instandhaltungs-Rücklage sollte vor dem Dispo belastet werden. Als UI-Zielwert eignet sich mindestens das Maximum aus sieben Tagen Fixkosten und einer fahrzeugbezogenen Schadensreserve. Damit wird der Fonds zum strategischen Puffer, der den teuren Dispo vermeidet.

## Simulierte Liquiditätswirkung

Die Szenarien rechnen täglich: operativer Netto-Cashflow, einmaliger Schaden, progressiver Dispozins und Rückkehr in die positive Liquidität. Sie sind illustrative, reproduzierbare Spielbalancen und keine Prognosen realer EVU-Finanzen.

| Szenario | Stufe | Zeitraum | Schaden | Dispo-Spitze | Negative Tage | Wieder positiv | Zinsaufwand | Endliquidität |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Frühspiel: kleiner Defekt | 2 | 21 Tage | 18.000 € an Tag 3 | 9.603 € von 35.000 € | 6 | Tag 9 | 11 € | 22.789 € |
| Mittelspiel: Werkstattfall | 6 | 30 Tage | 52.000 € an Tag 5 | 22.508 € von 100.000 € | 7 | Tag 12 | 30 € | 64.970 € |
| Spätspiel: Flottenausfall | 10 | 45 Tage | 145.000 € an Tag 3 | 107.559 € von 175.000 € | 17 | Tag 20 | 410 € | 165.090 € |

Der Spätspiel-Fall demonstriert die beabsichtigte Funktion: Ein großer Flottenausfall ist überlebbar, bindet aber 61,5 % des Disporahmens und löst für mindestens einen Tag die Wachstumssperre aus. Der Rahmen rettet den Betrieb, finanziert jedoch keinen zusätzlichen Fuhrpark.

## Favoritenentwurf und Priorisierung

Der Favorit ist folglich: **Stufe 20 als sichtbarer Kernabschluss, darauf aufbauende Meilensteine ohne Reset und ein bei 175.000 € gedeckelter, progressiv verzinster Notfalldispo.**

Die Reihenfolge für eine spätere Implementierung sollte sein: Zuerst die neue Dispo-Kurve und die Sperre für investive Ausgaben bei negativem Saldo. Danach folgen die auslastungsabhängigen Zinssätze und die UI-Warnstufen. Erst als dritter Schritt sollte die Progression in Kernstufen 1–20 und anschließende Meilensteine aufgeteilt werden. So bleibt die Balance testbar, während das Fortschrittsgefühl verbessert wird.

## Reproduzierbarkeit

Die Berechnung liegt in `simulation/analyzeProgressionDesign.ts`. Sie nutzt die aktuelle XP-Wachstumsrate von 1,45 sowie die vorgeschlagene Dispo-Kurve und schreibt die Messwerte nach `simulation/output/progression-design-analysis.json`. Die bestehende Analyse dokumentiert weiterhin die Design-Szenarien; die Runtime-Regression überprüft zusätzlich die tatsächlich implementierten Regeln.

```bash
./node_modules/.bin/tsx --tsconfig tsconfig.app.json simulation/analyzeProgressionDesign.ts
npm run test:progression-dispo
```
