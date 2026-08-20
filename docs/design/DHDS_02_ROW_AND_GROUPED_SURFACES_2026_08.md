# DHDS-02 — Rows and grouped surfaces

**Status:** implemented
**Governing direction:** [`DESIGN_DIRECTION.md`](DESIGN_DIRECTION.md), especially
Interaction model, Tasks, and Plan and Schedule
**Parent package:** [`DHDS_01_WORK_PACKAGE.md`](DHDS_01_WORK_PACKAGE.md), Phase 3
items 1–2

## Outcome

DalyHub now has one operational-row reading model across its daily-driver
surfaces. A Task is not reinterpreted by the page drawing it, grouped work is not
rebuilt from local heading/count markup, and a dense agenda does not permanently
advertise every secondary action.

This is a refinement pass, not a domain change. It preserves every route,
mutation, field and accessibility name while reducing the amount of chrome a
person must repeatedly scan.

## The row contract

### Task anatomy

Desktop:

1. completion or selection control;
2. title and compact signals;
3. **when** — due date, or planned date only when no due date exists;
4. **where** — Project or Area;
5. **importance** — P1–P4;
6. exceptional workflow state only;
7. one overflow control.

The metadata sequence is also the DOM sequence. CSS may change the composition
at a responsive tier, but it must not create a different reading order for a
sighted user and a screen-reader user.

Phone:

- line one is completion, title and overflow;
- line two is **when · where … importance**;
- the title may use two lines, then clamps;
- metadata truncates before the title loses its useful measure;
- inline edit targets retain the coarse-pointer floor without visibly inflating
  the row;
- swipe remains an accelerator for controls that still exist in the row.

### Operational rows that are not Tasks

Meeting, calendar and directory rows keep their domain-specific leading object
(time, avatar or entity mark), but inherit the same restraint:

- primary content owns the flexible width;
- supporting content is one quiet line where practical;
- state is a word plus any semantic colour, never colour alone;
- one destination or primary row action is obvious;
- secondary actions use the shared reveal contract;
- sibling separation is one hairline owned by the list.

Do not force calendar events or People into `TaskRow`. Convergence means a shared
interaction grammar, not erasing useful domain differences.

## Contextual action reveal

`data-dh-action-context="true"` marks the row and `.dh-action-reveal` marks the
secondary action container or control.

On a hover-capable pointer:

- secondary actions are opacity-hidden at rest;
- they reserve their intended geometry, so revealing them causes no layout
  shift;
- hidden actions do not intercept pointer input;
- hover anywhere on the row reveals them;
- focus anywhere inside the row reveals them;
- an expanded menu remains visible after focus moves into the menu;
- the action stays in the accessibility tree and remains keyboard reachable.

On touch:

- actions remain visible because hover is unavailable;
- their hit targets retain the product's touch floor;
- no hover-only capability is introduced.

In forced-colour mode, actions remain visible. The contract is implemented once
in `app/styles/base.css`; module styles may position an action for their own
geometry but must not reimplement its visibility state machine.

Current consumers:

- `TaskRow` — Today, Tasks, Inbox and Weekly Planning;
- `RecordRow` — shared dense record directories;
- `ScheduleList` — Today, Tomorrow and Next 7 Days agenda rows.

## Grouped-list contract

A group is a navigable section containing:

1. one disclosure target;
2. one plain-language group name;
3. one authoritative count;
4. an optional “View all N” destination;
5. the homogeneous rows belonging to it.

The group heading is not a status banner. Overdue meaning belongs on each Task's
date; the group may expose its tone as data for accessibility and tests but does
not paint the whole section red. The count is an annotation, not a badge.

`TaskGroup` owns this anatomy for grouped Task collections. The Tasks workspace
and Weekly Planning queue both consume it. Plan no longer copies the same
heading/count markup under private class names. Collapse is local view state and
uses `hidden` rather than unmounting, preserving pending edits and optimistic
state.

The parent layout still owns spacing and placement:

- Tasks can render groups as a flat vertical list, board columns or time-sector
  columns;
- Plan can place the same groups in its narrow “Still to place” rail;
- the child TaskList remains responsible for row density and reflow.

## Module effects

| Module | Shipped effect |
| --- | --- |
| Today | Planned work uses the canonical Task order and contextual overflow; schedule-note actions no longer add permanent third-line noise on pointer devices. |
| Tasks | Every flat, grouped, board and sector row follows one metadata and action contract. |
| Inbox | Inherits the Tasks workspace contract; unset values remain quiet until engagement. |
| Plan | Board cards retain their compact card composition; the placement queue adopts shared TaskGroup disclosure/count behaviour and canonical row order. |
| Schedule | Time stays the dominant scan axis; “Open notes” becomes a contextual trailing action on pointer and remains explicit on touch. |

## Accessibility and interaction acceptance

- DOM and visual metadata order agree.
- Action reveal uses opacity, not `display: none` or `visibility: hidden`.
- Opacity-hidden pointer actions cannot intercept clicks.
- Focus reveals the same action as hover.
- Touch and forced-colour modes never depend on hover.
- Group controls expose `aria-expanded` and `aria-controls`.
- Collapsed group bodies stay mounted and leave the accessibility tree through
  the native `hidden` attribute.
- Priority and state retain text/icon semantics; colour is not the sole signal.
- Existing canonical Task mutations and optimistic patches are unchanged.

## Regression evidence

`test/unit/ui/row-surface-convergence.test.ts` fixes the architectural boundary:

- Task metadata source order and grid columns are **when → where → importance**;
- TaskRow, RecordRow and ScheduleList all opt into the shared action contract;
- Tasks and Plan both consume `TaskGroup`;
- Plan cannot silently restore its private queue-band heading.

Existing Playwright contracts continue to cover no-shift hover reveal, keyboard
focus, touch target size, phone Task reflow, schedule actions and cross-surface
Task editing. Visual capture remains part of the PR evidence contract whenever a
browser runtime is available.

## Rejected alternatives

- **A universal row component for every entity:** rejected. It would replace
  meaningful time/avatar/completion anatomy with slots and conditional props.
- **CSS-only Task metadata reorder:** rejected. It makes assistive and visual
  reading orders disagree.
- **Permanent desktop action buttons:** rejected. They turn a dense collection
  into a toolbar repeated once per record.
- **Hover-only actions:** rejected. Touch and keyboard access are requirements,
  not fallbacks.
- **Local Plan group markup:** retired. A second rendering of the same grouping
  semantics guarantees future drift.
- **One card per Task row:** rejected for list surfaces. Stable axes and one
  hairline provide structure with materially less chrome.

## Follow-on boundary

DHDS-02 deliberately stops before Panel/drawer/inspector convergence, the next
item in Phase 3. Record drawers may consume these rows, but their header,
sectioning, sticky actions and mobile sheet composition remain a separate pass
so the row change stays reviewable.
