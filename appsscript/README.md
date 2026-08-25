# Apps Script Backend

The server lives here as real, version-controlled files.

## Why this folder exists at all

v1's backend existed only as copy-paste code blocks inside three different
markdown guides — `Deploy-Guide-HTML-and-Sheet.md`, `Streak-Page-Setup.md`, and
`PIN-Gate-Setup.md` — each containing a different version, with a fourth copy
pasted into the Apps Script editor and actually running. Nobody could tell which
was live.

**The rule for v2: code is edited here and pushed. Never edited in the browser.**
Editing in the Apps Script editor creates a fifth copy and re-opens exactly the
problem this folder was created to close.

## Manifest decisions

| Setting | Value | Why |
|---|---|---|
| `timeZone` | `Africa/Lagos` | Every week boundary, day boundary, and streak calculation depends on it. Must match `config.app.timezone` on the client, or a Sunday-evening post could land in a different week on each side. |
| `runtimeVersion` | `V8` | Modern JavaScript. The legacy Rhino runtime lacks `let`, `const`, template literals, and arrow functions. |
| `executeAs` | `USER_DEPLOYING` | The script runs as the sheet's owner, so members need no Google account and no access to the spreadsheet. |
| `access` | `ANYONE_ANONYMOUS` | Required for a browser to reach the endpoint. **This is why every action is authorised in application code** — the transport is open by necessity, so the gate is the router, not the deployment setting. |
| `spreadsheets.currentonly` | — | Narrower than full Drive access: the script can touch the bound spreadsheet and nothing else in the account. |

## Folder layout

Each folder is one layer, and dependencies only ever point downward.

```
appsscript/
├── appsscript.json      Manifest
├── 00_Config.gs         Sheet names, column maps, constants
├── 01_Router.gs         doPost entry, action table, dispatch
├── 02_Envelope.gs       Request parsing, response shaping
│
├── middleware/          Cross-cutting, applied to every request
│                        Validate · RateLimit · Auth · PinGate · Rbac
├── controllers/         Translate a request into service calls
├── services/            Business logic — the layer that knows the rules
├── repositories/        The only code that touches a sheet
├── infra/               Platform wrappers: sheets, cache, locks, crypto, dates
├── lib/                 PURE functions, no Apps Script APIs — unit-testable
├── jobs/                Time-driven triggers
└── setup/               One-time functions, run by hand from the editor
```

**Why the layers matter here specifically:** `lib/` contains the streak and
ranking maths, and it imports nothing from Apps Script. That is what lets the
same files run under a Node test harness in Phase 2, so the arithmetic deciding
who gets publicly celebrated is verified before it ever meets a spreadsheet.

**Why `repositories/` is the only sheet-aware layer:** if Google Sheets is ever
outgrown, one layer is rewritten and services, controllers, and routing are
untouched.

## File ordering

Apps Script concatenates all files into one global scope in **alphabetical
order by path**. There is no module system.

Two consequences to work with rather than against:

1. **Numeric prefixes on root files** (`00_`, `01_`, `02_`) make load order
   explicit for the ones that matter.
2. **Top-level code runs at load time.** Anything that needs another file must
   run inside a function, never at the top level of a file. This is the most
   common way an Apps Script project breaks in a way that is hard to trace.

Naming is `PascalCase.gs` for modules, matching the object each one exposes.

## Deploying with clasp

```bash
npm install -g @google/clasp
clasp login
```

Then, from this folder, either clone an existing script or create one:

```bash
clasp clone <SCRIPT_ID>
```

Push and deploy:

```bash
clasp push
clasp deploy --description "Phase N"
```

`.clasp.json` is git-ignored — it points at one person's script project.
Copy `.clasp.json.example` and fill in the id.

## Secrets

The PIN pepper and the session signing key live in `PropertiesService`, set once
from the editor. **Never in a sheet, never in this repository.** A leaked
spreadsheet must not be enough to crack a PIN or forge a session.

## Phase status

| Phase | State |
|---|---|
| 1 — structure, manifest, config | ✅ this folder |
| 2 — `lib/` pure logic + tests | pending |
| 3 — infra, repositories, services, controllers, router | pending |
| 6 — `jobs/` aggregation | pending |
| 7 — `setup/` bootstrap and Super Admin seed | pending |
