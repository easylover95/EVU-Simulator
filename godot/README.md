# EVU Simulator – Godot-Portierung

Dieses Godot-4-Teilprojekt gehört zum bestehenden Repository `easylover95/EVU-Simulator`. Es portiert die wichtigsten EVU-Daten aus `src/lib/seed.ts` in eine native PC-Spielbasis.

## Öffnen

1. Godot 4.2 oder neuer starten.
2. **Import** wählen.
3. `godot/project.godot` aus diesem bestehenden Repository auswählen.
4. Projekt starten.

## Bereits aus dem Web-Simulator übernommen

- Firma: AixRail GmbH, Hauptsitz Duisburg
- Startkapital: 250.000 €
- 2× BR 218 (Diesel)
- 6× Res und 4× Eanos als Starterwagen
- echte Startaufträge aus `src/lib/seed.ts`
- Güterverkehr und Baugleis-Verträge
- Disposition, Trassen-/Energie-/Crewkosten und Auszahlung

## Godot-Dateien

- `project.godot` – Godot-Projekt und Autoload
- `scenes/main.tscn` – Hauptmenü und Ingame-HUD
- `scripts/game_state.gd` – portierter Spielzustand und Auftragslogik
- `scripts/main_menu.gd` – Startmenü
- `scripts/game_hud.gd` – HUD und Bedienaktionen

Die Portierung ist bewusst als UI-/Gameplay-Grundgerüst angelegt. Als nächstes können 3D-Lokomotiven, Gleisbau-Szenen, Wagenzuweisung, Fahrplan, Signale und Savegames ergänzt werden.
