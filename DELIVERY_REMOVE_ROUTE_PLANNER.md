# Übergabe: Entfernung von Streckennetz & Fahrplan

## Entscheidung und Ergebnis

Der Bereich **„Streckennetz & Fahrplan“** wurde vollständig entfernt, da seine gespeicherten Routen und Fahrplanvormerkungen keine unmittelbare betriebliche Wirkung hatten und damit keine ausreichend klare Spielentscheidung erzeugten.

| Entfernt | Verbleibt unverändert |
| --- | --- |
| Transport-Navigationseintrag „Streckennetz & Fahrplan“ | Disposition als alleinige operative Zuweisung |
| `NetworkPlannerView` und die SVG-Planungsoberfläche | Tourenplaner und Tourenübersicht |
| Lokaler Routen-/Fahrplanzustand sowie Commit-Callbacks in `App.tsx` | Leaflet-Live-Karte mit tickbasierten Lokpositionen |
| `routeNetwork`-Domänenmodul und Routentest | Finanz-Smoketest für Kredit, GuV und Bilanz |

Die bestehende **Disposition** bleibt weiterhin der einzige Weg, einen Auftrag mit Lok, Personal und Wagen operativ zuzuweisen. Die Live-Karte zeigt unverändert reale Simulationspositionen der laufenden Aufträge und abgestellten Lokomotiven.

## Bereinigung

Die Navigation, das zentrale Runtime-State-Handling, die View, das Domänenmodul, die alte Routentestdatei und die überholte Delivery-Notiz wurden entfernt. Die technische Dokumentation wurde auf den bestehenden Finanz-, Dispositions- und Live-Kartenumfang aktualisiert.

## Prüfung

| Prüfung | Ergebnis |
| --- | --- |
| Quellcode-Suche | Keine verbleibenden Laufzeitverweise auf `streckennetz`, `NetworkPlanner`, `routeNetwork` oder `RoutePlan`. |
| Finanz-Smoketest | Erfolgreich mit `finance-smoke: ok`. |
| TypeScript | Erfolgreich mit `./node_modules/.bin/tsc --noEmit -p tsconfig.app.json`. |
| Produktions-Build | Erfolgreich mit `./node_modules/.bin/vite build`. |
| Diff-Prüfung | Erfolgreich mit `git diff --check`. |

Die bekannte Vite-Warnung für den großen Haupt-Chunk bleibt bestehen, blockiert den Build jedoch nicht.
