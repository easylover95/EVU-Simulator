# QA — Railway-Tycoon UI Redesign

## Verifiziert am 28.08.2026

Die lokale Vite-Anwendung wurde auf Port 1420 geladen. Die neue Zentrale rendert mit Hero-Leitstelle, Zugkarten, Auftragsliste, Budget-Chart, Hub-Karten und einem CTA-Bereich. Im Browser wurden lokale Lokomotivbilder aus `/locos/responsive/br218-clean-640.webp` geladen.

Der automatisierte Responsive-Snapshot-Test prüfte Desktop 1440×900 und Mobile 390×844. Beide Ansichten meldeten `horizontalOverflow: false`; im Desktop war die Desktop-Navigation sichtbar und die Mobile-Bottom-Bar verborgen. Im Mobile-Viewport war die fünfteilige Bottom-Bar sichtbar, die mobilen Zeitsteuerungen waren sichtbar und die Desktop-Topbar/-Navigation verborgen. Der Test meldete `pass: true`.

Die erste visuelle Browseransicht enthielt beim lokalen Erststart zusätzlich den bestehenden Dialog „Unternehmen gründen“ über der Zentrale. Das ist vorhandener Spiellogik-Zustand; die neue Oberfläche dahinter war vollständig gerendert und blieb zugänglich.

## Nachbesserung

Die erste visuelle Prüfung zeigte die Bottom-Bar am oberen Rand, weil `backdrop-filter` am Header einen containing block für das darin gerenderte `position: fixed` erzeugte. Der Mobile-Block deaktiviert diesen Effekt und erzwingt die Viewport-Fixierung (`top: auto`, `bottom: 0`, `left/right: 0`). Der Responsive-Test wurde danach erneut ausgeführt und meldet weiterhin `pass: true` ohne horizontalen Overflow.

## Finale visuelle Abnahme

Der finale Snapshot bei 390×844 zeigt die Zentrale mit sichtbarem Level-Badge, Rangtitel, Kontostand und Gold im Header. Der Hero liegt direkt darunter, die Zugkarten nutzen scharfe BR-218-Bilder, die Kartenhierarchie bleibt klar und die Bottom-Bar sitzt am unteren Rand. Die Desktop-/Mobile-Umschaltung und der horizontale Overflow bleiben im automatisierten Test erfolgreich.
