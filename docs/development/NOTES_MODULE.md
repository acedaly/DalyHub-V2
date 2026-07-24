# NOTES_MODULE.md — The Notes module (NOTES-01B)

The first real **Notes** UI: a collection, a trusted title-only creation
flow, and a canonical Markdown record composed **entirely** from the shared
design system and the NOTES-01A persistence foundation — no second Notes
identity model, no second Markdown pipeline, no bespoke UI primitives, and no
unsafe client-only persistence path. Replaces the PX-03 `ModuleComingSoon`
placeholder at `/notes`.

No new ADR: this is a direct application of already-accepted patterns —
DS-02 (Record Layout), DS-03 (Drawer), DS-04 (Card), DS-05 (Activity
Timeline), DS-06 (Forms, including the `MarkdownField` control), and the
NOTES-01A additive-detail-table persistence slice, exactly as ADR-028/ADR-036
already established for Goal/Project/Task records.

## Data ownership

Notes are first-class DalyHub entities but are **not** part of the Area →
Goal → Project → Task spine (AGENTS.md §4). NOTES-01B adds no persistence —
it is a pure UI slice over the NOTES-01A foundation:

| Concern | Authority |
| --- | --- |
| Identity, `id`, workspace, title, lifecycle (create/rename) | The generic `EntityRepository` (`app/kernel/entities`) — `entities.type = 'note'` |
| Markdown content (the Note's body) | `NoteDetailsRepository` (`app/kernel/notes`) — `note_details` table |
| Rendered HTML preview | Nobody — always derived on demand by the shared FND-08 renderer, never persisted |
| Event history | The shared Activity stream (`activity.listForEntity`) |

Soft-delete/restore, backlinks, tags, folders, Areas filtering and search
remain out of scope for this slice (see [Deferrals](#deferrals)).

## Routes

Registry-discovered (`app/modules/notes/routes.manifest.ts`), composed by the
shell:

| Route | Kind | Responsibility |
| --- | --- | --- |
| `GET /notes` | page | The real Notes collection — every active Note in the workspace, bounded cursor pagination. Replaces the PX-03 placeholder. |
| `POST /notes/new` | resource | Create a Note via `entities.create({ type: "note", title })`. Title only. |
| `GET /notes/:noteId` | page | Canonical Note record: the "Note" tab (Markdown source editor + safe preview) and the "Activity" tab. |
| `POST /notes/:noteId/mutate` | resource | `rename` / `update_content`, verified active-Note anchor. |
| `GET /notes/:noteId/activity` | resource | One bounded DS-05 Timeline page over `activity.listForEntity(noteId)`. |

The static `/notes/new` segment is registered before `/notes/:noteId`.
Missing, deleted, wrong-type and cross-workspace Note ids fail closed with the
same calm not-found outcome at every route (`entities.getById` returning
`null`/a non-`"note"` type never discloses which case occurred). Every route
resolves the trusted workspace and actor server-side via
`resolveAuthenticatedWorkspaceScope`; no client-supplied workspace or actor is
ever accepted.

## Notes collection

`app/modules/notes/NotesCollection.tsx` composes the shared PX-02
`CollectionLayout` + DS-04 `Card`/`CardCollection`, mirroring
`~/modules/projects/ProjectsCollection.tsx` minus the parent picker and state
filter Notes don't have:

- a Pane Header with the Notes entity identity;
- an honest "N notes loaded" / "N notes" subtitle — never claims a total while
  a bounded page remains, matching every other DalyHub collection;
- a "New note" primary action opening the shared DS-03 Drawer;
- loading (the default `CollectionLayout` skeleton), empty, and error states —
  no filtered-empty state, since this slice has no real filter (no fake
  boards/folders/tags);
- a keyset "Load more" affordance (`LoadMore`) that accumulates pages without
  navigating, de-duplicating overlapping boundaries;
- deterministic ordering, inherited unchanged from
  `EntityRepository.list`'s `(createdAt, id)` order;
- Cards linking to the canonical `/notes/:noteId` record via both `href` (a
  real, shareable link) and `onOpen` (SPA navigation) — never an inaccessible
  clickable container.

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
  `AreaOverview.tsx`'s single-item breadcrumb already exhibits), and a Rename
  action. No bespoke Notes-only header.
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
`MarkdownField` control unchanged — a plain `<textarea>` that edits and
preserves the Markdown source byte-for-byte (never trims, never rewrites,
never normalises line endings; supports empty and whitespace-only content),
plus its own lazy-loaded "Show preview" disclosure that renders through the
**one** shared FND-08 pipeline (`renderMarkdownSource` → `<MarkdownContent>`).
No new editor dependency, no second parser, no second sanitiser, no second
`dangerouslySetInnerHTML` sink — the sanctioned one stays inside
`MarkdownContent`, unchanged by this module.

**Save model — explicit, not autosave.** `useForm` (DS-06's explicit-save
host) with a single `content` field. The Save button is **disabled whenever
the content matches the last-saved baseline**, so the UI never emits a no-op
save (the server-side `NoteDetailsRepository.update` is independently
idempotent either way — belt and suspenders, not a substitute). Posting
`intent=update_content` to `POST /notes/:noteId/mutate` calls
`noteDetails.update`, which validates through the shared `parseMarkdownSource`
(1 MiB limit, control-character rejection) and is atomic with its own
`note.content_updated` Activity event.

Autosave was deliberately not adopted for this slice: `use-autosave-field.ts`
exists and is proven for short fields (a debounced target date / definition
of done), but adapting it to a full-document Markdown editor is real,
untested design work this slice does not need to take on — explicit Save is
what the task calls for by default, and it is what this slice ships. See
[Deferrals](#deferrals).

**Save-state UX.** `SaveStatusIndicator` (DS-06) presents the required
signals with its five documented states — `idle` (its own "matches the last
saved value; nothing to do" semantics **is** the "unchanged" state, so a
freshly-loaded, unedited Note correctly shows nothing rather than a false
"Saved" claim), `unsaved`, `saving`, `saved` (a small local `justSaved` flag,
cleared the instant the user edits again — no toast per keystroke), and
`error`. Validation failures surface as `MarkdownField`'s own field error;
unexpected/storage failures surface as the form-level error next to the
indicator's Retry action — both distinct in text even though both map to
`status="error"`. The form never claims "Saved" until the mutate route's
response confirms it (`useForm`'s documented contract: a successful save
commits exactly the submitted snapshot, never a newer in-flight draft as the
baseline), and a failed save always leaves the user's typed draft intact and
retryable. `UnsavedChangesGuard` (the one shared focus-trapped confirm
surface — no second implementation) guards in-app navigation and full-page
unload while the form is dirty.

A static help line cites the shared `MARKDOWN_SOURCE_MAX_BYTES` limit (1 MiB)
rather than a live byte counter — `MarkdownField` has no counter prop, and
this slice does not add one.

## Note mutations

Both intents on `POST /notes/:noteId/mutate`, verified active-Note anchor
(`entities.getById` must return a live entity with `type === "note"` — a
task/project/area/goal id, or a cross-workspace id, gets the same calm 404
and nothing is mutated):

- `rename` → `entities.update(noteId, { title })` (title stays owned by the
  generic entity kernel — Notes are not a spine type, so this is
  `EntityRepository.update`, not `SpineRepository.rename`).
- `update_content` → `noteDetails.update(noteId, content)`, atomic with its
  own `note.content_updated` Activity event. The Activity payload is
  `{ empty: boolean }` only — never the Markdown text, which may be private.

An unknown intent gets a typed `400`. Mutation outcomes are typed
discriminated unions (`NoteMutationResult`); success revalidates the record
loader — no hard reload.

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

Inherits DS-11 entirely — no new a11y work was required because every
surface reuses shared, already-audited primitives: `CollectionLayout`,
`Card`, `RecordLayout`, `Drawer`/`UnsavedChangesGuard` (the one focus trap),
and DS-06 forms/`MarkdownField`/`SaveStatusIndicator`. The collection, create
Drawer, canonical record, tabs, editor, preview toggle, rename Drawer and
Activity Timeline are keyboard-operable, correctly labelled, focus-restoring
on Drawer close, axe-clean in light and dark, and free of horizontal overflow
from 320px through ultra-wide — proven end to end by `e2e/notes.spec.ts` and
the shared `e2e/accessibility.spec.ts` / `e2e/responsive.spec.ts` sweeps
(both already included `/notes` in their route lists). Save state is never
colour-only — every `SaveStatusIndicator` state pairs an icon glyph with
words, and the status live region is polite (never steals focus).

## Testing

- **Unit / pure** (`test/unit/notes`): `note-view.test.ts`
  (`effectiveNoteUpdatedAt`'s three timestamp-ordering cases),
  `note-activity-descriptors.test.ts` (the one Note-owned descriptor, the
  kernel lifecycle defaults, the safe fallback for unknown types, no raw
  payload text) — mirrors `test/unit/goals/goal-activity-descriptors.test.ts`.
- **Component** (`test/unit/notes`): `NotesCollection.test.tsx` (card
  rendering, honest subtitle, empty/error states, keyset "Load more" without
  duplicates), `create-forms.test.tsx` (`NewNoteForm` required-title
  validation, duplicate-submit prevention, server-error surfacing, the
  success path), `NoteContentForm.test.tsx` (Save disabled until genuinely
  dirty, exact whitespace-only source preservation, the
  saving→saved/error state transitions, `onSaved` never called before the
  response resolves, a failed save keeps the draft, Retry re-submits),
  `NoteOverview.test.tsx` (generic entity identity, the Rename action, the
  exact two-tab structure, tab switching).
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
  events.
- **Playwright E2E** (`e2e/notes.spec.ts`): the full journey — navigate to
  Notes, confirm the placeholder is gone, create a uniquely test-owned Note,
  open its canonical record, type Markdown (headings, a list, a link,
  bold/italic), Save, confirm the sanitised preview (including that no
  `<script>` element is ever produced), reload and confirm the exact saved
  source, rename, confirm `note.content_updated` in Activity, exercise
  Back/Forward through the route-backed rename Drawer, keyboard-only
  creation, focus restoration on Drawer close, axe (light and dark) and no
  horizontal overflow across the full responsive matrix. Cleans up only its
  own test-owned Notes (title-prefixed, deleted by direct `wrangler d1
  execute --local`) after each test, mirroring
  `areas-goals-mobile.spec.ts`'s convention.
  `e2e/px-03-navigation.spec.ts` was updated to drop Notes from its
  Coming-Soon-placeholder loop (Notes now has real content) while keeping
  Notes' sidebar-reachability and `aria-current` coverage, now asserted
  against the real collection heading.

## Deferrals

Explicitly out of scope for NOTES-01B, tracked as **NOTES-01C — Notes
autosave, lifecycle & editor polish** (see `ROADMAP_V2.md`):

- **Autosave.** The explicit-Save model above; adopting `use-autosave-field`
  for a full-document editor needs its own design pass (debounce tuning,
  conflict/staleness handling for a much larger payload than the fields it
  is proven against today).
- **Soft-delete / restore.** No existing generic, reusable "delete this
  record" UI pattern was found to adopt as-is (the only current
  `softDelete`/`restore` caller is Projects' project-specific archive flow,
  which is business-state driven, not a generic action); building one is
  its own scoped piece of work, not a same-PR addition.
- **Advanced editor behaviour.** Side-by-side source/preview on wide
  screens, a richer authoring surface, or any block-editor ergonomics beyond
  the DS-06 `MarkdownField` toggle.
- **Everything already out of this slice's stated scope**: linking/backlinks/
  wikilinks (NOTES-02), organisation/tags/Areas filtering/content search
  (NOTES-03), mobile-specific polish beyond what DS-11 already guarantees
  (NOTES-04), attachments, Diary integration, AI features, import/export.

No migration, no new environment variable, no Wrangler configuration change
and no new dependency — this PR is entirely shared-frame UI plus tests and
documentation.

## Related documents

- [NOTES_PERSISTENCE.md](./NOTES_PERSISTENCE.md) — the NOTES-01A backend
  foundation this module composes.
- [MARKDOWN_PIPELINE.md](./MARKDOWN_PIPELINE.md) — the shared Markdown
  contract and safe-rendering boundary (FND-08).
- [ACTIVITY_TIMELINE.md](./ACTIVITY_TIMELINE.md) — the shared DS-05 Timeline
  this module's Activity tab composes.
- [GOALS_MODULE.md](./GOALS_MODULE.md) / [PROJECTS_MODULE.md](./PROJECTS_MODULE.md) —
  the closest precedent modules this one mirrors.
- [ROADMAP_V2.md](../roadmap/ROADMAP_V2.md#phase-5--notes-notes) — NOTES-01A,
  NOTES-01B, NOTES-01C and the later NOTES-02/03/04 items.
