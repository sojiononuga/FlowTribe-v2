# Deploying Flow Tribe

Everything needed to put Flow Tribe live. Written for someone who has never
deployed anything — no terminal, no installs, just a browser and a Google
account.

**About 30 minutes.** Read it through once before starting.

---

## What you are building

```
Members' phones                Google Apps Script            Google Sheets
─────────────────              ──────────────────            ─────────────
index.html      ──── POST ───▶  doPost                ────▶   Members
admin.html                      auth · rules · jobs           Submissions
(static files)  ◀─── JSON ────  the whole backend     ◀────   …12 more tabs
```

Three things: a **spreadsheet** (the database), a **script** bound to it (the
backend), and **two HTML files** on any static host (the app). Nothing else,
and nothing to pay for.

---

## Part 1 — The spreadsheet

1. Go to **sheets.google.com** → **Blank spreadsheet**
2. Name it **Flow Tribe — Live** (top left)

That is all. The script creates every tab itself.

> **Do not reuse the v1 tracker.** v2 starts empty by design and uses a
> different structure. Pointing at v1's sheet would mix two schemas.

---

## Part 2 — The script

From your new spreadsheet: **Extensions ▸ Apps Script**.

A new tab opens with an empty `Code.gs`. Rename the project to **Flow Tribe
API** by clicking "Untitled project" at the top left.

### 2a. Add the code files

Apps Script runs every file in one shared space, in **alphabetical order**, so
the number prefixes are not decoration — they control what loads first.

For each row below: click **+** next to *Files* → **Script** → type the name →
paste the file contents. Apps Script adds `.gs` itself, so leave the extension
off.

| Name it | Paste from |
|---|---|
| `00_Config` | `appsscript/00_Config.gs` |
| `01_Errors` | `appsscript/01_Errors.gs` |
| `02_Envelope` | `appsscript/02_Envelope.gs` |
| `03_Router` | `appsscript/03_Router.gs` |
| `04_FtWeek` | `appsscript/lib/FtWeek.js` |
| `05_FtDayMap` | `appsscript/lib/FtDayMap.js` |
| `06_FtStreak` | `appsscript/lib/FtStreak.js` |
| `07_FtLink` | `appsscript/lib/FtLink.js` |
| `08_FtIdentity` | `appsscript/lib/FtIdentity.js` |
| `09_FtAchievements` | `appsscript/lib/FtAchievements.js` |
| `10_Infra` | `appsscript/infra/Infra.gs` |
| `11_Repositories` | `appsscript/repositories/Repositories.gs` |
| `12_CoreServices` | `appsscript/services/CoreServices.gs` |
| `13_DomainServices` | `appsscript/services/DomainServices.gs` |
| `14_Middleware` | `appsscript/middleware/Middleware.gs` |
| `15_Orchestrators` | `appsscript/orchestrators/Orchestrators.gs` |
| `16_Controllers` | `appsscript/controllers/Controllers.gs` |
| `17_Jobs` | `appsscript/jobs/Jobs.gs` |
| `18_Setup` | `appsscript/setup/Setup.gs` |
| `19_SmokeTest` | `appsscript/setup/SmokeTest.gs` |

Then **delete the empty `Code.gs`** (three dots beside it → Delete).

### 2b. Set the manifest

Click the **gear** (Project Settings) → tick **Show "appsscript.json" manifest
file in editor**.

Go back to the editor, open `appsscript.json`, and replace everything in it
with the contents of `appsscript/appsscript.json`.

This sets the timezone to Africa/Lagos, the modern JavaScript runtime, and the
permissions the script needs.

> **The timezone matters more than it looks.** Every week boundary, streak, and
> calendar square depends on it. Get it wrong and streaks break on the wrong
> day.

**Save** (Ctrl/Cmd + S).

---

## Part 3 — Your Super Admin account

Your account is configured in **Project Settings**, not in the code — so your
real PIN never has to be typed into a file.

Gear icon → **Project Settings** → scroll to **Script Properties** → **Add
script property**, four times:

| Property | Value | Notes |
|---|---|---|
| `FT_ADMIN_FULLNAME` | `Iyanuoluwa Ilesanmi` | Shown on your dashboard |
| `FT_ADMIN_USERNAME` | `iyanuoluwa` | Lowercase letters, numbers, dots |
| `FT_ADMIN_PIN` | *a 6-digit PIN* | Not `123456` or `111111` |
| `FT_ADMIN_PLATFORM` | `Instagram` | Or LinkedIn, X, TikTok, YouTube |

**Save script properties.**

> Setup **deletes `FT_ADMIN_PIN` automatically** once your account is created.
> It exists only long enough to make the account; leaving a working PIN sitting
> in project settings would defeat the point of hashing it.

### All script properties

| Property | Set by | Purpose |
|---|---|---|
| `FT_ADMIN_FULLNAME` | you | Founder account name |
| `FT_ADMIN_USERNAME` | you | Founder login |
| `FT_ADMIN_PIN` | you, then auto-deleted | Founder's first PIN |
| `FT_ADMIN_PLATFORM` | you | Founder's platform |
| `FT_PIN_PEPPER` | **setup, automatically** | Secret that makes leaked PIN hashes useless. **Never change or delete this** |
| `FT_SESSION_KEY` | **setup, automatically** | Session signing secret |

---

## Part 4 — Run setup

In the editor toolbar there is a function dropdown. Select **`setupAll`** and
click **Run**.

### The permission prompt (first run only)

1. **Review permissions**
2. Choose your Google account
3. *"Google hasn't verified this app"* → **Advanced** → **Go to Flow Tribe API (unsafe)**
4. **Allow**

This is your own script asking to use your own spreadsheet. The warning is
Google's standard notice for anything not published to their marketplace.

### What `setupAll` does

| Step | What happens |
|---|---|
| `setupSecrets` | Generates the two secrets into Script Properties |
| `setupBootstrap` | Creates all 14 tabs with headers and formatting |
| `setupSeedCatalog` | 16 milestones, 6 Flow Levels, default settings |
| `setupSeedSuperAdmin` | Your account, then deletes `FT_ADMIN_PIN` |
| `setupInstallTriggers` | The 6 scheduled jobs |
| `setupVerify` | Checks everything above is coherent |

### Check the result

Open **Execution log** (bottom of the editor). The last line should start:

```
OK — 14 sheets, 38 actions, secrets set, Super Admin present.
```

Anything starting `FAILED` lists exactly what is wrong and what to run.

---

## Part 5 — Publish the web app

1. **Deploy ▸ New deployment**
2. Click the **gear** beside "Select type" → **Web app**
3. Fill in:
   - **Description:** `v1`
   - **Execute as:** **Me**
   - **Who has access:** **Anyone**
4. **Deploy**
5. **Copy the Web app URL** — it ends in `/exec`. Keep it somewhere.

### Why "Anyone" is correct and safe

Members do not have Google accounts on this system, so the browser must be able
to reach the endpoint without signing in to Google. **"Anyone" is required for
the app to work at all.**

It is also exactly why every single action checks permissions in code. There is
no network wall; the code is the wall. A stranger reaching the URL can call
`system.health` and try to log in — and nothing else. Every other action
requires a valid session, and every admin action requires the right role.

### Check it works

Paste the `/exec` URL into a browser. You should see:

```json
{"ok":true,"data":{"service":"Flow Tribe API","version":"2.0.0","status":"ok"}}
```

If you get a Google error page instead, the access setting is wrong — redo
step 3 and make sure it says **Anyone**, not "Anyone with a Google account".

---

## Part 6 — Verify with the smoke test

This is the most valuable ten seconds of the deployment.

Select **`setupSmokeTest`** from the function dropdown → **Run** → open the
**Execution log**.

It creates a temporary member, runs them through every journey — register, log
in, post, streaks, calendar, milestones, leaderboard, admin views — checks the
numbers, then **deletes everything it created**. It is safe to run on a live
community.

You want:

```
FLOW TRIBE — PRODUCTION SMOKE TEST
ALL 27 CHECKS PASSED
```

Any failure names the exact step. See Troubleshooting below.

> The test leaves its audit-log entries in place, deliberately. An audit log a
> test can erase is not an audit log.

---

## Part 7 — Publish the app

1. Copy `src/core/config.example.js` to `src/core/config.js`
2. Open it and set your URL:

```javascript
baseUrl: 'https://script.google.com/macros/s/AKfy…/exec',
```

3. Go to **app.netlify.com/drop** and drag the whole `FlowTribe-v2` folder onto
   the page

You get a public link immediately. That link is the member app; add
`/admin.html` for the admin dashboard.

`config.js` is git-ignored, so your URL never ends up in the repository.

Optional: delete `gallery.html` and `tests/` from a public deploy. Neither
holds data, so leaving them is harmless.

---

## Updating after a code change

**Editing the code is not enough.** You must publish a new version:

1. **Deploy ▸ Manage deployments**
2. Click the **pencil** on your existing deployment
3. **Version ▸ New version**
4. **Deploy**

The URL stays the same, so nothing on the front end changes.

> Creating a *new deployment* gives you a *new URL* and leaves everyone on the
> old code. Almost always you want a new **version** of the existing one.

For front-end changes, drag the folder onto Netlify again.

---

## Troubleshooting

| What you see | Why | Fix |
|---|---|---|
| Google error page instead of JSON | Access is not "Anyone" | Redo Part 5 step 3 |
| `Cannot read properties of null` during setup | Script is not attached to a spreadsheet | Open it via **Extensions ▸ Apps Script** *from the sheet* |
| `No spreadsheet` in the log | Same as above | The script must be bound. There is no override - see below |
| `Missing sheet "Members"` | A tab was deleted | Run `setupBootstrap()` |
| `setupVerify` says a global is missing | A file was not pasted, or misnamed | Check the table in Part 2a |
| `setupVerify` says a milestone has no evaluator | A catalog ID does not match the code | Fix the ID in the `MilestoneCatalog` tab |
| Milestones never unlock | Same cause — it fails silently otherwise | Run `setupVerify()` |
| Streaks look a week out | Spreadsheet timezone is wrong | **File ▸ Settings ▸ Timezone** → Lagos, then run `jobNightlyReconcile` |
| Day map shows `1E+300` | The DayMap column lost its text format | Format column C of `ActivityCalendar` as **Plain text**, then run `jobNightlyReconcile` |
| Everyone logged out at once | `FT_SESSION_KEY` changed | Expected — members log in again |
| Nobody can log in at all | `FT_PIN_PEPPER` changed or was deleted | **Serious.** Every PIN must be reset. Never delete this property |
| A member's numbers look wrong | A rollup lagged | Admin ▸ member ▸ **Recalculate stats**, or wait 15 minutes |
| "Flow Tribe is not connected yet" | `config.js` has no URL | Part 7 step 2 |
| Login works, everything else fails | You published code without a new version | **Manage deployments ▸ New version** |

### Where to look when something is wrong

1. **Apps Script ▸ Executions** — every request, with errors and stack traces
2. **The `AuditLog` tab** — who did what, including failures
3. **`setupVerify()`** — checks the whole installation in one run
4. **`setupSmokeTest()`** — proves the journeys still work

Members never see technical detail; it all goes to the execution log. That is
deliberate, and it is why the log is the first place to look.

---

## Backups

**Automatic:** Sheets keeps full version history — **File ▸ Version history ▸
See version history**. Nothing to set up.

**Monthly, by hand:** **File ▸ Make a copy**, name it
`Flow Tribe — Backup 2026-08`.

**What actually matters:** the `Submissions` tab. Every other derived number —
streaks, calendars, milestones, levels, leaderboards — can be rebuilt from it
by running `jobNightlyReconcile`. Protect the ledger and you have protected
everything.

### If something goes badly wrong

1. **File ▸ Version history** → restore to before the damage
2. Run `setupVerify()` to confirm the structure is intact
3. Run `jobNightlyReconcile()` to rebuild every derived number
4. Run `setupSmokeTest()` to confirm the journeys work

---

## The scheduled jobs

Installed by setup; visible under the **clock icon** in the editor.

| Job | When | What it does | If it misses a run |
|---|---|---|---|
| `jobWeeklyRollover` | Mon 00:05 | Settles last week's ranking, awards Top 10 and Weekly Champion, updates streaks | The next run catches it up |
| `jobNightlyReconcile` | 01:00 | Rebuilds every derived number from the ledger | Numbers stay as they were; next run fixes them |
| `jobRollupRepair` | every 15 min | Repairs any member whose stats lagged | Retries indefinitely |
| `jobSessionSweep` | 02:00 | Deletes expired sessions | A few extra rows |
| `jobInviteExpiry` | 02:15 | Marks stale invite codes expired | Expiry is also checked at redemption |
| `jobDailyRollup` | 23:00 | Snapshots the day's numbers for analytics | That day's chart point is missing |

Every job is safe to run by hand at any time.

---

## Using clasp instead (optional)

Better once you are live, because the browser editor is how v1 ended up with
four different versions of its backend.

```bash
npm install -g @google/clasp
clasp login
clasp clone <SCRIPT_ID>
```

`SCRIPT_ID` is in **Project Settings**. Then edit files here and push:

```bash
clasp push
```

Copy `.clasp.json.example` to `.clasp.json` and fill in the ID — it is
git-ignored because it points at one person's project.

**Once clasp is set up, never edit in the browser editor again.**
