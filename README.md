# DalyHub

**DalyHub is a Personal Operating System — one calm, coherent place to run a life.**

It sits above task managers, note apps, calendars, and contact lists as the layer where the pieces of a life connect: responsibilities, intentions, work, people, knowledge, and reflection — one model, cross-linked, searchable, and owned by you. This repository is **DalyHub V2**, the redevelopment built on a shared design language, a shared data model, and an AI layer that *proposes* rather than acts.

> **Current release: DalyHub V2 (`2.0.1`).** The V2 roadmap is **closed** — see the
> [V2 release notes](docs/release/RELEASE_NOTES_V2.md) for what shipped, the
> [V2 release checklist](docs/release/RELEASE_CHECKLIST_V2.md) for the evidence behind
> it, and [`ROADMAP_V2_1.md`](docs/roadmap/ROADMAP_V2_1.md) for what comes next.
> `2.0.1` is a **hotfix and release-hardening release** on top of V2 (not V2.1):
> [V2.0.1 release notes](docs/release/RELEASE_NOTES_V2_0_1.md) ·
> [V2.0.1 checklist & runbook](docs/release/RELEASE_CHECKLIST_V2_0_1.md).
> Backup and restore is deliberately **not** in V2: V2 ships a full, verifiable
> export, and restore is targeted at V2.1 — keep your own copy of an export until it lands.

> **What is this repository?** It is the **product operating system** for DalyHub — the documentation, governance, and roadmap that drive development, alongside the application itself. DalyHub is built by implementing the roadmap one item at a time, guided by the [constitution](AGENTS.md). The repository itself is the project's long-term memory.

---

## Start here

Read these three, in order — that's enough to contribute:

1. **[`AGENTS.md`](AGENTS.md)** — the constitution: product vision, engineering standards, architecture philosophy, licensing rules, and the Definition of Done.
2. **[`docs/product/PRODUCT_PRINCIPLES.md`](docs/product/PRODUCT_PRINCIPLES.md)** — what DalyHub is, why it exists, and how it should feel.
3. **[`docs/roadmap/ROADMAP_V2.md`](docs/roadmap/ROADMAP_V2.md)** — what V2 is, item by item, now closed; and **[`docs/roadmap/ROADMAP_V2_1.md`](docs/roadmap/ROADMAP_V2_1.md)** — what we build next.

The full map is in **[`docs/README.md`](docs/README.md)**.

## The core idea

DalyHub organises a life along a single backbone — **Area → Goal → Project → Task** — with supporting entities (**Notes, Meetings, People, Assets, Diary, Review**) woven across it through typed links, and one shared design language so learning one module teaches you all of them. An **AI** layer that proposes changes for you to approve is the architecture's stated destination; it is **not** built, and `/ai` says so.

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

A typical task is as short as: *"Implement the next unchecked roadmap item according to AGENTS.md."* Since the V2 closure, "the roadmap" means [`ROADMAP_V2_1.md`](docs/roadmap/ROADMAP_V2_1.md). The feature lifecycle behind that prompt is in [`IMPLEMENTATION_WORKFLOW.md`](docs/product/IMPLEMENTATION_WORKFLOW.md).

## Running the app

The application is a React Router v8 (framework mode) app on **Cloudflare
Workers**, built with Vite and the Cloudflare Vite plugin, managed with pnpm via
Corepack and Wrangler ([ADR-008](docs/decisions/ARCHITECTURE_DECISIONS.md#adr-008-initial-application-platform-and-toolchain)).

**Prerequisites:** Node.js 22+ (see [`.nvmrc`](.nvmrc)). pnpm comes via Corepack.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev            # http://localhost:5173 — foundation page + /health
pnpm verify         # full local quality suite: format, lint, types, tests, build, e2e
```

| Command             | What it does                                              |
| ------------------- | -------------------------------------------------------- |
| `pnpm dev`          | Dev server in the Workers runtime                        |
| `pnpm build`        | Production build                                         |
| `pnpm lint`         | ESLint                                                   |
| `pnpm format`       | Apply Prettier · `format:check` verifies                 |
| `pnpm typecheck`    | Cloudflare types + React Router typegen + `tsc`          |
| `pnpm test`         | Unit/component tests (Vitest + RTL)                      |
| `pnpm test:e2e`     | Playwright Chromium smoke test                           |
| `pnpm verify`       | All of the above, in a deterministic order               |
| `pnpm deploy:dry-run`   | Build + `wrangler deploy --dry-run` (no creds, CI-safe)  |
| `pnpm deploy:production` | Guarded live production deploy (needs creds + real config) |

Full details: [`docs/development/SETUP_AND_CI.md`](docs/development/SETUP_AND_CI.md)
and [`docs/development/DEPLOYMENT.md`](docs/development/DEPLOYMENT.md).

## Documentation

| Area | Document |
|---|---|
| Constitution | [`AGENTS.md`](AGENTS.md) |
| Product | [`PRODUCT_PRINCIPLES.md`](docs/product/PRODUCT_PRINCIPLES.md) · [`PRODUCT_DEBT.md`](docs/product/PRODUCT_DEBT.md) · [`IMPLEMENTATION_WORKFLOW.md`](docs/product/IMPLEMENTATION_WORKFLOW.md) |
| Roadmap | [`ROADMAP_V2.md`](docs/roadmap/ROADMAP_V2.md) |
| Design | [`DESIGN_SYSTEM.md`](docs/design/DESIGN_SYSTEM.md) |
| Architecture | [`ARCHITECTURE_OVERVIEW.md`](docs/architecture/ARCHITECTURE_OVERVIEW.md) · [`ARCHITECTURE_DECISIONS.md`](docs/decisions/ARCHITECTURE_DECISIONS.md) |
| Governance & Reference | [`OPEN_SOURCE_POLICY.md`](docs/governance/OPEN_SOURCE_POLICY.md) · [`REFERENCE_PRODUCTS.md`](docs/reference/REFERENCE_PRODUCTS.md) |
| Development | [`SETUP_AND_CI.md`](docs/development/SETUP_AND_CI.md) · [`DEPLOYMENT.md`](docs/development/DEPLOYMENT.md) |
| Index | [`docs/README.md`](docs/README.md) |

## Status

DalyHub V2 is a **working personal planning and knowledge system**, deployed to Cloudflare Workers and used daily. Its foundation (entities, workspaces, EntityLinks, activity, the module registry, the Area→Goal→Project→Task spine, the Markdown pipeline, auth) and its shared design system are complete, and most modules are built. Integration between modules, mobile completion, export, recovery and platform capabilities are the work that remains.

**Implemented.** Today (a personalisable daily command centre), Tasks (workspace-wide capture, planning and execution with an Eisenhower Matrix and Time Sectors), Projects, Areas & Goals with a derived alignment view, Notes with a writing-first Markdown editor, Diary, Meetings with follow-up-to-Task conversion, People, Assets, Reviews, and core Settings. Everything is composed from one shared design system — Record Layout, Cards, Drawer, Filters, Forms, Timeline, Search, Command Palette and the global feedback layer — over a single data kernel, with a WCAG 2.2 AA and responsive baseline enforced by an automated axe-core, no-overflow and keyboard regression gate.

**In active development.** Cross-module integration is the current focus: a unified People relationship timeline that Meetings contribute to, Notes backlinks and organisation/search, wiring Today's Quick Capture to real task creation, a consistent record-lifecycle pattern across every module, and Asset history and renewals.

**Planned platform capabilities.** Full export and data portability, then backup and restore; mature global search and saved views across modules; per-module mobile completion; optional imports and integrations; and last, an AI layer that **proposes** changes for you to review, edit, accept or reject — never one that silently writes to your data.

The honest, item-by-item picture — including what is only partly delivered — lives in [`ROADMAP_V2.md`](docs/roadmap/ROADMAP_V2.md), with known gaps recorded in [`PRODUCT_DEBT.md`](docs/product/PRODUCT_DEBT.md).
