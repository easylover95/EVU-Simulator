import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';

const debugPort = 9226;
const url = process.argv[2] ?? 'http://localhost:4175/';
const outputPath = '/home/ubuntu/evu-work/EVU-Simulator/simulation/mobile-clock-check/runtime-clock-report.json';

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

function minutesBetween(start, end) {
  const [startHour, startMinute] = start.split(' ').at(-1).split(':').map(Number);
  const [endHour, endMinute] = end.split(' ').at(-1).split(':').map(Number);
  return ((endHour * 60 + endMinute) - (startHour * 60 + startMinute) + 24 * 60) % (24 * 60);
}

const browser = spawn('chromium', [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--hide-scrollbars',
  `--remote-debugging-port=${debugPort}`,
  '--remote-allow-origins=*',
  '--user-data-dir=/tmp/evu-runtime-clock-chrome',
  '--window-size=390,844',
  url,
], { stdio: 'ignore' });

try {
  const target = await waitForDebugTarget();
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844,
  });
  await wait(900);

  await client.evaluate(`(() => {
    const found = [...document.querySelectorAll('button')].find((entry) => entry.offsetParent && entry.textContent?.trim().toUpperCase() === 'UNTERNEHMEN GRÜNDEN');
    found?.click();
  })()`);
  await wait(300);
  await client.evaluate(`(() => {
    const skip = [...document.querySelectorAll('button')].find((entry) => entry.offsetParent && entry.textContent?.trim().toUpperCase() === 'ÜBERSPRINGEN');
    skip?.click();
  })()`);
  await wait(450);

  const readClock = () => client.evaluate(`(() => ({
    display: document.querySelector('.app-topbar-time')?.textContent?.trim() ?? '',
    minute: Number(localStorage.getItem('evu-game-minute') ?? 0),
    running: document.querySelector('.app-mobile-clock-icon.is-on')?.getAttribute('aria-label') ?? '',
    activeSpeed: document.querySelector('.app-mobile-clock-speeds button.is-on')?.textContent?.trim() ?? '',
  }))()`);
  const chooseSpeed = (index) => client.evaluate(`document.querySelectorAll('.app-mobile-clock-speeds button')[${index}]?.click()`);

  await client.evaluate(`document.querySelector('.app-mobile-clock-icon[aria-label="Spiel starten"]')?.click()`);
  await chooseSpeed(0);
  const oneStart = await readClock();
  await wait(3_250);
  const oneEnd = await readClock();

  await chooseSpeed(1);
  const twoStart = await readClock();
  await wait(3_250);
  const twoEnd = await readClock();

  await chooseSpeed(2);
  const fiveStart = await readClock();
  await wait(12_350);
  const fiveEnd = await readClock();

  await client.evaluate(`document.querySelector('.app-mobile-clock-icon[aria-label="Spiel pausieren"]')?.click()`);
  const pauseStart = await readClock();
  await wait(3_250);
  const pauseEnd = await readClock();

  const report = {
    result: 'PASS',
    oneX: { start: oneStart, end: oneEnd, gameMinutesAdvanced: minutesBetween(oneStart.display, oneEnd.display) },
    twoX: { start: twoStart, end: twoEnd, gameMinutesAdvanced: minutesBetween(twoStart.display, twoEnd.display) },
    fiveX: { start: fiveStart, end: fiveEnd, gameMinutesAdvanced: minutesBetween(fiveStart.display, fiveEnd.display) },
    pause: { start: pauseStart, end: pauseEnd, gameMinutesAdvanced: minutesBetween(pauseStart.display, pauseEnd.display) },
  };

  const onePass = report.oneX.gameMinutesAdvanced >= 2 && report.oneX.gameMinutesAdvanced <= 4 && oneEnd.activeSpeed === '1×';
  const twoPass = report.twoX.gameMinutesAdvanced >= 5 && report.twoX.gameMinutesAdvanced <= 8 && twoEnd.activeSpeed === '2×';
  const fivePass = report.fiveX.gameMinutesAdvanced >= 55 && report.fiveX.gameMinutesAdvanced <= 70 && fiveEnd.activeSpeed === '5×';
  const pausePass = report.pause.gameMinutesAdvanced === 0 && pauseEnd.running === 'Spiel pausieren';
  report.result = onePass && twoPass && fivePass && pausePass ? 'PASS' : 'FAIL';

  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  client.close();
  if (report.result !== 'PASS') process.exitCode = 2;
} finally {
  browser.kill('SIGTERM');
}
