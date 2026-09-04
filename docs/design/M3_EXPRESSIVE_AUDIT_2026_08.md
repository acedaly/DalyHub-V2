# M3 Expressive audit — 2026-08

> Phase A of the Material 3 Expressive pass. What the product looked like before
> the work, read off a captured evidence set rather than off memory.
>
> **Evidence:** `docs/design/assets/m3x-2026-08/` (the folder was not
> committed; the findings below record what each capture showed), captured by
> [`e2e/expressive-screenshots.spec.ts`](../../e2e/expressive-screenshots.spec.ts)
> at 1280, 1440 and 390 in **both** appearances against the seeded development
> database. The `before-*` files are the state this audit describes; the
> unprefixed files are the state after the work.
>
> ```sh
> CAPTURE_SCREENSHOTS=1 SHOT_PREFIX=before pnpm exec playwright test e2e/expressive-screenshots.spec.ts
> ```

The starting point is not a broken product. DalyHub already has a generated M3
scheme, a token layer nothing hard-codes around, one application frame, one card
family, phone bottom navigation, one Quick Capture, one Sheet, a Visual Viewport
observer and safe-area handling. **None of that is the problem, and none of it
was rebuilt.** What the evidence shows is a product that is *correct* and
*uniform* — and uniform in a way that removes hierarchy rather than creating it.

---

## 1. The one-sentence diagnosis

Every surface is the same surface. A card, a panel, a row and a summary are all a
20px-padded, 16px-radius, hairlined white box at the same size, so the eye has
nothing to land on and the page never says *what matters here*.

---

## 2. Hierarchy problems

| # | Where | What the screenshot shows |
|---|---|---|
| H1 | Today, 1280 | The left column holds ONE panel roughly 280px tall; below it is ~380px of empty canvas. The rail is taller than the column it supports. The page's most important region is its emptiest. |
| H2 | Today, all widths | There is no dominant surface. The greeting is the biggest thing on the page, and a greeting is the least actionable thing on it. |
| H3 | Today, 1280/390 | The day's state — how many tasks, how many overdue, how far through — is carried by one small `error` chip and (only once something is done) a 16rem progress bar tucked beside the greeting. On a fresh morning the screen states no summary at all. |
| H4 | Tasks, 1280 | A row is ~100px tall and carries eight competing elements at near-equal weight: glyph, title, P1 chip, overdue chip, due date, scheduled date, project chip, "Sector: …", plus a status chip floated right. The title is the only thing being scanned for and it is not the loudest thing in the row. |
| H5 | Projects/Areas/Goals, 1280 | `align-items: start` on the gallery grid leaves cards ragged: in one Projects row the three cards are 220px, 180px and 230px tall, so the grid reads as debris rather than as a gallery. |
| H6 | Projects, 1280 | Three metadata lines per card ("1 open task · 0 done", "No progress since 1 Jan 2020", "Updated 1 Jan 2020") at one weight. The progress bar — the only thing that answers "how is this going?" — is the quietest element on the card. |
| H7 | Goals, 1280 | No progress, no measurement, no summary. Every card is a title, a chip and a sentence explaining what is *absent*. An `Open` button repeats the whole-card link in the header, competing with the title. |
| H8 | Notes, 1440 | Five stacked native `<select>`s in a full-bleed band ~150px tall above a 200px list, and ~500px of empty canvas below. The widest module in the product is the one using its width worst. |

## 3. Card and border proliferation

- **Every** gallery card, dashboard card and panel draws `1px solid
  outline-hairline` *and* `elevation-1` *and* `corner-large` *and* `20px`
  padding. Three separation mechanisms are spent where one would do, so nothing
  is left to escalate with when a surface genuinely is more important.
- Today's own stylesheet already forbids nesting ("no card inside a panel") and
  is the one screen that gets this right — but its panels then look identical to
  the entity cards on every other screen, so the discipline buys no legibility.
- `--app-card-padding` is `20px` everywhere: a summary hero, a project card and a
  three-line supporting card are padded identically.

## 4. Colour

- **Overdue is the only colour on Today, and it is a slab.** Three overdue rows
  sit on a filled `error-container` block. In dark this is `#900037` — a
  saturated blood red covering a third of the first viewport (`before-today-1280-dark.png`).
  This is the "aggressively red everywhere" failure the brief names, and it also
  breaks the product's own calm mandate.
- Outside that slab, Today spends no colour at all. The result is a page that is
  either shouting or grey.
- The seed is `#2563EB` — a confident blue. The approved direction is a restrained
  violet/lilac identity. Nothing in the product hard-codes the seed, so this is a
  one-line change through the generator; it is a **token gap in intent**, not in
  architecture.

## 5. Typography

- Today's greeting is `headline-large` (32px). Collection titles are
  `headline-small` (24px). Neither is wrong on its own, but the *most* expressive
  type in the product is spent on the least actionable string on the page.
- There is no type style for a hero metric. `ProgressRing`'s centre, a card
  metric value and a summary figure each pick their own size at the call site.
- Metadata, supporting text and status text all resolve to `body-small` /
  `on-surface-variant`, so a task's project and a task's "Sector: No sector"
  placeholder are drawn identically.

## 6. Mobile

Bottom navigation, Quick Capture, the Sheet, keyboard inset and safe areas all
already work and are not re-litigated here. What the phone evidence shows:

| # | What |
|---|---|
| M1 | Today's first viewport at 390 spends its top third on greeting + date + one chip, and shows two-and-a-half overdue rows. The one question a phone glance asks — *how is today going?* — is not answered above the fold. |
| M2 | The overdue slab is proportionally worse at 390: it is the entire visible content area. |
| M3 | Task and entity rows keep desktop metadata density on a 358px content width, so supporting runs wrap into three lines. |
| M4 | Notes' desktop filter band collapses to five stacked full-width selects — roughly a full viewport of chrome before the first note. |

## 7. Duplicated / thin primitives

| Concept | Today | Should be |
|---|---|---|
| "A big number with a label under it" | `MetricTile`, `.dh-ecard__metric`, `.dh-metric`, Areas' own count block, Today's progress label | one metric primitive |
| A progress figure | `ProgressTrack`, `ProgressMeter`, `.dh-ecard__progress-*` (a third hand-rolled bar), `ProgressRing` | the two shared components; no third bar |
| A page's summary band | Today's header, Goals' "no recent action" sentence, Reviews' insight header | one expressive summary surface |
| Entity identity mark | `EntityIcon`, `AccentIcon`, `.dh-ecard__icon`, Today's `.dh-day-row__avatar` (a bespoke initial circle) | the shared identity mark |

## 8. Token gaps

Nothing here is a missing *architecture* — the families are right. What is
missing is semantic naming for the expressive layer:

1. No shape hierarchy. `corner-large` is used for cards, panels, heroes and the
   FAB alike, so shape carries no information.
2. No expressive surface roles — "the hero on this page" has no token, so a hero
   is built by hand each time.
3. No hero/metric typography tokens (see §5).
4. No compact card padding distinct from standard, and no hero padding above it.
5. `--app-entity-card-min-width` is `16.5rem`, which yields three columns at
   1280 rather than the 3–4 the brief asks for at ordinary laptop widths — and,
   with ragged heights, three columns of different sizes.

## 9. What this pass must NOT change

Recorded here so the implementation stays inside its brief: routes, modules,
information architecture, the data model, CRUD and inline editing, the generated
token architecture and its `scheme:check` gate, the Cloudflare shape, the
existing shared primitives, the accessibility contract and the test expectations.
The visual work is a layer *on* the M3 foundation, never a second design language
beside it.
