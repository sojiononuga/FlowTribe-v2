import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const host = '127.0.0.1';
const port = 5173;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.gs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function safePath(urlPath) {
  const raw = decodeURIComponent((urlPath || '/').split('?')[0]);
  const requested = raw === '/' ? '/index.html' : raw;
  const resolved = path.resolve(root, `.${requested}`);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return null;
  return resolved;
}

const server = http.createServer((req, res) => {
  const file = safePath(req.url);
  if (!file) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(file, (error, body) => {
    if (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500).end(error.code || 'Error');
      return;
    }

    res.writeHead(200, {
      'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  });
});

function listen() {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
}

async function verifyHarness(page, pathname, resultExpression, expectedTotal, label) {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`http://${host}:${port}/${pathname}`, { waitUntil: 'load' });
  await page.waitForFunction(resultExpression, null, { timeout: 120_000 });

  const result = await page.evaluate(resultExpression);
  if (pageErrors.length) {
    throw new Error(`${label} produced page errors:\n${pageErrors.join('\n')}`);
  }

  const failed = Number(result.failed || 0);
  const total = Number(result.total ?? ((result.passed || 0) + failed));
  if (total !== expectedTotal) {
    throw new Error(`${label} expected ${expectedTotal} checks/journeys but found ${total}. A deleted test must not look green.`);
  }
  if (failed !== 0) {
    const details = Array.isArray(result.results)
      ? result.results.filter((item) => !item.ok).map((item) => `${item.group || label}: ${item.name} — ${item.detail}`).join('\n')
      : `${failed} failed`;
    throw new Error(`${label} failed:\n${details}`);
  }

  console.log(`${label}: ${expectedTotal}/${expectedTotal} passed`);
}

async function verifyHelpQuality(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`http://${host}:${port}/tests/help-quality.html`, { waitUntil: 'load' });

  await page.evaluate(async () => {
    const { installTourQualityGuards } = await import('../src/features/showcase/tour-quality.js');
    const { MetaAiControl } = await import('../src/features/showcase/meta-ai.js');

    installTourQualityGuards();

    const fixture = document.querySelector('#fixture');
    const main = document.createElement('main');
    main.id = 'main';
    main.className = 'ft-live-tour-target';
    const profile = document.createElement('section');
    profile.className = 'ft-profile-head';
    profile.textContent = 'Profile feature';
    main.append(profile);

    const tour = document.createElement('div');
    tour.className = 'ft-live-tour';
    const panel = document.createElement('div');
    panel.className = 'ft-live-tour__panel';
    panel.textContent = 'Guide';
    tour.append(panel);

    const calendar = document.createElement('div');
    calendar.className = 'ft-calendar';

    fixture.append(main, tour, calendar);
    location.hash = '#/profile';

    const status = document.createElement('span');
    fixture.append(MetaAiControl({ status }));
  });

  await page.waitForTimeout(120);

  const tourTarget = await page.evaluate(() => ({
    main: document.querySelector('#main').classList.contains('ft-live-tour-target'),
    profile: document.querySelector('.ft-profile-head').classList.contains('ft-live-tour-target'),
    calendarAlias: document.querySelector('.ft-calendar').classList.contains('ft-activity-calendar'),
    placement: document.querySelector('.ft-live-tour__panel').dataset.placement || '',
  }));

  if (tourTarget.main) throw new Error('Help quality: #main remained the guided-tour target.');
  if (!tourTarget.profile) throw new Error('Help quality: profile feature was not retargeted.');
  if (!tourTarget.calendarAlias) throw new Error('Help quality: movement calendar compatibility target was not installed.');
  if (!['top', 'bottom'].includes(tourTarget.placement)) throw new Error('Help quality: tour panel did not choose a viewport side.');

  // The real product does not keep the tour dialog open while opening Meta.
  // Close the isolated tour fixture before exercising the independent Meta surface.
  await page.evaluate(() => {
    document.querySelector('.ft-live-tour').hidden = true;
  });
  await page.waitForTimeout(40);

  await page.getByRole('button', { name: 'Ask Meta AI' }).click();
  await page.getByLabel('Ask Meta AI a question').fill('What if I am still struggling?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await page.getByText(/not to push harder at the same plan/i).waitFor({ timeout: 5000 });
  await page.getByText(/recovery move you can actually do/i).waitFor({ timeout: 5000 });

  const overflow = await page.evaluate(() => {
    const panel = document.querySelector('.ft-meta-ai__panel');
    const quick = document.querySelector('.ft-meta-ai__quick');
    const composer = document.querySelector('.ft-meta-ai__composer');
    return {
      panel: panel.scrollWidth - panel.clientWidth,
      quick: quick.scrollWidth - quick.clientWidth,
      composer: composer.scrollWidth - composer.clientWidth,
      inputTag: document.querySelector('.ft-meta-ai__input').tagName,
    };
  });

  if (overflow.panel > 1 || overflow.quick > 1 || overflow.composer > 1) {
    throw new Error(`Help quality: horizontal overflow remains ${JSON.stringify(overflow)}.`);
  }
  if (overflow.inputTag !== 'TEXTAREA') throw new Error(`Help quality: composer is ${overflow.inputTag}, expected TEXTAREA.`);

  await page.getByLabel('Ask Meta AI a question').fill('How can this app help me?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await page.getByRole('button', { name: 'Show me how it works' }).waitFor({ timeout: 5000 });

  const eventReceived = page.evaluate(() => new Promise((resolve) => {
    document.addEventListener('flowtribe:tour-open', () => resolve(true), { once: true });
    setTimeout(() => resolve(false), 2000);
  }));
  await page.getByRole('button', { name: 'Show me how it works' }).click();
  if (!(await eventReceived)) throw new Error('Help quality: Meta tour action did not dispatch the tour event.');

  if (pageErrors.length) throw new Error(`Help quality produced page errors:\n${pageErrors.join('\n')}`);
  await page.close();
  console.log('Help quality verification: 8/8 passed');
}

let browser;
try {
  await listen();
  browser = await chromium.launch({ headless: true });

  const backendPage = await browser.newPage();
  await verifyHarness(
    backendPage,
    'tests/backend.html',
    () => window.__BACKEND_RESULTS__ || null,
    112,
    'Backend verification',
  );
  await backendPage.close();

  const recoveryPage = await browser.newPage();
  await verifyHarness(
    recoveryPage,
    'tests/recovery.html',
    () => window.__RECOVERY_RESULTS__ || null,
    6,
    'Operator recovery verification',
  );
  await recoveryPage.close();

  const journeyPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await verifyHarness(
    journeyPage,
    'tests/journeys.html',
    () => window.__JOURNEYS__ || null,
    19,
    'Journey verification',
  );
  await journeyPage.close();

  await verifyHelpQuality(browser);
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
