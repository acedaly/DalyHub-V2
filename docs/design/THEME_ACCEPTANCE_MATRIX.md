# THEME_ACCEPTANCE_MATRIX.md — retired

> **This document is a tombstone.** The seven-theme system it recorded no longer
> exists.

DalyHub ships **one generated light/dark pair**, derived from a single seed
colour by the Material Design 3 tonal-palette algorithm and selected by
`prefers-color-scheme`. There is no theme picker, no persisted preference, no
`data-theme` attribute and no `theme` column. The reasoning, the four forced
deviations from the generator's defaults, and everything that was traded away is
recorded in:

**[ADR-074 — Material Design 3 as the design language](../decisions/ARCHITECTURE_DECISIONS.md#adr-074-material-design-3-as-the-design-language--one-generated-scheme-no-theme-feature-and-an-alias-layer-as-the-migration-mechanism)**

## What replaced this document

This file existed because seven hand-authored palettes needed a per-theme
acceptance record: with seven maps over the same semantic names, "does this
surface work?" had seven answers and no single place proved them. That is exactly
the cost the overhaul removed.

With one generated scheme, the equivalent proof is executable rather than
narrative, and it runs on every commit:

| Question | Where it is answered now |
| --- | --- |
| Do the committed colours match the algorithm? | `pnpm run scheme:check`, inside `pnpm run verify` |
| Does every `on-*` pair clear 4.5:1, in both appearances? | [`test/unit/tokens/contrast.test.ts`](../../test/unit/tokens/contrast.test.ts) |
| Does the outline, the focus ring and progress clear 3:1 on every surface? | the same file |
| Is a card lighter than its page in both appearances? | [`test/unit/tokens/tokens.test.ts`](../../test/unit/tokens/tokens.test.ts) |
| Does every entity type have its own colour? | [`test/unit/tokens/entity-accents.test.ts`](../../test/unit/tokens/entity-accents.test.ts) |
| Are the chart series distinguishable? | `contrast.test.ts` — ≥25° of hue between any two |
| Does a real page pass axe in both appearances? | the Playwright suite, which emulates the scheme |

## What the design system says now

The foundations, the component anatomy and the dashboard rules live in
[`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md).
