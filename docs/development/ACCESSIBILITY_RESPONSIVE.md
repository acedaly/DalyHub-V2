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
  Enforced automatically (see below) across the canonical matrix — 320 / 375 /
  390 / 430 / **844×390 phone landscape** / 768 / 1024 / 1440 / 2560. MOBILE-01
  added the last two of those: the large-phone width most current handsets report,
  and the first entry where HEIGHT is the binding dimension.
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
- **Focus visibility.** One high-contrast focus ring (`:focus-visible`, ≥3:1 in
  **every** curated theme) on every control; re-pinned to the system `Highlight`
  colour under forced-colors (Windows High Contrast).
- **State is never colour alone.** Status, selection, danger, active nav and
  save-state are always paired with icon, text or shape.
- **User settings respected.** `prefers-reduced-motion` collapses motion to instant
  (a global switch plus component blocks), `prefers-color-scheme` drives the theme
  when the owner has chosen the `system` appearance mode (THEME-01),
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
   DS-01/THEME-01 token **contrast**, **coverage** and **dark-block parity** tests
   (the authoritative, deterministic colour-contrast guarantee). Since THEME-01
   these run over **every curated theme** — seven of them since THEME-02 — not a
   light/dark pair, and cover the text ramp on every surface, every tinted surface,
   the selected navigation row, filled controls in all three interactive states,
   focus rings, control boundaries, progress and every chart series. The list comes
   from the registry, so a theme cannot be added without passing them.
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

**Why colour-contrast is disabled in the axe run.** DS-01/THEME-01 already prove
every semantic token pair against AA deterministically, in every theme, in
`test/unit/tokens/contrast.test.ts`. Re-deriving contrast from rendered pixels in a
headless browser is flaky (antialiasing, overlay compositing) and would duplicate
that guarantee less reliably — so the axe run disables `color-contrast` and enforces
every other rule. This keeps the gate strong without brittle assertions.

**Control boundaries (THEME-01).** WCAG 1.4.11 requires 3:1 for a boundary that is
needed to *identify* a control. `--dh-color-control-border` is that token and is
asserted at 3:1 on four surfaces in every theme; `--dh-color-border-strong` remains
the decorative emphasis border and is deliberately lighter. Using `border-strong` on
a real control would silently fall below the threshold — recorded as
[DEBT-54](../product/PRODUCT_DEBT.md#-debt-54--border-strong-is-still-below-31-where-it-is-a-decorative-border--p3)
until a check enforces the distinction.

**Meaning is never carried by a theme.** Priority, overdue, due-soon, completed,
waiting and on-hold all have their own token triples in every theme AND always carry
a text label, so none of them depends on the owner being able to distinguish
one another. `test/unit/tokens/contrast.test.ts` asserts the priority
label is still present and readable in Daly Dark specifically.

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

The **2026-08 iPhone daily-driver pass** added three rules to that contract and
changed no existing one. All three are in
[`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md); they are restated here because
each is an accessibility property first and a layout one second:

- **A small control keeps its size and grows its TARGET, and a row never grows to
  satisfy it.** Two shapes carry it — a wrapping `label` sized to the floor with a
  negative margin (the 20px completion circle, now on Today's Focus rows as well as
  in every task list), and symmetric block padding given back as negative margin
  (a row's one-line "open" link). An absolutely positioned `::after` overlay is
  **not** a third shape: whenever the control sits inside the `overflow: hidden`
  that draws its ellipsis, hit testing respects that clip, so the overlay looks
  right and does nothing.
- **The 16px touch floor on text entry lives in a TOKEN, not in a selector list.**
  `--app-field-font-size(-compact)` is consumed by the shared native-control
  baseline every `input`/`select`/`textarea` inherits, so a module control cannot
  be written that misses it. It was three class names until this pass, and eight
  module filter controls written after that list had fallen outside it — a page
  that zooms on focus and stays zoomed is a WCAG 1.4.10 reflow failure, not a
  cosmetic one.
- **A phone overflow menu is a modal sheet, and keeps its `menu` semantics.** The
  shared ⋯ menu renders the same `role="menu"` panel with the same roving tabindex
  inside the shared `Sheet` below `md`. There is still exactly ONE focus trap in
  DalyHub: the sheet composes the same DS-03 hooks everything else does.

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
- responds to `Escape` only when it is the TOPMOST sheet, and stops the event there
  — so a sheet over a Drawer closes only itself, and a sheet opened from inside
  another sheet (the ASSET-03 Asset-type picker inside Quick Capture) does not take
  the half-written capture beneath it down with it;
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

### Choosing from a long vocabulary on a phone (ASSET-03)

A single-select whose vocabulary is long enough that an anchored listbox is the
wrong phone control opts in to `SelectField sheetOnCompact`: below `md` the field
is a 44px trigger that opens the shared option `Sheet`, and above it the DS-16
combobox is untouched. It is the same field either way — same value, label,
required state, help, error association and `controlRef` — and the sheet's rows are
`SheetOptionList`, so they arrive with 44px targets and `aria-pressed` selection
that never relies on colour. Presentation groups may head the rows; they carry no
data. The trigger names itself with the field label and its own value
("Type, Vehicle"), so it is never announced as a value with no field.

### Extra verification MOBILE-01 adds

- `e2e/mobile-shell.spec.ts` — the phone shell driven end to end at 390px, 320px
  and phone landscape with touch emulation: the bottom bar's contract, one-tap
  navigation and Back, the 44px targets, the More sheet's completeness and focus
  restoration, Search within two taps, the full Quick Capture flow (including
  title-plus-Enter and repeated capture), Escape with no nested trap, axe in light
  and dark with the sheet open, and 200% zoom.
- `e2e/assets-mobile-capture.spec.ts` (ASSET-03) — phone-first creation of a new
  Asset from the global `+`, including the option-sheet type picker by keyboard,
  Escape scoped to the topmost sheet, axe in light and dark, and 320/375/390/430px.
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

### Measured bundle cost (MOBILE-01)

Production `pnpm run build`, client JS, measured before and after the change on
the same machine. Chunk names are normalised (the content hash stripped) and
sizes aggregated per name, because Rolldown re-splits chunks between builds.

| | Before | After | Δ |
| --- | ---: | ---: | ---: |
| Total client JS | 1,684,143 B | 1,720,997 B | **+36,854 B (+2.2%)** |
| Chunks | 160 | 168 | +8 |
| `entry.client` | 182,473 B | 182,473 B | **0** |

**The initial application bundle is byte-for-byte unchanged.** That is the number
that matters: everything MOBILE-01 adds is either lazy or tiny.

New chunks, all lazy or shell-level:

| Chunk | Size | When it loads |
| --- | ---: | --- |
| `CaptureSheet` | 13,871 B | First time Quick Capture is opened |
| `sheet` | 2,663 B | With the first sheet |
| `capture` | 2,372 B | Split across the capture panels |
| `quick` | 2,031 B | The shared quick-capture parser, with the Task panel |
| `viewport` | 994 B | The shell (the keyboard-inset observer) |

The largest per-route growth is `app` (+3,757 B — the shell's bottom bar, top bar
and providers) and `collection` (+3,131 B — the shared controls and filter sheet).
`manifest` grows 2,011 B because there is one more route (`/capture/context`).
No route chunk shrank or grew materially otherwise, and route-level code splitting
is unchanged.

Search and the Command Palette remain lazy (`SearchSurface` and `CommandPalette`
are still separate chunks and did not move into the shell), the bottom bar loads
no module code to render itself, and the capture context is fetched on demand
rather than in the app-shell loader.

---

## UX-01 additions (2026-08-01)

Three accessibility rules the daily-driver audit added or made explicit.

### Exactly one `main` landmark per page

The shell owns the page's single `main` (`#main-content`). A route rendered inside
it must **never** render its own `<main>`; use a labelled `<section>`. Two routes
had (`/new/meeting` and `/reviews/new`), which gives a screen-reader user
navigating by landmark an ambiguous choice between two "main" regions.

Why the gate missed it, stated plainly so the next reader does not assume coverage
it does not have: `landmark-unique` is **disabled for every scan** for a
documented, unrelated DS-02 reason (Record Layouts repeat "Summary"/"Content"
regions by design), and `landmark-no-duplicate-main` is a best-practice rule
outside the `wcag2a`/`wcag2aa`/`wcag21`/`wcag22aa` tag set `AXE_TAGS` scans.
[`e2e/ux-01-daily-driver.spec.ts`](../../e2e/ux-01-daily-driver.spec.ts) asserts
the count directly instead.

### A read-only Sheet must be keyboard-scrollable

The Sheet's body is its only scroll container. Every sheet built before UX-01 held
focusable content (a capture form, an option list), so the container was always
reachable by keyboard. A **read-only** sheet — the keyboard reference is the first
— has no focusable content at all, so its scrollable region is unreachable
(WCAG 2.1.1; axe `scrollable-region-focusable`, serious).

Such a sheet sets `bodyFocusable` on the shared `Sheet`, which makes the body a
tab stop and names it from the sheet title. It is opt-in rather than always-on so
a form sheet does not gain a redundant tab stop before its first field.

### A full-page surface without a `PaneHeader` must publish its phone identity

The phone top bar shows the title published by `PaneHeader` or `RecordLayout` and
falls back to the workspace name otherwise, so a surface composing neither reads
"DalyHub" on a phone and offers no contextual Back. A surface with a deliberate
bespoke page shape calls `useSetMobileTopBar` (exported from `~/shared/shell`)
instead. `/help` and `/about` still do not — recorded as
[DEBT-60](../product/PRODUCT_DEBT.md).
