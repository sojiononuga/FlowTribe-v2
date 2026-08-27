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
    18,
    'Journey verification',
  );
  await journeyPage.close();
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
