/**
 * End-to-end journey verification.
 *
 * WHY THIS EXISTS
 *
 * Phase 10 found two crashes that had survived seven phases:
 *
 *   - the submit success screen read `result.stats.week`, but the API returns
 *     stats flat, so EVERY successful post threw a TypeError and told the
 *     member "We couldn't reach Flow Tribe";
 *   - the profile screen read `milestones.milestones`, but the API returns
 *     `{ totalEarned, totalAvailable, recent }`, so Profile never opened.
 *
 * Both slipped past `backend-suite.js` because its frontend-contract group
 * asserts the shape of the RESPONSE. It checked that `milestones.totalEarned`
 * exists — it does — while the view read a path that never existed. A test
 * written from the response can only ever confirm the response.
 *
 * So this harness does not assert shapes. It MOUNTS THE REAL VIEW MODULES
 * against the REAL backend and drives them with real DOM events. A view that
 * throws fails a test. A field that renders `undefined` fails a test. There is
 * no contract to keep in sync, because the view is the contract.
 *
 * HOW IT WORKS
 *
 *   1. `journeys.html` loads the Google fakes and every .gs file exactly as
 *      `backend.html` does, so `doPost` is a real function over a real
 *      in-memory spreadsheet.
 *   2. `window.fetch` is replaced with a stub that hands the request body
 *      straight to `doPost`. Nothing else in the client changes: the same
 *      api.js, the same envelope, the same error taxonomy.
 *   3. `registerRouter` receives a shim that mounts the same view modules
 *      main.js registers, so `navigate('/dashboard')` really does render the
 *      dashboard and a journey crosses screens the way a member does.
 *
 * WHAT IT CANNOT PROVE
 *
 * The same boundary as the backend suite: not Apps Script's runtime, not real
 * Sheets latency, not the deployment. It proves our code against a faithful
 * fake — which is exactly where these two defects lived.
 *
 * @module tests/journeys-suite
 */

import { config } from '../src/core/config.js';
import { registerRouter } from '../src/app/navigation.js';
import { clearSession, restoreSession } from '../src/core/session.js';

/* -------------------------------------------------------------------------
 * Reporting
 * ---------------------------------------------------------------------- */

const results = [];
let currentGroup = null;

function group(name) {
  currentGroup = { name, cases: [] };
  results.push(currentGroup);
}

async function it(name, fn) {
  try {
    // Let the previous journey's last navigation finish before touching the
    // screen, so one test can never corrupt the next.
    await quiet();
    await fn();
    currentGroup.cases.push({ name, ok: true });
  } catch (error) {
    currentGroup.cases.push({ name, ok: false, detail: error && error.message ? error.message : String(error) });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'expected'}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`);
  }
}

/* -------------------------------------------------------------------------
 * The screen
 * ---------------------------------------------------------------------- */

const screen = document.getElementById('screen');

/** Text content of the mounted screen, whitespace-collapsed. */
function text() {
  return screen.textContent.replace(/\s+/g, ' ').trim();
}

/** @returns {boolean} whether the rendered screen shows a literal undefined/NaN */
function hasPlaceholderLeak() {
  return /\bundefined\b|\bNaN\b|\[object Object\]/.test(text());
}

/**
 * Fail if the screen is an error state.
 *
 * This is the assertion that matters most, and it was missing on the first
 * pass. Every member view wraps its load in try/catch and renders an
 * EmptyState with a "Try again" button. So a view whose RENDER throws does not
 * blow up — it quietly shows "We could not load your dashboard", which is
 * long, contains no "undefined", and sails past a naive
 * "did something render?" check.
 *
 * That is exactly how defect B3 hid: LevelProgress threw on every dashboard
 * render, and the screen looked populated enough to pass.
 *
 * A "Try again" button appears in error states and nowhere else — genuine
 * empty states offer a forward action ("Submit today's post"), never a retry.
 */
function assertLoaded(what) {
  const retry = $all('button').some((node) => /try again/i.test(node.textContent));
  const failedCopy = /could not load|did not load|went wrong/i.test(text());
  if (retry || failedCopy) {
    throw new Error(`${what} rendered an ERROR STATE, not content: ${text().slice(0, 200)}`);
  }
  if (hasPlaceholderLeak()) {
    throw new Error(`${what} leaked a placeholder: ${text().slice(0, 200)}`);
  }
}

function $(selector) {
  return screen.querySelector(selector);
}

function $all(selector) {
  return [...screen.querySelectorAll(selector)];
}

/** The key core/session.js actually writes. */
const SESSION_KEY = 'flowtribe.session.v1';

/** @returns {string|null} the stored session token, or null when signed out */
function token() {
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw).token : null;
}

/**
 * Find a control by its visible label.
 *
 * Most fields are built by the Field component, which ties label to control
 * with for/id — so this is how a member finds them too, and it does not
 * depend on `name` attributes that only some fields carry.
 */
function byLabel(labelText) {
  const label = $all('label').find((node) =>
    node.textContent.replace(/\s+/g, ' ').replace(/\*/g, '').trim().startsWith(labelText));
  if (!label) throw new Error(`no field labelled "${labelText}" on screen: ${text().slice(0, 160)}`);
  const control = screen.querySelector(`#${CSS.escape(label.getAttribute('for'))}`);
  if (!control) throw new Error(`label "${labelText}" points at no control`);
  return control;
}

/**
 * Wait until a predicate holds, or fail loudly rather than asserting on a
 * half-rendered screen.
 *
 * The timeout is generous on purpose. A browser throttles setTimeout to about
 * one second in a BACKGROUND tab, so both this poll and the app's own
 * debounced work (the username availability check) slow down together. A 2s
 * budget gave roughly two polls and produced a test that passed when the tab
 * was visible and failed when it was not — the worst kind of test, because it
 * teaches you to re-run instead of to look.
 */
async function waitFor(predicate, description, timeout = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (predicate()) return;
    await settle(25);
  }
  throw new Error(`timed out waiting for ${description}. Screen: ${text().slice(0, 200)}`);
}

/** Find a clickable element whose visible text matches. */
function button(label) {
  const match = $all('button, a').find((node) => node.textContent.replace(/\s+/g, ' ').trim() === label);
  if (!match) throw new Error(`no control labelled "${label}" on screen: ${text().slice(0, 160)}`);
  return match;
}

function type(input, value) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function typePin(root, digits) {
  const boxes = [...root.querySelectorAll('input.ft-pin__digit')];
  digits.split('').forEach((digit, index) => {
    boxes[index].value = digit;
    boxes[index].dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Let pending microtasks and the view's own async work settle. */
function settle(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* -------------------------------------------------------------------------
 * Transport — the client's fetch, answered by the real backend
 * ---------------------------------------------------------------------- */

let lastRequest = null;

function installTransport() {
  config.api.baseUrl = 'https://script.google.com/macros/s/JOURNEY/exec';

  window.fetch = async (url, options) => {
    lastRequest = JSON.parse(options.body);
    const output = doPost({ postData: { contents: options.body } });
    const payload = output.getContent();
    return { ok: true, status: 200, text: async () => payload };
  };
}

/* -------------------------------------------------------------------------
 * Router shim — the same view modules main.js registers
 * ---------------------------------------------------------------------- */

const ROUTES = {
  '/login': () => import('../src/features/auth/login-view.js').then((m) => m.default),
  '/register': () => import('../src/features/auth/register-view.js').then((m) => m.default),
  '/welcome': () => import('../src/features/auth/welcome-view.js').then((m) => m.WelcomeView),
  '/help/pin': () => import('../src/features/auth/welcome-view.js').then((m) => m.ForgotPinView),
  '/change-pin': () => import('../src/features/auth/change-pin-view.js').then((m) => m.default),
  '/dashboard': () => import('../src/features/dashboard/dashboard-view.js').then((m) => m.default),
  '/submit': () => import('../src/features/submit/submit-view.js').then((m) => m.default),
  '/adapt': () => import('../src/features/adapt/adapt-view.js').then((m) => m.default),
  '/direction': () => import('../src/features/direction/direction-view.js').then((m) => m.default),
  '/leaderboard': () => import('../src/features/leaderboard/leaderboard-view.js').then((m) => m.default),
  '/milestones': () => import('../src/features/milestones/milestones-view.js').then((m) => m.default),
  '/levels': () => import('../src/features/levels/levels-view.js').then((m) => m.default),
  '/profile': () => import('../src/features/profile/profile-view.js').then((m) => m.default),
};

const visited = [];
let currentRoute = null;

/**
 * Mount a route the way the real router does, then wait for the view's own
 * data load. A view that throws propagates here and fails the test — which is
 * the entire point.
 */
async function go(path) {
  const load = ROUTES[path];
  if (!load) throw new Error(`journey harness has no route for ${path}`);

  visited.push(path);
  currentRoute = path;

  const View = await load();
  const node = View({ path, params: {}, query: {} });
  screen.replaceChildren(node);

  // Views fetch on mount. Wait for the skeleton to be replaced by real content
  // rather than asserting against a half-rendered screen — a flaky test that
  // sometimes passes is worse than no test.
  await settle(20);
  const started = Date.now();
  while (Date.now() - started < 10000) {
    if (!screen.querySelector('.ft-skeleton') && text().length > 20) break;
    await settle(25);
  }

  return node;
}

// A view calling navigate() is fire-and-forget from its point of view, but the
// harness must not start the next journey while a mount is still in flight —
// a stale dashboard landing on top of a freshly mounted login form makes tests
// fail for reasons that have nothing to do with the app.
let pendingNavigation = Promise.resolve();

registerRouter({
  navigate: (path) => { pendingNavigation = go(path); },
  get current() { return currentRoute; },
});

/** Wait for any navigation a view kicked off to finish mounting. */
async function quiet() {
  await pendingNavigation;
  await settle(10);
}

/* -------------------------------------------------------------------------
 * Backend fixture
 * ---------------------------------------------------------------------- */

function post(action, payload, token) {
  const body = JSON.stringify({
    action,
    payload: payload || {},
    token: token || null,
    requestId: `journey-${Math.random().toString(36).slice(2)}`,
  });
  return JSON.parse(doPost({ postData: { contents: body } }).getContent());
}

/**
 * A clean install with a Super Admin and one spare invite code.
 * Mirrors freshInstall() in backend-suite.js so both suites describe the same
 * world.
 */
function freshWorld() {
  localStorage.clear();
  clearSession();
  visited.length = 0;

  FakeEnv.reset();
  CacheClient.reset();
  SheetClient.reset();

  const properties = PropertiesService.getScriptProperties();
  properties.setProperty('FT_ADMIN_FULLNAME', 'Iyanu Founder');
  properties.setProperty('FT_ADMIN_USERNAME', 'founder');
  properties.setProperty('FT_ADMIN_PIN', '284619');
  properties.setProperty('FT_ADMIN_PLATFORM', 'Instagram');

  setupSecrets();
  setupBootstrap();
  setupSeedCatalog();
  setupSeedSuperAdmin();

  const admin = post('auth.login', { username: 'founder', pin: '284619' }).data;
  const invites = post('admin.invites.create', { count: 3 }, admin.token).data;

  return { admin, codes: invites.codes.map((entry) => entry.code) };
}

/** Register a member through the API and sign them in on the client. */
async function signedInMember(world, overrides = {}) {
  const payload = {
    fullName: 'Amaka Obi',
    username: 'amaka',
    pin: '284617',
    pinConfirm: '284617',
    platform: 'Flow',
    weeklyGoal: 3,
    goalTitle: 'Build my professional portfolio',
    showingUp: 'Complete one meaningful portfolio task',
    constraints: 'I work full time',
    inviteCode: world.codes.pop(),
    consentFeature: true,
    ...overrides,
  };
  post('auth.register', payload);

  await go('/login');
  type($('input[name="username"]'), payload.username);
  typePin(screen, payload.pin);
  button('Log in').click();

  await waitFor(() => token() !== null, 'the client to hold a session after login');
  return payload;
}

/* -------------------------------------------------------------------------
 * Journeys
 * ---------------------------------------------------------------------- */

async function run() {
  installTransport();

  /* ---- Registration ---------------------------------------------------- */

  group('REGISTRATION');

  await it('a new member completes all three steps and reaches the welcome screen', async () => {
    const world = freshWorld();
    await go('/register');

    // Step 1 — who you are.
    type(byLabel('Your full name'), 'Amaka Obi');
    type(byLabel('Choose a username'), 'amaka');
    await waitFor(() => $('.ft-input-status--ok') !== null, 'the username availability check');

    const pinGroups = $all('.ft-pin');
    equal(pinGroups.length, 2, 'step 1 should offer a PIN and a confirmation');
    typePin(pinGroups[0], '284617');
    typePin(pinGroups[1], '284617');
    button('Continue').click();
    await waitFor(() => {
      try { return Boolean(byLabel('What are you moving toward?')); } catch { return false; }
    }, 'direction step to render');

    // Step 2 — the destination, definition of showing up, and realistic rhythm.
    type(byLabel('What are you moving toward?'), 'Build my professional portfolio');
    type(byLabel('What does showing up look like?'), 'Complete one meaningful portfolio task');
    type(byLabel('Anything Flow should plan around?'), 'I work full time');
    const goal = $all('input[name="weeklyGoal"]').find((n) => n.value === '3');
    assert(goal, 'a three-times weekly rhythm should be offered');
    goal.click();
    button('Continue').click();
    await waitFor(() => {
      try { return Boolean(byLabel('Your invite code')); } catch { return false; }
    }, 'step 3 to render');

    // Step 3 — the invite.
    type(byLabel('Your invite code'), world.codes.pop());
    button('Start my Flow').click();

    await waitFor(() => visited.includes('/welcome'), 'registration to reach the welcome screen');
    assertLoaded("the welcome screen");
  });

  await it('an invalid invite code keeps the member on the form with a readable message', async () => {
    freshWorld();
    const before = post('auth.register', {
      fullName: 'Bad Code', username: 'badcode', pin: '284617', pinConfirm: '284617',
      platform: 'LinkedIn', weeklyGoal: 3, inviteCode: 'NOPE-NOPE', consentFeature: false,
    });
    assert(!before.ok, 'a bad invite code should be refused');
    assert(before.error.message && !/undefined/.test(before.error.message),
      'the refusal must carry member-facing copy');
  });

  /* ---- Login and session ----------------------------------------------- */

  group('LOGIN AND SESSION');

  await it('a member logs in and lands on a dashboard that renders every section', async () => {
    const world = freshWorld();
    await signedInMember(world);

    assert(visited.includes('/dashboard'), `expected /dashboard, visited ${visited.join(' → ')}`);
    await go('/dashboard');
    assertLoaded("the dashboard");
    assert(text().includes('Amaka'), 'dashboard should greet the member by name');
  });

  await it('a wrong PIN keeps the member on login and says so without naming the field at fault', async () => {
    const world = freshWorld();
    post('auth.register', {
      fullName: 'Amaka Obi', username: 'amaka', pin: '284617', pinConfirm: '284617',
      platform: 'LinkedIn', weeklyGoal: 3, inviteCode: world.codes.pop(), consentFeature: true,
    });

    await go('/login');
    type($('input[name="username"]'), 'amaka');
    typePin(screen, '111111');
    button('Log in').click();
    await settle(80);

    equal(currentRoute, '/login', 'a failed login must not navigate');
    const shown = text();
    assert(/don.t match|incorrect|not right/i.test(shown), `expected a failure message, got: ${shown.slice(0, 160)}`);
  });

  await it('a restored session survives a reload', async () => {
    const world = freshWorld();
    await signedInMember(world);

    // Simulate a fresh page: drop in-memory state, keep localStorage.
    restoreSession();
    await go('/dashboard');
    assertLoaded('the dashboard from a restored session');
    assert(text().includes('Amaka'), 'restored session lost the member');
  });

  /* ---- Showing up ------------------------------------------------------ */

  group('SHOWING UP');

  await it('logging a meaningful action shows momentum — not a network error', async () => {
    const world = freshWorld();
    await signedInMember(world);

    await go('/submit');
    type(byLabel('How did you show up?'), 'Outlined the first portfolio case study');
    type(byLabel('Evidence or note'), 'Draft saved in my workspace');
    button('Count this action').click();
    await settle(90);

    const shown = text();
    assert(/You moved/i.test(shown), `expected the success state, got: ${shown.slice(0, 200)}`);
    assert(!/couldn.t reach|check your connection/i.test(shown),
      'a successful action reported a network failure');
    assert(/1 of 3 meaningful actions/i.test(shown), `expected the momentum ring copy, got: ${shown.slice(0, 200)}`);
    assertLoaded('the action success screen');
  });

  await it('an action with optional URL evidence remains universal Flow activity', async () => {
    const world = freshWorld();
    await signedInMember(world);

    await go('/submit');
    type(byLabel('How did you show up?'), 'Published a portfolio draft');
    type(byLabel('Evidence or note'), 'https://example.com/proof/portfolio');
    button('Count this action').click();
    await settle(90);
    assert(/You moved/i.test(text()), `expected success, got: ${text().slice(0, 200)}`);

    const history = post('member.submissions', { page: 1, pageSize: 10 }, token());
    assert(history.ok, 'movement history should load');
    equal(history.data.entries[0].source, 'action');
    equal(history.data.entries[0].platform, 'Flow');
  });

  await it('an empty action is refused in place with a useful prompt', async () => {
    const world = freshWorld();
    await signedInMember(world);

    await go('/submit');
    button('Count this action').click();
    await settle(30);

    equal(currentRoute, '/submit', 'invalid movement must stay on the form');
    assert(/Say what you did/i.test(text()), `expected action guidance, got: ${text().slice(0, 200)}`);
  });

  /* ---- Flow Adapt ------------------------------------------------------ */

  group('FLOW ADAPT');

  await it('a real-life constraint produces an adapted path while preserving the goal', async () => {
    const world = freshWorld();
    await signedInMember(world);

    await go('/adapt');
    type(byLabel('What changed?'), 'There is no power and my laptop battery is dead');
    button('Adapt my path').click();
    await waitFor(() => /GOAL PRESERVED/.test(text()), 'Flow Adapt to produce a path');

    assertLoaded('the adapted path');
    assert(text().includes('Build my professional portfolio'), 'Flow Adapt must preserve the destination');
    assert(/offline|phone/i.test(text()), `power adaptation should fit the constraint: ${text().slice(0, 240)}`);
  });

  await it('the adapted path is not accepted until the member explicitly chooses it', async () => {
    const world = freshWorld();
    await signedInMember(world);

    await go('/adapt');
    type(byLabel('What changed?'), 'Work has become unexpectedly busy this week');
    button('Adapt my path').click();
    await waitFor(() => $all('button').some((node) => /Use this path/.test(node.textContent)), 'approval control');
    button('Use this path').click();
    await waitFor(() => /You are back in Flow/i.test(text()), 'the accepted recovery state');

    assertLoaded('the accepted adapted path');
    assert(/next move is small on purpose/i.test(text()), 'accepted state should make recovery explicit');
  });

  /* ---- The rest of the member app -------------------------------------- */

  group('MEMBER SCREENS');

  for (const [path, marker] of [
    ['/profile', 'Amaka'],
    ['/leaderboard', null],
    ['/milestones', null],
    ['/levels', null],
  ]) {
    await it(`${path} renders against real data without throwing or leaking undefined`, async () => {
      const world = freshWorld();
      await signedInMember(world);
      post('action.create', { title: 'Completed a useful step', evidence: '' }, token());

      await go(path);
      assertLoaded(path);
      if (marker) assert(text().includes(marker), `${path} should show ${marker}`);
    });
  }

  /* ---- PIN reset and change -------------------------------------------- */

  group('PIN RESET AND CHANGE');

  await it('an admin PIN reset forces the member through change-PIN before anything else', async () => {
    const world = freshWorld();
    const member = await signedInMember(world);

    const list = post('admin.members.list', {}, world.admin.token).data;
    const row = list.entries.find((entry) => entry.username === member.username);

    // The admin chooses the temporary PIN and tells the member out of band —
    // the server never invents one, so nothing secret is ever in a response.
    const temporary = '903518';
    const reset = post('admin.members.resetPin',
      { memberId: row.memberId, tempPin: temporary }, world.admin.token);
    assert(reset.ok, `the reset should succeed: ${JSON.stringify(reset.error)}`);

    // Old session is revoked, so the member logs in again with the temporary PIN.
    clearSession();
    await go('/login');
    type($('input[name="username"]'), member.username);
    typePin(screen, temporary);
    button('Log in').click();
    await settle(90);

    assert(visited.includes('/change-pin'),
      `a reset PIN must route to /change-pin, visited ${visited.join(' → ')}`);
  });

  await it('changing the PIN lets the member back in with the new one and locks out the old', async () => {
    const world = freshWorld();
    const member = await signedInMember(world);
    const sessionToken = token();

    const changed = post('auth.changePin',
      { currentPin: member.pin, newPin: '719284', newPinConfirm: '719284' }, sessionToken);
    assert(changed.ok, `changePin failed: ${JSON.stringify(changed.error)}`);

    const withNew = post('auth.login', { username: member.username, pin: '719284' });
    assert(withNew.ok, 'the new PIN should work');

    const withOld = post('auth.login', { username: member.username, pin: member.pin });
    assert(!withOld.ok, 'the old PIN must stop working');
  });

  /* ---- Logout ---------------------------------------------------------- */

  group('LOGOUT');

  await it('logging out clears the session and the token stops working', async () => {
    const world = freshWorld();
    await signedInMember(world);
    const sessionToken = token();

    const out = post('auth.logout', {}, sessionToken);
    assert(out.ok, 'logout should succeed');

    const after = post('member.dashboard', {}, sessionToken);
    assert(!after.ok, 'a revoked token must be refused');
    equal(after.error.code, 'SESSION_EXPIRED', 'a revoked token should read as an expired session');

    clearSession();
    assert(!token(), 'the client should hold no session after logout');
  });

  /* ---- Empty states ---------------------------------------------------- */

  group('EMPTY STATES');

  await it('a member with no actions sees encouragement, never a zero-rank or a blank screen', async () => {
    const world = freshWorld();
    await signedInMember(world);

    await go('/dashboard');
    const dashboard = text();
    assertLoaded("the empty dashboard");
    assert(!/#0\b|rank 0/i.test(dashboard), 'a member with no actions must not be shown a rank');

    await go('/leaderboard');
    assertLoaded("the empty leaderboard");
  });

  report();
}

/* -------------------------------------------------------------------------
 * Output
 * ---------------------------------------------------------------------- */

function report() {
  const total = results.reduce((sum, g) => sum + g.cases.length, 0);
  const failed = results.reduce((sum, g) => sum + g.cases.filter((c) => !c.ok).length, 0);

  const out = document.getElementById('out');
  const summary = document.createElement('div');
  summary.className = `summary ${failed ? 'fail' : 'pass'}`;
  summary.textContent = failed
    ? `${failed} of ${total} journeys failed`
    : `All ${total} journeys passed`;
  out.appendChild(summary);

  results.forEach((g) => {
    const block = document.createElement('div');
    block.className = 'group';
    const heading = document.createElement('h2');
    heading.textContent = g.name;
    block.appendChild(heading);

    g.cases.forEach((c) => {
      const line = document.createElement('div');
      line.className = `case ${c.ok ? 'ok' : 'no'}`;
      line.textContent = c.name;
      block.appendChild(line);
      if (!c.ok) {
        const detail = document.createElement('div');
        detail.className = 'detail';
        detail.textContent = c.detail;
        block.appendChild(detail);
      }
    });

    out.appendChild(block);
  });

  window.__JOURNEYS__ = { total, failed };
}

run();
