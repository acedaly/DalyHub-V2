# DalyHub

**DalyHub is a Personal Operating System — one calm, coherent place to run a life.**

It sits above task managers, note apps, calendars, and contact lists as the layer where the pieces of a life connect: responsibilities, intentions, work, people, knowledge, and reflection — one model, cross-linked, searchable, and owned by you. This repository is **DalyHub V2**, the redevelopment built on a shared design language, a shared data model, and an AI layer that *proposes* rather than acts.

> **Current release: DalyHub V2 (`2.0.1`).** The V2 roadmap is **closed** — see the
> [V2 release notes](docs/release/RELEASE_NOTES_V2.md) for what shipped and the
> [V2 release checklist](docs/release/RELEASE_CHECKLIST_V2.md) for the evidence behind
> it. `2.0.1` is a **hotfix and release-hardening release** on top of V2 (not V2.1):
> [V2.0.1 release notes](docs/release/RELEASE_NOTES_V2_0_1.md) ·
> [V2.0.1 checklist & runbook](docs/release/RELEASE_CHECKLIST_V2_0_1.md).
> Work since then is tracked in [`ROADMAP_V2_1.md`](docs/roadmap/ROADMAP_V2_1.md) and,
> for the current programme, [`ROADMAP_V2_2.md`](docs/roadmap/ROADMAP_V2_2.md).

> **What is this repository?** It is the **product operating system** for DalyHub — the documentation, governance, and roadmap that drive development, alongside the application itself. DalyHub is built by implementing the roadmap one item at a time, guided by the [constitution](AGENTS.md). The repository itself is the project's long-term memory.

---

## Start here

Read these three, in order — that's enough to contribute:

1. **[`AGENTS.md`](AGENTS.md)** — the constitution: product vision, engineering standards, architecture philosophy, licensing rules, and the Definition of Done.
2. **[`docs/product/PRODUCT_PRINCIPLES.md`](docs/product/PRODUCT_PRINCIPLES.md)** — what DalyHub is, why it exists, and how it should feel.
3. **[`docs/roadmap/ROADMAP_V2.md`](docs/roadmap/ROADMAP_V2.md)** — what V2 is, item by item, now closed; **[`ROADMAP_V2_1.md`](docs/roadmap/ROADMAP_V2_1.md)** — the V2.1 work; and **[`ROADMAP_V2_2.md`](docs/roadmap/ROADMAP_V2_2.md)** — the current programme.

The full map is in **[`docs/README.md`](docs/README.md)**.

## The core idea

DalyHub organises a life along a single backbone — **Area → Goal → Project → Task** — with supporting entities (**Notes, Meetings, People, Assets, Diary, Review**) woven across it through typed links, and one shared design language so learning one module teaches you all of them. An **AI** layer runs over that same model and **proposes**: it drafts structured, reviewable changes you accept, edit or reject in whole or in part, and never writes to your data on its own.

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

A typical task is as short as: *"Implement the next unchecked roadmap item according to AGENTS.md."* Since the V2 closure, "the roadmap" means the current programme — [`ROADMAP_V2_2.md`](docs/roadmap/ROADMAP_V2_2.md), with [`ROADMAP_V2_1.md`](docs/roadmap/ROADMAP_V2_1.md) still holding the V2.1 items that have not been superseded. The feature lifecycle behind that prompt is in [`IMPLEMENTATION_WORKFLOW.md`](docs/product/IMPLEMENTATION_WORKFLOW.md).

## Running the app

The application is a React Router v8 (framework mode) app on **Cloudflare
Workers**, built with Vite and the Cloudflare Vite plugin, managed with pnpm via
Corepack and Wrangler ([ADR-008](docs/decisions/ARCHITECTURE_DECISIONS.md#adr-008-initial-application-platform-and-toolchain)).

**Prerequisites:** Node.js 22+ (see [`.nvmrc`](.nvmrc)). pnpm comes via Corepack.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev            # http://localhost:5173 — the application, in the Workers runtime
pnpm verify         # full local quality suite: format, lint, types, tests, build, e2e
```

| Command             | What it does                                              |
| ------------------- | -------------------------------------------------------- |
| `pnpm dev`          | Dev server in the Workers runtime                        |
| `pnpm build`        | Production build                                         |
| `pnpm lint`         | ESLint                                                   |
| `pnpm format`       | Apply Prettier · `format:check` verifies                 |
| `pnpm typecheck`    | Cloudflare types + React Router typegen + `tsc`          |
| `pnpm test`         | Unit/component tests, then the kernel suite (Vitest + RTL, Workers runtime + local D1) |
| `pnpm test:e2e`     | The Playwright journey suite (Chromium)                  |
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
| Roadmap | [`ROADMAP_V2.md`](docs/roadmap/ROADMAP_V2.md) (closed) · [`ROADMAP_V2_1.md`](docs/roadmap/ROADMAP_V2_1.md) · [`ROADMAP_V2_2.md`](docs/roadmap/ROADMAP_V2_2.md) (current) |
| Design | [`DESIGN_SYSTEM.md`](docs/design/DESIGN_SYSTEM.md) |
| Architecture | [`ARCHITECTURE_OVERVIEW.md`](docs/architecture/ARCHITECTURE_OVERVIEW.md) · [`ARCHITECTURE_DECISIONS.md`](docs/decisions/ARCHITECTURE_DECISIONS.md) |
| Governance & Reference | [`OPEN_SOURCE_POLICY.md`](docs/governance/OPEN_SOURCE_POLICY.md) · [`REFERENCE_PRODUCTS.md`](docs/reference/REFERENCE_PRODUCTS.md) |
| Development | [`SETUP_AND_CI.md`](docs/development/SETUP_AND_CI.md) · [`DEPLOYMENT.md`](docs/development/DEPLOYMENT.md) |
| Index | [`docs/README.md`](docs/README.md) |

## Status

DalyHub V2 is a **working personal planning and knowledge system**, deployed to Cloudflare Workers and used daily. The foundation (entities, workspaces, EntityLinks, activity, the module registry, the Area→Goal→Project→Task spine, the Markdown pipeline, auth) is complete, every module is built, and the shared design system is converged across all of them.

**What DalyHub does today.**

- **Today** — a daily command centre: what needs attention, what you planned, and the projects to continue.
- **Tasks** — the daily driver: quick capture, banded lists with grouping, sorting and sixteen filter dimensions, saved views, inline row editing, bulk actions, recurrence with two scheduling modes, and Inbox as a first-class destination for anything not yet filed.
- **Projects, Areas & Goals** — the spine, with rollup, workflow status, archive/restore, derived project health and a Goals alignment view.
- **Notes** — a writing-first Markdown editor with backlinks and knowledge links; **Diary**; **Meetings** with follow-up-to-Task conversion; **People** with one unified relationship timeline; **Assets** with history, renewals and obligations; **Reviews**; **Analytics**; and Settings.
- **Across everything** — cross-module search and saved views, the Command Palette, a global feedback layer, full workspace **export**, **backup and restore**, an installable **PWA with offline capture**, and **capture from your phone** by Shortcut, Siri, the iOS Share Sheet or a forwarded email.
- **AI** — a proposal layer over the same model: it suggests structured changes you accept, edit or reject, and never writes on its own. Provider API keys are server secrets and are never entered in the app.
- **Appearance** — five generated colour schemes over one design system, each with a first-class light and dark pair, chosen independently of the System/Light/Dark appearance preference.

All of it is composed from one shared design system — Record Layout, Cards, Drawer, Filters, Forms, Timeline, Search — over a single data kernel, with a WCAG 2.2 AA and responsive baseline enforced by an automated axe-core, no-overflow and keyboard regression gate.

**In active development.** Targeted hardening and feature work against the shared design system rather than another whole-app redesign: reliability of the release gate and the daily-driver polish tracked in [`ROADMAP_V2_2.md`](docs/roadmap/ROADMAP_V2_2.md).

**Next.** Deterministic natural-language capture v2, an offline Task mutation slice beyond capture, and Focus-panel refinement — see [`ROADMAP_V2_2.md`](docs/roadmap/ROADMAP_V2_2.md#next).

The honest, item-by-item picture — including what is only partly delivered — lives in [`ROADMAP_V2.md`](docs/roadmap/ROADMAP_V2.md) (closed), [`ROADMAP_V2_1.md`](docs/roadmap/ROADMAP_V2_1.md) and [`ROADMAP_V2_2.md`](docs/roadmap/ROADMAP_V2_2.md) (current), with known gaps recorded in [`PRODUCT_DEBT.md`](docs/product/PRODUCT_DEBT.md).
