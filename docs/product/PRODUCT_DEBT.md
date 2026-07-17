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

### ☐ DEBT-03 — Multiple save patterns (autosave vs. explicit vs. modal) — P1
- **Current issue.** Different forms save differently; users can't predict whether edits persist. Erodes [trust](PRODUCT_PRINCIPLES.md#how-users-should-feel).
- **Desired future state.** One [Forms](../design/DESIGN_SYSTEM.md#forms) system with a predictable save model per field type.
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

### ☐ DEBT-08 — Ad-hoc cross-entity links — P2
- **Current issue.** Relationships were modelled per-feature; links aren't bidirectional or universally visible.
- **Desired future state.** Kernel [EntityLinks](../decisions/ARCHITECTURE_DECISIONS.md#adr-002-entitylinks) with a shared link picker and backlinks.
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
