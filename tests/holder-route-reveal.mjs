import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const targets = [
  {
    path: '/architect/projects/',
    contentSelector: '.work-in-progress-page__heading',
    content: 'Work in progress...',
  },
  {
    path: '/esp/arquitecto/proyectos/',
    contentSelector: '.work-in-progress-page__heading',
    content: 'Trabajo en curso...',
  },
  {
    path: '/writer/books/',
    contentSelector: '.work-in-progress-page__heading',
    content: 'Work in progress...',
  },
  {
    path: '/esp/escritor/libros/',
    contentSelector: '.work-in-progress-page__heading',
    content: 'Trabajo en curso...',
  },
  {
    path: '/painter/exhibitions/',
    contentSelector: '.work-in-progress-page__heading',
    content: 'Work in progress...',
  },
  {
    path: '/esp/pintor/exposiciones/',
    contentSelector: '.work-in-progress-page__heading',
    content: 'Trabajo en curso...',
  },
  {
    path: '/buy/',
    contentSelector: '.work-in-progress-page__heading',
    content: 'Nothing to buy...',
  },
  {
    path: '/esp/comprar/',
    contentSelector: '.work-in-progress-page__heading',
    content: 'Nada que comprar...',
  },
  {
    path: '/contact/',
    contentSelector: '.contact-email',
    content: 'sebastian.samana@icloud.com',
    contactLabel: 'Contact',
  },
  {
    path: '/esp/contacto/',
    contentSelector: '.contact-email',
    content: 'sebastian.samana@icloud.com',
    contactLabel: 'Contacto',
  },
];
const viewports = [
  { name: 'desktop', width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false },
  { name: 'phone', width: 390, height: 844, deviceScaleFactor: 3, mobile: true },
];
const shellOnlyTargets = ['/math-visualisation/', '/math-visualisation-lab/'];
const clientNavigationCases = [
  {
    sourcePath: '/about/',
    linkSelector: '[data-nav-contact]',
    destinationPath: '/contact/',
    paintedShell: 'header',
  },
  {
    sourcePath: '/contact/',
    linkSelector: '[data-nav-about]',
    destinationPath: '/about/',
    paintedShell: 'footer',
    scrollToFooter: true,
  },
  {
    sourcePath: '/contact/',
    linkSelector: '[data-nav-language]',
    destinationPath: '/esp/contacto/',
    paintedShell: 'header',
  },
  {
    sourcePath: '/architect/',
    linkSelector: '.architect-spatial-link--projects',
    destinationPath: '/architect/projects/',
    paintedShell: 'header',
  },
  {
    sourcePath: '/esp/arquitecto/',
    linkSelector: '.architect-spatial-link--projects',
    destinationPath: '/esp/arquitecto/proyectos/',
    paintedShell: 'header',
  },
  {
    sourcePath: '/writer/',
    linkSelector: '[data-author-link="books"]',
    destinationPath: '/writer/books/',
    paintedShell: 'header',
  },
  {
    sourcePath: '/writer/',
    linkSelector: '[data-author-link="everything"]',
    destinationPath: '/writer/everything/',
    paintedShell: 'header',
  },
  {
    sourcePath: '/painter/',
    linkSelector: '[data-artist-link="exhibitions"]',
    destinationPath: '/painter/exhibitions/',
    paintedShell: 'header',
  },
  {
    sourcePath: '/painter/',
    linkSelector: '[data-artist-link="everything"]',
    destinationPath: '/painter/everything/',
    paintedShell: 'header',
  },
  {
    sourcePath: '/esp/escritor/',
    linkSelector: '[data-author-link="books"]',
    destinationPath: '/esp/escritor/libros/',
    paintedShell: 'header',
  },
  {
    sourcePath: '/esp/escritor/',
    linkSelector: '[data-author-link="everything"]',
    destinationPath: '/esp/escritor/todo/',
    paintedShell: 'header',
  },
  {
    sourcePath: '/esp/pintor/',
    linkSelector: '[data-artist-link="exhibitions"]',
    destinationPath: '/esp/pintor/exposiciones/',
    paintedShell: 'header',
  },
  {
    sourcePath: '/esp/pintor/',
    linkSelector: '[data-artist-link="everything"]',
    destinationPath: '/esp/pintor/todo/',
    paintedShell: 'header',
  },
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

      ['transitionrun', 'transitionstart', 'transitionend', 'transitioncancel'].forEach((type) => {
        document.addEventListener(type, (event) => {
          if (
            !(event.target instanceof HTMLElement) ||
            !event.target.matches('[data-contact-page]') ||
            event.propertyName !== 'opacity'
          ) {
            return;
          }
          probe.events.push({
            elapsedTime: event.elapsedTime,
            propertyName: event.propertyName,
            time: performance.now(),
            type,
          });
        }, true);
      });

      ['animationstart', 'animationend', 'animationcancel'].forEach((type) => {
        document.addEventListener(type, (event) => {
          if (
            event.target instanceof HTMLElement &&
            event.target.matches('[data-contact-page]')
          ) {
            probe.events.push({
              animationName: event.animationName,
              contactAnimation: true,
              elapsedTime: event.elapsedTime,
              time: performance.now(),
              type,
            });
            return;
          }
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
          const contactPage = main.querySelector('[data-contact-page]');
          const contactStyle =
            contactPage instanceof HTMLElement ? getComputedStyle(contactPage) : null;
          const shell = document.querySelector('.site-shell');
          const header = document.querySelector('[data-varelism-site-header]');
          const footer = document.querySelector('[data-varelism-site-footer]');
          if (!(header instanceof HTMLElement) || !(footer instanceof HTMLElement)) {
            if (!probe.stopSampling) window.requestAnimationFrame(sample);
            return;
          }
          const overlay = document.querySelector('[data-home-return-overlay]');
          const homePreloader = document.querySelector('[data-home-preloader]');
          const handoffOverlay = document.querySelector('[data-home-preloader-handoff]');
          const overlayStyle = overlay instanceof HTMLElement ? getComputedStyle(overlay) : null;
          const isVisibleOverlay = (element) => {
            if (!(element instanceof HTMLElement)) return false;
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' &&
              style.visibility === 'visible' &&
              Number(style.opacity) > 0.02 &&
              rect.width > 0 &&
              rect.height > 0;
          };
          const getShellElementState = (element, paintTarget = element) => {
            if (!(element instanceof HTMLElement) || !(paintTarget instanceof HTMLElement)) {
              return null;
            }

            const style = getComputedStyle(element);
            const rect = paintTarget.getBoundingClientRect();
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
            const inViewport =
              rect.width > 0 &&
              rect.height > 0 &&
              rect.bottom > 0 &&
              rect.right > 0 &&
              rect.top < window.innerHeight &&
              rect.left < window.innerWidth;
            let paintedAboveOverlay = null;

            if (inViewport && overlay instanceof HTMLElement) {
              const previousPointerEvents = overlay.style.pointerEvents;
              overlay.style.pointerEvents = 'auto';
              const topElement = document.elementFromPoint(
                Math.max(0, Math.min(window.innerWidth - 1, rect.left + rect.width / 2)),
                Math.max(0, Math.min(window.innerHeight - 1, rect.top + rect.height / 2)),
              );
              paintedAboveOverlay = Boolean(topElement && element.contains(topElement));
              overlay.style.pointerEvents = previousPointerEvents;
            }

            return {
              ancestorsVisible,
              animationName: style.animationName,
              display: style.display,
              effectiveOpacity,
              hasBox: rect.width > 0 && rect.height > 0,
              inViewport,
              opacity: Number(style.opacity),
              paintedAboveOverlay,
              transitionDuration: style.transitionDuration,
              visibility: style.visibility,
              zIndex: style.zIndex,
            };
          };

          probe.samples.push({
            bodyBackground: bodyStyle?.backgroundColor || '',
            contactAnimationDuration: contactStyle?.animationDuration || '',
            contactAnimationName: contactStyle?.animationName || '',
            contactOpacity: contactStyle ? Number(contactStyle.opacity) : null,
            contactTransitionDuration: contactStyle?.transitionDuration || '',
            contactTransitionProperty: contactStyle?.transitionProperty || '',
            hasMarker: main.hasAttribute('data-varelism-route-reveal'),
            hasReadyClass: main.classList.contains('is-route-reveal-ready'),
            footer: getShellElementState(footer, footer?.querySelector('p') || footer),
            hasHomeRouteMarker: document.documentElement.hasAttribute('data-varelism-home-route'),
            hasHomePreloader: homePreloader instanceof HTMLElement,
            hasHomePreloaderHandoff: handoffOverlay instanceof HTMLElement,
            homePreloaderVisible: isVisibleOverlay(homePreloader),
            homePreloaderHandoffVisible: isVisibleOverlay(handoffOverlay),
            header: getShellElementState(header, header?.querySelector('a') || header),
            opacity: Number(mainStyle.opacity),
            overlayOpacity: overlayStyle ? Number(overlayStyle.opacity) : null,
            overlayParentIsShell:
              overlay instanceof HTMLElement && shell instanceof HTMLElement
                ? overlay.parentElement === shell
                : null,
            pathname: window.location.pathname,
            pointerEvents: mainStyle.pointerEvents,
            astroTransitionActive:
              document.documentElement.hasAttribute('data-astro-transition'),
            time: performance.now(),
          });
        }

        if (!probe.stopSampling) {
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

const collectResult = (client, target) =>
  runtimeValue(
    client,
    `(() => {
      const main = document.querySelector('main');
      const content = document.querySelector(${JSON.stringify(target.contentSelector)});
      const contactPage = document.querySelector('[data-contact-page]');
      const mainStyle = main ? getComputedStyle(main) : null;
      const contactStyle = contactPage ? getComputedStyle(contactPage) : null;
      return {
        contactAnimationDuration: contactStyle?.animationDuration || '',
        contactAnimationName: contactStyle?.animationName || '',
        contactLabel: contactPage?.getAttribute('aria-label') || '',
        contactOpacity: contactStyle ? Number(contactStyle.opacity) : null,
        contactTransitionDuration: contactStyle?.transitionDuration || '',
        contactTransitionProperty: contactStyle?.transitionProperty || '',
        contactVisibleClass: contactPage?.classList.contains('is-visible') || false,
        content: content?.textContent?.trim() || '',
        mainMarkerCount: document.querySelectorAll('main[data-varelism-route-reveal]').length,
        mainReady: main?.classList.contains('is-route-reveal-ready') || false,
        opacity: mainStyle ? Number(mainStyle.opacity) : null,
        pointerEvents: mainStyle?.pointerEvents || '',
        probe: window.__holderRevealProbe,
        animationDelay: mainStyle?.animationDelay || '',
        animationDuration: mainStyle?.animationDuration || '',
        animationName: mainStyle?.animationName || '',
        animationTimingFunction: mainStyle?.animationTimingFunction || '',
      };
    })()`,
  );

const verifyShellElementState = (
  shell,
  label,
  { inViewport = false } = {},
) => {
  assert.ok(shell, `${label}: shell element is missing`);
  assert.notEqual(shell.display, 'none', `${label}: shell element has display:none`);
  assert.equal(shell.visibility, 'visible', `${label}: shell element is invisible`);
  assert.equal(shell.ancestorsVisible, true, `${label}: an ancestor hides the shell element`);
  assert.ok(shell.hasBox, `${label}: shell element has no rendered box`);
  assert.ok(
    Math.abs(shell.opacity - 1) <= 0.001,
    `${label}: shell element opacity is ${shell.opacity}`,
  );
  assert.ok(
    Math.abs(shell.effectiveOpacity - 1) <= 0.001,
    `${label}: effective shell opacity is ${shell.effectiveOpacity}`,
  );
  assert.equal(shell.transitionDuration, '0s', `${label}: shell element can transition`);
  assert.equal(shell.animationName, 'none', `${label}: shell element can animate`);
  if (inViewport) {
    assert.equal(shell.inViewport, true, `${label}: shell element is outside the viewport`);
  }
};

const verifyNoNonHomePreloader = (sample, label) => {
  assert.equal(sample.hasHomeRouteMarker, false, `${label}: non-home route had a home marker`);
  assert.equal(sample.hasHomePreloader, false, `${label}: non-home route mounted the home preloader`);
  assert.equal(
    sample.hasHomePreloaderHandoff,
    false,
    `${label}: non-home route mounted a home-preloader handoff`,
  );
  assert.equal(sample.homePreloaderVisible, false, `${label}: home preloader became visible`);
  assert.equal(
    sample.homePreloaderHandoffVisible,
    false,
    `${label}: home-preloader handoff became visible`,
  );
};

const verifyResult = (result, target, viewport) => {
  const label = `${viewport.name} ${target.path}`;
  assert.equal(result.content, target.content, `${label}: localized content changed`);
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
  result.probe.samples.forEach((sample, index) => {
    verifyNoNonHomePreloader(sample, `${label}: sample ${index}`);
    for (const shellName of ['header', 'footer']) {
      verifyShellElementState(
        sample[shellName],
        `${label}: sample ${index} ${shellName}`,
      );
    }
  });
  if (target.contactLabel) {
    assert.equal(first.contactOpacity, 1, `${label}: Contact still has a nested opacity reveal`);
    assert.equal(
      first.contactTransitionDuration,
      '0s',
      `${label}: Contact still has a nested transition`,
    );
    assert.equal(first.contactAnimationName, 'none', `${label}: Contact has a nested animation`);
    assert.equal(first.contactAnimationDuration, '0s', `${label}: Contact has animation timing`);
  }

  assert.equal(result.animationName, 'varelism-route-reveal', `${label}: reveal animation changed`);
  assert.equal(result.animationDelay, '0s', `${label}: reveal animation delay changed`);
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
  if (target.contactLabel) {
    const contactSamples = result.probe.samples.filter(
      (sample) => sample.contactOpacity !== null,
    );
    assert.ok(contactSamples.length > 2, `${label}: Contact reveal probe did not collect samples`);
    assert.equal(
      contactSamples.every(
        (sample) =>
          sample.contactOpacity === 1 &&
          sample.contactTransitionDuration === '0s' &&
          sample.contactAnimationName === 'none' &&
          sample.contactAnimationDuration === '0s',
      ),
      true,
      `${label}: Contact changed opacity independently of the main reveal`,
    );
    assert.equal(result.contactLabel, target.contactLabel, `${label}: localized Contact label changed`);
    assert.equal(result.contactOpacity, 1, `${label}: Contact content was not visible`);
    assert.ok(
      !result.contactTransitionProperty.split(',').map((value) => value.trim()).includes('opacity'),
      `${label}: Contact retained an opacity transition`,
    );
    assert.equal(
      result.contactTransitionDuration,
      '0s',
      `${label}: Contact retained a nested transition`,
    );
    assert.equal(result.contactAnimationName, 'none', `${label}: Contact retained an animation`);
    assert.equal(result.contactAnimationDuration, '0s', `${label}: Contact retained animation timing`);
    assert.equal(result.contactVisibleClass, false, `${label}: legacy Contact reveal class remains`);
    assert.equal(
      result.probe.events.some(
        (event) => event.propertyName === 'opacity' && event.type.startsWith('transition'),
      ),
      false,
      `${label}: Contact emitted a nested opacity transition`,
    );
    assert.equal(
      result.probe.events.some((event) => event.contactAnimation),
      false,
      `${label}: Contact emitted a nested animation`,
    );
  }

  return {
    path: target.path,
    viewport: viewport.name,
  };
};

const discoverBuiltShellRoutes = async () => {
  const distRoot = path.resolve(root, 'dist');
  const htmlFiles = [];
  const visit = async (directory) => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && entry.name.endsWith('.html')) {
        htmlFiles.push(entryPath);
      }
    }
  };
  await visit(distRoot);

  const routes = [];
  for (const filePath of htmlFiles.sort()) {
    const html = await readFile(filePath, 'utf8');
    if (
      !/<header[^>]*data-varelism-site-header[^>]*>/.test(html) ||
      !/<footer[^>]*data-varelism-site-footer[^>]*>/.test(html)
    ) {
      continue;
    }
    const openingHtml = html.match(/<html\b[^>]*>/)?.[0] || '';
    if (/\sdata-varelism-home-route(?:\s|>)/.test(openingHtml)) continue;

    const relativePath = path.relative(distRoot, filePath).split(path.sep).join('/');
    const routePath = relativePath === 'index.html'
      ? '/'
      : relativePath.endsWith('/index.html')
        ? `/${relativePath.slice(0, -'index.html'.length)}`
        : `/${relativePath}`;
    routes.push({ html, path: routePath });
  }

  return routes;
};

const verifySharedConstants = async () => {
  const [layoutSource, globalCss, homeHtml, spanishHomeHtml, ...holderHtml] = await Promise.all([
    readFile(path.join(root, 'src', 'layouts', 'BaseLayout.astro'), 'utf8'),
    readFile(path.join(root, 'src', 'styles', 'global.css'), 'utf8'),
    readFile(path.join(root, 'dist', 'index.html'), 'utf8'),
    readFile(path.join(root, 'dist', 'esp', 'index.html'), 'utf8'),
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
  assert.doesNotMatch(
    globalCss,
    /font-display:\s*block;/,
    'The shared shell font must never enter an invisible block period',
  );
  assert.match(
    globalCss,
    /::view-transition-group\(root\),[\s\S]*?animation:\s*none\s*!important;/,
    'The root view-transition layers must not animate over the persistent shell',
  );
  assert.match(
    globalCss,
    /::view-transition-old\(root\)\s*\{\s*opacity:\s*0\s*!important;/,
    'The old root snapshot must not cover the current persistent shell',
  );
  assert.match(
    globalCss,
    /::view-transition-new\(root\)\s*\{\s*opacity:\s*1\s*!important;/,
    'The current root snapshot must remain fully visible during swaps',
  );
  assert.match(
    layoutSource,
    /data-astro-transition-persist="varelism-site-footer"/,
    'The footer must persist with the header during client navigation',
  );
  for (const [homePath, html] of [
    ['/', homeHtml],
    ['/esp/', spanishHomeHtml],
  ]) {
    const openingHtml = html.match(/<html\b[^>]*>/)?.[0] || '';
    assert.match(
      openingHtml,
      /\sdata-varelism-home-route(?:\s|>)/,
      `${homePath}: built home document is missing its preloader scope marker`,
    );
  }
  holderHtml.forEach((html, index) => {
    const openingHtml = html.match(/<html\b[^>]*>/)?.[0] || '';
    assert.match(
      html,
      /<main data-varelism-route-reveal data-varelism-route-reveal-from-white(?:\s|>)/,
      `${targets[index].path}: built main is missing its server-rendered white reveal markers`,
    );
    assert.doesNotMatch(
      openingHtml,
      /\sdata-varelism-home-route(?:\s|>)/,
      `${targets[index].path}: non-home document received the home preloader marker`,
    );
    assert.match(
      html,
      /<header[^>]*data-astro-transition-persist="varelism-site-header"[^>]*>/,
      `${targets[index].path}: built header is not persisted`,
    );
    assert.match(
      html,
      /<footer[^>]*data-astro-transition-persist="varelism-site-footer"[^>]*>/,
      `${targets[index].path}: built footer is not persisted`,
    );
  });

  const builtShellRoutes = await discoverBuiltShellRoutes();
  assert.ok(
    builtShellRoutes.length > targets.length,
    'Generated non-home shell route discovery returned too few pages',
  );
  builtShellRoutes.forEach(({ html, path: routePath }) => {
    const openingHtml = html.match(/<html\b[^>]*>/)?.[0] || '';
    assert.doesNotMatch(
      openingHtml,
      /\sdata-varelism-home-route(?:\s|>)/,
      `${routePath}: non-home document received the home preloader marker`,
    );
    assert.match(
      html,
      /<header[^>]*data-astro-transition-persist="varelism-site-header"[^>]*>/,
      `${routePath}: built header is not persisted`,
    );
    assert.match(
      html,
      /<footer[^>]*data-astro-transition-persist="varelism-site-footer"[^>]*>/,
      `${routePath}: built footer is not persisted`,
    );
  });

  return builtShellRoutes.map(({ path: routePath }) => routePath);
};

const collectCurrentShellState = (client) =>
  runtimeValue(
    client,
    `(() => {
      const header = document.querySelector('[data-varelism-site-header]');
      const footer = document.querySelector('[data-varelism-site-footer]');
      const toState = (element) => {
        if (!(element instanceof HTMLElement)) return null;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
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
          animationName: style.animationName,
          display: style.display,
          effectiveOpacity,
          hasBox: rect.width > 0 && rect.height > 0,
          inViewport:
            rect.width > 0 &&
            rect.height > 0 &&
            rect.bottom > 0 &&
            rect.top < innerHeight,
          opacity: Number(style.opacity),
          transitionDuration: style.transitionDuration,
          visibility: style.visibility,
          zIndex: style.zIndex,
        };
      };
      return {
        footer: toState(footer),
        hasHomeRouteMarker: document.documentElement.hasAttribute('data-varelism-home-route'),
        hasHomePreloader: Boolean(document.querySelector('[data-home-preloader]')),
        hasHomePreloaderHandoff: Boolean(document.querySelector('[data-home-preloader-handoff]')),
        homePreloaderVisible: false,
        homePreloaderHandoffVisible: false,
        header: toState(header),
      };
    })()`,
  );

const verifyShellState = (state, label, { footerInViewport = false } = {}) => {
  verifyNoNonHomePreloader(state, label);
  for (const shellName of ['header', 'footer']) {
    verifyShellElementState(state[shellName], `${label}: ${shellName}`, {
      inViewport: shellName === 'footer' && footerInViewport,
    });
  }
};

const runColdShellRoute = async (client, viewport, targetPath) => {
  const targetUrl = `${origin}${targetPath}?shell-audit=${viewport.name}-${Date.now()}`;
  await client.send('Page.navigate', { url: targetUrl });
  await waitForPredicate(
    client,
    `(() => {
      return location.href === ${JSON.stringify(targetUrl)} &&
        document.readyState === 'complete' &&
        Boolean(document.querySelector('[data-varelism-site-header]')) &&
        Boolean(document.querySelector('[data-varelism-site-footer]')) &&
        Boolean(window.__holderRevealProbe?.samples?.length);
    })()`,
  );
  await runtimeValue(
    client,
    `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`,
    true,
  );

  const result = await runtimeValue(
    client,
    `(() => ({
      pathname: location.pathname,
      samples: window.__holderRevealProbe?.samples || [],
    }))()`,
  );
  const label = `${viewport.name} ${targetPath}`;
  assert.equal(result.pathname, targetPath, `${label}: route path changed`);
  assert.ok(result.samples.length > 1, `${label}: cold shell probe did not collect frames`);
  result.samples.forEach((sample, index) => {
    verifyNoNonHomePreloader(sample, `${label}: cold sample ${index}`);
    verifyShellElementState(sample.header, `${label}: cold sample ${index} header`);
    verifyShellElementState(sample.footer, `${label}: cold sample ${index} footer`);
  });
};

const runStaleHomeClassControl = async (client, viewport) => {
  const targetPath = '/contact/';
  const targetUrl = `${origin}${targetPath}?stale-home-class=${viewport.name}-${Date.now()}`;
  await client.send('Page.navigate', { url: targetUrl });
  await waitForPredicate(
    client,
    `(() => location.href === ${JSON.stringify(targetUrl)} &&
      document.readyState === 'complete' &&
      Boolean(document.querySelector('[data-varelism-site-header]')) &&
      Boolean(document.querySelector('[data-varelism-site-footer]')))()`,
  );

  for (const className of [
    'home-preloader-initial-home-active',
    'home-preloader-initial-home-revealing',
  ]) {
    await runtimeValue(
      client,
      `new Promise((resolve) => {
        document.documentElement.classList.add(${JSON.stringify(className)});
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      })`,
      true,
    );
    const state = await collectCurrentShellState(client);
    verifyShellState(state, `${viewport.name} ${targetPath} with stale ${className}`);
    await runtimeValue(
      client,
      `document.documentElement.classList.remove(${JSON.stringify(className)})`,
    );
  }
};

const runClientNavigationCase = async (client, viewport, navigationCase) => {
  const sourceUrl = `${origin}${navigationCase.sourcePath}?shell-source=${viewport.name}-${Date.now()}`;
  await client.send('Page.navigate', { url: sourceUrl });
  await waitForPredicate(
    client,
    `(() => {
      return location.href === ${JSON.stringify(sourceUrl)} &&
        document.readyState === 'complete' &&
        typeof window.__varelismAstroNavigate === 'function' &&
        Boolean(document.querySelector(${JSON.stringify(navigationCase.linkSelector)})) &&
        Boolean(window.__holderRevealProbe);
    })()`,
  );

  const nonce = `${viewport.name}-${navigationCase.sourcePath}-${Date.now()}`;
  const clickStarted = await runtimeValue(
    client,
    `(() => {
      const probe = window.__holderRevealProbe;
      const link = document.querySelector(${JSON.stringify(navigationCase.linkSelector)});
      if (!probe || !(link instanceof HTMLAnchorElement)) return false;
      probe.events.length = 0;
      probe.samples.length = 0;
      window.__shellNavigationNonce = ${JSON.stringify(nonce)};
      if (${JSON.stringify(Boolean(navigationCase.scrollToFooter))}) {
        window.scrollTo(0, document.documentElement.scrollHeight);
      }
      link.click();
      return true;
    })()`,
  );
  assert.equal(clickStarted, true, `${viewport.name} ${navigationCase.sourcePath}: link did not click`);

  await waitForPredicate(
    client,
    `(() => {
      return location.pathname === ${JSON.stringify(navigationCase.destinationPath)} &&
        !document.querySelector('[data-home-return-overlay]') &&
        !document.documentElement.classList.contains('home-return-active');
    })()`,
  );
  await delay(100);

  const result = await runtimeValue(
    client,
    `(() => ({
      nonce: window.__shellNavigationNonce,
      pathname: location.pathname,
      samples: window.__holderRevealProbe?.samples || [],
    }))()`,
  );
  const label = `${viewport.name} ${navigationCase.sourcePath} -> ${navigationCase.destinationPath}`;
  assert.equal(result.pathname, navigationCase.destinationPath, `${label}: destination changed`);
  assert.equal(result.nonce, nonce, `${label}: navigation replaced the whole document`);
  assert.ok(result.samples.length > 2, `${label}: shell probe did not collect samples`);
  result.samples.forEach((sample, index) => {
    verifyNoNonHomePreloader(sample, `${label}: sample ${index}`);
    for (const shellName of ['header', 'footer']) {
      verifyShellElementState(
        sample[shellName],
        `${label}: sample ${index} ${shellName}`,
      );
    }
  });

  const overlaySamples = result.samples.filter((sample) => Number(sample.overlayOpacity) > 0.02);
  assert.ok(overlaySamples.length > 1, `${label}: white-overlay frames were not sampled`);
  overlaySamples.forEach((sample, index) => {
    assert.equal(
      sample.overlayParentIsShell,
      true,
      `${label}: overlay sample ${index} escaped the site shell`,
    );
    for (const shellName of ['header', 'footer']) {
      verifyShellElementState(
        sample[shellName],
        `${label}: overlay sample ${index} ${shellName}`,
      );
    }
  });

  const paintedSamples = overlaySamples.filter(
    (sample) => sample[navigationCase.paintedShell]?.inViewport,
  );
  assert.ok(
    paintedSamples.length > 0,
    `${label}: ${navigationCase.paintedShell} was not sampled in the viewport`,
  );
  const stablePaintedSamples = paintedSamples.filter(
    (sample) =>
      Number(sample.overlayOpacity) >= 0.1 &&
      !sample.astroTransitionActive &&
      sample[navigationCase.paintedShell].paintedAboveOverlay !== null,
  );
  const coveredStableSamples = stablePaintedSamples.filter(
    (sample) => sample[navigationCase.paintedShell].paintedAboveOverlay !== true,
  );
  assert.ok(
    stablePaintedSamples.length > 1,
    `${label}: stable ${navigationCase.paintedShell} paint frames were not sampled`,
  );
  assert.equal(
    coveredStableSamples.length,
    0,
    `${label}: white overlay painted over the ${navigationCase.paintedShell} (${JSON.stringify(
      stablePaintedSamples.map((sample) => ({
        astroTransitionActive: sample.astroTransitionActive,
        opacity: sample.overlayOpacity,
        paintedAboveOverlay: sample[navigationCase.paintedShell].paintedAboveOverlay,
        pathname: sample.pathname,
        zIndex: sample[navigationCase.paintedShell].zIndex,
      })),
    )})`,
  );

  return {
    destinationPath: navigationCase.destinationPath,
    paintedShell: navigationCase.paintedShell,
    sourcePath: navigationCase.sourcePath,
    viewport: viewport.name,
  };
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
  const builtShellRoutes = await verifySharedConstants();
  const directlyCoveredPaths = new Set([
    ...targets.map((target) => target.path),
    ...shellOnlyTargets,
  ]);
  const additionalShellRoutes = builtShellRoutes.filter(
    (targetPath) => !directlyCoveredPaths.has(targetPath),
  );
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
  const shellOnlyResults = [];
  const broadShellResults = [];
  const clientNavigationResults = [];
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
      const result = await collectResult(client, target);
      results.push(verifyResult(result, target, viewport));
    }

    for (const targetPath of shellOnlyTargets) {
      const targetUrl = `${origin}${targetPath}?shell-only=${viewport.name}-${Date.now()}`;
      await client.send('Page.navigate', { url: targetUrl });
      await waitForPredicate(
        client,
        `(() => {
          return location.href === ${JSON.stringify(targetUrl)} &&
            document.readyState === 'complete' &&
            Boolean(document.querySelector('[data-varelism-site-header]')) &&
            Boolean(document.querySelector('[data-varelism-site-footer]'));
        })()`,
      );
      await delay(100);
      const state = await collectCurrentShellState(client);
      verifyShellState(state, `${viewport.name} ${targetPath}`, { footerInViewport: true });
      const samples = await runtimeValue(
        client,
        `window.__holderRevealProbe?.samples || []`,
      );
      assert.ok(
        samples.length > 1,
        `${viewport.name} ${targetPath}: transient shell probe did not collect frames`,
      );
      samples.forEach((sample, index) => {
        verifyNoNonHomePreloader(
          sample,
          `${viewport.name} ${targetPath}: transient sample ${index}`,
        );
        verifyShellElementState(
          sample.header,
          `${viewport.name} ${targetPath}: transient sample ${index} header`,
        );
        verifyShellElementState(
          sample.footer,
          `${viewport.name} ${targetPath}: transient sample ${index} footer`,
        );
      });
      shellOnlyResults.push({
        path: targetPath,
        viewport: viewport.name,
      });
    }

    for (const targetPath of additionalShellRoutes) {
      await runColdShellRoute(client, viewport, targetPath);
      broadShellResults.push({ path: targetPath, viewport: viewport.name });
    }

    await runStaleHomeClassControl(client, viewport);

    for (const navigationCase of clientNavigationCases) {
      clientNavigationResults.push(await runClientNavigationCase(client, viewport, navigationCase));
    }
  }

  console.log('Selected route reveal and persistent shell regression passed.');
  for (const result of results) {
    console.log(`${result.viewport} ${result.path}: hidden first main frame over white; 450ms ease fade`);
  }
  for (const result of shellOnlyResults) {
    console.log(`${result.viewport} ${result.path}: header and footer remain rendered`);
  }
  console.log(
    `${builtShellRoutes.length} generated non-home shell routes passed cold-load visibility checks at desktop and phone sizes.`,
  );
  for (const result of clientNavigationResults) {
    console.log(
      `${result.viewport} ${result.sourcePath} -> ${result.destinationPath}: ${result.paintedShell} stayed above the white overlay`,
    );
  }
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
  throw new AggregateError(cleanupErrors, 'Holder reveal test cleanup failed');
}
