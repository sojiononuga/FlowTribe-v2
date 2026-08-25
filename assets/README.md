# Assets

```
assets/
├── images/   Logo files
├── icons/    (empty — see below)
├── fonts/    (empty — see below)
└── vendor/   Third-party libraries, committed and version-pinned
```

## images/

| File | Source | Use |
|---|---|---|
| `flow-tribe-logo.png` | v1's transparent logo | Share images, anywhere a raster mark is required |
| `flow-tribe-logo-full.jpeg` | v1's full logo | Reference for colour and proportion |

The logo **in the app** is not either of these — it is built in CSS by
`components/brand/logo.js`. v1 did that because the file was thought to be
missing; it is kept because the reasons hold up: it scales to any size without
a second asset, recolours through tokens, costs no request, and stays sharp on
every display. These files cover the cases CSS cannot: share cards, and
anything that leaves the browser.

## icons/ — empty, deliberately

Icons are inline SVG built from path data in `src/lib/icons.js`. No sprite
sheet, no icon font, no request. Because they are stroked with `currentColor`,
an icon inherits hover and active colours from its parent with no
icon-specific CSS.

This folder exists for an illustration or a decorative graphic that is not an
interface icon.

## fonts/ — empty, deliberately

The app ships on the system font stack: nothing downloads, nothing blocks
first paint, and it looks native everywhere.

Baloo 2 and Poppins are part of the brand, and v1 loaded them from Google
Fonts. That is a render-blocking third-party request on every page load which
leaks each member's IP address, and it leaves the page unstyled when the CDN is
unreachable — the same reasoning that led us to vendor Chart.js locally.

To self-host them: drop the `.woff2` files here and uncomment the `@font-face`
blocks in `styles/fonts.css`. Nothing else changes — `--ft-font-display` and
`--ft-font-brand` already point at those families and fall back cleanly until
the files exist.

## vendor/ — third-party code

Committed and version-pinned rather than installed or linked.

**Chart.js** lands here in Phase 6, loaded by the admin shell only. The member
app — the one opening on a phone over mobile data — never downloads it.

Vendored rather than CDN-linked because a CDN adds a runtime dependency on
someone else's uptime, sends your admins' IP addresses to a third party on
every page load, and fails completely on a network that blocks it. A local copy
costs a couple of hundred kilobytes in the repository and removes all three
problems.

Every file here records its version and source in a comment at the top, so an
upgrade is a deliberate act rather than a mystery.
