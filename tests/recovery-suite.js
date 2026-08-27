(function () {
  var results = [];

  function test(name, fn) {
    try { fn(); results.push({ name: name, ok: true }); }
    catch (error) { results.push({ name: name, ok: false, detail: String(error && error.message || error) }); }
  }
  function assert(condition, message) { if (!condition) throw new Error(message || 'assertion failed'); }
  function equal(actual, expected, message) {
    if (actual !== expected) throw new Error((message || 'expected') + ': got ' + JSON.stringify(actual) + ', wanted ' + JSON.stringify(expected));
  }
  function post(action, payload, token) {
    var response = doPost({ postData: { contents: JSON.stringify({
      action: action, payload: payload || {}, token: token || null,
      requestId: 'recovery-test-' + Math.random().toString(36).slice(2), clientVersion: '2.0.0',
    }) } });
    return JSON.parse(response.getContent());
  }
  function ok(action, payload, token) {
    var body = post(action, payload, token);
    if (!body.ok) throw new Error(action + ' failed: ' + body.error.code + ' — ' + body.error.message);
    return body.data;
  }
  function freshInstall() {
    FakeEnv.reset(); CacheClient.reset(); SheetClient.reset();
    var props = PropertiesService.getScriptProperties();
    props.setProperty('FT_ADMIN_FULLNAME', 'Recovery Admin');
    props.setProperty('FT_ADMIN_USERNAME', 'recovery.admin');
    props.setProperty('FT_ADMIN_PIN', '284619');
    props.setProperty('FT_ADMIN_PLATFORM', 'Instagram');
    setupSecrets(); setupBootstrap(); setupSeedCatalog(); setupSeedSuperAdmin();
    return ok('auth.login', { username: 'recovery.admin', pin: '284619' });
  }
  function arm(username, pin, confirm) {
    var props = PropertiesService.getScriptProperties();
    props.setProperty('FT_RECOVERY_USERNAME', username);
    props.setProperty('FT_RECOVERY_TEMP_PIN', pin);
    props.setProperty('FT_RECOVERY_CONFIRM', confirm);
  }
  function noRecoveryProps() {
    var props = PropertiesService.getScriptProperties();
    ['FT_RECOVERY_USERNAME','FT_RECOVERY_TEMP_PIN','FT_RECOVERY_CONFIRM'].forEach(function (key) {
      assert(!props.getProperty(key), key + ' was not deleted');
    });
  }

  test('recovery resets the Super Admin and forces a PIN change', function () {
    freshInstall();
    arm('recovery.admin', '539182', 'RESET recovery.admin');
    operatorRecoverSuperAdmin();
    var login = ok('auth.login', { username: 'recovery.admin', pin: '539182' });
    assert(login.token, 'no session returned');
    equal(login.mustChangePin, true, 'temporary PIN must force replacement');
  });

  test('recovery revokes existing sessions', function () {
    var before = freshInstall();
    arm('recovery.admin', '539182', 'RESET recovery.admin');
    operatorRecoverSuperAdmin();
    var body = post('member.dashboard', {}, before.token);
    assert(!body.ok, 'old session should not survive recovery');
    equal(body.error.code, 'SESSION_EXPIRED');
  });

  test('wrong confirmation is refused and recovery material is erased', function () {
    freshInstall();
    arm('recovery.admin', '539182', 'RESET somebody.else');
    var failed = false;
    try { operatorRecoverSuperAdmin(); } catch (_) { failed = true; }
    assert(failed, 'wrong confirmation should fail');
    noRecoveryProps();
  });

  test('a normal member cannot be targeted by operator recovery', function () {
    var admin = freshInstall();
    var invite = ok('admin.invites.create', { count: 1 }, admin.token);
    ok('auth.register', {
      fullName: 'Plain Member', username: 'plain.member', pin: '746391', pinConfirm: '746391',
      platform: 'LinkedIn', weeklyGoal: 3, inviteCode: invite.codes[0].code, consentFeature: true,
    });
    arm('plain.member', '539182', 'RESET plain.member');
    var failed = false;
    try { operatorRecoverSuperAdmin(); } catch (_) { failed = true; }
    assert(failed, 'member recovery should fail');
    var login = ok('auth.login', { username: 'plain.member', pin: '746391' });
    assert(login.token, 'member credential should be unchanged');
  });

  test('successful recovery deletes every temporary property', function () {
    freshInstall();
    arm('recovery.admin', '539182', 'RESET recovery.admin');
    operatorRecoverSuperAdmin();
    noRecoveryProps();
    equal(operatorRecoveryVerifyClean(), '', 'recovery verification should be clean');
  });

  test('successful recovery writes an audit event without the PIN', function () {
    freshInstall();
    arm('recovery.admin', '539182', 'RESET recovery.admin');
    operatorRecoverSuperAdmin();
    var audit = AuditRepo.list(200);
    var event = audit.filter(function (row) { return row.action === 'SUPER_ADMIN_RECOVERY'; }).pop();
    assert(event, 'missing SUPER_ADMIN_RECOVERY audit event');
    assert(JSON.stringify(event).indexOf('539182') === -1, 'temporary PIN leaked into audit data');
  });

  var failed = results.filter(function (r) { return !r.ok; }).length;
  window.__RECOVERY_RESULTS__ = { total: results.length, passed: results.length - failed, failed: failed, results: results };
})();
