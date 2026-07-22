# PRODUCT_DEBT.md — Known Inconsistencies & Target States

> The register of **known product/UX inconsistencies** — where the product diverges from the [Design System](../design/DESIGN_SYSTEM.md), the [architecture rules](../../AGENTS.md#9-architecture-philosophy), or the [product principles](PRODUCT_PRINCIPLES.md) — and the target state for each.
>
> **Context.** DalyHub V2 is a redevelopment of a prompt-driven V1. Much of the debt below is *inherited* from V1's patterns and is precisely what the V2 [roadmap](../roadmap/ROADMAP_V2.md) exists to resolve. As V2 is built greenfield on the shared foundation, resolving an item usually means "build the shared pattern instead of the legacy one." New debt discovered during V2 work is logged here too.

---

## How to use this register

- **Every entry links to a [ROADMAP_V2](../roadmap/ROADMAP_V2.md) item** that resolves it. Debt without a roadmap home is a signal the roadmap is incomplete — add the item.
- **When you touch code carrying debt,** either resolve it (and check the box) or update the entry with what you learned ([campsite rule](../../AGENTS.md#12-development-workflow)).
- **Found new debt?** Add it with the [template](#entry-template) rather than leaving it undocumented. Undocumented divergence is the worst kind.
- **Priority:** `P1` (actively harms coherence/trust), `P2` (notable friction), `P3` (cleanup).
- **Status:** ☐ open · ◐ in progress · ☑ resolved.

---

## Debt register

### ☐ DEBT-01 — Duplicate card implementations per module — P1
- **Current issue.** V1 grew a bespoke card per module; the same entity looks and behaves differently in different places.
- **Desired future state.** One configurable shared [Card](../design/DESIGN_SYSTEM.md#cards); every entity renders through it.
- **Related roadmap item.** [DS-04](../roadmap/ROADMAP_V2.md#-ds-04--shared-cards).

### ☐ DEBT-02 — Inconsistent record headers/layouts — P1
- **Current issue.** Tasks, projects, notes, and people each have ad-hoc top-of-record layouts; no shared header.
- **Desired future state.** Universal [Record Layout](../design/DESIGN_SYSTEM.md#record-header) (header + summary + tabs) across all entities.
- **Related roadmap item.** [DS-02](../roadmap/ROADMAP_V2.md#-ds-02--shared-record-layout-header--summary--tabs).

### ☑ DEBT-03 — Multiple save patterns (autosave vs. explicit vs. modal) — P1
- **Current issue.** Different forms save differently; users can't predict whether edits persist. Erodes [trust](PRODUCT_PRINCIPLES.md#how-users-should-feel).
- **Desired future state.** One [Forms](../design/DESIGN_SYSTEM.md#forms) system with a predictable save model per field type.
- **Resolution.** [DS-06](../roadmap/ROADMAP_V2.md#-ds-06--shared-forms--field-controls) delivers ONE shared [forms system](../design/DESIGN_SYSTEM.md#shared-forms--field-controls-ds-06) in which the save mode is a **declared, visible part of the component contract**, never inferred: `useForm` for explicit Save/Cancel (dirty tracking, duplicate-submit prevention, draft preservation on failure, unsaved-navigation interception) and `useAutosaveField` for calm, deterministic autosave (`Unsaved`/`Saving`/`Saved`/`Couldn’t save`, stale-response-safe, retry). No modal-save pattern is introduced. The predictable model now exists design-system-wide; each product create/edit surface simply adopts it (there are no product forms today that still diverge).
- **Related roadmap item.** [DS-06](../roadmap/ROADMAP_V2.md#-ds-06--shared-forms--field-controls).

### ☐ DEBT-04 — Filter inconsistencies across lists — P2
- **Current issue.** Each list built its own filtering; syntax, chips, and saved-view behaviour differ.
- **Desired future state.** One [Filters](../design/DESIGN_SYSTEM.md#filters) system used everywhere, URL-reflected, with saved views.
- **Related roadmap item.** [DS-07](../roadmap/ROADMAP_V2.md#-ds-07--shared-filters).

### ☐ DEBT-05 — Legacy modals instead of the Drawer — P2
- **Current issue.** V1 opened records in modals that lose context and can't stack or deep-link.
- **Desired future state.** Records open in the shared [Drawer](../design/DESIGN_SYSTEM.md#drawer); modals reserved for true interruptions only.
- **Related roadmap item.** [DS-03](../roadmap/ROADMAP_V2.md#-ds-03--shared-drawer).

### ☐ DEBT-06 — Navigation inconsistencies / lost context — P2
- **Current issue.** Navigating between modules discards scroll/selection/place; "back" is unreliable.
- **Desired future state.** Context-preserving navigation and restored state ([UX philosophy](../../AGENTS.md#6-ux-philosophy)).
- **Related roadmap item.** [FND-09](../roadmap/ROADMAP_V2.md#-fnd-09--app-shell-routing--auth) + [DS-03](../roadmap/ROADMAP_V2.md#-ds-03--shared-drawer).

### ☐ DEBT-07 — Fragmented activity/history — P2
- **Current issue.** History (where it exists) is per-module and inconsistent; no unified timeline or audit trail.
- **Desired future state.** One [shared Activity model](../decisions/ARCHITECTURE_DECISIONS.md#adr-005-shared-activity-model) rendered as Timeline/Activity Feed everywhere.
- **Related roadmap item.** [FND-05](../roadmap/ROADMAP_V2.md#-fnd-05--shared-activity-model) + [DS-05](../roadmap/ROADMAP_V2.md#-ds-05--shared-timeline--activity-feed).

### ◐ DEBT-08 — Ad-hoc cross-entity links — P2
- **Current issue.** Relationships were modelled per-feature; links aren't bidirectional or universally visible.
- **Desired future state.** Kernel [EntityLinks](../decisions/ARCHITECTURE_DECISIONS.md#adr-002-entitylinks) with a shared link picker and backlinks.
- **Progress.** The kernel half is done: [FND-04](../roadmap/ROADMAP_V2.md#-fnd-04--entitylinks) provides typed, bidirectional EntityLinks stored once, and [DS-06](../roadmap/ROADMAP_V2.md#-ds-06--shared-forms--field-controls) adds the ONE shared, entity-agnostic **link picker** that creates/removes real EntityLinks through that kernel (proven bidirectionally in an integration test). **First product adoption:** [TODAY-02](../roadmap/ROADMAP_V2.md#-today-02--task-drawer) ([ADR-028](../decisions/ARCHITECTURE_DECISIONS.md#adr-028-task-drawer-persistence-and-composition--the-additive-task-detail-slice)) — the Task Drawer's Links tab renders the task's real project/goal/area relationships and uses the picker to create/remove `task.relates_to` links through the policy-enforced, workspace-isolated server service. **Still open:** a shared **backlinks** surface, and broader adoption across modules; relationships are not yet universally visible in the UI. Left as in-progress rather than resolved; it completes when a backlinks view ships and more modules adopt the picker.
- **Related roadmap item.** [FND-04](../roadmap/ROADMAP_V2.md#-fnd-04--entitylinks) + [DS-06](../roadmap/ROADMAP_V2.md#-ds-06--shared-forms--field-controls).

### ☐ DEBT-09 — Legacy pages / old layouts outside the design system — P2
- **Current issue.** Some V1 screens predate any shared system and don't match current patterns.
- **Desired future state.** All surfaces composed from [Design System](../design/DESIGN_SYSTEM.md) patterns; legacy pages retired module-by-module.
- **Related roadmap item.** The per-module Phase 2–13 items in [ROADMAP_V2](../roadmap/ROADMAP_V2.md).

### ☐ DEBT-10 — Inconsistent empty/loading/error states — P3
- **Current issue.** Some screens dead-end when empty, spinner-block while loading, or show raw errors.
- **Desired future state.** Shared [Empty](../design/DESIGN_SYSTEM.md#empty-states)/[Loading](../design/DESIGN_SYSTEM.md#loading)/[Error](../design/DESIGN_SYSTEM.md#error-feedback) patterns everywhere.
- **Related roadmap item.** [DS-10](../roadmap/ROADMAP_V2.md#-ds-10--inspector-settings-and-feedback-states).

### ☐ DEBT-11 — Accessibility gaps in legacy UI — P1
- **Current issue.** Legacy screens have keyboard traps, missing labels, and insufficient contrast.
- **Desired future state.** WCAG 2.2 AA across shared components and every module ([accessibility](../../AGENTS.md#15-accessibility-requirements)).
- **Related roadmap item.** [DS-11](../roadmap/ROADMAP_V2.md#-ds-11--accessibility--responsive-baseline).

### ☐ DEBT-12 — Inconsistent Markdown handling — P3
- **Current issue.** Text stored/rendered differently across features; some paths risk unsafe HTML.
- **Desired future state.** One [Markdown pipeline](../decisions/ARCHITECTURE_DECISIONS.md#adr-006-markdown-strategy) with a single sanitising renderer.
- **Related roadmap item.** [FND-08](../roadmap/ROADMAP_V2.md#-fnd-08--markdown-pipeline).

### ☐ DEBT-13 — Reserved-spine-type guard lives in the D1 adapter — P3
- **Current issue.** The FND-07 reservation that stops the generic Entity/EntityLink repositories from mutating spine types/links ([ADR-014](../decisions/ARCHITECTURE_DECISIONS.md#adr-014-spine-hierarchy-completion-and-rollup-semantics)) is enforced inside the D1 adapters (`d1-entity-repository`, `d1-entity-link-repository`) against a shared kernel identifier set. D1 is the only adapter today, but a second storage adapter would have to replicate the guard to stay safe.
- **Desired future state.** If a second adapter is ever added, lift the reserved-mutation check to a shared, storage-independent layer (e.g. a small guarded base or a kernel-level decorator) so no adapter can forget it — without coupling generic persistence to a mutable registry.
- **Related roadmap item.** [FND-07](../roadmap/ROADMAP_V2.md#-fnd-07--area--goal--project--task-hierarchy) (revisit when a non-D1 adapter is proposed).

### ☐ DEBT-14 — Grouped `role="feed"` interleaves non-article children — P3
- **Current issue.** The DS-05 Timeline/Activity Feed ([ADR-021](../decisions/ARCHITECTURE_DECISIONS.md#adr-021-the-shared-timeline--activity-feed--one-renderer-one-presentation-view-model-in-house-virtualisation)) renders a grouped, virtualised `role="feed"` whose direct subtree interleaves day-heading elements (and a load-more control) with the `role="article"` events. This is keyboard- and screen-reader navigable (semantic day headings, `aria-posinset`/`aria-setsize` on articles), but does not satisfy the strict ARIA `feed`→`article`-only child requirement, so the DS-11 axe gate disables `aria-required-children` (documented in `e2e/helpers.ts`).
- **Desired future state.** Revisit the grouped-feed structure so the `role="feed"` owns only articles (e.g. day labels carried inside each day's first article, load-more outside the feed) while preserving virtualisation, grouping and the reading experience — then re-enable `aria-required-children` in the axe gate.
- **Related roadmap item.** [DS-05](../roadmap/ROADMAP_V2.md#-ds-05--shared-timeline--activity-feed) (revisit in a DS-05 hardening pass).

### ☐ DEBT-15 — Listbox options wrap a focusable result control — P3
- **Current issue.** DS-08 Search and DS-09 Command Palette ([ADR-023](../decisions/ARCHITECTURE_DECISIONS.md#adr-023-shared-search--registry-driven-providers-runtime-orchestration-and-safe-navigation)/[ADR-024](../decisions/ARCHITECTURE_DECISIONS.md#adr-024-command-palette--quick-actions--command-kinds-trusted-catalogue-authenticated-execution-and-one-shared-action)) render each `role="option"` around a real, focusable result control (a `tabindex="-1"` link so a record result stays middle-clickable / open-in-new-tab, or a button). Selection is driven by `aria-activedescendant`, so the inner control is never a tab stop, but axe's `nested-interactive` flags the nested focusable, so the DS-11 axe gate disables that rule (documented in `e2e/helpers.ts`).
- **Desired future state.** Revisit the option anatomy so the option element itself is the single interactive/link target (preserving middle-click, shareable navigation and keyboard activation) with no nested focusable — then re-enable `nested-interactive` in the axe gate.
- **Related roadmap item.** [DS-08](../roadmap/ROADMAP_V2.md#-ds-08--shared-search) / [DS-09](../roadmap/ROADMAP_V2.md#-ds-09--command-palette--quick-actions) (revisit in a search/palette hardening pass).

### ◐ DEBT-16 — Minimal task-detail model (richer workflow status still deferred) — P3
- **Current issue.** [TODAY-02](../roadmap/ROADMAP_V2.md#-today-02--task-drawer) ([ADR-028](../decisions/ARCHITECTURE_DECISIONS.md#adr-028-task-drawer-persistence-and-composition--the-additive-task-detail-slice)) added only the smallest honest task-detail slice: a two-value workflow `status` (`todo`/`in_progress`, with "done" derived from spine completion), a three-value `priority`, due/scheduled dates and a Markdown description. A richer workflow status (planned/active/on-hold/cancelled) is still **not** modelled.
- **Partially resolved.** The Waiting/blocking relationship is now modelled by [TODAY-03](../roadmap/ROADMAP_V2.md#-today-03--waiting) ([ADR-029](../decisions/ARCHITECTURE_DECISIONS.md#adr-029-task-waiting--additive-state-a-reserved-entitylink-and-a-derived-first-class-display-state)) — exactly as intended, by extending the same `task_details` + EntityLink foundation (two additive columns + a reserved `task.waiting_on` link) rather than a parallel store, and surfaced as a derived first-class display state. What remains is the richer *workflow status* enum.
- **Desired future state.** A full Tasks module models the richer workflow status, extending the same `task_details` foundation rather than a parallel store.
- **Related roadmap item.** A future Tasks module.

### ☐ DEBT-17 — Today search provider is fixture-backed, not over real tasks — P3
- **Current issue.** TODAY-02 made the Today *focus* section read real workspace-scoped tasks, but the DS-08 search provider ([`app/modules/today/search.ts`](../../app/modules/today/search.ts)) still builds its task candidates from the TODAY-01 fixtures (matching the seeded ids), because a search provider's `ModuleRuntimeContext` exposes the workspace context but not a repository/D1 handle. A search result for a fixture task id that isn't a real task would open the calm not-found Drawer.
- **Desired future state.** The Today (and future Tasks) search provider queries real tasks — either by extending the DS-08 runtime context with a scoped read seam or by a Tasks-module search provider — so search and the surface share one source of truth.
- **Related roadmap item.** [DS-08](../roadmap/ROADMAP_V2.md#-ds-08--shared-search) + a future Tasks module.

### ☐ DEBT-18 — Reserved cross-app keyboard vocabulary + a few Today actions lack a dedicated palette command — P3
- **Current issue.** TODAY-05 implemented the Today execution shortcuts (Arrow/Home/End/Enter/Space roving, `P`/`Shift+P`/`C`, `?`, `Escape`) but the broader reserved keyboard vocabulary documented in [`PRODUCT_EXPERIENCE.md` Part IV](../design/PRODUCT_EXPERIENCE.md) — the `g`+letter go-to chords, `j/k` movement aliases, `x` select, `o`/`e` open/primary-action, and `[` sidebar — is still reserved-but-unbuilt at the app level, and the keyboard reference is Today-scoped (a `help:shortcuts` Drawer key), not a global `?` overlay. Separately, four Today actions are keyboard-operable only through their visible controls, not yet a dedicated palette command: **mark waiting** and **change waiting subject** (the Drawer waiting editor — needs typed input), **choose a custom planning date** (the Drawer/bulk-bar date inputs), and **open Task Activity** (the RecordTabs tablist). Each is fully reachable by keyboard today (ADR-031 §31.5b) — the gap is only palette discoverability, not accessibility.
- **Desired future state.** A cross-app pass implements the remaining reserved vocabulary through the SAME one shared dispatcher (never per-surface listeners), promotes the shortcuts reference to a global overlay reusing the shared modal machinery, and adds dedicated commands for the four Today actions (e.g. a command that opens the waiting editor / activity tab / a date prompt) — extending, never forking, the DS-09 command system.
- **Related roadmap item.** A future cross-cutting keyboard item (post-[TODAY-05](../roadmap/ROADMAP_V2.md#-today-05--keyboard-workflow)); the vocabulary stays reserved in the interim so nothing else claims those keys.

### ☐ DEBT-19 — Projects: search still opens the fixture project drawer — P3
- **Current issue.** PROJ-01 replaced the Today "Continue working" seam with the real project read model (navigating to `/projects/:id`), but the DS-08 Today **search** provider ([`app/modules/today/search.ts`](../../app/modules/today/search.ts)) still indexes fixture projects and opens a fixture `project:<id>` Drawer (the same fixture-search limitation as [DEBT-17](#-debt-17--today-search-provider-is-fixture-backed-not-over-real-tasks--p3)), so a project *found via search* opens a placeholder rather than the real record route now that real projects exist.
- **Resolved (2026-07-22).** The collection-pagination half of this debt is **fixed**: the Projects collection AND the Project Tasks tab are now fully **cursor-paginated** (versioned, scope-bound cursors mirroring the spine/EntityLink pattern, keyset ordering with a deterministic `id` tiebreaker, `nextCursor` on the kernel contract, and an accessible shared "Load more" affordance), so **every** matching project and task is reachable — not just the first bounded page. See [ADR-034](../decisions/ARCHITECTURE_DECISIONS.md#adr-034-projects-module-read-projection) and [PROJECTS_MODULE.md](../development/PROJECTS_MODULE.md). Only the fixture-search issue above remains open under this debt.
- **Desired future state.** Search resolves real projects and targets the canonical `/projects/:id` route (folded into the DEBT-17 real-search work). This does not block PROJ-01's calm single-owner surface. *(Today's "Continue working" already selects the most-recently-updated projects at the database via `orderBy: "recent"`, so the earlier loader-side recency approximation is resolved.)*
- **Related roadmap item.** [PROJ-01](../roadmap/ROADMAP_V2.md#-proj-01--overview); [DS-08](../roadmap/ROADMAP_V2.md#-ds-08--shared-search); [PROJ-02](../roadmap/ROADMAP_V2.md) (richer project filtering reuses the DS-07 clause-builder the state segment defers).

---

## Entry template

```markdown
### ☐ DEBT-NN — <short title> — P1/P2/P3
- **Current issue.** <what is inconsistent/wrong today, and the harm it causes>
- **Desired future state.** <the target, referencing the shared pattern/ADR it should match>
- **Related roadmap item.** <ROADMAP_V2 ID that resolves it>
```

---

## Related documents
- [`ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md) — every debt item resolves to a roadmap item.
- [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md) — the target patterns most debt converges toward.
- [`ARCHITECTURE_DECISIONS.md`](../decisions/ARCHITECTURE_DECISIONS.md) — the kernel decisions structural debt converges toward.
- [`AGENTS.md`](../../AGENTS.md) — the standards that define what counts as debt.
- [`docs/README.md`](../README.md) — documentation index.

### ☐ DEBT-20 — No health-specific project filter yet (DS-07 clause-builder still deferred) — P3
- **Current issue.** PROJ-02 surfaces project health on every collection card and explains it on the record, but the `/projects` collection still filters only by the restrained Open/Completed/All URL segment ([`SegmentedFilter`](../../app/modules/projects/SegmentedFilter.tsx)). There is no way to filter the collection to *just* at-risk / blocked / stale projects. Health is derived (not a stored column), so a health filter must be applied server-side over the same bounded facts, not a client re-sort of one page.
- **Assessment.** For a single-owner workspace the expected outcome — *recognise which open projects need attention without opening every record* — is met by the always-visible health cue on each card plus normal scanning; a dedicated filter is a refinement, not a requirement. The audit deliberately did **not** invent a second filtering system.
- **Desired future state.** When richer project filtering lands, add a health **enum** field (on-track/at-risk/blocked/stale) to the DS-07 `FilterBar` clause-builder (the same path [DEBT-19](#-debt-19--projects-search-still-opens-the-fixture-project-drawer--p3) and ADR-034 point to), evaluated server-side over the bounded facts — never replacing the Open/Completed/All state control.
- **Related roadmap item.** [PROJ-02](../roadmap/ROADMAP_V2.md#-proj-02--health); [DS-07](../roadmap/ROADMAP_V2.md#-ds-07--filters--saved-views).

### ☐ DEBT-21 — Bare project record page has a pre-existing heading-order gap — P3
- **Current issue.** PROJ-02's record axe scan surfaced (did not cause) a pre-existing PROJ-01 condition: the bare `/projects/:id` record page jumps from the record `h1` straight to the Tasks tab's task cards at `h4`, with no intervening `h2`/`h3` — an axe `heading-order` (WCAG best-practice) violation. It was never caught because the only prior record axe gate scans the record with the shared Task Drawer **open** (which inerts the background and hides its headings). PROJ-02 matched that established gate for its own record scan rather than performing a drive-by heading-hierarchy refactor of the PROJ-01/DS-02 record layout.
- **Desired future state.** A DS-02 / PROJ-05 pass gives the project record a correct heading outline (e.g. a section-level `h2` around the tab region and task cards at `h3`), so the **bare** record page is axe-clean without the Drawer open.
- **Related roadmap item.** [PROJ-02](../roadmap/ROADMAP_V2.md#-proj-02--health) (surfaced); [PROJ-05](../roadmap/ROADMAP_V2.md#-proj-05--settings) / DS-02 (fix).
