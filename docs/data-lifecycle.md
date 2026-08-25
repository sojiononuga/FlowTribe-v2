# Data Lifecycle

**Phase 2 · Part 3.** What happens behind the scenes, process by process.

Read alongside [`database.md`](database.md) for the schema and
[`celebration-system.md`](celebration-system.md) for how milestones and levels
are evaluated.

---

## 1. Registration

```
Member submits   fullName · username · pin · pinConfirm
                 platform · weeklyGoal · inviteCode · consentFeature
       │
       ├─ shape validation                                  → VALIDATION_FAILED
       ├─ rate limit by invite code + global hourly ceiling → RATE_LIMITED
       │
       ├─── ACQUIRE LOCK ────────────────────────────────────────────┐
       │  InviteCodes: code exists?                → INVITE_INVALID  │
       │  InviteCodes: Status = Unused?            → INVITE_USED     │
       │  InviteCodes: now < ExpiresAt?            → INVITE_EXPIRED  │
       │  username format + reserved list          → USERNAME_INVALID│
       │  Members: UsernameKey free?               → USERNAME_TAKEN  │
       │  PIN policy; pin === pinConfirm           → PIN_INVALID     │
       │                                                             │
       │  generate salt → iterated HMAC(pin + salt + pepper)         │
       │  assign MemberID                                            │
       │                                                             │
       │  WRITE Members       new row, counters at 0,                │
       │                      FlowLevelID = 'seedling'               │
       │  WRITE InviteCodes   Status = Used, UsedBy, UsedAt          │
       └─── RELEASE LOCK ────────────────────────────────────────────┘
       │
       ├─ WRITE ActivityCalendar   empty map for the current year
       ├─ evaluate milestones      → Founding Member, if within the window
       ├─ WRITE Sessions           new session
       ├─ WRITE AuditLog           registration
       └─ RETURN token + member → dashboard, already signed in
```

**Why the lock spans all of that.** Two check-then-act races live here and both
are real: two people redeeming the same code, and two people claiming the same
username. Sheets has no unique constraints, so the lock is the only thing
preventing a duplicate. Grouping them also means a failed registration never
burns a valid code.

**Why `ActivityCalendar` gets an empty row immediately** rather than on first
submission: it makes the calendar render on day one — 366 empty squares and
today marked. A brand-new member sees the shape of the thing they are about to
fill in, which is the *"I can do this"* step of the emotional journey.

**Role is never taken from the payload.** Always `Member`. Elevation happens
only through `admin.members.setRole`, Super Admin only.

---

## 2. Login and session creation

```
username + pin
   │
   ├─ rate limit                            → RATE_LIMITED
   ├─ Members: find by UsernameKey          → AUTH_FAILED (same as wrong PIN)
   ├─ LockedUntil in future?                → ACCOUNT_LOCKED
   ├─ Status = Inactive?                    → ACCOUNT_INACTIVE
   ├─ hash(pin + salt + pepper), constant-time compare
   │     └─ mismatch → FailedLoginCount++ ; at 5 → LockedUntil = +15 min
   │                   WRITE AuditLog        → AUTH_FAILED
   │
   ├─ reset FailedLoginCount, clear LockedUntil
   ├─ generate 256-bit token
   ├─ WRITE Sessions   SessionID = SHA-256(token)
   ├─ WRITE AuditLog   login
   └─ RETURN raw token + member + mustChangePin + redirect
```

`AUTH_FAILED` deliberately does not distinguish "no such username" from "wrong
PIN" — the distinction hands an attacker a list of valid usernames.

The token is stored **hashed**. A leaked spreadsheet yields no live sessions.

### Every subsequent request

```
token → SHA-256 → Sessions lookup (cached)
   ├─ missing / revoked / expired                       → SESSION_EXPIRED
   ├─ Members: load; Status = Inactive                  → SESSION_EXPIRED
   ├─ MustChangePin set and action isn't the change     → MUST_CHANGE_PIN
   ├─ RE-READ Role from Members  ← not from the session row
   ├─ resolve capabilities from role
   ├─ slide ExpiresAt forward, update LastSeenAt
   └─ attach { member, role, capabilities } to context
```

Re-reading the role is the step that matters. A Super Admin demoting a Community
Manager takes effect on that person's very next request, not whenever their
session happens to expire.

---

## 3. Post submission — the busiest write path

This is the transaction the whole product turns on. One member action, eight
sheets potentially touched, and everything the dashboard shows must be correct
in the response.

```
member submits { link }          platform is NEVER taken from the client
   │
   ├─ authenticate, authorise
   ├─ idempotency: requestId seen in the last 60s? → return the original result
   │
   ├─ VALIDATE
   │    URL parses                                → INVALID_URL
   │    host matches Members.PreferredPlatform    → PLATFORM_MISMATCH
   │      (registrable-domain suffix match, server-side only)
   │    LinkKey = normalise(url)
   │    LinkKey seen for this member in 30 days?  → DUPLICATE_LINK
   │    daily cap reached?                        → DAILY_CAP
   │
   ├─── ACQUIRE LOCK (per member) ───────────────────────────────────┐
   │                                                                 │
   │  1. APPEND Submissions                                          │
   │       SubmissionID, Timestamp, MemberID, Name, Username,        │
   │       Platform, ContentLink, LinkKey,                           │
   │       DayKey, WeekStart, WeekNumber, Month, Year,               │
   │       GoalAtSubmission = Members.WeeklyGoal, Status = Active    │
   │                                                                 │
   │  2. UPDATE ActivityCalendar                                     │
   │       index = dayOfYear(DayKey) - 1                             │
   │       DayMap[index] = min(DayMap[index] + 1, 9)                 │
   │       ActiveDays++ if the character was previously '0'          │
   │                                                                 │
   │  3. UPSERT WeeklyStats  for (MemberID, WeekStart)               │
   │       PostCount++                                               │
   │       DistinctDays = count of non-zero days in this week        │
   │       GoalMet = PostCount >= GoalAtWeek                         │
   │         └─ transitioned false → true?  it is a new Perfect Week │
   │                                                                 │
   │  4. UPDATE Members                                              │
   │       AllTimePosts++                                            │
   │       ActiveDays          from the calendar map                 │
   │       PerfectWeeks++      if step 3 transitioned                │
   │       CurrentWeekStreak / LongestWeekStreak  recomputed         │
   │       LastSubmissionDate                                        │
   │                                                                 │
   │  5. EVALUATE MILESTONES  (pure, over the updated snapshot)      │
   │       for each active catalog entry not already earned:         │
   │         evaluate(snapshot) → { unlocked, progress, target }     │
   │       APPEND MemberMilestones for each newly unlocked           │
   │       Members.MilestonesEarned += count                         │
   │       APPEND Notifications  type = MilestoneUnlocked            │
   │                                                                 │
   │  6. EVALUATE FLOW LEVEL                                         │
   │       highest level whose thresholds are met                    │
   │       changed?  UPDATE Members.FlowLevelID + FlowLevelAchievedAt│
   │                 APPEND Notifications  type = LevelUp            │
   │                                                                 │
   │  7. INVALIDATE CACHE   dashboard, leaderboard for this week     │
   └─────────────────────────────────────────────────────────────────┘
   │
   └─ RETURN { submission, stats, newMilestones[], levelUp? }
```

**Why the response carries the recomputed stats.** v1 waited on a 1300 ms
`setTimeout` and hoped the sheet had caught up. Returning the new numbers in the
same response is what makes "update the dashboard immediately" true rather than
probable — the ring, the calendar square, the counters, and any milestone modal
all render from one round trip.

**Why the lock is per member, not global.** Two different members submitting at
once do not conflict; the same member double-tapping does. A global lock would
serialise the whole community for no benefit.

**Why the platform is never accepted from the client.** Taking it from the
payload would let a member log an Instagram post against a LinkedIn account,
which defeats the validation entirely.

**Order matters.** The ledger is written first. If any later step fails, the
fact is recorded and the nightly reconcile repairs the rollups. The reverse
order would produce counters describing a post that does not exist.

---

## 4. Weekly goal completion

Not a separate process — a **transition detected inside step 3** above.

`GoalMet` moving from false to true in the current week is the moment. It:

- increments `Members.PerfectWeeks`
- may extend `CurrentWeekStreak`
- makes the Perfect Week and Five/Twelve Perfect Weeks milestones evaluable
- turns the progress ring green and swaps the message to
  *"You kept your promise to yourself this week."*

**Why detect a transition rather than test a condition:** testing `GoalMet`
would fire on every subsequent submission that week. The transition fires once.

---

## 5. Weekly rollover

A time-driven trigger, Monday 00:05 Africa/Lagos.

```
for the week that just closed:
  1. FREEZE   WeeklyStats.RankFinal  ← settled ranking by PostCount
  2. EVALUATE community milestones   Top 10, Weekly Champion
                                     (only knowable now — rank moved all week)
  3. RECOMPUTE  Members.CurrentWeekStreak for every member
                a member who did not meet their goal drops to 0
                LongestWeekStreak is never reduced
  4. APPEND   Notifications  type = WeeklyRecap
  5. WRITE    AuditLog  rollover summary
  6. INVALIDATE all leaderboard caches
```

**Why rank has to be frozen.** A milestone reading "you finished in the Top 10"
must be evaluated against a settled number. Evaluating live rank would award it
to anyone who passed through the top ten on a Tuesday.

**Why the current week never breaks a streak.** A member on Monday morning has
zero posts. Testing them live would reset every streak in the community at
midnight every Sunday. The streak only breaks when a week *closes* unmet — which
is why this runs after the boundary, not on it.

**The rollover does not zero anything.** "Weekly post count resets" is a display
statement, not a data one: a new week means a new `WeeklyStats` row, and last
week's stays exactly as it was. Nothing is destroyed, so nothing has to be
recovered when a number looks wrong.

---

## 6. Milestone unlocking

Evaluation happens at three moments, and only three:

| Trigger | Milestones it can settle |
|---|---|
| **On submission** (step 5 above) | First Step, posting counts, active-day milestones, Perfect Week |
| **Weekly rollover** | Top 10, Weekly Champion — rank-dependent |
| **On registration** | Founding Member |

```
snapshot = { allTimePosts, activeDays, perfectWeeks,
             currentWeekStreak, distinctDaysThisWeek,
             joinDate, rankFinal, ... }

for each catalog entry where Active and not Hidden-and-unearned:
    already in MemberMilestones?  → skip
    evaluate(snapshot)            → { unlocked, progress, target }
    unlocked?  → APPEND MemberMilestones { UnlockedAt, UnlockContext, Seen=false }
```

Evaluators are **pure functions over the snapshot**, which is what makes them
unit-testable without a spreadsheet.

### Delivering the celebration

`Seen = false` is the queue. The dashboard asks for unseen unlocks, shows the
modal for each in turn, then marks them seen.

**Why a flag rather than showing it in the submit response alone:** a member can
log a post and close the tab before the modal renders. Without the flag the
celebration is lost. With it, the moment waits for them. It also handles several
milestones unlocking together — they queue rather than collide.

**A milestone once earned is never revoked**, even if its definition later
changes. Taking away something someone earned is the opposite of what this
system is for.

---

## 7. Flow Level progression

Evaluated in the same transaction as milestones, but differently: a member holds
**exactly one** level, and it only moves up.

```
level = highest FlowLevels row where
          AllTimePosts   >= RequiredPosts
      AND PerfectWeeks   >= RequiredPerfectWeeks
      AND Criteria satisfied (if present)

changed?  UPDATE Members.FlowLevelID, FlowLevelAchievedAt
          APPEND Notifications  type = LevelUp
```

**Why the level is stored rather than derived on read.** Rank is derived because
nobody celebrates a rank change. A level-up is a moment — it needs to be
*detected*, and detection means comparing what was stored against what was just
computed.

**Why levels never fall.** They describe identity, not current form. Someone who
reached Builder and then had a quiet month is still a Builder. Demoting them
would punish exactly the member the product is trying to bring back.

---

## 8. Activity calendar updates

The lightest write in the system, by design.

```
index = dayOfYear(DayKey) - 1          0-based, 366 always
current = DayMap[index]
DayMap[index] = min(current + 1, 9)
if current === '0'  → ActiveDays++, and this is a NEW active day
```

One character in one cell. No row lookup, no append, no growth.

**Reading it** is one cell for a whole year. The dashboard requests a window
(default 26 weeks, from `Settings`) and the server slices the string.

**Rebuilt nightly** from `Submissions` grouped by `DayKey`. Drift is
self-correcting, which is what makes a denormalisation this aggressive safe.

### What the design already supports, unbuilt

- **Multiple submissions per day** — the digit is the count today
- **Colour intensity** — a rendering change over digits that already exist
- **Monthly view** — slice the same string
- **Yearly history** — one row per year, already the primary key
- **Export** — the string is the report
- **Analytics overlays** — the map is a plain array once split

None of these need a schema change. That was the point of §4 in
[`database.md`](database.md).

---

## 9. Leaderboard updates

There is no leaderboard write path. Standings are **derived on read** from
`WeeklyStats` and cached for 60 seconds.

```
read WeeklyStats where WeekStart = current   (~60 rows)
filter to Members.Status = Active
sort by PostCount desc
assign competition ranking — ties share a rank
members with PostCount = 0 are UNRANKED, not ranked last
join Members for FullName and FlowLevelID
```

**Why unranked rather than last:** a member with no posts this week sees
*"Post this week to join the leaderboard."* Ranking them 47th of 47 is the
"leaderboard-first" failure the product vision explicitly rules out.

**Why derived rather than stored:** a stored leaderboard is a second copy of a
fact `WeeklyStats` already holds, free to drift. The only thing worth freezing
is the final rank, and that is one column written once at rollover.

---

## 10. Analytics generation

Nightly, 01:00 Africa/Lagos.

```
1. RECONCILE   rebuild every derived value from Submissions
                 Members counters · ActivityCalendar maps · WeeklyStats
               discrepancies → AuditLog (repaired, not hidden)
2. AGGREGATE   append yesterday's CommunityStats row
3. SWEEP       delete expired Sessions
4. EXPIRE      InviteCodes past ExpiresAt → Status = Expired
```

**The reconcile is what licenses the whole materialised design.** Nine derived
columns on `Members`, a packed calendar, and a weekly rollup are all safe to
keep precisely because they are rebuilt from the ledger every night. Without
this job they would be a second source of truth, and the first time one drifted
the system would have no way to know which was right.

---

## 11. Data flow, end to end

```
INVITE CODE  ──issued by admin──▶  InviteCodes

REGISTRATION ──redeems code────▶  Members + ActivityCalendar + Sessions
                                          │
LOGIN ────────────────────────▶  Sessions │
                                          ▼
SUBMISSION ───────────────────▶  Submissions ◀── the only source of fact
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        ▼                            ▼                            ▼
  ActivityCalendar             WeeklyStats                 Members counters
   (the calendar)          (leaderboard, streaks)          (dashboard stats)
        │                            │                            │
        └────────────┬───────────────┴────────────┬───────────────┘
                     ▼                            ▼
             MemberMilestones                FlowLevelID
              (celebration)                   (identity)
                     │                            │
                     └──────────┬─────────────────┘
                                ▼
                         Notifications
                     (outbox — delivery is future)

                CommunityStats ◀── nightly ── Submissions
                  (admin analytics)
```

Every arrow points away from `Submissions`. Nothing downstream is authoritative,
and everything downstream can be rebuilt — which is the single property that
makes this schema safe to denormalise as heavily as it does.
