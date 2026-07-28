# MEETINGS_MODULE.md — Meeting records (MEET-01) & follow-through (MEET-02)

## Architecture

A Meeting is an ordinary workspace-scoped `entities` record of type `meeting` plus one mandatory `meeting_details` row. Identity, title and generic soft deletion remain kernel concerns. Operational `planned`, `completed`, and `cancelled` status is independent of the reversible `archived_at` collection lifecycle.

The module uses the authenticated workspace composition boundary; callers cannot provide a workspace or Activity actor. Creation batches entity identity, details, and `meeting.created`. Detail and lifecycle writes are parameterised and append structural Activity without agenda, notes, decision, outcome, or contact content.

## Data model

`meeting_details` stores UTC start/end instants, the owner's IANA display timezone, optional location/mode/HTTPS meeting URL, status, canonical agenda and notes Markdown source, archive state, and update time. Rendered HTML is never persisted. `meeting_items` stores stable, ordered `agenda`, `decision` and `outcome` children — MEET-02 widened the MEET-01 `decision`/`outcome` vocabulary with `agenda` (migration `0015`) so an agenda item gains the same stable identity a decision/outcome already has and can be converted to a Task **without** parsing the free-form `agenda_markdown` prose. The free-form agenda Markdown field is unchanged; the Agenda tab keeps it (agenda narrative) and adds a structured, convertible "Agenda items" list beside it.

Attendees are real Person entities connected with the `meeting.attendee` EntityLink type; MEET-02 adds the write path (add/remove an attendee from the Summary tab) that MEET-01 only read. Because the kernel records a link's `entity_link.created` with **both** endpoints as subjects, attending a meeting already surfaces on the attendee's People Timeline (see People seam below).

## Follow-through & Task conversion (MEET-02)

Meetings turn passive records into actionable follow-through. A **Follow-up tab** shows the meeting's canonical DalyHub Tasks grouped **Open / Waiting-or-delegated / Completed** (derived from the shared `taskDisplayState` evaluator — never a cached Meeting-side status), the structured items **not yet converted**, and an **Add follow-up task** action. There is no Meeting-local task list, status or priority vocabulary; the tab queries canonical Tasks.

Every structured agenda item, decision and outcome exposes a single **Create task** / **Open task** control plus a textual conversion state (state is never colour-only). Converting:

- runs through the canonical Task authority (`scope.tasks.createTask` / `updateTask`) — the Meeting module writes **no** Task rows and invents no status/priority vocabulary;
- prefills the Task title from the item's own text (editable before creation) and accepts optional priority, due date, scheduled date, Time Sector, commitment state and status via the existing Task contracts;
- requires an Area/Project parent (a Task always has exactly one) chosen through the shared `/tasks/parent-options` picker (`useTaskParentSearch`, `~/shared/task-record`);
- records the durable source-item mapping and a navigable `task.relates_to` EntityLink;
- opens the new Task in the canonical shared Task Drawer.

The Follow-up tab also creates a **direct** follow-up not tied to any item; its title prefills from the meeting title (never private notes) and it links back to the meeting the same way.

### The source-item mapping (`meeting_item_tasks`)

A `task.relates_to` EntityLink alone says a Task relates to a Meeting but not **which** decision/outcome/agenda item produced it. Migration `0015` adds the narrow, workspace-scoped `meeting_item_tasks(workspace_id, meeting_id, item_id, task_id, created_at)`:

- `PRIMARY KEY (workspace_id, task_id)` — a Task has at most one Meeting source;
- a **partial unique index** on `(workspace_id, item_id) WHERE item_id IS NOT NULL` — **at most one converted Task per source item** (the documented product rule; direct follow-ups have `item_id IS NULL` and are exempt);
- `FOREIGN KEY (workspace_id, meeting_id) → meeting_details ON DELETE CASCADE` — a deleted Meeting drops its mapping rows but **never** the canonical Tasks (the mapping does not own the Task);
- item identity is the stable `meeting_items.id`, so a mapping **survives item reordering** (position changes never touch it);
- all SQL is parameterised; the workspace and actor are trusted server config, never client input.

The mapping **supplements** the Universal Relationship System; it never replaces it (RELATIONSHIPS.md). Task→Meeting navigation and the global Linked Items view use the `task.relates_to` link; the mapping only answers "which item, and is it converted".

### The conversion orchestration (transaction & idempotency)

`app/modules/meetings/follow-up-operations.ts` is the explicit orchestration boundary. The FND-07 `createTask` encapsulates its own atomic `D1Database.batch()`, so the four writes (Task, mapping, link, Activity) cannot be fused into one cross-repository transaction through the public contracts. The orchestration therefore provides:

- **A clear commit point** — `meetings.linkFollowUpTask` writes the mapping row **and** its structural Activity (`meeting.item_converted_to_task` for an item, `meeting.follow_up_created` for a direct follow-up) in ONE batch. The conversion is "official" only once this commits.
- **Idempotency** — an item's mapping is the key: a repeat conversion of an already-converted item returns the SAME Task (never a second), and re-asserts the (idempotent) `task.relates_to` link.
- **Duplicate rejection & recovery** — a concurrent winner trips the partial unique index (`MeetingFollowUpConflictError`); the just-created duplicate Task is compensated (soft-deleted through the spine — the Task authority) and the winning Task is returned. Any other pre-commit failure soft-deletes the created Task so a reported failure is truthful and a retry is clean.
- **Truthful semantics** — success is reported only after the commit point; the navigable link is a post-commit, self-healing step.
- **Stale-mapping recovery** — if a converted Task was later deleted (canonical Task lifecycle), the item becomes convertible again: the stale mapping is cleared and a fresh conversion proceeds.

**Documented residual window:** a hard process crash in the gap between `createTask` committing and the mapping committing can leave one Task with no mapping (invisible to the mapping-backed Follow-up surface), so a retry could create a second Task. This is the one state a single D1 batch would remove; the encapsulated `createTask` batch is why it cannot be, and it is accepted rather than hidden.

## Activity

The Meeting Activity tab is a real DS-05 Timeline (`/meeting/:id/activity`), replacing MEET-01's placeholder. Descriptors (`meeting-activity.ts`) cover the lifecycle types plus MEET-02's two structural events — `meeting.item_converted_to_task` and `meeting.follow_up_created` — both recording the Meeting and the created Task as subjects. **Payloads carry only structural metadata (the item kind); never agenda, notes, decision or outcome text** (AGENTS.md §17).

## People timeline seam (MEET-02 → MEET-03)

Attendee `meeting.attendee` links already appear on both the meeting's and the attendee's Timelines because the kernel records `entity_link.created` with both endpoints as subjects — so "linked to <meeting>" surfaces on a Person today with no new model. Richer, meaning-specific People-timeline descriptors ("attended meeting", "follow-up task created/completed" scoped to the attendee) require either a link-type-scoped descriptor or emitting Person-subject events, which is a broader change owned by **MEET-03 / PEOPLE-02**. MEET-02 ships the clean underlying relationship/activity seam and defers the richer People-timeline UI adoption there — no People-specific shadow history model is introduced.

## Product surface

The module contributes Upcoming, Recent and Archived collection views; a fast creation route; a canonical Record Layout with Summary (incl. attendee management), **Follow-up**, Agenda, Notes, Decisions, Outcomes, Linked, Activity and Settings; bounded global search; Open/Create/Search commands and a meeting-aware **New meeting follow-up** ⌘K action (a `navigate` action to the meeting's Follow-up tab with the direct follow-up drawer open). The **Linked** tab is the shared Universal Relationship System Linked Items section (REL-01); the follow-up `task.relates_to` links appear there read-only. Agenda and notes reuse `LiveMarkdownEditor` and the DS-06 autosave coordinator.

## Lifecycle

- **Archived meeting** — readable; linked Tasks stay accessible and navigable; existing relationships stay visible; **new** conversions are rejected (`MeetingArchivedError`) and creation controls disappear; existing Tasks are never archived or deleted.
- **Completed / cancelled Task** — stays mapped and linked, appears under the Completed follow-up band, remains openable.
- **Deleted Task** — the follow-up read resolves through the canonical Task model and drops a deleted Task safely (no broken links, no leaked ids); the item becomes convertible again.
- **Meeting deletion** — follows the existing Meeting lifecycle; it never cascade-deletes canonical Tasks.

## Deliberate deferrals

- **MEET-03 / PEOPLE-02:** the unified relationship-history projection and meaning-specific meeting events on People Timelines. The attendee EntityLink seam is in place.
- **MEET-04:** deeper capture-specific mobile optimisation (MEET-02 inherits the responsive baseline and is verified 320–2560px).
- Calendar synchronisation, invitations, conferencing creation, reminders, recurring series, automated reminders, notifications, AI-generated summaries, autonomous action-item extraction from prose, email ingestion and attachments remain out of scope. No dead settings or placeholder controls for these are added.

---

## Status (2026-07-27 reconciliation)

**Current status.** [MEET-01](../roadmap/ROADMAP_V2.md#-meet-01--meeting-record) and [MEET-02](../roadmap/ROADMAP_V2.md#-meet-02--follow-ups--tasks) are ☑. [MEET-03](../roadmap/ROADMAP_V2.md#-meet-03--people--history-integration) and [MEET-04](../roadmap/ROADMAP_V2.md#-meet-04--mobile) are ☐.

**Delivered capabilities.** First-class workspace-scoped Meeting identity with an additive detail slice and ordered decision/outcome/agenda items; Upcoming / Recent / Archived collection views; the canonical shared Record Layout; independent shared Markdown autosave surfaces; a real `meeting.attendee` EntityLink type wired to add/remove attendees; the Follow-up tab converting agenda items, decisions and outcomes into **canonical DalyHub Tasks** through `scope.tasks.createTask` (no second Task model), with stable structured identity (`meeting_items`, migration `0015`); structural Activity; a **real, repository-backed** search provider and three commands; and a reversible archive lifecycle.

**Known limitations.**

- **Meetings do not yet contribute to attendee history.** The attendee *link* exists and its creation event reaches the person's timeline, but the meeting's substance — its date, decisions, outcomes and follow-up Tasks — does not, so "what did we discuss" is unanswerable from a Person record. [MEET-03](../roadmap/ROADMAP_V2.md#-meet-03--people--history-integration).
- **The collection forks the shared Card.** `MeetingsCollection.tsx` renders a hand-rolled `dh-meeting-card` anchor rather than the DS-04 Card, so it does not inherit selection, quick actions, density or swipe behaviour — [DEBT-01](../product/PRODUCT_DEBT.md#-debt-01--duplicate-card-implementations-per-module--p1).
- **Lifecycle placement diverges.** Archive/Restore is an inline button in the record body, not the Settings-tab pattern Projects/Areas/People/Assets/Reviews use, and not a shared overflow menu (none exists) — [DEBT-29](../product/PRODUCT_DEBT.md#-debt-29--record-removal-is-inconsistent-and-undiscoverable-no-shared-overflow-menu-exists--p1).
- Mobile coverage is partial: the follow-up surface has axe (light and dark) and 390/320px overflow assertions, and `/meetings` is in the accessibility sweep, but the collection and record have no dedicated mobile journey.

**Corrected 2026-07-27 — the follow-up journey's E2E failure was never a Meetings defect.** `e2e/meetings-follow-up.spec.ts` failed consistently in CI, timing out looking for the record's Agenda or Settings tab, and [DEBT-41](../product/PRODUCT_DEBT.md#-debt-41--the-e2e-suite-is-unreliable-on-main-so-ci-is-green-claims-are-unverifiable--p1) flagged it as the likeliest genuine product or fixture defect. The page snapshot from a local reproduction showed the browser sitting on **`/new/meeting`** — it had navigated back off the record entirely. The cause is in the shared DS-03 Drawer: closing a provider-opened level is `navigate(-1)`, a history pop that does not land synchronously, and the spec's `closeDrawer` helper pressed Escape again after a fixed 120ms if a dialog was still present. A second Escape inside that window read the same stale stack and popped a *second* time, past the meeting record. Fixed in the shared provider (close is now idempotent per history entry, so a repeated Escape can never over-pop) plus the helper, which now waits on one-fewer-dialog rather than a fixed delay. The Agenda and Settings tabs were correct throughout; no Meetings code changed.

**Deferred work.** People/history integration; mobile completion (especially capture **during** a meeting on a phone); calendar sync and invitations; AI-proposed tasks and notes from meeting content ([AI-02](../roadmap/ROADMAP_V2.md#-ai-02--meeting--tasksnotes-proposals), which layers a review step over the existing MEET-02 conversion authority rather than replacing it).

**Relevant roadmap items.** [MEET-01](../roadmap/ROADMAP_V2.md#-meet-01--meeting-record) ☑ · [MEET-02](../roadmap/ROADMAP_V2.md#-meet-02--follow-ups--tasks) ☑ · [MEET-03](../roadmap/ROADMAP_V2.md#-meet-03--people--history-integration) ☐ · [MEET-04](../roadmap/ROADMAP_V2.md#-meet-04--mobile) ☐ · [PEOPLE-02](../roadmap/ROADMAP_V2.md#-people-02--relationship-timeline) ☐ (blocks MEET-03) · [AI-02](../roadmap/ROADMAP_V2.md#-ai-02--meeting--tasksnotes-proposals) ☐.

**Relevant product-debt items.** [DEBT-01](../product/PRODUCT_DEBT.md#-debt-01--duplicate-card-implementations-per-module--p1) · [DEBT-29](../product/PRODUCT_DEBT.md#-debt-29--record-removal-is-inconsistent-and-undiscoverable-no-shared-overflow-menu-exists--p1) · [DEBT-07](../product/PRODUCT_DEBT.md#-debt-07--fragmented-activityhistory--p2).
