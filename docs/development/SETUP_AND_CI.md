# SETUP_AND_CI.md — Local Setup & Continuous Integration

> How to get the DalyHub V2 app running locally and what CI checks every change.
> Platform rationale: [ADR-008](../decisions/ARCHITECTURE_DECISIONS.md#adr-008-initial-application-platform-and-toolchain).

---

## Prerequisites

- **Node.js 22+** (see [`.nvmrc`](../../.nvmrc)).
- **pnpm via Corepack** — no separate pnpm install needed; Corepack ships with
  Node and activates the version pinned in `package.json` (`packageManager`).

## First-time setup

```bash
corepack enable
pnpm install --frozen-lockfile
```

`pnpm install` runs a `postinstall` step (`wrangler types`) that generates
`worker-configuration.d.ts` (git-ignored) so type-checking works immediately.
No manual repair should be needed.

## Everyday commands

| Command               | What it does                                                        |
| --------------------- | ------------------------------------------------------------------- |
| `pnpm dev`            | Start the dev server (React Router + Workers runtime via Vite)      |
| `pnpm build`          | Production build (`build/client` + `build/server`)                  |
| `pnpm preview`        | Serve the built app locally in the Workers runtime (`vite preview`) |
| `pnpm lint`           | ESLint (flat config)                                                |
| `pnpm format`         | Apply Prettier formatting                                           |
| `pnpm format:check`   | Verify formatting without writing                                   |
| `pnpm typecheck`      | `wrangler types` + React Router typegen + `tsc -b`                  |
| `pnpm test`           | All tests: `test:unit` then `test:kernel`                           |
| `pnpm test:unit`      | DOM component/health tests (Vitest + React Testing Library)         |
| `pnpm test:kernel`    | Data-kernel unit + real D1 integration tests (Workers runtime)      |
| `pnpm test:e2e`       | Playwright Chromium E2E: smoke + per-component journeys + the DS-11 axe accessibility, responsive-overflow and keyboard regression gate (builds + previews automatically) |
| `pnpm db:migrate:local` | Apply D1 migrations to the local database (no credentials)        |
| `pnpm db:migrations:list:local` | List applied/pending local D1 migrations                  |
| `pnpm verify`         | The full local quality suite, in order (see below)                  |
| `pnpm cf-typegen`     | Regenerate Cloudflare `Env` types after editing `wrangler.jsonc`    |
| `pnpm deploy:dry-run` | Validate the deploy config/bundle without credentials               |
| `pnpm deploy:production:preflight` | Check production config is fully supplied (no upload)  |
| `pnpm deploy:production` | Guarded live production deploy (needs credentials + real config)  |

## `pnpm verify`

`pnpm verify` runs the complete local quality suite in a deterministic order —
the same meaningful checks CI runs:

```
format:check → lint → typecheck → test → build → test:e2e
```

A fresh contributor can run `corepack enable && pnpm install --frozen-lockfile
&& pnpm verify` and expect it to pass with no undocumented manual steps.

### Playwright browsers

`pnpm test:e2e` needs a Chromium build matching the installed Playwright
version. Locally, install it once with:

```bash
pnpm exec playwright install chromium
```

CI installs it explicitly (`playwright install --with-deps chromium`) so runs
are self-contained.

## Continuous Integration

CI is defined in [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)
and runs on pull requests and pushes to `main`. It:

1. checks out cleanly and installs with a **frozen lockfile**;
2. runs, as separate failing-on-error steps: **format check → lint → typecheck
   → unit/component tests → kernel integration tests (real Workers runtime + D1)
   → production build → Playwright E2E, accessibility & responsive regression**
   (the DS-11 axe WCAG 2.2 AA scans + 320px→ultra-wide overflow sweep + keyboard
   audit run in the same Playwright step);
3. caches the pnpm store (via `actions/setup-node`), and installs the Chromium
   browser explicitly for the E2E run.

The kernel integration step runs the data-kernel suite inside the real Workers
runtime with an isolated local D1 (Miniflare); it applies the committed
migrations to a fresh test database and uses **no** Cloudflare credentials or
remote database. It covers the FND-02 entity kernel **and** FND-03 workspace
isolation — including the sequential `0001 → 0002` migration over seeded data,
database-level foreign-key enforcement, the server-side context resolver, and
cross-workspace isolation of the scoped repository. No test skips for a missing
workspace or binding: the second (un-migrated) local D1 and the
`DEFAULT_WORKSPACE_ID` test value are provided by the pool config. See
[`DATA_KERNEL.md`](DATA_KERNEL.md).

Operational properties:

- **Concurrency:** superseded runs on the same ref are cancelled.
- **Least privilege:** the workflow declares `permissions: contents: read`.
- **No Cloudflare credentials** are required or used — CI never deploys.
- **Timeouts:** the job is bounded (15 minutes) so a hang fails rather than runs
  forever.
- On failure, the Playwright HTML report is uploaded as an artifact (traces and
  screenshots are retained only on failure).

Deployment is documented separately in [`DEPLOYMENT.md`](DEPLOYMENT.md).
