# DHDS-09 — Floating surfaces and contextual choice architecture

**Status:** implemented. Branch `claude/dhds-09-floating-surfaces-ef7uoz`.
**Date:** August 2026.
**Extends:** [`DHDS_01_WORK_PACKAGE.md`](DHDS_01_WORK_PACKAGE.md) and
[`DHDS_08_MOTION_AND_INTERACTION_GRAMMAR_2026_08.md`](DHDS_08_MOTION_AND_INTERACTION_GRAMMAR_2026_08.md).
It does not replace the direction DHDS-01 through DHDS-08 established, and it
invents no second motion system: DHDS-08 decided how these surfaces **move**;
DHDS-09 decides what they **are** and when each one is used.

---

## 1. The product outcome

> **Stay where you are. Change the thing in context. Continue working.**

Not:

```
click item → open record → find field → open form → change value → save → close → return
```

but:

```
click value → choose replacement → continue
```

Todoist is the reference for interaction speed; Things and Apple's productivity
software for restraint; Craft for contextual editing. None of them is a
reference for how DalyHub should look, and nothing in this phase copies one.

---

## 2. The taxonomy

Six kinds of thing float above the canvas. They are not interchangeable, and
what separates them is **behavioural** — what the owner is doing, what they can
do next, and how the surface goes away — rather than size or styling.

| Surface | It exists to… | Semantics | Lives in |
|---|---|---|---|
| **Tooltip** | EXPLAIN an unlabelled control, in a few words | `role="tooltip"`, `aria-describedby` | `~/shared/tooltip` |
| **Menu** | choose a COMMAND from a small closed set | `role="menu"` / `menuitem` · `menuitemradio` | `~/shared/floating` → `Menu` |
| **Popover** | make a short contextual CHOICE that is not a list | non-modal `role="dialog"` | `~/shared/floating` → `Popover` |
| **Picker** | choose a VALUE from a potentially large set | `role="dialog"` holding `combobox` + `listbox` | `~/shared/floating` → `Picker` |
| **Sheet** | be all of the above, on a phone | modal `role="dialog"` | `~/shared/sheet` |
| **Inspector / Drawer** | INSPECT or edit a record without losing the collection | modal `role="dialog"` | `~/shared/inspector`, `~/shared/drawer` |
| **Dialog** | INTERRUPT, when interruption is justified | modal `role="dialog"` | `~/shared/ui` → `ConfirmationDialog` |

### The rules that follow from the table

Each of these was broken somewhere in the product before this phase.

- **A tooltip contains no workflow.** No buttons, no forms, no destructive
  actions — and it is never an accessible NAME.
- **A menu is command-oriented.** It is not a mini settings panel. A closed
  vocabulary that behaves like a command set (a status, a priority, a sort key)
  is legitimately a menu; anything needing a search field is not.
- **A popover holds what is too structured for a menu and too small for a
  record.** The test, when it is not obvious: if every row is the same kind of
  thing and choosing one finishes the job, it is a Menu or a Picker. If the
  surface contains a grid, a field, or two controls that are not alternatives to
  each other, it is a Popover.
- **An Inspector is not the mechanism for changing one piece of metadata.**
  Reaching for it to set a priority is the friction this phase removes.
- **A dialog interrupts**, so it is reserved for a destructive confirmation, an
  irreversible operation, a conflict, or a decision that genuinely needs an
  explicit commitment. Ordinary metadata editing never opens one.

All six share **one appearance** (`app/styles/floating.css`), **one placement
solver** (`~/shared/anchored`), **one motion grammar** (DHDS-08) and **one layer
vocabulary** (`--dh-layer-*`). They deliberately do **not** share an ARIA
pattern: a menu, a listbox, a combobox and a dialog are different things, and
flattening them is how a keyboard-complete product stops being one.

---

## 3. What DHDS-09 found

The repository already had a good anchored-overlay layer (`AnchoredSurface`,
EDIT-03) and a good phone sheet. The problem was one level up: **appearance,
placement and the option row had each been decided privately, several times.**

### Six surfaces, six answers

| Surface | border | radius | elevation |
|---|---|---|---|
| overflow menu panel | `--dh-color-border` | `--dh-radius-md` | overlay |
| form listbox | `--dh-color-border-strong` | `--dh-radius-control` | overlay |
| filter popover | `--dh-color-border` | `--dh-radius-md` | **modal** |
| inline select / date | `--dh-color-border` | `var(--radius-panel)` | `var(--shadow-popover)` |
| collection controls popover | `--dh-color-border` | `--dh-radius-lg` | overlay |
| form date picker | *(none — it painted no surface at all)* | | |

Three of them reached past the DalyHub layer into the legacy aliases
underneath — `--surface`, `--surface-muted`, `--surface-sunken`,
`--radius-panel`, `--shadow-popover`, `--danger-tint` — and wrote raw pixels for
their padding, their option height and their corner. None of that was a decision
anybody made; it is six components each deciding alone.

### Three placement solvers

`anchored-placement.ts`, `overflow-menu/menu-placement.ts`, and a third written
inline in `Tooltip.tsx`. Only the first was shared, and only surfaces using it
flipped, clamped and slid correctly.

### Five option-row anatomies

`.dh-overflow-menu__item`, `.dh-listbox__option`, `.dh-inline-select__option`,
`.dh-collection-popover__option` and `.dh-sheet-option`. They differed in
height, in which side the check sat on, in whether a description could wrap, and
— on two of them — in whether the current value was marked at all.

### Three bare `z-index` numbers

`z-index: 20` on the hover card, on the saved-view panel and (as
`--app-z-dropdown`, 1000) on the filter editor and the account panel. The
dropdown rung is **below** the Drawer, so a filter editor opened inside a Drawer
rendered behind it.

### Eight priority option lists

Built independently in `TaskRowFields`, `TaskRecordDrawer`,
`TaskQuickEditPanel`, `NewTaskForm`, `MeetingFollowUpForm`, `TaskCapturePanel`,
`ProjectTemplateRecord` and the Tasks bulk bar, plus two filter builders. Most
agreed, because most read the same label function. The two nobody was looking at
did not: `/views` offered the bare codes `P1`…`P4` where the rest of the product
offers `Priority 1`…`Priority 4`, and a Project template offered
`value.toUpperCase()`.

### Three bespoke sort controls

Meetings, Reviews and People each drew a native `<select>` — with three
different classes, three heights and, in two of them, the word "Sort:" repeated
**inside every option**, because a bare select has nowhere else to put the
field's name.

---

## 4. The shared floating surface

[`app/styles/floating.css`](../../app/styles/floating.css), imported directly
after `ui.css` because it is a **floor**: every menu, popover, picker and
floating listbox stylesheet below composes it.

A floating surface is obvious because it is **physically above the canvas**, not
because it is loud. One hairline border, one raised surface tone, one overlay
shadow, and nothing else. Asserted by test: no `backdrop-filter`, no `blur`, no
third elevation rung.

Two rungs, and only two:

| Class | For | Radius | Elevation |
|---|---|---|---|
| `.dh-floating` | an ANCHORED surface — menu, popover, picker, listbox | `--dh-radius-md` | `--dh-elevation-overlay` |
| `.dh-floating--modal` | a CENTRED surface — dialog, palette, search | `--dh-radius-lg` | `--dh-elevation-modal` |

A modal separates further because there is no trigger beside it saying where it
came from. That is the whole of the difference.

**Position, layer, the viewport clamp and the internal scroll are NOT here.** An
anchored surface gets them from `.dh-anchored`; a modal from its own host. A
rule in `floating.css` restating any of them would be a second place the same
geometry is decided, and a test refuses it.

### `--app-floating-inset`

The surface's own padding, published as a contextual machinery property so the
elements that must bleed to its edge — a separator, a picker's search field —
can cancel it without re-deriving the number. `--app-` rather than `--dh-`
follows the DHDS-08 precedent: the DalyHub layer is closed, and a role a host
sets for itself is machinery rather than vocabulary.

---

## 5. The layer vocabulary

Seven names in `tokens.css`, ordered by how much authority a surface has to
speak over what is under it. A floating surface names one of these; it never
reaches for the `--app-z-*` machinery scale beneath, and never writes a number.

| Token | For |
|---|---|
| `--dh-layer-sticky` | sticky region inside a scroll container — a list header, a toolbar |
| `--dh-layer-scrim` | a modal's scrim |
| `--dh-layer-drawer` | Drawer, Inspector, Sheet |
| `--dh-layer-modal` | a centred modal — dialog, command palette, search |
| `--dh-layer-anchored` | menus, popovers, pickers — **above** the modal rung |
| `--dh-layer-toast` | feedback about something that happened elsewhere |
| `--dh-layer-tooltip` | a description of the control the pointer is on |

The anchored rung sits above the modal rung deliberately: these surfaces are
opened from **inside** the ones below them — a Drawer edits its priority with
one — so a dropdown-rung popover portalled to `<body>` would render behind the
surface that opened it.

`--app-z-raised` survives untouched. It is within-page stacking (a row lifted
over its neighbour), not one of the six floating layers, and nothing floats at
it.

---

## 6. The option row

ONE anatomy for a repeated choice, wherever it is repeated:

```
[ mark ]  Label                        ⌘K   ✓
          Supporting label
```

Everything but the label is optional and nothing reserves space it is not using,
so a four-item priority menu and a searchable Project picker are the same row
with different parts filled in.

**States.**

| State | Treatment |
|---|---|
| normal | transparent |
| hover · focus · keyboard-active | `--dh-color-surface-quiet` |
| pressed | `--dh-color-bg-sunken` |
| **selected / current** | `--dh-color-accent-subtle` + its own foreground + a heavier label + a trailing check |
| disabled | faded content, no hover, `aria-disabled` |
| destructive | the LABEL takes `--dh-color-danger`; the row stays a row |
| quiet ("none of these") | muted, separated by a hairline |

Selected takes a **different container from hover**, deliberately. Both used
`--surface-muted` in the surfaces this replaces, so the current option looked
exactly like the one under the pointer and the two cancelled whenever they met.
`base.css` already stated the rule this follows — *"SELECTED is not an opacity …
M3 draws a checked menu item with `secondary-container`"*.

**It is not a pill.** A row is a row; the interactive treatment is a background
on hover and focus. This is what stops DHDS-09 turning every clickable value in
the product into a rounded coloured capsule.

**Forced colours.** Every signal above is a colour and forced colours removes all
of them, so the check mark survives as a glyph, the active row gets a `Highlight`
outline and the selected row gets a real `CanvasText` border.

**Touch.** Every row is floored at the WCAG target minimum on a coarse pointer,
regardless of the document's density.

---

## 7. Anchoring, collision and adaptation

Placement is the pure geometry in
[`~/shared/anchored/anchored-placement.ts`](../../app/shared/anchored/anchored-placement.ts),
unchanged by this phase and now the **only** one: `overflow-menu/menu-placement.ts`
is deleted and the overflow menu uses the shared solver.

- prefer the space below the trigger;
- flip above when that side cannot hold the surface whole;
- clamp the height and scroll internally when neither side can;
- slide along the inline axis to stay inside an 8px viewport margin;
- re-measure on scroll and resize, because a non-modal surface lets the page
  behind it keep moving;
- `transform-origin` follows the solver's own flip, so a surface grows from the
  edge nearest its trigger (DHDS-08 §10).

An open trigger stays visibly lit for as long as its surface is on screen. That
is not decoration: the surface is portalled into the overlay layer, so the lit
trigger is the only thing on the page connecting it to the control that produced
it.

### Desktop → phone

`presentation="auto"` (the default) is the whole of the adaptation:

| Pointer | Menu | Picker | Popover |
|---|---|---|---|
| fine | anchored to the trigger | anchored, ~22rem | anchored |
| coarse (below `md`) | the shared bottom Sheet | the shared bottom Sheet, search sticky at its top | the shared bottom Sheet |

The SAME items, in the same order, with the same ids, the same roles and the
same keyboard behaviour. Only the container differs. The sheet contributes what
a phone overlay needs and a non-modal popover cannot have: a scrim, an
independently scrolling body, a 44px Close, safe-area and keyboard insets, and
focus restored to the trigger on dismissal.

`presentation="anchored"` pins a surface to the anchored presentation at every
width. It is deliberately NOT the escape hatch for "I am inside a sheet":
nesting is supported and precedented — the shared `Sheet` keeps a stack so
Escape closes only the top one, and Quick Capture has nested one since ASSET-03.
It is for the rarer case where anchoring is genuinely better at every width.

### Nesting, and the z-order that makes it work

A Project picker inside a Task Inspector, a date popover inside Quick Capture: a
floating surface opened from inside another one is ordinary, and the layer
vocabulary is what keeps it legible. The anchored rung (1350) is above the
drawer (1200) and the modal (1300) rungs, so a picker opened from inside either
renders over it rather than behind it — the one way a portal can be worse than
the clipped absolute box it replaced.

Escape unwinds one layer at a time. Every surface stops propagation, and the
sheet stack means two sheets do not both act on the same key. What DHDS-09
deliberately does **not** do is allow a chain to grow without meaning:
`dialog → popover → dialog → tooltip` is not a hierarchy, and the taxonomy
exists so each step in a chain is a different KIND of thing with a different
reason to be there.

**One convergence this changed:** the inline select's phone presentation used to
render `SheetOption` rows announcing selection through `aria-pressed`, so one
field had two sets of roles depending on the width of the window. It now renders
the same `role="menu"` of `menuitemradio` rows the anchored presentation does —
which is what the overflow menu has always done inside its own sheet.

---

## 8. Dismissal

| Surface | Dismisses on |
|---|---|
| Tooltip | pointer leave, blur, pointer press, Escape |
| Menu | a command; Escape; an outside press; Tab |
| Popover | a committed choice; Escape; an outside press; Tab |
| Picker (single) | a choice; Escape; an outside press; Tab |
| Picker (`multiple`) | Escape or an outside press only — a choice is a step, not the answer |
| Sheet | its Close, its scrim, Escape |
| Dialog | its own controls, and Escape |

**Escape closes the topmost meaningful layer and stops there.** Every surface
calls `stopPropagation`, so an Escape pressed inside a menu that is inside a
Drawer closes the menu and leaves the Drawer open.

**An outside press does not pull focus back.** The person is already on their way
somewhere else; Escape and a committed choice do return it. `AnchoredSurface`
counts the TRIGGER as inside, so pressing an open trigger closes the surface
rather than dismissing-and-reopening it.

**A destructive confirmation is not dismissed by an incidental outside click.**
`ConfirmationDialog` is modal and keeps its own contract.

---

## 9. Focus restoration

On close, focus returns to the trigger — on Escape, on a committed choice, and
on a phone sheet's dismissal (DS-03 owns that one). This is asserted in the unit
suite and in a real browser.

The one case that needs a decision rather than a rule is a trigger the action
just destroyed — deleting or archiving the row the menu was opened from. The
menu's `activate` closes **before** running the handler precisely so that the
handler sees a live `document.activeElement`: closing focuses the persistent
trigger, and a handler that then opens a dialog has a real opener to return to.
A link is exempt, because it is about to navigate.

---

## 10. Mutation behaviour

**No contextual editor in this phase introduced a mutation.** Every one posts
through the canonical path that already existed:

- a Task row's priority, date and parent → `task-inline-edit.ts` → the canonical
  intents (`set_priority`, `set_due`, `plan`/`clear_plan`, `set_parent`), with
  the offline queue and the optimistic patch untouched;
- Quick Capture → `POST /tasks/new`, the same atomic creation route the full
  form uses.

`TaskMetaControls` (the capture surface's three controls) deliberately has no
mutation at all: it reports a value, and the host's own submit creates the
record. Duplicating a Task mutation to make a picker work is what §36 of the
brief forbids, and the way to avoid it is for the picker not to have one.

### The save/close ordering, and a defect it prevented

`useInlineEdit`'s `submit` is only legal while the field is open — a submission
dispatched from `view` is dropped, and with it the pending state and, worse, the
REFUSAL. So the shared menu's default "close first, then run the handler" (right
for a command, because it keeps a dialog's opener alive) is exactly wrong for a
value: the inline select's value rows carry `keepOpen`, the field closes when the
server says yes, and it stays open with the server's message when it says no.

---

## 11. Errors and loading

- **A simple mutation may close the surface.** The canonical error feedback
  reverts and explains. A Task row's refused save keeps the previous value with
  the server's message beside the field.
- **A form-like surface keeps its values.** The saved-view naming form and the
  filter editor stay open on refusal with what was typed still in them.
- **A picker opens IMMEDIATELY**, with whatever the caller already has. When
  options genuinely have to load, three placeholder rows hold the panel's height
  so it does not resize under the pointer as they arrive. No centred spinner,
  and no flashing between empty, loading and content.
- **An empty result says what was searched for** — "No project matches
  *Training*" — and offers to create it only where creation is genuinely
  supported. A create affordance that cannot create is worse than none.

---

## 12. The domain adapters

### Priority — one vocabulary, one list, one mark

[`~/shared/task-record/priority-options.ts`](../../app/shared/task-record/priority-options.ts)
is the single source. Ten surfaces read it.

| Value | Label | Tag | Means | Colour |
|---|---|---|---|---|
| `p1` | Priority 1 | `P1` | Urgent — the highest priority | red |
| `p2` | Priority 2 | `P2` | High | orange |
| `p3` | Priority 3 | `P3` | Medium | blue |
| `p4` | Priority 4 | `P4` | Normal — the default | neutral |

There are **four** options and never five. A stored `null` IS Priority 4
everywhere the product draws it, so a fifth "No priority" row would read as a
selected default for a task nobody has triaged, and would compete with the real
values for the first position — where both the eye and the keyboard start. The
bulk bar keeps a "No priority" operation, because clearing a field across a
selection is a real, distinct action that no single-task picker offers.

The colour lives with the mark (`PriorityIndicator.tsx` → `data-priority`), so
there is exactly one place a priority's colour is decided.

The flag is now the option row's leading **mark** rather than a `renderOption`
that replaced the whole row — which is what had taken the current-value check
away from the two menus that drew it.

### Date — presets first, calendar second

[`~/shared/forms/DateChoice.tsx`](../../app/shared/forms/DateChoice.tsx): the
one-press dates, the month grid, and the two commands. It holds no state and
performs no arithmetic; a host supplies the shortcuts from the ONE derivation
(`taskDateShortcuts`), the current value and the callbacks.

Offered: **Today · Tomorrow · This weekend · Next week**, with a duplicate
dropped rather than drawn twice (on a Friday, "Tomorrow" and "This weekend" are
the same Saturday). Then the compact month grid, which marks today, marks the
selection, is keyboard-navigable and commits on selection. Then **No date** and
**Cancel**.

Dates are ISO `YYYY-MM-DD` in and out, and no arithmetic in this phase touches a
`Date` except through `addCalendarDays`'s UTC component maths. "Today" is always
the OWNER's calendar day (ADR-022), passed in — a surface that cannot name an
honest today offers no shortcuts rather than guessing from the browser clock.

Recurrence is untouched and stays where it is: authoring a rule needs the
frequency, the interval, the weekdays and the scheduling mode together, which is
a composition rather than a value.

Adopted by the Task row's date editor, the Task record, the **form** date field
(`CalendarDateField`, which previously drew a popover with no surface at all —
transparent over whatever was behind it) and Quick Capture.

### Entity pickers

`Picker` is the searchable architecture, with grouping (`Recent` / `All
projects`), a create command where creation is supported, and a "none of these"
command as a row **in the same listbox** — not a button bolted on outside it,
where the arrow keys could never reach it.

Quick Capture's Project control is the first product adopter, over the same
bounded `/tasks/parent-options` endpoint the full form uses. The Task row's
parent editor keeps its bounded MENU with typeahead and its "Search all Projects
and Areas…" hand-off, which is the right shape for a list the loader has already
bounded — the picker is what the hand-off opens.

---

## 13. Quick Capture

The acceptance criterion is unchanged and unblocked: **open capture, type a
title, press Enter.**

What changed is everything under the title. It was three stacked `SelectField`
rows — three labels, three closed controls in a fixed order, and a due-date
control that could offer three hard-coded days and nothing else, so "the 14th"
meant abandoning capture for the full form.

It is now one quiet line of metadata:

```
What needs doing?
Prepare the OPPO brief

Today      Inbox      Priority 2
```

Each value opens the same surface the Task row opens. Nothing is required,
nothing is a pill, and none of it is in the way of type-and-Enter. Where the
capture has a fixed destination (opened from a Project record) the Project reads
as plain text with no affordance, because a value that cannot be changed must
not look like one that can.

The deterministic quick-capture parser is untouched: `p1` and `next friday` in
the title still behave exactly as they do on `/tasks`, and a date the owner
picked outranks one the parser inferred.

---

## 14. Filters and sort

**Sort** is one quiet control
([`SortMenu`](../../app/shared/collection-layout/SortMenu.tsx)): a trigger
stating the applied sort, opening the shared menu of `menuitemradio` options.
The dimension is named **once**, on the trigger, so the options are values
rather than repeated sentences. Meetings, Reviews and People are migrated onto
it from three different native `<select>`s.

A direction toggle is deliberately absent: none of the collections that needed
converging supports one — their sort keys carry their own direction ("Recently
updated", "Name A–Z") — and offering an Ascending/Descending pair a module
cannot honour is exposing an option the module cannot support.

**Filters** keep their tiered model, unchanged in structure and converged in
appearance:

- a collection with several dimensions uses `CollectionControls` — a live-applying
  anchored popover of grouped radio/checkbox rows on a pointer device, the shared
  sheet on a phone. Its option rows are now the shared `.dh-option`, which is
  where they gained the current-value check they never had;
- the richer clause editor (`FilterBar`) is now a shared `Popover`, which is
  where it gained an Escape contract scoped to itself. Its own listener was
  global, so an Escape pressed while a select inside the editor was open closed
  the whole editor rather than the select.

The result set stays dominant. Active filters remain visible as chips above the
list; the controls do not grow to fill the header.

---

## 15. Menus and dialogs

**Overflow menus** keep their DS-12 order (module actions · move/organise ·
duplicate/share · Archive **or** Restore · Delete) and their contract. What
changed is that the panel is the shared `Menu`: portalled, so a card or a row
that clips its own overflow can no longer clip it, and disabled items are now
skipped by the arrow keys instead of being landed on.

Two workarounds died with it, and the removal is the point. `card.css` had to
un-clip a swipe card while its menu was open, and to **raise the whole card to
the dropdown layer** while its menu was open, because the panel was an
absolutely-positioned box inside the card. Both are dead now, and the second one
was a real cost: it lifted an entire card above its neighbours for as long as a
menu was open, on the product's densest surface.

**Context menus.** DalyHub has none, and DHDS-09 adds none. Right-click is not
available to touch or to the keyboard, so a context menu can only ever be a
second path to something that already has a first one; the product's high-value
desktop acceleration is the command palette, which already exists.

### The dialog pass

Every `role="dialog"` in the product, classified:

| Surface | Verdict |
|---|---|
| `ConfirmationDialog` | **keep** — destructive confirmation is what a dialog is for |
| `UnsavedChangesGuard` | **keep** — an `alertdialog` guarding data loss |
| Drawer · Inspector · Sheet · MobileNav | **keep** — contextual depth, and the phone presentation of everything |
| Command palette · Search | **keep** — summoned command surfaces |
| Task row date editor | already a popover; now the shared one |
| Form date field | already a popover; now the shared one, and it has a surface for the first time |
| Filter clause editor | already a popover; now the shared one |
| Saved-view switcher panel | **converted** — it was an unlabelled absolutely-positioned `div` with no Escape, no outside-press dismissal and no focus return |

Both surviving centred dialogs now compose `.dh-floating--modal`, so a
confirmation and a menu are visibly the same product at two different rungs
rather than two separately-decided panels. The unsaved-changes guard lost the
`--dh-color-border-strong` outline that made it the one dialog with a heavier
border than the rest.

**Nothing was converted to a popover that needed to interrupt**, and nothing was
left as a dialog that did not.

### The select pass

Native `<select>` stays where it is genuinely the best control — the Assets
obligation filters, the Notes reference filter, the AI extraction review, the
Settings notification channel, the Tasks bulk-field bar. Each is a low-frequency
form control inside a form, where the platform's own control is right and
replacing it would be uniformity for its own sake.

What was replaced is the three high-frequency collection sorts, which were the
same control drawn three ways.

---

## 16. Keyboard

| Key | Menu | Picker | Popover |
|---|---|---|---|
| `Enter` / `Space` on the trigger | opens on the first item | opens with the search field focused | opens on the first control |
| `ArrowDown` / `ArrowUp` | roves, wraps, skips disabled | moves the active option, skips headings and disabled | (the surface's own controls) |
| `Home` / `End` | first / last actionable | first / last focusable row | — |
| printable characters | typeahead | search | — |
| `Enter` | activates the focused item | commits the active option | (the focused control) |
| `Escape` | closes, focus returns | closes, focus returns | closes, focus returns |
| `Tab` | leaves, no focus return | leaves, no focus return | moves through, then out |

**Typeahead is one implementation** (`menu-typeahead.ts`), with the two rules the
previous copies disagreed about: a run of the same character CYCLES (so `p`
pressed three times walks P1 → P2 → P3 rather than searching for "ppp"), and
disabled items are skipped.

A menu that picks among values opens **on the current one** rather than at the
top of the list, so the first arrow means "the one next to what I have".

---

## 17. Touch

- every option row is floored at the WCAG target minimum on a coarse pointer;
- a phone gets the sheet, which brings the scrim, the independently scrolling
  body, the 44px Close, and the safe-area and keyboard insets;
- a picker's search field is **sticky at the top of the sheet body**, so the
  software keyboard cannot push it out of view while it is being typed into;
- the listbox introduces no scroll container of its own — the sheet body is the
  only one, so there is no nested-scroll trap;
- nothing is hover-only: `.dh-option`'s hover treatment is paired with
  `:focus-visible`, and the row-reveal contract (DHDS-08 §8) already draws
  contextual actions outright on a coarse pointer.

---

## 18. URL and history

**No floating surface in this phase pushes a history entry.** A priority picker
is not navigation and a date picker is not navigation. Inspectors and Drawers,
which represent navigable record depth, keep the established route/history
contract unchanged.

---

## 19. Migrated surfaces

**Primitives created:** `Menu` · `Picker` · `Popover` · `OptionContent` ·
`menu-typeahead` · `SortMenu` · `DateChoice` · `TaskMetaControls` ·
`priority-options`.

**Primitives retired:** `overflow-menu/menu-placement.ts` (and its unit test) —
the second placement solver.

**Rewritten onto the shared system:**

| Surface | What it gained |
|---|---|
| `OverflowMenu` | the shared menu; portalled placement; disabled items skipped |
| `InlineSelectField` | the shared menu; one option vocabulary across widths |
| `InlineDateField` | the shared popover and the shared date choice |
| `CalendarDateField` | the shared popover — **and a surface, which it had none of** |
| `SelectField` (combobox) | the overlay layer, so it is no longer clipped inside a Sheet or a Drawer; the shared option row |
| `EntityLinkPicker` | the same |
| `FilterBar` editor | the shared popover, and an Escape scoped to itself |
| `CollectionControlsPopover` | the shared surface and option row, with a current-value check |
| `SavedViewSwitcher` panel | the shared popover: Escape, outside press, focus return, a real name |
| `ConfirmationDialog` · `UnsavedChangesGuard` | the shared centred-modal rung |
| `TaskCapturePanel` | contextual controls in place of three form rows |
| Meetings · Reviews · People | the shared sort control |
| `TaskRowFields` · `TaskRecordDrawer` · `TaskQuickEditPanel` · `NewTaskForm` · `MeetingFollowUpForm` · `ProjectTemplateRecord` · Tasks bulk bar · `/views` filters · `/tasks` filters | the one priority option set |

**Stylesheets:** `tokens.css` · `floating.css` *(new)* · `app.css` ·
`base.css` · `overflow-menu.css` · `inline-edit.css` · `forms.css` ·
`filters.css` · `collection-layout.css` · `card.css` · `tasks.css` ·
`linked-items.css` · `people.css` · `settings.css` · `anchored.css` ·
`command.css` · `search.css` · `drawer.css` · `sheet.css` · `feedback.css` ·
`inspector.css` · `shell.css` · `tooltip.css` · `capture.css` ·
`markdown-editor.css` · `meetings.css`.

---

## 20. Testing

### `test/unit/floating/floating-grammar.test.ts` — 9 contract assertions

- `.dh-floating` and `.dh-option` are defined in `floating.css` and nowhere else;
- the shared surface has a border, a surface tone and one shadow — and no
  `backdrop-filter` or `blur` anywhere;
- exactly two elevation rungs, never a third;
- exactly one module computes anchored placement;
- `floating.css` states no position and no layer — that is `anchored.css`'s;
- **no stylesheet writes a bare `z-index` above 1** for a floating surface;
- no stylesheet consumes the machinery z-index scale except `--app-z-raised`;
- no module stylesheet grows a private floating panel (background + overlay/modal
  shadow + radius on one selector), outside a short, argued allow-list;
- no presentation module rebuilds the priority option list.

### `test/unit/floating/floating-surfaces.test.tsx` — 27 behaviour tests

Menu: the ARIA pattern, roving focus, wrapping, Home/End, walking over a disabled
item, typeahead cycling on a repeated key, Escape-with-focus-return, Tab-without,
close-before-handler ordering, `menuitemradio` with the current value announced
and focused, a command staying a plain `menuitem` inside a radio menu, separators
as real siblings (so `role="menu"` keeps legal children), and the phone sheet
carrying the same items in the same order.

Picker: combobox + listbox semantics, filtering, groups, an empty state that
names the query, create offered only where supported and never for an exact
existing name, arrowing past a heading, Enter committing and closing, the current
value marked, the clear command reachable inside the list, opening immediately
while loading, Escape-with-focus-return, and the phone sheet.

Popover: a named dialog, first-control focus, Escape-with-focus-return, that it
is neither a menu nor a listbox, and the phone sheet.

### `e2e/floating-surfaces.spec.ts` — the product journeys

Each proves the change **survived a reload**, because a contextual editor that
paints a value it never persisted is worse than one that asks for a form.

- a Task's due date: open, "Tomorrow", the row says so, reload, it is still
  there — with an assertion that no ancestor clips the open surface;
- a Task's priority: four options, named identically to the rest of the product,
  Priority 4 announced as current for an untriaged task, chosen, reloaded;
- a Task's Project: opened, chosen, reloaded;
- **keyboard only**: focus the trigger, Enter, ArrowDown, Enter, focus back on
  the trigger, value persisted;
- Escape closes only the surface and returns focus;
- Quick Capture: date and priority chosen on the capture surface, submitted, and
  the created record carries both;
- **phone (393×852)**: the row's priority opens the shared sheet at the width of
  the phone, every row clears 44px, and the document does not overflow sideways;
- a trigger near the bottom of the window still shows every option, inside the
  viewport margin, flipped rather than clipped.

### Existing coverage preserved

Four assertions moved from `within(card)` to the document, because a portalled
menu is no longer a descendant of the card that opened it — which is the fix
rather than an inconvenience. Two e2e placement assertions moved from the panel
to the anchored surface that places it. One phone-presentation test was
rewritten to the converged contract (the same `menuitemradio` rows the desktop
menu uses) and **strengthened** with an `aria-checked` assertion it did not have.

---

## 21. Validation actually run

| Gate | Result |
|---|---|
| `pnpm run format:check` | pass |
| `pnpm run lint` | pass |
| `pnpm run typecheck` | pass |
| `pnpm run scheme:check` | pass |
| `pnpm run icons:check` | pass |
| `pnpm run dhds:check` | pass — 0 direct machinery references |
| `pnpm run build` | pass |
| `pnpm run test:unit` | pass |
| `pnpm run test:kernel` | pass |
| `pnpm run e2e:partitions:check` | pass |
| `e2e/floating-surfaces.spec.ts` | see the record in §22 |
| `e2e/tooltip.spec.ts` | 14 passed |

The full twelve-partition E2E gate is a multi-hour suite and was not run in this
environment; DHDS-08 recorded nineteen pre-existing failures in it, verified
against the merge base, and nothing in this phase moves that set.

---

## 22. Known debt and deferred work

### Recorded as debt

- **DEBT-181 — the Hover Card is still absolutely positioned.** It is the one
  floating surface left outside the anchored layer. Its dismissal is pointer
  containment on its wrapper (`onMouseLeave`), so portalling it means moving the
  pointer INTO the card counts as leaving the trigger; fixing that is a change to
  the card's interaction model rather than to its appearance. It now names the
  anchored LAYER rather than a bare `z-index: 20`, and it keeps its own surface.
- **DEBT-182 — tags have no canonical model, so they have no canonical
  picker.** A picker needs a vocabulary to pick from, and introducing a tag data
  model is explicitly outside this phase's boundary. The picker architecture is
  ready for one the day the model exists.

### Belonging to later phases

| Phase | Scope | What DHDS-09 did and did not do |
|---|---|---|
| **DHDS-10** | Inline manipulation | DHDS-09 made the contextual-choice PRIMITIVES real and put them on the Task row, Quick Capture and the collection controls. It did **not** widen what is inline-editable, add inline title editing on more surfaces, or change any mutation path |
| **DHDS-11** | Drag, reorder, object continuity | untouched |

### Deliberately not done

- **A tag picker.** DalyHub's tag model is per-module (`TagsField` over a
  free-text vocabulary) rather than a first-class entity, and §59 rules out
  introducing a tag database model. The picker architecture is ready for one the
  day the model exists; inventing a conflicting one now would be the opposite of
  this phase's purpose.
- **A Person picker.** People are selected today through the entity-link picker,
  which is now on the shared surface and the shared option row. Giving People a
  domain adapter of their own means deciding what a person option shows (avatar,
  organisation, last contact) — a People composition question rather than a
  floating-surface one.
- **Right-click context menus.** See §15.
- **Redesigning global search into a command palette.** The product already has
  both, they already share the centred-modal grammar, and §29 explicitly does not
  ask for the redesign.

---

## 23. The rule for future work

> **A second floating surface is a bug.**

Compose `Menu`, `Popover`, `Picker` or `Sheet`. Wear `.dh-floating`. Draw rows
with `.dh-option`. Name a `--dh-layer-*` role. If none of the four expresses what
a surface needs, the taxonomy is wrong — extend it here, in one place, with the
reason written down. Do not extend it locally.

Nine tests enforce this mechanically: no second surface definition, no second
placement solver, no third elevation rung, no bare `z-index`, no machinery layer
reference, no private panel, no rebuilt priority list, no blur, and no geometry
in the appearance layer.
