/**
 * Milestone evaluators and Flow Level progression. PURE — no Apps Script APIs.
 *
 * WHY THE CONDITIONS LIVE IN CODE
 * An unlock condition is a function, not a value. Expressing "seven active
 * days" in a spreadsheet cell means inventing a rules language with no tests,
 * no type checking, and edit access for anyone who opens the file — one wrong
 * character silently stops every member earning anything.
 *
 * Presentation — name, description, icon, rarity — lives in `MilestoneCatalog`
 * and is editable without a deploy. This file holds only the judgements.
 *
 * Every evaluator returns `{ progress, target }` rather than a bare boolean,
 * which is what makes "progress toward the next milestone" free: the next
 * milestone is simply the unearned one with the highest ratio.
 */

var FtAchievements = (function () {
  /**
   * @typedef {Object} Snapshot
   * @property {number} allTimePosts
   * @property {number} activeDays          distinct days with a post, lifetime
   * @property {number} perfectWeeks        lifetime weeks meeting goal
   * @property {number} longestWeekStreak   consecutive goal-met weeks
   * @property {number} distinctDaysThisWeek
   * @property {number} postsThisWeek
   * @property {number} weeklyGoal
   * @property {boolean} isFoundingMember
   * @property {number|null} bestRankFinal  best settled weekly rank, 1 = first
   */

  /**
   * Evaluators, keyed by `MilestoneCatalog.MilestoneID`.
   *
   * A catalog row whose id is absent here is skipped rather than throwing — an
   * admin adding a row should not be able to break every member's dashboard.
   */
  var EVALUATORS = {
    'first-step': function (s) {
      return { progress: Math.min(s.allTimePosts, 1), target: 1 };
    },
    // "Completed your first weekly goal" — ANY days. This is deliberately not
    // the same trigger as perfect-week: hitting three posts on one Saturday
    // completes the goal, and that first completion deserves recognition.
    'first-goal': function (s) {
      return { progress: Math.min(s.goalsMetCount, 1), target: 1 };
    },

    // Active days, not consecutive days (D40). A member on a 3-post goal who
    // hits it perfectly for a year has a longest consecutive run of one day —
    // consecutive milestones were unreachable for most of the community.
    'active-days-7': function (s) {
      return { progress: Math.min(s.activeDays, 7), target: 7 };
    },
    'active-days-30': function (s) {
      return { progress: Math.min(s.activeDays, 30), target: 30 };
    },
    'active-days-100': function (s) {
      return { progress: Math.min(s.activeDays, 100), target: 100 };
    },

    // Perfect Week needs separate days (D42). Three posts on a Saturday meets
    // a goal of 3 and feeds the streak, but is not a Perfect Week.
    'perfect-week': function (s) {
      var earned =
        s.postsThisWeek >= s.weeklyGoal && s.distinctDaysThisWeek >= s.weeklyGoal ? 1 : 0;
      return { progress: earned, target: 1 };
    },
    'perfect-weeks-5': function (s) {
      return { progress: Math.min(s.longestWeekStreak, 5), target: 5 };
    },
    'perfect-weeks-12': function (s) {
      return { progress: Math.min(s.longestWeekStreak, 12), target: 12 };
    },

    'posts-10': postsTarget(10),
    'posts-50': postsTarget(50),
    'posts-100': postsTarget(100),
    'posts-250': postsTarget(250),
    'posts-500': postsTarget(500),

    'founding-member': function (s) {
      return { progress: s.isFoundingMember ? 1 : 0, target: 1 };
    },
    // Rank-dependent, so only settleable at week close against RankFinal.
    'top-10': function (s) {
      return { progress: s.bestRankFinal !== null && s.bestRankFinal <= 10 ? 1 : 0, target: 1 };
    },
    'weekly-champion': function (s) {
      return { progress: s.bestRankFinal === 1 ? 1 : 0, target: 1 };
    },
  };

  function postsTarget(target) {
    return function (s) {
      return { progress: Math.min(s.allTimePosts, target), target: target };
    };
  }

  /**
   * Evaluate every catalog entry against a snapshot.
   *
   * @param {Array<Object>} catalog rows from `MilestoneCatalog`
   * @param {Snapshot} snapshot
   * @param {string[]} [earnedIds] already unlocked — reported, never re-evaluated
   * @returns {Array<Object>} catalog rows plus progress, target, ratio, unlocked
   */
  function evaluateAll(catalog, snapshot, earnedIds) {
    var earned = {};
    (earnedIds || []).forEach(function (id) {
      earned[id] = true;
    });

    var out = [];

    catalog.forEach(function (entry) {
      var evaluator = EVALUATORS[entry.milestoneId];
      if (!evaluator) return;

      var already = Boolean(earned[entry.milestoneId]);
      var result = evaluator(snapshot);
      var progress = Math.max(0, Math.min(result.progress, result.target));

      out.push(
        Object.assign({}, entry, {
          progress: already ? result.target : progress,
          target: result.target,
          ratio: result.target > 0 ? (already ? 1 : progress / result.target) : 0,
          // A milestone once earned is never revoked, even if its definition
          // later changes. Taking away something someone earned is the
          // opposite of what this system is for.
          unlocked: already || progress >= result.target,
          newlyUnlocked: !already && progress >= result.target,
        }),
      );
    });

    return out;
  }

  /**
   * Newly unlocked entries only — what the submission response celebrates.
   *
   * @param {Array<Object>} catalog
   * @param {Snapshot} snapshot
   * @param {string[]} earnedIds
   * @returns {Array<Object>}
   */
  function newlyUnlocked(catalog, snapshot, earnedIds) {
    return evaluateAll(catalog, snapshot, earnedIds).filter(function (entry) {
      return entry.newlyUnlocked;
    });
  }

  /**
   * The unearned milestone closest to completion.
   *
   * @param {Array<Object>} evaluated output of `evaluateAll`
   * @returns {Object|null}
   */
  function nextMilestone(evaluated) {
    var candidates = evaluated.filter(function (entry) {
      return !entry.unlocked && !entry.hidden;
    });

    if (!candidates.length) return null;

    candidates.sort(function (a, b) {
      if (b.ratio !== a.ratio) return b.ratio - a.ratio;
      // Equal ratio: prefer the smaller target, which is genuinely nearer.
      return a.target - b.target;
    });

    return candidates[0];
  }

  /**
   * The member's Flow Level, and progress toward the next.
   *
   * Both thresholds must be met. Posts alone rewards a burst; weeks alone
   * rewards the calendar passing. Requiring both means a level says *this
   * person shows up, and keeps showing up*.
   *
   * @param {Array<Object>} levels `FlowLevels` rows, any order
   * @param {Snapshot} snapshot
   * @returns {{current:Object, next:Object|null, progress:Object|null}}
   */
  function evaluateLevel(levels, snapshot) {
    var ordered = levels.slice().sort(function (a, b) {
      return Number(a.sortOrder) - Number(b.sortOrder);
    });

    var current = ordered[0] || null;

    ordered.forEach(function (level) {
      if (
        snapshot.allTimePosts >= Number(level.requiredPosts) &&
        snapshot.perfectWeeks >= Number(level.requiredPerfectWeeks)
      ) {
        current = level;
      }
    });

    var next = null;
    if (current) {
      for (var i = 0; i < ordered.length; i += 1) {
        if (Number(ordered[i].sortOrder) > Number(current.sortOrder)) {
          next = ordered[i];
          break;
        }
      }
    }

    var progress = null;
    if (next) {
      var postRatio = ratio(snapshot.allTimePosts, next.requiredPosts);
      var weekRatio = ratio(snapshot.perfectWeeks, next.requiredPerfectWeeks);

      progress = {
        // The lesser of the two, so the bar reflects whichever requirement is
        // actually holding the member back.
        ratio: Math.min(postRatio, weekRatio),
        posts: { current: snapshot.allTimePosts, target: Number(next.requiredPosts) },
        perfectWeeks: {
          current: snapshot.perfectWeeks,
          target: Number(next.requiredPerfectWeeks),
        },
      };
    }

    return { current: current, next: next, progress: progress };
  }

  function ratio(value, target) {
    var t = Number(target);
    if (!t) return 1;
    return Math.min(Number(value) / t, 1);
  }

  /** @returns {string[]} every milestone id this file can judge */
  function knownIds() {
    return Object.keys(EVALUATORS);
  }

  return {
    evaluateAll: evaluateAll,
    newlyUnlocked: newlyUnlocked,
    nextMilestone: nextMilestone,
    evaluateLevel: evaluateLevel,
    knownIds: knownIds,
  };
})();

if (typeof module !== 'undefined') module.exports = FtAchievements;
