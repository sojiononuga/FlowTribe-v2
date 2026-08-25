/**
 * Hash-based router.
 *
 * Hash routing rather than the History API, because the app is served as
 * static files. A path-based router needs the host to rewrite every unknown
 * path to index.html, which is one more piece of infrastructure to configure
 * correctly and to get wrong. `#/dashboard` works on any static host, including
 * a file opened directly during development.
 *
 * Views are loaded with dynamic `import()`, so a route's code arrives when the
 * route is first visited. That keeps the initial payload to the shell — which
 * matters on the mobile connections most members will use.
 *
 * ON GUARDS AND SECURITY
 * The guards here are a user-experience feature. They stop a member landing on
 * a screen that would only render empty, and they send an expired session back
 * to login without a flash of dashboard. They are NOT a security boundary.
 * Authorisation happens on the server for every action. A member who bypasses
 * a guard by editing JavaScript reaches a page whose every request is refused.
 * This is stated in docs/auth-and-rbac.md §6 and repeated here because it is
 * the single easiest thing to forget while adding a route.
 *
 * @module core/router
 */

import { destroyTree, mount } from './component.js';

/**
 * @typedef {Object} Route
 * @property {string} path        e.g. '/dashboard' or '/members/:id'
 * @property {Function} view      () => Promise<{ default: Function }> | Function
 * @property {Function} [guard]   (context) => true | string — a string redirects
 * @property {string} [title]     Appended to the document title
 */

/**
 * @typedef {Object} RouteContext
 * @property {string} path
 * @property {Object<string,string>} params  From the path pattern
 * @property {URLSearchParams} query         From the hash query string
 */

/**
 * Create a router.
 *
 * @param {Object} options
 * @param {Route[]} options.routes
 * @param {HTMLElement} options.outlet     Where views mount.
 * @param {string} [options.fallback='/']  Used for an unknown path.
 * @param {Function} [options.onBeforeNavigate]
 * @param {Function} [options.onAfterNavigate]
 * @param {Function} [options.onError]
 * @returns {Object} router
 */
export function createRouter(options) {
  const {
    routes,
    outlet,
    fallback = '/',
    onBeforeNavigate,
    onAfterNavigate,
    onError,
  } = options;

  const compiled = routes.map(compileRoute);

  let currentPath = null;
  let currentView = null;
  // Guards against an out-of-order finish when a member taps two links quickly.
  let navigationId = 0;

  async function resolve() {
    const id = (navigationId += 1);
    const { path, query } = parseHash();
    const match = matchRoute(compiled, path);

    if (!match) {
      navigate(fallback, { replace: true });
      return;
    }

    const context = { path, params: match.params, query };

    // Guards run before the view module is fetched, so a redirect never pays
    // the cost of downloading a screen it will not show.
    if (typeof match.route.guard === 'function') {
      let verdict;
      try {
        verdict = match.route.guard(context);
      } catch (error) {
        reportError(error);
        return;
      }

      if (verdict !== true) {
        navigate(typeof verdict === 'string' ? verdict : fallback, { replace: true });
        return;
      }
    }

    if (onBeforeNavigate) onBeforeNavigate(context);

    let View;
    try {
      const loaded = await match.route.view();
      View = loaded?.default ?? loaded;
    } catch (error) {
      reportError(error);
      return;
    }

    // A newer navigation started while this module was loading — abandon.
    if (id !== navigationId) return;

    if (typeof View !== 'function') {
      reportError(new Error(`Route "${match.route.path}" did not resolve to a view function`));
      return;
    }

    try {
      const node = View(context);
      mount(outlet, node);
      currentView = node;
      currentPath = path;

      if (match.route.title) {
        document.title = `${match.route.title} · Flow Tribe`;
      }

      // Reset scroll on view change. Without this, arriving at a new screen
      // part-way down feels broken.
      window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });

      // Move focus to the outlet so screen readers announce the new screen;
      // otherwise focus stays on a link that no longer exists.
      outlet.setAttribute('tabindex', '-1');
      outlet.focus({ preventScroll: true });

      if (onAfterNavigate) onAfterNavigate(context, node);
    } catch (error) {
      reportError(error);
    }
  }

  function reportError(error) {
    console.error('[router]', error);
    if (onError) onError(error);
  }

  /**
   * Navigate to a path.
   *
   * @param {string} path
   * @param {Object} [opts]
   * @param {boolean} [opts.replace]  Replace history rather than push.
   */
  function navigate(path, opts = {}) {
    const target = path.startsWith('#') ? path : `#${path}`;

    if (window.location.hash === target) {
      resolve();
      return;
    }

    if (opts.replace) {
      const url = `${window.location.pathname}${window.location.search}${target}`;
      window.history.replaceState(null, '', url);
      resolve();
    } else {
      window.location.hash = target;
    }
  }

  /** Start listening and resolve the current URL. */
  function start() {
    window.addEventListener('hashchange', resolve);
    resolve();
  }

  /** Stop listening and tear down the mounted view. */
  function stop() {
    window.removeEventListener('hashchange', resolve);
    if (currentView) {
      destroyTree(outlet);
      currentView = null;
    }
  }

  return {
    start,
    stop,
    navigate,
    resolve,
    get current() {
      return currentPath;
    },
  };
}

/**
 * Read the current hash into a path and query.
 *
 * @returns {{ path: string, query: URLSearchParams }}
 */
export function parseHash() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, search = ''] = raw.split('?');

  return {
    path: normalisePath(path),
    query: new URLSearchParams(search),
  };
}

/* -------------------------------------------------------------------------
 * Internals
 * ---------------------------------------------------------------------- */

function normalisePath(path) {
  const withLeading = path.startsWith('/') ? path : `/${path}`;
  // Strip a trailing slash so '/members/' and '/members' are one route.
  return withLeading.length > 1 ? withLeading.replace(/\/+$/, '') : '/';
}

/**
 * Turn '/members/:id' into a matcher.
 *
 * Segment-by-segment rather than a regular expression: the patterns are
 * simple, and a literal comparison cannot be tripped by a member id that
 * happens to contain a regex metacharacter.
 */
function compileRoute(route) {
  const segments = normalisePath(route.path).split('/').filter(Boolean);

  return {
    route,
    segments: segments.map((segment) =>
      segment.startsWith(':')
        ? { param: segment.slice(1) }
        : { literal: segment },
    ),
  };
}

function matchRoute(compiled, path) {
  const parts = path.split('/').filter(Boolean);

  for (const entry of compiled) {
    if (entry.segments.length !== parts.length) continue;

    const params = {};
    let matched = true;

    for (let i = 0; i < entry.segments.length; i += 1) {
      const segment = entry.segments[i];

      if (segment.param) {
        params[segment.param] = decodeURIComponent(parts[i]);
      } else if (segment.literal !== parts[i]) {
        matched = false;
        break;
      }
    }

    if (matched) return { route: entry.route, params };
  }

  return null;
}
