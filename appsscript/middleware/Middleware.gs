/**
 * Middleware — applied to every request, in a fixed order.
 *
 *   1. Validate     payload shape                    → VALIDATION_FAILED
 *   2. RateLimit    per account / per session        → RATE_LIMITED
 *   3. Authenticate token → session → member         → SESSION_EXPIRED
 *   4. PinGate      MustChangePin set?               → MUST_CHANGE_PIN
 *   5. Authorize    capability vs. a fresh role      → FORBIDDEN
 *
 * Rate limiting sits BEFORE authentication deliberately. Verifying a PIN means
 * running an iterated hash, which is slow by design. An attacker able to force
 * that work before being throttled has a denial-of-service vector.
 *
 * @see docs/security-architecture.md
 */

/* ==========================================================================
   Capabilities
   ========================================================================== */

/**
 * Roles are bundles of capabilities. Code asks "does this session hold
 * `member:delete`?", never "is this role SuperAdmin?".
 *
 * A fourth role is one entry here and zero changes elsewhere. Scattered role
 * comparisons are where privilege bugs live.
 */
var CAPABILITIES = (function () {
  // EVERY CAPABILITY HERE MUST BE REQUIRED BY AN ACTION.
  //
  // A grant nothing checks is not a permission, it is a comment that looks
  // like one — and the next person to read this matrix will believe it. The
  // suite enforces this: an unused capability fails verification.
  //
  // Removed in Phase 9:
  //   stats:read:self — every statistic a member can see arrives through
  //     `dashboard:self` or `profile:read:self`. There was never a separate
  //     stats endpoint for it to gate.
  //   member:create — member creation is invite-only by product decision, so
  //     the endpoint it would have gated was never built. This was K2/T2.
  var MEMBER = [
    'dashboard:self',
    'submission:create',
    'submission:read:self',
    'leaderboard:read',
    'pin:update:self',
    'profile:read:self',
    'profile:update:self',
  ];

  var MANAGER = MEMBER.concat([
    'admin:overview:read',
    'member:read:all',
    'member:update',
    'member:status:set',
    'member:pin:reset',
    'profile:read:all',
    'submission:read:all',
    'submission:void',
    'analytics:read',
    'invite:create',
    'invite:read',
    'invite:revoke',
    'settings:read',
  ]);

  var SUPER = MANAGER.concat([
    'member:delete',
    'member:role:set',
    'settings:update',
    'audit:read',
  ]);

  var map = {};
  map[ROLES.MEMBER] = MEMBER;
  map[ROLES.COMMUNITY_MANAGER] = MANAGER;
  map[ROLES.SUPER_ADMIN] = SUPER;

  return Object.freeze(map);
})();

/**
 * @param {string} role
 * @returns {string[]}
 */
function capabilitiesFor_(role) {
  return CAPABILITIES[role] || CAPABILITIES[ROLES.MEMBER];
}

/**
 * @param {string} role
 * @param {string} capability
 * @returns {boolean}
 */
function roleHas_(role, capability) {
  return capabilitiesFor_(role).indexOf(capability) !== -1;
}

/* ==========================================================================
   Validate
   ========================================================================== */

var Validate = (function () {
  /**
   * Require named string fields.
   *
   * @throws {AppError} VALIDATION_FAILED
   */
  function required(payload, fields) {
    for (var i = 0; i < fields.length; i += 1) {
      var value = payload[fields[i]];
      if (value === undefined || value === null || String(value).trim() === '') {
        throw fail_('VALIDATION_FAILED', 'That field is required.', { field: fields[i] });
      }
    }
  }

  /** Trim and cap a string, so an oversized payload cannot reach a sheet. */
  function str(value, maxLength) {
    return String(value === undefined || value === null ? '' : value)
      .trim()
      .slice(0, maxLength || 500);
  }

  function int(value, fallback) {
    var parsed = parseInt(value, 10);
    return isNaN(parsed) ? fallback : parsed;
  }

  function page(payload) {
    return {
      page: Math.max(1, int(payload.page, 1)),
      pageSize: Math.max(1, Math.min(int(payload.pageSize, DEFAULTS.PAGE_SIZE), 100)),
    };
  }

  return { required: required, str: str, int: int, page: page };
})();

/* ==========================================================================
   RateLimit
   ========================================================================== */

var RateLimit = (function () {
  /**
   * A sliding counter in CacheService.
   *
   * Apps Script does not expose the client IP, so limits are per account and
   * per session — never per attacker. Invite-gating is what closes that gap:
   * without a valid unused code, no account can be created however many
   * requests arrive.
   *
   * @throws {AppError} RATE_LIMITED
   */
  function check(bucket, key, limit, windowSeconds) {
    var cacheKey = 'rl:' + bucket + ':' + key;
    var current = Number(CacheClient.get(cacheKey) || 0);

    if (current >= limit) throw fail_('RATE_LIMITED');

    CacheClient.put(cacheKey, current + 1, windowSeconds);
  }

  return { check: check };
})();

/* ==========================================================================
   Authenticate · PinGate · Authorize
   ========================================================================== */

var Authenticate = (function () {
  /**
   * Resolve a token into a request context.
   *
   * The role comes from `Members`, re-read now — never from the session row
   * and never from the payload. A demotion therefore takes effect on that
   * member's very next request rather than whenever their session lapses.
   */
  function resolve(token) {
    var resolved = SessionService.resolve(token);
    var expiresAt = SessionService.touch(resolved.session);

    return {
      member: resolved.member,
      session: resolved.session,
      role: resolved.member.role,
      capabilities: capabilitiesFor_(resolved.member.role),
      sessionExpiresAt: expiresAt,
    };
  }

  return { resolve: resolve };
})();

var PinGate = (function () {
  /**
   * Block everything but the PIN change while `MustChangePin` is set.
   *
   * An admin who resets a PIN knows the temporary value. Without a
   * server-enforced gate, that admin could log in as the member — a
   * client-side redirect would be trivially bypassed.
   *
   * @throws {AppError} MUST_CHANGE_PIN
   */
  function check(context, action) {
    if (!context.member.mustChangePin) return;
    if (action === 'auth.changePin' || action === 'auth.logout' || action === 'auth.session') return;

    throw fail_('MUST_CHANGE_PIN');
  }

  return { check: check };
})();

var Authorize = (function () {
  /** @throws {AppError} FORBIDDEN */
  function check(context, capability) {
    if (capability === 'authenticated') return;

    if (!roleHas_(context.role, capability)) {
      AuditService.record(context, 'FORBIDDEN', {
        details: { capability: capability },
        result: 'DENIED',
      });
      throw fail_('FORBIDDEN');
    }
  }

  /**
   * Super-Admin-only guard for actions where the capability alone is not the
   * whole rule.
   */
  function requireSuperAdmin(context) {
    if (context.role !== ROLES.SUPER_ADMIN) throw fail_('FORBIDDEN');
  }

  return { check: check, requireSuperAdmin: requireSuperAdmin };
})();
