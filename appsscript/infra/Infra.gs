/**
 * Platform wrappers: sheets, cache, locks, crypto, ids, logging.
 *
 * Everything that names a Google API lives here. No business meaning, so the
 * layers above can be reasoned about without knowing anything about Apps
 * Script — and if the store is ever swapped, this is the only file that
 * knows it was ever Sheets.
 *
 * Grouped into one file because Apps Script has no module system: file
 * boundaries are organisational only, and one well-sectioned file is easier to
 * follow than eight that all land in the same global scope anyway.
 */

/* ==========================================================================
   SheetClient — the only code that touches a spreadsheet
   ========================================================================== */

var SheetClient = (function () {
  var cachedSheets = {};
  var cachedBook = null;

  /**
   * The spreadsheet this script reads and writes: always the bound one.
   *
   * ── WHY THERE IS NO FT_SPREADSHEET_ID OVERRIDE ────────────────────────────
   * There used to be. It called `SpreadsheetApp.openById()` so a standalone
   * script, or a staging deployment, could point at a different spreadsheet.
   *
   * It could never have worked. The manifest declares
   * `spreadsheets.currentonly`, which grants access to the bound spreadsheet
   * and nothing else — `openById` on any other file fails with a permission
   * error at runtime. The only way to make the override function is to widen
   * the scope to full `spreadsheets`, which would grant this web app — a
   * deployment running as the owner and reachable by ANYONE_ANONYMOUS —
   * read and write access to every spreadsheet in the founder's Drive.
   *
   * That is a large amount of blast radius for a staging convenience, so the
   * override was removed rather than the scope widened. Staging is a copy of
   * the spreadsheet with its own bound script, which is one extra step and
   * carries no permission cost at all.
   *
   * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
   * @throws {AppError} when no spreadsheet can be reached
   */
  function book() {
    if (cachedBook) return cachedBook;

    try {
      cachedBook = SpreadsheetApp.getActiveSpreadsheet();
    } catch (error) {
      throw new AppError('SERVER_ERROR', ERROR_MESSAGES.SERVER_ERROR, {
        internal: 'Cannot open the bound spreadsheet: ' + error.message,
      });
    }

    if (!cachedBook) {
      // The commonest first-deploy mistake: a standalone script with no
      // spreadsheet. Named explicitly so the log says what to do.
      throw new AppError('SERVER_ERROR', ERROR_MESSAGES.SERVER_ERROR, {
        internal:
          'No spreadsheet. This script must be bound to one: open the ' +
          'spreadsheet and use Extensions > Apps Script, rather than ' +
          'creating a standalone script.',
      });
    }

    return cachedBook;
  }

  /**
   * @param {string} name
   * @returns {GoogleAppsScript.Spreadsheet.Sheet}
   * @throws {AppError} when the tab is missing
   */
  function sheet(name) {
    if (cachedSheets[name]) return cachedSheets[name];

    var target = book().getSheetByName(name);

    if (!target) {
      // A missing tab means setup was never run, or someone deleted it. Both
      // are fixed by setupBootstrap(), so the log says so.
      throw new AppError('SERVER_ERROR', ERROR_MESSAGES.SERVER_ERROR, {
        internal: 'Missing sheet "' + name + '". Run setupBootstrap() to recreate it.',
      });
    }

    cachedSheets[name] = target;
    return target;
  }

  /**
   * Every data row, excluding the header.
   *
   * One `getValues` call rather than per-row reads — Sheets charges per call,
   * not per cell, so a loop of single-cell reads is orders of magnitude slower.
   *
   * @param {string} name
   * @returns {Array<Array<*>>}
   */
  function readAll(name) {
    var target = sheet(name);
    var lastRow = target.getLastRow();
    var lastCol = target.getLastColumn();

    if (lastRow < 2) return [];
    return target.getRange(2, 1, lastRow - 1, lastCol).getValues();
  }

  /**
   * Append one row.
   *
   * @param {string} name
   * @param {Array<*>} values
   * @returns {number} the 1-based row index written
   */
  function append(name, values) {
    var target = sheet(name);
    target.appendRow(values.map(sanitise));
    return target.getLastRow();
  }

  /**
   * Append several rows in one call.
   *
   * @param {string} name
   * @param {Array<Array<*>>} rows
   */
  function appendMany(name, rows) {
    if (!rows.length) return;

    var target = sheet(name);
    var start = target.getLastRow() + 1;

    target
      .getRange(start, 1, rows.length, rows[0].length)
      .setValues(rows.map(function (row) {
        return row.map(sanitise);
      }));
  }

  /**
   * Overwrite a whole row.
   *
   * @param {string} name
   * @param {number} rowIndex 1-based, including the header
   * @param {Array<*>} values
   */
  function updateRow(name, rowIndex, values) {
    sheet(name)
      .getRange(rowIndex, 1, 1, values.length)
      .setValues([values.map(sanitise)]);
  }

  /**
   * Write several cells in one call.
   *
   * The batching that keeps the submission path inside its latency budget:
   * four separate single-cell writes are four round trips at 100–300ms each.
   *
   * @param {string} name
   * @param {number} rowIndex 1-based
   * @param {Array<{col:number, value:*}>} cells
   */
  function updateCells(name, rowIndex, cells) {
    if (!cells.length) return;

    var target = sheet(name);
    var columns = cells.map(function (c) { return c.col; });
    var min = Math.min.apply(null, columns);
    var max = Math.max.apply(null, columns);

    // One contiguous range covering every column being written. Reading the
    // span first preserves the cells in between.
    var span = target.getRange(rowIndex, min, 1, max - min + 1);
    var row = span.getValues()[0];

    cells.forEach(function (cell) {
      row[cell.col - min] = sanitise(cell.value);
    });

    span.setValues([row]);
  }

  /**
   * Guard against spreadsheet formula injection.
   *
   * A value beginning `=`, `+`, `-`, or `@` is interpreted as a formula when
   * the sheet is opened. A member bio reading `=IMPORTXML(...)` would become a
   * live formula in a document the operator opens daily.
   *
   * Applied at the write boundary so no repository can forget it.
   *
   * @param {*} value
   * @returns {*}
   */
  function sanitise(value) {
    if (typeof value !== 'string') return value;
    if (/^[=+\-@\t\r]/.test(value)) return "'" + value;
    return value;
  }

  /**
   * Verify headers match the column map.
   *
   * A column inserted by hand shifts every index. Failing loudly beats writing
   * a PIN hash into the platform column.
   *
   * @param {string} name
   * @param {string[]} expected
   * @returns {{ok:boolean, actual?:string[]}}
   */
  function verifyHeaders(name, expected) {
    var target = sheet(name);
    if (target.getLastColumn() < expected.length) {
      return { ok: false, actual: [] };
    }

    var actual = target.getRange(1, 1, 1, expected.length).getValues()[0].map(String);

    for (var i = 0; i < expected.length; i += 1) {
      if (actual[i] !== expected[i]) return { ok: false, actual: actual };
    }

    return { ok: true };
  }

  /** Forget cached sheet handles — used by Bootstrap after creating tabs. */
  function reset() {
    cachedSheets = {};
    cachedBook = null;
  }

  return {
    sheet: sheet,
    book: book,
    readAll: readAll,
    append: append,
    appendMany: appendMany,
    updateRow: updateRow,
    updateCells: updateCells,
    sanitise: sanitise,
    verifyHeaders: verifyHeaders,
    reset: reset,
  };
})();

/* ==========================================================================
   CacheClient
   ========================================================================== */

var CacheClient = (function () {
  var PREFIX = 'ft:';
  var MAX_VALUE = 100000; // CacheService rejects values above ~100KB

  /**
   * Keys written during this execution.
   *
   * CacheService has no enumeration and no "clear all", so `reset()` can only
   * drop what this module knows it wrote. That is enough — a key it never
   * created is a key it never reads.
   */
  var tracked = [];

  function cache() {
    return CacheService.getScriptCache();
  }

  /**
   * @param {string} key
   * @returns {*} null when absent, expired, or unparseable
   */
  function get(key) {
    try {
      var raw = cache().get(PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      // Cache is an optimisation, never a source of truth. A miss is always
      // safe; a throw here would take down a request that could have worked.
      return null;
    }
  }

  /**
   * @param {string} key
   * @param {*} value
   * @param {number} seconds
   */
  function put(key, value, seconds) {
    try {
      var raw = JSON.stringify(value);
      if (raw.length > MAX_VALUE) return;
      cache().put(PREFIX + key, raw, seconds || 60);
      if (tracked.indexOf(key) === -1) tracked.push(key);
    } catch (error) {
      // Non-fatal by design.
    }
  }

  /** @param {string} key */
  function remove(key) {
    try {
      cache().remove(PREFIX + key);
    } catch (error) {
      // Non-fatal.
    }
  }

  /**
   * Invalidate everything derived for one member.
   *
   * Keys are namespaced by entity so a write path has one call to remember
   * instead of four — forgetting one is exactly the bug a member discovers
   * before a test does.
   *
   * @param {string} memberId
   */
  function invalidateMember(memberId) {
    remove('dash:' + memberId);
    remove('milestones:' + memberId);
    remove('profile:' + memberId);
  }

  /** @param {string} weekStart */
  function invalidateWeek(weekStart) {
    remove('lb:week:' + weekStart);
    remove('lb:month:' + weekStart.slice(0, 7));
    remove('lb:allTime');
  }

  /**
   * Read through the cache, computing on a miss.
   *
   * @param {string} key
   * @param {number} seconds
   * @param {Function} compute
   * @returns {*}
   */
  function remember(key, seconds, compute) {
    var hit = get(key);
    if (hit !== null) return hit;

    var value = compute();
    put(key, value, seconds);
    return value;
  }

  /**
   * Drop every tracked key.
   *
   * Used after a catalog or settings edit, where the change must be visible
   * immediately rather than after a TTL, and by the test harness between runs.
   *
   * CacheService offers no "clear all", so only the keys this module knows
   * about are removed. That is sufficient: a key it did not create is one it
   * never reads.
   */
  function reset() {
    ['settings', 'catalog', 'levels'].forEach(remove);
    tracked.forEach(remove);
    tracked = [];
  }

  return {
    get: get,
    put: put,
    remove: remove,
    remember: remember,
    invalidateMember: invalidateMember,
    invalidateWeek: invalidateWeek,
    reset: reset,
  };
})();

/* ==========================================================================
   LockClient
   ========================================================================== */

var LockClient = (function () {
  /**
   * Run a function holding the script lock.
   *
   * Sheets has no transactions, so this is the only thing standing between the
   * design and a duplicate invite redemption or a double-counted post.
   *
   * Apps Script offers no per-key locks, so the script lock is global. It is
   * held for as little time as possible — validation happens outside it.
   *
   * @param {string} name  For contention logging — which critical section waited
   * @param {Function} fn
   * @param {number} [timeoutMs=10000]
   * @returns {*} whatever `fn` returns
   */
  function withLock(name, fn, timeoutMs) {
    var lock = LockService.getScriptLock();
    var waited = Date.now();

    try {
      lock.waitLock(timeoutMs || DEFAULTS.LOCK_TIMEOUT_MS);
    } catch (error) {
      throw new AppError('SERVER_ERROR', 'Something went wrong on our end. Try again.', {
        internal: 'Lock timeout after ' + (Date.now() - waited) + 'ms',
      });
    }

    var elapsed = Date.now() - waited;
    // Surface contention rather than assume it away — the review flagged this
    // as measured-by-nobody.
    if (elapsed > 500) {
      Logger_.warn('lock', name + ' waited ' + elapsed + 'ms');
    }

    try {
      return fn();
    } finally {
      lock.releaseLock();
    }
  }

  return { withLock: withLock };
})();

/* ==========================================================================
   Crypto
   ========================================================================== */

var Crypto = (function () {
  /**
   * The server-side pepper.
   *
   * Never in a sheet, never in the repository. Salting and iteration slow an
   * attacker who already has the hashes; the pepper means having the hashes is
   * not enough — and a leaked spreadsheet is the most plausible way they would
   * be obtained.
   *
   * @returns {string}
   */
  function pepper() {
    var value = PropertiesService.getScriptProperties().getProperty(SECRET_KEYS.PIN_PEPPER);

    if (!value) {
      throw new AppError('SERVER_ERROR', 'Something went wrong on our end. Try again.', {
        internal: 'PIN pepper not configured — run setupSecrets() once',
      });
    }

    return value;
  }

  /**
   * Hash a PIN.
   *
   * Iterated HMAC-SHA256 with a per-member salt and a server pepper. Apps
   * Script offers no bcrypt, scrypt, or Argon2 — only SHA-family digests and
   * HMAC — so this is the strongest construction the platform allows.
   *
   * @param {string} pin
   * @param {string} salt
   * @param {number} [iterations]
   * @returns {string} hex
   */
  function hashPin(pin, salt, iterations) {
    var rounds = iterations || DEFAULTS.HASH_ITERATIONS;
    var key = pepper();
    var value = String(pin) + ':' + String(salt);

    for (var i = 0; i < rounds; i += 1) {
      value = toHex(
        Utilities.computeHmacSha256Signature(value, key),
      );
    }

    return value;
  }

  /**
   * Constant-time string comparison.
   *
   * A short-circuiting `===` leaks how many leading characters matched, which
   * over enough attempts meaningfully narrows a six-digit space.
   *
   * @param {string} a
   * @param {string} b
   * @returns {boolean}
   */
  function timingSafeEqual(a, b) {
    var left = String(a || '');
    var right = String(b || '');

    // Compare over a fixed length so the loop count does not reveal the
    // shorter string's length.
    var length = Math.max(left.length, right.length);
    var diff = left.length ^ right.length;

    for (var i = 0; i < length; i += 1) {
      diff |= left.charCodeAt(i % (left.length || 1)) ^ right.charCodeAt(i % (right.length || 1));
    }

    return diff === 0 && left.length === right.length;
  }

  /**
   * @param {number} [bytes=16]
   * @returns {string} hex
   */
  function randomHex(bytes) {
    var count = bytes || 16;
    var out = '';

    for (var i = 0; i < count; i += 1) {
      out += ('0' + Math.floor(Math.random() * 256).toString(16)).slice(-2);
    }

    // Mix in high-resolution time and a UUID so the result does not depend on
    // Math.random alone.
    return sha256(out + Utilities.getUuid() + String(Date.now())).slice(0, count * 2);
  }

  /**
   * A session token. Returned to the browser once and never stored raw.
   *
   * @returns {string}
   */
  function sessionToken() {
    return sha256(Utilities.getUuid() + Utilities.getUuid() + String(Date.now()) + randomHex(16));
  }

  /**
   * @param {string} value
   * @returns {string} hex SHA-256
   */
  function sha256(value) {
    return toHex(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8),
    );
  }

  function toHex(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i += 1) {
      var byte = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
      out += ('0' + byte.toString(16)).slice(-2);
    }
    return out;
  }

  return {
    hashPin: hashPin,
    timingSafeEqual: timingSafeEqual,
    randomHex: randomHex,
    sessionToken: sessionToken,
    sha256: sha256,
  };
})();

/* ==========================================================================
   Ids
   ========================================================================== */

var Ids = (function () {
  /**
   * Next sequential id for a prefix.
   *
   * Derived from the highest existing id rather than a counter, so it stays
   * correct if a row is added by hand.
   *
   * @param {string} prefix
   * @param {Array<Array<*>>} rows
   * @param {number} column zero-based
   * @param {number} [width=4]
   * @returns {string}
   */
  function next(prefix, rows, column, width) {
    var highest = 0;

    rows.forEach(function (row) {
      var value = String(row[column] || '');
      if (value.indexOf(prefix + '-') !== 0) return;

      var n = parseInt(value.slice(prefix.length + 1), 10);
      if (!isNaN(n) && n > highest) highest = n;
    });

    return prefix + '-' + String(highest + 1).padStart(width || 4, '0');
  }

  /**
   * A random invite code.
   *
   * The alphabet excludes 0/O and 1/I/L: codes are read off a phone screen and
   * typed by hand, so legibility is worth more than the handful of bits.
   *
   * @param {number} [length=8]
   * @returns {string}
   */
  function inviteCode(length) {
    var size = length || DEFAULTS.INVITE_CODE_LENGTH;
    var out = '';

    for (var i = 0; i < size; i += 1) {
      out += INVITE_ALPHABET.charAt(Math.floor(Math.random() * INVITE_ALPHABET.length));
    }

    return out;
  }

  return { next: next, inviteCode: inviteCode };
})();

/* ==========================================================================
   Logger
   ========================================================================== */

var Logger_ = (function () {
  function line(level, scope, message, details) {
    var parts = ['[' + level + ']', '[' + scope + ']', message];
    if (details) parts.push(JSON.stringify(details));
    return parts.join(' ');
  }

  return {
    info: function (scope, message, details) {
      console.log(line('INFO', scope, message, details));
    },
    warn: function (scope, message, details) {
      console.warn(line('WARN', scope, message, details));
    },
    /**
     * Everything the server knows about a failure goes here and nowhere else.
     * The browser gets a generic message; this is what makes it diagnosable.
     */
    error: function (scope, error, details) {
      var message = error && error.message ? error.message : String(error);
      console.error(line('ERROR', scope, message, details));
      if (error && error.stack) console.error(error.stack);
    },
    /** Times a step against the submission latency budget. */
    time: function (scope, label, fn) {
      var started = Date.now();
      try {
        return fn();
      } finally {
        var elapsed = Date.now() - started;
        if (elapsed > 400) Logger_.warn(scope, label + ' took ' + elapsed + 'ms');
      }
    },
  };
})();
