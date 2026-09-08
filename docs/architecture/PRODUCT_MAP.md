# PRODUCT_MAP — one product, one map

> **The operator's and developer's map of DalyHub at the end of V2.** Not a
> marketing page: what the product is made of, which question each surface
> answers, and which shared machinery every one of them runs on.
>
> Created by [V2.16 CONSOLIDATE](../roadmap/ROADMAP_V2_16.md), measured against
> `main` at `06f57c1`. If a domain is not on this page, it does not exist.

---

## The five questions

The rail is grouped by the question the owner has, not by the shape of the
records ([ADR-124](../decisions/ARCHITECTURE_DECISIONS.md)'s sibling decision in
CONSOL-00; the grouping itself is recorded in
[§6 of the strategy](../product/DALYHUB_POST_V2_8_PRODUCT_STRATEGY.md#6-information-architecture)
and implemented in
[`navigation-groups.ts`](../../app/shared/shell/navigation-groups.ts)).

| Question | Group | Destinations | Route |
|---|---|---|---|
| **What do I need to do?** | `do` | Today · Plan · Inbox · Upcoming · Tasks | `/today` `/plan` `/inbox` `/upcoming` `/tasks` |
| **Where does this belong?** | `organise` | Projects · Goals · Areas · Habits · Notes · Diary · Meetings · People | `/projects` `/goals` `/areas` `/habits` `/notes` `/diary` `/meetings` `/people` |
| **What do I need to deal with?** | `deal-with` | Life Admin · Assets | `/obligations` `/assets` |
| **Where is my money going?** | `money` | Finance | `/finance` |
| **What is changing over time?** | `understand` | Insight · Reports · Reviews · AI | `/analytics` `/reports` `/reviews` `/ai` |
| *(the tools, not a question)* | `system` | Views · Settings · Help · About | `/views` `/settings` `/help` `/about` |

**Insight's route is `/analytics` on purpose.** V2.13 relabelled the module and
deliberately did not move the URL: a relabel is not a migration, and every
bookmark and every existing link would have paid for it. The identifier is
historical; the label is the truth.

**A group name is never a route.** There is no `/do`, no `/organise`, no
`/deal-with`. A heading is navigation structure, and inventing a page to justify
a label is how a taxonomy becomes a product surface nobody asked for.

**Search is not in the table, and that is deliberate.** It is a utility over
every domain rather than a domain of its own, reached from the top bar, the
phone sheet and `⌘K`. Absorbing it into *Understand* would make it look like one
of the five answers.

**The phone bar is `Today · Tasks · Add · Projects · More`**, and has been for
the whole of V2. Three earned slots; Life Admin, Finance and Reports reach the
phone through Today's attention row and the More sheet, which is one tap.

---

## The shared machinery every domain runs on

Nothing below belongs to a module. Each is one authority, and each has a test
that says so — the point being that a new domain gets these for free and cannot
grow a private second one.

| Primitive | What it owns | Where | Its authority test |
|---|---|---|---|
| **Entity spine** | Area → Goal → Project → Task, and the one completion truth (`spine_records.completed_at`) | `app/kernel/spine`, `app/kernel/entities` | `test/kernel/entity-*.test.ts` |
| **EntityLinks** | Every relationship between any two records, typed and bidirectional | `app/kernel/entity-links` | `test/kernel/entity-link-*.test.ts` |
| **Activity** | One append-only stream; every derived history series reads it | `app/kernel/activity`, `app/kernel/activity-window` | `test/kernel/activity-*.test.ts` |
| **History** | One window / grain / series vocabulary (V2.9) | `app/kernel/history` | `test/unit/architecture/history-window-reads.test.ts` |
| **Obligation** | ONE due-and-recurring model, whether or not it has an Asset subject | `app/kernel/obligations` | `test/unit/architecture/one-obligation-domain.test.ts` |
| **Evidence** | One attachment child record, one private bucket, one derived object key | `app/kernel/attachments`, `app/platform/attachments` | `test/unit/architecture/one-attachment-surface.test.ts` |
| **Reports** | One deterministic executor over a closed per-source vocabulary | `app/kernel/reports` | `test/kernel/reports.test.ts` |
| **Finance** | One signed money convention; balances DERIVED, never stored | `app/kernel/finance` | `test/unit/architecture/finance-boundaries.test.ts` |
| **AI FactBlock** | The whole of what a model may state, cited by id | `app/kernel/ai`, `app/platform/ai` | `test/unit/architecture/grounded-ai-boundaries.test.ts` |
| **Proposal apply** | ONE authority that turns a reviewed proposal into a mutation | `app/modules/ai/apply-proposal.ts` | `test/unit/architecture/proposal-apply-authority.test.ts` |
| **Export / restore** | One collection registry, one archive, one restore contract | `app/kernel/export`, `app/kernel/restore` | `test/kernel/workspace-data-map.test.ts` |
| **Navigation** | One registry-derived model; one active rule; one group vocabulary | `app/platform/modules`, `app/shared/shell` | `test/unit/modules/navigation-information-architecture.test.ts` |
| **Search** | One provider registry; one excerpt contract; one privacy boundary | `app/shared/search` | `test/kernel/search-route.test.ts` |
| **Destinations** | One answer to "where does a link to this record go?" | `app/shared/entity/destination.ts` | `test/unit/architecture/v3-readiness-registry.test.ts` |

And the audit ACROSS them:
[`v3-readiness-registry.test.ts`](../../test/unit/architecture/v3-readiness-registry.test.ts)
proves every durable entity type is registered everywhere it must be — owned by
exactly one module, visually identified or excepted with a stated reason,
navigable, searchable, in a known navigation group, and stored in a table
classified for recovery. **A domain cannot become half-wired**, which is the
failure a set of individually-satisfiable registries otherwise invites.

---

## Where the data is

| | |
|---|---|
| **D1** | Sixty tables, every one workspace-scoped except `workspaces` itself. Classified in [`workspace-data-map.ts`](../../app/platform/storage/d1/workspace-data-map.ts): 45 `exported`, 13 `operational`, 2 `ephemeral`. |
| **R2 — `dalyhub-v2-attachments`** | The owner's live evidence, under a derived per-workspace prefix. Bound to the application Worker; no public URL, no signed URL. |
| **R2 — `dalyhub-v2-backups`** | The nightly D1 dump, in a separate trust boundary. The application Worker deliberately **cannot reach it**. |
| **GitHub artifact** | The encrypted off-Cloudflare copy. Owner-gated ([DEBT-198](../product/PRODUCT_DEBT.md)). |

> **There is no persistent owner-data table outside an explicit export policy.**
> Proved against the real migrated schema on every kernel run.

---

## What the product refuses, and why it stays refused

Recorded here so a reader does not have to reconstruct it from eight ADRs:

- **No AI that acts.** It proposes; the owner disposes; one apply authority; every change is undoable ([ADR-004](../decisions/ARCHITECTURE_DECISIONS.md#adr-004-ai-proposal-architecture), [ADR-123](../decisions/ARCHITECTURE_DECISIONS.md)).
- **No figure a model invented.** A FactBlock is the whole of what may be stated, and the response schema has no numeric field at all ([ADR-122](../decisions/ARCHITECTURE_DECISIONS.md)).
- **No stored balance.** Money is derived from the transactions, on both sides of a restore ([ADR-120](../decisions/ARCHITECTURE_DECISIONS.md)).
- **No second recurrence engine.** One Obligation model; Finance settles it, it does not re-implement it ([ADR-118](../decisions/ARCHITECTURE_DECISIONS.md)).
- **No dashboard on Today.** Today is the daily ACTION surface, not a warehouse.
- **No score, index or grade.** Anywhere, of anything.
- **No manufactured urgency, streak or badge.**
- **No delete-workspace button.** A decision, with a proved procedure instead ([ADR-124](../decisions/ARCHITECTURE_DECISIONS.md)).

---

## Related documents

- [`ARCHITECTURE_OVERVIEW.md`](ARCHITECTURE_OVERVIEW.md) — how the pieces fit together technically
- [`ROADMAP_V2_16.md`](../roadmap/ROADMAP_V2_16.md) — the release that drew this map
- [`V3_BOUNDARY.md`](../product/V3_BOUNDARY.md) — whether the product is ready to cross it
- [`DALYHUB_POST_V2_8_PRODUCT_STRATEGY.md`](../product/DALYHUB_POST_V2_8_PRODUCT_STRATEGY.md) — the analysis the five questions come from
- [`WORKSPACE_DELETION.md`](../development/WORKSPACE_DELETION.md) · [`BACKUP_AND_RESTORE.md`](../development/BACKUP_AND_RESTORE.md) · [`EXPORT_AND_PORTABILITY.md`](../development/EXPORT_AND_PORTABILITY.md) — what happens to the data
