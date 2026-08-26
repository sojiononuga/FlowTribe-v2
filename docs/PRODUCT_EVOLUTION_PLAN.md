# Flow Tribe — Product Evolution Plan

**Status: ACTIVE DIRECTION — 25 August 2026**

This plan sits **alongside** the frozen release roadmap. It does not renumber Phases 8–12 or erase the known-good release candidate. Its purpose is to make the broader Flow product real quickly and safely.

## Objective

Turn the current creator-shaped release candidate into the first expression of a universal adaptive goal-and-action platform, while protecting verified engineering and moving fast enough to demonstrate a materially differentiated product.

## Delivery strategy: preserve the engine, generalise the domain

A full rewrite would be slower and riskier. The current product already contains valuable primitives: identity, invitations, sessions, role control, submissions, progress history, milestones, levels, community views, audit, analytics and a substantial test harness.

We will reuse those primitives and introduce a universal domain at the seams.

### Track A — Release confidence

Keep the current release baseline green and deployable. Any universalisation work must preserve the established verification baseline and extend the gates as behaviour expands. The current universal release gate is 112/112 backend checks and 18/18 real-screen journeys.

### Track B — Universal domain seam

Introduce application-facing concepts for:

- Goal
- Plan
- Action
- Evidence
- Constraint
- Adaptation
- Recovery
- Momentum
- Goal Context

Initially, legacy creator records may map into these concepts without an immediate storage rewrite.

### Track C — Universal first-run experience

Move onboarding away from "pick a social platform and posting cadence" toward:

1. What are you trying to achieve?
2. What does showing up look like?
3. How often is realistic?
4. What constraints should Flow know about?
5. What is the smallest useful next action?

Creator goals remain available as a template, not the default definition.

### Track D — Flow Adapt

Build the smallest credible intelligence loop:

1. user has a goal and current plan;
2. user reports or Flow observes a constraint;
3. Flow explains why the current path may no longer fit;
4. Flow proposes a smaller/revised path;
5. user accepts, edits or rejects it;
6. the accepted adaptation becomes part of the plan history;
7. the next action is immediately actionable.

AI must return structured product decisions, not merely conversational prose.

### Track E — Momentum and recovery

Move the emotional centre away from brittle streaks. Retain historical streak data where useful, but elevate:

- recent consistency;
- recovery speed;
- return after interruption;
- progress relative to realistic capacity;
- collective Tribe momentum.

### Track F — Sublime experience

Every important member journey must meet the following bar:

- obvious in under a few seconds;
- excellent on a phone;
- low-bandwidth tolerant;
- no unnecessary page or data reloads;
- calm motion and strong hierarchy;
- humane language;
- accessible contrast, focus and touch targets;
- useful empty/loading/error/recovery states;
- no visual or interaction residue from the older narrow product where it no longer belongs.

## Avoid

- broad feature accumulation;
- changing every database column before the new model is proven;
- superficial replacement of "post" with "action" while retaining creator-only assumptions;
- adding an open-ended AI chat surface as the product's intelligence strategy;
- autonomous production self-modification;
- rebuilding stable infrastructure without evidence that it blocks the new experience;
- turning Nigerian context into clichés rather than concrete product resilience.

## First proof of the new Flow

The decisive demo should be understandable without mentioning content creation:

> A person states a meaningful goal. Flow creates an achievable route. Reality changes. The person tells Flow what happened in natural language. Flow understands the constraint, preserves the destination, proposes a revised path, and gives the person one useful action they can do now. Their progress and Tribe remain intact.

If that feels natural, intelligent and beautiful, the product has crossed from "consistency tracker" into Flow Tribe's new category.
