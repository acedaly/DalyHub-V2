# M3X-02 gap analysis — 2026-08

> Phase A of the second Material 3 Expressive pass. What the product looks like
> **after PR #144**, read off a captured evidence set rather than off memory, and
> measured against the approved DalyHub M3 Expressive direction rather than
> against the state PR #144 replaced.
>
> Its predecessor — [`M3_EXPRESSIVE_AUDIT_2026_08.md`](M3_EXPRESSIVE_AUDIT_2026_08.md)
> — remains accurate about the *starting* point and is not restated here.
>
> **Evidence.** The *before* state of this pass is PR #144's *after* state,
> captured as the unprefixed set in `assets/m3x-2026-08/` — so it was read from
> there rather than captured a second time. The *after* state is
> `assets/m3x-02-2026-08/`. Neither folder was committed to the repository; the
> findings below record what each capture showed. The after set was captured by
> [`e2e/m3x-02-screenshots.spec.ts`](../../e2e/m3x-02-screenshots.spec.ts) at
> 1280, 1440, 1920, 375, 390 and 430 in **both** appearances against the seeded
> development database:
>
> ```sh
> CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/m3x-02-screenshots.spec.ts
> ```

---

## 1. The one-sentence diagnosis

PR #144 gave every page a hero and left everything under it identical, so the
product has exactly **two** levels — *the hero*, and *everything else* — and the
second one is where the owner spends the whole working day.

That is a foundation, not a finished transformation. This pass adds the missing
middle.

---

## 2. The rule that has to change first

PR #144's own rule is the constraint:

> One expressive surface per page.

Held literally, it forbids the very thing the approved direction is made of — a
project's identity, the day's current focus, the next thing due, a real measure
of progress. It is replaced by three levels
([DESIGN_SYSTEM.md → the hierarchy model](DESIGN_SYSTEM.md#the-hierarchy-model-m3x-02)):
one dominant surface, a small number of supporting expressive elements
subordinate to it on every axis, and a quiet working interface underneath.

Everything below is read against that model.

---

## 3. Module by module

For each: what #144 already improved · what still uses the old composition · what
this pass does.

### Today

| | |
| --- | --- |
| **#144 improved** | The `ExpressiveSummary` carries the day's figures and its progress ring; the greeting stepped down to emphasized `headline-small`; the overdue slab became a quiet tint with a state rule. |
| **Still old** | The hero is a full-width band over a day column that is frequently ~280px tall and a rail that is ~700px — the audit's own **H1**, half-answered: the page's most important region is still its emptiest. Below the hero, "My day", "Needs attention" and "Continue working" are three visually identical white panels. |
| **Too uniform** | Three panels, one weight, no order. Nothing between the hero and a list row. |
| **Missing** | The screen never answers *what next?*. A meeting's time is a row in a list; the project the owner was last working in is the first of three interchangeable rows. |
| **Desktop** | Symmetrical two-column dashboard; unequal columns and an asymmetric composition are what the direction asks for. |
| **Mobile** | First viewport: greeting, hero, then the overdue run. Three of the four questions a phone glance asks are answered; *what next* is not. |
| **This pass** | The hero is **removed**. The day's figures become a row of quiet `StatCard`s on the canvas — the same `dayChips` model, so every rule it held still lives in one pure, tested place — and the meetings card carries the next start time from the server-decided "has this started?". Meetings leave the day column for their own **Schedule** panel; the day column becomes **Focus**. Two unequal columns, DOM order == phone order. |

### Tasks

| | |
| --- | --- |
| **#144 improved** | Rows fell from ~88px to ~73px; titles took the emphasized weight; the module filter slot and the control row merged onto one line. |
| **Still old** | The information hierarchy the audit's **H4** describes is intact: priority, urgency, due date, planned date, parent and sector are drawn at ONE weight, and `Overdue · due 25 Jul 2026` prints the date the inline field six pixels along already prints. |
| **Too much metadata** | `Sector: No sector` on every untriaged row in the product. |
| **Too desktop-oriented** | At 390 on a mouse-driven browser the reveal-on-hover rail reserved 192px of a 263px supporting run, collapsing it to the width of its widest item: every fact on its own line, wrapped mid-phrase, one task 259px tall. |
| **This pass** | The run declares three tiers and the stylesheet draws them at every width; the chip states the state and not the date; an unset sector is not drawn; the overlay rail becomes a wide-row arrangement, so a narrow window gets the touch layout. |

### Projects

| | |
| --- | --- |
| **#144 improved** | Gallery rows share a height and footers align; titles are emphasized and clamped; the metric takes the emphasized headline. |
| **Still old** | Three metadata lines per card at one weight ("1 open task · 0 done", "No progress since 1 Jan 2020", "Updated 1 Jan 2020"), with the progress bar — the only element answering *how is this going?* — still the quietest thing on the card (**H6**). The identity mark is 40px beside the title rather than leading the composition. |
| **Mobile** | The desktop card at one column: five vertical bands per record, ~170px each, two and a half records to a viewport. The clearest case in the product of a mobile layout that is a desktop layout stacked. |
| **This pass** | The mark takes the large rung; the bar takes 8px and the percentage `title-large` emphasized; the open/done pair, the updated line and the "No tasks yet" placeholder all go; below `md` the same DOM re-composes into a compact row. |

### Areas

| | |
| --- | --- |
| **#144 improved** | Shared gallery, compact fact group, overflow on the card. |
| **Still old** | 40px mark; an "Updated" line on every card. |
| **This pass** | The large rung, and the updated line goes. **No progress and no health score** — an Area has neither, and inventing one is the fabricated precision `PRODUCT_PRINCIPLES` rules out. |

### Goals

| | |
| --- | --- |
| **#144 improved** | A summary built from real counts, with no invented completion percentage. |
| **Still old** | The cards are exactly what the audit's **H7** described: a title, an "Open" chip that every open Goal wears, and a sentence about what is *absent*. |
| **Missing** | The Goal's one real measure — how many of the Projects advancing it are complete — is computed by the collection loader, used once for the alignment evaluation, and thrown away. |
| **This pass** | The contribution is carried through to the card as its progress; the "Open" chip goes; the alignment reason is stated only when there is no measure to read. The mockups' weight readings and capability counts are **not** drawn: the Goal model carries a target *date* and a definition of done, and nothing numeric. |

### Notes

| | |
| --- | --- |
| **#144 improved** | The filter band is one row rather than five stacked selects. |
| **Still old** | Six native selects in a band above a single 200px column, with the rest of a 1,440px screen empty — **H8**, the widest module using its width worst. |
| **Mobile** | The band is still the first viewport. |
| **This pass** | Search and Sort stay in the band; the four narrowing dimensions move behind a native `<details>` inside the same form (so "Apply" and the no-JS path are untouched, and it opens itself when a filter is applied). The directory becomes a gallery, one column below `md`. |

### Editor

| | |
| --- | --- |
| **#144 improved** | The desktop writing surface got the `max(40dvh, 16rem)` floor. |
| **State** | Reviewed at 1440 and found already close to the target: a compact header, a one-row toolbar, and a writing surface using the pane's width. |
| **This pass** | No composition change. Recorded as reviewed rather than as done-by-omission. |

### Meetings · Diary

Restrained by design and reviewed as such. Both keep Level 3 throughout; neither
gained a surface, because neither has a page-level question a hero would answer.

### Analytics (Reviews)

The seeded development workspace holds **no Reviews**, so every capture of this
surface is its empty state. Composition work here would be done blind against
fabricated data, which the brief rules out. **Not changed**, and disclosed as
such rather than reported as complete.

### Mobile navigation · Quick Capture

Both were re-reviewed at 375/390/430 in both appearances and both work: safe
areas, the selected state, touch targets, the FAB/bar exclusion and the capture
sheet. Unchanged, deliberately — the brief says to keep what functions.

---

## 4. Cross-cutting gaps

| # | Gap |
| --- | --- |
| G1 | **No Level 2 primitive.** "A short surface with identity, a measure and one action" was built by hand or not at all. → `SupportingSurface`. |
| G2 | **The identity mark has one size.** A gallery card and a 44px row draw the same 40px square, so the mark cannot lead a composition anywhere. → three rungs on `AccentIcon`. |
| G3 | **`data-priority` was a phone-only idea.** A 1,400px row with eight equal facts is not easier to scan than a 358px one. → the tiers apply at every width. |
| G4 | **The gallery's column count.** 16.5rem yields three columns at 1280. Four were captured and **rejected**: at 229px a Project title breaks mid-word. 15.5rem keeps three comfortable columns at 1280 and brings the fourth in as soon as the width supports it. |
| G5 | **Absence text is everywhere.** "No tasks yet", "Sector: No sector", "Links: None", "Updated …" on every card of every gallery. → drawn only when the value is present and useful. |
| G6 | **Responsive composition by `order`.** Tempting, and wrong: `order` moves pixels and leaves the reading order and the tab order behind. → the markup is written in the phone sequence and the desktop grid places it. |

---

## 5. What this pass must NOT change

Restated from the first audit and still binding: routes, modules, information
architecture, the data model, CRUD and inline editing, the generated token
architecture and its `scheme:check` gate, the Cloudflare shape, the accessibility
contract. Added for this pass: **PR #144's foundation is kept, not revisited** —
the violet seed, the token layer, the shape and elevation hierarchy, the quieter
cards, `ExpressiveSummary`, and the light/dark pair are all inputs here, not
subjects.
