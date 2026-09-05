# Material Design 3 UX & interaction audit — August 2026

**Scope.** The whole product, audited against the design language it says it
speaks. [ADR-074](../decisions/ARCHITECTURE_DECISIONS.md#adr-074-material-design-3-as-the-design-language--one-generated-scheme-no-theme-feature-and-an-alias-layer-as-the-migration-mechanism)
made Material Design 3 DalyHub's design language and
[`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) documents the anatomy as shipped. This
audit asks a narrower and more useful question:

> Where does the product the owner actually uses diverge from the language the
> repository says it speaks — and which of those divergences are worth fixing?

It is deliberately **not** a restyle proposal. M3-01 (PR #120/#121), DS-14 Gate D
(#122), the appearance work (#123) and the editor/gallery upgrade (#124) already
did the visual conversion. What remains is interaction and consistency debt: the
places where the *rules* are right and the *reach* is partial.

**Method.** Static evidence from the codebase (counts are `grep` over `app/`, and
reproducible), plus screenshots captured at M3's own window-size classes by
[`e2e/m3-audit-screenshots.spec.ts`](../../e2e/m3-audit-screenshots.spec.ts) into
`assets/m3-audit-2026-08/` (the folder was not committed; each finding below
records what its capture showed). M3's classes are used
rather than DalyHub's breakpoints on purpose: checking whether the product
answers the class correctly, using the product's own bands, would be circular.

**Status of each finding** is one of **defect** (it is wrong now), **divergence**
(deliberate or not, it differs from M3 and the difference costs something), or
**gap** (M3 has something the product does not, and the absence shows).

---

## Summary

| # | Finding | Kind | Severity | Status |
|---|---|---|---|---|
| 1 | The floating action button covers content and form controls | defect | **High** | **Closed** — PR #126 (narrowed; see the resolution) |
| 2 | Icon-only controls rely on `title` for their tooltip — 91 instances, none keyboard-reachable | gap | **High** | **Closed for the agreed adoption set** — PR #126 |
| 3 | The state layer is documented as one shared class and implemented ~5× by hand | divergence | Medium | **Closed for the reusable primitives** — PR #127 (remainder is a ratcheting baseline) |
| 4 | No navigation rail: the medium window class gets the phone layout | gap | Medium | Open — needs its own ADR |
| 5 | A 240px permanent drawer starves the expanded window class | divergence | Medium | Open — same decision as 4 |
| 6 | Settings mixes native `<select>` with the shared combobox | divergence | Medium | **Closed** — PR #127 |
| 7 | A settings row labels its own field twice | defect | Low | **Closed** — PR #126 |
| 8 | No switch: every boolean in the product is a checkbox | gap | Low | **Closed** — PR #127 |
| 9 | No press ripple; the state layer stops at opacity | divergence | Low (accepted) | **Closed** — PR #127 wrote the decision |

Findings 1, 2 and 7 are defects a user meets. 3 and 6 are consistency debt that
grows with every new surface. 4 and 5 are the one genuinely *structural*
question. 8 and 9 are small and arguably fine as they are.

**What PR #127 changed.** It took group B — the consistency group (3, 6, 8, 9) —
and left group C exactly where this audit put it. It also fixed two LAYOUT faults
that are not in this audit's numbered findings because this audit was about
interaction rather than about geometry, and which the separate
`MD3_UI_SPECIALIST_REVIEW_2026_08` review raised: a short record title wrapping
with room to spare, and a Note's caret opening near the middle of its editor.
Those two are recorded in
[ADR-077](../decisions/ARCHITECTURE_DECISIONS.md#adr-077-interaction-consistency--one-state-layer-no-ripple-one-selection-control-one-switch-and-the-two-shared-layouts-that-were-wasting-the-laptop)
decisions 6 and 7 rather than being retro-fitted into this document's numbering.

**What PR #126 changed, and what it deliberately did not.** It took the three
control-level defects (1, 2, 7) and left everything else exactly where this audit
put it. In particular it did **not** build a navigation rail, sweep the state
layer, converge the select controls, adopt the switch or decide the ripple — those
are recorded below, unchanged, with their evidence intact. Each finding's own
section now ends with a **Resolution** or **Still open** note; nothing has been
deleted, and no counted evidence has been rewritten to make a number look
better. The `title` count in finding 2 is deliberately left at the 91 it measured,
with the current figure stated beside it.

---

## 1 — The FAB covers content and form controls · **defect, high**

**Evidence.** The Settings capture (`surface-settings`, not committed) showed
the capture FAB sitting directly on top of the **Default task destination**
combobox, covering roughly a third of the input. The Today capture at 700px
(`nav-today-medium-700`) showed it overlapping the "My day" card.

**Why it happens.** The FAB is `position: fixed` bottom-right and clears the
*navigation bar* and the home indicator — which is the phone case, and is
correct there. It does not clear anything on a scrolling desktop page, so any
content that reaches the bottom-right corner goes under it.

**Why it matters.** This is not a cosmetic overlap. A pointer user cannot click
the covered part of that combobox at all, and the control it covers is different
on every page, so nobody can learn to avoid it. M3's own guidance is that a FAB
must not obscure content: a page whose content reaches the FAB adds bottom
padding, or the FAB is scoped to the surfaces that want one.

**Related, already recorded:** [DEBT-96](../product/PRODUCT_DEBT.md) — on a phone
the FAB and the bottom bar both say "Capture", in the same corner. The audit
confirms that entry and adds the overlap, which is the more serious half.

> **Resolution — PR #126 (CAPTURE-02). Closed, and narrower than first written.**
>
> **The phone loses the button entirely.** Below `md` the bottom bar's Capture
> slot is the single global affordance and `.dh-fab` is `display: none`. That
> closes the DEBT-96 half outright, and it also closes this finding's *second*
> piece of evidence — the medium-700 frame where the button overlapped the
> "My day" card — because at that width there is now no button.
>
> **Nothing is ever trapped under the button.** `.dh-pane` reserves
> `--app-fab-band` at the END of its scroll, so the last card, task row or
> control on any page clears it, and a page that does not scroll at all never
> puts one under it.
>
> **What was tried and reverted, twice.** The stronger reading — "no control
> under the button at ANY scroll offset" — was implemented and then given up,
> because both ways of buying it cost more than the defect did.
>
> *An inline reservation on the pane* (`padding-inline-end`) worked: content
> stopped short of the button's column and nothing was ever underneath it. It was
> reverted because the bill landed on the entity galleries. Measured across
> 769/800/900/1024/1440px:
>
> | window | Areas/Projects/Goals | grid track | Projects page height |
> |---|---|---|---|
> | 900px | 1 column, was **2** | 540 → 296 | 7169px, was 4956 (+45%) |
> | 1440px | 3 columns, was **4** | 344 → 269 | 3378px, was 3068 |
>
> At 900px the second column is lost by **eight pixels** of `minmax()` boundary.
> There is no reservation small enough to be safe at every width, and making the
> shared gallery narrower to make room for the shell's button is the card system
> paying for the chrome. It also lands hardest at 840–1199dp — the window class
> findings 4 and 5 below already call starved by the 240px drawer.
>
> *Folding the band into `html { scroll-padding-block-end }`* was worse: a corner
> reserved as a full-width band changes how far every `scrollIntoView` travels,
> so each scroll overshot by 104px and pushed content up under the sticky top app
> bar — until axe's `target-size` rule failed a Goal record's breadcrumb link on
> its spacing to that bar's Search control. The navigation bar keeps its
> scroll-padding, because a band IS the bar's shape.
>
> **So the closed claim is the M3 one, stated exactly.** A floating action button
> may float over content while scrolling; what it must never do is trap it. The
> Settings combobox in this finding's own screenshot is still floated over where
> the page opens, and it can be scrolled clear — which is asserted, along with
> the fact that it is still on screen once cleared, so "scroll it clear" is a
> real remedy and not a technicality.
>
> **Evidence.** [`e2e/global-capture.spec.ts`](../../e2e/global-capture.spec.ts)
> measures rectangles rather than comparing screenshots: at 900px and 1400px, on
> Settings (General and AI), Today, Tasks, Projects and Notes, no interactive
> element's rect intersects the button's once the document is scrolled to its
> end, in light and in dark, with no horizontal overflow; a page that does not
> scroll must be clear where it opens. Three further tests pin the reversal
> itself — `.dh-pane` must carry no inline padding, and the galleries must still
> get 2/2/4 columns at 900/1024/1440px — so the trade cannot be quietly undone.
> The bulk-selection suppression rule that PR #121 added is re-sited to a width
> where the button exists and still holds.

## 2 — `title` is the only tooltip mechanism · **gap, high**

**Evidence.** 91 `title={…}` attributes on controls across `app/`; two
`role="tooltip"` elements in the entire product, neither a general mechanism.
PR #124's editor toolbar added thirteen more, so this is growing.

**Why it matters.** `title` is not a tooltip, it is a browser affordance with
three hard limits: it never appears on keyboard focus, it is unreliable on touch
entirely, and its delay and styling are the browser's. For an icon-only control
the tooltip is where the *shortcut* lives — "Bold — ⌘B" — so a keyboard user,
the exact person who wants the shortcut, is the one who cannot see it. The
accessible NAME is present (`aria-label`), so this is not a WCAG failure; it is a
usability gap that M3's plain tooltip exists to fill.

**Shape of the fix.** One shared tooltip primitive (`role="tooltip"` +
`aria-describedby`, shown on hover *and* focus-visible, dismissed on Escape),
adopted by the icon-only controls first: the editor toolbar, the card overflow
triggers, the shell's icon buttons.

> **Resolution — PR #126 (M3-TIP). Closed for the agreed adoption set.**
>
> [`app/shared/tooltip`](../../app/shared/tooltip) is the one primitive: M3's
> plain tooltip, `role="tooltip"` + `aria-describedby`, opened on hover *and* on
> `:focus-visible`, dismissed on pointer-leave / blur / press / Escape, never a
> Tab stop, never focusable, `pointer-events: none`, portalled and clamped to the
> viewport, `prefers-reduced-motion`-aware and painted with the `inverse-surface`
> pair so both appearances and forced colours are right. It adds no dependency
> and no wrapper element — it attaches to the trigger by ref, which is what let
> the editor toolbar adopt it without touching its roving-tabindex model.
> Shortcuts render through the shortcut formatter that already existed for the
> Command Palette (`~/shared/commands/shortcut`), so `Mod-b` reads as `⌘B` or
> `Ctrl+B` correctly rather than being spelled out in a string.
>
> **Adopted by:** the PR #124 editor toolbar (the reference adoption — all
> thirteen controls, `title` removed), the shared `OverflowMenu` ⋯ trigger (which
> is every EntityCard and every record header at once), the desktop top bar's
> command-palette and help controls, the account menu's compact avatar trigger,
> the phone bar's Back and Search, the capture FAB, and icon-only `CardAction`s.
>
> **Deliberately not adopted by** controls that show their own text. The audit's
> own rule was "leave `title` in place only where the control already has visible
> text", and that is what happened: the element-level `title` attributes in `app/`
> went from **12 to 6**, and every survivor is either on a control with a visible
> label (`RecordAction`, an overflow menu ITEM, a labelled `CardAction`) or on
> non-interactive supplementary text (the account menu's email, an activity
> timestamp). The **91** in the evidence above counted every `title={…}` in
> `app/`, most of which are React component props (`<EmptyState title=…>`) rather
> than HTML attributes; that number is left as it was measured, and stands at 90
> today for the same reason.
>
> **Evidence.** [`test/unit/tooltip`](../../test/unit/tooltip),
> [`e2e/tooltip.spec.ts`](../../e2e/tooltip.spec.ts) and the tooltip block in
> [`test/unit/markdown-editor/EditorToolbar.test.tsx`](../../test/unit/markdown-editor/EditorToolbar.test.tsx),
> which asserts that the toolbar still has exactly one Tab stop, that arrow
> navigation still works, and that a disabled Undo is still outside the roving
> stop.

## 3 — The state layer is one class in the docs and five patterns in the CSS · **divergence, medium**

**Evidence.** `DESIGN_SYSTEM.md` states the state layer is "implemented **once**,
as `.md-state-layer` in `base.css`, and applied by adding the class." Reality:

| | count |
|---|---|
| `.md-state-layer` applied (TSX) | 13 |
| `.md-state-layer` referenced (CSS) | 11 |
| Hand-rolled `color-mix()` hover fills on a content colour | 23 |
| `:hover` rules in `app/styles/` overall | 107 |

**Why it matters.** Not because the hand-rolled ones look wrong — they are the
same 8% of the same content colour, because their authors read the same rule.
It matters because the rule is now enforced by *convention* rather than by the
class, so the next divergence is silent: a surface that uses 12%, or that tints
the container instead of layering, will look almost right and will never fail a
test. It is also the reason the *pressed* and *dragged* opacities are largely
unimplemented outside the shared class — a hand-rolled `:hover` rarely grows an
`:active` sibling.

**Shape of the fix.** Not "convert all 107". Convert the interactive components
(buttons, list rows, menu items, nav items, chips, card affordances, the new
inline-edit trigger and editor toolbar) to the shared class, then add a test that
fails when a new `:hover` rule sets `background` on an element that also carries
an interactive role.

> **Resolution — PR #127 (M3-INT). Closed for the reusable primitives; the rest
> is a ratcheting baseline.**
>
> **The declarations now exist once.** `base.css` holds the implementation and a
> component becomes a host either by carrying `.md-state-layer` (a component that
> renders its own class list) or by being named in the host list beside it (a
> class applied as a literal string at dozens of call sites, like `.dh-btn`). Two
> routes because the alternatives were worse in both directions: requiring the
> class means editing every `className="dh-btn …"` literal; requiring the list
> puts every component's class name in `base.css` even when it already renders
> its own.
>
> **Converted:** `.dh-btn` (which carried a verbatim COPY of the shared block,
> under a comment claiming to use it), `.record-action`, `.dh-card__action`, the
> overflow menu's trigger and items, `.dh-segmented__option`, the editor
> toolbar and its Read/Write toggle, the inline-edit trigger and its block Edit
> control, the inline select's options, the account-menu links, the phone bar's
> Back and Search, and the command palette's close. Those are the audit's own
> shortlist — "buttons, list rows, menu items, nav items, chips, card
> affordances, the new inline-edit trigger and editor toolbar".
>
> **What this bought beyond tidiness.** The *pressed* state, which the finding
> predicted would be missing: `.record-action` had none at all (its variants
> restated their own container colour under `:hover` and `:active` so that
> nothing changed), and the editor toolbar's was **12%** where M3 and every other
> control in the product use 10% — the silent divergence this finding said a
> hand-rolled layer would eventually produce, already present. *Focus* joined the
> contract too, so the "hover and focus-visible get the same treatment" promise
> that DS-16 made for two components is now product-wide.
>
> **What deliberately did NOT happen.** The 107-rule sweep. Thirty-eight
> module-level hand-rolled fills remain — a Diary date-stepper, a Today widget
> control, a Search clear button — each a small local conversion with a small
> local payoff. They are frozen in
> [`test/unit/tokens/state-layer.test.ts`](../../test/unit/tokens/state-layer.test.ts)
> as a baseline that may only SHRINK: the test fails if it grows and fails if an
> entry goes stale. The number is left as measured; see `PRODUCT_DEBT.md`.
>
> **The test is deliberately narrow.** It does not ban `:hover`, `background` or
> `color-mix()` — a hover rule that lifts a content colour, firms a border or
> swaps a selected container is correct M3 and there are dozens of them. It bans
> one shape: a translucent fill at one of M3's own state opacities, on a state
> selector. Banning the primitives would produce a noisy test the next author
> routes around, which is worse than no test.
>
> **Evidence.** `test/unit/tokens/state-layer.test.ts` and
> [`e2e/interaction-consistency.spec.ts`](../../e2e/interaction-consistency.spec.ts),
> which reads the `::after` pseudo-element's computed opacity in a real browser —
> the one place the contract is observable, and a check a `background` assertion
> would have passed against a hand-rolled fill.

## 4 — No navigation rail: the medium window class gets the phone layout · **gap, medium**

**Evidence.** The Today capture at 700px (`nav-today-medium-700`, not
committed) — M3's **medium** class (600–839dp) — showed the bottom navigation
bar and no persistent navigation. `grep` finds no navigation rail in the product
(`dh-rail`/`nav-rail`: 0 files); the shell has two states, drawer and bottom bar,
switching at 48rem.

**Why it matters.** M3 assigns the medium class a **navigation rail** precisely
because the bottom bar wastes 80px of vertical space on a device that has width
to spare, and because a tablet in landscape is a pointer device where a bottom
bar is a long reach. DalyHub's own tablet band (768–1023px) is entirely inside
this class, so every tablet user gets the phone treatment.

**Honest counterweight.** DalyHub is a single-owner product whose owner
overwhelmingly uses a laptop and a phone. A rail is real work — a third shell
state, its own tests, its own screenshots — to serve a device the owner may not
use. This is a finding, not automatically a task; it deserves a decision, and
the decision may legitimately be "no rail, and here is why".

> **Still open after PR #126.** See the note under finding 5 — these two are one
> decision, and PR #126 did not take it or start it.

## 5 — A 240px permanent drawer starves the expanded window class · **divergence, medium**

**Evidence.** The Today capture at 900px (`nav-today-expanded-900`, not
committed) showed the drawer taking 240px — **27% of the window** — and the
dashboard rendering as one narrow column in the 660px that remains.

**Why it matters.** The navigation is not doing 27% of the work on that screen.
M3's answer for the expanded class is a rail (compact, icon + label, ~80px) with
the drawer reserved for large windows, which is the same fix as finding 4 seen
from the other side — one rail component would serve 600–1199dp and the drawer
would start where it earns its width.

> **Still open after PR #126.** Findings 4 and 5 are one decision and PR #126 did
> not take it. There is no navigation rail in that change and none was started
> opportunistically: it needs its own ADR, its own responsive matrix and its own
> acceptance work, and the honest answer may still be "no rail, and here is why".
> The one shell rule PR #126 *did* change at these widths is narrow and named:
> below `md`, the bottom bar's Capture slot owns global capture and the floating
> button is not shown. Nothing else about the drawer/bar breakpoint moved.

## 6 — Settings mixes native `<select>` with the shared combobox · **divergence, medium**

**Evidence.** The Settings capture (`surface-settings`, not committed) showed
**Default landing page** and **Default Tasks view** as native `<select>`
elements with browser chrome, while **Default task destination** immediately
below is the shared `SelectField` combobox with M3 outlined-field styling. Two
select presentations, adjacent, in one panel.

**Why it matters.** `DESIGN_SYSTEM.md` → Forms says "**one control per field
type**, product-wide". A native select is a legitimate choice — it is more robust
and better on mobile — but then it should be the choice *everywhere*, and it is
not. The 2026-08 selection-control audit
([`SELECTION_CONTROL_AUDIT_2026_08.md`](../product/SELECTION_CONTROL_AUDIT_2026_08.md))
found the shared combobox had a defect nobody noticed for months; a second,
undocumented select surface is how that happens.

> **Resolution — PR #127 (M3-INT). Closed, with the exception named.**
>
> **The application-style select is the shared combobox.** Every `SelectSetting`
> row in Settings (landing page, Tasks view, Diary mode, timezone, date display),
> both AI rows (default provider, result retention) and the Project record's
> Workflow status are now `SelectField`. Settings contains no native `<select>`
> at all, which is asserted rather than described.
>
> **The retained native control is a stated exception, not an oversight.** A
> **filter bar** keeps its native `<select>`: Notes, Diary, Reviews, Assets and
> Tasks each render a dense strip of controls that must stay operable on a phone
> with no JavaScript, and the native element is genuinely more robust there. That
> is the entire list, and it is now written into `DESIGN_SYSTEM.md` → Forms so
> the next surface has an answer rather than a precedent to copy.
>
> **PR #124's behaviour survived the migration, and is asserted.** An optional
> field still starts genuinely empty; reopening a control that already has a value
> still offers the whole list; another value can still be chosen directly with no
> clearing step; the current value is still not a search filter; the placeholder
> is still an attribute rather than an option. The rows still save IMMEDIATELY —
> `SelectField` is a controlled combobox rather than a form control, so the chosen
> value is carried by a hidden input and the form submitted on the next frame,
> which is the mechanism the task-destination row's own "Use Inbox" control
> already used.
>
> **Evidence.** `e2e/interaction-consistency.spec.ts` — no `select` element in
> Settings, the full option list on reopen, direct replacement, Escape restoring
> focus without changing the value, and an axe-clean panel in both appearances.

## 7 — A settings row labels its own field twice · **defect, low**

**Evidence.** The same Settings capture (`surface-settings`, not committed)
showed "Default task destination" as the row's label on the left **and** again
as the field label above the input on the right.

**Why it matters.** Small, but it is a duplicated accessible name in a settings
list a screen-reader user reads item by item, and it is the kind of thing that
tells a careful user the surface was assembled rather than designed.

> **Resolution — PR #126 (SETTINGS-LABEL). Closed.**
>
> `SettingsRow` already documented two naming patterns, and this row was using
> neither cleanly: it gave the row a label *and* rendered a self-naming field
> inside it. `SelectField` now accepts `labelledBy` (and `describedBy`), so it can
> take the row's own visible label as its name and render no second label block —
> which is the row-owned pattern the component was designed for. The name is
> still real, visible text; no `aria-label` was introduced to paper over the
> duplication, and the row's supporting copy became the control's description,
> which is what it always meant.
>
> **The neighbours were audited too.** A DOM sweep of every Settings section
> found exactly one offender — this row. The AI budget rows, the navigation
> toggles and the three native `<select>` rows all already use the render-prop
> `aria-labelledby` correctly, and the Project settings' `SelectField` row
> correctly omits the row label entirely. Nothing else was changed; this was not
> turned into a Settings redesign.
>
> **Evidence.** [`e2e/settings.spec.ts`](../../e2e/settings.spec.ts) asserts one
> visible instance of the words, one `combobox` with that accessible name, no
> `aria-label` on it, the row's description as its accessible description, an
> axe-clean General section in both appearances — and, as the thing that keeps it
> at one, a sweep over every Settings section for a row whose control repeats its
> label.

## 8 — No switch: every boolean is a checkbox · **gap, low**

**Evidence.** `BooleanField` supports `variant="switch"` and exactly **one** call
site uses it — the `/design/forms` fixture. Every real boolean in the product is
a checkbox (`type="checkbox"`: 13 files).

**Why it matters, mildly.** M3 distinguishes them by meaning: a checkbox selects
an item in a set (and usually needs a Save), a switch toggles a setting and takes
effect immediately. DalyHub's settings toggles are immediate, so they are
switches wearing checkboxes. The component already exists, so this is adoption,
not construction.

> **Resolution — PR #127 (M3-INT). Closed.**
>
> **There is now ONE switch**, [`~/shared/forms/Switch`](../../app/shared/forms/Switch.tsx),
> and it is a real `<input type="checkbox">` with `role="switch"` on top — not a
> `div` with `aria-checked`. That distinction is the whole point: the ARIA pattern
> re-implements, badly, the checked state, Space, the label association, form
> participation (`name`/`value`), `:disabled` and the whole of Windows High
> Contrast. `role="switch"` adds the one thing the native element cannot say for
> itself, which is that it is announced "on"/"off" rather than "ticked".
>
> **Adopted by** the Settings navigation toggles (immediate, no Save — M3's own
> definition of a switch) and by `BooleanField`'s `variant="switch"`, which now
> DELEGATES to the shared primitive rather than drawing a second switch out of
> `.dh-boolean__control`. The Settings panel's own hand-rolled `.dh-settings-switch`
> skin is gone.
>
> **Nothing else became a switch, deliberately.** Selection, bulk-action,
> acknowledgement and multi-select checkboxes are checkboxes because a checkbox
> selects an item within a set and usually needs a Save; making them switches
> would claim an immediacy they do not have.
>
> **A real bug fell out of testing it.** Asserting that a toggle survives a reload
> failed — and not because of the new control. The action read
> `FormData.get("visible")`, which returns the FIRST entry, and the row posts a
> hidden `visible=0` before the checkbox's `visible=1`. So it always read `0`: a
> module could be hidden from navigation and never restored from its own toggle,
> while the row reported "Saved". Pre-existing, unrelated to the switch, and fixed
> here rather than worked around in the test.
>
> **Evidence.** [`test/unit/forms/Switch.test.tsx`](../../test/unit/forms/Switch.test.tsx)
> (native semantics, both naming patterns, keyboard, form participation, the
> checkbox variant staying a checkbox) and `e2e/interaction-consistency.spec.ts`
> (≥44px target on the label, Space, persistence across a reload, thumb position
> AND check glyph so the state is never colour alone, axe in both appearances).

## 9 — No press ripple · **divergence, low, arguably correct**

**Evidence.** `ripple`: 0 occurrences in `app/`. The state layer implements hover
and pressed as an opacity change with no origin-anchored animation.

**Assessment.** M3's ripple is an *expression* of the state layer, not the state
layer itself, and DalyHub's motion principle is "restrained; motion communicates
causality, never decoration" (AGENTS.md §6). A ripple is arguably decoration
here, and it would need a `prefers-reduced-motion` path. **Recommendation: record
this as a deliberate deviation in `DESIGN_SYSTEM.md` and close it**, rather than
leave it as an undocumented absence that every future audit re-raises.

> **Resolution — PR #127 (M3-INT). Closed as a deliberate deviation, exactly as
> this finding recommended.**
>
> > **DalyHub uses Material Design state layers for hover, focus and pressed
> > interaction, and does not implement animated ripple effects.**
>
> Written into `DESIGN_SYSTEM.md` → Shape, elevation, state and motion, and into
> [ADR-077](../decisions/ARCHITECTURE_DECISIONS.md) decision 3. The reasoning is
> the one this finding already assessed: a ripple is an *expression* of the state
> layer rather than the state layer itself, it communicates nothing here that the
> pressed layer does not communicate instantly, and it is decoration under a
> motion principle that says motion communicates causality. It would also need
> per-control JavaScript, a `prefers-reduced-motion` path and its own test
> surface — machinery bought for decoration.
>
> No JavaScript ripple machinery was added. `ripple` is still 0 occurrences in
> `app/`, and that is now the documented intent rather than an undocumented
> absence for the next audit to re-raise.

---

## What the evidence says PR #125 should be

> **How this landed.** Playwright 1.62.1 took the number PR #125, so the work
> scoped below shipped as **PR #126**. The recommendation is otherwise unchanged
> and is left as it was written — it is the reasoning that produced the scope, and
> rewriting it after the fact would hide the fact that the scope was decided
> before the code. Group A (findings 1, 2, 7) is done; groups B and C are not, and
> their findings above say so individually.
>
> One decision the section below asks for **before** the work — "does DalyHub want
> a navigation rail?" — was *not* made, and the work went ahead without it. That
> was correct: the rail is orthogonal to the three control-level defects, and
> deciding it under time pressure inside an unrelated PR is exactly what findings
> 4 and 5 warn against. It remains owed.

The findings fall into three natural groups, and only one of them is a coherent
single PR.

**Group A — interaction defects and the tooltip gap (findings 1, 2, 7).** These
are things a user meets: a button covering a form control, shortcuts that only
mouse users can discover, a duplicated label. They share a theme (the product's
*controls* rather than its layout), they are independently testable, and none of
them requires an architectural decision. **This is PR #125.**

**Group B — consistency debt (findings 3, 6, 8, 9).** The state-layer sweep, the
select convergence, switch adoption, and documenting the ripple deviation. Real,
but each is a mechanical sweep across many files with low user-visible payoff
per file. Better as its own PR *after* A, when the tooltip primitive from A has
already established the "one shared primitive, adopted everywhere" pattern for
this round.

**Group C — the navigation question (findings 4, 5).** Whether DalyHub gets a
navigation rail is a product decision about which devices it serves, not a
styling task. It needs an ADR and a decision from the owner first. **It should
not be bundled into an implementation PR**, and it may legitimately be answered
"no".

### Recommended scope for PR #125

> **Control-level interaction fixes: the FAB's relationship to content, one
> shared tooltip primitive, and the settings-row label duplication.**

Concretely:

1. **The FAB stops covering content.** Decide its rule — most likely: pages whose
   content can reach it reserve the corner, and the phone case loses the FAB
   entirely in favour of the bottom bar's Capture slot (which closes DEBT-96 in
   the same change). Add an E2E assertion that no interactive element is
   overlapped by the FAB at the representative widths, so this cannot regress.
2. **One shared tooltip primitive**, shown on hover **and** `:focus-visible`,
   dismissed on Escape, wired through `aria-describedby`. Adopt it on the
   icon-only controls: the editor toolbar (13 controls), card and record overflow
   triggers, the shell's icon buttons. Leave `title` in place only where the
   control already has visible text.
3. **The duplicated settings label**, and a scan for its siblings.

Deliberately **out** of PR #125: the state-layer sweep, the select convergence,
the switch, the ripple decision, and anything about the navigation rail.

### Before PR #125 starts

One decision is needed from the owner, because it changes what gets built rather
than how: **does DalyHub want a navigation rail for tablet-width windows?** If
yes, that is its own ADR and its own PR. If no, record it as a deliberate
deviation in `DESIGN_SYSTEM.md` so this audit's findings 4 and 5 are closed
rather than perennially re-raised.

---

## Reproducing this audit

```bash
pnpm run build
CAPTURE_SCREENSHOTS=1 PLAYWRIGHT_SKIP_BUILD=1 pnpm exec playwright test \
  e2e/m3-audit-screenshots.spec.ts --workers=1
```

The counts in findings 2, 3 and 8 are `grep` over `app/` and are quoted in each
finding so they can be re-run and challenged.
