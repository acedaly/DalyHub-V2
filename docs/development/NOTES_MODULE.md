# NOTES_MODULE.md — The Notes module (NOTES-01B/NOTES-01C)

The real **Notes** UI: a collection with an Active/Deleted lifecycle filter,
a trusted title-only creation flow, and a canonical Markdown record — with
dependable autosave and a desktop Source/Split/Preview layout — composed
**entirely** from the shared design system and the NOTES-01A persistence
foundation — no second Notes identity model, no second Markdown pipeline, no
second lifecycle model, no bespoke UI primitives, and no unsafe client-only
persistence path. Replaces the PX-03 `ModuleComingSoon` placeholder at
`/notes`.

NOTES-01B needed no new ADR (a direct application of already-accepted
patterns). NOTES-01C added [ADR-042](../decisions/ARCHITECTURE_DECISIONS.md#adr-042--notes-autosave-adaptation-and-the-first-generic-record-lifecycle-soft-deleterestore-ui-pattern),
recording how the existing DS-06 autosave coordinator was adapted for a
full document and how Notes became the first module to build a generic
(non-Project-specific) soft-delete/restore UI on the kernel's existing
`EntityRepository.softDelete`/`.restore` — see that ADR for the full design
record; this document stays the "how it works" reference.

## Data ownership

Notes are first-class DalyHub entities but are **not** part of the Area →
Goal → Project → Task spine (AGENTS.md §4). Neither NOTES-01B nor NOTES-01C
added persistence — this module is a pure UI slice over the NOTES-01A
foundation and the kernel's existing generic lifecycle:

| Concern | Authority |
| --- | --- |
| Identity, `id`, workspace, title, lifecycle (create/rename/**soft-delete/restore**) | The generic `EntityRepository` (`app/kernel/entities`) — `entities.type = 'note'` |
| Markdown content (the Note's body) | `NoteDetailsRepository` (`app/kernel/notes`) — `note_details` table |
| Rendered HTML preview | Nobody — always derived on demand by the shared FND-08 renderer, never persisted |
| Event history | The shared Activity stream (`activity.listForEntity`) |

`entities.softDelete`/`.restore` (FND-02) already existed before NOTES-01C;
Notes is simply their first product UI caller (see
[Lifecycle: delete and restore](#lifecycle-delete-and-restore)). Backlinks,
tags, folders, Areas filtering and full-text search remain out of scope (see
[Deferrals](#deferrals)).

## Routes

Registry-discovered (`app/modules/notes/routes.manifest.ts`), composed by the
shell:

| Route | Kind | Responsibility |
| --- | --- | --- |
| `GET /notes` | page | The Notes collection. `?state=active` (default) lists live Notes; `?state=deleted` lists only soft-deleted ones. Bounded cursor pagination either way. Replaces the PX-03 placeholder. |
| `POST /notes/new` | resource | Create a Note via `entities.create({ type: "note", title })`. Title only. |
| `GET /notes/:noteId` | page | Canonical Note record: the "Note" tab (Markdown source editor + Source/Split/Preview) and the "Activity" tab. **404s for a soft-deleted Note** — see [Lifecycle](#lifecycle-delete-and-restore). |
| `POST /notes/:noteId/mutate` | resource | `rename` / `update_content` (verified ACTIVE-Note anchor) and `delete` / `restore` (verified anchor regardless of lifecycle state — see below). |
| `GET /notes/:noteId/activity` | resource | One bounded DS-05 Timeline page over `activity.listForEntity(noteId)`. |

The static `/notes/new` segment is registered before `/notes/:noteId`.
`rename`/`update_content` verify an ACTIVE-Note anchor
(`entities.getById(id)`, excluding deleted); `delete`/`restore` verify the
anchor with `entities.getById(id, { includeDeleted: true })`, since restore
must be able to find an already-deleted Note and a repeated delete/restore
must stay the idempotent no-op the repository already guarantees — these are
deliberately two DIFFERENT anchor checks on the same route (see ADR-042 §2).
Missing, wrong-type and cross-workspace Note ids fail closed with the same
calm not-found outcome at every route and every intent. Every route resolves
the trusted workspace and actor server-side via
`resolveAuthenticatedWorkspaceScope`; no client-supplied workspace or actor is
ever accepted.

## Notes collection

`app/modules/notes/NotesCollection.tsx` composes the shared PX-02
`CollectionLayout` + DS-04 `Card`/`CardCollection`, mirroring
`~/modules/projects/ProjectsCollection.tsx`:

- a Pane Header with the Notes entity identity;
- an honest "N notes loaded" / "N notes" subtitle (or "N deleted notes" on
  the Deleted view) — never claims a total while a bounded page remains,
  matching every other DalyHub collection;
- an **Active/Deleted** `SegmentedFilter` (`~/shared/segmented-filter`,
  promoted from Projects' PROJ-01-local component in NOTES-01C — the
  identical `?state=` URL-param pattern, now used by two modules) driving
  `entities.list({ type: "note", deletedOnly })`;
- a "New note" primary action opening the shared DS-03 Drawer — hidden on
  the Deleted view, matching Projects' archived-view convention;
- loading (the default `CollectionLayout` skeleton), the genuine empty
  state ("No notes yet", Active only), a filtered-empty state ("No deleted
  notes", Deleted only), and an error state;
- a keyset "Load more" affordance (`LoadMore`) that accumulates pages without
  navigating, de-duplicating overlapping boundaries, and resets whenever
  EITHER the cursor scope OR the Active/Deleted state changes (they are
  different bound cursor scopes — see [Lifecycle](#lifecycle-delete-and-restore));
- deterministic ordering, inherited unchanged from
  `EntityRepository.list`'s `(createdAt, id)` order;
- an ACTIVE Note's Card links to the canonical `/notes/:noteId` record via
  both `href` (a real, shareable link) and `onOpen` (SPA navigation) — never
  an inaccessible clickable container. A DELETED Note's Card has **no open
  target at all** (its canonical route 404s) — just a static title and a
  "Restore" quick action.

## Note creation

`app/modules/notes/NewNoteForm.tsx`, hosted in the shared DS-03 Drawer,
mirrors `RenameGoalForm.tsx`'s single-field shape (there is no parent to
choose, unlike `NewProjectForm.tsx`). **Title only** — matching
`NewAreaForm`/`NewProjectForm`/`NewTaskForm`/`NewGoalForm`'s established
precedent. `POST /notes/new` creates through the generic
`EntityRepository.create({ type: "note", title })`; NOTES-01A already
established that **no `note_details` row is written to represent an empty
body**, so creation never touches `noteDetails`. On success the Drawer's
`onCreated` callback navigates directly to the new Note's canonical record —
that navigation itself replaces the `?drawer=new-note` URL, so no separate
`closeDrawer()` call races it (mirrors `NewProjectFormHost` exactly).
Duplicate-submit prevention and server-authoritative validation errors are
`useForm`'s standard explicit-save guarantees — no bespoke creation logic.

## Canonical Note record

`/notes/:noteId`, composed through the shared DS-02 `RecordLayout` as a
**full page**, not a Drawer — DESIGN_SYSTEM.md flags long-form Note editing
as the exception that warrants the full Record Layout surface, matching how
`/goals/:goalId` and `/projects/:projectId` already host their canonical
records. The Drawer here hosts only the "Rename" form.

- **Header** — generic entity identity: title, "Note" type label and icon, a
  breadcrumb back to `/notes` (the current record is the last, unclickable
  breadcrumb item per the shared `RecordHeader` contract — the same behaviour
  `AreaOverview.tsx`'s single-item breadcrumb already exhibits), a Rename
  action, and (NOTES-01C) a **Delete note** action. No bespoke Notes-only
  header.
- **Summary** — Created/Updated dates only; no derived progress or status (a
  Note has no workflow state).
- **"Note" tab** — `NoteContentForm.tsx`: the Markdown source editor (see
  below).
- **"Activity" tab** — the shared DS-05 Timeline over `activity.listForEntity`,
  reloading on the Note's *effective* `updatedAt` (see
  [Activity](#activity) below).

Exactly two tabs — no empty "Links"/"Settings" tab reserved for a future
capability (DESIGN_SYSTEM.md: never ship an empty tab for later).

## Editor and preview

`app/modules/notes/NoteContentForm.tsx` uses the **existing** DS-06
`MarkdownField` control for the textarea itself, unchanged in its core
behaviour — it edits and preserves the Markdown source byte-for-byte (never
trims, never rewrites, never normalises line endings; supports empty and
whitespace-only content). NOTES-01C added one small, additive prop,
`hidePreviewToggle`, so `MarkdownField`'s own built-in "Show preview"
disclosure can be suppressed when a caller (this module) renders its own
preview surface for the same value — the preview still renders through the
**one** shared FND-08 pipeline (`renderMarkdownSource` → `<MarkdownContent>`),
just composed at a different layer. No new editor dependency, no second
parser, no second sanitiser, no second `dangerouslySetInnerHTML` sink — the
sanctioned one stays inside `MarkdownContent`.

**Save model — autosave (NOTES-01C), not explicit Save.** `NoteContentForm`
calls the **existing** DS-06 `useAutosaveField<string>` hook — the SAME pure
coordinator (`~/shared/forms/autosave.ts`) every other autosaving field
uses, with no new state machine. Two Notes-specific tunings, layered on top
of the shared hook rather than inside it:

- **`NOTE_AUTOSAVE_DEBOUNCE_MS = 1500`** — longer than DS-06's 800ms
  short-field default, so continuous typing on a long document coalesces
  into one save per pause rather than one per near-keystroke pause. A valid
  blur still saves immediately, same as any other DS-06 autosave field.
- **`validateNoteContentSize`** (`note-content-validation.ts`) as the
  hook's `validate` — a pure re-use of FND-08's `markdownSourceByteLength`/
  `MARKDOWN_SOURCE_MAX_BYTES` (no second limit). An oversized document is
  refused **before a save is even attempted**, with an immediate inline
  field error, rather than always waiting on a round trip to learn the same
  thing from the server's authoritative `parseMarkdownSource` boundary,
  which remains the real limit and the last word.

The autosave coordinator's existing guarantees — proven by its own test
suite (`test/unit/forms/autosave.test.ts`) and exercised here at
document scale — cover the correctness surface directly: only one save ever
in flight; a rapid edit made WHILE a save is in flight coalesces to the
LATEST value and is saved next, never lost; a stale/late response can never
overwrite newer local state; a failed save preserves the draft and offers
Retry, never auto-discarding; no save is attempted while invalid (the size
check above). `onSave` posts the identical `intent=update_content` to
`POST /notes/:noteId/mutate` this module has always used — autosave changed
WHEN a save fires, never the persistence path itself.

**Save-state UX.** `SaveStatusIndicator` (DS-06) presents `unsaved`,
`saving`, `saved` and `error` directly from the hook's own `status` — no
local flag-juggling. A save failure additionally distinguishes an honestly
**detected offline** condition (`use-online-status.ts`, wrapping
`navigator.onLine`/`online`/`offline`) from a generic failure, and
auto-retries the moment connectivity returns — the user should not have to
notice and click Retry for something the browser already told the app.
Validation failures (oversized content) surface as `MarkdownField`'s own
field error, distinct from a save-attempt failure. No toast fires for a
routine autosave — the inline indicator is the whole signal, quiet unless
attention is needed.

**Navigation guard.** `UnsavedChangesGuard` now arms while the latest edit
is **not yet safely persisted** — `status` is `unsaved`, `saving` or
`error` — and disarms the instant it is (`saved`/`idle`), rather than the
old explicit-form `isDirty` flag. It never blocks a navigation the record's
own Delete action triggers: `useDeleteNote` sets a `suppressGuard` flag via
a synchronous `flushSync` immediately before navigating away, so a Note the
user just deliberately deleted is never met with "leave with unsaved
changes?" (React state updates are otherwise batched, which would let the
navigation run against the PREVIOUS render's still-armed guard). The guard
never traps the user indefinitely — Leave is always offered.

**Desktop Source/Split/Preview.** A pure view-mode model
(`note-editor-view-mode.ts`) decides what is offered and selected: Split is
available ONLY on a wide viewport (`useIsWideViewport`, the DS-01 `md`
breakpoint, mirroring the Inspector's own compact-viewport threshold) — it
is OMITTED, not merely disabled, below it, and a desired Split selection
degrades to Source (never Preview) the moment the viewport narrows. Source
and Preview are always available and render the SAME control/pipeline
described above; a single-pane mode gets a comfortable, centred writing
measure, while Split uses the extra width for two real columns. The
selected mode is never colour-only — a checkmark glyph and a distinct
background/text-colour pairing both mark it, and `aria-pressed` carries the
state to assistive technology.

A static help line cites the shared `MARKDOWN_SOURCE_MAX_BYTES` limit (1 MiB)
rather than a live byte counter — `MarkdownField` has no counter prop, and
this slice does not add one.

## Note mutations

`POST /notes/:noteId/mutate` intents:

- `rename` → `entities.update(noteId, { title })` (title stays owned by the
  generic entity kernel — Notes are not a spine type, so this is
  `EntityRepository.update`, not `SpineRepository.rename`). Verified
  ACTIVE-Note anchor.
- `update_content` → `noteDetails.update(noteId, content)`, atomic with its
  own `note.content_updated` Activity event. The Activity payload is
  `{ empty: boolean }` only — never the Markdown text, which may be private.
  Verified ACTIVE-Note anchor.
- `delete` (NOTES-01C) → `entities.softDelete(noteId)`. Verified anchor
  with `includeDeleted: true` (idempotent — a repeat call is a calm no-op).
- `restore` (NOTES-01C) → `entities.restore(noteId)`. Same
  `includeDeleted: true` anchor (must be able to find an already-deleted
  Note); also idempotent.

An unknown intent gets a typed `400`. Mutation outcomes are typed
discriminated unions (`NoteMutationResult`); success revalidates the record
loader — no hard reload.

## Lifecycle: delete and restore

NOTES-01C's first lifecycle actions are built entirely on the
**already-existing** generic `EntityRepository.softDelete`/`.restore`
(FND-02) — Notes is simply their first product UI caller (Projects'
"archive" is a *different*, Project-specific mechanism —
`ProjectSettingsRepository`/`project_details.archived_at` — not this generic
lifecycle; see ADR-042 for the full reasoning). No second Notes-specific
deletion column, no second lifecycle model.

- **Delete** is a single Record Header action, immediately performing the
  real mutation (through the same trusted route as everything else — never
  an optimistic-only client state), then navigating to `/notes` and raising
  a DS-10 `notifyUndo` toast (`"<title>" deleted`, an "Undo" action). There
  is **no `ConfirmationDialog`** — soft-delete is fully reversible with no
  blocking precondition (unlike Projects' archive, which can be genuinely
  blocked by unfinished tasks), and DS-10's documented preference is Undo
  over a confirm dialog for exactly this shape of action (AGENTS.md §7).
  Choosing Undo posts the mirror `restore` intent.
- **The Deleted collection view** (`/notes?state=deleted`) is the durable,
  always-available second path back, for whenever the Undo toast is missed,
  dismissed, or its window expires — see [Notes collection](#notes-collection).
  Each row offers a one-click **Restore** (no confirmation step — the user
  came here specifically to take this action), raising a plain success
  toast.
- **A deleted Note's canonical route (`/notes/:noteId`) stays a plain
  404** — soft-deleted entities already read as "not found" everywhere in
  the kernel (`getById` excludes them by default), and Notes does not
  special-case this. It is never rendered as a read-only "this note was
  deleted" page; Restore is reachable only from the Deleted collection view
  or the Undo toast.
- **`deletedOnly` on `EntityRepository.list`** (a new, additive option — see
  `entity.ts`/`entity-repository.ts`) is what makes the Deleted collection a
  genuinely bounded, cursor-paginated listing rather than a client-side
  filter over the existing `includeDeleted` flag (which means "active +
  deleted", not "deleted only", and would silently break pagination
  bounds). It has its own bound `CursorScope` field — a cursor from one mode
  (active/deleted) is rejected under the other, mirroring exactly how
  `includeDeleted` was already bound (the cursor format version was bumped
  2 → 3 for this).
- Links and Note body data are untouched by soft-delete/restore — they are
  columns/rows on `entities`/`note_details` keyed by the same `id`, so a
  restored Note's content is exactly what it was.
- Activity reuses the kernel-reserved `entity.deleted`/`entity.restored`
  descriptors already emitted by the repository — no new `note.deleted`
  event was registered.

## Activity

`app/modules/notes/note-activity.ts` registers exactly one descriptor —
`note.content_updated` → "Updated note content" — layered over the seven
kernel-reserved lifecycle defaults (`entity.created`, `entity.updated`, …),
mirroring `~/modules/goals/goal-activity.ts`'s pattern exactly. Note creation
and rename already render through the kernel defaults with no Notes-specific
work. Any unregistered type falls through to the shared safe generic
fallback — no Notes-only switch statement, no duplicated registry, no raw
payload rendering.

`NoteDetailsRepository` deliberately does not compute a combined "last
updated" moment (see `NOTES_PERSISTENCE.md`'s content-timestamp contract) —
`effectiveNoteUpdatedAt` (`app/modules/notes/note-view.ts`) is the one small,
pure UI-owned combination: the later of the entity's own `updatedAt` (title
changes) and `noteDetails.contentUpdatedAt` (content changes). The record
route passes this as the Activity tab's `reloadKey`, so either a rename or a
content save revalidates the Timeline in place with the new event visible
immediately — no tab switch, no page reload (mirrors ADR-037 §37.2's Project
Activity reload-key pattern).

## Accessibility and responsive behaviour

Inherits DS-11 almost entirely from shared, already-audited primitives:
`CollectionLayout`, `Card`, `RecordLayout`, `Drawer`/`UnsavedChangesGuard`
(the one focus trap), `~/shared/segmented-filter`, and DS-06
forms/`MarkdownField`/`SaveStatusIndicator`. The new NOTES-01C surfaces
(the Active/Deleted filter, the deleted Note's Restore quick action, the
Source/Split/Preview toolbar) follow the same conventions: real links/buttons
with visible+accessible names, `aria-pressed` on the view-mode toggle, and
44px touch targets on every new control (`--dh-touch-target-min`, proven by
a dedicated `e2e/touch-targets.spec.ts` block). The collection (both states),
create Drawer, canonical record, tabs, editor (all three view modes), rename
Drawer, Delete's Undo flow and Activity Timeline are keyboard-operable,
correctly labelled, focus-restoring on Drawer close, axe-clean in light and
dark, and free of horizontal overflow from 320px through ultra-wide — proven
end to end by `e2e/notes.spec.ts` and the shared `e2e/accessibility.spec.ts` /
`e2e/responsive.spec.ts` sweeps (both include `/notes` and
`/notes?state=deleted`). Save state is never colour-only — every
`SaveStatusIndicator` state pairs an icon glyph with words, and the status
live region is polite (never steals focus); the editor's selected view mode
pairs a checkmark glyph with a background/text-colour pairing, never colour
alone.

## Testing

- **Unit / pure** (`test/unit/notes`): `note-view.test.ts`
  (`effectiveNoteUpdatedAt`'s three timestamp-ordering cases),
  `note-activity-descriptors.test.ts` (the one Note-owned descriptor, the
  kernel lifecycle defaults, the safe fallback for unknown types, no raw
  payload text), `note-content-validation.test.ts` (the size check at/over
  the limit, UTF-8 byte counting for multi-byte characters), and
  `note-editor-view-mode.test.ts` (Split offered only when wide, Split
  degrades to Source — never Preview — when narrow). The autosave
  coordinator's own correctness (coalescing, staleness, retry, no-save-
  while-invalid) is covered once, generically, by
  `test/unit/forms/autosave.test.ts` — Notes does not re-prove it.
- **Component** (`test/unit/notes`): `NotesCollection.test.tsx` (card
  rendering, honest subtitle, empty/error states, keyset "Load more" without
  duplicates, the Active/Deleted `SegmentedFilter`, a deleted Note's
  static-title-plus-Restore card, a successful and a failed Restore),
  `create-forms.test.tsx` (`NewNoteForm` required-title validation,
  duplicate-submit prevention, server-error surfacing, the success path),
  `NoteContentForm.test.tsx` (autosave after the debounce, immediate save on
  blur, exact whitespace/CRLF source preservation, **a rapid edit made
  while a save is in flight coalescing to the latest value and saving
  next**, a failed save preserving the draft with Retry recovering, offline
  detection and auto-retry on reconnect, oversized content refused
  client-side with no fetch call, the navigation guard armed/disarmed
  states including `suppressGuard`, and the Source/Split/Preview view
  modes including Split's absence on a narrow viewport),
  `NoteOverview.test.tsx` (generic entity identity, the Rename and Delete
  actions, the exact two-tab structure, tab switching, and Delete's
  Undo-toast → restore flow including a failure path).
- **Workers/D1 integration** (`test/kernel/notes-route.test.ts`, mirrors
  `goals-route.test.ts`): create via `/notes/new`; canonical record read;
  listing only active Notes in the bound workspace (excluding a different
  entity type and a cross-workspace Note); rename records
  `entity.updated` Activity; content update via the mutate route preserves
  the exact source, including empty and whitespace-only content; an
  unchanged content save adds no duplicate `note.content_updated` event;
  oversized content is rejected with a typed field error, writing nothing;
  an unknown mutation intent is rejected with a typed `400`; every route
  (detail, mutate, activity) fails closed with a calm `404` for missing,
  deleted, wrong-type and cross-workspace Note ids; the Activity route
  returns a bounded page containing creation, rename and content-update
  events; **(NOTES-01C)** delete/restore through the mutate route,
  disappearing from/appearing in the correct collection state, a deleted
  Note's canonical route/activity/edit intents all still 404, content and
  title surviving a delete→restore cycle exactly, delete/restore
  idempotency, fail-closed delete/restore for missing/wrong-type/
  cross-workspace ids, the kernel-reserved `entity.deleted`/`entity.restored`
  events with no `note.deleted` duplicate, and the active/deleted
  collections never leaking into each other. Also extended
  `test/kernel/entity-repository.test.ts` and `entity-cursor.test.ts` for
  the new `deletedOnly` list option and its bound cursor scope.
- **Playwright E2E** (`e2e/notes.spec.ts`): create a uniquely test-owned
  Note, type Markdown and let it **autosave with no Save button anywhere**,
  confirm the sanitised Preview view mode (including that no `<script>`
  element is ever produced), reload and confirm the exact saved source,
  rename, confirm `note.content_updated` in Activity, Back/Forward through
  the route-backed rename Drawer, keyboard-only creation, focus restoration
  on Drawer close, axe (light and dark) and no horizontal overflow across
  the full responsive matrix; a separate journey types content, lets it
  autosave via the real debounce with no interaction, then makes a further
  edit while a routed-delay holds a save in flight and confirms the FINAL
  value (not the superseded one) is what reload confirms; a routed,
  deterministic failed-save + Retry journey; a navigation-guard journey
  (Stay cancels, Leave discards an unsaved, never-persisted draft); a
  desktop Split-view journey plus confirming Split is never offered on a
  narrow viewport; a full delete → Deleted view → Restore → content-intact
  journey with Activity coverage; and a dedicated 390px/320px mobile
  journey. `e2e/touch-targets.spec.ts` gained a Notes block covering the
  record's Rename/Delete actions, the view-mode toolbar and the Deleted
  view's Restore action under touch emulation. Cleans up only its own
  test-owned Notes (title-prefixed, deleted by direct `wrangler d1
  execute --local`) after each test, mirroring
  `areas-goals-mobile.spec.ts`'s convention.
  `e2e/accessibility.spec.ts` and `e2e/responsive.spec.ts` now include
  `/notes?state=deleted` alongside `/notes` in their route sweeps.

## Deferrals

Explicitly out of scope for this module, left to later roadmap items (see
`ROADMAP_V2.md`):

- **NOTES-02** — linking/backlinks/wikilinks.
- **NOTES-03** — organisation, tags, Areas filtering, full content search.
- **NOTES-04** — any remaining mobile polish beyond this module's own
  responsive/touch-target coverage.
- **Offline-first editing.** NOTES-01C's autosave *detects* and honestly
  *attributes* an offline failure and auto-retries on reconnect; it does
  **not** queue writes for later sync while offline — a save attempted
  offline surfaces the error state exactly as any other failure would,
  with the user's draft intact and Retry available.
- **Promoting Notes' `useOnlineStatus`/debounce tuning to DS-06 defaults.**
  These stay Notes-local until a second full-document autosave consumer
  exists to prove the right generally-shared shape, rather than guessing at
  one from a single data point.
- Attachments, Diary integration, AI features, import/export.

No migration, no new environment variable, no Wrangler configuration change
and no new runtime dependency — NOTES-01C is entirely shared-frame UI, one
additive kernel list option, plus tests and documentation.

## Related documents

- [ADR-042](../decisions/ARCHITECTURE_DECISIONS.md#adr-042--notes-autosave-adaptation-and-the-first-generic-record-lifecycle-soft-deleterestore-ui-pattern) —
  the NOTES-01C design record: the autosave adaptation and the generic
  record-lifecycle UI pattern.
- [NOTES_PERSISTENCE.md](./NOTES_PERSISTENCE.md) — the NOTES-01A backend
  foundation this module composes.
- [MARKDOWN_PIPELINE.md](./MARKDOWN_PIPELINE.md) — the shared Markdown
  contract and safe-rendering boundary (FND-08).
- [ACTIVITY_TIMELINE.md](./ACTIVITY_TIMELINE.md) — the shared DS-05 Timeline
  this module's Activity tab composes.
- [GOALS_MODULE.md](./GOALS_MODULE.md) / [PROJECTS_MODULE.md](./PROJECTS_MODULE.md) —
  the closest precedent modules this one mirrors (Projects' `SegmentedFilter`
  UX and archive-flow shape; note that Projects' archive is a *different*,
  business-specific mechanism from Notes' generic soft-delete/restore).
- [ROADMAP_V2.md](../roadmap/ROADMAP_V2.md#phase-5--notes-notes) — NOTES-01A,
  NOTES-01B, NOTES-01C and the later NOTES-02/03/04 items.
