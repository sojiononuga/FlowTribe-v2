/**
 * The packed activity day map. PURE — no Apps Script APIs.
 *
 * `ActivityCalendar.DayMap` is a fixed 366-character string, one character per
 * day of the year, each a digit 0–9 holding that day's submission count.
 *
 * Sixty rows carry a year of daily activity for the whole community. Reading a
 * member's entire year is one cell; recording a post is one character. See
 * docs/database.md §4.2 for the alternative that was rejected.
 *
 * Always 366 characters, leap year or not, so index arithmetic never branches
 * on the year. Day 366 is unused in common years — six wasted characters per
 * member per year is not worth optimising.
 */

var FtDayMap = (function () {
  var LENGTH = 366;
  var MAX = 9;

  /** @returns {string} an all-zero map */
  function empty() {
    return '0'.repeat(LENGTH);
  }

  /**
   * Coerce anything read from a sheet into a valid map.
   *
   * A cell can be blank, truncated by a hand edit, or turned into a number by
   * Sheets' type coercion. Rather than trusting it, every read is normalised —
   * the ledger can always rebuild the truth, so a damaged map should degrade
   * rather than throw.
   *
   * @param {*} value
   * @returns {string} exactly 366 characters of 0–9
   */
  function normalise(value) {
    var text = value === null || value === undefined ? '' : String(value);
    var cleaned = text.replace(/[^0-9]/g, '');

    if (cleaned.length > LENGTH) return cleaned.slice(0, LENGTH);
    return cleaned + '0'.repeat(LENGTH - cleaned.length);
  }

  /**
   * Read one day's count.
   *
   * @param {string} map
   * @param {number} dayOfYear 1-based
   * @returns {number} 0–9
   */
  function get(map, dayOfYear) {
    if (dayOfYear < 1 || dayOfYear > LENGTH) return 0;
    return Number(normalise(map).charAt(dayOfYear - 1)) || 0;
  }

  /**
   * Set one day's count, returning a new map.
   *
   * @param {string} map
   * @param {number} dayOfYear 1-based
   * @param {number} count clamped to 0–9
   * @returns {string}
   */
  function set(map, dayOfYear, count) {
    if (dayOfYear < 1 || dayOfYear > LENGTH) return normalise(map);

    var safe = normalise(map);
    var clamped = Math.max(0, Math.min(MAX, Math.floor(count)));

    return safe.slice(0, dayOfYear - 1) + String(clamped) + safe.slice(dayOfYear);
  }

  /**
   * Add one to a day, capped at 9.
   *
   * The cap is a display limit only — the true count for any day is always
   * recoverable from the ledger.
   *
   * @param {string} map
   * @param {number} dayOfYear 1-based
   * @returns {{map: string, isNewActiveDay: boolean, count: number}}
   *   `isNewActiveDay` is what increments the active-day total that the
   *   7/30/100 milestones read.
   */
  function increment(map, dayOfYear) {
    var current = get(map, dayOfYear);
    var next = Math.min(current + 1, MAX);

    return {
      map: set(map, dayOfYear, next),
      isNewActiveDay: current === 0,
      count: next,
    };
  }

  /**
   * Count days with any activity.
   *
   * @param {string} map
   * @returns {number}
   */
  function activeDays(map) {
    var safe = normalise(map);
    var total = 0;

    for (var i = 0; i < LENGTH; i += 1) {
      if (safe.charAt(i) !== '0') total += 1;
    }

    return total;
  }

  /**
   * Sum every count in the map.
   *
   * @param {string} map
   * @returns {number}
   */
  function totalPosts(map) {
    var safe = normalise(map);
    var total = 0;

    for (var i = 0; i < LENGTH; i += 1) total += Number(safe.charAt(i));
    return total;
  }

  /**
   * 1-based day of year of the first and last active day.
   *
   * @param {string} map
   * @returns {{first: number|null, last: number|null}}
   */
  function bounds(map) {
    var safe = normalise(map);
    var first = null;
    var last = null;

    for (var i = 0; i < LENGTH; i += 1) {
      if (safe.charAt(i) !== '0') {
        if (first === null) first = i + 1;
        last = i + 1;
      }
    }

    return { first: first, last: last };
  }

  /**
   * Expand a map into a sparse `{ dayKey: count }` object.
   *
   * Sparse because a 26-week window typically has 30–80 active days out of
   * 182 — sending the zeroes would triple the payload for no information.
   *
   * @param {string} map
   * @param {number} year
   * @param {Function} shiftDayKey `FtWeek.shiftDayKey`
   * @returns {Object<string, number>}
   */
  function toCounts(map, year, shiftDayKey) {
    var safe = normalise(map);
    var jan1 = String(year).padStart(4, '0') + '-01-01';
    var out = {};

    for (var i = 0; i < LENGTH; i += 1) {
      var count = Number(safe.charAt(i));
      if (count > 0) out[shiftDayKey(jan1, i)] = count;
    }

    return out;
  }

  /**
   * Build a map from `{ dayKey: count }` — the nightly rebuild from the ledger.
   *
   * @param {Object<string, number>} counts
   * @param {number} year
   * @param {Function} dayOfYearFn `FtWeek.dayOfYear`
   * @returns {string}
   */
  function fromCounts(counts, year, dayOfYearFn) {
    var map = empty();

    Object.keys(counts).forEach(function (key) {
      if (Number(key.split('-')[0]) !== year) return;
      map = set(map, dayOfYearFn(key), counts[key]);
    });

    return map;
  }

  return {
    LENGTH: LENGTH,
    MAX: MAX,
    empty: empty,
    normalise: normalise,
    get: get,
    set: set,
    increment: increment,
    activeDays: activeDays,
    totalPosts: totalPosts,
    bounds: bounds,
    toCounts: toCounts,
    fromCounts: fromCounts,
  };
})();

if (typeof module !== 'undefined') module.exports = FtDayMap;
