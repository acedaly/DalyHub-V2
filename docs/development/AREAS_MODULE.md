# AREAS_MODULE.md — The Areas module (AREA-01)

The first real **Areas** module: browse the owner's permanent life domains, create
an Area, open the canonical Area record, understand its live hierarchy and
momentum, rename it, and review direct Area Activity. It is composed from the
shared design system and the FND-07 spine — no second Area model, no migration.

Accepted via
[ADR-038](../decisions/ARCHITECTURE_DECISIONS.md#adr-038-area-overview--read-only-spine-projection-and-derived-momentum).

## Data ownership

Areas are first-class spine records. AREA-01 adds **no persisted state**:

| Concern | Authority |
| --- | --- |
| Area identity, title and lifecycle | `SpineRepository` |
| Area parentage | none; Areas have no structural parent |
| Displayed Area roll-ups | live derived spine counts |
| Collection and record presentation | `AreaRepository` read-only projection |
| Project workflow and project health facts | existing Project projections / Project health model |
| Event history | the shared Activity stream |

`AreaRepository` (`app/kernel/areas` plus the D1 adapter) is storage-independent at
the contract boundary and read-only. It performs bounded, deterministic,
workspace-scoped, parameterised reads through `WorkspaceScope.areas`; React routes do
not query D1 directly. It resolves an Area's Goals, direct Area Projects,
Goal-backed Projects, and descendant roll-up facts without copying titles,
hierarchy or roll-up counts into another table.

Area creation and rename are mutations and therefore go only through
`WorkspaceScope.spine`: `createArea({ title })` and `rename(areaId, title)`. Area
creation requires a title and no parent. AREA-01 does not implement Area completion,
deletion, archival, restoration or Goal creation.

## Routes

Registry-discovered (`app/modules/areas/routes.manifest.ts`), composed by the shell:

| Route | Kind | Responsibility |
| --- | --- | --- |
| `GET /areas` | page | Areas collection, plus keyset "Load more" pages. |
| `POST /areas/new` | resource | Create an Area via `spine.createArea`; returns a typed JSON outcome. |
| `GET /areas/:areaId` | page | Canonical Area record: Summary, Goals, Projects, Activity. |
| `POST /areas/:areaId/mutate` | resource | Rename the verified active Area via `spine.rename`. |
| `GET /areas/:areaId/activity` | resource | One bounded DS-05 Timeline page over `activity.listForEntity(areaId)`. |

The static `/areas/new` segment is registered before `/areas/:areaId`. Missing,
deleted, wrong-kind and cross-workspace Area ids fail closed with the same calm
not-found outcome. Resource routes resolve the trusted workspace and actor on the
server; no client-supplied workspace or actor is accepted.

## Composition

- **Collection** (`AreasCollection.tsx`) uses PX-02 `CollectionLayout`, DS-04
  `Card`, shared `EmptyState`, shared `LoadMore`, and a DS-03 Drawer trigger for
  New Area (`?drawer=new-area`). Cards are real links to `/areas/:areaId` and the
  subtitle reports loaded rows honestly when more pages exist.
- **New Area** (`NewAreaForm.tsx`) uses DS-06 forms and validation. Failed server
  outcomes preserve the draft; duplicate submit is prevented by the shared form
  state; success navigates to the canonical record.
- **Record** (`AreaOverview.tsx`) uses DS-02 `RecordLayout`: Summary, Goals,
  Projects and Activity. It does not include placeholder tabs or Settings.
- **Rename** (`RenameAreaForm.tsx`) is the single Area rename path, exposed from
  the record header in a Drawer and posted to `/areas/:areaId/mutate`.
- **Activity** (`AreaActivityTab.tsx`) reuses the DS-05 `Timeline`, the shared
  descriptor fallback, cursor pagination, retry/empty states and batched entity
  resolution. It shows Area-subject events only; descendant task/project event
  aggregation is deliberately not part of AREA-01.

## Momentum semantics

Area momentum is derived, not stored. The pure evaluator accepts authoritative
facts and an injected clock, returns accessible labels, a summary and transparent
reasons, and has no React or persistence imports.

Precedence:

1. Any visible at-risk active Project -> `needs_attention`.
2. Any visible blocked active Project -> `blocked`.
3. Any visible stale or on-hold active Project -> `quiet`.
4. No active Goals, Projects or Tasks -> `empty` ("No active work").
5. Otherwise -> `steady`.

Completed and archived Projects are counted as context where useful, but never
create active warning reasons. The evaluator does not average project percentages
into an Area score and does not label an empty Area as healthy. Sensitive task free
text, waiting notes and raw payloads are never exposed in aggregate reasons.

## Goals and Projects

AREA-01 shows active Goals belonging to the Area with spine completion/progress
and contribution counts where available. It intentionally does **not** add Goal
target dates, definitions of done, Goal details persistence, Goal creation or fake
Goal links; AREA-02 owns full Goal records.

Projects are grouped by structural context:

- **Direct Area Projects** — `project.belongs_to_area`.
- **Goal-backed Projects** — `project.advances_goal`, with the Goal title shown as
  context.

Project cards link to the existing canonical `/projects/:projectId` records and
reuse the existing workflow vocabulary plus the shared Project health visibility
rule. There is no Area-owned Project card model, Project mutation route or health
evaluator.

## Project creation dependency

Projects still require an Area or Goal parent. Once AREA-01 exists, the New
Project confirmed-empty state links to `/areas?drawer=new-area` so an empty
workspace has a real route to create the first Area. It does not auto-create an
Area, seed fixture data, make Project parentage optional, or link to an unbuilt
Goal creation flow.

## Accessibility and responsive behaviour

The module inherits DS-11. The collection, record, drawers, forms, tabs, Timeline
and project links are keyboard-operable, labelled, focus-restoring, axe-scanned and
overflow-checked. Long Area, Goal and Project titles wrap inside cards, metrics,
tabs and form sheets. AREA-04 still owns mobile-complete Areas/Goals refinements;
AREA-01 ships the shared responsive baseline only and adds no swipe/mobile-only
workflow.

## Testing

- **Unit / pure** (`test/unit/areas`): view-model mapping, roll-up presentation,
  grouping, deterministic ordering, long content, form states, component states,
  the React-free momentum import guard, and momentum precedence/edge cases.
- **Workers/D1 integration** (`test/kernel/areas*.test.ts`): list/create/get/rename,
  roll-up accuracy across Goals, direct Projects, Goal-backed Projects, direct
  Tasks and Project Tasks, soft-delete/move effects, workspace isolation,
  wrong-kind/missing ids, cursor behaviour, Activity, and route outcomes.
- **E2E** (`e2e/areas.spec.ts`): real navigation from app chrome, seeded hierarchy,
  New Area validation/create, landing on the canonical record, rename, Goals and
  Projects tabs, project navigation with Back/Forward, empty Area states, Activity,
  focus restoration, axe and no-horizontal-overflow checks.
- Existing accessibility/responsive sweeps include `/areas`, `/areas/:areaId`,
  Activity and overlay states rather than creating a second scan framework.

## Migration, deployment and deferrals

No migration or deploy-time data backfill is required. Production must still have
the existing spine and project-detail migrations applied before this Worker code
runs, because Areas reads compose with Projects and Project health.

Deliberate deferrals: full Goal records and Goal-specific fields (AREA-02),
alignment/intention reporting (AREA-03), mobile-specific Areas/Goals workflows
(AREA-04), Area deletion/restore, Area settings, and descendant-aggregated Activity.

## Related documents

- [`ROADMAP_V2.md` AREA-01](../roadmap/ROADMAP_V2.md#-area-01--area-overview)
- [`SPINE_MODEL.md`](./SPINE_MODEL.md)
- [`PROJECTS_MODULE.md`](./PROJECTS_MODULE.md)
- [`ACTIVITY_TIMELINE.md`](./ACTIVITY_TIMELINE.md)
- [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md)
- [`ARCHITECTURE_DECISIONS.md` ADR-038](../decisions/ARCHITECTURE_DECISIONS.md#adr-038-area-overview--read-only-spine-projection-and-derived-momentum)
