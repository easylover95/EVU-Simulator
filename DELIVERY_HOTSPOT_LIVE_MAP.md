# Übergabe: Erfolge-Hotspot & Live-Leitstellenkarte

## Umgesetzte Korrekturen

Der Hotspot **„Erfolge & Meilensteine“** in `OfficeHQView.tsx` verwendet jetzt exakt die gewünschten Quellbildwerte für `leitstelle_bg.png`.

| Eigenschaft | Wert |
| --- | --- |
| `left` | `14.2%` |
| `top` | `16.4%` |
| `width` | `11.0%` |
| `height` | `9.8%` |

Die frühere spezielle, dauerhaft sichtbare Galerie-Rahmung wurde entfernt. Der Hotspot nutzt nun dieselbe rechteckige Goldrahmen- und Hoverbehandlung wie die Büro-Kacheln für **Firma** und **Finanzen**.

## Live-Leitstellenkarte

`LiveTrackingMap.tsx` wurde optisch und funktional zu einer dunklen Leitstellenkarte weiterentwickelt. Sie behält die vorhandene, tickbasierte Simulationslogik als Quelle für Lokpositionen bei und stellt sie klarer dar.

| Element | Umsetzung |
| --- | --- |
| Grundkarte | Dunkle, farblich verstärkte CARTO/OpenStreetMap-Basiskarte ohne konkurrierende Basiskartenlabels. |
| Stammkorridore | Zweilagige, blau-cyanfarbene Korridore mit breitem Glühuntergrund. |
| Stationsknoten | Dauerhaft sichtbare Knoten und Kartenbeschriftungen statt nur Hover-Tooltips. |
| Aktive Züge | Amberfarbene Glühstrecke, pulsierender amberfarbener Lokmarker und Simulation-Liveanzeige. |
| Geplante Züge | Zurückhaltende cyanfarbene, gestrichelte Fahrkorridore. |
| Stillstand/Wartung | Amber für abgestellte Fahrzeuge, Rose für Wartung oder Stilllegung. |
| Kontext | Kompakte Leitstellen-HUD mit Anzahl aktiver Zugläufe und Legende. |

> Die Karte zeigt keine externen GPS-Daten. „Live“ bezeichnet den bestehenden, mit jedem Spieltick aktualisierten Simulationsstand der Lokomotiven und Einsatzaufträge.

## Prüfung

Die exakten Hotspotwerte wurden aus der Komponente ausgegeben und kontrolliert. Der Domänen-Smoketest, die TypeScript-Prüfung, der Produktions-Build und `git diff --check` liefen erfolgreich durch. Der Produktions-Build meldet weiterhin lediglich die bekannte nicht blockierende Warnung zum großen Haupt-Chunk.
