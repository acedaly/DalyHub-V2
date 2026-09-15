# DalyHub CSS cascade architecture

> **Status:** current. Introduced by V3-CSS-01, ahead of DalyHub 3.0.0.
> **Authority:** this document decides which cascade layer a stylesheet belongs
> in and why. It does not decide what anything looks like — that is
> [`DESIGN_DIRECTION.md`](../design/DESIGN_DIRECTION.md) and
> [`UNTITLED_UI_IMPLEMENTATION.md`](../design/UNTITLED_UI_IMPLEMENTATION.md).

## The one rule

Every CSS rule DalyHub ships belongs to an explicit `@layer`, and the layer
order is the ownership model. Nothing is unlayered, because unlayered CSS
outranks layered CSS unconditionally and regardless of specificity — which means
one unlayered file quietly outranks the entire design system.

**There is exactly one exception, and it is forced rather than chosen:
`markdown-editor-codemirror.css` — eight rules.** See [The one exception](#the-one-exception) below. It is
not a loophole — `e2e/css-cascade-ownership.spec.ts` derives the permitted set
from that file's own contents and fails on any other unlayered rule.

```
theme → dh-tokens → base → dh-floor → dh-legacy → components → utilities → dh-product
```

Declared once, in [`app/styles/untitled/untitled.css`](../../app/styles/untitled/untitled.css).
Assigned once per stylesheet, in [`app/app.css`](../../app/app.css).

| Layer | Holds | Loses to |
| :-- | :-- | :-- |
| `theme` | Tailwind's theme variables, the generated Untitled theme | everything below |
| `dh-tokens` | `tokens.css`, `fonts.css` — DalyHub's token vocabulary | everything below |
| `base` | Tailwind preflight, Untitled's element normalisations, `base.css` | everything below |
| `dh-floor` | the zero-specificity native-control and link floor | everything below |
| `dh-legacy` | DalyHub paint for **generic controls**, in transition | `components`, `utilities`, `dh-product` |
| `components` | Tailwind's component layer, and `today.css` | `utilities`, `dh-product` |
| `utilities` | Tailwind's and Untitled's utilities — where migrated components get their appearance | `dh-product` |
| `dh-product` | genuine DalyHub product composition | nothing |

`properties` is emitted by Tailwind itself and is not declared.

## What was wrong, measured

Before V3-CSS-01, every DalyHub stylesheet was deliberately unlayered. That was
the right decision while the Untitled migration was in flight: it made the
Tailwind import safe by construction, because preflight could not reset a screen
that had not moved yet. The migration finished; the decision did not.

Measured on `main` @ `77f8b55`, from the **built** stylesheet rather than from
source import order:

| | Before | After |
| :-- | --: | --: |
| CSS source files | 91 | 91 |
| CSS source lines | 44,306 | 44,306 |
| Production root CSS, raw | 814,944 B | 814,968 B |
| Production root CSS, gzip | 98,232 B | 99,449 B |
| `app.css` imports | 78 | 78 |
| **Unlayered bytes** | **600,640 (73.7%)** | **4,150 (0.51%)** |
| **Unlayered style rules** (CSSOM, live page) | **2,932 of 4,602 (63.7%)** | **0 of 4,602** |
| `!important` declarations | 15 | 15 |

The remaining unlayered bytes are `markdown-editor-codemirror.css` (eight rules
— the one forced exception, below), 84 Tailwind `@property` declarations and four
`@keyframes`. Neither `@property` nor `@keyframes` is a cascade participant, and
neither can be layered.

> **The byte figure above is not re-measured here.** It was taken when the
> exception held six rules; this change adds two, so it is now low by their
> size. It is left rather than guessed at, because the number is a measurement
> and this change did not make one. What IS re-measured is the thing that
> matters — see [The one exception](#the-one-exception).

The emitted cascade, read off the built artefact:

```
before:  properties  theme  base  dh-floor  components  utilities  ▸ 600 KB UNLAYERED ◂
after:   properties  theme  dh-tokens  base  dh-floor  dh-legacy  components  utilities  dh-product
```

### The defect this produced

A one-class legacy selector beat every Untitled utility on the same element,
whatever either author intended. Probed in a real browser against the real
stylesheet, on an element carrying both `.dh-surface` (`ui.css`) and Untitled's
`bg-brand-solid rounded-none`:

| | `background-color` | `border-radius` |
| :-- | :-- | :-- |
| before | `rgb(255, 255, 255)` — legacy | `12px` — legacy |
| after | `rgb(105, 63, 117)` — Untitled | `0px` — Untitled |
| the legacy rule alone, after | `rgb(255, 255, 255)` | `12px` |

Both halves are held by [`e2e/css-cascade-ownership.spec.ts`](../../e2e/css-cascade-ownership.spec.ts):
the probe above, and a CSSOM walk asserting no rule sits outside a layer.

## The one exception

`markdown-editor-codemirror.css` — **eight rules** — is imported **without** a
`layer()` keyword, and that is a consequence of how the cascade works rather than
a preference.

**CodeMirror configures itself by injecting a `<style>` element at runtime**
(`style-mod`'s `StyleModule`). A runtime-injected sheet is unlayered by
construction: there is no `@import` for a `layer()` keyword to attach to, and the
library offers no hook to place it. Unlayered normal declarations beat layered
ones unconditionally — so the moment DalyHub's editor stylesheet entered a layer,
a third-party library acquired absolute priority over the stylesheet whose entire
job is to configure it.

That is not hypothetical. It shipped in the first CI run of this architecture:

| | |
| :-- | :-- |
| Measured | CodeMirror injects **72 unlayered rules**. Its own `.cm-content { padding: 4px 0 }` beat `.dh-md-editor__cm .cm-content`'s DalyHub padding. |
| Rendered | The editor's first line lost its left inset entirely — computed `4px 0px 4px 0px`. |
| Caught by | `e2e/editor-geometry.spec.ts`, at 390, 1024, 1280 and 1440, plus the empty-Note caret. Four E2E partitions red. |
| Why it ever worked | Before V3-CSS-01 this file was unlayered too, and won on specificity (`.dh-md-editor__cm .cm-content` is 0-2-0 against CodeMirror's 0-1-0). Layering it is what handed the contest away. |

**The first version of this exception was too wide, and `main` caught it.** It
un-layered the whole of `markdown-editor.css`. That fixed the contest with
CodeMirror and created another: the same file carries DalyHub's own editor
composition, and five product stylesheets — `notes.css`, `diary.css`,
`meetings.css`, `reviews.css`, `review-guide.css` — legitimately override it.
Unlayered, it outranked all five.

MEASURED on `main` @ `4f49c16`: `review-guide.css`'s
`.dh-review-guide__prompt … .cm-editor { max-block-size: none }` stopped
cancelling the compact density cap, the guided Review's editor got its `50vh`
ceiling back, `.cm-scroller` became scrollable, and axe reported a **serious**
`scrollable-region-focusable` violation. E2E partition p07, red.

**So the exception is now only what it has to be.** Six rules, contesting a
property CodeMirror's own sheet sets on the same element — established by reading
its 71 injected rules rather than by guessing:

| CodeMirror sets | on |
| :-- | :-- |
| `margin`, `padding`, `min-height`, `outline`, `display`, `box-sizing` | `.cm-content` |
| `font-family`, `line-height`, `height`, `overflow-x`, `display` | `.cm-scroller` |
| `outline` | `.cm-focused` |

CodeMirror sets **nothing** on `.cm-editor`, which is why the density caps stayed
in `markdown-editor.css` — in `dh-product`, where product surfaces can still
override them normally.

**The real fix, deliberately not taken here:** move the 49 `.cm-*` rules into
CodeMirror's own `EditorView.theme()`, where they would participate in the same
StyleModule and the same precedence as the defaults they override. That is a
refactor of a working editor, and it belongs to its own change. Named
maintenance debt item 16.

### What this means for anyone adding a stylesheet

If you integrate a library that injects its own CSS at runtime, **your overrides
for it cannot live in a layer either**. Put them in their own file, keep it to
the declarations the library itself sets, and say so at the import: what injects,
and which of its declarations you are contesting.

The mistake to avoid is the one made here first: do not un-layer the whole
stylesheet that happens to contain those overrides. Everything else in it is
ordinary product CSS that the rest of the product expects to be able to
compose with, and unlayering it takes that away silently.

---

## Where a stylesheet goes

Ask what the rules **do**, not which module they came from.

**`dh-product` — DalyHub owns it.** Layout. Information hierarchy.
Product-specific responsive composition. Domain spacing. Entity identity.
Specialised workflows. Specialised signals. Local structural geometry.

**`dh-legacy` — Untitled owns it, and this rule has not been retired yet.**
Standard button, input, select and combobox paint. Badges. Tables. Tabs. Menus.
Dialog surfaces. Progress. Avatars. Empty states. Dates. Focus treatment.

`dh-legacy` is a **shrinking inventory, not a destination.** Nothing new goes in
it. When the last rule leaves a file, the file goes.

### The current `dh-legacy` inventory — 8 files, 1,966 lines

| File | Lines | What Untitled should be drawing |
| :-- | --: | :-- |
| `floating.css` | 593 | menu, popover and listbox surfaces |
| `ui.css` | 536 | the generic box, badge, tag chip, panel heading |
| `filters.css` | 380 | filter chips, the add/edit popover, native value controls |
| `pill.css` | 125 | the chip vocabulary |
| `tooltip.css` | 92 | tooltips |
| `overflow-menu.css` | 91 | the overflow trigger |
| `skeleton.css` | 82 | loading placeholders |
| `progress.css` | 67 | progress bars |

None of these produced a visual change when demoted below `utilities`. **The
strength of that statement is not the same for all eight**, and a later audit of
the snapshot matrix is what established the difference — so it is recorded here
rather than averaged away.

The matrix sampled *collections* heavily and *records* and *overlays* barely: it
carried `/projects` but not `/projects/pr-website`, `/goals` but not
`/goals/g-launch`, and **no overlay was open in any of the 170 snapshots**.
Auditing which of these files' classes were actually rendered in it:

| File | Classes rendered in the matrix | What the audit then established directly |
| :-- | --: | :--- |
| `ui.css` | 10, on 12 surfaces | Covered by the diff. |
| `filters.css` | 10, on 2 surfaces | Thin, but covered. |
| `pill.css` | 3, on 1 surface | Thin, but covered. |
| `overflow-menu.css` | 3, on 10 surfaces | Covered by the diff. |
| `skeleton.css` | 1, on 2 surfaces | Thin, but covered. |
| `floating.css` | **0** | **Live, and verified separately.** With the record overflow menu open: `.dh-floating` ×3 and `.dh-option` ×20, correct background, hairline, 12px radius and shadow in **both** appearances. Its elements carry **only `dh-*` classes and no Untitled utilities**, which is precisely why demoting it changes nothing — there is nothing on the element to contest it. |
| `tooltip.css` | **0** | **Dead.** The shared Tooltip renders pure Untitled utilities (`rounded-lg bg-primary-*`, an `oklch` background); `dh-tooltip` appears **zero** times in the rendered DOM. 92 lines with no consumer. |
| `progress.css` | **0** | **Inert.** It contains no `.dh-progress*` rules at all — UNTITLED-07 deleted them and the class names survive as markup hooks. Its only live rules are `.dh-ring*`, whose component `~/shared/charts/ProgressRing` is exported from the charts barrel and **imported by nobody**; `.dh-ring` appears in no markup. |

So `tooltip.css` and `progress.css` are deletable now on evidence stronger than
the diff's — they have no consumer at all — and `floating.css` is live paint that
is safe where it sits for a reason that was measured rather than assumed. The
claim that the diff alone proved all eight inert was too strong, and this table
replaces it.

### Three files that look generic and are not

| File | Why it is `dh-product` |
| :-- | :-- |
| `card.css` | The Shared Card carries a **record**. Untitled ships no generic Card (named maintenance debt item 2), so nothing upstream is waiting to take it. Demoting it deleted `[data-accent]`'s entity edge — measured: all twelve accent cards collapsed to the same 1px hairline and `data-accent` stopped meaning anything on screen. |
| `card-family.css` | `.dh-row` and `.dh-ecard` are record presentations, for the same reason. |
| `forms.css` | **A compromise, recorded as one.** 1,120 lines mixing generic field paint (Untitled's) with field geometry (DalyHub's). Demoting it correctly retired the paint and incorrectly retired the geometry — measured: `.dh-combobox__input` lost the 32px trailing padding that reserves room for its own control, and its text would have run under a button. Splitting it rule by rule is named maintenance debt item 1's job, not this pass's. |

### One file whose layer is `components`

`today.css` is the only stylesheet in DalyHub written in `@apply` — 67 of them.
Its rules are **aliases for Untitled utilities**, not DalyHub paint competing
with them, so a utility written on the element has to win. `dh-product` sits
above `utilities` and would invert that: measured, `.dh-next-action` on Today
carries Untitled's `flex` and `today.css`'s `.dh-day-row__next { display: block }`
began beating it, collapsing the Next-action row from a flex row to a stacked
block. `components` is where its own hand-written `@layer` wrapper had always
put it.

### Two files that declare their own layers

`base.css` and the ten `*-demo.css` fixture stylesheets are imported without a
`layer()` keyword and wrap their own contents instead.

- `base.css` holds two top-level blocks, `@layer base` and `@layer dh-floor`. An
  `@import … layer(base)` would have nested the second into `base.dh-floor` — a
  sub-layer of `base` rather than the top-level `dh-floor` everything else
  refers to. The layer would still exist and would no longer be the one anything
  names.
- The fixture stylesheets are imported from route modules, and a JS
  `import "./x.css"` cannot carry a `layer()` keyword. They wrap their contents
  in `@layer dh-product`.

## What the change actually did to the product

The layering was applied and then **measured**, element by element, rather than
reviewed by eye. `before` and `after` snapshots captured the computed value of 38
paint and layout properties for every rendered element across 32 routes × up to 5
widths × 2 appearances — 170 surfaces, 66,681 elements.

Keying those snapshots on DOM position turned out to be useless: with the
stylesheet **untouched**, 1.69% of elements "changed", because the task list and
several inline labels reorder between runs. Re-keying on the `(tag, className)`
signature and comparing the SET of values each signature was observed with
dropped the noise floor to 0.23% — two items, both genuine interaction-state
variance (a disabled button, a checkbox mid-state).

Against that floor, the final change:

| | |
| :-- | --: |
| Class signatures compared | 13,609 |
| Signatures changed | 55 (0.40%) |
| Distinct changes | 62 |
| **Surfaces with any change at all** | **5 of 170** |

Four of those five are dev-only `/design/*` galleries. **The only product surface
with any computed-style change is `/diary`**, whose controls were then inspected
directly and render with Untitled's own button geometry, correctly.

Every remaining change is a blanket rule in `base.css` no longer overriding a
component's own declaration by an accident of specificity — which is the defect
this work exists to remove, not a regression:

- `.dh-primitives__section-title` declares `margin: 0` and uses its parent's
  `gap` for spacing. `base.css`'s `.page h2 { margin: 24px 0 8px }` had been
  winning on specificity. It no longer does.
- `.dh-row__open` and `.dh-ecard__open` carry `text-primary`. `base.css`'s
  `.page a:not(.dh-btn) { color: var(--dh-color-accent) }` had been winning on
  specificity. It no longer does; contrast was checked in both appearances.
- `.dh-row-list` and `.dh-ecard-grid` had the user-agent's default list padding.
  They no longer do.

Screenshots of all 21 named product surfaces at 1440/light and 393/dark were
captured and reviewed alongside the diff.

## What this work deliberately did not do

- **No colour-engine rewrite.** DalyHub still runs two colour systems side by
  side: the generated MD3/DalyHub semantic tokens in `tokens.css` (8,453 lines,
  five colour schemes × two appearances) and the Untitled colour foundations in
  `untitled/theme.css`. `dh-tokens` is placed **after** `theme` precisely so that
  where the two vocabularies collide, DalyHub's value — the one the product has
  always rendered — still wins. Semantic colours, both appearances and all five
  schemes are unchanged, and `pnpm run scheme:check`, `dhds:check` and
  `untitled:theme:check` still pass. Deciding between the two engines is its own
  piece of work and needs its own evidence.
- **No `md-state-layer` removal.** It remains at 34 usages across 23 files —
  named maintenance debt item 5, unchanged. What matters here is that it can no
  longer defeat the architecture: `base.css` declares it inside `@layer base`,
  the lowest DalyHub layer there is, so any component that migrates to Untitled's
  own hover treatment wins automatically rather than having to out-specify it.
- **No file split for size alone.** `tokens.css` is 8,453 lines and stays one
  file; it is generated, and length is not a defect.

## Adding a stylesheet

1. Decide what its rules **do**, using the two lists above.
2. Add one `@import "./styles/x.css" layer(dh-product);` to `app.css`.
3. If it must be imported from a route module instead, wrap its contents in
   `@layer dh-product { … }` and say why at the top of the file.

If you find yourself reaching for `!important` or adding a class to out-specify
something, the layer assignment is wrong. Fix the owner.
