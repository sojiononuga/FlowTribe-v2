# FlowTribe v2

**Flow Tribe** is an adaptive goal-and-action platform for helping people turn meaningful goals into consistent action, respond to changing constraints, recover momentum and progress with a Tribe around them.

Content creation remains the current compatibility vertical and an important use case, but it is **not the product boundary**. The binding strategic direction is recorded in [`docs/FINAL_PRODUCT_DECISIONS.md`](docs/FINAL_PRODUCT_DECISIONS.md) and [`docs/product-vision.md`](docs/product-vision.md).

> **Portfolio classification:** product / platform.
> Flow Tribe is one of the canonical public operating products in the wider Cereark portfolio. It is not an institution, doctrine/IP item, publishing artefact or agricultural enterprise.
>
> **Release status:** do not infer production state from historical phase labels in this README. Use the current release evidence, deployment records and [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md). The repository includes the production-handoff path and production verification controls.
>
> **Current protected verification gates:** **112/112** backend checks and **18/18** real-screen journeys. After a live deployment, `setupSmokeTest()` must pass **27/27** together with the production checklist. See [`AGENTS.md`](AGENTS.md) and [`docs/WORK_POLICY.md`](docs/WORK_POLICY.md).

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

`backend.html` runs the backend against an in-memory fake of Google's APIs. `journeys.html` mounts the **real screens** against that backend and catches view/API contract mismatches that backend-only verification cannot see. The governed release gates are **112/112 backend** and **18/18 real-screen journeys**; production adds the **27/27** smoke gate.

> The gallery does **not** load `styles/components-admin.css`. Admin-only layout has to
> be checked on `admin.html`.

There is no runtime build step. Edit a file, refresh, done.

---

## What this project is

Flow Tribe's long-term product loop is:

**Goal → Plan → Action → Evidence → Progress → Constraint → Adaptation → Recovery → Momentum**, with Tribe around the loop.

The current creator/community implementation remains a protected compatibility vertical while the broader domain is introduced through tested seams. In that vertical, members can register, log evidence of posts, see streaks and activity, track milestones and Flow Levels, and participate in the community leaderboard. That implementation is a release baseline, not a permanent definition of the product.

Two principal application surfaces currently exist:

| Surface | Who uses it | Job |
|---|---|---|
| **Member app** | FlowMates | Register, act, record evidence, understand progress, recover momentum and use the current creator-community features |
| **Admin app** | Iyanu + team | Govern members, evidence/submissions, leaderboard, analytics, invites, settings and audit controls |

## Why v2 exists

v2 replaces the fragile v1 implementation with a governed, testable application while preserving the behaviours that were explicitly approved. It strengthens identity, authentication, write confirmation, duplicate protection, auditability, backend structure and repeatable verification, while leaving room for the approved broader Flow domain to evolve without a big-bang rewrite.

Full v1 breakdown: [`docs/v1-audit.md`](docs/v1-audit.md).

## Relationship to v1

The v1 application is **read-only reference**. Nothing in this project modifies it, and nothing imports from it.

The v2 data model was designed as a fresh application rather than an automatic v1 migration. Preserve the governing data and release decisions in [`docs/FINAL_PRODUCT_DECISIONS.md`](docs/FINAL_PRODUCT_DECISIONS.md), [`docs/data-dictionary.md`](docs/data-dictionary.md) and [`docs/WORK_POLICY.md`](docs/WORK_POLICY.md) when changing this area.

## Repository layout

```
FlowTribe-v2/
├── docs/          Architecture, product direction, decisions, release and operating records
├── src/           Application code
│   ├── core/        dom · component · store · router · api · session · errors · config
│   ├── features/    Member and admin product surfaces
│   ├── components/  ui/ · brand/ · layout/ · charts/ · data/
│   └── lib/         format · validators · platforms · icons · illustrations · catalog
├── assets/        self-hosted fonts · images · icons
├── styles/        token-led visual system
├── scripts/       development and verification helpers
├── appsscript/    Google Apps Script backend source of truth
└── tests/         backend and real-screen journey verification
```

## Docs

Read in this order.

| Doc | Contents |
|---|---|
| **[`AGENTS.md`](AGENTS.md)** | Repository working rules and verification gates |
| **[`docs/WORK_POLICY.md`](docs/WORK_POLICY.md)** | Governing engineering, delivery and source-of-truth policy |
| **[`docs/FINAL_PRODUCT_DECISIONS.md`](docs/FINAL_PRODUCT_DECISIONS.md)** | Binding product decisions, subject to explicitly recorded later superseding decisions |
| [`docs/product-vision.md`](docs/product-vision.md) | Approved strategic north star and broader adaptive goal-and-action model |
| [`docs/decision-forest-mint-cream-palette.md`](docs/decision-forest-mint-cream-palette.md) | Later approved palette decision that supersedes the historic burgundy/gold palette only |
| [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) | Status record; reconcile it with live/release evidence when historical sections lag the implementation |
| [`docs/NEXT_SESSION.md`](docs/NEXT_SESSION.md) | Session handoff and current operational context |
| [`docs/ENGINEERING.md`](docs/ENGINEERING.md) | Technical reference |
| [`docs/data-dictionary.md`](docs/data-dictionary.md) | Data contract and business-rule source |
| [`docs/api.md`](docs/api.md) | API contract |
| [`docs/deployment.md`](docs/deployment.md) | Deployment process |
| [`docs/production-checklist.md`](docs/production-checklist.md) | Production acceptance controls |
| [`docs/decisions.md`](docs/decisions.md) | Historical and current decision record |

## Tech

HTML · CSS · vanilla JavaScript · Google Apps Script · Google Sheets.

The product preserves **zero runtime package dependencies** and no frontend runtime framework. Charts and other implementation choices remain governed by the binding decision records rather than by stale prose in this README.

## Identity model

Three fields, three jobs:

| Field | Job | Unique |
|---|---|---|
| `MemberID` | The key everything joins on | Yes, immutable |
| `Username` | The login credential | Yes |
| `FullName` | What the product displays | No |

Registration remains invite-gated under the protected release baseline. Authentication, registration, identity, data and business-rule changes are reserved matters under [`docs/WORK_POLICY.md`](docs/WORK_POLICY.md); do not reinterpret them from the broader product direction without an explicit approved migration.

## Brand

The approved current palette is **forest green, fresh mint and warm cream**, with white available for raised/card surfaces and the existing semantic status colours retained. The historic `--ft-burgundy-*` and `--ft-gold-*` custom-property names remain only as compatibility seams and do **not** indicate the current visual direction.

**Satoshi** and **Inter** remain self-hosted. The current palette authority is [`docs/decision-forest-mint-cream-palette.md`](docs/decision-forest-mint-cream-palette.md), which explicitly supersedes only the earlier burgundy/red/gold palette statements while preserving the other settled visual, accessibility, behavioural and security decisions.
