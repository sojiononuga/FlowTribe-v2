# Final Product Decisions

**Status: BINDING. This document governs.**
**Decided by the project owner. Supersedes any contrary reading of any other
document, including the three design documents.**

Any future session — human or Claude — must read this before acting on
anything in `docs/` or in the `.docx` design files.

---

## 0. Strategic product direction override — approved 25 August 2026

The project owner has explicitly superseded the earlier description of Flow Tribe as a content-creation or creator-only product.

**Binding strategic direction:**

> **Flow Tribe is not a content-writing app. Content creation is one use case inside a much broader adaptive goal-and-action system.**

The approved north star is now defined in [`product-vision.md`](product-vision.md): Flow helps people pursue meaningful goals, translate them into action, adapt when changing circumstances make the current plan unrealistic, recover without treating disruption as failure, build momentum, and move with a Tribe.

This strategic override **does not invalidate the verified v2 implementation as a release baseline**. Existing creator-specific behaviour may remain temporarily as a compatibility vertical while the universal domain is introduced safely. Therefore:

- the current implementation remains the source of truth for behaviour that has not yet been intentionally migrated;
- creator-specific terminology and schema are **not** frozen as the permanent product ontology;
- `Post`, `Submission` and `Platform` should progressively map to the broader `Action`, `Evidence` and `Goal Context` model;
- future product decisions must not make content creation the product boundary;
- a big-bang rewrite is not authorised merely for terminology purity; preserve the verified baseline while generalising through tested seams;
- the long-term product centre is Goal → Plan → Action → Evidence → Progress → Constraint → Adaptation → Recovery → Momentum, with Tribe around the loop;
- Flow Adapt is the first signature intelligence capability: when circumstances change, Flow proposes a revised path while preserving the user's meaningful goal where appropriate.

Where an older document calls Flow Tribe the "Duolingo of content creation" or a "content accountability platform", that language is now **historical/legacy**, not governing product direction.

---

## 1. The decision, in one line

> **The implementation is the source of truth for how Flow Tribe *works*.
> The design documents are the source of truth for how Flow Tribe *looks*.**

This resolves the divergence previously catalogued as **D0** in
[`CURRENT_STATE.md`](CURRENT_STATE.md). Option **B** was chosen.

---

## 2. Two authorities, two scopes

| Authority | Scope | Precedence |
|---|---|---|
| **The built implementation** (Phases 1–7, approved) | All product behaviour, business logic, workflows, engineering | **Absolute** for functionality |
| **The three `.docx` design documents** | Visual design and UI presentation only | **Absolute** for appearance |

The three design documents:

- `Flow-Tribe-Design-System.docx`
- `Flow-Tribe-UI-Design-Specification.docx`
- `Flow-Tribe-UI-Spec-Screens-7-15.docx`

They must never be recreated, rewritten, replaced, or merged.

---

## 3. CURRENT RELEASE BASELINE — protect during migration

The items below describe the verified creator-shaped v2 release baseline. They remain protected against casual refactoring or accidental drift, but the owner's 25 August 2026 strategic approval explicitly authorises their **controlled supersession where necessary to implement the universal Flow domain**.

Do not change them piecemeal. A migration must preserve compatibility or provide an evidenced replacement, update the relevant contracts and tests, and keep a rollback path until the replacement is verified.

| # | Protected current-release behaviour |
|---|---|
| 1 | **Authentication flow** — including exponential backoff and constant-time comparison |
| 2 | **Registration flow** — three steps, invite-gated |
| 3 | **Username + 6-digit PIN authentication** |
| 4 | **Invite-only registration** — single-use codes, 14-day default expiry |
| 5 | **Weekly streak logic** — consecutive weeks meeting goal; the current week never breaks a streak |
| 6 | **Weekly goals** — 3, 5, or 7; `GoalAtSubmission` frozen per row |
| 7 | **Submission workflow** — one field; platform fixed at registration |
| 8 | **All business rules** — see `PROJECT_OVERVIEW.md` §Business Rules |
| 9 | **Database schema** — all 14 sheets, every column |
| 10 | **Google Apps Script architecture** — layering, orchestrators, pipeline |
| 11 | **API contracts** — all 38 actions, envelope, error codes |
| 12 | **Backend logic** — services, repositories, jobs, reconciliation |
| 13 | **Frontend behaviour** — data flow, state, loading, error handling |
| 14 | **Navigation flow** — routes, guards, information architecture |
| 15 | **All engineering decisions already implemented** — D1–D42 in [`decisions.md`](decisions.md) |

### Still locked unless a specific product decision supersedes them

- **No emojis anywhere in the application.** The design documents use emojis
  as shorthand; the Design System itself specifies *"premium icon badges
  rather than emojis"*. **The icon system wins.**
- **Charts are hand-rolled SVG.** Do not introduce Chart.js or any charting
  library. The Design System also specifies SVG, so these agree.
- **No build step. No runtime dependencies.**

---

## 4. ADOPTABLE — visual design from the design documents

Everything here changes appearance only. **If a visual change would alter
behaviour, it is out of scope and must be raised first.**

### 4.1 Brand colours — `Flow-Tribe-Design-System.docx` Step 1

| Purpose | Name | Hex |
|---|---|---|
| Primary | Deep Burgundy | `#5B0000` |
| Secondary | Bright Red | `#FF2D2D` |
| Accent | Golden Yellow | `#F5B400` |
| White | White | `#FFFFFF` |
| Background | Soft Off White | `#F8F8F8` |
| Text | Charcoal | `#222222` |
| Border | Light Grey | `#E5E5E5` |
| Success | Green | `#22C55E` |
| Warning | Amber | `#F59E0B` |
| Error | Red | `#DC2626` |

**Implementation note:** these replace the values in `styles/tokens.css`. Every
component reads from tokens, so this is largely a single-file change. Scales
(50–900) will need regenerating around the new anchors.

### 4.2 Typography — Step 2

- **Satoshi** — headings, cards, statistics, buttons. Bold 700, Medium 500.
- **Inter** — body, forms, tables, labels, navigation, admin. Regular 400,
  Medium 500, SemiBold 600.

Type scale: Hero 48 · Page 36 · Section 28 · Card 22 · Subheading 18 · Body 16
· Small 14 · Caption 12.

Buttons: Satoshi Medium 16px. Statistics: Satoshi Bold, 32–48px.

**Implementation note:** `styles/fonts.css` already has `@font-face` blocks
written and commented, and `--ft-font-display` / `--ft-font-brand` already
exist. Drop `.woff2` files into `assets/fonts/`, uncomment, repoint the
variables. **Self-host — do not use the Google Fonts CDN** (render-blocking
third-party request, leaks member IPs, breaks when blocked).

### 4.3 Design tokens — Step 3

| Token | Value |
|---|---|
| Radius — buttons, inputs | 12px |
| Radius — cards | 20px |
| Radius — modals | **24px** *(currently 28px)* |
| Radius — badges | 999px (pill) |
| Radius — avatars | 50% (circle) |
| Spacing | Multiples of 8: XS 4 · SM 8 · MD 16 · LG 24 · XL 32 · XXL 48 · XXXL 64 |
| Shadows | 3 levels: cards · hover · modals. Soft, never harsh |
| Max content width | 1280px |
| Grid | Desktop 12-col · Tablet 8-col · Mobile 4-col |

Cards: white background, 20px radius, soft shadow, 24px internal padding.
Inputs: white background, light border, rounded, burgundy focus glow.
Buttons: Primary burgundy/white · Secondary white with burgundy border ·
Success green · Danger red.

### 4.4 Iconography — Step 4

Outline icons, 2px stroke, rounded corners, clean geometry — the existing
system already matches this.

Sizes: navigation 24 · buttons 20 · cards 24 · statistics 28 · empty states 64
· feature highlights 80.

Icon colours: default `#222222` · active `#5B0000` · success `#22C55E` ·
warning `#F59E0B` · error `#DC2626` · disabled `#BDBDBD`.

**Icon mappings to adopt** (the milestone *set* stays exactly as built — only
the icons change):

| Milestone | Icon |
|---|---|
| First Step | Footsteps |
| First Goal Completed | Target |
| 7 Active Days | Calendar Check |
| 30 Active Days | Calendar Star |
| 100 Active Days | Medal |
| Perfect Week | Check Circle |
| Five Perfect Weeks | Shield |
| Consistency Champion | Crown |
| Weekly Champion | Trophy |
| 10 / 50 / 100 / 250 / 500 Posts | Pen · Feather · Spark · Mountain · Diamond |
| Founding Member | Flag |

**Note:** the design document's milestone list omits **Top 10**, which exists
in the build. Keep it; assign an icon consistent with the set (Medal is taken —
suggest a numbered badge or ribbon). This is an icon gap, not a product change.

| Flow Level | Icon |
|---|---|
| Seedling | Leaf |
| Creator | Pencil |
| Builder | Hammer |
| Consistent Creator | Mountain |
| Community Leader | Compass |
| Tribe Legend | Star |

Feature icons: Dashboard→Home · Submit→Pen · Calendar→Calendar · Weekly
Goal→Target · Flow Level→Mountain · Milestones→Award · Leaderboard→Trophy ·
Profile→User · Notifications→Bell · Settings→Gear · Members→Users ·
Analytics→Bar Chart · Audit→Clipboard · Invites→Ticket · Logout→Arrow Out.

### 4.5 Illustrations

Flat, friendly, minimal, clean, modern. No cartoon characters, 3D, excessive
gradients, or busy backgrounds. Empty states get a simple illustration that
encourages action without feeling childish.

### 4.6 Animations

Smooth, never distracting. Button hover · card hover · page transitions ·
progress updates · achievement unlocks · loading states. No excessive bouncing
or flashy effects. Milestone unlock: clean badge, subtle glow, soft scaling,
minimal restrained confetti.

### 4.7 Responsive layout and UI polish

Generous whitespace · large cards · rounded corners · clear typographic
hierarchy · minimal borders · colour used intentionally.

**Desktop navigation becomes a left sidebar; mobile keeps bottom navigation.**

> **This one deserves care.** It is the largest visual change and touches
> layout components. It is classified as **visual** because the routes, guards,
> and information architecture are unchanged — only the presentation of the
> same navigation moves. If implementing it would require changing any route or
> guard, **stop and raise it**.

---

## 5. Conflicts — resolved, and closed

Where a design document contradicts the implementation, **the implementation
wins**. The conflicting specification is recorded as a *conceptual or future
enhancement* and is **not** to be built without explicit owner approval.

| # | Design document says | Resolution — BINDING |
|---|---|---|
| C1 | Email + password (min 8 chars) | **KEEP username + 6-digit PIN.** Backlog only |
| C2 | Registration collects email, no invite code | **KEEP invite-gated registration, no email at registration.** Backlog only |
| C3 | "Remember me" checkbox | **KEEP the always-on 30-day session.** Backlog only |
| C4 | Functional forgot-password recovery | **KEEP admin PIN reset.** Backlog only |
| C5 | Separate Admin Login screen | **KEEP shared login with role-based redirect.** Backlog only |
| C6 | **Daily** streak ("14-Day Streak") | **KEEP the weekly streak.** Backlog only |
| C7 | Platform chosen per submission (dropdown) | **KEEP platform fixed at registration.** The locked spec says *"The user should NEVER choose a platform again"* — the design document contradicts it |
| C8 | 10 platforms (adds Facebook, Threads, Medium, Website, Other) | **KEEP the 5 supported platforms.** Backlog only |
| C9 | Submission has Title and Reflection fields | **KEEP the single-field submission.** Backlog only |
| C10 | One submission per day | **KEEP the 30-day duplicate-link rule and daily cap.** Backlog only |
| C11 | Emojis throughout | **KEEP the no-emoji rule.** Use the icon system |
| C12 | Screens not built: marketing landing, member Settings, Pending Reviews / moderation, Export, Flow Journey timeline, calendar month navigation and day detail panel, leaderboard Top 3 spotlight, invite codes with max uses | **NOT BUILT. Backlog only.** Do not build without approval |

**None of the above is a defect. Each is a recorded product decision.**

---

## 6. Two cautions for whoever implements the visual work

Raised now so they are not discovered mid-implementation.

### 6.1 Contrast

The design documents require **WCAG AA** on every screen. Two of the new
colours need checking against their intended backgrounds before use:

- **Golden Yellow `#F5B400`** on white is roughly 1.9:1 — far below the 4.5:1
  required for normal text. It is safe for large numerals, fills, borders, and
  icons, **not** for body text.
- **Bright Red `#FF2D2D`** on white is roughly 3.9:1 — below AA for normal
  text, acceptable for large text and non-text elements.

Use them as accents and fills. Keep body copy on Charcoal `#222222`.

### 6.2 Bright Red as "Secondary"

`#FF2D2D` (Secondary) sits very close to `#DC2626` (Error). Using a red as a
general secondary colour risks reading as a warning wherever it appears.

**Suggestion, not a decision:** reserve Bright Red for celebratory and
brand-expressive moments only, and keep every error state on `#DC2626`. Confirm
with the owner before applying Secondary broadly.

**Status:** Bright Red is **not yet used anywhere** in the implementation. It
remains available and unapplied pending that confirmation.

### 6.3 The fill / text split — DECIDED, and binding

*Added during Phase 8. Approved by the project owner.*

Contrast was measured for every colour in §4.1 against a light background.
Three fail WCAG AA for normal text, not the two originally recorded:

| Colour | Role | On white | What Phase 7 used | Verdict |
|---|---|---|---|---|
| `#F5B400` | Accent | **1.8:1** | `#EAA00C` | Fails |
| `#FF2D2D` | Secondary | **3.7:1** | — | Fails |
| `#22C55E` | Success | **2.3:1** | `#1F7A3D` → 5.4:1 | **Fails — and is a regression** |
| `#F59E0B` | Warning | **2.2:1** | `#B7791F` → 4.6:1 | **Fails — and is a regression** |
| `#DC2626` | Error | 4.8:1 | `#C0392B` → 5.1:1 | Passes |

The design documents require AA on every screen, and the build was already
using Success and Warning as *text* on badges and validation messages.

**The decision:** the approved palette is preserved **exactly** wherever a
colour is seen as colour — fills, borders, icons, indicators, rings, large
numerals. **Text** on a light background uses a darker companion of the same
hue. This is the same treatment §6.1 already prescribes for Golden Yellow,
applied consistently.

`tokens.css` encodes it in the scale itself, so it needs no discipline to
follow:

```
-50    soft tint, for badge and banner backgrounds
-500   THE APPROVED HEX — fills, borders, icons, indicators
-700   darker companion — TEXT on a light background
```

**Never set a `-500` status colour as a `color` on a light surface.** Gold text
uses `--ft-gold-700`; `--ft-text-accent` already points there.

### 6.4 Fonts do not cover Yoruba

*Found during Phase 8 by measurement.*

**Satoshi has no `ẹ ọ Ẹ Ọ ṣ`** — the Yoruba subdot letters. Headings render
member names, and a great many members' names contain them.

`--ft-font-display` therefore lists **Inter second**, ahead of the system
stack, so an absent glyph substitutes to a face that is already loaded and
looks closely related rather than dropping to a system serif mid-name.
**Do not reorder that stack.**

Inter covers them only via the `U+1EA0–1EF9` subset, which Google labels
"vietnamese" because Vietnamese is its largest consumer. `styles/fonts.css`
loads it deliberately. **Do not remove it on the assumption it is unused** —
it costs 10 KB and is fetched only on demand.

---

## 7. What a future session must do

1. **Read this document before acting on any other.**
2. Treat §3 as immovable. If a design document appears to require changing
   something in §3, **it does not — §5 has already resolved it.**
3. Apply §4 freely, as visual work.
4. If something is genuinely ambiguous, **ask the owner. Do not decide.**
5. Never recreate, rewrite, or replace the three `.docx` files.

### The test that catches a mistake

`tests/backend.html` — **101 checks, 14 groups.** Visual work must leave it at
**101/101**. If a "visual" change breaks a test, it was not a visual change.

The 95th was added during Phase 8: it asserts that every `IconID` in the
milestone catalog and the Flow Levels sheet resolves to a real icon. Icon
lookup is `Icons[iconId] || Icons.medal` — a fallback, not a throw — so a
mistyped id renders the wrong badge and reports nothing. It imports
`src/lib/icons.js` rather than copying the key list, so it cannot drift.

---

## 8. Phase 8 decisions — the visual pass

*Approved by the project owner before implementation.*

| # | Decision |
|---|---|
| P8-1 | **Fonts are self-hosted** in `assets/fonts/`. No CDN, ever. Satoshi as two static weights; Inter as one variable file per unicode-range subset |
| P8-2 | **The member reading width stays 544px, single column.** The design documents' 1280px multi-column Dashboard and Profile are **deferred to backlog** — that is layout restructure, not presentation. The admin app keeps its wider layout |
| P8-3 | **Fill / text colour split** — see §6.3. Binding |
| P8-4 | **The 4px spacing scale is kept.** It already contains every value the Design System names, plus half-steps. It is not rewritten to force an 8px-only scale |
| P8-5 | **No admin mobile drawer.** The Design System's slide-out drawer is new interactive behaviour, not restyling. The horizontal scrolling nav strip is retained below 1024px |
| P8-6 | **Top 10 gets a Ribbon icon.** The design document omits Top 10 and reassigns Medal to 100 Active Days |
| P8-7 | **The bottom-nav CTA keeps the `+` glyph.** Pen is used where "Submit" appears as a labelled item. A raised `+` circle is the stronger affordance |
| P8-8 | **Satoshi is used at Medium 500 and Bold 700 only** — the two weights it ships and the two the Design System declares. Six rules previously asked for 800 and were being synthesised |
| P8-9 | **Modals use shadow level 3 (`lg`)**, so the three named elevation levels map onto real tokens |

### Raised, not built

- **`noMilestones` illustration is defined but unwired.** The dashboard
  renders nothing where a member has no recent milestones — there is no empty
  state there to restyle, and adding one is new UI.
- **Invite codes kept an icon rather than an illustration.** The nearest
  available illustration is semantically wrong for it.

---

## 9. Revision

| Date | Change |
|---|---|
| 2026-07-31 | Created. Option B adopted. D0 resolved and closed |
| 2026-07-31 | Phase 8 visual pass. Added §6.3 (fill/text split — binding), §6.4 (Yoruba font coverage), §8 (Phase 8 decisions). Check count 94 → 95 |

Only the project owner may amend this document. A future session that believes
something here is wrong should **say so and wait**, not edit it.
