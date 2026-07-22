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
- the open validated-string actor kind and subject roles;
- the UTC `occurredAt` `Date`;
- the validated `payload`;
- every subject and its role, plus resolved entity identity where available.

`options`:

- `descriptors` — a per-type descriptor map (see below); missing types use the safe
  fallback.
- `resolveEntity(entityId) → ResolvedEntity | null` — a **batch** resolver the route
  supplies (resolve every referenced entity once, up front — the UI never fetches per
  item, so there is no N+1). Return `null` for a deleted/inaccessible/unknown entity.
- `resolveActorLabel(actor) → string` — optional; defaults to a conservative label.
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

### The unknown-type fallback

Any type with no descriptor renders through a conservative generic fallback that
stays readable, shows the humanised event type (`widget.frobnicated` → "Widget
frobnicated"), the actor, the time and available subjects, never crashes, and emits
**no** payload metadata. `ActivityItem.isKnownType` is `false` for these.

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
- **Opening an entity** reuses the DS-03 Drawer. A `ResolvedEntity` with a
  `drawerKey` renders as a `DrawerTrigger` link by default; mount the stream inside a
  `DrawerProvider` whose `renderDrawer` maps the key to a DS-02 Record Layout.
  Override with `renderEntityLink` if you must — but never build a bespoke modal.
- **States** are built in and reuse the shared components: initial loading
  (Skeleton), genuinely-empty (EmptyState), filtered-empty (DS-07 FilterEmptyState),
  loading-more, page-load failure + retry, end-of-feed, unknown type, unresolved
  subject.

---

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
compliance. Virtualisation preserves keyboard and screen-reader use.

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

Two records ship a real DS-05 Timeline over the FND-05 stream today; both are the
SAME `Timeline` given a different record-scoped `loadPage`, never a forked component:

- **The task record's Activity tab** (TODAY-02, [ADR-028](../decisions/ARCHITECTURE_DECISIONS.md#adr-028-task-drawer-persistence-and-composition--the-additive-task-detail-slice)) —
  `TaskTimelineTab` fetching the module-owned `/tasks/:taskId/activity` resource route.
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

Both prove the intended shape: a module owns a small resource route over
`activity.listForEntity`, maps records server-side, and drops a `<Timeline>` into its
DS-02 Activity tab (Activity last). Neither adds an event store, a migration, a
dependency or a second renderer.

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
