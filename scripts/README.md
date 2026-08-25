# Scripts

## Running locally

The app uses ES modules (`<script type="module">`), which browsers subject to
CORS. **Opening `index.html` directly with `file://` will not work** — the
modules are blocked and the page stays blank. Serve the folder over HTTP.

Any static server works. With Python, from the `FlowTribe-v2` folder:

```bash
python -m http.server 5173
```

Then open:

- `http://localhost:5173/` — member app
- `http://localhost:5173/admin.html` — admin app
- `http://localhost:5173/gallery.html` — component gallery

With Node instead:

```bash
npx serve -l 5173 .
```

## Why there is no build step

The whole front end is served exactly as it is written: no bundler, no
transpiler, no `dist/` folder, no `npm install` before a change can be seen.
Edit a file, refresh, done.

That is a deliberate trade, and worth naming what it costs.

**What it gives up:** module concatenation. Each `import` is a request, so a
first load makes more round trips than a bundle would.

**Why it still wins here:** the module count is small and the router loads a
screen's code only when that screen is visited, so the initial payload is the
shell and little else. Netlify serves over HTTP/2, where parallel requests are
cheap. And the person maintaining this after us can open a file, read it, and
change it — without a toolchain, a lockfile, or a build that has to keep
working.

For an app this size, a build step would be more machinery to maintain than it
would save.

**The one exception is Chart.js**, vendored as a UMD build in `assets/vendor/`
and loaded with a plain `<script>` tag by the admin shell only. It needs no
bundler, and the member app never downloads it.

## Deploying

**Front end** — drag the folder onto [Netlify Drop](https://app.netlify.com/drop),
or connect the repository. There is nothing to compile.

Two things to check before sharing a link:

1. `src/core/config.js` exists and holds the real Apps Script URL. It is
   git-ignored, so a fresh checkout will not have it — copy
   `config.example.js` and fill it in.
2. `gallery.html` can be removed from a public deploy if you would rather not
   ship it. It holds no data and makes no authenticated requests, so leaving it
   is also fine.

**Backend** — see [`../appsscript/README.md`](../appsscript/README.md). Pushed
with clasp, never edited in the Apps Script browser editor.

## Phase status

This folder holds documentation only. If a script ever becomes genuinely
useful — a release check, a token-to-CSS generator — it lands here. Nothing has
earned that yet, and an unused build script is a maintenance burden with no
payoff.
