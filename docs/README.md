# DalyHub Documentation Index

> The map of DalyHub's documentation. This repository is designed to be **repository-driven**: the docs — not the owner's memory — carry the product vision, standards, roadmap, and process. Read them and you should be able to contribute without needing anything explained.
>
> **New here? Read in this order:** [`AGENTS.md`](../AGENTS.md) → [`PRODUCT_PRINCIPLES.md`](product/PRODUCT_PRINCIPLES.md) → [`ROADMAP_V2.md`](roadmap/ROADMAP_V2.md). That's enough to start.

---

## The intended workflow

```
AGENTS.md  →  ROADMAP_V2.md  →  a small implementation prompt
```

A future prompt should be as small as: **"Implement the next unchecked ROADMAP_V2 item according to AGENTS.md."** If a task needs more than that, the docs are incomplete — improve them (see [`IMPLEMENTATION_WORKFLOW.md`](product/IMPLEMENTATION_WORKFLOW.md)).

---

## All documents

| Document | Purpose |
|---|---|
| [`/AGENTS.md`](../AGENTS.md) | **The constitution.** Product + engineering standards, architecture philosophy, licensing rules, Definition of Done. Read first. |
| [`/README.md`](../README.md) | Project front door and quick orientation. |
| **Product** | |
| [`product/PRODUCT_PRINCIPLES.md`](product/PRODUCT_PRINCIPLES.md) | What DalyHub is, why it exists, how it should feel; meaning of every entity. |
| [`product/PRODUCT_DEBT.md`](product/PRODUCT_DEBT.md) | Known inconsistencies and their target states, linked to roadmap items. |
| [`product/IMPLEMENTATION_WORKFLOW.md`](product/IMPLEMENTATION_WORKFLOW.md) | The step-by-step lifecycle of every feature. |
| **Roadmap** | |
| [`roadmap/ROADMAP_V2.md`](roadmap/ROADMAP_V2.md) | The master, phased list of independently-implementable work items. |
| **Design** | |
| [`design/DESIGN_SYSTEM.md`](design/DESIGN_SYSTEM.md) | The shared interaction language every module reuses. |
| [`design/PRODUCT_EXPERIENCE.md`](design/PRODUCT_EXPERIENCE.md) | The product-wide experience contract: the 2026-07 UX review, scores, ranked improvements, philosophies, hierarchy/composition rules, and reference screens. |
| **Architecture** | |
| [`architecture/ARCHITECTURE_OVERVIEW.md`](architecture/ARCHITECTURE_OVERVIEW.md) | How the kernel, modules, and platform fit together technically. |
| [`decisions/ARCHITECTURE_DECISIONS.md`](decisions/ARCHITECTURE_DECISIONS.md) | The ADRs — why the system is built the way it is. |
| **Governance & Reference** | |
| [`governance/OPEN_SOURCE_POLICY.md`](governance/OPEN_SOURCE_POLICY.md) | When/how to reuse open source; licensing and provenance. |
| [`reference/REFERENCE_PRODUCTS.md`](reference/REFERENCE_PRODUCTS.md) | Products we study and candidate libraries, with licences. |
| **Development** | |
| [`development/SETUP_AND_CI.md`](development/SETUP_AND_CI.md) | Local setup, everyday commands, and the CI pipeline. |
| [`development/DEPLOYMENT.md`](development/DEPLOYMENT.md) | Deploying to Cloudflare Workers and the required setup/secrets. |
| [`development/DATA_KERNEL.md`](development/DATA_KERNEL.md) | The entity kernel & D1: migrations, kernel tests, inspecting local D1, remote provisioning. |
| [`development/MODULES.md`](development/MODULES.md) | Building a module: the manifest convention, contribution types, discovery, id/namespacing rules, collisions, and the cross-module import rule. |
| [`development/SPINE_MODEL.md`](development/SPINE_MODEL.md) | The Area→Goal→Project→Task spine: kinds, permitted hierarchy, structural links, exactly-one-parent, completion vs. deletion, derived rollups, move/reparent, reserved mutation paths, and Activity events. |
| [`development/MARKDOWN_PIPELINE.md`](development/MARKDOWN_PIPELINE.md) | The shared Markdown pipeline: source-of-truth & size limits, supported/unsupported profile, raw-HTML policy, sanitisation allowlist, URL & remote-image policy, code/task-list behaviour, the public API, the one React sink, Workers compatibility, and how Notes/Diary/descriptions consume it. |
| [`development/APP_SHELL_AUTH.md`](development/APP_SHELL_AUTH.md) | The app shell & authentication: the request/auth flow, Cloudflare Access JWT validation, owner enforcement, session/identity types, authenticated workspace & Activity actor, development-auth mode, local setup, logout, the public `/health` boundary, registry-driven routing & navigation, theme behaviour, security headers, and the workers.dev/custom-domain deployment requirements. |
| [`development/ACTIVITY_TIMELINE.md`](development/ACTIVITY_TIMELINE.md) | The Shared Timeline & Activity Feed (DS-05): one renderer for both scopes, the presentation view-model boundary, registering event descriptors, the unknown-type fallback, wiring a route, DS-07 filtering & DS-03 drawer reuse, ordering/grouping/dates, virtualisation, accessibility, and the development demonstration. |
| [`development/SHARED_FORMS.md`](development/SHARED_FORMS.md) | The Shared Forms & field controls (DS-06): the React-free model boundary, the field contract & anatomy, layered validation, the declared explicit-save and autosave models, navigation safety, the Markdown source control, timezone-safe dates, the entity-link picker over the FND-04 repository, accessibility, and the development demonstration. |
| [`development/SHARED_SEARCH.md`](development/SHARED_SEARCH.md) | The Shared Search system (DS-08): the model/orchestrator/UI layers, the registry-driven provider contract and the `SearchResultTarget` navigation refinement, deterministic ranking & grouping, bounds & safety, incremental search (debounce/abort/stale), Drawer opening, accessibility & modal reuse, the server composition, the Today fixture provider, and the development demonstration. |
| [`development/COMMAND_PALETTE.md`](development/COMMAND_PALETTE.md) | The Command Palette & Quick Actions system (DS-09): the refined discriminated command contract, the model/server/runtime layers, the trusted catalogue transport & browser decoder, the authenticated execution boundary, contextual actions, the shared `AppAction` and Card/Header adapters, the keyboard vocabulary & dispatcher, DS-08 Search reuse, and the development demonstration. |

---

## Directory structure

```
/
├── AGENTS.md                        the constitution (kept at root, authoritative)
├── README.md                        project front door
└── docs/
    ├── README.md                    this index
    ├── product/
    │   ├── PRODUCT_PRINCIPLES.md
    │   ├── PRODUCT_DEBT.md
    │   └── IMPLEMENTATION_WORKFLOW.md
    ├── roadmap/
    │   └── ROADMAP_V2.md
    ├── design/
    │   ├── DESIGN_SYSTEM.md
    │   └── PRODUCT_EXPERIENCE.md
    ├── architecture/
    │   └── ARCHITECTURE_OVERVIEW.md
    ├── decisions/
    │   └── ARCHITECTURE_DECISIONS.md   (ADRs)
    ├── governance/
    │   └── OPEN_SOURCE_POLICY.md
    ├── reference/
    │   └── REFERENCE_PRODUCTS.md
    └── development/
        ├── SETUP_AND_CI.md
        ├── DEPLOYMENT.md
        ├── DATA_KERNEL.md
        ├── MODULES.md
        ├── SPINE_MODEL.md
        ├── MARKDOWN_PIPELINE.md
        ├── APP_SHELL_AUTH.md
        ├── ACTIVITY_TIMELINE.md
        ├── SHARED_FORMS.md
        ├── SHARED_SEARCH.md
        └── COMMAND_PALETTE.md
```

> Beyond `docs/`, the repository root now also carries the application itself
> (`app/`, `workers/`, config files) plus `THIRD_PARTY_NOTICES.md`, from
> [FND-01](roadmap/ROADMAP_V2.md#-fnd-01--repository--toolchain-scaffold).
> [FND-02](roadmap/ROADMAP_V2.md#-fnd-02--data-kernel-entities--storage) adds the
> data kernel (`app/kernel/`, `app/platform/storage/`) and `migrations/`.

---

## How the documents relate

- **[`AGENTS.md`](../AGENTS.md)** is the root authority; every other doc elaborates a part of it and links back.
- **[`PRODUCT_PRINCIPLES.md`](product/PRODUCT_PRINCIPLES.md)** sets the *why*; **[`DESIGN_SYSTEM.md`](design/DESIGN_SYSTEM.md)** turns it into *how it feels*; **[`ARCHITECTURE_*`](architecture/ARCHITECTURE_OVERVIEW.md)** turn it into *how it's built*.
- **[`ROADMAP_V2.md`](roadmap/ROADMAP_V2.md)** sequences the work; **[`IMPLEMENTATION_WORKFLOW.md`](product/IMPLEMENTATION_WORKFLOW.md)** is how each item is executed.
- **[`OPEN_SOURCE_POLICY.md`](governance/OPEN_SOURCE_POLICY.md)** + **[`REFERENCE_PRODUCTS.md`](reference/REFERENCE_PRODUCTS.md)** govern reuse; **[`PRODUCT_DEBT.md`](product/PRODUCT_DEBT.md)** tracks the gap between today and the target.

Every document ends with a **Related documents** section — follow the links; nothing here is meant to be read in isolation.

---

## Conventions for changing docs

- **Docs change with the code that affects them,** in the same PR ([`AGENTS.md §12`](../AGENTS.md#12-development-workflow)).
- **`AGENTS.md` is authoritative**; if another doc conflicts with it, fix the other doc (unless a dated ADR supersedes).
- **Keep cross-links resolving.** If you move or rename a doc, update every reference and this index.
- **Amend deliberately.** Constitution and ADR changes get their own focused PRs with reasoning.
