# NOTES_PERSISTENCE.md — Notes persistence & domain foundation (NOTES-01A)

> The backend-only persistence slice for Notes: what owns what, the schema, no-row/empty-content semantics, exact Markdown-source preservation, validation and security boundaries, the content-timestamp contract, mutation/Activity atomicity, and workspace isolation. This document covers **only** [NOTES-01A](../roadmap/ROADMAP_V2.md#phase-5--notes-notes) — the persistence layer, which never changed for NOTES-01B or NOTES-01C. The collection/creation/canonical-record UI that composes this foundation is [NOTES-01B](../roadmap/ROADMAP_V2.md#-notes-01b--notes-collection-and-canonical-markdown-record); autosave, the desktop editor layout and the delete/restore lifecycle UI are [NOTES-01C](../roadmap/ROADMAP_V2.md#-notes-01c--notes-autosave-lifecycle--editor-polish) — see [NOTES_MODULE.md](./NOTES_MODULE.md) and [ADR-042](../decisions/ARCHITECTURE_DECISIONS.md#adr-042--notes-autosave-adaptation-and-the-first-generic-record-lifecycle-soft-deleterestore-ui-pattern). Linking/backlinks, organisation/search and mobile-specific work remain NOTES-02/03/04.

---

## Ownership boundaries

Notes are first-class DalyHub entities but are deliberately **not** part of the Area → Goal → Project → Task spine (AGENTS.md §4). A Note attaches to the spine — or to anything else — only through a future [EntityLink](../decisions/ARCHITECTURE_DECISIONS.md#adr-002-entitylinks) ([NOTES-02](../roadmap/ROADMAP_V2.md#-notes-02--linking--backlinks)), never as a structural child.

| Concern | Owner |
|---|---|
| Identity, `id`, workspace, title, lifecycle (create/rename/soft-delete/restore), base timestamps | The generic `EntityRepository` (`app/kernel/entities`, FND-02/FND-03) — `entities` table, `type = 'note'`. |
| Markdown content (the Note's body) | The new, Notes-owned `NoteDetailsRepository` (`app/kernel/notes`) — `note_details` table. |
| Rendered HTML | Nobody. It is derived, disposable output computed on demand by the FND-08 renderer and **never persisted**, here or anywhere. |
| Backlinks, tags, organisation, folders, EntityLinks to other records | Out of scope for this slice — later NOTES-02/03 work. |

This mirrors the established additive-detail-table pattern already used by [Goal Details](../roadmap/ROADMAP_V2.md#-area-02--goals) (`goal_details`) and [Project Settings](../roadmap/ROADMAP_V2.md#-proj-05--settings) (`project_details`): the base `entities` table stays a generic substrate (ADR-009); a small, additively-attached table owns exactly the domain-specific field(s) the base table deliberately does not model.

Generic Note creation, title updates, soft-delete and restore go through the existing `EntityRepository` unchanged — `note` is **not** a reserved spine entity type, so nothing new was needed there. This slice adds no second identity repository and no generic-CRUD duplication.

## Schema

Migration `migrations/0010_create_note_details.sql` adds one additive, STRICT table:

```sql
CREATE TABLE note_details (
  workspace_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'note',
  content TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT note_details_pk PRIMARY KEY (workspace_id, entity_id),
  CONSTRAINT note_details_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT note_details_entity_not_empty CHECK (length(entity_id) > 0),
  CONSTRAINT note_details_entity_type CHECK (entity_type = 'note'),
  CONSTRAINT note_details_updated_at_not_empty CHECK (length(updated_at) > 0),
  CONSTRAINT note_details_entity_fk FOREIGN KEY (workspace_id, entity_id, entity_type)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT
) STRICT;
```

- **Composite identity, workspace-scoped.** `PRIMARY KEY (workspace_id, entity_id)` — a Note's content row is addressed by workspace *and* entity, never entity id alone.
- **Composite foreign key, type-constrained attachment.** `(workspace_id, entity_id, entity_type) → entities (workspace_id, id, type)` — the same technique `spine_records.kind`, `task_details.entity_type`, `project_details.entity_type` and `goal_details.entity_type` use. Because `entity_type` is CHECK-constrained to the literal `'note'`, a row can only ever attach to an `entities` row that is *also* typed `note` in the *same* workspace — a non-Note entity, or a Note in a different workspace, cannot receive a row at the database level. `ON DELETE RESTRICT` — the database refuses to delete an `entities` row this table still references (soft-delete is used instead; see below).
- **No rendered HTML, excerpt cache, editor JSON, or duplicated title.** `content` is the one and only payload column: the exact Markdown source. There is no cached HTML column, no search-excerpt column, no proprietary editor document column, and no copy of `entities.title`.
- **No blank-content CHECK.** Unlike `goal_details.definition_of_done` (which forbids a blank string because `null` already means "unset"), `note_details.content` has **no** non-empty/non-blank constraint: the empty string — and a whitespace-only string — are valid, meaningful Markdown and must be storable exactly as submitted.
### NOTES-03 additions (migration `0019_notes_knowledge.sql`)

Two additive columns, and nothing else about the table changed:

```sql
ALTER TABLE note_details ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
ALTER TABLE note_details ADD COLUMN archived_at TEXT;
```

- **`tags`** — a JSON array of normalised (trimmed, whitespace-collapsed,
  case-folded, de-duplicated, **sorted**) tag strings, matching the
  `person_details.tags` / `asset_details.tags` convention. It is **not** a
  comma-separated id list: tags are labels, never references. The kernel
  validates and bounds the set (`MAX_NOTE_TAGS`, `MAX_NOTE_TAG_LENGTH`); a
  corrupt stored value degrades to "no tags" on read rather than failing it.
  Sorting makes the value canonical, so an unchanged set is byte-identical and
  a re-save is a genuine no-op.
- **`archived_at`** — the reversible "put away" state, deliberately DISTINCT
  from the entity's own `deleted_at` (exactly as `person_details.archived_at`
  and `area_details.archived_at` already are). `NULL` means active.
- **Idempotency.** Every index in the migration is `IF NOT EXISTS`. SQLite/D1 has
  no `ADD COLUMN IF NOT EXISTS`, so the two `ALTER`s rely on the migration ledger
  Wrangler maintains — the same guarantee every earlier DalyHub migration
  depends on. Both columns have safe defaults, so **no backfill pass runs** and
  no existing row is rewritten.
- **Relationships are NOT modelled here.** Note↔Project knowledge associations
  and `[[Wiki Link]]` references are ordinary FND-04 `entity_links` rows. See
  [ADR-054](../decisions/ARCHITECTURE_DECISIONS.md#adr-054-note-knowledge--a-wiki-link-is-a-persisted-reference-and-knowledge-relationships-stay-entitylinks).
- **`dalyhub://` record links added NO schema** (NOTES-05 knowledge completion,
  2026-08-01). A record link is ordinary Markdown text inside the `content`
  column that already holds Markdown, and it reconciles into the SAME
  `note.references` EntityLink type a `[[Wiki Link]]` produces. There is no
  link-identity column, no second relationship table and no migration — the
  sequence is unchanged at `0025`. See
  [ADR-064](../decisions/ARCHITECTURE_DECISIONS.md#adr-064-the-dalyhub-record-link-and-a-reconciliation-contract-for-autosave).

### Indexes

`0019` adds three partial/covering indexes on `note_details` — active notes,
archived notes, and the workspace+updated pair the `recent` ordering and the
effective-updated computation read. It deliberately does **not** add a full-text
index over `content`: a leading-wildcard `LIKE` cannot use a B-tree index in any
case, and FTS5 would require a shadow virtual table kept in sync by triggers —
a second, derived representation of the canonical Markdown source, which
ADR-015 exists to prevent. The trade-off is recorded in the migration itself and
in [`SHARED_SEARCH.md`](SHARED_SEARCH.md).

- **No backfill.** The migration performs no `INSERT ... SELECT` over existing data (contrast `0008_create_project_details.sql`, which *did* backfill because every pre-existing Project needed an operational status). There is nothing to backfill: every `note`-typed entity is created fresh, after this migration exists, with no prior content to migrate. An existing Note simply has no `note_details` row until first edited.

## No-row / empty-content semantics

**An active Note with no `note_details` row represents valid, empty Markdown content — not "missing" or "null" content.** The empty string is valid Markdown (FND-08), and DalyHub does not distinguish "never touched" from "explicitly emptied" at the read boundary: both read back as `content: ""`.

The one place this *is* observable is the content timestamp:

- No row → `contentUpdatedAt: null` (content has never been written).
- A row exists (even with `content: ""`) → `contentUpdatedAt` is the real timestamp of the last content write.

**Once content has been changed, clearing it later does not delete the row.** `update` always upserts (`INSERT … ON CONFLICT DO UPDATE`); it never issues a `DELETE`. This is deliberate: clearing a Note's content to `""` is itself a meaningful edit, and the content timestamp must keep representing *that* edit rather than reverting to "never touched". A cleared-then-reinspected Note therefore reads back as `content: ""` with a real, non-null `contentUpdatedAt` — distinguishable, if a future reader cares, from a Note that was never edited at all.

## Exact Markdown-source preservation

`note_details.content` stores the **exact** validated `MarkdownSource` the caller submitted:

- Never trimmed — leading/trailing whitespace (including a whitespace-only source) is preserved byte-for-byte.
- Never line-ending-normalised — CRLF, LF and mixed line endings are preserved exactly as submitted.
- Never reflowed or rewritten — headings, list markers, and all other Markdown syntax are stored verbatim.
- Raw HTML present in the source is preserved in storage. FND-08 already guarantees it can never become executable DOM at render time (`remark-rehype` with `allowDangerousHtml: false`, plus sanitisation as defence in depth) — storage-side stripping would just be redundant and lossy, so this slice does not add any.
- Never converted to HTML before persistence. Rendered HTML is never computed by this repository, let alone stored.

## Validation & security boundary

Validation is delegated entirely to the **one** shared FND-08 parser — this slice adds no second Markdown parser, sanitiser, size limit or control-character rule:

```ts
import { parseMarkdownSource } from "~/kernel/markdown";
```

`app/kernel/notes/note-details.ts` exposes a thin `validateNoteContent` wrapper that calls `parseMarkdownSource` directly (no trimming, no blank-to-`null` normalisation — unlike a *nullable* Markdown field such as a Task's description) and re-types any `MarkdownError` as a `NoteDetailsValidationError` so the error family stays consistent with the rest of this module, mirroring `~/kernel/tasks`' `validateTaskDescription`. This means:

- the documented **1 MiB UTF-8 byte limit** is enforced (not duplicated — it's the same `MARKDOWN_SOURCE_MAX_BYTES` constant);
- disallowed **control characters** (NUL and other C0 controls except tab/LF/CR, plus DEL) are rejected;
- error messages **never echo Note content** — `MarkdownValidationError`/`MarkdownSourceTooLargeError` messages describe only the kind of problem (e.g. a byte count, a control-character codepoint), never the offending text, and `NoteDetailsValidationError` forwards that message unchanged.

## Content-timestamp contract ("effective last updated")

A Note has **two** independent timestamps once it has been edited (a tag or
archive change deliberately advances NEITHER, so it does not reorder the
`recent` view; the one edge is that a Note whose first-ever `note_details` row is
created by a tag/archive change takes that moment as its content timestamp,
representing its empty content):

- `entities.updated_at` — advances when the Note's `title` changes (owned by `EntityRepository`).
- `note_details.updated_at` — advances when the Note's `content` changes (owned by `NoteDetailsRepository`), surfaced as `NoteDetailsRecord.contentUpdatedAt` (`null` when there is no row yet).

This repository deliberately does **not** compute a combined "last updated" value — it returns the raw content timestamp (or `null`) and leaves the future Notes UI/read-model free to compute `max(entities.updatedAt, noteDetails.contentUpdatedAt ?? entities.createdAt)` (or whatever presentation the eventual Notes UI needs) without this kernel slice guessing at that policy prematurely.

## Mutation & Activity atomicity

`NoteDetailsRepository.update(id, content, options?)`:

1. Verifies the target is an **active** `note` in the bound workspace — folded into the mutating SQL statement's `WHERE EXISTS (SELECT 1 FROM entities WHERE workspace_id = ? AND id = ? AND type = 'note' AND deleted_at IS NULL)` clause, not just an earlier, separately-trusted precondition read. A precondition read still happens first (to compute the idempotency check below), but the SQL-level guard is the actual authority: a Note soft-deleted *between* that read and the write cannot commit an orphaned row.
2. Validates the submitted source through `parseMarkdownSource` (`validateNoteContent`).
3. Is **idempotent**: if the validated source exactly matches the currently-stored *effective* content (the empty string when there is no row), the call returns `{ changed: false }` without writing anything and without appending Activity.
4. On a genuine change, upserts `note_details` and appends exactly one `note.content_updated` Activity event **atomically**, in the same `D1Database.batch()` (the shared `recordAtomicMutation` seam, ADR-012) used by every other DalyHub mutation repository (`D1GoalDetailsRepository`, `D1ProjectSettingsRepository`, `D1TaskRepository`, …). The event insert is guarded on the content statement's `changes()`, so a losing race or a gate failure appends nothing; conversely, an Activity-insert failure rolls the content write back too — proven with the shared test-only `mutationFault` fault-injection seam.
5. Fails closed with `NoteDetailsNotFoundError` for a missing, soft-deleted, wrong-type or cross-workspace id — the cases are never distinguished, so a caller cannot learn which one occurred.
6. **Stays idempotent under genuine concurrency, not just sequential calls.** The initial idempotency check (step 3) compares against a value read *before* the write, so two concurrent submissions of the *same* new content (e.g. two overlapping autosave requests) can both pass it. The `ON CONFLICT DO UPDATE`'s own `WHERE note_details.content != excluded.content` predicate is the real, storage-level guard: whichever request loses the race finds the content already written, its UPDATE is skipped, and `update` reconciles that outcome as an idempotent success (`{ changed: false }`) rather than a conflict — so a duplicate concurrent save never pollutes the Note's Activity timeline with a second `note.content_updated` event.

7. **Refuses a stale save rather than applying it (AUDIT-08).** Step 6 keeps *identical* content honest, but it could not tell a stale save from a fresh one: two tabs each held a whole document, and whichever saved last replaced the other's paragraphs silently. `options.expectedContentUpdatedAt` — the `contentUpdatedAt` the editor loaded — is folded into the SAME statement as an extra `AND note_details.updated_at = ?` predicate, so a save based on text that has since changed matches zero rows, and the reconciliation above raises `NoteDetailsConflictError` instead of committing. `null` is a DISTINCT quoted value meaning "this Note had no saved content when I opened it", guarded as `note_details.content = ''` so a row created in the meantime by `setTags`/`setArchived` (which write empty content) cannot manufacture a false conflict. The INSERT branch is deliberately ungated — no row means no stored content, so there is nothing a stale writer could destroy. **Omitting the option keeps the previous behaviour exactly**, which is what lets the capture panel write a brand-new Note's first body with nothing to be stale about.

   `POST /notes/:noteId/mutate` (`intent=update_content`) reads the precondition from an `expectedContentUpdatedAt` form field, with four distinct readings: ABSENT means no precondition (a caller with nothing to be stale about), EMPTY means "never saved", a valid timestamp means that version, and a value that is present but **unparseable is REFUSED with `400` and nothing is written**. That last case is deliberate and worth stating plainly: degrading a malformed precondition to "no precondition" would give a stale caller a way to opt out of the compare-and-set and overwrite newer stored content, which is exactly the loss this mechanism exists to prevent — and refusing costs the owner nothing, because their draft never left the editor. A guard with an opt-out is not a guard.

The two failures mean different things and are never collapsed: a value that PARSES but names a version that is no longer current is a **`409`** carrying `{ conflict: true, serverContent, contentUpdatedAt }` (there is a newer version, here it is); a value that cannot be read is a `400` validation error (there is nothing to compare). A successful save returns the new `contentUpdatedAt`, so a long editing session keeps quoting a current base. Neither is ever a `500`: nothing failed. The editor's half of the contract (hold the base until the owner answers; offer the newer text through the shared `RemoteChangeBanner`) is in [SHARED_FORMS.md](./SHARED_FORMS.md).

The `note.content_updated` Activity payload is minimal and non-sensitive:

```ts
{ empty: boolean } // whether the new content is the empty string
```

It never contains Markdown source, rendered HTML, user text, or an excerpt/snippet.

## Workspace isolation

`NoteDetailsRepository` is constructed already bound to one `WorkspaceContext` (`createNoteDetailsRepository(db, context, options)`) — no method accepts a `workspaceId`, mirroring every other workspace-scoped repository (ADR-010). It is exposed on `WorkspaceScope.noteDetails` alongside `entities`/`goalDetails`/`projectSettings`, composed by `resolveWorkspaceScope`/`bindWorkspaceRepositories` (`app/platform/workspaces/composition.ts`) with the same trusted, server-derived actor context — a caller can never supply or override the workspace or the Activity actor.

## What remains for the later Notes UI slices

This slice was backend-only. [NOTES-01B](../roadmap/ROADMAP_V2.md#-notes-01b--notes-collection-and-canonical-markdown-record) built the Notes collection/record routes and the Markdown source editor on top of this foundation; [NOTES-01C](../roadmap/ROADMAP_V2.md#-notes-01c--notes-autosave-lifecycle--editor-polish) added dependable autosave (the same DS-06 coordinator this document's `NoteDetailsRepository.update` boundary already served — autosave changed WHEN a save fires, never this persistence layer), a desktop Source/Split/Preview editor layout, and delete/restore built on the `entities.softDelete`/`.restore` this document already documents (§ above) — see [NOTES_MODULE.md](./NOTES_MODULE.md) and [ADR-042](../decisions/ARCHITECTURE_DECISIONS.md#adr-042--notes-autosave-adaptation-and-the-first-generic-record-lifecycle-soft-deleterestore-ui-pattern). Still deliberately not built:

- Tags, folders, Areas filtering, organisation, content search.
- EntityLinks/backlinks, wikilinks/mentions ([NOTES-02](../roadmap/ROADMAP_V2.md#-notes-02--linking--backlinks), [NOTES-03](../roadmap/ROADMAP_V2.md#-notes-03--organisation--search)).
- Mobile-specific Notes work beyond the DS-11 baseline and NOTES-01C's own responsive/touch-target coverage ([NOTES-04](../roadmap/ROADMAP_V2.md#-notes-04--mobile)).
- Offline-first editing (queuing writes made while offline for later sync) — NOTES-01C only detects and honestly attributes an offline save failure.
- Attachments/R2, Diary integration, AI features, import/export.

NOTES-01A, NOTES-01B and NOTES-01C are each done in full.

## Why no new ADR

This slice applies existing, accepted decisions without introducing a new architectural choice:

- [ADR-009](../decisions/ARCHITECTURE_DECISIONS.md#adr-009-data-kernel-storage) — entities stay a generic substrate; domain fields arrive as additive tables.
- [ADR-012](../decisions/ARCHITECTURE_DECISIONS.md#adr-012-activity-persistence-and-atomic-mutation-recording) — atomic domain-mutation + Activity recording via the shared `recordAtomicMutation` seam.
- [ADR-006](../decisions/ARCHITECTURE_DECISIONS.md#adr-006-markdown-strategy) / [ADR-015](../decisions/ARCHITECTURE_DECISIONS.md#adr-015-markdown-source-and-safe-rendering-pipeline) — Markdown source is durable and validated by the one shared FND-08 parser; no second parser/sanitiser.
- [ADR-028](../decisions/ARCHITECTURE_DECISIONS.md#adr-028-task-drawer-persistence-and-composition--the-additive-task-detail-slice) — precedent for exactly this shape: a small, additive, entity-type-constrained detail table composing the entity substrate rather than extending it, later reused without a new ADR for Goal Details and Project Settings. NOTES-01A is a direct application of that established pattern to a new (non-spine) entity type.

No kernel contract changed shape, no new storage technology was introduced, and no cross-cutting rule was revised — so no new ADR is warranted for NOTES-01A itself. (NOTES-01C did later add [ADR-042](../decisions/ARCHITECTURE_DECISIONS.md#adr-042--notes-autosave-adaptation-and-the-first-generic-record-lifecycle-soft-deleterestore-ui-pattern) — not for this persistence layer, which it left untouched, but for the UI-layer autosave adaptation and the first generic record-lifecycle pattern built on top of it.) If a future Notes slice (e.g. NOTES-02's linking model) introduces a genuinely new decision, it will get its own ADR at that time.

---

## Related documents
- [`NOTES_MODULE.md`](NOTES_MODULE.md) — the NOTES-01B collection/creation/canonical-record UI built on this foundation.
- [`MARKDOWN_PIPELINE.md`](MARKDOWN_PIPELINE.md) — the authoritative Markdown source/validation/rendering contract this slice consumes unchanged.
- [`SPINE_MODEL.md`](SPINE_MODEL.md) — why Notes are deliberately outside the spine.
- [`ARCHITECTURE_OVERVIEW.md`](../architecture/ARCHITECTURE_OVERVIEW.md) — how the kernel/platform layers fit together.
- [`ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md#phase-5--notes-notes) — the Notes phase and its items.
- [`docs/README.md`](../README.md) — documentation index.
