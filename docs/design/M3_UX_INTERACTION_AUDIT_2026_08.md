# Material Design 3 UX & interaction audit — August 2026

**Scope.** The whole product, audited against the design language it says it
speaks. [ADR-074](../decisions/ARCHITECTURE_DECISIONS.md#adr-074-material-design-3-as-the-design-language--one-generated-scheme-no-theme-feature-and-an-alias-layer-as-the-migration-mechanism)
made Material Design 3 DalyHub's design language and
[`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) documents the anatomy as shipped. This
audit asks a narrower and more useful question:

> Where does the product the owner actually uses diverge from the language the
> repository says it speaks — and which of those divergences are worth fixing?

It is deliberately **not** a restyle proposal. M3-01 (PR #120/#121), DS-14 Gate D
(#122), the appearance work (#123) and the editor/gallery upgrade (#124) already
did the visual conversion. What remains is interaction and consistency debt: the
places where the *rules* are right and the *reach* is partial.

**Method.** Static evidence from the codebase (counts are `grep` over `app/`, and
reproducible), plus screenshots captured at M3's own window-size classes by
[`e2e/m3-audit-screenshots.spec.ts`](../../e2e/m3-audit-screenshots.spec.ts) into
[`assets/m3-audit-2026-08/`](assets/m3-audit-2026-08). M3's classes are used
rather than DalyHub's breakpoints on purpose: checking whether the product
answers the class correctly, using the product's own bands, would be circular.

**Status of each finding** is one of **defect** (it is wrong now), **divergence**
(deliberate or not, it differs from M3 and the difference costs something), or
**gap** (M3 has something the product does not, and the absence shows).

---

## Summary

| # | Finding | Kind | Severity |
|---|---|---|---|
| 1 | The floating action button covers content and form controls | defect | **High** |
| 2 | Icon-only controls rely on `title` for their tooltip — 91 instances, none keyboard-reachable | gap | **High** |
| 3 | The state layer is documented as one shared class and implemented ~5× by hand | divergence | Medium |
| 4 | No navigation rail: the medium window class gets the phone layout | gap | Medium |
| 5 | A 240px permanent drawer starves the expanded window class | divergence | Medium |
| 6 | Settings mixes native `<select>` with the shared combobox | divergence | Medium |
| 7 | A settings row labels its own field twice | defect | Low |
| 8 | No switch: every boolean in the product is a checkbox | gap | Low |
| 9 | No press ripple; the state layer stops at opacity | divergence | Low (accepted) |

Findings 1, 2 and 7 are defects a user meets. 3 and 6 are consistency debt that
grows with every new surface. 4 and 5 are the one genuinely *structural*
question. 8 and 9 are small and arguably fine as they are.

---

## 1 — The FAB covers content and form controls · **defect, high**

**Evidence.** [`surface-settings.png`](assets/m3-audit-2026-08/surface-settings.png):
the capture FAB sits directly on top of the **Default task destination**
combobox, covering roughly a third of the input. The same frame at
[`nav-today-medium-700.png`](assets/m3-audit-2026-08/nav-today-medium-700.png)
shows it overlapping the "My day" card.

**Why it happens.** The FAB is `position: fixed` bottom-right and clears the
*navigation bar* and the home indicator — which is the phone case, and is
correct there. It does not clear anything on a scrolling desktop page, so any
content that reaches the bottom-right corner goes under it.

**Why it matters.** This is not a cosmetic overlap. A pointer user cannot click
the covered part of that combobox at all, and the control it covers is different
on every page, so nobody can learn to avoid it. M3's own guidance is that a FAB
must not obscure content: a page whose content reaches the FAB adds bottom
padding, or the FAB is scoped to the surfaces that want one.

**Related, already recorded:** [DEBT-96](../product/PRODUCT_DEBT.md) — on a phone
the FAB and the bottom bar both say "Capture", in the same corner. The audit
confirms that entry and adds the overlap, which is the more serious half.

## 2 — `title` is the only tooltip mechanism · **gap, high**

**Evidence.** 91 `title={…}` attributes on controls across `app/`; two
`role="tooltip"` elements in the entire product, neither a general mechanism.
PR #124's editor toolbar added thirteen more, so this is growing.

**Why it matters.** `title` is not a tooltip, it is a browser affordance with
three hard limits: it never appears on keyboard focus, it is unreliable on touch
entirely, and its delay and styling are the browser's. For an icon-only control
the tooltip is where the *shortcut* lives — "Bold — ⌘B" — so a keyboard user,
the exact person who wants the shortcut, is the one who cannot see it. The
accessible NAME is present (`aria-label`), so this is not a WCAG failure; it is a
usability gap that M3's plain tooltip exists to fill.

**Shape of the fix.** One shared tooltip primitive (`role="tooltip"` +
`aria-describedby`, shown on hover *and* focus-visible, dismissed on Escape),
adopted by the icon-only controls first: the editor toolbar, the card overflow
triggers, the shell's icon buttons.

## 3 — The state layer is one class in the docs and five patterns in the CSS · **divergence, medium**

**Evidence.** `DESIGN_SYSTEM.md` states the state layer is "implemented **once**,
as `.md-state-layer` in `base.css`, and applied by adding the class." Reality:

| | count |
|---|---|
| `.md-state-layer` applied (TSX) | 13 |
| `.md-state-layer` referenced (CSS) | 11 |
| Hand-rolled `color-mix()` hover fills on a content colour | 23 |
| `:hover` rules in `app/styles/` overall | 107 |

**Why it matters.** Not because the hand-rolled ones look wrong — they are the
same 8% of the same content colour, because their authors read the same rule.
It matters because the rule is now enforced by *convention* rather than by the
class, so the next divergence is silent: a surface that uses 12%, or that tints
the container instead of layering, will look almost right and will never fail a
test. It is also the reason the *pressed* and *dragged* opacities are largely
unimplemented outside the shared class — a hand-rolled `:hover` rarely grows an
`:active` sibling.

**Shape of the fix.** Not "convert all 107". Convert the interactive components
(buttons, list rows, menu items, nav items, chips, card affordances, the new
inline-edit trigger and editor toolbar) to the shared class, then add a test that
fails when a new `:hover` rule sets `background` on an element that also carries
an interactive role.

## 4 — No navigation rail: the medium window class gets the phone layout · **gap, medium**

**Evidence.** [`nav-today-medium-700.png`](assets/m3-audit-2026-08/nav-today-medium-700.png)
at 700px — M3's **medium** class (600–839dp) — shows the bottom navigation bar
and no persistent navigation. `grep` finds no navigation rail in the product
(`dh-rail`/`nav-rail`: 0 files); the shell has two states, drawer and bottom bar,
switching at 48rem.

**Why it matters.** M3 assigns the medium class a **navigation rail** precisely
because the bottom bar wastes 80px of vertical space on a device that has width
to spare, and because a tablet in landscape is a pointer device where a bottom
bar is a long reach. DalyHub's own tablet band (768–1023px) is entirely inside
this class, so every tablet user gets the phone treatment.

**Honest counterweight.** DalyHub is a single-owner product whose owner
overwhelmingly uses a laptop and a phone. A rail is real work — a third shell
state, its own tests, its own screenshots — to serve a device the owner may not
use. This is a finding, not automatically a task; it deserves a decision, and
the decision may legitimately be "no rail, and here is why".

## 5 — A 240px permanent drawer starves the expanded window class · **divergence, medium**

**Evidence.** [`nav-today-expanded-900.png`](assets/m3-audit-2026-08/nav-today-expanded-900.png):
at 900px the drawer takes 240px — **27% of the window** — and the dashboard
renders as one narrow column in the 660px that remains.

**Why it matters.** The navigation is not doing 27% of the work on that screen.
M3's answer for the expanded class is a rail (compact, icon + label, ~80px) with
the drawer reserved for large windows, which is the same fix as finding 4 seen
from the other side — one rail component would serve 600–1199dp and the drawer
would start where it earns its width.

## 6 — Settings mixes native `<select>` with the shared combobox · **divergence, medium**

**Evidence.** [`surface-settings.png`](assets/m3-audit-2026-08/surface-settings.png):
**Default landing page** and **Default Tasks view** are native `<select>`
elements with browser chrome, while **Default task destination** immediately
below is the shared `SelectField` combobox with M3 outlined-field styling. Two
select presentations, adjacent, in one panel.

**Why it matters.** `DESIGN_SYSTEM.md` → Forms says "**one control per field
type**, product-wide". A native select is a legitimate choice — it is more robust
and better on mobile — but then it should be the choice *everywhere*, and it is
not. The 2026-08 selection-control audit
([`SELECTION_CONTROL_AUDIT_2026_08.md`](../product/SELECTION_CONTROL_AUDIT_2026_08.md))
found the shared combobox had a defect nobody noticed for months; a second,
undocumented select surface is how that happens.

## 7 — A settings row labels its own field twice · **defect, low**

**Evidence.** [`surface-settings.png`](assets/m3-audit-2026-08/surface-settings.png):
"Default task destination" appears as the row's label on the left **and** again
as the field label above the input on the right.

**Why it matters.** Small, but it is a duplicated accessible name in a settings
list a screen-reader user reads item by item, and it is the kind of thing that
tells a careful user the surface was assembled rather than designed.

## 8 — No switch: every boolean is a checkbox · **gap, low**

**Evidence.** `BooleanField` supports `variant="switch"` and exactly **one** call
site uses it — the `/design/forms` fixture. Every real boolean in the product is
a checkbox (`type="checkbox"`: 13 files).

**Why it matters, mildly.** M3 distinguishes them by meaning: a checkbox selects
an item in a set (and usually needs a Save), a switch toggles a setting and takes
effect immediately. DalyHub's settings toggles are immediate, so they are
switches wearing checkboxes. The component already exists, so this is adoption,
not construction.

## 9 — No press ripple · **divergence, low, arguably correct**

**Evidence.** `ripple`: 0 occurrences in `app/`. The state layer implements hover
and pressed as an opacity change with no origin-anchored animation.

**Assessment.** M3's ripple is an *expression* of the state layer, not the state
layer itself, and DalyHub's motion principle is "restrained; motion communicates
causality, never decoration" (AGENTS.md §6). A ripple is arguably decoration
here, and it would need a `prefers-reduced-motion` path. **Recommendation: record
this as a deliberate deviation in `DESIGN_SYSTEM.md` and close it**, rather than
leave it as an undocumented absence that every future audit re-raises.

---

## What the evidence says PR #125 should be

The findings fall into three natural groups, and only one of them is a coherent
single PR.

**Group A — interaction defects and the tooltip gap (findings 1, 2, 7).** These
are things a user meets: a button covering a form control, shortcuts that only
mouse users can discover, a duplicated label. They share a theme (the product's
*controls* rather than its layout), they are independently testable, and none of
them requires an architectural decision. **This is PR #125.**

**Group B — consistency debt (findings 3, 6, 8, 9).** The state-layer sweep, the
select convergence, switch adoption, and documenting the ripple deviation. Real,
but each is a mechanical sweep across many files with low user-visible payoff
per file. Better as its own PR *after* A, when the tooltip primitive from A has
already established the "one shared primitive, adopted everywhere" pattern for
this round.

**Group C — the navigation question (findings 4, 5).** Whether DalyHub gets a
navigation rail is a product decision about which devices it serves, not a
styling task. It needs an ADR and a decision from the owner first. **It should
not be bundled into an implementation PR**, and it may legitimately be answered
"no".

### Recommended scope for PR #125

> **Control-level interaction fixes: the FAB's relationship to content, one
> shared tooltip primitive, and the settings-row label duplication.**

Concretely:

1. **The FAB stops covering content.** Decide its rule — most likely: pages whose
   content can reach it reserve the corner, and the phone case loses the FAB
   entirely in favour of the bottom bar's Capture slot (which closes DEBT-96 in
   the same change). Add an E2E assertion that no interactive element is
   overlapped by the FAB at the representative widths, so this cannot regress.
2. **One shared tooltip primitive**, shown on hover **and** `:focus-visible`,
   dismissed on Escape, wired through `aria-describedby`. Adopt it on the
   icon-only controls: the editor toolbar (13 controls), card and record overflow
   triggers, the shell's icon buttons. Leave `title` in place only where the
   control already has visible text.
3. **The duplicated settings label**, and a scan for its siblings.

Deliberately **out** of PR #125: the state-layer sweep, the select convergence,
the switch, the ripple decision, and anything about the navigation rail.

### Before PR #125 starts

One decision is needed from the owner, because it changes what gets built rather
than how: **does DalyHub want a navigation rail for tablet-width windows?** If
yes, that is its own ADR and its own PR. If no, record it as a deliberate
deviation in `DESIGN_SYSTEM.md` so this audit's findings 4 and 5 are closed
rather than perennially re-raised.

---

## Reproducing this audit

```bash
pnpm run build
CAPTURE_SCREENSHOTS=1 PLAYWRIGHT_SKIP_BUILD=1 pnpm exec playwright test \
  e2e/m3-audit-screenshots.spec.ts --workers=1
```

The counts in findings 2, 3 and 8 are `grep` over `app/` and are quoted in each
finding so they can be re-run and challenged.
