# THEME_ACCEPTANCE_MATRIX.md — retired

> **This document is a tombstone.** The seven-theme system it recorded no longer
> exists.

DalyHub ships **generated light/dark pairs**, derived by the Material Design 3
tonal-palette algorithm and selected by two independent root attributes. There is
no `data-theme` attribute and no `theme` column, and no palette is authored by
hand. The reasoning, the four forced deviations from the generator's defaults, and
everything that was traded away is recorded in:

**[ADR-074 — Material Design 3 as the design language](../decisions/ARCHITECTURE_DECISIONS.md#adr-074-material-design-3-as-the-design-language--one-generated-scheme-no-theme-feature-and-an-alias-layer-as-the-migration-mechanism)**

THEME-01 later grew that one generated pair to **five colour schemes** — Daly
Violet, Electric, Pulse, Ocean and Graphite — and none of the argument above
changed: they are five generated TOKEN MAPS over one design system, not five
stylesheets, and no module rule may branch on one. See
**[ADR-088](../decisions/ARCHITECTURE_DECISIONS.md#adr-088-five-generated-colour-schemes-over-one-design-system--a-second-root-attribute-orthogonal-to-appearance)**
and [`DESIGN_SYSTEM.md → Appearance, colour scheme, design system`](DESIGN_SYSTEM.md#appearance-colour-scheme-design-system).

## What replaced this document

This file existed because seven hand-authored palettes needed a per-theme
acceptance record: with seven maps over the same semantic names, "does this
surface work?" had seven answers and no single place proved them. That is exactly
the cost the overhaul removed.

With generated schemes, the equivalent proof is executable rather than narrative,
and it runs on every commit — over EVERY scheme in BOTH appearances, which is the
part a per-theme narrative record could never keep honest:

| Question | Where it is answered now |
| --- | --- |
| Do the committed colours match the algorithm? | `pnpm run scheme:check`, inside `pnpm run verify` |
| Does every `on-*` pair clear 4.5:1, in both appearances? | [`test/unit/tokens/contrast.test.ts`](../../test/unit/tokens/contrast.test.ts) |
| Does the outline, the focus ring and progress clear 3:1 on every surface? | the same file |
| Is a card lighter than its page in both appearances? | [`test/unit/tokens/tokens.test.ts`](../../test/unit/tokens/tokens.test.ts) |
| Does every entity type have its own colour? | [`test/unit/tokens/entity-accents.test.ts`](../../test/unit/tokens/entity-accents.test.ts) |
| Are the chart series distinguishable? | `contrast.test.ts` — ≥25° of hue between any two, per scheme |
| Does every scheme define every role? | [`test/unit/tokens/color-schemes.test.ts`](../../test/unit/tokens/color-schemes.test.ts) |
| Do semantic statuses survive every scheme? | the same file — brand vs error, the priority ramp, entity identity |
| Does a real page pass axe in every scheme, both appearances? | [`e2e/color-scheme.spec.ts`](../../e2e/color-scheme.spec.ts) |

## What the design system says now

The foundations, the component anatomy and the dashboard rules live in
[`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md).
