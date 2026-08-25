# Flow Tribe — Current State

> ## ⚠️ [`FINAL_PRODUCT_DECISIONS.md`](FINAL_PRODUCT_DECISIONS.md) governs
>
> Implementation = source of truth for **behaviour**.
> The three `.docx` files = source of truth for **visual design only**.
> Conflicts are resolved there and **closed**.

**As of the end of Phase 10.** Feature complete, fully wired, and now verified
end to end through the real views. **Deployment-ready and not yet deployed.**

**Verification, as of Phase 10:**

| Suite | Result | Open |
|---|---|---|
| Backend checks | **102 / 102** | `tests/backend.html` |
| End-to-end journeys | **16 / 16** | `tests/journeys.html` |

Run **both**. They prove different things, and Phase 10 exists because the
first cannot see what the second does.

---

# Completed Features

## Design system

- `styles/tokens.css` — full token layer: burgundy `#5B0000` and gold
  `#F5B400` scales, the Design System's true neutrals, 4px spacing scale,
  burgundy-tinted shadows, type scale, motion durations with
  `prefers-reduced-motion`, named z-index steps
- 12 stylesheets loaded as parallel `<link>` tags (no `@import` waterfall)
- Component gallery at `gallery.html` rendering every primitive
- Verified: **zero horizontal overflow at 375px**

## Core runtime (`src/core/`, ~1,400 lines)

`dom.js` (element builder that never touches `innerHTML`) · `component.js` (the
contract) · `store.js` · `router.js` (hash routing, guards, lazy views) ·
`api.js` (the only `fetch` caller) · `session.js` (storage, expiry, cross-tab
sync) · `errors.js` (full code taxonomy) · `config.js`

## Component library

**UI:** button · field · input · 6-digit PIN input · select · option cards ·
switch · card · badge · avatar · spinner · skeleton · empty state · modal ·
toast
**Brand:** logo lockup · progress ring · stat card · streak flame · rank prompt
· success burst · **activity calendar** · milestone badge/card · next milestone
· progress bar · level chip · level track · level progress
**Layout:** app shell · top bar · bottom nav · page header · section · mode
switch

## Member application (10 screens)

| Screen | State |
|---|---|
| Registration (3 steps, invite-gated) | ✅ Live backend |
| Login | ✅ Live backend |
| Welcome (post-registration) | ✅ |
| Dashboard | ✅ One call, all 8 sections |
| Submit Post | ✅ Validation, success animation, milestone modal |
| Activity Calendar | ✅ 26-week heatmap, today marked, tooltips |
| Milestones | ✅ Gallery, progress, detail + celebration modals |
| Flow Levels | ✅ Current, next, full ladder |
| Leaderboard | ✅ 3 scopes, 3 sorts, self highlighted |
| Profile | ✅ Details, stats, calendar, milestones, logout |

## Admin application (9 screens)

Overview (8 figures) · Members (search + 4 filters, pagination) · Member detail
(edit, reset PIN, suspend/reactivate, reconcile) · Submissions (filters,
clickable links, void) · Leaderboard (read-only, **no score editing exists**) ·
Analytics (**7 hand-rolled SVG charts**) · Invites (bulk generate, list,
revoke) · Settings (Super Admin) · Audit log (Super Admin)

Navigation is filtered by capability — a Community Manager sees 6 items, not 8.

## Backend (20 files, 7,600 lines, 38 actions)

6 pure libraries · 14 repositories · 15 services · 4 orchestrators + `Pipeline`
· 5 middleware · 6 controllers · 6 scheduled jobs · 6 setup functions

## Security

Iterated HMAC-SHA256 + salt + server-side pepper · constant-time comparison ·
exponential login backoff · opaque tokens stored hashed · capability-based
authorisation with per-request role refresh · formula-injection escaping ·
registrable-domain link matching · append-only credential-free audit log

## Data integrity

Append-only ledger · nightly cursor-based reconcile · 15-minute rollup repair ·
idempotency by `requestId` · `LockService` on every derived-state write ·
`setupVerify()` catching silent catalog/evaluator mismatches

## Verification and tooling

102 backend checks across 14 groups · **16 end-to-end journeys mounting the
real views against the real backend** · in-memory Google fakes with real SHA-256 ·
`setupSmokeTest()` (27 checks against a real spreadsheet, self-cleaning) ·
`scripts/serve.ps1` · 20 documents

---

# Partially Completed Features

## Stage 2 profile — backend only

**Built:** `Profiles` sheet, `ProfileService`, `profile.get`,
`profile.update`, validation for WhatsApp/email/bio, `ProfileComplete` flag.

**Remaining:** the member-facing screen to edit them. The dashboard has no
nudge toward it. Currently reachable only through the API.

## Notifications — outbox only

**Built:** `Notifications` sheet, `NotificationService.enqueue`, rows written
on milestone unlock and level-up.

**Remaining:** any delivery. No worker, no email, no WhatsApp.

**Deliberate:** rows accumulate now so that when delivery is added, the history
already exists and no celebration is lost in the gap.

## Community Consistency Score — paused

**Built:** metric registry, `metrics.consistencyScore.enabled` setting shipping
`FALSE`, absent from the response rather than stubbed.

**Remaining:** an agreed definition. Paused by explicit decision (D-Q9).

## ~~Brand fonts~~ — COMPLETE (Phase 8)

Satoshi (Medium 500, Bold 700) and Inter (variable, three unicode-range
subsets) are self-hosted in `assets/fonts/`. No CDN. See
[`FINAL_PRODUCT_DECISIONS.md`](FINAL_PRODUCT_DECISIONS.md) §6.4 for why Inter
sits second in `--ft-font-display` — it is load-bearing for Yoruba names.

---

# Features Not Yet Started

| Feature | Notes |
|---|---|
| **Live deployment** | The single blocking item |
| Brand & Content Pass | All member-facing copy is professional placeholder |
| Member Settings screen | Sessions, notifications, timezone, policies |
| Profile photos | Seams in place: `avatar` accepts `src`, `Profiles` takes a column |
| Self-service PIN recovery | Admin reset only; error copy names the path |
| Export (members, submissions, audit) | Design-doc backlog — **not approved for build** |
| Moderation (flag / mark reviewed) | Design-doc backlog — only `void` exists — **not approved** |
| Marketing landing page | Design-doc Screen 1 — **not approved** |
| "No milestones yet" empty state | The dashboard renders nothing there. The `noMilestones` illustration exists and is unwired — **adding the empty state is new UI, not visual work** |

---

# Current Blockers

## B1 — Not deployed (blocks everything)

Every verification so far ran against an in-memory fake. That proves *our*
code. It does not prove Apps Script's runtime, real latency, quota behaviour,
or the deployment configuration.

**Unblocks:** follow [`deployment.md`](deployment.md) (~30 min), then
`setupSmokeTest()`.

## ~~B2 — Design documents diverge from the build~~ — RESOLVED

Closed by [`FINAL_PRODUCT_DECISIONS.md`](FINAL_PRODUCT_DECISIONS.md).
No longer a blocker. The Visual Design Pass is now ordinary scheduled work
with a defined scope.

---

# Technical Debt

| # | Item | Severity | Cost to fix |
|---|---|---|---|
| T1 | Submission latency estimated, not measured | Medium | Free — read the log after the first deploy |
| T3 | Client-supplied idempotency key | Medium | ~1h: add a content-based check |
| T4 | `MemberService` does three jobs | Low | ~2h: split per Phase 3 review W3 |
| T5 | `Members` full scan per lookup | Low | Trivial at 60 rows; revisit at ~500 |
| T6 | Services reference each other directly | Medium | ~3h: factories with injected deps (review W2) |
| T7 | `gallery.html` / `tests/` ship unless removed | Trivial | Delete at deploy, or leave |
| T8 | Lock contention untested | Low | Needs a live concurrency test |

None of these blocks launch. T1 becomes free the moment you deploy.

---

# Phase 10 — Defects found and fixed

Six real defects. Three were **blocking**, and all three had survived every
earlier phase behind a fully passing suite.

| # | Severity | Defect | Fix |
|---|---|---|---|
| **B1** | **Blocking** | `submit-view` read `result.stats.week`; the API returns stats flat. Threw on **every successful post**, and the catch showed *"We couldn't reach Flow Tribe"* on a post already in the ledger. Retrying hit `DUPLICATE_LINK` | Read the flat shape |
| **B2** | **Blocking** | `profile-view` read `milestones.milestones`; the API returns `{ totalEarned, totalAvailable, recent }`. Profile never opened | Read `recent` |
| **B3** | **Blocking** | `LevelProgress` read `next.posts.current`. **No endpoint has ever returned that shape.** It threw on every render, and the view's catch turned it into *"We could not load your dashboard"* — so the member dashboard had **never rendered**. The Levels screen was broken the same way | Take current progress from `stats`, which both callers already hold. No API change |
| **A1** | High | PIN boxes 2–6 were `aria-hidden="true"` **and focusable** — prohibited by the ARIA spec. Affected all three auth entry points | Positional labels |
| **A2** | High | `Field` put the label's `for` on a decorated Input's **wrapper div**. Invalid HTML; tapping the label did not focus the control; `aria-invalid` / `describedby` / `required` landed where no screen reader looks. Hit the submit link field | Target `control.input \|\| control` |
| **E1** | High | `toAppError` mapped **every** `TypeError` to `NETWORK`. `api.js` already converts real fetch failures at the source, so this branch only ever caught **bugs** and dressed them as connectivity problems. It is how B1 stayed hidden | Removed; bugs are `SERVER_ERROR` |

Also fixed: `system.health` was missing from the client's `PUBLIC_ACTIONS`, so
`health()` — the probe used to confirm a deployment — failed for anyone not
logged in, which is exactly who runs it. `statsSettling` is now handled.
Member Detail and Settings use skeletons like every other screen.

## Why a 101-check suite missed all three blockers

The frontend-contract group asserts the shape of the **response**. It
confirmed `milestones.totalEarned` exists — it does — while the view read a
path that never did. **A test written from the response can only ever confirm
the response.**

Worse, every member view wraps its load in `try/catch` and renders an
EmptyState. A view whose *render* throws does not crash: it quietly shows
"We could not load your dashboard", which is long, contains no `undefined`,
and looks like content.

`tests/journeys.html` closes both gaps by mounting the real views and failing
on an error state. It is mutation-tested: reintroducing B3 turns it red.

---

# Phase 11 — the first production defect

Found by `setupSmokeTest()` on the live spreadsheet. **This is the bug the
smoke test exists to catch**, and it is the clearest example yet of the
boundary between what a fake can prove and what it cannot.

**Symptom.** `1 FAILED, 15 passed` — *"Submission accepted on the registered
platform"* → `Rollups did not complete`, with
`TypeError: Cannot read properties of null (reading 'postCount')` at
`FtStreak.isPerfectWeek`.

**Root cause. Google Sheets parses what you write.** An ISO date string
(`2026-07-27`) is stored as a **Date**, and reading it back gives a Date
object, not the string. Every `String(cell) === weekStart` comparison then
matches nothing:

1. `WeeklyStatsRepo.find()` compared `weekStart` — no match, returned `null`
2. `upsert()` appended a row, re-read it with `find()`, got `null`, returned `null`
3. `isPerfectWeek(null)` dereferenced `.postCount` and threw
4. The pipeline caught it, set `statsSettling`, and the smoke test failed

**Blast radius was wider than the crash.** `recordPost` also filters
submissions by `row.weekStart === weekStart`, so `postCount` computed as **0**.
With the fake made faithful, **11 checks fail**, not one: first-post milestone
never unlocks, leaderboard rank is null, analytics trend is 0, active-this-week
is 0.

**Why it survived 101 green checks.** The in-memory fake stored strings
verbatim. The author knew about coercion — `setupBootstrap` already forced
plain text on `ActivityCalendar.DayMap` and `InviteCodes.Code` — but the date
key columns were missed, and no test could see the difference.

**The fix, in two layers.**

| Layer | Change | Verified sufficient alone |
|---|---|---|
| **Write** (root cause) | `setupBootstrap` formats `WeeklyStats.WeekStart`, `Submissions.DayKey`, `Submissions.WeekStart`, and the calendar's first/last active columns as plain text `'@'` | ✅ |
| **Read** (defence) | `toDayKey_()` converts a Date back to `YYYY-MM-DD` in `TIMEZONE`, used by the three date-key fields | ✅ |

Both were mutation-tested independently. The read layer matters because **the
operator edits this spreadsheet by hand** — a stated design goal — and retyping
a date into a cell would otherwise reintroduce the bug silently.

**The fake is now faithful.** `GoogleFakes.js` coerces date-like strings on
write and honours `setNumberFormat('@')` as the exemption. Check **102** asserts
the **raw stored cell** is text — deliberately, because a domain-object
assertion passes even with the column format removed.

⚠️ **This class of bug is not fully closed.** Any future column holding an
opaque key that Sheets could parse — anything date-like or numeric-looking —
needs `'@'` in `setupBootstrap`. The fake will now catch it; it could not
before.

---

# Pending Decisions

## ✅ D0 — RESOLVED: design documents vs implementation

**Closed by [`FINAL_PRODUCT_DECISIONS.md`](FINAL_PRODUCT_DECISIONS.md).
Option B adopted. Do not re-open.**

The three design documents describe a partly different product. That is now a
settled split rather than an open question:

- **Implementation governs behaviour** — auth, registration, streaks,
  submissions, business rules, schema, API, navigation flow.
- **Design documents govern appearance** — colours, typography, tokens,
  spacing, radius, shadows, icons, illustrations, animations, responsive
  polish.

### What this means in practice

| Conflict | Resolution |
|---|---|
| Docs: email + password | **Keep username + 6-digit PIN** |
| Docs: no invite code | **Keep invite-gated registration** |
| Docs: daily streak | **Keep the weekly streak** |
| Docs: platform per submission | **Keep platform fixed at registration** |
| Docs: title + reflection fields | **Keep the single-field submission** |
| Docs: emojis throughout | **Keep the no-emoji rule; use the icon system** |
| Docs: screens not built | **Backlog only — do not build without approval** |

Full table with all twelve conflicts: `FINAL_PRODUCT_DECISIONS.md` §5.

### What IS to be adopted

Brand colours (`#5B0000`, `#FF2D2D`, `#F5B400`, `#F8F8F8`, `#222222`,
`#E5E5E5`, `#22C55E`, `#F59E0B`, `#DC2626`) · Satoshi + Inter typography and
the 48/36/28/22/18/16/14/12 scale · modal radius 24px · 8px spacing tokens ·
the specified milestone and Flow Level icon mappings · icon sizing per context
· empty-state illustrations · **desktop left sidebar navigation**.

Exact scope: `FINAL_PRODUCT_DECISIONS.md` §4.

**Two cautions** before starting, in §6 of that document: Golden Yellow and
Bright Red both fail WCAG AA for normal text, and Bright Red sits close enough
to the error red to read as a warning if used broadly.

## D7 — Consistency Score definition

Paused pending an agreed calculation. Registry entry ships disabled.

## D8 — Founding-member cutoff

Currently `2026-08-01` in `Settings`. Confirm before launch.

---

# Immediate Priorities

The Visual Design Pass is done. Deployment is the only thing still blocking.

1. **Deploy** — 30 minutes, unblocks all real verification.
2. **Run the production checklist** — ~120 items, ~20 minutes.
3. **Record real latency** — free once deployed.
4. **Brand & Content Pass** — copy only.

⚠️ **Do step 1 knowing this:** milestone and Flow Level `IconID`s ship in the
seed and are written only into an **empty** sheet. They are correct now. Once
deployed, any further icon change is a manual spreadsheet edit.

---

# Recommended Next Steps

## If continuing engineering

```
1. Read FINAL_PRODUCT_DECISIONS.md FIRST — it governs everything
2. Read PROJECT_OVERVIEW.md, ENGINEERING.md, this file, and the three .docx files
3. Open tests/backend.html   — confirm 102/102 before changing anything
4. Open tests/journeys.html  — confirm 16/16. THIS is the one that catches
   a view reading a field the API does not return
5. Deploy per deployment.md
6. Run setupSmokeTest() on the live project
7. Work production-checklist.md
8. Record submission and dashboard latency from the execution log
```

## If touching anything visual

The design system is applied. Before changing it, read
`FINAL_PRODUCT_DECISIONS.md` §6 and §8 — they record what was decided and,
more usefully, what was measured.

Three rules that are easy to break by accident:

1. **Never set a `-500` status colour as a `color` on a light surface.**
   `#22C55E` is 2.3:1 and `#F59E0B` is 2.2:1 on white. Use `-700` for text.
   The scale encodes the split: `-50` tint, `-500` fill, `-700` text.
2. **Do not reorder `--ft-font-display`.** Inter sits second because Satoshi
   has no `ẹ ọ Ẹ Ọ ṣ` and headings render member names.
3. **Satoshi has Medium 500 and Bold 700 only.** Asking for 600 or 800 makes
   the browser synthesise a face, which smears at large numeral sizes.

Check `gallery.html` after each change — it renders every primitive on one
page. It does **not** load `components-admin.css`; admin layout has to be
checked on `admin.html`.

**Re-run BOTH suites: `tests/backend.html` at 102/102 and
`tests/journeys.html` at 16/16.** A visual change that breaks a journey was
not a visual change.

## If starting the Brand & Content Pass

Copy surfaces: `src/core/errors.js` (member-facing error messages) ·
`src/lib/format.js` (`weeklyProgressMessage`) · each view's headings and empty
states · `MilestoneCatalog` and `FlowLevels` sheets (**names and descriptions
are data, editable without a deploy**).

## Conventions to preserve

- **Never `innerHTML`.** Security, not style.
- **Business logic server-side only.** Format checks may be mirrored;
  judgements may not.
- **Every action declares a capability** in the action table.
- **Ledger first**, then derived values.
- **Every value from `tokens.css`.** No raw hex, no magic pixels.
- **Mobile-first.** `min-width` queries only.
- **Comment *why*, not *what*.**
- **No phase built ahead.** Raise architectural changes before making them.
- **No emojis. SVG charts only.** Both locked.
- **Behaviour is frozen.** `FINAL_PRODUCT_DECISIONS.md` §3 lists the fifteen
  areas that must not change without explicit owner approval.
