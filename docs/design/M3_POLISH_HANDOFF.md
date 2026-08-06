# M3 visual polish — handover

**PR #121 is MERGED.** Gate D unit 1 (Areas and Projects) continues on
`claude/m3-areas-projects-axf33x` · **PR:** [#122](https://github.com/acedaly/DalyHub-V2/pull/122).
Do not reopen #121, do not resume its branch, and do not repeat the audit — it is done and merged.

The design direction, surface tones, shell anatomy, icon architecture and gate list are in
[`M3_POLISH_AUDIT.md`](M3_POLISH_AUDIT.md), Appendix A. **Read [§8](#8-gate-d--areas-and-projects)
before touching either collection**; it records what the Areas and Projects cards now render, which
numbers are exact and which are bounded, and the four defects the capture pass and review found.

<details>
<summary>The PR #121 header, kept for reference</summary>

**Branch:** `claude/m3-visual-polish-6oq9z2` · **PR:** [#121](https://github.com/acedaly/DalyHub-V2/pull/121)
**Resume from this branch.** Do not open a second PR and do not repeat the audit — it is done and committed.

</details>

The authoritative reference mock-up is at
[`assets/m3-polish-2026-08/reference/dalyhub-dashboard-reference.png`](assets/m3-polish-2026-08/reference/dalyhub-dashboard-reference.png).
This document is the *state of the work*, not the specification.

---

## 1. What is on the branch

| Commit | Delivered |
|---|---|
| `ab3122e` | The whole-product visual audit after PR #120, plus 86 current-state captures and `measurements.json`. Gate A. |
| `71b083f` | **Pre-existing fix.** Pinned the recurrence route's clock — the test's successor date depended on the wall clock and had started failing on `main`. |
| `880502c` | Dropped an unused import that the clock fix left behind (caught by CI, not locally). |
| `d3b8162` | **Gate B.** Generated app-neutral surfaces; the desktop top app bar; the compact drawer; the expanded `PaneHeader`; 15 new structural tokens and 3 renames; 5 new surface tests. |
| `3aa1e45` | Gate B review changes: `primary-container` selected navigation, appearance indicator removed, and the **banner moved to the top app bar** (which fixed a real axe `region` failure on Help and About). |
| `115f5f8` | **Pre-existing fix.** `export.spec.ts` asserted `snapshotSchemaVersion === 1`; ADR-074 bumped it to 2 and missed this. |
| `b94d79d` | The reference mock-up checked in, renamed and linked from the audit and the docs index. |
| `24471c6` | **Gate C.** The shared card family: `DashboardCard`, `MetricTile`/`MetricRow`, `RecordRow`/`RecordRowList`, `EntityCard`/`EntityCardGrid`, `Timeline`/`TimelineItem`, and `app/styles/card-family.css`. |
| `8675bf8` | The icon-key foundation (migration, vocabulary, catalogue, resolver, tests); the card-family fixture moved to its own route; the narrow-container grid fix; a fourth pre-existing fix (`data-density` → `data-card-density`). |
| `681d551` | **CI correction.** Four e2e contracts realigned with the approved shell — the brand assertion, two `visual-system` surface tests still reading retired `--dh-color-*` tokens, a brittle `.first()` link selector, and three page-wide "Task completed" negatives that matched Recent activity. |
| `5ded9ff` | **Real fix.** The capture FAB overlapped the bulk-action bar on a phone and ate its trailing controls; Cancel could not be tapped. `CollectionLayout` now flags an active selection and the shell hides the FAB for its duration. |
| `9277a2b` | Icon persistence: kernel types, repository reads/writes, `setIcon`, snapshot + vault export. |
| `ea47d17` | 17 kernel tests for the persistence contract. **Corrected a wrong claim**: `project_details` is sparse for a new Project, not dense, so the upsert is load-bearing. |
| `b3b366f` | Export round-trip coverage — 7 unit tests, 3 more kernel tests. |
| `d733ba9` | Route-boundary validation (`readEntityIconField`), create/update wiring for both modules, and record loaders carrying the key only. |
| `5ecefea` | The shared `EntityIconPicker`, composed over `Sheet`, integrated into New/Edit Area and New/Edit Project; both record headers switched to `RecordIcon`. |
| (this commit) | Picker approval gate: 7 browser tests, partial seed icons, the duplicate/clone audit, 17 captures, and two defects the captures exposed. |

### First fully green CI run

`b3b366f` is the first head on this branch where **all 19 checks passed** — static
quality, unit, kernel, production build and all 14 Playwright shards. Earlier red runs
on this branch were: three cancellations caused by pushing while a run was in flight,
two runner-infrastructure faults (a Playwright browser download returning `403 … not
available in your location`, and a Chromium `SIGSEGV` that struck a different spec each
time it appeared), and the genuine failures fixed in `681d551`/`5ded9ff`.

`main` itself was red across every recent run at the time, on the same shards plus the
kernel job. That is context, not a licence: this branch's head is expected to be green.

### Four pre-existing failures found and fixed

None were caused by this branch. All four were PR #120 leftovers, and all four are fixed here on
their own commits so they are separable from the visual work.

1. `task-recurrence-route.test.ts` — wall-clock-dependent successor date.
2. `product-frame.spec.ts:57` — asserted a "Daly Light" theme button ADR-074 deleted. **Inverted**
   rather than removed, so the account menu cannot quietly grow a theme picker back.
3. `export.spec.ts:120` — stale `snapshotSchemaVersion`.
4. `cards-filters.spec.ts:70` — asserted `data-density`; `Card` emits `data-card-density`.

---

## 2. Gate status

| Gate | State |
|---|---|
| A — audit | **Complete and approved.** |
| B — surfaces and shell | **Complete and approved**, including the review changes. |
| C — shared components | **Foundation complete and approved.** The five components exist, are tested and are demonstrated. **No module consumes them yet.** |
| Icons — persistence | **Complete and tested**, form boundary through to export — see §4. |
| Icons — picker and form integration | **Complete**, with browser coverage and an approval-gate capture set — see §4. |
| D — entity collections | **Areas and Projects complete** (PR #122) — see §8. Tasks, Goals and the rest not started. |
| E — records and forms | Not started. |
| F — remaining modules | Not started. |
| G — Today | Not started. |
| H — responsive, a11y, docs | Not started. |

**Areas and Projects are migrated (PR #122). Nothing else is.** Tasks, Goals, Notes, Diary,
Meetings, People, Assets, Reviews, AI, Settings and Help all still render exactly as the audit
describes them. That is deliberate: the migration advances one coherent unit at a time rather than
spreading thin.

---

## 3. Where things live

### Shared card family
`app/shared/card/` — `DashboardCard.tsx`, `MetricTile.tsx`, `RecordRow.tsx`, `EntityCard.tsx`,
`TimelineItem.tsx`, exported from `app/shared/card/index.ts`. Styles in
`app/styles/card-family.css` (imported by `app/app.css`). Fixture at
`app/routes/design-card-family.tsx`, route `/design/card-family`, dev-only.

**Do not put the fixture back on `/design/cards-filters`.** That route's spec asserts against the
cards it renders; a second set broke five of its assertions.

### Icons
| Thing | Location |
|---|---|
| Migration | `migrations/0032_add_entity_icon_keys.sql` — **current migration number is 0032**; the next is 0033 |
| Columns | `area_details.icon_key` and `project_details.icon_key`, both `TEXT NULL` |
| Vocabulary + validation | `app/kernel/entities/entity-icon-keys.ts` — `ENTITY_ICON_KEYS` (34 keys), `isEntityIconKey`, `normaliseEntityIconKey`, `isRejectedEntityIconKey` |
| Catalogue | `app/shared/entity/entity-icon-catalogue.tsx` — key → component, label, category, search terms |
| Resolver | `app/shared/entity/RecordIcon.tsx` |
| Tests | `test/unit/entity-icons/catalogue.test.ts` — 16 tests |

The vocabulary is bounded by the **icon set**: every key resolves to an icon already exported
through `createIcon`. Adding `fitness` means adding the glyph first. `people` was dropped because
there is no `PeopleIcon`. The catalogue test fails if the kernel list and the UI catalogue disagree.

Migrations must be **ASCII-only** — `test/unit/migrations/d1-parser-compatibility.test.ts` rejects
non-ASCII as a remote-D1 statement-splitting hazard. An em-dash in a comment is enough to fail it.

---

## 4. Icon persistence — state

The entity-icon unit is **complete**: persistence from the form boundary through to
export, the shared picker, integration into all four flows, browser coverage and an
approval-gate capture set.

| Path | State |
|---|---|
| Kernel domain types (`AreaSettings.iconKey`, `ProjectSettings.iconKey`) | **done** |
| Repository interfaces (`setIcon`) | **done** |
| D1 reads, with normalisation on the way OUT | **done** |
| D1 writes / reset-to-null (upsert) | **done** |
| Route-boundary validation (`readEntityIconField`) | **done** |
| Create + update routes, both modules | **done** |
| Record loaders (key only, serialisable) | **done** |
| Snapshot types, D1 snapshot reader, vault frontmatter | **done** |
| Round-trip preservation tests | **done** |
| Picker (`app/shared/entity/EntityIconPicker.tsx`) | **done** |
| Form integration (New/Edit Area, New/Edit Project) | **done** |
| e2e seed fixtures | **done** — partial on purpose, see below |
| Duplicate / clone flows | **audited: none exist.** The only `duplicate` in the product is `taskViews.duplicate` (saved Tasks views), which carries no entity icon. There is nothing to preserve. |
| Browser coverage (`e2e/entity-icons.spec.ts`) | **done** — 7 tests |
| Approval-gate captures | **done** — 17 images under `assets/m3-polish-2026-08/icon-picker/` |
| Collection loaders (`listAreas`, `listProjects`) | not done — needed for Gate D |
| Activity metadata | deliberately none; see below |

### Decisions worth not re-litigating

- **No snapshot schema bump.** `iconKey` is additive and optional-by-`null`, which the
  policy in `workspace-snapshot.ts` explicitly says does not bump the version.
  `export.spec.ts` stays at 2.
- **No Activity event for choosing an icon.** The events in these slices mark
  transitions that change what a record IS — archived, restored, status. A feed that
  logs every appearance tweak buries them.
- **Export preserves an unrecognised key verbatim; reads degrade it to `null`.** The two
  directions disagree on purpose: a record must render, and an archive must not lose a
  choice whose glyph was removed in one release and restored in the next. Both
  directions are asserted in `entity-icon-round-trip.test.ts` and
  `entity-icon-settings.test.ts`.
- **Both detail tables are sparse for a new record.** `createArea` and `createProject`
  write no detail row, and migration 0008's backfill only covered Projects existing at
  the time. `setIcon` must upsert; a plain `UPDATE` affects no rows and still reports
  success.
- **An invalid key is refused, never stored as `null`.** Silently normalising tells the
  owner their choice was saved and then shows a default.

### Why the seed is deliberately partial

`e2e/seed-tasks.sql` gives `a-health` and `pr-website` an icon and leaves `a-dh`
and `pr-launch` without one. Seeding every record would make the FALLBACK path
untestable in a browser; seeding none would make the persisted path untestable.
Both assertions matter, so the fixture carries both cases.

### The next step, exactly

**~~Gate D — Areas and Projects.~~ DONE in PR #122 — see [§8](#8-gate-d--areas-and-projects).**
The collection loaders now carry `iconKey`. The next unit is **Tasks** (`RecordRow`, one compact
toolbar, grouping, the duplicated state indicators), then the remaining collections.

<details>
<summary>The original outstanding-paths table, kept for reference</summary>



| Path | State | Where |
|---|---|---|
| Repository read | not done | `app/platform/storage/d1/d1-area-settings-repository.ts`, `d1-project-settings-repository.ts` — both already `INSERT … ON CONFLICT DO UPDATE`, so an upsert of `icon_key` fits naturally |
| Repository write | not done | a `setIcon(id, key)` on each settings repository |
| Kernel domain type | not done | `AreaSettings` in `app/kernel/area-settings/area-settings.ts` is `{ archivedAt }` only; the Project equivalent is in `app/kernel/project-settings/` |
| Repository interface | not done | `app/kernel/area-settings/area-settings-repository.ts` and the Project equivalent |
| Create commands | not done | `app/modules/projects/routes/new.tsx`, the Area equivalent |
| Update commands | not done | the `:id/mutate` route in each module |
| Validation at the boundary | not done | use `isRejectedEntityIconKey` to REFUSE a bad key rather than silently storing null |
| Route actions | not done | Area and Project create/edit |
| Forms | not done | `app/modules/projects/NewProjectForm.tsx` and the Area equivalent |
| Loaders | not done | must pass the serialisable KEY only, never a component |
| Test fixtures | not done | `e2e/seed-tasks.sql` has no `icon_key` values |
| Import | not done | `app/platform/export/` |
| Export | not done | `app/platform/export/build-snapshot.ts`, `manifest.ts` |
| Workspace snapshots | not done | `app/kernel/export/workspace-snapshot.ts` — **bumping the snapshot schema version means updating `export.spec.ts:120` in lockstep**; that mismatch is one of the four pre-existing failures above |
| Vault export | not done | `app/platform/export/vault/build-vault.ts` |
| Clone / duplicate | not done | wherever a Project or Area is duplicated |
| Activity metadata | not done | only where the module already records attribute changes |

</details>

### Picker — built

`app/shared/entity/EntityIconPicker.tsx`. One component for both entities and both
breakpoints: it composes the shared `Sheet`, which `sheet.css` already renders as a
bottom sheet on a phone and a centred dialog above 48rem, so there is no second focus
trap, scroll lock or inert wrapper anywhere in this feature.

Two defects the approval captures exposed, both fixed before the gate:

1. **Captured mid-animation.** The sheet scales and fades in, and the first capture pass
   caught it semi-transparent with the page showing through. The harness now passes
   `animations: "disabled"`.
2. **The staged preview was not actually pinned.** The CSS comment claimed it was, but it
   was merely the first child — clicking a glyph near the bottom of the catalogue
   scrolled it into view and carried the preview off the top, making Apply exactly the
   guess it exists to prevent. Preview and search are now one opaque sticky band.

**Known cosmetic remainder:** a few pixels of the topmost icon row are still visible above
the sticky band. It is a seam between the sheet body's own padding and the band's
background, not an overflow, and it does not affect behaviour or any assertion.

### Original picker requirements

One shared `EntityIconPicker` used by both Areas and Projects. Requirements (Appendix A.3):

- desktop: accessible popover or dialog using the existing shared patterns
- mobile: accessible bottom sheet or modal using the existing shared infrastructure
- current icon preview, search, category groups, icon grid, visible icon names, selected state
- reset to default, cancel, apply where the form pattern requires it
- 44px targets, visible focus, accessible labels
- selected state conveyed by check/shape **and** ARIA, never colour alone
- keyboard selection, Escape closes, focus returns to the trigger
- search results announced where appropriate

`searchEntityIcons`, `entityIconOptionsByCategory` and `ENTITY_ICON_CATEGORIES` already exist and are
tested; the picker is presentation over them.

---

## 5. Test and CI status at this head

Recorded in §7 of this document at the time of writing. Re-run before trusting them.

### Known local-only artefact

`e2e/activity-actor.spec.ts:76` — "desktop and mobile render the actor identically" — fails on this
development machine and **passes in CI**. The test requires a `System`-actor event to be present in
the *bounded* Recent activity window on Today. The local Miniflare workspace has had hundreds of
test-created activities pushed through it across repeated suite runs, so that event has aged out of
the window; CI seeds a fresh database for every run and does not have the problem.

**The test is deliberately unchanged.** It is asserting something true and useful. If it ever fails
in CI, that is a real regression and should be investigated normally — do not reach for this
explanation first.

To clear it locally: re-run `node ./e2e/setup-local-db.mjs` against a reset `.wrangler/state`.

---

## 6. The next implementation sequence

Do these in order. Do not broaden the scope, and do not start the later module groups before
Areas, Projects, Tasks and Today are complete and approved.

**1. ~~Finish Area and Project icon persistence.~~ DONE** — see §4. Only the e2e seed
fixtures and a duplicate/clone audit remain, and both are better done alongside the
picker than before it.

**2. Build the shared icon picker.** Accessible desktop dialog/popover and mobile sheet/modal;
search and categories; keyboard selection; reset to default; integrated into create and edit for
both Areas and Projects.

**3. Migrate Areas and Projects.** `EntityCard`; responsive 3/2/1-column grids; selected icons;
Area accent inheritance; progress and concise metadata; record identity headers using
`PaneHeader density="identity"`. Gate D screenshots and approval.

**4. Migrate Tasks.** `RecordRow`; remove the four-row control stack; one compact toolbar;
grouping; eliminate the duplicated state indicators (the check glyph beside the checkbox, the
status chip competing with the overdue pill); mobile layout. Gate D screenshots and approval.

**5. Rebuild Today.** Real aggregate reads FIRST, then the composition. Exact or explicitly
bounded totals; owner-local timezone and first-day-of-week; the actual owner display name (it
currently renders "Good afternoon, Local."); the 12-column reference-led composition; charts and
the calendar. Gate G screenshots and approval.

Then the remaining modules in logical groups — Goals, Notes/Diary/Meetings,
People/Assets/Reviews, AI/Settings/Help — followed by Gate H (responsive, accessibility) and the
documentation commit.

### Screenshot gates still outstanding

**D** entity collections · **E** records and forms · **F** remaining modules · **G** Today ·
**H** final sweep. Gates A, B and C are approved. Capture harness: any dev-only route renders
inside the real shell; the existing pattern is `e2e/m3-screenshots.spec.ts` (opt-in via
`CAPTURE_SCREENSHOTS=1`). Captures live under `docs/design/assets/m3-polish-2026-08/`.

### Practical notes for the next session

- Playwright's second `webServer` builds the production bundle; on a loaded machine the 120s
  timeout is not enough. Run `pnpm run build` first, then `PLAYWRIGHT_SKIP_BUILD=1 pnpm exec
  playwright test …`.
- Do not `pkill -f "playwright test"` while your own run is in flight — it matches both.
- Pushing while a CI run is in flight cancels it, and a cancelled shard is reported as a **failed**
  CI Gate. Three "failures" during this work were cancellations, not defects.
- `test/unit/tokens/tokens.test.ts` scans `app/styles` for the retired `--dh-` vocabulary,
  **including inside comments**.

---

## 8. Gate D — Areas and Projects

**PR [#122](https://github.com/acedaly/DalyHub-V2/pull/122)**, branch
`claude/m3-areas-projects-axf33x`, branched from `main` @ `585e06b` (the PR #121 merge).

The first real module migration. Two collections moved off the one generic row card and onto the
shared entity-card family; nothing else in the product changed.

### What the cards render

| Surface | Anatomy |
|---|---|
| **Area** | chosen icon on the Area's own accent · title · one work-state line (`3 active Projects · 2 open Goals`, or `No active work`) · open-task count as the single metric · `Updated <date>` |
| **Project** | chosen icon on the ANCESTOR AREA's accent · title · `Area · Goal` · ONE status chip · thin progress bar with its percentage · `N of M tasks complete` · health reason where it explains the chip · `Updated <date>` |

### Exact versus bounded — the ledger

Every number on both cards is a workspace-wide SQL aggregate computed in the same query that
returns the row. None is a count of the loaded page.

| Card | Value | Source | Exactness |
|---|---|---|---|
| Area | active Projects | `activeProjectCount` | **exact** |
| Area | open Goals | `rollup.goals.total − completed` | **exact** |
| Area | open Tasks | `rollup.tasks.total − completed` | **exact** — direct Area tasks plus tasks of NON-archived Projects |
| Area | `Updated …` | `entities.updated_at` | exact, and it is the **Area record's own last edit**. ADR-014 reserves that column for identity and title, so it does NOT mean "something happened in this Area" — adding a Project writes a link and archiving writes `area_details`, and neither touches it. |
| Project | completed / total tasks, % | `taskCompleted` / `taskTotal` | **exact** |
| Project | status, Area, Goal | resolved live through the hierarchy | **exact** — never stored labels |
| Project | `Updated …` | effective presentation timestamp (ADR-037 §37.2) | **exact** |
| Both | the collection count | loaded rows | **bounded** — says `N loaded` while a cursor remains, never `N projects` |

**Deliberately not rendered.** Projects have no due-date field in the domain, and `listProjects`
exposes no next-incomplete-task. Neither is approximated, and neither should be invented without
the read behind it.

### The one new read

`ProjectListItem.areaColourRank`, so a Project inherits its Area's accent instead of inventing a
second identity system. Same lifecycle-independent window function `listAreas` uses (ADR-068
decision 5) — one CTE joined once per page, resolved through `COALESCE(direct area, goal's area)`
so the tint and the Area label beside it can never name different Areas. `(created_at, id)` is
already served by `entities_workspace_type_created_idx`: no index, no column, no migration.

### The status rule (Projects)

A card carries EXACTLY ONE chip. The audit found "two competing status systems — a state chip
right, a health chip inline". `projectCardStatus` picks the single most decision-relevant fact:

```
archived                        -> "Archived"
completed                       -> "Completed"
not actively worked             -> "Planned" / "On hold"
active, and health is speaking  -> the health state ("Stale", "At risk", "Blocked")
active, and nothing is wrong    -> "Active"
```

Health REPLACES the workflow chip; it never sits beside it. `on_track` is the ABSENCE of a signal,
so it is not promoted — swapping "Active" for "On track" would trade a useful word for a vaguer
one. The health REASON survives as supporting text because it explains the chip rather than
restating it. The full health vocabulary is unchanged on the Project record.

### Four defects the capture pass and review found

Captures and review are an implementation test, not decoration. These were all found after the
code "worked":

1. **An Area with only loose tasks said "1 open task" twice** — once as its summary line and once
   as its metric, one above the other. `areaWorkSummary` is about STRUCTURE only now, and returns
   `null` when the metric beside it has already said everything.
2. **`.dh-ecard__status` was raised above the whole-card link's overlay** although a status chip is
   not a control, making the top-right corner of every card a dead zone. Only genuinely interactive
   descendants are raised now. This is CSS hit testing, so it is asserted in the browser — jsdom
   dispatches on whatever node a test names and would have passed regardless.
3. **The muted treatment read `status.label === "Archived"`** — a lifecycle rule expressed as a
   comparison against display copy, which would have broken silently on a rewording.
   `ProjectCardData` carries `isArchived` / `isComplete` as facts now, from the same shared
   predicates the chip branches on.
4. **The Area task roll-up counted archived Projects' tasks.** Probing the real domain showed the
   symptom is narrower than it looks: a Project with unfinished tasks cannot be archived
   (`ProjectArchiveBlockedError`) and a task inside an archived Project cannot be reopened
   (`SpineParentUnavailableError`), so an Area could never report OPEN tasks from archived work.
   What it DID do was keep an archived Project's COMPLETED tasks in the Area's totals. Archived
   Projects now contribute nothing, and their tasks leave WHOLE — completed with open — so archival
   can never skew a ratio.

### Deliberate differences from the reference mock-up

- **No due date on a Project card.** The reference's "Projects in motion" shows `Due 30 May`;
  DalyHub Projects have no due-date field. Adding one is a domain change, not a visual one.
- **No progress bar on an Area card.** Areas never complete (AGENTS.md §4), so a completion bar
  answers a question the entity does not have — and it was the source of the audit's "ragged
  alignment where some rows have progress bars and some don't".
- **Cards are content-height, not row-height.** `align-items: start`, per the brief's "natural
  alignment without forcing every card to the height of the largest one". The trade is visible: a
  card with no progress bar is shorter than its neighbours.

### Areas has no filtered-empty state

Deliberate, and the one item in the requested capture list that does not exist. Areas has no filter
dimension — no query parameter, no segment control — so there is no filter that can match nothing.
Its true-empty state is captured and tested; `areas-filtered-empty.png` is absent because inventing
a filter to satisfy a screenshot would be building a feature to fit the evidence. Projects has a
real state filter, so both of its empty states are captured and asserted to be distinct.

### Where the evidence is

`docs/design/assets/m3-polish-2026-08/gate-d-areas-projects/` — 18 captures, all with
`animations: "disabled"`.

Desktop 1440×1000 (light + dark), tablet 1024×1100, phone 390×844 (light + dark) and 320px come
from the REAL `/areas` and `/projects` routes over the seeded workspace. The 320px and tablet
passes assert no horizontal overflow in the SAME run that takes the image, so the invariant and the
evidence cannot disagree.

Empty, filtered-empty, the three progress states and the icon comparisons come from
`/design/collection-states`, a dev-only fixture. The e2e suite runs `workers: 1` against ONE shared
local D1, so a capture pass that deleted every Area to photograph "No Areas yet" would poison every
spec that ran after it. The fixture renders the SAME components inside the SAME shell; only the
loader data is fictional, and its Project health is EVALUATED by the real rules from a fixed
instant rather than hand-written, so it cannot drift from the evaluator or wobble as a staleness
threshold is crossed mid-review.

### Notes for the next unit

- `EntityCard`'s whole-card destination is a router `Link`. A bare `<a>` — which is what it shipped
  with — makes every card a full document load that discards the scroll position and the
  accumulated "Load more" pages.
- `EntityCardGrid` is a labelled `<ul>`/`<li>`. `aria-label` on a bare `<div>` names nothing: a
  generic element has no role for the name to attach to.
- `CardProgress` splits `label` (drawn beside the bar) from `valueText` (announced). Both derive
  from the same value, so they cannot disagree about how far along the work is.
- Forced colours strip the generated accent tints, so `icons.css` restores the
  identity container as a BORDER. That is asserted in the browser
  (`areas.spec.ts`, `forcedColors: "active"`) rather than trusted to the media
  query — it is the one place in this change where meaning could have been left
  resting on colour alone.
- The touch-target helper measures a card's ANCHOR at ~19px, because the destination is a stretched
  link whose `::after` covers the card. Measure the CARD, and prove the stretched area by clicking
  a far corner — bottom-LEFT, since the capture FAB is fixed bottom-right.
