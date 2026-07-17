# DalyHub

**DalyHub is a Personal Operating System — one calm, coherent place to run a life.**

It sits above task managers, note apps, calendars, and contact lists as the layer where the pieces of a life connect: responsibilities, intentions, work, people, knowledge, and reflection — one model, cross-linked, searchable, and owned by you. This repository is **DalyHub V2**, the redevelopment built on a shared design language, a shared data model, and an AI layer that *proposes* rather than acts.

> **What is this repository right now?** It is the **product operating system** for DalyHub — the documentation, governance, and roadmap that drive development. DalyHub V2 is built by implementing the [roadmap](docs/roadmap/ROADMAP_V2.md) one item at a time, guided by the [constitution](AGENTS.md). The repository itself is the project's long-term memory.

---

## Start here

Read these three, in order — that's enough to contribute:

1. **[`AGENTS.md`](AGENTS.md)** — the constitution: product vision, engineering standards, architecture philosophy, licensing rules, and the Definition of Done.
2. **[`docs/product/PRODUCT_PRINCIPLES.md`](docs/product/PRODUCT_PRINCIPLES.md)** — what DalyHub is, why it exists, and how it should feel.
3. **[`docs/roadmap/ROADMAP_V2.md`](docs/roadmap/ROADMAP_V2.md)** — what we build next, as independently-implementable items.

The full map is in **[`docs/README.md`](docs/README.md)**.

## The core idea

DalyHub organises a life along a single backbone — **Area → Goal → Project → Task** — with supporting entities (**Notes, Meetings, People, Assets, Diary, Review**) woven across it through typed links, an **AI** layer that proposes changes for you to approve, and one shared design language so learning one module teaches you all of them.

```
Area        ongoing domain of life      (Health, Career, Home)
  └ Goal    desired outcome             (Run a half-marathon)
      └ Project   finite body of work   (12-week training plan)
          └ Task  atomic unit of action (Monday: 5km easy run)
```

See [`AGENTS.md §4`](AGENTS.md#4-the-area--goal--project--task-model) and [`PRODUCT_PRINCIPLES.md`](docs/product/PRODUCT_PRINCIPLES.md#the-entities) for the full model.

## How development works

DalyHub is a **repository-driven** project: the docs carry the product philosophy and process, so implementation prompts stay small.

```
AGENTS.md  →  ROADMAP_V2.md  →  a small implementation prompt
```

A typical task is as short as: *"Implement the next unchecked ROADMAP_V2 item according to AGENTS.md."* The feature lifecycle behind that prompt is in [`IMPLEMENTATION_WORKFLOW.md`](docs/product/IMPLEMENTATION_WORKFLOW.md).

## Documentation

| Area | Document |
|---|---|
| Constitution | [`AGENTS.md`](AGENTS.md) |
| Product | [`PRODUCT_PRINCIPLES.md`](docs/product/PRODUCT_PRINCIPLES.md) · [`PRODUCT_DEBT.md`](docs/product/PRODUCT_DEBT.md) · [`IMPLEMENTATION_WORKFLOW.md`](docs/product/IMPLEMENTATION_WORKFLOW.md) |
| Roadmap | [`ROADMAP_V2.md`](docs/roadmap/ROADMAP_V2.md) |
| Design | [`DESIGN_SYSTEM.md`](docs/design/DESIGN_SYSTEM.md) |
| Architecture | [`ARCHITECTURE_OVERVIEW.md`](docs/architecture/ARCHITECTURE_OVERVIEW.md) · [`ARCHITECTURE_DECISIONS.md`](docs/decisions/ARCHITECTURE_DECISIONS.md) |
| Governance & Reference | [`OPEN_SOURCE_POLICY.md`](docs/governance/OPEN_SOURCE_POLICY.md) · [`REFERENCE_PRODUCTS.md`](docs/reference/REFERENCE_PRODUCTS.md) |
| Index | [`docs/README.md`](docs/README.md) |

## Status

DalyHub V2 is at its **foundation** stage: the product operating system (this documentation) is established, and implementation proceeds through [Phase 0 — Foundation](docs/roadmap/ROADMAP_V2.md#phase-0--foundation-fnd) of the roadmap. Progress is tracked by the status markers in [`ROADMAP_V2.md`](docs/roadmap/ROADMAP_V2.md).
