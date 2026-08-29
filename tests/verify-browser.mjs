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
  const requests = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.addInitScript(() => {
    class FakeSpeechRecognition {
      constructor() {
        this.lang = 'en-GB';
        this.interimResults = true;
        this.continuous = false;
        this.maxAlternatives = 1;
      }
      start() {
        this.onstart?.();
        setTimeout(() => {
          const result = [{ transcript: 'A family emergency took my evening. What is the most sensible move tomorrow?' }];
          result.isFinal = true;
          this.onresult?.({ resultIndex: 0, results: [result] });
          this.onend?.();
        }, 60);
      }
      stop() { this.onend?.(); }
    }
    window.SpeechRecognition = FakeSpeechRecognition;
  });

  await page.route('**/.netlify/functions/griot', async (route) => {
    const raw = route.request().postData() || '{}';
    const body = JSON.parse(raw);
    requests.push(body);

    let data = {};
    if (body.action === 'griot.chat') {
      const spoken = /family emergency/i.test(body.payload?.message || '');
      data = spoken
        ? {
            text: 'Do not try to repay the lost evening. Protect the submission goal and choose one complete, time-boxed move tomorrow morning before the day gets noisy.',
            action: { route: '/adapt', label: 'Shape tomorrow’s move' },
            grounded: true,
          }
        : {
            text: 'The interruption changes the route, not the destination. Keep the competition submission as the anchor and choose one credible move you can finish tomorrow.',
            action: { event: 'tour', label: 'Show me how Flow helps' },
            grounded: true,
          };
    } else if (body.action === 'griot.speak') {
      data = { audioBase64: 'SUQz', mimeType: 'audio/mpeg', voice: 'alloy', model: 'openai/gpt-4o-mini-tts-2025-12-15' };
    }

    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ ok: true, data, meta: {} }),
    });
  });

  await page.route('https://flow.test/griot', async (route) => {
    const raw = route.request().postData() || '{}';
    const body = JSON.parse(raw);
    requests.push(body);

    let data;
    if (body.action === 'member.dashboard') {
      data = {
        member: {
          memberId: 'FT-TEST',
          fullName: 'Test Member',
          goalTitle: 'Finish the competition submission',
          showingUp: 'Complete one credible competition task',
          constraints: 'Evenings can be interrupted by family responsibilities',
          weeklyGoal: 3,
        },
        week: { weeklyGoal: 3, postsThisWeek: 1 },
        stats: { currentWeekStreak: 0, longestWeekStreak: 2, allTimePosts: 7 },
        recent: [{ actionTitle: 'Reviewed submission evidence' }],
      };
    } else if (body.action === 'griot.chat') {
      const spoken = /family emergency/i.test(body.payload?.message || '');
      data = spoken
        ? {
            text: 'Do not try to repay the lost evening. Protect the submission goal and choose one complete, time-boxed move tomorrow morning before the day gets noisy.',
            action: { route: '/adapt', label: 'Shape tomorrow’s move' },
            grounded: true,
          }
        : {
            text: 'The interruption changes the route, not the destination. Keep the competition submission as the anchor and choose one credible move you can finish tomorrow.',
            action: { event: 'tour', label: 'Show me how Flow helps' },
            grounded: true,
          };
    } else {
      data = {};
    }

    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*',
      },
      body: JSON.stringify({ ok: true, data, meta: {} }),
    });
  });

  await page.goto(`http://${host}:${port}/tests/help-quality.html`, { waitUntil: 'load' });

  await page.evaluate(async () => {
    const { config } = await import('../src/core/config.js');
    const { saveSession } = await import('../src/core/session.js');
    const { installTourQualityGuards } = await import('../src/features/showcase/tour-quality.js');
    const { GriotControl } = await import('../src/features/showcase/meta-ai.js');

    config.api.baseUrl = 'https://flow.test/griot';
    saveSession({
      token: 'test-token',
      expiresAt: '2099-12-31T23:59:59.000Z',
      member: { memberId: 'FT-TEST', username: 'test', fullName: 'Test Member', role: 'Member' },
      capabilities: ['dashboard:self'],
    });

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
    status.id = 'griot-test-status';
    fixture.append(status, GriotControl({ status }));
  });

  await page.waitForTimeout(150);

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

  await page.evaluate(() => { document.querySelector('.ft-live-tour').hidden = true; });

  await page.getByRole('button', { name: 'Ask Griot' }).click();
  await page.getByLabel('Ask Griot a question').fill('I lost the time I planned for this tonight. How should I think about tomorrow?');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByText(/interruption changes the route, not the destination/i).waitFor({ timeout: 5000 });

  const typedRequest = requests.find((request) => request.action === 'griot.chat');
  if (!typedRequest) throw new Error('Griot quality: typed conversation did not call griot.chat.');
  if (!typedRequest.token) throw new Error('Griot quality: model conversation was not authenticated.');
  if (typedRequest.payload?.route !== '/profile') throw new Error(`Griot quality: route context missing (${typedRequest.payload?.route}).`);

  const geometry = await page.evaluate(() => {
    const panel = document.querySelector('.ft-meta-ai__panel');
    const composer = document.querySelector('.ft-meta-ai__composer');
    const input = document.querySelector('.ft-meta-ai__input');
    const mic = document.querySelector('.ft-meta-ai__mic');
    const rect = panel.getBoundingClientRect();
    const micRect = mic.getBoundingClientRect();
    return {
      panelOverflow: panel.scrollWidth - panel.clientWidth,
      composerOverflow: composer.scrollWidth - composer.clientWidth,
      inputTag: input.tagName,
      inputFontSize: getComputedStyle(input).fontSize,
      panelTop: rect.top,
      panelBottom: rect.bottom,
      viewportHeight: window.innerHeight,
      micWidth: micRect.width,
      micHeight: micRect.height,
    };
  });

  if (geometry.panelOverflow > 1 || geometry.composerOverflow > 1) {
    throw new Error(`Griot quality: horizontal overflow remains ${JSON.stringify(geometry)}.`);
  }
  if (geometry.inputTag !== 'TEXTAREA') throw new Error(`Griot quality: composer is ${geometry.inputTag}, expected TEXTAREA.`);
  if (parseFloat(geometry.inputFontSize) < 16) throw new Error(`Griot quality: mobile input font may trigger iOS zoom (${geometry.inputFontSize}).`);
  if (geometry.panelTop < -0.5 || geometry.panelBottom > geometry.viewportHeight + 0.5) {
    throw new Error(`Griot quality: panel escaped mobile viewport ${JSON.stringify(geometry)}.`);
  }
  if (geometry.micWidth < 44 || geometry.micHeight < 44) {
    throw new Error(`Griot quality: microphone target is too small ${geometry.micWidth}x${geometry.micHeight}.`);
  }

  const tourEvent = page.evaluate(() => new Promise((resolve) => {
    document.addEventListener('flowtribe:tour-open', () => resolve(true), { once: true });
    setTimeout(() => resolve(false), 2000);
  }));
  await page.getByRole('button', { name: 'Show me how Flow helps' }).click();
  if (!(await tourEvent)) throw new Error('Griot quality: model tour action did not dispatch the tour event.');

  // Open again and prove spoken input enters the exact same griot.chat path.
  await page.getByRole('button', { name: 'Ask Griot' }).click();
  const beforeSpeech = requests.filter((request) => request.action === 'griot.chat').length;
  await page.getByRole('button', { name: 'Talk to Griot' }).click();
  await page.getByText(/Do not try to repay the lost evening/i).waitFor({ timeout: 5000 });
  const afterSpeechRequests = requests.filter((request) => request.action === 'griot.chat');
  if (afterSpeechRequests.length !== beforeSpeech + 1) {
    throw new Error('Griot quality: spoken input did not make exactly one shared conversation request.');
  }
  const spokenRequest = afterSpeechRequests.at(-1);
  if (!/family emergency/i.test(spokenRequest.payload?.message || '')) {
    throw new Error('Griot quality: speech transcript did not reach the shared conversation payload.');
  }
  if (!Array.isArray(spokenRequest.payload?.history) || spokenRequest.payload.history.length < 2) {
    throw new Error('Griot quality: conversational history was not preserved between typed and spoken turns.');
  }

  // Simulate a mobile visual viewport compressed by the on-screen keyboard.
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--ft-griot-vv-height', '430px');
    document.documentElement.style.setProperty('--ft-griot-vv-offset', '90px');
  });
  await page.waitForTimeout(40);
  const keyboardGeometry = await page.evaluate(() => {
    const rect = document.querySelector('.ft-meta-ai__panel').getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom };
  });
  if (keyboardGeometry.top < 89 || keyboardGeometry.bottom > 521) {
    throw new Error(`Griot quality: keyboard-compressed visual viewport is not respected ${JSON.stringify(keyboardGeometry)}.`);
  }

  if (pageErrors.length) throw new Error(`Griot quality produced page errors:\n${pageErrors.join('\n')}`);
  await page.close();
  console.log('Griot help quality verification: typed AI, spoken AI, context and mobile treatment passed');
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
