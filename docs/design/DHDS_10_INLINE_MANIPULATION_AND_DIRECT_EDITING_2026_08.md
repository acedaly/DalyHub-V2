# DHDS-10 — Inline manipulation and direct editing

**Status:** implemented. Branch `claude/dhds-10-inline-manipulation-lemd0a`.
**Date:** August 2026.
**Extends:** [`DHDS_01_WORK_PACKAGE.md`](DHDS_01_WORK_PACKAGE.md),
[`DHDS_08_MOTION_AND_INTERACTION_GRAMMAR_2026_08.md`](DHDS_08_MOTION_AND_INTERACTION_GRAMMAR_2026_08.md)
and
[`DHDS_09_FLOATING_SURFACES_AND_CONTEXTUAL_CHOICE_2026_08.md`](DHDS_09_FLOATING_SURFACES_AND_CONTEXTUAL_CHOICE_2026_08.md).

DHDS-08 decided how a surface **moves**. DHDS-09 decided what a floating
surface **is** and when each one is used. DHDS-10 decides **which values are
changed where they are shown** — and, just as importantly, which are not.

It introduces no motion, no floating surface, no domain concept and no mutation
path. Everything it does is composition of what the two phases before it built.

---

## 1. The product outcome

> **If the owner can safely change a small property where they are already
> looking at it, DalyHub should usually let them change it there.**

Not:

```
open record → locate field → edit → save → close → recover the collection
```

but:

```
see → click/tap → choose → continue
```

The collection stays where it was. The scroll position stays where it was. The
owner stays in context.

```
Tomorrow  → click → Friday
P3        → click → P1
Inbox     → click → DalyHub
Planned   → click → Active
No Area   → click → Home & Property
```

**And the hard counterweight, which matters as much:** direct manipulation does
not mean every visible value gets a border and a dropdown arrow. At rest the
interface stays quiet. §4 is the mechanism that keeps it that way, and §16 is
the acceptance test.

---

## 2. The grammar — three classes of edit

Every editable property in DalyHub is one of exactly three things. Deciding
which one it is *is* the design work; everything after that is composition.

### A. Immediate toggle

**Use when:** the choice is binary and reversible.

**Interaction:** tap → optimistic change → Undo where reversal has real value.

**Never** open a menu for a binary decision.

| Where | Control |
|---|---|
| Task complete / reopen | the row's leading check circle |
| Habit check-in | the row's own control, one tap |
| Goal milestone complete | the milestone's checkbox |
| Task checklist item | the item's checkbox |

### B. Contextual choice

**Use when:** the value is one of a small enumeration, or one record out of
many.

**Interaction:** press the value → DHDS-09 surface → choose → the value changes.
Desktop gets the anchored surface; a phone gets the canonical sheet. Same
options, same order, same ids, same domain action.

| Option set | Surface | Field |
|---|---|---|
| CLOSED and small (priority, status, horizon, repeat preset) | `Menu` | `InlineSelectField` |
| A record out of many (Project, Area, Goal) | `Picker` | `InlinePickerField` |
| A calendar day | `Popover` + `DateChoice` | `InlineDateField` |

**Never** open a full record editor for one of these.

### C. Inline text edit

**Use when:** a short textual property can safely be edited in context.

**Interaction:** a deliberate entry into edit mode → edit in place → Enter
commits, Escape cancels, blur commits *unless an error is showing*.

**Never** turn every label into an accidentally editable field, and never edit
long-form content outside its own editor.

| Where | Control |
|---|---|
| Task title, on a row | `TaskTitleEditor`, entered from the row's overflow → Rename |
| Any record's title | `InlineTextField` in the record heading (DS-16/EDIT-02) |
| An Asset's location | `InlineTextField` on the record's fact sheet |
| A Goal's definition of done | `InlineTextField multiline` — explicit Save/Cancel |

---

## 3. The shared primitives

DHDS-10 added **one field** and **one presentation axis**. Everything else was
already there and is reused.

`~/shared/inline-edit` is the one place a value becomes editable:

| Field | The choice it makes | The surface it opens | Phase |
|---|---|---|---|
| `InlineTextField` | a short line of text | an input, in place | DS-16 |
| `InlineSelectField` | one of a CLOSED set | DHDS-09 `Menu` | DS-16 / DHDS-09 |
| **`InlinePickerField`** | **one record out of many** | **DHDS-09 `Picker`** | **DHDS-10** |
| `InlineDateField` | a calendar day | DHDS-09 `Popover` | DS-16 / DHDS-09 |

They all share `InlineEditShell` (the read affordance and the frame) and
`useInlineEdit` (the state machine, the superseded-reply guard and focus).

### Why `InlinePickerField` had to exist

DHDS-09 built two ways to choose a value contextually and DS-16 wired exactly
one of them to a mutation. `Menu` had a field over a server save;
`Picker` was reachable from a field only as a **hand-off** — it closed the menu
and asked the caller to open something.

So every relationship whose option set is the whole workspace ended in the same
place: a Drawer. The Task row's "Search all Projects and Areas…" opened the
Task's **record**. A Project's Area lived behind the Settings tab's form. That
is the exact interaction this phase exists to remove.

`InlinePickerField` is `InlineSelectField`'s shape over `Picker` instead of
`Menu`: an immediate save, a refusal that keeps the previous value and states
the server's reason, focus returned to the value, and the phone sheet inherited
from DHDS-09.

### It owns no domain mutation

The precedent `TaskMetaControls` set holds without exception: **shared UI works
over values and actions; canonical domain mutation stays with the owning
layer.** No field in `~/shared/inline-edit` performs a fetch, holds a cache or
knows a domain rule. Every `onSave` posts through the owning module's trusted
server action, and validation, workspace scoping and Activity stay server-side
(`AGENTS.md` §17).

### Two shared components changed, and one surface gained a prop

- **`Picker` gained `keepOpenOnSelect`.** A caller whose `onSelect` starts a
  SAVE cannot let the surface close on the click: the host's state machine only
  accepts a result while the field is open, so closing first drops the pending
  state and — the part that matters — the refusal. `InlineSelectField` had the
  same rule for its menu and solves it the same way.
- **`InlineSelectField.searchAction` became `escapeAction`.** One name for one
  grammar: the last row of a choice hands off either to the searchable picker
  (the set is bounded and the rest is elsewhere) or to a real editor (the set is
  complete for the common case and the uncommon one is a composition). Same row,
  same roles, same behaviour.
- **`Card` and the record header's context line declare
  `data-dh-action-context`**, so a `meta` field is quiet wherever it is
  composed, without each surface deciding for itself.

---

## 4. `presentation="meta"` — the rule that stops this becoming a spreadsheet

The phase's whole visual thesis is one prop.

```
default  the value, its caret and its empty invitation are all drawn.
         A record's summary is a handful of facts the owner came to look at.

meta     the VALUE stays. The caret and the empty invitation become DHDS-08
         reveal elements, so a fifty-row list carries no chevrons and no
         column of "Not set" at rest.
```

Pass `meta` wherever the field sits in a **run of values being scanned** — a
collection row, a record's context line, a card's meta line. Pass nothing
where the field *is* the point of the screen.

**The reveal is DHDS-08's, not a new one.** The caret and the empty label are
`.dh-action-reveal` elements inside the surrounding `data-dh-action-context`
row, so they fade in with that row's `⋯` button, on the product's one curve,
and inherit everything that contract already guarantees: they occupy their
geometry at rest so nothing shifts, `:focus-within` reveals them for the
keyboard, a touch device is simply given them, and forced colours draw them
unconditionally. DHDS-10 adds no motion of its own.

Three things `meta` does and nothing else:

1. the affordances join the reveal;
2. the **value never hides** — a row that blanked its dates until hover would
   be unreadable, which is the opposite of the point;
3. a **floor on the hit area**: 24px in both axes (WCAG 2.2 §2.5.8) on a fine
   pointer *with* hover, and the product's full 44px everywhere else. Quiet is a
   property of the paint, never of the target.

That last clause is stated as an opt-out for a reason. A first cut declared 24px
unconditionally and took every metadata control on a phone from 44px to 24px —
measured on the Asset record at 393px, and a `target-size` failure on a surface
with no other way to change the value. A surface that genuinely cannot afford
44px of *ink* extends the hit area instead of shrinking the target: the Task row
does exactly that with a pseudo-element, which is why its rows stay 24px tall on
a phone and are still 44px to a thumb.

### Where the rule used to live

Scoped to `.dh-tasklist`, in `task-list.css`. Every one of its declarations is a
property of "this value is METADATA", not of "this value is on a task row" —
which is precisely why the Project record's context line and the Assets overview
would have grown loud versions of the same field the moment they became
editable. It is now declared once, in `inline-edit.css`, and a new adopter
inherits the restraint instead of having to remember it.

---

## 5. Inline versus the Inspector — the boundary, stated

| | Inline | Inspector / Drawer / record |
|---|---|---|
| **For** | a two-second decision | understanding and deeply editing a record |
| **Scope** | one value | the whole record |
| **Cost** | zero navigation | a navigation, and the collection's place |

**Use the deeper editor when** multiple dependent fields must be configured
together, explanation is required, destructive implications exist, validation is
complicated, long-form content is involved, recurrence is advanced, or the
operation has concurrency implications.

**Common choice inline. Complex configuration deeper.** A contextual surface may
end with `Custom…`, `Edit details…` or `Manage…` opening the established
editor — that is the escape hatch, and it is a `menuitem` among `menuitemradio`s
so a screen reader is never told the field is "set to Custom…".

Two rules follow, and both are load-bearing:

- **Do not duplicate every Inspector field onto a row.** A row carries the facts
  a list is scanned by; the record carries the rest.
- **Do not require the Inspector to change tomorrow to Friday.** If the row can
  state the value, the row can change it.

---

## 6. Task grammar — the benchmark

Tasks are the most refined implementation of this in the product. The metadata
order is unchanged and remains **when → where → importance**.

| Property | Row | Record | Quick Capture | Class |
|---|---|---|---|---|
| Complete | ✔ check circle | ✔ | — | A |
| Title | ✔ overflow → Rename | ✔ heading field | ✔ the input | C |
| Due date | ✔ `DateChoice` | ✔ planning section | ✔ | B |
| Planned date | ✔ (when there is no due date) | ✔ | — | B |
| Project / Area | ✔ bounded menu + searchable picker | ✔ searchable picker | ✔ | B |
| Priority | ✔ the canonical four | ✔ | ✔ | B |
| Horizon, commitment | — (row overflow → record) | ✔ | — | B |
| Repeats | signal only | ✔ presets + `Custom…` | — | B |
| Delegation, dependencies, checklist | — | ✔ | — | deeper |

### Which Task surfaces are editable, and why

| Surface | Inline metadata | Inline title | Reason |
|---|---|---|---|
| `/tasks`, `/inbox`, `/upcoming` | full | ✔ | the collection you file and tidy from |
| Today | full | ✔ | where the working day is actually run (§9) |
| Plan (weekly) | full | ✔ | where a week is read and tidied |
| Project → Tasks tab | date, priority | ✘ | the parent is fixed by the surface; renaming belongs where filing happens |
| Task record (Drawer) | every property | ✔ | it is the record |
| Quick Capture | date, priority, parent | n/a | the title *is* the input |
| Global search | ✘ | ✘ | §12 — search navigates |
| Deleted view | ✘ | ✘ | every mutation on a soft-deleted Task is invisible |
| Archived Project's tasks | ✘ | ✘ | archived is read-only until restored |

Renaming from Today and Plan is the change most visible to an owner: it existed
only on `/tasks`, from a ~110-line editor declared privately inside
`TasksWorkspace`, while Today and Plan drew the *same* shared row over the *same*
Tasks and simply had nothing to put in its `titleEditor` slot.

### Due date

The canonical `DateChoice` (DHDS-09), with the product's own presets from
`taskDateShortcuts` — Today, Tomorrow, This weekend, Next week — the product's
own month grid, and "No date" as a first-class outcome rather than an error
state. There is no second date parser and no second preset vocabulary.

The row updates immediately where the mutation architecture supports it
(ADR-086: a patch is the client's guess, and the announcement waits for the
server). No page refresh, no scroll loss.

### Priority

One vocabulary, from `TASK_PRIORITY_OPTIONS`, everywhere:

| | Meaning | Colour |
|---|---|---|
| **P1** | urgent / highest | red |
| **P2** | high | orange |
| **P3** | medium | blue |
| **P4** | default / low | neutral |

A stored `null` **is** P4 (CONTROL-01), so there is no fifth state and no clear
command. A source-level test fails the build if any surface spells its own
priority list.

### Project / location

The bounded menu opens first, because for the overwhelming majority of
workspaces it holds every Project and Area and its typeahead is faster than a
round trip. Its last row — "Search all Projects and Areas…" — now opens the
shared searchable `Picker` **over the row's own cell**, against the same bounded
`/tasks/parent-options?q=` endpoint the create form uses.

It previously opened `?drawer=task-move:<id>`, i.e. the Task's whole record, for
a one-value decision. The drawer key still resolves — a bookmarked URL must keep
working — but no field opens it.

`intent=set_parent` is the one authority: it unlinks and relinks in one atomic
mutation, re-validates the destination inside the workspace, and EntityLinks are
never touched from UI code.

### Parent / subtask

Reassignment is choice-based and goes through the same `set_parent` intent,
which carries the domain's own cycle prevention and self-parent refusal.
Client-side validation is a courtesy, never the protection. Spatial reparenting
is **DHDS-11**.

### Recurrence

The ordinary answers are inline on the record — `Does not repeat · Daily · Every
weekday · Weekly · Monthly · Yearly` — from `RECURRENCE_PRESETS`, writing the
rule `ruleForPreset` defines. `Custom…` opens the full editor, which is on the
same record and is unchanged.

Two rules the control keeps, both from TASKS-12:

- an **advanced rule is never a preset**. A rule with an interval, a weekday
  pin, an ordinal, a weekend rule or an end condition keeps its own words
  ("Every 3 months", "14 days after completion"); reporting it as plain
  "Monthly" would let the next interaction silently drop the ordinal;
- choosing a preset over an advanced rule **clears** the advanced part, because
  `ruleForPreset` states every advanced field at its absent value.

The recurrence architecture is otherwise untouched: no simplification, no second
authoring path, and the editor still owns the composition.

---

## 7. Relationship picker grammar

Wherever one record links to another and the semantics are equivalent, the
interaction converges on the same searchable `Picker`, through
`InlinePickerField` or a direct composition:

| Relationship | Where it is now inline | Endpoint |
|---|---|---|
| Task → Project / Area | the Task row, and the Task record | `/tasks/parent-options?q=` |
| Project → Area / Goal | the Projects table's parent cell | `/projects/parent-options?q=` |
| Task → dependencies, waiting-for | the Task record | existing target endpoints |
| Meeting → People, Note → records | the entity-link picker (DHDS-09) | existing |

**Shared interaction does not mean identical domain semantics.** Each picker
still names what it is choosing ("Project or Area", "Area or Goal"), and each
posts its own module's intent.

**Performance is part of the grammar.** A picker mounts only while it is open,
and asks for its first page then — `onOpen` on `InlinePickerField`, or the
component simply not existing until the surface is. A forty-row table costs zero
requests until an owner opens one of them, and then exactly one.

---

## 8. Status grammar, and status badges versus editable metadata

These are different things and must not be confused.

- A **status badge** is a small bounded container for a state whose condition
  genuinely matters — a Project's "At risk", an Asset's "Active", a Task's
  "Waiting". It says what the record *is*.
- **Editable metadata** is a value that reads as text and becomes interactive on
  engagement. It says what the record's property *is set to*.

A badge does not become editable just because the value behind it is. On the
Project and Asset records the header's badge is a **precedence** — Archived →
Completed → the workflow status — and the *context line* carries the editable
fact. Turning the badge into a control would mean offering "Planned / Active /
On hold" on a record whose state is "Completed".

At rest, therefore:

- ordinary metadata is text- and icon-led;
- user tags keep the compact tag treatment;
- high-value semantic states may use restrained badges;
- priority uses the established compact language (a flag and two characters).

**Never a wall of coloured capsules.**

---

## 9. Module adoption

### Tasks — §6.

### Today

The strongest beneficiary, and the phase's acceptance surface. From Today an
owner can now complete, rename, re-date, re-prioritise and re-file a Task, plus
everything the row's overflow already carried, with **zero record navigations**
(asserted — §14). Nothing was added to the page's resting state: every one of
those affordances is revealed by engaging with a row.

### Plan (weekly)

Inline renaming, and the same inline Project picker. Placement stays the row's
own day items — a keyboard-reachable list of the days the surface actually
drew — because that is PLAN-01's capability and DHDS-11's drag would be an
accelerator over it, never a replacement.

### Projects

| Property | Where | Class |
|---|---|---|
| Title | record heading | C |
| Workflow status | the record's context line, when the workflow status is the live fact | B |
| Area or Goal | the collection table's parent cell | B |
| Complete / reopen | the record's primary action | A |
| Archive / restore / delete | the overflow, with confirmation | command |

The record's context line keeps the Area and the Goal as **links**, and §11
records why.

### Goals

| Property | Where | Class |
|---|---|---|
| Title, target date, definition of done | the record (EDIT-02) | C / B / C |
| Target date | **the Goals workspace pane** — the surface a Goal is now read from | B |
| Milestone completion | the measurement section's checkbox | A |
| Completion | the record's primary action | A |

**Progress is not editable, and must not become so.** A Goal's status is derived
from its measurements and its Projects; the way to change it is to record a
measurement or complete a milestone. DalyHub will not grow a manual percentage
to make a bar clickable. Goals have no status enumeration in the product model,
and DHDS-10 did not invent one — §13.

### Assets

| Property | Where | Class |
|---|---|---|
| Title | record heading | C |
| Real-world status | the record's context line | B |
| Location | the record's fact sheet | C |
| Area | the record's fact sheet | B |
| Purchase, warranty, meter, renewal | the Details form | deeper |

The Asset record was the product's clearest remaining property sheet: eight
read-only rows with one "Edit details" link opening a form of eighteen fields.
The two an owner actually moves — *where it is kept* and *which part of life it
belongs to* — are now edited where they are stated, through the same
`intent=update` the form posts, with one field in the body.

The money, the dates and the meter stay in the form. Their validation and their
units belong together, which is exactly §5's rule.

### Areas

Deliberately conservative. An Area is a durable context, not a mini Project: the
name is editable in the record heading and nothing else was added. Area rows are
not covered in interactive badges.

### Habits

Check-in is already the simplest interaction in the product — one tap, no menu —
and stays exactly that. Cadence stays in the schedule editor: timezone and
cadence semantics are protected by the domain and the kernel, and DHDS-10 moves
no scheduling logic into presentation.

### Meetings

Status stays a set of **commands** in the overflow (Mark completed, Reopen,
Cancel, Return to planned), and that is deliberate: cancelling a Meeting is a
consequential state change rather than a metadata choice, and the four
transitions are not a symmetric enumeration. Agenda and notes are untouched —
they have explicit conflict protection and an autosave contract, and §5's
"operations with concurrency implications" rule keeps them there.

### Notes, Diary

Conservative by design. These are document surfaces: direct manipulation belongs
to the metadata *around* the document, not to the writing surface. Titles are
already inline; nothing permanent was added to the editor. The editor still
disappears while writing.

### People

Conservative. A Person record should feel warm, not administrative. The name is
inline; contact details stay in the record editor, where the error risk is
higher and the fields belong together.

---

## 10. Behaviour contracts

### Desktop

- editable metadata gains a restrained hover wash — a state layer, never a
  border;
- the pointer cursor appears only where the element genuinely acts like a
  control;
- **hover never moves surrounding content**: the caret occupies its geometry at
  rest, which is why the reveal is an opacity change and nothing else;
- no chevron is required after every datum, and in `meta` there is none at rest;
- secondary affordances reveal through the DHDS-08 action grammar.

One composition consequence, worth stating because it recurs: a `meta` field at
the **end** of a wrapping run costs nothing for its reserved caret; in the
**middle** of one the reserved space reads as a double gap before the next
separator. Put the editable state last in a context line — which is also the
"identity first, state after" order the Project and Asset records now share.

### Keyboard

| Key | Contextual choice | Inline text |
|---|---|---|
| Enter / Space | opens the surface | — |
| Enter | — | commits |
| Escape | closes, restores focus to the value | cancels, restores the previous value |
| Arrows | operate the canonical `Menu` / `Picker` pattern | — |
| Tab | leaves the surface | continues logically through the row |

Focus **always** returns to the value the surface was opened from — on cancel,
on commit and on refusal — because a control that drops focus on `<body>` sends
the next Tab to the top of the document. Selection never moves focus anywhere
unexpected. No shortcut added here conflicts with the existing Task-row set: the
fields are ordinary buttons in the row's own tab order.

### Mobile

- a tappable metadata value meets the 44px floor, by ink or by an extended hit
  area (§4);
- DHDS-09 converts every contextual choice to the canonical sheet;
- the sheet's common actions sit within thumb reach and its search field is
  sticky, so the software keyboard cannot cover it;
- editing a title causes no horizontal overflow — verified at 393 and 320;
- an **unused** dimension is blank on a phone rather than a placeholder: the
  whole trigger goes, because a zero-width invisible button would leave a 44px
  hit area floating over its neighbour.

### Mutation, optimism and Undo

- one canonical mutation path per property; no second client cache and no second
  mutation framework;
- a patch is the client's **guess** and survives only until the loader answers or
  the write is refused (ADR-086);
- announcements, Activity and any claim of success wait for the server;
- **no success toast for a small edit.** The changed value is the confirmation.
  Undo and toasts are for moves and destructive-ish changes, where reversal has
  real value;
- a save in flight does not change the row's geometry. Many optimistic
  mutations need no visible busy state at all.

### Refusal

An inline interaction must never become a way to hide an error.

- the previous, truthful value stays on screen;
- the owner's typed text is kept;
- the server's own message is announced (`role="alert"`), never a generic one
  where the server gave a reason;
- the surface **does not close** on a refusal — which is why `Picker` gained
  `keepOpenOnSelect`;
- retry is possible, and nothing fails the whole page;
- a locally-queued offline change is never reported as saved (PWA-12).

### Accessibility

- every editable value is a real `<button>` — never a clickable `<span>`;
- the accessible name is `<field>: <value>`, so a screen reader hears which
  field pressing it would change;
- `aria-haspopup` states what actually opens: `menu` for a menu, `dialog` for a
  picker or popover, and the phone's sheet carries no stale `aria-controls`;
- `aria-expanded` on the trigger, selection on the option;
- read-only values render as plain text with no tab stop — a value that cannot
  be changed must not look like one that can;
- forced colours draw every revealed affordance unconditionally;
- reduced motion is DHDS-08's contract, inherited unchanged.

---

## 11. Deliberate exceptions

Each of these looks like a missed migration and is not.

| Not inline | Why |
|---|---|
| A Project record's Area and Goal | On a row the parent is metadata; on a record header it is the way UP the hierarchy. A record that cannot reach its own parent in one press is worse than one whose parent takes an extra step to change. It is one gesture from the collection table and from Settings. |
| A Meeting's status | Cancelling is a consequential state change, not a metadata choice, and the transitions are commands rather than a symmetric enumeration. |
| Meeting agenda and notes | Explicit conflict protection and an autosave contract (§5). |
| An Asset's money, warranty, meter | Dependent fields with shared validation and units. |
| Habit cadence | Timezone and cadence semantics are domain-protected; presentation must not author them. |
| Global search results | Search navigates. Opening the record remains the way to edit from a result. |
| A Goal's derived progress | It is computed. Edit the underlying truth — a measurement or a milestone. |
| Anything destructive | Delete, permanent delete, destructive restore and archive-with-prerequisites stay menu-plus-confirmation flows. DHDS-10 removes friction, not safeguards. |
| A Task row's overflow "Move to Project or Area…" | It is the phone path for a Task with no parent, whose metadata trigger a phone drops, and the deeper home for everything else about the Task. |

---

## 12. Search, and what DHDS-10 did not touch there

Global search results primarily **navigate**. Where a result is a canonical Task
row the row behaves as it does elsewhere, but search was not turned into an
editing surface and opening the record stays the way to make a deeper change.

---

## 13. Deferred domain gaps

Recorded rather than invented. Every one of these is a *missing domain
capability*, and DHDS-10 is an interaction pass.

- **A Goal has no status enumeration.** A Goal is complete or not, plus derived
  alignment and derived measurement status. "On track / At risk / Stalled" is
  not DalyHub's vocabulary and this phase did not add one. See `PRODUCT_DEBT.md`.
- **A Goal's Area cannot be changed.** There is no `move` intent on the Goal
  mutation route, and adding one is a spine change rather than an interaction
  one.
- **Tags have no canonical model** (DEBT-182, carried from DHDS-09). Tags are
  per-module free text, not a first-class entity, so there is nothing for a
  shared tag picker to pick from. The picker architecture is ready for one the
  day the model exists; inventing a tag subsystem here would be exactly the
  uncontrolled schema expansion this phase forbids itself.
- **A Project has no description field**, so there is no short text to edit
  inline on a Project card (carried from REDESIGN-04).
- **A picker option's accessible name includes its supporting text.** The
  support is `aria-describedby`, but it is also a DOM descendant, so the name
  computation walks it. Fixing it means giving every option an explicit
  `aria-label`, which is a DHDS-09 machinery change. Recorded as debt.

---

## 14. Validation

### Gates

`format:check`, `lint`, `typecheck`, `scheme:check`, `icons:check`,
`dhds:check`, `build`, `test:unit`, `test:kernel`, `e2e:partitions:check` — all
green. Unit: 445 files / 6299 tests. Kernel: 178 files / 2839 tests.

### Behavioural coverage added

**Unit**

| File | Protects |
|---|---|
| `test/unit/inline-edit/inline-picker-field.test.tsx` | the surface it declares, what a choice posts, what a refusal leaves behind, focus return, the clear command, and that it costs no request until it opens |
| `test/unit/inline-edit/meta-presentation.test.tsx` | the affordances join `.dh-action-reveal`, the VALUE never does, and the control's semantics are identical either way |
| `test/unit/tasks/task-title-editor.test.tsx` | Enter, Escape, blur-with-an-error, an empty title, a server refusal that keeps the words, and never claiming success for an unsent request |
| `test/unit/tasks/task-recurrence-control.test.tsx` | the preset round trip, an advanced rule keeping its own words, `Custom…` writing nothing, and an existing rule keeping its anchor date |
| `test/unit/ui/dhds-10-inline-grammar.test.ts` | the source-level contracts below |

**The regression contracts** — each verified to FAIL when the contract is
broken, not merely to pass today:

1. the `meta` presentation is declared in `inline-edit.css` alone;
2. no stylesheet rebuilds the caret reveal with its own opacity toggle;
3. no module grows a second inline title editor;
4. no metadata field opens a record Drawer;
5. no control spells its own priority, project-status or asset-status
   vocabulary;
6. every inline choice opens on a DHDS-09 surface;
7. the reveal contexts stay declared on the card, the row and the record header.

**End-to-end** — `e2e/dhds-10-inline-manipulation.spec.ts`, 13 journeys:

- the acceptance workflow (§15), asserting **zero record navigations**;
- server truth after reload for date, priority and Project, including removing a
  date and the Inbox round trip;
- the escape hatch opens a Picker without navigating;
- a populated list draws **no** chevrons at rest, and reveals them on engagement;
- keyboard: open, arrow, Escape, focus return, and a persisted choice;
- a Project's parent from the collection table; a Goal's target date, with the
  derived status confirmed *not* editable;
- the phone sheet at 393 and 320, at the touch floor, with no overflow;
- a refused save keeps the value the record actually has.

Timing is by visible state and by persisted server state. There are no sleeps.

### Pre-existing failures, with evidence

Three E2E tests fail alongside this work and **reproduce identically on
`0f768c8`** (the DHDS-09 merge commit), with the same errors, run in isolation
on the same seeded database:

- `projects.spec.ts` — "New Project: the parent picker searches the server for
  an Area";
- `today-task-convergence.spec.ts` — "completes and reopens, and `/tasks` agrees
  both times";
- `today-task-convergence.spec.ts` — "swipes right to complete, left to
  schedule".

They are not this change's, and this change does not fix them.

### Defects this phase found and fixed

- **the coarse-pointer touch floor** (§4) — found by the phone journey;
- **a hydration failure on the Goals workspace**: the pane's context line
  wrapped an inline field in a `<p>`, and the HTML parser closes a paragraph
  when it meets the field's `div`, so the server markup and the client tree
  disagreed and React discarded the subtree;
- **a stranded option qualifier**: `.dh-option__labels` is a column, so the
  field menu's `margin-inline-start: auto` right-*aligned* the "Project" /
  "Area" qualifier without bringing it onto the label's line. Every Project
  option was two lines tall, and in the phone sheet the qualifier sat ~200px
  from the name it qualifies. Found by looking at the frames.

---

## 15. The acceptance tests

### Visual (§48 of the brief)

> Viewing a populated Task list at rest — does this still look like a
> beautifully composed task list, or like a row of dropdown controls?

`docs/design/assets/dhds-10-2026-08/tasks-rest-{light,dark}.png` is the answer,
and `tasks-hover-*` beside it is the argument: the capability is latent until
the owner engages with a row. The E2E suite asserts the same thing as a number —
zero visible carets at rest, more than zero on engagement.

### Interaction (§49 of the brief)

> Open Today. Change a task from tomorrow to today; change its priority; move it
> into another Project; correct its title; complete it. Count the navigations.

**Zero**, and it is asserted rather than claimed: the journey listens for main-
frame navigations away from `/today` and fails if there are any.

---

## 16. Visual evidence

`docs/design/assets/dhds-10-2026-08/`, captured by
`e2e/dhds-10-inline-screenshots.spec.ts` (opt-in:
`CAPTURE_SCREENSHOTS=1`). Every frame exists in **light and dark**, and every
surface is photographed twice — at rest and engaged with — because the
difference between those two frames *is* the phase.

| Frame | Shows |
|---|---|
| `tasks-rest-*` | §15's visual acceptance test |
| `tasks-hover-*`, `tasks-focus-*` | the same row engaged with, by pointer and by keyboard |
| `choice-date-*`, `choice-priority-*` | the two closed choices, anchored to the value |
| `choice-project-menu-*` | the bounded menu, with its qualifier on the line |
| `choice-project-picker-*` | the escape hatch, in place |
| `title-editing-*` | inline renaming, with the row's geometry unchanged |
| `today-rest-*`, `today-hover-*`, `today-choice-*` | Today, manipulated without leaving it |
| `project-record-rest-*`, `project-status-choice-*` | a record's own metadata as a control |
| `asset-record-rest-*`, `asset-area-choice-*` | the property sheet that became editable |
| `projects-table-rest-*` | a collection table that is editable and still reads as a table |
| `phone-tasks-rest-*` | the phone list at rest: no chevrons at all |
| `phone-date-sheet-*`, `phone-project-sheet-*` | DHDS-09's canonical sheet adaptation |
| `phone-title-editing-*` | inline text on a phone, with room for the keyboard |
| `phone-asset-rest-*`, `phone-asset-status-sheet-*` | a non-Task record's choice, on a phone |

The frames were **looked at**, which is the only reason this section can be
trusted — and looking at them is what found the stranded qualifier in §14.

---

## 17. Phase boundaries

| Phase | Scope | State |
|---|---|---|
| **DHDS-08** | Motion and interaction grammar | done |
| **DHDS-09** | Floating surfaces and contextual choice architecture | done |
| **DHDS-10** | Inline manipulation and direct editing | **this phase** |
| **DHDS-11** | Drag, reorder and object continuity | not started |

**DHDS-10 chooses through interaction. DHDS-11 manipulates spatially.**

Nothing here adds drag-and-drop. Parent reassignment is choice-based on purpose;
spatial reparenting, reordering and cross-surface object continuity are
DHDS-11's, and taking them early would have meant shipping a second placement
model before the first one was complete.

---

## 18. The rule for future work

> **A second way to change a value is a bug.**

Compose `InlineTextField`, `InlineSelectField`, `InlinePickerField` or
`InlineDateField`. Pass `presentation="meta"` where the value is metadata. Post
the owning module's canonical intent. If none of the four expresses what a
surface needs, the grammar is wrong — extend it here, in one place, with the
reason written down. Do not extend it locally.

Seven tests enforce this mechanically (§14). They exist because every divergence
this phase repaired was a copy: a title editor declared inside one module, a
quiet-at-rest rule scoped to one stylesheet, and an escape hatch that opened a
record instead of a picker.
