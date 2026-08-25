# Activity Calendar, Milestones & Flow Levels

The **Track** and **Celebrate** principles, in architecture.

Schema in [`database.md`](database.md) §4–5, runtime behaviour in
[`data-lifecycle.md`](data-lifecycle.md) §6–8. This document covers the design
reasoning and the decisions that need your input.

---

## 1. Activity Calendar

One square per calendar day. Empty means no post; filled means at least one.
Today is always identifiable. Hover or tap reveals the date and count.

### The storage decision

A row per member per active day would be ~15,000 rows a year — the same scan
cost as the ledger it was meant to accelerate. Instead, one row per member per
year holds a **366-character string**, one character per day, `'0'`–`'9'`.

Sixty rows carry a full year of daily activity for the whole community. Reading
a member's entire year is one cell. Writing a submission is one character.

Full reasoning and the rejected alternative: [`database.md`](database.md) §4.2.

### Rendering

The component takes a **date range** and a **sparse count map**, and renders a
grid of weeks. It never fetches, never knows about members, and never decides
what "filled" means — a `scale` function maps a count to a level, and the
default is binary.

```
props: { from, to, counts, scale, today, onSelect }
```

That signature is what makes the future list a rendering change rather than a
rebuild:

| Future feature | What changes |
|---|---|
| Multiple submissions per day | Nothing — counts are already counts |
| Colour intensity | Swap `scale` for a threshold function |
| Monthly view | Pass a one-month range |
| Yearly history | Pass a past year's range |
| Personal milestones on the grid | An optional `markers` prop |
| Exportable reports | The `counts` map is the export |
| Analytics overlays | A second `overlay` prop, drawn beneath |
| Themes | Levels map to CSS custom properties, not literals |

### Responsive behaviour

53 weeks × 7 days does not fit a 375px screen. The grid scrolls horizontally
inside its own container, pinned to the current week, so the page body never
scrolls sideways. The dashboard requests `calendar.defaultWeeks` (26) rather
than a full year — enough to show a shape, small enough to read.

---

## 2. Milestones — where a definition lives

**Presentation is data. Conditions are code.**

A condition like "seven consecutive posting days" is a function, not a value.
Putting it in a spreadsheet cell means inventing a rules language with no tests,
no type checking, and edit access for anyone who opens the file. One wrong
character silently stops every member earning anything.

So the split:

| In `MilestoneCatalog` (sheet) | In `appsscript/lib/milestones.js` (code) |
|---|---|
| Name, description, icon, category | The evaluator function |
| Rarity, sort order, active flag | |
| Hidden, seasonal windows, series, tier | |
| Badge artwork URL | |

Reword a description without a deploy. Change what a milestone *means* through
a tested code change. Same pattern as the metric registry (D23).

### The evaluator contract

```
evaluate(snapshot) → { unlocked: boolean, progress: number, target: number }
```

Pure. No sheet access, no dates beyond what the snapshot carries. Unit-testable
in Phase 3 before anything touches a spreadsheet.

Returning `progress` and `target` from the same function is what makes
**"Progress Towards the Next Milestone"** free: the next milestone is simply
the unearned one with the highest `progress / target` ratio. No separate
configuration, no risk of the progress bar disagreeing with the unlock.

### Future compatibility, already present

`Hidden`, `AvailableFrom`, `AvailableUntil`, `SeriesID`, `Tier`, and
`BadgeArtworkUrl` exist in the catalog and are unused. Secret milestones,
seasonal milestones, community challenges, sponsor milestones, multi-tier
series, and shareable cards each need a value in a column that is already there.

Push, email, and WhatsApp celebrations write to the `Notifications` outbox,
which is populated from day one even though nothing delivers yet.

### Presentation

**No emojis anywhere.** Every milestone uses an icon from the Phase 1 system —
24×24, 2px stroke, `currentColor`. Sixteen new icons are needed; they are listed
in §6 and will be drawn in the same geometry as the existing set.

Unlocking shows one modal, one subtle animation, one congratulatory line. No
confetti, no sound. "Refined and professional" is a constraint on the
celebration, not just a description of it.

---

## 3. Flow Levels

Milestones celebrate an accomplishment. Levels describe **who someone has
become**. A member holds exactly one, and it never falls.

| Level | Posts | Perfect weeks | The identity |
|---|---|---|---|
| Seedling | 0 | 0 | You've started |
| Creator | 10 | 1 | You're publishing |
| Builder | 50 | 4 | You've built a habit |
| Consistent Creator | 100 | 12 | Consistency is who you are |
| Community Leader | 250 | 26 | Others follow your example |
| Tribe Legend | 500 | 52 | A year of showing up |

**Both conditions required.** Posts alone rewards a burst; weeks alone rewards
the calendar passing. Requiring both means a level says *this person shows up,
and keeps showing up*.

**Levels never fall.** Someone who reached Builder and then had a quiet month is
still a Builder. Demoting them would punish exactly the member the product most
needs to bring back — and it would contradict "encouraging rather than
demanding" directly.

Levels appear on the dashboard, on profiles, and beside names on leaderboards,
so a member's standing is visible as growth rather than only as rank.

---

## 4. Three settled decisions

Approved. These are now permanent architecture.

### 4.1 Active days, not consecutive days ✅

**7 Active Days**, **30 Active Days**, and **100 Active Days** count the
**total number of distinct days on which a member logged qualifying content**.
They do not need to be consecutive.

The original consecutive-day definition was unreachable for most of the
community. A member who chooses 3 posts a week and hits it *perfectly, every
week, for a year* posts Monday, Wednesday, Friday — a longest consecutive run of
**one day**. They would never have earned any of the three. 100 consecutive days
was effectively Daily-goal-only.

Flow Tribe rewards consistency **against the commitment a member chose**, not
against the highest available commitment. A 3-post member, a 5-post member, and
a Daily member all progress here at a rate that reflects their own promise.

**Where the number comes from:** `ActivityCalendar.ActiveDays`, summed across a
member's year rows. That column counts non-zero characters in the day map, so
it is exactly "days I posted on" with no separate bookkeeping. Multiple posts on
one day count as one active day — which is the point.

### 4.2 One streak on the dashboard, and it is the week streak ✅

With a day-based calendar and a week-based goal, an unqualified "Current Streak"
is ambiguous. The dashboard shows the **week streak** only.

It is goal-relative, so it means the same thing to a 3-post member and a Daily
member. A day streak shown to a 3-post member would read "1" almost permanently
— technically true, and quietly discouraging every time they open the app.

The calendar already carries days, as *texture*: the shape of a month rather
than a number that can be broken. The grid conveys rhythm; the streak conveys
commitment. Columns are named `CurrentWeekStreak` and `LongestWeekStreak` so the
unit is never in doubt in code.

### 4.3 Weekly Champion, and a Perfect Week means separate days ✅

**"Community Leader" is a Flow Level only.** The milestone for finishing first
on the weekly leaderboard is **Weekly Champion**. One concept, one name.

**A Perfect Week means meeting your goal across separate calendar days.**

| Goal | Posts | Days | Goal met | Perfect Week |
|---|---|---|---|---|
| 3 | Mon, Wed, Fri | 3 | ✅ | ✅ |
| 3 | three on Saturday | 1 | ✅ | ❌ |
| 5 | Mon–Fri | 5 | ✅ | ✅ |
| 5 | two Mon, three Tue | 2 | ✅ | ❌ |

Meeting the goal still counts as meeting the goal — it feeds the week streak,
the ring, and `PerfectWeeks`. What it does not do is unlock the Perfect Week
milestone, which is reserved for the behaviour this product exists to build:
showing up on separate days rather than batching.

`WeeklyStats.DistinctDays` carries it. The condition is
`GoalMet AND DistinctDays >= GoalAtWeek`.

---

## 5. The catalog as it stands

Sixteen milestones. IDs are stable; names and descriptions are editable in the
sheet.

| ID | Name | Category | Condition | Rarity |
|---|---|---|---|---|
| `first-step` | First Step | Getting Started | First post logged | Common |
| `first-goal` | First Goal Completed | Getting Started | First week meeting goal | Common |
| `active-days-7` | 7 Active Days | Consistency | 7 distinct days with a post | Common |
| `active-days-30` | 30 Active Days | Consistency | 30 distinct days with a post | Uncommon |
| `active-days-100` | 100 Active Days | Consistency | 100 distinct days with a post | Rare |
| `perfect-week` | Perfect Week | Weekly Excellence | `GoalMet AND DistinctDays >= GoalAtWeek` | Common |
| `perfect-weeks-5` | Five Perfect Weeks | Weekly Excellence | 5 consecutive weeks meeting goal | Uncommon |
| `perfect-weeks-12` | Consistency Champion | Weekly Excellence | 12 consecutive weeks meeting goal | Rare |
| `posts-10` | 10 Posts | Posting | 10 all-time | Common |
| `posts-50` | 50 Posts | Posting | 50 all-time | Common |
| `posts-100` | 100 Posts | Posting | 100 all-time | Uncommon |
| `posts-250` | 250 Posts | Posting | 250 all-time | Rare |
| `posts-500` | 500 Posts | Posting | 500 all-time | Legendary |
| `founding-member` | Founding Member | Community | Joined before `milestones.foundingPeriodEnd` | Legendary |
| `top-10` | Top 10 | Community | Finished a week in the top 10 | Uncommon |
| `weekly-champion` | Weekly Champion | Community | Finished a week at `RankFinal = 1` | Rare |

The five posting milestones share `SeriesID = posts` with ascending `Tier`, so
"next in this series" needs no hardcoded sequence.

`founding-member` reads its cutoff from `Settings`, not from a constant — the
founding window is a business decision you should be able to change.

---

## 6. Icons required

Sixteen milestone icons and six level icons, drawn in the Phase 1 geometry:
24×24, 2px stroke, round caps and joins, `currentColor`.

**Milestones:** footprint · flag · calendar-check · calendar-days ·
calendar-star · check-circle · layers · shield-check · file-text · files ·
archive · library · crown · seedling-badge · trophy · medal

**Levels:** seedling · pen · hammer · rings · beacon · laurel

Several already exist (`trophy`, `medal`, `calendar`, `check`, `flame`,
`target`, `sparkle`) and will be reused rather than duplicated.

---

## 7. Dashboard order

Approved layout, and the reasoning behind it:

1. **Welcome** — identity, platform, Flow Level
2. **Weekly Progress Ring** — this week, at a glance
3. **Activity Calendar** — the shape of consistency over months
4. **Milestone Progress** — recent unlocks, total, next, progress toward it
5. **Weekly Statistics** — the numbers
6. **Leaderboard** — the community
7. **Recent Activity** — the last few posts
8. **Submit Today's Post** — the action

**Motivation before statistics.** A member sees their own progress (2, 3) and
what they are working toward (4) before any figure and long before anyone
else's standing (6). The leaderboard sitting sixth is the vision's
"community-first, not leaderboard-first" expressed as a layout.

**The CTA at position 8 is not a demotion.** The bottom navigation already
carries a persistent raised submit button, in thumb reach at every scroll
position. Position 8 is the *page's* closing action; the nav is the always-there
one. Nobody has to scroll to log a post.
