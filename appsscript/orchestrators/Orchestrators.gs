/**
 * The orchestration layer.
 *
 * Multi-service workflows live here, not inside a service. This was the
 * Phase 3 review's headline finding (W1/W2): `SubmissionService` was
 * coordinating seven collaborators inside one method, which coupled them all
 * and made the ordering implicit in statement sequence.
 *
 * Each flow is an explicit list of steps. Steps take a context object and
 * mutate it. The runner handles ordering, timing, and failure marking, so:
 *
 *   - a step is individually readable and individually replaceable
 *   - the order is declared rather than inferred
 *   - a future celebration feature is an entry in a list, not a longer method
 *   - timing per step comes free, which is what makes the latency budget in
 *     backend-review.md §P1 measurable rather than estimated
 *
 * @see docs/backend-architecture.md §4.1
 */

/* ==========================================================================
   Pipeline — the step runner
   ========================================================================== */

var Pipeline = (function () {
  /**
   * Run steps in order against a shared context.
   *
   * @param {string} name for logging
   * @param {Array<{name: string, run: Function}>} steps
   * @param {Object} context
   * @returns {Object} the context, after every step
   */
  function run(name, steps, context) {
    var started = Date.now();
    var timings = [];

    for (var i = 0; i < steps.length; i += 1) {
      var step = steps[i];
      var stepStarted = Date.now();

      try {
        step.run(context);
      } catch (error) {
        // An expected failure propagates untouched — the caller decides.
        // An unexpected one is annotated with the step that produced it,
        // which is the difference between a five-minute diagnosis and an hour.
        if (isAppError_(error)) throw error;

        Logger_.error('pipeline:' + name, error, { step: step.name, timings: timings });
        error.failedStep = step.name;
        throw error;
      }

      timings.push(step.name + '=' + (Date.now() - stepStarted) + 'ms');
    }

    Logger_.info('pipeline:' + name, 'completed in ' + (Date.now() - started) + 'ms', {
      steps: timings.join(' '),
    });

    return context;
  }

  return { run: run };
})();

/* ==========================================================================
   RegistrationFlow
   ========================================================================== */

var RegistrationFlow = (function () {
  /**
   * Create an account.
   *
   * Invite validation, invite redemption, the username uniqueness check, and
   * the member insert all happen inside ONE lock. Two separate check-then-act
   * races live here — the same code redeemed twice, the same username claimed
   * twice — and Sheets has no unique constraints, so the lock is the only
   * thing preventing a duplicate. Grouping them also means a failed
   * registration never burns a valid code.
   *
   * @param {Object} input
   * @param {string} userAgent
   * @returns {{member: Object, token: string, expiresAt: string}}
   */
  function register(input, userAgent) {
    // Cheap validation first, outside the lock. Most failures happen here and
    // should not wait on, or hold, a lock.
    AuthService.assertUsernameValid(input.username);
    AuthService.assertPinValid(input.pin);

    if (input.pin !== input.pinConfirm) {
      throw fail_('PIN_MISMATCH', undefined, { field: 'pinConfirm' });
    }

    var fullName = String(input.fullName || '').trim();
    if (fullName.length < 2 || fullName.length > 60) {
      throw fail_('VALIDATION_FAILED', 'Enter your full name.', { field: 'fullName' });
    }

    if (PLATFORMS.indexOf(input.platform) === -1) {
      throw fail_('VALIDATION_FAILED', 'Pick one of the listed platforms.', { field: 'platform' });
    }

    var goal = Number(input.weeklyGoal);
    if (WEEKLY_GOALS.indexOf(goal) === -1) {
      throw fail_('VALIDATION_FAILED', 'Pick one of the weekly goals.', { field: 'weeklyGoal' });
    }

    var credentials = AuthService.hashNewPin(input.pin);
    var context = { input: input, fullName: fullName, goal: goal, credentials: credentials };

    LockClient.withLock('registration', function () {
      Pipeline.run('registration', [
        {
          name: 'validateInvite',
          run: function (ctx) {
            ctx.invite = InviteService.assertRedeemable(ctx.input.inviteCode);
          },
        },
        {
          name: 'claimUsername',
          run: function (ctx) {
            var key = FtIdentity.usernameKey(ctx.input.username);
            if (MemberRepo.usernameKeyExists(key)) {
              throw fail_('USERNAME_TAKEN', undefined, { field: 'username' });
            }
            ctx.usernameKey = key;
          },
        },
        {
          name: 'insertMember',
          run: function (ctx) {
            ctx.member = MemberRepo.insert({
              memberId: MemberRepo.nextId(),
              username: String(ctx.input.username).trim(),
              usernameKey: ctx.usernameKey,
              fullName: ctx.fullName,
              pinHash: ctx.credentials.hash,
              pinSalt: ctx.credentials.salt,
              platform: ctx.input.platform,
              weeklyGoal: ctx.goal,
              joinDate: nowIso_(),
              status: MEMBER_STATUS.ACTIVE,
              // Role is never taken from the payload. If registration accepted
              // one, anyone with an invite could create a Super Admin.
              role: ROLES.MEMBER,
              consentFeature: Boolean(ctx.input.consentFeature),
              mustChangePin: false,
              inviteCodeUsed: ctx.invite.code,
              flowLevelId: 'seedling',
            });
          },
        },
        {
          name: 'redeemInvite',
          run: function (ctx) {
            InviteRepo.markUsed(ctx.invite.rowIndex, ctx.member.memberId);
          },
        },
        {
          name: 'seedCalendar',
          run: function (ctx) {
            CalendarService.ensureYear(ctx.member.memberId, FtWeek.yearOf(FtWeek.dayKey(new Date(), TIMEZONE)));
          },
        },
        {
          name: 'awardFoundingMember',
          run: function (ctx) {
            var snap = MilestoneService.snapshot(ctx.member, {
              allTimePosts: 0, activeDays: 0, goalsMetCount: 0, perfectWeeks: 0,
              currentWeekStreak: 0, longestWeekStreak: 0,
              postsThisWeek: 0, distinctDaysThisWeek: 0, bestRankFinal: null,
            });
            ctx.milestones = MilestoneService.evaluate(ctx.member, snap, { source: 'registration' });
          },
        },
      ], context);
    });

    // The session is created outside the lock: it touches no contended state,
    // and holding a lock across it would only lengthen the critical section.
    var session = SessionService.create(context.member, userAgent);

    AuditService.record(context.member, 'REGISTER', {
      details: { invite: context.invite.code, platform: context.input.platform },
    });

    return {
      member: context.member,
      token: session.token,
      expiresAt: session.expiresAt,
      milestones: context.milestones || [],
    };
  }

  return { register: register };
})();

/* ==========================================================================
   LoginFlow
   ========================================================================== */

var LoginFlow = (function () {
  /**
   * Authenticate.
   *
   * `AUTH_FAILED` is returned identically for an unknown username and a wrong
   * PIN. Distinguishing them hands an attacker a list of valid usernames.
   */
  function login(username, pin, userAgent) {
    var member = MemberRepo.findByUsernameKey(username);

    if (!member) {
      // Hash anyway, against a throwaway salt, so a missing account and a
      // wrong PIN take comparable time. Otherwise response timing reveals
      // which usernames exist.
      Crypto.hashPin(String(pin || ''), 'absent', SettingsService.hashIterations());
      AuditService.record(null, 'LOGIN_FAILED', {
        details: { username: String(username || '').slice(0, 40) },
        result: 'FAILURE',
      });
      throw fail_('AUTH_FAILED');
    }

    AuthService.assertNotThrottled(member);

    if (member.status !== MEMBER_STATUS.ACTIVE) {
      throw fail_('ACCOUNT_INACTIVE');
    }

    if (!AuthService.verifyPin(pin, member)) {
      var failures = AuthService.recordFailure(member);
      AuditService.record(member, 'LOGIN_FAILED', {
        targetId: member.memberId,
        details: { failures: failures },
        result: 'FAILURE',
      });
      throw fail_('AUTH_FAILED');
    }

    AuthService.clearFailures(member);

    var session = SessionService.create(member, userAgent);
    AuditService.record(member, 'LOGIN');

    return {
      member: member,
      token: session.token,
      expiresAt: session.expiresAt,
      mustChangePin: member.mustChangePin,
    };
  }

  return { login: login };
})();

/* ==========================================================================
   SubmissionFlow — the busiest path in the system
   ========================================================================== */

var SubmissionFlow = (function () {
  /**
   * Log a post.
   *
   * The ledger is written FIRST. If any later step fails, the fact is recorded
   * and the rollups lag — a `ROLLUP_PENDING` marker lets the repair job close
   * the gap within fifteen minutes. The reverse order would produce counters
   * describing a post that does not exist.
   *
   * @returns {{submission, stats, newMilestones, levelUp, statsSettling}}
   */
  function create(member, rawLink) {
    // Outside the lock: validation is where most failures happen, and a
    // rejected duplicate should neither wait on nor hold a lock.
    var validated = SubmissionService.validate(member, rawLink);

    var context = { member: member, validated: validated, milestones: [], levelUp: null };

    try {
      LockClient.withLock('member:' + member.memberId, function () {
        Pipeline.run('submission', [
          {
            name: 'appendLedger',
            run: function (ctx) {
              ctx.row = SubmissionService.buildRow(ctx.member, ctx.validated);
              SubmissionRepo.append(ctx.row);
              ctx.ledgerWritten = true;
            },
          },
          {
            name: 'updateCalendar',
            run: function (ctx) {
              ctx.calendar = CalendarService.recordDay(ctx.member.memberId, ctx.row.dayKey);
            },
          },
          {
            name: 'updateWeeklyStats',
            run: function (ctx) {
              ctx.week = WeeklyStatsService.recordPost(ctx.member, ctx.row.weekStart, ctx.row.dayKey);
            },
          },
          {
            name: 'updateCounters',
            run: function (ctx) {
              var streaks = WeeklyStatsService.streaks(ctx.member.memberId, ctx.row.weekStart);
              ctx.streaks = streaks;
              ctx.perfectWeeks = WeeklyStatsService.perfectWeekCount(ctx.member.memberId);

              // One batched write rather than five. Each separate write is a
              // round trip on the path a member is actively waiting on.
              MemberService.applySubmissionCounters(ctx.member, {
                allTimePosts: ctx.member.allTimePosts + 1,
                currentWeekStreak: streaks.current,
                longestWeekStreak: Math.max(streaks.longest, ctx.member.longestWeekStreak),
                perfectWeeks: ctx.perfectWeeks,
                lastSubmissionDate: ctx.row.timestamp,
              });

              ctx.member.allTimePosts += 1;
              ctx.member.currentWeekStreak = streaks.current;
              ctx.member.longestWeekStreak = Math.max(streaks.longest, ctx.member.longestWeekStreak);
              ctx.member.perfectWeeks = ctx.perfectWeeks;
            },
          },
          {
            name: 'evaluateMilestones',
            run: function (ctx) {
              // Pass what the transaction already computed, so the snapshot
              // does not re-read sheets while holding the lock.
              ctx.snapshot = MilestoneService.snapshot(ctx.member, {
                allTimePosts: ctx.member.allTimePosts,
                activeDays: ctx.calendar.activeDays,
                perfectWeeks: ctx.perfectWeeks,
                currentWeekStreak: ctx.streaks.current,
                longestWeekStreak: ctx.member.longestWeekStreak,
                postsThisWeek: ctx.week.stats.postCount,
                distinctDaysThisWeek: ctx.week.stats.distinctDays,
              });

              ctx.milestones = MilestoneService.evaluate(ctx.member, ctx.snapshot, {
                submissionId: ctx.row.submissionId,
              });
            },
          },
          {
            name: 'evaluateLevel',
            run: function (ctx) {
              var result = FlowLevelService.evaluate(ctx.member, ctx.snapshot);
              ctx.levelUp = result.changed ? result.level : null;
              ctx.level = result;
            },
          },
          {
            name: 'invalidateCaches',
            run: function (ctx) {
              CacheClient.invalidateMember(ctx.member.memberId);
              CacheClient.invalidateWeek(ctx.row.weekStart);
            },
          },
        ], context);
      });
    } catch (error) {
      if (isAppError_(error)) throw error;

      // The post itself succeeded; something downstream did not. Telling a
      // member their post failed when it did not is the exact v1 defect this
      // rebuild exists to eliminate — so the submission is reported as the
      // success it was, and the rollups are repaired out of band.
      if (context.ledgerWritten) {
        AuditRepo.append({
          actorId: member.memberId,
          actorRole: member.role,
          action: 'ROLLUP_PENDING',
          targetId: member.memberId,
          details: { step: error.failedStep || 'unknown', message: String(error.message) },
          result: 'PARTIAL',
        });

        return {
          submission: context.row,
          statsSettling: true,
          newMilestones: [],
          levelUp: null,
        };
      }

      throw error;
    }

    return {
      submission: context.row,
      week: context.week.stats,
      streaks: context.streaks,
      calendar: context.calendar,
      level: context.level,
      newMilestones: context.milestones,
      levelUp: context.levelUp,
      statsSettling: false,
    };
  }

  return { create: create };
})();

/* ==========================================================================
   WeekCloseFlow — Monday rollover
   ========================================================================== */

var WeekCloseFlow = (function () {
  /**
   * Close a week.
   *
   * Runs AFTER the boundary, not on it. A member on Monday morning has zero
   * posts; evaluating streaks at midnight would reset every streak in the
   * community every week. A streak breaks when a week CLOSES unmet.
   *
   * Idempotent by `weekStart` — re-running produces the same result, so a
   * missed run is recovered by the next one.
   */
  function close(closedWeekStart) {
    var stats = WeeklyStatsRepo.forWeek(closedWeekStart);
    if (!stats.length) return { ranked: 0, milestones: 0 };

    var members = {};
    MemberRepo.all().forEach(function (member) { members[member.memberId] = member; });

    // Freeze the settled ranking. A "you finished in the Top 10" milestone
    // must be judged against a settled number, not a Tuesday-afternoon one.
    var ranked = FtStreak.rank(
      stats
        .filter(function (row) { return row.postCount > 0 && members[row.memberId]; })
        .map(function (row) { return { memberId: row.memberId, postCount: row.postCount }; }),
      'postCount',
    );

    WeeklyStatsRepo.freezeRanks(closedWeekStart, ranked);

    var currentWeekStart = FtWeek.weekStartKey(new Date(), TIMEZONE);
    var unlocked = 0;

    ranked.forEach(function (entry) {
      var member = members[entry.memberId];
      if (!member) return;

      var streaks = WeeklyStatsService.streaks(member.memberId, currentWeekStart);
      var perfectWeeks = WeeklyStatsService.perfectWeekCount(member.memberId);

      MemberRepo.update(member.rowIndex, {
        currentWeekStreak: streaks.current,
        longestWeekStreak: Math.max(streaks.longest, member.longestWeekStreak),
        perfectWeeks: perfectWeeks,
      });

      var snap = MilestoneService.snapshot(member, {
        perfectWeeks: perfectWeeks,
        currentWeekStreak: streaks.current,
        bestRankFinal: entry.rank,
      });

      unlocked += MilestoneService.evaluate(member, snap, { weekStart: closedWeekStart }).length;
      FlowLevelService.evaluate(member, snap);
      CacheClient.invalidateMember(member.memberId);
    });

    AuditRepo.append({
      actorId: 'SYSTEM',
      actorRole: 'System',
      action: 'WEEK_CLOSE',
      details: { weekStart: closedWeekStart, ranked: ranked.length, milestones: unlocked },
    });

    return { ranked: ranked.length, milestones: unlocked };
  }

  return { close: close };
})();
