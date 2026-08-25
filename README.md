# FlowTribe v2

Version 2 of **The Flow Tribe w/ Iyanuoluwa Ilesanmi** — the consistency system behind a
Telegram community for creators and solopreneurs.

> **Status: Phases 1–10 complete. Deployment-ready, not yet deployed.**
> Feature complete for v1 — 11 member screens, 9 admin screens, 38 backend actions —
> with the approved visual design applied, the frontend fully wired to the
> backend, and every member journey verified end to end.
> **102/102** backend checks and **16/16** journeys passing.
> The one blocking item is the live deployment: see [`docs/deployment.md`](docs/deployment.md).

## Running it locally

ES modules are subject to CORS, so `file://` will not work — serve the folder over HTTP:

```bash
powershell -ExecutionPolicy Bypass -File scripts/serve.ps1
```

| Page | URL |
|---|---|
| Member app | `http://localhost:5173/` |
| Admin app | `http://localhost:5173/admin.html` |
| **Component gallery** | `http://localhost:5173/gallery.html` |
| **Verification — backend** | `http://localhost:5173/tests/backend.html` |
| **Verification — journeys** | `http://localhost:5173/tests/journeys.html` |

The gallery renders every token and component on one page — it is the fastest way to see
the design system.

`backend.html` runs the whole backend against an in-memory fake of Google's APIs in about
ten seconds and must read **102/102**. `journeys.html` then mounts the **real screens**
against that backend and must read **16/16** — it takes about 50 seconds, and it is the
one that catches a view reading a field the API does not return. Three blocking crashes
reached Phase 10 because the first suite cannot see what the second does.

> The gallery does **not** load `styles/components-admin.css`. Admin-only layout has to
> be checked on `admin.html`.

There is no build step. Edit a file, refresh, done.

---

## What this project is

The Flow Tribe runs on one rule: every member picks **one platform** and posts **at least 3 times
a week**. FlowTribe v2 is the software that makes that rule visible and felt — members log each
post, see their own streak, and appear on a weekly leaderboard that drives the shoutouts the
community is built around.

Two applications:

| Surface | Who uses it | Job |
|---|---|---|
| **Member app** (10 screens) | FlowMates | Register, log a post in ~10 seconds, see the weekly ring, activity calendar, milestones, Flow Level, and leaderboard |
| **Admin app** (9 screens) | Iyanu + team | Overview, members, submissions, leaderboard, analytics, invite codes, settings, audit log |

## Why v2 exists

v1 works and is live, but it is two standalone HTML files with everything inlined, backed by an
Apps Script that exists only as copy-paste snippets inside three markdown guides. v2 keeps what
works — the brand, the streak rules, the Google Sheet as the data store — and rebuilds the parts
that don't hold up: identity, auth, write confirmation, duplicate protection, and testability.

Full breakdown: [`docs/v1-audit.md`](docs/v1-audit.md).

## Relationship to v1

The v1 application lives in the parent folder and is **read-only reference**. Nothing in this
project modifies it, and nothing imports from it.

**v2 launches with an empty database — there is no migration.** Every member, including everyone
currently in v1, creates a new account through the registration flow. The first account is seeded
manually as Super Admin; every other account requires an invite code. v1 keeps running until the
links are swapped, and its spreadsheet stays intact as a historical record.

## Repository layout

```
FlowTribe-v2/
├── docs/          Architecture, data model, API contract, roadmap, v1 audit
├── src/           Application code
│   ├── core/        dom · component · store · router · api · session · errors · config
│   ├── features/    One folder per screen (auth, dashboard, submit, …, admin)
│   ├── components/  ui/ · brand/ · layout/ · charts/ · data/
│   └── lib/         format · validators · platforms · icons · illustrations · catalog
├── assets/        fonts/ (Satoshi, Inter) · images/ · icons/
├── styles/        12 stylesheets — tokens.css is the single source of visual truth
├── scripts/       serve.ps1, the local static dev server
├── appsscript/    Google Apps Script backend (the real source of truth, not doc snippets)
└── tests/         backend.html  — 102 checks against in-memory Google fakes
                   journeys.html — 16 end-to-end journeys through the real views
```

## Docs

Read in this order.

| Doc | Contents |
|---|---|
| [`docs/product-vision.md`](docs/product-vision.md) | **The north star, the four principles, the copy guide** |
| **[`docs/FINAL_PRODUCT_DECISIONS.md`](docs/FINAL_PRODUCT_DECISIONS.md)** | **⚠️ BINDING — governs every other document. Read first** |
| **[`docs/NEXT_SESSION.md`](docs/NEXT_SESSION.md)** | **Start here after a break — handoff prompt for a new session** |
| **[`docs/PROJECT_OVERVIEW.md`](docs/PROJECT_OVERVIEW.md)** | **Vision, personas, workflows, business rules** |
| **[`docs/ENGINEERING.md`](docs/ENGINEERING.md)** | **Complete technical reference** |
| **[`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md)** | **What is done, pending, blocked — and the design divergence** |
| [`docs/v1-audit.md`](docs/v1-audit.md) | What v1 is — reuse, refactor, rebuild |
| [`docs/architecture.md`](docs/architecture.md) | Folder/file structure, front end, back end, module communication |
| [`docs/database.md`](docs/database.md) | **Sheets schema and the ERD** |
| [`docs/data-dictionary.md`](docs/data-dictionary.md) | **Every field, value, and business rule — the source of truth** |
| [`docs/data-lifecycle.md`](docs/data-lifecycle.md) | What happens behind the scenes, process by process |
| [`docs/architecture-review.md`](docs/architecture-review.md) | Bottlenecks, security, consistency, simplifications |
| [`docs/celebration-system.md`](docs/celebration-system.md) | Activity Calendar, milestones, Flow Levels |
| [`docs/backend-architecture.md`](docs/backend-architecture.md) | **Project structure, services, repositories, jobs, errors** |
| [`docs/api.md`](docs/api.md) | **Every endpoint: request, response, validation, errors** |
| [`docs/security-architecture.md`](docs/security-architecture.md) | Threat model, auth, RBAC, rate limiting, sanitisation |
| [`docs/backend-review.md`](docs/backend-review.md) | Critical review of the backend design |
| [`docs/deployment.md`](docs/deployment.md) | **Deploy it — written for a non-developer** |
| [`docs/production-checklist.md`](docs/production-checklist.md) | **Pre-launch verification, ~20 minutes** |
| [`docs/security-review.md`](docs/security-review.md) | Final security review with evidence |
| [`docs/auth-and-rbac.md`](docs/auth-and-rbac.md) | Registration, login, sessions, capability matrix |
| [`docs/streak-and-leaderboard.md`](docs/streak-and-leaderboard.md) | Week logic, streak rules, ranking, metrics |
| [`docs/decisions.md`](docs/decisions.md) | **Decision log — every choice and its rationale** |
| [`docs/conventions.md`](docs/conventions.md) | Component contract, layering, and code rules |
| [`docs/roadmap.md`](docs/roadmap.md) | Phased delivery plan |

## Tech

HTML · CSS · vanilla JavaScript · Google Apps Script · Google Sheets. No frameworks, no build step.

**Zero runtime dependencies.** Charts are hand-rolled SVG — a locked decision, and one the
Design System independently specifies. The only downloaded assets are the two self-hosted
brand fonts. Mobile-first.

## Identity model

Three fields, three jobs — the change that removes v1's deepest flaw:

| Field | Job | Unique |
|---|---|---|
| `MemberID` | The key everything joins on | Yes, immutable |
| `Username` | The login credential | Yes |
| `FullName` | What the product displays | No — two Davids are fine |

Registration is invite-gated and split in two: **Stage 1** creates the account (full name, username,
6-digit PIN, platform, weekly goal, invite code, feature consent); **Stage 2** is an optional profile
(WhatsApp, email, bio). Profile photos are deferred to a later version, with the seams left open.

## Brand

Deep Burgundy `#5B0000` and Golden Yellow `#F5B400`, on Soft Off White `#F8F8F8` with Charcoal
`#222222` text. **Satoshi** for headings, statistics and buttons; **Inter** for body, forms and
admin — both self-hosted, no CDN. Logo lockup is **THE Flo[w] TRIBE**. Members are **FlowMates**
(capital M). Tone is warm, plain, and human — never corporate.

Full palette, type scale, tokens, and icon mappings:
[`docs/FINAL_PRODUCT_DECISIONS.md`](docs/FINAL_PRODUCT_DECISIONS.md) §4.

> Golden Yellow, and the Success and Warning hues, all fail WCAG AA as text on a light
> background. They are used as fills, borders, icons and indicators; text uses the darker
> `-700` companion in `tokens.css`. See §6 of that document before touching colour.
