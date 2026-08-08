# ROADMAP_V2_1.md — What comes after DalyHub V2

> The work that is **deliberately not in V2**, in the order it should be built.
>
> [`ROADMAP_V2.md`](ROADMAP_V2.md) is the record of what V2 *is*, and it is now
> closed: every item in it is either delivered or explicitly listed here. This file
> is where the remaining work lives so the V2 record can stop growing.
>
> The rules are unchanged: [`AGENTS.md`](../../AGENTS.md) tells you *how* to build;
> this tells you *what*. One item per PR. Status is updated in the PR that changes
> it. No time estimates.

Legend: **☐** not started **◐** in progress **◑** partly delivered **☑** done

---

## Immediate blockers — 5 August 2026 end-to-end audit

> Added by the independent
> [End-to-End Audit — 5 August 2026](../product/END_TO_END_AUDIT_2026_08_05.md),
> which re-checked `main` (`ca3577d`) against the code rather than the checkboxes.
> These are **the first work to do**, ahead of everything below including SET-02.
> Two are confirmed, reproduced, release-blocking data-integrity defects on core
> daily-use paths; the audit reproduced both against the committed migration schema
> and deliberately did **not** fix them. The audit's verdict, as written against
> `ca3577d`, is **"Not ready for normal daily use pending these two blockers."**
>
> **Status since.** **Both P1 audit blockers are now resolved** — AUDIT-FIX-01
> (recurring re-completion) and AUDIT-FIX-02 (meeting-item remove-then-add); see
> their entries below. **AUDIT-FIX-03** (permanent-delete integrity for Assets and
> Reviews) is resolved too, closing the first two P2 data-integrity findings, and
> **AUDIT-FIX-04** (application-level CSRF defence-in-depth + the `react-router`
> `8.3.0` bump) closes the security pair.
> Each was reproduced against real Workers/D1 before it was changed and each
> carries new regression coverage. **Production verification
> remains separate and is still outstanding** — the audit could not reach the
> authenticated production environment (§4, §19), so "the blockers are fixed in
> `main`" is not the same claim as "production is verified", and AUDIT-FIX-05's
> documentation-truth work still stands. The audit report itself is left as the
> historical assessment of `ca3577d` and is not rewritten: both defects were real
> at that commit, and the verdict written there was correct when it was written.
>
> These are **product defects**, so they live here in the roadmap; their testing,
> security and observability dimensions are recorded in
> [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) (DEBT-79…DEBT-88).

### ☑ AUDIT-FIX-01 — Recurring task cannot be completed again after reopen (P1)

- **Finding.** [AUDIT-01](../product/END_TO_END_AUDIT_2026_08_05.md#audit-01--recurring-task-cannot-be-completed-again-after-reopen--p1).
  Completing a recurring task, reopening it, then completing it again violates
  `UNIQUE (workspace_id, series_id, sequence)` on `task_recurrence_rules`; the batch
  rolls back and the occurrence can **never** be completed again in-product.
- **Root cause.** The reopen withdraw (`d1-task-repository.ts` `#withdrawSuccessorStatement`,
  ~`:3993`) soft-deletes only the successor's `entities` row, leaving its recurrence
  row; `#planSuccessor` (~`:3468`) re-plans the same `sequence`; the insert's
  `ON CONFLICT (workspace_id, entity_id)` does not cover the series/sequence UNIQUE.
- **Fix.** Delete the withdrawn successor's `task_recurrence_rules` row inside the
  withdraw batch, **or** guard the successor insert with `NOT EXISTS (series_id,
  sequence)` — the correct pattern already exists at
  `d1-asset-history-repository.ts:1568`.
- **Required regression test.** complete → reopen → complete a recurring occurrence
  asserts success and a single series row (the missing case in
  `test/kernel/task-recurrence-storage.test.ts`).
- **This reopens the recurrence half of [TASKS-04](ROADMAP_V2.md#-tasks-04--daily-driver-tasks-inbox-inline-editing-and-basic-recurrence).**
  TASKS-04 is otherwise delivered; only recurring re-completion is broken.
- **Size.** Small. **Priority.** P1 — first item of V2.1.

- **Resolved (2026-08-05).** Reproduced first against real Workers/D1 through the
  task repository — occurrence seq 0 completed → successor at seq 1 → reopen
  soft-deleted the successor's `entities` row while its `task_recurrence_rules` row
  kept seq 1 → the second completion raised `TaskStorageError` wrapping
  `UNIQUE constraint failed: task_recurrence_rules.workspace_id, series_id, sequence`
  and rolled the whole batch back.

  **The lifecycle correction — both halves, because the slot has two meanings.** A
  recurrence row RESERVES a `(series_id, sequence)` slot, so the fix makes the
  reservation follow the occupancy rather than suppressing the constraint (the
  constraint is untouched, no exception is caught, and no migration was needed):

  1. **The withdrawal releases the slot it empties.** `reopenTask` now runs
     `#releaseWithdrawnRecurrenceStatement` in the SAME batch as the withdrawal,
     gated on the successor carrying *this batch's* `deleted_at` — so the row goes
     only when the successor actually went, and a successor the guarded withdrawal
     declined to touch keeps both its task and its place in the series. Per
     [ADR-062](../decisions/ARCHITECTURE_DECISIONS.md#adr-062-intentional-unassigned-tasks-inbox-semantics-and-calendar-recurrence)
     §6 a recurrence row is per-occurrence configuration, not history: a COMPLETED
     occurrence keeps its row (that is what preserves the series for undo), while a
     WITHDRAWN one has nothing left to configure.
  2. **The successor group recognises a live occupant, and releases a stale one.**
     `#buildSuccessorGroup` gained two complementary SQL predicates: it declines
     ENTIRELY when a LIVE task already holds the slot (a successor retained because
     it was edited/linked/completed, or one a concurrent completion just created),
     and it releases a STALE row first when the slot's task is soft-deleted (the
     reopen withdrew it, or the owner trashed it). The group is a cascade off the
     entity insert, so declining writes no entity, spine record, detail row,
     recurrence row or Activity — never a detached half-task. `completeTask` then
     reports the occurrence that already holds the slot, read back by series
     identity inside the workspace, so a retained successor is recognised rather
     than duplicated, overwritten or silently reported as missing.

  Unchanged by design: exactly-one-successor under retry and concurrency, the
  completion gate, the withdrawal safety rules, atomicity, and the activity contract
  (no `withdrawn` event for a retained successor; no second `created` event for one
  effective successor).

  **Source.** [`app/platform/storage/d1/d1-task-repository.ts`](../../app/platform/storage/d1/d1-task-repository.ts)
  (`completeTask`, `#buildSuccessorGroup`, `reopenTask`,
  `#releaseWithdrawnRecurrenceStatement`, plus a TEST-ONLY `reopenFault` injection
  point); contract wording in [`app/kernel/tasks/task.ts`](../../app/kernel/tasks/task.ts).

  **Regression tests.** Seven new real Workers/D1 cases in
  [`test/kernel/task-recurrence-storage.test.ts`](../../test/kernel/task-recurrence-storage.test.ts)
  (§"re-completing a reopened recurring occurrence"): the reported regression
  (complete → reopen → complete, asserting success, one active seq-1 successor, one
  recurrence row and no orphan); a RETAINED edited successor (completion succeeds,
  the existing successor is returned unchanged, no second task or row); a repeated
  three-cycle lifecycle; a concurrent RE-completion plus retry; the owner-trashed
  successor; and two atomic-rollback cases proving neither the slot release nor the
  successor can commit without their reopen/completion.

### ☑ AUDIT-FIX-02 — Meeting item remove-then-add throws HTTP 500 (P1)

- **Finding.** [AUDIT-02](../product/END_TO_END_AUDIT_2026_08_05.md#audit-02--meeting-item-remove-then-add-of-same-kind-throws-http-500--p1).
  Removing a non-last meeting item and adding another of the same kind violates
  `UNIQUE (workspace_id, meeting_id, kind, position)`; `addItem` throws a raw
  `Error` (HTTP 500) and that item kind stays un-addable until the trailing item is
  removed.
- **Root cause.** `d1-meeting-repository.ts` `addItem` (~`:439`) sets `position =
  count-of-kind` while `removeItem` (~`:457`) never renumbers.
- **Fix.** Derive `position` as `MAX(position)+1` per kind (or renumber on remove);
  wrap the raw error in a typed, user-legible failure.
- **Required regression test.** add-remove-add of one kind (the missing case in
  `test/kernel/meeting-follow-up.test.ts`).
- **This reopens the item-editing half of [MEET-01](ROADMAP_V2.md#-meet-01--meeting-record).**
- **Size.** Small. **Priority.** P1 — second item of V2.1.

- **Resolved (2026-08-05).** Reproduced first against real Workers/D1 through the
  meeting repository, before any code changed. Three agenda items were created at
  positions `0, 1, 2`; removing the FIRST left the survivors at `1, 2` (removal
  correctly renumbers nothing); the next `addItem` computed `position = count = 2`,
  which item `2` still held, and the insert raised
  `D1_ERROR: UNIQUE constraint failed: meeting_items.workspace_id,
  meeting_items.meeting_id, meeting_items.kind, meeting_items.position`
  as an untyped `Error`, rolling the whole batch back. Every item kind was
  affected, and the kind stayed un-addable until the trailing items were removed
  too.

  **One correction to the audit's wording, recorded rather than quietly fixed.**
  The finding is titled "throws HTTP 500", and the raw error at the repository was
  exactly as described — but at the route boundary
  ([`meetings/routes/mutate.tsx`](../../app/modules/meetings/routes/mutate.tsx)) the
  existing catch-all already converted it to **HTTP 400** with the generic
  "That change couldn’t be saved.", and the capture bar kept the user's typed text.
  So the *user-visible* symptom was a silently un-addable item kind, not a 500 page
  or leaked SQL. That makes the defect no less blocking — the workflow was broken
  and the failure was opaque — and the audit's diagnosis, evidence and severity all
  stand. Verified on the fixed `main`, not assumed from the report.

  **The allocation strategy: `MAX(position) + 1`, computed INSIDE the insert.**
  `position` is now an ordinal allocated by the database, scoped to
  `(workspace_id, meeting_id, kind)` — exactly the scope of the UNIQUE index — in
  the same statement (and therefore the same SQLite transaction) that writes the
  row. There is no read-then-write window, no in-memory value that can go stale, no
  row count, no unscoped maximum and no client-supplied position. The result is
  always strictly greater than every LIVE ordinal of that kind, so an interior gap
  is skipped and existing items are never disturbed; a freed TAIL ordinal is reused,
  which is safe precisely because no live row holds it. Renumbering on removal was
  rejected: positions are display order only (a follow-up mapping is keyed on the
  stable `meeting_items.id` — MEETINGS_MODULE.md), reads already order by
  `(kind, position, id)` and are unaffected by gaps, and renumbering would write
  every sibling row on each removal for no product gain.

  **No migration, and the constraint is untouched.** The schema was investigated and
  found correct: `UNIQUE (workspace_id, meeting_id, kind, position)`
  (`0021_ux01_tasks_meetings_usability.sql`) is retained as the final integrity
  boundary. This was an allocation and error-handling defect, not a schema one.

  **Concurrency.** The insert's `FROM meeting_details JOIN entities` re-authorizes
  the meeting on the write itself (live, `meeting`-typed, unarchived, in the bound
  workspace), so a meeting archived or deleted between the read and the write
  changes no row — and because the Activity appends are guarded on the domain
  statement's `changes()`, nothing is logged either. If two same-kind appends ever
  do allocate the same ordinal, the losing batch rolls back ENTIRELY and is retried
  a bounded, deterministic **3** attempts (never an unbounded loop) against the
  freshly-committed maximum; each attempt builds a NEW Activity event, so a
  successful retry leaves exactly one item and exactly one event. Exhausting the
  budget surfaces a typed `MeetingItemConflictError`, never a raw uniqueness
  exception.

  **Typed errors.** `addItem`/`removeItem` now raise the module's existing error
  family — `MeetingNotFoundError` (missing, soft-deleted, wrong type or another
  workspace, all indistinguishable), `MeetingArchivedError`, and
  `MeetingValidationError` for an unknown kind or empty body — plus two new kernel
  errors beside them: `MeetingStorageError` (wraps any raw D1 failure, preserving
  `cause`, so no constraint text can reach a response) and
  `MeetingItemConflictError` (the bounded-contention case, carrying its own
  recovery copy). The route names the conflict as a 409, logs an unexpected
  `MeetingStorageError` by name and message only, and still answers everything else
  with the existing calm generic copy.

  **Activity integrity.** An append and its `meeting.updated` event are now ONE
  atomic mutation via `recordAtomicMutation`; a failed insert writes neither. A
  removal is now atomic with its event too — previously it wrote **no** Activity at
  all — and, being guarded on the delete's `changes()`, removing an already-removed
  item is a truthful no-op that returns `false` and logs nothing.

  **Source.** [`app/platform/storage/d1/d1-meeting-repository.ts`](../../app/platform/storage/d1/d1-meeting-repository.ts)
  (`addItem`, `removeItem`, `APPEND_ITEM_SQL`, `REMOVE_ITEM_SQL`, `#eventModel`,
  plus a TEST-ONLY `itemFault` injection point);
  [`app/kernel/meetings/meeting-repository.ts`](../../app/kernel/meetings/meeting-repository.ts)
  (the ordering contract, `MeetingStorageError`, `MeetingItemConflictError`);
  [`app/modules/meetings/routes/mutate.tsx`](../../app/modules/meetings/routes/mutate.tsx).

  **Regression tests.** 27 new real Workers/D1 cases in
  [`test/kernel/meeting-item-positioning.test.ts`](../../test/kernel/meeting-item-positioning.test.ts):
  the reported agenda regression (and the same sequence for **every** item kind —
  agenda, decision, outcome, action); a middle-item removal; per-kind independence
  with interleaved writes; last-item removal and a fully-emptied kind; five
  add/remove/add cycles across all kinds asserting uniqueness, deterministic order,
  no un-addable kind and no orphan rows or events; workspace isolation in both
  directions; atomic rollback of a faulted add and of a faulted remove; concurrent
  same-kind additions and a 16-way burst; the typed validation/archived/not-found
  refusals; and route-level coverage proving remove-then-add returns a normal
  success for every kind, that an edge-case refusal is a handled 409 rather than a
  5xx, and that no SQLite/D1 vocabulary appears in any response body.

### ☑ AUDIT-FIX-03 — Permanent-delete integrity: asset + review purge (P2)

- **Findings.** [AUDIT-03](../product/END_TO_END_AUDIT_2026_08_05.md#audit-03--asset-permanent-delete-writes-no-audit-event-and-destroys-history--p2)
  (asset purge writes no tombstone event and destroys history untombstoned) and
  [AUDIT-04](../product/END_TO_END_AUDIT_2026_08_05.md#audit-04--review-permanent-delete-nondeterministicempty-tombstone-non-idempotent--p2)
  (review purge breaks the activity-recorder ordering contract → nondeterministic/
  empty tombstone, non-idempotent second purge, silent active-link destruction).
- **Fix.** Bring both onto the **Area purge pattern** (`d1-spine-repository.ts` —
  guarded child-first delete, retained `activities`, subject-less `{id, title}`
  tombstone, idempotent second purge). Regression tests: tombstone presence +
  double-purge idempotency + active-link handling.
- **Debt.** DEBT-79 (asset), DEBT-80 (review). **Size.** Medium. **Priority.** P2.

- **Resolved (2026-08-05).** Both defects were reproduced first against real
  Workers/D1 through the actual repositories, before any code changed.

  **Asset — reproduced.** An Asset with one history event, one obligation and
  three Activity rows was permanently deleted. The purge removed the `entities`,
  `asset_details`, `asset_events` and `asset_obligations` rows and all three
  `activity_subjects` pointers; the three `activities` rows correctly SURVIVED;
  and the count of `asset.deleted` events was **0**. There was no such event type
  in the kernel at all. The result was `{deleted: true}`, and a second purge
  already returned `{deleted: false}` — so the defect was precisely and only the
  missing audit record, exactly as the audit described. The active-link refusal
  and commit-time guards were verified working and are preserved unchanged.

  **Review — reproduced, all five parts.** A Review with sections and history was
  purged: the tombstone was written with payload **`{}`**; the subject row the
  recorder inserted for that very event was then deleted by the same batch's
  `activity_subjects` DELETE, leaving the event both anonymous and subject-less by
  accident rather than by design; an ACTIVE link to an Area was **silently
  destroyed** (`linksAfter: 0`) to let the purge succeed; and two concurrent
  purges produced one `{deleted: true}` alongside a rejected promise carrying
  `ReviewStorageError` ← `D1_ERROR: FOREIGN KEY constraint failed:
  SQLITE_CONSTRAINT` — while committing **two** tombstones for one destroyed
  Review, because a leading append reads a stale, unrelated `changes()`.

  **The ordering rule, and why it is the whole fix.** `D1ActivityRecorder` guards
  its event insert with `WHERE changes() > 0`, which reads the statement
  IMMEDIATELY BEFORE it in the batch. Reviews placed the append FIRST, so the
  guard was reading whatever ran last — hence a tombstone that fired regardless of
  whether anything was deleted. Both repositories now put the authoritative
  `entities` DELETE (with `RETURNING`) second-to-last and the tombstone insert
  directly after it. The guard cannot be hung on an earlier child DELETE: those
  legitimately match zero rows for a Review with no links or an Asset with no
  history, while the record itself is still destroyed.

  **Final statement ordering.** Asset (`permanentlyDelete`): `entity_links` →
  `activity_subjects` → `asset_events` → `asset_obligations` → `asset_details` →
  `entities` (`RETURNING`) → subject-less `asset.deleted`. Review: `entity_links`
  → `activity_subjects` → `review_sections` → `review_details` → `entities`
  (`RETURNING`) → subject-less `review.deleted`. Child-first throughout, so no
  `ON DELETE RESTRICT` foreign key is ever violated, and every destructive
  statement repeats the SAME "no active link" guard so the batch is strictly
  all-or-nothing **evaluated at commit** — closing the read→submit race in which a
  link is created after the precheck.

  **Subject-less by design, not by accident.** A tombstone's subject would point
  at the `entities` row the same batch removed. So neither event inserts an
  `activity_subjects` row, and each carries the destroyed record's identity in an
  immutable payload instead: `{assetId, title}` and `{reviewId, title}` — the same
  shape `area.deleted` has carried since ADR-012. Existing `activities` rows about
  the record are RETAINED; only their now-obsolete subject pointers go, and
  removing a pointer never removes the event it points at.

  **Active links now refuse on both paths.** Reviews previously deleted them.
  Both repositories now count only ACTIVE links (`deleted_at IS NULL`), scoped to
  the workspace, in either direction, and return
  `{deleted: false, blockedReason: "has_links", linkCount}` — `ReviewDeleteResult`
  gained the two fields so it matches `AssetDeleteResult`. Soft-deleted links do
  not block; they are the record's own dead rows and the purge removes them with
  it. No active relationship is ever severed to make a deletion succeed.

  **Idempotency and concurrency come from SQL, not from swallowing errors.** No
  `catch` suppresses a database failure. An already-gone record short-circuits
  before the batch and writes nothing; the loser of a race has its `entities`
  DELETE match zero rows, so `changes()` is 0, the tombstone never fires, and the
  repository then distinguishes "already gone" from "blocked at commit" with one
  read rather than a guess. Exactly one tombstone can exist per destroyed record.

  **Presentation.** `review.deleted` used to render through a subject-resolving
  descriptor and, with no subject to find, degraded to an anonymous "permanently
  deleted this review". Both events now use one shared
  `purgeTombstoneDescriptor` that names the record from its own payload as
  emphasis — never a link, which could only lead to a 404 — with a calm fallback
  when a payload cannot supply one, keeping `describe` pure and total. Scoped
  deliberately to these two event types; no other Activity path was touched and no
  Activity-recorder refactor was done.

  **No migration.** The foreign keys and uniqueness constraints are the integrity
  boundary and are untouched. This was a statement-ordering, guard and audit
  defect, not a schema one. No deployment and no production data change.

  **Source.** [`app/platform/storage/d1/d1-asset-repository.ts`](../../app/platform/storage/d1/d1-asset-repository.ts)
  (`permanentlyDelete`, plus a TEST-ONLY `deleteFault` injection point);
  [`app/platform/storage/d1/d1-review-repository.ts`](../../app/platform/storage/d1/d1-review-repository.ts)
  (`permanentlyDelete`, `deleteFault`);
  [`app/kernel/assets/asset-identifiers.ts`](../../app/kernel/assets/asset-identifiers.ts)
  (`ASSET_DELETED`);
  [`app/kernel/reviews/review.ts`](../../app/kernel/reviews/review.ts)
  (`ReviewDeleteResult.blockedReason` / `.linkCount`);
  [`app/shared/activity-feed/purge-tombstone.ts`](../../app/shared/activity-feed/purge-tombstone.ts);
  [`app/shared/record-lifecycle/lifecycle-copy.ts`](../../app/shared/record-lifecycle/lifecycle-copy.ts)
  (`lifecycleBlockedByLinks`);
  the Asset and Review activity descriptors, module manifests, `routes/mutate.tsx`
  and record components.

  **Regression tests.** Five new real Workers/D1 Asset cases in
  [`test/kernel/asset.test.ts`](../../test/kernel/asset.test.ts) and six new
  Review cases in [`test/kernel/review.test.ts`](../../test/kernel/review.test.ts)
  — successful-purge tombstone (payload, subject-lessness, retained history,
  removed pointers, feed rendering), second-purge idempotency, active-link
  blocking then release, soft-deleted links not blocking, a commit-time link race,
  a genuine two-way concurrent purge, and fault-injected rollback at BOTH
  `after-entity` and `after-tombstone`. A new cross-module suite,
  [`test/kernel/permanent-delete-contract.test.ts`](../../test/kernel/permanent-delete-contract.test.ts),
  asserts the eight shared invariants across Area, Asset and Review in parallel
  rather than forcing them into one abstraction. Two unit suites cover the new
  shared presentation and copy. The pre-existing Review test that asserted an
  active link was silently deleted was REPLACED, because that behaviour was the
  defect.

### ☑ AUDIT-FIX-04 — CSRF defence-in-depth + react-router bump (P2/P3)

- **Findings.** [AUDIT-05](../product/END_TO_END_AUDIT_2026_08_05.md#audit-05--no-application-level-csrf-defence--p2)
  (no app-level CSRF check; mutations rely solely on the Cloudflare Access cookie's
  SameSite) and [AUDIT-12](../product/END_TO_END_AUDIT_2026_08_05.md#audit-12--react-router-800-dependency-advisory--p3)
  (`react-router@8.0.0`, GHSA-qwww-vcr4-c8h2, patched `8.3.0`).
- **Fix.** Add an `Origin`/`Sec-Fetch-Site` allowlist at the mutation boundary; bump
  `react-router` to ≥ 8.3.0 and run the full suite. Regression test: an
  authenticated cross-origin mutation is rejected.
- **Debt.** DEBT-81 (CSRF), DEBT-86 (dependency). **Size.** Medium. **Priority.** P2.

- **Resolved (2026-08-05).** The gap was confirmed before anything changed: no
  file in the request platform read `Origin`, `Sec-Fetch-Site` or `Referer`, no
  CSRF token was minted or verified anywhere, and DalyHub has no session cookie of
  its own — authentication rides the Cloudflare Access `CF_Authorization` cookie,
  whose SameSite is set by Cloudflare and asserted nowhere in this repository.

  **The threat, precisely.** A browser attaches that cookie because of where a
  request is GOING, not because of who asked for it. So "authenticated" was never
  evidence of "the owner asked for this". The case Access alone does not close is
  the SIBLING: `other.daly.id.au` is **same-site** with `hub.daly.id.au`, so
  `SameSite=Lax`/`Strict` still sends the cookie and `Sec-Fetch-Site` still reads
  `same-site`. Same-site is therefore **not** an acceptable relationship, and
  neither is any suffix match on `.daly.id.au`.

  **One policy, at one place.** [`app/platform/request/mutation-provenance.ts`](../../app/platform/request/mutation-provenance.ts)
  is a pure module returning a typed verdict (`safe_method` / `same_origin`, or
  `missing_provenance` / `invalid_origin` / `cross_origin` /
  `disallowed_fetch_site` / `inconsistent_signals`), carrying no cookie, token or
  raw header value. It runs ONCE, at the shared request boundary — the one place
  guaranteed to execute before every protected loader and action — so every
  current and future mutation route is covered without a single per-route check.

  **Method policy.** `GET`, `HEAD` and `OPTIONS` are safe. Everything else is
  treated as mutating, and the safe list is an **allowlist**, so an unknown or
  future method (`PROPFIND`, `PURGE`, a typo) must prove provenance rather than
  slipping past an incomplete denylist. Read-only navigation and asset loading are
  untouched.

  **Origin policy.** Exact URL-origin comparison — scheme, hostname and effective
  port. `https://hub.daly.id.au`, `http://hub.daly.id.au`,
  `https://other.daly.id.au` and `https://hub.daly.id.au:8443` are four different
  origins and only the first is accepted. `Origin: null`, a malformed value, a
  non-canonical value (one carrying a path or query) and a comma-joined / repeated
  header are all rejected rather than resolved.

  **`Sec-Fetch-Site` policy.** Corroboration only. `same-origin` or absent is
  accepted alongside an exact `Origin`; `same-site`, `cross-site`, `none` and any
  unrecognised token are rejected; and CONTRADICTION is its own rejection — an
  exact `Origin` with a disallowed fetch-site, or a hostile `Origin` claiming
  `Sec-Fetch-Site: same-origin`, are both refused as inconsistent.

  **Missing headers fail closed.** `Origin` is required for every mutation, and the
  "absent `Origin` but `Sec-Fetch-Site: same-origin`" compatibility case was
  deliberately **not** taken: every browser attaches `Origin` to a non-`GET`/`HEAD`
  request, and the mutation clients were enumerated (React Router forms and
  fetcher submissions, Quick Capture, Task completion and inline editing, the
  Command Palette, Settings, the offline replay queue) without finding one that
  needs it. The browser regression test then produced independent support for that
  choice: over plain-HTTP localhost, Chromium attaches **no `Sec-Fetch-*` header at
  all** while still sending `Origin` — so `Origin` is the signal that is reliably
  there, and fetch-site could not have carried the policy on its own.

  **Trusted origin, without new configuration.** `new URL(request.url).origin`. It
  is authoritative here because production commits `workers_dev: false` and
  `preview_urls: false` (`wrangler.jsonc`, enforced by the deploy preflight), so
  the only hostname Cloudflare routes to this Worker is the Access-protected custom
  domain — and a browser derives `Host` from the URL it is fetching, to which the
  Access cookie is scoped. No environment variable, no secret, no deploy change,
  and no `X-Forwarded-Host`/`X-Forwarded-Proto` is consulted.

  **Ordering at the boundary.** Authenticate → establish the session → validate
  provenance → reject. So an unauthenticated request keeps its existing `401`/
  `403`/`503`, and a rejected mutation provisions no membership, invokes no React
  Router handler, runs no loader or action, touches no repository, records no
  Activity and changes no data. The kernel suite proves that last claim against
  real D1 rather than from a spy: after a rejected `POST /tasks/new` the Task
  count, Activity count and `workspace_members` count are all still zero.

  **Rejection response.** A generic `403` with the body `Request rejected.`, the
  baseline security headers and `Cache-Control: private, no-store`. It echoes no
  `Origin`, names no route, exposes no reason code, no token, no SQL and no
  framework detail; it is never a redirect. No CORS header is added anywhere — this
  is CSRF protection, not cross-origin API access. No server-side logging was
  added, deliberately: a rejection log is not needed to make the guard work, and
  security observability is a separate concern this item does not own.

  **`/health`.** The exact-path public bypass now covers **safe methods only**, so
  a public-path match cannot become a hole through which an unsafe method skips
  both authentication and provenance. Legitimate `GET`/`HEAD`/`OPTIONS` health
  checks are unchanged; public paths were not broadened.

  **Offline replay.** Unaffected, and verified rather than assumed. Replay posts to
  the modules' own create routes with an ordinary same-origin `fetch`
  (`credentials: "same-origin"`), so the BROWSER supplies the provenance — the
  service worker manufactures no header ordinary page code could not, and only
  intercepts `GET`. A `403` is already classified `blocked`, not `retryable`, so a
  rejection stops the pass instead of spinning on it. The full offline Playwright
  lifecycle — queued Task, Note and Diary capture and replay — passes unchanged.

  **React Router.** `react-router` and `@react-router/dev` bumped together
  `8.0.0` → `8.3.0`, exact-pinned. `pnpm audit --prod` is clean and
  GHSA-qwww-vcr4-c8h2 is gone. The advisory is **RSC-mode-specific** ("Framework
  mode is not affected") and a codebase search found no unstable RSC entry point or
  API in DalyHub — this item claims no exploitation and no non-RSC applicability.
  The `8.3.0` path-parameter encoding change (`$ & + , ; = : @` now literal) cannot
  reach DalyHub: neither `href()` nor `generatePath()` is used, and every route
  parameter is a `crypto.randomUUID()` id. No speculative test was added; the
  existing navigation and deep-link coverage was run and is green. Full
  `pnpm audit` still reports 11 dev-only transitive advisories (`brace-expansion`,
  `sharp`, `undici`, `postcss`) — recorded, not fixed here, and not claimed clean.

  **Tests.** 47 policy cases
  ([`test/unit/request/mutation-provenance.test.ts`](../../test/unit/request/mutation-provenance.test.ts));
  the eight boundary proofs added to
  [`test/unit/request/request-boundary.test.ts`](../../test/unit/request/request-boundary.test.ts);
  a real-runtime, real-D1 integration suite
  ([`test/kernel/request-boundary-csrf.test.ts`](../../test/kernel/request-boundary-csrf.test.ts));
  a browser regression driving a genuine second local origin
  ([`e2e/csrf.spec.ts`](../../e2e/csrf.spec.ts)); and replay-provenance cases in
  [`test/unit/pwa/offline-sync.test.ts`](../../test/unit/pwa/offline-sync.test.ts).
  Existing route tests needed no weakening — the kernel suites call route
  loaders/actions directly and never traverse the boundary. The Playwright specs
  that set state through `request.post` now go through one shared
  `postSameOrigin` helper, which derives its `Origin` honestly and cannot bless a
  cross-origin request. **No migration; nothing deployed; production data untouched.**

### ☐ AUDIT-FIX-05 — Documentation truth pass (P2/P3)

- **Findings.** [AUDIT-06](../product/END_TO_END_AUDIT_2026_08_05.md#audit-06--production-state-documentation-drift-production-unverifiable-here--p2)
  (README/DEPLOYMENT disagree about what production runs; migrations 0026–0028 not
  recorded as applied; AUDIT-IDENTITY-01 marked resolved in debt but "outstanding"
  in the roadmap closure log) and
  [AUDIT-09](../product/END_TO_END_AUDIT_2026_08_05.md#audit-09--help-contradicts-the-shipped-theme-count--p3)
  (Help says "choose from the five themes" while seven ship).
- **Fix.** One authoritative production-state statement; correct the Help sentence,
  the README "Status" section, the DEPLOYMENT migration-count prose, and the
  AUDIT-IDENTITY-01 roadmap wording. Pair with the §19 production verification
  checklist in the audit report. **Debt.** DEBT-84. **Size.** Small (docs).
  **Priority.** P3 (P2 for the production-state confusion).

### ☑ AUDIT-FIX-06 — Concurrency, and one owner day (P3) — **DELIVERED 2026-08-08**

- **Findings.** [AUDIT-07](../product/END_TO_END_AUDIT_2026_08_05.md#audit-07--multi-device-preference-lost-update--p3)
  (preference lost-update; `version` incremented but never enforced),
  [AUDIT-08](../product/END_TO_END_AUDIT_2026_08_05.md#audit-08--concurrent-note-content-saves-are-blind-last-write-wins--p3)
  (note content is blind last-write-wins),
  [AUDIT-14](../product/END_TO_END_AUDIT_2026_08_05.md#audit-14--two-owner-today-definitions--p3)
  (two "owner today" definitions) and
  [AUDIT-15](../product/END_TO_END_AUDIT_2026_08_05.md#audit-15--soft-deleted-inbox-task-cannot-be-restored-latent--p3)
  (a parentless Inbox Task cannot be restored). All four were re-confirmed against
  `main` at `03e7d81` before any code changed.
- **Delivered.** Preference writes became per-column **patches**, so two devices
  changing two different settings merge instead of clobbering, and the existing
  `version` became a REAL write precondition on the one read-modify-write path
  (the navigation hidden-set), with a typed conflict and a `409` rather than a
  `500`. Note content saves now quote the version they were written against; the
  repository folds that into the same statement as the write, and a stale save is
  refused with the newer text returned — surfaced through the EXISTING
  `RemoteChangeBanner`, not a Notes-only dialog, with the draft untouched. The
  owner's calendar day has one authority (`WorkspaceScope.ownerTimeZone()` /
  `.ownerTodayIso()`), the shared date helpers no longer default a timezone at
  all, and Asset history, obligations and the obligation→task gateway follow the
  owner instead of Sydney. `spine.restore` admits a Task with no structural
  parent, returning it to the Inbox with nothing invented, while every other
  kind keeps its parent requirement.
- **Deliberately NOT in scope.** No revision history, no CRDT/real-time
  collaboration, no offline note editing, no automatic Markdown merge, and no
  AUDIT-16 dead-code deletion (a different blast radius — see DEBT-88 §3).
- **No migration.** Every column the preconditions use — `owner_app_preferences.version`,
  `note_details.updated_at`, the owner's stored `timezone` — already existed and
  was already written; the change is that they are now compared. **Production data
  untouched.**
- **Debt.** DEBT-82 and DEBT-83 resolved; DEBT-88 partially resolved (timezone and
  restore closed, dead code open). **Size.** Medium. **Priority.** P3.

### The rest — near-term remediation and cleanup

Sequenced but not blocking: the security/ops hardening (AUDIT-10 CSP, AUDIT-11
backup artifact) and the cleanups (AUDIT-13 non-atomic flows, AUDIT-16 dead
code). The multi-device concurrency pair (AUDIT-07 preferences, AUDIT-08 note
content) and the owner-timezone/parentless-restore cleanup (AUDIT-14, AUDIT-15)
were delivered by [AUDIT-FIX-06](#-audit-fix-06--concurrency-and-one-owner-day-p3).
Each remaining item is recorded in
[`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) (DEBT-85, DEBT-87, DEBT-88 §3)
with its finding id. The full sequence is
[Recommended remediation sequence](../product/END_TO_END_AUDIT_2026_08_05.md#20-recommended-remediation-sequence).

**Verification gaps (owner action, not a code item).** The audit could not reach
production; its
[Required Local and Production Verification](../product/END_TO_END_AUDIT_2026_08_05.md#19-required-local-and-production-verification)
checklist must be worked through before any "production verified" claim, alongside
the still-unrun PWA-01 device checklist below.

---

## What V2.0.1 did, and did not, take from this file

**Nothing in this roadmap moved into V2.0.1.** The
[V2.0.1 hotfix](../release/RELEASE_NOTES_V2_0_1.md) fixed confirmed V2 defects
and hardened release operations; it started no item below, and no item's status
changed because of it. It is recorded here only so a reader does not have to
wonder whether it quietly consumed part of V2.1.

Two entries are worth reading *alongside* it, because V2.0.1 touched adjacent
ground without doing their work:

- **[SET-02](#-set-02--backup--restore-v21) is untouched.** V2.0.1 added a
  scheduled workflow that **exports** production D1 to a retained artifact.
  That is the automated half of a backup and nothing more: there is still **no
  import, no restore and no proven end-to-end restoration test**, which is the
  entirety of what SET-02 owes. The rule this file already states applies
  unchanged — *an untested restore is not a backup* — and a scheduled export is
  not partial credit for SET-02 any more than X-04's on-demand export was. The
  workflow, its retention and its explicit "restore is V2.1 SET-02" statement
  are documented in
  [`DEPLOYMENT.md`](../development/DEPLOYMENT.md#automated-production-backups-v201).
  - One genuine input for SET-02, recorded rather than lost:
    [DEBT-61](../product/PRODUCT_DEBT.md) already named scheduled backups as the
    thing that would hit the export's read-consistency window more often than a
    hand-pressed export does. A daily unattended export now exists, so that
    entry has a real consumer to be evaluated against when SET-02 is built.
- **[DIARY-02](#-diary-02--day-context-links) is untouched.** V2.0.1 repaired a
  **broken link Reviews already emitted** to Diary, by adopting the canonical
  Diary deep-link URL that Search and Quick Capture already used. It added no
  linking affordance to the Diary surface and made Diary no more a Linked Items
  consumer than it was — which is DIARY-02's actual scope.

## How an item got here

Nothing was moved into this file to make V2 look finished. An item is here for one
of exactly three reasons, and each entry says which:

1. **It was never in V2's scope** (the AI phase, imports, account/security surface).
2. **It was in V2's scope and is being deferred deliberately**, with the reason
   stated — currently only [SET-02](#-set-02--backup--restore-v21).
3. **Its module shipped, and a named remainder did not** — the three `◐` mobile
   items and the cross-module half of `X-02`.

The V2 roadmap keeps every one of these items' original entry and history. This
file does not restate it; it records the target release and the sequence.

---

## Delivered after V2.0.1

*Work that landed against this file rather than against ROADMAP_V2, recorded here so
the V2 record stays closed.*

### ☑ THEME-02 — The Modern visual system

- **Why it exists.** V2 shipped five curated themes, but the light/dark story was
  "Daly Light, or the Daly Dark that `system` pairs it with". THEME-02 adds the one
  thing the registry did not have: a **matched pair** designed together, so the owner
  can move between a bright and a dimmed treatment of the *same* visual system by time
  of day and have nothing about the application move.
- **What shipped.**
  - **Modern Light** (`modern-light`) — a warm cream page, near-white panels,
    genuinely white cards, teal as the primary accent and blue as the informational
    one, with green/orange/red held back for meaning. Soft realistic shadows, quiet
    borders, and a near-white navigation surface so the rail sits inside the
    application rather than beside it.
  - **Modern Dark** (`modern-dark`) — deep charcoal with four clearly separated
    elevations (`sunken < bg < card < raised`), a controlled indigo accent, violet
    confined to the waiting state and one chart series, and no glow on ordinary
    interactive elements.
  - **Two new semantic tokens, in every theme:** `nav-selected-surface` and
    `nav-selected-text` — the selected-navigation treatment, split out of the generic
    `accent-surface` tint so a theme can control "you are here" without moving every
    tinted panel with it. The sidebar and the Settings section list both consume them.
  - **A shell refinement that applies to all seven themes:** the rail is separated by
    the divider token rather than the full border token, and the selected row gains a
    leading indicator bar (shape, mirroring the phone bar's top indicator) alongside
    its existing `aria-current`, weight and tint.
  - **Migration `0026`** widens the `owner_app_preferences.theme` CHECK so the two new
    ids can be persisted. A rebuild, because SQLite cannot alter a CHECK in place —
    additive in effect, copied by explicit column list, no stored value rewritten.
- **What it deliberately did not do.** It did not redesign the information
  architecture, replace working functionality, restructure a module, change the type
  or spacing scales, or add a Today widget the product does not already have. It is a
  visual-system and theme change applied to the existing product.
- **Evidence.**
  [`THEME_ACCEPTANCE_MATRIX.md → section 8`](../design/THEME_ACCEPTANCE_MATRIX.md#8-theme-02--the-modern-pair)
  records what was verified and how, including the screenshot pass in
  [`docs/design/assets/theme-02-2026-08/`](../design/assets/theme-02-2026-08).
- **Recommended follow-up, not done here.** The registry is now seven themes plus
  `system`, which is more choice than one person needs. A consolidation
  recommendation is recorded as **DEBT-67** in
  [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) rather than acted on, because
  removing a theme takes a choice away from an owner who may already be on it and
  that is not a decision to make inside a change that was meant to add one.

---

## V2.1 — Recoverability

*The one thing V2 knowingly does not give the owner: a way to get their data back
IN. Everything else in this file can wait behind it.*

### ☐ SET-02 — Backup & restore (V2.1)

- **Original entry.** [`ROADMAP_V2.md → SET-02`](ROADMAP_V2.md#-set-02--backup--restore).
- **Deferred from V2 on 2026-08-01, by the V2 release closure.** Not because it is
  low value — it is the highest-value remaining item in the product — but because
  the honest state of it is *nothing of the write side exists*, and a release that
  claimed backup and restore on the strength of X-04 would be claiming something
  DalyHub cannot do.
- **What V2 actually ships in this space, stated precisely.**
  [X-04](ROADMAP_V2.md#-x-04--export--data-portability) is ☑: the owner can
  download their entire workspace, on demand, as a structured versioned archive
  (`manifest.json` + `dalyhub-snapshot.json` + `SCHEMA.md` + `README.md` +
  `CHECKSUMS.txt`) **and** as a ready-to-open Obsidian vault, both derived from the
  one canonical `DalyHubWorkspaceSnapshotV1`. **Downloadable export is V2's
  data-safety and portability feature**, and it is a real one: it is verifiable
  without DalyHub (`sha256sum -c CHECKSUMS.txt`), it is readable in any text
  editor, and it includes archived, soft-deleted and unlinked records with their
  state marked.
- **What V2 does NOT ship, and must never be described as shipping.** Full backup
  restoration. **Restore has not been proven and is not implemented.** There is no
  import path, no scheduled backup, no automatic cloud backup, and no second copy
  of the owner's data held on their behalf. `/settings`, `/help` and the release
  notes all say so in the owner's own words, and tests hold that wording.
- **What V2.1 owes.** Validated backup **import and restore**, reading the
  canonical X-04 snapshot format as its input contract — the format exists, is
  versioned, and states its compatibility policy in
  [`EXPORT_AND_PORTABILITY.md`](../development/EXPORT_AND_PORTABILITY.md) and
  [ADR-065](../decisions/ARCHITECTURE_DECISIONS.md#adr-065-the-canonical-workspace-snapshot-and-two-serialisers-derived-from-it).
  Restore must include, at minimum:
  - a **preview** of what a restore would change, before anything is written;
  - **validation** of the archive against the schema and against the target
    workspace, refusing an incompatible or tampered snapshot rather than
    half-applying it;
  - **workspace protection** — a restore is scoped to one workspace, cannot write
    across the isolation boundary, and cannot silently overwrite a populated
    workspace without an explicit, informed decision;
  - a deliberate, documented **merge-versus-replace** answer;
  - **failure safety** — a failed or interrupted restore leaves the workspace in a
    defined state, never partially written;
  - a **proven end-to-end restoration test**: export a populated workspace, restore
    it into an empty one, and assert the result is equivalent. Until that test
    exists and passes, this item is not done.
- **Still true, and still the rule.** Cloudflare or D1 platform durability does
  **not** satisfy this item. An untested restore is not a backup, and
  infrastructure the owner cannot invoke or verify is not recoverability. **This
  item must not be marked ☑ on the strength of Cloudflare or D1 capabilities, and
  X-04 having shipped is not partial credit for it.**
- **Dependencies.** FND-02, X-04 (both ☑ — satisfied).
- **Priority.** P1. First item of V2.1.

---

## V2.1 — Named remainders from shipped V2 modules

*Each of these has a module that shipped and a specific, named piece that did not.
They are small and well-understood; none of them blocks the V2 release.*

### ◐ PEOPLE-04 — Mobile People

- **Original entry.** [`ROADMAP_V2.md → PEOPLE-04`](ROADMAP_V2.md#-people-04--mobile).
- **Delivered in V2.** The phone record layout, the compact Card preset, the tab
  overflow, real quick actions, and context-aware Quick Capture through ADR-060.
- **Outstanding.** The broader
  [DEBT-45](../product/PRODUCT_DEBT.md#-debt-45--a-captured-record-is-not-linked-to-the-context-it-was-captured-from--p2)
  closure matrix — every record entry point, full-form hand-off, and the
  mobile/E2E/a11y proof.
- **Priority.** P3.

### ◐ ASSET-03 — Mobile Assets

- **Original entry.** [`ROADMAP_V2.md → ASSET-03`](ROADMAP_V2.md#-asset-03--mobile).
- **Delivered in V2.** The phone record layout and the ASSET-02 history/obligation
  surfaces, verified at 320/375/390/430px with no overflow and 44px targets.
- **Outstanding.** Phone-first capture of a NEW Asset and the type/subtype picker at
  narrow widths. It was sequenced after ASSET-02, which has now shipped, so it can
  finally be designed against the history surface it was waiting for.
- **Priority.** P3.

### ☑ REVIEW-04 — Mobile Reviews — **DELIVERED 2026-08-05**

- **Original entry.** [`ROADMAP_V2.md → REVIEW-04`](ROADMAP_V2.md#-review-04--mobile).
- **Delivered in V2.** The writing surface, full-width choices, a real share of the
  viewport for reflection editors, and the shared phone record chrome.
- **Delivered now, with [REVIEW-02](#-review-02--weekly-review):** the one-step- and
  one-prompt-at-a-time phone stepper. Below `md` the desktop rail is REMOVED rather than
  shrunk; a compact progress header and an `aria-label`led progress bar say "Step 3 of
  7"; a step sheet (the shared MOBILE-01 `Sheet`) offers direct navigation; and
  Back/Continue sit in a sticky footer that clears the keyboard, the phone navigation bar
  and the home indicator using tokens. Verified at 320/375/390/430px: no horizontal
  overflow, 44px targets, no nested scrolling trap (the reflection editor grows instead
  of scrolling inside itself), and axe clean in light and dark.
- **Priority.** P3 — closed.

### ◑ X-02 — Saved views & cross-module filters

- **Original entry.** [`ROADMAP_V2.md → X-02`](ROADMAP_V2.md#-x-02--saved-views--cross-module-filters).
- **Delivered in V2.** Real, persisted, workspace- and owner-scoped saved views for
  Tasks over a validated declarative configuration (TASKS-03, ADR-059).
- **Outstanding — exactly the word "cross-module".** Generalising the declarative
  configuration beyond Task dimensions
  ([DEBT-49](../product/PRODUCT_DEBT.md#-debt-49--two-filter-models-coexist-ds-07-expressions-and-the-tasks-declarative-configuration--p3)),
  adopting it in other collections
  ([DEBT-20](../product/PRODUCT_DEBT.md#-debt-20--no-health-specific-project-filter-yet-ds-07-clause-builder-still-deferred--p3)),
  and a cross-entity query contract that does not exist yet. **Do not mark this ☑
  because Tasks has saved views.**
- **Priority.** P3.

---

## V2.1 — Module completion

### ☑ REVIEW-02 — Weekly review — **DELIVERED 2026-08-05**

- **Original entry.** [`ROADMAP_V2.md → REVIEW-02`](ROADMAP_V2.md#-review-02--weekly-review).
- **Already in place from REVIEWS-01, not rebuilt:** the weekly type, wall-calendar
  weekly periods honouring the first-day-of-week preference, the versioned
  `review.weekly.v1` template and its prompts, duplicate protection, and the
  draft → in progress → completed lifecycle with reopen. The guided flow orchestrates
  all of it rather than replacing any of it.
- **Delivered.** A seven-step guided flow over the SAME Review record — Settle in ·
  Clear the Inbox · Review Projects · Goals and Areas · Reflect · Next week's focus ·
  Complete Review — from ONE canonical typed step registry in the kernel. Inbox triage
  without leaving the Review over the canonical `inbox` view and the shared
  `TaskQuickEditPanel`; a bounded Project review projection reusing PROJ-02 health with
  a documented deterministic next-action rule; Goal/Area alignment reading the AREA-03
  evaluator unchanged; the Review's own stored template's prompts one at a time; and a
  close-out whose recorded focus the next weekly Review reads (derived, never copied).
  Resume is a small persisted bookmark plus explicit step acknowledgements (migration
  `0029`) — everything else stays derived. Optimistic concurrency added to the authored
  section write path. REVIEW-04's stepper shipped with it.
- **Docs.** [`REVIEWS_MODULE.md → The guided weekly Review`](../development/REVIEWS_MODULE.md#the-guided-weekly-review-review-02--review-04-2026-08-05) ·
  [ADR-072](../decisions/ARCHITECTURE_DECISIONS.md#adr-072-the-guided-weekly-review--one-review-two-presentations-a-canonical-step-model-and-the-smallest-possible-persisted-workflow-state).
- **Explicitly NOT in scope, and still open:** derived insights and historical alignment
  trend ([REVIEW-03](#-review-03--insights--alignment)).
- **Priority.** P2 — closed.

### ☐ DOC-EDITOR-01 — One document-editor shell for Notes and Meetings

- **Recorded, not started.** Noted while migrating Areas and Projects to the M3
  entity card (Gate D unit 1, PR #122). It is deliberately NOT in that PR: the M3
  gates are a visual migration of collections and records, and this is a
  composition change to two modules' authoring surfaces. Mixing them would make
  both harder to review.
- **The observation.** Notes and Meetings both compose their own authoring
  surface over the shared `LiveMarkdownEditor`
  (`app/modules/notes/NoteContentForm.tsx`,
  `app/modules/meetings/MeetingMarkdown.tsx`), and Reviews composes a third
  (`app/modules/reviews/guided/ReviewPromptEditor.tsx`). The editor itself is
  shared; the shell around it — the toolbar, the writing measure, where metadata
  sits, how saving is reported, how a long document scrolls — is not. The M3
  audit already found the consequence for one of them:
  `markdown-editor.css` declares five bespoke card blocks and puts a border
  around every region.
- **The proposal.** Consolidate Notes and Meetings onto ONE shared
  document-editor shell ABOVE the existing `LiveMarkdownEditor` — keep the
  editor, share the chrome. Reviews' prompt editor is a different shape (many
  short authored answers, not one long document) and should be assessed rather
  than assumed to fit.
- **Why it is the next major PRODUCT-focused unit.** The remaining M3 gates are
  presentational. This one changes how two modules are actually written in, which
  is the kind of work that benefits from being the whole of a change rather than
  a rider on one.
- **Not scoped here.** No component names, no anatomy and no migration order are
  being decided in this note. Do the audit first.
- **Priority.** P2.

### ☐ REVIEW-03 — Insights & alignment

- **Original entry.** [`ROADMAP_V2.md → REVIEW-03`](ROADMAP_V2.md#-review-03--insights--alignment).
- **Still open after REVIEW-02.** The guided flow READS the existing AREA-03 and PROJ-02
  evaluators for the current period; it derives no trend, stores no classification and
  keeps no history. Everything below remains unbuilt.
- Nothing of this exists today. Keep it derived and non-persisted, mirroring
  PROJ-02/AREA-03 — no stored score, no cached classification, no streaks. It is the
  accepted home for
  [DEBT-24](../product/PRODUCT_DEBT.md#-debt-24--no-alignment-history--trend-is-stored--p3)
  and the richer period facts in
  [DEBT-34](../product/PRODUCT_DEBT.md#-debt-34--reviews-period-context-and-today-integration-are-bounded-first-cuts--p2).
- **Priority.** P3.

### ☐ DIARY-02 — Day context links

- **Original entry.** [`ROADMAP_V2.md → DIARY-02`](ROADMAP_V2.md#-diary-02--day-context-links).
- Diary entries are first-class entities and FND-04 EntityLinks are available, but
  the Diary surface offers no linking affordance and Diary is not yet a Linked Items
  consumer. Keep the DIARY-01A principle intact — chronology first, structure
  optional — so a link is always an offer, never a required field on capture.
- **Priority.** P3.

### ☐ SET-03 — Account & security

- **Original entry.** [`ROADMAP_V2.md → SET-03`](ROADMAP_V2.md#-set-03--account--security).
- The identity layer beneath it is done and accepted (FND-09, ADR-016): DalyHub *is*
  authenticated, so this is not blocking safety. What is missing is the owner-facing
  surface — visible session/identity state, sign-out-everywhere, and a
  security-relevant audit view. Related:
  [DEBT-33](../product/PRODUCT_DEBT.md#-debt-33--settings-changes-are-not-yet-represented-in-activity--p3).
- **Priority.** P2.

---

## V2.1 — Whole-application restyle

### ☑ POLISH-02 — The Today command centre

- **Why it exists.** DS-15 gave Today the card-on-tint surface contract and put
  `My day` in a primary column. It did not give the surface a designed
  *arrangement*: the grid had three hand-placed cells and left every widget after
  the third to `grid-auto-flow`, so the page below the fold was assembled by the
  packing algorithm rather than by anyone. Owner direction was to redesign the
  whole screen — hierarchy, grid, density, hero, colour, empty states, desktop and
  mobile — while preserving every existing behaviour.
- **What changed.**
  - **Three declared regions** instead of an auto-flowed grid. Each widget names
    its region (`hero` / `primary` / `secondary`) in the catalogue; the surface
    renders a full-width hero band and two independently-flowing columns at ~66/34.
    Independent flow is the point — a column can no longer leave a hole waiting for
    the other column's row to end. Personalisation (move/pin) is now scoped to a
    widget's own region, so a move never teleports a card across the page.
  - **A real hero.** The owner is greeted by name (derived from the same shared
    display-identity helper the User menu uses, resolved server-side), with the
    date, the day's shape, today's progress against what is committed, and ONE
    at-a-glance rail carrying six counts — including the cross-module ones that
    previously required scrolling (meetings still to come, work waiting on other
    people, projects that need a look). It is labelled **Brief**, not "Morning
    brief": the greeting inside it has always adapted to the owner-local hour, so
    the fixed label was telling the owner it was morning at 9pm. The widget **id**
    is unchanged (`morning-brief`) because it is the persistence key for every
    saved arrangement, and an unknown id is dropped on read.
  - **Every number is stated once.** The planning summary strip inside `My day`
    repeated the brief's counts a few hundred pixels away; it is gone, and `My day`
    now opens on the owner's tasks. The Insights panel subtracts whatever the hero
    rail already states while the hero is on screen, and restores it when the owner
    hides the hero.
  - **Today is no longer a backlog.** The planning query bounds the unscheduled
    band at 100 rows, which is right for a query and wrong for a landing page: a
    real workspace opened with sixty-odd `Anytime` rows between the day's work and
    everything else, pushing Recent activity four screens down. The discretionary
    bands (`Upcoming`, `Anytime`) now preview eight rows with the TRUE total in the
    heading and a "View all *N*" link into the canonical `/tasks` system view.
    Overdue and Today are never truncated.
  - **Layout thresholds are container queries.** A viewport breakpoint inside the
    app shell is wrong by the width of the navigation rail; the two-column split
    used to engage at 1024px and produce a ~390px primary column in which task rows
    wrapped. See [Responsive](../design/DESIGN_SYSTEM.md#responsive).
  - **Density and consistency.** One card chrome for every widget (one header
    treatment, one radius, one inset, one hover response); one destination link per
    list widget, in its header, replacing links scattered at the foot of some
    bodies and absent from others; meetings render as a real timeline with a
    tabular time gutter; project cards always carry their health signal and what is
    left open; goals state completion beside whether recent action matches them;
    the two remaining dead-end empty states gained an action. Today also opts into
    a wider dashboard measure so a widescreen monitor no longer ends in a band of
    empty canvas.
- **What it deliberately does not change.** No route, loader contract, query,
  mutation, entity field, permission, Activity row, link or export format. No new
  fetch: every number in the hero comes from the payload the loader already
  returned (the goal roll-up reuses the contribution read the alignment evaluation
  already performs). The keyboard model, the swipe layer, the Drawer, planning,
  bulk selection and per-device personalisation all behave as before.
- **Two brief requests deliberately not implemented, and why.** A **weather**
  panel: there is still no data source, so it would be fake data or an empty box —
  the decision recorded as [DEBT-53](../product/PRODUCT_DEBT.md) stands. **Card
  shadows**: DS-14 constraint 8 reserves shadow for genuinely floating layers, and
  the theme system guarantees a ΔL* ≥ 3 surface ramp that separates cards legibly
  in all seven themes where one shadow value cannot. The hero uses the raised step
  of that ramp and hover moves the border instead. Project **"next action"** was
  not added: it needs a per-project task query on the most-visited route in the
  product — recorded as [DEBT-77](../product/PRODUCT_DEBT.md#-debt-77--a-project-card-cannot-say-what-the-next-action-is--p3), with
  the query shape that would satisfy it. Goal **trend** is [DEBT-78](../product/PRODUCT_DEBT.md#-debt-78--goals-can-state-completion-but-not-trend--p3):
  nothing stores a goal's completion over time, so completion and recent progress
  ship and the direction does not.
- **Acceptance evidence.** Unit, kernel, lint, typecheck and build green; the
  Today, Today-mobile, Today-keyboard, planning, keyboard, mobile-shell and full
  axe accessibility e2e suites pass (184 tests); the running application was
  screenshotted at 320, 390, 820, 1024, 1280, 1440 and 1920 with no horizontal
  overflow at any width.
- **Priority.** P2.

### ☑ DS-15 — Today reference layout and app-wide surface contract correction

- **Why it exists.** PR #108's branch name and owner direction required a visible
  Today rebuild and whole-application visual correction, not another plan layered
  on top of DS-14. DS-15 records that implementation: Today becomes the reference
  layout for the card-on-tint system, and the remaining in-flow cards, filters,
  forms, empty states and application edges are brought back to the shared surface
  contract.
- **Superseded in part by [POLISH-02](#-polish-02--the-today-command-centre).**
  The hierarchy below still holds — current work leads, secondary context sits
  beside it — but its ARRANGEMENT changed: `Morning brief` became a full-width hero
  band above both columns rather than a card in the secondary one, and every widget
  now declares its region instead of being auto-placed. Everything else in this
  item (the surface contract, the shadow rule, the module retargeting) is unchanged.
- **What changed.** Today now puts current work first at desktop width, with
  `My day` as the primary column and `Morning brief` plus quick capture in the
  secondary column; phone widths keep the existing fast single-column stack.
  Shared cards use `surface-card`, complete borders and `radius-card` without
  raised shadows. Floating surfaces keep raised elevation. Module CSS that still
  used generic surfaces, raw radii or hover shadows was retargeted to the semantic
  system.
- **What it deliberately does not change.** No information architecture, spine
  semantics, route or deep link, entity field, query, validation, permission,
  Activity row, link, export format or serialiser, authentication, module-registry
  contract, product copy, theme id/CHECK constraint/count, Restore, weekly review,
  mobile reminders or other V2.1 work. It adds no theme or appearance/density/shape/
  typography/measure switch, Today widget, Goal metric, stored Area colour or
  animation system. Area colour remains the workspace-rank algorithm accepted by
  ADR-068.
- **Acceptance evidence.** The shared visual contract is applied across Today,
  Tasks, Areas, Goals, Projects, Notes, Diary, Meetings, People, Assets, Reviews,
  Settings, Search, Command Palette and application edges; the theme/token,
  accessibility, responsive, PWA/offline and e2e checks pass; and desktop/mobile
  screenshots from the running application show the populated, sparse, collection,
  reading, form and floating-layer states.
- **Decision record.** [ADR-070](../decisions/ARCHITECTURE_DECISIONS.md#adr-070-ds-15--today-reference-layout-and-app-wide-surface-contract-correction).
- **Priority.** P2. Completed in PR #108.

### ☑ DS-14 — Whole-application visual overhaul

- **Not in ROADMAP_V2.** A new item, taking the next free number in the `DS-` series
  (`DS-01`…`DS-13` are all in [`ROADMAP_V2.md`](ROADMAP_V2.md)). It is a *design
  system* item, which is why it keeps the `DS-` prefix rather than becoming a second
  `THEME-` item: it adds no theme and changes no theme's identity.
- **What it is.** A restyle of every DalyHub surface to a **card-on-tint** visual
  system — a tinted page canvas with cards raised above it — with a serif reading
  column on prose surfaces and two density presets keyed to *surface type* rather
  than to module. Delivered **without adding a theme, without a new user-facing
  switch, and without changing what any module does**.
- **The brief is the scope.** [`DS_14_OVERHAUL_BRIEF.md`](../design/DS_14_OVERHAUL_BRIEF.md)
  states the direction as eight checkable constraints, the token set, the elevation
  contract, the density presets, the typography budget, the theme invariant
  specification, the surface classification, the absence-state rule, the accessibility
  baseline, and — at least as importantly — **§9, what no DS-14 PR may change or add**.
  The decisions taken against it, with their reasoning and their measurements, are
  [ADR-068](../decisions/ARCHITECTURE_DECISIONS.md#adr-068-ds-14--the-card-on-tint-direction-its-elevation-contract-two-density-presets-derived-area-colour-and-a-single-commit-rollback).
- **How it is delivered.** DS-14 is a single complete visual implementation, not a
  staged rollout plan. Its evidence is repository evidence: shared primitives,
  theme invariants, accessibility/responsive/offline checks and screenshots from
  the running application.

  **What that means, stated rather than left to be discovered.**
  - **The wide-desktop question is answered IN this PR rather than after it.** [DEBT-72](../product/PRODUCT_DEBT.md#-debt-72--card-on-tint-is-a-phone-native-pattern-and-its-behaviour-at-1440px-and-above-is-unproven--p2)
    recorded that card-on-tint's behaviour at 1440px and above was unproven; the
    answer turned out to be a real one — an uncapped collection at 1440px is a
    1200px row with a title at one end and a status pill at the other — and the
    fix (a content measure on collections, not only on prose) is in the PR.
  - **Rollback is a whole-PR rollback.** There are no separately-landed module
    groups to keep. Reverting the merged visual implementation removes the visual
    implementation; it does not leave behind a partially-restyled product.

- **☑ The foundation.** The token set in all seven themes (`surface-page` replacing
  a retired `bg`, the neutral absence pill, the six Area accents with their tint
  pairs, `divider-subtle`), the recomposed light neutral ramps — five of the seven
  themes could not satisfy the elevation contract and three had `surface-card` and
  `surface-raised` byte-identical at `#ffffff` — the semantic radius scale, both
  density presets as `data-density` on a region wrapper, the self-hosted Inter +
  Source Serif 4 subsets inside the fixed PWA budgets, three weights with `bold`
  removed, the neutral pill and Area identity primitives, and the theme invariant
  test wired into `pnpm verify`.
- **☑ Group 1 — global interaction surfaces and the shell.** The rail and the pane
  header stop painting their own surfaces and their own edges; both sit on the tint
  and the selected nav row becomes the only thing on the rail with a surface. The
  floating layers (drawer, sheet, command palette, overflow menu, feedback) keep
  `surface-raised` and their shadows, which is what the contract reserves shadow
  for. Sentence case across 30 stylesheets: 46 shouted labels and their companion
  letter-spacing removed.
- **☑ Group 2 — Today and Tasks.** Carried almost entirely by the shared Card: in a
  Collection region the card becomes a ROW and the collection becomes the card, so
  Tasks, Today and every other list adopt the density from one place. Today's
  Morning Brief stops being a card inside a card. Two phone defects found by
  measuring: a title wrapping one character per line at 390px, and the body
  dropping below the selection checkbox.
- **☑ Group 3 — Areas, Goals and Projects.** The Area identity dot, keyed to the
  Area's rank over every `area` row in the workspace regardless of lifecycle state,
  so archiving is colour-neutral (ADR-068 decision 5). No column and no migration;
  a window function on the existing index rather than a new one. The first
  implementation used the active list's index and was caught in review — see
  ADR-069 decision 9. The
  record layout — summary card, tab panel, sentence-case metadata — which covers
  every record view in the product, not only the spine. Goal progress absence
  renders as the neutral pill rather than as a sentence that happens to say "no".
- **☑ Group 4 — Notes and Diary.** Carried by `MarkdownContent`, which IS the
  Reading region: 16px at 1.75 over a 46ch measure in the serif, with headings,
  code and tables staying sans because they are chrome.
- **☑ Group 5 — Meetings and People.** Reading summaries through the same Markdown
  boundary; attendees, follow-ups and the directory through the same collection row.
- **☑ Group 6 — Assets, Reviews, Settings, Help and About.** Settings groups become
  cards (the clearest "uncontained sections merging into the page" in the product),
  Help topics become Reading regions, `/ai` is contained without a word of its
  wording changing, and empty states are contained everywhere.
- **☑ Foundation gaps found while applying it, fixed in the foundation rather than
  worked around in a module** (ADR-068 F3): the shared control baseline (modules
  that dropped a native `<select>` into a filter row shipped a user-agent control
  beside a designed one), the contained empty state, the `identity` slot on the
  shared Card, and the recovery surfaces' inlined card-on-tint.

- **Why it is sequenced here, and this is deliberate.** DS-14 sits **after
  [SET-02](#-set-02--backup--restore-v21) and [REVIEW-02](#-review-02--weekly-review)**
  in Build order on purpose, not by accident of drafting. **Recoverability and the
  weekly flow are worth more than a restyle.** SET-02 is the one gap V2 knowingly
  leaves — a bad day is still unrecoverable — and REVIEW-02 is the flagship weekly
  ritual the product exists to run. A restyle changes how DalyHub looks; neither of
  those two changes what it can do for the owner on their worst day. And a whole-app
  restyle taken out of order is how a roadmap stops moving: it touches every surface,
  so it collides with every item built beside it, it makes every later diff harder to
  read, and it is large enough and pleasant enough to absorb the attention that
  restore and the weekly review have a stronger claim on. It is sequenced third
  because it is worth doing, and third because it is not worth doing first.
- **Not partial credit for anything, and nothing is partial credit for it.**
  [THEME-02](#-theme-02--the-modern-visual-system) shipped a matched light/dark pair
  and is ☑; it restyled no module and DS-14 is not "more THEME-02". Equally, DS-14
  was never to be marked ☑ because the foundation landed — the item is done when
  every group is, verified per the brief's §10 matrix. **It is marked ☑ here on
  that basis and no other:** every module and every application edge uses the
  system, the invariant test passes in all seven themes, and the responsive,
  accessibility, offline and budget gates are green. That is an implementation,
  screenshot and automation claim; no owner soak process is part of the item.
- **Dependencies.** DS-01 (tokens), DS-11 (the accessibility and responsive
  baseline), THEME-01/THEME-02 (the seven-theme registry the invariant test
  enumerates) — all ☑ and satisfied. Sequenced behind SET-02 and REVIEW-02 for the
  reason above, which is a sequencing decision, not a technical dependency.
- **Priority.** P2. Third item of V2.1.

---

## V2.5 and later — never in V2's scope

*Recorded so the decisions are not re-litigated, and deliberately not started.*

### ☐ X-03 — Import & sync (Todoist, Notion, calendar)

- **Original entry.** [`ROADMAP_V2.md → X-03`](ROADMAP_V2.md#-x-03--import--sync-todoist-notion-calendar).
- **Deliberately last among the platform items, and the reason is unchanged.**
  Imported content is untrusted input that must be validated at the boundary, and a
  sync that writes without review would violate the same "never silently mutate the
  owner's data" principle that governs AI. Export exists (X-04 ☑); restore does not
  until SET-02 ships. Build SET-02 first, so importing a large external dataset is a
  recoverable decision.
- **Priority.** P3. After SET-02.

### ◑ AI-01 … AI-04 — The AI phase

- **Original entries.** [`ROADMAP_V2.md → Phase 11`](ROADMAP_V2.md#phase-11--ai-ai).
- **The architectural principle is non-negotiable and unchanged:** AI may propose
  structured changes; the user must review, edit, accept or reject them; AI must not
  silently mutate DalyHub data. AI-04's consent boundary shipped **together with**
  AI-01, as this entry required.

#### ☑ AI-01 — Proposal architecture & review UI — **DELIVERED 2026-08-05**

- **Delivered.** A provider-independent AI kernel (contracts, versioned prompt
  registry, DalyHub-owned response schemas, model/pricing registry, budgets, the
  request state machine and a typed error family — all pure); Anthropic and OpenAI
  adapters behind one contract; optional Cloudflare AI Gateway routing with
  bring-your-own-keys; a bounded evidence-retrieval service over the EXISTING
  search projections and EntityLinks; application-enforced budgets with
  reserve → run → reconcile; a usage ledger (migration `0030`) that is operational
  metadata, not Activity; an owner-facing AI Settings section; and the
  propose → review → apply loop, whose only write path re-validates the owner's
  reviewed fields and goes through the modules' own repositories with the **owner**
  as the Activity actor.
- **Three capabilities shipped:** Meeting/Note action extraction, the Weekly Review
  assistant, and Ask DalyHub (which answers counts and "when was the last…"
  deterministically, with no provider call at all).
- **Deliberately not built:** an unrestricted chat surface, internet research,
  autonomous agents, agent loops, background monitoring, arbitrary tool execution,
  direct database access for the model, persistent conversation history, or any
  AI-generated record without approval.
- **Docs.** [`AI_PLATFORM.md`](../development/AI_PLATFORM.md) ·
  [ADR-073](../decisions/ARCHITECTURE_DECISIONS.md#adr-073-the-controlled-ai-platform--provider-independence-proposal-only-writes-application-enforced-budgets-and-an-evidence-contract).
- **Known limits, recorded rather than left implicit.** Generated results are not
  persisted, so reuse is bounded to one isolate
  ([DEBT-92](../product/PRODUCT_DEBT.md#-debt-92--generated-ai-results-are-not-persisted-so-reuse-is-bounded-to-one-isolate--p3));
  retrieval is keyword and relationship only, with no embeddings
  ([DEBT-93](../product/PRODUCT_DEBT.md#-debt-93--ai-evidence-retrieval-is-keyword-and-relationship-only--p3));
  and **no check has been run against a live provider** — no API key was available
  while this was built (see [`AI_PLATFORM.md`](../development/AI_PLATFORM.md) §21).

#### ☑ AI-04 — Privacy controls — **DELIVERED 2026-08-05**

- **Delivered.** A structural privacy classification (seven categories, derived
  from module/record kind/Area — never inferred with AI); People defaulting to
  `relationships` and Diary/Reviews to `reflection`, so both are excluded from AI
  evidence unless the owner explicitly allows the category; a per-category owner
  allowance in Settings; a pre-run disclosure naming exactly how many records of
  which kinds will be sent, what was excluded and why; and honest copy about what
  DalyHub logs versus what a provider or an AI Gateway may retain.
- **The consent boundary sits at the CATEGORY, not at every record** — `general` is
  always allowed, so an ordinary Task never triggers a prompt.

#### ☑ AI-02 — Meeting → tasks/notes proposals — **DELIVERED 2026-08-05**

Marked ☑ because both of its conditions are now true, with source and test
evidence:

1. **Accepted Meeting Tasks use MEET-02's canonical conversion authority and
   appear correctly in Follow-up.** The acceptance path creates or reuses the
   Meeting's `action` item and converts it through `convertMeetingItemToTask`, so
   the `meeting_item_tasks` mapping and its structural
   `meeting.item_converted_to_task` Activity are written and the Follow-up tab
   reports the Task as converted. Idempotency comes from that mapping and
   MEET-02's own rules — no uniqueness error is caught and ignored. This closes
   [DEBT-90](../product/PRODUCT_DEBT.md).
2. **Meeting extraction proposes owner-reviewed Notes that become ordinary linked
   DalyHub Notes only after acceptance.** A bounded, strictly validated
   proposed-Note shape (title, body, a closed-vocabulary purpose, citations,
   confidence — and nothing else) with DalyHub-owned length ceilings, a maximum of
   four per request, mandatory evidence and refusal of raw HTML. Proposed Notes
   begin unselected, are individually editable and removable, and are never saved
   as a side-effect of accepting a Task or a link. An accepted one is created
   through the canonical Notes repositories and linked to the Meeting by the
   ordinary `link.related` relationship.

Also in this release: a Task accepted from a **Note** is linked back to that Note
through the canonical `task.relates_to` capture relationship (visible from the
Note's Linked surface), the acceptance path resolves the proposal's source
**server-side** from an id rather than trusting a browser-supplied type, and the
OpenAI adapter now sends `store: false` on every request — a correction to what
DalyHub was leaving on by omission, not a zero-retention claim
([`AI_PLATFORM.md`](../development/AI_PLATFORM.md) §16).

**No migration.** Meeting items, Tasks, Notes, EntityLinks and Activity all use
their existing storage; a proposed Note exists only in the response and the
owner's review state until it is accepted.

**Not included, and still open:** AI-03's daily planning
([DEBT-91](../product/PRODUCT_DEBT.md)), embeddings
([DEBT-93](../product/PRODUCT_DEBT.md)), persistent generated-result storage
([DEBT-92](../product/PRODUCT_DEBT.md)) and the export question
([DEBT-94](../product/PRODUCT_DEBT.md)). No live provider call has been made from
this repository ([`AI_PLATFORM.md`](../development/AI_PLATFORM.md) §21).

- **Priority.** P3. Delivered.

#### ◐ AI-03 — Planning & review assistance

- **Partly delivered, and deliberately not marked ☑.** The Weekly Review assistant
  ships: a deliberate action inside the guided flow, built from facts DalyHub
  calculates itself, with cited supporting records, observation/inference labelling
  and text the owner accepts into their own focus section.
- **What AI-03 still owes.** Daily planning proposals for Today are not built, and
  the assistant's fact block is bounded to what a small number of repository reads
  can honestly support — stalled Projects, projects without a visible next action,
  Goal alignment and Diary counts are reported as `0` placeholders rather than
  re-deriving PROJ-02/AREA-03. Wiring the guided Review's own evaluators into the
  assistant, and daily planning, remain open; the fact block is recorded as
  [DEBT-91](../product/PRODUCT_DEBT.md#-debt-91--the-weekly-review-assistants-fact-block-is-narrower-than-the-guided-reviews-own-evaluators--p3).
- **Priority.** P3.

- **Priority.** AI-01 P2 ☑, AI-04 P2 ☑, AI-02 P3 ☑ (2026-08-05), AI-03 P3 ◐.

### ☐ Not planned, recorded so they are not mistaken for oversights

None of the following exists, none is scheduled, and each is written down here
because a reader would otherwise wonder whether it was forgotten:

- two-way Obsidian sync (V2 exports a vault; it does not read one back);
- email ingestion, webhook capture and Pushover or any other notification channel
  ([DEBT-57](../product/PRODUCT_DEBT.md#-debt-57--asset-obligations-are-tracked-but-nothing-reaches-the-owner-outside-the-app--p2)
  records the honest consequence for Asset obligations);
- transcription and advanced analytics;
- ~~offline mode~~ — **this changed.** A first offline milestone has shipped: an
  installable PWA, a service worker, a read-only seven-day snapshot and an
  append-only capture queue. See
  [PWA-02 below](#-pwa-02--offline-editing-and-the-rest-of-the-offline-story)
  for what it deliberately did NOT do, and
  [`PWA_AND_OFFLINE.md`](../development/PWA_AND_OFFLINE.md) for what it did;
- collaboration, multi-user permissions and roles;
- subscriptions and billing;
- file attachments and R2 storage
  ([DEBT-35](../product/PRODUCT_DEBT.md#-debt-35--assets-deferred-capabilities-attachments-reminders-logbooks-ingestion-ai--p3));
- weather and calendar widgets on Today
  ([DEBT-53](../product/PRODUCT_DEBT.md#-debt-53--weather-and-calendar-on-today-were-removed-not-implemented--p3)
  — when a real source exists, weather returns as an OPTIONAL widget that is off
  until configured, never as reserved space).

## Shipped after V2.0.1 — the first offline milestone

### ☑ PWA-01 — Installable PWA, icon system and offline foundation

- **Not in the original V2 roadmap.** "Offline mode" was in the *not planned*
  list above. It was brought forward deliberately, and the list has been
  corrected rather than quietly edited.
- **Delivered.** A standards-compliant web app manifest and device metadata; a
  first-party, generated icon system with a canonical parametric vector source
  and a deterministic `--check`-able build; a service worker with an allow-listed
  cache strategy, a small precache set and a wait-then-offer update model; a
  read-only, minimised, identity- and workspace-namespaced fifteen-day IndexedDB
  snapshot; an append-only offline capture queue for Inbox tasks, quick notes and
  diary entries, replayed through the modules' own create routes with
  database-level idempotency; a shared connection/sync state model derived from
  real request outcomes; an Offline & app Settings section with three separate,
  individually-explained destructive controls; an explicit offline schema ladder
  with real recovery paths; automated coverage across unit, Workers-runtime and
  Playwright layers; and enforced performance/storage budgets.
- **Documented.** [`PWA_AND_OFFLINE.md`](../development/PWA_AND_OFFLINE.md),
  [ADR-066](../decisions/ARCHITECTURE_DECISIONS.md#adr-066-a-read-only-offline-snapshot-an-append-only-capture-queue-and-a-service-worker-that-caches-exactly-one-html-document).
- **Not production-verified.** Physical-device testing (iPhone/iPad Safari,
  installed desktop) has NOT been performed. The manual checklist is written and
  must be worked through before this is called production-ready.

### ☑ PWA-11 — Offline launch stability on an installed iPhone

- **Not planned. Reported from production.** An installed DalyHub opened with no
  connection rendered the offline shell and was then replaced by WebKit's
  *"A problem repeatedly occurred on https://hub.daly.id.au/"*. This item exists
  because PWA-01's foundation was, in one specific way, wrong — and an unverified
  foundation is exactly what the PWA-02 note above warns against building on.
- **Root cause, stated once.** The manifest's `start_url` is `/`, so an offline
  launch is a document navigation to `/`. The service worker answered it with the
  `/offline` document's HTML, leaving a document server-rendered for one route
  under a different url. React Router hydrated against `/`, lazily imported the
  route modules for `/` — deliberately not precached — and, when that import
  failed with no network, called `window.location.reload()` from inside
  `loadRouteModule`. The reload re-entered the same path until iOS terminated
  the app.
- **Delivered.** The navigation fallback now redirects a non-`/offline`
  navigation to `/offline` rather than serving its body there; the fallback is
  restricted to genuine GET document navigations by `mode` **and** `destination`;
  every non-document request fails cleanly (empty `504 text/plain`) so no script,
  module, stylesheet, image, font, manifest or API request can receive HTML; a
  bounded offline-boot loop breaker serves a script-free safe-mode page if the
  shell is served more than four times in sixty seconds; every IndexedDB
  operation is on a deadline, so the five local-storage outcomes always resolve
  and no indefinite loading state remains; stored rows are sanitised before
  render, so corrupt data cannot blank the page; the service-worker update reload
  is a one-shot guard at module scope; reconnecting on the offline shell offers a
  sync instead of performing one; concurrent sync passes are deduplicated; and a
  redacted, bounded diagnostics channel distinguishes the seven failure modes
  that could not be told apart when this was first reported.
- **Documented.** [`PWA_AND_OFFLINE.md §4.5`](../development/PWA_AND_OFFLINE.md),
  and the iPhone offline-stability acceptance test in the same file.
- **Still not device-verified.** The acceptance test is written and has **not**
  been run on physical hardware. PWA-01's checklist remains the gate before
  PWA-02.

### ☐ PWA-02 — Offline editing, and the rest of the offline story

- **What PWA-01 deliberately did not do, and why.** Offline **editing,
  completion and deletion** of existing records need a conflict model, and a
  milestone that shipped last-write-wins would have quietly corrupted the
  owner's data. This item owns that design: which mutations are safe, how a
  concurrent server change is detected, what the owner sees when two versions
  disagree, and what "resolve" means in a product whose principle is that
  DalyHub never silently mutates the owner's data.
- **The named remainders**, each already recorded honestly:
  - editing a queued capture before retrying it;
  - full note and diary bodies offline (excerpts only today);
  - a pinning capability for records outside the seven-day window;
  - [DEBT-68](../product/PRODUCT_DEBT.md) — logout does not clear local data;
  - [DEBT-69](../product/PRODUCT_DEBT.md) — capture receipts are never pruned;
  - [DEBT-70](../product/PRODUCT_DEBT.md) — hydrated offline rendering is not
    covered by automation.
- **Still out of scope, and still deliberately so.** Collaborative or real-time
  sync, background/periodic sync, push notifications, attachment
  synchronisation, cross-device queue transfer, storing credentials on a device,
  encrypting local storage, native wrappers and app-store distribution.
- **Priority.** P3. **Do not start it before the manual device verification of
  PWA-01 is done** — an editing model built on an unverified foundation inherits
  every unverified assumption.

---

---

## Build order

0. **[Immediate blockers](#immediate-blockers--5-august-2026-end-to-end-audit)** —
   the 5 August 2026 audit's remediation, **ahead of SET-02**. AUDIT-FIX-01 and
   AUDIT-FIX-02 were confirmed, reproduced, release-blocking P1 data-integrity
   defects on core daily-use paths (recurring-task completion; meeting-item
   editing); **both are now resolved, each reproduced against real Workers/D1
   before it was changed and each covered by new regression tests — though
   production verification remains a separate, still-outstanding gap.**
   AUDIT-FIX-03/04/05 are the P2 permanent-delete, CSRF and
   documentation follow-ups. Restore is worth more than a restyle, but a product
   that bricks a recurring task on a checkbox toggle is worth fixing before either.
1. **[SET-02](#-set-02--backup--restore-v21)** — restore. The one gap V2 knowingly
   leaves, and the reason a bad day is still unrecoverable.
2. **[REVIEW-02](#-review-02--weekly-review)** + REVIEW-04's stepper — the flagship
   weekly flow, and the mobile ergonomic that belongs with it.
3. **[DS-14](#-ds-14--whole-application-visual-overhaul)** and
   **[DS-15](#-ds-15--today-reference-layout-and-app-wide-surface-contract-correction)** — the whole-application
   restyle. **Third deliberately**, and the entry says why: recoverability and the
   weekly flow are worth more than a restyle, and a whole-app restyle taken out of
   order is how a roadmap stops moving. It touches every surface, so it is cheapest
   once the two items above have stopped changing them — and it is large and pleasant
   enough that putting it first would quietly cost the owner the two things they
   actually cannot do today.
4. **[ASSET-03](#-asset-03--mobile-assets)**, **[PEOPLE-04](#-people-04--mobile-people)** —
   the two named mobile remainders, now unblocked.
5. **[DIARY-02](#-diary-02--day-context-links)**, **[REVIEW-03](#-review-03--insights--alignment)**,
   **[SET-03](#-set-03--account--security)** — module completion.
6. **[X-02](#-x-02--saved-views--cross-module-filters)** — the cross-module half.
7. **[X-03](#-x-03--import--sync-todoist-notion-calendar)** — imports, after restore
   exists.
8. **[AI-01 … AI-04](#-ai-01--ai-04--the-ai-phase)** — last, by design. **AI-01,
   AI-02 and AI-04 are now delivered**; AI-03 remains partly open, with the named
   remainders recorded in its entry.

Ahead of all of them, and not a numbered item because it is verification rather
than construction: **work through the PWA-01 manual device checklist** in
[`PWA_AND_OFFLINE.md`](../development/PWA_AND_OFFLINE.md#manual-device-checklist).
Offline support that has never been opened on a real phone in a real dead spot
is not finished, and nothing in this file should be built on top of it until it
has been.

---

## Related documents

- [`ROADMAP_V2.md`](ROADMAP_V2.md) — what V2 is, and the full history of every item
  above.
- [`RELEASE_NOTES_V2.md`](../release/RELEASE_NOTES_V2.md) — what shipped, its known
  limitations, and what is deferred.
- [`RELEASE_CHECKLIST_V2.md`](../release/RELEASE_CHECKLIST_V2.md) — the evidence
  behind the release verdict.
- [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) — the debt register, with each
  entry's target release.
- [`AGENTS.md`](../../AGENTS.md) — how to build any of it.
