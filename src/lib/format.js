/**
 * Display formatting.
 *
 * Pure functions, no DOM. Every number and date the member sees passes through
 * here, so "3 posts" versus "3 Posts" is decided once.
 *
 * Dates are formatted in the community's timezone, not the browser's. A member
 * travelling does not get a different idea of which week it is than the server
 * has — and the week boundary is what a streak depends on.
 *
 * @module lib/format
 */

import { config } from '../core/config.js';

const TZ = config.app.timezone;

/**
 * Pluralise a countable noun.
 *
 * @param {number} count
 * @param {string} singular
 * @param {string} [plural]  Defaults to singular + 's'.
 * @returns {string} e.g. "1 post", "3 posts"
 */
export function plural(count, singular, plural) {
  const word = count === 1 ? singular : plural || `${singular}s`;
  return `${count} ${word}`;
}

/**
 * Format an integer with thousands separators.
 *
 * @param {number} value
 * @returns {string}
 */
export function number(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-NG').format(value);
}

/**
 * Format a percentage.
 *
 * @param {number} value      0–1, or 0–100 when `alreadyScaled`
 * @param {Object} [options]
 * @param {number} [options.decimals=0]
 * @param {boolean} [options.alreadyScaled=false]
 * @returns {string}
 */
export function percent(value, options = {}) {
  const { decimals = 0, alreadyScaled = false } = options;
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const scaled = alreadyScaled ? value : value * 100;
  return `${scaled.toFixed(decimals)}%`;
}

/**
 * Format a rank for display.
 *
 * Returns an em dash for an unranked member. By product decision, a member
 * with no posts this week has no rank at all — the dashboard shows the
 * "Post this week to join the leaderboard" prompt instead of a position.
 *
 * @param {number|null} rank
 * @returns {string} e.g. "#4"
 */
export function rank(rank) {
  if (!rank || rank < 1) return '—';
  return `#${rank}`;
}

/**
 * Format a date as a readable day.
 *
 * @param {Date|string|number} value
 * @param {Object} [options]
 * @param {boolean} [options.withYear=false]
 * @returns {string} e.g. "12 Jun"
 */
export function date(value, options = {}) {
  const parsed = toDate(value);
  if (!parsed) return '—';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: options.withYear ? 'numeric' : undefined,
    timeZone: TZ,
  }).format(parsed);
}

/**
 * Format a date and time.
 *
 * @param {Date|string|number} value
 * @returns {string} e.g. "12 Jun, 14:32"
 */
export function dateTime(value) {
  const parsed = toDate(value);
  if (!parsed) return '—';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TZ,
  }).format(parsed);
}

/**
 * Format a week from its Monday.
 *
 * @param {Date|string} weekStart
 * @returns {string} e.g. "9–15 Jun"
 */
export function weekRange(weekStart) {
  const start = toDate(weekStart);
  if (!start) return '—';

  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const startDay = new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: TZ }).format(start);
  const endLabel = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: TZ,
  }).format(end);

  return `${startDay}–${endLabel}`;
}

/**
 * A relative description of when something happened.
 *
 * Falls back to an absolute date beyond a week: "23 days ago" is harder to
 * read than "4 Jun".
 *
 * @param {Date|string|number} value
 * @returns {string}
 */
export function relative(value) {
  const parsed = toDate(value);
  if (!parsed) return '—';

  const seconds = Math.floor((Date.now() - parsed.getTime()) / 1000);

  if (seconds < 45) return 'just now';
  if (seconds < 90) return 'a minute ago';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;

  return date(parsed);
}

/**
 * Initials for the avatar.
 *
 * Takes the first and last word, so "Iyanuoluwa Grace Ilesanmi" gives "II"
 * rather than "IG".
 *
 * @param {string} fullName
 * @returns {string} one or two uppercase letters
 */
export function initials(fullName) {
  if (!fullName) return '?';

  const words = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * Shorten a URL for display in a table.
 *
 * Members submit long links with tracking parameters attached; the full string
 * would dominate any row it sits in.
 *
 * @param {string} url
 * @param {number} [maxLength=42]
 * @returns {string}
 */
export function shortUrl(url, maxLength = 42) {
  if (!url) return '';

  let display = String(url).replace(/^https?:\/\//, '').replace(/^www\./, '');
  if (display.length <= maxLength) return display;

  // Keep the host and the tail: the middle of a URL is the least informative
  // part, and the ending often identifies the post.
  const slashIndex = display.indexOf('/');
  const host = slashIndex === -1 ? display : display.slice(0, slashIndex);
  const remaining = maxLength - host.length - 3;

  if (remaining <= 4) return `${display.slice(0, maxLength - 1)}…`;
  return `${host}…${display.slice(-remaining)}`;
}

/**
 * Truncate text, breaking on a word boundary where possible.
 *
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 */
export function truncate(text, maxLength) {
  if (!text || text.length <= maxLength) return text || '';

  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');

  return `${lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}

/**
 * The message under the progress ring.
 *
 * Copy is fixed by product decision: a member who has met their goal is told
 * so; otherwise they are told exactly how many posts remain. It never scolds
 * and never guilts — the point is to make the next post feel small.
 *
 * @param {number} posted
 * @param {number} goal
 * @returns {string}
 */
export function weeklyProgressMessage(posted, goal) {
  const remaining = Math.max(goal - posted, 0);

  if (remaining === 0) return 'Weekly goal achieved.';
  if (remaining === 1) return 'You have one post left this week.';
  return `You have ${remaining} posts left this week.`;
}

/* -------------------------------------------------------------------------
 * Internals
 * ---------------------------------------------------------------------- */

/**
 * Parse loosely into a Date, returning null rather than an Invalid Date —
 * which formats as "Invalid Date" on screen if it slips through.
 *
 * @param {Date|string|number} value
 * @returns {Date|null}
 */
function toDate(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
