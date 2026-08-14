# DS-02 — visual record

Screenshots taken while implementing
[DS-02](../../DS_02_CORE_UI_PRIMITIVES_2026_08.md), in the order they were taken.
They are the evidence for the claim that the primitive layer moved the
application toward the two concept references in the repository root, and they
are kept rather than deleted so the next stage can compare against them.

Captured with `node scripts/uix-06-shot.mjs` against a local dev server with the
standard seeded workspace.

| Folder | When | What it shows |
|---|---|---|
| `baseline/` | before any visual change | the MD3-sized product DS-02 started from |
| `checkpoint-b/` | after the first primitive pass | buttons and fields only — used to decide what still had to change |
| `checkpoint-c/` | after the overlays and the representative migration | the first set worth comparing against the concepts |
| `final/` | end of DS-02 | the state the PR ships |

## Reading them

The four measurements that carry most of the difference, all visible by
comparing `baseline/tasks-1280-light.png` with `final/tasks-1280-light.png`:

| | baseline | final |
|---|---|---|
| Primary action | 45px stadium | 36px rounded rectangle |
| Text field (`.dh-input`) | 56px | 36px |
| Status badge | 32px chip at 14px | 20px badge at 12px |
| Menu row | 48px at 16px | 36px at 14px |
| "Filter & sort" | 45px outlined stadium | 36px bordered control |

`final/design-primitives-*.png` is the gallery route (`/design/primitives`,
development-only). It is the one surface where every primitive appears side by
side, which is the only way to check that a button, the field beside it and the
menu row below it agree about what a control is.

## What these do NOT show

Deliberately, and each is named in
[DS-02 §7](../../DS_02_CORE_UI_PRIMITIVES_2026_08.md#7-what-ds-02-deliberately-did-not-do):

- the navigation rail, the search capsule and the top bar's create pill — the
  most conspicuous remaining stadiums, and **DS-03**'s opening scope;
- the task row's own height and controls — **DS-04**;
- the six record card families — **DS-05**;
- Today's stat row and focus panel — **DS-06**.

## Coverage

Both appearances are captured (`-light` / `-dark`). Widths are 1280 (laptop),
390 (iPhone) and 320 (the narrowest supported viewport). The phone captures are
the ones that show the density floor working: the same CSS that draws a 36px
button on a desktop draws a 45px one there, because `compact`'s hit areas are
floored back to the touch minimum on a coarse pointer.

**These are documentation, not a visual-regression baseline.** Nothing asserts
against them; the repository has no pixel-comparison system and DS-02 did not
add one.
