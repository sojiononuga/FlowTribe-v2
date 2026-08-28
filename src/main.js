/**
 * Member app entry point.
 *
 * Boot order is fixed:
 *   1. Restore the session.
 *   2. Build the shell.
 *   3. Wire the global session handlers.
 *   4. Start the router.
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
import { el } from './core/dom.js';
import { Icons } from './lib/icons.js';
import { registerRouter } from './app/navigation.js';
import { MemberAssistControls } from './features/showcase/member-assist.js';

const requireAuth = () => {
  if (!isAuthenticated()) return '/login';
  if (mustChangePin()) return '/change-pin';
  return true;
};

const requireSession = () => (isAuthenticated() ? true : '/login');

const requireGuest = () => {
  if (!isAuthenticated()) return true;
  return mustChangePin() ? '/change-pin' : '/dashboard';
};

const routes = [
  {
    path: '/',
    guard: () => {
      if (!isAuthenticated()) return '/login';
      return mustChangePin() ? '/change-pin' : '/dashboard';
    },
    view: () => Blank,
  },
  { path: '/login', title: 'Log in', guard: requireGuest, view: () => import('./features/auth/login-view.js') },
  { path: '/register', title: 'Create account', guard: requireGuest, view: () => import('./features/auth/register-view.js') },
  { path: '/demo', title: 'Interactive demo', view: () => import('./features/demo/demo-view.js') },
  { path: '/welcome', title: 'Welcome', guard: requireAuth, view: async () => (await import('./features/auth/welcome-view.js')).WelcomeView },
  { path: '/help/pin', title: 'Forgot PIN', view: async () => (await import('./features/auth/welcome-view.js')).ForgotPinView },
  { path: '/change-pin', title: 'Change PIN', guard: requireSession, view: () => import('./features/auth/change-pin-view.js') },
  { path: '/dashboard', title: 'Flow', guard: requireAuth, view: () => import('./features/dashboard/dashboard-view.js') },
  { path: '/submit', title: 'Show up', guard: requireAuth, view: () => import('./features/submit/submit-view.js') },
  { path: '/adapt', title: 'Flow Adapt', guard: requireAuth, view: () => import('./features/adapt/adapt-view.js') },
  { path: '/direction', title: 'Direction', guard: requireAuth, view: () => import('./features/direction/direction-view.js') },
  { path: '/leaderboard', title: 'Leaderboard', guard: requireAuth, view: () => import('./features/leaderboard/leaderboard-view.js') },
  { path: '/milestones', title: 'Milestones', guard: requireAuth, view: () => import('./features/milestones/milestones-view.js') },
  { path: '/levels', title: 'Flow Levels', guard: requireAuth, view: () => import('./features/levels/levels-view.js') },
  { path: '/profile', title: 'Profile', guard: requireAuth, view: () => import('./features/profile/profile-view.js') },
];

const Blank = () => el('div');

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Home', href: '#/dashboard', iconPaths: Icons.home },
  { id: 'leaderboard', label: 'Tribe', href: '#/leaderboard', iconPaths: Icons.users },
  { id: 'submit', label: 'Show up', href: '#/submit', iconPaths: Icons.plus, cta: true },
  { id: 'milestones', label: 'Milestones', href: '#/milestones', iconPaths: Icons.award },
  { id: 'profile', label: 'You', href: '#/profile', iconPaths: Icons.user },
];

const BARE_ROUTES = new Set([
  '/', '/login', '/register', '/demo', '/welcome', '/help/pin', '/change-pin',
]);

function boot() {
  if (config.debug) globalThis.__FT_DEBUG__ = true;

  restoreSession();

  const bottomNav = BottomNav({ items: NAV_ITEMS, activeId: 'dashboard' });
  const assist = MemberAssistControls();
  const topBar = TopBar({ brand: Logo({ size: 'sm', inline: true }), actions: [assist] });

  const shell = AppShell({ topBar, bottomNav, variant: 'app' });
  document.getElementById('app').replaceChildren(shell);

  const router = createRouter({
    routes,
    outlet: shell.outlet,
    fallback: '/',
    onError: () => toastError('Something went wrong loading that screen.'),

    onAfterNavigate: (context) => {
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

  window.addEventListener(MUST_CHANGE_PIN_EVENT, () => {
    setMustChangePin(true);
    if (router.current !== '/change-pin') router.navigate('/change-pin', { replace: true });
  });

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
