# Backend Architecture

**Phase 3.** Design only — no implementation.

Covers project structure, authentication lifecycle, business-logic ownership,
the service and repository layers, background jobs, and error handling.
Endpoints are in [`api.md`](api.md); security is in
[`security-architecture.md`](security-architecture.md); the critical review is
in [`backend-review.md`](backend-review.md).

---

## 1. What the platform forces

Every structural decision below traces to one of these.

| Constraint | Consequence |
|---|---|
| Two entry points only — `doGet`, `doPost` | No routing. The action name in the body does that job |
| No module system; all files share one global scope | Naming discipline replaces imports. Load order is alphabetical by path |
| 6-minute execution ceiling | Long jobs must be resumable, not merely fast |
| ~30 s soft limit on a web request | The submission path has a latency budget |
| No transactions | `LockService` around every write touching derived state |
| Deployment must be `ANYONE_ANONYMOUS` | **There is no network boundary.** Authorisation is entirely application code |
| No client IP available | Rate limiting is per account and per session, never per attacker |

The last two are the ones that shape the security design most. See
[`security-architecture.md`](security-architecture.md) §1.

---

## 2. Project structure

```
appsscript/
├── appsscript.json              Manifest — Africa/Lagos, V8, scopes
├── 00_Config.gs                 Sheet names, column maps, enums, defaults
├── 01_Router.gs                 doPost entry · action table · dispatch
├── 02_Envelope.gs               Request parsing · response shaping · logging
│
├── middleware/                  Applied to every request, in fixed order
│   ├── Validate.gs                Payload shape and type coercion
│   ├── RateLimit.gs               Per-account and per-session ceilings
│   ├── Authenticate.gs            Token → session → member
│   ├── PinGate.gs                 MustChangePin lockout
│   └── Authorize.gs               Capability check against a fresh role
│
├── orchestrators/               Multi-service workflows. The coordination layer
│   ├── RegistrationFlow.gs        invite → member → calendar → session
│   ├── SubmissionFlow.gs          the submission pipeline (§4.1)
│   ├── WeekCloseFlow.gs           freeze ranks → milestones → streaks → recaps
│   └── Pipeline.gs                the step runner: ordering, timing, rollback markers
│
├── controllers/                 Request → orchestrator or service → response shape
│   ├── AuthController.gs
│   ├── MemberController.gs
│   ├── ProfileController.gs
│   ├── SubmissionController.gs
│   ├── LeaderboardController.gs
│   ├── MilestoneController.gs
│   └── admin/
│       ├── AdminMemberController.gs
│       ├── AdminInviteController.gs
│       ├── AdminSubmissionController.gs
│       ├── AdminSettingsController.gs
│       └── AdminAnalyticsController.gs
│
├── services/                    Business rules. The layer that knows *why*
│   ├── AuthService.gs
│   ├── SessionService.gs
│   ├── MemberService.gs
│   ├── ProfileService.gs
│   ├── InviteService.gs
│   ├── SubmissionService.gs
│   ├── CalendarService.gs
│   ├── WeeklyStatsService.gs
│   ├── LeaderboardService.gs
│   ├── MilestoneService.gs
│   ├── FlowLevelService.gs
│   ├── NotificationService.gs
│   ├── SettingsService.gs
│   ├── MetricRegistry.gs
│   ├── AnalyticsService.gs
│   └── AuditService.gs
│
├── repositories/                The ONLY code that touches a sheet
│   ├── MemberRepo.gs            ProfileRepo.gs        SubmissionRepo.gs
│   ├── CalendarRepo.gs          WeeklyStatsRepo.gs    InviteRepo.gs
│   ├── SessionRepo.gs           MilestoneCatalogRepo.gs
│   ├── MemberMilestoneRepo.gs   FlowLevelRepo.gs      SettingsRepo.gs
│   ├── AuditRepo.gs             NotificationRepo.gs   CommunityStatsRepo.gs
│
├── infra/                       Platform wrappers. No business meaning
│   ├── SheetClient.gs             Batched reads/writes, sanitisation
│   ├── CacheClient.gs             Namespaced CacheService, invalidation
│   ├── LockClient.gs              Scoped locks with timeout and telemetry
│   ├── Crypto.gs                  HMAC, salts, tokens, constant-time compare
│   ├── DateTime.gs                Africa/Lagos boundaries
│   ├── Ids.gs                     FT-0001, SB-000123, invite codes
│   ├── Errors.gs                  AppError, the code taxonomy
│   └── Logger.gs                  Structured logging, timing
│
├── lib/                         PURE. No Apps Script APIs. Node-testable
│   ├── week.js        streak.js        ranking.js       daymap.js
│   ├── linkrules.js   linknormalize.js username.js      pinrules.js
│   ├── milestones.js  levels.js
│
├── jobs/                        Time-driven triggers
│   ├── WeeklyRollover.gs        NightlyReconcile.gs
│   ├── RollupRepair.gs          SessionSweep.gs        InviteExpiry.gs
│
└── setup/                       Run once, by hand, from the editor
    ├── Bootstrap.gs             SeedCatalog.gs
    ├── SeedSuperAdmin.gs        InstallTriggers.gs
```

### 2.1 Why `lib/` files are `.js`

clasp pushes `.js` as `.gs`, so these files run in Apps Script unchanged **and**
can be required by Node's test runner. Each ends with:

```js
if (typeof module !== 'undefined') module.exports = { … };
```

Apps Script has no `module`, so the `typeof` guard makes the line inert there.
This is what lets the streak, milestone, and level logic be unit-tested before
it ever meets a spreadsheet — the thing v1 never had.

### 2.2 Dependency direction

```
Router → Middleware → Controller → Orchestrator → Service → Repository → Sheets
                                        ↓            ↓
                                      lib/  (pure, depends on nothing)
```

Rules, enforced by review:

- A controller never touches a repository. It calls **one** orchestrator or
  **one** service.
- **A service never calls another service.** Multi-service work belongs to an
  orchestrator.
- A service never touches a sheet. It calls repositories.
- A repository never calls a service. It maps rows to objects and back.
- `lib/` imports nothing and is imported by everything.
- Only `infra/` names a Google API.

### 2.2.1 Why services do not call each other — approved refinement

The original design had `SubmissionService` naming `CalendarService`,
`WeeklyStatsService`, `MilestoneService`, and four others directly. That works
in a shared global scope, and it has two costs that compound:

**Nothing above `lib/` could be tested alone.** Testing `SubmissionService`
would require a live spreadsheet, because there was no seam at which to
substitute a fake. The orchestration — the part most likely to contain ordering
bugs — would be verifiable only by running the real thing, which is close to how
v1 was built.

**The coupling grows with every feature.** Each new celebration behaviour adds
another service reference to an already-crowded method.

**The fix, in two parts.**

*Services take their dependencies.* Each is produced by a factory:

```
function createSubmissionService(deps) { … }
```

Wiring happens once, in `setup/Container.gs`. Production behaviour is unchanged;
tests pass fakes. No framework, no container library — one block of assignments.

*Orchestrators own the workflow.* A service knows one subject deeply and answers
questions about it. An orchestrator knows the **order in which subjects must be
touched** for a business event to be complete. Those are different kinds of
knowledge and they change for different reasons, so they live in different
files.

`Pipeline.gs` runs an orchestrator's steps in order, times each one, and marks a
`ROLLUP_PENDING` on failure. That gives, for free: declarative ordering, per-step
timing against the latency budget, individually testable steps, and a future
step being an entry in a list rather than an edit to a sixty-line method.

### 2.2.2 `MemberService` split into three

`MemberService` had accumulated registration, self-service updates, admin
mutations, and the system invariants — three concerns under one name.

| Service | Owns |
|---|---|
| `MemberService` | Reads, self-service updates, counter application |
| `MemberAdminService` | Admin mutations **and the invariants** (no self-escalation, last Super Admin, refuse deletion with history) |
| *(registration)* | Moved to `RegistrationFlow` — it is a workflow, not a service |

The invariants stay together, which was the original reason for keeping the
service whole. Registration was never a service in the first place: it is a
sequence across four subjects, which is the definition of an orchestrator.

**Why the repository boundary is worth the ceremony:** it is the store-swap
seam. If Sheets is ever outgrown, `repositories/` is rewritten and services,
controllers, middleware, and routing are untouched. That is what makes
committing to Sheets now a reversible decision.

### 2.3 Load order and the one rule that breaks projects

Apps Script concatenates every file into one global scope, alphabetically by
path. There is no import graph and no lazy loading.

**Nothing may run at the top level of a file except declarations.** A file that
calls `SettingsService.get()` at load time will fail unpredictably depending on
where it sorts. Numeric prefixes on the three root files (`00_`, `01_`, `02_`)
make the order that does matter explicit; everything else runs inside functions.

Naming avoids collisions in the shared scope: services are objects
(`MemberService.findByUsername`), private helpers carry a trailing underscore
(`dispatch_`).

---

## 3. Authentication architecture

Full flows in [`auth-and-rbac.md`](auth-and-rbac.md); this is the backend view.

### 3.1 The credential lifecycle

```
REGISTRATION
  pin ──▶ PinPolicy.validate       6 digits, not a repeat/sequence/common
      ──▶ Crypto.generateSalt()    16 random bytes
      ──▶ Crypto.hashPin(pin, salt, pepper)
              HMAC-SHA256, iterated N times (Settings: auth.hashIterations)
      ──▶ MemberRepo.insert        PinHash + PinSalt
      pin is never logged, never returned, never stored

LOGIN
  pin ──▶ MemberRepo.findByUsernameKey
      ──▶ Crypto.hashPin(pin, member.PinSalt, pepper)
      ──▶ Crypto.timingSafeEqual(computed, member.PinHash)
```

**The pepper** lives in `PropertiesService`, never in a sheet. It is what makes
a leaked spreadsheet useless: without it the hashes cannot be attacked offline.
The salt stops identical PINs producing identical hashes; the iteration count
slows bulk cracking. Apps Script offers no bcrypt or Argon2, so iterated
HMAC-SHA256 is the strongest construction available.

**`timingSafeEqual`** compares the full length regardless of where the first
difference appears. A short-circuiting `===` leaks how many leading characters
were right, which over enough attempts narrows a 6-digit space considerably.

### 3.2 Session lifecycle

```
CREATE     Crypto.randomToken(32 bytes) → raw token, returned once
           SessionRepo.insert(SHA-256(token), memberId, role, expiries)
           the raw token is never stored

VALIDATE   token → SHA-256 → CacheClient → SessionRepo
             missing | RevokedAt set | past ExpiresAt   → SESSION_EXPIRED
             LastSeenAt older than idleDays             → SESSION_EXPIRED
           MemberRepo.findById
             Status = Inactive                          → SESSION_EXPIRED
             MustChangePin and action ≠ the change      → MUST_CHANGE_PIN
           ROLE IS RE-READ FROM Members, never from the session row
           slide ExpiresAt, update LastSeenAt (throttled to once per 5 min)

REVOKE     logout · PIN change · admin PIN reset · suspension
           · role change · member deletion
```

**Why a session table rather than a self-contained signed token.** A signed
token needs no storage — and cannot be revoked. Suspending a member, resetting
a PIN, and demoting a Community Manager must all terminate existing sessions
immediately. With a stateless token a suspended member keeps full access until
expiry. The usual workaround is a revocation denylist, which is a session table
with extra steps.

**Why the role is re-read every request.** A demotion takes effect on that
person's very next request rather than whenever their session happens to lapse.
`Sessions.Role` exists purely as a diagnostic snapshot and is never an
authorisation input.

**Why `LastSeenAt` updates are throttled.** Writing it on every request means a
sheet write on every request. Once per five minutes preserves idle detection at
a fraction of the cost.

### 3.3 Invite validation

Ownership: `InviteService`. Validation and redemption happen **inside the
registration lock**, together with the username uniqueness check.

```
lookup(code)          normalise: uppercase, strip spaces and dashes
  not found        → INVITE_INVALID
  Status ≠ Unused  → INVITE_USED
  now > ExpiresAt  → INVITE_EXPIRED   (and mark Expired)
redeem(code, memberId)
  Status = Used, UsedBy, UsedAt        atomic with the member insert
```

Two check-then-act races live here — the same code redeemed twice, the same
username claimed twice — and Sheets has no unique constraints. One lock covers
both, and a failed registration never burns a valid code.

### 3.4 Role validation

Capabilities, never role comparisons. `Authorize.gs` resolves the freshly-read
role to a capability set and checks membership. Code asks *"does this session
hold `member:delete`?"*, never *"is this role `SuperAdmin`?"*

A fourth role becomes one row in the capability table and zero changes
elsewhere. Scattered `if (role === 'SuperAdmin')` checks are where privilege
bugs live.

---

## 4. Business logic ownership

One owner per responsibility. Where two services both plausibly own something,
the tie is broken by *which one would have to change if the rule changed*.

| Responsibility | Owner | Notes |
|---|---|---|
| Registration | `MemberService` | Orchestrates `InviteService`, `AuthService`, `CalendarService` |
| PIN hashing and verification | `AuthService` | Only service that touches `Crypto` for PINs |
| Sessions | `SessionService` | |
| Invite lifecycle | `InviteService` | Generate, validate, redeem, revoke, expire |
| Link validation | `LinkValidator` (in `SubmissionService`) | Registrable-domain match. **Server-only** |
| Duplicate detection | `SubmissionService` | Via `SubmissionRepo.findRecentLinkKeys` |
| **The submission transaction** | `SubmissionService` | The orchestrator — see §4.1 |
| Day map read/write | `CalendarService` | Owns pack/unpack; delegates maths to `lib/daymap.js` |
| Weekly counts, goal-met, distinct days | `WeeklyStatsService` | |
| Week streaks | `WeeklyStatsService` | Uses `lib/streak.js` |
| Ranking | `LeaderboardService` | Derived on read, cached. `RankFinal` frozen at rollover |
| Milestone evaluation | `MilestoneService` | Evaluators in `lib/milestones.js` |
| Level evaluation | `FlowLevelService` | Thresholds from `FlowLevelRepo` |
| Notifications | `NotificationService` | Writes the outbox. Nothing delivers in v2 |
| Settings | `SettingsService` | Typed accessors, cached |
| Community metrics | `MetricRegistry` | Enabled entries only |
| Admin mutations | `MemberService` + `AuditService` | Invariants live in `MemberService` |
| Audit | `AuditService` | Called by services, never by controllers |

### 4.1 The submission transaction

The busiest path in the system, and the one with the most owners. Orchestrated
by `SubmissionService.create`:

```
VALIDATE (outside the lock — cheap, and most failures happen here)
  LinkValidator.check(link, member.PreferredPlatform)   → PLATFORM_MISMATCH
  linknormalize(link) → linkKey
  SubmissionRepo.hasRecentLinkKey(memberId, linkKey, 30d) → DUPLICATE_LINK
  SubmissionRepo.countForDay(memberId, dayKey)            → DAILY_CAP

LOCK (per member)
  1  SubmissionRepo.append                     the ledger, first
  2  CalendarService.recordDay                 one character
  3  WeeklyStatsService.recordPost             count, distinct days, goalMet
  4  MemberService.applySubmissionCounters     batched single write
  5  MilestoneService.evaluate(snapshot)       appends any unlocks
  6  FlowLevelService.evaluate(snapshot)       updates level if changed
  7  NotificationService.enqueue               for each unlock / level-up
  8  CacheClient.invalidate                    dashboard, leaderboard
UNLOCK

RETURN { submission, stats, newMilestones[], levelUp? }
```

**Ledger first.** If any later step fails the fact is recorded and the repair
job fixes the rollups. The reverse order would produce counters describing a
post that does not exist.

**Validation outside the lock.** A rejected duplicate should not wait on, or
hold, a lock. Most failures are validation failures.

**Steps 2–4 batch into as few `setValues` calls as their ranges allow.** Four
separate single-cell writes are four round trips at 100–300 ms each; that is
the difference between a 1-second and a 3-second response.

**The response carries recomputed stats**, which is what makes "update the
dashboard immediately" true rather than probable. v1 waited on a 1300 ms
`setTimeout` and hoped.

---

## 5. Service layer

Every service is a plain object of functions. No classes, no `this`, no
instantiation — Apps Script's shared global scope makes singletons the natural
shape, and `this` binding in a concatenated scope is a source of subtle bugs.

| Service | Responsibility | Key inputs → outputs | Depends on |
|---|---|---|---|
| **AuthService** | PIN hashing, verification, policy | `(pin, salt)` → hash · `(pin, member)` → bool | Crypto, SettingsService, `lib/pinrules` |
| **SessionService** | Create, validate, slide, revoke | `(memberId)` → token · `(token)` → context | SessionRepo, MemberRepo, Crypto, CacheClient |
| **MemberService** | Registration, profile-adjacent updates, admin mutations, invariants | `(registration)` → member · `(id, patch)` → member | MemberRepo, AuthService, InviteService, CalendarService, AuditService, `lib/username` |
| **ProfileService** | Stage 2 data | `(memberId)` → profile · `(memberId, patch)` → profile | ProfileRepo, MemberRepo |
| **InviteService** | Generate, validate, redeem, revoke, expire | `(count, opts)` → codes · `(code)` → validity | InviteRepo, Ids, SettingsService, AuditService |
| **SubmissionService** | The submission transaction; validation and dedupe | `(member, link)` → submission + stats | Everything in §4.1 |
| **CalendarService** | Day map read/write, range slicing | `(memberId, from, to)` → counts · `(memberId, day)` → void | CalendarRepo, `lib/daymap`, DateTime |
| **WeeklyStatsService** | Weekly counts, goal-met transitions, week streaks | `(memberId, weekStart)` → stats · `(memberId)` → streaks | WeeklyStatsRepo, `lib/week`, `lib/streak` |
| **LeaderboardService** | Ranked standings; freeze `RankFinal` | `(scope, sortBy, page)` → entries | WeeklyStatsRepo, MemberRepo, `lib/ranking`, CacheClient |
| **MilestoneService** | Evaluate, record, serve unseen unlocks | `(snapshot)` → unlocked[] · `(memberId)` → progress | MilestoneCatalogRepo, MemberMilestoneRepo, `lib/milestones` |
| **FlowLevelService** | Determine level, detect change | `(snapshot)` → levelId + changed | FlowLevelRepo, `lib/levels` |
| **NotificationService** | Enqueue events | `(memberId, type, payload)` → void | NotificationRepo |
| **SettingsService** | Typed, cached, defaulted config | `(key)` → typed value | SettingsRepo, CacheClient |
| **MetricRegistry** | Enabled community metrics | `()` → metric[] | Several repos, SettingsService |
| **AnalyticsService** | Chart series from rollups | `(range)` → series | CommunityStatsRepo |
| **AuditService** | Append audit rows | `(actor, action, target, result)` → void | AuditRepo |

**On `MemberService` being the largest.** It owns registration, admin
mutations, and the system invariants (no self-escalation, never remove the last
Super Admin, refuse deletion with history). Those invariants are all about *a
member's relationship to other members*, so they belong together — splitting
them across services would mean an invariant enforced in two places, which is
an invariant enforced in neither.

**Snapshot objects.** `MilestoneService` and `FlowLevelService` both take a
plain snapshot — `{ allTimePosts, activeDays, perfectWeeks, currentWeekStreak,
distinctDaysThisWeek, joinDate, rankFinal }` — rather than a member row. That
keeps the evaluators pure, testable, and indifferent to schema changes.

---

## 6. Repository layer

One repository per sheet. **The only code that touches a spreadsheet.**

Every repository exposes the same shape: `findX` returning domain objects or
`null`, `insert`/`update` taking domain objects, and nothing that leaks a row
index or a column letter upward. Column positions live in `00_Config.gs` and
are used only here.

| Repository | Sheet | Operations | Integrity |
|---|---|---|---|
| **MemberRepo** | Members | `findById` `findByUsernameKey` `usernameKeyExists` `insert` `update` `updateCounters` `list(filters,page)` `countActiveSuperAdmins` | Uniqueness checked under lock; `countActiveSuperAdmins` backs the last-admin invariant |
| **ProfileRepo** | Profiles | `findByMemberId` `upsert` | Row created on first save; absence is valid |
| **SubmissionRepo** | Submissions | `append` `findByMember(page)` `hasRecentLinkKey` `countForDay` `findByWeek` `void` `streamAll` | **Append-only.** `void` flips Status; never deletes. `streamAll` is paged for the reconcile |
| **CalendarRepo** | ActivityCalendar | `findByMemberYear` `upsert` `setDay` `sumActiveDays(memberId)` | `setDay` writes one character; map length asserted at 366 |
| **WeeklyStatsRepo** | WeeklyStats | `find(memberId,weekStart)` `upsert` `findWeek(weekStart)` `findMemberWeeks` `freezeRanks(weekStart)` | Composite key enforced in `upsert` |
| **InviteRepo** | InviteCodes | `findByCode` `insertMany` `markUsed` `markRevoked` `markExpiredBefore` `list(filters)` | `markUsed` refuses a row not `Unused` — the last line of defence under the lock |
| **SessionRepo** | Sessions | `findByHash` `insert` `touch` `revoke` `revokeAllForMember` `deleteExpired` | Stores hashes only |
| **MilestoneCatalogRepo** | MilestoneCatalog | `listActive` `findById` | Cached; effectively static |
| **MemberMilestoneRepo** | MemberMilestones | `findByMember` `hasMilestone` `append` `markSeen` | `hasMilestone` re-checked immediately before append, inside the lock |
| **FlowLevelRepo** | FlowLevels | `listOrdered` `findById` | Cached |
| **SettingsRepo** | Settings | `getAll` `get` `set` | Typed coercion; falls back to `DEFAULTS` |
| **AuditRepo** | AuditLog | `append` `list(filters,page)` | Append-only |
| **NotificationRepo** | Notifications | `append` `findPending` `markSent` | Append-only until a delivery worker exists |
| **CommunityStatsRepo** | CommunityStats | `upsertForDate` `findRange` | One row per date |

### 6.1 Integrity without foreign keys

1. **Resolve before write.** A submission cannot be appended for a `MemberID`
   that was not just loaded. Repositories never accept an unresolved id.
2. **Refuse, do not cascade.** Deletion is blocked while a member has
   submissions; deactivation is offered instead. Deleting someone with history
   orphans ledger rows and silently rewrites everyone else's historical
   standings.
3. **Reconcile nightly.** Every derived value is rebuilt from the ledger.
   Orphans are reported to `AuditLog`, not deleted silently.

### 6.2 `SheetClient`

Every repository goes through it, so four behaviours are guaranteed rather than
remembered:

- **Batched access.** `getValues`/`setValues` on ranges, never cell-by-cell.
- **Formula-injection sanitising.** Any string that could contain member input
  is escaped at the write boundary — a value beginning `=`, `+`, `-`, or `@`
  becomes inert when the sheet is opened.
- **Header verification.** On first access per execution, headers are checked
  against `00_Config.gs`. A column inserted by hand fails loudly instead of
  silently writing into the wrong field.
- **Timing.** Every call is timed and logged, which is what makes the latency
  budget in [`backend-review.md`](backend-review.md) measurable.

---

## 7. Background jobs

All time-driven, all installed by `setup/InstallTriggers.gs` so the schedule is
version-controlled rather than clicked into the UI.

| Job | When | Purpose | Failure recovery |
|---|---|---|---|
| **WeeklyRollover** | Mon 00:05 | Freeze `RankFinal`; evaluate Top 10 and Weekly Champion; recompute week streaks; enqueue recaps | Idempotent by `weekStart`. Re-running produces the same result. Guarded so a missed week is processed on the next run |
| **NightlyReconcile** | 01:00 | Rebuild every derived value from the ledger; report discrepancies | **Cursor-based.** Stores progress in `Settings`; at 4 minutes it saves and schedules a continuation |
| **RollupRepair** | Every 15 min | Repair members marked `ROLLUP_PENDING` | Marker stays until repair succeeds. Retries indefinitely |
| **SessionSweep** | 02:00 | Delete expired and revoked sessions | Stateless. A missed run costs a few extra rows |
| **InviteExpiry** | 02:15 | Mark codes past `ExpiresAt` as `Expired` | Stateless. Expiry is also checked at redemption, so this is cosmetic |

**Why the reconcile is resumable from the start rather than when it breaks.**
Apps Script terminates at 6 minutes with no warning. A truncated reconcile
leaves some members repaired and others not, **with no signal that it
happened** — the failure is invisible, which is the worst kind. The cursor and
the completion row in `AuditLog` make a partial run detectable.

**Why `RollupRepair` exists at all.** The nightly reconcile makes
denormalisation safe *eventually*. The gap is the 24 hours in between: if the
ledger append succeeds but the counter update fails, a member sees a post that
did not count — precisely the v1 failure this rebuild exists to eliminate,
arriving by another route. A 15-minute repair loop turns that into minutes.

**Why the rollover runs after the boundary, not on it.** A member on Monday
morning has zero posts. Evaluating streaks at midnight would reset every streak
in the community every week. The streak breaks when a week *closes* unmet.

---

## 8. Error handling

### 8.1 Four classes of failure

| Class | Example | Member sees | Logged |
|---|---|---|---|
| **Validation** | PIN too short, bad URL | The specific message, field highlighted | No |
| **Business rule** | Duplicate link, invite used, forbidden | The specific message | Yes, if security-relevant |
| **Platform** | Sheets timeout, lock contention, quota | "Something went wrong on our end. Try again." | Yes, with full detail |
| **Bug** | Unexpected exception | Same generic message | Yes, with stack |

**The member never sees an internal detail.** No stack traces, no sheet names,
no row numbers. Every generic failure returns the identical message, so nothing
about internal structure can be inferred by probing.

### 8.2 The `AppError` contract

Services throw `AppError(code, message, { field })`. The router catches, maps to
the envelope, and returns `ok: false`. Anything that is *not* an `AppError`
reaching the router is a bug: it is logged with its stack and returned as
`SERVER_ERROR`.

That distinction is the whole strategy. An expected failure is a typed value; an
unexpected one is loud in the log and silent to the member.

### 8.3 Platform failures specifically

| Failure | Handling |
|---|---|
| `LockService` timeout | Retry once after a short backoff, then `SERVER_ERROR`. Never proceed without the lock |
| Sheets read timeout | One retry. Reads are idempotent |
| Sheets write timeout | **No blind retry.** Re-read to determine whether the write landed, then decide. A retried append duplicates a submission |
| Quota exhausted | `SERVER_ERROR` plus a `CRITICAL` audit row. Nothing a member can do |
| Cache unavailable | Fall through to the sheet. Cache is an optimisation, never a source of truth |
| Malformed sheet (header mismatch) | Fail loudly at `SheetClient`, log `CRITICAL`. Continuing would write into the wrong columns |

The write-timeout rule is the important one. A timeout is ambiguous — the write
may have succeeded. `requestId` idempotency covers a client retry; a *server*
retry has no such protection, so it re-reads instead of guessing.

### 8.4 Partial failure in the submission path

The ledger is written first, so a later failure means the fact exists and the
rollups lag.

```
append succeeded, step 2–7 threw
  → AuditRepo.append({ Action: 'ROLLUP_PENDING', TargetMemberID })
  → return the submission as SUCCESSFUL — it was
  → include statsSettling: true
  → the dashboard keeps showing the previous numbers
```

**Showing slightly stale numbers beats showing wrong ones**, and beats telling a
member their post failed when it did not. `RollupRepair` closes the gap within
fifteen minutes.

### 8.5 Recovery hierarchy

1. **Self-healing** — nightly reconcile rebuilds everything from the ledger
2. **Targeted repair** — `RollupRepair` on explicit markers, every 15 minutes
3. **Manual** — a Super Admin can trigger a reconcile for one member
4. **Rebuild** — the ledger alone can reconstruct every other sheet

Level 4 is the design's insurance policy: `Submissions` plus `Members` identity
is sufficient to regenerate the calendar, weekly stats, counters, milestones,
and levels from nothing.
