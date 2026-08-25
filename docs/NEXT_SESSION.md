# Next Session — Handoff Prompt

Copy everything between the lines into a new Claude Code session, then attach
the three `.docx` design documents.

---

```
You are continuing work on Flow Tribe v2, a content accountability platform
for a private community of creators. The project is feature complete for
version 1, the approved visual design has been applied, the frontend is fully
wired to the backend, and it has NOT yet been deployed.

Working directory:
  C:\Users\CG\Documents\Claude\Projects\Personal\OUTPUTS\The-Flow-Tribe\FlowTribe-v2

IMPORTANT: The Flow Tribe v1 application lives in the PARENT folder. It is
read-only reference. Never modify anything outside FlowTribe-v2.

=====================================================================
STEP 1 — READ THESE FIRST, COMPLETELY, BEFORE ANY OTHER ACTION
=====================================================================

Read in this order:

  1. docs/FINAL_PRODUCT_DECISIONS.md      ← BINDING. READ THIS FIRST.
     Governs every other document. Defines exactly what is frozen and what
     may be changed.

  2. docs/PROJECT_OVERVIEW.md
     Vision, personas, workflows, business rules, requirements, roadmap.

  3. docs/ENGINEERING.md
     Architecture, stack, folder structure, auth, RBAC, schema, endpoints,
     services, error handling, security, deployment, testing, assumptions,
     known issues.

  4. docs/CURRENT_STATE.md
     Exactly what is built, what is partial, what has not started, blockers,
     technical debt, remaining decisions.

  5. The three design documents (attached by the user):
       - Flow-Tribe-Design-System.docx
       - Flow-Tribe-UI-Design-Specification.docx
       - Flow-Tribe-UI-Spec-Screens-7-15.docx

     Authoritative for VISUAL DESIGN ONLY.
     Do NOT recreate, rewrite, replace, or merge them.

     If pandoc is unavailable, a .docx is a ZIP of XML — unzip it and read
     word/document.xml directly. That is how they were read previously.

=====================================================================
STEP 2 — THE GOVERNING RULE (already decided — do not re-open)
=====================================================================

  The IMPLEMENTATION is the source of truth for how Flow Tribe WORKS.
  The DESIGN DOCUMENTS are the source of truth for how Flow Tribe LOOKS.

This was decided by the project owner. Option B. It is recorded in
docs/FINAL_PRODUCT_DECISIONS.md and is BINDING.

FROZEN — do not change, refactor, or re-litigate without explicit owner
approval, even if a design document says otherwise:

  authentication flow · registration flow · username + 6-digit PIN ·
  invite-gated registration · weekly streak logic · weekly goals ·
  submission workflow · business rules · database schema ·
  Apps Script architecture · API contracts · backend logic ·
  frontend behaviour · navigation flow · all implemented engineering decisions

ADOPTABLE — visual work. NOTE: this has now been DONE, in Phase 8.

  brand colours · typography · design tokens · spacing · border radius ·
  shadows · buttons · cards · inputs · icons · illustrations · animations ·
  responsive layout improvements · UI polish

  Two things inside that scope were deliberately NOT taken, and both are
  recorded in FINAL_PRODUCT_DECISIONS.md §8:

    - The 1280px multi-column member Dashboard and Profile. The member
      reading width stays 544px and single-column. That is layout
      restructure, not presentation.
    - The admin mobile navigation drawer. That is new interactive
      behaviour, not restyling.

WHERE THE DESIGN DOCS CONTRADICT THE BUILD:
  The build wins. The conflict is ALREADY RESOLVED in
  FINAL_PRODUCT_DECISIONS.md §5 — twelve conflicts, all closed.
  Treat the design-document version as backlog, not as a defect.

  Concretely: KEEP username + PIN. KEEP invite-only registration.
  KEEP the weekly streak. KEEP the existing submission workflow.
  KEEP the existing business rules. KEEP the no-emoji rule.

  Do NOT build the screens specified in the docs but not built
  (marketing landing, member Settings, moderation queue, export,
  Flow Journey timeline, calendar month navigation, Top 3 spotlight)
  without explicit owner approval.

=====================================================================
STEP 3 — VERIFY YOUR UNDERSTANDING BEFORE CHANGING ANY CODE
=====================================================================

Run the test suite and confirm it is green BEFORE touching anything:

  powershell -ExecutionPolicy Bypass -File scripts/serve.ps1

  Then open http://localhost:5173/tests/backend.html
  Expected: 102/102 passing across 14 groups. Takes about ten seconds.

  AND open http://localhost:5173/tests/journeys.html
  Expected: 16/16. Takes about 50 seconds.

  RUN BOTH. They prove different things. backend.html proves the backend
  answers correctly; journeys.html mounts the REAL SCREENS against those
  answers. Three blocking crashes reached Phase 10 — including a member
  dashboard that had never once rendered — while backend.html read 102/102,
  because a test written from the response can only confirm the response.

  Also useful:
    http://localhost:5173/              member app
    http://localhost:5173/admin.html    admin app
    http://localhost:5173/gallery.html  component gallery

Then state back to the user, in your own words:
  - What Flow Tribe is and who it serves
  - The governing rule from Step 2, and that you will not change behaviour
  - The current phase and what is blocking launch
  - What you intend to do next

Wait for confirmation before making changes.

=====================================================================
STEP 4 — CONTINUE FROM HERE
=====================================================================

The session ended after Phase 9 (backend & integration). All engineering, all
visual work, and all frontend-backend wiring is done. Nothing is deployed.

Phase 9 closed a blocking defect: auth.changePin had no caller, so an admin
PIN reset - the only account recovery in the product - stranded the member in
a redirect loop. There is now a /change-pin screen. Do not remove it.

Immediate priorities:

  1. Deploy — docs/deployment.md, about 30 minutes. THE ONLY BLOCKING ITEM.
  2. Run setupSmokeTest() on the live project. Expect "ALL 27 CHECKS PASSED".
  3. Work docs/production-checklist.md (~120 items, ~20 minutes).
  4. Record real submission and dashboard latency from the execution log.
     This is the only unmeasured performance number; see ENGINEERING.md
     "Performance Considerations" for the agreed fallback if it exceeds 3s.
  5. Brand & Content Pass — copy only.

BEFORE YOU DEPLOY, KNOW THIS
Milestone and Flow Level IconIDs are written by setupSeedCatalog(), which
only seeds an EMPTY sheet. They are correct in the code today. After the
first deploy, changing an icon means editing the spreadsheet by hand — the
seed will not overwrite existing rows.

THE VISUAL DESIGN PASS IS COMPLETE — do not redo it.
What was decided, and what was measured, is in FINAL_PRODUCT_DECISIONS.md
§6 and §8. Three rules that are easy to break by accident:

  - NEVER set a -500 status colour as a `color` on a light surface.
    #22C55E is 2.3:1 and #F59E0B is 2.2:1 on white. Text uses -700.
    The scale encodes it: -50 tint, -500 fill, -700 text.
  - DO NOT reorder --ft-font-display. Inter sits second because Satoshi has
    no ẹ ọ Ẹ Ọ ṣ, and headings render member names.
  - Satoshi ships Medium 500 and Bold 700 ONLY. Asking for 600 or 800 makes
    the browser synthesise a face, which smears at large numeral sizes.

AFTER ANY WORK: re-run BOTH suites. backend.html must still be 102/102 and
journeys.html must still be 16/16. A "visual" change that breaks a test was
not a visual change.

Note: gallery.html does NOT load styles/components-admin.css. Admin-only
layout must be checked on admin.html.

=====================================================================
CONVENTIONS YOU MUST PRESERVE
=====================================================================

  - NEVER use innerHTML. Every string goes through textContent via el().
    This is a security rule: session tokens live in localStorage and member
    text renders on admin screens.

  - Business logic is SERVER-SIDE ONLY. Format checks may be mirrored on the
    client for instant feedback; judgements (link matching, duplicates,
    streaks, ranking, milestones) may not — they judge the member.

  - Every backend action declares a capability in the action table in
    03_Router.gs. An action without one cannot exist.

  - Ledger first: Submissions is written before any derived value.

  - Every CSS value comes from tokens.css. No raw hex, no magic pixels.

  - Mobile-first. min-width queries only, never max-width.

  - Apps Script has NO module system. Nothing may run at the top level of a
    .gs file except declarations. Files load alphabetically into one global
    scope.

  - Charts are hand-rolled SVG. LOCKED — do not replace with Chart.js or any
    other library.

  - No emojis anywhere in the application. LOCKED.

  - Comment WHY, not WHAT.

  - Do not build ahead of the current phase. Raise architectural changes and
    wait for approval rather than making them silently.

=====================================================================
WORKING AGREEMENT
=====================================================================

  - Explain architectural decisions before implementing them.
  - If you believe a better approach exists, explain the trade-offs and ask.
  - Preserve existing functionality unless a change is explicitly approved.
  - Report honestly: distinguish what is VERIFIED from what is ASSUMED.
    The previous session drew this line carefully — 102 checks prove our code
    against an in-memory fake of Google's APIs; they do not prove Apps
    Script's runtime, real latency, or the deployment. Keep that distinction.
  - Pause at the end of each phase and wait for review.
```

---

## Why this handoff should work

Everything a new session needs is in files, not in conversation:

| Need | Where |
|---|---|
| **What may and may not be changed** | **`FINAL_PRODUCT_DECISIONS.md` — binding** |
| What the product is and why | `PROJECT_OVERVIEW.md` |
| How it is built, and every reason | `ENGINEERING.md` |
| What is done, pending, and blocked | `CURRENT_STATE.md` |
| Design authority | The three `.docx` files |
| Every decision and its rationale | `decisions.md` (D1–D42) |
| Field-level schema | `data-dictionary.md` |
| Endpoint contracts | `api.md` |
| Security posture with evidence | `security-review.md` |
| How to deploy | `deployment.md` |
| How to verify | `production-checklist.md` |
| **Whether the backend works** | `tests/backend.html` — 102 checks |
| **Whether the SCREENS work** | `tests/journeys.html` — 16 journeys |

The two suites together are the real safety net. Any future session can prove
the system is intact in about a minute, before changing a line.

`journeys.html` is the one that would have caught the Phase 10 blockers, and
it is mutation-tested — reintroduce the `LevelProgress` defect and it turns
red. A regression suite nobody has watched fail is a guess.
