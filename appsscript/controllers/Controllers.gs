/**
 * Controllers.
 *
 * Translate a validated request into a call to an orchestrator or a service,
 * then shape the result for the wire. They hold no business rules and never
 * touch a repository — if a controller starts making decisions, that logic
 * belongs one layer down.
 *
 * Every member-scoped handler derives its target from `context.member`. No
 * payload field carries a member id, so there is nothing to tamper with.
 *
 * @see docs/api.md
 */

/* ==========================================================================
   AuthController
   ========================================================================== */

var AuthController = (function () {
  function checkUsername(ctx) {
    var username = Validate.str(ctx.payload.username, 40);
    RateLimit.check('checkUsername', ctx.requestId || 'anon', 40, 60);

    var result = FtIdentity.validateUsername(username);
    if (!result.valid) return { available: false, reason: result.message };

    var taken = MemberRepo.usernameKeyExists(username);
    return {
      available: !taken,
      reason: taken ? 'That username is taken. Try another.' : '',
    };
  }

  function register(ctx) {
    Validate.required(ctx.payload, [
      'fullName', 'username', 'pin', 'pinConfirm', 'weeklyGoal', 'inviteCode',
    ]);

    // Keyed on the invite code: single-use codes make this a backstop rather
    // than the primary control, but it stops a script hammering registration.
    RateLimit.check('register', FtIdentity.inviteKey(ctx.payload.inviteCode), 10, 3600);

    var result = RegistrationFlow.register({
      fullName: Validate.str(ctx.payload.fullName, 60),
      username: Validate.str(ctx.payload.username, 20),
      pin: String(ctx.payload.pin),
      pinConfirm: String(ctx.payload.pinConfirm),
      platform: Validate.str(ctx.payload.platform || 'Flow', 20),
      weeklyGoal: Validate.int(ctx.payload.weeklyGoal, 3),
      goalTitle: Validate.str(ctx.payload.goalTitle || '', 120),
      showingUp: Validate.str(ctx.payload.showingUp || '', 160),
      constraints: Validate.str(ctx.payload.constraints || '', 240),
      inviteCode: Validate.str(ctx.payload.inviteCode, 20),
      consentFeature: Boolean(ctx.payload.consentFeature),
    }, ctx.userAgent);

    return {
      token: result.token,
      expiresAt: result.expiresAt,
      member: MemberService.toPublic(result.member),
      capabilities: capabilitiesFor_(result.member.role),
      milestones: result.milestones.map(publicMilestone_),
      redirect: 'member',
    };
  }

  function login(ctx) {
    Validate.required(ctx.payload, ['username', 'pin']);

    var key = FtIdentity.usernameKey(ctx.payload.username);
    // A generous ceiling. The real brake is the per-account exponential
    // backoff in AuthService; this only stops a flood.
    RateLimit.check('login', key || 'anon', 30, 300);

    var result = LoginFlow.login(ctx.payload.username, String(ctx.payload.pin), ctx.userAgent);

    return {
      token: result.token,
      expiresAt: result.expiresAt,
      member: MemberService.toPublic(result.member),
      capabilities: capabilitiesFor_(result.member.role),
      mustChangePin: result.mustChangePin,
      // A routing hint only. Authorisation is per-action and never uses it.
      redirect: roleHas_(result.member.role, 'admin:overview:read') ? 'admin' : 'member',
    };
  }

  function logout(ctx) {
    SessionService.revoke(ctx.session);
    AuditService.record(ctx, 'LOGOUT');
    return { ok: true };
  }

  function session(ctx) {
    return {
      member: MemberService.toPublic(ctx.member),
      capabilities: ctx.capabilities,
      mustChangePin: ctx.member.mustChangePin,
      expiresAt: ctx.sessionExpiresAt,
    };
  }

  function changePin(ctx) {
    Validate.required(ctx.payload, ['currentPin', 'newPin', 'newPinConfirm']);

    MemberService.changePin(
      ctx.member,
      String(ctx.payload.currentPin),
      String(ctx.payload.newPin),
      String(ctx.payload.newPinConfirm),
    );

    // Every session was revoked, including this one — the client must log in
    // again with the new PIN.
    return { ok: true, reauthenticate: true };
  }

  return {
    checkUsername: checkUsername,
    register: register,
    login: login,
    logout: logout,
    session: session,
    changePin: changePin,
  };
})();

/* ==========================================================================
   MemberController
   ========================================================================== */

var MemberController = (function () {
  /**
   * The whole dashboard in one call.
   *
   * Eight round trips to Apps Script on mobile data is the difference between
   * a dashboard that feels instant and one that assembles itself in front of
   * the member. The vision asks that the ring and calendar communicate
   * consistency before any number is read — which only works if they arrive
   * together.
   */
  function dashboard(ctx) {
    var member = ctx.member;
    var todayKey = FtWeek.dayKey(new Date(), TIMEZONE);
    var weekStart = FtWeek.weekStartKey(new Date(), TIMEZONE);

    return CacheClient.remember('dash:' + member.memberId, DEFAULTS.CACHE_TTL_SECONDS, function () {
      var weekStats = WeeklyStatsRepo.find(member.memberId, weekStart);
      var postsThisWeek = weekStats ? weekStats.postCount : 0;
      var distinctDays = weekStats ? weekStats.distinctDays : 0;

      var weeks = SettingsService.calendarWeeks();
      var fromKey = FtWeek.shiftDayKey(weekStart, -(weeks - 1) * 7);
      var toKey = FtWeek.shiftDayKey(weekStart, 6);

      var snap = MilestoneService.snapshot(member, {
        goalMetThisWeek: weekStats ? weekStats.goalMet : false,
        perfectWeekThisWeek: weekStats ? FtStreak.isPerfectWeek(weekStats) : false,
      });

      var levels = FlowLevelService.describe(member, snap);
      var board = LeaderboardService.build('week', 'posts', weekStart);

      return {
        member: MemberService.toPublic(member),
        // Flattened: the level's own fields, with `next` nested. The dashboard
        // reads `level.name` and `level.next` directly, so nesting a `current`
        // wrapper would cost every call site an extra hop for no gain.
        level: Object.assign({}, levels.current, { next: levels.next }),
        week: {
          weekStart: weekStart,
          today: todayKey,
          postsThisWeek: postsThisWeek,
          weeklyGoal: member.weeklyGoal,
          distinctDays: distinctDays,
          goalMet: postsThisWeek >= member.weeklyGoal,
        },
        calendar: {
          from: fromKey,
          to: toKey,
          today: todayKey,
          counts: CalendarService.countsForRange(member.memberId, fromKey, toKey),
          activeDays: snap.activeDays,
        },
        milestones: MilestoneService.summary(member, snap),
        stats: {
          currentWeekStreak: member.currentWeekStreak,
          longestWeekStreak: member.longestWeekStreak,
          allTimePosts: member.allTimePosts,
          activeDays: snap.activeDays,
          perfectWeeks: member.perfectWeeks,
        },
        leaderboard: {
          weekStart: weekStart,
          // null for a member with no posts this week. The client renders the
          // invitation to post, never a rank of zero or a last place.
          rank: LeaderboardService.rankOf(board, member.memberId),
          entries: board.slice(0, 5),
        },
        recent: SubmissionService.recentForMember(member.memberId, 5),
      };
    });
  }

  function submissions(ctx) {
    var paging = Validate.page(ctx.payload);
    var all = SubmissionService.recentForMember(ctx.member.memberId, 500);
    var start = (paging.page - 1) * paging.pageSize;

    return {
      entries: all.slice(start, start + paging.pageSize),
      total: all.length,
      page: paging.page,
      pageSize: paging.pageSize,
    };
  }

  function calendar(ctx) {
    var weekStart = FtWeek.weekStartKey(new Date(), TIMEZONE);
    var weeks = Validate.int(ctx.payload.weeks, SettingsService.calendarWeeks());
    var fromKey = FtWeek.shiftDayKey(weekStart, -(Math.max(1, Math.min(weeks, 53)) - 1) * 7);
    var toKey = FtWeek.shiftDayKey(weekStart, 6);

    return {
      from: fromKey,
      to: toKey,
      today: FtWeek.dayKey(new Date(), TIMEZONE),
      counts: CalendarService.countsForRange(ctx.member.memberId, fromKey, toKey),
      activeDays: CalendarService.lifetimeActiveDays(ctx.member.memberId),
    };
  }

  function updateConsent(ctx) {
    return MemberService.updateConsent(ctx.member, Boolean(ctx.payload.consentFeature));
  }

  function updateName(ctx) {
    Validate.required(ctx.payload, ['fullName']);
    return { member: MemberService.updateFullName(ctx.member, ctx.payload.fullName) };
  }

  function updateGoal(ctx) {
    Validate.required(ctx.payload, ['goalTitle', 'showingUp', 'weeklyGoal']);
    return {
      member: MemberService.updateGoal(ctx.member, {
        goalTitle: ctx.payload.goalTitle,
        showingUp: ctx.payload.showingUp,
        constraints: ctx.payload.constraints,
        weeklyGoal: ctx.payload.weeklyGoal,
      }),
    };
  }

  /** The milestone gallery. Shape matches the approved milestones screen. */
  function milestones(ctx) {
    var snap = MilestoneService.snapshot(ctx.member);
    var summary = MilestoneService.summary(ctx.member, snap);

    return {
      milestones: MilestoneService.listForMember(ctx.member, snap),
      totalEarned: summary.totalEarned,
      totalAvailable: summary.totalAvailable,
      next: summary.next,
    };
  }

  function markMilestonesSeen(ctx) {
    var ids = Array.isArray(ctx.payload.milestoneIds) ? ctx.payload.milestoneIds : [];
    MilestoneService.markSeen(ctx.member.memberId, ids.map(String));
    CacheClient.invalidateMember(ctx.member.memberId);
    return { ok: true };
  }

  /** The Flow Levels screen: the whole ladder, where they are, and why. */
  function levels(ctx) {
    var snap = MilestoneService.snapshot(ctx.member);
    var described = FlowLevelService.describe(ctx.member, snap);

    return {
      levels: described.all,
      current: Object.assign({}, described.current, { next: described.next }),
      // The two numbers a level is judged on, so the track can show progress
      // per rung rather than only for the next one.
      stats: {
        allTimePosts: snap.allTimePosts,
        perfectWeeks: snap.perfectWeeks,
      },
    };
  }

  /**
   * The profile screen.
   *
   * Composed server-side from the same sources as the dashboard plus the
   * optional Stage 2 contact fields — one call rather than four, for the same
   * reason the dashboard is one call.
   */
  function profile(ctx) {
    var member = ctx.member;
    var snap = MilestoneService.snapshot(member);
    var weekStart = FtWeek.weekStartKey(new Date(), TIMEZONE);

    var weeks = SettingsService.calendarWeeks();
    var fromKey = FtWeek.shiftDayKey(weekStart, -(weeks - 1) * 7);
    var toKey = FtWeek.shiftDayKey(weekStart, 6);

    var described = FlowLevelService.describe(member, snap);
    var summary = MilestoneService.summary(member, snap);

    return {
      member: MemberService.toPublic(member),
      joinDate: member.joinDate,
      contact: ProfileService.get(member.memberId),
      level: Object.assign({}, described.current, { next: described.next }),
      stats: {
        currentWeekStreak: member.currentWeekStreak,
        longestWeekStreak: member.longestWeekStreak,
        allTimePosts: member.allTimePosts,
        activeDays: snap.activeDays,
        perfectWeeks: snap.perfectWeeks,
      },
      calendar: {
        from: fromKey,
        to: toKey,
        today: FtWeek.dayKey(new Date(), TIMEZONE),
        counts: CalendarService.countsForRange(member.memberId, fromKey, toKey),
        activeDays: snap.activeDays,
      },
      milestones: {
        totalEarned: summary.totalEarned,
        totalAvailable: summary.totalAvailable,
        recent: summary.recent,
      },
    };
  }

  return {
    dashboard: dashboard,
    submissions: submissions,
    calendar: calendar,
    updateConsent: updateConsent,
    updateName: updateName,
    updateGoal: updateGoal,
    milestones: milestones,
    markMilestonesSeen: markMilestonesSeen,
    levels: levels,
    profile: profile,
  };
})();

/* ==========================================================================
   ProfileController · SubmissionController · LeaderboardController
   ========================================================================== */

var ProfileController = (function () {
  function get(ctx) {
    return ProfileService.get(ctx.member.memberId);
  }

  function update(ctx) {
    return ProfileService.update(ctx.member, {
      whatsapp: ctx.payload.whatsapp,
      email: ctx.payload.email,
      bio: ctx.payload.bio,
    });
  }

  return { get: get, update: update };
})();

var SubmissionController = (function () {
  /**
   * Log a post.
   *
   * The platform is never accepted from the payload — it is read from the
   * member's record. Accepting it would let a member log an Instagram post
   * against a LinkedIn account, defeating validation entirely.
   */
  function create(ctx) {
    Validate.required(ctx.payload, ['link']);

    // Idempotency: a double-tapped button on a slow connection records one
    // post, not two. Keyed on member AND requestId so a client cannot replay
    // someone else's key.
    var idemKey = 'idem:' + ctx.member.memberId + ':' + (ctx.requestId || '');
    if (ctx.requestId) {
      var previous = CacheClient.get(idemKey);
      if (previous) return previous;
    }

    var result = SubmissionFlow.create(ctx.member, Validate.str(ctx.payload.link, 500));

    var response = {
      submission: {
        submissionId: result.submission.submissionId,
        platform: result.submission.platform,
        contentLink: result.submission.contentLink,
        timestamp: result.submission.timestamp,
        dayKey: result.submission.dayKey,
      },
      statsSettling: Boolean(result.statsSettling),
      newMilestones: (result.newMilestones || []).map(publicMilestone_),
      levelUp: result.levelUp || null,
    };

    if (!result.statsSettling) {
      response.stats = {
        postsThisWeek: result.week.postCount,
        weeklyGoal: result.week.goalAtWeek,
        distinctDays: result.week.distinctDays,
        goalMet: result.week.goalMet,
        currentWeekStreak: result.streaks.current,
        longestWeekStreak: result.streaks.longest,
        allTimePosts: ctx.member.allTimePosts,
        activeDays: result.calendar.activeDays,
      };
    }

    if (ctx.requestId) {
      CacheClient.put(idemKey, response, DEFAULTS.IDEMPOTENCY_WINDOW_SECONDS);
    }

    return response;
  }

  function createAction(ctx) {
    Validate.required(ctx.payload, ['title']);

    var idemKey = 'idem:action:' + ctx.member.memberId + ':' + (ctx.requestId || '');
    if (ctx.requestId) {
      var previous = CacheClient.get(idemKey);
      if (previous) return previous;
    }

    var result = SubmissionFlow.create(ctx.member, '', {
      title: Validate.str(ctx.payload.title, 160),
      evidence: Validate.str(ctx.payload.evidence || '', 500),
    });

    var response = {
      action: {
        actionId: result.submission.submissionId,
        title: result.submission.actionTitle,
        evidence: result.submission.evidence,
        timestamp: result.submission.timestamp,
        dayKey: result.submission.dayKey,
      },
      statsSettling: Boolean(result.statsSettling),
      newMilestones: (result.newMilestones || []).map(publicMilestone_),
      levelUp: result.levelUp || null,
    };

    if (!result.statsSettling) {
      response.stats = {
        actionsThisWeek: result.week.postCount,
        weeklyGoal: result.week.goalAtWeek,
        distinctDays: result.week.distinctDays,
        goalMet: result.week.goalMet,
        currentWeekStreak: result.streaks.current,
        longestWeekStreak: result.streaks.longest,
        allTimeActions: ctx.member.allTimePosts,
        activeDays: result.calendar.activeDays,
      };
    }

    if (ctx.requestId) CacheClient.put(idemKey, response, DEFAULTS.IDEMPOTENCY_WINDOW_SECONDS);
    return response;
  }

  return { create: create, createAction: createAction };
})();

var AdaptationController = (function () {
  function propose(ctx) {
    Validate.required(ctx.payload, ['constraint']);
    return { proposal: FlowAdaptService.propose(ctx.member, Validate.str(ctx.payload.constraint, 500)) };
  }

  function accept(ctx) {
    Validate.required(ctx.payload, ['proposalId', 'today']);
    return FlowAdaptService.accept(ctx.member, {
      proposalId: ctx.payload.proposalId,
      category: ctx.payload.category,
      today: ctx.payload.today,
    });
  }

  return { propose: propose, accept: accept };
})();

var LeaderboardController = (function () {
  function get(ctx) {
    var scope = ['week', 'month', 'allTime'].indexOf(ctx.payload.scope) !== -1
      ? ctx.payload.scope
      : 'week';

    var sortBy = ['posts', 'currentStreak', 'longestStreak'].indexOf(ctx.payload.sortBy) !== -1
      ? ctx.payload.sortBy
      : 'posts';

    var weekStart = FtWeek.weekStartKey(new Date(), TIMEZONE);
    var entries = LeaderboardService.build(scope, sortBy, weekStart);
    var callerId = ctx.member.memberId;

    // Mark the caller's own row so the UI can highlight it without needing to
    // know its own member id.
    entries.forEach(function (entry) {
      entry.isSelf = entry.memberId === callerId;
    });

    // How many active members have not posted in scope. Shown as an
    // invitation — "there is still time" — never as a list of names. Community
    // before competition: nobody is displayed for not having started.
    var activeCount = MemberRepo.all().filter(function (member) {
      return member.status === MEMBER_STATUS.ACTIVE;
    }).length;

    return {
      scope: scope,
      sortBy: sortBy,
      weekStart: weekStart,
      entries: entries,
      rank: LeaderboardService.rankOf(entries, callerId),
      unrankedCount: Math.max(0, activeCount - entries.length),
    };
  }

  return { get: get };
})();

/* ==========================================================================
   AdminController
   ========================================================================== */

var AdminController = (function () {
  /** Community Overview: the metric cards plus this week's standings. */
  function overview(ctx) {
    var weekStart = FtWeek.weekStartKey(new Date(), TIMEZONE);
    var board = LeaderboardService.build('week', 'posts', weekStart);

    return {
      weekStart: weekStart,
      metrics: AnalyticsService.overview(weekStart),
      leaderboard: board.slice(0, 5),
      leaderboardTotal: board.length,
    };
  }

  function analytics(ctx) {
    return AnalyticsService.series(Validate.int(ctx.payload.weeks, 12));
  }

  function listMembers(ctx) {
    var paging = Validate.page(ctx.payload);
    var search = Validate.str(ctx.payload.search, 60).toLowerCase();

    var rows = MemberRepo.all().filter(function (member) {
      if (ctx.payload.platform && member.platform !== ctx.payload.platform) return false;
      if (ctx.payload.status && member.status !== ctx.payload.status) return false;
      if (ctx.payload.role && member.role !== ctx.payload.role) return false;
      if (ctx.payload.weeklyGoal && member.weeklyGoal !== Number(ctx.payload.weeklyGoal)) return false;

      if (search) {
        var haystack = (member.fullName + ' ' + member.username).toLowerCase();
        if (haystack.indexOf(search) === -1) return false;
      }

      return true;
    });

    var start = (paging.page - 1) * paging.pageSize;

    return {
      // Contact details are absent from list views. Revealing a phone number
      // should be a deliberate act, not a side effect of scrolling.
      entries: rows.slice(start, start + paging.pageSize).map(MemberService.toPublic),
      total: rows.length,
      page: paging.page,
      pageSize: paging.pageSize,
    };
  }

  function getMember(ctx) {
    Validate.required(ctx.payload, ['memberId']);

    // Two capabilities, because this returns two different kinds of thing.
    // The action table gates the record on `member:read:all`; the Stage 2
    // profile below is contact detail — WhatsApp number, email, bio — and
    // api.md has always specified `profile:read:all` for it.
    //
    // Nothing changes for the roles that exist today: both Community Manager
    // and Super Admin hold it. The point is that the separation the capability
    // matrix already describes is now actually enforced, so a future role
    // granted `member:read:all` does not silently inherit access to PII.
    Authorize.check(ctx, 'profile:read:all');

    var member = MemberService.requireById(String(ctx.payload.memberId));

    // PII access is logged. Members hand over WhatsApp numbers on the promise
    // of a close-knit community; "who looked at this" should be answerable.
    AuditService.record(ctx, 'MEMBER_READ', { targetId: member.memberId, result: 'READ' });

    var snap = MilestoneService.snapshot(member);
    var weekStart = FtWeek.weekStartKey(new Date(), TIMEZONE);
    var weeks = SettingsService.calendarWeeks();
    var fromKey = FtWeek.shiftDayKey(weekStart, -(weeks - 1) * 7);
    var toKey = FtWeek.shiftDayKey(weekStart, 6);

    return {
      member: MemberService.toPublic(member),
      profile: ProfileService.get(member.memberId),
      stats: {
        activeDays: snap.activeDays,
        perfectWeeks: snap.perfectWeeks,
        bestRank: snap.bestRankFinal,
      },
      // The same calendar the member sees, so an admin reviewing someone reads
      // exactly what that member reads.
      calendar: {
        from: fromKey,
        to: toKey,
        today: FtWeek.dayKey(new Date(), TIMEZONE),
        counts: CalendarService.countsForRange(member.memberId, fromKey, toKey),
      },
      recent: SubmissionService.recentForMember(member.memberId, 10),
    };
  }

  function updateMember(ctx) {
    Validate.required(ctx.payload, ['memberId']);
    var member = MemberService.requireById(String(ctx.payload.memberId));
    var patch = {};

    if (ctx.payload.fullName !== undefined) {
      patch.fullName = Validate.str(ctx.payload.fullName, 60);
    }

    // Usernames are editable by admins only — members cannot change their own.
    if (ctx.payload.username !== undefined) {
      var username = Validate.str(ctx.payload.username, 20);
      AuthService.assertUsernameValid(username);

      var key = FtIdentity.usernameKey(username);
      var existing = MemberRepo.findByUsernameKey(key);

      if (existing && existing.memberId !== member.memberId) {
        throw fail_('USERNAME_TAKEN', undefined, { field: 'username' });
      }

      patch.username = username;
      patch.usernameKey = key;
    }

    if (ctx.payload.platform !== undefined) {
      if (PLATFORMS.indexOf(ctx.payload.platform) === -1) {
        throw fail_('VALIDATION_FAILED', 'Pick one of the listed platforms.', { field: 'platform' });
      }
      patch.platform = ctx.payload.platform;
    }

    if (ctx.payload.weeklyGoal !== undefined) {
      var goal = Validate.int(ctx.payload.weeklyGoal, 0);
      if (WEEKLY_GOALS.indexOf(goal) === -1) {
        throw fail_('VALIDATION_FAILED', 'Pick one of the weekly goals.', { field: 'weeklyGoal' });
      }
      patch.weeklyGoal = goal;
    }

    MemberRepo.update(member.rowIndex, patch);
    CacheClient.invalidateMember(member.memberId);
    AuditService.record(ctx, 'MEMBER_UPDATE', { targetId: member.memberId, details: patch });

    return { member: MemberService.toPublic(MemberService.requireById(member.memberId)) };
  }

  function setStatus(ctx) {
    Validate.required(ctx.payload, ['memberId', 'status']);
    var member = MemberService.requireById(String(ctx.payload.memberId));
    var status = String(ctx.payload.status);

    if (status !== MEMBER_STATUS.ACTIVE && status !== MEMBER_STATUS.INACTIVE) {
      throw fail_('VALIDATION_FAILED', 'Status must be Active or Inactive.', { field: 'status' });
    }

    // Without this, one misclick locks everyone out of the admin dashboard
    // permanently, recoverable only by hand-editing a sheet.
    if (status === MEMBER_STATUS.INACTIVE) {
      assertNotLastSuperAdmin_(member);
    }

    MemberRepo.update(member.rowIndex, { status: status });

    if (status === MEMBER_STATUS.INACTIVE) SessionService.revokeAll(member.memberId);

    CacheClient.invalidateMember(member.memberId);
    AuditService.record(ctx, 'MEMBER_STATUS', { targetId: member.memberId, details: { status: status } });

    return { ok: true, status: status };
  }

  function resetPin(ctx) {
    Validate.required(ctx.payload, ['memberId', 'tempPin']);
    var member = MemberService.requireById(String(ctx.payload.memberId));

    AuthService.assertPinValid(String(ctx.payload.tempPin), 'tempPin');
    var credentials = AuthService.hashNewPin(String(ctx.payload.tempPin));

    MemberRepo.update(member.rowIndex, {
      pinHash: credentials.hash,
      pinSalt: credentials.salt,
      // The admin knows this PIN, so the member must replace it before
      // anything else is permitted.
      mustChangePin: true,
      failedLoginCount: 0,
      nextAttemptAt: '',
    });

    SessionService.revokeAll(member.memberId);
    AuditService.record(ctx, 'PIN_RESET', { targetId: member.memberId });

    return { ok: true };
  }

  function setRole(ctx) {
    Authorize.requireSuperAdmin(ctx);
    Validate.required(ctx.payload, ['memberId', 'role']);

    var member = MemberService.requireById(String(ctx.payload.memberId));
    var role = String(ctx.payload.role);

    if (!CAPABILITIES[role]) {
      throw fail_('VALIDATION_FAILED', 'That is not a role.', { field: 'role' });
    }

    // No self-escalation, and no self-demotion that could strand the account.
    if (member.memberId === ctx.member.memberId) {
      throw fail_('FORBIDDEN', 'You cannot change your own role.');
    }

    if (member.role === ROLES.SUPER_ADMIN && role !== ROLES.SUPER_ADMIN) {
      assertNotLastSuperAdmin_(member);
    }

    MemberRepo.update(member.rowIndex, { role: role });
    // A role change must take effect immediately, not whenever their session
    // happens to lapse.
    SessionService.revokeAll(member.memberId);
    CacheClient.invalidateMember(member.memberId);
    AuditService.record(ctx, 'ROLE_CHANGE', { targetId: member.memberId, details: { role: role } });

    return { ok: true, role: role };
  }

  function deleteMember(ctx) {
    Authorize.requireSuperAdmin(ctx);
    Validate.required(ctx.payload, ['memberId']);

    var member = MemberService.requireById(String(ctx.payload.memberId));
    assertNotLastSuperAdmin_(member);

    // Deleting a member with history orphans ledger rows and silently rewrites
    // everyone else's historical standings. Deactivation is offered instead.
    var history = SubmissionRepo.byMember(member.memberId).length;
    if (history > 0 && !ctx.payload.confirm) {
      throw fail_(
        'VALIDATION_FAILED',
        'This member has ' + history + ' logged posts. Deactivate them instead, or confirm to delete.',
      );
    }

    SessionService.revokeAll(member.memberId);
    MemberRepo.remove(member.rowIndex);
    AuditService.record(ctx, 'MEMBER_DELETE', {
      targetId: member.memberId,
      details: { username: member.username, submissions: history },
    });

    return { ok: true };
  }

  function listSubmissions(ctx) {
    var paging = Validate.page(ctx.payload);
    var search = Validate.str(ctx.payload.search, 60).toLowerCase();

    var rows = SubmissionRepo.active().filter(function (row) {
      if (ctx.payload.memberId && row.memberId !== ctx.payload.memberId) return false;
      if (ctx.payload.platform && row.platform !== ctx.payload.platform) return false;
      if (ctx.payload.weekStart && row.weekStart !== ctx.payload.weekStart) return false;
      if (search && (row.name + ' ' + row.username).toLowerCase().indexOf(search) === -1) return false;
      return true;
    });

    rows.sort(function (a, b) { return String(b.timestamp).localeCompare(String(a.timestamp)); });

    var start = (paging.page - 1) * paging.pageSize;

    return {
      entries: rows.slice(start, start + paging.pageSize).map(function (row) {
        return {
          submissionId: row.submissionId,
          timestamp: row.timestamp,
          memberId: row.memberId,
          name: row.name,
          username: row.username,
          platform: row.platform,
          contentLink: row.contentLink,
          weekNumber: row.weekNumber,
          weekStart: row.weekStart,
        };
      }),
      total: rows.length,
      page: paging.page,
      pageSize: paging.pageSize,
    };
  }

  function voidSubmission(ctx) {
    Validate.required(ctx.payload, ['submissionId']);

    var target = null;
    SubmissionRepo.all().forEach(function (row) {
      if (row.submissionId === String(ctx.payload.submissionId)) target = row;
    });

    if (!target) throw fail_('NOT_FOUND');

    SubmissionRepo.voidSubmission(target.rowIndex);
    Reconcile.member(target.memberId);

    AuditService.record(ctx, 'SUBMISSION_VOID', {
      targetId: target.memberId,
      details: { submissionId: target.submissionId },
    });

    return { ok: true };
  }

  function createInvites(ctx) {
    var count = Validate.int(ctx.payload.count, 1);

    var created = InviteService.generate(count, {
      expiresInDays: ctx.payload.expiresInDays,
      note: Validate.str(ctx.payload.note, 80),
    }, ctx);

    return {
      codes: created.map(function (invite) {
        return { code: invite.code, expiresAt: invite.expiresAt, note: invite.note };
      }),
    };
  }

  function listInvites(ctx) {
    return { entries: InviteService.list({ status: ctx.payload.status }) };
  }

  function revokeInvite(ctx) {
    Validate.required(ctx.payload, ['code']);
    InviteService.revoke(String(ctx.payload.code), ctx);
    return { ok: true };
  }

  function getSettings(ctx) {
    return { entries: SettingsService.list() };
  }

  function updateSetting(ctx) {
    Authorize.requireSuperAdmin(ctx);
    Validate.required(ctx.payload, ['key']);

    SettingsService.set(String(ctx.payload.key), ctx.payload.value, ctx.member.memberId);
    AuditService.record(ctx, 'SETTINGS_UPDATE', {
      details: { key: ctx.payload.key, value: ctx.payload.value },
    });

    return { ok: true };
  }

  function listAudit(ctx) {
    Authorize.requireSuperAdmin(ctx);
    return { entries: AuditService.list(Validate.int(ctx.payload.limit, 200)) };
  }

  function reconcileMember(ctx) {
    Validate.required(ctx.payload, ['memberId']);
    var result = Reconcile.member(String(ctx.payload.memberId));
    AuditService.record(ctx, 'RECONCILE', { targetId: String(ctx.payload.memberId) });
    return result;
  }

  return {
    overview: overview,
    analytics: analytics,
    listMembers: listMembers,
    getMember: getMember,
    updateMember: updateMember,
    setStatus: setStatus,
    resetPin: resetPin,
    setRole: setRole,
    deleteMember: deleteMember,
    listSubmissions: listSubmissions,
    voidSubmission: voidSubmission,
    createInvites: createInvites,
    listInvites: listInvites,
    revokeInvite: revokeInvite,
    getSettings: getSettings,
    updateSetting: updateSetting,
    listAudit: listAudit,
    reconcileMember: reconcileMember,
  };
})();

/* ==========================================================================
   Shared helpers
   ========================================================================== */

/**
 * Refuse any change that would leave zero active Super Admins.
 *
 * @throws {AppError} LAST_SUPER_ADMIN
 */
function assertNotLastSuperAdmin_(member) {
  if (member.role !== ROLES.SUPER_ADMIN) return;
  if (member.status !== MEMBER_STATUS.ACTIVE) return;
  if (MemberRepo.countActiveSuperAdmins() > 1) return;

  throw fail_('LAST_SUPER_ADMIN');
}

/** The wire shape of a milestone. */
function publicMilestone_(milestone) {
  return {
    milestoneId: milestone.milestoneId,
    name: milestone.name,
    description: milestone.description,
    category: milestone.category,
    iconId: milestone.iconId,
    rarity: milestone.rarity,
  };
}
