# v1 Audit — Reuse / Refactor / Rebuild

Inspection of the existing application in the parent folder. Nothing was modified.

> **Status note.** v2 launches as a fresh application with an empty database — **there is no
> migration**. "Reuse" below means reusing *design and knowledge*: the brand, the streak rules, the
> UX decisions that worked. It does not mean importing data. v1's members, submissions, PINs, and
> Google Form are reference material only.
>
> This document is kept because the defects it catalogues are the reasons v2's architecture looks
> the way it does. It is a record of what not to repeat.

## What v1 actually is

| File | Role |
|---|---|
| `flow-tribe-submit.html` | 207 lines. Log-a-post form. All CSS + JS inline. Apps Script URL still a placeholder. |
| `flow-tribe-streak.html` | 237 lines. PIN gate → dashboard (ring, 3 stat tiles) + inline log box. All CSS + JS inline. Live deployment URL hardcoded. |
| `Create-Flow-Tribe-Form.gs` | Builds the 12-question "Join The Flow Tribe" Google Form. |
| `PIN-Gate-Setup.md` | Contains the *current* backend (`doGet` + `doPost`) as a markdown code block. |
| `Streak-Page-Setup.md` | Contains an *older* backend, superseded. |
| `Deploy-Guide-HTML-and-Sheet.md` | Contains an *even older* `doPost`, superseded. |
| `Onboarding-Form-Sync.md` | Contains `onFormSubmit`, the Form → Members trigger. |
| `Flow-Tribe-Tracker-LIVE.xlsx` | Google Sheet: Read Me, Submissions, Members, This Week, Leaderboard. |

Roughly 55 further files are content and operations material (playbooks, decks, flyers, message
sequences). Those are the business, not the app — v2 leaves them where they are.

---

## ✅ Reuse

**Brand tokens.** Both pages define the same palette. Lift verbatim into `styles/tokens.css`:
`--burgundy:#6E1320` · `--burgundy-d:#530E18` · `--gold:#EAA00C` · `--burgundy-l:#fbeef0`
`--bg:#faf6f6` · `--ink:#3a2a2c` · `--muted:#8a7375` · `--line:#e7d6d8` · `--green:#2E7D32`.
Type: Baloo 2 (numerals/logo), Poppins (logo chips), Georgia (everything else).

**The logo lockup.** The pure-CSS "THE Flo[w] TRIBE" treatment is genuinely good and matches the
brand. Keep the technique — but v2 should also wire in the real assets, which *do* exist in the
parent folder (`flow-tribe-logo-transparent.png`, `Flowtribe Logo.jpeg`). The v1 handoff note says
the PNG "didn't reach the workspace"; it is there now.

**The dashboard UX.** Gold progress ring toward the weekly goal + three stat tiles (week streak,
all-time posts, leaderboard rank) is the right information design. Carry it over unchanged.

**Streak business rules.** These are correct and should be preserved exactly, just extracted from
the backend into tested pure functions:
- Week starts **Monday**, local midnight.
- Weekly goal = **3 posts**.
- Streak = consecutive weeks with **≥3** posts.
- The **current week never breaks** a streak — it only extends it once 3 is hit.
- Rank = 1 + (number of members with a strictly higher all-time total). Ties share a rank.

**Google Sheets as the data store.** Free, and the operator can read and fix it without a developer.
That is the right call for a ₦1,000/month community and stays in v2 — as a pattern, with a new,
empty spreadsheet.

**The onboarding questions.** v1's form asked good things: platform choice, a one-line bio, a
feature-consent question. v2 keeps the *questions* — consent moves into registration, bio into the
optional profile — and drops the Google Form itself in favour of a real registration screen.

**The guides.** The written content is clear and non-technical. It gets restructured into `docs/`,
not rewritten from scratch.

---

## 🔧 Refactor

**Everything is inlined and duplicated.** The logo CSS, the colour block, the form-field styles,
the platform list, and the fetch logic are copy-pasted across both HTML files. A brand change means
editing two files in two places. → shared `styles/`, `src/components/`, `src/lib/`.

**The backend has no source of truth.** Three markdown files each contain a different version of
`doGet`/`doPost`, and the live deployment is a fourth copy pasted into the Apps Script editor.
Nobody can tell which is running. → real `.gs` files in `appsscript/` with `appsscript.json`,
edited in the repo and pushed (clasp), never edited in the browser.

**Full-scan stats.** `doGet` reads the entire Submissions range and rebuilds every member's totals
on every single request, just to answer for one person. Fine at 50 members; degrades badly as rows
accumulate. → cache the aggregate (Apps Script `CacheService`), invalidate on write.

**Spreadsheet dashboards cap at 30 members.** The This Week and Leaderboard formulas are
range-bound. The stated target is 50 founding members and the stretch is 60+, so v1 breaks
*before the goal is reached*. → compute leaderboard server-side, treat the sheet tabs as a
convenience view rather than the mechanism.

**The 1300 ms guess.** After logging, the streak page waits `setTimeout(..., 1300)` and hopes the
sheet has written before it refetches. It's a race. → have the write endpoint return the updated
stats in its response.

---

## 🔨 Rebuild

**Write confirmation is fake.** Posts are sent with `fetch(url, { mode: 'no-cors' })`, which makes
the response permanently opaque — the promise resolves even when the server returns an error. The
UI shows the green "Logged!" checkmark whether or not the row was ever written. A member can be
told their post counted when it didn't. This is the most serious defect in v1 and the one most
likely to cost trust during the challenge month.

**Auth is not auth.** The PIN is:
- stored **in plaintext** in Members column D;
- sent as a **URL query parameter** (`?action=stats&name=…&pin=…`), so it lands in browser
  history, referrer headers, and Apps Script execution logs;
- **not rate-limited**, so a 4-digit PIN is exhaustible in ~10,000 requests;
- checked with no session afterward — every refresh re-sends the PIN.

v1's own docs are honest that this "stops casual snooping, not a determined person." That's a
defensible call for a trusting group, but it should be a *decision*, not an accident of design.
v2 should at minimum move the PIN out of the query string and issue a short-lived signed token.

**Identity is a free-text name.** Submissions rows are keyed on whatever string the member typed.
"Amaka" and "amaka " are two different people to the streak counter, and the form's own hint —
*"Type it the same way every time so your streak counts correctly"* — puts the burden on the
member. Meanwhile the PIN gate matches case-insensitively against Members, so the two halves of
the system don't even agree on what a name is. → assign a stable member ID, and never let a typo
fork someone's streak.

**No duplicate or abuse protection.** The same URL can be submitted unlimited times; nothing caps
posts per day; validation is `type="url"` and nothing more. A member can trivially — or
accidentally, via a double-tap — inflate their standing on a leaderboard that decides public
recognition. → dedupe by normalised URL, cap per member per day, validate that the host matches
the declared platform.

**No tests, no build, no config.** Zero test coverage on streak math that determines who gets
celebrated. Secrets and deployment URLs are hardcoded into committed files (including a stray
`";;` typo on line 156 of the streak page). → `tests/` from day one, config injected at build.

---

## How each defect was answered

| v1 defect | v2 answer |
|---|---|
| Fake write confirmation (`no-cors`) | `POST` on `text/plain`, real readable response, stats returned with the write |
| PIN in a query string, plaintext, unlimited attempts | 6-digit PIN, hashed with salt + server-side pepper, `POST` body, lockout after 5 |
| Free-text name as identity | `MemberID` key · unique `Username` credential · duplicable `FullName` display |
| No duplicate protection | `LinkKey` normalisation, 30-day per-member rejection, daily cap |
| Backend living in three markdown files | Real `.gs` files under `appsscript/`, deployed via clasp, never edited in the browser |
| Dashboards capped at 30 members | Leaderboards computed server-side; sheet tabs are views, not the mechanism |
| No tests | Pure logic in `appsscript/lib/`, tested under Node before anything is wired to a sheet |
| No auth on anything | Sessions, capabilities, and a server-side check on every action |
