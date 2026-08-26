# Contributing to Flow Tribe

Flow Tribe is governed by `docs/WORK_POLICY.md` and `docs/FINAL_PRODUCT_DECISIONS.md`. Read both before opening a change.

## Branches

Create work from the current integration baseline using one of:

- `fix/<short-description>`
- `feature/<short-description>`
- `docs/<short-description>`
- `chore/<short-description>`

Do not put ordinary development directly on `main`.

## Before opening a pull request

Run:

```bash
npm install --no-audit --no-fund --package-lock=false
npx playwright install chromium
npm run verify
```

The expected gate is **112/112 backend checks and 18/18 journeys**.

If your change affects deployment/runtime behaviour, also state what still requires a real Apps Script/Sheets environment. A fake is not production evidence.

## Pull requests

Keep changes narrow. Explain the problem, the cause, the chosen fix, the evidence, and any deferred risk. If the change modifies a settled business rule, security model, schema, runtime dependency, or deployment architecture, obtain explicit approval before implementation.
