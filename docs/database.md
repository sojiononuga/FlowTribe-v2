# Database Architecture — Google Sheets

**Phase 2 · Part 1 (schema) and Part 2 (relationships)**
**Revision 3** — adds the Activity Calendar, milestones, Flow Levels, and the
rollup layer. Field-level detail lives in [`data-dictionary.md`](data-dictionary.md).

---

## 1. Designing for a database that has no indexes

Google Sheets is the store, by requirement and by good sense: free, repairable
by the operator without a developer, and natively reachable from Apps Script.

What it does not have shapes every decision below.

| Missing | Consequence | How this design answers it |
|---|---|---|
| Indexes | Every query is a **full-range read** | Rollup sheets sized so the hot read is small |
| Transactions | Check-then-act races are real | `LockService` around every write touching derived state |
| Constraints | No uniqueness, no foreign keys, no types | Enforced in the service layer; validated nightly |
| Query planner | No joins | Denormalise deliberately, rebuild from the ledger |

**The governing rule: one immutable ledger, everything else derived.**
`Submissions` is the only sheet that records fact. Every counter, streak,
calendar square, milestone, level, and rank is computed from it and can be
rebuilt from scratch. That is what makes denormalisation safe — a corrupted
rollup is a bug, not a data loss.

### Scale, concretely

60 members, 3–7 posts a week each.

| Sheet | Rows after 1 year | After 3 years |
|---|---|---|
| Members | 60 | ~150 |
| Submissions | ~15,000 | ~45,000 |
| WeeklyStats | ~3,100 | ~9,400 |
| ActivityCalendar | **60** | **450** |
| MemberMilestones | ~600 | ~2,000 |
| Sessions | ~200 live | ~200 live |

The number that matters is **ActivityCalendar: 60 rows for a full year of daily
data across the whole community.** That is §4's packed-map decision, and it is
the difference between a dashboard that opens instantly and one that scans
15,000 rows to draw 365 squares.

---

## 2. Sheet inventory

Fourteen sheets in four groups.

| # | Sheet | Group | Purpose | Reads | Writes |
|---|---|---|---|---|---|
| 1 | `Members` | Identity | Credentials, settings, materialised stats | Every request | Per submission |
| 2 | `Profiles` | Identity | Optional Stage 2 data (PII) | Rare | Rare |
| 3 | `InviteCodes` | Identity | Single-use registration codes | Registration only | Admin + registration |
| 4 | `Sessions` | Identity | Live login sessions | Every request | Login/logout |
| 5 | `Submissions` | Activity | **The ledger. Append-only.** | Rebuilds, admin | Per submission |
| 6 | `ActivityCalendar` | Activity | Packed per-year day map | Every dashboard | Per submission |
| 7 | `WeeklyStats` | Activity | Per member, per week rollup | Dashboard, leaderboard | Per submission |
| 8 | `MilestoneCatalog` | Celebration | Milestone presentation config | Cached | Admin, rare |
| 9 | `MemberMilestones` | Celebration | Unlock ledger. Append-only | Dashboard, profile | On unlock |
| 10 | `FlowLevels` | Celebration | Level catalog and thresholds | Cached | Admin, rare |
| 11 | `Settings` | System | All tunable configuration | Cached | Super Admin |
| 12 | `AuditLog` | System | Who did what. Append-only | Investigation | Every mutation |
| 13 | `Notifications` | System | Outbox for future delivery | Jobs | On events |
| 14 | `CommunityStats` | System | Community-wide daily rollup | Admin analytics | Nightly |

### Sheets deliberately not created

**`Leaderboards`.** Rank is `WeeklyStats` sorted by post count. A separate sheet
would be a second copy of the same fact, free to drift. The one thing it seemed
to offer — a frozen final standing for the Top 10 and Weekly Champion
milestones — is handled by writing `Rank` and `RankFinal` into `WeeklyStats`
when the week closes.

**`AdminActivityLog`, separate from `AuditLog`.** Two logs means two places to
look when investigating, and a guaranteed argument about which one an event
belongs in. One `AuditLog` with an `ActorRole` column answers every question
either would, and filtering by role is a column comparison.

**`DailyActivity`, one row per member per active day.** ~15,000 rows a year to
serve a calendar — the same scan cost as the ledger it was meant to accelerate.
Rejected in favour of §4.

---

## 3. Identity sheets

### 3.1 `Members`

**Why it exists:** one row per human. The join target for everything.
**Primary key:** `MemberID`. **Read on every authenticated request.**

| # | Column | Type | Key | Notes |
|---|---|---|---|---|
| A | `MemberID` | Text | **PK** | `FT-0001`. Assigned once, never reused |
| B | `Username` | Text | | As typed, preserving their capitalisation |
| C | `UsernameKey` | Text | **UQ** | Lowercased. **The login identifier** |
| D | `FullName` | Text | | Display only. **Not unique** |
| E | `PinHash` | Text | | Iterated HMAC-SHA256. Never leaves the server |
| F | `PinSalt` | Text | | Per member, random |
| G | `PreferredPlatform` | Enum | | LinkedIn · X · Instagram · TikTok · YouTube |
| H | `WeeklyGoal` | Int | | 3 · 5 · 7 |
| I | `JoinDate` | Date | | Drives the Founding Member milestone |
| J | `Status` | Enum | | Active · Inactive |
| K | `Role` | Enum | | Member · CommunityManager · SuperAdmin |
| L | `ConsentFeature` | Bool | | Gates public shoutouts. Collected at registration |
| M | `MustChangePin` | Bool | | Blocks every action but changing it |
| N | `ProfileComplete` | Bool | | Drives the Stage 2 nudge. Never gates anything |
| O | `InviteCodeUsed` | Text | FK | → `InviteCodes.Code`. Referral provenance |
| P | `FailedLoginCount` | Int | | Reset on success |
| Q | `LockedUntil` | DateTime | | Blank when not locked |
| — | *derived block below* | | | **All recomputable. Cache, never truth** |
| R | `AllTimePosts` | Int | | |
| S | `ActiveDays` | Int | | Distinct days with a post. Drives day milestones |
| T | `CurrentWeekStreak` | Int | | Consecutive weeks meeting goal |
| U | `LongestWeekStreak` | Int | | Monotonic |
| V | `PerfectWeeks` | Int | | Lifetime count of weeks meeting goal |
| W | `LastSubmissionDate` | Date | | |
| X | `FlowLevelID` | Text | FK | → `FlowLevels.LevelID` |
| Y | `FlowLevelAchievedAt` | DateTime | | Lets a level-up be detected and celebrated |
| Z | `MilestonesEarned` | Int | | Denormalised count of `MemberMilestones` |
| AA | `UpdatedAt` | DateTime | | |

**On the derived block (R–Z).** Nine materialised columns is a lot, and the
reason is specific: this is the dashboard payload. Computing them on read means
scanning the ledger on every dashboard open. Computing them on write means one
recalculation per submission, amortised across a member's whole week of
viewing. Correctness is protected by the nightly reconcile — if a cell is edited
by hand, the app self-heals within a day.

**Why `FlowLevelID` is stored** rather than derived on read like rank: a level-up
must be *detected* to be celebrated. Comparing the stored level to the freshly
computed one is what tells us a member just crossed a threshold.

**Why the streak columns are named `WeekStreak`, not `Streak`.** With the
Activity Calendar showing days, an unqualified "streak" becomes ambiguous. The
name states its unit. See [`celebration-system.md`](celebration-system.md) §4.

### 3.2 `Profiles` — 1:1 with Members

**Why separate:** `Members` is read on every authenticated request. Putting
phone numbers and emails there means personal data flows through every code
path in the application and sits in every cache entry. Split, PII is read only
when a profile is deliberately opened. One extra lookup on a rare operation.

**PK/FK:** `MemberID`. Row created on first save — a member who never completes
Stage 2 has no row, which is the correct representation of "no data".

| # | Column | Type | Notes |
|---|---|---|---|
| A | `MemberID` | Text | **PK, FK** → Members |
| B | `WhatsAppNumber` | Text | Format-checked, not verified |
| C | `Email` | Text | Format-checked, not verified |
| D | `Bio` | Text | ≤160 chars |
| E | `UpdatedAt` | DateTime | |

Profile photos are deferred. Adding `PhotoFileId` and `PhotoUrl` here is a
no-op for every other sheet, because nothing depends on the column count.

### 3.3 `InviteCodes`

**PK:** `Code`. **Why separate:** codes exist before the member does, and some
are never redeemed. They cannot live on a row that does not yet exist.

| # | Column | Type | Notes |
|---|---|---|---|
| A | `Code` | Text | **PK**. 8 chars, alphabet excludes `0 O 1 I L` |
| B | `Status` | Enum | Unused · Used · Revoked · Expired |
| C | `CreatedBy` | Text | **FK** → Members |
| D | `CreatedAt` | DateTime | |
| E | `ExpiresAt` | DateTime | Default +14 days |
| F | `UsedBy` | Text | **FK** → Members. Blank until redeemed |
| G | `UsedAt` | DateTime | |
| H | `Note` | Text | "for Amaka", "July cohort" |

Stored in plain text deliberately: unlike a PIN, a code must be read back to be
pasted into a message. Containment comes from being random, single-use, and
expiring. `CreatedBy` + `Members.InviteCodeUsed` gives referral provenance free.

### 3.4 `Sessions`

**PK:** `SessionID` — the **SHA-256 hash** of the token. The raw token exists
only in the member's browser, so a leaked spreadsheet hands over no live
sessions.

| # | Column | Type | Notes |
|---|---|---|---|
| A | `SessionID` | Text | **PK**. Hash of the token |
| B | `MemberID` | Text | **FK** → Members |
| C | `Role` | Enum | Snapshot. **Diagnostic only** — role is re-read per request |
| D | `CreatedAt` | DateTime | |
| E | `ExpiresAt` | DateTime | Absolute, 30 days |
| F | `LastSeenAt` | DateTime | Sliding renewal; 14-day idle expiry |
| G | `RevokedAt` | DateTime | Logout, suspension, role change, PIN reset |
| H | `UserAgent` | Text | Truncated |

Swept nightly, so the sheet stays at roughly the number of live sessions rather
than growing forever.

---

## 4. Activity sheets

### 4.1 `Submissions` — the ledger

**Append-only. Never updated, never deleted** — a bad row is marked `Voided`.
Every number in the product is derivable from this sheet alone, which is what
makes every rollup below safe to denormalise.

| # | Column | Type | Notes |
|---|---|---|---|
| A | `SubmissionID` | Text | **PK**. `SB-000123` |
| B | `Timestamp` | DateTime | Server time, Africa/Lagos |
| C | `MemberID` | Text | **FK** → Members. The join key |
| D | `Name` | Text | `FullName` snapshot — keeps the raw sheet readable |
| E | `Username` | Text | Snapshot. Two members may share a full name |
| F | `Platform` | Enum | Copied from the member at submit time |
| G | `ContentLink` | Text | Exactly as submitted |
| H | `LinkKey` | Text | Normalised. Duplicate-detection key |
| I | `DayKey` | Date | **New.** ISO date, Africa/Lagos. Calendar grouping key |
| J | `WeekStart` | Date | Monday. Canonical week key |
| K | `WeekNumber` | Int | ISO week, for display |
| L | `Month` | Int | From `Timestamp`, not `WeekStart` |
| M | `Year` | Int | From `Timestamp` |
| N | `GoalAtSubmission` | Int | The goal in force that week |
| O | `Status` | Enum | Active · Voided |

**Why `DayKey` is precomputed** rather than derived from `Timestamp` on read:
the same reason as `WeekStart`. Converting 15,000 timestamps into Africa/Lagos
calendar dates on every rebuild is work done once at write time instead.

**Why `GoalAtSubmission`:** a member upgrading from 3 to 7 would otherwise have
their existing perfect weeks retroactively revoked. Each week is judged against
the goal that applied during it.

### 4.2 `ActivityCalendar` — the packed day map

**PK:** `MemberID` + `Year`. **This is the most consequential decision in the
schema.**

| # | Column | Type | Notes |
|---|---|---|---|
| A | `MemberID` | Text | **PK part, FK** → Members |
| B | `Year` | Int | **PK part** |
| C | `DayMap` | Text | **366 characters.** One per day, `'0'`–`'9'` |
| D | `ActiveDays` | Int | Count of non-zero characters. Denormalised |
| E | `FirstActiveDay` | Date | For rendering an accurate start |
| F | `LastActiveDay` | Date | |
| G | `UpdatedAt` | DateTime | |

`DayMap` is a fixed 366-character string. Index 0 is 1 January; each character
is that day's submission count, capped at 9.

```
Jan 1 ─┐                                              ┌─ Dec 31
       0000100101110001000110100000 … 0021001100010000
              ↑ three posts that week
```

**What this buys:**

| | Row-per-day design | Packed map |
|---|---|---|
| Rows for the community, 1 year | ~15,000 | **60** |
| Read a member's full year | Filter 15,000 rows | **One cell** |
| Write one submission | Append or update a row | One character |
| Support colour intensity later | Already there | **Already there** — digits 0–9 |
| Support yearly history | Filter by date | One row per year |
| Export a consistency report | Query and aggregate | Copy a string |

**Why it is safe to denormalise this aggressively:** the map holds nothing that
`Submissions` does not. A nightly job rebuilds it from the ledger, so drift is
self-correcting rather than permanent.

**The honest trade-off:** you cannot query it. "Which members posted on 4 July"
requires reading every map and inspecting one character, or going back to the
ledger. That query has no product use — the calendar is always *one member's*
view — and the ledger answers it if one ever appears.

**Why digits rather than a boolean:** the spec says filled/empty today and
intensity later. A digit stores the count now, so intensity becomes a rendering
change with no migration. The character set also leaves room: letters could
encode goal-met or milestone days without touching the schema.

**Why 366 always:** a fixed width means index arithmetic never branches on leap
years. Day 366 is unused in common years. Six wasted characters per member per
year is not a cost worth optimising.

### 4.3 `WeeklyStats`

**PK:** `MemberID` + `WeekStart`. One row per member per week they were active.

| # | Column | Type | Notes |
|---|---|---|---|
| A | `MemberID` | Text | **PK part, FK** → Members |
| B | `WeekStart` | Date | **PK part.** Monday |
| C | `PostCount` | Int | Active submissions that week |
| D | `DistinctDays` | Int | Days posted on. Distinguishes 3 posts over 3 days from 3 in one |
| E | `GoalAtWeek` | Int | The goal in force |
| F | `GoalMet` | Bool | `PostCount >= GoalAtWeek` |
| G | `Rank` | Int | Live rank, refreshed as the week runs |
| H | `RankFinal` | Int | **Frozen at week close.** Feeds Top 10 and Weekly Champion |
| I | `UpdatedAt` | DateTime | |

**Why it exists rather than recomputing:** the weekly leaderboard needs every
member's current count on every dashboard open. From the ledger that is a
15,000-row scan; from here it is ~60 rows for the current week.

**Why `RankFinal` is separate from `Rank`:** rank moves all week. A milestone
saying "you finished in the Top 10" must be evaluated against a settled number,
not a Tuesday-afternoon one. The weekly rollover job freezes it.

**Why `DistinctDays`:** it is what separates genuine consistency from batching.
Three posts on Saturday and three posts across three days both meet a goal of 3;
only one of them is the habit this product exists to build. It also powers the
redefined Perfect Week milestone.

---

## 5. Celebration sheets

The design question here is where a milestone *definition* lives. The answer
is: **split by nature — presentation is data, conditions are code.**

An unlock condition like "seven consecutive posting days" is a function, not a
value. Expressing it in a spreadsheet cell means inventing a rules language
with no tests, no type checking, and edit access for anyone who opens the file.
A wrong character silently stops every member earning a milestone.

So: `MilestoneCatalog` holds the name, description, icon, category, rarity, and
active flag — everything an admin might reasonably reword without a deploy. The
evaluator lives in `appsscript/lib/milestones.js`, matched by `MilestoneID`,
pure and unit-tested. Same split as the metric registry (D23).

### 5.1 `MilestoneCatalog`

**PK:** `MilestoneID`. Seeded at bootstrap, cached aggressively.

| # | Column | Type | Notes |
|---|---|---|---|
| A | `MilestoneID` | Text | **PK**. `first-step`, `posts-100` |
| B | `Name` | Text | "First Step" |
| C | `Description` | Text | Member-facing, coach voice |
| D | `Category` | Enum | GettingStarted · Consistency · WeeklyExcellence · Posting · Community |
| E | `IconID` | Text | Key in `src/lib/icons.js`. **Never an emoji** |
| F | `Rarity` | Enum | Common · Uncommon · Rare · Legendary. Presentational |
| G | `SortOrder` | Int | Display order within a category |
| H | `Active` | Bool | Retire a milestone without deleting earned history |
| I | `Hidden` | Bool | **Seam:** secret milestones, invisible until earned |
| J | `AvailableFrom` | Date | **Seam:** seasonal milestones |
| K | `AvailableUntil` | Date | **Seam:** seasonal milestones |
| L | `SeriesID` | Text | **Seam:** multi-tier — `posts` groups 10/50/100/250/500 |
| M | `Tier` | Int | **Seam:** position within a series |
| N | `BadgeArtworkUrl` | Text | **Seam:** future badge artwork. Icon is the fallback |

Columns I–N are the future-compatibility requirement, present and unused. Each
costs one empty column and removes a migration later.

### 5.2 `MemberMilestones` — the unlock ledger

**PK:** `MemberID` + `MilestoneID`. **Append-only.** A milestone, once earned,
is never revoked — including if the definition later changes.

| # | Column | Type | Notes |
|---|---|---|---|
| A | `MemberID` | Text | **PK part, FK** → Members |
| B | `MilestoneID` | Text | **PK part, FK** → MilestoneCatalog |
| C | `UnlockedAt` | DateTime | |
| D | `UnlockContext` | Text | JSON snapshot: the values that triggered it |
| E | `Seen` | Bool | False until the celebration modal is shown |

**Why `Seen` matters:** a member might earn a milestone from a submission made
on their phone and close the tab before the modal renders. The flag means the
celebration waits for them rather than being lost. It also handles several
milestones unlocking at once — they queue.

**Why `UnlockContext`:** when a member asks why they earned something, or
whether a number was right, the answer is in the row rather than in a
reconstruction.

### 5.3 `FlowLevels`

**PK:** `LevelID`. Six rows, ordered.

Unlike milestones, level thresholds genuinely are data — a number to compare
against — so more of the definition lives in the sheet.

| # | Column | Type | Notes |
|---|---|---|---|
| A | `LevelID` | Text | **PK**. `seedling`, `creator` |
| B | `Name` | Text | Seedling · Creator · Builder · Consistent Creator · Community Leader · Tribe Legend |
| C | `Description` | Text | Identity statement, not a rule |
| D | `IconID` | Text | From the icon system |
| E | `SortOrder` | Int | 1–6. Ascending |
| F | `RequiredPosts` | Int | All-time posts threshold |
| G | `RequiredPerfectWeeks` | Int | Weeks meeting goal |
| H | `Criteria` | Text | Optional extra condition id, evaluated in code |
| I | `Active` | Bool | |

Proposed thresholds — **both** conditions required, so neither raw volume nor
tenure alone carries someone through:

| Level | Posts | Perfect weeks |
|---|---|---|
| Seedling | 0 | 0 |
| Creator | 10 | 1 |
| Builder | 50 | 4 |
| Consistent Creator | 100 | 12 |
| Community Leader | 250 | 26 |
| Tribe Legend | 500 | 52 |

**Why both:** posts alone rewards a burst; weeks alone rewards the calendar
passing. Requiring both means a level says *"this person shows up and keeps
showing up"*, which is the identity the levels are meant to describe.

**Why a member's level is stored on `Members` rather than computed on read:**
a level-up must be detected to be celebrated. See §3.1.

---

## 6. System sheets

### 6.1 `Settings`

**PK:** `Key`. `Key | Value | Type | Category | Description | UpdatedBy | UpdatedAt`.

Every tunable number in the system, so changing one is an admin edit rather
than a redeploy. Grouped by category: `auth`, `session`, `submission`, `invite`,
`metrics`, `milestones`, `calendar`.

Notable keys added this phase:

| Key | Default | Purpose |
|---|---|---|
| `milestones.foundingPeriodEnd` | *(set at launch)* | Cutoff for the Founding Member milestone |
| `milestones.topRankThreshold` | `10` | What "Top 10" means, if the community grows |
| `calendar.defaultWeeks` | `26` | How much history the dashboard requests |
| `metrics.consistencyScore.enabled` | `FALSE` | Paused until defined together |

### 6.2 `AuditLog` — append-only

`Timestamp | ActorMemberID | ActorRole | Action | TargetMemberID | Details | Result | IPHint`

Logins and failures, lockouts, PIN resets, role changes, status changes,
deletions, voided submissions, rejected duplicates, invite lifecycle. The first
place to look when a member says their streak is wrong.

`ActorRole` is what makes a separate admin log unnecessary.

### 6.3 `Notifications` — the outbox

**PK:** `NotificationID`. Nothing sends anything in v2. The sheet exists so that
events which *should* notify are recorded from day one.

| # | Column | Type | Notes |
|---|---|---|---|
| A | `NotificationID` | Text | **PK** |
| B | `MemberID` | Text | **FK** → Members |
| C | `Type` | Enum | MilestoneUnlocked · LevelUp · WeeklyRecap · GoalReminder |
| D | `Channel` | Enum | InApp · Email · WhatsApp · Push |
| E | `Payload` | Text | JSON |
| F | `Status` | Enum | Pending · Sent · Failed · Suppressed |
| G | `CreatedAt` | DateTime | |
| H | `SentAt` | DateTime | |

**Why build an outbox nobody reads yet:** email celebrations, WhatsApp
celebrations, and push notifications are all on the future list. Retrofitting a
notification concept later means finding every place an event occurs and adding
a write. Recording them now costs one append and means the delivery worker is
the only thing left to build. `Suppressed` is where consent will be honoured.

### 6.4 `CommunityStats`

**PK:** `Date`. Written nightly.

`Date | PostsCount | ActiveMembers | NewMembers | GoalHitCount | PlatformBreakdown | MilestonesUnlocked | AvgPostsPerMember`

Turns "posts per day for the last 90 days" into a 90-row read instead of a full
ledger scan. This is what makes the admin analytics charts viable.

---

## 7. Part 2 — Entity relationships

### 7.1 Diagram

```
                        ┌──────────────────┐
                        │  InviteCodes     │
                        │  PK Code         │
                        └────┬────────┬────┘
                     CreatedBy│        │UsedBy
                             ↓        ↓
    ┌────────────────────────────────────────────────┐
    │                   Members                      │
    │  PK MemberID   UQ UsernameKey                  │
    │  FK FlowLevelID → FlowLevels                   │
    └──┬──────┬──────┬────────┬────────┬─────────┬───┘
       │1:1   │1:N   │1:N     │1:N     │1:N      │1:N
       ↓      ↓      ↓        ↓        ↓         ↓
  ┌────────┐ ┌──────────┐ ┌──────────────┐ ┌──────────────────┐
  │Profiles│ │ Sessions │ │ Submissions  │ │ MemberMilestones │
  │PK/FK   │ │PK Session│ │PK Submission │ │PK Member+Milestone│
  │MemberID│ │FK Member │ │FK MemberID   │ │FK MemberID        │
  └────────┘ └──────────┘ └──┬────────┬──┘ └────────┬─────────┘
                             │ derives│              │N:1
              ┌──────────────┘        └──────┐       ↓
              ↓                              ↓  ┌──────────────────┐
    ┌──────────────────┐         ┌──────────────┐│ MilestoneCatalog │
    │ ActivityCalendar │         │ WeeklyStats  ││ PK MilestoneID   │
    │ PK Member+Year   │         │ PK Member+Wk ││ SeriesID (self)  │
    └──────────────────┘         └──────────────┘└──────────────────┘
              ↑                              ↑
              └──── rebuilt nightly ─────────┘
                    from Submissions

    ┌─────────────┐  ┌──────────┐  ┌───────────────┐  ┌────────────────┐
    │ FlowLevels  │  │ Settings │  │ Notifications │  │ CommunityStats │
    │ PK LevelID  │  │ PK Key   │  │ FK MemberID   │  │ PK Date        │
    └─────────────┘  └──────────┘  └───────────────┘  └────────────────┘
         ↑ referenced by Members.FlowLevelID          ↑ nightly from Submissions

    ┌──────────┐
    │ AuditLog │  FK ActorMemberID, TargetMemberID → Members (soft)
    └──────────┘
```

### 7.2 Relationships in full

**One-to-one**

| Relationship | Notes |
|---|---|
| `Members` ↔ `Profiles` | Optional on the Profiles side. No row until Stage 2 is touched |
| `Members` ↔ `InviteCodes` (redemption) | Each member redeemed exactly one code; each code redeemed by at most one member |

**One-to-many**

| Parent | Child | Cardinality | Notes |
|---|---|---|---|
| Members | Sessions | 1:N | Several devices; swept on expiry |
| Members | Submissions | 1:N | The primary activity relationship |
| Members | ActivityCalendar | 1:N | One row per year |
| Members | WeeklyStats | 1:N | One row per active week |
| Members | MemberMilestones | 1:N | |
| Members | Notifications | 1:N | |
| Members | InviteCodes (issuance) | 1:N | An admin issues many codes |
| MilestoneCatalog | MemberMilestones | 1:N | One definition, many earners |
| FlowLevels | Members | 1:N | Many members at one level |

**Many-to-many**

One, resolved by a junction table:

> **Members ↔ MilestoneCatalog**, through `MemberMilestones`.
> A member earns many milestones; a milestone is earned by many members. The
> junction carries `UnlockedAt`, `UnlockContext`, and `Seen` — which is exactly
> why it is a table and not a list in a cell.

**Self-referencing**

`MilestoneCatalog.SeriesID` groups tiers: `posts-10`, `posts-50`, `posts-100`,
`posts-250`, `posts-500` all carry `SeriesID = posts` with ascending `Tier`.
That is what lets the dashboard show "next in this series" without hardcoding
the sequence.

### 7.3 Referential integrity, without a database that enforces it

Sheets has no foreign keys. Three mechanisms substitute:

1. **Write-time validation.** The service layer resolves every FK before
   writing. A submission cannot be appended for a `MemberID` that was not just
   loaded from `Members`.
2. **Deletion is refused, not cascaded.** `admin.members.delete` refuses while
   a member has submissions, and offers deactivation instead. Deleting someone
   with history orphans ledger rows and silently rewrites everyone else's
   historical leaderboard positions.
3. **Nightly reconcile.** Rebuilds every derived value from the ledger and
   reports orphans to `AuditLog` rather than deleting them silently.

---

## 8. Read and write frequency

The number that governs the design: **`member.dashboard` is by far the hottest
path**, and it must not scan the ledger.

| Operation | Sheets touched | Rows read | Frequency |
|---|---|---|---|
| Session validation | Sessions, Members | 2 (cached) | Every request |
| **Dashboard** | Members, ActivityCalendar, WeeklyStats, MemberMilestones, MilestoneCatalog, FlowLevels | **~1 + 1 + 60 + ~12 + 20 + 6** | Several/day/member |
| Submit a post | Submissions, Members, ActivityCalendar, WeeklyStats, MemberMilestones | append + 4 updates | 3–7/week/member |
| Leaderboard | WeeklyStats, Members | ~60 + 60 (cached 60s) | Several/day |
| Registration | InviteCodes, Members | full scan, locked | Once per member |
| Admin analytics | CommunityStats | 90–365 | Rare |
| Nightly reconcile | Everything | full | Once daily |

A dashboard open reads roughly **100 rows**. Against the ledger it would be
15,000. That ratio is the entire justification for §4 and §4.3.

---

## 9. Indexing strategy

There are no indexes. These four techniques replace them.

**1. Composite keys that sort naturally.** `MemberID + Year` and
`MemberID + WeekStart` mean a member's rows are contiguous, so a scan can stop
early rather than reading to the end.

**2. Precomputed grouping keys.** `DayKey`, `WeekStart`, `LinkKey` — each turns
a per-row computation into a comparison. `LinkKey` is what makes duplicate
detection a scan of one member's recent rows rather than URL parsing across the
ledger.

**3. `CacheService` in front of the hot reads.** Settings, the milestone
catalog, and Flow Levels are effectively static and cached for minutes. Weekly
leaderboards cache for 60 seconds and are invalidated explicitly on write.

**4. Packing, where a row per fact is not worth it.** `ActivityCalendar` is the
case: 366 facts in one cell because they are always read together and never
queried individually.

---

## 10. Future scalability

| Growth | First thing that hurts | Response |
|---|---|---|
| 60 → 300 members | Registration's full `InviteCodes` scan | Prefix-partition the sheet |
| 3 → 5 years | `Submissions` past ~50k rows | Archive closed years to a second spreadsheet; rollups already hold the history |
| Daily analytics | Already handled | `CommunityStats` |
| Colour intensity | Already handled | `DayMap` digits are counts today |
| Monthly / yearly calendar views | Already handled | One `ActivityCalendar` row per year |
| Secret, seasonal, tiered milestones | Already handled | Catalog columns I–N |
| Email / WhatsApp / push | Already handled | `Notifications` outbox |
| Outgrowing Sheets entirely | — | Repositories are the only sheet-aware layer. Services, controllers, and routing are untouched by a store swap |

The design point: every item on the future-features list is either already
carried by a column that exists, or is confined to one layer.

---

## 11. Launch state

**No migration.** v2 launches empty. `Bootstrap` creates all fourteen sheets
with headers, types, and validation, and seeds `MilestoneCatalog`, `FlowLevels`,
and `Settings`. `SeedSuperAdmin` creates one account — yours — the only account
ever created outside registration, run once from the editor and unreachable
over HTTP.

Every member, including everyone currently in v1, registers fresh with an invite
code.
