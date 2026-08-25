/**
 * Username and PIN policy. PURE — no Apps Script APIs.
 *
 * Mirrored by `src/lib/validators.js` on the client for instant feedback. This
 * copy is authoritative; if the two ever disagree, this one decides and the
 * member sees this one's message.
 */

var FtIdentity = (function () {
  var USERNAME_MIN = 3;
  var USERNAME_MAX = 20;
  var PIN_LENGTH = 6;

  /**
   * Names that would let a member impersonate the community or the team.
   *
   * Not cosmetic: a member registering as `flowtribe` could pass for the
   * official account in a leaderboard screenshot.
   */
  var RESERVED = [
    'admin', 'administrator', 'superadmin', 'moderator', 'mod',
    'flowtribe', 'flow_tribe', 'flow.tribe', 'theflowtribe',
    'support', 'help', 'api', 'system', 'team', 'staff', 'official',
    'iyanu', 'me', 'you', 'null', 'undefined', 'root', 'test',
  ];

  /** Lowercase letters, digits, underscores, single interior dots. */
  var USERNAME_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*$/;

  /** The most-guessed 6-digit PINs. */
  var COMMON_PINS = [
    '123456', '654321', '111111', '000000', '121212', '123123',
    '112233', '696969', '159753', '666666', '999999', '888888',
    '777777', '101010', '202020', '123321', '456789', '789456',
    '147258', '258369', '135790', '246810', '111222', '123000',
  ];

  /**
   * The lookup key for a username: trimmed and lowercased.
   *
   * `Members.UsernameKey`. Applied before every comparison so `David` and
   * `david` are understood to be the same person.
   *
   * @param {string} value
   * @returns {string}
   */
  function usernameKey(value) {
    return String(value === null || value === undefined ? '' : value).trim().toLowerCase();
  }

  /**
   * Validate a username.
   *
   * @param {string} value
   * @returns {{valid:boolean, code?:string, message?:string}}
   */
  function validateUsername(value) {
    var key = usernameKey(value);

    if (!key) return fail('USERNAME_INVALID', 'Pick a username.');
    if (key.length < USERNAME_MIN) {
      return fail('USERNAME_INVALID', 'Usernames need at least ' + USERNAME_MIN + ' characters.');
    }
    if (key.length > USERNAME_MAX) {
      return fail('USERNAME_INVALID', 'Usernames can be up to ' + USERNAME_MAX + ' characters.');
    }
    if (!/^[a-z]/.test(key)) return fail('USERNAME_INVALID', 'Usernames start with a letter.');
    if (key.charAt(key.length - 1) === '.') {
      return fail('USERNAME_INVALID', "Usernames can't end with a dot.");
    }
    if (key.indexOf('..') !== -1) return fail('USERNAME_INVALID', 'Use single dots only.');
    if (!USERNAME_PATTERN.test(key)) {
      return fail('USERNAME_INVALID', 'Use letters, numbers, dots and underscores only.');
    }
    if (RESERVED.indexOf(key) !== -1) {
      return fail('USERNAME_INVALID', 'That username is reserved. Try another.');
    }

    return { valid: true };
  }

  /**
   * Validate a PIN.
   *
   * Six digits, rejecting repeats, straight runs, and the common list. A PIN of
   * `111111` makes the length decorative.
   *
   * @param {string} value
   * @returns {{valid:boolean, code?:string, message?:string}}
   */
  function validatePin(value) {
    var pin = String(value === null || value === undefined ? '' : value);

    if (!pin) return fail('PIN_INVALID', 'Choose a PIN.');
    if (!/^\d+$/.test(pin)) return fail('PIN_INVALID', 'Your PIN is numbers only.');
    if (pin.length !== PIN_LENGTH) {
      return fail('PIN_INVALID', 'Your PIN needs to be ' + PIN_LENGTH + ' digits.');
    }
    if (COMMON_PINS.indexOf(pin) !== -1) {
      return fail('PIN_WEAK', 'That PIN is too easy to guess. Try another.');
    }
    if (isAllSame(pin)) {
      return fail('PIN_WEAK', "Pick a PIN that isn't the same digit repeated.");
    }
    if (isSequential(pin)) return fail('PIN_WEAK', "Pick a PIN that isn't a sequence.");

    return { valid: true };
  }

  /**
   * Normalise an invite code for comparison.
   *
   * People paste codes formatted the way they were sent. Accepting
   * `abcd-2345` for `ABCD2345` avoids a support message.
   *
   * @param {string} value
   * @returns {string}
   */
  function inviteKey(value) {
    return String(value === null || value === undefined ? '' : value)
      .toUpperCase()
      .replace(/[\s-]/g, '');
  }

  /**
   * The backoff delay after `n` consecutive failed logins.
   *
   * Approved decision D43. A flat lockout was a denial-of-service vector:
   * usernames are visible on the leaderboard and Apps Script cannot see the
   * client IP, so anyone could lock out anyone. Backoff keeps the account
   * usable — the delay sits between attempts rather than forming a wall.
   *
   * @param {number} failures
   * @returns {number} milliseconds to wait before the next attempt
   */
  function backoffMs(failures) {
    var n = Number(failures) || 0;
    if (n < 5) return 0;
    if (n === 5) return 30 * 1000;
    if (n === 6) return 2 * 60 * 1000;
    if (n === 7) return 8 * 60 * 1000;
    return 30 * 60 * 1000;
  }

  /* ---- internals ---- */

  function fail(code, message) {
    return { valid: false, code: code, message: message };
  }

  function isAllSame(pin) {
    for (var i = 1; i < pin.length; i += 1) {
      if (pin.charAt(i) !== pin.charAt(0)) return false;
    }
    return true;
  }

  function isSequential(pin) {
    var ascending = true;
    var descending = true;

    for (var i = 1; i < pin.length; i += 1) {
      var delta = Number(pin.charAt(i)) - Number(pin.charAt(i - 1));
      if (delta !== 1) ascending = false;
      if (delta !== -1) descending = false;
    }

    return ascending || descending;
  }

  return {
    USERNAME_MIN: USERNAME_MIN,
    USERNAME_MAX: USERNAME_MAX,
    PIN_LENGTH: PIN_LENGTH,
    RESERVED: RESERVED,
    usernameKey: usernameKey,
    validateUsername: validateUsername,
    validatePin: validatePin,
    inviteKey: inviteKey,
    backoffMs: backoffMs,
  };
})();

if (typeof module !== 'undefined') module.exports = FtIdentity;
