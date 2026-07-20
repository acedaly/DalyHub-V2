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
| `Arrow` keys | Move within a composite widget: RecordTabs (roving tab), listbox/combobox options (Forms, Search, Palette), Card reorder. |
| `Home` / `End` | Jump to the first/last item within a composite widget where it applies (tabs, listboxes). |

**Modal machinery is shared, never re-implemented.** The DS-03 hooks
(`use-drawer-focus`, `use-body-scroll-lock`, `use-inert-background` in
[`app/shared/drawer`](../../app/shared/drawer)) are the ONE implementation of the
WAI-ARIA modal contract: deterministic initial focus, a Tab/Shift+Tab trap that
wraps, background inerting, body-scroll lock, and focus restoration to the opener.
The Drawer, Search, Command Palette, the Inspector's mobile sheet, the mobile
navigation overlay and the dangerous-action confirmation all reuse them — there is
never a second focus-trap. **A new modal surface reuses these hooks.**

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

## Related documents

- [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md) — the patterns and their
  accessibility/responsive contracts.
- [`ARCHITECTURE_DECISIONS.md → ADR-027`](../decisions/ARCHITECTURE_DECISIONS.md#adr-027-accessibility--responsive-baseline--automated-enforcement-and-the-inherited-platform)
  — the decision and its alternatives.
- [`ROADMAP_V2.md → DS-11`](../roadmap/ROADMAP_V2.md#-ds-11--accessibility--responsive-baseline).
- [`AGENTS.md §15`](../../AGENTS.md#15-accessibility-requirements) — the requirement.
- [`REFERENCE_PRODUCTS.md`](../reference/REFERENCE_PRODUCTS.md) — the axe-core reuse assessment.
