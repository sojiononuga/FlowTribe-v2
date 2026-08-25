# Flow Tribe — Engineering

Everything needed to continue development. Written so another engineer can pick
this up cold.

> ## ⚠️ [`FINAL_PRODUCT_DECISIONS.md`](FINAL_PRODUCT_DECISIONS.md) governs
>
> **Everything documented below is FROZEN.** Architecture, auth, RBAC, schema,
> API contracts, backend logic, frontend behaviour, and navigation flow are the
> source of truth and must not be changed or refactored without explicit owner
> approval.
>
> The three `.docx` design documents are authoritative for **visual design
> only** — colours, typography, tokens, spacing, radius, shadows, icons,
> illustrations, animations, responsive polish.
>
> Where a design document describes different *behaviour*, **this document
> wins**. Those conflicts are already resolved and closed in
> `FINAL_PRODUCT_DECISIONS.md` §5.

> **Related docs.** [`PROJECT_OVERVIEW.md`](PROJECT_OVERVIEW.md) ·
> [`CURRENT_STATE.md`](CURRENT_STATE.md) · [`deployment.md`](deployment.md) ·
> [`security-review.md`](security-review.md) ·
> [`data-dictionary.md`](data-dictionary.md) · [`decisions.md`](decisions.md)

---

# Architecture

```
┌──────────────────────────────────────────────────────────┐
│  STATIC FRONT END  (Netlify — no build step)             │
│                                                          │
│  index.html  →  src/main.js   member SPA  (10 screens)   │
│  admin.html  →  src/admin.js  admin SPA   (9 screens)    │
│  gallery.html                 component gallery (dev)    │
│                                                          │
│  Vanilla ES modules · hash router · lazy-loaded views     │
└────────────────────────┬─────────────────────────────────┘
                         │  POST, text/plain carrying JSON
                         │  session token in the body
┌────────────────────────▼─────────────────────────────────┐
│  GOOGLE APPS SCRIPT  (one doPost entry point)            │
│                                                          │
│  Router → Middleware → Controller → Orchestrator →       │
│           Service → Repository → SheetClient             │
│                         ↓                                │
│                    lib/  (pure, testable, no APIs)       │
└────────────────────────┬─────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────┐
│  GOOGLE SHEETS  — 14 tabs                                │
│  Submissions is the ledger. Everything else is derived   │
│  and can be rebuilt from it.                             │
└──────────────────────────────────────────────────────────┘
```

## The five constraints that shaped everything

Every structural decision traces to one of these. If you are wondering "why is
it done this way", the answer is almost always here.

| Constraint | Consequence |
|---|---|
| Cost must be ≈ zero (₦1,000/mo product) | Sheets + Apps Script, not a real database |
| The operator is not a developer | Data must be readable and fixable in a spreadsheet |
| Apps Script has **no module system** | 20 files share one global scope, loaded alphabetically |
| Apps Script gives **two entry points**, no paths | The action name in the body does the routing |
| Deployment must be `ANYONE_ANONYMOUS` | **There is no network boundary.** Authorisation is entirely application code |

## Layering and dependency direction

```
Router → Middleware → Controller → Orchestrator → Service → Repository → Sheets
                                        ↓             ↓
                                      lib/  (pure — depends on nothing)
```

Rules, enforced by review:

- A controller never touches a repository. It calls orchestrators or services.
- A service never touches a sheet. It calls repositories.
- A repository never calls a service. It maps rows to objects and back.
- `lib/` imports nothing and is imported by everything.
- Only `infra/` names a Google API.

**Why the repository boundary earns its ceremony:** it is the store-swap seam.
If Sheets is outgrown, `Repositories.gs` is rewritten and every other layer is
untouched. That is what makes committing to Sheets a reversible decision.

---

# Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Front end | Vanilla ES modules, no framework | 19 screens, no build step, no toolchain to maintain |
| Styling | Plain CSS with custom properties | Design tokens in one file; no preprocessor |
| Routing | Hash-based, hand-rolled (~200 lines) | Works on any static host with no rewrite rules |
| Charts | **Hand-rolled SVG** | **Locked decision — do not replace with Chart.js or any library** |
| Backend | Google Apps Script (V8) | Free, native Sheets access |
| Database | Google Sheets, 14 tabs | Free, operator-editable |
| Hosting | Netlify Drop (or any static host) | Free, drag-and-drop |
| Tests | Custom browser harness + in-memory Google fakes | No Node available on the dev machine |

**Zero runtime dependencies.** No npm packages ship. No `node_modules` in
production. Nothing to `npm install` before making a change.

---

# Folder Structure

```
FlowTribe-v2/
├── index.html                 Member app shell
├── admin.html                 Admin app shell
├── gallery.html               Component gallery (dev tool)
│
├── src/
│   ├── main.js                Member entry: session → shell → router
│   ├── admin.js               Admin entry: guard → nav → router
│   ├── gallery.js             Gallery (dev only)
│   │
│   ├── core/                  The ~1,400-line framework substitute
│   │   ├── dom.js               el() · svg() · icon() · on() · trapFocus()
│   │   ├── component.js         The component contract
│   │   ├── store.js             Observable state
│   │   ├── router.js            Hash router, guards, lazy views
│   │   ├── api.js               THE ONLY FILE THAT CALLS fetch()
│   │   ├── session.js           Token storage, expiry, cross-tab sync
│   │   ├── errors.js            AppError + the code taxonomy
│   │   ├── config.js            git-ignored — holds the deployment URL
│   │   └── config.example.js    Committed template
│   │
│   ├── components/
│   │   ├── ui/                  button · field · input · pin-input · select
│   │   │                        modal · toast · primitives (card, badge,
│   │   │                        avatar, spinner, skeleton, empty, switch)
│   │   ├── brand/               logo · progress-ring · stat-card
│   │   │                        success-burst · activity-calendar · milestone
│   │   ├── layout/              app-shell · top-bar · bottom-nav (sidebar at
│   │   │                        ≥1024px) · page-header · section · mode-switch
│   │   ├── charts/              Hand-rolled SVG renderer behind an adapter
│   │   └── data/                Admin table, filters, pagination
│   │
│   ├── features/                One folder per screen
│   │   ├── auth/                login · register · welcome
│   │   ├── dashboard/           dashboard
│   │   ├── submit/              submit
│   │   ├── leaderboard/         leaderboard
│   │   ├── milestones/          milestones + celebration modal
│   │   ├── levels/              levels
│   │   ├── profile/             profile
│   │   └── admin/               overview · members · member-detail
│   │                            submissions · leaderboard · analytics
│   │                            invites · settings · audit · shared
│   │
│   ├── lib/                     format · validators · platforms
│   │                            icons · illustrations · catalog
│   └── app/navigation.js        Router registry, so views can navigate
│
├── styles/                    12 files, loaded as separate <link> tags
│   ├── tokens.css               EVERY colour, space, radius, shadow, duration,
│   │                            icon size, and the sidebar width
│   ├── fonts.css                Self-hosted Satoshi + Inter @font-face
│   ├── reset.css   base.css   animations.css   utilities.css
│   └── components-{ui,brand,layout,calendar,views,admin}.css
│                                ⚠️ gallery.html omits components-admin.css
│
├── appsscript/                20 files, 7,600 lines
│   ├── 00_Config.gs             Sheet names, column maps, enums, defaults
│   ├── 01_Errors.gs             AppError, ERROR_MESSAGES
│   ├── 02_Envelope.gs           Request parse, response shape, logging
│   ├── 03_Router.gs             doPost, the ACTION TABLE, dispatch
│   ├── lib/                     PURE — FtWeek · FtDayMap · FtStreak
│   │                            FtLink · FtIdentity · FtAchievements
│   ├── infra/Infra.gs           SheetClient · CacheClient · LockClient
│   │                            Crypto · Ids · Logger_
│   ├── repositories/            14 repositories, one per sheet
│   ├── services/                CoreServices + DomainServices
│   ├── middleware/              Validate · RateLimit · Authenticate
│   │                            PinGate · Authorize · CAPABILITIES
│   ├── orchestrators/           Pipeline · RegistrationFlow · LoginFlow
│   │                            SubmissionFlow · WeekCloseFlow
│   ├── controllers/             Auth · Member · Profile · Submission
│   │                            Leaderboard · Admin
│   ├── jobs/Jobs.gs             Reconcile + 6 trigger entry points
│   └── setup/                   Setup.gs · SmokeTest.gs
│
├── tests/
│   ├── backend.html             Harness — open in a browser
│   ├── backend-suite.js         102 checks across 14 groups. Loaded as a
│   │                            MODULE so it can import the real icon set
│   ├── journeys.html            E2E: the REAL views against the REAL backend
│   ├── journeys-suite.js        16 journeys. fetch routed into doPost; a
│   │                            router shim mounts the same modules main.js
│   │                            registers. Fails on an error state
│   ├── index.html / suite.js    Earlier pure-business-logic suite, kept as
│   │                            reference. backend.html is the gate
│   └── fakes/GoogleFakes.js     In-memory SpreadsheetApp, CacheService,
│                                LockService, PropertiesService, real SHA-256
│
├── scripts/serve.ps1          Static dev server (no Node/Python on this machine)
├── assets/                    images · icons · fonts · vendor
└── docs/                      20 markdown documents
```

---

# Frontend Architecture

## The component contract

The whole convention, and it fits in a paragraph:

> **A component is a function that takes props and returns an `HTMLElement`.**

```js
export function Badge({ label, tone = 'neutral' }) {
  return el('span', { class: `ft-badge ft-badge--${tone}`, text: label });
}
```

A component that changes after creation attaches `update`. One that owns
listeners attaches `destroy`. `stateful()` wires both and tracks teardown:

```js
export function Counter(props) {
  const node = el('span', { text: props.count });
  return stateful(node, {
    update: (next) => { node.textContent = next.count; },
    cleanups: [on(window, 'resize', handleResize)],
  });
}
```

### Three rules that keep it from becoming a framework

1. **A component never fetches.** Props in, callbacks out. Otherwise business
   logic moves into the UI.
2. **A component never reads the store.** Views wire the store to components.
3. **Text goes through `text:` / `textContent`. Never `innerHTML`.**

## Why never `innerHTML`

This is a **security rule**, not a style preference.

Session tokens live in `localStorage`, readable by any script on the origin. So
the app's safety rests on having no XSS. Full names, usernames, bios, and links
are member-controlled and render on **admin** screens, where a payload would
execute with an administrator's session.

Routing every string through `textContent` makes that bug class *structurally
impossible* rather than merely absent. `el()` does this by construction:
strings become text nodes, always.

## Routing

Hash-based (`#/dashboard`), because the app is served as static files. A
path-based router needs host rewrite rules — one more thing to configure
correctly and get wrong.

Views load via dynamic `import()`, so a screen's code arrives when first
visited. Guards run **before** the module is fetched, so a redirect never pays
to download a screen it will not show.

**Guards are UX, not security.** They stop someone landing on a screen that
would render empty. Every action is authorised server-side regardless.

## State management

Deliberately minimal. There is no global store for view data.

| State | Where |
|---|---|
| Session (token, member, capabilities) | `core/session.js` — a `createStore` observable, mirrored to `localStorage`, synced across tabs via the `storage` event |
| Screen data | Local to the view function. Fetched on mount, held in closure |
| Component state | Inside the component, via `stateful()` |

**Why no global data store:** every screen loads its own data in one call and
owns it. A cache layer would add invalidation bugs for no benefit at this size.
The server already caches for 60 seconds.

---

# Backend Architecture

## Load order — the rule that breaks Apps Script projects

Apps Script concatenates every file into **one global scope**, alphabetically
by name. There is no import graph.

> **Nothing may run at the top level of a file except declarations.**

A file that calls `SettingsService.get()` at load time fails unpredictably
depending on where it sorts. Every module is an IIFE that only *defines*
functions; nothing executes until called.

Numeric prefixes (`00_`, `01_`, `02_`, `03_`) make the order that matters
explicit.

## Naming conventions

| Thing | Convention | Example |
|---|---|---|
| Modules | PascalCase object | `MemberService.findById()` |
| Private functions | Trailing underscore | `dispatch_()`, `fail_()` |
| Pure libs | `Ft` prefix | `FtWeek`, `FtDayMap` |
| Column maps | Short uppercase | `M.PIN_HASH`, `S.WEEK_START` |
| CSS classes | `ft-block__element--modifier` | `ft-stat__value--empty` |
| CSS variables | `--ft-category-name` | `--ft-burgundy-600` |

The `ft-` prefix everywhere means a copied snippet or future third-party
stylesheet cannot collide.

## The orchestration layer

Added after the Phase 3 review found `SubmissionService` coordinating seven
collaborators inside one method. Flows are now **explicit step lists** run by
`Pipeline`:

```js
Pipeline.run('submission', [
  { name: 'appendLedger',      run: (ctx) => { … } },
  { name: 'updateCalendar',    run: (ctx) => { … } },
  { name: 'updateWeeklyStats', run: (ctx) => { … } },
  { name: 'updateCounters',    run: (ctx) => { … } },
  { name: 'evaluateMilestones',run: (ctx) => { … } },
  { name: 'evaluateLevel',     run: (ctx) => { … } },
  { name: 'invalidateCaches',  run: (ctx) => { … } },
], context);
```

Order is declared rather than implied. Each step is individually replaceable.
Per-step timing comes free. A future celebration feature is a list entry, not a
longer method.

---

# Google Apps Script Architecture

## The submission transaction — the busiest path

```
VALIDATE  (outside the lock — most failures happen here, and a rejected
           duplicate should neither wait on nor hold a lock)
  URL parses → platform matches → not a duplicate → under daily cap

LOCK (LockService, per member)
  1  Append to Submissions        ← LEDGER FIRST
  2  Update the day map            one character
  3  Update weekly stats           count, distinct days, goalMet
  4  Update member counters        ONE batched write
  5  Evaluate milestones
  6  Evaluate Flow Level
  7  Invalidate caches
UNLOCK

RETURN { submission, stats, newMilestones[], levelUp? }
```

**Why the ledger is written first.** If a later step fails, the fact exists and
the rollups lag — a `ROLLUP_PENDING` audit row lets the 15-minute repair job
close the gap. The reverse order would produce counters describing a post that
does not exist.

**Why counters are one batched write.** Each separate `setValues` is a round
trip at 100–300 ms. Four of them is the difference between a 1-second and a
3-second response on the path a member is actively waiting on.

**Why stats come back in the same response.** This is what makes "the dashboard
updates immediately" true rather than probable. v1 waited on a 1300 ms
`setTimeout` and hoped.

## Background jobs

| Job | When | Purpose | Recovery |
|---|---|---|---|
| `jobWeeklyRollover` | Mon 00:05 | Freeze ranks, award Top 10 / Weekly Champion, update streaks | Idempotent by `weekStart` |
| `jobNightlyReconcile` | 01:00 | Rebuild every derived value from the ledger | **Cursor-based and resumable** |
| `jobRollupRepair` | every 15 min | Repair members marked `ROLLUP_PENDING` | Retries indefinitely |
| `jobSessionSweep` | 02:00 | Delete expired sessions | Stateless |
| `jobInviteExpiry` | 02:15 | Mark stale codes expired | Cosmetic — redemption also checks |
| `jobDailyRollup` | 23:00 | Snapshot daily numbers to `CommunityStats` | Missing point in a chart |

**Why the rollover runs after the boundary, not on it.** A member on Monday
morning has zero posts. Evaluating streaks at midnight would reset every streak
in the community every week. A streak breaks when a week *closes* unmet.

**Why the reconcile is resumable from day one.** Apps Script terminates at six
minutes with no warning. A truncated reconcile leaves some members repaired and
others not, **with no signal** — the worst kind of failure, because it is
invisible.

---

# HTML Frontend Integration

## The transport, and three non-obvious decisions

| Decision | Reason |
|---|---|
| `POST` only | v1 sent PINs in GET query strings — into browser history, referrer headers, and execution logs |
| `Content-Type: text/plain` carrying JSON | **Looks wrong, is deliberate.** `application/json` makes the request non-simple → CORS preflight → Apps Script does not answer `OPTIONS` → the request dies. `text/plain` stays a simple request |
| **Not** `mode: 'no-cors'` | v1 used it, making every response opaque. Members saw a success tick for posts that were never written |
| `redirect: 'follow'` | Apps Script 302s to `googleusercontent.com`, which serves the actual payload |
| Every response is HTTP 200 | Apps Script cannot set status codes, and its own errors are HTML. Status lives in the envelope's `ok` flag |

## Envelope

```jsonc
// request
{ "action": "submission.create", "token": "…", "payload": {…},
  "requestId": "uuid", "clientVersion": "2.0.0" }

// success
{ "ok": true, "data": {…}, "meta": { "serverTime": "…", "sessionExpiresAt": "…" } }

// failure
{ "ok": false, "error": { "code": "DUPLICATE_LINK",
                          "message": "You've already logged this post.",
                          "field": "link" } }
```

`message` is member-facing copy already in the brand voice and is displayed
verbatim.

## `src/core/api.js` is the only file that calls `fetch`

It attaches the token, unwraps the envelope, throws typed `AppError`s, retries
**once** on transport failure only, and raises two window events handled
globally in `main.js` / `admin.js`:

- `flowtribe:session-expired` → clear session, route to login
- `flowtribe:must-change-pin` → route to the PIN change screen

Never retries a business failure — a rejected PIN fails identically the second
time and wastes the member's time.

---

# Authentication Flow

## Registration (invite-gated, 3 steps)

```
Cheap validation OUTSIDE the lock
  username format · PIN policy · PIN match · name · platform · goal
        ↓
┌── LockService.withLock('registration') ────────────────┐
│  1  Invite exists? unused? unexpired?                  │
│  2  UsernameKey free?                                  │
│  3  Insert member  (Role ALWAYS 'Member')              │
│  4  Mark invite used                                   │
│  5  Seed calendar year                                 │
│  6  Evaluate milestones → Founding Member              │
└────────────────────────────────────────────────────────┘
        ↓
Create session (outside the lock — no contended state)
```

**Why one lock covers steps 1–4.** Two check-then-act races live here: the same
code redeemed twice, and the same username claimed twice. Sheets has no unique
constraints, so the lock is the only thing preventing a duplicate. Grouping
them also means **a failed registration never burns a valid code**.

**`Role` is never read from the payload.** If registration accepted a role,
anyone with an invite could create a Super Admin.

## Login

```
Look up by UsernameKey
  not found → hash anyway against a throwaway salt, then AUTH_FAILED
              (equal timing — otherwise response time reveals valid usernames)
Throttle check (exponential backoff)      → ACCOUNT_LOCKED
Status check                              → ACCOUNT_INACTIVE
Constant-time PIN compare                 → AUTH_FAILED, record failure
Success → clear failures, create session
```

`AUTH_FAILED` is **identical** for an unknown username and a wrong PIN. The
distinction hands an attacker a list of valid usernames.

## PIN hashing

```
stored = iterate( HMAC-SHA256(pin + salt, pepper), 600 )
```

| Element | Location |
|---|---|
| Plain PIN | Nowhere — never stored, logged, or returned |
| Salt | `Members.PinSalt`, 16 random bytes per member |
| **Pepper** | **`PropertiesService`** — never in a sheet, never in the repo |

Apps Script offers no bcrypt/scrypt/Argon2 — only SHA-family digests and HMAC.
This is the strongest construction available.

**The pepper matters most.** Salt and iteration slow someone who already has
the hashes; the pepper means having them is not enough — and a leaked
spreadsheet is by far the likeliest way they would be obtained.

## Sessions

| Property | Value |
|---|---|
| Token | 256-bit random, opaque |
| Server storage | **SHA-256 hash only** |
| Client storage | `localStorage` |
| Absolute expiry | 30 days |
| Idle expiry | 14 days |
| `LastSeenAt` write | Throttled to once per 5 min |

**Why a session table and not a signed self-contained token.** A signed token
cannot be revoked. Suspension, PIN reset, and demotion must all terminate
sessions *now*. The usual workaround is a revocation denylist — which is a
session table with extra steps.

---

# Authorization (Roles & Permissions)

## Capabilities, never role comparisons

Code asks *"does this session hold `member:delete`?"* — never *"is this role
`SuperAdmin`?"* A fourth role becomes one entry in `CAPABILITIES` and zero
changes elsewhere. Scattered `if (role === …)` checks are where privilege bugs
live.

| Capability group | Member | Community Manager | Super Admin |
|---|:--:|:--:|:--:|
| `dashboard:self`, `submission:create`, `leaderboard:read`, `profile:*:self`, `pin:update:self` | ✅ | ✅ | ✅ |
| `admin:overview:read`, `member:read:all`, `member:update`, `member:status:set`, `member:pin:reset`, `submission:read:all`, `submission:void`, `analytics:read`, `invite:*`, `settings:read` | ❌ | ✅ | ✅ |
| `member:delete`, `member:role:set`, `settings:update`, `audit:read` | ❌ | ❌ | ✅ |

**Community Managers hold every Member capability** — they are members with
their own streaks, and the "My Dashboard" switch takes them there.

## The enforcement chain

```
1. Validate    payload shape                   → VALIDATION_FAILED
2. RateLimit   BEFORE auth                     → RATE_LIMITED
3. Authenticate token → session → member       → SESSION_EXPIRED
4. PinGate     MustChangePin set?              → MUST_CHANGE_PIN
5. Authorize   capability vs. FRESH role       → FORBIDDEN
6. Controller
7. Audit       if anything mutated
```

**Rate limiting before authentication** is deliberate: verifying a PIN runs an
iterated hash. An attacker who could force that work before being throttled has
a DoS vector.

**The role is re-read from `Members` every request.** `Sessions.Role` is a
diagnostic snapshot, never an authorisation input. A demotion takes effect on
the very next request.

**Scope cannot be tampered with.** Member-scoped actions derive the target from
the session. There is no payload field in which to ask for someone else's data.

## Invariants no UI can express

Enforced in the service/controller layer, not the interface:

1. **No self-escalation** — `setRole` refuses when actor equals target.
2. **The last Super Admin is protected** — any change leaving zero is refused.
   Without this one misclick locks everyone out permanently.
3. **Deletion refuses with history** — deactivation offered instead.
4. **`MustChangePin` blocks everything** but the change and logout. An admin who
   resets a PIN knows the temporary value.

---

# Database Schema

14 tabs. Full field-level detail in [`data-dictionary.md`](data-dictionary.md).

| Sheet | Purpose | Growth |
|---|---|---|
| `Members` | Identity, credentials, materialised counters. **Hot** — read every request | ~60 rows |
| `Profiles` | Stage 2 optional PII. **Cold** | ~60 rows |
| `InviteCodes` | Single-use registration codes | low hundreds |
| `Sessions` | Active sessions, hashed ids | swept nightly |
| `Submissions` | **THE LEDGER — append-only, the only source of truth** | ~800/month |
| `ActivityCalendar` | Packed 366-char day map per member-year | ~60/year |
| `WeeklyStats` | Per member-week counts, goalMet, RankFinal | ~240/month |
| `MilestoneCatalog` | 16 definitions (data, not code) | static |
| `MemberMilestones` | Unlock records | grows slowly |
| `FlowLevels` | 6 level definitions | static |
| `Settings` | Configurable operational values | ~15 rows |
| `AuditLog` | Append-only action record | grows |
| `Notifications` | Outbox — written, nothing delivers yet | grows |
| `CommunityStats` | Daily rollups for analytics | 365/year |

## Three schema decisions worth understanding

**Identity split three ways.** `MemberID` (immutable key) · `UsernameKey`
(unique credential) · `FullName` (display, duplicable). This removes v1's
deepest flaw, where a free-text name was the join key and a typo silently
forked someone's streak.

**The packed day map.** `ActivityCalendar.DayMap` is a fixed **366-character**
string, one digit per day of the year. Sixty rows carry a year of activity for
the whole community; reading a member's year is one cell, recording a post is
one character. Always 366 regardless of leap year, so index arithmetic never
branches.

⚠️ **The column must be formatted as plain text** or Sheets coerces it to
scientific notation and destroys it. `setupBootstrap` does this.

**`WeekStart` rather than (ISO week, year).** ISO week 1 can contain days from
the previous December and some years have 53 weeks. A Monday date has no New
Year edge cases. `WeekNumber` is stored separately for display only.

## Denormalisation, and why it is safe

`Members` stores `AllTimePosts`, `CurrentWeekStreak`, `LongestWeekStreak`,
`PerfectWeeks`. These are a **cache, never the truth** — recomputed on every
write and rebuilt nightly from `Submissions`.

**Without the reconcile job, storing derived values would be a mistake.** With
it, a hand-edited cell self-heals within a day, and `RollupRepair` closes a
failed write within fifteen minutes.

---

# Data Models

Repositories return domain objects, never raw rows. No layer above ever sees a
column index.

```js
// Member (Repositories.gs → MemberRepo.toDomain)
{ rowIndex, memberId, username, usernameKey, fullName,
  pinHash, pinSalt, platform, weeklyGoal, joinDate,
  status, role, consentFeature, mustChangePin, profileComplete,
  inviteCodeUsed, failedLoginCount, nextAttemptAt,
  allTimePosts, currentWeekStreak, longestWeekStreak, perfectWeeks,
  lastSubmissionDate, flowLevelId, flowLevelAt }

// Submission
{ submissionId, timestamp, memberId, name, username, platform,
  contentLink, linkKey, dayKey, weekStart, weekNumber,
  month, year, goalAtSubmission, status }

// The milestone/level snapshot — the interface between services and lib/
{ allTimePosts, activeDays, goalsMetCount, perfectWeeks,
  currentWeekStreak, longestWeekStreak,
  postsThisWeek, distinctDaysThisWeek, weeklyGoal,
  isFoundingMember, bestRankFinal }
```

⚠️ **The snapshot field names are a contract.** A mismatch does not throw — the
evaluator is skipped and the milestone silently never unlocks. This happened
twice during development. `setupVerify()` now cross-checks catalog IDs against
evaluator IDs in both directions.

---

# API Endpoints

**38 actions.** One `doPost`. Full spec in [`api.md`](api.md).

## Public (exactly 4 — a fifth should require an argument)

`system.health` · `auth.checkUsername` · `auth.register` · `auth.login`

## Member

| Action | Returns |
|---|---|
| `auth.session` `auth.logout` `auth.changePin` | — |
| `member.dashboard` | **Everything in one call** — member, level, week, calendar, milestones, stats, leaderboard, recent |
| `member.profile` | Profile screen in one call |
| `member.submissions` `member.calendar` | Paginated history / calendar range |
| `member.updateConsent` `member.updateName` | — |
| `submission.create` | `{ submission, stats, newMilestones[], levelUp? }` |
| `milestones.list` `milestones.markSeen` `levels.list` | — |
| `leaderboard.get` | `{ entries, rank, unrankedCount }` |
| `profile.get` `profile.update` | Stage 2 fields |

## Admin (17)

`admin.overview` · `admin.analytics` · `admin.members.{list,get,update,setStatus,resetPin,setRole,delete,reconcile}` · `admin.invites.{create,list,revoke}` · `admin.submissions.{list,void}` · `admin.settings.{get,update}` · `admin.audit.list`

**Note:** there is no `admin.members.create`. Member creation is invite-only
by product decision, and the `member:create` grant that gated a handler that
was never written was removed in Phase 9.

---

# Services

| Service | Owns |
|---|---|
| `SettingsService` | Typed, cached, defaulted config accessors |
| `AuditService` | Append audit rows (never throws — an audit failure must not fail the action) |
| `NotificationService` | Enqueue outbox rows |
| `AuthService` | PIN hashing, verification, policy, **exponential backoff** |
| `SessionService` | Create, resolve, slide, revoke |
| `InviteService` | Generate (bulk), validate, redeem, revoke, expire |
| `MemberService` | Public shape, self-service updates, PIN change, counters |
| `ProfileService` | Stage 2 data |
| `CalendarService` | Day map read/write, range slicing, year rebuild |
| `WeeklyStatsService` | Weekly counts, distinct days, week streaks |
| `LeaderboardService` | Ranked standings, resolves level name/icon per row |
| `MilestoneService` | Snapshot building, evaluation, persistence, summary |
| `FlowLevelService` | Level determination and change detection |
| `SubmissionService` | Link validation, dedupe, row building |
| `AnalyticsService` | Overview metrics + 7 chart series |

---

# Utilities

## Pure libraries (`appsscript/lib/` — no Apps Script APIs)

| Module | Responsibility |
|---|---|
| `FtWeek` | Day/week keys, Africa/Lagos boundaries, ISO week numbers |
| `FtDayMap` | Pack/unpack the 366-char map, active-day counting |
| `FtStreak` | Week streaks, competition ranking, `isPerfectWeek` |
| `FtLink` | URL parse, **registrable-domain** platform matching, normalisation |
| `FtIdentity` | Username policy, PIN policy, invite normalisation, backoff curve |
| `FtAchievements` | 16 milestone evaluators + level evaluation |

Each ends with:
```js
if (typeof module !== 'undefined') module.exports = FtWeek;
```
Apps Script has no `module`, so the guard makes the line inert there — while
letting a Node harness require the same file. **This is what makes the streak
and milestone logic testable before it ever meets a spreadsheet.**

## Front-end libraries (`src/lib/`)

`format.js` (dates in the community timezone, pluralisation, initials, URL
shortening) · `validators.js` (**format checks only**) · `platforms.js`
(**display metadata only — deliberately NOT the hostname allowlist**) ·
`icons.js` (inline SVG path data) · `catalog.js` (category order and labels).

### The line that is never crossed

Format checks may be mirrored client-side for instant feedback. **Judgements
may not.** Link-to-platform matching, duplicate detection, streak arithmetic,
milestone evaluation, and ranking are server-only, **because they judge the
member and must not be editable by the person being judged.**

---

# Environment Variables

Apps Script has no `.env`. Configuration lives in **Script Properties**.

| Property | Set by | Purpose |
|---|---|---|
| `FT_PIN_PEPPER` | setup, automatically | **Never change or delete.** Changing it invalidates every PIN |
| `FT_SESSION_KEY` | setup, automatically | Changing it logs everyone out |
| `FT_ADMIN_FULLNAME` / `_USERNAME` / `_PLATFORM` | operator | Founder account |
| `FT_ADMIN_PIN` | operator → **auto-deleted after use** | Founder's first PIN |
| `FT_RECONCILE_CURSOR` | job, automatically | Resume point for a partial reconcile |

## Front-end configuration

`src/core/config.js` — **git-ignored**, copied from `config.example.js`.

Holds `api.baseUrl` (the `/exec` URL), timeouts, `app.timezone`, and client
mirrors of PIN/username rules. **Nothing secret** — the URL is public by
necessity, which is exactly why every action is authorised server-side.

⚠️ `config.app.timezone` **must match** `appsscript.json`'s timezone. A mismatch
means the client and server disagree about which week a Sunday-evening post
belongs to.

---

# Configuration

Operational values live in the `Settings` sheet, so they change without a
deploy: PIN length, hash iterations, max failed attempts, session absolute/idle
days, duplicate window, daily cap, invite expiry and code length, default
weekly goal, calendar weeks, founding-member cutoff, and
`metrics.consistencyScore.enabled` (ships `FALSE` — the metric is **paused**
pending an agreed definition, and is absent from the response rather than
stubbed).

`DEFAULTS` in `00_Config.gs` is the fallback when a row is missing.

---

# Error Handling

## Four classes

| Class | Member sees | Logged |
|---|---|---|
| Validation | The specific message, field highlighted | No |
| Business rule | The specific message | If security-relevant |
| Platform (Sheets timeout, quota) | Generic | Full detail |
| Bug | Generic | Full stack |

## The whole strategy in one line

**An expected failure is a typed `AppError`. An unexpected one is loud in the
log and silent to the member.** Anything reaching the router that is not an
`AppError` is a bug: logged with its stack, returned as `SERVER_ERROR`.

Every generic failure returns the **identical** message, so nothing about
internal structure can be inferred by probing. `error.internal` is logged and
**never serialised** to the client.

## Platform failures

| Failure | Handling |
|---|---|
| Lock timeout | Retry once, then `SERVER_ERROR`. **Never proceed without the lock** |
| Sheets read timeout | One retry — reads are idempotent |
| **Sheets write timeout** | **No blind retry.** Re-read to determine whether it landed. A retried append duplicates a submission |
| Cache unavailable | Fall through to the sheet. Cache is never truth |
| Missing sheet / header mismatch | Fail loudly with an internal message naming `setupBootstrap()` |

## Partial failure in the submission path

Ledger written, later step failed → write a `ROLLUP_PENDING` audit row, return
the submission as the **success it was**, and set `statsSettling: true`. The
client keeps showing previous numbers rather than wrong ones. `RollupRepair`
closes the gap within 15 minutes.

**Telling a member their post failed when it did not is the exact v1 defect
this rebuild exists to eliminate.**

## Recovery hierarchy

1. Nightly reconcile rebuilds everything from the ledger
2. `RollupRepair` every 15 minutes on explicit markers
3. Manual per-member reconcile from the admin UI
4. **The ledger alone can reconstruct every other sheet**

---

# Logging

`Logger_` writes structured lines to the Apps Script execution log:
`Logger_.info/warn/error(scope, message, details)`.

`AuditLog` records: logins and failures, lockouts, registration, PIN changes
and resets, role and status changes, deletions, voided submissions, invite
create/redeem/revoke, settings changes, **admin profile reads**,
`ROLLUP_PENDING`, and job completion.

**Never logged: PINs or tokens in any form, including failures.** A log that
records what someone typed as a wrong PIN is a log of near-miss credentials.

`ActorRole` is on every row, which is why a separate admin log is unnecessary.

---

# Security Considerations

Full review with evidence in [`security-review.md`](security-review.md).

**The central assumption: there is no network boundary.** Everything protecting
this application is application code.

| Control | Implementation |
|---|---|
| PIN storage | Iterated HMAC-SHA256 + per-member salt + server-side pepper |
| PIN comparison | Constant-time |
| Sessions | Opaque 256-bit token, stored hashed, revocable |
| Authorisation | Capability check per action, role re-read every request |
| Rate limiting | Exponential backoff per account (**no IP available**) |
| **Formula injection** | `SheetClient.sanitise` escapes `= + - @` at the write boundary |
| XSS | No `innerHTML` anywhere, architecturally |
| Link validation | Registrable-domain suffix matching |
| Audit | Append-only, credential-free, PII reads logged |

## Accepted residual risks

A 6-digit PIN is not a password · no IP-based limiting (invite-gating
substitutes) · `localStorage` is XSS-readable · an admin can read all PII ·
**spreadsheet sharing is the operator's responsibility and cannot be enforced
in code** · no self-service PIN recovery.

---

# Performance Considerations

| Concern | Mitigation |
|---|---|
| Sheets has no indexes | Full scans of ~60 rows are trivial; aggregates cached 60s |
| Round-trip cost (100–300 ms) | Batched `getValues`/`setValues`; never cell-by-cell |
| Dashboard cold read | One call assembling 6 sources; cached, invalidated on write |
| Ledger growth | Analytics read `CommunityStats` rollups, not the ledger |
| Mobile payload | No framework; views lazy-loaded; admin code never reaches members |
| 6-minute execution ceiling | Reconcile is cursor-based and resumable |

⚠️ **The submission latency budget is estimated, not measured.** Extrapolated
at 1.5–3s from documented platform behaviour. `Pipeline` logs per-step timing,
so the first live run produces real numbers. Agreed fallback if it exceeds 3s:
move milestone and level evaluation out of the lock into a post-commit step.

---

# Deployment Process

Full walkthrough in [`deployment.md`](deployment.md); pre-launch verification in
[`production-checklist.md`](production-checklist.md).

```
1. Create a blank Google Sheet
2. Extensions ▸ Apps Script → paste 20 files (order matters) → replace manifest
3. Script Properties: FT_ADMIN_FULLNAME / _USERNAME / _PIN / _PLATFORM
4. Run setupAll()  → secrets, 14 sheets, catalog, admin, triggers, verify
   Expect: "OK — 14 sheets, 38 actions, secrets set, Super Admin present."
5. Deploy ▸ New deployment ▸ Web app · Execute as Me · Access ANYONE
6. Run setupSmokeTest()  → expect "ALL 27 CHECKS PASSED"
7. config.js ← the /exec URL, then drag the folder to Netlify
```

⚠️ **Updating code is not enough.** You must publish a **new version** of the
existing deployment (`Deploy ▸ Manage deployments ▸ pencil ▸ New version`). A
*new deployment* creates a *new URL* and leaves everyone on old code.

## Local development

```bash
powershell -ExecutionPolicy Bypass -File scripts/serve.ps1
```
Then `http://localhost:5173/` (member), `/admin.html`, `/gallery.html`,
`/tests/backend.html`.

ES modules are subject to CORS — **`file://` will not work**.

---

# Testing Strategy

**Two suites. Run both — they prove different things.**

| Suite | Open | Proves |
|---|---|---|
| **102 checks, 14 groups** | `tests/backend.html` | The backend answers correctly |
| **16 journeys** | `tests/journeys.html` | The real views render those answers correctly |

## How it works

`tests/fakes/GoogleFakes.js` implements in-memory `SpreadsheetApp`,
`CacheService`, `LockService`, `PropertiesService`, `ScriptApp`,
`ContentService`, and a **real SHA-256 / HMAC-SHA256**. The backend loads as
plain `<script>` tags — mirroring how Apps Script concatenates it.

**Every test posts through `doPost`.** Same envelope, middleware chain, and
action table a browser hits. No shortcuts around the request path.

## What it proves

Load and wiring · setup · registration · authentication · authorisation ·
submissions · milestones and levels · dashboard and leaderboard · admin ·
integrity and recovery · **frontend contracts** · admin dashboard ·
**contract drift** · production readiness.

Three techniques worth keeping:

- **The authorisation test is table-driven** — it iterates the action table and
  asserts a Member is refused everything beginning `admin.`. An admin endpoint
  added later without a capability **fails automatically**.
- **The frontend-contract group asserts every field each screen destructures.**
  A shape mismatch does not throw; it renders `undefined` and looks like a
  styling bug. Three such mismatches were found by writing that group.
- **The contract-drift group reads the frontend source over HTTP** and diffs it
  against the live action table. It crawls the real import graph from both
  entry points — static and dynamic, since every screen is lazily imported —
  so a new file is covered the moment something imports it.

### Why the contract-drift group exists

Every finding in the Phase 9 integration audit was invisible to the suite as
it stood: ten endpoints with no caller, three capabilities required by
nothing, one documented endpoint that did not exist, and a PIN-reset flow that
stranded the member. **None of it threw. None of it failed a test.** It was
found by opening files side by side.

The group now fails on:

| Drift | Why it is otherwise silent |
|---|---|
| An action no frontend code calls | Nothing errors — the endpoint simply idles |
| A frontend call with no handler | Returns `NOT_FOUND`, which reads like a network problem |
| A capability granted but required by nothing | A grant nothing checks looks like a permission and is not one |
| An action requiring a capability no role holds | Reads as a permissions bug rather than a typo |
| A stale entry in `UNCALLED_BY_DESIGN` | The allowlist stops describing reality and starts excusing it |

`UNCALLED_BY_DESIGN` in the suite **is** the documentation for deliberately
unreachable endpoints. An action listed there is a decision; an action missing
from it is an accident.

⚠️ The capability check reads **both** the action table and inline
`Authorize.check(...)` calls in the controllers. A table-only version reported
`profile:read:all` as unused and would have had someone delete a real gate —
it caught that in its first run.

## The journey suite — and why asserting shapes was not enough

`tests/journeys.html` mounts the **real view modules** against the **real
backend**: `fetch` is routed into `doPost`, and a router shim mounts the same
modules `main.js` registers, so `navigate('/dashboard')` really renders the
dashboard. 16 journeys cover registration, login, session restore, submission,
every member screen, PIN reset, PIN change, logout, and empty states.

It exists because Phase 10 found **three blocking crashes** that this suite —
at 101 passing checks — could not see:

1. `submit-view` read `result.stats.week`; the API returns stats flat. Every
   successful post threw, and the catch told the member *"We couldn't reach
   Flow Tribe"* about a post already in the ledger.
2. `profile-view` read `milestones.milestones`; the API returns `recent`.
3. `LevelProgress` read `next.posts.current`, a shape **no endpoint has ever
   returned**. The member dashboard had never rendered.

**The frontend-contract group asserts the shape of the *response*.** It
confirmed `milestones.totalEarned` exists — it does — while the view read a
path that never did. A test written from the response can only ever confirm
the response. The journey suite has no contract to keep in sync, because the
view *is* the contract.

⚠️ **`assertLoaded()` is the assertion that matters.** Every member view wraps
its load in `try/catch` and renders an EmptyState, so a view whose *render*
throws does not crash — it quietly shows "We could not load your dashboard",
which is long, contains no `undefined`, and passes any naive "did something
render?" check. The first version of these journeys **passed against the
broken dashboard**. `assertLoaded()` fails on a "Try again" button or
"could not load" copy.

The suite is mutation-tested: reintroducing the `LevelProgress` defect turns
it red with *"the dashboard rendered an ERROR STATE, not content"*, and
restoring the fix turns it green. A regression suite nobody has watched fail
is a guess.

## What neither suite can prove

Apps Script's own runtime · real Sheets latency · quota behaviour · genuine
lock contention (the fake is single-threaded) · the deployment configuration ·
real browser rendering (the journeys assert the DOM, not pixels).

**`setupSmokeTest()` closes most of that gap** the moment it runs on the real
project.

---

# Assumptions

## Product

1. ~60 members, comfortable to ~200. Beyond that, revisit full-scan reads.
2. The community is trusting — a PIN is a convenience credential, not a
   password.
3. Members have WhatsApp (invite delivery) but not necessarily email.
4. Africa/Lagos for everyone. **Not multi-timezone.**
5. One platform per member, fixed at registration.

## Technical

6. Google Sheets and Apps Script remain free at this scale.
7. Members use a modern browser supporting ES modules and `:has()`.
8. The operator can follow written steps but is not a developer.
9. Netlify or an equivalent static host.
10. `localStorage` is available (private browsing is handled gracefully).

## Data

11. `Submissions` is the only true record; everything else is rebuildable.
12. Multiple posts on one day count as **one active day**.
13. A member changing platforms keeps their history under the old platform.
14. Deleted members are rare; deactivation is the normal path.

---

# Known Issues

| # | Issue | Severity | Notes |
|---|---|---|---|
| ~~K1~~ | ~~Design docs diverge from the build~~ | **RESOLVED** | Closed by [`FINAL_PRODUCT_DECISIONS.md`](FINAL_PRODUCT_DECISIONS.md). Implementation governs behaviour; docs govern appearance. **Not a defect** |
| ~~K2~~ | ~~`admin.members.create` capability with no handler~~ | **RESOLVED** | Grant removed in Phase 9. Member creation is invite-only; the suite now fails on any unused capability |
| K3 | Submission latency unmeasured | Medium | Instrumented; first live run gives real numbers |
| K4 | Lock contention untested under real concurrency | Low | Fake is single-threaded |
| K5 | Notification outbox has no delivery worker | Low | By design — rows accumulate so nothing is lost when delivery is added |
| K6 | `Members` full-scan per lookup | Low | Trivial at 60 rows; revisit at ~500 |
| K7 | Idempotency key is client-supplied | Medium | Bounded by daily cap and duplicate-link detection |
| K8 | No self-service PIN recovery | Low | Admin reset; error copy names the path |
| ~~K9~~ | ~~Brand fonts not self-hosted~~ | **RESOLVED** | Satoshi and Inter self-hosted in `assets/fonts/` (Phase 8). No CDN |
| K11 | Satoshi has no Yoruba subdot glyphs | Low | Mitigated: Inter sits second in `--ft-font-display` and substitutes per-glyph. See `FINAL_PRODUCT_DECISIONS.md` §6.4 |
| K10 | `gallery.html` and `tests/` ship unless removed | Trivial | Contain no data |
| K12 | Journey suite takes ~50s | Trivial | Each journey does a full 14-sheet bootstrap for isolation. Worth the wall time |
| K13 | Registration Back button exits the flow | Low | The wizard step is in-memory, so browser Back leaves registration rather than stepping back. **Deferred by decision — navigation flow is frozen.** Phase 10 L1 |

---

# Remaining Engineering Tasks

## Blocking launch

1. **Deploy and run `setupSmokeTest()`** — 30 minutes. **The only blocking
   item.**

## ✅ Visual Design Pass — COMPLETE (Phase 8)

Colours, typography, tokens, icons, icon sizing, illustrations, the desktop
sidebar, motion, and UI polish are all applied. Decisions recorded in
[`FINAL_PRODUCT_DECISIONS.md`](FINAL_PRODUCT_DECISIONS.md) §8; the fill/text
contrast rule in §6.3 is **binding** and the font-coverage note in §6.4
explains an ordering that must not be changed.

⚠️ **One sequencing consequence.** `MilestoneCatalog.IconID` and
`FlowLevels.IconID` are seeded by `setupSeedCatalog()`, which only writes to
an **empty** sheet. The remap landed before first deployment, so it ships as
code. **After** deployment, changing an icon means editing the spreadsheet —
the seed will not overwrite existing rows.

## After the first deploy

2. Record real submission and dashboard latency; apply the agreed fallback if
   over budget.
3. Brand & Content Pass — replace placeholder copy.

## Deferred, seams already in place

Member Settings screen · profile photos (`avatar` already accepts `src`;
`Profiles` takes a column) · notification delivery · self-service PIN recovery
· export (members, submissions, audit) · content-based idempotency (K7) ·
splitting `MemberService` into three (Phase 3 review W3).
