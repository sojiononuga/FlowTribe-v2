/**
 * Client-side field validation.
 *
 * FEEDBACK ONLY, NEVER AUTHORITATIVE.
 *
 * Everything here also runs on the server, and the server's answer is the one
 * that counts. These exist so a member learns their PIN is five digits while
 * typing, rather than after a round trip on a slow connection.
 *
 * Two rules keep the duplication honest:
 *
 *   1. Anything that decides whether a post counts — link-to-platform matching,
 *      duplicate detection, streak arithmetic — is NOT here. It is server-only,
 *      because it judges the member and must not be editable by them.
 *   2. What is here is format checking: length, shape, characters. If the
 *      client and server ever disagree, the server wins and the member sees
 *      the server's message.
 *
 * @module lib/validators
 */

import { config } from '../core/config.js';

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid
 * @property {string|null} message  Member-facing, in brand voice
 */

const OK = Object.freeze({ valid: true, message: null });

function fail(message) {
  return { valid: false, message };
}

/* -------------------------------------------------------------------------
 * Full name
 * ---------------------------------------------------------------------- */

/**
 * Validate a display name.
 *
 * Deliberately permissive. Names carry apostrophes, hyphens, accents, and
 * more than two words, and a validator that rejects a real person's real name
 * is worse than one that accepts an odd string. Uniqueness is not required —
 * two Davids are expected.
 *
 * @param {string} value
 * @returns {ValidationResult}
 */
export function validateFullName(value) {
  const trimmed = String(value || '').trim();

  if (!trimmed) return fail('Enter your full name.');
  if (trimmed.length < 2) return fail('That looks a little short.');
  if (trimmed.length > 60) return fail('Please keep your name under 60 characters.');

  return OK;
}

/* -------------------------------------------------------------------------
 * Username
 * ---------------------------------------------------------------------- */

/**
 * Names that would let a member impersonate the community or the team.
 *
 * Mirrors the server list. A member registering as `flowtribe` could pass for
 * the official account in a leaderboard screenshot, which is why this is a
 * rule rather than a nicety.
 */
const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'superadmin',
  'moderator',
  'flowtribe',
  'flow_tribe',
  'flow.tribe',
  'support',
  'help',
  'api',
  'system',
  'team',
  'staff',
  'official',
  'iyanu',
  'me',
  'null',
  'undefined',
]);

/**
 * Lowercase letters, digits, underscores, and single interior dots.
 * Must start with a letter and must not end with a dot.
 */
const USERNAME_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*$/;

/**
 * Validate a username.
 *
 * @param {string} value
 * @returns {ValidationResult}
 */
export function validateUsername(value) {
  const normalised = normaliseUsername(value);
  const { usernameMinLength: min, usernameMaxLength: max } = config.rules;

  if (!normalised) return fail('Pick a username.');
  if (normalised.length < min) return fail(`Usernames need at least ${min} characters.`);
  if (normalised.length > max) return fail(`Usernames can be up to ${max} characters.`);

  if (!/^[a-z]/.test(normalised)) return fail('Usernames start with a letter.');
  if (normalised.endsWith('.')) return fail("Usernames can't end with a dot.");
  if (normalised.includes('..')) return fail('Use single dots only.');

  if (!USERNAME_PATTERN.test(normalised)) {
    return fail('Use letters, numbers, dots and underscores only.');
  }

  if (RESERVED_USERNAMES.has(normalised)) {
    return fail('That username is reserved. Try another.');
  }

  return OK;
}

/**
 * Normalise a username to its lookup key.
 *
 * Matches the server's `UsernameKey`. Applied before comparison so `David` and
 * `david` are understood to be the same person.
 *
 * @param {string} value
 * @returns {string}
 */
export function normaliseUsername(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Suggest a username from a full name.
 *
 * Convenience during registration only — the member can always overwrite it,
 * and the server still enforces uniqueness. "David Okafor" → "david.okafor".
 *
 * @param {string} fullName
 * @returns {string}
 */
export function suggestUsername(fullName) {
  const cleaned = String(fullName || '')
    .toLowerCase()
    // Strip accents so "Adébáyò" yields a valid ASCII username.
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();

  if (!cleaned) return '';

  const words = cleaned.split(/\s+/).filter(Boolean);
  const candidate = words.length === 1 ? words[0] : `${words[0]}.${words[words.length - 1]}`;

  return candidate.slice(0, config.rules.usernameMaxLength);
}

/* -------------------------------------------------------------------------
 * PIN
 * ---------------------------------------------------------------------- */

/**
 * The most-guessed 6-digit PINs. Blocking these removes the cheapest attack
 * without asking members to remember anything harder.
 */
const COMMON_PINS = new Set([
  '123456', '654321', '111111', '000000', '121212', '123123',
  '112233', '696969', '159753', '666666', '999999', '888888',
  '777777', '101010', '202020', '123321', '456789', '789456',
]);

/**
 * Validate a PIN.
 *
 * Six digits, per product decision. Rejects repeats, straight sequences, and
 * the common list — a PIN of 111111 makes the length pointless.
 *
 * @param {string} value
 * @returns {ValidationResult}
 */
export function validatePin(value) {
  const pin = String(value || '');
  const { pinLength } = config.rules;

  if (!pin) return fail('Choose a PIN.');
  if (!/^\d+$/.test(pin)) return fail('Your PIN is numbers only.');
  if (pin.length !== pinLength) return fail(`Your PIN needs to be ${pinLength} digits.`);

  if (COMMON_PINS.has(pin)) return fail("That PIN is too easy to guess. Try another.");
  if (isAllSameDigit(pin)) return fail('Pick a PIN that isn’t the same digit repeated.');
  if (isSequential(pin)) return fail('Pick a PIN that isn’t a sequence.');

  return OK;
}

/**
 * Confirm a PIN matches.
 *
 * @param {string} pin
 * @param {string} confirmation
 * @returns {ValidationResult}
 */
export function validatePinConfirmation(pin, confirmation) {
  if (!confirmation) return fail('Type your PIN again to confirm.');
  if (pin !== confirmation) return fail("Those PINs don't match.");
  return OK;
}

/* -------------------------------------------------------------------------
 * Invite code
 * ---------------------------------------------------------------------- */

/**
 * The code alphabet, excluding characters that are ambiguous on a phone
 * screen: 0/O, 1/I/l. Codes are read off a WhatsApp message and typed by
 * hand, so legibility matters more than a slightly larger keyspace.
 */
const INVITE_ALPHABET = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/;

/**
 * Validate an invite code's shape.
 *
 * Whether the code exists, is unused, and has not expired is a server
 * question — this only catches a typo before the request is sent.
 *
 * @param {string} value
 * @param {number} [expectedLength=8]
 * @returns {ValidationResult}
 */
export function validateInviteCode(value, expectedLength = 8) {
  const code = normaliseInviteCode(value);

  if (!code) return fail('Enter your invite code.');
  if (code.length !== expectedLength) {
    return fail(`Invite codes are ${expectedLength} characters.`);
  }
  if (!INVITE_ALPHABET.test(code)) {
    return fail("That doesn't look like a valid code. Check it and try again.");
  }

  return OK;
}

/**
 * Normalise an invite code for comparison: uppercase, no spaces or dashes.
 *
 * People paste codes with the formatting they were sent in. Accepting
 * "abcd-2345" for "ABCD2345" avoids a support message.
 *
 * @param {string} value
 * @returns {string}
 */
export function normaliseInviteCode(value) {
  return String(value || '').toUpperCase().replace(/[\s-]/g, '');
}

/* -------------------------------------------------------------------------
 * Optional profile fields (Stage 2)
 * ---------------------------------------------------------------------- */

/**
 * Validate an email address.
 *
 * A shape check, not a deliverability check. Elaborate email regexes reject
 * valid addresses more often than they catch invalid ones; the only real
 * verification is sending a message, which v2 does not do.
 *
 * @param {string} value
 * @param {boolean} [required=false]
 * @returns {ValidationResult}
 */
export function validateEmail(value, required = false) {
  const trimmed = String(value || '').trim();

  if (!trimmed) return required ? fail('Enter your email address.') : OK;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
    return fail("That doesn't look like an email address.");
  }
  if (trimmed.length > 254) return fail('That address is too long.');

  return OK;
}

/**
 * Validate a WhatsApp number.
 *
 * Accepts what people actually type — spaces, dashes, brackets, a leading +
 * or 0 — and checks only the digit count. Nigerian numbers are commonly
 * written as 0803… locally and +234803… internationally, and rejecting either
 * form would be its own support burden.
 *
 * @param {string} value
 * @param {boolean} [required=false]
 * @returns {ValidationResult}
 */
export function validateWhatsApp(value, required = false) {
  const trimmed = String(value || '').trim();

  if (!trimmed) return required ? fail('Enter your WhatsApp number.') : OK;

  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length < 7) return fail('That number looks too short.');
  if (digits.length > 15) return fail('That number looks too long.');
  if (!/^[+\d][\d\s\-().]*$/.test(trimmed)) return fail('Use numbers only, with an optional +.');

  return OK;
}

/**
 * Validate a bio.
 *
 * @param {string} value
 * @returns {ValidationResult}
 */
export function validateBio(value) {
  const trimmed = String(value || '').trim();
  const max = config.rules.bioMaxLength;

  if (!trimmed) return OK; // optional
  if (trimmed.length > max) return fail(`Keep it under ${max} characters.`);

  return OK;
}

/* -------------------------------------------------------------------------
 * Shared
 * ---------------------------------------------------------------------- */

/**
 * Run several validations and collect the failures.
 *
 * Forms show every problem at once rather than revealing them one at a time,
 * which is the difference between one correction pass and four.
 *
 * @param {Object<string, ValidationResult>} results  Keyed by field name.
 * @returns {{ valid: boolean, errors: Object<string,string>, firstField: string|null }}
 */
export function collect(results) {
  const errors = {};

  for (const [field, result] of Object.entries(results)) {
    if (result && !result.valid) errors[field] = result.message;
  }

  const fields = Object.keys(errors);

  return {
    valid: fields.length === 0,
    errors,
    firstField: fields[0] || null,
  };
}

function isAllSameDigit(pin) {
  return new Set(pin.split('')).size === 1;
}

function isSequential(pin) {
  let ascending = true;
  let descending = true;

  for (let i = 1; i < pin.length; i += 1) {
    const delta = Number(pin[i]) - Number(pin[i - 1]);
    if (delta !== 1) ascending = false;
    if (delta !== -1) descending = false;
  }

  return ascending || descending;
}
