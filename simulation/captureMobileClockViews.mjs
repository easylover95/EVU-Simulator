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
  ];
  for (const [name, index] of views) {
    await client.evaluate(`document.querySelectorAll('.app-mobile-quicknav-item')[${index}]?.click()`);
    await wait(450);
    checks[name] = await capture(client, name);
  }
  const report = {
    viewport: { width, height },
    interaction: { selectedSpeed: speedAfterClick, selectedClockControl: pauseAfterClick },
    checks,
    pass: Object.values(checks).every((entry) => entry.clockVisible && entry.documentScrollWidth <= width && entry.bodyScrollWidth <= width)
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
