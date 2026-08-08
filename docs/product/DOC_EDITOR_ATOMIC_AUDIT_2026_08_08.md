# Editor, atomicity and dead-code audit — 8 August 2026

> The implementation audit taken **before** any code changed for DOC-EDITOR-01,
> AUDIT-13 and AUDIT-16, and the record of what was decided as a result. It grades
> the repository by what is on `main`, not by what the roadmap claims.
>
> **Base commit.** `6e5860ee0cabf1ba7b3acaacdff85925cce22a93`
> (`AUDIT-08: refuse a malformed content precondition instead of dropping it (#138)`),
> with `main` and `origin/main` both at that commit, verified.

---

## 1. What the three items actually needed, on that commit

The prompt asked for three things. Two of them turned out to be smaller than the
brief assumed, and one of them turned out to be exactly as described.

| Item | What the brief expected | What `main` actually had |
|---|---|---|
| **DOC-EDITOR-01** | Consolidate Notes and Meetings onto a shared editor shell | Already done, by [ADR-076](../decisions/ARCHITECTURE_DECISIONS.md) / [ADR-078](../decisions/ARCHITECTURE_DECISIONS.md) under different item numbers. The item is marked `⊘ superseded, re-checked 2026-08-08` in [`ROADMAP_V2_1.md`](../roadmap/ROADMAP_V2_1.md), and that re-check was accurate. What remained was a SECOND long-form control with no product consumer, and a never-adopted third — both recorded as debt, both still shipping. |
| **AUDIT-13** | Correct the remaining non-atomic compound mutations | Exactly as the audit described. Two flows, both real, both untested. |
| **AUDIT-16** | Remove confirmed dead/superseded/duplicate code | Three of the four named artefacts were genuinely dead or duplicate. The fourth was neither, and is documented below rather than deleted. |

---

## 2. DOC-EDITOR-01 — every long-form and formatted-text surface

### 2.1 The editing engine (one, already)

`app/shared/markdown-editor` is the only writing engine. Everything below composes
it; nothing else imports CodeMirror.

| Piece | File |
|---|---|
| The writing surface | `LiveMarkdownEditor.tsx` |
| Its field-anatomy wrapper | `MarkdownEditorField.tsx` |
| The one toolbar | `EditorToolbar.tsx` |
| The one formatting catalogue | `formatting-actions.ts` |
| Pure Markdown-source transforms | `markdown-transforms.ts`, `table-source.ts` |
| Active-state derivation | `formatting-state.ts` |
| Keyboard shortcuts | `editor-keymap.ts`, `editor-setup.ts` |
| Live styling of the source | `live-decorations.ts`, `live-preview.ts`, `widgets.ts` |
| Record-link insertion | `RecordLinkPicker.tsx` |
| Chrome | `app/styles/markdown-editor.css` |

There is **one** Markdown renderer (`~/platform/markdown` → `renderMarkdown`), **one**
React HTML sink (`MarkdownContent`), and a repository test that fails if a second
`dangerouslySetInnerHTML` appears anywhere. None of that changed.

### 2.2 The long-form CONTROLS — where the duplication actually was

| Control | Product consumers on `main` | Verdict |
|---|---|---|
| `LiveMarkdownEditor` (directly) | Notes body, Meeting agenda, Meeting notes, Review record sections, guided Review prompts | **Canonical.** |
| `MarkdownEditorField` (the field wrapper) | Diary entry panel, Diary capture, Task description | **Canonical.** |
| `MarkdownField` (`~/shared/forms`) | **None.** One importer: the dev-only `/design/forms` fixture that documents it. | **Superseded** — recorded as [DEBT-101]. Deleted. |
| `InlineMarkdownField` (`~/shared/inline-edit`) | **None, ever.** Exported from the barrel; referenced only by the Design System and by a sibling's comments. | **Never adopted** — the migration half of [DEBT-97]. Deleted. |

That is the whole of the editor duplication, and it is a smaller finding than "two
editor engines". Two shared controls with no product consumer are a trap rather
than a defect on screen: the next module that needs a Markdown field finds one in
the `~/shared/forms` barrel and re-opens the divergence EDIT-02 closed.

### 2.3 Classification of every editable long-form / multiline surface

The categories are [EDITING_CONSISTENCY_AUDIT_2026_08](EDITING_CONSISTENCY_AUDIT_2026_08.md)'s.
**A** = short inline value, **D** = long-form Markdown, **plain** = multiline text
where formatting genuinely provides nothing, **E** = a form.

| Surface | Field | Category | Control | Save semantics |
|---|---|---|---|---|
| Notes | Body | D | `LiveMarkdownEditor` | Autosave (1500 ms debounce) + version precondition |
| Meetings | Agenda | D | `LiveMarkdownEditor` | Autosave (1200 ms) |
| Meetings | Notes | D | `LiveMarkdownEditor` | Autosave (1200 ms) |
| Meetings | Items (agenda/decision/outcome/action) | plain | one-line `dh-input` + Add | Explicit submit per item |
| Diary | Body (entry panel) | D | `MarkdownEditorField` | Explicit **Save changes** + dirty guard |
| Diary | Body (capture) | D | `MarkdownEditorField` | Explicit submit |
| Tasks | Description | D | `MarkdownEditorField` | Explicit **Save changes** (in the Details form) |
| Reviews | Record sections | D | `LiveMarkdownEditor` | Blur + explicit Save, with a version precondition |
| Reviews | Guided prompts | D | `LiveMarkdownEditor` (`compact`) | Blur + explicit Save, with a version precondition |
| Goals | Definition of done | plain | `InlineTextField multiline` | Inline, ⌘/Ctrl+Enter |
| People | Notes | plain | `TextField multiline` | Explicit form (E — multi-field contact block) |
| Assets | Description, notes, obligation/event notes | plain | `TextField multiline` | Explicit forms (E — real validation dependencies) |
| AI | Prompt / extraction review textareas | plain | raw `<textarea>` | Not a stored document; a transient proposal input |
| Areas, Projects | *(no description field exists)* | — | — | [DEBT-98], unchanged |

**Nothing was forced onto the document editor.** A Goal's definition of done, a
Person's notes and an Asset's description are plain multiline text: they are not
stored as Markdown, and offering a formatting toolbar over a column that cannot
hold the syntax is a control that silently does nothing.

### 2.4 The one thing that was genuinely missing

Deleting `InlineMarkdownField` would have deleted the only long-form surface that
offered **⌘/Ctrl+Enter to save**. Every explicit-save long-form surface needs a
keyboard path to its Save that is not plain Enter (Enter is a paragraph), and only
Diary capture had one — via a container-level listener, which also meant
CodeMirror's default `Mod-Enter` (insert blank line) fired alongside it.

So the shortcut moved INTO the shared writing surface, on both the live editor and
the SSR/no-JS fallback, and every explicit-save host now passes its submit. An
autosaving surface passes nothing, because a shortcut that appears to do something
and does not is worse than no shortcut.

### 2.5 What was already correct and was deliberately not touched

- **Markdown stays canonical.** The editor's document IS the source, byte for byte
  ([ADR-006](../decisions/ARCHITECTURE_DECISIONS.md), [ADR-015](../decisions/ARCHITECTURE_DECISIONS.md), [ADR-044](../decisions/ARCHITECTURE_DECISIONS.md)). No HTML persistence, no ProseMirror/Lexical/Slate JSON, no migration.
- **The writing measure.** PR #127 already fixed the "narrow column adrift in a wide
  surface" defect: the surface takes the width it has, the 90ch cap falls AFTER the
  text, and `e2e/editor-geometry.spec.ts` measures the left content edge at 390 /
  1024 / 1280 / 1440 px. Re-verified, not redone.
- **Per-module persistence.** A Note autosaves, a Diary entry saves explicitly, a
  Review prompt quotes a version. [ADR-078](../decisions/ARCHITECTURE_DECISIONS.md) decision 4 made that difference
  deliberate — *presentation converges, persistence does not* — and consolidating
  it would mean giving three modules one save strategy.
- **Notes concurrency (PR #134 / AUDIT-08).** Note saves still quote the version
  they were written against and still surface a stale save through the shared
  `RemoteChangeBanner` with the draft untouched. The editor never learned about
  versions; the domain still provides its own contract.

---

## 3. AUDIT-13 — the two non-atomic compound mutations, traced

### 3.1 Meeting item → Task

```text
UI    MeetingFollowUp.tsx "Create task" → the follow-up dialog
route POST /meeting/:meetingId/follow-up  (intent=convert_item)
svc   app/platform/meetings/follow-up-operations.ts → convertMeetingItemToTask
repo  scope.tasks.createTask                              ← transaction 1
      scope.tasks.updateTask({status})       (optional)   ← transaction 2
      scope.tasks.updateTask({description})  (optional)   ← transaction 3
      scope.meetings.linkFollowUpTask        "commit point" ← transaction 4
      scope.entityLinks.create               post-commit  ← transaction 5
      …with scope.spine.softDelete(task) compensating on any failure after 1
D1    entities · spine_records · entity_links · task_details ·
      meeting_item_tasks · activities · activity_subjects
```

**Where partial success could occur.** Between transaction 1 and transaction 4. The
compensation covered a THROWN failure; it could not cover the process not being
there to run it. A Task committed without its mapping is invisible to the
mapping-backed Follow-up surface, so the owner sees an unconverted item, retries,
and gets a **second Task**. The code said so in its own header comment — a
documented, untested residual window.

Activity was truthful here: the `meeting.item_converted_to_task` event was inside
the commit-point batch and guarded on the mapping insert.

### 3.2 Asset obligation → linked Task completion

```text
UI    AssetCompleteObligationForm → POST /assets/:assetId/mutate
svc   scope.assetHistory.completeObligation
repo  taskGateway.completeTask(current.taskId)   ← transaction 1 (the Task closes)
      db.batch([closeObligation, activity, insertEvent, successor?, facts?])
                                                 ← transaction 2
D1    entities · spine_records · task_details · entity_links ·
      asset_obligations · asset_events · asset_details · activities
```

**Where partial success could occur.** Any failure in transaction 2 left a Task
ticked off against an obligation that was still open — and the obligation is the
record of whether the work happened.

**A second, separate defect on the same path.** The gateway call was wrapped in
`catch { taskOutcome = "already_closed" }`. A genuine storage failure, a validation
error and an actually-already-closed Task were all recorded as `already_closed` in
the `asset.obligation_completed` Activity payload. The event asserted something the
system had not established.

### 3.3 Adjacent compound writes: the same CLASS, outside AUDIT-13's scope

Found while tracing, recorded rather than swept, because the brief is explicit that
AUDIT-13 means the flows the audit named and not everything shaped like them:

| Flow | Shape | Verdict |
|---|---|---|
| AI: accept an unsourced Task (`applyUnsourcedTask`) | was `createTask` + `updateTask({description})` | **Fixed here**, because `createTask` now takes a description. It has no relationship to write afterwards, so accepting an unsourced Task is atomic outright, with nothing to compensate. |
| AI: accept a Task proposed from a Note (`applyNoteTask`) | was `createTask` + `updateTask({description})` + `entityLinks.create`, compensating | **Partly fixed**: the description transaction is gone, so an invalid one now fails before anything is written instead of being compensated. The link still follows, still compensated. |
| AI: accept a Task proposed from a Meeting (`applyMeetingTask`) | find-or-create the action item, then convert | **Fixed in review**: it was the one acceptance path not wrapped in the file's own `guarded` replay claim, so two SIMULTANEOUS accepts each created their own action item, each got a different item id, and the conversion's `(workspace_id, item_id)` index could not arbitrate — two Tasks for one approved proposal. Now claimed on the same deterministic acceptance key the Note and unsourced paths use. |
| Quick capture with a context (`/tasks` `new`) | `createTask` + `applyCaptureRelationship`, compensating | **Untouched.** |
| Create a Task for an obligation (`/assets/:id/history`) | `createTask` + `linkObligationTask` + `entityLinks.create` | **Untouched.** |

The last two are honest compensating sagas with the same residual shape AUDIT-13
described, and neither is an AUDIT-13 finding. Making them atomic is the same
technique this PR establishes ([ADR-083](../decisions/ARCHITECTURE_DECISIONS.md)) applied to two more flows — which is a
follow-up, not a rider on this one.

### 3.4 What was checked and found already atomic

Traced and left alone, because they are already one guarded batch with their
Activity inside it: task completion + waiting clearance + recurrence successor,
bulk completion, task create, meeting `addItem`/`removeItem`/`markHeld`, Area /
asset / review permanent delete, note content save, preference patches, review
section save. The audit's own §10 verdict — "atomicity discipline is generally
excellent" — held up.

---

## 4. AUDIT-16 — the exact finding, classified

The audit named four artefacts. The brief's classification is *confirmed dead*,
*superseded*, *duplicate* (all deletable) and *dormant but intentional* (not).

| Artefact | Classification | Evidence | Action |
|---|---|---|---|
| `app/shared/shell/ModulePlaceholder.tsx` | **Superseded** by `ModuleComingSoon.tsx` | No production importer. Exported from the shell barrel; the only reader was `test/unit/shell/AppShell.test.tsx`, using it as "something with a Pane Header". `DESIGN_SYSTEM.md` claimed `/tasks` still used it — it does not. | Deleted |
| `app/modules/notes/use-online-status.ts` | **Duplicate** of `app/shared/linked-items/use-online-status.ts` | Byte-identical implementations. The shared file's own header says it was promoted FROM the Notes copy, which was never removed. | Deleted; Notes imports the shared one |
| `app/modules/projects/NewTaskForm.tsx` vs `app/modules/tasks/NewTaskForm.tsx` | **Neither dead nor duplicate** | Both have real callers. The Projects form posts a title alone to `/projects/:projectId/mutate` and the SERVER binds the parent, so a client cannot retarget the Task; the Tasks form posts a client-chosen parent to `/tasks`, re-verified there, plus six planning fields and quick-capture parsing. Same name, different trust boundaries. | **Retained**, renamed `NewProjectTaskForm` so the collision is gone |
| Entity-type "split brain" (kernel `string` vs the hand-maintained enum) | **Dormant but intentional** | [ADR-013](../decisions/ARCHITECTURE_DECISIONS.md) §4.6: the kernel deliberately does not close the entity-type set. | Untouched |

### Made obsolete by this PR, and therefore also deleted

- `app/shared/forms/MarkdownField.tsx` and its barrel export ([DEBT-101]).
- `app/shared/inline-edit/InlineMarkdownField.tsx` and its exports ([DEBT-97]).
- `test/unit/forms/markdown-field.test.tsx` — it tested only the deleted control.
- `MeetingRepository.linkFollowUpTask` — the public API that permitted the
  two-transaction conversion, and `ObligationTaskGateway.completeTask`, the one that
  permitted the two-transaction completion. A stale mutation API is not harmless
  dead code: it keeps an old integrity path callable indefinitely.
- Dead CSS: `.dh-input--markdown`, the whole `.dh-markdown-field__*` block, and the
  deleted control's members in three shared selector groups in `forms.css`. Each
  was checked against every production component, every test fixture, and every
  dynamic class construction before removal.

### Deliberately NOT swept

No global CSS purge, no unrelated module cleanup, and none of the other open debt
items that happen to sit nearby ([DEBT-99] hand-rolled state layers, [DEBT-103] the
Activity endpoint with no UI consumer, [DEBT-104] `/today/plan` with no caller).
They are real, they are recorded, and they are not these three items.

---

## 5. Decisions taken

1. **Long-form Markdown in DalyHub is edited on a permanent shared writing
   surface.** Reading is the editor's own Read toggle (or the host's rendered
   view). There is no read-then-activate variant for long-form, which is why the
   component built for one is deleted rather than kept unused. This closes
   [DEBT-97] by decision, which the entry itself named as one of its two valid
   closing conditions. Recorded as [ADR-084](../decisions/ARCHITECTURE_DECISIONS.md).
2. **A compound domain mutation is ONE storage transaction, composed from the
   owning repositories' own statements.** Not a saga with compensation, and not a
   second copy of anybody's SQL. Recorded as [ADR-083](../decisions/ARCHITECTURE_DECISIONS.md).
3. **Two low-level mutation APIs are removed rather than deprecated**, because
   either of them lets a caller reconstruct the flow that was just made atomic.

---

## 6. Related documents

- [`END_TO_END_AUDIT_2026_08_05.md`](END_TO_END_AUDIT_2026_08_05.md) — the audit that raised AUDIT-13 and AUDIT-16. Kept as the historical record; its findings are not rewritten.
- [`EDITING_CONSISTENCY_AUDIT_2026_08.md`](EDITING_CONSISTENCY_AUDIT_2026_08.md) — the EDIT-02 classification this audit extends.
- [`PRODUCT_DEBT.md`](PRODUCT_DEBT.md) — DEBT-87, DEBT-88 §3, DEBT-97, DEBT-101.
- [`ROADMAP_V2_1.md`](../roadmap/ROADMAP_V2_1.md) — AUDIT-FIX-07 and the DOC-EDITOR-01 entry.

[DEBT-87]: PRODUCT_DEBT.md
[DEBT-97]: PRODUCT_DEBT.md
[DEBT-98]: PRODUCT_DEBT.md
[DEBT-99]: PRODUCT_DEBT.md
[DEBT-101]: PRODUCT_DEBT.md
[DEBT-103]: PRODUCT_DEBT.md
[DEBT-104]: PRODUCT_DEBT.md
