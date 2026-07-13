import { spawn, spawnSync } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const previewPort = Number(process.env.HOME_MOBILE_TEST_PORT || 4357);
const debugPort = Number(process.env.HOME_MOBILE_TEST_DEBUG_PORT || 9357);
const origin = `http://127.0.0.1:${previewPort}`;
const viewport = { width: 390, height: 844, deviceScaleFactor: 3 };
const targets = [
  { index: 0, name: 'Writer', expectedPath: '/writer/' },
  { index: 1, name: 'Architect', expectedPath: '/architect/' },
  { index: 2, name: 'Artist', expectedPath: '/artist/' },
];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const canAccess = async (filePath) => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const findBrowser = async () => {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await canAccess(candidate)) return candidate;
  }

  for (const command of ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge', 'msedge']) {
    const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [command], {
      encoding: 'utf8',
    });
    const found = result.stdout?.trim().split(/\r?\n/)[0];
    if (result.status === 0 && found) return found;
  }

  throw new Error('Chrome or Edge was not found. Set CHROME_PATH to run this test.');
};

const waitForHttp = async (url, timeoutMs = 15000) => {
  const start = Date.now();
  let lastError;

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }

  throw lastError || new Error(`Timed out waiting for ${url}`);
};

class CdpClient {
  constructor(url) {
    this.url = url;
    this.id = 0;
    this.pending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
      } else {
        pending.resolve(message.result);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  close() {
    this.socket?.close();
  }
}

const createTarget = async () => {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, {
    method: 'PUT',
  });
  if (!response.ok) {
    throw new Error(`Unable to create Chrome target: ${response.status} ${response.statusText}`);
  }
  return response.json();
};

const runtimeValue = async (client, expression, awaitPromise = false) => {
  const result = await client.send('Runtime.evaluate', {
    awaitPromise,
    expression,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed');
  }

  return result.result.value;
};

const waitForPredicate = async (client, expression, timeoutMs = 10000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await runtimeValue(client, expression);
    if (value) return value;
    await delay(50);
  }
  throw new Error(`Timed out waiting for predicate: ${expression}`);
};

const configureMobileColdContext = async (client) => {
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Network.enable');
  await client.send('Storage.clearDataForOrigin', {
    origin,
    storageTypes: 'cookies,local_storage,session_storage,cache_storage,indexeddb,websql',
  });
  await client.send('Network.clearBrowserCache');
  await client.send('Network.clearBrowserCookies');
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });
  await client.send('Network.emulateNetworkConditions', {
    downloadThroughput: (900 * 1024) / 8,
    latency: 140,
    offline: false,
    uploadThroughput: (350 * 1024) / 8,
  });
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await client.send('Emulation.setDeviceMetricsOverride', {
    ...viewport,
    mobile: true,
  });
  await client.send('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 1,
  });
};

const waitForHomepageVisible = async (client) => {
  await waitForPredicate(
    client,
    `(() => document.readyState === 'complete' && !!document.querySelector('.triptych'))()`,
    20000,
  );

  return waitForPredicate(
    client,
    `(() => {
      const section = document.querySelector('.triptych');
      if (!section) return false;
      const rect = section.getBoundingClientRect();
      const style = getComputedStyle(section);
      return Number(style.opacity) > 0.35 &&
        style.pointerEvents !== 'none' &&
        rect.width > 0 &&
        rect.height > 0 &&
        !document.documentElement.classList.contains('home-preloader-initial-home-active');
    })()`,
    20000,
  );
};

const getTargetPoint = async (client, index) =>
  runtimeValue(
    client,
    `(() => {
      const stack = document.querySelectorAll('.column-stack')[${index}];
      if (!stack) return null;
      const rect = stack.getBoundingClientRect();
      return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2)
      };
    })()`,
  );

const tap = async (client, point) => {
  await client.send('Input.dispatchTouchEvent', {
    touchPoints: [{ x: point.x, y: point.y, radiusX: 2, radiusY: 2, force: 1, id: 1 }],
    type: 'touchStart',
  });
  await delay(45);
  await client.send('Input.dispatchTouchEvent', {
    touchPoints: [],
    type: 'touchEnd',
  });
};

const runTarget = async (client, target) => {
  await configureMobileColdContext(client);
  await client.send('Page.navigate', {
    url: `${origin}/?cold-mobile=${Date.now()}-${target.index}`,
  });

  await waitForHomepageVisible(client);
  const point = await getTargetPoint(client, target.index);
  if (!point) throw new Error(`No tap point found for ${target.name}`);

  const beforeTap = Date.now();
  await tap(client, point);

  await waitForPredicate(
    client,
    `(() => location.pathname === ${JSON.stringify(target.expectedPath)})()`,
    5000,
  );

  return {
    durationMs: Date.now() - beforeTap,
    name: target.name,
    point,
  };
};

let previewProcess;
let browserProcess;
let profileDir;
let client;

try {
  profileDir = await mkdtemp(path.join(os.tmpdir(), 'varelism-home-mobile-'));
  const previewCommand = process.platform === 'win32' ? 'cmd.exe' : 'npm';
  const previewArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', `npm run preview -- --host 127.0.0.1 --port ${previewPort}`]
    : ['run', 'preview', '--', '--host', '127.0.0.1', '--port', `${previewPort}`];

  previewProcess = spawn(previewCommand, previewArgs, {
    cwd: root,
    stdio: 'ignore',
    windowsHide: true,
  });

  await waitForHttp(origin);

  const browserPath = await findBrowser();
  browserProcess = spawn(browserPath, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-gpu',
    '--disable-extensions',
    '--mute-audio',
    '--no-default-browser-check',
    '--no-first-run',
    'about:blank',
  ], {
    stdio: 'ignore',
    windowsHide: true,
  });

  await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`);
  const target = await createTarget();
  client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();

  const results = [];
  for (const targetConfig of targets) {
    results.push(await runTarget(client, targetConfig));
  }

  console.log('Cold mobile homepage tap regression passed.');
  for (const result of results) {
    console.log(`${result.name}: navigated in ${result.durationMs}ms from (${result.point.x}, ${result.point.y})`);
  }
} finally {
  client?.close();
  browserProcess?.kill();
  previewProcess?.kill();
  if (profileDir) {
    await delay(500);
    await rm(profileDir, { force: true, recursive: true }).catch(() => {});
  }
}
