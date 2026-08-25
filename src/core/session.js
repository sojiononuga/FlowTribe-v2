/**
 * Client-side session storage.
 *
 * Holds the opaque token issued at login, plus a cached copy of the member
 * record so the shell can render immediately on a return visit instead of
 * waiting for a round trip.
 *
 * Storage rules, and why:
 *
 *   localStorage, not sessionStorage — "remain signed in until you log out"
 *   means surviving a closed tab. sessionStorage does not.
 *
 *   The token is opaque and useless without the server's session row. Even so,
 *   localStorage is readable by any script on the origin, which is precisely
 *   why the app never assigns innerHTML anywhere (see core/dom.js).
 *
 *   The cached member is a rendering convenience and is never trusted for
 *   authorisation. Role comes from the server on every request; a member who
 *   edits `role` in devtools changes what their own browser draws and nothing
 *   else, because every action is checked server-side.
 *
 *   Expiry is checked locally to avoid a doomed request, but the server is the
 *   authority. A tampered `expiresAt` buys nothing.
 *
 * @module core/session
 */

import { createStore } from './store.js';

const STORAGE_KEY = 'flowtribe.session.v1';

/**
 * Treat a session as expired slightly early, so a request is not sent at the
 * exact moment the server would reject it.
 */
const EXPIRY_SKEW_MS = 30 * 1000;

/**
 * @typedef {Object} SessionMember
 * @property {string} memberId
 * @property {string} username
 * @property {string} fullName
 * @property {string} platform
 * @property {number} weeklyGoal
 * @property {string} role
 */

/**
 * @typedef {Object} SessionState
 * @property {string|null} token
 * @property {string|null} expiresAt      ISO 8601
 * @property {SessionMember|null} member
 * @property {string[]} capabilities      Server-issued; drives UI affordances only
 * @property {boolean} mustChangePin
 * @property {boolean} ready              Storage has been read
 */

/** @type {import('./store.js').Store<SessionState>} */
export const sessionStore = createStore(
  {
    token: null,
    expiresAt: null,
    member: null,
    capabilities: [],
    mustChangePin: false,
    ready: false,
  },
  { name: 'session' },
);

/**
 * Load any persisted session into the store.
 *
 * Called once during app boot, before the router starts, so the first route
 * resolution already knows whether anyone is signed in.
 *
 * @returns {SessionState}
 */
export function restoreSession() {
  const stored = readStorage();

  if (!stored || !stored.token) {
    sessionStore.set({ ready: true });
    return sessionStore.get();
  }

  if (isExpired(stored.expiresAt)) {
    clearSession();
    sessionStore.set({ ready: true });
    return sessionStore.get();
  }

  sessionStore.set({
    token: stored.token,
    expiresAt: stored.expiresAt ?? null,
    member: stored.member ?? null,
    capabilities: Array.isArray(stored.capabilities) ? stored.capabilities : [],
    mustChangePin: Boolean(stored.mustChangePin),
    ready: true,
  });

  return sessionStore.get();
}

/**
 * Persist a session after login or registration.
 *
 * @param {Object} payload
 * @param {string} payload.token
 * @param {string} [payload.expiresAt]
 * @param {SessionMember} [payload.member]
 * @param {string[]} [payload.capabilities]
 * @param {boolean} [payload.mustChangePin]
 */
export function saveSession(payload) {
  const next = {
    token: payload.token,
    expiresAt: payload.expiresAt ?? null,
    member: payload.member ?? null,
    capabilities: payload.capabilities ?? [],
    mustChangePin: Boolean(payload.mustChangePin),
  };

  writeStorage(next);
  sessionStore.set({ ...next, ready: true });
}

/**
 * Update the cached member without touching the token.
 *
 * Used after a profile edit so the greeting reflects a changed name without
 * forcing a re-login.
 *
 * @param {Partial<SessionMember>} patch
 */
export function updateSessionMember(patch) {
  const current = sessionStore.get();
  if (!current.member) return;

  const member = { ...current.member, ...patch };
  sessionStore.set({ member });
  writeStorage({ ...readStorage(), member });
}

/**
 * Record that the forced PIN change is done.
 *
 * @param {boolean} value
 */
export function setMustChangePin(value) {
  sessionStore.set({ mustChangePin: Boolean(value) });
  const stored = readStorage();
  if (stored) writeStorage({ ...stored, mustChangePin: Boolean(value) });
}

/**
 * Is this member being forced to replace their PIN?
 *
 * The flag was written and stored from the start and had no reader, because
 * nothing could act on it. The change-PIN screen uses it to decide whether it
 * is a forced reset or a voluntary change — copy only.
 *
 * A UX signal, never an authorisation one. `PinGate` enforces this server-side
 * on every request regardless of what the client believes.
 *
 * @returns {boolean}
 */
export function mustChangePin() {
  return Boolean(sessionStore.get().mustChangePin);
}

/**
 * Extend the local expiry after the server slides the session forward.
 *
 * @param {string} expiresAt  ISO 8601
 */
export function touchSession(expiresAt) {
  if (!expiresAt) return;
  sessionStore.set({ expiresAt });
  const stored = readStorage();
  if (stored) writeStorage({ ...stored, expiresAt });
}

/**
 * Clear everything. Called on logout, on SESSION_EXPIRED, and whenever the
 * stored payload fails to parse.
 */
export function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private browsing can refuse storage access; the in-memory clear below
    // still takes effect for this page.
  }

  sessionStore.set({
    token: null,
    expiresAt: null,
    member: null,
    capabilities: [],
    mustChangePin: false,
    ready: true,
  });
}

/**
 * @returns {string|null} the current token, or null if absent or expired
 */
export function getToken() {
  const { token, expiresAt } = sessionStore.get();
  if (!token) return null;
  if (isExpired(expiresAt)) return null;
  return token;
}

/**
 * @returns {boolean} true when a live session exists
 */
export function isAuthenticated() {
  return getToken() !== null;
}

/**
 * @returns {SessionMember|null}
 */
export function getMember() {
  return sessionStore.get().member;
}

/**
 * Check a capability for UI purposes — whether to draw the Admin switch,
 * whether to show a delete button.
 *
 * This is presentation only. Authorisation happens on the server for every
 * action; a member who forces this to return true sees buttons that fail.
 *
 * @param {string} capability
 * @returns {boolean}
 */
export function can(capability) {
  return sessionStore.get().capabilities.includes(capability);
}

/**
 * True when the session's expiry has passed.
 *
 * @param {string|null} expiresAt
 * @returns {boolean}
 */
export function isExpired(expiresAt) {
  if (!expiresAt) return false; // no expiry recorded — let the server decide
  const time = Date.parse(expiresAt);
  if (Number.isNaN(time)) return false;
  return time - EXPIRY_SKEW_MS <= Date.now();
}

/* -------------------------------------------------------------------------
 * Cross-tab synchronisation
 *
 * Logging out in one tab must log out the others. The `storage` event fires
 * in every other tab on the origin, so a removal there clears this one too.
 * Without it, a second tab keeps rendering a signed-in shell whose requests
 * all fail.
 * ---------------------------------------------------------------------- */

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;

    if (event.newValue === null) {
      sessionStore.set({
        token: null,
        expiresAt: null,
        member: null,
        capabilities: [],
        mustChangePin: false,
      });
      return;
    }

    try {
      const next = JSON.parse(event.newValue);
      sessionStore.set({
        token: next.token ?? null,
        expiresAt: next.expiresAt ?? null,
        member: next.member ?? null,
        capabilities: next.capabilities ?? [],
        mustChangePin: Boolean(next.mustChangePin),
      });
    } catch {
      clearSession();
    }
  });
}

/* -------------------------------------------------------------------------
 * Storage access
 *
 * Wrapped in try/catch throughout: Safari private mode and some embedded
 * webviews throw on access. A member who cannot persist a session should
 * still be able to use the app for the length of a page view.
 * ---------------------------------------------------------------------- */

function readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStorage(value) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Non-fatal: the session survives in memory for this page view.
  }
}
