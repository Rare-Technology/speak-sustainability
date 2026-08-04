# Rare Core — Design Tokens

W3C DTCG JSON source → [Style Dictionary](https://styledictionary.com) → plain CSS custom properties.

```bash
npm install          # local dev-time only; the host runs no Node
npm run tokens:build # regenerates build/rare-tokens.css
```

`build/rare-tokens.css` is **committed** so GitHub Pages serves it as a static asset. Never hand-edit it —
edit the DTCG source under `tokens/` and rebuild. Conformance audits diff a fresh build against the
committed file; any difference means the generated file was hand-edited or the build is stale.

## Layout

```
tokens/
  primitives/   tier 1 — raw brand values (color, space, radius, size, elevation, motion, typography)
  semantic/     tier 2 — role-based aliases that reference primitives
  product/      page-calibrated component tokens — NOT published (see "Core vs product")
```

The reference chain flows one direction: **component → semantic → primitive**. `outputReferences: true`
preserves that chain as live `var()` refs, so editing one primitive re-themes everything downstream.

## Build targets

| Command | Output | Contains | Published? |
|---|---|---|---|
| `tokens:build:full` | `build/rare-tokens.css` | primitives + semantics + product | No — this is what **this page** links |
| `tokens:build:core` | `build/rare-core.css` | primitives + semantics only | **Yes** — becomes the shared `rare-tokens` package |

`tokens:build` runs both. Keeping them as two targets makes the Core/product boundary machine-enforced
and visible in a diff, rather than a convention someone has to remember at extraction time.

> Both scripts are also reachable from the repo root: `npm run tokens:build` there delegates here.
> The root package also provides `npm run lighthouse`, which audits the built page against the WSG
> budgets in `lighthouse-budget.json`. See the root README/package for details.

---

## Core vs product: what may be published

`tokens/product/` holds component tokens whose values embed **this page's** layout math — specifically
`clamp()` expressions carrying viewport units (`52.8vw`, `1.76vw`, `26vw`).

> **Viewport-relative values are not portable.** `vw` resolves against the viewport, never against the
> parent. A token calibrated to a full-width hero panel computes a **wrong** size the moment it renders
> inside a sidebar, modal, or split pane. Publishing one exports a latent layout bug.

So they stay in this repo and are excluded from `rare-core.css`:

| Token | Why it cannot be published |
|---|---|
| `chat-preview.width` | `52.8vw`, calibrated to the full-width hero panel |
| `chat-preview.font` | `1.76vw`, same calibration |
| `case-card.width` | `26vw`, calibrated to the full-bleed carousel |
| `case-card.aspect-ratio` | No viewport math, but meaningless without `case-card.width` |

Each carries a `PRODUCT-SCOPE — NOT PUBLISHED` prefix in its `$description`, so the marker survives into
the generated CSS.

**Promotion path:** if a product token is later shown to be genuinely context-free, move its file from
`tokens/product/` into `tokens/semantic/` (or `primitives/`). It then appears in `rare-core.css`
automatically — that move *is* the promotion, and it shows up as a reviewable diff.

**Corollary — keep layout rules out of semantics.** A semantic encodes a *role*, not a layout behaviour.
`font.size.hero` is the worked example: it once held `clamp({font.size.700}, 6vw, {font.size.1000})`,
which made it unusable by any consumer whose context differed. It now points at a scale step
(`{font.size.1000}`), paired with `font.size.hero-min` as the floor, and the surface composes its own
`clamp(...)` in page CSS where the container is known.

---

## Layer & Naming spec, rule 3: product-scope composition may bind directly to a primitive

The reference chain is **component → semantic → primitive**, and a binding that carries *role meaning*
must always pass through a semantic. There is one ratified exception:

> **Product-scope composition with no role meaning MAY bind directly to a primitive.** Inventing a
> semantic to satisfy the chain — `color.semantic.card-3-fill` — would be a *fake semantic*: a name that
> carries no intent, describes no reusable decision, and pollutes Core with one page's trivia.

The worked example is the use-case card-hover rotation in `index.html` (`--ca-card-fill-*` /
`--ca-card-ink-*`), which binds `color.cyan.100` / `color.cyan.700` and friends directly. "Card 3 is the
orange one" is a composition choice, not a brand decision — there is no role to name.

**The limit of the rule.** It licenses *product-scope* values only. Anything that does carry role
meaning — an action colour, a text colour, a surface, a feedback state — still goes through a semantic.
When in doubt, ask whether another surface could reasonably want to inherit the decision. If yes, it is
a semantic; if the answer is "only this page lays out cards in this order", bind the primitive.

Conformance audits should treat a direct product→primitive binding as **sanctioned when it is
product-scope and role-free**, and flag it only when the value plainly encodes a reusable role.

---

## Convention: brand-guide primitives are retained even when unreferenced

**Rare Core is shared brand vocabulary, not a manifest of what one surface currently paints.** Core is
consumed by surfaces that do not exist yet (change-agent-app, and later rare.org). A brand-guide palette
value that no current page happens to use is still part of the brand.

Therefore:

> **Brand-guide palette primitives are intentionally retained in Core even when no surface references
> them. Conformance audits MUST treat these as _sanctioned_, not as dead tokens, and MUST NOT propose
> them for removal on the grounds of being unused.**

Such tokens carry an explicit marker in their `$description`:

> `"Brand-guide palette value, retained in Core for cross-consumer use; may be unused on any given surface."`

Currently retained under this rule:

| Token | Value | Brand role |
|---|---|---|
| `color.green.500` | `#008542` | Rare Green — brand-guide **primary** |
| `color.yellow.500` | `#EEAF00` | Rare Yellow — brand-guide **secondary** |

Retaining an unreferenced primitive is close to free: it emits one CSS custom property definition and
nothing else. It cannot affect rendering, because a custom property only influences a computed value
when something consumes it through `var()`. The two tokens above cost **+121 bytes gzipped** in total.

### What this rule does *not* cover

The rule protects **brand-guide palette values only**. It does not protect *derived working shades* —
tints, hovers, and surface pairs that were computed for a specific component and have no independent
standing in the brand guide. When the surface that motivated them goes away, they are genuinely dead and
should be pruned. Examples pruned for exactly this reason, and deliberately **not** restored:

- `color.green.700` (`#006B35`) — was the hover/dark pair for a green brand surface that no longer exists
- `color.yellow.100` (`#FBEFC2`) — was a soft accent fill for a retired accent surface

### Rule of thumb

| Kind of token | Unreferenced ⇒ |
|---|---|
| Brand-guide palette value (primary/secondary) | **Keep.** Mark it in `$description`; audits treat as sanctioned. |
| Derived shade/tint for a specific surface | **Prune** once that surface is gone. |
| Semantic or component token | **Prune.** These are decisions and bindings; an unbound one is dead by definition. |

**Restoring a brand-guide primitive is additive and non-visual.** It must add custom-property
definitions only — zero modified or removed lines, and no semantic re-bound. Verify with a diff of
`build/rare-tokens.css` before merging.
