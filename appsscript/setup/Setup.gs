/**
 * One-time setup, run by hand from the Apps Script editor.
 *
 * NONE of these are endpoints. They are unreachable over HTTP, which is why
 * `setupSeedSuperAdmin` — the one account created outside registration —
 * cannot become a back door.
 *
 * Run in this order on a fresh install:
 *   1. setupSecrets()          generate the PIN pepper and session key
 *   2. setupBootstrap()        create all 14 sheets with headers and validation
 *   3. setupSeedCatalog()      milestone catalog, flow levels, default settings
 *   4. setupSeedSuperAdmin()   your account — edit the constants first
 *   5. setupInstallTriggers()  the scheduled jobs
 *   6. setupVerify()           confirm everything is in place
 *
 * @see docs/deployment.md
 */

/* ==========================================================================
   1. Secrets
   ========================================================================== */

/**
 * Generate the two secrets, once.
 *
 * The pepper is what makes a leaked spreadsheet useless: without it the PIN
 * hashes cannot be attacked offline. It is never written to a sheet and never
 * committed.
 *
 * Refuses to overwrite. Rotating the pepper invalidates every PIN in the
 * community, so it must be a deliberate act, never an accidental re-run.
 */
function setupSecrets() {
  var props = PropertiesService.getScriptProperties();
  var created = [];

  if (!props.getProperty(SECRET_KEYS.PIN_PEPPER)) {
    props.setProperty(SECRET_KEYS.PIN_PEPPER, Crypto.randomHex(32));
    created.push('PIN pepper');
  }

  if (!props.getProperty(SECRET_KEYS.SESSION_KEY)) {
    props.setProperty(SECRET_KEYS.SESSION_KEY, Crypto.randomHex(32));
    created.push('session key');
  }

  var message = created.length
    ? 'Created: ' + created.join(', ')
    : 'Secrets already exist — nothing changed. This is correct on a re-run.';

  Logger.log(message);
  return message;
}

/* ==========================================================================
   2. Bootstrap
   ========================================================================== */

/**
 * Create every sheet with its headers, formatting, and validation.
 *
 * Idempotent: an existing sheet keeps its data and only has its headers
 * checked, so this is safe to re-run after adding a column.
 */
function setupBootstrap() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Bind this script to a spreadsheet first.');

  spreadsheet.setSpreadsheetTimeZone(TIMEZONE);

  var created = [];
  var checked = [];

  Object.keys(SHEET_HEADERS).forEach(function (name) {
    var headers = SHEET_HEADERS[name];
    var sheet = spreadsheet.getSheetByName(name);

    if (!sheet) {
      sheet = spreadsheet.insertSheet(name);
      created.push(name);
    } else {
      checked.push(name);
    }

    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#5B0000')
      .setFontColor('#FFFFFF');

    sheet.setFrozenRows(1);
  });

  // ---- Columns that must survive a round trip unchanged --------------------
  //
  // Sheets PARSES what you write. Anything that looks like a number or a date
  // comes back as a number or a Date, not as the string that was written.
  // Every column below holds an OPAQUE KEY that the application compares with
  // `===`, so a value Sheets has reinterpreted no longer matches itself.
  //
  // Plain text ('@') is what stops the parse. Formatting a column is therefore
  // not cosmetic here — it is the storage contract.
  function asText(sheetName, columnIndexZeroBased) {
    var target = spreadsheet.getSheetByName(sheetName);
    target
      .getRange(2, columnIndexZeroBased + 1, target.getMaxRows() - 1, 1)
      .setNumberFormat('@');
  }

  // A 366-digit string becomes scientific notation and the member's whole year
  // of activity is destroyed.
  asText(SHEETS.ACTIVITY_CALENDAR, AC.DAY_MAP);

  // Invite codes can look numeric.
  asText(SHEETS.INVITE_CODES, I.CODE);

  // ISO day and week keys (2026-07-27) become Date objects. These are joined
  // and compared as strings — WeeklyStatsRepo.find() matches on WeekStart, and
  // recordPost() filters submissions by it — so a coerced value silently
  // matches nothing. That is what broke the WeeklyStats rollup in production
  // while every in-memory check passed.
  asText(SHEETS.WEEKLY_STATS, W.WEEK_START);
  asText(SHEETS.SUBMISSIONS, S.DAY_KEY);
  asText(SHEETS.SUBMISSIONS, S.WEEK_START);
  asText(SHEETS.ACTIVITY_CALENDAR, AC.FIRST_ACTIVE);
  asText(SHEETS.ACTIVITY_CALENDAR, AC.LAST_ACTIVE);

  var summary = 'Created: ' + (created.join(', ') || 'none') +
    ' | Verified: ' + (checked.join(', ') || 'none');

  Logger.log(summary);
  return summary;
}

/* ==========================================================================
   3. Seed the catalog
   ========================================================================== */

/**
 * Seed milestones, flow levels, and default settings.
 *
 * Definitions are DATA, not code — a milestone's name and description can be
 * edited in the sheet without a deploy. What cannot be edited there is how a
 * milestone is judged: the evaluators live in lib/FtAchievements.js, keyed by
 * `MilestoneID`. That split is what keeps the copy editable and the rules
 * trustworthy.
 *
 * Idempotent: existing rows are left alone.
 */
function setupSeedCatalog() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  seedIfEmpty_(spreadsheet, SHEETS.MILESTONE_CATALOG, [
    // id, name, description, category, icon, rarity, sort, active, hidden, from, until, series, tier, badge
    ['first-step', 'First Step', 'You logged your first post.', 'GettingStarted', 'footprint', 'Common', 10, true, false, '', '', 'start', 1, ''],
    ['first-goal', 'First Goal Completed', 'You hit your weekly goal for the first time.', 'GettingStarted', 'target', 'Common', 20, true, false, '', '', 'start', 2, ''],

    ['active-days-7', '7 Active Days', 'You have created on seven different days.', 'Consistency', 'calendarCheck', 'Common', 30, true, false, '', '', 'activedays', 1, ''],
    ['active-days-30', '30 Active Days', 'You have created on thirty different days.', 'Consistency', 'calendarStar', 'Uncommon', 40, true, false, '', '', 'activedays', 2, ''],
    ['active-days-100', '100 Active Days', 'You have created on one hundred different days.', 'Consistency', 'medal', 'Rare', 50, true, false, '', '', 'activedays', 3, ''],

    ['perfect-week', 'Perfect Week', 'You met your goal across separate days.', 'WeeklyExcellence', 'checkCircle', 'Common', 60, true, false, '', '', 'weeks', 1, ''],
    ['perfect-weeks-5', 'Five Perfect Weeks', 'Five weeks of showing up on separate days.', 'WeeklyExcellence', 'shield', 'Uncommon', 70, true, false, '', '', 'weeks', 2, ''],
    ['perfect-weeks-12', 'Consistency Champion', 'Twelve perfect weeks. That is a habit.', 'WeeklyExcellence', 'crown', 'Rare', 80, true, false, '', '', 'weeks', 3, ''],

    ['posts-10', '10 Posts', 'Ten posts logged.', 'Posting', 'pen', 'Common', 90, true, false, '', '', 'posts', 1, ''],
    ['posts-50', '50 Posts', 'Fifty posts logged.', 'Posting', 'feather', 'Uncommon', 100, true, false, '', '', 'posts', 2, ''],
    ['posts-100', '100 Posts', 'One hundred posts logged.', 'Posting', 'sparkle', 'Uncommon', 110, true, false, '', '', 'posts', 3, ''],
    ['posts-250', '250 Posts', 'Two hundred and fifty posts logged.', 'Posting', 'mountain', 'Rare', 120, true, false, '', '', 'posts', 4, ''],
    ['posts-500', '500 Posts', 'Five hundred posts logged.', 'Posting', 'diamond', 'Legendary', 130, true, false, '', '', 'posts', 5, ''],

    ['founding-member', 'Founding Member', 'You were here at the beginning.', 'Community', 'flag', 'Legendary', 140, true, false, '', '', '', 0, ''],
    // The Design System's milestone list omits Top 10, and reassigns Medal to
    // 100 Active Days. Ribbon keeps it inside the same award family without
    // colliding.
    ['top-10', 'Top 10', 'You finished a week inside the top ten.', 'Community', 'ribbon', 'Uncommon', 150, true, false, '', '', 'rank', 1, ''],
    ['weekly-champion', 'Weekly Champion', 'You finished a week at number one.', 'Community', 'trophy', 'Rare', 160, true, false, '', '', 'rank', 2, ''],
  ]);

  seedIfEmpty_(spreadsheet, SHEETS.FLOW_LEVELS, [
    // id, name, description, icon, sort, requiredPosts, requiredPerfectWeeks, criteria, active
    ['seedling', 'Seedling', 'You have started. That is the hardest part.', 'leaf', 1, 0, 0, '', true],
    ['creator', 'Creator', 'You are publishing regularly.', 'pen', 2, 10, 0, '', true],
    ['builder', 'Builder', 'You are building a body of work.', 'hammer', 3, 40, 2, '', true],
    ['consistent-creator', 'Consistent Creator', 'Consistency has become your default.', 'mountain', 4, 100, 6, '', true],
    ['community-leader', 'Community Leader', 'Others follow your rhythm.', 'compass', 5, 250, 12, '', true],
    ['tribe-legend', 'Tribe Legend', 'A standing example of what showing up looks like.', 'star', 6, 500, 24, '', true],
  ]);

  seedIfEmpty_(spreadsheet, SHEETS.SETTINGS, [
    // key, value, type, category, description, updatedBy, updatedAt
    ['auth.pinLength', 6, 'number', 'auth', 'Digits in a member PIN', 'SYSTEM', nowIso_()],
    ['auth.hashIterations', 600, 'number', 'auth', 'PIN hash iterations', 'SYSTEM', nowIso_()],
    ['auth.maxFailedAttempts', 5, 'number', 'auth', 'Failures before backoff begins', 'SYSTEM', nowIso_()],
    ['session.absoluteDays', 30, 'number', 'session', 'Maximum session lifetime', 'SYSTEM', nowIso_()],
    ['session.idleDays', 14, 'number', 'session', 'Idle expiry', 'SYSTEM', nowIso_()],
    ['submission.duplicateWindowDays', 30, 'number', 'submission', 'Duplicate link rejection window', 'SYSTEM', nowIso_()],
    ['submission.dailyCap', 10, 'number', 'submission', 'Maximum posts logged per day', 'SYSTEM', nowIso_()],
    ['invite.expiryDays', 14, 'number', 'invite', 'Default invite lifetime', 'SYSTEM', nowIso_()],
    ['invite.codeLength', 8, 'number', 'invite', 'Characters in an invite code', 'SYSTEM', nowIso_()],
    ['member.defaultWeeklyGoal', 3, 'number', 'member', 'Default weekly goal', 'SYSTEM', nowIso_()],
    ['calendar.defaultWeeks', 26, 'number', 'calendar', 'Weeks shown on the dashboard calendar', 'SYSTEM', nowIso_()],
    ['milestones.foundingPeriodEnd', '2026-08-01', 'string', 'milestones', 'Join before this date for Founding Member', 'SYSTEM', nowIso_()],
    // The Consistency Score ships disabled — its definition is still to be
    // agreed, so the card is absent rather than stubbed.
    ['metrics.consistencyScore.enabled', false, 'boolean', 'metrics', 'Paused until defined', 'SYSTEM', nowIso_()],
  ]);

  CacheClient.reset();
  Logger.log('Catalog seeded.');
  return 'Catalog seeded.';
}

function seedIfEmpty_(spreadsheet, sheetName, rows) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error('Run setupBootstrap() first — missing sheet: ' + sheetName);

  if (sheet.getLastRow() > 1) {
    Logger.log(sheetName + ' already has data — left untouched.');
    return;
  }

  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

/* ==========================================================================
   4. Seed the Super Admin
   ========================================================================== */

/**
 * Create the first account.
 *
 * EDIT THE FOUR CONSTANTS BELOW, run once, then change the PIN from inside
 * the app. The PIN is hashed on the way in and never stored in plain text —
 * but it is briefly visible in this file, so treat it as temporary.
 *
 * This is the only account created outside the registration flow, and the
 * only role assigned outside admin.members.setRole.
 */
function setupSeedSuperAdmin() {
  var props = PropertiesService.getScriptProperties();

  // Read from Script Properties first, so the founder account can be set
  // without editing code — and so a real PIN never has to be typed into a
  // file that gets committed. The constants below are only a fallback for a
  // scratch install, and the PIN is deliberately one you would not keep.
  var FULL_NAME = props.getProperty('FT_ADMIN_FULLNAME') || 'Flow Tribe Founder';
  var USERNAME = props.getProperty('FT_ADMIN_USERNAME') || 'founder';
  var TEMP_PIN = props.getProperty('FT_ADMIN_PIN') || '482605';
  var PLATFORM = props.getProperty('FT_ADMIN_PLATFORM') || 'Instagram';

  if (PLATFORMS.indexOf(PLATFORM) === -1) {
    throw new Error(
      'FT_ADMIN_PLATFORM must be one of: ' + PLATFORMS.join(', ') + ' (got "' + PLATFORM + '")',
    );
  }

  if (MemberRepo.countActiveSuperAdmins() > 0) {
    var message = 'A Super Admin already exists — nothing changed.';
    Logger.log(message);
    return message;
  }

  var validation = FtIdentity.validateUsername(USERNAME);
  if (!validation.valid) throw new Error('Username: ' + validation.message);

  var pinCheck = FtIdentity.validatePin(TEMP_PIN, 6);
  if (!pinCheck.valid) throw new Error('PIN: ' + pinCheck.message);

  var credentials = AuthService.hashNewPin(TEMP_PIN);

  var member = MemberRepo.insert({
    memberId: MemberRepo.nextId(),
    username: USERNAME,
    usernameKey: FtIdentity.usernameKey(USERNAME),
    fullName: FULL_NAME,
    pinHash: credentials.hash,
    pinSalt: credentials.salt,
    platform: PLATFORM,
    weeklyGoal: 3,
    joinDate: nowIso_(),
    status: MEMBER_STATUS.ACTIVE,
    role: ROLES.SUPER_ADMIN,
    consentFeature: true,
    mustChangePin: false,
    inviteCodeUsed: 'FOUNDER',
    flowLevelId: 'seedling',
  });

  CalendarService.ensureYear(member.memberId, FtWeek.yearOf(FtWeek.dayKey(new Date(), TIMEZONE)));

  AuditRepo.append({
    actorId: 'SYSTEM', actorRole: 'System', action: 'SEED_SUPER_ADMIN',
    targetId: member.memberId, details: { username: USERNAME },
  });

  // The PIN is deleted from Script Properties immediately after use. It was
  // only ever needed to get the account created; leaving a working credential
  // sitting in project settings would undo the point of hashing it.
  props.deleteProperty('FT_ADMIN_PIN');

  Logger.log(
    'Super Admin created: ' + USERNAME + ' (' + member.memberId + ').\n' +
    'Log in with the PIN you set, then change it from Settings.\n' +
    'FT_ADMIN_PIN has been removed from Script Properties.',
  );

  return member.memberId;
}

/* ==========================================================================
   5. Triggers
   ========================================================================== */

/**
 * Install the scheduled jobs.
 *
 * Removes any existing Flow Tribe triggers first, so a re-run does not stack
 * duplicates — a duplicated rollover would double-evaluate a week.
 */
function setupInstallTriggers() {
  var known = [
    'jobWeeklyRollover', 'jobNightlyReconcile', 'jobRollupRepair',
    'jobSessionSweep', 'jobInviteExpiry', 'jobDailyRollup',
  ];

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (known.indexOf(trigger.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('jobWeeklyRollover')
    .timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(0).nearMinute(5).create();

  // nearMinute is stated on every daily job so the installed schedule matches
  // the documented one. Without it Apps Script picks a random minute inside
  // the hour, which is harmless but made jobSessionSweep and jobInviteExpiry
  // indistinguishable — both were "hour 2" and the docs claimed 02:00 and
  // 02:15. Apps Script still applies its own ±15 minute jitter; these are the
  // intended times, not guarantees.
  ScriptApp.newTrigger('jobNightlyReconcile')
    .timeBased().everyDays(1).atHour(1).nearMinute(0).create();

  ScriptApp.newTrigger('jobRollupRepair').timeBased().everyMinutes(15).create();

  ScriptApp.newTrigger('jobSessionSweep')
    .timeBased().everyDays(1).atHour(2).nearMinute(0).create();

  ScriptApp.newTrigger('jobInviteExpiry')
    .timeBased().everyDays(1).atHour(2).nearMinute(15).create();

  ScriptApp.newTrigger('jobDailyRollup')
    .timeBased().everyDays(1).atHour(23).nearMinute(0).create();

  Logger.log('Installed 6 triggers.');
  return 'Installed 6 triggers.';
}

/* ==========================================================================
   6. Verify
   ========================================================================== */

/**
 * Confirm the install is coherent.
 *
 * Apps Script has no module system: 40+ files share one global scope and a
 * name collision is silent — the later definition simply wins. This turns
 * that class of bug into an immediate, readable failure.
 */
function setupVerify() {
  var problems = [];
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  // Sheets and headers
  Object.keys(SHEET_HEADERS).forEach(function (name) {
    var sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      problems.push('Missing sheet: ' + name);
      return;
    }

    var expected = SHEET_HEADERS[name];
    var actual = sheet.getRange(1, 1, 1, expected.length).getValues()[0];

    for (var i = 0; i < expected.length; i += 1) {
      if (String(actual[i]) !== expected[i]) {
        problems.push(name + ' column ' + (i + 1) + ': expected "' + expected[i] + '", found "' + actual[i] + '"');
      }
    }
  });

  // Globals — catches a silent shadowing collision
  [
    'MemberRepo', 'SubmissionRepo', 'CalendarRepo', 'WeeklyStatsRepo', 'InviteRepo',
    'SessionRepo', 'SettingsRepo', 'AuditRepo',
    'AuthService', 'SessionService', 'MemberService', 'CalendarService',
    'WeeklyStatsService', 'LeaderboardService', 'MilestoneService', 'FlowLevelService',
    'RegistrationFlow', 'LoginFlow', 'SubmissionFlow', 'WeekCloseFlow', 'Pipeline',
    'FtWeek', 'FtDayMap', 'FtStreak', 'FtLink', 'FtIdentity', 'FtAchievements',
    'SheetClient', 'CacheClient', 'LockClient', 'Crypto', 'Ids',
  ].forEach(function (name) {
    if (typeof this[name] === 'undefined') problems.push('Missing global: ' + name);
  }, this);

  // Secrets
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty(SECRET_KEYS.PIN_PEPPER)) problems.push('PIN pepper not set — run setupSecrets()');

  // Every action declares a capability
  var table = getActionTable_();
  Object.keys(table).forEach(function (action) {
    if (table[action].capability === undefined) problems.push('Action has no capability: ' + action);
    if (typeof table[action].handler !== 'function') problems.push('Action has no handler: ' + action);
  });

  // At least one Super Admin
  if (MemberRepo.countActiveSuperAdmins() === 0) {
    problems.push('No active Super Admin — run setupSeedSuperAdmin()');
  }

  // Every catalog row must have an evaluator, and every evaluator a row.
  //
  // This check exists because the failure it catches is SILENT: a catalog id
  // with no matching evaluator is skipped without error, so the milestone
  // simply never unlocks and nobody finds out until a member asks why. It cost
  // four failing tests to discover, and would have cost far more to notice in
  // production.
  var known = FtAchievements.knownIds();
  var seeded = MilestoneCatalogRepo.listActive().map(function (entry) {
    return entry.milestoneId;
  });

  seeded.forEach(function (id) {
    if (known.indexOf(id) === -1) {
      problems.push('Catalog milestone "' + id + '" has no evaluator — it can never unlock');
    }
  });

  known.forEach(function (id) {
    if (seeded.indexOf(id) === -1) {
      problems.push('Evaluator "' + id + '" has no catalog row — it will never be shown');
    }
  });

  // Same contract for Flow Levels: a level with no row is unreachable.
  if (FlowLevelRepo.listOrdered().length === 0) {
    problems.push('No Flow Levels — run setupSeedCatalog()');
  }

  var report = problems.length
    ? 'FAILED (' + problems.length + '):\n' + problems.join('\n')
    : 'OK — ' + Object.keys(SHEET_HEADERS).length + ' sheets, ' +
      Object.keys(table).length + ' actions, secrets set, Super Admin present.';

  Logger.log(report);
  return report;
}

/**
 * Full install in one call, for a fresh spreadsheet.
 *
 * Edit the constants in setupSeedSuperAdmin() before running this.
 */
function setupAll() {
  var steps = [
    setupSecrets(), setupBootstrap(), setupSeedCatalog(),
    setupSeedSuperAdmin(), setupInstallTriggers(), setupVerify(),
  ];

  var report = steps.join('\n---\n');
  Logger.log(report);
  return report;
}
