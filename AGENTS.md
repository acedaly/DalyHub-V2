# AGENTS.md — The DalyHub Constitution

> This is the authoritative engineering and product guide for DalyHub.
> If any other document, comment, or prompt conflicts with this file, **this file wins** — unless a later, explicitly-dated decision in [`docs/decisions/ARCHITECTURE_DECISIONS.md`](docs/decisions/ARCHITECTURE_DECISIONS.md) supersedes it.
>
> Read this before writing any code. It is designed to answer almost every design question before implementation begins.

**Audience:** Every human and AI agent that contributes to DalyHub.
**Purpose:** Convert DalyHub from a prompt-driven project into a repository-driven project. The repository — not the owner's memory — is the long-term memory of the product.

---

## 0. How to use this repository

DalyHub is designed so that future work needs **minimal prompting**. The intended workflow is:

```
AGENTS.md  →  ROADMAP_V2.md  →  a small implementation prompt
```

A typical future prompt should be as short as:

> "Implement the next unchecked ROADMAP_V2 item according to AGENTS.md."

If you ever feel you need a long prompt to do a piece of work, that is a **documentation bug**. Fix the documentation (see [Development Workflow](#12-development-workflow)) so the next agent doesn't need it.

### The document map

| Document | Answers the question |
|---|---|
| [`AGENTS.md`](AGENTS.md) (this file) | How do we build DalyHub, and what does "good" mean? |
| [`docs/product/PRODUCT_PRINCIPLES.md`](docs/product/PRODUCT_PRINCIPLES.md) | What is DalyHub, why does it exist, and how should it feel? |
| [`docs/roadmap/ROADMAP_V2.md`](docs/roadmap/ROADMAP_V2.md) | What are we building next, and in what order? |
| [`docs/design/DESIGN_SYSTEM.md`](docs/design/DESIGN_SYSTEM.md) | What are the shared interaction patterns every module reuses? |
| [`docs/governance/OPEN_SOURCE_POLICY.md`](docs/governance/OPEN_SOURCE_POLICY.md) | When and how do we reuse open-source code, and how do we handle licensing? |
| [`docs/reference/REFERENCE_PRODUCTS.md`](docs/reference/REFERENCE_PRODUCTS.md) | Which products do we study, and what do we learn from each? |
| [`docs/product/PRODUCT_DEBT.md`](docs/product/PRODUCT_DEBT.md) | What is inconsistent today, and what is the target state? |
| [`docs/decisions/ARCHITECTURE_DECISIONS.md`](docs/decisions/ARCHITECTURE_DECISIONS.md) | Why is the system built the way it is? |
| [`docs/architecture/ARCHITECTURE_OVERVIEW.md`](docs/architecture/ARCHITECTURE_OVERVIEW.md) | How do the pieces fit together technically? |
| [`docs/product/IMPLEMENTATION_WORKFLOW.md`](docs/product/IMPLEMENTATION_WORKFLOW.md) | What is the lifecycle of a single feature, step by step? |
| [`docs/README.md`](docs/README.md) | Where is everything? (documentation index) |

---

## 1. Product vision

**DalyHub is a Personal Operating System: one calm, coherent place to run a life.**

Most people's lives are scattered across a dozen tools — tasks in one app, notes in another, meetings in a calendar, contacts in a phone, documents in cloud drives, reflection nowhere. DalyHub's vision is to make the *whole* of a person's life legible and operable from a single, unhurried surface, where everything is connected and nothing is lost.

DalyHub is not a task manager, a note app, or a CRM. It is the layer *above* those categories — the operating system on which the modules of a life run. Version 2 is the redevelopment that makes that promise real: a shared design language, a shared data model, and an AI layer that helps you steer rather than nag.

We are building for depth of a single life well-run, not breadth of a market. The primary user is the owner. Every decision optimises for **a person who wants to think clearly and act deliberately over years**, not for a demo.

---

## 2. Product philosophy

1. **The system is the memory.** If it isn't captured in DalyHub, it doesn't exist. The product's first job is to be a trustworthy place to put everything.
2. **Structure serves clarity, not bureaucracy.** The Area → Goal → Project → Task hierarchy exists to make life legible, never to create busywork. If structure isn't earning its keep, remove it.
3. **Everything is connected.** A meeting produces tasks. A task belongs to a project. A project serves a goal. A person recurs across all of them. DalyHub's value is in the links, not the lists.
4. **Calm over urgent.** The product should reduce anxiety, not manufacture it. No red badges competing for attention, no dark patterns, no manufactured streaks. Attention is the user's scarcest resource; we spend it carefully.
5. **The user is always in control.** Especially of the AI. DalyHub proposes; the user disposes. See [AI philosophy](#8-ai-philosophy).
6. **Consistency compounds.** A shared design system means learning one module teaches you all of them. Reused patterns are a feature, not a shortcut.
7. **Own the data.** Markdown for text, portable formats, export always possible. The user should never feel locked in.

The fuller expression of this philosophy lives in [`PRODUCT_PRINCIPLES.md`](docs/product/PRODUCT_PRINCIPLES.md). This section is the summary an implementer needs.

---

## 3. Personal Operating System principles

DalyHub treats "operating system" literally as a design metaphor:

- **Kernel = the shared data model.** Entities, links, activity, and workspaces are the kernel. Modules are userland. The kernel is small, stable, and rarely changes; modules are where features live. See [Architecture philosophy](#9-architecture-philosophy).
- **Modules are processes.** Each module (Today, Projects, Notes, …) is self-contained, registers itself with the module registry, and speaks to the rest of the system only through shared, typed contracts.
- **The record is the file.** Every entity is a first-class "record" with a consistent header, body, and history — the way files are first-class in an OS.
- **The command palette is the shell.** Anything you can do by clicking, you can do by typing. Power comes from a consistent command surface, not from memorising menus.
- **Views are windows onto the same data.** Today, a project's task list, and a filtered search are all windows onto the same underlying tasks. There is one source of truth per entity; views never fork it.

---

## 4. The Area → Goal → Project → Task model

This is the spine of DalyHub. Every implementer must understand it.

```
Area        ongoing domain of life        (Health, Career, Home, Finance)   — no end date
  └ Goal    desired outcome with a target (Run a half-marathon)             — has completion criteria
      └ Project   finite body of work     (12-week training plan)           — has a definite end
          └ Task  atomic unit of action   (Monday: 5km easy run)            — done or not done
```

Rules of the model:

- **Areas** are permanent and few. They are the top-level buckets of a life. They never "complete."
- **Goals** are optional and aspirational. A Goal expresses a direction and a definition of success. Not all work needs a Goal.
- **Projects** are finite and outcome-shaped. A Project can sit directly under an Area (no Goal required) or advance a Goal.
- **Tasks** are the only thing you actually *do*. A Task belongs to a Project, or floats directly in an Area for one-off actions.
- **Everything rolls up.** Completing tasks advances projects; advancing projects moves goals; goals give areas momentum. The rollup is how the system shows you whether your daily actions match your stated intentions.

Supporting entity types (**Notes, Meetings, People, Assets, Diary, Review, AI**) attach *across* this spine via [EntityLinks](#95-entitylinks). A Meeting can spawn Tasks; a Note can document a Project; a Person can be linked to a Goal. The spine gives structure; the links give life.

Full semantic definitions of every entity live in [`PRODUCT_PRINCIPLES.md`](docs/product/PRODUCT_PRINCIPLES.md#the-entities).

---

## 5. Relationship philosophy

DalyHub models a life, and lives contain people. People are not a bolt-on CRM; they are woven through the system.

- **People are first-class entities**, linked to Meetings, Projects, Tasks, Notes, and Diary entries.
- **Relationships are remembered, not managed.** The goal is to help the user be a better friend, colleague, and family member — to remember what matters to people — not to run a sales pipeline. Language and UX must reflect care, never extraction.
- **History is the point.** The value of a Person record is the accumulated timeline: meetings had, commitments made, things learned. Every module that touches a Person contributes to that shared timeline.
- **Privacy is sacred.** People data is the most sensitive data in the system. It never leaves the user's control, never trains an external model, and is surfaced only to the owner. See [Security requirements](#17-security-requirements).

---

## 6. UX philosophy

- **One layout to learn.** Every record — a task, a project, a person, a note — uses the same [Record Layout](docs/design/DESIGN_SYSTEM.md#record-header): header, summary, tabs, timeline, activity. Learn it once, know it everywhere.
- **Progressive disclosure.** Show the essential first; reveal depth on demand. The [Drawer](docs/design/DESIGN_SYSTEM.md#drawer) and [Inspector](docs/design/DESIGN_SYSTEM.md#inspector) exist so the user is never overwhelmed and never blocked.
- **Density with air.** DalyHub is an information-dense product for a power user, but density is not clutter. Whitespace, hierarchy, and typography do the work.
- **Never lose the user's place.** Navigation preserves context. Opening a task from Today should not throw away where you were. Back always works. State is restored.
- **No dead ends.** Every empty state teaches the next action. Every error explains the recovery. See [Empty States](docs/design/DESIGN_SYSTEM.md#empty-states) and [Error Feedback](docs/design/DESIGN_SYSTEM.md#error-feedback).
- **Calm defaults.** Muted palette, restrained motion, no gratuitous notifications. Motion communicates causality (this became that), never decoration.

---

## 7. Interaction philosophy

- **Keyboard-first, mouse-friendly.** Every primary action has a keyboard path. The [Command Palette](docs/design/DESIGN_SYSTEM.md#command-palette) (`⌘K`) is the universal entry point; [Quick Actions](docs/design/DESIGN_SYSTEM.md#quick-actions) cover the frequent ones.
- **Direct manipulation where it helps.** Drag to reorder, drag to reschedule, inline-edit in place. But never *only* drag — there is always a keyboard equivalent.
- **Optimistic and reversible.** Actions apply immediately and are undoable. The system trusts the user and lets them trust it back. Prefer undo over confirmation dialogs.
- **Speak in the user's nouns.** The interface uses Areas, Goals, Projects, Tasks, People — the product's vocabulary — consistently, everywhere. No synonyms, no drift.
- **Fast is a feature.** Interactions should feel instantaneous. See [Performance expectations](#16-performance-expectations).

---

## 8. AI philosophy

DalyHub's AI is a **proposer, never an autonomous actor**. This is a hard architectural and ethical rule.

- **Propose, don't mutate.** The AI layer emits *proposals* — structured, reviewable suggested changes (create these tasks, link these entities, draft this note). Nothing is written to the user's data until the user approves it. See [ADR-004: AI Proposal Architecture](docs/decisions/ARCHITECTURE_DECISIONS.md#adr-004-ai-proposal-architecture).
- **Every proposal is legible.** The user always sees exactly what will change, why it was suggested, and can accept, edit, or reject — in whole or in part.
- **The AI works over the model, not around it.** It reads and proposes changes to the same Areas/Goals/Projects/Tasks/links every human action touches. It has no secret side-channel state.
- **Assistive, not manipulative.** The AI helps the user think and plan. It never uses persuasion techniques, never invents urgency, never optimises for engagement.
- **Privacy-preserving by default.** Sensitive entities (People, Diary) are excluded from external model context unless the user explicitly opts in for a specific action. See [Security](#17-security-requirements).
- **Fail honest.** When the AI is unsure, it says so. It never fabricates data, links, or citations. A wrong-but-confident proposal is worse than no proposal.

---

## 9. Architecture philosophy

Architecture exists to keep the product **coherent as it grows**. The rules below are load-bearing; changing them requires a new ADR.

Full technical detail: [`docs/architecture/ARCHITECTURE_OVERVIEW.md`](docs/architecture/ARCHITECTURE_OVERVIEW.md). The *why* behind each choice: [`docs/decisions/ARCHITECTURE_DECISIONS.md`](docs/decisions/ARCHITECTURE_DECISIONS.md).

### 9.1 Small kernel, modular userland
The shared kernel — entities, EntityLinks, Activity, Workspaces, the module registry — is deliberately small and stable. Features live in modules built on top of it. Modules must not reach into each other's internals; they communicate through the kernel's typed contracts.

### 9.2 Module registry
Every module self-registers: its routes, its entity types, its commands (for the palette), its search providers, and its settings. Adding a module should not require editing a central switch statement. See [ADR-007: Module Registry](docs/decisions/ARCHITECTURE_DECISIONS.md#adr-007-module-registry).

### 9.3 The Area hierarchy is the backbone
The Area → Goal → Project → Task hierarchy is a first-class kernel concept, not a per-module convention. See [ADR-001: Area Hierarchy](docs/decisions/ARCHITECTURE_DECISIONS.md#adr-001-area-hierarchy).

### 9.4 Workspace isolation
Data belongs to a workspace. A workspace is the top-level isolation boundary — queries, permissions, and search are scoped to it. This keeps contexts (e.g. personal vs. a side venture) cleanly separable. See [ADR-003: Workspace Isolation](docs/decisions/ARCHITECTURE_DECISIONS.md#adr-003-workspace-isolation).

### 9.5 EntityLinks
Any entity can be linked to any other through typed, bidirectional **EntityLinks**. Links are a kernel primitive, not a per-module feature, so a link created in Meetings is visible in Projects with no extra work. See [ADR-002: EntityLinks](docs/decisions/ARCHITECTURE_DECISIONS.md#adr-002-entitylinks).

### 9.6 Shared activity model
Every meaningful change to any entity appends to a single, uniform **Activity** stream. The [Activity Feed](docs/design/DESIGN_SYSTEM.md#activity-feed) and [Timeline](docs/design/DESIGN_SYSTEM.md#timeline) render this one model everywhere. See [ADR-005: Shared Activity Model](docs/decisions/ARCHITECTURE_DECISIONS.md#adr-005-shared-activity-model).

### 9.7 Markdown strategy
Long-form text (Notes, descriptions, Diary) is authored and stored as Markdown, rendered through one shared renderer. This keeps content portable, diff-able, and export-safe. See [ADR-006: Markdown Strategy](docs/decisions/ARCHITECTURE_DECISIONS.md#adr-006-markdown-strategy).

### 9.8 Shared over bespoke
Before building a module-specific version of anything — a card, a form, a filter bar — check the [Design System](docs/design/DESIGN_SYSTEM.md). If a shared pattern exists, use it. If one *should* exist but doesn't, build it as shared. A bespoke duplicate is [Product Debt](docs/product/PRODUCT_DEBT.md) the moment it's merged.

---

## 10. Open-source reuse policy

DalyHub stands on the shoulders of the open-source community. Reuse is encouraged — **within the rules**. The full policy and checklist live in [`OPEN_SOURCE_POLICY.md`](docs/governance/OPEN_SOURCE_POLICY.md); the summary every implementer must internalise:

1. **Prefer reuse over reinvention** for solved problems (command palette, editor, drag-and-drop, date logic). Don't rebuild what a well-maintained MIT library already does well.
2. **Study before you copy.** [`REFERENCE_PRODUCTS.md`](docs/reference/REFERENCE_PRODUCTS.md) records what we've already learned from each reference product so you don't re-research it.
3. **Every reused dependency or adapted snippet must pass the [reusable evaluation checklist](docs/governance/OPEN_SOURCE_POLICY.md#reusable-evaluation-checklist)** — license, health, security, fit, and provenance.
4. **When in doubt, ask via a proposal in the PR**, not by quietly vendoring code.

---

## 11. Licensing & provenance requirements

These are **non-negotiable** and gate every merge that introduces third-party code.

### Licensing
- **Allowed by default:** MIT, ISC, BSD-2/3-Clause, Apache-2.0 (permissive).
- **Requires an explicit, documented decision:** MPL-2.0 and other weak-copyleft (file-level) licenses — usable but must be justified in the PR and isolated.
- **Prohibited for code reuse:** GPL, AGPL, and other strong copyleft — for a proprietary product these are **study-only**. Learn from them; never copy their code or link them into the app. (Reference products under these licenses are explicitly flagged as such in [`REFERENCE_PRODUCTS.md`](docs/reference/REFERENCE_PRODUCTS.md).)
- **No license, no reuse.** Code with no discoverable license is "all rights reserved." Do not use it.

### Provenance
Every piece of external code that enters the repository must be traceable:
- **Dependencies:** pinned versions, recorded in the lockfile, with license captured (see [OSS policy](docs/governance/OPEN_SOURCE_POLICY.md#dependency-evaluation)).
- **Adapted snippets:** a comment at the adaptation site citing the **source URL, the commit/version, the license, and the date**, plus a note of what was changed. Format:
  ```ts
  // Adapted from <project> (<url>) @ <commit-or-version>, <license>, retrieved <date>.
  // Changes: <what you changed and why>.
  ```
- **Attribution:** third-party licenses that require notice are collected in a `THIRD_PARTY_NOTICES` file (create it the first time it's needed).
- **No laundering.** Never strip attribution, and never paste code you cannot license-verify.

---

## 12. Development workflow

The end-to-end lifecycle of every feature is defined in [`IMPLEMENTATION_WORKFLOW.md`](docs/product/IMPLEMENTATION_WORKFLOW.md). The short version:

```
Understand → Audit → Inspect existing code → Search open source → Evaluate licensing
→ Reuse assessment → Design → Architecture review → Implement → Test → Review → Merge
→ Update documentation
```

Operating rules:

- **One roadmap item per change.** Work is scoped to a single independently-implementable [ROADMAP_V2](docs/roadmap/ROADMAP_V2.md) item. If a "feature" is really several, split it.
- **Branch per item.** Develop on a feature branch; never commit product work directly to `main`.
- **Documentation is part of the change, not a follow-up.** If your change makes a doc wrong, fix the doc *in the same PR*. If it introduces a new pattern, add it to the [Design System](docs/design/DESIGN_SYSTEM.md). If it makes an architectural choice, add an ADR.
- **Leave the campsite cleaner.** If you touch code that carries [Product Debt](docs/product/PRODUCT_DEBT.md), either resolve the debt or update its entry with what you learned.
- **Small prompts, rich repo.** If you needed more than a short prompt to do the work, improve the documentation so the next agent won't.

---

## 13. Pull request standards

Every PR must:

- **Do one thing.** One roadmap item, one coherent change. No drive-by refactors bundled with features.
- **State the roadmap item** it implements (or the debt/bug it fixes) in the description, and link it.
- **Show the design intent.** For any UI change, note which [Design System](docs/design/DESIGN_SYSTEM.md) patterns are used or added.
- **Prove it works.** Describe how it was verified (see [Testing philosophy](#14-testing-philosophy)). Failing or skipped checks are disclosed, never hidden.
- **Declare provenance.** If it adds dependencies or adapted code, the PR body lists them with licenses and links, per [§11](#11-licensing--provenance-requirements).
- **Update docs in-band.** Docs touched by the change are updated in the same PR.
- **Meet the [Definition of Done](#18-definition-of-done).**

PR description template:

```markdown
## What & why
Implements: <ROADMAP_V2 item or debt/bug reference>
<one-paragraph summary of the change and the user-facing outcome>

## Design
<Design System patterns used / added; screenshots for UI>

## Verification
<how it was tested / driven end-to-end; results>

## Provenance
<new deps or adapted code with license + link, or "none">

## Docs
<docs updated, or "no docs affected">
```

Keep PR conversation frugal and substantive.

---

## 14. Testing philosophy

We test to move quickly *with confidence*, not to hit a coverage number.

- **Test behaviour, not implementation.** Assert what the user experiences, not internal structure. Tests should survive a refactor that preserves behaviour.
- **The testing pyramid, applied:**
  - **Unit** — pure logic (rollup calculations, date math, permission checks, link resolution). Fast, plentiful.
  - **Integration** — a module against the real kernel contracts (create a task → project rollup updates → activity appended).
  - **End-to-end** — a few high-value user journeys through the actual UI (capture a task in Today, complete it, see it in the project).
- **Every bug fix ships with a regression test** that fails before the fix and passes after.
- **The kernel is sacred.** Entities, EntityLinks, Activity, Workspaces, and the rollup logic carry the highest coverage expectations — a kernel bug corrupts every module.
- **Drive the real thing before claiming done.** For anything with runtime behaviour, exercise the actual flow, don't rely on types compiling. (Use the repo's verify workflow.)
- **Accessibility and performance are tested, not assumed.** See [§15](#15-accessibility-requirements) and [§16](#16-performance-expectations).

---

## 15. Accessibility requirements

Accessibility is a **requirement, not an enhancement**. Target: **WCAG 2.2 AA**.

- **Keyboard-complete.** Every interaction is reachable and operable by keyboard, with a visible focus ring and a logical tab order. No keyboard trap. This aligns with the keyboard-first [interaction philosophy](#7-interaction-philosophy).
- **Semantic and labelled.** Use native semantics first; ARIA only to fill gaps. Every control has an accessible name. Icon-only buttons have labels.
- **Contrast.** Text meets AA contrast (4.5:1 body, 3:1 large/UI). The muted palette is checked, not assumed. See [Design System → Accessibility](docs/design/DESIGN_SYSTEM.md#accessibility).
- **Respect user settings.** Honour `prefers-reduced-motion`, `prefers-color-scheme`, and OS text scaling. Motion never carries meaning that motion-off users lose.
- **Announce change.** Async results, toasts, and validation errors are announced to assistive tech via live regions.
- **Don't rely on colour alone** to convey state.

---

## 16. Performance expectations

Fast is part of "calm." Budgets (verify, don't assume):

- **Interaction response < 100 ms.** Keystrokes, opening a drawer, toggling a task feel instant. Anything slower uses optimistic UI.
- **Navigation < 200 ms** to first meaningful content; heavier data streams in behind a [skeleton](docs/design/DESIGN_SYSTEM.md#loading), never a spinner-blocked blank screen.
- **Command Palette results < 50 ms** for local matches.
- **No unbounded lists.** Virtualise long timelines, activity feeds, and search results.
- **Payloads stay lean.** Ship what the view needs; lazy-load modules; keep the initial bundle disciplined.
- **Measure the real path.** Performance claims are backed by a measurement, not a vibe.

---

## 17. Security requirements

DalyHub holds the most private data a person has. Treat it accordingly.

- **Least exposure.** The app surfaces data only to the owner. Sensitive entities (**People, Diary**) are never sent to external services — including AI models — unless the user explicitly opts in per action. See [AI philosophy](#8-ai-philosophy).
- **Validate at the boundary.** All input is validated and sanitised server-side; never trust the client. Markdown is rendered through a sanitising pipeline (no raw HTML injection). External/imported content (Todoist, Notion, calendars) is untrusted until validated.
- **Scope every query to the workspace.** Authorization is enforced server-side on every request; workspace isolation is a security boundary, not just an organisational one.
- **Secrets stay out of the repo.** Configuration and credentials come from the environment/secret store, never source. No secrets in logs, commits, or client bundles.
- **Safe by default.** Escape output, parameterise queries, set secure headers, keep dependencies patched (see [OSS policy](docs/governance/OPEN_SOURCE_POLICY.md#dependency-evaluation)).
- **Auditable.** The shared [Activity](#96-shared-activity-model) model doubles as a security-relevant audit trail for changes.
- **When a change touches auth, data access, or external input,** call it out in the PR and consider a focused security review.

---

## 18. Definition of Done

A change is **Done** only when **all** of the following are true:

- [ ] It implements exactly one [ROADMAP_V2](docs/roadmap/ROADMAP_V2.md) item (or a documented bug/debt fix), and does that one thing completely.
- [ ] It reuses shared [Design System](docs/design/DESIGN_SYSTEM.md) patterns; any new pattern is added to the Design System in the same PR.
- [ ] It respects the [architecture rules](#9-architecture-philosophy) (small kernel, module registry, EntityLinks, shared activity, workspace isolation, markdown strategy). Any deviation is captured as a new ADR.
- [ ] It meets [accessibility](#15-accessibility-requirements) (WCAG 2.2 AA), [performance](#16-performance-expectations), and [security](#17-security-requirements) requirements — verified, not assumed.
- [ ] It is tested per the [testing philosophy](#14-testing-philosophy), including a regression test for any bug fixed, and it was driven end-to-end.
- [ ] All third-party code passes the [licensing & provenance](#11-licensing--provenance-requirements) rules, with attribution recorded.
- [ ] Documentation affected by the change is updated **in the same PR**, and cross-links still resolve.
- [ ] The PR meets the [PR standards](#13-pull-request-standards).
- [ ] The relevant ROADMAP_V2 item's implementation status is updated.

If you cannot check every box, the work is not done — say so plainly and describe what remains.

---

*This constitution is a living document. Amending it is legitimate and expected — but amendments are deliberate: change this file in a dedicated PR that explains the reasoning, and reflect any architectural consequence as an ADR. See also [`docs/README.md`](docs/README.md) for the full documentation index.*
