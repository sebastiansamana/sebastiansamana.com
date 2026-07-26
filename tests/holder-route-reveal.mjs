import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const targets = [
  { path: '/architect/projects/', heading: 'Work in progress...' },
  { path: '/esp/arquitecto/proyectos/', heading: 'Trabajo en curso...' },
  { path: '/writer/books/', heading: 'Work in progress...' },
  { path: '/esp/escritor/libros/', heading: 'Trabajo en curso...' },
  { path: '/painter/exhibitions/', heading: 'Work in progress...' },
  { path: '/esp/pintor/exposiciones/', heading: 'Trabajo en curso...' },
];
const viewports = [
  { name: 'desktop', width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false },
  { name: 'phone', width: 390, height: 844, deviceScaleFactor: 3, mobile: true },
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
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.ttf', 'font/ttf'],
  ['.wasm', 'application/wasm'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

const startStaticServer = () =>
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
            'Content-Type': contentTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream',
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
    server.listen(0, '127.0.0.1', () => {
      resolve(server);
    });
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
  if (!child?.pid) return;
  if (child.exitCode !== null || child.signalCode !== null) return;

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

const waitForHttp = async (url, timeoutMs = 15000, child) => {
  const start = Date.now();
  let lastError;

  while (Date.now() - start < timeoutMs) {
    if (child && (child.exitCode !== null || child.signalCode !== null)) {
      throw new Error(`Process exited before ${url} became available`);
    }
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

const waitForPredicate = async (client, expression, timeoutMs = 15000) => {
  const start = Date.now();
  let lastError;

  while (Date.now() - start < timeoutMs) {
    try {
      const value = await runtimeValue(client, expression);
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(25);
  }

  throw lastError || new Error(`Timed out waiting for predicate: ${expression}`);
};

const installRevealProbe = (client) =>
  client.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const probe = {
        events: [],
        samples: [],
      };
      window.__holderRevealProbe = probe;

      ['animationstart', 'animationend', 'animationcancel'].forEach((type) => {
        document.addEventListener(type, (event) => {
          if (
            event.target !== document.querySelector('main') ||
            event.animationName !== 'varelism-route-reveal'
          ) {
            return;
          }
          probe.events.push({
            animationName: event.animationName,
            elapsedTime: event.elapsedTime,
            time: performance.now(),
            type,
          });
        }, true);
      });

      const sample = () => {
        const main = document.querySelector('main');
        if (main instanceof HTMLElement) {
          const mainStyle = getComputedStyle(main);
          const bodyStyle = document.body ? getComputedStyle(document.body) : null;
          probe.samples.push({
            bodyBackground: bodyStyle?.backgroundColor || '',
            hasMarker: main.hasAttribute('data-varelism-route-reveal'),
            hasReadyClass: main.classList.contains('is-route-reveal-ready'),
            opacity: Number(mainStyle.opacity),
            pointerEvents: mainStyle.pointerEvents,
            time: performance.now(),
          });
        }

        if (performance.now() < 5000) {
          window.requestAnimationFrame(sample);
        }
      };

      window.requestAnimationFrame(sample);
    })();`,
  });

const configureViewport = async (client, viewport) => {
  const { name: _name, ...metrics } = viewport;
  await client.send('Emulation.setDeviceMetricsOverride', metrics);
  await client.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  });
  await client.send('Emulation.setTouchEmulationEnabled', {
    enabled: viewport.mobile,
    maxTouchPoints: 1,
  });
};

const collectResult = (client) =>
  runtimeValue(
    client,
    `(() => {
      const main = document.querySelector('main');
      const heading = document.querySelector('.work-in-progress-page__heading');
      const mainStyle = main ? getComputedStyle(main) : null;
      return {
        heading: heading?.textContent?.trim() || '',
        mainMarkerCount: document.querySelectorAll('main[data-varelism-route-reveal]').length,
        mainReady: main?.classList.contains('is-route-reveal-ready') || false,
        opacity: mainStyle ? Number(mainStyle.opacity) : null,
        pointerEvents: mainStyle?.pointerEvents || '',
        probe: window.__holderRevealProbe,
        animationDuration: mainStyle?.animationDuration || '',
        animationName: mainStyle?.animationName || '',
        animationTimingFunction: mainStyle?.animationTimingFunction || '',
      };
    })()`,
  );

const verifyResult = (result, target, viewport) => {
  const label = `${viewport.name} ${target.path}`;
  assert.equal(result.heading, target.heading, `${label}: localized heading changed`);
  assert.equal(result.mainMarkerCount, 1, `${label}: reveal marker must be present in initial main`);
  assert.ok(result.probe?.samples?.length > 2, `${label}: reveal probe did not collect samples`);

  const first = result.probe.samples[0];
  assert.equal(first.hasMarker, true, `${label}: first rendered frame did not contain reveal marker`);
  assert.equal(first.hasReadyClass, false, `${label}: first rendered frame was already revealed`);
  assert.ok(first.opacity <= 0.01, `${label}: first rendered frame opacity was ${first.opacity}`);
  assert.equal(first.pointerEvents, 'none', `${label}: first rendered frame was interactive`);
  assert.equal(
    first.bodyBackground,
    'rgb(255, 255, 255)',
    `${label}: first rendered frame was not over white`,
  );

  assert.equal(result.animationName, 'varelism-route-reveal', `${label}: reveal animation changed`);
  assert.equal(result.animationDuration, '0.45s', `${label}: animation duration changed`);
  assert.equal(result.animationTimingFunction, 'ease', `${label}: animation easing changed`);

  const animationStart = result.probe.events.find((event) => event.type === 'animationstart');
  const animationEnd = result.probe.events.find((event) => event.type === 'animationend');
  const animationCancel = result.probe.events.find((event) => event.type === 'animationcancel');
  const revealSummary = JSON.stringify({
    events: result.probe.events,
    samples: result.probe.samples.map(({ hasReadyClass, opacity, time }) => ({
      hasReadyClass,
      opacity,
      time,
    })),
  });
  assert.ok(animationStart, `${label}: opacity animation did not start (${revealSummary})`);
  assert.ok(animationEnd, `${label}: opacity animation did not end (${revealSummary})`);
  assert.equal(animationCancel, undefined, `${label}: opacity animation was cancelled`);
  assert.ok(
    animationStart.time <= animationEnd.time,
    `${label}: opacity animation events were out of order (${revealSummary})`,
  );
  assert.ok(
    Math.abs(animationEnd.elapsedTime - 0.45) <= 0.005,
    `${label}: animation elapsed ${animationEnd.elapsedTime}s instead of 0.45s`,
  );

  assert.equal(result.mainReady, true, `${label}: reveal class was not applied`);
  assert.equal(result.opacity, 1, `${label}: final content opacity was ${result.opacity}`);
  assert.equal(result.pointerEvents, 'auto', `${label}: final content was not interactive`);

  return {
    path: target.path,
    viewport: viewport.name,
  };
};

const verifySharedConstants = async () => {
  const [layoutSource, globalCss, ...holderHtml] = await Promise.all([
    readFile(path.join(root, 'src', 'layouts', 'BaseLayout.astro'), 'utf8'),
    readFile(path.join(root, 'src', 'styles', 'global.css'), 'utf8'),
    ...targets.map((target) => {
      const routeSegments = target.path.split('/').filter(Boolean);
      return readFile(path.join(root, 'dist', ...routeSegments, 'index.html'), 'utf8');
    }),
  ]);

  assert.match(
    layoutSource,
    /const routeBlankHoldMs = 70;/,
    'The shared client-navigation white hold must remain 70ms',
  );
  assert.match(
    globalCss,
    /--varelism-route-fade-ms:\s*450ms;/,
    'The universal route fade must remain 450ms',
  );
  holderHtml.forEach((html, index) => {
    assert.match(
      html,
      /<main data-varelism-route-reveal data-varelism-route-reveal-from-white(?:\s|>)/,
      `${targets[index].path}: built main is missing its server-rendered white reveal markers`,
    );
  });
};

let browserProcess;
let profileDir;
let client;
let debugPort;
let origin;
let staticServer;

try {
  await verifySharedConstants();
  staticServer = await startStaticServer();
  const serverAddress = staticServer.address();
  const previewPort = typeof serverAddress === 'object' && serverAddress ? serverAddress.port : 0;
  assert.ok(Number.isInteger(previewPort) && previewPort > 0, 'Static server did not bind a port');
  origin = `http://127.0.0.1:${previewPort}`;
  profileDir = await mkdtemp(path.join(os.tmpdir(), 'varelism-holder-reveal-'));
  await waitForHttp(origin);

  const browserPath = await findBrowser();
  const requestedDebugPort = Number(process.env.HOLDER_REVEAL_TEST_DEBUG_PORT || 0);
  assert.ok(
    Number.isInteger(requestedDebugPort) && requestedDebugPort >= 0,
    'Invalid browser debugging port',
  );
  browserProcess = spawn(browserPath, [
    '--headless=new',
    `--remote-debugging-port=${requestedDebugPort}`,
    `--user-data-dir=${profileDir}`,
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-default-apps',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-renderer-backgrounding',
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
  await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`, 15000, browserProcess);
  const browserTarget = await createTarget();
  client = new CdpClient(browserTarget.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Page.enable');
  await client.send('Page.bringToFront');
  await client.send('Runtime.enable');
  await client.send('Network.enable');
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });
  await installRevealProbe(client);

  await configureViewport(client, viewports[0]);
  const warmupUrl = `${origin}/buy/?holder-reveal-warmup=${Date.now()}`;
  await client.send('Page.navigate', {
    url: warmupUrl,
  });
  await waitForPredicate(
    client,
    `(() => {
      const main = document.querySelector('main');
      return location.href === ${JSON.stringify(warmupUrl)} &&
        document.readyState === 'complete' &&
        main?.classList.contains('is-route-reveal-ready') &&
        Number(getComputedStyle(main).opacity) === 1;
    })()`,
  );
  await delay(250);

  const results = [];
  for (const viewport of viewports) {
    await configureViewport(client, viewport);
    for (const target of targets) {
      const targetUrl = `${origin}${target.path}?holder-reveal-test=${viewport.name}-${Date.now()}`;
      await client.send('Page.navigate', {
        url: targetUrl,
      });
      await waitForPredicate(
        client,
        `(() => {
          const main = document.querySelector('main');
          const probe = window.__holderRevealProbe;
          return location.href === ${JSON.stringify(targetUrl)} &&
            document.readyState === 'complete' &&
            main?.classList.contains('is-route-reveal-ready') &&
            Number(getComputedStyle(main).opacity) === 1 &&
            probe?.events?.some((event) => event.type === 'animationend') &&
            !probe?.events?.some((event) => event.type === 'animationcancel');
        })()`,
      );
      const result = await collectResult(client);
      results.push(verifyResult(result, target, viewport));
    }
  }

  console.log('Holder route reveal regression passed.');
  for (const result of results) {
    console.log(`${result.viewport} ${result.path}: hidden first main frame over white; 450ms ease fade`);
  }
} finally {
  client?.close();
  await stopProcessTree(browserProcess);
  await stopStaticServer(staticServer);
  if (profileDir) {
    await rm(profileDir, {
      force: true,
      maxRetries: 5,
      recursive: true,
      retryDelay: 200,
    });
  }
}
