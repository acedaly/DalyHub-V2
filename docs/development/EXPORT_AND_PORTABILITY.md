# EXPORT_AND_PORTABILITY.md — Full workspace export (X-04)

> How the owner gets **everything** out of DalyHub, and what the exported files
> mean. This implements [X-04](../roadmap/ROADMAP_V2.md#-x-04--export--data-portability)
> and establishes the canonical snapshot contract [SET-02](../roadmap/ROADMAP_V2.md#-set-02--backup--restore)
> will later restore from.
>
> Decision & rationale: [ADR-065](../decisions/ARCHITECTURE_DECISIONS.md#adr-065-the-canonical-workspace-snapshot-and-two-serialisers-derived-from-it).
> Related: [`SETTINGS_MODULE.md`](SETTINGS_MODULE.md) · [`MARKDOWN_PIPELINE.md`](MARKDOWN_PIPELINE.md) ·
> [`RELATIONSHIPS.md`](RELATIONSHIPS.md) · [`DATA_KERNEL.md`](DATA_KERNEL.md) ·
> [`DEPLOYMENT.md`](DEPLOYMENT.md).

---

## The one rule

**There is exactly ONE representation of a workspace, and every export is derived
from it.**

```
D1  →  WorkspaceSnapshotRepository  →  DalyHubWorkspaceSnapshotV1  →  validate
                                                                   ├→ structured archive (.zip)
                                                                   └→ Obsidian vault (.zip)
```

Both downloads are **pure functions of the same in-memory snapshot**. Neither
reads the database a second time. That is what makes "the two exports cannot
disagree" a structural property rather than a promise a reviewer has to check.

---

## 1. The audit this was built on

X-04 was implemented against the persisted schema, not against assumptions. What
was reviewed before a line was written is recorded in
[`X_04_EXPORT_AUDIT_2026_08.md`](../product/X_04_EXPORT_AUDIT_2026_08.md):
every table in migrations `0001`–`0025`, the authoritative repository for each
kind of data, every lifecycle state, the spine, EntityLinks, Activity, every
module's child records, owner preferences, the exact Markdown-bearing fields, the
existing single-record note export, and the categories that must never be
exported.

---

## 2. The canonical snapshot

`app/kernel/export` — storage-independent, JSON-native, deterministic.

| Concern | Where |
| --- | --- |
| The contract | [`workspace-snapshot.ts`](../../app/kernel/export/workspace-snapshot.ts) |
| The read contract | [`snapshot-repository.ts`](../../app/kernel/export/snapshot-repository.ts) |
| The validator | [`snapshot-validation.ts`](../../app/kernel/export/snapshot-validation.ts) |
| The D1 adapter | [`d1-workspace-snapshot-repository.ts`](../../app/platform/storage/d1/d1-workspace-snapshot-repository.ts) |
| The builder | [`build-snapshot.ts`](../../app/platform/export/build-snapshot.ts) |

### Shape

```
{
  meta:        { schema, schemaVersion, application, exportedAt, consistency },
  workspace:   { id, createdAt, updatedAt },
  owner:       { preferences, taskSavedViews },
  records:     { …21 collections, in a fixed order… },
  limitations: [ { code, subject, detail } ]
}
```

The 21 collections, in serialisation order, are: `entities`, `spineRecords`,
`areaDetails`, `goalDetails`, `projectDetails`, `taskDetails`,
`taskRecurrenceRules`, `noteDetails`, `diaryEntryDetails`, `personDetails`,
`meetingDetails`, `meetingItems`, `meetingItemTasks`, `assetDetails`,
`assetEvents`, `assetObligations`, `reviewDetails`, `reviewSections`,
`entityLinks`, `activities`, `activitySubjects`.

The order is meaningful: entities first, then spine membership, then per-module
detail rows, then module child records, then relationships, then history — so a
restore can insert parents before children without deriving a dependency graph.

### Conventions

- **Instants** are ISO-8601 UTC with millisecond precision. **Calendar dates**
  stay `YYYY-MM-DD` and are never routed through a timezone.
- **Absent means `null`**, explicitly. Never a missing key, never `""`.
- **Ordering is total and documented** per collection (see `SNAPSHOT_ORDER_KEYS`).
  Two exports of unchanged data are byte-identical.
- **Archived and soft-deleted records are included and marked.** An export that
  silently drops them is not a backup.
- **Unlinked (soft-deleted) EntityLinks are included**, so a restore can
  reproduce "explicitly unlinked, stays unlinked".

### Markdown-bearing fields

Exported **verbatim**, never rendered ([ADR-015](../decisions/ARCHITECTURE_DECISIONS.md#adr-015-markdown-source-and-safe-rendering-pipeline)):

`noteDetails[].content` · `taskDetails[].description` ·
`diaryEntryDetails[].body` · `meetingDetails[].agendaMarkdown` ·
`meetingDetails[].notesMarkdown` · `meetingItems[].bodyMarkdown` ·
`reviewSections[].bodyMarkdown`

Everything else that reads like prose — `goalDetails[].definitionOfDone`,
`personDetails[].notes`, the Asset note fields — is stored as plain text and
exported as plain text. The export adds no second parser and no second renderer.

### What is never exported

- Cloudflare Access JWTs, cookies and session state.
- The authenticated owner's **subject identifier**. Preferences are exported;
  the identity that owns them is not — a restore re-binds them to whoever is
  authenticated at the time.
- Cloudflare secrets, bindings, account/database identifiers, `wrangler`
  configuration and environment variables.
- Raw SQL, migrations, application logs and test fixtures.
- Rendered HTML.

`FORBIDDEN_EXPORT_KEY_PATTERN` is a defence-in-depth net over the whole
serialised snapshot: the real defence is that the contract has no such field and
the D1 adapter selects **named columns**, so a column added by a future migration
is never exported by accident.

### Validation is a gate, not a lint

`assertValidWorkspaceSnapshot` runs before serialisation, and the route turns a
failure into an honest error rather than a file. It checks shape, timestamp
format, deterministic ordering and **referential integrity** (every detail row,
link endpoint and Activity subject names an entity the snapshot contains). A
validation message names paths and rules only — never record content — so a
failure cannot become a leak through a log line.

---

## 3. Reads: bounded, deterministic, no N+1

Every collection is read through ONE parameterised statement per page:

- an **explicit column list** (never `SELECT *`);
- a **bounded `LIMIT`**, clamped to `SNAPSHOT_PAGE_SIZE` (500);
- a **keyset cursor** over the collection's documented ordering.

Every ordering is served by an existing index — the composite primary keys the
detail tables already carry, `entities`' primary key, and
`activities_workspace_occurred_idx` for the chronological Activity read. **No
migration and no new index was added.**

A whole export of a realistic workspace costs three fixed reads (workspace,
preferences, saved views) plus one page read per collection. A query-counting
kernel test asserts that adding twenty records does not add a single statement.

### Consistency — stated, not overclaimed

`meta.consistency` is `per-statement-read-committed`.

A snapshot is a **sequence** of statements. Each sees a consistent database, but
the sequence is **not** an atomic point-in-time snapshot: a write committed
between two collections is visible to the later one and not the earlier. D1 does
not offer a cross-statement snapshot for this read pattern through the Workers
binding, so DalyHub says so — in the snapshot, in `manifest.json`, in the
archive's `README.md` and in the vault's `Export Information.md`. Collections are
read **sequentially** rather than concurrently, deliberately: it finishes slightly
later and narrows the window in which a concurrent write can land between two
collections.

---

## 4. The structured export

`GET /settings/export/full` → `dalyhub-export-<timestamp>.zip`

| File | What it is |
| --- | --- |
| `manifest.json` | Format, versions, application, export time, record counts by module and lifecycle state, what is included, the consistency statement, limitations, what is excluded, and every file with its SHA-256. |
| `dalyhub-snapshot.json` | The complete canonical snapshot. |
| `SCHEMA.md` | The snapshot's structure, ordering rules, Markdown-bearing fields and the compatibility policy. |
| `README.md` | What this archive is, for a person opening it in five years. |
| `CHECKSUMS.txt` | `sha256sum` format, so `sha256sum -c CHECKSUMS.txt` verifies an extracted archive with no DalyHub involved. |

This is the input contract SET-02 will read. **Restore is not implemented in this
change** — see §8.

---

## 5. The Obsidian vault

`GET /settings/export/obsidian` → `dalyhub-obsidian-vault-<timestamp>.zip`

```text
DalyHub Export/
  Home.md
  Areas/  Goals/  Projects/  Tasks/  Notes/  Diary/
  Meetings/  People/  Assets/  Reviews/  Other/
  Activity/2026-08.md …
  _DalyHub/
    Export Information.md
    Settings.md
    Unresolved Links.md
    CHECKSUMS.txt
```

Standard Markdown, YAML frontmatter, relative links. **No Obsidian-only syntax**
— it opens in Obsidian with no plugin and reads correctly in any editor.

### Every record file

One file per first-class record — **including archived and soft-deleted ones**,
which carry their state in frontmatter AND a plain sentence at the top of the
body. Frontmatter carries, where applicable: `dalyhub_id`, `dalyhub_type`,
`title`, `lifecycle`, `created`, `updated`, `completed`, `archived`, `deleted`,
`parent_area`/`parent_goal`/`parent_project` (title **and** id), `due`,
`scheduled`, `priority`, `status`, `tags`, `recurrence` (+ series id and
sequence), `linked_ids`, and the export's own schema/version/timestamp.

The readable body preserves the record's canonical Markdown **byte for byte**;
generated headings and metadata go around it, never through it.

A record type this build does not know still gets a file, in `Other/`, with its
identity, lifecycle and relationships — and a sentence saying the complete record
is in the structured export. A future module is never silently dropped.

**Two presentation rules worth knowing.** A **Diary** entry's filename is
prefixed with the calendar day it records, in the entry's *own* timezone
(`Diary/2026-08-01 Morning reflection.md`), so the folder reads chronologically in
any file browser and in Obsidian's sidebar — the daily-note convention, without
inventing a folder hierarchy. And the generated `# Title` heading is **omitted**
when a record's own body already opens with the same H1, which notes very often
do; a first heading that says something *different* keeps both, because the
record's title is information.

### Filenames

`app/platform/export/vault/vault-filenames.ts`. Deterministic and safe on macOS,
Windows, Linux and Obsidian:

| Hazard | Rule |
| --- | --- |
| `/`, `\`, `<>:"\|?*` | replaced with a hyphen — a title can never create a folder |
| control characters | removed (tab/LF/CR collapse to a space instead) |
| Windows device names (`CON`, `COM1`, …) | prefixed with `_` |
| leading/trailing dots and spaces | trimmed — Windows drops them silently |
| a title that reduces to nothing | `Untitled` |
| very long titles | bounded at 80 code points **and** 160 UTF-8 bytes, never splitting a surrogate pair |
| Unicode | **preserved**, normalised to NFC — never transliterated to ASCII |
| duplicate titles, and case-only collisions | **every** member of the colliding group gets a stable id suffix |

Suffixing every member of a collision (rather than "first wins") is what makes a
filename a function of that record alone: adding a record never silently renames
another one's file. A record **renamed in DalyHub** does get a new filename — the
name comes from the title — which is exactly why every file carries a stable
`dalyhub_id`. The id is the identity; the filename is a convenience.

### Links

`[[Wiki Links]]` and `[Label](dalyhub://type/id)` both become ordinary relative
Markdown links to the target's file. Everything else in the body is byte-exact,
including line endings and the contents of code fences — a `dalyhub://` inside a
fenced sample is not a link node, so it is never rewritten.

Resolution mirrors the product:

- a **record link** resolves by stable id, and therefore reaches a soft-deleted
  record's file (which says it is deleted — more useful than a dead end);
- a **wiki link** resolves by title against **active** records only, exactly as
  DalyHub's own resolver does, so a wiki link to a deleted record is genuinely
  unresolved.

An unresolvable link **never fails the export**. The author's label is preserved,
marked `*(unresolved DalyHub link)*` in place, and listed in
`_DalyHub/Unresolved Links.md` with the reason.

### What the vault does not do

It fabricates nothing. No AI summaries, no derived insight, no computed health.
The only derived numbers are completion counts, which are arithmetic over
exported rows and are labelled *"counted from the records in this export"*.

---

## 6. The ZIP writer

`app/platform/export/zip.ts` — dependency-free, ~180 lines, written against the
published PKWARE format.

**A new dependency was evaluated and rejected** under
[AGENTS.md §10–11](../../AGENTS.md#10-open-source-reuse-policy):

| Criterion | Finding |
| --- | --- |
| Can the codebase reasonably provide it? | Yes. A flat set of UTF-8 text entries, no encryption, no ZIP64, no multi-disk. |
| Workers compatible? | The alternatives assume Node `zlib`/`Buffer`/a filesystem. This uses only `Uint8Array`, `DataView`, `TextEncoder` and the platform's `CompressionStream`. |
| Bundle impact | **Zero** added bytes beyond this file; the whole export path is server-only. Measured client delta for X-04: **+1.0 KB gzip** (the Settings component). |
| Licence / provenance / telemetry | Nothing to vet, pin, or audit. No third-party code is copied or adapted. |

Entries are DEFLATE-compressed via `CompressionStream("deflate-raw")` when the
runtime provides it and **STORED** otherwise — feature-detected, so a runtime
without it produces a larger but perfectly valid archive rather than an error.
Compression is only used when it actually shrinks the entry.

Assembly is bounded at `ZIP_MAX_TOTAL_BYTES` (64 MiB of content). Exceeding it
throws `ZipTooLargeError`, which the route reports as an honest 507 rather than
exhausting the isolate. Archive paths are validated independently of the filename
generator, so a traversal bug in either is caught by the other.

---

## 7. Server, security and the Settings surface

### The route

`app/modules/settings/routes/export.tsx` — `GET /settings/export/:format`,
`format` ∈ `full` | `obsidian`.

- `requireAuthenticatedSession` — fails closed with 401.
- `resolveAuthenticatedWorkspaceScope` — the workspace comes from trusted server
  configuration. **The route has no workspace parameter at all**, so no crafted
  request can reach another workspace.
- The owner's subject selects owner-scoped rows as a **query predicate only**.
- Response: `application/zip`, `Content-Disposition: attachment` with an
  ASCII-safe filename, `Cache-Control: no-store, no-cache, must-revalidate,
  private`, `X-Content-Type-Options: nosniff`.
- Nothing is persisted on the Worker or anywhere else; nothing is sent to an
  external service.
- The snapshot repository is **read-only by contract** — it has no mutating
  method — so an export structurally cannot write data or append Activity.
- Failures return a short sentence. No SQL, binding name, workspace id or stack
  trace crosses the boundary.

### Settings → Privacy & data

The "Deferred" export row is gone. In its place:

- a **sensitivity statement before the actions**, naming People, Diary, Meetings,
  Reviews and archived/deleted records, and saying the file is generated on
  demand, never stored and never sent anywhere;
- **Download full DalyHub export** and **Download Obsidian vault**.

Both are buttons that `fetch`, check the response, and only then save the file —
not `<a download>`. That is deliberate: an anchor gives the owner no pending
state and no way to tell success from a server error. There is no typed
confirmation, because the action **changes no DalyHub data**.

A separate "Not available yet" group still names what is genuinely deferred, so
the honesty SET-01 established is preserved.

---

## 8. Compatibility policy

- `meta.schemaVersion` changes **only** for a breaking change: a field removed, a
  field's meaning changed, or an ordering rule changed.
- Adding an optional field, a new collection, or a new `limitations` code is
  **backwards compatible** and does not bump it. A reader must ignore fields it
  does not recognise.
- A reader must check `meta.schema` and `meta.schemaVersion` first and **refuse**
  a major version it does not understand rather than guessing.
- The archive's own `formatVersion` (in `manifest.json`) versions the *file set*
  independently of the snapshot schema.

---

## 9. Known limitations

These are real and recorded rather than hidden.

- **No restore.** DalyHub cannot import this archive. That is [SET-02](../roadmap/ROADMAP_V2.md#-set-02--backup--restore),
  which this change **unblocks but does not start**. Until it ships, the archive
  is a complete readable copy — not a one-click undo.
- **Not an atomic point-in-time snapshot** (§3). Exporting while actively editing
  can produce a file where one collection is a few seconds newer than another.
- **Bounded at 50,000 rows per collection and 64 MiB per archive.** Reaching
  either is reported in `limitations` and in the manifest, never silently
  truncated. No realistic personal workspace is close.
- **A rename changes a filename.** The vault is keyed by title; the snapshot is
  keyed by id. Diffing two vaults across a rename shows a delete and an add.
- **Activity payloads are structural.** An event whose stored payload is not
  valid JSON exports as `payload: null` and is named in `limitations`.
- **The vault's Activity files are label-only.** They carry the event type,
  instant, actor and linked subjects — not a rendered narrative, which would be
  presentation the export has no business inventing.
- **No attachments.** DalyHub stores none yet.

---

## 10. Verification

| Layer | Coverage |
| --- | --- |
| Unit | `test/unit/export/*` — snapshot validation (shape, formats, referential integrity, ordering, forbidden field names), deterministic and collision-safe filenames, path-traversal prevention, Unicode/punctuation/long titles, YAML escaping, internal-link rewriting, unresolved links, Markdown preservation, manifest counts, the ZIP writer against the published format, and the Settings controls (warning, pending, success, error, double-click, keyboard). |
| Kernel / D1 | `test/kernel/workspace-export.test.ts` — a realistic workspace seeded through the **production repositories**, covering every shipped module: every record exported, every id survives, cross-workspace records excluded, structural parents + EntityLinks (including unlinked) + Activity subjects survive, module child records survive, archived/deleted represented, recurrence survives, the snapshot validates, small-page paging matches single-page, a bounded non-N+1 statement count, and **no mutation and no Activity**. `test/kernel/workspace-export-route.test.ts` — fail-closed, unknown format, both ZIPs, cache headers, safe filename, client-supplied workspace ignored, no mutation, no internals in a failure. |
| End-to-end | `e2e/export.spec.ts` — downloads both archives from Settings and inspects them with an **independent** ZIP reader: manifest, snapshot, checksums, secret exclusion, a file from every module, duplicate-title collisions, a `dalyhub://` link that resolves, a deleted target handled honestly, whole-vault link integrity, the pending and error states, keyboard operation and focus, axe in a light and a dark theme, and 320/375/390/430px. |

---

## Related documents

- [ADR-065](../decisions/ARCHITECTURE_DECISIONS.md#adr-065-the-canonical-workspace-snapshot-and-two-serialisers-derived-from-it) — the decision record.
- [`X_04_EXPORT_AUDIT_2026_08.md`](../product/X_04_EXPORT_AUDIT_2026_08.md) — the data-model audit this was built from.
- [`SETTINGS_MODULE.md`](SETTINGS_MODULE.md) — the Settings surface.
- [`DATA_KERNEL.md`](DATA_KERNEL.md) — entities, EntityLinks and Activity.
- [`docs/README.md`](../README.md) — documentation index.
