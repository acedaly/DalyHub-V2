# BACKUP_AND_RESTORE.md — Recovery (SET-02, AUDIT-11)

> How the owner gets their data **back in**, what DalyHub backs up on their
> behalf, and what to do on the day something is gone.
>
> Implements [SET-02](../roadmap/ROADMAP_V2_1.md#-set-02--backup--restore-v21)
> and closes the AUDIT-11 half of
> [DEBT-85](../product/PRODUCT_DEBT.md#-debt-85--csp-has-no-script-srcdefault-src--p3--resolved-2026-08-08).
> Decision & rationale: [ADR-081](../decisions/ARCHITECTURE_DECISIONS.md#adr-081-restore--one-canonical-format-a-staged-atomic-cutover-and-a-verified-way-back).
> Related: [`EXPORT_AND_PORTABILITY.md`](EXPORT_AND_PORTABILITY.md) ·
> [`DEPLOYMENT.md`](DEPLOYMENT.md) · [`SETTINGS_MODULE.md`](SETTINGS_MODULE.md).

---

## The rule this document exists to satisfy

**An untested restore is not a backup.** Cloudflare's durability, a scheduled
SQL dump and a downloadable export are all real and none of them is recovery.
Recovery is: the owner has a file, DalyHub reads it back, and the workspace is
the one that file describes. That is proved automatically, on every CI run, by
`test/kernel/workspace-restore.test.ts` — export a realistic workspace, lose it,
restore the archive, re-export, and assert the two snapshots are equal.

---

## 1. The three backups, and which one to use

DalyHub keeps three, for different disasters. They are not interchangeable and
the differences are not cosmetic.

| | **DalyHub backup** | **D1 dump in R2** | **D1 dump on GitHub** |
| --- | --- | --- | --- |
| What it is | The canonical versioned workspace archive (`dalyhub-snapshot.json` + manifest + checksums) — the X-04 format | A raw Cloudflare D1 SQL export | A raw Cloudflare D1 SQL export |
| Who makes it | The **owner**, from Settings → Privacy & data | The `dalyhub-production-backup` **Cloudflare Workflow**, nightly (BACKUP-01) | The **GitHub Actions workflow**, nightly (AUDIT-11) |
| Where it lives | Wherever the owner saves it | Private R2 bucket `dalyhub-v2-backups`, **plain SQL**, 90 days (365 for manual) | A GitHub Actions artifact, **GPG-encrypted**, 30 days |
| Restored by | DalyHub itself: Settings → Privacy & data → Restore | `wrangler d1 execute` against the database | `wrangler d1 execute`, after decrypting |
| Recovers | A workspace's records | The database, when the database is gone | The database, when Cloudflare itself is the problem |
| **Use it when** | **Almost always.** Records deleted, a bad import, going back to a known-good day | D1 loss or an unrecoverable schema state — the **first** dump to reach for | The Cloudflare account is lost, compromised, or unreachable |

**The normal recovery path is the DalyHub backup.** The D1 dumps exist for the
case where there is no working database to restore *into*. If you use one, the
sequence is: restore the dump into D1 → bring the application back → take a
DalyHub backup from Settings so you have a canonical one again.

### Why there are two D1 dumps, and why that is deliberate

They live in **different trust boundaries**, which is the entire point. The R2
copy is nearer, larger, longer-lived and trivially restorable — but it is inside
the same Cloudflare account as the database it protects, so it does not survive
losing that account. The GitHub copy is smaller and shorter-lived, but it is the
one that survives a Cloudflare-side disaster, and it is encrypted precisely
because a GitHub artifact is readable by a wider audience than the data is.

Keeping both is cheap. Removing either would create a single point of failure
shared by the database and its own backups.

### Why the R2 copy is not encrypted

The `dalyhub-v2-backups` bucket sits in the same Cloudflare account as the D1
database. Anyone who can read that bucket can already run `wrangler d1 export`
against the live database, so encrypting the object would add a key to lose
without removing a reader — and would cost the structural validation that stops a
truncated export being filed as a backup. The GitHub artifact is encrypted
because its trust boundary genuinely is wider. Full reasoning:
[`infra/backup/README.md`](../../infra/backup/README.md#why-the-dump-is-stored-as-plain-sql).

This holds only while the bucket stays private. `pnpm run backup:verify` asserts
that it has no public development URL; if that ever changes, the objects must be
encrypted.

### Why the scheduled job does not produce a canonical DalyHub backup

It was considered and rejected. Building the canonical snapshot requires the
application runtime **and** an authenticated owner session, and DalyHub
deliberately has no unauthenticated export path (the export route resolves its
workspace from server configuration behind Cloudflare Access and the
`OWNER_EMAIL` gate). Adding a machine-callable export endpoint so a nightly job
could reach it would open a larger hole than the one this work closes, and
re-implementing the snapshot builder outside the application would create
exactly the second serialiser [ADR-065](../decisions/ARCHITECTURE_DECISIONS.md#adr-065-the-canonical-workspace-snapshot-and-two-serialisers-derived-from-it)
exists to prevent.

So the automated copy is the low-level one, and the canonical one is
owner-initiated. **Take a DalyHub backup after any significant week of work.**
That is a real operational obligation, and it is stated here rather than implied.

---

## 2. Normal owner restore

Settings → **Privacy & data** → **Restore**.

1. **Choose backup…** and select a full DalyHub export ZIP.
2. DalyHub **checks it**. Nothing is written. It verifies the archive's
   checksums, its snapshot version, its internal consistency, and whether the
   rows could be persisted at all.
3. DalyHub **previews it**: when the backup was taken, what it contains (Areas,
   Goals, Projects, Tasks, Notes, Diary entries, Meetings, People, Assets,
   Reviews, links, Activity), what this workspace holds now, and what will
   happen.
4. If this workspace already holds records, DalyHub requires a **safety backup**
   first — it builds one, verifies it can be read back, downloads it to you, and
   waits for your browser to confirm it arrived intact. Save it.
5. **Confirm.** A replacement asks you to type `REPLACE`.
6. DalyHub restores, verifies the result, and reports.

### What a restore does and does not touch

| | |
| --- | --- |
| **Replaced** | Every record, relationship and Activity event in the workspace; your preferences, saved Tasks views and workspace membership |
| **Not touched** | AI preferences and the AI usage ledger (deliberately: budgets and consent are spending and privacy decisions, and silently re-enabling them by restoring an archive is a worse failure than setting them again — [DEBT-94](../product/PRODUCT_DEBT.md)); offline capture receipts, which are per-device operational state |
| **Never in a backup at all** | Cloudflare credentials, Access JWTs, cookies, session state, API keys, GitHub secrets, environment variables, any other workspace |

A restored workspace therefore starts with AI **off** and the conservative
default budgets, whatever the source workspace had.

---

## 3. The restore contract, precisely

### The safety backup must reach YOU, not merely exist

A server that has generated and verified a recovery archive has not established
that the owner **holds** one: the response can still fail in transit. So the
operation has two distinct states, and only the second unlocks a destructive
restore:

| State | Means | Destructive restore |
| --- | --- | --- |
| `safety_backup_ready` | DalyHub built the archive and read it back through the restore reader | **refused** |
| `safety_backed_up` | Your browser returned the SHA-256 it computed over the bytes it actually received, and it matched | permitted |

The digest is never sent to the browser — it is computed there, from the response
body — so the acknowledgement is evidence rather than an echo. A truncated
download cannot acknowledge itself, and a client that never received a response
cannot acknowledge at all. If the confirmation does not complete, the restore
stays locked and says so.

### Modes

- **Restore into an empty workspace** — the canonical recovery path. Fully
  supported and proven end to end. No safety backup is required, because nothing
  can be lost.
- **Restore over a populated workspace** — an explicit **replace**. The
  workspace's records are replaced by the backup's. Gated by a verified safety
  backup *and* a typed confirmation.

**There is no merge.** Merging two workspaces means deciding, per record, which
side wins, and DalyHub has no defined conflict semantics for that. A smaller
restore whose behaviour is predictable is worth more than a clever one capable of
corrupting the owner's memory.

### Version compatibility

Restore reads `meta.schema` and `meta.schemaVersion` **before it interprets
anything else** and refuses everything it does not recognise:

| The backup says | Restore does |
| --- | --- |
| the current schema version | continue to validation |
| a **newer** version | refuse — this DalyHub cannot know what the fields mean |
| an **older** version with no reader | refuse |
| a malformed version (`"2"`, `2.5`, `0`) | refuse |
| no version at all | refuse |
| a different application's JSON | refuse |

There is no best-effort import. Data recovery is the wrong place for guesswork.

### Validation, before any write

1. **Archive integrity** — the ZIP parses within bounds, every entry's declared
   size and CRC-32 match its bytes, no entry path could escape the archive, no
   entry is encrypted, no declared expansion is implausible.
2. **Archive structure** — exactly the DalyHub backup file set. An archive
   carrying anything else is refused (an allow-list, not a deny-list).
3. **Checksums** — `CHECKSUMS.txt` recomputed against the bytes actually read.
   Separate from the ZIP CRC on purpose: the CRC proves transport, the checksum
   file proves the archive was not rewritten.
4. **Schema and referential integrity** — the X-04 validator: shape, timestamp
   formats, ordering, and every detail row / link endpoint / Activity subject
   naming a record the file contains.
5. **Persistability** — the constraints the database enforces, checked first so
   a corrupt backup fails *before* restoration begins: repeated ids, a detail row
   on the wrong kind of record, a spine kind that disagrees with its record, a
   completed Area, a self-link, a duplicated relationship, a blank title, a
   dangling child reference, and a backup that recorded itself as truncated.

### Identity and relationships

Entity ids are **preserved exactly**. They have to be: EntityLinks, meeting
follow-ups, asset events and obligations, recurrence series and Activity
subjects are all keyed by them, and regenerating ids would mean rewriting every
reference — a remapping pass with no way to prove it was complete. The
round-trip test asserts id equality across the whole workspace.

### Activity

A restore **reconstructs history; it does not re-enact it**. The Activity events
in the backup are restored as they were, with their original instants, actors and
subjects. No `created`/`updated` event is emitted for a reconstructed record, and
no `workspace.restored` event is invented — the Activity stream records what the
owner did, and manufacturing thousands of events dated today would destroy the
one thing a restore is for. The restore's own audit trail is the
`workspace_restore_operations` row, which is where an operational fact belongs.

### Actor attribution

A backup carries the workspace's **membership rows** — the subject, the display
names and the linked Person — so restored history still resolves to a name
instead of `Unknown user`. It deliberately does **not** carry the member's email
(an authentication-adjacent identifier the request boundary refreshes on the next
sign-in) or their sign-in telemetry. Nothing in a backup authenticates anybody:
sign-in still goes through Cloudflare Access and the `OWNER_EMAIL` gate, and a
restored membership row grants no access.

### Workspace isolation

The target workspace comes from **trusted server configuration**. There is no
workspace parameter, header or body field on the restore route, and the write
path binds `workspace_id` from the server's context on every statement. A
backup's own `workspace.id` is displayed as provenance and is never read by the
write path. This is tested directly: a crafted archive naming another workspace
restores into the authenticated one, and the other workspace is untouched.

### Failure safety

This is the property everything else is arranged around:

> **At every instant the workspace is either entirely the old one or entirely the
> restored one.**

D1 gives one `batch()` transactional atomicity, and a whole workspace does not
fit in one batch. So the write is split (migration `0035`):

```
  STAGING   many bounded batches → workspace_restore_staged_rows (inert JSON)
            interruption here leaves the workspace untouched
  CUTOVER   ONE batch = ONE transaction, a FIXED ~55 statements:
              DELETE FROM <table> WHERE workspace_id = ?     (children → parents)
              INSERT INTO <table> … SELECT json_extract(…)   (parents → children)
            interruption here rolls back
```

The atomic step never grows with the data, which is what makes the guarantee hold
for a workspace of any size.

**The state transition is enforced inside that transaction, not by a read before
it.** The first statement of the cutover claims the operation:

```sql
UPDATE workspace_restore_operations
   SET status = 'applied', apply_token = ?
 WHERE workspace_id = ? AND id = ?
   AND status = ?              -- the exact expected state, and no other
   AND apply_token IS NULL     -- nobody has claimed it
```

and every DELETE and INSERT that follows carries `AND EXISTS (… WHERE apply_token
= <this attempt's token>)`. Two `apply` requests that both observed an acceptable
state therefore cannot both replace the workspace: one wins the claim, and the
other's statements match zero rows, so its transaction commits a complete no-op
and it reports a clean refusal. For a destructive replace the required state is
the ACKNOWLEDGED `safety_backed_up`, so the concurrency guard and the safety-
backup gate are the same check. After the cutover commits, DalyHub verifies the
result against the staged rows — row counts per table, exact id-set membership
for entities/links/activities, referential integrity, and that nothing landed in
another workspace. **A failed verification is reported as a failure**, never as
success, and it says plainly that the workspace now holds the restored data so
the owner knows to reach for the safety backup.

---

## 4. Lost or broken application, workspace intact

If DalyHub is reachable but the workspace is wrong — records deleted, a bad bulk
edit, a restore you regret — this is the ordinary path above. Use the most recent
DalyHub backup from before the damage. The safety backup taken during a previous
restore is itself an ordinary DalyHub backup and restores the same way.

---

## 5. Catastrophic D1 recovery

Use this only when there is no working database, or the database is in a state
the application cannot be brought back on top of.

**Production restore is always a manual, operator-controlled action.** There is
no one-click restore command and BACKUP-01 deliberately did not add one: an
automated production restore is a loaded weapon pointed at the only copy of the
owner's life.

### 5.0 Choose the mechanism

| Situation | Reach for |
| --- | --- |
| The damage happened **within the last 30 days** and the database itself is healthy — a bad migration, a destructive bulk operation, a mistaken restore | **D1 Time Travel** (§5.1). Fastest, no file handling, no import step. |
| You need a **specific known-good day**, the damage is older than Time Travel's window, or the database is gone entirely | **An R2 SQL dump** (§5.2). |
| **Cloudflare itself** is the problem — the account is lost, compromised or unreachable | **The GitHub artifact** (§5.3). |

### 5.1 Recent incident — D1 Time Travel

D1 keeps a restorable history of the database for 30 days, with no backup file
involved. This is the right tool for "something went wrong today".

```sh
source .production.env

# What restore points exist, and what bookmark corresponds to a moment?
node scripts/production-d1.mjs d1 time-travel info dalyhub-v2
node scripts/production-d1.mjs d1 time-travel info dalyhub-v2 \
  --timestamp=2026-08-13T09:00:00Z
```

**Before restoring, take a backup of the current state** — Time Travel moves the
database, and the state you are leaving is the only record of what happened:

```sh
pnpm run db:production:backup        # → production/manual/, kept 365 days
pnpm run backup:status               # wait for it to report complete
pnpm run db:production:backup:list   # confirm the object exists and is non-zero
```

Then restore:

```sh
node scripts/production-d1.mjs d1 time-travel restore dalyhub-v2 \
  --timestamp=2026-08-13T09:00:00Z
```

Verify with §5.4.

### 5.2 Older or explicit recovery — an R2 SQL dump

**1. List what is available.**

```sh
source .production.env
pnpm run db:production:backup:list
```

Keys are sortable UTC instants, so the last line is the most recent backup:

```
production/daily/2026/08/dalyhub-v2-2026-08-13T160000Z.sql
    1417216 bytes (1384.0 KiB)   uploaded 2026-08-13T16:00:31Z
```

**2. Inspect its timestamp and provenance before trusting it.** Every object
carries metadata — `backupTimestamp`, `bookmark` (the D1 export bookmark it was
taken at), `trigger`, `sha256`, `workerCommit`. The key itself already tells you
the instant in UTC; the metadata tells you which export produced it.

```sh
npx wrangler r2 object get \
  dalyhub-v2-backups/production/daily/2026/08/dalyhub-v2-2026-08-13T160000Z.sql \
  --remote --file /dev/null    # prints the object's metadata
```

**3. Download it.**

```sh
node scripts/backup-worker.mjs download \
  production/daily/2026/08/dalyhub-v2-2026-08-13T160000Z.sql \
  --output dalyhub-production.sql

shasum -a 256 dalyhub-production.sql   # compare with the object's sha256 metadata
```

The downloaded file is the owner's entire production database in plain SQL. Keep
it somewhere you control and delete it when you are done.

**4. Back up the current state first — this is not optional.**

```sh
pnpm run db:production:backup
pnpm run backup:status
pnpm run db:production:backup:list     # confirm it exists and is non-zero
```

If the database is too broken to export, say so explicitly in your own notes and
proceed — but never skip this step silently. Restoring over a live database
without a copy of what you are replacing turns a recoverable incident into an
unrecoverable one.

**5. Destructive from here.** Prefer a **new** database, verify it, then repoint
the binding. Restoring over the live database is irreversible and a new D1
database costs nothing:

```sh
npx wrangler d1 create dalyhub-v2-recovered
npx wrangler d1 execute dalyhub-v2-recovered --remote --file=dalyhub-production.sql
```

**6. Point the Worker at the recovered database** by supplying its id as
`CLOUDFLARE_D1_DATABASE_ID`, deploy, and check `/health`.

**7. Repoint the backup Worker too**, or it will keep backing up the old
database:

```sh
pnpm run backup:deploy
pnpm run backup:verify
```

**8. Immediately take a DalyHub backup** from Settings, so you are back to having
a canonical, in-app-restorable copy.

### 5.3 Cloudflare-side disaster — the GitHub artifact

1. Download the artifact: GitHub → Actions → *Production D1 backup* → the run →
   Artifacts. It contains `dalyhub-v2-production-<stamp>.sql.gpg` and
   `metadata.json`.
2. Decrypt it with the recovery key (§6):

   ```sh
   gpg --batch --decrypt --passphrase-file /path/to/recovery-key.txt \
     dalyhub-v2-production-<stamp>.sql.gpg > dalyhub-production.sql
   ```

3. Confirm it is the file you expect — `metadata.json` records the plaintext's
   SHA-256:

   ```sh
   sha256sum dalyhub-production.sql
   ```

4. Continue from §5.2 step 4.

### 5.4 Verify the result

A restore is not finished until it has been checked. Compare against what you
expected, not merely against "no errors":

```sh
# Schema: every table is present.
node scripts/production-d1.mjs d1 execute dalyhub-v2 \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"

# Row counts for the kernel tables.
node scripts/production-d1.mjs d1 execute dalyhub-v2 --command \
  "SELECT 'entities', COUNT(*) FROM entities
   UNION ALL SELECT 'entity_links', COUNT(*) FROM entity_links
   UNION ALL SELECT 'activities', COUNT(*) FROM activities
   UNION ALL SELECT 'spine_records', COUNT(*) FROM spine_records
   UNION ALL SELECT 'workspaces', COUNT(*) FROM workspaces;"

# Referential integrity.
node scripts/production-d1.mjs d1 execute dalyhub-v2 \
  --command "PRAGMA foreign_key_check;"

# Migrations: nothing pending against the restored schema.
pnpm run db:production:list
```

Then open the application and confirm `/health`, the Today dashboard, and a
record you know should exist.

No SQL from any of these paths is ever executed through the application.
DalyHub's own restore reads the canonical snapshot format only; there is no
interface anywhere that runs owner-supplied SQL.

---

## 6. The recovery key

The nightly artifact is encrypted with **GnuPG symmetric AES-256** (salted,
iterated S2K at the maximum count, SHA-512 digest — the parameters are stated
explicitly in `scripts/production-backup.mjs` rather than left to a GnuPG
version). The passphrase is a single secret.

- **Operational copy:** GitHub → repository → Settings → Environments →
  `production` → secret **`BACKUP_ENCRYPTION_PASSPHRASE`**. It is used by the
  workflow and by nothing else. It is never printed, never passed on a command
  line, never written into the artifact or its metadata.
- **Owner-held copy: REQUIRED, and off GitHub.** Keep it in a password manager or
  another place you control that does not depend on GitHub being available. The
  key must not live inside the thing it protects, and it must not live only in
  the same account as the data.
- **If GitHub is unavailable**, the encrypted artifacts are unavailable too — so
  the answer to "how do I recover then?" is a **DalyHub backup you downloaded
  yourself**. That is the third reason §1 asks the owner to take one regularly.
- **Never** commit it, paste it into documentation, echo it into a workflow log,
  or upload it beside a backup. The pipeline refuses to write a metadata field
  whose name looks like a credential, and the workflow fails the upload if the
  metadata names one.

### Rotating the key

The important part is what happens to the backups encrypted under the old key.

1. Generate a new passphrase (e.g. `openssl rand -base64 48`).
2. **Keep the old key.** Every artifact already in GitHub is decryptable only
   with it. Label both copies with the date each became current.
3. Update `BACKUP_ENCRYPTION_PASSPHRASE` in the `production` environment.
4. Run the workflow manually (*Run workflow*) and confirm it succeeds — the run
   proves recovery with the new key before you rely on it.
5. Retain the old key until the last artifact encrypted with it has expired
   (retention is 30 days, so **one month** after rotation), then destroy it.

Do not automate rotation. An automated rotation that discards the previous key
silently destroys every backup taken before it.

---

## 7. Retention

### The R2 copy (BACKUP-01)

| | |
| --- | --- |
| **Frequency** | Daily, **16:00 UTC** — 02:00 AEST / 03:00 AEDT. Cloudflare cron schedules are UTC and have no timezone setting, so the local hour shifts by one across daylight saving. Accepted: both are quiet hours for the single owner. |
| **How it fires** | The backup Worker's **own Cron Trigger** → its `scheduled()` handler → one Workflow instance. Native `schedules` on the Workflow binding requires a paid Workers plan; Cron Triggers are free-tier. The backup logic is identical either way — see [`infra/backup/README.md`](../../infra/backup/README.md#why-it-is-a-cron-trigger-and-not-schedules). This is **not** the application Worker's calendar cron, which is untouched. |
| **Retention** | **90 days** for `production/daily/`, **365 days** for `production/manual/`. |
| **Enforced by** | R2 **lifecycle rules** keyed on those prefixes — not by deletion code in the Worker. A backup system that deletes its own backups is one bug away from removing the thing it exists to keep. |
| **Why 90** | The database is ~1.4 MB, so a quarter of daily history costs almost nothing and is long enough to notice damage that was not obvious at the time. BACKUP-01 adds no weekly or monthly archival tiers on purpose: a backup system that is easy to reason about is worth more than one with more boxes on the diagram. |
| **Why manual is 365** | A hand-run backup is usually taken immediately before something risky. It should still be there long after the nightly series around it has rolled off. |
| **Storage class** | Standard only. No Infrequent Access transition — IA adds a retrieval cost and a minimum-duration charge to exactly the objects an emergency needs fastest. |
| **On expiry** | R2 deletes the object. Nothing is archived automatically. |

### The GitHub copy (AUDIT-11)

| | |
| --- | --- |
| **Frequency** | Daily, 16:30 UTC (02:30 Australia/Sydney). Manual runs any time via *Run workflow*, through the identical pipeline. |
| **Retention** | **30 days**, on the GitHub artifact. |
| **Why 30** | It was neither reduced nor extended when encryption was added. Reducing it would weaken recovery for no security gain now that the artifact is unreadable without the key; extending it would keep more of the owner's data on GitHub for longer, which encryption is not a reason to do. Thirty dailies is a month of recoverable history — long enough to notice damage, short enough to be proportionate for a single-owner system. |
| **On expiry** | The artifact is deleted by GitHub. Nothing is archived automatically. |

### Beyond both

**Longer-term copies are the owner's responsibility, and deliberately so:** a
DalyHub backup downloaded from Settings, kept somewhere they control. Those have
no expiry, no GitHub dependency and no Cloudflare dependency.

---

## 8. What the automated backups actually do

### 8a. The R2 backup (BACKUP-01)

One Cloudflare Workflow, `dalyhub-production-backup`, used identically by the
scheduled and the manually triggered run. Full detail:
[`infra/backup/README.md`](../../infra/backup/README.md).

1. **Plan.** Decide the retention tier and the object key **once**, and memoise
   it. A retry therefore re-uses the same key instead of scattering partial
   objects under fresh timestamps.
2. **Initiate the export** through the supported D1 export REST API, keeping the
   export bookmark. No table-walking, no reconstruction from application models —
   those drift silently the first time a migration adds something they do not
   know about.
3. **Poll, download and store in one step.** The signed URL is a bearer
   credential for the whole database, so it never crosses a step boundary into
   durable Workflow state and is never logged.
4. **Validate before storing.** Non-empty, plausibly SQL, every kernel and
   sensitive module table present, ending with a complete statement. A dump that
   fails is never written, so the bucket cannot hold a file that looks like a
   backup and is not one. The rules are kept in parity with the GitHub pipeline's
   by a test.
5. **Checksum.** A SHA-256 is computed and handed to R2, which verifies it
   server-side and rejects a write whose bytes do not match.
6. **Verify the stored object** in a separate step: it exists, its key is what
   was intended, it is non-zero, its size matches what was written, and its
   metadata is present. "`put()` returned" is not the same claim as "there is a
   backup", so a verification failure is reported as a **failed** backup.
7. **Fail closed.** A bad token, a placeholder identifier, a malformed response,
   a missing bookmark, a truncated dump or a key another instance already wrote
   all fail permanently rather than retrying for hours.

Logs carry stage names, the database name, the trigger, the bookmark, the object
key and byte counts. They never carry the API token, the signed URL, or any dump
content — asserted by `test/kernel/backup-workflow.test.ts`.

### 8b. The GitHub backup (AUDIT-11)

One pipeline, `scripts/production-backup.mjs`, used identically by the scheduled
and the manually dispatched run — there is no "secure scheduled backup, insecure
manual backup" split.

1. **Refuse early.** If `BACKUP_ENCRYPTION_PASSPHRASE` is absent, the job fails
   *before* the database is read. Discovering it after the export has written the
   owner's database to the runner is too late.
2. **Export** through the same audited wrapper the owner uses by hand
   (`scripts/production-d1.mjs`), to a scratch directory that is **never** the
   upload path.
3. **Validate** the dump structurally: non-empty, every kernel and sensitive
   module table present, and ending with a complete SQL statement (the
   truncated-dump failure that looks fine until the day it is needed).
4. **Encrypt** with GnuPG AES-256, passphrase read from a file written under
   `umask 077` — never from `argv` (world-readable through `/proc`) and never
   interpolated into a shell string.
5. **Prove recovery.** Decrypt the artifact back and compare SHA-256 with the
   original, and assert the plaintext does not appear inside the ciphertext.
   Every night. Recoverability is demonstrated, not inferred from a file
   extension.
6. **Write non-sensitive metadata** — sizes, digests, run identity, the decrypt
   command. A SHA-256 is one-way, so publishing the plaintext digest lets a
   future decryption be checked without disclosing anything.
7. **Refuse to upload** if the artifact directory contains anything unencrypted,
   if the metadata is missing, or if the metadata names a credential field.
8. **Clean up** the plaintext and the key file in a trap that runs even on
   failure.

Nothing prints backup contents. Every log line is a file name, a byte count or a
digest.

---

## 9. Production restore safety

**CI never performs a destructive production restore.** The automated proof runs
against isolated test databases and test workspaces with a throwaway key; the
production key is only ever in the `production` environment. Production recovery
is owner-initiated, deliberate, and documented above.

---

## 10. Size limits, and why a backup can never silently omit data

The export is bounded — 50,000 rows per collection and 64 MiB per archive — and
both bounds **fail loudly**. A collection that hits its ceiling is recorded as a
`collection_truncated` limitation in the snapshot and the manifest, and the
restore path **refuses** any backup carrying that code. A file labelled "backup"
therefore either represents the whole workspace or is rejected as a recovery
source; there is no state in which a truncated file is restored as if it were
complete.

The restore's own ceilings agree with the writer's: 32 MiB for the uploaded ZIP
and 64 MiB of decompressed content — the same `ZIP_MAX_TOTAL_BYTES` the writer
enforces, so any archive DalyHub was able to write is admissible to read.
Exceeding either is an honest refusal, never a partial read. No realistic
personal workspace is close to any of these numbers.

---

## 11. Read consistency — what a backup is a snapshot *of*

`meta.consistency` is `per-statement-read-committed`, and that is the truth
rather than a formality. A backup is a **sequence** of bounded statements. Each
sees a consistent database; the sequence is not an atomic point-in-time snapshot,
so a write committed between two collections is visible to the later one and not
the earlier. D1 offers no cross-statement snapshot for this read pattern through
the Workers binding.

Three things narrow the window and one thing closes the consequence:

- collections are read **sequentially**, not concurrently — slower, and a
  smaller interval in which a concurrent write can land between two of them;
- the snapshot is **validated for referential integrity before it is written to
  the file**, so a torn read that produced a dangling reference fails the export
  instead of becoming a bad backup;
- the **restore validates the same properties again** on the way in, so a file
  that somehow carried an inconsistency is refused rather than restored;
- the automated backup runs at 02:30 local time, when the single owner is
  reliably not writing.

SET-02 deliberately does not claim more. A backup is a coherent recovery point
whose worst case is a few seconds of skew between collections during active
editing — and a skew that broke a relationship would fail validation rather than
be restored. Closing the window entirely would need a database-level snapshot D1
does not expose.

---

## 12. Verification

| Layer | Coverage |
| --- | --- |
| Unit | `test/unit/restore/*` — the version gate (future, older, malformed, missing, another application's JSON, and totality); the safety validator (duplicate ids, wrong-type detail rows, spine disagreement, completed Area, self-link, duplicate relationship, blank title, self-declared truncation, and that messages never carry record content); the untrusted ZIP reader (round trip, not-a-ZIP, truncation, tampering, over-size, declared bomb, unsafe path, entry-count, encrypted entry, unsupported method); the flow model; and the Settings controls (inspect-without-writing, the consequence sentence, the safety-backup gate including a generated-but-unconfirmed backup keeping the restore locked, the acknowledgement digest, the typed confirmation, each distinct refusal, failure, success). |
| Unit (ops) | `test/unit/deploy/production-backup-encryption.test.ts` — a real dump, a real key, real `gpg`: encrypt → prove the plaintext is absent → decrypt → byte-identical → still validates; wrong key fails; a tampered ciphertext fails; metadata refuses a credential field. `test/unit/deploy/production-backup-workflow.test.ts` — the workflow contract. |
| Kernel / D1 | `test/kernel/workspace-restore.test.ts` — the round trip and semantic equivalence, no manufactured Activity, actor attribution, replace-not-merge, isolation against a crafted archive, every refusal, a failed cutover leaving the workspace untouched, a failed safety backup aborting the restore, a safety backup that is generated but never acknowledged (and one acknowledged with the wrong digest) leaving the restore refused, two concurrent applies where exactly one wins and the other is a clean no-op, a failed verification reported as failure, and staged rows staying inert. `test/kernel/workspace-restore-route.test.ts` — fail closed, no GET, no client-supplied workspace, the safety-backup gate, no internals in a failure. |
| Unit (R2 backup) | `test/unit/backup/*` — object-key naming (UTC, sortability, determinism, tier prefixes, refusal of unsafe database names); the D1 export client (every malformed response shape, and permanent-vs-transient classification); dump validation **and its parity with `scripts/production-backup.mjs`**; configuration refusal (placeholders, missing secret) and assertions over the real committed `infra/backup/wrangler.jsonc` — no route, no public origin, the correct cron, and no committed identifiers. |
| Workers runtime (R2 backup) | `test/kernel/backup-workflow.test.ts` — the whole Workflow against a **real local R2 bucket**: the happy path and stage order, provenance metadata, byte fidelity, daily-vs-manual tier selection (including that a parameter cannot relabel a scheduled run), every failure mode storing nothing, retry idempotency, refusal to overwrite another instance's object, a verification failure reported as failure, and that no token, signed URL or dump content reaches a log line or an error message. |
| End-to-end | `e2e/restore.spec.ts` — the Settings surface: choosing a backup, the preview, a corrupt backup, the destructive confirmation, and the restore result. |

No test performs a production export, and none needs Cloudflare credentials.

---

## Related documents

- [`EXPORT_AND_PORTABILITY.md`](EXPORT_AND_PORTABILITY.md) — the canonical format
  this restores.
- [`infra/backup/README.md`](../../infra/backup/README.md) — the BACKUP-01 R2
  backup Worker: architecture, configuration, retention and commands.
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — deploys, migrations and the release order.
- [ADR-065](../decisions/ARCHITECTURE_DECISIONS.md#adr-065-the-canonical-workspace-snapshot-and-two-serialisers-derived-from-it),
  [ADR-081](../decisions/ARCHITECTURE_DECISIONS.md#adr-081-restore--one-canonical-format-a-staged-atomic-cutover-and-a-verified-way-back).
