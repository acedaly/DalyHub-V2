# DalyHub redesign implementation brief

This document captures the redesign prompt and its Part B specification as the
active implementation brief for the current whole-product visual migration.

## Authority

- The main redesign prompt owns direction: DalyHub is no longer an MD3 product,
  and the target is a calm, premium, personal productivity application.
- Part B owns numbers: tokens, row heights, priority mapping, component states,
  module acceptance criteria, migration mechanics and test additions.
- `AGENTS.md` and later ADRs still govern architecture, security, accessibility
  and repository workflow.

## Hard requirements

- Remove active MD3 visual language from product UI.
- Keep working business logic, routes, APIs, schemas and accessibility behavior
  unless a UX change requires adjustment.
- Migrate through shared primitives before individual screens.
- Use the connected-D mark as the product identity.
- Use one priority system: flag icon, P1 red, P2 orange, P3 blue, P4 grey.
- Map legacy stored `null` priority to UI Priority 4 until an explicit data
  migration changes persistence.
- Hide P4 in ordinary task rows; show P4 in pickers, filters and detail panels.
- Use tokens for every colour, size, radius, shadow, duration and z-index.

## Task list

1. Create and maintain `docs/md3-inventory.md` until active MD3 hits are zero.
2. Install the Part B token set and keep legacy token names as a temporary shim.
3. Convert priority to a single `PriorityFlag`/picker contract.
4. Restyle shared primitives: Button, IconButton, Input, Textarea, Select,
   Popover/Menu, Tooltip, Tabs, Switch, Toast, Skeleton, EmptyState, ErrorState.
5. Rebuild AppShell, Sidebar, MobileNav and PageHeader on the new frame.
6. Migrate task foundations: TaskRow, TaskCheckbox, QuickAdd, DetailPanel,
   filters, selection, undo and offline/failure states.
7. Apply the shared system across Today, Inbox, Upcoming, Tasks, Projects,
   Goals, Areas, Notes, Diary, Meetings, People, Analytics, Settings, Search and
   command palette.
8. Verify at 1440, 1280, 820 and 390px, including keyboard, reduced motion,
   accessibility, popover clipping and priority colour consistency.

## Open decisions before Phase 3

- Confirm DalyHub remains single-user for this redesign.
- Decide whether Focus time is captured; otherwise remove Focus time surfaces.
- Confirm whether Productivity score has a defined formula; otherwise remove it.
- Decide the product destination for Assets.
- Decide whether calendar integration is read-only or two-way.
- Decide whether priority persistence stays `null` for normal or migrates to `4`.
