# DalyHub V2.4.0 — Release Checklist & Runbook

**Version `2.4.0` · The consolidated V2.1–V2.4 release · 2026-08-22**

> The evidence behind every V2.4.0 claim, and the exact sequence for deploying
> it. Nothing is marked ✅ without a reference. Where something is an OWNER
> action that has not happened yet, it is marked ⏳ rather than claimed.
>
> Legend: ✅ verified · ⚠️ verified with a stated limitation · ⏳ owner action
> still required · ⏭️ out of scope for this release.
>
> Implements the release half of
> [V2.4-GATE-01](../roadmap/ROADMAP_V2_4.md#-v24-gate-01--recoverable-green-released).
> Follows the shape of
> [`RELEASE_CHECKLIST_V2_0_1.md`](RELEASE_CHECKLIST_V2_0_1.md).

---

## 1. Scope

V2.4.0 is the first release since `2.0.1` (2026-08-02). It ships the accumulated
content of the **V2.1, V2.2 and V2.3** programmes — all of which were complete on
`main` and none of which had ever been released — plus **V2.4-GATE-01**, the pass
that made a release defensible.

It contains **no new product concept, no schema change and no new module**. The
committed migration sequence is unchanged by this release: whatever is in
[`migrations/`](../../migrations) at this commit was already there.

---

## 2. The version decision, and why

| | |
| --- | --- |
| **Chosen** | a single consolidated **`2.4.0`** |
| **Rejected** | a retrospective sequence of `2.1.0` → `2.2.0` → `2.3.0` → `2.4.0` |
| **Why** | Those three numbers were never built, never deployed and never ran. The artefact is byte-identical for all four, so three of them would identify nothing — and a version number's whole job is to answer *"which build is live?"*. |
| **Permitted by** | [ROADMAP_V2_4 § V2.4-GATE-01](../roadmap/ROADMAP_V2_4.md#-v24-gate-01--recoverable-green-released): *"a single release must either carry `2.4.0` with notes enumerating 2.1–2.3's content, or ship as a sequence. Pick one, state why in the release notes."* |
| **Release NAME unchanged** | `APP_RELEASE_NAME` stays `"V2"`. Its own docstring says it is the release name and not a milestone name; the shipped product is still DalyHub V2 and `2.4.0` is a version within it. |

✅ **The three places that must agree, agree.**

| Where | Value | Held by |
| --- | --- | --- |
| `package.json` | `2.4.0` | — |
| `app/lib/version.ts` (`APP_VERSION`) | `2.4.0` | the ONE authority the Worker reads |
| `docs/release/RELEASE_NOTES_V2_4_0.md` | `2.4.0` | — |

`test/unit/about/package-version.test.ts` fails if the first two ever drift.
`/health` and `/about` both render `APP_VERSION`, so the running application is
the fourth agreement — confirmable only against production (§ 6).

⏭️ **Lockfile metadata.** `pnpm-lock.yaml` records dependency resolution, not the
package's own version; `pnpm install --frozen-lockfile` after this bump is a
no-op, and there is nothing in the lockfile to update. Verified by the frozen
install passing in § 5.

---

## 3. Recoverable — the backup half

### 3a. What the repository fixed

| Item | Change | Evidence |
|---|---|---|
| A backup could publish a recovery it had never performed | `metadata` asserted `recoveryVerified: true` as a **constant**. It now requires a **receipt** written by `verify`, cross-checked against the artifact's own SHA-256, and refuses to write the file without one. `recoveryProof` additionally distinguishes `decrypt` from `decrypt+restore`. | `scripts/production-backup.mjs`; `test/unit/deploy/production-backup-encryption.test.ts` — a missing receipt and a receipt for a different artifact are each refused, and no metadata file is written |
| The recovery proof proved decryption, never restoration | New `rehearse` command: decrypt the artifact, re-validate the dump, **execute it into a throwaway SQLite database**, assert all 12 required tables, assert the database is not empty, and run `PRAGMA foreign_key_check`. Runs on **every** backup, before the artifact is uploaded. | `scripts/production-backup.mjs`; `.github/workflows/production-backup.yml`; tests covering a schema-only dump (refused: *"holds no entities"*), an unparseable dump (refused), and a tampered artifact (refused) |
| The upload guard was a deny-list | `find backup -type f ! -name '*.sql.gpg' ! -name 'metadata.json'`. The old rule refused `*.sql`, `*.json` and `*.zip`, so a plaintext dump written as `dump.txt`, `dump.bak` or with no extension walked into a 30-day artifact. | `.github/workflows/production-backup.yml`; `test/unit/deploy/production-backup-workflow.test.ts` |
| A whitespace-only passphrase passed the guard | The guard now requires ≥ 32 non-whitespace characters. The length is compared and never printed. | same |
| A cancelled job left the plaintext behind | `trap cleanup EXIT INT TERM`. A `timeout-minutes` overrun or a pressed Cancel signals the step rather than letting it exit, so a bare `EXIT` trap did not run — the one case where the owner's whole database sits in plaintext on a runner nobody is watching. | same |
| The backup job had its own copy of the toolchain setup | Now `uses: ./.github/actions/setup`, the shared composite action every other CI job uses — the exact drift its own description says it exists to prevent. | same |
| The AUDIT-11 test fixture was a dump no database would load | It declared every table as `(id TEXT NOT NULL PRIMARY KEY)` and inserted four values into it. `rehearse` found it on its first run. A recovery fixture that is not recoverable is the same failure the suite exists to prevent, one level down. | `test/unit/deploy/production-backup-encryption.test.ts` |

✅ **One pipeline, still.** `scripts/production-d1.mjs` and
`scripts/production-backup.mjs` remain the one export/encrypt authority;
`workflow_dispatch` and `schedule` take identical steps (asserted:
`runs-on:` appears exactly once, `export:` exactly once). No second backup
pipeline was created.

✅ **The guard was not weakened.** The refusal to run without an encryption key
is unchanged except by being made stricter.

### 3b. The one owner action that remains

⏳ **`BACKUP_ENCRYPTION_PASSPHRASE` is not set in the protected `production`
GitHub environment**, so the nightly job has failed at its first guard every
night since it was written, and **no infrastructure disaster-recovery copy of
production exists** ([DEBT-198](../product/PRODUCT_DEBT.md)). This session holds
no access to that environment and did not invent a key.

The complete, exact sequence is in
[`BACKUP_AND_RESTORE.md` § "Setting it for the first time"](../development/BACKUP_AND_RESTORE.md).
In short:

```sh
openssl rand -base64 48        # 1. generate (64 chars; the guard floor is 32)
                               # 2. store a copy OFF GitHub, before step 3
                               # 3. GitHub → Settings → Environments → production
                               #    → Add secret → BACKUP_ENCRYPTION_PASSPHRASE
                               # 4. Actions → Production D1 backup → Run workflow
gpg --batch --decrypt --passphrase-file /path/to/recovery-key.txt \
  dalyhub-v2-production-<stamp>.sql.gpg > dalyhub-production.sql   # 5.
node scripts/production-backup.mjs rehearse \
  --encrypted dalyhub-v2-production-<stamp>.sql.gpg \
  --passphrase-file /path/to/recovery-key.txt                      # 6.
source .production.env && pnpm run backup:verify \
  && pnpm run db:production:backup:list                            # 7.
```

**It must be an environment secret on `production`, not a repository secret** —
the job declares `environment: production`, and that is what puts the value
behind the environment's protection rules.

---

## 4. Recoverable — the restore rehearsal

See [`BACKUP_AND_RESTORE.md` § 5.5](../development/BACKUP_AND_RESTORE.md) for the
full transcript. Summary:

✅ A production-**style** encrypted backup was produced, decrypted, restored into
a scratch D1, and the application was booted against the restored database and
served a real record from it.

⚠️ **"Production-style", not production.** The source database was a scratch D1
carrying the **real committed schema** (all 49 migration files, head `0047`) and
the repository's own seed, exported with the real `wrangler d1 export`. It is the
same pipeline, the same dump format and the same encryption; what it is not is
the owner's actual data, because this session holds no Cloudflare credentials.
The rehearsal proves the **mechanism**; § 3b's step 6 is what proves the
**artifact**.

✅ **A defect was found by doing it.** The documented restore command
(`wrangler d1 execute … --file=dump.sql`) fails on every DalyHub D1 dump, with a
one-line cause — recorded, measured four ways, and given a working replacement in
[`BACKUP_AND_RESTORE.md` § 5.0a](../development/BACKUP_AND_RESTORE.md) and
[DEBT-199](../product/PRODUCT_DEBT.md).

---

## 5. Green — the test gate

See [V2.4-GATE-01's implementation record](../product/V2_4_GATE_01_RECOVERABLE_GREEN_RELEASED_2026_08.md)
for the failure-by-failure classification, the fixes and the complete evidence.

---

## 6. Released — the production sequence

> **Nothing in this section has been performed.** This environment holds no
> Cloudflare credentials, which `pnpm run verify:production` reports for itself
> rather than being told.

⏳ **Recorded output of `pnpm run verify:production`, run at this commit
(2026-08-22, no credentials supplied):**

```
verify:production — read-only. Nothing here deploys, migrates or writes.

  [SKIPPED] Configuration — none of the production configuration is supplied in this
            environment, so nothing below that needs it can run.
             not supplied: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID,
             PRODUCTION_DEFAULT_WORKSPACE_ID, PRODUCTION_ACCESS_TEAM_DOMAIN,
             PRODUCTION_ACCESS_AUD, PRODUCTION_OWNER_EMAIL
  [SKIPPED] Worker deployment — could not list deployments for dalyhub-v2-production
            — Wrangler is not authenticated, or the account cannot reach it.
  [SKIPPED] Worker secrets — could not list the secrets set on dalyhub-v2-production
            — Wrangler is not authenticated for this account.
  [SKIPPED] D1 migrations — could not read the production migration state.
  [SKIPPED] Application health — https://hub.daly.id.au/health answered 302 —
            Cloudflare Access protecting the hostname, which is the intended
            configuration. The RUNNING release is therefore NOT confirmed from here.

verify:production — PARTIALLY VERIFIED — 5 check(s) could not run here:
Configuration, Worker deployment, Worker secrets, D1 migrations, Application health.
Those remain owner/environment action; nothing below them is a pass.
```

✅ **One thing that observation DOES establish:** `https://hub.daly.id.au/health`
answered **302 to the Cloudflare Access login**. The origin is reachable and
Access is intercepting the hostname, which is the intended hardening and **not**
an application outage — exactly the distinction
[DEBT-84](../product/PRODUCT_DEBT.md) exists about. It says nothing about which
release is running.

⏳ **The production migration state is UNKNOWN, and this repository cannot know
it.** No statement here should be read as evidence that any migration is applied.

### The owner's sequence, in order

Backup state first, deployment last. Do not skip a step because the one before it
"probably" passed.

```sh
source .production.env          # CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID,
                                # CLOUDFLARE_D1_DATABASE_ID, PRODUCTION_* values

# ── 1. Establish a successful encrypted backup ────────────────────────────────
#     § 3b steps 1–4. Do not continue until the workflow run is green.

# ── 2. Verify recovery ────────────────────────────────────────────────────────
#     § 3b steps 5–6, plus the R2 copy:
pnpm run backup:verify
pnpm run db:production:backup:list        # must report a NON-ZERO result
pnpm run db:production:backup             # a fresh MANUAL backup, kept 365 days
pnpm run backup:status                    # wait for it to report complete
pnpm run db:production:backup:list        # confirm the new object exists

# ── 3. Inspect the production migration state ─────────────────────────────────
pnpm run db:production:list               # names the UNAPPLIED migrations
#     RECORD THE OUTPUT. It is the first direct observation of production's
#     schema state anyone will have written down since 2026-07-18.

# ── 4. Run the production preflight ───────────────────────────────────────────
pnpm run deploy:production:preflight
pnpm run deploy:production:release-check  # clean tree, on main, HEAD == origin/main,
                                          # CI Gate green, migrations acknowledged

# ── 5. Apply ONLY the pending, committed migrations ───────────────────────────
pnpm run db:production:apply
#     NEVER re-run one already marked applied, never edit an old migration to
#     make production accept it, never touch the schema outside this command,
#     never reset or reseed production D1. If the history is inconsistent,
#     STOP HERE and report the exact state — see § 7.

# ── 6. Deploy ─────────────────────────────────────────────────────────────────
pnpm run deploy:production

# ── 7. Verify ─────────────────────────────────────────────────────────────────
pnpm run verify:production                # every check should now PASS or state why
pnpm run db:production:list               # expect: no pending migration

# ── 8. Confirm health through Cloudflare Access ───────────────────────────────
#     A 302 from /health is Access doing its job, NOT an outage. The verifier is
#     the authority. To confirm the RUNNING release, either sign in and read
#     /about (version + deployed commit), or supply
#     PRODUCTION_ACCESS_SERVICE_TOKEN_ID / _SECRET so the verifier can pass
#     through Access as a machine identity and assert it itself.

# ── 9. Record the evidence ────────────────────────────────────────────────────
#     Paste the § 3 output, the § 5 migration list and the § 7 verifier summary
#     back into this file, and close DEBT-84, DEBT-139 and DEBT-198 against them.
```

---

## 7. If the migration history is inconsistent

Stop the deployment portion and report the exact state. Specifically, **never**:

- re-run a migration already marked applied;
- modify an old migration so production will accept it;
- edit the production schema outside `db:production:apply`;
- reset production D1, or destroy or reseed production data.

The repository and test work in this release stand on their own and need none of
the above.

---

## 8. What is still owed after this release

| | Owed | Blocked on |
|---|---|---|
| ⏳ | [DEBT-198](../product/PRODUCT_DEBT.md) — the nightly backup has never produced a backup | `BACKUP_ENCRYPTION_PASSPHRASE` (owner-held) |
| ⏳ | [DEBT-139](../product/PRODUCT_DEBT.md) — migrations from `0042` unapplied, no pre-migration backup | § 6 steps 1–5 (owner-held credentials) |
| ⏳ | [DEBT-84](../product/PRODUCT_DEBT.md) — production state has never been stated with evidence | § 6 step 7 |
| ⏳ | [DEBT-199](../product/PRODUCT_DEBT.md) — whether the REMOTE D1 restore path is affected by § 4's finding | one owner command, recorded in that entry |

---

## Related documents

- [`RELEASE_NOTES_V2_4_0.md`](RELEASE_NOTES_V2_4_0.md) — what shipped, for the
  person using DalyHub.
- [`DEPLOYMENT.md`](../development/DEPLOYMENT.md) — the deployment authority.
- [`BACKUP_AND_RESTORE.md`](../development/BACKUP_AND_RESTORE.md) — recovery, the
  recovery key, and the rehearsal.
