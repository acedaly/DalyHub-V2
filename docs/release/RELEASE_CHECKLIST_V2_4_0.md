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
§ 3 for the failure-by-failure classification, the fixes and the complete
evidence. In summary:

| | |
| --- | --- |
| Starting state | `main` @ `054b98f`, CI run [`32571105218`](https://github.com/acedaly/DalyHub-V2/actions/runs/32571105218): **ten of twelve E2E partitions red, 55 failing tests, 5 tests that never executed** |
| Failing families | one mechanism each — a portalled listbox, a completed row filed under a closed disclosure, two hit-testing/CSS product defects, a promoted `Now` row, five retired surfaces, one journey budget, one fixture that never existed |
| Product defects fixed | DEBT-180 (row reveal), DEBT-196 (one day on a phone), a doubled record-panel edge, a nested filter outranking its tabs |
| Not done | nothing skipped, quarantined, weakened, `fixme`d or deleted; no retry added; no timeout raised except one measured budget correction, named as one |
| Remaining | the roadmap's *"green on `main` for two consecutive pushes"* is produced by the two pushes AFTER the merge, and cannot be produced from a branch |

✅ **The first of the two `main` runs exists.** The merge of #223 produced CI run
[`32685626437`](https://github.com/acedaly/DalyHub-V2/actions/runs/32685626437)
at `2f94279`: **17 of 17 jobs `success`** — Scope, Static, Build, Unit, E2E
p01…p12, CI Gate — with thirteen artefacts (`e2e-results-p01`…`p12` plus the
production build) and **not one failure artefact**; every partition's
`if: failure()` upload steps are `skipped`.

⏳ **The second needs the next push to `main`.** `ci.yml` triggers on
`push: [main]` and `pull_request` only — there is no `workflow_dispatch`, so a
second qualifying `main` run cannot be dispatched, and the gate will not be
given one so that a criterion can be met without a push.

❌ **The next push to `main` was RED, so the pair is broken and the count
restarts (2026-08-24).** Run
[`32710624636`](https://github.com/acedaly/DalyHub-V2/actions/runs/32710624636)
at `f2b504b` — a **documentation-only** commit — failed because **E2E p07 never
started**: `actions/setup-node`'s corepack download of `pnpm-10.33.0.tgz`
crashed 11 seconds in on a truncated response, `Install dependencies` was
`skipped`, and Playwright never ran. `e2e-partition-summary.mjs` correctly
refused to read the missing `results.json` as an absence of failures.

**Not one test failed.** Measured from the run's own `e2e-results-*` artefacts —
eleven of them, p07 published none, and **no `e2e-report-*` or `e2e-traces-*`
artefact from any partition**:

| | p01 | p02 | p03 | p04 | p05 | p06 | p08 | p09 | p10 | p11 | p12 | total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| passed | 127 | 128 | 230 | 144 | 152 | 117 | 113 | 124 | 112 | 260 | 259 | **1766** |
| failed | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| flaky | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| skipped | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | **2** |
| minutes | 16.5 | 12.2 | 15.5 | 17.4 | 18.4 | 12.9 | 18.5 | 19.2 | 16.0 | 13.9 | 13.2 | — |

The two skips are [DEBT-200](../product/PRODUCT_DEBT.md) records; its third is in
p07 and did not run. Raised as [DEBT-204](../product/PRODUCT_DEBT.md). **One
`rerun-failed-jobs` would very probably make this run green** — the session that
found it has read-only Actions access (**403**) and could not.


---

## 6. Released — the production sequence

> **No step in this section's sequence has been performed** — nothing has been
> backed up, migrated or deployed — and no environment that has attempted it
> held Cloudflare credentials, which `pnpm run verify:production` reports for
> itself rather than being told.
>
> **One exception, added 2026-08-24: step 3 is no longer unknown.** Production's
> migration state has been MEASURED — 49 applied, nothing pending — outside the
> canonical command. See *"The production migration state, measured 2026-08-24"*
> below, which is the authority on that one question; the 2026-08-22 material
> immediately following predates it and is kept as the record of what was known
> then.

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

⚠️ **What that observation DOES and does NOT establish.**
`https://hub.daly.id.au/health` answered **302 to the Cloudflare Access login**.
That establishes **the Access layer is configured on the hostname and is
answering** — the intended hardening, and the reason an unauthenticated non-200
here must never be read as a source-code failure, which is the distinction
[DEBT-84](../product/PRODUCT_DEBT.md) exists about.

It establishes **nothing about the origin**. Access terminates an
unauthenticated request at Cloudflare's edge, *before* it is proxied, so the
same 302 is returned whether the Worker behind it is healthy, broken or absent.
It therefore neither confirms nor rules out an application outage, and it says
nothing about which release is running. **This paragraph claimed "the origin is
reachable" and "not an application outage" until the V2.4-GATE-01 operational
pass corrected it** — both were unsupported by a probe that never reached the
origin, and a release checklist inferring health from an auth redirect is the
same class of false signal the sentence above refuses in the other direction.
`verify:production` marks Application health `[SKIPPED]`, and the verifier is
the authority.

⏳ **The production migration state was UNKNOWN as of 2026-08-22, and nothing
above establishes it.** ~~This repository cannot know it.~~ **SUPERSEDED
2026-08-24** by the direct reading below: the repository still cannot know it,
but an owner-authorised connection could be asked, and was. Nothing in the
2026-08-22 material above should be read as evidence that any migration is
applied; the measured table below is the only statement here that carries that
evidence.

### Attempted 2026-08-24, and stopped at step 1

The sequence below was run in order by an operational pass and got no further
than its first step. **Nothing in it was performed against production**, and the
outcomes are recorded here rather than left implied:

| Step | Result |
| --- | --- |
| 1 — establish a successful encrypted backup | ⏳ **blocked.** `BACKUP_ENCRYPTION_PASSPHRASE` is still unset; run **22** ([`32652803588`](https://github.com/acedaly/DalyHub-V2/actions/runs/32652803588), 2026-08-23T16:48Z) failed at the same guard as 10–21, export and upload `skipped` |
| 2 — verify recovery | ⏳ not attempted — no artefact, and no off-GitHub key |
| 3 — inspect the migration state | ⏳ `db:production:list` → `CLOUDFLARE_D1_DATABASE_ID is not set`. **Production's schema state remains unmeasured** |
| 4 — preflight | ⏳ `deploy:production:preflight` refuses, naming the missing values |
| 5 — apply migrations | ⏳ not run. **No migration was applied to production** |
| 6 — deploy | ⏳ not run |
| 7 — verify | ⏳ `verify:production` → `PARTIALLY VERIFIED`, the same five `[SKIPPED]` checks as above |
| 8 — health through Access | ⚠️ observed: **302 → Cloudflare Access login**, consistently. This establishes that **the Access layer answers** on the hostname. It does **not** reach the origin, so it neither confirms nor rules out an application problem, and it identifies no release. `verify:production` marks Application health `[SKIPPED]`, and that is the correct reading |
| 9 — record the evidence | this table |

**Why it stopped rather than continued.** Step 1 is a hard prerequisite, not a
slow one: no migration may be applied to production until a real backup exists.
Beyond it, every step is blocked a second time over — that environment had no
`.production.env`, no `CLOUDFLARE_API_TOKEN` and `wrangler whoami` reporting not
authenticated. The passphrase could not be set from there either: there was no
`gh` CLI and no secrets API, and — decisively — no password manager or other
persistent store **outside GitHub**, which § "The recovery key" requires the key
to reach *before* the secret is set. Generating one anyway would have produced
the look of recoverability without the substance. The guard was not weakened, no
key was invented, and the audited export pipeline was not routed around.

[DEBT-199](../product/PRODUCT_DEBT.md)'s remote half was likewise **not**
attempted — it needs the same credentials plus a real decrypted artefact — and
no scratch D1 was created.

### Attempted again 2026-08-24 (second pass) — and production's schema state was MEASURED for the first time

The same nine-step sequence was run again a few hours later, from an environment
that had one thing the previous one did not: a **live, owner-authorised
Cloudflare API connection**. The credential is **write-capable** — it can create
and delete D1 databases and issue arbitrary SQL. **This pass used it read-only** —
two `SELECT`s and nothing else — and that was a choice rather than a limit. See
*"How it was read"* under the measured table below. It still holds no `.production.env`, no `CLOUDFLARE_API_TOKEN`, and
`wrangler whoami` still reports not authenticated — so every `pnpm run`
production command still refuses at its own guard. What changed is that one
question this document has called unanswerable could finally be answered.

| Step | Result |
| --- | --- |
| 1 — establish a successful encrypted backup | ⏳ **blocked, and this time it could not even be TESTED.** The `production` environment's secrets **cannot be read** through this session (`GET /environments` → *"Access to this GitHub API path is not permitted through this proxy"*), and the canonical manual dispatch **cannot be triggered** (`POST …/dispatches` → **403 `Resource not accessible by integration`**; `rerun-failed-jobs` likewise). The latest run is still **22** ([`32652803588`](https://github.com/acedaly/DalyHub-V2/actions/runs/32652803588), 2026-08-23T16:48Z, `failure`) — there is no run 23, because the schedule fires at 16:30 UTC and this pass ran at ~09:20 UTC. **Whether `BACKUP_ENCRYPTION_PASSPHRASE` had been set was unknown from here, and was not assumed either way — and the schedule answered it the same day: run **23** ([`32754291594`](https://github.com/acedaly/DalyHub-V2/actions/runs/32754291594), 2026-08-24T17:02Z at `f2b504b`) failed at the same guard, with the env line **empty**. The secret is still not set. That is 23 consecutive failures** |
| 2 — verify recovery | ⏳ not attempted — no artefact, and no off-GitHub key |
| 3 — inspect the migration state | ✅ **MEASURED — see below.** `db:production:list` still refuses, but production's own ledger was read directly |
| 4 — preflight | ⏳ `deploy:production:preflight` refuses, naming five missing values: `CLOUDFLARE_D1_DATABASE_ID`, `PRODUCTION_DEFAULT_WORKSPACE_ID`, `PRODUCTION_ACCESS_TEAM_DOMAIN`, `PRODUCTION_ACCESS_AUD`, `PRODUCTION_OWNER_EMAIL`. None was fabricated |
| 5 — apply migrations | ⏭️ **not run, and nothing needed running** — there are **zero pending committed migrations** (step 3). No D1 history was touched |
| 6 — deploy | ⏳ not run — step 4 is a hard precondition and it refused |
| 7 — verify | ⏳ `verify:production` → `PARTIALLY VERIFIED`, the same five `[SKIPPED]` checks, verbatim above |
| 8 — health through Access | ⚠️ **302 → Cloudflare Access login**, as before. The Access layer is configured and answering. It does not reach the origin, identifies no release, and is not evidence of a problem either way |
| 9 — record the evidence | this section |

#### The production migration state, measured 2026-08-24

**This is the first direct observation of production's schema state written down
since 2026-07-18, and it does not say what this repository expected.**

| | |
| --- | --- |
| **Applied migrations** | **49** — `0001_create_entities.sql` … `0047_task_recurrence_advanced.sql` |
| **Committed migrations** | **49** files in [`migrations/`](../../migrations) |
| **Pending (committed, not applied)** | **none** |
| **Orphaned (applied, not committed)** | **none** |
| **Migration history condition** | **coherent** — an exact set match, both directions |
| **Most recent application** | `0047_task_recurrence_advanced.sql`, 2026-08-20 09:32:44 UTC |
| **`0042_add_entity_identity_colour.sql`** | applied **2026-08-16 08:37:08 UTC** |
| **Tables in production** | 52 |

**How it was read, because the provenance is the caveat.** Not by
`pnpm run db:production:list` — that command still cannot run here. By a single
read-only `SELECT id, name, applied_at FROM d1_migrations ORDER BY id` issued
over an owner-authorised Cloudflare API connection, plus one `COUNT(*)` over
`sqlite_master`. That is the **same ledger** the canonical command reads, so this
is a measurement and not an inference from filenames — but **it is not the
canonical command**, so [V2.4-GATE-01](../roadmap/ROADMAP_V2_4.md#-v24-gate-01--recoverable-green-released)'s
criterion 5 is **not** satisfied by it. **No user data was read** — only the
migration ledger and a table count. No account id, database id or token is
recorded anywhere in this repository.

**What it means, stated plainly.** [DEBT-139](../product/PRODUCT_DEBT.md)'s
headline — *"migration 0042 has not been applied"* — **is false and has been
false since 2026-08-16**. Production is current with the committed sequence.
The consequence is not relief but the opposite: **six migrations (`0042`–`0047`)
were applied to production between 2026-08-16 and 2026-08-20 with no
disaster-recovery copy behind any of them**, because
[DEBT-198](../product/PRODUCT_DEBT.md) has been unresolved throughout. The
risk this checklist's step order exists to prevent was not avoided — it was
taken six times, unobserved. **`DEPLOYMENT.md` still states no migration number
of its own**, and this table is deliberately here — a dated observation in a
release checklist — rather than there.

**What is still unknown about production.** The Worker's secret names, the
deployment identity of what is live, and **which release version is actually
running**. `/about` and `/health` both render `APP_VERSION`, both sit behind
Cloudflare Access, and Access terminates at the edge. The Worker
`dalyhub-v2-production` exists, as do the database `dalyhub-v2`, BACKUP-01's
`dalyhub-v2-backup` Worker and its private `dalyhub-v2-backups` R2 bucket —
existence is all that was established, and `2.4.0` is **not** claimed to be live.

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
#     A 302 from /health means Access answered; it does NOT mean the origin is
#     healthy, because the request never reached it. It is not evidence of an
#     outage either. The verifier is the authority — it marks Application health
#     [SKIPPED] rather than passing it. To confirm the RUNNING release, sign in and read
#     /about (version + deployed commit), or supply
#     PRODUCTION_ACCESS_SERVICE_TOKEN_ID / _SECRET so the verifier can pass
#     through Access as a machine identity and assert it itself.

# ── 9. Record the evidence ────────────────────────────────────────────────────
#     Paste the § 3 output, the § 5 migration list and the § 7 verifier summary
#     back into this file, and close DEBT-84, DEBT-139 and DEBT-198 against them.
```

---

### Run with credentials at last — 2026-08-30

The owner ran the canonical verifier from an authenticated machine. This is the
act [DEBT-84](../product/PRODUCT_DEBT.md) has been open on since AUDIT-06, and
the first time `verify:production` has returned anything but five `SKIPPED`.

```
verify:production — read-only. Nothing here deploys, migrates or writes.

  [PASS   ] Configuration — every required production identifier is supplied in this environment.
             Values are never printed — only whether each name is set.
  [PASS   ] Worker deployment — dalyhub-v2-production last deployed 2026-08-30T05:56:35.714185Z.
             deployment: cf596658-d648-4a58-a521-09cf6c0e279f
  [PASS   ] Worker secrets — every required Access secret is set on dalyhub-v2-production.
             set on the Worker (NAMES only, never values): ACCESS_AUD, ACCESS_TEAM_DOMAIN,
             APP_ENCRYPTION_KEY, CAPTURE_EMAIL_ALLOWED_SENDERS, CAPTURE_EMAIL_RECIPIENTS,
             OPENAI_API_KEY, OWNER_EMAIL
  [PASS   ] D1 migrations — production has no unapplied migrations.
  [SKIPPED] Application health — https://hub.daly.id.au/health answered 302 — Cloudflare Access
             protecting the hostname, which is the intended configuration. The RUNNING release is
             therefore NOT confirmed from here.

verify:production — PARTIALLY VERIFIED — 1 check(s) could not run here: Application health.
```

**Read the SKIPPED line as what it says.** The 302 is Cloudflare Access doing its
job at the edge, not an outage and not a failure — but Access terminates before
the origin, so **the running release version is still not independently
confirmed**, and this checklist does not claim it is. Confirming it needs either
an owner signed in at `/about`, or
`PRODUCTION_ACCESS_SERVICE_TOKEN_ID` / `_SECRET` supplied so the check can pass
through Access as a machine identity. No attempt was made to bypass Access.

Two of DEBT-84's three unknowns are now answered: the Worker's **secret names**
(seven, above, names only) and the **deployment identity**
(`cf596658-d648-4a58-a521-09cf6c0e279f`, 2026-08-30T05:56:35Z). The third, the
**running release version**, remains unread.

Recorded without account ids, database ids, tokens or secret values.

Two local-only adjustments were needed and are worth noting for whoever runs it
next: `.production.env` does **not** export `CLOUDFLARE_ACCOUNT_ID`, which
`verify-production.mjs` lists as required, and the script spawns bare `wrangler`,
which is not on the global PATH. Neither is a production fault; both make the
verifier under-report if unaddressed.

### Recoverable — measured the same day

- **R2 backups are healthy**, and have been since 2026-08-13: 20 runs, all
  `success`, read from `status/latest.json`. A **post-`0049`** manual backup was
  taken 2026-08-30T06:07:46Z — `production/manual/2026/08/dalyhub-v2-2026-08-30T060746Z.sql`,
  549,478 bytes, SHA-256 `853a2fe3…f244`, R2-verified at write.
- **A real production restore was rehearsed**, into a throwaway D1 and never
  production: 54 tables, 107 indexes, 6,095 rows, `foreign_key_check` clean, and
  **13 of 13 `COUNT(*)` comparisons against live production matched exactly**.
  Production's ledger was unchanged before and after; the throwaway database was
  deleted and the local plaintext removed.
- **It required `production-backup.mjs reorder` first** — a raw D1 export cannot
  be imported by either restore path. See
  [DEBT-199](../product/PRODUCT_DEBT.md) and
  [`BACKUP_AND_RESTORE.md` § 5.0a / § 5.0b](../development/BACKUP_AND_RESTORE.md).

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
| ⚠️ | [DEBT-139](../product/PRODUCT_DEBT.md) — **its migration half is now measured and FALSE**: `0042`–`0047` are all applied and nothing is pending. What remains true, and is worse, is that none of the six had a pre-migration backup | [DEBT-198](../product/PRODUCT_DEBT.md); its "pre-`0042` backup object" clause is now permanently unachievable |
| ◐ | [DEBT-84](../product/PRODUCT_DEBT.md) — production state has never been stated with evidence. **The schema half is now stated** (§ 6, 2026-08-24); the Worker's secrets, its deployment identity and the running release are still unknown | § 6 step 7 — `verify:production` run **with credentials**, which is what the closing condition names |
| ⏳ | [DEBT-204](../product/PRODUCT_DEBT.md) — every CI job re-downloads pnpm from the npm registry, and one truncated response turned run 743 red on a documentation-only commit | a change to `.github/actions/setup`, deliberately not made in this pass |
| ⏳ | [DEBT-199](../product/PRODUCT_DEBT.md) — whether the REMOTE D1 restore path is affected by § 4's finding | one owner command, recorded in that entry |

---

## Related documents

- [`RELEASE_NOTES_V2_4_0.md`](RELEASE_NOTES_V2_4_0.md) — what shipped, for the
  person using DalyHub.
- [`DEPLOYMENT.md`](../development/DEPLOYMENT.md) — the deployment authority.
- [`BACKUP_AND_RESTORE.md`](../development/BACKUP_AND_RESTORE.md) — recovery, the
  recovery key, and the rehearsal.
