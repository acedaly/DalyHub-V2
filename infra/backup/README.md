# `dalyhub-v2-backup` — the production D1 → R2 backup Worker (BACKUP-01)

> A separate Cloudflare Worker whose only job is to export the production D1
> database to a private R2 bucket, once a night, and prove it worked.
>
> Recovery procedure: [`docs/development/BACKUP_AND_RESTORE.md`](../../docs/development/BACKUP_AND_RESTORE.md).
> Deploys and migrations: [`docs/development/DEPLOYMENT.md`](../../docs/development/DEPLOYMENT.md).

---

## What this is, in one picture

```
 Workflow cron schedule  "0 16 * * *"  (UTC — 02:00 AEST / 03:00 AEDT)
             │
             ▼
   dalyhub-v2-backup              ← a Worker with no route, no domain,
   (dalyhub-production-backup)      no workers.dev origin, no D1 binding
             │
             ├─ 1. plan                decide the tier and the object key, ONCE
             ├─ 2. initiate-export     POST the D1 export, keep the bookmark
             ├─ 3. export-and-store    poll → download → validate → checksum → put
             └─ 4. verify-stored-object  read the object back and check it
             │
             ▼
   dalyhub-v2-backups             ← private R2 bucket, no public access
     production/daily/2026/08/dalyhub-v2-2026-08-13T160000Z.sql
     production/manual/2026/08/dalyhub-v2-2026-08-13T091500Z.sql
```

## Why a separate Worker

`dalyhub-v2-production` serves the owner's requests. Putting the backup Workflow
inside it would:

- couple the nightly backup's reliability to every unrelated application deploy;
- put a D1-export API token inside the Worker that handles owner traffic;
- entangle the backup with the CAL-01 calendar Cron Trigger the application
  Worker already owns.

A backup that stops working because a UI change was deployed is not a backup, so
the backup lives on its own and shares nothing with the application but the
database it reads.

## Why the dump is stored as plain SQL

DalyHub's other production backup — the AUDIT-11 GitHub Actions artifact — is
GPG-encrypted, and that was the right answer *there*: a GitHub artifact is
readable by anyone with Actions read access on the repository, which is a
**different and broader trust boundary** than the data itself.

R2 is not. The `dalyhub-v2-backups` bucket lives in the same Cloudflare account
as the D1 database it copies. Anyone who can read the bucket can already run
`wrangler d1 export` against the live database directly, so encrypting the object
would add a key to lose without removing a reader. Encrypting here would also
cost real recovery properties:

- there is no `gpg` in a Worker, so it would mean a bespoke WebCrypto container —
  the exact shape AUDIT-11 rejected, because recovery would then depend on this
  repository still existing;
- the Workflow could no longer validate that what it stored is a complete SQL
  dump, which is the check that stops a truncated export being filed as a backup.

So: **private bucket, plain SQL, no public access, and that is asserted rather
than assumed** (`pnpm run backup:verify`). If the bucket's trust boundary ever
changes — a public dev URL, a custom domain, a shared R2 token — this reasoning
no longer holds and the objects must be encrypted.

## The status service (BACKUP-02)

DalyHub shows backup health at `Settings → This app → Backups`. It gets it from
this Worker over a **Worker service binding**, never by reading the bucket:

```
 DalyHub browser
       │  authenticated, behind Cloudflare Access
       ▼
 dalyhub-v2-production          ← NO R2 binding, NO D1-export token
       │  BACKUP_SERVICE (service binding, entrypoint "BackupService")
       ▼
 dalyhub-v2-backup
       ├─ status()   health, last success, last attempt, sizes, retention
       ├─ history()  the last 30 runs
       └─ trigger()  starts the ONE Workflow; refuses if one is running
```

`BackupService` is a **named `WorkerEntrypoint`**, deliberately not routes on the
`fetch` handler. There is no URL that reaches these methods, so no route, custom
domain, `workers.dev` origin or Access misconfiguration can expose them — a
structural guarantee rather than a policy, which is the right shape for the one
Worker that can read the owner's entire database.

What crosses the binding is sanitised operational metadata only: health,
timestamps, sizes, retention, a trigger label, and a canned failure sentence.
Never a dump, a signed URL, a token or an object body. The application validates
it again at its own boundary (`app/kernel/backup`), so a mid-deploy or malformed
response shows as "status unavailable" rather than a confident "Healthy".

### Run state in R2

```
status/
  latest.json                       a rolling log of the last 30 runs
  runs/2026-08-13T160000Z-f9412c3c.json   one durable file per run
```

The rolling log exists so a status read costs **one** R2 GET instead of a list
plus thirty. The per-run files are the audit trail, kept beyond what the screen
shows. Neither is derived from the other, so a corrupt log cannot destroy the
history.

Records are written best-effort: a run whose dump is verified and present is not
failed because a small JSON status file could not be written. A persistent
inability to write status is surfaced by absence instead — the `running` record
stops being replaced, and the health calculation reports it as stalled after
thirty minutes.

The failure record's `message` is **looked up from the stage that failed**, from a
fixed set of sentences in `src/run-records.ts`. There is no code path from an
error object to displayed text, so a stack trace or a signed URL cannot reach the
UI even if one appeared in an error.

### Health

`src/backup-health.ts` is the single place health is decided, and its rule is that
it never claims health it cannot prove:

| State | When |
| --- | --- |
| `running` | a run started less than 30 minutes ago and has not reported an outcome |
| `attention` | the latest attempt failed, nothing has ever succeeded, the last success is older than 30 hours, or a run has claimed to be running for over 30 minutes |
| `healthy` | the latest attempt succeeded within 30 hours |
| `unknown` | state could not be read, or nothing has ever run |

**30 hours** is the nightly interval plus a **6-hour grace**. The grace is a
judgement, not a guess: a backup that retried through transient Cloudflare trouble
can land a few hours late, and an indicator that cries wolf is one the owner
learns to ignore. Six hours still reports a genuinely missed night by mid-morning.

## Layout

| File | What it holds |
| --- | --- |
| `src/index.ts` | Entrypoint. Exports the Workflow and `BackupService`; `scheduled()` creates the nightly instance; `fetch` returns 404 and is unreachable by design. |
| `src/backup-service.ts` | The service-binding entrypoint: `status()`, `history()`, `trigger()`. |
| `src/backup-health.ts` | The one health calculation, and its named thresholds. Pure. |
| `src/run-records.ts` | The run record, its key, and the stage→sentence failure map. Pure. |
| `src/status-store.ts` | Reading and writing run state in R2. Never reads a dump. |
| `src/backup-workflow.ts` | The four steps, and why they are cut where they are. |
| `src/d1-export.ts` | A strict client for the D1 export REST API. Refuses every malformed response. |
| `src/dump-validation.ts` | Structural validation of the SQL dump. Kept in parity with `scripts/production-backup.mjs`. |
| `src/object-key.ts` | Deterministic, sortable, UTC object naming. Pure. |
| `src/config.ts` | The environment, and the refusal to run against a placeholder. |
| `src/logging.ts` | Structured logs, on an allow-list of safe fields. |
| `wrangler.jsonc` | Bindings, the Workflow, and its cron schedule. No real identifiers. |

Operator commands live in [`scripts/backup-worker.mjs`](../../scripts/backup-worker.mjs).

## Configuration

Non-secret values are committed as **placeholders** and injected at deploy time
with `wrangler deploy --var`, following the same rule as the root
`wrangler.jsonc`: no real production identifier is committed. The Worker refuses
to run against a placeholder, so a bypassed deploy fails loudly instead of
backing up nothing every night.

| Name | Kind | Source |
| --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | var | `CLOUDFLARE_ACCOUNT_ID` at deploy time |
| `D1_DATABASE_ID` | var | `CLOUDFLARE_D1_DATABASE_ID` at deploy time |
| `D1_DATABASE_NAME` | var | committed (`dalyhub-v2`; not private) |
| `BACKUP_ENVIRONMENT` | var | committed (`production`) |
| `WORKER_COMMIT` | var | `git rev-parse --short HEAD` at deploy time |
| `D1_REST_API_TOKEN` | **secret** | `pnpm run backup:secret` (interactive) |

### The API token, and its least privilege

The token needs exactly one permission:

```
Account → D1 → Edit
```

**`D1 Read` is not sufficient.** The export endpoint is a `POST` that starts a
job, so it requires write scope even though it changes no data. Scope the token
to this account, give it nothing else, and never reuse a Global API Key or an
existing broad production token.

The token is never in Git, never in `wrangler.jsonc`, never in a `.env`, never a
command-line argument, and never logged. It reaches Cloudflare only as an
`Authorization: Bearer` header.

## First-time setup

```sh
# 0. R2 must be enabled on the account once, in the dashboard:
#    https://dash.cloudflare.com → R2 → Enable
#    (This is an account-level action. Nothing here can do it for you.)

source .production.env          # CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID

pnpm run backup:provision       # private bucket + the two lifecycle rules
pnpm run backup:secret          # paste the D1 Edit token at the prompt
pnpm run backup:deploy          # deploy the Worker and its scheduled Workflow
pnpm run backup:verify          # assert the live configuration
```

## Everyday commands

```sh
pnpm run db:production:backup        # run a backup NOW → production/manual/
pnpm run db:production:backup:list   # list stored backups
pnpm run backup:status               # inspect the latest Workflow run
pnpm run backup:verify               # schedule, bindings, lifecycle, public access

node scripts/backup-worker.mjs download <object-key> --output dump.sql
```

`db:production:backup:list` uses the Cloudflare REST API (Wrangler has no
`r2 object list`), so it needs `CLOUDFLARE_API_TOKEN` with
**Workers R2 Storage → Read**. Everything else works with `wrangler login`.

## Retention

Enforced by **R2 lifecycle rules**, not by deletion code in the Worker. A backup
system that deletes its own backups is one bug away from removing the thing it
exists to keep; a lifecycle rule is declarative, inspectable, and outside the
code path that could be wrong.

| Prefix | Produced by | Retention | Rule id |
| --- | --- | --- | --- |
| `production/daily/` | the Workflow's cron schedule | **90 days** | `dalyhub-daily-backups-90-days` |
| `production/manual/` | `pnpm run db:production:backup` | **365 days** | `dalyhub-manual-backups-365-days` |

Manual backups are kept four times longer on purpose: a hand-run backup is
usually taken immediately before something risky, and it should still be there
long after the nightly series around it has rolled off.

Neither rule transitions to Infrequent Access. BACKUP-01 deliberately keeps one
storage class — 90 copies of a ~1.4 MB database is a trivial amount of Standard
storage, and IA would add a retrieval cost and a minimum-duration charge to
exactly the objects an emergency needs fastest.

There are **no weekly or monthly archival tiers**. They were considered and left
out: the database is small, 90 dailies is a quarter of recoverable history, and a
backup system that is easy to reason about is worth more than one with more
boxes on the diagram.

## The schedule

`"0 16 * * *"`. **Cloudflare cron schedules are UTC**, always — there is no
timezone setting. 16:00 UTC is:

- **02:00 AEST** (Apr–Oct, UTC+10)
- **03:00 AEDT** (Oct–Apr, UTC+11)

The one-hour drift across daylight saving is accepted. The requirement is one
consistent nightly backup at an hour the single owner is reliably not writing,
and both times satisfy it.

### Why it is a Cron Trigger and not `schedules`

The intended design put the cron on the **Workflow binding** (`schedules`), which
creates an instance per firing with no handler at all. Cloudflare refuses that on
the free Workers plan:

```
Workflow "dalyhub-production-backup" has "schedules" configured,
but scheduled Workflows require a paid Workers plan.
```

Plain **Cron Triggers are free-tier**, so the schedule lives on this Worker's own
`triggers.crons` and `scheduled()` in `src/index.ts` creates the instance. The
backup itself is identical — the same Workflow, the same four durable steps, the
same retry policy, the same memoised object key. The only difference is who asks
for the instance.

Two properties make the nightly series correct on this path, and both are tested:

- the handler passes `trigger: "daily"`, so the object lands under
  `production/daily/` with 90-day retention;
- the handler passes `scheduledTime` from `ScheduledController`, so the object is
  named for its **cron slot** rather than for the moment it started — a late
  firing or a retry still produces exactly one object per night.

This is **not** the application Worker's scheduled handler. That one belongs to
the CAL-01 calendar refresh in `dalyhub-v2-production` and is untouched: two
Workers, two triggers, no shared handler.

**On Workers Paid**, delete `triggers.crons` and the `scheduled()` handler and add
`"schedules": ["0 16 * * *"]` to the Workflow binding. Nothing about the backup
logic changes, and `checkCommittedBackupConfig` accepts either form (asserted by
`test/unit/backup/backup-configuration.test.ts`).

## Object naming and metadata

```
production/daily/2026/08/dalyhub-v2-2026-08-13T160000Z.sql
```

UTC, sortable as a plain string, database name included, no spaces or colons.
Cloudflare's own generated export filename is kept as metadata rather than used
as the key — it does not sort and says nothing about when the backup was taken.

Each object carries non-sensitive custom metadata: `database`, `databaseId`,
`environment`, `bookmark` (the D1 export bookmark), `backupTimestamp`, `trigger`,
`retentionDays`, `sourceFilename`, `workflowInstanceId`, `workflowName`,
`sha256`, and `workerCommit`. **Never a credential and never a row of data.**

## What makes a run fail

The Workflow fails closed and never reports success without a verified object.

**Permanent** (`NonRetryableError` — retrying cannot help, and retrying for hours
would only delay the owner finding out): missing configuration, a placeholder
identifier, a missing `D1_REST_API_TOKEN`, a rejected token (401/403), an unknown
database (404), any malformed API response, a missing bookmark or signed URL, a
download that is not SQL, a dump missing a kernel table, a truncated dump, a
zero-byte dump, a key that another Workflow instance already wrote, and any
verification failure after the write.

**Transient** (retried by the Workflow): network failures, 429, 5xx, an expired
signed URL, and "the export is not ready yet".

Retries are safe: the object key is decided once in step 1 and memoised, so a
retry re-uses the same key instead of scattering partial objects under new
timestamps.

## Tests

| Layer | Coverage |
| --- | --- |
| Unit (BACKUP-02) | `test/unit/backup/backup-health.test.ts` — every health branch, the tolerance and stalled thresholds, and that an unreadable state is never reported as healthy or failed. `test/unit/backup/run-records.test.ts` — key naming, validation, and that a failure message can only ever be one of the sentences we wrote. `test/unit/backup/backup-status-view.test.ts` — the application's boundary validator, the wording, decimal sizes, and owner-timezone formatting across both AEST and AEDT. `test/unit/settings/BackupsSection.test.tsx` — every state the surface can be in, the manual trigger, and that no restore/delete/import control exists. |
| Workers runtime (BACKUP-02) | `test/kernel/backup-service.test.ts` — status/history/trigger against a real R2 bucket: bounded history, refusal of a concurrent trigger, a stalled run NOT locking the owner out, and that no SQL or token can be returned. `test/kernel/settings-backups-route.test.ts` — the route fails closed without a session, forwards through the binding, degrades safely when the binding is missing or throwing, and strips anything the service should never have sent. |
| Unit | `test/unit/backup/object-key.test.ts` — UTC, sortability, determinism, tier prefixes, unsafe names. `test/unit/backup/d1-export.test.ts` — every malformed response shape, and permanent-vs-transient classification. `test/unit/backup/dump-validation.test.ts` — the structural rules, and **parity with `scripts/production-backup.mjs`**. `test/unit/backup/backup-configuration.test.ts` — placeholder refusal, and assertions over the real committed `wrangler.jsonc` (no route, no public origin, correct cron, no committed identifiers). |
| Workers runtime | `test/kernel/backup-workflow.test.ts` — the whole Workflow against a **real local R2 bucket**: the happy path, metadata, byte fidelity, tier selection, every failure mode storing nothing, retry idempotency, refusal to overwrite another instance's object, and that no token, signed URL or dump content reaches a log line or an error. |

No test performs a production export or needs Cloudflare credentials.
