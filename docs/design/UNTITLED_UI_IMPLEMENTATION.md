# Untitled UI React Pro implementation guide

> **Single frontend implementation authority.** DalyHub's presentation layer is
> built from Untitled UI React Pro, Untitled Application UI patterns, Tailwind CSS
> v4 and React Aria. DalyHub owns product/domain behaviour. Do not restore
> Material, MD3, DHDS or another bespoke design system.

This guide governs frontend construction. It does not rewrite backend,
database, migration, Cloudflare, API or business-logic architecture.

## Authority hierarchy

Resolve frontend decisions in this order:

1. DalyHub domain and behavioural requirements.
2. Untitled UI Application UI page patterns.
3. Untitled UI React components.
4. Untitled UI tokens, Tailwind CSS v4 conventions and React Aria interaction
   patterns.
5. DalyHub-specific compositions and semantic extensions.
6. Custom components only where no suitable Untitled solution exists.

[`PRODUCT_PRINCIPLES.md`](../product/PRODUCT_PRINCIPLES.md) owns what DalyHub
is. [`DESIGN_DIRECTION.md`](DESIGN_DIRECTION.md) owns the product-level feel and
composition rules. This file owns implementation. [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md)
records DalyHub-specific compositions and exceptions above Untitled primitives.
[`UNTITLED_UI_MIGRATION.md`](UNTITLED_UI_MIGRATION.md) records migration debt,
sequence and removal criteria.

Untitled UI is the construction system, not visual inspiration. A screen should
look and behave like DalyHub, but its generic controls, page structures,
overlays, forms and responsive patterns should come from Untitled wherever
possible.

## Untitled-first sourcing workflow

For every frontend requirement:

1. State the DalyHub product need and the data/behaviour that must survive.
2. Search Untitled Application UI examples first.
3. Search the Untitled component catalogue.
4. Search already-imported Untitled source in this repository.
5. Search existing DalyHub compositions.
6. Reuse the closest source.
7. Compose product behaviour above the generic primitive.
8. Extend carefully only when the product requires it.
9. Create custom UI only if the previous steps do not solve the requirement.

Do not create custom buttons, inputs, selects, dropdowns, menus, tables, badges,
tooltips, modals, drawers, tabs, avatars, pagination controls, date pickers or
command menus when Untitled UI provides an appropriate implementation.

Useful upstream entry points are the Untitled UI React Pro docs, component
catalogue, Application UI catalogue, theming docs, dark-mode docs, CLI/MCP docs
and icon docs. Search complete page examples as aggressively as individual
controls; DalyHub should benefit from Untitled's finished application patterns.

## Untitled UI reference-first implementation

Untitled UI Pro is available directly to implementation agents. Agents MUST use
the actual library and documentation during frontend work.

For each page, feature surface or substantial component:

1. Search Untitled UI Application UI examples.
2. Search full-page examples where applicable.
3. Search the component catalogue.
4. Inspect existing Untitled components already imported into DalyHub.
5. Read the relevant Untitled UI React documentation.
6. Prefer importing/copying the genuine Untitled implementation over recreating
   it.
7. Adapt that source to DalyHub domain data and behaviour.
8. Preserve Untitled accessibility, responsive behaviour, component composition
   and token usage where practical.
9. Create bespoke UI only where an appropriate Untitled pattern does not exist.

The documentation starting point is:

https://www.untitledui.com/react/docs/introduction

Relevant documentation should be consulted throughout implementation, including
as applicable: introduction, installation, CLI, MCP, theming, dark mode,
typography, icons, components, Application UI, dashboard examples, settings
examples and accessibility/React Aria behaviour.

Do not rely on memory of Untitled UI or reproduce its appearance manually when
the actual source and documentation are available.

For substantial frontend changes, the implementation summary should identify:

- Untitled UI page examples used;
- Untitled UI components used;
- relevant documentation consulted;
- DalyHub-specific extensions/custom components;
- reason for any significant deviation from Untitled UI.

## Source ownership

Organise frontend source conceptually into four layers:

| Layer | Owns | Rule |
| --- | --- | --- |
| Untitled-derived primitives/components | Generic controls, overlays, forms, tables, menus, navigation pieces, application examples and icons | Keep close to upstream source and React Aria behaviour. |
| Shared layouts/application shell | The reusable DalyHub shell, page frames, spacing, navigation, command/search entry points and workspace/user controls | Compose from Untitled Application UI patterns. |
| DalyHub-specific compositions | `TaskRow`, `QuickCapture`, `TodaySchedule`, `GoalProgress`, record headers, entity metadata, domain-specific empty states | Carry product nouns, hierarchy, status and mutation semantics. |
| Feature/domain logic | Loaders, actions, repositories, services, kernels, codecs and business rules | Preserve existing architecture; do not move logic merely to restyle UI. |

Adapt exact paths to existing repository conventions. Do not duplicate Untitled
source across features. When a primitive becomes shared, put it in the shared
source layer and migrate consumers to it.

Current Phase 1 source layout:

- Untitled-derived source lives under `app/shared/ui/untitled/`, including
  `base/buttons`, `base/avatar`, `base/dropdown`, `application/modals`,
  `application/slideout-menus` and `application/table`.
- Tailwind v4 and Untitled theme entry live in
  `app/styles/untitled/untitled.css`.
- The vendored Untitled theme input is
  `app/styles/untitled/theme.source.css`; the DalyHub-adapted generated output
  is `app/styles/untitled/theme.css`.
- The reusable authenticated shell lives in `app/shared/shell/AppShell.tsx`,
  with `Sidebar.tsx`, `DesktopTopBar.tsx`, `MobileTopBar.tsx`, `BottomNav.tsx`
  and `MobileNav.tsx` composing the desktop and mobile navigation surfaces.
- The pathless authenticated route boundary is `app/routes/app-shell.tsx`.

Current Phase 1.5 shell primitive boundary:

- `SearchSurface` and `CommandPalette` preserve DalyHub's command/search
  controllers and product semantics, but their generic modal input, action and
  result chrome uses Untitled command-menu/button primitives and Tailwind v4
  token classes.
- `PaneHeader` is the shared DalyHub page-header composition for migrated pages.
  It follows Untitled page-header structure while retaining DalyHub slots for
  title, supporting text, status, metadata, page search, views, secondary
  actions and one primary action.
- `app/styles/search.css` is removed. `app/styles/command.css` no longer styles
  the command/search surfaces; it only supports the shared keyboard-shortcuts
  help content still used by legacy hosts.
- The `.dh-pane-header*` selectors in `shell.css` remain temporary compatibility
  for legacy collection layouts. Do not add new consumers to that CSS contract;
  migrate pages toward the Untitled/Tailwind composition instead.

## Theme and tokens

DalyHub uses the **Branded Plum** direction through Untitled UI's brand-token
architecture. Purple is for primary, selected and brand interactions; it is not
paint for every surface.

### Branded Plum

Branded Plum is DalyHub's default visual identity: deep aubergine/plum
application navigation around a neutral working canvas, with restrained purple
accents inside the content. It should read as mature, calm and personal, not
bright magenta, candy purple, a gaming palette or a purple wash over every
surface.

- The persistent desktop sidebar is the primary brand field. It uses the dark
  end of the generated Untitled `brand-*` ramp, Untitled on-brand foreground
  roles, subtle translucent separators and quiet selected/hover overlays.
- Mobile navigation uses the same Branded Plum relationship through Untitled's
  slideout/navigation primitives. The compact mobile top bar and bottom
  navigation may remain neutral; their primary and selected controls use the
  same generated brand roles.
- Main canvases, page headers, cards, panels, tables, dropdowns, search and
  command surfaces remain predominantly Untitled neutrals. Page titles and body
  text are not purple by default.
- Light appearance pairs the deep plum navigation with a white or near-white
  neutral canvas. Dark appearance pairs an even quieter near-black plum
  navigation with Untitled's charcoal/neutral dark surfaces; it is designed
  through semantic dark-mode variables, not colour inversion.
- Purple is reserved for primary actions, links, focus, selected controls and
  brand-appropriate progress. Green remains success/completed, red remains
  destructive/error/critical, amber remains warning/attention, and neutrals
  remain structure.
- The complete ramp is generated in `app/styles/untitled/theme.css` from the
  central Branded Plum anchor in `scripts/generate-untitled-theme.mjs`, while
  preserving Untitled's ramp shape. Components consume Untitled semantic roles
  and Tailwind utilities; do not scatter plum hex values or add page palettes.
- Branded Plum is an adaptation of Untitled UI, not a separate DalyHub design
  system. No historical screenshot, temporary review capture or mock-up defines
  its implementation.

The shell treatment was selected from Untitled UI React Pro Application UI
`dashboards-01/03` and `sidebar-sections-subheadings`, plus the public
`mobile-header`, `nav-item` and `nav-account-card` source. Future changes must
search the current Pro catalogue and documentation again rather than treating
those identifiers as an image to reproduce.

Colour roles:

- purple: brand, primary action, selected navigation and active controls;
- neutrals: structure, backgrounds, cards, borders, text hierarchy and most
  repeated UI;
- green: success, completed and positive states;
- red: destructive, error and critical states;
- amber: warning and attention states.

Light and dark modes are both first-class. Use semantic theme roles so
appearance changes are resolved by the theme, not by page-specific selectors.
Do not hard-code visual values where Untitled/Tailwind semantic roles exist.

Relevant official sources for the current theme implementation are
[Theming](https://www.untitledui.com/react/docs/theming),
[Dark mode](https://www.untitledui.com/react/docs/dark-mode),
[Sidebar navigations](https://www.untitledui.com/react/components/sidebar-navigations)
and the [appearance settings example](https://www.untitledui.com/react/components/settings-pages/settings-06).

Existing `--dh-*`, `--app-*` and `--md-*` compatibility layers are migration
machinery. They may remain while old consumers exist, but new generic UI should
not expand them. Add DalyHub semantic extensions only for product meaning that
Untitled does not provide, such as priority, overdue, owner-day scheduling or
entity identity.

## Styling rules

DalyHub's visual direction is modern, calm, mature, personal, highly legible,
information-dense without feeling cramped, restrained, fast to scan and suitable
for prolonged daily use. It should feel closer to a polished productivity
application than an enterprise admin portal.

Avoid glassmorphism, neon or futuristic styling, excessive gradients, excessive
drop shadows, oversized decorative cards, heavily rounded toy-like UI,
dashboard-card overload, cramped metadata, arbitrary page-specific styling and
bespoke visual patterns where Untitled already has an appropriate solution.

Use Untitled/Tailwind spacing, radius, type, focus, shadow and state conventions
as defaults. Depart only for DalyHub density, scanability, mobile reach,
domain-specific semantics or source compatibility during migration. Document
repeatable departures in this guide or [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md).

## Page composition

Use Untitled Application UI examples for shell, dashboards, settings, lists,
tables, filters, forms, drawers and detail pages. Do not paste a generic SaaS
dashboard and swap labels; rebuild around DalyHub's nouns and questions.

Composition rules:

- One reusable application shell provides desktop sidebar, responsive/mobile
  navigation, active-route state, user/workspace control, global search/command
  access and consistent page spacing.
- Page headers are shallow and useful: title, context, primary action and
  relevant controls.
- Repeated entities use lists/tables when scanability matters; cards are
  restrained and reserved for genuinely card-shaped content.
- Drawers/inspectors preserve collection context for record detail/edit when the
  work is short or contextual; full pages remain valid for reading, writing and
  deep records.
- Empty, loading and error states use Untitled state patterns plus DalyHub's
  next-useful-action language.
- Mobile is recomposed, not squeezed: touch targets, safe areas, software
  keyboard behaviour and action order matter more than desktop symmetry.

## Page/module mapping

Use these directions when migrating modules:

| Surface | Untitled direction | DalyHub-specific requirements |
| --- | --- | --- |
| Application shell | Sidebar layouts, mobile navigation, command/search entry points, account/workspace controls | One shell, active route state, consistent spacing, owner/workspace context. |
| Today | Dashboard/Application UI composition | Priority tasks, upcoming meetings, overdue items, goals/habits, relevant activity and quick capture; never a generic analytics dashboard. |
| Tasks | Page headers, tabs, search, filter bars, lists/tables, badges, dropdowns, drawers, dialogs and command-menu patterns | Task rows keep completion, selection, scheduling, priority, project and blocked semantics. Prefer drawers for task detail/edit where suitable. |
| Projects / Areas | Lists/tables, restrained cards, progress, status, filters, tabs and drawers | Preserve Area -> Goal -> Project -> Task hierarchy and rollups. |
| Goals | Metrics, progress, charts, milestone lists, status and activity patterns | Progress remains truthful and connected to Projects, Tasks, Habits and activity without gamification. |
| Habits | Compact checkable rows, calendar/streak-like history views, progress and lightweight metrics | Habits are behaviours, never recurring Tasks; no manufactured streak urgency. |
| Notes | List-detail composition, search, metadata, tags and responsive collapse | Prioritise reading/writing space and exact Markdown preservation. |
| Diary | Content-first, date-led informational layouts | Reflection is chronological and calm, not administrative. |
| Meetings | Informational/detail page patterns | Title, date/time, location, participants, summary, decisions, actions, tasks, notes, transcript and attachments. Outcomes over minutes. |
| People | Directory/table patterns, avatars, filters and detail drawers/pages | Relationship history and care language; never a sales pipeline. |
| Finance | Shared table/metric/chart patterns | No separate visual language; preserve privacy and truthful money semantics. |
| Assets | Structured list/table, category/status metadata and detail views | Real-world status, obligations, maintenance and value facts stay distinct. |
| Life Admin | Shared task, reminder, status and informational patterns | Obligation semantics remain one model whether or not tied to an Asset. |
| Reviews | Informational layouts plus metrics/progress/activity | Reflection and review progress without guilt mechanics. |
| Reports / Insights | Richer dashboard/chart composition | This is the appropriate home for heavier visual analytics. |
| AI Assistant | Shared Untitled/DalyHub primitives | Proposes reviewable changes; never mutates autonomously. |
| Settings | Untitled settings examples | Profile, account, appearance, notifications, workspace, members, integrations, security, data and advanced settings. |

## Accessibility and React Aria

React Aria semantics are part of the implementation contract. Preserve keyboard
operation, focus visibility, focus restoration, screen-reader names, overlay
dismissal, disabled semantics, touch behaviour, reduced motion and forced
colours. Do not strip accessibility behaviour to simplify styling.

Every control has an accessible name. Icon-only controls need labels/tooltips
where appropriate. Mobile and coarse-pointer modes keep accessible target sizes.
Async state, validation and destructive outcomes must be announced clearly.

## Responsive rules

Start from Untitled responsive Application UI patterns and apply DalyHub's
priority order:

- action before context;
- collection context preserved through drawers or route state;
- no hover-only workflow;
- no horizontal overflow at 320px;
- no desktop sidebar on phone;
- sheets and forms remain usable with the software keyboard;
- desktop density never costs touch accessibility on coarse pointers.

Check 393px and 320px for new interaction surfaces.

## Custom component policy

Custom generic UI is exceptional. It is allowed only when:

- Untitled has no suitable component or Application UI pattern;
- forcing the product into an Untitled primitive would materially harm
  accessibility, responsiveness or domain truth;
- an existing DalyHub composition carries real product behaviour that should be
  preserved during migration;
- a compatibility shim is required to migrate consumers incrementally.

When creating or retaining custom UI, name the reason in code or docs, keep the
API narrow, test the behaviour, and record reusable exceptions in
[`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md). The existence of old Material/MD3/DHDS
source is not a reason to keep building on it.

## DalyHub-specific exceptions

Current valid exceptions include:

- asynchronous pickers and search-backed selectors that carry DalyHub data
  semantics;
- task completion/selection/range-selection behaviour;
- owner-day scheduling presets and calendar semantics;
- mobile safe-area and focus-restoration behaviour;
- Markdown editing and preview behaviour tied to exact-source preservation;
- domain status such as overdue, blocked, waiting, archived, completed and
  relationship history.

These exceptions live above Untitled primitives where possible. They do not
authorise another generic design system.

## Today Phase 2 implementation baseline

Today is the first feature surface rebuilt on the shared Untitled shell. Its
composition follows the Untitled Application UI dashboard/page grammar without
copying a generic analytics dashboard: the page header is the shared
`PaneHeader`, the daily work is a dominant task-list section, and schedule,
attention, goals, habits, reflection and review remain secondary sections whose
presence is driven by real DalyHub data.

References selected and verified:

- Official Application UI catalogue topics: `Dashboards 01`, `Dashboards 02`,
  `Metrics`, `Progress indicators`, `Activity feeds`, `Card headers`, `Section
  headers`, `Page headers`, `Calendars` and `Empty states`.
- Genuine source already vendored in this repository:
  `application/command-menus`, `application/empty-state`,
  `application/loading-indicator`, `application/date-picker`,
  `application/section-headers`, `base/buttons`, `base/badges`,
  `base/progress-indicators`, `base/checkbox` and `application/app-navigation`.
- MCP searches for Today dashboard/application examples and components were
  attempted after CLI Pro authentication, but the configured endpoint returned
  HTTP 429 / Cloudflare 1015. No catalogue result or screenshot was treated as
  authority; the implementation uses only verified local Untitled source and
  official documentation.

Today-specific composition is limited to mapping existing task, schedule,
goal, habit, reflection and review facts into the shared page grammar. The
Today screen owns no generic primitive, no new data read and no new mutation
path. The local `today.css` file now contains only Tailwind v4 `@apply`
composition rules for its responsive grid, section spacing and DalyHub-specific
semantic rows; generic control styling comes from Untitled-backed shared
components.

The source and documentation workflow used for this phase was:

1. Authenticate the Pro CLI with `npx untitledui@latest login`.
2. Attempt the Untitled MCP/catalogue searches.
3. Inspect the genuine local source and its provenance headers.
4. Consult the official [Introduction](https://www.untitledui.com/react/docs/introduction),
   [Theming](https://www.untitledui.com/react/docs/theming),
   [Dark mode](https://www.untitledui.com/react/docs/dark-mode),
   [Components](https://www.untitledui.com/react/docs/introduction#components),
   [Page headers](https://www.untitledui.com/react/docs/introduction#page-headers),
   [Progress indicators](https://www.untitledui.com/react/docs/introduction#progress-indicators),
   [Activity feeds](https://www.untitledui.com/react/docs/introduction#activity-feeds),
   [Calendars](https://www.untitledui.com/react/docs/introduction#calendars) and
   [Empty states](https://www.untitledui.com/react/docs/introduction#empty-states)
   documentation topics.
5. Compose DalyHub behavior above those primitives and verify the real route.

No screenshot is a design authority for Today. Temporary review screenshots,
if captured by a future agent, must remain outside the repository's design
assets and must never be referenced as implementation guidance.

## Tasks Phase 3 implementation baseline

Tasks is the first data-dense feature migration after Today. Its presentation
uses the Untitled Application UI grammar for page headers, tables/list hybrids,
filter bars, tabs, dropdown actions, drawers, forms, empty states and
pagination, while the existing DalyHub task projection and mutation routes
remain authoritative.

### Untitled references selected and verified

The authenticated Pro catalogue was queried during this phase. The selected
page foundation is `dashboards-01/02`, whose Application UI template provides a
sidebar application layout, table, filter-bar, select and pagination pattern.
`dashboards-01/09` was also inspected as a reference for dense status-heavy
data and selection controls. Component searches returned and the bundle
resolved successfully for:

- `table`;
- `filters-menu`;
- `project-details-menu`;
- `command-menu-actions`.

The genuine local source used by the Tasks surface is already vendored under
`app/shared/ui/untitled/`, including:

- `application/table` for the available accessible table grammar;
- `application/slideout-menus` for the drawer/slideout interaction model;
- `application/command-menus` for command actions;
- `application/tabs`, `application/date-picker` and `application/empty-state`;
- `base/buttons`, `base/checkbox`, `base/dropdown`, `base/input`,
  `base/select`, `base/badges` and `base/tooltip`.

Tasks uses the existing `TaskList` product composition rather than forcing
task rows into a generic table: the product row includes inline completion,
date, parent and priority editing, touch gestures, selection replacement,
waiting/blocked semantics and optional drop destinations. Those are DalyHub
domain behaviours above the Untitled primitives, not a reason to create a
second generic table system.

### Reference-first workflow and documentation consulted

The Pro CLI session was re-authenticated with `npx untitledui@latest login`.
The catalogue and component bundle calls succeeded with `has_pro_access: true`.
Official documentation consulted during implementation:

- [Introduction](https://www.untitledui.com/react/docs/introduction), including
  the source-code model, Tailwind CSS v4 and React Aria foundations;
- [Theming](https://www.untitledui.com/react/docs/theming), for the purple
  `--color-brand-*` token architecture;
- [Dark mode](https://www.untitledui.com/react/docs/dark-mode), for token-based
  light/dark appearance behaviour;
- [Buttons](https://www.untitledui.com/react/components/buttons),
  [Checkboxes](https://www.untitledui.com/react/components/checkboxes),
  [Filter bars](https://www.untitledui.com/react/components/filter-bars),
  [Drawers](https://www.untitledui.com/react/components/drawers),
  [Tables](https://www.untitledui.com/react/components/tables) and
  [Tabs](https://www.untitledui.com/react/components/tabs).

### DalyHub-specific compositions and custom UI policy

`TaskRow`, `TaskList`, `TaskBulkActionBar`, `TaskRecordDrawer`, recurrence,
dependency and checklist sections, inline task fields, offline feedback and
the saved-view/filter state are retained or composed above Untitled source.
They carry task completion, optimistic/offline writes, recurrence successor
rules, directed dependencies, checklist persistence, selection/range
selection, keyboard focus and canonical route behaviour. Recurrence and
dependency editors are legitimate domain-specific compositions because
Untitled has no DalyHub task model; their controls still use the shared
Untitled-backed form/select/checkbox/drawer primitives.

This phase creates no new generic button, input, select, table, menu, drawer,
badge or dialog primitive. The Tasks create action uses the shared genuine
Untitled-backed `Button`; collection search and the filter trigger use the same
button/input sources; and active filter indicators and task status use the
genuine Untitled `Badge` source. Existing legacy class names remain only as
temporary layout/test hooks for unmigrated consumers and are not new design
authority.

No screenshot, historical visual audit or legacy Material/MD3/DHDS stylesheet
is an implementation reference for Tasks.

## Untitled UI Reference-First Implementation

Untitled UI Pro is available directly to implementation agents. Agents MUST
use the actual library and documentation during frontend work. The official
starting point is the [React introduction](https://www.untitledui.com/react/docs/introduction).

For each page, feature surface or substantial component, agents must search
Application UI examples, full-page examples where applicable, the component
catalogue, existing imported Untitled source and the relevant React
documentation. Prefer importing or copying the genuine implementation, then
adapt it to DalyHub data and behaviour while preserving Untitled accessibility,
responsive composition and token usage. Bespoke UI is permitted only when no
suitable Untitled pattern exists.

Consult the relevant [introduction](https://www.untitledui.com/react/docs/introduction),
[installation](https://www.untitledui.com/react/docs/installation), [CLI](https://www.untitledui.com/react/docs/cli),
[MCP](https://www.untitledui.com/react/docs/mcp), [theming](https://www.untitledui.com/react/docs/theming),
[dark mode](https://www.untitledui.com/react/docs/dark-mode), typography, icons,
components, Application UI, dashboard, settings and React Aria accessibility
documentation throughout implementation. Do not rely on memory or manually
reproduce an Untitled appearance when the actual source is available.

Substantial frontend implementation summaries must identify the Untitled page
examples and components used, documentation consulted, DalyHub-specific
extensions/custom components, and reasons for significant deviations.

## Tasks Phase 3B completion record

The authenticated Pro catalogue was available for this pass (`has_pro_access:
true`). Exact references inspected were Application UI `dashboards-01/02` for
the sidebar/table/filter/pagination grammar and `dashboards-01/09` for dense
status-heavy selection tables. Component references were `table`,
`filters-menu`, `project-details-menu` and `command-menu-actions`.

| Tasks surface | Untitled source/reference | DalyHub adaptation | Legacy remaining |
|---|---|---|---|
| Page header | Application UI page-header grammar; shared `PaneHeader` | Task title, view context and actions | Shared header compatibility classes |
| Main collection | `table` inspected; semantic list composition retained | Inline editing, gestures, selection, blocked/waiting and persisted ordering | `task-list.css` layout rules |
| Search | `base/input` via shared `Input` | Existing URL/search state | Collection compatibility selectors |
| Filters | `filters-menu`; shared button/popover/sheet sources | Existing filter reducer, URL state and mobile behavior | Collection filter layout CSS |
| Active filters | `base/badges` via genuine `Badge` | Existing removable filter links | Chip spacing hooks |
| Status | `base/badges` via genuine `Badge` | DalyHub status labels and tones | Row state layout hook |
| Selection/bulk | `base/checkbox`, buttons and menu sources | Existing range/select-all and atomic mutations | Bulk toolbar layout CSS |
| Row actions | `project-details-menu` / dropdown patterns | Existing task actions | Product row positioning |
| Drawer | `application/slideout-menus` inspected; shared boundary retained | URL-backed record stack and focus restoration | `task-drawer.css` |
| Task form | Untitled-backed inputs, selects, date picker and buttons | Existing validation and domain fields | Form layout selectors |
| Recurrence | Untitled inputs/selects/buttons | DalyHub recurrence and successor rules | Domain editor layout |
| Dependencies/checklist | Untitled checkbox/input/menu primitives | Directed links and checklist persistence/order | Domain section layout |
| Empty/loading/error | `application/empty-state` and loading sources | Existing no-result, offline and error semantics | Shared task state classes |
| Pagination | Untitled pagination inspected | Cursor/keyset `LoadMore` retained to preserve behavior | Load-more layout hook |
| Board/mobile | Application UI responsive grammar and shared primitives | Existing board sectors and mobile detail behavior | Board/task compatibility styles |

The main list and drawer are DalyHub compositions above genuine Untitled
primitives, not a second generic UI library. Forcing generic table or slideout
markup into the record would remove task semantics rather than migrate
presentation. No new generic primitive or visual token layer was introduced.

## Phase 4 completion record — collections, the Record Layout and the shared primitives

The authenticated Pro catalogue was available for this pass (the MCP connector
reported `has_pro_access: true`). **The Untitled CLI could not be authenticated
in this environment**: `npx untitledui@latest login` starts a local callback
server and opens a browser at
`https://www.untitledui.com/react/api/cli-auth?port=<localhost port>`, which a
headless remote container cannot complete, and the MCP connector returns
metadata plus the CLI command rather than source. Free-tier component source was
still retrievable directly from `https://www.untitledui.com/react/api/components`,
and the genuine Pro source vendored into `app/shared/ui/untitled/` by the earlier
phases was the material this phase built from. Nothing was recreated from memory
and no unavailable example name, snippet or screenshot was invented.

Catalogue references inspected for this phase: page templates
`informational-01/13` (a project detail: breadcrumb, page header, tab rail,
split content with an activity column), `informational-02/06` (a filterable
collection table with status badges and progress bars), `dashboards-02/02` and
`dashboards-01/02` (the filter-bar-plus-table grammar the Tasks phase adopted),
and components `table`, `filter-bar`, `application/tabs`, `application/pagination`,
`application/empty-state`, `base/badges`, `base/button-group`, `base/input`,
`base/progress-indicators` and `foundations/featured-icon`.

| Surface | Untitled source | Structural change | Legacy remaining |
|---|---|---|---|
| Projects table | `application/table` (`TableCard.Root` + React Aria `Table`), `dashboards-01/02` filter bar | Hand-written `<table class="dh-ptable">` replaced; Status column added; fixed layout so the table fits its card at every width | Inline Area picker and DS-12 overflow (product controls) |
| Projects card | Untitled card boundary, `LabelledProgressBar` | `dh-pcard` presentation deleted; phone row composition moved into the component | `dh-pcard*` class names as test hooks |
| Projects toolbar | `application/tabs` (underline), `application/tabs` (button-border), `base/input` | Lifecycle rail, presentation toggle and search all Untitled | — |
| Record header | Untitled page-header anatomy, `base/badges`, Untitled `Button` | `record-header*`, `record-title`, `record-status`, `record-action`, `record-context-item` presentation deleted | Two intrinsic-sizing rules for the inline title editor |
| Record tabs | `application/tabs` (underline) over React Aria | Hand-rolled WAI-ARIA tabs (roving tabindex, arrow keys, Home/End, wrapping, disabled skipping) replaced by the library's | Phone "More sections" accelerator, lazy panel, `surface="plain"` |
| Record summary band | Untitled card grammar, `LabelledProgressBar` | `dh-record-summary-bar*` presentation deleted | `data-density` as the caller's prose/derived-state declaration |
| Entity card / row list | Untitled card boundary, `LabelledProgressBar` | `dh-ecard*`, `dh-erow*` and both phone blocks deleted | `dh-ecard*` / `dh-erow*` class names as hooks |
| Areas | The above, plus Untitled empty state and toolbar | Gallery and row list both Untitled surfaces | — |
| Goals | `application/tabs` for the lens rail and the pane rail; Untitled card grammar for both halves of the master–detail | `goals.css` keeps layout only | Measurement panel and chips (domain compositions) |
| Empty states | `application/empty-state` + `foundations/featured-icon` | `empty-state.css` deleted product-wide | `size="inline"`, the record-level absence |
| View switcher | `application/tabs` (button-border / button-minimal), `base/button-group` | `segmented-filter.css` and `view-tabs.css` deleted | — |
| Collection search | `base/input` | Legacy control chrome deleted | Phone reveal, Escape contract, Clear affordance |
| Load more | `application/pagination` card footer | `load-more.css` deleted; keyset cursor unchanged | — |

### Deliberate deviations from upstream, and why

- **`EmptyState.Title` is an `<h1>` upstream.** DalyHub renders empty states
  inside record tabs, collections and drawers, three of which can be on screen
  at once. The caller's `headingLevel` is carried as `aria-level`, which is what
  assistive technology reports, so the genuine component still draws the title.
- **`ProgressBarBase` has no accessible name.** `overrides/labelled-progress-bar.tsx`
  keeps upstream's geometry, token classes and transform-not-width technique and
  adds `aria-label` / `aria-valuetext`, because a DalyHub measure always
  announces the same sentence the surface states in words.
- **`Badge` spreads no arbitrary props.** `UntitledStatusBadge` wraps it in a
  `display: contents` span carrying `data-dh-badge` and the tone, rather than
  editing a file `scripts/vendor-untitled.mjs` regenerates.
- **The record tab strip activates on focus.** Untitled's default is manual
  activation; DalyHub's record tabs have always activated on focus, and changing
  that for every record is not a migration decision.
- **The presentation switcher is tabs, not a button group.** A URL-backed
  switcher has to stay made of real links — deep-linkable, middle-clickable and
  correct with no JavaScript — and only `application/tabs` takes an `href`.

### The cascade, and the one thing that had to move

Unlayered CSS beats layered CSS unconditionally, and `untitled.css` deliberately
puts all of Tailwind inside layers so legacy screens are untouched. That is
correct for a legacy screen and wrong for a zero-specificity FLOOR: `base.css`'s
`:where(a)` and its native-control rules were outranking `text-primary` and
Untitled's control chrome on migrated components. Those rules now live in a
`dh-floor` layer declared between Tailwind's `base` and `components`, which is
exactly what their own notes always claimed they were. Legacy unlayered
stylesheets still outrank everything in it.

The corollary is a rule for the rest of the migration: **a migrated component
never borrows a legacy class that still has rules attached to it.** Where a
class name survives as a test hook, its presentation is deleted in the same
change.

## Phase 5 completion record

Phase 4 migrated the STRUCTURE of nine surfaces. Phase 5 is the finding that
came out of proving it: the structure was Untitled's and the PAINT was not.

### The button, and why "it contains an Untitled Button" was not migration

DS-02 built the shared `<Button>` on `base/buttons/button`, and
`buttonClassName` then emitted `dh-button dh-btn dh-btn--primary` alongside
Untitled's own utility classes. `ui.css` is unlayered; Tailwind's utilities live
in `@layer utilities`; an unlayered declaration beats a layered one
unconditionally whatever the specificity. So every `<Button>` in the product
carried Untitled markup, Untitled ARIA and Untitled focus behaviour, and was
painted by `ui.css`. Height, radius, fill, border, type rung and hover treatment
were all overridden — on every surface Phase 4 had declared migrated.

Three unlayered stylesheets were doing it, and each is now scoped
`:not(.dh-button)`:

| Stylesheet | What it was overriding | Effect |
|---|---|---|
| `ui.css` button section | The whole control | Legacy violet fill, 10px radius, legacy height |
| `premium.css` `.dh-btn` | `box-shadow: none` | Untitled draws its border (`ring-1 ring-primary ring-inset`) AND its lift (`shadow-xs-skeuomorphic`) through `box-shadow` — one `none` erased every secondary button's edge |
| `collection-layout.css` `.dh-collection-controls__trigger` | A second copy of a secondary button | The one control in every collection header was a different radius from every other button on its row |

`.dh-btn` stays ON the markup as a HOOK, because thirteen module stylesheets
carry layout rules that name it (`.dh-record-toolbar > .dh-btn`,
`.dh-settings-row__control .dh-btn`, `.dh-review-guide__nav .dh-btn`). Two rules
still reach both deliberately: the `(hover: none)` touch floor, because
Untitled's heights sit under the 44px target the product guarantees on a coarse
pointer, and reduced motion. `.dh-button` also left the shared state-layer host
list in `base.css` — Untitled draws hover and pressed as real container changes,
so a `currentColor` wash on top is a second hover state, and on a primary button
a white film over the accent.

### The 201 literals, and why they had to go now

With the component painting correctly, DalyHub drew two different primary
buttons side by side: `<Button variant="primary">` in Branded Plum
(`--color-bg-brand-solid`, rgb(105 63 117)) and a hand-written
`className="dh-btn dh-btn--primary"` in the legacy `--accent` violet
(rgb(91 75 214)). "Add a measurement" on a Goal record and "New habit" on the
Habits header were different colours on the same shell.

Every literal — 201 across 85 files — now calls `buttonClassName()`, which is
rebuilt on the vendored component's own exported `styles`, so an element that
cannot BE an Untitled button (a `DrawerTrigger`, a router `Link`, a `<label>`
acting as a file picker) gets the identical paint from the identical source.
The DOM does not change at all, which is what makes a sweep this wide
reviewable. `.dh-btn--filled` and `.dh-btn--text` had no rules in any stylesheet
and rendered as the bare base control; they map to primary and subtle, which is
what their names claim and what their call sites intend.

### Habits and the glance row

| Surface | Untitled source | Structural change | Legacy remaining |
|---|---|---|---|
| Habits table panel | Untitled card boundary (`application/table`'s `TableCard.Root` grammar) | `.dh-habits__main`'s border/radius/background deleted; drawn by `HabitsCollection` | The four-column grid and its container queries (`HabitList` owns them) |
| Habits rail cards | Untitled card boundary | `.dh-habits-card` deleted; one `RAIL_CARD` constant | `__head` / `__title` / `__count` typography |
| Habits actions | Untitled `Button` via `ButtonLink` | Both `dh-btn` anchors converted | — |
| Habits footer door | Semantic tokens | `.dh-habits__footer-link` deleted | — |
| Glance row (`StatCard`) | Untitled card boundary + hover lift | `.dh-stat`'s border/radius/background/shadow and `.dh-stat--interactive`'s lift deleted | The three-row grid the ring spans |

`StatCard` is shared, so the Analytics, Reviews and Today glance rows move with
Habits. The hover lift is applied only where the card is a link: a figure you
cannot go and look at has no hover state to earn.

Habits could not be judged on the shared E2E seed, which renders the "No habits
yet" empty state. `scripts/ux-02-seed.mjs` — the fixture written for exactly
this — seeds eight active Habits, one archived and five weeks of check-ins.

### Verification by computed style, not by eye

A script walks every `.dh-button` on eighteen routes and asserts the brand fill
on primaries, a real `box-shadow` on primaries and secondaries, and Untitled's
8px radius on all of them. That is what found `premium.css` and the collection
controls trigger; neither is visible in a diff and both are easy to miss in a
screenshot.

## Phase 6 — Areas

Phase 4 gave Areas migrated shared PRIMITIVES. Phase 6 is the finding that came
out of using them: the primitives were Untitled's and the COMPOSITION above them
was still AREA-01's, and it answered the wrong questions.

### Untitled references selected and verified

The MCP connector authenticated (`has_pro_access: true`) and was used for
catalogue search and page-template selection. The Untitled CLI still cannot be
authenticated in this environment for the reason Phase 4 recorded: `npx
untitledui@latest login` completes an OAuth callback to a localhost port, which
a headless remote container cannot reach, and the connector hands back the CLI
command rather than source. Free-tier component source remains retrievable from
the public component API (`POST https://www.untitledui.com/react/api/components`),
which reports Pro paths as `pro` rather than serving them. Pro source therefore
came, as in every phase since Phase 4, from the genuine vendored tree under
`app/shared/ui/untitled/`, imported from a licensed checkout. No Pro component
was recreated from memory and no unavailable example or snippet was invented.

Page templates inspected this pass:

- `informational-02/06` — a filterable collection page: three summary metric
  cards, a filter toolbar, and a data table carrying status badges and usage
  progress bars. This is the grammar the Areas collection's control band and the
  Areas table follow.
- `informational-01/13` — a record page: breadcrumb, page header, tab rail, and
  split content with an activity column. This is the grammar the Area record's
  Overview follows, with DalyHub's activity feed as a section rather than a
  column because an Area record has no second column at 1024.
- `dashboards-01/02` — the filter-bar-plus-table band Tasks and Projects already
  carry, reused unchanged.

Components used, all from the vendored tree:
`application/table` (`TableCard.Root`, `Table`, `Table.Header`, `Table.Body`,
`Table.Row`, `Table.Cell`), `application/section-headers`' `SectionLabel`,
`application/tabs` (through the shared `RecordTabs` and `ViewSwitcher`),
`application/empty-state`, `base/badges` (through `UntitledStatusBadge`),
`base/buttons`, and the DalyHub overrides `labelled-progress-bar` and
`table-head`.

### What moved

| Surface | Untitled source | Structural change | Legacy remaining |
|---|---|---|---|
| Areas gallery | Untitled card boundary + divided footer band, `base/badges` | `EntityCard` replaced by `AreaCard`: permanence where a Project card puts its measure, and a fact strip where it puts its meta line | `dh-areacard*` class names as hooks, all unstyled |
| Areas dense view | `application/table` (`TableCard.Root` + React Aria `Table`) | `EntityRowList` deleted; the nouns became column headings and the row grammar became React Aria's | — |
| Areas control band | `dashboards-01/02` filter bar | A band whose only occupant was a two-option toggle now states the collection's shape | — |
| Area Overview | `application/section-headers`, `application/table`, Untitled card boundary | Three figures restating the tab badges replaced by the records themselves, attention first | — |
| Area Projects tab | `application/table` via the shared `ProjectSummaryList` | A second Project design inside Areas replaced by the `/projects?present=table` column vocabulary | — |
| Goal Projects tab | The same shared list | A third Project design replaced by the same one | — |
| Area Settings | Untitled tokens and utilities | The delete-blocked list drawn from `areas.css` rules replaced by bounded rows | The shared `~/shared/settings` chrome — see the deferred note below |
| Area record ErrorBoundary, Activity tab | — | `areas.css` layout classes replaced by utilities | — |

### Deliberate decisions worth recording

**The Areas collection states no health, and that is a decision.** DalyHub has
an authoritative Area evaluator (`evaluateAreaMomentum`), but it needs
per-Project health facts for every Project aligned to the Area — a read a
bounded collection page does not do and must not start doing per row. A second,
weaker momentum computed from the counts alone would let the same Area read
"steady" in the gallery and "Needs attention" on its own record, which is
exactly the third-measure drift STEER-03 spent a phase removing from Goals. The
one state either presentation draws is the genuine ABSENCE, in the record's own
words ("No active work"), derived from the same three counts the record's own
empty check uses — so it agrees with the record's `empty` momentum in every
case.

**Grid leads, and the table follows.** UIX-02 put Areas on rows for two stated
reasons: an Area card was a Project card with renamed fields, and the cards were
mostly empty. The first stopped being true when Projects got `ProjectCard`; the
second stopped being true when Areas got `AreaCard`, which is built around what
an Area actually has. `?present=list` is no longer one of this collection's
presentations and falls to the default, which is what `allowed` is for.

**The Area record measures Projects and never the Area.** A Project inside an
Area genuinely completes, so the Overview's Project bars are legitimate. What
must never exist is a bar named for the Area: its task roll-up spans every
Project under it, so the figure moves when unrelated work finishes and a mature
Area sits near 100% for ever, reading as "nearly done" about a part of a life.

**Areas has no search, and that is also a decision.** `listAreas` has one
ordering and no text filter; `searchAreas` returns a different, thinner
projection without roll-ups or identity. Narrowing the loaded page in the
browser would be a lie about a paginated collection, and giving the collection a
server-side text filter is a repository change rather than a presentation one.
A person has a handful of Areas; the collection fits on one screen.

**The creation flow was audited and kept.** The New Area drawer is two fields —
a title and the identity picker — on Untitled-backed form controls, opened from
the collection and preserving its context. It already satisfies "stay where you
are, change the thing in context, continue working", and Untitled's own
`new-project-modal` and `create-event-menu` patterns are heavier than the task
warrants.

### Deferred

Record Settings tabs draw `~/shared/settings`' own bordered groups inside a
`surface="panel"` record panel — a frame inside a frame, on Areas and on
Projects alike. It is a property of the shared settings chrome rather than of
either module, and `tone="danger"` on a reversible Archive group is the same
shared decision: both belong to the Settings phase, which the migration guide
already sequences, and fixing one module alone would diverge it from the
benchmark.

`SerializedGoalProjectItem` carries no identity or health, so a Project drawn
inside a GOAL record has a neutral mark and no signal column. Extending that
projection is Goals' migration, not this one.

## Phase 7 completion record — Goals

The authenticated Pro catalogue was available for this pass (`has_pro_access:
true`), and its SCREENSHOTS were studied rather than its names merely listed.
The CLI remains unauthenticatable here: `npx untitledui@latest login` completes
an OAuth callback to a localhost port a headless remote container cannot reach,
`add` on a Pro component answers "🔒 … requires PRO access", and the connector
returns metadata plus that command rather than source. Pro source came from the
vendored tree under `app/shared/ui/untitled/`, as in every phase since Phase 4.

Page templates consulted: `dashboards-01/16` (its three "savings goal" tiles —
mark, name, figure, thin bar, in a bounded card), `dashboards-02/02` (metric
cards in a divided band above a table with progress columns),
`settings-02/13` (a plan card whose one action lives in a divided footer under
the bar), `informational-01/13` (the record page shape) and `dashboards-01/06`
/ `dashboards-01/09` (dense status tables with row actions).

| Goals surface | Untitled source | How it is used | Custom remaining, and why |
| --- | --- | --- | --- |
| Collection frame | Shared `CollectionLayout` over `application/tabs` | Title, lens rail, empty and error states | The lens rail's own horizontal strip, for six lenses at 320px |
| Master list panel | `application/table` (`TableCard.Root` + its header anatomy) | Header with a count badge, divided body, divided footer action | — |
| Goal row | `base/progress-indicators` (via `ProgressTrack`), Untitled's divided list body and surface roles | Mark, name, Area, status, movement, bar, honest value | `ProgressRow` composes them; the row's FACTS are DalyHub's |
| Detail pane | Untitled's in-card band rule | Identity, the standing band, the measurement workspace, the Projects | Master–detail geometry (a data attribute a container query cannot read) |
| Status / alignment / condition | `base/badges` via `UntitledStatusBadge` | Every chip on every Goal surface | `GoalConditionTag` renders nothing for "Pursuing" — a product rule |
| Metric band | A divided Untitled band | Current / Target / Target date | Which three figures, and that an absent one is stated |
| Progress bar | `base/progress-indicators` via the `labelled-progress-bar` override | The one linear indicator in the product | The override's name, valuetext, tone and forced-colours handling |
| Acts | `base/buttons` via `Button` / `buttonClassName` | "Log weight", "Edit measurement", "Add goal", the chips' actions | — |
| Pace band | Untitled tokens and the in-card band rule | Recent, required and projected pace | Which figures the evaluator will produce |
| Trend chart | `application/charts-base` via `MeasurementTrend` on the shared chart foundation | Measured readings, the required path, the target and the baseline | The frame, the `role="status"` readout, the dash-pattern references and the conditional projection — all in `ChartFrame` / `MeasurementTrend` |
| Reading history | `application/table`'s cell/head/row classes, `base/dropdown` via `Menu` | Date / Value / Change / Note, with one row menu | A semantic `<table>`, not React Aria's grid: not sortable, not selectable, and a keyboard grid between the owner and five dates costs more than it gives |
| Stages | `base/checkbox`, `base/input`, `base/dropdown` | The checklist, its add row and its item menu | `SortableList` — Untitled has no sortable list, and the drag, the keyboard move and the whole-order write are domain behaviour |
| Measurement chooser | `base/radio-buttons` | Four described strategies, in the sheet and in New Goal | The CARD around each option, so four two-line strategies read as four choices |
| Unit suggestions | `base/button-group` | A real `ToggleButtonGroup` | — |
| Link-a-Project picker | `base/input`, Untitled's divided list body and card boundary | Search field, results, hover and focus | The debounced server-backed search |
| Empty states | `application/empty-state` | Unmeasured, no readings, no Projects, no Goals | `size="inline"` at record level |
| Projects inside a Goal | The shared `ProjectSummaryList` (`application/table`) | The same column vocabulary `/projects?present=table` uses | Health is still absent from the projection — a deliberate read boundary |

### Rejected, and why

- ~~**`application/charts-base`** (public, so genuinely available). A Recharts
  composition; Recharts is not a dependency of this product. Adding one to a
  Workers SSR bundle to redraw a chart that already carries a single tab stop
  with arrow-key stepping, a `role="status"` readout, references told apart by
  dash pattern rather than hue, and a projection drawn only when all three of
  its facts exist, would cost bundle weight and accessibility for house style.~~
  **REVERSED by UNTITLED-11 and [ADR-126](../decisions/ARCHITECTURE_DECISIONS.md#adr-126-a-chart-is-an-untitled-recharts-plot-on-one-shared-foundation--the-phase-7-rejection-reversed-on-measurement-and-the-behaviour-untitled-had-no-equivalent-for-kept).** Both halves of that reasoning
  failed measurement. The weight is real but bounded and lazy — the chart chunk
  is about 400 KB raw, code-split onto the routes that draw a plot — and the
  accessibility argument was against Recharts' DEFAULT rather than against the
  library: `accessibilityLayer` gives the same single tab stop with arrow-key
  stepping, and the readout, the dash-pattern references and the conditional
  projection are DalyHub's composition on top, which transferred without loss.
  What the rejection did not price was the DUPLICATION: every custom plot
  re-derived its own scales, ticks and domain, and they disagreed — the Goal
  trend's axis read 93.4 / 88.6 / 82.6 kg because nothing owned the question of
  what a readable tick is. The chart is `MeasurementTrend` now.
- **`base/progress-circles`.** A ring would be a second, rounder way of saying
  what the bar already says, and the Goals brief rules out "meaningless rings
  everywhere" by name.
- **`application/metrics`, `application/activity-feed`, `application/progress-steps`.**
  Pro-only and not in the vendored tree, so unavailable here. Their grammar was
  studied through the connector's screenshots and expressed with the vendored
  card, band and section-label sources instead; `progress-steps` would in any
  case have been wrong for milestones, which are unordered-completion stages
  rather than a wizard's linear steps.
- **`base/tags`' `Tag`.** A `TagGroup` is a React Aria selection collection
  whose items are selected or removed; a Goal's Project chips are destinations,
  so they stay links wearing Untitled's `modern` badge geometry.
- **Untitled's `TableRowActionsDropdown`.** Upstream's is a fixed
  Edit/Copy/Delete demo; the shared `Menu` is the same `base/dropdown` source
  with the product's own items, tones and focus restoration.

### Documentation consulted

[Introduction](https://www.untitledui.com/react/docs/introduction),
[Theming](https://www.untitledui.com/react/docs/theming),
[Dark mode](https://www.untitledui.com/react/docs/dark-mode),
[CLI](https://www.untitledui.com/react/docs/cli),
[MCP](https://www.untitledui.com/react/docs/mcp),
[Tables](https://www.untitledui.com/react/components/tables),
[Progress indicators](https://www.untitledui.com/react/components/progress-indicators),
[Badges](https://www.untitledui.com/react/components/badges),
[Radio groups](https://www.untitledui.com/react/components/radio-groups),
[Button groups](https://www.untitledui.com/react/components/button-groups),
[Checkboxes](https://www.untitledui.com/react/components/checkboxes),
[Inputs](https://www.untitledui.com/react/components/inputs) and
[Empty states](https://www.untitledui.com/react/components/empty-states).

No screenshot, historical visual audit or legacy Material/MD3/DHDS stylesheet is
an implementation reference for Goals.

---

## UNTITLED-11 completion record — Habits, charts, Today and the shared primitives

### Pro research, and what it actually returned

The authenticated connector reports `has_pro_access: true` and was searched
before anything was built, for every pattern in this pass: `chart`, `line
chart`, `bar chart`, `metrics`, `habit`, `tracker`, `streak`, `checklist`,
`checkbox list table row`, `table`, `toggle group`, `segmented control`,
`icon button`, `button utility`, `input`, `text input`, `dashboard`, `today`,
`activity feed`, `calendar week`, `progress`, `empty state`. Pro entries come
back as metadata plus a screenshot URL and the `npx untitledui add` command;
`get_component` on a Pro entry answers with the lock and that command rather
than with source.

The CLI is still unauthenticatable in this container — `npx untitledui@latest
login` completes an OAuth callback to a localhost port a headless remote cannot
reach — so Pro source came from the vendored tree under
`app/shared/ui/untitled/`, exactly as in every phase since Phase 4. One
component was NOT in that tree and is `access: "public"`:
`application/charts-base`. Its genuine source was fetched from Untitled's own
public component API (`POST https://www.untitledui.com/react/api/components`
with `{"components":["application/charts-base"],"version":"8"}`) and vendored at
`app/shared/ui/untitled/application/charts/charts-base.tsx`. Its provenance
header says so, names the ONE hand-applied patch (`payload.toReversed()` →
`[...payload].reverse()`, because the app's `lib` is ES2022), and
`scripts/vendor-untitled.mjs` records it in `API_SOURCED` so the orphan sweep
does not delete a file the Pro delivery does not contain.

Screenshots studied rather than names merely listed: `metrics` (Pro — the
figure/label/delta band), `charts-base`'s own examples, the
`notification-settings-checkbox-menu` and `labels-menu` slideouts (Pro — the
checkbox-row rhythm), and the `dashboards-01` / `dashboards-02` dashboard
templates for the action-led arrangement Today needed.

### Habits

| Habits surface | Untitled source | How it is used | Custom remaining, and why |
| --- | --- | --- | --- |
| Collection frame | Shared `CollectionLayout` over `application/tabs` | Title, lens rail, empty and error states | — |
| The one bounded card | `application/table` (`TableCard.Root` + its header anatomy) | Header, standing band, table body, divided footer | The rail that used to sit beside it is deleted, not restyled |
| Standing band | Untitled's in-card band rule and its divider roles | Three figures: due today, kept this week, at risk | ADR-104 — every figure states its denominator, and the denominator is `sr-only` at phone width rather than absent |
| Habit table | `application/table`'s cell / head / row classes, inside `@container/habits` | Name, cadence, today, this week, streak, next due, row menu | A semantic `<table>`, NOT React Aria's grid: a keyboard grid puts a mode switch between the owner and the page's primary act, which is the check-in. Same precedent as the Goal reading history |
| Check-in control | Not Untitled's — the product's own shared completion control | One tap per day, from the collection, with no detail page in the way | D7 — completion is the 20px rounded square and selection the 18px square, and a check-in is the SAME act the Task row's control performs. Adopting Untitled's checkbox here would give one product two completion controls |
| Week strip | Untitled's surface and border roles | Seven day cells, with an `aria-hidden` letter head | A `<ul>` on one `grid grid-cols-7`, stated once so the head and the body cannot drift |
| Row menu | `base/dropdown` via the shared `Menu` | Edit, archive, delete | Product items, tones and focus restoration |
| Record header | `application/section-headers` via the `section-heading` override | The habit's name, cadence and acts | The override adds `level` — upstream's `SectionLabel.Root` hard-codes `h3`, which fails axe under a record's `h1` |
| Record summary | `application/table` band anatomy + the chart foundation | Standing band, twelve-week adherence, four-week dot grid, notes, schedule history | `HabitSummaryTab` composes them; the FACTS are DalyHub's |
| Adherence chart | `application/charts-base` via `PeriodicAdherence` | Twelve weeks of completed and shortfall COUNTS | Integer ticks — half a check-in does not exist |
| Creation and editing | `base/input`, `base/select`, `base/checkbox`, `base/button-group` | The whole New/Edit form | `ToggleGroupField` — see the rejection below |
| Empty states | `application/empty-state` | No habits, nothing due, an archived lens with no rows | `size="inline"` at record level |

`habits.css` went from 1,093 lines to 553: the dot's states, the four-week
grid and the forced-colours block are what survived. Everything else was paint
Untitled now owns.

### Charts

| Chart surface | Untitled source | How it is used | Custom remaining, and why |
| --- | --- | --- | --- |
| The foundation | `application/charts-base` (vendored from the public component API) | `ChartLegendContent`, `ChartTooltipContent`, `ChartActiveDot`, `selectEvenlySpacedItems` | One patch, recorded in the file header and in `PATCHES` |
| The frame | Untitled's card and text roles | `ChartFrame` — reserved block size, client-only mount, legend slot, reduced-motion signal, `role="status"` readout | `summary` is a REQUIRED prop: a plot whose content exists only as geometry is not shippable |
| The paint | Untitled's border, text and foreground roles | `chart-theme.ts` is the ONE place a plot's colour, dash, tick, height and margin are named | `--dh-chart-series` — the brand ramp by default, the record's identity hue under `[data-identity]` |
| Goal trend | Recharts `ComposedChart` under the foundation | `MeasurementTrend` — measured area, dashed required path, target and baseline reference lines | `niceDomain()`, time-spaced x ticks, and a projection drawn only when all three of its facts exist |
| Habit adherence | Recharts `BarChart` under the foundation | `PeriodicAdherence` — completed and shortfall, stacked | Counts, never a ratio without its denominator (ADR-104) |

The decision to adopt Untitled's charts at all — and to reverse Phase 7's
rejection — is [ADR-126](../decisions/ARCHITECTURE_DECISIONS.md#adr-126-a-chart-is-an-untitled-recharts-plot-on-one-shared-foundation--the-phase-7-rejection-reversed-on-measurement-and-the-behaviour-untitled-had-no-equivalent-for-kept).

### Today

| Today surface | Untitled source | How it is used | Custom remaining, and why |
| --- | --- | --- | --- |
| Page head | Untitled's page-header text roles | Greeting and date, as PAGE CONTENT with no card around it | The greeting is domain copy that changes with the hour |
| The two columns | Untitled's card and surface roles | An action column and a context column, each a flex column | Two independent columns, NOT a twelve-column grid: auto-placement gave every panel its own row and left a ~700px hole. DOM order is reading order is tab order — there is no CSS `order` |
| Now / Next pair | `application/table` card anatomy | An explicit pair that becomes one column when either is absent | A half-width panel with nothing beside it reads as a fragment |
| The day | `application/table` card anatomy, the shared Task row | Overdue, due, scheduled — one grammar with `/tasks` | The bucket vocabulary is the product's |
| Habits on Today | The shared week strip and dot | Compact and subordinate: today's due habits only | Deliberately not the collection's band |
| Goal context | The shared `ProgressRow` | At most two Goals, then a door | `TODAY_GOAL_VISIBLE = 2` — one meaningful signal beats four widgets |
| Supporting panels | `application/table` card anatomy, `application/empty-state` | Schedule, reflection, attention, continue, review door | Each states what it is for and links out rather than expanding |

`today.css` no longer carries a twelve-column grid: it is `display: contents`
at phone width and one `grid-cols-[minmax(0,2fr)_minmax(0,1fr)]` from `lg`.

### The shared primitives

| Primitive | Untitled source | How it is used | Custom remaining, and why |
| --- | --- | --- | --- |
| `IconButton` | `base/buttons/button-utility`'s own exported `styles` | Composed with upstream's geometry, the same device `buttonClassName` uses | A REQUIRED accessible name (upstream takes `tooltip` and uses it as the label, so a button without one has no name), the coarse-pointer touch floor, `pressed`, `danger`, and DalyHub's `Tooltip` with its shortcut notation |
| `iconButtonClassName()` | The same source | For an element that cannot BE the component — a menu trigger forwarding a React Aria prop set, a `<label>` acting as a file picker | — |
| `Input` / `Textarea` | `base/input`'s own recipe | Radius, `bg-primary`, `shadow-xs`, inset ring, `ring-2 ring-brand` focus, `ring-error_subtle` invalid, `text-placeholder` | ONE element rather than upstream's `Group` wrapper: about twenty module stylesheets carry LAYOUT rules keyed on `.dh-input`, and a wrapper would make them size the inner control instead of the box. The recipe transfers without loss because Untitled's box is an inset ring, not a border |
| `inputClassName()` | The same source | The ~20 bare `<input className="dh-input">` call sites | `dh-input` / `dh-control` are still EMITTED as layout bridges, and carry no paint |
| `Select` | The same recipe | `inputClassName({ className: "dh-control--select …" })` | Only the chevron inset remains in CSS |

### Rejected, and why

- **Untitled's `ToggleButtonGroup` for the Habits cadence field.** It is a React
  Aria selection collection whose value is the selection; `ToggleGroupField` is
  a real radio group inside a form that posts, with a name and a required arm.
  Swapping it would trade form semantics for geometry, so the GEOMETRY was taken
  (`optionClassName()` composes Untitled utilities) and the semantics kept.
- **React Aria's grid for the Habits table.** Rejected for the reason in the
  table above: grid navigation puts a mode switch between the keyboard and the
  page's primary action.
- **Untitled's `metrics`** (Pro, not in the vendored tree). Its grammar — figure,
  label, delta — is what the standing bands express, through the vendored card
  and band sources. It was studied through the connector's screenshot; its
  source is unavailable here and was not recreated from the picture.
- **A streak-led Habits collection.** The brief rules it out by name, and it is
  also wrong: a streak is a consequence of keeping a habit, not the reason to.
  Streak is one column among seven.
- **Four KPI cards at the top of Today.** Today is where the day is WORKED. A
  band of figures above the work is analytics wearing a dashboard's clothes.
- **Untitled's `Group`-wrapped `InputBase` shape.** See the primitives table.

### Dependency report

| Package | Version | Licence | Why | Weight | SSR | Cloudflare |
| --- | --- | --- | --- | --- | --- | --- |
| `recharts` | 3.10.1 | MIT | Untitled UI React's charts are Recharts compositions; adopting the implementation means adopting the library | Code-split to `build/client/assets/charts-*.js`, about 400 KB raw, on the routes that draw a plot only | `ChartFrame` mounts client-only and reserves its block size, so the server renders the frame and the readout and the plot arrives without layout shift | `wrangler deploy --dry-run` succeeds; total upload 13,400 KiB / 3,250 KiB gzipped |

Transitive licences (MIT, with ISC and one BSD-3-Clause beneath
`victory-vendor`) are enumerated in
[`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md).

### Documentation consulted

[Introduction](https://www.untitledui.com/react/docs/introduction),
[Theming](https://www.untitledui.com/react/docs/theming),
[Dark mode](https://www.untitledui.com/react/docs/dark-mode),
[CLI](https://www.untitledui.com/react/docs/cli),
[MCP](https://www.untitledui.com/react/docs/mcp),
[Tables](https://www.untitledui.com/react/components/tables),
[Inputs](https://www.untitledui.com/react/components/inputs),
[Buttons](https://www.untitledui.com/react/components/buttons),
[Checkboxes](https://www.untitledui.com/react/components/checkboxes),
[Button groups](https://www.untitledui.com/react/components/button-groups),
[Empty states](https://www.untitledui.com/react/components/empty-states) and
[Section headers](https://www.untitledui.com/react/components/section-headers).

No screenshot, historical visual audit or legacy Material/MD3/DHDS stylesheet is
an implementation reference for any surface in this pass.

## UNTITLED-12 completion record — Notes, Diary, the writing surface and the last chart

### Pro research, and what it actually returned

The authenticated connector reports `has_pro_access: true` and was searched
before anything was built. Searches run for this pass: `notes`, `documents`,
`knowledge base`, `document list`, `text editor`, `rich text toolbar`,
`writing surface`, `activity feed`, `timeline`, `chronological events`,
`calendar`, `date picker`, `day view`, `date navigation`, `journal`,
`checklist`, `agenda`, `list items with menu`, `tabs`, `button border`,
`segmented control`, `toggle group`, and the icon search `edit pencil`.

Pro entries still come back as metadata plus a screenshot URL and the
`npx untitledui add` command; `get_component` on a Pro entry answers with the
lock and that command rather than with source. The CLI remains unauthenticatable
in this container for the reason Phase 4 recorded — `npx untitledui@latest login`
completes an OAuth callback to a localhost port a headless remote cannot reach —
so Pro source came from the vendored tree under `app/shared/ui/untitled/`,
exactly as in every phase since Phase 4. Nothing was recreated from memory and
no unavailable example name, snippet or screenshot was invented.

**Page templates studied rather than merely listed.** Their screenshots were
downloaded and read:

| Template | What it settled |
| --- | --- |
| `informational-01/19` (Pro) | The WRITING page: breadcrumb, large title, a subtitle line, a section header with its own overflow, then a toolbar row of `button-utility` controls **on the page ground** with hairline dividers, then the text in a bounded field, with a quiet context column beside it. This is the composition the Note record now has. |
| `informational-02/19` (Pro) | The same editorial grammar in the header-nav layout. Confirmed the toolbar/field relationship is the pattern rather than one example's choice. |
| `text-editor-modal` (Pro) | Untitled's editor toolbar at close range: a row of icon utility buttons grouped by thin vertical dividers, no filled band. |
| `informational-02/13` (Pro) | The ACTIVITY FEED, and the single most load-bearing find of the pass: Untitled's own chronology is **not** a vertical rule with nodes. It is hairline-separated rows carrying a leading glyph, a strong name, a quiet timestamp and the content. The Diary timeline is that now. |
| `informational-01/13` (Pro) | The split reading layout — bounded prose column, context column beside it — which is why the Diary content has a measure and the toolbar shares it. |
| `dashboards-01/03`, `dashboards-02/03` (Pro) | The date-picker-in-a-header grammar behind the Diary navigator. |

**Both editorial templates depend on TipTap.** That is Untitled's answer to a
rich-text surface and it is explicitly not DalyHub's: ADR-006 stores long-form
text as exact Markdown source, and CodeMirror is what preserves it. The
COMPOSITION was adopted and the runtime was not — see the rejection list.

### Notes

| Notes surface | Untitled source | How it is used | Custom remaining, and why |
| --- | --- | --- | --- |
| Collection frame | Shared `CollectionLayout` over `application/tabs` | Title, lifecycle rail, search, "Filter & sort", empty and error states | Already migrated in Phase 4; untouched |
| Collection row | Untitled card boundary and its hairlines | Title leads, excerpt takes the width, metadata forms a right-hand column | The excerpt now takes the product's PROSE MEASURE. At 1440 a "two-line clamp" was ~90 words on one row and the page read as a wall |
| Row date | — | States the moment the list is ORDERED by, named `sr-only` | A real defect the design fixture surfaced: the list sorts by `created` and every row printed its effective UPDATED moment, so the default view read 12 Sep, 11 Sep, 9 Sep, 7 Sep, 12 Sep, 30 Aug and looked broken |
| The rail | `application/app-navigation`'s `nav-item` treatment | `bg-primary`, `hover:bg-primary_hover`, the selected `bg-secondary`, the `rounded-md` box and the `text-sm font-semibold text-secondary` truncating label | A leading brand bar on the current row. Untitled marks a current nav item with a fill alone, which is right in a sidebar of eight and not enough down a column of forty near-identical documents |
| Rail door | Untitled's brand-secondary link role | "All notes" | — |
| Record shell | The shared Record Layout, `.dh-writing-record` | Title, one quiet context line, the tab rail, the editor | Unchanged; this pass changed its paint, not its anatomy |
| Editor toolbar | `base/buttons/button-utility`'s own exported styles, via `iconButtonClassName` | Every formatting control, undo/redo, the host commands and "More" | The roving-tabindex model, the horizontal scroller and its overflow cue, and the glyph box (the shared icon button sizes its glyph by inset; the editor's icons are plain SVG children) |
| Editor bar | Untitled's `bg-primary` and `border-secondary` | The sticky strip that holds the controls | It carried `--dh-color-bg` — the app CANVAS — while stuck, so on a Note record drawn `surface="plain"` the toolbar read as a grey band laid over a white page. That is the exact object VIS-01 removed the border and corners to be rid of, reached through the background instead |
| Read/Write toggle | `base/buttons/button`'s recipe via `buttonClassName({ variant: "subtle" })` | The mode switch | The LABEL still carries the state ("Read" while writing), so meaning is never colour-only |

### Diary

| Diary surface | Untitled source | How it is used | Custom remaining, and why |
| --- | --- | --- | --- |
| Chronology | `application/table`'s `TableCard.Root` anatomy + `informational-02/13`'s activity-feed row grammar | One bounded card per day: an in-card date header, a divided body of hairline rows | The TIME leads the row. Untitled's feed puts the timestamp beside the actor because its rows are about WHO; a diary's rows are about WHEN, so the time is a fixed tabular column the eye runs down |
| Row states | Untitled's `hover:bg-secondary` and the ACTIVE surface | Hover, and the open entry | `aria-current` as well as the fill — never a tint alone |
| Row glyph | Untitled's `fg-quaternary` foreground | The entry-type subtype icon | Dropped below `md`. It is decorative (the meta line names the type), so on a phone it is 28px plus a gap spent on something that carries nothing |
| Edit affordance | The shared `IconButton` with `@untitledui/icons`' `Edit01` | One action per row | It is no longer hover-only. `opacity-0` with a hover reveal fails a touch user and a keyboard user alike unless every state is remembered, and this one only remembered because `@media (hover: none)` had been patched in afterwards |
| Week strip | Untitled's surface, hover and `bg-brand-solid` roles | Seven day cells, `aria-current="date"`, today's dot | The strip's phone arrangement, which is measured and documented in `diary.css` |
| Week steps | `iconButtonClassName` over `button-utility` | Previous/next week | They are LINKS, not buttons: they navigate, so they are middle-clickable and work with no JavaScript, exactly as the seven day cells beside them do |
| Date picker | **`application/date-picker`'s genuine `Calendar`**, in React Aria's `Popover` | Month header, prev/next, `CalendarGrid`, cells, selected and today treatments, the full keyboard model | The trigger is React Aria's `Button` painted with `iconButtonClassName`. See the rejection list for why it cannot be the shared `IconButton` |
| Type filter | `overrides/link-tab-rail` (`underline`) + the genuine `Badge` | Ten navigation links with counts, marked `aria-current="page"` | `shrink-0`, which upstream has no opinion about because its rails never hold ten options — without it every option compressed to 45px while `whitespace-nowrap` kept the text at full width, and ten labels overprinted into a smear |
| Capture type chips | The shared `toggleOptionClassName` recipe (Untitled's pill geometry) | Single-select entry type | A real `<input type="radio">` in a real `<label>`, inside a form that posts |
| Entry details | The shared `Badge` (neutral, and neutral-outline) | Type, and "Backdated" | The Inspector's own structure |

### The measure, and the empty half-page

The Diary drew its chronology at a 56rem reading measure and its toolbar
full-bleed, so at 1440 the week strip's month caption, its picker and its Today
link sat at an edge roughly 700px right of the last entry — three controls about
the days on screen, nowhere near them, over an empty half-page. The week strip
shares the measure now. The type filter deliberately does not: it is a control
row rather than prose, it carries ten options, and capping it would turn a row
that fits at a laptop width into one that always scrolls and always clips.

### Charts — the debt is closed

The migration guide's chart-debt table said `TrendLine` drew three surfaces
(Analytics, Reports, Reviews). **That was wrong, and it is worth recording how.**
Reports and Reviews draw `TrendBars` and `CategoryBars`, which are different
components with different semantics. `TrendLine` had exactly one consumer —
Analytics, twice.

| Chart surface | Untitled source | How it is used | Custom remaining, and why |
| --- | --- | --- | --- |
| Analytics completion trend | `application/charts-base` via `MeasurementTrend` | Tasks completed per bucket, on a real numeric time axis | `wholeNumbers` — a count series has no half-values |
| Analytics overdue trend | The same | The backlog read at each bucket's close | `tone="warning"`. A backlog's existence is the attention whichever way it is moving, which is what `TrendLine`'s `status="warning"` said |
| The tone | Untitled's semantic `fg-warning-primary` | `CHART_WARNING_COLOR` | Replaces `TrendLine`'s five-paint `data-meter-status` map. One role rather than five, because only one of the five ever had a consumer |

`TrendLine` is **deleted** — the component, its 340 lines of CSS and its
`--dh-linechart` vocabulary. The removal criterion the migration guide states
("when the last caller moves, the file and the component go together") is met,
and every dated series in the product is now one chart on one foundation.

The data pass UNTITLED-11 asked for, and what it found:

1. **The series are counts.** `niceDomain`'s 1/2/2.5/5 step ladder is right for
   a measurement and wrong for a count. `wholeNumbers` snaps the step to an
   integer — the same rule ADR-104 states for Habits' adherence chart.
2. **The bound was already correct.** Labels resolve by bucket KEY, never by
   position, because the overdue read carries its own `MAX_OVERDUE_MOMENTS`
   limit and is not always parallel to the window. Untouched.
3. **An axis tick is a point in time, not a bucket.** `MeasurementTrend` spaces
   its ticks evenly across the time domain, so a tick usually lands BETWEEN two
   buckets. A first draft looked each tick up in the bucket map and fell back to
   the raw ISO when it missed — which it did for half of them, and the axis read
   "28 June, 2026-07-24, 2026-08-18, 13 Sept". A tick is formatted as a date.

### Rejected, and why

- **TipTap, which both Untitled editorial templates depend on.** It is
  Untitled's answer to a rich-text surface and it is a rich-text model: a
  document tree serialised on save. ADR-006 stores exact Markdown SOURCE, and
  every round trip through a document tree is a chance to normalise a list
  marker or drop a trailing space the owner typed. The composition was adopted
  and CodeMirror kept, which is what the brief asks for in as many words.
- **Untitled's `DatePicker` wrapper** (as opposed to its `Calendar`). It is a
  trigger plus a Cancel/Apply pair, and a navigation does not need to be
  confirmed — Back already undoes it. The `Calendar` inside it is the part with
  the value.
- **The shared `IconButton` as the calendar's trigger.** `DialogTrigger` hands
  its press behaviour to its first child through React Aria's `PressResponder`
  CONTEXT, and a plain `<button>` does not consume it. A draft using
  `IconButton` looked identical, reported no error, and **never opened the
  popover at all** — verified in the browser, not only in a test. React Aria's
  own `Button`, painted with `iconButtonClassName`, which is precisely the case
  that export exists for.
- **The shared `ViewSwitcher` for the Diary type filter.** A VIEW is not a
  FILTER, which is that component's own first rule. The switcher selects a
  collection's principal mode — Day or Timeline, which `DiaryModeTabs` does use
  it for. The type filter narrows within the current mode, composes with the
  selected day, carries an open vocabulary and shows per-option counts.
- **Untitled's `role="tab"` semantics for that filter.** Its options navigate,
  and the chronology each selects is rendered elsewhere in the document, so no
  `tabpanel` here could hold it. `overrides/link-tab-rail` takes the appearance
  and leaves the semantics as the labelled group of anchors it always was.
- **A second column on the Diary page.** The obvious cure for the empty
  half-page, and it would have needed a new page-level query and a new product
  decision about what belongs there. Centring the measure and bringing the
  navigator over it is the presentation fix for a presentation problem.
- **A properties sidebar on the Note record.** The brief rules it out and so
  does the note itself: a note is a thing you write, and the fastest way to stop
  someone writing is to ask them to classify first.

### Defects the migration surfaced

Each was a real defect the paint or the empty state had been hiding:

- **The Notes list's date disagreed with its own order.** See the table above.
- **The Diary timeline gave a phone 168px for its content.** At 393px the time
  gutter, the node column, their two gaps and an always-visible 44px Edit button
  left the entry's own words under half the screen; at 320px, 95px. Measured,
  not estimated. It is 237px and 164px now — and the fix was removing
  decoration, not compressing anything.
- **The week strip's steps were 4px short of the touch floor.** `diary.css` set
  `min-inline-size: var(--app-space-10)` (40px) on a control that is now the
  shared `IconButton`, which already takes 44px under `(pointer: coarse)`. The
  rule was unlayered and Tailwind's utilities are layered, so the narrower value
  won unconditionally. The same cascade defect Phase 5 found in `premium.css`
  and UNTITLED-11 found in `ui.css`, for the third time.
- **`iconButtonClassName` was not exported from `~/shared/ui`.** UNTITLED-11
  built it and exported it from its own module only, so the next consumer that
  needed it would have had to reach past the barrel to a file path — which is
  how a second source of paint starts.

### The fixtures

`scripts/notes-diary-seed.mjs` and `scripts/notes-diary-shot.mjs`, siblings of
`ux-02-seed.mjs` / `ux-02-shot.mjs` and written for the same reason: on the
shared E2E seed both of this pass's surfaces are their own empty state, so the
row grammar, the tag column, the rail and the chronology had nothing to draw.
The seed adds fourteen Notes of genuinely different lengths, a real tag
vocabulary applied unevenly, one archived Note, and thirty-four Diary entries
across three weeks in all nine entry types with two deliberately empty days and
two backdated entries. The shooter photographs and MEASURES: it reports the
writing column, the editor scroller and the rendered line width separately,
because "does the writing dominate?" is a question with a number behind it.

### Documentation consulted

[Introduction](https://www.untitledui.com/react/docs/introduction),
[Theming](https://www.untitledui.com/react/docs/theming),
[Dark mode](https://www.untitledui.com/react/docs/dark-mode),
[MCP](https://www.untitledui.com/react/docs/mcp),
[Date pickers](https://www.untitledui.com/react/components/date-pickers),
[Tabs](https://www.untitledui.com/react/components/tabs),
[Buttons](https://www.untitledui.com/react/components/buttons),
[Badges](https://www.untitledui.com/react/components/badges),
[Tables](https://www.untitledui.com/react/components/tables) and
[Charts](https://www.untitledui.com/react/components/charts).

No screenshot, historical visual audit or legacy Material/MD3/DHDS stylesheet is
an implementation reference for any surface in this pass. The Pro template
screenshots above were studied for COMPOSITION and are not reproduced.

## UNTITLED-13 completion record — Meetings, People and the shared Person identity

### Pro research, and what it actually returned

The authenticated connector reports `has_pro_access: true` and was searched
before anything was built. Searches run for this pass: `meetings list upcoming
events schedule agenda`, `activity feed timeline of recent events with avatars
and timestamps`, `team members directory list with avatars roles and contact
details`, plus the page-template searches `contact or person profile page with
details, activity history and related records` and `event or meeting detail page
with attendees, agenda and notes`, and the component probes `avatar`,
`avatar-group`, `avatar-profile-photo`, `badges`, `dropdown`, `section-headers`,
`activity-feed`, `empty-state`, `table` and `tabs`.

Pro entries come back as metadata plus a screenshot URL and the `npx untitledui
add` command; `get_component` on a Pro entry answers with the lock and that
command rather than with source. The CLI remains unauthenticatable in this
container for the reason Phase 4 recorded, so Pro source came from the vendored
tree under `app/shared/ui/untitled/`. Nothing was recreated from memory and no
unavailable example name, snippet or screenshot was invented.

**Two things the probe settled that are worth recording.**
`application/activity-feed` and `application/section-headers` are **Pro** — the
public component API answers `{"components":[],"pro":["application/…"]}` for
both, with no source. So Untitled's own activity-feed implementation is
genuinely unavailable here; what is adopted from it is the COMPOSITION, from
`informational-02/13`'s screenshot, exactly as UNTITLED-12 adopted it for the
Diary chronology. And `avatar-group` **is not a component in the catalogue at
all** (the API answers 404): every Pro template that shows grouped avatars
composes `Avatar` with negative margins inline, which is what
`PersonAvatarGroup` does, named once.

**One thing the probe RETURNED that the repository did not have.** The public
component API serves the whole `base/avatar` folder, including
`avatar-profile-photo.tsx` — the large ringed, padded mark Untitled's own
profile pages use, at 72/96/160px. It is vendored now, through the same
`API_SOURCED` route `charts-base` came by and with the same provenance header,
and it is the Person record's identity mark.

**Page templates studied rather than merely listed.** Their screenshots were
downloaded and read:

| Template | What it settled |
| --- | --- |
| `informational-01/17` (Pro) | The PROFILE page: a large mark over a cover band, the name, ONE line about the person, the actions beside it — then prose, then a QUIET two-column labelled strip of reference facts, then a divided list of history. Not one labelled field grid anywhere. This is the Person workspace's order, and why its dates and contact preference are a quiet strip near the bottom rather than a table near the top. |
| `informational-02/12` (Pro) | The same grammar as a side panel: avatar, name, email, a divided fact strip, two actions, About, then quiet icon-led lines and a list of history rows. Confirmed the arrangement is the pattern rather than one example's choice. |
| `informational-02/10` (Pro) | The EVENT panel, and the most load-bearing find: a title, a quiet icon-led fact stack, then a short run of OVERLAPPING guest avatars with a "+" and a caption naming how many. The Meeting header's context row is that. |
| `settings-01/07` (Pro) | The member table: `AvatarLabelGroup` as the name cell, a quiet role cell, text actions at the trailing edge. The directory row's density. |
| `informational-01/15` (Pro) | A searchable event log beside a detail pane — a bounded table with pagination inside a page that also scrolls. The reading for the activity band's own viewport. |
| `informational-01/13`, `informational-02/13` (Pro) | The record page and the activity feed, both carried forward from UNTITLED-12 unchanged. |

### Meetings

| Meetings surface | Untitled source | How it is used | Custom remaining, and why |
| --- | --- | --- | --- |
| Collection frame | Shared `CollectionLayout` over `application/tabs` | Title, scope rail, search, sort, empty and error states | Migrated in Phase 4; this pass changed only the search field's phone floor |
| Day group | `application/table`'s `TableCard.Root` and `TableCard.Header` | One bounded card per day, the heading as its card header, the count as its `Badge` | The badge names its noun ("2 meetings"). It was a bare digit INSIDE the `h2`, whose accessible name was then "Tomorrow 1" |
| Row | Untitled's divided body and hover | A fixed leading TIME column, the title, one metadata line, one trailing action | The two READINGS. An upcoming row answers "is this ready, and can I get in?"; a past row answers "what came out of it?" — decisions, actions, outcomes, notes, every one a stored `meeting_items` tally |
| Row attendees | — | Names, in the metadata line | TEXT, deliberately. `listForEntities` returns a counterpart's title and nothing else, so marks here would be initials-only discs carrying less than the names they replaced |
| Record shell | The shared Record Layout, `.dh-writing-record` | Title, one context line, the tab rail, the notebook | Unchanged; shared with the Note record |
| Header context | `base/avatar` grouped as `informational-02/10` groups guests | When · where · overlapping marks · "N attendees" | The marks are DECORATIVE and the count is the target. Measured at 24×25px as links against a 44px floor, and four 44px targets do not fit beside a date |
| Notebook | The shared writing system, unchanged | `LiveMarkdownEditor`, `useAutosaveField`, `RemoteChangeBanner`, `SaveStatusIndicator` and the version-quoting conflict contract | CodeMirror, for ADR-006's reason. The notebook was already a real consumer of #287's work and stays one |
| Notebook bands | `overrides/section-heading` over `application/section-headers` | An `h2` per band, with a `description` slot | The `h2` rank: upstream hard-codes `h3`, which axe reports as a skipped level under a record's `h1` |
| Agenda / decisions / outcomes / actions | Untitled's divided list, `base/buttons`, the shared `OverflowMenu` | A hairline per row, the words first, the conversion state as quiet supporting text | ONE visible conversion control and only on ACTIONS. A decision is a record of what was settled; three "Create task" buttons down an agenda of three topics made the chrome the loudest thing in the band |
| Adding an item | `base/input`, `base/buttons` | One control that discloses the field and focuses it | The LIVE path is the capture bar and is untouched. This is the considered path |
| Empty agenda on a past meeting | — | Not drawn | An agenda WITH content stays on any meeting: it is the record of what was planned |
| Attendee list | Untitled's divided list, the shared Person mark, `OverflowMenu` | A row per attendee: mark, name as a link filling the row's height, actions in a menu | The link is `self-stretch`, measured: as an inline anchor it was 196×20 inside a 50px row |
| Details facts | The shared quiet fact strip | Duration, timezone, held state, meeting link | "Held" states BOTH answers in words — MEET-03 needs the state legible without opening a menu |
| Capture bar | The shared `toggleOptionClassName` (Untitled's pill geometry), `base/input`, `base/buttons` | Four `aria-pressed` type chips, a field and Add | The bar's fixed geometry, its keyboard and safe-area insets, and the record's height reservation — all token arithmetic no utility expresses |
| Creation | Untouched | `/new/meeting` and the global capture sheet | Proportionate already: a title and a start is all a meeting needs to exist |

### People

| People surface | Untitled source | How it is used | Custom remaining, and why |
| --- | --- | --- | --- |
| Collection frame | Shared `CollectionLayout` | Circle rail, search, catch-up filter, sort, empty states | `keepFiltersOnCompact`, new: the layout's own way to keep a band with SEARCH in it at phone width |
| Search field | `base/input` via `inputClassName()` | The collection's instant search | A native `<input type="search">` in a `<label>`, as Assets composes it — the shared `CollectionSearchField` hides behind a toggle below `md`, which is the opposite of this module's stated rule |
| Catch-up filter | The shared `toggleOptionClassName` | One `aria-pressed` toggle carrying its own count | The count, so an owner knows before pressing whether it will show anything |
| Row | — | Face, identity, reach, rhythm | `PersonRow` is unchanged apart from its tone vocabulary. It is a documented DalyHub composition (UIX-05) and its grid is what makes a directory's columns agree down the page |
| Row mark | `base/avatar` | The shared Person mark at Untitled's `md` rung | UIX-05's circle accent, and only on a GENERATED disc |
| Rhythm | — | The derived state, in words, with a dot that agrees | The tone is now exactly the kernel's `RelationshipTone`. It used to escalate to `warning`, painted with the product's OVERDUE colour |
| Identity band | `base/avatar`'s `AvatarProfilePhoto` (newly vendored), `base/badges`, `base/buttons` | The face, the preferred name, the relationship word, Call / Email / Message | A control is rendered only where the data behind it exists; `sms:` needs a MOBILE specifically |
| Rhythm band | `overrides/section-heading`, the shared quiet fact strip | The reasons, the cadence facts and what is genuinely ahead, in ONE grid | `StayInTouchPanel` takes the workspace's leading facts rather than the workspace drawing a second `<dl>` beneath it — measured as three half-empty tables at 1440 |
| What you share | `application/table`'s divided body anatomy | A row per kind of linked record, each a link to the Linked tab | Deliberately NOT the table component: a React Aria `grid` for four rows of one column costs a keyboard user a grid to navigate out of |
| Recent activity | The shared `Timeline`, over the SAME `/person/:id/activity` endpoint | The most recent moments, bounded, leading to all of them | No filter bar — a filter that narrows five rows is chrome, and the tab has the real one |
| Stay-in-touch badge | `base/badges` via the shared `Badge`, `variant="outline"` | The derived state in the record header and on the row | Outline, not soft: measured, the soft `info` container is quiet in light and saturated in dark, and a relationship state is not a status a reader is meant to notice |
| Contact / Notes / Settings tabs | Shared forms and `SettingsLayout` | Unchanged | Out of this pass's scope; the shared form primitives are already Untitled's |

### Rejected, and why

- **Untitled's `application/activity-feed` source.** It is Pro and the connector
  will not release it here. The composition was adopted from
  `informational-02/13`'s screenshot, as UNTITLED-12 did for the Diary.
- **Avatars on the Meetings collection row.** The batched relationship read
  returns a counterpart's title and nothing else, so the row's marks would be
  initials-only discs replacing the names a schedule is actually scanned by.
  The record header is different: names do not fit there anyway.
- **Untitled's `getInitials`** (`base/avatar/utils.ts`), which comes with the
  avatar folder. It is `name.split(" ")` and takes the first character of the
  first and second words — so "Dr Helena Vasquez-Moreau" yields DH and a
  bracketed or punctuated name yields punctuation. `initialsFromName` skips
  words with no letter in them and iterates code points.
- **The shared `CollectionSearchField` for People.** It is Untitled's
  `base/input` and it is what Meetings uses, and below `md` it hides the field
  behind a toggle — which is the opposite of the rule People has stated since
  UIX-05 and HARDEN-02 fixed. Reconciling the two is a product decision about
  every collection in the product, not a Meetings-and-People one.
- **A React Aria `grid` for "What you share".** Four rows of one column is a
  table a keyboard user has to navigate out of, for a list of links.
- **Reordering the notebook's bands on a past meeting.** §26's order is the
  order a meeting happens in and it is right; making the record's shape depend
  on its state would cost more than the empty agenda band did. Not drawing the
  empty band is the proportionate fix.
- **Extending `PersonAvatarGroup` to the Today panel or the Linked tab.** It has
  ONE consumer today. It lives in the shared identity module because §24 asks
  for one shared Person identity model and a set of People is part of that
  model's vocabulary — but a second consumer has not been invented to justify
  it.

### Dependency report

No new runtime dependency. One new vendored file,
`base/avatar/avatar-profile-photo.tsx`, MIT, retrieved from Untitled's public
component API on 2026-09-13 and recorded in `scripts/vendor-untitled.mjs`'s
`API_SOURCED` set with its provenance header, per AGENTS.md §11.

### Documentation consulted

[Introduction](https://www.untitledui.com/react/docs/introduction),
[Theming](https://www.untitledui.com/react/docs/theming),
[Dark mode](https://www.untitledui.com/react/docs/dark-mode),
[MCP](https://www.untitledui.com/react/docs/mcp),
[Avatars](https://www.untitledui.com/react/components/avatars),
[Badges](https://www.untitledui.com/react/components/badges),
[Buttons](https://www.untitledui.com/react/components/buttons),
[Tables](https://www.untitledui.com/react/components/tables),
[Tabs](https://www.untitledui.com/react/components/tabs) and
[Empty states](https://www.untitledui.com/react/components/empty-states).

No screenshot, historical visual audit or legacy Material/MD3/DHDS stylesheet is
an implementation reference for any surface in this pass. The Pro template
screenshots above were studied for COMPOSITION and are not reproduced.

### The review pass, and what the pictures and the numbers found

The captures were taken with `scripts/meetings-people-shot.mjs` over the
`scripts/meetings-people-seed.mjs` fixture, at 1440 / 1280 / 1024 / 820 / 430 /
393 / 320 in both appearances, and then LOOKED at rather than filed. Six things
came out of that review; each is fixed, and each is the kind of defect a
measurement alone or a screenshot alone would have missed.

| Found by | Defect | Fix |
| --- | --- | --- |
| Looking, 393px | A seven-attendee header read `AN ⌐F ⌐R ⌐O +3` — at `xs` the marks overlap by 6px and the leftmost is on top, so every later monogram lost its first letter | One letter at `xs`; two at `sm` and `md`, which have the room. The overflow disc moves to the top of the stack, because a half-covered figure is a different figure |
| Looking, 393px | A wrapped meta line began `· Marcus Oyelaran, …` — a leading separator reads as a bullet | The separator hangs off the part BEFORE it, so a wrapped line ends `Whitfield site ·` |
| Looking, directory | `Last spoke 6 August 2026` beside `No shared history yet` on one row | The hand-entered date says `(noted)`, as the record has always said it |
| Measuring, 430px | The Person's website link at 289×16, and the Meeting's link — standalone targets, not inline-in-a-sentence, so 2.5.8's exception does not cover them | The coarse-pointer floor, as BLOCK anchors |
| Measuring, 1024px | The first attempt at that fix used `inline-flex`, and a 43-character URL became one unbreakable box that pushed the page 18px wide | Block, `break-words` |
| Running axe over the new consumer | `role="feed"` claimed `article` children three levels down with day headings interleaved — critical `aria-required-children` on every Activity surface in the product | A labelled `group`. `aria-posinset`/`aria-setsize` stay on the articles, which `article` supports natively, so windowed position survives |

Known and NOT changed here, because both are shared components used by every
record type in the product and neither is this pass's to change without
measuring every consumer: `EntityLink` is 22px tall inside `ReferenceList`
(inside activity prose it is an inline link in a sentence, which WCAG 2.5.8
exempts), and `SelectField`'s clear button is 28×28.
