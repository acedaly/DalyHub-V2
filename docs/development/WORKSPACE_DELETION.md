# Workspace deletion — the boundary, and the procedure

> **DalyHub has no "Delete workspace" button, and that is a decision rather than
> a gap.** The reasoning is [ADR-124](../decisions/ARCHITECTURE_DECISIONS.md#adr-124-workspace-deletion-is-an-infrastructure-act-not-a-product-feature--a-registry-derived-purge-plan-an-executed-procedure-and-no-tombstone);
> this document is what an operator actually does instead, and what it does and
> does not promise.

**Audience:** the owner, acting as the operator of their own Cloudflare account.

---

## Why there is no button

Three measured facts, in order of weight.

**1. A product delete path would destroy its own application.** DalyHub resolves
ONE workspace from server configuration, confirms it exists, and has **no
auto-create and no fallback** ([`configured-context-resolver.ts`](../../app/platform/workspaces/configured-context-resolver.ts),
step 3). There is no workspace-creation surface anywhere in the product. Delete
the configured workspace from inside DalyHub and every authenticated request
fails `WorkspaceNotFoundError`, with no in-product path back. The owner is left
with a 503 and a `wrangler` command — which is where they started, minus their
data and minus the application.

`test/kernel/whole-product-rehearsal.test.ts` asserts exactly that: after a
complete purge, the real resolver rejects.

**2. The product cannot honestly complete the act.** R2 object removal is
*queued* through the purge ledger and completed by a sweep, and the backups
bucket is deliberately unreachable from the application Worker
([ADR-119](../decisions/ARCHITECTURE_DECISIONS.md#adr-119-evidence--an-attachment-is-a-child-record-with-one-required-owner-bytes-in-a-private-bucket-the-application-worker-owns-a-compensated-write-and-an-archive-that-carries-the-bytes)).
A button that says "deleted" while bytes remain in two buckets is a lie with a
progress spinner.

**3. The blast radius is wrong for the guarantee.** Sixty tables, two object
stores and a service binding, orchestrated from a request that can be
interrupted, with no cross-store transaction.

---

## What "deleted" means, precisely

| | |
| --- | --- |
| **Live D1 rows** | Gone. Every one of the sixty tables, verified by a query you run. |
| **Live R2 attachment objects** | Gone. Every object under the workspace's own key prefix. |
| **`dalyhub-v2-backups`** | **Not touched.** Its lifecycle rules ARE the retention policy: 90 days for `production/daily/`, 365 for `production/manual/` ([§7](BACKUP_AND_RESTORE.md#7-retention)). Those copies expire on their own schedule. |
| **The GitHub artifact copy** | **Not touched.** 30-day artifact retention, expired by GitHub. |
| **Archives the owner downloaded** | **Not touched.** They are the owner's files, wherever they put them. |

**DalyHub does not claim cryptographic erasure from historical backups, because
it does not provide it.** If the requirement is that no copy survives anywhere,
the backup buckets and the GitHub artifacts have to be dealt with separately and
deliberately — deleting the workspace does not do it.

---

## Two different states, and they need different procedures

The rehearsal found this rather than assuming it, and it matters:

| State | What it means | How to get there |
|---|---|---|
| **Empty workspace** | The `workspaces` row stands; everything it held is gone. | The purge plan, **without** its last statement. |
| **No workspace** | The row is gone too. | The purge plan, whole — or `wrangler d1 delete`. |

**A restore requires the first, not the second.** `workspace_restore_staged_rows`
has a foreign key to `workspaces(id)`, so staging an archive into a database
whose workspace row is gone fails before it reads a byte. If the intention is
"start again from a backup", stop at the empty state.

---

## Procedure A — delete everything, the whole deployment (the usual case)

For a single-owner deployment where the workspace IS the product, this is two
commands and it is the one to reach for.

```bash
# 1. Take a final archive FIRST, from Settings → Privacy & data → Export.
#    Download it. Verify it opens. It is the only copy that is yours rather
#    than the platform's.

# 2. Destroy the database.
wrangler d1 delete dalyhub-v2

# 3. Destroy the attachment bucket.
wrangler r2 bucket delete dalyhub-v2-attachments
```

Then decide, separately and deliberately, what to do about
`dalyhub-v2-backups` and the GitHub artifacts — see the table above.

**After this the deployment cannot serve a request.** Re-provisioning is
[`DEPLOYMENT.md`](DEPLOYMENT.md): create the database, apply the migrations,
insert a workspace row, and set `DEFAULT_WORKSPACE_ID` to it.

---

## Procedure B — purge ONE workspace from a database that holds others

Rarely needed today (production runs one workspace), and the reason the plan is
generated rather than written down.

**Most** foreign keys in DalyHub are `ON DELETE RESTRICT`, so a purge in the
wrong order does not cascade — it **fails, halfway, having already deleted some
of it.** **Nine are `ON DELETE CASCADE`** — a tag assignment, a subscribed feed's
events, a Meeting's agenda items and their Tasks, a Review's sections, workflow
state, step acknowledgements and insight snapshot, and a notification's delivery
attempts — every one a child row hanging off its own parent. **One
(`obligation_details` → `entities`) is `NO ACTION`**, SQLite's default, which
still enforces the constraint and merely defers it to the end of the statement.

The cascading nine make the order matter MORE rather than less: a wrong order
there deletes **more** than the statement names, silently, which is the failure
an operator cannot see happening. All ten are checked against
`pragma_foreign_key_list` by `test/kernel/workspace-data-map.test.ts`, each
named with its rule and its reason — so a new one is a deliberate addition to a
list rather than a surprise at 2am.

```bash
# 1. Read the plan. It opens no database and deletes nothing.
pnpm run workspace:purge:plan

# 2. Optional: read what each table IS before you delete it.
pnpm run workspace:purge:plan --classes

# 3. When you have satisfied yourself it says what you meant, build the
#    RUNNABLE form for one specific workspace.
pnpm run workspace:purge:plan --workspace=<id> > purge.sql
```

The plan is derived from
[`workspace-data-map.ts`](../../app/platform/storage/d1/workspace-data-map.ts) —
sixty tables, each with its foreign-key parents, topologically sorted so children
precede parents — and
[`workspace-data-map.test.ts`](../../test/kernel/workspace-data-map.test.ts)
checks that map against the REAL schema (`sqlite_master`,
`pragma_foreign_key_list`) on every run. A migration that adds a table fails the
build until somebody classifies it, so the plan cannot silently miss one.

Then:

1. **Export first**, from Settings → Privacy & data. Download it.
2. **Read the unbound form before you build the bound one.** The default output
   carries `:workspace_id` unbound on purpose, so a reviewer reads statements
   that say what they mean rather than statements with an id already baked in,
   and so nobody can paste the review copy into a terminal by accident. The
   `--workspace=<id>` form substitutes a **validated** id — 1–128 characters of
   `[A-Za-z0-9_-]`, the same closed alphabet the attachment object key uses —
   and REFUSES anything else outright rather than escaping it. Nothing is
   generated on a refusal.
3. **Run the DELETE block** through

   ```bash
   wrangler d1 execute dalyhub-v2 --remote --file purge.sql
   ```

   > **`--remote` is not optional and is not a style choice.** Without it
   > Wrangler executes against the LOCAL database — and then step 4's
   > verification block dutifully returns zero for every table, because the
   > local database is empty, while every production row is still there. An
   > operator would read sixty zeroes and believe they were finished. This is
   > the same reason `scripts/production-d1.mjs` passes `--remote` on every
   > production command, and the flag is asserted here by
   > [`workspace-deletion-procedure.test.ts`](../../test/unit/architecture/workspace-deletion-procedure.test.ts).

   The runnable form carries no `BEGIN`/`COMMIT`: D1 does not accept an explicit
   transaction from `wrangler d1 execute` and applies a `--file` as one batch of
   its own, so a wrapper there would fail the whole run before deleting
   anything. Stop before the final `DELETE FROM workspaces` if you want an empty
   workspace rather than no workspace.
4. **Run the verification block** the plan prints after it, `--remote` again.
   Every count must be `0`.
5. **Delete the R2 objects.** They are not in D1 and the plan cannot reach them.
   Every one of the workspace's objects is under a single deterministic prefix:

   ```
   workspaces/<workspace-id>/attachments/
   ```

   The prefix rule is [`attachment-storage-key.ts`](../../app/kernel/attachments/attachment-storage-key.ts);
   it is derived server-side and carries no owner-supplied string.

   > **This literal is CHECKED**, by
   > [`workspace-deletion-procedure.test.ts`](../../test/unit/architecture/workspace-deletion-procedure.test.ts),
   > against `attachmentWorkspacePrefix()` itself. It has to be: the first draft
   > of this document said `attachments/<workspace-id>/file/`, which matches
   > **nothing**. An operator following it would have got an empty listing,
   > concluded the workspace had no files, and left every PDF, receipt and
   > photograph the owner ever attached sitting in the bucket after a
   > "deletion". A prose prefix beside a derived key is exactly the pair that
   > drifts, and the drift is silent at the worst possible moment.

   **How you delete them depends on whether the bucket has one tenant, and
   Wrangler can only help you with one of those cases.**

   **The single-tenant case — which is production's actual shape.** One
   workspace, one bucket, so the bucket goes:

   ```bash
   wrangler r2 bucket delete dalyhub-v2-attachments
   ```

   **The shared-bucket case.** `wrangler r2 object` offers `get`, `put` and
   `delete` and **nothing that enumerates a prefix** — there is no
   `wrangler r2 object list`. That is a real limit of the tool, not an omission
   from this document, and it is stated here rather than papered over with a
   command that would fail: an operator who cannot list the keys cannot delete
   them one at a time.

   Two things do work, and both need a credential supplied out of band:

   - **R2's S3-compatible endpoint**, with an R2 API token from the Cloudflare
     dashboard. Any S3 client will enumerate and delete a prefix:

     ```bash
     aws s3 rm "s3://dalyhub-v2-attachments/workspaces/<workspace-id>/attachments/" \
       --recursive --endpoint-url "https://<account-id>.r2.cloudflarestorage.com"
     ```

   - **The Cloudflare REST API's** object listing for the same bucket and
     prefix, then `wrangler r2 object delete` per key.

   Either way, **list first and read what comes back before deleting anything**.
   The prefix is derived from a workspace id and nothing else, so a truncated or
   mistyped id lists a different workspace's evidence — and there is no undo.

   > This step is why [ADR-124](../decisions/ARCHITECTURE_DECISIONS.md) says
   > deletion is an infrastructure act. It needs a credential the application
   > does not hold, a tool the application does not ship, and a judgement the
   > application cannot make.

---

## Verification

The plan's own verification block is the check: sixty `SELECT COUNT(*)`
statements, one per table, all of which must return `0`.

The same procedure is **executed** on every kernel test run, against an isolated
synthetic workspace over real D1 and real R2, with a second populated workspace
sitting beside it — proving that it empties everything, that it empties nothing
else, and that the resolver then refuses. That is in
[`whole-product-rehearsal.test.ts`](../../test/kernel/whole-product-rehearsal.test.ts),
and it is why this document is a procedure rather than a hypothesis.

```bash
pnpm run restore:rehearsal
```

---

## What is deliberately NOT here

- **A tombstone.** It would exist to prove a deletion happened and to prevent id
  reuse. When the deletion is `wrangler d1 delete`, the database holding it is
  gone with everything else, and Cloudflare's own audit log is the record. A row
  in a database that no longer exists is theatre.
  ([ADR-124](../decisions/ARCHITECTURE_DECISIONS.md#adr-124-workspace-deletion-is-an-infrastructure-act-not-a-product-feature--a-registry-derived-purge-plan-an-executed-procedure-and-no-tombstone)
  decision 4.)
- **A destructive script.** `workspace:purge:plan` is a *generator*. It prints
  SQL and opens nothing. The step that destroys data is one a person types.
- **An "erase all my data" button.** It is a new destructive capability, and
  `replace`-mode restore already reaches the same state from a verified archive
  with a typed confirmation and a safety backup ([§3](BACKUP_AND_RESTORE.md#3-the-restore-contract-precisely)).

---

## Related documents

- [ADR-124](../decisions/ARCHITECTURE_DECISIONS.md#adr-124-workspace-deletion-is-an-infrastructure-act-not-a-product-feature--a-registry-derived-purge-plan-an-executed-procedure-and-no-tombstone) — the decision, its three measured reasons and the alternatives refused
- [ADR-046](../decisions/ARCHITECTURE_DECISIONS.md#adr-046-area-lifecycle--reversible-archival-on-a-module-owned-slice-and-the-first-guarded-permanent-deletion-purge-with-an-audit-tombstone) — the guarded Area purge, the precedent this declines to generalise
- [`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md) — the recovery authority, and the retention policy this document defers to
- [`EXPORT_AND_PORTABILITY.md`](EXPORT_AND_PORTABILITY.md) — the archive to take before you do any of this
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — re-provisioning, if you delete and then change your mind
- [`ATTACHMENTS.md`](ATTACHMENTS.md) — the object-key rule and the purge ledger
