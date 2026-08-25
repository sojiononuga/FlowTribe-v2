# Data Dictionary

**Phase 2 · Part 5. The single source of truth for the data model.**

Every sheet, every field, every allowed value, every business rule. Maintained
for the life of the project — a schema change lands here in the same commit as
the code.

**Reflects the [architecture review](architecture-review.md) recommendations:**
`Members.MilestonesEarned`, `Members.ActiveDays`, and `WeeklyStats.Rank` are
removed, pending your approval of those items.

---

## Conventions

| Notation | Meaning |
|---|---|
| **PK** | Primary key |
| **FK** | Foreign key |
| **UQ** | Unique |
| **D** | Derived — recomputable from `Submissions`, rebuilt nightly |
| **S** | Secret — never returned by any endpoint |
| *(required)* | Must be non-empty |

**Types.** `Text` · `Int` · `Bool` (TRUE/FALSE) · `Date` (ISO `YYYY-MM-DD`) ·
`DateTime` (ISO 8601 with offset) · `Enum` · `JSON` (stringified).

**Timezone.** Every date and datetime is **Africa/Lagos (UTC+1, no DST)**,
written by the server. The browser clock is never trusted for anything
affecting a streak.

---

## 1 · Members

One row per person. The join target for everything. Read on every authenticated
request.

| Col | Field | Type | Key | Required | Allowed / format | Rule |
|---|---|---|---|---|---|---|
| A | `MemberID` | Text | **PK** | ✓ | `FT-` + 4+ digits | Assigned once. Never reused, never changed |
| B | `Username` | Text | | ✓ | 3–20 chars | As typed, preserving capitalisation |
| C | `UsernameKey` | Text | **UQ** | ✓ | `^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$` | Lowercased `Username`. **The login identifier.** Not in the reserved list |
| D | `FullName` | Text | | ✓ | 2–60 chars | Display only. **Duplicates allowed** |
| E | `PinHash` | Text | **S** | ✓ | hex | Iterated HMAC-SHA256 of PIN + salt + server pepper |
| F | `PinSalt` | Text | **S** | ✓ | hex, ≥16 bytes | Unique per member, cryptographically random |
| G | `PreferredPlatform` | Enum | | ✓ | `LinkedIn` `X` `Instagram` `TikTok` `YouTube` | Set at registration. Admin-editable only |
| H | `WeeklyGoal` | Int | | ✓ | `3` `5` `7` | Changing it never alters past weeks — see `GoalAtSubmission` |
| I | `JoinDate` | Date | | ✓ | ISO date | Server-set. Drives `founding-member` |
| J | `Status` | Enum | | ✓ | `Active` `Inactive` | Inactive blocks login and revokes all sessions |
| K | `Role` | Enum | | ✓ | `Member` `CommunityManager` `SuperAdmin` | Always `Member` at registration. Only `admin.members.setRole` changes it |
| L | `ConsentFeature` | Bool | | ✓ | | Default **FALSE**. Gates every public shoutout |
| M | `MustChangePin` | Bool | | ✓ | | TRUE blocks all actions but `auth.changePin` and `auth.logout` |
| N | `ProfileComplete` | Bool | | ✓ | | TRUE once any Stage 2 field is saved. **Never gates anything** |
| O | `InviteCodeUsed` | Text | FK | ✓ | → `InviteCodes.Code` | Referral provenance |
| P | `FailedLoginCount` | Int | | ✓ | ≥ 0 | Reset to 0 on success |
| Q | `LockedUntil` | DateTime | | | | Blank when not locked. Set to +15 min at 5 failures |
| R | `AllTimePosts` | Int | **D** | ✓ | ≥ 0 | Count of Active submissions |
| S | `CurrentWeekStreak` | Int | **D** | ✓ | ≥ 0 | Consecutive **closed** weeks meeting goal, plus the current week if already met |
| T | `LongestWeekStreak` | Int | **D** | ✓ | ≥ 0 | **Monotonic — never decreases** |
| U | `PerfectWeeks` | Int | **D** | ✓ | ≥ 0 | Lifetime count of weeks where `GoalMet` |
| V | `LastSubmissionDate` | Date | **D** | | | |
| W | `FlowLevelID` | Text | FK, **D** | ✓ | → `FlowLevels.LevelID` | Stored so a level-up can be *detected*. **Never decreases** |
| X | `FlowLevelAchievedAt` | DateTime | **D** | ✓ | | Set when the level changes |
| Y | `UpdatedAt` | DateTime | | ✓ | | |

**Business rules**

- `UsernameKey` is unique, case-insensitively, and checked inside the
  registration lock.
- Reserved usernames: `admin` `administrator` `superadmin` `moderator`
  `flowtribe` `flow_tribe` `flow.tribe` `support` `help` `api` `system` `team`
  `staff` `official` `iyanu` `me` `null` `undefined`.
- Members cannot change their own `Username`; Community Managers and Super
  Admins can. Members can change their own `FullName`.
- A member cannot change their own `Role`, even holding `member:role:set`.
- The system refuses any change leaving zero active Super Admins.
- `LongestWeekStreak` and `FlowLevelID` never move backwards, by design —
  see [`celebration-system.md`](celebration-system.md) §3.

---

## 2 · Profiles

Optional Stage 2 data. Separate because `Members` is read on every request and
PII should not travel that path. **No row exists until a member saves something.**

| Col | Field | Type | Key | Allowed / format | Rule |
|---|---|---|---|---|---|
| A | `MemberID` | Text | **PK, FK** | → `Members.MemberID` | 1:1, optional side |
| B | `WhatsAppNumber` | Text | | 7–15 digits, optional `+` | Format-checked, **never verified** |
| C | `Email` | Text | | `x@y.z` | Format-checked, **never verified** |
| D | `Bio` | Text | | ≤ 160 chars | Plain text |
| E | `UpdatedAt` | DateTime | | | |

Every field is independently savable — partial completion is a normal state,
not a validation failure. Saving any one sets `Members.ProfileComplete`.

Profile photos are not in v2. Adding `PhotoFileId` and `PhotoUrl` here changes
nothing else.

---

## 3 · InviteCodes

| Col | Field | Type | Key | Allowed / format | Rule |
|---|---|---|---|---|---|
| A | `Code` | Text | **PK** | 8 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` | Excludes `0 O 1 I L` — codes are typed by hand |
| B | `Status` | Enum | | `Unused` `Used` `Revoked` `Expired` | |
| C | `CreatedBy` | Text | FK | → `Members.MemberID` | Requires `invite:create` |
| D | `CreatedAt` | DateTime | | | |
| E | `ExpiresAt` | DateTime | | | Default `CreatedAt` + `invite.expiryDays` (14) |
| F | `UsedBy` | Text | FK | → `Members.MemberID` | Blank until redeemed |
| G | `UsedAt` | DateTime | | | |
| H | `Note` | Text | | ≤ 100 chars | "for Amaka", "July cohort" |

**Business rules**

- **Single use.** Redemption is `Unused` → `Used`, atomically, inside the
  registration lock.
- Only `Unused` codes may be revoked; a redeemed code cannot be un-redeemed.
- Stored in plain text, deliberately — a code must be readable to be shared.
  Containment is randomness, single use, and expiry.
- Community Managers and Super Admins may generate; bulk generation supported.

---

## 4 · Sessions

| Col | Field | Type | Key | Rule |
|---|---|---|---|---|
| A | `SessionID` | Text | **PK, S** | **SHA-256 of the token.** The raw token exists only in the browser |
| B | `MemberID` | Text | FK | → `Members.MemberID` |
| C | `Role` | Enum | | Snapshot at login. **Diagnostic only** — role is re-read from `Members` on every request |
| D | `CreatedAt` | DateTime | | |
| E | `ExpiresAt` | DateTime | | Absolute, `session.absoluteDays` (30). Slides forward on activity |
| F | `LastSeenAt` | DateTime | | Idle expiry after `session.idleDays` (14) |
| G | `RevokedAt` | DateTime | | Set on logout, suspension, role change, PIN change or reset |
| H | `UserAgent` | Text | | Truncated to 120 chars |

Revoked or expired rows are swept nightly.

---

## 5 · Submissions

**The ledger. Append-only. The only sheet that records fact.**
Never updated, never deleted — a bad row is marked `Voided`.

| Col | Field | Type | Key | Allowed / format | Rule |
|---|---|---|---|---|---|
| A | `SubmissionID` | Text | **PK** | `SB-` + 6+ digits | |
| B | `Timestamp` | DateTime | | | **Server time.** Client clocks are never trusted |
| C | `MemberID` | Text | FK | → `Members.MemberID` | The join key |
| D | `Name` | Text | | | `FullName` snapshot — keeps the raw sheet readable |
| E | `Username` | Text | | | Snapshot. Two members may share a full name |
| F | `Platform` | Enum | | as `Members.PreferredPlatform` | **Copied from the member, never from the client** |
| G | `ContentLink` | Text | | valid URL | Exactly as submitted |
| H | `LinkKey` | Text | | | Normalised: lowercase host, `utm_*` and fragment stripped, trailing slash removed |
| I | `DayKey` | Date | | ISO date | Africa/Lagos calendar day. Calendar grouping key |
| J | `WeekStart` | Date | | ISO date, a Monday | Canonical week key |
| K | `WeekNumber` | Int | | 1–53 | ISO week. **Display only** |
| L | `Month` | Int | | 1–12 | From `Timestamp`, not `WeekStart` |
| M | `Year` | Int | | | From `Timestamp` |
| N | `GoalAtSubmission` | Int | | `3` `5` `7` | The goal in force that week |
| O | `Status` | Enum | | `Active` `Voided` | Only `Active` counts anywhere |

**Business rules**

- The link's registrable domain must match the member's platform, or
  `PLATFORM_MISMATCH`. Allowlist is **server-side only**.
- The same `LinkKey` by the same member within `submission.duplicateWindowDays`
  (30) is rejected as `DUPLICATE_LINK`. **Cross-member duplicates are allowed** —
  two members may legitimately link one collaborative post.
- `submission.dailyCap` (10) per member per `DayKey`.
- `WeekStart` is canonical rather than `(WeekNumber, Year)`: ISO week 1 can
  contain December days and some years have 53 weeks. A Monday date has no
  New Year edge cases.
- `GoalAtSubmission` is why raising a goal never retroactively revokes past
  perfect weeks.
- Voiding recomputes every rollup for the affected member.

---

## 6 · ActivityCalendar

One row per member per year. A packed day map — see
[`database.md`](database.md) §4.2 for why.

| Col | Field | Type | Key | Allowed / format | Rule |
|---|---|---|---|---|---|
| A | `MemberID` | Text | **PK part, FK** | → `Members.MemberID` | |
| B | `Year` | Int | **PK part** | | |
| C | `DayMap` | Text | **D** | **exactly 366 chars**, each `0`–`9` | Index 0 = 1 January. Character = that day's Active submission count, capped at 9 |
| D | `ActiveDays` | Int | **D** | ≥ 0 | Count of non-`0` characters. **The authoritative active-day count.** Lifetime active days = the sum across a member's year rows — this is what the active-day milestones read |
| E | `FirstActiveDay` | Date | **D** | | |
| F | `LastActiveDay` | Date | **D** | | |
| G | `UpdatedAt` | DateTime | | | |

**Business rules**

- Always 366 characters, leap year or not, so index arithmetic never branches.
  Day 366 is unused in common years.
- A row is created at registration with an all-zero map, so the calendar renders
  on a member's first day.
- Cap of 9 is a display cap. The true count for any day is always in the ledger.
- Digits, not booleans, so colour intensity later needs no migration.

---

## 7 · WeeklyStats

One row per member per active week.

| Col | Field | Type | Key | Rule |
|---|---|---|---|---|
| A | `MemberID` | Text | **PK part, FK** | → `Members.MemberID` |
| B | `WeekStart` | Date | **PK part** | Monday, Africa/Lagos |
| C | `PostCount` | Int | **D** | Active submissions that week |
| D | `DistinctDays` | Int | **D** | Separate days posted on. Distinguishes 3 posts over 3 days from 3 on one |
| E | `GoalAtWeek` | Int | | The goal in force. Frozen at first submission of the week |
| F | `GoalMet` | Bool | **D** | `PostCount >= GoalAtWeek` |
| G | `RankFinal` | Int | | **Frozen at week close.** Blank while the week is open |
| H | `UpdatedAt` | DateTime | | |

**Business rules**

- Live rank is **derived on read** and cached 60 s, never stored — per the
  architecture review.
- `RankFinal` is competition ranking: ties share a rank, and the next rank
  skips. Members with `PostCount = 0` are **unranked**, not ranked last.
- Only `Members.Status = Active` appear in any ranking.
- `GoalMet` transitioning false → true is the "weekly goal completed" event.

---

## 8 · MilestoneCatalog

Presentation and configuration. **Unlock conditions live in code**, matched by
`MilestoneID` — see [`celebration-system.md`](celebration-system.md) §2.

| Col | Field | Type | Key | Allowed / format | Rule |
|---|---|---|---|---|---|
| A | `MilestoneID` | Text | **PK** | kebab-case | Stable forever. Referenced by code |
| B | `Name` | Text | | | Editable without a deploy |
| C | `Description` | Text | | ≤ 140 chars | Coach voice |
| D | `Category` | Enum | | `GettingStarted` `Consistency` `WeeklyExcellence` `Posting` `Community` | |
| E | `IconID` | Text | | key in `src/lib/icons.js` | **Never an emoji** |
| F | `Rarity` | Enum | | `Common` `Uncommon` `Rare` `Legendary` | Presentational only |
| G | `SortOrder` | Int | | | Within a category |
| H | `Active` | Bool | | | FALSE retires it without erasing earned history |
| I | `Hidden` | Bool | | | *Seam:* secret milestones — invisible until earned |
| J | `AvailableFrom` | Date | | | *Seam:* seasonal |
| K | `AvailableUntil` | Date | | | *Seam:* seasonal |
| L | `SeriesID` | Text | | | *Seam:* multi-tier. `posts` groups 10/50/100/250/500 |
| M | `Tier` | Int | | | *Seam:* position in a series |
| N | `BadgeArtworkUrl` | Text | | | *Seam:* future artwork. `IconID` is the fallback |

Columns I–N are present and unused. Each costs one empty column and removes a
migration later.

---

## 9 · MemberMilestones

The unlock ledger. **Append-only.** Resolves the only many-to-many in the model.

| Col | Field | Type | Key | Rule |
|---|---|---|---|---|
| A | `MemberID` | Text | **PK part, FK** | → `Members.MemberID` |
| B | `MilestoneID` | Text | **PK part, FK** | → `MilestoneCatalog.MilestoneID` |
| C | `UnlockedAt` | DateTime | | |
| D | `UnlockContext` | JSON | | Snapshot of the values that triggered it |
| E | `Seen` | Bool | | FALSE until the celebration modal has been shown |

**Business rules**

- **A milestone once earned is never revoked**, including if its definition
  later changes.
- `(MemberID, MilestoneID)` is unique. Re-checked immediately before append,
  inside the lock.
- `Seen = FALSE` is the celebration queue: unlocks earned while a member's tab
  was closed wait for them, and several unlocking at once queue rather than
  collide.
- `UnlockContext` is sanitised against formula injection before writing.

---

## 10 · FlowLevels

Six rows, ordered. Unlike milestones, thresholds genuinely are data.

| Col | Field | Type | Key | Rule |
|---|---|---|---|---|
| A | `LevelID` | Text | **PK** | `seedling` `creator` `builder` `consistent-creator` `community-leader` `tribe-legend` |
| B | `Name` | Text | | |
| C | `Description` | Text | | An identity statement, not a rule |
| D | `IconID` | Text | | From the icon system |
| E | `SortOrder` | Int | | 1–6, ascending |
| F | `RequiredPosts` | Int | | `AllTimePosts` threshold |
| G | `RequiredPerfectWeeks` | Int | | `PerfectWeeks` threshold |
| H | `Criteria` | Text | | Optional extra condition id, evaluated in code |
| I | `Active` | Bool | | |

**Seeded values**

| LevelID | Name | Posts | Perfect weeks |
|---|---|---|---|
| `seedling` | Seedling | 0 | 0 |
| `creator` | Creator | 10 | 1 |
| `builder` | Builder | 50 | 4 |
| `consistent-creator` | Consistent Creator | 100 | 12 |
| `community-leader` | Community Leader | 250 | 26 |
| `tribe-legend` | Tribe Legend | 500 | 52 |

**Business rules**

- **Both** thresholds must be met. Posts alone rewards a burst; weeks alone
  rewards the calendar passing.
- A member holds exactly one level: the highest whose conditions are satisfied.
- **Levels never fall.** They describe identity, not current form.

---

## 11 · Settings

`Key | Value | Type | Category | Description | UpdatedBy | UpdatedAt`.
PK `Key`. Super Admin write only. Cached aggressively.

| Key | Default | Category |
|---|---|---|
| `auth.pinLength` | `6` | auth |
| `auth.maxFailedAttempts` | `5` | auth |
| `auth.lockoutMinutes` | `15` | auth |
| `session.absoluteDays` | `30` | session |
| `session.idleDays` | `14` | session |
| `submission.duplicateWindowDays` | `30` | submission |
| `submission.dailyCap` | `10` | submission |
| `member.defaultWeeklyGoal` | `3` | member |
| `invite.expiryDays` | `14` | invite |
| `invite.codeLength` | `8` | invite |
| `calendar.defaultWeeks` | `26` | calendar |
| `milestones.foundingPeriodEnd` | *(set at launch)* | milestones |
| `milestones.topRankThreshold` | `10` | milestones |
| `metrics.enabled` | *(list)* | metrics |
| `metrics.consistencyScore.enabled` | **`FALSE`** | metrics |
| `metrics.consistencyScore.windowWeeks` | `4` | metrics |
| `metrics.goalCompletionRate.scope` | `week` | metrics |
| `metrics.avgPostsPerMember.scope` | `week` | metrics |

Anything an operator might reasonably want to change is here rather than in
code, so changing it is an admin edit and not a redeploy.

---

## 12 · AuditLog

Append-only. `Timestamp | ActorMemberID | ActorRole | Action | TargetMemberID |
Details | Result | IPHint`.

`ActorRole` is what makes a separate admin log unnecessary — filtering by role
answers everything a second sheet would.

**Logged:** login success and failure, lockout, registration, PIN change and
reset, role change, status change, member deletion, submission void, rejected
duplicate, invite create/redeem/revoke, settings change, admin profile reads,
`ROLLUP_PENDING` markers, nightly job completion.

`Result` values: `SUCCESS` `FAILURE` `REFUSED` `READ` `REPAIRED`.

---

## 13 · Notifications

An outbox. Nothing delivers in v2; events are recorded from day one so the
delivery worker is the only thing left to build.

| Col | Field | Type | Allowed |
|---|---|---|---|
| A | `NotificationID` | Text | **PK** |
| B | `MemberID` | Text | FK → `Members` |
| C | `Type` | Enum | `MilestoneUnlocked` `LevelUp` `WeeklyRecap` `GoalReminder` |
| D | `Channel` | Enum | `InApp` `Email` `WhatsApp` `Push` |
| E | `Payload` | JSON | |
| F | `Status` | Enum | `Pending` `Sent` `Failed` `Suppressed` |
| G | `CreatedAt` | DateTime | |
| H | `SentAt` | DateTime | |

`Suppressed` is where consent will be honoured when delivery is built.

---

## 14 · CommunityStats

Nightly community-wide rollup. PK `Date`.

`Date | PostsCount | ActiveMembers | NewMembers | GoalHitCount |
PlatformBreakdown (JSON) | MilestonesUnlocked`

Turns "posts per day for 90 days" into a 90-row read instead of a ledger scan.
`AvgPostsPerMember` is **not** stored — it is two columns divided, computed on
read.

---

## Cross-cutting rules

**Week boundary.** Monday 00:00 Africa/Lagos. Every streak, rollup, and
leaderboard uses it.

**Derived means rebuildable.** Every **D** field is recomputed nightly from
`Submissions`. A hand-edited cell self-heals within a day, and a discrepancy is
recorded in `AuditLog` rather than silently corrected.

**Nothing is hard-deleted** except expired sessions. Members deactivate,
submissions void, invites revoke, milestones retire.

**Server time only.** Every timestamp is written by the server.

**Never returned by any endpoint:** `PinHash`, `PinSalt`, `SessionID`, another
member's `Profiles` row, unused invite codes outside the admin invite endpoints.

**Sheet writes are sanitised.** Any string that could contain member input is
escaped against formula injection at the `SheetClient` boundary.

---

## Maintenance

This document is the source of truth. A schema change lands here **in the same
change** as the code, or the document has already started lying — and a data
dictionary nobody trusts is worse than none, because people act on it anyway.
