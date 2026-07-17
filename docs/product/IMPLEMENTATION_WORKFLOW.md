# IMPLEMENTATION_WORKFLOW.md — The Lifecycle of a Feature

> The expected lifecycle of **every** feature, from an unchecked roadmap item to merged, documented work. This workflow exists so that future prompts can be tiny — the *process* lives here, not in the prompt.
>
> The whole point: a prompt as small as *"Implement the next unchecked ROADMAP_V2 item according to AGENTS.md"* should be enough, because this document supplies the steps. If you find yourself needing a long prompt, that's a [documentation bug](../../AGENTS.md#0-how-to-use-this-repository) — fix the docs.

---

## The lifecycle at a glance

```
Understand
   ↓
Audit  (what already exists in the repo?)
   ↓
Inspect existing implementation
   ↓
Search open source  (GitHub / libraries)
   ↓
Evaluate licensing
   ↓
Reuse assessment  (depend / adapt / build)
   ↓
Design  (which Design System patterns?)
   ↓
Architecture review  (kernel contracts / ADR needed?)
   ↓
Implement
   ↓
Test
   ↓
Review
   ↓
Merge
   ↓
Update documentation
```

Each step is expanded below with its inputs, actions, and the authority that governs it. Skipping a step is a defect; where a step genuinely doesn't apply (e.g. no reuse candidate exists), note that explicitly rather than silently omitting it.

---

## The steps

### 1. Understand
- **Goal.** Know exactly what you're building and why.
- **Do.** Read the [ROADMAP_V2](../roadmap/ROADMAP_V2.md) item — its Purpose, Dependencies, Expected outcome, Priority. Confirm dependencies are ☑. Ground it in [`PRODUCT_PRINCIPLES.md`](PRODUCT_PRINCIPLES.md): whose life does this serve, and how should it feel?
- **Governed by.** [`ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md), [`PRODUCT_PRINCIPLES.md`](PRODUCT_PRINCIPLES.md).
- **Output.** A one-line statement of the item and its acceptance intent.

### 2. Audit
- **Goal.** Understand the current state of the repo around this item.
- **Do.** Search for related existing code, patterns, and entities. Check [`PRODUCT_DEBT.md`](PRODUCT_DEBT.md) for known debt this item touches or resolves.
- **Governed by.** [`PRODUCT_DEBT.md`](PRODUCT_DEBT.md), the codebase.
- **Output.** A list of what exists, what's reusable in-repo, and what debt is in scope.

### 3. Inspect existing implementation
- **Goal.** Reuse what the repo already has before adding anything.
- **Do.** Look hard at the [Design System](../design/DESIGN_SYSTEM.md) and kernel: is there already a shared Card, Drawer, Form, link picker, activity renderer you should use? Prefer extending a shared pattern over inventing one ([`AGENTS.md §9.8`](../../AGENTS.md#98-shared-over-bespoke)).
- **Governed by.** [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md), [`ARCHITECTURE_OVERVIEW.md`](../architecture/ARCHITECTURE_OVERVIEW.md).
- **Output.** The set of existing shared pieces this item will build on.

### 4. Search open source
- **Goal.** Don't reinvent commodity solutions.
- **Do.** For any commodity sub-problem (command palette, editor, DnD, dates), check [`REFERENCE_PRODUCTS.md`](../reference/REFERENCE_PRODUCTS.md) first; if not covered, investigate candidates per [GitHub investigation expectations](../governance/OPEN_SOURCE_POLICY.md#github-investigation-expectations).
- **Governed by.** [`OPEN_SOURCE_POLICY.md`](../governance/OPEN_SOURCE_POLICY.md), [`REFERENCE_PRODUCTS.md`](../reference/REFERENCE_PRODUCTS.md).
- **Output.** Candidate libraries/snippets, or a note that this is a DalyHub differentiator to build.

### 5. Evaluate licensing
- **Goal.** Only lawful, compatible code enters the repo.
- **Do.** Verify the licence of each candidate **for the exact version** against the [licensing rules](../governance/OPEN_SOURCE_POLICY.md#licensing-rules) (including the transitive tree). Reject prohibited/no-licence code.
- **Governed by.** [`OPEN_SOURCE_POLICY.md`](../governance/OPEN_SOURCE_POLICY.md), [`AGENTS.md §11`](../../AGENTS.md#11-licensing--provenance-requirements).
- **Output.** A licence verdict per candidate.

### 6. Reuse assessment
- **Goal.** Decide depend / adapt / build.
- **Do.** Run the [reusable evaluation checklist](../governance/OPEN_SOURCE_POLICY.md#reusable-evaluation-checklist). Record provenance for anything you'll use; update [`REFERENCE_PRODUCTS.md`](../reference/REFERENCE_PRODUCTS.md) with findings.
- **Governed by.** [`OPEN_SOURCE_POLICY.md`](../governance/OPEN_SOURCE_POLICY.md).
- **Output.** A decision with justification, and provenance recorded.

### 7. Design
- **Goal.** Design the feature from shared patterns.
- **Do.** Compose the UI from [Design System](../design/DESIGN_SYSTEM.md) patterns. If a needed pattern doesn't exist, plan to build it *as shared* and document it. Check the design against [product feelings](PRODUCT_PRINCIPLES.md#how-users-should-feel) and [accessibility](../../AGENTS.md#15-accessibility-requirements).
- **Governed by.** [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md), [`PRODUCT_PRINCIPLES.md`](PRODUCT_PRINCIPLES.md).
- **Output.** A design that names the patterns used/added.

### 8. Architecture review
- **Goal.** Keep the system coherent.
- **Do.** Confirm the change respects kernel contracts (entities, [EntityLinks](../decisions/ARCHITECTURE_DECISIONS.md#adr-002-entitylinks), [Activity](../decisions/ARCHITECTURE_DECISIONS.md#adr-005-shared-activity-model), [workspace scoping](../decisions/ARCHITECTURE_DECISIONS.md#adr-003-workspace-isolation), [module registry](../decisions/ARCHITECTURE_DECISIONS.md#adr-007-module-registry)). If it changes a contract or makes a foundational choice, **write a new ADR**.
- **Governed by.** [`ARCHITECTURE_DECISIONS.md`](../decisions/ARCHITECTURE_DECISIONS.md), [`ARCHITECTURE_OVERVIEW.md`](../architecture/ARCHITECTURE_OVERVIEW.md), [`AGENTS.md §9`](../../AGENTS.md#9-architecture-philosophy).
- **Output.** Confirmation of fit, plus any new ADR.

### 9. Implement
- **Goal.** Build the one item, completely.
- **Do.** Implement on a feature branch, one roadmap item only. Reuse shared patterns; conform adapted code to DalyHub conventions; add provenance comments; meet [security](../../AGENTS.md#17-security-requirements) and [performance](../../AGENTS.md#16-performance-expectations) requirements as you go.
- **Governed by.** [`AGENTS.md`](../../AGENTS.md) (all standards).
- **Output.** Working code for exactly one roadmap item.

### 10. Test
- **Goal.** Prove it works and stays working.
- **Do.** Unit/integration/e2e per the [testing philosophy](../../AGENTS.md#14-testing-philosophy); regression test for any bug fixed; verify accessibility and performance; **drive the real flow end-to-end**, don't just compile.
- **Governed by.** [`AGENTS.md §14–16`](../../AGENTS.md#14-testing-philosophy).
- **Output.** Green checks and a described manual verification.

### 11. Review
- **Goal.** A second set of eyes against the standards.
- **Do.** Open a PR meeting the [PR standards](../../AGENTS.md#13-pull-request-standards): states the roadmap item, design patterns used, verification, provenance, docs. Address feedback.
- **Governed by.** [`AGENTS.md §13`](../../AGENTS.md#13-pull-request-standards).
- **Output.** An approved PR that meets the [Definition of Done](../../AGENTS.md#18-definition-of-done).

### 12. Merge
- **Goal.** Land the change cleanly.
- **Do.** Merge once all checks pass and DoD is satisfied. One item, one merge.
- **Governed by.** [`AGENTS.md §18`](../../AGENTS.md#18-definition-of-done).
- **Output.** Merged change.

### 13. Update documentation
- **Goal.** Keep the repository's memory accurate — this is the step that keeps future prompts small.
- **Do.** In the **same PR**: flip the [ROADMAP_V2](../roadmap/ROADMAP_V2.md) item's status; add any new [Design System](../design/DESIGN_SYSTEM.md) pattern or [ADR](../decisions/ARCHITECTURE_DECISIONS.md); update [`PRODUCT_DEBT.md`](PRODUCT_DEBT.md) (resolved or newly found); update [`REFERENCE_PRODUCTS.md`](../reference/REFERENCE_PRODUCTS.md) if you researched anything. If you needed a long prompt, improve the docs so the next agent won't.
- **Governed by.** [`AGENTS.md §12`](../../AGENTS.md#12-development-workflow).
- **Output.** Documentation that matches reality; cross-links still resolve.

---

## Applying the workflow at the right size

The workflow scales to the change:

- **A small item** (e.g. a shared component tweak) still passes through every step, but Search/Licensing/ADR steps may resolve in seconds ("no reuse needed; no contract change").
- **A large item** should have been split at the roadmap level. If step 1 reveals it's really several items, **stop and split it** in [`ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md) before implementing.

The steps are always *considered*; their depth varies. Explicitly noting "N/A" for a step is fine — silently skipping it is not.

---

## Related documents
- [`AGENTS.md`](../../AGENTS.md) — the standards each step enforces.
- [`ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md) — the source of items this workflow consumes.
- [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md) · [`ARCHITECTURE_DECISIONS.md`](../decisions/ARCHITECTURE_DECISIONS.md) · [`OPEN_SOURCE_POLICY.md`](../governance/OPEN_SOURCE_POLICY.md) · [`REFERENCE_PRODUCTS.md`](../reference/REFERENCE_PRODUCTS.md) · [`PRODUCT_DEBT.md`](PRODUCT_DEBT.md)
- [`docs/README.md`](../README.md) — documentation index.
