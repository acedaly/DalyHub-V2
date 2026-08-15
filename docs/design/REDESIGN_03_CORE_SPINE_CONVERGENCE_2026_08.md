# REDESIGN-03 — Visual north-star convergence: Today + Core Spine

**Base commit:** `a2e0c8c2d796e4f74b30513f2c5716fed670ef50`
(“Merge origin/main into visual north star branch”, the tip of `origin/main` when
this pass started.)

**Scope:** Today, Projects, Goals, Areas, and the shared components those four
surfaces need to read as one product — plus their desktop, tablet, phone and
dark-mode compositions.

**Evidence:** `docs/design/assets/redesign-03/before/` and `…/after/`, 44 images
each, captured by `scripts/redesign-03-shot.mjs` against the `ds-final` design
fixture.

---

## 1. What this pass was, and what it found

This was a convergence pass, not a redesign. `main` already carried several
generations of design work, and the base commit is a MERGE of two independently
developed visual passes. The question was not “what should Today look like?” but
“which of the things now on Today were meant to replace each other?”

Three findings drove everything below. All three were visible in the **rendered**
product and none of them are visible from source inspection alone.

### 1.1 Dark mode did not exist

The single largest defect, and it is product-wide rather than module-local.

Part B gave DalyHub its own authored colour palette — `--canvas`, `--surface*`,
`--ink*`, `--border*`, `--accent*`, and the feedback, priority, category and
shadow ramps. The redesign foundation wrote that palette onto a **bare `:root`
in `tokens.css` with light values and no dark counterpart anywhere in the file.**

Nothing else in `tokens.css` works that way: every generated colour block carries
a light block and two dark ones, guarded by `prefers-color-scheme` and
`data-appearance` exactly as APPEARANCE-01 specifies.

That would have been contained if the primitives were a leaf. They are not:

- the DalyHub semantic layer re-points onto them
  (`--dh-color-bg: var(--canvas)`, `--dh-color-surface: var(--surface)`, the
  whole `--dh-color-rail-*` set);
- `base.css` paints the document from `--dh-color-bg`;
- `shell.css`, `ui.css` and `inline-edit.css` read several primitives directly.

So the product’s entire surface and ink vocabulary was pinned to light. Choosing
Dark repainted only the fragments still reading a generated role.

**Measured on the base commit at 1440px, `/today` in explicit Dark rendered
`body` at `#f6f6f8` and the navigation rail at `#ffffff`.** See
`before/today-1440-dark.png` — a light page with a white sidebar and a handful of
dark accents scattered over it.

The semantic layer’s own comments describe an appearance-aware rail (“a pale
lavender row in light, a block in dark”; “right in both appearances without
knowing which one it is in”). Those comments were accurate about the *intent* and
false about the *built product*, because the names they resolve to had one value.

### 1.2 Today printed the same numbers three times

The merge kept two independently designed metric surfaces and a chart that
restated one of them:

| Surface | Figures |
| --- | --- |
| `StatCardRow` (“Today at a glance”) | Meetings today · Next 20:00 · Overdue 44 · Daily progress 68% |
| `TodaySummary` | Tasks completed 21 · Tasks captured 124 · Goals on track 4 of 4 |
| `ActivityTrendSection` (“This week”) | a 7-day completed/created chart, captioned **“21 completed · 124 created”** |

`21` and `124` appeared twice on one page. Every figure in the first row counted
something the same page rendered in full a few hundred pixels lower.

**At 390×844 on the seeded fixture, the entire first viewport was chrome:**
greeting, two stat cards, the day rail, three more stat cards — and not one row
of the owner’s actual work. See `before/today-390-light.png`.

### 1.3 The repository’s own guard test had been failing on `main`

`test/unit/today/TodayScreen.test.tsx` → *“carries the day’s first actionable row
above the laptop fold”* asserts the DOM order `[head, timeline, stat-row]`. It
was **red at the base commit**, because the merge put the stat row back above the
day and left the FINAL-UI ordering decision — and its comment — behind.

A second test, `AppShell.test.tsx` → *“renders the phone quick-navigation bar as a
distinct landmark”*, was **also red at the base commit**: it looked for a control
named `/capture/i` after the visual north-star pass deliberately renamed the slot
to “Add”.

Both are fixed by this pass. See §8.

---

## 2. Merge-artifact findings

Places where both implementations survived the merge:

- **Two metric rows and a chart carrying one story** (§1.2).
- **A duplicated comment paragraph** in `TodayScreen.tsx` — the “header block is
  PAGE CONTENT on the canvas” note appeared twice, back to back, one copy
  describing a hero that no longer existed.
- **An orphaned FINAL-UI comment** explaining that the stat row had been moved
  *below* the body grid “because §45 of the brief says do not put decorative
  stats before actionable content” — sitting above the *trend* section, while the
  stat row it described was back above the fold.
- **An orphaned DS-06 comment** stating that Goal progress was “the body grid’s
  last child … placed into the row beneath Focus and Schedule”. It was neither:
  the merge had landed it in the middle track of a three-region grid.
- **A layout hole created by that mismatch.** Measured at 1440px on the seeded
  fixture: Focus ran to ~300px, the region beside it to ~780px, so the grid held
  open a **~470×640px rectangle of empty canvas directly beneath the day’s own
  work.** See `before/today-1440-light.png`.
- **`today.css`’s file header** described “three regions: the day’s dominant
  summary, the day itself, and the rail” — a composition that had not existed for
  two passes.

---

## 3. The Today information audit

Every figure, its source, and where it went.

| Figure | Source | Also said by | Outcome |
| --- | --- | --- | --- |
| Meetings today · Next 20:00 | `dayChips` + `nextUp` | the Schedule panel, which **names** the meeting and badges it NEXT | **removed** |
| Overdue 44 | `dayChips` | Focus’s own Overdue band + “+41 more overdue” | **removed** |
| Daily progress 68% | `dayProgress` | the day’s list, with completions dimmed in place | **removed** (§4) |
| Tasks completed 21 | `activityTrend` | the trend chart’s caption | **kept**, now links to `/analytics` |
| Tasks captured 124 | `activityTrend` | the trend chart’s caption | **kept** |
| Goals on track 4 of 4 | `goalIsOnTrack` | Goal progress, which lists each Goal’s state | **kept**, now links to `/goals` |
| “This week” chart | `activityTrend.days` | the two measures above it | **removed** (§5) |

The rule applied throughout is the one the file now states: *a figure earns its
place by counting something the page does not otherwise show.*

### 3.1 Why the summary was kept and the stat row was not

This is the one decision that inverts an obvious reading of the brief, so it is
worth stating plainly.

The approved Today reference (`mockup4.png`) opens with **one** row of **three**
compact measures — “Tasks completed this week 24”, “Focus time 6h 45m”, “Goals on
track 3 of 5” — and then goes straight to the day’s task list beside a Schedule
and a Goals rail. It has no Meetings card, no Overdue card, no daily-progress
percentage and no trend chart.

`TodaySummary` **is** that row. `StatCardRow` was the interloper. So the
convergence is not “delete the newer thing”; it is “keep the one the reference
specifies and delete the one whose every figure duplicates the page”.

---

## 4. Focus time and Productivity score — the two open decisions

The implementation brief lists both as unresolved. Both are now resolved, and
neither needed code removed.

**Focus time — not captured, correctly absent.** There is no timer, no session
record and no field it could be derived from anywhere in `app/` or `migrations/`.
A repository-wide search finds it only in *prose explaining its absence*
(`kernel/analytics/analytics.ts`, `AnalyticsScreen.tsx`,
`DALYHUB_DESIGN_SYSTEM.md` §5d, and the reference-adaptation notes in UIX-01/05).
Nothing displays it. **No change; the finding is that the product was already
honest.**

**Productivity score — no formula, and guarded.** There is no score, index or
weighted composite in the product. `kernel/analytics/analytics.ts` refuses one by
name, REVIEW-03 refuses one for the same reason, and
`test/unit/analytics/analytics.test.ts` carries a test literally named *“never
invents a productivity score”*. **No change.**

**Daily progress — the one that had drifted, and was removed.**
`DALYHUB_DESIGN_SYSTEM.md` §5d states the rule for both surfaces: *“No metric the
product does not record — no focus time, no ‘daily progress’ percentage; DalyHub
tracks no time and computes no percentage of a life.”* Analytics has held that
line since UIX-05 and says so in its own header. **Today had quietly broken it**:
a green `ProgressRing` reading `completed / today’s dated tasks` as a headline
percentage.

It is also not a defensible daily metric on its own terms. The denominator is
whatever the owner happened to date for today, so clearing three of three reads
100% and clearing nine of twelve reads 75% — the emptier day scores better.

Removed. `test/unit/today/TodayScreen.test.tsx` now asserts its absence, so the
line is guarded on the surface that crossed it.

---

## 5. What changed, by surface

### Today

- **Removed** `StatCardRow` and the daily-progress `ProgressRing`.
- **Removed** the “This week” `ComparisonBars` chart, and with it the now-dead
  `day/trend-view.ts` and its tests. It duplicated the summary’s first two
  figures *and* was unreadable with real data: the bars share one linear scale,
  so the fixture’s single day of bulk capture (124 created against a weekday
  range of 0–7) flattened the other six days to hairlines. Analytics owns trends.
- **Kept and restyled** `TodaySummary`: three measures, `--t-stat` (24px) figures
  down from 28px, and the two checkable measures now link (`/analytics`,
  `/goals`) — the rule every other figure on Today already followed.
- **Reordered** to greeting → day rail → measures → work, which is the
  reference’s composition and satisfies the fold guard’s intent.
- **Replaced the three-region grid with a work column and one rail.** Three
  regions in a grid are forced to a common row height and the day’s work is
  almost never the tallest; the rail’s sections stack in normal flow, so the hole
  in §2 cannot recur. The rail carries the brief’s priority order: Needs
  attention → Schedule → Goal progress → Continue working.
- **Phone (≤34rem): a measure is a row, not a card.** Label and note on the left,
  figure at the end of the line, ~52px instead of ~113px. Same DOM, same reading
  order, nothing moved by CSS `order`.

**Result at 390×844: three task rows and the “+41 more overdue” link in the first
viewport, against zero at the base commit.**

### Projects

Audited first, and mostly left alone — `.dh-pcard` already had a hairline
boundary, `--dh-radius-md`, **no resting shadow**, a border-colour hover rather
than a lift, and the 40px identity mark. That is §17’s target character and it
was already met.

One real defect: the card title read Material’s `title-medium` (16px), which
wrapped longer Project names onto a second line and left the gallery’s rows
ragged, every card as tall as its worst neighbour. Now `--dh-text-card-title-*`
(15px), the size the reference draws.

**Deliberately not changed:** the per-Project progress-bar accent. The prompt
flags it as possible rainbow, but `mockup3.png` draws exactly the same thing —
violet, green, red, orange and blue bars across one Projects grid. The current
behaviour matches the reference and was left alone.

### Goals

Arithmetic, direction handling, inverse goals, measurement history and
target-aware chart behaviour are untouched. The problem was visual and it was
Material typography:

- **The current value was `display-small` (36px) against 18px siblings** — a full
  Material headline ladder apart, which stopped “83 kg” being the lead figure of
  a quartet and made it a banner with three captions under it. Now
  `--dh-text-metric-*` (24px). Start / Now / Target / Remaining read as one
  reading again, which is the whole point of the row.
- **The pace facts sat in a filled grey well** with a supporting corner radius —
  Material tonal-container language on a record that is otherwise white surfaces.
  Now an open band between two hairlines.
- Metric eyebrows moved from `label-small` to `--t-eyebrow`.

### Areas

**Audited and deliberately barely touched.** The flat list is quiet, stable,
implies no completion, and fabricates no percentage — which is exactly what §22
and §23 ask for. It inherited the typography and dark-mode fixes through the
shared card family and the token layer, and nothing else was changed. Preserving
a surface that is already right is a result, not an omission.

---

## 6. Shared component changes

- **`scripts/generate-m3-scheme.mjs`** — new `DALYHUB_PRIMITIVES`, emitting the
  Part B palette as a light/dark pair inside the generated markers. See §7.
- **`app/styles/tokens.css`** — the colour primitives moved out of the hand-
  authored DalyHub block into the generated section. Geometry, spacing,
  typography, duration, easing, z-index and the two focus rings stay authored.
- **`app/shared/tokens/dalyhub.ts`** — two new type roles, `card-title` (15px/600)
  and `metric` (24px/600). Their absence is *why* the card families were still
  reading Material’s typescale: both are real jobs in this product and neither
  had a DalyHub role.
- **`app/styles/card-family.css`** — migrated to the DalyHub ladder (§9).

### Not changed, and why

- **`StatCard` / `StatCardRow` were not deleted.** §32 asks for a serious review
  of whether the component belongs. The answer is that its *use on Today* did
  not; the component itself is still used correctly elsewhere (Analytics,
  Reviews), where the figures are the subject of the page rather than a caption
  for the content below them. Removing Today’s use is the fix. Deleting a
  component that other surfaces use correctly would have been churn.
- **`ProgressRing`** is still used by other surfaces and was only removed from
  Today.

---

## 7. The dark-mode fix, and why it is in the generator

The obvious fix — hand-author a dark block beside the light one — is **wrong
here, and the repository already says so.**
`test/unit/tokens/appearance-cascade.test.ts` asserts *“adds no appearance RULE
outside the generated markers”*, on the reasoning that “the appearance blocks are
GENERATED; a hand-written override for one appearance is exactly the drift
`scheme:check` exists to catch”. That test is right, and an early attempt at the
hand-authored fix failed it — correctly.

So the pair is emitted from `generate-m3-scheme.mjs` instead. This keeps one
mechanism, gives all five colour schemes the dark half at once, and keeps
`scheme:check` authoritative over every appearance-dependent colour in the
product without exception.

**The light values are the Part B originals, unchanged to the digit**, so the
appearance the product already shipped is byte-identical. Only the dark half is
new.

How the dark half was chosen:

- **The surface ramp is inverted, not mirrored.** In light a card is lighter than
  its page, so in dark a card is lighter than its page too (`canvas #121215 →
  surface #1a1a1f → subtle #202027 → muted #26262e`), and `sunken` stays the one
  rung *below* the page in both. That is what keeps “a container inside a
  container” reading the same way in both appearances.
- **Borders invert at slightly higher alpha** (6% → 9%): a 6% black hairline on a
  light page and a 6% white one on a near-black page are not equally visible.
- **The violet lightens** to `#b5a8ff` — Part B’s `#5b4bd6` on a `#121215` page
  is ~2.4:1 and unreadable — and its tint becomes a translucent block rather than
  a pale wash, which is what the semantic layer’s own rail comment already
  described.
- **Feedback and priority keep their meanings** (P1 red, P2 orange, P3 blue, P4
  grey) and lighten to stay legible, so the priority language is one vocabulary
  in both appearances. Their tints become translucent so they compose over
  whichever surface they land on.
- **Shadows deepen and the scrim strengthens**, because elevation is still spent
  on genuinely floating UI and a shadow tuned for white is invisible on near-black.

A new test — *“gives every colour primitive a dark counterpart in both dark
blocks”* — asserts the defect cannot return, in the device-dark block and the
explicit-dark block alike.

---

## 8. Test results

Baseline established by running the suite at the exact base commit `a2e0c8c2`
**before any change**:

```
Test Files  2 failed | 398 passed (400)
Tests       2 failed | 5600 passed (5602)
```

The two pre-existing failures are described in §1.3. **Both are fixed by this
pass** — the Today one by fixing the product rather than the assertion, the
AppShell one by re-pointing a guard at a deliberate, reference-backed rename.

After:

```
pnpm run format:check   pass
pnpm run lint           pass
pnpm run typecheck      pass
pnpm run scheme:check   pass  (tokens.css and scheme.ts match the generator)
pnpm run icons:check    pass  (11 icon assets match canonical geometry)
pnpm run test:unit      Test Files 400 passed (400) · Tests 5590 passed (5590)
```

The unit total moves 5602 → 5590: the removed workload chart took its own tests
with it, and the removed stat cards took theirs. Replacements were added for
every rule those tests protected — the canonical-count claim, the zero-never-
paints claim, the links-to-its-records claim — plus new guards asserting the
*absence* of the daily-progress percentage, the stat row and the chart.

No `.skip`, no `.fixme`, no added retries, no widened timeouts, no weakened
assertions.

---

## 9. MD3 dependence removed

Active `--md-sys-*` references in the touched stylesheets:

| File | Before | After |
| --- | --- | --- |
| `today.css` | 41 | 3 |
| `projects.css` | 4 | 0 |
| `goals.css` | 44 | 2 |
| `areas.css` | 10 | 0 |
| `card-family.css` | 272 | 38 |

Active UI files matching `md-sys` across `app/`: **109 → 80**.

**Zero typescale, shape and motion references remain in any of the five files.**
Everything that survives is a colour role, and every one of them is in the class
the token layer explicitly says should read the generated role directly — “a
chart series, a priority ramp, an identity accent … those are data vocabularies,
not surface vocabularies”:

- `--md-sys-color-area-accent-1…6` — Area identity accents.
- `--md-sys-color-entity-meeting` — entity identity.
- `--md-sys-color-state-due-soon` — a task-state colour.
- `--md-sys-color-{error,success,warning}-container` + their `on-` pairs, and
  `secondary-container` — status badges and the selected measurement-unit chip.
  These *are* Material tonal-container language and are the honest remaining
  debt for this axis (§11).

The migration was semantic, not mechanical: each Material role was mapped to the
DalyHub role that does the same job, `letter-spacing` declarations reading
Material tracking were dropped rather than re-pointed (DalyHub roles carry their
own), and two missing roles were added rather than approximated.

---

## 10. Responsive, dark-mode and accessibility findings

**Responsive.** Verified at 1440 / 1280 / 820 / 390 in both appearances. No
horizontal overflow at any width. The phone composition is designed rather than
stacked: the measure row is re-laid out (§5), the rail follows the work in DOM
order, and nothing is moved by CSS `order` — so the visual order, the reading
order and the tab order are the same order at every width.

**Dark mode.** Was absent; is now a near-black frame with a charcoal rail, a
clear surface ramp, hairline borders, restrained violet, legible metadata and
semantic red/orange/blue/grey that still read. No glowing violet blocks. See
`after/*-dark.png` against `before/*-dark.png`, which are the same page.

**Accessibility.**

- Heading structure unchanged: Focus’s bands remain `h3` under the panel’s `h2`.
- The linked measures are real links with accessible names; the whole card is the
  target, so the figure is not a small aim point.
- Colour is never the only carrier: the Overdue band is named, priority carries
  its tag and an `aria-label`, and Goal state is a word beside the bar.
- The 44px `.dh-check-circle-target` hit area on Today’s task rows is untouched.
- Removing the chart removed a chart — its text equivalent went with it, and the
  figures it described remain as text in the summary above.
- Dark-mode foregrounds were chosen against their own surfaces rather than
  inverted.

---

## 11. Remaining debt

Honest, and deliberately not fixed here:

1. **Material tonal containers in status badges.** `secondary-container`,
   `error-container`, `success-container`, `warning-container` and their `on-`
   pairs still dress badges and the selected measurement-unit chip. Fixing them
   is a shared-feedback-vocabulary pass, not a Today/Projects/Goals/Areas one,
   and doing it piecemeal would leave two badge languages in the product.
2. **`TodayActivityTrend.days` is now unused by the client.** The loader still
   derives the totals the summary needs from the same read, so no query changed
   (§40 protects the query architecture). Narrowing the model is a follow-up.
3. **`box-shadow: var(--app-elevation-resting)` remains in several rules.** The
   token resolves to `none`, so these are inert compatibility shims, not resting
   shadows — the §28 rule is already honoured in the rendered product. They are
   noise to be swept when the `--app-*` layer retires, not a visual defect.
4. **`dayChips`, `dayProgress` and `nextUp`** remain exported and unit-tested in
   `day-view.ts` with no current product consumer. They are pure, correct and
   cheap; removing them is a separate decision about whether the day’s figures
   ever return in another form.
5. **`--dh-color-bg-sunken`** is still consumed elsewhere and can read as a tonal
   well on white-surface records. Only the Goal pace band was converted here.

---

## 12. Definition of done — self-assessment

| Criterion | State |
| --- | --- |
| Competing design generations reconciled across Today + Core Spine | Yes |
| No obvious merge-created duplicate UI remains | Yes — §2 and §3 |
| Today has a clear hierarchy and is less busy | Yes — five metric cards and a chart → one measure row |
| Today prioritises actionable work | Yes — three task rows in the phone’s first viewport, from zero |
| Duplicated summary/stat information removed | Yes |
| Projects compact and actionable | Yes — card title 16px → 15px, ragged rows resolved |
| Goals centre meaningful progress | Yes — 36px lead figure → 24px, tonal well removed |
| Areas remain quiet and non-completable | Yes — audited, deliberately unchanged |
| Touched surfaces no longer resemble MD3 | Yes — zero typescale/shape/motion left |
| Shadows reserved for floating UI | Already true; verified |
| Typography and shape belong to DalyHub | Yes — two roles added to close the gap |
| Colour restrained | Yes — accent tiles and the green ring gone from Today |
| Priority language correct | Yes — unchanged, and confirmed against `mockup2.png` |
| Inbox / Upcoming navigation correct | Yes — unchanged, one destination each, real routes |
| Phone navigation deliberate | Yes — unchanged; “Add” confirmed against all three references |
| 390px genuinely good | Yes |
| Dark mode genuinely good | **Fixed** — it did not previously exist |
| Accessibility intact | Yes — §10 |
| Tests pass, pre-existing failures proved against base | Yes — §8; both were fixed |
| Before/after screenshots demonstrate improvement | Yes — 44 pairs |
