# UI/UX & Product-Coherence Audit — 2026-07

> A senior-level review of DalyHub **as one assembled personal operating system**, run against
> the current `main` branch with real seeded development data. This is a review-and-planning
> document only: **no application code, migration, test, or deployment was changed** (see
> [Verification](#verification)).
>
> This audit is the follow-up to the 2026-07-18 review recorded in
> [`docs/design/PRODUCT_EXPERIENCE.md`](../design/PRODUCT_EXPERIENCE.md). That review judged the
> *component layer* "premium-grade" but the *assembled frame* "a well-made website hosting
> excellent components." Since then the sidebar frame, entity identity, record layout, Today,
> Tasks (TASKS-01), Projects, Areas, Goals, Notes and Diary have all shipped. This audit asks the
> next question: **now that the frame exists and the modules are individually complete, does the
> whole cohere?**

**Reviewer:** Claude (Opus) · **Date:** 2026-07-25 · **Branch under review:** `main` @ `b88eedd`
(TASKS-01) · **Scope:** running product + implementation + documentation.

---

## Mandatory preparation — documents & files reviewed

### Documentation read
`AGENTS.md` · `docs/README.md` · `docs/product/PRODUCT_PRINCIPLES.md` · `docs/product/PRODUCT_DEBT.md`
· `docs/product/IMPLEMENTATION_WORKFLOW.md` · `docs/design/DESIGN_SYSTEM.md` ·
`docs/design/PRODUCT_EXPERIENCE.md` · `docs/development/ACCESSIBILITY_RESPONSIVE.md` (the
accessibility doc lives under `development/`, not `design/`) · `docs/architecture/ARCHITECTURE_OVERVIEW.md`
· `docs/decisions/ARCHITECTURE_DECISIONS.md` (ADR-001…043) · `docs/roadmap/ROADMAP_V2.md`.

**Module docs:** `TODAY_DASHBOARD.md` · `TASKS_MODULE.md` · `PROJECTS_MODULE.md` · `AREAS_MODULE.md`
· `GOALS_MODULE.md` · `NOTES_MODULE.md` · `DIARY_MODULE.md` · `APP_SHELL_AUTH.md`.

**Shared-system docs:** `DESIGN_SYSTEM.md` (Card, Record Layout, Entity Identity, Drawer, Inspector,
Feedback, Forms, Filters, Search, Command Palette, Settings) · `ACTIVITY_TIMELINE.md` · `SHARED_FORMS.md`
· `SHARED_SEARCH.md` · `COMMAND_PALETTE.md` · `FEEDBACK_AND_INSPECTOR.md` · `SETTINGS_LAYOUT.md`.

### Implementation files inspected (selected, with the seams they evidence)
- **Entity identity / icons:** `app/shared/entity/identity.ts` (frozen `ENTITY_IDENTITY` map, 10 types),
  `app/shared/entity/EntityIcon.tsx`, `app/shared/entity/EntityLink.tsx` (renders **no** icon/accent),
  `app/shared/icons/icons.tsx`, `app/styles/tokens.css:230-239` (accents), `app/modules/diary/diary-icons.tsx`
  (Diary-local subtype icon map), `app/kernel/diary/diary-entry-type.ts`.
- **Card / Record Layout:** `app/shared/card/Card.tsx` (+ `card/types.ts`), `app/shared/record-layout/RecordHeader.tsx`
  (inline actions only — **no overflow/⋯ menu is rendered**), `app/shared/collection-layout/CollectionLayout.tsx`,
  `app/shared/shell/PaneHeader.tsx`, `app/shared/empty-state/EmptyState.tsx`, `app/shared/segmented-filter/SegmentedFilter.tsx`.
- **Tasks presentation:** `app/kernel/tasks/task.ts`, `app/shared/task-record/task-view.ts`
  (`taskDisplayState`, `taskDisplayStatus`, `taskPriorityLabel/Tag`, `taskDateLabel`),
  `app/modules/tasks/TasksWorkspace.tsx`, `app/modules/tasks/tasks-view-model.ts`,
  `app/modules/today/TodayDashboard.tsx`, `app/modules/today/task/planning-view.ts`,
  `app/modules/projects/ProjectTasksTab.tsx`, `app/shared/task-record/TaskRecordDrawer.tsx`,
  `app/modules/tasks/search.ts`.
- **Lifecycle:** `app/kernel/spine/spine-repository.ts` (softDelete/restore, `SpineHasActiveChildrenError`),
  `app/kernel/entities/entity-repository.ts`, `app/kernel/project-settings/project-settings-repository.ts`,
  `app/modules/projects/ProjectSettingsTab.tsx`, `app/modules/notes/NoteOverview.tsx` + `use-delete-note.ts`,
  `app/modules/notes/NotesCollection.tsx`, `app/modules/areas/routes/mutate.tsx`, `app/modules/goals/routes/mutate.tsx`,
  `app/modules/diary/routes/mutate.tsx`.
- **Cross-module:** every collection (`*Collection.tsx`), every record (`*Overview.tsx` / `routes/detail.tsx`),
  `SearchSurface.tsx`, `CommandPalette.tsx`.

### Running product
The app was booted in development-auth mode (`react-router dev`, port 4173) against a migrated local
D1 seeded with the repo fixtures plus an **additive local-only enrichment** (Notes, Diary entries, and
tasks spanning P1–P4 / overdue / due-today / scheduled / waiting / on-hold / someday / delegated /
untriaged) so every state could be observed. The enrichment touched **only the local Miniflare
database** and is **not committed**. 53 screenshots were captured across desktop light, desktop dark,
mobile 390px and narrow 320px — see [Screen inventory](#3-screen-inventory).

---

## 1. Executive verdict

**DalyHub now reads as a real application, not a website hosting components.** The 2026-07-18
diagnosis has been substantially fixed: a persistent left sidebar with per-entity nav icons, a shared
entity-identity system adopted across nearly every surface, a single record layout, a URL-driven
drawer, a grouped command palette and a genuinely lovely Diary timeline. **Record surfaces feel
finished and premium.** ([`project-record-light.png`](assets/ui-audit-2026-07/project-record-light.png),
[`diary-timeline-light.png`](assets/ui-audit-2026-07/diary-timeline-light.png)).

The gap is no longer the *frame* — it is the **collection surfaces and the lifecycle layer**. Three
problems recur and reinforce each other:

1. **Scanning is hard.** Cards are a flat wall of near-identical rows. The signals that should let a
   power user triage at a glance — priority, real urgency, entity subtype — are either rendered as
   low-emphasis grey text or not rendered at all. Today shows 48 "Anytime" cards that look identical
   ([`shell-today-light.png`](assets/ui-audit-2026-07/shell-today-light.png)).
2. **Removal is hidden or missing.** "How do I delete this Project or Area?" has no good answer.
   Project archive is buried one tab deep in Settings with no header or collection entry point; Area,
   Goal and Diary entries have **no removal UI at all** despite the kernel supporting soft-delete.
   There is **no overflow (⋯) menu anywhere in the product** — the Record Header renders only inline
   buttons, and the Card's built-in `overflowAction` slot is unused by all seven modules.
3. **Equivalent concepts drift.** The same "status" resolves through three different functions with
   three different vocabularies depending on the surface; "New Area" vs "New project" vs "Quick
   capture" vs "New entry"; four different removal placements; a Diary card that forks the shared Card.

None of this requires a redesign. It is **shared-seam work**: fix a handful of shared presentation
components (a priority/urgency signal, an entity-identity link, a record overflow menu, a shared
lifecycle action) and adopt them consistently.

### Scores (out of 10)

| Dimension | Score | One-line rationale |
|---|:--:|---|
| **Overall product experience** | **7** | The frame and records are premium; collections and lifecycle drag the assembled whole down. Up from 6 (2026-07-18). |
| **Visual coherence** | **8** | One token set, one Card, one Record Layout, one Entity Identity, broadly adopted and test-enforced. Docked for the `EntityLink` icon gap, the Diary card/detail fork, the Today primary-action fork, and label/capitalisation drift. |
| **Information hierarchy** | **5** | Cards are a flat wall. Priority is grey text; urgency is a colour; Today has 48 identical "Anytime" rows with no grouping or emphasis. The weakest dimension. |
| **Action discoverability** | **4** | Primary create actions are clear, but **removal/lifecycle actions are hidden or absent**: no overflow menu exists; Project archive is buried in a Settings sub-tab; Area/Goal/Diary have no removal UI. |
| **Task planning clarity** | **5** | The four-question model is rich and correct in the data, but priority is invisible on Today, Project and Search cards; overdue is colour-only; "due today" is indistinguishable from a future due date on a card. |
| **Lifecycle clarity** | **4** | Three lifecycle models (archive / soft-delete / cancel-status) in three placements, plus three entity types with no removal at all. No shared "remove this record" convention. |
| **Desktop usability** | **7** | Records, drawer, palette, search, and keyboard model are strong. Collections are noisy and under-hierarchied. |
| **Mobile usability** | **6** | Components pass 320→ultra-wide with no overflow (DS-11, verified), but Diary ships two primary entry points (button + FAB), Today forks its empty/primary patterns, and the card wall is worse on a phone. No bottom tab bar yet. |
| **Accessibility in practical use** | **8** | WCAG 2.2 AA is engineered and tested (contrast both themes, focus isolation, live regions, 44px targets, status pills always carry text). Docked because **overdue due-dates are distinguished by colour alone** — the one live "colour-only" state, contradicting the codebase's own contract. |
| **Perceived completeness** | **6** | Records feel finished; but Today's Quick Capture is inert, Today mixes fixture "Activity task NN" rows into real data, removal flows dead-end, and the card wall reads as "engine assembled, surface not yet polished." |

---

## 2. What is already working (retain these)

1. **The shared kernel of UI is real and enforced.** One `Card` (`card/types.ts`, `Card.tsx`), one
   `RecordLayout`/`RecordHeader`, one `EntityIdentity` map (`identity.ts:87-99`), one `Drawer`, one
   `FilterBar`, one `EmptyState`, one Feedback platform. A token test fails the build on any undefined
   `var(--dh-*)`, and cross-module imports are boundary-checked. This is the asset the whole audit
   builds on — **do not fork it.**
2. **Entity Identity is broadly adopted.** Collection/pane headers, cards, record headers, empty
   states, search results, the command palette and the sidebar all consume the one identity map
   (evidence: `PaneHeader.tsx:56-62`, per-card `EntityIcon` in every `*Collection.tsx`,
   `SearchSurface.tsx:461-465`, `CommandPalette.tsx:610`, `PrimaryNavigation.tsx:73`). The hypothesis
   that "other modules are visually generic" is only **partly** true — see §5.
3. **The Diary timeline is the strongest scanning surface in the product.** Per-entry subtype icons +
   subtype badges + timestamps make it instantly legible
   ([`diary-timeline-light.png`](assets/ui-audit-2026-07/diary-timeline-light.png)). It should be the
   *model* for a shared subtype pattern, not copied ad hoc, and must be **preserved**.
4. **The record surface is premium.** The project/area/goal/note records — type icon, title, one
   status pill, a health/momentum summary, a rollup, and Activity/Settings-last tabs — feel finished
   and consistent ([`project-record-light.png`](assets/ui-audit-2026-07/project-record-light.png),
   [`area-record-light.png`](assets/ui-audit-2026-07/area-record-light.png)).
5. **The task data model is genuinely first-class.** Priority P1–P4, due vs scheduled vs sector kept
   strictly distinct, waiting, on-hold, someday, cancellation, delegation and a single canonical
   display-state precedence evaluator (`task-view.ts:311-340`). The problem is presentation, not model.
6. **Accessibility is a real, tested quality bar.** Contrast tested in both themes, focus isolation in
   the drawer/inspector, live-region feedback, 44px touch targets, `prefers-reduced-motion`, and the
   discipline that status pills always pair tone with a text label.
7. **The command palette and search are correct and calm.** Grouped, keyboard-first, deep-linkable,
   and properly separated (search never runs commands)
   ([`command-palette-light.png`](assets/ui-audit-2026-07/command-palette-light.png)).
8. **Notes' delete/restore is the reference lifecycle.** Header "Delete" → real mutation + Undo toast;
   Restore from an Active/Deleted segmented filter; the deleted canonical route 404s. It is the pattern
   the other modules should adopt (ADR-042).

---

## 3. Screen inventory

53 screenshots retained under [`docs/product/assets/ui-audit-2026-07/`](assets/ui-audit-2026-07/).
Naming: `<screen>-<theme>[-m<width>].png`. Every screen was captured desktop **light** and **dark**;
a mobile-390 pass covers the highest-traffic screens; two 320px shots probe the tightest layouts.

| Screen / mode | Light | Dark | Mobile 390 | Narrow 320 |
|---|:--:|:--:|:--:|:--:|
| App shell + Today | `shell-today-light` | `shell-today-dark` | `shell-today-light-m390` | — |
| Tasks · Focus | `tasks-focus-light` | `tasks-focus-dark` | `tasks-focus-light-m390` | — |
| Tasks · Matrix | `tasks-matrix-light` | `tasks-matrix-dark` | `tasks-matrix-light-m390` | `tasks-matrix-light-m320` |
| Tasks · Time Sectors | `tasks-sectors-light` | `tasks-sectors-dark` | — | — |
| Tasks · All | `tasks-all-light` | `tasks-all-dark` | — | — |
| Task Drawer (overdue task) | `tasks-drawer-light` | `tasks-drawer-dark` | `tasks-drawer-light-m390` | — |
| Projects collection | `projects-light` | `projects-dark` | `projects-light-m390` | — |
| Projects · Archived filter | `projects-archived-light` | `projects-archived-dark` | — | — |
| Project record | `project-record-light` | `project-record-dark` | `project-record-light-m390` | `project-record-light-m320` |
| Project · Settings tab | `project-settings-light` | `project-settings-dark` | — | — |
| Areas collection | `areas-light` | `areas-dark` | `areas-light-m390` | — |
| Area record | `area-record-light` | `area-record-dark` | — | — |
| Goals (Alignment) collection | `goals-light` | `goals-dark` | — | — |
| Goal record | `goal-record-light` | `goal-record-dark` | — | — |
| Notes collection | `notes-light` | `notes-dark` | `notes-light-m390` | — |
| Notes · Deleted filter | `notes-deleted-light` | `notes-deleted-dark` | — | — |
| Note record | `note-record-light` | `note-record-dark` | — | — |
| Diary · Day (empty state) | `diary-day-light` | `diary-day-dark` | `diary-day-light-m390` | — |
| Diary · Timeline | `diary-timeline-light` | `diary-timeline-dark` | — | — |
| Search | `search-light` | `search-dark` | — | — |
| Command Palette | `command-palette-light` | `command-palette-dark` | — | — |

Empty, loading, archived and deleted states were captured incidentally: Diary Day shows the shared
`EmptyState` (`diary-day-*`); Notes Deleted shows the archived/deleted collection pattern
(`notes-deleted-*`); Projects Archived shows the filtered-empty archived view (`projects-archived-*`).

---

## 4. Findings register

Severity: **P1** actively harms coherence/trust · **P2** notable friction · **P3** cleanup.
Root layer: **Shared** (fix the shared component) · **Adoption** (module wires a shared component
inconsistently) · **Domain** (missing backend capability) · **Docs**.

| ID | Screen / module | Observed issue | Evidence | Sev | Freq | User consequence | Root layer | Recommended correction | Roadmap home |
|---|---|---|---|:--:|---|---|---|---|---|
| **UXA-01** | Tasks Focus/Matrix/Sectors/All; Today; Projects; Search | **Priority is invisible where triage happens.** In Tasks it is a colour-free grey chip "Priority: P1"; on Today cards, Project task cards and Search results it is **not rendered at all** (data is on the wire for Projects, absent from the Today projection). | `TasksWorkspace.tsx:340`; Today `planning-view.ts:31-48` omits priority; `ProjectTasksTab.tsx` renders none though `project-view.ts:255` carries it; `search.ts:61-71`; screenshots `tasks-matrix-light`, `shell-today-light`, `tasks-drawer-light` | P1 | Every task list, every day | A P1 and a P4 look identical while planning the day or working a project; the four-question model's value is lost at the glance. | Shared + Adoption | Introduce a shared `PriorityIndicator` (§6) driven by the canonical `taskPriorityTag`; render it on every task-bearing Card; extend the Today projection to carry priority. | New **TASKS-02** (task signal presentation) |
| **UXA-02** | Tasks; Today; Projects | **Overdue is signalled by colour alone.** An overdue due-date renders "Due 20 Jul 2026" in danger-red; a future due-date renders the same text in neutral. No "Overdue" word appears on any card. | `task-view.ts:399-402` (`tone:"danger"`, no textual marker); duplicated inline `TasksWorkspace.tsx:355-359`, `TodayDashboard.tsx:685-689`; screenshot `tasks-drawer-light` (red "Due 20 Jul"/"Due 25 Jul" vs neutral "Due 30 Jul") | P1 | Every overdue task | Violates the product's own "never colour alone" contract (`ACCESSIBILITY_RESPONSIVE.md:133`); colour-blind and forced-colors users lose urgency entirely. | Shared | Add an explicit "Overdue" / "Due today" label (icon + word) in the shared urgency signal; reserve red as reinforcement, not the sole cue. | **TASKS-02** |
| **UXA-03** | All task surfaces | **"Due today" is not a distinct state.** Because overdue is strictly `dueDate < today`, a task due *today* falls through to the neutral "Due <date>", visually identical to one due months away; the single most actionable urgency state is invisible on cards. | `task-view.ts:399`; Today buckets its "Today" section by `scheduledDate`, not `dueDate` (`planning-view.ts:124-128`) | P2 | Daily | The user cannot see what's due today without opening each record; encourages missing deadlines. | Shared | Add a `due-today` case to the urgency signal (§6): "Due today", info/warning tone + label. | **TASKS-02** |
| **UXA-04** | Projects (task cards) vs Tasks vs Today | **Status resolves through three different functions with three vocabularies.** Tasks/Drawer use the 8-state `taskDisplayState`; Projects uses the legacy 3-state `taskDisplayStatus` which has **no case for On hold, Cancelled or Someday** — those show as "To do" on a Project; Today shows only "Done"/nothing. | `task-view.ts:311-340` vs `:169-184`; wired at `ProjectTasksTab.tsx:226`; `TodayDashboard.tsx:702` | P2 | Any task seen in >1 place | The same task presents a different status depending on the surface — directly undermines "views are windows onto the same data." | Shared + Adoption | Retire `taskDisplayStatus`; route every surface through the single `taskDisplayState`. | **TASKS-02** |
| **UXA-05** | Areas, Goals, Diary records | **No removal UI exists at all**, though the spine/entity kernel supports soft-delete. Area mutate route hard-rejects everything except `rename`; Goal mutate handles only rename/details/complete/reopen; Diary mutate only edits. | `areas/routes/mutate.tsx:47-52`; `goals/routes/mutate.tsx:85-146`; `diary/routes/mutate.tsx:85-225`; capability exists at `spine-repository.ts:154,162` and `entity-repository.ts:124,132`; screenshot `area-record-light` (only "Rename") | P1 | Whenever a user wants to remove one | "How do I delete this Area/Goal/diary entry?" has no answer; the user is stuck with records they can't remove — erodes trust in the system as a safe place. | Adoption (UI) — domain exists | Adopt the Notes soft-delete/restore pattern (ADR-042) for Area, Goal, Diary; gate hierarchy deletes on the existing `SpineHasActiveChildrenError`. | New **PX-04** (lifecycle & destructive-action consistency) |
| **UXA-06** | Projects | **Archive/Restore is buried in the Settings sub-tab** with no entry point from the record header or the collection. To restore, the user must open an archived project and dig into Settings. | `ProjectSettingsTab.tsx:209-306`; header exposes only Complete/Rename `ProjectOverview.tsx:172-206`; collection offers only a *view* filter `ProjectsCollection.tsx:55`; screenshots `project-record-light`, `project-settings-light` | P1 | Whenever a user wants to remove a Project | The commonest removal in the product is the hardest to find; users conclude Projects can't be removed. | Adoption + Shared | Surface Archive in the Record Header overflow (see UXA-07) and Restore as a quick action on the Archived collection. | **PX-04** |
| **UXA-07** | All records | **No overflow (⋯) menu is rendered anywhere.** `RecordHeader` renders only inline primary/secondary buttons, and the Card's `overflowAction` slot is unused by all seven modules — so the conventional home for secondary/destructive actions doesn't exist. | `RecordHeader.tsx:95-111` (no overflow render); `Card.tsx` `overflowAction` present but passed by no module | P1 | Structural | There is nowhere consistent to put Archive/Delete/Restore/Duplicate; every module invents a different placement (UXA-05/06/08). | Shared | Implement the documented Record Header overflow slot (DESIGN_SYSTEM.md:82) and adopt the Card `overflowAction` slot; house lifecycle actions there. | New **DS-12** (overflow primitive; prerequisite for PX-04) |
| **UXA-08** | Notes vs Projects vs Tasks vs Areas/Goals/Diary | **Four different removal placements plus three absences.** Note = header button; Project = Settings tab; Task = drawer status `<select>` "Cancelled"; Area/Goal/Diary = nowhere. No shared "remove this record" convention. | `NoteOverview.tsx:94-100`; `ProjectSettingsTab.tsx:209`; `TaskDetailsTab.tsx:66`; §7 matrix | P1 | Cross-module | A user who learned removal in Notes looks in vain everywhere else; the mental model doesn't transfer. | Shared + Adoption | One shared lifecycle-action set (Archive/Delete/Restore) in one place (Record Header overflow), consumed by every module. | **PX-04** |
| **UXA-09** | Related-record rows | **`EntityLink` renders no icon/accent**, so linked-record presentation drifts: the Project Links tab manually composes an `EntityIcon` beside it, but the Project overview summary shows bare text Area/Goal links. | `EntityLink.tsx:44-86` (text only); good `TaskLinksTab.tsx:50`/`ProjectLinksTab.tsx:56` vs bare `ProjectOverview.tsx:105-120,136-151` | P2 | Every record with links | Relationships — "DalyHub's value is in the links" — look inconsistent and sometimes generic. | Shared | Give `EntityLink` an optional leading `EntityIcon` (default on); drop the hand-composed icons. | **PX-05** (icon/identity adoption) |
| **UXA-10** | Diary type filter | **Diary's own subtype icons are inconsistent within Diary.** The capture picker and timeline nodes show subtype icons, but the type-filter chips are text-only. | `diary-icons.tsx:25-40` used in `DiaryTimelineBody`/`DiaryCapture`; `DiaryTypeFilter.tsx` renders none; screenshots `diary-day-light`, `diary-timeline-light` | P3 | Diary filtering | Minor visual incoherence inside the product's best surface. | Adoption | Render the subtype icon on the filter chips too. | **PX-05** |
| **UXA-11** | Diary subtype icon map | **Diary maintains a second, module-local icon map that repurposes entity glyphs for subtypes** (`conversation`→PersonIcon, `idea`→GoalIcon, `travel`→AreaIcon, `meeting`→MeetingIcon). The last collides with the future `meeting` *entity* icon. | `diary-icons.tsx:25-35` | P3 | Latent | If Meetings ships, a Diary "meeting" subtype and a Meeting entity share a glyph — ambiguous identity. Risk of "competing icon maps." | Shared | Promote a **subtype-icon registry** as a shared concept (§5), distinct from entity identity, with its own glyphs; keep Diary as its first consumer. | **PX-05** |
| **UXA-12** | Today | **Today does not use the shared `EmptyState`; each section renders a bare inline `<p>`** with no entity icon and no next-action CTA — unlike every other collection (including Today's own `/waiting`). | `TodayDashboard.tsx:894,1017,1064,1082` vs `waiting.tsx:206` | P2 | Empty Today | Dead-end empty sections violate "no dead ends"; the calm home screen feels unfinished when quiet. | Adoption | Wire the shared `EmptyState` into each Today section. | **PX-06** (Today/module polish) |
| **UXA-13** | Today | **Today's primary action is a forked bespoke button** (`dh-today__primary` "Quick capture", not a `DrawerTrigger`), and **Quick Capture is inert** — submitting announces "not saved". | `TodayDashboard.tsx:844-852`; TODAY_DASHBOARD.md:441-446 | P2 | Daily | The home screen's headline action does nothing and looks different from every other module's create button. | Adoption + Domain | Wire Quick Capture to real task creation; use the shared primary-action pattern. | New **TODAY-07** (Quick Capture wiring) |
| **UXA-14** | Diary | **Two primary entry points on one pane** — the header "+ New entry" button *and* a floating `dh-diary-fab` — contradicting PaneHeader's "exactly one primary action." The header button is also the only create button in the product carrying a `+` icon. | `DiaryWorkspace.tsx:405-413,496-501`; screenshot `diary-day-light` | P3 | Diary | Redundant affordance; visual/interaction drift from the shared pattern. | Adoption | Keep one primary entry point per viewport (FAB on mobile, header button on desktop), matching the shared pattern. | **PX-06** |
| **UXA-15** | Diary | **Diary forks the shared Card and the Record Layout.** The timeline is a hand-rolled `dh-diary-entry` list item, and the record is an Inspector rather than `RecordLayout`/`RecordTabs`. | `DiaryTimelineBody.tsx:98-135`; `DiaryDetailsPanel.tsx` | P2 | Diary | Timeline legibility is *good* (keep it), but the fork means Diary won't inherit shared Card/record improvements automatically — a maintenance seam and DEBT-01/02 reincarnation risk. | Adoption | Where feasible, express the timeline node as a Card *preset/variant* rather than a fork, so it inherits shared behaviour; keep the timeline visual. | **PX-05/06** |
| **UXA-16** | Tasks vs Diary vs the rest | **Rename diverges.** Projects/Areas/Goals/Notes expose an identical "Rename" secondary action opening a drawer form; Tasks edit the title inline in the Details tab (no Rename action); Diary renames only in Inspector edit mode. | `ProjectOverview.tsx:190-194` + `detail.tsx:560` (shared) vs `TaskRecordDrawer.tsx:554` vs Diary Inspector | P3 | Renaming | The same verb takes three interaction shapes; muscle memory doesn't transfer. | Adoption | Converge on one rename affordance (drawer form), or document the deliberate divergence. | **PX-06** |
| **UXA-17** | All collections | **Terminology & capitalisation drift.** Create labels: "New Area"/"New Goal" (title-case noun) vs "New project"/"New task"/"New note" (lower-case) vs "Quick capture"/"New entry" (different verb). Count nouns and empty-title copy drift the same way ("No tasks here" vs "No projects yet"; "Your diary is empty"). Diary uses a curly `'` where others use ASCII `'`. | `AreasCollection.tsx:243`, `GoalsCollection.tsx`, `ProjectsCollection.tsx:335`, `TasksWorkspace.tsx:449,474`, `NotesCollection.tsx:398`, `DiaryWorkspace.tsx:388,443` | P2 | Every collection header | "Speak in the user's nouns, consistently" is violated; small drifts accumulate into an unpolished feel. | Adoption + Docs | Codify a capitalisation & label convention (sentence case; entity noun casing rule) and sweep all collections. | New **PX-06** + `DESIGN_SYSTEM.md` copy rule |
| **UXA-18** | Areas | **Area record has no Settings tab** although it *has* lifecycle state to manage (and will need Archive per UXA-05). Tabs end at Activity. | `AreaOverview.tsx` tabs; screenshot `area-record-light` | P3 | Area record | Inconsistent tab vocabulary; nowhere to house Area-level settings/removal when added. | Adoption | Add a Settings tab (Activity/Settings last) when Area lifecycle lands. | **PX-04** |
| **UXA-19** | Projects vs Tasks | **Links tab is named "Key links" on Projects but "Links" on the Task record** for the same concept. | `ProjectOverview.tsx:235` vs `TaskRecordDrawer.tsx:568` | P3 | Records with links | Minor vocabulary drift in tab names. | Adoption | Pick one label ("Links") product-wide. | **PX-06** |
| **UXA-20** | Today | **Fixture "Activity task 01–30" rows are interleaved with real data** on the live Today/Tasks surfaces, and the Daily Timeline is a fixture list, not the shared Activity Timeline. | `shell-today-light`, `tasks-matrix-light`; TODAY_DASHBOARD.md:450-452 | P2 | Today/Tasks | The home screen mixes demo data with real records; reads as unfinished and inflates the card wall. | Domain/Adoption | Retire the fixture rows; render the real Activity Timeline (existing Today backlog / DEBT-17). | Existing TODAY backlog / DEBT-17 |

---

## 5. Iconography and visual-identity audit

**Headline:** the hypothesis that "Diary has a stronger visual language because other modules are
generic" is **only partly correct**. At the *entity-identity* level, adoption is actually near-complete
and consistent. The real difference is that **Diary has a second layer — subtype icons — that the
other modules structurally lack**, and there are a few concrete adoption seams.

### Where shared Entity Identity is correctly used
One frozen map, `ENTITY_IDENTITY` (`identity.ts:87-99`), binds each of ten entity types
(area, goal, project, task, note, meeting, person, asset, diary, review) to `{label, pluralLabel, Icon,
accentVar}`. It is consumed at:
- **Collection/Pane headers** — every module passes `entityType`; `PaneHeader.tsx:56-62` renders the badge.
- **Cards** — each collection builds cards with `icon:<EntityIcon/>` (e.g. `ProjectsCollection.tsx:186`,
  `TasksWorkspace.tsx:372`, `NotesCollection.tsx:153`).
- **Record headers** — `icon={<EntityIcon/>}` on every record (areas/goals/notes/projects detail routes).
- **Empty states, Search results (per-result + group), Command Palette, Sidebar** — all consume the map.

Verified visually in `projects-light`, `areas-light`, `notes-light`, `search-light`,
`command-palette-light`.

### Where the shared identity is absent or inconsistent (the real gaps)
1. **`EntityLink` ships without an icon** (`EntityLink.tsx:44-86`). Related-record rows therefore drift:
   Links tabs manually add an `EntityIcon`, but the Project overview summary shows bare text links
   (`ProjectOverview.tsx:105-120`). **Fix at the shared component** (UXA-09).
2. **Today card nav uses a generic glyph** where an entity type isn't resolvable, and Today interleaves
   fixture rows (UXA-20).
3. **Diary type-filter chips omit the subtype icons** their sibling capture picker shows (UXA-10).

### Where Diary subtype icons are effective — and the proposed rule
Diary's timeline node carries a **subtype** icon (conversation/decision/meeting/idea/reflection…) plus a
subtype badge (`diary-icons.tsx:25-40`, `DiaryTimelineBody.tsx`). This is the scanning advantage other
modules lack, and it is *correct* — a Diary entry's identity is "Diary" but its **meaning** is its
subtype. Screenshot `diary-timeline-light` shows how much legibility this buys.

**Proposed rule — two distinct layers, never merged:**

- **Entity identity** (Area, Goal, Project, Task, Note, Diary, …): one icon + one accent per type, from
  `ENTITY_IDENTITY`. Used at identity sites (icon, card edge, chip). Never re-picked at a call site.
- **Module subtype** (Diary entry type; and, prospectively, a Task's priority quadrant, a Meeting's
  kind): a **secondary** glyph from a **shared subtype-icon registry**, visually subordinate to the
  entity icon, owned by the module that defines the vocabulary. Diary is the first consumer; promote its
  local map (`diary-icons.tsx`) to a shared, registry-based pattern so future modules don't fork it
  (UXA-11) and so it never collides with an entity glyph.

**Do not** create a competing entity-icon map for a subtype (Diary's `meeting`→`MeetingIcon` is the
current smell). Give subtypes their own glyphs in the subtype registry.

### Where secondary icons would help vs would not
- **Would help:** Task priority (a P-quadrant marker, see §6) and, later, Meeting kind and Review type —
  genuine subtypes that aid scanning.
- **Would NOT help:** adding decorative icons to Notes/Areas/Goals cards beyond their entity icon — a
  Note has no meaningful subtype; a second glyph would be decoration, not signal. **Do not add arbitrary
  icons to reach visual parity with Diary.** Parity comes from adopting the *scanning-signal* idea
  (priority/urgency for Tasks), not from decoration.

### Card / Record Header / Pane Header / Search / empty-state adoption gaps (summary)
Entity icon present and correct on all of these today. The outstanding gaps are: `EntityLink`
(UXA-09), Today empty states (UXA-12), and the Diary type-filter chips (UXA-10).

---

## 6. Priority, urgency and state specification (proposed visual grammar for Tasks)

**Design intent:** one shared signal set, driven by the *existing* canonical derivations
(`taskPriorityTag`, `priorityQuadrant`, `taskDisplayState`, `taskDateLabel`), rendered identically on
every task-bearing Card and in the Drawer. Never colour alone; readable in both themes; compact-safe;
useful at 320px; no wall of coloured pills. Verify the existing primitives first: the Card exposes
**exactly one** status pill (`Card.tsx:210-218`) and tone-free metadata chips (`:265-276`) — so priority
and urgency **cannot both be first-class today**, which is why priority is under-emphasised and overdue
leans on colour. This justifies **one** new shared primitive, a `PriorityIndicator` (or `TaskSignals`),
not a proliferation.

| Signal | Meaning | Label | Tone | Icon | Card placement | Drawer/Header placement | In compact mode? | Mobile | Non-colour cue |
|---|---|---|---|---|---|---|---|---|---|
| **P1** | Do — important & urgent | `P1` (title "P1 · Do") | strong/neutral | filled square/▲ marker | Leading `PriorityIndicator` before title | Header chip "P1 · Do" | Yes (marker + "P1") | Marker + text | Shape + letter |
| **P2** | Defer — important, not urgent | `P2` | medium | half marker | same | same | Yes | same | Shape + letter |
| **P3** | Delegate | `P3` | medium | outline marker | same | same | Yes | same | Shape + letter |
| **P4** | Delete/Review | `P4` | muted | dotted marker | same | same | Yes (may hide marker, keep "P4") | same | Shape + letter |
| **(untriaged)** | No priority set | `—` | muted | none | Optional faint "Untriaged" | "Priority —" | Omit marker | omit | Text |
| **Overdue** | `!done && due < today` | `Overdue · <date>` | danger | ⚠ / clock | Urgency chip (distinct from priority) | Planning section | Yes ("Overdue") | Yes | **Word "Overdue"** + icon, red as reinforcement |
| **Due today** | `due == today` | `Due today` | warning/info | clock | Urgency chip | Planning section | Yes | Yes | Word "Due today" |
| **Scheduled today** | `scheduled == today` | `Today` | info | calendar-check | Urgency chip | Planning section | Yes | Yes | Word "Today" |
| **Waiting** | derived waiting state | `Waiting` (+ "for X · Nd") | warning | pause/eye | Status pill | Waiting section + pill | Yes (pill) | Yes | Pill text |
| **On hold** | `status=on_hold` | `On hold` | neutral | pause | Status pill | Pill + status select | Yes | Yes | Pill text |
| **Someday** | `commitment=someday` | `Someday / Maybe` | info | horizon | Status pill | Pill + chip | Yes | Yes | Pill text |
| **Delegated** | `delegate_to set` | `Delegated to X` | neutral | person | Metadata chip | Chip | Optional (may collapse to icon) | Yes | Icon + text |
| **Completed** | spine `completedAt` | `Completed` (Today: "Done") | success | check | Status pill + strikethrough | Checkbox + pill | Yes | Yes | Check + text + strike |
| **Cancelled** | `status=cancelled` | `Cancelled` | neutral/muted | slash-circle | Status pill | Pill + status select | Yes | Yes | Pill text |

**Rules:** (a) **priority ≠ urgency ≠ display-state** — three separable slots: a leading
`PriorityIndicator`, an `UrgencyChip` (overdue/due-today/scheduled-today), and the existing single status
pill. (b) The status pill continues to carry the `taskDisplayState` label (one function, retire the
legacy one — UXA-04). (c) Reserve **danger/red** for overdue and destructive meaning only; do not tint
whole cards. (d) Standardise "Done"/"Completed" wording (pick one). (e) Adopt on the **shared Card**;
Today, Projects and Search wire the same builder (extend the Today projection to carry priority; extend
the Tasks search payload to carry priority + urgency).

**Do not** add priority to ordinary Notes. If a Note is actionable, the correct move is to **link or
convert it to a Task** — Notes remain the knowledge layer, never a second task store.

---

## 7. Entity lifecycle matrix

Legend for "domain": ✅ capability exists in kernel · ➖ not applicable/not a capability.
Legend for "UI": where the control lives, or **none**.

| Entity | Complete/Reopen | Cancel | Archive/Restore | Soft-delete/Restore | Permanent delete | Discoverability |
|---|---|---|---|---|---|---|
| **Area** | ➖ (Areas never complete — `spine-repository.ts:136`) | ➖ | ➖ domain (archive is Project-only) | ✅ domain (`spine-repository.ts:154,162`) · **UI: none** (`areas/routes/mutate.tsx:47-52`) | ➖ | **No removal path.** DISCOVERABILITY defect. |
| **Goal** | ✅ header primary (`GoalOverview.tsx:133-147`) | ➖ | ➖ domain | ✅ domain · **UI: none** (`goals/routes/mutate.tsx:85-146`) | ➖ | Complete only; **no removal.** DISCOVERABILITY defect. |
| **Project** | ✅ header primary (hidden when archived) | ➖ (uses workflow status) | ✅ domain (`project-settings-repository.ts:12-13`) · **UI: Settings tab only** (`ProjectSettingsTab.tsx:209-306`) | ✅ domain, **product uses archive instead** | ➖ | **Buried** in Settings; no header/collection entry. DISCOVERABILITY defect. |
| **Task** | ✅ (drawer/Today/bulk) | ✅ status `cancelled` via drawer select + bulk (`TaskDetailsTab.tsx:66`) | ➖ | ✅ domain · **UI: none** (cancel is the de-facto removal) | ➖ | Cancel discoverable; hard-delete absent (arguably by design). |
| **Note** | ➖ | ➖ | ➖ (notes delete, not archive) | ✅ **header "Delete" + Undo, restore from Deleted filter** (`NoteOverview.tsx:94-100`, `NotesCollection.tsx:182-198`) | ➖ | **Reference pattern.** Discoverable from record + collection. |
| **Diary entry** | ➖ | ➖ | ➖ | ✅ domain (generic `EntityRepository`) · **UI: none** (`diary/routes/mutate.tsx`) | ➖ | **No removal path.** DISCOVERABILITY defect. |

**Cascade/dependency reality (already enforced in the spine):** `softDelete` **never cascades and
refuses a non-empty container** (`SpineHasActiveChildrenError`, `spine-repository.ts:66,147-153`);
restore requires the retained parent still be active; Project archive is blocked by unfinished direct
tasks (`ProjectArchiveBlockedError`). So a coherent lifecycle can be built on existing guarantees.

### Recommendations
- **Reversible removal first.** Adopt the Notes soft-delete/restore pattern (single click + Undo toast;
  Active/Deleted or All/Archived segmented filter for durable restore) for **Area, Goal, Diary** now.
  Domain support already exists — this is UI work, not a migration.
- **"Delete Area" should mean *soft-delete an empty Area*.** Because the spine refuses to delete an Area
  with active children, "Delete" surfaces the precondition explicitly: if the Area still owns active
  Goals/Projects, the confirm dialog explains "Move or remove its N items first" (or offers to archive).
  Never hard-delete a hierarchy record; never cascade. Do **not** silently orphan or move descendants.
- **Project Archive should be surfaced outside Settings.** Put Archive/Restore in the **Record Header
  overflow** (UXA-07) and Restore as a **collection quick action** on the Archived filter — keep the
  Settings controls too, but they must not be the *only* entry.
- **Goals:** complete/reopen already exists; add **soft-delete/restore** (not archive — archive is a
  Project operational concept). A completed Goal stays visible/reopenable; a deleted Goal leaves via the
  Deleted filter.
- **Permanent delete** is not a domain capability anywhere and should **stay out of the primary UI**. If
  ever added, it belongs only inside a Deleted/Archived collection, behind typed-confirmation, preserving
  Activity/referential integrity (Activity is append-only by design).
- **Consistent placement:** destructive/restorative actions live in the **Record Header overflow** (and
  the Card `overflowAction` for quick access), never only in a Settings sub-tab; confirmation friction
  scales with reversibility (Undo-first for reversible; `ConfirmationDialog`/typed phrase only for
  blocked or irreversible actions) — exactly the ADR-042 rule, applied uniformly.

**Discoverability vs domain, restated:** every gap above except "permanent delete" and "Area/Goal
archive" is a **discoverability/missing-UI** defect (the capability exists); permanent delete and
Area/Goal *archive* are genuinely **missing domain capabilities** and should be treated as product
decisions, not bugs.

---

## 8. Cross-module consistency matrix

`✔` consistent · `~` partly consistent · `✗` inconsistent · `–` n/a. Evidence in §4 and the agent
citations above.

| Pattern | Today | Tasks | Projects | Areas | Goals | Notes | Diary |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Collection header (shared PaneHeader) | ~ (no entityType icon) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Primary create action (label + DrawerTrigger) | ✗ (bespoke, inert) | ✔ | ✔ | ✔ | – (read-only) | ✔ | ✗ (icon + 2nd FAB) |
| Card anatomy (shared Card) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✗ (fork) |
| Overflow / lifecycle actions | ~ (quick actions) | ✔ (none) | ✔ (none) | ✔ (none) | ✔ (none) | ~ (restore qa) | ✗ (fork edit) |
| Filters (SegmentedFilter/FilterBar) | – | ✔ | ✔ | – | – | ✔ | ~ (custom chips) |
| Empty states (shared EmptyState) | ✗ (inline `<p>`) | ✔ | ✔ | ✔ | ~ | ✔ | ✔ |
| Record tabs (Activity/Settings last) | – | ~ (Links) | ✔ | ~ (no Settings) | ✔ | ✔ | ✗ (Inspector, no tabs) |
| Rename flow | – | ✗ (inline) | ✔ | ✔ | ✔ | ✔ | ✗ (Inspector) |
| Loading / error slots | ~ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Entity icon + accent | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ (+subtype) |
| Status/priority presentation | ✗ (no priority) | ~ (grey chip) | ✗ (3-state, no priority) | – | ✔ | – | – |
| Lifecycle/removal placement | – | ~ (cancel) | ✗ (Settings only) | ✗ (none) | ✗ (none) | ✔ (header) | ✗ (none) |
| Terminology & capitalisation | ✗ | ~ | ✔ | ✔ (Title-case) | ✔ (Title-case) | ✔ | ✗ (curly `'`, "New entry") |

Reading of the matrix: **Projects, Areas, Goals, Notes are the consistent core** (they compose the same
shared primitives near-identically). **Today and Diary are the two forkers** (Today forks primary
action + empty states; Diary forks Card + record + create), and **Tasks** is the module whose *record*
diverges (drawer, inline rename) and whose *signal presentation* is the weakest.

---

## 9. Ranked improvements (highest value first, in implementation order)

| # | Improvement | User benefit | Modules | Shared-system work | Size | Risk | Dependencies | Parallel-safe? |
|---|---|---|---|---|---|---|---|---|
| 1 | **Shared `PriorityIndicator` + `UrgencyChip`** (§6) and retire `taskDisplayStatus` | Triage at a glance; overdue/due-today never colour-only | Tasks, Today, Projects, Search | New shared component; extend Card builder inputs | M | Low–Med (touches TASKS-01) | none | Yes (own component) |
| 2 | **Record Header overflow (⋯) menu** + adopt Card `overflowAction` (`DS-12`) | A consistent home for secondary/destructive actions | All records | Implement documented `RecordHeader` overflow slot | S–M | Low | none | Yes |
| 3 | **Unify lifecycle: Archive/Delete/Restore in the overflow** across Area, Goal, Diary (adopt Notes pattern); surface Project Archive in header + collection | "How do I remove this?" answered everywhere | Areas, Goals, Diary, Projects | Shared lifecycle action set; wire spine/entity soft-delete UI | M–L | Med (blocked-precondition UX) | #2 (overflow) | After #2 |
| 4 | **`EntityLink` gets a leading `EntityIcon`** (default on) | Consistent, iconned relationships everywhere | All | One shared component change | S | Low | none | Yes |
| 5 | **Promote a shared subtype-icon registry**; keep Diary as first consumer; add icons to Diary type-filter chips | Diary-grade scanning available product-wide without forks | Diary (+future) | New shared registry alongside entity identity | S–M | Low | none | Yes |
| 6 | **Wire shared `EmptyState` into Today sections (`PX-06`); wire Quick Capture to real creation (`TODAY-07`)** | Calm home never dead-ends; headline action works | Today | Adopt EmptyState; reuse create pattern | S–M | Low–Med | task-create wiring (TODAY-07) | Yes |
| 7 | **Retire Today/Tasks fixture rows; render the real Activity Timeline** | Home shows real data, not demo rows | Today | Replace fixtures with shared Activity Timeline | M | Med | DEBT-17 | Yes |
| 8 | **Converge terminology & capitalisation** (labels, count nouns, empty copy, apostrophes) + add a copy rule to DESIGN_SYSTEM | Product speaks one voice | All collections | Copy convention doc + sweep | S | Low | none | Yes |
| 9 | **Diary: one primary entry point per viewport; express timeline node as a Card variant** | Fewer redundant affordances; Diary inherits shared Card gains | Diary | Card variant/preset for timeline | M | Med (preserve the good timeline) | #4/#5 helpful | Partly |
| 10 | **Converge rename + tab labels** (Rename affordance; "Links" not "Key links"; add Area Settings tab) | Muscle memory transfers across records | Tasks, Areas, Projects | minor shared adjustments | S | Low | #2 (Area Settings ↔ overflow) | Yes |

---

## 10. Proposed implementation slices (small, reviewable PRs)

Sequence follows the brief's recommended order (shared semantics → task signals → lifecycle → adoption),
adjusted so the **overflow menu (structural) lands before the lifecycle work that depends on it**.

> Model guidance below: **Codex** for well-specified, high-volume, mechanical adoption sweeps and
> single-component changes with clear contracts; **Claude Opus** for slices needing design judgement,
> new shared primitives, ambiguous lifecycle UX, or cross-cutting reasoning.

### PR-1 — `TASKS-02` Shared task signal presentation
- **Scope:** Add `PriorityIndicator` + `UrgencyChip` shared components (§6); render on the shared Card
  for Tasks/Today/Projects; add "Overdue"/"Due today"/"Scheduled today" textual urgency; retire
  `taskDisplayStatus` in favour of `taskDisplayState` on Projects; extend the Today projection and the
  Tasks search payload to carry priority. **Rendering signals in Search also requires extending the
  shared search result contract + surface** — `SearchResultItem` (`app/kernel/modules/module-capabilities.ts`)
  and `SearchOption` (`app/shared/search/SearchSurface.tsx`) render only icon/title/subtitle/type today,
  so add an optional signal/metadata slot there. It **also** needs a **bounded, workspace-scoped task-search
  projection**: the current provider resolves results via `searchLinkTargets` (`EntityLinkTargetOption` =
  id/type/title only), so priority/due/scheduled must be returned by one query — never a per-result `getTask`
  N+1. **If that projection is out of scope for this slice, drop Search from its acceptance criteria** and give
  Search signals a dedicated follow-up rather than shipping an N+1 or an unpopulated signal.
- **Shared files:** `app/shared/card/*`, new `app/shared/task-signals/*`, `app/shared/task-record/task-view.ts`,
  `app/shared/search/SearchSurface.tsx`, `app/kernel/modules/module-capabilities.ts` (search result contract),
  a bounded task-search projection behind `tasks/search.ts` (or Search deferred).
- **Module files:** `tasks/TasksWorkspace.tsx`, `today/TodayDashboard.tsx` + `task/planning-view.ts`,
  `projects/ProjectTasksTab.tsx`, `tasks/search.ts`.
- **Exclusions:** No new lifecycle actions; no icon-registry work.
- **Data/migration:** none (all signals already modelled).
- **Tests:** unit for the new components + `taskDateLabel` due-today branch; e2e asserting "Overdue"
  text appears (not colour-only) and priority renders on Today/Project cards.
- **Screenshots:** Tasks Focus/Matrix, Today, Project tasks, Search — light + dark, 320px.
- **Merge deps:** none. **Model:** **Claude Opus** (new primitive + colour-only correctness judgement).

### PR-2 — `DS-12` Record Header overflow menu (structural)
- **Scope:** Define the shared overflow **menu-item model** (an ordered list of `CardAction`/`AppAction`),
  then implement the documented `RecordHeader` overflow (⋯) menu and generalise the Card's single
  `overflowAction` into a menu (`overflowActions`) — preserving the existing one-item case. Deliver the
  menu container + item model + a11y (menu button, focus, keyboard, `aria`); no lifecycle actions wired yet.
  (If generalising the Card is larger than wanted, ship the `RecordHeader` menu here and defer Card-menu
  adoption to PR-3.)
- **Shared files:** `app/shared/record-layout/RecordHeader.tsx`, `app/shared/card/Card.tsx` + `card/types.ts`
  (generalise `overflowAction` → `overflowActions`), Design System (Card contract + overflow pattern).
- **Module files:** none (lifecycle wiring lands in PR-3).
- **Exclusions:** No lifecycle behaviour; no per-module action wiring.
- **Data/migration:** none. **Tests:** component + axe (menu semantics), keyboard e2e.
- **Screenshots:** a record with an open overflow menu, light + dark, mobile.
- **Merge deps:** none. **Model:** **Codex** (well-specified component, clear contract).

### PR-3 — `PX-04` Unified lifecycle & destructive-action consistency
- **Scope:** One shared lifecycle action set (Archive/Delete/Restore) housed in the overflow; adopt
  soft-delete/restore UI for **Area, Goal, Diary** (Notes pattern: click + Undo, Deleted/All filter);
  surface **Project Archive** in the header overflow + Restore as an Archived-collection quick action;
  add an Area **Settings** tab. Honour existing `SpineHasActiveChildrenError` with an explanatory
  confirm for blocked hierarchy deletes.
- **Shared files:** `app/shared/record-layout/*` (action wiring), `app/shared/settings/*`
  (DangerousAction reuse), `app/shared/feedback/*` (Undo).
- **Module files:** `areas/routes/mutate.tsx` + `AreaOverview.tsx`, `goals/routes/mutate.tsx` +
  `GoalOverview.tsx`, `diary/routes/mutate.tsx` + Diary detail/collection, `projects/ProjectOverview.tsx`
  + `ProjectsCollection.tsx`.
- **Exclusions:** No permanent-delete; no new kernel capability (soft-delete already exists).
- **Data/migration:** **none** (domain already supports it) — call this out explicitly.
- **Tests:** e2e delete+undo+restore per entity; blocked-delete precondition message; kernel unchanged.
- **Screenshots:** each record's overflow with lifecycle actions; Deleted/Archived collections; confirm
  dialogs — light + dark, mobile.
- **Merge deps:** PR-2 (`DS-12`). **Model:** **Claude Opus** (lifecycle UX, precondition messaging, cross-module).

### PR-4 — `PX-05` Identity adoption: EntityLink icon + subtype-icon registry
- **Scope:** Give `EntityLink` an optional leading `EntityIcon` (default on); drop hand-composed icons;
  promote Diary's subtype map to a shared subtype-icon registry (distinct from entity identity) and add
  icons to the Diary type-filter chips; resolve the `meeting` subtype/entity glyph collision.
- **Shared files:** `app/shared/entity/EntityLink.tsx`, new `app/shared/entity/subtype-icons.ts`.
- **Module files:** `diary/diary-icons.tsx` → shim over the shared registry; `DiaryTypeFilter.tsx`;
  remove redundant `EntityIcon` at `TaskLinksTab.tsx`/`ProjectLinksTab.tsx`; `ProjectOverview.tsx` links.
- **Exclusions:** No new decorative icons on Notes/Areas/Goals cards.
- **Data/migration:** none. **Tests:** component snapshots; e2e that linked rows show an icon.
- **Screenshots:** a record's Links tab/summary; Diary filter chips — light + dark.
- **Merge deps:** none (parallel-safe). **Model:** **Codex** (mechanical, well-specified).

### PR-5 — `PX-06` Cross-module polish & copy convention
- **Scope:** Wire shared `EmptyState` into Today sections; converge create labels/count nouns/empty copy
  and apostrophes to one convention (add the rule to `DESIGN_SYSTEM.md`); one rename affordance; "Links"
  tab label; single Diary primary entry point per viewport.
- **Exclusions (own slices):** Wiring Today's Quick Capture to real creation is **`TODAY-07`**, not this
  slice (this slice adopts the shared `EmptyState` for Today's *empty* sections but does not make the
  capture field functional); retiring the Today/Tasks fixture rows and rendering the real Activity
  Timeline is the existing TODAY/DEBT-17 concern.
- **Shared files:** `DESIGN_SYSTEM.md` copy rule; minor `EmptyState`/PaneHeader adoption.
- **Module files:** `today/TodayDashboard.tsx`, all `*Collection.tsx`, `DiaryWorkspace.tsx`,
  task/diary rename surfaces.
- **Exclusions:** No structural Card/record changes.
- **Data/migration:** none. **Tests:** e2e empty-state CTA on Today; snapshot copy.
- **Screenshots:** Today empty; each collection header — light + dark, mobile.
- **Merge deps:** none. **Model:** **Codex** (high-volume mechanical sweep with a written convention).

> **Do not** bundle these into one PR. Each is independently reviewable and, except PR-3 (needs PR-2),
> can run in parallel.

---

## 11. Decisions requiring owner input

1. **Should "Delete Area/Goal" exist at all, or only Archive?**
   *Recommended default:* provide **soft-delete + restore** (reversible) for Area, Goal and Diary now
   (domain supports it); defer any *hard* delete. Areas/Goals do not get a separate "archive" concept —
   archive stays a Project-only operational state.
2. **What happens to a non-empty Area/Goal on delete?**
   *Recommended default:* **block** with an explanatory confirm ("Move or remove its N active items
   first"), reusing the existing `SpineHasActiveChildrenError`. No cascade, no silent orphaning.
3. **Where is the single home for destructive actions?**
   *Recommended default:* the **Record Header overflow (⋯)** everywhere, plus a Card `overflowAction` for
   quick access; Settings-tab controls remain but are never the only entry.
4. **"Done" vs "Completed" wording for tasks.**
   *Recommended default:* standardise on **"Completed"** (matches Projects/Goals); drop Today's "Done".
5. **Should the Diary timeline node become a Card variant, or stay a deliberate fork?**
   *Recommended default:* express it as a **Card preset/variant** so it inherits shared behaviour, while
   preserving the current timeline visual exactly. If a variant proves lossy, document the fork as an
   accepted exception in `DESIGN_SYSTEM.md`.
6. **Permanent delete — build it?**
   *Recommended default:* **no**, for now. Activity is append-only and referential integrity matters; if
   ever added, restrict to a Deleted/Archived collection behind typed confirmation.

---

## Verification

- **No application code, migration, dependency, or test was changed.** The only committed changes are
  this audit document, updates to `PRODUCT_DEBT.md` and `ROADMAP_V2.md`, and the retained screenshot
  artefacts under `docs/product/assets/ui-audit-2026-07/`.
- The running-product review used a **local-only, uncommitted** D1 enrichment (Notes/Diary/varied task
  states) applied to the Miniflare database purely to make states observable; it is not part of the
  working tree and does not touch production or the committed fixtures.
- Documentation formatting/link conventions were followed (new debt entries match the `PRODUCT_DEBT.md`
  template; new roadmap items match the `ROADMAP_V2.md` field format).
- **No product behaviour was changed; nothing was merged or deployed.**

---

*Related: [`PRODUCT_EXPERIENCE.md`](../design/PRODUCT_EXPERIENCE.md) (the composition contract this audit
extends) · [`PRODUCT_DEBT.md`](PRODUCT_DEBT.md) (confirmed inconsistencies added below DEBT-26) ·
[`ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md) (new PX-04/PX-05/PX-06 and TASKS-02 homes) ·
[`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md).*

## Post-audit implementation note (2026-07-28)

UX-01 implements a substantial Tasks/Meetings usability slice after this audit was
written. See [`UX_01_IMPLEMENTATION_NOTE_2026_07_28.md`](UX_01_IMPLEMENTATION_NOTE_2026_07_28.md)
for the exact completed and remaining scope. In short: Tasks gained fast capture,
validated default capture parent preferences, removable deterministic chips,
concise priority labels and an Upcoming system view; Meetings gained shared
creation forms, owner-timezone datetime conversion, searchable attendees, a
five-tab record, explicit Action items, Action-only Follow-up semantics and shared
Cards in the collection. The larger audit backlog remains active where not named
in that note.

## Post-audit implementation note (MOBILE-01, 2026-07-28)

MOBILE-01 followed UX-01 and closed several audit findings from the *mobile*
direction. Recorded here so the audit backlog stays honest about what remains.

**Closed by MOBILE-01:**

- **Today's inert Quick Capture (UXA-13 / TODAY-07).** The fixture textarea that
  announced "not saved" is gone. Today's capture is the shared capture surface,
  posting to each module's canonical creation route. The audit's concern — the
  app's most prominent action creating no record — no longer applies.
- **Duplicate primary entry points on Diary.** PX-06 reduced Diary to one primary
  create action per viewport by pairing a desktop header button with a phone
  floating action. MOBILE-01 retired the floating action entirely (a bottom
  navigation bar with its own Capture control makes a FAB a second accent button
  in the same corner) and shows the header button at every width. Diary now has
  one in-page primary create action, full stop, rather than one per viewport.
- **Capture drift across modules.** Seven surfaces were free to invent their own
  "create something quickly". There is now ONE shared framework over the modules'
  canonical authorities; a module adding a capture type changes one place.
- **Placeholder actions on the Person record.** Three quick actions that only
  raised a toast now create real records.

**Explicitly NOT closed, and why:**

- **DEBT-01, Diary half.** The hand-rolled day-timeline node was left as-is and
  re-scoped to [DEBT-46](PRODUCT_DEBT.md) — a timeline node is a genuinely
  different presentation from a Card, and converting it to close a debt entry
  would be worse product on the surface the mobile pass exists to serve. The
  Meetings half was already resolved by UX-01.
- **Capture context.** MOBILE-01 deliberately left this open. ADR-060 later added
  the shared capture-context contract, context chip and canonical-route
  reconciliation for the implemented Quick Capture paths, but [DEBT-45](PRODUCT_DEBT.md)
  remains only partially addressed until every entry point, full-form hand-off,
  mobile/a11y proof and partial-failure path is verified.

---

## Post-audit implementation note (TASKS-03, 2026-07-28)

The Tasks collection experience was completed. Its relationship to this audit is
narrower than it might look, and worth stating precisely.

**What this audit had already resolved, and TASKS-03 preserved unchanged.** The
§6 priority/urgency/state visual grammar shipped as TASKS-02 and is intact: a
card still renders priority ≠ urgency ≠ display-state as three separable slots,
each carrying its meaning in a WORD, with colour as reinforcement only. TASKS-03
added no new signal and removed none; it added `waiting` as a low-priority
metadata item so a blocked row says so in text, and it passes the shared density
through rather than forking CSS.

**What TASKS-03 closes that this audit did not raise.** The audit examined
presentation coherence and did not reach the Tasks workspace's *information
architecture* — that two of its four "primary views" were a system view and the
absence of a filter wearing a layout switcher's clothes, and that a filtered list
could not explain itself. Both are now fixed, and the second produced a genuinely
shared pattern: `CollectionFilterChips` gives every collection a way to say, where
the records would be, which filters are hiding them — in words, with a labelled
remove control each and one explicit reset.

**One audit-adjacent defect was found and fixed at its root.** Driving the real
product surfaced a shared **DS-04/DS-12 stacking-context** bug: a Card creates its
own stacking context (the swipe surface is positioned so the tray can sit behind
it), which capped an open overflow menu inside its card — so in a long collection
the next card and the sticky header painted over the menu and its items were
unclickable. It affected every Card in the product and had simply never been hit,
because existing specs opened menus on short lists. Fixed in the shared layer by
raising the card to the dropdown layer while its menu is open.

**One was found and deliberately NOT papered over.** The shared Card's quick
actions are raised to 44px under `@media (hover: none)` — a touch device — so a
narrow viewport driven by a *mouse* keeps a 28px control. The touch-target
assertion was moved to the touch-emulated phone block, where the product genuinely
meets the target, rather than widened to hide the gap, and the gap is recorded as
[DEBT-50](PRODUCT_DEBT.md#-debt-50--card-quick-actions-are-28px-on-a-narrow-viewport-with-a-mouse--p3).

**Still open from this audit, unchanged:** DEBT-01's Diary half
([DEBT-46](PRODUCT_DEBT.md)), capture context ([DEBT-45](PRODUCT_DEBT.md)), and
task signals in global Search
([TASKS-02b](../roadmap/ROADMAP_V2.md#-tasks-02b--task-signals-in-global-search)).
