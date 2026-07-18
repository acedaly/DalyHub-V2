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

## What is validated without credentials

These run in CI and locally and require **no** Cloudflare account:

```bash
pnpm run build            # produces a Workers-valid build (build/server + build/client)
pnpm run deploy:dry-run   # build + `wrangler deploy --dry-run` — validates config & bundle
```

`deploy:dry-run` confirms Wrangler can parse the configuration, assemble the
Worker bundle and assets, and resolve bindings (currently only the non-secret
`ENVIRONMENT` var) — the strongest deployment validation possible without
uploading. It exits before any network upload.

## Performing a real deployment

A real deployment is **not** part of ordinary pull-request validation and is not
wired into CI in this PR (we do not expose a production environment from
untrusted PRs). To deploy manually once a target exists:

### Prerequisites

1. A Cloudflare account with Workers enabled.
2. An **API token** scoped for Workers deployment (the "Edit Cloudflare Workers"
   template is sufficient) — value for `CLOUDFLARE_API_TOKEN`.
3. Your **account ID** — value for `CLOUDFLARE_ACCOUNT_ID`.

### Deploy

```bash
export CLOUDFLARE_API_TOKEN=***
export CLOUDFLARE_ACCOUNT_ID=***
pnpm run deploy          # build + `wrangler deploy`
```

Wrangler prints the deployed `*.workers.dev` URL (or your configured route).
Verify by opening the URL and checking:

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

`AUTH_MODE` is the only auth value committed (as a `var`); it **fails closed** —
with no team domain/AUD/owner configured, the Worker rejects every protected
request rather than exposing data. `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` and
`OWNER_EMAIL` are supplied only via `wrangler secret` / dashboard bindings and
are **not** declared as `vars` in `wrangler.jsonc`, so a committed empty `var`
can never override (clobber) the deploy-time secret.

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
