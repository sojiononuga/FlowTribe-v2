# Tests

## What gets tested, and what does not

Testing effort goes where a bug is expensive rather than where it is easy.

**Tested thoroughly — `appsscript/lib/`.** Week boundaries, streak calculation,
ranking, link normalisation, username rules. These decide who appears on a
public leaderboard and who gets celebrated as FlowMate of the Week. A quiet
error here tells a member their streak broke when it did not, in front of the
whole community. v1 had no tests on any of it.

**Tested where behaviour is subtle — parts of `src/lib/`.** PIN policy,
validators, formatting edge cases.

**Not unit-tested — components and views.** Rendering assertions on a DOM built
by hand mostly re-state the implementation, and they break on every design
change while catching almost nothing. The component gallery covers this ground
better: it renders every primitive on one page, so a regression is visible.

## Why `lib/` is pure

Nothing in `appsscript/lib/` imports an Apps Script API — no `SpreadsheetApp`,
no `CacheService`, no `Session`. It takes plain arrays and dates and returns
plain values.

That is what makes the streak engine testable at all. The same files run inside
Apps Script in production and under Node here, with no mocking of Google's
platform and no test-only code paths. If the maths needed a spreadsheet to
execute, it could only be verified by running the real thing against real data —
which is exactly how v1 ended up with untested arithmetic.

## Running

Phase 2 adds the harness. The intent is Node's built-in test runner:

```bash
node --test tests/unit
```

No framework, no dependencies, nothing to install — consistent with the rest of
the project.

## Cases already identified

From [`docs/streak-and-leaderboard.md`](../docs/streak-and-leaderboard.md) §9,
to be written in Phase 2:

- Monday boundary in Africa/Lagos, including a post at 23:59 on a Sunday
- Current week extends a streak but never breaks it
- A missed week resets the current streak; the longest streak is untouched
- Competition ranking with ties
- A member with zero posts is unranked, not ranked last
- Weekly goal changed mid-history — each week judged by `GoalAtSubmission`
- `LinkKey` normalisation: `utm_*` stripping, fragment removal, trailing slash
- Domain-suffix matching rejects lookalikes such as `notlinkedin.com`
- Username format rules and the reserved-name list
- PIN policy: repeats, ascending and descending sequences, the common list

## Phase status

| Phase | State |
|---|---|
| 1 — structure and intent | ✅ this file |
| 2 — harness and the `lib/` suite | pending |
