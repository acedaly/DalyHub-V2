# DEPLOYMENT.md — Deploying DalyHub V2 to Cloudflare Workers

> How DalyHub deploys, what has been validated without credentials, and exactly
> what is required to perform (and re-verify) a real deployment.
>
> Platform rationale: [ADR-008](../decisions/ARCHITECTURE_DECISIONS.md#adr-008-initial-application-platform-and-toolchain).
> Roadmap item: [FND-01](../roadmap/ROADMAP_V2.md#-fnd-01--repository--toolchain-scaffold).

---

## What production IS — the one authoritative statement

Read this table first. Everything below it is either the procedure that
maintains one of these facts, or a dated historical record of how one of them
came to be true.

| Question | Answer | How you check it yourself |
| --- | --- | --- |
| What Worker is production? | `dalyhub-v2-production` (never `dalyhub-v2-production-production`) | `pnpm run verify:production` → *Worker deployment* |
| What hostname? | <https://hub.daly.id.au>, a **dashboard-managed** Custom Domain; Wrangler must never add or remove a route for it | Cloudflare dashboard |
| What D1 database? | the provisioned remote D1 named `dalyhub-v2`, whose UUID is supplied at run time as `CLOUDFLARE_D1_DATABASE_ID` and is **never committed** | `pnpm run db:production:list` |
| How is it protected? | **Cloudflare Access** over the whole hostname, owner-restricted. `*.workers.dev` and Preview URLs are disabled, so there is no unprotected origin | `pnpm run verify:production` |
| How is it configured? | `ENVIRONMENT` and `AUTH_MODE` are committed `var`s in `env.production`; `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` and `OWNER_EMAIL` are Worker **secrets** uploaded atomically with the code; AI keys are optional secrets | `pnpm run verify:production` → *Worker secrets* (NAMES only) |
| How are migrations applied? | `pnpm run db:production:apply`, a separate deliberate command. Deploying never migrates | `pnpm run db:production:list` |
| Which commands CHANGE production? | exactly two: `pnpm run deploy:production` and `pnpm run db:production:apply` | — |
| Which commands only INSPECT it? | `pnpm run verify:production`, `db:production:list`, `db:production:export`, `deploy:production:preflight`, `deploy:production:release-check`, `deploy:production:verify` | — |
| Why does `curl /health` not return JSON? | because Access protects the hostname and answers the unauthenticated request itself — see [`/health` under Cloudflare Access](#health-under-cloudflare-access) | `curl -sI https://hub.daly.id.au/health` |
| How do I identify the running build? | sign in and read **/about**, which shows the version and the deployed commit; `BUILD_COMMIT` is recorded by every deploy | — |

**Migration state on production is NOT asserted here**, because it cannot be
asserted from a repository. `pnpm run db:production:list` is the only honest
answer, and it needs the owner's credentials. See
[Production migrations](#production-migrations--the-committed-sequence).

## First production deployment (2026-07-18) — historical record

The first production deployment was completed and verified on 2026-07-18
(FND-01 is `☑ Done`). This is the record of THAT deployment, kept because it is
where the facts above were established; it is not a statement about what
production runs today.

| Item | Value at 2026-07-18 |
| --- | --- |
| Live hostname | <https://hub.daly.id.au> |
| Production Worker name | `dalyhub-v2-production` |
| Platform | Cloudflare Workers |
| Storage | production Cloudflare **D1** (the provisioned remote database) |
| Migrations applied | `0001`–`0005` |
| Workspace | a production workspace was provisioned |
| Custom hostname protection | **Cloudflare Access** (owner-restricted) |
| `*.workers.dev` origin | **disabled** (direct production URL returns 404) |
| Preview URLs | **disabled** |
| `/health` | reachable and reporting the production payload **from an authenticated context**. This row previously read "(public)", which was wrong — see the correction below |
| Authenticated owner shell | loads successfully through Access |

The **Custom Domain** for `hub.daly.id.au` is **managed through the Cloudflare
dashboard**. Wrangler must **not** add or remove a Worker route or Custom Domain
route for it — the committed configuration deliberately declares none (see
[origin hardening](#workersdev--preview-urls--custom-domain-origin-hardening)).

Real production identifiers (account ID, D1 database ID, workspace ID, Access AUD
/ team domain, owner email) and all secrets remain **uncommitted** — they are
supplied only at deploy time.

## Target

DalyHub V2 deploys as a single **Cloudflare Worker**. The committed
[`wrangler.jsonc`](../../wrangler.jsonc) top-level config is the LOCAL/development
environment (`name: "dalyhub-v2"`); the named `env.production` environment
flattens at build time to the production Worker **`dalyhub-v2-production`**. It
serves the React Router app in SSR mode with static client assets, backed by
**Cloudflare D1** (the data kernel store, [FND-02+](../roadmap/ROADMAP_V2.md#-fnd-02--data-kernel-entities--storage)); local work uses Miniflare's
local SQLite and production uses the provisioned remote D1 database.

## Two clearly distinct flows: local dry-run vs live production

DalyHub has exactly two deploy entry points, and they are deliberately different:

| Command | Environment | Credentials | Uploads? | Used by |
| --- | --- | --- | --- | --- |
| `pnpm run deploy:dry-run` | LOCAL (top-level config) | none | **no** | CI + local |
| `pnpm run deploy:production` | `env.production` | required | yes (guarded) | owner only |

There is no bare `pnpm run deploy`: a single command that could deploy the
top-level LOCAL configuration (with its placeholder D1 id and
`ENVIRONMENT=development`) to production was the exact footgun this structure
removes.

### Local dry-run (`deploy:dry-run`) — credential-free, CI-safe

Runs in CI and locally and requires **no** Cloudflare account:

```bash
pnpm run build            # produces a Workers-valid build (build/server + build/client)
pnpm run deploy:dry-run   # build + `wrangler deploy --dry-run` — validates config & bundle
```

`deploy:dry-run` confirms Wrangler can parse the (LOCAL) configuration, assemble
the Worker bundle and assets, and resolve bindings — the strongest deployment
validation possible without uploading. It exits before any network upload and
never touches production.

## Performing a live production deployment (`deploy:production`)

A real deployment is **not** part of ordinary pull-request validation and is not
wired into CI (we do not expose a production environment from untrusted PRs). It
is the owner's action, driven by the named `env.production` Wrangler environment
and the guarded `pnpm run deploy:production` (`scripts/deploy-production.mjs`).

The committed `wrangler.jsonc` holds **no** real production identifiers — only
placeholders — so the deploy script **fails before any upload** unless the real
values are supplied at deploy time. This means a production deploy can never
silently ship a local placeholder, and no personal or provisioned identifier is
ever committed.

### Prerequisites

1. A Cloudflare account with Workers enabled, and a provisioned remote D1
   database (`wrangler d1 create dalyhub-v2` → note its **UUID**).
2. A provisioned workspace row and its `crypto.randomUUID()` **id**
   (see [`DATA_KERNEL.md`](DATA_KERNEL.md)).
3. A configured Cloudflare Access application protecting the custom hostname
   (team domain, AUD tag, owner email).
4. An **API token** scoped for Workers deployment (`CLOUDFLARE_API_TOKEN`) and
   your **account ID** (`CLOUDFLARE_ACCOUNT_ID`).

### Supply the real values (never committed) and deploy

```bash
export CLOUDFLARE_API_TOKEN=***
export CLOUDFLARE_ACCOUNT_ID=***

# Real production configuration — supplied here, never committed to wrangler.jsonc:
export CLOUDFLARE_D1_DATABASE_ID=<the provisioned remote D1 UUID>
export PRODUCTION_DEFAULT_WORKSPACE_ID=<the provisioned workspace UUID>
export PRODUCTION_ACCESS_TEAM_DOMAIN=https://<your-team>.cloudflareaccess.com
export PRODUCTION_ACCESS_AUD=<the Access application AUD tag>
export PRODUCTION_OWNER_EMAIL=<the owner email>

pnpm run deploy:production
```

`deploy:production` then, in order:

1. **Preflight (before any upload).** Verifies `env.production` commits
   `ENVIRONMENT=production` and `AUTH_MODE=cloudflare-access` (never
   `development`) and no private values, and that every real value above is
   supplied and well-formed. Any gap exits non-zero here — nothing is built or
   uploaded. Run just this step any time with `pnpm run deploy:production:preflight`.
1.5. **Release preflight (V2.0.1 — before any build).** Refuses to continue when
   the repository or production state is not what a release should ship. See
   [Release preflight](#release-preflight-overrides-and-post-deploy-verification-v201).
2. **Builds** the Worker for production (`CLOUDFLARE_ENV=production`), which
   forces `ENVIRONMENT=production` (so development auth cannot activate and the
   theme cookie is always `Secure`) and produces the **flattened**
   `build/server/wrangler.json`. The Cloudflare Vite plugin applies the named
   production environment **exactly once** here, so the generated config already
   carries the final Worker name `dalyhub-v2-production` and
   `workers_dev`/`preview_urls` set to `false`.
3. **Reads, validates and finalises** the generated config: it confirms the final
   Worker name is `dalyhub-v2-production` (never `dalyhub-v2-production-production`)
   and that the origin-hardening flags survived flattening, injects the real remote
   D1 id and workspace id, and refuses to upload if any placeholder survives.
4. **Deploys once, atomically.** It runs a single `wrangler deploy` that targets
   the flattened top-level config with `--env=""` (never `--env production`, and
   with `CLOUDFLARE_ENV` cleared) — so the environment is not applied a second time
   — and uploads the Access secrets (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`,
   `OWNER_EMAIL`) **atomically with the Worker code** via a single, securely-created
   temporary `--secrets-file` (owner-only permissions, created outside the
   repository, deleted in a `finally` on success or failure; values are never
   printed). No standalone `wrangler secret put` runs, so no secrets-only Worker is
   ever created before the real code.

> **Why `--env=""` matters.** The first deployment attempt created a Worker named
> `dalyhub-v2-production-production`: the generated config already had the final
> name `dalyhub-v2-production`, but the deploy was still invoked with
> `CLOUDFLARE_ENV=production`, so Wrangler applied the `production` environment a
> **second** time and appended `-production` again. Deploying the flattened config
> with `--env=""` (and `CLOUDFLARE_ENV` cleared) targets the already-final
> top-level config, so the name can only ever be `dalyhub-v2-production`. This is
> validated by the deploy guard and its tests (`test/unit/deploy/`).

### Release preflight, overrides and post-deploy verification (V2.0.1)

`deploy:production` now guards the **repository and production state**, not just
the configuration. Before anything is built, it refuses to continue when:

- the **git working tree is dirty**;
- the **current branch is not `main`**;
- **local HEAD does not match `origin/main`** (after a real `git fetch`, so the
  comparison is against the remote as it is now);
- the release commit does **not** have a **successful `CI Gate`** check run on
  GitHub (red, cancelled, still running and missing all refuse; verifying a
  private repository needs a read-only `GITHUB_TOKEN` in the environment — an
  unverifiable gate refuses rather than passing blind);
- production has **pending D1 migrations** that have not been explicitly
  acknowledged.

The three states are deliberately distinct and stay distinct: **checking** for
pending migrations (part of this preflight, read-only), **applying** them
(`pnpm run db:production:apply`, a separate deliberate command), and
**deploying the Worker**. Running the deploy never applies a migration.

Each refusal has exactly one explicit, narrowly-named override flag, logged
loudly when used — there is no `--force`:

| Flag | Exactly what it bypasses |
| --- | --- |
| `--allow-dirty-tree` | The clean-working-tree check only. |
| `--allow-non-main` | The branch-is-main and HEAD-equals-origin/main checks (deploying any ref other than pushed `main` is one decision). |
| `--skip-ci-check` | The CI Gate verification only — for when CI has been verified green by hand. |
| `--acknowledge-pending-migrations` | The pending-migrations refusal only. Records that the listed migrations were reviewed and are ready; it does **not** apply them. |

Run the release checks on their own (no build, no upload) with
`pnpm run deploy:production:release-check`.

**After a successful upload, the deploy probes production health.** It fetches
`/health` with redirects disabled and reports one of three outcomes — see
[`/health` under Cloudflare Access](#health-under-cloudflare-access) for why
there are three rather than two. When the application answers it requires
`status: "ok"`, `name: "DalyHub"`, `environment: "production"` and `version`
exactly equal to the release being deployed (`package.json`, pinned to
`app/lib/version.ts` by test); build identity is asserted only if a `commit`
field is present, which on the public payload it deliberately is not. A real
health failure exits non-zero and says so plainly — the Worker is live but
wrong. An **Access challenge** does not fail the deploy, and does not count as a
verification either: the deploy prints that the running release was not
confirmed from there and points at `/about`. Run the probe on its own at any
time with `pnpm run deploy:production:verify`, or as part of the full read-only
sweep with `pnpm run verify:production`. Covered by
`test/unit/deploy/release-preflight.test.ts` with every external command and
request injected — no real git remote, GitHub API, database or Worker is
touched by tests.

### Automated production backups to R2 (BACKUP-01)

A separate Cloudflare Worker, **`dalyhub-v2-backup`**, hosts the
**`dalyhub-production-backup`** Workflow, which exports the production D1
database to the private R2 bucket **`dalyhub-v2-backups`** nightly at
**16:00 UTC** (02:00 AEST / 03:00 AEDT — Cloudflare cron schedules are UTC).

It is deliberately NOT part of `dalyhub-v2-production`: it has no route, no
custom domain, no `workers.dev` origin and no D1 binding, and it shares nothing
with the application Worker but the database it reads. A backup that stops
working because a UI change was deployed is not a backup.

The schedule is the backup Worker's **own Cron Trigger**, whose `scheduled()`
handler creates one Workflow instance per firing. Native `schedules` on the
Workflow binding was the intended form but requires a **paid Workers plan**;
Cron Triggers are free-tier and the backup logic is identical either way. The
CAL-01 calendar cron on `dalyhub-v2-production` is untouched — two Workers, two
triggers, no shared handler.

Full architecture, configuration and retention:
[`infra/backup/README.md`](../../infra/backup/README.md). Recovery procedures:
[`BACKUP_AND_RESTORE.md` §5](BACKUP_AND_RESTORE.md#5-catastrophic-d1-recovery).

- **Retention** is enforced by R2 lifecycle rules, not by code: 90 days for
  `production/daily/`, 365 days for `production/manual/`.
- **The secret** is `D1_REST_API_TOKEN` on the backup Worker — a dedicated token
  whose only permission is **Account → D1 → Edit** (`D1 Read` is insufficient;
  the export endpoint is a POST). Never committed, never logged, never reused
  from another token.
- **Seeing that it worked (BACKUP-02).** `Settings → This app → Backups` shows
  backup health in the app and offers a manual backup. It reaches the backup
  Worker through the `BACKUP_SERVICE` **service binding** declared in
  `env.production` — the application Worker has no R2 binding and no export
  token, and the backup Worker's status API is a named `WorkerEntrypoint` with no
  URL. The binding is production-only: local development has no such Worker, and
  its absence renders as "status unavailable", so `wrangler dev` and the
  credential-free dry-run are unaffected. **Deploy `dalyhub-v2-backup` before
  `dalyhub-v2-production`** the first time, so the entrypoint exists when the
  binding is created. As of BACKUP-02's admission-race fix, `backup:deploy` also
  applies the backup Worker's `BackupAdmissionGate` Durable Object migration; run
  it before relying on manual/scheduled backup admission in production.
- **Setup and everyday commands:**

  ```sh
  pnpm run backup:provision   # private bucket + lifecycle rules (needs R2 enabled)
  pnpm run backup:secret      # set D1_REST_API_TOKEN interactively
  pnpm run backup:deploy      # deploy the Worker + scheduled Workflow
  pnpm run backup:verify      # assert the live schedule, bindings and privacy
  pnpm run backup:status      # inspect the latest Workflow run
  ```

#### Optional pre-deployment backup

**Ordinary deploys are deliberately NOT coupled to this.** `deploy:production`
does not wait on a Workflow, and making every application deploy block on a
nightly backup job would trade a reliable deploy for an unreliable one.

But before a release that **applies a migration** — anything in the "production
migrations" sequence below — take one by hand. The whole point of the 365-day
manual tier is that this backup is still there long after the incident:

```sh
source .production.env

pnpm run db:production:backup          # → production/manual/, kept 365 days
pnpm run backup:status                 # wait for "complete"
pnpm run db:production:backup:list     # confirm the object exists, non-zero

pnpm run db:production:apply           # migrations
pnpm run deploy:production             # application
pnpm run verify:production             # verification
```

Do not run the deploy until the backup has reported complete and the object has
been listed. "The command returned" is not the same claim as "there is a backup".

### Automated production backups to GitHub (V2.0.1, encrypted in V2.1 — AUDIT-11)

This runs **in addition to** the R2 backup above, and that is deliberate: the two
live in different trust boundaries, so a Cloudflare-side disaster does not take
the GitHub copy with it, and vice versa. See
[`BACKUP_AND_RESTORE.md` §1](BACKUP_AND_RESTORE.md#1-the-three-backups-and-which-one-to-use).

`.github/workflows/production-backup.yml` exports the production D1 database on
a schedule, through the SAME audited wrapper the manual release steps use
(`pnpm run db:production:export` → `scripts/production-d1.mjs`), and **encrypts
it on the runner before it becomes an artifact**.

> **Which backup is which.** This artifact is the **infrastructure
> disaster-recovery copy** — a raw D1 SQL dump that rebuilds the DATABASE. The
> **canonical DalyHub backup** is the owner-initiated archive from Settings →
> Privacy & data, and that is the one SET-02 restores in-app and the one to reach
> for in ordinary recovery. Full recovery procedures, including the recovery-key
> model and rotation, are in
> [`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md).

- **What the artifact contains.** `dalyhub-v2-production-<UTC stamp>.sql.gpg`
  (GnuPG symmetric AES-256) and `metadata.json` (sizes, SHA-256 of both the
  ciphertext and the plaintext, run identity, and the decrypt command). **No
  plaintext dump, and no key.**
- **Where backups appear.** GitHub → Actions → *Production D1 backup* → the
  run's artifact, named
  `dalyhub-v2-production-d1-<UTC timestamp>-<short commit>`.
- **Schedule.** Daily at 16:30 UTC (02:30 Australia/Sydney — a quiet hour so
  the export is coherent). **Manual runs** any time via *Run workflow*
  (`workflow_dispatch`), through the identical pipeline: there is no separate,
  weaker manual path.
- **Retention.** **30 days**, deliberately unchanged by the move to encryption —
  the reasoning is recorded beside the value in the workflow and in
  [`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md#7-retention). Anything the
  owner wants longer-term is a DalyHub backup they download and keep themselves.
- **The recovery key.** `BACKUP_ENCRYPTION_PASSPHRASE`, in the protected
  `production` GitHub environment. **The owner must also hold a copy off
  GitHub** — without it these artifacts are unreadable by anyone, including the
  owner. Rotation keeps the previous key until the last artifact encrypted with
  it has expired. See
  [`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md#6-the-recovery-key).
- **Failure is visible, and recovery is proved every night.** The job fails
  before the database is read if no encryption key is configured; it fails if the
  dump is empty, missing kernel tables or truncated mid-statement; it decrypts
  its own artifact back and compares SHA-256 with the original; and a final guard
  refuses to upload if the artifact directory holds anything unencrypted or the
  metadata names a credential field. The plaintext lives only in a scratch
  directory removed by a trap that runs even on failure, and no log line ever
  carries backup contents.
- **Credentials** come from the `production` environment
  (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
  `CLOUDFLARE_D1_DATABASE_ID`, `BACKUP_ENCRYPTION_PASSPHRASE`), are never
  printed, and never reach a command line. No export is ever committed.
- **Restoring from it** is a deliberate, documented, owner-initiated procedure —
  see [`BACKUP_AND_RESTORE.md` §5](BACKUP_AND_RESTORE.md#5-catastrophic-d1-recovery).
  CI never performs a destructive production restore.

### ASSET-02 (migration `0025`) — deployment notes

`0025_asset_history_and_obligations.sql` is **purely additive and
existing-data-safe**:

- three `ALTER TABLE asset_details ADD COLUMN` (the current meter reading), each
  nullable with no default backfill;
- two new tables (`asset_events`, `asset_obligations`) and their indexes.

No existing column changes type, gains a constraint or is rewritten, and there is
no backfill step. The consequences for a deployment:

- **Migrate-then-deploy and deploy-then-migrate are both safe.** The previous
  application version ignores the new columns and tables entirely, so applying
  `0025` ahead of the deploy leaves production working unchanged.
- **Rolling back the APPLICATION with the migration still applied is safe.** The
  prior version never reads `asset_events`, `asset_obligations` or the meter
  columns. Nothing needs to be un-migrated, and nothing should be: the migration
  sequence is forward-only.
- **No new bindings, secrets, environment variables or external services.** Assets
  history and obligations run entirely on the existing D1 binding.
- **No scheduler, cron trigger or queue is introduced.** Obligation urgency is
  computed at READ time, which is precisely why none is needed.

### PWA / offline (migration `0027`) — deployment notes

`0027_create_offline_capture_receipts.sql` is **purely additive and
existing-data-safe**: one new table plus one index. No existing table is
rebuilt, no column is added to an existing table, and no existing row is read
or rewritten.

The table exists solely to make a replayed OFFLINE capture idempotent, so it is
written only when a device replays a queued capture. A deployment that never
sees an offline capture never writes a row.

- **Migrate-then-deploy and deploy-then-migrate are both safe.** The previous
  application version does not know the table exists, so applying `0027` ahead
  of the deploy leaves production working unchanged. Deploying the application
  first is also safe with one honest caveat: until the migration is applied, a
  REPLAYED offline capture fails (the create route's claim insert errors) and
  the capture stays queued on the device with its reason. Nothing is lost and
  nothing is duplicated — but prefer migrate-then-deploy so no owner sees it.
- **Rolling back the APPLICATION with the migration applied is safe.** The prior
  version never reads the table. Nothing needs to be un-migrated.
- **No new bindings, secrets, environment variables or external services.** The
  offline milestone runs entirely on the existing D1 binding.
- **No scheduler, cron trigger or queue.** Sync is driven by the device.
- **The service worker is the one part that outlives a rollback.** Deploying a
  previous release does not remove an installed worker from a device: it keeps
  serving its cached shell assets. Rolling the PWA back therefore also means
  unregistering it — see
  [`PWA_AND_OFFLINE.md` → Rollback](PWA_AND_OFFLINE.md#rollback).

### NOTES-05 knowledge completion — deployment notes (no migration)

The Notes knowledge completion (`dalyhub://` record links, backlink
presentation, autosave reconciliation, copy/print) adds **no migration at all**.
The migration sequence is unchanged at `0025`.

That is a design outcome, not luck: a record link reconciles into the existing
`note.references` EntityLink type, so the relationship model needed nothing new;
the reconciliation contract is client state on an existing shared hook; and the
print view is rendered on demand from the Markdown already stored. Adding schema
for presentational convenience is exactly what the completion brief forbids.

Consequences for a deployment:

- **Nothing to migrate, in either order.** Deploy the application whenever; there
  is no schema step to sequence around.
- **Rolling the application back is safe.** No data written by this version is
  unreadable by the previous one — a record link is ordinary Markdown text in a
  column that already held Markdown, and its relationship row is an ordinary
  `note.references` link the previous version already reads and renders.
- **Notes written with record links stay valid on an older build.** The link
  simply renders as inert text again (which is precisely the behaviour this work
  fixed), rather than breaking the note.
- **No new bindings, secrets, environment variables, external services, cron
  triggers or queues.** The one new server capability is an extra `op` on the
  existing `/links` route.

### X-04 workspace export — deployment notes (no migration)

The full workspace export (structured archive + Obsidian vault) adds **no
migration**. The migration sequence is unchanged at `0025`.

That is a design outcome, not luck: the export is a READ over tables that already
exist, and every ordering it pages by is already served by an existing key — the
detail tables' composite primary keys, `entities`' primary key, and
`activities_workspace_occurred_idx` for the chronological Activity read. Adding an
index for a rare, deliberate, owner-initiated read would be write amplification on
every ordinary mutation to save time on an action taken a handful of times a year.

Consequences for a deployment:

- **Nothing to migrate, in either order.** Deploy whenever; there is no schema
  step to sequence around.
- **Rolling the application back is safe.** The export writes nothing — the
  snapshot repository has no mutating method — so a previous version reads
  exactly the same data it did before.
- **No new bindings, secrets, environment variables, external services, cron
  triggers, queues or R2 buckets.** Nothing is persisted on the Worker and
  nothing is sent anywhere. The two new routes are ordinary authenticated
  resource routes behind the existing Access boundary.
- **No new dependency.** The ZIP writer is first-party (`app/platform/export/zip.ts`)
  and uses only platform primitives; `THIRD_PARTY_NOTICES.md` is unchanged.

**Worker runtime characteristics worth knowing before the first production
export.** The snapshot is assembled in memory and the archive is built from it,
so an export's peak memory is roughly the workspace's text content plus the
compressed archive. Both are bounded: 50,000 rows per collection and 64 MiB of
archive content, and exceeding either produces an honest error rather than an
isolate the runtime kills. A realistic personal workspace is orders of magnitude
below both. Compression uses the runtime's own `CompressionStream("deflate-raw")`,
feature-detected — a runtime without it produces a larger but perfectly valid
STORED archive. There is no request-duration concern to plan around: the export is
a read of a fixed, small number of statements, not a scan.

**Verifying an export against production, after deploying.** Sign in, open
`Settings → Privacy & data`, take both downloads, then — with no DalyHub
involved — confirm the archive is intact:

```bash
unzip -q dalyhub-export-*.zip -d /tmp/dalyhub-export
cd /tmp/dalyhub-export && sha256sum -c CHECKSUMS.txt
jq '.meta, .workspace' dalyhub-snapshot.json
jq '.recordsByModule' manifest.json
```

Then extract the vault and open `DalyHub Export/` as a folder in Obsidian. If
`Home.md` renders and its links navigate, the export is good. Delete both files
from any shared machine afterwards: they contain the whole workspace.

### Production migrations — the committed sequence

> **Corrected 2026-08-11 (HARDEN-01).** This section stated a fixed migration
> number three times, in three places, and all three had drifted: the prose said
> the sequence ended at `0027`, the ordered procedure below said `0035`, and the
> "Current status" section said production ran `0001`–`0025`. A document that
> answers "how far does the schema go?" three different ways cannot be used to
> plan a deployment, so it no longer answers it at all — because a repository
> cannot know what a database has applied.
>
> The section before that carried a stack of per-PR notes, each written "as of
> this PR"; the V2 release closure replaced them with one statement. The
> per-release notes for `0023`, `0025`, NOTES-05 and X-04 above are kept because
> each records a genuine rollback/ordering property that is still true.

**The committed sequence is whatever is in [`migrations/`](../../migrations),
and that is the only number this document will state.** Count it with
`ls migrations | wc -l`; the newest file is the head of the sequence. Hard-coding
it here creates a fourth place to forget to update.

**What production has applied is a question only production can answer:**

```bash
pnpm run db:production:list      # names the UNAPPLIED migrations; empty output means up to date
```

That command needs the owner's `CLOUDFLARE_D1_DATABASE_ID` and Cloudflare
credentials, so it cannot be run from CI or from a contributor's checkout, and
**no statement in this repository should be read as evidence that a migration is
applied.** `pnpm run verify:production` runs the same check as part of its
read-only sweep and reports `SKIPPED` rather than a pass when it cannot.

The last direct observation on record is `0001`–`0005` at the first deployment
(2026-07-18), plus the V2 upgrade performed in 2026-08 — see
[Current status](#current-status). Neither is a substitute for running the
command.

**Every migration from `0006` onward is additive and existing-data-safe.** No
column
changes type, gains a narrowing constraint, or is dropped; no row of any table that
exists at `0005` is rewritten. Three migrations (`0012`, `0015`, `0021`) do rebuild a
table with SQLite's copy-and-rename pattern, but only `task_details` and
`meeting_items` — tables that do not exist at the `0005` baseline and are therefore
empty at that point in the sequence.

**Exactly two migrations in the range backfill anything, and they behave
differently:**

- **`0008`** creates a `project_details` row (`status = 'active'`,
  `archived_at IS NULL`) for every pre-existing **non-deleted** Project.
- **`0011`** creates a `diary_entry_details` row for every pre-existing `diary`
  entity, with deliberate defaults — `entry_type = 'note'`, no body,
  `occurred_at = the entity's own created_at` (the only truthful chronology signal
  a legacy row has), `timezone = 'UTC'`, `source_channel = 'manual'`. **Unlike
  `0008` it has no `deleted_at` filter**, so a soft-deleted entry is backfilled
  too. That is correct: a restored entry must still have a place on the Timeline.

Everything else leaves existing records with no detail row until their first edit,
and the read boundary resolves the absence to documented defaults.

**This is proven, not asserted.** [`test/kernel/migration-production-baseline.test.ts`](../../test/kernel/migration-production-baseline.test.ts)
applies `0001`–`0005` to an isolated D1, seeds a representative workspace through
every table that schema has — all four spine kinds, a completed task, a
soft-deleted record, a legacy diary entity and a soft-deleted one, an
explicitly-unlinked EntityLink, and a two-subject Activity event — then applies the
**full committed sequence** over the top and asserts:

- no entity is lost and none is rewritten (`created_at`/`updated_at`/`title` intact);
- soft-deletion is preserved on exactly the row that carried it — nothing resurrected,
  nothing newly deleted;
- spine membership and completion survive;
- every link survives, **including the explicitly-unlinked one**, still unlinked;
- the Activity stream and its multi-subject associations survive;
- every V2 table the application queries unconditionally exists;
- **both** backfills ran and each ran correctly — the `0008` project rows, and the
  `0011` diary rows with their exact documented defaults including the soft-deleted
  entry — and the non-backfilling migrations invented no rows;
- no orphan rows and no `foreign_key_check` violations;
- the upgrade invents no cross-workspace row.

The per-migration tests (`test/kernel/migration-000*.test.ts`) remain and still prove
each migration individually; this one proves the deployment.

**The required order, every time.**

1. **Back up** the production D1 database before touching it:
   `pnpm run db:production:export -- --output <file>` (or the dashboard backup).
   This is the step that makes every later step reversible. Take a **DalyHub
   backup** too (Settings → Privacy & data → *Download full DalyHub export*):
   that is the copy DalyHub can restore in-app, and the SQL dump is the
   lower-level fallback. Both are covered by
   [`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md).
2. **Preflight**: `pnpm run deploy:production:preflight` — credential-free
   validation, no upload.
3. **Look before you apply**: `pnpm run db:production:list` names exactly what is
   pending. The sequence is forward-only and every migration in it is additive
   (see above), but reading what is about to run is the whole point of keeping
   this a deliberate, separate command.
4. **Migrate**: `pnpm run db:production:apply` — applies every pending migration
   in order.
5. **Verify the schema**: `pnpm run db:production:list` reports **no pending
   migrations**.
6. **Deploy**: `pnpm run deploy:production` — only after step 5 passes.
7. **Verify the deployment**: `pnpm run verify:production`, then sign in and
   check `/about` shows the release version and the expected commit. Do **not**
   expect an unauthenticated `curl /health` to return JSON — see
   [`/health` under Cloudflare Access](#health-under-cloudflare-access).
8. **Identity check (IDENT-01, after any deploy that includes migration 0028)**:
   sign in once so the request boundary provisions membership, then run the
   read-only report and repair as documented in
   [`IDENTITY_AND_ACTORS.md`](IDENTITY_AND_ACTORS.md):

   ```bash
   # Dry run — writes nothing, reports counts by method and anything unresolved.
   CLOUDFLARE_D1_DATABASE_ID=<uuid> node scripts/repair-activity-identity.mjs \
     --workspace <DEFAULT_WORKSPACE_ID>

   # Apply the additive identity repair for historical events.
   CLOUDFLARE_D1_DATABASE_ID=<uuid> node scripts/repair-activity-identity.mjs \
     --workspace <DEFAULT_WORKSPACE_ID> --owner-email <OWNER_EMAIL> --apply

   # Name the owner (or link their Person record so the name follows the profile).
   CLOUDFLARE_D1_DATABASE_ID=<uuid> node scripts/repair-activity-identity.mjs \
     --workspace <DEFAULT_WORKSPACE_ID> --subject <access-sub> \
     --display-name "Aidan Daly" --apply
   ```

   The repair writes only `workspace_members`, is idempotent (re-running it is a
   no-op), and creates, deletes or rewrites no Activity row. Confirm with a final
   dry run that it reports zero planned statements and `Unresolved: none`.

**Use `pnpm run db:production:*`, not `wrangler d1 ... --env production`.** The raw
Wrangler command resolves the database NAME through the committed config, whose
production `database_id` is a placeholder by design — `--env` selects an
environment, it does not supply an id, and exporting `CLOUDFLARE_D1_DATABASE_ID`
does not change what Wrangler reads, so the raw command targets the placeholder.
Earlier guidance here asked the owner to set the real `database_id` in
`env.production` locally before running it, which is precisely how a real
identifier gets committed by accident.

[`scripts/production-d1.mjs`](../../scripts/production-d1.mjs) instead does what the
deploy orchestrator already does: it validates `CLOUDFLARE_D1_DATABASE_ID` is a real
UUID (refusing both committed placeholders **by name**), writes a temporary
top-level config carrying it **outside the repository** with owner-only permissions,
runs Wrangler against that config, and deletes it in a `finally` — on success or
failure. Nothing real is ever written into a tracked file. Use it for any other
production D1 command too: `node scripts/production-d1.mjs d1 info dalyhub-v2`.
Verified by `test/unit/deploy/production-d1.test.ts`.

> **Fixed in V2.0.1 — until then, both migration commands were broken.** That
> temporary config set `migrations_dir` to the RELATIVE string `"migrations"`,
> and Wrangler resolves a relative `migrations_dir` against the directory holding
> the **config file** — which is deliberately the OS temp directory, outside the
> repository. So it pointed at `/tmp/dalyhub-d1-XXXX/migrations`, which never
> exists: Wrangler exited 1 with `No migrations present at /tmp/…/migrations`,
> and **`pnpm run db:production:list` and `db:production:apply` could not work as
> documented**. The config now carries an absolute repository path. Verified
> empirically against the pinned Wrangler (4.112.0) — relative: exit 1 with that
> message; absolute: the full `0001`–`0025` list, exit 0 — and held by a test
> that resolves the emitted value the way Wrangler does, because a test with an
> injected command runner cannot catch a path bug.
>
> If you applied the V2 migrations some other way (the dashboard, or a hand-built
> config), that is why. `pnpm run db:production:list` is now the honest check.

**Migrate before deploy, not after.** The application queries the detail tables
unconditionally (`project_details`, `goal_details`, `task_details`, `note_details`,
`person_details`, `meeting_details`, `asset_details`, `review_details`,
`owner_app_preferences`, `task_saved_views` and the ASSET-02 child tables), so a V2
Worker against a `0005` database errors. The reverse order is safe: the previous
Worker ignores every table and column `0006`–`0025` adds, so a migrated database
serving the old code keeps working — which is what makes step 3 independently
reversible by rolling the *application* back.

**Do not roll a migration back.** The sequence is forward-only. Dropping
`0023`'s `theme` column would discard the owner's theme choice, and the older code
does not need it gone. If the application must be rolled back, roll back the Worker
and leave the schema where it is.


### Verifying a deployment

Run the one read-only verifier:

```bash
pnpm run verify:production
```

It checks configuration presence (names, never values), the Worker's most recent
deployment, the secret NAMES set on the Worker, the D1 migration state and the
`/health` response class — and it **never** deploys, migrates, writes a secret,
prints a secret value or bypasses Cloudflare Access. A check it cannot run
reports `SKIPPED`, never a pass, and the summary line says `VERIFIED`,
`PARTIALLY VERIFIED` or `NOT VERIFIED` so an operator reads the state rather
than an exit code.

Then finish, as the owner, the two things no unauthenticated command can do:

- the authenticated shell renders **through Cloudflare Access** (document title
  `DalyHub`, the owner email in the header) — a request to a protected route
  without a valid Access token must be rejected, not served;
- **/about** shows the version and the deployed commit. This is the
  authoritative answer to "which build is live". Since RELEASE-01 the version
  comes from the ONE version authority (`app/lib/version.ts`), the same value
  `/health` reports, so the deployment check and the running application cannot
  disagree; a test pins the two together, and `BUILD_COMMIT` is recorded by
  every deploy.

### `/health` under Cloudflare Access

**An unauthenticated `curl https://hub.daly.id.au/health` returns `302` to the
Cloudflare Access login, not the JSON payload. That is correct, and it is not a
misconfiguration.**

This document, the deploy script and the
[end-to-end audit's §19 checklist](../product/END_TO_END_AUDIT_2026_08_05.md)
all previously said the opposite — "`/health` is public by design, so an Access
redirect means the endpoint is misconfigured". That claim could not be true of
this deployment and was never tested against it. Access protects the **whole
hostname**, which is precisely the
[origin hardening](#workersdev--preview-urls--custom-domain-origin-hardening)
the rest of this document exists to enforce: there is no unprotected origin, so
there is no unauthenticated path to `/health` either. Under the old rule
`deploy:production` would have ended every successful deployment with a failed
health assertion.

Three states, kept distinct because collapsing them is what produced the false
rule:

| What you observe | What it means |
| --- | --- |
| `302` to `…cloudflareaccess.com/cdn-cgi/access/login/…`, or `401`/`403` | Access is protecting the hostname — the intended configuration. The Worker was **not asked**, so the running release is **NOT verified** by this probe |
| `200` with `{"status":"ok","name":"DalyHub","environment":"production","version":"<release>"}` | the application answered and reports this release. This is the only observation that proves WHICH build is live |
| anything else — `5xx`, a non-JSON body, a wrong name/environment/version | a real failure. `deploy:production` exits non-zero |

So **"the Worker was successfully deployed" and "an unauthenticated curl to
`/health` returned 200" are different claims**, and only the first is available
without credentials. `wrangler deploy`'s own output is the evidence for the
upload; `/about` behind Access is the evidence for the running build.

Two ways to make the payload assertable when you want it:

- **A Cloudflare Access service token.** Set
  `PRODUCTION_ACCESS_SERVICE_TOKEN_ID` and
  `PRODUCTION_ACCESS_SERVICE_TOKEN_SECRET`; the deploy's health assertion and
  `verify:production` send them as `CF-Access-Client-Id` /
  `CF-Access-Client-Secret`. This is the documented machine path THROUGH
  Access, not around it — the policy is unchanged for everyone else.
- **An Access bypass policy for `/health`,** if you ever decide the endpoint
  should genuinely be public. Then set `PRODUCTION_HEALTH_REQUIRE_PUBLIC=1`, and
  an Access challenge becomes a failure again — because at that point it would
  mean the bypass policy is missing.

The commit identifier is deliberately absent from the `/health` payload even
when it is reachable: it is shown only on the authenticated About screen.

## Authentication & Access configuration (FND-09)

DalyHub authenticates every protected request by validating the Cloudflare Access
application token in the Worker (see
[`APP_SHELL_AUTH.md`](APP_SHELL_AUTH.md) and
[ADR-016](../decisions/ARCHITECTURE_DECISIONS.md#adr-016-cloudflare-access-identity-app-shell-and-registry-driven-routing)).
A real deployment must set these as Worker configuration (via `wrangler secret` /
dashboard bindings — **never** committed to `wrangler.jsonc` with real values):

| Value                | Purpose                                                        |
| -------------------- | -------------------------------------------------------------- |
| `AUTH_MODE`          | `cloudflare-access` in production (the committed non-secret default). |
| `ACCESS_TEAM_DOMAIN` | `https://<team>.cloudflareaccess.com` — the token issuer/JWKS. Secret/binding. |
| `ACCESS_AUD`         | The Access application Audience (AUD) tag. Secret/binding. |
| `OWNER_EMAIL`        | The single owner; enforced independently of the Access policy. Secret/binding. |

`AUTH_MODE` is the only auth value committed (as a `var`, in both the top-level
LOCAL config and `env.production`, pinned to `cloudflare-access`); it **fails
closed** — with no team domain/AUD/owner configured, the Worker rejects every
protected request rather than exposing data. `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`
and `OWNER_EMAIL` are supplied as Worker secrets **atomically with the deploy**
(`deploy:production` writes them to a single temporary `--secrets-file` from the
`PRODUCTION_ACCESS_*` / `PRODUCTION_OWNER_EMAIL` environment variables) and are
**not** declared as `vars` in `wrangler.jsonc`, so a committed empty `var` can
never override (clobber) the deploy-time secret. Because `env.production` fixes
`ENVIRONMENT=production`, the development authenticator can never activate in
production regardless of any other input.

### workers.dev / Preview URLs / custom-domain origin hardening

Cloudflare Access protects the **configured Access hostname**. An unprotected
alternate origin — most importantly the default `*.workers.dev` route or a
Cloudflare Preview URL — would let a client reach the Worker without an Access
token and is a bypass to private data. Because DalyHub also validates the JWT
inside the Worker, such a request still fails closed (503, no valid token) — but
defence in depth requires closing the origin too.

The named `env.production` config therefore commits `"workers_dev": false` and
`"preview_urls": false`; the Cloudflare Vite build flattens both into
`build/server/wrangler.json`, and `deploy:production` refuses to upload if either
is not `false`. **This is verified in production (2026-07-18):** the direct
`workers.dev` production URL is disabled and returns 404, and Preview URLs are
disabled. The **Custom Domain** for `hub.daly.id.au` is **dashboard-managed** —
the committed config declares **no** Worker route or Custom Domain route for it,
and Wrangler must never add or remove one.

The going-live checklist (all satisfied for the verified deployment):

- protect the **custom hostname** with a Cloudflare Access policy restricted to
  the owner;
- keep the default `*.workers.dev` route and Preview URLs **disabled** (committed
  in `env.production`);
- confirm the Worker validates JWTs (issuer/AUD/owner) — as implemented here;
- apply D1 migrations before deployment;
- smoke-test **both** the protected hostname (authenticated shell) and the direct
  origin (rejected). `/health` on the protected hostname answers with the Access
  challenge, which is the point of the hardening rather than a gap — see
  [`/health` under Cloudflare Access](#health-under-cloudflare-access).

### Authenticating Wrangler: OAuth vs API token

- **Manual owner deployments** may authenticate Wrangler interactively through
  **OAuth** (`wrangler login`), which stores the credential in the OS keychain
  (e.g. the **macOS Keychain**). This is the appropriate path for the owner
  running `pnpm run deploy:production` from their own machine — no API token need
  ever be written to disk.
- **Headless / CI deployment** should use a scoped **API token**
  (`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`), which is the appropriate
  approach where no interactive login is possible.

### If you later add a deploy workflow

Should a deployment workflow be added, store the two values above as **GitHub
Actions repository secrets** (`Settings → Secrets and variables → Actions`):

| Secret                  | Purpose                                  |
| ----------------------- | ---------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Authenticates `wrangler deploy`          |
| `CLOUDFLARE_ACCOUNT_ID` | Selects the Cloudflare account to deploy |

Restrict deployment to trusted triggers (e.g. pushes to `main` or manual
`workflow_dispatch` with an environment protection rule) — never run a deploy
using these secrets from an untrusted pull request.


## V2 Final Polish release audit (2026-07-31)

> **Historical.** This is the audit taken at the V2 Final Polish milestone, when
> `0023` was the newest migration. It is kept because each row records a property
> that is still true of that change. **For the V2 release itself, use
> [Production migrations](#production-migrations--the-committed-sequence)
> and [`RELEASE_CHECKLIST_V2.md`](../release/RELEASE_CHECKLIST_V2.md).**

The release check performed for the **V2 Final Polish & Release Readiness**
milestone. Recorded here so the next deployment starts from a known state rather
than from memory.

| Area | State | Evidence |
|---|---|---|
| Migrations | Ready. One new migration, `0023_add_owner_theme_preference.sql` | Additive `ALTER TABLE … ADD COLUMN theme TEXT NOT NULL DEFAULT 'system'` with a CHECK over the six legal values. No table rebuilt, no row rewritten, no existing preference touched. Verified against a fresh database and against a populated one in `test/kernel/app-preferences.test.ts` |
| Migration ordering | Safe | `0023` is strictly after `0022` and depends only on the table `0017` created. It can be applied before or after the Worker deploy: the application reads the column defensively and a row without it degrades to `system` |
| Production build | Green | `pnpm run build` |
| Bundle impact | +3.8 KB gzip CSS, +10 KB gzip JS vs `main` | Measured by building both revisions. Five themes cost no per-theme stylesheet, no runtime theme computation and no new dependency |
| Environment handling | Unchanged | `ENVIRONMENT` is still the only switch; `BUILD_COMMIT` is a NEW **optional** var. Absent everywhere today, and About says "Not recorded" rather than inventing one |
| Version display | One authority | `app/lib/version.ts`, read by `/health` and `/about` |
| Health endpoint | Extended, still public and secret-free | Adds `version`; exposes no commit, no bindings, no identifiers |
| Authentication entry | Unchanged | No change to the Worker boundary, Access configuration or session handling |
| Navigation | One new row (`About`) | Registry-driven; appears automatically, hideable in Settings → Navigation like any optional module |
| Empty production database | Safe | A fresh owner has no preference row, so `theme` resolves to `system` from `DEFAULT_APP_PREFERENCES` — no row is written until they choose |
| Populated production database | Safe | Existing owners keep every preference and default to `system`, which is exactly the appearance they already had |
| Appearance | Follows the operating system | M3-01 removed the theme feature (ADR-074). `prefers-color-scheme` is the only input; the Playwright suite emulates both schemes rather than storing a preference |
| Mobile use | Verified | Phone navigation in light and dark, picker at 320 px, Help and About at 320 px, no horizontal overflow |
| Browser refresh | Verified | Reload re-applies the stored theme, from the first byte |
| Rollback | Straightforward, with one caveat | Rolling the Worker back to the previous release is safe with `0023` still applied: the old code never reads the column, and the column is nullable-with-default so its writes still succeed. **Do not roll the migration back** — dropping the column would discard owners' theme choices, and the old code does not need it gone |

### Deploying that milestone (superseded)

This four-step sequence applied when `0023` was the pending migration. It is
superseded by [Production migrations](#production-migrations--the-committed-sequence),
which covers the real `0006`–`0025` step and adds the backup as step 1.

### Recording the build identifier

**Since the V2 release closure, `deploy:production` records it for you.** The
deploy defaults `BUILD_COMMIT` from `git rev-parse HEAD` in the checkout it is
deploying from, normalises it to a short hash, and injects it as a production var
in the generated config — so **About shows exactly which commit is live**, and the
answer to "is production running what I think it is?" is on screen rather than
inferred.

The rules, and why each is what it is:

- **An explicit `BUILD_COMMIT` wins.** Export one to record something other than
  the local `HEAD` (a CI build, a tag's commit).
- **A malformed value FAILS preflight** rather than being silently dropped. The
  renderer (`app/lib/version.ts`) drops a bad value at display time, which is right
  for a page; at deploy time it is wrong, because a typo would ship a build that
  quietly claims to record nothing. Loud here, quiet there — and both use the same
  7-40-hex rule, so a value that passes the guard is a value About will show.
- **It stays optional.** A non-git checkout, or a `git` that fails, records none
  and the deploy proceeds; About then says "Not recorded", which is honest. Recording
  the commit is a convenience, never a gate.
- **No var is written when there is none** — absent, not an empty string, so About
  never has to guess whether a blank value was deliberate.

The deploy prints which identifier it is shipping before it uploads. Verified by
`test/unit/deploy/production-deploy-flow.test.ts` and
`test/unit/deploy/production-preflight.test.ts`.

## Current status

Deployment configuration is **valid**: `pnpm run deploy:dry-run` passes, and CI
runs `wrangler deploy --dry-run` against the generated production config on
every change, so a broken binding or a malformed config is a red build rather
than a surprise at deploy time.

**What has been directly OBSERVED about the live environment, and when:**

| Observation | Date | By |
| --- | --- | --- |
| Worker `dalyhub-v2-production` live on <https://hub.daly.id.au>; authenticated owner shell loads through Access; `workers.dev` returns 404 and Preview URLs disabled; D1 at `0001`–`0005` | 2026-07-18 | owner, at the first deployment |
| The V2 Worker deployed and the V2 migration upgrade performed | 2026-08 | owner |
| An unauthenticated `GET /health` answers `302` to the Cloudflare Access login — i.e. Access is protecting the hostname, and the endpoint is **not** publicly readable | 2026-08-11 | HARDEN-01, from an unauthenticated network |

**What has NOT been verified from this repository, and remains owner action:**

- which release the running Worker reports (read `/about` through Access);
- which migrations production has applied (`pnpm run db:production:list`);
- which secret names are set on the Worker (`pnpm run verify:production`).

`pnpm run verify:production` performs all three when it has credentials, and
reports `SKIPPED` — never a pass — when it does not. **A statement in this
repository is not evidence about production.** The distinction that matters:
*documentation corrected* and *production verified* are different claims, and
only the first is in a pull request's power to make.

FND-01 is `☑ Done` (see [ROADMAP_V2](../roadmap/ROADMAP_V2.md#-fnd-01--repository--toolchain-scaffold)).
Real production identifiers and secrets remain uncommitted.


## AI secrets and the AI preflight (AI-01, 2026-08-05)

DalyHub deploys perfectly well with **no AI configuration at all** — AI disabled
or unconfigured is a fully supported production state, and the preflight treats it
as one. What the preflight refuses is an INCONSISTENT set.

| Secret | Purpose | Required? |
|---|---|---|
| `ANTHROPIC_API_KEY` | enables Anthropic | optional |
| `OPENAI_API_KEY` | enables OpenAI | optional |
| `AI_GATEWAY_ACCOUNT_ID` | Cloudflare account id | optional, with `AI_GATEWAY_ID` |
| `AI_GATEWAY_ID` | Cloudflare AI Gateway id | optional, with the account id |
| `AI_GATEWAY_TOKEN` | authenticated Gateway | optional |

All are supplied with `wrangler secret put` and are deliberately **not** declared
in `wrangler.jsonc`: a committed `var` of the same name — even an empty one —
would override the deploy-time secret and clobber it, which is the same rule
already recorded for the Cloudflare Access values. They are declared for
TypeScript in `app/platform/ai/ai-bindings.d.ts`.

**They survive an ordinary deploy.** `pnpm run deploy:production` uploads only the
three Access secrets, via `wrangler deploy --secrets-file`. Wrangler documents
that flag as "Existing secrets not included in the file are preserved from the
previous version", and states that "Secrets are never deleted by a deployment"
(Wrangler commands reference, read 2026-08-05). So an AI key set once with
`wrangler secret put` stays set, and does not need re-supplying on every release.

`scripts/deploy-production.mjs` refuses to upload when:

- any AI binding appears as a committed `env.production.vars` entry;
- `AI_GATEWAY_ACCOUNT_ID` is set without `AI_GATEWAY_ID`, or the reverse;
- `AI_GATEWAY_TOKEN` is set without a gateway;
- a Gateway is configured with no provider key (DalyHub uses bring-your-own-keys).

No secret VALUE is ever read, echoed or printed by the preflight. OAuth-authenticated
Wrangler deployment is unchanged, and `pnpm run deploy:dry-run` still needs no
credentials.

Full contract: [`AI_PLATFORM.md`](AI_PLATFORM.md) §5.

---

## External capture configuration (CAPTURE-01, 2026-08-11)

DalyHub deploys perfectly well with **no capture configuration at all**. The HTTP
capture endpoint needs none: it is authenticated by scoped `dhcap_` tokens the
owner creates in **Settings → Capture**, and those live in D1 as digests rather
than as deployment values. Email capture is a separate, opt-in surface.

| Secret | Purpose | Required? |
|---|---|---|
| `CAPTURE_EMAIL_RECIPIENTS` | the capture address(es) Email Routing delivers to this Worker | optional; email capture is OFF without it |
| `CAPTURE_EMAIL_ALLOWED_SENDERS` | the address(es) permitted to write into DalyHub by email | optional; email capture is OFF without it |

Both are supplied with `wrangler secret put` and, like the Access and AI values,
are deliberately **not** declared in `wrangler.jsonc` — a committed `var` of the
same name would override the deploy-time secret. Email capture requires BOTH: a
half-configured deployment accepts nothing, which is the correct default for a
feature that writes into someone's life when it is on. Neither address is
hard-coded anywhere in application logic.

**The one required Cloudflare-side step.** Cloudflare Access intercepts requests to
`hub.daly.id.au` *before* the Worker runs, and an Apple Shortcut has no browser
with which to complete an Access challenge. On the Access application protecting
the Custom Domain, add a **Bypass** policy scoped to the path `/api/capture`.
Without it, every capture is answered with a login redirect the Shortcut cannot
follow; with it, authentication for that one path is DalyHub's own scoped capture
token, which is exactly what CAPTURE-01 exists to provide. The full rationale,
the policy shape and a `curl` verification are in
[`UNIVERSAL_CAPTURE.md` §7](UNIVERSAL_CAPTURE.md#7-deployment-configuration).

**Email Routing.** To enable email capture, add the capture address in the
Cloudflare dashboard under **Email → Email Routing** and route it to **Send to a
Worker → dalyhub-v2**. The Worker's `email` handler is inert until both that
routing and the two secrets above exist, so adding the handler changed nothing for
a deployment that does not want it.

---

## External calendar configuration (CAL-01, 2026-08-12)

DalyHub deploys perfectly well with **no calendar configuration at all**: the
Calendars section says encrypted storage is not configured and refuses to store a
link, the scheduled refresh is a no-op, and every other part of the product is
unaffected.

### The one secret

| Secret | Purpose | Required? |
|---|---|---|
| `APP_ENCRYPTION_KEY` | the application encryption key protecting owner-configured third-party credentials — today, external calendar feed URLs | required to connect a calendar; optional otherwise |

A published ICS link **is** a credential: anyone holding it can read that
calendar. It is also the first value DalyHub has that is both a secret AND
owner-supplied data the server must be able to recover — the owner adds several
and removes them, so it has to live in D1, and the synchroniser has to fetch the
exact URL, so a one-way digest (the way capture tokens are stored) is not an
option. It is therefore sealed with AES-256-GCM under this key, bound to its
workspace by the AEAD additional data, before it is stored.

**Generate and set it:**

```bash
# 32 random bytes, base64. Any equivalent CSPRNG output is fine.
openssl rand -base64 32

# Set it once. It survives ordinary deploys (see the AI section above for why).
pnpm exec wrangler secret put APP_ENCRYPTION_KEY --env production
```

Like the Access and AI values it is deliberately **not** declared in
`wrangler.jsonc` — a committed `var` of the same name, even an empty one, would
override the deploy-time secret and clobber it. It is read through an optional
config shape (`CalendarSecretsEnv`), so it need not appear in the generated `Env`
type.

**If it is ever changed or lost**, stored calendar links can no longer be opened:
those sources report a configuration error and the owner re-adds each calendar.
Nothing else in DalyHub is encrypted with it, so no other data is at risk. There
is deliberately no rotation mechanism — see
[`CAL_01_UNIFIED_EXTERNAL_SCHEDULE_2026_08.md` §5](../product/CAL_01_UNIFIED_EXTERNAL_SCHEDULE_2026_08.md#5-encryption-strategy).

**Never commit a real value.** `.dev.vars` is git-ignored;
`.dev.vars.example` documents the shape only.

### The cron trigger

The background refresh runs on the Worker's own **Cloudflare Cron Trigger** —
the same Worker, the same D1 binding, no new service to provision:

```jsonc
"triggers": { "crons": ["*/15 * * * *"] }
```

It is declared **twice** in `wrangler.jsonc`: once at the top level (local
development) and once inside `env.production`, because triggers — like bindings
and `vars` — are **not inherited by named environments**. Omitting the production
copy would deploy production with no calendar refresh at all.

The handler is inert unless a calendar source exists, and it never throws: a
failed tick costs one tick, and the next is fifteen minutes away.

**Local development.** `wrangler dev` does not fire crons automatically. Run one
on demand with:

```bash
curl "http://localhost:5173/cdn-cgi/handler/scheduled"
```

or use **Settings → Calendars → Refresh now**, which is the ordinary owner path.
No developer ever needs a real external feed: the Workers-runtime tests drive the
whole fetch/parse/reconcile path against synthetic ICS fixtures
(`test/support/ics-fixtures.ts`), and the browser journeys run against a seeded
projection (`e2e/calendar-fixtures.ts`).

### Outbound requests

This is the first DalyHub feature that makes the Worker issue outbound HTTP
requests to an owner-supplied address. If the deployment sits behind an egress
policy, calendar hosts must be reachable over HTTPS on port 443. DalyHub itself
refuses loopback, private, CGNAT, link-local, unique-local, multicast and reserved
targets, non-standard ports, plain `http:`, credentials in the URL, unbounded
redirects and oversized bodies — see
[`CAL_01_UNIFIED_EXTERNAL_SCHEDULE_2026_08.md` §6](../product/CAL_01_UNIFIED_EXTERNAL_SCHEDULE_2026_08.md#6-ssrf-protections).

---

## Notification configuration (NOTIFY-01, 2026-08-16)

DalyHub deploys perfectly well with **no notification configuration at all**.
Notifications are off until the owner turns them on in Settings, the scheduled
tick is a no-op until then, and nothing here is required for the rest of the
product.

### The one optional value

| Value | Purpose | Required? |
|---|---|---|
| `APP_PUBLIC_ORIGIN` | the deployment's public `https` origin (e.g. `https://hub.example.com`), used ONLY to turn a notification's in-application path into a link a Pushover message can open | optional — without it a push still arrives, simply with no tappable link |

Set it as an environment variable at deploy time, not as a committed `var`:

```bash
pnpm exec wrangler secret put APP_PUBLIC_ORIGIN --env production
```

It is not a secret in the cryptographic sense — it is the address anyone visiting
DalyHub already types — but it is a private operational detail of this
deployment, so it follows the same rule as the Access values and the capture
addresses: never committed, read through an optional config shape (`PushoverEnv`),
absent from the generated `Env` type. It must be `https`; anything else is ignored
and the link is simply omitted.

### The Pushover credentials are NOT deployment configuration

They are the OWNER's, and they live in D1 (`notification_settings`), set from
`Settings → Notifications`. That is a deliberate decision rather than an
oversight: they identify the owner's Pushover account and their own DalyHub
application registration, they change when the owner changes them, and putting
them behind `wrangler secret` would make "turn on notifications" a deploy. See
[ADR-099 decision 6](../decisions/ARCHITECTURE_DECISIONS.md#adr-099-notifications-are-events-in-a-ledger-not-a-second-attention-model--insert-before-send-a-channel-contract-and-secrets-in-the-settings-store)
for the trade and [DEBT-146](../product/PRODUCT_DEBT.md) for the uniformity it
costs against the calendar feed URL's sealed storage.

### Outbound network

The notification tick reaches exactly one host, `api.pushover.net`, over HTTPS on
port 443, and only when the owner has enabled and validated that channel. There is
no configurable base URL, so nothing the owner types can point DalyHub at another
host.

### The cron

There is none to add. The tick runs on CAL-01's existing `*/15 * * * *` trigger,
declared in both the top-level and `env.production` blocks of `wrangler.jsonc`.

---

## Response security headers, and the one Cloudflare owns (AUDIT-10, 2026-08-08)

Every response the Worker emits carries its security headers from ONE place,
`app/platform/request/security-headers.ts`, applied at the request boundary. No
route sets a security header of its own, and there is no per-route CSP fragment
anywhere. The full policy and the evidence behind each source are documented in
[`APP_SHELL_AUTH.md → Security headers`](APP_SHELL_AUTH.md#security-headers-rewritten-by-audit-10-2026-08-08).

Two operational notes for whoever configures the Cloudflare side:

- **`Strict-Transport-Security` is deliberately NOT set by the Worker.** HSTS
  belongs to the edge that terminates TLS for the Access hostname, and it is the
  one header whose failure mode — a wrong `max-age`, an accidental `preload` — is
  measured in months of unreachability rather than minutes. Configure it in the
  Cloudflare dashboard for `hub.daly.id.au`, and keep it there: two authorities
  for that header is one too many. If a Cloudflare Transform Rule is ever added
  that sets `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy` or `Cross-Origin-Opener-Policy`, it will CONTRADICT the
  Worker rather than reinforce it — the Worker's CSP names a per-response nonce
  that no edge rule can know, and a second, nonce-less policy would stop the
  application booting. Do not add one.
- **Static assets do not pass through the Worker.** `build/server/wrangler.json`
  serves `build/client` from Cloudflare's asset handler ahead of the Worker, so
  `/assets/*`, `/icons/*`, `/fonts/*`, `/sw.js`, the manifest and the favicon do
  not receive these headers. They are still behind Cloudflare Access like every
  other path on the hostname, and none of them is an HTML document, so the CSP
  has nothing to govern there. The documents that matter — every page the browser
  parses — are rendered by the Worker and do carry it.
