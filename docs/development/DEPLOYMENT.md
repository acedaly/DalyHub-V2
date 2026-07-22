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

### Production migrations

Apply migrations to the remote production D1 before (or as part of) going live,
supplying the real database id so no placeholder is used:

```bash
wrangler d1 migrations apply dalyhub-v2 --env production --remote
```

(Set the real `database_id` in `env.production` locally, or apply against the
named remote database directly, before running this.)

> **⚠ Production migration gap (as of this PR).** Production has migrations
> `0001`–`0005` applied (see [Verified production deployment](#verified-production-deployment-2026-07-18)
> above); migrations `0006`, `0007` and `0008` (including this PR's PROJ-05
> `project_details` table) have **NOT** been applied to production yet. **Do not
> deploy this PR's Worker code to production before applying `0006`–`0008`** —
> `d1-project-repository.ts` and `d1-project-settings-repository.ts` query the
> `project_details` table unconditionally, and the Worker will error against a
> database that doesn't yet have it. The required order, every time:
> 1. **Backup** the production D1 database (`wrangler d1 export` or the
>    dashboard's backup) before touching it.
> 2. **Migrate**: `wrangler d1 migrations apply dalyhub-v2 --env production --remote`
>    (applies `0006`–`0008` in order; each migration in this repo is additive and
>    existing-data-safe — see the migration-specific integration tests in
>    `test/kernel/migration-000*.test.ts`).
> 3. **Verify**: confirm `project_details` exists (`STRICT`, FK, CHECK
>    constraints) and that every pre-existing, non-deleted Project has a
>    backfilled row (`status = 'active'`, `archived_at IS NULL`) — the exact
>    assertions `test/kernel/migration-0008.test.ts` makes, re-run manually
>    against the real database if desired.
> 4. **Deploy** the Worker (`pnpm run deploy:production`) — only after step 3
>    passes.
> 5. **Smoke test**: open `/projects`, confirm existing Projects still load with
>    no archived/status regressions, and that `/health` still returns `ok`.
>
> This corrective PR does **not** perform any of these steps and does **not**
> mutate the production database — they remain the owner's manual action.

### Verify

Wrangler prints the deployed URL (or your configured route). Verify by opening it
and checking:

- `GET /health` returns `{"status":"ok","name":"DalyHub", ...}` (public);
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

## Current status

Deployment configuration is **valid** (`deploy:dry-run` passes) **and a real
production deployment has been performed and verified**:

- **Deployed URL:** <https://hub.daly.id.au>
- **Verified on:** 2026-07-18 — authenticated owner shell (through Cloudflare
  Access) and public `/health` confirmed; production Worker `dalyhub-v2-production`
  on the provisioned remote D1 database and workspace, migrations `0001`–`0005`
  applied; the direct `workers.dev` origin returns 404 and Preview URLs are
  disabled.

FND-01 is `☑ Done` (see [ROADMAP_V2](../roadmap/ROADMAP_V2.md#-fnd-01--repository--toolchain-scaffold)).
Real production identifiers and secrets remain uncommitted.
