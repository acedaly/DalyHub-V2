# MD3 inventory

Generated from `rg -l "md-sys|md-app|material|tonal|state-layer|elevation-[0-9]|mdc-" app docs test scripts -g "!node_modules"`. Part B requires this inventory before completing the design-system migration. Active product code is the migration target; historical docs may remain only when clearly marked as history.

## Summary

- Active UI files: 109
- Tests: 14
- Scripts: 2
- Docs: 33
- Non-UI app files: 12
- Total matches: 170

## Progress — IDENTITY-01, the DalyHub Identity System (2026-08)

Record identity — the tile, the bars, the pills, the dots, the goal meter and the
chart line — no longer resolves through Material's generated
`area-accent-N-container` / `on-area-accent-N-container` quartet. It resolves
through DalyHub's own sixteen-slot ramp and four semantic roles.

### Retired from identity surfaces

| File | `area-accent-*` refs before | After |
|---|---|---|
| `app/styles/icons.css` | 12 | **0** |
| `app/styles/pill.css` | 18 | **0** |
| `app/styles/card-family.css` | 19 | **0** |
| `app/styles/projects.css` | 6 | **0** |

Sixty-eight rules (six-slot mappings repeated in five stylesheets) became six
declarations that do not know how many slots exist. `identity-ramp.test.ts` fails
if any of those four files reads a `(on-)area-accent-*` role again.

`--md-sys-shape-corner-*` also left the identity tile and the Area pill/dot, for
`--dh-radius-*`.

### Deliberately LEFT reading `area-accent-*`, with the tokens kept alive

The pass migrated the surfaces §10 of the brief scoped it to. These three are
outside that scope and still have live readers, so the generated
`area-accent-*` quartet stays emitted:

| File | What it paints | Why it was left |
|---|---|---|
| `app/styles/people.css` | `.dh-person-avatar[data-accent]` | A person's relationship CIRCLE, derived by `person-circles.ts` — not a record's own identity, and not on the spine |
| `app/styles/analytics.css` | `.dh-analytics__split-track[data-accent]` | An Area BREAKDOWN chart's series, not a record's own mark |
| `app/shared/pill/Pill.tsx` | `areaAccentForRank` | Kept as a legacy shim resolving through `identityForRank`, so the number and the name can never disagree about which slot a rank lands on. Its only remaining callers are the two files above and `ScheduleList` |

`app/styles/schedule.css` reads the WIDGET-accent ramp (`accent-violet`,
`accent-blue`, …) rather than the identity ramp, and `app/styles/icons.css`'s
`.dh-tone-icon` still composes a widget tone through the container machinery.
Converting the widget vocabulary is its own pass; nothing in it is a record's
identity.

### The icon set is now split, deliberately

`app/shared/icons/icons.tsx` (Material Symbols Outlined, filled paths) is the
application FRAME's set and is unchanged. `app/shared/icons/entity-glyphs.tsx` is
new: every glyph an owner can choose, plus every entity DEFAULT a record wears,
drawn in DalyHub's own stroke idiom at one weight. A filled symbol inside the
rebuilt identity tile reads as a solid blob of the record's hue, which is the
look the tile exists to leave behind. `catalogue.test.ts` fails if a catalogue
entry is not stroked at the set's weight.

Converting the frame's glyphs is NOT scheduled — they are chrome the owner never
chooses, and one honest split beats a half-finished sweep.

## Progress — REDESIGN-04, the Spine Workspaces (2026-08)

This pass's effect on the inventory is mostly **subtraction by deletion**, which
is the cleanest kind: `GoalCard` and its ~19,000 characters of `.dh-gcard` CSS
were removed with the Goals gallery they existed for, taking their token
references with them.

Active `--md-sys-*` references in the touched stylesheets:

| File | Before (REDESIGN-03 exit) | After |
|---|---|---|
| `app/styles/card-family.css` | 38 | **30** |
| `app/styles/goals.css` | 2 | 2 |
| `app/styles/projects.css` | 0 | 6 |
| `app/styles/collection-layout.css` | 16 | 16 |
| `app/styles/charts.css` | 21 | 21 |

### The six new references in `projects.css`, and why they are not a regression

They are the **six-slot identity ramp** — `--md-sys-color-area-accent-1…6` — on
the Table view's progress fill. That ramp is the same one `.dh-pcard__fill` and
`.dh-mrow__fill` already resolve, and it is one of the two families REDESIGN-03
classified as *"generated DalyHub primitives that happen to be named
`--md-sys-*`"* rather than as Material dependence: the values come from
`DALYHUB_PRIMITIVES` in `scripts/generate-m3-scheme.mjs`, not from a Material
palette, and `scheme:check` proves it. Pointing the table's fill at anything
else would have given one Project two identity colours across two presentations
of the same collection.

**No new typescale, shape or motion reference was introduced anywhere.** Every
new surface — the search field, the control row, the measured row, the table,
the chips, the stat trio and the chart's projection — is authored entirely in
`--dh-*` and `--app-*` roles, plus that one generated ramp.

### The identity ramp stopped being a tonal container

The largest MD3 reduction in this pass is not a token count — it is that the six
identity slots no longer resolve through Material's custom-colour ladder at all.

`area-accent-N-container` was tone 90 (a mid-saturation pastel) with an
`on-container` at tone 10 (a near-black glyph): Material's identity chip,
rendered nine times across a Projects gallery. It is now a near-white **tint**
(tone 96 at capped chroma) carrying the **saturated hue** as its glyph, derived
by `identityTones` in the generator rather than by `customTones`. The token names
are unchanged, so every consumer is untouched; only the values moved.

`Blend.harmonize` is also no longer applied to this ramp. That is what was
turning the reference's red into a magenta and its orange into a red under the
Daly Violet seed — and it makes the ramp's own stated promise ("an Area keeps the
same identity colour whichever scheme is chosen") true for the first time.

Six `-container` / `on-container` pairs therefore stop being tonal containers.
That is REDESIGN-03 debt item 1 progress on the surfaces this pass owns, achieved
by removing the mechanism rather than by re-skinning its output. See
`REDESIGN_04_SPINE_WORKSPACES_2026_08.md` §10b.

### Two REDESIGN-03 debt items honoured rather than propagated

- **Tonal containers (debt item 1).** The linked-project chips are a genuine
  new chip family, and they take the card family's **hairline boundary** rather
  than a `secondary-container` fill. No new tonal-container badge exists.
- **`--dh-color-bg-sunken` wells (debt item 5).** Every progress track added
  here (`.dh-mrow__track`, `.dh-ptable__track`) uses `--dh-color-border`, so an
  empty track reads as a rule rather than as a filled container. The existing
  `.dh-pcard__track` still uses the sunken token; converting it belongs to the
  same sweep as item 1.

---

## Progress — REDESIGN-03, Today + Core Spine (2026-08)

This pass reduced **active visual dependence** on the MD3 token layer across the
surfaces it owns, and — unlike the pass below it — the reduction is in the token
references themselves, not only in appearance.

Active `--md-sys-*` references in the touched stylesheets:

| File | Before | After |
|---|---|---|
| `app/styles/today.css` | 41 | 3 |
| `app/styles/projects.css` | 4 | 0 |
| `app/styles/goals.css` | 44 | 2 |
| `app/styles/areas.css` | 10 | 0 |
| `app/styles/card-family.css` | 272 | 38 |

**Zero typescale, shape and motion references remain in any of the five files.**
The migration was semantic rather than mechanical: each Material role was mapped
to the DalyHub role that does the same job, `letter-spacing` declarations reading
Material tracking were dropped rather than re-pointed (the DalyHub roles carry
their own), and two roles that did not exist were added rather than approximated
— `--dh-text-card-title-*` (15px/600) and `--dh-text-metric-*` (24px/600). Their
absence was *why* the card families were still reading Material's typescale.

### The classification §36 asks for

Every surviving match in the five files above falls into one of these, and none
of them is an active MD3 *appearance*:

- **Active visual dependency — colour roles only.** `--md-sys-color-area-accent-1…6`
  (Area identity), `--md-sys-color-entity-meeting` (entity identity),
  `--md-sys-color-state-due-soon` (a task-state colour). These are DATA
  vocabularies, and the DalyHub token layer explicitly routes them straight to
  the generated role: "a chart series, a priority ramp, an identity accent reads
  the generated role directly — those are data vocabularies, not surface
  vocabularies". Retained deliberately.
- **Active visual dependency — genuine remaining debt.**
  `--md-sys-color-{error,success,warning,secondary}-container` and their `on-`
  pairs, dressing status badges and the selected measurement-unit chip. This *is*
  Material tonal-container language. It is not fixed here because it is a shared
  feedback-vocabulary pass: converting the badges one module at a time would
  leave two badge languages in the product.
- **Compatibility shim.** `box-shadow: var(--app-elevation-resting)` still
  appears in several rules. The token resolves to `none`, so these are inert —
  the "shadow means floating" rule is already honoured in the rendered product.
  Noise to sweep when the `--app-*` layer retires, not a visual defect.
- **Historical documentation.** `app/modules/today/day/TodayScreen.tsx` matches
  this inventory's pattern **twice, and both are the word "tonal" in prose**
  describing a rail row's identity tile. It carries no MD3 token reference at
  all and should be read as documentation, not as debt.

### Moved, not removed: the appearance pair

The DalyHub Part B colour primitives (`--canvas`, `--surface*`, `--ink*`,
`--border*`, `--accent*`, the feedback/priority/category ramps and the shadow
set) were authored on a bare `:root` in `tokens.css` **with light values and no
dark counterpart**, which pinned the entire product to the light appearance —
every `--dh-color-*` name resolves onto them and `base.css` paints the document
from `--dh-color-bg`.

They now come from `scripts/generate-m3-scheme.mjs` (`DALYHUB_PRIMITIVES`) as a
light/dark pair inside the generated markers, which is the only place
`scheme:check` can police and where every other appearance-dependent colour in
the file already lives. Light values are unchanged to the digit. This does not
change the MD3 count in either direction; it is recorded here because the
inventory's subject is where colour comes from.

See `docs/design/REDESIGN_03_CORE_SPINE_CONVERGENCE_2026_08.md`.

## Progress — visual-references pass (2026-08)

The count above is unchanged, and that is the honest reading: this pass removed
MD3 *appearance* from the surfaces it touched without yet retiring the token
NAMES underneath them. The two are separate jobs and the second is only safe
once the first is finished everywhere.

Retired in this pass, by behaviour rather than by rename:

- **Priority** no longer aliases the feedback triple. `--priority-1…4` are
  DalyHub-owned values chosen against the references and held to 3:1.
- **The rail's selected row** was a near-black slab and is now an accent tint.
  The rail-specific override that restated it is gone, so one rule owns the
  state.
- **Bucket headings** lost their tonal colouring; the state lives on the row's
  own date.
- **The completion control** is a rounded square rather than an M3 circle.
- **The detail panel** has its own width token instead of a page-width one.

Still carrying MD3 vocabulary in ACTIVE UI, and therefore still the target:

- `app/styles/tokens.css` remains the compatibility layer: the `--dh-*` tokens
  this pass uses resolve through `--md-sys-*` / `--app-*` definitions. Deleting
  the shim is the last step, not an early one.
- `task-signals.css`, `drawer.css` and `tasks.css` still reference
  `--md-sys-motion-*`, `--md-sys-color-primary` and `--md-sys-shape-*` in rules
  this pass did not rewrite.
- The surfaces listed below that this pass did not reach — Notes, Diary,
  Meetings, People, Analytics, Settings and the Assets/Reviews/AI group — are
  unchanged and still inventoried.

## Inventory

| File | Note |
|---|---|
| `app/kernel/ai/ai-evidence.ts` | Non-UI domain/platform file with matching prose or non-design identifier; inspect before changing, likely not visual debt. |
| `app/kernel/ai/ai-features.ts` | Non-UI domain/platform file with matching prose or non-design identifier; inspect before changing, likely not visual debt. |
| `app/kernel/alignment/goal-alignment.ts` | Non-UI domain/platform file with matching prose or non-design identifier; inspect before changing, likely not visual debt. |
| `app/kernel/assets/asset-validation.ts` | Non-UI domain/platform file with matching prose or non-design identifier; inspect before changing, likely not visual debt. |
| `app/kernel/calendar/calendar-repository.ts` | Non-UI domain/platform file with matching prose or non-design identifier; inspect before changing, likely not visual debt. |
| `app/kernel/capture/capture-classification.ts` | Non-UI domain/platform file with matching prose or non-design identifier; inspect before changing, likely not visual debt. |
| `app/kernel/capture/capture-email.ts` | Non-UI domain/platform file with matching prose or non-design identifier; inspect before changing, likely not visual debt. |
| `app/kernel/offline/offline-identity.ts` | Non-UI domain/platform file with matching prose or non-design identifier; inspect before changing, likely not visual debt. |
| `app/kernel/people/person-validation.ts` | Non-UI domain/platform file with matching prose or non-design identifier; inspect before changing, likely not visual debt. |
| `app/kernel/secrets/sealed-secret.ts` | Non-UI domain/platform file with matching prose or non-design identifier; inspect before changing, likely not visual debt. |
| `app/kernel/tasks/task.ts` | Non-UI domain/platform file with matching prose or non-design identifier; inspect before changing, likely not visual debt. |
| `app/modules/people/PersonSummary.tsx` | Active module UI or route with legacy design vocabulary; migrate after shared primitives are converted. |
| `app/modules/projects/ProjectTasksTab.tsx` | Active module UI or route with legacy design vocabulary; migrate after shared primitives are converted. |
| `app/modules/settings/routes/index.tsx` | Active module UI or route with legacy design vocabulary; migrate after shared primitives are converted. |
| `app/modules/tasks/NewTaskForm.tsx` | Active module UI or route with legacy design vocabulary; migrate after shared primitives are converted. |
| `app/modules/tasks/task-revalidation.ts` | Active module UI or route with legacy design vocabulary; migrate after shared primitives are converted. |
| `app/modules/today/day/TodayScreen.tsx` | **Historical documentation only** (REDESIGN-03). Both matches are the word "tonal" in prose; the file references no MD3 token. Not migration debt. |
| `app/root.tsx` | Root still wires old appearance/colour-scheme token attributes; inspect during shell/token migration. |
| `app/shared/alignment/window.ts` | Active shared product component still references legacy design vocabulary; migrate through shared primitives/tokens. |
| `app/shared/capture/CaptureSheet.tsx` | Active shared product component still references legacy design vocabulary; migrate through shared primitives/tokens. |
| `app/shared/card/ExpressiveSummary.tsx` | Shared card/row surface still references tonal/elevation/state-layer language; flatten ordinary surfaces and keep elevation for overlays only. |
| `app/shared/card/MetricTile.tsx` | Shared card/row surface still references tonal/elevation/state-layer language; flatten ordinary surfaces and keep elevation for overlays only. |
| `app/shared/card/RecordRow.tsx` | Shared card/row surface still references tonal/elevation/state-layer language; flatten ordinary surfaces and keep elevation for overlays only. |
| `app/shared/card/StatCard.tsx` | Shared card/row surface still references tonal/elevation/state-layer language; flatten ordinary surfaces and keep elevation for overlays only. |
| `app/shared/card/TimelineItem.tsx` | Shared card/row surface still references tonal/elevation/state-layer language; flatten ordinary surfaces and keep elevation for overlays only. |
| `app/shared/charts/ProgressRing.tsx` | Active shared product component still references legacy design vocabulary; migrate through shared primitives/tokens. |
| `app/shared/entity/EntityIconPicker.tsx` | Active shared product component still references legacy design vocabulary; migrate through shared primitives/tokens. |
| `app/shared/entity/identity.ts` | Active shared product component still references legacy design vocabulary; migrate through shared primitives/tokens. |
| `app/shared/icons/ToneIcon.tsx` | Active icon primitive/catalogue still documented and shaped as Material Symbols; replace with the approved stroke icon language while preserving component names. |
| `app/shared/icons/icons.tsx` | Active icon primitive/catalogue still documented and shaped as Material Symbols; replace with the approved stroke icon language while preserving component names. |
| `app/shared/icons/index.ts` | Active icon primitive/catalogue still documented and shaped as Material Symbols; replace with the approved stroke icon language while preserving component names. |
| `app/shared/shell/AppearanceSelector.tsx` | Active shell component still emits/mentions MD3 state-layer or scheme controls; migrate shell classes and remove colour-scheme machinery where obsolete. |
| `app/shared/shell/ColorSchemeSelector.tsx` | Active shell component still emits/mentions MD3 state-layer or scheme controls; migrate shell classes and remove colour-scheme machinery where obsolete. |
| `app/shared/shell/DesktopTopBar.tsx` | Active shell component still emits/mentions MD3 state-layer or scheme controls; migrate shell classes and remove colour-scheme machinery where obsolete. |
| `app/shared/shell/PrimaryNavigation.tsx` | Active shell component still emits/mentions MD3 state-layer or scheme controls; migrate shell classes and remove colour-scheme machinery where obsolete. |
| `app/shared/shell/SidebarSearch.tsx` | Active shell component still emits/mentions MD3 state-layer or scheme controls; migrate shell classes and remove colour-scheme machinery where obsolete. |
| `app/shared/shell/color-scheme.ts` | Active shell component still emits/mentions MD3 state-layer or scheme controls; migrate shell classes and remove colour-scheme machinery where obsolete. |
| `app/shared/skeleton/Skeleton.tsx` | Active shared product component still references legacy design vocabulary; migrate through shared primitives/tokens. |
| `app/shared/task-record/TaskRow.tsx` | Shared task surface or parser still references old priority/MD3 vocabulary; migrate through PriorityFlag and new labels. |
| `app/shared/task-record/quick-capture.ts` | Shared task surface or parser still references old priority/MD3 vocabulary; migrate through PriorityFlag and new labels. |
| `app/shared/tokens/dalyhub.ts` | Typed token registry or generated scheme mirror; update/remove MD3 token names as the CSS shim is retired. |
| `app/shared/tokens/scheme.ts` | Typed token registry or generated scheme mirror; update/remove MD3 token names as the CSS shim is retired. |
| `app/shared/tokens/tokens.ts` | Typed token registry or generated scheme mirror; update/remove MD3 token names as the CSS shim is retired. |
| `app/shared/ui/Button.tsx` | Shared primitive component documentation or classes reference old MD3 concepts; keep behavior and rename/restyle to DalyHub language. |
| `app/shared/ui/Card.tsx` | Shared primitive component documentation or classes reference old MD3 concepts; keep behavior and rename/restyle to DalyHub language. |
| `app/shared/ui/IconButton.tsx` | Shared primitive component documentation or classes reference old MD3 concepts; keep behavior and rename/restyle to DalyHub language. |
| `app/styles/activity-feed-demo.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/activity-feed.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/ai.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/alignment.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/analytics.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/appearance.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/areas.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/assets.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/backups.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/base.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/brand.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/capture.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/card-family.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/card.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/cards-filters-demo.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/charts.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/collection-demo.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/collection-layout.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/command.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/diary.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/drawer-demo.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/drawer.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/empty-state.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/entity-link.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/feedback-demo.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/feedback.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/filters.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/forms-demo.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/forms.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/goals.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/health.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/help.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/icon-picker.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/icons.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/inline-edit.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/insights.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/inspector.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/linked-items.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/load-more.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/markdown-editor.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/meetings.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/notes.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/offline.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/overflow-menu.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/people.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/pill.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/progress.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/projects.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/record-layout-demo.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/record-layout.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/references.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/relationships.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/review-guide.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/reviews.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/schedule.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/search-demo.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/search.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/segmented-filter.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/settings-demo.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/settings.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/sheet.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/shell.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/skeleton.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/summary-cards.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/switch.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/task-drawer.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/task-list.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/task-signals.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/tasks.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/today.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/tokens.css` | Compatibility token layer and current semantic token source; replace legacy MD3 definitions with DalyHub-owned tokens, then delete shims. |
| `app/styles/tooltip.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/ui.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/view-tabs.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `app/styles/views.css` | Active stylesheet using legacy MD3 token/class vocabulary; migrate to DalyHub tokens and remove old comments/classes. |
| `docs/README.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/decisions/ARCHITECTURE_DECISIONS.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/DALYHUB_DESIGN_SYSTEM.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/DALYHUB_FINAL_PRODUCT_UI_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/DALYHUB_UI_QUALITY_AUDIT_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/DESIGN_SYSTEM.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/DS_01_DESIGN_SYSTEM_FOUNDATION_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/DS_02_CORE_UI_PRIMITIVES_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/DS_03_SHELL_AND_NAVIGATION_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/DS_04_TASKS_REDESIGN_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/DS_05_08_WHOLE_APP_VISUAL_COMPLETION_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/M3_EXPRESSIVE_AUDIT_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/M3_POLISH_AUDIT.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/M3_UX_INTERACTION_AUDIT_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/MOBILE_01_IPHONE_DAILY_DRIVER_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/PRODUCT_EXPERIENCE.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/RECORD_SCREEN_CONVERGENCE_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/THEME_01_COLOUR_SCHEMES_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/THEME_ACCEPTANCE_MATRIX.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/UIX_01_PRODUCT_REDESIGN_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/UIX_04_NOTES_DIARY_MEETINGS_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/design/assets/ds-04/COMPARISON.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/development/ACCESSIBILITY_RESPONSIVE.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/development/APP_SHELL_AUTH.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/development/TASKS_MODULE.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/development/TODAY_DASHBOARD.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/product/DALYHUB_UX_PRODUCT_AUDIT_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/product/END_TO_END_AUDIT_2026_08_05.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/product/HARDEN_02_RELEASE_TRUST_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/product/HARDEN_03_CLOSE_RELIABILITY_LOOP_2026_08.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/product/PRODUCT_DEBT.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/reference/REFERENCE_PRODUCTS.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `docs/roadmap/ROADMAP_V2_2.md` | Documentation/history reference; update only where it is now authoritative or misleading. |
| `scripts/generate-m3-scheme.mjs` | Build/generator support for the old generated colour system; retire or repurpose once the shim is no longer needed. |
| `scripts/lib/extensionless-esm-hooks.mjs` | Build/generator support for the old generated colour system; retire or repurpose once the shim is no longer needed. |
| `test/unit/assets/validation.test.ts` | Test asserting current MD3/token behavior; update after the replacement token/component contracts are implemented. |
| `test/unit/deploy/production-backup-workflow.test.ts` | Test asserting current MD3/token behavior; update after the replacement token/component contracts are implemented. |
| `test/unit/entity/identity.test.tsx` | Test asserting current MD3/token behavior; update after the replacement token/component contracts are implemented. |
| `test/unit/people/validation.test.ts` | Test asserting current MD3/token behavior; update after the replacement token/component contracts are implemented. |
| `test/unit/pwa/manifest-and-icons.test.ts` | Test asserting current MD3/token behavior; update after the replacement token/component contracts are implemented. |
| `test/unit/shell/shell-anatomy.test.ts` | Test asserting current MD3/token behavior; update after the replacement token/component contracts are implemented. |
| `test/unit/tokens/appearance-cascade.test.ts` | Test asserting current MD3/token behavior; update after the replacement token/component contracts are implemented. |
| `test/unit/tokens/color-schemes.test.ts` | Test asserting current MD3/token behavior; update after the replacement token/component contracts are implemented. |
| `test/unit/tokens/contrast.test.ts` | Test asserting current MD3/token behavior; update after the replacement token/component contracts are implemented. |
| `test/unit/tokens/dalyhub-tokens.test.ts` | Test asserting current MD3/token behavior; update after the replacement token/component contracts are implemented. |
| `test/unit/tokens/entity-accents.test.ts` | Test asserting current MD3/token behavior; update after the replacement token/component contracts are implemented. |
| `test/unit/tokens/state-layer.test.ts` | Test asserting current MD3/token behavior; update after the replacement token/component contracts are implemented. |
| `test/unit/tokens/tokens.test.ts` | Test asserting current MD3/token behavior; update after the replacement token/component contracts are implemented. |
| `test/unit/ui/primitive-tokens.test.ts` | Test asserting current MD3/token behavior; update after the replacement token/component contracts are implemented. |
