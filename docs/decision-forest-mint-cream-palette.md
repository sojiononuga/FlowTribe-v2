# Flow Tribe visual palette decision

Status: APPROVED
Approved: 2026-08-26
Recorded: 2026-08-28
Scope: visual palette only

## Decision

Flow Tribe uses a contemporary forest, mint and cream visual palette.

The approved implementation is the token set in `styles/tokens.css`:

- primary brand: forest green
- accent: fresh mint
- page and supporting neutrals: warm cream
- white remains available for raised and card surfaces where contrast is useful
- status colours remain the existing success, warning, danger and information system

The historic custom-property names `--ft-burgundy-*` and `--ft-gold-*` are retained only as compatibility seams. Their names no longer describe their rendered colours and must not be used as evidence that burgundy or gold remains the current visual direction.

## Supersession

This decision is later than, and therefore supersedes, only the burgundy / bright-red / gold brand-palette statements in `docs/FINAL_PRODUCT_DECISIONS.md` section 6.3 and any earlier visual-palette wording that conflicts with it.

It does not reopen or alter the other settled decisions in `docs/FINAL_PRODUCT_DECISIONS.md`, including typography, responsive structure, component geometry, accessibility, product behaviour, security, data, roles, runtime dependencies, hosting, or release scope.

## Implementation guardrails

1. Raw palette values remain centralised in `styles/tokens.css`.
2. Components consume semantic or compatibility tokens rather than declaring replacement brand colours locally.
3. Elevation, focus rings and subtle inset treatments use forest-tinted values so no burgundy cast remains after the palette migration.
4. Existing danger/error red is a semantic status colour and is not part of the retired burgundy brand treatment.
5. Any future palette change is a reserved visual decision and requires explicit owner approval under `docs/WORK_POLICY.md`.
