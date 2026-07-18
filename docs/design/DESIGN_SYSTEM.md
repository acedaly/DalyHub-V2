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

- [`PRODUCT_PRINCIPLES.md`](../product/PRODUCT_PRINCIPLES.md) — why these patterns feel the way they do.
- [`ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md) — the Shared Design System and each shared pattern are early roadmap items.
- [`REFERENCE_PRODUCTS.md`](../reference/REFERENCE_PRODUCTS.md) — products whose interaction patterns inform these.
- [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) — where today's UI diverges from this system.
- [`AGENTS.md`](../../AGENTS.md) — the governing constitution.
