# UIX-02 — the Projects & Areas redesign, August 2026

> A deliberate **product redesign** of the Projects and Areas modules — both
> galleries, both records, both phone compositions and the dark appearance —
> against the supplied reference design, extending the visual language UIX-01
> established on the shell, Today and Tasks. Not a polish pass: the routes, the
> domain rules and the semantics are unchanged, but the composition of every
> surface named here is substantially different from what it replaced, on
> purpose.

Evidence: `docs/design/assets/uix-02-2026-08/`, captured by
`e2e/uix-02-screenshots.spec.ts`. The same spec writes both halves of every
comparison (`SHOT_PREFIX=before-` and no prefix) against the same seeded
workspace, so nothing between a `before-` and its pair differs except the
product.

The reference design is the third PNG in the repository root:

| File | What it specifies |
| --- | --- |
| `ChatGPT Image Aug 10, 2026 at 06_24_38 AM.png` | Projects (desktop, phone), Areas, Goals, Notes, Diary, People and Analytics |

It is unchanged by this work and must stay that way — it is the specification,
not an asset the product ships. The two UIX-01 references are likewise untouched.

---

## 1. The problem this pass set out to fix

**Projects and Areas were the same component.** Both rendered through the shared
`EntityCard` in the shared `EntityCardGrid`: identical mark, identical grid,
identical layout, with one big figure where the other had a percentage. Hide the
labels and nothing distinguished a finite body of work from a permanent domain
of a life — which are the two most different records the spine has.

That produced four concrete defects, each visible in the `before-` captures:

1. **Areas were mostly empty space.** An Area has no description, no completion,
   no due date and no progress. Four facts in a 260px card leaves most of the
   card blank, and six of them tiled across a 1440 is a page of air with words in
   the corners.
2. **A fabricated Area completion figure.** The Areas *gallery* had never drawn a
   progress bar — its own source file explains at length why — but the Area
   *record* opened with "Tasks — 3 of 6 tasks complete" over a full-width violet
   meter. A completion proportion, on the one entity that by definition never
   completes. It was also a moving number: an Area's roll-up spans every Project
   under it, so it drifted whenever unrelated work finished, and a mature Area
   would sit near 100% for ever, reading as "nearly done" about a part of a life.
3. **Identity was painted from the CHART ramp.** `area-accent-*` was `chart-*`
   reused. Chart hues are chosen so a legend stays separable, with 25° of HCT
   separation asserted between any two — the wrong optimisation for a colour
   drawn under a title. The gallery came out with an olive, a magenta and a
   crimson bar, and the crimson read as a *state* purely because of where that
   Project's Area happened to sort.
4. **Tasks inside a Project were not Tasks rows.** While UIX-01 rebuilt the Tasks
   list into one ~45px line — leading completion circle, dominant title,
   right-aligned relative date — the Project record kept a two-line card with an
   inert green check glyph, a "P1" pill, an "Overdue · due 7 Aug 2026" pill and
   an "Unscheduled" pill on every row. There was no way to complete a task from
   the Project it belonged to.

---

## 2. What changed, by surface

### Foundations

| Change | Where |
| --- | --- |
| Record identity resolves to the **widget accent ramp**, not the chart ramp (D22) | `scripts/generate-m3-scheme.mjs` → `IDENTITY_HUES` |
| A generated **`accent-cyan`** quartet — the sixth ranked identity, clear of the scheme's alarm band (D23) | same |
| `ProjectCard` — the Project gallery card | `app/shared/card/ProjectCard.tsx` |
| `EntityRow` / `EntityRowList` — the spacious identity row and its surface | `app/shared/card/EntityRowList.tsx` |
| `ViewTabs` — the shared view **tab rail**, extracted from Tasks | `app/shared/view-switcher/ViewTabs.tsx`, `app/styles/view-tabs.css` |
| The Tasks ROW treatment gained an opt-in scope, `.dh-tasklist` | `app/styles/tasks.css` |
| `AreaOverview` and `ProjectOverview` now carry the record's own `colourRank` | the kernel types and both D1 repositories |

The two identity ramps were consolidated rather than added to: `area-accent-*`
keeps its name and every consumer, and only the hue behind each slot moved. Five
of the six slots are now literally the same sources as the `accent-*` quartets
UIX-01 generated; the sixth is the documented departure (D23).

### Projects — the gallery

- **A card of its own**, composed bottom-heavy: identity at the top, the measure
  pinned to the bottom, one attention line between them. Because the foot is
  pinned, every card in a grid row lands its bar on the same baseline — the
  previous card let the bar float wherever its content ended, which is what made
  a row of three cards read as debris.
- **ONE attention line** replaces the filled status chip *and* the health
  sentence three rows below it. A small state dot and the words; the compact
  wording ("3 overdue", "All open work waiting", "No recent activity") is built
  from the reason's own structured count, and the evaluator's full sentence rides
  along for assistive tech.
- **The lifecycle mode is a tab rail** — the same one Tasks has had since UIX-01,
  now shared rather than copied — instead of a fourth segmented capsule across
  the calmest band of the page.
- **Titles stopped truncating.** The overflow menu came out of the head row (as a
  flex child it took 40px from every title's track, so a four-column 1440 read
  "DalyHub…", "Records…", "Kitchen…") and the title is bounded at two lines
  rather than one.
- **The phone gets a compact row**, not the desktop card at full size: the
  percentage moves onto the bar's row and the mark steps down a rung, taking a
  card from ~200px to ~150px. Six Projects on screen instead of three and a half.

### Projects — the record

- The header carries the record's **own identity mark on its own accent**, at the
  gallery's geometry. It was a bare monochrome glyph, so the one screen dedicated
  to a single Project was the one screen on which it had no identity.
- **The Tasks tab is a Tasks list.** It opts into the row treatment through
  `.dh-tasklist` and builds the same `Card` props Tasks builds: the shared
  `.dh-check-circle` (which *works* — completing posts to the canonical
  `/tasks/bulk` route, so the Project, the Tasks list and the bulk bar have one
  authority and one Activity trail), `InlineTaskDate` reading "Yesterday /
  Today / Thu, 12 Jun" in the overdue colour, and no routine status pills.
- The task-state filter is the same shared tab rail, not a sunken segmented track
  sitting directly under the record's own tab strip.

### Areas — the index

- **Rows, in one surface, with hairlines between.** That is the reference's own
  Areas composition and the design system's stated rule for a record too sparse
  to fill a gallery card. It also makes the two modules distinguishable by
  STRUCTURE rather than by reading the labels.
- The relationship line lost its qualifiers ("1 active Project · 1 open Goal" →
  "1 Project · 1 Goal"): on a list where every row says it, those are words per
  row restating what the collection already means.
- The list takes the **record measure** (`--app-width-content`) rather than the
  collection's wide cap, so the trailing figure stays in the same glance as the
  name instead of sitting 800px away.

### Areas — the record

- **The completion meter is gone.** What survives is the momentum the kernel
  actually evaluates — a state in one word and the reasons behind it — which is
  about activity rather than about completeness.
- **The record opens on an Overview**: three counts of living things (open Goals,
  active Projects, open tasks in this Area) and the recent activity, each tile a
  way into the section that holds those records. Deliberately not a dashboard; a
  brand-new Area gets one sentence rather than three tiles reading zero.
- The **"Permanent" chip is gone.** Every Area is permanent, so it is a fact
  about Areas rather than about this Area — the gallery dropped it in AREA-01 and
  the record had kept it. Only "Archived" paints now.
- The header carries the Area's own identity mark on its own accent.

### Dark

Both modules were re-reviewed in dark at 1280 and 390. Nothing needed a dark-only
rule: the identity mix strength is generated per appearance (D17), so the marks
sit as quiet tinted squares on layered neutrals rather than as a rainbow of
saturated rectangles, and every new accent's quartet is asserted in
`contrast.test.ts` in both appearances.

---

## 3. Deliberate differences from the reference

| The reference shows | DalyHub does | Why |
| --- | --- | --- |
| A **description** under every Area, and under a Project's title | Neither | Neither entity HAS a description field. Adding one is a data-model and write-boundary change, not a visual one, and UIX-01 set the precedent when it declined to invent focus-time tracking: the composition adapts; the data is not invented. The Area row is designed to read correctly without one, which is part of why it is a row |
| A **status per Area** ("On track ●") on the index | Nothing there | DalyHub does have an authoritative Area evaluator, but `evaluateAreaMomentum` needs per-Project health facts for every Project in the Area — a read this bounded list does not do and should not start doing per row. The alternative was a status vocabulary invented for the picture, and an Area health score is the single thing the brief is most explicit about not fabricating. The Area RECORD shows its real momentum |
| A **search field** in the Projects toolbar | Nothing there; the shell's search capsule sits above it | Unchanged from UIX-01's reasoning: DalyHub has ONE search implementation (DS-08) and Projects is a provider in it. A page-level field would be a second search to keep in step, searching the records the one above it already searches |
| Filter tabs reading **All · Active · On hold · Completed** | All · Open · Completed · Archived | These are the repository's documented `ProjectStateFilter` semantics. Inventing statuses to match a picture is a data-model change made for a tab strip |
| An **Area progress figure** in some compositions | Never | AGENTS.md §4 — Areas do not complete |
| Project cards ~230px wide with wrapping titles | ~330px at 1280, ~285px at 1440 | The brief's own density target (3–4 columns at 1280, ~4 at 1440), and the width at which a realistic Project name fits |

---

## 4. What is enforced

- `test/unit/tokens/contrast.test.ts` — the seven accent quartets (including the
  new cyan), in both appearances.
- `pnpm run scheme:check` — the generated colour blocks match the generator, so
  the identity ramp cannot be hand-edited back onto the chart hues.
- `test/unit/projects/ProjectsCollection.test.tsx` — one attention line per card
  and no filled chip; progress absent rather than 0%; the muted treatment derived
  from the archived FACT rather than from a chip's word.
- `test/unit/areas/AreasCollection.test.tsx` — the row list rather than the
  gallery grid; no progressbar anywhere; the relationship line, including the
  case of an Area that holds only loose tasks and must NOT be told to start its
  first Project.
- `test/unit/areas/AreaOverview.test.tsx` — no completion meter and no
  "Permanent" chip on the record; the Overview's counts are counts.
- `e2e/areas.spec.ts`, `e2e/projects.spec.ts` — the journeys, axe in both
  appearances, touch targets at 320px and no horizontal overflow across the
  responsive matrix.
- `e2e/uix-02-screenshots.spec.ts` — the before/after matrix.
