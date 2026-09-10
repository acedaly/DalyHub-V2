# Phase 4B Interaction Inventory

Phase 4B audits the interactions used by Today and Tasks against the vendored
Untitled UI Pro source and the available Untitled UI MCP examples. The product
composition remains DalyHub-owned; Untitled supplies the interaction machinery
where it can preserve DalyHub's capture and scheduling semantics.

| Interaction | Previous implementation | Untitled component or pattern | Result |
| --- | --- | --- | --- |
| Task selection | Shared DalyHub `Checkbox`, native change path with task-specific shift selection | Untitled `Checkbox` backed by React Aria | **Migrated.** The task row keeps range-selection logic outside the generic checkbox. |
| Due date | Hand-rolled `CalendarGrid` with DalyHub keyboard handlers | Untitled date-picker/calendar pattern, adapted to React Aria `Calendar` and `useCalendarCell` | **Migrated.** Presets, clear/no-date, owner-day marking, ISO values and immediate commit remain DalyHub-owned. |
| Project / area editing | DalyHub `Picker` with async bounded search and product commands | Untitled searchable ComboBox/ListBox and command-menu patterns reviewed | **Retained intentionally.** `Picker` owns Move to Inbox, selected-item retention during async search, create behavior and the exact mobile Sheet transition. Replacing it with a form-style ComboBox would weaken those workflows. |
| Priority editing | DalyHub `Menu` with radio semantics and task priority presentation | Untitled dropdown, menu-radio and command-menu patterns reviewed | **Retained intentionally.** The shared menu already provides the required keyboard/typeahead, destructive-item and mobile-sheet behavior; priority-specific color and immediate commit stay in the product composition. |
| Quick Add | DalyHub capture panel composed from shared input, menu, picker and date controls | Untitled command-menu-actions and compact input patterns reviewed; shared DalyHub capture composition retained | **Converged.** Capture remains immediate and progressive. The migrated date calendar and existing shared menu/picker provide optional enrichment without turning capture into a form. |
| Mobile sheet | Shared DalyHub `Sheet` with focus restoration, inert background, safe-area padding and keyboard inset handling | Untitled slideout/modal patterns reviewed | **Retained intentionally.** These are product-wide mobile contracts already used by capture and contextual editing; replacing the host would duplicate or risk those behaviors. |
| Empty states | Shared Untitled-compatible DalyHub empty-state composition | Untitled empty-state and command-menu empty-state patterns | **Available for consumers.** Today and Tasks retain calm, action-oriented empty states rather than decorative illustrations. |

## Untitled material searched

The MCP review covered the Pro `date-picker`, `date-picker-modal`,
`calendar-event-modal`, `dropdown-modal`, `labels-menu`, `project-details-menu`,
`command-menu-actions`, `command-menu-empty-state`, `checkbox`, `dropdown`,
`modal` and `slideout-menu` patterns. The strongest adopted implementation is
the calendar interaction: React Aria now owns focus movement, month paging,
selection state, outside-month disabling and grid semantics while the DalyHub
adapter preserves product scheduling language.

The retained `Picker`, `Menu` and `Sheet` are not visual exceptions. They carry
domain behavior that the generic Pro examples do not provide: async entity
search, Inbox as a first-class destination, capture-safe mobile presentation,
focus restoration and task-specific immediate commit. Later modules should use
these shared surfaces rather than introduce another selector or overlay.
