# THEME-01 — DalyHub colour schemes (August 2026)

> The record of the multi-scheme colour work: what shipped, what was decided
> along the way, and the evidence that was kept.
>
> The **contract** lives in
> [`DESIGN_SYSTEM.md → Appearance, colour scheme, design system`](DESIGN_SYSTEM.md#appearance-colour-scheme-design-system).
> The **decision** lives in
> [ADR-088](../decisions/ARCHITECTURE_DECISIONS.md#adr-089-five-generated-colour-schemes-over-one-design-system--a-second-root-attribute-orthogonal-to-appearance).
> This document is the working record behind both — read those first if you only
> want the rules.

---

## The problem

M3-01 replaced seven hand-authored palettes with one generated light/dark pair,
and that was the right trade: seven palettes cost seven proofs, for a product with
one user. What it left behind was a product whose identity had collapsed into a
single hue. DalyHub effectively meant *"the violet app"*, and the only way to want
something calmer was to re-brand.

The machinery that removed the palettes is also what makes more of them cheap. A
scheme is no longer two hundred authored hexes and a review; it is a dozen numbers
in a config array, run through the same algorithm, checked by the same assertions.

## What shipped

Five colour schemes, one design system.

| Scheme | Primary | Secondary | Tertiary | Neutral strategy | Dark strategy |
| --- | --- | --- | --- | --- | --- |
| **Daly Violet** *(default)* | expressive violet | muted violet | soft lilac-rose | cool-neutral, rotated off the seed | the shipped ladder, unchanged |
| **Electric** | saturated cobalt | blue-violet (indigo) | vivid magenta | cool blue-grey | navigation sits **below** the canvas; the app-neutral goes navy |
| **Pulse** | vivid magenta | deep plum | restrained lime | graphite | a tone lower than default; every dark tint strength reduced |
| **Ocean** | royal blue | teal | cyan | cool slate | a tone higher than default; the app-neutral goes navy-charcoal |
| **Graphite** | charcoal | cool slate | blue-violet accent | near-neutral, cool | the default ladder, one tone up |

Everything else — components, layout, typography, shape, spacing, motion, icons —
is identical in all five. That is the point.

## The decisions that were not obvious

### Daly Violet is byte-identical, not "an evolution"

The brief asked for an evolution of the existing palette. The strongest form of
that, and the only one that can be *proved*, is the same bytes: Daly Violet still
routes through `SchemeVibrant` over the M3X seed, with the M3X app-neutral rotation
and the M3X ladder, and regenerating produces the file M3X committed. What THEME-01
changed for it is context — it is now one personality among five rather than the
whole product — not pixels.

### A scheme supplies palettes; it never touches the role machinery

`SchemeVibrant` derives secondary and tertiary by fixed +15°/+30° rotations off the
seed, which makes every stock M3 scheme "one hue and its two cousins". Electric's
magenta and Pulse's lime are unreachable that way. The four new schemes therefore
hand explicit tonal palettes to the *same* `DynamicScheme` the variant would have
built. Only the palettes differ; every role is computed by identical code.

### The app-neutral chroma ceiling had to become per-appearance

The first build of Electric held its dark surfaces to the same chroma ceiling as
its light ones (6, the rule PR #120's lavender-wash defect established). The result
was a "deep blue-black shell" indistinguishable from Daly Violet's near-black one —
a scheme that could not state its own headline claim. The two side-by-side captures
of Today in dark differed only by the fill of one button.

The fix is the same argument the generated tint-strength table already makes: at
near-white tones there is white to tint and chroma 8 is a wash; at tones 6–26 there
is nothing to tint and the same chroma is a deep navy. Light keeps its ceiling of
6, exactly as strict as before; dark is capped at 14, and both are asserted
separately so nobody can quietly relax the one that matters.

### Electric's secondary is a blue-violet, not the violet the brief named

The shell paints its selected navigation destination from `secondary-container`, so
the secondary is the most prominent tinted surface in the frame. At the briefed
hue (300) and a chroma nearly twice Daly Violet's, Electric's selected row came out
**more violet than the violet scheme's** — the one thing it cannot be. At 288 it is
an indigo: still a supporting violet, unmistakably on the blue side of Daly Violet.

### Semantics are global; only the brand moves

Error, warning, success, the four priorities, the five record states, entity
identity and the accent ramp use the same sources in every scheme, harmonised to
each seed by at most 15°. That is what makes "the owner learns the product once"
true, and it is asserted rather than reviewed — brand ≥25° from error and overdue,
the priority ramp unable to collapse, no two entity identities sharing a colour.

One consequence was accepted rather than solved: under Electric and Ocean the brand
is itself a blue, so a Project mark and a P3 chip sit near the primary's hue instead
of clear of it. The alternative — re-pointing entity hues per scheme — would make
"what colour is a Project?" a question with five answers. Identity that moves when
you change scheme is worse than identity that sits near the brand.

### Pulse needed exactly one hue substitution

Harmonisation rotates every chart source toward the seed, so a ramp's separation is
a property of the *seed* as much as of the sources. Under Pulse's magenta the shared
purple series and the magenta series both rotate inward and land inside the legend's
25° rule. Replacing the purple source with the decorative violet — 20° further out to
begin with — restores 28° at the tightest pair. Nothing else about Pulse's chart
palette differs, so a chart still means the same thing in every scheme.

## How it is proved

Screenshots cannot prove a colour system. The contract is asserted instead, over
generated data, for **every scheme in both appearances** — ten combinations, not
two:

| Question | Where |
| --- | --- |
| Do the committed colours match the algorithm? | `pnpm run scheme:check` |
| Does every scheme define every role, in both appearances? | `test/unit/tokens/color-schemes.test.ts` |
| Does every `on-*` pair, surface, outline, focus ring and composed surface clear WCAG? | `test/unit/tokens/contrast.test.ts` |
| Is the surface ladder ordered and near-neutral in every scheme? | `test/unit/tokens/tokens.test.ts` |
| Do semantics survive every scheme? | `test/unit/tokens/color-schemes.test.ts` |
| Does the cascade resolve all ten scheme × appearance states? | `test/unit/tokens/appearance-cascade.test.ts` |
| Does any module stylesheet branch on a scheme? | the same file — it must not, and the build fails if it does |
| Does the preference validate, persist, mirror and fall back? | `test/unit/preferences/color-scheme.test.ts`, `test/kernel/app-preferences.test.ts` |
| Does switching work in a browser, in every combination? | `e2e/color-scheme.spec.ts` |

## Retained evidence

`docs/design/assets/theme-01-2026-08/` — eleven images, ~1.3 MB, captured by the
opt-in [`e2e/color-scheme-screenshots.spec.ts`](../../e2e/color-scheme-screenshots.spec.ts):

```
CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/color-scheme-screenshots.spec.ts
```

The matrix is deliberate — one or two surfaces per scheme, chosen for the way that
scheme is most likely to fail, not a grid:

| Image | Why it is kept |
| --- | --- |
| `violet-today-light` · `violet-today-dark` | the default, unchanged, in both halves |
| `electric-today-dark` | the deep blue-black shell is the scheme's headline claim |
| `electric-tasks-light` | many simultaneous states, where blue-on-blue would show |
| `pulse-today-dark` | where magenta and lime would become exhausting |
| `pulse-projects-light` | a gallery is where saturation goes wrong first |
| `ocean-today-light` | "calm and premium" rather than generic corporate blue |
| `ocean-tasks-dark` | the cool scheme's busiest surface |
| `graphite-today-light` | "intentionally minimal" rather than unfinished |
| `graphite-note-dark` | a writing surface must stay a page |
| `settings-scheme-picker` | the control itself |

## Deliberately not built

A custom colour picker · user-authored or downloaded palettes · a theme
marketplace · per-Project or per-module schemes · new typography, spacing, shape,
layout, motion, icons, charts or widgets · any ultra-wide layout work (WIDE-01 has
not merged; THEME-01 only ensures it can consume every scheme through shared
tokens without module-specific work).
