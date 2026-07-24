# NOTES_PERSISTENCE.md — Notes persistence & domain foundation (NOTES-01A)

> The backend-only persistence slice for Notes: what owns what, the schema, no-row/empty-content semantics, exact Markdown-source preservation, validation and security boundaries, the content-timestamp contract, mutation/Activity atomicity, and workspace isolation. This document covers **only** [NOTES-01A](../roadmap/ROADMAP_V2.md#phase-5--notes-notes); the Markdown editor UI, linking/backlinks, organisation/search and mobile Notes work remain [NOTES-01](../roadmap/ROADMAP_V2.md#-notes-01--note-record--markdown-editor) and later.

---

## Ownership boundaries

Notes are first-class DalyHub entities but are deliberately **not** part of the Area → Goal → Project → Task spine (AGENTS.md §4). A Note attaches to the spine — or to anything else — only through a future [EntityLink](../decisions/ARCHITECTURE_DECISIONS.md#adr-002-entitylinks) ([NOTES-02](../roadmap/ROADMAP_V2.md#-notes-02--linking--backlinks)), never as a structural child.

| Concern | Owner |
|---|---|
| Identity, `id`, workspace, title, lifecycle (create/rename/soft-delete/restore), base timestamps | The generic `EntityRepository` (`app/kernel/entities`, FND-02/FND-03) — `entities` table, `type = 'note'`. |
| Markdown content (the Note's body) | The new, Notes-owned `NoteDetailsRepository` (`app/kernel/notes`) — `note_details` table. |
| Rendered HTML | Nobody. It is derived, disposable output computed on demand by the FND-08 renderer and **never persisted**, here or anywhere. |
| Backlinks, tags, organisation, folders, EntityLinks to other records | Out of scope for this slice — later NOTES-02/03 work. |

This mirrors the established additive-detail-table pattern already used by [Goal Details](../roadmap/ROADMAP_V2.md#-area-02--goal-records) (`goal_details`) and [Project Settings](../roadmap/ROADMAP_V2.md#-proj-05--project-settings) (`project_details`): the base `entities` table stays a generic substrate (ADR-009); a small, additively-attached table owns exactly the domain-specific field(s) the base table deliberately does not model.

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

A Note has **two** independent timestamps once it has been edited:

- `entities.updated_at` — advances when the Note's `title` changes (owned by `EntityRepository`).
- `note_details.updated_at` — advances when the Note's `content` changes (owned by `NoteDetailsRepository`), surfaced as `NoteDetailsRecord.contentUpdatedAt` (`null` when there is no row yet).

This repository deliberately does **not** compute a combined "last updated" value — it returns the raw content timestamp (or `null`) and leaves the future Notes UI/read-model free to compute `max(entities.updatedAt, noteDetails.contentUpdatedAt ?? entities.createdAt)` (or whatever presentation the eventual Notes UI needs) without this kernel slice guessing at that policy prematurely.

## Mutation & Activity atomicity

`NoteDetailsRepository.update(id, content)`:

1. Verifies the target is an **active** `note` in the bound workspace — folded into the mutating SQL statement's `WHERE EXISTS (SELECT 1 FROM entities WHERE workspace_id = ? AND id = ? AND type = 'note' AND deleted_at IS NULL)` clause, not just an earlier, separately-trusted precondition read. A precondition read still happens first (to compute the idempotency check below), but the SQL-level guard is the actual authority: a Note soft-deleted *between* that read and the write cannot commit an orphaned row.
2. Validates the submitted source through `parseMarkdownSource` (`validateNoteContent`).
3. Is **idempotent**: if the validated source exactly matches the currently-stored *effective* content (the empty string when there is no row), the call returns `{ changed: false }` without writing anything and without appending Activity.
4. On a genuine change, upserts `note_details` and appends exactly one `note.content_updated` Activity event **atomically**, in the same `D1Database.batch()` (the shared `recordAtomicMutation` seam, ADR-012) used by every other DalyHub mutation repository (`D1GoalDetailsRepository`, `D1ProjectSettingsRepository`, `D1TaskRepository`, …). The event insert is guarded on the content statement's `changes()`, so a losing race or a gate failure appends nothing; conversely, an Activity-insert failure rolls the content write back too — proven with the shared test-only `mutationFault` fault-injection seam.
5. Fails closed with `NoteDetailsNotFoundError` for a missing, soft-deleted, wrong-type or cross-workspace id — the cases are never distinguished, so a caller cannot learn which one occurred.
6. **Stays idempotent under genuine concurrency, not just sequential calls.** The initial idempotency check (step 3) compares against a value read *before* the write, so two concurrent submissions of the *same* new content (e.g. two overlapping autosave requests) can both pass it. The `ON CONFLICT DO UPDATE`'s own `WHERE note_details.content != excluded.content` predicate is the real, storage-level guard: whichever request loses the race finds the content already written, its UPDATE is skipped, and `update` reconciles that outcome as an idempotent success (`{ changed: false }`) rather than a conflict — so a duplicate concurrent save never pollutes the Note's Activity timeline with a second `note.content_updated` event.

The `note.content_updated` Activity payload is minimal and non-sensitive:

```ts
{ empty: boolean } // whether the new content is the empty string
```

It never contains Markdown source, rendered HTML, user text, or an excerpt/snippet.

## Workspace isolation

`NoteDetailsRepository` is constructed already bound to one `WorkspaceContext` (`createNoteDetailsRepository(db, context, options)`) — no method accepts a `workspaceId`, mirroring every other workspace-scoped repository (ADR-010). It is exposed on `WorkspaceScope.noteDetails` alongside `entities`/`goalDetails`/`projectSettings`, composed by `resolveWorkspaceScope`/`bindWorkspaceRepositories` (`app/platform/workspaces/composition.ts`) with the same trusted, server-derived actor context — a caller can never supply or override the workspace or the Activity actor.

## What remains for the later Notes UI slice

This slice is backend-only. Deliberately **not** built here (see [NOTES-01](../roadmap/ROADMAP_V2.md#-notes-01--note-record--markdown-editor) and later):

- Notes collection/record routes, a Notes module manifest, navigation entries, entity icon/search/command-palette registration.
- A Markdown editor, preview/split-pane editing, autosave UI.
- Tags, folders, Areas filtering, organisation.
- EntityLinks/backlinks, wikilinks/mentions ([NOTES-02](../roadmap/ROADMAP_V2.md#-notes-02--linking--backlinks), [NOTES-03](../roadmap/ROADMAP_V2.md#-notes-03--organisation--search)).
- Mobile-specific Notes work ([NOTES-04](../roadmap/ROADMAP_V2.md#-notes-04--mobile)).
- Attachments/R2, Diary integration, AI features, import/export.

**NOTES-01 is not complete.** This PR delivers only the persistence and domain foundation described above; [NOTES-01](../roadmap/ROADMAP_V2.md#-notes-01--note-record--markdown-editor)'s roadmap status is unchanged.

## Why no new ADR

This slice applies existing, accepted decisions without introducing a new architectural choice:

- [ADR-009](../decisions/ARCHITECTURE_DECISIONS.md#adr-009-data-kernel-storage) — entities stay a generic substrate; domain fields arrive as additive tables.
- [ADR-012](../decisions/ARCHITECTURE_DECISIONS.md#adr-012-activity-persistence-and-atomic-mutation-recording) — atomic domain-mutation + Activity recording via the shared `recordAtomicMutation` seam.
- [ADR-006](../decisions/ARCHITECTURE_DECISIONS.md#adr-006-markdown-strategy) / [ADR-015](../decisions/ARCHITECTURE_DECISIONS.md#adr-015-markdown-source-and-safe-rendering-pipeline) — Markdown source is durable and validated by the one shared FND-08 parser; no second parser/sanitiser.
- [ADR-028](../decisions/ARCHITECTURE_DECISIONS.md#adr-028-task-drawer-persistence-and-composition--the-additive-task-detail-slice) — precedent for exactly this shape: a small, additive, entity-type-constrained detail table composing the entity substrate rather than extending it, later reused without a new ADR for Goal Details and Project Settings. NOTES-01A is a direct application of that established pattern to a new (non-spine) entity type.

No kernel contract changed shape, no new storage technology was introduced, and no cross-cutting rule was revised — so no new ADR is warranted. If a future Notes slice (e.g. NOTES-02's linking model) introduces a genuinely new decision, it will get its own ADR at that time.

---

## Related documents
- [`MARKDOWN_PIPELINE.md`](MARKDOWN_PIPELINE.md) — the authoritative Markdown source/validation/rendering contract this slice consumes unchanged.
- [`SPINE_MODEL.md`](SPINE_MODEL.md) — why Notes are deliberately outside the spine.
- [`ARCHITECTURE_OVERVIEW.md`](../architecture/ARCHITECTURE_OVERVIEW.md) — how the kernel/platform layers fit together.
- [`ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md#phase-5--notes-notes) — the Notes phase and its items.
- [`docs/README.md`](../README.md) — documentation index.
