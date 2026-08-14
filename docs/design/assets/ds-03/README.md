# DS-03 — visual record

Screenshots taken while implementing
[DS-03](../../DS_03_SHELL_AND_NAVIGATION_2026_08.md), in the order they were
taken. They are the evidence for the claim that the shell moved toward the two
concept references in the repository root, and they are kept rather than deleted
so DS-04 can compare against them.

Captured with `node scripts/uix-06-shot.mjs` against a local dev server with the
standard seeded workspace.

| Folder | When | What it shows |
|---|---|---|
| `baseline/` | before any shell change | the MD3 frame DS-03 started from — a white drawer, a lilac pill, a 68px bar |
| `checkpoint-b/` | after the desktop shell | the dark rail, the 56px bar and the collapsed tablet rail, before the mobile pass |
| `checkpoint-c/` | during the responsive pass | the tablet in dark, and the navigation sheet's two 56px stadiums **before** they were retired |
| `final/` | end of DS-03 | the state the PR ships |

## Reading them

The comparison that carries most of the difference is
`baseline/baseline-desktop-tasks.png` against `final/final-tasks-desktop.png`:

| | baseline | final |
|---|---|---|
| Rail | white, lilac selected pill, 44px rows | **near-black**, violet selected block, 36px rows |
| Rail identity | brand only; account in the top bar | brand at the top, **account at the bottom** |
| Top bar | 68px, search capsule in a trailing cluster of five | **56px**, search field at the **leading edge**, three trailing controls |
| Create action | hand-rolled violet stadium | the shared `Button`, at the control corner |
| Page title | 28px, band 24/16 | 24px (`--dh-text-page-title-*`), band 20/12 |
| Chrome above the first task row | ~340px at 1440×950 | ~310px |

Three captures are worth reading for a specific reason:

- **`final/final-wide.png` (1920).** The page title, the search field and the
  list all start at x=256. Before DS-03's page-frame fix the title started at
  347 — `.dh-pane-header` centred while the content it titles start-aligned, a
  divergence that is a no-op below ~1400px and therefore invisible to every
  laptop review.
- **`final/final-tablet-collapsed-rail.png` (900).** The deliberate tablet
  composition: a 68px glyph rail, 148px given back to the page, every
  destination still marked and still named (the labels are hidden visually, not
  removed).
- **`checkpoint-c/c-mobile-navigation-sheet-before-restyle.png` beside
  `final/final-mobile-navigation-sheet.png`.** DS-02 §8 listed the sheet's two
  56px `corner-full` search entries as debt #3. They were the loudest piece of
  the old design language left in the product, on the one screen a phone user
  opens to navigate.

## The dark appearance is not a repaint of the light one

`final/final-dark-desktop.png` and `final/final-dark-mobile.png` are worth
comparing to their light counterparts rather than skimmed. The rail is the same
object in both — dark in light, darker still in dark — and the selected
destination is a saturated violet in both, which took a per-appearance accent
role to achieve (see [DS-03 §2.2](../../DS_03_SHELL_AND_NAVIGATION_2026_08.md)).
The first build used one role for both and produced a pale lavender pill in dark;
that is what checkpoint B caught.

## Coverage

Widths: 1920 (wide), 1440 (desktop), 1366 (laptop), 900 (tablet), 390 (iPhone).
Both appearances. The phone captures are also where the density floor is visible:
the same CSS that draws a 36px control on a desktop draws a 45px one there,
because `compact`'s hit areas are floored back to the touch minimum on a coarse
pointer.

**These are documentation, not a visual-regression baseline.** Nothing asserts
against them; the repository has no pixel-comparison system and DS-03 did not add
one. What IS asserted lives in `test/unit/shell/shell-anatomy.test.ts` and
`test/unit/tokens/contrast.test.ts`.
