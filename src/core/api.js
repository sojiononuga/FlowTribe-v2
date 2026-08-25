/**
 * The API client.
 *
 * The only file in the application that calls `fetch`. Everything else goes
 * through `call(action, payload)`.
 *
 * Transport decisions, all of which are corrections of specific v1 faults:
 *
 *   POST only. v1 sent PINs as GET query parameters, where they were recorded
 *   in browser history, referrer headers, and Apps Script execution logs.
 *
 *   Content-Type: text/plain, carrying a JSON string. This looks wrong and is
 *   deliberate. `application/json` makes the request non-simple, triggering a
 *   CORS preflight; Apps Script does not answer OPTIONS, so the request dies
 *   before it arrives. `text/plain` keeps it a simple request and the response
 *   readable. The server parses the body as JSON regardless.
 *
 *   Not `mode: 'no-cors'`. v1 used it, which makes every response opaque — the
 *   promise resolves even when the server fails. Members saw a success
 *   checkmark for posts that were never recorded. This client reads real
 *   responses and reports real failures.
 *
 *   Every response is HTTP 200; success lives in the envelope's `ok` flag.
 *   Apps Script's own error pages are unhelpful HTML, so status codes are
 *   not a reliable signal.
 *
 * @module core/api
 */

import { config } from './config.js';
import { AppError, ErrorCode, toAppError } from './errors.js';
import { clearSession, getToken, touchSession } from './session.js';

/** Actions that must never carry a token. */
// Must mirror the four `capability: null` entries in appsscript/03_Router.gs.
// `system.health` was missing, so health() — the probe used to confirm a
// deployment — threw SESSION_EXPIRED locally for anyone not logged in and
// never reached the server. That is exactly who runs it, and exactly when.
const PUBLIC_ACTIONS = new Set([
  'system.health',
  'auth.register',
  'auth.login',
  'auth.checkUsername',
]);

/** Fired on the window when the server ends a session. */
export const SESSION_EXPIRED_EVENT = 'flowtribe:session-expired';

/** Fired when the server demands a PIN change before anything else. */
export const MUST_CHANGE_PIN_EVENT = 'flowtribe:must-change-pin';

/**
 * Call a server action.
 *
 * @param {string} action   Dotted action name, e.g. 'submission.create'.
 * @param {Object} [payload]
 * @param {Object} [options]
 * @param {number} [options.timeout]    Overrides config.api.timeoutMs.
 * @param {boolean} [options.retry]     Allow one retry on a transport failure.
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<Object>} the `data` object from a successful envelope
 * @throws {AppError}
 */
export async function call(action, payload = {}, options = {}) {
  if (!isConfigured()) {
    throw new AppError(ErrorCode.NOT_CONFIGURED);
  }

  const { timeout = config.api.timeoutMs, retry = true, signal } = options;

  const body = {
    action,
    payload,
    requestId: createRequestId(),
    clientVersion: config.version,
  };

  if (!PUBLIC_ACTIONS.has(action)) {
    const token = getToken();
    if (!token) {
      // Fail here rather than sending a request that is certain to be
      // rejected — it is faster and produces a cleaner error.
      throw new AppError(ErrorCode.SESSION_EXPIRED);
    }
    body.token = token;
  }

  try {
    return await send(body, { timeout, signal });
  } catch (error) {
    const appError = toAppError(error);

    // One retry, transport failures only. Never retry a rejected PIN or a
    // duplicate link: those fail identically and waste the member's time.
    // Safe because writes carry a requestId the server treats idempotently.
    if (retry && appError.retryable) {
      return send(body, { timeout, signal });
    }

    throw appError;
  }
}

/**
 * Check whether a deployment URL has been configured.
 *
 * v1 shipped with a `PASTE_YOUR_APPS_SCRIPT_URL_HERE` placeholder and only
 * discovered it at the first submission. This makes the state inspectable.
 *
 * @returns {boolean}
 */
export function isConfigured() {
  const url = config.api.baseUrl;
  return Boolean(url) && !url.includes('PASTE_YOUR') && url.startsWith('https://');
}

/**
 * Probe the deployment. Used by the gallery page and after a deploy.
 *
 * @returns {Promise<{ ok: boolean, version?: string, error?: string }>}
 */
export async function health() {
  try {
    const data = await call('system.health', {}, { retry: false, timeout: 8000 });
    return { ok: true, ...data };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

/* -------------------------------------------------------------------------
 * Internals
 * ---------------------------------------------------------------------- */

async function send(body, { timeout, signal }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  // Honour a caller's abort signal alongside the timeout.
  const onExternalAbort = () => controller.abort();
  if (signal) signal.addEventListener('abort', onExternalAbort);

  let response;
  try {
    response = await fetch(config.api.baseUrl, {
      method: 'POST',
      // See the module header: not a mistake.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      // Apps Script issues a 302 to a googleusercontent.com host that serves
      // the actual payload; without following it there is no response to read.
      redirect: 'follow',
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new AppError(ErrorCode.TIMEOUT, undefined, { cause: error });
    }
    throw new AppError(ErrorCode.NETWORK, undefined, { cause: error });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
  }

  const text = await response.text();

  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch (error) {
    // Almost always an Apps Script HTML error page — an undeployed script, a
    // permissions problem, or an uncaught server exception.
    console.error('[api] non-JSON response', text.slice(0, 500));
    throw new AppError(ErrorCode.MALFORMED_RESPONSE, undefined, { cause: error });
  }

  if (!envelope || typeof envelope !== 'object' || !('ok' in envelope)) {
    throw new AppError(ErrorCode.MALFORMED_RESPONSE);
  }

  if (envelope.ok === false) {
    throw buildError(envelope.error);
  }

  // The server slides the session forward on each authenticated request;
  // mirror the new expiry locally so the client agrees about when it ends.
  if (envelope.meta?.sessionExpiresAt) {
    touchSession(envelope.meta.sessionExpiresAt);
  }

  return envelope.data ?? {};
}

function buildError(raw) {
  const code = raw?.code || ErrorCode.SERVER_ERROR;

  const error = new AppError(code, raw?.message, {
    field: raw?.field,
    details: raw?.details,
  });

  // A dead session is handled once, here, rather than at every call site.
  // The shell listens and routes to login.
  if (error.endsSession) {
    clearSession();
    dispatch(SESSION_EXPIRED_EVENT);
  }

  if (error.code === ErrorCode.MUST_CHANGE_PIN) {
    dispatch(MUST_CHANGE_PIN_EVENT);
  }

  return error;
}

function dispatch(type, detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

/**
 * Generate a request id for idempotency.
 *
 * The server treats a repeat of the same id within a short window as the same
 * request, so a double-tapped submit button on a slow connection records one
 * post rather than two.
 */
function createRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
