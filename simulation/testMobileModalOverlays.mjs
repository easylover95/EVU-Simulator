import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';

const width = Number(process.argv[3] ?? 390);
const height = Number(process.argv[4] ?? 844);
const debugPort = 9227;
const url = process.argv[2] ?? 'http://localhost:4176/';
const outputDir = '/home/ubuntu/evu-work/EVU-Simulator/simulation/modal-mobile-check';

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

function visibleClick(text) {
  return `(() => {
    const target = [...document.querySelectorAll('button, [role="button"]')].find((entry) => entry.offsetParent && entry.textContent?.replace(/\\s+/g, ' ').trim().includes(${JSON.stringify(text)}) && !entry.disabled);
    target?.click();
    return Boolean(target);
  })()`;
}

function clickSelector(selector) {
  return `(() => { const target = document.querySelector(${JSON.stringify(selector)}); target?.click(); return Boolean(target); })()`;
}

async function captureOverlay(client, name, selector) {
  await wait(180);
  const snapshot = await client.evaluate(`(() => {
    const target = document.querySelector(${JSON.stringify(selector)});
    const rect = target?.getBoundingClientRect();
    const computed = target ? getComputedStyle(target) : null;
    const controls = target ? [...target.querySelectorAll('button, input, select, textarea')].filter((element) => element.offsetParent) : [];
    return {
      present: Boolean(target && rect && rect.width > 0 && rect.height > 0),
      rect: rect ? { left: Math.round(rect.left), right: Math.round(rect.right), top: Math.round(rect.top), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) } : null,
      widthWithinViewport: Boolean(rect && rect.width <= window.innerWidth - 16 && rect.left >= 8 && rect.right <= window.innerWidth - 8),
      heightWithinViewport: Boolean(rect && rect.height <= window.innerHeight - 16 && rect.top >= 8 && rect.bottom <= window.innerHeight - 8),
      scrollableWhenNeeded: Boolean(computed && ['auto', 'scroll'].includes(computed.overflowY)),
      hasInteractiveControl: controls.length > 0,
      documentOverflow: document.documentElement.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth,
    };
  })()`);
  const screenshot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(`${outputDir}/${name}-${width}x${height}.png`, Buffer.from(screenshot.data, 'base64'));
  return snapshot;
}

const browser = spawn('chromium', [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--hide-scrollbars',
  `--remote-debugging-port=${debugPort}`,
  '--remote-allow-origins=*',
  '--user-data-dir=/tmp/evu-modal-mobile-chrome',
  `--window-size=${width},${height}`,
  url,
], { stdio: 'ignore' });

try {
  await mkdir(outputDir, { recursive: true });
  const target = await waitForDebugTarget();
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Page.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: width,
    screenHeight: height,
  });
  await wait(900);

  const checks = {};
  checks.gruendung = await captureOverlay(client, 'gruendung', '.modal-scrim form');
  await client.evaluate(visibleClick('Unternehmen gründen'));
  await wait(300);
  checks.tutorial = await captureOverlay(client, 'tutorial', '.tutorial-card');
  await client.evaluate(visibleClick('Überspringen'));
  await wait(500);

  await client.evaluate(clickSelector('[title="Handbuch"]'));
  checks.handbuch = await captureOverlay(client, 'handbuch', '[aria-labelledby="help-handbook-title"]');
  await client.evaluate(clickSelector('[aria-label="Handbuch schließen"]'));
  await wait(180);

  await client.evaluate(clickSelector('[aria-label^="Erfolge & Meilensteine"]'));
  checks.erfolge = await captureOverlay(client, 'erfolge', '[aria-labelledby="achievements-gallery-title"]');
  await client.evaluate(clickSelector('[aria-label="Schließen"]'));
  await wait(180);

  await client.evaluate(clickSelector('[title="Zum Hauptmenü"]'));
  checks.logout = await captureOverlay(client, 'logout', '[aria-labelledby="logout-confirm-title"]');
  await client.evaluate(visibleClick('Abbrechen'));
  await wait(180);

  await client.evaluate(clickSelector('[title="Firma bearbeiten"]'));
  checks.firmaBearbeiten = await captureOverlay(client, 'firma-bearbeiten', '.modal-scrim form');
  await client.evaluate(visibleClick('Spiel zurücksetzen'));
  checks.spielstandReset = await captureOverlay(client, 'spielstand-reset', '[aria-labelledby="reset-game-confirm-title"]');
  await client.evaluate(visibleClick('Abbrechen'));
  await wait(180);
  await client.evaluate(visibleClick('Abbrechen'));
  await wait(180);

  await client.evaluate(`document.querySelectorAll('.app-mobile-quicknav-item')[2]?.click()`);
  await wait(350);
  await client.evaluate(visibleClick('Details'));
  checks.lokDetails = await captureOverlay(client, 'lok-details', '.modal-scrim > .fi-card');
  await client.evaluate(clickSelector('.modal-scrim'));
  await wait(180);
  await client.evaluate(visibleClick('Wagengruppe vermieten'));
  checks.wagenVermietung = await captureOverlay(client, 'wagen-vermietung', '.modal-scrim > .fi-card');
  await client.evaluate(clickSelector('.modal-scrim'));
  await wait(180);

  await client.evaluate(`document.querySelectorAll('.app-mobile-quicknav-item')[1]?.click()`);
  await wait(350);
  await client.evaluate(`document.querySelector('tbody tr')?.click()`);
  checks.auftragsDetails = await captureOverlay(client, 'auftrags-details', '.modal-scrim > .fi-card');
  await client.evaluate(clickSelector('.modal-scrim'));
  await wait(180);

  await client.evaluate(`document.querySelectorAll('.app-mobile-quicknav-item')[4]?.click()`);
  await wait(350);
  await client.evaluate(visibleClick('Einstellung prüfen'));
  checks.personalPruefung = await captureOverlay(client, 'personal-pruefung', '[role="dialog"]');
  await client.evaluate(clickSelector('[aria-label="Dialog schließen"]'));
  await wait(180);

  await client.evaluate(`document.querySelectorAll('.app-mobile-quicknav-item')[3]?.click()`);
  await wait(350);
  await client.evaluate(visibleClick('Darlehen auszahlen'));
  checks.bankBestaetigung = await captureOverlay(client, 'bank-bestaetigung', '[aria-labelledby="bank-confirm-title"]');
  await client.evaluate(visibleClick('Abbrechen'));
  await wait(180);

  await client.evaluate(`document.querySelectorAll('.app-mobile-quicknav-item')[5]?.click()`);
  await wait(1_500);
  await client.evaluate(clickSelector('[data-map-legend-trigger]'));
  checks.kartenLegende = await captureOverlay(client, 'karten-legende', '[data-map-legend-panel]');
  await client.evaluate(clickSelector('[aria-label="Legende schließen"]'));

  const report = {
    viewport: { width, height },
    checks,
    pass: Object.values(checks).every((entry) => entry.present && entry.widthWithinViewport && entry.heightWithinViewport && entry.hasInteractiveControl && !entry.documentOverflow),
  };
  await writeFile(`${outputDir}/modal-mobile-report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  client.close();
  if (!report.pass) process.exitCode = 2;
} finally {
  browser.kill('SIGTERM');
}
