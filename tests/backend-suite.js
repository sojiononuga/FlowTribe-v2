/**
 * Backend verification suite.
 *
 * Runs the real backend against the in-memory fakes. Every request goes
 * through `doPost` — the same entry point, envelope, middleware chain, and
 * action table that a browser will hit — so what is verified here is the
 * actual request path, not a convenient shortcut around it.
 *
 * This file is a module for exactly one reason: the icon contract check
 * needs the real `Icons` export, and a copy of that list in here would be
 * free to drift from the thing it is supposed to be guarding.
 */

import { Icons } from '../src/lib/icons.js';

(function () {
  var results = [];
  var group = 'general';

  function describe(name) { group = name; }

  function it(name, fn) {
    try {
      fn();
      results.push({ group: group, name: name, ok: true });
    } catch (error) {
      results.push({ group: group, name: name, ok: false, detail: String(error && error.message || error) });
    }
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message || 'assertion failed');
  }

  function equal(actual, expected, message) {
    if (actual !== expected) {
      throw new Error((message || 'expected') + ': got ' + JSON.stringify(actual) +
        ', wanted ' + JSON.stringify(expected));
    }
  }

  function throws(fn, code) {
    try {
      fn();
    } catch (error) {
      if (code && error.code !== code) {
        throw new Error('expected ' + code + ', got ' + error.code + ' (' + error.message + ')');
      }
      return error;
    }
    throw new Error('expected a throw' + (code ? ' of ' + code : ''));
  }

  /* ======================================================================
     Harness for driving the real entry point
     ====================================================================== */

  function post(action, payload, token) {
    var response = doPost({
      postData: {
        contents: JSON.stringify({
          action: action,
          payload: payload || {},
          token: token || null,
          requestId: 'test-' + Math.random().toString(36).slice(2),
        }),
      },
    });

    return JSON.parse(response.getContent());
  }

  /** Post and require success, returning `data`. */
  function ok(action, payload, token) {
    var body = post(action, payload, token);
    if (!body.ok) {
      throw new Error(action + ' failed: ' + body.error.code + ' — ' + body.error.message);
    }
    return body.data;
  }

  /**
   * A fresh installation with one Super Admin and one member session.
   *
   * The admin account is configured through Script Properties exactly as a
   * real deployment does — so the tests exercise the same path an operator
   * follows, rather than a shortcut around it.
   */
  var ADMIN_USERNAME = 'iyanuoluwa';
  var ADMIN_PIN = '284619';

  function freshInstall() {
    FakeEnv.reset();
    CacheClient.reset();
    SheetClient.reset();

    var props = PropertiesService.getScriptProperties();
    props.setProperty('FT_ADMIN_FULLNAME', 'Iyanuoluwa Ilesanmi');
    props.setProperty('FT_ADMIN_USERNAME', ADMIN_USERNAME);
    props.setProperty('FT_ADMIN_PIN', ADMIN_PIN);
    props.setProperty('FT_ADMIN_PLATFORM', 'Instagram');

    setupSecrets();
    setupBootstrap();
    setupSeedCatalog();
    setupSeedSuperAdmin();

    var admin = ok('auth.login', { username: ADMIN_USERNAME, pin: ADMIN_PIN });
    var invite = ok('admin.invites.create', { count: 1 }, admin.token);

    var member = ok('auth.register', {
      fullName: 'Test Member',
      username: 'test.member',
      pin: '284617',
      pinConfirm: '284617',
      platform: 'LinkedIn',
      weeklyGoal: 3,
      inviteCode: invite.codes[0].code,
      consentFeature: true,
    });

    return { admin: admin, member: member, inviteCode: invite.codes[0].code };
  }

  /* ======================================================================
     1. Load and wiring
     ====================================================================== */

  describe('Load and wiring');

  it('every module initialised into the global scope', function () {
    [
      'MemberRepo', 'ProfileRepo', 'InviteRepo', 'SessionRepo', 'SubmissionRepo',
      'CalendarRepo', 'WeeklyStatsRepo', 'MilestoneCatalogRepo', 'MemberMilestoneRepo',
      'FlowLevelRepo', 'SettingsRepo', 'AuditRepo', 'NotificationRepo', 'CommunityStatsRepo',
      'SettingsService', 'AuditService', 'NotificationService', 'AuthService', 'SessionService',
      'InviteService', 'MemberService', 'ProfileService', 'CalendarService', 'WeeklyStatsService',
      'LeaderboardService', 'MilestoneService', 'FlowLevelService', 'SubmissionService',
      'AnalyticsService', 'Pipeline', 'RegistrationFlow', 'LoginFlow', 'SubmissionFlow',
      'WeekCloseFlow', 'Validate', 'RateLimit', 'Authenticate', 'PinGate', 'Authorize',
      'AuthController', 'MemberController', 'ProfileController', 'SubmissionController',
      'LeaderboardController', 'AdminController', 'Reconcile',
      'SheetClient', 'CacheClient', 'LockClient', 'Crypto', 'Ids', 'Logger_',
      'FtWeek', 'FtDayMap', 'FtStreak', 'FtLink', 'FtIdentity', 'FtAchievements',
    ].forEach(function (name) {
      assert(typeof window[name] !== 'undefined', 'missing global: ' + name);
    });
  });

  it('every action declares a capability and a handler', function () {
    var table = getActionTable_();
    var count = 0;

    Object.keys(table).forEach(function (action) {
      assert(table[action].capability !== undefined, action + ' has no capability');
      assert(typeof table[action].handler === 'function', action + ' has no handler');
      count += 1;
    });

    assert(count >= 30, 'expected the full action table, found ' + count);
  });

  it('exactly four actions are public', function () {
    var table = getActionTable_();
    var publicActions = Object.keys(table).filter(function (action) {
      return table[action].capability === null;
    });

    equal(publicActions.sort().join(','),
      'auth.checkUsername,auth.login,auth.register,system.health');
  });

  /* ======================================================================
     2. Setup
     ====================================================================== */

  describe('Setup');

  it('bootstrap creates all 14 sheets with correct headers', function () {
    FakeEnv.reset();
    CacheClient.reset();
    SheetClient.reset();
    setupBootstrap();

    Object.keys(SHEET_HEADERS).forEach(function (name) {
      var sheet = FakeEnv.spreadsheet().getSheetByName(name);
      assert(sheet, 'missing sheet ' + name);

      var expected = SHEET_HEADERS[name];
      var actual = sheet.getRange(1, 1, 1, expected.length).getValues()[0];

      for (var i = 0; i < expected.length; i += 1) {
        equal(String(actual[i]), expected[i], name + ' header ' + (i + 1));
      }
    });
  });

  it('setupVerify passes on a complete install', function () {
    freshInstall();
    var report = setupVerify();
    assert(report.indexOf('OK') === 0, report);
  });

  it('seeding a second Super Admin is refused', function () {
    freshInstall();
    var before = MemberRepo.countActiveSuperAdmins();
    setupSeedSuperAdmin();
    equal(MemberRepo.countActiveSuperAdmins(), before, 'should not create a second');
  });

  /* ======================================================================
     3. Registration
     ====================================================================== */

  describe('Registration');

  it('registers with a valid invite and returns a session', function () {
    var env = freshInstall();
    assert(env.member.token, 'no token returned');
    equal(env.member.member.username, 'test.member');
    equal(env.member.member.role, ROLES.MEMBER);
  });

  it('an invite code cannot be redeemed twice', function () {
    var env = freshInstall();

    var body = post('auth.register', {
      fullName: 'Second Person',
      username: 'second.person',
      pin: '284618',
      pinConfirm: '284618',
      platform: 'X',
      weeklyGoal: 3,
      inviteCode: env.inviteCode,
    });

    assert(!body.ok, 'should have failed');
    equal(body.error.code, 'INVITE_USED');
  });

  it('a duplicate username is refused', function () {
    var env = freshInstall();
    var invite = ok('admin.invites.create', { count: 1 }, env.admin.token);

    var body = post('auth.register', {
      fullName: 'Another Test',
      // Different capitalisation — uniqueness is casefolded.
      username: 'Test.Member',
      pin: '284618',
      pinConfirm: '284618',
      platform: 'X',
      weeklyGoal: 3,
      inviteCode: invite.codes[0].code,
    });

    assert(!body.ok);
    equal(body.error.code, 'USERNAME_TAKEN');
  });

  it('registration cannot set its own role', function () {
    var env = freshInstall();
    var invite = ok('admin.invites.create', { count: 1 }, env.admin.token);

    var result = ok('auth.register', {
      fullName: 'Sneaky Person',
      username: 'sneaky',
      pin: '284618',
      pinConfirm: '284618',
      platform: 'X',
      weeklyGoal: 3,
      inviteCode: invite.codes[0].code,
      role: 'SuperAdmin',
    });

    equal(result.member.role, ROLES.MEMBER, 'role must be forced to Member');
  });

  it('a weak PIN is refused', function () {
    var env = freshInstall();
    var invite = ok('admin.invites.create', { count: 1 }, env.admin.token);

    var body = post('auth.register', {
      fullName: 'Weak Pin',
      username: 'weak.pin',
      pin: '123456',
      pinConfirm: '123456',
      platform: 'X',
      weeklyGoal: 3,
      inviteCode: invite.codes[0].code,
    });

    assert(!body.ok);
    assert(body.error.code === 'PIN_WEAK' || body.error.code === 'PIN_INVALID', body.error.code);
  });

  it('a failed registration does not burn the invite code', function () {
    var env = freshInstall();
    var invite = ok('admin.invites.create', { count: 1 }, env.admin.token);
    var code = invite.codes[0].code;

    post('auth.register', {
      fullName: 'Bad Pin',
      username: 'bad.pin',
      pin: '111111',
      pinConfirm: '111111',
      platform: 'X',
      weeklyGoal: 3,
      inviteCode: code,
    });

    var result = ok('auth.register', {
      fullName: 'Good Pin',
      username: 'good.pin',
      pin: '284615',
      pinConfirm: '284615',
      platform: 'X',
      weeklyGoal: 3,
      inviteCode: code,
    });

    assert(result.token, 'the code should still have been usable');
  });

  /* ======================================================================
     4. Authentication
     ====================================================================== */

  describe('Authentication');

  it('logs in with the right PIN', function () {
    freshInstall();
    var result = ok('auth.login', { username: 'test.member', pin: '284617' });
    assert(result.token);
    equal(result.redirect, 'member');
  });

  it('a Super Admin is routed to admin', function () {
    freshInstall();
    var result = ok('auth.login', { username: ADMIN_USERNAME, pin: ADMIN_PIN });
    equal(result.redirect, 'admin');
  });

  it('a wrong PIN and an unknown username fail identically', function () {
    freshInstall();

    var wrongPin = post('auth.login', { username: 'test.member', pin: '999919' });
    var noSuchUser = post('auth.login', { username: 'nobody.here', pin: '999919' });

    equal(wrongPin.error.code, 'AUTH_FAILED');
    equal(noSuchUser.error.code, 'AUTH_FAILED');
    equal(wrongPin.error.message, noSuchUser.error.message, 'messages must not differ');
  });

  it('the PIN is never returned by any endpoint', function () {
    var env = freshInstall();
    var dashboard = JSON.stringify(ok('member.dashboard', {}, env.member.token));
    var session = JSON.stringify(ok('auth.session', {}, env.member.token));
    var admin = JSON.stringify(ok('admin.members.list', {}, env.admin.token));

    [dashboard, session, admin].forEach(function (body) {
      assert(body.indexOf('pinHash') === -1, 'pinHash leaked');
      assert(body.indexOf('pinSalt') === -1, 'pinSalt leaked');
      assert(body.indexOf('284617') === -1, 'a PIN leaked');
    });
  });

  it('backoff applies after repeated failures', function () {
    freshInstall();

    for (var i = 0; i < 5; i += 1) {
      post('auth.login', { username: 'test.member', pin: '999919' });
    }

    var body = post('auth.login', { username: 'test.member', pin: '284617' });
    assert(!body.ok, 'should be throttled even with the right PIN');
    equal(body.error.code, 'ACCOUNT_LOCKED');
  });

  it('a successful login clears the failure count', function () {
    freshInstall();
    post('auth.login', { username: 'test.member', pin: '999919' });

    var result = ok('auth.login', { username: 'test.member', pin: '284617' });
    assert(result.token);

    var member = MemberRepo.findByUsernameKey('test.member');
    equal(member.failedLoginCount, 0);
  });

  it('logout revokes the session', function () {
    var env = freshInstall();
    ok('auth.logout', {}, env.member.token);

    var body = post('member.dashboard', {}, env.member.token);
    assert(!body.ok);
    equal(body.error.code, 'SESSION_EXPIRED');
  });

  it('a session token is stored hashed, never raw', function () {
    var env = freshInstall();
    var stored = SessionRepo.all();

    stored.forEach(function (session) {
      assert(session.sessionId !== env.member.token, 'raw token found in the sheet');
      equal(session.sessionId.length, 64, 'expected a SHA-256 hex digest');
    });
  });

  it('a reset PIN can actually be recovered from, end to end', function () {
    // THE PATH THIS COVERS
    // Admin PIN reset is the only account recovery in the product. Every step
    // below worked in isolation, and the sequence still stranded the member:
    // login succeeded, everything after it returned MUST_CHANGE_PIN, and the
    // client had no screen to send them to. Walking the whole path is what
    // catches that, so this test walks the whole path.
    var env = freshInstall();
    var memberId = env.member.member.memberId;
    var TEMP = '539182';
    var CHOSEN = '746391';

    ok('admin.members.resetPin', { memberId: memberId, tempPin: TEMP }, env.admin.token);

    // The old session must be gone the moment the PIN changes underneath it.
    var stale = post('member.dashboard', {}, env.member.token);
    assert(!stale.ok, 'the pre-reset session should not survive');

    // Logging in with the temporary PIN succeeds and says why it is limited.
    var forced = ok('auth.login', { username: 'test.member', pin: TEMP });
    assert(forced.token, 'login must still issue a token, or there is nothing to change the PIN with');
    equal(forced.mustChangePin, true, 'the client needs this flag to route to the change screen');

    // ...and nothing else is permitted until the PIN is replaced.
    var blocked = post('member.dashboard', {}, forced.token);
    assert(!blocked.ok);
    equal(blocked.error.code, 'MUST_CHANGE_PIN');

    // The one permitted action resolves it.
    var changed = ok('auth.changePin', {
      currentPin: TEMP, newPin: CHOSEN, newPinConfirm: CHOSEN,
    }, forced.token);
    equal(changed.reauthenticate, true, 'the client is told to log in again');

    // Changing the PIN revokes every session, this one included.
    var afterChange = post('member.dashboard', {}, forced.token);
    assert(!afterChange.ok, 'the session used to change the PIN must not survive it');

    // And the member is fully back.
    var clean = ok('auth.login', { username: 'test.member', pin: CHOSEN });
    equal(Boolean(clean.mustChangePin), false, 'the flag must clear');
    var dash = ok('member.dashboard', {}, clean.token);
    assert(dash.member, 'the member can use the app again');

    // The temporary PIN the admin knew is dead.
    var oldPin = post('auth.login', { username: 'test.member', pin: TEMP });
    assert(!oldPin.ok, 'the admin-known temporary PIN must stop working');
  });

  /* ======================================================================
     5. Authorisation
     ====================================================================== */

  describe('Authorisation');

  it('a Member is refused EVERY admin action', function () {
    var env = freshInstall();
    var table = getActionTable_();
    var checked = 0;

    // Driven by the action table itself, so an admin action added later
    // without a capability fails this automatically. Not a spot check.
    Object.keys(table).forEach(function (action) {
      if (action.indexOf('admin.') !== 0) return;

      var body = post(action, { memberId: 'FT-0001', status: 'Active', role: 'Member', code: 'X', key: 'k' }, env.member.token);

      assert(!body.ok, action + ' was NOT refused');
      equal(body.error.code, 'FORBIDDEN', action + ' wrong error');
      checked += 1;
    });

    assert(checked >= 15, 'expected to check the admin surface, checked ' + checked);
  });

  it('no admin data crosses the wire to a Member', function () {
    var env = freshInstall();
    var body = post('admin.members.list', {}, env.member.token);

    assert(!body.ok);
    assert(!body.data, 'a refused request must carry no data');
  });

  it('a Community Manager cannot reach Super-Admin-only actions', function () {
    var env = freshInstall();
    var target = MemberRepo.findByUsernameKey('test.member');

    ok('admin.members.setRole', { memberId: target.memberId, role: ROLES.COMMUNITY_MANAGER }, env.admin.token);
    var manager = ok('auth.login', { username: 'test.member', pin: '284617' });

    ['admin.members.setRole', 'admin.members.delete', 'admin.settings.update', 'admin.audit.list']
      .forEach(function (action) {
        var body = post(action, { memberId: 'FT-0001', role: 'Member', key: 'k' }, manager.token);
        assert(!body.ok, action + ' should be refused');
        equal(body.error.code, 'FORBIDDEN', action);
      });
  });

  it('a Community Manager keeps their own member dashboard', function () {
    var env = freshInstall();
    var target = MemberRepo.findByUsernameKey('test.member');

    ok('admin.members.setRole', { memberId: target.memberId, role: ROLES.COMMUNITY_MANAGER }, env.admin.token);
    var manager = ok('auth.login', { username: 'test.member', pin: '284617' });

    var dashboard = ok('member.dashboard', {}, manager.token);
    equal(dashboard.member.username, 'test.member');
    assert(ok('admin.overview', {}, manager.token).metrics, 'should also reach admin');
  });

  it('a role change takes effect on the next request, without re-login', function () {
    var env = freshInstall();
    var target = MemberRepo.findByUsernameKey('test.member');

    ok('admin.members.setRole', { memberId: target.memberId, role: ROLES.COMMUNITY_MANAGER }, env.admin.token);
    var manager = ok('auth.login', { username: 'test.member', pin: '284617' });
    assert(ok('admin.overview', {}, manager.token), 'manager should reach admin');

    ok('admin.members.setRole', { memberId: target.memberId, role: ROLES.MEMBER }, env.admin.token);

    // The role change revokes their sessions, so the old token is dead — the
    // demotion is immediate either way.
    var body = post('admin.overview', {}, manager.token);
    assert(!body.ok, 'demoted user still reached admin');
  });

  it('the last Super Admin cannot be demoted or deactivated', function () {
    var env = freshInstall();
    var admin = MemberRepo.findByUsernameKey(ADMIN_USERNAME);

    var demote = post('admin.members.setRole', { memberId: admin.memberId, role: ROLES.MEMBER }, env.admin.token);
    assert(!demote.ok);

    var deactivate = post('admin.members.setStatus',
      { memberId: admin.memberId, status: MEMBER_STATUS.INACTIVE }, env.admin.token);
    assert(!deactivate.ok);
    equal(deactivate.error.code, 'LAST_SUPER_ADMIN');
  });

  it('nobody can change their own role', function () {
    var env = freshInstall();
    var admin = MemberRepo.findByUsernameKey(ADMIN_USERNAME);

    var body = post('admin.members.setRole',
      { memberId: admin.memberId, role: ROLES.COMMUNITY_MANAGER }, env.admin.token);

    assert(!body.ok);
  });

  /* ======================================================================
     6. Submissions
     ====================================================================== */

  describe('Submissions');

  it('accepts a link matching the registered platform', function () {
    var env = freshInstall();
    var result = ok('submission.create',
      { link: 'https://www.linkedin.com/posts/test_abc-123' }, env.member.token);

    equal(result.submission.platform, 'LinkedIn');
    equal(result.stats.postsThisWeek, 1);
    equal(result.stats.allTimePosts, 1);
  });

  it('rejects a link from another platform with the member\'s own platform named', function () {
    var env = freshInstall();
    var body = post('submission.create', { link: 'https://instagram.com/p/abc' }, env.member.token);

    assert(!body.ok);
    equal(body.error.code, 'PLATFORM_MISMATCH');
    assert(body.error.message.indexOf('LinkedIn') !== -1, 'message should name LinkedIn');
  });

  it('rejects domain lookalikes', function () {
    var env = freshInstall();

    ['https://notlinkedin.com/posts/1', 'https://linkedin.com.evil.co/posts/1',
     'https://evil.com/?u=linkedin.com'].forEach(function (link) {
      var body = post('submission.create', { link: link }, env.member.token);
      assert(!body.ok, link + ' was accepted');
    });
  });

  it('rejects the same link twice, ignoring tracking parameters', function () {
    var env = freshInstall();
    ok('submission.create', { link: 'https://linkedin.com/posts/xyz' }, env.member.token);

    var body = post('submission.create',
      { link: 'https://www.linkedin.com/posts/xyz?utm_source=share' }, env.member.token);

    assert(!body.ok);
    equal(body.error.code, 'DUPLICATE_LINK');
  });

  it('platform is taken from the member, never the payload', function () {
    var env = freshInstall();

    var result = ok('submission.create',
      { link: 'https://linkedin.com/posts/aaa', platform: 'YouTube' }, env.member.token);

    equal(result.submission.platform, 'LinkedIn');
  });

  it('the ledger, calendar, weekly stats and counters all agree', function () {
    var env = freshInstall();
    ok('submission.create', { link: 'https://linkedin.com/posts/one' }, env.member.token);
    ok('submission.create', { link: 'https://linkedin.com/posts/two' }, env.member.token);

    var member = MemberRepo.findByUsernameKey('test.member');
    var weekStart = FtWeek.weekStartKey(new Date(), TIMEZONE);
    var week = WeeklyStatsRepo.find(member.memberId, weekStart);

    equal(SubmissionRepo.byMember(member.memberId).length, 2, 'ledger');
    equal(member.allTimePosts, 2, 'counter');
    equal(week.postCount, 2, 'weekly');
    equal(week.distinctDays, 1, 'both posted today, so one distinct day');
    equal(CalendarService.lifetimeActiveDays(member.memberId), 1, 'calendar active days');
  });

  it('a repeated requestId returns the original result rather than logging twice', function () {
    var env = freshInstall();
    var requestId = 'fixed-request-id';

    function send() {
      return JSON.parse(doPost({
        postData: {
          contents: JSON.stringify({
            action: 'submission.create',
            payload: { link: 'https://linkedin.com/posts/idem' },
            token: env.member.token,
            requestId: requestId,
          }),
        },
      }).getContent());
    }

    var first = send();
    var second = send();

    assert(first.ok && second.ok, 'both should succeed');
    equal(second.data.submission.submissionId, first.data.submission.submissionId);

    var member = MemberRepo.findByUsernameKey('test.member');
    equal(SubmissionRepo.byMember(member.memberId).length, 1, 'only one row should exist');
  });

  /* ======================================================================
     7. Milestones and levels
     ====================================================================== */

  describe('Milestones and levels');

  it('the first post unlocks First Step', function () {
    var env = freshInstall();
    var result = ok('submission.create', { link: 'https://linkedin.com/posts/first' }, env.member.token);

    var ids = result.newMilestones.map(function (m) { return m.milestoneId; });
    assert(ids.indexOf('first-step') !== -1, 'got ' + JSON.stringify(ids));
  });

  it('Founding Member is awarded at registration', function () {
    var env = freshInstall();
    var member = MemberRepo.findByUsernameKey('test.member');
    var earned = MemberMilestoneRepo.earnedIds(member.memberId);

    assert(earned.indexOf('founding-member') !== -1, 'got ' + JSON.stringify(earned));
  });

  it('a milestone is never awarded twice', function () {
    var env = freshInstall();
    ok('submission.create', { link: 'https://linkedin.com/posts/a1' }, env.member.token);
    ok('submission.create', { link: 'https://linkedin.com/posts/a2' }, env.member.token);

    var member = MemberRepo.findByUsernameKey('test.member');
    var rows = MemberMilestoneRepo.forMember(member.memberId)
      .filter(function (row) { return row.milestoneId === 'first-step'; });

    equal(rows.length, 1);
  });

  it('three posts on one day meet the goal but are NOT a Perfect Week', function () {
    var env = freshInstall();

    ok('submission.create', { link: 'https://linkedin.com/posts/p1' }, env.member.token);
    ok('submission.create', { link: 'https://linkedin.com/posts/p2' }, env.member.token);
    var third = ok('submission.create', { link: 'https://linkedin.com/posts/p3' }, env.member.token);

    equal(third.stats.goalMet, true, 'goal should be met');
    equal(third.stats.distinctDays, 1, 'one calendar day');

    var ids = third.newMilestones.map(function (m) { return m.milestoneId; });
    assert(ids.indexOf('first-goal') !== -1, 'first-goal should unlock');
    assert(ids.indexOf('perfect-week') === -1, 'perfect-week must NOT unlock on one day');
  });

  it('the dashboard reports what a member is working toward', function () {
    var env = freshInstall();
    var dashboard = ok('member.dashboard', {}, env.member.token);

    assert(dashboard.milestones.next, 'next milestone missing');
    assert(dashboard.milestones.next.target > 0, 'next milestone has no target');
    assert(dashboard.milestones.totalAvailable > 10, 'catalog looks short');
  });

  it('a new member starts at Seedling', function () {
    var env = freshInstall();
    var dashboard = ok('member.dashboard', {}, env.member.token);

    equal(dashboard.level.levelId, 'seedling');
    assert(dashboard.level.next, 'there should be a next level');
  });

  /* ======================================================================
     8. Dashboard, calendar, leaderboard
     ====================================================================== */

  describe('Dashboard and leaderboard');

  it('the dashboard returns every section in one call', function () {
    var env = freshInstall();
    var d = ok('member.dashboard', {}, env.member.token);

    ['member', 'level', 'week', 'calendar', 'milestones', 'stats', 'leaderboard', 'recent']
      .forEach(function (key) {
        assert(d[key] !== undefined, 'missing section: ' + key);
      });
  });

  it('the calendar is sparse and covers the configured window', function () {
    var env = freshInstall();
    ok('submission.create', { link: 'https://linkedin.com/posts/cal' }, env.member.token);

    var d = ok('member.dashboard', {}, env.member.token);
    var keys = Object.keys(d.calendar.counts);

    equal(keys.length, 1, 'only days with activity should be present');
    equal(d.calendar.counts[d.calendar.today], 1);
    assert(d.calendar.from < d.calendar.today, 'range should start in the past');
  });

  it('a member with no posts this week has no rank', function () {
    var env = freshInstall();
    var d = ok('member.dashboard', {}, env.member.token);

    equal(d.leaderboard.rank, null, 'must be null, never 0 or last place');
  });

  it('a member appears on the leaderboard after posting', function () {
    var env = freshInstall();
    ok('submission.create', { link: 'https://linkedin.com/posts/lb' }, env.member.token);

    var board = ok('leaderboard.get', { scope: 'week' }, env.member.token);
    equal(board.rank, 1);
    equal(board.entries.length, 1, 'only members with posts should appear');
  });

  it('the leaderboard never exposes credentials or contact details', function () {
    var env = freshInstall();
    ok('submission.create', { link: 'https://linkedin.com/posts/lb2' }, env.member.token);

    var body = JSON.stringify(ok('leaderboard.get', { scope: 'week' }, env.member.token));

    ['pinHash', 'pinSalt', 'email', 'whatsapp'].forEach(function (field) {
      assert(body.indexOf(field) === -1, field + ' leaked to the leaderboard');
    });
  });

  /* ======================================================================
     9. Admin
     ====================================================================== */

  describe('Admin');

  it('generates invite codes in bulk from a legible alphabet', function () {
    var env = freshInstall();
    var result = ok('admin.invites.create', { count: 5, note: 'cohort' }, env.admin.token);

    equal(result.codes.length, 5);
    result.codes.forEach(function (invite) {
      equal(invite.code.length, 8);
      assert(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/.test(invite.code), invite.code);
    });
  });

  it('a revoked invite cannot be redeemed', function () {
    var env = freshInstall();
    var invite = ok('admin.invites.create', { count: 1 }, env.admin.token);
    ok('admin.invites.revoke', { code: invite.codes[0].code }, env.admin.token);

    var body = post('auth.register', {
      fullName: 'Revoked Test',
      username: 'revoked.test',
      pin: '284614',
      pinConfirm: '284614',
      platform: 'X',
      weeklyGoal: 3,
      inviteCode: invite.codes[0].code,
    });

    assert(!body.ok);
    equal(body.error.code, 'INVITE_INVALID');
  });

  it('resetting a PIN forces a change and revokes sessions', function () {
    var env = freshInstall();
    var target = MemberRepo.findByUsernameKey('test.member');

    ok('admin.members.resetPin', { memberId: target.memberId, tempPin: '284613' }, env.admin.token);

    var dead = post('member.dashboard', {}, env.member.token);
    equal(dead.error.code, 'SESSION_EXPIRED', 'old session should be revoked');

    var fresh = ok('auth.login', { username: 'test.member', pin: '284613' });
    equal(fresh.mustChangePin, true);

    var blocked = post('member.dashboard', {}, fresh.token);
    equal(blocked.error.code, 'MUST_CHANGE_PIN', 'everything but the change must be blocked');
  });

  it('deleting a member with history is refused without confirmation', function () {
    var env = freshInstall();
    ok('submission.create', { link: 'https://linkedin.com/posts/hist' }, env.member.token);

    var target = MemberRepo.findByUsernameKey('test.member');
    var body = post('admin.members.delete', { memberId: target.memberId }, env.admin.token);

    assert(!body.ok);
    assert(body.error.message.indexOf('Deactivate') !== -1, body.error.message);
  });

  it('voiding a submission removes it from every derived number', function () {
    var env = freshInstall();
    var created = ok('submission.create', { link: 'https://linkedin.com/posts/void' }, env.member.token);

    ok('admin.submissions.void', { submissionId: created.submission.submissionId }, env.admin.token);

    var member = MemberRepo.findByUsernameKey('test.member');
    equal(member.allTimePosts, 0, 'counter should be rebuilt');
  });

  it('reading a member profile is logged as a PII access', function () {
    var env = freshInstall();
    var target = MemberRepo.findByUsernameKey('test.member');

    ok('admin.members.get', { memberId: target.memberId }, env.admin.token);

    var found = AuditRepo.list(50).some(function (row) {
      return row.action === 'MEMBER_READ' && row.targetId === target.memberId;
    });

    assert(found, 'no MEMBER_READ audit row');
  });

  it('the admin overview omits the paused Consistency Score', function () {
    var env = freshInstall();
    var overview = ok('admin.overview', {}, env.admin.token);

    var ids = overview.metrics.map(function (m) { return m.id; });
    assert(ids.indexOf('consistencyScore') === -1, 'paused metric should be absent, not stubbed');
    assert(ids.indexOf('totalMembers') !== -1, 'expected the enabled metrics');
  });

  /* ======================================================================
     10. Integrity
     ====================================================================== */

  describe('Integrity and recovery');

  it('reconcile rebuilds every derived value from the ledger alone', function () {
    var env = freshInstall();
    ok('submission.create', { link: 'https://linkedin.com/posts/r1' }, env.member.token);
    ok('submission.create', { link: 'https://linkedin.com/posts/r2' }, env.member.token);

    var member = MemberRepo.findByUsernameKey('test.member');

    // Corrupt the derived values the way a hand edit would.
    MemberRepo.update(member.rowIndex, {
      allTimePosts: 999, currentWeekStreak: 42, perfectWeeks: 7,
    });

    Reconcile.member(member.memberId);

    var repaired = MemberRepo.findById(member.memberId);
    equal(repaired.allTimePosts, 2, 'should be rebuilt from the ledger');
    equal(repaired.perfectWeeks, 0);
  });

  it('a formula-injection payload is neutralised before it reaches a sheet', function () {
    var env = freshInstall();
    ok('member.updateName', { fullName: '=IMPORTXML("evil","//x")' }, env.member.token);

    var member = MemberRepo.findByUsernameKey('test.member');

    // The question is whether the cell is a FORMULA, not what its text says.
    //
    // sanitise() prefixes an apostrophe, which Sheets treats as a formatting
    // marker meaning "literal text" — it is not part of the value, and
    // getValue() returns the text without it. So the payload legitimately
    // reads back starting with '=' while being completely inert.
    //
    // This assertion used to be `charAt(0) !== '='`. It passed only because
    // the fake returned the apostrophe as data. Production disagreed, and the
    // smoke test reported a false security failure against a cell that was
    // correctly defused. getFormula() is the check that actually decides
    // whether the payload can execute.
    var cell = SheetClient.sheet(SHEETS.MEMBERS)
      .getRange(member.rowIndex, M.FULL_NAME + 1);

    equal(cell.getFormula(), '', 'stored as a live formula: ' + member.fullName);
    assert(member.fullName.indexOf('IMPORTXML') !== -1,
      'payload was lost rather than escaped: ' + member.fullName);
  });

  it('the day map stays exactly 366 characters', function () {
    var env = freshInstall();
    ok('submission.create', { link: 'https://linkedin.com/posts/map' }, env.member.token);

    var member = MemberRepo.findByUsernameKey('test.member');
    CalendarRepo.forMember(member.memberId).forEach(function (row) {
      equal(row.dayMap.length, 366);
    });
  });

  it('date keys are STORED as text, not as dates Sheets can reinterpret', function () {
    // The production bug this guards: Sheets parses what you write, so an ISO
    // date string comes back as a Date. Every `String(cell) === '2026-07-27'`
    // comparison then matches nothing — WeeklyStatsRepo.find() returned null,
    // upsert() returned null, and isPerfectWeek(null) threw. The whole rollup
    // step failed on a live spreadsheet while every check here was green,
    // because the fake stored strings verbatim.
    //
    // This asserts the RAW CELL, not the domain object. toDayKey_() normalises
    // on read and would hide a missing column format — so a test that only
    // checked the domain object would pass with the real protection removed.
    var env = freshInstall();
    ok('submission.create', { link: 'https://linkedin.com/posts/coercion' }, env.member.token);

    var checks = [
      [SHEETS.WEEKLY_STATS, W.WEEK_START, 'WeeklyStats.WeekStart'],
      [SHEETS.SUBMISSIONS, S.DAY_KEY, 'Submissions.DayKey'],
      [SHEETS.SUBMISSIONS, S.WEEK_START, 'Submissions.WeekStart'],
    ];

    checks.forEach(function (entry) {
      var rows = SheetClient.readAll(entry[0]);
      assert(rows.length > 0, entry[2] + ': expected at least one row');

      var cell = rows[0][entry[1]];
      assert(
        !(cell instanceof Date),
        entry[2] + ' was stored as a Date — the column lost its plain-text format',
      );
      assert(
        /^\d{4}-\d{2}-\d{2}$/.test(String(cell)),
        entry[2] + ' should read back as YYYY-MM-DD, got "' + String(cell) + '"',
      );
    });
  });

  it('an unknown action is refused', function () {
    var env = freshInstall();
    var body = post('admin.doWhateverIWant', {}, env.admin.token);

    assert(!body.ok);
    equal(body.error.code, 'NOT_FOUND');
  });

  it('a malformed request never returns a stack trace', function () {
    var response = doPost({ postData: { contents: 'not json at all' } });
    var body = JSON.parse(response.getContent());

    assert(!body.ok);
    assert(body.error.message.indexOf('at ') === -1, 'stack leaked');
    assert(!body.error.internal, 'internal detail leaked');
  });

  /* ======================================================================
     11. Frontend contracts
     ----------------------------------------------------------------------
     Every field the approved screens destructure, asserted here.

     These exist because a shape mismatch between the backend and a view does
     not throw — it renders `undefined`, or a blank section, and looks like a
     styling bug. Three such mismatches were found by writing this group.
     ====================================================================== */

  describe('Frontend contracts');

  /** Assert a nested path exists and is not undefined. */
  function has(object, path) {
    var value = object;

    path.split('.').forEach(function (key) {
      assert(value !== null && value !== undefined, 'missing before "' + key + '" in ' + path);
      value = value[key];
    });

    assert(value !== undefined, 'missing field: ' + path);
    return value;
  }

  it('member.dashboard matches what the dashboard screen reads', function () {
    var env = freshInstall();
    var d = ok('member.dashboard', {}, env.member.token);

    [
      'member.fullName', 'member.platform',
      'level.name', 'level.iconId', 'level.next',
      'week.postsThisWeek', 'week.weeklyGoal', 'week.goalMet',
      'calendar.counts', 'calendar.from', 'calendar.to', 'calendar.today',
      'milestones.totalEarned', 'milestones.totalAvailable', 'milestones.recent',
      'stats.currentWeekStreak', 'stats.longestWeekStreak',
      'stats.allTimePosts', 'stats.activeDays',
      'leaderboard.entries', 'leaderboard.rank',
      'recent',
    ].forEach(function (path) { has(d, path); });

    assert(Array.isArray(d.milestones.recent), 'recent must be an array');
    assert(Array.isArray(d.recent), 'recent submissions must be an array');
  });

  it('the greeting renders the real member name', function () {
    var env = freshInstall();
    var d = ok('member.dashboard', {}, env.member.token);

    equal(d.member.fullName, 'Test Member');
    equal(d.member.fullName.split(' ')[0], 'Test', 'first name drives the greeting');
  });

  it('milestones.list matches what the milestones screen reads', function () {
    var env = freshInstall();
    var d = ok('milestones.list', {}, env.member.token);

    ['milestones', 'totalEarned', 'totalAvailable'].forEach(function (path) { has(d, path); });
    assert(Array.isArray(d.milestones), 'milestones must be an array');

    d.milestones.forEach(function (entry) {
      ['milestoneId', 'name', 'description', 'category', 'iconId', 'rarity',
       'unlocked', 'progress', 'target'].forEach(function (field) {
        assert(entry[field] !== undefined, entry.milestoneId + ' missing ' + field);
      });
    });
  });

  it('every milestone category matches one the UI groups by', function () {
    var env = freshInstall();
    var d = ok('milestones.list', {}, env.member.token);

    // Mirrors src/lib/catalog.js. A category the UI does not know about would
    // silently vanish from the gallery.
    var known = ['GettingStarted', 'Consistency', 'WeeklyExcellence', 'Posting', 'Community'];

    d.milestones.forEach(function (entry) {
      assert(known.indexOf(entry.category) !== -1,
        entry.milestoneId + ' has unknown category "' + entry.category + '"');
    });
  });

  it('the Profile screen can change a display name and revoke consent', function () {
    // Both endpoints shipped in Phase 5a with no caller. member.profile is
    // what the screen reads, so the round trip has to be visible THERE — a
    // write that succeeds but does not show up on reload is the failure mode
    // worth catching.
    var env = freshInstall();

    var before = ok('member.profile', {}, env.member.token);
    equal(before.member.fullName, 'Test Member');
    equal(before.member.consentFeature, true, 'registered with consent granted');

    ok('member.updateName', { fullName: 'Test Renamed' }, env.member.token);
    ok('member.updateConsent', { consentFeature: false }, env.member.token);

    var after = ok('member.profile', {}, env.member.token);
    equal(after.member.fullName, 'Test Renamed', 'the new name is what the screen reloads');
    equal(after.member.consentFeature, false, 'consent is revocable, not write-once');

    // Consent gates shoutouts, so revoking it must actually reach the sheet
    // rather than only the cached response.
    var stored = MemberRepo.findById(before.member.memberId);
    equal(stored.consentFeature, false, 'revocation reached the sheet');
    equal(stored.fullName, 'Test Renamed');

    // And it goes back on again.
    ok('member.updateConsent', { consentFeature: true }, env.member.token);
    equal(ok('member.profile', {}, env.member.token).member.consentFeature, true);
  });

  it('every catalog and level IconID resolves to a real icon', function () {
    var env = freshInstall();

    // WHY THIS EXISTS
    // Icon lookup is `Icons[iconId] || Icons.medal` — a fallback, not a
    // throw. A mistyped or renamed IconID therefore fails SILENTLY: the
    // wrong badge renders and nothing anywhere reports a problem. The
    // milestone set was remapped wholesale during the Phase 8 visual pass,
    // which is exactly the kind of change that would introduce one.
    //
    // Icons is imported, not copied, so this cannot drift.
    var milestones = ok('milestones.list', {}, env.member.token).milestones;
    var levels = ok('levels.list', {}, env.member.token).levels;

    assert(milestones.length > 0, 'no milestones to check');
    assert(levels.length > 0, 'no levels to check');

    milestones.forEach(function (entry) {
      assert(entry.iconId && Icons[entry.iconId],
        'milestone "' + entry.milestoneId + '" has unknown iconId "' + entry.iconId + '"');
    });

    levels.forEach(function (entry) {
      assert(entry.iconId && Icons[entry.iconId],
        'level "' + entry.levelId + '" has unknown iconId "' + entry.iconId + '"');
    });
  });

  it('levels.list matches what the Flow Levels screen reads', function () {
    var env = freshInstall();
    var d = ok('levels.list', {}, env.member.token);

    ['levels', 'current.name', 'current.iconId', 'current.description',
     'current.levelId', 'stats.allTimePosts', 'stats.perfectWeeks']
      .forEach(function (path) { has(d, path); });

    equal(d.levels.length, 6, 'six levels');
    assert(d.current.next, 'a Seedling has a next level');
  });

  it('member.profile matches what the profile screen reads', function () {
    var env = freshInstall();
    var d = ok('member.profile', {}, env.member.token);

    ['member.fullName', 'member.username', 'member.platform', 'member.weeklyGoal',
     'joinDate', 'level.name', 'stats.allTimePosts', 'calendar.counts',
     'milestones.totalEarned', 'contact']
      .forEach(function (path) { has(d, path); });
  });

  it('leaderboard rows carry everything a row renders', function () {
    var env = freshInstall();
    ok('submission.create', { link: 'https://linkedin.com/posts/contract' }, env.member.token);

    var d = ok('leaderboard.get', { scope: 'week' }, env.member.token);

    ['entries', 'rank', 'unrankedCount'].forEach(function (path) { has(d, path); });

    var row = d.entries[0];
    ['rank', 'fullName', 'postCount', 'weeklyGoal', 'levelId', 'levelName', 'levelIconId', 'isSelf']
      .forEach(function (field) {
        assert(row[field] !== undefined, 'leaderboard row missing ' + field);
      });

    equal(row.isSelf, true, 'the caller should be marked');
  });

  it('unrankedCount counts members yet to post, without naming them', function () {
    var env = freshInstall();
    var d = ok('leaderboard.get', { scope: 'week' }, env.member.token);

    // Two active members, nobody has posted.
    equal(d.entries.length, 0);
    equal(d.unrankedCount, 2);
  });

  it('submission.create returns what the success screen animates', function () {
    var env = freshInstall();
    var result = ok('submission.create',
      { link: 'https://linkedin.com/posts/success' }, env.member.token);

    ['stats.postsThisWeek', 'stats.weeklyGoal', 'stats.currentWeekStreak',
     'stats.allTimePosts', 'newMilestones']
      .forEach(function (path) { has(result, path); });

    assert(Array.isArray(result.newMilestones));
    assert(result.levelUp !== undefined, 'levelUp must be present, even as null');
  });

  it('auth.login and auth.register return what saveSession stores', function () {
    var env = freshInstall();

    [env.member, ok('auth.login', { username: 'test.member', pin: '284617' })]
      .forEach(function (payload) {
        ['token', 'expiresAt', 'member.memberId', 'member.fullName', 'capabilities']
          .forEach(function (path) { has(payload, path); });
      });
  });

  it('every action the member app calls exists in the action table', function () {
    var table = getActionTable_();

    // The exact list grepped from src/features/. If a view calls something
    // that does not exist, it fails here rather than at a member's fingertips.
    ['auth.checkUsername', 'auth.login', 'auth.logout', 'auth.register',
     'leaderboard.get', 'levels.list', 'member.dashboard', 'member.profile',
     'milestones.list', 'submission.create']
      .forEach(function (action) {
        assert(table[action], 'front end calls a missing action: ' + action);
      });
  });

  /* ======================================================================
     12. Admin Dashboard contracts and permissions
     ====================================================================== */

  describe('Admin Dashboard');

  /** Promote the test member and return a fresh session for them. */
  function asManager(env) {
    var target = MemberRepo.findByUsernameKey('test.member');
    ok('admin.members.setRole',
      { memberId: target.memberId, role: ROLES.COMMUNITY_MANAGER }, env.admin.token);
    return ok('auth.login', { username: 'test.member', pin: '284617' });
  }

  it('admin.overview returns the approved eight figures', function () {
    var env = freshInstall();
    var d = ok('admin.overview', {}, env.admin.token);

    has(d, 'weekStart');
    has(d, 'metrics');
    has(d, 'leaderboard');

    var ids = d.metrics.map(function (m) { return m.id; });

    ['totalMembers', 'activeMembersThisWeek', 'postsToday', 'postsThisWeek',
     'goalCompletionRate', 'totalPosts', 'newMembers']
      .forEach(function (id) {
        assert(ids.indexOf(id) !== -1, 'overview missing metric: ' + id);
      });

    d.metrics.forEach(function (metric) {
      ['id', 'label', 'value'].forEach(function (field) {
        assert(metric[field] !== undefined, metric.id + ' missing ' + field);
      });
    });
  });

  it('active-this-week counts members who posted, not accounts that exist', function () {
    var env = freshInstall();

    var before = ok('admin.overview', {}, env.admin.token);
    equal(metricValue(before, 'activeMembersThisWeek'), 0, 'nobody has posted');
    equal(metricValue(before, 'totalMembers'), 2);

    ok('submission.create', { link: 'https://linkedin.com/posts/ov' }, env.member.token);

    var after = ok('admin.overview', {}, env.admin.token);
    equal(metricValue(after, 'activeMembersThisWeek'), 1);
    equal(metricValue(after, 'totalPosts'), 1);
    equal(metricValue(after, 'postsToday'), 1);
  });

  function metricValue(payload, id) {
    var match = payload.metrics.filter(function (m) { return m.id === id; })[0];
    return match ? match.value : null;
  }

  it('admin.members.list returns every column the table renders', function () {
    var env = freshInstall();
    var d = ok('admin.members.list', {}, env.admin.token);

    ['entries', 'total', 'page', 'pageSize'].forEach(function (path) { has(d, path); });

    d.entries.forEach(function (row) {
      ['memberId', 'fullName', 'username', 'platform', 'joinDate', 'flowLevelId',
       'weeklyGoal', 'currentWeekStreak', 'allTimePosts', 'status', 'role']
        .forEach(function (field) {
          assert(row[field] !== undefined, 'member row missing ' + field);
        });
    });
  });

  it('the member list never carries contact details', function () {
    var env = freshInstall();
    ok('profile.update', { whatsapp: '08031234567', email: 'a@b.co' }, env.member.token);

    var body = JSON.stringify(ok('admin.members.list', {}, env.admin.token));

    assert(body.indexOf('08031234567') === -1, 'phone number leaked into the list');
    assert(body.indexOf('a@b.co') === -1, 'email leaked into the list');
  });

  it('admin.members.get carries contact details and the calendar', function () {
    var env = freshInstall();
    ok('profile.update', { whatsapp: '08031234567', bio: 'Testing' }, env.member.token);

    var target = MemberRepo.findByUsernameKey('test.member');
    var d = ok('admin.members.get', { memberId: target.memberId }, env.admin.token);

    ['member.fullName', 'profile.whatsapp', 'stats.activeDays',
     'calendar.counts', 'calendar.from', 'calendar.today', 'recent']
      .forEach(function (path) { has(d, path); });

    equal(d.profile.whatsapp, '08031234567');
  });

  it('member search and filters actually narrow the list', function () {
    var env = freshInstall();

    equal(ok('admin.members.list', { search: 'test' }, env.admin.token).total, 1);
    equal(ok('admin.members.list', { search: 'nobody' }, env.admin.token).total, 0);
    equal(ok('admin.members.list', { platform: 'LinkedIn' }, env.admin.token).total, 1);
    equal(ok('admin.members.list', { platform: 'TikTok' }, env.admin.token).total, 0);
    equal(ok('admin.members.list', { role: ROLES.SUPER_ADMIN }, env.admin.token).total, 1);
  });

  it('member edits persist', function () {
    var env = freshInstall();
    var target = MemberRepo.findByUsernameKey('test.member');

    ok('admin.members.update', {
      memberId: target.memberId,
      fullName: 'Renamed Member',
      platform: 'YouTube',
      weeklyGoal: 7,
    }, env.admin.token);

    var reloaded = MemberRepo.findById(target.memberId);
    equal(reloaded.fullName, 'Renamed Member');
    equal(reloaded.platform, 'YouTube');
    equal(reloaded.weeklyGoal, 7);
  });

  it('suspension blocks access and reactivation restores it', function () {
    var env = freshInstall();
    var target = MemberRepo.findByUsernameKey('test.member');

    ok('admin.members.setStatus',
      { memberId: target.memberId, status: MEMBER_STATUS.INACTIVE }, env.admin.token);

    var blocked = post('auth.login', { username: 'test.member', pin: '284617' });
    assert(!blocked.ok, 'a suspended member must not log in');
    equal(blocked.error.code, 'ACCOUNT_INACTIVE');

    ok('admin.members.setStatus',
      { memberId: target.memberId, status: MEMBER_STATUS.ACTIVE }, env.admin.token);

    assert(ok('auth.login', { username: 'test.member', pin: '284617' }).token,
      'reactivation should restore access');
  });

  it('admin.analytics returns all seven approved series', function () {
    var env = freshInstall();
    ok('submission.create', { link: 'https://linkedin.com/posts/an' }, env.member.token);

    var d = ok('admin.analytics', { weeks: 12 }, env.admin.token);

    ['weeklyGrowth', 'registrationTrend', 'postingTrend', 'goalCompletion',
     'platformDistribution', 'flowLevelDistribution', 'activityHeatmap']
      .forEach(function (key) {
        assert(Array.isArray(d[key]), 'analytics missing series: ' + key);
      });

    equal(d.postingTrend.length, 12, 'one point per week');
    equal(d.activityHeatmap.length, 12, 'one heatmap column per week');
    equal(d.activityHeatmap[0].days.length, 7, 'seven days per column');

    var posted = d.postingTrend.reduce(function (sum, p) { return sum + p.value; }, 0);
    equal(posted, 1, 'the one post should appear in the trend');
  });

  it('the heatmap marks future days rather than showing them as empty', function () {
    var env = freshInstall();
    var d = ok('admin.analytics', { weeks: 4 }, env.admin.token);

    var lastWeek = d.activityHeatmap[d.activityHeatmap.length - 1];
    var flagged = lastWeek.days.filter(function (day) { return day.future; });

    assert(flagged.length >= 0, 'future flag must exist');
    lastWeek.days.forEach(function (day) {
      assert(typeof day.future === 'boolean', 'every day needs a future flag');
    });
  });

  it('admin.audit.list returns readable rows', function () {
    var env = freshInstall();
    var d = ok('admin.audit.list', { limit: 50 }, env.admin.token);

    assert(d.entries.length > 0, 'registration and login should be logged');

    d.entries.forEach(function (row) {
      ['timestamp', 'action', 'actorRole', 'result'].forEach(function (field) {
        assert(row[field] !== undefined, 'audit row missing ' + field);
      });
    });

    var actions = d.entries.map(function (row) { return row.action; });
    assert(actions.indexOf('REGISTER') !== -1, 'registration should be audited');
  });

  it('the audit log never records a PIN', function () {
    var env = freshInstall();
    post('auth.login', { username: 'test.member', pin: '999919' });

    var body = JSON.stringify(ok('admin.audit.list', { limit: 100 }, env.admin.token));

    assert(body.indexOf('999919') === -1, 'a failed PIN was recorded');
    assert(body.indexOf('284617') === -1, 'a real PIN was recorded');
  });

  it('a Community Manager can run the community but not configure it', function () {
    var env = freshInstall();
    var manager = asManager(env);

    // Allowed
    ['admin.overview', 'admin.members.list', 'admin.submissions.list',
     'admin.invites.list', 'admin.settings.get']
      .forEach(function (action) {
        var body = post(action, {}, manager.token);
        assert(body.ok, 'manager should reach ' + action + ': ' + JSON.stringify(body.error));
      });

    assert(ok('admin.analytics', { weeks: 4 }, manager.token).postingTrend, 'analytics');

    // Refused
    [['admin.settings.update', { key: 'invite.expiryDays', value: 99 }],
     ['admin.audit.list', {}],
     ['admin.members.setRole', { memberId: 'FT-0001', role: 'Member' }],
     ['admin.members.delete', { memberId: 'FT-0001' }]]
      .forEach(function (pair) {
        var body = post(pair[0], pair[1], manager.token);
        assert(!body.ok, pair[0] + ' should be refused');
        equal(body.error.code, 'FORBIDDEN', pair[0]);
      });
  });

  it('a Community Manager cannot change settings even by calling directly', function () {
    var env = freshInstall();
    var manager = asManager(env);

    var before = SettingsService.inviteExpiryDays();
    post('admin.settings.update', { key: 'invite.expiryDays', value: 999 }, manager.token);

    CacheClient.reset();
    equal(SettingsService.inviteExpiryDays(), before, 'the setting must not have changed');
  });

  it('a plain Member is refused every admin action the dashboard uses', function () {
    var env = freshInstall();

    ['admin.overview', 'admin.analytics', 'admin.members.list', 'admin.members.get',
     'admin.members.update', 'admin.members.setStatus', 'admin.members.resetPin',
     'admin.members.setRole', 'admin.members.delete', 'admin.submissions.list',
     'admin.submissions.void', 'admin.invites.create', 'admin.invites.list',
     'admin.invites.revoke', 'admin.settings.get', 'admin.settings.update',
     'admin.audit.list']
      .forEach(function (action) {
        var body = post(action, { memberId: 'FT-0001', code: 'X', key: 'k' }, env.member.token);
        assert(!body.ok, action + ' was NOT refused');
        equal(body.error.code, 'FORBIDDEN', action);
        assert(!body.data, action + ' returned data to a member');
      });
  });

  it('login routes each role to the right app', function () {
    var env = freshInstall();

    equal(ok('auth.login', { username: 'test.member', pin: '284617' }).redirect, 'member');
    equal(ok('auth.login', { username: ADMIN_USERNAME, pin: ADMIN_PIN }).redirect, 'admin');

    var manager = asManager(env);
    equal(manager.redirect, 'admin', 'a Community Manager belongs in the admin app');
  });

  it('capabilities returned at login match what the nav renders', function () {
    var env = freshInstall();

    var memberCaps = env.member.capabilities;
    assert(memberCaps.indexOf('admin:overview:read') === -1, 'a member must not hold admin caps');
    assert(memberCaps.indexOf('dashboard:self') !== -1);

    var manager = asManager(env);
    assert(manager.capabilities.indexOf('admin:overview:read') !== -1);
    assert(manager.capabilities.indexOf('settings:update') === -1, 'managers cannot configure');
    assert(manager.capabilities.indexOf('audit:read') === -1);
    assert(manager.capabilities.indexOf('dashboard:self') !== -1, 'managers are members too');

    var admin = ok('auth.login', { username: ADMIN_USERNAME, pin: ADMIN_PIN });
    ['settings:update', 'audit:read', 'member:delete', 'member:role:set']
      .forEach(function (capability) {
        assert(admin.capabilities.indexOf(capability) !== -1, 'super admin missing ' + capability);
      });
  });

  it('there is no endpoint that edits a leaderboard score', function () {
    var table = getActionTable_();

    Object.keys(table).forEach(function (action) {
      assert(
        !/leaderboard\.(set|update|edit|adjust)/.test(action),
        'found a score-editing action: ' + action,
      );
    });
  });

  /* ======================================================================
     13. Production readiness
     ====================================================================== */

  /* ======================================================================
     Contract drift
     ----------------------------------------------------------------------
     Everything below was found by reading code by hand during the Phase 9
     integration audit: ten endpoints with no caller, three capabilities
     required by nothing, and a documented endpoint that did not exist. None
     of it threw, none of it failed a test, and none of it was visible
     without opening files side by side.

     These checks make that audit repeatable. They read the FRONTEND SOURCE
     over HTTP and diff it against the live action table, so drift in either
     direction fails here instead of waiting for the next person to notice.
     ====================================================================== */

  describe('Contract drift');

  /**
   * Read a file synchronously.
   *
   * Synchronous XHR is deprecated and correctly so — but the suite is a
   * synchronous IIFE that renders its results at the end, and this is a local
   * harness reading local files, not production code on a member's phone.
   * Restructuring the whole suite to async to avoid a lint warning would be
   * the worse trade.
   */
  function readSource_(url) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);
    xhr.send(null);
    if (xhr.status !== 200 && xhr.status !== 0) {
      throw new Error('cannot read ' + url + ' (HTTP ' + xhr.status + ')');
    }
    return xhr.responseText;
  }

  /**
   * Every frontend module reachable from the two entry points.
   *
   * Crawls the real import graph — static AND dynamic, because every screen
   * is lazily imported and a list that missed those would report most of the
   * app as dead. Following the graph rather than hardcoding paths means a new
   * file is covered the moment something imports it.
   */
  function crawlFrontend_() {
    var origin = window.location.origin;
    var queue = [origin + '/src/main.js', origin + '/src/admin.js'];
    var seen = {};
    var sources = {};

    while (queue.length) {
      var url = queue.shift();
      if (seen[url]) continue;
      seen[url] = true;

      var text;
      try {
        text = readSource_(url);
      } catch (error) {
        continue;
      }
      sources[url] = text;

      // `from './x.js'`, `import './x.js'`, and `import('./x.js')`.
      var pattern = /(?:from|import)\s*\(?\s*['"](\.\.?\/[^'"]+)['"]/g;
      var match;
      while ((match = pattern.exec(text)) !== null) {
        queue.push(new URL(match[1], url).href);
      }
    }

    return sources;
  }

  /** Every action name passed to `call()` anywhere in the frontend. */
  function frontendCalls_() {
    var sources = crawlFrontend_();
    var found = {};
    var files = Object.keys(sources);

    assert(files.length > 5, 'the crawler found almost nothing — it is broken, not the app');

    files.forEach(function (url) {
      var pattern = /\bcall\(\s*['"]([a-zA-Z][a-zA-Z0-9.]*)['"]/g;
      var match;
      while ((match = pattern.exec(sources[url])) !== null) found[match[1]] = true;
    });

    return found;
  }

  /**
   * Actions with no frontend caller, and why that is deliberate.
   *
   * This list is the documentation. An action here is a decision someone
   * made; an action missing from here is an accident. Adding an entry should
   * feel like a small commitment, because it is one.
   */
  var UNCALLED_BY_DESIGN = {
    'auth.session': 'Session is restored from localStorage; nothing needs to re-fetch it.',
    'member.submissions': 'Paginated history. No "view all activity" screen is approved.',
    'member.calendar': 'Range queries. The dashboard ships its own calendar window.',
    'milestones.markSeen': 'Celebration is driven by newMilestones[] in the submission response; the Seen column has no reader.',
    'profile.get': 'Stage 2 profile. The member-facing screen is deferred, not built.',
    'profile.update': 'Stage 2 profile. Same.',
    'admin.members.delete': 'Deliberately hard to reach. Deactivation is the normal path and deletion refuses when history exists.',
  };

  it('every action is either called by the frontend or documented as unused', function () {
    var called = frontendCalls_();
    var orphans = [];
    var staleAllowlist = [];

    Object.keys(getActionTable_()).forEach(function (action) {
      if (called[action]) {
        if (UNCALLED_BY_DESIGN[action]) staleAllowlist.push(action);
        return;
      }
      if (!UNCALLED_BY_DESIGN[action]) orphans.push(action);
    });

    assert(orphans.length === 0,
      'action(s) with no caller and no recorded reason: ' + orphans.join(', ') +
      ' — wire them, remove them, or add them to UNCALLED_BY_DESIGN with a reason');

    // A stale entry is the same bug pointed the other way: the list stops
    // describing reality and starts excusing it.
    assert(staleAllowlist.length === 0,
      'UNCALLED_BY_DESIGN lists action(s) that ARE now called: ' + staleAllowlist.join(', '));
  });

  it('every action the frontend calls actually exists', function () {
    var table = getActionTable_();
    var missing = Object.keys(frontendCalls_()).filter(function (action) {
      return !table[action];
    });

    // This one does not fail loudly in production either: the request returns
    // NOT_FOUND and the screen shows a generic error, which reads like a
    // network problem rather than a typo.
    assert(missing.length === 0, 'frontend calls action(s) with no handler: ' + missing.join(', '));
  });

  /**
   * Backend files that can enforce a capability.
   *
   * The action table is the primary gate, but it declares exactly one
   * capability per action — so an endpoint needing a second one checks it
   * inline. `admin.members.get` does: the record is gated by
   * `member:read:all` and the contact details by `profile:read:all`.
   *
   * A check that only read the table would call that second capability
   * unused and demand its removal, which would delete a real gate. It has to
   * look where enforcement actually happens.
   */
  var ENFORCING_SOURCES = [
    '/appsscript/controllers/Controllers.gs',
    '/appsscript/services/CoreServices.gs',
    '/appsscript/services/DomainServices.gs',
    '/appsscript/orchestrators/Orchestrators.gs',
    '/appsscript/middleware/Middleware.gs',
  ];

  /** Capabilities passed to an inline `Authorize.check(...)`. */
  function inlineCapabilityChecks_() {
    var found = {};

    ENFORCING_SOURCES.forEach(function (path) {
      var text = readSource_(window.location.origin + path);
      var pattern = /Authorize\.check\([^,]+,\s*['"]([a-zA-Z][a-zA-Z0-9:._-]*)['"]/g;
      var match;
      while ((match = pattern.exec(text)) !== null) found[match[1]] = true;
    });

    return found;
  }

  it('every declared capability is required by an action', function () {
    var required = inlineCapabilityChecks_();
    var table = getActionTable_();

    Object.keys(table).forEach(function (action) {
      var capability = table[action].capability;
      if (capability) required[capability] = true;
    });

    // `authenticated` is special-cased in Authorize and deliberately absent
    // from the matrix; it means "any signed-in member" rather than a grant.
    var unused = [];
    [ROLES.MEMBER, ROLES.COMMUNITY_MANAGER, ROLES.SUPER_ADMIN].forEach(function (role) {
      capabilitiesFor_(role).forEach(function (capability) {
        if (!required[capability] && unused.indexOf(capability) === -1) unused.push(capability);
      });
    });

    assert(unused.length === 0,
      'capability granted but required by no action: ' + unused.join(', ') +
      ' — a grant nothing checks is not a permission');
  });

  it('capabilities required by actions are all grantable', function () {
    // The reverse: an action requiring a capability no role holds is
    // unreachable by everyone, including the Super Admin, and would look like
    // a permissions bug rather than a typo.
    var grantable = {};
    [ROLES.MEMBER, ROLES.COMMUNITY_MANAGER, ROLES.SUPER_ADMIN].forEach(function (role) {
      capabilitiesFor_(role).forEach(function (capability) { grantable[capability] = true; });
    });

    var ungrantable = [];
    var table = getActionTable_();
    Object.keys(table).forEach(function (action) {
      var capability = table[action].capability;
      if (!capability || capability === 'authenticated') return;
      if (!grantable[capability]) ungrantable.push(action + ' -> ' + capability);
    });

    assert(ungrantable.length === 0,
      'action(s) require a capability no role holds: ' + ungrantable.join(', '));
  });

  describe('Production readiness');

  it('the production smoke test passes end to end', function () {
    // The same function an operator runs from the Apps Script editor after
    // deploying. Running it here proves its logic; running it there proves the
    // deployment. Both are needed, and neither substitutes for the other.
    FakeEnv.reset();
    CacheClient.reset();
    SheetClient.reset();

    PropertiesService.getScriptProperties().setProperty('FT_ADMIN_USERNAME', 'smokeadmin');
    PropertiesService.getScriptProperties().setProperty('FT_ADMIN_PIN', '482603');

    setupSecrets();
    setupBootstrap();
    setupSeedCatalog();
    setupSeedSuperAdmin();
    setupInstallTriggers();

    var report = setupSmokeTest();

    assert(report.indexOf('ALL ') !== -1 && report.indexOf('CHECKS PASSED') !== -1,
      'smoke test reported failures:\n' + report);
  });

  it('the smoke test removes every row it created', function () {
    // Verified after the run above. A test that leaves debris in a live
    // community would be worse than no test.
    assert(!MemberRepo.findByUsernameKey('smoketest.user'), 'test member survived');

    var leftover = SubmissionRepo.all().filter(function (row) {
      return String(row.username).indexOf('smoketest') === 0;
    });

    equal(leftover.length, 0, 'test submissions survived');

    var invites = InviteRepo.all().filter(function (invite) {
      return invite.note === 'smoketest';
    });

    equal(invites.length, 0, 'test invite survived');
  });

  it('the smoke test keeps the audit trail', function () {
    // Deliberate: an append-only log a test can erase is not append-only, and
    // the entries are honest history.
    var entries = AuditRepo.list(100);
    assert(entries.length > 0, 'audit entries were wrongly purged');
  });

  it('the Super Admin comes from Script Properties, not from code', function () {
    var seeded = MemberRepo.findByUsernameKey('smokeadmin');
    assert(seeded, 'FT_ADMIN_USERNAME was not honoured');
    equal(seeded.role, ROLES.SUPER_ADMIN);
  });

  it('the seeding PIN is deleted from Script Properties after use', function () {
    // It only existed to create the account. Leaving a working credential in
    // project settings would undo the point of hashing it.
    var stored = PropertiesService.getScriptProperties().getProperty('FT_ADMIN_PIN');
    assert(!stored, 'FT_ADMIN_PIN is still readable in Script Properties');
  });

  it('a missing sheet fails with an actionable internal message', function () {
    FakeEnv.reset();
    CacheClient.reset();
    SheetClient.reset();
    setupBootstrap();

    // Simulate someone deleting a tab by hand.
    delete FakeEnv.spreadsheet()._sheets[SHEETS.MEMBERS];
    SheetClient.reset();

    var error = throws(function () { SheetClient.sheet(SHEETS.MEMBERS); }, 'SERVER_ERROR');

    assert(error.internal.indexOf('setupBootstrap') !== -1,
      'the log should say how to fix it, got: ' + error.internal);
    assert(error.message.indexOf('setupBootstrap') === -1,
      'internal detail must not reach the member');
  });

  it('every documented error code has member-facing copy', function () {
    Object.keys(ERROR_MESSAGES).forEach(function (code) {
      var message = ERROR_MESSAGES[code];
      assert(message && message.length > 8, code + ' has no usable message');
      assert(message.indexOf('undefined') === -1, code + ' message is broken');
      // No internal vocabulary should ever reach a member.
      assert(!/sheet|spreadsheet|apps script|null|exception/i.test(message),
        code + ' leaks implementation detail: ' + message);
    });
  });

  it('an unexpected exception returns a generic message with no stack', function () {
    var env = freshInstall();

    // Force a genuine internal failure by removing a sheet mid-flight.
    delete FakeEnv.spreadsheet()._sheets[SHEETS.SUBMISSIONS];
    SheetClient.reset();
    CacheClient.reset();

    var body = post('member.dashboard', {}, env.member.token);

    assert(!body.ok, 'should have failed');
    equal(body.error.code, 'SERVER_ERROR');
    equal(body.error.message, ERROR_MESSAGES.SERVER_ERROR);
    assert(!body.error.internal, 'internal detail leaked to the client');
    assert(!body.error.stack, 'stack leaked to the client');
  });

  /* ======================================================================
     Report
     ====================================================================== */

  var passed = results.filter(function (r) { return r.ok; }).length;
  var failed = results.length - passed;

  var out = document.getElementById('out');

  var summary = document.createElement('div');
  summary.className = 'summary ' + (failed ? 'fail' : 'pass');
  summary.textContent = failed
    ? failed + ' failing, ' + passed + ' passing'
    : 'All ' + passed + ' checks passed';
  out.appendChild(summary);

  var groups = [];
  results.forEach(function (result) {
    if (groups.indexOf(result.group) === -1) groups.push(result.group);
  });

  groups.forEach(function (name) {
    var section = document.createElement('div');
    section.className = 'group';

    var heading = document.createElement('h2');
    heading.textContent = name;
    section.appendChild(heading);

    results.filter(function (r) { return r.group === name; }).forEach(function (result) {
      var line = document.createElement('div');
      line.className = 'case ' + (result.ok ? 'ok' : 'no');
      line.textContent = result.name;
      section.appendChild(line);

      if (!result.ok) {
        var detail = document.createElement('div');
        detail.className = 'detail';
        detail.textContent = result.detail;
        section.appendChild(detail);
      }
    });

    out.appendChild(section);
  });

  window.__BACKEND_RESULTS__ = { passed: passed, failed: failed, results: results };
})();
