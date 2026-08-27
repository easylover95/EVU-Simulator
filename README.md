# EVU Simulator – Entwicklerhandbuch

Der **EVU Simulator** ist eine lokale, browserbasierte Wirtschafts- und Güterverkehrssimulation im Frachtimperium-Stil. Die Anwendung verbindet Auftrags- und Zugdisposition, Fuhrpark- und Personalverwaltung, eine simulierte Finanzlogik sowie Live-Kartendarstellung. Die Finanzwerte sind ausschließlich **Spielbalancewerte** und keine reale EVU-, Bank- oder Anlageberatung.

| Bereich | Technische Basis |
| --- | --- |
| Client | React 18, TypeScript und Vite |
| Darstellung | Tailwind CSS, eigene Frachtimperium-Styles und Lucide Icons |
| Karten | Leaflet mit auswählbaren schlüsselfreien Grundkarten und eigenen EVU-Fahrkorridoren |
| Persistenz | Primär lokaler Browser-Speicher, optional Supabase |
| Native Desktop-Variante | Tauri 2 mit demselben Vite-Frontend |
| Mobile Nutzung | Responsive CSS mit Desktop-Topbar sowie mobiler Zeitsteuerung und Bottom-Bar |
| Installierbare Web-App | Web-App-Manifest, Service Worker und vorhandene App-Icons |

## Schnellstart

Nach dem Klonen werden die Abhängigkeiten installiert und die Entwicklungsumgebung gestartet. Die Anwendung verwendet standardmäßig den in `vite.config.ts` definierten Port `1420`.

```bash
npm install
npm run dev
```

Für einen möglichst produktionsnahen manuellen Test wird zunächst gebaut und anschließend der Preview-Server gestartet.

```bash
npm run build
npm run preview -- --host 0.0.0.0 --port 4176
```

> **Hinweis:** Ein lokaler Erststart erzeugt einen frischen, lokal gespeicherten Spielstand. Wird optional Supabase konfiguriert, greifen die Datenzugriffe auf den dafür vorgesehenen Client in `src/lib/supabase.ts` zurück.

## Projektarchitektur

Die Codebase trennt Anwendungsorchestrierung, ansichtsspezifische Oberfläche und zustandsarme Fachlogik. Neue Spielregeln gehören grundsätzlich in `src/lib/`; Views sollen diese Regeln zusammensetzen und darstellen, nicht neu implementieren.

| Pfad | Verantwortung |
| --- | --- |
| `src/App.tsx` | Zentraler Spielzustand, Tick-Orchestrierung, Persistenzbrücken und Navigation zwischen Spielbereichen |
| `src/main.tsx` | React-Startpunkt, Root-Fehlergrenze und Produktionsregistrierung des Service Workers |
| `src/layout/` | Äußerer Anwendungsshell mit fixer Topbar und atmosphärischem Hintergrund |
| `src/components/` | Wiederverwendbare UI-Bausteine, Modals, Karten- und Navigationskomponenten |
| `src/views/` | Fachlich abgegrenzte Screens für Zentrale, Markt, Disposition, Bank, Personal, Werkstatt und Fuhrpark |
| `src/lib/` | Reine oder überwiegend zustandsarme Domänenlogik, Typen, Berechnungen und lokale Persistenz |
| `src/lib/sectionMetrics.ts` | Präsentationsneutrale Hof- und KPI-Berechnungen für einheitliche Kennzahlen in verschiedenen Views |
| `public/` | Kleine auslieferbare Web-Konfiguration, Manifest, Service Worker und PWA-Icons |
| `simulation/` | Reproduzierbare Balancing-Analysen, 365-Tage-Simulationen, Regressionen und Ergebnisberichte |
| `scripts/` | Sonstige Entwicklungs- und Balancinghilfen |
| `src-tauri/` | Tauri-Konfiguration und native Paketierung; unabhängig von der Browser-PWA nutzbar |

### Fachmodule und Zuständigkeiten

| Domäne | Kernmodule | Erweiterungsregel |
| --- | --- | --- |
| Zeit und Zugfortschritt | `gameTime.ts`, `tracking.ts`, `GameClockContext.ts` | Zeitskalierung und ETA-Mathematik zentral halten; UI-Komponenten lesen nur den bereitgestellten Uhrwert. |
| Disposition | `brh.ts`, `restRules.ts`, `pdl.ts`, `baugleisDeployments.ts` | Vor einer Abfahrt alle Voraussetzungen fachlich prüfen; UI-Warnungen dürfen keine Regeln duplizieren. |
| Fracht und Kalkulation | `orderMarket.ts`, `freightContracts.ts`, `operatingCosts.ts`, `tripCosts.ts` | Erlöse, Trasse, genau eine Energieart und PDL-Aufwand ausschließlich aus den zentralen Berechnungsfunktionen ableiten. |
| Finanzen | `bank.ts`, `financialStatements.ts`, `dailyFixedCosts.ts`, `maintenanceFund.ts` | Dispo dient nur dem operativen Puffer. Investitionen müssen über die Cash-only-Prüfung laufen. |
| Progression | `progression.ts`, `corporateMilestones.ts`, `achievements.ts` | Kernlevel sind bis 20 begrenzt; Konzernmeilensteine erweitern die Langzeitprogression ohne Reset. |
| Fuhrpark und Werkstatt | `dealer.ts`, `depot.ts`, `workshop.ts`, `wagonJobs.ts`, `rental.ts` | Angebotslogik, Kapazität und Fristen bleiben fachlich getrennt von den Kauf- und Modal-Komponenten. |
| Persistenz | `storage.ts`, `seed.ts`, `supabase.ts` | `seed.ts` ist der kanonische Startzustand. Lokale Persistenzänderungen müssen rückwärtsverträglich normalisiert werden. |

## Kernregeln für Erweiterungen

Die App verwendet einen Spieltick als kleinste Fortschrittseinheit. `App.tsx` fasst den Tick als kontrollierte Transaktion zusammen: Zug- und Personalfortschritt, Fristen, Wartung, Bank, Verträge, Depot, Vermietung, Events und Baugleis-Einsätze werden in definierter Reihenfolge verarbeitet. Neue wiederkehrende Kosten oder Einnahmen müssen deshalb als klar abgegrenzte Domänenfunktion integriert werden und dürfen nicht direkt in einer View mutiert werden.

Die **Dispo-Auslastung** wird zentral von `overdraftUtilization()` berechnet und steuert sowohl die gestaffelten Tageszinsen als auch Investitionssperren. `processBankTick()` zieht Dispozinsen vor der Kreditrate ein und aktualisiert danach den Sanierungsstatus. Die Kalkulation einer Frachtvorlage erfolgt über `calcOrderOperatingCosts()`: Trassengebühr, ausschließlich diesel- oder elektrisch betriebene Energie und gegebenenfalls PDL/AZF werden einzeln ausgewiesen, bevor der lokale Spiel-Nettoertrag entsteht.

Die **Schicht- und Ruhezeitprüfung** lebt in `driverRestStatus()`. Der Rückgabewert beschreibt bewusst nur die Verletzung; die Disposition entscheidet anschließend, ob eine Sperre oder eine explizit bestätigte Risikoentscheidung angeboten wird. Daraus bleiben Kopf- und Simulationsläufe konsistent.

## Befehle und Skripte

Alle Skripte werden aus dem Repository-Root ausgeführt. Simulationsergebnisse unter `simulation/output/` sind versionierte Nachweise für Balancingentscheidungen und keine Echtbetriebsprognosen.

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Startet die Vite-Entwicklungsvorschau. |
| `npm run build` | Erzeugt den Produktionsbuild unter `dist/`. |
| `npm run preview` | Liefert den gebauten Produktionsstand lokal aus. |
| `npm run lint` | Prüft TypeScript- und React-Dateien mit ESLint. |
| `npm run typecheck` | Führt die strenge TypeScript-Prüfung ohne Ausgabedateien aus. |
| `npm run simulate` | Startet das allgemeine Balancing-Skript in `scripts/simulateBalancing.ts`. |
| `npm run simulate:freight-year` | Berechnet den statischen Güterverkehrs-Jahreslauf über 365 virtuelle Tage. |
| `npm run simulate:freight-year:dynamic` | Berechnet den 365-Tage-Lauf mit dynamischer Flottenerweiterung. |
| `npm run analyze:freight-pricing` | Erstellt die Frachtpreis-Analyse sowie deren aufbereitete Ausgabe. |
| `npm run analyze:market-sizing` | Analysiert die Marktgrößenstaffelung von Aufträgen. |
| `npm run analyze:progression-design` | Analysiert Level-, Meilenstein- und Dispo-Kurve. |
| `npm run analyze:starting-capital` | Vergleicht 30-Tage-Startszenarien und dokumentiert die 150.000-€-Empfehlung. |
| `npm run test:progression-dispo` | Regression für Dispo-Stufen, Tageszinsen, Cash-only-Investitionen, Level-Cap und Konzernmeilensteine. |
| `npm run tauri:dev` | Startet die native Tauri-Entwicklungsumgebung. |
| `npm run tauri:build` | Paketiert die native Tauri-Anwendung. |
| `npm run test:clock-train` | Prüft Zeitfaktoren, Pause, Zugfortschritt, ETA und Geschwindigkeit deterministisch. |
| `npm run test:mobile-ui -- <Preview-URL>` | Prüft alle mobilen Kernansichten bei 390 × 844 px, einschließlich Zeitsteuerung, Disposition, Karte und Posteingang. |
| `npm run test:mobile-modals -- <Preview-URL>` | Prüft globale Gründungs-, Tutorial-, Handbuch-, Erfolgs-, Logout-, Firmen-, Bank- und Kartenlegenden-Overlays bei 390 × 844 px auf Viewportgrenzen und horizontalen Überlauf. |
| `npm run test:adaptive-layout -- <Preview-URL>` | Prüft die CSS/Viewport-Umschaltung zwischen 1440 × 900 px und 390 × 844 px sowie horizontalen Überlauf. |
| `npm run test:clock-runtime -- <Preview-URL>` | Bedient die mobilen 1×-, 2×-, 5×- und Pausensteuerungen per Browserautomation. |

## Qualitätsprüfung vor einem Push

Ein vollständiger, lokal reproduzierbarer Check kombiniert statische Analyse, Wirtschaftssimulation und die Browserregressionen. Die drei browsergestützten Skripte benötigen dazu einen laufenden Produktions-Preview.

```bash
npm run lint
npm run typecheck
npm run test:progression-dispo
npm run test:clock-train
npm run analyze:starting-capital
npm run build
npm run preview -- --host 0.0.0.0 --port 4176
npm run test:mobile-ui -- http://localhost:4176/
npm run test:mobile-modals -- http://localhost:4176/
npm run test:adaptive-layout -- http://localhost:4176/
npm run test:clock-runtime -- http://localhost:4176/
git diff --check
```

Für visuelle Fehler sollten mindestens die Zentrale, Frachtbörse, Disposition, Bank, Fuhrpark und Firma auf Desktop sowie bei **390 × 844 px** kontrolliert werden. Die mobilen Tests stellen sicher, dass Bottom-Bar und Zeitsteuerung sichtbar sind, während der adaptive Test bestätigt, dass Desktop-Navigation und mobile Schnellnavigation sich nicht gleichzeitig überlagern.

## PWA und Smartphone-Installation

Die Browserfassung enthält `public/manifest.json`, die Icons unter `public/icons/` und `public/sw.js`. Das Manifest definiert `standalone` als Darstellungsmodus und enthält valide 192- und 512-Pixel-PNG-Icons. Der Service Worker wird ausschließlich im Produktionsbuild registriert. Er cached den App-Shell-Startpunkt und gleichoriginige Build-Ressourcen zur Wiederverwendung nach einem erfolgreichen Erstaufruf; externe Kartentiles bleiben bewusst außerhalb des Caches, damit deren Quellen und Cache-Regeln unverändert bleiben.

> Für die Installierbarkeitswerbung moderner Chromium-Browser muss eine PWA über **HTTPS** oder lokal über `localhost` beziehungsweise `127.0.0.1` bereitgestellt werden. Ein Manifest mit Name, Start-URL, Standalone-Darstellung sowie 192- und 512-Pixel-Icons erfüllt die zentralen technischen Voraussetzungen. [1]

Auf Android erscheint die Installationsoption üblicherweise im Browsermenü oder in der Adressleiste. Auf iOS wird die App über das Teilen-Menü und **„Zum Home-Bildschirm“** installiert. Browser ohne PWA-Installation können das Spiel weiterhin normal im Browser nutzen. [1]

Bei einer Änderung an Shell-Dateien oder Cachingstrategie ist `CACHE_VERSION` in `public/sw.js` zu erhöhen. Dadurch werden alte Caches im Aktivierungsschritt bereinigt und Clients erhalten den neuen Stand. Die Registrierung, Installations- und Aktivierungsphasen folgen dem standardisierten Service-Worker-Lebenszyklus. [2]

## Git-Workflow

`main` ist der veröffentlichte Hauptbranch. Neue größere Spielbereiche werden auf einem Feature-Branch entwickelt, dort mit den oben genannten Checks validiert und erst dann nach `main` integriert. Arbeitsartefakte wie Screenshots, lokale Browserdaten, `node_modules/`, `dist/` und finale ZIP-Exporte gehören nicht in Commits, sofern sie nicht ausdrücklich als versionierter Nachweis vorgesehen sind.

```bash
git status
git add <gezielte-dateien>
git commit -m "Beschreibende Änderung"
git push origin main
```

## Bekannte technische Beobachtung

Der Produktionsbuild ist funktional, weist jedoch einen Vite-Hinweis auf einen JavaScript-Hauptchunk von über 500 kB aus. Das ist kein Laufzeitfehler. Bei einer späteren Performance-Iteration sollten besonders Karte, 3D-Hauptmenü und selten genutzte Ansichten per `React.lazy()` oder manueller Chunk-Aufteilung verzögert geladen werden.

## Referenzen

[1]: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable "MDN: Making PWAs installable"
[2]: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers "MDN: Using Service Workers"
