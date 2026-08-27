# Referenzanalyse: Logistik- und Wirtschaftssimulationen

**Stand:** 27. August 2026  
**Autor:** Manus AI

## Methodik und Einschränkung

Die Spielansicht von Frachtimperium war in dieser Sitzung nicht direkt auslesbar. Die nachfolgende Auswertung stützt sich daher auf die öffentlich zugängliche Produktseite und dokumentierte Funktionsbeschreibungen; sie trifft **keine** nicht überprüfbaren Aussagen über nicht sichtbare Detailinteraktionen der Spielansicht.

## Verifizierte Beobachtungen

| Referenz | Bestätigte Merkmale | Übertragbarer Designnutzen |
|---|---|---|
| Frachtimperium | Auftragsbörse, Disposition, Fuhrpark, Werkstatt, Geländeaubau und Europaübersicht werden als eigenständige, verständliche Arbeitsbereiche gezeigt. Aufträge verlangen die Prüfung von Strecke, Fahrzeugtyp, Stellplätzen und Wirtschaftlichkeit; die Disposition berücksichtigt unter anderem Leerfahrten, Be-/Entladephasen, Fahrzeiten, Pausen und Anschlussaufträge. [1] | Das Informationsmodell muss die operative Reihenfolge des Spielers spiegeln: Auftrag bewerten → Ressourcen disponieren → Ausführung überwachen → Vermögen ausbauen. Wirtschaftliche Vorschau und Statusklarheit sind vor jeder irreversiblen Aktion sichtbar zu machen. |
| Frachtimperium | Auftragslisten nutzen Filter, Sortierung, Favoriten und Sammelaktionen; das Spiel nennt eine einheitliche Behandlung von Tabellen und Auftragslisten sowie mobil optimierte Bedienung. Vertragsboni, Vertragsstrafen und ein Vertragsarchiv machen die wirtschaftliche Konsequenz nachvollziehbar. [1] | Terminal-Aufträge benötigen listenbasierte Entscheidungsunterstützung, serverseitige Validierung, eine lückenlose Ereignisakte und eindeutige Warnungen statt versteckter Restriktionen. |
| Anno 1800 | Die offizielle Produktbeschreibung nennt Produktionsketten, profitable Handelsnetze, anpassungsfähige Strategien, mehrere Sitzungen/Regionen sowie Expansion und Fortschritt als zentrale Bausteine. [2] | Fortschritt entfaltet sich schrittweise durch neue Ressourcen- und Durchsatzprobleme. Die Erweiterung des Terminals sollte stets eine neue Entscheidungsklasse eröffnen, nicht bloß höhere Zahlenwerte erzeugen. |
| Transport Fever 2 | Die offizielle Website hebt anhaltende Unterstützung durch Modding hervor; die geschlossene Dokumentation bestätigte keine Detailmechaniken und wird daher nicht als Detailquelle verwendet. [3] | Die gewählte Architektur sollte Datenkataloge, Events und Validierungen deklarativ halten, damit spätere Güter, Wagen und Szenarien ohne Eingriff in die Kernlogik erweitert werden können. |

## Ableitungen für das Zielspiel

Das Zielspiel sollte keine breit gestreute Transportsimulation sein, sondern die Engpasslogik eines Schwerlastterminals ins Zentrum stellen. Die wiederkehrende, verständliche Entscheidung lautet: **Kann dieses Terminal eine zeitkritische, physisch anspruchsvolle Baugleis-Lieferung sicher, regelkonform und rentabel ermöglichen?**

Die Benutzeroberfläche sollte zwei Ebenen streng trennen. Die erste Ebene beantwortet in einem operativen Cockpit die Frage, was jetzt dringend ist. Die zweite Ebene erlaubt mit Tabellen, Filtern und einer sequenziellen Zugbildung die präzise Arbeit. Jede Einschränkung – Kapazität, Lagerfläche, Gleislänge, Wagenzuladung, LÜ-Freigabe oder Baustellenreihenfolge – muss direkt an dem Element sichtbar sein, das sie verursacht.

## Quellen

[1]: https://frachtimperium.de/ "FrachtImperium – Logistik- & Speditions-Browsergame"
[2]: https://www.ubisoft.com/en-gb/game/anno/1800 "Anno 1800 – offizielle Produktseite"
[3]: https://www.transportfever2.com/ "Transport Fever 2 – offizielle Website"
[4]: https://www.factorio.com/game/about "Factorio – offizielle Website"

> **Hinweis:** Quelle [4] wurde als Kontext geprüft, enthielt im ausgelesenen Inhalt jedoch keine belastbaren Mechanikdetails; sie wird in den weiteren Empfehlungen nicht für Mechanikbehauptungen herangezogen.
