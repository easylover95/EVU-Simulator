import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';

const baseUrl = process.argv[2] ?? 'http://localhost:4175/';
const outputDir = '/home/ubuntu/evu-work/EVU-Simulator/simulation/mobile-clock-check';
const debugPort = 9231;
const profileDir = '/tmp/evu-adaptive-layout-chrome';

rmSync(profileDir, { recursive: true, force: true });

class CdpClient {
  constructor(socketUrl) {
    this.socketUrl = socketUrl;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.socketUrl);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('CDP timeout')), 10_000);
      this.socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
      this.socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('CDP connection failed')); }, { once: true });
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
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'Runtime evaluation failed');
    return result.result?.value;
  }

  close() { this.socket?.close(); }
}

async function target() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
      const page = pages.find((entry) => entry.type === 'page');
      if (page?.webSocketDebuggerUrl) return page;
    } catch { /* Chromium is still booting. */ }
    await wait(250);
  }
  throw new Error('No browser target available');
}

function adaptiveSnapshot() {
  return `(() => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect();
    const visible = (selector) => {
      const entry = document.querySelector(selector);
      const box = entry?.getBoundingClientRect();
      const style = entry ? getComputedStyle(entry) : null;
      return Boolean(box && box.width > 0 && box.height > 0 && style?.display !== 'none' && style?.visibility !== 'hidden');
    };
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      desktopMedia: matchMedia('(min-width: 769px)').matches,
      mobileMedia: matchMedia('(max-width: 768px)').matches,
      mobileBottomBar: visible('.app-mobile-quicknav'),
      mobileTimeControls: visible('.app-mobile-clock'),
      desktopTopClock: visible('.app-topbar-clock'),
      desktopNavigation: visible('.app-topbar nav'),
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth,
      widths: { document: document.documentElement.scrollWidth, body: document.body.scrollWidth },
      mobileBarRect: rect('.app-mobile-quicknav') ?? null,
    };
  })()`;
}

const browser = spawn('chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${debugPort}`, '--remote-allow-origins=*',
  `--user-data-dir=${profileDir}`, '--window-size=1440,900', baseUrl,
], { stdio: 'ignore' });

try {
  await mkdir(outputDir, { recursive: true });
  const page = await target();
  const client = new CdpClient(page.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Page.enable');
  await client.send('Runtime.enable');

  const results = {};
  for (const [name, width, height, mobile] of [
    ['desktop', 1440, 900, false],
    ['mobile', 390, 844, true],
  ]) {
    await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: height });
    await wait(400);
    await client.evaluate(`(() => { const create = [...document.querySelectorAll('button')].find((entry) => entry.offsetParent && entry.textContent?.toUpperCase().includes('UNTERNEHMEN GRÜNDEN')); create?.click(); })()`);
    await wait(200);
    await client.evaluate(`(() => { const skip = [...document.querySelectorAll('button')].find((entry) => entry.offsetParent && entry.textContent?.toUpperCase().includes('ÜBERSPRINGEN')); skip?.click(); })()`);
    await wait(400);
    results[name] = await client.evaluate(adaptiveSnapshot());
    const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(`${outputDir}/adaptive-${name}-${width}x${height}.png`, Buffer.from(shot.data, 'base64'));
  }

  results.pass = results.desktop.desktopMedia && !results.desktop.mobileMedia
    && !results.desktop.mobileBottomBar && !results.desktop.mobileTimeControls
    && results.desktop.desktopTopClock && results.desktop.desktopNavigation && !results.desktop.horizontalOverflow
    && results.mobile.mobileMedia && !results.mobile.desktopMedia
    && results.mobile.mobileBottomBar && results.mobile.mobileTimeControls
    && !results.mobile.desktopTopClock && !results.mobile.horizontalOverflow;
  await writeFile(`${outputDir}/adaptive-layout-report.json`, `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify(results, null, 2));
  if (!results.pass) process.exitCode = 2;
  client.close();
} finally {
  browser.kill('SIGTERM');
}
