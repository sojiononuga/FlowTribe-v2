# FlowTribe v2 — Authentication, Session Management & RBAC

**Revision 2** — username identity, 6-digit PINs, invite-gated registration, two-stage onboarding.
**Status: awaiting final review. No code written.**

---

## 1. What a 6-digit PIN buys, stated honestly

A 6-digit PIN is 1,000,000 possibilities — a hundredfold improvement on v1's four digits, for one
extra second of typing. That is a real gain, but the ordering of what actually protects accounts
does not change:

1. **Rate limiting and lockout.** Five failures, 15-minute lockout, escalating. This is the defence
   that matters. Without it, no PIN length is enough.
2. **A server-side pepper.** A secret held in `PropertiesService`, never in the sheet. If the
   spreadsheet is ever shared or leaked, the hashes are useless without it. This is the protection
   hashing genuinely buys.
3. **Per-member salt + iteration.** Stops identical PINs producing identical hashes and slows bulk
   cracking.

Apps Script offers no bcrypt, scrypt, or Argon2 — only SHA-family digests and HMAC-SHA256. The best
available construction is **iterated HMAC-SHA256 with a per-member salt and a server-side pepper**,
and that is what this design uses.

**PIN policy:** exactly 6 digits; rejects all-same (`000000`), ascending and descending sequences
(`123456`, `654321`), and a denylist of the most common 6-digit PINs. Enforced server-side; the
client mirrors it for instant feedback. Plain-text PINs are never stored, never logged, and never
returned by any endpoint.

---

## 2. Identity model

Three fields, three jobs. This is the change that removes v1's deepest flaw.

| Field | Role | Unique? | Changeable? |
|---|---|---|---|
| `MemberID` | The key everything joins on | Yes | Never |
| `UsernameKey` | The login credential | **Yes** | Admin action only (proposed) |
| `FullName` | What the product displays | **No** | Freely |

The dashboard greets people by `FullName` — *"Welcome back, David"* — while authentication runs
on `Username`. Two Davids can both join.

**Usernames are editable by Community Managers and Super Admins only** (approved). Members cannot
change their own. Structurally a change is free, since `MemberID` is the key and nothing joins on
the username — the restriction is about keeping login support simple, not about data integrity.
`FullName` remains freely editable by its owner.

### Username rules — proposed

3–20 characters; lowercase letters, digits, underscore, single dots; must start with a letter;
cannot end with a dot; no consecutive dots. Uniqueness is case-insensitive via `UsernameKey`.

Reserved: `admin`, `superadmin`, `flowtribe`, `support`, `help`, `api`, `system`, `team`, `iyanu`.
This list is not cosmetic — a member registering as `flowtribe` could impersonate the community
account in a leaderboard screenshot.

---

## 3. Registration — Stage 1

Invite-gated, per your decision. Eight fields — the last is a consent checkbox.

```
1  Member enters Full Name · Username · PIN · Confirm PIN
                 Platform · Weekly Goal · Invite Code · Feature Consent
2  Client validates format and PIN match
   └─ instant feedback only. Nothing here is trusted.
3  Client may pre-check username availability (debounced, advisory)
4  POST auth.register
5  Server: validate payload shape
6  Server: rate-limit by invite code and by request volume
7  ┌─ ACQUIRE LOCK ──────────────────────────────────────────┐
   │ 8  Invite code exists?        → INVITE_INVALID          │
   │ 9  Status = Unused?           → INVITE_USED             │
   │ 10 Not past ExpiresAt?        → INVITE_EXPIRED          │
   │ 11 Username format + reserved → USERNAME_INVALID        │
   │ 12 UsernameKey free?          → USERNAME_TAKEN          │
   │ 13 PIN policy; PIN === confirm                          │
   │ 14 Generate salt → hash(PIN + salt + pepper), iterated  │
   │ 15 Assign MemberID · JoinDate · Status Active           │
   │    Role Member · counters 0 · ProfileComplete FALSE     │
   │    ConsentFeature as given                              │
   │ 16 Append Members row                                   │
   │ 17 Mark invite Used, record UsedBy + UsedAt             │
   └─ RELEASE LOCK ─────────────────────────────────────────┘
18 Create session; write AuditLog
19 Return token + member → dashboard, already logged in
20 Dashboard shows a dismissible nudge toward Stage 2
```

### Why steps 8–17 are inside one lock

Two separate check-then-act races live here, and both are real:

- Two people redeeming the **same invite code** at the same moment would both pass step 9 and both
  get accounts — the code would be used twice.
- Two people claiming the **same username** simultaneously would both pass step 12.

Sheets have no transactions and no unique constraints, so the lock is the only thing standing
between the design and a duplicate. Grouping the invite and the username check in the same critical
section also means a failed registration never burns a valid code.

### Two further guarantees

**Role is always `Member`.** No payload field can set it. Elevation happens only through
`admin.members.setRole`, which is Super Admin only. If registration accepted a role, anyone with an
invite could create a Super Admin.

**Registration returns a session.** Asking someone to log in seconds after choosing their PIN is
friction with no security benefit.

**There is exactly one other way an account comes into existence:** the one-time `SeedSuperAdmin`
setup function that creates your account at launch. It is not reachable over HTTP — it runs from the
Apps Script editor once — so it cannot become a back door.

---

## 4. Stage 2 — Profile completion, optional

Per your decision, Stage 2 never blocks anything. It is reachable from a dismissible dashboard
nudge and from settings, and it can be skipped forever.

Three fields, each independently savable — partial completion is a normal state, not an error.

| Field | Validation |
|---|---|
| WhatsApp Number | Format-checked, normalised to E.164. Not verified |
| Email | Format-checked. Not verified |
| Bio | Length-capped plain text |

Saving any field sets `ProfileComplete = TRUE` and stops the nudge. Data lands in `Profiles`, not
`Members` — reasoning in [`database.md`](database.md) §4.

**Profile photos are not in v2.** The `avatar` component ships in Phase 1 rendering initials, and
takes an optional image source later; adding the column and the upload action requires no
restructuring.

### Feature consent moved to registration

Asking it at Stage 1 rather than in an optional stage is the better call, and it fixes a problem I
had flagged: consent that lives behind a skippable step means the members who skip are silently
unfeaturable, and your FlowMate-of-the-Week pool quietly shrinks to whoever bothered.

It defaults to **unchecked** — nobody is opted in by silence — and it is stored on `Members` as a
queryable field, so the admin shoutout-candidate list filters on it directly. A public graphic can
never carry the name of someone who didn't agree. That is the difference between consent as an
enforceable rule and consent as an answer sitting in a form response.

---

## 5. Login and session flow

### Login

```
1  Member submits Username + PIN
2  POST auth.login
3  Rate limit                              → RATE_LIMITED
4  Normalise Username → UsernameKey; look up
   └─ not found → AUTH_FAILED   (identical to a wrong PIN, on purpose)
5  LockedUntil in the future?              → ACCOUNT_LOCKED
6  Status Inactive?                        → ACCOUNT_INACTIVE
7  Hash submitted PIN with salt + pepper; constant-time compare
   └─ mismatch → FailedLoginCount++; at 5 → LockedUntil = now + 15 min
                 audit → AUTH_FAILED
8  Success → reset FailedLoginCount, clear LockedUntil
9  Generate a 256-bit random token
10 Store SHA-256(token) in Sessions with MemberID, Role, ExpiresAt
11 Audit the login
12 Return raw token + member + flags:
     mustChangePin   → force the PIN-change screen before anything else
     redirect        → member | admin, derived from Role
```

`AUTH_FAILED` deliberately does not distinguish "no such username" from "wrong PIN" — the
distinction hands an attacker a list of valid usernames.

`mustChangePin` is set after an admin PIN reset and on admin-created accounts. Until it's cleared,
every action except `auth.changePin` and `auth.logout` is refused server-side. A client that
ignores the flag gets nowhere.

This matters because an admin who resets a PIN knows the temporary value. Without a server-enforced
gate, that admin could log in as the member.

### Why a session table instead of a self-contained signed token

A signed token needs no storage and no lookup — genuinely simpler. But **it cannot be revoked**, and
your spec requires suspending members, resetting PINs, and demoting Community Managers. Every one of
those must terminate existing sessions immediately. With a stateless token, a suspended member keeps
full access until it expires. The usual workaround is a revocation denylist, which is a session
table with extra steps.

So: an **opaque random token**, stored **hashed** server-side. One cached lookup per request, in
exchange for instant revocation, visible active sessions, and a leaked spreadsheet that yields
nothing usable.

### Session validation, on every request

```
1  Extract token from the request body
2  Hash, look up in Sessions (cache first)
   └─ missing / RevokedAt / past ExpiresAt      → SESSION_EXPIRED
3  Load member
   └─ Status Inactive                           → SESSION_EXPIRED
   └─ MustChangePin and action isn't the change → MUST_CHANGE_PIN
4  Re-read Role from Members — NOT from the session row
5  Update LastSeenAt; slide ExpiresAt forward
6  Attach { member, role, capabilities } to the request context
```

**Step 4 is the one that matters.** The role is re-read from `Members` on every request rather than
trusted from the session. When a Super Admin demotes a Community Manager, the demotion takes effect
on that person's very next request — not whenever their session happens to expire. The role on the
session row is a diagnostic snapshot, never an authorisation input.

### Lifetime — approved (Q5)

| Property | Value | Reason |
|---|---|---|
| Absolute expiry | 30 days | Stay logged in until logout or expiry. A daily-habit app shouldn't ask for a PIN every day |
| Sliding renewal | On each request | Active members are never interrupted |
| Idle expiry | 14 days | Someone who drifted away doesn't leave a live session on a shared phone |
| Storage | `localStorage` | Survives tab closes, which is what "remain signed in" means |
| Logout | Sets `RevokedAt`, clears local storage | |
| Revoke-all triggers | PIN change, PIN reset, suspension, role change, deletion | |

All five values are `Settings` rows, so tightening them later is an admin edit rather than a
redeploy.

`localStorage` is readable by any script on the origin, so its safety rests on the app having no
XSS. That is why all rendering goes through text nodes and typed element creation — **never raw
HTML assembled from server or user strings**. Bios, full names, and usernames are all
member-controlled text that appears on admin screens, so this is a live concern, not a theoretical
one.

### Expiry, from the member's side

The client checks expiry before each call and reacts to `SESSION_EXPIRED`. Either way it clears
local state, redirects to login, and shows *"Your session ended. Please log in again."* If they
were mid-submission, the pasted link is preserved and restored after they log back in.

---

## 6. RBAC

### Capabilities, not role checks

Authorisation is expressed as **capabilities** — `member:delete`, `analytics:read` — and roles are
bundles of them. Code asks *"does this session hold `member:delete`?"*, never *"is this role
`SuperAdmin`?"*

A fourth role becomes one row in the capability table and zero changes anywhere else. Scattered
`if (role === 'SuperAdmin')` checks are exactly the hardcoding your scalability section warns
against, and they are where privilege bugs live.

### The matrix

| Capability | Member | Community Manager | Super Admin |
|---|:--:|:--:|:--:|
| `dashboard:self` | ✅ | ✅ | ✅ |
| `submission:create` | ✅ | ✅ | ✅ |
| `submission:read:self` | ✅ | ✅ | ✅ |
| `leaderboard:read` | ✅ | ✅ | ✅ |
| `pin:update:self` | ✅ | ✅ | ✅ |
| `profile:read:self` | ✅ | ✅ | ✅ |
| `profile:update:self` | ✅ | ✅ | ✅ |
| `admin:overview:read` | ❌ | ✅ | ✅ |
| `member:read:all` | ❌ | ✅ | ✅ |
| `member:update` | ❌ | ✅ | ✅ |
| `member:status:set` | ❌ | ✅ | ✅ |
| `member:pin:reset` | ❌ | ✅ | ✅ |
| `profile:read:all` | ❌ | ✅ | ✅ |
| `submission:read:all` | ❌ | ✅ | ✅ |
| `submission:void` | ❌ | ✅ | ✅ |
| `analytics:read` | ❌ | ✅ | ✅ |
| `invite:create` | ❌ | ✅ | ✅ |
| `invite:read` | ❌ | ✅ | ✅ |
| `invite:revoke` | ❌ | ✅ | ✅ |
| `settings:read` | ❌ | ✅ | ✅ |
| `member:delete` | ❌ | ❌ | ✅ |
| `member:role:set` | ❌ | ❌ | ✅ |
| `settings:update` | ❌ | ❌ | ✅ |
| `audit:read` | ❌ | ❌ | ✅ |

**Community Managers and Super Admins hold every Member capability** — approved in Q6. They are
members of the community with their own streaks, they appear on leaderboards, and they submit
posts like everyone else.

### "My Dashboard" — approved (Q6)

The admin shell carries a **My Dashboard** switch in its top bar, and the member shell carries a
matching **Admin** switch for anyone holding `admin:overview:read`.

Because the two shells are separate HTML documents on the same origin, the switch is a real
navigation and the session token in `localStorage` carries across untouched. It is a full page load
— but this is a deliberate, infrequent mode change, not in-app navigation, so a moment of load is
appropriate and arguably clarifying.

A Community Manager's own posts count normally toward their streak and their leaderboard position.
No special-casing: admins are members.

### Ownership, on top of capabilities

Capabilities alone are not enough. `submission:read:self` has to mean *this member's own* rows.
Every member-scoped action derives the target `MemberID` **from the session**, never from the
payload. A member cannot request another member's dashboard because there is no field in which to
ask for it.

### The enforcement chain

```
REQUEST
  ├─ 1. Authenticate     valid, unrevoked session?        → SESSION_EXPIRED
  ├─ 2. PIN gate         MustChangePin set?               → MUST_CHANGE_PIN
  ├─ 3. Load role        fresh, from Members
  ├─ 4. Resolve caps     role → capability set
  ├─ 5. Authorise        required capability present?     → FORBIDDEN
  ├─ 6. Scope            member-scoped? force to session's MemberID
  ├─ 7. Invariants       self-escalation? last Super Admin? → refuse
  ├─ 8. Execute
  └─ 9. Audit            if anything mutated
```

Steps 1–5 are middleware, applied uniformly. **An action cannot be added without declaring its
capability** — the action table is the registration point, so an unprotected endpoint can't happen
by omission.

### Client-side routing, and what it is actually worth — approved (Q7)

| Layer | Value |
|---|---|
| Router guard bounces a Member from `#/admin/*` before mount | Good UX. **Zero security value** |
| Admin ships as a separate bundle | Member never loads admin code. Minor value |
| **Server capability check on every action** | **The actual boundary** |

A Member typing the admin URL is redirected instantly. If they bypass the redirect by editing
JavaScript in their own browser, every panel loads empty because the server refuses every request.
**No member record, no submission, no invite code, no analytic number ever crosses the wire to
someone without the capability.**

The static shell itself remains downloadable — unavoidable on static hosting, and you've accepted
this. Only an empty skeleton is exposed; never data.

---

## 7. Rate limiting — including what it cannot do

| Endpoint | Limit | Purpose |
|---|---|---|
| `auth.login` | 5 failures per `UsernameKey` | 15-min lockout, escalating |
| `auth.register` | Per invite code, plus a global hourly ceiling | Codes are single-use, so this is a backstop |
| `submission.create` | Soft daily cap per member | Accidental floods, leaderboard inflation |
| All authenticated | Per-session request ceiling | Runaway client loops |

**Apps Script does not expose the client IP address.** Limiting is therefore per account and per
session, not per attacker. Invite-gating is what closes the gap that IP limiting would otherwise
have to cover — an attacker without a valid, unused code cannot create an account at all, no matter
how many requests they send. That is the main security benefit of your Q3 decision, beyond keeping
the community private.
