# Security Architecture

**Phase 3 · Deliverable 7.**

---

## 1. The threat model, stated plainly

**There is no network boundary.** The Apps Script deployment must be
`ANYONE_ANONYMOUS` for a browser to reach it, so every request from anyone on
the internet arrives at `doPost`. No firewall, no VPN, no IP allowlist — and
Apps Script does not even expose the client IP.

Everything protecting this application is application code. That is the central
assumption, and it is why the design looks the way it does: a capability
declared per action, the role re-read on every request, and client-side guards
documented as user experience rather than security.

### What is actually at risk

| Asset | Exposure | Realistic attacker |
|---|---|---|
| Member PINs | 6 digits, hashed | Someone with a member's username guessing |
| Session tokens | `localStorage` | XSS, or a shared device |
| Member PII | WhatsApp, email in `Profiles` | An over-curious Community Manager |
| The leaderboard | Public within the tribe | A member inflating their own standing |
| The spreadsheet | Google Drive | A mis-shared link |
| Admin actions | Role-gated | A member probing the admin endpoints |

The most likely real incident is not a determined attacker. It is a shared
phone, a forwarded invite code, or a spreadsheet shared one person too widely.
The design weights accordingly.

---

## 2. Authentication

### PIN storage

```
stored = iterate( HMAC-SHA256( pin + salt, pepper ), N )
```

| Element | Where | Purpose |
|---|---|---|
| `pin` | Never stored, never logged, never returned | |
| `salt` | `Members.PinSalt`, 16 random bytes per member | Identical PINs produce different hashes |
| `pepper` | **`PropertiesService`** — never in a sheet, never in the repo | A leaked spreadsheet yields nothing crackable |
| `N` | `Settings: auth.hashIterations` | Raises the cost of bulk attempts |

Apps Script offers no bcrypt, scrypt, or Argon2 — only SHA-family digests and
HMAC. Iterated HMAC-SHA256 with a salt and a server-side pepper is the strongest
construction available on the platform.

**The pepper is the part that matters most.** Salting and iteration slow an
attacker who already has the hashes. The pepper means having the hashes is not
enough — and a leaked spreadsheet is by far the most plausible way they would
be obtained.

Verification uses a constant-time comparison. A short-circuiting `===` leaks how
many leading characters matched, which over enough attempts meaningfully narrows
a 6-digit space.

### PIN policy

Exactly 6 digits. Rejects all-same, ascending and descending runs, and a
denylist of the most common 6-digit PINs. A PIN of `111111` makes the length
decorative.

### What a 6-digit PIN honestly buys

1,000,000 possibilities — a hundredfold improvement on v1's four digits for one
extra second of typing. But the ordering of what protects accounts is unchanged:

1. **Exponential backoff after 5 failures.** This is the defence that matters.
   Without it, no PIN length is enough.
2. **The pepper.** Protects against the offline attack.
3. **Salt and iteration.** Slow bulk cracking.

A PIN is a convenience credential for a small, trusting community. It stops
casual snooping and opportunistic guessing. It is not, and is not presented as,
a password.

---

## 3. Session protection

| Property | Value | Reason |
|---|---|---|
| Token | 256-bit random, opaque | No structure to forge or infer |
| Server storage | **SHA-256 hash only** | A leaked spreadsheet hands over no live sessions |
| Client storage | `localStorage` | "Stay signed in" must survive a closed tab |
| Absolute expiry | 30 days | |
| Idle expiry | 14 days | A drifted-away member leaves no live session on a shared phone |
| Revocation | Immediate | Logout, PIN change, PIN reset, suspension, role change, deletion |

**Why a session table rather than a signed self-contained token.** A signed
token needs no storage and cannot be revoked. Suspending a member, resetting a
PIN, and demoting a Community Manager must all terminate sessions *now*. With a
stateless token, a suspended member keeps full access until expiry.

**`localStorage` is readable by any script on the origin.** Its safety rests
entirely on the application having no XSS — which is why §7 is not optional.

---

## 4. Authorisation

### Capabilities, not role comparisons

Code asks *"does this session hold `member:delete`?"* — never *"is this role
`SuperAdmin`?"* Roles are bundles of capabilities defined in one table. A fourth
role is one row and zero changes elsewhere.

Scattered `if (role === 'SuperAdmin')` checks are where privilege bugs live,
because each is a separate opportunity to get it wrong.

### Three layers, and what each is worth

| Layer | Security value |
|---|---|
| Router guard bounces a Member from `#/admin/*` | **Zero.** Good UX only |
| Admin ships as a separate shell | Minor — reduces attack surface loaded |
| **Capability check per action, server-side** | **The entire boundary** |

A member who edits their own JavaScript to reach the admin URL sees an empty
frame: every panel is populated by a request the server refuses. **No member
record, no submission, no invite code, no analytic number crosses the wire to
someone without the capability.**

### Role freshness

The role is re-read from `Members` on every request, never taken from the
session row and never from the payload. A demotion takes effect on that person's
very next request rather than whenever their session lapses.

### Scope

Member-scoped actions derive the target `MemberID` **from the session**. There
is no payload field in which to request another member's data — the parameter
does not exist, so it cannot be tampered with.

### Invariants no UI can express

Enforced in `MemberService`, not in a controller:

- **No self-escalation** — `setRole` refuses when actor equals target
- **The last Super Admin is protected** — any change leaving zero is refused
- **Deletion refuses with history** — deactivation offered instead

---

## 5. Validation

Every input is validated **server-side**. Client validation exists so a member
learns their PIN is five digits while typing rather than after a round trip; it
is never trusted.

| Layer | Checks |
|---|---|
| `Validate` middleware | Shape, types, required fields, length ceilings |
| Service layer | Business rules — uniqueness, state transitions, quotas |
| `lib/` | Pure format rules — username pattern, PIN policy, link normalisation |

### The line that is not crossed

Format checks may be mirrored on the client. **Judgements may not.**
Link-to-platform matching, duplicate detection, streak arithmetic, milestone
evaluation, and ranking are server-only, because they judge the member and must
not be editable by the person being judged.

`src/lib/platforms.js` holds labels, icons, and colours — deliberately **not**
the hostname allowlist.

### Link validation specifically

Matching is by **registrable domain suffix**, not substring. `notlinkedin.com`,
`linkedin.com.evil.co`, and `evil.com/?u=linkedin.com` are all rejected. A naive
`url.includes('linkedin.com')` accepts every one of them, and the leaderboard it
feeds is what decides public recognition.

---

## 6. Rate limiting

| Endpoint | Limit | Purpose |
|---|---|---|
| `auth.login` | Exponential backoff per `UsernameKey` — see below | Brute force |
| `auth.register` | Per invite code + global hourly ceiling | Backstop; codes are single-use |
| `auth.checkUsername` | 20/min/session | Member enumeration |
| `submission.create` | Daily cap per member | Accidental floods, leaderboard inflation |
| All authenticated | Per-session request ceiling | Runaway client loops |

Limiting runs **before** authentication in the middleware chain. Verifying a PIN
means running an iterated hash — slow by design. An attacker who can force that
work before being throttled has a denial-of-service vector.

### Exponential backoff, not a flat lock — approved refinement

A flat 15-minute lockout is a denial-of-service vector. Usernames are visible on
the leaderboard, so anyone could lock out any member repeatedly with a trivial
script — and Apps Script cannot see the client IP, so there is nothing to block.
A member unable to log in for a week because someone is scripting against them
is a real failure of *encouraging rather than demanding*.

| Consecutive failures | Delay before the next attempt is accepted |
|---|---|
| 1–4 | none |
| 5 | 30 seconds |
| 6 | 2 minutes |
| 7 | 8 minutes |
| 8+ | 30 minutes, capped |

The member who mistyped waits half a minute. An attacker gains almost nothing
per attempt. Crucially **the account is never fully unusable** — the delay sits
between attempts rather than forming a wall, so a legitimate member is always
one short wait from getting in.

`Members.LockedUntil` becomes `NextAttemptAt`, and `FailedLoginCount` drives the
curve. Both reset on success. A sustained run of failures writes an `AuditLog`
row so an attack is visible rather than merely absorbed.

### The honest limitation

**Apps Script does not expose the client IP.** Limiting is per account and per
session, never per attacker. Someone with a script and a list of usernames can
lock accounts out — a nuisance-level denial of service against individuals.

**Invite-gating is what closes the larger gap.** An attacker without a valid,
unused code cannot create an account at all, however many requests they send.
That is the main security benefit of the invite decision, beyond privacy.

---

## 7. Input sanitisation

Two distinct injection surfaces, neither obvious.

### Formula injection into the spreadsheet

A value beginning `=`, `+`, `-`, or `@` is interpreted as a **formula** when the
sheet is opened. A bio reading `=IMPORTXML(...)` becomes a live formula in a
document the operator opens daily.

**Mitigation:** `SheetClient` escapes every string that could contain member
input, at the write boundary. One helper, applied in one place, so no repository
can forget. Retrofitting this across fourteen repositories later would be
painful and incomplete.

### XSS into the admin interface

Full names, usernames, bios, and submitted links are all member-controlled and
all rendered on admin screens, where a payload would execute with a Community
Manager's or Super Admin's session — and `localStorage` holds that session's
token.

**Mitigation:** the front end never assigns `innerHTML`. Every string goes
through `textContent` via `el()`. This makes the bug class structurally
impossible rather than merely absent, which matters because the alternative is
remembering to escape correctly at every one of hundreds of call sites.

### Output

No response contains a PIN hash, a salt, a session id, another member's profile,
or an unused invite code outside the admin invite endpoints. Leaderboards return
name, count, rank, and level — nothing more.

---

## 8. Admin protection

**Least privilege by default.** Community Managers run the community day to day.
Only Super Admins can delete members, change roles, edit settings, or read the
audit log — the four actions that are irreversible or that alter who holds power.

**PII access is logged.** `admin.members.get` and bulk profile reads write an
`AuditLog` row with `Result = READ`. Members hand over WhatsApp numbers on the
promise of a close-knit community; "who looked at this" should be answerable.

**Contact details are masked in list views** and revealed only on a member's
detail screen, making casual browsing of phone numbers a deliberate act rather
than a side effect of scrolling.

**`SeedSuperAdmin` is not an endpoint.** It runs once from the Apps Script
editor and is unreachable over HTTP, so the one account created outside
registration cannot become a back door.

**Destructive actions confirm**, and `admin.members.delete` requires an explicit
`confirm` in the payload beyond the UI dialogue.

---

## 9. Audit logging

One append-only `AuditLog`: `Timestamp · ActorMemberID · ActorRole · Action ·
TargetMemberID · Details · Result`.

**Logged:** login success and failure, lockout, registration, PIN change and
reset, role change, status change, deletion, submission void, rejected
duplicate, invite create/redeem/revoke, settings change, admin profile reads,
`ROLLUP_PENDING` markers, job completion.

**Not logged:** PINs, tokens, or any credential — in any form, including
failures. A log that records what someone typed as a wrong PIN is a log of
near-miss credentials.

`ActorRole` is why a separate admin log is unnecessary: filtering by role
answers everything a second sheet would, without the argument about which log an
event belongs in.

**Append-only, never edited.** An audit log an administrator can rewrite is not
an audit log.

---

## 10. Secrets

| Secret | Location | Consequence if leaked |
|---|---|---|
| PIN pepper | `PropertiesService` | Hashes become attackable offline |
| Session signing key | `PropertiesService` | Reserved; tokens are currently opaque random |
| Deployment URL | `src/core/config.js`, git-ignored | **Not a secret** — public by necessity |

Neither secret is in a sheet, in the repository, or in any response. Both are
set once from the Apps Script editor.

**Rotation.** Rotating the pepper invalidates every PIN, so it requires a reset
flow for all members — expensive, and worth knowing before it is needed rather
than during an incident. Rotating the session key simply logs everyone out.

---

## 11. Residual risks, accepted

Stated so they are decisions rather than oversights.

| Risk | Why accepted |
|---|---|
| A 6-digit PIN is not a password | Right level for a small trusting community. Lockout carries the weight |
| No IP-based rate limiting | The platform does not expose it. Invite-gating substitutes |
| `localStorage` is XSS-readable | Mitigated by the no-`innerHTML` rule, which is architectural |
| An admin can read all PII | Inherent to running a community. Made visible through read logging |
| The spreadsheet is as secure as its Drive sharing | Operator responsibility. Hashed PINs and hashed sessions limit the damage |
| A shared invite code lets one unintended person in | Single-use and expiring bounds it to exactly one account |
| The admin shell is downloadable | Unavoidable on static hosting. It contains no data |

## 12. Verification, planned for Phase 5

Security claims are worth what they can be demonstrated to be.

1. **Authenticate as a plain Member, call every admin action, assert
   `FORBIDDEN`** — driven by the action table itself, so an action added later
   without a capability fails the test automatically. Not a spot check.
2. Assert no response body ever contains `PinHash`, `PinSalt`, or `SessionID`.
3. Confirm lockout triggers at the fifth failure and blocks the sixth.
4. Confirm a revoked session is rejected on its next request.
5. Confirm a demoted Community Manager loses admin access on their next request,
   without re-login.
6. Confirm formula-injection payloads are inert when written to a sheet.
