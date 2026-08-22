# V2.4-GATE-01 — Recoverable, green, released

**The pass that makes "daily driver" literally true before V2.4 adds anything to
it.** Implements
[V2.4-GATE-01](../roadmap/ROADMAP_V2_4.md#-v24-gate-01--recoverable-green-released).

> This is not feature development. Its whole purpose is to establish a
> trustworthy floor: a disaster-recovery copy that has actually been restored, a
> test gate whose red means something, and a release whose notes name what
> shipped.
>
> **It does not reach that floor in full, and says so.** Two of the three halves
> are complete in the repository and blocked on one owner-held secret and one set
> of owner-held credentials. Those are named exactly, with the commands, in
> § 5 — not softened, and not counted as done.

---

## 1. The three claims, and where each one actually stands

| | Claim | State |
|---|---|---|
| **Recoverable** | a backup exists and has been restored in a rehearsal | ◐ — the pipeline is fixed, hardened and now proves a **restore** on every run, and the mechanism has been rehearsed end to end. **No artefact of the owner's data exists yet**, because `BACKUP_ENCRYPTION_PASSPHRASE` is not set. § 2, § 5.1 |
| **Green** | the twelve-partition gate is green | see § 3 |
| **Released** | production is verified, migrated, and running a release whose notes name what shipped | ◐ — the version decision is taken and recorded, the notes and checklist are written, and **nothing has been deployed**: this environment holds no Cloudflare credentials, which `verify:production` reports for itself. § 4, § 5.2 |

---

## 2. Recoverable

### 2.1 The audit

The complete path was traced: GitHub Actions → the `Production D1 backup`
workflow → `scripts/production-d1.mjs` (the D1 export) →
`scripts/production-backup.mjs` (validate, encrypt, prove) → the retained
artefact. Four of the five things the audit had to confirm were already true and
are unchanged:

- ✅ **One export/encryption authority.** `production-d1.mjs` and
  `production-backup.mjs`, and nothing else. No second pipeline was created.
- ✅ **Scheduled and manual runs are identical.** One job, one `runs-on:`, no
  trigger-conditional steps — asserted, not inspected.
- ✅ **Plaintext cannot survive a failed run** — and now cannot survive a
  *cancelled* one either (§ 2.2).
- ✅ **Secrets cannot reach a log or an artefact.** The passphrase is never an
  `argv` value, never interpolated into a shell string, `set -x` is absent, and
  the metadata writer refuses any field whose name looks like a credential.

The fifth — *"backup verification actually proves the produced payload is
recoverable rather than merely proving a file exists"* — was **not** true, in two
independent ways, and that is where the work went.

### 2.2 Seven defects, each with a test that fails without the fix

| # | Defect | Fix |
|---|---|---|
| 1 | **The metadata published a recovery it had never performed.** `recoveryVerified: true` was a constant in the writer. It had no way to know whether `verify` had run, and would have gone on asserting it through any edit that dropped or reordered that step. | `verify` writes a **receipt** carrying the digests it actually computed; `metadata` refuses to write the file unless the receipt's ciphertext digest matches the artifact in front of it. `recoveryProof` additionally states which proof ran — `decrypt` or `decrypt+restore`. |
| 2 | **The pipeline proved decryption and called it recovery.** `verify` answers *"do the bytes come back?"*; `validate` is deliberately a shape check rather than a SQL parser. Nothing asked whether a database would load the result. | New `rehearse` command — § 2.3. |
| 3 | **The upload guard was a deny-list** (`*.sql`, `*.json`, `*.zip`), so a plaintext dump written as `dump.txt`, `dump.bak` or with no extension walked into a thirty-day artifact. | An allow-list of the two files the artifact may contain, plus a refusal of any subdirectory the pipeline never creates. |
| 4 | **A whitespace-only passphrase passed the guard.** `-z` accepts one, and GnuPG would encrypt the owner's entire life under it perfectly happily. | ≥ 32 non-whitespace characters required. The length is compared and never printed. |
| 5 | **A cancelled job left the plaintext behind.** `trap cleanup EXIT` does not run when the step is signalled, which is what a `timeout-minutes` overrun or a pressed Cancel does — the one case where the database sits in plaintext on a runner nobody is watching. | `trap cleanup EXIT INT TERM`. |
| 6 | **The backup job carried its own copy of the toolchain setup**, the exact copy-paste `.github/actions/setup` exists to prevent — the backup pipeline could quietly end up on a different Node from the one it is tested on. | `uses: ./.github/actions/setup`. |
| 7 | **The AUDIT-11 test fixture was a dump no database would load.** Every table declared as `(id TEXT NOT NULL PRIMARY KEY)`, with four values inserted into it. It satisfied `validate` — a shape check — and nothing had ever tried to restore it. | A loadable fixture. `rehearse` found this on its first run, which is the argument for `rehearse` in one line. |

### 2.3 `rehearse` — what "recoverable" now means

```
node scripts/production-backup.mjs rehearse --encrypted <artifact> \
  --passphrase-file <key> [--receipt <file>] [--into <file>]
```

It starts where a real recovery starts — the encrypted artifact and the key — and
finishes with rows read out of a database built from it:

1. decrypt;
2. re-validate the decrypted dump structurally, so the rehearsal is a complete
   proof on its own, runnable months later against a downloaded artifact;
3. **execute the SQL** into a throwaway SQLite database;
4. assert all twelve required kernel and sensitive-module tables are present;
5. assert the database is **not empty** — a schema-only export passes every check
   above it and would restore a life containing nothing;
6. `PRAGMA foreign_key_check` over the finished result.

Row **counts** are printed; row content never is. `node:sqlite` is Node's own
standard library, so this adds no dependency and no licensing question, and D1 is
SQLite — a dump SQLite will not load is a dump D1 will not load either.

It is not the *"one-click production restore"* `BACKUP_AND_RESTORE.md` § 5
refuses, and cannot become one: it speaks to no network, holds no Cloudflare
credential, and takes no argument that could name a real database. That is a
stronger guarantee than a warning in a docstring.

The workflow runs it on **every** backup, after `verify` and before anything is
uploaded.

### 2.4 The rehearsal, and the defect it found

Performed against a scratch, non-production D1. Full transcript in
[`BACKUP_AND_RESTORE.md` § 5.5](../development/BACKUP_AND_RESTORE.md).

**The finding: the documented restore command does not work, and never did.**

`BACKUP_AND_RESTORE.md` § 5.2 step 5 and § 5.3 step 4 told an operator to restore
a dump with `wrangler d1 execute <db> --file=dump.sql`. Measured against a real
`wrangler d1 export` of a database carrying the full committed schema (49
migration files, head `0047`) and the repository's seed, it fails on the first
`INSERT INTO entity_links`:

```
foreign key mismatch - "entity_links" referencing "entities"
```

**Mechanism, isolated.** A D1 export writes each table's DDL followed immediately
by its rows and puts every `CREATE [UNIQUE] INDEX` at the **end** of the file.
`entity_links` carries composite foreign keys — `REFERENCES entities
(workspace_id, id)` — whose parent key is unique only because of
`entities_workspace_id_key`, an index the dump does not create for another ~2,700
lines. `foreign key mismatch` is a **schema** error rather than a constraint
violation, so the `PRAGMA defer_foreign_keys=TRUE` the export itself emits on
line 1 does not defer it, and `PRAGMA foreign_keys=OFF` inside the file is
ignored because D1 does not take that pragma from user SQL.

| Restore attempt | Result |
| --- | --- |
| `wrangler d1 execute … --local --file=dump.sql` | **fails** — `foreign key mismatch` |
| the same with `PRAGMA foreign_keys=OFF;` prepended | **fails** identically |
| the same wrapped in `BEGIN; … COMMIT;` | **fails** identically |
| loaded with enforcement off, then `PRAGMA foreign_key_check` | **succeeds**, 0 violations |

The fourth row is what `rehearse` does, and it is the stronger question anyway:
*is the restored database intact?* rather than *was every intermediate state?*

**What is not known.** The **remote** path (`wrangler d1 execute --remote --file`)
goes through Cloudflare's D1 import endpoint rather than executing statements
locally, and may well be unaffected — Cloudflare designs export and import as a
pair. This environment has no Cloudflare credentials and therefore no evidence
either way, and a recovery document is the last place to record a guess. Raised
as [DEBT-199](PRODUCT_DEBT.md) with the exact one-command probe that settles it,
against a throwaway database and never production.

§ 5.0a of the recovery document now carries the measurement, the working command,
and the warning beside the `--remote` instruction rather than in place of it.

---

## 3. Green

*(§ 3 is completed in the same pass; see the sections below.)*

---

## 4. Released

### 4.1 The version decision

**`2.4.0`, one consolidated release.** Reasoning in
[`RELEASE_CHECKLIST_V2_4_0.md` § 2](../release/RELEASE_CHECKLIST_V2_4_0.md); in
one line: `2.1.0`, `2.2.0` and `2.3.0` were never built, never deployed and never
ran, the artefact is byte-identical for all four, so three of the four numbers
would identify nothing — and a version number's whole job is to answer *"which
build is live?"*.

`package.json`, `app/lib/version.ts` and `docs/release/` agree, held by
`test/unit/about/package-version.test.ts`. `APP_RELEASE_NAME` stays `"V2"`: its
own docstring says it is a release name and not a milestone name, and the shipped
product is still DalyHub V2. `DEPLOYMENT.md` still states no migration number of
its own.

### 4.2 What was produced

- [`RELEASE_NOTES_V2_4_0.md`](../release/RELEASE_NOTES_V2_4_0.md) — written for
  the person using DalyHub, stating plainly that this release incorporates the
  previously unreleased V2.1, V2.2 and V2.3 programmes, and naming the major
  product changes rather than dumping commit history.
- [`RELEASE_CHECKLIST_V2_4_0.md`](../release/RELEASE_CHECKLIST_V2_4_0.md) — the
  evidence, the recorded `verify:production` output, and the owner's deployment
  sequence in order, backup state first.

### 4.3 What was NOT done, and why

Nothing was deployed, no migration was applied, and production state is still
unknown. `pnpm run verify:production` was run at this commit and reports five
`SKIPPED` checks — its own honest answer to having no credentials — recorded
verbatim in the checklist. One thing it *did* establish: `hub.daly.id.au/health`
answers **302 to the Cloudflare Access login**, which is the intended hardening
and not an outage.

---

## 5. What remains, exactly

### 5.1 One owner action for Recoverable

Set `BACKUP_ENCRYPTION_PASSPHRASE` as an **environment** secret on the protected
`production` GitHub environment. Generation command, storage obligation, manual
dispatch, expected log lines and the two independent proofs to run afterwards are
in [`BACKUP_AND_RESTORE.md` § "Setting it for the first time"](../development/BACKUP_AND_RESTORE.md).
It is a single documented action, not an investigation.

### 5.2 Owner credentials for Released

The ordered sequence — backup, verify recovery, inspect migrations, preflight,
apply only pending committed migrations, deploy, verify, confirm health through
Access, record the evidence — is in
[`RELEASE_CHECKLIST_V2_4_0.md` § 6](../release/RELEASE_CHECKLIST_V2_4_0.md), with
the migration-discipline refusals stated beside it.

### 5.3 One measurement nobody here can make

[DEBT-199](PRODUCT_DEBT.md)'s remote half — § 2.4.

---

## 6. Scope discipline

Not done, deliberately, and none of it was started:

- **V2.4-GATE-02, FOLLOW-01 and FOLLOW-02.** Untouched.
- **The Plan dual-checkbox, semantic-overdue and one-day-phone defects**
  (DEBT-194/196/197). They belong to V2.4-GATE-02 and none of them blocked a
  GATE-01 test.
- **No schema or API change.** None was needed.
- **No new design phase, no new domain concept, no unrelated UI work.**
- **No E2E partition redesign.** § 3 records whether the manifest was
  regenerated and on what measurement.

---

## Related documents

- [`ROADMAP_V2_4.md`](../roadmap/ROADMAP_V2_4.md) — the item this implements.
- [`BACKUP_AND_RESTORE.md`](../development/BACKUP_AND_RESTORE.md) ·
  [`DEPLOYMENT.md`](../development/DEPLOYMENT.md) — the two authorities it works
  through.
- [`RELEASE_NOTES_V2_4_0.md`](../release/RELEASE_NOTES_V2_4_0.md) ·
  [`RELEASE_CHECKLIST_V2_4_0.md`](../release/RELEASE_CHECKLIST_V2_4_0.md)
- [`PRODUCT_DEBT.md`](PRODUCT_DEBT.md) — DEBT-198, DEBT-199, DEBT-139, DEBT-179,
  DEBT-173, DEBT-158, DEBT-180, DEBT-84, DEBT-157, DEBT-125.
