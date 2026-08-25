# FlowTribe v2 — Decision Log & Open Questions

**Revision 2** — records your approvals, the decisions they created, and what's still open.
**Status: awaiting final review. No code written.**

---

## Part A — Approved and closed

### Architectural decisions D1–D16 — approved as written

D1 two SPA shells · D2 no build step · D3 layered backend · D4 one POST endpoint on `text/plain` ·
D5 server-side session table · D6 role re-read per request · D7 capabilities not role checks ·
D8 derived values materialised over an immutable ledger · D9 `WeekStart` as canonical week key ·
D10 `GoalAtSubmission` per row · D11 streak math server-only · D12 registrable-domain link matching ·
D13 idempotent submissions · D14 no self-escalation / last-Super-Admin protection · D15 deletion
refuses with history · D16 charts — **superseded by Q10, see D22**.

Full rationale for each is in the revision-1 history of this file and in
[`architecture.md`](architecture.md).

### Your Q1–Q10 decisions

| Q | Decision |
|---|---|
| **Q1** | **Username** is the login identifier, unique. `FullName` displayed on the dashboard, not unique. Registration collects Full Name, Username, PIN, Confirm PIN, Platform, Weekly Goal, Invite Code |
| **Q2** | **6-digit PIN.** Hash only. Never store plain text |
| **Q3** | **Invite code required.** Single-use — invalid after redemption |
| **Q4** | **Reject duplicates**: same normalised URL, same member, within 30 days |
| **Q5** | Sessions approved. Stay signed in; secure expiration |
| **Q6** | Community Managers get personal dashboards + a **"My Dashboard" switch** in the admin shell |
| **Q7** | Approved. All server APIs role-validated; client restrictions never relied on alone |
| **Q8** | Zero-post members **unranked**: *"Post this week to join the leaderboard."* |
| **Q9** | **Consistency Score paused** until defined together. Metrics **configurable, not hardcoded** |
| **Q10** | **Chart.js** for analytics, not custom SVG |

### Your v1 migration decisions

| Decision | Status |
|---|---|
| Retire the Google Form **after** v2 is fully tested | ✅ Approved |
| Existing members migrate at weekly goal **3** | ✅ Approved |
| **You** seeded as initial Super Admin | ✅ Approved |
| Keep v1's formula tabs for historical reference | ✅ Approved |
| Login required before submitting | ✅ Approved |
| Two-stage onboarding — Stage 1 account, Stage 2 optional profile | ✅ Approved |

---

## Part B — New decisions your approvals created

These follow from your choices. Each is explained rather than assumed, per our working agreement.

### D17 · Identity split three ways
`MemberID` (immutable key) · `UsernameKey` (unique credential) · `FullName` (display, duplicable).
**Gains:** two Davids can both join; a member can fix a typo in their name without orphaning a
single row of history; login has one unambiguous target.
**Cost:** one more field at registration.
Detail: [`database.md`](database.md) §3.

### D18 · Registration is one atomic critical section
Invite validation, invite redemption, username uniqueness, and the member insert all happen inside a
single `LockService` block.
**Why:** two separate check-then-act races live here. Two people redeeming the same code
simultaneously would both pass the "unused?" check; two people claiming the same username would both
pass the availability check. Sheets have no unique constraints and no transactions, so the lock is
the only thing preventing a duplicate. Grouping them also means a failed registration never burns a
valid invite code.

### D19 · Invite codes are stored in plain text — deliberately
Unlike a PIN, an invite code must be **read back** to be pasted into a WhatsApp message. Hashing
would make that impossible.
**The risk is contained differently:** codes are random, single-use, and expiring. A leaked sheet
yields only unused codes, each good for exactly one account, all revocable in one action.
**Format:** 8 characters from an alphabet excluding `0`, `O`, `1`, `I`, `l` — they get typed by hand
off a phone screen, so ambiguity costs more than length.

### D20 · Profile data lives in a separate `Profiles` sheet
Not as extra columns on `Members`.
**Why:** `Members` is read on **every authenticated request** by the auth middleware. Putting phone
numbers, emails, and bios in that row means personal data flows through every code path in the
application and sits in every cache entry. A separate sheet means PII is read only when someone
deliberately opens a profile.
**Cost:** one extra lookup on a rare operation.
**Bonus:** the hot sheet stays narrow, and the future profile page can grow without widening the
sheet authentication depends on.

### D21 · Consent is queryable data, defaulting to false
`ConsentFeature` and `ConsentContact` are boolean fields, both default **false** — nobody is opted
in by silence. The admin FlowMate-of-the-Week candidate list filters on `ConsentFeature`, so a
public shoutout can never use the name or photo of someone who didn't agree. v1 left this as a form
answer in a spreadsheet; making it a field makes it enforceable.

### D22 · Chart.js is vendored locally, admin-shell only, behind an adapter
Supersedes D16.
- **Vendored, not CDN** — a CDN adds a runtime dependency on a third party being up, leaks your
  admins' IPs to that third party on every load, and breaks entirely on a network that blocks it.
  ~200KB in the repo removes all three. (Question N4 if you'd prefer a CDN.)
- **Admin shell only** — the member app, loading on a phone over mobile data, never downloads it.
  This is precisely the payload split the two-shell decision existed for.
- **Behind an adapter** — views ask for "a bar chart with this data"; they never touch the Chart.js
  API. Brand theming lives in one place, the library stays swappable, and eight charts share one
  styling decision.
- It ships as a UMD build loaded by a plain `<script>` tag, so **the no-build-step decision stands**.

### D23 · Metrics come from a registry, not hardcoded functions
Each metric declares an id, label, description, its `Settings` keys, and a compute function.
`admin.overview` iterates the enabled entries; the UI renders whatever descriptors it receives.
**Result:** the Consistency Score ships disabled and switches on later with no front-end deploy;
changing a window is an admin edit; a future metric is one registry entry.
The same pattern holds session lengths, lockout thresholds, the duplicate window, invite expiry, and
the default weekly goal — all `Settings` rows.

### D24 · `MustChangePin` is enforced server-side, not by the UI
While the flag is set, the server refuses **every action** except `auth.changePin` and
`auth.logout`.
**Why it matters:** an admin who resets a member's PIN knows the temporary value. Without a
server-enforced gate, that admin could log in as the member. A client-side redirect would be
trivially bypassed.

### D25 · `Username` snapshotted onto every submission row
Alongside the existing `Name` snapshot.
**Why:** two members can now share a `FullName`. Without the username, someone reading the raw
spreadsheet cannot tell two Davids apart — and reading the raw sheet is exactly what you'll do when
something looks wrong.

---

## Part C — Fresh start: no migration

**Decided.** v2 launches as a completely new application with an empty database. Every member,
including everyone currently in v1, registers fresh.

### D26 · All migration paths removed, not disabled

Deleted from the design: legacy 4-digit PIN support, first-login migration, username generation for
existing members, the `_Unmatched` quarantine tab, the name→`MemberID` matching pass, and the
`MigrateV1` script.

**Why deletion rather than a feature flag:** dead migration code in a fresh codebase becomes
permanent. Every future change has to reason about a "migrated member" branch that will never
execute. Removing it means one set of invariants — every account has a username, a 6-digit PIN hash,
a deliberately chosen weekly goal, and a redeemed invite code — with no conditionals.

**The cost, stated plainly:** existing FlowMates lose their v1 streaks and totals. Streaks are the
thing this product asks people to protect, so resetting them asks the community to rebuild something
they earned. v1's sheet stays intact for reference, and a clean launch does put everyone on the same
starting line for a leaderboard-driven community — but it is a real cost, not a free one.

### D27 · Two accounts exist outside registration: one, and it's yours

`SeedSuperAdmin` runs once from the Apps Script editor to create your account. It is **not an
endpoint** and cannot be reached over HTTP, so it can't become a back door. Every other account —
including other Super Admins — comes through registration plus `admin.members.setRole`.

### D28 · `ConsentFeature` lives on `Members`, not `Profiles` — ⚠️ needs your nod

Moving Feature Consent into registration changed where it belongs. It is collected at Stage 1 (so no
`Profiles` row exists yet), it is not personal data, and the admin shoutout-candidate list queries it
alongside member listings.

Keeping it in `Profiles` would force a row to exist for every member just to hold one boolean and
turn "who can I feature?" into a join. The PII reasoning that justified splitting `Profiles` out
still applies to WhatsApp, email, and bio — it just doesn't apply to a yes/no about publicity.

**Say the word if you'd rather keep all consent in one place.** Nothing built in Phase 1 depends on
this.

### D29 · Profile photos deferred with three specific seams

Not "we'll figure it out later" — the extension points exist now:
- Adding a column to `Profiles` is a no-op for every other sheet and query.
- The `avatar` component **ships in Phase 1** rendering initials; it takes an optional `src` later,
  and every screen showing a member already routes through it.
- `ProfileService` and `profile.update` already own this data, so an upload action slots in beside
  them rather than cutting a new path.

What was deferred is only the Drive integration — `DriveClient`, client-side resizing, and the
sharing model. None of it is prerequisite to anything in v2.

### D30 · Contact consent not collected

Your Stage 2 list is WhatsApp, email, bio. A member volunteering a phone number is itself a
reasonable signal of contactability, so v2 doesn't ask separately. If you later want an explicit
opt-in for broadcast messaging, it's one boolean and one toggle. Noted so the omission reads as a
decision.

---

## Part D — Previously open questions, now resolved

| # | Question | Resolution |
|---|---|---|
| N1 | Can members change their username? | **No.** Community Managers and Super Admins only |
| N2 | Invite policy | **CMs and Super Admins generate. Single-use. 14-day default expiry. Bulk supported** |
| N3 | 4-digit → 6-digit PIN migration | **Dissolved** — no migration |
| N4 | Chart.js vendored or CDN | **Vendored locally.** No CDN |
| N5 | Profile photo storage | **Dissolved** — not in v2 (see D29) |
| N6 | Where the consent question lives | **Registration**, not optional Stage 2 |

N6 in particular resolved the way I'd hoped: consent behind a skippable step means the members who
skip are silently unfeaturable, and the shoutout pool quietly shrinks to whoever bothered.

**No open questions remain.** D28 is the only item awaiting a nod, and it blocks nothing in Phase 1.

---

## Part E — Phase 2 decisions (data architecture)

### D31 · The packed day map

`ActivityCalendar` stores one row per member per year holding a **366-character
string**, one character per day, `'0'`–`'9'`.

**Rejected alternative:** one row per member per active day — ~15,000 rows a
year, the same scan cost as the ledger it was meant to accelerate.

**What it buys:** 60 rows carry a year of daily activity for the whole
community. A member's full year is one cell. A submission is one character.
Colour intensity, monthly views, yearly history, and export all work with no
schema change, because the digits are already counts.

**The trade-off:** it cannot be queried. "Who posted on 4 July" means reading
every map or going to the ledger. That query has no product use — the calendar
is always one member's view — and the ledger answers it if one appears.

### D32 · Milestone definitions are split: presentation in a sheet, conditions in code

An unlock condition is a function, not a value. Putting "seven consecutive
posting days" in a spreadsheet cell means inventing a rules language with no
tests, no type checking, and edit access for anyone who opens the file.

`MilestoneCatalog` holds name, description, icon, category, rarity, and the
future-compatibility flags — everything an admin might reword without a deploy.
The evaluator lives in `appsscript/lib/milestones.js`, matched by `MilestoneID`,
pure and unit-tested. Same pattern as the metric registry (D23).

### D33 · The evaluator returns progress, not just a verdict

`evaluate(snapshot) → { unlocked, progress, target }`.

"Progress Towards the Next Milestone" then costs nothing: the next milestone is
the unearned one with the highest `progress / target` ratio. No separate
configuration, and no way for a progress bar to disagree with its own unlock.

### D34 · Flow Levels are stored; rank is derived

Rank is computed on read because nobody celebrates a rank change. A level-up is
a moment, and detecting it means comparing a stored value against a freshly
computed one. Hence `Members.FlowLevelID` and `FlowLevelAchievedAt`.

Levels require **both** a post threshold and a perfect-week threshold, and they
**never fall**. A Builder who has a quiet month is still a Builder — demoting
them would punish exactly the member the product needs to bring back.

### D35 · A `Notifications` outbox that nothing reads yet

Email, WhatsApp, and push celebrations are all on the future list. Retrofitting
a notification concept later means finding every place an event occurs and
adding a write. Recording them now costs one append per event and leaves only
the delivery worker to build. `Suppressed` is where consent will be honoured.

### D36 · One `AuditLog`, not two

The brief listed both "Audit Logs" and "Admin Activity Logs". Two logs means
two places to look during an investigation and a guaranteed argument about
which one an event belongs in. One sheet with an `ActorRole` column answers
everything either would.

### D37 · No `Leaderboards` sheet

Rank is `WeeklyStats` sorted by post count. A stored leaderboard is a second
copy of a fact that already exists, free to drift. The one thing worth freezing
is the final standing, and that is one column — `RankFinal` — written once at
rollover.

### D38 · Live rank is not stored at all *(from the architecture review)*

Writing `Rank` on every submission means updating up to 60 rows whenever anyone
moves, which would be the single most expensive operation in the write path.
Live rank is derived on read and cached 60 seconds.

### D39 · Three fields removed after review

`Members.MilestonesEarned`, `Members.ActiveDays`, and
`CommunityStats.AvgPostsPerMember` are all denormalisations with no read
benefit — the data they duplicate is already loaded on the same request.
`ActivityCalendar.ActiveDays` is the single authoritative active-day count.

Every denormalised counter is a consistency liability. It has to earn its place;
these three did not.

---

## Part F — Phase 2 refinements (approved)

### D40 · Active days, not consecutive days

`active-days-7`, `active-days-30`, `active-days-100` count **distinct days on
which a member logged qualifying content**. Not consecutive.

**Why the original definition failed:** a member who chooses 3 posts a week and
hits it perfectly for a year has a longest consecutive run of one day. All three
milestones were unreachable for them, and 100 consecutive days was effectively
Daily-goal-only.

Flow Tribe rewards consistency against **the commitment a member chose**. A
milestone no member on the default goal can ever earn is not a milestone.

**Source:** `ActivityCalendar.ActiveDays`, summed across a member's year rows.
Multiple posts in one day count as one active day.

### D41 · Weekly Champion

The milestone for finishing first on the weekly leaderboard is **Weekly
Champion**. "Community Leader" is a Flow Level only. One concept, one name.

### D42 · A Perfect Week requires separate days

`GoalMet AND DistinctDays >= GoalAtWeek`.

Three posts on a Saturday meets a goal of 3 — it feeds the week streak, the
ring, and `PerfectWeeks`. It does not unlock Perfect Week, which is reserved for
showing up on separate days rather than batching.

This also removes the duplicate trigger the milestone previously shared with
`first-goal`.

---

## Part G — Phase 3 refinements (approved)

### D43 · Exponential backoff replaces the flat lockout

A fixed 15-minute lock was a denial-of-service vector: usernames are visible on
the leaderboard, and Apps Script cannot see the client IP, so anyone could lock
out any member repeatedly with a trivial script.

| Consecutive failures | Delay before the next attempt is accepted |
|---|---|
| 1–4 | none |
| 5 | 30 seconds |
| 6 | 2 minutes |
| 7 | 8 minutes |
| 8+ | 30 minutes, capped |

The member who mistyped waits half a minute; an attacker gains almost nothing
per attempt. **The account is never fully unusable** — the delay sits between
attempts rather than forming a wall.

`Members.LockedUntil` becomes `NextAttemptAt`. Both it and `FailedLoginCount`
reset on success.

### D44 · An orchestration layer; services never call services

Services were referencing each other directly, which meant nothing above `lib/`
could be tested without a live spreadsheet — the orchestration, where ordering
bugs live, was the least verifiable part of the system.

- **Services take injected dependencies** from factories, wired once in
  `setup/Container.gs`. No framework; production behaviour unchanged; tests pass
  fakes.
- **Orchestrators own multi-service workflows** — `RegistrationFlow`,
  `SubmissionFlow`, `WeekCloseFlow` — run through a shared `Pipeline` that
  orders steps, times them against the latency budget, and marks
  `ROLLUP_PENDING` on failure.
- **`MemberService` splits into three**: reads and self-service; admin mutations
  plus the invariants; and registration, which moves to an orchestrator because
  it was never a service — it is a sequence across four subjects.

A service knows one subject deeply. An orchestrator knows the order in which
subjects must be touched. Different knowledge, different reasons to change,
different files.
