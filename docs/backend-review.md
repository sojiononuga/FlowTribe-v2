# Backend Architecture Review

**Phase 3 · Deliverable 10.** A critical review of the design in
[`backend-architecture.md`](backend-architecture.md), conducted adversarially
against my own work.

The Phase 2 review covered the data layer; this covers the code layer.

---

## Summary

The layering is sound and the security posture is appropriate for the threat
model. Three findings would change my implementation plan, and one is a design
weakness I would fix now rather than discover in Phase 5.

| # | Finding | Severity | Act by |
|---|---|---|---|
| W1 | `SubmissionService` orchestrates seven collaborators in one method | **High** | Phase 5 design |
| W2 | No dependency injection means services are untestable in isolation | **High** | Phase 5 design |
| P1 | The submission path has no measured latency budget | **High** | Phase 5, first week |
| S1 | Lockout is a denial-of-service vector against individual members | Medium | Phase 5 |
| W3 | `MemberService` is becoming a god object | Medium | Phase 5 |
| P2 | `member.dashboard` reads six sheets on a cache miss | Medium | Phase 6 |
| C1 | Cache invalidation is manual and easy to forget | Medium | Phase 5 |
| S2 | `requestId` idempotency is client-supplied and unverified | Medium | Phase 5 |
| M1 | 40+ files in one global scope with no import graph | Medium | Ongoing |
| P3 | `LockService` contention is unmeasured | Low | Phase 6 |
| S3 | No account recovery path exists | Low | Decide before launch |

---

## Weaknesses

### W1 · The submission transaction is doing too much in one place — **High**

`SubmissionService.create` orchestrates `LinkValidator`, `SubmissionRepo`,
`CalendarService`, `WeeklyStatsService`, `MemberService`, `MilestoneService`,
`FlowLevelService`, `NotificationService`, and `CacheClient` — inside a lock,
with ordering constraints between most of them.

It is the correct *behaviour*. It is a lot of coupling in one method, and it is
the method most likely to grow: every future celebration feature adds a step
here.

**Recommendation: an explicit pipeline.**

```
SubmissionService.create = pipeline([
  validateLink, checkDuplicate, checkDailyCap,     // outside the lock
  withLock([
    appendLedger,
    updateCalendar,
    updateWeeklyStats,
    updateMemberCounters,
    evaluateMilestones,
    evaluateFlowLevel,
    enqueueNotifications,
    invalidateCaches,
  ]),
])
```

Each step takes a context object and returns an augmented one. Steps become
individually testable, the order is declarative rather than implied by
statement sequence, and adding a future step is appending to a list rather than
editing a 60-line method. It also makes W2's timing instrumentation trivial —
wrap the step runner once.

### W2 · Services reference each other directly, so nothing can be tested alone — **High**

As designed, `SubmissionService` names `CalendarService` directly. In a shared
global scope that works — and it means testing `SubmissionService` requires a
live spreadsheet, because there is no seam to substitute a fake.

`lib/` is pure and testable. Everything above it currently is not. That leaves
the orchestration — the part most likely to have ordering bugs — verifiable only
by running the real thing, which is uncomfortably close to how v1 was built.

**Recommendation: a minimal service locator.** Each service is created by a
factory taking its dependencies:

```
function createSubmissionService(deps) { … }        // deps injected
var SubmissionService = createSubmissionService({   // wired once, at the bottom
  submissionRepo: SubmissionRepo, calendar: CalendarService, …
});
```

No framework, no container library — one wiring block in a `Bootstrap` file.
Production code is unchanged in behaviour; tests pass fakes. This is the single
change that most improves the codebase's long-term testability, and it is
essentially free if done before Phase 5 rather than after.

### W3 · `MemberService` is accumulating unrelated responsibilities — Medium

It currently owns registration, name updates, consent, admin mutations, counter
updates, and the system invariants. Those are three different concerns wearing
one name.

**Recommendation: split into three**, sharing `MemberRepo`:

- `RegistrationService` — the invite-gated creation flow
- `MemberService` — reads, self-service updates, counter application
- `MemberAdminService` — admin mutations **and the invariants**

The invariants stay together in one service, which was the original reason for
keeping it whole. Registration is a distinct flow with distinct collaborators
and deserves its own name.

---

## Performance

### P1 · The submission path has no budget, only an estimate — **High**

Four sheet writes plus milestone and level evaluation, at roughly 100–300 ms per
Sheets round trip, suggests 1.5–3 seconds inside the lock. That figure is
extrapolated from documented platform behaviour, not measured.

It matters because this is the interaction the whole product turns on. The
vision asks that logging a post feel effortless; a 4-second wait with a spinner
is not effortless, and the number could plausibly be that.

**Recommendation.** Instrument from the first commit — `Logger` times every
step, `SheetClient` times every call — and set an explicit budget:

| Target | Action |
|---|---|
| < 1.5 s | Ship |
| 1.5–3 s | Batch harder; combine adjacent range writes |
| > 3 s | Move milestone and level evaluation out of the lock into a post-commit step, accepting a brief window where a milestone is earned but not yet recorded |

Decide the fallback now, while it is a design choice, rather than under pressure
in Phase 6.

### P2 · A cold dashboard reads six sheets — Medium

`member.dashboard` touches `Members`, `ActivityCalendar`, `WeeklyStats`,
`MemberMilestones`, `MilestoneCatalog`, and `FlowLevels`. Cached at 60 seconds,
but the first load after any submission is always cold — which is exactly when a
member is looking.

Two of the six are effectively static and cached for 30 minutes, so the real
cost is four.

**Recommendation.** Warm the dashboard cache **inside the submission response
path**: the transaction has just computed almost everything it needs. This turns
the most common cold read — the one immediately after posting — into a warm one.
Measure before doing more.

### P3 · Lock contention is assumed to be negligible — Low

Locks are per member, and a member does not post concurrently with themselves
except by double-tapping. Contention should be near zero.

"Should be" is doing work in that sentence. `LockClient` should record every
wait longer than 500 ms to `AuditLog`, so the assumption is monitored rather
than trusted.

---

## Security

### S1 · Lockout is a denial-of-service vector — Medium

Five failed attempts on a username locks that account for fifteen minutes.
Usernames are visible on the leaderboard. Anyone can therefore lock out any
member, repeatedly, with a trivial script — and Apps Script cannot see the
client IP, so there is nothing to block.

This is the classic trade-off, and the current design takes the safe side. But a
member unable to log in for a week because someone is scripting against them is
a real failure of *"encouraging rather than demanding"*.

**Recommendation: exponential backoff instead of a flat lock.**

| Failures | Delay before the next attempt is accepted |
|---|---|
| 1–4 | none |
| 5 | 30 s |
| 6 | 2 min |
| 7 | 8 min |
| 8+ | 30 min, capped |

The legitimate member who mistyped waits half a minute. An attacker gains almost
nothing per attempt. Crucially, **the account is never fully unusable** — the
delay is between attempts, not a wall. Pair it with an `AuditLog` entry so a
sustained attack is visible.

### S2 · `requestId` is client-supplied and unverified — Medium

Idempotency keys off a client-generated UUID. A malicious client can reuse one
to make a second submission return the first's result — harmless, they get
nothing — or send a fresh one on every retry to defeat idempotency and log
duplicates.

The daily cap bounds the damage, and duplicate-link detection catches the common
case. But a member logging five genuinely different links rapidly with fresh
request ids bypasses the protection idempotency was meant to give.

**Recommendation.** Bind the idempotency record to `(memberId, requestId)` and
additionally reject an identical `LinkKey` from the same member within 60
seconds regardless of `requestId`. A content-based check cannot be circumvented
by generating new ids.

### S3 · There is no account recovery — Low, but decide before launch

A member who forgets their PIN needs an admin to reset it. There is no
self-service path, because there is no verified email or phone.

That is coherent — Stage 2 is optional and unverified, so there is nothing to
send a reset to. It also means every forgotten PIN is a support message, and at
60 members that is manageable.

**Recommendation:** accept it, but make `admin.members.resetPin` genuinely easy
to reach in the admin UI, and say so in the member-facing copy: *"Forgot your
PIN? Message the team and we'll reset it."* An error that names the recovery
path is not a dead end.

---

## Maintainability

### M1 · Forty-plus files sharing one global scope — Medium

No imports, no modules, alphabetical load order, and every service name is a
global. A collision is silent: the later definition simply wins.

The naming convention prevents most of this, and it depends on discipline
holding across every future contributor.

**Recommendation.** A `setup/VerifyIntegrity.gs` function, run manually after
each deploy, that asserts every expected global exists and is the expected type.
Twenty lines, and it turns a silent shadowing bug into an immediate failure.

Also worth stating in `appsscript/README.md`: **nothing may execute at the top
level of a file except declarations.** It is the single most common way an Apps
Script project breaks in a way that is painful to trace.

### C1 · Cache invalidation is manual — Medium

Every write path must remember to invalidate the right keys. Forget one and a
member sees stale numbers for 60 seconds — mild, but exactly the class of bug
that is discovered by a confused user rather than a test.

**Recommendation.** Namespace cache keys by entity and invalidate by prefix:
`dash:{memberId}`, `lb:{weekStart}`. A single `CacheClient.invalidateMember(id)`
clears everything for one member, so a write path has one call to remember
instead of four.

---

## Scalability

Beyond the Phase 2 review's coverage:

**The pipeline design (W1) is the scalability seam for celebration features.**
Badges, challenges, and streak freezes all become steps rather than edits to a
growing method.

**`AnalyticsService` reads only `CommunityStats`**, so admin analytics stay
constant-cost as the ledger grows. Already correct.

**Repositories should take a `spreadsheetId`** from the start, defaulting to the
active spreadsheet. Archiving closed years to a second file then becomes
configuration rather than surgery.

---

## What I could not review

**Real latency.** Every number above is extrapolated. P1's budget must be
checked against measurement before Phase 6 depends on the interaction feeling
instant.

**Concurrency under real conditions.** Sixty members do not submit
simultaneously, so contention is likely a non-issue — but one deliberate test
with several concurrent submissions for one member would settle it rather than
assume it.

**Apps Script quota behaviour under sustained load.** Documented limits exist;
how they degrade in practice is worth discovering in a controlled test rather
than during a launch week.

---

## Recommended changes, consolidated

Adopt into the Phase 5 plan:

1. **Service factories with injected dependencies** (W2) — the highest-value
   change, and nearly free before implementation starts
2. **An explicit pipeline for the submission transaction** (W1)
3. **Split `MemberService` into three** (W3)
4. **Exponential backoff instead of flat lockout** (S1)
5. **Content-based duplicate protection alongside `requestId`** (S2)
6. **Instrument from the first commit, with the budget and fallback agreed in
   advance** (P1)
7. **Prefix-based cache invalidation** (C1)
8. **`VerifyIntegrity` after deploy** (M1)
9. **Warm the dashboard cache in the submission response** (P2)
10. **Repositories accept a `spreadsheetId`** (scalability)

Items 1–3 are structural and should be settled before any service is written.
Items 4–5 change behaviour and need your agreement. Items 6–10 are cheap now and
awkward to retrofit.
