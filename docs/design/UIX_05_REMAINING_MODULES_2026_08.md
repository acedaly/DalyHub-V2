# UIX-05 — People, Assets, Reviews, Analytics & Settings, August 2026

> The last of the five-part product redesign. UIX-01 rebuilt the shell, Today and
> Tasks; UIX-02 gave Projects and Areas surfaces of their own; UIX-03 did the same
> for Goals. This pass takes the four remaining record modules off the generic
> shared card, builds the Analytics surface the product did not have, and gives
> Settings a phone composition instead of a scrolling rail.
>
> **It is not a colour pass.** Three record families are new, one module is new,
> and two surfaces have genuinely different phone compositions from their desktop
> ones. What did NOT change is every domain rule: no migration, no new repository,
> no new write, and no figure that DalyHub cannot honestly produce.

---

## 0. Where this started

`origin/main` at `0c661e5c` — "UIX-03: redesign Goals as a measurable-outcome
product surface (#154)". Branch `claude/uix-05-remaining-modules-spfm56`, cut from
exactly that commit.

**The previous UIX work was verified present before anything was built.** The
shell, Today and Tasks carry UIX-01's compositions (`.dh-tasklist`, D18's one-line
row, D19's removed FAB, D20's header-mounted sheet action); Projects and Areas
carry UIX-02's `.dh-pcard` and `.dh-erow`; Goals carries UIX-03's `.dh-gcard`,
`GoalAreaContext.colourRank` and the target-inclusive `TrendLine`. The design
system's departures table runs to D25 and its §5a/§6 sections describe all three.

**One gap at the time, since closed.** The brief listed UIX-04 (Notes, Diary,
Meetings) as completed work; at the point this branch was cut it was not on `main`
and had no branch, which was reported rather than worked around. Nothing in UIX-05
depended on it — the foundations this pass extends are UIX-01's shell, UIX-02's
card family and UIX-03's identity rules, all of which were present — so it
proceeded with Notes, Diary and Meetings untouched.

UIX-04 has since landed (`18c4414b`) and is **merged into this branch**. The two
passes turned out to be genuinely disjoint in product terms: UIX-04 rebuilt the
writing surface, the Notes rail, the Diary week strip and the Meeting notebook;
UIX-05 rebuilt the four record collections beside them and added Analytics. They
met in exactly two places, both in the test fixtures rather than the product — see
§8.

---

## 1. The audit: one card doing five jobs

Before UIX-02 every record in the product rendered through the shared `Card`.
UIX-02 took Projects and Areas off it, UIX-03 took Goals, and the four modules
this pass covers were still on it — which meant the surface whose subject is a
**relationship** answered its question in the shape built for a **body of work**.

| Module | The question its screen exists to answer | What it drew |
| --- | --- | --- |
| People | Who is in my life, and who have I not spoken to? | An alphabetised directory: an entity glyph, a title, and six metadata facts at one weight |
| Assets | What do I own, and what does it need from me next? | A one-column list behind **seven** permanent filter controls; the date was the fifth fact |
| Reviews | Which period is this, and is it finished? | "Weekly review" printed eight times, with the period as a grey subtitle |
| Analytics | Where has my effort gone? | *The module did not exist* |
| Settings | Which preference do I want? | Eight flat links; on a phone, a horizontally-scrolling rail above every section |

Nine specific defects, each fixed below and each visible in the shipped diff:

1. **A Person was drawn as a body of work.** No completion, no proportion, no due
   date — so most of the card was the parts a Person does not have.
2. **PEOPLE-03's derived stay-in-touch state was buried** as the second of six
   equal facts, on the surface whose whole question it answers.
3. **The People list could not reach anyone.** It printed the *name* of the
   preferred contact method ("Email") and never the address, so writing to someone
   from the People screen was impossible without opening their record.
4. **Every generated avatar was the same violet disc**, and thirteen relationship
   values reached the screen as one grey word.
5. **The Assets filter bar was three rows of chrome** above the first record at
   1280px, for a collection whose answer is a date.
6. **A Review was identified by its name**, which is derived from its period in
   every workspace that has not renamed one.
7. **A half-finished Review offered no way to finish it** from the collection.
8. **There was no Analytics surface at all**, and the roadmap had deferred one
   because "the seeded workspace holds no Reviews, so it cannot be reviewed by
   eye" — a reason to delay a *Review* trend, not a reason to have no answer to
   "where did my week go?".
9. **Settings on a phone was a swipe rail.** DalyHub's own rule, written in
   `people.css`, is that "an action the user has to swipe to find is not a quick
   action".

---

## 2. What shipped

### 2.1 People — `PersonRow` / `.dh-prow`

The fourth record family, beside `.dh-pcard`, `.dh-gcard` and `.dh-erow`.

```
┌──────────────────────────────────────────────────────────────────────┐
│ (SJ)  Sarah Johnson         sarah@…      ● Due for a catch-up     ⋯  │
│       Family · Acme         0412 345…      Last spoke 6 weeks ago    │
└──────────────────────────────────────────────────────────────────────┘
   ^identity                ^reach          ^rhythm
```

| Rule | Why |
| --- | --- |
| **The face leads**, and it is the one CIRCULAR mark in the product | Every other identity mark is a rounded square because those records are containers. A person is not one |
| **Reach is a real link, not a fact** | `mailto:`/`tel:`, built server-side by `personReach`. The commonest act from a People list is now one click rather than a record visit away |
| **The rhythm is the trailing column** | "Who have I not spoken to?" is the question the list is opened with, so PEOPLE-03's derived state gets the position the eye lands on last and stays |
| **An absence is an absence** | No contact draws nothing. No relationship says nothing — not "Other". No shared history says "Nothing recorded yet", which is an invitation rather than a deficiency |

**The circle** (`person-circles.ts`) is the collection's lens: thirteen
relationship values are the right vocabulary for a *record* and exactly the wrong
one for a *collection*. Three circles — Personal, Work, Services — derived purely
from the relationship the owner already chose, so there is no second vocabulary to
keep in step and no migration. `other` maps to **no circle**: it is a real choice
meaning "none of these", and putting it in one would invent the classification the
owner declined to make.

The circle also supplies the avatar's accent, which is D21/D22's rule applied
where it holds: identity comes from a classification the owner made, never from a
hash of an id. The generated avatar mixes its container toward the card at the
same generated strength `.dh-accent-icon` uses (D17/D4), so a list of People is a
soft palette in light and a calm one in dark.

**Two removals.** The list/grid toggle is gone — a Person has four facts, and four
facts in a 280px card is a card that is mostly empty (D25's reasoning, applied
where it holds just as well). The `Recent` scope left the rail, because "recently
added" is an *order* and already exists as one in the sort; the route stays so no
link breaks.

The **"Needs a catch-up"** filter is the module's own question rather than a
generic facet, carries its own count, and is a real `aria-pressed` toggle. Default
sort is now **the rhythm**: the people who have gone quiet lead.

### 2.2 Assets — `AssetCard` / `.dh-acard`

The fifth family. An Asset's measure is **time**.

```
┌────────────────────────────────────────┐
│ [🚗]  Hilux                        ⋯   │
│       Vehicle · Toyota HiLux SR5       │
│                                        │
│ ● Service overdue                      │  ← ONE commitment, named
│   Due 3 August 2026                    │  ← when, absolutely
│ ──────────────────────────────────────  │
│ Active · Garage                        │  ← state and place, quiet
└────────────────────────────────────────┘
```

| Rule | Why |
| --- | --- |
| **One commitment, pinned to the floor** | An obligation signal wins over the canonical warranty/renewal/service date, because it is a live commitment the owner created. A card carries one urgent line, never a maintenance history (§12) |
| **Colour is spent on STATE, not identity** | Thirteen Asset types over a six-accent ramp collide two times in three. The type GLYPH is a far stronger signal than a coincidental tint — a car and a shield are told apart instantly — so the mark stays neutral and the card's colour budget goes to what is overdue |
| **The foot is pinned** | Same rule as `.dh-pcard`: a gallery row shares a height, and a grid of dates is only comparable when they land on one baseline |
| **An absence is drawn as an absence** | "Nothing scheduled", once, in the space the date would have taken |

Rule 2 does **not** breach D21. D21 says an identity mark is never repainted by
status; here the mark and the state are two separate objects on the card, and the
state always carries its own words.

**The seven filters moved into the one shared collection sheet** at every width
(TASKS-03's `persistentControls`), with the shared removable chips explaining what
is active. Search stays visible, because a search box behind a button is a search
box nobody uses. Every filter, sort, view and cursor is still URL-backed and still
applied server-side over the full collection.

### 2.3 Reviews — `ReviewCard` / `.dh-rcard`

The sixth family, and the only record whose identity is not a name.

```
┌────────────────────────────────────────┐
│ WEEKLY                             ⋯   │  ← the cadence, as an eyebrow
│ 27 Jul – 2 Aug 2026                    │  ← the IDENTITY
│ Weekly review                          │  ← the name, demoted or dropped
│                                        │
│ ████████████░░░░░░░░  4 of 6 written   │  ← the measure: the reflection
│ In progress · updated 2 August         │
│ [ Continue ]                           │
└────────────────────────────────────────┘
```

| Rule | Why |
| --- | --- |
| **The period is the title**, at the card's largest rung in tabular figures | A column of Reviews then reads down as a calendar. The record's own name is demoted, and DROPPED when it is the product's own derived "Weekly Review — …" form — otherwise the gallery prints the same three words eight times |
| **The measure is the REFLECTION**, as an exact fraction | "4 of 6 written" is checkable; "67%" on a six-point scale is not. Drawn on the shared 8px entity bar (D5), because it is the same kind of fact a Project card's bar carries |
| **A completed Review draws no bar** | "How much is written?" has stopped being live, and a wall of full green bars is a gallery with nothing to scan. It states when it closed instead — the fact that matters afterwards |
| **Unfinished work carries its own way to finish** | Start / Continue, straight into REVIEW-02's guided flow, as a real control above the card's own link |

The type filter is now labelled **Cadence**, which is what it is.

### 2.4 Analytics — a new module

DalyHub's first surface whose subject is not a record. Today asks "what now?"; a
Review asks "what happened in that period?"; Analytics asks the one question
neither can: **where has my effort actually gone?**

```
[ 7 days · 4 weeks · 12 weeks ]              5 – 11 August 2026
──────────────────────────────────────────────────────────────
Tasks completed   Projects finished   Goals on track   Areas worked in
24                3                   5                4
6 more than…      1 fewer than…       of 9, right now  61 Tasks attributed
──────────────────────────────────────────────────────────────
Completion trend                    Where the work landed
╱╲__╱╲___                           Health & Fitness  ████████  14  70%
                                    Work & Career     ███        6  30%
```

**It adds no repository, no write, no migration and no new kind of query.** Every
fact comes from a read that already existed:

| Shown | Read | Guarantee |
| --- | --- | --- |
| Completions — range, previous range, per bucket | `ReviewInsightRepository.countPeriodCompletions` | Exact for any range, from the append-only Activity stream, counted DISTINCT per record |
| Where the work landed | `listPeriodContributions` | The same read the Review's distribution uses, with the same stated approximation (ancestry through the CURRENT spine links) |
| Goals on track | AREA-03's alignment evaluator over one bounded page | Unchanged, and not re-derived |

**Three refusals, and they are the design.**

1. **No focus time, and no daily-progress percentage.** The supplied reference for
   this screen carries both. DalyHub records no time and computes no percentage of
   a life, so both would have to be invented. The row shows the four things the
   product genuinely knows, and each figure links to the records behind it so a
   doubted number can be checked — the whole difference between an analytics
   screen and a dashboard.
2. **No donut.** The reference's breakdown is a ring. The design system's agreed
   chart language (Part 2, A5) is line, sparkline, ring, horizontal progress and
   milestone track; a share across six or eight named categories is what
   horizontal bars are for, and a ring makes two similar slices impossible to rank
   without reading the legend anyway. The bars carry each **Area's own identity
   accent** (D22), so the panel reads as the Areas the owner already recognises.
3. **No score.** Not a productivity index, not a grade, not a weighted composite —
   REVIEW-03's own refusal, for the same reason.

**Comparisons are sentences, not arrows.** "6 more than the previous period (18)"
is checkable; "+33%" hides its base, and from a base of zero it is not a figure at
all — so the evaluator returns "No Tasks in the previous period" for that case
rather than inventing one. The comparison line is never green-for-up and
red-for-down: a week with fewer completed Tasks may be a week of one large
Project, and painting it red would make the product an opinion rather than a
record.

**Three ranges, not a date picker.** A free picker has to be *used* before the
screen says anything, and it invites comparisons the reads cannot make honestly.
Seven days, four weeks and twelve weeks each have a previous period of exactly the
same length, which is what makes the arithmetic defensible.

**Buckets are laid out backward from today**, so the most recent bucket is always
whole and any remainder falls at the oldest end. A partial bucket at the *recent*
end would draw the current period as a dip every time the page is opened mid-week
— a chart that lies about the direction of travel.

**The range total is its own window, never the sum of its buckets.** The aggregate
counts DISTINCT per record *per window*, so a Task completed, reopened and
completed again on two different days would be counted twice by a sum. Two grouped
statements, both flat with respect to workspace size.

### 2.5 Settings — two screens on a phone

Three changes, all structural.

**The sections are grouped.** Eight equally-weighted links in one column is a menu
with no shape, and the two that are about the owner's *account* sat between two
about the app's defaults. Three groups — *How DalyHub works*, *Your data*, *This
app* — each a real heading naming the list beneath it, so a screen reader hears
"Your data, list, 3 items" rather than eight links in one run.

**Every section carries a summary line**, described by its link via
`aria-describedby` rather than folded into its name — supporting text is announced
after a name, and a rail whose link names are paragraphs helps nobody.

**The phone is two screens, not two columns.** Without a chosen section it shows
the LIST, each row two lines with its summary; with one, it shows that section and
a way back. `data-chosen` is resolved on the SERVER from `?section=`, so the phone
lands on the right screen on the first byte — no viewport sniffing, no hydration
mismatch — and Back genuinely returns to the list because every section is a real
URL. General now names itself in the URL like the other seven, because an absent
parameter has to mean "the list" and nothing else.

The page heading also moved out of the content column and now spans the page,
where a page heading belongs.

---

## 3. What each module does NOT share with the others

The brief's central requirement was that these modules stop looking alike. The
test the design system sets for that (§41) is whether they are distinguishable
with the labels hidden:

| | Leads with | Measure | Colour carries | Surface |
| --- | --- | --- | --- | --- |
| **Project** (UIX-02) | mark, then the measure | a proportion (8px bar + %) | the Area's identity | gallery card, bottom-heavy |
| **Goal** (UIX-03) | mark, then the reading | a reading + its shape | the Area's identity | gallery card, middle-heavy |
| **Area** (UIX-02) | mark, then relationships | none — an Area never completes | the Area's own identity | one row list |
| **Person** (UIX-05) | a FACE | none — a rhythm, in words | the circle's identity | one row list, four columns |
| **Asset** (UIX-05) | a type GLYPH | time to the next commitment | the commitment's STATE | gallery card, bottom-heavy |
| **Review** (UIX-05) | a PERIOD | the reflection, as a fraction | the state, as one dot | gallery card, top-heavy |

Nothing above is a variant of anything else. Three of them lead with something no
other record has (a face, a glyph, a date), two carry no proportion at all, and
one is the only surface in the product that spends its colour on state.

---

## 4. Responsive behaviour

Desktop and phone are allowed genuinely different **compositions** of the same
data, the same routes and the same components — and every one of them is DOM
order, never `order` (§7).

| | Desktop | Phone |
| --- | --- | --- |
| People | Four columns: face · identity · reach · rhythm | Two lines: name + state, then the last shared moment. The reach column goes below ~68rem — "who have I not spoken to?" beats an address that is one tap away on the record |
| Assets | Gallery + the shared control sheet beside the search box | Same card at compact padding; the card is already two stacked blocks, which IS the phone shape |
| Reviews | Gallery | Same card at compact padding |
| Analytics | Metric row, then trend (wide) beside distribution | Metric row **two-by-two** — four figures stacked is four screens before the first chart — then the panels stacked |
| Settings | Grouped rail beside the section | **Two screens**: the section list, then one section |

---

## 5. Accessibility

- Every new surface states its meaning in **words**; tone only ever agrees. The
  Person row's rhythm, the Asset card's commitment, the Review card's state and
  the Analytics bars all carry their fact as text beside the colour.
- `forced-colors` rules cover all three new card families, the Person avatar, the
  Analytics metric row and its distribution bars.
- The Review card's bar is a real `role="progressbar"` with
  `aria-valuenow`/`min`/`max` and an `aria-valuetext` that is the same sentence
  printed beside it.
- Analytics' distribution bars are `role="img"` with a label naming the Area, its
  count, the attributed total and its share — so the chart is never the only
  statement of its own numbers.
- The Settings section summary is an `aria-describedby` DESCRIPTION, not part of
  the link's name.
- The People row's reach links carry `Email Sarah Johnson — sarah@…` as their
  accessible name, because an address read out of context in a list of twenty rows
  says nothing about which row it belongs to.
- Whole-row/whole-card links keep their focus ring on the ROW or CARD, not on the
  inline text of the link — a keyboard user needs to see which record they are on.

---

## 6. Data

**No schema change. No migration. No new repository. No new write.** Two reads
were added to existing projections, both cheap and both on data already loaded:

- `SerializedPersonListItem.reach` — up to two reachable contacts per Person,
  resolved from fields the same row already carried, with the `mailto:`/`tel:`
  href built server-side so no component assembles a scheme from a raw field.
- Analytics composes `countPeriodCompletions`, `listPeriodContributions`,
  `listAreas`, `listGoalsByAlignment`, `listGoalProjectContributions` and
  `listGoalAlignmentFacts` — seven grouped statements, flat with respect to
  workspace size and to the length of the range.

---

## 7. What was deliberately NOT done

- **Notes, Diary and Meetings are untouched by this pass.** They are UIX-04's
  scope, and inventing card families for them here would have pre-empted a design
  decision that belonged to it. UIX-04 has since landed and is merged into this
  branch — see §0 and §8.
- **No focus tracking, and no "daily progress" figure.** Adding either would mean
  inventing data. See §2.4.
- **No Analytics repository.** Everything the surface needs already existed as a
  read; adding a parallel aggregate would have created a second source of truth
  for the same counts.
- **No People record redesign beyond identity.** RECORD-01 and UIQ-011 already
  took the Person record's summary down to what the header cannot show, and the
  audit found nothing wrong with it. It gained the circle accent so the record and
  the collection agree about what colour a Person is, and nothing else.
- **No Asset record redesign.** The commitment vocabulary the card now leads with
  is the record's own (`asset-dates`, `obligationSignal`) — the card was the thing
  not using it.
- **No new chart dependency.** The trend is the shared `TrendLine`; the
  distribution is hand-rolled SVG-free bars over design tokens.

---

## 8. The UIX-04 merge

UIX-04 landed on `main` (`18c4414b`) while this branch was open, and is merged in
here. The two passes are disjoint in the product — different modules, different
surfaces, no shared component — and met in exactly two places, both in the test
fixtures.

**`e2e/today-fixtures.mjs` — two `person()` helpers.** UIX-04 added one that
derives first and last names from a display name, for a Meeting attendee row;
UIX-05 added one that takes the contact and relationship fields the People row
needs. They sit in different parts of the file and touch none of the same lines,
so **git merged both cleanly** — and two `function person` declarations in one ES
module is a `SyntaxError`, so the fixture would have refused to load at all. A
clean auto-merge is not the same as a correct one, and nothing in the test suite
would have caught it: the fixture is a script the specs shell out to, not a module
they import.

The resolution is one helper that is the union: an explicit `firstName`/
`lastName` still wins, and defaults fall back to splitting the display name, so
both call shapes keep working unchanged.

**`parkExisting` — the wrong altitude.** This pass had added `person`, `asset` and
`review` to the SHARED park list, which would have changed what every other
scenario shows. UIX-04 solved the identical problem better, by parking the types
its own scenario photographs inside that scenario. The merge adopts UIX-04's
pattern and moves the three types into `modules()`, leaving the shared helper on
the four types Today reads.

Everything else — the roadmap entry, `app.css`, the `clearFixtures` table list —
was an ordinary append on both sides and merged as the union.
