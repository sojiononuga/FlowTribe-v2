# Production Checklist

Run through this before the first member gets a link. Roughly 20 minutes.

---

## 1. Deployment

- [ ] Spreadsheet created and named
- [ ] All 20 script files pasted, `Code.gs` deleted
- [ ] `appsscript.json` replaced with the project's manifest
- [ ] `FT_ADMIN_*` script properties set
- [ ] `setupAll` run, log ends with **`OK —`**
- [ ] `FT_ADMIN_PIN` is **gone** from Script Properties (setup deletes it)
- [ ] `FT_PIN_PEPPER` and `FT_SESSION_KEY` present
- [ ] Web app deployed: **Execute as Me**, **Access Anyone**
- [ ] `/exec` URL returns the health JSON in a browser
- [ ] `setupSmokeTest` reports **ALL 27 CHECKS PASSED**
- [ ] `config.js` created with the real URL
- [ ] Front end deployed, member link opens the login screen

## 2. Spreadsheet

- [ ] 14 tabs present
- [ ] Timezone is **Africa/Lagos** (File ▸ Settings)
- [ ] `MilestoneCatalog` has 16 rows
- [ ] `FlowLevels` has 6 rows
- [ ] `Settings` has its default rows
- [ ] `Members` has exactly **one** row — yours, `Role = SuperAdmin`
- [ ] `ActivityCalendar` column C is formatted **Plain text**
- [ ] Sharing: only people who should read PINs and phone numbers

## 3. Your account

- [ ] You can log in with your username and PIN
- [ ] **You changed the PIN from inside the app**
- [ ] Login sends you to the admin dashboard
- [ ] "My Dashboard" switches to the member view
- [ ] Your name renders correctly in the greeting

---

## 4. Member journeys

Do these as a real test member, on a phone if possible.

### Registration
- [ ] Generate an invite code from the admin dashboard
- [ ] Code is 8 characters, no `0`, `O`, `1`, `I`, or `L`
- [ ] Register with it — all three steps
- [ ] Welcome screen appears
- [ ] **The same code is refused a second time**
- [ ] A weak PIN (`123456`) is refused
- [ ] A taken username is refused

### Login and session
- [ ] Log out, log back in
- [ ] Close the tab, reopen — **still signed in**
- [ ] Wrong PIN gives a clear message
- [ ] Five wrong PINs trigger increasing delays, never a permanent lock

### Dashboard
- [ ] Greeting shows the member's real first name
- [ ] Progress ring shows 0 of their goal
- [ ] Activity calendar renders, today is marked
- [ ] Streak, longest streak, lifetime posts all show 0
- [ ] Flow Level shows **Seedling**
- [ ] Leaderboard says *"Post this week to join the leaderboard"* — **not** a rank of 0

### Submitting
- [ ] Post a real link on the registered platform — accepted
- [ ] Success animation plays, dashboard updates **without a reload**
- [ ] **First Step** milestone modal appears
- [ ] Same link again → *"You've already logged this post."*
- [ ] Link from a different platform → names the registered platform
- [ ] Nonsense text → *"That doesn't look like a link."*

### The rest
- [ ] Calendar square filled for today, hover shows the count
- [ ] Milestones screen: earned and locked, next milestone with progress
- [ ] Flow Levels: current level, progress to next, full ladder
- [ ] Leaderboard: member appears after posting
- [ ] Profile: details, stats, calendar, milestones
- [ ] Every screen works on a phone with no sideways scrolling

---

## 5. Admin

- [ ] Overview shows all eight figures, and they look right
- [ ] Member list: search, and all four filters
- [ ] Member detail: full record, contact details, calendar
- [ ] Edit a member — change persists after reload
- [ ] Reset a PIN — their session dies, next login forces a change
- [ ] Suspend — **they cannot log in**
- [ ] Reactivate — they can again
- [ ] Submissions: filters work, links open in a new tab
- [ ] Void a submission — the member's totals drop
- [ ] Leaderboard: all three scopes, all three sorts, **no way to edit a score**
- [ ] Analytics: all seven charts render
- [ ] Invites: generate a batch, copy, revoke
- [ ] Settings: change a value, reload, it persisted
- [ ] Audit log: your actions are all listed

---

## 6. Permissions

The part worth being slow about.

### As a plain Member
- [ ] Opening `/admin.html` redirects to the member dashboard
- [ ] No admin data is visible at any point

### As a Community Manager
Promote your test member, then log in as them.

- [ ] Lands on the admin dashboard
- [ ] Sees **6** nav items — **no Settings, no Audit**
- [ ] Typing `#/audit` in the URL bounces back to the overview
- [ ] Can manage members, submissions, invites, analytics
- [ ] Has their own member dashboard via "My Dashboard"

### As Super Admin
- [ ] Sees all 8 nav items
- [ ] Can change roles, settings, and read the audit log
- [ ] **Cannot demote or suspend yourself** if you are the only Super Admin

---

## 7. Errors

Each should give a clear, human message — never a stack trace.

- [ ] Wrong platform link
- [ ] Duplicate link
- [ ] Nonsense URL
- [ ] Invalid invite code
- [ ] Used invite code
- [ ] Wrong PIN
- [ ] Expired session → returns to login with an explanation
- [ ] Turn off wifi mid-action → connection message with a retry

---

## 8. Security

- [ ] `Members` sheet: `PinHash` and `PinSalt` are long hex, **no readable PINs**
- [ ] `Sessions` sheet: `SessionID` is a 64-character hash, not a token
- [ ] `AuditLog` contains **no PINs**, including failed ones
- [ ] Type `=1+1` into a bio → stored as text, **does not become a formula**
- [ ] Spreadsheet is not shared publicly
- [ ] The two secret properties exist and are untouched

---

## 9. Jobs

- [ ] Six triggers listed under the clock icon
- [ ] Run `jobNightlyReconcile` by hand — **numbers do not change** (it is idempotent)
- [ ] Run `jobDailyRollup` — a row appears in `CommunityStats`

---

## 10. Before sharing the link

- [ ] Every box above ticked
- [ ] Test member and their submissions deleted, or kept deliberately
- [ ] A backup copy of the spreadsheet made
- [ ] Invite codes generated for the first cohort
- [ ] You know how to reset a PIN when someone forgets one

---

## If a check fails

1. **Apps Script ▸ Executions** — the error and its stack
2. **`setupVerify()`** — checks the whole installation
3. **`AuditLog`** — what was attempted and refused
4. [`deployment.md`](deployment.md) troubleshooting table

Nothing here is expected to fail. If something does, it is worth understanding
rather than working around — every item on this list is here because getting it
wrong would be felt by a member.
