# SPINE_MODEL.md — The Area → Goal → Project → Task Spine

The **spine** is DalyHub's structural backbone: the first real domain model, built
in FND-07 on top of the finished Entity, EntityLink, Activity and Module Registry
kernels. It is a **first-class kernel concept**, not a per-module convention
([`AGENTS.md §4`](../../AGENTS.md#4-the-area--goal--project--task-model),
[ADR-001](../decisions/ARCHITECTURE_DECISIONS.md#adr-001-area-hierarchy),
[ADR-014](../decisions/ARCHITECTURE_DECISIONS.md#adr-014-spine-hierarchy-completion-and-rollup-semantics)).

Code: the storage-independent contract lives in `app/kernel/spine`; the D1 adapter
in `app/platform/storage/d1/d1-spine-repository.ts` (+ `spine-database.ts`); the
schema in `migrations/0005_create_spine_hierarchy.sql`; the four production
manifests in `app/modules/{areas,goals,projects,tasks}/module.ts`.

## The four kinds

| Kind | Meaning | Completes? | Parent |
| --- | --- | --- | --- |
| **Area** | A permanent domain of life (Health, Career, Home) | Never | None |
| **Goal** | An optional, aspirational outcome | Yes | Exactly one Area |
| **Project** | A finite body of work | Yes | Exactly one Area **or** Goal |
| **Task** | An atomic unit of action | Yes | Exactly one Area **or** Project |

Each is an ordinary `entities` row (id, workspace, `type` = the kind, title,
timestamps, `deletedAt`). The only additive domain state is `completedAt`, stored
in the `spine_records` table. There are **no** four replacement identity tables.

## Permitted hierarchy

```
Area
├── Goal
│   └── Project
│       └── Task
├── Project
│   └── Task
└── Task
```

A Project may sit **directly under an Area** or **advance a Goal**. A Task may
**float directly in an Area** (a one-off) or **belong to a Project**. A Goal never
directly contains Tasks; Projects never nest; Goals never nest; Areas never nest.

## Structural links (child → parent)

Parentage is expressed with the EntityLink primitive, never with foreign-key
columns and never with JSON. Direction is always **child → parent** (the child is
the link's `source`, the parent its `target`):

| Link type | From (source/child) | To (target/parent) |
| --- | --- | --- |
| `goal.belongs_to_area` | Goal | Area |
| `project.belongs_to_area` | Project | Area |
| `project.advances_goal` | Project | Goal |
| `task.belongs_to_area` | Task | Area |
| `task.belongs_to_project` | Task | Project |

### Exactly one active parent

Every active non-Area record has **exactly one** active structural parent. The
database enforces *at most one* via a **partial unique index** over
`entity_links (workspace_id, source_entity_id)` restricted to the five structural
types where `deleted_at IS NULL`; the `SpineRepository` enforces the valid parent
kind and the existence of a parent. Unlinked (soft-deleted) links and all
non-structural link types are unconstrained, so a record can be moved by unlinking
one parent and linking another in the same transaction.

## Completion vs. deletion

- Completion is a single `completedAt: Date | null`. Reopening clears it.
- **Areas never complete** (enforced by a DB CHECK and by the type system).
- Completion and soft-deletion are **independent**: deleting does not complete,
  completing does not delete.
- Completion **never cascades**. Completing a parent does not complete its
  children; completing every child does not complete the parent. The user decides
  when a Goal or Project is done. This is manual by design.

FND-07 deliberately does **not** model status (planned/active/on-hold/cancelled),
priority, due/start/target dates, descriptions, ordering, weights, milestones or
percent-complete overrides. Those belong to later module work.

## Rollups (derived, never stored)

Progress is computed from **current active descendants** with a small, fixed number
of bounded SQL queries — no cached counters, no "rollup changed" events. Each count
excludes soft-deleted entities and ignores links whose endpoints are soft-deleted.

```
CompletionRollup = { total, completed, ratio }
ratio = completed / total          (a number in [0, 1])
ratio = null       when total = 0  (never NaN; an empty container is NOT 100%)
```

- **Project** → `{ tasks }`: its active direct Tasks.
- **Goal** → `{ projects, tasks }`: its active direct Projects, and all active
  Tasks under those Projects. (A Goal never directly contains Tasks.)
- **Area** → `{ goals, projects, tasks }`: its active direct Goals; all active
  Projects directly under the Area or under its Goals; all active Tasks directly
  under the Area or under those Projects.

A rollup changes naturally whenever an underlying Task, Project, Goal or hierarchy
link changes — completion, reopening, moving, deletion and restoration all update
it with no extra work, because nothing is cached.

## Move / reparent

`move(id, parent)` relocates a Goal, Project or Task to a new active parent of a
permitted kind in the same workspace. The record keeps its id and its descendants
(rollups follow the derived hierarchy). Moving to the current parent is an
idempotent no-op. A move records the actual link mutations —
`entity_link.unlinked` then `entity_link.created`, or `entity_link.restored` when a
previously-visited parent link is reused. There is **never** a moment with two
committed active parents (the partial unique index guarantees it), and if the
destination is unavailable the removal of the previous parent rolls back so the
record is never orphaned.

## Soft-delete and restore

- A container cannot be soft-deleted while it has any **active direct child**
  (`SpineHasActiveChildrenError`). Deletion **never cascades** and never silently
  moves descendants.
- A soft-deleted record **retains** its structural parent link, so restoration is
  faithful.
- Restoring a Goal/Project/Task requires its retained parent to exist and be
  active (`SpineParentUnavailableError` otherwise). Restoring an Area has no parent
  requirement.
- Delete/restore append the generic `entity.deleted` / `entity.restored` events.
  Repeated calls are idempotent no-ops that append nothing. There is no hard
  deletion.

## Reserved generic mutation paths

The four spine entity types and the five structural link types are **reserved**.
The generic Entity and EntityLink repositories refuse to create, change the
lifecycle of, or structurally mutate a reserved record/link — raising
`ReservedEntityTypeError` / `EntityLinkReservedTypeError` — so the invariants above
cannot be bypassed:

```ts
// ✗ rejected — must go through the SpineRepository
workspace.entities.create({ type: "task", title: "orphan" });
workspace.entityLinks.create({ sourceEntityId, targetEntityId, type: "task.belongs_to_project" });

// ✓ the only supported path
workspace.spine.createTask({ title: "…", parent: { kind: "project", id } });
```

Generic **reads** still return spine records and links. The guard uses static
reserved-identifier sets shared from the spine kernel — it does **not** depend on a
mutable ModuleRegistry, and general persistence does not depend on registry
membership.

## Activity events

The spine reuses the shared, atomic Activity stream ([ADR-012](../decisions/ARCHITECTURE_DECISIONS.md#adr-012-activity-persistence-and-atomic-mutation-recording)); it is never event-sourced.

| Operation | Events (one atomic batch) |
| --- | --- |
| Create Area | `entity.created` |
| Create Goal/Project/Task | `entity.created`, `entity_link.created` |
| Rename | `entity.updated` |
| Complete / reopen | `goal.completed`/`project.completed`/`task.completed` (and `*.reopened`) |
| Move | `entity_link.unlinked`, then `entity_link.created` or `entity_link.restored` |
| Delete / restore | `entity.deleted` / `entity.restored` |

No-op calls append nothing; failed calls append nothing and roll back entirely.

## How future modules consume the spine

A resolved workspace exposes `spine` alongside `entities`, `entityLinks` and
`activity`, all bound to the same `WorkspaceContext` and trusted actor
(`resolveWorkspaceScope`). Future Areas/Goals/Projects/Tasks UIs, the Today view
and the alignment view (`AREA-03`) read and mutate the hierarchy **only** through
the `SpineRepository` — never by touching `spine_records` or structural links
directly. FND-09 replaces the current `system` actor with the authenticated user
behind the same seam, with no change to the spine contract.

Production module pages may add bounded, read-only projections when a complete
screen cannot be served cleanly by one single-record spine call. AREA-01's
`WorkspaceScope.areas` is the precedent: it is a storage-independent `AreaRepository`
contract over the same workspace scope, performs deterministic parameterised reads
for the Areas collection and record, and copies no Area identity, hierarchy or
roll-up state into another table. Creation and rename still go only through
`WorkspaceScope.spine`.

## What FND-07 deliberately does not build

No UI of any kind (pages, forms, cards, tree, drag-and-drop, Today, boards,
dashboards); no descriptions/dates/recurrence/priorities/statuses/phases/
milestones/weights/subtasks; no nested Projects, nested Tasks, Tasks directly under
Goals, Goal-to-Goal nesting or Area nesting; no hard or cascade deletion. It builds
only the durable domain foundation those later features consume.

## Related documents
- [`AGENTS.md §4`](../../AGENTS.md#4-the-area--goal--project--task-model) — the product definition of the spine.
- [`ROADMAP_V2.md` FND-07](../roadmap/ROADMAP_V2.md#-fnd-07--area--goal--project--task-hierarchy) — the roadmap item.
- [ADR-014](../decisions/ARCHITECTURE_DECISIONS.md#adr-014-spine-hierarchy-completion-and-rollup-semantics) and [ADR-001](../decisions/ARCHITECTURE_DECISIONS.md#adr-001-area-hierarchy) — the accepted decisions.
- [`DATA_KERNEL.md`](DATA_KERNEL.md) — the Entity/EntityLink/Activity kernels the spine builds on.
- [`MODULES.md`](MODULES.md) — how the four spine modules register their metadata.
- [`ARCHITECTURE_OVERVIEW.md`](../architecture/ARCHITECTURE_OVERVIEW.md) — where the spine sits in the whole.
- [`docs/README.md`](../README.md) — documentation index.
