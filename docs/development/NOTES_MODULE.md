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
[Lifecycle: delete and restore](#lifecycle-archive-delete-and-restore)). Backlinks,
tags, folders, Areas filtering and full-text search remain out of scope (see
[Deferrals](#deferrals)).

## Routes

Registry-discovered (`app/modules/notes/routes.manifest.ts`), composed by the
shell:

| Route | Kind | Responsibility |
| --- | --- | --- |
| `GET /notes` | page | The Notes collection. `?state=active` (default) / `archived` / `deleted`, plus `?q=`, `?tag=`, `?project=`, `?area=`, `?links=linked\|unlinked` and `?sort=recent`. Bounded cursor pagination; each filter combination is its own bound cursor scope. Replaces the PX-03 placeholder. |
| `POST /notes/new` | resource | Create a Note via `entities.create({ type: "note", title })`. Title only. |
| `GET /notes/:noteId` | page | Canonical Note record: the "Note" tab (the NOTES-05 writing-first live Markdown editor + a Read toggle), the "Linked" tab (the shared REL-01 Linked Items section) and the "Activity" tab. **404s for a soft-deleted Note** — see [Lifecycle](#lifecycle-archive-delete-and-restore). |
| `POST /notes/:noteId/mutate` | resource | `rename` / `update_content` (verified ACTIVE-Note anchor) and `delete` / `restore` (verified anchor regardless of lifecycle state — see below). |
| `GET /notes/:noteId/activity` | resource | One bounded DS-05 Timeline page over `activity.listForEntity(noteId)`. |
| `GET /notes/:noteId/references` | resource | Further pages of the Note's backlinks (`?direction=incoming`) or outgoing links (`?direction=outgoing`). The FIRST page is server-rendered by the record route. |
| `GET /notes/:noteId/export` | resource | The single-Note download, `?format=md\|txt`. Returns an attachment; never a page. |

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
- an **Active/Archived/Deleted** `SegmentedFilter` (`~/shared/segmented-filter`,
  promoted from Projects' PROJ-01-local component in NOTES-01C — the
  identical `?state=` URL-param pattern) plus the NOTES-03
  [filter bar](#organisation-notes-03), driving `scope.notes.list(...)`;
- a "New note" primary action opening the shared DS-03 Drawer — hidden on
  the Deleted view, matching Projects' archived-view convention;
- loading (the default `CollectionLayout` skeleton), the genuine empty
  state ("No notes yet", Active only), a filtered-empty state ("No deleted
  notes", Deleted only), and an error state;
- a keyset "Load more" affordance (`LoadMore`) that accumulates pages without
  navigating, de-duplicating overlapping boundaries, and resets whenever
  EITHER the cursor scope OR the Active/Deleted state changes (they are
  different bound cursor scopes — see [Lifecycle](#lifecycle-archive-delete-and-restore));
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

ADR-060 extends the same `/notes/new` route with optional capture context. A Note
captured from a Project creates the Project→Note `link.related` relationship that
Project Knowledge reads; a Note captured from a Person, Area, Goal, Meeting, Task
or Diary entry creates a Note→source `link.related`. No fake `[[Wiki Links]]` are
generated to create these relationships.

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
- **"Backlinks" tab** — every record that explicitly links TO this Note
  (`?tab=backlinks`). See [Backlinks and outgoing links](#backlinks-and-outgoing-links-notes-02).
- **"Links" tab** — what this Note points AT (`?tab=linked`), in three
  non-overlapping sections: the **Projects** it documents, the records
  **referenced in its own text** (body-derived `note.references`, read-only —
  edit the text to change them), and the shared **Universal Relationship
  System** Linked Items surface (REL-01, [`RELATIONSHIPS.md`](RELATIONSHIPS.md))
  where hand-made relationships are *managed*. The hand-made `link.related`
  links are deliberately NOT repeated in the referenced-in-this-note list: one
  relationship must not appear twice with two different removal models.
- **"Activity" tab** — the shared DS-05 Timeline over `activity.listForEntity`,
  reloading on the Note's *effective* `updatedAt` (see
  [Activity](#activity) below).

Four tabs, all populated — no empty "Settings" tab reserved for a future
capability (DESIGN_SYSTEM.md: never ship an empty tab for later). The Linked tab
became a real capability with REL-01; NOTES-02 split the two link DIRECTIONS
apart, because "who points at me" and "what do I point at" are different
questions and merging them produces one ambiguous list (§4 of the knowledge
brief). Tags, Export, Archive and Delete all live in the ONE shared DS-12
overflow (⋯) — there is no Notes-only action bar.

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

**Reconciliation — a note that changed somewhere else.** The knowledge
completion closed [DEBT-47](../product/PRODUCT_DEBT.md). The record route
revalidates its loader, so `initialContent` IS the note's current server-side
content; `NoteContentForm` hands it to the coordinator as `serverValue` and the
shared contract decides:

| Editor state | What happens |
| --- | --- |
| **Clean** (nothing pending, nothing in flight, no failed save) | The newer content is adopted **silently**. There is no draft to lose, so asking would be noise. |
| **Dirty** (a pending edit, an in-flight save, or a failed save) | **Nothing the user can see changes.** The draft stays exactly as they left it and the newer version is parked, then OFFERED by the shared `RemoteChangeBanner`. |

The banner's two choices are the only two: **Load the newer version** (takes the
server's content, discarding the draft — destructive, so never automatic and
never the default, and disabled while a save is in flight because an in-flight
save would land afterwards) and **Keep mine** (dismiss and go on saving). "Keep
mine" IS last-write-wins — but a *deliberate* one the user asked for, which is a
different thing from a silent one.

There is deliberately **no merge option**. Markdown has no deterministic safe
merge, and a wrong merge produces content neither person wrote — worse than
either version. An honest banner beats a clever guess. Once our own save lands,
any parked version is cleared: continuing to offer it would offer content that no
longer exists anywhere.

This is a change to the SHARED DS-06 coordinator, but an **opt-in** one: a field
that does not pass `serverValue` behaves exactly as before, so every other
autosave surface keeps its current semantics until it adopts the contract
deliberately.

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
- `set_tags` (NOTES-03) → `noteDetails.setTags(noteId, …)`. Accepts the JSON
  array the shared DS-06 `TagsField` posts (and, defensively, a comma list).
  Validation/normalisation is the kernel's `parseNoteTagInput` — one rule, not
  a component's. Idempotent; the Activity payload carries a COUNT only.
- `archive` / `unarchive` (NOTES-03) → `noteDetails.setArchived(noteId, …)`.
  Reversible, idempotent, and DISTINCT from `delete` (see
  [Lifecycle](#lifecycle-archive-delete-and-restore)).

`update_content` additionally reconciles the Note's `[[Wiki Link]]` references
into real EntityLinks after the content write (see
[Backlinks and outgoing links](#backlinks-and-outgoing-links-notes-02)). That
reconciliation NEVER fails the save: the Markdown source is the canonical record,
and a workspace hiccup writing derived relationships must not cost the user their
writing. The next save reconciles from the same source, so nothing drifts
permanently.

An unknown intent gets a typed `400`. Mutation outcomes are typed
discriminated unions (`NoteMutationResult`); success revalidates the record
loader — no hard reload.

## Backlinks and outgoing links (NOTES-02)

**A backlink is an explicit typed relationship or a supported entity reference —
never a text coincidence.** Writing a Note's title in a sentence creates nothing;
writing `[[That note]]`, or linking the two records, does. The UI says so, not
just this document.

### `[[Wiki Links]]` are now REAL relationships

Before NOTES-02, a wiki link was resolved at *navigation* time and wrote nothing,
so a referenced record never learned it had been referenced ([DEBT-39]). Now,
every time a Note's content is saved, `reconcileNoteReferences`
([`app/platform/entity-links/note-references.ts`](../../app/platform/entity-links/note-references.ts))
makes the Note's **`note.references`** EntityLinks exactly match the `[[…]]`
references in its body:

| Situation | Outcome |
| --- | --- |
| `[[Atlas]]` written and saved | ONE `note.references` link, note → Atlas |
| `[[Atlas]]` written five times | still ONE link (kernel relationship identity) |
| `[[Atlas]]` inside a fenced or inline code block | **no link** — sample text is not a relationship |
| `[[ ]]`, `[[]]`, an unterminated `[[` | no link, no error |
| a `[[Title]]` matching nothing in the workspace | no link; reported as unresolved, save still succeeds |
| `[[Own title]]` (a self-reference) | no link — a record cannot relate to itself |
| the last `[[Atlas]]` removed from the text | the link is unlinked |
| `[[Atlas]]` written again later | the SAME link id is **restored in place** — never a duplicate |
| Atlas is **renamed** | the relationship survives — it is stored by stable id, not by title |
| Atlas is **soft-deleted** | the row stops appearing (kernel `listForEntity` contract) and returns intact if Atlas is restored |

Reconciliation only ever touches `note.references` links whose SOURCE is this
Note, so a user-created `link.related`, a `meeting.attendee` or an INCOMING
reference is never disturbed. Title resolution is ONE bounded, indexed query
(`notes.resolveReferenceTargets`) — never the whole-workspace scan DEBT-39
recorded — preferring a Note, then the earliest-created record, when several
records share a title.

### `dalyhub://` record links — the id-stable half

`[[Wiki Links]]` are the right tool while writing prose: fast, readable, and
resolved by title. They cannot answer one question honestly, though — *which*
record did the author mean? Two records sharing a title are told apart only by a
tie-break, and the resolution is redone on every save.

A **record link** is the other half:

```markdown
See [Project: DalyHub V2](dalyhub://project/9f1c…).
```

It is an ordinary Markdown link, so the source stays readable in any editor, and
its destination names a RECORD rather than a host — so it does not rot when the
deployment moves, the way a `https://…` self-link would.

NOTES-06's export already **wrote** this form. Until the knowledge completion the
product could not **read** it: `dalyhub:` is not in the FND-08 URL allowlist, so
a record link — including one pasted back from an export DalyHub itself produced
— rendered as inert plain text. That round trip is now closed.

| Concern | How it works |
| --- | --- |
| Rendering | `remarkRecordLinks` rewrites `dalyhub://type/id` to the relative resolver path BEFORE `remark-rehype`, exactly as `remarkWikiLinks` does for `[[…]]`. The URL policy and sanitisation schema are **untouched**; no `dalyhub:` href ever reaches the DOM. |
| Resolution | `GET /notes/resolve?type=&id=` — the one place with a trusted workspace scope. The declared type is checked against the STORED type, so a link cannot claim a record is something it is not. |
| Relationships | Record links reconcile into the SAME `note.references` set as `[[…]]`. A record link and a wiki link to the same record collapse to ONE relationship. |
| Trust | The id in a note body is user input and is never trusted. `entityLinks.create` is the authority: a missing, cross-workspace or archived target is reported as unresolved and nothing is written. |
| Broken targets | A deleted target renders normally and lands on a calm "That link doesn't go anywhere" page. Deleted, wrong-type and cross-workspace ids are one indistinguishable outcome. A malformed `dalyhub://` URL is left alone, fails the URL policy, and becomes readable inert text — never a link to something unverified. |
| Authoring | A **Record link** toolbar command opens a searchable picker (`~/shared/markdown-editor/RecordLinkPicker`), composed from the same headless `useCombobox` the DS-06 picker uses and staying inside the toolbar's ONE Tab stop. Options — destination included — are formatted by the SERVER and returned from the shared `/links` endpoint (`op=record-link`), so the client never mints a link destination. |

Choosing a record inserts text; it does **not** directly create an EntityLink.
The next save reconciles that text into the relationship, the same path a
`[[…]]` takes — so undoing the insertion (⌘Z) also undoes the relationship, and
there is never a relationship the note's own text cannot explain.

The pure format (`formatRecordLink`/`parseRecordLink`) lives in
[`~/shared/markdown/record-link`](../../app/shared/markdown/record-link.ts)
rather than the platform layer, because its three consumers sit in three layers
— the remark transform, the export transformer and the editor's picker (a
component, which must not depend on platform). See
[ADR-064](../decisions/ARCHITECTURE_DECISIONS.md#adr-064-the-dalyhub-record-link-and-a-reconciliation-contract-for-autosave).

### Reading the graph

`~/shared/references` is a NEW, ISOLATED shared contract that reads the FND-04
graph **directionally**. It does not replace `~/shared/linked-items`: that
surface owns CREATING and REMOVING relationships, this one owns reading them.
Both read the same kernel — there is no second relationship store and no second
timeline representation.

- **Backlinks (incoming)** come from every module, not just Notes — a Project,
  Task, Diary entry, Meeting, Person, Review, Area or Goal that links to this
  Note appears here, labelled with its own relationship type
  (`Related`, `Mentioned in note`, `Meeting attendee`, …). The tab states an
  **honest count** ("N loaded" while a page remains, never a claimed total —
  the bounded read genuinely does not know the total), groups rows by **module
  family** rather than raw entity type, and offers a native **module filter**.
  The families are fixed, so a reader learns where to look:

  > Notes · Projects, Areas and Goals · People and Meetings · Tasks and Reviews · Diary · Assets · Other records

  A family with nothing in it is never rendered, and the filter offers only
  families actually present — a filter that can only empty the list is not a
  filter. Grouping by raw type instead would turn fifty backlinks across eight
  types into eight one-row groups: a table of contents, not an aid.
- **Outgoing** links are grouped by counterpart type, with linked **Projects**
  called out in their own section.
- Reserved **structural spine links** are excluded from both directions, exactly
  as `loadLinkedItems` excludes them — the hierarchy renders those itself.

### Context

Where it is practical and bounded, a reference shows WHY it exists:

- **incoming from a Note** — the block of the source note containing
  `[[this note's title]]`, fetched for the WHOLE page in ONE batched query
  (`notes.loadContextWindows`), never one query per row;
- **outgoing from this Note** — the block of THIS note containing the reference,
  computed from the source the route already holds (no extra query).

**Paging.** The underlying EntityLink cursor advances by KERNEL page, not by
display item, so a relationship page returns EVERYTHING the scan collected
rather than truncating to the requested limit: `limit` is a *stop scanning*
threshold, and a page may overshoot it by at most one kernel page. Truncating
would be silently lossy — with, say, 40 relationships inside a single 100-row
kernel page the cursor is already `null`, so rows 26–40 would be unreachable
with no "Load more" able to find them. This is the same contract the shared
`loadLinkedItems` uses, so the two surfaces cannot disagree about what a page
contains.

Extraction is deterministic and defensive: the window is cut in SQL around
`instr(...)`, wiki-link syntax collapses to its label so the user never sees
`[[…]]`, the shared analyser strips the remaining Markdown so no half-open
construct is rendered, the excerpt never spans past a blank-line block boundary
(so unrelated content is never exposed), and it is truncated to a fixed maximum
with a deterministic ellipsis. **Known limitation:** context is provided for
**note** sources only; every other source type shows its relationship name
instead. Extending it (task descriptions, diary entries, meeting notes) is a
straightforward addition to the same batched shape.

## Organisation (NOTES-03)

`/notes` gained the organisation it was missing, without a Notes-only filtering
system: the lifecycle state stays the shared `SegmentedFilter`, and everything
else is ONE ordinary GET `<form>` of native `<input>`/`<select>` controls
(`NotesFilterBar.tsx`).

| Filter | Param | Meaning |
| --- | --- | --- |
| Search | `?q=` | case-insensitive substring over title, Markdown body and tags |
| Tag | `?tag=` | exact tag token (tags are normalised, so case never matters) |
| Project | `?project=` | Notes explicitly linked to that Project |
| Area | `?area=` | Notes explicitly linked to that Area |
| Links | `?links=linked\|unlinked` | has, or has no, active non-structural relationship |
| Sort | `?sort=recent` | most recently updated first (default: newest created) |
| State | `?state=archived\|deleted` | the lifecycle slice |

Native controls are a deliberate accessibility and mobile choice: a real
on-screen keyboard and native picker on a phone, keyboard-complete for free, and
no custom widget semantics. There is **no auto-submit on change** — arrowing
through a `<select>` must not navigate away under a keyboard user; "Apply" is the
single predictable commit, and "Clear" appears only when something is set. Every
filter lives in the URL, so a filtered view is shareable, Back/Forward-correct
and restorable, and **each filter combination is its own bound cursor scope** —
a cursor issued under one filter set is rejected under another (and the loader
then honestly serves the first page of the newly-chosen scope rather than an
error).

**Tags** are stored on `note_details.tags` as a JSON array of normalised
(trimmed, whitespace-collapsed, case-folded, de-duplicated, sorted) strings —
the same convention `person_details.tags` and `asset_details.tags` already use.
Sorting makes the stored value canonical, so an unchanged set is byte-identical
and never records a spurious Activity event. They are edited through the shared
DS-06 `TagsField` in a Drawer, reached from the shared overflow.

## Lifecycle: archive, delete and restore

NOTES-03 added a second, DISTINCT lifecycle state — **archive** — alongside the
existing soft-delete. They are not synonyms:

| act | canonical route | content | relationships | collection view |
| --- | --- | --- | --- | --- |
| **Archive** (`note_details.archived_at`) | still opens | kept | all kept | `?state=archived` |
| **Delete** (`entities.deleted_at`) | 404s | kept | kept | `?state=deleted` |

Archiving is an organisational act — *put this away but keep it* — and mirrors
`person_details.archived_at` / `area_details.archived_at` exactly; deleting is a
removal. Both are reversible, so Notes now run the SAME shared
`useRecordLifecycle` vocabulary as Projects, Areas, People and Assets
(ADR-053): archive gets the shared confirm-and-announce (the record leaves the
active list), delete keeps its Undo-toast path (ADR-042). An archived Note is
still **findable in global Search**, labelled "Archived" — archiving means "out
of the way", not "unfindable" — and it is still readable at its canonical route.
Archiving a Note is deliberately independent of deleting it: a Note that is both
archived and deleted appears only in the Deleted view, and restoring it returns
it to the Archived view with its archive state intact.

The rest of this section is unchanged from NOTES-01C. Its lifecycle actions are
built entirely on the **already-existing** generic `EntityRepository.softDelete`/`.restore`
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

`app/modules/notes/note-activity.ts` registers `note.content_updated` →
"Updated note content", and the manifest adds `note.tags_updated`,
`note.archived` and `note.unarchived` (NOTES-03). Every payload is
**non-sensitive by construction** — the tag event carries a COUNT, never the tag
text, mirroring how `note.content_updated` carries only `{ empty }`. Relationship
changes need no Notes-specific event: the FND-04 kernel already records
`entity_link.created` / `.unlinked` / `.restored` atomically on BOTH endpoints,
so a `[[wiki link]]` appearing or disappearing shows on both records' Timelines.
These descriptors are layered layered over the seven
kernel-reserved lifecycle defaults (`entity.created`, `entity.updated`, …),
mirroring `~/modules/goals/goal-activity.ts`'s pattern exactly. Note creation
and rename already render through the kernel defaults with no Notes-specific
work. Any unregistered type falls through to the shared safe generic
fallback — no Notes-only switch statement, no duplicated registry, no raw
payload rendering.

**Export records no Activity — a deliberate deviation.** The NOTES-05
completion brief lists "Note exported" among the events to record, and it is
**not** implemented. `GET /notes/:noteId/export` is a read: writing an Activity
row from a loader would make a GET mutating, so a browser prefetch, a retry
after a dropped connection, or a double-click would each append an event that
represents no decision the owner made. The two things such an event could be for
are both already served — DalyHub is single-owner, so "who exported" answers
nothing, and the DS-05 Timeline is a **user-facing history of what happened to
the record**, not a hidden audit log, so rows for reads would be noise on the
surface a person actually reads. Recording it properly would mean either a POST
export (breaking the download UX that deliberately avoids navigation) or a
separate audit store, which is a larger decision than this milestone owns. If a
genuine need appears — multi-user workspaces, or a compliance requirement — it
belongs with that decision rather than bolted onto a loader.

`NoteDetailsRepository` deliberately does not compute a combined "last
updated" moment (see `NOTES_PERSISTENCE.md`'s content-timestamp contract) —
`effectiveNoteUpdatedAt` (`app/modules/notes/note-view.ts`) is the one small,
pure UI-owned combination: the later of the entity's own `updatedAt` (title
changes) and `noteDetails.contentUpdatedAt` (content changes). The record
route passes this as the Activity tab's `reloadKey`, so either a rename or a
content save revalidates the Timeline in place with the new event visible
immediately — no tab switch, no page reload (mirrors ADR-037 §37.2's Project
Activity reload-key pattern).

## Export (NOTES-06)

A Note is stored as EXACT, byte-for-byte validated Markdown source (ADR-015), so
exporting it is a **serve what is stored** operation with no conversion and no
lossy step. Two formats, both reachable from the ONE shared overflow (⋯):

| Format | Body |
| --- | --- |
| **Markdown `.md`** | YAML front matter (`title`, `created`, `updated`, `tags`, `archived` when true, `source: DalyHub`), then the title as an H1, then the canonical source with its references rewritten. Headings, lists, tables, links, code fences and line endings are preserved byte-for-byte. |
| **Plain text `.txt`** | A readable header, then the shared analyser's plain-text projection: structure survives as layout (headings on their own line, `-`/`1.` list markers, tab-separated table rows, verbatim code) with no Markdown punctuation. |

**No format goes through the renderer.** Re-rendered HTML is never exported as if
it were the note, so there is no second HTML sink and the FND-08 boundary is
untouched.

**Entity links in an export.** A `[[Title]]` reference becomes
`[Label](dalyhub://type/id)` when it resolves — a real Markdown link whose
destination is an unambiguous DalyHub record reference rather than a
host-specific URL that would rot the moment the deployment moves — and plain
`Label` when it does not. Neither case leaves broken internal syntax in the file.
In `.txt` every reference collapses to its label.

**Filenames** are conservative by construction: only `[a-z0-9]` plus single
hyphens survive, bounded to 60 characters, so the name can never contain a path
separator, a control character or a quote that would break the
`Content-Disposition` header; a title with no usable characters falls back to
`note`. When another ACTIVE note in the workspace would export to the same stem,
a short **stable** suffix from the note's own id disambiguates it — the same note
always exports to the same name, and two same-titled notes never collide.

**The route is the authorisation boundary.** `GET /notes/:noteId/export` requires
an authenticated session, derives the workspace from trusted server
configuration, and requires the anchor to be an ACTIVE `note` in it — missing,
deleted, wrong-type and cross-workspace ids all fail closed with the same calm
404. An unsupported `?format=` is a typed 400. Only that one note's data crosses
the boundary.

**The UX** fetches rather than following a link, deliberately: a plain link gives
the user nothing when the export fails, whereas fetching lets a failure become a
real, ANNOUNCED error through the DS-10 Feedback platform and a success an
announced confirmation. The download is triggered from an object URL, so the
record — and any unsaved editor state — is untouched, on desktop and phone alike.
The client never invents a filename; it reads the server's
`Content-Disposition`, so the safe-filename and duplicate rules live in exactly
one place. Bulk export stays out of scope (X-04).

### Copy and print

Both live in the SAME shared overflow (⋯) as Export — there is still no
Notes-only action bar.

- **Copy Markdown / Copy plain text** fetch the SAME export route rather than
  re-serialising in the browser. That is the point: "Copy Markdown" and "Export
  as Markdown" must produce identical bytes, and the only way to guarantee it is
  one projection with one producer. It also means copied content can never carry
  hidden UI text or internal state — the client copies exactly what the server
  serialised from storage, not what the DOM happens to contain. A missing
  `navigator.clipboard` (an insecure origin, an embedded browser) is reported
  honestly rather than silently doing nothing.
- **Print** renders a print-only view, hidden on screen and revealed by
  `@media print`, so ⌘P works from ANY tab and in either editor mode. This
  matters because the writing surface is CodeMirror: printing the live editor
  prints its scroller, its decorations and its concealed markers rather than the
  note. The print body is rendered SERVER-side through the one FND-08 pipeline
  into the one sanctioned `MarkdownContent` sink — no second renderer, no second
  sink. The print stylesheet hides everything and reveals only the opt-in print
  view, rather than enumerating chrome (a list that would silently rot).

PDF generation stays out of scope — see [Deferrals](#deferrals).

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
- **The knowledge completion (NOTES-02/03/06 + PROJ-03)** adds:
  - **Pure unit** — `test/unit/markdown/note-document.test.ts` (the ONE analyser:
    references extracted with aliases and order; a reference inside a fenced or
    inline code block, or inside an existing link, is NEVER a relationship;
    malformed occurrences yield nothing; duplicates collapse to one distinct
    target; headings extracted with level and as plain text; the heading an
    offset sits under; plain text renders structure as layout with no Markdown
    punctuation and drops raw HTML; excerpts are bounded, deterministic, block-
    scoped and syntax-free; export rewrites a resolvable reference to
    `dalyhub://…`, degrades an unresolvable one to readable text, collapses to
    labels in text mode, and leaves the rest of the source byte-for-byte
    untouched including inside code fences).
    `test/unit/notes/note-organisation.test.ts` (tag normalisation, case-variant
    de-duplication, canonical sort ordering, bounds, both wire forms, and the
    cursor's scope binding — a cursor is rejected under a different workspace,
    state, query, tag, project, area, link filter OR sort, and a tampered cursor
    is rejected rather than repaired). `test/unit/notes/note-export.test.ts`
    (safe filename stems including path-escape attempts, the fallback name, the
    length bound, stable disambiguation, front matter, verbatim body
    preservation, reference rewriting, YAML escaping, "never emits HTML", and
    the client's `Content-Disposition` parsing).
  - **Component** — `test/unit/references/references.test.tsx` (relationship
    labels including the readable fallback for an unknown module-owned type,
    first-seen grouping, and the row's accessibility contract: type,
    relationship and archive state in WORDS, a named list, a real link) and
    `test/unit/notes/notes-knowledge-ui.test.tsx` (the filter form's labelled
    native controls, the three-state segment, state carried through the form,
    Clear only when set; the two DISTINCT link tabs and their empty states; the
    Project Knowledge tab's unlink-worded remove, archived flag, read-only
    project, and empty state).
  - **Workers/D1 integration** — `test/kernel/notes-knowledge.test.ts` (59
    cases through the REAL loaders/actions): full-content search by title, body,
    heading and tag with the match source and heading reported; readable
    excerpts; deleted always excluded and archived only on request; workspace
    isolation; determinism, bounds, LIKE-metacharacter literalness and an
    over-long query; the registry-discovered provider's result shape; every
    collection filter and their non-leaking lifecycle views; recency ordering by
    the EFFECTIVE updated moment; tag/archive idempotency, payload minimalism,
    typed validation errors and fail-closed anchors; archive vs delete as
    distinct states; wiki-link reconciliation (one link per duplicate, none from
    a code block, unlink on removal, restore-in-place on re-add, survival of a
    rename, self- and cross-workspace references ignored, idempotency);
    backlinks from every module with block-bounded context, hidden-on-delete and
    restored, archived-source flagging, structural links excluded, both
    directions server-rendered, and an N+1-free page; Project Knowledge
    add/create/remove with no duplicate association, restoration of the same
    association, archived shown and deleted hidden, notes-only listing and
    picker search, and fail-closed anchors; and export's headers, formats,
    reference rewriting, filename disambiguation, format rejection and
    fail-closed authorisation.
  - **Playwright E2E** — `e2e/notes-knowledge.spec.ts`: a `[[wiki link]]`
    becoming a real backlink with the mentioning sentence and a working open
    action; a plain title mention and a code block creating nothing; global
    Search finding a note by its BODY; the collection's search/tag/archived
    filters with the URL carrying them and an archived note keeping its route;
    the filter form driven by keyboard; `.md` and `.txt` export with real
    downloads, announced success and no navigation; the Project Knowledge
    add → open → unlink journey proving the note survives; creating a note from
    a Project keeping the relationship; a 390px/320px phone pass (readable
    tables and code, 44px targets, axe, no horizontal overflow, export from the
    phone overflow); and axe over both relationship tabs in light and dark.

## Deferrals

Explicitly out of scope for this module, left to later roadmap items (see
`ROADMAP_V2.md`):

- **X-04 — whole-workspace export.** Single-Note `.md`/`.txt` export shipped
  with NOTES-06 (see [Export](#export-notes-06)); the bulk/portable
  whole-workspace export is still X-04, and should generalise the same contract.
- **Folder hierarchy.** Tags are the organisation model; nested folders are
  deliberately not built.
- **Aliases.** A Note has one title. Alias search is not supported (a
  `[[Title|Alias]]` alias is display text, not a second title).
- **Backlink context for non-Note sources.** Context is extracted for note
  sources only; a Task, Diary entry or Meeting backlink shows its relationship
  name instead. The batched shape extends to them without redesign.
- **PDF / printable export.** Deliberately not built: every shipped format
  serves the stored source, and a PDF would be the first *rendered* export. It
  belongs with X-04, reusing the FND-08 renderer.
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
- **Full-text search infrastructure.** The D1-native LIKE/`instr`/`substr`
  strategy is a documented trade-off, not an oversight — see
  [`SHARED_SEARCH.md`](SHARED_SEARCH.md) and ADR-054 §7.
- Attachments, Diary integration, note transclusion, a graph view, collaborative
  editing, public sharing, and AI features (summaries, semantic/vector search,
  automatic relationship inference from arbitrary text).

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

## Status (2026-07-28 — the knowledge completion)

**Current status.** Notes is now a complete knowledge module rather than a
markdown record type. [NOTES-01A](../roadmap/ROADMAP_V2.md#-notes-01a--notes-persistence-and-domain-foundation)/[01B](../roadmap/ROADMAP_V2.md#-notes-01b--notes-collection-and-canonical-markdown-record)/[01C](../roadmap/ROADMAP_V2.md#-notes-01c--notes-autosave-lifecycle--editor-polish),
[NOTES-02](../roadmap/ROADMAP_V2.md#-notes-02--linking--backlinks),
[NOTES-03](../roadmap/ROADMAP_V2.md#-notes-03--organisation--search),
[NOTES-04](../roadmap/ROADMAP_V2.md#-notes-04--mobile),
[NOTES-05](../roadmap/ROADMAP_V2.md#-notes-05--writing-first-markdown-editor) and
[NOTES-06](../roadmap/ROADMAP_V2.md#-notes-06--note-export-and-portability) are ☑,
as is [PROJ-03](../roadmap/ROADMAP_V2.md#-proj-03--knowledge).

**Delivered capabilities.** Creation, editing and dependable autosave with honest
offline/retry states; the writing-first CodeMirror 6 live editor whose document
**is** the Markdown source byte-for-byte; the shared FND-08 pipeline as the sole
renderer and `MarkdownContent` as the sole HTML sink; **`[[Wiki Links]]` that
create real, typed, stable-id EntityLinks**; **Backlinks and Outgoing Links as
two distinct surfaces with bounded context**; **full-content global Search over
title, body, headings and tags**, with commands in the palette; **tags, archive,
and Project/Area/link/recency filters**; **single-Note `.md`/`.txt` export**; the
**Project Knowledge tab**; and mobile ergonomics throughout.

**The canonical-source architecture is preserved and must stay that way.** A Note
is stored as exact, validated `MarkdownSource` ([ADR-015](../decisions/ARCHITECTURE_DECISIONS.md#adr-015-markdown-source-and-safe-rendering-pipeline));
rendering always goes through the one sanitising pipeline; the editor is an
*authoring surface*, never a second representation. Search reads that same
source; export SERVES that same source; nothing here introduced a derived copy.

**The knowledge completion (2026-08-01)** added the last four capabilities the
completion brief called for, all on the existing contracts:
**`dalyhub://` record links** (id-stable internal links, an editor picker, a
resolver that presents a broken target honestly, and the closed export round
trip); **backlink count, module-family grouping and a module filter**;
**autosave reconciliation** closing [DEBT-47](../product/PRODUCT_DEBT.md); and
**Copy Markdown / Copy plain text / Print**. No migration, no schema change and
no new relationship type — record links reuse `note.references`. See
[ADR-064](../decisions/ARCHITECTURE_DECISIONS.md#adr-064-the-dalyhub-record-link-and-a-reconciliation-contract-for-autosave).

**Known limitations (all deliberate and documented).**

- **Two internal link syntaxes now exist.** `[[Wiki Links]]` resolve by title
  (fast while writing prose); `dalyhub://` record links resolve by id (exact when
  the record matters). Both produce the same relationship, so a backlink cannot
  tell you which was used — but a reader of the SOURCE has two forms to
  recognise. Help explains when to reach for each.
- **Reconciliation is opt-in per field.** Only the Note body passes
  `serverValue` today, so DEBT-47's shape remains for the other autosave
  surfaces until each adopts the contract.
- **Export is not recorded in Activity**, deliberately — see
  [Activity](#activity) for the reasoning.
- **Record-link resolution is per-navigation.** Following a record link is one
  `getById`; there is no batched pre-resolution, so a note full of record links
  does not show its broken ones until each is followed. The Links tab does show
  the resolved set, which is where a reader looks for that answer.
- **Backlink context is note-source only.** Other source types show their
  relationship name. See [Context](#context).
- **Reference reconciliation is best-effort.** It runs after the content write
  and never fails the save, so a transient failure leaves the reference set stale
  until the next save.
- **Search is a bounded LIKE scan, not FTS5.** A leading-wildcard LIKE cannot use
  an index; the candidate set is narrowed by workspace + type + active first, and
  a query longer than D1's 50-byte LIKE-pattern limit degrades to matching its
  opening characters rather than erroring. ADR-054 §7, [`SHARED_SEARCH.md`](SHARED_SEARCH.md).
- **Case folding is SQLite's, i.e. ASCII-only**, in both the LIKE match and the
  excerpt offsets — consistent with every other DalyHub search.
- **Tag and archive changes do not advance the content timestamp**, so they do
  not reorder the `recent` view. A Note whose FIRST-EVER `note_details` row is
  created by a tag or archive change gets that moment as its content timestamp,
  representing its empty content.
- **Title resolution prefers a Note, then the earliest-created record**, when
  several records share a title. Renaming a target leaves the referring note's
  prose reading the old title — the relationship survives; the words are the
  user's and are never rewritten.
- Rendered GFM task-list checkboxes have no accessible label — a shared pipeline
  concern, [DEBT-26](../product/PRODUCT_DEBT.md#-debt-26--rendered-gfm-task-list-checkboxes-have-no-accessible-label--p3).

**Deferred work.** Whole-workspace export ([X-04](../roadmap/ROADMAP_V2.md#-x-04--export--data-portability)),
a printable/PDF render, folder hierarchy, aliases, attachments, a graph view and
note transclusion — see [Deferrals](#deferrals).

**Relevant roadmap items.** [NOTES-01A/01B/01C](../roadmap/ROADMAP_V2.md#-notes-01a--notes-persistence-and-domain-foundation) ☑ ·
[NOTES-02](../roadmap/ROADMAP_V2.md#-notes-02--linking--backlinks) ☑ ·
[NOTES-03](../roadmap/ROADMAP_V2.md#-notes-03--organisation--search) ☑ ·
[NOTES-04](../roadmap/ROADMAP_V2.md#-notes-04--mobile) ☑ ·
[NOTES-05](../roadmap/ROADMAP_V2.md#-notes-05--writing-first-markdown-editor) ☑ ·
[NOTES-06](../roadmap/ROADMAP_V2.md#-notes-06--note-export-and-portability) ☑ ·
[REL-01](../roadmap/ROADMAP_V2.md#-rel-01--universal-relationship-system-shared-linked-items) ☑ ·
[PROJ-03](../roadmap/ROADMAP_V2.md#-proj-03--knowledge) ☑.

**Relevant product-debt items.** [DEBT-39](../product/PRODUCT_DEBT.md#-debt-39--wiki-links-create-no-entitylink-and-the-resolver-scans-the-whole-workspace--p2) ☑ ·
[DEBT-36](../product/PRODUCT_DEBT.md#-debt-36--global-search-coverage-is-incomplete-several-shipped-modules-register-no-provider--p2) ☑ ·
[DEBT-17](../product/PRODUCT_DEBT.md#-debt-17--today-search-provider-is-fixture-backed-not-over-real-records--p1) ☑ ·
[DEBT-08](../product/PRODUCT_DEBT.md#-debt-08--ad-hoc-cross-entity-links--p2) ·
[DEBT-26](../product/PRODUCT_DEBT.md#-debt-26--rendered-gfm-task-list-checkboxes-have-no-accessible-label--p3).

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

## Phone writing surface (MOBILE-01)

NOTES-04 and NOTES-05 already delivered the writing-first phone editor: a single
horizontally-scrolling toolbar row (never several wrapped rows eating the writing
space), no split preview on a phone (a Read/Write toggle instead), one canonical
editor over one Markdown source, 44px targets, and a `role="toolbar"` with roving
tabindex that is exactly ONE Tab stop. MOBILE-01 changes one thing.

### Common formatting directly, the rest behind More

Eleven permanently-visible commands is chrome that costs a phone the rows it needs
for writing — and it makes the FREQUENT commands harder to reach, not easier,
because each one sits further along a scrolling row. The catalogue
(`formatting-actions.ts`) therefore marks six actions `primary`:

> Heading · Bold · Italic · Bullets · Checklist · Link

Numbered, Quote, Code, Code block and Table appear when **More** is expanded.

Crucially the secondary actions stay **inside the same toolbar** rather than
moving into a menu:

- the row remains exactly **one Tab stop**, and Arrow/Home/End move across
  everything currently on screen — the DS-11 baseline for a command-button row is
  preserved, not traded for a second focus surface;
- "More" is an ordinary toolbar button carrying `aria-expanded`;
- nothing is unreachable — every command is one tap away.

Pointer press is still prevented on every control, so a formatting tap never
dismisses the phone keyboard or loses the caret and selection.

### Capture into the canonical editor

The shared Quick Capture sheet's Note panel creates the Note through
`POST /notes/new` and, if an opening line was typed, writes it through the note's
OWN `update_content` mutation — the same authority the editor autosaves through —
then hands off to `/notes/:id`. There is no second simplified note store, and if
the opening line fails to save the panel says so honestly rather than discarding
the words.
