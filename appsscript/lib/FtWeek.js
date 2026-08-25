/**
 * Week and day boundaries. PURE — no Apps Script APIs.
 *
 * Every streak, rollup, leaderboard, and calendar square depends on agreeing
 * where a week starts. That agreement lives here and nowhere else.
 *
 * All boundaries are Monday 00:00 in the community timezone. The timezone is
 * passed in rather than read from the environment, so the same function gives
 * the same answer in Apps Script, in a browser test, and on a laptop in another
 * country.
 *
 * Loaded in Apps Script as a global; exported for the test harness by the
 * guard at the foot of the file.
 */

var FtWeek = (function () {
  var DAY_MS = 86400000;

  /**
   * Convert a Date to the wall-clock parts of a target timezone.
   *
   * `Intl.DateTimeFormat` is the only correct way to do this without a
   * timezone database. Manual UTC offsets break the moment a region observes
   * daylight saving — Africa/Lagos does not, but writing the arithmetic that
   * assumes it never will is how a bug gets planted for someone else to find.
   *
   * @param {Date} date
   * @param {string} timeZone
   * @returns {{year:number, month:number, day:number, hour:number, minute:number, weekday:number}}
   *   `weekday` is 0 for Monday through 6 for Sunday.
   */
  function partsInZone(date, timeZone) {
    var formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
    });

    var parts = {};
    formatter.formatToParts(date).forEach(function (part) {
      parts[part.type] = part.value;
    });

    var weekdayIndex = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday);

    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      // 24 is midnight in some en-GB implementations.
      hour: Number(parts.hour) % 24,
      minute: Number(parts.minute),
      weekday: weekdayIndex,
    };
  }

  /**
   * The ISO date string for a moment, in the community timezone.
   *
   * This is `Submissions.DayKey` — the calendar grouping key.
   *
   * @param {Date} date
   * @param {string} timeZone
   * @returns {string} `YYYY-MM-DD`
   */
  function dayKey(date, timeZone) {
    var p = partsInZone(date, timeZone);
    return pad4(p.year) + '-' + pad2(p.month) + '-' + pad2(p.day);
  }

  /**
   * The Monday of the week containing a moment, as an ISO date.
   *
   * This is `Submissions.WeekStart` and the primary key half of `WeeklyStats`.
   *
   * Canonical rather than an (ISO week, year) pair because ISO week 1 can
   * contain days from the previous December and some years have 53 weeks. A
   * Monday date has no New Year edge cases.
   *
   * @param {Date} date
   * @param {string} timeZone
   * @returns {string} `YYYY-MM-DD`
   */
  function weekStartKey(date, timeZone) {
    var p = partsInZone(date, timeZone);
    return shiftDayKey(pad4(p.year) + '-' + pad2(p.month) + '-' + pad2(p.day), -p.weekday);
  }

  /**
   * Move an ISO date string by a number of days.
   *
   * Operates on the date parts through UTC, so it never picks up an offset
   * from the machine's local timezone.
   *
   * @param {string} key `YYYY-MM-DD`
   * @param {number} days may be negative
   * @returns {string} `YYYY-MM-DD`
   */
  function shiftDayKey(key, days) {
    var parts = key.split('-');
    var utc = Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var moved = new Date(utc + days * DAY_MS);

    return (
      pad4(moved.getUTCFullYear()) + '-' + pad2(moved.getUTCMonth() + 1) + '-' + pad2(moved.getUTCDate())
    );
  }

  /**
   * Whole days between two ISO dates.
   *
   * @param {string} fromKey
   * @param {string} toKey
   * @returns {number} positive when `toKey` is later
   */
  function daysBetween(fromKey, toKey) {
    return Math.round((toUtc(toKey) - toUtc(fromKey)) / DAY_MS);
  }

  /**
   * Every ISO date from `fromKey` to `toKey`, inclusive.
   *
   * @param {string} fromKey
   * @param {string} toKey
   * @returns {string[]}
   */
  function dayRange(fromKey, toKey) {
    var out = [];
    var total = daysBetween(fromKey, toKey);

    for (var i = 0; i <= total; i += 1) out.push(shiftDayKey(fromKey, i));
    return out;
  }

  /**
   * 1-based day of the year. Index into `ActivityCalendar.DayMap` is this
   * minus one.
   *
   * @param {string} key `YYYY-MM-DD`
   * @returns {number} 1–366
   */
  function dayOfYear(key) {
    var year = Number(key.split('-')[0]);
    return daysBetween(pad4(year) + '-01-01', key) + 1;
  }

  /**
   * The ISO week number, for display only.
   *
   * ISO 8601: week 1 is the week containing the first Thursday of the year.
   *
   * @param {string} weekStart Monday, `YYYY-MM-DD`
   * @returns {number} 1–53
   */
  function isoWeekNumber(weekStart) {
    // The Thursday of this week decides which year the week belongs to.
    var thursday = shiftDayKey(weekStart, 3);
    var year = Number(thursday.split('-')[0]);
    var jan1 = pad4(year) + '-01-01';

    return Math.floor(daysBetween(jan1, thursday) / 7) + 1;
  }

  /** @param {string} key @returns {number} calendar year */
  function yearOf(key) {
    return Number(key.split('-')[0]);
  }

  /** @param {string} key @returns {number} calendar month, 1–12 */
  function monthOf(key) {
    return Number(key.split('-')[1]);
  }

  /**
   * Ordered week-start keys covering a range, oldest first.
   *
   * @param {string} fromWeekStart
   * @param {string} toWeekStart
   * @returns {string[]}
   */
  function weekRange(fromWeekStart, toWeekStart) {
    var out = [];
    var cursor = fromWeekStart;

    while (daysBetween(cursor, toWeekStart) >= 0) {
      out.push(cursor);
      cursor = shiftDayKey(cursor, 7);
    }

    return out;
  }

  /* ---- internals ---- */

  function toUtc(key) {
    var parts = key.split('-');
    return Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function pad4(value) {
    return String(value).padStart(4, '0');
  }

  return {
    partsInZone: partsInZone,
    dayKey: dayKey,
    weekStartKey: weekStartKey,
    shiftDayKey: shiftDayKey,
    daysBetween: daysBetween,
    dayRange: dayRange,
    dayOfYear: dayOfYear,
    isoWeekNumber: isoWeekNumber,
    yearOf: yearOf,
    monthOf: monthOf,
    weekRange: weekRange,
  };
})();

// Inert in Apps Script, which has no `module`; picked up by the Node harness.
if (typeof module !== 'undefined') module.exports = FtWeek;
