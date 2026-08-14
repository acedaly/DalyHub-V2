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
| [`/CHANGELOG.md`](../CHANGELOG.md) | **Owner-facing** record of what changed on screen and why. Versioned from `2.0.0`; earlier entries are grouped by date and roadmap item. |
| **Product** | |
| [`product/PRODUCT_PRINCIPLES.md`](product/PRODUCT_PRINCIPLES.md) | What DalyHub is, why it exists, how it should feel; meaning of every entity. |
| [`product/PRODUCT_DEBT.md`](product/PRODUCT_DEBT.md) | Known inconsistencies and their target states, linked to roadmap items. |
| [`product/UX_01_IMPLEMENTATION_NOTE_2026_07_28.md`](product/UX_01_IMPLEMENTATION_NOTE_2026_07_28.md) | Exact completed and remaining scope for the UX-01 Tasks/Meetings usability slice. |
| [`product/UI_UX_COHERENCE_AUDIT_2026_07.md`](product/UI_UX_COHERENCE_AUDIT_2026_07.md) | The 2026-07 cross-module UI/UX coherence audit that DS-12 → PX-06 implemented. |
| [`product/UX_01_DAILY_DRIVER_AUDIT_2026_08.md`](product/UX_01_DAILY_DRIVER_AUDIT_2026_08.md) | The 2026-08 full-product daily-driver audit (UX-01): the documents reviewed, every finding by phase with severity, what was fixed, and what was deliberately left alone. |
| [`product/DALYHUB_UX_PRODUCT_AUDIT_2026_08.md`](product/DALYHUB_UX_PRODUCT_AUDIT_2026_08.md) | The 2026-08 current-`main` UX/Product audit with Tasks as the primary product area: current commit reviewed, Tasks deep dive, mobile/iPhone, MD3 Expressive and Apple-polish assessment, scores, priority findings, updated roadmap sequence and implementation plan. |
| [`product/EDITING_CONSISTENCY_AUDIT_2026_08.md`](product/EDITING_CONSISTENCY_AUDIT_2026_08.md) | The 2026-08 editing audit (EDIT-02): every editable field in the product, classified A–E, with the interaction it uses, what moved onto the shared inline system, and what was deliberately left as a form. |
| [`product/CAL_01_UNIFIED_EXTERNAL_SCHEDULE_2026_08.md`](product/CAL_01_UNIFIED_EXTERNAL_SCHEDULE_2026_08.md) | CAL-01/CAL-02/CAL-03: read-only external ICS calendars → the unified Schedule → Today/Tomorrow/Next 7 days → an optional canonical DalyHub Meeting. The event-vs-Meeting authority boundary, feed-URL secrecy, the sealed-secret encryption strategy, the SSRF policy, the ICS parser decision, recurrence identity, the sync algorithm, the retention window, Meeting-link semantics, failure handling, privacy minimisation, testing evidence and the deliberate non-goals. |
| [`product/IMPLEMENTATION_WORKFLOW.md`](product/IMPLEMENTATION_WORKFLOW.md) | The step-by-step lifecycle of every feature. |
| [`product/X_04_EXPORT_AUDIT_2026_08.md`](product/X_04_EXPORT_AUDIT_2026_08.md) | The data-model audit taken before X-04's export was written: every persisted table and its authoritative repository, every lifecycle state and where it lives, the spine and EntityLink direction rules, Activity subjects, module child records, owner preferences, the exact Markdown-bearing fields, the existing single-record note export, what must never be exported, and the conclusions that shaped the design. |
| [`product/DOC_EDITOR_ATOMIC_AUDIT_2026_08_08.md`](product/DOC_EDITOR_ATOMIC_AUDIT_2026_08_08.md) | The pre-implementation audit for DOC-EDITOR-01 / AUDIT-13 / AUDIT-16 (`main` @ `6e5860e`): every long-form and multiline editing surface classified with its control and save semantics, both non-atomic compound mutations traced UI → route → service → repository → D1 with the exact point partial success could occur, each dead-code candidate classified (confirmed dead · superseded · duplicate · dormant-but-intentional) with what was deleted and what was deliberately retained, and the three decisions taken. |
| [`product/END_TO_END_AUDIT_2026_08_05.md`](product/END_TO_END_AUDIT_2026_08_05.md) | **The 5 August 2026 independent, adversarial end-to-end audit** (`main` @ `ca3577d`): the release/daily-use verdict and its evidence, the commands run and test results, a module-by-module and data-integrity assessment, security/architecture/testing/PWA/deployment/documentation assessments, all findings by severity (2 P1 reproduced, 5 P2, 9 P3, 5 verification gaps), the required local and production verification checklist, and the recommended remediation sequence. Its roadmap and debt updates land in [`ROADMAP_V2_1.md`](roadmap/ROADMAP_V2_1.md) (AUDIT-FIX-01…07) and [`PRODUCT_DEBT.md`](product/PRODUCT_DEBT.md) (DEBT-79…88). |
| **Release** | |
| [`release/RELEASE_NOTES_V2_0_1.md`](release/RELEASE_NOTES_V2_0_1.md) | **DalyHub V2.0.1 (`2.0.1`) release notes** — the hotfix on top of V2: permanent deletion of Assets with history, the Area guard, upcoming Meetings in search, Review→Diary deep links, truthful custom recurrence display, the Projects/Areas/Goals/Diary command-palette actions, and the release hardening (deploy preflight, post-deploy health assertion, automated backups). Explicitly **not** V2.1. |
| [`release/RELEASE_CHECKLIST_V2_0_1.md`](release/RELEASE_CHECKLIST_V2_0_1.md) | **The evidence and runbook for V2.0.1** — every fix mapped to the change and its tests, the release-hardening record, the branch-protection governance item (owner action, honestly marked outstanding until done), the stale-PR decisions, the quality-gate results, and the step-by-step deployment sequence for a no-migration release. |
| [`release/RELEASE_NOTES_V2.md`](release/RELEASE_NOTES_V2.md) | **DalyHub V2 (`2.0.0`) release notes** — what V2 is, the modules and workflows delivered, mobile and daily-driver usability, themes/Help/About, search and command actions, export and Obsidian portability, reliability/migration/accessibility, the known limitations, what is deferred to V2.1, and the owner's upgrade section. |
| [`release/RELEASE_CHECKLIST_V2.md`](release/RELEASE_CHECKLIST_V2.md) | **The evidence behind the V2 release verdict** — every roadmap item, every primary module journey, mobile, accessibility, workspace isolation, migration safety, export integrity, CI status, deployment readiness, Help/About accuracy, documentation status and the Backup & Restore deferral, each with a test/file/PR reference and any limitation. Nothing is marked complete without evidence. |
| **Roadmap** | |
| [`roadmap/ROADMAP_V2.md`](roadmap/ROADMAP_V2.md) | The master, phased list of V2 work items — **closed** at the V2 release, with a reconciled scope-and-status table at the top. |
| [`roadmap/ROADMAP_V2_1.md`](roadmap/ROADMAP_V2_1.md) | **What comes after V2**: SET-02 backup & restore (V2.1's first item), the named remainders from shipped V2 modules, module completion, and the items that were never in V2's scope — with the build order. |
| [`roadmap/ROADMAP_V2_2.md`](roadmap/ROADMAP_V2_2.md) | **V2.2, and where new work goes** — the Tasks daily-driver programme: TASKS-05 (list-first workspace, the Eisenhower Matrix removed, direct editing on the row), TASKS-06 (multi-selection and bulk management including a reversible bulk delete), TASKS-07 (Recurrence 2.0 — custom authoring, fixed vs after-completion scheduling, skip and series scope), TASKS-08 (the phone daily driver), TASKS-09 (optimistic latency contract), and the post-audit TODAY-09/TASKS-10 sequence. |
| **Design** | |
| [`design/DALYHUB_DESIGN_SYSTEM.md`](design/DALYHUB_DESIGN_SYSTEM.md) | **The design-system specification.** DalyHub's own design language: the philosophy and the expression budget, the three-level hierarchy model, the token architecture and the density model, the numbered departures from stock Material, the six record-surface families, adaptive behaviour, component ownership, the external-primitive policy and the migration map. Material 3 is machinery underneath it, not the authority (ADR-092). |
| [`design/DS_01_DESIGN_SYSTEM_FOUNDATION_2026_08.md`](design/DS_01_DESIGN_SYSTEM_FOUNDATION_2026_08.md) | **DS-01, the design-system foundation.** What the audit found, the four-layer token architecture and why the `--dh-` prefix returns pointing the other way, the three-preset density model and its accessibility floor, the seven type roles, the full component inventory classified KEEP / KEEP + RESTYLE / REFACTOR with reasoning, the generic-versus-product boundary, the per-candidate primitive-library decision (Radix · React Aria · Base UI · shadcn · native — all declined, none adopted), the DS-01→DS-08 migration map with dependencies and risk, what DS-01 deliberately did not do, the remaining debt and the validation record. |
| [`design/DS_02_CORE_UI_PRIMITIVES_2026_08.md`](design/DS_02_CORE_UI_PRIMITIVES_2026_08.md) | **DS-02, the core UI primitives.** The thirteen primitives and which were built, moved, restyled or re-exported; the three changes that carry the visual difference (the application declaring `compact` density, D33's retirement of the stadium, and the secondary button ceasing to be tonal); the three class-name migration bridges and why they exist; the re-tested primitive-dependency decision; the accessibility guarantees per primitive; what is deliberately left to DS-03…DS-06; the remaining debt and the screenshot record. |
| [`design/DS_03_SHELL_AND_NAVIGATION_2026_08.md`](design/DS_03_SHELL_AND_NAVIGATION_2026_08.md) | **DS-03, the shell and navigation.** The dark navigation rail and why it needs its own colour family, foreground pair, per-appearance accent role and focus colour; the rail's anatomy and its bottom utility region; the tablet's collapsed glyph rail and why it is a media query rather than a preference; the 56px top bar with search at its leading edge; the page frame's one origin and the centring defect the wide capture found; what changed on the phone and what deliberately did not; the accessibility guarantees, the tokens added, and the DS-04 handoff. |
| [`design/DS_04_TASKS_REDESIGN_2026_08.md`](design/DS_04_TASKS_REDESIGN_2026_08.md) | **DS-04, the Tasks redesign and visual convergence.** What the two root concept images actually specify for a task list; the ten measured differences the pass was driven by and the checklist that tracked them; the task ROW as a product component over the generic Card; the shared column grid; why a list's responsive authority is its own width and not the window's; the white workspace, the de-tinted drawer, the selector rework; what DS-04 deliberately did not do. |
| [`design/DESIGN_SYSTEM.md`](design/DESIGN_SYSTEM.md) | The shared interaction language every module reuses — the mechanics under the specification above. |
| [`design/THEME_ACCEPTANCE_MATRIX.md`](design/THEME_ACCEPTANCE_MATRIX.md) | **Retired (M3-01).** A tombstone: the seven-theme system it recorded no longer exists. It points at ADR-074 and at the tests that now prove, on every commit, what this document used to assert per theme. |
| [`design/PRODUCT_EXPERIENCE.md`](design/PRODUCT_EXPERIENCE.md) | The product-wide experience contract: the 2026-07 UX review, scores, ranked improvements, philosophies, hierarchy/composition rules, and reference screens. |
| [`design/M3_POLISH_HANDOFF.md`](design/M3_POLISH_HANDOFF.md) | The state of the M3 visual polish work on PR #121: the foundation, shell, shared components and entity icons that have shipped; the module migration (Gates D-H) that has not; and the exact next implementation sequence. Read this before resuming that branch. |
| [`design/M3_POLISH_AUDIT.md`](design/M3_POLISH_AUDIT.md) | The whole-product visual audit taken after the Material Design 3 migration (PR #120): what the token change did **not** fix, the cause of each gap, the design targets the follow-up work is measured against, the authoritative reference mock-up, and the current-state evidence in `assets/m3-polish-2026-08/`. |
| [`design/DALYHUB_UI_QUALITY_AUDIT_2026_08.md`](design/DALYHUB_UI_QUALITY_AUDIT_2026_08.md) | The August 2026 UI quality audit: every module driven in a real browser across the viewport matrix, both appearances and every interaction state. The findings register (fixed and deferred), the shared root causes, and before/after evidence in `assets/uiq-2026-08/`. |
| [`design/UIX_01_PRODUCT_REDESIGN_2026_08.md`](design/UIX_01_PRODUCT_REDESIGN_2026_08.md) | **UIX-01, the August 2026 product redesign** of the shell, Today and Tasks against two supplied reference designs: the design-language decision (a bespoke DalyHub language on MD3 foundations, and exactly which half is which), the six generated decorative accent ramps and the `wash` strength, what changed on each surface, the deliberate differences from the references and why each one is the product's truth winning over the picture, and the before/after evidence in `assets/uix-01-2026-08/`. |
| [`design/MOBILE_01_IPHONE_DAILY_DRIVER_2026_08.md`](design/MOBILE_01_IPHONE_DAILY_DRIVER_2026_08.md) | **MOBILE-01, the August 2026 iPhone daily-driver polish** over the existing phone platform: how the audit was run at 320/375/390/430, each measured defect with its cause and fix, the deliberate non-changes with the measurements that justified them, the shared primitives that changed (safe-area and field-size tokens, the overflow menu's phone sheet, `FormActions` sticky-by-default), the viewport acceptance results, and the mobile debt that was recorded rather than fixed. |
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
| [`development/BACKUP_AND_RESTORE.md`](development/BACKUP_AND_RESTORE.md) | Recovery (SET-02 / AUDIT-11 / BACKUP-01): the three backups — the canonical DalyHub archive, the nightly D1 dump in private R2, and the encrypted nightly D1 dump on GitHub — which one to use for what and why two D1 dumps in different trust boundaries is deliberate, D1 Time Travel versus an R2 dump, the owner restore journey, the version-compatibility and validation contract, the merge-versus-replace decision, the verified pre-restore safety backup, how failure safety is achieved on D1 (staging plus a fixed-size atomic cutover), post-restore verification, catastrophic D1 recovery, the encrypted nightly artifact, the recovery key and its rotation, retention, size limits, read consistency, and the verification matrix. |
| [`development/EXPORT_AND_PORTABILITY.md`](development/EXPORT_AND_PORTABILITY.md) | Full workspace export (X-04): the ONE canonical, versioned `DalyHubWorkspaceSnapshotV1` and the two serialisers derived from it — the structured archive (`manifest.json` / `dalyhub-snapshot.json` / `SCHEMA.md` / `README.md` / `CHECKSUMS.txt`) and the ready-to-open Obsidian vault. Covers the read-only snapshot repository (bounded, deterministic, no N+1, no mutating method), the validation gate, the stated read-consistency guarantee, the Markdown-bearing fields, what is never exported, deterministic collision-safe filenames, internal-link rewriting and unresolved-link reporting, the dependency-free ZIP writer and why no package was added, the Settings surface, the compatibility policy, the known limitations and the full verification matrix. |
| [`development/MARKDOWN_PIPELINE.md`](development/MARKDOWN_PIPELINE.md) | The shared Markdown pipeline: source-of-truth & size limits, supported/unsupported profile, raw-HTML policy, sanitisation allowlist, URL & remote-image policy, code/task-list behaviour, the public API, the one React sink, Workers compatibility, and how Notes/Diary/descriptions consume it. |
| [`development/APP_SHELL_AUTH.md`](development/APP_SHELL_AUTH.md) | The app shell & authentication: the request/auth flow, Cloudflare Access JWT validation, owner enforcement, session/identity types, authenticated workspace & Activity actor, development-auth mode, local setup, logout, the public `/health` boundary, registry-driven routing & navigation, theme behaviour, security headers, and the workers.dev/custom-domain deployment requirements. |
| [`development/IDENTITY_AND_ACTORS.md`](development/IDENTITY_AND_ACTORS.md) | Actor identity (IDENT-01): the chain from a Cloudflare Access token to a named actor, the ONE canonical resolution order (Person → member → provider name → email → `System` → `Unknown user`), the `workspace_members` identity record, read-time name resolution and what renaming does, batched actor resolution in a route, the shared actor presentation, how cross-module event descriptions are built, and how to check and repair production identity. |
| [`development/ACTIVITY_TIMELINE.md`](development/ACTIVITY_TIMELINE.md) | The Shared Timeline & Activity Feed (DS-05): one renderer for both scopes, the presentation view-model boundary, registering event descriptors, the unknown-type fallback, wiring a route, DS-07 filtering & DS-03 drawer reuse, ordering/grouping/dates, virtualisation, accessibility, the real product adopters (the task record, the Area record, the **Goal record Activity tab, AREA-02**, and the **project record Activity tab, PROJ-04**), and the development demonstration. |
| [`development/SHARED_FORMS.md`](development/SHARED_FORMS.md) | The Shared Forms & field controls (DS-06): the React-free model boundary, the field contract & anatomy, layered validation, the declared explicit-save and autosave models, navigation safety, the Markdown source control, timezone-safe dates, the entity-link picker over the FND-04 repository, accessibility, and the development demonstration. |
| [`development/SHARED_SEARCH.md`](development/SHARED_SEARCH.md) | The Shared Search system (DS-08/X-01): the model/orchestrator/UI layers, the registry-driven provider contract, `SearchResultTarget`, generic result signals, deterministic ranking & grouping, bounds & safety, incremental search, Recent results, Drawer opening, accessibility & modal reuse, server composition, complete repository-backed provider coverage across shipped record modules, preview/privacy policy by entity type, the **NOTES-03 Notes full-content provider** and D1-native indexing trade-offs. |
| [`development/COMMAND_PALETTE.md`](development/COMMAND_PALETTE.md) | The Command Palette & Quick Actions system (DS-09): the refined discriminated command contract, the model/server/runtime layers, the trusted catalogue transport & browser decoder, the authenticated execution boundary, contextual actions, the shared `AppAction` and Card/Header adapters, the keyboard vocabulary & dispatcher, DS-08 Search reuse, and the development demonstration. |
| [`development/RELATIONSHIPS.md`](development/RELATIONSHIPS.md) | The Universal Relationship System (REL-01): the shared **Linked Items** section every record mounts, the module-agnostic `link.related` type + trusted policy, the one authenticated `/links` endpoint (list/search/summary + link/unlink), the `HoverCard`, inline `[[Wiki Links]]` + resolver, in-tier Search boosting, optimistic/offline/keyboard behaviour, Activity recording, how a module adopts it, and the **NOTES-02 references adopter note** (a saved `[[Wiki Link]]` becomes a typed, stable-id `note.references` EntityLink; the separate `~/shared/references` surface that READS the graph directionally; the backlink/outgoing-link definitions; Project Knowledge cardinality) — all on the FND-04 EntityLink primitive with no second relationship model. Also the **relationship aggregation architecture** (PEOPLE-03) and the **context-aware capture contract** (ADR-060): its revalidated source context, relationship matrix, canonical EntityLink / attendee / structural-parent outcomes and DEBT-45 limits. |
| [`development/FEEDBACK_AND_INSPECTOR.md`](development/FEEDBACK_AND_INSPECTOR.md) | The Global Interaction Layer (DS-10): the Notification framework, the Undo framework, the Operation lifecycle (one Feedback platform + the hidden `useFeedback` API) and the shared Inspector — the model/runtime layers, calm queue/undo/operation semantics, the URL-driven resizable/sheet Inspector reusing the DS-03 modal machinery, accessibility, integration points, and the development demonstration. |
| [`development/SETTINGS_LAYOUT.md`](development/SETTINGS_LAYOUT.md) | The Shared Settings layout (DS-10b): the structure primitives (`SettingsLayout`/`SettingsGroup`/`SettingsRow`), the two accessible-naming patterns, declared change behaviour (immediate via `useImmediateSetting`, autosave and explicit-save via DS-06), the dangerous-action contract (`DangerousAction`/`ConfirmationDialog` reusing the DS-03 modal machinery, typed confirmation, failure/retry), where Settings fits across routes/Inspectors/records, accessibility, and the development demonstration. |
| [`development/HELP_AND_ABOUT.md`](development/HELP_AND_ABOUT.md) | In-app Help (HELP-01) and the single version authority behind About and `/health` (RELEASE-01): why Help's content is typed data, the rules that content follows, deep links from empty states, and what About is allowed to expose. |
| [`development/SETTINGS_MODULE.md`](development/SETTINGS_MODULE.md) | The application Settings module (SET-01): the `/settings` information architecture, owner/workspace vs device-local preference authority, migration `0017`, timezone/date authority, root/default routing, navigation preferences, Activity privacy boundary, deferred scope and verification. |
| [`development/AI_PLATFORM.md`](development/AI_PLATFORM.md) | The controlled AI platform: providers, budgets, evidence, privacy, proposals. |
| [`development/ACCESSIBILITY_RESPONSIVE.md`](development/ACCESSIBILITY_RESPONSIVE.md) | The Accessibility & Responsive Baseline (DS-11): keyboard conventions, responsive rules (320px→ultra-wide, container queries, safe-area, touch targets), accessibility standards (landmarks, headings, live regions, forced-colors, reduced motion), the three-layer testing strategy (jsx-a11y · component/contrast tests · the axe-core + no-overflow + keyboard Playwright gate), the requirements every future module inherits and must keep, and **the MOBILE-01 phone platform** layered on top (the one keyboard-inset listener and its token, the mobile-zoom floor, the second navigation landmark, sheets reusing the modal machinery, command-row and tab-strip overflow, and what MOBILE-01 adds to the verification matrix). |
| [`development/TASKS_MODULE.md`](development/TASKS_MODULE.md) | The Tasks module (TASKS-01 + TASKS-02 + TASKS-03 done): the authority boundaries it composes rather than replaces, the four separate planning questions (P1–P4 priority · Do/Defer/Delegate/Delete · Time Sector vs scheduled vs due date · Active vs Someday/Maybe), the one display-state precedence evaluator, atomic creation, bounded cursor pagination, delegation, the shared priority/urgency signals, and **the completed collection experience (TASKS-03, ADR-059)** — one declarative URL-backed configuration, complete server-side filtering, sorting and grouping with authoritative counts, persistent workspace- and owner-scoped saved views over a validated configuration, the list as the primary workspace with the Matrix and Time Sectors retained as optional presentations, and the in-workspace quick add and list-level quick edits that all post to canonical routes. |
| [`development/VIEWS_MODULE.md`](development/VIEWS_MODULE.md) | The Views module (X-02, ADR-082): cross-module saved views. The ONE declarative view configuration generalised from the Tasks contract — shared versus module-specific dimensions and the rule that a dimension a record type cannot answer removes that record type rather than widening the query; one saved-view system with a `kind` (migration `0036`, additive) shared by Tasks and cross-module views; the bounded per-scope query engine and its asserted statement cost; the REVIEW-03 boundary and health-movement integration; the built-in views; module visibility, archive and delete semantics; and the scopes deliberately deferred. |
| [`development/TODAY_DASHBOARD.md`](development/TODAY_DASHBOARD.md) | The Today module: the day surface as it is now (header block, chip row, day column, attention rail), what "on today" and "overdue" mean over a task's two date fields, the canonical Task Drawer, the Waiting model, the planning model (the scheduled date as the owner's commitment, kept distinct from the due date), the keyboard story, and **what the 2026-08 redesign removed and where each function went**. |
| [`development/PROJECTS_MODULE.md`](development/PROJECTS_MODULE.md) | The Projects module (PROJ-01 + PROJ-02 + PROJ-04 + PROJ-05 + PROJ-06 done): data ownership (the spine authority + the read-only `ProjectRepository` projection, `getRollup` as the progress source of truth, `listProjectTasks`), the routes, the shared composition (collection · overview · Tasks/Key-links/Activity/**Settings** tabs · create/rename forms), the re-homed shared task-record surface (ADR-033), the **Active-only Today integration (PROJ-05 Slice 4)**, the **derived project-health signal (PROJ-02, ADR-035)**, the **project Activity tab (PROJ-04, ADR-036)**, the **Settings tab, archive/restore and the Archived collection (PROJ-05, ADR-037)**, the **mobile-complete Projects workflow (PROJ-06)**, testing, and what remains for PROJ-03. |
| [`development/AREAS_MODULE.md`](development/AREAS_MODULE.md) | The Areas module (AREA-01 done, AREA-02 Goal-card integration done): data ownership (spine mutations + read-only `AreaRepository` projection), routes, Areas collection, New Area Drawer, canonical Area record, derived momentum semantics, Goal/Project presentation (Goal cards now link to the canonical record and show a batched target date), Activity tab reuse, Project creation dependency, accessibility/responsive coverage, tests and deferrals to AREA-04 (AREA-03's alignment reporting now lives on the real `/goals` collection — see `GOALS_MODULE.md`). |
| [`development/GOALS_MODULE.md`](development/GOALS_MODULE.md) | The Goals module (AREA-02 + AREA-03 done): data ownership (spine identity/completion + the additive `goal_details` table), the target-date and definition-of-done semantics, explicit completion kept separate from derived Project-contribution progress, the exact and complete Project-contribution boundary, routes, the canonical `/goals/:goalId` record, Goal creation (title-only, via the shared `NewGoalForm`), Area/Project integration, the **AREA-03 Alignment view** (the real `/goals` collection: a derived, non-persisted Goal↔Task-activity signal — recent-action window, qualifying evidence, the five explainable states, the Goal record's Alignment panel), accessibility/responsive coverage, tests and deferrals to AREA-04. |
| [`development/NOTES_PERSISTENCE.md`](development/NOTES_PERSISTENCE.md) | The Notes persistence & domain foundation (NOTES-01A, backend-only): ownership boundaries (identity/title/lifecycle stay `EntityRepository`; the additive `note_details` table owns only the Markdown source), the STRICT schema and no-backfill migration, no-row/empty-content semantics, exact Markdown-source preservation, validation reusing the one shared FND-08 parser, the content-timestamp contract, atomic mutation/Activity recording, workspace isolation, and what remains for the later Notes UI slice. |
| [`development/DIARY_MODULE.md`](development/DIARY_MODULE.md) | The Diary architecture, kernel foundation (DIARY-01A) and Timeline UI (DIARY-01): the Interstitial Journal philosophy (capture first, organise later), the `diary` entity type + additive `diary_entry_details` slice, chronology-first `occurred_at` (Memory-Mode backdating), the open registration-based entry-type vocabulary, the authoritative `DiaryRepository` (reserved atomic capture + edit + the bounded/cursor-paginated Timeline read model with day/month grouping), the Activity-vs-Diary boundary, relationships via EntityLinks, the DIARY-01 Timeline screen + sub-ten-second quick capture + route-backed editor + the display-timezone seam, and the future roadmap it enables. |
| [`development/PEOPLE_MODULE.md`](development/PEOPLE_MODULE.md) | The People module (PEOPLE-01 + PEOPLE-02 + PEOPLE-03 done): people as a first-class Spine-backed relationship entity (care, not a CRM), the `person` reserved type + additive `person_details` slice, archived-vs-deleted lifecycle, the closed relationship/contact-method/follow-up vocabularies, the authoritative `PersonRepository`, the People/Recent/Archived navigation and `/people` `/person/:id` `/new/person` routes, the collection and six-tab record, avatars, search + command-palette integration, the **ONE unified relationship timeline** (PEOPLE-02, ADR-052 — one endpoint, registry-derived cross-module labels as the privacy boundary, DS-07 category filtering, snapshot pagination), **how Meetings contribute to it** (MEET-03, ADR-055) and the **meaningful-contact read seam for PEOPLE-03**. Plus PEOPLE-03's derived relationship summary and stay-in-touch signal. |
| [`development/MEETINGS_MODULE.md`](development/MEETINGS_MODULE.md) | The Meetings module (MEET-01 + MEET-02 + MEET-03 done): the `meeting` entity + `meeting_details`/`meeting_items` slices, attendees as `meeting.attendee` EntityLinks, the collection and record surfaces, follow-through and canonical Task conversion with its source-item mapping and orchestration (MEET-02, ADR-048), and **people history** (MEET-03, ADR-055) — the write-once `held_at` occurrence fact (migration `0020`), the *Mark as held* action, the multi-subject `meeting.held` event, server-derived attendee subjects, the attendee snapshot rules, privacy, and the atomicity/idempotency/concurrency guarantees.| [`development/ASSETS_MODULE.md`](development/ASSETS_MODULE.md) | The Assets module (ASSET-01 + ASSET-02): things of value as first-class `asset` entities + the STRICT `asset_details` slice (migration `0016`), the reserved-type atomic `AssetRepository`, **integer minor-unit money** (never floats — ADR-049), the real-world-status-vs-record-archive split, wall-calendar owner-timezone dates, the controlled type/status vocabularies + subtype icons, the `/assets` collection and the canonical record — **plus ASSET-02** (migration `0025`, [ADR-063](decisions/ARCHITECTURE_DECISIONS.md#adr-063-asset-ownership-history--canonical-facts-recorded-events-and-future-obligations-as-three-separate-things)): the three-way split between canonical facts, recorded **history** (`asset_events`, one model for fourteen categories) and future **obligations** (`asset_obligations`, nine categories) with forward-only fact projection; date-based AND meter-based maintenance over a bounded five-unit meter vocabulary with no conversion and an honest "reading needed" state; recurrence anchored on the day the work was done, producing exactly one successor; the **Task authority contract** (completing a Task never asserts the work happened); the Today section and its stated deduplication rule; recorded-cost totals that never claim a cost of ownership and never mix currencies; value history that refuses to call two points a trend; and the deferred scope (attachments/R2/OCR/ingestion/depreciation/fleet/notifications). |
| [`development/PWA_AND_OFFLINE.md`](development/PWA_AND_OFFLINE.md) | Installation, the service worker and offline DalyHub: what is and is not available offline, the three-layer architecture, the manifest and device metadata (and why the manifest link must send credentials behind Cloudflare Access), the cache strategy and the ONE cacheable HTML document, the precache set and why it is small, update behaviour, the seven-day retention window and its timezone rules, the minimised offline data model field by field, identity/workspace namespacing, the append-only capture queue and its database-level idempotency, the ten Cloudflare Access scenarios, the privacy claims that are NOT made, the schema ladder and its recovery paths, the testing matrix and the manual device checklist, the known limitations, the measured budgets, operator troubleshooting and rollback. |
| [`development/UNIVERSAL_CAPTURE.md`](development/UNIVERSAL_CAPTURE.md) | External capture (CAPTURE-01): the one universal capture contract every surface feeds, the `POST /api/capture` endpoint and its error model, deterministic conservative classification and the Inbox fallback, scoped `dhcap_` capture credentials (hashed, revocable, workspace-bound) and the Settings surface that mints them, idempotency reused from the offline receipt protocol, per-credential rate limits, the Apple Shortcut / Siri / iOS Share Sheet setup, Cloudflare email capture and its sender verification, the required Cloudflare Access bypass, the security and privacy model, troubleshooting, and the manual iPhone and email acceptance checklists. |
| [`development/REVIEWS_MODULE.md`](development/REVIEWS_MODULE.md) | The Reviews module (REVIEWS-01): durable weekly/monthly/quarterly/annual/custom Review records, wall-calendar periods, typed detail + section storage (migration `0018`), duplicate standard-period protection, internal template versioning, authored Markdown reflection, live bounded period context, Linked Items, Activity privacy, lifecycle, search, commands, responsive/accessibility notes and deferred scope — **plus the REVIEW-02/REVIEW-04 guided weekly Review**: the canonical seven-step model, persisted-versus-derived workflow state (migration `0029`), resume semantics, the URL contract, Inbox integration, the Project review projection, Goal/Area alignment, the next-period focus handoff, completion rules, the desktop rail, the phone stepper, accessibility, concurrency and query bounds. |

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
    │   ├── UX_01_IMPLEMENTATION_NOTE_2026_07_28.md
    │   ├── X_04_EXPORT_AUDIT_2026_08.md
    │   └── IMPLEMENTATION_WORKFLOW.md
    ├── release/
    │   ├── RELEASE_NOTES_V2.md
    │   ├── RELEASE_CHECKLIST_V2.md
    │   ├── RELEASE_NOTES_V2_0_1.md
    │   └── RELEASE_CHECKLIST_V2_0_1.md
    ├── roadmap/
    │   ├── ROADMAP_V2.md            (closed at the V2 release)
    │   ├── ROADMAP_V2_1.md          (V2.1)
    │   └── ROADMAP_V2_2.md          (V2.2 — where new work goes)
    ├── design/
    │   ├── DESIGN_SYSTEM.md
    │   ├── THEME_ACCEPTANCE_MATRIX.md
    │   ├── M3_POLISH_AUDIT.md          (post-M3 visual audit + design targets)
    │   ├── M3_POLISH_HANDOFF.md        (PR #121 in-flight state + next steps)
    │   ├── assets/theme-02-2026-08/    (Modern pair screenshots)
    │   ├── assets/m3-polish-2026-08/   (reference mock-up, audit + gate captures)
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
        ├── BACKUP_AND_RESTORE.md
        ├── DEPLOYMENT.md
        ├── DATA_KERNEL.md
        ├── MODULES.md
        ├── SPINE_MODEL.md
        ├── EXPORT_AND_PORTABILITY.md
        ├── MARKDOWN_PIPELINE.md
        ├── APP_SHELL_AUTH.md
        ├── ACTIVITY_TIMELINE.md
        ├── IDENTITY_AND_ACTORS.md
        ├── SHARED_FORMS.md
        ├── SHARED_SEARCH.md
        ├── COMMAND_PALETTE.md
        ├── FEEDBACK_AND_INSPECTOR.md
        ├── SETTINGS_LAYOUT.md
        ├── HELP_AND_ABOUT.md
        ├── AI_PLATFORM.md
        ├── SETTINGS_MODULE.md
        ├── UNIVERSAL_CAPTURE.md
        ├── PROJECTS_MODULE.md
        ├── AREAS_MODULE.md
        ├── GOALS_MODULE.md
        ├── NOTES_PERSISTENCE.md
        ├── DIARY_MODULE.md
        ├── PEOPLE_MODULE.md
        ├── MEETINGS_MODULE.md
        ├── ASSETS_MODULE.md
        ├── REVIEWS_MODULE.md
        └── VIEWS_MODULE.md
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
