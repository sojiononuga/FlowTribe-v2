/**
 * Scheduled jobs.
 *
 * All time-driven, all installed by setup/Triggers.gs so the schedule is
 * version-controlled rather than clicked into the UI.
 *
 * Every job is idempotent. Apps Script terminates at six minutes with no
 * warning, and a job that cannot safely be re-run leaves the system in a state
 * nobody can reason about.
 *
 * @see docs/backend-architecture.md §7
 */

/* ==========================================================================
   Reconcile — the self-healing pass
   ========================================================================== */

var Reconcile = (function () {
  /**
   * Rebuild every derived value for one member from the ledger.
   *
   * This is what makes denormalisation safe. `Submissions` is the only source
   * of truth; counters, the day map, and weekly stats are a cache that can
   * always be regenerated. If someone hand-edits a cell, this restores it.
   *
   * @param {string} memberId
   * @returns {Object} what changed
   */
  function member(memberId) {
    var target = MemberRepo.findById(memberId);
    if (!target) throw fail_('NOT_FOUND');

    var submissions = SubmissionRepo.byMember(memberId);
    var currentWeekStart = FtWeek.weekStartKey(new Date(), TIMEZONE);

    // --- Rebuild each year's day map ---
    var years = {};
    submissions.forEach(function (row) { years[row.year] = true; });
    Object.keys(years).forEach(function (year) {
      CalendarService.rebuildYear(memberId, Number(year), submissions);
    });

    // --- Rebuild weekly stats ---
    var byWeek = {};
    submissions.forEach(function (row) {
      if (!byWeek[row.weekStart]) {
        byWeek[row.weekStart] = { count: 0, days: {}, goal: row.goalAtSubmission };
      }
      byWeek[row.weekStart].count += 1;
      byWeek[row.weekStart].days[row.dayKey] = true;
    });

    Object.keys(byWeek).forEach(function (weekStart) {
      var week = byWeek[weekStart];
      var existing = WeeklyStatsRepo.find(memberId, weekStart);

      WeeklyStatsRepo.upsert({
        memberId: memberId,
        weekStart: weekStart,
        postCount: week.count,
        distinctDays: Object.keys(week.days).length,
        // Preserve the goal that applied at the time. A member who upgrades
        // from 3 to 7 must not have their history retroactively rewritten.
        goalAtWeek: existing ? existing.goalAtWeek : week.goal,
        goalMet: week.count >= (existing ? existing.goalAtWeek : week.goal),
      });
    });

    // --- Rebuild counters ---
    var streaks = WeeklyStatsService.streaks(memberId, currentWeekStart);
    var perfectWeeks = WeeklyStatsService.perfectWeekCount(memberId);

    var last = submissions.reduce(function (latest, row) {
      return !latest || row.timestamp > latest ? row.timestamp : latest;
    }, '');

    MemberRepo.update(target.rowIndex, {
      allTimePosts: submissions.length,
      currentWeekStreak: streaks.current,
      longestWeekStreak: streaks.longest,
      perfectWeeks: perfectWeeks,
      lastSubmissionDate: last,
    });

    CacheClient.invalidateMember(memberId);

    return {
      memberId: memberId,
      allTimePosts: submissions.length,
      currentWeekStreak: streaks.current,
      longestWeekStreak: streaks.longest,
      perfectWeeks: perfectWeeks,
    };
  }

  /**
   * Reconcile everyone, resumably.
   *
   * Apps Script kills an execution at six minutes with no warning. A truncated
   * reconcile would leave some members repaired and others not, WITH NO SIGNAL
   * — the worst kind of failure, because it is invisible. The cursor and the
   * completion audit row make a partial run detectable and self-resuming.
   */
  function all() {
    var started = Date.now();
    var budgetMs = 4 * 60 * 1000;

    var props = PropertiesService.getScriptProperties();
    var cursor = Number(props.getProperty('FT_RECONCILE_CURSOR') || 0);

    var members = MemberRepo.all();
    var processed = 0;

    for (var i = cursor; i < members.length; i += 1) {
      if (Date.now() - started > budgetMs) {
        props.setProperty('FT_RECONCILE_CURSOR', String(i));
        AuditRepo.append({
          actorId: 'SYSTEM', actorRole: 'System', action: 'RECONCILE_PARTIAL',
          details: { resumeAt: i, of: members.length }, result: 'PARTIAL',
        });
        return { processed: processed, resumeAt: i, complete: false };
      }

      try {
        member(members[i].memberId);
        processed += 1;
      } catch (error) {
        Logger_.error('reconcile', error, { memberId: members[i].memberId });
      }
    }

    props.deleteProperty('FT_RECONCILE_CURSOR');
    AuditRepo.append({
      actorId: 'SYSTEM', actorRole: 'System', action: 'RECONCILE_COMPLETE',
      details: { processed: processed },
    });

    return { processed: processed, complete: true };
  }

  return { member: member, all: all };
})();

/* ==========================================================================
   Trigger entry points
   --------------------------------------------------------------------------
   Named functions, because a trigger binds to a name. Each wraps its work so
   a failure is logged rather than silently swallowed by the trigger runner.
   ========================================================================== */

/**
 * Monday 00:05 — close the week that just ended.
 *
 * Runs AFTER the boundary. A member on Monday morning has zero posts;
 * evaluating streaks at midnight would reset every streak in the community
 * every week. A streak breaks when a week CLOSES unmet.
 */
function jobWeeklyRollover() {
  try {
    var currentWeekStart = FtWeek.weekStartKey(new Date(), TIMEZONE);
    var closedWeekStart = FtWeek.shiftDayKey(currentWeekStart, -7);

    var result = WeekCloseFlow.close(closedWeekStart);
    Logger_.info('job:rollover', 'closed ' + closedWeekStart, result);
  } catch (error) {
    Logger_.error('job:rollover', error);
  }
}

/** 01:00 — rebuild every derived value from the ledger. */
function jobNightlyReconcile() {
  try {
    var result = Reconcile.all();
    Logger_.info('job:reconcile', 'processed ' + result.processed, result);
  } catch (error) {
    Logger_.error('job:reconcile', error);
  }
}

/**
 * Every 15 minutes — repair members marked ROLLUP_PENDING.
 *
 * The nightly reconcile makes denormalisation safe eventually. The gap is the
 * 24 hours in between: if a ledger append succeeded but a counter update
 * failed, a member sees a post that did not count — the exact v1 defect this
 * rebuild exists to eliminate, arriving by another route. This closes it to
 * minutes.
 */
function jobRollupRepair() {
  try {
    var pending = {};

    AuditRepo.list(300).forEach(function (row) {
      if (row.action === 'ROLLUP_PENDING' && row.targetId) pending[row.targetId] = true;
    });

    var repaired = 0;
    Object.keys(pending).forEach(function (memberId) {
      try {
        Reconcile.member(memberId);
        repaired += 1;
      } catch (error) {
        Logger_.error('job:repair', error, { memberId: memberId });
      }
    });

    if (repaired) {
      AuditRepo.append({
        actorId: 'SYSTEM', actorRole: 'System', action: 'ROLLUP_REPAIRED',
        details: { count: repaired },
      });
    }
  } catch (error) {
    Logger_.error('job:repair', error);
  }
}

/** 02:00 — delete expired and revoked sessions. Stateless; a missed run costs rows. */
function jobSessionSweep() {
  try {
    var removed = SessionRepo.deleteExpired();
    Logger_.info('job:sessions', 'removed ' + removed);
  } catch (error) {
    Logger_.error('job:sessions', error);
  }
}

/** 02:15 — mark stale invite codes expired. Redemption also checks, so this is cosmetic. */
function jobInviteExpiry() {
  try {
    var expired = InviteService.expireStale();
    Logger_.info('job:invites', 'expired ' + expired);
  } catch (error) {
    Logger_.error('job:invites', error);
  }
}

/**
 * 23:45 — snapshot today's community numbers.
 *
 * Turns "posts per day for 90 days" into a 90-row read instead of a full
 * ledger scan, so admin analytics stay constant-cost as the ledger grows.
 */
function jobDailyRollup() {
  try {
    var todayKey = FtWeek.dayKey(new Date(), TIMEZONE);
    var weekStart = FtWeek.weekStartKey(new Date(), TIMEZONE);

    var submissions = SubmissionRepo.active();
    var todays = submissions.filter(function (row) { return row.dayKey === todayKey; });

    var platforms = {};
    todays.forEach(function (row) {
      platforms[row.platform] = (platforms[row.platform] || 0) + 1;
    });

    var members = MemberRepo.all();
    var activeMembers = {};
    todays.forEach(function (row) { activeMembers[row.memberId] = true; });

    CommunityStatsRepo.upsertForDate(todayKey, {
      posts: todays.length,
      activeMembers: Object.keys(activeMembers).length,
      newMembers: members.filter(function (m) {
        return m.joinDate && m.joinDate.slice(0, 10) === todayKey;
      }).length,
      goalHits: WeeklyStatsRepo.forWeek(weekStart).filter(function (row) {
        return row.goalMet;
      }).length,
      platforms: platforms,
    });

    Logger_.info('job:rollup', todayKey + ' posts=' + todays.length);
  } catch (error) {
    Logger_.error('job:rollup', error);
  }
}
