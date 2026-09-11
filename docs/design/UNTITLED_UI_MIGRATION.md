# Untitled UI migration guide

> DalyHub is progressively rebuilding its presentation layer around Untitled UI
> React Pro, Untitled Application UI patterns, Tailwind CSS v4 and React Aria.
> Backend, database, migrations, Cloudflare infrastructure, API contracts and
> business logic remain out of scope for this frontend reset.

## Current frontend debt

- Legacy CSS still carries `--dh-*`, `--app-*` and `--md-*` compatibility
  vocabulary.
- Some shared primitives predate Untitled adoption and should be replaced by
  Untitled source when their consumers migrate.
- Some feature components mix product decisions, presentation state and mutation
  wiring in one file, making visual migration riskier than it needs to be.
- Historical design documents and screenshots described Material, MD3, DHDS and
  bespoke DalyHub patterns; those are superseded by
  [`UNTITLED_UI_IMPLEMENTATION.md`](UNTITLED_UI_IMPLEMENTATION.md).
- Untitled-derived shell, Today and Tasks work already exists, but the remaining
  modules still need consumer-by-consumer migration.

## Reusable backend and domain logic

Preserve existing domain authorities during UI migration:

- Area -> Goal -> Project -> Task hierarchy, rollups and workspace isolation.
- EntityLinks, Activity, lifecycle, search, command and export/restore
  contracts.
- Task recurrence, dependency, blocked, waiting, priority, selection,
  scheduling, due-date and checklist semantics.
- Habit schedule chains, owner-local check-ins, no-overdue behaviour and
  no-manufactured-streak rule.
- Planning's projection over Task `scheduled_date`; no separate planning record.
- Today bucketing, overdue logic, schedule integration, quick capture and
  deterministic "what now" behaviour.
- Notes exact Markdown preservation, safe preview/rendering and dirty/save
  behaviour.
- Diary chronology and owner-timezone semantics.
- Meetings attendees, decisions, follow-through items, canonical Task conversion
  and occurrence history.
- People relationship history and privacy/care language.
- Finance signed money, privacy, import and truthful-balance semantics.
- Assets real-world status, obligations, maintenance/value facts and attachment
  boundaries.
- Life Admin obligation semantics.
- Reviews period workflow, guided review state and reflective tone.
- AI proposal architecture: propose, explain and await approval before mutation.

Durable homes for these requirements are the development module docs, product
principles and ADRs. Design migration may reorganise UI, but it must not
reinterpret the model.

## Coupled presentation/business logic

When touching a feature surface, audit for:

- route actions or fetchers embedded directly in row/card controls;
- CSS classes that encode domain state instead of receiving a typed status;
- view-local recurrence, owner-day, money or progress calculations;
- duplicated empty/error/loading copy across modules;
- per-feature overlays, menus, drawers, tabs, tables or badges that can become
  Untitled primitives plus DalyHub composition;
- keyboard/touch/focus behaviour implemented locally instead of through React
  Aria or a shared composition.

Extract only when it reduces migration risk or prevents domain drift. Do not
rewrite repositories, migrations or service contracts as part of visual work.

## Preserved requirements from removed design records

The historical design files were classified before removal:

| Source area | Preserve as product/domain behaviour | Preserve as still-valid UX | Delete/supersede as obsolete visual implementation |
| --- | --- | --- | --- |
| Tasks, recurrence and dependencies | Recurrence decides when an occurrence exists; dependencies decide whether an existing Task can proceed. Dependency links are directed EntityLinks. Blocked is derived. Dependencies never move the owner's plan. Recurrence uses one successor authority, owner-day strings and inclusive end-date semantics. | One blocked label should say why. Dependency rows should be concise and editable only from the blocked end. | Old screenshots, MD3 surfaces, bespoke row styling and measurement evidence. |
| Checklists | Checklist items are not Tasks, have one durable level, do not affect Project/Goal progress, clone to recurring successors with completion reset and do not auto-complete Tasks. | Checklist editing remains keyboard/touch operable; reorder only when persisted and conflict-aware. | Old checklist visuals and custom drag presentation. |
| Habits | A Habit is a behaviour, not a recurring Task. It never goes overdue, never creates Task rows, belongs to an Area and may support a Goal, uses effective-dated schedules and owner-local check-ins. No manufactured streaks, guilt scores or red miss states. | Compact checkable rows, week/history context, Today band below the day's work, and clear "not scheduled today" language. | Old habit table/card visuals and screenshot-based layout measurements. |
| Planning | Planning stores no separate record; a Task's `scheduled_date` is the plan. The queue and day placement use existing Task mutation authority. Habits are context, not plannable Tasks. | Board/list composition may change, but it must stay responsive, keyboard reachable and honest about day placement. | Visual-reference rebuild notes, old rail dimensions and screenshot measurements. |
| Today | Today is execution before dashboard: first useful task, next real meeting, today's plan, schedule, habits, goals/attention and relevant activity. It does not invent task times, focus timers, workload scores or AI rankings. | The first viewport answers "what do I do now?" and mobile order follows product priority. | Command-centre screenshots, duplicate visual audits and old dashboard-card arrangements. |
| Goals | Goal progress remains truthful: explicit completion, measurable progress, Project contribution, recent movement and supporting Habits are distinct facts. | Goal surfaces should show status, milestones, progress, activity and next action without hiding unmeasured Goals. | Old bespoke Goal cards, identity palettes and chart treatments. |
| Projects / Areas | Projects are finite; Areas are ongoing. Rollups and spine hierarchy remain authoritative. | Shared lists/tables/cards, progress, status, filters, tabs and drawers. | Old spatial/gallery visual systems and convergence screenshots. |
| Notes | Notes preserve exact Markdown source, safe preview and writing-first reading space. | List-detail composition, search, metadata, tags and responsive collapse. | Old document-column styling and visual reference records. |
| Diary | Diary is date-led, chronological and reflective. | Content-first layout and calm capture/edit paths. | Old typography/surface experiments. |
| Meetings | Meetings prioritise outcomes: date/time, participants, summary, decisions, actions, tasks, notes, transcript and attachments. | Detail layouts should make follow-through visible without turning minutes into clutter. | Old meeting surface styling and bespoke status pills. |
| Capture | Capture is universal, fast and canonical: capture first, enrich later, route through existing authorities. | Global capture and contextual add actions remain reachable on desktop and phone. | Old duplicate capture panels and screenshot-specific placement. |
| Offline/PWA | Offline support keeps a minimised, owner-scoped capture/task model with honest limitations and recovery paths. | Mobile install/offline states should be clear and calm. | Old mobile visual frames and reference screenshots. |
| Product Experience | DalyHub remains a calm personal operating system with stable navigation, direct manipulation, progressive disclosure and no dead ends. | One shell, one row grammar, contextual overlays, record/drawer patterns and accessible mobile behaviour. | Material/MD3/DHDS token architecture, old theme experiments and visual north-star screenshots. |

## Migration phases

Preferred order:

1. Theme/tokens/foundation.
2. Shared Untitled primitives.
3. Application shell.
4. Today.
5. Tasks.
6. Goals.
7. Projects / Areas.
8. Meetings.
9. Notes / Diary.
10. Habits.
11. People.
12. Finance / Assets / Life Admin.
13. Reviews.
14. Reports / Insights.
15. AI Assistant.
16. Settings.
17. Remaining secondary/admin surfaces.
18. Remove remaining legacy UI/styles.

Each phase should migrate a coherent consumer set, verify behaviour, then delete
the displaced legacy UI. Do not run a broad frontend rewrite as one change.

## Phase 1 baseline: foundation and shell

Status: implemented as the shared platform for later page migrations.

Untitled references selected:

- Application UI page template `dashboards-01/05`: sidebar dashboard template
  with `mobile-header`, `nav-account-card`, `nav-item`, `nav-list`,
  `sidebar-simple`, `featured-cards` and related configuration.
- Application UI component `slideout-menu`: React Aria ModalOverlay/Modal/Dialog
  layer for mobile navigation.
- Application UI component `command-menu-actions`: selected as the reference for
  future command-menu presentation; DalyHub's existing command/search behaviour
  remains in place for this phase.
- Base components already imported into DalyHub: `button`, `button-utility`,
  `avatar`, `avatar-label-group`, `dropdown`, `modal`, `table` and `cx`.

Untitled documentation consulted:

- React introduction;
- installation and CLI workflow;
- Vite integration;
- theming and brand colour variables;
- dark mode;
- typography;
- icons;
- sidebar navigation components;
- slideout menu components;
- command menu components;
- dropdown/component documentation where user-menu fit was evaluated.

Implemented foundation:

- `app/styles/untitled/untitled.css` is the single Tailwind v4 entry point and
  imports Untitled theme/base/utilities inside explicit layers.
- `app/styles/untitled/theme.source.css` is the vendored Untitled theme input.
  `scripts/generate-untitled-theme.mjs` emits the DalyHub-adapted
  `theme.css`, re-anchoring Untitled's brand ramp to DalyHub purple and bridging
  Untitled dark-mode selectors to DalyHub's SSR `data-appearance` decision.
- `vite.config.ts` uses `@tailwindcss/vite`, matching Untitled's Vite setup.
- `app/shared/shell/AppShell.tsx` is the one authenticated reusable shell.
  Existing route children render inside it unchanged while feature pages migrate.
- Desktop navigation remains persistent and registry-driven.
- Phone navigation keeps DalyHub's bottom-bar priority model and opens the
  complete navigation inside Untitled's `slideout-menu` React Aria overlay.
- The account trigger uses Untitled's `Avatar` primitive while retaining
  DalyHub-specific appearance and sign-out behaviour.

Temporary compatibility:

- Existing feature pages still use legacy `app/styles/*.css` and historical
  `--dh-*`, `--app-*` and `--md-*` compatibility tokens.
- Search, command palette, notifications, capture and feature content are hosted
  by the shell but not visually rebuilt in this phase.
- The workspace kernel currently persists scope identity rather than a display
  name; the shell therefore keeps DalyHub/product identity as the honest visible
  fallback until a real workspace-display field exists.

## Phase 1.5 baseline: shared shell primitives

Status: implemented as a narrow bridge after the application shell foundation.

Untitled references used:

- Application UI component `command-menu`: reference for the global command and
  search modal geometry, overlay treatment, command input anatomy, result list
  density and keyboard-shortcut affordance.
- Application UI component `page-headers`: reference for the shared DalyHub page
  header grammar: title, supporting text, optional status/meta, actions, tabs or
  filters without forcing every slot onto every page.
- Existing imported Untitled components:
  `application/command-menus/base-components/command-input`,
  `base/buttons/button`, `base/buttons/button-utility`, `base/avatar/avatar`,
  `base/tooltip/tooltip`, `application/app-navigation/base-components/nav-list`,
  `application/app-navigation/base-components/nav-item`,
  `application/app-navigation/base-components/nav-account-card` and
  `application/slideout-menus/slideout-menu`.

Implementation notes:

- `SearchSurface` and `CommandPalette` now use Untitled's command input and
  button primitives for shell-level presentation while preserving DalyHub's
  existing controllers, shortcuts, result grouping, command execution, recents,
  search privacy rules, stale-result inertness and route/drawer destinations.
- The old `app/styles/search.css` shell stylesheet was removed. Search result
  hooks remain in markup as stable test/product-semantic hooks, but the generic
  chrome is now Tailwind/Untitled-token driven.
- The command-surface section of `app/styles/command.css` was removed. That file
  now keeps only the shared keyboard-shortcuts reference styles still consumed
  by the app-wide help sheet and legacy Today drawer.
- `PaneHeader` now carries the shared Untitled/Tailwind page-header composition
  in source and keeps its broad slot grammar for migrated pages.

Remaining shell compatibility:

- `PaneHeader` still keeps the `.dh-pane-header*` class family because legacy
  collection layouts and feature CSS target those selectors. Remove those
  selectors only when Today/Tasks and the other collection surfaces have adopted
  Untitled-native header/layout primitives.
- Search and command surfaces still reuse DalyHub's drawer focus, scroll-lock
  and inertness hooks to preserve tested focus restoration and background
  inertness. Replace that compatibility layer only when a React Aria/Untitled
  overlay can preserve the exact command/search behaviour.
- `NotificationBell`, global capture and keyboard-help sheets remain
  product-specific shell compositions. They should migrate underneath to
  Untitled primitives as their own narrow phases, without changing notification,
  capture or shortcut semantics.
- `AppearanceSelector` is still a shared account-menu/Settings form with
  `.dh-appearance*` and `md-state-layer` styling. It persists real preference
  data and is intentionally retained until Settings can migrate with the same
  control, so the account menu and Settings do not diverge.

MCP/catalogue note:

- The Untitled MCP/component catalogue was queried for command menus, page
  headers, sidebar/mobile navigation and application templates during this
  phase, but the service returned HTTP 429. The phase therefore relied on the
  genuine Untitled source already imported into DalyHub plus the official docs
  pages for command menus, page headers, sidebar navigations, theming, dark mode,
  components and introduction.

## Phase 2 baseline: Today

Status: implemented as the first feature-surface migration after the shared
shell foundation. This phase does not redesign Tasks, Meetings, Goals, Notes or
any other feature page.

Untitled source and patterns used:

- Shared `PaneHeader` page-header composition, based on Untitled Application UI
  page-header and dashboard header grammar.
- Existing genuine Untitled-backed `Button` for capture and Goal check-in
  actions.
- Existing shared `TaskRow`, `TaskList`, `ProgressTrack`, `GoalProgressReadout`,
  `HabitRow`, schedule tabs and DalyHub activity/trend composition. These are
  product compositions that already use the appropriate Untitled primitives or
  preserve domain-specific interaction contracts.
- Untitled semantic tokens and Tailwind v4 utilities for neutral surfaces,
  purple brand interaction, borders, typography, focus, responsive grid and
  dark mode.

The implementation preserves Today product behavior: server-side owner-local
date/greeting, bounded and independently degrading reads, canonical task
completion and inline-edit routes, task drawers, schedule day selection and
event drawers, goal check-ins, habit check-ins, shared capture, keyboard help,
attention facts, review-door behavior, offline-safe loading boundaries and
honest empty states. No schema, API, authentication, workspace or business
logic changed.

The old Today stylesheet was replaced rather than carried forward. The new
file is a small Tailwind/Untitled composition layer. Legacy class names remain
only where they are semantic/test hooks or where child product components still
publish their established contract. The remaining compatibility boundary is
the shared task/schedule/habit/goal component styling and the global keyboard
help/capture/drawer machinery; those belong to later focused migrations.

Untitled MCP access was retried after successful CLI Pro authentication and
again returned HTTP 429 / Cloudflare 1015. No unavailable Application UI name,
source snippet or screenshot was fabricated. The exact official documentation
topics consulted and the fallback source workflow are recorded in
`UNTITLED_UI_IMPLEMENTATION.md`.

## Phase 3B: Tasks completion

Tasks remains a behavior-preserving presentation migration. The route loaders,
canonical `/tasks/:taskId` and `/tasks/bulk` mutations, optimistic updates,
keyset pagination, saved views, search/filter URL state, offline queue,
recurrence, dependencies, checklists, assignment, priorities, due/scheduled
dates, board/sectors presentations and drawer URL state were audited and left
unchanged.

The surface reaches genuine Untitled-backed `Button`, `Input` and `Badge`
implementations for creation, search, filter triggers, active filters and task
status. Existing shared `Checkbox`, `Menu`, `SelectField`, `DateField`, `Tabs`,
`Sheet`, `Drawer`, `EmptyState` and form compositions remain the
behavior-bearing boundary. The primary task collection deliberately remains a
semantic list rather than being coerced into the generic Untitled table because
task rows have inline domain editors, selection-mode replacement, touch
completion/scheduling gestures, waiting and blocked facts, and optional
persisted drag destinations. This is a documented DalyHub composition above
Untitled primitives, not an unreviewed legacy table.

Catalogue references selected during the phase were Pro `dashboards-01/02` and
`dashboards-01/09`, plus `table`, `filters-menu`, `project-details-menu` and
`command-menu-actions`. The official Introduction, Theming, Dark mode,
Buttons, Checkboxes, Filter bars, Drawers, Tables and Tabs documentation was
consulted. CLI authentication succeeded and the MCP/catalogue reported
`has_pro_access: true`; no paid source was recreated from memory.

No new generic primitive was created. This pass removed no whole stylesheet:
the established task-row/list stylesheet family (`task-list.css`,
`task-signals.css`, `task-drawer.css`, `task-checklist.css`,
`task-dependencies.css`, `tasks.css`) and shared collection/form compatibility
selectors remain because Today, Projects, Planning, Reviews and other active
surfaces consume the same task compositions. Generic control presentation was
moved to genuine Untitled source where suitable; the remaining selectors are
layout, product semantics, test hooks or compatibility debt and should be
removed only after their other consumers migrate.

### Tasks final structural pass

The ungrouped `/tasks` list now uses the genuine React Aria-backed Untitled
`TableCard`, `Table.Header`, `Table.Head`, `Table.Body`, `Table.Row` and
`Table.Cell` structure adapted from Pro Application UI `dashboards-01/02`.
Pinned task views use Untitled `Tabs`/`TabList`/`Tab`; the view and filter
controls occupy that example's responsive filter-toolbar structure; empty
states use Untitled's compound empty-state anatomy; cursor loading adapts the
Untitled `PaginationCardMinimal` footer without inventing page numbers; bulk
actions use the shared Untitled-backed buttons; and the drawer uses Untitled
slideout header anatomy, `CloseButton`, `Content` and `Footer` around the
existing URL/focus stack contract.

Tasks no longer consumes the legacy `dh-tasklist`, `dh-tasklist__rows`,
`dh-taskrow`, `dh-taskrow__cell`, `dh-taskrow__meta`, `dh-taskrow__main`,
`dh-taskrow__actions`, `dh-viewtabs` or `dh-viewtabs__tab` structures in its
standard ungrouped list. Those classes remain for Today, Planning, Projects and
the domain-specific grouped/board presentations until their own migrations.

## Dependencies

- Licensed Untitled UI React Pro source and configured discovery workflow.
- Tailwind CSS v4 theme/token foundation.
- React Aria Components behaviour and accessibility contracts.
- Existing DalyHub test fixtures, seeded flows and module docs.
- Documentation link checking after deleting historical design files.

## Risks

- Copying Untitled Application UI too literally can produce generic SaaS screens
  instead of DalyHub surfaces.
- Leaving old and new primitives side by side too long can create interaction
  drift.
- Migrating presentation without extracting typed domain state can duplicate
  business logic in components.
- Removing historical files without preserving domain rules can erase product
  intent.
- Screenshot-led migration can resurrect obsolete Material/MD3/DHDS decisions.

Mitigation: follow the authority hierarchy, preserve behaviour first, test the
real flow and delete old UI only after consumers are migrated.

## Testing

For each migrated surface, verify:

- unit coverage for extracted pure/domain helpers;
- route/action tests for preserved mutation and loader contracts;
- component tests for visible behaviour, keyboard paths and accessible names;
- Playwright or equivalent flow coverage for high-value journeys;
- 393px and 320px responsive checks for user-facing interaction surfaces;
- light and dark appearances;
- no horizontal overflow;
- docs link check when documentation changes.

## Definition of done for a migration phase

- Untitled Application UI and component sourcing is recorded in the PR.
- Existing product/domain behaviour is preserved or an ADR explicitly changes it.
- Generic controls come from Untitled source where available.
- DalyHub-specific behaviour lives in a composition above the primitive.
- Light/dark, keyboard, touch, focus and responsive behaviour are verified.
- Legacy CSS/components displaced by the phase are deleted.
- Documentation and inbound links are updated.
- No backend/database/business logic changed unless the roadmap item explicitly
  required it.

## Criteria for removing legacy UI

Remove a legacy component, stylesheet, token group, screenshot or document when:

- no active consumer imports it;
- tests cover the replacement behaviour;
- docs point to the Untitled authority or durable domain docs;
- any retained product requirement is captured in product, development, ADR,
  design direction, design system or this migration guide;
- it exists only to explain Material, MD3, DHDS, old CSS/token architecture,
  abandoned redesign briefs, old audits or screenshot evidence.

Git history is the archive. Do not keep obsolete design files merely for
reference.
