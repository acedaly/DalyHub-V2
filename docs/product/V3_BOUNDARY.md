# V3_BOUNDARY — measured, clause by clause

> **A gate, not a feeling.** Every clause below is **TRUE**, **FALSE**,
> **OWNER-GATED** or **RE-HOMED**. There is no "mostly ready".
>
> Measured 2026-09-08 by [V2.16 CONSOLIDATE](../roadmap/ROADMAP_V2_16.md)
> against the branch that closes V2. The clauses are
> [§12 of the post-V2.8 strategy](DALYHUB_POST_V2_8_PRODUCT_STRATEGY.md#12-the-v3-boundary),
> restated only where the strategy's sentence contains two claims that resolve
> differently — which happens once, and it matters.

---

## The two questions, and why they are two

> **Can this repository legitimately say V2 is consolidated?**

and

> **Can V3 begin?**

They are not the same question, and V2.16 is the release that had to stop
treating them as one. The first is about the code and the repository, and it is
answerable here. The second is about whether anything **blocks** the next
architectural step — and an optional owner-held activation (a provider key, a
GitHub environment secret) does not, unless the strategy makes it a hard gate.
It does not: §12 gates V3 on the product's ARCHITECTURE being mature, and names
production activation separately.

Conflating them would mean V3 can never begin for a reason that has nothing to
do with the code. Ignoring the difference would mean claiming a product is
ready for real money when its off-Cloudflare backup has never once run. Both
are stated below, separately.

---

## The boundary

| # | Clause | State | Evidence |
|---|---|---|---|
| 1 | **Spine mature** — Tasks / Projects / Goals / Reviews | **TRUE** | True before this programme began; unchanged by it. One completion authority (`spine_records.completed_at`), one recurrence engine, one Review model with persisted insight snapshots. |
| 2 | **Life Admin mature** — one Obligation model, every due-and-recurring thing in one place, surfaced through one row | **TRUE** | V2.10 + V2.12. `one-obligation-domain.test.ts` is the structural proof; a subject-less obligation with an amount is created, settled by a transaction and read back in the whole-product rehearsal. |
| 3 | **Finance core mature** — imports idempotent, months readable, budgets honest, obligations settled | **TRUE** | V2.12 + V2.13. Two independent database constraints make an import idempotent; balances are DERIVED and recomputed on both sides of a restore; a transfer pair stays out of spending; a settled obligation keeps its transaction. All of it in the rehearsal's truth manifest. |
| 4 | **Reports mature** — definitions saved, deterministic, over every domain | **TRUE** | V2.13. A saved definition is a third saved-view kind with no store of its own; the rehearsal RE-EXECUTES one after a restore and compares its machine result. |
| 5a | **Grounded AI available** — the provider never owns product truth | **TRUE** | V2.14. One gateway, one FactBlock contract, a response schema with no numeric field, and a deterministic provider at the adapter seam so the whole path is proven without a key. |
| 5b | **Grounded AI proven LIVE** | **OWNER-GATED** | No request has ever been sent from this repository to a real provider. The key is owner-held. [DEBT-213](PRODUCT_DEBT.md) stays open for the same reason and was not closed on fake-provider evidence. |
| 5c | **Assisted proposals through ONE path** | **TRUE** | V2.15. A closed typed vocabulary behind one registry; `proposal-apply-authority.test.ts` asserts the authority is called from exactly one file, and V2.16 falsified it by adding a second caller. |
| 6 | **Attachments and evidence available, backed up, restorable** | **TRUE** | V2.11 for the mechanism; V2.16 for the whole-product proof. Real bytes, real R2, destroyed and restored, byte-compared — including two files with one filename, which is the case a filename-keyed store would collapse. |
| 7a | **Architecture consolidated — the question-first rail** | **TRUE** | V2.16 CONSOL-00. Six groups, no URL moved, the phone bar unchanged, and the grouping in the accessibility tree rather than only on screen. |
| 7b | **Architecture consolidated — deletion** | **TRUE** | V2.16 CONSOL-01, [ADR-124](../decisions/ARCHITECTURE_DECISIONS.md). A decided boundary with a PROVED procedure — which is what the clause asks for. A boundary is a decision, not necessarily a button. |
| 7c | **Architecture consolidated — one recurrence engine per domain and no more** | **TRUE** | `one-obligation-domain.test.ts`, falsified by adding a second occurrence function. |
| 7d | **Architecture consolidated — every store in the archive and the rehearsal** | **TRUE** | V2.16 CONSOL-02. All sixty tables classified, checked against the REAL migrated schema in both directions; the rehearsal covers every durable domain and compares derived owner-facing values, not row counts. |
| 7e | **Architecture consolidated — the register closed or re-homed** | **TRUE** | V2.16 CONSOL-03. Ninety-eight entries, zero ambiguous: 3 closed against their own stated closing conditions, 1 deferred to the dedicated PR its own condition names, 10 owner-gated, 82 re-homed with a stated reason, 2 struck, 0 left open without a home. |
| 8 | **CI / order proof** | **OWNER-GATED** | [DEBT-203](PRODUCT_DEBT.md) (ten consecutive green runs), [DEBT-125](PRODUCT_DEBT.md) (two consecutive green gates on `main`) and [DEBT-157](PRODUCT_DEBT.md) (a green run's artefacts) are all counts nobody can produce from a branch. The mechanisms are closed; the measurements are owner-dispatched. |

---

## Production activation — a separate table, and a different question

The code session cannot see the owner's infrastructure. **Nothing below is
inferred**: each row says what the repository can prove and what it cannot.

| Capability | Question | State | What the repository can prove |
|---|---|---|---|
| **Attachments** | Is the production bucket created and bound? | **OWNER-HELD** | The binding is declared in `wrangler.jsonc` for `env.production` and the whole read/write/delete path is proven over real R2 in the kernel suite. Whether the bucket exists in the owner's account, and whether a real upload has been made through it, is not visible from here. |
| **Finance** | Is it safe for real financial data? | **OWNER-GATED by [DEBT-198](PRODUCT_DEBT.md)** | The R2 backup copy is healthy (20 consecutive successful runs, measured 2026-08-30). The **off-Cloudflare** copy has never succeeded: 28 runs, 0 successes, because the GitHub `production` environment holds **none of its four required secrets**. A lost or compromised Cloudflare account is still unrecovered. |
| **Grounded AI** | Is a provider key configured, and has a real call been made? | **OWNER-HELD** | No. `scripts/ai-integration-check.mjs` exists and has never been run against a live provider; the fake provider is architecturally forbidden in production (`grounded-ai-boundaries.test.ts`). |
| **Assisted AI** | Is the production gate satisfied? | **OWNER-HELD** | It inherits Grounded AI's gate. Nothing in the assisted path can run without the same key. |
| **Backups** | Does an off-Cloudflare artefact exist, and has a restore FROM it been proven? | **NO, and NO** | Neither has ever happened. The workflow, the encryption, the validation and the restore procedure are all built and unit-proven with a real `gpg` round trip; the artefact and the rehearsal are owner actions. |

**One security decision sits in front of DEBT-198 and is not a formality**: the
repository is public and the `production` environment has no protection rules,
so putting a D1-export-capable Cloudflare API token there exposes it to anyone
who gains write access. Required reviewers and a branch policy first, or a
deliberate decision that this tier is not worth the token.

---

## The answers

### Can this repository legitimately say V2 is consolidated?

> ## YES.

Every clause of §12's architecture half is TRUE and each is asserted by
something that fails when it stops being true. The two clauses that are not —
5b and 8 — are **measurements**, not code: a live provider call and a count of
green CI runs. Neither is a thing a contributor can produce, and neither is
about whether the architecture is consolidated.

### Can V3 begin?

> ## YES — architecture only, with two named conditions.

V3 is a **definition and product-strategy pass**, not an implementation one.
Nothing it needs to do is blocked:

- the spine, Life Admin, Finance, Reports, Evidence, grounded and assisted AI
  are all mature and structurally proven;
- the architecture is consolidated, and the register carries no ambiguous loop
  for V3 to inherit;
- **every re-homed entry already has a V3 category**, so the definition pass
  starts from a classified backlog rather than from a register.

The two conditions, stated so they are not discovered later:

1. **V3 must not treat the owner-gated clauses as done.** A V3 capability that
   depends on live AI cannot be accepted on fake-provider evidence, and one that
   depends on the E2E gate being deterministic cannot be accepted before
   DEBT-203's count exists.
2. **V3 must not choose its first capability from this document.** The
   re-homed backlog is a HOME, not a roadmap. The first V3 capability is chosen
   by re-measuring the now-consolidated product against owner value — the same
   way every release since V2.10 has been defined, and explicitly not by taking
   the first item on a list.

### Are all optional production features activated?

> ## NO.

Three are not, and none of them is a code gap: an off-Cloudflare backup that has
never run, an AI provider that has never been called, and an attachment bucket
whose existence this repository cannot see. They gate **production use of the
features they belong to** — real financial data most of all — and they gate
nothing about V3 development.

---

## What must NOT happen next

- **Do not start V3 here.** V2.16 creates no V3 feature code, and this document
  is not a plan.
- **Do not pick dashboards as V3.0 by default.** They are the most-named V3
  candidate and that is not a reason. The next pass re-measures.
- **Do not close an owner-gated clause on a green test run.** The clause names
  a measurement; a passing suite is not it.

---

## Related documents

- [`DALYHUB_POST_V2_8_PRODUCT_STRATEGY.md`](DALYHUB_POST_V2_8_PRODUCT_STRATEGY.md#12-the-v3-boundary) — the clauses this measures
- [`ROADMAP_V2_16.md`](../roadmap/ROADMAP_V2_16.md) — the release that measured them
- [`PRODUCT_DEBT_V2_16_DISPOSITION.md`](PRODUCT_DEBT_V2_16_DISPOSITION.md) — every open entry, with its home and its V3 category
- [`PRODUCT_MAP.md`](../architecture/PRODUCT_MAP.md) — what the consolidated product is made of
- [`BACKUP_AND_RESTORE.md`](../development/BACKUP_AND_RESTORE.md) — the recovery authority behind clause 6 and the backups row
