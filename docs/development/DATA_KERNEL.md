# DATA_KERNEL.md — Working with the Entity Kernel & D1

> How to run migrations, test, and inspect the data kernel locally, and how a
> real Cloudflare D1 database is eventually provisioned.
>
> Decision & rationale: [ADR-009](../decisions/ARCHITECTURE_DECISIONS.md#adr-009-data-kernel-storage) (storage) · [ADR-010](../decisions/ARCHITECTURE_DECISIONS.md#adr-010-server-side-workspace-context) (workspace context).
> Roadmap items: [FND-02](../roadmap/ROADMAP_V2.md#-fnd-02--data-kernel-entities--storage) (entities) · [FND-03](../roadmap/ROADMAP_V2.md#-fnd-03--workspace-isolation) (workspace isolation).
> Architecture: [`ARCHITECTURE_OVERVIEW.md`](../architecture/ARCHITECTURE_OVERVIEW.md#entity-storage-the-kernel-contract-and-its-d1-adapter).

---

## What the kernel is

The entity kernel is the uniform record substrate every DalyHub entity builds
on. It is split into a storage-independent contract and a D1 adapter:

| Layer | Location | Responsibility |
| ----- | -------- | -------------- |
| Entity contract | `app/kernel/entities/` | Typed `EntityRecord`, inputs, domain errors, the workspace-bound `EntityRepository` interface, validation and cursor logic. No D1/Cloudflare types. |
| Workspace kernel | `app/kernel/workspaces/` | Branded `WorkspaceId`, `WorkspaceRecord`, `WorkspaceContext`, the `WorkspaceContextResolver` interface and the low-level `WorkspaceRepository` contract. No D1/Cloudflare types. |
| D1 adapter | `app/platform/storage/d1/` | Implements the contracts over prepared, parameterised D1 statements; converts rows ⇄ domain records. The only place SQL lives. |
| Composition | `app/platform/workspaces/` | The server-side `environment → resolver → WorkspaceContext → scoped repository` boundary (`resolveWorkspaceScope`). |
| Schema | `migrations/` | Committed, sequential D1 SQL migrations. |

Modules depend on the **contract** (`~/kernel/entities`) and receive a
**workspace-scoped** repository from the composition boundary
(`resolveWorkspaceScope(env)` in `~/platform/workspaces`) — never on D1 directly,
and never by constructing scope themselves.

The base `entities` table carries only the shared record header (`id`,
`workspace_id`, `type`, `title`, `created_at`, `updated_at`, `deleted_at`), and
its `workspace_id` has an enforced foreign key to the `workspaces` table
([FND-03](../roadmap/ROADMAP_V2.md#-fnd-03--workspace-isolation)).
**Domain-specific fields belong to future domain tables, not here.**

## Local development needs no Cloudflare account

Local dev and tests use Miniflare's **local SQLite**, keyed by the `DB` binding
name, stored under `.wrangler/state` (git-ignored). No `CLOUDFLARE_API_TOKEN`,
no account, no remote database. The `database_id` in `wrangler.jsonc` is an
explicit placeholder and is ignored locally.

## Applying local migrations

```bash
pnpm run db:migrations:list:local   # show which migrations are applied locally
pnpm run db:migrate:local           # apply pending migrations to the local D1
```

Both wrap `wrangler d1 migrations … DB --local` and touch **only** local
storage. There is intentionally **no** one-command production reset script.

Migration `0002_create_workspaces_and_enforce_scope.sql` ([FND-03](../roadmap/ROADMAP_V2.md#-fnd-03--workspace-isolation))
creates the `workspaces` table, back-fills a workspace for every distinct
existing `entities.workspace_id`, and rebuilds `entities` with a foreign key to
`workspaces (id)` using `ON DELETE RESTRICT`. It preserves all existing entity
rows unchanged. The Workers Vitest integration applies it automatically; apply
it to your local database with `pnpm run db:migrate:local`.

## Workspace isolation (FND-03)

Workspace is DalyHub's top-level isolation and security boundary
([ADR-003](../decisions/ARCHITECTURE_DECISIONS.md#adr-003-workspace-isolation) /
[ADR-010](../decisions/ARCHITECTURE_DECISIONS.md#adr-010-server-side-workspace-context)).
Modules never choose a workspace: they receive a repository already bound to a
`WorkspaceContext` resolved server-side.

### Setting `DEFAULT_WORKSPACE_ID`

The single-user context resolver reads a trusted `DEFAULT_WORKSPACE_ID` binding
(a Worker `var`, **not** a secret and **never** a request value). A clearly
non-production local default (`local-dev-workspace`) is set in `wrangler.jsonc`
and mirrored in `.dev.vars.example`. A real deployment provisions a workspace
and sets its `crypto.randomUUID()` id here — no production id is committed.

### Creating a local workspace

The resolver **fails closed** if the configured workspace does not exist, and it
never auto-creates one. On a fresh local database (no entities yet) there is no
workspace, so create the one your `DEFAULT_WORKSPACE_ID` points at once:

```bash
pnpm exec wrangler d1 execute DB --local --command \
  "INSERT INTO workspaces (id, created_at, updated_at) \
   VALUES ('local-dev-workspace', '2026-07-17T00:00:00.000Z', '2026-07-17T00:00:00.000Z')"
```

(Programmatically, the low-level `createWorkspaceRepository(env.DB).create({ id })`
does the same — it is a bootstrap concern, not a module-facing API.)

### Verifying foreign keys

```bash
# The FK is declared with ON DELETE RESTRICT.
pnpm exec wrangler d1 execute DB --local --command "PRAGMA foreign_key_list(entities)"

# Foreign keys are enforced by the runtime (returns 1).
pnpm exec wrangler d1 execute DB --local --command "PRAGMA foreign_keys"

# An entity referencing a non-existent workspace is rejected by the database.
pnpm exec wrangler d1 execute DB --local --command \
  "INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at) \
   VALUES ('x', 'no-such-workspace', 'task', 't', '2026-07-17T00:00:00.000Z', '2026-07-17T00:00:00.000Z')"
# → fails: FOREIGN KEY constraint failed
```

### Using workspace-scoped repositories

Server code obtains a scoped repository through the composition boundary:

```ts
import { resolveWorkspaceScope } from "~/platform/workspaces";

// environment → resolver → WorkspaceContext → workspace-scoped EntityRepository
const { context, entities } = await resolveWorkspaceScope(env);

await entities.create({ type: "task", title: "Buy milk" }); // scoped automatically
await entities.list(); // only this workspace's entities
```

Note the entity methods take **no `workspaceId`** — the scope comes from
`context`. `resolveWorkspaceScope` throws a typed workspace error if the
configured workspace is missing, invalid or does not exist.

### Why modules must never accept workspace scope from user input

Workspace scope is a **security boundary**, so it is resolved only from trusted
server-side state. The resolver's `resolve()` deliberately **takes no request
argument**: a header, cookie, query string, route parameter, form field or JSON
body can never select or override the workspace. If module code accepted a
`workspaceId` from a request, a client could read or write another workspace's
data — the classic broken-access-control flaw. Binding scope at repository
construction makes cross-workspace access *unrepresentable* in module code
rather than merely discouraged. See
[ADR-010](../decisions/ARCHITECTURE_DECISIONS.md#adr-010-server-side-workspace-context).

## Running the kernel tests

```bash
pnpm run test:kernel    # kernel unit + D1 integration tests (Workers runtime)
pnpm run test:unit      # the DOM component/health tests
pnpm test               # both, in sequence
pnpm verify             # the full local quality suite (also runs both)
```

`test:kernel` uses `vitest.workers.config.ts`, which runs tests **inside the
real Workers runtime** with an isolated local D1 via
`@cloudflare/vitest-pool-workers`. The **real committed migration** is applied
to a fresh test database in `test/kernel/apply-migrations.ts` — D1 is not
mocked. Storage is isolated per test file, so tests clear the `entities` table
in `beforeEach` for a deterministic empty table.

Time and ids are **injectable** (`FakeClock`, `sequentialIds` in
`test/kernel/support.ts`) so timestamp and pagination assertions never depend on
wall-clock or sleeps.

## Inspecting the local D1 database

Run read-only SQL against the local database with Wrangler:

```bash
pnpm exec wrangler d1 execute DB --local --command "SELECT id, type, title, deleted_at FROM entities ORDER BY created_at"
pnpm exec wrangler d1 execute DB --local --command "PRAGMA table_info(entities)"
```

The underlying SQLite file lives under `.wrangler/state/v3/d1` if you prefer a
SQLite browser. It is local scratch state and safe to delete (a re-`migrate`
recreates the schema).

## Adding a future migration

1. Create the next file in `migrations/` with a zero-padded, incrementing
   number and a descriptive name, e.g. `migrations/0002_add_<thing>.sql`.
   (Wrangler can scaffold one: `pnpm exec wrangler d1 migrations create DB add_<thing>`.)
2. Write forward-only, SQLite-compatible D1 SQL. Use bound parameters in
   application code — never interpolate values into SQL anywhere.
3. Apply locally with `pnpm run db:migrate:local` and verify.
4. If the change affects the base entity contract, update the kernel types,
   the adapter, the tests, and the docs **in the same PR**.
5. The Workers Vitest integration picks new migrations up automatically
   (`readD1Migrations` reads the whole `migrations/` directory).

### Safe migration rules

- **Forward-only.** Migrations are append-only and sequential; never edit or
  renumber an already-committed migration. Fix mistakes with a new migration.
- **Additive by preference.** Prefer adding tables/columns/indexes over
  destructive changes. SQLite's `ALTER TABLE` is limited; a table rebuild
  (create-new → copy → drop-old → rename) may be needed for column changes.
- **No destructive production shortcut.** Do not add an easy production reset/drop
  command. Any reset must be explicitly scoped to local/test storage.
- **Keep the base table lean.** Do not add domain-specific fields to `entities`;
  add domain tables instead (ADR-009).
- **Test the migration.** The schema test (`test/kernel/entity-schema.test.ts`)
  asserts the applied schema; extend it when the schema changes.

## Eventually provisioning a real (remote) D1 database

Not required for FND-02 and intentionally not done here (no remote database is
fabricated or committed). When a real database is wanted:

1. `pnpm exec wrangler d1 create dalyhub-v2` (needs a Cloudflare account and
   `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`).
2. Copy the returned real `database_id` into the `DB` binding in
   `wrangler.jsonc`, replacing the placeholder.
3. `pnpm run cf-typegen` to regenerate `worker-configuration.d.ts`.
4. Apply migrations to the remote database with
   `pnpm exec wrangler d1 migrations apply DB --remote` (deliberately not
   wrapped in an npm script, so remote writes are always explicit).

Deployment itself remains a separate concern — see [`DEPLOYMENT.md`](DEPLOYMENT.md).

## Backup & restore

Trustworthy backup/restore of all data is its own roadmap item
([SET-02](../roadmap/ROADMAP_V2.md#-set-02--backup--restore)), building on
[data portability/export (X-04)](../roadmap/ROADMAP_V2.md#-x-04--export--data-portability).
FND-02 deliberately does **not** implement backup; it only ensures data lives in
plain, migration-managed, exportable relational tables so a later backup story
is straightforward. Until SET-02 lands, treat local D1 state as disposable and
production data (once a remote database exists) as backed up per Cloudflare's D1
mechanisms.

---

## Related documents

- [`ADR-009`](../decisions/ARCHITECTURE_DECISIONS.md#adr-009-data-kernel-storage) — the storage decision.
- [`ARCHITECTURE_OVERVIEW.md`](../architecture/ARCHITECTURE_OVERVIEW.md#entity-storage-the-kernel-contract-and-its-d1-adapter) — the kernel/adapter boundary.
- [`SETUP_AND_CI.md`](SETUP_AND_CI.md) — local setup and CI.
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — deploying the Worker.
- [`REFERENCE_PRODUCTS.md`](../reference/REFERENCE_PRODUCTS.md#storage--data-kernel-evaluation-fnd-02) — the storage evaluation.
