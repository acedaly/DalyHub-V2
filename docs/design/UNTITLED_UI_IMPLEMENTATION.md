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

DalyHub uses a purple-led brand theme based on Untitled UI's brand-token
architecture. Purple is for primary, selected and brand interactions; it is not
paint for every surface.

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
