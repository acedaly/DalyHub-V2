# DHDS-03…07 — shared pattern and product completion

**Status:** implementation complete; current-branch visual recapture pending a
browser runtime
**Governing direction:** [`DESIGN_DIRECTION.md`](DESIGN_DIRECTION.md)
**Parent package:** [`DHDS_01_WORK_PACKAGE.md`](DHDS_01_WORK_PACKAGE.md), Phase 3
items 3–7 and the Phase 4–6 convergence sweep

## Outcome

DalyHub's remaining high-level patterns now have explicit, test-enforced product
contracts. Contextual depth surfaces share one heading/body/footer grammar;
recognition-led collections use one gallery family; progress and trend framing
reuse shared primitives; record history is one Timeline system; and long-form
authorship remains one Markdown source surface.

This completion pass does not replace working behaviour for the sake of a new
component name. It closes the visible and architectural gaps left after
DHDS-02, records the already-shipped module adoption that satisfies later
phases, removes stale documentation that contradicted the code, and adds a
ratchet against the patterns drifting apart again.

## DHDS-03 — Panel, Drawer and Inspector

### Shared anatomy

Drawer, Inspector and Sheet now compose `PanelHeading` and the `.dh-panel-*`
contract:

1. one visible `h2`, also used as the accessible name;
2. zero or one supporting line, associated through `aria-describedby`;
3. one explicit close control;
4. a single scrollable body; and
5. an optional pinned action region separated by one hairline.

The shared layer owns title hierarchy, wrapping, body containment and footer
separation. It deliberately does not own modality or navigation:

| Surface | Behaviour retained | Responsive presentation |
| --- | --- | --- |
| Drawer | URL-backed, stackable, history-aware, focus trapped | Side panel on desktop; full-height record surface on phone |
| Inspector | URL-backed selection, resizable, page remains interactive | Docked complementary panel; modal sheet on phone |
| Sheet | Transient gesture-launched modal, portalled, topmost-only Escape | Bottom/full sheet on phone; centred dialog on desktop |

This is convergence without a modal mega-component. Focus trapping, background
inerting and scroll locking remain the existing shared machinery.

### Visible refinement

- Drawer, Inspector and the Sheet's icon-only close action use the shared
  `IconButton` and connected icon system rather than private X glyphs. A worded
  Sheet Cancel remains a labelled text button by design.
- The title and supporting line use one type hierarchy across all three hosts.
- The desktop Sheet no longer shows a decorative drag handle. A pointer dialog
  must not advertise an unimplemented drag gesture.
- Task drawer secondary actions remain content-width on desktop. The pinned
  action region stays available for the one mobile commitment that must remain
  above the keyboard.
- Header, body and footer boundaries are one hairline, not nested cards.

### Acceptance

- The surface keeps its canonical history, focus, Escape, inert-background and
  scroll-lock behaviour.
- A close control remains named and keyboard reachable.
- Long titles wrap without displacing close or header actions.
- Body overflow is contained within the surface.
- Pinned actions remain above safe-area and keyboard insets.

## DHDS-04 — Gallery items

DalyHub uses one shared gallery system, not one universal card and not private
module cards.

| Consumer | Shared item | Question answered |
| --- | --- | --- |
| Goals | `EntityCard` in `EntityCardGrid` | What outcome and measure matter? |
| Projects | `ProjectCard` in `EntityCardGrid` | Is delivery moving and what needs attention? |
| Assets | `AssetCard` in `EntityCardGrid` | What obligation, date or risk matters? |

The family shares collection semantics, card boundary, identity resolution,
whole-card destination, contextual overflow, responsive tracks and touch
behaviour. A product specialisation is allowed only when its information anatomy
differs; it stays in `~/shared/card` and is reusable wherever that entity
appears. A module-local copy created to change colour, radius or spacing is not
allowed.

Areas deliberately default to `EntityRow` in `EntityRowList`. They are quiet,
permanent contexts rather than finite work packages, so density and comparison
win in the default daily scan. The optional Grid presentation still uses
`EntityCard` in `EntityCardGrid`; it is a preference, not a second component
system and never introduces progress for an entity that cannot complete.

Honesty rules remain binding: no fabricated percentages, no 0% bar where there
is no denominator, no decorative identity colour masquerading as health, and no
status conveyed without words.

## DHDS-05 — Metric and chart framing

One value has one rendering contract:

- `ProgressTrack` owns linear progress semantics, clamping, accessible value
  text, status colour and reduced motion.
- `ProgressMeter` adds a visible label and summary when the surrounding surface
  does not already state them.
- `ProgressRing` is reserved for genuinely compact proportions.
- `TrendLine`, `TrendBars`, `ComparisonBars` and `Sparkline` own chart framing,
  typed inputs and text equivalents.
- `MetricTile` is an unbounded reading inside a larger surface; `StatCard` is a
  bounded headline figure on the page canvas. Neither is substituted for the
  other.

The Projects table now consumes `ProgressTrack` rather than carrying its own
progressbar markup and fill CSS. Goals and Analytics already consume the same
progress and trend primitives, so gallery, table, record and reporting views no
longer disagree at the lowest visual layer.

## DHDS-06 — Timeline

Area, Asset, Goal, Habit, Meeting, Note, Person, Project and Review record
history all render through the shared `Timeline`, which is the record-scoped
configuration of `ActivityStream`.

The module owns its trusted, workspace-scoped data loader and event descriptors.
The shared system owns:

- ordering, grouping and date headings;
- actor and entity presentation;
- cursor paging, deduplication and bounded virtualisation;
- loading, empty, failure and end states;
- accessible feed/article/time semantics; and
- responsive event layout.

A module may specialise its filter vocabulary or event description. It may not
fork the list, invent another activity store or dump raw payload data into the
interface.

## DHDS-07 — Editor

Notes, Diary, Meetings and Reviews retain one Markdown-source authoring system:
`LiveMarkdownEditor`, with `MarkdownEditorField` as the explicit-form wrapper.

Persistence remains module-owned: Notes can autosave, Diary can explicitly
commit, and Meeting notes can save on blur. Presentation and source semantics do
not fork to accommodate those strategies.

The phone toolbar now measures its actual scroll geometry and exposes a quiet
trailing fade only while commands remain off-screen. The cue disappears at the
end, intercepts no input, does not alter the roving-tabindex model and is removed
in forced-colour mode.

## Phase 4 — core daily-driver modules

The core surfaces already satisfy the reference compositions and now inherit the
completed pattern contracts:

| Module | Shipped composition |
| --- | --- |
| Today | Decision-first Now/Next/Later flow; agenda and habits subordinate; canonical Task rows; maintenance below the decision surface |
| Tasks | Density benchmark; immediate Quick Add; inline date/parent/priority editing; shared grouping and contextual actions |
| Projects | Recognition-led gallery and honest table; delivery health, progress and next action; shared record layout |
| Areas | Quieter identity-led collection and ongoing-domain record composition |
| Goals | Current reading, target, trajectory and status; driving Projects, Habits and Tasks; honest unmeasured states |

The completion pass also removes the duplicate “Back to Tasks” action from the
empty Review Inbox state: the empty-state action remains; the header action is
shown only while it serves an active or failed review flow.

## Phase 5 — remaining modules

The shipped design packages remain the module authority and satisfy the DHDS
sequence:

| Family | Implementation authority |
| --- | --- |
| Plan + Schedule | [`PLAN_01_SMART_01_WEEKLY_PLANNING_2026_08.md`](PLAN_01_SMART_01_WEEKLY_PLANNING_2026_08.md), CAL-01 and DHDS-02 |
| Habits | [`HABITS_01_HABITS_AND_ROUTINES_2026_08.md`](HABITS_01_HABITS_AND_ROUTINES_2026_08.md) |
| Notes | [`UIX_04_NOTES_DIARY_MEETINGS_2026_08.md`](UIX_04_NOTES_DIARY_MEETINGS_2026_08.md) and DHDS-07 |
| Diary + Reviews | UIX-04, the shared Inspector, Timeline and editor contracts |
| Meetings | UIX-04, shared Schedule, Timeline and editor contracts |
| People | [`UIX_05_REMAINING_MODULES_2026_08.md`](UIX_05_REMAINING_MODULES_2026_08.md), shared rows and Timeline |
| Assets | UIX-05 and the shared gallery/record/timeline contracts |
| Analytics | UIX-05 and the shared chart primitives |
| Inbox + Views + Search | [`UIX_06_WHOLE_APP_CONVERGENCE_2026_08.md`](UIX_06_WHOLE_APP_CONVERGENCE_2026_08.md), DHDS-02 and shared collection controls |
| Settings | UIX-05/UIX-06 and the shared settings layout |

## Phase 6 — product sweep

### Code and interaction sweep completed here

- Drawer, Inspector and Sheet chrome converged.
- Duplicate private panel glyphs retired from active hosts.
- Projects table progress converged on `ProgressTrack`; dead table-fill CSS
  removed.
- Editor horizontal continuation cue added and tested.
- Desktop-only false drag affordance removed.
- Review Inbox duplicate action removed without creating an empty-state dead end.
- Structural regression coverage added for DHDS-03…07 adoption.
- Design-system documentation corrected where it still claimed a single generic
  Card despite the shipped shared card family.

### Visual evidence boundary

The repository contains the existing whole-product and module screenshot sets,
but the current branch has not been re-captured: this execution environment has
no browser binary, and the Playwright Chromium download fails through the
environment proxy. The implementation therefore does **not** claim the final
visual-evidence checkpoint until the standard capture/audit commands run in an
environment with Chromium.

Required final commands:

```bash
node scripts/ds-final-audit.mjs
node scripts/ds-final-shot.mjs
```

The audit must cover 320, 390, 820, 1280 and 1440 widths, light and dark, with
Drawer/Inspector/Sheet open states and editor overflow included. Any finding is
fixed before the Phase 6 status changes from evidence-pending to complete.

## Regression boundary

`test/unit/ui/dhds-pattern-convergence.test.ts` prevents source-level drift:

- all contextual panel hosts consume `PanelHeading` and `.dh-panel-*` anatomy;
- Goals, Projects and Assets remain on the shared gallery family;
- Areas default to the shared row family and retain the shared gallery only as
  an explicit alternate presentation;
- Projects, Goals and Analytics consume shared progress/chart primitives;
- nine record families remain on the shared Timeline; and
- Notes, Diary, Meetings and Reviews remain on the shared Markdown editor.

Component tests additionally verify PanelHeading semantics, toolbar overflow
state, Drawer/Inspector/Sheet behaviour and Projects collection behaviour.

## Validation record

The completion branch passes:

- Prettier over the repository;
- ESLint over the repository;
- the DHDS direct-machinery token boundary with zero violations;
- generated M3 scheme and icon drift checks;
- the production client and Worker build;
- 6,205 of 6,208 browser-independent unit tests; the three remaining failures
  are the existing production-backup encryption tests, whose child GPG process
  is blocked by this execution sandbox;
- 2,838 of 2,839 Workers/kernel tests in the full loaded run; the one
  query-bound test exceeded its five-second wall-clock limit under concurrent
  load and passed immediately when rerun alone; and
- discovery/compilation of all 1,851 Playwright cases.

TypeScript's repository command cannot regenerate Cloudflare runtime types in
this environment because Wrangler's runtime-type download is network-blocked.
The production build completes both client and SSR/Worker compilation; CI must
still run the canonical typecheck with its normal generated Workers types.

The remaining Phase 6 evidence gap is runtime-only: Playwright cannot launch
because no browser binary is installed and the browser download is blocked by
the environment proxy. No screenshot or visual-accessibility result is claimed
from a synthetic substitute.
