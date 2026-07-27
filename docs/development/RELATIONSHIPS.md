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
