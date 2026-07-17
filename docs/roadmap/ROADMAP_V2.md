# ROADMAP_V2.md — The DalyHub V2 Master Implementation Roadmap

> The single source of truth for **what we build next and in what order**. DalyHub V2 is built by implementing these items one at a time, each in its own PR.
>
> **The core workflow:** [`AGENTS.md`](../../AGENTS.md) tells you *how* to build; this file tells you *what* to build. A future prompt can be as small as: *"Implement the next unchecked ROADMAP_V2 item according to AGENTS.md."*
>
> Related: product intent in [`PRODUCT_PRINCIPLES.md`](../product/PRODUCT_PRINCIPLES.md) · patterns in [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md) · architecture in [`ARCHITECTURE_OVERVIEW.md`](../architecture/ARCHITECTURE_OVERVIEW.md) & [`ARCHITECTURE_DECISIONS.md`](../decisions/ARCHITECTURE_DECISIONS.md) · reuse via [`OPEN_SOURCE_POLICY.md`](../governance/OPEN_SOURCE_POLICY.md) & [`REFERENCE_PRODUCTS.md`](../reference/REFERENCE_PRODUCTS.md) · lifecycle in [`IMPLEMENTATION_WORKFLOW.md`](../product/IMPLEMENTATION_WORKFLOW.md).

---

## How to read and use this roadmap

Each item is **independently implementable** and carries five fields:

- **Purpose** — what it delivers and why.
- **Dependencies** — items that must exist first (by ID).
- **Expected outcome** — the observable result when done (the acceptance intent).
- **Priority** — `P0` (foundational, blocks much), `P1` (core), `P2` (important), `P3` (later).
- **Status** — ☐ Not started · ◐ In progress · ☑ Done · ⊘ Deferred.

Rules:

- **Do one item per PR.** If an item feels too big, it's really several — split it and note the split here.
- **Respect dependencies.** Don't start an item whose dependencies aren't ☑.
- **Update status here in the same PR** that implements the item (part of the [Definition of Done](../../AGENTS.md#18-definition-of-done)).
- **No time estimates.** We sequence by dependency and priority, not calendar.
- **IDs are stable.** Reference them from PRs, [PRODUCT_DEBT](../product/PRODUCT_DEBT.md), and ADRs.

Item ID scheme: `AREA-NN` (e.g. `FND-01`, `DS-03`, `TODAY-02`).

Legend: **☐** not started **◐** in progress **☑** done **⊘** deferred

---

## Phase 0 — Foundation (`FND`)

*The kernel. Nothing else can exist without it. All `P0`.*

### ◐ FND-01 — Repository & toolchain scaffold
- **Purpose.** Establish the app skeleton: language/framework, build, lint, format, typecheck, test runner, CI, and the deployment target per [`ARCHITECTURE_OVERVIEW.md`](../architecture/ARCHITECTURE_OVERVIEW.md).
- **Dependencies.** None.
- **Expected outcome.** `install`, `build`, `lint`, `test` all run green in CI; a trivial page deploys to the target environment.
- **Priority.** P0.
- **Status: ◐ In progress.** The application platform and toolchain are chosen and accepted ([ADR-008](../decisions/ARCHITECTURE_DECISIONS.md#adr-008-initial-application-platform-and-toolchain)): React Router v8 (framework mode) + React 19 + TypeScript on Cloudflare Workers, built with Vite + the Cloudflare Vite plugin, managed with pnpm/Corepack and Wrangler. A restrained foundation page renders through the Workers runtime locally and a `/health` endpoint returns JSON. `format`, `lint`, `typecheck`, unit/component tests (Vitest + RTL), production build, and a Playwright Chromium smoke test all pass locally and in GitHub Actions CI. Wrangler configuration is validated and the build passes a credential-free `deploy --dry-run`. **The only remaining item is an actual deployment to Cloudflare Workers**, which needs a Cloudflare account, `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`, and an approved target (see [`docs/development/DEPLOYMENT.md`](../development/DEPLOYMENT.md)). Marked `☑ Done` only once that deployment is verified. **Owner sequencing decision (2026-07-17):** live deployment verification is **deferred by owner decision** and **does not block subsequent local implementation**. FND-01's application scaffold, build, test suite, CI and credential-free deploy dry-run are complete and green; the technical dependency FND-02 needs from FND-01 is therefore treated as satisfied. This is a deliberate, owner-approved sequencing exception — FND-01 stays `◐ In progress` (not `☑ Done`) until deployment is actually verified, but product development proceeds on top of it.

### ☑ FND-02 — Data kernel: entities & storage
- **Purpose.** Implement the core entity substrate (a uniform record: id, type, workspace, timestamps, soft-delete) and the storage layer. Backs every entity type.
- **Dependencies.** FND-01 (its scaffold/build/test/CI are green; live Cloudflare deployment was deferred by owner decision and does not block this item — see FND-01's note).
- **Expected outcome.** Entities can be created/read/updated/soft-deleted through a typed contract, persisted and migration-managed. Ref: [ADR-001](../decisions/ARCHITECTURE_DECISIONS.md#adr-001-area-hierarchy).
- **Priority.** P0.
- **Status: ☑ Done.** The entity kernel is implemented and accepted via [ADR-009](../decisions/ARCHITECTURE_DECISIONS.md#adr-009-data-kernel-storage): a storage-independent `EntityRepository` contract (`app/kernel/entities`) with a **Cloudflare D1** adapter (`app/platform/storage/d1`) over prepared, parameterised statements — no ORM. The base `entities` table (id, workspace_id, type, title, created_at, updated_at, deleted_at) is created by a committed D1 migration (`migrations/0001_create_entities.sql`) with CHECK constraints and access-path indexes. Operations — `create`, `getById`, `update` (title only), `list` (bounded, deterministic cursor pagination, type filter, deleted excluded by default), `softDelete`/`restore` (idempotent, defined outcomes) — all require `workspaceId`, are strongly typed (no `any`), and validate at the boundary. The suite runs pure unit tests **and** real D1 integration tests inside the Workers runtime (Cloudflare's official Vitest integration, migration applied to an isolated local database); `pnpm verify` and CI are green. Domain-specific fields, EntityLinks, Activity, the spine, and full workspace isolation are explicitly **out of scope** and left to their own roadmap items. `workspace_id` is carried and required but complete cross-workspace isolation remains [FND-03](#-fnd-03--workspace-isolation).

### ☑ FND-03 — Workspace isolation
- **Purpose.** Introduce the workspace boundary; scope all data access to a workspace as an organisational *and* security boundary.
- **Dependencies.** FND-02.
- **Expected outcome.** Every query is workspace-scoped server-side; data cannot leak across workspaces. Ref: [ADR-003](../decisions/ARCHITECTURE_DECISIONS.md#adr-003-workspace-isolation).
- **Priority.** P0.
- **Status: ☑ Done.** Workspace is now a real, persisted kernel/security boundary, accepted via [ADR-010](../decisions/ARCHITECTURE_DECISIONS.md#adr-010-server-side-workspace-context) (the concrete implementation of [ADR-003](../decisions/ARCHITECTURE_DECISIONS.md#adr-003-workspace-isolation)). A minimal `workspaces` table (id + UTC timestamps) is created by migration `0002_create_workspaces_and_enforce_scope.sql`, which back-fills a workspace for every existing `entities.workspace_id` and rebuilds `entities` with an **enforced foreign key** (`ON DELETE RESTRICT`) — the database rejects orphaned entities and refuses to delete a workspace that still owns entities, verified by real D1 integration tests including a sequential 0001→0002 migration test over seeded data. A storage-independent **workspace kernel** (`app/kernel/workspaces`: branded `WorkspaceId`, `WorkspaceContext`, request-free `WorkspaceContextResolver`, low-level `WorkspaceRepository`) plus a **server composition boundary** (`app/platform/workspaces`) resolve scope from a trusted `DEFAULT_WORKSPACE_ID` binding and fail closed. The module-facing `EntityRepository` is now **workspace-bound at construction** (`createEntityRepository(db, context)`); no module method accepts a `workspaceId`, every statement is scoped in SQL, cross-workspace reads/updates/deletes/restores reveal nothing, and pagination cursors are versioned and bound to workspace + filter + deleted-mode. Isolation is deliberately independent of authentication — [FND-09](#-fnd-09--app-shell-routing--auth) will swap the static resolver for an authenticated one behind the same interface. `pnpm verify`, CI and the credential-free deploy dry-run are green.

### ☐ FND-04 — EntityLinks
- **Purpose.** Typed, bidirectional links between any two entities as a kernel primitive.
- **Dependencies.** FND-02.
- **Expected outcome.** Any entity links to any other; links are queryable from both sides; deleting an entity handles its links cleanly. Ref: [ADR-002](../decisions/ARCHITECTURE_DECISIONS.md#adr-002-entitylinks).
- **Priority.** P0.

### ☐ FND-05 — Shared Activity model
- **Purpose.** One append-only activity/event stream that every entity change writes to.
- **Dependencies.** FND-02.
- **Expected outcome.** Mutations append uniform activity events; events are queryable per-entity (Timeline) and per-scope (Activity Feed). Ref: [ADR-005](../decisions/ARCHITECTURE_DECISIONS.md#adr-005-shared-activity-model).
- **Priority.** P0.

### ☐ FND-06 — Module registry
- **Purpose.** The mechanism by which modules self-register routes, entity types, commands, search providers, and settings.
- **Dependencies.** FND-02.
- **Expected outcome.** A new module is added without editing central switch statements; the shell discovers it via the registry. Ref: [ADR-007](../decisions/ARCHITECTURE_DECISIONS.md#adr-007-module-registry).
- **Priority.** P0.

### ☐ FND-07 — Area → Goal → Project → Task hierarchy
- **Purpose.** Implement the backbone model and its rollup semantics (tasks → projects → goals → areas).
- **Dependencies.** FND-02, FND-04, FND-05.
- **Expected outcome.** The four spine entities exist with parent/child relations and correct progress rollup; changes emit activity. Ref: [`AGENTS.md §4`](../../AGENTS.md#4-the-area--goal--project--task-model).
- **Priority.** P0.

### ☐ FND-08 — Markdown pipeline
- **Purpose.** One shared authoring/storage/rendering pipeline for Markdown (sanitising on render).
- **Dependencies.** FND-01.
- **Expected outcome.** Markdown is stored as source, rendered safely through one renderer, reused by Notes/Diary/descriptions. Ref: [ADR-006](../decisions/ARCHITECTURE_DECISIONS.md#adr-006-markdown-strategy).
- **Priority.** P0.

### ☐ FND-09 — App shell, routing & auth
- **Purpose.** The application shell: navigation frame, routing, session/auth (single-user first), theme provider.
- **Dependencies.** FND-01, FND-03, FND-06.
- **Expected outcome.** A navigable shell that loads modules from the registry, with light/dark theming and an authenticated session.
- **Priority.** P0.

---

## Phase 1 — Shared Design System (`DS`)

*The reusable interaction language from [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md). Every later module consumes these. Build them before the modules that need them.*

### ☐ DS-01 — Design tokens & theming
- **Purpose.** Colour, spacing, typography, radius, shadow, motion, z-index, breakpoints as tokens; light/dark maps.
- **Dependencies.** FND-01.
- **Expected outcome.** All subsequent UI consumes tokens; no hard-coded design values; theme switch works. Ref: [Foundations](../design/DESIGN_SYSTEM.md#foundations).
- **Priority.** P0.

### ☐ DS-02 — Shared Record Layout (Header + Summary + Tabs)
- **Purpose.** The universal record scaffold every entity view uses.
- **Dependencies.** DS-01, FND-07.
- **Expected outcome.** A single Record Layout renders header/summary/tabs for any entity type. Ref: [Record Header](../design/DESIGN_SYSTEM.md#record-header).
- **Priority.** P0.

### ☐ DS-03 — Shared Drawer
- **Purpose.** The side/sheet drawer that opens any record without losing place; stackable, deep-linkable.
- **Dependencies.** DS-02.
- **Expected outcome.** Any entity opens in the Drawer over current context; state restored on close; mobile adaptation. Ref: [Drawer](../design/DESIGN_SYSTEM.md#drawer).
- **Priority.** P0.

### ☐ DS-04 — Shared Cards
- **Purpose.** The one configurable Card component for lists/boards/grids.
- **Dependencies.** DS-01, FND-07.
- **Expected outcome.** All entity types render via one Card; supports selection, quick actions, density. Ref: [Cards](../design/DESIGN_SYSTEM.md#cards).
- **Priority.** P0.

### ☐ DS-05 — Shared Timeline & Activity Feed
- **Purpose.** Render the shared Activity model at record scope (Timeline) and cross-scope (Activity Feed) with one component.
- **Dependencies.** DS-01, FND-05.
- **Expected outcome.** Timeline and Activity Feed render uniform events; grouped, filterable, virtualised. Ref: [Timeline](../design/DESIGN_SYSTEM.md#timeline).
- **Priority.** P0.

### ☐ DS-06 — Shared Forms & field controls
- **Purpose.** One control per field type, inline validation, autosave/explicit-save, the entity-link picker.
- **Dependencies.** DS-01, FND-04, FND-08.
- **Expected outcome.** All create/edit UIs use shared controls; link picker creates EntityLinks. Ref: [Forms](../design/DESIGN_SYSTEM.md#forms).
- **Priority.** P0.

### ☐ DS-07 — Shared Filters
- **Purpose.** The one filter system (bar, chips, saved views, URL-reflected) used by every collection.
- **Dependencies.** DS-04.
- **Expected outcome.** A reusable filter system consumed by Today, Projects, Search, and all lists. Ref: [Filters](../design/DESIGN_SYSTEM.md#filters).
- **Priority.** P1.

### ☐ DS-08 — Shared Search
- **Purpose.** Unified search surface with the per-module search-provider interface.
- **Dependencies.** DS-03, FND-06.
- **Expected outcome.** Global search returns grouped results from all registered modules; opens in Drawer. Ref: [Search](../design/DESIGN_SYSTEM.md#search).
- **Priority.** P1.

### ☐ DS-09 — Command Palette & Quick Actions
- **Purpose.** The keyboard shell (`⌘K`) plus inline quick actions; modules register commands.
- **Dependencies.** DS-08, FND-06.
- **Expected outcome.** Every action reachable by keyboard; context-aware commands; quick actions on cards/headers. Ref: [Command Palette](../design/DESIGN_SYSTEM.md#command-palette).
- **Priority.** P1.

### ☐ DS-10 — Inspector, Settings, and feedback states
- **Purpose.** Shared Inspector, Settings layout, and the [Success/Error/Loading/Empty](../design/DESIGN_SYSTEM.md#success-feedback) states.
- **Dependencies.** DS-06.
- **Expected outcome.** Reusable inspector/settings surfaces and consistent feedback/loading/empty patterns available product-wide.
- **Priority.** P1.

### ☐ DS-11 — Accessibility & responsive baseline
- **Purpose.** Bake WCAG 2.2 AA and responsive behaviour into the shared components; add automated a11y checks.
- **Dependencies.** DS-02…DS-10.
- **Expected outcome.** Shared components pass automated + manual a11y checks and adapt across breakpoints. Ref: [Accessibility](../design/DESIGN_SYSTEM.md#accessibility).
- **Priority.** P1.

---

## Phase 2 — Today / Execution Workspace (`TODAY`)

*Where the user runs their day. The product's daily home. Depends on the Design System and the spine.*

### ☐ TODAY-01 — Execution Workspace
- **Purpose.** The Today surface: what's due, scheduled, and chosen for today, in one focused view.
- **Dependencies.** DS-04, DS-07, FND-07.
- **Expected outcome.** A single view of today's tasks across projects/areas, reorderable, completable inline. **P1.**

### ☐ TODAY-02 — Task Drawer
- **Purpose.** Open any task in the shared Drawer with full detail, links, and activity, without leaving Today.
- **Dependencies.** DS-03, TODAY-01.
- **Expected outcome.** Task opens in Drawer with editable fields, links to project/goal, and its timeline. **P1.**

### ☐ TODAY-03 — Waiting
- **Purpose.** Track tasks blocked on someone/something else ("waiting for").
- **Dependencies.** TODAY-01, FND-04.
- **Expected outcome.** A Waiting view listing delegated/blocked items with who/what they wait on and since when. **P2.**

### ☐ TODAY-04 — Planning
- **Purpose.** Plan the day/week — pull from backlog, schedule, and set intent.
- **Dependencies.** TODAY-01, DS-07.
- **Expected outcome.** A planning surface to move tasks into today/this week and set a daily focus. **P2.**

### ☐ TODAY-05 — Keyboard Workflow
- **Purpose.** Full keyboard operation of Today (capture, complete, reschedule, navigate) via palette + shortcuts.
- **Dependencies.** DS-09, TODAY-01.
- **Expected outcome.** A user can run the entire day without a mouse. **P2.**

### ☐ TODAY-06 — Mobile
- **Purpose.** The mobile-complete Today experience.
- **Dependencies.** DS-11, TODAY-01.
- **Expected outcome.** Today is fully usable on a phone with adapted layout and swipe quick actions. **P2.**

---

## Phase 3 — Projects (`PROJ`)

*Where sustained work is organised.*

### ☐ PROJ-01 — Overview
- **Purpose.** The project home: summary, tasks, key links, and progress via the Record Layout.
- **Dependencies.** DS-02, DS-04, FND-07.
- **Expected outcome.** A project renders with summary, its task list, and rollup progress. **P1.**

### ☐ PROJ-02 — Health
- **Purpose.** Signal whether a project is on track (progress, staleness, blockers, upcoming).
- **Dependencies.** PROJ-01, FND-05.
- **Expected outcome.** A health indicator surfacing at-risk/stale/blocked projects with reasons. **P2.**

### ☐ PROJ-03 — Knowledge
- **Purpose.** The project's notes/documents in one place, using the Markdown pipeline.
- **Dependencies.** PROJ-01, FND-08, NOTES-01.
- **Expected outcome.** Notes linked to the project are browsable/editable within it. **P2.**

### ☐ PROJ-04 — Activity
- **Purpose.** The project's Timeline/Activity from the shared model.
- **Dependencies.** PROJ-01, DS-05.
- **Expected outcome.** The Activity tab shows the project's event history. **P2.**

### ☐ PROJ-05 — Settings
- **Purpose.** Project configuration via the shared Settings pattern.
- **Dependencies.** PROJ-01, DS-10.
- **Expected outcome.** Project settings (area/goal, status, archival) via shared controls. **P2.**

### ☐ PROJ-06 — Mobile
- **Purpose.** Mobile-complete Projects.
- **Dependencies.** DS-11, PROJ-01.
- **Expected outcome.** Projects fully usable on a phone. **P3.**

---

## Phase 4 — Areas & Goals (`AREA`)

### ☐ AREA-01 — Area overview
- **Purpose.** The Area home: its goals, projects, and health, using the Record Layout.
- **Dependencies.** DS-02, FND-07.
- **Expected outcome.** An Area shows its goals/projects and rolled-up momentum. **P1.**

### ☐ AREA-02 — Goals
- **Purpose.** Goal records with target/definition-of-done and progress from linked projects.
- **Dependencies.** AREA-01, FND-07.
- **Expected outcome.** Goals render with completion criteria and roll up project progress. **P2.**

### ☐ AREA-03 — Alignment view
- **Purpose.** Show whether daily action matches stated goals (the intention↔action gap).
- **Dependencies.** AREA-02, TODAY-01.
- **Expected outcome.** A view relating recent task activity to goals, surfacing neglected goals. **P2.**

### ☐ AREA-04 — Mobile
- **Purpose.** Mobile-complete Areas & Goals.
- **Dependencies.** DS-11, AREA-01.
- **Expected outcome.** Areas/Goals usable on a phone. **P3.**

---

## Phase 5 — Notes (`NOTES`)

### ☐ NOTES-01 — Note record & Markdown editor
- **Purpose.** Notes as first-class Markdown records, using the shared pipeline and editor.
- **Dependencies.** FND-08, DS-02, DS-06.
- **Expected outcome.** Create/edit/read Markdown notes with the Record Layout. **P1.**

### ☐ NOTES-02 — Linking & backlinks
- **Purpose.** Link notes to any entity and surface backlinks.
- **Dependencies.** NOTES-01, FND-04.
- **Expected outcome.** Notes link to entities; linked entities show the note as a backlink. **P2.**

### ☐ NOTES-03 — Organisation & search
- **Purpose.** Browse/filter/search notes by area, tag, and content.
- **Dependencies.** NOTES-01, DS-07, DS-08.
- **Expected outcome.** Notes are findable via shared filters and search. **P2.**

### ☐ NOTES-04 — Mobile
- **Purpose.** Mobile-complete Notes.
- **Dependencies.** DS-11, NOTES-01.
- **Expected outcome.** Notes readable/editable on a phone. **P3.**

---

## Phase 6 — Meetings (`MEET`)

### ☐ MEET-01 — Meeting record
- **Purpose.** Meetings capturing attendees (People), agenda, notes, and outcomes, in the Record Layout.
- **Dependencies.** DS-02, FND-04, PEOPLE-01, NOTES-01.
- **Expected outcome.** Create a meeting, attach people and notes, record decisions. **P2.**

### ☐ MEET-02 — Follow-ups → Tasks
- **Purpose.** Turn meeting outcomes into linked tasks (manually; AI-assisted via AI-02).
- **Dependencies.** MEET-01, FND-07.
- **Expected outcome.** Action items become tasks linked back to the meeting. **P2.**

### ☐ MEET-03 — People & history integration
- **Purpose.** A meeting contributes to each attendee's People timeline.
- **Dependencies.** MEET-01, PEOPLE-02, DS-05.
- **Expected outcome.** Meetings appear in the relevant People timelines. **P2.**

### ☐ MEET-04 — Mobile
- **Purpose.** Mobile-complete Meetings (capture during/after a meeting).
- **Dependencies.** DS-11, MEET-01.
- **Expected outcome.** Meetings usable on a phone. **P3.**

---

## Phase 7 — People (`PEOPLE`)

*Care, not CRM (see [relationship philosophy](../../AGENTS.md#5-relationship-philosophy)).*

### ☐ PEOPLE-01 — Person record
- **Purpose.** People as first-class entities with the Record Layout and privacy-sensitive handling.
- **Dependencies.** DS-02, FND-04.
- **Expected outcome.** Create/edit a person; link to meetings/tasks/notes. **P2.**

### ☐ PEOPLE-02 — Relationship timeline
- **Purpose.** A person's accumulated history from the shared Activity model (meetings, commitments, notes).
- **Dependencies.** PEOPLE-01, DS-05.
- **Expected outcome.** A person shows a unified timeline of shared history. **P2.**

### ☐ PEOPLE-03 — Stay-in-touch signals
- **Purpose.** Gentle, calm prompts to reconnect (never nagging).
- **Dependencies.** PEOPLE-02.
- **Expected outcome.** Surfaces "haven't spoken in a while" without guilt mechanics. **P3.**

### ☐ PEOPLE-04 — Mobile
- **Purpose.** Mobile-complete People.
- **Dependencies.** DS-11, PEOPLE-01.
- **Expected outcome.** People usable on a phone. **P3.**

---

## Phase 8 — Assets (`ASSET`)

### ☐ ASSET-01 — Asset record
- **Purpose.** Track things of value (physical/digital/financial) with type-specific metadata, in the Record Layout.
- **Dependencies.** DS-02, FND-04.
- **Expected outcome.** Create/edit assets with metadata and links. **P3.**

### ☐ ASSET-02 — History & renewals
- **Purpose.** Track maintenance, value changes, warranties, and renewal reminders.
- **Dependencies.** ASSET-01, DS-05.
- **Expected outcome.** An asset shows its history and upcoming renewals (calm reminders). **P3.**

### ☐ ASSET-03 — Mobile
- **Purpose.** Mobile-complete Assets.
- **Dependencies.** DS-11, ASSET-01.
- **Expected outcome.** Assets usable on a phone. **P3.**

---

## Phase 9 — Diary (`DIARY`)

### ☐ DIARY-01 — Daily entry
- **Purpose.** Dated Markdown journal entries, private by nature.
- **Dependencies.** FND-08, DS-02.
- **Expected outcome.** Write/read dated diary entries with the Markdown editor. **P3.**

### ☐ DIARY-02 — Day context links
- **Purpose.** Link a diary entry to that day's meetings/tasks/people without forcing structure.
- **Dependencies.** DIARY-01, FND-04.
- **Expected outcome.** Entries optionally surface the day's related records. **P3.**

### ☐ DIARY-03 — Mobile
- **Purpose.** Mobile-complete Diary (capture on the go).
- **Dependencies.** DS-11, DIARY-01.
- **Expected outcome.** Diary usable on a phone. **P3.**

---

## Phase 10 — Review (`REVIEW`)

### ☐ REVIEW-01 — Review ritual framework
- **Purpose.** Daily/weekly/monthly/quarterly review flows operating over the whole system.
- **Dependencies.** TODAY-01, PROJ-01, AREA-02.
- **Expected outcome.** Guided review sessions that surface what to process, celebrate, and re-plan. **P2.**

### ☐ REVIEW-02 — Weekly review
- **Purpose.** The flagship weekly review: inbox to zero, project check, goal alignment.
- **Dependencies.** REVIEW-01, AREA-03.
- **Expected outcome.** A complete weekly review flow with clear close-out. **P2.**

### ☐ REVIEW-03 — Insights & alignment
- **Purpose.** Calm, honest reflection data (what moved, what stalled) — no vanity metrics.
- **Dependencies.** REVIEW-01, FND-05.
- **Expected outcome.** Review shows progress signals drawn from real activity. **P3.**

### ☐ REVIEW-04 — Mobile
- **Purpose.** Mobile-complete Review.
- **Dependencies.** DS-11, REVIEW-01.
- **Expected outcome.** Review usable on a phone. **P3.**

---

## Phase 11 — AI (`AI`)

*Propose, never act (see [AI philosophy](../../AGENTS.md#8-ai-philosophy) & [ADR-004](../decisions/ARCHITECTURE_DECISIONS.md#adr-004-ai-proposal-architecture)).*

### ☐ AI-01 — Proposal architecture & review UI
- **Purpose.** The core proposal engine: AI emits structured, reviewable change proposals; the user accepts/edits/rejects, whole or in part.
- **Dependencies.** FND-07, FND-04, DS-06.
- **Expected outcome.** A working propose→review→apply loop that never mutates data without approval. **P2.**

### ☐ AI-02 — Meeting → tasks/notes proposals
- **Purpose.** From meeting content, propose tasks and notes for the user to approve.
- **Dependencies.** AI-01, MEET-01.
- **Expected outcome.** Meeting notes yield reviewable task/note proposals. **P3.**

### ☐ AI-03 — Planning & review assistance
- **Purpose.** Propose daily/weekly plans and review summaries from real system state.
- **Dependencies.** AI-01, TODAY-04, REVIEW-01.
- **Expected outcome.** Reviewable planning/summary proposals grounded in actual data. **P3.**

### ☐ AI-04 — Privacy controls
- **Purpose.** Per-action opt-in for sensitive entities (People, Diary); clear indication of what's shared.
- **Dependencies.** AI-01.
- **Expected outcome.** Sensitive data never leaves without explicit, per-action consent. **P2.**

---

## Phase 12 — Search, Filters & Cross-cutting (`X`)

*Product-wide capabilities that mature after modules exist.*

### ☐ X-01 — Global search maturity
- **Purpose.** Ranking, previews, and recents across all module providers.
- **Dependencies.** DS-08, all module records.
- **Expected outcome.** Fast, relevant global search across every entity type. **P2.**

### ☐ X-02 — Saved views & cross-module filters
- **Purpose.** Persisted filtered views spanning modules.
- **Dependencies.** DS-07.
- **Expected outcome.** Users save and revisit cross-module filtered views. **P3.**

### ☐ X-03 — Import & sync (Todoist, Notion, calendar)
- **Purpose.** Bring in existing data from external tools (imported content is untrusted until validated — see [security](../../AGENTS.md#17-security-requirements)).
- **Dependencies.** FND-07, NOTES-01, MEET-01.
- **Expected outcome.** Reliable import/sync from named sources into the model. **P3.**

### ☐ X-04 — Export & data portability
- **Purpose.** Full export (Markdown + structured) so the user is never locked in.
- **Dependencies.** FND-02, FND-08.
- **Expected outcome.** One-click export of all data in portable formats. **P2.**

---

## Phase 13 — Settings & Platform (`SET`)

### ☐ SET-01 — App & workspace settings
- **Purpose.** Global and workspace configuration via the shared Settings pattern.
- **Dependencies.** DS-10, FND-03.
- **Expected outcome.** Coherent settings for app and workspace scopes. **P2.**

### ☐ SET-02 — Backup & restore
- **Purpose.** Trustworthy backup/restore of all data (the system is the user's memory — it must be recoverable).
- **Dependencies.** FND-02, X-04.
- **Expected outcome.** Documented, tested backup and restore. **P1.**

### ☐ SET-03 — Account & security
- **Purpose.** Auth, sessions, and security settings.
- **Dependencies.** FND-09.
- **Expected outcome.** Secure account management aligned with [security requirements](../../AGENTS.md#17-security-requirements). **P2.**

---

## Change log for this roadmap

When you complete, split, add, or defer an item, note it here (newest first) so the roadmap's evolution is legible.

- **2026-07-17 — FND-03 → ☑ Done.** Workspace isolation implemented and accepted via [ADR-010](../decisions/ARCHITECTURE_DECISIONS.md#adr-010-server-side-workspace-context) (concretising [ADR-003](../decisions/ARCHITECTURE_DECISIONS.md#adr-003-workspace-isolation)): a persisted `workspaces` table with an enforced `entities.workspace_id` foreign key (`ON DELETE RESTRICT`, migration `0002`, existing rows preserved and back-filled), a storage-independent workspace kernel (`app/kernel/workspaces`), a trusted request-free server-side context resolver + composition boundary (`app/platform/workspaces`), a **workspace-bound** `EntityRepository` (no per-call `workspaceId`), scope-bound versioned pagination cursors, and real D1 integration tests proving cross-workspace isolation and database-level referential integrity. Isolation is independent of authentication ([FND-09](#-fnd-09--app-shell-routing--auth) replaces the resolver behind the same interface). FND-01's deferred deployment status is unchanged.
- **2026-07-17 — FND-02 → ☑ Done.** Entity/D1 storage kernel implemented and accepted via [ADR-009](../decisions/ARCHITECTURE_DECISIONS.md#adr-009-data-kernel-storage): typed `EntityRepository` contract + Cloudflare D1 adapter over prepared statements (no ORM), first committed migration (`migrations/0001_create_entities.sql`), bounded/deterministic cursor pagination, soft-delete/restore, real Workers/D1 integration tests, updated CI and `pnpm verify`. Full workspace isolation remains [FND-03](#-fnd-03--workspace-isolation).
- **2026-07-17 — FND-01 note updated (still ◐ In progress).** Recorded the owner's sequencing decision that live Cloudflare deployment verification is deferred and does not block continued local implementation. FND-01 stays `◐ In progress`; it is **not** marked done.
- **2026-07-17 — FND-01 → ◐ In progress.** Application platform & toolchain scaffolded and accepted via [ADR-008](../decisions/ARCHITECTURE_DECISIONS.md#adr-008-initial-application-platform-and-toolchain). Full local quality suite (`pnpm verify`) and CI are green; deployment to Cloudflare Workers is the only remaining external verification item before `☑ Done`.

---

## Related documents
- [`AGENTS.md`](../../AGENTS.md) · [`PRODUCT_PRINCIPLES.md`](../product/PRODUCT_PRINCIPLES.md) · [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md) · [`ARCHITECTURE_OVERVIEW.md`](../architecture/ARCHITECTURE_OVERVIEW.md) · [`ARCHITECTURE_DECISIONS.md`](../decisions/ARCHITECTURE_DECISIONS.md) · [`IMPLEMENTATION_WORKFLOW.md`](../product/IMPLEMENTATION_WORKFLOW.md) · [`OPEN_SOURCE_POLICY.md`](../governance/OPEN_SOURCE_POLICY.md) · [`REFERENCE_PRODUCTS.md`](../reference/REFERENCE_PRODUCTS.md) · [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) · [`docs/README.md`](../README.md)
