import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';

const width = 390;
const height = 844;
const debugPort = 9225;
const url = process.argv[2] ?? 'http://localhost:4175/';
const outputDir = '/home/ubuntu/evu-work/EVU-Simulator/simulation/mobile-clock-check';

class CdpClient {
  constructor(socketUrl) {
    this.socketUrl = socketUrl;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.socketUrl);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('CDP-WebSocket-Timeout')), 10_000);
      this.socket.addEventListener('open', () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      this.socket.addEventListener('error', (event) => {
        clearTimeout(timeout);
        reject(event.error ?? new Error('CDP-WebSocket-Verbindung fehlgeschlagen'));
      }, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result ?? {});
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'Runtime-Auswertung fehlgeschlagen');
    return result.result?.value;
  }

  close() {
    this.socket?.close();
  }
}

async function waitForDebugTarget() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
      const page = targets.find((target) => target.type === 'page');
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      // Chromium is still starting.
    }
    await wait(250);
  }
  throw new Error('CDP-Debugziel wurde nicht bereitgestellt');
}

async function capture(client, name) {
  const screenshot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(`${outputDir}/${name}-390x844.png`, Buffer.from(screenshot.data, 'base64'));
  return client.evaluate(`(() => {
    const clock = document.querySelector('.app-mobile-clock');
    const rect = clock?.getBoundingClientRect();
    return {
      view: document.querySelector('h1, h2')?.textContent?.trim() ?? '',
      clockVisible: Boolean(rect && rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight),
      clockRect: rect ? { left: Math.round(rect.left), right: Math.round(rect.right), top: Math.round(rect.top), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) } : null,
      width: window.innerWidth,
      height: window.innerHeight,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      activeSpeed: document.querySelector('.app-mobile-clock-speeds button.is-on')?.textContent?.trim() ?? '',
      activeClockControl: document.querySelector('.app-mobile-clock-icon.is-on')?.getAttribute('aria-label') ?? '',
    };
  })()`);
}

const browser = spawn('chromium', [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--hide-scrollbars',
  `--remote-debugging-port=${debugPort}`,
  '--remote-allow-origins=*',
  '--user-data-dir=/tmp/evu-mobile-clock-chrome',
  `--window-size=${width},${height}`,
  url,
], { stdio: 'ignore' });

try {
  await mkdir(outputDir, { recursive: true });
  const target = await waitForDebugTarget();
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: width,
    screenHeight: height,
  });
  await wait(900);

  await client.evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((entry) => entry.offsetParent && entry.textContent?.trim().toUpperCase() === 'UNTERNEHMEN GRÜNDEN');
    button?.click();
  })()`);
  await wait(350);
  await client.evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((entry) => entry.offsetParent && entry.textContent?.trim().toUpperCase() === 'ÜBERSPRINGEN');
    button?.click();
  })()`);
  await wait(500);

  await client.evaluate(`document.querySelectorAll('.app-mobile-clock-speeds button')[2]?.click()`);
  await wait(150);
  const speedAfterClick = await client.evaluate(`document.querySelector('.app-mobile-clock-speeds button.is-on')?.textContent?.trim()`);
  await client.evaluate(`document.querySelector('.app-mobile-clock-icon[aria-label="Spiel pausieren"]')?.click()`);
  await wait(150);
  const pauseAfterClick = await client.evaluate(`document.querySelector('.app-mobile-clock-icon.is-on')?.getAttribute('aria-label')`);

  const checks = {};
  const views = [
    ['home', 0],
    ['fracht', 1],
    ['flotte', 2],
    ['bank', 3],
    ['firma', 4],
    ['disposition', 5],
  ];
  for (const [name, index] of views) {
    await client.evaluate(`document.querySelectorAll('.app-mobile-quicknav-item')[${index}]?.click()`);
    await wait(name === 'disposition' ? 5_000 : 450);
    checks[name] = await capture(client, name);
    if (name === 'disposition') {
      checks[name].map = await client.evaluate(`(() => {
        const tiles = [...document.querySelectorAll('.fi-live-map .leaflet-tile')];
        const loaded = tiles.filter((tile) => tile.complete && tile.naturalWidth > 0);
        const overlap = (a, b) => Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
        const status = document.querySelector('[data-map-status]');
        const picker = document.querySelector('[data-map-style-trigger]');
        const zoom = document.querySelector('.fi-live-map .leaflet-control-zoom');
        const statusRect = status?.getBoundingClientRect();
        const pickerRect = picker?.getBoundingClientRect();
        const zoomRect = zoom?.getBoundingClientRect();
        return {
          tileCount: tiles.length,
          loadedTileCount: loaded.length,
          usesOpenStreetMap: loaded.some((tile) => tile.currentSrc.includes('tile.openstreetmap.org')),
          mapStyle: document.querySelector('.fi-live-map')?.getAttribute('data-map-style') ?? '',
          filterPresent: Boolean(picker),
          mapVisible: Boolean(document.querySelector('.fi-live-map')),
          apiKeyWatermarkAbsent: !document.querySelector('.fi-live-map')?.textContent?.includes('API KEY REQUIRED'),
          zoomBelowHeader: Boolean(zoomRect && statusRect && zoomRect.top > statusRect.bottom),
          zoomClearOfLayerPicker: !overlap(zoomRect, pickerRect),
        };
      })()`);
      checks[name].legendInitial = await client.evaluate(`document.querySelector('[data-map-legend-trigger]')?.getAttribute('aria-expanded') === 'false'`);
      await client.evaluate(`document.querySelector('[data-map-legend-trigger]')?.click()`);
      await wait(160);
      checks[name].legend = await client.evaluate(`(() => {
        const trigger = document.querySelector('[data-map-legend-trigger]');
        const panel = document.querySelector('[data-map-legend-panel]');
        const rect = panel?.getBoundingClientRect();
        return {
          triggerPresent: Boolean(trigger),
          expanded: trigger?.getAttribute('aria-expanded') === 'true',
          panelVisible: Boolean(rect && rect.width > 0 && rect.height > 0),
          panelWidth: rect ? Math.round(rect.width) : 0,
          panelBottom: rect ? Math.round(rect.bottom) : 0,
          panelText: panel?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        };
      })()`);
      const legendScreenshot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(`${outputDir}/disposition-legend-390x844.png`, Buffer.from(legendScreenshot.data, 'base64'));
      await client.evaluate(`document.querySelector('[data-map-legend-trigger]')?.click()`);
      await wait(120);

      const styles = [
        ['satellite', 'server.arcgisonline.com'],
        ['dark', '/dark_all/'],
        ['voyager', '/rastertiles/voyager/'],
        ['osm', 'tile.openstreetmap.org'],
      ];
      const styleChecks = {};
      for (const [style, sourceFragment] of styles) {
        const opened = await client.evaluate(`(() => { const trigger = document.querySelector('[data-map-style-trigger]'); trigger?.click(); return { exists: Boolean(trigger), open: Boolean(document.querySelector('[data-map-style-option]')) }; })()`);
        await wait(120);
        const selected = await client.evaluate(`(() => { const option = document.querySelector('[data-map-style-option="${style}"]'); option?.click(); return { exists: Boolean(option) }; })()`);
        await wait(style === 'satellite' ? 7_000 : 2_200);
        const layerSnapshot = await client.evaluate(`(() => {
          const tiles = [...document.querySelectorAll('.fi-live-map .leaflet-tile')];
          const loaded = tiles.filter((tile) => tile.complete && tile.naturalWidth > 0);
          return {
            selected: document.querySelector('.fi-live-map')?.dataset.mapStyle ?? '',
            matchingBaseTiles: loaded.filter((tile) => tile.currentSrc.includes('${sourceFragment}')).length,
            apiKeyWatermarkAbsent: !document.querySelector('.fi-live-map')?.textContent?.includes('API KEY REQUIRED'),
          };
        })()`);
        styleChecks[style] = { ...layerSnapshot, opened, selectedOption: selected };
      }
      checks[name].mapStyleChecks = styleChecks;
    }
  }
  const report = {
    viewport: { width, height },
    interaction: { selectedSpeed: speedAfterClick, selectedClockControl: pauseAfterClick },
    checks,
    pass: Object.values(checks).every((entry) => entry.clockVisible && entry.documentScrollWidth <= width && entry.bodyScrollWidth <= width)
      && checks.disposition?.view === 'Disposition'
      && checks.disposition?.map?.mapVisible
      && checks.disposition?.map?.mapStyle === 'osm'
      && checks.disposition?.map?.usesOpenStreetMap
      && checks.disposition?.map?.apiKeyWatermarkAbsent
      && checks.disposition?.map?.zoomBelowHeader
      && checks.disposition?.map?.zoomClearOfLayerPicker
      && checks.disposition?.legendInitial
      && checks.disposition?.legend?.triggerPresent
      && checks.disposition?.legend?.expanded
      && checks.disposition?.legend?.panelVisible
      && checks.disposition?.legend?.panelWidth <= width
      && checks.disposition?.legend?.panelBottom <= height
      && checks.disposition?.legend?.panelText.includes('Bahnknoten')
      && checks.disposition?.mapStyleChecks?.satellite?.selected === 'satellite'
      && checks.disposition?.mapStyleChecks?.satellite?.matchingBaseTiles > 0
      && checks.disposition?.mapStyleChecks?.dark?.selected === 'dark'
      && checks.disposition?.mapStyleChecks?.dark?.matchingBaseTiles > 0
      && checks.disposition?.mapStyleChecks?.voyager?.selected === 'voyager'
      && checks.disposition?.mapStyleChecks?.voyager?.matchingBaseTiles > 0
      && checks.disposition?.mapStyleChecks?.osm?.selected === 'osm'
      && checks.disposition?.mapStyleChecks?.osm?.matchingBaseTiles > 0
      && checks.disposition?.mapStyleChecks?.osm?.apiKeyWatermarkAbsent
      && speedAfterClick === '5×'
      && pauseAfterClick === 'Spiel pausieren',
  };
  await writeFile(`${outputDir}/mobile-clock-report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  client.close();
  if (!report.pass) process.exitCode = 2;
} finally {
  browser.kill('SIGTERM');
}
