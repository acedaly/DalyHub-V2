# NOTES_MODULE.md — The Notes module (NOTES-01B/NOTES-01C/NOTES-04/NOTES-05)

The real **Notes** UI: a collection with an Active/Deleted lifecycle filter,
a trusted title-only creation flow, and a canonical Markdown record — with
dependable autosave and (NOTES-05) ONE **writing-first live Markdown editor**
where the document is styled as it is typed while Markdown source stays the
single source of truth — composed **entirely** from the shared design system
and the NOTES-01A persistence foundation — no second Notes identity model, no
second Markdown pipeline, no second lifecycle model, and no unsafe client-only
persistence path. Replaces the PX-03 `ModuleComingSoon` placeholder at `/notes`.

NOTES-01B needed no new ADR (a direct application of already-accepted
patterns). NOTES-01C added [ADR-042](../decisions/ARCHITECTURE_DECISIONS.md#adr-042--notes-autosave-adaptation-and-the-first-generic-record-lifecycle-soft-deleterestore-ui-pattern),
recording how the existing DS-06 autosave coordinator was adapted for a
full document and how Notes became the first module to build a generic
(non-Project-specific) soft-delete/restore UI on the kernel's existing
`EntityRepository.softDelete`/`.restore`. **NOTES-05** added
[ADR-044](../decisions/ARCHITECTURE_DECISIONS.md#adr-044-the-writing-first-live-markdown-editor--adopting-codemirror-6-as-an-authoring-surface-over-the-unchanged-fnd-08-source-and-render-pipeline),
recording the adoption of CodeMirror 6 as an *authoring surface only* over the
unchanged FND-08 source-and-render pipeline, and the promotion of the writing
editor to the shared `~/shared/markdown-editor` module. See those ADRs for the
full design records; this document stays the "how it works" reference.

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
| `GET /notes/:noteId` | page | Canonical Note record: the "Note" tab (the NOTES-05 writing-first live Markdown editor + a Read toggle), the "Linked" tab (the shared REL-01 Linked Items section) and the "Activity" tab. **404s for a soft-deleted Note** — see [Lifecycle](#lifecycle-delete-and-restore). |
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
- **"Linked" tab** — the shared **Universal Relationship System** Linked Items
  section (REL-01, [`RELATIONSHIPS.md`](RELATIONSHIPS.md)): a real, populated tab
  (never an empty placeholder), reachable at `?tab=linked`.
- **"Activity" tab** — the shared DS-05 Timeline over `activity.listForEntity`,
  reloading on the Note's *effective* `updatedAt` (see
  [Activity](#activity) below).

Three tabs, all populated — no empty "Settings" tab reserved for a future
capability (DESIGN_SYSTEM.md: never ship an empty tab for later). The Linked tab
became a real capability with REL-01.

## Editor (NOTES-05 — the writing-first live editor)

`app/modules/notes/NoteContentForm.tsx` hosts the "Note" tab. NOTES-05 replaced
NOTES-01C's desktop Source/Split/Preview and NOTES-04's textarea-plus-toolbar
with the ONE shared **`LiveMarkdownEditor`** (`~/shared/markdown-editor`) — the
writing-first editor used across desktop and mobile. `NoteContentForm` is now a
thin adapter: it owns the autosave coordinator, save-state, offline detection
and navigation guard (all unchanged from NOTES-01C, see below) and renders the
shared editor with the note's Markdown source as a controlled value.

**Markdown source stays the single source of truth.** The editor's document IS
the Markdown source string, byte-for-byte; `onChange` emits exactly that string.
CodeMirror 6 is used as an *authoring surface only* — its Lezer Markdown grammar
produces a parse tree the editor styles the source from, but it emits no HTML,
never sanitises, and never becomes the stored representation. The ONE FND-08
pipeline (`renderMarkdownSource` → `<MarkdownContent>`) remains the sole
renderer and the sole sanctioned HTML sink (enforced unchanged by
`test/unit/markdown-boundary.test.ts`). See
[ADR-044](../decisions/ARCHITECTURE_DECISIONS.md#adr-044-the-writing-first-live-markdown-editor--adopting-codemirror-6-as-an-authoring-surface-over-the-unchanged-fnd-08-source-and-render-pipeline)
and [MARKDOWN_PIPELINE.md](./MARKDOWN_PIPELINE.md).

**Live preview — decorate the source, reveal it on the caret.** The shared
`buildLivePreviewDecorations(state)` (pure, unit-tested against an
`EditorState` with no browser) walks the parse tree and returns CodeMirror
decorations that style the source *in place*:

| Construct | Rendered while inactive | On caret entry |
| --- | --- | --- |
| Headings (`#`..`######`, setext) | line grows to the heading scale; `#` markers concealed | raw `# …` returns |
| Bold / italic / strikethrough / inline code | styled span; paired markers concealed | markers return |
| Links | styled text; `[`/`]`/`(url)` concealed | full `[text](url)` returns |
| Images | non-fetching placeholder (glyph + alt) — honours the FND-08 remote-image policy | raw `![alt](url)` returns |
| Block quotes / callouts (`> [!type]`) | left rule + tint (type-coloured for note/warning/danger/tip) | raw `>` returns |
| Fenced code | monospace block | raw fence returns |
| Task items (`- [ ] `) | interactive, **labelled** checkbox (toggles the source `[ ]`↔`[x]`); bullet concealed | raw `- [ ] ` returns |
| Thematic breaks (`---`) | rendered `<hr>` | raw `---` returns |
| GFM tables | rendered `<table>` (hand-built DOM, plain-text cells) | raw pipe source returns |

A construct is "active" (shows raw source) when the selection intersects its
range — so the user always edits real Markdown, never a rich-text proxy. This is
Obsidian-style **Live Preview, not WYSIWYG**. Block decorations (rule/table) are
provided from a `StateField` (CodeMirror requires this for block decorations);
the table/rule/checkbox/image widgets build DOM with `createElement`/
`textContent`, never an HTML-string sink, so no second sink is introduced.

**Toolbar and keyboard shortcuts — one code path.** The pure, React-free
Markdown-source transforms (`markdown-transforms.ts`) and the formatting-action
catalogue (`formatting-actions.ts`) were promoted **unchanged** from the
NOTES-04 Notes-local module into `~/shared/markdown-editor` (shared code cannot
depend on a module). The shared `EditorToolbar` (a WAI-ARIA `toolbar` with
roving tabindex) and the editor keymap (`editor-keymap.ts`, ⌘B/⌘I/⌘E/⌘K and the
list/quote chords) both apply the SAME transform through
`applyMarkdownTransform`, which reads the document + selection out of the view,
runs the transform, and dispatches ONE transaction (one undo step) that updates
the source and restores the selection. Shortcuts are editor-scoped and never
rebind the reserved global `⌘K` palette or `/` search. Toolbar buttons
`preventDefault` on mousedown so a click never steals the editor's selection.

**Read mode — the only alternate surface.** NOTES-05 retires persistent
Source/Split/Preview. A single unobtrusive **Read** toggle swaps the editor for
the note rendered through the exact FND-08 pipeline; there is no split screen and
no persistent raw-source pane. The two-value model lives in the pure
`editor-view-mode.ts`.

**Save model — autosave (unchanged from NOTES-01C).** `NoteContentForm` calls
the SAME pure DS-06 `useAutosaveField<string>` coordinator every other autosaving
field uses. The two Notes tunings are unchanged: `NOTE_AUTOSAVE_DEBOUNCE_MS = 1500`
(document-scale) and `validateNoteContentSize` (reusing FND-08's
`markdownSourceByteLength`/`MARKDOWN_SOURCE_MAX_BYTES`, refusing an oversized
document before a save is attempted). The coordinator's guarantees — one save in
flight; a rapid edit during an in-flight save coalesces to the LATEST value and
is never lost; a stale response can't overwrite newer state; a failed save
preserves the draft and offers Retry; no save while invalid — are proven by
`test/unit/forms/autosave.test.ts` and exercised here at document scale. A
toolbar/shortcut action is just a programmatic `onChange` into the SAME
coordinator; there is **no parallel save state machine**. `onSave` posts the
identical `intent=update_content` to `POST /notes/:noteId/mutate`.

**Save-state UX, offline, navigation guard.** `SaveStatusIndicator` (rendered in
the editor's top bar via its `statusSlot`) presents unsaved/saving/saved/error
directly from the hook's status, pairing an icon glyph with words (never
colour-only). A save failure distinguishes a detected **offline** condition
(`use-online-status.ts`) from a generic failure and auto-retries the moment
connectivity returns. `UnsavedChangesGuard` arms while the latest edit is not yet
safely persisted (`unsaved`/`saving`/`error`) and disarms the instant it is; it
never blocks the record's own Delete (`useDeleteNote` sets a `flushSync`-guarded
`suppressGuard` and flushes the pending edit before navigating). No toast fires
for routine autosave — the inline indicator is the whole signal.

**Progressive enhancement & SSR.** CodeMirror is imported lazily and constructed
only in a client effect; the server (and any no-JavaScript client) renders an
accessible, controlled `<textarea>` fallback with the same label/value/onChange,
which the editor keeps in place if CodeMirror ever fails to load — the note is
never un-editable. The CodeMirror bundle is code-split and enters only the
note-editor route. The editor exposes a stable, surface-agnostic readiness
contract — `data-editor-ready="true"` on its root once the live CodeMirror
surface has mounted and replaced the fallback (`false` until then). Consumers and
E2E gate on that contract rather than on CodeMirror's internal `.cm-editor`
class, so readiness is a public, deterministic signal, not a library
implementation detail.

**Why the shared module (and not Notes-local).** NOTES-04 recorded that the full
writing-first editor should be designed as a reusable pattern against a second
consumer. NOTES-05 delivers it as `~/shared/markdown-editor`; the Diary entry
body (which already reuses the FND-08 pipeline) is the intended second consumer
and the trigger for promoting the pattern to the Design System.

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
forms/`SaveStatusIndicator`. The writing editor (`~/shared/markdown-editor`)
follows the same conventions: the CodeMirror surface is a labelled `textbox`
(`role="textbox"`, `aria-multiline`), the formatting `EditorToolbar` is a
WAI-ARIA `toolbar` with roving tabindex (one Tab stop; Arrow/Home/End move
between buttons; visible words ARE the accessible names), the Read/Write toggle
is a real button carrying its state in its LABEL (never colour-only) plus
`aria-pressed`, the CodeMirror host shows the shared `:focus-visible` ring on
`:focus-within` (re-pinned under forced-colors), and every control meets the
44px `--dh-touch-target-min` floor (proven by an `e2e/touch-targets.spec.ts`
block). The live editor's own interactive task checkboxes ARE labelled; the
editor's axe gate scopes to the authoring surface, since the shared FND-08
renderer's rendered task-list checkboxes carry the
[DEBT-26](../product/PRODUCT_DEBT.md) gap a Notes PR must not fix. The
collection (both states), create Drawer, canonical record, tabs, editor (Write
and Read), rename Drawer, Delete's Undo flow and Activity Timeline are
keyboard-operable, correctly labelled, focus-restoring on Drawer close,
axe-clean in light and dark, and free of horizontal overflow from 320px through
ultra-wide — proven end to end by `e2e/notes.spec.ts` and the shared
`e2e/accessibility.spec.ts` / `e2e/responsive.spec.ts` sweeps (both include
`/notes` and `/notes?state=deleted`). Save state is never colour-only — every
`SaveStatusIndicator` state pairs an icon glyph with words, and the status live
region is polite (never steals focus). On a phone the writing surface takes a
generous share of the viewport (`dvh`-based) and the toolbar scrolls
horizontally in one row rather than wrapping, keeping the writing space tall;
the page stays the single scroll surface.

## Testing

- **Unit / pure** — the writing editor's pure modules live under
  `test/unit/markdown-editor`: `live-decorations.test.ts` (the tree-walking
  decoration builder, run against a parsed `EditorState` with no browser: a
  heading gets its line class and a concealed `#` when inactive but reveals it
  on caret entry; strong/em/strike/inline-code style and conceal their markers;
  a link styles its text and hides its destination; an image becomes a
  placeholder widget; a blockquote and a `[!type]` callout get their classes; a
  task item becomes a checkbox widget with the bullet concealed and the checked
  state read correctly; thematic rules and tables become widgets when inactive
  and show raw source when active; no class/widget carries raw HTML),
  `table-source.test.ts` (the GFM table-source parser: cell splitting incl.
  escaped pipes, alignments, missing-delimiter → null, CRLF),
  `editor-commands.test.ts` (the transform→CodeMirror bridge reads the
  document + primary selection and reports the change/selection),
  `editor-view-mode.test.ts` (the write/read model), `editor-keymap.test.ts`
  (shortcuts derive from the shared catalogue and never claim `/`), plus the
  **promoted** `markdown-transforms.test.ts` (every source transform across
  selected/unselected, multi-line, empty-document, Unicode and CRLF inputs;
  non-mutation; caret/selection; toggle/no-malformed-on-repeat) and
  `formatting-actions.test.ts` (the catalogue has every required action, unique
  ids, a label + hint each, and produces Markdown SOURCE with no HTML tags).
  Notes-local `test/unit/notes` keeps `note-view.test.ts`,
  `note-activity-descriptors.test.ts` and `note-content-validation.test.ts`.
  The autosave coordinator's own correctness (coalescing, staleness, retry,
  no-save-while-invalid) is covered once, generically, by
  `test/unit/forms/autosave.test.ts` — Notes does not re-prove it.
- **Component**: `test/unit/markdown-editor/LiveMarkdownEditor.test.tsx`
  drives the editor's accessible fallback surface (CodeMirror mounts only in a
  real browser, so the unit env forces the controlled `<textarea>` fallback the
  editor keeps on load failure): a labelled editing surface, exact-source
  `onChange`, the WAI-ARIA toolbar with a single roving Tab stop, a toolbar
  action editing the source and restoring selection, the Read toggle rendering
  through the FND-08 pipeline and back, and polite validation messaging. In
  `test/unit/notes`: `NotesCollection.test.tsx` (card rendering, honest
  subtitle, empty/error states, keyset "Load more", the Active/Deleted filter,
  a deleted Note's Restore card, a successful and a failed Restore),
  `create-forms.test.tsx` (`NewNoteForm` validation, duplicate-submit, error
  surfacing, success), `NoteContentForm.test.tsx` (autosave after the debounce,
  immediate save on blur, exact whitespace/CRLF source preservation, **a rapid
  edit coalescing during an in-flight save**, a failed save preserving the
  draft with Retry, offline detection and auto-retry, oversized content refused
  client-side with no fetch, the navigation guard armed/disarmed including
  `suppressGuard`, and the NOTES-05 Read toggle rendering through the shared
  pipeline with no Source/Split/Preview), and `NoteOverview.test.tsx` (generic
  entity identity, Rename/Delete, the exact two-tab structure, tab switching,
  and Delete's Undo-toast → restore flow including a failure path). These force
  the editor's `<textarea>` fallback by mocking
  `~/shared/markdown-editor/editor-setup`.
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
- **Playwright E2E** (`e2e/notes.spec.ts`, rewritten for the live editor —
  CodeMirror runs only in a real browser, so this is where its behaviour is
  proven): the editor is driven as a `textbox`; the exact source is read by
  selecting all (which reveals every concealed marker) and joining the visible
  line text. Journeys: create a uniquely test-owned Note and **write with live
  formatting** (a heading renders — its `#` concealed once the caret leaves the
  line — and the `.cm-dh-h1` line carries just the heading text), **autosave
  with no Save button**, toggle **Read** mode (the shared FND-08 render, no
  `<script>`), reload and confirm the exact source round-trips, rename with
  Back/Forward/Escape + focus restoration, confirm `note.content_updated` in
  Activity, axe (light and dark) and no horizontal overflow across the matrix;
  a dedicated **live-preview** journey (a task item becomes a checkbox, `---`
  becomes an `<hr>`, a GFM table renders); a debounce-then-in-flight journey
  (a later edit made while a routed save is held confirms the FINAL value
  persists); a routed failed-save + Retry journey; a navigation-guard journey
  (Stay cancels, Leave discards); a **toolbar + keyboard-shortcut** journey
  (Bold via the toolbar and italic via ⌘I edit the source, autosave persists it
  across a reload, roving tabindex, 44px touch targets, axe light/dark); a
  delete → Deleted view → Restore → content-intact journey; keyboard-only
  creation; and a 390px/320px mobile journey (live heading, autosave, delete,
  no horizontal overflow, axe). `e2e/touch-targets.spec.ts`'s Notes block
  covers the record's Rename/Delete, the formatting toolbar buttons and the
  Read toggle, and the Deleted view's Restore under touch emulation; it waits
  on the editor's `data-editor-ready` contract before measuring, so a control is
  never sized before its DS-01 styling has applied.
- **Shared E2E fixtures** (`e2e/notes-fixtures.ts`): both Notes specs create
  uniquely-titled, test-owned Notes and tear down only their OWN Notes, by exact
  title, through one reusable helper. Cleanup deletes dependent rows before the
  entity in foreign-key order (`activity_subjects` → orphaned `activities` →
  `note_details` → `entities`), runs the whole ordered sequence in a single
  `wrangler` invocation, and retries it on `SQLITE_BUSY` or a raced
  `FOREIGN KEY` failure — the latter happens when a debounced autosave commits a
  fresh `note.content_updated` activity between the ordered deletes on the shared
  local SQLite file. The sequence is idempotent, and its title scope only ever
  matches the `Notes e2e note ` prefix, so it can never touch a developer's own
  local Notes.
  `e2e/accessibility.spec.ts` and `e2e/responsive.spec.ts` include
  `/notes?state=deleted` alongside `/notes` in their route sweeps.

## Deferrals

Explicitly out of scope for this module, left to later roadmap items (see
`ROADMAP_V2.md`):

- **NOTES-02** — a dedicated backlinks *presentation* (grouped "referenced by").
  The shared **Universal Relationship System** ([REL-01](../roadmap/ROADMAP_V2.md#-rel-01--universal-relationship-system-shared-linked-items),
  [`RELATIONSHIPS.md`](RELATIONSHIPS.md)) already gives the Note record a **Linked**
  tab (the shared Linked Items section) and inline `[[Wiki Links]]`, and — because
  EntityLinks are bidirectional — a note linked from another record already appears
  in that tab; only the grouped "referenced by" view remains.
- **NOTES-03** — organisation, tags, Areas filtering, full content search.
- **NOTES-06 / X-04 — export.** Single-Note `.md`/portable export (NOTES-06)
  and whole-workspace export (X-04). Because the editor keeps Markdown source
  canonical, export is unaffected by NOTES-05.
- **Promoting the shared editor to a second consumer / the Design System.**
  `~/shared/markdown-editor` is built as a reusable pattern; the Diary entry
  body (which already reuses the FND-08 pipeline) is the intended second
  adopter and the trigger for promoting the writing-editor pattern into
  `DESIGN_SYSTEM.md`.
- **Syntax-highlighted code** inside fenced blocks — deliberately not done, to
  match the FND-08 renderer (which renders code as inert, un-highlighted text);
  the editor styles code as a plain monospace block.
- **Offline-first editing.** Autosave *detects* and honestly *attributes* an
  offline failure and auto-retries on reconnect; it does **not** queue writes
  for later sync while offline.
- **Promoting Notes' `useOnlineStatus`/debounce tuning to DS-06 defaults.**
  These stay Notes-local until a second full-document autosave consumer exists.
- **Future editor directions (placeholders, not scheduled here).** The
  writing-first editor is designed to grow into these without changing the
  Markdown-source contract: **backlinks/wikilinks** (NOTES-02); **embeds** of
  other DalyHub records via the EntityLink kernel; a knowledge **graph** view
  over Note↔entity links; **export** to `.md` today (NOTES-06) and a
  **PDF**/printable render reusing the FND-08 renderer (aligned with X-04);
  and real-time **collaboration**. Each is a later roadmap item; NOTES-05
  implements none of them and adds no "Coming Soon" controls — it just keeps the
  source canonical so they remain straightforward to add.
- Attachments, Diary integration, AI features.

**NOTES-05** adds one shared client dependency (CodeMirror 6 + the Lezer
Markdown grammar, all MIT, code-split and lazy-loaded onto the note-editor
route) and the shared `~/shared/markdown-editor` module — **no migration, no
server change, no new environment variable or Wrangler change**, and no change
to the FND-08 pipeline, the `note_details` storage, the mutate route, the
Activity model or the autosave coordinator. It removed the retired
Notes-local view-mode/toolbar files and `app/styles/notes.css` (the editor's
styles now live in `app/styles/markdown-editor.css`).

## Related documents

- [ADR-044](../decisions/ARCHITECTURE_DECISIONS.md#adr-044-the-writing-first-live-markdown-editor--adopting-codemirror-6-as-an-authoring-surface-over-the-unchanged-fnd-08-source-and-render-pipeline) —
  the NOTES-05 design record: adopting CodeMirror 6 as an authoring surface over
  the unchanged FND-08 pipeline, and the shared `~/shared/markdown-editor` module.
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
  NOTES-01B, NOTES-01C, NOTES-04, NOTES-05 and the later NOTES-02/03/06 items.

---

## Status (2026-07-27 reconciliation)

**Current status.** The Notes *record* is complete and genuinely good; Notes *findability* is the weakest area in the product. [NOTES-01A](../roadmap/ROADMAP_V2.md#-notes-01a--notes-persistence-and-domain-foundation)/[01B](../roadmap/ROADMAP_V2.md#-notes-01b--notes-collection-and-canonical-markdown-record)/[01C](../roadmap/ROADMAP_V2.md#-notes-01c--notes-autosave-lifecycle--editor-polish), [NOTES-04](../roadmap/ROADMAP_V2.md#-notes-04--mobile) and [NOTES-05](../roadmap/ROADMAP_V2.md#-notes-05--writing-first-markdown-editor) are ☑. [NOTES-02](../roadmap/ROADMAP_V2.md#-notes-02--linking--backlinks) is ◑; [NOTES-03](../roadmap/ROADMAP_V2.md#-notes-03--organisation--search) and [NOTES-06](../roadmap/ROADMAP_V2.md#-notes-06--note-export-and-portability) are ☐.

**Delivered capabilities.** Creation, editing and dependable autosave with honest offline/retry states; the writing-first CodeMirror 6 live editor whose document **is** the Markdown source byte-for-byte; the shared FND-08 pipeline as the sole renderer and `MarkdownContent` as the sole HTML sink; soft-delete with an Active/Deleted collection filter; the shared Linked Items section; inline `[[Wiki Links]]`; and mobile ergonomics for writing on a phone.

**The canonical-source architecture is preserved and must stay that way.** A Note is stored as exact, validated `MarkdownSource` ([ADR-015](../decisions/ARCHITECTURE_DECISIONS.md#adr-015-markdown-source-and-safe-rendering-pipeline)); rendering always goes through the one sanitising pipeline; the editor is an *authoring surface*, never a second representation. Any future organisation, search or export work must read that same source — never a parallel copy, and never re-rendered HTML presented as the note.

**Known limitations.**

- **No organisation and no search.** `/notes` offers only the Active/Deleted filter — no title search, no content search, no tags, no folders, no Area scoping. The Notes manifest registers **neither a search provider nor any commands**, so a Note cannot be found from global Search or the Command Palette either — while the Today fixture provider still returns invented `note:` results. [NOTES-03](../roadmap/ROADMAP_V2.md#-notes-03--organisation--search), [DEBT-36](../product/PRODUCT_DEBT.md#-debt-36--global-search-coverage-is-incomplete-several-shipped-modules-register-no-provider--p2), [DEBT-17](../product/PRODUCT_DEBT.md#-debt-17--today-search-provider-is-fixture-backed-not-over-real-records--p1).
- **Backlinks are incomplete in two distinct ways.** There is no grouped "Referenced by" presentation (direction is carried as data but never surfaced), and `[[Wiki Links]]` **create no EntityLink at all** — they resolve at navigation time, so a wiki-linked record never learns it was referenced. The resolver also scans the whole workspace with a deliberate no-page-cutoff. [NOTES-02](../roadmap/ROADMAP_V2.md#-notes-02--linking--backlinks), [DEBT-39](../product/PRODUCT_DEBT.md#-debt-39--wiki-links-create-no-entitylink-and-the-resolver-scans-the-whole-workspace--p2).
- **No export.** A Note cannot be exported, despite being stored as portable Markdown source — [NOTES-06](../roadmap/ROADMAP_V2.md#-notes-06--note-export-and-portability).
- Rendered GFM task-list checkboxes have no accessible label — a shared pipeline concern, [DEBT-26](../product/PRODUCT_DEBT.md#-debt-26--rendered-gfm-task-list-checkboxes-have-no-accessible-label--p3).

**Deferred work.** Tags/folders and content search; a backlinks view; single-Note export (deliberately **before** the whole-workspace [X-04](../roadmap/ROADMAP_V2.md#-x-04--export--data-portability), as the small provable proof of the export contract); the project-scoped knowledge view ([PROJ-03](../roadmap/ROADMAP_V2.md#-proj-03--knowledge)).

**Relevant roadmap items.** [NOTES-01A/01B/01C](../roadmap/ROADMAP_V2.md#-notes-01a--notes-persistence-and-domain-foundation) ☑ · [NOTES-04](../roadmap/ROADMAP_V2.md#-notes-04--mobile) ☑ · [NOTES-05](../roadmap/ROADMAP_V2.md#-notes-05--writing-first-markdown-editor) ☑ · [REL-01](../roadmap/ROADMAP_V2.md#-rel-01--universal-relationship-system-shared-linked-items) ☑ · [NOTES-02](../roadmap/ROADMAP_V2.md#-notes-02--linking--backlinks) ◑ · [NOTES-03](../roadmap/ROADMAP_V2.md#-notes-03--organisation--search) ☐ · [NOTES-06](../roadmap/ROADMAP_V2.md#-notes-06--note-export-and-portability) ☐.

**Relevant product-debt items.** [DEBT-36](../product/PRODUCT_DEBT.md#-debt-36--global-search-coverage-is-incomplete-several-shipped-modules-register-no-provider--p2) · [DEBT-39](../product/PRODUCT_DEBT.md#-debt-39--wiki-links-create-no-entitylink-and-the-resolver-scans-the-whole-workspace--p2) · [DEBT-08](../product/PRODUCT_DEBT.md#-debt-08--ad-hoc-cross-entity-links--p2) · [DEBT-17](../product/PRODUCT_DEBT.md#-debt-17--today-search-provider-is-fixture-backed-not-over-real-records--p1) · [DEBT-26](../product/PRODUCT_DEBT.md#-debt-26--rendered-gfm-task-list-checkboxes-have-no-accessible-label--p3).

---

## The consistency pass (DS-12 / PX-04 / PX-05 / PX-06, 2026-07-28)

**Delete moved into the shared overflow, and its machinery became shared.** The behaviour is
unchanged — one click, a real soft-delete, a redirect to `/notes`, a DS-10 **Undo** toast, and
the Deleted view as the durable path back — but it now lives in the ONE overflow (⋯) slot every
record uses, with the derived label `Delete Note`. `useDeleteNote` is a thin wrapper over the
shared `useReversibleDelete`; only the genuinely Note-specific concern stays local (flushing the
Markdown editor's latest edit before deleting, so Undo restores what the user last wrote). The
Deleted collection's restore is the shared `useCollectionRestore`. Notes was the reference
pattern; it is now the shared one, with Goals and Diary running on it.

See [`DESIGN_SYSTEM.md → Shared overflow menu`](../design/DESIGN_SYSTEM.md#shared-overflow-menu-ds-12),
[`→ Shared record lifecycle`](../design/DESIGN_SYSTEM.md#shared-record-lifecycle-px-04) and
[ADR-053](../decisions/ARCHITECTURE_DECISIONS.md#adr-053-the-shared-overflow-menu-and-one-record-lifecycle-vocabulary).
