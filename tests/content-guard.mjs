import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const portfolioRoutes = [
  { archive: '/architect/portfolios/', detail: '/architect/portfolios/studio-2-2/', pdf: '/architect/portfolios/studio-2-2/pdf/' },
  { archive: '/esp/arquitecto/portafolios/', detail: '/esp/arquitecto/portafolios/studio-2-2/', pdf: '/esp/arquitecto/portafolios/studio-2-2/pdf/' },
];
const writingRoutes = ['/writer/everything/ghost/', '/esp/escritor/todo/ghost/'];
const contentTypes = new Map([
  ['.avif', 'image/avif'], ['.css', 'text/css; charset=utf-8'], ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'], ['.jpeg', 'image/jpeg'], ['.jpg', 'image/jpeg'], ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'], ['.json', 'application/json'], ['.pdf', 'application/pdf'],
  ['.png', 'image/png'], ['.svg', 'image/svg+xml'], ['.wasm', 'application/wasm'],
  ['.webp', 'image/webp'], ['.woff', 'font/woff'], ['.woff2', 'font/woff2'],
]);

const builtHtml = (route) => readFile(path.join(root, 'dist', route.replace(/^\/+/, ''), 'index.html'), 'utf8');
const verifyBuiltHtml = async () => {
  for (const { archive, detail, pdf } of portfolioRoutes) {
    const [archiveHtml, detailHtml, pdfHtml] = await Promise.all([builtHtml(archive), builtHtml(detail), builtHtml(pdf)]);
    for (const [route, html] of [[archive, archiveHtml], [detail, detailHtml]]) {
      assert.match(html, new RegExp(`href="${pdf}"`), `${route}: controlled viewer link is missing`);
      assert.doesNotMatch(html, /<a\b[^>]*href="[^"]*\.pdf(?:[?#][^"]*)?"/i, `${route}: exposes a direct PDF link`);
    }
    assert.match(pdfHtml, /data-content-guard="pdf"/, `${pdf}: viewer guard is missing`);
    assert.equal((pdfHtml.match(/\bdata-pdf-page(?:\s|>)/g) || []).length, 39, `${pdf}: page placeholders changed`);
    assert.doesNotMatch(pdfHtml, /<(?:iframe|embed|object)\b/i, `${pdf}: uses a native document viewer`);
    assert.doesNotMatch(pdfHtml, /<a\b[^>]*(?:\bdownload\b|href="[^"]*\.pdf(?:[?#][^"]*)?")/i, `${pdf}: offers PDF download UI`);
    assert.doesNotMatch(pdfHtml, /data-native-pdf-url/, `${pdf}: still redirects to the native PDF`);
  }
  for (const route of writingRoutes) {
    assert.match(await builtHtml(route), /class="author-item-body"[^>]*data-content-guard="text"/, `${route}: body guard is missing`);
  }
};

// PDF.js must be tested against a server that supports byte ranges, like production hosting.
const startStaticServer = () => new Promise((resolve, reject) => {
  const distRoot = path.resolve(root, 'dist');
  const server = createServer((request, response) => {
    void (async () => {
      const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
      const filePath = path.resolve(distRoot, `${pathname.replace(/^\/+/, '')}${pathname.endsWith('/') ? 'index.html' : ''}`);
      const relative = path.relative(distRoot, filePath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      try {
        const body = await readFile(filePath);
        // Ensure the artwork preview remains usable while its sharp image arrives.
        if (pathname.startsWith('/images/artworks/detail/')) await delay(2000);
        const headers = {
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store',
          'Content-Type': contentTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream',
        };
        const range = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
        if (range) {
          const start = range[1] ? Number(range[1]) : Math.max(0, body.length - Number(range[2]));
          const end = range[1] && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
          if (start >= body.length || start > end) {
            response.writeHead(416, { ...headers, 'Content-Range': `bytes */${body.length}` }).end();
            return;
          }
          response.writeHead(206, { ...headers, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${body.length}` });
          response.end(request.method === 'HEAD' ? undefined : body.subarray(start, end + 1));
          return;
        }
        response.writeHead(200, { ...headers, 'Content-Length': body.length });
        response.end(request.method === 'HEAD' ? undefined : body);
      } catch (error) {
        if (error?.code !== 'ENOENT' && error?.code !== 'EISDIR') throw error;
        response.writeHead(404).end('Not found');
      }
    })().catch((error) => {
      if (!response.headersSent) response.writeHead(500);
      response.end(error.message);
    });
  });
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve(server));
});

const canAccess = async (filePath) => {
  try { await access(filePath); return true; } catch { return false; }
};
const findBrowser = async () => {
  const candidates = [process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium',
  ].filter(Boolean);
  for (const candidate of candidates) if (await canAccess(candidate)) return candidate;
  for (const command of ['google-chrome', 'chromium', 'microsoft-edge', 'msedge']) {
    const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [command], { encoding: 'utf8' });
    if (result.status === 0 && result.stdout?.trim()) return result.stdout.trim().split(/\r?\n/)[0];
  }
  throw new Error('Chrome or Edge was not found. Set CHROME_PATH to run this test.');
};
const waitForDevToolsPort = async (profileDir, browserProcess) => {
  for (const deadline = Date.now() + 15000; Date.now() < deadline;) {
    if (browserProcess.exitCode !== null || browserProcess.signalCode !== null) throw new Error('Browser exited before DevTools started');
    try {
      const port = Number((await readFile(path.join(profileDir, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0]);
      if (Number.isInteger(port) && port > 0) return port;
    } catch {}
    await delay(50);
  }
  throw new Error('Timed out waiting for browser DevTools');
};
class CdpClient {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); }
  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
    this.socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Browser DevTools connection closed'));
      }
      this.pending.clear();
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Browser DevTools command timed out: ${method}`));
      }, 20000);
      this.pending.set(id, { resolve, reject, timeout });
    });
  }
  close() { this.socket?.close(); }
}
const runtimeValue = async (client, expression, awaitPromise = false) => {
  const result = await client.send('Runtime.evaluate', { awaitPromise, expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
};
const waitForPredicate = async (client, expression, timeoutMs = 15000) => {
  for (const deadline = Date.now() + timeoutMs; Date.now() < deadline;) {
    const result = await runtimeValue(client, expression);
    if (result) return result;
    await delay(50);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
};
const navigate = async (client, origin, route) => {
  await client.send('Page.navigate', { url: `${origin}${route}?content-guard-test=${Date.now()}` });
  await waitForPredicate(client, `location.pathname === ${JSON.stringify(route)} && document.readyState === 'complete'`);
};
const assertEvent = async (client, selector, type, prevented, label = selector) => {
  const result = await runtimeValue(client, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return { missing: true };
    const event = new Event(${JSON.stringify(type)}, { bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return { prevented: event.defaultPrevented };
  })()`);
  assert.equal(result.missing, undefined, `${label}: event target is missing`);
  assert.equal(result.prevented, prevented, `${label}: ${type} prevention changed`);
};
const verifyWriting = async (client, origin, route) => {
  await navigate(client, origin, route);
  await waitForPredicate(client, `document.querySelector('.author-item-detail')?.classList.contains('is-route-reveal-ready')`);
  await assertEvent(client, '[data-content-guard="text"] p', 'contextmenu', true, route);
  await assertEvent(client, '[data-content-guard="text"] p', 'copy', true, route);
  await assertEvent(client, '.author-item-header h1', 'contextmenu', false, route);
  await assertEvent(client, '.author-item-back', 'dragstart', false, route);
  const result = await runtimeValue(client, `(() => {
    const body = document.querySelector('[data-content-guard="text"]');
    const header = document.querySelector('.author-item-header');
    const selection = window.getSelection();
    const copySelection = (element) => {
      selection.removeAllRanges();
      const range = document.createRange(); range.selectNodeContents(element); selection.addRange(range);
      const event = new Event('copy', { bubbles: true, cancelable: true }); document.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const guardedSelection = copySelection(body);
    const metadataSelection = copySelection(header);
    const mixedSelection = copySelection(document.querySelector('.author-item-detail'));
    const inlineLink = document.createElement('a');
    inlineLink.href = '#copy-focus-fixture'; inlineLink.textContent = 'Copy focus fixture'; body.append(inlineLink); inlineLink.focus();
    const headerRange = document.createRange(); headerRange.selectNodeContents(header);
    selection.removeAllRanges(); selection.addRange(headerRange);
    const focusedCopy = new Event('copy', { bubbles: true, cancelable: true }); inlineLink.dispatchEvent(focusedCopy);
    const metadataSelectionWithProtectedFocus = focusedCopy.defaultPrevented;
    inlineLink.remove();
    selection.removeAllRanges();
    const emptyEvent = new Event('copy', { bubbles: true, cancelable: true }); document.dispatchEvent(emptyEvent);
    return { guardedSelection, metadataSelection, metadataSelectionWithProtectedFocus, mixedSelection, emptySelection: emptyEvent.defaultPrevented,
      bodyUserSelect: getComputedStyle(body).userSelect, headerUserSelect: getComputedStyle(header).userSelect };
  })()`);
  assert.equal(result.guardedSelection, true, `${route}: protected selection can be copied`);
  assert.equal(result.mixedSelection, true, `${route}: select-all bypasses the writing guard`);
  assert.equal(result.metadataSelection, false, `${route}: ordinary metadata copy is blocked`);
  assert.equal(result.metadataSelectionWithProtectedFocus, false, `${route}: protected inline-link focus blocks an unrelated metadata selection`);
  assert.equal(result.emptySelection, false, `${route}: empty selection is blocked globally`);
  assert.equal(result.bodyUserSelect, 'none', `${route}: body text selection remains enabled`);
  assert.notEqual(result.headerUserSelect, 'none', `${route}: metadata selection was disabled`);
};
const verifyPortfolioLinks = async (client, origin, { archive, pdf }) => {
  await navigate(client, origin, archive);
  await waitForPredicate(client, `document.querySelector('[data-portfolio-archive]')?.classList.contains('is-ready')`);
  const links = await runtimeValue(client, `Array.from(document.querySelectorAll('.portfolio-card a, .portfolio-index a'), a => ({ href: a.getAttribute('href'), target: a.target }))`);
  assert.equal(links.length, 2, `${archive}: grid/index links changed`);
  for (const link of links) {
    assert.equal(link.href, pdf, `${archive}: grid/index link bypasses the localized viewer`);
    assert.equal(link.target, '_blank', `${archive}: portfolio no longer opens in a new tab`);
  }
};
const verifyArtwork = async (client, origin) => {
  const archiveRoute = '/painter/everything/';
  const selector = '.artwork-card a[href="/painter/everything/chequered-forest/"]';
  await navigate(client, origin, archiveRoute);
  await waitForPredicate(client, `document.querySelector('[data-artwork-archive]')?.classList.contains('is-ready')`);
  await assertEvent(client, `${selector} [data-content-guard="image"]`, 'contextmenu', true);
  await assertEvent(client, `${selector} img`, 'dragstart', true);
  await assertEvent(client, selector, 'dragstart', true);
  await assertEvent(client, `${selector} .artwork-card__title`, 'contextmenu', false);
  await assertEvent(client, '[data-nav-language]', 'contextmenu', false);
  await assertEvent(client, '[data-nav-language]', 'dragstart', false);
  assert.equal(await runtimeValue(client, `document.querySelector(${JSON.stringify(selector)}).draggable`), false);
  assert.equal(await runtimeValue(client, `document.querySelector(${JSON.stringify(`${selector} img`)}).draggable`), false);

  // Actual activation checks catch guards accidentally attached to click or keyboard events.
  for (const activation of ['mouse', 'keyboard']) {
    if (activation === 'keyboard') {
      await navigate(client, origin, archiveRoute);
      await waitForPredicate(client, `document.querySelector('[data-artwork-archive]')?.classList.contains('is-ready')`);
    }
    await runtimeValue(client, `window.__contentGuardNavigationMarker = ${JSON.stringify(activation)}`);
    const point = await runtimeValue(client, `(() => {
      const link = document.querySelector(${JSON.stringify(selector)});
      link.scrollIntoView({ block: 'center' }); link.focus();
      const rect = link.querySelector('[data-content-guard]').getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`);
    if (activation === 'mouse') {
      await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
      await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    } else {
      await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    }
    await waitForPredicate(client, `location.pathname === '/painter/everything/chequered-forest/' && document.querySelector('[data-artwork-progressive]')`);
    assert.equal(await runtimeValue(client, 'window.__contentGuardNavigationMarker'), activation, `${activation}: artwork click lost client navigation`);
    const preview = await waitForPredicate(client, `(() => {
      const frame = document.querySelector('[data-artwork-progressive]');
      return frame && frame.dataset.artworkImageReady !== 'true' && getComputedStyle(frame, '::before').backgroundImage.includes('data:image/webp;base64,') && Number(getComputedStyle(frame, '::before').opacity) > .9;
    })()`, 1500);
    assert.equal(preview, true, `${activation}: artwork preview was not preserved`);
    await assertEvent(client, '[data-artwork-progressive]', 'contextmenu', true);
    await assertEvent(client, '[data-artwork-detail-full]', 'dragstart', true);
    await assertEvent(client, '.artwork-back', 'contextmenu', false);
    await waitForPredicate(client, `document.querySelector('[data-artwork-progressive]')?.dataset.artworkImageReady === 'true'`);
  }
};
const verifyPdf = async (client, origin, route) => {
  await navigate(client, origin, route);
  await waitForPredicate(client, `document.querySelector('[data-pdf-page][data-page-number="1"].is-rendered canvas')?.width > 0`, 30000);
  const state = await runtimeValue(client, `(() => {
    const viewer = document.querySelector('[data-pdf-scroll-viewer]');
    const canvas = viewer.querySelector('[data-pdf-page] canvas');
    return { guarded: viewer.dataset.contentGuard, pages: viewer.querySelectorAll('[data-pdf-page]').length,
      width: canvas.width, height: canvas.height, opacity: Number(getComputedStyle(canvas).opacity),
      native: document.querySelectorAll('iframe, embed, object').length,
      rawLinks: [...document.querySelectorAll('a')].filter(a => /\\.pdf(?:[?#]|$)/i.test(a.getAttribute('href') || '') || a.hasAttribute('download')).length };
  })()`);
  assert.equal(state.guarded, 'pdf'); assert.equal(state.pages, 39); assert.equal(state.native, 0); assert.equal(state.rawLinks, 0);
  assert.ok(state.width > 0 && state.height > 0 && state.opacity >= .99, `${route}: first canvas is not visibly rendered: ${JSON.stringify(state)}`);
  await assertEvent(client, '[data-pdf-page] canvas', 'contextmenu', true, route);
  await assertEvent(client, '[data-pdf-page] canvas', 'dragstart', true, route);
  await assertEvent(client, '.pdf-scroll-viewer__preview', 'contextmenu', true, route);
  await assertEvent(client, '.pdf-scroll-viewer__preview', 'dragstart', true, route);
  await waitForPredicate(client, `document.querySelector('[data-page-number="1"] [data-pdf-page-text]')?.dataset.pdfTextReady === 'true'`);
  const transcript = await runtimeValue(client, `(() => {
    const element = document.querySelector('[data-page-number="1"] [data-pdf-page-text]');
    const style = getComputedStyle(element);
    const range = document.createRange(); range.selectNodeContents(element);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    const event = new Event('copy', { bubbles: true, cancelable: true }); document.dispatchEvent(event); selection.removeAllRanges();
    return { text: element.textContent, hidden: element.getAttribute('aria-hidden'), display: style.display, visibility: style.visibility, copyPrevented: event.defaultPrevented };
  })()`);
  assert.ok(transcript.text.trim().length > 0, `${route}: screen reader transcript is empty`);
  assert.notEqual(transcript.hidden, 'true', `${route}: transcript is hidden from screen readers`);
  assert.notEqual(transcript.display, 'none', `${route}: transcript is absent from the accessibility tree`);
  assert.equal(transcript.visibility, 'visible', `${route}: transcript is invisible to screen readers`);
  assert.equal(transcript.copyPrevented, true, `${route}: transcript bypasses PDF copying protection`);
  await waitForPredicate(client, `(() => {
    const transcripts = Array.from(document.querySelectorAll('[data-pdf-page-text]'));
    return transcripts.length === 39 && transcripts.every(element => element.dataset.pdfTextReady === 'true' && element.textContent.trim().length > 0);
  })()`, 30000);
};
const verifyMobileScroll = async (client, origin, route) => {
  await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await verifyPdf(client, origin, route);
  await runtimeValue(client, 'window.scrollTo(0, 0)');
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 620 }] });
  for (let y = 570; y >= 170; y -= 50) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y }] });
    await delay(30);
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  try {
    await waitForPredicate(client, 'window.scrollY > 200', 3000);
  } catch (error) {
    const state = await runtimeValue(client, `({ y: scrollY, height: innerHeight, documentHeight: document.documentElement.scrollHeight,
      bodyOverflow: getComputedStyle(document.body).overflow, htmlOverflow: getComputedStyle(document.documentElement).overflow,
      hit: document.elementFromPoint(195, 620)?.outerHTML.slice(0, 180), touchAction: getComputedStyle(document.elementFromPoint(195, 620)).touchAction })`);
    throw new Error(`${error.message}; mobile state: ${JSON.stringify(state)}`);
  }
  assert.equal(await runtimeValue(client, 'document.documentElement.scrollWidth <= innerWidth + 1'), true, 'Phone PDF viewer overflows horizontally');
};
const verifyPdfRecovery = async (client, origin, route) => {
  await client.send('Network.setBlockedURLs', { urls: ['*/pdfs/*.pdf*'] });
  await navigate(client, origin, route);
  await waitForPredicate(client, `document.querySelector('[data-pdf-scroll-viewer]')?.classList.contains('is-failed')`);
  assert.equal(await runtimeValue(client, `document.querySelector('[data-pdf-retry]') instanceof HTMLButtonElement`), true, 'Failed PDF does not offer Retry');
  assert.equal(await runtimeValue(client, `document.querySelector('[data-pdf-fallback] a') === null`), true, 'Failure exposes original PDF');
  await client.send('Network.setBlockedURLs', { urls: [] });
  await runtimeValue(client, `document.querySelector('[data-pdf-retry]').click()`);
  await waitForPredicate(client, `document.querySelector('[data-pdf-page][data-page-number="1"].is-rendered canvas')?.width > 0`, 30000);
};

let browserProcess, profileDir, client, server, primaryError;
try {
  await verifyBuiltHtml();
  server = await startStaticServer();
  const origin = `http://127.0.0.1:${server.address().port}`;
  profileDir = await mkdtemp(path.join(os.tmpdir(), 'samana-content-guard-'));
  browserProcess = spawn(await findBrowser(), [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`,
    '--disable-background-networking', '--disable-background-timer-throttling', '--disable-default-apps',
    '--disable-gpu', '--disable-extensions', '--no-default-browser-check', '--no-first-run', 'about:blank',
  ], { detached: process.platform !== 'win32', stdio: 'ignore', windowsHide: true });
  const debugPort = await waitForDevToolsPort(profileDir, browserProcess);
  const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json();
  client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Page.enable'); await client.send('Runtime.enable'); await client.send('Network.enable');
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });
  await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  for (const routes of portfolioRoutes) await verifyPortfolioLinks(client, origin, routes);
  for (const route of writingRoutes) await verifyWriting(client, origin, route);
  await verifyArtwork(client, origin);
  for (const { pdf } of portfolioRoutes) {
    await verifyPdf(client, origin, pdf);
    if (process.env.CONTENT_GUARD_SCREENSHOT && pdf === portfolioRoutes[0].pdf) {
      const screenshotPath = path.resolve(root, process.env.CONTENT_GUARD_SCREENSHOT);
      const relativeToRoot = path.relative(root, screenshotPath);
      assert.ok(!relativeToRoot.startsWith('..') && !path.isAbsolute(relativeToRoot), 'Screenshot path must stay inside the workspace');
      await mkdir(path.dirname(screenshotPath), { recursive: true });
      const screenshot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    }
  }
  await verifyMobileScroll(client, origin, portfolioRoutes[0].pdf);
  await verifyPdfRecovery(client, origin, portfolioRoutes[0].pdf);
  console.log('Content guard regression passed: bilingual PDF links/viewers with 39 accessible transcripts and writing, scoped context/copy/drag guards, artwork mouse/Enter navigation and preview, phone PDF scrolling, and Retry recovery.');
} catch (error) {
  primaryError = error;
} finally {
  client?.close();
  if (browserProcess?.pid && browserProcess.exitCode === null && browserProcess.signalCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(browserProcess.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
    else { try { process.kill(-browserProcess.pid, 'SIGTERM'); } catch { browserProcess.kill('SIGTERM'); } }
  }
  if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections?.(); });
  if (profileDir) {
    const relativeToTemp = path.relative(path.resolve(os.tmpdir()), path.resolve(profileDir));
    assert.ok(!relativeToTemp.startsWith('..') && !path.isAbsolute(relativeToTemp) && path.basename(profileDir).startsWith('samana-content-guard-'), 'Unsafe browser profile cleanup path');
    await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch((error) => { if (!primaryError) primaryError = error; });
  }
}
if (primaryError) throw primaryError;
