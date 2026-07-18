# DEPLOYMENT.md — Deploying DalyHub V2 to Cloudflare Workers

> How the FND-01 scaffold deploys, what has been validated without credentials,
> and exactly what is required to perform (and verify) a real deployment.
>
> Platform rationale: [ADR-008](../decisions/ARCHITECTURE_DECISIONS.md#adr-008-initial-application-platform-and-toolchain).
> Roadmap item: [FND-01](../roadmap/ROADMAP_V2.md#-fnd-01--repository--toolchain-scaffold).

---

## Target

DalyHub V2 deploys as a single **Cloudflare Worker** (`name: "dalyhub-v2"` in
[`wrangler.jsonc`](../../wrangler.jsonc)), serving the React Router app in SSR
mode with static client assets. No storage bindings (D1/KV/R2) are configured
yet — those are later roadmap decisions ([FND-02+](../roadmap/ROADMAP_V2.md#-fnd-02--data-kernel-entities--storage)).

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
   theme cookie is always `Secure`).
3. **Injects** the real remote D1 id and workspace id into the generated deploy
   config and refuses to upload if any placeholder survives.
4. **Sets the Access secrets** (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`,
   `OWNER_EMAIL`) on the production Worker via `wrangler secret`.
5. **Deploys.**

### Production migrations

Apply migrations to the remote production D1 before (or as part of) going live,
supplying the real database id so no placeholder is used:

```bash
wrangler d1 migrations apply dalyhub-v2 --env production --remote
```

(Set the real `database_id` in `env.production` locally, or apply against the
named remote database directly, before running this.)

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
and `OWNER_EMAIL` are supplied only via `wrangler secret` (set automatically by
`deploy:production` from the `PRODUCTION_ACCESS_*` / `PRODUCTION_OWNER_EMAIL`
environment variables) and are **not** declared as `vars` in `wrangler.jsonc`, so
a committed empty `var` can never override (clobber) the deploy-time secret.
Because `env.production` fixes `ENVIRONMENT=production`, the development
authenticator can never activate in production regardless of any other input.

### workers.dev / custom-domain origin bypass (must-do before going live)

Cloudflare Access protects the **configured Access hostname**. An unprotected
alternate origin — most importantly the default `*.workers.dev` route — would let
a client reach the Worker without an Access token and is a bypass to private
data. Because DalyHub also validates the JWT inside the Worker, such a request
still fails closed (503, no valid token) — but defence in depth requires closing
the origin too. Before a live deployment:

- protect the **custom hostname** with a Cloudflare Access policy restricted to
  the owner;
- **disable** (or otherwise secure) the default `*.workers.dev` route so it is not
  an unauthenticated entry point;
- confirm the Worker validates JWTs (issuer/AUD/owner) — as implemented here;
- apply D1 migrations before deployment;
- smoke-test **both** the protected hostname (authenticated shell) and the direct
  origin (rejected), plus public `/health`.

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

As of this scaffold, deployment configuration is **valid** (`deploy:dry-run`
passes) but **no real deployment has been performed**, because no Cloudflare
account/target/credentials are available in this environment. This is the single
remaining external verification item for FND-01; it stays `◐ In progress` until a
real deployment is verified and its URL recorded here.

<!-- Record the verified deployment here once performed:
- Deployed URL: <https://…>
- Verified on: <date> — foundation page + /health confirmed.
-->
