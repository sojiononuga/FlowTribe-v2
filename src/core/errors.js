/**
 * The error taxonomy.
 *
 * Every failure in the application is one of these codes. Each carries copy
 * already written in the brand's voice — warm, plain, and specific about what
 * to do next.
 *
 * v1 surfaced every failure as the same sentence about checking your
 * connection, whether the problem was a wrong PIN, a duplicate link, or a
 * server fault. A member could not tell what to do differently.
 *
 * The server returns these same codes (see docs/api.md §7) and its `message`
 * is safe to display verbatim. The table below is the fallback for when the
 * request never reaches the server, and the single place to adjust wording.
 *
 * @module core/errors
 */

/**
 * @readonly
 * @enum {string}
 */
export const ErrorCode = {
  // Transport
  NETWORK: 'NETWORK',
  TIMEOUT: 'TIMEOUT',
  MALFORMED_RESPONSE: 'MALFORMED_RESPONSE',
  NOT_CONFIGURED: 'NOT_CONFIGURED',

  // Validation
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  USERNAME_TAKEN: 'USERNAME_TAKEN',
  USERNAME_INVALID: 'USERNAME_INVALID',
  PIN_MISMATCH: 'PIN_MISMATCH',
  PIN_INVALID: 'PIN_INVALID',
  PIN_WEAK: 'PIN_WEAK',

  // Invites
  INVITE_INVALID: 'INVITE_INVALID',
  INVITE_USED: 'INVITE_USED',
  INVITE_EXPIRED: 'INVITE_EXPIRED',

  // Authentication
  AUTH_FAILED: 'AUTH_FAILED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  MUST_CHANGE_PIN: 'MUST_CHANGE_PIN',
  FORBIDDEN: 'FORBIDDEN',

  // Submissions
  PLATFORM_MISMATCH: 'PLATFORM_MISMATCH',
  INVALID_URL: 'INVALID_URL',
  DUPLICATE_LINK: 'DUPLICATE_LINK',
  DAILY_CAP: 'DAILY_CAP',

  // Everything else
  RATE_LIMITED: 'RATE_LIMITED',
  LAST_SUPER_ADMIN: 'LAST_SUPER_ADMIN',
  NOT_FOUND: 'NOT_FOUND',
  SERVER_ERROR: 'SERVER_ERROR',
};

/**
 * Fallback member-facing copy, by code.
 *
 * `PLATFORM_MISMATCH` is a template because the message names the member's
 * registered platform — approved copy, reproduced exactly.
 */
const MESSAGES = {
  [ErrorCode.NETWORK]: "We couldn't reach Flow Tribe. Check your connection and try again.",
  [ErrorCode.TIMEOUT]: 'That took longer than expected. Try again.',
  [ErrorCode.MALFORMED_RESPONSE]: 'Something went wrong on our end. Try again.',
  [ErrorCode.NOT_CONFIGURED]: 'Flow Tribe is not connected yet. Contact the team.',

  [ErrorCode.VALIDATION_FAILED]: 'Please check the highlighted fields.',
  [ErrorCode.USERNAME_TAKEN]: 'That username is taken. Try another.',
  [ErrorCode.USERNAME_INVALID]: 'Usernames use letters, numbers, dots and underscores.',
  [ErrorCode.PIN_MISMATCH]: "Those PINs don't match.",
  [ErrorCode.PIN_INVALID]: 'Your PIN needs to be 6 digits.',
  [ErrorCode.PIN_WEAK]: "Pick a PIN that isn't a repeat or a sequence.",

  [ErrorCode.INVITE_INVALID]: "That invite code isn't valid.",
  [ErrorCode.INVITE_USED]: 'That invite code has already been used.',
  [ErrorCode.INVITE_EXPIRED]: 'That invite code has expired. Ask for a new one.',

  [ErrorCode.AUTH_FAILED]: "That username and PIN don't match.",
  [ErrorCode.ACCOUNT_LOCKED]: 'Too many tries. Try again in 15 minutes.',
  [ErrorCode.ACCOUNT_INACTIVE]: 'Your account is paused. Reach out to the team.',
  [ErrorCode.SESSION_EXPIRED]: 'Your session ended. Please log in again.',
  [ErrorCode.MUST_CHANGE_PIN]: 'Set a new PIN to continue.',
  [ErrorCode.FORBIDDEN]: "You don't have access to that.",

  [ErrorCode.PLATFORM_MISMATCH]: 'This account is registered for {platform} posts only.',
  [ErrorCode.INVALID_URL]: "That doesn't look like a link. Paste the full URL.",
  [ErrorCode.DUPLICATE_LINK]: "You've already logged this post.",
  [ErrorCode.DAILY_CAP]: "That's plenty for today. Come back tomorrow.",

  [ErrorCode.RATE_LIMITED]: 'Slow down a moment, then try again.',
  [ErrorCode.LAST_SUPER_ADMIN]: "You can't remove the last Super Admin.",
  [ErrorCode.NOT_FOUND]: "We couldn't find that.",
  [ErrorCode.SERVER_ERROR]: 'Something went wrong on our end. Try again.',
};

/**
 * Codes that mean the session is over and the app must return to login.
 * The API client checks membership here rather than comparing strings at
 * each call site.
 */
const SESSION_ENDING = new Set([ErrorCode.SESSION_EXPIRED]);

/** Codes worth one automatic retry — transient by nature. */
const RETRYABLE = new Set([ErrorCode.NETWORK, ErrorCode.TIMEOUT]);

/**
 * An application error.
 *
 * Always carries a code and a message safe to show a member. `field` lets a
 * form highlight the input at fault; `details` is for the console only and is
 * never rendered.
 */
export class AppError extends Error {
  /**
   * @param {string} code
   * @param {string} [message]  Defaults to the copy for `code`.
   * @param {Object} [options]
   * @param {string} [options.field]
   * @param {Object} [options.details]
   * @param {Error}  [options.cause]
   */
  constructor(code, message, options = {}) {
    super(message || MESSAGES[code] || MESSAGES[ErrorCode.SERVER_ERROR]);

    this.name = 'AppError';
    this.code = code in ErrorCode ? code : ErrorCode.SERVER_ERROR;
    this.field = options.field || null;
    this.details = options.details || null;
    if (options.cause) this.cause = options.cause;
  }

  /** True when this error should send the member back to login. */
  get endsSession() {
    return SESSION_ENDING.has(this.code);
  }

  /** True when one automatic retry is worth attempting. */
  get retryable() {
    return RETRYABLE.has(this.code);
  }
}

/**
 * Look up the fallback message for a code.
 *
 * @param {string} code
 * @param {Object} [vars]  Substituted into `{placeholders}`.
 * @returns {string}
 */
export function messageFor(code, vars = {}) {
  const template = MESSAGES[code] || MESSAGES[ErrorCode.SERVER_ERROR];
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in vars ? String(vars[key]) : match,
  );
}

/**
 * Coerce anything thrown into an AppError.
 *
 * Call this in every catch block so downstream code can rely on `.code` and
 * on `.message` being safe to display.
 *
 * @param {unknown} error
 * @returns {AppError}
 */
export function toAppError(error) {
  if (error instanceof AppError) return error;

  // NOTE: there is deliberately no `error instanceof TypeError` branch here.
  //
  // `fetch` does reject with a TypeError when the request never left — offline,
  // DNS failure, a CORS rejection — but api.js `send()` already catches that at
  // the call site and throws AppError(NETWORK). By the time anything reaches
  // here, a genuine transport failure is ALREADY an AppError and returns above.
  //
  // So a TypeError arriving at this point is not a network problem. It is a bug
  // in our own code. Mapping it to NETWORK told members to "check your
  // connection" when the real fault was ours, and hid the defect from us: it is
  // how a crash on every successful post submission survived seven phases.
  // See docs/CURRENT_STATE.md, Phase 10 defect B1.
  return new AppError(ErrorCode.SERVER_ERROR, undefined, {
    cause: error instanceof Error ? error : undefined,
    details: { original: String(error) },
  });
}
