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

## Phase 4: collections, the shared Record Layout, and the primitive sweep

Status: implemented. This phase took Projects, Areas and Goals through a
structural migration, migrated the scaffold every record surface composes, and
then retired the staged `structure` props the earlier phases introduced.

### What moved, and in what order

1. **Projects.** The table presentation became the genuine
   `application/table` composition (`TableCard.Root` + React Aria `Table`); the
   gallery card became Untitled's bounded card surface; the lifecycle rail,
   presentation toggle, search, empty states and load-more footer became their
   Untitled sources. `dh-ptable*` and `dh-pcard*` presentation was deleted.
2. **The shared Record Layout.** `RecordTabs` became Untitled's
   `application/tabs` over React Aria — retiring the largest piece of
   hand-rolled accessibility in the shared layer — and `RecordHeader`,
   `RecordSummaryBar`, `RecordAction` and the content panel took Untitled's
   page-header and card grammar. That migrated every record surface in the
   product at once: Project, Area, Goal, Note, Meeting, Habit, Person, Asset,
   Review, Obligation, Finance account, Project template and the Task drawer.
3. **`EntityCard` / `EntityRowList`.** The collection objects Areas and Goals
   are drawn from, on the same Untitled card boundary, with both phone
   compositions moved out of media queries and into the components.
4. **Goals.** Both halves of the master–detail, and both tab rails.
5. **The primitive sweep.** With every collection migrated, the `structure`
   props on `EmptyState`, `LoadMore`, `ViewTabs`, `ViewSwitcher` and
   `CollectionSearchField` were removed along with their legacy branches. That
   reached Notes, Meetings, Habits, People, Diary, Assets, Reviews, Analytics,
   Obligations, Finance and Reports without any of them changing a line.

### Stylesheets deleted

`empty-state.css`, `load-more.css`, `segmented-filter.css` (the `.dh-segmented`
stylesheet) and `view-tabs.css`, plus the `.dh-pcard*`, `.dh-ptable*`,
`.dh-ecard*`, `.dh-erow*`, `record-header*`, `record-title`, `record-status`,
`record-action`, `record-context-item`, `record-tabs*` and
`.dh-record-summary-bar*` rule families from `card-family.css`,
`record-layout.css`, `premium.css`, `projects.css`, `progress.css` and
`collection-layout.css`.

The class NAMES survive in the markup wherever a product test or an end-to-end
journey addresses them. That is the compatibility boundary this phase leaves
behind, and it is deliberately inert: every one of those selectors is now
unstyled.

### Cascade change

`base.css`'s zero-specificity native-control and link floor moved into a
`dh-floor` cascade layer, declared in `untitled/untitled.css` between Tailwind's
`base` and `components`. Unlayered CSS beats layered CSS unconditionally, so
`:where(a)` was outranking `text-primary` on migrated components — the floor now
sits where its own notes always said it did. Legacy unlayered stylesheets are
unaffected.

`.dh-csearch__*` was scoped under `.dh-csearch` for the same reason while both
structures coexisted; the legacy structure is now gone and those rules are next
to remove.

### Accessibility changes worth knowing about

These are role changes where the ARIA got stronger, not weaker, and the tests
record them:

- a URL-backed view switcher is a `tablist` of ANCHORS with `aria-selected`
  (it was a `group` of links with `aria-current`); every href, param and deep
  link is unchanged, and the `replace` history semantics ride through React
  Aria's `routerOptions`;
- the client-state switcher is a `radiogroup`, which states that the options are
  mutually exclusive instead of leaving that to be inferred from three
  independent toggles;
- a record's tab panels are now mounted one at a time (React Aria's model). The
  user-facing requirement is the same one, stated more strongly: an inactive
  tab's content is not on the page — which also means a record's Activity,
  Knowledge and Evidence tabs no longer all read on mount.

### Untitled Pro access in this environment

The MCP connector authenticated (`has_pro_access: true`) and was used for
catalogue search, page-template selection and component identification. The
Untitled CLI could not be authenticated: `npx untitledui@latest login` completes
an OAuth callback to a localhost port, which a headless remote container cannot
reach, and the connector hands back the CLI command rather than source. Free-tier
component source remained retrievable from the public component API; Pro source
came from the genuine vendored tree under `app/shared/ui/untitled/`, which the
earlier phases imported from a licensed checkout. No Pro component was recreated
from memory, and no unavailable example or snippet was invented.

## Phase 5 — the paint

Phase 4 migrated structure. Phase 5 is what proving it turned up: the structure
was Untitled's and the paint was not. `ui.css`, `premium.css` and
`collection-layout.css` are unlayered and were painting over every shared
`<Button>` in the product — fill, radius, height, border and hover. The
implementation record has the full account; the migration consequences are:

**Stylesheet sections withdrawn (scoped `:not(.dh-button)`, hooks kept)**

- `ui.css` — the whole Button paint block (base, icon insets, `--sm`, all four
  families, disabled).
- `premium.css` — `.dh-btn` and `.dh-btn--primary`.
- `base.css` — `.dh-button` left the shared state-layer host list; the legacy
  literal stays a host.

**Stylesheet sections deleted outright**

- `collection-layout.css` — `.dh-collection-controls__trigger`'s border, radius,
  background, height and type rung (it has been a `<Button variant="secondary">`
  since DS-02).
- `habits.css` — `.dh-habits__main`, `.dh-habits-card`, `.dh-habits__footer` and
  `.dh-habits__footer-link`.
- `card-family.css` — `.dh-stat`'s boundary, `.dh-stat--washed` and
  `.dh-stat--interactive:hover`.
- `today.css` — the flat `.dh-today__panel` (replaced by the Untitled boundary).

**Call sites converted**

201 raw `className="dh-btn …"` strings across 85 files, every module and every
shared component, now call `buttonClassName()` — which is rebuilt on the
vendored component's own exported `styles`. Zero `dh-btn` literals remain in
`app/`. The DOM is unchanged at every one of them.

### Accessibility notes for Phase 5

No role, name or keyboard behaviour changed. The state layer moving off
`.dh-button` removes a duplicate hover treatment, not a state: Untitled draws
hover and pressed as container changes and focus as its own 2px ring. The
`(hover: none)` touch floor still reaches the component, so the 44px coarse-
pointer target is unchanged.

## Phase 6 — Areas

Phase 4 migrated the STRUCTURE of nine surfaces and Phase 5 the PAINT. Phase 6
is the third thing neither of them reached: on Areas the primitives were
Untitled's, the paint was Untitled's, and the COMPOSITION above them was still
AREA-01's — so the page was drawn correctly and answered the wrong questions.

### What moved

1. **The Areas gallery is `AreaCard`.** Areas were the last spine collection on
   the generic `EntityCard` — the same component and the same grid UIX-02 pulled
   Projects off in favour of `ProjectCard`, so "an Area was a Project with
   renamed fields" had only ever been fixed on one side of the pair. The new
   card puts permanence ("Ongoing since Mar 2024") where a Project card puts its
   measure, and what is LIVING in the Area as a fact strip in a divided footer
   band.
2. **The Areas dense view is a real table.** `EntityRowList`'s own source stated
   the aim — "the counts are what the eye is actually comparing down the
   column" — and then drew them as prose in one flexible cell. `AreasTable` is
   the vendored `application/table` composition, the same one `ProjectsTable`
   adopted, so the spine's two collections carry one table grammar.
3. **The Area Overview shows the records.** It drew three large figures, every
   one of which the tab strip above already carried as a badge, so the summary
   band could say "1 active project is at risk" and the tab beneath it would not
   say which. It now leads with the active Projects, attention first.
4. **One Project presentation inside a record.** An Area's Projects tab and a
   Goal's each built their own `CardProps` for the generic `Card`. Both now draw
   the shared `ProjectSummaryList`, whose columns are `/projects?present=table`'s.

### Shared changes outside Areas

- `~/shared/project-list` is new: the one way a Project is drawn inside another
  record. Three consumers justify it — the Area Overview, the Area Projects tab
  and the Goal Projects tab.
- `AreaCard`/`AreaCardGrid` joined the shared card family beside `ProjectCard`,
  for the same reason it is there: the card family is product-wide.
- `EntityRow`/`EntityRowList` were deleted. Areas was their only consumer.
- `onOpenProject` was removed from the Area and Goal records. The shared row
  opens through a react-router `<Link>` — the same client-side navigation with a
  real href behind it, which the callback was not.
- `listAreaProjects` now carries the Project's own icon, colour slot and
  identity rank, so a Project drawn inside an Area wears the mark `/projects`
  draws it with. Two columns from a `project_details` join the query already
  made, plus the same window function the Projects collection computes: no extra
  read, no migration and no index.

### Stylesheets deleted

`app/styles/areas.css` in full, and its `@import` from `app.css`. Every rule in
it was module-local layout for a composition that no longer exists.

### Accessibility changes worth knowing about

- Both new tables are React Aria `grid`s, so the row and column semantics, the
  header association and keyboard navigation are the library's. Tests that
  addressed a `list` named "Goal Projects" now address a `grid`.
- Every column header carries a name, including the invisible actions column —
  an empty column header is a real axe finding and announces a row's actions
  under nothing at all.
- Each table draws its facts twice from ONE DOM: in its own column at desktop
  width, and in a quiet line under the name on a phone. Exactly one of the two
  is visible at any width, so a handset loses no fact and a desktop gains no
  duplicate. Playwright assertions on those strings need `filter({ visible: true })`.
- The Overview and Projects tab panels declare `surface="plain"`, because their
  content brings its own bounded surface. That is the documented purpose of the
  prop and removes a frame inside a frame.

### Pre-existing failures, unchanged by this phase

Three end-to-end tests fail identically on `origin/main` at 37dc37c and on this
branch, and none of them touches an Areas surface:

- `areas-goals-mobile.spec.ts:121` and `:473` — horizontal overflow on a GOAL
  record whose parent Area has a deliberately long title, at 320/390px;
- `collection-header.spec.ts:597` — a task-row overflow menu that no longer
  clamps at a 420px-tall viewport.

## Phase 7 — Goals

Phase 4 gave Goals migrated shared PRIMITIVES and recorded `goals.css` as
"keeps layout only". Phase 7 is the finding that came out of checking that
claim: the file was 1,404 lines and 173 of its declarations were background,
border, radius, shadow, font size, font weight, control height and colour —
every one of them beneath a component the product had already called migrated.
A Goal record read as a CRUD record because it was one.

### Untitled references selected and verified

The MCP connector authenticated (`has_pro_access: true`) and was used for
catalogue search, component lookup and page-template selection, including its
screenshots. The Untitled CLI still cannot be authenticated in this
environment, for the reason Phase 4 recorded and this phase re-confirmed by
running it: `npx untitledui@latest login` completes an OAuth callback to a
localhost port that a headless remote container cannot reach, `add` on a Pro
component answers "🔒 The … component requires PRO access", and the connector
hands back metadata plus that CLI command rather than source. Pro source
therefore came, as in every phase since Phase 4, from the genuine vendored tree
under `app/shared/ui/untitled/`, imported from a licensed checkout. No Pro
component was recreated from memory and no unavailable example was invented.

Page templates inspected this pass (screenshots studied, not merely listed):

- `dashboards-01/16` — a financial dashboard whose three "savings goal" tiles
  are the closest thing in the catalogue to a DalyHub Goal: a mark, a name, a
  figure and a thin bar in a bounded card. It is the grammar the Goal record's
  metric band follows.
- `dashboards-02/02` — summary metric cards in a divided band above a table
  whose rows carry progress bars and status badges. The measurement workspace's
  band-over-table order is this.
- `settings-02/13` — a plan card: title, figure, a full-width progress bar with
  its reading, and a divided FOOTER holding the one action. This is why "Log
  weight" moved out of the figure row and into its own band.
- `informational-01/13` — a record page: breadcrumb, page header, tab rail and
  split content. The Goal record's shape, unchanged from Phase 6's reading of
  it.
- `dashboards-01/06` and `dashboards-01/09` — dense status-heavy tables with
  progress columns and row actions, for the reading history.

Components used, all from the vendored tree: `application/table`
(`TableCard.Root`'s boundary and header anatomy, and its cell/head/row
classes), `application/section-headers`' `SectionLabel`,
`application/empty-state`, `application/tabs` (through the shared `RecordTabs`
and `ViewSwitcher`), `base/badges` (through `UntitledStatusBadge`),
`base/buttons` (through `Button` / `buttonClassName`), `base/checkbox`,
`base/input`, `base/radio-buttons`, `base/button-group`, `base/dropdown`
(through the shared `Menu`), `base/progress-indicators` (through the
`labelled-progress-bar` override) and `foundations/featured-icon`.

### What moved

| Surface | Untitled source | Structural change | Legacy remaining |
| --- | --- | --- | --- |
| Shared progress bar | `base/progress-indicators` via the `labelled-progress-bar` override | `ProgressTrack` was a second hand-written track at a different height, radius and track colour from the bar `ProjectCard` and `RecordSummaryBar` already drew; it is an adapter over the genuine one now. `progress.css`'s whole linear section deleted | The class names, as hooks |
| Goal row | The same bar, plus Untitled's divided list body and surface roles | `ProgressRow` was a THIRD track. `card-family.css`'s `.dh-mrow*` block and `premium.css`'s three overrides deleted — including a `:hover` background that beat the component's own unconditionally | `.dh-mrow*` names, read by three E2E specs |
| Alignment chip | `base/badges` via `UntitledStatusBadge` | A bespoke pill with its own radius, border, min-height, dot and two tone rules, on surfaces already drawing Untitled badges. `alignment.css` emptied | `data-dh-badge` / `data-tone`, unchanged |
| Goals list panel | `application/table`'s card anatomy | A bordered box with no header and a hand-painted text link at its foot became a header with its count badge, a divided body and a divided footer action | — |
| Goal pane | Untitled's in-card band rule (`border-t border-secondary`) | Four loose regions and a card-inside-a-card became bands inside ONE card; the status is the product's badge | — |
| Measurement workspace | `application/table`, `application/section-headers`, `base/badges`, `base/buttons` | The comparison, the bar, the state and the two acts stopped sharing one crowded row; the pace band, the chart and the history each became a named band | — |
| Reading history | `application/table`'s cell/head/row classes, `base/dropdown` | A `<ul>` with a labelled "Edit" and a red "Remove" per line became a table with ONE row menu | — |
| Stages | `base/checkbox`, `base/input` | Bare inputs and `.dh-input` became the genuine controls; the drag stays DalyHub's | The `SortableList` machinery |
| Measurement chooser | `base/radio-buttons`, `base/button-group` | The two bespoke controls this feature owned, in the setup sheet AND in New Goal | The card around each option |
| Link-a-Project picker | `base/input`, Untitled's divided list body | `.dh-field` / `.dh-input` repainted the control's height, radius and focus ring whatever a utility said | — |
| Project inside a Goal | `ProjectSummaryList`, unchanged | `SerializedGoalProjectItem` now carries identity, so a Project wears the same mark here as in the Projects collection | Health, deliberately — see below |

`goals.css` is 248 lines: the two-pane geometry and its phone swap, one
variable the shared scroll strip reads, two `display: contents` hooks, and one
rule placing a shared component inside a Goal's own line. Each states why it
survived.

### Deliberate decisions worth recording

**The chart stays DalyHub's, and that is a rejection rather than an omission.**
~~Untitled's `application/charts-base` is public rather than Pro, so it was
genuinely available — and it is a Recharts composition, and Recharts is not a
dependency of this product. Adding one to a Cloudflare Workers SSR bundle to
redraw a chart that already carries behaviour Untitled's has no equivalent for
— one tab stop with arrow-key stepping and a `role="status"` readout, a target
and a baseline told apart by DASH PATTERN rather than hue, and a required-path
projection drawn only when all three of its facts exist — would cost bundle
weight and accessibility to gain house style.~~ The brief's own rule still
applies: a chart earns its place by answering a question, not by being
beautiful. The rejection does not.

**REVERSED by UNTITLED-11 and [ADR-126](../decisions/ARCHITECTURE_DECISIONS.md#adr-126-a-chart-is-an-untitled-recharts-plot-on-one-shared-foundation--the-phase-7-rejection-reversed-on-measurement-and-the-behaviour-untitled-had-no-equivalent-for-kept).**
"Recharts is not a dependency" was a statement about the repository rather than
a measurement, and the accessibility half was an argument against Recharts'
DEFAULT, not against the library: `accessibilityLayer` supplies the same single
tab stop with arrow-key stepping, and the readout, the dash-pattern references
and the conditional projection are DalyHub's composition on top — they sit in
`ChartFrame` and `MeasurementTrend` now and are stated ONCE rather than per
chart. The weight was then measured: MIT, code-split, about 400 KB raw in
`assets/charts-*.js`, reaching nobody who does not open a surface with a chart.
What the original decision never priced was the duplication it preserved —
every hand-drawn plot re-deriving its own scales, ticks and domain, and
disagreeing. The Goal trend is `MeasurementTrend` on the shared foundation.

**The history table's columns follow the CONTAINER, not the viewport.** This
workspace is also the right-hand pane of the `/goals` master–detail, which at a
1024 viewport is about 350px wide. A viewport `sm:` showed all four columns
there — in a pane less than half the width the breakpoint was reasoning about —
and the table then needed a sideways scroller inside a page that must not have
one. `@container` fixes the defect rather than the symptom.

**The list panel's heading became VISIBLE.** It was `dh-visually-hidden`
because the collection's own `h1` two lines above says "Goals". That held while
the list was the whole screen; in a two-panel workspace it left the master half
unnamed while the detail half carried a title, a tab rail and four bands, so
the eye read the left column as a fragment of the right. DHDS-13's actual rule
— that the panel is not a second LANDMARK called Goals — is unchanged.

**A Project inside a Goal gets identity but not health.** Phase 6 deferred both
("extending that projection is Goals' migration, not this one"). Identity is
two columns from a `project_details` join the read was already making, plus the
rank expression `d1-project-repository.ts` uses character-for-character, so two
repositories cannot disagree about a Project's colour. Health is not: it needs
the per-Project health fact set, and a bounded page inside a record must not
start reading one per row — the same boundary Areas' collection holds.

**Two defects the recomposition surfaced.** The `/goals` pane carried no
`data-identity`, so `charts.css` painted the same Goal's trend line green on
its record and brand-purple two clicks away. And the record printed "Recent
contribution" and then "Recent contributing Tasks" directly beneath it, two
headings for one list.

### Pre-existing failures, unchanged by this phase

- `goal-measurement.spec.ts:319` — `expectMinTouchTarget` on Today's Goal
  check-in button reads 32px against a 44px floor. Confirmed identical with
  this branch's changes stashed: the product's touch floor is a `(hover: none)`
  rule and the assertion runs at a desktop viewport, so the test asks for a
  guarantee the product deliberately makes only on a coarse pointer.
- `areas-goals-mobile.spec.ts:121` and `:473`, `collection-header.spec.ts:597`
  — recorded by Phase 6 and unchanged here.

### Next

Superseded by
[UNTITLED-11's list](#next-1). Items 6 (`IconButton`) and the `.dh-input` half
of item 7 are CLOSED by that pass.

## UNTITLED-11 — Habits, charts, Today and the last two shared primitives

The per-surface inventory (Untitled source, how it is used, what stays custom
and why) is in
[`UNTITLED_UI_IMPLEMENTATION.md`](UNTITLED_UI_IMPLEMENTATION.md#untitled-11-completion-record--habits-charts-today-and-the-shared-primitives).
This records what MOVED and what is left behind.

### What moved

| Surface | Untitled source | Before → after | Kept deliberately |
| --- | --- | --- | --- |
| Habits collection | `application/table`, `base/checkbox`, `base/dropdown`, `application/empty-state` | A hand-painted list beside a rail of standing figures became ONE bounded card: header, standing band, table, divided footer. The rail is deleted, not restyled | The check-in is still one tap from the collection — the structure changed to protect that, not in spite of it |
| Habit record | `application/table` band anatomy, `application/section-headers` via the `section-heading` override, the chart foundation | Four loose regions became a standing band, a twelve-week adherence chart, a four-week dot grid, notes and schedule history | `SectionHeading level={2}` — upstream hard-codes `h3`, which fails axe under a record's `h1` |
| Habit creation and editing | `base/input`, `base/select`, `base/checkbox`, `base/button-group` geometry | Bare controls and `.dh-input` became the genuine recipe | `ToggleGroupField` stays a real radio group inside a form that posts |
| Goal trend chart | `application/charts-base` via `MeasurementTrend` | A hand-drawn SVG whose axis read 93.4 / 88.6 / 82.6 kg became a Recharts plot on the shared foundation, with a `niceDomain()` that owns the question | The `role="status"` readout, the dash-pattern references and the conditional projection — all transferred, none lost |
| Habit adherence chart | `application/charts-base` via `PeriodicAdherence` | New: twelve weeks of completed and shortfall counts | Counts, never a ratio without its denominator |
| Today | `application/table` card anatomy, the shared Task row, the shared `ProgressRow` | A twelve-column grid whose auto-placement gave every panel its own row — and left a ~700px hole beside the day — became two real columns, action-led | DOM order is reading order is tab order; there is no CSS `order` |
| `IconButton` | `base/buttons/button-utility`'s exported `styles` | The last primitive in `~/shared/ui` painting itself, and the last full state-layer host | A required accessible name, the coarse-pointer touch floor, `pressed`, `danger`, DalyHub's `Tooltip` |
| `Input` / `Textarea` / `Select` | `base/input`'s recipe | `:is(.dh-control, .dh-input)` in `ui.css` painted every field over the legacy `--surface` / `--border-strong` family; modules had started reaching past the component to `InputBase` to escape it | ONE element rather than upstream's `Group`, so no consumer's markup moves |

### Stylesheets cut

- `habits.css` — 1,093 → 553 lines. The dot's states, the four-week grid and
  the forced-colours block survived; the rest was paint Untitled now owns.
- `ui.css` — the whole `.dh-icon-button*` block deleted, and the
  `:is(.dh-control, .dh-input)` paint block with it. Only the select chevron's
  inset and the coarse-pointer `min-block-size` remain.
- `base.css` — `.dh-icon-button` removed from all six state-layer host lists.
- `premium.css` — `.dh-input` and `.dh-combobox__input` removed from the
  radius/background rule. This is the SECOND time that unlayered file has been
  found repainting a migrated control (it broke the button's ring in Phase 5).
- `forms.css` — the `.dh-input[readonly]` dashed border replaced by Untitled's
  quiet ground, which a ring can express and a dashed border cannot.
- `today.css` — the twelve-column grid replaced by `display: contents` at phone
  width and one two-column grid from `lg`.

### Defects the migration surfaced, and what they were

Each of these was a real product defect that the paint had been hiding, not a
regression introduced by the move:

- **`defaultValue` was silently discarded on `Input`.** React Aria's `TextField`
  wrapper owns the value of the control inside it. Visible on
  `/design/primitives`, where the invalid, disabled and read-only demos all
  rendered empty. Nothing in the product hit it because product fields are
  controlled — which is exactly how a defect like that survives. The wrapper is
  gone; the states read `aria-invalid`, `:disabled` and `[readonly]` off the
  control.
- **Every `<select>` in the product rendered on the read-only ground.**
  Tailwind's `read-only:` variant maps to CSS `:read-only`, which a `<select>`
  satisfies ALWAYS. Now `[&[readonly]]:`.
- **The combobox clear button rendered outside its field.** `base.css`'s
  state-layer host list sets `position: relative` on its hosts; both selectors
  were one class and both unlayered, so file order decided it. Fixed by making
  the rule two classes deep rather than by adding weight.
- **The Habits "today" column was silently clipped** in a 55px cell, because
  percentage widths under `table-fixed` do not reserve what they promise. Fixed
  rem widths, and the column drops below `@sm` with its fact moving to the row's
  second line.

### Chart debt, with a named owner

`TrendLine` is NOT deleted. It still draws three surfaces, and each needs its own
data-correctness pass before it moves — a chart migrated without one is a
correctness risk wearing a new coat:

| Surface | File | What it draws | Why it did not move now |
| --- | --- | --- | --- |
| Analytics | `app/modules/analytics` | Completion and throughput series | Its series are derived differently from a Goal's readings; the axis and the bound need their own pass |
| Reports | `app/modules/reports` | A saved report's result series | A report result carries its own currency and bound (ADR-121), which the shared frame does not yet express |
| Reviews | `app/modules/reviews` | Period comparison | Depends on the Analytics pass above |

`app/styles/charts.css` retains only the `TrendLine` rules those three need,
plus the forced-colours and print blocks that apply to any `.dh-chart`. When the
last caller moves, the file and the component go together.

### Pre-existing failures, re-checked rather than inherited

Phase 7's list was re-run against this branch rather than carried forward:

- `visual-system.spec.ts` "leads with page content, then the day with its
  context beside it" — this one was THIS pass's, not pre-existing: it read
  beside-ness off `.dh-today__grid > .dh-today__panel`, a selector the column
  wrappers made empty. The contract it pins is unchanged and is now measured on
  the columns themselves.
- `today.spec.ts` and `today-focus.spec.ts` — both were red on selectors that no
  longer exist (`.dh-today__date`, `.dh-taskrow__title`). Repaired, not
  inherited.
- `goal-measurement.spec.ts` — Phase 7 recorded this one as the test asking for
  a guarantee the product only makes on a coarse pointer: `expectMinTouchTarget`
  reads 32px at a desktop viewport against a 44px floor. **Re-checked, and the
  framing was half wrong.** There is ONE browser project, so all 145 call sites
  of that helper run at a fine pointer, and 144 of them pass — the product does
  make the guarantee at a desktop pointer nearly everywhere, and Today's Goal
  check-in button was the outlier rather than the rule. It takes the floor now,
  as a `min-block-size`: the button keeps its small type and inset, and its box
  grows to what a thumb needs. **Fixed, not inherited.**

- The same spec leaked every Goal it created. Five journeys named them
  `Reach 70 kg ${Date.now()}` and friends — unique per run, and outside the
  prefix the shared sweep reaches, so each run left its Goals in the development
  database permanently. Three had accumulated, and because Today's Goal panel
  counts open Goals, both GOAL-02 journeys had begun failing in a batch while
  passing in isolation. Not a flake: the titles go through `uniqueGoalTitle` now
  and the file sweeps after itself.

- That spec also asserted `/kg/` and `"Target 70 kg"` through a locator that
  deliberately selects whichever measurable Goal the RANKING chose. The two only
  ever agreed by accident, and Today drawing two tiles rather than four ended it
  — `todayGoalRank` demotes a Goal that was just checked in, so the Goal the
  test had just measured was the one least likely to be drawn. The assertions
  are now what the test's own comment always claimed: a measurable tile carries
  a value, its target in the SAME unit, a percentage, a state word and one
  action, whichever Goal it is.

### Next

1. The three `TrendLine` surfaces above, in the order Analytics → Reviews →
   Reports.
2. Settings — record Settings tabs draw the shared settings groups inside a
   record panel (a frame inside a frame) on Areas and Projects alike, and
   `tone="danger"` paints a reversible Archive group as destructive.
3. Goals — a Project inside a Goal record still carries no HEALTH.
4. Diary — the day navigator and the timeline.
5. People, Assets, Reviews, Obligations, Finance — their row/table structures.
6. Meeting record — the notebook and agenda sections.
7. Remove the inert legacy class names once their tests address product hooks
   instead, and with them the `.dh-btn` hook, the thirteen module rules that
   need it, and the `.dh-input` / `.dh-control` layout bridges.
8. `.dh-btn--danger-quiet` in `tasks.css` has no consumer in `app/` — verify and
   delete.

## UNTITLED-12 — Notes, Diary, the writing surface and the last chart

The per-surface inventory (Untitled source, how it is used, what stays custom
and why) is in
[`UNTITLED_UI_IMPLEMENTATION.md`](UNTITLED_UI_IMPLEMENTATION.md#untitled-12-completion-record--notes-diary-the-writing-surface-and-the-last-chart).
This records what MOVED and what is left behind.

### What moved

| Surface | Untitled source | Before → after | Kept deliberately |
| --- | --- | --- | --- |
| Notes collection row | Untitled card boundary | A full-width excerpt — roughly ninety words on one "two-line" row at 1440 — became prose at the product's own measure, with the metadata column where it was | The title leads and the date column stays straight at every width |
| Notes row date | — | It printed the effective UPDATED moment under a list sorted by CREATED, so the default view read 12 Sep, 11 Sep, 9 Sep, 7 Sep, 12 Sep, 30 Aug. It states the moment the list is ordered by, and names it for assistive tech | Both orders, and neither prints the other's column |
| Notes rail | `application/app-navigation`'s `nav-item` | 110 lines of `--dh-color-surface-selected` / `--dh-color-accent` / `--dh-color-bg-sunken` became Untitled's nav treatment | The leading brand bar on the current row — a fill alone is not enough down a column of forty near-identical documents |
| Editor toolbar | `base/buttons/button-utility`'s exported styles via `iconButtonClassName` | A second icon button, painted with the legacy lavender pressed fill, became the product's one icon button | The roving-tabindex model, the scroller and its overflow cue |
| Editor bar | Untitled's `bg-primary` / `border-secondary` | A grey band across a white document — it carried the app CANVAS while stuck — became the paper the words are on | The sticky behaviour, and that a compact editor does not pin its toolbar |
| Read/Write toggle | `buttonClassName({ variant: "subtle" })` | Its own height, radius and accent-subtle pressed fill | The LABEL carries the state, so it is never colour-only |
| Diary chronology | `application/table` card anatomy + `informational-02/13`'s activity-feed rows | A continuous 2px rule down a node column, a 28px ring around every glyph and a filled slab per day became one bounded card of hairline rows | The TIME leads the row — a diary's rows are about when |
| Diary row actions | The shared `IconButton` + `@untitledui/icons` `Edit01` | A hand-drawn `<svg>` pencil in a hover-only 44px circle | It is always present now, at the weight a secondary action should carry |
| Diary week strip | Untitled's surface, hover and `bg-brand-solid` roles | `--dh-color-accent` and `--dh-color-bg-sunken` | The measured phone arrangement, which is the module's own composition |
| Diary date picker | **The genuine vendored `application/date-picker` `Calendar`** | A native `<input type="date">` stretched INVISIBLY at `opacity: 0` across a 44px well, with the focus ring moved onto the well because the real control could not be seen | Choosing a date navigates immediately; Back undoes it |
| Diary type filter | `overrides/link-tab-rail` + the genuine `Badge` | The M3 `md-state-layer` wash | Navigation semantics — these options navigate, so they are anchors with `aria-current`, not tabs |
| Diary capture chips | The shared `toggleOptionClassName` | Its own pill and the same `md-state-layer` | A real radio group in a form that posts |
| Analytics trends | `application/charts-base` via `MeasurementTrend` | A hand-written 100×100 SVG with NO value axis, whose scale was four label strings the caller computed and passed in, became a real plot with real axes | The bucket-key label resolution, which was already right |

### Stylesheets cut

- `diary.css` — 1,160 → 618 lines. The timeline's rule and nodes, the day slab,
  the whole week-strip and type-filter paint, the capture chip and the detail
  pills all went. What survives is the reading measure, the Inspector body's
  structure and the measured phone arrangement.
- `charts.css` — 844 → 532 lines. The entire `--dh-linechart` vocabulary,
  including the five-paint `data-meter-status` tone map and the dotted
  projection path.
- `notes.css` — 339 → 202 lines. The rail's paint; its PLACEMENT survives.
- `markdown-editor.css` — 818 → 760 lines. The toolbar button, the mode toggle
  and the bar's ground.
- `base.css` — `.dh-md-toolbar__button` and `.dh-md-editor__mode-toggle` removed
  from all six `md-state-layer` host lists. The third time a control has left
  that list on being rebuilt on Untitled, after the button (Phase 5) and the
  icon button (UNTITLED-11).

### Deleted

`app/shared/charts/TrendLine.tsx`. The last chart DalyHub drew itself.

### Correcting this document's own record

The chart-debt table in UNTITLED-11 named three `TrendLine` surfaces —
Analytics, Reports and Reviews. Reports and Reviews draw `TrendBars` and
`CategoryBars`, which are different components. `TrendLine` had ONE consumer.
The debt was smaller than recorded and is now closed; `TrendBars` and
`CategoryBars` are unaffected by this pass and carry no debt of their own (each
is a labelled list with a bar per row, readable with the SVG removed — see
`~/shared/charts/index.ts` for why those are deliberately not Recharts).

### Defects surfaced, and what they were

- **The Diary timeline gave a phone 168px of content** at 393px and 95px at
  320px, because the time gutter, the node column, two gaps and an
  always-visible Edit button took the rest. Measured. It is 237px and 164px now,
  and the fix was removing decoration.
- **The week strip's step controls were 40×44** against a 44px floor:
  `diary.css` set a 40px `min-inline-size` on a control whose component already
  held 44px under `(pointer: coarse)`, and the unlayered rule beat the layered
  utility. The third instance of that exact cascade defect.
- **The date picker's popover never opened** in a first draft that used the
  shared `IconButton` as its trigger: React Aria's `DialogTrigger` passes press
  behaviour through `PressResponder` context, which a plain `<button>` does not
  consume. It looked identical and reported no error. Found by driving the real
  browser, not by a test.
- **`iconButtonClassName` was not in the `~/shared/ui` barrel**, so its second
  consumer would have had to import it by file path.

### Pre-existing failures, re-checked rather than inherited

The full unit suite (7,741 tests) is green. Four tests were updated because
their CONTRACTS changed in this pass, and each change is argued in the test:

- `NotesRail.test.tsx` — the row date. The old assertion pinned the defect.
- `DiaryTypeFilter.test.tsx` — `aria-current="page"` rather than `"true"`.
- `DiaryDayNavigator.test.tsx` — the picker is a calendar in a popover, so the
  test drives what a person does. `@testing-library/user-event` is deliberately
  still not a dependency (see `AttachmentsSection.test.tsx` for the same call);
  three `fireEvent`s cost less than a package.
- `goal-charts.test.tsx` — rewritten onto `niceDomain`, which is where the
  chart's scale correctness actually lives and which is now exported for test.
  Every contract UIX-03 pinned survives: a target far below every reading still
  frames, a measure with a floor of zero gets no negative tick, and the chart
  refuses to draw a line from one point. A count axis offering no halves is new.

### Remaining, and named

1. **The Diary week strip uses CSS `order` at phone width.** Its DOM order is
   `‹`, seven days, `›`, caption, picker, Today; its phone visual order puts the
   arrows on the control line with the picker and Today, and the days on a line
   of their own. MOBILE-01 arrived at that arrangement by measurement — seven
   45px days, two arrows, a picker and Today need 372px of a 358px content box
   at 390 — and it is genuinely the right layout. It also means focus order
   jumps between the two lines. Resolving it needs a markup change that serves
   both widths, which is an information-architecture decision rather than a
   paint one; it is deliberately not taken here and is the navigator's one
   outstanding item.
2. **The Diary phone header is tall.** The page title, the date subtitle, the
   full-width create action, the mode switch, the week strip and the type filter
   put the first entry around 410px down an 844px screen. Most of that band is
   `CollectionLayout`'s shared phone composition rather than Diary's.
3. **Settings** — record Settings tabs still draw the shared settings groups
   inside a record panel, and `tone="danger"` paints a reversible Archive group
   as destructive.
4. **Goals** — a Project inside a Goal record still carries no HEALTH.
5. **Meeting record** — the notebook and agenda sections. Untouched by this
   pass, which stopped where the brief said to stop.
6. **People, Assets, Reviews, Obligations, Finance** — their row/table
   structures.
7. The inert legacy class names, the `.dh-btn` hook and the `.dh-input` /
   `.dh-control` layout bridges.
