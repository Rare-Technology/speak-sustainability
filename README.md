# Speak Sustainability — marketing landing page

Pre-launch waitlist page for **Speak Sustainability**, a Rare product and sibling to
[Change Agent](https://changeagent.earth). Built as a standalone static site using the
**same stack, tooling, and Rare Design System tokens** as the Change Agent site
(`../change-agent-site`), so the two read as one family.

## Stack

Plain static HTML/CSS/JS — no framework, no build step for the page itself. Design tokens
are generated from DTCG JSON via **Style Dictionary** (`design-tokens/`), and the built CSS
is committed and served statically. Fonts are self-hosted (no third-party requests).

## Local dev

```bash
npm install            # dev tooling only (http-server, lighthouse)
npm run serve          # http://localhost:8080
```

Or any static server, e.g. `python3 -m http.server 8123`.

## Re-theming (design tokens)

```bash
npm run tokens:build   # rebuilds design-tokens/build/*.css from the DTCG source
```

Edit the DTCG source under `design-tokens/tokens/**`, never the generated
`design-tokens/build/*.css`. Speak Sustainability's departures from the Change Agent
theme are all at the token level:

- **`surface.brand` → Rare Green (`#008542`).** The hero leads with green instead of Rare
  Blue. Green `.500` is the brand-guide primary and keeps the white hero headline at
  WCAG AA (4.7:1); the mockup's lighter lime (`#8EB72B`) would have failed (~2.3:1).
- **New gold accent family** (`color.yellow.100 / .500 / .700`) for the featured
  "Comms Critique" use-case card. Change Agent's palette had only `yellow.500`; the
  `.100` tint (card surface) and `.700` AA-safe ink (eyebrow + card copy) were added
  following the same `100/500/700` convention as the other secondary accents.
- `action.primary` stays Rare Blue (nav buttons, links, form, most eyebrows).

## Decisions / flags for review

These were called out in the brief as things to confirm rather than guess:

1. **Hero green** — used Rare brand green `#008542` (accessible) instead of the mockup's
   lighter lime, which fails white-text contrast. Swap `surface.brand` if a lighter green
   is preferred *and* the headline treatment is changed to keep AA.
2. **Gold accent hex** — introduced as a new token family (see above). Values match the
   mockup; adjust in `tokens/primitives/color.json` if the brand gold differs.
3. **Footer "Contact" link** — placeholder `href="#"` with a `TODO` in `index.html`.
   Point it at the real destination (mailto: or a contact page).
4. **Accordion behavior** — one-open-at-a-time, matching the Change Agent accordion.
5. **Accordion body copy** — ~20 words of lorem ipsum per row, held in a single
   `ACCORDION_COPY` array in `index.html` for trivial swap-in of real copy.
6. **Rare logomark** — `assets/rare-logo.svg` is the **official vector**, converted from the
   supplied Pantone-Coated print EPS (`EPS → PDF → SVG`, fully vector, no raster). The print
   spot colors were normalized to the site's brand token RGB (blue `#005bbb`, green `#008542`,
   gray `#5e6a71`) so the footer mark matches the rest of the page; the raw CMYK→RGB
   conversion came out lighter (`#2D6DBE` / `#128342`). Placed top-right in the footer above
   the links, per the mockup. To regenerate: `gs -dEPSCrop -sDEVICE=pdfwrite` then `pdf2svg`.
7. **Speak Sustainability logo** — the real logo (`assets/speak-sustainability-logo.svg`,
   vector wordmark + embedded leaf mark) is used in the nav and footer, sized by height
   (26px desktop / 22px mobile). Its `viewBox` was cropped to the content bounds so it sizes
   with no dead space. The nav pairs it with a separate "by Rare" sublabel (hidden on mobile).
8. **Waitlist form** — submit is stubbed (validates, logs, no-ops with a `TODO`), matching
   the Change Agent waitlist. Wire a real endpoint when ready.

## Assets

- `assets/hero-woman-{340,680}.webp` — hero illustration, served responsively via
  `<picture>`/`srcset` (mirrors the reference site's `hero-bicycle-*` pattern).
- `assets/fonts/` — self-hosted Source Sans 3 + Barlow Semi Condensed (OFL).
