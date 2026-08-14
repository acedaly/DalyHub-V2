# DS-02 — Core UI Primitives

> **What this stage delivers:** the DalyHub generic primitive layer —
> [`app/shared/ui/`](../../app/shared/ui/index.ts) — written entirely in the
> `--dh-*` vocabulary DS-01 established, and the first stage where the new
> visual language is visible in the running application.
>
> **The one-sentence visual outcome:** ordinary controls stopped being Material
> components at Material's sizes. A primary action went from a 45px stadium to a
> 36px rounded rectangle, a text field from a 56px outlined container to a 36px
> productivity field, a status chip from a 32px pill to a 20px badge, and a menu
> row from 48px at 16px type to 36px at 14px.
>
> Foundation: [DS-01](DS_01_DESIGN_SYSTEM_FOUNDATION_2026_08.md) ·
> [ADR-092](../decisions/ARCHITECTURE_DECISIONS.md#adr-092-the-dalyhub-design-system-becomes-the-governing-design-language--a-product-owned-semantic-layer-an-explicit-density-model-and-md3-demoted-to-machinery).
> Decision: [ADR-093](../decisions/ARCHITECTURE_DECISIONS.md#adr-093-the-dalyhub-generic-primitive-layer--a-real-button-a-compact-application-and-three-migration-bridges).
> Screenshots: [`assets/ds-02/`](assets/ds-02/README.md).

---

## 1. What was built

Thirteen primitives, one clear generic path for each common interaction.

| Primitive | DS-01 verdict | What DS-02 did |
|---|---|---|
| **Button** | REFACTOR | **New.** `Button` / `ButtonLink` / `buttonClassName`. Four families, two sizes |
| **IconButton** | (not inventoried — six hand-rolled variants existed) | **New.** Required label, optional tooltip, rounded square |
| **Input / Textarea** | KEEP + RESTYLE | **New primitives** over the restyled `.dh-control`; `TextField` unchanged |
| **Select** | KEEP | **New primitive** over a real `<select>`. D31 untouched |
| **Checkbox** | KEEP + RESTYLE | **New.** Native, styled, and the `indeterminate` property React cannot set |
| **Badge** | KEEP + RESTYLE | **New API** over the restyled chip. `StatusPill` now renders it |
| **Card** | KEEP + RESTYLE | **New generic surface** (`flat` / `outlined` / `raised`). Record cards untouched |
| **Menu** | KEEP | Restyled + re-exported. 531 lines of behaviour unchanged |
| **Popover** | KEEP | Re-exported (`AnchoredSurface`) |
| **Dialog** | KEEP + MOVE | Moved out of `shared/settings`; its two bespoke buttons became `Button` |
| **Drawer / Sheet** | KEEP | Re-exported (`Sheet`) |
| **Tabs** | KEEP | Restyled + re-exported (`ViewTabs`) |
| **Tooltip** | KEEP | Restyled + re-exported |

**Eight of thirteen were not rewritten**, and that is the result rather than a
shortfall. DS-01 found the hard interaction behaviours already built and tested —
focus management, background inertness, scroll locking, drawer stacking,
collision-aware placement, roving focus, typeahead, the phone-sheet fallback.
Rewriting them to make a barrel file look complete would have traded tested
behaviour for symmetry.

---

## 2. The three changes that carry the visual difference

### 2.1 The application declares `compact` density

One attribute, on the shell's root element:

```tsx
<div className="dh-app" data-dh-density="compact">
```

DS-01 built the density model and left it with one consumer, noting that DS-02
was "the point at which DS-02 can give a dense toolbar its 36px controls by
declaring `data-dh-density` on the region rather than by writing a height
somewhere". This is that declaration, and it is why nothing in the primitive
layer states a height of its own — asserted by `primitive-tokens.test.ts`.

**It costs no touch target.** `tokens.css` floors every compact hit area back to
`--app-touch-target-min` under `(pointer: coarse)`, unconditionally and last in
the file. A phone keeps its 45px controls and gains only the tighter padding,
glyph and type. Verified in the 390px captures: the same buttons that are 36px
on a desktop are 45px on a phone, from the same CSS.

It is an attribute rather than a media query, so the density preference DS-07
may add has something to override rather than a width rule to fight.

### 2.2 D33 — no button is a stadium

D13 reserved `corner-full` for the one primary or destructive action, which was
the right correction to `corner-full` on all five variants. DS-02 retires it from
the family: at the compact control height a stadium is a lozenge, and a header
holding a filled "New task" pill, an outlined "Filter & sort" pill and an
8px-cornered search field read as two design systems sharing a row.

Emphasis is carried by fill, border and content colour — three axes, all of which
survive being the same shape. Recorded as **D33**, with D13 marked superseded.

### 2.3 Secondary stopped being tonal

The single largest colour change. `.dh-btn--secondary` was M3's tonal button — a
filled `secondary-container` in the scheme's violet family. Beside a primary
action, two violet containers of different saturations meant the hierarchy had to
be read rather than seen; on a surface with no primary action, an ordinary
"Cancel" was painted more loudly than most of the page.

It is now a white box with a hairline and the ordinary text colour. Purple is
left to mean one thing, which is the "purple as accent, not flood" quality the
concept references are built around.

---

## 3. Migration, and the three bridges

`.dh-btn` is a class string at **220 call sites across 76 files**. Converting all
of them in the change that introduces the component would be unreviewable;
converting none of the *styling* would leave the application looking exactly as
it did.

So three class names are named beside their successors on every rule in
`ui.css`:

| Legacy | Successor | Effect |
|---|---|---|
| `.dh-btn` (+ five modifiers) | `.dh-button` | every unmigrated call site moves visually, for free |
| `.dh-input` | `.dh-control` | ~100 shared-field instances take the new shape |
| `.dh-pill` | `.dh-badge` | `StatusPill` renders `Badge`; existing selectors keep matching |

A call site's later conversion to `<Button>` is then a pure structural change
with no visual diff to review. **The bridges are temporary** and come out when
the last literal does.

Migrated in DS-02, chosen for reach rather than count:

- **`FormButton`** — composes `Button`. Every form in the product, in one file.
  It keeps the one thing it ever added: `pending` implies `disabled`, which is a
  form-submission rule (it stops a double submit) rather than a button one.
- **`ConfirmationDialog`** — its two bespoke buttons became `secondary` and
  `primary`/`danger`. One entry came off the `state-layer.test.ts` ratchet.
- **`CollectionControls`**, **`CaptureResult`**, **`LoadMore`**,
  **`UnsavedChangesGuard`** — the shared surfaces every module renders.
- **`StatusPill`** → `Badge`; **`DashboardCard`**, **`ViewTabs`**,
  **`OverflowMenu`**, the collection filter trigger and the tooltip restyled onto
  `--dh-*`.

---

## 4. The primitive-dependency decision

**None added.** The question was re-asked component by component while
implementing thirteen primitives; nothing in the brief named a behaviour the
existing machinery lacks.

The brief's own audit list for `Select` — options must not clip, the selected
value stays obvious, full lists stay reachable, keyboard navigation works,
placement is predictable, long lists scroll — is precisely the list of things the
*native* control gets right for free and a bespoke one gets wrong. The failure
mode being guarded against is a hand-rolled popup clipped by an
`overflow: hidden` ancestor; a native picker is drawn by the OS, outside the
document, and cannot be.

Radix, React Aria, Base UI and shadcn remain declined for the reasons in
[DS-01 §7](DS_01_DESIGN_SYSTEM_FOUNDATION_2026_08.md#7-the-primitive-library-decision).

---

## 5. Accessibility

Nothing was traded for compactness.

| Guarantee | How it holds |
|---|---|
| **Touch targets** | No primitive states a height; density does, and compact floors to 45px on a coarse pointer. Asserted twice — in `dalyhub-tokens.test.ts` and in `primitive-tokens.test.ts` |
| **Accessible names** | `IconButton`'s `label` is **required by the type**, not merely encouraged. A tooltip is the description and never the name |
| **Visible focus** | The three DS-01 focus tokens, applied once in `base.css`. Width unchanged at 2px; offset 2px → 1px, a deliberate adoption of the published token |
| **Keyboard** | `Select` is a real `<select>`; `Checkbox` is a real checkbox; the menu keeps its roving focus and typeahead; the dialog keeps its focus trap and focus return |
| **State is announced** | `aria-busy`, `aria-pressed`, `aria-checked="mixed"`, `aria-invalid` — asserted per primitive |
| **Disabled is inert** | Not merely faded. Asserted for `Button` and `IconButton` |
| **Colour is never alone** | Every badge says its value; every destructive action carries the word |
| **Contrast** | Control borders take `--dh-color-border-strong` (WCAG 1.4.11, 3:1). A card's edge — which only separates — takes `--dh-color-border` |
| **Reduced motion** | Every transition in `ui.css` removed under `prefers-reduced-motion`, and the checkbox has no draw animation to remove |
| **Anti-zoom** | `--app-field-font-size-compact` is untouched: 16px on touch, so iOS still does not zoom on focus |

---

## 6. Validation

| Check | Result |
|---|---|
| `pnpm run typecheck` | pass |
| `pnpm run lint` | pass |
| `pnpm run format:check` | pass |
| `pnpm run scheme:check` | pass — the generated blocks are untouched |
| `pnpm run test:unit` | pass — 5,549 tests, including 38 new |
| `pnpm run test:kernel` | pass — 2,531 tests |
| `pnpm run build` | pass |
| Browser | Tasks / Today / Projects / Settings / a form-heavy route / the primitive gallery, at 1280 and 390, in both appearances |

E2E shards were not re-run in full: no route, no data flow and no interaction
contract changed, and repository guidance is not to run expensive shards without
a change that justifies them. The behaviours those shards protect — the dialog's
focus trap, the menu's keyboard model, the select's native semantics — are
covered by the unit suite and were driven by hand in the browser.

---

## 7. What DS-02 deliberately did not do

Recorded so none is mistaken for an oversight.

- **The shell.** The dark rail, the search capsule and the top bar's violet
  create pill are the most visible remaining stadiums, and they are D12/D15/
  documented decisions on the frame. **DS-03.**
- **Tasks.** The task row is still 46px with its own status chip and priority
  control. D18/D32 are load-bearing. **DS-04.**
- **The six record card families.** `ProjectCard`, `GoalCard`, `AssetCard`,
  `ReviewCard`, `PersonRow`, `EntityRow` keep their 16px corners and their shape
  distinctions, which are §5b's strongest recognition device. **DS-05.**
- **Today.** The stat row and the focus panel. **DS-06.**
- **A global token migration.** 78 stylesheets still speak `--md-*`/`--app-*`.
  DS-01 §9 is explicit that this is expected rather than debt.
- **Business logic, routes, the schema, auth, capture, recurrence, API
  contracts.** Nothing under `app/kernel`, `app/modules/*/…-repository.ts`,
  `migrations/` or `workers/` is touched.

---

## 8. Remaining debt

| # | Debt | Where it lands |
|---|---|---|
| 1 | 214 `.dh-btn` literals remain, bridged rather than converted | DS-03…DS-06, opportunistically |
| 2 | `.dh-input` / `.dh-pill` bridges likewise | DS-03…DS-06 |
| 3 | The shell's three stadiums (search capsule, create pill, utility circles) | DS-03 |
| 4 | The badge reads two vocabularies — the DalyHub layer publishes no status *container* pairs | DS-08 |
| 5 | The tooltip's `inverse-surface` pair has no `--dh-*` name | DS-08 |
| 6 | `Drawer` is not re-exported from `~/shared/ui` — its API is URL-driven and route-shaped, so a re-export would misrepresent it as a drop-in | DS-03 decides |
| 7 | No density preference control | DS-07 |

---

## 9. DS-03 — the next stage

**Shell and navigation.** The primitive layer now exists, so the shell can be
rebuilt out of it rather than beside it: the navigation rail, the desktop top
bar, the phone bar, the command palette, and the toolbars and filter bars that
are A6's other remaining half.

It is also where the concept's most conspicuous unimplemented idea lives — the
dark navigation rail — and where the shell's three stadiums are resolved. D12's
216px drawer and D15's 60px phone bar must survive it, and the compact density
this stage declared is the contract those toolbars now build on.

---

*This document records DS-02. Amend it in the change that makes the amendment
true — never ahead of it.*
