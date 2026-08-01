# DEPLOYMENT.md — Deploying DalyHub V2 to Cloudflare Workers

> How DalyHub deploys, what has been validated without credentials, and exactly
> what is required to perform (and re-verify) a real deployment.
>
> Platform rationale: [ADR-008](../decisions/ARCHITECTURE_DECISIONS.md#adr-008-initial-application-platform-and-toolchain).
> Roadmap item: [FND-01](../roadmap/ROADMAP_V2.md#-fnd-01--repository--toolchain-scaffold).

---

## Verified production deployment (2026-07-18)

The first production deployment is **complete and verified** (FND-01 is
`☑ Done`). The verified facts:

| Item | Value |
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
| `/health` | returns the production health response (public) |
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

### Production migrations — the V2 upgrade

> **Superseded (2026-08-01).** This section previously carried a stack of
> per-PR notes, each written "as of this PR" and each describing a different
> pending migration gap (`0006`–`0008` for PROJ-05, then `0009` for AREA-02, and
> so on). Read together they no longer described any real deployment. The V2
> release closure replaced them with **one** statement of the actual upgrade.
> The per-release notes for `0023`, `0025`, NOTES-05 and X-04 above are kept
> because each records a genuine rollback/ordering property that is still true.

**The gap, stated once.** Production has migrations **`0001`–`0005`** applied
(verified 2026-07-18 — see [Verified production deployment](#verified-production-deployment-2026-07-18)).
The V2 release ships **`0025`**. So going live is a **twenty-migration step**,
`0006` through `0025`, over a database that already holds the owner's data.

**Every migration in that range is additive and existing-data-safe.** No column
changes type, gains a narrowing constraint, or is dropped; no row of any table that
exists at `0005` is rewritten. Three migrations (`0012`, `0015`, `0021`) do rebuild a
table with SQLite's copy-and-rename pattern, but only `task_details` and
`meeting_items` — tables that do not exist at the `0005` baseline and are therefore
empty at that point in the sequence.

**Exactly one migration in the range backfills anything:** `0008` creates a
`project_details` row (`status = 'active'`, `archived_at IS NULL`) for every
pre-existing, non-deleted Project. Everything else leaves existing records with no
detail row until their first edit, and the read boundary resolves the absence to
documented defaults.

**This is proven, not asserted.** [`test/kernel/migration-production-baseline.test.ts`](../../test/kernel/migration-production-baseline.test.ts)
applies `0001`–`0005` to an isolated D1, seeds a representative workspace through
every table that schema has — all four spine kinds, a completed task, a
soft-deleted record, an explicitly-unlinked EntityLink, and a two-subject Activity
event — then applies the **full committed sequence** over the top and asserts:

- no entity is lost and none is rewritten (`created_at`/`updated_at`/`title` intact);
- soft-deletion is preserved on exactly the row that carried it — nothing resurrected,
  nothing newly deleted;
- spine membership and completion survive;
- every link survives, **including the explicitly-unlinked one**, still unlinked;
- the Activity stream and its multi-subject associations survive;
- every V2 table the application queries unconditionally exists;
- the `0008` backfill ran, and the non-backfilling migrations did not invent rows;
- no orphan rows and no `foreign_key_check` violations;
- the upgrade invents no cross-workspace row.

The per-migration tests (`test/kernel/migration-000*.test.ts`) remain and still prove
each migration individually; this one proves the deployment.

**The required order, every time.**

1. **Back up** the production D1 database before touching it (`wrangler d1 export`,
   or the dashboard backup). This is the step that makes every later step
   reversible, and V2 has no in-app restore — see
   [`ROADMAP_V2_1.md → SET-02`](../roadmap/ROADMAP_V2_1.md#-set-02--backup--restore-v21).
2. **Preflight**: `pnpm run deploy:production:preflight` — credential-free
   validation, no upload.
3. **Migrate**: `wrangler d1 migrations apply dalyhub-v2 --env production --remote`
   (applies `0006`–`0025` in order).
4. **Verify** the migration list reports `0025` as applied.
5. **Deploy**: `pnpm run deploy:production` — only after step 4 passes.
6. **Smoke test**: `/health` returns `ok` with version `2.0.0`; the authenticated
   shell loads through Access; `/about` shows the same version.

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


### Verify

Wrangler prints the deployed URL (or your configured route). Verify by opening it
and checking:

- `GET /health` returns `{"status":"ok","name":"DalyHub","version":"2.0.0","environment":"production"}` (public).
  Since RELEASE-01 the `version` comes from the ONE version authority
  (`app/lib/version.ts`), the same value the in-app **About** screen shows — so a
  deployment check and the running application can never disagree about which build
  is live. A test pins the two together. The commit identifier is deliberately NOT in
  this payload; it is shown only on the authenticated About screen;
- the authenticated shell renders **through Cloudflare Access** (document title
  `DalyHub`, the owner email in the header) — a request to a protected route
  without a valid Access token must be rejected, not served.

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
  origin (rejected), plus public `/health`.

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
> [Production migrations — the V2 upgrade](#production-migrations--the-v2-upgrade)
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
| Theme persistence | Verified end to end | `e2e/themes.spec.ts` — selection, navigation, reload, and a fresh browser context reading the stored value |
| Mobile use | Verified | Phone navigation in light and dark, picker at 320 px, Help and About at 320 px, no horizontal overflow |
| Browser refresh | Verified | Reload re-applies the stored theme, from the first byte |
| Rollback | Straightforward, with one caveat | Rolling the Worker back to the previous release is safe with `0023` still applied: the old code never reads the column, and the column is nullable-with-default so its writes still succeed. **Do not roll the migration back** — dropping the column would discard owners' theme choices, and the old code does not need it gone |

### Deploying that milestone (superseded)

This four-step sequence applied when `0023` was the pending migration. It is
superseded by [Production migrations — the V2 upgrade](#production-migrations--the-v2-upgrade),
which covers the real `0006`–`0025` step and adds the backup as step 1.

### Optional: recording the build identifier

To have About show which commit is running, set `BUILD_COMMIT` as a production var
at deploy time (a full or short git SHA; anything else is ignored rather than
displayed). It is optional by design — every environment that does not set it says
"Not recorded", which is honest, and no environment is required to expose it.

## Current status

Deployment configuration is **valid** (`deploy:dry-run` passes) **and a real
production deployment has been performed and verified**:

- **Deployed URL:** <https://hub.daly.id.au>
- **Verified on:** 2026-07-18 — authenticated owner shell (through Cloudflare
  Access) and public `/health` confirmed; production Worker `dalyhub-v2-production`
  on the provisioned remote D1 database and workspace, migrations `0001`–`0005`
  applied; the direct `workers.dev` origin returns 404 and Preview URLs are
  disabled.

**Pending: the V2 release (`2.0.0`).** Production is still on the `0001`–`0005`
schema and the pre-V2 Worker. Deploying V2 is the twenty-migration step documented
in [Production migrations — the V2 upgrade](#production-migrations--the-v2-upgrade),
followed by `pnpm run deploy:production`. The exact copy-and-paste command block,
the preflight, and the post-deployment verification list are in
[`RELEASE_CHECKLIST_V2.md`](../release/RELEASE_CHECKLIST_V2.md).

FND-01 is `☑ Done` (see [ROADMAP_V2](../roadmap/ROADMAP_V2.md#-fnd-01--repository--toolchain-scaffold)).
Real production identifiers and secrets remain uncommitted.
