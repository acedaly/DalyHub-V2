# Record-screen convergence — the anatomy contract (2026-08, PR #131)

> **Status:** implementation record for PR #131. The *canonical* statement of the
> record anatomy lives in [`DESIGN_SYSTEM.md → Shared Record Layout`](DESIGN_SYSTEM.md#shared-record-layout-ds-02);
> this document holds the convergence's reasoning, its measured before/after
> evidence and its **deviation log**.

PR #130 converged the product at *collection* level. Record-detail screens were
the next systemic problem, and the August 2026 UI quality audit had already
recorded one instance of it as [UIQ-011](../product/PRODUCT_DEBT.md).

## What was actually wrong (measured, 2026-08-07, before)

Measured in a real browser at 1280×800 against the RECORD-01 fixtures. "Content
top" is the y-coordinate of the first row of working content; the viewport ends
at 800.

| Record | Header height | Summary height | Content top | Verdict |
| --- | --- | --- | --- | --- |
| Project | 158 | **505** | **860** | Tasks entirely below the fold |
| Goal | 156 | 371 | 724 | One row, barely |
| Area (active) | 156 | 240 | 593 | Tight |
| Area (quiet) | 156 | 240 | 593 | 240px spent saying "nothing here" |
| Note | 126 | 37 | 360 | Editor starts low for a writing surface |
| Meeting | 156 | — | 333 | Content is admin fields, not the meeting |
| Person | 158 | — | 335 | Content is a button launcher |
| Asset | 156 | — | 333 | Overview repeats the header |
| Review | 111 | — | 288 | Title renders at a different size |
| Long title | **215** | 168 | 580 | Title wraps to 4 lines at 1280 |

The Project record — the reference case — states the same fact repeatedly:

- **task counts 3×** — "9 of 24 tasks complete" (meter), "38% — 9 of 24 complete"
  (Progress field), "9 of 24 complete" (Tasks field);
- **health 2×** — header chip, then again inside the roll-up card;
- **Area 2×** — header metadata, then the summary grid;
- **state 2×** — the header status pill, then a "State: Active" field;
- **each of six health signals 2×** — once as a bullet, once as a grid field.

The quiet Area states one absence **four times**: header metadata ("No goals
yet", "No Projects yet"), the roll-up line ("No active tasks yet."), a nested
outlined card ("This Area has no active goals, projects or tasks yet.") and a
bullet inside it ("No active descendants are contributing momentum.") — then a
full icon+headline+description+button empty state below the tabs.

## The contract

One anatomy, in this order, on every record:

```
1  Breadcrumb            where this record lives
2  Identity              icon · title · status · primary action · overflow
3  Context line          1–3 current-state facts, tight under the title
4  Summary               ONLY where it earns its space
5  Tabs                  where am I in this record
6  Working content       the thing the user came for
7  Secondary / admin     later in the panel, or in Settings
```

### Rules

**Headers.** Title dominant, status adjacent, no empty band between title and
tabs. The entity-type label is dropped wherever the breadcrumb already carries
it (Project, Area, Meeting, Person, Goal, Note, Review); a genuinely informative
*subtype* stays (an Asset's "Vehicle"). The entity icon stays everywhere — it
carries #130's identity colour.

**Metadata.** Three tiers, and a fact appears in exactly one of them:

| Tier | Where | Example |
| --- | --- | --- |
| Current state | context line / summary | health, next obligation, progress |
| Secondary context | context line, quiet | Area, Goal, organisation |
| Administrative | **Settings tab** | Created, Updated, State, ids |

Nothing is deleted. Everything demoted from a header lands in Settings under a
**Record details** section.

**Working content.** The **fold anchor**: at 1280×800, with header and tabs
rendered, the first row of working content is visible without scrolling on every
record type. Notes show the editor with at least three lines; Meetings keep
meeting content readable with capture present. Budget: content top ≤ **620px**,
which leaves a real row visible rather than a sliver.

**Surfaces.** The tab panel is one surface. Sections inside it are separated by
spacing and typography, not by a second outline. A nested container is earned
only by a genuine list of entities (task rows, history entries).

**Tabs and filters.** Tabs are the shared `RecordTabs` everywhere — one
typography, one indicator, one focus behaviour. Filters are **visually
subordinate**: smaller, quieter, inside the panel, never sharing the tab strip's
weight. Tab = where am I; filter = which subset.

**Empty states.** Record-level empty states are one calm line plus, at most, one
inline action. The full icon+headline+description+button treatment stays at
collection level.

**Local creation vs global +.** A local create action survives only where context
materially matters *and* it is faster than the global +. Contextual defaults are
implemented only where they amount to passing an existing route param or prop
through the existing capture architecture; anything needing more is skipped and
logged in PRODUCT_DEBT.

## Shared primitives this needs

The smallest set that removes a real repeated problem:

- `RecordHeader` — a `context` slot rendering the tight context line, replacing
  the detached `metadata` chip row.
- `RecordSummaryBar` — a compact progress/state band (meter + facts + signals)
  replacing the per-module roll-up dashboards on Project, Area and Goal.
- `RecordSection` / compact empty-state variant — already partly present as
  `.dh-record-stack` / `.dh-record-section`; extended, not replaced.
- `RecordDetailsList` — the Settings-tab home for demoted administrative
  metadata, so eight modules do not each invent one.

`RecordLayout` itself is **not** rewritten.

---

## Deviation log

Every departure from the contract above, and every contextual default skipped,
recorded as the work happened.

| # | Record | Deviation / decision | Reason |
| --- | --- | --- | --- |
| _(populated during implementation)_ | | | |

---

## Evidence

Before/after pairs are captured by
[`e2e/record-convergence-screenshots.spec.ts`](../../e2e/record-convergence-screenshots.spec.ts)
(opt-in: `CAPTURE_SCREENSHOTS=1 SHOT_STAGE=before|after`) into
[`assets/record-2026-08/`](assets/record-2026-08/), against the fixtures seeded by
[`e2e/seed-record-convergence.sql`](../../e2e/seed-record-convergence.sql).

_(Table completed at the end of the change.)_
