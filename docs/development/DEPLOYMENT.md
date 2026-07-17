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

- the foundation page renders (`DalyHub V2` heading, document title `DalyHub`);
- `GET /health` returns `{"status":"ok","name":"DalyHub", ...}`.

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
