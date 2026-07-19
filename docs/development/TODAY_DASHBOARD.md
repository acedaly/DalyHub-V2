# Today Dashboard (TODAY-01)

The first genuinely useful DalyHub screen: the calm place the owner lands
every morning. It is **not** a reporting dashboard — it is Linear/Things/Craft
calm, focused and minimal, and it is composed **entirely** from the shared
design system (PX-02 frame + DS-01…04/07). There is no new visual language, no
new shared pattern, no new dependency and no migration; TODAY-01 is the first
product *consumer* of the frame the earlier items built.

Governed by [`AGENTS.md`](../../AGENTS.md), the pattern contracts in
[`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md) and the composition/feel contract
in [`PRODUCT_EXPERIENCE.md`](../design/PRODUCT_EXPERIENCE.md).

## Where it lives

```text
app/modules/today/
  module.ts            — the module manifest (id "today", order 5, one route,
                         no entity type — Today is a view, not an entity)
  routes.manifest.ts   — the declarative /today route (navLabel "Today", navOrder 5)
  routes/index.tsx      — the route: loader (formats the date) + DrawerProvider
  TodayDashboard.tsx   — the pure composition of the six sections
  TodayDrawer.tsx      — maps a drawer key → a read-only DS-02 Record Layout
  fixtures.ts          — ALL demo data, behind one clearly-labelled seam
app/styles/today.css    — layout/rhythm only, every value a DS-01 token
```

## Composition

The surface is a pure function of typed data. The route's loader formats the
current date and reads the in-memory fixtures; `TodayDashboard` receives them as
props and owns only optimistic, in-memory UI state (which focus tasks are ticked,
the quick-capture draft).

- **Frame.** The PX-02 [`CollectionLayout`](../../app/shared/collection-layout)
  owns the sticky **Pane Header** (title `Today`, subtitle = the date, one accent
  primary action **Quick capture**) and the pane's scroll + state precedence.
- **Date.** The subtitle is the owner's *calendar* date, formatted in the owner's
  timezone (`Australia/Sydney`, `en-AU`) by [`date.ts`](../../app/modules/today/date.ts)
  — not the UTC Worker runtime, which would show the previous day during the
  Australian morning. This becomes a user/workspace timezone setting at SET-01.
- **Never blank.** This is a multi-section surface, not a single filtered
  collection, so it does **not** gate itself behind the CollectionLayout empty
  slot (that would unmount Quick Capture when every data section is empty and
  strand a first-time owner). Each section renders its own gentle empty note, so
  nothing is ever blank, and Quick Capture is always mounted and usable.
- **Sections.** Six vertical `section`s, each a labelled region with a quiet
  `xs`-muted section label:

  | # | Section | Shared parts | Notes |
  |---|---|---|---|
  | 1 | Today's focus | DS-04 Card (list, compact) | optimistic complete/reopen quick action |
  | 2 | Upcoming | DS-04 Card (list) | meetings/reminders/deadlines, sorted by `sortKey` |
  | 3 | Continue working | DS-04 Card (grid) | area badge · status badge · rolled-up progress |
  | 4 | Recent notes | DS-04 Card (list) | title · snippet (subtitle) · last-edited (date) |
  | 5 | Daily timeline | token-only list | a simple day schedule (see below) |
  | 6 | Quick capture | native field + button | structure only — nothing is saved |

- **Records open in place.** Every card provides both a shareable drawer deep
  link (`href`) and an in-app open (`onOpen`), so activating a card opens the
  **DS-03 Drawer** hosting a read-only **DS-02 Record Layout** — the canonical
  `Card → drawer key → renderDrawer → RecordLayout` chain. The Card never owns
  drawer state; `TodayDrawer.ts` maps `<kind>:<id>` keys to fixtures and returns
  `null` for an unknown/stale key (the Drawer's graceful not-found panel).

## Deliberately NOT built (fixture-only)

TODAY-01 builds **only component structure over fixtures**: no repositories, D1,
Workers, APIs, AI/OpenAI, persistence, authentication change, search, command
palette, diary, task, meeting or reminder implementation.

- **Quick capture** is not connected. Submitting a non-empty draft **keeps** the
  text (nothing is stored, so clearing would silently discard it) and a polite
  live region states plainly *"Quick Capture is not connected yet. Your draft has
  not been saved."* — it never claims the content was captured, saved or stored.
  Editing the field clears that notice. The header's Quick capture action focuses
  and scrolls to the field. It does not persist, parse or call AI.
- **Complete/reopen** is optimistic, in-memory only.
- The **Daily timeline** is the day's fixture schedule rendered as a simple
  chronological list. The shared Activity **Timeline** (rendering the FND-05
  Activity model) is [DS-05](../roadmap/ROADMAP_V2.md#-ds-05--shared-timeline--activity-feed);
  this section is not it and does not invent an event source.

## Built for replacement

All demo data lives in [`fixtures.ts`](../../app/modules/today/fixtures.ts) with
typed shapes and stable ids. When Tasks, Notes, Meetings and the Diary connect,
only the data source (the loader and the fixtures) is swapped for
workspace-scoped repository reads — the `TodayDashboard` composition does not
change.

## Two disclosed deviations

1. **Execution list.** The reorderable/inline-completable *task execution list*
   in TODAY-01's original "Execution Workspace" outcome is folded into the later
   TODAY items (TODAY-04 Planning / TODAY-05 Keyboard). TODAY-01 ships the calm
   morning dashboard the brief specifies and demonstrates completion optimistically
   on focus tasks.
2. **Commands/search.** Command and search-provider registration
   (PRODUCT_EXPERIENCE Part IV §6) is deferred: a Quick Capture command has no
   honest `run` handler while `ModuleRuntimeContext` exposes no persistence or
   navigation seam, and TODAY-01 is fixture-only. It is registered with the surface
   that first gives it a real action (TODAY-05 / DS-08/DS-09), not stubbed here.

## Tests

- **Component** — [`test/unit/today/TodayDashboard.test.tsx`](../../test/unit/today/TodayDashboard.test.tsx):
  the six sections, chronological ordering, optimistic completion, inert-but-structured
  capture, and a card opening the Drawer.
- **Navigation** — [`test/unit/modules/today-navigation.test.ts`](../../test/unit/modules/today-navigation.test.ts):
  the manifest → registry → navigation flow (Today first, generic glyph).
- **End-to-end** — [`e2e/today.spec.ts`](../../e2e/today.spec.ts): sidebar
  reachability, sections, completion, capture, drawer, and no horizontal overflow
  at desktop and 320px.
