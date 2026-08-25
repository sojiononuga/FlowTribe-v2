/**
 * Navigation helper.
 *
 * The router instance is created in `main.js`, but views need to navigate
 * without importing it — a circular import, since `main.js` imports the views.
 * This module holds the reference and hands out a stable `navigate` function.
 *
 * @module app/navigation
 */

let router = null;

/**
 * Called once by the shell after the router is created.
 * @param {Object} instance
 */
export function registerRouter(instance) {
  router = instance;
}

/**
 * @param {string} path
 * @param {Object} [options]
 * @param {boolean} [options.replace]
 */
export function navigate(path, options) {
  if (router) {
    router.navigate(path, options);
    return;
  }

  // Fallback for a view rendered before registration — should not happen, but
  // a broken link is worse than a slightly less elegant navigation.
  window.location.hash = path.startsWith('#') ? path : `#${path}`;
}

/** @returns {string|null} the current route path */
export function currentPath() {
  return router ? router.current : null;
}
