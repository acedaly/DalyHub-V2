# ATTACHMENTS.md — evidence on records

> **V2.11 EVIDENCE.** The theme is one sentence: **the paper lives with the
> thing.** A record has files; they are private; they survive backup and
> restore; every module uses the same mechanism.
>
> The *what* is [`ROADMAP_V2_11.md`](../roadmap/ROADMAP_V2_11.md). The durable
> decisions and the alternatives they beat are
> [ADR-119](../decisions/ARCHITECTURE_DECISIONS.md#adr-119-evidence--an-attachment-is-a-child-record-with-one-required-owner-bytes-in-a-private-bucket-the-application-worker-owns-a-compensated-write-and-an-archive-that-carries-the-bytes).
> This file is the *how*, and the one thing the owner has to do by hand.

---

## 1. What an attachment is

One file, belonging to **exactly one record**, stored once.

It is **not an entity**. It has no title of its own, no record page, no identity
colour, no Search entry and no Activity subjecthood. It is a child record with a
**required owner**, on the `task_checklist_items` precedent:

```
attachments
  id                    application-generated, stable, never reused
  workspace_id          the isolation boundary
  owner_entity_id       REQUIRED. composite FK -> entities (workspace_id, id)
                        ON DELETE RESTRICT
  filename              the owner's own name, verbatim within the bound
  media_type            from the validated allow-list
  byte_size             what was actually stored
  checksum_sha256       lowercase hex, verified by R2 on write
  storage_key           derived, stored, never rendered
  upload_operation_id   the client's idempotency key. UNIQUE per workspace
  uploaded_by           the actor subject, or null
  created_at

attachment_object_purges     the compensation ledger: bytes with no metadata
  workspace_id, storage_key  PRIMARY KEY
  reason, queued_at, attempts, last_attempt_at, last_error
```

There is deliberately **no `updated_at`** (an attachment is immutable — no
rename, no replace, no versioning) and **no `deleted_at`** (deletion is hard; a
soft-deleted attachment whose bytes remain tells the owner a lie).

### Why not an EntityLink

The product rule is *an attachment must have an owner*. A link cannot express a
requirement — links are created, unlinked and restored freely, and nothing
anywhere demands one exist. A `NOT NULL` composite foreign key can, and the same
key gives `ON DELETE RESTRICT`, which forces any future permanent purge to deal
with the evidence before it deletes the record. See ADR-119 decision 1.

### One owner, and no deduplication

The same PDF on an Obligation and on the Asset it is about is **two
attachments**, two objects and two rows. That is what makes "delete the record,
delete its evidence" decidable at all. The checksum is **evidence, not
identity**: it proves the bytes came back after a restore and it detects
corruption, and two records may deliberately carry the same file.

---

## 2. Where the bytes live

One private R2 bucket, bound to the **application** Worker as `ATTACHMENTS`.

```
workspaces/<workspace-id>/attachments/<attachment-id>
```

The key carries two application-generated identifiers and **nothing else** — no
filename, no record title, no extension. Path traversal is therefore impossible
by construction rather than by escaping: there is no hostile input in a key. The
workspace prefix makes a workspace-scoped purge or audit one `list({ prefix })`.

**This is not the backups bucket, and the two stay separate on purpose.**
`dalyhub-v2-backups` belongs to the separate `dalyhub-v2-backup` Worker, which
holds a D1-export token the application Worker must never have. One bucket for
both would put the live data and its recovery copies in one blast radius.

There is **no public bucket, no public object URL and no signed URL**. Every byte
leaves through an authenticated DalyHub route.

---

## 3. The routes

| Route | Does |
| --- | --- |
| `POST /attachments` | Upload. Owner id, operation id and file in one multipart body. |
| `GET /attachments?owner=<id>` | The evidence on one record. One bounded statement. |
| `GET /attachments/:id` | Download. **Always** `Content-Disposition: attachment`. |
| `POST /attachments/:id` | `intent=delete`. |
| `GET /attachments/:id/preview` | The only route that serves `inline`, and only for raster images. |

Every one of them: requires a verified session, resolves the workspace from
**trusted server configuration** (no request value influences it), reads the row
under a workspace predicate so a foreign id is a **404**, and derives the object
key from that row rather than from anything the client sent.

### Why download is always `attachment`

DalyHub's own Content-Security-Policy sets `object-src 'none'`, `frame-src
'none'` and `media-src 'none'`, so a PDF **cannot** be displayed inside a DalyHub
page at any price; `img-src 'self'` means a same-origin raster image can. The
security question was answered by the policy before the product asked it. The
preview route serves `image/png`, `image/jpeg`, `image/webp` and `image/gif`
inline and answers 404 for everything else, including PDF — a preview URL that
produced a blank frame would be a promise the policy breaks.

`text/html` and `image/svg+xml` are **refused at upload**, not merely forced to
download: both are active content on DalyHub's own origin and neither has a
legitimate use as evidence.

---

## 4. The limits

| Bound | Value | Where it is enforced |
| --- | --- | --- |
| Maximum file size | **10 MiB** | `Content-Length` before the body is read, `File.size` before `arrayBuffer()`, the kernel validator, and a database CHECK |
| Minimum file size | 1 byte | An empty file has the same digest as every other, so "the bytes came back" would be unfalsifiable |
| Maximum filename | 200 characters | Kernel validator and a database CHECK |
| Attachments per record | 50 | Checked on write, with an honest message |
| Attachments per archive | 500 | The export FAILS above it; it never truncates |

**There is no workspace storage quota, and that is a decision.** DalyHub is one
owner on one Cloudflare account, R2 bills per byte with no wall to hit by
surprise, and a limit nobody can reach is a settings page pretending to be a
control.

### Accepted media classes

PDF · PNG, JPEG, WEBP, GIF, HEIC, HEIF · plain text, CSV, Markdown · `.doc`,
`.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`.

### What type validation actually guarantees

Stated precisely, because the honest claim is narrower than "we check the file":

1. the **declared** media type is on the allow-list;
2. the filename **extension** is one that type is known by;
3. for the formats with a short unambiguous leading signature — PDF, PNG, JPEG,
   GIF, WEBP — the first bytes match it.

That is all. It is enough to stop a `.pdf` that is really an HTML page being
accepted and later served as `application/pdf`. It is **not** antivirus, not
content inspection, and not a guarantee that a file is well-formed. DalyHub
stores opaque bytes and never parses, renders, executes or interprets them.
**Store and download is not parse and render.**

---

## 5. The compensated write

D1 and R2 share no transaction. Every failure between them is named rather than
assumed.

```
upload
  1. bound the request        Content-Length, then File.size, before allocating
  2. validate                 size, name, type, extension, signature
  3. digest                   SHA-256 over the buffer that will be stored
  4. R2 put with that digest  R2 verifies it and refuses a mismatch
  5. D1 insert + Activity     one batch
     ├─ succeeded  → done
     └─ threw      → compensate: R2 delete
                     └─ threw → queue the key in the purge ledger

delete
  1. read the row             workspace-scoped; a foreign id is 404
  2. D1 delete + ledger row + Activity   ONE batch
  3. R2 delete
     ├─ succeeded  → clear the ledger row
     └─ threw      → leave it queued; the sweep finishes it
```

**Why delete is this way round.** After step 2 the bytes are unreachable through
every DalyHub path *and* already recorded as owed to the sweep. The owner is told
the truth immediately and the residue is a byte the system knows about. The
opposite order risks metadata naming bytes that are gone, which the owner meets
as a broken record rather than a completed delete.

**Why upload is this way round.** A row must never claim an object that does not
exist. Writing the object first means the only residue is an object no row names
— invisible to the product, and exactly what the ledger is for.

**Retry cannot duplicate.** The client mints one operation id per *chosen file*
and resends it on retry; `UNIQUE (workspace_id, upload_operation_id)` turns the
second write into "you already have this". The guarantee is a database
constraint, not a convention, and it does not depend on the client behaving.

**The sweep** drains the ledger on the Worker's existing fifteen-minute cron,
bounded to 25 keys per tick, inert when the ledger is empty.

---

## 6. Backup and restore

### What is in an archive

```
manifest.json           includes an `attachments` section: id, filename,
                        media type, byte count, SHA-256, archive path
dalyhub-snapshot.json   `records.attachments` — metadata, and NO storage key
attachments/<id>        one entry per file, named by ATTACHMENT ID
README.md SCHEMA.md CHECKSUMS.txt
```

The Obsidian vault carries the same files under
`Files/<folder>/<record>/<the owner's own filename>`, linked from each record's
Markdown by a relative path.

### The rules

- **No R2 key appears in an archive.** The key is derived on restore, from the
  workspace being restored into and the attachment's own id.
- **An export that cannot read a byte fails.** No archive is produced. A missing
  record is a gap in an export; a missing file is a backup that will not restore.
- **A restore verifies every file twice** — against the snapshot row's digest
  before anything is written, and again by the object store on arrival.
- **Restore writes objects BEFORE the D1 cutover.** A row must never become
  visible naming a file that is not there. Every abandonment path queues what it
  wrote.
- **A destructive replace queues the outgoing workspace's objects.** They are
  captured before the cutover, because afterwards the rows that named them are
  gone.
- **The safety backup carries the current workspace's files**, so it is a
  recovery point for the evidence and not only for the database.
- **Old archives still restore.** `attachments` is optional-on-read; an archive
  written before V2.11 restores with no files, which is the truth about it.

### What the nightly backup Worker does and does not cover

Stated plainly, because this is the part it would be easiest to be vague about.

| | Covered | Not covered |
| --- | --- | --- |
| `dalyhub-v2-backup` nightly Workflow (BACKUP-01) | The D1 database, including every attachment's **metadata** | The attachment **bytes** |
| The owner's own **full export** (Settings → Privacy & data) | D1 **and** the bytes, in one verified archive | — |
| R2 itself | Cloudflare's own durability for objects in `dalyhub-v2-attachments` | Anything outside Cloudflare |

**The nightly Worker does not copy attachment bytes**, and this documentation does
not pretend it does. The recoverable path for files is the full export, which is
verified end to end by the restore rehearsal
(`test/kernel/attachment-restore-rehearsal.test.ts`) and which the owner can take
whenever they choose.

**The residual risk, stated truthfully.** Live attachment bytes and every copy of
them are inside Cloudflare — the live objects in R2, the nightly D1 dump in R2,
and the metadata that names them. A provider-level loss is therefore a
**correlated** loss. [DEBT-198](../product/PRODUCT_DEBT.md#-debt-198--the-off-cloudflare-encrypted-backup-has-never-been-produced-because-the-github-production-environment-holds-no-secrets--p2)
— the off-Cloudflare encrypted copy — remains open and remains V2.12 Finance's
hard gate. V2.11 did not move that gate and does not claim geographical or
provider independence it does not have. Until it closes, the owner's own
downloaded export, kept somewhere they control, is the only copy outside
Cloudflare, and taking one is worth doing after any batch of important uploads.

---

## 7. Privacy, Search and AI

- **AI cannot read an attachment.** Not by filter — attachments are simply not an
  `EVIDENCE_KIND`, and no AI retrieval path reads the attachments table or the
  bucket. A test asserts both halves. V3 may add a sanitising extraction layer;
  V2.11 sends nothing.
- **There is no attachment Search provider.** Search's explicit-query boundary
  and its unbidden-palette path share one provider set, so a filename indexed for
  the first would surface in the second — and a filename (`MRI results.pdf`) is
  exactly the string that must never appear in an empty-query recency list. The
  record is the search destination; its evidence is on it when you get there.
- **Activity carries no filename.** `attachment.added` and `attachment.removed`
  carry the media CLASS only ("PDF", "Image"). The feed reads *"Added a file"*.
  This is the rule Assets and Obligations already hold for amounts, applied to a
  string that is at least as revealing.
- **Opening or downloading a file is not activity.** It is reading, and DalyHub
  does not log the owner reading their own records.

---

## 8. Local development

Nothing to provision. `wrangler dev` and the Workers-pool tests use Miniflare's
local, isolated object storage keyed by the binding name — no Cloudflare
credentials, no remote bucket, and never production.

```sh
pnpm run db:migrate:local     # applies 0052_create_attachments.sql
pnpm run dev                  # the ATTACHMENTS binding is local storage
```

The Workers-pool suite declares the bucket in `vitest.workers.config.ts` and runs
against the **real** R2 implementation, for the reason BACKUP-01 already gives
about the backups bucket: the write path relies on R2 verifying a SHA-256 and on
`delete` being idempotent, and a stub would agree with whatever the code did. The
deterministic `createInMemoryObjectStore` fake exists for pure logic and verifies
digests exactly as R2 does, so a test that relies on verification is not a test
of nothing.

---

## 9. THE OWNER ACTION — creating the production bucket

**This is the one thing the code cannot do, and it must be done before the first
production upload.** `wrangler.jsonc`'s named production environment declares the
binding; the bucket itself has to exist in the owner's Cloudflare account.

```sh
# 1. Create the bucket. The name matches env.production in wrangler.jsonc.
npx wrangler r2 bucket create dalyhub-v2-attachments

# 2. Confirm it exists and is PRIVATE — no public development URL, no custom
#    domain. This is the property the whole security model rests on.
npx wrangler r2 bucket info dalyhub-v2-attachments
```

Do **not** enable the r2.dev public development URL and do **not** attach a
custom domain. Every byte must leave through the authenticated Worker route; a
public URL would be an unauthenticated origin in front of the owner's private
documents, which is the same reason `workers_dev` and `preview_urls` are `false`
for the application Worker itself.

Then deploy as usual (`pnpm run deploy:production`), which applies migration
`0052` along with the code.

### Verifying it, without touching anything real

A deployment whose bucket does not exist does not crash: `resolveAttachmentObjectStore`
returns `null` and every attachment route answers an honest **503** ("file
storage isn't configured for this deployment"), while every other route is
unaffected. So the check below distinguishes "working" from "not wired" without
risking anything.

1. Deploy the migration and the code.
2. Open any record and look for the **Evidence** tab.
3. Attach a small file you do not mind existing — a one-page PDF.
4. Reopen the record. The file is listed with its name, size and date.
5. Download it. Compare its SHA-256 with the original
   (`shasum -a 256 <file>`); they must match byte for byte.
6. Remove it. The row disappears.
7. Settings → Privacy & data → **Download full DalyHub export**. Unzip it and
   confirm an `attachments/` folder and an `attachments` section in
   `manifest.json`.
8. Take a fresh export **after** attaching a real file, and keep it somewhere
   outside Cloudflare. Until DEBT-198 closes, that is the only copy that is not
   in the same failure domain as the original.

**Never run a destructive test against production.** The restore rehearsal is a
test-suite concern and runs against an isolated database and an isolated bucket;
there is no production step in it and there must never be one.
