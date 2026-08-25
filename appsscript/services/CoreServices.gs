/**
 * Core services: settings, audit, notifications, auth, sessions, identity.
 *
 * Services own business rules. They call repositories; they never touch a
 * sheet, and they never build a response envelope.
 *
 * @see docs/backend-architecture.md §5
 */

/* ==========================================================================
   SettingsService — typed, cached, defaulted config
   ========================================================================== */

var SettingsService = (function () {
  function num(key, fallback) {
    var value = SettingsRepo.get(key, fallback);
    var parsed = Number(value);
    return isNaN(parsed) ? fallback : parsed;
  }

  function bool(key, fallback) {
    var value = SettingsRepo.get(key, fallback);
    return typeof value === 'boolean' ? value : toBool_(value);
  }

  function text(key, fallback) {
    return String(SettingsRepo.get(key, fallback));
  }

  return {
    num: num,
    bool: bool,
    text: text,
    list: SettingsRepo.list,
    set: SettingsRepo.set,

    pinLength: function () { return num('auth.pinLength', DEFAULTS.PIN_LENGTH); },
    hashIterations: function () { return num('auth.hashIterations', DEFAULTS.HASH_ITERATIONS); },
    maxFailedAttempts: function () { return num('auth.maxFailedAttempts', DEFAULTS.MAX_FAILED_ATTEMPTS); },
    sessionAbsoluteDays: function () { return num('session.absoluteDays', DEFAULTS.SESSION_ABSOLUTE_DAYS); },
    sessionIdleDays: function () { return num('session.idleDays', DEFAULTS.SESSION_IDLE_DAYS); },
    duplicateWindowDays: function () { return num('submission.duplicateWindowDays', DEFAULTS.DUPLICATE_WINDOW_DAYS); },
    dailyCap: function () { return num('submission.dailyCap', DEFAULTS.DAILY_SUBMISSION_CAP); },
    inviteExpiryDays: function () { return num('invite.expiryDays', DEFAULTS.INVITE_EXPIRY_DAYS); },
    inviteCodeLength: function () { return num('invite.codeLength', DEFAULTS.INVITE_CODE_LENGTH); },
    calendarWeeks: function () { return num('calendar.defaultWeeks', DEFAULTS.CALENDAR_WEEKS); },
    foundingPeriodEnd: function () { return text('milestones.foundingPeriodEnd', '2026-08-01'); },
    defaultWeeklyGoal: function () { return num('member.defaultWeeklyGoal', DEFAULTS.WEEKLY_GOAL); },
  };
})();

/* ==========================================================================
   AuditService
   ========================================================================== */

var AuditService = (function () {
  /**
   * @param {Object} actor  { memberId, role } or null for anonymous
   * @param {string} action
   * @param {Object} [options] { targetId, details, result }
   */
  function record(actor, action, options) {
    var opts = options || {};

    AuditRepo.append({
      actorId: actor ? actor.memberId : '',
      actorRole: actor ? actor.role : 'Anonymous',
      action: action,
      targetId: opts.targetId || '',
      details: opts.details || null,
      result: opts.result || 'SUCCESS',
    });
  }

  return { record: record, list: AuditRepo.list };
})();

/* ==========================================================================
   NotificationService — writes the outbox; nothing delivers in v1
   ========================================================================== */

var NotificationService = (function () {
  /**
   * Enqueue an event.
   *
   * Rows accumulate now so that when email or WhatsApp delivery is added, the
   * history already exists and no celebration is lost in the gap.
   */
  function enqueue(memberId, type, payload) {
    NotificationRepo.append(memberId, type, payload);
  }

  return { enqueue: enqueue };
})();

/* ==========================================================================
   AuthService — PIN hashing, verification, policy
   ========================================================================== */

var AuthService = (function () {
  /**
   * @param {string} pin
   * @returns {{hash: string, salt: string}}
   */
  function hashNewPin(pin) {
    var salt = Crypto.randomHex(16);
    return {
      salt: salt,
      hash: Crypto.hashPin(pin, salt, SettingsService.hashIterations()),
    };
  }

  /**
   * Constant-time PIN check.
   *
   * A short-circuiting comparison leaks how many leading characters matched,
   * which over enough attempts narrows a 6-digit space considerably.
   */
  function verifyPin(pin, member) {
    if (!member || !member.pinHash || !member.pinSalt) return false;
    var computed = Crypto.hashPin(pin, member.pinSalt, SettingsService.hashIterations());
    return Crypto.timingSafeEqual(computed, member.pinHash);
  }

  /** @throws {AppError} when the PIN fails policy */
  function assertPinValid(pin, field) {
    var result = FtIdentity.validatePin(pin, SettingsService.pinLength());
    if (!result.valid) throw fail_(result.code, result.message, { field: field || 'pin' });
  }

  /** @throws {AppError} when the username fails policy */
  function assertUsernameValid(username) {
    var result = FtIdentity.validateUsername(username);
    if (!result.valid) throw fail_(result.code, result.message, { field: 'username' });
  }

  /**
   * Exponential backoff after failed logins.
   *
   * Replaces a flat lockout, which was a denial-of-service vector: usernames
   * are visible on the leaderboard, so anyone could lock any member out for a
   * fixed period, repeatedly. A delay between attempts slows an attacker to
   * nothing while never making an account fully unusable — the legitimate
   * member who mistyped waits half a minute.
   *
   * @param {Object} member
   * @throws {AppError} ACCOUNT_LOCKED when the delay has not elapsed
   */
  function assertNotThrottled(member) {
    if (!member.nextAttemptAt) return;

    var readyAt = Date.parse(member.nextAttemptAt);
    if (isNaN(readyAt) || readyAt <= Date.now()) return;

    var seconds = Math.ceil((readyAt - Date.now()) / 1000);
    throw fail_(
      'ACCOUNT_LOCKED',
      seconds > 90
        ? 'Too many tries. Try again in ' + Math.ceil(seconds / 60) + ' minutes.'
        : 'Too many tries. Try again in ' + seconds + ' seconds.',
    );
  }

  /** Record a failure and schedule the next permitted attempt. */
  function recordFailure(member) {
    var failures = member.failedLoginCount + 1;
    var delay = FtIdentity.backoffMs(failures);

    MemberRepo.update(member.rowIndex, {
      failedLoginCount: failures,
      nextAttemptAt: delay > 0 ? new Date(Date.now() + delay).toISOString() : '',
    });

    return failures;
  }

  function clearFailures(member) {
    if (member.failedLoginCount === 0 && !member.nextAttemptAt) return;
    MemberRepo.update(member.rowIndex, { failedLoginCount: 0, nextAttemptAt: '' });
  }

  return {
    hashNewPin: hashNewPin,
    verifyPin: verifyPin,
    assertPinValid: assertPinValid,
    assertUsernameValid: assertUsernameValid,
    assertNotThrottled: assertNotThrottled,
    recordFailure: recordFailure,
    clearFailures: clearFailures,
  };
})();

/* ==========================================================================
   SessionService
   ========================================================================== */

var SessionService = (function () {
  /**
   * Issue a session. The raw token is returned once and never stored.
   *
   * @returns {{token: string, expiresAt: string}}
   */
  function create(member, userAgent) {
    var token = Crypto.sessionToken();
    var now = new Date();
    var expiresAt = new Date(now.getTime() + SettingsService.sessionAbsoluteDays() * 86400000);

    SessionRepo.insert({
      sessionId: Crypto.sha256(token),
      memberId: member.memberId,
      role: member.role,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      lastSeenAt: now.toISOString(),
      userAgent: String(userAgent || '').slice(0, 120),
    });

    return { token: token, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Resolve a token to a live member.
   *
   * The role is re-read from Members rather than taken from the session row,
   * so a demotion takes effect on that person's very next request.
   *
   * @throws {AppError} SESSION_EXPIRED
   */
  function resolve(token) {
    if (!token) throw fail_('SESSION_EXPIRED');

    var hash = Crypto.sha256(token);
    var session = SessionRepo.findByHash(hash);

    if (!session) throw fail_('SESSION_EXPIRED');
    if (session.revokedAt) throw fail_('SESSION_EXPIRED');

    var now = Date.now();
    if (session.expiresAt && Date.parse(session.expiresAt) <= now) throw fail_('SESSION_EXPIRED');

    var idleMs = SettingsService.sessionIdleDays() * 86400000;
    if (session.lastSeenAt && now - Date.parse(session.lastSeenAt) > idleMs) {
      SessionRepo.revoke(session.rowIndex);
      throw fail_('SESSION_EXPIRED');
    }

    var member = MemberRepo.findById(session.memberId);
    if (!member) throw fail_('SESSION_EXPIRED');
    if (member.status !== MEMBER_STATUS.ACTIVE) throw fail_('SESSION_EXPIRED');

    return { session: session, member: member };
  }

  /**
   * Slide the expiry forward.
   *
   * Throttled to once every few minutes: writing LastSeenAt on every request
   * means a sheet write on every request, which is the single cheapest thing
   * to remove from the hot path.
   */
  function touch(session) {
    var now = Date.now();
    var lastSeen = Date.parse(session.lastSeenAt);
    var throttleMs = DEFAULTS.SESSION_TOUCH_MINUTES * 60000;

    if (!isNaN(lastSeen) && now - lastSeen < throttleMs) return session.expiresAt;

    var expiresAt = new Date(now + SettingsService.sessionAbsoluteDays() * 86400000).toISOString();
    SessionRepo.touch(session.rowIndex, new Date(now).toISOString(), expiresAt);
    return expiresAt;
  }

  function revoke(session) {
    SessionRepo.revoke(session.rowIndex);
  }

  function revokeAll(memberId) {
    SessionRepo.revokeAllForMember(memberId);
  }

  return {
    create: create,
    resolve: resolve,
    touch: touch,
    revoke: revoke,
    revokeAll: revokeAll,
  };
})();

/* ==========================================================================
   InviteService
   ========================================================================== */

var InviteService = (function () {
  /**
   * Validate a code without redeeming it.
   *
   * @throws {AppError} INVITE_INVALID | INVITE_USED | INVITE_EXPIRED
   * @returns {Object} the invite row
   */
  function assertRedeemable(code) {
    var invite = InviteRepo.findByCode(code);

    if (!invite) throw fail_('INVITE_INVALID', undefined, { field: 'inviteCode' });

    if (invite.status === INVITE_STATUS.USED) {
      throw fail_('INVITE_USED', undefined, { field: 'inviteCode' });
    }
    if (invite.status === INVITE_STATUS.REVOKED || invite.status === INVITE_STATUS.EXPIRED) {
      throw fail_('INVITE_INVALID', undefined, { field: 'inviteCode' });
    }

    if (invite.expiresAt && Date.parse(invite.expiresAt) < Date.now()) {
      InviteRepo.markStatus(invite.rowIndex, INVITE_STATUS.EXPIRED);
      throw fail_('INVITE_EXPIRED', undefined, { field: 'inviteCode' });
    }

    return invite;
  }

  /**
   * Generate codes.
   *
   * Bulk by default: generating thirty codes one at a time for a cohort
   * intake is tedious enough that it would not get used.
   */
  function generate(count, options, actor) {
    var opts = options || {};
    var howMany = Math.max(1, Math.min(Number(count) || 1, 100));
    var days = Number(opts.expiresInDays) || SettingsService.inviteExpiryDays();
    var length = SettingsService.inviteCodeLength();

    var existing = {};
    InviteRepo.all().forEach(function (invite) { existing[invite.code] = true; });

    var created = [];
    var createdAt = nowIso_();
    var expiresAt = new Date(Date.now() + days * 86400000).toISOString();

    for (var i = 0; i < howMany; i += 1) {
      var code = Ids.inviteCode(length);
      var guard = 0;

      // Collisions are vanishingly unlikely at 31^8, but a duplicate code
      // would be a genuine integrity failure, so it is checked rather than
      // assumed away.
      while (existing[code] && guard < 50) {
        code = Ids.inviteCode(length);
        guard += 1;
      }

      existing[code] = true;
      created.push({
        code: code,
        createdBy: actor.memberId,
        createdAt: createdAt,
        expiresAt: expiresAt,
        note: opts.note || '',
      });
    }

    InviteRepo.insertMany(created);
    AuditService.record(actor, 'INVITE_CREATE', { details: { count: created.length } });

    return created;
  }

  function list(filters) {
    var opts = filters || {};

    return InviteRepo.all()
      .filter(function (invite) {
        if (opts.status && invite.status !== opts.status) return false;
        return true;
      })
      .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); })
      .map(function (invite) {
        var redeemer = invite.usedBy ? MemberRepo.findById(invite.usedBy) : null;
        return {
          code: invite.code,
          status: invite.status,
          createdAt: invite.createdAt,
          expiresAt: invite.expiresAt,
          usedAt: invite.usedAt,
          usedBy: redeemer ? redeemer.fullName : '',
          note: invite.note,
        };
      });
  }

  function revoke(code, actor) {
    var invite = InviteRepo.findByCode(code);
    if (!invite) throw fail_('NOT_FOUND');

    if (invite.status !== INVITE_STATUS.UNUSED) {
      throw fail_('VALIDATION_FAILED', 'Only unused codes can be revoked.');
    }

    InviteRepo.markStatus(invite.rowIndex, INVITE_STATUS.REVOKED);
    AuditService.record(actor, 'INVITE_REVOKE', { details: { code: invite.code } });
  }

  /** Nightly housekeeping. Redemption also checks expiry, so this is cosmetic. */
  function expireStale() {
    var now = Date.now();
    var count = 0;

    InviteRepo.all().forEach(function (invite) {
      if (invite.status !== INVITE_STATUS.UNUSED) return;
      if (!invite.expiresAt || Date.parse(invite.expiresAt) >= now) return;
      InviteRepo.markStatus(invite.rowIndex, INVITE_STATUS.EXPIRED);
      count += 1;
    });

    return count;
  }

  return {
    assertRedeemable: assertRedeemable,
    generate: generate,
    list: list,
    revoke: revoke,
    expireStale: expireStale,
  };
})();

/* ==========================================================================
   MemberService — reads, self-service updates, counters
   ========================================================================== */

var MemberService = (function () {
  /** The public shape of a member. Never carries a hash or a salt. */
  function toPublic(member) {
    return {
      memberId: member.memberId,
      username: member.username,
      fullName: member.fullName,
      platform: member.platform,
      weeklyGoal: member.weeklyGoal,
      joinDate: member.joinDate,
      role: member.role,
      status: member.status,
      consentFeature: member.consentFeature,
      profileComplete: member.profileComplete,
      flowLevelId: member.flowLevelId,
      allTimePosts: member.allTimePosts,
      currentWeekStreak: member.currentWeekStreak,
      longestWeekStreak: member.longestWeekStreak,
      perfectWeeks: member.perfectWeeks,
    };
  }

  function requireById(memberId) {
    var member = MemberRepo.findById(memberId);
    if (!member) throw fail_('NOT_FOUND');
    return member;
  }

  function updateFullName(member, fullName) {
    var name = String(fullName || '').trim();

    if (name.length < 2 || name.length > 60) {
      throw fail_('VALIDATION_FAILED', 'Names are between 2 and 60 characters.', { field: 'fullName' });
    }

    MemberRepo.update(member.rowIndex, { fullName: name });
    CacheClient.invalidateMember(member.memberId);
    return toPublic(Object.assign({}, member, { fullName: name }));
  }

  function updateConsent(member, consent) {
    MemberRepo.update(member.rowIndex, { consentFeature: Boolean(consent) });
    CacheClient.invalidateMember(member.memberId);
    return { consentFeature: Boolean(consent) };
  }

  /**
   * Change one's own PIN.
   *
   * Revokes every other session: a PIN change is often a response to
   * suspecting compromise, and leaving other sessions live would defeat it.
   */
  function changePin(member, currentPin, newPin, confirmPin) {
    if (!AuthService.verifyPin(currentPin, member)) {
      throw fail_('AUTH_FAILED', 'That current PIN is not right.', { field: 'currentPin' });
    }

    AuthService.assertPinValid(newPin, 'newPin');
    if (newPin !== confirmPin) throw fail_('PIN_MISMATCH', undefined, { field: 'newPinConfirm' });

    var credentials = AuthService.hashNewPin(newPin);

    MemberRepo.update(member.rowIndex, {
      pinHash: credentials.hash,
      pinSalt: credentials.salt,
      mustChangePin: false,
    });

    SessionService.revokeAll(member.memberId);
    AuditService.record(member, 'PIN_CHANGE');
  }

  /**
   * Apply the counters produced by a submission.
   *
   * One batched write rather than five, because each separate write is a
   * round trip on the path a member is actively waiting on.
   */
  function applySubmissionCounters(member, patch) {
    MemberRepo.update(member.rowIndex, patch);
  }

  return {
    toPublic: toPublic,
    requireById: requireById,
    updateFullName: updateFullName,
    updateConsent: updateConsent,
    changePin: changePin,
    applySubmissionCounters: applySubmissionCounters,
  };
})();

/* ==========================================================================
   ProfileService — Stage 2, optional
   ========================================================================== */

var ProfileService = (function () {
  function get(memberId) {
    var profile = ProfileRepo.findByMemberId(memberId);

    return profile
      ? { whatsapp: profile.whatsapp, email: profile.email, bio: profile.bio, updatedAt: profile.updatedAt }
      : { whatsapp: '', email: '', bio: '', updatedAt: '' };
  }

  /**
   * Patch a profile. Every field is optional and independently savable —
   * partial completion is a normal state, not a validation failure.
   */
  function update(member, patch) {
    var clean = {};

    if (patch.whatsapp !== undefined) {
      var phone = String(patch.whatsapp).trim();
      if (phone) {
        var digits = phone.replace(/[^\d]/g, '');
        if (digits.length < 7 || digits.length > 15) {
          throw fail_('VALIDATION_FAILED', 'That number does not look right.', { field: 'whatsapp' });
        }
      }
      clean.whatsapp = phone;
    }

    if (patch.email !== undefined) {
      var email = String(patch.email).trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        throw fail_('VALIDATION_FAILED', 'That does not look like an email address.', { field: 'email' });
      }
      clean.email = email;
    }

    if (patch.bio !== undefined) {
      var bio = String(patch.bio).trim();
      if (bio.length > 160) {
        throw fail_('VALIDATION_FAILED', 'Keep it under 160 characters.', { field: 'bio' });
      }
      clean.bio = bio;
    }

    ProfileRepo.upsert(member.memberId, clean);

    if (!member.profileComplete) {
      MemberRepo.update(member.rowIndex, { profileComplete: true });
      CacheClient.invalidateMember(member.memberId);
    }

    return get(member.memberId);
  }

  return { get: get, update: update };
})();
