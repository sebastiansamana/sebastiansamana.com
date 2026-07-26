import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const requestedPreviewPort = Number(process.env.HOME_MOBILE_TEST_PORT || 0);
const requestedDebugPort = Number(process.env.HOME_MOBILE_TEST_DEBUG_PORT || 0);
const viewport = { width: 390, height: 844, deviceScaleFactor: 3 };
const targets = [
  { index: 0, name: 'Writer', expectedPath: '/writer/' },
  { index: 1, name: 'Architect', expectedPath: '/architect/' },
  { index: 2, name: 'Painter', expectedPath: '/painter/' },
];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.glb', 'model/gltf-binary'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mp4', 'video/mp4'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.ttf', 'font/ttf'],
  ['.wasm', 'application/wasm'],
  ['.webm', 'video/webm'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

const startStaticServer = (port = 0) =>
  new Promise((resolve, reject) => {
    const distRoot = path.resolve(root, 'dist');
    const server = createServer((request, response) => {
      void (async () => {
        const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
        const decodedPath = decodeURIComponent(requestUrl.pathname);
        const relativePath = `${decodedPath.replace(/^\/+/, '')}${decodedPath.endsWith('/') ? 'index.html' : ''}`;
        const filePath = path.resolve(distRoot, relativePath);
        const relativeToDist = path.relative(distRoot, filePath);

        if (relativeToDist.startsWith('..') || path.isAbsolute(relativeToDist)) {
          response.writeHead(403);
          response.end('Forbidden');
          return;
        }

        try {
          const body = await readFile(filePath);
          response.writeHead(200, {
            'Cache-Control': 'no-store',
            'Content-Length': body.byteLength,
            'Content-Type':
              contentTypes.get(path.extname(filePath).toLowerCase()) ||
              'application/octet-stream',
          });
          response.end(request.method === 'HEAD' ? undefined : body);
        } catch (error) {
          if (error?.code !== 'ENOENT' && error?.code !== 'EISDIR') throw error;
          response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          response.end('Not found');
        }
      })().catch((error) => {
        if (!response.headersSent) {
          response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        }
        response.end(`Static server error: ${error.message}`);
      });
    });
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });

const stopStaticServer = (server) =>
  new Promise((resolve, reject) => {
    if (!server) {
      resolve();
      return;
    }
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
    server.closeAllConnections?.();
  });

const waitForChildExit = async (child, timeoutMs = 3000) => {
  if (!child || child.exitCode !== null || child.signalCode !== null) return true;

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
};

const stopProcessTree = async (child) => {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }

  if (await waitForChildExit(child)) return;

  if (process.platform !== 'win32') {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
  if (!(await waitForChildExit(child))) {
    throw new Error(`Unable to stop process tree ${child.pid}`);
  }
};

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

const waitForDevToolsPort = async (profileDir, browserProcess, timeoutMs = 15000) => {
  const activePortFile = path.join(profileDir, 'DevToolsActivePort');
  const start = Date.now();
  let lastError;

  while (Date.now() - start < timeoutMs) {
    if (browserProcess.exitCode !== null || browserProcess.signalCode !== null) {
      throw new Error('Browser exited before its debugging endpoint became available');
    }
    try {
      const [portLine] = (await readFile(activePortFile, 'utf8')).split(/\r?\n/);
      const port = Number(portLine);
      if (Number.isInteger(port) && port > 0) return port;
    } catch (error) {
      lastError = error;
    }
    await delay(50);
  }

  throw lastError || new Error('Timed out waiting for the browser debugging endpoint');
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

const installHomeShellProbe = (client) =>
  client.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const probe = { samples: [] };
      window.__homeShellProbe = probe;
      const sample = () => {
        const header = document.querySelector('[data-varelism-site-header]');
        const footer = document.querySelector('[data-varelism-site-footer]');
        const toState = (element) => {
          if (!(element instanceof HTMLElement)) return null;
          const style = getComputedStyle(element);
          let ancestorsVisible = true;
          let effectiveOpacity = 1;
          let current = element;
          while (current instanceof HTMLElement) {
            const currentStyle = getComputedStyle(current);
            const currentOpacity = Number(currentStyle.opacity);
            if (Number.isFinite(currentOpacity)) effectiveOpacity *= currentOpacity;
            if (
              currentStyle.display === 'none' ||
              currentStyle.visibility !== 'visible'
            ) {
              ancestorsVisible = false;
            }
            current = current.parentElement;
          }
          return {
            ancestorsVisible,
            display: style.display,
            effectiveOpacity,
            opacity: Number(style.opacity),
            visibility: style.visibility,
          };
        };
        if (header instanceof HTMLElement && footer instanceof HTMLElement) {
          probe.samples.push({
            active: document.documentElement.classList.contains(
              'home-preloader-initial-home-active',
            ),
            footer: toState(footer),
            hasHomePreloader: Boolean(document.querySelector('[data-home-preloader]')),
            hasHomePreloaderHandoff: Boolean(
              document.querySelector('[data-home-preloader-handoff]'),
            ),
            hasHomeRouteMarker:
              document.documentElement.hasAttribute('data-varelism-home-route'),
            header: toState(header),
            pathname: window.location.pathname,
            revealing: document.documentElement.classList.contains(
              'home-preloader-initial-home-revealing',
            ),
            time: performance.now(),
          });
        }
        if (!probe.stopSampling) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    })();`,
  });

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
      const header = document.querySelector('[data-varelism-site-header]');
      const footer = document.querySelector('[data-varelism-site-footer]');
      if (!section || !header || !footer) return false;
      const rect = section.getBoundingClientRect();
      const style = getComputedStyle(section);
      const shellVisible = (element) => {
        let effectiveOpacity = 1;
        let current = element;
        while (current instanceof HTMLElement) {
          const currentStyle = getComputedStyle(current);
          if (
            currentStyle.display === 'none' ||
            currentStyle.visibility !== 'visible'
          ) {
            return false;
          }
          const opacity = Number(currentStyle.opacity);
          if (Number.isFinite(opacity)) effectiveOpacity *= opacity;
          current = current.parentElement;
        }
        return effectiveOpacity >= 0.999;
      };
      return Number(style.opacity) > 0.35 &&
        style.pointerEvents !== 'none' &&
        rect.width > 0 &&
        rect.height > 0 &&
        document.documentElement.hasAttribute('data-varelism-home-route') &&
        !document.documentElement.classList.contains('home-preloader-initial-home-active') &&
        !document.documentElement.classList.contains('home-preloader-initial-home-revealing') &&
        shellVisible(header) &&
        shellVisible(footer);
    })()`,
    20000,
  );
};

const isShellFullyVisible = (shell) =>
  Boolean(
    shell &&
      shell.display !== 'none' &&
      shell.visibility === 'visible' &&
      shell.ancestorsVisible &&
      Math.abs(shell.effectiveOpacity - 1) <= 0.001,
  );

const verifyHomepageProbe = (samples, label, homePath) => {
  assert.ok(samples.length > 2, `${label}: homepage shell probe collected no frames`);
  const hiddenFrames = samples.filter(
    (sample) =>
      !isShellFullyVisible(sample.header) ||
      !isShellFullyVisible(sample.footer),
  );
  assert.ok(hiddenFrames.length > 0, `${label}: homepage preloader hid no shell frames`);
  hiddenFrames.forEach((sample, index) => {
    assert.equal(
      sample.pathname,
      homePath,
      `${label}: hidden shell frame ${index} occurred outside the homepage`,
    );
    assert.equal(
      sample.hasHomeRouteMarker,
      true,
      `${label}: hidden shell frame ${index} lacked the home marker`,
    );
    assert.equal(
      sample.hasHomePreloader,
      true,
      `${label}: hidden shell frame ${index} lacked the actual home preloader`,
    );
    assert.equal(
      sample.active || sample.revealing,
      true,
      `${label}: hidden shell frame ${index} escaped the preloader state`,
    );
  });

  const intentionallyHiddenFrames = hiddenFrames.filter(
    (sample) =>
      sample.active &&
      sample.header?.effectiveOpacity <= 0.01 &&
      sample.footer?.effectiveOpacity <= 0.01,
  );
  assert.ok(
    intentionallyHiddenFrames.length > 0,
    `${label}: homepage preloader did not exercise its allowed fully hidden state`,
  );

  const finalSample = samples.at(-1);
  for (const shellName of ['header', 'footer']) {
    assert.equal(
      isShellFullyVisible(finalSample?.[shellName]),
      true,
      `${label}: final homepage ${shellName} is not fully visible`,
    );
  }

  return intentionallyHiddenFrames.length;
};

const verifyNonHomeNavigationSamples = (samples, label, destinationPath) => {
  const destinationSamples = samples.filter(
    (sample) => sample.pathname === destinationPath,
  );
  assert.ok(
    destinationSamples.length > 1,
    `${label}: no destination shell frames were sampled`,
  );
  destinationSamples.forEach((sample, index) => {
    assert.equal(
      sample.hasHomeRouteMarker,
      false,
      `${label}: destination frame ${index} retained the home marker`,
    );
    for (const shellName of ['header', 'footer']) {
      assert.equal(
        isShellFullyVisible(sample[shellName]),
        true,
        `${label}: destination frame ${index} hid the ${shellName}`,
      );
    }
  });
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
  const homeProbe = await runtimeValue(
    client,
    `(() => ({
      hasHomeRouteMarker: document.documentElement.hasAttribute('data-varelism-home-route'),
      samples: window.__homeShellProbe?.samples || [],
    }))()`,
  );
  assert.equal(
    homeProbe.hasHomeRouteMarker,
    true,
    `${target.name}: homepage preloader scope marker is missing`,
  );
  const hiddenPreloaderFrames = verifyHomepageProbe(
    homeProbe.samples,
    target.name,
    '/',
  );
  const navigationStartSampleIndex = homeProbe.samples.length;
  const point = await getTargetPoint(client, target.index);
  if (!point) throw new Error(`No tap point found for ${target.name}`);

  const beforeTap = Date.now();
  await tap(client, point);

  try {
    await waitForPredicate(
      client,
      `(() => location.pathname === ${JSON.stringify(target.expectedPath)})()`,
      10000,
    );
  } catch (error) {
    let diagnostic = { unavailable: true };
    try {
      diagnostic = await runtimeValue(
        client,
        `(() => {
          const point = ${JSON.stringify(point)};
          const topElement = document.elementFromPoint(point.x, point.y);
          const overlay = document.querySelector('[data-home-return-overlay]');
          const preloader = document.querySelector('[data-home-preloader]');
          return {
            activeElement: document.activeElement?.className || document.activeElement?.tagName || '',
            classes: document.documentElement.className,
            href: location.href,
            overlayOpacity: overlay ? Number(getComputedStyle(overlay).opacity) : null,
            pendingHomeReturn: Boolean(window.__varelismPendingHomeReturn),
            pendingPreloaderNavigation: Boolean(window.__varelismPendingPreloaderNavigation),
            preloaderClasses: preloader?.className || '',
            topElement: topElement?.className || topElement?.tagName || '',
          };
        })()`,
      );
    } catch (diagnosticError) {
      diagnostic = { unavailable: true, error: diagnosticError.message };
    }
    throw new Error(`${error.message}; state=${JSON.stringify(diagnostic)}`);
  }
  await delay(350);
  await runtimeValue(
    client,
    `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`,
    true,
  );
  const navigationSamples = await runtimeValue(
    client,
    `window.__homeShellProbe?.samples?.slice(${navigationStartSampleIndex}) || []`,
  );
  verifyNonHomeNavigationSamples(
    navigationSamples,
    `${target.name} home navigation`,
    target.expectedPath,
  );

  return {
    durationMs: Date.now() - beforeTap,
    hiddenPreloaderFrames,
    name: target.name,
    point,
  };
};

const runSpanishHomepageControl = async (client) => {
  await configureMobileColdContext(client);
  await client.send('Page.navigate', {
    url: `${origin}/esp/?cold-mobile-spanish=${Date.now()}`,
  });
  await waitForHomepageVisible(client);
  const probe = await runtimeValue(
    client,
    `(() => ({
      hasHomeRouteMarker: document.documentElement.hasAttribute('data-varelism-home-route'),
      samples: window.__homeShellProbe?.samples || [],
    }))()`,
  );
  assert.equal(
    probe.hasHomeRouteMarker,
    true,
    'Spanish homepage: preloader scope marker is missing',
  );
  return verifyHomepageProbe(probe.samples, 'Spanish homepage', '/esp/');
};

let browserProcess;
let profileDir;
let client;
let debugPort;
let origin;
let staticServer;
let primaryError;
const cleanupErrors = [];

try {
  assert.ok(
    Number.isInteger(requestedPreviewPort) && requestedPreviewPort >= 0,
    'Invalid preview port',
  );
  assert.ok(
    Number.isInteger(requestedDebugPort) && requestedDebugPort >= 0,
    'Invalid browser debugging port',
  );
  staticServer = await startStaticServer(requestedPreviewPort);
  const serverAddress = staticServer.address();
  const previewPort =
    typeof serverAddress === 'object' && serverAddress ? serverAddress.port : 0;
  assert.ok(
    Number.isInteger(previewPort) && previewPort > 0,
    'Static server did not bind a port',
  );
  origin = `http://127.0.0.1:${previewPort}`;
  profileDir = await mkdtemp(path.join(os.tmpdir(), 'varelism-home-mobile-'));
  await waitForHttp(origin);

  const browserPath = await findBrowser();
  browserProcess = spawn(browserPath, [
    '--headless=new',
    `--remote-debugging-port=${requestedDebugPort}`,
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
    detached: process.platform !== 'win32',
    stdio: 'ignore',
    windowsHide: true,
  });

  debugPort = requestedDebugPort || (await waitForDevToolsPort(profileDir, browserProcess));
  await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`);
  const target = await createTarget();
  client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Page.enable');
  await installHomeShellProbe(client);

  const results = [];
  for (const targetConfig of targets) {
    results.push(await runTarget(client, targetConfig));
  }
  const spanishHiddenPreloaderFrames = await runSpanishHomepageControl(client);

  console.log('Cold mobile homepage tap regression passed.');
  for (const result of results) {
    console.log(
      `${result.name}: ${result.hiddenPreloaderFrames} allowed homepage-only hidden-shell frames; navigated in ${result.durationMs}ms from (${result.point.x}, ${result.point.y})`,
    );
  }
  console.log(
    `Spanish homepage: ${spanishHiddenPreloaderFrames} allowed homepage-only hidden-shell frames; shell fully restored`,
  );
} catch (error) {
  primaryError = error;
} finally {
  client?.close();
  for (const cleanup of [
    () => stopProcessTree(browserProcess),
    () => stopStaticServer(staticServer),
    () =>
      profileDir
        ? rm(profileDir, {
            force: true,
            maxRetries: 5,
            recursive: true,
            retryDelay: 200,
          })
        : Promise.resolve(),
  ]) {
    try {
      await cleanup();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
}

if (primaryError) throw primaryError;
if (cleanupErrors.length > 0) {
  throw new AggregateError(cleanupErrors, 'Home mobile test cleanup failed');
}
