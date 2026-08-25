/**
 * Production smoke test.
 *
 * Run from the Apps Script editor AFTER deploying. Everything before this
 * point was verified against an in-memory fake of Google's APIs; this is the
 * first thing that exercises the real spreadsheet, the real lock service, the
 * real cache, and the real crypto.
 *
 * WHAT IT DOES
 * Creates a throwaway member, drives them through every member journey, checks
 * the numbers, then deletes every row it created. It is safe to run against a
 * live community — it touches nothing but its own test member — but running it
 * on a copy first is still the better habit.
 *
 * WHAT IT PROVES that the fake could not
 * Real Sheets latency, real concurrency primitives, real digest output, real
 * quota behaviour, and that the tabs and headers in THIS spreadsheet match what
 * the code expects.
 *
 * @see docs/deployment.md
 */

/** Everything the test creates is prefixed, so cleanup can find it. */
var SMOKE_PREFIX = 'smoketest';

/**
 * Run the full production smoke test.
 *
 * @returns {string} a readable report; also written to the execution log
 */
function setupSmokeTest() {
  var results = [];
  var started = Date.now();
  var created = { memberId: null, inviteCode: null };

  function check(name, fn) {
    var stepStarted = Date.now();

    try {
      var detail = fn();
      results.push({
        ok: true,
        name: name,
        ms: Date.now() - stepStarted,
        detail: detail || '',
      });
    } catch (error) {
      results.push({
        ok: false,
        name: name,
        ms: Date.now() - stepStarted,
        detail: String(error && error.message ? error.message : error),
      });
      throw error; // Stop at the first failure — later steps depend on earlier ones.
    }
  }

  try {
    /* ---- Environment ---- */

    check('Spreadsheet reachable', function () {
      return SheetClient.book().getName();
    });

    check('All 14 sheets present with correct headers', function () {
      var problems = [];

      Object.keys(SHEET_HEADERS).forEach(function (name) {
        var result = SheetClient.verifyHeaders(name, SHEET_HEADERS[name]);
        if (!result.ok) problems.push(name);
      });

      if (problems.length) throw new Error('Header mismatch: ' + problems.join(', '));
      return Object.keys(SHEET_HEADERS).length + ' sheets';
    });

    check('Secrets present', function () {
      var props = PropertiesService.getScriptProperties();
      if (!props.getProperty(SECRET_KEYS.PIN_PEPPER)) throw new Error('PIN pepper missing');
      if (!props.getProperty(SECRET_KEYS.SESSION_KEY)) throw new Error('Session key missing');
      return 'pepper + session key';
    });

    check('Timezone is Africa/Lagos', function () {
      var actual = SheetClient.book().getSpreadsheetTimeZone();
      if (actual !== TIMEZONE) {
        throw new Error('Spreadsheet timezone is ' + actual + ', expected ' + TIMEZONE);
      }
      return actual;
    });

    check('Catalog seeded and every milestone can unlock', function () {
      var catalog = MilestoneCatalogRepo.listActive();
      var known = FtAchievements.knownIds();

      if (!catalog.length) throw new Error('MilestoneCatalog is empty');

      var orphans = catalog
        .map(function (entry) { return entry.milestoneId; })
        .filter(function (id) { return known.indexOf(id) === -1; });

      if (orphans.length) throw new Error('No evaluator for: ' + orphans.join(', '));
      if (!FlowLevelRepo.listOrdered().length) throw new Error('FlowLevels is empty');

      return catalog.length + ' milestones, ' + FlowLevelRepo.listOrdered().length + ' levels';
    });

    check('A Super Admin exists', function () {
      var count = MemberRepo.countActiveSuperAdmins();
      if (count === 0) throw new Error('No active Super Admin — run setupSeedSuperAdmin()');
      return count + ' active';
    });

    check('Scheduled jobs installed', function () {
      var handlers = ScriptApp.getProjectTriggers().map(function (trigger) {
        return trigger.getHandlerFunction();
      });

      var required = ['jobWeeklyRollover', 'jobNightlyReconcile', 'jobRollupRepair'];
      var missing = required.filter(function (name) { return handlers.indexOf(name) === -1; });

      if (missing.length) throw new Error('Missing triggers: ' + missing.join(', '));
      return handlers.length + ' triggers';
    });

    /* ---- Crypto, against the real digest implementation ---- */

    check('PIN hashing is stable and salted', function () {
      var salt = Crypto.randomHex(16);
      var a = Crypto.hashPin('482605', salt, 100);
      var b = Crypto.hashPin('482605', salt, 100);
      var c = Crypto.hashPin('482605', Crypto.randomHex(16), 100);

      if (a !== b) throw new Error('Hashing is not deterministic');
      if (a === c) throw new Error('Salt is not being applied');
      if (!Crypto.timingSafeEqual(a, b)) throw new Error('Constant-time compare failed');
      if (Crypto.timingSafeEqual(a, c)) throw new Error('Compare matched different hashes');

      return a.length + '-char digest';
    });

    /* ---- The member journey ---- */

    var admin = MemberRepo.all().filter(function (member) {
      return member.role === ROLES.SUPER_ADMIN && member.status === MEMBER_STATUS.ACTIVE;
    })[0];

    check('Invite generation', function () {
      var codes = InviteService.generate(1, { note: SMOKE_PREFIX }, admin);
      created.inviteCode = codes[0].code;
      return created.inviteCode;
    });

    check('Registration', function () {
      var result = RegistrationFlow.register({
        fullName: 'Smoke Test',
        username: SMOKE_PREFIX + '.user',
        pin: '482607',
        pinConfirm: '482607',
        platform: 'LinkedIn',
        weeklyGoal: 3,
        inviteCode: created.inviteCode,
        consentFeature: false,
      }, 'smoke-test');

      created.memberId = result.member.memberId;
      if (!result.token) throw new Error('No session token returned');

      return result.member.memberId;
    });

    check('Invite cannot be redeemed twice', function () {
      try {
        RegistrationFlow.register({
          fullName: 'Second Try',
          username: SMOKE_PREFIX + '.second',
          pin: '482609',
          pinConfirm: '482609',
          platform: 'X',
          weeklyGoal: 3,
          inviteCode: created.inviteCode,
        }, 'smoke-test');
      } catch (error) {
        if (error.code === 'INVITE_USED') return 'correctly refused';
        throw error;
      }
      throw new Error('A used invite code was accepted a second time');
    });

    var session = null;

    check('Login', function () {
      var result = LoginFlow.login(SMOKE_PREFIX + '.user', '482607', 'smoke-test');
      session = result;
      if (!result.token) throw new Error('No token');
      return 'token issued';
    });

    check('Wrong PIN is refused', function () {
      try {
        LoginFlow.login(SMOKE_PREFIX + '.user', '999919', 'smoke-test');
      } catch (error) {
        if (error.code === 'AUTH_FAILED') return 'correctly refused';
        throw error;
      }
      throw new Error('A wrong PIN was accepted');
    });

    check('Session resolves and carries the right member', function () {
      var resolved = SessionService.resolve(session.token);
      if (resolved.member.memberId !== created.memberId) throw new Error('Wrong member');
      return resolved.member.username;
    });

    var member = MemberRepo.findById(created.memberId);

    check('Submission accepted on the registered platform', function () {
      var result = SubmissionFlow.create(member, 'https://www.linkedin.com/posts/' + SMOKE_PREFIX + '-1');
      if (result.statsSettling) throw new Error('Rollups did not complete');
      if (result.week.postCount !== 1) throw new Error('Week count is ' + result.week.postCount);
      return 'logged in ' + (Date.now() - started) + 'ms total';
    });

    check('Wrong platform is refused', function () {
      try {
        SubmissionService.validate(MemberRepo.findById(created.memberId), 'https://instagram.com/p/x');
      } catch (error) {
        if (error.code === 'PLATFORM_MISMATCH') return 'correctly refused';
        throw error;
      }
      throw new Error('A mismatched platform was accepted');
    });

    check('Duplicate link is refused', function () {
      try {
        SubmissionService.validate(
          MemberRepo.findById(created.memberId),
          'https://linkedin.com/posts/' + SMOKE_PREFIX + '-1?utm_source=x',
        );
      } catch (error) {
        if (error.code === 'DUPLICATE_LINK') return 'correctly refused, tracking params ignored';
        throw error;
      }
      throw new Error('A duplicate link was accepted');
    });

    check('Activity calendar recorded the day', function () {
      var days = CalendarService.lifetimeActiveDays(created.memberId);
      if (days !== 1) throw new Error('Active days is ' + days + ', expected 1');
      return '1 active day';
    });

    check('First Step milestone unlocked', function () {
      var earned = MemberMilestoneRepo.earnedIds(created.memberId);
      if (earned.indexOf('first-step') === -1) {
        throw new Error('Earned: ' + JSON.stringify(earned));
      }
      return earned.length + ' milestone(s)';
    });

    check('Dashboard assembles', function () {
      var context = {
        member: MemberRepo.findById(created.memberId),
        payload: {},
      };

      var dashboard = MemberController.dashboard(context);

      ['member', 'level', 'week', 'calendar', 'milestones', 'stats', 'leaderboard', 'recent']
        .forEach(function (key) {
          if (dashboard[key] === undefined) throw new Error('Missing section: ' + key);
        });

      if (dashboard.member.fullName !== 'Smoke Test') throw new Error('Wrong member on dashboard');
      return 'all sections present';
    });

    check('Leaderboard includes the test member', function () {
      var weekStart = FtWeek.weekStartKey(new Date(), TIMEZONE);
      var board = LeaderboardService.build('week', 'posts', weekStart);
      var rank = LeaderboardService.rankOf(board, created.memberId);

      if (rank === null) throw new Error('Test member is not ranked despite posting');
      return 'ranked #' + rank + ' of ' + board.length;
    });

    /* ---- Admin ---- */

    check('Admin overview computes', function () {
      var weekStart = FtWeek.weekStartKey(new Date(), TIMEZONE);
      var metrics = AnalyticsService.overview(weekStart);
      if (!metrics.length) throw new Error('No metrics returned');
      return metrics.length + ' metrics';
    });

    check('Analytics series compute', function () {
      var data = AnalyticsService.series(4);

      ['weeklyGrowth', 'registrationTrend', 'postingTrend', 'goalCompletion',
       'platformDistribution', 'flowLevelDistribution', 'activityHeatmap']
        .forEach(function (key) {
          if (!Array.isArray(data[key])) throw new Error('Missing series: ' + key);
        });

      return '7 series';
    });

    check('A Member holds no admin capability', function () {
      var caps = capabilitiesFor_(ROLES.MEMBER);

      ['admin:overview:read', 'member:read:all', 'settings:update', 'audit:read']
        .forEach(function (capability) {
          if (caps.indexOf(capability) !== -1) {
            throw new Error('Member holds ' + capability);
          }
        });

      return caps.length + ' member capabilities, none admin';
    });

    check('Reconcile rebuilds from the ledger', function () {
      var result = Reconcile.member(created.memberId);
      if (result.allTimePosts !== 1) throw new Error('Rebuilt to ' + result.allTimePosts);
      return 'consistent';
    });

    check('Formula injection is neutralised', function () {
      MemberService.updateFullName(
        MemberRepo.findById(created.memberId),
        '=IMPORTXML("evil","//x")',
      );

      // Re-read from the sheet. The value returned by the service is the
      // in-memory one; what matters is what actually landed in the cell,
      // since sanitising happens at the write boundary in SheetClient.
      var reread = MemberRepo.findById(created.memberId);

      // THE definitive question is not what the cell says — it is whether the
      // cell is a FORMULA. getFormula() returns the source of a live formula
      // and an empty string for literal text, so this is the only check that
      // actually decides whether the payload can execute.
      //
      // The obvious check — does the value start with '=' — is WRONG against
      // real Sheets, and reported a false failure in production. sanitise()
      // prefixes an apostrophe, which Sheets treats as a formatting marker
      // meaning "literal text" rather than as part of the value. The cell is
      // inert, but getValue() returns the text WITHOUT the apostrophe, so a
      // charAt(0) test sees the '=' it just successfully defused.
      var cell = SheetClient.sheet(SHEETS.MEMBERS)
        .getRange(reread.rowIndex, M.FULL_NAME + 1);

      var formula = cell.getFormula ? cell.getFormula() : '';

      if (formula) {
        throw new Error('Stored as a LIVE FORMULA: ' + formula);
      }

      // Belt and braces: the payload must still be there as text. A cell that
      // was silently emptied would also report no formula.
      if (String(reread.fullName).indexOf('IMPORTXML') === -1) {
        throw new Error('Payload was lost rather than escaped: ' + reread.fullName);
      }

      return 'inert text, not a formula';
    });
  } catch (error) {
    Logger_.error('smoketest', error);
  } finally {
    // Always clean up, even when a check failed part-way through — a half-made
    // test member left in a live community is worse than a failed test.
    try {
      var removed = smokeTestCleanup();
      results.push({ ok: true, name: 'Cleanup', ms: 0, detail: removed });
    } catch (cleanupError) {
      results.push({
        ok: false,
        name: 'Cleanup',
        ms: 0,
        detail: 'MANUAL CLEANUP NEEDED: ' + cleanupError.message,
      });
    }
  }

  var passed = results.filter(function (r) { return r.ok; }).length;
  var failed = results.length - passed;

  var lines = results.map(function (r) {
    return (r.ok ? '  PASS  ' : '  FAIL  ') + r.name +
      (r.ms ? ' (' + r.ms + 'ms)' : '') +
      (r.detail ? ' — ' + r.detail : '');
  });

  var report = [
    '',
    'FLOW TRIBE — PRODUCTION SMOKE TEST',
    failed === 0 ? 'ALL ' + passed + ' CHECKS PASSED' : failed + ' FAILED, ' + passed + ' passed',
    'Total: ' + (Date.now() - started) + 'ms',
    '',
  ].concat(lines).join('\n');

  Logger.log(report);
  return report;
}

/**
 * Remove everything the smoke test created.
 *
 * Called automatically at the end of `setupSmokeTest`. Exposed separately so
 * it can be run by hand if a test is interrupted.
 *
 * @returns {string}
 */
function smokeTestCleanup() {
  var book = SheetClient.book();
  var removed = [];

  var member = MemberRepo.findByUsernameKey(SMOKE_PREFIX + '.user');
  var memberId = member ? member.memberId : null;

  // Newest row first, so deleting one does not shift the index of the next.
  function purge(sheetName, matches) {
    var sheet = book.getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 2) return;

    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    var doomed = [];

    values.forEach(function (row, index) {
      if (matches(row)) doomed.push(index + 2);
    });

    doomed.reverse().forEach(function (rowIndex) { sheet.deleteRow(rowIndex); });
    if (doomed.length) removed.push(sheetName + ':' + doomed.length);
  }

  if (memberId) {
    purge(SHEETS.SUBMISSIONS, function (row) { return String(row[S.MEMBER_ID]) === memberId; });
    purge(SHEETS.ACTIVITY_CALENDAR, function (row) { return String(row[AC.MEMBER_ID]) === memberId; });
    purge(SHEETS.WEEKLY_STATS, function (row) { return String(row[W.MEMBER_ID]) === memberId; });
    purge(SHEETS.MEMBER_MILESTONES, function (row) { return String(row[MM.MEMBER_ID]) === memberId; });
    purge(SHEETS.PROFILES, function (row) { return String(row[P.MEMBER_ID]) === memberId; });
    purge(SHEETS.SESSIONS, function (row) { return String(row[SE.MEMBER_ID]) === memberId; });
    purge(SHEETS.NOTIFICATIONS, function (row) { return String(row[N.MEMBER_ID]) === memberId; });
    purge(SHEETS.MEMBERS, function (row) { return String(row[M.MEMBER_ID]) === memberId; });
  }

  purge(SHEETS.INVITE_CODES, function (row) {
    return String(row[I.NOTE]) === SMOKE_PREFIX;
  });

  // Audit rows are deliberately KEPT. An append-only log that a test can erase
  // is not an append-only log, and the entries are honest history: the test
  // really did register a member and reset nothing.
  CacheClient.reset();
  SheetClient.reset();

  return removed.length ? 'removed ' + removed.join(', ') : 'nothing to remove';
}
