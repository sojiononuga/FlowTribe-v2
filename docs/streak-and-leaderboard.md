# FlowTribe v2 — Weekly Streak & Leaderboard Logic

**Status: proposal. Awaiting approval. No code written.**

This is the part of the product that decides who gets publicly celebrated, so it is specified more
tightly than anything else and is the first thing that gets unit tests. v1 had zero tests here.

---

## 1. Definitions

| Term | Definition |
|---|---|
| **Week** | Monday 00:00:00.000 → Sunday 23:59:59.999, **Africa/Lagos** |
| **`WeekStart`** | The Monday date of that week. The canonical week key — sorts and groups with no edge cases |
| **Weekly goal** | The member's `3`, `5`, or `7` |
| **Achieved week** | A week whose active submission count ≥ the goal in force *that* week |
| **Current week** | The week containing "now". Always in progress |
| **Completed week** | Any week before the current one |

Server time only. A member changing their phone's clock cannot manufacture a streak.

**Why `WeekStart` rather than `(WeekNumber, Year)`:** ISO week 1 can contain days from the previous
December, and some years have a week 53. `(53, 2026)` and `(1, 2027)` can describe overlapping
reality. A Monday date cannot. `WeekNumber` is still stored and displayed, exactly as your spec
asks — it just isn't what the maths runs on.

---

## 2. Which goal a week is measured against

If a member on a 3-post goal builds a six-week streak and then upgrades to 7, judging their history
against 7 would retroactively erase that streak. Punishing someone for aiming higher is the wrong
behaviour for a motivation product.

**So each week is judged against the goal that applied during that week.** Every submission row
carries `GoalAtSubmission`, and a week's goal is taken from that week's **first** submission.
Weeks with no submissions are never achieved regardless, so the absence of a record is harmless.

Using the *first* rather than the last submission means a week already achieved mid-week cannot be
retroactively un-achieved by raising the goal on Friday. Slightly lenient, deliberately so.

This is why `GoalAtSubmission` exists in the schema and why no separate goal-history sheet is
needed.

---

## 3. Weekly progress (the dashboard ring)

```
postsThisWeek = count of Active submissions where
                  MemberID = me AND WeekStart = current week

goalMet   = postsThisWeek >= weeklyGoal
remaining = max(0, weeklyGoal - postsThisWeek)
```

Displayed exactly as your spec requires — `2 of 3 Posts`, `5 of 7 Posts` — with the caption:

| Condition | Caption |
|---|---|
| `remaining = 0` | "Weekly goal achieved." |
| `remaining = 1` | "You have one post left this week." |
| `remaining > 1` | "You have {n} posts left this week." |
| `postsThisWeek = 0`, early week | "Fresh week. Let's go." |

The ring fills to `min(postsThisWeek / weeklyGoal, 1)` and never overfills. Posts beyond the goal
still count toward totals and leaderboards — going past your goal should never feel like nothing.

---

## 4. Current streak

Your spec: *"Every Monday, weekly post count resets. Current streak continues if the previous
week's goal was achieved. Otherwise current streak resets to zero. Longest streak remains
unchanged."*

The rule that makes this humane, carried over from v1: **the current week never breaks a streak.**
A member on a 5-week streak who opens the app on Tuesday morning with 0 posts should see 5, not 0.
Showing 0 at the start of every week would punish them for the passage of time and is exactly the
kind of thing that makes people stop opening an app.

```
weeks ← group the member's Active submissions by WeekStart, count each
        (never look earlier than their join week)

streak ← 0

STEP 1 — the current week
  if current week achieved → streak = 1
  else                     → streak = 0        // in progress, does not break

STEP 2 — walk backwards through completed weeks
  for each week, most recent first:
      if achieved        → streak = streak + 1
      else               → STOP
      if before join week → STOP
```

### Worked examples

Goal 3. `✓` = achieved, `✗` = missed, `▶` = current week in progress.

| History (oldest → newest) | Streak | Why |
|---|---|---|
| `✓ ✓ ✓ ▶(1/3)` | **3** | Current week in progress doesn't break the run |
| `✓ ✓ ✓ ▶(3/3)` | **4** | Current week achieved, so it counts |
| `✓ ✓ ✗ ▶(2/3)` | **0** | The completed miss broke it; the current week hasn't rebuilt it yet |
| `✓ ✓ ✗ ▶(3/3)` | **1** | Current week achieved — a fresh streak has started |
| `▶(0/3)` (new member) | **0** | Nothing yet |
| `✓ ✗ ✓ ✓ ▶(3/3)` | **3** | Only the run touching now counts |

The third row is the one to sanity-check: the streak is genuinely gone, and it shows 0 until they
finish the current week. That matches your spec's Monday-reset rule.

### Edge cases the tests must cover

| Case | Behaviour |
|---|---|
| Joined mid-week | Their join week is evaluated normally. Weeks before it are never examined |
| Gap of several weeks | First missed completed week stops the walk |
| Goal changed mid-history | Each week judged by its own `GoalAtSubmission` (§2) |
| Submission voided by an admin | Recount runs; the streak may legitimately drop |
| Member inactive then reactivated | Missed weeks count as misses. Streaks reflect reality |
| Year boundary | `WeekStart` dates are continuous. No special case exists |

---

## 5. Longest streak

`LongestStreak` is the maximum run of consecutive achieved weeks anywhere in the member's history,
including the current week if achieved.

**It never decreases through normal use** — that is the whole point of the stat. On every write:
`LongestStreak = max(LongestStreak, CurrentStreak)`. The nightly reconcile recomputes it fully from
the ledger, which is the only path by which it can fall, and only when the ledger genuinely changed
(an admin voided a submission).

---

## 6. Where the numbers come from — derive, then materialise

This is the most important structural decision in this document.

`Members` stores `CurrentStreak`, `LongestStreak`, `AllTimePosts`, `LastSubmissionDate` as your
spec requires. But those columns are **a cache, never the truth.** `Submissions` is the ledger, and
every number is recomputable from it.

| Path | What happens |
|---|---|
| **On write** | Submission appended → streak recomputed from the ledger → counters written back → caches invalidated |
| **On read** | Dashboard reads the materialised row. One row, instant |
| **Monday 00:05** | Rollover job closes out last week, materialises results, writes an audit row |
| **Nightly 02:00** | Full recompute from the ledger; any drift corrected and logged |

**The property that matters: correctness never depends on a scheduled job firing.** Apps Script
triggers do occasionally fail silently. Because the write path recomputes from the ledger every
time, a member's numbers are already correct the moment they post — the Monday job only tidies up
members who *didn't* post. And if it fails entirely, the nightly reconcile heals everything.

This is the reason I'm comfortable storing derived values at all. Without the reconcile job, those
four columns would eventually drift and nobody would notice until someone's streak was visibly
wrong in front of the community.

---

## 7. Leaderboard

### Ranking

Your spec ranks by **weekly posts**, with `#4 This Week` on the dashboard.

```
1  Take Active members only
2  Count each member's Active submissions in the scope
     week    → WeekStart = current week
     month   → Month + Year = current
     allTime → AllTimePosts
3  Sort descending by the chosen metric
4  Assign competition ranking:  1, 2, 2, 4
```

**Competition ranking (1, 2, 2, 4), not dense (1, 2, 2, 3).** If two people tie for second, the
next person is genuinely fourth. Dense ranking would let someone be "3rd" with more members ahead
of them than that implies — and on a leaderboard people screenshot and share, that reads as wrong.

### Tie-breaks, in order

1. Higher current streak — consistency over a single good week
2. Earlier timestamp of their most recent qualifying post — rewards posting earlier
3. Display name, ascending — purely so the order is deterministic between refreshes

Without a deterministic final tie-break, tied members would visibly swap places on every reload,
which looks broken.

### Members with zero posts this week

Not ranked. The dashboard shows `—` with *"Post this week to join the leaderboard."*

Showing someone `#47 This Week` on a Monday morning for having done nothing yet is discouraging,
and your spec says the UI should motivate people to return. They enter the leaderboard the moment
they post. This is a small judgement call — question Q8.

### Sorting and scopes

Per your admin spec: scopes `week` / `month` / `allTime`; sorts `Total Posts` / `Current Streak` /
`Longest Streak`. Members see the same leaderboard read-only, restricted to display name, count,
and rank — no platform, no links, no status.

### Cost

Weekly leaderboard = one filtered pass over the current week's rows (~200), cached 60 seconds,
invalidated on write. All-time reads the materialised `AllTimePosts` column — no ledger scan.

---

## 8. Community metrics — configurable, per Q9

Every metric is an entry in the **metric registry**, not a hardcoded function. Each declares an id,
a label, the `Settings` keys it reads, and its compute function. `admin.overview` returns only the
**enabled** entries, each carrying the parameters it was computed with — so the UI can render
"last 4 weeks" without knowing the number 4.

| Metric | Definition | Settings key | Ships |
|---|---|---|---|
| Total Members | All members, any status | — | ✅ enabled |
| Active Members | `Status = Active` | — | ✅ enabled |
| New Members This Month | `JoinDate` in the current calendar month | — | ✅ enabled |
| Posts Submitted Today | Active submissions dated today | — | ✅ enabled |
| Posts This Week | Active submissions in the current `WeekStart` | — | ✅ enabled |
| Weekly Goal Completion Rate | % of active members who hit their goal, in scope | `metrics.goalCompletionRate.scope` (`week`) | ✅ enabled |
| Average Posts Per Member | Posts in scope ÷ active members, 1 decimal | `metrics.avgPostsPerMember.scope` (`week`) | ✅ enabled |
| **Community Consistency Score** | **Undefined — to be agreed** | `metrics.consistencyScore.enabled` (**`FALSE`**) | ⏸ **paused** |

### The Consistency Score is paused, per your decision

It ships in the registry with `enabled = FALSE`. The card is simply absent from the response and the
admin UI renders nothing in its place — no placeholder, no "coming soon". When you and I agree the
calculation, it becomes one registry entry plus a Settings flip, with **no front-end deploy**.

The parameter slot `metrics.consistencyScore.windowWeeks` is reserved so the shape is ready when the
definition is. For the conversation when we have it, the question to settle is what the score should
be robust against: a definition based on a single week swings wildly on one quiet week; one based on
a multi-week window is steadier but slower to reflect a genuine change in the community.

### Most / Least Active Members

Current month, top and bottom 5. **"Least Active" is admin-only and never surfaced to members** —
it exists as an operational list for nudging people, and publishing it would do the opposite of what
this product is for.

---

## 9. Test coverage this logic requires

Non-negotiable before this ships, given it decides public recognition:

- Week boundary: Sunday 23:59 vs Monday 00:00, Africa/Lagos
- All six worked examples in §4
- Current week in progress never breaking a streak
- Streak stopping at the join week
- Goal changed mid-history, per §2
- Longest streak monotonic under normal writes; falling only after a void
- Competition ranking with ties at the top, middle, and bottom
- Deterministic ordering across repeated calls
- Zero-post members excluded from ranking
- A voided submission triggering a correct recount
- Year-boundary weeks
- The materialised counters matching a full recompute (the reconcile job's own assertion)
