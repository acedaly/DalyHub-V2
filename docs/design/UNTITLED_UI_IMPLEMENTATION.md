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
