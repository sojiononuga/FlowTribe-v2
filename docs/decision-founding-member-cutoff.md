# Decision — Founding Member cutoff

**Status:** Approved
**Approved by:** Product Owner
**Date:** 26 August 2026

## Decision

The Founding Member cutoff will be the actual public launch date of Flow Tribe v2.

A member qualifies for the Founding Member milestone if their join date is on or before the production launch date. Members joining after the production launch date do not qualify.

## Implementation note

Do not hard-code an arbitrary historical date. At production cutover, set `milestones.foundingPeriodEnd` to the actual public launch date used for the release record.

## Rationale

This keeps the badge aligned with its intended meaning: the founding cohort consists of everyone who joined up to and including the product's public launch day.
