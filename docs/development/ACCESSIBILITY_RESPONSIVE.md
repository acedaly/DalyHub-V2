# Accessibility & Responsive Baseline (DS-11)

> The shared platform every DalyHub module inherits automatically for **WCAG 2.2
> AA accessibility** and **responsive behaviour from 320px through ultra-wide**.
> This document is the practical reference: the conventions a module author
> follows, the rules the design system enforces, and the automated tests that keep
> the baseline from regressing.
>
> Governing docs: [`AGENTS.md §15`](../../AGENTS.md#15-accessibility-requirements)
> (the requirement), [`DESIGN_SYSTEM.md → Accessibility`](../design/DESIGN_SYSTEM.md#accessibility)
> and [`→ Responsive behaviour`](../design/DESIGN_SYSTEM.md#responsive-behaviour)
> (the patterns), and [ADR-027](../decisions/ARCHITECTURE_DECISIONS.md#adr-027-accessibility--responsive-baseline--automated-enforcement-and-the-inherited-platform)
> (the decision).

---

## What DS-11 is (and is not)

DS-11 is a **baseline and its automated enforcement**, not a rebuild. Every shared
component (DS-02 … DS-10b, PX-02) was built accessible and responsive from the
start; DS-11 **audits** them, **hardens** the few real gaps the audit found, and
adds the **automated regression tests** that make the baseline permanent. It builds
no product feature and creates no second implementation of anything.

Because the baseline lives in the **shared** components, the app shell and the
design tokens, every future module inherits it by composing those pieces — a new
module gets keyboard operability, focus management, screen-reader semantics,
responsive layout, safe-area handling and reduced-motion for free, and the CI gate
holds it to that standard.

---

## Keyboard conventions

The product is keyboard-first (see [`AGENTS.md §7`](../../AGENTS.md#7-interaction-philosophy)).
Every interactive control is reachable and operable by keyboard, with a visible
focus ring and a logical tab order — no keyboard trap, no unreachable control, no
lost or hidden focus, no duplicated tab stop.

| Key | Behaviour |
| --- | --- |
| `Tab` / `Shift+Tab` | Move through the logical focus order. The **skip link** is the first stop and jumps to `main`. |
| `/` | Focus global **Search** (ignored while typing in a field). |
| `Mod+K` (`⌘K` / `Ctrl+K`) | Toggle the **Command Palette** (permitted even while typing). |
| `Escape` | Close the topmost modal surface (Drawer level, Search, Palette, Inspector sheet, confirmation), then restore focus to its opener. Scoped to the top layer only. |
| `Enter` | Activate the focused control / primary action; open a focused Card or result. |
| `Space` | Toggle the focused control (checkbox, switch, button). |
| `Arrow` keys | Move within a composite widget: RecordTabs (roving tab), listbox/combobox options (Forms, Search, Palette), Card reorder, the Notes writing **toolbar** (roving tabindex). |
| `Home` / `End` | Jump to the first/last item within a composite widget where it applies (tabs, listboxes, toolbars). |

**Modal machinery is shared, never re-implemented.** The DS-03 hooks
(`use-drawer-focus`, `use-body-scroll-lock`, `use-inert-background` in
[`app/shared/drawer`](../../app/shared/drawer)) are the ONE implementation of the
WAI-ARIA modal contract: deterministic initial focus, a Tab/Shift+Tab trap that
wraps, background inerting, body-scroll lock, and focus restoration to the opener.
The Drawer, Search, Command Palette, the Inspector's mobile sheet, the mobile
navigation overlay and the dangerous-action confirmation all reuse them — there is
never a second focus-trap. **A new modal surface reuses these hooks.**

**Command-button toolbars (lesson from NOTES-04).** A row of formatting/command
buttons is a WAI-ARIA `role="toolbar"` with **roving tabindex** — only the active
button is a Tab stop; `Arrow`/`Home`/`End` move focus between buttons — so a
toolbar of a dozen controls adds ONE tab stop to the page, not a dozen. Each
button's visible text is also its accessible name (never an unlabelled icon), with
a `title` tooltip for the longer explanation. When such a control row must stay a
single line on a phone (to keep the surface below it usable), it **scrolls
horizontally** — an intentional, reachable overflow contained so it never adds
document-level horizontal overflow — rather than wrapping into rows that push
content below the fold; it wraps to full visibility only when there is width.

**Known shared-renderer gap.** Rendered GFM task-list checkboxes (`- [ ]`) from the
one FND-08 Markdown pipeline are unlabelled `<input type="checkbox" disabled>`
([DEBT-26](../product/PRODUCT_DEBT.md)) — an axe `label` violation surfaced when
Markdown containing a checklist is previewed. Until it is fixed in the shared
pipeline, an editor's own axe gate scans the authoring surface (its controls),
not the shared preview's rendered task lists.

---

## Responsive rules

DalyHub is one product from a 320px phone to an ultra-wide monitor: same model,
same vocabulary, adapted layout.

- **No horizontal overflow, ever, from 320px up.** Metadata wraps, long tokens
  break, nothing forces a fixed width wider than the smallest supported viewport.
  Enforced automatically (see below) at 320 / 375 / 390 / 768 / 1024 / 1440 / 2560.
- **Breakpoints are tokens.** `--dh-breakpoint-sm … 2xl` in
  [`tokens.css`](../../app/styles/tokens.css), mirrored as numbers in
  [`app/shared/tokens/tokens.ts`](../../app/shared/tokens/tokens.ts) (a test keeps
  them in sync) because `@media`/`@container` cannot read custom properties.
- **Prefer container queries for component-internal layout.** A component that must
  be correct in both a full route and a narrow Drawer/Inspector (Record Layout,
  Activity Feed, Settings) adapts to its **container** (`container-type:
  inline-size`), not the viewport, so it is right regardless of where it is mounted.
  Viewport media queries remain correct for shell-level structure (the sidebar rail
  collapsing below `md`).
- **Touch targets meet 44px** (`--dh-touch-target-min`, WCAG 2.2 §2.5.8) on every
  interactive control; quick actions are never hover-only on touch.
- **Safe-area insets are honoured.** The document opts into the full display via
  `viewport-fit=cover` (in [`root.tsx`](../../app/root.tsx)), so the
  `env(safe-area-inset-*)` padding the shell mobile bar, Drawer, Inspector sheet,
  Collection Layout and toast layer already apply resolves to real insets on
  notched devices instead of `0`.
- **Portrait, landscape, desktop, large monitor, Retina, touch, mouse and
  keyboard** are all first-class; no interaction is touch-only or keyboard-only.

---

## Accessibility standards

Target: **WCAG 2.2 AA**, met by construction in the shared layer.

- **Semantic landmarks & one heading outline.** The shell provides `banner`
  (sidebar brand), a `search` landmark (the Search/Command entries), `navigation`
  (primary nav) and `main` (the pane) — all page content sits inside a landmark. A
  single, non-skipping heading outline: the Pane Header is `h1`, section headings
  `h2`, and Cards accept a `headingLevel` so their titles nest one level below the
  surrounding heading (never a skipped level).
- **Labels & relationships.** Every control has an accessible name; icon-only
  buttons carry a visually-hidden label; help/validation text is wired with
  `aria-describedby`/`aria-errormessage`; native semantics come before ARIA.
- **Live regions.** Async results, save status, validation errors, notifications
  and reorder announcements are announced (`aria-live` polite/assertive, or
  `role="status"`/`role="alert"` where appropriate). The app-global toast layer uses
  bare `aria-live` so it never shadows other status/alert regions.
- **Focus visibility.** One high-contrast focus ring (`:focus-visible`, AA against
  both themes) on every control; re-pinned to the system `Highlight` colour under
  forced-colors (Windows High Contrast).
- **State is never colour alone.** Status, selection, danger, active nav and
  save-state are always paired with icon, text or shape.
- **User settings respected.** `prefers-reduced-motion` collapses motion to instant
  (a global switch plus component blocks), `prefers-color-scheme` drives the theme,
  layouts reflow to 200% zoom without loss, and forced-colors/`prefers-contrast`
  are compatible (state carried by shape/text + real borders on modal surfaces).
- **Every UI state is accessible:** loading (`aria-busy`, decorative skeletons),
  empty, error (`role="alert"` + retry), busy, disabled (distinguished from
  read-only) and success.

---

## Testing strategy

Accessibility and responsiveness are enforced by **three layers**, so a regression
fails fast and locally:

1. **Static lint** — `eslint-plugin-jsx-a11y` (recommended) over `app/**` catches
   common JSX a11y mistakes at `pnpm lint`.
2. **Unit/component tests** — role-based RTL assertions per component, plus the
   DS-01 token **contrast** and **light/dark parity** tests (the authoritative,
   deterministic colour-contrast guarantee).
3. **Playwright end-to-end** (the DS-11 additions), all run by `pnpm test:e2e` and
   in CI:
   - **`e2e/accessibility.spec.ts`** — an **axe-core** (`@axe-core/playwright`,
     MPL-2.0, dev-only) scan of every `/design/*` fixture and every real route,
     scoped to WCAG 2.0/2.1/2.2 A + AA plus axe best-practice, in **light and
     dark**, and with the **Drawer, Search, Command Palette and confirmation dialog
     open**. Fails on any violation with an actionable list.
   - **`e2e/responsive.spec.ts`** — the **no-horizontal-overflow** sweep across the
     full viewport matrix for every surface, plus open overlays at the extremes and
     the mobile navigation overlay.
   - **`e2e/keyboard.spec.ts`** — the platform keyboard audit: skip link, landmark
     count, chrome reachability with no trap, and focus trap + restoration through
     the shared modal machinery.
   - **`e2e/touch-targets.spec.ts`** — asserts shared interactive controls meet the
     **44px** minimum (`--dh-touch-target-min`, WCAG 2.2 §2.5.8), so a control
     regressing below the documented target size fails the build.

Shared Playwright helpers live in **[`e2e/helpers.ts`](../../e2e/helpers.ts)**:
`RESPONSIVE_VIEWPORTS` (the canonical matrix), `expectNoHorizontalOverflow`,
`gotoFixture` (hydration-gated navigation), `expectMinTouchTarget`, and
`buildAxeScan` / `expectNoAxeViolations`.

**Why colour-contrast is disabled in the axe run.** DS-01 already proves every
semantic token pair against AA deterministically in
`test/unit/tokens/contrast.test.ts`. Re-deriving contrast from rendered pixels in a
headless browser is flaky (antialiasing, overlay compositing) and would duplicate
that guarantee less reliably — so the axe run disables `color-contrast` and enforces
every other rule. This keeps the gate strong without brittle assertions.

---

## Requirements for every future module

A new module inherits the baseline automatically **by composing the shared layer** —
and must keep it. Concretely, a module:

- **Composes the shell and shared components** — it renders inside `AppShell`
  (`main`, skip link, landmarks come free), lays its collection out with
  `CollectionLayout` (Pane Header `h1`), and renders records through `Card`
  (setting `headingLevel` to nest correctly), `RecordLayout`, `Drawer`,
  `Inspector`, `Forms`, `Filters`, `Settings` and the `Feedback` platform. It does
  **not** build a bespoke header, modal, focus-trap, toast, empty/loading state or
  hand-picked icon.
- **Reuses the DS-03 modal hooks** for any new overlay, so focus, inerting, scroll
  lock and restoration are correct by construction.
- **Uses tokens only** — no hard-coded colour/spacing/duration; state is conveyed
  with icon/text/shape, never colour alone; touch targets meet the token.
- **Adds its `/design/*` fixture (or real route) to the sweeps** in
  `e2e/accessibility.spec.ts` and `e2e/responsive.spec.ts` so its surface is held
  to the axe + no-overflow baseline, and adds keyboard coverage for any novel
  composite widget.
- **Meets the [Definition of Done](../../AGENTS.md#18-definition-of-done)** — WCAG
  2.2 AA and responsive-to-320px are verified (by the automated gate), not assumed.

The **Mobile** roadmap item each module carries (TODAY-06, PROJ-06, AREA-04, …)
depends on DS-11 and is about *product-level* mobile ergonomics (swipe actions,
adapted layouts) on top of this inherited baseline — not about re-establishing it.

---

## The MOBILE-01 phone platform

MOBILE-01 sits ON this baseline. DS-11 guarantees a phone screen is *usable*;
MOBILE-01 makes the daily workflows *quick*. The accessibility rules below are
additions to the contract above, not replacements — everything in this document
still holds.

### Keyboard-aware layout: one listener, one token

The on-screen keyboard does not resize the layout viewport in most mobile
browsers; it overlays it. Anything anchored to the bottom of the viewport — a
sheet's Save button, a Drawer's sticky actions, the Meeting capture bar, the
bottom navigation — therefore ends up UNDER the keyboard unless the app knows how
tall it is. The Visual Viewport API is the only reliable source.

DalyHub reads it in **exactly one place**: `useKeyboardInset`
([`app/shared/viewport`](../../app/shared/viewport)), mounted once by the
AppShell. It publishes the resolved height as **`--dh-keyboard-inset`** on the
document element, and every keyboard-aware surface is then styled purely in CSS
against that token.

- **A form never measures anything.** Per-form resize listeners are the
  layout-thrashing pattern the performance budget forbids; a form opts in by
  consuming the token (or by setting `FormActions sticky`), never by observing.
- **A noise threshold** (96px) ignores a collapsing URL bar or a rubber-band
  scroll, so sticky controls do not jitter while the user scrolls.
- **Updates are coalesced** into one `requestAnimationFrame` and written only when
  the value actually changes, so a keyboard opening costs one style write.
- It is **SSR-safe** and degrades to `0px` where the API is absent — there the
  layout viewport really does resize and `100dvh` is already correct.

**`--dh-bottomnav-height`** is the companion token: the space the phone bottom bar
occupies (`0px` at every other width), reserved by scrolling surfaces and
bottom-anchored controls so nothing is trapped underneath it.

### Mobile browser zoom

A focused text input whose computed `font-size` is below **16px** makes iOS Safari
zoom the page — and leave it zoomed, which is how a phone form ends up
horizontally scrolled with its Save button off-screen. DalyHub's body scale is
15px and its Markdown source scale 13px, so under `(hover: none)` every
text-entry control is raised to exactly 16px. This is a **touch-only floor**: the
desktop type scale is unchanged and nothing ever shrinks.

### Landmarks and the second navigation

The phone bottom bar is its own `navigation` landmark labelled **`Quick
navigation`**, deliberately distinct from the sidebar's `Primary`. Both are in the
DOM at once (each is `display: none` at the other's viewport), and two same-named
landmarks are ambiguous to a screen-reader user browsing by landmark. Its active
destination carries `aria-current="page"` **and** an indicator bar, a filled icon
treatment and a semibold label — never colour alone — and exactly one destination
is active for any path.

Every bottom-bar control keeps a permanently visible text label. There are no
icon-only controls in primary navigation, at any width.

### Sheets reuse the modal machinery

The one shared `Sheet` ([`app/shared/sheet`](../../app/shared/sheet)) — used by
Quick Capture, the collection filter/sort/view sheet and the More navigation —
composes the **same DS-03 hooks** listed above. There is still exactly ONE
focus-trap implementation in DalyHub. A sheet:

- traps focus, inerts the background, locks body scroll and restores focus to its
  opener, all through those hooks;
- stops `Escape` propagation, so a sheet opened over a Drawer closes only itself —
  never both;
- makes its BODY the only scroll container with `overscroll-behavior: contain`, so
  there is no nested scroll trap and scrolling never chains to the page behind it;
- caps its height by `--dh-keyboard-inset`, so its sticky footer is above the
  keyboard rather than under it.

### Command-button rows and tab strips, revisited

The NOTES-04 toolbar lesson above still stands — a command row is a
`role="toolbar"` with roving tabindex and exactly ONE Tab stop. MOBILE-01 adds
that a row should not carry every low-frequency command permanently: the writing
toolbar offers six common actions directly and reveals the rest behind a "More"
toggle **inside the same toolbar**, so the single-Tab-stop guarantee and
Arrow/Home/End navigation across everything on screen are preserved rather than
traded for a second focus surface.

The Record Layout's tab strip takes the same shape for a different reason: below
`md`, a record with more than four tabs moves the surplus into a labelled
**"More sections"** menu (the shared DS-12 menu, placed OUTSIDE the `tablist`,
which may contain only tabs). The active tab always swaps into the inline strip;
Arrow keys move within what is visible, so focus never lands on a control the user
cannot see; selecting from the menu moves focus onto the now-inline tab; and
nothing — including Activity and Settings — is hidden permanently. Above `md`
every tab renders inline exactly as before.

### Nothing is hidden to look tidy

Two rules the phone presets hold to:

- A **card title wraps, never truncates** — it is the one thing the user is
  scanning for. It is the subtitle that clamps.
- **Low-priority metadata is de-emphasised, not removed.** `CardMetaItem.priority`
  is a MODULE declaration of what its record leads with; low-priority items stay
  rendered, readable and in the accessibility tree at every width.

### Gestures remain accelerators

Unchanged from TODAY-06 / ADR-032, and re-asserted for every surface MOBILE-01
touches: a swipe may accelerate an action, but the action must also exist as an
ordinary, visible, keyboard-accessible control. The Tasks list's swipe tray
reveals exactly the `quickActions` already rendered on the card.

### Extra verification MOBILE-01 adds

- `e2e/mobile-shell.spec.ts` — the phone shell driven end to end at 390px, 320px
  and phone landscape with touch emulation: the bottom bar's contract, one-tap
  navigation and Back, the 44px targets, the More sheet's completeness and focus
  restoration, Search within two taps, the full Quick Capture flow (including
  title-plus-Enter and repeated capture), Escape with no nested trap, axe in light
  and dark with the sheet open, and 200% zoom.
- `RESPONSIVE_VIEWPORTS` gains **phone landscape (844×390)**, which the matrix
  previously had no coverage for — a real orientation with a genuinely different
  constraint (a very short viewport with sticky top and bottom chrome).

---

## Related documents

- [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md) — the patterns and their
  accessibility/responsive contracts.
- [`ARCHITECTURE_DECISIONS.md → ADR-027`](../decisions/ARCHITECTURE_DECISIONS.md#adr-027-accessibility--responsive-baseline--automated-enforcement-and-the-inherited-platform)
  — the decision and its alternatives.
- [`ROADMAP_V2.md → DS-11`](../roadmap/ROADMAP_V2.md#-ds-11--accessibility--responsive-baseline).
- [`AGENTS.md §15`](../../AGENTS.md#15-accessibility-requirements) — the requirement.
- [`REFERENCE_PRODUCTS.md`](../reference/REFERENCE_PRODUCTS.md) — the axe-core reuse assessment.
