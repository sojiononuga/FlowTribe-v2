# Product Vision

> **Flow Tribe is the Duolingo of content creation, with the visual polish of
> Notion and the warmth of a close-knit creative community.**

The north star. When several designs are technically valid, the one that best
serves this statement wins.

---

## The emotional journey

Every member should move through four states. Each feature exists to carry
someone from one to the next.

```
"I can do this."          →  registration is short; the first post is easy to log
"I'm making progress."    →  the ring fills; the calendar gains its first squares
"I'm becoming consistent."→  week streaks, the calendar's shape, Flow Levels
"I'm part of something."  →  leaderboards, recognition, shared progress
```

A feature that serves none of these is a feature we do not need.

## Personality

| Flow Tribe is | Not |
|---|---|
| Encouraging | Demanding |
| Premium | Flashy |
| Human | Corporate |
| Calm | Noisy |
| Motivating | Competitive |
| Community-first | Leaderboard-first |

## The decision filter

Every product, design, and engineering decision passes through these. A "no"
anywhere means rethinking the implementation.

1. Does this help members create more consistently?
2. Does this make members want to return tomorrow?
3. Does this strengthen the sense of community?
4. Does this make Flow Tribe feel premium?
5. Is this the simplest experience possible?

## The four principles

| Principle | Means | Owned by |
|---|---|---|
| **Create** | Effortless to publish and log | Submit flow, one field, platform inferred |
| **Track** | Consistency made visible | Progress ring, activity calendar, week streaks, stats |
| **Celebrate** | Progress rewarded | Milestones, Flow Levels, recognition |
| **Belong** | Community strengthened | Leaderboards, shoutouts, shared progress |

---

## What this means in engineering terms

Vision statements are easy to write and easy to ignore. These are the concrete
commitments this one creates.

### Encouraging rather than demanding

**Never show a member a number that punishes them for their own chosen goal.**
This has a direct consequence for the milestone definitions — see
[`celebration-system.md`](celebration-system.md) §4, where three of the
specified milestones are unreachable for anyone who picked a 3-posts-per-week
goal and hits it perfectly.

Empty states are invitations, never failures. A member with no posts this week
sees *"Post this week to join the leaderboard"*, not a rank of zero.

### Community-first, not leaderboard-first

The leaderboard sits **sixth** on the dashboard, below the ring, the calendar,
and milestones. A member sees their own progress before anyone else's.

"Least Active Members" exists only in the admin view and is never surfaced to
members. Publishing it would do the exact opposite of what this product is for.

### Calm rather than noisy

Motion communicates progress or it does not happen. Three durations and two
easing curves exist, and a component that wants a fourth needs a reason.

The success burst is the only celebratory animation in the app. Used once, when
a post is logged, so it keeps meaning something. Milestone unlocks get the same
restraint: one modal, one subtle animation, no confetti.

### Premium rather than flashy

**No emojis anywhere in the application.** Milestones, levels, and every status
use icons from the Phase 1 icon system — 24×24, 2px stroke, `currentColor`.

Gold is an accent that marks achievement, never a surface. Progress creates the
excitement; colour does not have to.

---

## Writing style

Copy sounds like a trusted creative coach. Short, warm, human. Never robotic,
never corporate, never a system message.

| Instead of | Write |
|---|---|
| Submission successful. | Nice work. Today's post has been logged. |
| No activity. | Your next post starts today's momentum. |
| Goal completed. | You kept your promise to yourself this week. |
| Error: invalid URL. | That doesn't look like a link. Paste the full URL. |
| 0 posts this week. | This week is still open. |
| Streak broken. | Last week got away. This one is fresh. |

### Rules

- **Second person.** "You kept your promise", not "The member has completed".
- **Never guilt.** A missed week is stated neutrally and pointed forward.
  "Encourage members to return tomorrow rather than making them feel guilty
  about yesterday" is a copy rule, not a sentiment.
- **Name the next action.** An error says what to do, not what went wrong.
- **No exclamation marks in error copy.** They read as sarcastic when someone
  is already frustrated.
- **Copy lives in code, not in components.** Error copy is centralised in
  `src/core/errors.js`; progress copy in `src/lib/format.js`. One place to
  review tone, one place to change it.

---

## Applying this to a review

When reviewing a screen, the question is not "does it work?" but:

> **What makes this member want to create again tomorrow?**

If the screen has no answer, it is not finished — regardless of whether every
number on it is correct.
