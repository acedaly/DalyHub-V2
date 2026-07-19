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
- **Iconography.** One icon set, consistent weight and size. Icons support labels; they don't replace them.
- **Entity identity.** Each entity type (Area, Goal, Project, Task, Note, Meeting, Person, Asset, Diary) has a consistent icon and accent so it's recognisable at a glance anywhere it appears.

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
**Anatomy.** A unified search surface returning results grouped by entity type, with previews.
**Behaviour.** Fuzzy, incremental, keyboard-navigable. Scoped by [workspace](../../AGENTS.md#94-workspace-isolation). Results open in the [Drawer](#drawer). Local matches return under the [performance budget](../../AGENTS.md#16-performance-expectations).
**Rules.** Every module contributes results through the shared search provider interface (see [module registry](../../AGENTS.md#92-module-registry)) — search is not re-implemented per module.

### Command Palette
**Purpose.** The keyboard shell of the OS — do anything by typing (`⌘K`).
**Anatomy.** A modal command input: navigation, entity search, and executable commands (create task, start review, change theme) in one list.
**Behaviour.** Context-aware (offers commands relevant to the current record), fully keyboard-driven, fuzzy-matched, with recent/suggested actions.
**Rules.** Anything a user can do by clicking must be reachable here. Modules register their commands via the [module registry](../../AGENTS.md#92-module-registry). This is the backbone of the [keyboard-first](../../AGENTS.md#7-interaction-philosophy) product.

### Quick Actions
**Purpose.** The two or three most frequent actions on an entity, available without opening it.
**Anatomy.** Inline affordances on [Cards](#cards) and [Record Headers](#record-header) (complete, reschedule, link, assign) plus contextual keyboard shortcuts.
**Behaviour.** Optimistic and reversible (prefer [undo](#success-feedback) over confirm dialogs). Consistent iconography and shortcuts across modules.
**Rules.** Quick Actions are a curated few; the long tail lives in the overflow menu or [Command Palette](#command-palette).

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
