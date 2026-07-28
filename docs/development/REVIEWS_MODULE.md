# Reviews Module

REVIEWS-01 makes Reviews first-class DalyHub records for stepping back, reflecting on a defined period, closing loops and planning the next period.

## Product Purpose

A Review is durable, not a dashboard session. It stores the owner's authored reflection and lifecycle state for a wall-calendar period, then presents bounded live context from source modules. Reviews are calm reflection records: no scores, streaks, AI summaries, notifications or gamification.

## Review Types And Periods

Supported types are `weekly`, `monthly`, `quarterly`, `annual` and `custom`.

Periods are stored as ISO wall-calendar `YYYY-MM-DD` strings in `review_details.period_start` and `period_end`. They are never converted to UTC instants. Weekly periods use the persisted owner first-day-of-week preference. Monthly, quarterly and annual periods follow normal calendar boundaries, including leap years and year boundaries. Custom Reviews require `period_end >= period_start`.

Default titles are generated from the owner's date-format preference:

- `Weekly Review — 27 July–2 August 2026`
- `Monthly Review — July 2026`
- `Quarterly Review — Q3 2026`
- `Annual Review — 2026`
- `Custom Review — 15–27 July 2026`

## Data Ownership

Reviews follow the DalyHub entity/detail pattern:

- `entities` owns identity, title, workspace scope and generic lifecycle metadata.
- `review_details` owns review type, period, status, template id, completion timestamp, archive timestamp and detail update timestamp.
- `review_sections` owns authored Markdown sections keyed by a closed section vocabulary.
- EntityLinks own relationships through the Universal Relationship System.
- Activity owns structural history.

Review section ids are closed: summary overall/highlights/challenges/lessons/decisions/next focus, progress commentary, task commentary, diary commentary and people/meetings commentary. The module does not store an uncontrolled JSON Review blob.

## Live Context, Authored Content And Links

REVIEWS-01 uses live context plus durable authored reflection and durable links.

- **Live:** bounded Tasks, Diary entries and Meetings are read from their owning repositories for the Review period. Source titles and labels may reflect their current canonical state after the Review is completed.
- **Authored:** Review section Markdown is stored in `review_sections`.
- **Linked:** deliberate relationships use shared EntityLinks, usually `link.related`, and render through the shared Linked Items tab.
- **Snapshotted:** no whole source-record snapshots are stored in REVIEWS-01.

This means a completed Review preserves what the owner wrote and linked, but source-record labels remain live unless a future snapshot feature is deliberately added.

## Status And Lifecycle

Status is a closed vocabulary: `draft`, `in_progress`, `completed`. Archive is a separate lifecycle timestamp, not a status.

Completing a Review sets `status = completed`, sets `completed_at`, appends structural Activity and makes authored sections read-only in the UI. Reopening sets `status = in_progress`, clears the current `completed_at`, restores editing and preserves the previous completion event in Activity.

Archiving is reversible. Archived Reviews are excluded from active collection views but remain readable by direct URL. Editing is disabled while archived and restore is available.

Permanent deletion is separate from archive, guarded by exact-title confirmation in the shared dangerous-action dialog. It deletes Review-owned section/detail rows and Review links in FK-safe order, and never deletes linked source records.

## Duplicate Handling

Standard Reviews (`weekly`, `monthly`, `quarterly`, `annual`) have storage-level duplicate protection on `(workspace_id, review_type, period_start, period_end)` via a partial unique index. Creating the same active standard period returns the existing Review. Creating the same archived standard period restores and returns that Review instead of creating a second identity. Custom Reviews may overlap.

## Template Versioning

Templates are internal, not user-customisable. Each type resolves to a versioned id such as `review.weekly.v1`, which is stored on the Review. Template prompts guide writing but are not required for completion and are not copied into every Review row.

## Activity And Privacy

Review Activity types are structural: created, updated, status changed, completed, reopened, archived, restored and deleted.

Activity payloads carry only structural metadata such as review type, period, template id, changed field names, section ids and status transitions. Payloads must not contain reflection text, Diary content, Meeting notes, Task titles, Person details, private notes or full section content.

## Navigation, Search And Commands

Reviews register through the module registry:

- one sidebar destination: `/reviews`
- canonical record route: `/reviews/:reviewId`
- creation route: `/reviews/new`
- commands: Open Reviews, New Review
- search provider: title search over real workspace Reviews, opening the canonical record
- shared entity destination: `review` links navigate to `/reviews/:id`

Reviews are visible by default through existing Settings navigation reconciliation; there is no Settings hard-code.

## Mobile And Accessibility

The collection, creation form and record tabs are responsive. Controls wrap instead of hiding required information, and task/context links use at least 44px touch targets. The record uses the canonical Record Layout and the shared Task Drawer, Linked Items, Timeline, Markdown editor and Settings dangerous-action dialog, inheriting their keyboard and focus-management behavior.

## Test Strategy

Coverage added in REVIEWS-01:

- pure period/title/template/vocabulary unit tests
- D1/kernel tests for atomic create, duplicate protection, custom overlaps, workspace isolation, lifecycle, archived mutation protection, deletion/link safety, rollback and Activity privacy
- existing shared destination, picker and registry tests updated for Review route support

E2E coverage exists and is broader than this section originally stated (corrected 2026-07-27): [`e2e/reviews.spec.ts`](../../e2e/reviews.spec.ts) covers the weekly creation/editing/linking/lifecycle journey, search, the command palette, axe in **light and dark** on the record, and no horizontal overflow at 320px and 390px including the Settings tab; `/reviews` is also in the [`e2e/accessibility.spec.ts`](../../e2e/accessibility.spec.ts) sweep. What remains deferred is the *mobile-completion* journey ([REVIEW-04](../roadmap/ROADMAP_V2.md#-review-04--mobile)), not baseline accessibility coverage.

**The lifecycle journey is now verified (2026-07-27).** It previously failed on most runs — `e2e/reviews.spec.ts:89` could not click *Restore review* because the shared DS-10 notification region intercepted the pointer event. That was a shared feedback-layer defect, never a Reviews one, and it is fixed at source: the region now takes pointer input only on its own controls ([DEBT-38](../product/PRODUCT_DEBT.md#-debt-38--notification-toasts-occlude-bottom-anchored-record-actions--p1), closed). Because a single green run was explicitly *not* accepted as evidence for a timing-dependent failure, the journey was re-run with `--repeat-each=3` alongside the other previously-unreliable specs: **87/87 passed**, archive and restore included, through ordinary user interactions with no forced clicks and no test-only CSS.

## Deferred Scope

Deferred deliberately: AI-generated summaries, recommendations, user-designed templates, notifications/reminders, external integrations, PDF export, immutable source-record snapshots, charts/scores, Today reminder widgets beyond the clean module seam, and full unbounded period aggregation.

---

## Status (2026-07-27 reconciliation)

**Current status.** Delivered and in production use as [REVIEWS-01](../roadmap/ROADMAP_V2.md#-reviews-01--dalyhub-reviews-foundation) (merged as #73), and **cleanly verified as of 2026-07-27** — the blocking [DEBT-38](../product/PRODUCT_DEBT.md#-debt-38--notification-toasts-occlude-bottom-anchored-record-actions--p1) occlusion is fixed in the shared feedback layer and the full Reviews journey passes on repeat runs (see E2E coverage above). Reviews is **not** newly complete: REVIEWS-01 was already delivered; only its verification caveat is lifted.

**Delivered capabilities.**

- First-class `review` entities with a typed `review_details` slice and structured `review_sections` (migration `0018`).
- Weekly / monthly / quarterly / annual / custom types over wall-calendar periods, honouring the owner's first-day-of-week preference.
- Storage-enforced duplicate protection for standard periods; custom periods may overlap.
- Internal versioned templates (`review.<type>.v1`) with per-type section prompts.
- `/reviews` collection views, `/reviews/new`, and the canonical `/reviews/:reviewId` record on the shared Record Layout.
- Shared Markdown authoring, Linked Items, the DS-05 Activity Timeline, and Settings-tab lifecycle (complete/reopen, reversible archive, guarded permanent deletion).
- A **real, repository-backed** search provider and `Open Reviews` / `New Review` commands — Reviews is one of only five modules that registers a real search provider.
- Bounded live period context for Tasks, Diary entries and Meetings.
- Activity payloads carry structural metadata only — never reflection text, Diary content, Meeting notes, Task titles or Person details.

**Known limitations.**

- Period context is a **bounded live helper**, not a complete aggregation: it reads Tasks, Diary and Meetings, but **not Projects updated in the period**, and does not paginate beyond its bounds — [DEBT-34](../product/PRODUCT_DEBT.md#-debt-34--reviews-period-context-and-today-integration-are-bounded-first-cuts--p2).
- Source labels stay live. A completed Review preserves what the owner **wrote and linked**, but a linked record renamed later shows its new title; no immutable snapshot is stored.
- No Today entry point for "start or continue this week's Review".
- Lifecycle actions live in a record Settings tab, matching Projects/Areas/People/Assets — but there is still no shared Record Header overflow menu anywhere in the product ([DEBT-29](../product/PRODUCT_DEBT.md#-debt-29--record-removal-is-inconsistent-and-undiscoverable-no-shared-overflow-menu-exists--p1)).

**Deferred work.** AI-generated summaries and recommendations; user-designed templates; notifications and reminders; external integrations; PDF export; immutable source-record snapshots; charts, scores and streaks; the guided weekly flow ([REVIEW-02](../roadmap/ROADMAP_V2.md#-review-02--weekly-review)); derived reflection insights ([REVIEW-03](../roadmap/ROADMAP_V2.md#-review-03--insights--alignment)); and mobile completion beyond the DS-11 baseline ([REVIEW-04](../roadmap/ROADMAP_V2.md#-review-04--mobile)).

**Relevant roadmap items.** [REVIEWS-01](../roadmap/ROADMAP_V2.md#-reviews-01--dalyhub-reviews-foundation) ☑ · [REVIEW-02](../roadmap/ROADMAP_V2.md#-review-02--weekly-review) ☐ · [REVIEW-03](../roadmap/ROADMAP_V2.md#-review-03--insights--alignment) ☐ · [REVIEW-04](../roadmap/ROADMAP_V2.md#-review-04--mobile) ☐.

**Relevant product-debt items.** [DEBT-38](../product/PRODUCT_DEBT.md#-debt-38--notification-toasts-occlude-bottom-anchored-record-actions--p1) (resolved 2026-07-27) · [DEBT-34](../product/PRODUCT_DEBT.md#-debt-34--reviews-period-context-and-today-integration-are-bounded-first-cuts--p2) · [DEBT-29](../product/PRODUCT_DEBT.md#-debt-29--record-removal-is-inconsistent-and-undiscoverable-no-shared-overflow-menu-exists--p1) · [DEBT-24](../product/PRODUCT_DEBT.md#-debt-24--no-alignment-history--trend-is-stored--p3) (lands under REVIEW-03) · [DEBT-41](../product/PRODUCT_DEBT.md#-debt-41--the-e2e-suite-is-unreliable-on-main-so-ci-is-green-claims-are-unverifiable--p1).

---

## The consistency pass (DS-12 / PX-04 / PX-05 / PX-06, 2026-07-28)

**Lifecycle in the shared overflow.** Archive/Restore and the guarded permanent delete now also
appear in the Record Header overflow (⋯). A failed lifecycle post now **throws**, so the shared
confirmation dialog stays open with an inline error and a retry rather than closing as though it
had worked. The Review's tab stack adopted the shared `.dh-record-stack` rhythm.

See [`DESIGN_SYSTEM.md → Shared overflow menu`](../design/DESIGN_SYSTEM.md#shared-overflow-menu-ds-12),
[`→ Shared record lifecycle`](../design/DESIGN_SYSTEM.md#shared-record-lifecycle-px-04) and
[ADR-053](../decisions/ARCHITECTURE_DECISIONS.md#adr-053-the-shared-overflow-menu-and-one-record-lifecycle-vocabulary).
