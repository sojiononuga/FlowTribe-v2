/**
 * In-memory fakes for the Google Apps Script globals the backend uses.
 *
 * WHY THIS EXISTS
 * The backend cannot be run without Google's runtime, and a live deploy is a
 * separate step. But almost every defect worth catching before deploying is in
 * our code, not in Google's: a wrong column index, a broken orchestration
 * order, a capability that grants too much, a streak computed against the wrong
 * week. Those are all reachable with a faithful fake of the storage layer.
 *
 * WHAT IS FAITHFUL, AND WHAT IS NOT
 * Faithful: 1-based ranges, values-as-2D-arrays, Date objects coming back from
 * date cells, appendRow, deleteRow shifting indexes, cache expiry, script
 * properties, UUIDs, and byte-level digest output.
 *
 * Not faithful: latency, quotas, concurrency, and the exact coercion Sheets
 * applies to odd values. Those are the things the live deploy in Phase 5b is
 * for, and this harness deliberately does not claim them.
 */

(function (global) {
  /* ======================================================================
     Utilities
     ====================================================================== */

  var Charset = { UTF_8: 'UTF-8' };

  var MacAlgorithm = { HMAC_SHA_256: 'HMAC_SHA_256' };
  var DigestAlgorithm = { SHA_256: 'SHA_256' };

  /**
   * Minimal SHA-256 producing the signed byte array Apps Script returns.
   * Correctness matters here: PIN hashing and session ids depend on it.
   */
  function sha256Bytes(bytes) {
    var K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];

    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

    var data = bytes.slice();
    var bitLength = data.length * 8;

    data.push(0x80);
    while (data.length % 64 !== 56) data.push(0);

    for (var i = 7; i >= 0; i -= 1) data.push((bitLength / Math.pow(2, i * 8)) & 0xff);

    function rotr(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }

    for (var block = 0; block < data.length; block += 64) {
      var w = new Array(64);

      for (var t = 0; t < 16; t += 1) {
        w[t] = ((data[block + t * 4] << 24) | (data[block + t * 4 + 1] << 16) |
                (data[block + t * 4 + 2] << 8) | data[block + t * 4 + 3]) >>> 0;
      }

      for (var t2 = 16; t2 < 64; t2 += 1) {
        var s0 = (rotr(w[t2 - 15], 7) ^ rotr(w[t2 - 15], 18) ^ (w[t2 - 15] >>> 3)) >>> 0;
        var s1 = (rotr(w[t2 - 2], 17) ^ rotr(w[t2 - 2], 19) ^ (w[t2 - 2] >>> 10)) >>> 0;
        w[t2] = (w[t2 - 16] + s0 + w[t2 - 7] + s1) >>> 0;
      }

      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];

      for (var t3 = 0; t3 < 64; t3 += 1) {
        var S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
        var ch = ((e & f) ^ (~e & g)) >>> 0;
        var temp1 = (h + S1 + ch + K[t3] + w[t3]) >>> 0;
        var S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
        var maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
        var temp2 = (S0 + maj) >>> 0;

        h = g; g = f; f = e;
        e = (d + temp1) >>> 0;
        d = c; c = b; b = a;
        a = (temp1 + temp2) >>> 0;
      }

      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }

    var out = [];
    H.forEach(function (word) {
      out.push((word >>> 24) & 0xff, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff);
    });

    // Apps Script returns SIGNED bytes. Code that formats a digest must handle
    // negatives, so the fake reproduces that rather than hiding it.
    return out.map(function (byte) { return byte > 127 ? byte - 256 : byte; });
  }

  function toBytes(value) {
    var out = [];
    var text = String(value);

    for (var i = 0; i < text.length; i += 1) {
      var code = text.charCodeAt(i);
      if (code < 128) {
        out.push(code);
      } else if (code < 2048) {
        out.push(192 | (code >> 6), 128 | (code & 63));
      } else {
        out.push(224 | (code >> 12), 128 | ((code >> 6) & 63), 128 | (code & 63));
      }
    }

    return out;
  }

  function hmacSha256(message, key) {
    var blockSize = 64;
    var keyBytes = Array.isArray(key) ? key.slice() : toBytes(key);

    if (keyBytes.length > blockSize) {
      keyBytes = sha256Bytes(keyBytes).map(function (b) { return b < 0 ? b + 256 : b; });
    }
    while (keyBytes.length < blockSize) keyBytes.push(0);

    var outer = [];
    var inner = [];
    for (var i = 0; i < blockSize; i += 1) {
      outer.push(keyBytes[i] ^ 0x5c);
      inner.push(keyBytes[i] ^ 0x36);
    }

    var messageBytes = Array.isArray(message) ? message.slice() : toBytes(message);
    var innerHash = sha256Bytes(inner.concat(messageBytes)).map(function (b) {
      return b < 0 ? b + 256 : b;
    });

    return sha256Bytes(outer.concat(innerHash));
  }

  global.Utilities = {
    computeDigest: function (algorithm, value) { return sha256Bytes(toBytes(value)); },
    computeHmacSha256Signature: function (message, key) { return hmacSha256(message, key); },
    getUuid: function () {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (ch) {
        var random = (Math.random() * 16) | 0;
        return (ch === 'x' ? random : (random & 0x3) | 0x8).toString(16);
      });
    },
    base64Encode: function (bytes) {
      var normalised = bytes.map(function (b) { return b < 0 ? b + 256 : b; });
      var binary = normalised.map(function (b) { return String.fromCharCode(b); }).join('');
      return btoa(binary);
    },
    sleep: function () {},
    Charset: Charset,
    MacAlgorithm: MacAlgorithm,
    DigestAlgorithm: DigestAlgorithm,
  };

  global.Utilities.MacAlgorithm = MacAlgorithm;
  global.Utilities.DigestAlgorithm = DigestAlgorithm;
  global.Utilities.Charset = Charset;

  /* ======================================================================
     SpreadsheetApp
     ====================================================================== */

  function FakeRange(sheet, row, column, numRows, numColumns) {
    this._sheet = sheet;
    this._row = row;
    this._column = column;
    this._numRows = numRows;
    this._numColumns = numColumns;
  }

  FakeRange.prototype.getValues = function () {
    var out = [];

    for (var r = 0; r < this._numRows; r += 1) {
      var rowIndex = this._row + r - 1;
      var source = this._sheet._data[rowIndex] || [];
      var row = [];

      for (var c = 0; c < this._numColumns; c += 1) {
        var value = source[this._column + c - 1];
        row.push(value === undefined ? '' : stripLeadingApostrophe(value));
      }

      out.push(row);
    }

    return out;
  };

  FakeRange.prototype.getValue = function () {
    return this.getValues()[0][0];
  };

  FakeRange.prototype.setValues = function (values) {
    for (var r = 0; r < values.length; r += 1) {
      var rowIndex = this._row + r - 1;
      while (this._sheet._data.length <= rowIndex) this._sheet._data.push([]);

      for (var c = 0; c < values[r].length; c += 1) {
        this._sheet._data[rowIndex][this._column + c - 1] = coerceOnWrite(
          values[r][c],
          this._sheet._textColumns[this._column + c],
        );
      }
    }
    return this;
  };

  FakeRange.prototype.setValue = function (value) {
    return this.setValues([[value]]);
  };

  /**
   * In Sheets a leading apostrophe is a FORMATTING MARKER, not data. It means
   * "treat the rest as literal text", and getValue() returns the text without
   * it. That is exactly what SheetClient.sanitise() relies on to defuse a
   * formula-injection payload.
   *
   * The fake used to return the apostrophe as part of the string, so the smoke
   * test's `charAt(0) === '='` check passed here and reported a FALSE FAILURE
   * in production against a cell that was correctly inert.
   */
  function stripLeadingApostrophe(value) {
    if (typeof value === 'string' && value.charAt(0) === "'") return value.slice(1);
    return value;
  }

  /**
   * Empty for literal text, the source for a real formula.
   *
   * A value written with the apostrophe escape is text, so it has no formula —
   * which is the whole point of the escape, and the only thing that decides
   * whether a payload can execute.
   */
  FakeRange.prototype.getFormula = function () {
    var raw = (this._sheet._data[this._row - 1] || [])[this._column - 1];
    if (typeof raw !== 'string') return '';
    if (raw.charAt(0) === "'") return '';
    return raw.charAt(0) === '=' ? raw : '';
  };

  // Most formatting is presentation only and nothing in the backend reads it
  // back, so these stay no-ops.
  ['setFontWeight', 'setBackground', 'setFontColor', 'setHorizontalAlignment']
    .forEach(function (name) {
      FakeRange.prototype[name] = function () { return this; };
    });

  /**
   * setNumberFormat is NOT a no-op.
   *
   * '@' means plain text, and in real Sheets that is what stops a value being
   * parsed on write. The backend relies on it to keep the 366-character day
   * map and the ISO date keys intact, so the fake has to model it or it cannot
   * tell a protected column from an unprotected one.
   */
  FakeRange.prototype.setNumberFormat = function (format) {
    if (format === '@') {
      for (var c = 0; c < this._numColumns; c += 1) {
        this._sheet._textColumns[this._column + c] = true;
      }
    }
    return this;
  };

  function FakeSheet(name) {
    this._name = name;
    this._data = [];
    this._frozen = 0;
    // 1-based column index -> true when formatted as plain text.
    this._textColumns = {};
  }

  FakeSheet.prototype.getName = function () { return this._name; };

  FakeSheet.prototype.getLastRow = function () {
    for (var i = this._data.length - 1; i >= 0; i -= 1) {
      var row = this._data[i] || [];
      var hasValue = row.some(function (cell) {
        return cell !== '' && cell !== undefined && cell !== null;
      });
      if (hasValue) return i + 1;
    }
    return 0;
  };

  FakeSheet.prototype.getLastColumn = function () {
    return this._data.reduce(function (max, row) {
      return Math.max(max, (row || []).length);
    }, 0);
  };

  FakeSheet.prototype.getMaxRows = function () {
    return Math.max(this._data.length, 1000);
  };

  FakeSheet.prototype.getMaxColumns = function () {
    return Math.max(this.getLastColumn(), 30);
  };

  /**
   * Google Sheets PARSES what you write. A string that looks like a date
   * becomes a Date value, and reading it back gives a Date object — not the
   * string you wrote.
   *
   * The fake stored strings verbatim, so every `String(cell) === '2026-07-27'`
   * comparison in the repositories passed here and failed in production. That
   * fidelity gap is what let the WeeklyStats rollup bug reach a live
   * spreadsheet with 101/101 checks green.
   *
   * A column explicitly formatted as plain text ('@') is exempt — which is
   * precisely the mechanism the fix relies on.
   */
  function coerceOnWrite(value, isPlainText) {
    if (isPlainText) return value;
    if (typeof value !== 'string') return value;

    // ISO date (2026-07-27) and ISO datetime — what Sheets turns into a Date.
    if (/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(value)) {
      var parsed = new Date(value);
      if (!isNaN(parsed.getTime())) return parsed;
    }

    return value;
  }

  FakeSheet.prototype.getRange = function (row, column, numRows, numColumns) {
    return new FakeRange(this, row, column, numRows || 1, numColumns || 1);
  };

  FakeSheet.prototype.getDataRange = function () {
    return new FakeRange(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1));
  };

  FakeSheet.prototype.appendRow = function (values) {
    var sheet = this;
    this._data[this.getLastRow()] = values.map(function (value, index) {
      return coerceOnWrite(value, sheet._textColumns[index + 1]);
    });
    return this;
  };

  FakeSheet.prototype.deleteRow = function (rowIndex) {
    this._data.splice(rowIndex - 1, 1);
    return this;
  };

  FakeSheet.prototype.setFrozenRows = function (count) {
    this._frozen = count;
    return this;
  };

  FakeSheet.prototype.clear = function () {
    this._data = [];
    return this;
  };

  function FakeSpreadsheet() {
    this._sheets = {};
    this._timeZone = 'Etc/GMT';
  }

  FakeSpreadsheet.prototype.getSheetByName = function (name) {
    return this._sheets[name] || null;
  };

  FakeSpreadsheet.prototype.insertSheet = function (name) {
    this._sheets[name] = new FakeSheet(name);
    return this._sheets[name];
  };

  FakeSpreadsheet.prototype.getSheets = function () {
    var self = this;
    return Object.keys(this._sheets).map(function (name) { return self._sheets[name]; });
  };

  FakeSpreadsheet.prototype.setSpreadsheetTimeZone = function (tz) {
    this._timeZone = tz;
    return this;
  };

  FakeSpreadsheet.prototype.getSpreadsheetTimeZone = function () { return this._timeZone; };
  FakeSpreadsheet.prototype.getId = function () { return 'fake-spreadsheet'; };
  FakeSpreadsheet.prototype.getName = function () { return 'Flow Tribe — Test'; };
  FakeSpreadsheet.prototype.getUrl = function () {
    return 'https://docs.google.com/spreadsheets/d/fake-spreadsheet/edit';
  };

  var activeSpreadsheet = new FakeSpreadsheet();

  global.SpreadsheetApp = {
    getActiveSpreadsheet: function () { return activeSpreadsheet; },
    openById: function () { return activeSpreadsheet; },
    flush: function () {},
  };

  /* ======================================================================
     CacheService · PropertiesService · LockService · ScriptApp
     ====================================================================== */

  function FakeCache() { this._store = {}; }

  FakeCache.prototype.get = function (key) {
    var entry = this._store[key];
    if (!entry) return null;

    if (entry.expiresAt < Date.now()) {
      delete this._store[key];
      return null;
    }

    return entry.value;
  };

  FakeCache.prototype.put = function (key, value, seconds) {
    this._store[key] = { value: value, expiresAt: Date.now() + (seconds || 600) * 1000 };
  };

  FakeCache.prototype.remove = function (key) { delete this._store[key]; };

  FakeCache.prototype.removeAll = function (keys) {
    var self = this;
    (keys || []).forEach(function (key) { delete self._store[key]; });
  };

  var scriptCache = new FakeCache();

  global.CacheService = {
    getScriptCache: function () { return scriptCache; },
    getUserCache: function () { return scriptCache; },
  };

  function FakeProperties() { this._store = {}; }

  FakeProperties.prototype.getProperty = function (key) {
    return Object.prototype.hasOwnProperty.call(this._store, key) ? this._store[key] : null;
  };
  FakeProperties.prototype.setProperty = function (key, value) { this._store[key] = String(value); return this; };
  FakeProperties.prototype.deleteProperty = function (key) { delete this._store[key]; return this; };
  FakeProperties.prototype.getProperties = function () { return Object.assign({}, this._store); };

  var scriptProperties = new FakeProperties();

  global.PropertiesService = {
    getScriptProperties: function () { return scriptProperties; },
    getUserProperties: function () { return scriptProperties; },
  };

  /**
   * The lock is a simple flag. Single-threaded JavaScript means true
   * contention cannot be reproduced here — that is explicitly out of scope
   * and belongs to the live deploy.
   */
  function FakeLock() { this._held = false; }
  FakeLock.prototype.waitLock = function () { this._held = true; };
  FakeLock.prototype.tryLock = function () { this._held = true; return true; };
  FakeLock.prototype.releaseLock = function () { this._held = false; };
  FakeLock.prototype.hasLock = function () { return this._held; };

  global.LockService = {
    getScriptLock: function () { return new FakeLock(); },
    getUserLock: function () { return new FakeLock(); },
  };

  var installedTriggers = [];

  global.ScriptApp = {
    WeekDay: { MONDAY: 'MONDAY', SUNDAY: 'SUNDAY' },
    getProjectTriggers: function () { return installedTriggers.slice(); },
    deleteTrigger: function (trigger) {
      installedTriggers = installedTriggers.filter(function (t) { return t !== trigger; });
    },
    newTrigger: function (handler) {
      var spec = { handler: handler };

      var builder = {
        timeBased: function () { return builder; },
        onWeekDay: function () { return builder; },
        atHour: function () { return builder; },
        nearMinute: function () { return builder; },
        everyDays: function () { return builder; },
        everyMinutes: function () { return builder; },
        create: function () {
          var trigger = { getHandlerFunction: function () { return spec.handler; } };
          installedTriggers.push(trigger);
          return trigger;
        },
      };

      return builder;
    },
  };

  /* ======================================================================
     ContentService · Logger · console
     ====================================================================== */

  global.ContentService = {
    MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
    createTextOutput: function (content) {
      return {
        _content: content,
        setMimeType: function () { return this; },
        getContent: function () { return this._content; },
      };
    },
  };

  var logLines = [];

  global.Logger = {
    log: function (message) { logLines.push(String(message)); },
    getLog: function () { return logLines.join('\n'); },
    clear: function () { logLines = []; },
  };

  /* ======================================================================
     Test helpers
     ====================================================================== */

  global.FakeEnv = {
    /** Wipe every sheet, cache entry, and property between tests. */
    reset: function () {
      activeSpreadsheet._sheets = {};
      scriptCache._store = {};
      scriptProperties._store = {};
      installedTriggers = [];
      logLines = [];
    },
    spreadsheet: function () { return activeSpreadsheet; },
    triggers: function () { return installedTriggers; },
    logs: function () { return logLines.slice(); },
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
