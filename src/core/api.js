/**
 * The API client.
 *
 * The only file in the application that calls `fetch`. Everything else goes
 * through `call(action, payload)`.
 *
 * Most actions go to Apps Script. Griot chat and speech are deliberately
 * routed through same-origin Netlify Functions so their AI runtime can be
 * deployed independently while still validating the member's Flow session
 * against Apps Script.
 *
 * Apps Script transport decisions, all of which are corrections of specific
 * v1 faults:
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
 * @module core/api
 */

import { config } from './config.js';
import { AppError, ErrorCode, toAppError } from './errors.js';
import { clearSession, getToken, touchSession } from './session.js';

/** Actions that must never carry a token. */
const PUBLIC_ACTIONS = new Set([
  'system.health',
  'auth.register',
  'auth.login',
  'auth.checkUsername',
]);

const GRIOT_CHAT_ENDPOINT = '/.netlify/functions/griot-chat';
const GRIOT_SPEECH_ENDPOINT = '/.netlify/functions/griot';

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
      throw new AppError(ErrorCode.SESSION_EXPIRED);
    }
    body.token = token;
  }

  try {
    return await send(body, { timeout, signal });
  } catch (error) {
    const appError = toAppError(error);

    if (retry && appError.retryable) {
      return send(body, { timeout, signal });
    }

    throw appError;
  }
}

/** Check whether the core Apps Script deployment URL has been configured. */
export function isConfigured() {
  const url = config.api.baseUrl;
  return Boolean(url) && !url.includes('PASTE_YOUR') && url.startsWith('https://');
}

/** Probe the core deployment. */
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
  const onExternalAbort = () => controller.abort();
  if (signal) signal.addEventListener('abort', onExternalAbort);

  const isGriot = body.action === 'griot.chat' || body.action === 'griot.speak';
  const target = body.action === 'griot.chat'
    ? GRIOT_CHAT_ENDPOINT
    : body.action === 'griot.speak'
      ? GRIOT_SPEECH_ENDPOINT
      : config.api.baseUrl;

  let response;
  try {
    response = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': isGriot ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(body),
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
    console.error('[api] non-JSON response', text.slice(0, 500));
    throw new AppError(ErrorCode.MALFORMED_RESPONSE, undefined, { cause: error });
  }

  if (!envelope || typeof envelope !== 'object' || !('ok' in envelope)) {
    throw new AppError(ErrorCode.MALFORMED_RESPONSE);
  }

  if (envelope.ok === false) {
    throw buildError(envelope.error);
  }

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

function createRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
