# EXPORT_AND_PORTABILITY.md — Full workspace export (X-04)

> How the owner gets **everything** out of DalyHub, and what the exported files
> mean. This implements [X-04](../roadmap/ROADMAP_V2.md#-x-04--export--data-portability)
> and establishes the canonical snapshot contract
> [SET-02](../roadmap/ROADMAP_V2_1.md#-set-02--backup--restore-v21) restores
> from. **The structured export IS the backup format** — how it is read back in
> is [`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md).
>
> Decision & rationale: [ADR-065](../decisions/ARCHITECTURE_DECISIONS.md#adr-065-the-canonical-workspace-snapshot-and-two-serialisers-derived-from-it).
> Related: [`SETTINGS_MODULE.md`](SETTINGS_MODULE.md) · [`MARKDOWN_PIPELINE.md`](MARKDOWN_PIPELINE.md) ·
> [`RELATIONSHIPS.md`](RELATIONSHIPS.md) · [`DATA_KERNEL.md`](DATA_KERNEL.md) ·
> [`DEPLOYMENT.md`](DEPLOYMENT.md) ·
> [`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md).

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
  records:     { …36 collections, in a fixed order… },
  limitations: [ { code, subject, detail } ]
}
```

The 36 collections, in serialisation order, are: `entities`, `workspaceTags`,
`entityTags`, `spineRecords`, `areaDetails`, `goalDetails`,
`goalMeasurements`, `goalMilestones`, `habitDetails`, `habitSchedules`,
`habitCompletions`, `projectDetails`, `taskDetails`, `taskRecurrenceRules`,
`taskChecklistItems`, `projectTemplateDetails`, `projectTemplateTasks`,
`projectTemplateChecklistItems`, `noteDetails`, `diaryEntryDetails`,
`personDetails`, `meetingDetails`, `meetingItems`, `meetingItemTasks`,
`assetDetails`, `assetEvents`, `assetObligations`, `reviewDetails`,
`reviewSections`, `reviewWorkflowState`, `reviewStepAcknowledgements`,
`reviewInsightSnapshots`, `entityLinks`, `activities`, `activitySubjects`,
`workspaceMembers`.

This list is generated from `SNAPSHOT_COLLECTION_ORDER` and was last reconciled
against it on 2026-08-29 (V2.6 FIND-02).

The order is meaningful: entities first, then spine membership, then per-module
detail rows, then module child records, then relationships, then history — so a
restore can insert parents before children without deriving a dependency graph.

**The Markdown vault reads the tag collections too.** Every tagged record type —
Note, Person, Asset and (since FIND-03) Task — emits its tags as `tags:`
frontmatter resolved through one map built from `workspaceTags` + `entityTags`,
with the per-record `tags` arrays as the fallback a pre-`0049` archive needs. A
Task has no `tags` column to read at all, which is how its tags came to be
missing from the vault while the structured snapshot could restore them
perfectly; caught in review on PR #238 and closed, because a readable copy that
is poorer than the machine copy is the one asymmetry this format cannot carry.

**The two tag collections (V2.6 FIND-02)** sit immediately after `entities` for
that same reason: `entityTags` references both an entity and a `workspaceTags`
row, so both parents must already exist. `workspaceTags` carries the vocabulary
(the ASCII case-folded `tag_key` and the owner's own spelling); `entityTags`
carries the attachments. **`meta.schemaVersion` did NOT move for them**, and that
is deliberate rather than an oversight: an archive written before the tag
migration is the backup an owner is required to hold *before* applying it, so it
must stay restorable. Restore prefers the two collections when they are present
and otherwise rebuilds both from the per-record `tags` arrays a pre-migration
archive still carries — People, then Assets, then Notes, which is the same order
the migration itself ranks spellings in, so the label a restored tag ends up with
is the one the migration would have chosen.

### Adding a collection without invalidating existing archives (REVIEW-02)

An archive is a file an owner already has. Adding a collection must not make
yesterday's export unreadable, so the contract is **write always, tolerate
absence on read**:

- every export DalyHub writes contains **every** collection;
- a collection listed in `SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS` may be
  **missing** from an archive written before it existed. Validation normalises it
  to `[]` in place and accepts the snapshot, so every consumer downstream can
  still assume the key exists;
- everything else stays **required** — a genuinely truncated or corrupt snapshot
  is still rejected, and a collection that is *present but malformed* is rejected
  whether or not it is on the list.

Add to that list in the same change that adds the collection, and never remove
from it: an entry is a permanent statement about files already on disk. This is
deliberately not a schema-version bump — the shape only ever grows, and the
`dalyhub.workspace/1` archives owners already hold keep validating.

`reviewWorkflowState` and `reviewStepAcknowledgements` were the first two entries.
They carry a guided weekly Review's **resume bookmark** and the owner's
**explicit "I have reviewed this step" decisions**. The acknowledgements are the
reason this matters rather than a nicety: they record intent that no calculation
can reproduce, and they gate whether the guided flow will complete a Review
([ADR-072](../decisions/ARCHITECTURE_DECISIONS.md#adr-072-the-guided-weekly-review--one-review-two-presentations-a-canonical-step-model-and-the-smallest-possible-persisted-workflow-state)).
Everything else the guided flow shows is derived and is deliberately **not**
exported, because it is recomputed from the records that are.

`reviewInsightSnapshots` is the third entry (REVIEW-03). It carries the derived
facts a **completed** Review captured — per-Project health state, per-Goal
contribution, the carrying-over commitment ids and the period's totals — as
`factsJson` verbatim under the row's own `version`, so an archive written under
an older shape round-trips unchanged. It is exported for the same reason the
acknowledgements are: it is the one insight artefact a restore **cannot rebuild**.
Everything else the Review evidence shows is either recomputed from the records
in the archive or derived from the exported Activity stream, and is deliberately
not stored here. Dropping this row would silently erase the owner's ability to
see what changed between Reviews, with nothing able to reconstruct it
([ADR-079](../decisions/ARCHITECTURE_DECISIONS.md#adr-079-review-insights--three-kinds-of-truth-one-persisted-snapshot-and-no-score)).

### What SET-02 added to the contract

Two additions, both made in the canonical contract rather than as restore-only
hidden fields, because the alternative is a format whose restore knows something
its export does not.

`workspaceMembers` (optional-on-read) carries the **subject, display names and
linked Person** of each workspace member. `activities[].actorId` was already
exported; the row that maps that subject to a NAME was not, so a restored
workspace held a history whose every actor resolved to `Unknown user` — a loss of
historical truth a restore is supposed to prevent. It deliberately excludes the
member's **email** (an authentication-adjacent identifier the request boundary
refreshes on every sign-in, so nothing durable is lost) and their `last_seen_at`
telemetry. Nothing here authenticates anybody: sign-in still goes through
Cloudflare Access and the `OWNER_EMAIL` gate, and a restored membership row
grants no access to anything.

`owner.preferences.appearance` carries the APPEARANCE-01 System/Light/Dark
choice. It is owner configuration of exactly the kind the snapshot already
carries (`timezone`, `dateFormat`, the landing destination), and a restore that
silently reset it would be an unfaithful reconstruction. Additive: an archive
written before it existed simply has no key, and a reader defaults it to
`"system"`.

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

This is the input contract SET-02 reads. **It is the backup format**: Settings →
Privacy & data → Restore takes this ZIP, verifies its checksums, checks its
snapshot version, previews it and restores it. See
[`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md).

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

## 8. Compatibility policy, and what reads it

- `meta.schemaVersion` changes **only** for a breaking change: a field removed, a
  field's meaning changed, or an ordering rule changed.
- Adding an optional field, a new collection, or a new `limitations` code is
  **backwards compatible** and does not bump it. A reader must ignore fields it
  does not recognise.
- A reader must check `meta.schema` and `meta.schemaVersion` first and **refuse**
  a major version it does not understand rather than guessing.
- The archive's own `formatVersion` (in `manifest.json`) versions the *file set*
  independently of the snapshot schema.

**The reader that enforces this is `readBackupCompatibility`** (SET-02,
`app/kernel/restore/backup-compatibility.ts`). It runs before anything else
interprets the file, and it refuses a newer version, an older version with no
reader, a malformed version, a missing version and another application's JSON.
There is deliberately no best-effort import: data recovery is the wrong place
for guesswork. `RESTORABLE_SNAPSHOT_SCHEMA_VERSIONS` is the list of versions this
build can actually read, and it is a list rather than a comparison because "can
restore" is a statement about code that exists.

---

## 9. Known limitations

These are real and recorded rather than hidden.

- **Restore exists (SET-02).** DalyHub reads this archive back in through
  Settings → Privacy & data → Restore, with validation, a preview, a typed
  confirmation and a verified pre-restore safety backup. See
  [`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md). The archive is both a
  readable copy AND a recovery point.
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
  presentation the export has no business inventing. The actor is the resolved
  display NAME (IDENT-01), never the stored actor id: that id is a Cloudflare
  Access subject and must not leave the server (AGENTS.md §17). An actor with no
  workspace-membership record exports as `Unknown user`. The structured
  `dalyhub-snapshot.json` still carries `actorType`/`actorId` verbatim — it is a
  faithful record of the database, and the owner's own copy of their own ids.
- **AI preferences are deliberately NOT exported** (DEBT-94), and every archive
  names the omission in the manifest's `excluded` list, beside notification
  settings and the subscribed calendars. Those rows hold a
  spending budget, feature switches and a privacy consent; a restore that
  quietly re-enabled all three would spend the owner's money and re-grant a
  consent they may have withdrawn. An archive that loses a setting is
  recoverable in a minute; one that silently restores a consent is not. Re-set
  them from Settings after a restore. Every other `owner` field — the app
  preferences and the saved Tasks views — is carried.
- **No attachments.** DalyHub stores none yet.
- **Task checklist items were exported and NOT restored, until 2026-08-19.**
  `task_checklist_items` had a snapshot collection and a restore destination but
  no `stageRows` branch, so every checklist item in an archive was written
  faithfully and silently dropped on the way back in. Found and fixed by
  PROJECT-02 while adding the three template collections beside it, with a
  regression assertion in the round-trip suite. An archive taken before that date
  still CONTAINS its checklist items — they were always exported — so restoring
  such an archive with the current build recovers them.

### PROJECT-02 — the three template collections (2026-08-19)

`projectTemplateDetails`, `projectTemplateTasks` and
`projectTemplateChecklistItems`, ordered after `taskChecklistItems` and before
`noteDetails`: the detail slice first (it references the `project_template`
entity), then the tasks (which reference that entity), then the steps (which
reference a task). A restore inserts in that order and deletes in its exact
reverse, which satisfies every `ON DELETE RESTRICT` key without deferring
constraint checks.

All three are in `SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS`, so an archive written
before PROJECT-02 still validates and still restores.

`defaultParentId` is exported **verbatim**, never resolved: it is a stored hint
rather than a foreign key, and one that no longer names a live Area or Goal is a
legitimate state a restore must reproduce rather than repair. Validation checks
only that it is present together with its `defaultParentKind`, or that both are
null.

The round trip is proved twice: the shared workspace fixture now holds a real
template with ordered tasks and a step, so snapshot equality covers it; and a
dedicated test restores an archive and then INSTANTIATES the restored template,
proving it is still usable rather than merely present.

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


## AI data and the export contract (AI-01, 2026-08-05)

**A deliberate decision, recorded rather than assumed:** the X-04 workspace
snapshot is **unchanged** by the AI platform. Neither `workspace_ai_preferences`
nor `ai_usage_requests` is exported.

The two exclusions have different standing, and it is worth being exact about
which is a principle and which is a judgement call.

- **The usage ledger is excluded on principle.** `ai_usage_requests` is
  operational metadata: tokens, cost estimates, model ids, durations and failure
  categories. It describes how the *system* was operated, not anything the owner
  authored. Exporting it would put the system's own logs in the owner's data
  archive without adding anything they could use elsewhere. This matches how the
  snapshot already treats Activity infrastructure.
- **The preferences exclusion is a judgement call, and it diverges.** The
  snapshot **does** carry `owner_app_preferences` and the TASKS-03 saved views
  under `owner`, so "configuration is not exported" is *not* the existing rule.
  `workspace_ai_preferences` is owner configuration of exactly that kind, and it
  is left out anyway, for one reason worth stating plainly: budgets and consent
  are spending and privacy decisions, and silently re-enabling them by restoring
  an archive into a different environment is a worse failure than making the
  owner set them again. That is a defensible answer, not an obvious one — it is
  recorded as
  [DEBT-94](../product/PRODUCT_DEBT.md#-debt-94--ai-preferences-are-the-one-kind-of-owner-configuration-the-export-snapshot-omits--p3--resolved-2026-08-25)
  so SET-02 confronts it rather than inheriting it.
- **The security consequence is unaffected either way:** no AI table is in the
  snapshot, so no export can carry a provider credential — and there is no
  credential in D1 to carry in the first place.
- **Restore (SET-02) therefore has nothing AI-shaped to restore.** A restored
  workspace starts with AI off and the conservative default budgets. When SET-02
  lands it should state this explicitly rather than let it pass unremarked.

Accepted proposals are ordinary records — Tasks and EntityLinks — and export
exactly as they always have. Nothing marks them as AI-originated, because after
the owner has reviewed and accepted them they are simply the owner's records.


## Notifications and calendars (HARDEN-06E, 2026-08-20)

**Also a deliberate decision, and until HARDEN-06E an undocumented one.** Three
more groups of tables are absent from the snapshot, and NONE of them was named
in `EXPORT_EXCLUSIONS`. A restored workspace therefore came back with
notifications off, the digest time and its zone gone, the per-source toggles
gone and every subscribed calendar gone — while this document's own contract
promises that either is *"reported in `limitations` and in the manifest, never
silently"*. That was the defect (whole-application audit, F-10): not the
omission, the silence.

| Table | In the snapshot? | Named in `EXPORT_EXCLUSIONS`? |
| --- | --- | --- |
| `notification_settings` | no | **yes, since HARDEN-06E** |
| `notifications`, `notification_deliveries` | no | **yes, since HARDEN-06E** |
| `calendar_sources`, `external_calendar_events`, `external_calendar_meeting_links` | no | **yes, since HARDEN-06E** |

Why each one is out, stated separately because the reasons differ:

- **`notification_settings` holds a credential.** `pushover_user_key` and
  `pushover_app_token` are in the same row as the digest time and the per-source
  toggles, so the row is omitted whole rather than partially — the same rule
  "Credentials of any kind" already states. A restored workspace starts with
  notifications off and the defaults.
- **The notification ledger is excluded on principle.** `notifications` and
  `notification_deliveries` record what the system SENT and whether it arrived.
  That is operational metadata about how the system was run, not anything the
  owner authored — exactly the standing `ai_usage_requests` has above.
- **A calendar source holds a sealed feed URL,** which is a credential in
  everything but name: anyone holding it can read the calendar. The events
  themselves belong to the calendar that publishes them and are re-read on the
  next sync, so exporting a copy would be exporting someone else's data with a
  staleness date attached.

**What is still open.** The NON-SECRET half of two of those tables — the digest
time and its zone, the per-source toggles, a calendar's display name — is
ordinary owner configuration of exactly the kind `owner_app_preferences` and the
saved views are already exported as. Exporting it by COLUMN rather than omitting
it by TABLE is the better answer and is a snapshot-schema change; it is recorded
as **DEBT-176** rather than decided here, and it is the same shape as DEBT-94's
AI-preferences judgement above.
