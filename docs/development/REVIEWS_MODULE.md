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

E2E coverage for the complete mobile/accessibility Reviews journey is still deferred and tracked as product debt.

## Deferred Scope

Deferred deliberately: AI-generated summaries, recommendations, user-designed templates, notifications/reminders, external integrations, PDF export, immutable source-record snapshots, charts/scores, Today reminder widgets beyond the clean module seam, and full unbounded period aggregation.
