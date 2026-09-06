# ROADMAP_V2_11.md — DalyHub V2.11, EVIDENCE

> **Read [`AGENTS.md`](../../AGENTS.md) first.** It is the constitution.
>
> [`ROADMAP_V2.md`](ROADMAP_V2.md) is the closed record of V2;
> [`ROADMAP_V2_1.md`](ROADMAP_V2_1.md) … [`ROADMAP_V2_8.md`](ROADMAP_V2_8.md)
> hold V2.1 … V2.8; [`ROADMAP_V2_9.md`](ROADMAP_V2_9.md) holds V2.9 INSIGHT
> **and the remaining V2 sequence, V2.12 … V2.16**, which this file does not
> restate and does not replace; [`ROADMAP_V2_10.md`](ROADMAP_V2_10.md) holds
> V2.10 LIFE ADMIN (**complete 2026-09-05**).
>
> **This file is V2.11, and it is where new work goes.** It was defined on
> 2026-09-06 against `main` at `80003cc` (V2.10 LIFE-03, PR #264) by a pass that
> re-measured the storage, export, restore, backup and security code rather than
> inheriting the PLANNED sketch in
> [`ROADMAP_V2_9.md`](ROADMAP_V2_9.md#v211--evidence-planned). Where that sketch
> and this file disagree, **this file wins**, and every disagreement is stated
> with the measurement that produced it. The durable decisions this pass made
> are [ADR-119](../decisions/ARCHITECTURE_DECISIONS.md#adr-119-evidence--an-attachment-is-a-child-record-with-one-required-owner-bytes-in-a-private-bucket-the-application-worker-owns-a-compensated-write-and-an-archive-that-carries-the-bytes).
>
> The rules are unchanged: [`AGENTS.md`](../../AGENTS.md) tells you *how* to
> build; this tells you *what*. Status is updated in the PR that changes it. No
> time estimates, no dates on unstarted work.

**Status key.** ☐ not started · ◐ partly delivered · ☑ delivered

**Programme status: V2.11 EVIDENCE — COMPLETE 2026-09-06.** All four items,
FILE-00 … FILE-03, delivered in one branch and one pull request, as the owner
asked. Defined 2026-09-06 with four items, FILE-00 … FILE-03.

**Successor: V2.12 FINANCE CORE — PLANNED, definition pass next** — see
[`ROADMAP_V2_9.md`](ROADMAP_V2_9.md#v212--finance-core-planned--gated-on-debt-198).
It is still gated on [DEBT-198](../product/PRODUCT_DEBT.md#-debt-198--the-off-cloudflare-encrypted-backup-has-never-been-produced-because-the-github-production-environment-holds-no-secrets--p2),
which V2.11 did not move. A Finance transaction attaches a receipt by inserting
one `attachments` row whose `owner_entity_id` is the transaction — no new file
mechanism, no second architecture, and no change to this release's table.

---

## The theme: EVIDENCE — the paper lives with the thing

**DalyHub can describe a registration renewal, an insurance policy, a school fee
and a service invoice. It cannot hold one.** V2.10 gave every recurring
obligation a record; the record still has nowhere to put the PDF that proves it.
V2.11 adds exactly one attachment primitive and gives it to the records that
most want it.

The product theme is one sentence: **the paper lives with the thing.** Not a
drive, not a document manager, not a second Notes system. A record has files;
they are private; they survive backup and restore; every module uses the same
mechanism.

### What was measured on `80003cc`

1. **The application Worker has no object store at all, by written policy.**
   [`wrangler.jsonc`](../../wrangler.jsonc) declares one D1 binding and, in
   production only, a service binding to `dalyhub-v2-backup`. Its comment says
   the application Worker "deliberately has NO R2 binding and NO D1-export
   token" — a statement about the **backups** bucket and the export token that
   protects it, not a prohibition on the application owning a store of its own.
   V2.11 amends the comment rather than contradicting it, and the two buckets
   stay separate for exactly the reason the comment gives.
2. **The export says, in code, that there is nothing to store.**
   [`manifest.ts:118`](../../app/platform/export/manifest.ts) lists `"File
   attachments: DalyHub stores none."` among the standing exclusions and
   [`build-vault.ts:1498`](../../app/platform/export/vault/build-vault.ts) says
   `"- File attachments: DalyHub does not store any yet."` Both are retired by
   this release, in code, and replaced with a statement of what an archive now
   carries.
3. **The archive format already carries bytes; only the readers are narrow.**
   `ZipEntry.data` is a `Uint8Array` and
   [`zip.ts`](../../app/platform/export/zip.ts) DEFLATEs anything, so the writer
   needs no format change. The **reader** does:
   [`zip-reader.ts`](../../app/platform/restore/zip-reader.ts) caps an archive
   at `MAX_ENTRIES = 32`, and
   [`read-backup-archive.ts`](../../app/platform/restore/read-backup-archive.ts)
   enforces an exact five-file allow-list. An attachment archive has one entry
   per file, so both bounds move — deliberately, with the new bound stated.
4. **Restore is already staged and compensated for D1.**
   [`restore-workspace.ts`](../../app/platform/restore/restore-workspace.ts)
   validates, previews, stages inert rows, takes a safety backup, **verifies
   that backup by reading it back through the restore reader**, cuts over in one
   transaction and verifies the result. V2.11 adds a second physical store to a
   sequence that was designed for one; the ordering question is where the bytes
   go relative to the cutover, and it is answered in FILE-02 rather than assumed.
5. **The CSP already decides the download question.**
   [`content-security-policy.ts`](../../app/platform/request/content-security-policy.ts)
   sets `object-src 'none'`, `frame-src 'none'`, `media-src 'none'` and
   `img-src 'self' data: https:`. A PDF therefore **cannot** be embedded inside
   DalyHub at any price, and a raster image can. Every authenticated response
   already leaves the boundary with `X-Content-Type-Options: nosniff` and
   `Cache-Control: private, no-store`
   ([`security-headers.ts`](../../app/platform/request/security-headers.ts)), so
   an attachment route inherits the private-cache and sniffing rules rather than
   inventing them.
6. **There is a precedent for a required owner, and it is not EntityLink.**
   `task_checklist_items`
   ([`0045`](../../migrations/0045_create_task_checklist_items.sql)) is a child
   row with a composite foreign key into `entities (workspace_id, id, type)` and
   `ON DELETE RESTRICT`, whose own comment says the restrict "exists so that if a
   permanent purge is ever built for Tasks it is FORCED to clear the checklist
   first, rather than being allowed to leave orphan rows behind". That is the
   attachment requirement stated for a different child. `entities` carries
   `UNIQUE (workspace_id, id)`
   ([`0003`](../../migrations/0003_create_entity_links.sql)) and
   `UNIQUE (workspace_id, id, type)`
   ([`0005`](../../migrations/0005_create_spine_hierarchy.sql)), so a child may
   reference an owner **of any type** with one composite key.
7. **The Workers-pool test harness already runs real R2.**
   [`vitest.workers.config.ts`](../../vitest.workers.config.ts) declares
   `r2Buckets: ["BACKUPS"]` with the comment that a hand-written stub "would
   happily agree with whatever the code did". The same argument applies to
   attachments, so the attachment suite runs against a real local bucket and not
   only against a fake.
8. **The AI boundary is a closed vocabulary, not a filter.**
   `EVIDENCE_KINDS` in [`ai-evidence.ts`](../../app/kernel/ai/ai-evidence.ts) is
   an `as const` tuple and every evidence item is assembled by
   [`evidence-retrieval.ts`](../../app/platform/ai/evidence-retrieval.ts) from
   named repositories. Keeping attachments out of AI is therefore *not adding
   them*, and it is asserted as such rather than described.

### Where this file disagrees with the PLANNED sketch

The V2.9 sketch predicted four items and one model. Three of the four items
survive re-measurement with different names; **the model does not**, and the
change is the release's first recorded decision.

| Sketch (2026-09-04) | This file (2026-09-06) | The measurement that changed it |
| --- | --- | --- |
| "`attachment` entity + `attachment_details` … linked by EntityLink" | **A child record with one REQUIRED owner and no entity row** | The sketch's own acceptance criterion is "an attachment should require at least one owner". An EntityLink cannot express that: links are created, unlinked and restored freely, and no constraint anywhere requires one to exist. An `entity` row also buys a title, an identity colour, Search exposure, a record route and Activity subjecthood — five things an attachment must not have. See [ADR-119 decision 1](../decisions/ARCHITECTURE_DECISIONS.md#adr-119-evidence--an-attachment-is-a-child-record-with-one-required-owner-bytes-in-a-private-bucket-the-application-worker-owns-a-compensated-write-and-an-archive-that-carries-the-bytes). |
| "soft-delete with a lifecycle purge" | **Hard delete, with a purge ledger for the bytes** | A soft-deleted attachment whose bytes remain is the one failure this release must not have: the owner is told the file is gone and it is not. Deletion removes the row and the object; the ledger exists for the case where the object delete fails, and is swept. |
| FILE-00 "the second store is recoverable first … before any upload route exists" | **FILE-00 builds the authority; FILE-02 proves recovery — and no owner file can be accepted before FILE-02 lands, because the whole programme merges as one PR** | The sketch's ordering is right about the *gate* and wrong about the *sequence*: a restore rehearsal needs something to restore. The gate is preserved exactly — the release does not complete until a real byte-for-byte rehearsal passes — while the items run in dependency order. |
| "per-workspace budgets stated in Settings" | **A per-file bound enforced before the body is read; no workspace quota surface** | Deferred with a reason rather than built: see [§ Limits](#limits). |
| "`share_target` for files **only if** the picker measures as friction" | **Refused for V2.11** | The measurement was never taken and cannot be taken from a repository. Refusing is the honest outcome; it is recorded as a non-goal, not as a maybe. |

---

## The model

### One attachment primitive

```
attachments                        one row per file
  id                               application-generated, stable, never reused
  workspace_id                     the isolation boundary
  owner_entity_id                  REQUIRED. composite FK -> entities (workspace_id, id)
  filename                         the owner's own name, stored verbatim (bounded)
  media_type                       from the validated allow-list, never the client's word alone
  byte_size                        what was actually stored
  checksum_sha256                  lowercase hex, verified by R2 on write
  storage_key                      derived, stored, never rendered
  upload_operation_id              the client's idempotency key. UNIQUE per workspace
  uploaded_by                      the actor subject, or null
  created_at

attachment_object_purges           the compensation ledger: bytes with no metadata
  workspace_id, storage_key        PRIMARY KEY
  reason, queued_at, attempts, last_attempt_at, last_error
```

Bytes live in ONE private R2 bucket bound to the application Worker as
`ATTACHMENTS`. There is no public object URL, no signed URL and no
unauthenticated path of any kind: every byte leaves through an authenticated
DalyHub route.

### The object key

```
workspaces/<workspace-id>/attachments/<attachment-id>
```

The owner's filename is never part of it, the record's title is never part of it,
and neither is any owner-supplied string. Traversal is therefore impossible by
construction rather than by sanitisation: the key is built from two
application-generated identifiers, both of which are validated before use. The
workspace prefix is what makes a workspace-scoped purge and a workspace-scoped
listing one `list({ prefix })` rather than a scan.

### One owner, and multi-linking is refused

An attachment belongs to **exactly one** record. The same PDF attached to an
Obligation and to the Asset it is about is two attachments, two objects and two
rows — and that is the right answer, not a limitation to apologise for:

- it is what makes "delete the record, delete its evidence" decidable at all;
- it is what makes the byte count in the manifest a count of bytes rather than a
  count of references;
- and the alternative — a reference count, a link table, an orphan sweep for
  attachments whose last link went away — is a second lifecycle system bought
  for a case nobody has asked for.

**The checksum is evidence, not identity.** Two records may deliberately carry
the same file, and V2.11 does not deduplicate. Dedupe would make one owner's
delete silently a no-op for another owner's file, which is the failure mode this
release is least willing to have.

### Why not EntityLink

EntityLinks stay what they are: the relationship graph between records. An
attachment is not a record and has no page, so there is nothing for a link to
point at from the other end. More decisively, the product rule is *an attachment
requires an owner*, and a link cannot enforce a requirement — it can be unlinked.
A `NOT NULL` composite foreign key can, and the same key gives `ON DELETE
RESTRICT`, which forces any future permanent purge to deal with the evidence
before it deletes the record. The full argument, and the four alternatives
rejected, are in
[ADR-119](../decisions/ARCHITECTURE_DECISIONS.md#adr-119-evidence--an-attachment-is-a-child-record-with-one-required-owner-bytes-in-a-private-bucket-the-application-worker-owns-a-compensated-write-and-an-archive-that-carries-the-bytes).

**Finance is compatible with this and needs nothing new.** V2.12's transaction is
already specified as a light *entity* precisely so it can carry a receipt; an
entity is exactly what this owner key references. `FIN-00` attaches a receipt by
inserting an `attachments` row whose `owner_entity_id` is the transaction. No new
file mechanism, no second architecture, no change to this table.

---

## Limits

Every bound below is stated, enforced server-side before the body is read where
that is possible, and tested.

| Bound | Value | Why this value |
| --- | --- | --- |
| Maximum file size | **10 MiB** | A scanned multi-page PDF, a phone photo and a bank statement all fit comfortably; a video does not, and V2.11 is not a media library. It is also far enough below the Worker request-body ceiling that the isolate is never the thing that fails. The exact bound is applied to `File.size` before `arrayBuffer()` is called; `Content-Length` is checked against that plus a 16 KiB multipart envelope, because the header measures the whole request body and comparing it with the file bound refused a file AT the advertised maximum. |
| Maximum filename length | **200 characters** | Long enough for any real document name; short enough that the vault's own `MAX_STEM_BYTES = 160` truncation is the only place a name is shortened. |
| Attachments per record | **50** | A bound, not a budget. It exists so one record cannot turn its own loader into an unbounded read. Checked before the file is read, for the sentence that names the limit — and again **inside the INSERT**, so two uploads from two tabs cannot both pass a count-then-write and leave a 51st row the record's own read can never show. |
| Archive attachment count | **500 per export** | The restore reader's entry cap moves from 32 to this plus the five document files. Above it the export **fails and says so**; it does not silently truncate. |
| Total archive bytes | unchanged: `ZIP_MAX_TOTAL_BYTES = 64 MiB` writing, `RESTORE_MAX_ARCHIVE_BYTES = 32 MiB` reading | Unchanged deliberately. An export that exceeds it already raises `ZipTooLargeError` and the route already answers 507 with "this workspace is too large to export in a single archive. Please report this — the export needs to be split." That sentence becomes reachable for the first time, which is a truth improvement, not a regression. Splitting the archive is out of scope. The two ceilings also DISAGREE — the writer's 64 MiB is twice the reader's 32 MiB — so DalyHub can produce an archive it will refuse to read, which four 10 MiB files reach. That was unreachable while an archive held only text; files make it reachable, so it is raised as [DEBT-247](../product/PRODUCT_DEBT.md#-debt-247--dalyhub-can-write-an-export-archive-it-will-refuse-to-read-back--p2) rather than left implied. |

**No workspace storage quota is built.** DalyHub is one owner on one Cloudflare
account, R2 bills per byte with no hard wall to be surprised by, and a quota
surface that no one can exceed is a settings page pretending to be a control.
The per-file bound and the per-record bound are the two that prevent an accident.
This is a stated deferral, recorded HERE rather than as a numbered debt entry —
debt is raised from measured deficiencies, and "a control nobody can reach" is a
decision, not a defect.

### Accepted media classes

Opaque bytes in, opaque bytes out. DalyHub never parses, renders, executes or
interprets an attachment's contents.

| Class | Types | Served |
| --- | --- | --- |
| Documents | `application/pdf` | download only |
| Images | `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/heic`, `image/heif` | download; `png`/`jpeg`/`webp`/`gif` may additionally be shown inline in an `<img>` |
| Text | `text/plain`, `text/csv`, `text/markdown` | download only |
| Office | `.docx`, `.xlsx`, `.pptx` and their legacy `.doc`/`.xls`/`.ppt` types | download only |

**`text/html` and `image/svg+xml` are refused outright**, not merely forced to
download. Both are active content in a browser, both would sit on DalyHub's own
origin, and the value of accepting them is zero — nobody attaches a policy as
HTML. Refusing is smaller than defending.

### What type validation actually guarantees

Stated precisely, because the honest claim is narrower than "we check the file":

- the **declared** media type must be on the allow-list;
- the **filename extension** must be one the declared type is known by;
- for the types with a short, unambiguous leading signature — PDF, PNG, JPEG,
  GIF, WEBP — the first bytes must match it.

That is all. It is enough to stop a `.pdf` that is really an HTML page from being
accepted and later served as `application/pdf`, and it is not antivirus, not
content inspection and not a guarantee that a file is well-formed. DalyHub does
not need to understand these files; it needs to be unable to be tricked into
executing one. **Store and download is not parse and render.**

---

## Cost: statements, memory, and where the bytes flow

Measured rather than estimated. Each figure below is asserted by a test over
real D1 and a real R2 bucket, so a change that made one of them worse would be
a red run rather than a discovery in production.

### Statements

| Read | Statements | Flat with respect to |
| --- | --- | --- |
| One record's evidence | **1** | how many files the record holds |
| N records' evidence | **1** | how many records, and how many files each holds |
| A record page loader | **+1** against V2.10 | — |
| The workspace snapshot | **40**, up from 39 | how many files exist, and how large they are |

The snapshot number is worth stating precisely: it grows by one because there is
one more collection to read, and by nothing at all per file, because the snapshot
reads METADATA. The bytes are fetched by the archive builder afterwards, one
object at a time, and never enter a query plan.

### Memory, and why two paths differ

DalyHub does not invent streaming infrastructure. It uses the platform's stream
where the platform's stream answers the question being asked, and buffers where
it does not — with a stated bound in every case.

| Path | Holds | Bound | Why |
| --- | --- | --- | --- |
| **Download / preview** | nothing | — | `R2ObjectBody.body` is a `ReadableStream` and R2 returns the digest it was given on the write, so the check is 64 characters against the row and the bytes go bucket → socket. A 10 MiB download allocates what a 10 KiB one does. |
| **Upload** | one file | 10 MiB | The SHA-256 must be known before the `put`, because R2 verifying it is what makes the write trustworthy. Computing it requires the bytes. The limit is checked twice before they are read — against `Content-Length`, then against the parsed `File.size`. |
| **Export** | the archive | 64 MiB (`ZIP_MAX_TOTAL_BYTES`) | An archive that carries a file must hash it for `CHECKSUMS.txt`. Over the bound the export FAILS with the sentence the route already carries; it never truncates. |
| **Restore** | the archive | 32 MiB (`RESTORE_MAX_ARCHIVE_BYTES`) | An archive being read must hash what came out to prove it survived the trip. |

Both runtime facts the download path depends on — the stream and the returned
digest — were checked against the pinned types (`worker-configuration.d.ts`,
generated from workerd@1.20260714.1) rather than assumed from documentation.

The archive ceilings did **not** move for V2.11. Files make them reachable for
the first time, which is a truth improvement: an export that would not fit now
says so instead of quietly being small.

---

## Security

Every attachment operation authorises through DalyHub, server-side, on every
request. There is no cheaper path and no cached decision.

For upload, download, list and delete, all five hold:

1. an authenticated session (the Worker boundary has already validated the
   Access JWT and the owner email);
2. the workspace resolved from trusted server configuration, never from a
   request value;
3. the attachment row read with the workspace as a predicate — a foreign id is
   **not found**, indistinguishable from one that never existed;
4. the owner record read through the same workspace-scoped repository, so an
   attachment whose owner is in another workspace cannot be created;
5. the object key derived from the row that was just read in this workspace,
   never from anything the client sent.

`GET /attachments/<uuid>` for another workspace's file returns 404. So does a
`POST` naming another workspace's owner record. Both are asserted by
hostile-workspace tests that seed two workspaces in one database and then try.

---

## Work breakdown

```
FILE-00 ──► FILE-01 ──► FILE-02 ──► FILE-03
```

All four ship in ONE branch and ONE pull request, in staged commits. The gate
that the V2.9 sketch placed on FILE-00 — *no owner file is accepted before the
system can recover it* — is preserved by that shape: nothing in this programme
reaches an owner's workspace until the whole of it, including the rehearsal, has
merged.

### ☑ FILE-00 — The attachment authority — **delivered 2026-09-06**

One store, one contract, one set of routes.

- The migration: `attachments` and `attachment_object_purges`, with the required
  owner key, the workspace key, the bounded CHECKs the house style puts at the
  storage boundary, and the indexes the two real access paths need (by owner, and
  by workspace for purge/export).
- The kernel domain, storage-independent: the attachment record shape, the
  serialised shape a surface receives, filename and media-type validation, the
  limits above, the key derivation, and the typed errors.
- An **object store port** — `put`, `get`, `delete`, `list` — with the Cloudflare
  R2 adapter behind it and a deterministic in-memory fake for unit tests. The
  port exists so the domain never imports a Cloudflare type and so the fake and
  the real bucket are exercised against the same contract test.
- The D1 repository: create (with its Activity event in the same batch), read,
  list by owner, delete (with its purge row in the same batch), and the
  workspace-scoped purge listing the export and the sweep both use.
- The routes: `POST /attachments` (upload), `GET /attachments/:id` (download),
  `GET /attachments/:id/preview` (inline, raster images only), `POST
  /attachments/:id/delete`.
- The binding, in `wrangler.jsonc` local config and in the named production
  environment, with the policy comment amended and the owner's provisioning
  action recorded.

**Acceptance.** A file uploads, downloads byte-for-byte identical, and deletes.
A second workspace cannot read, delete or become the owner of any of it. The
upload bound is enforced before the body is read. A repeated submit with the same
operation id yields one attachment, not two. A refused type is refused. An
`image/svg+xml` and a `text/html` are refused. Every response carries
`nosniff` and the private cache policy.

### ☑ FILE-01 — Evidence on records — **delivered 2026-09-06**

One shared surface, consumed by records; no module builds its own.

- `app/shared/attachments`: `AttachmentsSection`, `AttachmentList`,
  `AttachmentRow`, `AttachmentPicker`, the client action hook, and the serialised
  view model. One implementation.
- Consumers: **Obligation**, **Asset**, **Meeting**, **Note**, plus the record
  types where the marginal cost is one line and the product answer is obviously
  yes — Project, Task, Goal, Person. Every one of them renders the same
  component with the same anatomy; a consumer configures *whether* it has
  evidence, never *what evidence looks like*.
- The phone path: a standards-based `<input type="file">` with `accept` and, on
  a second control, `capture="environment"` so the camera is one tap. No native
  dependency, no library.
- Honest states: selected → uploading → uploaded → failed, where **uploaded is
  only said once both the object and the row exist**. Retry reuses the same
  operation id, so a retry can never create a second attachment.
- Accessibility: the picker is a real labelled input, every row action carries
  the filename in its accessible name (`Download <filename>`), and upload
  progress announces once per transition rather than on every render.
- A **registry contract test** that fails if a module ships its own attachment
  row, list or picker.

**Acceptance.** The four named records can attach, open and remove a file. The
surface holds at 320, 375/393 and 768 with a 90-character filename and ten
attachments, in both appearances, with no horizontal overflow. axe is clean.
No second attachment component exists anywhere in `app/modules`.

### ☑ FILE-02 — Attachment recovery is real — **delivered 2026-09-06**

The release's gate, and the reason it is an item rather than a paragraph.

- The `attachments` collection in the workspace snapshot, in the collection
  order, optional-on-read so every archive an owner already has still restores.
- The structured archive gains an `attachments/<attachment-id>` entry per file
  plus a manifest section naming, for each: id, filename, media type, byte count,
  SHA-256 and archive path. **No R2 key appears in an archive** — a restore into
  a different environment must not need one.
- **An export that cannot read a byte fails.** It does not omit the file, and it
  does not claim completeness. The manifest's `contents` gains an explicit
  `includesAttachmentFiles` claim and the exclusions list stops saying DalyHub
  stores none.
- Restore ordering, decided rather than assumed: **bytes to their final keys
  first, then the D1 cutover, and the previous workspace's objects enqueued for
  purge in the same transaction as the cutover.** Every restored object is
  verified against the manifest checksum *before* it is written, and the write
  passes the same digest to R2 so R2 verifies it again on arrival. A byte that
  does not match rejects the whole restore before anything is written.
- The compensation sweep: the purge ledger drains on the Worker's existing cron,
  bounded, with attempts recorded.
- **The rehearsal.** A real fixture — a real small PDF, a real PNG, a real text
  file — uploaded, exported, the workspace and its objects destroyed, restored,
  and then read back and compared byte for byte, checksum, filename, media type
  and owner relationship. Not a mocked string pretending to be a file.

**Acceptance.** The rehearsal passes on real bytes. Corrupting one byte of one
archived file rejects the restore. Editing one checksum in the manifest rejects
the restore. An archive written before V2.11 still restores. An archive whose
metadata names a file the archive does not carry is refused, and so is the
reverse.

### ☑ FILE-03 — Export the evidence — **delivered 2026-09-06**

- The Obsidian vault writes each attachment beside its record, under the vault's
  own collision-safe filename rules, linked from the record's Markdown by a
  **relative** path. The vault stays readable with no DalyHub involved and
  carries no R2 key.
- The two in-code claims that DalyHub stores no files are retired, in the correct
  compatibility-aware way: the *exclusion* is replaced by a positive statement,
  and old archives that still carry the old sentence are unaffected because the
  sentence was never read by anything.
- Backup: what the nightly backup Worker does and does not cover for the new
  store, stated truthfully, with the residual correlated-failure risk named
  rather than papered over.
- Documentation and reconciliation: the module doc, the architecture overview,
  the backup/restore doc, the export doc, the design system's shared-anatomy
  entry, the changelog, the deployment doc, `PRODUCT_DEBT.md`, and this file's
  statuses.

**Acceptance.** A vault opens in Obsidian with the files present and the links
working. `docs:links:check` is green. No document claims a recovery property the
code does not have.

---

## Non-goals

Refused for V2.11, each because it is a different product:

OCR · text extraction of any kind · PDF indexing · embeddings · search over file
contents · AI reading documents · summarising a document · any virus-scanning
claim · file versions · folders · sharing links · collaborative editing · WebDAV
· Drive/Dropbox sync · a file manager · image recognition · EXIF intelligence · a
media gallery · `share_target` for files · a workspace storage-quota surface ·
attachment rename · attachment reordering · thumbnails generated by DalyHub.

Two deserve their reason stated rather than only their name:

- **Search over filenames.** Refused. Search's explicit-query boundary
  (ADR-114 d2) and its unbidden-palette path share one provider set, and a
  filename is exactly the kind of string — `Divorce settlement.pdf`,
  `MRI results.pdf` — that must never appear in an empty-query recency list. The
  record is the search destination; its evidence is on it when you get there.
- **AI access of any kind.** Not a filter to be configured — attachments are
  simply not an evidence kind, and a test asserts that `EVIDENCE_KINDS` names
  none and that no AI retrieval path reads the attachments table or the bucket.
  V3 may add a sanitising extraction layer; V2.11 does not send a byte.

---

## Activity, and what an event may say

Two events: `attachment.added` and `attachment.removed`, both subject to the
owner record so they appear on its timeline.

**Neither event's payload carries the filename**, and neither carries the storage
key, the checksum or any byte. The feed reads *"Added a file"* and *"Removed a
file"*. This follows the rule the Assets and Obligations providers already hold —
an amount is never printed in a result list because a list is the surface most
likely to be read over someone's shoulder — and a filename on a Person or a Diary
entry is at least as sensitive as a price. The filename is on the record, where
the owner went looking for it.

Nothing else is an event. Opening or downloading a file is not activity; it is
reading, and DalyHub does not log the owner reading their own records.

---

## Ordering, and why

FILE-00 first because everything else consumes the authority, and because the
security properties are cheapest to establish before there are four surfaces
calling them. FILE-01 second because a store nothing can reach is not a feature,
and because the phone path is where the design decisions bite. FILE-02 third
rather than first: the sketch's instinct — recovery before the first owner file —
is preserved by the single-PR shape, and a rehearsal needs something real to
rehearse with. FILE-03 last because a vault export and a documentation
reconciliation are both about work that has already happened.

---

## Debt

| Entry | Disposition |
| --- | --- |
| [DEBT-35](../product/PRODUCT_DEBT.md#-debt-35--assets-deferred-capabilities-attachments-reminders-logbooks-ingestion-ai--p3) — Assets: deferred capabilities | **The attachments half is TAKEN by V2.11.** Real object storage, the record surface, export, backup and restore, and the phone picker and camera. OCR, barcode scanning, receipt/email ingestion, depreciation and subscription sync stay in the entry and stay refused for V2. The entry still closes empty. |
| [DEBT-198](../product/PRODUCT_DEBT.md#-debt-198--the-off-cloudflare-encrypted-backup-has-never-been-produced-because-the-github-production-environment-holds-no-secrets--p2) — no off-Cloudflare copy | **Not a V2.11 gate, and not moved.** It is V2.12 Finance's hard gate and it stays there. What V2.11 owes it is the truth: live attachment bytes and every copy of them are inside Cloudflare, so a provider-level loss is a correlated loss, and no document in this repository may claim otherwise. FILE-03 writes that sentence into the backup documentation. |
| [DEBT-246](../product/PRODUCT_DEBT.md#-debt-246--the-notification-run-reads-one-bounded-page-so-a-crowded-workspace-can-starve-later-obligations--p3) — bounded attention read | **Not taken.** V2.11 does not touch the notification query path, and absorbing an unrelated defect because the PR is large is how a large PR becomes an unreviewable one. |
| [DEBT-247](../product/PRODUCT_DEBT.md#-debt-247--dalyhub-can-write-an-export-archive-it-will-refuse-to-read-back--p2) — an archive DalyHub writes and refuses to read | **RAISED by this release, and not fixed here.** The writer's ceiling is 64 MiB and the reader's is 32 MiB; that asymmetry predates V2.11 and was unreachable while an archive held only text. Four 9 MiB files reach it. Closing it is a change to the restore reader's memory budget with its own measurement, and absorbing it because this release made it visible is how a large PR becomes an unreviewable one. |
| Other DEBT raised by this release | **None.** The falsification pass found four measured deficiencies — no same-name collision test, `CHECKSUMS.txt` enforced by nothing, a registry a plural noun walked past, and an `ON DELETE RESTRICT` assertion passing for the wrong reason — and all four were fixed in the release rather than recorded. No wishlist. |

---

## Completion criteria

V2.11 is COMPLETE when every one of these is true, and not before:

- one attachment authority exists, and no module has a second one;
- bytes live in a private bucket with no public or unauthenticated path;
- metadata has one canonical store and one required owner;
- a hostile workspace cannot read, delete, own or guess its way to a file;
- upload, download and delete work, and a retry cannot duplicate;
- the file-size, filename, per-record and archive bounds are explicit and
  enforced;
- HTML and SVG are refused, and nothing user-supplied is ever served as active
  content on DalyHub's origin;
- the shared attachment UI is used by every consumer, including on a phone;
- files are in the canonical export, and an export that lacks a byte fails;
- restore restores real bytes, verifies checksums, and rejects corruption;
- a real disposable restore rehearsal passes on real fixture bytes;
- the vault carries files beside their records;
- archives written before V2.11 still restore;
- the backup documentation is truthful about what is and is not recoverable;
- AI cannot reach an attachment's bytes, and a test says so;
- the whole gate is green with no unexplained failure.
