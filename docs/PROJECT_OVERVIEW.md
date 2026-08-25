# Flow Tribe — Project Overview

> ## ⚠️ Read [`FINAL_PRODUCT_DECISIONS.md`](FINAL_PRODUCT_DECISIONS.md) first
>
> It is **binding** and governs every other document, including this one.
>
> **The implementation is the source of truth for how Flow Tribe *works*.
> The three `.docx` design documents are the source of truth for how it
> *looks* — and nothing more.**
>
> Where a design document contradicts the build, **the build wins** and the
> conflict is already resolved in `FINAL_PRODUCT_DECISIONS.md` §5. Do not
> re-open it.
>
> The design documents must never be recreated, rewritten, or replaced:
> `Flow-Tribe-Design-System.docx`, `Flow-Tribe-UI-Design-Specification.docx`,
> `Flow-Tribe-UI-Spec-Screens-7-15.docx`.

---

# Project Vision

**Flow Tribe is the Duolingo of content creation with the visual polish of
Notion and the warmth of a close-knit creative community.**

This is the north star. Where several design, UX, or engineering options are
valid, choose the one that best serves it.

Flow Tribe must never feel like a spreadsheet wrapped in a web interface. It
should feel like a product people genuinely enjoy opening every day.

## Product personality

| It should feel | Not |
|---|---|
| Encouraging | Demanding |
| Premium | Flashy |
| Human | Corporate |
| Calm | Noisy |
| Motivating | Competitive |
| Community-first | Leaderboard-first |

Members progress *alongside* other creators, not *against* them.

## The emotional journey

```
"I can do this."
      ↓
"I'm making progress."
      ↓
"I'm becoming consistent."
      ↓
"I'm part of something bigger."
```

Every feature should reinforce at least one of these.

## The decision filter

Every product, design, and engineering decision passes these five questions.
Any "no" means rethink it.

1. Does this help members create more consistently?
2. Does this make members want to return tomorrow?
3. Does this strengthen the sense of community?
4. Does this make Flow Tribe feel premium?
5. Is this the simplest experience possible?

## The four principles

| Principle | Meaning |
|---|---|
| **Create** | Make it effortless to publish and log content |
| **Track** | Make consistency visible — rings, calendars, streaks, statistics |
| **Celebrate** | Reward progress through milestones, recognition, Flow Levels |
| **Belong** | Strengthen community through recognition and shared progress |

---

# Product Overview

Flow Tribe is a **content accountability platform** for a private, invite-only
community of creators. Members commit to publishing on one platform at a chosen
weekly cadence, log each post, and see their consistency made visible.

This is **Version 2**, a complete rebuild. Version 1 lives in the parent folder
as read-only reference and is still running. v2 launches with an **empty
database** — there is no migration; everyone registers fresh.

## What replaced what

| v1 | v2 |
|---|---|
| Two standalone HTML files, all CSS/JS inlined | Component library, design tokens, two SPA shells |
| Backend pasted into three markdown guides | 20 version-controlled files, layered |
| Free-text name as identity | `MemberID` key · unique username · duplicable display name |
| 4-digit PIN in a spreadsheet column, sent in a URL | 6-digit PIN, salted + peppered hash, POST only |
| `mode:'no-cors'` — success shown even on failure | Real responses; a failed write is reported as failed |
| No auth, no tests, dashboards capped at 30 members | Sessions, capabilities, 101 automated checks, no cap |

---

# Goals & Objectives

## Product goals

1. **Make consistency visible** — a member should understand their standing
   before reading a single number.
2. **Make logging effortless** — under ten seconds, one field.
3. **Celebrate progress, not perfection** — never punish a missed day.
4. **Make the community felt** — recognition that includes rather than ranks.
5. **Be genuinely enjoyable to open daily.**

## Business goals

Carried from v1's launch plan.

| Metric | Floor | Target | Stretch |
|---|---|---|---|
| Founding members | 25–30 | 50 | 60+ |
| Activation (first post within a week) | 60% | 80% | 90% |
| Weekly consistency (hitting goal) | 50% | 65% | 80% |
| Paid conversion | ~15 | ~25 | all 50 |

Price point ₦1,000/month. **This constrains engineering**: the operating cost
must be effectively zero, which is why Google Sheets and Apps Script were
chosen and remain correct.

---

# Target Users

## Primary — the FlowMate

Nigerian creators, solopreneurs, and professionals building an audience on one
social platform. Mobile-first, often on metered data. Not technical. They join
because consistency alone is hard and a witnessed commitment is easier to keep.

**Chief frustration:** starting strong, going quiet after two weeks, feeling
guilty, avoiding the app entirely. **Every design decision guards against the
last step in that chain.**

## Secondary — the Community Manager

Runs the community day to day: onboards members, posts the weekly leaderboard,
picks FlowMate of the Week, nudges anyone who has gone quiet. Needs speed and
clarity, not configuration. **Is also a member** with their own streak.

## Tertiary — the Super Admin (the founder)

Owns the community. Everything a Community Manager can do, plus roles,
settings, deletions, and the audit log.

---

# User Personas

### Amaka — "the restarter"
32, marketing consultant, posts on LinkedIn. Has started four times. Chooses
**3 posts a week** because it is the only number she believes she can keep.

*What she needs:* a goal she can hit; a calendar showing she is doing better
than she remembers; never to be told she failed.
*What would lose her:* a "0-day streak" on a Monday morning.

### David — "the builder"
26, designer, posts daily on X. Wants scale and standing. Chooses **Daily**.

*What he needs:* the leaderboard, streaks, milestones with real weight.
*What would lose him:* milestones that arrive too easily.

### Tunde — "the quiet one"
41, consultant, posts on Instagram. Rarely comments, reads everything.

*What he needs:* progress visible without any social exposure; consent before
his name appears anywhere public.
*What would lose him:* being displayed in a "least active" list.

### Iyanu — "the founder"
Runs the community while creating her own content. Little time.

*What she needs:* the weekly leaderboard in one place, who has gone quiet, a
shoutout candidate, and PIN resets she can do in two taps.
*What would lose her:* anything requiring a developer.

---

# Core Features

## Member

| Feature | Behaviour |
|---|---|
| **Invite-gated registration** | Three steps. Single-use code, 14-day expiry |
| **Username + 6-digit PIN login** | Sessions persist 30 days |
| **Dashboard** | One call. Greeting, ring, calendar, milestones, stats, leaderboard, recent activity, CTA |
| **Weekly Progress Ring** | Posts vs. chosen goal. Green at goal |
| **Activity Calendar** | 26-week heatmap. Today marked. Tap/hover for date and count |
| **Submit Post** | One field. Platform comes from registration |
| **Milestones** | 16 across 5 categories. Gallery, progress, celebration modal |
| **Flow Levels** | 6 identity levels. Requires posts **and** goal weeks |
| **Leaderboard** | Week, month, all-time. Zero-post members are absent, not last |
| **Profile** | Details, stats, calendar, milestones |

## Admin

Community Overview · Member Management · Submission Management · Leaderboard
(read-only) · Analytics (7 SVG charts) · Invite Codes · Settings (Super Admin)
· Audit Log (Super Admin).

---

# Member Workflow

```
Receives invite code (WhatsApp)
      ↓
Registers — 3 steps, ~90 seconds
   1. Full name · username (live availability) · 6-digit PIN ×2
   2. Platform · weekly goal (3 / 5 / Daily)
   3. Invite code · feature consent
      ↓
Welcome screen → "Founding Member" unlocked
      ↓
DAILY LOOP
   Publishes on their platform
      ↓
   Opens Flow Tribe → dashboard shows the week so far
      ↓
   Taps "Submit Today's Post" → pastes link → submits
      ↓
   Server validates: URL · platform match · not duplicate · under cap
      ↓
   Success animation. Ring, calendar, streak, level update immediately
      ↓
   Any milestone unlocked → celebration modal
      ↓
WEEKLY
   Monday 00:05 — week closes, ranks freeze, streaks update
   Top 10 / Weekly Champion awarded on settled numbers
```

**The loop is the product.** Everything else supports it.

---

# Administrator Workflow

```
DAILY (~2 min)      Overview → posts today, who is behind
WEEKLY (~15 min)    Leaderboard → screenshot for the group
                    Pick FlowMate of the Week (consented members only)
                    Nudge anyone quiet
AS NEEDED           Generate invite codes for new members
                    Reset a forgotten PIN
                    Suspend / reactivate
                    Void a mistaken submission
MONTHLY             Analytics → growth, platform mix, completion rate
                    Make a backup copy of the spreadsheet
```

---

# Business Rules

**These are load-bearing. Changing one changes the product.**

## Weeks and days

| Rule | Value |
|---|---|
| Week starts | **Monday 00:00, Africa/Lagos** |
| Day boundary | Midnight, Africa/Lagos |
| Timezone source | Server only — the browser clock is never trusted |

## Goals and streaks

- Weekly goal is **3, 5, or 7**, chosen at registration.
- **Goal met** = posts in the week ≥ goal.
- **Perfect Week** = goal met **AND** distinct days ≥ goal.
  Three posts on one Saturday meets the goal; it is **not** a Perfect Week.
- **Streak = consecutive weeks with the goal met.** Week-based, not day-based.
- **The current week never breaks a streak** — it only extends it. A member on
  Monday morning has not failed anything.
- `GoalAtSubmission` is frozen per row, so changing a goal never rewrites
  history.
- **Only the week streak is displayed.** A day streak shown to a 3-post member
  would read "1" permanently.

## Submissions

- Link must parse as a URL.
- Host must match the member's registered platform by **registrable domain
  suffix** — `notlinkedin.com` and `linkedin.com.evil.co` are rejected.
- **Platform is never accepted from the client.**
- Same normalised link by the same member within **30 days** is rejected.
  Tracking parameters and fragments are stripped first.
- Soft cap of **10 posts per member per day**.
- Cross-member duplicates are allowed.
- Submissions are **never deleted** — voided only.

## Identity

- `MemberID` (`FT-0001`) is the immutable key.
- `Username` is unique, casefolded, **admin-editable only**.
- `FullName` is display-only and freely duplicable.
- PIN is exactly 6 digits; repeats, sequences, and common PINs rejected.

## Milestones

- **Active days**, not consecutive days (7 / 30 / 100).
- **Never revoked**, even if a definition later changes.
- Never awarded twice.
- Top 10 and Weekly Champion settle only at week close.
- Founding Member: joined before a configurable cutoff date.

## Flow Levels

Both thresholds required — posts **and** perfect weeks. Posts alone rewards a
burst; weeks alone rewards the calendar passing.

| Level | Posts | Perfect weeks |
|---|---|---|
| Seedling | 0 | 0 |
| Creator | 10 | 0 |
| Builder | 40 | 2 |
| Consistent Creator | 100 | 6 |
| Community Leader | 250 | 12 |
| Tribe Legend | 500 | 24 |

## Leaderboard

- Zero posts in scope → **absent from the list**, never ranked last.
- Ties share a rank; the next rank skips.
- `unrankedCount` is a number, never a list of names.
- **No manual score editing exists anywhere.**

## Community

- Registration requires a valid, unused, unexpired invite code.
- Invite codes are single-use, 14-day default expiry.
- Feature consent defaults to **false**; shoutout lists filter on it.
- Only active members appear on leaderboards.

---

# Functional Requirements

| # | Requirement | Status |
|---|---|---|
| F1 | Invite-gated registration with unique username | ✅ |
| F2 | Username + PIN authentication | ✅ |
| F3 | 30-day sessions, revocable | ✅ |
| F4 | Three roles with capability-based permissions | ✅ |
| F5 | One-call dashboard | ✅ |
| F6 | Post submission with full validation | ✅ |
| F7 | Weekly goal tracking and week streaks | ✅ |
| F8 | Activity calendar | ✅ |
| F9 | 16 milestones, automatic unlock | ✅ |
| F10 | 6 Flow Levels | ✅ |
| F11 | Leaderboard, 3 scopes, 3 sorts | ✅ |
| F12 | Profile with stats and history | ✅ |
| F13 | Admin: overview, members, submissions, leaderboard, analytics, invites, settings, audit | ✅ |
| F14 | Notifications outbox | ✅ written, no delivery |
| F15 | Self-healing data integrity | ✅ |
| F16 | Optional Stage 2 profile (WhatsApp, email, bio) | ⚠️ backend only |
| F17 | Member Settings screen | ❌ not built |
| F18 | Forgot-PIN self-service | ❌ admin reset only |

# Non-functional Requirements

| # | Requirement | Status |
|---|---|---|
| N1 | Operating cost ≈ zero | ✅ |
| N2 | Mobile-first, no horizontal scroll at 375px | ✅ verified |
| N3 | Dashboard feels instant | ⚠️ needs live measurement |
| N4 | Submission under 3s | ⚠️ needs live measurement |
| N5 | WCAG AA, keyboard navigable | ✅ built in |
| N6 | No plain-text PINs anywhere | ✅ |
| N7 | Server-side authorisation on every action | ✅ 101 checks |
| N8 | Operator can fix data without a developer | ✅ |
| N9 | Every derived value rebuildable from the ledger | ✅ |
| N10 | No build step | ✅ |
| N11 | Comfortable to ~200 members | ✅ by design |
| N12 | No emojis anywhere in the application | ✅ **locked** |

---

# Success Metrics

**Product health**

| Metric | Target |
|---|---|
| Activation — first post within 7 days | 80% |
| Weekly goal completion | 65% |
| 4-week retention | 70% |
| Median time to log a post | < 30s |

**Two numbers to watch day to day:** members joined, and weekly active
posters.

**Deliberately not tracked:** vanity engagement, time-in-app. Neither serves
consistency.

---

# Product Roadmap

## Shipped — v1.0

Phases 1–8 complete. Design system, member app, admin dashboard, backend,
deployment tooling, and the approved visual design. 101 automated checks
passing.

## Next — launch

1. Deploy to a real spreadsheet ([`deployment.md`](deployment.md))
2. Work [`production-checklist.md`](production-checklist.md)
3. Brand & Content Pass — replace placeholder copy
4. Seed founding cohort invite codes

## Deferred, with seams already in place

Profile photos · email/WhatsApp notification delivery · badges beyond
milestones · monthly challenges · announcements · paid tiers · mobile app ·
secret and seasonal milestones · shareable milestone cards.

**Explicitly out of scope:** payment processing (a Paystack link is enough),
Telegram bot, member-to-member social features.

---

# Current Project Status

**Feature complete for v1. Not yet deployed.**

| Layer | Status |
|---|---|
| Design system | ✅ Complete — approved visual design applied (Phase 8) |
| Member app (10 screens) | ✅ Complete |
| Admin dashboard (9 screens) | ✅ Complete |
| Backend (38 actions) | ✅ Complete |
| Automated verification | ✅ 101/101 passing |
| Deployment tooling | ✅ Complete |
| **Live deployment** | ❌ **Not done** |
| Brand & content pass | ❌ Not started |

Everything verified so far ran against an in-memory fake of Google's APIs.
That proves *our* code. It does not prove Apps Script's runtime, real latency,
or the deployment configuration.

---

# Remaining Product Work

## Blocking launch

1. **Deploy and run the production smoke test** — 30 minutes. The only
   blocking item.
2. **Brand & Content Pass** — all member-facing copy.

✅ The **Visual Design Pass** is complete. Colours, typography, tokens, icons,
illustrations, the desktop sidebar, and motion are applied. Decisions are
recorded in [`FINAL_PRODUCT_DECISIONS.md`](FINAL_PRODUCT_DECISIONS.md) §8.

## Not blocking

Member Settings screen · profile photos · notification delivery · self-service
PIN recovery.

## Explicitly deferred by decision

Everything in [`FINAL_PRODUCT_DECISIONS.md`](FINAL_PRODUCT_DECISIONS.md) §5 —
email/password auth, daily streaks, per-submission platform choice, extra
platforms, title and reflection fields, moderation queue, export, and the
screens specified in the design documents but not built.

**These are backlog, not defects.** Each was decided deliberately. Do not build
any of them without explicit owner approval.
