# DalyHub UX/Product Audit - August 2026

**Reviewed branch:** `main`  
**Reviewed commit:** `1cd3df4c9bbcd8d13e51d0dd7ab78354f02aab30` (`VIS-01: Visual convergence refinement against reference design`)  
**Audit date:** 2026-08-09  
**Primary product area:** Tasks

This audit reviews DalyHub V2 as a personal life-management application, not an enterprise project-management system. It gives extra weight to Tasks because Tasks is the surface that most determines whether DalyHub can become a daily driver.

## Executive summary

1. **The expected core Tasks blocker is no longer true on `main`.** A Task can exist without a Project or Area. Inbox is a first-class state and `/tasks?system=inbox` is a real view, not an error bucket.
2. **Tasks is now one of DalyHub's stronger modules.** Quick capture, inline row edits, system views, saved filters, bulk actions, mobile long-press selection, recurrence modes and optimistic presentation all exist on the current branch.
3. **The next product step should not be a broad visual redesign.** The highest-value next change is a focused Tasks/Today daily-driver hardening pass: attention correctness, wording truth, missing E2E coverage and recurrence-capture edge cases.
4. **Task capture is correctly title-first in the fastest path.** Global capture and in-workspace quick add can create an Inbox Task from text alone through the same atomic `/tasks/new` route.
5. **Natural-language task entry should stay deterministic for now.** The current parser handles useful personal-task patterns without AI. The gap is narrower: it cannot author after-completion recurrence phrases such as "every 6 months after completion."
6. **Recurrence 2.0 is structurally sound.** Fixed schedule and after-completion modes are explicit data, not inferred prose. The main known limitation is ordinal monthly recurrence.
7. **Today is calmer and better separated from Tasks than before.** It answers "what matters today" instead of duplicating the Tasks workspace. However, it currently labels scheduled-today work as "Due today" and its Inbox attention count is derived from a bounded planning read.
8. **There is an unresolved Today/Assets product contract.** Existing architecture docs still describe asset obligations reaching Today when no linked Task exists, but the current Today attention rail has no asset kind.
9. **Selection controls are mostly fixed.** Optional selects now behave as unset rather than fake preselected values. The remaining issue is accessibility naming of clear controls.
10. **The visual language is coherent enough to build on.** The MD3 token system, shared card family, collection layout, writing surface and M3 Expressive hierarchy rules are now real infrastructure, not just guidance.
11. **The product still has pockets of accumulated presentation debt.** Remaining issues are not "redesign everything" problems. They are targeted issues in Today, select clear controls, editor toolbar affordances, stale docs and a few unused shared presentation branches.
12. **Mobile Tasks has crossed the baseline but still needs acceptance discipline.** The code has phone-specific patterns and tests, but future Tasks changes should keep a 320/375/390/430px acceptance matrix as a hard gate.
13. **Offline is not ready for full Task management.** Offline capture has an idempotency path, but completion, recurrence, rescheduling and row edits are not yet a complete offline mutation queue.
14. **No P0 issue was found.** The current `main` is not blocked by data-integrity or core usage failures in Tasks.

## Product assessment

DalyHub now feels much more like one application than a collection of isolated modules. Recent M3, M3 Expressive, Daily Driver and visual convergence work has converged the shell, collections, cards, navigation, writing surfaces, field controls and task rows around shared primitives.

What the product does well today:

- The Area -> Goal -> Project -> Task spine is visible without forcing every Task into the spine at capture time.
- Tasks, Today, Projects, Areas, Goals and Notes share more layout vocabulary than they used to: collection headers, cards, drawers, menus, fields, empty states and writing surfaces.
- The MD3 token layer is authoritative. The product is not drifting back to arbitrary theme values or module-level color systems.
- Today has the right product instinct: it is a working surface for the day, not an analytics dashboard.
- Tasks now supports high-frequency work in the list itself.

What still prevents the product from feeling finished:

- Some docs still describe older states, especially the pre-V2.2 Tasks baseline.
- A few user-facing labels and counts do not match the exact data model they summarize.
- Some lower-level shared primitives still have small accessibility or dead-branch debts.
- Important daily-driver guarantees depend on tests that are present in pieces but not yet complete as a single acceptance story.
- Offline Tasks is still a future capability, so architectural choices for recurrence and optimistic updates need to keep replay and conflict resolution in mind.

## Tasks deep dive

### Current state

Tasks is now built around a list-first daily-driver model. The current implementation uses:

- `app/modules/tasks/TasksWorkspace.tsx` for the list workspace.
- `app/modules/tasks/TasksQuickAdd.tsx` for in-workspace capture.
- `app/modules/tasks/NewTaskForm.tsx` and `app/modules/tasks/routes/new.tsx` for atomic creation.
- `app/shared/capture/TaskCapturePanel.tsx` for global task capture.
- `app/shared/task-record/quick-capture.ts` for deterministic parsing.
- `app/shared/task-record/TaskRowFields.tsx` for row-level edits.
- `app/shared/task-record/TaskRecurrenceEditor.tsx` and `app/kernel/tasks/task-recurrence.ts` for recurrence.
- `app/kernel/task-views/task-system-views.ts` for built-in system views.

### Capture

The current model supports the intended capture sentence:

> "I need to remember something" -> captured.

Evidence:

- The route accepts no parent and intentionally creates an unassigned Inbox Task.
- Global capture uses a single required title field, optional priority/date chips and an optional parent picker.
- `/tasks` quick add posts to the same creation route and preserves entered text on failure.
- The parser can consume useful shorthand such as priority, today/tomorrow/weekday dates, time sectors and simple recurrence.

The high-value capture gap is not "make Project optional" anymore. It is already optional. The remaining gap is that the full task creation form still feels more like a compact form than a pure task composer, while the fastest paths are already good.

### Inbox

Inbox is first-class:

- An Inbox Task is an active open task with no structural parent.
- `/tasks?system=inbox` is a built-in view.
- The row parent control exposes "Move to Inbox."
- Today can link to the Inbox when it sees unfiled tasks.

Inbox should stay lightweight. The next improvements should be quick triage and truth of counts, not a bureaucratic review system.

### Natural language

The current deterministic parser is the right architecture for now. It avoids an AI dependency for common personal-task phrases and keeps capture fast, local and testable.

Supported direction:

- "Call Mum tomorrow"
- "Submit SAF19 paper Friday"
- "Pay rego 15 November"
- "Finish module pathway next Monday p1"
- simple `every ...` recurrence

Gap:

- "Service Hilux every 6 months after completion" cannot be captured as after-completion recurrence in one step. The model supports the mode; quick capture does not author it.

Recommendation: extend deterministic parsing before considering AI. AI proposals belong later, after the user can review structured suggested changes, and should not be required for ordinary capture.

### Recurrence

Recurrence is much stronger than a primitive repeating field:

- fixed schedule and after-completion modes are explicit;
- daily, weekdays, weekly, monthly, yearly, custom intervals and selected weekdays are covered;
- skip, stop repeating and series scoping are modeled;
- completed occurrences are retained and future occurrence generation is incremental.

Known limitation:

- Ordinal monthly patterns such as "first Monday of every month" are not expressible.

Near-term recommendation: do not expand recurrence until after the daily-driver hardening pass, except for deterministic capture of after-completion phrases.

### Task list interaction

Most ordinary work can happen without leaving the list:

- complete/reopen;
- rename;
- change priority;
- change due date;
- change planned date;
- move between Project/Area/Inbox;
- select, bulk edit, bulk delete/restore;
- open details only when the user needs the full record.

The risk has flipped. Earlier DalyHub needed more row capability. Current DalyHub needs to preserve lightness while keeping row metadata from turning into badge soup. Metadata should keep receding behind the title.

### Selects

The shared selection model is materially better than the failure mode described in the prompt:

- "No priority" and "Unassigned" are unset states, not fake chosen options.
- Replacing a Project/Area selection does not require clearing first.
- Inline select clear commands are specific.

Remaining debt: generic form/sheet select clear controls are still all named "Clear selection" for assistive tech.

### Information architecture

The built-in Tasks views are appropriate:

- Inbox
- Today
- Upcoming
- Overdue
- Waiting
- Delegated
- Someday
- Completed
- Deleted
- All active

The product does not need an Eisenhower Matrix. It was intentionally removed and should not return under a different name unless future usage evidence proves it.

### Filtering and sorting

Tasks now has a powerful declarative filter/sort model. The initial capability is proportionate because it is behind controls and saved views rather than sprayed across the row. Future work should avoid adding more visible filters by default. Saved custom filters are useful, but they should remain a power feature.

### Visual design

Tasks is no longer Jira-like. It is closer to a personal productivity list with inline controls. The row still needs discipline:

- priority must be recognizable without overpowering the title;
- dates should distinguish deadlines from planned work;
- recurrence indicators should remain compact;
- completed state should be immediate and calm;
- hover-only affordances must always have a mobile and keyboard equivalent.

## Mobile/iPhone assessment

Mobile Tasks is treated as a first-class surface in code:

- long press enters selection mode on touch devices only;
- checkboxes and labelled controls remain the accessible path;
- recurrence editor is single-column with 44px weekday controls;
- bulk actions use a bottom action row;
- the design docs require 320, 375, 390 and 430px verification.

Remaining concern: every future Tasks PR must keep real phone acceptance in scope. A desktop-valid row change can still fail the product if the 320px row wraps into noise, if a sheet traps focus, or if the primary capture path becomes a squeezed desktop modal.

## MD3 Expressive assessment

The product is using MD3 in a disciplined way:

- generated `--md-sys-*` color roles;
- `--md-app-*` surfaces;
- `--app-*` structural tokens;
- one expressive hierarchy rather than per-module experiments;
- shared card and collection primitives;
- motion and state rules that favor causality over decoration.

Where it can still be more expressive:

- Today attention rows can use stronger semantic hierarchy without adding dashboard noise.
- Task Inbox could have a clearer first-viewport identity as a legitimate capture space.
- Empty states can be concise but more product-specific.
- Mobile sheets and FAB/capture states can carry more confident shape and hierarchy.

What should not happen:

- no new color system;
- no gradients as a substitute for hierarchy;
- no new component library;
- no reintroduced Matrix;
- no AI-first capture experience.

## Apple-polish assessment

The main polish opportunities are small but consequential:

- labels must match model truth ("Due today" is not accurate for scheduled-today work);
- toolbar and filter controls need to stay out of the way until needed;
- editor toolbars need clearer overflow behavior;
- row metadata needs hierarchy so titles remain first;
- generic clear controls need field-specific accessible names;
- Today should not carry dead or stale documented contracts.

This is Apple-like polish in the useful sense: clarity, restraint, accurate naming and predictable interaction.

## Cross-product consistency

DalyHub now mostly reads as one product. Shared infrastructure is doing the work:

- application shell and navigation;
- collection header anatomy;
- Card and EntityCard families;
- shared drawer/sheet primitives;
- shared forms and field controls;
- shared writing surface;
- shared empty/loading/error primitives;
- shared search and command palette.

Remaining divergence is narrower:

- Today/Assets documentation vs implementation;
- generic select clear naming;
- legacy or unused CardCollection presentations;
- chart styles split across shared and module stylesheets;
- low-severity UI quality findings already recorded in the UI quality audit.

## Technical UX debt

The debt raised or emphasized by this audit is product-cost debt, not general tidiness:

- Today can understate Inbox attention when the bounded planning read truncates unscheduled backlog.
- Today labels scheduled-today work as "Due today."
- Quick capture cannot create after-completion recurrence in one step.
- Offline Tasks is not mutation-complete.
- Select clear controls have repeated accessible names.
- Completed-task announcements are currently duplicated for assistive tech.
- Ordinal monthly recurrence is deliberately not modeled.

These should be fixed in focused changes, not a mega-refactor.

## Scores

| Area | Score | Rationale |
|---|---:|---|
| Overall product coherence | 8/10 | Shared shell, cards, collections, fields and tokens now dominate. Remaining divergence is localized. |
| Visual polish | 7/10 | Good foundation and much improved convergence; still some label, density and low-level polish debts. |
| MD3 implementation | 8.5/10 | Token system and generated palette are strong and authoritative. |
| MD3 Expressive character | 7/10 | Controlled hierarchy exists, but some screens remain conservative. |
| Mobile UX | 7.5/10 | Tasks has real phone patterns; continued viewport acceptance is required. |
| Desktop UX | 8/10 | Efficient and coherent without becoming enterprise-heavy. |
| Tasks | 8.5/10 | Strong daily-driver foundation; remaining issues are hardening and edge cases, not the core model. |
| Today | 7/10 | Calm and focused, but attention truth and documented Assets contract need resolution. |
| Goals | 8/10 | Measurable Goals are substantially stronger; a few wording/layout debts remain. |
| Projects | 8/10 | Strong shared record/collection behavior. |
| Areas | 8/10 | Coherent with the spine and shared record patterns. |
| Editors | 7.5/10 | One writing surface is a major win; toolbar overflow/polish remains. |
| Navigation | 8/10 | Primary modules are reachable and mobile has appropriate patterns. |
| Accessibility | 8/10 | Strong test posture; remaining select naming and double announcement issues are real but bounded. |
| Perceived performance | 8/10 | Tasks optimistic contract materially improves feel; broader performance was not re-profiled in this audit. |

## Prioritized findings

### P0 - Broken

None found.

### P1 - Daily-driver blockers

- **TODAY-09:** Resolve Today attention truth: decide and implement the Assets obligation contract, correct Today wording for scheduled-vs-due work, and make Inbox attention count authoritative.
- **TASKS-10:** Complete the daily-driver verification pass before building new task features: missing bulk-bound E2E, phone capture/list acceptance, recurrence browser journeys and accessibility announcement cleanup.

### P2 - Major quality improvements

- **TASKS-11:** Extend deterministic quick capture for after-completion recurrence and a small set of high-confidence personal-task phrases.
- **PWA-12:** Define and implement the first offline Task mutation slice after capture: completion/reopen, title/date/priority edits, conflict behavior and recurrence replay.
- **DS-17:** Give select clear controls field-specific accessible names and migrate brittle label selectors in tests.
- **TODAY-10:** Review whether Today should show "For today" as one bucket or split planned vs due inside the Focus panel.

### P3 - Polish

- Ordinal monthly recurrence.
- Dedicated Timeline treatment for skipped recurrence events.
- Editor toolbar overflow affordance.
- Dead CardCollection grid/board branch decision.
- Shared chart stylesheet consolidation.
- Completed Task double-announcement cleanup if not handled in TASKS-10.

## Recommended roadmap

### NOW

1. **TODAY-09 - Attention rail truth and Tasks/Today wording.**
2. **TASKS-10 - Daily-driver verification and capture polish.**
3. **DS-17 - Select clear-control naming.**

### NEXT

1. **TASKS-11 - Deterministic natural-language capture v2.**
2. **PWA-12 - Offline Task mutation slice.**
3. **TODAY-10 - Today focus panel refinement after TODAY-09.**

### LATER

1. **TASKS-12 - Ordinal monthly recurrence, only if owner routines need it.**
2. Broader cross-product mobile polish.
3. Analytics or richer review surfaces once daily capture and attention are trusted.

### DEFERRED / NOT PLANNED

- Eisenhower Matrix replacement.
- AI task prioritization or autonomous rescheduling.
- Jira-like subtasks/dependencies/Gantt.
- Collaboration or multi-user assignment.
- Notifications/push reminders until the in-app attention model is correct.
- Broad visual redesign before the daily-driver hardening work.

## Priority implementation sequence

### PR A - TODAY-09: Attention rail truth and wording

**Objective:** Make Today truthful about what needs attention.  
**User benefit:** The owner can trust Today as the daily entry point.  
**Scope:** Assets obligation decision/consumer, Inbox count truth, "Due today" wording, targeted Today tests.  
**Likely files:** `app/modules/today/day/load.ts`, `app/modules/today/day/TodayScreen.tsx`, `app/modules/today/day/attention-view.ts`, `app/kernel/assets/asset-today.ts`, Today E2E/unit tests, relevant docs.  
**Dependencies:** Product decision: restore asset obligations to Today or retire the documented contract.  
**Migrations:** None expected.  
**Tests:** Today loader unit tests, Today mobile E2E, asset-obligation Today journey.  
**Risks:** Overloading Today into a dashboard.  
**Non-goals:** Push notifications, calendar/weather, analytics cards.

### PR B - TASKS-10: Daily-driver verification and capture polish

**Objective:** Lock the current Tasks daily-driver behavior with acceptance tests and small interaction cleanup.  
**User benefit:** Fast task capture and editing stay reliable as future changes land.  
**Scope:** Bulk-bound E2E, phone viewport acceptance, recurrence mode browser journey, duplicate announcement decision, capture composer review.  
**Likely files:** `e2e/tasks-v22-daily-driver.spec.ts`, `e2e/tasks-optimistic.spec.ts`, `app/modules/tasks/TasksWorkspace.tsx`, `app/shared/capture/TaskCapturePanel.tsx`, feedback API if announcement cleanup is included.  
**Dependencies:** Playwright browser availability in local/CI.  
**Migrations:** None.  
**Tests:** Unit, kernel and E2E around capture, row edits, bulk, recurrence and 320/375/390/430px.  
**Risks:** Trying to redesign Tasks while hardening it.  
**Non-goals:** New views, AI parsing, offline editing.

### PR C - TASKS-11: Deterministic capture v2

**Objective:** Support high-confidence personal task phrases without AI.  
**User benefit:** "Service Hilux every 6 months after completion" can be captured correctly in one step.  
**Scope:** Parser grammar, structured recurrence mode output, form-data translation, tests.  
**Likely files:** `app/shared/task-record/quick-capture.ts`, `app/modules/tasks/routes/new.tsx`, `app/shared/capture/TaskCapturePanel.tsx`, `TasksQuickAdd.tsx`, parser tests.  
**Dependencies:** TASKS-10 acceptance baseline.  
**Migrations:** None.  
**Tests:** Parser unit tests, create route kernel tests, one E2E capture journey.  
**Risks:** Over-parsing ordinary titles.  
**Non-goals:** AI, arbitrary natural-language understanding, autonomous metadata.

### PR D - DS-17: Select clear-control naming

**Objective:** Make clear controls specific and test selectors role-based.  
**User benefit:** Screen-reader users can tell which field a clear button affects.  
**Scope:** Convert affected tests from `getByLabel` to role queries, then rename clear controls.  
**Likely files:** shared form/select controls and E2E/component tests.  
**Dependencies:** None.  
**Migrations:** None.  
**Tests:** Form/select unit tests and affected E2E paths.  
**Risks:** Selector churn if mixed with feature work.  
**Non-goals:** Redesigning selects.

### PR E - PWA-12: Offline Task mutation slice

**Objective:** Define and implement the first offline Task editing capability beyond capture.  
**User benefit:** Completing or rescheduling a Task on a phone remains trustworthy without a connection.  
**Scope:** Mutation queue contract, conflict behavior, replay idempotency, recurrence interaction.  
**Likely files:** offline snapshot/queue modules, Task mutation routes, PWA docs, tests.  
**Dependencies:** TASKS-10 so the online behavior is locked first.  
**Migrations:** Possibly IndexedDB schema only; no D1 migration expected until design proves need.  
**Tests:** Offline unit tests, replay tests, one browser offline journey.  
**Risks:** Conflict semantics can become broad quickly.  
**Non-goals:** Full offline DalyHub, background sync, push notifications.

### PR F - TASKS-12: Ordinal monthly recurrence

**Objective:** Add "first Monday" style recurrence only if the owner needs it.  
**User benefit:** More real-world routines can be modeled cleanly.  
**Scope:** Rule shape, editor controls, occurrence generation, migration, export.  
**Dependencies:** Evidence of need; not needed for the immediate daily-driver pass.  
**Risks:** Calendar edge cases and migration complexity.  
**Non-goals:** Cron expressions or enterprise scheduling rules.

## Quick wins

No product-code quick wins were implemented in this audit. The safe changes made here are documentation changes: roadmap/debt alignment and removal of stale Tasks module guidance. The tempting one-line Today label fix was intentionally left for TODAY-09 because the better product fix also needs the Assets obligation decision and Inbox count truth.

## Verification

- `git fetch origin main` confirmed the reviewed branch was current.
- `node ./e2e/setup-dev-auth.mjs` confirmed development auth configuration existed.
- `node ./e2e/setup-local-db.mjs` migrated and seeded the local D1 workspace.
- A local dev server was started successfully with `pnpm exec react-router dev --port 4173`.
- Browser screenshots could not be captured because the Playwright Chromium binary is not installed in this environment.

No product code was changed by this audit, so verification focuses on documentation formatting and targeted existing tests after the doc edits.

## Final recommendation

Build **TODAY-09 and TASKS-10 next** as one narrow daily-driver hardening sequence. Do not start with a new visual polish pass, AI task capture, a Matrix replacement, notifications or offline editing. First make the current Tasks/Today loop completely trustworthy: Today attention truth, task capture/list acceptance, missing E2E coverage and the few accessibility issues that affect high-frequency task work.

## Related documents

- [`ROADMAP_V2_2.md`](../roadmap/ROADMAP_V2_2.md)
- [`PRODUCT_DEBT.md`](PRODUCT_DEBT.md)
- [`TASKS_MODULE.md`](../development/TASKS_MODULE.md)
- [`TODAY_DASHBOARD.md`](../development/TODAY_DASHBOARD.md)
- [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md)
