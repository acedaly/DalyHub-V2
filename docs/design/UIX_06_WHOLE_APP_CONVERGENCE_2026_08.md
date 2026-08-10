# UIX-06 — whole-application convergence

> The final broad UI pass. Not a redesign: UIX-01 → UIX-05 redesigned thirteen
> modules one at a time, and this pass asks the one question none of them could —
> **do they read as one product?**
>
> Base: `origin/main` at `25814a9` (UIX-05).
> Evidence: [`assets/uix-06-2026-08/`](assets/uix-06-2026-08/) — `before-*` and
> `after-*` at 320 / 390 / 1024 / 1280, in both appearances.

---

## 1. What the audit found

Five passes of module-at-a-time redesign left the product coherent *within* each
module and divergent *between* them. The BEFORE suite — every index, every detail
family and the shared overlays, captured in one run at the same widths — made
seven classes of divergence visible at a glance.

| # | Finding | Where |
| --- | --- | --- |
| F1 | **Three page origins at 1280.** A collection's title started at x=296 behind a generic entity badge, Today's and Analytics' at 256 with no badge to draw, Settings' at 240 on its own page padding — and Settings' title was six points smaller than every other page title | shell |
| F2 | **The control baseline was the size and shape of nothing else.** Native inputs and selects were 36px on 4px corners; every button, segment and filter trigger is 45px on `--app-shape-control`. Four modules also shipped the user-agent select chevron | Notes · Meetings · People · Reviews · Assets |
| F3 | **Five conventions for one subtitle.** "92 tasks", "50 projects loaded", "11 Areas", "0 current Reviews" — and Assets showed the current VIEW's name instead of a count. "1 notes loaded" was a plural bug in two of them | nine collections |
| F4 | **D18's two trailing columns were not columns.** The Project mark's auto-margin had no free space to absorb, so on six consecutive rows the marks began at x = 630, 510, 724, 672, 638, 670, and titles ellipsised with 200px of empty row beside them | Tasks |
| F5 | **Two differently-drawn control rails on one screen.** The lifecycle segments in the header's view slot, and four status chips floating loose between the header and the gallery | Goals |
| F6 | **Three card treatments against D1's one.** `.dh-card` drew a resting shadow; the empty state and the Settings group drew a hairline; the record families built since drew neither | product-wide |
| F7 | **Dark was not reviewed as a first-class appearance.** The top bar's search field had no visible container at all in dark, because `card-subtle` and `app-bar` generate to the same value | shell |

Two more were single-screen defects rather than classes: Today's glance row
tinted itself in its own tone (against D11, and against both root references),
and the not-found route was still the framework template's.

## 2. The convergence matrix

Thirteen index routes plus nine detail families, at 320 / 390 / 1024 / 1280 in
light and dark. **RED** = obviously legacy or broken. **AMBER** = minor
convergence work. **GREEN** = consistent.

| Route | Before | After | What changed |
| --- | --- | --- | --- |
| Today | AMBER | GREEN | glance row untinted (D11), page title weight, header origin |
| Tasks | **RED** | GREEN | the two trailing columns are columns at every width; rows are one 45px line; low tier off the row |
| Projects | AMBER | GREEN | header origin, count line |
| Areas | AMBER | GREEN | header origin, count line |
| Goals | **RED** | GREEN | status rail into the filter band; absence stops being a slab; count line |
| Notes | **RED** | GREEN | control baseline, chevron, one-row filter band, count line |
| Diary | AMBER | GREEN | header origin, empty state border |
| Meetings | **RED** | GREEN | control baseline, chevron, one-row filter band, count line |
| People | **RED** | GREEN | control baseline, chevron, row columns hold their tracks, count line |
| Assets | **RED** | GREEN | control baseline, two-row toolbar, subtitle is a count |
| Reviews | **RED** | GREEN | control baseline, two chevrons, labels off the band, count line |
| Analytics | AMBER | GREEN | header origin, empty state border |
| Settings | **RED** | GREEN | page origin, title rung, card borders, control rung |
| not-found | **RED** | GREEN | a designed surface with a way back |
| detail families (9) | GREEN | GREEN | unchanged — record headers keep their identity mark, which is information rather than decoration |

## 3. What was decided, and why

### 3.1 A collection header draws no glyph beside its title

The badge produced F1 directly: Today and Analytics have no entity type to
badge, so they could not have one, and the two page origins could never agree.
It was also the same icon the sidebar was already showing, highlighted, for the
same route — one glyph, twice, 200px apart.

The documented anatomy
([`DESIGN_SYSTEM.md` → the collection-header anatomy](DESIGN_SYSTEM.md#the-collection-header-anatomy-uiq-013uiq-014))
has always drawn the title leading, and both root references draw every index
that way. This is the implementation coming back to the contract, not a new
direction.

**A RECORD keeps its mark.** A record's icon carries its Area's identity accent
(D22, §6.2) — that is information, and the reference does not cover record
screens.

### 3.2 The control baseline is the control rung

`base.css` states height, padding, surface, border, corner and the select's
chevron for **every** native control, at the same rung `.dh-btn` uses. Three
modules' local copies of the same six declarations are gone; each had drifted
from it.

The `<select>` chevron is drawn with a gradient pair rather than an SVG, so it
takes `currentColor` and is correct in both appearances and in forced colours by
construction. `appearance: none` changes only how the CLOSED control is painted:
the platform picker, the keyboard behaviour, the assistive-technology semantics
and the no-JS form submit are all untouched — which is what §26 requires ("do
not replace accessible native behaviour without preserving functionality").

One consequence worth recording: a class that sets the `background` SHORTHAND on
a select clears the chevron. `.dh-input`, `.dh-settings-select` and the clause
builder now set `background-color`.

### 3.3 One collection count line

`collectionCountLabel(count, singular, plural, { hasMore, scope })`, in
`~/shared/collection-layout`. The noun is **capitalised**, because these are the
product's own nouns (AGENTS.md §7) and both design documents capitalise them
throughout. A bounded page says "loaded" — the difference between "there are 50"
and "you can see 50 of an unknown number" is not a technical leak, it is the
difference between a count and a claim.

### 3.4 A task row's trailing columns

The fix is structural rather than cosmetic, and each part earned its place by
measurement:

- `.dh-card__support` becomes `display: contents` in a task row. Two nested flex
  boxes meant the track was sized twice and the inner run overflowed to the
  START, printing the P1 mark on top of the status pill at 1280.
- The metadata run is a track of its own width (27.5rem; 18rem in a narrow
  container; content-width on a phone).
- The date is a fixed 6.5rem track rather than a floor, so a longer date stops
  pushing the Project column left.
- **Neither column uses an auto margin.** An auto margin resolves to zero the
  moment a flex line has negative free space, and `justify-content` is ignored
  while one is present — which is why the columns went ragged again at 1024 and
  768 after the first two fixes.
- The **low tier is not drawn on a list row**. D18 puts the sector, the delegate
  and the waiting note in the overflow and on the record; squaring the columns up
  only made the cost visible ("Se… De…"). All three are still in the row's
  "Priority, dates and repeat…" panel, on the record, and the sector is a
  first-class filter.

Measured at 320 / 390 / 430 / 768 / 900 / 1024 / 1280 / 1440 / 1920: **one**
Project x, **one** date right edge, 45px rows, no horizontal overflow.

### 3.5 An absence with nothing to say takes no surface

A Goal with no measurement drew a full-width slab, tinted in its Area's accent,
containing the two words "Not measured" — the largest object on the card, on six
of six seeded Goals. §6 rule 3 forbids exactly that. The wash is kept where the
card carries a definition of done, because those words are the card's content
and content earns a container.

### 3.6 Today's figures tint nothing

D11 says Today's figures are "a row of quiet cards on the canvas" that "tints
nothing"; UIX-01 washed the whole card anyway, so the rule and its
implementation disagreed from the day both were written. Both root references
settle it: a glance card is white, and the colour is entirely in the rounded
icon tile. The consequence was worst where it mattered most — `coral` on
"Overdue" rendered a third of Today's first viewport as a pale red panel, making
a state the product deliberately does not draw as `error` (D3) look like one.

### 3.7 The route error surface

The framework's boundary showed "404" and a technical sentence on a bare canvas
with no way back — the one screen in the product that had never been designed,
breaking AGENTS.md §6 ("no dead ends") and §42. It cannot render the app shell
(it runs for documents where the shell never resolved), so it uses the product's
empty-state anatomy instead.

Fixing it surfaced a real contrast bug: `.page a` / `.dh-pane-body a` repainted
an `<a class="dh-btn">` in the link colour, so a filled button's label was the
same colour as its container — 1:1 contrast, in both appearances, on that
surface's only action.

## 4. Departures added

| # | Departure | Why |
| --- | --- | --- |
| D30 | **A COLLECTION header draws no glyph beside its title; a RECORD header does** (UIX-06) | The badge was decoration — the same glyph the sidebar shows for the same route — and it made three page origins impossible to reconcile, because Today and Analytics have no entity type to badge. A record's mark is not decoration: it carries the Area's identity accent, which is the only place a gallery's grouping is visible without a heading |
| D31 | **A `<select>` is repainted, never replaced** (UIX-06) | Four collection headers shipped the user-agent chevron beside a designed control. The alternative — a bespoke listbox — costs the platform picker on touch, the free keyboard behaviour and the no-JS form submit, for a visual problem `appearance: none` solves outright. The chevron is a gradient pair so it takes `currentColor` and needs no second asset per appearance |
| D32 | **A task row draws its LOW tier nowhere** (UIX-06) | D18 already said so; the row drew it anyway, which is what made its two "aligned trailing columns" impossible to align. A fact that ellipsises to "Se…" has stopped carrying information, and all three are one tap away in the row's own overflow |

## 5. What was deliberately NOT done

- **No Goal create action on the Goals index.** `POST /goals/new` requires an
  Area, so a header create would need an Area picker — a new flow, which §61
  rules out. A Goal is created from its Area, and the empty state says so.
- **No change to the Notes/Meetings/People/Reviews filter ARCHITECTURE.** They
  are ordinary GET forms over native controls, which is a deliberate
  accessibility and no-JS choice (NOTES-03). UIX-06 restyled them and left the
  mechanism alone.
- **No new module, widget, metric or dependency.** No UI framework, no icon
  library, no animation library.
- **The seeded `n-search-e2e` note body contains a literal `\n\n`** — SQLite does
  not interpret escapes in single-quoted strings — so it renders as backslash-n
  in every screenshot of the Notes index. It is a FIXTURE defect, not a product
  one, and changing seed data was out of scope for a UI pass.

## 6. Verification

| Gate | Result |
| --- | --- |
| `pnpm run format:check` | pass |
| `pnpm run lint` | pass |
| `pnpm run typecheck` | pass |
| `pnpm run scheme:check` | pass |
| `pnpm run build` | pass |
| `pnpm run test:unit` | 4720 passed / 369 files |
| `pnpm run test:kernel` | pass |
| `pnpm run test:e2e` | see the PR body for the run |
| `e2e/accessibility.spec.ts` | 122 axe scans, both appearances, every route and overlay — pass |

Measured rather than asserted: the responsive sweep (every route × 320 / 390 /
768 / 1024 / 1280 / 1440 / 1920) reports zero page-level horizontal overflow, and
every element extending past the viewport edge sits inside a control that
scrolls by design.
