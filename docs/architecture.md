# FlowTribe v2 — Application Architecture

**Status: proposal. Awaiting approval. No code written.**

This document covers folder structure, file structure, application architecture, module
communication, and the reasoning behind each choice. Data model lives in
[`database.md`](database.md), endpoints in [`api.md`](api.md), auth/RBAC in
[`auth-and-rbac.md`](auth-and-rbac.md), streak and leaderboard logic in
[`streak-and-leaderboard.md`](streak-and-leaderboard.md), and the decision log with the open
questions in [`decisions.md`](decisions.md).

---

## 1. The shape of the system

```
┌─────────────────────────────────────────────────────────────┐
│  BROWSER — static files on a CDN (Netlify)                  │
│                                                             │
│  index.html   member app shell                              │
│  admin.html   admin app shell   (separate bundle)           │
│                                                             │
│  core/  router · store · api client · session · guards      │
│  features/  register · login · dashboard · submit · admin   │
│  components/  ui · brand · layout · data · charts           │
└───────────────────────────┬─────────────────────────────────┘
                            │  HTTPS · POST · JSON envelope
                            │  Bearer token in body
┌───────────────────────────▼─────────────────────────────────┐
│  GOOGLE APPS SCRIPT — the only trusted boundary             │
│                                                             │
│  Router  →  Middleware  →  Controller  →  Service  →  Repo  │
│             (auth, rbac,                                    │
│              rate-limit,                                    │
│              validation)                                    │
│                                                             │
│  Jobs: weekly rollover · nightly reconcile · session sweep  │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  GOOGLE SHEETS                                              │
│  Members · Submissions · Sessions · AuditLog · Settings ·   │
│  Stats_Daily                                                │
└─────────────────────────────────────────────────────────────┘
```

**The one rule that governs everything:** the browser is untrusted. Every authorisation decision,
every validation, every calculation that affects a member's standing happens in Apps Script. The
front end is presentation and convenience only.

---

## 2. Front-end architecture

### 2.1 Two app shells, not one — and not eight pages

**Decision:** two single-page shells — `index.html` (member) and `admin.html` (admin) — each with
hash-based client routing.

**Why not a multi-page app** (separate `login.html`, `dashboard.html`, `submit.html`)? Your spec
asks for smooth transitions, micro-interactions, and a dashboard that refreshes after submission
"without requiring another login." A full page reload drops in-memory state, re-runs the session
check, and produces a white flash between screens. That is the thing that makes a web app feel
like a form. An SPA shell keeps the session and store alive across screens.

**Why two shells instead of one?** Three reasons:

1. A member never downloads a single byte of admin code. Member-management, analytics, and chart
   modules are a meaningful payload a phone user shouldn't pay for.
2. It makes the boundary between the two apps physical rather than conventional — you cannot
   accidentally import an admin view into the member dashboard.
3. It gives the admin app room to grow (your future list is long) without bloating the member
   experience, which is the one that has to load fast on Nigerian mobile data.

The cost is a small amount of duplication in the shell HTML and a shared-core import in both.
Acceptable.

### 2.2 No build step

**Decision:** native ES modules, served as-is. No bundler, no transpiler, no `node_modules` in the
deploy path.

Browsers have supported `<script type="module">` for years. The project is HTML, CSS, and vanilla
JS by your requirement — adding Webpack or Vite would contradict the spirit of that and would put a
toolchain between you and your own files. Drag the folder onto Netlify and it works. You can open
any file and read exactly what runs.

I proposed a build step in my previous message. I'm revising that recommendation: with no framework
and no JSX, a bundler buys almost nothing here and costs you inspectability.

The trade-off: more HTTP requests. Over HTTP/2 with a CDN, at this file count, this is not
measurable. If it ever becomes one, a bundling script can be added in `scripts/` later without
changing a single line of application code — that's why the modules stay small and
side-effect-free.

**Configuration** lives in one file, `src/config.js`, generated from `config.example.js`. It holds
the Apps Script deployment URL and nothing secret. It is the only file that changes between
environments, and the only file that must not be committed. v1 hardcoded the deployment URL into
the page itself; this fixes that with the least possible machinery.

**The one dependency: Chart.js** (approved, Q10). It ships as a UMD build loaded with a plain
`<script>` tag, so it needs no bundler and doesn't disturb the no-build-step decision.

Two things about how it's included:

- **Vendored, not CDN.** The file lives in `assets/vendor/`, committed and version-pinned. A CDN
  link would add a runtime dependency on a third party being up, leak your admins' IP addresses to
  that third party on every page load, and break the app entirely when someone's network blocks it.
  A local copy costs ~200KB of repo and removes all three problems. Flagged as N4 in
  [`decisions.md`](decisions.md) in case you'd rather use a CDN.
- **Admin shell only.** The member app — the one loading on a phone over mobile data — never
  downloads it. This is exactly the payload split the two-shell decision was for.

Chart.js is wrapped behind a thin adapter in `components/charts/`. Views ask for a bar chart with
data and a title; they never touch the Chart.js API directly. That keeps brand theming in one
place, keeps the library swappable, and means the eight analytics charts share one styling
decision rather than eight.

### 2.3 Component model

**Decision:** components are plain functions. No classes, no custom elements, no virtual DOM.

Each component module exports a factory that takes props and returns an object with:

| Member | Purpose |
|---|---|
| `el` | The root DOM node, already built |
| `update(props)` | Re-render from new props, in place |
| `destroy()` | Remove listeners, cancel timers, detach |

That's the entire contract. It is roughly 30 lines of convention rather than a framework, but it
gives you the three things a framework gives you that actually matter at this size: a consistent
lifecycle, no memory leaks from orphaned listeners, and the ability to compose a screen out of
independently testable pieces.

**Why not Web Components / custom elements?** They bring Shadow DOM styling complexity and lifecycle
subtleties for no benefit here, and they make the "lots of whitespace, subtle shadows, smooth
transitions" design language harder to apply globally from `styles/tokens.css`.

**Why not a virtual DOM?** Nothing on these screens has enough dynamic rows to justify it. The
admin submissions table is the largest list, and it is paginated.

### 2.4 State

**Decision:** one small observable store per app shell, plus local component state.

The store holds: session, current member profile, dashboard stats, leaderboard cache, and UI flags
(loading, toast queue). Components subscribe to the slices they care about and re-render when those
change. Submitting a post writes the server's returned stats straight into the store, and the
dashboard updates because it is subscribed — this is what makes "automatically refresh the
dashboard" work without a reload or a second request.

No Redux-style reducers or action constants. At this scale that ceremony costs more than it saves.

### 2.5 Routing and guards

Hash routing (`#/dashboard`, `#/submit`, `#/admin/members`) rather than History API, because hash
routes need no server rewrite rules and work identically on Netlify, GitHub Pages, or a local file
open. Every route declares a required capability. The router checks the session before mounting a
view and redirects if it fails.

**This client-side guard is UX, not security.** See §5.

---

## 3. Back-end architecture (Apps Script)

### 3.1 Layers

| Layer | Responsibility | May call |
|---|---|---|
| **Router** | Parse the request envelope, resolve the action, dispatch, format the response | Middleware |
| **Middleware** | Authenticate the token, authorise the capability, rate-limit, validate the payload shape | — |
| **Controller** | Orchestrate one use case. No business rules, no sheet access | Services |
| **Service** | All business rules — streaks, ranking, link validation, PIN policy | Services, Repositories |
| **Repository** | Read and write one sheet. Knows column positions. Returns plain objects | Infra |
| **Infra** | Sheet access, cache, lock, crypto, date/time, logging, errors | — |
| **Jobs** | Scheduled work — weekly rollover, nightly reconciliation, session sweep | Services |

Strictly downward. A repository never contains a business rule; a service never touches a cell
reference. This is the discipline that makes the future features on your list additive rather than
invasive — a badge engine is a new service plus a new repository, and nothing else moves.

**Why layers at all, for a community of 50?** Because your spec lists eleven future features. v1
collapsed into a single 60-line `doGet` and that is precisely why nobody could tell which version
was deployed. The layering costs maybe a day up front and is what keeps the codebase legible at
feature ten.

### 3.2 Apps Script has no module system — how we handle it

`.gs` files share one global scope. There is no `import`. Two consequences the design must respect:

1. **Every module is a namespace object** (`MemberService`, `StreakService`, `SheetClient`)
   assigned once at the top level. Cross-module calls happen *inside* functions, never at file
   top-level, because Apps Script does not guarantee file evaluation order.
2. **Filenames are the only organisation.** `clasp` supports subdirectories and the modern Apps
   Script editor renders them as folders, so `services/StreakService.gs` works and reads correctly
   in the browser editor too.

Numeric prefixes on the root-level files (`00_Config`, `01_Router`) make the entry points obvious
in an editor that sorts alphabetically.

### 3.3 Transport: one POST endpoint, and a specific CORS detail

**Decision:** a single `doPost` handling all actions, with the action name inside the JSON body.
Content type `text/plain`.

Two problems in v1 forced this:

- v1 sent credentials in a **GET query string**, so PINs landed in browser history, referrer
  headers, and Apps Script execution logs.
- v1 used `fetch(..., { mode: 'no-cors' })`, which makes the response permanently unreadable — the
  UI showed "Logged!" whether or not the write succeeded.

The fix has a catch worth stating plainly, because it is the single most common way this
integration fails: **Apps Script web apps do not handle CORS preflight requests.** Sending
`Content-Type: application/json` makes the browser issue an `OPTIONS` preflight, Apps Script does
not answer it, and the request dies. Sending the same JSON string with `Content-Type: text/plain`
keeps it a "simple request", no preflight is issued, and the response is fully readable. The server
parses the raw body itself.

So: JSON payloads, `text/plain` content type, real readable responses. This is what lets the app
finally distinguish success from failure.

**Why one endpoint rather than REST-style paths?** Apps Script gives you exactly two entry points,
`doGet` and `doPost`. Path-based routing would have to be faked through query parameters anyway.
An action-routed envelope is honest about what the platform actually is, and it makes the
middleware chain trivial to apply uniformly.

`doGet` is kept for one thing only: a health/version check, useful when verifying a deployment.

### 3.4 Concurrency, caching, and quotas

- **`LockService`** wraps every write that touches derived counters (submission + member counter
  update), so two simultaneous submissions cannot both read `AllTimePosts = 9` and both write `10`.
- **`CacheService`** holds leaderboards and dashboard aggregates for ~60 seconds, invalidated
  explicitly on write. v1 rebuilt every member's totals from a full sheet scan on every single
  request, just to answer for one person.
- **Quota reality:** Apps Script allows ~30 simultaneous executions and caps a single execution at
  6 minutes. At 60 members this is not close to a limit. This architecture is comfortable to a few
  hundred members. Past roughly a thousand, or if admin analytics start scanning six figures of
  rows, the honest answer is to move Submissions to a real database — the repository layer is
  exactly the seam where that swap happens without touching services or controllers.

### 3.5 Scheduled jobs

| Job | When | What |
|---|---|---|
| **Weekly rollover** | Monday 00:05 Africa/Lagos | Materialise last week's result into `CurrentStreak` / `LongestStreak`; write the audit row |
| **Nightly reconcile** | Daily 02:00 | Recompute all derived counters from Submissions and correct any drift |
| **Session sweep** | Daily 03:00 | Delete expired session rows |

**Important design property:** correctness never depends on a job firing. Submissions is the ledger;
every number is derivable from it, and the read path derives rather than trusts. The jobs
materialise for speed and produce an audit trail. If a trigger silently fails — which Apps Script
triggers occasionally do — members still see correct numbers, and the nightly reconcile heals the
stored values. Rationale expanded in [`streak-and-leaderboard.md`](streak-and-leaderboard.md).

---

## 4. Folder and file structure

Proposed. **I have not created these subfolders yet** — the current scaffold stops at the top level
we agreed. Say the word and I'll lay it out.

```
FlowTribe-v2/
├── README.md
├── config.example.js              template; copy to src/config.js
├── .gitignore                     ignores src/config.js
│
├── docs/
│   ├── architecture.md            this file
│   ├── database.md                sheets schema, migration
│   ├── api.md                     endpoint specification
│   ├── auth-and-rbac.md           auth, session, RBAC flows
│   ├── streak-and-leaderboard.md  weekly logic, ranking
│   ├── decisions.md               decision log + open questions
│   ├── roadmap.md                 phased delivery
│   └── v1-audit.md                what v1 was, reuse/refactor/rebuild
│
├── src/
│   ├── index.html                 member shell
│   ├── admin.html                 admin shell
│   ├── config.js                  generated, not committed
│   │
│   ├── core/                      the ~300 lines that stand in for a framework
│   │   ├── app.js                 bootstrap: mount shell, restore session, start router
│   │   ├── router.js              hash routes, guards, view mount/unmount
│   │   ├── store.js               observable state, subscribe/notify
│   │   ├── component.js           the el/update/destroy contract
│   │   ├── api.js                 envelope, token attach, typed errors, retry
│   │   ├── session.js             token persistence, expiry, refresh-on-activity
│   │   ├── guards.js              requireAuth, requireCapability
│   │   ├── events.js              app-wide pub/sub (toasts, session-expired)
│   │   └── errors.js              error taxonomy → user-facing copy
│   │
│   ├── components/
│   │   ├── ui/                    button · input · pin-input · username-input · select
│   │   │                          card · modal · toast · skeleton · spinner
│   │   │                          empty-state · badge · avatar · switch
│   │   ├── brand/                 logo-lockup · progress-ring · stat-card · streak-flame
│   │   │                          success-burst
│   │   ├── layout/                app-shell · top-bar · bottom-nav · page-header
│   │   │                          mode-switch  (My Dashboard ⇄ Admin)
│   │   ├── data/                  data-table · pagination · filter-bar · search-input
│   │   └── charts/                chart-adapter · bar · line · donut  (wraps Chart.js)
│   │
│   ├── features/                  one folder per screen; view + its private pieces
│   │   ├── register/              stage 1: name · username · pin · platform · goal
│   │   │                          invite code · feature consent
│   │   ├── login/                 username + pin · forced pin change
│   │   ├── dashboard/             dashboard-view · weekly-progress · stats-grid · cta
│   │   │                          profile-nudge  (stage 2 prompt, dismissible)
│   │   ├── submit/                submit-view · link-field · success-state
│   │   ├── leaderboard/
│   │   ├── profile/               stage 2: whatsapp · email · bio
│   │   ├── settings/              change PIN · feature consent (member-scoped)
│   │   └── admin/
│   │       ├── overview/          metric cards, rendered from the server's registry
│   │       ├── members/           list · filters · detail · edit · actions
│   │       ├── invites/           generate · list · revoke
│   │       ├── submissions/       table · filters
│   │       ├── leaderboards/      week · month · all-time
│   │       ├── analytics/         charts, via the adapter
│   │       └── settings/          super-admin only
│   │
│   └── lib/
│       ├── platforms.js           display metadata only; allowlist comes from the server
│       ├── validators.js          instant client-side feedback (never authoritative)
│       ├── format.js              dates, numbers, pluralisation, relative time
│       └── dom.js                 tiny element helper
│
├── styles/
│   ├── tokens.css                 colour · spacing · radius · shadow · type · motion
│   ├── reset.css
│   ├── base.css                   typography, layout primitives
│   ├── components.css             component styles, one section per component
│   ├── utilities.css
│   └── animations.css             transitions, success burst, skeleton shimmer
│
├── assets/
│   ├── images/                    real logo (the transparent PNG already in v1)
│   ├── icons/                     inline SVG sprite: platforms, nav, states
│   ├── fonts/                     self-hosted, if we stop using Google Fonts CDN
│   └── vendor/                    chart.umd.min.js — pinned, admin shell only
│
├── appsscript/
│   ├── appsscript.json            manifest — timezone Africa/Lagos, V8 runtime
│   ├── 00_Config.gs               constants, sheet names, column maps
│   ├── 01_Router.gs               doPost / doGet entry, action table, dispatch
│   ├── 02_Envelope.gs             request parse, response format
│   ├── middleware/                Auth · Rbac · RateLimit · Validate · PinGate
│   ├── controllers/               Auth · Member · Profile · Submission
│   │                              Leaderboard · Admin · Invite · Analytics
│   ├── services/                  AuthService · SessionService · MemberService
│   │                              ProfileService · SubmissionService · StreakService
│   │                              LeaderboardService · InviteService
│   │                              AnalyticsService · MetricRegistry
│   │                              LinkValidator · PinPolicy · UsernamePolicy
│   ├── repositories/              MemberRepo · ProfileRepo · SubmissionRepo
│   │                              InviteRepo · SessionRepo · AuditRepo
│   │                              SettingsRepo · StatsRepo
│   ├── infra/                     SheetClient · CacheClient · LockClient · Crypto
│   │                              DateTime · Logger · Errors · Ids
│   ├── lib/                       PURE logic, no Apps Script APIs — unit-testable
│   │                              week.js · streak.js · ranking.js · linkrules.js
│   │                              username.js · linknormalize.js
│   ├── jobs/                      WeeklyRollover · NightlyReconcile · SessionSweep
│   │                              InviteExpiry
│   └── setup/                     Bootstrap (create sheets) · SeedSuperAdmin
│
├── scripts/
│   ├── deploy-backend.md          clasp push + deploy, versioning discipline
│   ├── deploy-frontend.md         Netlify, config.js generation
│   └── test.md                    how to run the unit tests
│
└── tests/
    ├── unit/                      week · streak · ranking · linkrules
    ├── fixtures/                  sample submission sets, boundary dates
    └── README.md
```

### 4.1 How the pure logic gets tested

`appsscript/lib/` holds the calculations that decide who gets publicly celebrated: week
boundaries, streak length, ranking, and link rules. These files use no Apps Script API — no
`SpreadsheetApp`, no `Utilities`, no `Session`. They take plain arguments and return plain values.

That constraint is what makes them testable: the Node test harness loads each file into an isolated
context and exercises it directly, while Apps Script loads the identical file as part of the
project. One source, two runtimes, no duplication.

v1 had zero tests on this math. Given that the leaderboard drives public recognition, that is the
first gap I'd close.

---

## 5. The uncomfortable truth about "verify role before loading the page"

Your spec says, correctly, *"Do not rely on hiding pages with JavaScript alone"* and *"Every
protected page must verify the logged-in user's role before loading."*

With a static front end there is no server rendering the page, so **a static file cannot be
prevented from being downloaded.** Anyone who types the admin URL will receive `admin.html`. That
is true of any static hosting, and no amount of JavaScript changes it.

What this architecture does instead:

| Layer | What it does | What it is worth |
|---|---|---|
| Route guard in the client | Checks the session's role, redirects a Member away from `#/admin/*` before the view mounts | Good UX. **Zero security value.** |
| Separate admin bundle | Member app never loads admin modules | Reduces payload and accidental coupling. **Minor security value.** |
| **Capability check in Apps Script on every single action** | Rejects the request if the session's role lacks the capability | **This is the actual security boundary.** |

The practical result is exactly what you want: a Member who types the admin URL gets an empty shell
that immediately bounces them to their dashboard, and if they bypass the redirect entirely by
editing JavaScript in their browser, every panel loads empty because the server refuses every
request. They see a skeleton with no data. No member record, no submission, no analytic number ever
crosses the wire to someone without the capability.

**If you want the admin HTML itself to be unreachable**, there is one option available on this
stack: serve the admin app *from* Apps Script via `HtmlService`, behind a Google login. It is a
genuinely stronger boundary. It also means the admin UI runs inside a sandboxed iframe with an
ugly `script.google.com` URL, slower loads, and a more painful deployment. My recommendation is to
skip it — the data is protected either way, and only the empty shell is exposed. Flagged as an open
question in [`decisions.md`](decisions.md).

---

## 6. How modules communicate

### 6.1 One member submitting a post, end to end

```
SubmitView
  │ user pastes link, taps Submit
  │
  ├─▶ validators.js            instant format check — is this even a URL?
  │                            fails fast, no network. UX only.
  │
  ├─▶ core/api.js              wraps { action: "submission.create",
  │                                    token, payload: { link } }
  │                            POSTs as text/plain
  │
  ▼
01_Router.gs
  ├─▶ middleware/Validate      payload has the required fields, correct types
  ├─▶ middleware/RateLimit     this member is not flooding
  ├─▶ middleware/Auth          token → session → member; rejects if expired/revoked
  ├─▶ middleware/Rbac          does this role hold "submission:create"?
  │
  ▼
controllers/SubmissionController
  ├─▶ services/LinkValidator   host matches the member's REGISTERED platform
  │                            (server-side, authoritative)
  ├─▶ services/SubmissionService
  │     ├─▶ lib/week.js              which week does now fall in?
  │     ├─▶ repositories/SubmissionRepo   append the row (inside a lock)
  │     ├─▶ services/StreakService        recompute streak from the ledger
  │     ├─▶ repositories/MemberRepo       write back the materialised counters
  │     └─▶ infra/CacheClient             invalidate leaderboard + dashboard cache
  ├─▶ services/LeaderboardService  fresh rank for this member
  └─▶ repositories/AuditRepo       record the action
  │
  ▼
Response: { ok: true, data: { submission, stats } }
  │
  ├─▶ core/api.js              unwraps the envelope
  ├─▶ core/store.js            writes the new stats into state
  │
  ├─▶ SubmitView               plays the success animation
  └─▶ DashboardView            re-renders — it is subscribed to the same slice
```

The critical property: **the write response carries the recomputed stats.** v1 waited 1300ms on a
`setTimeout` and hoped the sheet had caught up, then refetched. That was a race with a visible
failure mode. Here there is no second request and no window in which the UI is wrong.

### 6.2 Communication rules

- **Views never call `fetch`.** Only `core/api.js` touches the network. One place to add retries,
  one place to handle a 401, one place to log.
- **Views never talk to each other.** They read from and write to the store, or emit an event.
  The dashboard does not know the submit screen exists.
- **Controllers never touch sheets.** They orchestrate services.
- **Services never know about HTTP.** They take and return domain objects, so the same
  `StreakService` serves the member dashboard, the admin leaderboard, and the nightly job.
- **Repositories own column positions.** Column A becoming column B is a one-line change in one
  file. In v1, column indexes were scattered across three markdown documents.
- **Link rules have one source.** The server owns the allowlist and sends it in the login response;
  the client uses that same data for instant feedback. A new platform is added in one place and
  both sides learn about it.
- **Streak math is server-only.** Deliberately *not* shared with the client. The client displays
  numbers it was given; it never computes a streak. Two implementations would eventually disagree,
  and the server's would be right — so there should only be one.

---

## 7. Design system

Tokens in `styles/tokens.css` are the single source for the visual language:

| Token group | Content |
|---|---|
| Colour | Burgundy `#6E1320` / deep `#530E18` / tint `#fbeef0`; Gold `#EAA00C`; white surface; ink `#3a2a2c`; muted `#8a7375`; hairline `#e7d6d8`; success `#2E7D32` |
| Spacing | 4px base scale — 4/8/12/16/24/32/48/64 |
| Radius | 12 / 16 / 20 / full |
| Shadow | Three levels, all burgundy-tinted rather than grey, so cards feel warm rather than flat |
| Type | Baloo 2 for numerals and the logo; Poppins for UI labels; Georgia for body — carried from v1 |
| Motion | Two durations (150ms interaction, 320ms transition), two easings, plus a `prefers-reduced-motion` override |

**Mobile-first**, per your spec: base styles target a 360px phone; breakpoints add tablet at 640px
and desktop at 1024px. The member app is designed for a thumb — bottom-anchored primary action,
44px minimum touch targets. The admin app is desktop-first in practice (tables and charts) but
degrades to stacked cards on a phone.

**Charts:** Chart.js, vendored locally and loaded only by the admin shell, behind the adapter in
`components/charts/`. Brand colours and typography are applied once in the adapter's default
options, so all eight analytics charts inherit the same look without eight separate styling
decisions.

---

## 7a. Configurable metrics

You asked that community metrics be configurable rather than hardcoded, and that the Consistency
Score be paused until we define it together. Both are the same mechanism.

`MetricRegistry` holds one entry per metric: an id, a label, a description, the `Settings` keys it
reads, and its compute function. `admin.overview` iterates the **enabled** entries rather than
calling a fixed list of functions, and returns each metric with the parameters it was computed
with. The admin UI renders whatever descriptors it receives — it never holds the list of metrics.

What that buys:

| Change | Cost |
|---|---|
| Pause the Consistency Score | It ships with `enabled = FALSE`. The card simply isn't in the response |
| Define it later | One registry entry + flip a Settings row. **No front-end deploy** |
| Move a window from 4 weeks to 6 | An admin edit in `Settings` |
| Add a metric next year | One registry entry, one Settings row |

This is also the pattern that keeps the rest of the system's numbers out of the code: session
lengths, lockout thresholds, the duplicate window, the invite expiry, and the default weekly goal
are all `Settings` rows for the same reason.

---

## 8. What this architecture deliberately does not do

- No client-side business logic that affects standing.
- No storing of anything derivable as the *only* copy — Submissions is always the truth.
- No secrets in the front end, ever. `config.js` holds a public URL.
- No framework, no bundler. Exactly one runtime dependency — Chart.js, vendored locally,
  admin-only, behind an adapter.
- No hardcoded thresholds. Anything you might reasonably want to change is a `Settings` row.
- No feature outside your spec. Badges, notifications, AI feedback, and paid tiers get *seams*
  (a service slot, a store slice, a route) — not implementations.

---

## 9. Where the future features attach

Your scalability list, mapped to the seams that already exist in this design — so none of them
requires restructuring.

| Future feature | Where it attaches |
|---|---|
| Achievements & badges | New service + repository; reads the `Submissions` ledger. A store slice and a dashboard component |
| Monthly analytics | Already served by `Stats_Daily` and the metric registry |
| Notifications / email reminders | A job reading `Profiles` consent flags; Apps Script sends mail natively |
| AI content feedback | A service called from `submission.create`, after the write. `ContentLink` is already stored |
| Community leaderboard | Shipped |
| Profile page | Stage 2 builds it; `Profiles` already exists |
| **Profile photos** | One column on `Profiles`, one upload action beside `profile.update`, and the `avatar` component takes an `src`. Every screen already renders members through it |
| Admin dashboard | Shipped |
| Monthly challenges | A `Challenges` sheet + a service; `GoalAtSubmission` already proves per-period goals work |
| Announcements | A sheet, a repository, a store slice |
| Paid membership tiers | A `Tier` column on `Members`, plus capabilities — the RBAC layer already gates by capability, not role |
| Mobile app | The API is already a clean JSON contract with token auth. A native client is a new consumer, not a new backend |
