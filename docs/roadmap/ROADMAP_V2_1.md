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

### ◐ REVIEW-04 — Mobile Reviews

- **Original entry.** [`ROADMAP_V2.md → REVIEW-04`](ROADMAP_V2.md#-review-04--mobile).
- **Delivered in V2.** The writing surface, full-width choices, a real share of the
  viewport for reflection editors, and the shared phone record chrome.
- **Outstanding.** The one-prompt-at-a-time stepper. It is a Review-flow feature,
  not a layout adjustment, so it belongs with REVIEW-02 and is sequenced with it.
- **Priority.** P3.

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

### ☐ REVIEW-02 — Weekly review

- **Original entry.** [`ROADMAP_V2.md → REVIEW-02`](ROADMAP_V2.md#-review-02--weekly-review).
- **Already in place from REVIEWS-01, do not rebuild:** the weekly type, wall-calendar
  weekly periods honouring the first-day-of-week preference, the versioned
  `review.weekly.v1` template and its prompts, duplicate protection, and the
  draft → in progress → completed lifecycle with reopen.
- **What it owes.** The guided *flow*: an ordered, resumable step sequence; inbox to
  zero over the `/tasks` inbox sector without leaving the Review; a project check
  (the period-context loader reads Tasks, Diary and Meetings but not Projects); goal
  alignment reading the AREA-03 evaluator; and a close-out that hands the next period
  its focus. Ship REVIEW-04's stepper with it.
- **Priority.** P2.

### ☐ REVIEW-03 — Insights & alignment

- **Original entry.** [`ROADMAP_V2.md → REVIEW-03`](ROADMAP_V2.md#-review-03--insights--alignment).
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

### ☐ AI-01 … AI-04 — The AI phase

- **Original entries.** [`ROADMAP_V2.md → Phase 11`](ROADMAP_V2.md#phase-11--ai-ai).
- **The architectural principle is non-negotiable and unchanged:** AI may propose
  structured changes; the user must review, edit, accept or reject them; AI must not
  silently mutate DalyHub data. Ship
  [AI-04](ROADMAP_V2.md#-ai-04--privacy-controls)'s consent boundary **together
  with** AI-01, not after it.
- `/ai` remains an honest placeholder that says so. No proposal store, no model
  client, no provider credential and no prompt exists — which is the correct state.
- **Priority.** AI-01 P2, AI-04 P2, AI-02/AI-03 P3. Last, by design.

### ☐ Not planned, recorded so they are not mistaken for oversights

None of the following exists, none is scheduled, and each is written down here
because a reader would otherwise wonder whether it was forgotten:

- two-way Obsidian sync (V2 exports a vault; it does not read one back);
- email ingestion, webhook capture and Pushover or any other notification channel
  ([DEBT-57](../product/PRODUCT_DEBT.md#-debt-57--asset-obligations-are-tracked-but-nothing-reaches-the-owner-outside-the-app--p2)
  records the honest consequence for Asset obligations);
- transcription and advanced analytics;
- offline mode;
- collaboration, multi-user permissions and roles;
- subscriptions and billing;
- file attachments and R2 storage
  ([DEBT-35](../product/PRODUCT_DEBT.md#-debt-35--assets-deferred-capabilities-attachments-reminders-logbooks-ingestion-ai--p3));
- weather and calendar widgets on Today
  ([DEBT-53](../product/PRODUCT_DEBT.md#-debt-53--weather-and-calendar-on-today-were-removed-not-implemented--p3)
  — when a real source exists, weather returns as an OPTIONAL widget that is off
  until configured, never as reserved space).

---

## Build order

1. **[SET-02](#-set-02--backup--restore-v21)** — restore. The one gap V2 knowingly
   leaves, and the reason a bad day is still unrecoverable.
2. **[REVIEW-02](#-review-02--weekly-review)** + REVIEW-04's stepper — the flagship
   weekly flow, and the mobile ergonomic that belongs with it.
3. **[ASSET-03](#-asset-03--mobile-assets)**, **[PEOPLE-04](#-people-04--mobile-people)** —
   the two named mobile remainders, now unblocked.
4. **[DIARY-02](#-diary-02--day-context-links)**, **[REVIEW-03](#-review-03--insights--alignment)**,
   **[SET-03](#-set-03--account--security)** — module completion.
5. **[X-02](#-x-02--saved-views--cross-module-filters)** — the cross-module half.
6. **[X-03](#-x-03--import--sync-todoist-notion-calendar)** — imports, after restore
   exists.
7. **[AI-01 … AI-04](#-ai-01--ai-04--the-ai-phase)** — last, by design.

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
