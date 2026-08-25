/**
 * Configuration template.
 *
 * Copy this file to `config.js` and fill in the deployment URL:
 *
 *     cp src/core/config.example.js src/core/config.js
 *
 * `config.js` is git-ignored. This template is committed, so a new checkout
 * always knows what needs to be set.
 *
 * Nothing here is secret. The Apps Script URL is public by necessity — a
 * browser has to reach it — which is exactly why every action is authorised
 * server-side. Real secrets (the PIN pepper, the token signing key) live in
 * Apps Script `PropertiesService` and never reach the client.
 *
 * v1 hardcoded its deployment URL into the HTML it shipped. This is the fix,
 * with the least machinery that works.
 *
 * @module core/config
 */

export const config = {
  /** Shown in diagnostics and sent with each request so the server can spot stale clients. */
  version: '2.0.0-dev',

  api: {
    /**
     * The Apps Script web-app URL, ending in /exec.
     * Deploy ▸ New deployment ▸ Web app, then copy the URL here.
     */
    baseUrl: 'PASTE_YOUR_APPS_SCRIPT_URL_HERE',

    /**
     * Request timeout. Generous because an Apps Script cold start can take a
     * few seconds, and a spurious timeout on a slow connection is worse than
     * a slightly longer wait.
     */
    timeoutMs: 20000,
  },

  app: {
    name: 'Flow Tribe',

    /** Where the member app lives, relative to the site root. */
    memberEntry: 'index.html',

    /** Where the admin app lives. The mode switch navigates between the two. */
    adminEntry: 'admin.html',

    /**
     * Display timezone. Must match the timezone in appsscript/appsscript.json,
     * or a post logged late on Sunday could land in a different week on the
     * client than it does on the server.
     */
    timezone: 'Africa/Lagos',
  },

  /**
   * Client-side mirrors of server rules, for instant feedback only.
   *
   * The server validates independently and its answer is the one that counts.
   * These exist so a member learns their PIN is too short while typing rather
   * than after a round trip.
   */
  rules: {
    pinLength: 6,
    usernameMinLength: 3,
    usernameMaxLength: 20,
    bioMaxLength: 160,
  },

  /**
   * Turns on store logging and the diagnostics panel in the gallery.
   * Left false in anything deployed.
   */
  debug: false,
};

export default config;
