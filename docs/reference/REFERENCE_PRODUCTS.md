# REFERENCE_PRODUCTS.md — Products & Libraries DalyHub Studies

> The central reference catalogue. It records **what we've already learned from each reference product and candidate library** so agents don't repeatedly re-research the same things.
>
> Works with [`OPEN_SOURCE_POLICY.md`](../governance/OPEN_SOURCE_POLICY.md) (the rules for reuse) and the [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md) (where borrowed patterns land). Before researching a product or picking a library, **read this first**; after researching, **update it**.

---

## How to use and maintain this file

- **Two kinds of entries:**
  1. **Product inspirations** — what to *learn* (product/UX/interaction ideas). Some are closed-source or strong-copyleft: **study-only**, never copy code.
  2. **Reusable building blocks** — permissively-licensed libraries we may *depend on or adapt*, per the [reuse workflow](../governance/OPEN_SOURCE_POLICY.md#approved-reuse-workflow).
- **Licences are a snapshot, not gospel.** Every licence below is recorded to the best current knowledge and **must be re-verified against the exact version at reuse time** ([policy](../governance/OPEN_SOURCE_POLICY.md#licensing-rules)). If you verify one, note the date.
- **When you research anything here,** add findings (health, risks, licence confirmation) to its entry so the next agent inherits your work. New candidates get a new entry using the [template](#entry-template).

**Legend:** 🟢 reusable (permissive) · 🟡 reuse with recorded decision (weak copyleft) · 🔴 study-only (strong copyleft / closed).

---

## Product inspirations

### Notion — 🔴 study-only (closed source)
- **Why chosen.** The canonical "everything app": flexible records, linked databases, block editing, calm information density.
- **What DalyHub should learn.** Records-as-first-class-objects; relations between databases (informs [EntityLinks](../decisions/ARCHITECTURE_DECISIONS.md#adr-002-entitylinks)); block-based editing; restrained visual design.
- **Relevant modules.** Notes, Projects, the shared [Record Layout](../design/DESIGN_SYSTEM.md#record-header).
- **Repository / licence.** Closed source. No code reuse — pattern inspiration only.
- **Reusable patterns.** Linked-record UX, slash-command block insertion, database views as windows onto one dataset.
- **Risks.** Notion is *too* flexible — DalyHub deliberately provides opinionated structure (the [Area spine](../../AGENTS.md#4-the-area--goal--project--task-model)) instead of a blank canvas. Learn the polish, not the sprawl.

### Obsidian — 🔴 study-only (closed source; local Markdown files)
- **Why chosen.** Best-in-class local-first Markdown PKM with backlinks and graph thinking.
- **What DalyHub should learn.** Markdown-as-source-of-truth ([ADR-006](../decisions/ARCHITECTURE_DECISIONS.md#adr-006-markdown-strategy)); bidirectional links and backlinks ([NOTES-02](../roadmap/ROADMAP_V2.md#-notes-02--linking--backlinks)); ownership/portability ethos.
- **Relevant modules.** Notes, Diary, linking.
- **Repository / licence.** Closed source (plugin ecosystem is varied — check individual plugin licences before reuse).
- **Reusable patterns.** Backlink panels, `[[wikilink]]` linking affordances, local/portable data feel.
- **Risks.** Obsidian is file-centric; DalyHub is entity-centric. Borrow the linking/portability feel, not the file-tree mental model.

### Linear — 🔴 study-only (closed source)
- **Why chosen.** The gold standard for keyboard-driven speed, command palette, and calm-but-dense UI.
- **What DalyHub should learn.** [Command Palette](../design/DESIGN_SYSTEM.md#command-palette)-first interaction; instant optimistic UI; keyboard-complete workflows; restrained, fast design.
- **Relevant modules.** Command Palette, [Today](../roadmap/ROADMAP_V2.md#phase-2--today--execution-workspace-today), all keyboard workflows, [performance budgets](../../AGENTS.md#16-performance-expectations).
- **Repository / licence.** Closed source. Interaction inspiration only.
- **Reusable patterns.** `⌘K` everything, quick actions, snappy transitions, opinionated speed.
- **Risks.** Linear is a team issue tracker; DalyHub is a personal life OS. Borrow the *interaction model*, not the team-workflow features.

### Things 3 — 🔴 study-only (closed source)
- **Why chosen.** Exemplary personal task UX: calm, focused, beautifully restrained "Today" experience.
- **What DalyHub should learn.** The [Today/Execution](../roadmap/ROADMAP_V2.md#-today-01--execution-workspace) surface; Areas→Projects→Tasks structure (a direct cousin of our spine); gentle, non-nagging tone.
- **Relevant modules.** Today, Areas/Goals, Projects, Tasks.
- **Repository / licence.** Closed source. Product inspiration only.
- **Reusable patterns.** "Today" as the daily home, the Areas/Projects hierarchy, quiet completion feedback.
- **Risks.** Things has no cross-linking or knowledge layer — DalyHub goes further with [EntityLinks](../decisions/ARCHITECTURE_DECISIONS.md#adr-002-entitylinks) and Notes/People.

### Sunsama / Amie — 🔴 study-only (closed source)
- **Why chosen.** Daily planning rituals and calendar-integrated day design done calmly.
- **What DalyHub should learn.** [Planning](../roadmap/ROADMAP_V2.md#-today-04--planning) and [Review](../roadmap/ROADMAP_V2.md#phase-10--review-review) flows; intention-setting; a humane, unhurried pace.
- **Relevant modules.** Today → Planning, Review.
- **Repository / licence.** Closed source. Flow inspiration only.
- **Reusable patterns.** Guided daily planning, weekly review ritual, calendar-as-context.
- **Risks.** Heavy calendar coupling; DalyHub treats calendar as one input among many.

### AppFlowy — 🔴 study-only (AGPL-3.0)
- **Why chosen.** Open-source Notion alternative — useful to study *how* an entity/records product is structured.
- **What DalyHub should learn.** Data-model and view architecture for flexible records; grid/board/calendar views over one dataset.
- **Relevant modules.** Notes, Projects, views/filters.
- **Repository / licence.** `AppFlowy-IO/AppFlowy` — **AGPL-3.0 → study-only. Do not copy code or link it in** ([policy](../governance/OPEN_SOURCE_POLICY.md#licensing-rules)).
- **Reusable patterns (ideas only).** Record/view separation, filter/sort model. Implement independently.
- **Risks.** Strong copyleft — a real legal risk if code leaks in. Read for ideas, write your own.

### Logseq — 🔴 study-only (AGPL-3.0)
- **Why chosen.** Open outliner/PKM with blocks, backlinks, and daily-journal-first design — close to our Diary + Notes + linking model.
- **What DalyHub should learn.** Daily-journal-as-entry-point ([Diary](../roadmap/ROADMAP_V2.md#phase-9--diary-diary)); block references; backlinking.
- **Relevant modules.** Diary, Notes, linking.
- **Repository / licence.** `logseq/logseq` — **AGPL-3.0 → study-only.**
- **Reusable patterns (ideas only).** Journal-first capture, block/backlink UX.
- **Risks.** Same strong-copyleft caution as AppFlowy.

---

## Reusable building blocks (candidate libraries)

> These are *candidates*, not commitments. Adopt via the [reuse workflow](../governance/OPEN_SOURCE_POLICY.md#approved-reuse-workflow) and the [evaluation checklist](../governance/OPEN_SOURCE_POLICY.md#reusable-evaluation-checklist). **Re-verify the licence for the exact version before adopting.**

| Building block | Solves | Repo (typical) | Licence (verify!) | Notes / risks |
|---|---|---|---|---|
| **cmdk** | [Command Palette](../design/DESIGN_SYSTEM.md#command-palette) primitive | `pacocoursey/cmdk` | 🟢 MIT | Accessible, composable command menu. Strong fit for `DS-09`. |
| **Radix UI / primitives** | Accessible unstyled UI primitives (dialog, popover, tabs) | `radix-ui/primitives` | 🟢 MIT | Backbone for accessible [Design System](../design/DESIGN_SYSTEM.md) components. |
| **shadcn/ui** | Copy-in component patterns over Radix + utility CSS | `shadcn-ui/ui` | 🟢 MIT | Components are *copied in* (provenance comment + record the source). |
| **Tiptap / ProseMirror** | Rich Markdown editor | `ueberdosis/tiptap`, `ProseMirror/*` | 🟢 MIT | Core for the [Markdown editor](../roadmap/ROADMAP_V2.md#-notes-01--note-record--markdown-editor). Check which extensions/versions. |
| **remark / rehype / react-markdown** | Markdown parse + safe render | `remarkjs/*`, `rehypejs/*` | 🟢 MIT | Feeds the sanitising renderer ([ADR-006](../decisions/ARCHITECTURE_DECISIONS.md#adr-006-markdown-strategy)); pair with a sanitiser. |
| **dnd-kit** | Accessible drag-and-drop | `clauderic/dnd-kit` | 🟢 MIT | For reordering/scheduling with keyboard equivalents ([DS-04](../design/DESIGN_SYSTEM.md#cards)). |
| **TanStack Query / Table / Virtual** | Data fetching, tables, list virtualisation | `TanStack/*` | 🟢 MIT | Virtualisation for [Timeline/Activity/Search](../../AGENTS.md#16-performance-expectations). |
| **date-fns** | Date math | `date-fns/date-fns` | 🟢 MIT | Lightweight, tree-shakeable date utilities. |
| **Lucide** | Icon set | `lucide-icons/lucide` | 🟢 ISC | Consistent iconography ([Foundations](../design/DESIGN_SYSTEM.md#foundations)). |
| **Zod** (or similar) | Runtime validation | `colinhacks/zod` | 🟢 MIT | Validate boundaries/imports ([security](../../AGENTS.md#17-security-requirements)). |
| **A Markdown sanitiser** (e.g. rehype-sanitize / DOMPurify) | XSS-safe rendering | various | 🟢 MIT (verify) | Mandatory for the [Markdown pipeline](../decisions/ARCHITECTURE_DECISIONS.md#adr-006-markdown-strategy). |

> **Platform note.** The application platform and toolchain are now settled in [ADR-008](../decisions/ARCHITECTURE_DECISIONS.md#adr-008-initial-application-platform-and-toolchain) (Cloudflare Workers + React Router v8 + Vite + Wrangler; see the verified scaffold findings below). Cloudflare **storage** services (D1, KV, R2, Durable Objects) remain a proposed, deferred direction (see [`ARCHITECTURE_OVERVIEW.md`](../architecture/ARCHITECTURE_OVERVIEW.md#platform)); their SDKs/tooling are evaluated the same way when adopted. Todoist and Notion are **import/sync sources** ([X-03](../roadmap/ROADMAP_V2.md#-x-03--import--sync-todoist-notion-calendar)), not dependencies to reuse code from.

---

## Verified scaffolds / starters

### Cloudflare `create-cloudflare` React Router starter — 🟢 reusable (MIT)
- **Why chosen.** The official, first-party way to scaffold a full-stack React Router app that runs on Cloudflare Workers. Used as the reference scaffold for [FND-01](../roadmap/ROADMAP_V2.md#-fnd-01--repository--toolchain-scaffold) / [ADR-008](../decisions/ARCHITECTURE_DECISIONS.md#adr-008-initial-application-platform-and-toolchain).
- **What DalyHub should learn.** The canonical wiring of React Router v8 (framework mode, SSR) + the Cloudflare Vite plugin + Wrangler, including the Workers entry adapter (`workers/app.ts`), `entry.server.tsx` streaming render, and the split `tsconfig` project references.
- **Relevant modules.** Whole-app foundation; every later module builds on this scaffold.
- **Repository / licence.** Generated via `npm create cloudflare@latest -- --framework=react-router` (C3). Template and the React Router project it derives from are **MIT** — verified against the generated `node_modules/react-router/LICENSE.md` and package metadata on **2026-07-17**. Reusable (permissive); provenance recorded in [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md) and inline comments in the adapted files.
- **Reusable code.** Config and entry files adapted directly (with provenance comments): `vite.config.ts`, `react-router.config.ts`, `workers/app.ts`, `app/entry.server.tsx`, `app/root.tsx`, and the `tsconfig.*` project references.
- **Reusable interaction patterns.** N/A (toolchain, not UX).
- **Risks.** The template ships extras not needed for a restrained foundation — **Tailwind CSS**, a demo "welcome" page with branding/logos, and Google Fonts links. All were removed to avoid pre-empting the design system (DS-01) and to keep the dependency footprint minimal. The C3 generator is interactive and can overwrite a directory; we generated into a throwaway temp dir and integrated files selectively, never running it over this repo.
- **Research notes (2026-07-17).** Verified current versions on npm: `react-router` 8.2.0 latest (template pins 8.0.0), `@cloudflare/vite-plugin` 1.45.1, `wrangler` 4.112.0, `vite` 8.1.5, `react` 19.2.7, `typescript` 5.9.3 (template pin; TS 7.0.2 exists but tooling targets 5.x — not adopted). `vite preview` serves the built app in the Workers runtime locally, which the Playwright smoke test relies on. All bundled/dev dependencies are permissive (MIT / Apache-2.0 / ISC); no copyleft in the tree.

---

## Entry template

Copy this to add a new reference product or building block:

```markdown
### <Name> — 🟢/🟡/🔴 <reuse status> (<licence>)
- **Why chosen.** <the specific reason it's worth studying/using>
- **What DalyHub should learn.** <concrete lessons / patterns>
- **Relevant modules.** <which DalyHub modules this informs>
- **Repository / licence.** <url> — <licence + reuse category; note verification date>
- **Reusable code.** <what could be depended on/adapted, or "ideas only">
- **Reusable interaction patterns.** <UX patterns to borrow>
- **Risks.** <licence, maintenance, fit, or philosophical mismatches>
- **Research notes.** <health/CVEs/findings + date, so it isn't re-researched>
```

---

## Related documents
- [`OPEN_SOURCE_POLICY.md`](../governance/OPEN_SOURCE_POLICY.md) — the rules governing everything catalogued here.
- [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md) — where borrowed interaction patterns are formalised.
- [`ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md) — the items these references inform.
- [`docs/README.md`](../README.md) — documentation index.
