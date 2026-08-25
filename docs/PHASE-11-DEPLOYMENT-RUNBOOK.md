# Flow Tribe — Phase 11 Production Deployment Runbook

**Follow this top to bottom. Do not skip ahead.**

Every expected output in this document was read out of the source, not
paraphrased. If your screen does not match, **stop at that step** and go to
§23 Troubleshooting. A step that "looks close enough" is the one that costs
you an hour later.

| | |
|---|---|
| **Time needed** | 60–90 minutes, first time |
| **You will need** | A Google account, the `FlowTribe-v2` folder, a Netlify account (free) |
| **Deploying from** | Commit `bbe6d99` — Phases 1–10, 101/101 backend checks, 16/16 journeys |
| **Risk of data loss** | None. The database is empty until the first member registers |

> **Before you start.** Open `FlowTribe-v2` in your file browser and keep it
> open. You will copy from `appsscript/` twenty times. Keep this runbook on a
> second screen or printed.

---

# Part 0 — Fill this in as you go

Copy this block into a note. You will need every value, and three of them are
impossible to recover later without redoing work.

```
DEPLOYMENT RECORD — Flow Tribe production
Date:                    ____________________
Deployed by:             ____________________

Spreadsheet name:        ____________________
Spreadsheet ID:          ____________________
Spreadsheet URL:         ____________________

Apps Script project:     ____________________
Script ID:               ____________________

Web App URL (/exec):     ____________________
Deployment ID:           ____________________
Deployment version:      ____________________

Founder username:        ____________________
Founder temporary PIN:   ____________________   (delete after §12)
Founder MemberID:        ____________________   (expect FT-0001)

Netlify site URL:        ____________________
```

---

# Part 1 — Create the spreadsheet

### Step 1.1 — Create it

1. Go to **https://sheets.google.com**
2. Click the **＋ Blank spreadsheet** tile.
3. Click **Untitled spreadsheet** (top-left) and rename it to:
   ```
   Flow Tribe — Production
   ```
4. Press **Enter**.

### Step 1.2 — Record the Spreadsheet ID

Look at the browser address bar:

```
https://docs.google.com/spreadsheets/d/1AbC...XyZ/edit#gid=0
                                       ^^^^^^^^^^^^
                                       this is the Spreadsheet ID
```

Copy everything between `/d/` and `/edit` into your deployment record.

**✅ Success:** an empty spreadsheet named *Flow Tribe — Production*, ID recorded.

> **Why a container-bound script, and why this order.**
> The backend reads its spreadsheet with `SpreadsheetApp.getActiveSpreadsheet()`
> and there is **no `FT_SPREADSHEET_ID` override** — that was deliberately
> removed, because an override meant the script could be pointed at a
> spreadsheet the deploying user did not own, which widened the OAuth scope
> from `spreadsheets.currentonly` to full Drive access. The script must be
> created **from inside this spreadsheet**, which is what Step 2.1 does.
> Creating a standalone Apps Script project instead will fail at §7 with
> *"Bind this script to a spreadsheet first."*

---

# Part 2 — Create the Apps Script project

### Step 2.1 — Open the editor from the spreadsheet

1. In the spreadsheet, click **Extensions** in the menu bar.
2. Click **Apps Script**.
3. A new tab opens, titled **Untitled project**, showing a file called
   `Code.gs` containing:
   ```javascript
   function myFunction() {
   }
   ```

**✅ Success:** the Apps Script editor is open **in a new tab**, and the tab
was opened from Extensions ▸ Apps Script (not from script.google.com).

### Step 2.2 — Name the project

1. Click **Untitled project** at the top-left.
2. Type:
   ```
   Flow Tribe Backend — Production
   ```
3. Click **Rename**.

### Step 2.3 — Record the Script ID

1. Click the **⚙ Project Settings** icon in the left sidebar.
2. Under **IDs**, copy the **Script ID** into your deployment record.
3. Stay on this page — you need it for the next step.

---

# Part 3 — Project settings

### Step 3.1 — Show the manifest

Still on **⚙ Project Settings**:

1. Find **Show "appsscript.json" manifest file in editor**.
2. **Tick the checkbox.**

**✅ Success:** an `appsscript.json` file now appears in the file list when you
return to the editor.

> **Why:** the manifest carries the timezone, the runtime version, the web-app
> access setting, and the OAuth scopes. Without this checkbox you cannot edit
> it, and the deployment will request scopes you did not intend.

### Step 3.2 — Confirm the timezone

Still on Project Settings, check **Time zone**.

It should read **(GMT+01:00) West Africa Time — Lagos**. If it does not, set
it now.

> **Why this matters more than it looks.** The week boundary is Monday 00:00
> Africa/Lagos. If the project timezone disagrees with `appsscript.json`, a
> post made on Sunday evening lands in the wrong week, and the member's streak
> silently breaks. This is not cosmetic.

---

# Part 4 — Copy the twenty backend files

This is the longest part. Work steadily; there is no way to shortcut it.

### The rule

Apps Script has **no folders**. Every file sits in one flat list, and they all
share one global scope. The repo's folder structure has to be flattened into
**names that sort in the right order**.

Use **exactly** the names in the table below. They are chosen so the
alphabetical order Apps Script uses matches the order the repo intends.

> The code is written so that **nothing executes at load time except
> declarations** — every module is an IIFE that only defines things. So order
> is not strictly load-bearing. Use these names anyway: when something does go
> wrong, you want the file list to look like the documentation.

### Step 4.1 — Rename `Code.gs`

1. In the editor, hover over **Code.gs** in the left file list.
2. Click the **⋮** (three dots) → **Rename**.
3. Type `00_Config` and press Enter.
   *(Apps Script adds `.gs` itself. Do not type the extension.)*
4. Click into the code area, select everything (**Ctrl+A** / **Cmd+A**), and
   delete it.
5. Open `appsscript/00_Config.gs` from the repo in a text editor, select all,
   copy.
6. Paste into the Apps Script editor.
7. Press **Ctrl+S** / **Cmd+S** to save.

### Step 4.2 — Add the remaining nineteen files

For each row below:

1. Click the **＋** next to **Files** → **Script**.
2. Type the **Apps Script name** exactly. Press Enter.
3. Delete the auto-generated `function myFunction() {}` stub.
4. Copy the entire contents of the **repo file** and paste it in.
5. **Ctrl+S** / **Cmd+S**.

| # | Apps Script name | Repo file |
|---|---|---|
| 1 | `00_Config` | `appsscript/00_Config.gs` |
| 2 | `01_Errors` | `appsscript/01_Errors.gs` |
| 3 | `02_Envelope` | `appsscript/02_Envelope.gs` |
| 4 | `03_Router` | `appsscript/03_Router.gs` |
| 5 | `10_FtWeek` | `appsscript/lib/FtWeek.js` |
| 6 | `11_FtDayMap` | `appsscript/lib/FtDayMap.js` |
| 7 | `12_FtStreak` | `appsscript/lib/FtStreak.js` |
| 8 | `13_FtLink` | `appsscript/lib/FtLink.js` |
| 9 | `14_FtIdentity` | `appsscript/lib/FtIdentity.js` |
| 10 | `15_FtAchievements` | `appsscript/lib/FtAchievements.js` |
| 11 | `20_Infra` | `appsscript/infra/Infra.gs` |
| 12 | `30_Repositories` | `appsscript/repositories/Repositories.gs` |
| 13 | `40_CoreServices` | `appsscript/services/CoreServices.gs` |
| 14 | `41_DomainServices` | `appsscript/services/DomainServices.gs` |
| 15 | `50_Middleware` | `appsscript/middleware/Middleware.gs` |
| 16 | `60_Orchestrators` | `appsscript/orchestrators/Orchestrators.gs` |
| 17 | `70_Controllers` | `appsscript/controllers/Controllers.gs` |
| 18 | `80_Jobs` | `appsscript/jobs/Jobs.gs` |
| 19 | `90_Setup` | `appsscript/setup/Setup.gs` |
| 20 | `91_SmokeTest` | `appsscript/setup/SmokeTest.gs` |

> **Note on files 5–10.** These are `.js` in the repo, not `.gs`. That is
> deliberate — it lets a Node test harness `require()` them. Paste them into
> Apps Script as ordinary script files exactly as they are. The
> `if (typeof module !== 'undefined')` line at the bottom of each is inert in
> Apps Script and must be left alone.

### Step 4.3 — Replace the manifest

1. Click **appsscript.json** in the file list.
2. Select all, delete.
3. Paste **exactly** this:

```json
{
  "timeZone": "Africa/Lagos",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  },
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets.currentonly",
    "https://www.googleapis.com/auth/script.scriptapp"
  ]
}
```

4. **Ctrl+S** / **Cmd+S**.

### Step 4.4 — Verify the copy

Count the files in the left sidebar. You should have **21**: twenty script
files plus `appsscript.json`.

**✅ Success checklist:**

- [ ] 21 files listed
- [ ] Names match the table exactly
- [ ] No file still contains `function myFunction() {}`
- [ ] No red error underlines in the editor
- [ ] `appsscript.json` matches the JSON above character for character

> **If you see red squiggles:** you most likely pasted a file into the wrong
> tab, or pasted twice into one file. Open the offending file and check it
> begins with the same `/**` comment block as the repo file.

---

# Part 5 — Understand the OAuth scopes before you authorize

You will be asked to authorize in §7. Read this first so you know what you are
agreeing to.

| Scope | What it permits | Why it is needed |
|---|---|---|
| `.../auth/spreadsheets.currentonly` | Read and write **only the spreadsheet this script is attached to** | The database. This is the narrowest spreadsheet scope Google offers — it cannot open any other file in your Drive |
| `.../auth/script.scriptapp` | Create and manage this project's own triggers | The six scheduled jobs in §8 |

**That is the entire list.** There is no Drive scope, no Gmail scope, no
external request scope.

> **Do not widen these.** If a future change asks for `.../auth/drive` or
> `.../auth/spreadsheets` (without `.currentonly`), that is a change worth
> refusing until someone explains why. Phase 9 removed the one feature that
> would have required it.

---

# Part 6 — Script Properties

### Step 6.1 — Open Script Properties

1. Click **⚙ Project Settings** in the left sidebar.
2. Scroll to the bottom, to **Script Properties**.
3. Click **Add script property**.

### Step 6.2 — Add the four founder properties

Add each of these. Click **Add script property** again between each one.

| Property | Value to enter | What it does |
|---|---|---|
| `FT_ADMIN_FULLNAME` | `Iyanuoluwa Ilesanmi` | The founder's **display name**. Shown on the dashboard and leaderboard. Duplicable, changeable later |
| `FT_ADMIN_USERNAME` | `iyanu` | The founder's **login credential**. Unique, lowercase, letters/numbers/dots/underscores, 3–20 characters. **Admin-editable only after this point** |
| `FT_ADMIN_PIN` | *(choose a 6-digit PIN)* | The founder's **first PIN**. Used once to create the account, then **automatically deleted** from Script Properties by `setupSeedSuperAdmin()` |
| `FT_ADMIN_PLATFORM` | `Instagram` | The founder's own posting platform. Must be one of: **`LinkedIn`, `X`, `Instagram`, `TikTok`, `YouTube`** |

**Choosing the PIN.** It must be exactly six digits and will be **rejected** if
it is a repeat (`111111`), a sequence (`123456`, `654321`), or a common PIN.
Pick something arbitrary — you will change it after first login.

4. Click **Save script properties**.

### Step 6.3 — Properties you do NOT set

These are created automatically. Do not add them by hand.

| Property | Created by | Warning |
|---|---|---|
| `FT_PIN_PEPPER` | `setupSecrets()` | **Never change or delete this.** It is mixed into every PIN hash. Changing it invalidates every member's PIN with no way back |
| `FT_SESSION_KEY` | `setupSecrets()` | Changing it signs everyone out immediately |
| `FT_RECONCILE_CURSOR` | `jobNightlyReconcile` | The resume point for a partial reconcile. Housekeeping |

**✅ Success:** exactly four properties listed, all four spelled exactly as
above (they are case-sensitive).

---

# Part 7 — Run the setup

### Step 7.1 — Select and run `setupAll`

1. Click **Editor** (`< >`) in the left sidebar.
2. Open the file **`90_Setup`**.
3. At the top of the editor there is a **function dropdown** — it probably
   reads `setupSecrets`.
4. Change it to **`setupAll`**.
5. Click **▶ Run**.

### Step 7.2 — Authorize

A dialog appears: **Authorization required**.

1. Click **Review permissions**.
2. Choose your Google account.
3. You will see **"Google hasn't verified this app"**.
   This is expected — it is your own script, not a published add-on.
   - Click **Advanced** (bottom-left).
   - Click **Go to Flow Tribe Backend — Production (unsafe)**.
4. Review the permission list. It should mention **the current spreadsheet**
   and **managing triggers** — and nothing else.
5. Click **Allow**.

> **If you see a request for anything beyond those two, stop.** Do not click
> Allow. Go to §23 T-9.

### Step 7.3 — Read the execution log

The **Execution log** panel opens at the bottom. `setupAll` runs six functions
and prints each result separated by `---`.

**Expected output, in this order:**

```
Created: PIN pepper, session key
---
Created: Members, Profiles, InviteCodes, Sessions, Submissions, ActivityCalendar,
WeeklyStats, MilestoneCatalog, MemberMilestones, FlowLevels, Settings, AuditLog,
Notifications, CommunityStats | Verified: none
---
Catalog seeded.
---
Super Admin created: iyanu (FT-0001).
Log in with the PIN you set, then change it from Settings.
FT_ADMIN_PIN has been removed from Script Properties.
---
Installed 6 triggers.
---
OK — 14 sheets, 38 actions, secrets set, Super Admin present.
```

**The last line is the one that matters.** It must read exactly:

```
OK — 14 sheets, 38 actions, secrets set, Super Admin present.
```

**✅ Success:** the final line begins `OK —` and reports **14 sheets** and
**38 actions**.

**❌ If the last line begins `FAILED (n):`** — it then lists every problem, one
per line. Go to §23 and find your specific message. Do not continue.

### Step 7.4 — Record the founder MemberID

From the log line `Super Admin created: iyanu (FT-0001).` — record `FT-0001`
in your deployment record.

### Step 7.5 — Confirm the PIN property was deleted

1. Go to **⚙ Project Settings** → **Script Properties**.
2. `FT_ADMIN_PIN` should be **gone**.
3. `FT_PIN_PEPPER` and `FT_SESSION_KEY` should now be **present**.

**✅ Success:** five properties — the three founder ones you set (minus the
PIN) plus the two generated secrets.

> **If `FT_ADMIN_PIN` is still there,** `setupSeedSuperAdmin` did not complete.
> Check the log for an error above it, and delete the property by hand once
> you have fixed the cause.

---

# Part 8 — Verify the spreadsheet structure

### Step 8.1 — Look at the tabs

Switch to the spreadsheet browser tab. Along the bottom you should now see
**14 tabs**:

| # | Tab | Holds |
|---|---|---|
| 1 | `Members` | Identity, credentials, materialised counters |
| 2 | `Profiles` | Optional Stage 2 details (WhatsApp, email, bio) |
| 3 | `InviteCodes` | Single-use registration codes |
| 4 | `Sessions` | Active sessions, tokens stored hashed |
| 5 | `Submissions` | **The ledger. Append-only. The only source of truth** |
| 6 | `ActivityCalendar` | One packed 366-character day map per member-year |
| 7 | `WeeklyStats` | Per member-week counts, goal met, final rank |
| 8 | `MilestoneCatalog` | 16 milestone definitions |
| 9 | `MemberMilestones` | Unlock records |
| 10 | `FlowLevels` | 6 level definitions |
| 11 | `Settings` | Operational values, changeable without a deploy |
| 12 | `AuditLog` | Append-only record of every consequential action |
| 13 | `Notifications` | Outbox. Written now, delivered in a later version |
| 14 | `CommunityStats` | Daily rollups for the analytics charts |

### Step 8.2 — Spot-check the lookup tables

1. Click the **`MilestoneCatalog`** tab.
   - Row 1 is a header.
   - **Rows 2–17 hold 16 milestones.** Column A should read `first-step`,
     `first-goal`, `active-days-7`, … down to `weekly-champion`.
2. Click **`FlowLevels`**.
   - **Rows 2–7 hold 6 levels**: `seedling`, `creator`, `builder`,
     `consistent-creator`, `community-leader`, `tribe-legend`.
3. Click **`Settings`**.
   - Roughly 15 rows of key/value configuration.
4. Click **`Members`**.
   - **Exactly one data row**, in row 2: `FT-0001`, your username, your full
     name, role `SuperAdmin`, status `Active`.
   - The `PinHash` and `PinSalt` columns contain long hex strings.
     **Your PIN is not stored anywhere and is not recoverable.**

### Step 8.3 — Check the ActivityCalendar formatting

1. Click **`ActivityCalendar`**.
2. Click cell **D2** (the `DayMap` column).
3. Look at the formula bar. It must show a **long string of zeros**, not
   something like `0.00E+00`.

> **Why this specific check.** The day map is a 366-character string of digits.
> If the column is formatted as a number, Sheets converts it to scientific
> notation and **destroys a member's whole year of activity**.
> `setupBootstrap()` sets the column to plain text; this confirms it worked.

**✅ Success:** 14 tabs, 16 milestones, 6 levels, 1 member, DayMap is text.

---

# Part 9 — Verify the triggers

1. Back in the Apps Script editor, click the **⏰ Triggers** icon (alarm clock)
   in the left sidebar.
2. You should see **exactly 6 triggers**:

| Function | Schedule | Purpose | If it never runs |
|---|---|---|---|
| `jobWeeklyRollover` | Weekly, Monday, ~00:05 | Freezes ranks, awards Top 10 and Weekly Champion, updates streaks | Streaks stop advancing |
| `jobNightlyReconcile` | Daily, ~01:00 | Rebuilds every derived value from the ledger | Hand-edits never self-heal |
| `jobRollupRepair` | Every 15 minutes | Repairs members flagged `ROLLUP_PENDING` | A failed write stays stale for a day |
| `jobSessionSweep` | Daily, ~02:00 | Deletes expired session rows | The Sessions tab grows forever |
| `jobInviteExpiry` | Daily, ~02:15 | Marks stale codes expired | Cosmetic only — redemption re-checks |
| `jobDailyRollup` | Daily, ~23:00 | Snapshots daily numbers to `CommunityStats` | Gaps in the analytics charts |

> **Times drift by up to ±15 minutes.** Apps Script applies its own jitter to
> time-based triggers. `00:05` may fire at `00:12`. This is normal and the
> jobs are written to tolerate it.

> **Why the rollover runs at 00:05 and not midnight.** At 00:00 Monday every
> member has zero posts for the new week. Evaluating streaks at that instant
> would reset every streak in the community, every week. A streak breaks when
> a week *closes* unmet, not when a new one opens.

**✅ Success:** exactly 6 triggers, no duplicates.

**❌ If you see 12:** you ran `setupInstallTriggers` twice in a way that did
not clear the old set. Delete all of them (**⋮ → Delete trigger** on each) and
run `setupInstallTriggers` once.

---

# Part 10 — Deploy the Web App

### Step 10.1 — Create the deployment

1. In the Apps Script editor, click **Deploy** (top-right, blue).
2. Click **New deployment**.
3. Click the **⚙ gear** next to *Select type*.
4. Choose **Web app**.

### Step 10.2 — Set the options exactly

| Field | Set to | Why |
|---|---|---|
| **Description** | `Flow Tribe v2.0.0 — initial production` | Version labels are the only way to tell deployments apart later |
| **Execute as** | **Me (your@email)** | The script must act with *your* access to the spreadsheet. Members have none |
| **Who has access** | **Anyone** | ⚠️ Read the box below |

> **⚠️ "Anyone" is correct, and it is not a security hole — but understand why.**
>
> Apps Script offers no way to require a Google sign-in without forcing every
> member to have a Google account and consent screen. So the endpoint is
> reachable by anyone who has the URL.
>
> **There is therefore no network boundary. Every protection is application
> code**: the capability check on all 38 actions, the role re-read on every
> request, the hashed session tokens, and the exponential login backoff. This
> is exactly why Phase 10 tested authorisation as hard as it did.
>
> The option labelled *"Anyone with Google account"* would break registration
> for members without one. Do not choose it.

5. Click **Deploy**.

### Step 10.3 — Authorize again if asked

If prompted, repeat §7.2. Same two scopes.

### Step 10.4 — Record the URL and Deployment ID

The dialog now shows:

- **Deployment ID** — a long `AKfy…` string. **Record it.**
- **Web app URL** — ends in `/exec`. **Record it.**

```
https://script.google.com/macros/s/AKfy…………/exec
                                              ^^^^ must end in /exec
```

6. Click **Done**.

> **`/exec` vs `/dev`.** The editor also offers a `/dev` URL. It only works
> while you are signed in and always runs the *latest saved code*, not the
> deployed version. **Never put a `/dev` URL in `config.js`** — it will work
> for you and fail for every member.

### Step 10.5 — Prove the endpoint is alive

1. Open a **new browser tab**.
2. Paste the `/exec` URL and press Enter.

**Expected:** a small JSON response, something like:

```json
{"ok":false,"error":{"code":"NOT_FOUND","message":"..."}}
```

**This is success.** The endpoint answered. A `GET` carries no action, so the
router correctly refuses it. What matters is that you got **JSON**, not an
HTML error page.

**❌ If you see a Google error page** ("Sorry, unable to open the file…" or a
sign-in prompt), go to §23 T-10.

---

# Part 11 — Run the production smoke test

This is the first thing that exercises the **real** spreadsheet, the **real**
lock service, and the **real** crypto.

1. Back in the Apps Script editor.
2. Open **`91_SmokeTest`**.
3. Set the function dropdown to **`setupSmokeTest`**.
4. Click **▶ Run**.
5. Wait. It takes 30–90 seconds.

**Expected output:**

```
FLOW TRIBE — PRODUCTION SMOKE TEST
ALL 27 CHECKS PASSED
Total: ....ms

  PASS  Spreadsheet reachable (..ms) — Flow Tribe — Production
  PASS  All 14 sheets present with correct headers (..ms) — 14 sheets
  PASS  Secrets present (..ms) — pepper + session key
  PASS  Timezone is Africa/Lagos (..ms) — Africa/Lagos
  PASS  Catalog seeded and every milestone can unlock (..ms) — 16 milestones, 6 levels
  PASS  A Super Admin exists (..ms)
  PASS  Scheduled jobs installed (..ms) — 6 triggers
  PASS  PIN hashing is stable and salted (..ms) — 64-char digest
  PASS  Invite generation (..ms) — ........
  PASS  Registration (..ms) — FT-0002
  PASS  Invite cannot be redeemed twice (..ms) — correctly refused
  PASS  Login (..ms) — token issued
  PASS  Wrong PIN is refused (..ms) — correctly refused
  PASS  Session resolves and carries the right member (..ms) — smoke.user
  PASS  Submission accepted on the registered platform (..ms)
  PASS  Wrong platform is refused (..ms)
  PASS  Duplicate link is refused (..ms)
  PASS  Activity calendar recorded the day (..ms)
  PASS  First Step milestone unlocked (..ms)
  PASS  Dashboard assembles (..ms)
  PASS  Leaderboard includes the test member (..ms)
  PASS  Admin overview computes (..ms)
  PASS  Analytics series compute (..ms)
  PASS  A Member holds no admin capability (..ms) — .. member capabilities, none admin
  PASS  Reconcile rebuilds from the ledger (..ms) — consistent
  PASS  Formula injection is neutralised (..ms) — escaped at the write boundary
  PASS  Cleanup — removed Submissions:1, ActivityCalendar:1, ...
```

**✅ Success:** the second line reads **`ALL 27 CHECKS PASSED`**.

### Step 11.1 — Record your first real latency numbers

**Do this now — it is the whole reason `T1`/`K3` has been open since Phase 3.**

From the log, copy the millisecond figures:

```
LATENCY — first production run
Submission accepted on the registered platform:  ______ ms
Dashboard assembles:                             ______ ms
Total smoke test:                                ______ ms
```

**Budget:** submission **under 3000 ms**. Dashboard should feel instant.

> **If submission exceeds 3000 ms:** do not change anything today. The agreed
> fallback is recorded in `ENGINEERING.md` — move milestone and level
> evaluation out of the lock into a post-commit step. That is a Phase 12
> decision, not a deployment fix. Record the number and move on.

### Step 11.2 — Confirm cleanup

1. Go to the spreadsheet, **`Members`** tab.
2. There should be **exactly one data row again** — `FT-0001`, you. The
   `FT-0002` smoke-test member is gone.
3. Open **`AuditLog`**. It **still contains** the smoke test's rows.

> **That is deliberate, not a bug.** An append-only log a test can erase is not
> an append-only log. Those entries are honest history: the test really did
> register a member.

---

# Part 12 — Change the founder PIN

Do this before anyone else touches the system.

You cannot do it yet — the frontend is not deployed. **Come back to this at
§15.6.** Leave a note.

---

# Part 13 — Configure the frontend

### Step 13.1 — Create `config.js`

1. In `FlowTribe-v2/src/core/`, find **`config.example.js`**.
2. **Copy** it and name the copy **`config.js`** in the same folder.

> `config.js` is git-ignored on purpose — it holds your deployment URL, which
> differs per environment. `config.example.js` stays as the committed template.

### Step 13.2 — Paste the production URL

Open `src/core/config.js` and find line ~31:

```javascript
    baseUrl: 'PASTE_YOUR_APPS_SCRIPT_URL_HERE',
```

Replace with your `/exec` URL:

```javascript
    baseUrl: 'https://script.google.com/macros/s/AKfy…………/exec',
```

**Checks:**
- [ ] Starts `https://`
- [ ] Ends `/exec` — **not** `/dev`
- [ ] Wrapped in quotes, trailing comma intact
- [ ] No spaces or line breaks inside the URL

### Step 13.3 — Set the production version string

Find line ~24:

```javascript
  version: '2.0.0-dev',
```

Change to:

```javascript
  version: '2.0.0',
```

> **Why.** This string ships in every request envelope as `clientVersion` and
> lands in your execution logs. Leaving `-dev` means production traffic is
> labelled dev forever. *(This is the Low-severity item raised at the start of
> Phase 11 and not yet approved — make the change only if you want it.)*

### Step 13.4 — Confirm the timezone agrees

Find `timezone:` (~line 55). It must read:

```javascript
    timezone: 'Africa/Lagos',
```

It must **exactly match** `appsscript.json`. See §3.2 for why.

---

# Part 14 — Publish the frontend

### Step 14.1 — Remove the development pages *(optional)*

Before uploading, you may delete:

- `gallery.html` and `src/gallery.js` — the component gallery
- `tests/` — both verification harnesses

They contain **no data and no secrets**, so leaving them is safe. Removing
them is tidier. **Keep your local copies** — you need `tests/` for future work.

### Step 14.2 — Deploy to Netlify

1. Go to **https://app.netlify.com/drop**
2. Drag the **entire `FlowTribe-v2` folder** onto the page.
3. Wait for upload.
4. Netlify gives you a URL like `https://cheerful-pastry-a1b2c3.netlify.app`.
5. **Record it.**

### Step 14.3 — Name the site *(optional)*

**Site configuration ▸ Change site name** → something like `flowtribe`, giving
`https://flowtribe.netlify.app`.

**✅ Success:** opening the URL shows the Flow Tribe **login screen** with the
burgundy branding.

**❌ A blank white page** → §23 T-12.

---

# Part 15 — End-to-end production validation

Now validate against the live backend. Work through in order — later steps
depend on earlier ones.

> Open your browser's **developer console** (**F12** → *Console*) and keep it
> visible. It should stay empty. Any red error is a finding.

### 15.1 — Founder login

1. Open your Netlify URL.
2. Enter username `iyanu` and your 6-digit PIN.
3. Click **Log in**.

**✅ Expect:** redirect to the **admin dashboard** (Super Admins land in admin).

**❌ "That username and PIN don't match"** → §23 T-13.

### 15.2 — Admin dashboard

**✅ Expect:** Overview with 8 figures. Most are `0` or `1`. **No error state,
no "Try again" button.**

Click each item in the left sidebar and confirm each loads:

- [ ] Overview
- [ ] Members — one row, `FT-0001`, you
- [ ] Submissions — empty state, worded encouragingly
- [ ] Leaderboard — empty
- [ ] Analytics — 7 charts, mostly flat. **Charts render, not error**
- [ ] Invites — empty
- [ ] Settings — ~15 configurable values
- [ ] Audit log — rows from setup and the smoke test

### 15.3 — Generate an invite code

1. **Invites** → **Generate codes**.
2. Quantity **2**. Click generate.

**✅ Expect:** two codes appear, status `Unused`. Copy one.

**Cross-check:** the spreadsheet's `InviteCodes` tab now has two rows.
**This confirms a real Sheets write.**

### 15.4 — Register a test member

1. **Open a different browser** (or a private window) — you need a second,
   separate session.
2. Go to your Netlify URL → **Create an account**.
3. **Step 1:** full name `Test Member`, username `test.member` — wait for
   **Available** — then a 6-digit PIN twice.
4. **Step 2:** platform **LinkedIn**, weekly goal **3**.
5. **Step 3:** paste the invite code, tick the consent switch.
6. **Create my account**.

**✅ Expect:** the welcome screen, with **Founding Member** unlocked.

**Cross-check the spreadsheet:**
- [ ] `Members` — a new row `FT-0002`
- [ ] `InviteCodes` — that code now `Used`
- [ ] `MemberMilestones` — a `founding-member` row
- [ ] `ActivityCalendar` — a row for `FT-0002`

### 15.5 — Dashboard, submission, and the derived numbers

1. As `test.member`, go to the dashboard.

**✅ Expect:** "Welcome back, Test", ring `0 of 3`, calendar, milestones, and
an empty leaderboard prompt. **No error state.**

2. Click **Submit today's post**.
3. Paste a real LinkedIn URL, e.g.
   `https://www.linkedin.com/posts/example-activity-123456789/`
4. Click **Log this post**.

**✅ Expect:** the success screen — *"Nice work."* — a ring reading **1 of 3**,
and a **First Step** celebration modal.

> **If you instead see *"We couldn't reach Flow Tribe"* on the link field,**
> that is Phase 10 defect **B1** having regressed. Stop and report it. Your
> post was saved regardless — do not retry, you will hit `DUPLICATE_LINK`.

**Cross-check the spreadsheet — this is the most important verification here:**

- [ ] `Submissions` — one new row with the link, `FT-0002`, today's date
- [ ] `ActivityCalendar` — the `DayMap` for `FT-0002` now has a `1` in today's
      position (and is still a **366-character text string**)
- [ ] `WeeklyStats` — a row, post count `1`
- [ ] `Members` — `FT-0002`'s `AllTimePosts` is now `1`
- [ ] `MemberMilestones` — a `first-step` row

**That five-way agreement is the ledger-first design working.**

### 15.6 — Now change the founder PIN *(the §12 item)*

1. Back in your founder browser.
2. Go to **My Dashboard** (the mode switch, top-right) → **Profile**.
3. Change your PIN to something only you know.
4. Log out and back in with the new PIN.

**✅ Expect:** login succeeds; the old PIN is refused.

**Now delete the temporary PIN from your deployment record.**

### 15.7 — Remaining member screens

As `test.member`:

- [ ] **Leaderboard** — you appear with 1 post. Three scopes (week/month/all
      time) all load
- [ ] **Calendar** — today's square filled, gold outline on today
- [ ] **Milestones** — Founding Member and First Step unlocked; the rest show
      progress
- [ ] **Flow Levels** — Seedling current, Creator next with a progress bar
- [ ] **Profile** — name, username, platform, stats, calendar, milestones.
      **No error state**

### 15.8 — Duplicate and platform protection

Still as `test.member`, go to **Submit**:

1. Paste the **same** LinkedIn URL again → **Log this post**.
   **✅ Expect:** *"You've already logged this post."*
2. Paste `https://instagram.com/p/abc123` → **Log this post**.
   **✅ Expect:** a refusal that **names LinkedIn**.
3. Paste `https://notlinkedin.com/posts/x` → **Log this post**.
   **✅ Expect:** refused. *(Domain-suffix matching, not substring.)*

### 15.9 — Session restore

1. As `test.member`, **refresh the page** (F5).
   **✅ Expect:** still logged in, dashboard loads.
2. Close the browser entirely. Reopen. Go to the URL.
   **✅ Expect:** still logged in. Sessions last 30 days.

### 15.10 — Forced PIN change after an admin reset

1. In the **founder** browser: **Admin ▸ Members ▸ Test Member**.
2. Click **Reset PIN**. Enter a temporary 6-digit PIN. Confirm.

**✅ Expect:** success message. **The member's sessions are revoked.**

3. In the **test.member** browser, refresh.
   **✅ Expect:** bounced to login.
4. Log in with the **temporary** PIN.
   **✅ Expect:** routed straight to **Change your PIN** — and you cannot
   navigate away.
5. Set a new PIN.
   **✅ Expect:** the app proceeds to the dashboard.

**Cross-check:** `AuditLog` has a `PIN_RESET` row naming the founder as actor.

### 15.11 — Authorization boundary

This is the check that matters most, because there is no network boundary.

1. As **test.member**, put your admin URL in the address bar:
   `https://your-site.netlify.app/admin.html`

**✅ Expect:** you are **bounced back** to the member dashboard. You never see
an admin screen.

> The redirect is only convenience. The real protection is that every admin
> action is refused server-side. Even a member who edited the JavaScript would
> get an empty frame: every panel is filled by a request the server denies.

2. In the **founder** browser, confirm the mode switch works both ways:
   **Admin ▸ My Dashboard**, then back.

### 15.12 — Member management

As founder, **Admin ▸ Members ▸ Test Member**:

- [ ] **Suspend** — confirm; status becomes `Inactive`
- [ ] The test member's browser: refresh → refused at login
- [ ] **Reactivate** — status returns to `Active`; they can log in again
- [ ] `AuditLog` records both

### 15.13 — Logout

1. **Profile ▸ Log out** in both browsers.
2. **✅ Expect:** returned to login. Refreshing does not restore the session.

**Cross-check:** the `Sessions` tab no longer holds their row.

### 15.14 — Final console check

Both browsers, **F12 ▸ Console**.

**✅ Expect:** no red errors. Warnings from browser extensions are fine.

---

# Part 16 — Production validation record

Fill this in and keep it with the deployment record.

```
PRODUCTION VALIDATION — Flow Tribe
Date: ____________  Validated by: ____________

SMOKE TEST
  Result:                          ALL 27 CHECKS PASSED   [ ] yes  [ ] no
  Total duration:                  ________ ms

LATENCY (from the smoke test log)
  Submission:                      ________ ms   (budget 3000)
  Dashboard:                       ________ ms

STRUCTURE
  [ ] 14 tabs present
  [ ] 16 milestones seeded
  [ ] 6 Flow Levels seeded
  [ ] ~15 Settings rows
  [ ] DayMap column is plain text
  [ ] 6 triggers, no duplicates
  [ ] 5 Script Properties (FT_ADMIN_PIN deleted)
  [ ] setupVerify: OK — 14 sheets, 38 actions

JOURNEYS
  [ ] Founder login → admin
  [ ] All 8 admin screens load
  [ ] Invite generation writes to the sheet
  [ ] Registration end to end
  [ ] Founding Member awarded
  [ ] Dashboard renders every section
  [ ] Submission → success screen with ring
  [ ] Ledger/calendar/stats/counters/milestones all agree
  [ ] Duplicate link refused
  [ ] Wrong platform refused, own platform named
  [ ] Domain lookalike refused
  [ ] Leaderboard, calendar, milestones, levels, profile
  [ ] Session survives refresh and browser restart
  [ ] Admin PIN reset forces a change
  [ ] Member cannot reach admin.html
  [ ] Suspend / reactivate
  [ ] Logout clears the session
  [ ] Zero console errors

SIGN-OFF
  Production ready:   [ ] yes   [ ] no
  Signature: ____________________
```

---

# Part 17 — Deployment checklist

- [ ] Spreadsheet created and named
- [ ] Spreadsheet ID recorded
- [ ] Apps Script project created **from Extensions ▸ Apps Script**
- [ ] Project renamed; Script ID recorded
- [ ] Manifest visible in the editor
- [ ] Project timezone Africa/Lagos
- [ ] All 20 script files copied, names per the table
- [ ] `appsscript.json` replaced
- [ ] 21 files total, no syntax errors
- [ ] 4 Script Properties set
- [ ] `setupAll` run and authorized
- [ ] Final line `OK — 14 sheets, 38 actions, secrets set, Super Admin present.`
- [ ] `FT_ADMIN_PIN` auto-deleted
- [ ] Founder MemberID recorded
- [ ] 14 tabs verified
- [ ] Lookup tables verified
- [ ] DayMap is plain text
- [ ] 6 triggers verified
- [ ] Web app deployed: Execute as **Me**, Access **Anyone**
- [ ] `/exec` URL and Deployment ID recorded
- [ ] `/exec` returns JSON in a browser
- [ ] `setupSmokeTest` → **ALL 27 CHECKS PASSED**
- [ ] Latency recorded
- [ ] Smoke-test member cleaned up; audit rows kept
- [ ] `config.js` created from the example
- [ ] Production `/exec` URL pasted
- [ ] Version string decided
- [ ] Timezone matches the manifest
- [ ] Frontend uploaded to Netlify
- [ ] Site URL recorded
- [ ] All of §15 passed
- [ ] Founder PIN changed; temporary PIN destroyed
- [ ] Validation record completed and signed

---

# Part 18 — Rollback procedure

**Nothing here is irreversible while the database is empty.** Decide which
case you are in.

### Case A — Setup failed, no members registered

Simplest path is to start over.

1. Apps Script ▸ **⚙ Project Settings ▸ Script Properties** — delete every
   `FT_` property.
2. Spreadsheet — right-click each of the 14 tabs ▸ **Delete**. Or delete the
   whole spreadsheet and begin at §1.
3. Triggers — **⏰ Triggers**, delete all 6.
4. Re-run from §6.

> **Deleting `FT_PIN_PEPPER` is safe *only* while no real member has a PIN.**
> After that it destroys every credential in the community.

### Case B — Web app deployed but broken, no members yet

1. **Deploy ▸ Manage deployments**.
2. Select the deployment ▸ **⋮ ▸ Archive**.
3. Fix the problem.
4. Create a **new deployment** (new URL) and update `config.js`.

### Case C — Members have registered and something is wrong

**Do not delete anything.** The ledger is the only irreplaceable asset.

1. **Back up first:** spreadsheet ▸ **File ▸ Make a copy** →
   `Flow Tribe — Production BACKUP <date>`.
2. To revert code: **Deploy ▸ Manage deployments ▸ ✏️ edit ▸ Version** → pick
   the previous version → **Deploy**. The URL stays the same.
3. To repair data: run `jobNightlyReconcile` manually. It rebuilds **every**
   derived value from `Submissions`.

> **The recovery guarantee.** As long as `Submissions` is intact, every other
> sheet can be reconstructed. That is the entire reason the ledger is
> append-only and written first.

### Case D — Take the site down quickly

**Netlify ▸ Site configuration ▸ Danger zone ▸ Stop site.** The backend keeps
running; nobody can reach it. Reversible in one click.

---

# Part 19 — Updating the code later

**Read this before your first update — the wrong choice is easy to make and
silently strands everyone on old code.**

1. Edit the file(s) in the Apps Script editor. Save.
2. **Deploy ▸ Manage deployments**.
3. Click the **✏️ pencil** on the **existing** deployment.
4. **Version** → **New version**.
5. Add a description. Click **Deploy**.

> **⚠️ Do NOT click "New deployment".** That creates a **new URL** and leaves
> every member pointed at the old code, which keeps working — so nothing
> appears broken and you may not notice for days.

Frontend changes: edit locally, re-drag the folder to Netlify.

---

# Part 20 — Post-deployment validation checklist (first week)

**Day 1**
- [ ] Founder PIN changed
- [ ] `Sessions` tab has rows for real logins
- [ ] `AuditLog` growing

**Day 2 — after `jobNightlyReconcile` (~01:00)**
- [ ] Apps Script ▸ **Executions** shows it **Completed**
- [ ] No `ROLLUP_PENDING` rows in `AuditLog`
- [ ] Counters still match the ledger

**Day 2 — after `jobDailyRollup` (~23:00)**
- [ ] `CommunityStats` has a row for yesterday

**First Monday — after `jobWeeklyRollover` (~00:05)**
- [ ] Execution **Completed**
- [ ] `WeeklyStats` has `RankFinal` values for last week
- [ ] Streaks advanced for members who met their goal
- [ ] Top 10 / Weekly Champion awarded

**Ongoing**
- [ ] **Executions** shows no red failures
- [ ] `Sessions` not growing without bound (sweep is working)
- [ ] Weekly: **File ▸ Make a copy** as a backup

---

# Part 21 — What is deliberately not in this deployment

So you are not surprised. Each was a decision, recorded in
`FINAL_PRODUCT_DECISIONS.md` §5.

| Not present | Why |
|---|---|
| Email/password login | Username + 6-digit PIN, by decision |
| Self-service PIN recovery | Admin reset only; the error copy says so |
| Notification delivery | The outbox is written; no worker sends yet |
| Member Settings screen | Deferred |
| Profile photos | Deferred; the seams exist |
| Moderation queue, export | Design-doc backlog, not approved for build |
| Marketing landing page | Not approved for build |
| Consistency Score | Paused pending an agreed definition |

---

# Part 22 — Known production issues

| # | Issue | Severity | Impact |
|---|---|---|---|
| K3 | Submission latency was never measured | Medium | **Closes at §11.1** |
| K4 | Lock contention untested under real concurrency | Low | Needs real simultaneous submissions |
| K7 | Idempotency key is client-supplied | Medium | Bounded by the daily cap and duplicate-link detection |
| K8 | No self-service PIN recovery | Low | Admin reset |
| K13 | Registration Back button exits the flow | Low | Deferred; navigation is frozen |
| — | `version: '2.0.0-dev'` | Low | Cosmetic; log labelling only. §13.3 |

---

# Part 23 — Troubleshooting

### T-1 · `Bind this script to a spreadsheet first.`
You created a standalone Apps Script project. There is no `FT_SPREADSHEET_ID`
override by design (§1). **Fix:** delete the project, open the spreadsheet, and
use **Extensions ▸ Apps Script** (§2.1).

### T-2 · `ReferenceError: X is not defined`
A file was missed or pasted empty. **Fix:** compare your file list against the
§4.2 table. Open the file that should define `X` and confirm it has content.

### T-3 · `Missing global: <Name>` in `setupVerify`
Same cause as T-2, or two files were pasted into one tab. **Fix:** open the
named file, confirm it starts with the repo file's comment block and is not
duplicated.

### T-4 · `FAILED (n):` with `Missing sheet: <Name>`
`setupBootstrap` did not finish, or a tab was deleted. **Fix:** run
`setupBootstrap` alone, then `setupVerify` again.

### T-5 · `<Sheet> column N: expected "X", found "Y"`
Headers were edited by hand, or an old sheet is being reused. **Fix:** on a
fresh install, delete that tab and re-run `setupBootstrap`. **On a live
system, stop** — a header edit may mean data has shifted columns.

### T-6 · `Catalog milestone "x" has no evaluator`
`MilestoneCatalog` was hand-edited. **Fix:** delete the offending row and
re-run `setupSeedCatalog`. *(Left alone, that milestone silently never unlocks
— which is exactly why this check exists.)*

### T-7 · `PIN: <message>` during `setupSeedSuperAdmin`
Your `FT_ADMIN_PIN` is not exactly six digits, or is a repeat/sequence/common
PIN. **Fix:** set a different `FT_ADMIN_PIN` and re-run.

### T-8 · `FT_ADMIN_PLATFORM must be one of: LinkedIn, X, Instagram, TikTok, YouTube`
Exactly what it says — the value is case-sensitive. **Fix:** correct the
property and re-run.

### T-9 · The consent screen asks for more than two scopes
Your `appsscript.json` did not save, or the manifest checkbox was off when you
edited it. **Fix:** click **Cancel**, redo §3.1 and §4.3, save, and run again.

### T-10 · The `/exec` URL shows a Google error page
Access is not set to **Anyone**, or you copied the `/dev` URL. **Fix:**
**Deploy ▸ Manage deployments ▸ ✏️** and confirm *Who has access: Anyone*. Copy
the URL ending `/exec`.

### T-11 · `ALL 27 CHECKS PASSED` never appears; it stops partway
The smoke test **stops at the first failure** by design — later checks depend
on earlier ones. Read the last `FAIL` line; its message names the cause. Fix
that, then re-run. Cleanup always runs, so no test member is left behind.

### T-12 · The Netlify site is a blank white page
Open **F12 ▸ Console**.
- `Failed to load module script` / MIME type → you uploaded the *contents* of
  the folder rather than the folder, or a file is missing. Re-drag the whole
  `FlowTribe-v2` folder.
- `Cannot find module './core/config.js'` → you did not create `config.js`
  (§13.1).

### T-13 · Founder login says the username and PIN don't match
- Username is case-folded but must otherwise match `FT_ADMIN_USERNAME` exactly.
- The PIN is the one you set **before** running `setupAll` — it is hashed and
  **not recoverable**.
- **If it is genuinely lost:** in the spreadsheet, delete the `FT-0001` row
  from `Members`, set `FT_ADMIN_PIN` again in Script Properties, and re-run
  `setupSeedSuperAdmin`. **Only safe while you are the only member.**

### T-14 · "We couldn't reach Flow Tribe" on every screen
- `baseUrl` in `config.js` is wrong, still the placeholder, or ends `/dev`.
- Confirm by opening the `/exec` URL directly (§10.5) — JSON means the backend
  is fine and the problem is `config.js`.

### T-15 · A member's calendar shows `0.00E+00` or an empty year
The `DayMap` column lost its plain-text format. **Fix:** select column D on
`ActivityCalendar` ▸ **Format ▸ Number ▸ Plain text**, then run
`jobNightlyReconcile` to rebuild from the ledger.

### T-16 · Triggers exist but never fire
Check **Executions** in the editor. If they show *Failed*, open one and read
the error. Trigger authorization is separate from web-app authorization — if
the account's grant was revoked, re-run `setupInstallTriggers` and re-authorize.

### T-17 · `Exceeded maximum execution time`
A job hit the 6-minute ceiling. `jobNightlyReconcile` is cursor-based and
resumes on its next run, so this self-heals. If it persists, the community has
outgrown a full-scan reconcile — raise it rather than patching in production.

---

# Part 24 — Final production sign-off

Do not announce the community until every line is ticked.

**Deployment**
- [ ] Every item in §17 complete
- [ ] Deployment record filled in and stored somewhere safe
- [ ] Temporary founder PIN destroyed

**Verification**
- [ ] `setupVerify` → `OK — 14 sheets, 38 actions, secrets set, Super Admin present.`
- [ ] `setupSmokeTest` → `ALL 27 CHECKS PASSED`
- [ ] Every §15 journey passed against the live backend
- [ ] Submission latency recorded and within budget *(or the overage recorded
      and a decision taken)*
- [ ] Zero console errors
- [ ] Zero failed executions

**Security**
- [ ] Exactly two OAuth scopes granted
- [ ] Web app: Execute as **Me**, Access **Anyone** — understood, not assumed
- [ ] Founder PIN changed from the temporary one
- [ ] `FT_ADMIN_PIN` gone from Script Properties
- [ ] **Spreadsheet sharing checked** — click **Share** and confirm it is
      **not** "Anyone with the link". It holds every member's PII.
      *This cannot be enforced in code. It is yours to get right.*
- [ ] A backup copy of the spreadsheet exists

**Operations**
- [ ] 6 triggers installed and verified
- [ ] You know how to publish a new **version** (§19) and why "New deployment"
      is the wrong button
- [ ] You have read the rollback procedure (§18)
- [ ] Post-deployment checklist (§20) diarised for the first week

**Launch readiness**
- [ ] Founding-cohort invite codes generated
- [ ] Founding-member cutoff date confirmed in `Settings`
      *(currently `2026-08-01` — decision D8, confirm before launch)*
- [ ] You have logged in as a real member on a real phone, on mobile data

---

**Signed off by:** ____________________  **Date:** ____________

> Once this page is fully ticked, Phase 11 is complete and Flow Tribe is live.
> Phase 12 — Beta & Public Launch — begins with the founding cohort.
