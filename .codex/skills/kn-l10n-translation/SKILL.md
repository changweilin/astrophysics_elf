---
name: kn-l10n-translation
description: Localize, translate, repair, and externalize UI copy for the Kerr-Newman Black Hole Lab. Use when working on multilingual UI text, i18n dictionaries, terminology, mojibake or corrupt glyph cleanup, labels, tooltips, event logs, panel text, or preserving physics notation across locales in root .jsx/.js/.html files.
---

# Kerr-Newman L10n Translation

Use this skill for language work in the browser demo and product-facing text.
Keep physics notation stable while making copy readable, testable, and ready
for multiple locales.

## Workflow

1. Inventory copy before editing. Search root UI files: `app.jsx`,
   `panel-left.jsx`, `panel-right.jsx`, `panel-bottom.jsx`,
   `tidal-scope.jsx`, `mhd-monitor.jsx`, `physics.js`, `disc.js`, and
   `Kerr-Newman Lab.html`.
2. Separate user-facing copy from identifiers. Do not translate JS keys,
   CSS classes, exported names on `window`, physics variables, or API fields.
3. Preserve canonical notation: `M`, `Q`, `a`, `J/Mc`, `r+`, `r-`, `ISCO`,
   `MHD`, `Blandford-Znajek`, `Kerr-Newman`, `Kerr-Schild`, and units such
   as `M`, `c`, `%`, `Tesla`, `Gauss`.
4. Treat mojibake as a content recovery task. Replace corrupted UI glyphs
   with clear ASCII or intentionally localized Unicode only when the target
   locale needs it. Keep source code syntax valid after each replacement.
5. Prefer a small locale dictionary or copy map when strings repeat across
   panels. Keep the first implementation minimal; do not introduce a framework
   unless the app already has one.
6. Verify changed JS with syntax checks where possible. For JSX loaded through
   browser Babel, inspect the exact edited expressions for balanced quotes and
   braces.

## Locale Rules

- Use Traditional Chinese (`zh-TW`) for Chinese unless the user requests
  another variant.
- Keep technical nouns consistent across the app. Example terms:
  event horizon, ergosphere, photon sphere, frame dragging, tidal stress,
  accretion disc, jet power, Lorentz factor, radiative efficiency.
- Prefer concise panel labels over explanatory prose. This UI is an instrument,
  not a landing page.
- Event log messages should be short, specific, and easy to scan.

## Output Checks

- Confirm the UI still communicates simulator state: placement, aiming, pan,
  selection, pause/play, reset, object status, and MHD/tidal alerts.
- If localization changes touch physics labels, read
  `full-physics/engine-contract.md` to avoid changing API meaning.
- Mention any strings left intentionally untranslated.
