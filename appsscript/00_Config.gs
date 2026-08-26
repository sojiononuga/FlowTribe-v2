/**
 * Configuration constants.
 *
 * Loaded first — the `00_` prefix is load order, not decoration. Apps Script
 * concatenates every file into one global scope alphabetically by path.
 *
 * WHAT BELONGS HERE vs IN THE Settings SHEET
 *   Here: structural facts that cannot change without a code change — which
 *   sheet holds what, which column is which, the shape of an id.
 *   Settings: operational values you might reasonably change without a deploy.
 *
 * Getting that split wrong is how "just change the number" becomes a redeploy.
 *
 * @see docs/data-dictionary.md
 */

var API_VERSION = '2.0.0';
var TIMEZONE = 'Africa/Lagos';

/** The eight sheets Bootstrap creates, plus the six rollup and system tabs. */
var SHEETS = Object.freeze({
  MEMBERS: 'Members',
  PROFILES: 'Profiles',
  INVITE_CODES: 'InviteCodes',
  SESSIONS: 'Sessions',
  SUBMISSIONS: 'Submissions',
  ACTIVITY_CALENDAR: 'ActivityCalendar',
  WEEKLY_STATS: 'WeeklyStats',
  MILESTONE_CATALOG: 'MilestoneCatalog',
  MEMBER_MILESTONES: 'MemberMilestones',
  FLOW_LEVELS: 'FlowLevels',
  SETTINGS: 'Settings',
  AUDIT_LOG: 'AuditLog',
  NOTIFICATIONS: 'Notifications',
  COMMUNITY_STATS: 'CommunityStats',
});

/**
 * Column maps, zero-based, matching docs/data-dictionary.md.
 *
 * Named rather than numeric at the call site: `row[M.PIN_HASH]` says what it
 * reads, and a column inserted by hand is corrected here once rather than in
 * every repository that happened to know it was index 4.
 */
var M = Object.freeze({
  MEMBER_ID: 0, USERNAME: 1, USERNAME_KEY: 2, FULL_NAME: 3,
  PIN_HASH: 4, PIN_SALT: 5, PLATFORM: 6, WEEKLY_GOAL: 7,
  JOIN_DATE: 8, STATUS: 9, ROLE: 10, CONSENT_FEATURE: 11,
  MUST_CHANGE_PIN: 12, PROFILE_COMPLETE: 13, INVITE_CODE_USED: 14,
  FAILED_LOGIN_COUNT: 15, NEXT_ATTEMPT_AT: 16,
  ALL_TIME_POSTS: 17, CURRENT_WEEK_STREAK: 18, LONGEST_WEEK_STREAK: 19,
  PERFECT_WEEKS: 20, LAST_SUBMISSION_DATE: 21,
  FLOW_LEVEL_ID: 22, FLOW_LEVEL_AT: 23, UPDATED_AT: 24,
  GOAL_TITLE: 25, SHOWING_UP: 26, CONSTRAINTS: 27,
});

var MEMBERS_HEADERS = [
  'MemberID', 'Username', 'UsernameKey', 'FullName', 'PinHash', 'PinSalt',
  'PreferredPlatform', 'WeeklyGoal', 'JoinDate', 'Status', 'Role',
  'ConsentFeature', 'MustChangePin', 'ProfileComplete', 'InviteCodeUsed',
  'FailedLoginCount', 'NextAttemptAt', 'AllTimePosts', 'CurrentWeekStreak',
  'LongestWeekStreak', 'PerfectWeeks', 'LastSubmissionDate', 'FlowLevelID',
  'FlowLevelAchievedAt', 'UpdatedAt', 'GoalTitle', 'ShowingUp', 'Constraints',
];

var P = Object.freeze({ MEMBER_ID: 0, WHATSAPP: 1, EMAIL: 2, BIO: 3, UPDATED_AT: 4 });
var PROFILES_HEADERS = ['MemberID', 'WhatsAppNumber', 'Email', 'Bio', 'UpdatedAt'];

var I = Object.freeze({
  CODE: 0, STATUS: 1, CREATED_BY: 2, CREATED_AT: 3,
  EXPIRES_AT: 4, USED_BY: 5, USED_AT: 6, NOTE: 7,
});
var INVITES_HEADERS = [
  'Code', 'Status', 'CreatedBy', 'CreatedAt', 'ExpiresAt', 'UsedBy', 'UsedAt', 'Note',
];

var SE = Object.freeze({
  SESSION_ID: 0, MEMBER_ID: 1, ROLE: 2, CREATED_AT: 3,
  EXPIRES_AT: 4, LAST_SEEN_AT: 5, REVOKED_AT: 6, USER_AGENT: 7,
});
var SESSIONS_HEADERS = [
  'SessionID', 'MemberID', 'Role', 'CreatedAt', 'ExpiresAt', 'LastSeenAt', 'RevokedAt', 'UserAgent',
];

var S = Object.freeze({
  SUBMISSION_ID: 0, TIMESTAMP: 1, MEMBER_ID: 2, NAME: 3, USERNAME: 4,
  PLATFORM: 5, CONTENT_LINK: 6, LINK_KEY: 7, DAY_KEY: 8, WEEK_START: 9,
  WEEK_NUMBER: 10, MONTH: 11, YEAR: 12, GOAL_AT_SUBMISSION: 13, STATUS: 14,
  ACTION_TITLE: 15, EVIDENCE: 16, SOURCE: 17,
});
var SUBMISSIONS_HEADERS = [
  'SubmissionID', 'Timestamp', 'MemberID', 'Name', 'Username', 'Platform',
  'ContentLink', 'LinkKey', 'DayKey', 'WeekStart', 'WeekNumber', 'Month',
  'Year', 'GoalAtSubmission', 'Status', 'ActionTitle', 'Evidence', 'Source',
];

var AC = Object.freeze({
  MEMBER_ID: 0, YEAR: 1, DAY_MAP: 2, ACTIVE_DAYS: 3,
  FIRST_ACTIVE: 4, LAST_ACTIVE: 5, UPDATED_AT: 6,
});
var CALENDAR_HEADERS = [
  'MemberID', 'Year', 'DayMap', 'ActiveDays', 'FirstActiveDay', 'LastActiveDay', 'UpdatedAt',
];

var W = Object.freeze({
  MEMBER_ID: 0, WEEK_START: 1, POST_COUNT: 2, DISTINCT_DAYS: 3,
  GOAL_AT_WEEK: 4, GOAL_MET: 5, RANK_FINAL: 6, UPDATED_AT: 7,
});
var WEEKLY_HEADERS = [
  'MemberID', 'WeekStart', 'PostCount', 'DistinctDays', 'GoalAtWeek', 'GoalMet', 'RankFinal', 'UpdatedAt',
];

var MC = Object.freeze({
  MILESTONE_ID: 0, NAME: 1, DESCRIPTION: 2, CATEGORY: 3, ICON_ID: 4,
  RARITY: 5, SORT_ORDER: 6, ACTIVE: 7, HIDDEN: 8,
  AVAILABLE_FROM: 9, AVAILABLE_UNTIL: 10, SERIES_ID: 11, TIER: 12, BADGE_URL: 13,
});
var CATALOG_HEADERS = [
  'MilestoneID', 'Name', 'Description', 'Category', 'IconID', 'Rarity',
  'SortOrder', 'Active', 'Hidden', 'AvailableFrom', 'AvailableUntil',
  'SeriesID', 'Tier', 'BadgeArtworkUrl',
];

var MM = Object.freeze({ MEMBER_ID: 0, MILESTONE_ID: 1, UNLOCKED_AT: 2, CONTEXT: 3, SEEN: 4 });
var MEMBER_MILESTONES_HEADERS = ['MemberID', 'MilestoneID', 'UnlockedAt', 'UnlockContext', 'Seen'];

var FL = Object.freeze({
  LEVEL_ID: 0, NAME: 1, DESCRIPTION: 2, ICON_ID: 3, SORT_ORDER: 4,
  REQUIRED_POSTS: 5, REQUIRED_WEEKS: 6, CRITERIA: 7, ACTIVE: 8,
});
var LEVELS_HEADERS = [
  'LevelID', 'Name', 'Description', 'IconID', 'SortOrder',
  'RequiredPosts', 'RequiredPerfectWeeks', 'Criteria', 'Active',
];

var ST = Object.freeze({
  KEY: 0, VALUE: 1, TYPE: 2, CATEGORY: 3, DESCRIPTION: 4, UPDATED_BY: 5, UPDATED_AT: 6,
});
var SETTINGS_HEADERS = ['Key', 'Value', 'Type', 'Category', 'Description', 'UpdatedBy', 'UpdatedAt'];

var AL = Object.freeze({
  TIMESTAMP: 0, ACTOR_ID: 1, ACTOR_ROLE: 2, ACTION: 3,
  TARGET_ID: 4, DETAILS: 5, RESULT: 6,
});
var AUDIT_HEADERS = [
  'Timestamp', 'ActorMemberID', 'ActorRole', 'Action', 'TargetMemberID', 'Details', 'Result',
];

var N = Object.freeze({
  ID: 0, MEMBER_ID: 1, TYPE: 2, CHANNEL: 3, PAYLOAD: 4,
  STATUS: 5, CREATED_AT: 6, SENT_AT: 7,
});
var NOTIFICATIONS_HEADERS = [
  'NotificationID', 'MemberID', 'Type', 'Channel', 'Payload', 'Status', 'CreatedAt', 'SentAt',
];

var CS = Object.freeze({
  DATE: 0, POSTS: 1, ACTIVE_MEMBERS: 2, NEW_MEMBERS: 3,
  GOAL_HITS: 4, PLATFORMS: 5, MILESTONES: 6,
});
var COMMUNITY_HEADERS = [
  'Date', 'PostsCount', 'ActiveMembers', 'NewMembers', 'GoalHitCount',
  'PlatformBreakdown', 'MilestonesUnlocked',
];

/** Header maps, for Bootstrap and the integrity check. */
var SHEET_HEADERS = Object.freeze({
  Members: MEMBERS_HEADERS,
  Profiles: PROFILES_HEADERS,
  InviteCodes: INVITES_HEADERS,
  Sessions: SESSIONS_HEADERS,
  Submissions: SUBMISSIONS_HEADERS,
  ActivityCalendar: CALENDAR_HEADERS,
  WeeklyStats: WEEKLY_HEADERS,
  MilestoneCatalog: CATALOG_HEADERS,
  MemberMilestones: MEMBER_MILESTONES_HEADERS,
  FlowLevels: LEVELS_HEADERS,
  Settings: SETTINGS_HEADERS,
  AuditLog: AUDIT_HEADERS,
  Notifications: NOTIFICATIONS_HEADERS,
  CommunityStats: COMMUNITY_HEADERS,
});

/* ---- Enumerations ---- */

var ROLES = Object.freeze({
  MEMBER: 'Member',
  COMMUNITY_MANAGER: 'CommunityManager',
  SUPER_ADMIN: 'SuperAdmin',
});

var MEMBER_STATUS = Object.freeze({ ACTIVE: 'Active', INACTIVE: 'Inactive' });
var SUBMISSION_STATUS = Object.freeze({ ACTIVE: 'Active', VOIDED: 'Voided' });
var INVITE_STATUS = Object.freeze({
  UNUSED: 'Unused', USED: 'Used', REVOKED: 'Revoked', EXPIRED: 'Expired',
});
var PLATFORMS = Object.freeze(['Flow', 'LinkedIn', 'X', 'Instagram', 'TikTok', 'YouTube']);
var WEEKLY_GOALS = Object.freeze([3, 5, 7]);

/**
 * Secrets, held in PropertiesService.
 *
 * Never written to a sheet, never committed, never returned by any endpoint.
 * A leaked spreadsheet must not be enough to crack a PIN or forge a session.
 */
var SECRET_KEYS = Object.freeze({
  PIN_PEPPER: 'FT_PIN_PEPPER',
  SESSION_KEY: 'FT_SESSION_KEY',
  ALLOWED_ORIGIN: 'FT_ALLOWED_ORIGIN',
});

/** Fallbacks, used only when a Settings row is missing. */
var DEFAULTS = Object.freeze({
  PIN_LENGTH: 6,
  HASH_ITERATIONS: 600,
  WEEKLY_GOAL: 3,
  SESSION_ABSOLUTE_DAYS: 30,
  SESSION_IDLE_DAYS: 14,
  SESSION_TOUCH_MINUTES: 5,
  MAX_FAILED_ATTEMPTS: 5,
  DUPLICATE_WINDOW_DAYS: 30,
  DAILY_SUBMISSION_CAP: 10,
  INVITE_EXPIRY_DAYS: 14,
  INVITE_CODE_LENGTH: 8,
  CACHE_TTL_SECONDS: 60,
  CACHE_STATIC_SECONDS: 1800,
  LOCK_TIMEOUT_MS: 10000,
  PAGE_SIZE: 25,
  CALENDAR_WEEKS: 26,
  TOP_RANK_THRESHOLD: 10,
  IDEMPOTENCY_WINDOW_SECONDS: 60,
});

/**
 * Invite alphabet, excluding 0/O and 1/I/L.
 *
 * Codes are read off a phone screen and typed by hand, so legibility is worth
 * more than the handful of bits the excluded characters would add.
 */
var INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

var ID_PREFIX = Object.freeze({ MEMBER: 'FT', SUBMISSION: 'SB', NOTIFICATION: 'NT' });
