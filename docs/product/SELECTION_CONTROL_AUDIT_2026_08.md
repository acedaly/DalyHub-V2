# Selection-control audit — August 2026

**Scope.** Every `<select>`, combobox and relationship picker in DalyHub, audited
against four rules:

1. an **optional** field defaults to a genuinely empty state;
2. a **placeholder label is never stored as a value**, and is never offered as a
   selectable option;
3. an existing selection can be **replaced directly**, without clearing it first;
4. any field where **"None" is a meaningful domain state** — not merely an
   absent value — is documented as such.

Read alongside [`DESIGN_SYSTEM.md` → Forms](../design/DESIGN_SYSTEM.md#forms) and
[ADR-076](../decisions/ARCHITECTURE_DECISIONS.md#adr-076-the-shared-writing-surface-refined-in-place-and-inline-editing-as-one-state-machine-over-focused-server-intents).

---

## The controls in the product

| Control | Where | Kind |
|---|---|---|
| [`SelectField`](../../app/shared/forms/SelectField.tsx) | every form select, single and multi | WAI-ARIA editable combobox + listbox |
| [`InlineSelectField`](../../app/shared/inline-edit/InlineSelectField.tsx) | inline status/priority edits (DS-16) | WAI-ARIA menu button, `menuitemradio` |
| [`EntityLinkPicker`](../../app/shared/forms/EntityLinkPicker.tsx) | Linked Items, Key links, Task links | async search combobox that **creates links** |
| [`RecordLinkPicker`](../../app/shared/markdown-editor/RecordLinkPicker.tsx) | the editor's record-link command | async search list |
| [`TagsField`](../../app/shared/forms/TagsField.tsx) | tags everywhere | token input |
| [`SegmentedFilter`](../../app/shared/segmented-filter) | collection state filters | radio group in the URL |
| Native `<select>` | collection filter bars, Project workflow status, bulk-action menus, AI settings | native |

---

## Findings

### ① Fixed — a single-select could not be re-picked without clearing it first

**Rule 3 violated, product-wide.** `SelectField` reflects the chosen option's
LABEL into its input (which is what makes the closed control read "Career"
rather than as an empty box) — and that same text was then used as the search
query. Reopening a field that already had a value therefore offered exactly one
option: the one already chosen. Changing a Project's Area, a Task's parent, an
Asset's type or a Person's relationship all required clicking the **×** first,
which is a step no reference product asks for and no user discovers.

This affected **every** consumer of `SelectField`, client-filtered and async
alike — in the async case the caller's `options` stayed narrowed by whatever was
last searched, so the narrowing simply moved from the client to the server.

**Fix.** The two meanings of the input's text are now distinguished. A `typed`
flag is set only when the user actually edits the box; until then the text is a
*reflection* of the selection and the effective query is empty, so the whole list
is offered. Focusing an unedited field also selects its text (so the first
keystroke replaces rather than appends) and, for an async consumer, re-issues
`onSearch("")`. Committing and abandoning both reset the flag, so the field
cannot re-narrow itself on the next open.

Guarded by six cases in
[`test/unit/forms/select-field.test.tsx`](../../test/unit/forms/select-field.test.tsx),
all written as user actions.

### ② Fixed — a placeholder dressed as an option in the New Asset form

[`NewAssetForm`](../../app/modules/assets/NewAssetForm.tsx) opened its **Type**
list with `{ value: "", label: "Choose a type…" }`. Nothing bad was ever stored
(the value was the empty string and the required-field validation rejected it),
but it was arrowable, announced as an option, and choosing it "selected" a
non-type. `SelectField` already renders a real placeholder in the empty input, so
the prompt moved there, where it cannot be picked. This was the only instance in
the product.

### ③ Clean — no placeholder label is stored as a value anywhere

Every absence option in the codebase uses `value: ""`, and every consumer maps
the empty string to `null` (or omits the field) before it reaches a repository.
Verified across Tasks, Assets, Meetings, People, Reviews, Notes and the filter
bars. The kernel types agree: `TaskPriority | null`, `TimeSector | null`,
`TaskRecurrenceRule | null`, and so on — the absence is a `null`, never the
string `""` and never the label.

### ④ Clean — optional fields default to empty

Every optional select's initial value is `""`, which renders as the placeholder
and submits as absent. No optional field pre-selects its first option, and no
optional field is initialised to a sentinel.

### ⑤ Not applicable by design — the link pickers

`EntityLinkPicker` and `RecordLinkPicker` are **additive**: they search, and
choosing a result creates a link or splices a URL. Neither reflects a single
current selection into its input, so rule 3 cannot apply. Removing a link is a
separate, explicitly-labelled action on the link itself — deliberately, because
"replace this link" is not a thing a user means; adding and removing are.

### ⑥ Acceptable — the bulk-action `<select>`s in the Tasks workspace

[`TasksWorkspace`](../../app/modules/tasks/TasksWorkspace.tsx) uses
`{ value: "", label: "Set priority…" }` and `{ value: "", label: "Move to
sector…" }`. These are **command menus for a multi-select**, not fields: the
empty value is the inert resting state, choosing an option performs an action on
the selection and the control returns to its resting state. Nothing is stored and
there is no "current value" to replace. Recorded here so the pattern is not
mistaken for the ② defect.

---

## Where "None" is a meaningful domain state

These are **not** empty values. In each, the absence is a decision the owner made
and the system reasons about — so the option stays in the list, keeps its own
words, and must not be relabelled "Select…" or hidden behind a clear button.

| Field | Option | Why it is a state, not an absence |
|---|---|---|
| **Task priority** ([`task.ts`](../../app/kernel/tasks/task.ts)) | "No priority" | `TaskPriority \| null`. `null` is *unprioritised*, which the planning surfaces treat differently from P4 — P4 is "explicitly lowest", `null` is "not yet triaged". Collapsing them would lose the triage signal the Review Inbox is built on. |
| **Task time sector** | "No sector" | `TimeSector \| null`. A Task with no sector is deliberately unplaced in the day; Today's bands read that as "unscheduled", not as an omission. |
| **Task recurrence** ([`TaskQuickEditPanel`](../../app/shared/task-record/TaskQuickEditPanel.tsx)) | "Does not repeat" | The clearest case: the label is a *sentence about the Task*, not a prompt. Choosing it on a repeating Task **ends the series**, which is a real mutation with a real Activity entry. |
| **Task waiting-on** ([`TaskWaitingSection`](../../app/shared/task-record/TaskWaitingSection.tsx)) | cleared | "Not waiting" is a commitment state, and clearing it is `clear_waiting` — its own intent, not a field reset. |
| **Project parent Goal** | — | A Project sitting **directly under an Area** is a first-class shape in the spine (AGENTS.md §4), not a Project missing a Goal. The picker therefore offers Areas and Goals in one list rather than offering "no Goal". |
| **Asset obligation "Not set"** ([`AssetObligationForm`](../../app/modules/assets/AssetObligationForm.tsx)) | "Not set" | An obligation with no due rule is a *tracked but unscheduled* obligation — it still appears in the obligations tab and still carries history. |
| **Person contact fields "Not set"** ([`PersonContactForm`](../../app/modules/people/PersonContactForm.tsx)) | "Not set" | Relationship data is deliberately optional and deliberately *visible as unknown*: "we do not know this yet" is information about the relationship, and blanking it out of the UI would quietly hide it. |
| **Area / Project / Goal icon** | reset to default | `iconKey: null` means "use the entity default", which the repositories store explicitly and the route refuses to confuse with an unrecognised key. |

Everywhere else — collection filters ("All types", "Any status", "Everything"),
the notes filter bar, the assets filter bar — the empty option is a genuine
*no filter applied* and is correctly an absence.

---

## Follow-ups

None outstanding from this audit. Both defects are fixed in this PR with tests;
the remaining findings are records of correct behaviour, kept so the next agent
does not re-derive them.
