/**
 * Week streaks and ranking. PURE — no Apps Script APIs.
 *
 * This file decides who is publicly celebrated, so it is the most consequential
 * arithmetic in the product and the most thoroughly tested.
 */

var FtStreak = (function () {
  /**
   * Current and longest week streak.
   *
   * Rules, from docs/streak-and-leaderboard.md:
   *   - a week counts when its post count met the goal that applied then
   *   - the CURRENT week never breaks a streak; it only extends it once met
   *   - `longest` is monotonic and never reduced
   *
   * The current-week rule matters more than it looks. Without it, every member
   * in the community would show a broken streak every Monday morning, when
   * they have simply not posted yet.
   *
   * @param {Array<{weekStart:string, postCount:number, goalAtWeek:number}>} weeks
   *   Any order; sorted internally. Missing weeks count as unmet.
   * @param {string} currentWeekStart
   * @param {Function} shiftDayKey `FtWeek.shiftDayKey`
   * @returns {{current:number, longest:number, perfectWeeks:number}}
   */
  function weekStreaks(weeks, currentWeekStart, shiftDayKey) {
    var byWeek = {};
    var perfectWeeks = 0;

    weeks.forEach(function (week) {
      var met = Number(week.postCount) >= Number(week.goalAtWeek);
      byWeek[week.weekStart] = met;
      if (met) perfectWeeks += 1;
    });

    // Walk backwards from the current week. The first unmet CLOSED week ends
    // the run.
    var current = 0;
    var cursor = currentWeekStart;

    if (byWeek[cursor]) {
      current = 1;
      cursor = shiftDayKey(cursor, -7);
    } else {
      // Current week not met yet — it does not break anything, step past it.
      cursor = shiftDayKey(cursor, -7);
    }

    while (byWeek[cursor]) {
      current += 1;
      cursor = shiftDayKey(cursor, -7);
    }

    // Longest is the widest consecutive run anywhere in the history.
    var keys = Object.keys(byWeek).sort();
    var longest = 0;
    var run = 0;
    var previous = null;

    keys.forEach(function (key) {
      if (!byWeek[key]) {
        run = 0;
        previous = key;
        return;
      }

      // Consecutive only if this week is exactly seven days after the last.
      run = previous !== null && shiftDayKey(previous, 7) === key ? run + 1 : 1;
      longest = Math.max(longest, run);
      previous = key;
    });

    return { current: current, longest: Math.max(longest, current), perfectWeeks: perfectWeeks };
  }

  /**
   * Competition ranking.
   *
   * Ties share a rank and the next rank skips — three members on 5 posts are
   * all 1st, and the next is 4th.
   *
   * **Members with zero posts are excluded, not ranked last.** They see the
   * invitation instead. Ranking someone 47th of 47 is the "leaderboard-first"
   * failure the product vision rules out.
   *
   * @param {Array<{memberId:string, postCount:number}>} rows
   * @param {string} [sortKey='postCount']
   * @returns {Array} the same rows, filtered, sorted, each with `rank`
   */
  function rank(rows, sortKey) {
    var key = sortKey || 'postCount';

    var ranked = rows
      .filter(function (row) {
        return Number(row[key]) > 0;
      })
      .slice()
      .sort(function (a, b) {
        if (Number(b[key]) !== Number(a[key])) return Number(b[key]) - Number(a[key]);
        // Stable, human-meaningful tiebreak so equal scores do not shuffle
        // between requests.
        return String(a.memberId).localeCompare(String(b.memberId));
      });

    var lastValue = null;
    var lastRank = 0;

    ranked.forEach(function (row, index) {
      if (Number(row[key]) !== lastValue) {
        lastRank = index + 1;
        lastValue = Number(row[key]);
      }
      row.rank = lastRank;
    });

    return ranked;
  }

  /**
   * Does this week qualify as a Perfect Week?
   *
   * Approved decision D42: meeting the goal is not enough — the posts must land
   * on at least as many separate days as the goal. Three posts on a Saturday
   * meets a goal of 3 and feeds the streak, but is not a Perfect Week.
   *
   * @param {{postCount:number, distinctDays:number, goalAtWeek:number}} week
   * @returns {boolean}
   */
  function isPerfectWeek(week) {
    return (
      Number(week.postCount) >= Number(week.goalAtWeek) &&
      Number(week.distinctDays) >= Number(week.goalAtWeek)
    );
  }

  /**
   * The longest run of consecutive goal-met weeks ending at the current week.
   *
   * Feeds the Five Perfect Weeks and Consistency Champion milestones, which
   * ask for consecutive weeks rather than a lifetime total.
   *
   * @param {Array<{weekStart:string, postCount:number, goalAtWeek:number}>} weeks
   * @param {string} currentWeekStart
   * @param {Function} shiftDayKey
   * @returns {number}
   */
  function consecutiveGoalWeeks(weeks, currentWeekStart, shiftDayKey) {
    return weekStreaks(weeks, currentWeekStart, shiftDayKey).longest;
  }

  return {
    weekStreaks: weekStreaks,
    rank: rank,
    isPerfectWeek: isPerfectWeek,
    consecutiveGoalWeeks: consecutiveGoalWeeks,
  };
})();

if (typeof module !== 'undefined') module.exports = FtStreak;
