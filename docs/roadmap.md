# Delivery Roadmap

> ## ⚠️ The plan below is HISTORICAL
>
> It is Revision 4, written during Phase 3, and its phase numbers do **not**
> match how delivery actually went. Phases 1–8 shipped, consolidated
> differently from this plan: analytics landed inside Phase 6, launch tooling
> inside Phase 7, and the visual pass became Phase 8.
>
> It is kept because the reasoning in it — particularly the sequencing note —
> is still worth reading. **For what happens next, use the frozen roadmap
> immediately below.**

---

# The current roadmap — FROZEN

Set by the project owner. **Five phases remain. Do not add phases, renumber
them, or propose new features without being asked.**

| Phase | Scope | Status |
|---|---|---|
| **8 — Visual Design Pass** | Design system, typography, colours, components, layouts, icons, spacing, responsiveness, animations, UI polish | ✅ **Complete** |
| **9 — Backend & Integration** | Close the PIN-change dead end · deployment configuration accuracy · reachable consent and identity · dead capability surface · automated contract verification | ✅ **Complete** |
| **10 — Testing & Quality Assurance** | — | Not started |
| **11 — Production Deployment** | — | Not started |
| **12 — Beta & Public Launch** | — | Not started |

Phase 8 explicitly excluded, and continues to exclude: business logic,
authentication, registration, database, API, workflow, backend refactoring,
and feature additions. Decisions taken during it are recorded in
[`FINAL_PRODUCT_DECISIONS.md`](FINAL_PRODUCT_DECISIONS.md) §8.

---

# Historical plan (Revision 4)

Each phase ended with a written report — what was implemented, what was
decided, what was assumed — then stopped for approval.

---

## Phase 1 — Foundation & design system ✅

Design tokens, the core runtime (router, store, API client, session, DOM, error
taxonomy), 26 components, both app shells, the Apps Script project structure,
and the component gallery.

Verified running: zero console errors, zero horizontal overflow at 375px.

## Phase 2 — Data architecture ✅

Fourteen sheets, the ERD, the data lifecycle, an adversarial architecture
review, and the data dictionary. No code.

Delivered in [`database.md`](database.md), [`data-lifecycle.md`](data-lifecycle.md),
[`architecture-review.md`](architecture-review.md),
[`data-dictionary.md`](data-dictionary.md),
[`celebration-system.md`](celebration-system.md), and
[`product-vision.md`](product-vision.md).

---

## Phase 3 — Backend architecture ✅

Project structure, the complete API specification, authentication lifecycle,
business-logic ownership, the service and repository layers, security
architecture, background jobs, error handling, and a critical review.

Delivered in [`backend-architecture.md`](backend-architecture.md),
[`api.md`](api.md), [`security-architecture.md`](security-architecture.md), and
[`backend-review.md`](backend-review.md). No code.

## Phase 4 — Member experience, on mock data

The frontend deliverables from the product-vision brief. Every screen built and
polished against a mock data layer, so the experience is validated before any
backend cost is spent on it.

Registration (invite-gated, two-step) · login · **the member dashboard in its
approved order** · Activity Calendar · weekly progress ring · milestones
interface · Flow Levels interface · leaderboard · submit flow · recent activity.
Responsive throughout, with the micro-interactions the vision calls for.

**Mock data lives behind the real API client interface**, so Phase 7 swaps an
implementation rather than rewriting screens.

**Done when:** a member can move through every screen on a phone and on a
desktop, the calendar and ring communicate consistency before any number is
read, and a milestone unlock feels like a moment.

## Phase 5 — Pure logic & tests

`appsscript/lib/` — week boundaries, week streaks, active days, ranking, link
normalisation, username policy, milestone evaluators, level evaluation, and the
day-map pack/unpack. No Apps Script APIs, so the same files run under Node.

Every case in [`streak-and-leaderboard.md`](streak-and-leaderboard.md) §9, plus
the calendar and celebration cases: leap-year day indexing, the day-map cap at
9, each milestone evaluator at and around its threshold, level transitions, and
`RankFinal` ties.

**Done when:** the suite passes and the same modules serve Phase 4's mock layer
and Phase 6's server, so client and server can never disagree.

## Phase 6 — Backend implementation

Sheets bootstrap for all fourteen sheets. Infra, repositories, services,
controllers, middleware, router. Auth, sessions, RBAC, invites, the submission
transaction, milestone and level evaluation.

Carries the architecture review's adopted items: the `ROLLUP_PENDING` marker and
repair job, formula-injection sanitising at the write boundary, the reconcile
cursor, batched writes on the submission path, and the exhaustive
Member-versus-every-admin-action test.

**Done when:** every action returns its documented shape, a failed write is
reported as a failure, an invite cannot be redeemed twice, and a Member is
refused every admin action.

## Phase 7 — Integration

Swap the mock layer for the real API client. Cut over screen by screen. Instrument
the submission path and check it against the 3-second budget in
[`architecture-review.md`](architecture-review.md) B1.

**Done when:** the app runs end to end against a real spreadsheet and the
dashboard updates from the write response with no second request.

## Phase 8 — Admin

Overview from the metric registry, member management, invites, submissions
table, the three leaderboards, Super-Admin-only actions, and the My Dashboard
switch.

**Done when:** a Community Manager can run a full week without opening the
spreadsheet, and a Member who forces the admin URL sees an empty shell.

## Phase 9 — Analytics

`CommunityStats` and the nightly aggregation, the chart adapter, then the
charts.

> **What actually happened:** this landed inside Phase 6, and Chart.js was
> never vendored. The adapter was built with a hand-rolled SVG renderer
> behind it, which is now a locked decision — see
> [`FINAL_PRODUCT_DECISIONS.md`](FINAL_PRODUCT_DECISIONS.md) §3.

The Consistency Score card is **absent, not stubbed** — its registry entry ships
disabled until we define it together.

**Done when:** charts render from pre-aggregated data and the member payload is
unchanged.

## Phase 10 — Launch

`Bootstrap` creates the fourteen sheets and seeds `MilestoneCatalog`,
`FlowLevels`, and `Settings`. `SeedSuperAdmin` creates your account — the only
one outside registration, run once from the editor, unreachable over HTTP.

Dry run on a scratch spreadsheet: generate an invite, register through it,
confirm it cannot be redeemed twice, log posts across a Monday boundary, and
verify the calendar, streak, milestones, level, leaderboard, and admin views all
agree.

**No migration.** Every member, including everyone in v1, registers fresh.

**Done when:** the dry run passes and the first real member has logged a post.

---

## Sequencing

Phases 5 and 6 hold the real risk — they decide who is publicly celebrated.
Phase 4 will feel like the main event, and it is where the product vision is
either delivered or lost, but it is building on primitives that already exist.

If time compresses, compress Phase 9. Never Phase 5.

## Open

Ten consolidated items from [`backend-review.md`](backend-review.md). Items 1–3
are structural and should be settled before any service is written; 4–5 change
behaviour and need approval. Nothing blocks Phase 4.
