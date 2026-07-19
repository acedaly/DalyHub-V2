# DESIGN_SYSTEM.md — The DalyHub Shared Interaction Language

> The catalogue of shared patterns every module reuses. DalyHub's coherence comes from the fact that a task, a project, a person, and a note all *behave the same way*. This document is that contract.
>
> **Rule:** Before building any UI, find the pattern here. If it exists, reuse it. If it should exist but doesn't, build it *as a shared pattern* and document it here — in the same PR. A bespoke duplicate is [Product Debt](../product/PRODUCT_DEBT.md) the moment it merges. (See [`AGENTS.md §9.8`](../../AGENTS.md#98-shared-over-bespoke).)
>
> Companion docs: product intent in [`PRODUCT_PRINCIPLES.md`](../product/PRODUCT_PRINCIPLES.md); UX/interaction philosophy in [`AGENTS.md §6–7`](../../AGENTS.md#6-ux-philosophy); build order in [`ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md).

---

## Foundations

Before the components, the shared foundations they're built on. These are defined once and consumed everywhere.

- **Design tokens.** Colour, spacing, typography, radius, shadow, motion, and z-index are tokens — never hard-coded values. Light and dark themes are token maps. Changing a token changes the whole product.
- **Palette.** Muted and calm by default (see [product philosophy](../product/PRODUCT_PRINCIPLES.md#the-philosophy-behind-the-product)). Colour is reserved for meaning — status, entity type, emphasis — not decoration. Every text/background pair meets [contrast requirements](#accessibility).
- **Typography.** One type scale, generous line height, clear hierarchy. Density with air.
- **Spacing.** A single spacing scale (e.g. 4px base). Consistent rhythm across every surface.
- **Motion.** Purposeful and quick (see [Motion](#motion--feedback-timing)). Communicates causality; never decoration. Honours `prefers-reduced-motion`.
- **Iconography.** One icon set, consistent weight and size. Icons support labels; they don't replace them. Realised by the in-house outline set in [`app/shared/icons`](../../app/shared/icons) (24×24, `currentColor`, 1.75px) — see [Entity Identity (PX-02)](#entity-identity-px-02).
- **Entity identity.** Each entity type (Area, Goal, Project, Task, Note, Meeting, Person, Asset, Diary, Review) has a consistent icon and accent so it's recognisable at a glance anywhere it appears. Realised by the one **Entity Identity** system ([PX-02](#entity-identity-px-02), [`app/shared/entity`](../../app/shared/entity)).

---

## Design tokens (DS-01)

The foundations above are made concrete by the **design token system** ([DS-01](../roadmap/ROADMAP_V2.md#-ds-01--design-tokens--theming)). Tokens are the single source of truth for every design *value*; application code — CSS and components — consumes tokens and never hard-codes a raw hex, pixel or duration where a token exists ([AGENTS.md §9.8](../../AGENTS.md#98-shared-over-bespoke)).

- **Authoritative source:** [`app/styles/tokens.css`](../../app/styles/tokens.css) defines every token as a CSS custom property. A typed, greppable registry over the same names lives in [`app/shared/tokens`](../../app/shared/tokens) (`cssVar`/`colorVar` helpers, the breakpoint scale, and the colour maps as data used by the contrast and parity tests).
- **Consumed once, correct everywhere:** components style themselves in CSS classes that read `var(--dh-*)`. Because the same semantic name carries a different value per theme, a component styled once is correct in light and dark.

### Naming rules

Every token is `--dh-<group>-<role>[-<variant>]`, kebab-case, and **semantic** — named for what it is *for*, not what it looks like.

- ✅ `--dh-color-danger-surface`, `--dh-space-4`, `--dh-radius-md`, `--dh-duration-fast`
- ❌ `--dh-red-500`, `--dh-16px`, `--dh-blue` — component- or value-specific names are forbidden; they defeat theming and meaning.

Colour tokens are split by **role** so opposite theme requirements don't collide: `--dh-color-accent` is a *fill* (paired with `--dh-color-on-accent` text), while `--dh-color-accent-text` is a *foreground* (links, active indicators) that must contrast on the page background. Feedback colours come as a triple — solid (`--dh-color-danger`), surface tint (`--dh-color-danger-surface`), and text-on-surface (`--dh-color-danger-text`).

### Taxonomy

| Group | Tokens (examples) | Notes |
|---|---|---|
| **Colour — surfaces/text** | `bg`, `surface`, `surface-raised`, `surface-sunken`, `text`, `text-secondary`, `text-muted`, `on-accent`, `border`, `border-strong`, `divider` | semantic surfaces & text; light/dark mapped |
| **Colour — brand/interactive** | `accent`, `accent-hover`, `accent-active`, `accent-text`, `accent-surface`, `secondary`, `secondary-hover`, `hover-surface`, `active-surface`, `disabled-surface`, `disabled-text`, `disabled-border` | fills vs foreground kept distinct |
| **Colour — feedback** | `success{,-surface,-text}`, `warning{,-surface,-text}`, `danger{,-surface,-text}`, `info{,-surface,-text}` | never colour-only — always paired with a label/icon |
| **Colour — focus/selection/overlay** | `focus-ring`, `selection-bg`, `selection-text`, `overlay` | focus ring meets 3:1 in both themes |
| **Typography** | `--dh-font-sans/-mono`, `--dh-font-size-2xs…3xl`, `--dh-line-height-*`, `--dh-font-weight-*`, `--dh-letter-spacing-*` | one restrained, dense ramp (base 15px) with heading/body/label/metadata/code roles |
| **Spacing** | `--dh-space-0…16` (+ `-px`) | 4px base scale |
| **Sizing** | `--dh-control-height-sm/md/lg`, `--dh-touch-target-min` (44px), `--dh-width-narrow/prose/content/wide`, `--dh-shell-*`, `--dh-gutter` | control heights & content widths |
| **Shape** | `--dh-border-width-thin/thick`, `--dh-radius-xs…xl/full` | radius scale + border widths |
| **Elevation** | `--dh-shadow-sm/md/lg`, `--dh-shadow-focus` | shadows are theme-mapped (softer in light, deeper in dark) |
| **Motion** | `--dh-duration-instant/fast/base/slow`, `--dh-ease-standard/emphasized/exit` | quick, purposeful; zeroed under reduced-motion |
| **Layout** | `--dh-breakpoint-sm…2xl`, `--dh-z-base…tooltip` | breakpoints (also in TS) & z-index layers |

### Theme mapping

Light and dark are two maps over **the same semantic names**; only colour and elevation tokens change between them. The mechanism (from [ADR-016 §5.11](../decisions/ARCHITECTURE_DECISIONS.md#adr-016-cloudflare-access-identity-app-shell-and-registry-driven-routing), whose values DS-01 now supplies) is a `data-theme` attribute the server renders on `<html>` from the persisted cookie, so the first byte is already correct — **no flash, no client theme script**:

- `light` → forces the light map.
- `dark` → forces the dark map.
- `system` (default) → follows `prefers-color-scheme`.

`prefers-reduced-motion: reduce` collapses every transition/animation to `--dh-duration-instant`; meaning is never carried by motion alone.

### Consumption & extension rules

1. **Use tokens, not literals.** Any colour/space/size/radius/shadow/duration in application CSS or components must be a `var(--dh-*)`. A test scans `app/` and fails if a `var(--dh-*)` references an undefined token.
2. **Extend by adding a token first**, then consuming it. Never widen a component with a one-off literal.
3. **A new colour token must be given a value in the light map and BOTH dark blocks** — the two dark blocks are kept in parity by a test, and required tokens/contrast are enforced by tests (4.5:1 text, 3:1 UI).
4. **Prefer a semantic token over a raw palette value.** There is no exposed raw palette; semantics are the API.

---

## The pattern catalogue

Each pattern below has: **Purpose**, **Anatomy**, **Behaviour**, and **Rules**. Patterns compose — the [Record Layout](#record-header) is built from many of the others.

### Record Header
**Purpose.** The consistent top of every record (task, project, person, note, …) so the user always knows *what am I looking at and what can I do with it*.
**Anatomy.** Entity icon + type label · title (inline-editable) · key status/metadata chips · primary action · overflow (⋯) menu · breadcrumb to parent in the [Area hierarchy](../../AGENTS.md#4-the-area--goal--project--task-model).
**Behaviour.** Title edits inline and saves optimistically. Breadcrumb navigates up. Primary action is the single most likely next step for that entity.
**Rules.** Every entity uses this header — no bespoke headers. Exactly one primary action; everything else lives in the overflow or [Quick Actions](#quick-actions).

### Summary Panel
**Purpose.** The at-a-glance essence of a record: the fields that matter most, shown without a click.
**Anatomy.** A compact, scannable set of key fields (status, dates, links to parent Goal/Project, assignee/People, progress).
**Behaviour.** Fields are inline-editable where sensible. Rolls up child state (e.g. a Project's summary shows task progress). Empty fields invite completion, they don't shout.
**Rules.** Summary shows *essentials only*; depth belongs in [Tabs](#tabs) or the [Inspector](#inspector). Same field → same control everywhere.

### Drawer
**Purpose.** Open a record *without leaving your place*. The workhorse of DalyHub navigation — click a task in Today and it slides in over context.
**Anatomy.** A side sheet containing the full [Record Layout](#record-header) (header, summary, tabs, timeline, activity).
**Behaviour.** Opens over the current view; the underlying context stays visible and is restored on close. Deep-linkable and stackable (a drawer can open another). `Esc` closes; browser/back respects the stack.
**Rules.** The Drawer is the default way to open any record. It must never lose the user's place. Full-page record views exist only where genuinely warranted (e.g. long-form Note editing).
**Realised by** the [Shared Drawer (DS-03)](#shared-drawer-ds-03) — the single, entity-agnostic implementation.

### Tabs
**Purpose.** Organise a record's depth into predictable sections without overwhelming the summary.
**Anatomy.** A consistent tab strip within a record (e.g. Overview · Tasks · Notes · Activity · Settings).
**Behaviour.** Selected tab is preserved per record and deep-linkable. Lazy-loads tab content.
**Rules.** Tab names are drawn from a shared vocabulary and ordered consistently across modules — "Activity" and "Settings" always sit last, in that order.

### Cards
**Purpose.** The shared unit for representing an entity in a list, board, or grid.
**Anatomy.** Entity icon/accent · title · a few meaningful metadata chips · optional progress · quick-action affordances on hover/focus.
**Behaviour.** Clicking opens the [Drawer](#drawer). Cards support selection, drag (with keyboard equivalent), and inline quick actions. Density is configurable (comfortable/compact).
**Rules.** **One Card component, configured** — not a bespoke card per module. If a module needs a new card affordance, add it to the shared Card. (This is a top target in [PRODUCT_DEBT](../product/PRODUCT_DEBT.md).)

### Timeline
**Purpose.** Show an entity's history in chronological order — the "what happened, when" of any record.
**Anatomy.** A vertical, time-ordered stream of events rendered from the [shared Activity model](../../AGENTS.md#96-shared-activity-model).
**Behaviour.** Grouped by day; virtualised for length; filterable by event type. Events link to the entities they reference.
**Rules.** Timeline renders the *shared Activity model* — it never invents its own event source. Same event → same rendering everywhere.

### Activity Feed
**Purpose.** The cross-entity, system-wide stream — "what's been happening across everything," versus the [Timeline](#timeline)'s single-record view.
**Anatomy.** Same event rendering as Timeline, aggregated across a workspace or a scope (a Project's activity, the whole workspace's activity).
**Behaviour.** Filterable, groupable, virtualised. Respects [workspace isolation](../../AGENTS.md#94-workspace-isolation).
**Rules.** Timeline (one record) and Activity Feed (many records) are the same component at different scopes — do not fork them.

### Inspector
**Purpose.** Edit the full detail of a record or a selection — the "properties panel" for power editing.
**Anatomy.** A structured panel of all editable fields, grouped, using shared [Form](#forms) controls.
**Behaviour.** Reflects the current selection (including multi-select for bulk edits). Saves optimistically field-by-field.
**Rules.** The Inspector is for *depth*; the [Summary Panel](#summary-panel) is for *essentials*. Never duplicate field controls between them — share the control.

### Settings
**Purpose.** A consistent surface for configuration, at every scope (app, workspace, module, single record).
**Anatomy.** Grouped sections · label + description + control per setting · immediate or explicitly-saved changes with clear feedback.
**Behaviour.** Same layout whether you're configuring the app or one Project. Dangerous settings are visually separated and confirmed.
**Rules.** Settings is always the last [Tab](#tabs)/section. Same setting type → same control. No bespoke settings screens.

### Filters
**Purpose.** Narrow any collection (tasks, cards, activity) using a consistent control.
**Anatomy.** A filter bar: add-filter control · active filter chips · clear-all · optional saved views.
**Behaviour.** Filters compose (AND/OR where meaningful), reflect in the URL (shareable/restorable), and persist as saved views. Filtering is instant.
**Rules.** **One filter system** across the product — Today, Projects, Search, and every list use it. Inconsistent per-module filters are known [debt](../product/PRODUCT_DEBT.md).

### Search
**Purpose.** Find anything, from anywhere, fast.
**Anatomy.** A unified search surface ([`app/shared/search`](../../app/shared/search)) — a WAI-ARIA combobox controlling a grouped `listbox`, with entity icon/accent, title, subtitle/preview, `<mark>` highlighting, a result count, and idle/loading/empty/partial/error+retry states. Opened by the PX-02 sidebar Search affordance and the `/` shortcut; mounted once at the app-shell boundary and lazy-loaded.
**Behaviour.** Fuzzy, incremental, keyboard-navigable (↑/↓ wrap, Home/End, Enter, Escape). Scoped by [workspace](../../AGENTS.md#94-workspace-isolation) server-side. Results **group primarily by entity type** (module fallback otherwise) and **open in the [Drawer](#drawer)** over their home surface, preserving unrelated URL state. Incremental search debounces and **immediately** invalidates the in-flight request when the query changes (a generation guard, so a stale response can never overwrite newer input); each provider runs under a bounded deadline with a cancellation signal, so a hung provider never stalls healthy results; a partial provider failure still shows healthy results; a total failure is a calm retryable state; and the browser validates the endpoint's response before rendering it. Local matches return under the [performance budget](../../AGENTS.md#16-performance-expectations).
**Contract.** A module contributes a **search provider** through the [module registry](../../AGENTS.md#92-module-registry) (`ModuleRegistry.listSearchProviders()`) — search is never re-implemented per module. A result declares **how it opens** via a validated `SearchResultTarget` (`{ kind: "drawer"; drawerKey; canonicalPath? } | { kind: "route"; to }`), so the shared surface never parses product routes or ids and unsafe targets are rejected at the boundary. Ranking is deterministic and tiered (exact → prefix → token → fuzzy → subtitle; provider score only as a normalised tie-breaker). Highlighting uses text segments + `<mark>` — never raw HTML. Search is **not** the [Command Palette](#command-palette) (DS-09): it runs no commands and never claims `⌘K`. See [ADR-023](../decisions/ARCHITECTURE_DECISIONS.md#adr-023-shared-search--registry-driven-providers-runtime-orchestration-and-safe-navigation) and [`SHARED_SEARCH.md`](../development/SHARED_SEARCH.md).

### Command Palette
**Purpose.** The keyboard shell of the OS — do anything by typing (`⌘K` / `Ctrl+K`).
**Anatomy.** A modal command surface ([`app/shared/commands`](../../app/shared/commands)) — a WAI-ARIA combobox controlling a grouped `listbox` that merges, without confusing them, contextual actions, registered navigation/executable commands and DS-08 record [Search](#search) results, with title `<mark>` highlighting, right-aligned shortcut hints (decorative), a live status region, and idle / pending / inline-success / inline-failure+retry / empty / catalogue-error states. Opened by the PX-02 sidebar Command Palette affordance and the global `Mod+K`; mounted once at the app-shell boundary and lazy-loaded; reuses the DS-03 focus/inert/scroll-lock hooks (no second focus-trap) and sits above the Drawer.
**Behaviour.** Context-aware (contextual actions from the current surface/Drawer rank first; a command on the current module ranks higher), fully keyboard-driven (↑/↓ wrap, Home/End, Enter, Escape), fuzzy-matched, with a restrained suggested/recent set on an empty query (recents are session-only, never persisted). Search and the palette are mutually exclusive.
**Contract.** A module contributes a **command** through the [module registry](../../AGENTS.md#92-module-registry): a `navigate` command (a declarative, validated target) or an `execute` command (a server handler). Navigation runs on the client; an executable command runs once through the authenticated `POST /commands/:commandId` boundary and returns a typed, safe outcome — the browser receives serialisable metadata only, never a handler. Modules register commands from day one; they may add but never reassign the reserved keyboard vocabulary (`Mod+K`, `/`, …). See [ADR-024](../decisions/ARCHITECTURE_DECISIONS.md#adr-024-command-palette--quick-actions--command-kinds-trusted-catalogue-authenticated-execution-and-one-shared-action) and [`COMMAND_PALETTE.md`](../development/COMMAND_PALETTE.md). This is the backbone of the [keyboard-first](../../AGENTS.md#7-interaction-philosophy) product.

### Quick Actions
**Purpose.** The two or three most frequent actions on an entity, available without opening it.
**Anatomy.** Inline affordances on [Cards](#cards) and [Record Headers](#record-header) (complete, reschedule, link, assign) plus contextual keyboard shortcuts, projected from ONE shared `AppAction` ([`app/shared/commands/action.ts`](../../app/shared/commands/action.ts)) so the same action instance appears as a Card action, a Record Header action, a Command Palette command and a keyboard action.
**Behaviour.** Optimistic and reversible (prefer [undo](#success-feedback) over confirm dialogs). One identity, one execution path: pointer and keyboard call the same handler; pending blocks a duplicate activation; disabled and unavailable stay distinct; every action has a text-based accessible name.
**Contract.** A curated few live on the surface; the long tail lives in the [Command Palette](#command-palette). Persistent mutations still go through an authorised server action — the client context is never treated as authority. See [ADR-024](../decisions/ARCHITECTURE_DECISIONS.md#adr-024-command-palette--quick-actions--command-kinds-trusted-catalogue-authenticated-execution-and-one-shared-action).

### Forms
**Purpose.** Create and edit entities consistently and forgivingly.
**Anatomy.** Shared field controls (text, markdown, date, select, entity-link picker, tags) · inline labels + help · inline validation · clear submit/cancel.
**Behaviour.** Validate on blur and submit with specific, recoverable messages. Autosave where it fits; explicit save where commitment matters. Never lose entered data on error or navigation.
**Rules.** **One control per field type**, product-wide. The entity-link picker is the shared way to create [EntityLinks](../../AGENTS.md#95-entitylinks). Multiple save patterns are known [debt](../product/PRODUCT_DEBT.md) — converge on this.

### Success Feedback
**Purpose.** Confirm an action landed, quietly.
**Anatomy.** A brief toast/inline confirmation, ideally carrying an **Undo**.
**Behaviour.** Non-blocking, auto-dismissing, announced to assistive tech. Optimistic — the UI already reflects the change; the toast confirms and offers reversal.
**Rules.** Prefer undo over up-front confirmation. Don't celebrate the mundane — feedback is calm, not confetti (see [product feelings](../product/PRODUCT_PRINCIPLES.md#how-users-should-feel)).

### Error Feedback
**Purpose.** Explain what went wrong and how to recover — never dead-end the user.
**Anatomy.** Inline (field-level) for validation; toast/banner for operation failures; a full-page state only for whole-view failures — always with a retry/next step.
**Behaviour.** Specific and human ("Couldn't save — you're offline. We'll retry."), never a raw code. Preserves the user's input. Announced to assistive tech.
**Rules.** Every error names a recovery. No silent failures; no blame; no jargon.

### Loading
**Purpose.** Communicate progress without blocking or flashing.
**Anatomy.** Skeletons that mirror the final layout for content; inline spinners only for small in-place waits; optimistic UI for user-initiated changes.
**Behaviour.** Content streams in progressively (see [performance](../../AGENTS.md#16-performance-expectations)). Avoid layout shift; avoid spinner-blocked blank screens.
**Rules.** Prefer skeletons over spinners; prefer optimistic over loading. Never block the whole screen for partial data.

### Empty States
**Purpose.** Turn "nothing here yet" into "here's the next action."
**Anatomy.** A short, warm explanation of what belongs here · the primary action to create the first one · optional example/illustration.
**Behaviour.** Distinguishes *empty* (no data yet — teach + invite) from *filtered-empty* (no matches — offer to clear filters). Contextual to the module.
**Rules.** No dead-end empty states. Every one teaches the next step (see [UX philosophy](../../AGENTS.md#6-ux-philosophy)).

---

## Shared Record Layout (DS-02)

The [Record Header](#record-header), [Summary Panel](#summary-panel) and [Tabs](#tabs) patterns above are realised by ONE reusable, entity-agnostic scaffold: the **Shared Record Layout** ([DS-02](../roadmap/ROADMAP_V2.md#-ds-02--shared-record-layout-header--summary--tabs)), in [`app/shared/record-layout`](../../app/shared/record-layout). Every record view (Area, Goal, Project, Task, Person, Note, …) composes it — there are no bespoke record scaffolds. It builds entirely on [DS-01 tokens](#design-tokens-ds-01); it owns structure and accessibility, not values.

### Anatomy

```
<article aria-labelledby=title>          ← labelled landmark, titled by its heading
  RecordHeader
    ├ breadcrumb (parent context, aria "Breadcrumb")
    ├ type label + entity icon (icon decorative; label names it)
    ├ title  (the record heading — h1 by default, configurable level)
    ├ status pill  (tone + always a text label — never colour-only)
    ├ metadata chips
    └ actions  (secondary… + one primary; link when href, else button)
  RecordSummary        (optional)  ← description + key/value <dl>, or a clear empty state
  RecordTabs           (optional)  ← tablist + panels; the active panel IS the content region
    └ RecordContent    ← predictable padding/width + loading / empty / error slots
```

When no tabs are supplied, the content region is the layout's `children` wrapped in a padded container. `RecordContent` is independently reusable and can appear inside any tab panel.

### Supported configuration

- **Header:** `title` (required) · `titleId`/`headingLevel` · `typeLabel` · `icon` · `status {label, tone}` · `breadcrumb[]` · `metadata[]` · `primaryAction` · `secondaryActions[]`. Every region is optional except the title and is omitted entirely when absent.
- **Actions** (`RecordAction`): `label` (also the accessible name unless `ariaLabel` overrides) · `href` (renders a link) or `onSelect` (renders a button) · `variant` (`primary`/`secondary`) · `disabled`.
- **Summary** (`RecordSummaryProps`): `description` · `metadata[]` · `emptyLabel`. Requested-but-empty shows a calm empty state.
- **Tabs** (`RecordTab`): `id` · `label` · `content` · `disabled` (visible, not selectable) · `hidden` (omitted) · `badge` (decorative). Controlled (`activeTabId` + `onTabChange`) or uncontrolled (`defaultTabId`); wire `onTabChange` to a URL param for deep-linking.
- **Content** (`RecordContentProps`): `isLoading` · `isEmpty` · `error` · `loadingSlot`/`emptySlot`/`errorSlot` overrides · `label`. Precedence: error → loading → empty → children.

### Responsive behaviour

The layout is a **container-query context** (`container-type: inline-size`), so it adapts to the width of its container — the main region today, a [Drawer](#drawer) in DS-03 tomorrow — not the viewport. With `min-width: 0`, wrapping metadata, `overflow-wrap: anywhere` on titles/descriptions and a horizontally-scrollable tab strip, there is **no horizontal page overflow from 320px up**. On a narrow container, header actions take the full width beneath the title and grow to a comfortable target rather than disappearing.

### Accessibility

- **Landmarks & outline:** the record is an `article` labelled by its heading; the heading level is configurable so the surrounding page keeps a correct outline.
- **Tabs:** the WAI-ARIA Tabs pattern — `role="tablist"`/`tab`/`tabpanel`, roving `tabindex`, `ArrowLeft/Right`/`Home`/`End` navigation that skips disabled tabs, and panels linked with `aria-labelledby`. The active tab is signalled by `aria-selected` **and** weight + an underline bar — **never colour alone**.
- **Actions** always carry an accessible name; icon/terse labels use `ariaLabel`. **Focus** is visible on every control via the DS-01 focus ring. The loading region sets `aria-busy`; the error slot is a `role="alert"`. Motion (the skeleton shimmer) honours reduced-motion.

### Correct vs incorrect usage

- ✅ Compose a record from `RecordLayout`, passing plain typed data; put depth in `tabs`, essentials in `summary`.
- ✅ Convey status with a `tone` **and** its label; give every action a real name.
- ❌ Build a bespoke header/tab strip for a module, or restyle the layout with one-off CSS instead of extending tokens.
- ❌ Encode meaning in colour alone (a red pill with no label), or use `RecordContent` error text without a recovery.
- ❌ Bake entity-specific logic into the layout — it stays entity-agnostic; entity behaviour lives in the module.

---

## Shared Drawer (DS-03)

The [Drawer](#drawer) pattern above is realised by ONE reusable, entity-agnostic overlay: the **Shared Drawer** ([DS-03](../roadmap/ROADMAP_V2.md#-ds-03--shared-drawer)), in [`app/shared/drawer`](../../app/shared/drawer). It opens any record over the current page without losing the user's place, is deep-linkable and stackable, and **hosts the [DS-02 Record Layout](#shared-record-layout-ds-02)** rather than inventing a second record presentation. It knows nothing about any entity, D1, workspaces or module routes — callers pass an opaque key and a render function. It builds entirely on [DS-01 tokens](#design-tokens-ds-01) (z-index, elevation, motion, colour, spacing) and is accepted in [ADR-018](../decisions/ARCHITECTURE_DECISIONS.md#adr-018-the-shared-drawer--url-driven-history-stacked-focus-isolated).

### Purpose

Open a record *in context* — click a task in Today and it slides in over the page, which stays visible and keeps its state. The Drawer is the **default** way to open any record; full-page record views exist only where genuinely warranted (e.g. long-form Note editing). It must never lose the user's place.

### Public anatomy

```
DrawerProvider (mount once, wraps the page)   ← owns the URL stack, focus, inertness, scroll lock
  ├ renderDrawer(entry) → { title, description?, children, size?, preventClose?, initialFocusRef? } | null
  ├ <the page>                                 ← rendered inert while a drawer is open
  └ DrawerStack (only while open)              ← viewport-fixed sibling; scrim + one panel per level
       └ Drawer (per level)                    ← role=dialog, aria-modal on top only
            ├ header: title (accessible name) + optional description + always-present Close
            └ body: children  ← a DS-02 RecordLayout (scrolls independently)

useDrawer() → { entries, depth, isOpen, topKey, openDrawer, replaceDrawer, closeDrawer, closeAll }
DrawerTrigger drawerKey=…   ← a link that opens a key (shareable href + SPA open)
DrawerClose                 ← an in-content close control
```

Internal panel/stack/focus-trap/scroll-lock/inert machinery is **not** exported — callers never manage focus traps, portals, history entries or z-index.

### URL & deep-link model

The open stack lives entirely in the URL as a repeated `drawer` search parameter, backmost first:

```
/projects?status=active&drawer=project%3Aalpha&drawer=goal%3Anorth-star
```

The rendered stack is a **pure function of the URL**, so refresh, a copied link and Back/Forward all restore the same state — Drawer state is never held in ephemeral location state that a refresh would drop. Keys are opaque, URL-safe tokens; the `<kind>:<id>` shape is a *consumer* convention, never parsed by the Drawer. Every transform preserves unrelated query parameters. A **direct deep link** to a drawer URL renders server-side and coherently even with no background-location state; an unknown key yields a built-in, accessible not-found panel rather than a blank overlay.

### Stack model

- Opening pushes **one** history entry; re-opening the current top is a no-op (never a duplicate level).
- Each nested drawer gets its own history entry; levels are keyed by **stack depth _and_ record key**, so opening a higher drawer **never remounts** the ones beneath it (their selected tab, scroll position and local state survive), while **replacing** the record at a depth (same depth, new key) **does** remount that level — so record-local state and mount-only initial focus never leak from a replaced record into its replacement.
- Only the **top** drawer is interactive; lower levels are `inert`. Stack order maps to z-index via DS-01 tokens.
- A generous depth cap replaces further pushes with a top-replace to bound pathological loops without limiting normal use.

### Desktop & mobile presentation

- **Desktop/laptop:** a calm side sheet entering from the right; the underlying page stays visible behind a restrained scrim; width fits a full Record Layout (`default`, or `wide`); the top drawer is visually distinct from prior levels; the panel never forces the document wider.
- **Narrow/mobile:** a full-height, (near-)full-width sheet that respects safe-area insets, is usable at 320px, and introduces no horizontal page overflow. The DS-02 actions and tab strip stay reachable.
- **Motion:** quick, restrained enter using DS-01 duration/easing tokens; instant under `prefers-reduced-motion`. No animation is required to understand the Drawer.

### Focus, background inertness & scroll

- **Focus:** on open, focus moves into the drawer — an explicit `initialFocusRef`, else the close button, else the first control. Tab/Shift+Tab are trapped and wrap. On close, focus returns to the opener when it still exists, else a safe fallback (never lost to `<body>`).
- **Background inertness:** while a modal drawer is open, everything outside the top panel — the underlying page *and* the app shell — is `inert`, so it is unreachable by keyboard or assistive tech. Nested drawers never expose the level beneath. The top drawer is a `role="dialog"` with `aria-modal`, an accessible name (its title) and an optional `aria-describedby` description; the close control always has an accessible name.
- **Escape & history:** Escape and the close button close **only the top** level (unless `preventClose` is set). Closing is *provenance-aware* (ADR-018 §18.2): a level the Drawer itself opened closes with browser **Back** (so Forward restores it); a directly deep-linked, copied-link or refreshed level instead has **only its top drawer parameter removed in place**, preserving the pathname, hash and unrelated query parameters — so closing a shared drawer link never navigates you to a different page. Browser Back closes the top; Forward restores an opener-pushed level; navigating to another page exits the stack.
- **Body scroll:** page scrolling is locked while open (the drawer body scrolls independently, with the header/close always reachable); the underlying scroll **position** is preserved by path-keyed `ScrollRestoration` (ADR-018 §18.6), so a drawer never moves the page.
- State is never communicated by colour alone; focus uses the DS-01 focus ring; behaviour holds at 200% zoom.

### Integrating a RecordLayout

```tsx
<DrawerProvider
  renderDrawer={(entry) => {
    const record = lookup(entry.key);          // caller maps key → data (or null)
    if (!record) return null;                  // → graceful not-found panel
    return {
      title: record.title,                     // the dialog's accessible name
      description: `${record.type} record`,
      size: record.type === "note" ? "wide" : "default",
      children: (
        <RecordLayout title={record.title} headingLevel={3} typeLabel={record.type} …>
          {/* related records open a stacked drawer */}
          <DrawerTrigger drawerKey={`goal:${record.goalId}`}>Open goal</DrawerTrigger>
        </RecordLayout>
      ),
    };
  }}
>
  <Page />
</DrawerProvider>

// Anywhere inside the provider:
const { openDrawer } = useDrawer();
openDrawer(`task:${id}`);   // or <DrawerTrigger drawerKey={`task:${id}`}>…</DrawerTrigger>
```

### Correct vs incorrect usage

- ✅ Mount **one** `DrawerProvider` per surface; open records by key with `useDrawer`/`DrawerTrigger`; host a `RecordLayout` as the drawer body.
- ✅ Let the Drawer own focus, inertness, scroll-lock and history; return `null` from `renderDrawer` for unknown keys.
- ✅ Use `size="wide"` only when a record genuinely needs it; use `preventClose` for unsaved-state guarding of the in-app affordances.
- ❌ Build a bespoke modal/overlay, add a drawer/modal dependency, or duplicate the record scaffold inside a drawer.
- ❌ Hold drawer state in component booleans or ephemeral location state (breaks refresh/deep links), or parse entity meaning out of the key.
- ❌ Manage focus traps, portals, z-index or history entries by hand, or convey state by colour alone.

### Extension rules

Add a `size` variant, a stack-metadata field or a presentation option to the shared Drawer only when a real record needs it, and document it here — never fork the Drawer per module. Real product record routes (replacing the fixture's `<kind>:<id>` keys) arrive when a module first adopts the Drawer; DS-03 ships the mechanism and a development fixture only.

---

## Shared Cards (DS-04)

The [Cards](#cards) pattern above is realised by ONE reusable, entity-agnostic component: the **Shared Card** ([DS-04](../roadmap/ROADMAP_V2.md#-ds-04--shared-cards)), in [`app/shared/card`](../../app/shared/card). Every entity type — Area, Goal, Project, Task, Person, Note, … — renders through this one Card configured with data. There is **no** `TaskCard`/`ProjectCard`/`GoalCard`/`PersonCard`/`NoteCard`; a bespoke per-module card is [Product Debt](../product/PRODUCT_DEBT.md) the moment it merges. The Card builds entirely on [DS-01 tokens](#design-tokens-ds-01) (card.css) and opens records through the [DS-03 Drawer](#shared-drawer-ds-03); it is accepted in [ADR-019](../decisions/ARCHITECTURE_DECISIONS.md#adr-019-shared-card-identity--reorder-and-the-filter-expression--url-contract).

**Purpose.** The shared unit for representing an entity in a list, board or grid, with selection, quick actions, density and an accessible primary open action — configured, never forked.

**Entity-agnostic rule.** The Card knows nothing about D1, repositories, workspaces, the Area hierarchy, Project/Task rules, real routes, module loaders or Cloudflare bindings. It accepts generic presentation concepts only (a `typeLabel`, an `icon`, a `tone`), so entity-specific business rules stay in the future modules that configure it.

**Anatomy.**

```
<article aria-labelledby=title>                 ← labelled, NON-interactive card landmark
  [reorderHandle]  (from ReorderableCardCollection)
  [selection]      ← native checkbox; never opens the record
  body
    ├ type row: entity icon (decorative) + type label · status pill (tone + label)
    ├ title      ← the PRIMARY OPEN TARGET: a real link and/or button
    ├ subtitle / context (parent label) / due-or-date label
    ├ progress   ← role=progressbar with an accessible text equivalent
    └ metadata[] ← a small, wrapping, typed collection
  actions        ← quick actions + optional overflow; reveal on hover/focus, always
                   reachable by keyboard and on touch; each stops propagation
```

**Typed public contract.** `CardProps` (see [`app/shared/card/types.ts`](../../app/shared/card/types.ts)): stable `id` · `title` (required) · `typeLabel`/`icon`/`accent` · `subtitle` · `status {label, tone}` · `metadata[]` · `progress {value, max?, label?}` · `context {label, href?}` · `dateLabel {label, tone?}` · `selection {selected, onSelectedChange, disabled?, label?}` · `quickActions[]` · `overflowAction` · `href` and/or `onOpen` + `openAriaLabel` · `density` · `presentation` · `reorderHandle`.

**Primary open action & Drawer integration.** Activating the title opens the record in the [DS-03 Drawer](#shared-drawer-ds-03) — but the Card does **not** own Drawer state or parse drawer keys. Provide `href` (a shareable link, e.g. a drawer deep link), `onOpen` (an SPA callback), or **both**: an unmodified click opens via `onOpen`; a modified/middle click follows the `href` (open in a new tab). Mouse and keyboard both open; the target always has an accessible name; there is no inaccessible `div onClick` and no nested-interactive violation (the card root is a plain `article`). Opening a Drawer from a filtered collection preserves the active filter query parameters (they live in different URL parameters — [DS-07](#shared-filters-ds-07) `f`/`fmode`/`fv` vs DS-03 `drawer`).

**Selection.** Controlled and native: a real checkbox with an accessible name, a change callback, keyboard operation, and a selected state conveyed by the checked checkbox **and** a border/surface cue — never colour alone. Selection never opens the record, remains visible in both densities, and does not depend on hover (reachable on touch). Bulk mutations/Inspector are out of scope (later items).

**Quick actions.** A curated two or three per card (the long tail lives in the overflow or [Command Palette](#command-palette)). Each is a button or link with a stable id, a visible label or explicit `ariaLabel`, optional icon, disabled and generic `pending` states, and optional shortcut/description metadata. Actions reveal on hover/focus for pointer/keyboard and are always reachable on touch; they stop propagation so they never open the card; disabled/pending actions cannot fire; meaning is never icon- or colour-only. The Card implements **no** optimistic mutation or Undo (DS-10) and hard-codes **no** Task-specific action.

**Progress & metadata.** Progress takes a bounded `value` against `max` (default 1), normalises invalid/NaN/negative/over-max input safely, and exposes `role="progressbar"` with `aria-valuetext` plus visible text — understandable without colour, correct at zero and complete. Metadata is a small typed collection that wraps safely, stays readable in compact mode, handles long unbroken strings (`overflow-wrap: anywhere`), and never turns the card into a miniature record page.

**Density, list/board/grid.** `density` is `comfortable` or `compact`; `presentation` is `list`, `board` or `grid` — the **same** component in all three. Presentation changes spacing/placement but never removes essential information or actions. At 320px there is no horizontal document overflow, title/metadata wrap, selection and quick actions stay reachable, touch targets meet the 44px token, and the open action stays obvious.

**Reorder model & keyboard equivalent.** DESIGN_SYSTEM requires drag with a keyboard equivalent. `ReorderableCardCollection` (with `CardReorderHandle`) provides both over the browser platform — Pointer Events + keyboard — with **no drag-and-drop dependency**. Pointer users grab the handle and drag; keyboard users focus the handle, press Enter/Space to pick up, Arrow Up/Down to move, Enter/Space to drop, Escape to cancel (restoring order). The handle has an accessible name; position/movement are announced via a live region; reordering **emits intent** (`onReorder(nextIds, detail)`) rather than mutating business data (no hidden database update); non-reorderable cards are pinned and cannot move. The **permutation guarantee** is enforced by capturing the committed collection (id order + pinned set) when the drag begins and cancelling cleanly if *anything* changes before drop — an item added, removed, reordered externally, or flipped between reorderable and pinned — so `onReorder` never emits a deleted id, omits a new one, or violates the current order; focus stays predictable. It works in both densities and does not rely on tiny touch targets. **Reorder is list presentation only** for now: pointer targeting is one-dimensional (vertical), which is correct for a single-column list but not a multi-column grid — a genuine two-dimensional grid reorder is deferred to a later item. `CardCollection` is the plain (non-reorderable) container for list/board/grid; grid and board layouts use it and do **not** offer drag.

**Accessibility.** Semantic card structure (`article` + heading); accessible primary open action with visible focus; native, labelled selection; keyboard-accessible quick actions that are never hover-only; status/date as text (not colour alone); labelled/valued progress; a keyboard-operable, announced reorder handle; logical tab order; no nested-button/link violations.

**Correct vs incorrect usage.**

- ✅ Configure ONE `Card` with plain typed data for any entity; give the title an `href`/`onOpen` that opens the DS-03 Drawer; keep quick actions a curated few.
- ✅ Use `ReorderableCardCollection` for accessible reorder and let it emit intent; treat progress/status/date as text-bearing.
- ❌ Build a `TaskCard`/`ProjectCard`/… or bake entity/business logic into the Card; make the whole card a single click target (`div onClick`) or nest interactive controls; convey selection/status by colour alone; hide quick actions from touch; mutate data inside a reorder.

**Extension rules.** Add an affordance to the **one** shared Card (and document it here) only when a real entity needs it; never fork per module. Real product card usages arrive when a module first adopts DS-04 — this ships the component plus a development fixture only.

---

## Shared Filters (DS-07)

The [Filters](#filters) pattern above is realised by ONE reusable, entity-agnostic system: the **Shared Filters** ([DS-07](../roadmap/ROADMAP_V2.md#-ds-07--shared-filters)), in [`app/shared/filters`](../../app/shared/filters). One filter system drives **every** collection — Today, Projects, Search and all lists — never a per-module filter bar. Its **pure model** (definitions, expressions, operators, evaluator, URL codec, saved-view data, display formatting) imports no React and is re-exported from a dedicated entry [`app/shared/filters/model`](../../app/shared/filters/model.ts), so a server-backed module can translate a filter expression into its own query layer without resolving any React or UI code (an import guard test enforces this). The React UI is exported separately from `~/shared/filters`. It builds on [DS-01 tokens](#design-tokens-ds-01) and its URL contract composes cleanly with the [DS-03 Drawer](#shared-drawer-ds-03); it is accepted in [ADR-019](../decisions/ARCHITECTURE_DECISIONS.md#adr-019-shared-card-identity--reorder-and-the-filter-expression--url-contract).

**Purpose.** Narrow any collection with a consistent, URL-backed, saveable control — the reusable "collection language" future modules consume by registering typed fields and supplying records.

**Filter-definition contract.** A module registers `FilterFieldDefinition[]` ([`app/shared/filters/types.ts`](../../app/shared/filters/types.ts)): field `id` · `label` · `type` (value type) · optional `operators` override · `options` (enum/reference/multi-enum) · `allowMultipleClauses` · a client-side `accessor` (for local/fixture evaluation) · optional `formatValue` (chip display). Nothing here is business logic, and nothing here is React — the field definition stays framework-free. Custom value-control rendering (the seam DS-06 shared form controls plug into) is a **UI-only** concern: a consumer supplies a `FilterValueControls` registry (field id → renderer, from [`app/shared/filters/value-controls.ts`](../../app/shared/filters/value-controls.ts)) to the `FilterBar`, keeping React out of the model.

**Expression model.** A bounded, non-recursive `FilterExpression = { mode: "and" | "or"; clauses: FilterClause[] }`; each `FilterClause` is `{ id, field, operator, value? }`. It is serialisable, comparable (`expressionsEqual`, ignoring clause ids) and validated against the registered definitions — deliberately **not** a general query language or a recursive builder. Clause `id` is stable identity for React keys/focus/editing and is **not** part of the serialised URL.

**Generic value types & operators.** Value types: `text`, `boolean`, `enum`, `number`, `date`, `reference`, `multi-enum`. Operators are value-type appropriate (`OPERATORS_BY_TYPE`), so nonsensical combinations cannot be built:

| Type | Operators |
|---|---|
| text | contains · does not contain · equals · is empty · is not empty |
| enum / reference | is · is not · is any of · is none of · is empty · is not empty |
| multi-enum | is any of · is none of · is empty · is not empty |
| number / progress | equals · greater than · less than · between · is empty · is not empty |
| date | on · before · after · between · is empty · is not empty |
| boolean | is true · is false |

Each operator declares a value **arity** (`none`/`scalar`/`list`/`range`), so no-value operators show no value control and an invalid clause cannot be applied. The client-side evaluator (`matchesExpression`/`filterRecords`) is pure and deterministic: it handles missing/null values, compares dates by UTC calendar day (stable across timezone/UTC boundaries), leaves source data unmodified, and drops invalid clauses rather than throwing.

**Type-appropriate validation.** Validation enforces the field's declared value **type**, not just operator arity, so a clause restored from an untrusted URL cannot slip through with an inappropriate value: text requires a non-empty string; number requires a finite number (rejecting `NaN`/`±Infinity`, empty strings and arbitrary text; ranges require two finite numeric strings); date requires strict `YYYY-MM-DD` calendar dates (rejecting impossible dates, timestamps, booleans and numbers; ranges require two valid dates); enum/reference require string scalars and non-empty string lists; multi-enum membership requires non-empty string arrays; boolean uses no-value `is_true`/`is_false`. For enum/reference/multi-enum, **unknown option values are retained** for forward compatibility (a field's `options` may be partial or lazily loaded, and a saved view must not break when the option list changes) — only the value *type* is enforced. A field's `operators` override may only **narrow** the type's default set; a widening override is a field-definition bug that throws in development and is clamped to the safe intersection in production.

**AND/OR rules.** A single `mode` composes all clauses with AND (default) or OR (offered when it is meaningful — more than one clause). AND requires every clause; OR requires at least one; an empty expression matches everything. AND/OR is presented as a labelled radio group — understandable without colour.

**URL contract.** Filters live in the URL, never only in component state (`useFilterUrlState`). The encoding is **repeated, versioned and safely encoded** — not one opaque JSON blob:

```
/tasks?status=active&fv=1&f=status%3Ais%3A%22open%22&f=title%3Acontains%3A%22hi%22&fmode=or
```

- `fv` — a format version (forward-compatible; an unknown version is ignored wholesale).
- `f` — one per clause: `field:operator` for no-value operators, else `field:operator:<json-value>` (a small per-clause JSON scalar/array/range — correct for punctuation, spaces, Unicode and URL-reserved characters, and deterministic for our fixed value shapes).
- `fmode` — present only for `or` (AND adds no state).

Active filters survive refresh and copied links; Back/Forward restores prior states; unrelated parameters — including DS-03's repeated `drawer` parameters — are preserved, and opening/closing a Drawer preserves filters; filter changes don't reset scroll unnecessarily; empty filters remove all URL residue; equivalent states produce deterministic URLs; duplicate/single-valued fields have defined behaviour; clause count and encoded size are bounded.

**Malformed / deep-link behaviour.** Decoding is total and defensive: there is **no `eval`, no `Function`, no unsafe deserialisation** — only bounded `JSON.parse` in a `try/catch`. Malformed values, unknown fields/operators, oversized clauses and excess clauses are dropped safely (`sanitiseExpression`); an unknown version yields an empty expression; a hostile or huge URL is rejected/truncated rather than trusted.

**Filter Bar anatomy.** One reusable `FilterBar`: Add-filter (a focus-managed popover), active chips (edit + labelled remove), Clear-all, an AND/OR mode control (when meaningful), an optional result count (announced via a polite live region), and an optional saved-view selector with a modified indicator; it wraps/scrolls responsively and stays usable at 320px.

**Chips.** Each chip shows readable field/operator/value text (option labels for enums, not raw values), is its own edit trigger, and carries a separately-labelled remove control; state is never colour-only.

**Add/edit flow.** Choose field → choose a valid operator → enter/choose a value where required → apply; then edit or remove the chip. Changing the field resets incompatible operator/value state; no-value operators show no value control; invalid clauses can't be applied (with a clear message); cancelling leaves the filter unchanged; editing preserves the clause's stable identity; no entered value is silently discarded. Controls are restrained native elements until DS-06 replaces them behind the same contract.

**Saved-view adapter contract.** Storage-agnostic (`SavedViewAdapter`): `views` · `activeViewId` · `onSelect`/`onSaveRequested`/`onUpdateRequested`/`onDeleteRequested`. A `SavedView` is `{ id, name, expression, description?, createdAt?, updatedAt? }`. The Filter Bar exposes exactly these interactions — select, save-as, update and delete; it advertises **no** rename callback because it has no rename interaction yet (a saved-view *management* surface, incl. rename, arrives with X-02), keeping the contract honest. DS-07 **does not persist** saved views (no D1, no migration); a consumer supplies them (a fixture may hold them in memory). `isViewModified` compares the current expression to the active view; a view referencing an obsolete field fails gracefully (the obsolete clause sanitises away).

**Filtered-empty behaviour.** `FilterEmptyState` distinguishes *filtered-empty* (active filters match nothing → a clear-filters recovery, never a dead end) from *genuinely empty* (no records → teach the next action).

**Responsive & accessibility.** Every control has an accessible name; the menu/editor is keyboard-complete with correct focus management; Escape dismisses only the current editor; chips expose readable names and accessible removal; result-count changes are announced without excessive chatter; filtered-empty offers recovery; AND/OR reads without colour; touch targets meet the token; the bar works at 320px and 200% zoom, and long values wrap without page overflow.

**Correct vs incorrect usage.**

- ✅ Register typed field definitions and supply records; bind the expression to the URL with `useFilterUrlState`; render filtered records through the one DS-04 Card; use `FilterEmptyState` for the two empty states.
- ✅ Keep the model pure (evaluate/serialise without React); rely on the versioned repeated-parameter URL encoding.
- ❌ Build a per-module filter bar or hard-code Task/Project/Goal logic in the model; hold filter state only in component state; encode the whole state as one opaque JSON blob; expose nonsensical operator/value combinations; persist saved views to D1 here.

**Extension rules.** Add a value type/operator or a bar affordance to the **one** shared system (and document it here), never a per-module fork. Real product filter usages and server-side/saved-view persistence arrive with later items (Today, Projects, X-02) — this ships the system plus a development fixture only.

---

## Shared Timeline & Activity Feed (DS-05)

The [Timeline](#timeline) and [Activity Feed](#activity-feed) patterns above are realised by ONE reusable, entity-agnostic system: the **Shared Timeline & Activity Feed** ([DS-05](../roadmap/ROADMAP_V2.md#-ds-05--shared-timeline--activity-feed)), in [`app/shared/activity-feed`](../../app/shared/activity-feed). A record-scoped Timeline and a workspace/scope Activity Feed are **two configurations of the same component**, never forked. It renders the [shared Activity model](../../AGENTS.md#96-shared-activity-model) (FND-05) and invents no event source. It builds on [DS-01 tokens](#design-tokens-ds-01), reuses the [DS-03 Drawer](#shared-drawer-ds-03) for opening entities, the [DS-07 Filters](#shared-filters-ds-07) for filtering, and the PX-02 [EmptyState](#empty-state-px-02)/[Skeleton](#loading-states-px-02)/[Entity Identity](#entity-identity-px-02); it is accepted in [ADR-021](../decisions/ARCHITECTURE_DECISIONS.md#adr-021-the-shared-timeline--activity-feed--one-renderer-one-presentation-view-model-in-house-virtualisation).

**Purpose.** Show "what happened, when" — for one record (Timeline, suitable for the Activity tab of the [DS-02 Record Layout](#shared-record-layout-ds-02)) and across a workspace or scope (Activity Feed) — as calm, dense, chronological, filterable, virtualised history.

**One renderer, two configurations.** `ActivityStream` is the single renderer; `Timeline` (`scope="timeline"`) and `ActivityFeed` (`scope="feed"`) are thin presets. They differ only in the `loadPage` they receive (a Timeline's loader calls `activity.listForEntity(entityId, …)`; a Feed's calls `activity.listForWorkspace(…)`) and their accessible label. Grouping, the event item, filtering, pagination and virtualisation are shared by construction — there is **no** separate Timeline/Feed item or list.

**Public contract (entity-agnostic).** The component API exposes **no** D1, Cloudflare bindings, repository internals, cursor internals or workspace-selection controls. `ActivityStream` takes an opaque `loadPage(cursor) → { items, nextCursor, hasMore }` loader, an `ariaLabel`, an optional `formatter`, optional DS-07 `filterFields`/`filterExpression`/`onClearFilters`, an optional `renderEntityLink`, and virtualisation/height knobs. The route owns the `resolveWorkspaceScope(env).activity` call and the record→item mapping behind the loader; the **trusted workspace boundary is fixed server-side** and is never selected or overridden by client input through the component.

**One presentation view-model.** `toActivityItem(record, options)` (React-free, re-exported from [`~/shared/activity-feed/model`](../../app/shared/activity-feed/model.ts)) is the single boundary mapping a kernel `ActivityRecord` → a renderable `ActivityItem`. It **preserves** the branded `ActivityType`, the open validated-string actor/subject fields, the UTC `occurredAt` and the validated `payload` unchanged (no `any`), attaches each subject's resolved entity identity (resolved in **one batch** by the caller — the UI never fetches per item, so no N+1), and selects a primary subject deterministically (the Timeline anchor first). It preserves activity id (the dedup/merge key), activity type, timestamp, trusted actor, subjects and their roles, payload, and referenced-entity identity where available.

**Event fallback rules.** A per-type `ActivityTypeDescriptor` is the only place a specific event gets a specialised rendering; the seven kernel-reserved lifecycle types (`entity.created/updated/deleted/restored`, `entity_link.created/unlinked/restored`) ship defaults, and modules register their own via `createActivityDescriptorMap`. There is **no** large product switch over Tasks/Projects/Goals/Areas/People/Notes/Diary. An unregistered or newly-invented type uses a conservative generic fallback that: stays readable; shows the humanised event type safely; shows the actor, the time and available subjects; **never crashes on an unfamiliar payload**; and **never dumps raw unbounded JSON** — the payload summariser emits only a bounded set of primitive top-level fields and skips nested objects/arrays entirely.

**Event item.** One shared `ActivityEventItem` renders every event: an entity marker (the [Entity Identity](#entity-identity-px-02) icon/accent where the event has an entity type, else a tone dot), an actor + action description with inline entity links, a semantic `<time datetime>` (short time-of-day, full timestamp as the title), optional restrained metadata and a safe payload-derived summary. It is calm and dense with **no heavy card border around every event**, long names/descriptions wrap (`overflow-wrap: anywhere`), meaning is **never colour-only** (every event has a text description and a time), and it is memoised so one item changing does not rerender the list.

**Grouping & ordering.** Events are totally ordered **newest-first by `(occurredAt, id)`** with `id`-descending tie-breaking (matching the kernel's `ORDER BY occurred_at DESC, id DESC`), grouped by **UTC calendar day** (stable buckets regardless of viewer timezone), and flattened to heading+item rows so one windowed list keeps day headings correctly associated. All day/time formatting flows through ONE `ActivityDateFormatter` (the central date seam) that formats **manually against UTC getters** with fixed month/weekday tables — **not `Intl`** — so server and client render byte-identical text (hydration-safe); relative "Today"/"Yesterday" are opt-in via a caller-threaded reference instant. Day headings are sticky, real `h2`/`h3`/`h4` headings that stay in the accessibility tree (correct outline, labelled day group); timestamps are semantic `<time>`.

**Filtering (reuses DS-07).** DS-05 builds no timeline-only filter UI. `createActivityFilterFields` produces DS-07 `FilterFieldDefinition`s over the `ActivityItem` view-model — at minimum **event type**, plus **actor type**, **referenced entity type** and **date** — handed to the shared [`FilterBar`](#shared-filters-ds-07). The DS-07 evaluator matches over loaded items, and filter state follows the DS-07 URL contract, preserving unrelated params **including the DS-03 `drawer` params**. It adds no product-specific operator and does not expand DS-07.

**Drawer integration (reuses DS-03).** A referenced entity opens through the [DS-03 Drawer](#shared-drawer-ds-03) (a `DrawerTrigger` by default) — **no bespoke modal, no second drawer** — preserving current filters and page context, keyboard-accessible. An entity that is deleted, inaccessible or no longer resolvable degrades to calm non-link text and discloses nothing (no cross-workspace leakage).

**Pagination.** The stream integrates cursor-based paging: initial load, next cursor, load another page, end-of-feed, retry after failure, **deduplication by stable activity id** and deterministic page merging. Retrieval uses an accessible **Load more** control (not automatic infinite scroll as the only path); there are no unbounded "load everything" queries.

**Virtualisation.** Long streams are virtualised by a small **in-house** pure `computeWindow` core plus a measurement hook inside a **bounded scroll region** — **no data-grid dependency**. Only rows near the viewport render, positioned by measured offsets with top/bottom spacers that keep total scroll height stable, so variable-height content does not overlap or jump, day headings stay associated, and **loading more never resets the user's position** (new items append below). Mapping/grouping/filtering are memoised so they do not rerun unnecessarily, and no N+1 entity lookup is introduced.

**States.** Reusing the shared components: initial loading (Skeleton), genuinely-empty (EmptyState), filtered-empty (DS-07 `FilterEmptyState` with a clear-filters recovery), loading-more, page-load failure with retry (the `role="alert"` convention), end-of-feed, unknown-event-type (the safe fallback) and unresolved-subject.

**Accessibility.** WCAG 2.2 AA: a `role="feed"` region with an accessible name and `aria-busy`; articles with `aria-posinset`/`aria-setsize`; accessible day-group headings (real `h3` in the a11y tree); a logical heading hierarchy; semantic `<time>`; visible focus on keyboard-accessible entity links and controls; a polite live-region announcement of newly-loaded events; non-colour event meaning; adequate touch targets; correct behaviour at 320px and 200% zoom; and reduced-motion compliance. Virtualisation preserves keyboard and screen-reader usability.

**Responsive behaviour.** Calm and dense on desktop, no horizontal overflow from 320px up (metadata wraps, long tokens break), touch targets meet the 44px token, and light/dark parity comes from the semantic token maps.

**Correct vs incorrect usage.**

- ✅ Drop a `Timeline` into a DS-02 Activity tab, or an `ActivityFeed` into a workspace surface, by supplying one `loadPage` and (optionally) descriptors + a batch entity resolver; register your module's event descriptors; filter via DS-07 fields; open entities via DS-03.
- ✅ Keep the mapping/model pure; let the route own the repository call and trusted scope behind the loader.
- ❌ Fork a separate Timeline and Feed; pass a repository/D1/binding into the component; build a product switch over entity/event types; dump raw payload JSON; add a virtualisation or drawer/modal dependency; select the workspace from client input; convey event meaning by colour alone.

**Extension rules.** A new module renders its event types by **registering descriptors** (and, if needed, adding filter options) — never by editing DS-05. Add a value type/affordance to the shared system only when a real surface needs it, and document it here; never fork per module. Real product Timelines/Feeds arrive when a module adopts DS-05 (e.g. [PROJ-04](../roadmap/ROADMAP_V2.md#-proj-04--activity)); DS-05 ships the system plus a development fixture only. See [`ACTIVITY_TIMELINE.md`](../development/ACTIVITY_TIMELINE.md).

---

## Shared Forms & field controls (DS-06)

The [Forms](#forms) pattern above is realised by ONE reusable, **entity-agnostic** forms system (the **Shared Forms** system, [DS-06](../roadmap/ROADMAP_V2.md#-ds-06--shared-forms--field-controls), in [`app/shared/forms`](../../app/shared/forms)). There is no `TaskForm`/`ProjectForm`/`NoteForm`: consumers supply typed values, field definitions, validation and persistence callbacks and compose the shared controls, the form host and the declared save model. The shared UI knows nothing of Tasks/Projects/Goals/Areas/People/Notes, D1/SQL, workspace selection, routes, product modules or a central entity-type switch — server loaders/actions keep the trusted workspace scope and data access. It builds entirely on [DS-01 tokens](#design-tokens-ds-01), renders Markdown through the [FND-08 pipeline](#markdown), creates relationships through the [FND-04 EntityLink kernel](../../AGENTS.md#95-entitylinks), and is accepted in [ADR-022](../decisions/ARCHITECTURE_DECISIONS.md#adr-022-shared-forms--field-controls--declared-save-model-validation-boundary-and-the-entity-link-picker).

**Public anatomy.** A small, typed surface (`app/shared/forms/index.ts`), plus a **React-free model** entry ([`~/shared/forms/model`](../../app/shared/forms/model.ts)) imported by non-UI code:

```text
Form            <form> wrapper (owns nothing but layout + aria-busy)
  FormErrorSummary   assertive summary; links/focuses each invalid field
  FormSection / FieldGroup   grouped fields (fieldset/legend semantics)
  Field         shared anatomy: label · required/optional cue · help · error
    <control>   TextField · MarkdownField · DateField · SelectField ·
                TagsField · BooleanField · EntityLinkPicker
  FormActions   explicit Save / Cancel (FormButton: pending + disabled)
  SaveStatusIndicator   calm autosave status (Unsaved/Saving/Saved/Couldn't save)
```

**Field contract.** Every control accepts the same anatomy + binding props (`label`, `value`, `onChange`, `onBlur`, `error`, `help`, `required`, `disabled`, `readOnly`, `id`, `controlRef`), so a control is usable standalone or bound to a form host (`<TextField {...form.field("title")} />`). `Field` builds a consistent, accessible layout: a stable control id and derived description ids, a **visible** label, an explicit **required/optional** cue (words, never colour), optional help, the current validation message, correct `aria-describedby`/`aria-invalid`/`aria-errormessage`, full-width narrow-container-safe layout, and semantically distinct **disabled vs read-only**. User input is never trimmed or mutated unless the field contract asks for it.

**Controls (one per field type).** **Text** (single/multi-line, optional length readout, real `maxLength`, correct `autocomplete`). **Markdown source** (edits FND-08 source, preserved verbatim; a safe preview through the ONE `MarkdownContent` sink — no second parser, no new HTML sink; not the Notes editor). **Date** (unambiguous date-only + UTC datetime; see below). **Select** (single or multi; accessible editable combobox/listbox; client filter or async `onSearch`/`loading`; a stale/unavailable value is shown and labelled, never a crash). **Tags** (controlled string collection; keyboard add/remove; normalisation, duplicate prevention, configurable limits; no tags database). **Boolean** (native checkbox or switch; clickable label; never colour-only). **Entity-link picker** (below).

**Validation.** Predictable and layered: synchronous field validators (first failure wins), optional async/server validation, validation **on blur** and **on explicit submit**, form-level and field-level errors with specific, recovery-oriented messages. A submit is **blocked while any value is invalid**; the first invalid field is **focused** after a failed submit; **every entered value is preserved** when validation or persistence fails; stale async responses are ignored; the **server is authoritative** (server field/form errors are shown even when client validation passed). Raw exceptions, database errors, stack traces and opaque codes are never surfaced. The error summary is an assertive live region that links/focuses the relevant field.

**Explicit save.** `useForm` for surfaces where commitment matters: clear **Save**/**Cancel**, dirty-state tracking (honouring per-field `isEqual`), disabled/pending behaviour that **prevents duplicate submits**, keyboard submission, server errors that preserve the complete draft, and a Cancel that restores the last committed value. A submission commits its own **immutable snapshot** as the new baseline, so an edit made while the save is in flight stays dirty and is never silently discarded; a reset or unmount cleanly abandons an in-flight submission.

**Autosave.** `useAutosaveField` for field-by-field editing: a **documented, deterministic trigger** (a restrained debounce and/or a valid blur), calm and visible `Unsaved`/`Saving`/`Saved`/`Couldn’t save` states (announced politely, no per-keystroke toast), stale responses that cannot overwrite newer edits, overlapping saves that are **sequenced/coalesced to the latest** value, failed saves that keep the user's latest input with an explicit **Retry**, and no save while invalid. The user can always predict when a value is committed.

**Navigation safety.** While an explicit form is dirty, both in-app navigation (via `UnsavedChangesGuard` → an accessible modal confirm) and full-page unload (the browser prompt) are intercepted, so a draft is never silently discarded. Because a DS-03 [Drawer](#shared-drawer-ds-03) close/replace is a same-pathname, `drawer`-search-param navigation, a form hosted in a drawer passes its `drawerKey`: the guard then blocks any navigation that removes that drawer level (close, Escape, Back, `closeDrawer`, `replaceDrawer`, param removal, replacing the top record) while allowing harmless changes (a deeper drawer pushed on top, an unrelated filter). The confirm is a real modal: `inert` background, Tab/Shift+Tab trapped, initial focus on Stay, Escape chooses Stay, focus restored to the initiating control on Stay.

**Markdown.** The Markdown control edits and stores **source** (ADR-006/ADR-015), previews only through the shared sanitising pipeline, and adds no parser or HTML sink of its own.

**Dates.** A date-only value is the literal ISO `YYYY-MM-DD` string, validated and compared as integers and **never routed through `Date`**, so it cannot shift by timezone. A datetime value is an ISO-8601 UTC instant; the control edits the UTC wall-clock explicitly (labelled). A zone-less wall-clock time is deliberately not a field type.

**Entity-link picker.** ONE entity-agnostic picker for creating and managing [FND-04 EntityLinks](../../AGENTS.md#95-entitylinks). It takes typed configuration (anchor entity, permitted target types, link-type descriptors, direction, single/multiple, an async workspace-scoped `searchTargets` loader, existing links, and `onLink`/`onUnlink` callbacks) and **never imports D1, bindings or repositories**. That client configuration is **presentation only**: the AUTHORITY is a server-supplied `EntityLinkPickerPolicy` enforced by `createLinkWithPolicy` in the server service ([`app/platform/entity-links`](../../app/platform/entity-links)), which validates the untrusted `targetId`/`linkType`/`direction` (allowed direction, permitted link type, allowed target entity type, no self-link, anchor/target accessible, single-selection limit) before delegating to the existing FND-04 repository (workspace scope + Activity actor stay server-side, reserved spine types refused) and returns a typed, safe outcome — never a raw repository error. No second relationship model, no migration. The picker excludes the anchor from its own results, prevents duplicate active links, de-duplicates, bounds result sizes, serialises its create/remove actions, handles deleted/stale/inaccessible targets calmly, keeps kernel identifiers while showing user-language labels, and never leaks an inaccessible entity's title. Its `searchTargets` contract lets [DS-08](../roadmap/ROADMAP_V2.md#-ds-08--shared-search) supply real search later without replacing the picker.

**Accessibility.** WCAG 2.2 AA: every field has an accessible name; errors and save-status changes are announced via live regions; all controls are keyboard-complete (including the combobox/listbox and tag add/remove); logical focus order and visible focus; first-invalid-field focus on failed submit; 44px touch targets; no colour-only state; disabled and read-only are semantically distinguishable.

**Responsive behaviour.** Controls are full-width and safe from 320px up (no horizontal overflow), usable at 200% zoom, and correct in light and dark; motion honours `prefers-reduced-motion`.

**Correct vs incorrect usage.**
- ✅ Compose shared controls + `useForm` (explicit) or `useAutosaveField` (autosave), passing validators and a persistence callback; declare the save mode explicitly; relate records with `EntityLinkPicker` wired to a loader/action over the picker service; validate again at the server boundary.
- ❌ Build a bespoke per-entity form or a one-off field control; infer the save mode; import D1/a repository into a shared control; render Markdown through a second parser or a new HTML sink; round-trip a calendar date through `Date`; convey required/invalid/saved state by colour alone; leak a raw server error to the user.

**Extension rules.** Add a field type or affordance to the **one** shared system (and document it here) only when an existing repository requirement makes it clearly necessary — never fork per module, never add a second control for a field type. Keep the public API small; do not export internal state-machine/timing/focus machinery. Real product forms arrive when a module adopts DS-06 (e.g. [NOTES-01](../roadmap/ROADMAP_V2.md#-notes-01--notes-module)); DS-06 ships the system plus a development fixture only. See [`SHARED_FORMS.md`](../development/SHARED_FORMS.md).

---

## Application Frame (PX-02)

The shared patterns above are composed by ONE application frame ([PX-02](../roadmap/ROADMAP_V2.md#-px-02--product-frame), [`app/shared/shell`](../../app/shared/shell)), accepted in [ADR-020](../decisions/ARCHITECTURE_DECISIONS.md#adr-020-the-application-frame-sidebar-shell-pane-collection-layout-and-entity-identity). It replaces FND-09's website-like top bar with a premium application silhouette and is the frame **every future module inherits** — it must feel like Linear/Craft/Raycast/Things, not a website. The frame implements the composition contract in [`PRODUCT_EXPERIENCE.md`](PRODUCT_EXPERIENCE.md) (which governs feel; this document governs each part's anatomy). It builds entirely on [DS-01 tokens](#design-tokens-ds-01), reuses DS-02…04/DS-07 unchanged, and adds **no runtime dependency**.

### The frame

```
┌──────────────┬───────────────────────────────────────────────┐
│  ◆ Workspace │  Pane Header (sticky): H1 · count · [view] [+] │
│              │  FilterBar (sticky, when a collection)         │
│  ⌘K Search   ├───────────────────────────────────────────────┤
│  ⌘ Command   │                                               │
│              │   pane content (the document scrolls)          │
│  ⬢ Areas     │                                               │
│  ◎ Goals     │                                               │
│  ▚ Projects  │                                               │
│  ⦿ Tasks     │                                               │
│  … (spacer)  │                                               │
│  (A) Owner ▾ │                                               │
└──────────────┴───────────────────────────────────────────────┘
sidebar: --dh-color-surface, --dh-shell-nav-width, icon+label rows,
active = accent-surface tint + semibold + aria-current (never colour alone).
Pane: --dh-color-bg. Grid: var(--dh-shell-nav-width) 1fr.
```

- **Layout.** `AppShell` is a grid `grid-template-columns: var(--dh-shell-nav-width) 1fr`. The **document** is the scroll container and the sidebar is `position: sticky` — this preserves the [DS-03 Drawer](#shared-drawer-ds-03)'s body-scroll-lock and `ScrollRestoration` (which act on the window) while sticky Pane Headers and FilterBars still pin to the viewport (ADR-020 §20.2). There is exactly one frame; no surface builds its own.
- **Landmarks.** The sidebar brand is the single `banner`; primary navigation is a labelled `navigation`; the pane is `main` (the skip-link target); the Pane Header is a plain container (not a second banner). Keyboard-complete, skip link preserved, focus never lost.

### Sidebar

**Purpose.** The one element that never changes between surfaces — product identity, global Search, the Command Palette affordance, primary navigation, and the user menu.
**Anatomy.** Brand (mark + workspace name) · Search entry (`/`) + Command Palette entry (`⌘K`) · primary navigation (icon + label rows, never text-only) · spacer · [User Menu](#user-menu-px-02). Built to absorb future **badge counts, favourites and workspaces** without a redesign.
**Behaviour.** Navigation is registry-driven (no central list); each row's icon is the module's [entity identity](#entity-identity-px-02) glyph, derived from the module's own `entityTypes` manifest. Active state is `aria-current` + weight + an accent-surface tint. The Search/Command entries are real, labelled, keyboard-reachable affordances; their surfaces are wired by DS-08/DS-09.
**Mobile.** Below `md` the rail collapses to an **animated overlay sheet** that reuses the DS-03 Drawer's focus-trap, background-inertness and scroll-lock machinery (no second focus-trap): slide-in + scrim, Escape/outside-click close, focus restored to the toggle, safe-area aware, no content jump.

### Pane Header

**Purpose.** The header that belongs to the current screen, not the frame.
**Anatomy.** Page title (a real heading, configurable level) · optional subtitle/count · optional view-switcher slot · one primary-action slot. Optionally an entity-identity glyph beside the title.
**Rules.** It **never** contains theme controls, an email address or logout (those live in the User Menu). Exactly one primary action per pane. It pins (sticky) when hosted by a [Collection Layout](#collection-layout-px-02).

### User Menu (PX-02)

**Purpose.** Keep settings furniture off the desk.
**Anatomy.** An avatar/initials trigger opening a small panel: name · email · the [theme control](#design-tokens-ds-01) · Settings · Sign out.
**Behaviour.** An accessible disclosure (not a modal): `aria-expanded`/`aria-haspopup`, Escape closes and restores focus to the trigger, outside-click closes. The theme control is the **existing** implementation, only relocated — the cookie, `data-theme` SSR mechanism and persistence are unchanged.

### Entity Identity (PX-02)

**Purpose.** One icon and one accent per entity type, recognisable at a glance everywhere (Foundations requirement).
**Anatomy.** [`app/shared/entity`](../../app/shared/entity) exposes a frozen `ENTITY_IDENTITY` map (`type → { label, pluralLabel, Icon, accentVar }`), `getEntityIdentity`, and an `EntityIcon` component; icons come from the in-house set in [`app/shared/icons`](../../app/shared/icons).

| Entity | Icon (idiom) | Accent token |
|---|---|---|
| Area | stacked layers | `--dh-entity-area-accent` |
| Goal | target | `--dh-entity-goal-accent` |
| Project | columns | `--dh-entity-project-accent` |
| Task | checked circle | `--dh-entity-task-accent` |
| Note | document | `--dh-entity-note-accent` |
| Meeting | people | `--dh-entity-meeting-accent` |
| Person | person | `--dh-entity-person-accent` |
| Asset | package | `--dh-entity-asset-accent` |
| Diary | open book | `--dh-entity-diary-accent` |
| Review | cycle | `--dh-entity-review-accent` |

**Rules.** Every accent has a light **and** dark value (parity + ≥3:1 contrast, both tested). Accents are used at **identity sites only** (icon, card edge, chip) — never as text colour ([PRODUCT_EXPERIENCE Part III §5](PRODUCT_EXPERIENCE.md)). Icons are decorative (`aria-hidden`); a text label always names the entity. Cards, Record Headers, the sidebar, empty states and (later) Search/Command Palette all consume this one map — never a hand-picked icon at a call site.

### Collection Layout (PX-02)

**Purpose.** The product's commonest screen — "a filtered collection of Cards with a Filter bar, opening records in a Drawer" — as a named, entity-agnostic scaffold. This is to screens what the [Record Layout](#shared-record-layout-ds-02) is to records.
**Anatomy.** [`app/shared/collection-layout`](../../app/shared/collection-layout) composes a [Pane Header](#pane-header) · a [FilterBar](#shared-filters-ds-07) slot · a content slot (a [Card](#shared-cards-ds-04) collection) · a selection/bulk slot · and built-in **Loading** ([Skeleton](#loading-states-px-02)), **Empty**, **Filtered-empty** and **Error** states.
**Behaviour.** State precedence is error → loading → filtered-empty → empty → children, so a surface can **never** render a blank region ([PRODUCT_EXPERIENCE Part IV §5](PRODUCT_EXPERIENCE.md)). The header + filter bar pin (sticky) while the content scrolls; the selection bar is bottom-anchored.
**Rules.** No business logic, no repositories, no entity assumptions — every collection surface (Today, Projects, Areas, Goals, Notes, People) is configuration. Filters bind to the URL via DS-07; cards open the DS-03 Drawer.

### Empty State (PX-02)

The [Empty States](#empty-states) pattern is realised by ONE `EmptyState` ([`app/shared/empty-state`](../../app/shared/empty-state)): icon (usually an entity glyph) · title · one-sentence body · primary/secondary actions · illustration slot. It replaces the previously-forked record/filter empty renderings; the *filtered-empty* variant is just this component with a "clear filters" recovery. Calm and centred in its content region — never full-screen theatre.

### Loading States (PX-02)

The [Loading](#loading) pattern gains a shared **Skeleton** system ([`app/shared/skeleton`](../../app/shared/skeleton)): a `Skeleton` primitive plus `CardSkeleton` (density-aware), `CollectionSkeleton` and `PaneSkeleton` that **mirror the final layout**. Skeletons are decorative (`aria-hidden`); the loading region owns `aria-busy`. The shimmer honours reduced motion — it collapses to a static tint with no information lost.

### Correct vs incorrect usage

- ✅ A new module ships: a registry-driven sidebar row (its entity icon derived from its manifest) + a `CollectionLayout` pane + `Card`s opening the Drawer + a URL-bound `FilterBar` + wired empty/loading/error slots — and **no new visual language**.
- ✅ Identity, theme and sign-out live in the User Menu; the Pane Header carries only the title, one primary action and view controls.
- ❌ A module page with its own header bar, its own shell/provider, a bespoke empty/loading state, or a hand-picked icon instead of the entity-identity map.
- ❌ Theme controls, an email address or logout in a Pane Header; a second focus-trap for the mobile nav; an internal pane scroll that breaks the Drawer's scroll contract.

---

## Responsive behaviour

DalyHub is one product across a wide desktop workspace and a phone. Same model, same vocabulary, adapted layout.

- **Desktop-first, mobile-complete.** The dense, keyboard-driven experience is the design centre; mobile is a first-class adaptation, not an afterthought. Every module's roadmap includes an explicit **Mobile** item (see [`ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md)).
- **The Drawer adapts.** On desktop the [Drawer](#drawer) is a side sheet; on mobile it becomes a full-height sheet. The [Record Layout](#record-header) inside is identical.
- **Navigation collapses predictably.** Multi-pane on desktop → stacked/tabbed on mobile, with state preserved across the transition.
- **Touch targets & gestures.** Minimum 44px targets on touch; swipe maps to the same [Quick Actions](#quick-actions) available by keyboard on desktop. No action is touch-only or keyboard-only.
- **Breakpoints are tokens**, defined once and shared.

---

## Motion & feedback timing

- **Fast and few.** Transitions ~120–200ms, easing that feels natural. Motion shows causality (this became that, this came from there), never decoration.
- **Reduced motion.** Under `prefers-reduced-motion`, transitions become instant/opacity-only. Meaning is never carried by motion alone.
- **Perceived performance.** Optimistic updates + skeletons keep the product feeling instant even when the network isn't (see [performance budgets](../../AGENTS.md#16-performance-expectations)).

---

## Accessibility

Accessibility is a **requirement** of every pattern above, not a separate track. Target **WCAG 2.2 AA** (see [`AGENTS.md §15`](../../AGENTS.md#15-accessibility-requirements)).

- **Keyboard-complete & focus-visible.** Every pattern is fully operable by keyboard with a visible focus ring and logical order. The [Command Palette](#command-palette) and [Drawer](#drawer) manage focus correctly (trap within modal, restore on close).
- **Semantics first.** Native elements and roles before ARIA. Every control has an accessible name; icon-only actions are labelled.
- **Contrast & non-colour cues.** All token pairs meet AA; state is never conveyed by colour alone (pair with icon/text).
- **Announce change.** [Success](#success-feedback)/[Error](#error-feedback) feedback and async [Loading](#loading) completion use live regions.
- **Respect the user.** Honour reduced-motion, colour-scheme, and text scaling; layouts reflow without loss to 200% zoom.

Accessibility acceptance is part of the [Definition of Done](../../AGENTS.md#18-definition-of-done) for any UI work.

---

## Using this system

1. **Composing a new screen?** Assemble it from the patterns above. Most screens are: a filtered collection of [Cards](#cards) with a [Filter](#filters) bar, opening records in a [Drawer](#drawer) that uses the [Record Layout](#record-header).
2. **Need something not here?** Build it *as shared*, put it in the right kernel/shared location, and document it in this file in the same PR.
3. **Tempted to make a one-off?** Don't. Log the need, extend the shared pattern, and keep the product coherent.

## Related documents

- [`PRODUCT_EXPERIENCE.md`](PRODUCT_EXPERIENCE.md) — the product-wide experience contract these patterns compose into (screen shapes, hierarchy rules, keyboard vocabulary, reference layouts).
- [`PRODUCT_PRINCIPLES.md`](../product/PRODUCT_PRINCIPLES.md) — why these patterns feel the way they do.
- [`ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md) — the Shared Design System and each shared pattern are early roadmap items.
- [`REFERENCE_PRODUCTS.md`](../reference/REFERENCE_PRODUCTS.md) — products whose interaction patterns inform these.
- [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) — where today's UI diverges from this system.
- [`AGENTS.md`](../../AGENTS.md) — the governing constitution.
