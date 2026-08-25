# API Specification

**Phase 3 · Deliverable 2.** Every endpoint: request, response, validation,
authentication, authorisation, errors.

Design only. No business logic implemented.

---

## 1. Transport

| Property | Value | Why |
|---|---|---|
| Entry point | One `doPost` | Apps Script gives two entry points and no paths. The action name routes |
| Method | `POST` only | v1 sent PINs in GET query strings, where they landed in browser history, referrer headers, and execution logs |
| Content type | `text/plain` carrying JSON | **Critical.** `application/json` makes the request non-simple, triggering a CORS preflight. Apps Script does not answer `OPTIONS`, so the request dies. `text/plain` keeps it simple and the response readable |
| Auth | Session token in the body | Never in a URL |
| Status | Always HTTP 200 | Apps Script cannot set status codes, and its own errors return HTML. Success lives in the envelope |
| Deployment | Execute as **Me**, access **Anyone** | Required for a browser to reach it — which is exactly why every action is authorised in code |

`doGet` returns a version/health payload only. No member data.

## 2. Envelope

**Request**

| Field | Required | Notes |
|---|---|---|
| `action` | ✓ | Dotted name. Resolved against the action table |
| `token` | for authenticated actions | Opaque session token |
| `payload` | ✓ | Action-specific. Shape-validated before the controller runs |
| `requestId` | ✓ | Client UUID. Powers write idempotency |
| `clientVersion` | | Lets the server detect a stale client after a deploy |

**Response — success:** `{ ok: true, data: {…}, meta: { serverTime, version, sessionExpiresAt? } }`

**Response — failure:** `{ ok: false, error: { code, message, field? }, meta: {…} }`

`message` is member-facing copy already in the brand voice and is displayed
verbatim. `field` tells a form which input to highlight.

## 3. The middleware chain

Every request, in this order:

```
1  Validate     payload shape and types          → VALIDATION_FAILED
2  RateLimit    per account / per session        → RATE_LIMITED
3  Authenticate token → session → member         → SESSION_EXPIRED
4  PinGate      MustChangePin set?               → MUST_CHANGE_PIN
5  Authorize    capability vs. fresh role        → FORBIDDEN
6  Controller
7  Audit        if anything mutated
```

**Rate limiting sits before authentication deliberately.** Verifying a PIN means
running an iterated hash, which is intentionally slow. An attacker able to force
that work before being throttled has a denial-of-service vector.

**Scope is derived from the session, never the payload.** No member-scoped
action accepts a `memberId` — there is no field in which to ask for someone
else's data.

---

## 4. Public endpoints

Three. A fourth should require an argument.

### `auth.checkUsername`
**Auth** none · **Rate limit** 20/min/session

`{ username }` → `{ available, reason? }`

Advisory only — registration re-checks inside the lock, because availability can
change between the two calls. Rate-limited so it cannot be used to enumerate
members.

**Validation:** 3–20 chars, `^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$`, not reserved.
**Errors:** `USERNAME_INVALID` · `RATE_LIMITED`

### `auth.register`
**Auth** none · **Rate limit** per invite code + global hourly ceiling

```
{ fullName, username, pin, pinConfirm,
  platform, weeklyGoal, inviteCode, consentFeature }
      ↓
{ token, expiresAt, member, capabilities }
```

**Validation**

| Field | Rule | Error |
|---|---|---|
| `fullName` | 2–60 chars | `VALIDATION_FAILED` |
| `username` | format + not reserved + free | `USERNAME_INVALID` · `USERNAME_TAKEN` |
| `pin` | exactly 6 digits, not repeat/sequence/common | `PIN_INVALID` · `PIN_WEAK` |
| `pinConfirm` | equals `pin` | `PIN_MISMATCH` |
| `platform` | in the enum | `VALIDATION_FAILED` |
| `weeklyGoal` | 3, 5, or 7 | `VALIDATION_FAILED` |
| `inviteCode` | exists, `Unused`, unexpired | `INVITE_INVALID` · `INVITE_USED` · `INVITE_EXPIRED` |
| `consentFeature` | boolean, defaults false | — |

Steps 8–17 of the registration flow run inside one lock. `Role` is always
`Member` — no payload field can set it. Returns a session, so there is no second
login step.

### `auth.login`
**Auth** none · **Rate limit** 5 failures per `UsernameKey` → 15-minute lockout

`{ username, pin }` → `{ token, expiresAt, member, capabilities, mustChangePin, redirect }`

`redirect` is `member` or `admin`, derived from role. **A routing hint only** —
authorisation is per-action and never uses it.

**Errors:** `AUTH_FAILED` · `ACCOUNT_LOCKED` · `ACCOUNT_INACTIVE` · `RATE_LIMITED`

`AUTH_FAILED` deliberately does not distinguish "no such username" from "wrong
PIN". The distinction hands an attacker a list of valid usernames.

---

## 5. Session endpoints

| Action | Capability | Request → Response |
|---|---|---|
| `auth.session` | authenticated | — → `{ member, session, capabilities }`. App boot |
| `auth.logout` | authenticated | — → `{ ok }`. Sets `RevokedAt` |
| `auth.changePin` | `pin:update:self` | `{ currentPin, newPin, newPinConfirm }` → `{ ok }` |

`auth.changePin` **revokes every other session** for that member. A PIN change is
often a response to suspecting compromise; leaving other sessions live would
defeat it.

While `MustChangePin` is set, the server refuses every action except
`auth.changePin` and `auth.logout`. An admin who resets a PIN knows the
temporary value — without a server-enforced gate, that admin could log in as the
member.

---

## 6. Member endpoints

### `member.dashboard`
**Capability** `dashboard:self` · **Cached** 60s, invalidated on write

One call. Returns everything the dashboard renders, in the approved section
order.

```
{ member:      { fullName, username, platform, weeklyGoal, joinDate },
  level:       { levelId, name, iconId, description,
                 next: { levelId, name, progress, target } | null },
  week:        { weekStart, postsThisWeek, weeklyGoal, goalMet,
                 distinctDays, message },
  calendar:    { from, to, today, counts: { "2026-07-27": 2, … } },
  milestones:  { totalEarned, totalAvailable,
                 recent: [ { milestoneId, name, iconId, rarity, unlockedAt } ],
                 next:   { milestoneId, name, iconId, progress, target },
                 unseen: [ … ] },
  stats:       { currentWeekStreak, longestWeekStreak,
                 allTimePosts, activeDays, perfectWeeks },
  leaderboard: { weekStart, rank | null, entries: [ … top 5 … ] },
  recent:      [ { submissionId, platform, contentLink, timestamp } ],
  statsSettling?: true }
```

**Why one call.** Eight round trips to Apps Script on mobile data is the
difference between a dashboard that feels instant and one that assembles itself
in front of the member. The vision asks that the ring and calendar communicate
consistency *before* any number is read — that only works if they arrive
together.

**`calendar.counts` is sparse** — only days with activity. A 26-week window
typically yields 30–80 entries rather than 182.

**`rank` is null** for a member with no posts this week. The client renders
*"Post this week to join the leaderboard."* — never a rank of zero, never last
place.

**`statsSettling`** appears only after a partial write failure. The client keeps
showing previous numbers rather than wrong ones.

### Other member endpoints

| Action | Capability | Request → Response |
|---|---|---|
| `member.submissions` | `submission:read:self` | `{ page, pageSize }` → paginated own history |
| `member.calendar` | `dashboard:self` | `{ weeks }` → `{ counts, activeDays, from, to, today }`. For range changes without a full reload |
| `member.profile` | `profile:read:self` | — → `{ member, joinDate, contact, level, stats, calendar, milestones }`. The profile screen in one call |
| `member.updateConsent` | `profile:update:self` | `{ consentFeature }` → `{ consentFeature }` |
| `member.updateName` | `profile:update:self` | `{ fullName }` → `{ member }`. **Username is admin-only** |
| `profile.get` | `profile:read:self` | — → `{ whatsapp, email, bio, updatedAt }` |
| `profile.update` | `profile:update:self` | `{ whatsapp?, email?, bio? }` → profile. Each field independently savable |

`member.dashboard` returns `level` **flattened** — the level's own fields with
`next` nested inside it — because every call site reads `level.name` and
`level.next` directly. A `current` wrapper would cost each one an extra hop.

---

## 7. Submission

### `submission.create`
**Capability** `submission:create` · **Idempotent** by `requestId`, 60s

`{ link }` → `{ submission, stats, newMilestones[], levelUp? }`

**The platform is never accepted from the client.** It is read from the member's
record. Accepting it would let a member log an Instagram post against a LinkedIn
account, defeating the validation entirely.

**Validation, in order** — cheapest and most common failures first:

| Check | Error | Message |
|---|---|---|
| URL parses | `INVALID_URL` | "That doesn't look like a link. Paste the full URL." |
| Registrable domain matches platform | `PLATFORM_MISMATCH` | "This account is registered for LinkedIn posts only." |
| `LinkKey` unseen for this member in 30 days | `DUPLICATE_LINK` | "You've already logged this post." |
| Under the daily cap | `DAILY_CAP` | "That's plenty for today. Come back tomorrow." |

Domain matching is **registrable-suffix**, so `notlinkedin.com` and
`linkedin.com.evil.co` are rejected. The allowlist is server-side only.

**`newMilestones` and `levelUp` in the same response** are what let the client
show the celebration immediately, with no second request and no timer. Any
unlock is also persisted with `Seen = false`, so a member who closes the tab
still gets it next time.

---

## 8. Leaderboard & milestones

| Action | Capability | Request → Response |
|---|---|---|
| `leaderboard.get` | `leaderboard:read` | `{ scope: week\|month\|allTime, sortBy: posts\|currentStreak\|longestStreak }` → `{ weekStart, entries, rank, unrankedCount }` |
| `milestones.list` | `dashboard:self` | — → `{ milestones, totalEarned, totalAvailable, next }` |
| `milestones.markSeen` | `dashboard:self` | `{ milestoneIds[] }` → `{ ok }` |
| `levels.list` | `dashboard:self` | — → `{ levels, current, stats }` — the full ladder for the Flow Levels screen |

Each leaderboard row carries `rank`, `fullName`, `username`, `postCount`,
`weeklyGoal`, `currentWeekStreak`, `levelId`, `levelName`, `levelIconId`, and
`isSelf`. Level name and icon are resolved server-side rather than left to a
client-side lookup table, which would be a second source of truth for something
the server already owns.

`unrankedCount` is how many active members have not posted in scope. It is a
number, never a list of names — the screen says *"there is still time"* rather
than displaying anyone for not having started.

Entries carry `rank`, `fullName`, `username`, `postCount`, `currentWeekStreak`,
and `levelId` — never a PIN, an email, or a submission link.

Members with zero posts in scope are **absent from the list**, not ranked last.
Hidden milestones are omitted from `milestones.list` until earned.

`milestones.markSeen` is what clears the celebration queue after the modal is
dismissed.

---

## 9. Admin endpoints

Every one requires a capability. The action table is the registration point, so
an endpoint cannot exist without declaring what it needs — forgetting the check
is structurally impossible rather than merely unlikely.

### Overview and analytics

| Action | Capability | Notes |
|---|---|---|
| `admin.overview` | `admin:overview:read` | Returns only metrics **enabled in Settings**. The Consistency Score is absent, not stubbed |
| `admin.analytics` | `analytics:read` | `{ from, to, series[] }` → chart data from `CommunityStats` |

### Members

| Action | Capability | Request | Notes |
|---|---|---|---|
| `admin.members.list` | `member:read:all` | search, platform, status, goal, role, page | Contact details **masked** in the list |
| `admin.members.get` | `member:read:all` + `profile:read:all` | `{ memberId }` | Full record. **Logged as a READ** |
| `admin.members.update` | `member:update` | `{ memberId, fullName?, username?, platform?, weeklyGoal? }` | Only route by which a username changes |
| `admin.members.setStatus` | `member:status:set` | `{ memberId, status }` | Deactivating revokes all their sessions |
| `admin.members.resetPin` | `member:pin:reset` | `{ memberId, tempPin }` | Sets `MustChangePin`, revokes all sessions |
| `admin.members.setRole` | `member:role:set` | `{ memberId, role }` | **Super Admin only** |
| `admin.members.delete` | `member:delete` | `{ memberId, confirm }` | **Super Admin only.** Refuses with history |
| `admin.members.reconcile` | `member:update` | `{ memberId }` | Manual rollup rebuild |

### Invites, submissions, settings, audit

| Action | Capability | Notes |
|---|---|---|
| `admin.invites.create` | `invite:create` | `{ count, expiresInDays?, note? }`. Bulk supported |
| `admin.invites.list` | `invite:read` | Filter by status and issuer; shows who redeemed each |
| `admin.invites.revoke` | `invite:revoke` | Unused codes only |
| `admin.submissions.list` | `submission:read:all` | Filter by member, platform, date, week. Links clickable |
| `admin.submissions.void` | `submission:void` | Marks `Voided` and recomputes. **Never deletes** |
| `admin.settings.get` | `settings:read` | |
| `admin.settings.update` | `settings:update` | **Super Admin only** |
| `admin.audit.list` | `audit:read` | **Super Admin only** |

---

## 10. Server-side invariants

Rules no user interface can express, enforced in `MemberService`:

1. **No self-escalation.** `setRole` refuses when actor and target are the same
   member, regardless of capability.
2. **The last Super Admin is protected.** `setRole`, `setStatus`, and `delete`
   all refuse any change leaving zero active Super Admins. Without this, one
   misclick locks everyone out permanently, recoverable only by hand-editing a
   sheet.
3. **Deletion refuses with history**, offering deactivation. Deleting a member
   orphans ledger rows and silently rewrites everyone else's historical
   standings.
4. **Invite redemption and username claim share one lock.**
5. **`MustChangePin` blocks everything** but the change and logout.
6. **Milestones are never revoked**, including when a definition changes.

---

## 11. Error codes

| Code | Member-facing message |
|---|---|
| `VALIDATION_FAILED` | *field-specific* |
| `USERNAME_TAKEN` | That username is taken. Try another. |
| `USERNAME_INVALID` | Usernames use letters, numbers, dots and underscores. |
| `PIN_INVALID` | Your PIN needs to be 6 digits. |
| `PIN_WEAK` | Pick a PIN that isn't a repeat or a sequence. |
| `PIN_MISMATCH` | Those PINs don't match. |
| `INVITE_INVALID` | That invite code isn't valid. |
| `INVITE_USED` | That invite code has already been used. |
| `INVITE_EXPIRED` | That invite code has expired. Ask for a new one. |
| `AUTH_FAILED` | That username and PIN don't match. |
| `ACCOUNT_LOCKED` | Too many tries. Try again in 15 minutes. |
| `ACCOUNT_INACTIVE` | Your account is paused. Reach out to the team. |
| `SESSION_EXPIRED` | Your session ended. Please log in again. |
| `MUST_CHANGE_PIN` | Set a new PIN to continue. |
| `FORBIDDEN` | You don't have access to that. |
| `INVALID_URL` | That doesn't look like a link. Paste the full URL. |
| `PLATFORM_MISMATCH` | This account is registered for {platform} posts only. |
| `DUPLICATE_LINK` | You've already logged this post. |
| `DAILY_CAP` | That's plenty for today. Come back tomorrow. |
| `RATE_LIMITED` | Slow down a moment, then try again. |
| `LAST_SUPER_ADMIN` | You can't remove the last Super Admin. |
| `NOT_FOUND` | We couldn't find that. |
| `SERVER_ERROR` | Something went wrong on our end. Try again. |

Every platform failure and every bug returns the identical `SERVER_ERROR`
message, so nothing about internal structure can be inferred by probing. Detail
goes to the execution log.

---

## 12. Caching and idempotency

| Data | TTL | Invalidated by |
|---|---|---|
| Settings | 10 min | `admin.settings.update` |
| Milestone catalog, Flow Levels | 30 min | Admin edit |
| Session lookup | 60 s | Logout, revoke |
| Dashboard aggregate | 60 s | That member's submission |
| Weekly leaderboard | 60 s | Any submission that week |

`requestId` makes a repeat within 60 seconds return the original result, so a
double-tapped submit on a slow connection records one post rather than two.
Cache is always an optimisation: if `CacheService` is unavailable, every read
falls through to the sheet.
