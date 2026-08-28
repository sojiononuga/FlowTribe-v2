# Modern Workspace UI — Controlled Visual Decision

**Status:** APPROVED CLARIFICATION  
**Clarified:** 28 August 2026  
**Scope:** Presentation only

## Decision

The Flow Tribe modernization is a visual redesign, not a palette-only reskin.

The live member experience must visibly move away from the legacy narrow document-stack presentation and adopt the modern Flow workspace treatment while preserving verified product behaviour.

On desktop this means:

- the member workspace may use the approved wider application canvas;
- the dashboard may use a responsive multi-column composition;
- primary navigation may present as a dedicated left workspace sidebar;
- the top bar, cards, controls, auth surfaces, spacing and hierarchy may be restyled to create a coherent modern interface;
- forest green, mint green, cream and white remain the approved palette family.

On mobile, the existing thumb-first bottom navigation and responsive behaviour remain.

## Supersession

This clarification supersedes the earlier presentation restriction recorded in `docs/FINAL_PRODUCT_DECISIONS.md` / `docs/NEXT_SESSION.md` that retained the 544px single-column member dashboard as the final visual form.

That earlier restriction was useful while behaviour and presentation were being separated, but it does not satisfy the subsequently approved modernization direction.

## Boundaries

This decision does **not** reopen or alter:

- routes or navigation information architecture;
- route guards;
- authentication or registration;
- username + PIN behaviour;
- API contracts;
- backend logic;
- data schema or live data;
- business rules;
- weekly streak or goal rules;
- submission behaviour;
- permissions, roles or security controls;
- hosting architecture or runtime dependencies.

The redesign must remain CSS/presentation-led wherever possible, retain rollback safety, and pass the complete existing regression suite before release.
