/**
 * The error taxonomy.
 *
 * Every expected failure is an `AppError` carrying a code and copy already
 * written in the brand's voice — the client displays `message` verbatim.
 *
 * Anything that is NOT an AppError reaching the router is a bug: it is logged
 * with its stack and returned as a generic `SERVER_ERROR`. That distinction is
 * the whole strategy — an expected failure is a typed value, an unexpected one
 * is loud in the log and silent to the member.
 *
 * @see docs/api.md §11
 */

var ERROR_MESSAGES = Object.freeze({
  VALIDATION_FAILED: 'Please check the highlighted fields.',
  USERNAME_TAKEN: 'That username is taken. Try another.',
  USERNAME_INVALID: 'Usernames use letters, numbers, dots and underscores.',
  PIN_INVALID: 'Your PIN needs to be 6 digits.',
  PIN_WEAK: "Pick a PIN that isn't a repeat or a sequence.",
  PIN_MISMATCH: "Those PINs don't match.",
  INVITE_INVALID: "That invite code isn't valid.",
  INVITE_USED: 'That invite code has already been used.',
  INVITE_EXPIRED: 'That invite code has expired. Ask for a new one.',
  AUTH_FAILED: "That username and PIN don't match.",
  ACCOUNT_LOCKED: 'Too many tries. Give it a moment, then try again.',
  ACCOUNT_INACTIVE: 'Your account is paused. Reach out to the team.',
  SESSION_EXPIRED: 'Your session ended. Please log in again.',
  MUST_CHANGE_PIN: 'Set a new PIN to continue.',
  FORBIDDEN: "You don't have access to that.",
  INVALID_URL: "That doesn't look like a link. Paste the full URL.",
  PLATFORM_MISMATCH: 'This account is registered for that platform only.',
  DUPLICATE_LINK: "You've already logged this post.",
  DAILY_CAP: "That's plenty for today. Come back tomorrow.",
  RATE_LIMITED: 'Slow down a moment, then try again.',
  LAST_SUPER_ADMIN: "You can't remove the last Super Admin.",
  NOT_FOUND: "We couldn't find that.",
  SERVER_ERROR: 'Something went wrong on our end. Try again.',
});

/**
 * An expected, typed failure.
 *
 * @param {string} code
 * @param {string} [message] defaults to the copy for `code`
 * @param {Object} [options]
 * @param {string} [options.field]     which input to highlight
 * @param {string} [options.internal]  diagnostics — logged, NEVER returned
 * @param {Object} [options.details]   safe extra data for the client
 * @constructor
 */
function AppError(code, message, options) {
  var opts = options || {};

  this.name = 'AppError';
  this.code = ERROR_MESSAGES[code] ? code : 'SERVER_ERROR';
  this.message = message || ERROR_MESSAGES[this.code];
  this.field = opts.field || null;
  this.internal = opts.internal || null;
  this.details = opts.details || null;
  this.isAppError = true;
  this.stack = new Error(this.message).stack;
}

AppError.prototype = Object.create(Error.prototype);
AppError.prototype.constructor = AppError;

/**
 * @param {string} code
 * @param {string} [message]
 * @param {Object} [options]
 * @returns {AppError}
 */
function fail_(code, message, options) {
  return new AppError(code, message, options);
}

/**
 * True when a thrown value is one of ours.
 *
 * @param {*} error
 * @returns {boolean}
 */
function isAppError_(error) {
  return Boolean(error && error.isAppError);
}
