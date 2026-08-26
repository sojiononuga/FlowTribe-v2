/**
 * The repository layer.
 *
 * The ONLY code that touches a spreadsheet. Every repository maps rows to
 * domain objects and back; none of them leaks a row index or a column letter
 * upward, and none of them calls a service.
 *
 * This is the store-swap seam: if Sheets is ever outgrown, this file is
 * rewritten and services, orchestrators, controllers, and routing are
 * untouched. That is what makes committing to Sheets a reversible decision.
 *
 * Row indexes are 1-based and include the header, so a repository's internal
 * `rowIndex` is `arrayIndex + 2`.
 */

/* ==========================================================================
   MemberRepo
   ========================================================================== */

var MemberRepo = (function () {
  function toDomain(row, rowIndex) {
    if (!row || !row[M.MEMBER_ID]) return null;

    return {
      rowIndex: rowIndex,
      memberId: String(row[M.MEMBER_ID]),
      username: String(row[M.USERNAME] || ''),
      usernameKey: String(row[M.USERNAME_KEY] || ''),
      fullName: String(row[M.FULL_NAME] || ''),
      pinHash: String(row[M.PIN_HASH] || ''),
      pinSalt: String(row[M.PIN_SALT] || ''),
      platform: String(row[M.PLATFORM] || ''),
      weeklyGoal: Number(row[M.WEEKLY_GOAL]) || DEFAULTS.WEEKLY_GOAL,
      joinDate: toIso_(row[M.JOIN_DATE]),
      status: String(row[M.STATUS] || MEMBER_STATUS.ACTIVE),
      role: String(row[M.ROLE] || ROLES.MEMBER),
      consentFeature: toBool_(row[M.CONSENT_FEATURE]),
      mustChangePin: toBool_(row[M.MUST_CHANGE_PIN]),
      profileComplete: toBool_(row[M.PROFILE_COMPLETE]),
      inviteCodeUsed: String(row[M.INVITE_CODE_USED] || ''),
      failedLoginCount: Number(row[M.FAILED_LOGIN_COUNT]) || 0,
      nextAttemptAt: toIso_(row[M.NEXT_ATTEMPT_AT]),
      allTimePosts: Number(row[M.ALL_TIME_POSTS]) || 0,
      currentWeekStreak: Number(row[M.CURRENT_WEEK_STREAK]) || 0,
      longestWeekStreak: Number(row[M.LONGEST_WEEK_STREAK]) || 0,
      perfectWeeks: Number(row[M.PERFECT_WEEKS]) || 0,
      lastSubmissionDate: toIso_(row[M.LAST_SUBMISSION_DATE]),
      flowLevelId: String(row[M.FLOW_LEVEL_ID] || 'seedling'),
      flowLevelAt: toIso_(row[M.FLOW_LEVEL_AT]),
      goalTitle: String(row[M.GOAL_TITLE] || ''),
      showingUp: String(row[M.SHOWING_UP] || ''),
      constraints: String(row[M.CONSTRAINTS] || ''),
    };
  }

  function all() {
    return SheetClient.readAll(SHEETS.MEMBERS)
      .map(function (row, index) { return toDomain(row, index + 2); })
      .filter(Boolean);
  }

  function findById(memberId) {
    var rows = all();
    for (var i = 0; i < rows.length; i += 1) {
      if (rows[i].memberId === memberId) return rows[i];
    }
    return null;
  }

  /**
   * Look up by the casefolded username key — the login identifier.
   *
   * A full scan, because Sheets has no indexes. At the community's scale this
   * is ~60 rows and immaterial.
   */
  function findByUsernameKey(key) {
    var normalised = FtIdentity.usernameKey(key);
    if (!normalised) return null;

    var rows = all();
    for (var i = 0; i < rows.length; i += 1) {
      if (rows[i].usernameKey === normalised) return rows[i];
    }
    return null;
  }

  function usernameKeyExists(key) {
    return findByUsernameKey(key) !== null;
  }

  /** @returns {number} active Super Admins — backs the last-admin invariant */
  function countActiveSuperAdmins() {
    return all().filter(function (member) {
      return member.role === ROLES.SUPER_ADMIN && member.status === MEMBER_STATUS.ACTIVE;
    }).length;
  }

  function nextId() {
    return Ids.next(ID_PREFIX.MEMBER, SheetClient.readAll(SHEETS.MEMBERS), M.MEMBER_ID, 4);
  }

  /**
   * @param {Object} member
   * @returns {Object} the member, with its row index
   */
  function insert(member) {
    var row = [];
    row[M.MEMBER_ID] = member.memberId;
    row[M.USERNAME] = member.username;
    row[M.USERNAME_KEY] = member.usernameKey;
    row[M.FULL_NAME] = member.fullName;
    row[M.PIN_HASH] = member.pinHash;
    row[M.PIN_SALT] = member.pinSalt;
    row[M.PLATFORM] = member.platform;
    row[M.WEEKLY_GOAL] = member.weeklyGoal;
    row[M.JOIN_DATE] = member.joinDate;
    row[M.STATUS] = member.status || MEMBER_STATUS.ACTIVE;
    row[M.ROLE] = member.role || ROLES.MEMBER;
    row[M.CONSENT_FEATURE] = Boolean(member.consentFeature);
    row[M.MUST_CHANGE_PIN] = Boolean(member.mustChangePin);
    row[M.PROFILE_COMPLETE] = false;
    row[M.INVITE_CODE_USED] = member.inviteCodeUsed || '';
    row[M.FAILED_LOGIN_COUNT] = 0;
    row[M.NEXT_ATTEMPT_AT] = '';
    row[M.ALL_TIME_POSTS] = 0;
    row[M.CURRENT_WEEK_STREAK] = 0;
    row[M.LONGEST_WEEK_STREAK] = 0;
    row[M.PERFECT_WEEKS] = 0;
    row[M.LAST_SUBMISSION_DATE] = '';
    row[M.FLOW_LEVEL_ID] = member.flowLevelId || 'seedling';
    row[M.FLOW_LEVEL_AT] = member.joinDate;
    row[M.UPDATED_AT] = nowIso_();
    row[M.GOAL_TITLE] = member.goalTitle || '';
    row[M.SHOWING_UP] = member.showingUp || '';
    row[M.CONSTRAINTS] = member.constraints || '';

    var rowIndex = SheetClient.append(SHEETS.MEMBERS, fill_(row, MEMBERS_HEADERS.length));
    member.rowIndex = rowIndex;
    return member;
  }

  /**
   * Patch named fields on one member.
   *
   * Batched into a single range write — four separate single-cell writes are
   * four round trips, which is the difference between a 1-second and a
   * 3-second submission.
   *
   * @param {number} rowIndex
   * @param {Object} patch domain field names
   */
  function update(rowIndex, patch) {
    var map = {
      username: M.USERNAME, usernameKey: M.USERNAME_KEY, fullName: M.FULL_NAME,
      pinHash: M.PIN_HASH, pinSalt: M.PIN_SALT, platform: M.PLATFORM,
      weeklyGoal: M.WEEKLY_GOAL, status: M.STATUS, role: M.ROLE,
      consentFeature: M.CONSENT_FEATURE, mustChangePin: M.MUST_CHANGE_PIN,
      profileComplete: M.PROFILE_COMPLETE,
      failedLoginCount: M.FAILED_LOGIN_COUNT, nextAttemptAt: M.NEXT_ATTEMPT_AT,
      allTimePosts: M.ALL_TIME_POSTS, currentWeekStreak: M.CURRENT_WEEK_STREAK,
      longestWeekStreak: M.LONGEST_WEEK_STREAK, perfectWeeks: M.PERFECT_WEEKS,
      lastSubmissionDate: M.LAST_SUBMISSION_DATE,
      flowLevelId: M.FLOW_LEVEL_ID, flowLevelAt: M.FLOW_LEVEL_AT,
      goalTitle: M.GOAL_TITLE, showingUp: M.SHOWING_UP, constraints: M.CONSTRAINTS,
    };

    var cells = [];
    Object.keys(patch).forEach(function (key) {
      if (map[key] === undefined) return;
      cells.push({ col: map[key] + 1, value: patch[key] });
    });

    cells.push({ col: M.UPDATED_AT + 1, value: nowIso_() });
    SheetClient.updateCells(SHEETS.MEMBERS, rowIndex, cells);
  }

  function remove(rowIndex) {
    SheetClient.sheet(SHEETS.MEMBERS).deleteRow(rowIndex);
  }

  return {
    all: all,
    findById: findById,
    findByUsernameKey: findByUsernameKey,
    usernameKeyExists: usernameKeyExists,
    countActiveSuperAdmins: countActiveSuperAdmins,
    nextId: nextId,
    insert: insert,
    update: update,
    remove: remove,
  };
})();

/* ==========================================================================
   ProfileRepo — 1:1 with Members, optional side
   ========================================================================== */

var ProfileRepo = (function () {
  function findByMemberId(memberId) {
    var rows = SheetClient.readAll(SHEETS.PROFILES);

    for (var i = 0; i < rows.length; i += 1) {
      if (String(rows[i][P.MEMBER_ID]) === memberId) {
        return {
          rowIndex: i + 2,
          memberId: memberId,
          whatsapp: String(rows[i][P.WHATSAPP] || ''),
          email: String(rows[i][P.EMAIL] || ''),
          bio: String(rows[i][P.BIO] || ''),
          updatedAt: toIso_(rows[i][P.UPDATED_AT]),
        };
      }
    }

    // Absence is valid: a member who never opened Stage 2 has no row.
    return null;
  }

  /**
   * Create or patch a profile.
   *
   * @param {string} memberId
   * @param {Object} patch whatsapp, email, bio — each optional
   * @returns {Object}
   */
  function upsert(memberId, patch) {
    var existing = findByMemberId(memberId);

    if (!existing) {
      SheetClient.append(SHEETS.PROFILES, [
        memberId, patch.whatsapp || '', patch.email || '', patch.bio || '', nowIso_(),
      ]);
      return findByMemberId(memberId);
    }

    var cells = [];
    if (patch.whatsapp !== undefined) cells.push({ col: P.WHATSAPP + 1, value: patch.whatsapp });
    if (patch.email !== undefined) cells.push({ col: P.EMAIL + 1, value: patch.email });
    if (patch.bio !== undefined) cells.push({ col: P.BIO + 1, value: patch.bio });
    cells.push({ col: P.UPDATED_AT + 1, value: nowIso_() });

    SheetClient.updateCells(SHEETS.PROFILES, existing.rowIndex, cells);
    return findByMemberId(memberId);
  }

  return { findByMemberId: findByMemberId, upsert: upsert };
})();

/* ==========================================================================
   InviteRepo
   ========================================================================== */

var InviteRepo = (function () {
  function toDomain(row, rowIndex) {
    if (!row || !row[I.CODE]) return null;

    return {
      rowIndex: rowIndex,
      code: String(row[I.CODE]),
      status: String(row[I.STATUS] || INVITE_STATUS.UNUSED),
      createdBy: String(row[I.CREATED_BY] || ''),
      createdAt: toIso_(row[I.CREATED_AT]),
      expiresAt: toIso_(row[I.EXPIRES_AT]),
      usedBy: String(row[I.USED_BY] || ''),
      usedAt: toIso_(row[I.USED_AT]),
      note: String(row[I.NOTE] || ''),
    };
  }

  function all() {
    return SheetClient.readAll(SHEETS.INVITE_CODES)
      .map(function (row, index) { return toDomain(row, index + 2); })
      .filter(Boolean);
  }

  function findByCode(code) {
    var key = FtIdentity.inviteKey(code);
    if (!key) return null;

    var rows = all();
    for (var i = 0; i < rows.length; i += 1) {
      if (rows[i].code === key) return rows[i];
    }
    return null;
  }

  function insertMany(codes) {
    SheetClient.appendMany(
      SHEETS.INVITE_CODES,
      codes.map(function (invite) {
        return [
          invite.code, INVITE_STATUS.UNUSED, invite.createdBy, invite.createdAt,
          invite.expiresAt, '', '', invite.note || '',
        ];
      }),
    );
  }

  /**
   * Mark a code redeemed.
   *
   * Refuses a row that is not `Unused` — the last line of defence inside the
   * registration lock, so a code can never be spent twice.
   *
   * @param {number} rowIndex
   * @param {string} memberId
   */
  function markUsed(rowIndex, memberId) {
    var sheet = SheetClient.sheet(SHEETS.INVITE_CODES);
    var current = String(sheet.getRange(rowIndex, I.STATUS + 1).getValue());

    if (current !== INVITE_STATUS.UNUSED) {
      throw fail_('INVITE_USED', undefined, { field: 'inviteCode' });
    }

    SheetClient.updateCells(SHEETS.INVITE_CODES, rowIndex, [
      { col: I.STATUS + 1, value: INVITE_STATUS.USED },
      { col: I.USED_BY + 1, value: memberId },
      { col: I.USED_AT + 1, value: nowIso_() },
    ]);
  }

  function markStatus(rowIndex, status) {
    SheetClient.updateCells(SHEETS.INVITE_CODES, rowIndex, [
      { col: I.STATUS + 1, value: status },
    ]);
  }

  return {
    all: all,
    findByCode: findByCode,
    insertMany: insertMany,
    markUsed: markUsed,
    markStatus: markStatus,
  };
})();

/* ==========================================================================
   SessionRepo — stores hashes only
   ========================================================================== */

var SessionRepo = (function () {
  function toDomain(row, rowIndex) {
    if (!row || !row[SE.SESSION_ID]) return null;

    return {
      rowIndex: rowIndex,
      sessionId: String(row[SE.SESSION_ID]),
      memberId: String(row[SE.MEMBER_ID] || ''),
      role: String(row[SE.ROLE] || ''),
      createdAt: toIso_(row[SE.CREATED_AT]),
      expiresAt: toIso_(row[SE.EXPIRES_AT]),
      lastSeenAt: toIso_(row[SE.LAST_SEEN_AT]),
      revokedAt: toIso_(row[SE.REVOKED_AT]),
    };
  }

  function all() {
    return SheetClient.readAll(SHEETS.SESSIONS)
      .map(function (row, index) { return toDomain(row, index + 2); })
      .filter(Boolean);
  }

  /** @param {string} hash SHA-256 of the raw token */
  function findByHash(hash) {
    var rows = all();
    for (var i = 0; i < rows.length; i += 1) {
      if (rows[i].sessionId === hash) return rows[i];
    }
    return null;
  }

  function insert(session) {
    SheetClient.append(SHEETS.SESSIONS, [
      session.sessionId, session.memberId, session.role, session.createdAt,
      session.expiresAt, session.lastSeenAt, '', session.userAgent || '',
    ]);
  }

  function touch(rowIndex, lastSeenAt, expiresAt) {
    SheetClient.updateCells(SHEETS.SESSIONS, rowIndex, [
      { col: SE.LAST_SEEN_AT + 1, value: lastSeenAt },
      { col: SE.EXPIRES_AT + 1, value: expiresAt },
    ]);
  }

  function revoke(rowIndex) {
    SheetClient.updateCells(SHEETS.SESSIONS, rowIndex, [
      { col: SE.REVOKED_AT + 1, value: nowIso_() },
    ]);
  }

  /**
   * Revoke every session for a member.
   *
   * Called on suspension, role change, PIN change, and PIN reset — the whole
   * reason a session table exists rather than a stateless token.
   */
  function revokeAllForMember(memberId) {
    var stamp = nowIso_();

    all().forEach(function (session) {
      if (session.memberId !== memberId || session.revokedAt) return;
      SheetClient.updateCells(SHEETS.SESSIONS, session.rowIndex, [
        { col: SE.REVOKED_AT + 1, value: stamp },
      ]);
    });
  }

  /** Delete expired and revoked rows, newest-first so indexes stay valid. */
  function deleteExpired() {
    var sheet = SheetClient.sheet(SHEETS.SESSIONS);
    var now = Date.now();
    var doomed = [];

    all().forEach(function (session) {
      var expired = session.expiresAt && Date.parse(session.expiresAt) < now;
      if (expired || session.revokedAt) doomed.push(session.rowIndex);
    });

    doomed.sort(function (a, b) { return b - a; }).forEach(function (rowIndex) {
      sheet.deleteRow(rowIndex);
    });

    return doomed.length;
  }

  return {
    all: all,
    findByHash: findByHash,
    insert: insert,
    touch: touch,
    revoke: revoke,
    revokeAllForMember: revokeAllForMember,
    deleteExpired: deleteExpired,
  };
})();

/* ==========================================================================
   SubmissionRepo — the append-only ledger
   ========================================================================== */

var SubmissionRepo = (function () {
  function toDomain(row, rowIndex) {
    if (!row || !row[S.SUBMISSION_ID]) return null;

    return {
      rowIndex: rowIndex,
      submissionId: String(row[S.SUBMISSION_ID]),
      timestamp: toIso_(row[S.TIMESTAMP]),
      memberId: String(row[S.MEMBER_ID] || ''),
      name: String(row[S.NAME] || ''),
      username: String(row[S.USERNAME] || ''),
      platform: String(row[S.PLATFORM] || ''),
      contentLink: String(row[S.CONTENT_LINK] || ''),
      linkKey: String(row[S.LINK_KEY] || ''),
      dayKey: toDayKey_(row[S.DAY_KEY]),
      weekStart: toDayKey_(row[S.WEEK_START]),
      weekNumber: Number(row[S.WEEK_NUMBER]) || 0,
      month: Number(row[S.MONTH]) || 0,
      year: Number(row[S.YEAR]) || 0,
      goalAtSubmission: Number(row[S.GOAL_AT_SUBMISSION]) || DEFAULTS.WEEKLY_GOAL,
      status: String(row[S.STATUS] || SUBMISSION_STATUS.ACTIVE),
      actionTitle: String(row[S.ACTION_TITLE] || ''),
      evidence: String(row[S.EVIDENCE] || ''),
      source: String(row[S.SOURCE] || (row[S.CONTENT_LINK] ? 'legacy-post' : 'action')),
    };
  }

  function all() {
    return SheetClient.readAll(SHEETS.SUBMISSIONS)
      .map(function (row, index) { return toDomain(row, index + 2); })
      .filter(Boolean);
  }

  /** Active rows only — a voided submission counts nowhere. */
  function active() {
    return all().filter(function (row) { return row.status === SUBMISSION_STATUS.ACTIVE; });
  }

  function byMember(memberId) {
    return active().filter(function (row) { return row.memberId === memberId; });
  }

  function append(submission) {
    var row = [
      submission.submissionId, submission.timestamp, submission.memberId,
      submission.name, submission.username, submission.platform,
      submission.contentLink, submission.linkKey, submission.dayKey,
      submission.weekStart, submission.weekNumber, submission.month,
      submission.year, submission.goalAtSubmission, SUBMISSION_STATUS.ACTIVE,
      submission.actionTitle || '', submission.evidence || '', submission.source || 'legacy-post',
    ];

    submission.rowIndex = SheetClient.append(SHEETS.SUBMISSIONS, row);
    return submission;
  }

  function nextId() {
    return Ids.next(ID_PREFIX.SUBMISSION, SheetClient.readAll(SHEETS.SUBMISSIONS), S.SUBMISSION_ID, 6);
  }

  /**
   * Has this member logged this normalised link recently?
   *
   * Cross-member duplicates are allowed — two members may legitimately link
   * one collaborative post.
   */
  function hasRecentLinkKey(memberId, linkKey, windowDays) {
    var cutoff = Date.now() - windowDays * 86400000;

    return byMember(memberId).some(function (row) {
      if (row.linkKey !== linkKey) return false;
      var when = Date.parse(row.timestamp);
      return isNaN(when) || when >= cutoff;
    });
  }

  function countForDay(memberId, dayKey) {
    return byMember(memberId).filter(function (row) { return row.dayKey === dayKey; }).length;
  }

  function byWeek(weekStart) {
    return active().filter(function (row) { return row.weekStart === weekStart; });
  }

  /** Marks Voided. Never deletes — the ledger is append-only. */
  function voidSubmission(rowIndex) {
    SheetClient.updateCells(SHEETS.SUBMISSIONS, rowIndex, [
      { col: S.STATUS + 1, value: SUBMISSION_STATUS.VOIDED },
    ]);
  }

  return {
    all: all,
    active: active,
    byMember: byMember,
    append: append,
    nextId: nextId,
    hasRecentLinkKey: hasRecentLinkKey,
    countForDay: countForDay,
    byWeek: byWeek,
    voidSubmission: voidSubmission,
  };
})();

/* ==========================================================================
   CalendarRepo — the packed day map
   ========================================================================== */

var CalendarRepo = (function () {
  function toDomain(row, rowIndex) {
    if (!row || !row[AC.MEMBER_ID]) return null;

    return {
      rowIndex: rowIndex,
      memberId: String(row[AC.MEMBER_ID]),
      year: Number(row[AC.YEAR]),
      dayMap: FtDayMap.normalise(row[AC.DAY_MAP]),
      activeDays: Number(row[AC.ACTIVE_DAYS]) || 0,
    };
  }

  function all() {
    return SheetClient.readAll(SHEETS.ACTIVITY_CALENDAR)
      .map(function (row, index) { return toDomain(row, index + 2); })
      .filter(Boolean);
  }

  function find(memberId, year) {
    var rows = all();
    for (var i = 0; i < rows.length; i += 1) {
      if (rows[i].memberId === memberId && rows[i].year === Number(year)) return rows[i];
    }
    return null;
  }

  function forMember(memberId) {
    return all().filter(function (row) { return row.memberId === memberId; });
  }

  /** Lifetime active days — the number the 7/30/100 milestones read. */
  function sumActiveDays(memberId) {
    return forMember(memberId).reduce(function (total, row) {
      return total + row.activeDays;
    }, 0);
  }

  function create(memberId, year) {
    var map = FtDayMap.empty();
    SheetClient.append(SHEETS.ACTIVITY_CALENDAR, [
      memberId, year, map, 0, '', '', nowIso_(),
    ]);
    return find(memberId, year);
  }

  function save(rowIndex, dayMap, activeDays, firstActive, lastActive) {
    SheetClient.updateCells(SHEETS.ACTIVITY_CALENDAR, rowIndex, [
      { col: AC.DAY_MAP + 1, value: dayMap },
      { col: AC.ACTIVE_DAYS + 1, value: activeDays },
      { col: AC.FIRST_ACTIVE + 1, value: firstActive || '' },
      { col: AC.LAST_ACTIVE + 1, value: lastActive || '' },
      { col: AC.UPDATED_AT + 1, value: nowIso_() },
    ]);
  }

  return {
    all: all,
    find: find,
    forMember: forMember,
    sumActiveDays: sumActiveDays,
    create: create,
    save: save,
  };
})();

/* ==========================================================================
   WeeklyStatsRepo
   ========================================================================== */

var WeeklyStatsRepo = (function () {
  function toDomain(row, rowIndex) {
    if (!row || !row[W.MEMBER_ID]) return null;

    return {
      rowIndex: rowIndex,
      memberId: String(row[W.MEMBER_ID]),
      weekStart: toDayKey_(row[W.WEEK_START]),
      postCount: Number(row[W.POST_COUNT]) || 0,
      distinctDays: Number(row[W.DISTINCT_DAYS]) || 0,
      goalAtWeek: Number(row[W.GOAL_AT_WEEK]) || DEFAULTS.WEEKLY_GOAL,
      goalMet: toBool_(row[W.GOAL_MET]),
      rankFinal: row[W.RANK_FINAL] === '' ? null : Number(row[W.RANK_FINAL]),
    };
  }

  function all() {
    return SheetClient.readAll(SHEETS.WEEKLY_STATS)
      .map(function (row, index) { return toDomain(row, index + 2); })
      .filter(Boolean);
  }

  function find(memberId, weekStart) {
    var rows = all();
    for (var i = 0; i < rows.length; i += 1) {
      if (rows[i].memberId === memberId && rows[i].weekStart === weekStart) return rows[i];
    }
    return null;
  }

  function forMember(memberId) {
    return all().filter(function (row) { return row.memberId === memberId; });
  }

  function forWeek(weekStart) {
    return all().filter(function (row) { return row.weekStart === weekStart; });
  }

  function upsert(stats) {
    var existing = find(stats.memberId, stats.weekStart);

    if (!existing) {
      SheetClient.append(SHEETS.WEEKLY_STATS, [
        stats.memberId, stats.weekStart, stats.postCount, stats.distinctDays,
        stats.goalAtWeek, stats.goalMet, '', nowIso_(),
      ]);
      return find(stats.memberId, stats.weekStart);
    }

    SheetClient.updateCells(SHEETS.WEEKLY_STATS, existing.rowIndex, [
      { col: W.POST_COUNT + 1, value: stats.postCount },
      { col: W.DISTINCT_DAYS + 1, value: stats.distinctDays },
      { col: W.GOAL_AT_WEEK + 1, value: stats.goalAtWeek },
      { col: W.GOAL_MET + 1, value: stats.goalMet },
      { col: W.UPDATED_AT + 1, value: nowIso_() },
    ]);

    return Object.assign(existing, stats);
  }

  /**
   * Freeze the settled ranking for a closed week.
   *
   * A milestone reading "you finished in the Top 10" must be judged against a
   * settled number, not a Tuesday-afternoon one.
   */
  function freezeRanks(weekStart, ranked) {
    ranked.forEach(function (entry) {
      var row = find(entry.memberId, weekStart);
      if (!row) return;
      SheetClient.updateCells(SHEETS.WEEKLY_STATS, row.rowIndex, [
        { col: W.RANK_FINAL + 1, value: entry.rank },
      ]);
    });
  }

  return {
    all: all,
    find: find,
    forMember: forMember,
    forWeek: forWeek,
    upsert: upsert,
    freezeRanks: freezeRanks,
  };
})();

/* ==========================================================================
   Catalog, milestones, levels
   ========================================================================== */

var MilestoneCatalogRepo = (function () {
  function listActive() {
    return CacheClient.remember('catalog', DEFAULTS.CACHE_STATIC_SECONDS, function () {
      return SheetClient.readAll(SHEETS.MILESTONE_CATALOG)
        .map(function (row) {
          if (!row || !row[MC.MILESTONE_ID]) return null;
          return {
            milestoneId: String(row[MC.MILESTONE_ID]),
            name: String(row[MC.NAME] || ''),
            description: String(row[MC.DESCRIPTION] || ''),
            category: String(row[MC.CATEGORY] || ''),
            iconId: String(row[MC.ICON_ID] || 'medal'),
            rarity: String(row[MC.RARITY] || 'Common'),
            sortOrder: Number(row[MC.SORT_ORDER]) || 0,
            active: toBool_(row[MC.ACTIVE]),
            hidden: toBool_(row[MC.HIDDEN]),
            seriesId: String(row[MC.SERIES_ID] || ''),
            tier: Number(row[MC.TIER]) || 0,
            badgeUrl: String(row[MC.BADGE_URL] || ''),
          };
        })
        .filter(function (entry) { return entry && entry.active; });
    });
  }

  return { listActive: listActive };
})();

var MemberMilestoneRepo = (function () {
  function all() {
    return SheetClient.readAll(SHEETS.MEMBER_MILESTONES)
      .map(function (row, index) {
        if (!row || !row[MM.MEMBER_ID]) return null;
        return {
          rowIndex: index + 2,
          memberId: String(row[MM.MEMBER_ID]),
          milestoneId: String(row[MM.MILESTONE_ID]),
          unlockedAt: toIso_(row[MM.UNLOCKED_AT]),
          context: String(row[MM.CONTEXT] || ''),
          seen: toBool_(row[MM.SEEN]),
        };
      })
      .filter(Boolean);
  }

  function forMember(memberId) {
    return all().filter(function (row) { return row.memberId === memberId; });
  }

  function earnedIds(memberId) {
    return forMember(memberId).map(function (row) { return row.milestoneId; });
  }

  /**
   * Record unlocks.
   *
   * Re-reads immediately before appending, inside the caller's lock, so a
   * retried request cannot produce two rows for one milestone.
   */
  function appendMany(memberId, milestones, context) {
    var already = {};
    earnedIds(memberId).forEach(function (id) { already[id] = true; });

    var rows = [];
    milestones.forEach(function (milestone) {
      if (already[milestone.milestoneId]) return;
      rows.push([
        memberId, milestone.milestoneId, nowIso_(),
        JSON.stringify(context || {}), false,
      ]);
    });

    if (rows.length) SheetClient.appendMany(SHEETS.MEMBER_MILESTONES, rows);
    return rows.length;
  }

  /** Clears the celebration queue after the modal is dismissed. */
  function markSeen(memberId, milestoneIds) {
    forMember(memberId).forEach(function (row) {
      if (row.seen || milestoneIds.indexOf(row.milestoneId) === -1) return;
      SheetClient.updateCells(SHEETS.MEMBER_MILESTONES, row.rowIndex, [
        { col: MM.SEEN + 1, value: true },
      ]);
    });
  }

  return {
    all: all,
    forMember: forMember,
    earnedIds: earnedIds,
    appendMany: appendMany,
    markSeen: markSeen,
  };
})();

var FlowLevelRepo = (function () {
  function listOrdered() {
    return CacheClient.remember('levels', DEFAULTS.CACHE_STATIC_SECONDS, function () {
      return SheetClient.readAll(SHEETS.FLOW_LEVELS)
        .map(function (row) {
          if (!row || !row[FL.LEVEL_ID]) return null;
          return {
            levelId: String(row[FL.LEVEL_ID]),
            name: String(row[FL.NAME] || ''),
            description: String(row[FL.DESCRIPTION] || ''),
            iconId: String(row[FL.ICON_ID] || 'seedling'),
            sortOrder: Number(row[FL.SORT_ORDER]) || 0,
            requiredPosts: Number(row[FL.REQUIRED_POSTS]) || 0,
            requiredPerfectWeeks: Number(row[FL.REQUIRED_WEEKS]) || 0,
            active: toBool_(row[FL.ACTIVE]),
          };
        })
        .filter(function (level) { return level && level.active; })
        .sort(function (a, b) { return a.sortOrder - b.sortOrder; });
    });
  }

  return { listOrdered: listOrdered };
})();

/* ==========================================================================
   Settings, audit, notifications, community stats
   ========================================================================== */

var SettingsRepo = (function () {
  function raw() {
    return CacheClient.remember('settings', 600, function () {
      var out = {};
      SheetClient.readAll(SHEETS.SETTINGS).forEach(function (row) {
        if (!row || !row[ST.KEY]) return;
        out[String(row[ST.KEY])] = { value: row[ST.VALUE], type: String(row[ST.TYPE] || 'string') };
      });
      return out;
    });
  }

  /**
   * Typed read with a fallback.
   *
   * Falls back to DEFAULTS so a missing or mistyped row degrades to the
   * documented behaviour rather than an exception.
   */
  function get(key, fallback) {
    var entry = raw()[key];
    if (!entry) return fallback;

    if (entry.type === 'number') {
      var n = Number(entry.value);
      return isNaN(n) ? fallback : n;
    }
    if (entry.type === 'boolean') return toBool_(entry.value);
    if (entry.type === 'json') {
      try { return JSON.parse(String(entry.value)); } catch (e) { return fallback; }
    }
    return entry.value === '' || entry.value === null ? fallback : String(entry.value);
  }

  function set(key, value, actorId) {
    var rows = SheetClient.readAll(SHEETS.SETTINGS);

    for (var i = 0; i < rows.length; i += 1) {
      if (String(rows[i][ST.KEY]) === key) {
        SheetClient.updateCells(SHEETS.SETTINGS, i + 2, [
          { col: ST.VALUE + 1, value: value },
          { col: ST.UPDATED_BY + 1, value: actorId },
          { col: ST.UPDATED_AT + 1, value: nowIso_() },
        ]);
        CacheClient.remove('settings');
        return;
      }
    }

    SheetClient.append(SHEETS.SETTINGS, [key, value, 'string', 'custom', '', actorId, nowIso_()]);
    CacheClient.remove('settings');
  }

  function list() {
    return SheetClient.readAll(SHEETS.SETTINGS)
      .filter(function (row) { return row && row[ST.KEY]; })
      .map(function (row) {
        return {
          key: String(row[ST.KEY]),
          value: row[ST.VALUE],
          type: String(row[ST.TYPE] || 'string'),
          category: String(row[ST.CATEGORY] || ''),
          description: String(row[ST.DESCRIPTION] || ''),
        };
      });
  }

  return { get: get, set: set, list: list };
})();

var AuditRepo = (function () {
  /**
   * Append an audit row.
   *
   * Never throws: an audit failure must not take down the action it was
   * recording. A missing row is a diagnostic loss; a failed submission is a
   * member's lost work.
   */
  function append(entry) {
    try {
      SheetClient.append(SHEETS.AUDIT_LOG, [
        nowIso_(),
        entry.actorId || '',
        entry.actorRole || '',
        entry.action || '',
        entry.targetId || '',
        entry.details ? JSON.stringify(entry.details).slice(0, 900) : '',
        entry.result || 'SUCCESS',
      ]);
    } catch (error) {
      Logger_.error('audit', error);
    }
  }

  function list(limit) {
    var rows = SheetClient.readAll(SHEETS.AUDIT_LOG);
    return rows
      .slice(Math.max(0, rows.length - (limit || 200)))
      .reverse()
      .map(function (row) {
        return {
          timestamp: toIso_(row[AL.TIMESTAMP]),
          actorId: String(row[AL.ACTOR_ID] || ''),
          actorRole: String(row[AL.ACTOR_ROLE] || ''),
          action: String(row[AL.ACTION] || ''),
          targetId: String(row[AL.TARGET_ID] || ''),
          details: String(row[AL.DETAILS] || ''),
          result: String(row[AL.RESULT] || ''),
        };
      });
  }

  return { append: append, list: list };
})();

var NotificationRepo = (function () {
  function append(memberId, type, payload) {
    try {
      SheetClient.append(SHEETS.NOTIFICATIONS, [
        ID_PREFIX.NOTIFICATION + '-' + Utilities.getUuid().slice(0, 8),
        memberId, type, 'InApp', JSON.stringify(payload || {}),
        'Pending', nowIso_(), '',
      ]);
    } catch (error) {
      Logger_.error('notifications', error);
    }
  }

  return { append: append };
})();

var CommunityStatsRepo = (function () {
  function upsertForDate(dateKey, stats) {
    var rows = SheetClient.readAll(SHEETS.COMMUNITY_STATS);

    var values = [
      dateKey, stats.posts, stats.activeMembers, stats.newMembers,
      stats.goalHits, JSON.stringify(stats.platforms || {}), stats.milestones || 0,
    ];

    for (var i = 0; i < rows.length; i += 1) {
      if (String(rows[i][CS.DATE]) === dateKey) {
        SheetClient.updateRow(SHEETS.COMMUNITY_STATS, i + 2, values);
        return;
      }
    }

    SheetClient.append(SHEETS.COMMUNITY_STATS, values);
  }

  function findRange(fromKey, toKey) {
    return SheetClient.readAll(SHEETS.COMMUNITY_STATS)
      .filter(function (row) {
        var key = String(row[CS.DATE] || '');
        return key >= fromKey && key <= toKey;
      })
      .map(function (row) {
        return {
          date: String(row[CS.DATE]),
          posts: Number(row[CS.POSTS]) || 0,
          activeMembers: Number(row[CS.ACTIVE_MEMBERS]) || 0,
          newMembers: Number(row[CS.NEW_MEMBERS]) || 0,
          goalHits: Number(row[CS.GOAL_HITS]) || 0,
        };
      });
  }

  return { upsertForDate: upsertForDate, findRange: findRange };
})();

/* ==========================================================================
   Shared coercion
   --------------------------------------------------------------------------
   Sheets returns Dates for date-formatted cells, strings otherwise, and
   booleans as either. Normalising at the repository boundary means no layer
   above ever has to guess.
   ========================================================================== */

function nowIso_() {
  return new Date().toISOString();
}

function toIso_(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString();

  var parsed = Date.parse(String(value));
  return isNaN(parsed) ? String(value) : new Date(parsed).toISOString();
}

/**
 * Read a day or week key as the 'YYYY-MM-DD' string the application compares.
 *
 * `setupBootstrap` formats these columns as plain text so Sheets stores them
 * verbatim, which is the real fix. This is the second line of defence, and it
 * earns its place because the operator edits this spreadsheet by hand — that
 * is a stated design goal, not an accident. Retyping a date into a cell
 * without the text format re-creates a Date, and without this the value would
 * silently match nothing: no error, just a member whose week stops counting.
 *
 * A Date read back from Sheets is midnight in the SPREADSHEET's timezone, so
 * it is converted in TIMEZONE. Using the server's local zone would shift the
 * key by a day for anyone west of Lagos.
 *
 * @param {*} value
 * @returns {string} '' when empty, otherwise 'YYYY-MM-DD'
 */
function toDayKey_(value) {
  if (!value) return '';
  if (value instanceof Date) return FtWeek.dayKey(value, TIMEZONE);
  return String(value);
}

function toBool_(value) {
  if (typeof value === 'boolean') return value;
  var text = String(value).trim().toLowerCase();
  return text === 'true' || text === 'yes' || text === '1';
}

/** Pad a sparse array so every row written has the full column count. */
function fill_(row, length) {
  var out = [];
  for (var i = 0; i < length; i += 1) {
    out[i] = row[i] === undefined ? '' : row[i];
  }
  return out;
}
