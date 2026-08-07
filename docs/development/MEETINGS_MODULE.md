# MEETINGS_MODULE.md — Meeting records (MEET-01), follow-through (MEET-02) & people history (MEET-03)

## Architecture

A Meeting is an ordinary workspace-scoped `entities` record of type `meeting` plus one mandatory `meeting_details` row. Identity, title and generic soft deletion remain kernel concerns. Operational `planned`, `completed`, and `cancelled` status is independent of the reversible `archived_at` collection lifecycle, and both are independent of MEET-03's write-once `held_at` occurrence fact ([held-state authority](#held-state-authority-meet-03)).

The module uses the authenticated workspace composition boundary; callers cannot provide a workspace or Activity actor. Creation batches entity identity, details, and `meeting.created`. Detail and lifecycle writes are parameterised and append structural Activity without agenda, notes, decision, outcome, or contact content.

## Data model

`meeting_details` stores UTC start/end instants, the owner's IANA display timezone, optional location/mode/HTTPS meeting URL, status, canonical agenda and notes Markdown source, archive state, MEET-03's `held_at` occurrence instant (migration `0020`), and update time. Rendered HTML is never persisted. `meeting_items` stores stable, ordered `agenda`, `decision` and `outcome` children — MEET-02 widened the MEET-01 `decision`/`outcome` vocabulary with `agenda` (migration `0015`) so an agenda item gains the same stable identity a decision/outcome already has and can be converted to a Task **without** parsing the free-form `agenda_markdown` prose. The free-form agenda Markdown field is unchanged; the Agenda tab keeps it (agenda narrative) and adds a structured, convertible "Agenda items" list beside it.

### Item ordering (`position`) — AUDIT-FIX-02

`meeting_items.position` is an **append-only ordinal owned by the database**, not a
sequence number the application maintains. `addItem` allocates it as
`MAX(position) + 1` scoped to `(workspace_id, meeting_id, kind)` — exactly the scope
of the `UNIQUE (workspace_id, meeting_id, kind, position)` constraint — computed
*inside* the insert statement, so there is no window in which a read maximum can go
stale and no caller can supply a position. Each kind allocates independently.

`removeItem` deliberately **does not renumber** the survivors. Two consequences
follow, and both are intended: removing an interior item leaves its ordinal
permanently vacant (positions are *ordered*, not *contiguous*), while removing the
tail lowers the maximum so that ordinal is reused — safe by construction, since no
live row holds it. Nothing depends on contiguity: items are read
`ORDER BY kind, position, id`, and the source-item mapping is keyed on the stable
`meeting_items.id`, never on position.

Both item mutations are atomic with their `meeting.updated` Activity
(`recordAtomicMutation`), guarded on the domain statement's `changes()`: a refused
or no-op mutation writes no event, and a rolled-back insert leaves no item. The
constraint remains the final integrity boundary — a contended append is retried a
bounded three times and then surfaces the typed `MeetingItemConflictError`, never a
raw uniqueness exception.

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

`app/platform/meetings/follow-up-operations.ts` is the explicit orchestration boundary. **It moved out of `app/modules/meetings/` in AI-02** and is now a platform service, for the reason the architecture already has a precedent for (ADR-033; AREA-02's shared `NewGoalForm`): a second module needs it. The AI acceptance path must route a Meeting-derived Task through THIS authority and no other, and the module-boundary rule correctly forbids `app/modules/ai` from importing `app/modules/meetings`. Duplicating the orchestration would have created the second conversion path the single-authority rule exists to prevent. Nothing about the orchestration changed in the move; the Meetings module's own follow-up route imports it from `~/platform/meetings` unchanged. The FND-07 `createTask` encapsulates its own atomic `D1Database.batch()`, so the four writes (Task, mapping, link, Activity) cannot be fused into one cross-repository transaction through the public contracts. The orchestration therefore provides:

- **A clear commit point** — `meetings.linkFollowUpTask` writes the mapping row **and** its structural Activity (`meeting.item_converted_to_task` for an item, `meeting.follow_up_created` for a direct follow-up) in ONE batch. The conversion is "official" only once this commits.
- **Idempotency** — an item's mapping is the key: a repeat conversion of an already-converted item returns the SAME Task (never a second), and re-asserts the (idempotent) `task.relates_to` link.
- **Duplicate rejection & recovery** — a concurrent winner trips the partial unique index (`MeetingFollowUpConflictError`); the just-created duplicate Task is compensated (soft-deleted through the spine — the Task authority) and the winning Task is returned. Any other pre-commit failure soft-deletes the created Task so a reported failure is truthful and a retry is clean.
- **Truthful semantics** — success is reported only after the commit point; the navigable link is a post-commit, self-healing step.
- **Stale-mapping recovery** — if a converted Task was later deleted (canonical Task lifecycle), the item becomes convertible again: the stale mapping is cleared and a fresh conversion proceeds.

**Documented residual window:** a hard process crash in the gap between `createTask` committing and the mapping committing can leave one Task with no mapping (invisible to the mapping-backed Follow-up surface), so a retry could create a second Task. This is the one state a single D1 batch would remove; the encapsulated `createTask` batch is why it cannot be, and it is accepted rather than hidden.

## Activity

The Meeting Activity tab is a real DS-05 Timeline (`/meeting/:id/activity`), replacing MEET-01's placeholder. Descriptors (`meeting-activity.ts`) cover the lifecycle types plus MEET-02's two structural events — `meeting.item_converted_to_task` and `meeting.follow_up_created` — both recording the Meeting and the created Task as subjects — and MEET-03's `meeting.held`. **Payloads carry only structural metadata (item kinds, counts, dates); never agenda, notes, decision or outcome text** (AGENTS.md §17).

---

## People history (MEET-03)

> Decision & rationale: [ADR-055](../decisions/ARCHITECTURE_DECISIONS.md#adr-055-a-meetings-occurrence-is-a-durable-write-once-fact-and-attendee-history-is-one-multi-subject-activity-event).
> The receiving surface: [`PEOPLE_MODULE.md → §4a`](PEOPLE_MODULE.md#4a-the-unified-relationship-timeline-people-02).

A Meeting now contributes **semantic interaction history** to each attendee's existing unified Person Activity timeline. There is still exactly one Activity kernel, one Person Activity endpoint, one Person Activity tab, one Meeting record and one set of attendee EntityLinks — MEET-03 contributes through those seams and adds no surface of its own.

### The event model

**One new Meeting-owned Activity type: `meeting.held`.** It records, as subjects of a **single** event:

| Subject | Role |
|---|---|
| the Meeting | `subject` |
| every active attendee Person | `attendee` |

It is one multi-subject event, never a copy per person — the same FND-05 mechanism that lets one `entity_link.created` appear in both endpoints' timelines. Because the Person is an Activity **subject in their own right**, the interaction belongs to their history permanently: it survives the attendee link being removed later and stays on a soft-deleted Person's own stream.

**Why only one type.** Per-attendee `meeting.decision_recorded` / `meeting.outcome_recorded` / `meeting.commitment_recorded` events were reviewed against the existing schema and deliberately **not** shipped: `meeting_items` stores `kind`, `body_markdown` and `position` and carries **no Person reference at all**, and a follow-up Task's delegation is plain text (ADR-043 §7), not a Person entity. Nothing in the model can structurally assign a decision or outcome to a Person by stable entity id, and the only ways to invent one — name matching in Markdown, NLP, title matching — are the confident-but-wrong inference AGENTS.md §8 forbids. The limitation is recorded in [Known limitations](#status-2026-07-28-reconciliation), not worked around.

### Held-state authority (MEET-03)

`meeting_details.held_at` (nullable UTC instant, migration `0020`) is the durable, **write-once** fact that the meeting took place. Nothing else in the model could stand in for it:

| Candidate | Why it cannot prove occurrence |
|---|---|
| `status = 'completed'` | Freely re-settable with no UI writer; a `completed → planned → completed` cycle would emit duplicate historical events, and it can be set before the meeting starts. |
| `starts_at` has passed | A clock fact, not an occurrence fact — a skipped or cancelled meeting would fabricate history on a real person's record. |
| `archived_at` | A reversible collection state, orthogonal to occurrence. |

So the authority is an **explicit, truthful domain action**: `scope.meetings.markHeld(meetingId)`, surfaced as **Mark as held** in the shared DS-12 Record Header overflow. A UTC instant (not a wall-calendar date) matches every other instant on the table; the meeting's own calendar day stays derivable from `starts_at` + `timezone`. The migration is additive with **no backfill** — inventing a held state for historical rows would fabricate exactly the attendee history this item exists to make trustworthy.

There is deliberately **no "un-mark"**: Activity is append-only, and a recorded interaction should not be un-said.

### Attendee snapshot behaviour

`markHeld` takes **no attendee argument**. The set is derived inside the repository from the active `meeting.attendee` EntityLinks whose target is a live `person` entity in the bound workspace — one parameterised query, filtered on workspace, `deleted_at IS NULL`, `type = 'person'` and the link's own active state. A crafted `personId`/`attendees` field in a submission is never read, because there is no parameter to read it into. (Entity type is re-checked there because the link kernel enforces endpoint existence but not type.)

The recorded subjects are a **snapshot as at the commit**, and history is never rewritten:

| Situation | Behaviour |
|---|---|
| The meeting has **no attendees** | A valid, truthful `meeting.held` event on the Meeting alone. `attendeeCount: 0`, and the action says so in words. |
| An attendee is **removed before** it is marked held | They did not attend, so they are not a subject. |
| An attendee is **added after** it was marked held | Not retroactively added. The event is a historical fact; the new link still joins the Person's timeline through the ordinary PEOPLE-02 anchor path. |
| A Person is later **archived or soft-deleted** | The subject row stands. Their own history stays readable (the kernel permits a deleted anchor). |
| A Person is soft-deleted **before** it is marked held | Not a live subject; excluded. |
| The Meeting is later **archived or soft-deleted** | The event stands on every attendee's history. Archiving makes the meeting read-only (see below). |
| The **same action is submitted concurrently** | Exactly one submission records; every other reports `already_held` with the ORIGINAL instant and the winner's recorded counts. One event, always. |

**Subject bound, disclosed.** FND-05 bounds one event at 32 subjects, leaving 31 attendees. A larger meeting records the earliest-linked 31 and sets `attendeesTruncated` in the payload. `attendeeCount` is the **true** total (a `COUNT(*) OVER ()` window in the same bounded query, so it never saturates at the cap and 33 attendees is distinguishable from 300), `attendeesRecorded` is how many became subjects, and the success message names the number of timelines **actually reached** plus what was left out — never a silent cap, and never a claim that people received history they did not (AGENTS.md §6).

**A retry reports the ORIGINAL facts.** `already_held` returns the counts recorded on the immutable `meeting.held` event, read back from its payload — not the current attendee links, which may have changed since. Otherwise a retry after an attendee was added or removed would return numbers contradicting the event it is reporting on.

### Failure and concurrency behaviour

The state change and its Activity event are **one atomic, self-guarding write** — a conditional `UPDATE … WHERE workspace_id = ? AND entity_id = ? AND archived_at IS NULL AND held_at IS NULL … RETURNING`, whose `changes()` guards the Activity append in the SAME `D1Database.batch()` (ADR-012, `recordAtomicMutation`). One construct, four guarantees, no lock and no read-then-write:

- **Atomic** — an Activity or subject insert failure rolls the `held_at` write back. A retry is clean.
- **Idempotent / retry-safe** — a repeat changes no row, so nothing is appended and `already_held` is returned with the original facts. There is never a second event.
- **Concurrency-safe** — of N simultaneous submissions exactly one changes a row; the losers append nothing and report the truth.
- **Lifecycle-safe** — `archived_at IS NULL` is re-asserted in SQL, so a meeting archived between the read and the write cannot acquire a held state.

Errors fail closed and disclose nothing: `MeetingNotFoundError` (missing, soft-deleted, wrong type or another workspace — all indistinguishable) → `404`; `MeetingArchivedError` → `409` with the recovery named. Both now live in the kernel beside the contract that throws them, and `~/platform/meetings` re-exports them so MEET-02's importers are unaffected.

### Privacy rules

The `meeting.held` payload carries **structural metadata only** — `source`, the meeting's `startsAt` instant, its `timezone`, `attendeeCount`, `attendeesRecorded` and (when capped) `attendeesTruncated`. Never agenda Markdown, meeting notes, decision text, outcome text, task titles, a Person's contact details or a Person's notes.

That discipline is load-bearing rather than merely tidy: the PEOPLE-02 page shape serialises each event's raw `payload` alongside its presentation — **for every module, not just this one** — so a structural payload is the actual guarantee, and it is asserted as such in the route tests. What is *rendered* is narrower still: the Person timeline labels the event from the FND-06 registry, and a registry-derived descriptor has a label but **no `describe`**, so it emits no payload metadata at all.

### How it reaches the Person timeline

Integration is **one line** in the Meetings manifest's `activityTypes` (`{ type: MEETING_HELD, label: "Meeting held", … }`). That alone gives the event a readable, payload-free line on every attendee's existing Activity tab, filed under **Conversations** (the category function keys on the `meeting.*` event-type domain). The People module gains **no import, no switch case and no Meetings knowledge** — an architectural test asserts exactly that.

`meeting-activity.ts` additionally registers a warmer `describe` for the **Meeting's own** Timeline ("recorded this meeting as held"); the People surface deliberately keeps the label-only rendering.

### The Mark as held action

Placement and behaviour are entirely shared patterns — no new visual language, no redesign of the Meeting record:

- It lives in the DS-12 **Record Header overflow (⋯)**, in the module slot `useRecordLifecycle` already provides (above Archive/Restore, separated by the shared hairline).
- Offered **only where contextually valid**: absent entirely on an archived meeting (read-only).
- **Visibly idempotent**: once held it stays *visible but disabled*, reading `Marked as held` with `Recorded on <date>. A meeting is only recorded as held once.` The Summary tab states the same thing in words (`Recorded as held on …` / `Not recorded as held yet`) — never colour alone.
- Outcome reported through the shared DS-10 feedback platform, truthfully: a repeat submission says *"This meeting was already marked as held"*, not a fresh success.
- No confirmation dialog: the operation is additive, truthful and low-stakes, and friction here would be noise (AGENTS.md §7). Its irreversibility is stated in the item's own description instead.
- Keyboard-complete through the shared menu, 44px targets on coarse pointers, axe-clean in light and dark, no overflow at 390px or 320px.

The pure rules live in [`meeting-held-action.ts`](../../app/modules/meetings/meeting-held-action.ts) (React-free, directly testable); the record composes them.

### One shared DS-05 fix this exposed

`meeting.held` is the first multi-subject cross-module event where the anchor Person is *itself* a subject, which made DS-05's calm label-only line link the reader back to the page they were already on. Fixed **in the shared seam, once**: `selectReferenceSubject` prefers the non-anchor subject, and `ResolvedEntity.href` (resolved through the one shared `entityDestination` helper) makes that reference a real route. The Person timeline previously hand-rolled a Task-only destination, so this also made every other linked record — Notes, Assets, Meetings, Reviews — navigable from a Person's history. See [`ACTIVITY_TIMELINE.md`](ACTIVITY_TIMELINE.md).

### The PEOPLE-03 read seam

**`meeting.held` is the Activity type that qualifies as meaningful Person contact**, and today it is the only one. It qualifies because it is the sole event asserting that *a real interaction with this specific Person occurred*, recorded by an explicit human act rather than derived from a record edit. Everything else on a Person's timeline is record maintenance: `person.updated` is the owner editing a field, `entity_link.created` is a relationship being filed, `meeting.created` is a meeting being *scheduled*, and treating any of them as contact would be dishonest (the exact trap [PEOPLE-03](../roadmap/ROADMAP_V2.md#-people-03--stay-in-touch-signals) names).

The seam PEOPLE-03 reads is therefore the existing kernel call, with **nothing new to build and nothing persisted**:

```ts
scope.activity.listForEntity(personId)   // filter to `meeting.held` → last meaningful contact
```

No shared classification constant is introduced here, because there is no ownership location for one that does not create the coupling this item forbids: a `MEANINGFUL_CONTACT_TYPES` list in People would be a Meetings-specific switch by another name, and one in Meetings would have to be imported by People. When PEOPLE-03 needs more than one qualifying type, the correct mechanism is the FND-06 registry that already carries every module's declarations — each module declaring its own contribution, read without an import. MEET-03 deliberately persists **no `lastContactAt`**, adds no reminder date, computes no overdue state, and adds no badge, streak, guilt language or CRM scoring.

## Product surface

The module contributes Upcoming, Recent and Archived collection views; a fast creation route; a canonical Record Layout with Summary (incl. attendee management), **Follow-up**, Agenda, Notes, Decisions, Outcomes, Linked, Activity and Settings; bounded global search over **upcoming and recent** meetings by title and location (V2.0.1 — the provider previously reused the recent-only collection view, which silently excluded every future meeting; it now uses the dedicated `searchMeetings` repository projection with no time window, archived/deleted still excluded); Open/Create/Search commands and a meeting-aware **New meeting follow-up** ⌘K action (a `navigate` action to the meeting's Follow-up tab with the direct follow-up drawer open). The **Linked** tab is the shared Universal Relationship System Linked Items section (REL-01); the follow-up `task.relates_to` links appear there read-only. Agenda and notes reuse `LiveMarkdownEditor` and the DS-06 autosave coordinator.

ADR-060 adds context-aware capture to the Meeting record overflow. New follow-up
task opens shared Quick Capture with Meeting context and creates a canonical Task
linked back with `task.relates_to`; New linked note and New diary entry create
canonical records linked to the Meeting with `link.related`. Creating a Meeting
from a Person context preselects and persists that Person as `meeting.attendee`;
attendee semantics remain distinct from generic related-record links.

## Lifecycle

- **Archived meeting** — readable; linked Tasks stay accessible and navigable; existing relationships stay visible; **new** conversions are rejected (`MeetingArchivedError`) and creation controls disappear; existing Tasks are never archived or deleted. **Mark as held** is not offered and is refused server-side (`409`); an already-recorded `meeting.held` event stands and stays on every attendee's history.
- **Completed / cancelled Task** — stays mapped and linked, appears under the Completed follow-up band, remains openable.
- **Deleted Task** — the follow-up read resolves through the canonical Task model and drops a deleted Task safely (no broken links, no leaked ids); the item becomes convertible again.
- **Meeting deletion** — follows the existing Meeting lifecycle; it never cascade-deletes canonical Tasks.

## Deliberate deferrals

- **Per-attendee decision / outcome / commitment events.** Not structurally supportable today — `meeting_items` names no Person, and Task delegation is plain text. See [The event model](#the-event-model); it is a schema question, not an effort question.
- **MEET-04:** deeper capture-specific mobile optimisation (MEET-02/MEET-03 inherit the responsive baseline and are verified 320–2560px).
- Calendar synchronisation, invitations, conferencing creation, reminders, recurring series, automated reminders, notifications, AI-generated summaries, autonomous action-item extraction from prose, email ingestion and attachments remain out of scope. No dead settings or placeholder controls for these are added.

---

## Status (2026-07-28 reconciliation)

**Current status.** [MEET-01](../roadmap/ROADMAP_V2.md#-meet-01--meeting-record), [MEET-02](../roadmap/ROADMAP_V2.md#-meet-02--follow-ups--tasks) and [MEET-03](../roadmap/ROADMAP_V2.md#-meet-03--people--history-integration) are ☑. [MEET-04](../roadmap/ROADMAP_V2.md#-meet-04--mobile) is ☐.

**Delivered capabilities.** First-class workspace-scoped Meeting identity with an additive detail slice and ordered decision/outcome/agenda items; Upcoming / Recent / Archived collection views; the canonical shared Record Layout; independent shared Markdown autosave surfaces; a real `meeting.attendee` EntityLink type wired to add/remove attendees; the Follow-up tab converting agenda items, decisions and outcomes into **canonical DalyHub Tasks** through `scope.tasks.createTask` (no second Task model), with stable structured identity (`meeting_items`, migration `0015`); **MEET-03's `meeting.held` interaction event** — a durable write-once `held_at` state (migration `0020`), an explicit *Mark as held* action in the shared overflow, server-derived attendee subjects, and one atomic, idempotent, concurrency-safe write that puts the meeting on every attendee's existing Person Activity timeline ([People history](#people-history-meet-03)); structural Activity throughout; a **real, repository-backed** search provider and three commands; and a reversible archive lifecycle.

**Known limitations.**

- **A meeting's substance is still not scoped to individual attendees.** `meeting.held` truthfully answers *"did we meet, and who was there"*, but not *"which decision concerned them, and what did they commit to"*. That is a schema limitation, not a deferred effort: `meeting_items` carries no Person reference and a follow-up Task's delegation is plain text, so no honest per-Person assignment exists to record. Closing it needs a structural way to name a Person on an item — never text inference ([The event model](#the-event-model)).
- **Marking a meeting as held is manual, and one-way.** There is no reliable automatic occurrence signal to derive it from, and Activity is append-only, so there is no "un-mark". Both are deliberate ([Held-state authority](#held-state-authority-meet-03)).
- **A meeting with more than 31 attendees records a disclosed subset.** The FND-05 32-subject bound leaves 31 attendee subjects; the payload and the action's result both say so.
- **A sub-millisecond snapshot window.** Attendees are read immediately before the commit, and that read is not inside the commit's transaction. So an attendee added inside that window may miss the snapshot, and — the converse — an attendee removed inside it can still be written into the permanent history. Closing it would mean deriving the subjects in SQL inside the batch, bypassing the shared `D1ActivityRecorder` seam (and the payload counts still could not be computed there), so it is accepted and disclosed rather than hidden — the same class of documented residual as MEET-02's conversion window. The held state itself is still exactly-once regardless.
- **The collection forks the shared Card.** `MeetingsCollection.tsx` renders a hand-rolled `dh-meeting-card` anchor rather than the DS-04 Card, so it does not inherit selection, quick actions, density or swipe behaviour — [DEBT-01](../product/PRODUCT_DEBT.md#-debt-01--duplicate-card-implementations-per-module--p2).
- Mobile coverage is partial: the follow-up surface and the MEET-03 held action each have axe (light and dark), 390/320px overflow and touch-target assertions, and `/meetings` is in the accessibility sweep, but the collection and record have no dedicated mobile journey ([MEET-04](../roadmap/ROADMAP_V2.md#-meet-04--mobile)).

**Corrected 2026-07-27 — the follow-up journey's E2E failure was never a Meetings defect.** `e2e/meetings-follow-up.spec.ts` failed consistently in CI, timing out looking for the record's Agenda or Settings tab, and [DEBT-41](../product/PRODUCT_DEBT.md#-debt-41--the-e2e-suite-is-unreliable-on-main-so-ci-is-green-claims-are-unverifiable--p1--resolved-2026-08-02) flagged it as the likeliest genuine product or fixture defect. The page snapshot from a local reproduction showed the browser sitting on **`/new/meeting`** — it had navigated back off the record entirely. The cause is in the shared DS-03 Drawer: closing a provider-opened level is `navigate(-1)`, a history pop that does not land synchronously, and the spec's `closeDrawer` helper pressed Escape again after a fixed 120ms if a dialog was still present. A second Escape inside that window read the same stale stack and popped a *second* time, past the meeting record. Fixed in the shared provider (close is now idempotent per history entry, so a repeated Escape can never over-pop) plus the helper, which now waits on one-fewer-dialog rather than a fixed delay. The Agenda and Settings tabs were correct throughout; no Meetings code changed.

**Deferred work.** Per-attendee decision/outcome semantics (blocked on the item model, not on effort); mobile completion (especially capture **during** a meeting on a phone); calendar sync and invitations; calendar sync. AI-proposed tasks and notes from meeting content are now **delivered** ([AI-02](../roadmap/ROADMAP_V2_1.md), which layers a review step over the existing MEET-02 conversion authority rather than replacing it — see [Accepting a proposal](#accepting-a-proposal-ai-02-2026-08-05)).

**Relevant roadmap items.** [MEET-01](../roadmap/ROADMAP_V2.md#-meet-01--meeting-record) ☑ · [MEET-02](../roadmap/ROADMAP_V2.md#-meet-02--follow-ups--tasks) ☑ · [MEET-03](../roadmap/ROADMAP_V2.md#-meet-03--people--history-integration) ☑ · [MEET-04](../roadmap/ROADMAP_V2.md#-meet-04--mobile) ☐ (now unblocked — there is real attendee history to capture against) · [PEOPLE-02](../roadmap/ROADMAP_V2.md#-people-02--relationship-timeline) ☑ · [PEOPLE-03](../roadmap/ROADMAP_V2.md#-people-03--stay-in-touch-signals) ☐ (now unblocked — see [the read seam](#the-people-03-read-seam)) · [AI-02](../roadmap/ROADMAP_V2_1.md) ☑ (2026-08-05).

**Relevant product-debt items.** [DEBT-01](../product/PRODUCT_DEBT.md#-debt-01--duplicate-card-implementations-per-module--p2) · [DEBT-07](../product/PRODUCT_DEBT.md#-debt-07--fragmented-activityhistory--p2).

---

## The consistency pass (DS-12 / PX-04 / PX-05 / PX-06, 2026-07-28)

**Lifecycle in the shared overflow, and the Settings tab is no longer bespoke.** Archiving was
an inline `<button>` inside a hand-rolled `<section>` in the record body. It now sits in the
Record Header overflow (⋯) with the derived wording `Archive Meeting`/`Restore Meeting`, and the
Settings tab is composed from the shared DS-10b `SettingsLayout`/`SettingsGroup`/`SettingsRow`
like every other record's. Meeting sections also adopted the shared `.dh-record-section`
rhythm.

See [`DESIGN_SYSTEM.md → Shared overflow menu`](../design/DESIGN_SYSTEM.md#shared-overflow-menu-ds-12),
[`→ Shared record lifecycle`](../design/DESIGN_SYSTEM.md#shared-record-lifecycle-px-04) and
[ADR-053](../decisions/ARCHITECTURE_DECISIONS.md#adr-053-the-shared-overflow-menu-and-one-record-lifecycle-vocabulary).

## UX-01 workflow consolidation (2026-07-28)

Meeting creation now uses the shared DS-06 form system and defaults to Title,
Start date/time and Attendees, with end time, location, mode and meeting link
behind `More details`. Native `datetime-local` values are interpreted in the
owner/workspace application timezone and stored as UTC instants; the browser's
local timezone is not trusted. The same conversion is used by the Meeting details
editor, and invalid DST gap times fail validation instead of being silently
normalised.

The Meeting record now has five top-level tabs: Overview, Meeting, Follow-up,
Activity and Settings. Legacy deep links for `?tab=agenda`, `?tab=notes`,
`?tab=decisions` and `?tab=outcomes` resolve to the new Meeting workspace. That
workspace combines the Agenda and Notes autosave editors with structured Agenda
items, Decisions, Outcomes and explicit **Action items**. Action items are the only
structured Meeting item kind treated as unconverted follow-up work by default;
Agenda items, Decisions and Outcomes still expose contextual Create task actions
without implying every one must become a Task.

Follow-up Task creation remains canonical: it creates Tasks through the Tasks
authority, keeps the source-item mapping and `task.relates_to` EntityLink, then
opens the shared Task Drawer. The default follow-up form is short by default
(title, parent, due date, priority), with status, scheduled date, time sector and
commitment under `More details`.

The collection now composes `CollectionLayout` and DS-04 Cards, supports Upcoming,
Recent and Archived views, bounded text search, start/updated/title sorting and
cursor-backed Load more pagination. Attendees are added through a bounded
workspace-scoped server search over active People rather than an initial fixed
select.

## Phone workspace (MOBILE-01)

### The capture bar

A meeting is the one workflow where the phone is genuinely in use while the thing
being recorded is happening. Capturing a decision previously meant scrolling to
the right section, finding its add field, typing, submitting and scrolling back —
several times a meeting, while trying to listen.

While the **Meeting tab** is open, a sticky bar pins one row to the bottom of the
workspace:

> Note · Action · Decision · Outcome

Choosing a type focuses a single input; submitting saves and leaves the user
exactly where they were, with the input cleared and still focused. No drawer
opens, no tab changes, nothing nests.

Every write uses the canonical authority — there is no capture-only path:

| Type | Authority |
| --- | --- |
| Action / Decision / Outcome | `intent=add_item` with the item's kind — the same structured-item authority the section's own add field uses |
| Note | Appended to the meeting's canonical `notesMarkdown` through the same `intent=update` the Notes editor autosaves through — one field, one Markdown source, one Activity trail |

A note is **appended**, never overwritten, so a capture during a meeting can never
destroy notes already written. A failed capture keeps the text on screen. Saves
and failures are announced through a live region.

A captured **note** is written to the canonical field, but an editor that is
already open does not show it until the record is loaded again: the autosave field
owns its draft and does not adopt server changes underneath a writer. That is
[DEBT-47](../product/PRODUCT_DEBT.md#-debt-47--an-open-autosave-editor-does-not-adopt-a-server-side-change-to-its-field--p2),
recorded rather than patched, because adopting external values safely is a change
to the shared DS-06 autosave contract.

**Focus across a save is part of the contract, not polish.** The field is disabled
while a save is in flight, and a browser blurs a disabled element — so it is
refocused from an effect that runs *after* React re-enables it. Refocusing inside
the submit handler looks correct and does nothing at all, because `focus()` on a
disabled element is dropped silently; the symptom is the phone keyboard closing
after every captured item, which is exactly the flow the bar exists to provide.
The failure path refocuses too, so a rejected capture can be corrected and retried
without re-tapping the field.

`agenda` is deliberately absent from the bar: an agenda is written *before* a
meeting, not captured during one.

The bar clears the phone keyboard (`--dh-keyboard-inset`) and the bottom
navigation (`--dh-bottomnav-height`) using tokens, so it measures nothing, and it
is hidden entirely for an archived (read-only) meeting.

### Workspace order

The Meeting tab now renders Agenda items, then **Actions**, then Decisions and
Outcomes — the order a meeting actually runs, rather than alphabetical-by-accident.

### Joining an online meeting

The meeting link was previously reachable only by opening the record and finding
the Overview tab — thirty seconds before a call, on a phone, that is too slow. A
**Join** quick action now appears on the Meeting card itself, for meetings that
have a link and are still upcoming (planned, not held, not archived). A "Join"
button on last month's meeting is noise, so it is omitted rather than disabled.

Cards lead with **when** the meeting is; location/mode become supporting metadata
(`priority: "low"`), de-emphasised on a narrow card but never hidden.

### Follow-up on a phone

UX-01 already reduced follow-up creation to title, resolved parent, due date and
priority with everything else behind "More details". MOBILE-01 adds only that the
form's commitment row is **sticky**, so "Create task" stays above the phone
keyboard in the full-screen Drawer rather than at the end of a scroll. Meeting
linkage, source-item mapping and the return path are unchanged.

---

## UX-01 — the collection paginates in place (2026-08-01)

``/meetings`` was one of the two collections that paginated by **navigating** to the
next page: the list was replaced, the owner's scroll position was discarded, and
the control was *labelled* "Load more", which is not what it did. It now uses the ONE shared
[`useKeysetPagination`](../../app/shared/load-more/useKeysetPagination.ts) and the
shared `LoadMore` button, exactly like Areas, Goals, Notes, Projects, People and
Assets — so all eight collections behave identically, and the request-scoped guard
that closes [DEBT-45](../product/PRODUCT_DEBT.md) applies here too.

The path a later page is requested from carries the CURRENT view and filters
(minus any cursor), so "Load more" resumes the same result set the cursor was
issued for rather than the unfiltered default.


## Extract actions and decisions (AI-01, 2026-08-05)

A Meeting record has an **AI** tab carrying one explicit action: *Extract actions
and decisions*. It sends the Meeting's agenda, notes and structured items plus the
titles of records explicitly linked to it — never unrelated Person notes, all
Diary content or historical Meetings — and returns a reviewable proposal:
a summary, decisions, proposed Tasks, unresolved questions and suggested links.

Nothing is created by running it. Every proposed Task starts **unselected**, every
field is editable, individual items can be removed, and the whole proposal can be
rejected. A suggested Project or Person must come from an allowlist DalyHub
supplied; an invented id is rejected by the validator, not quietly dropped. A date
the model *worked out* rather than read is not pre-filled — DalyHub owns date
validation, and an inferred date must be confirmed before it is stored.

Full contract: [`AI_PLATFORM.md`](AI_PLATFORM.md).

## Accepting a proposal (AI-02, 2026-08-05)

AI-01 created an accepted Task through `tasks.createTask` directly. The Task was
correct in every other respect, but no `meeting_item_tasks` mapping was written,
so the Follow-up tab under-reported AI-originated follow-up work. That was
[DEBT-90](../product/PRODUCT_DEBT.md), and it is fixed here.

### An accepted Task is a canonical conversion

When the owner accepts a proposed Task from a Meeting, the acceptance path
re-reads the Meeting (refusing one archived or deleted since the proposal was
generated) and then goes through MEET-02's authority via
`convertMeetingProposalToTask`:

1. **Create or reuse the action item.** An AI proposal has no `meeting_items` row
   behind it — DalyHub read the Meeting as *evidence* and the model wrote a
   title. So the authority either **reuses** an existing `action` item whose body
   is exactly the approved text (the owner had already written the action down;
   converting the item they have is right, and a second identical one would be
   wrong), or **creates** one through the ordinary `addItem` contract, so the
   Meeting durably records the action exactly as a hand-typed one would.
2. **Convert it** through `convertMeetingItemToTask` — unchanged. The mapping row
   and its structural `meeting.item_converted_to_task` Activity are written in
   the one batch that is MEET-02's commit point, and the navigable
   `task.relates_to` link is asserted.

The Task therefore appears in the **Follow-up tab as converted**, and the item
offers *Open task* rather than *Create task*.

The owner's reviewed values are what is converted: title, description, due date,
scheduled date and the chosen Project — or **Inbox**, which AI-02 widened
`FollowUpTaskFields` to permit (TASKS-04 allows a parentless Task; the MEET-02
follow-up FORM still requires a parent and always submits one).

### Idempotency, through the constraints rather than around them

Reuse is what makes acceptance idempotent: a replayed acceptance finds the item
the first one created, `convertMeetingItemToTask` finds its live mapping, and the
SAME Task comes back with `created: false`. **No uniqueness error is caught and
ignored anywhere on this path** — the `meeting_item_tasks` partial unique index
and MEET-02's own conversion rules remain the authority. Two proposals whose
approved text differs are two different actions; DalyHub does not fuzzy-match the
owner's words.

**And an existing conversion is checked before it is called a success.** Keying
reuse on the approved text is what keeps a Meeting from accumulating duplicate
action items, but it means two accepted proposals sharing a title — or a title
matching an item converted weeks ago — resolve to the same already-converted
Task, which MEET-02 correctly returns *unchanged*. So the acceptance compares the
existing Task's title, dates, parent and description against the reviewed values.
Identical → a truthful idempotent success. Different → the item is reported as
**not applied**, naming the existing Task, because:

- calling it a success would tell the owner their reviewed dates or Project are
  in DalyHub when they were discarded — the exact class of lie this release
  exists to remove;
- silently overwriting the existing Task would be worse. It is a canonical Task
  the owner may have edited since, and an acceptance is not a licence to rewrite
  one.

### Proposed Notes

Meeting extraction may also propose **Notes** — a durable summary, a decision
record, an open-questions note. They begin unselected and are never saved as a
side-effect of accepting a Task or a link. An accepted one becomes an ordinary
Note created through the canonical entity + note-details repositories and linked
to the Meeting by the ordinary `link.related` relationship the capture path
already uses for "a Note created from this Meeting"
([`NOTES_MODULE.md`](NOTES_MODULE.md)).

The **owner** is the actor on every event, and an accepted proposal produces
exactly the events the same action taken by hand would produce. There is no
"AI created this" event and AI is never an Activity actor
([`ACTIVITY_TIMELINE.md`](ACTIVITY_TIMELINE.md)).

---

## EDIT-02 — editing moved onto the shared inline system (August 2026)

A Meeting's title is edited on the record heading through the shared
`InlineTextField`, posting `intent=update` with **only** the `title` key (the
mutate action has always copied just the keys present in the submission). It was
also removed from the "Edit details" disclosure form, which fixed a live defect:
that form submitted the title it captured when it mounted, so pressing **Save
details** silently reverted a rename made anywhere else since the page loaded.
Scheduling, attendees, items and the follow-up workflow are untouched.

The full classification of every editable field in the product, and the reasons
for what was **not** moved, is in
[`EDITING_CONSISTENCY_AUDIT_2026_08.md`](../product/EDITING_CONSISTENCY_AUDIT_2026_08.md).
Passages above that describe a `Rename` action, an `Edit details` panel or a
per-module long-form control describe the surface as it was before that change;
the mutation contracts they document are unchanged.
