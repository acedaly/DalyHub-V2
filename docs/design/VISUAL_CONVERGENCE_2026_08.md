# Visual convergence — August 2026

> A focused visual refinement of `main` against an approved reference image. Not
> a redesign: the information architecture, the routes, the data model, the
> measurable-Goal semantics and the component architecture are unchanged. This
> pass is composition, proportion, typography, whitespace, surface treatment,
> navigation restraint, control geometry and phone polish.

Two parts:

- **[Part 1 — the gap analysis](#part-1--the-gap-analysis)**, written before any
  code changed, from the captured `before-` screenshots beside the reference.
- **[Part 2 — the visual QA report](#part-2--the-visual-qa-report)**, written
  after, comparing the `before-`/after pairs surface by surface and recording
  what is deliberately still different.

Evidence: `docs/design/assets/visual-convergence-2026-08/`, captured by
`e2e/visual-convergence-screenshots.spec.ts`. The same spec writes both halves
(`SHOT_PREFIX=before-` and no prefix) against the same seeded data, so nothing
in the comparison differs except the product.

---

# Part 1 — the gap analysis

## What the reference actually gets right

Read as a set of proportions rather than as a specification, the reference wins
on six things at once:

1. **The content owns the screen.** Its navigation is roughly 14% of the window
   and monochrome; ours is 240px of drawer with a filled lilac capsule on it.
2. **Surfaces are separated without being announced.** Cards sit a hair above
   the page, with restrained radii and modest padding. Ours are all one radius,
   one padding and one tone step, so nothing is more important than anything.
3. **Numbers are the loudest thing in a figure card, and nothing else in it is.**
4. **Whitespace is macro, not micro.** Generous between regions, tight inside
   rows.
5. **Colour means something because there is very little of it.**
6. **The phone is a composition of its own**, not a narrow desktop.

## Surface-by-surface findings

Each finding is either **inherited Material styling** (refine it) or
**protecting real behaviour** (keep it). That is the brief's own decision rule.

### F1 · The navigation drawer is the most Material object in the product

`before-today-1440-light.png`. 240px wide; every destination a 48px row inside a
fully-rounded pill; the selected destination a filled `secondary-container`
capsule 216px wide; two hard hairlines grouping eleven destinations.

The width is 16.7% of a 1440 window and 18.8% of a 1280 one. The reference's is
~14%. The pill is the specification's answer and the design system's own Part 2
already records it as such (item A2).

*Inherited styling.* The signal never rested on the fill — `aria-current`, the
weight step, the primary glyph and the shape all carry it.

### F2 · The top app bar states nothing and offers a 40px glyph

A previous pass removed a 56px full-width search pill, correctly, and replaced
it with an icon. The reference's answer is the third option neither pass took: a
**compact capsule** that looks like a field, sits at the trailing end of the bar
next to the utilities, and opens the same surface. It says "you can search here"
without spending a band on it.

*Inherited styling* — but the fix must not re-create the pill that was removed.
Bounded width, control height, not full-bleed.

### F3 · Today's figure row collapses to one small tile

`before-today-1440-light.png`. The seeded day has one figure worth painting, and
`repeat(auto-fill, minmax(9.5rem, 1fr))` renders it as a 150px tile stranded at
the left of a 1136px row. The honesty rule (a zero never paints) is right and
stays; the **track size** is wrong — it was chosen for two-up on a phone and
never re-tuned for the desktop.

The reference's four figure cards are ~254px each at 1440. Ours should be able to
be that when there are four, and a comfortable tile when there is one.

### F4 · Goal progress on Today is a vertical stack, not a glance

Four Goals, each a full-width row carrying title, Area, value, target, a 6px
bar, `38% · 9.3 kg remaining · ↓ 2.8 kg this month`, a green `Ahead` pill and an
outlined **Log weight** button. That is ~130px of vertical space per Goal and six
facts where the reference shows three.

*Mostly inherited styling*, and one real thing to protect: the check-in action is
genuinely the most useful control on a Goal and must survive. It can survive as a
quieter control.

### F5 · The Goals and Projects galleries document a record instead of helping choose one

`before-goals-1440-light.png`. A Goal card carries: identity mark, title, Area,
current value, `79.3 kg → 70 kg`, `38%`, a bar, an `Ahead` pill, a
`No contribution path` pill, `9.3 kg remaining`, `↓ 5.7 kg overall`. Eleven
facts. A Project card carries nine.

`No contribution path` is the loudest example: it is an *absence*, drawn as a
chip, on every card that has one.

*Inherited styling.* Every fact stays available on the record.

### F6 · The Goals gallery hero spends a third of the first viewport on `0/10`

The Level-1 expressive hero is doing exactly what the design system says a hero
should — but on a gallery the hero's own figure (`0/10` open Goals with recent
action) is the least useful number on the page, and it pushes the first card row
below 380px. The reference has no such band on a gallery.

Not a hierarchy change: keep one dominant surface, spend less height on it.

### F7 · The segmented control is a component demo

A 1px `outline` capsule with 1px inter-segment dividers and a filled
`secondary-container` selected segment. Already recorded as Part 2 item A8.
*Inherited styling.*

### F8 · The Notes editor is a rich-text field inside a settings page

`before-notes-editor-1440-light.png`. The writing surface is a bordered,
rounded box with a toolbar bar across its top and a help line under it, capped
at a measure that leaves ~40% of a 1440 window empty. Already recorded as Part 2
item A4. *Inherited styling*; the geometry suites are what make it safe.

### F9 · The Goal record's chart is a BI chart

Full-width plot, 2px stroke, a dot on every reading, min/max labels bottom-left,
date labels bottom-right, a sentence under it, then a `Progress history` table
with `Edit`/`Remove` on every row. The reference's equivalent is a thin line and
a target rule.

*Partly protecting behaviour* — history editing is real and stays. The chart's
own weight is inherited.

### F10 · Mobile Tasks surfaces every editable field at rest

`before-tasks-390-light.png`. Above the list: two filled action pills, an
outlined `Filter & sort` pill, a full-width add field, a disabled `Add` button
and a `More options` link — before the first task. Each row then carries a
selection square, an entity glyph, the title, a status chip, a priority chip with
a caret, an `Overdue` chip, a due date, a project chip with a caret, a planned
date, a `Sector:` line, and a visible `Complete` / `Today` / `…` action rail.

*Both.* The inline controls are real behaviour (D8 exists precisely because a
narrow window with a mouse got the touch layout). Their *resting weight* is
inherited. The refinement is tone and size, not removal.

### F11 · Mobile chrome is tall at both ends

The bottom navigation is 80px of bar plus safe area, with 24px glyphs and
`label-medium` labels; the reference's equivalent reads at about 56–64px.

*Inherited styling.* The 44px target floor is behaviour and is kept — a target is
not a painted shape.

### F12 · Dark is a light layout with black substituted

`before-today-1440-dark.png`. Page tone 7 is near black; against it the card at
tone 13 reads as a grey slab rather than a lifted surface, and the identity marks
and the state tints are the brightest things on the screen. Already recorded as
Part 2 item A7 for the identity marks; the surface floor is the other half.

*Inherited styling*, and it must be fixed in the **generator**, not in
hand-edited dark hexes.

### F13 · The design system document contradicts `main`

`DALYHUB_DESIGN_SYSTEM.md` Part 2 item A1 says measurable Goals are *not
implemented* and that "a Goal's only honest measure is its Project contribution".
GOAL-02 shipped in #146. This is the first thing to fix, before any pixel.

## What is deliberately NOT changing

- The Area → Goal → Project → Task spine, every route, and the data model.
- Goal measurement semantics: representation still follows measurement type.
- The honesty rules: a zero never paints, an unmeasured Goal is never 0%, no
  invented Focus-time metric because the reference shows `2h 15m`.
- The completion circle, the selection square, and the distinction between them.
- The 44px touch floor, `aria-current`, keyboard completeness, forced-colours
  fallbacks, and the generated-colour contract.
- React, the token system, the theme architecture (there isn't one), the card
  components. No new dependency.

## The order of work

1. Correct the design-system document (F13).
2. Tokens: shape hierarchy, navigation width, page rhythm, dark surface floor
   (F1, F12, and the foundation of everything else).
3. The shell: drawer, selected destination, search capsule (F1, F2).
4. Today: figure row, Focus, Schedule, Goal progress (F3, F4).
5. Shared components: segmented control, entity cards, charts (F5, F7, F9).
6. Goals and Projects galleries, and the Goals hero (F5, F6).
7. Notes writing surface (F8).
8. Phone: bottom navigation, Tasks rows, Today's first viewport (F10, F11).
9. Re-capture and compare (Part 2).

---

# Part 2 — the visual QA report

*Written after implementation — see below.*
