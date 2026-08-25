# Headless-Jahressimulation: Güterverkehr 365 Tage

## Zweck

Der Lauf prüft die finanzielle Tragfähigkeit des **Starterbetriebs** über 365 virtuelle Kalendertage. Er verwendet die vorhandenen Spielfunktionen für Frachterlöse, Trassen- und Energiekosten, Tagesgehälter, Standortkosten, Versicherungsgrundpauschale, Vertragsentgelte und Werkstattquoten. Der Lauf schreibt weder lokale Spielstände noch Supabase-Daten.

## Reproduzierbares Basisszenario

| Bereich | Festlegung |
| --- | --- |
| Startzustand | `SEED_COMPANY`, zwei BR 218, zwei Tf, 6× Res und 4× Eanos aus `seed.ts`. |
| Güterverkehr 1 | Täglicher Lauf des verfügbaren Coil-Rahmenvertrags **Duisburg–Dortmund** mit 360 t, 55 km und 6× Res. Der Vertrag wird bei Ablauf erneut angenommen. |
| Güterverkehr 2 | Täglicher, wiederkehrender Eanos-Spotlauf auf Basis des vorhandenen Starter-Auftragsprofils **Bayreuth–Regensburg**, 800 t und 120 km. Sein Erlös wird mit der kanonischen `computeSpotYield`-Formel für die jeweils erreichte Unternehmensstufe gebildet; die Betriebsseite verwendet `calcOrderOperatingCosts`. |
| Baureihen | Beide Zugläufe werden von den beiden Starter-BR 218 erbracht. Damit ist BR 218 zugleich die einzige tatsächlich vergleichbare Baureihe. |
| Personal | Am Tag 1 wird ein zusätzlicher Tf Rang 1 eingestellt und per Quick-Pay für eine fehlende Baureihenfreigabe geschult. Einstellungs- und Quick-Pay-Gebühr folgen `RECRUIT_OFFERS` beziehungsweise `hireNachschulungFee(1)`. Zusätzlich wird ein Wagenprüfer Rang 1 als Personalreserve mit dem kanonischen Rang-1-Monatsgehalt angesetzt. |
| Wagenprüfungen | Da der aktuelle Runtime-Code keine separate Wagenprüfer-Dispatch- oder Einsatzpreisregel enthält, werden nur existierende Wagenfristarbeiten gebucht: jeweils zwei Vollrevisionen (`rev`) am Tag 180 und 360, eine pro Wagenparkzeile. Die Revisionen und die Wagenprüfer-Personalkosten werden getrennt ausgewiesen. |
| Baureihenwartung | Für jede BR 218 werden am Tag 90, 180, 270 und 360 F-Fristarbeiten extern vergeben. Der Preis stammt je Vorgang aus `quoteWorkshopJob(loco, 'F', 'fremdvergabe')`. Die vorbeugende Vergabe verhindert künstliche Ausfälle durch nicht deterministische Zufallsstörungen. |
| Fixkosten | Die echte tägliche Lohnlogik (`processPayrollTick`), Bank-/Versicherungslogik (`processBankTick`) und Standort-/Standgeldlogik (`processDepotTick`) laufen pro virtuellem Tag. |
| Fortschritt | Alle zwei Erlösfahrten geben Unternehmens-XP über `grantCompanyXp`; die Frachterlöse steigen damit ausschließlich nach der bestehenden Stufenlogik. |
| Finanzierung | Keine neue Kreditaufnahme, kein Leasing, keine Werbung und keine Baugleis-Einsätze. Der Test misst damit die operative Tragfähigkeit des Starterbetriebs unter den genannten Personal- und Wartungsbelastungen. |

## Abgrenzungen

> Der Jahreslauf ist ein deterministischer Stresstest des vorhandenen Regelwerks, keine Simulation eines realen EVU und keine Prognose realer Bahnbetriebswirtschaft. Er verwendet keine externen Markt-, Energie- oder Gehaltsdaten.

Die Start-BR-218 erhalten für den Test einen frischen Wartungszustand. Das trennt die 365-Tage-Betrachtung von zufälligen Altständen oder lokal gespeicherten, bereits überfälligen Fristen. Nicht modelliert werden zufallsbasierte Weltstörungen, unvorhersehbare Schäden, Steuerzahlungen, neue Kredite, Immobilien- und Fuhrparkinvestitionen sowie ein nicht vorhandener Wagenprüfer-Einsatzmechanismus.
