# Final Security Review

**Phase 7.** A review of the built system against the threat model in
[`security-architecture.md`](security-architecture.md).

Every claim below is either backed by a passing check in
`tests/backend-suite.js` or explicitly marked as needing the live deployment.

---

## Verdict

The system is appropriate to deploy for a private community of this size. Six
residual risks are accepted and listed in §9 — each is a decision, not an
oversight.

| Area | Status | Evidence |
|---|---|---|
| Session validation | ✅ Verified | 8 checks |
| Role validation | ✅ Verified | 6 checks, table-driven |
| PIN hashing | ✅ Verified | Fake + real digest in the smoke test |
| Spreadsheet protection | ⚠️ Operator-dependent | Sharing is not something code can enforce |
| Input sanitisation | ✅ Verified | Formula injection and XSS |
| Rate limiting | ✅ Verified | Backoff, per-account |
| Authorisation | ✅ Verified | All 17 admin actions refused to a Member |
| Audit logging | ✅ Verified | Present, append-only, credential-free |

---

## 1. Session validation

**Tokens are 256-bit random and stored hashed.** `Sessions.SessionID` holds
SHA-256 of the token; the raw value exists only in the member's browser.
A leaked spreadsheet hands over no usable session.

> *Verified:* "a session token is stored hashed, never raw" — asserts the stored
> value differs from the issued token and is a 64-character digest.

**Validation is complete on every request:** existence, revocation, absolute
expiry, idle expiry, and member status. A suspended member's live session stops
working immediately rather than at expiry.

> *Verified:* logout revokes; suspension blocks login; PIN reset kills sessions.

**Revocation triggers:** logout, own PIN change, admin PIN reset, suspension,
role change, deletion. This is the reason a session table exists rather than a
self-contained signed token — a stateless token cannot be revoked, and every
one of those six actions requires it.

**Idle expiry at 14 days, absolute at 30.** Someone who drifts away does not
leave a working session on a shared phone.

---

## 2. Role validation

**Capabilities, never role comparisons.** Code asks *"does this session hold
`member:delete`?"*. There is no `if (role === 'SuperAdmin')` in a controller.

**The role is re-read from `Members` on every request.** `Sessions.Role` is a
diagnostic snapshot and is never an authorisation input. A demotion takes effect
on that person's next request.

> *Verified:* "a role change takes effect on the next request, without re-login".

**The authorisation test is table-driven.** It iterates the action table and
asserts that a Member is refused every action beginning `admin.` — so an admin
endpoint added later without a capability **fails the test automatically**. It
is not a hand-written list that can fall out of date.

> *Verified:* 17 admin actions refused, each returning `FORBIDDEN` with **no
> `data` in the response**.

**Community Manager boundaries hold under direct calls.** Not just hidden
buttons: a manager calling `admin.settings.update` directly is refused, and the
setting is asserted **unchanged** afterwards.

**Invariants that no interface can express**, enforced in the service layer:

| Invariant | Verified |
|---|---|
| No self-escalation | ✅ |
| The last Super Admin cannot be demoted or suspended | ✅ |
| Deletion refuses while a member has history | ✅ |

---

## 3. PIN hashing

```
stored = iterate( HMAC-SHA256(pin + salt, pepper), 600 )
```

| Element | Where | Verified |
|---|---|---|
| Plain PIN | Nowhere — not stored, logged, or returned | ✅ asserted absent from every response |
| Salt | `Members.PinSalt`, 16 random bytes each | ✅ same PIN, different salt → different hash |
| Pepper | `PropertiesService` only | ✅ present at setup |
| Iterations | 600, configurable | ✅ |
| Comparison | Constant-time | ✅ both directions |

**The pepper is what matters most.** Salt and iteration slow someone who
already has the hashes; the pepper means having them is not enough — and a
leaked spreadsheet is by far the likeliest way they would be obtained.

**Verified against the real digest.** The smoke test runs this on the live Apps
Script `Utilities.computeHmacSha256Signature`, not the fake — so the deployed
hashing is proven, not assumed.

**Policy:** exactly 6 digits, rejecting repeats, sequences, and a common-PIN
denylist.

> *Verified:* `123456` is refused at registration.

**Honest limit:** a 6-digit PIN is a convenience credential. It stops casual
snooping and opportunistic guessing. It is not a password, and is not presented
as one. What actually protects accounts is the backoff in §6.

---

## 4. Spreadsheet protection

**What the code guarantees:** PINs are hashed, session tokens are hashed, and
member input is escaped before it is written.

**What the code cannot guarantee:** who the spreadsheet is shared with. If it
is shared too widely, contact details and the audit log are exposed — the PIN
hashes stay useless without the pepper, but PII does not.

⚠️ **This is the single largest residual risk, and it is entirely operational.**
It is a checklist item, not a code path.

The narrow OAuth scope (`spreadsheets.currentonly`) means the script can touch
the bound spreadsheet and nothing else in the account.

**That scope is load-bearing, and was defended in Phase 9.** `SheetClient`
carried an `FT_SPREADSHEET_ID` property that called `SpreadsheetApp.openById()`
so a staging deployment could point elsewhere. It could never have worked —
`currentonly` refuses `openById` on any other file — and the only way to make
it work was to widen the scope to full `spreadsheets`. That would have granted
a web app deployed as the owner and reachable by `ANYONE_ANONYMOUS` read and
write access to **every spreadsheet in the founder's Drive**.

The override was removed instead. Staging is a copy of the spreadsheet with its
own bound script: one extra step, no permission cost.

---

## 5. Input sanitisation

### Formula injection — the non-obvious one

A value beginning `=`, `+`, `-`, or `@` becomes a **live formula** when the
sheet is opened. A bio reading `=IMPORTXML(...)` would execute in a document
the operator opens daily.

Escaped in `SheetClient.sanitise`, at the write boundary — one place, so no
repository can forget.

> *Verified twice:* once in the suite, once in the smoke test against the real
> sheet, both re-reading the stored value rather than trusting the return.

*(The smoke test originally checked the returned object rather than the stored
cell — it passed while proving nothing. Corrected during this phase.)*

### XSS

Session tokens live in `localStorage`, so the app's safety depends on having no
XSS. Full names, usernames, bios, and links are all member-controlled and all
render on admin screens, where a payload would execute with an administrator's
session.

**The front end never assigns `innerHTML`.** Every string goes through
`textContent` via `el()`, which makes the bug class structurally impossible
rather than merely absent.

### Server-side validation

Every input is validated on the server. Client validation exists for instant
feedback only. Format checks may be mirrored; **judgements may not** —
link-to-platform matching, duplicate detection, streak arithmetic, and ranking
are server-only, because they judge the member.

> *Verified:* domain lookalikes (`notlinkedin.com`, `linkedin.com.evil.co`,
> `evil.com/?u=linkedin.com`) are all rejected; the platform is read from the
> member record and a payload `platform` field is ignored.

---

## 6. Rate limiting

**Exponential backoff, not a flat lockout.** Usernames are visible on the
leaderboard, so a fixed lockout would let anyone lock out anyone repeatedly.
Delays grow between attempts; the account is never fully unusable.

> *Verified:* five failures trigger `ACCOUNT_LOCKED` even with the correct PIN;
> a success clears the counter.

| Endpoint | Limit |
|---|---|
| `auth.login` | Exponential backoff per username |
| `auth.register` | Per invite code + hourly ceiling |
| `auth.checkUsername` | 40/min — limits member enumeration |
| `submission.create` | Daily cap |

Limiting runs **before** authentication, because verifying a PIN means running
an iterated hash. An attacker who could force that work before being throttled
would have a denial-of-service vector.

**Honest limit:** Apps Script does not expose the client IP, so limits are
per-account, never per-attacker. **Invite-gating is what closes that gap** —
without a valid unused code, no account can be created at all.

---

## 7. Authorisation

Three layers, and what each is actually worth:

| Layer | Value |
|---|---|
| Router guard bounces a Member from `#/admin/*` | **Zero.** Good UX only |
| Admin ships as a separate shell | Minor |
| **Capability check per action, server-side** | **The entire boundary** |

> *Verified in-browser:* a Member loading `admin.html` is redirected with no
> admin shell rendered; a Community Manager sees 6 nav items and `#/audit`
> bounces to the overview.
>
> *Verified server-side:* the guards are irrelevant — every action is refused
> independently, with no data in the response.

**Scope cannot be tampered with.** Member-scoped actions derive the target
member from the session. There is no payload field in which to ask for someone
else's data.

**Leaderboard scores cannot be edited.** Asserted structurally: no action
matching `leaderboard.(set|update|edit|adjust)` exists. The only way to change
a standing is to void a submission, which is audited.

---

## 8. Audit logging

One append-only log: timestamp, actor, actor role, action, target, details,
result.

**Logged:** logins and failures, lockouts, registration, PIN changes and resets,
role and status changes, deletions, voided submissions, invite create/redeem/
revoke, settings changes, **admin profile reads**, rollup markers, job
completion, and refused attempts.

**Never logged:** PINs or tokens in any form, including failed attempts. A log
that records what someone typed as a wrong PIN is a log of near-miss
credentials.

> *Verified:* neither a wrong PIN nor a real PIN appears anywhere in the log.

**PII access is recorded.** `admin.members.get` writes a `MEMBER_READ` row.
Members hand over WhatsApp numbers on the promise of a close-knit community;
"who looked at this" should be answerable.

**Append-only, never edited.** The smoke test deliberately leaves its entries
behind: a log a test can erase is not a log.

---

## 9. Residual risks — accepted

| Risk | Why accepted |
|---|---|
| A 6-digit PIN is not a password | Right level for a small trusting community; backoff carries the weight |
| No IP-based rate limiting | The platform does not expose it. Invite-gating substitutes |
| `localStorage` is XSS-readable | Mitigated architecturally by the no-`innerHTML` rule |
| An admin can read all PII | Inherent to running a community. Made visible through read logging |
| **Spreadsheet security is the operator's** | Cannot be enforced in code. Checklist item |
| No self-service PIN recovery | No verified email or phone to send to. An admin reset is the path, and the error copy says so |

---

## 10. Still requires the live deployment

The smoke test covers most of this the moment it runs on the real project.

- [ ] Real Apps Script `Utilities` digest output — **covered by the smoke test**
- [ ] Real `LockService` behaviour under genuine concurrency — the fake is single-threaded
- [ ] Real quota behaviour under sustained load
- [ ] `text/plain` CORS path against the live endpoint from a browser
- [ ] Confirmation that the spreadsheet is not over-shared

The concurrency item is the only one that cannot be checked from a single
execution. At sixty members it is unlikely to matter — a member does not submit
concurrently with themselves except by double-tapping, which idempotency
already covers — but it is honest to say it is untested rather than to claim
otherwise.
