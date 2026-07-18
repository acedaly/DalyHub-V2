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
| EntityLink contract | `app/kernel/entity-links/` | Branded `EntityLinkType`, `EntityLinkRecord`/`EntityLinkView`, inputs, domain errors, the workspace-bound `EntityLinkRepository` interface, validation and a dedicated cursor. No D1/Cloudflare types. ([FND-04](../roadmap/ROADMAP_V2.md#-fnd-04--entitylinks)) |
| Activity contract | `app/kernel/activity/` | Branded `ActivityType`, `ActivityRecord`, `ActivityActor`/`ActivitySubject`, payload rules + shared JSON serialiser, domain errors, a dedicated cursor, the **read-only** `ActivityRepository`, and the storage-independent recording seam (actor context + `buildActivityWriteModel`). No D1/Cloudflare types or JSON strings. ([FND-05](../roadmap/ROADMAP_V2.md#-fnd-05--shared-activity-model)) |
| Workspace kernel | `app/kernel/workspaces/` | Branded `WorkspaceId`, `WorkspaceRecord`, `WorkspaceContext`, the `WorkspaceContextResolver` interface and the low-level `WorkspaceRepository` contract. No D1/Cloudflare types. |
| D1 adapter | `app/platform/storage/d1/` | Implements the contracts over prepared, parameterised D1 statements; converts rows ⇄ domain records; hosts the atomic recording seam (`d1-activity-recorder`, `d1-atomic-mutation`). The only place SQL lives. |
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
rows unchanged.

Migration `0003_create_entity_links.sql` ([FND-04](../roadmap/ROADMAP_V2.md#-fnd-04--entitylinks))
adds the parent `UNIQUE (workspace_id, id)` key on `entities` and creates the
`entity_links` table (with its composite foreign keys, self-link `CHECK`,
identity uniqueness index and access-path indexes). It is additive — it does not
rebuild or alter existing `entities` rows.

Migration `0004_create_activities.sql` ([FND-05](../roadmap/ROADMAP_V2.md#-fnd-05--shared-activity-model))
creates the STRICT `activities` and `activity_subjects` tables (with the parent
`UNIQUE (workspace_id, id)` key on `activities`, composite foreign keys, and
access-path indexes). It is purely additive — it does **not** touch `entities` or
`entity_links`, and there is **no backfill**: the Activity stream begins when
FND-05 is deployed, and no history is fabricated for records created before 0004.

The Workers Vitest integration applies all migrations automatically; apply them
to your local database with `pnpm run db:migrate:local`.

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

## EntityLinks (FND-04)

**EntityLinks** are the kernel primitive for typed, bidirectional relationships
between any two entities ([ADR-011](../decisions/ARCHITECTURE_DECISIONS.md#adr-011-entitylink-persistence-and-lifecycle),
implementing [ADR-002](../decisions/ARCHITECTURE_DECISIONS.md#adr-002-entitylinks)).
A link is a **relationship record, not an entity**: it has no title, entity type,
search entry, module or page.

### The `entity_links` schema (migration 0003)

```
entity_links (
  id, workspace_id, source_entity_id, target_entity_id, type,
  created_at, updated_at, deleted_at
)  STRICT
```

- **One directed row per relationship.** The row stores `source_entity_id`,
  `target_entity_id` and `type`; the same row is *outgoing* from the source and
  *incoming* from the target. Endpoint ids are **never reordered**.
- **Same-workspace endpoints enforced by the database.** A parent
  `UNIQUE (workspace_id, id)` key on `entities` backs two composite foreign keys
  — `(workspace_id, source_entity_id) → entities (workspace_id, id)` and
  `(workspace_id, target_entity_id) → entities (workspace_id, id)` — both
  `ON DELETE RESTRICT`. A cross-workspace endpoint is impossible at the database
  level, and a referenced entity/workspace cannot be hard-deleted.
- **A `CHECK` forbids self-links**, and a `UNIQUE (workspace_id, source, target,
  type)` index gives each directed relationship one stable identity (this is the
  duplicate backstop and the exact-relationship lookup path).

### Creating a workspace-scoped link repository

The composition boundary returns the link repository alongside the entity one,
both bound to the same `WorkspaceContext`:

```ts
import { resolveWorkspaceScope } from "~/platform/workspaces";

// environment → resolver → WorkspaceContext → { entities, entityLinks }
const { entities, entityLinks } = await resolveWorkspaceScope(env);
```

Like `entities`, `entityLinks` methods take **no `workspaceId`** — scope comes
from the bound context, and both endpoints of every link are constrained to it.

### Creating links, and querying from either endpoint

```ts
const meeting = await entities.create({ type: "meeting", title: "Kickoff" });
const task = await entities.create({ type: "task", title: "Send recap" });

// Create the directed relationship: meeting --produced_task--> task.
const { link, outcome } = await entityLinks.create({
  sourceEntityId: meeting.id,
  targetEntityId: task.id,
  type: "meeting.produced_task", // a validated, branded EntityLinkType
});
// outcome: "created" | "already_exists" | "restored" (idempotent by identity)

// From the meeting the link is OUTGOING; from the task it is INCOMING — same row.
const fromMeeting = await entityLinks.listForEntity(meeting.id); // direction: "outgoing"
const fromTask = await entityLinks.listForEntity(task.id);       // direction: "incoming"
```

Both endpoints must exist, be active, and belong to the bound workspace. This is
enforced **atomically**: the `INSERT` writes only when both endpoints are active
(`INSERT ... SELECT ... WHERE EXISTS (source active) AND EXISTS (target active)`),
so an endpoint soft-deleted between validation and the write cannot slip a link
past the requirement. A missing, soft-deleted, or cross-workspace endpoint fails
identically (`EntityLinkEndpointNotFoundError`), disclosing nothing.

`listForEntity` returns each link as an `EntityLinkView` (`link`, `direction`,
and the active `counterpart` entity) fetched via a single joined query (no N+1),
is bounded and cursor-paginated, and accepts optional `direction`
(`outgoing`/`incoming`/`both`) and `type` filters. Its cursor is a **dedicated,
versioned** format bound to the workspace, anchor entity, direction and type
filter — a cursor from another scope is rejected. The cursor is UTF-8-safe
(Unicode ids paginate correctly) and decoded with a **fatal** UTF-8 decoder, so a
tampered/malformed cursor is rejected rather than silently repaired.

### Direction semantics

Direction is meaningful: `(A → B, type)` and `(B → A, type)` are **different**
relationships and are stored as different rows. The kernel never reorders
endpoints or treats a reversed link as identical.

### Unlink / restore, and endpoint soft-delete behaviour

- **`unlink(id)`** is reversible soft deletion (sets `deleted_at`, advances
  `updated_at`, preserves the id; idempotent → `unlinked`/`already_unlinked`). It
  does not touch either endpoint entity.
- **`restore(id)`** clears `deleted_at` (idempotent → `restored`/`already_active`)
  and requires **both endpoints to currently exist and be active**, else it fails
  safely. The endpoint check is folded into the restore `UPDATE` itself
  (`... AND EXISTS (source active) AND EXISTS (target active)`), so it cannot be
  raced by a concurrent endpoint soft-delete; the same applies to the
  create-after-unlink restore path.
- **Soft-deleting an endpoint entity does NOT delete its link rows.** Instead,
  link queries hide a link whenever *either* endpoint is soft-deleted; restoring
  the endpoint reveals still-active links again **with the original id**. A link
  explicitly unlinked before/during entity deletion **stays unlinked** after the
  entity is restored. This is what makes entity delete/restore lossless — see the
  "Why soft-hide over destructive cascade" reasoning in
  [ADR-011](../decisions/ARCHITECTURE_DECISIONS.md#adr-011-entitylink-persistence-and-lifecycle).
  `re-create` of an unlinked relationship restores the same row (never a new id).

### Adding future link types

A link type is a **validated, branded identifier** (lowercase dotted segments,
e.g. `person.attended_meeting`), stored verbatim — **not** a database enum and
**not** a hard-coded list. A new module introduces a new link type simply by
passing it to `create()`; no schema migration is needed. FND-06 (Module
Registry) will later connect link-type registration to modules for governance.

### Why modules must not create bespoke relationship tables without an ADR

Cross-entity relationships are a **kernel primitive** precisely so a link made in
one module is visible in every other with no extra work, with referential
integrity and lifecycle handled centrally. A per-module foreign-key column or
join table re-fragments this, bypasses the workspace-boundary and endpoint-safety
guarantees, and duplicates lifecycle logic — it is exactly what
[ADR-002](../decisions/ARCHITECTURE_DECISIONS.md#adr-002-entitylinks)/[ADR-011](../decisions/ARCHITECTURE_DECISIONS.md#adr-011-entitylink-persistence-and-lifecycle)
reject. If a relationship genuinely cannot be modelled as an EntityLink, that is
an architectural change and needs a new ADR, not a quiet bespoke table.

## Activity (FND-05)

**Activity** is the single, append-only, workspace-scoped history/audit stream
every module writes to ([FND-05](../roadmap/ROADMAP_V2.md#-fnd-05--shared-activity-model) /
[ADR-012](../decisions/ARCHITECTURE_DECISIONS.md#adr-012-activity-persistence-and-atomic-mutation-recording),
implementing [ADR-005](../decisions/ARCHITECTURE_DECISIONS.md#adr-005-shared-activity-model)).
It is the source of the record Timeline, the workspace Activity Feed and the
audit trail. **Per-module history/event/timeline tables are prohibited** — there
is one stream.

### The `activities` and `activity_subjects` schema (migration 0004)

```sql
-- The event header (STRICT). No updated_at/deleted_at/title/status —
-- an event is an immutable fact, not an entity.
activities(
  id, workspace_id, type, actor_type, actor_id, occurred_at, payload_json
)
  workspace_id → workspaces(id)                     ON DELETE RESTRICT
  UNIQUE (workspace_id, id)                          -- parent key for subjects

-- Which entities the event relates to, and in what role (STRICT).
activity_subjects(workspace_id, activity_id, entity_id, role)
  PRIMARY KEY (workspace_id, activity_id, entity_id) -- no duplicate subjects
  (workspace_id, activity_id) → activities(workspace_id, id)  ON DELETE RESTRICT
  (workspace_id, entity_id)   → entities(workspace_id, id)    ON DELETE RESTRICT
```

An event relates to **one or many** entities via `activity_subjects`, never a
single embedded entity id — which is why a single EntityLink event (with a
`source` and a `target` subject) appears in both endpoints' timelines while
remaining one event. `ON DELETE RESTRICT` on the entity FK preserves a
**soft-deleted entity's Timeline** (soft-delete never removes the entity row).

### Conventions

- **Event type** — a validated, branded, lowercase dotted identifier stored
  verbatim (`entity.created`, `entity.updated`, `entity.deleted`,
  `entity.restored`, `entity_link.created`, `entity_link.unlinked`,
  `entity_link.restored`). No database enum, no display label in the kernel; new
  modules add types without a migration.
- **Actor** — a trusted, server-derived `{ type, id }` established at the
  composition boundary (`resolveWorkspaceScope`) and threaded into the mutation
  repositories, never accepted through a module parameter. `type` is a validated
  open identifier (`system`, `user`, `ai`, `import`, `integration`, …); `id` is
  nullable. The default `resolveWorkspaceScope(env)` supplies the `system` actor
  `{ type: "system", id: null }`; FND-09's `resolveAuthenticatedWorkspaceScope(env,
  session)` supplies an authenticated `{ type: "user", id: session.user.subject }`
  actor (the validated Access JWT `sub`, never the email) — same seam, no schema
  change. See [`APP_SHELL_AUTH.md`](APP_SHELL_AUTH.md) and
  [ADR-016 §5.6](../decisions/ARCHITECTURE_DECISIONS.md#adr-016-cloudflare-access-identity-app-shell-and-registry-driven-routing).
- **Subject role** — a validated open identifier (`subject`, `source`, `target`).
- **Payload** — a JSON **object**, recursively validated (rejecting functions,
  symbols, `undefined`, `bigint`, cyclic structures and non-finite numbers),
  bounded in nesting depth and encoded byte size, serialised once by the shared
  helper and re-validated on read. It explains the event only — never a full
  entity snapshot, never a replacement for a domain table.

### Built-in event types

| Mutation | Type | Subjects | Payload (shape) |
| --- | --- | --- | --- |
| Entity create | `entity.created` | entity → `subject` | `{ entityType, title }` |
| Entity update | `entity.updated` | entity → `subject` | `{ changes: { title: { before, after } } }` |
| Entity soft-delete | `entity.deleted` | entity → `subject` | `{ entityType, title }` |
| Entity restore | `entity.restored` | entity → `subject` | `{ entityType, title }` |
| Link create | `entity_link.created` | source → `source`, target → `target` | `{ linkId, linkType, sourceEntityId, targetEntityId }` |
| Link unlink | `entity_link.unlinked` | source, target | `{ linkId, linkType, sourceEntityId, targetEntityId }` |
| Link restore / create-after-unlink | `entity_link.restored` | source, target | `{ linkId, linkType, sourceEntityId, targetEntityId }` |

Only **successful, meaningful** mutations emit events. Idempotent no-ops
(`already_deleted`, `already_active`, `already_exists`, `already_unlinked`) and
failed mutations emit nothing. A `title` update that submits the already-stored
title is likewise a no-op — it does not advance `updated_at` and appends no
`entity.updated` event (an event with identical `before`/`after` would be
misleading history).

### Atomic mutation recording (how future repositories must record Activity)

A domain mutation and its Activity append are ONE `D1Database.batch()` (a single
transaction that rolls back entirely on any failure). The pattern, encoded in
`d1-activity-recorder.ts` + `d1-atomic-mutation.ts`:

1. Build the domain statement **first**, using `RETURNING`, with a `WHERE` that
   matches only when a real change is needed.
2. Append it, then the event insert guarded `WHERE changes() > 0`, then one
   subject insert per subject guarded `WHERE EXISTS` the event.
3. `db.batch([...])`; inspect the domain statement's `meta.changes` — the event
   is appended **iff a row actually changed**.

Never `await repo.update(); await activity.append();` — that can persist the
domain change while losing its event. Always route through the atomic seam. The
mutation timestamp and the event's `occurred_at` come from the **same** clock
call. Entity `update` uses a bounded optimistic retry so a concurrent change
cannot record a stale before/after.

### Reading Activity: workspace feed & entity Timeline

The module-facing `ActivityRepository` (from `resolveWorkspaceScope().activity`)
is **read-only**:

```ts
const { activity } = await resolveWorkspaceScope(env);
await activity.listForWorkspace({ type?, limit?, cursor? });   // Activity Feed
await activity.listForEntity(entityId, { type?, limit?, cursor? }); // Timeline
await activity.getById(id);
```

Both listings are workspace-isolated, ordered **newest-first** by
`(occurredAt, id)`, bounded, cursor-paginated, and return each event with **all**
its subjects via a single `IN (...)` query (no N+1). `listForEntity` requires the
anchor entity to exist in the workspace but allows it to be **soft-deleted** — a
deleted entity's Timeline stays queryable. A cross-workspace anchor is
indistinguishable from a nonexistent one.

### Cursor behaviour

Activity uses its **own** versioned cursor (never the entity or link cursor),
bound to `(version, workspaceId, scope-kind, entityId?, type-filter, occurredAt,
activityId)`. A workspace cursor is rejected on an entity Timeline (and vice
versa), an entity-A cursor is rejected for entity B, and a filtered cursor is
rejected under another filter. Contents are untrusted (base64url over UTF-8,
fatal decoding), validated on decode; every value reaching SQL is bound.

### No per-module history tables; no backfill

There is exactly one Activity stream. Do not add entity-specific history tables,
EntityLink logs, module audit tables or per-feature timeline stores — record
Activity through the atomic seam instead. And do **not** fabricate history for
records created before migration 0004: the stream begins at deployment.

## Spine domain tables (FND-07)

The Area → Goal → Project → Task **spine** is the first domain model built on the
kernel. It follows every convention above: Areas/Goals/Projects/Tasks are ordinary
`entities` rows, their parentage is EntityLinks, and their mutations record Activity
through the atomic seam. The only additive storage is one STRICT domain table,
`spine_records`, added by **migration `0005_create_spine_hierarchy.sql`**:

```
spine_records ( workspace_id, entity_id, kind, completed_at )
  PRIMARY KEY (workspace_id, entity_id)
  CHECK (kind IN ('area','goal','project','task'))
  CHECK (kind <> 'area' OR completed_at IS NULL)   -- Areas never complete
  FOREIGN KEY (workspace_id, entity_id, kind)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT
```

Two things make the schema self-enforcing. The **composite foreign key** to
`entities(workspace_id, id, type)` (backed by the new `entities_workspace_id_type_key`
unique index) means a `spine_records.kind` can only reference an entity of the
matching `type` in the same workspace — a Task spine row cannot point at a `note`.
And a **partial unique index** over `entity_links (workspace_id, source_entity_id)`,
restricted to the five structural link types where `deleted_at IS NULL`, enforces
*at most one active structural parent per child* at the database, so the
exactly-one-parent rule survives any concurrency.

Migration `0005` is **additive** and does **no backfill**: generic pre-spine rows
are never guessed into a hierarchy (DalyHub V2 has not entered production). Spine
records only exist once the `SpineRepository` creates them.

Module code never touches `spine_records` or structural links directly. It uses the
workspace-bound `SpineRepository` (exposed as `workspace.spine` from
`resolveWorkspaceScope`), which is the **only** authoritative path — the generic
Entity/EntityLink repositories refuse to mutate reserved spine types. The full
model — kinds, permitted hierarchy, completion vs. deletion, derived rollups,
move/reparent, reserved mutation paths and Activity events — is documented in
[`SPINE_MODEL.md`](SPINE_MODEL.md).

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
