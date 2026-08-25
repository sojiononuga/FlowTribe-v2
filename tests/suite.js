/**
 * Test suite for the pure business logic.
 *
 * These files decide who is publicly celebrated, which makes them the most
 * consequential code in the product and the part v1 had no tests for at all.
 *
 * The suite runs in two places without modification:
 *   - `tests/index.html` in a browser, via plain <script> tags
 *   - `node --test` once Node is available (the files carry a module guard)
 *
 * Plain <script> rather than ES modules is deliberate: it mirrors how Apps
 * Script actually loads these files — one shared global scope, no imports — so
 * the tests exercise the same conditions as production.
 */

/* global FtWeek, FtDayMap, FtStreak, FtLink, FtIdentity, FtAchievements */

(function (root) {
  var TZ = 'Africa/Lagos';
  var results = [];
  var current = null;

  function describe(name, fn) {
    current = { name: name, cases: [] };
    results.push(current);
    fn();
  }

  function it(name, fn) {
    try {
      fn();
      current.cases.push({ name: name, ok: true });
    } catch (error) {
      current.cases.push({ name: name, ok: false, message: error.message });
    }
  }

  function eq(actual, expected, note) {
    var a = JSON.stringify(actual);
    var e = JSON.stringify(expected);
    if (a !== e) {
      throw new Error((note ? note + ': ' : '') + 'expected ' + e + ', got ' + a);
    }
  }

  function ok(value, note) {
    if (!value) throw new Error(note || 'expected truthy, got ' + JSON.stringify(value));
  }

  /* =======================================================================
     FtWeek — the boundary every other number depends on
     ==================================================================== */

  describe('FtWeek', function () {
    it('gives the Monday for a mid-week date', function () {
      // 2026-07-29 is a Wednesday.
      eq(FtWeek.weekStartKey(new Date('2026-07-29T12:00:00Z'), TZ), '2026-07-27');
    });

    it('treats Monday as its own week start', function () {
      eq(FtWeek.weekStartKey(new Date('2026-07-27T09:00:00Z'), TZ), '2026-07-27');
    });

    it('keeps Sunday in the week that began the previous Monday', function () {
      eq(FtWeek.weekStartKey(new Date('2026-08-02T12:00:00Z'), TZ), '2026-07-27');
    });

    it('puts a late Sunday evening in Lagos in the closing week, not the next', function () {
      // 22:30 UTC Sunday is 23:30 Sunday in Lagos — still the old week.
      eq(FtWeek.weekStartKey(new Date('2026-08-02T22:30:00Z'), TZ), '2026-07-27');
    });

    it('rolls into the new week once Lagos passes midnight', function () {
      // 23:30 UTC Sunday is 00:30 Monday in Lagos (UTC+1).
      eq(FtWeek.weekStartKey(new Date('2026-08-02T23:30:00Z'), TZ), '2026-08-03');
    });

    it('uses the Lagos calendar day, not UTC', function () {
      eq(FtWeek.dayKey(new Date('2026-07-29T23:30:00Z'), TZ), '2026-07-30');
    });

    it('shifts across a month boundary', function () {
      eq(FtWeek.shiftDayKey('2026-07-31', 1), '2026-08-01');
      eq(FtWeek.shiftDayKey('2026-08-01', -1), '2026-07-31');
    });

    it('shifts across a year boundary', function () {
      eq(FtWeek.shiftDayKey('2026-12-31', 1), '2027-01-01');
      eq(FtWeek.shiftDayKey('2027-01-01', -1), '2026-12-31');
    });

    it('handles a leap day', function () {
      eq(FtWeek.shiftDayKey('2028-02-28', 1), '2028-02-29');
      eq(FtWeek.daysBetween('2028-02-01', '2028-03-01'), 29);
      eq(FtWeek.daysBetween('2026-02-01', '2026-03-01'), 28);
    });

    it('computes day of year, including after a leap day', function () {
      eq(FtWeek.dayOfYear('2026-01-01'), 1);
      eq(FtWeek.dayOfYear('2026-12-31'), 365);
      eq(FtWeek.dayOfYear('2028-12-31'), 366);
      eq(FtWeek.dayOfYear('2028-03-01'), 61);
      eq(FtWeek.dayOfYear('2026-03-01'), 60);
    });

    it('builds an inclusive day range', function () {
      eq(FtWeek.dayRange('2026-07-27', '2026-07-30').length, 4);
      eq(FtWeek.dayRange('2026-07-27', '2026-07-27'), ['2026-07-27']);
    });

    it('walks week starts oldest first', function () {
      eq(FtWeek.weekRange('2026-07-06', '2026-07-27'), [
        '2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27',
      ]);
    });
  });

  /* =======================================================================
     FtDayMap — the packed calendar
     ==================================================================== */

  describe('FtDayMap', function () {
    it('creates a 366-character empty map', function () {
      eq(FtDayMap.empty().length, 366);
      eq(FtDayMap.activeDays(FtDayMap.empty()), 0);
    });

    it('repairs a short, long, or dirty map rather than throwing', function () {
      eq(FtDayMap.normalise('').length, 366);
      eq(FtDayMap.normalise('12a3').slice(0, 4), '1230');
      eq(FtDayMap.normalise('9'.repeat(400)).length, 366);
      eq(FtDayMap.normalise(null).length, 366);
      eq(FtDayMap.normalise(12345).length, 366);
    });

    it('sets and reads a single day', function () {
      var map = FtDayMap.set(FtDayMap.empty(), 100, 3);
      eq(FtDayMap.get(map, 100), 3);
      eq(FtDayMap.get(map, 99), 0);
      eq(map.length, 366);
    });

    it('reports the first post on a day as a new active day', function () {
      var first = FtDayMap.increment(FtDayMap.empty(), 50);
      eq(first.isNewActiveDay, true);
      eq(first.count, 1);

      var second = FtDayMap.increment(first.map, 50);
      eq(second.isNewActiveDay, false, 'a second post the same day is not a new active day');
      eq(second.count, 2);
    });

    it('caps a day at 9 without losing the active-day flag', function () {
      var map = FtDayMap.set(FtDayMap.empty(), 10, 9);
      var result = FtDayMap.increment(map, 10);
      eq(result.count, 9);
      eq(FtDayMap.get(result.map, 10), 9);
    });

    it('ignores out-of-range days instead of corrupting the map', function () {
      eq(FtDayMap.get(FtDayMap.empty(), 0), 0);
      eq(FtDayMap.get(FtDayMap.empty(), 367), 0);
      eq(FtDayMap.set(FtDayMap.empty(), 400, 5).length, 366);
    });

    it('counts active days and total posts separately', function () {
      var map = FtDayMap.empty();
      map = FtDayMap.set(map, 1, 3);
      map = FtDayMap.set(map, 2, 1);
      map = FtDayMap.set(map, 3, 2);

      eq(FtDayMap.activeDays(map), 3, 'three distinct days');
      eq(FtDayMap.totalPosts(map), 6, 'six posts across them');
    });

    it('reports first and last active day', function () {
      var map = FtDayMap.set(FtDayMap.set(FtDayMap.empty(), 20, 1), 200, 1);
      eq(FtDayMap.bounds(map), { first: 20, last: 200 });
      eq(FtDayMap.bounds(FtDayMap.empty()), { first: null, last: null });
    });

    it('round-trips through a sparse count object', function () {
      var counts = { '2026-01-01': 2, '2026-06-15': 1, '2026-12-31': 3 };
      var map = FtDayMap.fromCounts(counts, 2026, FtWeek.dayOfYear);

      eq(FtDayMap.activeDays(map), 3);
      eq(FtDayMap.totalPosts(map), 6);
      eq(FtDayMap.toCounts(map, 2026, FtWeek.shiftDayKey), counts);
    });

    it('omits zero days from the sparse form', function () {
      var map = FtDayMap.set(FtDayMap.empty(), 5, 1);
      eq(Object.keys(FtDayMap.toCounts(map, 2026, FtWeek.shiftDayKey)).length, 1);
    });
  });

  /* =======================================================================
     FtStreak — who gets celebrated
     ==================================================================== */

  describe('FtStreak week streaks', function () {
    var shift = FtWeek.shiftDayKey;

    function week(start, posts, goal) {
      return { weekStart: start, postCount: posts, goalAtWeek: goal || 3 };
    }

    it('counts consecutive met weeks including the current one', function () {
      var weeks = [
        week('2026-07-06', 3), week('2026-07-13', 4), week('2026-07-20', 3), week('2026-07-27', 3),
      ];
      eq(FtStreak.weekStreaks(weeks, '2026-07-27', shift).current, 4);
    });

    it('does NOT break the streak when the current week is not yet met', function () {
      var weeks = [
        week('2026-07-06', 3), week('2026-07-13', 3), week('2026-07-20', 3), week('2026-07-27', 1),
      ];
      // Monday morning, nothing posted: the run must survive.
      eq(FtStreak.weekStreaks(weeks, '2026-07-27', shift).current, 3);
    });

    it('breaks the streak on a closed week that was missed', function () {
      var weeks = [
        week('2026-07-06', 3), week('2026-07-13', 1), week('2026-07-20', 3), week('2026-07-27', 3),
      ];
      eq(FtStreak.weekStreaks(weeks, '2026-07-27', shift).current, 2);
    });

    it('treats an absent week as unmet', function () {
      var weeks = [week('2026-07-06', 3), week('2026-07-20', 3), week('2026-07-27', 3)];
      eq(FtStreak.weekStreaks(weeks, '2026-07-27', shift).current, 2, 'the gap ends the older run');
    });

    it('keeps longest at the widest historical run', function () {
      var weeks = [
        week('2026-05-04', 3), week('2026-05-11', 3), week('2026-05-18', 3),
        week('2026-05-25', 3), week('2026-06-01', 0),
        week('2026-07-20', 3), week('2026-07-27', 3),
      ];
      var result = FtStreak.weekStreaks(weeks, '2026-07-27', shift);
      eq(result.longest, 4, 'the four-week run in May');
      eq(result.current, 2);
    });

    it('never lets longest fall below current', function () {
      var weeks = [week('2026-07-20', 3), week('2026-07-27', 3)];
      var result = FtStreak.weekStreaks(weeks, '2026-07-27', shift);
      ok(result.longest >= result.current);
    });

    it('judges each week against the goal that applied then', function () {
      // Raising a goal must not retroactively revoke past weeks.
      var weeks = [week('2026-07-13', 3, 3), week('2026-07-20', 3, 3), week('2026-07-27', 3, 7)];
      var result = FtStreak.weekStreaks(weeks, '2026-07-27', shift);
      eq(result.perfectWeeks, 2, 'the two old weeks still count');
      eq(result.current, 2, 'the unmet current week does not break them');
    });

    it('returns zero for a member with no history', function () {
      eq(FtStreak.weekStreaks([], '2026-07-27', shift), {
        current: 0, longest: 0, perfectWeeks: 0,
      });
    });
  });

  describe('FtStreak ranking', function () {
    it('ranks by post count, highest first', function () {
      var ranked = FtStreak.rank([
        { memberId: 'a', postCount: 2 },
        { memberId: 'b', postCount: 5 },
        { memberId: 'c', postCount: 3 },
      ]);
      eq(ranked.map(function (r) { return r.memberId; }), ['b', 'c', 'a']);
      eq(ranked.map(function (r) { return r.rank; }), [1, 2, 3]);
    });

    it('shares a rank on a tie and skips the next', function () {
      var ranked = FtStreak.rank([
        { memberId: 'a', postCount: 5 },
        { memberId: 'b', postCount: 5 },
        { memberId: 'c', postCount: 3 },
      ]);
      eq(ranked.map(function (r) { return r.rank; }), [1, 1, 3], 'no rank 2 after a two-way tie');
    });

    it('EXCLUDES zero-post members rather than ranking them last', function () {
      var ranked = FtStreak.rank([
        { memberId: 'a', postCount: 3 },
        { memberId: 'b', postCount: 0 },
      ]);
      eq(ranked.length, 1);
      eq(ranked[0].memberId, 'a');
    });

    it('is stable for equal scores across calls', function () {
      var rows = [
        { memberId: 'z', postCount: 4 },
        { memberId: 'a', postCount: 4 },
      ];
      eq(FtStreak.rank(rows.slice()).map(function (r) { return r.memberId; }), ['a', 'z']);
      eq(FtStreak.rank(rows.slice()).map(function (r) { return r.memberId; }), ['a', 'z']);
    });
  });

  describe('FtStreak Perfect Week', function () {
    it('accepts a goal met across separate days', function () {
      eq(FtStreak.isPerfectWeek({ postCount: 3, distinctDays: 3, goalAtWeek: 3 }), true);
    });

    it('REJECTS a goal met by batching into fewer days', function () {
      // Three posts on one Saturday meets the goal but is not a Perfect Week.
      eq(FtStreak.isPerfectWeek({ postCount: 3, distinctDays: 1, goalAtWeek: 3 }), false);
      eq(FtStreak.isPerfectWeek({ postCount: 5, distinctDays: 2, goalAtWeek: 5 }), false);
    });

    it('rejects a week that missed the goal entirely', function () {
      eq(FtStreak.isPerfectWeek({ postCount: 2, distinctDays: 2, goalAtWeek: 3 }), false);
    });

    it('accepts posting more than the goal on enough days', function () {
      eq(FtStreak.isPerfectWeek({ postCount: 6, distinctDays: 4, goalAtWeek: 3 }), true);
    });
  });

  /* =======================================================================
     FtLink — the check that decides whether a post counts
     ==================================================================== */

  describe('FtLink', function () {
    it('accepts a plain platform URL', function () {
      eq(FtLink.validate('https://www.linkedin.com/posts/abc', 'LinkedIn').valid, true);
      eq(FtLink.validate('https://x.com/me/status/1', 'X').valid, true);
      eq(FtLink.validate('https://youtu.be/abc123', 'YouTube').valid, true);
    });

    it('accepts a subdomain', function () {
      eq(FtLink.validate('https://uk.linkedin.com/posts/abc', 'LinkedIn').valid, true);
    });

    it('REJECTS a lookalike domain', function () {
      eq(FtLink.validate('https://notlinkedin.com/posts/abc', 'LinkedIn').code, 'PLATFORM_MISMATCH');
      eq(FtLink.validate('https://linkedin.com.evil.co/x', 'LinkedIn').code, 'PLATFORM_MISMATCH');
      eq(FtLink.validate('https://evil.com/?u=linkedin.com', 'LinkedIn').code, 'PLATFORM_MISMATCH');
    });

    it('rejects the wrong platform for this member', function () {
      eq(FtLink.validate('https://instagram.com/p/abc', 'LinkedIn').code, 'PLATFORM_MISMATCH');
    });

    it('rejects anything that is not an http(s) URL', function () {
      eq(FtLink.validate('just some text', 'LinkedIn').code, 'INVALID_URL');
      eq(FtLink.validate('', 'LinkedIn').code, 'INVALID_URL');
      eq(FtLink.validate('linkedin.com/posts/abc', 'LinkedIn').code, 'INVALID_URL');
      eq(FtLink.validate('javascript:alert(1)', 'LinkedIn').code, 'INVALID_URL');
      eq(FtLink.validate('ftp://linkedin.com/x', 'LinkedIn').code, 'INVALID_URL');
    });

    it('accepts twitter.com for an X member', function () {
      eq(FtLink.validate('https://twitter.com/me/status/1', 'X').valid, true);
    });

    it('collapses tracking parameters to one key', function () {
      var a = FtLink.normaliseKey('https://www.linkedin.com/posts/abc?utm_source=x&utm_medium=y');
      var b = FtLink.normaliseKey('https://linkedin.com/posts/abc');
      eq(a, b, 'the same post shared from two places must collide');
    });

    it('ignores a trailing slash and a fragment', function () {
      var a = FtLink.normaliseKey('https://linkedin.com/posts/abc/');
      var b = FtLink.normaliseKey('https://linkedin.com/posts/abc#comments');
      eq(a, b);
    });

    it('ignores parameter order', function () {
      var a = FtLink.normaliseKey('https://youtube.com/watch?v=1&list=2');
      var b = FtLink.normaliseKey('https://youtube.com/watch?list=2&v=1');
      eq(a, b);
    });

    it('keeps meaningful parameters', function () {
      var a = FtLink.normaliseKey('https://youtube.com/watch?v=aaa');
      var b = FtLink.normaliseKey('https://youtube.com/watch?v=bbb');
      ok(a !== b, 'different videos must not collide');
    });

    it('returns an empty key for an unparseable link', function () {
      eq(FtLink.normaliseKey('nonsense'), '');
    });
  });

  /* =======================================================================
     FtIdentity
     ==================================================================== */

  describe('FtIdentity usernames', function () {
    it('accepts the documented shapes', function () {
      eq(FtIdentity.validateUsername('david').valid, true);
      eq(FtIdentity.validateUsername('david.okafor').valid, true);
      eq(FtIdentity.validateUsername('david_o').valid, true);
      eq(FtIdentity.validateUsername('a1b2c3').valid, true);
    });

    it('casefolds to one key', function () {
      eq(FtIdentity.usernameKey('  DaViD  '), 'david');
    });

    it('rejects the malformed shapes', function () {
      eq(FtIdentity.validateUsername('ab').valid, false, 'too short');
      eq(FtIdentity.validateUsername('a'.repeat(21)).valid, false, 'too long');
      eq(FtIdentity.validateUsername('1david').valid, false, 'starts with a digit');
      eq(FtIdentity.validateUsername('david.').valid, false, 'trailing dot');
      eq(FtIdentity.validateUsername('da..vid').valid, false, 'double dot');
      eq(FtIdentity.validateUsername('da vid').valid, false, 'space');
      eq(FtIdentity.validateUsername('da-vid').valid, false, 'hyphen');
      eq(FtIdentity.validateUsername('davi<d').valid, false, 'markup character');
    });

    it('reserves names that could impersonate the community', function () {
      eq(FtIdentity.validateUsername('flowtribe').valid, false);
      eq(FtIdentity.validateUsername('ADMIN').valid, false, 'reserved check is casefolded');
      eq(FtIdentity.validateUsername('support').valid, false);
    });
  });

  describe('FtIdentity PINs', function () {
    it('accepts a six-digit PIN that is not obvious', function () {
      eq(FtIdentity.validatePin('482913').valid, true);
      eq(FtIdentity.validatePin('729184').valid, true);
    });

    it('rejects the wrong length or non-digits', function () {
      eq(FtIdentity.validatePin('12345').valid, false);
      eq(FtIdentity.validatePin('1234567').valid, false);
      eq(FtIdentity.validatePin('48291a').valid, false);
      eq(FtIdentity.validatePin('').valid, false);
    });

    it('rejects repeats and sequences', function () {
      eq(FtIdentity.validatePin('111111').code, 'PIN_WEAK');
      eq(FtIdentity.validatePin('123456').code, 'PIN_WEAK');
      eq(FtIdentity.validatePin('654321').code, 'PIN_WEAK');
    });

    it('normalises an invite code the way people paste it', function () {
      eq(FtIdentity.inviteKey(' create-99 '), 'CREATE99');
      eq(FtIdentity.inviteKey('create 99'), 'CREATE99');
    });
  });

  describe('FtIdentity login backoff', function () {
    it('does not delay the first four attempts', function () {
      eq(FtIdentity.backoffMs(0), 0);
      eq(FtIdentity.backoffMs(4), 0);
    });

    it('escalates from thirty seconds', function () {
      eq(FtIdentity.backoffMs(5), 30000);
      eq(FtIdentity.backoffMs(6), 120000);
      eq(FtIdentity.backoffMs(7), 480000);
    });

    it('caps so an account is never permanently unusable', function () {
      eq(FtIdentity.backoffMs(8), 1800000);
      eq(FtIdentity.backoffMs(500), 1800000, 'a scripted attack cannot lock someone out for good');
    });
  });

  /* =======================================================================
     FtAchievements
     ==================================================================== */

  describe('FtAchievements milestones', function () {
    var catalog = [
      { milestoneId: 'first-step', name: 'First Step' },
      { milestoneId: 'active-days-7', name: '7 Active Days' },
      { milestoneId: 'active-days-30', name: '30 Active Days' },
      { milestoneId: 'perfect-week', name: 'Perfect Week' },
      { milestoneId: 'posts-10', name: '10 Posts' },
      { milestoneId: 'posts-50', name: '50 Posts' },
      { milestoneId: 'weekly-champion', name: 'Weekly Champion' },
    ];

    function snapshot(over) {
      return Object.assign(
        {
          allTimePosts: 0, activeDays: 0, perfectWeeks: 0, longestWeekStreak: 0,
          distinctDaysThisWeek: 0, postsThisWeek: 0, weeklyGoal: 3,
          isFoundingMember: false, bestRankFinal: null,
        },
        over || {},
      );
    }

    it('unlocks First Step on the first post', function () {
      var out = FtAchievements.evaluateAll(catalog, snapshot({ allTimePosts: 1 }), []);
      eq(find(out, 'first-step').unlocked, true);
      eq(find(out, 'posts-10').unlocked, false);
    });

    it('counts active days rather than consecutive days', function () {
      // A 3-post member posting Mon/Wed/Fri has no consecutive run at all.
      var out = FtAchievements.evaluateAll(catalog, snapshot({ activeDays: 7 }), []);
      eq(find(out, 'active-days-7').unlocked, true, 'reachable on any goal tier');
    });

    it('reports progress below the threshold', function () {
      var out = FtAchievements.evaluateAll(catalog, snapshot({ activeDays: 22 }), []);
      var m = find(out, 'active-days-30');
      eq(m.unlocked, false);
      eq(m.progress, 22);
      eq(m.target, 30);
    });

    it('unlocks Perfect Week only on separate days', function () {
      var batched = snapshot({ postsThisWeek: 3, distinctDaysThisWeek: 1, weeklyGoal: 3 });
      eq(find(FtAchievements.evaluateAll(catalog, batched, []), 'perfect-week').unlocked, false);

      var spread = snapshot({ postsThisWeek: 3, distinctDaysThisWeek: 3, weeklyGoal: 3 });
      eq(find(FtAchievements.evaluateAll(catalog, spread, []), 'perfect-week').unlocked, true);
    });

    it('never revokes a milestone already earned', function () {
      // Zero posts now, but first-step was recorded — it must stay.
      var out = FtAchievements.evaluateAll(catalog, snapshot(), ['first-step']);
      var m = find(out, 'first-step');
      eq(m.unlocked, true);
      eq(m.newlyUnlocked, false, 'and it is not celebrated a second time');
    });

    it('reports only genuinely new unlocks', function () {
      var fresh = FtAchievements.newlyUnlocked(catalog, snapshot({ allTimePosts: 10, activeDays: 7 }), ['first-step']);
      var ids = fresh.map(function (m) { return m.milestoneId; }).sort();
      eq(ids, ['active-days-7', 'posts-10']);
    });

    it('picks the nearest unearned milestone as next', function () {
      var out = FtAchievements.evaluateAll(catalog, snapshot({ allTimePosts: 9, activeDays: 2 }), []);
      eq(FtAchievements.nextMilestone(out).milestoneId, 'posts-10', '9 of 10 beats 2 of 7');
    });

    it('returns null for next when everything is earned', function () {
      var everything = catalog.map(function (c) { return c.milestoneId; });
      var out = FtAchievements.evaluateAll(catalog, snapshot(), everything);
      eq(FtAchievements.nextMilestone(out), null);
    });

    it('ignores a catalog row with no evaluator instead of throwing', function () {
      var out = FtAchievements.evaluateAll(
        catalog.concat([{ milestoneId: 'invented-by-an-admin', name: 'Mystery' }]),
        snapshot(),
        [],
      );
      eq(out.length, catalog.length, 'the unknown row is skipped, the rest still render');
    });

    it('settles Weekly Champion only on a first-place finish', function () {
      eq(find(FtAchievements.evaluateAll(catalog, snapshot({ bestRankFinal: 2 }), []), 'weekly-champion').unlocked, false);
      eq(find(FtAchievements.evaluateAll(catalog, snapshot({ bestRankFinal: 1 }), []), 'weekly-champion').unlocked, true);
    });

    function find(list, id) {
      return list.filter(function (m) { return m.milestoneId === id; })[0];
    }
  });

  describe('FtAchievements Flow Levels', function () {
    var levels = [
      { levelId: 'seedling', name: 'Seedling', sortOrder: 1, requiredPosts: 0, requiredPerfectWeeks: 0 },
      { levelId: 'creator', name: 'Creator', sortOrder: 2, requiredPosts: 10, requiredPerfectWeeks: 1 },
      { levelId: 'builder', name: 'Builder', sortOrder: 3, requiredPosts: 50, requiredPerfectWeeks: 4 },
      { levelId: 'consistent-creator', name: 'Consistent Creator', sortOrder: 4, requiredPosts: 100, requiredPerfectWeeks: 12 },
    ];

    function snap(posts, weeks) {
      return { allTimePosts: posts, perfectWeeks: weeks };
    }

    it('starts everyone at Seedling', function () {
      eq(FtAchievements.evaluateLevel(levels, snap(0, 0)).current.levelId, 'seedling');
    });

    it('requires BOTH thresholds', function () {
      // Plenty of posts, not enough weeks — a burst is not a habit.
      eq(FtAchievements.evaluateLevel(levels, snap(80, 1)).current.levelId, 'creator');
      // Plenty of weeks, not enough posts.
      eq(FtAchievements.evaluateLevel(levels, snap(12, 20)).current.levelId, 'creator');
      // Both met.
      eq(FtAchievements.evaluateLevel(levels, snap(60, 5)).current.levelId, 'builder');
    });

    it('names the next level and its two requirements', function () {
      var result = FtAchievements.evaluateLevel(levels, snap(60, 5));
      eq(result.next.levelId, 'consistent-creator');
      eq(result.progress.posts, { current: 60, target: 100 });
      eq(result.progress.perfectWeeks, { current: 5, target: 12 });
    });

    it('shows the lesser ratio, so the real blocker is visible', function () {
      // 60/100 posts is 0.6; 5/12 weeks is ~0.42. Weeks are the blocker.
      var result = FtAchievements.evaluateLevel(levels, snap(60, 5));
      ok(Math.abs(result.progress.ratio - 5 / 12) < 1e-9);
    });

    it('reports no next level at the top', function () {
      var result = FtAchievements.evaluateLevel(levels, snap(500, 60));
      eq(result.current.levelId, 'consistent-creator');
      eq(result.next, null);
      eq(result.progress, null);
    });

    it('is order-independent', function () {
      var shuffled = [levels[3], levels[0], levels[2], levels[1]];
      eq(FtAchievements.evaluateLevel(shuffled, snap(60, 5)).current.levelId, 'builder');
    });
  });

  /* ---- runner ---- */

  root.FtTests = {
    results: results,
    summary: function () {
      var passed = 0;
      var failed = 0;
      var failures = [];

      results.forEach(function (group) {
        group.cases.forEach(function (c) {
          if (c.ok) passed += 1;
          else {
            failed += 1;
            failures.push(group.name + ' › ' + c.name + ' — ' + c.message);
          }
        });
      });

      return { passed: passed, failed: failed, total: passed + failed, failures: failures };
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
