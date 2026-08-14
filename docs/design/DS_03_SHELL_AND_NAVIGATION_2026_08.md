# DS-03 — Shell & Navigation

> **What this stage delivers:** the DalyHub application FRAME — the rail, the top
> bar, the page frame and the responsive chrome — rebuilt out of the DS-02
> primitive layer rather than beside it. It is the first stage where opening
> DalyHub looks like a different product before a single screen is read.
>
> **The one-sentence visual outcome:** the navigation rail became a near-black
> column in *both* appearances with the current destination as a violet block,
> the top bar came down to 56px and put search at its leading edge, and the page
> title, the search field and the first row of content now start on one vertical
> line at every width.
>
> Foundation: [DS-01](DS_01_DESIGN_SYSTEM_FOUNDATION_2026_08.md) ·
> [DS-02](DS_02_CORE_UI_PRIMITIVES_2026_08.md) ·
> [ADR-092](../decisions/ARCHITECTURE_DECISIONS.md#adr-092-the-dalyhub-design-system-becomes-the-governing-design-language--a-product-owned-semantic-layer-an-explicit-density-model-and-md3-demoted-to-machinery) ·
> [ADR-093](../decisions/ARCHITECTURE_DECISIONS.md#adr-093-the-dalyhub-generic-primitive-layer--a-real-button-a-compact-application-and-three-migration-bridges).
> Decision: [ADR-094](../decisions/ARCHITECTURE_DECISIONS.md#adr-094-the-dark-navigation-rail--a-region-that-does-not-follow-the-appearance-a-responsive-tablet-collapse-and-one-origin-for-the-frame).
> Screenshots: [`assets/ds-03/`](assets/ds-03/README.md).

---

## 1. The one idea, and what follows from it

**The rail is dark, in the light appearance as well as the dark one.**

Both concept references draw DalyHub as a near-black navigation column beside a
bright working canvas. DS-02 §9 named it explicitly — "the concept's most
conspicuous unimplemented idea" — and handed it here. It is the single change
that most separates DalyHub from an MD3 application, because it is visible before
any content is.

Everything else in this stage is either what a dark rail *requires* or what it
*pays for*:

| It requires | Because |
|---|---|
| Its own foreground pair | `on-surface` is near-black in light. A rail borrowing it ships invisible labels |
| Its own selected treatment | A pale `secondary-container` mixed into near-black is a grey smudge, not a selection |
| Its own **accent source per appearance** | M3 builds `primary` as a pale tone-80 in dark so it works as *text*. Mixed into near-black it lightens rather than saturates — measured, and it produced a lavender pill |
| Its own focus colour | `primary` over the rail measures **2.40–2.42:1** in all five schemes. That is a WCAG 1.4.11 failure on the most-traversed keyboard region in the product |
| Its own forced-colours rules | The rail's selectors are two-class and outrank the existing one-class forced-colours block |

| It pays for | How |
|---|---|
| A quieter top bar | Once the rail carries that much weight, the bar has to get smaller, not louder: 68px → 56 |
| Search at the leading edge | The account moved into the rail, so the trailing cluster went from five controls to three and the bar stopped being weighted to one end |

---

## 2. The rail

### 2.1 The colour, and where it comes from

Four new slots in `scripts/generate-m3-scheme.mjs`, so all five schemes and both
appearances get them from one edit:

| Slot | Light | Dark |
|---|---|---|
| `surface-rail` | tone **14** | tone **8** |
| `on-rail` | 97 | 94 |
| `on-rail-muted` | 74 | 70 |
| `rail-hairline` | 30 | 22 |

Light inverts; dark goes *below* the canvas (the page is 10) so the shell reads
as a deep frame around a lighter working surface. Electric already did exactly
that in dark and documented why; DS-03 makes it the rail's behaviour in both.

It is a **separate family** from `surface-navigation` rather than a re-toning of
it, and the distinction is real: `surface-navigation` is what a navigation object
paints when it sits *on* the page — the phone bar, the modal navigation sheet —
and those must stay bright in the light appearance, because they are drawn over a
bright page a thumb is holding. The rail is not on the page; it is the frame the
page sits inside. Keeping them apart also meant no existing surface-ladder or
contrast assertion had to move.

### 2.2 `rail-accent` — the one thing that could not be a single role

The current destination is `rail-accent` mixed toward the rail at
`--app-tint-strength-rail-selected` (62% light, 80% dark).

`rail-accent` is **`primary` in light and `primary-container` in dark**, emitted
per appearance by the generator. This is not a preference; it is M3's own
construction. `primary` is a saturated mid-tone violet in light and a pale
tone-80 violet in dark, because in dark it has to be legible *as text* on a dark
surface — so mixing it into a near-black rail produces a pale lavender pill.
`primary-container` is the mirror image: a pale lilac in light and a saturated
tone-30 violet in dark, because a container is a surface rather than a
foreground. Each appearance takes the role that is the saturated violet *in that
appearance*, and the one `color-mix` in `tokens.css` is then correct in both
without an appearance rule anywhere outside the generator — which is what
`appearance-cascade.test.ts` requires.

**This was found by looking.** The first build shipped `primary` for both, and
checkpoint B's dark capture showed a light pill on a dark rail.

### 2.3 A destination

| | Before | After |
|---|---|---|
| Painted row | 44px | **36px** on a cursor, 45 on a finger |
| Corner | `--app-shape-supporting` | `--dh-radius-control` — the same rung as every button and field |
| Resting colour | `on-surface-variant` | `--dh-color-rail-text-muted` |
| Selected | soft `secondary-container` tint | a violet **block** |
| Selected glyph | `primary` | the row's own full text colour |

VIS-01 set the row at 44px on the argument that "a painted row should not be
larger than the target it serves". That is a rule about a *touch* target, and the
rail is the one navigation surface a finger never touches — it is hidden below
`md`, and the phone bar (D15) is what a thumb gets. On a fine pointer 44px is a
size chosen for a constraint that is not present. Fourteen destinations came from
616px of column to 504, which is what lets the whole rail and its account block
fit a 900px laptop viewport with the group rhythm intact.

`--app-nav-row-height` is floored back to `--app-touch-target-min` under
`(pointer: coarse)`, unconditionally and last in `tokens.css`, beside the density
floor it belongs with — so the tablet rail and the phone's navigation sheet keep
a full target.

The selected glyph no longer takes `primary`, and that is the one signal that had
to change rather than move: a violet glyph on a violet block is the least legible
thing on the rail. It steps up to the full text colour with the label, which is
the same "step up" said in the way this surface can say it. Selection is still
never colour alone — `aria-current`, the block's shape, the weight step and the
foreground step are four signals, and the block is restored as the system
`Highlight` under forced colours.

### 2.4 Identity at both ends

The rail opens with the product mark and closes with the owner's account, which
is the anatomy both references draw.

The account menu was in the top bar between VIS-01 and DS-03. That was right
while the rail *also* carried two 56px search pills, and wrong afterwards. The
distinction is what each thing **is**: Search is an ACTION — it opens a surface,
it has a shortcut, it belongs with the other actions at the top of the working
area. The account is an IDENTITY, and identity belongs with the other identity in
the frame. A rail that opens with "DalyHub" and closes with "you" is a frame; a
rail that opens with "DalyHub" and ends in whitespace is a menu.

It is the same `UserMenu`, in the same `above` placement it was built for. The
rail and the sheet differ only in the width around it, so the difference is CSS
rather than a prop the menu branches on.

**One accessible-name change came with it.** The trigger's visible text on the
rail is the owner's display name and nothing else, so it was being announced as
"Owner, button" — who, but not what, in a landmark otherwise full of
destinations. It now carries `aria-label="Account — <name>"` in *both* variants
(it was previously a visually-hidden span in the compact one only). The name
still contains the visible text, which is what WCAG 2.5.3 requires so a
voice-control user can say what they can see.

**One hairline, and only one.** Everything else in the column is separated by
space, because a rule per group is structure the owner has to parse on a region
that should be scanned. The account rule earns itself: the account is a different
*kind* of thing from the destinations above it, and the boundary is what says so
when the rail is collapsed to glyphs and the rhythm is all that is left.

### 2.5 The rail does not scroll; its destination list does

Found in review on PR #176, and it is a correctness rule before it is a layout
one. `overflow-y: auto` makes an element a scroll container and therefore a
**clipping ancestor** for everything absolutely positioned inside it. That was
harmless while the rail held only links. Moving the account menu in gave it a
15rem panel to clip: **measured at 240px cut to 216 on a desktop, and to 68 on a
tablet**, where Settings and Sign out were sliced to single letters.

The fix is not a portal. It is that the rail was scrolling the wrong thing — the
brand and the account are fixed furniture at the two ends of the column, and only
the destinations between them can ever be too long. Scrolling the list is both
the smaller change and the better rail: the account no longer scrolls out of view
on a short viewport, which is the whole reason it is at the bottom.

With the rail `overflow: visible` the panel escapes to the content pane as it is
drawn to, and the rail takes `--app-z-sticky` so that is deterministic rather
than a consequence of DOM order — above the page, still below the top bar, which
the upward-opening panel never reaches. Both halves are asserted, because either
alone is a broken rail: a non-scrolling list pushes the account off a short
viewport, and a scrolling rail clips the panel again.

**And two variants came off `UserMenu` with the move.** `compact` (avatar and
chevron only) and `placement="below"` existed for the top app bar. With the
account in the rail, both places the menu renders are the bottom of a column, so
neither option had a caller left — and an option nothing selects is a branch
nobody tests. The collapsed rail is the case that *looks* like it wants
`compact`, and it is handled where it belongs: in the media query that collapses
everything else in the column, so the component does not have to know how wide it
currently is. Three CSS modifiers (`--above`, `--below`, `--compact`) went with
them.

What `compact` **did** legitimately carry was the tooltip, and removing it took
that too — a second PR #176 finding. On the collapsed rail the trigger is two
initials, so a sighted pointer or keyboard user got no explanation that they open
the account menu, while all fourteen destinations beside it had one. The tooltip
is back, gated on the same `useCollapsedRail()` the destinations use, so the two
cannot disagree about when a label is readable. The `aria-label` is unchanged and
remains the NAME; the tooltip is the DESCRIPTION.

---

## 3. The tablet, and the collapse that is not a preference

Between `md` (768) and `lg` (1024) the rail collapses to a **68px glyph column**.

Before this the shell's only breakpoint was "is this a phone", so a 900px window
got a 216px labelled rail — 24% of the screen spent on navigation, on the class
of device with the least width to spare, not as a decision but as the absence of
one. The collapse gives 148px back to the page with every destination still
visible, still one tap away and still marked when current.

**It is a media query, and deliberately not a user preference.** A toggle needs
somewhere to persist the choice, a server read to avoid a flash of the wrong
width on first paint, and an action to write it — shell customisation the DS-03
brief rules out (§9, §36) and which DS-07 owns if it is ever wanted. A width rule
is correct on the first byte, costs no state, and cannot disagree with itself
between the server and the browser. `shell-anatomy.test.ts` asserts that no shell
component persists one, so adding it later is a deliberate act rather than a
quiet `useState`.

**The labels do not go away.** They are hidden with the visually-hidden treatment
rather than `display: none`, so every destination keeps its accessible name at
every width — the "ambiguous unlabeled icons" failure the brief names outright.
`PrimaryNavigation` adds the shared tooltip as the *description* on top of that,
so a pointer and a sighted keyboard user get the name back too.

The component mirrors the media query in **one** exported constant
(`COLLAPSED_RAIL_QUERY`), asserted identical to the stylesheet's, because a rail
that collapses at 1024 while its tooltips appear below 900 is a rail with
fourteen unnamed glyphs across a 124px band and nothing would fail.

---

## 4. The top bar

| | Before | After |
|---|---|---|
| Height | 68px | **56px** |
| Search | trailing cluster, `corner-full`, 44px | **leading edge**, control corner + hairline, `--dh-control-height` |
| Create | hand-rolled violet stadium | `<Button variant="primary">` |
| Utilities | hand-rolled 44px circles | `IconButton` (+ the Help anchor, which stays a link) |
| Account | here | the rail |

68px was sized around a 52px search bar, and the search control has not been
52px since VIS-01 made it a capsule — so the bar was carrying 24px of air around
a control that no longer needed it, on every route.

Search moved to the leading edge because that is where both references draw it
and where the page's own content starts. It aligns to the page gutter, so the
search field, the page title beneath it and the first card below that all start
on one vertical line.

Three things changed with the move: the corner is `--dh-radius-control` rather
than `corner-full` (D33 — at the leading edge, beside a page title and above a
card, a stadium was the one rounded object on the screen); it takes a hairline
(in a cluster of transparent glyphs the sunken fill was enough to read as a
container; with 700px of empty bar beside it, a fill with no edge reads as a
smudge); and its height comes from density rather than a stated 44.

It is still a **button** that opens the DS-08 Search surface, not an input, with
the same accessible name, the same `role="search"` region and the same `/`
shortcut. It still collapses to a labelled glyph below `lg`.

---

## 5. The page frame, and the defect the wide capture found

A page's origin is now **rail → gutter → everything**, at every width.

`.dh-pane-header` carried `margin-inline: auto`. That is a no-op at every width
below the content measure and a visible divergence above it: measured at 1920,
the page title started at x=347 while the list it titles started at x=256 — and
the search field DS-03 had just moved to the leading edge started at 256 with the
list. `collection-layout.css` had already written the correct argument for its
own content ("aligned to the START rather than centred: the rail is on the left,
so a centred column would drift away from it as the viewport grows and leave the
navigation pointing at nothing"); the header was the one piece not obeying it.

The band is also tighter: `24/16` → `20/12` above and below the title, and the
title itself now consumes `--dh-text-page-title-*` rather than naming a
typescale rung. That is both a §25 compliance change and a real one — the value
that name resolves to is 24px, where the rule said 28.

The size had already moved twice (DS-14 set 24, UIX-06 set 28), each time
arguing about a *number*, which is how a design value ends up living in a
stylesheet. It is now asked once, in the token layer, for every page title in the
product.

---

## 6. Mobile

**The bottom navigation is structurally unchanged, and that is the finding.**
`Today · Tasks · Capture · Diary · More` already met every requirement the brief
lists for a bottom bar: registry-derived rather than a second hand-kept list,
permanently visible text labels, `aria-current` plus shape plus weight, a
distinct landmark, 44px targets at 320px, safe-area clearance, keyboard-inset
hiding, and More opening the *complete* navigation so nothing is unreachable.
Redesigning it would have been change for its own sake.

What changed on the phone:

- **The top bar is 52px**, down from M3's 64. It holds one line of title and one
  44px target; 64 was 20px of padding on the most valuable row of the display.
  The safe-area inset is added *on top of* the height, so a notched device still
  clears its cutout and an un-notched one is genuinely 52px.
- **The title takes the record-title role** rather than `title-large`. A phone
  bar's title and a record's own title are the same size of statement.
- **The bottom bar takes the app-bar surface**, so both ends of the phone frame
  are one colour.
- **The navigation sheet's two 56px stadiums are gone.** DS-02 §8 listed them as
  debt #3 and handed them here; they were the loudest piece of the old design
  language left in the product, on the one screen a phone user opens to
  navigate. They are now the same object as the desktop search field.

---

## 7. Accessibility

| Guarantee | How it holds |
|---|---|
| **Rail contrast** | `on-rail` and `on-rail-muted` both clear 4.5:1 over the rail, and the selected block clears 4.5:1 for its label — asserted per scheme, per appearance, in `contrast.test.ts` |
| **Focus is visible on the rail** | **A real defect the tests found.** `primary` measures 2.40–2.42:1 over the rail in every scheme. `--dh-color-rail-focus` replaces it region-wide (~14:1 over the rail, ~10:1 over the selected block), asserted over both |
| **Collapsed rows keep their names** | The label is visually hidden, never `display: none`; the tooltip is the description. Asserted through `getByRole(…, { name })`, which reads the accessibility tree |
| **The collapsed ACCOUNT trigger too** | Same rule, same hook (`useCollapsedRail`). It was missed on the first pass and found in review — the trigger collapses to two initials with no explanation for a pointer or a sighted keyboard user |
| **The account panel is reachable** | The rail is no longer a clipping ancestor (§2.5). It was cut to 68px on a tablet, taking Settings and Sign out with it |
| **Selection is never colour alone** | `aria-current` + a shape + a weight step + a foreground step, and the system `Highlight` under forced colours |
| **Forced colours** | The rail's own selectors are named in the forced-colours block, because they outrank the short forms. Asserted |
| **Touch targets** | `--app-nav-row-height` floors to `--app-touch-target-min` under `(pointer: coarse)`, unconditionally and last in the file |
| **Landmarks** | Still exactly one `banner` per viewport. The account block moved *inside* the `navigation` landmark, so nothing lost containment |
| **Accessible names** | The account trigger names what it is as well as who, in both variants; every top-bar control has a name (`IconButton` requires it by type) |
| **Keyboard order** | Search is now the first control in the banner — the most-used of the four, reached first |
| **Escape / focus return** | Untouched. The navigation sheet keeps the Drawer's focus trap, inertness, scroll lock and focus restoration |
| **Safe areas** | Published as `--dh-safe-*`; `shell.css` names no raw `env(safe-area-inset-*)` at all, asserted |

---

## 8. Tokens added

Six colour names, seven shell measurements, four safe-area names — all published
in `app/shared/tokens/dalyhub.ts` and defined only in `tokens.css`, per ADR-092.

```
--dh-color-rail              --dh-shell-rail-width            --dh-safe-top
--dh-color-rail-text         --dh-shell-rail-width-collapsed  --dh-safe-right
--dh-color-rail-text-muted   --dh-shell-bar-height            --dh-safe-bottom
--dh-color-rail-border       --dh-shell-mobile-bar-height     --dh-safe-left
--dh-color-rail-selected     --dh-shell-nav-row-height
--dh-color-rail-focus        --dh-shell-gutter
                             --dh-shell-content-max-width
```

The shell measurements are deliberately **not** density tokens: a density token
is a preference, and three presets define all eight of them; a shell measurement
is a product decision about the one frame the application has. The rail's row
height is the exception that proves it — it resolves to the compact control
height, so the frame measures a destination with the same ruler as the toolbar
beside it.

**No token was removed.** `--md-app-color-surface-navigation` and
`--md-app-color-surface-nav-selected` still have consumers (the phone bar, the
navigation sheet) and are untouched, which is why no existing contrast or ladder
assertion moved.

---

## 9. Validation

| Check | Result |
|---|---|
| `pnpm run typecheck` | pass |
| `pnpm run lint` | pass |
| `pnpm run format:check` | pass |
| `pnpm run scheme:check` | pass — the generated blocks are the generator's own output |
| `pnpm run test:unit` | pass — including 40 new rail contrast assertions and 27 new shell tests |
| `pnpm run test:kernel` | pass |
| `pnpm run build` | pass |
| `e2e/accessibility.spec.ts` | **122 passed** — the axe sweep over every desktop route, against the new frame |
| `e2e/mobile-shell.spec.ts` · `e2e/px-03-navigation.spec.ts` | **43 passed** — including axe-clean in both appearances, no horizontal overflow at 320px, 200% zoom, and every sidebar destination resolving |
| Browser | Tasks / Today / Projects at 1920, 1440, 1366, 900 and 390, in both appearances, plus the navigation sheet |

The three E2E specs above were chosen because they are the ones a shell change
can break: the accessibility sweep (landmarks, names, contrast, focus), the phone
shell (safe areas, the bottom bar, zoom, reflow) and navigation itself (every
destination resolving, the active state, keyboard reachability, the sheet).

The remaining shards were **not** re-run in full, and repository guidance is not
to run expensive shards without a change that justifies them. No route, no data
flow and no interaction contract changed here: search, the command palette,
capture, the shortcuts, auth, Settings and every mobile route behaviour go
through the same callbacks and the same components they did. The two behaviours
that *did* move — the account menu's location and the top bar's control set — are
covered by the new unit tests and were driven by hand in the browser.

**Three regressions CI caught, and what they were.** Recorded because each was a
real defect in a guarantee that predates DS-03, and because two of them are the
same shape: *composing a primitive silently dropped something the hand-rolled
version was carrying.*

1. **The global create control lost its 44px target.** UIX-01's rule stated 44px
   with the note "so it clears WCAG 2.2 (2.5.8)"; composing `Button` handed the
   height to density, which is right for every ordinary button and gives this one
   36px on a fine pointer. Measured at 36 against a required 44. The floor is
   restored — as `--app-touch-target-min`, the same floor density applies under a
   coarse pointer — and asserted, because this is the one control the suite
   checks a target on at every route.
2. **The command-palette utility became unreachable to one test's probe.**
   `keyboard.spec.ts` looked for the control by `textContent`, and `IconButton`
   carries its name as a required `aria-label` instead of a visually-hidden span.
   The control is reachable and correctly named; the PROBE was wrong, and as
   written it would have forbidden `IconButton` anywhere in the shell. It now
   reads the accessible name, which is what "reachable" has to mean for a control
   with no visible text.
3. **`tasks-collection.spec.ts:471` failed once and does not reproduce.** Its
   partition ran 17.3 minutes against a 15.5-minute budget, as did two others on
   the same run; it passes locally against this build.

**The base branch is red, and was before this change.** `main` CI has failed on
every push since 2026-08-13, including commit `4ceced0` — DS-03's own parent.
On that commit, E2E partitions p02, p03, p05, p07 and p08 already failed. DS-03
is responsible for the delta only, which was p01, p04 and p06, all three
addressed above. The pre-existing failures include `pwa-budget.spec.ts`, whose
precache ceiling is exceeded on the base branch by the same measurement it
reports on this PR: **1,241,668 bytes against a 1,200,000 ceiling**, of which
DS-03 adds 116.

**One flake observed and not reproduced.** `test/kernel/calendar-security.test.ts`
→ "does not throw when the workspace cannot be resolved" failed once in a full
`test:kernel` run and passed in isolation, in a re-run of the full suite, and on
the unmodified baseline. It is a scheduled-refresh timing test in a subsystem
DS-03 does not touch. Recorded rather than ignored.

---

## 10. What DS-03 deliberately did not do

Recorded so none is mistaken for an oversight.

- **Count badges on the rail.** The references show them (`Inbox 12`,
  `Tasks 8`). DalyHub's navigation model is derived from route manifests and
  carries no counts; inventing them is a kernel query per destination on every
  route, which is business logic in the frame.
- **A notification bell.** There is no notification system. A bell that never
  rings is a decorative control, and this is the clearest place the product's
  truth has to win over the picture.
- **A user-toggleable sidebar collapse.** §3 above.
- **Module internals.** Tasks, Today, Projects, Areas, Goals, Notes, Calendar and
  Analytics are untouched except where the frame's own measurements reach them.
- **The remaining `.dh-btn` / `.dh-input` / `.dh-pill` literals.** DS-02's
  bridges still carry them; DS-04…DS-06 convert opportunistically.
- **Business logic, routes, the schema, auth, capture, recurrence, API
  contracts.** Nothing under `app/kernel`, `app/modules/*/…-repository.ts`,
  `migrations/` or `workers/` is touched.

---

## 11. Remaining debt

| # | Debt | Where it lands |
|---|---|---|
| 1 | Module surfaces still read MD3-heavy under the new frame — Today's stat row, the task row's own height, the six record card families | DS-04 · DS-05 · DS-06 |
| 2 | `.dh-btn` / `.dh-input` / `.dh-pill` bridges remain | DS-04…DS-06 |
| 3 | The tooltip has no `right` placement, so a collapsed rail's tooltip is drawn below the glyph rather than beside it | DS-07 decides |
| 4 | The badge reads two vocabularies; the tooltip's `inverse-surface` pair has no `--dh-*` name | DS-08 |
| 5 | No density preference control | DS-07 |
| 6 | `Drawer` is still not re-exported from `~/shared/ui` — its API is URL-driven and route-shaped, so a re-export would misrepresent it as a drop-in. DS-03 leaves it as it found it | DS-08 |

---

## 12. DS-04 — the next stage

**Tasks productivity redesign.** The frame is now compact, quiet and violet-
accented; the densest surface inside it is not. The task row is still 46px with
its own status chip and priority control, and D18/D32 are load-bearing — so
DS-04 is where the row, its two aligned trailing columns, its hover affordances
and the Inbox/Today/Upcoming composition are rebuilt on the primitive layer, in
the shell this stage delivered.

---

*This document records DS-03. Amend it in the change that makes the amendment
true — never ahead of it.*
