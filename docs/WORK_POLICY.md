# Flow Tribe — Engineering & Delivery Working Policy

**Status:** Governing working policy  
**Effective:** 25 August 2026  
**Applies to:** all human and AI-assisted work on Flow Tribe v2

This policy governs **how** Flow Tribe is changed, verified, released, and reported. It does not reopen settled product decisions.

The product owner explicitly changed the strategic boundary on **25 August 2026**: Flow Tribe is no longer governed as a content-writing or creator-only product. `docs/product-vision.md` is the approved strategic north star. Existing creator-specific implementation remains a protected release baseline while the domain is generalised through tested compatibility seams. “Preserve existing behaviour” therefore means preserve verified functionality during migration; it does **not** mean preserve creator-specific ontology forever.

## 1. Authority and source-of-truth order

When two sources disagree, use this order:

1. `docs/FINAL_PRODUCT_DECISIONS.md` — binding product and visual decisions.
2. Implemented behaviour, where it is consistent with the binding decisions.
3. `docs/data-dictionary.md`, `docs/api.md`, and the security/auth documents for contracts.
4. `docs/CURRENT_STATE.md` and the current release-baseline record for status.
5. Other historical design and roadmap documents for context only.

A later approved decision may replace an earlier one, but the replacement must be recorded in `docs/decisions.md` or an equivalent controlled decision record.

## 2. Reserved matters

Routine implementation, defect correction, tests, documentation repair, and non-behavioural polish may proceed without case-by-case approval when they remain inside an already approved scope.

The following are reserved matters and require explicit owner approval before implementation:

- changing product behaviour or an approved business rule;
- changing authentication, authorisation, identity, PIN, or session design;
- changing the data model in a way that can affect live records;
- adding a runtime dependency, framework, external service, or paid service;
- changing hosting or deployment architecture;
- changing a locked visual/product decision;
- deleting or weakening a security control, audit trail, test gate, or data-integrity control;
- widening the approved release scope;
- production cutover where a live-data or irreversible step is involved.

If a better architecture is identified, document the trade-off first. Do not smuggle an architectural rewrite into a bug fix.

## 3. Branch and repository policy

- `main` is the production-ready branch. It must remain deployable.
- `staging` is the integration and release-candidate branch once the remote repository exists.
- Work happens on short-lived `feature/*`, `fix/*`, `docs/*`, or `chore/*` branches.
- No ordinary feature or defect work is committed directly to `main` after the GitHub baseline is established.
- Changes reach `main` through a pull request with test evidence.
- Prefer squash merge so each accepted change has one intelligible mainline commit.
- A pull request must explain **why** the change exists, not merely list files touched.

Recommended GitHub protection for `main`:

- require a pull request;
- require the `verify` status check;
- block force pushes and branch deletion;
- require conversations to be resolved before merge;
- dismiss stale approvals when material code changes after review.

## 4. Scope discipline

Preserve existing working behaviour unless the change is explicitly within scope.

A defect fix should change the smallest surface that reliably fixes the defect. Do not bundle opportunistic redesign, renaming, refactoring, or new features into the same change unless they are necessary to make the fix safe.

Backlog items remain backlog items until approved. A file or seam existing for a future feature does not constitute approval to build it.

Schedule pressure is not approval to cut committed critical scope, quality, assurance, or test depth. If the evidence shows the agreed date is no longer credible, reforecast transparently and move the date rather than silently thinning the critical path. Any scope trade-off must be an explicit owner decision.

## 5. Test policy

### Before changing code

Establish a clean baseline:

- backend verification: **112/112**;
- end-to-end member/admin journeys: **18/18**.

If the baseline is red before the change, record that fact before touching code. Do not later attribute a pre-existing failure to the new change.

### After changing code

Run both suites again. A change is not complete while either suite is red.

Where a defect escaped existing tests, add a regression test that would have failed before the fix. If practical, mutation-test the regression by temporarily restoring the defect and proving the new test goes red.

Time-sensitive behaviour must use explicit test fixtures or a controlled clock. A test must not change meaning merely because the real calendar advances.

### Production verification

A local/fake pass is not a production pass. The first real deployment and every material backend release require:

- `setupVerify()`;
- production `setupSmokeTest()` with **all 27 checks passing**;
- the relevant items in `docs/production-checklist.md`;
- recorded real latency for critical paths when performance changed or is not yet measured.

Evidence from the in-memory Google fake proves application logic against that fake. It does **not** prove Google Apps Script runtime behaviour, quotas, latency, permissions, or deployment configuration.

## 6. Definition of Done

“Done” means all applicable items below are true:

- approved scope is implemented and no extra scope has drifted in;
- relevant regression tests exist;
- backend suite passes 112/112;
- journey suite passes 18/18;
- no new browser/runtime errors are introduced;
- mobile and desktop behaviour is checked when UI changed;
- accessibility is checked when controls, labels, colours, focus, or navigation changed;
- security and capability boundaries remain intact;
- documentation and decision records reflect the new reality;
- no secret or environment-specific credential is committed;
- the exact commit intended for release is identifiable;
- production-only claims are backed by production evidence.

“Code complete” and “released” are different statuses and must not be used interchangeably.

## 7. Status and evidence language

Every material status report must distinguish:

- **VERIFIED** — directly demonstrated by a test, repository state, deployment record, or observed runtime result;
- **ASSUMED** — plausible but not yet demonstrated;
- **BLOCKED** — cannot currently be demonstrated or completed, with the dependency named;
- **DECISION REQUIRED** — implementation is technically possible but a reserved product/business choice has not been made.

Do not use an absent commit, a document label, or a proxy metric as proof that a feature is complete. Inspect the implementation and run the relevant evidence.

## 8. Security invariants

The following are hard rules unless the owner explicitly approves a replacement control of equal or greater strength:

- never render member-controlled strings with `innerHTML`;
- client-side guards are UX only; server-side capability checks are authoritative;
- every backend action declares a capability in the action table;
- business judgements remain server-side;
- the submission ledger is written before derived state;
- PINs are never stored or logged in clear text;
- production secrets live in Apps Script properties, not source control;
- `src/core/config.js`, `.clasp.json`, and `.clasprc.json` remain untracked;
- audit history is append-oriented and must not be silently erased by tests or ordinary operations;
- spreadsheet formula injection protections must remain in place.

Security weakening is never an acceptable way to make a test pass.

## 9. Data and schema policy

- Do not point v2 at the v1 spreadsheet. That separation is a product decision.
- Treat the submission ledger as the primary evidence record; derived state must be reproducible from it.
- Back up the production spreadsheet before any material schema or migration change.
- New opaque keys that Sheets could coerce as dates or numbers must be explicitly stored as plain text and covered by a faithful fake/runtime test.
- Destructive data changes require a written rollback or recovery path before execution.

## 10. Dependency policy

Flow Tribe has zero runtime package dependencies and no frontend build step. Preserve that unless explicitly approved.

Development-only tooling may be added when it materially strengthens repeatable verification. Such tooling must:

- never be required by the member/admin runtime;
- be pinned to an exact version where practical;
- be documented;
- not change product behaviour.

## 11. Deployment policy

Keep three concepts separate:

1. local/test verification;
2. staging/release-candidate verification;
3. production deployment.

Do not reuse production data for ordinary development testing.

For each production release, record at minimum:

- Git commit SHA;
- Apps Script deployment ID/version;
- frontend deployment identifier or URL;
- spreadsheet used;
- smoke-test result;
- release date/time;
- known residual risks and explicitly deferred items.

Prefer updating the existing Apps Script deployment version so the public `/exec` URL stays stable.

## 12. Documentation discipline

A status document that contradicts the implementation must be corrected or explicitly marked historical. New sessions should not have to infer which of several contradictory phase labels is true.

`README.md`, `CURRENT_STATE.md`, `NEXT_SESSION.md`, and the release-baseline record should agree on the current phase and blockers.

Comments in code should explain **why**, not narrate what obvious syntax does.

## 13. AI-assisted work policy

Coding agents may autonomously inspect, diagnose, implement approved-scope fixes, write tests, update documentation, and prepare pull requests.

They must not:

- declare success without evidence;
- reinterpret a locked product decision because another design seems cleaner;
- silently expand scope;
- manufacture credentials or deployment evidence;
- claim a live deployment was verified when only a fake/local harness ran;
- overwrite settled work while fixing an unrelated defect.

If tooling prevents a requested remote or production action, complete every safe preparatory step, identify the exact blocked action, and leave the project in a clean handoff state rather than pretending it was done.

## 14. Current release gate

As of 25 August 2026, the release remains gated by:

- a completed live deployment with recorded evidence;
- production smoke test and checklist;
- a confirmed Founding Member cutoff (`milestones.foundingPeriodEnd`).

The cutoff is a product/release decision. Tests must not hard-code the assumption that today is before that cutoff.
