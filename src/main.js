/**
 * Member app entry point.
 *
 * Boot order is fixed:
 *   1. Restore the session, so the first route resolution already knows whether
 *      anyone is signed in. Starting the router first causes a flash of login
 *      for a member who is already authenticated.
 *   2. Build the shell.
 *   3. Wire the global session handlers.
 *   4. Start the router.
 *
 * Every screen calls the live Apps Script backend through `core/api.js`.
 * There is no mock layer: `src/mock/` was deleted in Phase 5b, and the only
 * thing standing between a screen and the spreadsheet is the API client.
 *
 * If `config.js` carries no deployment URL, the client raises
 * `NOT_CONFIGURED` and every screen shows an actionable error rather than
 * failing silently — which is what v1 did until a member hit submit.
 *
 * @module main
 */

import { AppShell, BottomNav, TopBar } from './components/layout/index.js';
import { Logo } from './components/brand/index.js';
import { createRouter } from './core/router.js';
import {
  restoreSession, isAuthenticated, sessionStore, setMustChangePin, mustChangePin,
} from './core/session.js';
import { clearToasts, toastError } from './components/ui/index.js';
import { MUST_CHANGE_PIN_EVENT, SESSION_EXPIRED_EVENT } from './core/api.js';
import { config } from './core/config.js';
import { el, icon } from './core/dom.js';
import { Icons } from './lib/icons.js';
import { registerRouter } from './app/navigation.js';

/* -------------------------------------------------------------------------
 * Guards
 *
 * These are a user-experience feature, not a security boundary. They stop a
 * member landing on a screen that would render empty and send an expired
 * session to login without a flash of dashboard. Every action is authorised
 * server-side regardless of what the client permits.
 * ---------------------------------------------------------------------- */

/**
 * Signed in, and not mid-forced-PIN-change.
 *
 * The second half matters on a RESTORED session: the flag is persisted, so a
 * member who closes the tab mid-reset and comes back would otherwise land on
 * the dashboard, watch it fail, and be redirected from the error handler.
 * Checking here means they arrive where they need to be instead of bouncing
 * through a screen that cannot load.
 */
const requireAuth = () => {
  if (!isAuthenticated()) return '/login';
  if (mustChangePin()) return '/change-pin';
  return true;
};

/** Signed in. Used only by /change-pin, which requireAuth would send to itself. */
const requireSession = () => (isAuthenticated() ? true : '/login');

/** Not signed in. An already-signed-in visitor goes wherever they belong. */
const requireGuest = () => {
  if (!isAuthenticated()) return true;
  return mustChangePin() ? '/change-pin' : '/dashboard';
};

const routes = [
  {
    path: '/',
    // Always a redirect, never a render — so it returns a path in every case.
    guard: () => {
      if (!isAuthenticated()) return '/login';
      return mustChangePin() ? '/change-pin' : '/dashboard';
    },
    view: () => Blank,
  },

  // --- Authentication ---
  {
    path: '/login',
    title: 'Log in',
    guard: requireGuest,
    view: () => import('./features/auth/login-view.js'),
  },
  {
    path: '/register',
    title: 'Create account',
    guard: requireGuest,
    view: () => import('./features/auth/register-view.js'),
  },
  {
    path: '/welcome',
    title: 'Welcome',
    guard: requireAuth,
    view: async () => (await import('./features/auth/welcome-view.js')).WelcomeView,
  },
  {
    path: '/help/pin',
    title: 'Forgot PIN',
    view: async () => (await import('./features/auth/welcome-view.js')).ForgotPinView,
  },
  {
    path: '/change-pin',
    title: 'Change PIN',
    // requireSession, not requireGuest: a member in a forced change IS signed
    // in. The old MUST_CHANGE_PIN handler sent them to /login, where
    // requireGuest bounced them straight back to /dashboard, which threw
    // MUST_CHANGE_PIN again. That loop is what this route closes.
    //
    // And not requireAuth either — that redirects here, so this route would
    // redirect to itself.
    guard: requireSession,
    view: () => import('./features/auth/change-pin-view.js'),
  },

  // --- Member ---
  {
    path: '/dashboard',
    title: 'Dashboard',
    guard: requireAuth,
    view: () => import('./features/dashboard/dashboard-view.js'),
  },
  {
    path: '/submit',
    title: 'Log a post',
    guard: requireAuth,
    view: () => import('./features/submit/submit-view.js'),
  },
  {
    path: '/leaderboard',
    title: 'Leaderboard',
    guard: requireAuth,
    view: () => import('./features/leaderboard/leaderboard-view.js'),
  },
  {
    path: '/milestones',
    title: 'Milestones',
    guard: requireAuth,
    view: () => import('./features/milestones/milestones-view.js'),
  },
  {
    path: '/levels',
    title: 'Flow Levels',
    guard: requireAuth,
    view: () => import('./features/levels/levels-view.js'),
  },
  {
    path: '/profile',
    title: 'Profile',
    guard: requireAuth,
    view: () => import('./features/profile/profile-view.js'),
  },
];

/** Placeholder for the redirecting root route. */
const Blank = () => el('div');

/* -------------------------------------------------------------------------
 * Navigation
 * ---------------------------------------------------------------------- */

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Home', href: '#/dashboard', iconPaths: Icons.home },
  { id: 'leaderboard', label: 'Tribe', href: '#/leaderboard', iconPaths: Icons.users },
  { id: 'submit', label: 'Log a post', href: '#/submit', iconPaths: Icons.plus, cta: true },
  { id: 'milestones', label: 'Milestones', href: '#/milestones', iconPaths: Icons.award },
  { id: 'profile', label: 'You', href: '#/profile', iconPaths: Icons.user },
];

/** Routes that render without the app chrome. */
// The change-PIN screen is chrome-free on purpose. A member in a forced change
// can reach nothing else, so a navigation bar of links that all fail is worse
// than no navigation bar.
const BARE_ROUTES = new Set([
  '/', '/login', '/register', '/welcome', '/help/pin', '/change-pin',
]);

/* -------------------------------------------------------------------------
 * Boot
 * ---------------------------------------------------------------------- */

function boot() {
  if (config.debug) globalThis.__FT_DEBUG__ = true;

  restoreSession();

  const bottomNav = BottomNav({ items: NAV_ITEMS, activeId: 'dashboard' });
  const topBar = TopBar({ brand: Logo({ size: 'sm', inline: true }) });

  const shell = AppShell({ topBar, bottomNav, variant: 'app' });
  document.getElementById('app').replaceChildren(shell);

  const router = createRouter({
    routes,
    outlet: shell.outlet,
    fallback: '/',
    onError: () => toastError('Something went wrong loading that screen.'),

    onAfterNavigate: (context) => {
      // Auth screens drop the chrome: a member who is not signed in has
      // nowhere to navigate to, and a nav bar full of dead links is worse
      // than no nav bar.
      const bare = BARE_ROUTES.has(context.path) || !isAuthenticated();

      topBar.hidden = bare;
      bottomNav.hidden = bare;
      shell.classList.toggle('ft-shell--no-nav', bare);
      shell.classList.toggle('ft-shell--centered', bare);
      shell.outlet.classList.toggle('ft-container--sm', bare);

      const active = NAV_ITEMS.find((item) => context.path.startsWith(`/${item.id}`));
      bottomNav.update({ activeId: active ? active.id : null });
    },
  });

  registerRouter(router);

  window.addEventListener(SESSION_EXPIRED_EVENT, () => {
    clearToasts();
    router.navigate('/login', { replace: true });
  });

  // A reset PIN blocks every action but the change itself, so the only useful
  // destination is the change screen. Sending it to /login was the bug: the
  // member still holds a valid token, so requireGuest returned them to the
  // dashboard and the same error fired again.
  window.addEventListener(MUST_CHANGE_PIN_EVENT, () => {
    setMustChangePin(true);
    if (router.current !== '/change-pin') router.navigate('/change-pin', { replace: true });
  });

  // Signing out anywhere — including another tab — returns to login.
  sessionStore.watch(
    (state) => Boolean(state.token),
    (hasToken) => {
      if (!hasToken && !BARE_ROUTES.has(router.current)) {
        router.navigate('/login', { replace: true });
      }
    },
  );

  router.start();
}

boot();
