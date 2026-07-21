# PRODUCT_EXPERIENCE.md — The DalyHub Product Experience Contract

> The **visual and experiential contract** for DalyHub V2: how the whole product must feel, compose, and behave — above the level of any single component. Where [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) specifies each shared pattern, this document specifies **the product they add up to**.
>
> **Status.** Produced by the strategic Product Experience review of 2026-07-18, after FND-01…09, DS-01, DS-02, DS-03, DS-04 and DS-07 shipped. It is a *design contract and review record*, not an implementation: it changes no roadmap status and ships no production code. Its recommendations feed existing roadmap items (noted per item) or small, explicitly-flagged shell adjustments.
>
> **Rule.** When a later item builds a surface, it must satisfy this contract *and* the pattern specs in `DESIGN_SYSTEM.md`. If the two ever disagree, this document governs composition and feel; `DESIGN_SYSTEM.md` governs a component's own anatomy and API. Divergence found in either direction is fixed in the same PR that finds it.
>
> **Implementation (2026-07-19 — PX-02).** The "App frame alignment" work this review mandates is now **built** as [PX-02 — Product Frame](../roadmap/ROADMAP_V2.md#-px-02--product-frame), accepted in [ADR-020](../decisions/ARCHITECTURE_DECISIONS.md#adr-020-the-application-frame-sidebar-shell-pane-collection-layout-and-entity-identity), before TODAY-01. Implemented here: **#1** Sidebar application frame, **#2** Workspace content pane, **#3** Icon set + Entity Identity, **#4** Header chrome → User Menu, **#5** Shared Collection Layout, **#9** (shell part) animated mobile overlay navigation, **#11** Sticky collection headers, **#14** One shared EmptyState, **#15** Collection skeletons. The remaining ranked items stay as sequenced (the palette #6/#8, motion/contrast #19/#20, density #16, brand polish #18, selection bar #13 with its first consumer). The frame lives in [`app/shared/shell`](../../app/shared/shell), [`app/shared/entity`](../../app/shared/entity), [`app/shared/collection-layout`](../../app/shared/collection-layout), [`app/shared/empty-state`](../../app/shared/empty-state) and [`app/shared/skeleton`](../../app/shared/skeleton); its anatomy is documented in [`DESIGN_SYSTEM.md → Application Frame`](DESIGN_SYSTEM.md#application-frame-px-02). No DS-01…04/07 contract was broken.

> **Implementation (2026-07-19 — DS-09).** The Command Palette and the keyboard-vocabulary contract are now **built** as [DS-09 — Command Palette & Quick Actions](../roadmap/ROADMAP_V2.md#-ds-09--command-palette--quick-actions), accepted in [ADR-024](../decisions/ARCHITECTURE_DECISIONS.md#adr-024-command-palette--quick-actions--command-kinds-trusted-catalogue-authenticated-execution-and-one-shared-action). Implemented here: **#6** Command Palette (the `⌘K` keyboard shell — [`app/shared/commands`](../../app/shared/commands), lazy-loaded, merging contextual actions + registered commands + DS-08 Search) and **#7** the global keyboard vocabulary as a contract (reserved `Mod+K`/`/`/… enforced by one shared dispatcher; the kernel refuses reassignment of a reserved shortcut). Quick Actions are realised as ONE shared `AppAction` projected onto Cards, Record Headers, the palette and the keyboard. The normative wireframe in Part V and the interaction-state "keyboard shortcuts" rule below are satisfied: every action is reachable by keyboard, and any new overlay reuses the Drawer's focus machinery (no second focus-trap). Remaining ranked items stay as sequenced (motion/contrast #19/#20, density #16, brand polish #18, selection bar #13, Inspector #8 with DS-10).

---

## Part I — Executive UX review (2026-07-18)

### What was reviewed

The full built surface, as code and running behaviour, not intentions: the token system (`app/styles/tokens.css`, `base.css`), the authenticated shell (`app/shared/shell`, `shell.css`), the Record Layout (`app/shared/record-layout`), the Drawer (`app/shared/drawer`), Cards (`app/shared/card`), Filters (`app/shared/filters`), the home route, the four module placeholders, and the three development fixtures — against the documented intent in `AGENTS.md`, `PRODUCT_PRINCIPLES.md`, `DESIGN_SYSTEM.md`, `ARCHITECTURE_OVERVIEW.md` and the ADRs, and against the target quality bar (Linear, Raycast, Craft, Things, Superhuman, Arc, modern Apple applications).

### The verdict in one paragraph

DalyHub's **component layer is already premium-grade** — the token system, Drawer, Card, Record Layout and Filters are better engineered than what most shipping products have: semantic light/dark tokens with tested contrast parity, a URL-pure stackable drawer, container-query record scaffolds, an accessible keyboard-equivalent reorder, and a filter URL contract that composes with the drawer's. This discipline is rare and is the product's biggest asset. **The assembled product, however, does not yet feel like a premium application — it feels like a well-made website hosting excellent components.** The gap is not craft; it is *architecture of the frame*: a horizontal top-bar navigation instead of an app sidebar, settings chrome (theme switcher, raw email) permanently in the header, a centred document column instead of a workspace pane, no icon or entity-identity system, and no named scaffold for the product's most common screen (a filtered collection). Every one of these is cheapest to fix **now**, before TODAY-01 pours the first product concrete into the current frame.

**"Does this already feel like a premium application?" — Not yet.** It feels like the *engine room* of one. The specific reasons, and the ordered fixes, follow.

### Scores

| Dimension | Score | Rationale |
|---|---:|---|
| **Overall product experience** | **6 / 10** | Foundations ~9; the assembled shell/product surface ~4. A premium *product* needs the frame to match the components. |
| **Consistency** | **9 / 10** | One token system, one card, one drawer, one filter language, enforced by tests and import boundaries. The 1-point gap: the shell itself (header nav, theme control) uses one-off patterns no other surface shares, and no icon/entity-identity system exists yet. |
| **Accessibility** | **9 / 10** | WCAG 2.2 AA is engineered in, not bolted on: tested contrast in both themes, real focus management, inert backgrounds, reduced-motion, 44px touch targets, no colour-only state, and (DS-10) a live-region feedback system announcing success/error/undo/background-operation results. Remaining: no `prefers-contrast` handling, and the mobile nav toggle's focus containment. |
| **Information density** | **5 / 10** | The 15px dense type ramp, compact density mode and metadata patterns are *ready* for density, but no dense surface exists; meanwhile the shell spends vertical space (56px header + up-to-48px page padding) and centres content in a narrow column. Density is designed, not yet delivered. |
| **Mobile readiness** | **7 / 10** | Components are exemplary at 320px (wrapping, touch targets, full-sheet drawer, safe-area insets). Today is now touch-complete with **swipe quick actions** (TODAY-06, [ADR-032](../decisions/ARCHITECTURE_DECISIONS.md#adr-032-mobile-today--touch-swipe-quick-actions-as-an-additive-shared-card-accelerator-and-the-touch-target-corrections)) — a shared, reusable DS-04 Card capability every module's Mobile item can adopt. Still open shell-wide: a bottom navigation is deliberately deferred, and the collapsed nav sheet is now animated (PX-02) but a symmetric drawer exit remains. |

### Why it doesn't yet feel premium — the five structural causes

1. **The frame is a website, not an application.** Premium tools (Linear, Things, Craft, Slack, Arc's sidebar mode, Apple apps) share one silhouette: a **persistent left sidebar** owning navigation and identity, and a **full-height content pane** with its own header and scroll. DalyHub renders a wrapping top-bar header (`.app-header`) with inline nav links, and a centred `max-width: 72rem` document below it. Top-bar navigation cannot scale to the eleven modules the roadmap ships (Today, Projects, Areas, Goals, Notes, Meetings, People, Assets, Diary, Review, Settings) — it will wrap into a second row and read as a nav menu, not an OS. Tellingly, DS-01 already defines `--dh-shell-nav-width: 15rem` — a sidebar width token that nothing uses. The intended architecture exists in the tokens; the shell doesn't realise it.
2. **Chrome that should be furniture is on the desk.** The three-button Light/Dark/System fieldset and the owner's raw email address sit permanently in the header of every screen. Premium applications put identity behind an avatar menu and theme behind Settings/the Command Palette. Permanent settings chrome signals "demo scaffold", and it spends the most valuable pixels in the product on the least-used controls.
3. **No iconography or entity identity.** `DESIGN_SYSTEM.md → Foundations` requires one icon set and a consistent icon + accent per entity type, "recognisable at a glance anywhere it appears". Nothing implements this: the shell is text-only ("Menu"), cards and record headers have icon *slots* with nothing standard to put in them, and no entity accent tokens exist. Without it, every list is a wall of same-coloured text — scanning cost stays high and the product reads as unfinished.
4. **The workspace is a document.** `.app-main` centres content and pads it with `clamp(24px, 5vw, 48px)`. That is correct for prose and exactly wrong for an execution workspace: Today and Projects want a **left-aligned pane** whose header (title, view controls, filter bar) can pin while the collection scrolls beneath it. Centred columns also waste the wide-desktop case the product calls its design centre.
5. **The commonest screen has no pattern.** `DESIGN_SYSTEM.md → Using this system` says most screens are "a filtered collection of Cards with a Filter bar, opening records in a Drawer". That composition — page header, view switcher, filter bar, collection, empty/loading states, selection — is not itself a shared pattern. If TODAY-01 builds it ad hoc, PROJ-01/AREA-01/NOTES-03 will each rebuild it slightly differently, and the product will fragment at the screen level while staying consistent at the component level.

### What must NOT change

The review explicitly endorses, and this contract protects: the semantic token system and its naming/parity/contrast test regime; the URL-driven drawer stack and its history/provenance model; the single entity-agnostic Card, Record Layout and Filter system; the filter/drawer URL composition; the no-dependency, platform-first implementation approach; and the accessibility baseline. **None of DS-01…04/07's public contracts need breaking changes.** Every recommendation below is additive or shell-level.

---

### Top 20 improvements, ranked by impact

Legend — **Difficulty:** S (hours) / M (days) / L (its own roadmap item). **When:** *Pre-launch* = before or with TODAY-01 unless stated; *Post-launch* = after first product modules ship. Items marked ⚠ touch a completed item and carry the required why/impact/migration/benefit justification.

| # | Improvement | Difficulty | When |
|---|---|---|---|
| 1 | ⚠ Sidebar application frame | M | Pre-launch, **before TODAY-01** |
| 2 | ⚠ Workspace content pane (replace centred document column) | S–M | Pre-launch, with #1 |
| 3 | Icon set + entity identity (icon + accent per entity type) | M | Pre-launch, before TODAY-01 |
| 4 | ⚠ Collapse header chrome into a user menu; relocate theme | S | Pre-launch, with #1 |
| 5 | Shared Collection Layout pattern | M | Pre-launch, before TODAY-01 |
| 6 | Pull DS-09 (Command Palette) earlier in sequence | L (sequencing only) | Pre-launch decision now |
| 7 | Global keyboard vocabulary defined as a contract | S (doc) | Pre-launch, now |
| 8 | Feedback layer (toast + undo) dependency flagged for first mutation | L (DS-10 subset) | Pre-launch, with TODAY-01 |
| 9 | Mobile navigation done properly (animated sheet/overlay; later tab bar) | M | Pre-launch shell part; tab bar post-launch |
| 10 | Drawer exit transition | S | Pre-launch |
| 11 | Sticky collection headers (page header + filter bar pin on scroll) | S | Pre-launch, part of #5 |
| 12 | Card hover treatment tuned per presentation (calm list hover) | S | Pre-launch |
| 13 | Selection model + bulk-action bar pattern | M | With first multi-select consumer (TODAY-01/PROJ-01) |
| 14 | One shared EmptyState component (unify record/filter empty states) | S | Pre-launch |
| 15 | Skeleton coverage for collection pages | S | With #5 |
| 16 | App-level density preference (comfortable/compact) | S–M | Post-launch (SET-01), contract defined now |
| 17 | Surface-elevation usage rules codified (bg/surface/raised/sunken) | S (doc, in this file) | Done here — enforce in review |
| 18 | Brand mark + favicon + wordmark treatment | S | Pre-launch polish |
| 19 | `prefers-contrast` / forced-colors audit | M | Post-launch (DS-11) |
| 20 | Motion audit pass (shared enter/exit choreography, view transitions) | M | Post-launch (DS-11 or dedicated polish item) |

#### 1. ⚠ Sidebar application frame — the single highest-impact change

- **Why.** Eleven modules cannot live in a wrapping top bar; every reference product uses a persistent left sidebar because it scales, keeps orientation stable, gives navigation a permanent home for state (active module, counts, workspace identity), and makes the product read as an application. DalyHub's own tokens (`--dh-shell-nav-width: 15rem`) and the `DESIGN_SYSTEM.md` responsive rule ("multi-pane on desktop → stacked on mobile") already assume it. The task-level review question — "evaluate how the Sidebar, Header, Record Layout, Drawer, Cards and Filters work together" — cannot currently be answered, because there is no sidebar.
- **What.** A fixed-width (`--dh-shell-nav-width`) left sidebar: workspace/brand at top, primary navigation as icon+label rows, Search and the Command Palette entry above the nav, user menu pinned at the bottom. Collapsible to an icon rail (post-launch nicety). The header row shrinks to a **pane header** owned by each surface (see #2). Layout: `grid-template-columns: var(--dh-shell-nav-width) 1fr`.
- **Impact & migration cost.** Low *now*: the shell is one component tree (`AppShell`, `PrimaryNavigation`, ~200 lines of CSS) with placeholder-only consumers; no product module, test-critical selector or URL depends on top-bar navigation. The FND-09 acceptance properties (registry-driven nav, skip link, aria-current, keyboard-complete, theme mechanism) all carry over unchanged — this is a re-arrangement of the same semantic parts, not a rebuild. Migration cost grows with every module shipped into the current frame; after TODAY-01 it means re-verifying every surface. **Do it first.**
- **Long-term benefit.** Every subsequent module gets a correct home for free; navigation stops being a per-launch redesign risk; the product's silhouette matches its ambition from the first real feature.

#### 2. ⚠ Workspace content pane

- **Why.** `.app-main`'s centred `max-width` + generous clamp padding styles the workspace as an article. Execution surfaces need a full-height, left-aligned pane with its own scroll container so headers and filter bars can pin (see #11) and wide desktops are used, not margined away.
- **What.** The main pane becomes `overflow-y: auto; height: 100dvh` (grid row), default horizontal padding `var(--dh-gutter)`, **no** max-width at the pane level. Width constraint moves *into* content types where it belongs: prose/records keep `--dh-width-prose`/`--dh-width-content` on their own containers (Record Layout already carries `max-width: var(--dh-width-content)` itself — proof the pane doesn't need to).
- **Impact/migration/benefit.** CSS-level change (`shell.css`, `base.css .page` stays for genuine document pages like error pages). Nothing consuming the pane exists yet. Benefit: the difference between "reading about your tasks" and "working in your tasks".

#### 3. Icon set + entity identity

- **Why.** Required by the design system's Foundations, implemented nowhere; icon slots exist across Card, Record Layout and (future) sidebar with nothing consistent to fill them. Scanning a mixed list (a Person next to a Task next to a Note) currently depends entirely on reading uppercase type labels.
- **What.** Adopt ONE outline icon set (per `OPEN_SOURCE_POLICY.md` — e.g. Lucide, ISC, tree-shakeable; evaluated through the checklist) at a fixed 16px/1.5px-stroke default. Define the entity identity map once as tokens: `--dh-entity-<type>-accent` (+ surface tint), one icon per entity type, consumed by Card `icon`/`accent`, Record Header, sidebar, future Search results and Command Palette. Document the map in `DESIGN_SYSTEM.md → Foundations` in the same PR.
- **Difficulty/When.** M; before TODAY-01 so the first product surface ships with identity. **Benefit:** at-a-glance recognisability everywhere, forever; the single cheapest "feels designed" upgrade available.

#### 4. ⚠ Header chrome → user menu

- **Why.** Theme fieldset + raw email + logout on every screen is settings furniture in primary chrome (§ cause 2 above).
- **What.** One avatar/initials button (sidebar bottom, per #1) opening a small menu: identity (email), Theme (submenu or link to Settings), Sign out. The theme *mechanism* (cookie, `data-theme`, flash-free SSR) is untouched — only the control's placement moves; the control itself stays the accessible fieldset inside the menu/Settings. Also replace the literal "Menu" text toggle with the standard icon+label affordance once #3 lands.
- **Impact/migration/benefit.** S. No behavioural contracts change; FND-09 tests that assert presence of theme control/user identity re-point to the menu. Benefit: calm, product-grade chrome; header pixels returned to the work.

#### 5. Shared Collection Layout pattern

- **Why.** The product's most common screen has no named scaffold (§ cause 5). This is the same argument that produced DS-02 for records — screens deserve it too.
- **What.** A shared, entity-agnostic `CollectionLayout`: pane header (title, count, optional view switcher list/board/grid, primary action) · FilterBar slot · content region (CardCollection / ReorderableCardCollection) · built-in loading (skeleton cards), empty and filtered-empty (FilterEmptyState) states · optional selection bar slot (#13). Sticky header behaviour (#11) lives here. Document in `DESIGN_SYSTEM.md` as its own pattern; build it as the first piece of TODAY-01 **or** as a small dedicated DS item — either way it exists *before* three modules need it.
- **Difficulty/When/Benefit.** M; pre-launch. Benefit: screen-level consistency at the same guarantee level as component consistency; TODAY/PROJ/AREA/NOTES/PEOPLE collection views become configuration.

#### 6. Command Palette earlier

- **Why.** `AGENTS.md §3` calls the palette "the shell" of the OS and §7 makes keyboard-first a core philosophy — yet DS-09 sits behind DS-08, DS-06 and DS-05 in numbering, and TODAY-05 (keyboard workflow) lands well after TODAY-01. The risk: the first months of real product use establish mouse-first habits, and early modules ship commands nowhere.
- **What.** A sequencing recommendation only (roadmap status untouched): treat DS-08 + DS-09 as the next Design System priority after DS-05/DS-06's hard dependencies are met, and require every module item from TODAY-01 onward to register its commands in its manifest *from day one* (the FND-06 seam already exists) so the palette lights up retroactively for free.
- **Difficulty/When/Benefit.** Sequencing decision, made now. Benefit: the keyboard-first identity is real from the first module, not a retrofit.

#### 7. Global keyboard vocabulary as a contract

- **Why.** Shortcuts are a product-wide language; if each module invents its own, collisions and relearning follow — the exact fragmentation the design system exists to prevent.
- **What.** Reserve now, in this contract (see Part IV): `⌘K` palette · `/` focus search · `g` then `t/p/a/g/n/…` go-to-module chords · `j/k` or `↑/↓` list movement · `x` toggle select · `Enter`/`o` open · `e` primary quick action · `Esc` close/clear · `?` shortcut overlay · `[` toggle sidebar. Modules may add, never reassign.
- **Difficulty/When/Benefit.** S (this document), enforced in review. Benefit: DS-09 and TODAY-05 implement a settled language instead of negotiating one.

#### 8. Feedback layer needed at first mutation — ✅ built (DS-10)

- **Why.** The design system mandates optimistic + undoable mutations with announced feedback (Success/Error Feedback patterns), but the toast/undo layer is inside DS-10, sequenced after DS-06 — while TODAY-01/02 (task completion, reorder) will mutate real data first. Without it, the first real interactions ship silent or with ad-hoc feedback — instant product debt.
- **What.** A dependency flag, not a redesign: the minimal feedback slice (polite live-region toast, undo affordance, error banner) must exist by TODAY-02's first mutation — either by pulling that slice forward out of DS-10 or by adding it to TODAY-01's acceptance.
- **Implementation (2026-07-20 — DS-10).** Built as the [Feedback platform](../../app/shared/feedback) ([ADR-025](../decisions/ARCHITECTURE_DECISIONS.md#adr-025-the-global-interaction-layer--feedback-platform-notifications-undo-background-operations-and-the-shared-inspector)): the hidden `useFeedback()` API (`notifySuccess/…`, `notifyUndo`, `runOperation`), calm coalescing notifications with ARIA live-region announcements, platform **Undo** (reverse + commit-on-dismiss), and one background-operation lifecycle. TODAY-02's first mutation now has trustworthy, announced, reversible feedback available with zero per-module work. The shared **Inspector** (#8-Inspector) also lands here.
- **Difficulty/When/Benefit.** L but a thin slice; pre-launch. Benefit: trust ("it saved, and I can take it back") from the first real action.

#### 9. Mobile navigation done properly

- **Why.** The current collapse is `display:none` → block, pushing page content down with no transition, no scrim, no focus containment — the only sub-AA-polish interaction in the product. Mobile is "a first-class adaptation, not an afterthought".
- **What.** Pre-launch (with #1): the sidebar becomes an overlay sheet on `< md` — slide-in + scrim + inert background + focus containment, i.e. exactly the Drawer's existing machinery pointed at navigation. Post-launch (TODAY-06/DS-11): evaluate a bottom tab bar for the 4–5 primary modules.
- **Difficulty/When/Benefit.** M / split as noted. Benefit: mobile stops feeling like a responsive fallback.

#### 10. Drawer exit transition

- **Why.** The Drawer animates in (`drawer-slide-in`, 180ms emphasized) but unmounts instantly on close — an asymmetry premium products don't have; motion should show causality in both directions.
- **What.** A ~`--dh-duration-fast` exit (slide + scrim fade via `--dh-ease-exit`) before unmount; instant under reduced-motion as today. No API change.
- **Difficulty/When/Benefit.** S; pre-launch. Benefit: the workhorse interaction of the whole product feels finished.

#### 11. Sticky collection headers

- **Why.** In long lists the title, view switcher and active filters are orientation; scrolling them away costs place-keeping (the product's "never lose the user's place" rule applied *within* a screen).
- **What.** Inside CollectionLayout (#5): pane header and FilterBar `position: sticky; top: 0` on `--dh-color-bg` with a divider on scrolled state. Needs #2's per-pane scroll container.
- **S; with #5.**

#### 12. Calmer list-card hover

- **Why.** Cards hover to `--dh-shadow-md` + strong border in all presentations. In a dense list of 40 tasks, per-row shadow lift reads busy — Linear/Things hover dense rows with a background tint only; shadow implies "liftable object", which is right for board/grid, wrong for list rows.
- **What.** In `presentation="list"`: hover = `--dh-color-hover-surface` background + border-strong, **no shadow change**; board/grid keep the lift. One CSS refinement inside the existing component; no API change.
- **S; pre-launch.**

#### 13. Selection + bulk-action bar pattern

- **Why.** Card selection exists but nothing defines what selection *summons*. Without a pattern, the first bulk UI will be bespoke.
- **What.** Define now (Part IV), build with first consumer: selecting ≥1 card raises a bottom-anchored action bar (count · curated bulk actions · clear) — the mobile-friendly, Inspector-compatible convention. `Esc` clears selection before it closes anything else.
- **M; with TODAY-01/PROJ-01.**

#### 14. One shared EmptyState

- **Why.** Two empty-state renderings exist (RecordContent's `emptySlot`, Filters' `FilterEmptyState`) with similar but unshared structure; future modules need a third (first-run teach state). Three near-twins is debt-by-drift.
- **What.** One `EmptyState` component (icon slot · heading · one-sentence body · optional primary action) consumed by all three cases; `FilterEmptyState` becomes a configuration of it.
- **S; pre-launch.**

#### 15. Skeleton coverage for collections

- **Why.** DS-02 has record skeletons; collections have none, and collections are what loads most often. The Loading pattern demands "skeletons that mirror the final layout".
- **What.** A card-shaped skeleton (density-aware) inside CollectionLayout's loading state; shimmer inherits the existing reduced-motion behaviour.
- **S; with #5.**

#### 16. App-level density preference

- **Why.** Density is per-`Card`-prop today; a power user should set it once, product-wide ("density with air" is a user calibration, not a per-list toggle).
- **What.** Contract now: one workspace-level `density` preference (comfortable default) that CollectionLayout passes down; a Settings control at SET-01. No new component work.
- **S–M; post-launch (SET-01).**

#### 17. Surface-elevation usage rules

- **Why.** Four surface tokens exist with no usage doctrine; the shell already uses `surface` for the header while cards use `surface-raised` — defensible, but undocumented rules drift.
- **What.** Codified in Part III of this document (done). Enforced in review henceforth.

#### 18. Brand mark

- **Why.** The product's identity is currently the string "DalyHub". A mark (even a simple glyph in the accent colour) anchors the sidebar, the favicon, and the empty states.
- **S; pre-launch polish.**

#### 19. `prefers-contrast` & forced-colors

- **Why.** AA is met; `prefers-contrast: more` and Windows High Contrast (`forced-colors`) are unhandled — borders that are tints and the focus ring's offset deserve an audit.
- **M; DS-11 (post-launch).**

#### 20. Motion choreography pass

- **Why.** Tokens are right (120/180/240ms, three easings) and individually applied, but there is no *system* of enter/exit choreography (what fades vs slides, stagger rules, shared-axis transitions between sibling views). Premium feel is largely this.
- **What.** A DS-11-adjacent audit defining: list item enter (fast fade+2px rise), view-to-view (shared-axis fade-through), drawer (in/out symmetric), palette (fast scale-fade). Never decorative; reduced-motion collapses all.
- **M; post-launch.**

---

## Part II — Philosophies

These are the product-wide stances every surface inherits. They compress the review's conclusions into rules an implementer can apply without re-deriving them.

### Product philosophy

One product, many lenses. A module is a *view over the shared model*, never an app-within-an-app. The user should never think "I'm in a different module" — the frame (sidebar, pane, drawer), the vocabulary (Areas/Goals/Projects/Tasks/People…), the components (Card, Record Layout, Filters) and the shortcuts are identical everywhere; only the data changes. Calm is enforced structurally: no badge may demand attention (counts inform, never nag), no red except genuine danger, no celebration animations, no streaks. The design system's job is to disappear behind the work.

### Navigation philosophy

- **The sidebar is home.** One persistent left sidebar owns: product identity, global Search, the Command Palette affordance, primary navigation (one row per module: icon + label + optional quiet count), and the user menu. It is the only element that never changes between surfaces.
- **Two ways everywhere, always:** every navigation has a pointer path (sidebar/links) and a keyboard path (palette, `g` chords). Neither is secondary.
- **Records open in place.** The Drawer is the default record view from any collection; full-page record routes exist only where depth genuinely needs the whole viewport (long-form Notes). Back always works; the URL always reproduces the view (drawer stack, filters, tab — already contractual in DS-03/DS-07).
- **Orientation is never spent.** The active module is always visible in the sidebar; the current record's ancestry is always visible in its breadcrumb; sticky pane headers keep the current view named while scrolling.
- **Mobile collapses predictably:** sidebar → overlay sheet (same drawer machinery); pane → full width; drawer → full sheet. Same order, same names, same state.

### Layout philosophy

- **Frame:** `sidebar (15rem) | content pane` on desktop; the pane is full-height with its own scroll. There is exactly one app frame; no surface builds its own.
- **The pane is a workspace, not a page.** Left-aligned, full-width by default. Width limits belong to content types: prose reads at `--dh-width-prose`, record scaffolds at `--dh-width-content`, collections use available width.
- **Vertical rhythm** comes from the 4px scale: within a group `space-1..3`, between groups `space-4..6`, between regions `space-8+`. Never invent an in-between value; if a gap feels wrong, the grouping is wrong.
- **Chrome budget:** persistent chrome (sidebar + pane header) must never exceed what one more visible task-row would justify. Anything used less than daily lives behind the user menu, Settings or the palette.

### Card philosophy

The Card is *the unit of glanceability*: identity (entity icon + accent) → title → one line of context → optional progress/date → curated actions on demand. It is never a miniature record page; if a card needs a fourth metadata row, that information belongs in the Drawer. One Card, configured — per-module cards remain forbidden (DS-04). List presentation is a calm row (background-tint hover); board/grid are liftable objects (shadow hover). Density is a workspace preference, not a per-surface improvisation.

### Filter philosophy

Filtering is a *language*, not a widget: the same fields → operators → values grammar, the same chips, the same URL encoding (`fv`/`f`/`fmode`) on every collection, forever (DS-07). Filters are always URL-real (shareable, restorable, Back/Forward-correct) and always composable with the drawer stack. Saved views are the memory of the language — they must degrade gracefully as fields evolve. A filtered-empty result is never a dead end: the recovery (clear filters) is part of the pattern itself.

### Motion philosophy

Motion exists to show **causality and continuity** — where a thing came from, where it went — never to decorate. The whole product uses three durations (`fast` 120ms for hover/small state, `base` 180ms for overlays and panes, `slow` 240ms only for large spatial moves) and three easings; entering uses `standard`/`emphasized`, leaving uses `exit`. Everything that animates in animates out. Nothing meaningful is *only* animated: reduced-motion collapses every duration to instant with zero information loss (already enforced globally). No parallax, no springs for their own sake, no confetti — ever.

### Responsive philosophy

Desktop-dense is the design centre; mobile is a first-class *re-composition*, not a shrink. Components adapt to their **container** (container queries — DS-02 set the precedent), surfaces adapt to the **viewport** (sidebar/sheet/tab decisions). Nothing is hover-only or keyboard-only or touch-only; 44px targets on touch; safe-area insets respected; 320px is the hard floor with no horizontal document scroll, verified by test as today. Swipe gestures, when they arrive, map to existing Quick Actions — never to unique functionality.

### Accessibility philosophy

Accessibility *is* the quality bar, not a compliance pass: semantic elements first, ARIA to fill gaps; every control named; every state carried by text or icon as well as colour; focus visible, trapped only in modals, and always restored; changes announced politely via the (to-be-shared) live-region layer; contrast tested in both themes as part of CI (already true). A pattern that cannot be made accessible is the wrong pattern — redesign it, don't waive it.

---

## Part III — Visual hierarchy rules

1. **Surfaces (elevation doctrine).**
   - `--dh-color-bg` — the pane and the page. The default ground everything sits on.
   - `--dh-color-surface` — grouped/secondary regions *within* the ground: sidebar, summary panels, pane headers, code blocks, pill backgrounds.
   - `--dh-color-surface-raised` — things that sit *above* the ground and could be picked up or opened: cards, drawers, popovers, menus. Raised implies interactive containment; never use it for static grouping.
   - `--dh-color-surface-sunken` — things *inset into* the ground: progress tracks, wells, badge backgrounds.
   - Shadows follow the same logic: `sm` resting cards, `md` hover/popovers, `lg` drawers/modals. A static region never carries a shadow.
2. **Type carries hierarchy; colour carries meaning.** Hierarchy = size + weight + spacing (`2xl` bold page/record ambit → `xl` record titles → `md`/`base` semibold item titles → `sm` secondary → `xs`/`2xs` metadata and uppercase labels). Colour is reserved for status tones, entity accents, links and feedback — never for making text "look designed".
3. **One primary action per view region.** The accent fill appears at most once per pane and once per drawer (the primary action). Everything else is secondary/ghost. Two accent buttons visible in one region is a design error.
4. **Text tiers are three:** `text` (what it is), `text-secondary` (about it), `text-muted` (around it — labels, counts, timestamps). A fourth grey is forbidden; if three tiers can't express it, restructure.
5. **Accent discipline.** The accent colour means "interactive or current" (links, active nav, focus, primary action, progress). It is never a background wash, never decoration. Entity accents (#3) are used at identity sites only (icon, card edge, chip) — not as text colour.
6. **Borders before shadows, tints before borders.** Prefer the quietest sufficient separator: whitespace → divider → border → shadow. Density with air comes from ruthless separator minimalism, not from more boxes.
7. **Uppercase `2xs/xs` + `letter-spacing-wider` is the *only* label treatment** (record type, card type, summary `dt`). It must never be used for content.
8. **Numbers are tabular** (`font-variant-numeric: tabular-nums`) wherever they align vertically (progress, counts, dates in lists) — already the Card convention; now the rule.

---

## Part IV — Component composition rules

How the shared parts assemble into screens. (Component-internal anatomy stays in `DESIGN_SYSTEM.md`.)

1. **Every screen is one of three shapes.** (a) **Collection** — CollectionLayout: pane header · FilterBar · Card collection · states; (b) **Record** — Record Layout, in the Drawer by default or full-page where warranted; (c) **Document** — prose page (Settings sections, long-form Note editing). If a proposed screen fits none, that is a design-review conversation, not a new bespoke layout.
2. **The frame composes exactly once.** `AppShell` (sidebar + pane) mounts one `DrawerProvider` wrapping the pane. Modules render *inside* the pane; they never render their own shell, provider, scrim or z-index layer.
3. **Cards open drawers; drawers host Record Layouts; record layouts stack drawers.** The canonical chain: `Card href/onOpen → drawer key → renderDrawer → RecordLayout → DrawerTrigger (related record) → stacked drawer`. No link in this chain may be re-implemented locally.
4. **Filters bind to the URL or don't exist.** Any filterable collection uses `useFilterUrlState` + `FilterBar` + the pure evaluator (or its server translation). Module-local filter state is prohibited.
5. **State slots are mandatory.** Every collection and record surface wires loading (skeleton), empty (EmptyState with a next action), filtered-empty (recovery) and error (message + retry). A surface that can render blank is incomplete.
6. **Commands and search are declared, not bolted on.** From TODAY-01 forward, a module's manifest registers its commands and search provider in the same PR that ships the surface, even before DS-08/09 render them.
7. **Selection summons the bulk bar** (#13): bottom-anchored, count + curated actions + clear; `Esc` clears selection first. The Inspector (DS-10) later attaches to the same selection model.
8. **Keyboard vocabulary (reserved now):** `⌘K` palette · `/` search · `g`+letter go-to chords · `↑/↓`+`j/k` movement · `x` select · `Enter`/`o` open · `e` primary quick action · `Esc` dismiss/clear (top-most first) · `?` shortcuts overlay · `[` sidebar. Modules extend; they never reassign.
9. **Tab vocabulary:** record tabs draw from the shared set (Overview · Tasks/Items · Notes · Activity · Settings); Activity and Settings always last, in that order (existing rule, restated as composition law).
10. **Tokens or nothing** (existing DS-01 rule, restated at screen level): a screen introduces no literal colour/size/duration and no new one-off component when a shared pattern exists; needing a new pattern means adding it to the Design System in the same PR.

---

## Part V — Reference screens

Normative layout references for the surfaces the roadmap will build. ASCII wireframes are the contract's *composition*; visual values are always the tokens. (All screens: sidebar per Part II; pane per Part III; ⌘K etc. per Part IV.)

### The application frame (all screens inherit this)

```
┌──────────────┬──────────────────────────────────────────────────────────────┐
│  ◆ DalyHub   │  Pane header (sticky): H1 · count · [view] [⋯]  [Primary]    │
│              │  FilterBar (sticky, when collection)                          │
│  ⌘K Search   ├──────────────────────────────────────────────────────────────┤
│              │                                                              │
│  ☀ Today     │   pane content (scrolls independently)                       │
│  ▤ Projects  │                                                              │
│  ◱ Areas     │                                                              │
│  ◎ Goals     │                                                              │
│  ✎ Notes     │                                                              │
│  ▣ Meetings  │                                                              │
│  ☺ People    │                                                              │
│  ⌂ Assets    │                                                              │
│  ✍ Diary     │                                                              │
│  ↻ Review    │                                                              │
│              │                                                              │
│  ⚙ Settings  │                                                              │
│  (A) Aidan ▾ │                                                              │
└──────────────┴──────────────────────────────────────────────────────────────┘
 sidebar: --dh-color-surface, 15rem, icons 16px + labels, active = accent-surface
 tint + semibold + aria-current (never colour alone). Pane: --dh-color-bg.
```

### Today (TODAY-01)

```
Pane header:  Today                    12 tasks · 3 done   [Plan day]
FilterBar:    [+ Filter] (chips…)                       (count · saved views)
──────────────────────────────────────────────────────────────────────
Overdue (2)                                        ← quiet section label, xs muted
 ⠿ ☐ ⬤task  Send contract to Sam        Acme relaunch · due yesterday   [✓][⋯]
 ⠿ ☐ ⬤task  Book dentist                Health · due Mon                [✓][⋯]
Today (7)
 ⠿ ☐ …list cards, compact density, reorderable…
Done today (3)                                     ← collapsed by default
```
Rules: list presentation, reorder handles, section labels are labels not headers of new UIs; completing is optimistic + undo toast; no red except overdue tone on the date text (already a Card `dateLabel` tone).

**Implementation note (2026-07-19 — TODAY-01).** TODAY-01 shipped as the calm, fixture-backed **Today dashboard** the owner's brief specifies — six vertical sections (Today's focus · Upcoming · Continue working · Recent notes · Daily timeline · Quick capture), each a labelled region with a quiet `xs`-muted label, composed inside the PX-02 `CollectionLayout` (Pane Header title "Today", subtitle = the date, one accent primary action "Quick capture") with cards opening the DS-03 Drawer. It composes only shared parts — this contract and every DS-01…04/07/PX-02 contract are unchanged. Two disclosed deviations from the sketch above: the reorderable/inline-completable **task execution list** is folded into the later TODAY items (TODAY-04/05) — TODAY-01 demonstrates completion optimistically on focus tasks; and command/search registration (Part IV §6) is deferred until a runtime seam gives a Today command a real `run` (TODAY-05 / DS-08/09), since TODAY-01 is fixture-only. See [`TODAY_DASHBOARD.md`](../development/TODAY_DASHBOARD.md).

### Projects (PROJ-01 collection) / Collection View (the generic shape)

```
Pane header:  Projects                        14 active    [board|list] [+ New]
FilterBar:    [+ Filter] [Status is Active ×] [Area is Career ×]  AND/OR · 14 results
──────────────────────────────────────────────────────────────────────
 grid/list of Project cards: ▤ icon · title · Goal context line ·
 progress bar + n/m · status pill · quick actions on hover/focus
```
This exact composition **is** CollectionLayout (#5); Areas, Goals, People, Notes reuse it with different fields.

### Areas (AREA-01)

Collection of Area cards (grid, comfortable): icon+accent · name · goals/projects counts · quiet momentum line. Opening an Area uses the **full pane** (an Area is a home, not a peek): Record Layout with tabs `Overview · Goals · Projects · Activity · Settings`.

### Goals (AREA-02)

Collection (list) of Goal cards: ◎ · title · Area context · progress from linked projects · target date. Opens in Drawer (Record Layout: Overview · Projects · Activity · Settings). Progress is always `role=progressbar` + text (DS-04 rule).

### People (PEOPLE-01)

Collection (grid, comfortable) of Person cards: initials-avatar (entity accent ring) · name · relationship context line · "last touched" quiet date. **Tone rule:** never CRM language — "You last caught up 3 weeks ago", not "No activity: 21 days". Opens in Drawer: Overview (details + linked entities) · Timeline (PEOPLE-02, the point of the record) · Activity · Settings.

### Search (DS-08)

```
Pane (or palette-first): [ 🔍  Search everything…            ]   (/ focuses)
Results grouped by entity type, each row = compact Card row (icon · title ·
context · matched-text snippet). ↑/↓ moves, Enter opens in Drawer over Search.
Grouped headers show counts; empty = EmptyState with "no matches" + tips.
```

### Command Palette (DS-09)

```
     ┌────────────────────────────────────────────────┐
     │ >  what do you want to do?                     │
     ├────────────────────────────────────────────────┤
     │ Suggested   ✓ Complete "Send contract…"    ⏎   │
     │             + New task…                 ⌘⇧T    │
     │ Navigate    ☀ Go to Today                g t   │
     │ Records     ▤ Acme relaunch (Project)          │
     └────────────────────────────────────────────────┘
 surface-raised, radius-lg, shadow-lg, --dh-z-modal, 180ms fade-scale (instant
 under reduced-motion). Context-aware: current record's commands rank first.
 Fully keyboard; shortcut hints right-aligned, mono 2xs, muted.
```

### Settings (DS-10 / SET-01)

Document shape: `--dh-width-narrow` centred *within* the pane. Left mini-nav (on wide) or stacked sections: Workspace · Appearance (theme control lives HERE) · Density · Keyboard · Modules · Data (export/backup) · Account. Each setting = label + one-line description + one control; dangerous actions separated and confirmed. Same layout at every scope (app, module, record Settings tab).

### Drawer (DS-03 — built; presentation contract restated)

Right side sheet, `--dh-width-narrow` (wide: `--dh-width-content`), full Record Layout inside, scrim over the live page, stacked levels offset −20px, top-only interactive. **Add #10:** symmetric exit. Mobile: full sheet, safe-areas, slide-up.

### Record Detail (DS-02 — built; composition restated)

Breadcrumb (ancestry to Area) · TYPE label + icon · Title (xl bold) · status pill · metadata chips · actions (one primary) · Summary (description + dl grid) · Tabs (shared vocabulary, Activity/Settings last) · content region with state slots.

### Empty State (shared, #14)

```
        ┌ icon (entity accent, 24px, quiet) ┐
              Nothing in Today yet
   Tasks you schedule or pull in will show up here.
                [ Plan your day ]
```
Centred in the content region, never full-screen theatre; one heading, one sentence, one action. Filtered-empty variant: "No tasks match these filters" + [Clear filters].

### Loading State

Skeletons mirror the final layout (record skeleton exists; card skeleton per #15): 2–4 ghost cards in the collection area, header/filter bar render immediately (they need no data). Shimmer 240ms alternate; instant under reduced-motion; region `aria-busy`. Never a full-screen spinner; never layout shift on arrival.

### Error State

Inline banner in the content region (danger-surface, thick left rule — the existing RecordContent error treatment): plain-language what + why + **a retry/next step**, `role=alert`. Full-pane errors only when the whole view failed; the frame (sidebar, header) always survives.

### Mobile (≤ 48rem)

```
┌────────────────────────────┐
│ ☰  Today            ⌘K/🔍 │  ← compact pane header; ☰ opens sidebar SHEET
├────────────────────────────┤
│ FilterBar (wraps, 44px)    │
│ task card (full width)     │
│ task card                  │
│ …                          │
└────────────────────────────┘
 Drawer = full sheet (built). Sidebar = overlay sheet w/ scrim (#9).
 Post-launch: bottom tab bar (Today · Projects · Search · More).
 320px floor: no horizontal scroll (tested); touch targets ≥ 44px (tokened).
```

### Dark Mode

Same composition, remapped colour tokens only (built, parity-tested). Contract additions: dark is a *first-class* theme — screenshots in PRs show both; elevation in dark leans on lighter surfaces + deeper shadows (already tokened); entity accent tokens (#3) must ship with dark values and pass the same contrast tests; scrims/shadows never let light-theme values leak (all tokened, none literal).

---

## Part VI — Interaction review & contract

The review's findings per interaction class, plus the binding rule going forward.

- **Hover.** Built: nav/actions/theme background tints; card border+shadow lift; title underline on card open-target. Finding: uniform card lift is too loud for dense lists (#12). **Rule:** hover states are `fast` (120ms) background/border changes; shadow lift only on board/grid objects; hover never *reveals* anything keyboard/touch can't reach (already honoured by DS-04 actions).
- **Selection.** Built: native checkbox + border/surface cue, never colour-only, never opens the record. Missing: what selection summons (#13). **Rule:** selection is always checkbox-explicit (no click-drag marquee for v1), `x` toggles, `Esc` clears first, bulk bar is the single bulk-action surface.
- **Keyboard shortcuts.** Built: full operability of every shipped component (tabs arrows/Home/End, drawer trap/Escape, reorder pick-up/move/drop, filter editor); the DS-09 palette + one shared dispatcher; and — since TODAY-05 — the Today execution accelerators (roving Arrow/Home/End/Enter/Space over the task collection, `P`/`Shift+P`/`C` against the focused task, `?` reference, `Esc` clear) dispatched through that ONE dispatcher against the same trusted routes as the mouse. Missing: the rest of the reserved vocabulary as *global* accelerators (`g`-chords, `j/k`, `x`, `o`, `e`, `[`) — [DEBT-18](../product/PRODUCT_DEBT.md). **Rule:** the Part IV vocabulary is reserved now and extended through the ONE dispatcher only (never per-surface listeners); every action reachable by keyboard remains a merge gate.
- **Focus.** Built and strong: tokened always-visible ring, deterministic drawer entry (initialFocus → close → first control), restoration to opener, roving tabindex in tabs, `inert` background. **Rule:** any new overlay reuses the Drawer's focus machinery — no second focus-trap implementation may exist.
- **Drawer transitions.** Built: 180ms emphasized slide-in, scrim fade, stacked offset, sheet-up on mobile, instant under reduced-motion. Gap: no exit (#10). **Rule:** overlays animate out the way they came, one duration tier down where snappier feel is wanted.
- **Filtering.** Built: instant client evaluation, URL-real, composable with drawer params, announced result count, filtered-empty recovery. **Rule:** filtering must remain instant (<100ms perceived) as data goes server-side — optimistic chip application with streamed results, never a "apply and wait" form.
- **Searching.** Not built (DS-08). **Contract:** incremental, keyboard-first, grouped by entity, opens in Drawer, <50ms local budget (AGENTS §16); `/` focuses it anywhere.
- **Scrolling.** Built: drawer body independent scroll + body lock + scroll-position preservation (path-keyed restoration); tab strip horizontal overflow. Gaps: pane-level scroll container (#2), sticky headers (#11), and **no virtualisation yet** — mandatory before Activity/Timeline and any unbounded collection (AGENTS §16). **Rule:** every unbounded list virtualises; sticky headers never consume more than header+filter bar.
- **Drag & drop.** Built: pointer + keyboard reorder with live-region announcements, mid-drag invalidation, pinned items, intent-only emission — genuinely best-in-class. Gaps (accepted, documented): list-only (no 2D grid/board reorder), no cross-container drag (Today planning will want "drag task to a day" — needs its own design when TODAY-04 arrives, built on the same intent-emitting philosophy). **Rule:** drag never mutates directly; it emits intent; keyboard equivalence is non-negotiable.
- **Density modes.** Built at the Card; missing at the workspace level (#16). **Rule:** density is a workspace preference consumed by collections; individual surfaces don't hardcode `compact` except in genuinely-constrained containers (e.g. drawer sub-lists).
- **Responsiveness.** Built: container-query record layout, wrapping everything, 320px tests, drawer sheet. Gaps: shell frame (#1/#2/#9). **Rule:** components respond to containers, surfaces to viewports; 320px stays a tested floor.
- **Touch targets.** Built: 44px token applied under `hover: none` for card actions/handles and drawer close. **Rule:** every interactive target ≥ 44px on touch, tokened, never literal.
- **Animation timing.** Built: three durations/easings, correctly assigned, reduced-motion collapse. Gap: no choreography system (#20). **Rule:** durations only from tokens; `fast` = state, `base` = overlays/panes, `slow` = large spatial or shimmer; nothing above 240ms, ever.

---

## Part VII — Correct vs incorrect usage (product level)

**Correct**

- ✅ A new module ships: sidebar row (registry-driven) + CollectionLayout pane + Cards opening the Drawer + FilterBar bound to the URL + commands/search registered in its manifest — and *no new visual language*.
- ✅ A record's depth goes in tabs; its essence in Summary; its actions as one primary + overflow; its history in the shared Timeline when DS-05 lands.
- ✅ A destructive action is a quiet secondary that confirms once, in words ("Delete 3 tasks? They'll be recoverable from Trash") — or better, applies optimistically with Undo.
- ✅ A count in the sidebar informs ("12") in muted text; it never pulses, colours red, or accumulates guilt.
- ✅ Dark mode ships in the same PR as light, via tokens, screenshotted both ways.

**Incorrect**

- ❌ A module page with its own header bar, its own filter dropdowns, or a bespoke card "just for this view" (Product Debt on merge — DEBT-01/02/04 all reincarnate this way).
- ❌ A modal dialog for viewing a record (that's the Drawer's job); a second drawer/overlay implementation; a popover with its own focus-trap code.
- ❌ Filter or drawer state held in component state, session storage, or anything the URL can't reproduce.
- ❌ Accent-coloured decorative headers, gradient buttons, celebratory animations, red notification badges, "streak" mechanics — all violate calm.
- ❌ A screen that can render as a blank region (missing empty/loading/error wiring), or an interaction that exists only for mouse, only for touch, or only for keyboard.
- ❌ Hardcoded `#hex`/`px`/`ms` anywhere a token exists; a new grey; a fourth text tier; two primary buttons in one region.

---

## Part VIII — Relationship to the roadmap

This review changes **no roadmap status** and starts **no roadmap item**. Its outputs bind as follows:

1. **Shell adjustments (#1, #2, #4, #9-part, #10, #12, #14, #18)** are a small, coherent set of changes to FND-09/DS-01-owned surfaces, justified above (why/impact/migration/benefit per the review's mandate). They are cheapest before TODAY-01 and are recommended as one dedicated PR ("App frame alignment") preceding it, with `DESIGN_SYSTEM.md` updated in-band.
2. **New shared pattern (#5 CollectionLayout, #13 selection bar, #15 skeletons)** — build with their first consumer (TODAY-01) *as shared patterns documented in `DESIGN_SYSTEM.md`*, or as a small DS item if the owner prefers stricter sequencing.
3. **Sequencing recommendations (#6 palette, #8 feedback slice)** — owner decisions on ordering; recorded here so the trade-off is explicit.
4. **Deferred with contract (#16 density, #19 contrast, #20 motion)** — their contracts are fixed in this document now so later items implement, not redesign.
5. **Everything in Parts II–VII is binding on every future UI item** and is review-checkable. When an item legitimately needs to deviate, it amends this document in the same PR — the same rule the Design System already follows.

## Related documents

- [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) — per-pattern anatomy, behaviour and APIs (the component contract under this product contract).
- [`PRODUCT_PRINCIPLES.md`](../product/PRODUCT_PRINCIPLES.md) — why the product must feel this way.
- [`ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md) — when each surface referenced here gets built.
- [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) — where reality diverges; several entries above prevent debt from recurring in V2.
- [`AGENTS.md`](../../AGENTS.md) — the constitution this contract operates under.
