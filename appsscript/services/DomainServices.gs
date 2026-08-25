/**
 * Domain services: calendar, weekly stats, leaderboard, milestones, levels,
 * submissions, analytics.
 *
 * These own the rules that decide what counts, what a streak is, and who is
 * celebrated. All of the arithmetic lives in `lib/` — these services fetch,
 * delegate, and persist.
 *
 * @see docs/backend-architecture.md §4, §5
 */

/* ==========================================================================
   CalendarService — the packed day map
   ========================================================================== */

var CalendarService = (function () {
  /**
   * Record one day of activity.
   *
   * @returns {{isNewActiveDay: boolean, activeDays: number}}
   */
  function recordDay(memberId, dayKey) {
    var year = FtWeek.yearOf(dayKey);
    var row = CalendarRepo.find(memberId, year) || CalendarRepo.create(memberId, year);

    var result = FtDayMap.increment(row.dayMap, FtWeek.dayOfYear(dayKey));
    var bounds = FtDayMap.bounds(result.map);
    var activeDays = FtDayMap.activeDays(result.map);

    CalendarRepo.save(
      row.rowIndex,
      result.map,
      activeDays,
      bounds.first ? FtWeek.shiftDayKey(year + '-01-01', bounds.first - 1) : '',
      bounds.last ? FtWeek.shiftDayKey(year + '-01-01', bounds.last - 1) : '',
    );

    return { isNewActiveDay: result.isNewActiveDay, activeDays: activeDays };
  }

  /** Ensure a row exists, so a new member's calendar renders as empty rather than absent. */
  function ensureYear(memberId, year) {
    if (!CalendarRepo.find(memberId, year)) CalendarRepo.create(memberId, year);
  }

  /**
   * Sparse `{ dayKey: count }` for a range.
   *
   * Sparse because a 26-week window typically has 30–80 active days out of
   * 182 — sending the zeroes would triple the payload for no information.
   */
  function countsForRange(memberId, fromKey, toKey) {
    var counts = {};

    CalendarRepo.forMember(memberId).forEach(function (row) {
      var yearCounts = FtDayMap.toCounts(row.dayMap, row.year, FtWeek.shiftDayKey);

      Object.keys(yearCounts).forEach(function (key) {
        if (key >= fromKey && key <= toKey) counts[key] = yearCounts[key];
      });
    });

    return counts;
  }

  /** Lifetime active days — the number the 7/30/100 milestones read. */
  function lifetimeActiveDays(memberId) {
    return CalendarRepo.sumActiveDays(memberId);
  }

  /** Rebuild a year's map from the ledger. Used by the nightly reconcile. */
  function rebuildYear(memberId, year, submissions) {
    var counts = {};

    submissions.forEach(function (row) {
      if (row.year !== year) return;
      counts[row.dayKey] = (counts[row.dayKey] || 0) + 1;
    });

    var map = FtDayMap.fromCounts(counts, year, FtWeek.dayOfYear);
    var existing = CalendarRepo.find(memberId, year) || CalendarRepo.create(memberId, year);
    var bounds = FtDayMap.bounds(map);

    CalendarRepo.save(
      existing.rowIndex,
      map,
      FtDayMap.activeDays(map),
      bounds.first ? FtWeek.shiftDayKey(year + '-01-01', bounds.first - 1) : '',
      bounds.last ? FtWeek.shiftDayKey(year + '-01-01', bounds.last - 1) : '',
    );
  }

  return {
    recordDay: recordDay,
    ensureYear: ensureYear,
    countsForRange: countsForRange,
    lifetimeActiveDays: lifetimeActiveDays,
    rebuildYear: rebuildYear,
  };
})();

/* ==========================================================================
   WeeklyStatsService
   ========================================================================== */

var WeeklyStatsService = (function () {
  /**
   * Record a post against its week.
   *
   * `distinctDays` is what separates meeting a goal from a Perfect Week:
   * three posts on one Saturday meets a goal of 3, but is not the behaviour
   * this product exists to build.
   *
   * @returns {{stats: Object, goalJustMet: boolean, perfectJustEarned: boolean}}
   */
  function recordPost(member, weekStart, dayKey) {
    var existing = WeeklyStatsRepo.find(member.memberId, weekStart);
    var wasGoalMet = existing ? existing.goalMet : false;
    var wasPerfect = existing ? FtStreak.isPerfectWeek(existing) : false;

    var weekSubmissions = SubmissionRepo.byMember(member.memberId).filter(function (row) {
      return row.weekStart === weekStart;
    });

    var days = {};
    weekSubmissions.forEach(function (row) { days[row.dayKey] = true; });
    days[dayKey] = true;

    var stats = {
      memberId: member.memberId,
      weekStart: weekStart,
      postCount: weekSubmissions.length,
      distinctDays: Object.keys(days).length,
      goalAtWeek: existing ? existing.goalAtWeek : member.weeklyGoal,
      goalMet: false,
    };

    stats.goalMet = stats.postCount >= stats.goalAtWeek;

    var saved = WeeklyStatsRepo.upsert(stats);
    var isPerfect = FtStreak.isPerfectWeek(saved);

    return {
      stats: saved,
      goalJustMet: stats.goalMet && !wasGoalMet,
      perfectJustEarned: isPerfect && !wasPerfect,
    };
  }

  /**
   * Current and longest week streaks.
   *
   * The current week never breaks a streak — it only extends one. A member
   * opening the app on Monday morning has not failed anything.
   */
  function streaks(memberId, currentWeekStart) {
    var weeks = WeeklyStatsRepo.forMember(memberId);
    return FtStreak.weekStreaks(weeks, currentWeekStart, FtWeek.shiftDayKey);
  }

  function perfectWeekCount(memberId) {
    return WeeklyStatsRepo.forMember(memberId).filter(FtStreak.isPerfectWeek).length;
  }

  function forWeek(weekStart) {
    return WeeklyStatsRepo.forWeek(weekStart);
  }

  return {
    recordPost: recordPost,
    streaks: streaks,
    perfectWeekCount: perfectWeekCount,
    forWeek: forWeek,
  };
})();

/* ==========================================================================
   LeaderboardService
   ========================================================================== */

var LeaderboardService = (function () {
  /**
   * Ranked standings.
   *
   * Members with zero posts in scope are ABSENT, not ranked last. Ranking
   * someone last for not having started is the opposite of what this product
   * is for.
   */
  function build(scope, sortBy, currentWeekStart) {
    var members = {};
    MemberRepo.all().forEach(function (member) {
      if (member.status === MEMBER_STATUS.ACTIVE) members[member.memberId] = member;
    });

    // Cached and effectively static, so this costs nothing per row.
    var levelsById = {};
    FlowLevelRepo.listOrdered().forEach(function (level) {
      levelsById[level.levelId] = level;
    });

    var rows = [];

    if (scope === 'week') {
      WeeklyStatsRepo.forWeek(currentWeekStart).forEach(function (stat) {
        var member = members[stat.memberId];
        if (!member || stat.postCount <= 0) return;
        rows.push(entry(member, stat.postCount, levelsById));
      });
    } else if (scope === 'month') {
      var counts = {};
      var month = FtWeek.monthOf(currentWeekStart);
      var year = FtWeek.yearOf(currentWeekStart);

      SubmissionRepo.active().forEach(function (row) {
        if (row.month !== month || row.year !== year) return;
        counts[row.memberId] = (counts[row.memberId] || 0) + 1;
      });

      Object.keys(counts).forEach(function (memberId) {
        var member = members[memberId];
        if (member) rows.push(entry(member, counts[memberId], levelsById));
      });
    } else {
      Object.keys(members).forEach(function (memberId) {
        var member = members[memberId];
        if (member.allTimePosts > 0) rows.push(entry(member, member.allTimePosts, levelsById));
      });
    }

    var key = sortBy === 'currentStreak' ? 'currentWeekStreak'
      : sortBy === 'longestStreak' ? 'longestWeekStreak'
      : 'postCount';

    return FtStreak.rank(rows, key);
  }

  /**
   * One leaderboard row.
   *
   * Level name and icon are resolved here rather than left to the client. The
   * alternative is the browser holding its own copy of the level ladder, which
   * would be a second source of truth for something the server already owns —
   * and would drift the moment a level is renamed in the sheet.
   *
   * Note what is NOT here: no PIN hash, no email, no WhatsApp number, no
   * submission links. A leaderboard is the most widely-read surface in the
   * product, so it carries the least.
   */
  function entry(member, postCount, levelsById) {
    var level = levelsById[member.flowLevelId] || null;

    return {
      memberId: member.memberId,
      fullName: member.fullName,
      username: member.username,
      postCount: postCount,
      weeklyGoal: member.weeklyGoal,
      currentWeekStreak: member.currentWeekStreak,
      longestWeekStreak: member.longestWeekStreak,
      levelId: member.flowLevelId,
      levelName: level ? level.name : '',
      levelIconId: level ? level.iconId : 'seedling',
    };
  }

  /** The caller's own rank, or null when they have not posted in scope. */
  function rankOf(entries, memberId) {
    for (var i = 0; i < entries.length; i += 1) {
      if (entries[i].memberId === memberId) return entries[i].rank;
    }
    return null;
  }

  return { build: build, rankOf: rankOf };
})();

/* ==========================================================================
   MilestoneService
   ========================================================================== */

var MilestoneService = (function () {
  /**
   * Build the snapshot the pure evaluators judge.
   *
   * A plain object rather than a member row, so the evaluators stay pure,
   * testable, and indifferent to schema changes.
   */
  /**
   * The snapshot contract.
   *
   * These field names are the interface between this service and the pure
   * evaluators in FtAchievements. Every field an evaluator reads is produced
   * here — a mismatch means a milestone silently never unlocks, which is
   * exactly the class of bug `setupVerify()` now guards against.
   *
   * @param {Object} member
   * @param {Object} [extras] values the caller already computed, to avoid
   *   re-reading sheets inside the submission lock
   * @returns {Object}
   */
  function snapshot(member, extras) {
    var opts = extras || {};
    var weeks = WeeklyStatsRepo.forMember(member.memberId);
    var weekStart = FtWeek.weekStartKey(new Date(), TIMEZONE);

    var thisWeek = null;
    var goalsMetCount = 0;
    var perfectWeeks = 0;

    weeks.forEach(function (week) {
      if (week.goalMet) goalsMetCount += 1;
      if (FtStreak.isPerfectWeek(week)) perfectWeeks += 1;
      if (week.weekStart === weekStart) thisWeek = week;
    });

    var joined = String(member.joinDate || '').slice(0, 10);
    var foundingEnd = SettingsService.foundingPeriodEnd();

    return {
      allTimePosts: opts.allTimePosts !== undefined ? opts.allTimePosts : member.allTimePosts,

      activeDays: opts.activeDays !== undefined
        ? opts.activeDays
        : CalendarService.lifetimeActiveDays(member.memberId),

      goalsMetCount: opts.goalsMetCount !== undefined ? opts.goalsMetCount : goalsMetCount,
      perfectWeeks: opts.perfectWeeks !== undefined ? opts.perfectWeeks : perfectWeeks,

      currentWeekStreak: opts.currentWeekStreak !== undefined
        ? opts.currentWeekStreak
        : member.currentWeekStreak,

      longestWeekStreak: opts.longestWeekStreak !== undefined
        ? opts.longestWeekStreak
        : member.longestWeekStreak,

      // This week's raw numbers, so perfect-week can judge separate days
      // rather than only the total.
      postsThisWeek: opts.postsThisWeek !== undefined
        ? opts.postsThisWeek
        : (thisWeek ? thisWeek.postCount : 0),

      distinctDaysThisWeek: opts.distinctDaysThisWeek !== undefined
        ? opts.distinctDaysThisWeek
        : (thisWeek ? thisWeek.distinctDays : 0),

      weeklyGoal: thisWeek ? thisWeek.goalAtWeek : member.weeklyGoal,

      // Resolved here rather than in the evaluator, so the pure layer never
      // has to know about date formats or settings.
      isFoundingMember: Boolean(joined && foundingEnd && joined <= foundingEnd),

      bestRankFinal: opts.bestRankFinal !== undefined ? opts.bestRankFinal : bestRank(member.memberId),
    };
  }

  function bestRank(memberId) {
    var best = null;

    WeeklyStatsRepo.forMember(memberId).forEach(function (week) {
      if (week.rankFinal === null || week.rankFinal <= 0) return;
      if (best === null || week.rankFinal < best) best = week.rankFinal;
    });

    return best;
  }

  /**
   * Evaluate and persist any newly-earned milestones.
   *
   * @returns {Object[]} catalog entries for what was just unlocked
   */
  function evaluate(member, snap, context) {
    var catalog = MilestoneCatalogRepo.listActive();
    var earned = MemberMilestoneRepo.earnedIds(member.memberId);
    var unlocked = FtAchievements.newlyUnlocked(catalog, snap, earned);

    if (unlocked.length) {
      MemberMilestoneRepo.appendMany(member.memberId, unlocked, context || {});

      unlocked.forEach(function (milestone) {
        NotificationService.enqueue(member.memberId, 'MILESTONE_UNLOCKED', {
          milestoneId: milestone.milestoneId,
          name: milestone.name,
        });
      });
    }

    return unlocked;
  }

  /** Catalog + unlock state + progress, for the milestones screen. */
  function listForMember(member, snap) {
    var catalog = MilestoneCatalogRepo.listActive();
    var earnedRows = MemberMilestoneRepo.forMember(member.memberId);

    var earnedAt = {};
    var earnedIds = [];
    earnedRows.forEach(function (row) {
      earnedAt[row.milestoneId] = row.unlockedAt;
      earnedIds.push(row.milestoneId);
    });

    // Pass the earned ids so an already-unlocked milestone reads as complete
    // rather than being re-judged — a definition that changes later must never
    // take something back.
    var evaluated = FtAchievements.evaluateAll(catalog, snap, earnedIds);

    return evaluated
      // A hidden milestone stays out of the gallery until it is earned.
      .filter(function (item) { return !item.hidden || earnedAt[item.milestoneId]; })
      .map(function (item) {
        return {
          milestoneId: item.milestoneId,
          name: item.name,
          description: item.description,
          category: item.category,
          iconId: item.iconId,
          rarity: item.rarity,
          unlocked: Boolean(earnedAt[item.milestoneId]),
          unlockedAt: earnedAt[item.milestoneId] || '',
          progress: item.progress,
          target: item.target,
        };
      });
  }

  function summary(member, snap) {
    var catalog = MilestoneCatalogRepo.listActive();
    var earnedRows = MemberMilestoneRepo.forMember(member.memberId);
    var earnedIds = earnedRows.map(function (row) { return row.milestoneId; });

    var evaluated = FtAchievements.evaluateAll(catalog, snap, earnedIds);
    var visible = listForMember(member, snap);
    var earned = visible.filter(function (item) { return item.unlocked; });

    var unseen = earnedRows
      .filter(function (row) { return !row.seen; })
      .map(function (row) {
        return visible.filter(function (item) { return item.milestoneId === row.milestoneId; })[0] || null;
      })
      .filter(Boolean);

    var recent = earned
      .slice()
      .sort(function (a, b) { return String(b.unlockedAt).localeCompare(String(a.unlockedAt)); })
      .slice(0, 3);

    return {
      totalEarned: earned.length,
      totalAvailable: visible.length,
      recent: recent,
      // "What am I working toward?" — the unearned milestone nearest completion.
      next: FtAchievements.nextMilestone(evaluated),
      unseen: unseen,
    };
  }

  return {
    snapshot: snapshot,
    evaluate: evaluate,
    listForMember: listForMember,
    summary: summary,
    markSeen: MemberMilestoneRepo.markSeen,
  };
})();

/* ==========================================================================
   FlowLevelService
   ========================================================================== */

var FlowLevelService = (function () {
  /**
   * Determine the current level and whether it just changed.
   *
   * Level is derived, but stored on Members so a change can be detected and
   * celebrated. Without the stored value there is nothing to compare against.
   */
  function evaluate(member, snap) {
    var levels = FlowLevelRepo.listOrdered();
    var result = FtAchievements.evaluateLevel(levels, snap);

    if (!result.current) return { level: null, next: result.next, changed: false };

    var changed = result.current.levelId !== member.flowLevelId;

    if (changed) {
      MemberRepo.update(member.rowIndex, {
        flowLevelId: result.current.levelId,
        flowLevelAt: nowIso_(),
      });

      NotificationService.enqueue(member.memberId, 'LEVEL_UP', {
        levelId: result.current.levelId,
        name: result.current.name,
      });
    }

    return { level: result.current, next: result.next, changed: changed };
  }

  function describe(member, snap) {
    var levels = FlowLevelRepo.listOrdered();
    var result = FtAchievements.evaluateLevel(levels, snap);

    return {
      current: result.current,
      next: result.next,
      all: levels.map(function (level) {
        return {
          levelId: level.levelId,
          name: level.name,
          description: level.description,
          iconId: level.iconId,
          requiredPosts: level.requiredPosts,
          requiredPerfectWeeks: level.requiredPerfectWeeks,
          reached: result.current ? level.sortOrder <= result.current.sortOrder : false,
        };
      }),
    };
  }

  return { evaluate: evaluate, describe: describe };
})();

/* ==========================================================================
   SubmissionService — validation and dedupe
   ========================================================================== */

var SubmissionService = (function () {
  /**
   * Validate a link before anything is written.
   *
   * Runs OUTSIDE the lock: a rejected duplicate should not wait on, or hold,
   * a lock, and most failures are validation failures.
   *
   * @throws {AppError} INVALID_URL | PLATFORM_MISMATCH | DUPLICATE_LINK | DAILY_CAP
   * @returns {{link: string, linkKey: string}}
   */
  function validate(member, rawLink) {
    var result = FtLink.validate(rawLink, member.platform);

    if (!result.valid) {
      // The platform message names the member's registered platform, so the
      // correction is obvious rather than a puzzle.
      var message = result.code === 'PLATFORM_MISMATCH'
        ? 'This account is registered for ' + member.platform + ' posts only.'
        : undefined;

      throw fail_(result.code, message, { field: 'link' });
    }

    var linkKey = FtLink.normaliseKey(rawLink);
    if (!linkKey) throw fail_('INVALID_URL', undefined, { field: 'link' });

    var windowDays = SettingsService.duplicateWindowDays();

    if (SubmissionRepo.hasRecentLinkKey(member.memberId, linkKey, windowDays)) {
      throw fail_('DUPLICATE_LINK', undefined, { field: 'link' });
    }

    var dayKey = FtWeek.dayKey(new Date(), TIMEZONE);
    if (SubmissionRepo.countForDay(member.memberId, dayKey) >= SettingsService.dailyCap()) {
      throw fail_('DAILY_CAP');
    }

    // The original URL is stored, not the normalised key — an admin reviewing
    // a post needs the link the member actually published.
    return { link: String(rawLink).trim(), linkKey: linkKey, dayKey: dayKey };
  }

  /** Build the ledger row. Written first, so the fact survives any later failure. */
  function buildRow(member, validated) {
    var now = new Date();
    var dayKey = validated.dayKey;
    var weekStart = FtWeek.weekStartKey(now, TIMEZONE);

    return {
      submissionId: SubmissionRepo.nextId(),
      timestamp: now.toISOString(),
      memberId: member.memberId,
      name: member.fullName,
      username: member.username,
      platform: member.platform,
      contentLink: validated.link,
      linkKey: validated.linkKey,
      dayKey: dayKey,
      weekStart: weekStart,
      weekNumber: FtWeek.isoWeekNumber(weekStart),
      month: FtWeek.monthOf(dayKey),
      year: FtWeek.yearOf(dayKey),
      goalAtSubmission: member.weeklyGoal,
    };
  }

  function recentForMember(memberId, limit) {
    return SubmissionRepo.byMember(memberId)
      .sort(function (a, b) { return String(b.timestamp).localeCompare(String(a.timestamp)); })
      .slice(0, limit || 5)
      .map(function (row) {
        return {
          submissionId: row.submissionId,
          platform: row.platform,
          contentLink: row.contentLink,
          timestamp: row.timestamp,
          dayKey: row.dayKey,
        };
      });
  }

  return { validate: validate, buildRow: buildRow, recentForMember: recentForMember };
})();

/* ==========================================================================
   AnalyticsService — reads rollups only, so cost is constant as the ledger grows
   ========================================================================== */

var AnalyticsService = (function () {
  function range(fromKey, toKey) {
    return CommunityStatsRepo.findRange(fromKey, toKey);
  }

  /**
   * Every analytics series the admin screen renders.
   *
   * Computed from `Submissions` and `Members` directly rather than from the
   * nightly `CommunityStats` rollup. The rollup only exists once the job has
   * run, so a freshly-installed community would show empty charts on the day
   * it launches — the one day the numbers are most likely to be looked at.
   *
   * At this community's scale a bounded scan is cheap. `CommunityStats` stays
   * the right source once the ledger is large; the switch is this function.
   *
   * Every series here is derived from data the product already collects. No
   * new metric is introduced.
   *
   * @param {number} weeks how far back to look
   * @returns {Object}
   */
  function series(weeks) {
    var span = Math.max(4, Math.min(Number(weeks) || 12, 52));
    var currentWeekStart = FtWeek.weekStartKey(new Date(), TIMEZONE);
    var firstWeekStart = FtWeek.shiftDayKey(currentWeekStart, -(span - 1) * 7);
    var todayKey = FtWeek.dayKey(new Date(), TIMEZONE);

    var members = MemberRepo.all();
    var submissions = SubmissionRepo.active();
    var weekKeys = FtWeek.weekRange(firstWeekStart, currentWeekStart);

    /* --- Registration trend: joins per week, and the running total --- */
    var joinsByWeek = {};
    var joinedBefore = 0;

    members.forEach(function (member) {
      if (!member.joinDate) return;
      var day = member.joinDate.slice(0, 10);

      if (day < firstWeekStart) {
        joinedBefore += 1;
        return;
      }

      var week = FtWeek.weekStartKey(new Date(day + 'T12:00:00Z'), TIMEZONE);
      joinsByWeek[week] = (joinsByWeek[week] || 0) + 1;
    });

    var running = joinedBefore;
    var weeklyGrowth = [];
    var registrationTrend = [];

    weekKeys.forEach(function (week) {
      var joined = joinsByWeek[week] || 0;
      running += joined;
      weeklyGrowth.push({ label: week, value: joined });
      registrationTrend.push({ label: week, value: running });
    });

    /* --- Posting trend, per week --- */
    var postsByWeek = {};
    var postsByDay = {};
    var platformCounts = {};

    submissions.forEach(function (row) {
      if (row.weekStart >= firstWeekStart) {
        postsByWeek[row.weekStart] = (postsByWeek[row.weekStart] || 0) + 1;
      }
      if (row.dayKey >= firstWeekStart) {
        postsByDay[row.dayKey] = (postsByDay[row.dayKey] || 0) + 1;
      }
      platformCounts[row.platform] = (platformCounts[row.platform] || 0) + 1;
    });

    var postingTrend = weekKeys.map(function (week) {
      return { label: week, value: postsByWeek[week] || 0 };
    });

    /* --- Goal completion, per week --- */
    var statsByWeek = {};
    WeeklyStatsRepo.all().forEach(function (stat) {
      if (stat.weekStart < firstWeekStart) return;
      if (!statsByWeek[stat.weekStart]) statsByWeek[stat.weekStart] = { met: 0, total: 0 };
      statsByWeek[stat.weekStart].total += 1;
      if (stat.goalMet) statsByWeek[stat.weekStart].met += 1;
    });

    var goalCompletion = weekKeys.map(function (week) {
      var entry = statsByWeek[week];
      return {
        label: week,
        value: entry && entry.total ? Math.round((entry.met / entry.total) * 100) : 0,
      };
    });

    /* --- Platform distribution --- */
    var platformDistribution = PLATFORMS.map(function (platform) {
      return { label: platform, value: platformCounts[platform] || 0 };
    }).filter(function (entry) { return entry.value > 0; });

    /* --- Flow Level distribution --- */
    var levelCounts = {};
    members.forEach(function (member) {
      if (member.status !== MEMBER_STATUS.ACTIVE) return;
      levelCounts[member.flowLevelId] = (levelCounts[member.flowLevelId] || 0) + 1;
    });

    var flowLevelDistribution = FlowLevelRepo.listOrdered().map(function (level) {
      return { label: level.name, levelId: level.levelId, value: levelCounts[level.levelId] || 0 };
    });

    /* --- Activity heatmap: week x day-of-week, community-wide --- */
    var heatmap = weekKeys.map(function (week) {
      var days = [];
      for (var offset = 0; offset < 7; offset += 1) {
        var day = FtWeek.shiftDayKey(week, offset);
        days.push({
          day: day,
          value: postsByDay[day] || 0,
          // Future days are marked so the current week does not read as a
          // sudden collapse in activity.
          future: day > todayKey,
        });
      }
      return { week: week, days: days };
    });

    return {
      from: firstWeekStart,
      to: currentWeekStart,
      weeks: span,
      weeklyGrowth: weeklyGrowth,
      registrationTrend: registrationTrend,
      postingTrend: postingTrend,
      goalCompletion: goalCompletion,
      platformDistribution: platformDistribution,
      flowLevelDistribution: flowLevelDistribution,
      activityHeatmap: heatmap,
    };
  }

  /**
   * Community overview.
   *
   * Only metrics enabled in Settings are returned. The Consistency Score
   * ships disabled and is absent from the response rather than stubbed —
   * its definition is still to be agreed.
   */
  /**
   * The Community Overview cards.
   *
   * Exactly the eight figures the approved admin spec names — nothing added.
   * "Active members this week" means members who POSTED this week, which is a
   * different and more useful number than "accounts not suspended".
   */
  function overview(currentWeekStart) {
    var members = MemberRepo.all();
    var active = members.filter(function (m) { return m.status === MEMBER_STATUS.ACTIVE; });
    var todayKey = FtWeek.dayKey(new Date(), TIMEZONE);
    var month = FtWeek.monthOf(todayKey);
    var year = FtWeek.yearOf(todayKey);

    var submissions = SubmissionRepo.active();
    var weekStats = WeeklyStatsRepo.forWeek(currentWeekStart);

    var postsToday = 0;
    var postsThisWeek = 0;
    var postersThisWeek = {};

    submissions.forEach(function (row) {
      if (row.dayKey === todayKey) postsToday += 1;
      if (row.weekStart === currentWeekStart) {
        postsThisWeek += 1;
        postersThisWeek[row.memberId] = true;
      }
    });

    var goalHits = weekStats.filter(function (row) { return row.goalMet; }).length;

    var newThisMonth = members.filter(function (m) {
      if (!m.joinDate) return false;
      var joined = m.joinDate.slice(0, 10);
      return FtWeek.monthOf(joined) === month && FtWeek.yearOf(joined) === year;
    }).length;

    var metrics = [
      { id: 'totalMembers', label: 'Total members', value: members.length },
      {
        id: 'activeMembersThisWeek',
        label: 'Active this week',
        value: Object.keys(postersThisWeek).length,
        meta: 'of ' + active.length + ' active',
      },
      { id: 'postsToday', label: 'Posts today', value: postsToday },
      { id: 'postsThisWeek', label: 'Posts this week', value: postsThisWeek },
      {
        id: 'goalCompletionRate',
        label: 'Goal completion',
        value: active.length ? Math.round((goalHits / active.length) * 100) : 0,
        unit: '%',
        meta: goalHits + ' of ' + active.length + ' met their goal',
      },
      { id: 'totalPosts', label: 'Total posts', value: submissions.length },
      { id: 'newMembers', label: 'New this month', value: newThisMonth },
    ];

    var enabled = SettingsService.text('metrics.enabled', '');
    if (!enabled) return metrics;

    var allowed = enabled.split(',').map(function (id) { return id.trim(); });
    return metrics.filter(function (metric) { return allowed.indexOf(metric.id) !== -1; });
  }

  return { range: range, overview: overview, series: series };
})();
