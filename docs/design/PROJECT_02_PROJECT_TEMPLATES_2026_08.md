# PROJECT-02 — Project templates (19 August 2026)

> The implementation record for ROADMAP_V2_3's PROJECT-02. The architecture
> decision itself is [ADR-105](../decisions/ARCHITECTURE_DECISIONS.md#adr-105-a-project-template-is-an-entity-that-is-not-a-spine-record--a-reusable-shape-whose-tasks-are-rows-instantiated-atomically-and-never-synchronised);
> this file carries the detail a reviewer, and the next implementer, actually
> need: what is copied, what is reset, where the bounds came from, what the
> surfaces measure, and what was deliberately left out.

**The goal was never "templates exist".** It was:

> DalyHub can turn a proven Project structure into a fresh piece of work without
> confusing reusable structure with live work, duplicating domain authorities,
> carrying history into the future, or making Project creation harder.

---

## 1. The architecture, in one paragraph

A template is an ordinary `entities` row of type `project_template` with a
`project_template_details` slice, and it is **not** a `spine_records` row. Its
tasks are rows in `project_template_tasks`, and their steps are rows in
`project_template_checklist_items`. Neither has an entity id, a spine record, an
EntityLink, an Activity event or a route. Creating a Project from a template is
ONE atomic D1 batch that mints a fresh id for every row it writes.

The three options the roadmap left open, and why the third won:

| Option | What it is | Why not |
|---|---|---|
| **A** — `project_details.is_template` | a Project with a flag | Every spine query in the product would need an exclusion predicate, correct forever. The first one anybody forgets is a template counted as live work. |
| **B** — a distinct `ProjectTemplate` domain | its own identity table | A second identity authority, a second workspace scoping, a second soft-delete, a second Activity integration. |
| **C** — an entity that is not in the spine | *chosen* | Reuses the kernel's identity primitive (no second authority); the absent spine row makes every leak structurally impossible rather than filtered. HABITS-01 set the precedent. |

---

## 2. What a template captures, field by field

The brief asked for each field to be evaluated individually. This is the answer,
and the reasoning is one rule applied consistently:

> **Copy structure and intentional defaults. Never copy execution history.**

### The template header

| Field | Captured | Why |
|---|---|---|
| Name | ✅ own field, defaults to the Project's title | It is the template's identity, and it is edited independently afterwards. |
| Description | ✅ own field, plain text | "What this is for, and when to reach for it" — a fact about the template, not about any Project. A Project has no description column to copy. |
| Icon | ✅ from `project_details.icon_key` | An intentional default handed to the Project it creates. |
| Identity colour | ✅ from `project_details.colour_slot` | Same. |
| Area / Goal | ✅ as a DEFAULT (plain column, resolved on read) | Overwhelmingly the right answer next time, and still only a default. Not an EntityLink — see §6. |
| Workflow status | ❌ | A created Project starts at the documented default, `planned`. "On hold" is not a state a new body of work can begin in. |
| Archived state | ❌ | A statement about one Project's lifecycle. |
| Completion | ❌ | Ditto, and the loudest possible piece of history. |
| Activity / history | ❌ | It happened to a Project, not to a shape. |
| Health | ❌ | Derived from live work; a template has none. |
| Links (`project.relates_to`) | ❌ | A relationship between two records that exist. Deferred — §9. |
| Knowledge (linked Notes) | ❌ | Same. Deferred — §9. |

### Per template task

| Field | Captured | Why |
|---|---|---|
| Title | ✅ | The shape. |
| Description (Markdown source) | ✅ verbatim | Intentional content the owner wrote for this step, not a record of doing it. |
| Priority | ✅ | An intentional default, and `null` (untriaged) stays `null`. |
| Order | ✅ dense `position`, and the created Tasks are written in it (§5) | The order IS part of the shape. |
| Checklist | ✅ titles and order | The steps inside a step. |
| Checklist ticks | ❌ | Last month's ticks describe last month's work. |
| Status | ❌ — every created Task is `todo` | |
| Completion | ❌ — every created Task is open | |
| Due date | ❌ | A stale absolute date, by construction. |
| Planned date | ❌ | Ditto, and it is the PLAN ([ADR-030](../decisions/ARCHITECTURE_DECISIONS.md)). |
| Time sector | ❌ | The soft form of a plan. A template captures no plan at all — one rule is easier to keep than two. |
| Commitment state | ❌ — every created Task is `active` | Someday/Maybe is a parking decision about one Task. |
| Waiting state | ❌ | An execution fact about a specific person and a specific promise. |
| Delegation | ❌ | Ditto. |
| Recurrence | ❌ | Deferred — §9. A recurrence rule is anchored to concrete dates a template does not have, so it is not even representable. |
| Timestamps | ❌ | Never. |
| Links | ❌ | Deferred — §9. |

**Which Tasks travel when a Project is captured.** Open, not cancelled and not
Someday/Maybe, in the Project's own creation order. A completed Task, a cancelled
decision and a parked idea are all statements about what happened to *this*
Project.

**The enforcement is the absent column.** `migrations/0046` gives a template
nowhere to keep a status, a date, a sector, a waiting state, a delegation, a
recurrence or a tick. A future change that wanted to carry one would have to add
the column *and* the domain field, both of which say in their own comments why
they do not exist.

---

## 3. Relative dates — deferred, deliberately

PROJECT-02 ships **no dates in templates at all**: not absolute ones, and not
relative offsets ("Book venue — due 14 days after the Project is created").

DalyHub already has three date authorities: a due date, the `scheduled_date`
that IS the plan ([ADR-030](../decisions/ARCHITECTURE_DECISIONS.md)), and a
recurrence anchor ([ADR-062](../decisions/ARCHITECTURE_DECISIONS.md) /
[ADR-085](../decisions/ARCHITECTURE_DECISIONS.md)). A relative offset would be a
fourth: resolved once at instantiation, never re-derivable afterwards, needing
its own vocabulary (from creation? from a start date? business days?), its own
timezone rule and its own edge cases.

And the product answer costs nothing: the owner creates the Project and then
plans it in `/plan`, which is the surface PLAN-01 built for exactly that. The
create drawer says so in words — *"… will be created — all open, undated and
unticked"* — so the absence is stated rather than discovered.

Recorded as [debt](../product/PRODUCT_DEBT.md), not as an oversight.

---

## 4. Checklist cloning

TASKS-13 already established the semantics, in the recurrence successor path:
copy the title and the order, mint a fresh id, reset `completed`. PROJECT-02
uses the same rule twice — capturing a Project reads only `title` (the SELECT
does not name `completed`, so there is nothing to carry), and instantiating a
template writes `completed` as a SQL **literal** `0` rather than a bound value,
so the reset is a property of the statement rather than of something a caller
could pass through.

No shared clone helper was extracted. The two paths do not share a row shape —
one reads `task_checklist_items`, the other `project_template_checklist_items` —
and the only thing they would share is a two-line map. Migration 0045's comment
already names "a future Project Template" as a consumer of the checklist
semantics; the semantics are what is shared, and they are stated in both places.

---

## 5. Ordering — a defect found and fixed

Instantiation's first draft wrote every created Task with one shared timestamp.
A Project's task list reads in the canonical `(created_at, id)` sequence, so the
tiebreak fell to `id` — a random UUID — and a twelve-step template arrived in
twelve random orders.

The fix: each created Task's `created_at` carries the template's position, one
millisecond apart. Invisible to a human, inside the same second, and it makes the
canonical order exactly the order the owner arranged. It is not a fabricated
history: the template says step one comes before step two, and this is the field
that says so.

`test/kernel/project-templates.test.ts` reverses a ten-step template before
instantiating it, so a coin toss cannot pass.

---

## 6. The default Area/Goal is a column, not a link

`project_template_details.default_parent_id` is a plain nullable column with a
`default_parent_kind` beside it, resolved against the live hierarchy on READ and
degrading to "no default" when it no longer names an active Area or Goal.

Two reasons it is not an EntityLink:

1. **AREA-05** refuses a permanent Area deletion while any active link
   references the Area. A template's convenience default must never be the reason
   an owner cannot delete an empty Area.
2. A template is configuration, not a participant in the workspace's
   relationship graph. It should not appear in an Area's linked items.

The create form still requires a real parent — the spine decides that, as it
always has. The default only decides what the field starts on.

---

## 7. Atomicity and bounds

### Atomicity

`instantiate` builds ONE `D1Database.batch()`. A batch is a SQL transaction: if
any statement fails, the entire sequence rolls back. Every dependent statement is
additionally gated on the row it depends on having been written
(`WHERE EXISTS (… the project …)`) — the device the recurrence successor clone
already uses — so when the Project's own gated insert is declined (an Area that
is missing, soft-deleted, of the wrong kind or in another workspace) every later
statement declines with it, nothing commits, and the caller raises
`ProjectTemplateParentUnavailableError` rather than discovering a foreign-key
failure.

Proved, not asserted: `test/kernel/project-templates.test.ts` soft-deletes the
Area between reading the template and instantiating, then counts rows — zero
Projects, zero Tasks, zero checklist items, zero Activity.

### Bounds, and where the numbers came from

| Bound | Value | Reasoning |
|---|---|---|
| `MAX_TEMPLATE_TASKS` | **40** | A template is a SHAPE. Forty steps is past the point where the work should have been split, and every example the product is designed around is 5–20. It is also half of what bounds the batch: each template task costs four statements (entity, spine row, structural link, `task_details`). |
| `MAX_TEMPLATE_CHECKLIST_ITEMS_PER_TASK` | **20** | Not the 100 a LIVE Task's checklist may hold: this one is multiplied by the bound above and would otherwise decide how large a batch can get. |
| `MAX_TEMPLATE_CHECKLIST_ITEMS` (whole template) | **120** | The bound that actually caps the batch. Without it the worst case is 40 × 20 = 800 checklist statements. |

Worst-case instantiation: `4 + 40×4 + 120 + 3 ≈ 287` statements, each binding at
most a dozen parameters — comfortably inside D1's **100 bound parameters per
statement** ceiling, which is the limit TASKS-13 measured the hard way on a real
workspace. `test/unit/projects/project-template-query-bounds.test.ts` asserts the
arithmetic; `test/kernel/project-templates.test.ts` instantiates a maximal
template against the real database, so the number is a measurement rather than
an estimate.

### Bounds are enforced by the WRITE

Every bound is asserted by the inserting statement's own
`WHERE (SELECT COUNT(*) …) < n`, evaluated at that statement's commit. Reading a
count first and deciding in TypeScript leaves a window two devices can both pass
at the limit — the defect TASKS-13 fixed the same way. A kernel test races two
adds at thirty-nine tasks and asserts exactly one commits.

### Capturing an oversized Project is REFUSED, not truncated

A Project with more open Tasks than a template may hold — **or a Task with more
checklist items than a template step may hold** — produces
`ProjectTemplateTooLargeError`, and the message names the actual numbers ("This
project has 47 tasks, and a template holds at most 40"). Both bounds refuse.
Silently dropping seven tasks, or the last eighty steps of a hundred-step
checklist, would produce a shape that disagrees with the Project it claims to be
the shape of — and a limit an owner discovers by hitting it silently is worse
than one that is stated.

### A template deleted mid-flight creates nothing

The gap between reading a template and committing the instantiation batch is
real: an owner can delete a template on another device while the create drawer is
open. The Project's own gated insert therefore re-asserts BOTH preconditions —
the Area/Goal is still active AND the template is still active — so the whole
cascade declines together. Which of the two failed is then reconciled by
re-reading, so an owner is told the template is gone rather than being sent to
look at the Area picker.

---

## 8. Search, export, delete and offline

**Search.** Templates are findable by NAME through their own provider
(`projects.template_search`), leading to the template record. Template TASKS are
not searchable at all: they are internal structural rows with no entity id and no
route, and twelve task-name hits per template would flood a palette whose job is
to find live work. This is [ADR-103](../decisions/ARCHITECTURE_DECISIONS.md)'s
rule one level up.

A template is the first entity type that has NO visual identity of its own — it
wears the Project mark rather than a twelfth accent — so the shared Search
surface cannot name it from `ENTITY_IDENTITY`, and the group was headed with the
raw `project_template` slug. Rather than widen the identity registry (a new
generated accent, a new glyph, a new entry in every identity consumer) for a
record that deliberately borrows Project's mark, the heading now comes from the
label the module already DECLARES on its `EntityTypeContribution`
(`plural: "Project templates"`): the `/search` composition boundary passes those
labels from the same registry it took the providers from, and grouping prefers a
declared label over the slug. The row's trailing type chip, which speaks the
identity vocabulary, is simply absent for such a type — a raw `entities.type`
slug is never shown to a person, and the provider's own subtitle ("Template · 4
tasks · 3 checklist items") carries the type instead.

**Export and restore.** Three new snapshot collections —
`projectTemplateDetails`, `projectTemplateTasks`,
`projectTemplateChecklistItems` — ordered after `taskChecklistItems` and before
`noteDetails`, details before tasks before checklist items, so a restore inserts
parents before children and deletes in the exact reverse. All three are in
`SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS`, so an archive written before PROJECT-02
still validates and still restores. The shared workspace fixture holds a real
template, so the existing round-trip proof covers it; a dedicated test then
restores an archive and INSTANTIATES the restored template, proving it is still
usable rather than merely present.

> **A pre-existing defect fixed here.** `stageRows` in the restore repository had
> no `taskChecklistItems` branch, so it fell through to `default: return []` and
> every TASKS-13 checklist item in an archive was exported faithfully and
> silently dropped on restore. Found while adding the three collections beside
> it, and fixed because it is data loss in the one path whose whole job is not to
> lose data.

**Delete.** A template soft-deletes through the shared entity lifecycle
(`entities.deleted_at`), atomically with `project_template.deleted`. There is no
separate archive state: a template is reusable configuration rather than
execution history, so there is nothing to put away that deleting does not
already cover. Its task and checklist rows are RETAINED, exactly as a
soft-deleted Task retains its checklist, so a restore is faithful. Deleting a
template never touches a Project made from it — there is no reference to cut,
because provenance is an append-only Activity event.

**Offline.** Unchanged, and deliberately. PROJECT-02 adds **no** offline
mutation. Creating or editing a template, and creating a Project from one,
require connectivity; the PWA-12 replay ledger's operation set is untouched. The
reasoning: an instantiation is a compound write of up to ~287 statements whose
whole guarantee is atomicity, and the offline ledger exists for single,
idempotent, narrow Task mutations. Widening it for a flow an owner performs a
handful of times a month would trade the product's clearest atomicity guarantee
for very little. Recorded as debt.

---

## 9. What PROJECT-02 deliberately did NOT add

Recorded so none of it is mistaken for an oversight:

- **relative dates** in any form (§3);
- **recurrence** in a template task (not representable without dates);
- **time sector** (the soft form of a plan);
- **links and Knowledge** on a template (a relationship between records that
  exist);
- **two-way sync** of any kind, and **template version history**;
- **a blank-template create path** — a template is made by saving a Project that
  worked, which is the product premise; a second, worse way in would only
  advertise itself;
- **offline template mutation**;
- marketplace, public, shared, team or cross-workspace templates;
- AI template generation, AI Project creation, automatic weekly planning,
  workflow automation, resource scheduling, estimates, time tracking, nested
  Projects, new Task types.

---

## 10. The experience

### Information architecture

```
Projects  ──(a quiet secondary link, only when templates exist)──▶  Templates
   │                                                                   │
   │  New project ▸ "Start from" ▸ Blank project | a template          │  Use template
   ▼                                                                   ▼
        the new Project's record  ◀────────────────────────────────────┘
```

- **`/projects` is unchanged when the workspace has no templates.** No link, no
  field, no hint. That is the promise this feature makes about not making Project
  creation harder, and an E2E journey asserts it.
- **The Templates link is a single secondary link beside "New project"** — not a
  fifth lifecycle tab (Active/All/Completed/Archived are four collections of
  *Projects*, and templates are not Projects in any state), not a second
  navigation destination, not a dashboard card.
- **"Save as template" lives in the Project record's overflow**, between the
  create actions and the lifecycle ones. It is a deliberate, infrequent thing an
  owner does to a Project that has proved itself, not part of running one, and it
  is absent on an archived (read-only) Project.

### Why a LIST and not a gallery

A Project is drawn as a card because it is recognised by its mark. A template is
chosen by READING it — its name, what it is for, and how much it will create —
and every one of those facts is text. Measured: at 1440 the list gives a
template's name **953px**; a three-column gallery would give each card ~380px and
push the counts to a third line. And the list is the SAME shape at 393 rather
than a different one, which is why there is no presentation toggle to keep in
step.

### The confirmations say what happened

- Saving: *"Saved "Monthly reporting" — 12 tasks · 3 checklist items. Dates,
  progress and history were not copied."* — not "Saved", which would leave the
  owner to open the template to find out whether the completed tasks came too.
- Creating: *"12 tasks · 3 checklist items will be created — all open, undated
  and unticked."*, stated **before** the button that creates them.
- Deleting: *"The template is removed. Projects already created from it keep
  every task and are not changed."*

### The template record

The Project record is deliberately NOT reused. Its header carries
Complete/Reopen, its summary carries health and progress, and its tabs are
Tasks / Knowledge / Links / Activity / Settings — every one of which is a
statement about work being done, and a template has none of it. Reusing it would
have meant hiding most of it, and a surface defined by what it hides is a dead
end.

What IS reused is the shared record LAYOUT and every editing primitive in it: the
same `RecordLayout`, the same `InlineTextField` grammar (click, Enter, Escape,
blur), the same `Menu`, the same `Button`, the same `ConfirmationDialog`. The
page is new; nothing on it is.

The editing model is TASKS-13's checklist interaction, reused rather than
re-decided: one "Add" affordance that opens an input in place, Enter to save and
immediately reopen a blank one, Escape to close a BLANK input only, inline
rename, and reorder as two ordinary commands in the row's menu. **No
drag-and-drop** — "Move up" works identically with a mouse, a keyboard and a
thumb, and this repository has no drag dependency to add one from.

---

## 11. Measurements

Captured by `e2e/project-templates-screenshots.spec.ts`
(`CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/project-templates-screenshots.spec.ts`);
the raw numbers are
[`assets/v2-3-project-02/measurements.json`](assets/v2-3-project-02/measurements.json).

| Surface | Width | `scrollWidth` / `clientWidth` | Overflows | Template name width | Smallest target |
|---|---|---|---|---|---|
| Templates | 1440 | 1440 / 1440 | no | 953px | 36px (fine pointer) |
| Templates | 393 | 393 / 393 | no | 309px | 36px (fine pointer) |
| Templates | 393 **touch** | 393 / 393 | no | 309px | **44px** |
| Templates | 320 | 320 / 320 | no | 236px | 36px (fine pointer) |
| Template record | 1440 | 1440 / 1440 | no | — | 32px (fine pointer) |
| Template record | 393 **touch** | 393 / 393 | no | — | **45px** |
| Template record | 320 | 320 / 320 | no | — | 32px (fine pointer) |
| Create from template | 1440 | 1440 / 1440 | no | — | drawer 416px |
| Create from template | 393 | 393 / 393 | no | — | drawer 393px (full width) |
| Instantiated Project | 1440 / 393 | equal | no | — | — |

**On the 36px and 32px figures.** They are the correct DESKTOP control heights.
The 44px floor is applied by `@media (pointer: coarse)` on the density tokens, so
a 393px *window* on a laptop keeps the medium control height while a real phone
gets the floor — which is why the touch rows above exist, and why
`project-templates.spec.ts` asserts the minimum in a context with
`hasTouch: true` rather than by width alone. This is the correction HARDEN-05
recorded in `tokens.css`, applied here from the start.

### Responsive behaviour

- **≥ 540px** — the template row is three columns: mark, body, action.
- **< 540px** — one column: mark and name, description, counts, then a
  full-width action. Row height goes 90px → 143px, which is the stack, not a
  squeeze.
- **< 540px** — the template task head drops from four columns to three, with the
  priority moving to its own row beneath the title. Task row height goes 85px →
  138px (the first task) and 187px → 240px (the one with steps).
- **320px** — nothing scrolls horizontally on any template surface.

### Evidence

`docs/design/assets/v2-3-project-02/`:

| File | What it shows |
|---|---|
| `templates-1440-light.png` / `-dark.png` | The Templates collection, both appearances |
| `templates-393-light.png` / `-dark.png` | The same on a phone |
| `templates-393-touch.png` | The same under a coarse pointer (44px targets) |
| `templates-320.png` | The reflow proof |
| `template-record-1440-light.png` / `-dark.png` | The template record, both appearances |
| `template-record-393-light.png` / `-dark.png` / `-touch.png` | The record on a phone |
| `template-record-320.png` | The reflow proof |
| `create-from-template-1440.png` / `-393.png` | The two-field create flow |
| `new-project-with-template-1440.png` | "Start from" inside the ordinary create drawer |
| `instantiated-project-1440.png` / `-393.png` | The Project the template produced |
| `measurements.json` | Every number quoted above |

---

## 12. Accessibility

- **Keyboard-complete.** An E2E journey creates a Project from a template using
  only focus and Enter. Reorder is two ordinary menu commands, so nothing is
  drag-only. The add-a-task composer is an ordinary input with a described-by
  hint ("Press Enter to add. Escape closes an empty field.").
- **Accessible names are specific.** Every row's action is named for its
  template ("Create a project from Monthly reporting"), because "Use template"
  repeated down a list names nothing. Every task menu is named for its task.
- **Touch targets** meet 44px on a coarse pointer, asserted (not assumed) in a
  touch-emulating context.
- **axe (WCAG 2.0/2.1/2.2 A + AA + best-practice)** finds nothing on the
  Templates collection or the template record, in light and dark.
- **No horizontal overflow** from 320px upward, measured.
- **Announcements.** The save, create and delete confirmations go through the
  shared feedback live region; the "what will be created" line is a `role="status"`
  so it is heard before the button that acts on it.

---

## 13. Tests

| Layer | File | What it proves |
|---|---|---|
| Kernel | `test/kernel/project-templates.test.ts` | A template writes no spine row and cannot be read as one; its tasks write no entity, spine row or link; workspace isolation both ways; capture copies shape and leaves history; instantiation mints fresh ids, preserves order, resets ticks and completion, clones no Activity; an unavailable parent creates nothing; a deleted template refuses; two simultaneous instantiations are independent; a MAXIMAL template commits; template and Project are independent in both directions; deleting a template leaves its Projects alone; dense ordering across add/delete/reorder; every bound, including under a concurrent race; a page of twelve templates costs three statements. |
| Routes | `test/kernel/project-template-routes.test.ts` | Blank creation unchanged; creation from a template; malformed, cross-workspace and deleted template ids; unavailable parent; `save_as_template` reports what it captured and is refused on an archived Project; unknown intent; oversized title; cross-workspace mutation writes nothing. |
| Snapshot | `test/kernel/workspace-restore.test.ts` | The round trip covers a real template; and a restored template still INSTANTIATES to the same structure, open and unticked. |
| Query bounds | `test/unit/projects/project-template-query-bounds.test.ts` | No loader reads templates inside a loop; counts come from grouped aggregates; the id chunk stays under D1's parameter ceiling; the instantiation batch arithmetic. |
| E2E | `e2e/project-templates.spec.ts` | The nineteen product claims (§14 of the brief), plus the empty state, the conditional Templates link, search semantics (a template found by name under a readable heading, its tasks never results), and touch targets on a real phone. |
| Evidence | `e2e/project-templates-screenshots.spec.ts` | Opt-in capture and measurement. |

---

## 14. Debt and later roadmap candidates

Recorded in [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md):

- **Relative dates in a template** (§3) — the strongest single candidate, and the
  one with the highest design cost.
- **Recurrence in a template task** — needs the date model above first.
- **Links and Knowledge on a template.**
- **Offline template mutation** (§8) — currently a deliberate boundary.
- **A blank-template create path**, if an owner ever wants to write one before
  running it.
