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
| **Architecture** | |
| [`architecture/ARCHITECTURE_OVERVIEW.md`](architecture/ARCHITECTURE_OVERVIEW.md) | How the kernel, modules, and platform fit together technically. |
| [`decisions/ARCHITECTURE_DECISIONS.md`](decisions/ARCHITECTURE_DECISIONS.md) | The ADRs — why the system is built the way it is. |
| **Governance & Reference** | |
| [`governance/OPEN_SOURCE_POLICY.md`](governance/OPEN_SOURCE_POLICY.md) | When/how to reuse open source; licensing and provenance. |
| [`reference/REFERENCE_PRODUCTS.md`](reference/REFERENCE_PRODUCTS.md) | Products we study and candidate libraries, with licences. |

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
    │   └── DESIGN_SYSTEM.md
    ├── architecture/
    │   └── ARCHITECTURE_OVERVIEW.md
    ├── decisions/
    │   └── ARCHITECTURE_DECISIONS.md   (ADRs)
    ├── governance/
    │   └── OPEN_SOURCE_POLICY.md
    └── reference/
        └── REFERENCE_PRODUCTS.md
```

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
