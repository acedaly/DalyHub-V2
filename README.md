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

DalyHub V2 has completed [Phase 0 — Foundation](docs/roadmap/ROADMAP_V2.md#phase-0--foundation-fnd) (the kernel: entities, workspaces, EntityLinks, activity, the module registry, the spine, the Markdown pipeline, and the app shell + auth, with a verified Cloudflare production deployment) and is building the [Shared Design System](docs/roadmap/ROADMAP_V2.md#phase-1--shared-design-system-ds) and Product Frame. Shipped so far: design tokens, the Record Layout, Drawer, Cards, Filters, Timeline/Activity Feed, Forms, Search, the Command Palette, the **global interaction layer** ([DS-10](docs/roadmap/ROADMAP_V2.md#-ds-10--inspector-settings-and-feedback-states) — notifications, undo, background operations and the shared Inspector), and the **accessibility & responsive baseline** ([DS-11](docs/roadmap/ROADMAP_V2.md#-ds-11--accessibility--responsive-baseline) — WCAG 2.2 AA + responsive behaviour audited and enforced by an automated axe-core + no-overflow + keyboard regression gate in CI; see [`ACCESSIBILITY_RESPONSIVE.md`](docs/development/ACCESSIBILITY_RESPONSIVE.md)), plus the Today dashboard. The app, tests (unit + Workers/D1 integration + Playwright + automated accessibility), and CI run green. Progress is tracked by the status markers in [`ROADMAP_V2.md`](docs/roadmap/ROADMAP_V2.md).
