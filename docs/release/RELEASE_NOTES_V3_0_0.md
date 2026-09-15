# DalyHub V3.0.0 — Release Notes

**Version `3.0.0` · Release name "V3" · PREPARED, NOT YET RELEASED**

> Written for the person using DalyHub.
>
> **This release is prepared, not cut.** The version constant, this document and
> the checklist beside it are ready; the release itself waits on the two things
> [`RELEASE_CHECKLIST_V3_0_0.md`](RELEASE_CHECKLIST_V3_0_0.md) requires and this
> repository cannot supply on its own — the frontend foundation work merged to
> `main`, and `main` green after it.

---

## Why the major number moves

Not because of a feature. Between `2.4.0` and here, **every module in DalyHub was
rebuilt on a real design system**, and then the rules deciding which stylesheet
wins were rewritten underneath all of it.

That is not an addition, and calling it `2.5.0` would say it was. Almost every
surface you touch is a different implementation from the one `2.4.0` shipped —
even in the many places where the behaviour is deliberately identical, because
keeping the behaviour identical was the point. Your data is untouched and no
migration runs.

---

## What is new

### The interface is one system now, not eighteen

DalyHub was built module by module, and it looked like it. A button on Settings
and a button on Today were two different buttons that happened to agree. A card
on Projects and a card on Areas were two implementations of one idea. Eighteen
passes over eighteen months converged every module onto **Untitled UI React
Pro** — buttons, fields, selects, badges, tables, tabs, menus, dialogs,
progress, avatars, empty states and focus rings are now one control each,
everywhere.

You will mostly notice this by its absence. Controls are the same size in every
module. A field looks like a field wherever you find one. Focus rings are one
ring. Dark mode is one decision rather than eighteen.

### Deleting the design system DalyHub built before it had one

`DashboardCard`, `MetricTile`, `StatCard`, `MetricRow`, `ExpressiveSummary`,
`SupportingSurface`, `CardMetaFact`, `SummaryCards`, the shared `Timeline`, the
Material switch and the bespoke settings-control skins are all gone. Each was a
generic thing DalyHub had to build because nothing else provided one. Something
else provides one now.

### The cascade has an owner

This is the invisible half, and it is the reason for the major number.

DalyHub's stylesheets were **unlayered** — a technical decision that, for good
reasons, gave every old rule unconditional priority over the new design system.
Measured on the release before this one: 600,640 of the production stylesheet's
814,944 bytes, and 2,932 of its 4,602 rules. In practice that meant a rule
written years ago could silently repaint a correctly-rebuilt control, and the
only way to discover it was to measure the rendered pixel.

Every rule now belongs to an explicit cascade layer, and the layer order says who
owns what: Untitled draws the controls, DalyHub places them. What that fixed on
screen is small and specific — a few links that were taking a blanket accent
colour instead of the one their component asked for, a few headings whose own
`margin: 0` was being overruled — and what it prevents is the whole class of
defect. The architecture is written down in
[`CSS_CASCADE_ARCHITECTURE.md`](../architecture/CSS_CASCADE_ARCHITECTURE.md).

### Branded Plum

The shell wears a deep plum identity, and the page canvas and overlays stay
neutral in both appearances so the colour is an accent rather than a wash. Five
colour schemes ship, each with a light and a dark appearance, and Appearance and
Colour scheme are independent choices — changing either applies straight away.

---

## What has NOT changed

- **Your data.** No schema change, no migration, no export format change. The
  committed migration sequence at this commit is the one that was already there.
- **Your colours.** All five schemes, both appearances, every semantic colour:
  unchanged, and asserted unchanged by the token contrast tests in both
  appearances.
- **What the product does.** Preserving product behaviour through the rebuild
  was the constraint the whole programme worked under. If something behaves
  differently, that is a defect and not a feature of this release.

---

## Known limitations

Stated rather than omitted.

- **Two colour engines still ship side by side.** The generated MD3/DalyHub
  semantic tokens and the Untitled colour foundations both exist, and the layer
  order is arranged so DalyHub's values keep winning where the two collide. That
  is deliberate: deciding between them is its own piece of work and did not
  belong in a cascade change. It costs bundle size and a second vocabulary; it
  costs no correctness.
- **`md-state-layer` remains**, at 34 usages across 23 files. It is a working,
  tested, single-implementation hover/focus/pressed model with two dozen live
  consumers, and retiring it means migrating each of those to Untitled's own
  hover treatment. It can no longer defeat the cascade architecture, which was
  the part that mattered.
- **Eight legacy control stylesheets survive**, 1,966 lines, listed in
  [`CSS_CASCADE_ARCHITECTURE.md`](../architecture/CSS_CASCADE_ARCHITECTURE.md).
  All eight now LOSE to Untitled, and all eight were measured to change nothing
  on screen when they started losing — so they are dead weight awaiting deletion
  rather than live paint.
- **`forms.css` keeps its old position**, because demoting it retired its field
  geometry along with its field paint. Splitting it is named maintenance debt.
- **The Finance collection heading sits a gutter short** of every other page's
  title at desktop widths. Pre-existing, unrelated to this release's changes
  (measured: no computed-style change on that surface), and not fixed here.

---

## Related documents

- [`RELEASE_CHECKLIST_V3_0_0.md`](RELEASE_CHECKLIST_V3_0_0.md) — the evidence and
  the deployment sequence.
- [`CSS_CASCADE_ARCHITECTURE.md`](../architecture/CSS_CASCADE_ARCHITECTURE.md) —
  the layer model and its measurements.
- [`UNTITLED_UI_MIGRATION.md`](../design/UNTITLED_UI_MIGRATION.md) — what the
  migration covered and what maintenance debt it named.
- [`RELEASE_NOTES_V2_4_0.md`](RELEASE_NOTES_V2_4_0.md) — the previous release.
