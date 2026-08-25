# Code Conventions

The rules that keep this codebase consistent without a framework enforcing
them. Short, and each one exists because breaking it caused a specific problem.

---

## 1. The component contract

A component is a function that takes props and returns an `HTMLElement`.

```js
export function Badge({ label, tone = 'neutral' }) {
  return el('span', { class: `ft-badge ft-badge--${tone}`, text: label });
}
```

A component that changes after creation attaches `update`. One that owns
listeners or timers attaches `destroy`. `stateful()` wires both and tracks
teardown.

```js
export function Counter(props) {
  const node = el('span', { text: props.count });
  return stateful(node, {
    update: (next) => { node.textContent = next.count; },
    cleanups: [on(window, 'resize', handleResize)],
  });
}
```

That is the entire contract. It fits in a paragraph, which is the point — a
convention nobody can recite is a convention nobody follows.

### Three rules that keep it from becoming a framework

**A component never fetches.** It receives data through props and reports
intent through callbacks. The moment a component calls the API, business logic
has moved into the UI and the component can no longer be reused or reasoned
about on its own.

**A component never reads the store.** Views wire the store to components.
A component that reaches into global state is coupled to the shape of that
state and cannot be dropped into a different screen.

**Text goes through `text:` or `textContent`. Never `innerHTML`.** See §3.

---

## 2. Layers, and which way dependencies point

```
features/  →  components/  →  core/
     ↓             ↓            ↓
    lib/         lib/         lib/
```

Dependencies only point rightward and downward. A component importing from a
feature is a mistake; so is `core/` importing from `components/`.

| Layer | Holds | Never holds |
|---|---|---|
| `core/` | Router, store, API client, session, DOM helpers | Anything Flow-Tribe-specific |
| `components/` | Reusable UI | Fetching, store access, business rules |
| `features/` | One screen each: view + its private parts | Anything another screen needs |
| `lib/` | Pure functions — formatting, validation, constants | DOM, network, state |

**When something in `features/` is needed by a second screen, it moves to
`components/`.** Not before: a component built for a reuse that never happens
is more abstract than it needs to be, and harder to change.

---

## 3. Never `innerHTML`

This is a security rule, not a style preference.

Session tokens live in `localStorage`, readable by any script on the origin. So
the app's safety rests on it having no XSS. Member-controlled text — full names,
usernames, bios, submitted links — is rendered on admin screens, where a
payload would execute with a Community Manager's or Super Admin's session.

Routing every string through `textContent` makes that class of bug impossible
rather than unlikely. `el()` does this by construction: strings become text
nodes, always.

---

## 4. Business logic lives on the server

Anything that decides whether a post counts, how long a streak is, or who ranks
where is **server-only**. The client displays the server's answer.

`src/lib/validators.js` duplicates the server's *format* checks — six digits,
valid username shape — so a member gets instant feedback instead of waiting for
a round trip. That duplication is deliberate and bounded:

- Format checks may be mirrored. The server re-checks and wins.
- **Judgements may not.** Link-to-platform matching, duplicate detection,
  streak arithmetic, and ranking are never in the client, because they judge
  the member and must not be editable by the person being judged.

`src/lib/platforms.js` follows the same line: it holds labels, icons, and
colours, and deliberately **not** the hostname allowlist.

---

## 5. Naming

| Thing | Convention | Example |
|---|---|---|
| Component files | kebab-case | `progress-ring.js` |
| Component functions | PascalCase | `ProgressRing` |
| Everything else in JS | camelCase | `weeklyProgressMessage` |
| CSS classes | `ft-block__element--modifier` | `ft-stat__value--empty` |
| CSS custom properties | `--ft-category-name` | `--ft-burgundy-600` |
| Apps Script files | `PascalCase.gs` | `StreakService.gs` |
| Apps Script private functions | trailing underscore | `dispatch_()` |

The `ft-` prefix on every class and variable means a copied snippet, an
embedded widget, or a future third-party stylesheet cannot collide with ours.

---

## 6. CSS

**Every value comes from `tokens.css`.** No raw hex, no magic pixel values, no
one-off durations. If a value is needed that does not exist, add a token —
that is the moment to decide whether it belongs in the system.

**Mobile-first.** Base rules target small screens; `min-width` queries add from
there. Never `max-width` — writing desktop first and subtracting produces
stylesheets where the mobile experience is a series of overrides.

**Component styles live in `styles/components-*.css`,** grouped to match the
component folders. Utilities are a small, fixed set for layout scaffolding —
this is not a utility framework, and a rule needed three times in one component
belongs in that component's CSS.

---

## 7. Comments

Comment **why**, not what. `// increment the counter` above `count += 1` is
noise; a note explaining why a 1300 ms delay was replaced by a server-returned
value is the thing someone needs in six months.

Every module opens with a block stating what it is for and any decision that
would otherwise look like a mistake — `text/plain` on a JSON request, the
forced reflow in `restartAnimation`, the double-render in the progress ring.
Those comments exist so the next person does not "fix" them.

---

## 8. Accessibility

Not optional, and cheapest when it is built in:

- Every input has a real `<label>`; `Field` handles the wiring.
- Interactive targets are at least 44px.
- Errors use `role="alert"` so they are announced, not just displayed.
- Modals trap focus and return it to the trigger on close.
- Focus outlines are never removed — only replaced.
- Colour never carries meaning alone: the progress ring turns green **and**
  the text says the goal is met.

---

## 9. Phases

Work stops at the end of each phase for approval. Two rules follow:

**No building ahead.** A later phase's code does not appear early, even when it
would be quick. Reviewing a phase is only meaningful if the phase is what was
agreed.

**No silent architecture changes.** If implementation shows an approved
decision is wrong, that gets raised with the trade-off and waits for an answer.
It does not get quietly corrected in a commit.
