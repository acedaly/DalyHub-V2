# Untitled UI migration guide

> DalyHub's presentation layer is built from Untitled UI React Pro, Untitled
> Application UI patterns, Tailwind CSS v4 and React Aria. Backend, database,
> migrations, Cloudflare infrastructure, API contracts and business logic remain
> out of scope for this frontend reset.

## Status: the broad migration is COMPLETE

Every module in the phase list below has had its dedicated pass, and UNTITLED-18
closed the last of them (Settings) together with the residual debt three earlier
passes had carried forward. **There is no next module.**

What that means for a future change:

- **There is no "migration phase" to join.** A new surface is built on Untitled
  from the start; an existing one is changed in place. Nothing is waiting for a
  broad rewrite, and proposing another one is the wrong shape of answer to
  anything on the debt list below.
- **The generic UI layer is Untitled's.** The inventory — every generic concept,
  its current source, and whether it is Untitled-backed — is in
  [`UNTITLED_UI_IMPLEMENTATION.md`](UNTITLED_UI_IMPLEMENTATION.md#the-generic-ui-inventory-at-the-end-of-this-pass).
  Read it before building a control; the answer is almost always "that already
  exists and it is Untitled's".
- **What is left is MAINTENANCE**, named and bounded in
  [Named maintenance debt](#named-maintenance-debt). Each item is a specific
  file, a specific count, or a specific blocked dependency — not a module.

## Current frontend debt

Kept as a statement of what is still TRUE, not as a work queue; the queue is
[below](#named-maintenance-debt).

- Legacy CSS still carries `--dh-*`, `--app-*` and `--md-*` compatibility
  vocabulary. This is deliberate: they are real, generated, tested design tokens,
  and the boundary between them and Untitled's is enforced by
  `scripts/dhds-token-audit.mjs`.
- Module stylesheets are UNLAYERED, so any rule in one outranks every Untitled
  utility regardless of specificity. That is what makes the migration safe
  surface by surface (see `app/styles/untitled/untitled.css`), and it is also the
  mechanism by which a leftover rule can silently repaint a migrated control —
  UNTITLED-18 found and measured six of those. When a surface migrates, its
  stylesheet's paint must go with it.
- A small number of shared primitives predate Untitled adoption and are named
  individually below rather than described in general.

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

## Migration phases — the record of how it was done

All eighteen are complete. Kept because the ORDER is the reusable lesson: the
foundation and the shell first, then the surfaces the owner uses daily, then the
ones they configure, then the removal of what was displaced. A future broad
change to the presentation layer should follow the same shape.

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
2. **A chart's Escape key does not release the active reading.** `TrendLine`
   cleared its own readout on Escape; Recharts 3 owns the active index and
   exposes no supported way to clear it, and reaching into its internals to
   restore one nicety is the fighting-the-library this migration exists to stop.
   It affects every `MeasurementTrend` — the Goal trend has had it since
   UNTITLED-11 — and the mitigation is already in place: the readout RESTS on a
   sentence naming the latest reading rather than on a blank line, so a reader
   who steps into the series can always see where it currently stands. Worth
   revisiting if Recharts exposes an imperative API for it.
3. **The Diary phone header is tall.** The page title, the date subtitle, the
   full-width create action, the mode switch, the week strip and the type filter
   put the first entry around 410px down an 844px screen. Most of that band is
   `CollectionLayout`'s shared phone composition rather than Diary's.
4. **Settings** — record Settings tabs still draw the shared settings groups
   inside a record panel, and `tone="danger"` paints a reversible Archive group
   as destructive.
5. **Goals** — a Project inside a Goal record still carries no HEALTH.
6. **Meeting record** — the notebook and agenda sections. Untouched by this
   pass, which stopped where the brief said to stop.
7. **People, Assets, Reviews, Obligations, Finance** — their row/table
   structures.
8. The inert legacy class names, the `.dh-btn` hook and the `.dh-input` /
   `.dh-control` layout bridges.

## UNTITLED-13 — Meetings, People and the shared Person identity

The per-surface inventory (Untitled source, how it is used, what stays custom
and why) is in
[`UNTITLED_UI_IMPLEMENTATION.md`](UNTITLED_UI_IMPLEMENTATION.md#untitled-13-completion-record--meetings-people-and-the-shared-person-identity).
This records what MOVED and what is left behind.

### What moved

| Surface | Untitled source | Before → after | Kept deliberately |
| --- | --- | --- | --- |
| Person mark | `base/avatar` (`Avatar`, and `AvatarProfilePhoto` newly vendored) | TWO marks — a `<span>` sized by inline style in `~/modules/people`, and a second disc in `meetings.css` written because the first was not importable. The same person was a 44px tinted disc on `/people` and a 20px grey one on their own meeting | UIX-05's circle accent, six generated rules instead of a parallel avatar. A photograph takes no tint |
| Meeting header's people | `base/avatar` grouped as `informational-02/10` groups an event's guests | Four name-plus-initials pairs, or a "+N more" text link | The marks are DECORATIVE and the count is the target — measured at 24×25px as links, against a 44px floor |
| Meeting attendee list | Untitled's divided list + the shared Person mark + `OverflowMenu` | A bare `<ul>` of `EntityLink` beside a "Remove" button; a person with a photograph was a line of blue text | Removing an attendee is a menu item, not a permanent destructive control |
| Meetings collection day | `application/table`'s `TableCard.Root` / `.Header` | A hand-copied class string that happened to spell those components' output | The fixed leading TIME column: a day's meetings read as a schedule |
| Meeting row | — | Upcoming and past drew identical metadata, so a meeting from three weeks ago advertised how long it was scheduled to run and offered Join for a finished call | Attendees stay TEXT: the batched read carries a title and nothing else, so marks would say less than the names |
| Meeting items | Untitled's divided list, `base/buttons`, the shared `OverflowMenu` | A bordered filled box per item, which a second rule in the same file then unset for the notebook's copy; a kind chip repeating its own heading; two text buttons faded by `opacity: 0` under a hover rule with a `:focus-within` escape | ONE visible conversion control, on ACTION items, because converting is the point there and two presses in a live meeting is one too many |
| Notebook headings | `overrides/section-heading` (`application/section-headers`) | A bespoke uppercase letter-spaced rule with its own hairline, the only heading in the product spelled that way | The writing MEASURE and the two editor accommodations that depend on it |
| Notebook add forms | `base/input`, `base/buttons` | Four permanently-open label+field+button trios, so an upcoming meeting opened on four empty forms | The capture bar is the LIVE path and is untouched; the section form is the considered one and discloses |
| Meeting capture chips | The shared `toggleOptionClassName` (Untitled's pill geometry) | A bespoke chip under the M3 `md-state-layer` wash — the FOURTH control to leave that list on being rebuilt | `aria-pressed`, and the label carrying the state |
| Meeting Details facts | The shared quiet fact strip | `record-summary__meta`, a fixed two-column grid whose phone arrangement `meetings.css` then had to undo with `display: block` | — |
| Person workspace | `overrides/section-heading`, Untitled's divided list and card anatomy, `base/badges` | A grid of up to nine counting tiles, two of which measured the relationship rather than describing it | The counts, as the rhythm band's supporting sentence — evidence, not a headline |
| Person recent activity | The shared `Timeline` over the SAME `/person/:id/activity` endpoint | The tab that OPENS carried none of the history the record exists for | No second endpoint and no second projection |
| Stay-in-touch pill | `base/badges` via the shared `Badge`, OUTLINE variant | A hand-drawn stadium with its own height, hairline and three-tone container map | The label always carries the state |
| People filter bar | `base/input` via `inputClassName()`, `toggleOptionClassName` | A bare `<input>` on `base.css`'s control floor beside ~35 lines of hand-painted toggle | Search stays visible at phone width — now through the layout's own prop |

### Stylesheets cut

- `meetings.css` — 631 → 317 lines. The item rows, the kind chip, the
  hover-reveal trio, the follow-up row's stadium border, the attendee list, the
  context row including its private avatar, the notebook heading, the capture
  chip's paint and the phone `dl` unset. What survives is the sticky capture
  bar's geometry and the notebook's writing measure.
- `people.css` — 558 → 240 lines. The avatar's geometry, the whole collection
  controls block, the Person workspace's identity block and fact grid, and four
  rule families with no consumer in `app/` — including a Meetings block orphaned
  here since MEET-01 that still spoke the pre-`--dh-*` vocabulary.
- `relationships.css` — 153 → 47 lines. The pill, its tone map, its dot, the
  facts grid and both containers. What survives is the reason bullet's tone.
- `card-family.css` — the `warning` rhythm dot, which painted a relationship
  with `--dh-color-overdue`.

### Defects surfaced, and what they were

Each was real, each is fixed here, and none was visible to the tests that
already existed:

- **A relationship was painted with the product's OVERDUE red.**
  `rhythmTone()` escalated `out_of_touch` and `due_for_follow_up` from the
  kernel's `neutral` to the row's `warning`, which `card-family.css` painted
  with `--dh-color-overdue`. AGENTS.md §5 and `person-relationship.ts` both rule
  it out by name, and `RelationshipTone` has no `warning` member precisely so it
  could not be expressed. The emphasis it wanted is the column's position and
  the default sort, both of which already existed.
- **`variant="outline"` never removed the badge's fill.** One class, (0,1,0),
  against tone rules at (0,2,0) — so the variant has meant "a soft badge whose
  text is the role colour" since DS-02, which is also a contrast risk. Fixed
  with `[data-tone]`, and `neutral`/`info` gained the colour arms the container
  had been covering for.
- **`role="feed"` on the activity viewport was a promise the DOM has never
  kept.** axe reported `aria-required-children` (critical) on every Activity
  surface in the product. A day-grouped, virtualised chronology cannot be a flat
  article list; the region is a labelled `group` in every state now.
- **The phone search reveal was 32×32 against a 44px floor** — the vendored
  `ButtonUtility` directly, on every collection in the product. It is the shared
  `IconButton`, whose own note says Untitled's desktop dimensions are not
  assumed sufficient.
- **People's phone search rule was implemented against the shared layout.**
  HARDEN-02 had to write `:has(.dh-people-filters)` on the shared class because
  the layout offered no way to say it. `keepFiltersOnCompact` is that way, the
  sibling of the `keepViewsOnCompact` it mirrors.
- **The collection shipped its notebooks.** Every `/meetings/*` loader
  serialised each row with the whole kernel record — `agendaMarkdown`,
  `notesMarkdown` and every `meeting_items` row — so thirty rows meant thirty
  complete notebooks in the browser.
- **A past meeting opened on an empty agenda editor**, asking what a finished
  meeting should cover, above the notes saying what it did.
- **One fact printed three times.** For a Person with a single recorded moment,
  "last spoke", "known since" and the panel's "first interaction" were the same
  date under three names.

### Two defects this pass INTRODUCED and then measured away

Recorded because the measurement is the point, not the outcome:

- linking every mark in the Meeting header's avatar group gave four 24×25px tap
  targets against a 44px floor;
- reaching for `persistentControls` by its name made the SHEET the control
  surface at every width and left the hide rule in force, so at 393px the whole
  People filter band vanished — the exact defect HARDEN-02 fixed. Caught by
  driving a real browser at phone width; no test could see it, and the
  class-level opt-in is asserted now so the next one can be.

### Pre-existing failures, re-checked rather than inherited

`AnalyticsScreen.test.tsx` fails two assertions about a bounded overdue series'
axis labelling. Reproduced on `origin/main` at 7326187 in a clean worktree, with
the same two names and the same messages. Nothing in this pass touches Analytics
or the chart foundation.

### The fixtures

`scripts/meetings-people-seed.mjs` and `scripts/meetings-people-shot.mjs`,
siblings of `notes-diary-seed.mjs` / `-shot.mjs` and written for the same
reason. The seed adds fourteen People across every circle with deliberately
uneven contact data, twenty Meetings with real outcomes behind them and real
agendas ahead, and — the part a first draft omitted — the Activity events the
relationship model is actually DERIVED from. Without them every row read "No
shared history yet", because the product correctly refuses to call a
hand-entered date an interaction.

The shooter photographs and MEASURES, in two contexts: a desktop one, and a
`hasTouch` one at 430px and below. That second context is the whole reason its
touch report means anything — a headless desktop Chromium reports
`hover: hover`, so every coarse-pointer rule in the product measures as absent
and a first version of the script reported floor breaches that do not exist.

### Next

1. **A bounded `people.getByIds`.** A Meeting resolves attendees through
   EntityLinks, which carry an id and a title, so its Person marks are generated
   from the display name and take the neutral disc. The photograph and the
   circle accent need the Person record, and one read per attendee is the N+1
   DEBT-124 exists to avoid.
2. **Assets claims People's phone-search rule and does not have it.** Its own
   note says "search stays visible" and the shared hide rule still applies to
   it; `keepFiltersOnCompact` is now available to say it properly.
3. **`SummaryCards` is still M3.** It carries `md-state-layer` and `card.css`
   paint, and Projects, Areas and Assets still draw it. People no longer does.
4. **The `EntityLink` and `SelectField` clear affordances measure 22–28px** at
   phone width. Both are shared controls with many consumers and neither is this
   pass's; the measurement is in `meetings-people-shot.mjs` whenever they are.
5. Settings, Goals' Project health, the Diary week strip's focus order, and the
   inert legacy class names — all carried forward from UNTITLED-12 unchanged.

## UNTITLED-16 — Finance, Assets and Life Admin

The per-surface inventory (Untitled source, how it is used, what stays custom
and why) is in
[`UNTITLED_UI_IMPLEMENTATION.md`](UNTITLED_UI_IMPLEMENTATION.md#untitled-16-completion-record--finance-assets-and-life-admin).
This records what MOVED and what is left behind.

### What moved

| Surface | Untitled source | Before → after | Kept deliberately |
| --- | --- | --- | --- |
| Finance home | `application/table`, `application/section-headers`, `application/charts-base` | Four hand-written `<ul>`s of `dh-finance-*` rows, every band at the same weight, with net worth — the page's single largest fact — in a generic `Card` below an unordered list | FIN-02's reading ORDER, unchanged, because it was right. What was wrong was the weight, not the sequence |
| Money in / money out | `application/charts-base` over Recharts | The band answered "what happened in September" and could not answer "is that normal?" | Both figures still exclude uncategorised money and say so — and the chart now does too, which is the defect below |
| Spending by category | `application/table` | A `<ul>` whose figures were a `text-align: end` span — a column of money whose digits did not line up | The budget in WORDS. Untitled's own finance dashboards all draw a bar |
| Accounts | `application/table` | A `<ul>` of bordered boxes, and a second `<ul>` for the closed ones that printed the balance differently | `balanceLabel`'s qualifier as a word beside the figure |
| Transaction row | `application/table` + `overrides/table-head` | An `<li class="dh-transaction-row">` with a three-part flex body and five rules deciding its height, hover, columns and phone arrangement | The phone is still the design target: the row RECOMPOSES rather than scrolling sideways, and the category control is a real button at the touch floor |
| Month control | `base/buttons/button-utility` via `iconButtonClassName` | Bare `<a>` elements holding `←` and `→`, whose box was the glyph — 20×20 against a 44px floor | They are still LINKS, so a middle-click opens September in a new tab |
| Obligation row | `base/badges`, `base/buttons`, the shared `OverflowMenu` | Up to FIVE permanent `dh-btn dh-btn--ghost dh-btn--sm` class strings per row — a hundred controls down a twenty-row collection, two of them one mis-tap from silencing a commitment | ONE visible control, and the row still decides its own action set from its STATE |
| Obligation band | `application/table`'s `TableCard.Root` / `.Header` | An `h3` in a bespoke uppercase letter-spaced rule with the count welded inside its own text, above a bare `<ul>` of free-floating boxes | The count is of the WHOLE band across the collection, not of the page |
| Obligation record fold | `base/buttons`, `OverflowMenu`, `UntitledStatusBadge` | Five equal-weight buttons, so "Record it as done" sat beside "Dismiss" | The completion form still opens INLINE rather than in a dialog over the record |
| Asset dates | `application/table` | An `<ol>` of `<span>`s in three aligned columns, with the status ALSO painted as a coloured left border by a rule per state | Only overdue and due-soon take a strong tone (§28) |
| Asset value history | `MeasurementTrend` on the shared chart foundation | A `<span>` per row whose `width` was `value / max` as a percentage — no axis, no scale, no zero, so $42,000 beside $40,000 drew 100% and 95% | The `hasTrend` gate: two points are two points, not a trend |
| Asset history | Untitled's divided-list anatomy, `base/badges`, `OverflowMenu` | A bordered, radiused box per entry with a per-category painted arm and two permanent buttons | The date leads in a fixed column: a history is read by when |

### Stylesheets cut

- `finance.css` — 653 → 446 lines. The whole home block (the page, its header,
  its totals, its category lines and its account rows), the entire transaction
  row, the month control, and the transactions header, lens and count. Five
  identical error selectors became one; two identical quiet-note selectors became
  one. What survives is the import table, the budget and category rows, the
  picker, the drawer and the settle control.
- `obligations.css` — 313 → 126 lines. The band, the list, the row, the five-tone
  badge, the collection's filter bar and the record's fold and Overview. What
  survives is the subject picker, the disclosures, the create page, and ONE rule:
  an empty action column draws no gap.
- `assets.css` — 789 → 642 lines. The history list and its eight rules, the dates
  list and its five painted state arms, and the whole value-history block
  including the CSS bar.

### Defects surfaced, and what they were

Each was real, each is fixed here, and the first three were found by driving the
actual browser rather than by a test:

- **The chart and the month band disagreed about uncategorised money.** The band
  excludes it and reports it separately; `rangeDirectionAmount` classifies it by
  its sign, which is right for a Report. So the first draft drew a September bar
  of $4,590.39 under a figure reading $3,497.69, with a caption claiming a
  surplus the two figures above it contradicted. The series is categorised money
  only now, and the surface states the count it left out — the same exclusion, in
  the same place, as the band.
- **The Finance pages had NO side gutter.** They render neither
  `CollectionLayout` nor `RecordLayout`, so nothing above them supplied the
  shell's padding: measured at 390px, a zero-pixel left gutter against §55's floor
  of 16, with the page title, the month label and a display-size figure all hard
  against the navigation rail. It is a pre-existing defect this pass inherited and
  fixes.
- **The flow chart drew no bars at all at 390px.** Twelve months × two bars in a
  342px box is under two pixels each — an axis, month labels and nothing between
  them, under a caption saying it said something. `ChartFrame` gained
  `minPlotWidth`, which gives a plot with MARKS its own bounded horizontal
  scroller; the caption, the key and the readout stay outside it, so the chart's
  text form is never behind a scroll.
- **The table's row separator stopped halfway across on a phone.** Untitled draws
  it as an `::after` on every cell, which is right for a table: in the phone grid
  the date and account cells are hidden, so their rules drew nothing and the ones
  that remained drew a line INSIDE each row. It is a border on the row below `md`.
- **Assets claimed a rule it did not have.** `AssetsCollection`'s own header has
  said "search stays visible, because a search box behind a button is a search box
  nobody uses" since UIX-05, and `persistentControls` does not lift the shared
  rule that hides the filter band on a phone — so at 393px the search field AND
  the tag field both vanished, and a bookmarked `?tag=` URL narrowed the gallery
  with no control showing it. UNTITLED-13 measured the same defect on People and
  left `keepFiltersOnCompact` as the way to say it. Life Admin had it too.
- **The value history's bar was a chart pretending to be an indicator.** §40 asks
  for each remaining bar to be classified; this one has dated numeric points, a
  trend gate and a proportional mark with no axis, which classifies it as a chart.
- **The obligation band's heading announced a parenthesised digit.** "Overdue
  (24)" was its accessible name, because the count was inside the `h2`. The same
  defect the Meetings day card fixed, in the same way.

### Three defects this pass INTRODUCED, caught in review, and fixed

Named rather than quietly amended, because two of them were arguments this
document made and the code did not keep:

- **Every obligation band became a PEER of the section containing it.** Dropping
  `headingLevel` was argued here on the grounds that "a record tab introduces no
  heading of its own". That is false of this surface and of three beside it: all
  four Asset tabs draw a visually-hidden `h2` naming themselves. So the Asset
  record's Obligations tab announced "Obligations, Overdue, This week" as three
  peers. Untitled's `TableCard.Header` hard-codes `h2`, so the rank needs
  `overrides/table-card-header` — the same override `section-heading` already is,
  one component along. Worse: `AssetObligationsTab.test.tsx` had NOTICED the
  clash and filtered the tab's own heading out of its assertion rather than
  reporting it. The filter is gone and the rank is now part of what that test
  pins.
- **The chart's exclusion note stated a figure that contradicted its own
  count.** `readMonthlyFlow` summed only `outMinor` for a non-leading currency
  while counting transactions in both directions, so an excluded USD salary with
  no USD spending read "$0.00 in 1 transaction" — a sentence that says nothing
  was excluded in the act of saying something was. It sums both directions now,
  which is what the chart is not drawing.
- **The design fixture's `--clear` deleted an `entities` row before its detail
  row.** For a transaction written into a seeded account by something other than
  this script, the entity was deleted straight from a sub-select over
  `finance_transaction_details`, whose entity foreign key is `ON DELETE
  RESTRICT`. Reproduced exactly — a hand-built foreign transaction in a seeded
  account, then that one statement, then "FOREIGN KEY constraint failed" — and
  it had survived only because the runs that exercised it happened to have no
  such row at that moment. The ids are captured into the script's own scratch
  table first, the details go, then the entities, then the scratch table is
  dropped.

### The cascade audit

§48 asks for it again, and this time it came back CLEAN for these surfaces, which
is worth recording because the previous three passes each found something:

- the legacy layer declares no bare element selectors beyond `body`, `html` and
  `pre`, so the new `<table>`, `<ul>`, `<li>` and `<a>` markup has nothing
  unlayered competing for it;
- the two container selectors that DO reach elements — `.page` and
  `.dh-pane-body`, which carry `h2`, `ul`, `li` and `a` prose rules — have no
  Finance, Assets or Obligations consumer, and the Finance gutter deliberately
  takes the measurement without the class for exactly that reason;
- the one inert class name kept (`.dh-obligation-row`) carries exactly one rule,
  stated in `obligations.css` with its reason.

### The §40 sweep, and what it found

§40 asks for every remaining bar, mini-chart and CSS graph in the touched
modules to be classified. Swept for `<svg>`, `canvas`, the five shared
indicators, and any inline or stylesheet `width` used as a proportion:

- **One genuine chart**, the Asset value history's bar. Dated numeric points, a
  trend gate and a proportional mark with no axis. Migrated to
  `MeasurementTrend`.
- **Nothing else.** Finance, Assets and Life Admin now contain no hand-drawn
  SVG, no canvas, no CSS bar and no consumer of `TrendBars`, `CategoryBars`,
  `Sparkline`, `ProgressRing` or `ComparisonBars`. The only plots in the three
  modules are `MoneyFlow` and `MeasurementTrend`, both on the shared Untitled
  foundation.

### The fixtures

`scripts/finance-assets-admin-seed.mjs`, a sibling of `meetings-people-seed.mjs`
and written for the same reason: on the shared E2E seed Finance is at its EMPTY
state — no account, no category, no transaction — so the screen this pass rebuilt
could not be photographed at all. It adds four accounts across four kinds (two of
them liabilities, because "owing" is a word `balanceLabel` exists to say),
fourteen months of transactions with amounts that vary month to month, five
uncategorised rows in both directions, one transfer pair, two budgets (one under
and one over) and nine obligations across every band.

One thing it had to learn: `INSERT OR REPLACE` on `entities` is a DELETE followed
by an INSERT, and every detail table's entity foreign key is `ON DELETE
RESTRICT` — so the script ran once and failed on the second run with a bare
"FOREIGN KEY constraint failed", which is the database correctly refusing to
orphan an account's details. It clears its own prefix first and then inserts
plainly.

### CI's E2E suite is red on `main`, and the cause is the partition manifest

Worth recording because it outlives this pass. Every `E2E p01`–`p13` and the
`CI Gate` behind them fail on `main` at **`a98fd4b`** — this pass's own merge
base — with `Scope`, `Static`, `Build` and `Unit` green; the four merges before
it are red the same way, so the suite has been red across five consecutive
merges.

It is not a test failure. `p07` reports it in the repo's own words: "**DID NOT
COMPLETE** — 31 of 120 assigned tests never executed (Playwright
globalTimeout). This is a partition-budget failure, not a test failure … 
Re-derive the split from measured time (`pnpm run e2e:partitions:generate`)
rather than raising a timeout", at **25.0 min against a 16.6 min budget**.
`globalTimeout` is 25 min, so Playwright kills the partition before it
finishes. The manifest's estimates have drifted below real runtimes — it
records `finance.spec.ts` at **114.9 s**, and on `main` that file measures
**258 s** on one machine — and `e2e:partitions:check` cannot catch it, because
it checks the manifest's own arithmetic rather than the clock.

On this branch `p07` is strictly BETTER than on `main`: five failures against
six and 27 starved tests against 31, with an identical failing set bar one.
`the Finance surfaces are axe-clean` fails in both, at `:404` on `main` and
`:411` here — the same test, moved down the file by edits above it. Measured
back to back on one machine, this pass costs `finance.spec.ts` 258 s → 276 s
and that axe test 26.2 s → 27.8 s: real, and nowhere near the eight and a half
minutes `p07` is over by.

The fix — regenerate the manifest from a run's `e2e-results-p*` artifacts — is
a repo-wide change touching all 142 spec files and wants its own pass, so it is
named here and on the PR rather than folded into a module migration.

### Pre-existing failures, re-checked rather than inherited

The full unit suite (7,757 tests) is green. Eight tests were updated because
their CONTRACTS changed in this pass, and each change is argued in the test:

- `AssetObligationsTab.test.tsx` — the band heading is an `h3` (Untitled's
  `TableCard.Header`, through the `table-card-header` override), and Edit,
  Create task, Hold and Dismiss are menu items. The tests take the journey a
  person now takes.
- `AssetHistoryTab.test.tsx` — the same, for Edit and Remove. The contract the
  tests exist for — that each action NAMES its entry — is unchanged and now
  covers the trigger as well.
- `life-admin-surface-conventions.test.ts` — the record's four write paths are
  still all guarded; three of them are guarded by the menu item's `pending` flag
  rather than by a button's `disabled`. The assertion counts both, and gained a
  third case pinning Dismiss's destructive tone and separator.
- `AssetOverview.test.tsx` — the value-history fixture carries its currency.

Four Life Admin E2E journeys failed on first run. Two were this pass's and are
fixed above (the band count moved to the card header badge; the menu's
accessible names now contain their visible labels). The other two were **dead,
not failing**, and had been for some time:

`openSearch` scoped its click to `.dh-topbar`. That class went with the
`dh-topbar__*` family — `DesktopTopBar.tsx` records its own removal — so the
locator had been matching nothing and both journeys were spending thirty
seconds timing out rather than searching. It was checked against the rendered
DOM rather than assumed: at `/obligations`, `.dh-topbar` resolves to **0**, the
search button resolves to **1** by role alone, and `git diff origin/main --
app/shared/shell/ app/styles/shell.css` is empty, so the same is true on main.

The helper is re-pointed at `[data-testid="desktop-top-bar"]`, which keeps the
original intent (never resolve the phone opener, a different control with the
same name). Both journeys pass, and the create → complete → successor journey
now actually exercises the search step it claims to.

Five Assets journeys failed the same way — **dead rather than failing, and
nothing to do with this pass**. Each navigates straight to a record URL and
clicks a tab. A record tab is a React Aria `Tab`: the server-rendered markup
already carries the `role` and the accessible name, so Playwright finds it and
clicks it happily before any handler exists. The URL never gains `?tab=`, the
panel never changes, and the journey then spends its whole timeout waiting for
a field on a tab that was never selected. Every other journey reaches the
record through `gotoFixture` or a `?tab=` URL, both of which settle; these five
did not. In `assets-ownership.spec.ts` the correspondence is exact: the two
bare `page.goto(recordUrl)` sites in that file are the two journeys that
failed, and the other fourteen pass untouched.

Proved rather than assumed: with `origin/main`'s entire Assets module and
stylesheet checked back out over this branch, **all three collection journeys
fail identically**, at the same step, with the same locator. The fix is the
`waitForInteractive` helper the suite already owns, at the five bare
`page.goto(recordUrl)` sites. No assertion changed. All eight Assets journeys
and all sixteen ownership journeys pass, and the long one drops from timing out
at 2.1 minutes to **36.9 seconds** — it had never reached step 2.

**Eight other specs carry the same dead scope** — `search`,
`find-empty-search`, `recall-01-search-content`, `keyboard`, `tooltip`,
`tasks-daily-driver`, `project-templates` and `product-frame`. They are outside
these three modules, and re-pointing them would surface triage this pass cannot
do honestly, so they are named here rather than touched. This is a suite-wide
repair worth doing deliberately.

### Next

1. **`SummaryCards` has no consumer in `app/`, and this document said it did.**
   UNTITLED-13's Next list recorded "Projects, Areas and Assets still draw it";
   they do not — UNTITLED-13 itself removed the last one when the Person
   workspace stopped being a grid of counting tiles. The component, its 94-line
   M3 stylesheet (`md-state-layer`, `card.css` paint) and its producer
   `personRelationshipCards` are all unreferenced outside their own tests. The
   removal criterion this document states — "when the last caller moves, the file
   and the component go together" — is met, and it is a People deletion rather
   than a Finance/Assets/Life Admin one.
2. **The Finance import screen.** `FinanceImport.tsx` is 783 lines and still
   draws its own `<table class="dh-finance-import__table">` with its own column
   and scroll rules. It is the largest remaining hand-written table in the three
   modules and was out of this pass's stated scope.
3. **The budgets and categories screens.** `dh-finance-budget-row` and
   `dh-finance-category-row` are still grid rows with their own phone rules, and
   they are the last two consumers of `finance.css`'s narrow block.
4. **Settings** — record Settings tabs still draw the shared settings groups
   inside a record panel, and `tone="danger"` paints a reversible Archive group as
   destructive. Carried forward from UNTITLED-12 unchanged.
5. **Goals** — a Project inside a Goal record still carries no HEALTH.
6. **The Diary week strip's focus order**, and the inert legacy class names with
   the `.dh-btn` hook and the `.dh-input` / `.dh-control` layout bridges.
7. **Eight E2E specs still scope to `.dh-topbar`**, a class the shell no longer
   renders (above). Every journey through those locators is silently dead. The
   re-point is mechanical; the triage of whatever those journeys then assert is
   not, which is why it wants its own pass rather than a corner of this one.
7. **A bounded `people.getByIds`**, carried forward from UNTITLED-13.

## UNTITLED-17 — Insight, Reports, Reviews and AI

The per-surface inventory (Untitled source, how it is used, what stays custom
and why), the Pro research record and the whole chart inventory are in
[`UNTITLED_UI_IMPLEMENTATION.md`](UNTITLED_UI_IMPLEMENTATION.md#untitled-17-completion-record--insight-reports-reviews-and-ai).
This records what MOVED and what is left behind.

### What moved

| Surface | Untitled source | Before → after | Kept deliberately |
| --- | --- | --- | --- |
| Insight page | `dashboards-01/14`'s section grammar via `overrides/section-heading` | Five equal figures in a bounded box above a two-column grid of `DashboardCard`s — the KPI row every analytics template ships with | Every figure the kernel produces, every link to the records behind it, and every test id. Two figures moved from a tile to the caption of the section they describe |
| Insight Areas breakdown | `base/progress-indicators` via `ProgressTrack` → the shared `CategorySplit` | A `<span>` track with an inline `inlineSize: N%`, six identity-accent overrides and a forced-colours arm | The ATTRIBUTED total as the denominator, and the sentence saying so: a Task completed outside any Area is real work with no bar to sit in |
| Insight "What changed" feed | The shared `ActivityFeed`, in a section rather than a `DashboardCard` | A bounded card on a page of unboxed sections | Its own bounded viewport — a long list inside a page that also scrolls |
| Reports collection | `application/table` + the `table-card-header` override | A gallery of `.dh-reports__card` anchors: a bounded box per one-line definition, with the question — the only distinguishing fact — inside it at subtitle weight | Saved reports FIRST, and no figures at all: opening `/reports` never runs six reports |
| Report result rows | `application/table` + `overrides/table-head` | A hand-written `<table class="dh-report__table">` and, beneath it, `CategoryBars` drawing the same labels and figures a second time | "Number, then rows, then chart", at every width. The rows are still never optional |
| Report grouped comparison | `ProgressTrack` in a column, as `informational-02/06` draws it | A second list of hand-written `<svg>` bars under the table | The refusals: no share column for a row with no reading, or for a mixed-sign set |
| Report series plot | `application/charts-base` via `PeriodTotals` | `TrendBars` — a stretched 100×100 SVG with no value axis | A series with any absent reading still draws NO chart: a null as a zero is the lie the result type exists to prevent |
| Report builder controls | `base/buttons/button` via `buttonClassName()` | A bespoke pill with its own border, radius, surface, height and selected fill | An unconditional 44px floor — a wrapping rail of twenty adjacent targets is not an ordinary action row |
| Review guided header | Untitled type roles | An `h1` with NO type role at all, rendering at body size, on a surface with no page gutter | The breadcrumb, the period and the "Save and exit" exit |
| Review stepper | `ProgressTrack` with `range` | A `<div role="progressbar">` with a `<span>` fill sized by an inline percentage | The announced sentence, exactly: "step 4 of 7", `valuemin` 1, `valuemax` 7 |
| Review status and insight states | `base/badges` via the shared `Badge` | A bespoke pill with a hand-drawn dot and three tone fills, and a second bespoke pill for the Review's own status | The tone mapping, which is DalyHub's meter vocabulary |
| Review type picker | `base/buttons/button` via `buttonClassName()` | A bespoke option pill | `role="radio"` in a `radiogroup` |
| Review evidence trends | `PeriodTotals` | `TrendBars` | The enumeration of every reading, now `ChartFrame`'s accessible caption |
| Ask DalyHub | `base/textarea`, `base/buttons`, `overrides/section-heading` | A bare `<textarea>` drawing its own box and focus ring, a bare `<button>`, and four starting points as a bulleted list of bold text | Every contract: the availability gates, the deterministic-first path, the fail-closed refusal, the budget line, the send notice, every citation |
| AI proposal controls | `base/checkbox`, `base/select` via the shared primitives | Four browser-default checkboxes and a `class="dh-select"` with no rules behind it, beside already-migrated fields | The propose → review → act semantics, untouched |

### Stylesheets cut

Measured `wc -l`, against `origin/main`. Two of the seven did not shrink, and
saying which is the point of measuring rather than asserting.

- `charts.css` — **532 → 207**. `.dh-trend__*`, `.dh-catbars__*` and
  `.dh-cbars__*` in full, including three forced-colours arms and two phone
  overrides. What survives is the Untitled chart frame's two rules and the two
  genuine indicators.
- `analytics.css` — **534 → 287**. The metric row's box and its six children,
  the two-column panel grid with its three span overrides and its breakpoint,
  the Area split with its six accent arms, the loading ghost's card paint, a
  forced-colours border and a phone rule reaching into `DashboardCard`'s header
  to wrap the grain control.
- `reports.css` — **371 → 271**. The card gallery, the section heading and lede,
  the option pill and its forced-colours arm, and the hand-written table with
  its head, cell and detail rules.
- `insights.css` — **241 → 210**. The status pill and its hand-made dot.
- `review-guide.css` — **717 → 700**. The status pill, the stepper track and
  fill with their reduced-motion arm, and the prompt-nav button's five paint
  declarations.
- `reviews.css` — **225 → 225**, and that is honest rather than a wash: the type
  option's six paint declarations went and a touch floor plus the note recording
  why replaced them at about the same length. The RULES are down by five; the
  lines are not.
- `ai.css` — **732 → 811, it GREW.** The composer's box and focus ring and the
  checkbox's size came out; a page header with a divider, the starting-points
  section, the keyboard-shortcut row and the answer heading's focus treatment
  went in, because the surface genuinely had none of those. A pass that only
  ever deletes CSS is a pass that is not building anything.

### Defects surfaced, and what they were

Five, and **four of them were invisible to every test** — they were found by
looking at the rendered page, which is why this pass took captures before it
took a position.

1. **The guided Review's title rendered at body size.** Tailwind's preflight
   resets a bare heading to inherit, and `review-guide.css` set only its margin
   and its wrapping. The step heading beneath it was larger than the page's own
   `h1`.
2. **The guided Review had no page frame.** It rendered straight into the
   shell's main region with no gutter, so the breadcrumb, the title and the step
   rail all began within a few pixels of the sidebar's edge.
3. **`class="dh-select"` draws nothing.** It has had no rules in any stylesheet
   since the Phase-5 paint sweep, so three controls — the AI extraction review's
   Project picker, the Reviews collection's cadence filter and (still, for the
   next phase) the Settings notification picker — rendered as the browser's own
   default `<select>` beside migrated Untitled fields. A bare select still
   works, so no test could see it.
4. **Ask DalyHub's starting points had list bullets.** The `<ul>` sat inside a
   `.dh-ask__uncertainties` wrapper whose `ul { list-style: disc }` reached it,
   and the buttons were `subtle` — no fill, no border. Four questions rendered
   as a bulleted list of bold text that did not look pressable at all.
5. **Three lines said one fact on Insight.** The reading states "21 overdue",
   the plot's readout says "21 overdue at the close of …", and the caption said
   "21 overdue now, read at the close of …". The visible caption now states how
   the window was cut; the accessible summary still opens with the figure,
   because it has no figure beside it to lean on.

And one the captures found in a shared component: **a key with one entry is not
a key.** `MeasurementTrend` drew a legend naming its single series directly
above a caption naming the same series. The legend is now drawn only when the
plot has something to distinguish — a projection, a target or a baseline. A
Goal record still gets "Recorded readings · Target 50 · Start 0".

### One capability this pass added to a shared primitive

`LabelledProgressBar` dropped upstream `ProgressBarBase`'s `min` and `max`,
because every caller it was built for measured a completion. A guided Review's
stepper measures a POSITION, and forcing it through a percentage reported "57 of
100" to a screen reader for a thing with seven steps. `range` restores what
upstream has: the bar still DRAWS the fraction, and reports the position. It is
the one reason this migration did not have to choose between the shared bar and
a correct announcement.

### The §46 investigation — the shared Button's pressed state

Settled, with a measurement, and **not changed**. The full record is in
[`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md#the-pressed-state-and-why-it-equals-hover).
The short form: upstream Untitled's `button.tsx` declares no `pressed:` arm for
any of its nine colour families, its own `nav-account-card` maps pressed to the
hover treatment exactly, and `buttonClassName()` is built from the vendored
component's own exported `styles` — so DalyHub carries precisely what upstream
declares. Measured in Chromium: rest `rgb(105 63 117)`, hover `rgb(95 53 107)`,
pressed `rgb(95 53 107)`, with `data-pressed="true"` present throughout. It is a
design decision of the source system rather than a migration defect, so it is
documented rather than silently changed.

### Pre-existing failures, re-checked rather than inherited

**The `ai-assistance` E2E failures PR #291 reported did not reproduce.** All 37
journeys in `ai-assistance.spec.ts` passed against `origin/main` before a line
of this pass was written — 57 of 57 across it and `analytics.spec.ts` in one
baseline run — and they pass after it. The report is recorded here as not reproducible in this
environment rather than carried forward as a standing list.

One failure is real and is NOT this pass's:
`assisted-ai.spec.ts` → "applies, replays as unchanged, refuses stale, and
undoes exactly" times out at 30s when the AI specs run together, and **passes in
isolation at 37.5 seconds**. It drives `/finance/transactions?uncategorised=1`,
which is every uncategorised row in the shared local database, so its cost is a
function of what ran before it. That is fixture contention against a 30s
per-test ceiling, not a regression: nothing in this pass touches Finance
transactions, and the journey's own comment already records that the queue is
workspace-wide.

Tests updated because their CONTRACT changed, each argued in place:

- `ReportResultView.test.tsx` — Untitled tables are React Aria `role="grid"`
  (every other migrated collection in the suite already queries it), and a
  grouped result's comparison is a column of the rows rather than a second list,
  so the ordering assertion moved to a SERIES, where a chart still sits beside
  the rows. Gained a case pinning the mixed-sign refusal.
- `ReviewInsightsPanel.test.tsx` — an Untitled-backed plot mounts only in a
  browser, so the chart's TEXT form is what a jsdom test can assert. That is
  exactly the property the rule exists for.
- `AnalyticsScreen.test.tsx` — the distribution's bar is a real `progressbar`
  with `aria-valuetext`; the activity section is "What happened"; a section that
  cannot be read says "section" rather than "panel"; the overdue caption no
  longer repeats the figure.
- `analytics.spec.ts`, `reports.spec.ts`, `reviews-insights.spec.ts`,
  `grounded-ai.spec.ts` — the same three structural facts, plus a name cell
  addressed by `role="rowheader"` rather than by `th`, which React Aria's table
  does not render.

### Remaining, and named

1. **`DashboardCard`'s only consumer in `app/` is now the design gallery route.**
   Insight drew four of them and `WhatChangedPanel` a fifth; none remains. The
   component, its `.dh-dcard__*` block in `card-family.css` and its entry in
   `/design/card-family` should go together — a design-route deletion, which is
   the next phase's work rather than a corner of this one.
2. **`MetricTile` / `StatCard` / `MetricRow` have no product consumer either** —
   only that same gallery. Named alongside `DashboardCard` so the three are
   assessed once.
3. **`class="dh-select"` survives in `settings/NotificationsSection.tsx`**, where
   it draws a browser-default control. One line, in the next phase's module.
4. **`FinanceImport`'s hand-written table, and the budgets and categories rows** —
   carried forward from UNTITLED-16 untouched. This pass did not reach them and
   did not sacrifice a primary module to.
5. **Untitled's `application/progress-steps`** is the right upstream answer for
   the guided Review's step rail and its source cannot be retrieved here. The
   rail is correct and keyboard-complete; it is a repaint waiting on access.
6. **A Habit's expected check-ins before a full week has passed** — carried
   forward from UNTITLED-16, and **read this time rather than copied forward**.
   The brief ranked it last and said to fix it only if the root cause were
   obvious and low-risk. It is not, and what was checked is worth recording so
   the next pass does not start from zero:

   - `evaluateHabitConsistency` clamps its upper bound to the owner's today, so
     no future day is ever expected;
   - `activeOn` refuses every day before the Habit's first schedule version, so
     "a Habit created on Friday did not fail Monday to Thursday";
   - a `weekly_count` week contributes nothing unless the window fully contains
     it AND it has elapsed (V2.3-GATE-01), so half a weekly target is never
     pro-rated;
   - the Review's own read (`habit-facts.server.ts`) goes through that same
     evaluator and states its own window when it is truncated.

   Three deliberate guards, each with its own argued comment, and the reported
   symptom does not reproduce from any of these paths as read. The one place the
   whole week IS counted including days still to come is `evaluateHabitWeek`,
   which is the record's "N of 7 this week" — where the denominator is the
   week's own target rather than what has been asked so far, and that reading is
   arguably correct. **A fix needs a reproduction before it needs code**, and
   inventing one from a one-line description risks "fixing" behaviour three
   comments in this module argue for.
7. **Eight E2E specs still scope to `.dh-topbar`**, a class the shell no longer
   renders. Carried forward from UNTITLED-16 unchanged.

## UNTITLED-18 — Settings, shared forms, Finance admin, and the retirement of the old generic UI

The provenance record — every MCP search, what it returned, what was adopted and
rejected, and the whole generic-UI inventory — is in
[`UNTITLED_UI_IMPLEMENTATION.md`](UNTITLED_UI_IMPLEMENTATION.md#untitled-18-completion-record--settings-shared-forms-finance-admin-and-the-dead-frontend).
This records what MOVED, what was MEASURED, and what is left.

### What moved

| Surface | Untitled source | Before → after | Kept deliberately |
| --- | --- | --- | --- |
| Settings group | `section-headers/section-label` via the `section-heading` override | A CARD, which on a record's Settings tab meant a group card inside a settings card inside a record card — three borders contributing one piece of hierarchy between them | The structure DS-14 wanted. A reader can still see where one group ends and the next begins; it is a rule and a heading rather than a frame |
| Settings row | `base/input`'s `Label` + `HintText` roles, and a Tailwind CONTAINER query | A hand-written two-column row with its own four status tones and its own container query, plus a duplicate phone arm in a media query | Both accessible-naming patterns, and the row-owned name that stops a bare control being labelled twice |
| Settings rail | `command-menus/command-menu-item` (stacked) + `nav-item`'s selected treatment | ~250 lines: a grouped rail, a two-line row, an `::after` target overlay, a hover, a focus ring, a selected surface and a phone arm for each | The summary as the link's accessible DESCRIPTION rather than part of its name — now with one element instead of a link plus a described sibling under a pseudo-element |
| Switch | `base/toggle`'s `ToggleBase` `size="md"` | Material Design 3's anatomy: a 52×32 track, a thumb growing 16→24px, a check glyph, 203 lines of `switch.css` | The native `<input type="checkbox">` with `role="switch"`, the 44px LABEL target, uncontrolled form participation, and a forced-colours arm upstream has none of |
| Confirmed actions | Untitled's own destructive/warning modal PAIR, as the argument | One weight, and it was "destructive" — so an Area's Archive, whose copy reads "you can restore it at any time", was painted identically to Delete permanently | The confirmation itself on both. What differs is what it is FOR |
| Finance import preview | `application/table` + `table-head` | A hand-written `<table>` with its own cell padding, hairline, alignment, nowrap and scroller — the largest left in the product | The per-row outcome on the row, the amount/date alignment, the "import it anyway?" checkbox, the caption |
| Finance budgets | `application/table` + `table-head` | Twelve full-width bordered cards, each holding a name, a number, one button and a sentence | The variance SENTENCE with the figures that produced it. No bar, no percentage, no score — FIN-02's decision, not revisited |
| Finance categories | `application/table` + `table-head` | A four-column bordered grid row per category | "Money out" as a WORD in a column. Two kinds is not a status, and a coloured pill per row would be badge soup (§21) |
| File picker | — | `RestoreFromBackup` had the accessible label-around-hidden-input pattern in `settings.css`; Finance's CSV import drew the browser's own widget beside migrated Untitled fields | Both now share `~/shared/ui/FilePicker`: the control the browser DRAWS is replaced, the control it PROVIDES is not |
| Status badge | `base/badges` via `UntitledStatusBadge` | Backups and the Goal condition tag drew the legacy `dh-badge`; `StatusPill` now has **zero** product consumers | The tone vocabulary, which is DalyHub's meter language |

### What was deleted

Nine components, verified by reference count against `app/` rather than taken
from this document — which had undercounted by five.

- `DashboardCard`, `MetricTile`, `MetricRow`, `StatCard` — named by UNTITLED-17
  as gallery-only. Confirmed.
- `ExpressiveSummary`, `SupportingSurface` — **no consumer at all.** They
  referenced only each other.
- `CardMetaFact` — no consumer but its own barrel entry.
- `~/shared/card`'s `Timeline` / `TimelineItem` — gallery only. (The `Timeline`
  forty files import is the activity feed's; there were two of that name.)
- `SummaryCards`, its producer `personRelationshipCards`, and the tone helper
  that fed it — UNTITLED-13 removed their one adopter and left them behind.

**The design gallery went with them, and the rule is now written on the route:**
*a fixture may only draw what the product draws.* `/design/card-family` was the
only caller of five of the nine, which is how they survived four passes — a
fixture that outlives its component becomes the consumer, and the deletion never
happens.

### Stylesheets cut

Measured `wc -l` against `origin/main`. **46,488 → 41,940 lines across 87
stylesheets**, and the three that GREW are the point: each is a surface that
genuinely had nothing where it needed something.

- `card-family.css` — **2,643 → 1,356.** The whole of `DashboardCard`,
  `MetricTile`, `StatCard`, `ExpressiveSummary`, `SupportingSurface`,
  `CardMetaFact` and `TimelineItem`, removed by matching each rule's selector
  against the classes surviving markup actually emits.
- `settings.css` — **1,161 → 532.** The surface root, the group card, the row,
  the rail, the danger button, and 110 lines of `dh-settings-switch` /
  `dh-settings-select` that NO markup had emitted since their consumers moved.
- `switch.css` — **203 → deleted.**
- `summary-cards.css` — **94 → deleted.**
- `collection-layout.css`, `filters.css`, `offline.css`, `references.css` — small
  cuts, each one a rule that was repainting a migrated control (below).
- `help.css` **249 → 276**, `views.css` **205 → 214**, `finance.css` **451 → 462**,
  `ai.css` **811 → 818** — all four GREW, and all four grew because this pass gave
  a surface a page frame, a heading rung or a label role it did not have.

### Defects surfaced, and what they were

Eight, and **every one was found by looking at or measuring the rendered page** —
none was failing a test.

1. **Unlayered module CSS was silently repainting already-migrated controls.**
   Six rules in `ai.css`, `filters.css`, `offline.css` (×2) and `references.css`
   re-derived a control's height, padding, border, radius, surface and type.
   MEASURED in Chromium on one identical control, inside and outside
   `.dh-ai-review__field`: **38px tall with an 8px corner and a ring outside the
   rule; 45px with a 10px corner and a 1px border inside it.** The migration had
   happened and could not be seen. This is the recurring defect of the whole
   programme and is why "when a surface migrates, its stylesheet's paint goes
   with it" is now stated at the top of this file.
2. **The Settings rail did not fit the screen.** MEASURED: twelve two-line rows
   at 240px wide make it **1278px tall in a 950px viewport**, at 1024 and 1440
   alike. A persistent navigation column that must be scrolled to reach its last
   four destinations is not persistent. The summary is `md:sr-only` now — still
   the accessible description at every width, visible on the phone where the list
   IS the screen — and the rail is 610px.
3. **A reversible action was painted as permanent destruction**, on two record
   types, while its own RESTORE — no more and no less reversible — drew a calm
   secondary button from thirty-five lines of hand-rolled dialog wiring.
4. **Four Finance admin screens had no page frame.** MEASURED at 1440: heading,
   form and preview table all began at the sidebar's edge and ran to the
   viewport's, while `/finance` itself is inset like every other route.
5. **Nine headings had no type role at all**, so "Import a statement", "Budgets"
   and "Categories" rendered at body size — Tailwind's preflight resets a bare
   heading to inherit. The same defect UNTITLED-17 found on the guided Review.
6. **Help's topic heading and its own first sentence were the same size**, at
   16px/500 against 16px/400 — so a page of thirty topics had nothing but a
   half-step of weight to say where one answer ended. A systematic sweep for the
   defect class (every visible heading whose computed size is ≤ body size and
   whose weight is < 600, across 28 routes) also found Help's contents groups at
   12.5px above 13px links, and Views' group heading at 14px/500 above
   thirty-two 14px/400 rows.
7. **Every Finance form's submit was a full-width slab** from the sidebar to the
   viewport edge — a flex column's `stretch` default, right for its fields and
   wrong for its one button.
8. **The CSV picker was the browser's own widget**, beside migrated Untitled
   fields.
9. **Views was the only collection whose row was not its own tap target.**
   MEASURED at 390px: a 79px row offering a 20px strip, with the record's
   metadata line as dead space beside it. A probe of four other collections
   (People, Assets, Goals, Areas) found every one of them already giving its row
   link a `content: ""` / `inset: 0` overlay; Views had `content: none`.
   Hit-tested after the fix: the row's top, middle and bottom all resolve to the
   link. This is the §37 EntityLink question, answered by measurement — the
   shared component is fine, and one consumer was not.
10. **A Habit's record told an owner who had done everything that they had not.**
    See below: this is the report three passes could not reproduce.

And one this branch CAUSED and the re-pointed E2E suite caught immediately:
`SettingsRow` was translated to `break-words` where the rule it replaced said
`overflow-wrap: anywhere`. Only `anywhere` reduces min-content width. MEASURED at
320px on Privacy & data, whose copy names a long path: a **331px minimum inside a
288px column**, and the document scrolled sideways.

### Verified rather than assumed

- **Horizontal overflow: zero.** 33 routes × 9 widths (320 → 1920), with loaded
  fixtures. Not one document scrolled sideways.
- **Touch targets and accessibility: 151 of 151 pass** (`touch-targets.spec.ts`
  and `accessibility.spec.ts`). A crude independent sweep flagged 84 controls
  under 44px; every one was a false positive the repo's own guards already know
  about — a visually-hidden input whose LABEL is the target, a whole-row link
  overlay, or an inline link inside prose, which §37 exempts by name.
- **The `.dh-topbar` debt was already closed.** Every remaining mention is prose
  explaining why a locator moved. The audit it was really asking for — every
  `.dh-*` selector in an `e2e/` locator, matched against what the markup emits,
  with comments stripped — found **fifteen** dead selectors, six of them
  load-bearing and silently skipping their assertions.

### The Habit report, reproduced at last

Carried forward twice as "could not reproduce from the existing guards". It
reproduces — in the WORDS, which is why three passes reading the arithmetic
never found it.

The three domain guards UNTITLED-17 documented are all correct and all
untouched: `evaluateHabitConsistency` clamps its upper bound to the owner's
today, `activeOn` refuses every day before a Habit's first schedule version, and
a `weekly_count` week contributes nothing unless it has elapsed. So does the
fourth thing UNTITLED-17 named as "arguably correct": `evaluateHabitWeek` counts
the whole week including days still to come, which is a settled decision with its
own argued test — *"it does NOT describe Thursday as incomplete; it says the week
holds seven days."*

The defect is that the Habit RECORD printed that number under the four-week
window's sentence. Both figures said **"Expected check-ins completed"**. That is
true of the four-week window, whose denominator is clamped to today. It is not
true of THIS WEEK. So a daily Habit checked in on Monday, Tuesday and Wednesday
read, on the Wednesday:

> **This week** · 3 of 7 · *Expected check-ins completed*

An owner who had done every single thing asked of them, told they had completed
three of seven expected check-ins — four of which were in the future. That is
the manufactured verdict ADR-102 and AGENTS.md §2 forbid, and it is exactly the
report's words.

The fix is in the record and nowhere else. The week figure now says what the
shared `habitWeekLabel` has always said — it describes the WEEK ("of what this
week asks for") rather than an expectation already incurred — and "Expected
check-ins completed" moves to the window where it is true. That also removed a
duplicate: the four-week figure's supporting line was `habitConsistencyLabel`'s
whole string, so "9 of 12" was printed twice on one line.

`habits.spec.ts` had MEASURED the offending string and recorded it in a comment,
having satisfied itself that "0 of 3" was defensible and never asked about the
words beside it. Its assertion is re-pointed, and the regression guard now runs
on every day of the week rather than only on a Monday: on this surface nothing
may claim a check-in has already been expected of an owner who has had no
elapsed window.

### Named maintenance debt

Each item is a file, a count or a blocked dependency. None is a module.

1. **Two badges.** `~/shared/pill/UntitledStatusBadge` (genuine `base/badges`) is
   used by 18 files; `~/shared/ui/Badge` (`dh-badge` token paint) by **11 call
   sites in 7 files** — `ReviewGuide`, `ReviewInsightsPanel`, `ReportsHome`,
   `DiaryDetailsPanel`, `DiaryTypeFilter`, `PersonSummary`,
   `StayInTouchIndicator`. Both read the same tone vocabulary. This is the
   largest remaining generic-UI duplication. The tension to resolve first:
   `Badge`'s own header argues deliberately against a stadium shape in a 36px
   row, and Untitled's badge is a stadium — so this is a design decision to make
   once, not a mechanical swap. `StatusPill` itself now has zero consumers and
   can go with whatever is decided.
2. **`md-state-layer` has 34 usages across 23 files** — `Drawer`, `Sheet`,
   `Inspector`, `NotificationCenter`, `RecordRow`, `FilterChip`,
   `EntityIdentityPicker`, `SelectField`, `TagsField`, `AppearanceSelector` and
   the rest. This is NOT "one forgotten control", which is the condition under
   which a product-wide Material interaction system should simply be deleted; it
   is a working, tested, single-implementation hover/focus/pressed model with
   two dozen live consumers. Retiring it means migrating those consumers to
   Untitled's own hover treatments, one component at a time, and it wants its own
   pass. All eight hosts in `base.css`'s selector list are live.
3. **`application/progress-steps` for the guided Review's step rail.** Still
   `access: "pro"` and still not retrievable without an interactive login. What
   IS now established: **public** component source is retrievable through the CLI
   (proved by fetching `file-upload-base`), so this is specifically a Pro gate
   rather than a general one.
4. **`application/file-upload`'s drop zone for the attachment picker.** Public,
   retrievable, and a genuine upstream answer to a surface DalyHub built itself
   (`AttachmentPicker` + `AttachmentList` + `AttachmentRow`, ~370 lines). Not
   taken here because attachments were out of scope and have their own
   architectural guard.
5. **`~/shared/ui/Card`.** Now that a settings group is a section rather than a
   card, the question is whether the product still needs a generic bounded box at
   all, or whether every remaining caller wants `TableCard` or a section.
6. **Goals** — a Project inside a Goal record still carries no HEALTH. Carried
   forward unchanged.
7. **The Diary week strip's focus order**, and the inert legacy class names with
   the `.dh-btn` hook and the `.dh-input` / `.dh-control` layout bridges.
8. **A bounded `people.getByIds`**, carried forward from UNTITLED-13.
9. ~~A Habit's expected check-ins before a full week has passed.~~
   **REPRODUCED AND FIXED — see "The Habit report" below.**
10. **`assisted-ai.spec.ts`'s one contended journey.** Times out at 30s when the
    AI specs run together and passes in isolation, because it drives
    `/finance/transactions?uncategorised=1` — every uncategorised row in the
    shared local database, so its cost is a function of what ran before it.
    Fixture scope, not a regression. Not addressed this pass.
