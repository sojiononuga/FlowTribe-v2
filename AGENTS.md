# Flow Tribe — Agent Instructions

Read these before changing anything:

1. `docs/WORK_POLICY.md`
2. `docs/FINAL_PRODUCT_DECISIONS.md`
3. `docs/CURRENT_STATE.md`
4. `docs/ENGINEERING.md`
5. `docs/data-dictionary.md` and `docs/api.md` for contract changes

Hard rules:

- Preserve settled behaviour unless the task explicitly changes it.
- Do not reopen decisions already closed in `FINAL_PRODUCT_DECISIONS.md`.
- No `innerHTML` for member-controlled content.
- Business judgements stay server-side.
- Every backend action declares a capability.
- Ledger first, derived state second.
- No raw hex/magic layout values outside the token system.
- Mobile first; use `min-width` queries, not `max-width`.
- No runtime framework or runtime package dependency without explicit approval.
- No emoji in the application.
- Do not commit `src/core/config.js`, `.clasp.json`, `.clasprc.json`, PINs, tokens, deployment secrets, or private URLs.

Verification gates:

- backend: 112/112;
- real-screen journeys: 18/18;
- after live deployment: `setupSmokeTest()` 27/27 plus the production checklist.

For code changes, run `npm run verify` when the development tooling is installed. The existing browser harnesses remain the source tests; the npm script only automates them.

Report status as VERIFIED, ASSUMED, BLOCKED, or DECISION REQUIRED. Never treat a document claim as proof when the repository or runtime can be inspected.
