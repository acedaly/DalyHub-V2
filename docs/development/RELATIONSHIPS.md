# RELATIONSHIPS.md — The Universal Relationship System

> How any record in DalyHub relates to any other from ONE shared, reusable
> **Linked Items** surface — built on the FND-04 EntityLink kernel and the DS-06
> policy picker service, not a second relationship model.
>
> Decision & rationale: [ADR-047](../decisions/ARCHITECTURE_DECISIONS.md#adr-047-the-universal-relationship-system--one-shared-linked-items-surface-a-generic-links-endpoint-wiki-links-and-linked-boosting).
> Kernel primitive: [ADR-002](../decisions/ARCHITECTURE_DECISIONS.md#adr-002-entitylinks) / [ADR-011](../decisions/ARCHITECTURE_DECISIONS.md#adr-011-entitylink-persistence-and-lifecycle) ([`DATA_KERNEL.md` → EntityLinks](DATA_KERNEL.md#entitylinks-fnd-04)).
> Design patterns: [`DESIGN_SYSTEM.md → Linked Items`](../design/DESIGN_SYSTEM.md#linked-items--hover-card).

---

## What it is

Relationships are a **kernel primitive** (FND-04): any active entity can link to
any other in the same workspace, discoverable from both ends, recorded in the
shared Activity stream. What was missing was ONE reusable way to *use* them — every
detail page hand-rolled its own "Linked" surface (People and Meetings rendered a
read-only list; Projects/Tasks each wired a bespoke picker + routes). The Universal
Relationship System closes that gap with:

- a shared **Linked Items section** every record's detail page mounts
  ([`app/shared/linked-items`](../../app/shared/linked-items));
- a single authenticated **`/links` endpoint** ([`app/routes/links.ts`](../../app/routes/links.ts))
  for list/search/summary + link/unlink, so no module needs bespoke link routes;
- the module-agnostic **`link.related`** relationship type and its trusted policy
  ([`app/platform/entity-links/universal-links.ts`](../../app/platform/entity-links/universal-links.ts));
- inline **`[[Wiki Links]]`** in Markdown and a title **resolver** route;
- **linked-boosting** in global Search;
- **hover cards** summarising a linked record;
- Activity recording of relationship create/remove (already emitted by the kernel).

Supported endpoints: **Area, Goal, Project, Task, Note, Day Diary entry, Meeting,
Person, Asset** — every type with a canonical destination. (ASSET-01 adds `asset`
to `SUPPORTED_LINK_ENTITY_TYPES`, the shared entity-destination map `/asset/:id`
and the record-anchor inverse, so an Asset is a first-class link target and its
directly-linked records boost in Search.)

---

## The layers

| Layer | Location | Responsibility |
|---|---|---|
| **EntityLink kernel** | `app/kernel/entity-links` | The FND-04 primitive (create/unlink/restore/listForEntity), workspace-bound, Activity-atomic. Unchanged. |
| **Policy service** | `app/platform/entity-links/entity-link-picker-service.ts` | The DS-06 `createLinkWithPolicy`/`unlinkWithPolicy`/`searchLinkTargets`/`listActiveLinks`. Unchanged. |
| **Universal helper** | `app/platform/entity-links/universal-links.ts` | `link.related`, `buildUniversalLinkPolicy`, `loadLinkedItems`, `loadLinkSummary`. |
| **Endpoint** | `app/routes/links.ts` | Authenticated JSON `/links` (GET list/search/summary; POST link/unlink). |
| **Shared UI** | `app/shared/linked-items` | `LinkedItemsSection`, `LinkedItemsTab`, `HoverCard`, `useLinkedItems`, pure model + client. |
| **Wiki links** | `app/platform/markdown/wikilinks.ts`, `app/modules/notes/routes/resolve.tsx` | The remark transform + the title resolver. |
| **Search boost** | `app/shared/search/{ranking,record-anchor,client,useSearchController}.ts`, `SearchSurface.tsx`, `app/routes/search.ts` | In-tier `boostIds` lift matched on canonical `entityId`; the surface derives the record anchor from the path and the client sends `?boostLinkedTo=<anchor>`, which the loader resolves. |

Layering rule: the shared UI (`~/shared/linked-items`) must NOT import the platform
layer. The wire types (`LinkedItem`, `LinkSummary`) live in the shared model
(`linked-items-model.ts`) and the platform helper imports them from there — the same
direction the DS-06 picker service already uses (`platform → shared/forms/model`).

---

## The `link.related` type

`link.related` is the single, module-agnostic relationship for a user-created
"this relates to that" link. It is a validated FND-04 dotted slug, **not** a
reserved structural spine type, so the generic repository persists it. Links a
specific module owns (e.g. `meeting.attendee`) still appear in a record's Linked
Items — they are shown **read-only** there; only `link.related` links are removable
from the shared surface, so it never becomes a back door around a module's own
relationship rules. The **structural spine links** (`*.belongs_to_*`,
`project.advances_goal`) are deliberately EXCLUDED from the Linked Items view — the
hierarchy already renders those in each record's own relationships surface.

---

## Using it in a record

A detail page mounts one tab:

```tsx
import { LinkedItemsTab } from "~/shared/linked-items";

{
  id: "linked",
  label: "Linked",
  content: (
    <LinkedItemsTab
      anchorId={record.id}
      anchorType="note"                 // for help copy + the ⌘K command label
      readOnly={record.archived}        // hides add/remove on read-only records
      linkCommandTarget={{ kind: "route", to: `/notes/${record.id}?tab=linked` }}
    />
  ),
}
```

That is all — no per-module loader, route, or picker wiring. `LinkedItemsTab`:

- renders `LinkedItemsSection` (fetches the first page from `/links` client-side
  on mount, with a "Load more" affordance that accumulates further pages);
- registers a Command-Palette contextual **navigate** action ("Link a record to
  this …") that opens the Linked tab, so relationships can be created from `⌘K`
  (a `navigate` action, never a focus-moving `run` — per [`COMMAND_PALETTE.md`](COMMAND_PALETTE.md)).

Adopters today: Notes, People (upgraded from read-only), Meetings (upgraded),
Areas, Goals. Projects and Tasks retain their existing interactive link tabs (built
on the same shared `EntityLinkPicker`); migrating them to the shared section is a
clean follow-up.

---

## The `/links` endpoint

One authenticated resource route, composed exactly like `/search` and `/commands`
(renders no shell; trusted `resolveAuthenticatedWorkspaceScope`; the client names
only an anchor **entity** id, never a workspace):

| Request | Result |
|---|---|
| `GET /links?op=list&anchor=A[&cursor=C]` | `{ items: LinkedItem[]; nextCursor }` — active non-structural links, both directions, `removable` iff `link.related`. Cursor-paginated (see below). |
| `GET /links?op=search&anchor=A&q=…` | `{ options }` — active in-workspace targets (anchor excluded). |
| `GET /links?op=summary&anchor=A&target=T` | `{ summary }` — safe structural metadata for the hover card, or `null`. |
| `POST /links` `intent=link` | Create a `link.related` link (policy-enforced). |
| `POST /links` `intent=unlink` | Remove a link the anchor owns (policy-enforced). |

Fails closed: a missing anchor → 404; a missing/invalid workspace → a calm
unavailable; a crafted link id for a type/anchor the policy never offered → refused.

**Pagination past structural links.** The reserved structural spine links are
filtered out server-side, so a record with many structural links spreads its
`link.related` relationships across several underlying link pages.
`loadLinkedItems` therefore **pages through** the underlying EntityLink pages
while filtering, accumulating a display page's worth of relationships, and returns
a `nextCursor` whenever more underlying links remain (never a single truncated
page whose relationships are silently omitted). The section renders a shared
`LoadMore` affordance and the controller accumulates pages, so every later
relationship stays reachable.

---

## Hover cards

`HoverCard` ([`app/shared/linked-items/HoverCard.tsx`](../../app/shared/linked-items/HoverCard.tsx))
shows a linked record's summary on pointer hover AND keyboard focus (never
hover-only). It is a non-interactive `role="tooltip"` associated with its trigger
via `aria-describedby`, opens after a short intent delay, closes on
blur/pointer-leave/Escape, lazily fetches its summary once, and honours
`prefers-reduced-motion`. Summaries carry only non-sensitive structural metadata
(type, title, timestamps) — safe for People and Diary.

---

## Wiki links (`[[Title]]`)

A pure remark transform ([`wikilinks.ts`](../../app/platform/markdown/wikilinks.ts))
turns `[[Title]]` and `[[Title|Alias]]` in Markdown source into an ordinary
internal link to the resolver route. It keeps the FND-08 pipeline **deterministic
and stateless** — no DB lookup, no minted entity id, no second HTML sink, and only
a relative href the existing URL policy and strict sanitiser already permit
(unstyled, to keep the allowlist intact). The one workspace-scoped step —
resolving a title to a record — happens at navigation time in
[`/notes/resolve`](../../app/modules/notes/routes/resolve.tsx), which finds an
active entity whose title matches (case-insensitively, notes preferred) and
redirects to its canonical destination, landing on `/notes` rather than a dead end
if none matches. It scans **all** cursor pages with **no page cutoff** — stopping
early only when a note match is found — so an exact-title target created far into
a large workspace (beyond the first several hundred entities) still resolves
instead of falling through to `/notes`. `[[…]]` inside code or an existing link is
never rewritten.

---

## Search boosting

`rankResults` ([`ranking.ts`](../../app/shared/search/ranking.ts)) accepts an
optional `boostIds` set of **canonical kernel entity ids**: a result whose
`entityId` (the unprefixed id a provider supplies) — falling back to its `itemId`
— is in the set is ordered **above equally-relevant** results **within the same
relevance tier**. A directly-linked record surfaces first, but a boosted weak
match never outranks a stronger tier. Matching on the canonical `entityId` is
load-bearing: repository-backed providers prefix their `itemId` (`person:<id>`,
`task:<id>`, `meeting:<id>`), so comparing a raw entity-id boost set against
`itemId` alone would never match — the entity-backed providers therefore set
`entityId` to the bare kernel id.

The boost is **reachable through the product UI end to end**. When Search is
opened from a record page, `SearchSurface` derives the anchor entity id from the
current path (`recordAnchorFromPath`, the inverse of the canonical record routes)
and threads it through `useSearchController` → `fetchSearch`, which serialises it
as `?boostLinkedTo=<anchorId>`. The `/search` loader resolves that anchor's
directly-linked entity ids server-side and passes them as `boostIds`. The client
only ever names the anchor record; it never supplies raw boost ids.

---

## Adopter note — Meeting follow-up Tasks (MEET-02)

A follow-up Task created from a Meeting links back with the task-owned
`task.relates_to` type (source Task → target Meeting), so it appears in the Task
Drawer's existing Linked section (outgoing `task.relates_to`) AND — read-only — in the
Meeting's universal Linked Items, one row navigable both ways. The Universal
Relationship contracts are unchanged; MEET-02 adds no relationship model. Which
specific agenda item / decision / outcome produced the Task is recorded by a narrow,
module-owned mapping table (`meeting_item_tasks`) that **supplements** this link — it
never replaces it. See [ADR-048](../decisions/ARCHITECTURE_DECISIONS.md#adr-048-meeting-follow-through--task-conversion-orchestration-and-the-source-item-mapping).

## Adopter note — the People relationship timeline (PEOPLE-02)

A relationship is not only a row in a Linked Items list; it is also a claim about
whose history matters. [PEOPLE-02](../roadmap/ROADMAP_V2.md#-people-02--relationship-timeline)
is the first surface to READ the relationship graph that way: a Person's Timeline
derives its **anchor set** from that Person's active links (both directions,
excluding the reserved structural spine types, exactly as `loadLinkedItems` does)
and reads the ONE FND-05 Activity stream across it. A linked record therefore
contributes **its own canonical events** to the Person's history — by reference,
never copied.

Consequences worth knowing when you touch this system:

- **The relationship IS the subscription.** Link a record to a Person and its
  history joins theirs; unlink it and that history leaves. Nothing is cached, so
  nothing needs cleaning up.
- **Only active links to active counterparts count** — that is the kernel's own
  `listForEntity` contract, not a second rule.
- **Module-owned link types count too** (`meeting.attendee`, `task.relates_to`), not
  only `link.related` — the Person's history follows every real relationship, even
  though only `link.related` links are removable from the shared surface.
- **No relationship model changed.** PEOPLE-02 adds no link type, no table and no
  second relationship store; it only READS the graph. See
  [ADR-052](../decisions/ARCHITECTURE_DECISIONS.md#adr-052-the-unified-people-relationship-timeline--a-derived-multi-anchor-projection-over-the-one-activity-stream)
  and [`PEOPLE_MODULE.md → §4a`](PEOPLE_MODULE.md#4a-the-unified-relationship-timeline-people-02).

## Relationship intelligence (PEOPLE-03)

> Decision & rationale: [ADR-054](../decisions/ARCHITECTURE_DECISIONS.md#adr-054-relationship-intelligence--a-derived-non-persisted-projection-over-links-and-the-one-activity-stream).
> Surface: [`PEOPLE_MODULE.md → §4b`](PEOPLE_MODULE.md#4b-relationship-intelligence-people-03).

[PEOPLE-02](#adopter-note--the-people-relationship-timeline-people-02) made the
relationship graph *readable as history*. [PEOPLE-03](../roadmap/ROADMAP_V2.md#-people-03--stay-in-touch-signals)
makes it *answerable*: the same graph, aggregated. This is the second — and, so
far, only other — surface that reads the graph rather than editing it, and it is
the one future modules (Email, Calendar, Communications, an AI assistant) are
expected to build on.

### The aggregation architecture

Three layers, the same shape PROJ-02 project health and AREA-03 goal alignment use:

```
app/kernel/relationships/       the pure model + the read-only facts CONTRACT
  person-relationship.ts          thresholds, vocabulary, facts, the evaluator
  relationship-repository.ts      RelationshipRepository (batch-first)

app/platform/storage/d1/        the ONLY place SQL lives
  d1-relationship-repository.ts   three grouped statements per chunk

app/shared/relationships/       the shared presentation (pill, panel, wording)
app/modules/people/             the People-owned view-model + wiring
```

The evaluator is a **pure function of (facts, injected clock)**. Nothing is stored,
cached or backfilled — a relationship is recomputed on every load, so it can never
drift from the timeline the owner is looking at.

### The data sources — exactly two

| Source | Answers | Read as |
|---|---|---|
| **FND-04 EntityLinks** (`entity_links`) | *What have we shared?* | active links in either direction, minus reserved spine types, joined to active in-workspace `entities`, grouped by type |
| **FND-05 Activity** (`activities` + `activity_subjects`) | *What actually happened, and when?* | qualifying events on those linked records — first, last, exact count, plus a bounded newest-first instant sample for cadence |

Task and Project *open/active* state comes from the authoritative `spine_records`
(and `project_details.archived_at`), never a cached column. There is no third
source, and there is deliberately no relationship table.

### What counts as an interaction

`INTERACTION_ACTIVITY_TYPES` (in the relationships kernel) is a **trusted, narrow
vocabulary of events on a LINKED record**. It admits substantive creation and
progress events — a meeting created or written up, a diary entry, a note's content,
a commitment completed, a review. It excludes, deliberately:

- every `person.*` type — record maintenance on the contact card is not contact;
- every `entity_link.*` type — relationship bookkeeping is not a moment;
- `entity.updated` — a rename;
- `entity.deleted` / `entity.restored` — tidying;
- archive / restore / status-change types — filing.

Each moment counts exactly once: a module with its own repository emits only its own
creation event (`meeting.created`, `diary_entry.created`, `review.created`), and
records created through the generic entity/spine path (Notes, Tasks, Projects) emit
only `entity.created` — the two never both fire for one creation.

### Extension points

| Future work | How it slots in |
|---|---|
| **MEET-03 meeting substance** | emit `meeting.held` (etc.) naming the attendee as a subject, declare it in the Meetings manifest, and add the type to `INTERACTION_ACTIVITY_TYPES`. No People change, no new surface. |
| **Emails, calls, messages** | a new entity type linked to the Person + its own Activity types in the vocabulary. It counts as a shared record and as an interaction with no schema change; give it a named summary card only when it earns one (until then it lands in *Other records*). |
| **Calendar** | identical to Meetings — an entity, a link, an event type. |
| **Follow-up reminders / notifications** | read the already-derived `state` and `cadence`. PEOPLE-03 deliberately ships the calculated state and no notifications; a reminder layer consumes it and adds nothing to the kernel. |
| **A People collection sorted or filtered by stay-in-touch** | `listPersonRelationshipFacts` already returns a whole page; the surface work is the sort control, not a new read. |
| **AI relationship summaries** | read the evaluated model, not the records. People stay excluded from external model context unless explicitly opted in ([AGENTS.md §8](../../AGENTS.md#8-ai-philosophy), [§17](../../AGENTS.md#17-security-requirements)). |
| **A richer relationship graph (per-link qualifiers, family/colleague edges)** | layers on the EntityLink primitive; the aggregate reads whatever links exist. |

An interaction source that never declares its Activity types still contributes
**structurally** (it is counted as a shared record) but not **semantically** — the
same trade PEOPLE-02 already makes for timeline labels.

### Performance

- **Batch-first by contract.** `listPersonRelationshipFacts(ids)` is the primary
  method and `getPersonRelationshipFacts(id)` is defined as its one-element case, so
  there is no per-Person path to fall into. A whole page costs **three grouped
  statements per chunk of 25 ids** — one for the shared-record inventory, one for the
  interaction aggregate, one for the bounded sample — regardless of page size. A
  query-counting kernel test asserts that 1 Person and 12 People cost the same three
  statements, and 30 People cost six.
- **Chunked binds.** The id set is bound twice per statement (once per link
  direction), so the chunk size is 25 — comfortably inside D1's 100-bind ceiling.
- **Bounded, disclosed.** Exact totals are read unbounded (a `COUNT`/`MIN`/`MAX` is
  cheap); only the cadence *sample* is bounded, at
  `RELATIONSHIP_INTERACTION_SAMPLE_LIMIT`, ranked per Person with one window function
  rather than one query each. When the bound bites, the panel says so.
- **Nothing cached.** Deliberately: a cached relationship is a cache every module in
  the product would have to invalidate, and it fails silently when they forget. The
  cost is one extra grouped read per record load, and a facts failure degrades to the
  honest zero relationship rather than taking the record down.
- **No timezone logic in SQL.** Raw UTC instants cross the boundary; the evaluator
  maps them to the owner's calendar day, so "days since" is right across the
  UTC/AEST boundary.

## Activity

Relationship creation and removal are recorded automatically by the FND-04 kernel
as `entity_link.created` / `entity_link.unlinked` / `entity_link.restored`, atomic
with the mutation, with both endpoints as subjects — so a link shows on **both**
records' Timelines and in the workspace Activity Feed. The Universal Relationship
System adds no new Activity type; the shared DS-05 defaults already render these.

---

## Mobile, keyboard, offline, optimistic

- **Keyboard/a11y:** the add affordance is the DS-06 `EntityLinkPicker` (WAI-ARIA
  combobox); each linked item is a real `EntityLink` with a separate Remove button
  (never nested); the hover card is focus-reachable; state is never colour-only;
  touch targets meet the shared floor.
- **Optimistic:** `useLinkedItems` shows an added link immediately (temp id, then
  reconciles) and removes optimistically with rollback on failure.
- **Offline:** `useOnlineStatus` (promoted to the shared layer) pauses linking
  while offline with an honest message, instead of a silent failure.
- **Undo:** removing a link raises a DS-10 `notifyUndo` toast whose Undo re-links.

---

## Testing

- **Unit:** `test/unit/linked-items/*` (model grouping, section add/remove/offline/
  error), `test/unit/markdown-wikilinks.test.ts`, the boost case in
  `test/unit/search/model.test.ts`.
- **Integration (Workers/D1):** `test/kernel/links-route.test.ts` (link/list/search/
  summary/unlink, self-link + fail-closed), wiki-link cases in
  `test/kernel/markdown-render.test.ts`.
- **E2E:** `e2e/linked-items.spec.ts` drives a real record — search-to-link,
  navigate, hover card, remove — under the responsive/axe sweeps.

---

## Related documents

- [ADR-047](../decisions/ARCHITECTURE_DECISIONS.md#adr-047-the-universal-relationship-system--one-shared-linked-items-surface-a-generic-links-endpoint-wiki-links-and-linked-boosting) — the decision record.
- [`DATA_KERNEL.md`](DATA_KERNEL.md) — the EntityLink/Activity kernels this builds on.
- [`SHARED_FORMS.md`](SHARED_FORMS.md) — the DS-06 `EntityLinkPicker` and policy service.
- [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md#linked-items--hover-card) — the shared patterns.
- [`docs/README.md`](../README.md) — documentation index.
