# Editing consistency audit — August 2026 (EDIT-02)

> **Scope.** Every editable value in DalyHub, classified, with the interaction it
> uses today and the interaction it uses after EDIT-02. This is the audit
> [`ROADMAP_V2_1.md`](../roadmap/ROADMAP_V2_1.md) asked for before adoption, and
> the record of what was deliberately **not** moved.
>
> **The rule being applied.** When the same *type* of information is edited in
> different modules, the interaction should feel the same — unless the data or
> the safety model genuinely requires a different workflow. The shared system is
> [`app/shared/inline-edit`](../../app/shared/inline-edit) (DS-16) and
> [`app/shared/markdown-editor`](../../app/shared/markdown-editor) (EDIT-01);
> nothing here introduces a new one.

---

## 1. The classification

Every editable field falls into one of five categories. The category decides the
interaction — not the module.

| Category | What it is | The one interaction |
|---|---|---|
| **A** Simple inline text | a record title/name, a short value | `InlineTextField` — activate the value, Enter saves, Escape cancels, blur saves |
| **B** Simple selectable metadata | status, priority, a small closed vocabulary | `InlineSelectField` — an anchored menu button; choosing saves immediately |
| **C** Dates | due, target, scheduled, review | `InlineDateField` — an anchored dialog around a native date input, with Clear where the model allows it |
| **D** Long-form text | Note bodies, Diary entries, Meeting notes, descriptions | the shared writing surface (`LiveMarkdownEditor`), directly or in a form via `MarkdownEditorField`. *(This row said "inline via `InlineMarkdownField`" until 2026-08-08. Nothing ever adopted that field, and [ADR-084](../decisions/ARCHITECTURE_DECISIONS.md#adr-084-long-form-markdown-is-edited-on-a-permanent-shared-writing-surface--there-is-no-read-then-activate-variant) settled it: long-form is editor-first, there is no read-then-activate variant, and the field is deleted.)* |
| **E** Complex forms | multi-field configuration, interdependent validation, destructive workflow | stays a **form**. Category E is never converted. |

The two boundary rules that decide the hard cases:

- **A field is category E when its fields constrain each other.** A Meeting's
  start, end and timezone are one decision; a Task's delegation is a subject, two
  dates and a note that only make sense together; a recurrence rule needs an
  anchor date to exist. Editing those one value at a time lets a user build a
  half-valid record one refused save at a time.
- **Markdown editing is for fields that STORE Markdown.** Offering a formatting
  toolbar over a plain-text column is a control that silently does nothing —
  the same defect as an underline button over CommonMark (see
  [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md#shared-writing-surface-edit-01)).

---

## 2. Module-by-module

Legend: **✅ moved** in this work · **➖ already** on the shared pattern ·
**⏸️ deliberately unchanged**, with the reason.

### Today
Today is a dashboard over other records; it edits nothing of its own. Every task
it opens goes through the shared Task record Drawer, so it inherits the Task row
below. ⏸️ (out of scope — no Today redesign.)

### Areas
| Field | Cat | Before | After |
|---|---|---|---|
| Name | A | ➖ inline heading (PR #124) | unchanged |
| Icon | E | Settings tab picker | ⏸️ a picker over a catalogue, not a value |
| Archive / restore / delete | E | Settings + overflow | ⏸️ lifecycle |

### Goals
| Field | Cat | Before | After |
|---|---|---|---|
| Name | A | **Rename** action → Drawer form | ✅ inline heading |
| Target date | C | **Edit details** → Drawer form | ✅ `InlineDateField`, focused `set_target_date` |
| Definition of done | A (multiline plain text) | same Drawer form | ✅ `InlineTextField multiline`, focused `set_definition_of_done` |
| Complete / reopen, delete | E | primary action + overflow | ⏸️ lifecycle |

Both Drawer forms are deleted. The `update_details` intent stays for anything
that genuinely wants to write both fields at once; the record itself uses the
focused intents, so changing the date can no longer revert the definition.

### Projects
| Field | Cat | Before | After |
|---|---|---|---|
| Name | A | ➖ inline heading (PR #124) | unchanged; the orphaned `?drawer=rename` form is deleted |
| Workflow status | B | Settings tab, shared `SelectField`, immediate | ⏸️ **see below** |
| Area / Goal (parent) | B | Settings tab, searchable `SelectField`, immediate | ⏸️ **see below** |
| Archive / restore | E | Settings + overflow | ⏸️ lifecycle |

**Why the Project's two selects stay in Settings.** They are already immediate,
already on the shared control, and already support `current → new` in one action
(PR #124 fixed the clear-before-replace defect in `SelectField` itself). Adding a
second inline copy on the record would create exactly the duplication §7 of the
brief asks us to remove, and *moving* them would strip the explanation that makes
"Workflow status" and "moving a Project under a different Goal" understandable.
The interaction is consistent; only its *location* differs, and that location is
a deliberate DS-10b settings surface.

### Tasks
| Field | Cat | Before | After |
|---|---|---|---|
| Title | A | Details form (`Edit details` → 12 fields → Save changes) | ✅ inline heading, focused `rename` |
| Priority | B | Details form, or a `<select>` on another surface, with `No priority` as an option | ✅ `InlineSelectField`, real values only, separated **Clear priority** |
| Due date | C | Details form only | ✅ `InlineDateField` in the Planning section |
| Scheduled date | C | quick actions (Today/Tomorrow/Next week) + a custom picker | ✅ same quick actions **plus** `InlineDateField`, so an arbitrary date is one action |
| Status, Time Sector, Commitment | B | Details form | ⏸️ kept in the form for now — they sit beside delegation and recurrence, and the form is where those interact |
| Delegation (4 fields) | E | Details form | ⏸️ interdependent |
| Recurrence | E | quick-edit panel, with a custom-rule sentinel | ⏸️ a scheduling rule, explicitly out of scope for a tiny inline control |
| Description | D | `MarkdownField` (textarea + preview link) | ✅ shared writing surface via `MarkdownEditorField` |

The Details form **stopped carrying** title, priority and both dates, and
`handleUpdate` now treats an absent key as *unchanged*. Without that, pressing
Save changes could revert an inline edit made while the form was open.

### Notes
Notes are the reference record, and were the furthest from it.

| Field | Cat | Before | After |
|---|---|---|---|
| Title | A | **Rename** action → Drawer form (which discarded the draft on close) | ✅ inline heading |
| Body | D | ➖ shared writing surface (NOTES-05) | unchanged |
| Tags | E | overflow → Drawer form | ⏸️ a multi-value control with its own parsing/normalisation |
| Archive, delete, export, print | E | one shared overflow | ⏸️ lifecycle and actions, not values |

### Diary
| Field | Cat | Before | After |
|---|---|---|---|
| Body (entry panel) | D | `MarkdownField` — a textarea with a "Show preview" link | ✅ shared writing surface, **same explicit Save changes** (and, since DOC-EDITOR-01, ⌘/Ctrl+Enter reaches that Save from inside the text) |
| Body (capture) | D | same textarea | ✅ shared writing surface, **same submit** |
| Title, type, when | A/B/C | explicit-save form fields | ⏸️ day-scoped Diary behaviour and the split-ownership save (ADR-041) are untouched |

Presentation converged; persistence did not. This is the §6 case the brief calls
out, and the reason `MarkdownEditorField` exists.

### Meetings
| Field | Cat | Before | After |
|---|---|---|---|
| Title | A | "Edit details" disclosure form | ✅ inline heading, patching `title` alone |
| Agenda / Notes | D | ➖ shared writing surface | unchanged |
| Start / end / timezone / location / mode / link | E | disclosure form | ⏸️ interdependent scheduling |
| Attendees, items, mark-held, follow-ups | E | their own workflows | ⏸️ untouched — meeting-specific workflow is explicitly out of scope |

Removing `title` from the disclosure form also fixed a live defect: that form
posted the title it captured at mount, so pressing **Save details** silently
reverted a rename made anywhere else since the page loaded.

### People
| Field | Cat | Before | After |
|---|---|---|---|
| Display name | A | **Rename** header action, a **Rename** row in the Settings tab, and a Drawer form — three entry points, one mutation | ✅ inline heading; the header action, the Settings row and the form are all gone |
| Contact fields, notes | E | their own explicit-save forms | ⏸️ multi-field |
| Archive / restore / delete | E | Settings + overflow | ⏸️ lifecycle |

### Assets
| Field | Cat | Before | After |
|---|---|---|---|
| Name | A | header action + Settings row + Drawer form (same three-way duplication) | ✅ inline heading (read-only while archived) |
| Details, obligations, events | E | explicit-save forms | ⏸️ multi-field, with real validation dependencies |
| Archive / restore / delete | E | Settings + overflow | ⏸️ lifecycle |

### Reviews
The guided review flow and the review record already use the shared writing
surface for their long-form prompts. Its step-by-step structure is a workflow,
not a set of independent values. ⏸️

### Settings
Every settings surface is DS-10b: a row, a shared control, a declared change
behaviour. That is the correct pattern for configuration, and it is already
consistent. ⏸️

---

## 3. What changed in the shared system

The brief's instruction was to fix the interaction model first and then migrate.
Four changes to the shared primitives came before any module moved:

1. **`InlineTextField` grew a `multiline` form** — a plain-text area with
   explicit Save/Cancel and ⌘/Ctrl+Enter, for values whose line breaks are
   significant but which are not Markdown. Blur does not save (a tall editor is
   somewhere you pause to think) and Escape only cancels an untouched draft.
2. **`InlineSelectField` learned that empty is empty** — `options` carries real
   values only, an unset field renders its `emptyLabel` in the shell's quiet
   empty style, and clearing is one separated command at the end of the same
   roving list, present only when there is something to clear.
3. **Anchored surfaces flip instead of overflowing** — the menu/popover measures
   itself on open and re-anchors rather than running past the viewport edge.
   *Superseded by EDIT-03 (2026-08-09):* measuring the box was necessary and not
   sufficient. An anchored surface rendered INSIDE its field is still clipped by
   any ancestor that hides its overflow, which on a Tasks row reduced all three
   inline editors to a 45px sliver. Placement now belongs to the shared
   [`~/shared/anchored`](../../app/shared/anchored) overlay layer — see
   [ADR-087](../decisions/ARCHITECTURE_DECISIONS.md#adr-087-inline-editors-float-in-a-shared-overlay-layer-and-become-sheets-on-a-phone).
4. **The writing surface gained a disabled state and a field wrapper** —
   `disabled` reconfigures the live view through a CodeMirror `Compartment`
   (no rebuild, so no lost undo history), and `MarkdownEditorField` wears the
   DS-06 field anatomy so an explicit-save form can host the same surface.

---

## 4. The evidence

- **`e2e/editing-consistency.spec.ts`** measures the contract in a real browser:
  all seven canonical records' title fields (present, 44px, keyboard-activated,
  Escape-cancels-and-restores-focus, no `Rename` control anywhere), a selected
  value changing `current → new` in one action with `aria-checked` on the right
  item, an unset value reading as empty with no clear command offered, clearing,
  a date set/changed/cleared from the record, no horizontal page overflow with a
  menu or popover open at 320/390/700/1024/1440, and axe in both appearances.
- **`e2e/editing-consistency-screenshots.spec.ts`** is the opt-in approval
  capture (`CAPTURE_SCREENSHOTS=1`). Every capture is a PAIR — the value at
  rest and the same value while being edited — because a single tidy screenshot
  of a record proves nothing about how it is edited. It covers the Note and
  Project titles, the Task priority sequence (set → menu → different set →
  unset → set), the Goal's date and definition editors, the Diary and Meeting
  writing surfaces side by side, and the phone at 390px, each in both
  appearances. It restores every fixture it touches.
- **Unit and integration**: the shared multiline field (Enter is a paragraph,
  ⌘/Ctrl+Enter saves, blur does not, a refusal keeps the paragraph), the
  clearable select (empty reads empty, direct replacement, the clear command's
  position in the roving order), `MarkdownEditorField`'s field anatomy and
  disabled state, the Goal route's two focused intents (each writes ONE key and
  leaves the other untouched), and the Task drawer's focused rename and bulk
  field posts.

---

## 5. Explicitly not done

Recorded so the next reader does not mistake absence for oversight:

- no navigation, rail, drawer, FAB, Today or gallery changes;
- no new design tokens;
- no editor framework, no rich-text document model, no HTML storage;
- no change to any module's persistence strategy;
- no conversion of a scheduling or recurrence workflow into an inline date;
- the Project Settings tab's two selects stay where they are (§2 above);
- a Note's tags, a Person's contact block and an Asset's details stay forms.

---

## 6. Followed up 2026-08-08 (DOC-EDITOR-01)

Two things this audit left open were closed rather than carried:

- **`MarkdownField` was retired from every product surface here but not deleted**, and it kept its `~/shared/forms` export — recorded as DEBT-101. It is now deleted; the design fixture that documented it demonstrates `MarkdownEditorField`, and a repository test fails if a long-form control is exported from the forms barrel again.
- **Which long-form surfaces are editor-first was left as a product decision** (DEBT-97). It is taken: all of them. [ADR-084](../decisions/ARCHITECTURE_DECISIONS.md#adr-084-long-form-markdown-is-edited-on-a-permanent-shared-writing-surface--there-is-no-read-then-activate-variant). `InlineMarkdownField`, built for the other answer and never adopted, is deleted — and the ⌘/Ctrl+Enter save it was the only holder of moved into the shared writing surface, which is where every explicit-save long-form host now gets it.

Nothing in §2's classification changed: no field moved category, and no module's save semantics changed.
