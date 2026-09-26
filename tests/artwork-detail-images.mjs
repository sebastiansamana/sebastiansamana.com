import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const slugs = [
  'chequered-forest',
  'uiko',
  'yozo',
  'wei-s-rhino',
  'the-dive',
  'cena-en-figueretas',
];
const detailDelayMs = 4000;
const viewport = { width: 390, height: 844, deviceScaleFactor: 3, mobile: true };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const contentTypes = new Map([
  ['.avif', 'image/avif'],
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

const verifyBuiltHtml = async () => {
  for (const slug of slugs) {
    for (const prefix of ['painter/everything', 'esp/pintor/todo']) {
      const htmlPath = path.join(root, 'dist', prefix, slug, 'index.html');
      const html = await readFile(htmlPath, 'utf8');
      const label = `/${prefix}/${slug}/`;

      assert.match(html, /type="image\/avif"/, `${label}: AVIF source is missing`);
      assert.match(html, /type="image\/webp"/, `${label}: WebP source is missing`);
      assert.match(html, /data:image\/webp;base64,/, `${label}: inline preview is missing`);
      assert.match(html, /data-artwork-progressive/, `${label}: progressive frame is missing`);
      assert.match(
        html,
        /data-varelism-route-reveal-fonts="false"/,
        `${label}: immediate detail reveal opt-out is missing`,
      );
      assert.doesNotMatch(
        html,
        /data-varelism-route-reveal-images="true"/,
        `${label}: route reveal still waits for the full image`,
      );
      assert.doesNotMatch(
        html,
        new RegExp(`src="/images/artworks/${slug}\\.(?:png|jpe?g|webp)"`),
        `${label}: normal detail rendering still requests the original`,
      );
    }
  }
};

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
          if (decodedPath.startsWith('/images/artworks/detail/')) await delay(detailDelayMs);
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
        if (!response.headersSent) response.writeHead(500);
        response.end(`Static server error: ${error.message}`);
      });
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });

const stopStaticServer = (server) =>
  new Promise((resolve, reject) => {
    if (!server) return resolve();
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections?.();
  });

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
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await canAccess(candidate)) return candidate;
  }

  for (const command of ['google-chrome', 'chromium', 'microsoft-edge', 'msedge']) {
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
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
};

const waitForDevToolsPort = async (profileDir, browserProcess, timeoutMs = 15000) => {
  const activePortFile = path.join(profileDir, 'DevToolsActivePort');
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (browserProcess.exitCode !== null || browserProcess.signalCode !== null) {
      throw new Error('Browser exited before its debugging endpoint became available');
    }
    try {
      const [portLine] = (await readFile(activePortFile, 'utf8')).split(/\r?\n/);
      const port = Number(portLine);
      if (Number.isInteger(port) && port > 0) return port;
    } catch {}
    await delay(50);
  }
  throw new Error('Timed out waiting for the browser debugging endpoint');
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
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  close() {
    this.socket?.close();
  }
}

const runtimeValue = async (client, expression, awaitPromise = false) => {
  const result = await client.send('Runtime.evaluate', {
    awaitPromise,
    expression,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text ||
        'Runtime evaluation failed',
    );
  }
  return result.result.value;
};

const waitForPredicate = async (client, expression, timeoutMs = 10000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await runtimeValue(client, expression);
    if (value) return value;
    await delay(40);
  }
  throw new Error(`Timed out waiting for predicate: ${expression}`);
};

const stopProcessTree = (child) => {
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
};

const verifyProgressiveRoute = async (client, origin, route) => {
  await client.send('Network.clearBrowserCache');
  await client.send('Page.navigate', { url: `${origin}${route}?progressive-test=${Date.now()}` });

  const previewExpression = `(() => {
      const article = document.querySelector('.artwork-detail');
      const frame = document.querySelector('[data-artwork-progressive]');
      const image = frame?.querySelector('[data-artwork-detail-full]');
      if (!(article instanceof HTMLElement) || !(frame instanceof HTMLElement) || !(image instanceof HTMLImageElement)) return false;
      const articleOpacity = Number(getComputedStyle(article).opacity);
      const previewStyle = getComputedStyle(frame, '::before');
      const imageOpacity = Number(getComputedStyle(image).opacity);
      if (articleOpacity < 0.2 || frame.dataset.artworkImageReady === 'true') return false;
      if (!previewStyle.backgroundImage.includes('data:image/webp;base64,') || Number(previewStyle.opacity) < 0.9) return false;
      if (imageOpacity > 0.01) return false;
      return { articleOpacity, imageOpacity, previewOpacity: Number(previewStyle.opacity) };
    })()`;
  let preview;
  try {
    preview = await waitForPredicate(client, previewExpression, 3000);
  } catch (error) {
    const diagnostic = await runtimeValue(
      client,
      `(() => {
        const article = document.querySelector('.artwork-detail');
        const frame = document.querySelector('[data-artwork-progressive]');
        const image = frame?.querySelector('[data-artwork-detail-full]');
        return {
          articleOpacity: article ? getComputedStyle(article).opacity : null,
          backgroundImage: frame ? getComputedStyle(frame, '::before').backgroundImage.slice(0, 80) : null,
          error: frame?.dataset.artworkImageError || null,
          imageComplete: image?.complete ?? null,
          imageOpacity: image ? getComputedStyle(image).opacity : null,
          naturalWidth: image?.naturalWidth || 0,
          ready: frame?.dataset.artworkImageReady || null,
          url: location.href,
        };
      })()`,
    );
    throw new Error(`${error.message}; state=${JSON.stringify(diagnostic)}`);
  }

  await waitForPredicate(
    client,
    `document.querySelector('[data-artwork-progressive]')?.dataset.artworkImageReady === 'true'`,
    8000,
  );
  await delay(380);

  const final = await runtimeValue(
    client,
    `(() => {
      const frame = document.querySelector('[data-artwork-progressive]');
      const image = frame?.querySelector('[data-artwork-detail-full]');
      const resources = performance.getEntriesByType('resource').map((entry) => entry.name);
      const candidateWidth = Number(image?.currentSrc.match(/-(\\d+)\\.avif$/)?.[1] || 0);
      return {
        candidateWidth,
        cls: window.__artworkDetailTest?.cls || 0,
        currentSrc: image?.currentSrc || '',
        imageOpacity: image ? Number(getComputedStyle(image).opacity) : -1,
        naturalWidth: image?.naturalWidth || 0,
        originalRequests: resources.filter((url) => /\\/images\\/artworks\\/[^/]+\\.(?:png|jpe?g)$/.test(new URL(url).pathname)),
        previewOpacity: frame ? Number(getComputedStyle(frame, '::before').opacity) : -1,
      };
    })()`,
  );

  assert.match(final.currentSrc, /\/images\/artworks\/detail\/[^/]+-\d+\.avif$/);
  assert.ok(final.candidateWidth >= 1024, `${route}: selected candidate is unexpectedly small`);
  assert.ok(final.candidateWidth <= 1440, `${route}: selected image is oversized at ${final.candidateWidth}px`);
  assert.equal(final.originalRequests.length, 0, `${route}: original artwork was requested`);
  assert.ok(final.imageOpacity >= 0.99, `${route}: sharp image did not finish its fade`);
  assert.ok(final.previewOpacity <= 0.01, `${route}: preview did not fade away`);
  assert.ok(final.cls <= 0.01, `${route}: layout shifted by ${final.cls}`);

  return { final, preview };
};

let browserProcess;
let client;
let profileDir;
let server;
let primaryError;

try {
  await verifyBuiltHtml();
  server = await startStaticServer();
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  await waitForHttp(origin);

  profileDir = await mkdtemp(path.join(os.tmpdir(), 'samana-artwork-detail-'));
  const browserPath = await findBrowser();
  browserProcess = spawn(browserPath, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-gpu',
    '--disable-extensions',
    '--no-default-browser-check',
    '--no-first-run',
    'about:blank',
  ], {
    detached: process.platform !== 'win32',
    stdio: 'ignore',
    windowsHide: true,
  });

  const debugPort = await waitForDevToolsPort(profileDir, browserProcess);
  await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`);
  const targetResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' });
  const target = await targetResponse.json();
  client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Network.enable');
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });
  await client.send('Emulation.setDeviceMetricsOverride', viewport);
  await client.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      window.__artworkDetailTest = { cls: 0 };
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) window.__artworkDetailTest.cls += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    })();`,
  });

  const english = await verifyProgressiveRoute(
    client,
    origin,
    '/painter/everything/chequered-forest/',
  );
  const spanish = await verifyProgressiveRoute(
    client,
    origin,
    '/esp/pintor/todo/chequered-forest/',
  );
  assert.equal(
    new URL(english.final.currentSrc).pathname,
    new URL(spanish.final.currentSrc).pathname,
    'English and Spanish selected different artwork assets',
  );

  console.log('Artwork detail image regression passed.');
  console.log(`Checked ${slugs.length * 2} built bilingual detail pages.`);
  console.log(
    `Cold 390px/DPR3 preview appeared before the delayed image; selected ${english.final.candidateWidth}px AVIF with CLS ${english.final.cls}.`,
  );
} catch (error) {
  primaryError = error;
} finally {
  client?.close();
  stopProcessTree(browserProcess);
  await stopStaticServer(server).catch((error) => {
    if (!primaryError) primaryError = error;
  });
  if (profileDir) {
    await rm(profileDir, { force: true, maxRetries: 5, recursive: true, retryDelay: 200 }).catch((error) => {
      if (!primaryError) primaryError = error;
    });
  }
}

if (primaryError) throw primaryError;
