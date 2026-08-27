# ACTIVITY_TIMELINE.md — The Shared Timeline & Activity Feed

> How to render the FND-05 Activity model as a record **Timeline** or a workspace
> **Activity Feed** using the ONE shared component system, how to give your module's
> event types a readable presentation, and the rules that keep it entity-agnostic,
> accessible and virtualised.
>
> Decision & rationale: [ADR-021](../decisions/ARCHITECTURE_DECISIONS.md#adr-021-the-shared-timeline--activity-feed--one-renderer-one-presentation-view-model-in-house-virtualisation).
> Roadmap item: [DS-05](../roadmap/ROADMAP_V2.md#-ds-05--shared-timeline--activity-feed).
> Patterns: [`DESIGN_SYSTEM.md → Shared Timeline & Activity Feed`](../design/DESIGN_SYSTEM.md#shared-timeline--activity-feed-ds-05).
> Event source: [`FND-05`](../roadmap/ROADMAP_V2.md#-fnd-05--shared-activity-model) / [ADR-012](../decisions/ARCHITECTURE_DECISIONS.md#adr-012-activity-persistence-and-atomic-mutation-recording).

---

## What it is

`app/shared/activity-feed` is one reusable, entity-agnostic system that renders the
single shared Activity stream at two scopes:

- **Timeline** — one record's history (`activity.listForEntity(entityId, …)`),
  suitable for the Activity tab of the [DS-02 Record Layout](../design/DESIGN_SYSTEM.md#shared-record-layout-ds-02).
  A record whose history is genuinely the history of a RELATIONSHIP can widen that
  read to a bounded SET of anchors with `activity.listForEntities(entityIds, …)`
  (see [Multi-anchor timelines](#multi-anchor-timelines) below) — still one
  Timeline, still one stream.
- **Activity Feed** — a workspace/scope stream (`activity.listForWorkspace(…)`).

Both are **the same `ActivityStream`**, differing only in the loader they are given
and their label. There is no forked Timeline/Feed implementation.

The FND-05 Activity model is the **only** event source. DS-05 adds **no** new
event model, audit log, timeline/activity table, migration or persistence.

---

## The layers

| Layer | Location | Responsibility |
| ----- | -------- | -------------- |
| **Pure model** | `app/shared/activity-feed/*.ts` (types, dates, type-registry, item-model, grouping, paging, window, filter-fields) | React-free mapping, ordering, grouping, paging, windowing and DS-07 filter fields. Re-exported from `~/shared/activity-feed/model`. |
| **Components & hooks** | `ActivityStream`, `Timeline`, `ActivityFeed`, `ActivityEventItem`, `ActivityDayHeading`, `useActivityStream`, `useActivityWindow` | The one shared renderer, the item, the paging state hook and the virtualisation hook. Exported from `~/shared/activity-feed`. |
| **The route** | your module's route | Owns the repository call (`resolveWorkspaceScope(env).activity`), maps records → items, and supplies the loader. |

Import the **pure model** from `~/shared/activity-feed/model` (a server surface or a
test can map/group/filter without resolving React — an import-guard test enforces
it). Import the **UI** from `~/shared/activity-feed`.

---

## The presentation view-model boundary

`toActivityItem(record, options)` maps one kernel `ActivityRecord` to a renderable
`ActivityItem`. It **preserves** the kernel's types unchanged:

- the branded `ActivityType` (never down-branded to `string`);
- the open validated-string actor kind and subject roles (the actor's stable id is
  deliberately dropped at this boundary — it is an authentication subject, and the
  item is serialised to the browser; see [`IDENTITY_AND_ACTORS.md`](IDENTITY_AND_ACTORS.md));
- the UTC `occurredAt` `Date`;
- the validated `payload`;
- every subject and its role, plus resolved entity identity where available.

`options`:

- `descriptors` — a per-type descriptor map (see below); missing types use the safe
  fallback.
- `resolveEntity(entityId) → ResolvedEntity | null` — a **batch** resolver the route
  supplies (resolve every referenced entity once, up front — the UI never fetches per
  item, so there is no N+1). Return `null` for a deleted/inaccessible/unknown entity.
- `resolveActor(actor) → ActorIdentity | null` — the **batch** actor resolver, built
  once per page from the workspace's actor directory
  (`createActivityActorResolver(scope.actors, page.items)` — one query, no N+1). When
  omitted, actors still resolve through the ONE canonical identity rule with no
  membership facts, i.e. `System` / `Unknown user` — never an anonymous placeholder
  and never the current viewer. See [`IDENTITY_AND_ACTORS.md`](IDENTITY_AND_ACTORS.md).
- `resolveActorLabel(actor) → string` — a label-only variant, for a surface (the
  design gallery, a focused test) that has no directory. `resolveActor` wins.
- `anchorEntityId` — the Timeline anchor (marks the anchor subject and biases
  primary-subject selection). Omit for a Feed.

No `any`. Do not weaken the kernel's branded types to make UI code easier.

---

## Giving your event types a presentation

A module renders its own event types by registering **descriptors** — never by
editing DS-05, and never with a product switch statement:

```ts
import { createActivityDescriptorMap } from "~/shared/activity-feed";

const DESCRIPTORS = createActivityDescriptorMap({
  "task.completed": {
    label: "Task completed",
    tone: "success",
    entityType: "task",
    describe: (base, ctx) => ({
      segments: [
        { kind: "actor" },
        { kind: "text", text: " completed " },
        ctx.primarySubject
          ? { kind: "entity", entityId: ctx.primarySubject.entityId }
          : { kind: "emphasis", text: "a task" },
      ],
    }),
  },
});
```

`createActivityDescriptorMap(...)` merges your maps **over** the seven kernel-reserved
lifecycle defaults (`entity.created/updated/deleted/restored`,
`entity_link.created/unlinked/restored`).

A `describe` function returns **segments** (`text` / `actor` / `emphasis` /
`entity`), optional bounded `metadata`, an optional `entityType` (for the marker
icon) and an optional `tone`. It **must be pure and total** — never throw on an
unfamiliar payload. To surface payload fields safely, use `summarizeActivityPayload`,
which shows only a bounded set of primitive top-level fields and skips nested
objects/arrays; **never** stringify a payload into the UI.

### Cross-module surfaces: use the shared builder, not a partial list

A surface that renders MORE than one module's events — the workspace feed, a
Person's relationship timeline, any record whose history other modules write to —
must build its map with `buildWorkspaceActivityDescriptors`:

```ts
import { buildWorkspaceActivityDescriptors } from "~/shared/activity-feed/model";

// Cross-module surface: registry labels + the shared curated set.
const DESCRIPTORS = buildWorkspaceActivityDescriptors(
  discoverModuleRegistry().listActivityTypes(),
);

// A record-scoped surface layers its own warmer wording last.
const RECORD_DESCRIPTORS = buildWorkspaceActivityDescriptors([], MY_DESCRIPTORS);
```

Order: kernel lifecycle defaults → every module manifest's declared labels → the
shared curated cross-module set (entity marker, tone, and the sentence naming both
records for events that join two) → your overrides. The **manifest** stays
authoritative for an event type's label; the shared set contributes structure only.

This is what stopped the workspace feed reporting fully-registered events as
unrecognised, and `test/unit/activity-feed/activity-type-coverage.test.ts` fails if
a registered or kernel-persistable type ever loses its renderer.

### The unknown-type fallback

Any type with no descriptor renders through a conservative generic fallback that
stays readable, shows the humanised event type (`widget.frobnicated` → "Widget
frobnicated"), the actor, the time and available subjects, never crashes, and emits
**no** payload metadata. `ActivityItem.isKnownType` is `false` for these.

The raw dotted type is shown as a badge in **development only**. Production never
puts a machine identifier in front of the owner (AGENTS.md §7) — but the event is
never hidden either.

### Which record a label-only line refers to

A descriptor with a **label but no `describe`** — every registry-derived
cross-module descriptor, which is how a Person's unified timeline labels other
modules' events — renders the calm default line `actor · Label — <record>`, and the
same rule drives the unknown-type fallback. The `<record>` is chosen by
`selectReferenceSubject`: the most meaningful subject that is **not the anchor**
(a `subject`-role one first, then any), falling back to the primary subject when
the anchor is the only subject there is.

The distinction only bites for a **multi-subject** event that the anchor is itself
a subject of — MEET-03's `meeting.held`, which names the Meeting and every attendee
Person. Without it, that event on Ada's own page would link back to Ada. For a
single-subject event, or one the anchor is not a subject of, this resolves to
exactly what primary-subject selection already gave.

A descriptor with its own `describe` chooses its own segments and is unaffected.

### Subject-less permanent-deletion tombstones

One event class has **no subject at all, and never can**: the tombstone a guarded
permanent delete appends. Its subject would point at the `entities` row the very
same batch removed, and `activity_subjects.entity_id` is `ON DELETE RESTRICT`
precisely to keep a deleted entity's Timeline readable — so the pointer must not
exist. `area.deleted`, `asset.deleted` and `review.deleted` are all written this
way (ADR-046; AUDIT-FIX-03 brought Assets and Reviews onto the pattern).

That makes both of the rules above useless for them: there is no subject to
select, and a subject-resolving `describe` degrades to an anonymous line —
`review.deleted` really did render "…permanently deleted this review" before this
was fixed. Such an event names its record from its **own immutable payload**
instead, through the shared `purgeTombstoneDescriptor`:

```ts
[ASSET_DELETED]: purgeTombstoneDescriptor({
  label: "Asset permanently deleted",
  verb: "permanently deleted",
  titleKey: "title",      // payload key holding the destroyed record's name
  fallbackText: "an asset",
  entityType: "asset",
}),
```

Two rules it enforces, and that any hand-written equivalent must keep:

- **The title is an `emphasis` segment, never an `entity` one.** An entity segment
  renders a Drawer link, and the record it would open no longer exists.
- **A missing, blank or non-string title degrades to the fallback phrase.**
  `describe` is contractually pure and total — it must never throw on an
  unfamiliar payload — and a purge's payload is the only thing left to read.

Repositories writing such a tombstone must insert it **directly after** the
authoritative entity DELETE, guarded `WHERE changes() > 0` on that statement, so
it exists if and only if that call actually destroyed the record. The `activities`
rows *about* the record are retained through the purge (append-only, ADR-012);
only their obsolete `activity_subjects` pointers are removed.

---

## Wiring a route

```tsx
import { env } from "cloudflare:workers";
import { resolveWorkspaceScope } from "~/platform/workspaces";
import {
  ActivityFeed,
  toActivityItems,
  type ActivityStreamPage,
} from "~/shared/activity-feed";

// loader (server): fix the trusted workspace scope here; NEVER take it from input.
export async function loader() {
  const { activity } = await resolveWorkspaceScope(env);
  return activity.listForWorkspace({ limit: 40 }); // ActivityPage over the wire
}

// A client loader closes over the repository call and maps records → items.
const loadPage = async (cursor: string | null): Promise<ActivityStreamPage> => {
  const page = await fetchPage(cursor);            // your data call
  return {
    items: toActivityItems(page.items, { descriptors: DESCRIPTORS, resolveEntity }),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  };
};

<ActivityFeed
  loadPage={loadPage}
  filterFields={FILTER_FIELDS}       // DS-07 fields over the ActivityItem
  filterExpression={expression}       // from useFilterUrlState(FILTER_FIELDS)
  onClearFilters={clearFilters}
/>;
```

For a **Timeline**, use `<Timeline loadPage={…} ariaLabel="…" />` with a loader
backed by `activity.listForEntity(entityId, …)` and `anchorEntityId` set in the
mapping. Place it in a DS-02 Activity tab.

The component API takes an **opaque** `loadPage` — never a repository, D1 binding,
cursor internals or a workspace control. `nextCursor` is opaque and scope-bound:
pass it straight back into the same listing.

---

## Filtering (DS-07), Drawer (DS-03), states

- **Filtering** reuses DS-07. Build fields with `createActivityFilterFields({
  eventTypeOptions, actorTypeOptions?, entityTypeOptions?, includeDate? })`, bind the
  expression with `useFilterUrlState`, render the shared `FilterBar`, and pass
  `filterFields`/`filterExpression`/`onClearFilters` to the stream. Filter state
  follows the DS-07 URL contract and preserves unrelated params (including DS-03
  `drawer` params).
- **Opening an entity** follows the record's own canonical destination, resolved
  through the ONE shared `entityDestination(type, id)` helper (`~/shared/entity`) —
  never a per-module route map. A `ResolvedEntity` with a `drawerKey` renders as a
  `DrawerTrigger` (mount the stream inside a `DrawerProvider` whose `renderDrawer`
  maps the key to a DS-02 Record Layout); one with an `href` renders as an ordinary
  `Link` to its canonical record page; one with neither renders as plain,
  non-interactive text — the correct degradation for an unresolvable record or a
  type with no genuine destination. Override with `renderEntityLink` if you must —
  but never build a bespoke modal.
- **States** are built in and reuse the shared components: initial loading
  (Skeleton), genuinely-empty (EmptyState), filtered-empty (DS-07 FilterEmptyState),
  loading-more, page-load failure + retry, end-of-feed, unknown type, unresolved
  subject.

---

## Multi-anchor timelines

Some records ARE their relationships. A Person's history is not only the events the
Person row is a subject of — it is the commitments, notes, diary entries and
meetings connected to them, whose events name THOSE records as subjects. FND-05
therefore exposes a set generalisation of the entity Timeline:

```ts
const page = await activity.listForEntities(anchorIds, { limit, cursor });
```

Contract (see [ADR-052](../decisions/ARCHITECTURE_DECISIONS.md#adr-052-the-unified-people-relationship-timeline--a-derived-multi-anchor-projection-over-the-one-activity-stream)):

- an event is returned when ANY anchor is one of its subjects, **exactly once**
  even when several anchors are, and it carries **all** of its subjects;
- the same total newest-first `(occurredAt, id)` order, so a merged history is
  deterministic even for equal timestamps;
- **every** anchor must exist in the bound workspace (active or soft-deleted);
  a nonexistent or cross-workspace anchor fails the whole read closed;
- the anchor set is deduped, order-insensitive and bounded by
  `MAX_ACTIVITY_ANCHORS`;
- the cursor is bound to the anchor SET, so it cannot be replayed against a
  different set and silently skip events — **page with a stable anchor set** (the
  People adopter carries the set inside its own opaque page cursor, so a page reads
  a snapshot and a relationship added mid-read appears on the next first-page read).

This is a READ. It adds no table, migration, event type or projection — it is the
one Activity stream at a wider scope. Deriving the anchor set (e.g. from FND-04
EntityLinks) belongs to the adopting module, never to the kernel.

### Labelling another module's event types

A multi-anchor timeline necessarily carries event types the hosting module does not
own. Do **not** import another module's descriptor map and do **not** grow a switch
statement. Build descriptors from the FND-06 module registry, which already carries
every module's declared activity types and their human labels:

```ts
const descriptors = createActivityDescriptorMap(
  Object.fromEntries(
    registry.listActivityTypes().map((t) => [t.type, { label: t.label }]),
  ),
  MY_MODULE_DESCRIPTORS, // your own types keep their purpose-written line
);
```

A registry-derived descriptor has a label but **no `describe`**, so DS-05 renders
its calm default line and emits **no payload metadata** — which is exactly what a
privacy-sensitive host surface wants: another module's Activity payload never
appears there, whatever it contains.

## Ordering, grouping and dates

- Order is **newest-first by `(occurredAt, id)`**, ties broken by descending `id`
  (matching the kernel). The stream re-applies this total order after merging pages,
  so ordering is deterministic even for equal timestamps.
- Grouping is by **UTC calendar day**; day headings are real, sticky `h2`/`h3`/`h4`
  headings kept in the accessibility tree (correct outline, labelled day group).
- All date/time text flows through ONE `ActivityDateFormatter`
  (`createActivityDateFormatter({ now? })`), which formats **manually against UTC
  getters** (not `Intl`) so server and client render identical text — no hydration
  mismatch. Pass a server-rendered `now` to enable relative "Today"/"Yesterday".
  Timestamps render as semantic `<time datetime>`.

---

## Virtualisation

Long streams are windowed by a small in-house core (`computeWindow` +
`useActivityWindow`) inside a **bounded scroll region** — **no data-grid
dependency**. Only rows near the viewport render, positioned by measured offsets with
stable spacers, so variable-height content does not overlap or jump, day headings
stay associated, and load-more never resets scroll position. Set `maxHeight` for the
bounded region; virtualisation turns on automatically above `virtualizeThreshold`
rows (pass `virtualization="off"` to disable, e.g. in a small tab).

---

## Accessibility

`role="feed"` with an accessible name and `aria-busy`; articles with
`aria-posinset`/`aria-setsize`; accessible day-group headings; a logical heading
hierarchy; semantic `<time>`; visible focus on keyboard-accessible entity links;
a polite live-region announcement of newly-loaded events; non-colour event meaning;
44px touch targets; correct behaviour at 320px and 200% zoom; reduced-motion
compliance. In narrow containers, timestamps collapse below the event body so long
event copy and time labels wrap inside the Timeline instead of widening the page.
Virtualisation preserves keyboard and screen-reader use.

---

## Development demonstration

A dev-only route (`/design/activity-feed`, excluded from production by the
`NODE_ENV` guard in `app/routes.ts`) demonstrates both configurations, multiple event
types/actors/subjects across many days, DS-07 filtering, DS-03 opening, an unknown
event type, an unresolved subject, every state, and hundreds of events for
virtualisation — at desktop and 320px, light and dark. It uses in-memory fixture
records shaped like the kernel model; it is **not** a module and ships no product
route or fake production data.

---

## Real product adopters

Four records ship a real DS-05 Timeline over the FND-05 stream today; all are the
SAME `Timeline` given a different record-scoped `loadPage`, never a forked component:

- **The task record's Activity tab** (TODAY-02, [ADR-028](../decisions/ARCHITECTURE_DECISIONS.md#adr-028-task-drawer-persistence-and-composition--the-additive-task-detail-slice)) —
  `TaskTimelineTab` fetching the module-owned `/tasks/:taskId/activity` resource route.
- **The Area record's Activity tab** (AREA-01, [ADR-038](../decisions/ARCHITECTURE_DECISIONS.md#adr-038--area-overview-read-only-spine-projection-and-derived-momentum)) —
  [`AreaActivityTab`](../../app/modules/areas/AreaActivityTab.tsx) fetching the
  module-owned [`/areas/:areaId/activity`](../../app/modules/areas/routes/activity.tsx)
  resource route. Areas have no completion Activity types of their own, so no
  module descriptors are registered — every event renders via the shared kernel
  defaults.
- **The Goal record's Activity tab** (AREA-02, [ADR-039](../decisions/ARCHITECTURE_DECISIONS.md#adr-039--goal-records-an-additive-goal_details-slice-an-owner-calendar-target-date-and-an-exact-derived-project-contribution-boundary)) —
  [`GoalActivityTab`](../../app/modules/goals/GoalActivityTab.tsx) fetching the
  module-owned [`/goals/:goalId/activity`](../../app/modules/goals/routes/activity.tsx)
  resource route. The module registers descriptors for `goal.completed`,
  `goal.reopened` and the Goal-owned `goal.details_updated` (never the free-text
  target date/definition content itself — the Activity payload carries only
  presence booleans) and inherits the shared defaults + safe fallback for
  everything else.
- **The project record's Activity tab** (PROJ-04, [ADR-036](../decisions/ARCHITECTURE_DECISIONS.md#adr-036-the-project-activity-tab--the-shared-timeline-over-the-project-subject-events)) —
  [`ProjectActivityTab`](../../app/modules/projects/ProjectActivityTab.tsx) fetching the
  module-owned [`/projects/:projectId/activity`](../../app/modules/projects/routes/activity.tsx)
  resource route. Its loader is the canonical "Wiring a route" pattern above:
  `activity.listForEntity(projectId, {limit, cursor})` (the workspace fixed server-side,
  never client input), `toActivityItems(page.items, {descriptors, resolveEntity,
  anchorEntityId})` with the project descriptors and a **batched** resolver (no N+1),
  serialised to JSON. The module registers descriptors ONLY for `project.completed` /
  `project.reopened` and inherits the shared defaults + safe fallback for everything
  else. The project Timeline shows the events for which the **project** is an
  authorised Activity subject (creation, rename, its structural + Key links, a child
  task's `task.belongs_to_project` link, complete/reopen); a child task's own lifecycle
  events name the task, not the project, and are deliberately not aggregated — see
  [`PROJECTS_MODULE.md`](./PROJECTS_MODULE.md) → Activity for the audited scope. A
  relevant mutation revalidates the Timeline in place via the project's `updatedAt`
  reload key (new event at the top, no hard reload, no duplicate rows). Since PROJ-05
  (ADR-037 §37.2), that `updatedAt` is the LATER of the spine entity's and the
  `project_details` settings row's `updated_at` — so a status change, archive or
  restore (which touch only the settings row, never `entities.updated_at`) also
  bumps the reload key and the new `project.status_changed`/`project.archived`/
  `project.restored` event appears at the top with no hard reload, exactly like a
  rename/complete/reopen already did. Those three types have no registered
  descriptor yet (they render via the shared safe generic fallback, humanized from
  the type string); dedicated descriptors are left to the PROJ-05 Settings UI slice.

- **The Meeting record's Activity tab** (MEET-02, [ADR-048](../decisions/ARCHITECTURE_DECISIONS.md#adr-048-meeting-follow-through--task-conversion-orchestration-and-the-source-item-mapping)) —
  [`MeetingTimelineTab`](../../app/modules/meetings/MeetingTimelineTab.tsx) fetching the
  module-owned [`/meeting/:meetingId/activity`](../../app/modules/meetings/routes/activity.tsx)
  resource route (replacing MEET-01's placeholder paragraph). The module registers
  descriptors for the lifecycle types plus MEET-02's two structural follow-through
  types — `meeting.item_converted_to_task` and `meeting.follow_up_created` — each
  recording the Meeting AND the created Task as subjects and carrying ONLY the item
  kind in its payload (never agenda/notes/decision/outcome text). Attendee
  `meeting.attendee` `entity_link.created` events render via the shared kernel default
  on both the meeting and the attendee's People Timeline.

- **Assets** (ASSET-01) register six lifecycle descriptors — `asset.created`,
  `asset.updated`, `asset.status_changed`, `asset.archived`, `asset.restored` and
  `asset.disposed` — served over the module-owned
  [`/asset/:assetId/activity`](../../app/modules/assets/routes/activity.tsx) route.
  Payloads carry ONLY structural metadata: the NAMES of the fields that changed and
  the new status vocabulary term — NEVER a serial/policy number, price or private
  note (§17). A status change to `disposed` emits `asset.disposed`; any other status
  change emits `asset.status_changed`; any other detail edit emits `asset.updated`.

- **The Person record's Timeline tab** (PEOPLE-01, widened by PEOPLE-02,
  [ADR-052](../decisions/ARCHITECTURE_DECISIONS.md#adr-052-the-unified-people-relationship-timeline--a-derived-multi-anchor-projection-over-the-one-activity-stream)) —
  [`PersonTimelineTab`](../../app/modules/people/PersonTimelineTab.tsx) fetching the
  module-owned [`/person/:personId/activity`](../../app/modules/people/routes/activity.tsx)
  route. The only **multi-anchor** adopter: its loader derives the anchor set from the
  Person's FND-04 EntityLinks and reads `activity.listForEntities`, so a linked
  Task's, Note's, Diary entry's or Meeting's own events join the Person's history by
  reference. It registers the four `person.*` descriptors, takes every other
  module's labels from the module registry (payload-free, see
  [Multi-anchor timelines](#multi-anchor-timelines)), and adds a module-owned DS-07
  relationship-category field over the `ActivityItem` view-model — no DS-05 fork, no
  second Person history surface. See
  [`PEOPLE_MODULE.md → §4a`](PEOPLE_MODULE.md#4a-the-unified-relationship-timeline-people-02).

All prove the intended shape: a module owns a small resource route over
`activity.listForEntity` (or, for a relationship history, `listForEntities`), maps
records server-side, and drops a `<Timeline>` into its DS-02 Activity tab (Activity
last). None adds an event store, a migration, a dependency or a second renderer.

---

## What DS-05 deliberately does NOT do

No new event model, audit log, timeline/activity table, migration or persistence; no
product Activity module; no notification centre, comments, mentions, realtime,
WebSockets, AI summaries, analytics, editable/destructive event history; no
data-grid dependency; no workspace-selection control in the component. Record
Timelines are wired by a module adopting DS-05 — shipped for the task record
(ADR-028) and the project record ([PROJ-04](../roadmap/ROADMAP_V2.md#-proj-04--activity),
ADR-036).

---

## Related documents
- [ADR-021](../decisions/ARCHITECTURE_DECISIONS.md#adr-021-the-shared-timeline--activity-feed--one-renderer-one-presentation-view-model-in-house-virtualisation) — the decision and its reasoning.
- [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md#shared-timeline--activity-feed-ds-05) — the pattern contract.
- [`DATA_KERNEL.md`](DATA_KERNEL.md) & [ADR-012](../decisions/ARCHITECTURE_DECISIONS.md#adr-012-activity-persistence-and-atomic-mutation-recording) — the FND-05 Activity model this renders.
- [`docs/README.md`](../README.md) — documentation index.


## AI writes no Activity (AI-01, 2026-08-05)

Running an AI request, viewing an answer, rejecting a proposal and reaching a
budget limit record **no Activity event**. They are things that happened to the
system, not history of the owner's records, and they live in the AI usage ledger
(`ai_usage_requests`) as operational metadata instead — ADR-012's distinction,
applied.

Activity appears only when the owner **accepts** a proposal and an ordinary domain
mutation runs. That mutation goes through the module's own repository and carries
its existing event unchanged, with the **owner** as the actor — because the owner
reviewed and approved the change. AI is never described as the actor.

### Accepting a proposal produces the ORDINARY events (AI-02, 2026-08-05)

There is deliberately **no** "AI created this" event, and none was added when the
acceptance path grew. An accepted Meeting Task emits MEET-02's own
`meeting.item_converted_to_task` (plus the `meeting.updated` from appending the
action item and the Task's own `entity.created`); an accepted Note emits
`entity.created` and, where content was written, `note.content_updated`; an
accepted relationship emits `entity_link.created`. Every one of them is exactly
the event the same action taken by hand produces, and every one carries the
**owner** as the actor.

That is asserted, not assumed: a kernel test walks the whole workspace feed after
an acceptance and requires every event's actor to be the authenticated user, no
event type to mention AI, and a **rejected** proposal to append nothing at all.

See [`AI_PLATFORM.md`](AI_PLATFORM.md) §8.

---

## Workspace-scoped events (SET-03, 2026-08-08)

Almost every Activity event is about a record: the `activity_subjects` table
associates it with one or more entities, and that association is what a record's
Timeline reads. `validateSubjects` therefore requires at least one subject, and
`buildActivityWriteModel` still does.

Some security-relevant facts have no record to be about. Signing out and clearing
a device's local DalyHub data are things the owner did to the WORKSPACE, not to
anything in it. [DEBT-33](../product/PRODUCT_DEBT.md#-debt-33--settings-changes-are-not-yet-represented-in-activity--p3--resolved-2026-08-25)
had correctly refused to invent a fake entity subject to hang such an event from,
and had stalled there.

SET-03 resolves the modelling half by adding one explicit, narrow capability:

- **`buildWorkspaceActivityWriteModel`** (kernel) validates an event with an
  EMPTY subject list. `buildActivityWriteModel`'s rule is untouched, so no domain
  mutation can lose its subject by accident — a subject-less event has to be
  asked for by name, at a call site that has read why.
- **`WorkspaceEventRecorder`** (kernel contract) takes a type and a small
  payload, and nothing else. The workspace, the event id, the timestamp and the
  ACTOR all come from the bound composition, exactly as they do for a domain
  mutation, so a caller cannot forge who did it or when.
- **`D1WorkspaceEventRecorder`** (platform) writes ONE row into the SAME
  `activities` table. It deliberately does not use `recordAtomicMutation`: that
  coordinator guards the append on `changes() > 0` from a preceding domain
  statement, and here there is no domain statement — the event *is* the record of
  what happened, so the guard would have nothing to refer to and would suppress
  the insert entirely.

**Where such an event appears.** In the workspace Activity Feed
(`listForWorkspace` reads `activities` directly), and in no entity Timeline
(`listForEntity` joins through `activity_subjects`, and there are no rows). That
is exactly right: the event is about no entity.

**How it reads.** The shared cross-module descriptor set gains an `ownerAction`
shape — "&lt;actor&gt; signed out of DalyHub" — with no entity marker, because an
entity marker beside an event about no entity would be a small lie. Like every
other curated descriptor it reads only the actor, never the payload.

**What is recorded, and what is not.** Only `security.signed_out` and
`security.local_data_cleared`, both defined in `~/kernel/account-security`. Their
payloads carry counts and booleans and nothing else. No token, no claim, no IP
address, no user agent, no device name — and no Cloudflare Access event, because
DalyHub never receives one. See
[`SETTINGS_MODULE.md → Account & security`](SETTINGS_MODULE.md#account--security-set-03-2026-08-08).

**What is still open.** Ordinary preference changes (timezone, navigation,
defaults) still append no Activity. DEBT-33 is narrowed to that, with the
mechanism now proven.

---

## Reading the stream as HISTORY: the bounded Activity window (FOLLOW-01, 2026-08-26)

Everything above is about *rendering* Activity — a record's Timeline, the
workspace Feed, the audit trail. V2.4 added a second way to read the same one
stream, and it is worth naming because it is the first read that treats Activity
as the **historical authority for a past state** rather than as a list of events
to show.

### What it answers

*What became of the work a named owner-local period's plan held?* — the question
[FOLLOW-01](../roadmap/ROADMAP_V2_4.md#-follow-01--did-the-week-hold--delivered-2026-08-26)
exists for. FOLLOW-02 now asks its Goal counterpart of the same window — see
[below](#the-second-question-on-the-same-window-goal-movement-follow-02-2026-08-27).

The authority is [`~/kernel/activity-window`](../../app/kernel/activity-window/index.ts):
a pure `ActivityWindow` type (inclusive in days, half-open in instants, both
bounds at the owner's local midnight), an `ActivityWindowRepository` contract, and
a pure derivation. Nothing is stored
([ADR-110](../decisions/ARCHITECTURE_DECISIONS.md#adr-110-follow-through-is-derived-from-the-activity-stream-never-stored--one-period-account-no-adherence-score-and-no-snapshot-table-for-a-plan-or-a-goal)).

### Why the payloads make it possible

Because the planning events were written to be reconstructible, not merely to be
displayed:

| Event | Payload | What it lets a reader conclude |
| --- | --- | --- |
| `task.planned` | `scheduledDate` | the plan after — and, by its ABSENCE of `previous`, that there was none before |
| `task.rescheduled` | `scheduledDate`, `previous` | the plan on both sides of the change |
| `task.plan_cleared` | `previous` | the plan that was removed |
| `task.completed` | `completedAt` | when, to the instant |

`previous` is what makes the plan at any past moment derivable **without** reading
what the Task carries now. A reader walks a Task's events in order; the Task's own
`scheduled_date` is used only as the initial condition, and only where no event
speaks at all (a Task created with a planned day emits `entity.created` and no
planning event).

**If you add an event type that changes a fact history will be asked about, carry
the value on BOTH sides.** A payload that records only the new value is a payload
a future reader cannot reverse.

### The one gap this found, and how it was closed

TASKS-07's series **move** and **skip** shift an occurrence's dates and recorded
only the *anchor*, so a repeating Task anchored on its DUE date moved its planned
day with nothing in the stream saying so. The event those paths already write now
carries the pair it was missing, under the shape `entity.updated` has always used:

```jsonc
"changes": { "scheduledDate": { "before": "2026-05-04", "after": "2026-05-06" } }
```

No new event type, no new payload key vocabulary, no schema change. A reader that
wants "every event that moved the plan" therefore matches the three domain types
**or** any event carrying `changes.scheduledDate` — which is what makes this a
reader of the STREAM rather than of three event types.

### How it stays bounded

The D1 implementation
([`d1-activity-window-repository.ts`](../../app/platform/storage/d1/d1-activity-window-repository.ts))
is **two statements**, whatever the period holds, and the id set never crosses the
process boundary — it is a common table expression inside both, so the parameter
count is a function of the window rather than of the week. That matters for a
reason TASKS-13 and UX-02 both found the expensive way: **D1 accepts at most 100
bound parameters per query.**

The candidate set is three indexed arms, and each is necessary:

1. **planned into the period now** — `task_details.scheduled_date` inside the
   period's days (the ordinary case, and the one that covers a Task created with
   a planned day);
2. **touched inside the period** — any plan movement, completion or reopen in
   `[startInstant, endInstant)`, served by `activities_workspace_occurred_idx`;
3. **withdrawn after the period** — a planning event after it whose `previous` day
   is inside it, served by `activities_workspace_type_occurred_idx`. Empty by
   construction for a period that has not closed, and the arm without which a Task
   the owner committed to on Wednesday and re-planned the following Monday
   disappears from the week it was committed to.

**No new index and no migration.** Adding one would be a migration made to serve a
derivation, which ADR-110 forbids.

### The second question on the same window: Goal movement (FOLLOW-02, 2026-08-27)

*Did this Goal move inside the named period?* — the counterpart FOLLOW-01
anticipated, and it is a **second method on the SAME repository** rather than a
second window:

```ts
readGoalMovementFacts(
  window: ActivityWindow,
  goalIds: readonly string[],
): Promise<Map<string, GoalMovementFacts>>
```

Two things about it are worth carrying forward to the next reader of this stream.

**It returns AGGREGATES, not events.** Everything the product says about movement
is a count, a distinct-Project count or the most recent day, so the counting
happens in SQL. That is what makes the read bounded *by construction* rather than
by a limit: a Goal with four thousand completed Tasks costs what one with two
costs, and there is no row ceiling that could silently drop a Goal's only piece
of evidence. Both properties are asserted —
[`test/kernel/goal-movement.test.ts`](../../test/kernel/goal-movement.test.ts)
proves flatness in the number of Goals *and* in the number of events. Contrast
the plan window above, which necessarily returns rows because the derivation has
to reconstruct each Task's history in order.

**Not every event in the stream is progress.** The movement read accepts exactly
five types — `task.completed` under a contributing Project, `project.completed`
on one, `goal.measurement_logged`, `goal.milestone_completed` and
`goal.completed` — and the refusals are the definition rather than an omission.
Two of them generalise:

- **`entity.updated` is activity, not outcome.** ADR-040's alignment counts it,
  and correctly so for the question alignment asks. A derivation about whether
  something *advanced* must not, or "renamed a Project" becomes progress.
- **Beware a second record of one act.** `goal.target_reached` is appended by the
  same atomic write as the reading that causes it, so counting both counts one
  act twice. **Any new derivation over this stream should ask, per event type,
  whether it is a second record of something already counted.**

The rules live beside `evaluateGoalAlignment` in
[`~/kernel/alignment/goal-movement.ts`](../../app/kernel/alignment/goal-movement.ts)
and are re-exported through `~/shared/alignment`, which is where ADR-110
decision 6 and DEBT-78 both said to put them. Full record:
[`V2_4_FOLLOW_02_GOAL_MOVEMENT_2026_08.md`](../product/V2_4_FOLLOW_02_GOAL_MOVEMENT_2026_08.md).
