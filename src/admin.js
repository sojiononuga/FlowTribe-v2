/**
 * Admin app entry point.
 *
 * Mirrors src/main.js. Two differences: a wider container, because admin
 * screens carry tables, and a "My Dashboard" switch, because Community
 * Managers and Super Admins are members too — they have streaks, they appear
 * on the leaderboard, and they log posts like everyone else.
 *
 * ON THE GUARDS BELOW
 * They are a user-experience feature, not a security boundary. They stop
 * someone landing on a screen that would render empty. Every admin action is
 * authorised server-side against the caller's capabilities, so a member who
 * edits their own JavaScript to reach this shell sees an empty frame: every
 * panel is populated by a request the server refuses.
 *
 * This file is downloadable by anyone. It contains no data.
 *
 * @module admin
 */

import { AppShell, ModeSwitch, TopBar } from './components/layout/index.js';
import { Logo } from './components/brand/index.js';
import { Button, clearToasts, toastError } from './components/ui/index.js';
import { createRouter } from './core/router.js';
import { restoreSession, isAuthenticated, can, getMember, clearSession } from './core/session.js';
import { SESSION_EXPIRED_EVENT, MUST_CHANGE_PIN_EVENT, call } from './core/api.js';
import { config } from './core/config.js';
import { cx, el, icon } from './core/dom.js';
import { Icons } from './lib/icons.js';
import { registerRouter, navigate } from './app/navigation.js';

/* -------------------------------------------------------------------------
 * Guards
 * ---------------------------------------------------------------------- */

/** Any admin screen needs a session and the overview capability. */
function requireAdmin() {
  if (!isAuthenticated()) {
    window.location.href = `${config.app.memberEntry}#/login`;
    return false;
  }

  if (!can('admin:overview:read')) {
    // Signed in, just not for this — so they go to their own dashboard rather
    // than to a login screen they have already passed.
    window.location.href = `${config.app.memberEntry}#/dashboard`;
    return false;
  }

  return true;
}

/** Settings and the audit log are Super Admin only. */
function requireCapability(capability) {
  return () => {
    if (requireAdmin() !== true) return false;
    if (!can(capability)) return '/';
    return true;
  };
}

/* -------------------------------------------------------------------------
 * Routes
 * ---------------------------------------------------------------------- */

const routes = [
  { path: '/', title: 'Overview', guard: requireAdmin, view: () => import('./features/admin/overview-view.js') },
  { path: '/members', title: 'Members', guard: requireAdmin, view: () => import('./features/admin/members-view.js') },
  { path: '/members/:id', title: 'Member', guard: requireAdmin, view: () => import('./features/admin/member-detail-view.js') },
  { path: '/submissions', title: 'Submissions', guard: requireAdmin, view: () => import('./features/admin/submissions-view.js') },
  { path: '/leaderboard', title: 'Leaderboard', guard: requireAdmin, view: () => import('./features/admin/leaderboard-view.js') },
  { path: '/analytics', title: 'Analytics', guard: requireCapability('analytics:read'), view: () => import('./features/admin/analytics-view.js') },
  { path: '/invites', title: 'Invites', guard: requireCapability('invite:read'), view: () => import('./features/admin/invites-view.js') },
  { path: '/settings', title: 'Settings', guard: requireCapability('settings:read'), view: () => import('./features/admin/settings-view.js') },
  { path: '/audit', title: 'Audit log', guard: requireCapability('audit:read'), view: () => import('./features/admin/audit-view.js') },
];

/**
 * Navigation, filtered by capability.
 *
 * A Community Manager simply does not see Settings or the Audit log — not
 * because that protects anything, but because a link that always fails is
 * worse than no link.
 */
const NAV = [
  { path: '/', label: 'Overview', iconPaths: Icons.layout, capability: 'admin:overview:read' },
  { path: '/members', label: 'Members', iconPaths: Icons.users, capability: 'member:read:all' },
  { path: '/submissions', label: 'Submissions', iconPaths: Icons.fileText, capability: 'submission:read:all' },
  { path: '/leaderboard', label: 'Leaderboard', iconPaths: Icons.trophy, capability: 'admin:overview:read' },
  { path: '/analytics', label: 'Analytics', iconPaths: Icons.chart, capability: 'analytics:read' },
  { path: '/invites', label: 'Invites', iconPaths: Icons.ticket, capability: 'invite:read' },
  { path: '/settings', label: 'Settings', iconPaths: Icons.settings, capability: 'settings:update' },
  { path: '/audit', label: 'Audit', iconPaths: Icons.clipboard, capability: 'audit:read' },
];

function AdminNav(activePath) {
  const links = new Map();

  const node = el(
    'nav',
    { class: 'ft-adminnav', attrs: { 'aria-label': 'Admin sections' } },
    NAV.filter((item) => can(item.capability)).map((item) => {
      const link = el('a', {
        class: cx('ft-adminnav__item', item.path === activePath && 'ft-adminnav__item--active'),
        attrs: {
          href: `#${item.path}`,
          'aria-current': item.path === activePath ? 'page' : null,
        },
      }, [
        icon(item.iconPaths, { class: 'ft-adminnav__icon' }),
        el('span', { text: item.label }),
      ]);

      links.set(item.path, link);
      return link;
    }),
  );

  node.setActive = (path) => {
    for (const [itemPath, link] of links) {
      const active = itemPath === path;
      link.classList.toggle('ft-adminnav__item--active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  };

  return node;
}

/* -------------------------------------------------------------------------
 * Boot
 * ---------------------------------------------------------------------- */

function boot() {
  if (config.debug) globalThis.__FT_DEBUG__ = true;

  restoreSession();

  // Bounce before building anything, so an unauthorised visitor never sees a
  // frame flash on its way to somewhere else.
  if (requireAdmin() !== true) return;

  const member = getMember();

  const logoutButton = Button({
    label: 'Log out',
    variant: 'ghost',
    size: 'sm',
    iconPaths: Icons.logout,
    onClick: async () => {
      try {
        await call('auth.logout');
      } catch {
        // A failed logout must still clear the client. The session row expires
        // on its own; leaving someone signed in locally would be worse.
      }
      clearSession();
      window.location.href = `${config.app.memberEntry}#/login`;
    },
  });

  const nav = AdminNav(window.location.hash.replace(/^#/, '') || '/');

  const shell = AppShell({
    topBar: TopBar({
      brand: el('span', { class: 'ft-row ft-gap-3' }, [
        Logo({ size: 'sm', inline: true }),
        el('span', { class: 'ft-admin-tag', text: 'Admin' }),
      ]),
      actions: [
        ModeSwitch({ direction: 'toMember' }),
        logoutButton,
      ],
    }),
    variant: 'app',
    width: 'xl',
  });

  // The nav sits between the top bar and the outlet, inside the shell.
  shell.insertBefore(nav, shell.outlet);

  document.getElementById('app').replaceChildren(shell);

  const router = createRouter({
    routes,
    outlet: shell.outlet,
    fallback: '/',
    onAfterNavigate: (context) => nav.setActive(context.path),
    onError: () => toastError('Something went wrong loading that screen.'),
  });

  registerRouter(router);

  window.addEventListener(SESSION_EXPIRED_EVENT, () => {
    clearToasts();
    // Sessions begin in the member app, so that is where an expired one goes.
    window.location.href = `${config.app.memberEntry}#/login`;
  });

  // An admin's PIN can be reset like anyone else's, and PinGate then refuses
  // every admin action too — this shell would render a frame of failing
  // panels. The change screen lives in the member app, so this is a real
  // navigation rather than a route change.
  window.addEventListener(MUST_CHANGE_PIN_EVENT, () => {
    clearToasts();
    window.location.href = `${config.app.memberEntry}#/change-pin`;
  });

  router.start();

  if (member) document.title = `Admin · ${config.app.name}`;
}

boot();
