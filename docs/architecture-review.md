# Architecture Review

**Phase 2 · Part 4.** A senior review of the data architecture in
[`database.md`](database.md), conducted adversarially against my own design.

Findings are ranked by expected cost, not by how interesting they are. Each
carries a recommendation and a phase.

---

## Summary

The schema is sound for the stated scale and has a clean recovery story: one
immutable ledger, everything else rebuildable. Three findings are worth acting
on before Phase 3, and one is a genuine architectural risk that needs a decision
rather than a fix.

| # | Finding | Severity | Act by |
|---|---|---|---|
| B1 | Submission write path touches 5 sheets under one lock | **High** | Phase 3 |
| C1 | Rollups can drift for up to 24 hours before reconcile | **High** | Phase 3 |
| S1 | `ANYONE_ANONYMOUS` deployment is the only network boundary | **High** | Already mitigated — verify |
| B2 | Registration does a full `InviteCodes` scan inside a lock | Medium | Phase 3 |
| C2 | `MilestonesEarned` is a denormalised count that can disagree | Medium | Phase 3 |
| S2 | Admins can read every member's PII with no visibility | Medium | Phase 4 |
| B3 | Apps Script's 6-minute execution ceiling vs the nightly job | Medium | Phase 6 |
| C3 | Milestone evaluation is not idempotent under retry | Medium | Phase 3 |
| S3 | `UnlockContext` JSON is unvalidated input into a cell | Low | Phase 3 |
| X1 | `Notifications` grows unbounded with nothing consuming it | Low | Phase 6 |

---

## Bottlenecks

### B1 · The submission path is doing a great deal under one lock — **High**

One member action writes `Submissions`, `ActivityCalendar`, `WeeklyStats`, and
`Members`, then evaluates every milestone and the Flow Level, all inside a
per-member lock. Each sheet operation is a round trip to the Sheets service at
roughly 100–300 ms.

Realistically 1.5–3 seconds inside the lock. That is acceptable for the member
making the request. It is not acceptable if it grows — and it will, because
every future celebration feature adds a step here.

**Why it is not worse than it looks:** the lock is *per member*, so the
community does not serialise. A member's own double-tap is exactly what should
be serialised, and idempotency handles it.

**Recommendation.** Batch the writes. Apps Script's `Range.setValues()` writes a
block in one call; four separate single-cell updates are four round trips.
Group `Members`, `WeeklyStats`, and `ActivityCalendar` into one batched write
where their ranges allow. Measure with a timing log in Phase 3 and set a budget
— if the path exceeds 3 seconds, move milestone evaluation out of the lock and
into a post-commit step, accepting a brief window where a milestone is earned
but not yet recorded.

**Do not pre-optimise past that.** The current design is correct and readable;
splitting it before measurement would trade clarity for a guess.

### B2 · Registration scans every invite code, holding a lock — Medium

Finding an invite code means reading the whole `InviteCodes` range. Fine at
hundreds of rows. At tens of thousands — if invites are ever generated in bulk
per cohort — this happens inside the registration lock, which serialises every
concurrent registration behind it.

**Recommendation.** Cache the unused-code set in `CacheService`, invalidated on
create and revoke. Registration then checks the cache and confirms against the
sheet only for the one candidate row. Phase 3, small.

### B3 · The nightly reconcile will eventually exceed 6 minutes — Medium

Apps Script terminates a script at 6 minutes. The reconcile rebuilds every
member's counters, calendar map, and weekly stats from the full ledger.

At 15,000 submissions and 60 members this is comfortable. At 45,000 and 150 it
is not obviously safe, and the failure mode is silent: a truncated reconcile
leaves some members repaired and others not, with no signal that it happened.

**Recommendation.** Make the job **resumable from the start**, not when it
breaks. Store a cursor in `Settings`; process members in batches; if the clock
passes 4 minutes, write the cursor, schedule a continuation trigger, and exit
cleanly. Also write a completion row to `AuditLog` so a job that stopped early
is visible rather than assumed. Phase 6, but design the cursor in Phase 3.

---

## Data consistency

### C1 · A drifted rollup stays wrong for up to 24 hours — **High**

Nine derived columns on `Members`, a packed calendar, and `WeeklyStats` are all
denormalised. The reconcile makes that safe *eventually*. The gap is what
happens in between.

If step 4 of the submission path fails after the ledger append succeeds, the
member's post is recorded but their counters, ring, calendar square, and
milestone progress are not. They see a post that "didn't count" — precisely the
v1 failure this rebuild exists to eliminate, arriving by a different route.

**Recommendation, two parts.**

1. **Write a repair marker.** If any post-append step throws, append a row to
   `AuditLog` with `Action = ROLLUP_PENDING` and the member id. A lightweight
   job every 15 minutes repairs marked members. Recovery becomes minutes, not a
   day.
2. **Make the response honest.** If the rollups did not update, return the
   submission as successful — it was — with a flag that stats are still
   settling, and let the dashboard show the previous numbers rather than wrong
   ones. Never show a number the server is not confident in.

This is the finding I would most want fixed before launch.

### C2 · `Members.MilestonesEarned` can disagree with `MemberMilestones` — Medium

A count denormalised from a table it does not enforce. If an append succeeds and
the increment fails, the badge count is wrong and nothing detects it until the
nightly job.

**Recommendation.** Either recompute it on read from the member's milestone rows
— cheap, since the dashboard already loads them — or drop the column. I lean
toward **dropping it**: it saves nothing the dashboard read does not already
have, and every denormalised counter is a consistency liability that has to earn
its place. `AllTimePosts` earns it because the alternative is a ledger scan;
this one does not.

### C3 · Milestone evaluation is not idempotent under retry — Medium

The client retries once on a transport failure, and `requestId` idempotency
covers the submission. But if the request succeeded server-side and the
*response* was lost, the retry re-enters milestone evaluation. Guarded by the
"already in `MemberMilestones`" check — but that check and the append are not
atomic, so a genuine double-submit could produce two unlock rows for one
milestone.

**Recommendation.** Treat `MemberID + MilestoneID` as a real primary key:
re-read immediately before appending, inside the existing lock. Cheap, and it
closes the window. Phase 3.

---

## Security

### S1 · The deployment is open to the internet by necessity — **High**, mitigated

`ANYONE_ANONYMOUS` is required for a browser to reach the endpoint. There is no
network boundary. Every request from anyone on the internet reaches `doPost`.

**This is already the central assumption of the design** — it is why the action
table declares a capability per action, why role is re-read from `Members` on
every request, and why guards are documented as UX rather than security. The
review's job is to confirm nothing has quietly come to depend on obscurity.

**Verified in the current design:** no endpoint returns data before
authorisation; the admin shell contains no data; `SeedSuperAdmin` is not
reachable over HTTP; role never comes from the session row or the payload.

**Recommendation.** Add one integration test in Phase 3 that authenticates as a
plain Member and calls **every** admin action, asserting `FORBIDDEN` on each.
Not a spot check — the whole table, driven by the table itself, so an action
added later without a capability fails the test automatically.

### S2 · Admin PII access is invisible — Medium

Community Managers hold `profile:read:all`. They can read every member's
WhatsApp number and email, and nothing records that they did. `AuditLog`
captures mutations, not reads.

For a community where members hand over phone numbers on the promise of a
close-knit group, "who looked at this" is a fair question to be able to answer.

**Recommendation.** Log `admin.members.get` and any bulk profile read to
`AuditLog` with `Result = READ`. Reads are rare in the admin flow, so volume is
not a concern. Phase 4. Also consider masking WhatsApp and email in the member
*list* and revealing them only on the detail screen — it makes casual browsing
of contact details a deliberate act.

### S3 · `UnlockContext` writes JSON into a cell — Low

The context snapshot is server-generated, so it is not user input today. But a
future milestone that captures anything member-controlled — a link, a bio
fragment — would write that string into a cell an admin later views.

The front end renders everything through `textContent`, so this is not an XSS
vector. The exposure is CSV/formula injection: a value beginning `=` or `+` is
interpreted as a formula when the sheet is opened.

**Recommendation.** Prefix any string field written to a sheet that could
contain member input with a single quote, or strip leading `= + - @`. One helper
in `SheetClient`, applied at the write boundary, Phase 3. Cheap now, awkward to
retrofit across every repository later.

---

## Simplification

Where the design is carrying more than it needs.

**Drop `Members.MilestonesEarned`** (C2). A denormalised count with no read
benefit.

**Reconsider `Members.ActiveDays`.** It duplicates `ActivityCalendar.ActiveDays`,
which is itself derived from `DayMap`. Three representations of one fact. The
calendar row is already read on every dashboard load, so the `Members` copy
saves nothing — **recommend dropping it** and reading from the calendar. This
matters more if §4.1's recommendation is accepted, since active days would then
drive three milestones and having one authoritative source becomes important.

**Do not split `AuditLog`.** Already decided, and worth restating under review:
two logs guarantee an argument about which one an event belongs in.

**`WeeklyStats.Rank` is arguably unnecessary.** Live rank is derived on read and
cached; only `RankFinal` needs storing. Writing `Rank` on every submission means
updating up to 60 rows whenever anyone's position shifts, which is by far the
most expensive thing in the write path if implemented literally.
**Recommend: store only `RankFinal`**, written once at rollover. Live rank stays
derived. This is the single largest write-cost reduction available, and I would
take it.

**`CommunityStats.AvgPostsPerMember` is derivable** from two columns in the same
row. Drop it; compute on read.

---

## Scalability opportunities

Beyond what §10 of `database.md` already covers.

**The packed-map technique generalises.** If `WeeklyStats` becomes a bottleneck
at 10,000+ rows, the same treatment applies — one row per member per year with
53 packed week entries. Not needed now, and worth knowing the pattern is
available rather than a one-off.

**Archiving has a natural seam.** Because every rollup is independently
rebuildable and `Submissions` is append-only, closed years can move to a second
spreadsheet with no loss of function. The rollups retain the history; only
admin drill-down into old raw rows would need the archive. Worth building the
repository layer with a `spreadsheetId` parameter from the start so this later
becomes configuration rather than surgery.

**The repository layer is the store-swap boundary.** Already the design, and
worth stating as a review conclusion: if Sheets is ever outgrown, `repositories/`
is rewritten and services, controllers, middleware, and the router are untouched.
That is the property that makes committing to Sheets now a reversible decision
rather than a permanent one.

---

## What I could not review

**Real performance numbers.** Every latency figure above is from documented Apps
Script behaviour, not measurement. The submission path should be instrumented in
Phase 3 and the budget in B1 checked against reality before Phase 4 depends on
it feeling instant.

**Concurrency under real load.** Sixty members do not submit simultaneously, so
lock contention is likely a non-issue — but "likely" is doing work there. One
deliberate concurrent test in Phase 3, with several submissions for one member
fired at once, would settle it.

---

## Recommended changes, consolidated

Adopt before Phase 3 begins:

1. **Drop `Members.MilestonesEarned`** and **`Members.ActiveDays`** — read from
   their sources (C2, simplification)
2. **Store only `WeeklyStats.RankFinal`**; derive live rank on read
3. **Add the `ROLLUP_PENDING` marker** and a 15-minute repair job (C1)
4. **Sanitise sheet writes** against formula injection (S3)
5. **Design the reconcile cursor now**, even though batching lands in Phase 6 (B3)
6. **Add the exhaustive Member-vs-every-admin-action test** (S1)

Items 1–2 shrink the schema and the write path; 3 closes the one consistency gap
that could reproduce a v1-class failure; 4–6 are cheap now and expensive later.
