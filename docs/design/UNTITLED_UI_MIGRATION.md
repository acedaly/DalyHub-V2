# Untitled UI migration guide

> DalyHub is progressively rebuilding its presentation layer around Untitled UI
> React Pro, Untitled Application UI patterns, Tailwind CSS v4 and React Aria.
> Backend, database, migrations, Cloudflare infrastructure, API contracts and
> business logic remain out of scope for this frontend reset.

## Current frontend debt

- Legacy CSS still carries `--dh-*`, `--app-*` and `--md-*` compatibility
  vocabulary.
- Some shared primitives predate Untitled adoption and should be replaced by
  Untitled source when their consumers migrate.
- Some feature components mix product decisions, presentation state and mutation
  wiring in one file, making visual migration riskier than it needs to be.
- Historical design documents and screenshots described Material, MD3, DHDS and
  bespoke DalyHub patterns; those are superseded by
  [`UNTITLED_UI_IMPLEMENTATION.md`](UNTITLED_UI_IMPLEMENTATION.md).
- Untitled-derived shell, Today and Tasks work already exists, but the remaining
  modules still need consumer-by-consumer migration.

## Reusable backend and domain logic

Preserve existing domain authorities during UI migration:

- Area -> Goal -> Project -> Task hierarchy, rollups and workspace isolation.
- EntityLinks, Activity, lifecycle, search, command and export/restore
  contracts.
- Task recurrence, dependency, blocked, waiting, priority, selection,
  scheduling, due-date and checklist semantics.
- Habit schedule chains, owner-local check-ins, no-overdue behaviour and
  no-manufactured-streak rule.
- Planning's projection over Task `scheduled_date`; no separate planning record.
- Today bucketing, overdue logic, schedule integration, quick capture and
  deterministic "what now" behaviour.
- Notes exact Markdown preservation, safe preview/rendering and dirty/save
  behaviour.
- Diary chronology and owner-timezone semantics.
- Meetings attendees, decisions, follow-through items, canonical Task conversion
  and occurrence history.
- People relationship history and privacy/care language.
- Finance signed money, privacy, import and truthful-balance semantics.
- Assets real-world status, obligations, maintenance/value facts and attachment
  boundaries.
- Life Admin obligation semantics.
- Reviews period workflow, guided review state and reflective tone.
- AI proposal architecture: propose, explain and await approval before mutation.

Durable homes for these requirements are the development module docs, product
principles and ADRs. Design migration may reorganise UI, but it must not
reinterpret the model.

## Coupled presentation/business logic

When touching a feature surface, audit for:

- route actions or fetchers embedded directly in row/card controls;
- CSS classes that encode domain state instead of receiving a typed status;
- view-local recurrence, owner-day, money or progress calculations;
- duplicated empty/error/loading copy across modules;
- per-feature overlays, menus, drawers, tabs, tables or badges that can become
  Untitled primitives plus DalyHub composition;
- keyboard/touch/focus behaviour implemented locally instead of through React
  Aria or a shared composition.

Extract only when it reduces migration risk or prevents domain drift. Do not
rewrite repositories, migrations or service contracts as part of visual work.

## Preserved requirements from removed design records

The historical design files were classified before removal:

| Source area | Preserve as product/domain behaviour | Preserve as still-valid UX | Delete/supersede as obsolete visual implementation |
| --- | --- | --- | --- |
| Tasks, recurrence and dependencies | Recurrence decides when an occurrence exists; dependencies decide whether an existing Task can proceed. Dependency links are directed EntityLinks. Blocked is derived. Dependencies never move the owner's plan. Recurrence uses one successor authority, owner-day strings and inclusive end-date semantics. | One blocked label should say why. Dependency rows should be concise and editable only from the blocked end. | Old screenshots, MD3 surfaces, bespoke row styling and measurement evidence. |
| Checklists | Checklist items are not Tasks, have one durable level, do not affect Project/Goal progress, clone to recurring successors with completion reset and do not auto-complete Tasks. | Checklist editing remains keyboard/touch operable; reorder only when persisted and conflict-aware. | Old checklist visuals and custom drag presentation. |
| Habits | A Habit is a behaviour, not a recurring Task. It never goes overdue, never creates Task rows, belongs to an Area and may support a Goal, uses effective-dated schedules and owner-local check-ins. No manufactured streaks, guilt scores or red miss states. | Compact checkable rows, week/history context, Today band below the day's work, and clear "not scheduled today" language. | Old habit table/card visuals and screenshot-based layout measurements. |
| Planning | Planning stores no separate record; a Task's `scheduled_date` is the plan. The queue and day placement use existing Task mutation authority. Habits are context, not plannable Tasks. | Board/list composition may change, but it must stay responsive, keyboard reachable and honest about day placement. | Visual-reference rebuild notes, old rail dimensions and screenshot measurements. |
| Today | Today is execution before dashboard: first useful task, next real meeting, today's plan, schedule, habits, goals/attention and relevant activity. It does not invent task times, focus timers, workload scores or AI rankings. | The first viewport answers "what do I do now?" and mobile order follows product priority. | Command-centre screenshots, duplicate visual audits and old dashboard-card arrangements. |
| Goals | Goal progress remains truthful: explicit completion, measurable progress, Project contribution, recent movement and supporting Habits are distinct facts. | Goal surfaces should show status, milestones, progress, activity and next action without hiding unmeasured Goals. | Old bespoke Goal cards, identity palettes and chart treatments. |
| Projects / Areas | Projects are finite; Areas are ongoing. Rollups and spine hierarchy remain authoritative. | Shared lists/tables/cards, progress, status, filters, tabs and drawers. | Old spatial/gallery visual systems and convergence screenshots. |
| Notes | Notes preserve exact Markdown source, safe preview and writing-first reading space. | List-detail composition, search, metadata, tags and responsive collapse. | Old document-column styling and visual reference records. |
| Diary | Diary is date-led, chronological and reflective. | Content-first layout and calm capture/edit paths. | Old typography/surface experiments. |
| Meetings | Meetings prioritise outcomes: date/time, participants, summary, decisions, actions, tasks, notes, transcript and attachments. | Detail layouts should make follow-through visible without turning minutes into clutter. | Old meeting surface styling and bespoke status pills. |
| Capture | Capture is universal, fast and canonical: capture first, enrich later, route through existing authorities. | Global capture and contextual add actions remain reachable on desktop and phone. | Old duplicate capture panels and screenshot-specific placement. |
| Offline/PWA | Offline support keeps a minimised, owner-scoped capture/task model with honest limitations and recovery paths. | Mobile install/offline states should be clear and calm. | Old mobile visual frames and reference screenshots. |
| Product Experience | DalyHub remains a calm personal operating system with stable navigation, direct manipulation, progressive disclosure and no dead ends. | One shell, one row grammar, contextual overlays, record/drawer patterns and accessible mobile behaviour. | Material/MD3/DHDS token architecture, old theme experiments and visual north-star screenshots. |

## Migration phases

Preferred order:

1. Theme/tokens/foundation.
2. Shared Untitled primitives.
3. Application shell.
4. Today.
5. Tasks.
6. Goals.
7. Projects / Areas.
8. Meetings.
9. Notes / Diary.
10. Habits.
11. People.
12. Finance / Assets / Life Admin.
13. Reviews.
14. Reports / Insights.
15. AI Assistant.
16. Settings.
17. Remaining secondary/admin surfaces.
18. Remove remaining legacy UI/styles.

Each phase should migrate a coherent consumer set, verify behaviour, then delete
the displaced legacy UI. Do not run a broad frontend rewrite as one change.

## Dependencies

- Licensed Untitled UI React Pro source and configured discovery workflow.
- Tailwind CSS v4 theme/token foundation.
- React Aria Components behaviour and accessibility contracts.
- Existing DalyHub test fixtures, seeded flows and module docs.
- Documentation link checking after deleting historical design files.

## Risks

- Copying Untitled Application UI too literally can produce generic SaaS screens
  instead of DalyHub surfaces.
- Leaving old and new primitives side by side too long can create interaction
  drift.
- Migrating presentation without extracting typed domain state can duplicate
  business logic in components.
- Removing historical files without preserving domain rules can erase product
  intent.
- Screenshot-led migration can resurrect obsolete Material/MD3/DHDS decisions.

Mitigation: follow the authority hierarchy, preserve behaviour first, test the
real flow and delete old UI only after consumers are migrated.

## Testing

For each migrated surface, verify:

- unit coverage for extracted pure/domain helpers;
- route/action tests for preserved mutation and loader contracts;
- component tests for visible behaviour, keyboard paths and accessible names;
- Playwright or equivalent flow coverage for high-value journeys;
- 393px and 320px responsive checks for user-facing interaction surfaces;
- light and dark appearances;
- no horizontal overflow;
- docs link check when documentation changes.

## Definition of done for a migration phase

- Untitled Application UI and component sourcing is recorded in the PR.
- Existing product/domain behaviour is preserved or an ADR explicitly changes it.
- Generic controls come from Untitled source where available.
- DalyHub-specific behaviour lives in a composition above the primitive.
- Light/dark, keyboard, touch, focus and responsive behaviour are verified.
- Legacy CSS/components displaced by the phase are deleted.
- Documentation and inbound links are updated.
- No backend/database/business logic changed unless the roadmap item explicitly
  required it.

## Criteria for removing legacy UI

Remove a legacy component, stylesheet, token group, screenshot or document when:

- no active consumer imports it;
- tests cover the replacement behaviour;
- docs point to the Untitled authority or durable domain docs;
- any retained product requirement is captured in product, development, ADR,
  design direction, design system or this migration guide;
- it exists only to explain Material, MD3, DHDS, old CSS/token architecture,
  abandoned redesign briefs, old audits or screenshot evidence.

Git history is the archive. Do not keep obsolete design files merely for
reference.
