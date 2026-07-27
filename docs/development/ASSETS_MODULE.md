# Assets module (ASSET-01)

Assets are **first-class DalyHub records** for the important things you own or are
responsible for — vehicles and camper trailers, appliances, electronics, tools and
equipment, home and work items, identification and important documents, software
licences, subscriptions, warranties, insurance policies, and any other valuable or
important record. An Asset carries its own structured metadata and history —
manufacturer/model, ownership, location, acquisition and value, warranty and
service dates, and document/policy details — and links to Areas, Projects, Goals,
Tasks, Notes, Diary entries, Meetings, People and other Assets through the shared
Universal Relationship System.

This first version is deliberately useful **without** external cloud file storage,
barcode scanning, OCR, AI, reminders or automated integrations. See
[Not implemented (by design)](#7-not-implemented-by-design).

Decision record: **[ADR-049](../decisions/ARCHITECTURE_DECISIONS.md#adr-049-first-class-assets--the-asset_details-slice-integer-minor-unit-money-and-the-real-world-status-vs-record-archive-split)**.

---

## 1. Architecture

An Asset is an ordinary `entities` row of type `asset` **plus** exactly one
`asset_details` row owning the structured Asset slice. Assets are **not** part of
the Area → Goal → Project → Task spine (they add no `spine_records` row); they
attach across the spine through FND-04 EntityLinks.

- **Identity, title, soft-delete/restore** stay the generic `EntityRepository`'s
  (the single authority for identity/title). A rename goes through it.
- **The structured detail slice, real-world status and the archive lifecycle**
  belong to the authoritative, workspace-bound **`AssetRepository`**
  (`app/kernel/assets` contract; `app/platform/storage/d1/d1-asset-repository.ts`
  adapter). The `asset` type is **reserved**: the generic repository refuses to
  CREATE one, so an Asset can never exist without its detail row (mirrors
  People/Diary).
- **Relationships** stay EntityLinks; **the audit trail** stays the shared Activity
  stream; there is no second entity system, relationship table, Activity stream or
  file-storage provider.

### Two independent lifecycles (read this)

| Concept | Column | What it means | Where it's changed |
| --- | --- | --- | --- |
| **Real-world status** | `asset_details.status` | The state of the physical/digital thing: Active, Stored, Loaned, Under repair, Retired, Disposed. | The record's **Details** tab. A change appends `asset.status_changed` (or `asset.disposed`). |
| **Record archive** | `asset_details.archived_at` | Whether the DalyHub RECORD appears in active collections and ordinary pickers. Reversible put-away. | The record's **Settings** tab. Appends `asset.archived` / `asset.restored`. |
| **Soft-delete** | `entities.deleted_at` | The record reads as "not found" everywhere. | Generic entity lifecycle. |

These are genuinely independent: a **disposed** asset can still be an **active
(un-archived) record** you keep for history, and an **archived** record can still be
**"Active"** in the world. Archiving is never a status; a status is never archiving.

---

## 2. Data model

### Entity + detail slice

`migrations/0016_create_asset_details.sql` — a STRICT table keyed by
`(workspace_id, entity_id)` with a composite FK to `entities(workspace_id, id, type)`
(`ON DELETE RESTRICT`). Groups:

- **Identity** — `asset_type` (required), `status` (required, default `active`),
  `description`, `manufacturer`, `model`, `serial_number`, `reference_code`, `tags`
  (JSON array).
- **Ownership & location** — `owner_person_id`, `responsible_person_id`, `location`
  (plain text), `area_id`. Person/Area references are **canonical ids**, never
  duplicated records.
- **Acquisition & value** — `acquisition_date`, `purchase_price_minor` (INTEGER
  minor units), `currency_code` (ISO-4217), `supplier`, `replacement_value_minor`,
  `disposal_date`, `disposal_notes`.
- **Warranty & service** — `warranty_expiry`, `service_interval` (text), `last_service_date`,
  `next_service_date`, `service_provider`, `maintenance_notes`.
- **Document / policy / licence / subscription** — `issuer`, `reference_number`,
  `issue_date`, `renewal_date`, `url`, `document_notes`.
- **Lifecycle** — `archived_at`, `updated_at`.

Indexes serve the active/archived collection partition + recency, the type/status
facets, the expiry (warranty + renewal) and next-service date-driven views, and the
owner/responsible/area facets.

### Money — integer minor units, never a float

`app/kernel/money` is the (new) money helper: it parses a human decimal string into
integer minor units with **string arithmetic** (no float multiplication), formats and
round-trips exactly, resolves a currency's minor-digit count from `Intl`, and
performs **no currency conversion**. Amounts are stored as `INTEGER` with a
non-negative CHECK. Money is never shown on a collection card by default.

### Dates — wall-calendar, owner timezone

Date fields are literal `YYYY-MM-DD` strings compared as integers, never routed
through `Date` (ADR-022 §22.7). "Today" is the owner-calendar day
(`ownerCalendarIso`), so the whole app agrees on what "today" means. One canonical
evaluator — `app/modules/assets/asset-dates.ts` — classifies every due date
(overdue / due-soon / today / future / historical) and picks the single "next
meaningful date". The collection card, Summary and Dates tab all derive from it; due
date logic is never duplicated.

### Controlled vocabularies (stable keys, friendly labels)

- **Type** — `vehicle`, `trailer` (Trailer or camper), `equipment`, `appliance`,
  `electronics`, `tool`, `property_item`, `document`, `licence`, `insurance`,
  `subscription`, `software`, `other`. Extend by adding a key to the vocabulary and
  the migration CHECK (and a subtype icon) — no schema redesign.
- **Status** — `active`, `stored`, `loaned`, `under_repair`, `retired`, `disposed`.

---

## 3. The repository contract (`AssetRepository`)

Workspace-bound (ADR-010): constructed with one `WorkspaceContext`; no method
accepts a `workspaceId`; the trusted Activity actor is bound at construction.

- `create` — validates, then writes the `entities` row, the `asset_details` row and
  one `asset.created` event in ONE atomic `D1Database.batch()`.
- `get` — fails closed (missing / wrong-type / soft-deleted / cross-workspace → `null`);
  archived assets are returned (archive is not deletion).
- `list` — bounded cursor pagination with a deterministic total order over the FULL
  workspace collection in SQL (never only the loaded page). Views: `all`, `recent`,
  `expiring`, `service_due`, `archived`. Structured filters (type, status, area,
  owner/responsible person, tag) and a non-sensitive text query; sorts: recently
  updated, title, type, next date. The cursor is versioned and **scope-bound** — a
  cursor issued for one (workspace + view + sort + filters + query) is rejected under
  any other.
- `update` — touches only changed columns; an idempotent no-op appends nothing; a
  status change appends `asset.status_changed` / `asset.disposed`, any other change
  appends `asset.updated`.
- `archive` / `restore` — reversible put-away, atomic with `asset.archived` /
  `asset.restored`; independent of status.
- `permanentlyDelete` — **guarded**: refuses while active relationships reference the
  Asset (`{ deleted: false, blockedReason: "has_links" }`), then purges the Asset's
  footprint child-first in one atomic, race-closing batch. Never touches a linked
  record.

**Activity privacy (§17):** payloads carry only changed field NAMES and the status
vocabulary term — never a serial/policy number, price or private note.

---

## 4. The module (routes, navigation, UI)

Registered declaratively in `app/modules/assets/module.ts` (entity type, activity
types, `asset.linked_*` link types, commands, search provider) — discovery wires it
in with no central edit.

- **Routes** (`routes.manifest.ts`): `/assets` (collection, the only sidebar row),
  `/assets/recent`, `/assets/expiring`, `/assets/service-due`, `/assets/archived`
  (label-less sub-views reached from the collection's view switcher), `/new/asset`
  (create page), `/assets/create` (action-only JSON endpoint), `/asset/:id` (record),
  `/asset/:id/mutate` (action-only lifecycle/edit endpoint), `/asset/:id/activity`
  (Timeline JSON).
- **Collection** (`AssetsCollection.tsx`) — the shared PX-02 Collection Layout with a
  segmented view switcher, a URL-driven filter bar (type/status/area/owner/tag), a
  sort control, DS-04 Cards and cursor "Load more". Cards show only non-sensitive
  facts (subtype icon, title, type, status, make/model, location) plus the single
  next meaningful date, phrased explicitly ("Warranty expires in 18 days", "Service
  overdue", "Renewal due 12 September") — never colour alone.
- **Record** (`AssetRecord.tsx`) — the canonical DS-02 Record Layout with tabs:
  **Summary** (glance: icon/type, status, make/model, owner/responsible/area,
  location, next date, edit action), **Details** (grouped structured editing;
  changing the type never clears other data), **Dates** (chronological, status-tagged),
  **Linked** (the shared `LinkedItemsTab`, `anchorType="asset"`), **Activity** (the
  shared Timeline), **Settings** (rename / archive / restore / guarded permanent
  delete via the shared DS-10b Settings + `DangerousAction`).
- **Create** — a responsive progressive flow (`NewAssetForm.tsx`): start with a name
  and a type, then reveal only the fields relevant to that type
  (`asset-form-model.ts`, unit-tested); switching type preserves entered values. Full
  editing lives on the record's Details tab.
- **Subtype icons** — `asset-icons.tsx` maps each type to one stable icon from the
  shared icon set (`~/shared/icons`), with a safe fallback to the Asset entity glyph
  (mirrors the Diary subtype-icon precedent). Icons are `currentColor` (design
  tokens), work in light and dark, and are always paired with text.
- **Search & commands** — `search.ts` registers a real, repository-backed provider
  (title, manufacturer, model, type, location, provider, tags — never sensitive
  fields), resolving `/asset/:id` and participating in PR #69 linked-result boosting;
  `commands.ts` adds Open Assets, New Asset, View Expiring Assets, View Service Due
  Assets and Archived Assets.

---

## 5. Cross-module integration & the Today seam

`AssetRepository.list` with `view: "expiring" | "service_due" | "recent"` is the
clean, bounded read seam a future Today widget can consume. No Today redesign ships
in ASSET-01; a Today "expiring / service due" widget is the next small follow-up
(recorded in [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md)).

---

## 6. Accessibility & mobile

Verified at 320 / 375 / 390 / 768 / desktop / wide desktop: no horizontal overflow;
long serial numbers, URLs and titles wrap; coarse-pointer touch targets meet the
44px minimum; the collection, forms, tabs and lifecycle are keyboard-operable with
visible focus; status and date meaning is carried by text (never colour alone);
sensitive values are never exposed through an accessible name; axe (WCAG 2.2 AA)
passes in light and dark; Back/Forward and refresh preserve collection filters and
the record tab. Covered by `e2e/assets.spec.ts` and the shared
`e2e/accessibility.spec.ts` / `e2e/responsive.spec.ts` sweeps.

---

## 7. Not implemented (by design)

Deferred to later work (no dead UI ships for any of these) — see
[`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md): real file attachments; R2/object
storage; OCR; barcode/QR scanning; recurring reminders and automated warranty
alerts; service-history logbooks; depreciation/tax calculations; an insurance-claims
workflow; receipt/email ingestion; external subscription sync; AI extraction;
household sharing/permissions beyond current workspace rules.

---

## Related documents

- [ADR-049](../decisions/ARCHITECTURE_DECISIONS.md#adr-049-first-class-assets--the-asset_details-slice-integer-minor-unit-money-and-the-real-world-status-vs-record-archive-split) — the Assets decision record.
- [`DATA_KERNEL.md`](DATA_KERNEL.md) — entities, workspace scoping, atomic Activity, cursors.
- [`RELATIONSHIPS.md`](RELATIONSHIPS.md) — the Universal Relationship System (Assets are a supported endpoint).
- [`ACTIVITY_TIMELINE.md`](ACTIVITY_TIMELINE.md) — the shared Activity stream and payload privacy.
- [`PEOPLE_MODULE.md`](PEOPLE_MODULE.md) / [`MEETINGS_MODULE.md`](MEETINGS_MODULE.md) — the supporting-entity pattern Assets follows.
- [`MODULES.md`](MODULES.md) — the module registry.
- [`ACCESSIBILITY_RESPONSIVE.md`](ACCESSIBILITY_RESPONSIVE.md) — the a11y/responsive contract.
