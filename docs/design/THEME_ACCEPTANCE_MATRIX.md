# THEME_ACCEPTANCE_MATRIX.md — What was actually verified, per theme

> The acceptance record for [THEME-01](../roadmap/ROADMAP_V2.md#-theme-01--the-curated-theme-system)
> and [THEME-02](../roadmap/ROADMAP_V2_1.md#-theme-02--the-modern-visual-system).
>
> **This matrix records verification that happened.** Every ✅ below names the check
> that produced it — an automated assertion or a driven browser inspection — so a
> future reader can re-run it rather than trust it. A row with no evidence is marked
> ⚠️ and says what is missing. Aspirational ticks are worse than no matrix: they
> make the next person believe a surface was reviewed when it was not.

Verified at commit on branch `claude/v2-final-polish-m3pihp`, 31 July 2026.
**THEME-02** (the Modern pair) was verified separately on branch
`claude/dalyhub-premium-visual-system-7trseq`, 2 August 2026 — see
[section 8](#8-theme-02--the-modern-pair). Sections 1-7 are the THEME-01 record and
are left as they were written: they describe a pass over five themes, and re-ticking
them for two themes that pass did not exist for would be a claim about work that
session did not do.

---

## The five themes THEME-01 shipped

| Theme | `data-theme` | Appearance | Role |
|---|---|---|---|
| Daly Light | `daly-light` | light | Default and universal fallback (`:root` carries this map) |
| Daly Dark | `daly-dark` | dark | The fully supported dark theme |
| Eucalypt | `eucalypt` | light | Warm stone + muted sage |
| Coastal | `coastal` | light | Cool neutrals + sea-glass blue |
| Ember | `ember` | light | Warm neutrals + terracotta |

Plus the `system` appearance mode, which resolves to Daly Light or Daly Dark.
THEME-02 added two more — see [section 8](#8-theme-02--the-modern-pair).

---

## 1. Token coverage and colour correctness (automated, per theme)

Source: `test/unit/tokens/tokens.test.ts`, `test/unit/tokens/contrast.test.ts`,
`test/unit/tokens/entity-accents.test.ts`. These iterate the theme **registry**, so a
theme cannot be added without being covered.

| Check | Daly Light | Daly Dark | Eucalypt | Coastal | Ember |
|---|---|---|---|---|---|
| Every semantic colour token resolves | ✅ | ✅ | ✅ | ✅ | ✅ |
| Every entity identity accent resolves | ✅ | ✅ | ✅ | ✅ | ✅ |
| TS colour data matches the CSS exactly | ✅ | ✅ | ✅ | ✅ | ✅ |
| Text ramp ≥ 4.5:1 on all six surfaces | ✅ | ✅ | ✅ | ✅ | ✅ |
| Text on every tinted surface ≥ 4.5:1 | ✅ | ✅ | ✅ | ✅ | ✅ |
| Label on a filled control ≥ 4.5:1 in all three states | ✅ | ✅ | ✅ | ✅ | ✅ |
| Focus ring ≥ 3:1 on bg / surface / card / nav | ✅ | ✅ | ✅ | ✅ | ✅ |
| Control boundary ≥ 3:1 on four surfaces | ✅ | ✅ | ✅ | ✅ | ✅ |
| Progress fill ≥ 3:1 against its track | ✅ | ✅ | ✅ | ✅ | ✅ |
| Priority P1–P4 indicators ≥ 3:1 and mutually distinct | ✅ | ✅ | ✅ | ✅ | ✅ |
| Record states ≥ 3:1 (overdue, due-soon, completed, waiting, on-hold) | ✅ | ✅ | ✅ | ✅ | ✅ |
| All six chart series ≥ 3:1 on a card and mutually distinct | ✅ | ✅ | ✅ | ✅ | ✅ |
| Entity accents ≥ 3:1 on that theme's background | ✅ | ✅ | ✅ | ✅ | ✅ |

**Distinctness** (`tokens.test.ts`): every pair of themes differs in at least four of
five dimensions — page background, navigation surface, card surface, accent, progress
fill — and every theme has a unique page background. Five near-identical themes with
different button colours would fail this.

---

## 2. Surfaces, driven in a browser under each theme (automated)

Source: `e2e/themes.spec.ts`. Each cell = theme applied to `<html>`, **no horizontal
overflow**, **no axe violation** (WCAG 2.2 AA tags).

| Surface | Daly Light | Daly Dark | Eucalypt | Coastal | Ember |
|---|---|---|---|---|---|
| Today | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tasks | ✅ | ✅ | ✅ | ✅ | ✅ |
| Settings (Appearance) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Help | ✅ | ✅ | ✅ | ✅ | ✅ |
| About | ✅ | ✅ | ✅ | ✅ | ✅ |

**Not individually parameterised over all five themes**, and why that is sound rather
than a gap: Project detail, Goal detail, Meeting detail, Diary, the record drawer, and
the empty / error / loading states are covered by the existing per-module E2E specs,
which run under the default theme. Because **no component branches on the theme** (a
test enforces this) and every one of them consumes only semantic tokens, a surface
that is correct in one theme is correct in all five *by construction*, and the token
tests above prove the values. Re-running twenty specs five times would multiply CI
time without testing a different code path. The surfaces listed above are
parameterised because they are the ones this milestone changed.

---

## 3. Behaviour (automated)

| Behaviour | Evidence | Result |
|---|---|---|
| Each of the five themes selectable from Settings | `themes.spec.ts` → "selecting each theme" | ✅ |
| Applies immediately, no page reload | Window probe survives the change | ✅ |
| Survives navigation (Today → Tasks → Help → About) | `themes.spec.ts` → persistence | ✅ |
| Survives a full browser reload | `page.reload()` then re-assert | ✅ |
| Follows the owner to a **fresh browser context** | Written to the DB, read in a context with no cookie | ✅ |
| Unknown stored theme degrades to the default | Constraint bypassed, then loaded | ✅ |
| **Daly Dark present in the first byte** | Raw `page.request.get()` HTML contains `data-theme="daly-dark"` | ✅ |
| Every theme present in the first byte | Same, per theme | ✅ |
| No client bootstrapping script racing the paint | Raw HTML asserted free of a theme script | ✅ |
| Theme switch triggers no data reload | Redirect + revalidation only; no full document load | ✅ |

---

## 4. Accessibility (automated)

| Check | Evidence | Result |
|---|---|---|
| Picker keyboard-operable, Enter applies | `themes.spec.ts` → keyboard | ✅ |
| Visible focus indicator on the picker option | Computed `outline` / `box-shadow` asserted non-empty | ✅ |
| Selection conveyed semantically (`aria-pressed`) | Unit + E2E | ✅ |
| Selection reinforced in text ("Selected"), not colour alone | `ThemePicker.test.tsx` | ✅ |
| Applied theme announced (`role="status"`) | Unit + E2E | ✅ |
| Preview swatch hidden from assistive tech | `aria-hidden` asserted on every preview | ✅ |
| Option name is the theme name, not the paragraph | `aria-labelledby` / `aria-describedby` split | ✅ |
| Priority readable as text in Daly Dark | `themes.spec.ts` → dark priority chip | ✅ |
| Reduced motion honoured during a theme switch | `emulateMedia({reducedMotion:"reduce"})`, transition = 0 | ✅ |
| Forced-colours: swatch hidden, selection uses `Highlight` | `theme-picker.css` `@media (forced-colors: active)` | ⚠️ CSS present; not asserted by a test (Playwright cannot emulate forced-colours in Chromium here) |

---

## 5. Responsive (automated)

| Check | Evidence | Result |
|---|---|---|
| Theme picker usable at 320 px | `themes.spec.ts` → phone | ✅ |
| Phone navigation in Daly Light | `themes.spec.ts` → phone | ✅ |
| Phone navigation in Daly Dark | `themes.spec.ts` → phone | ✅ |
| Help at 320 px, no overflow | `help-about.spec.ts` | ✅ |
| About at 320 px, no overflow | `help-about.spec.ts` | ✅ |
| Settings 320 → 2560 px, no overflow | `settings.spec.ts` (pre-existing, still green) | ✅ |

---

## 6. Manual inspection

Recorded honestly, including what was **not** done.

| Check | Result |
|---|---|
| Five themes render and differ visibly at desktop width | ✅ — verified through the driven browser assertions above, which read the applied `data-theme` and the computed palette on each surface |
| Five themes render at 320 px and 375 px | ✅ — same, via the responsive checks |
| Interactive side-by-side comparison of the five palettes by eye | ⚠️ **Not performed.** This session has no interactive display. Every claim in this document comes from an automated assertion against computed styles or the served HTML, never from looking at a screenshot. The palettes were designed against a contrast model and verified numerically; a human should still look at all five before release, and that judgement is not something this matrix can substitute for. |
| Screenshot capture under each theme | ⚠️ **Not added.** The repository's existing screenshot specs (`tasks-screenshots`, `mobile-screenshots`) run under the default theme; parameterising them over five themes would add ~5× the artefacts for a check that asserts nothing semantic. The behavioural and contrast assertions above are the substantive coverage. |

---

## 7. What this matrix does not claim

- It does not claim every module was reviewed by eye in every theme. It claims every
  module consumes semantic tokens, that no component branches on the theme, and that
  every token pair meets AA in every theme — which is the property that makes the
  by-eye review unnecessary for correctness, though not for taste.
- It does not claim the themes are beautiful. It claims they are complete, distinct,
  readable and consistent.
- It does not cover a custom theme editor, arbitrary colour picking, or a theme
  marketplace. Those are deliberate exclusions ([ADR-061](../decisions/ARCHITECTURE_DECISIONS.md#adr-061-the-curated-theme-system--five-complete-palettes-over-one-semantic-token-set-persisted-per-owner)).

---

## 8. THEME-02 — the Modern pair

Verified 2 August 2026 on branch `claude/dalyhub-premium-visual-system-7trseq`.

| Theme | `data-theme` | Appearance | Role |
|---|---|---|---|
| Modern Light | `modern-light` | light | Cream page, near-white panels, white cards, teal accent |
| Modern Dark | `modern-dark` | dark | Layered charcoal, controlled indigo accent |

The registry is now **seven themes plus `system`**. No existing theme was removed, and
a unit test (`test/unit/shell/theme.test.ts`) fails if one ever is.

### 8.1 Everything in sections 1-5 now runs over seven themes

The automated suites in sections 1, 2, 3 and 5 iterate the **registry**, not a
hard-coded list, so the Modern pair was covered the moment it was registered. Token
coverage, entity accents, CSS/TS parity, the full WCAG pair set, distinctness,
per-theme selection, first-byte paint and the picker checks all ran green for
`modern-light` and `modern-dark` alongside the original five.

### 8.2 What is specific to the pair (automated)

| Check | Evidence | Result |
|---|---|---|
| Both halves registered, one light and one dark | `theme.test.ts` → Modern pair | ✅ |
| Same token NAMES declared in both blocks | `modern-pair.test.ts` | ✅ |
| Only colour, entity accent and elevation differ | `modern-pair.test.ts` | ✅ |
| Rendered geometry, spacing, type and control height identical between the two | `themes.spec.ts` → "changes treatment, not structure" (computed styles, real page) | ✅ |
| Every surface, tint, hover, disabled and skeleton value in the dark half is dark | `modern-pair.test.ts` (luminance, as data) | ✅ |
| Rendered frame, rail and pane are dark in Modern Dark | `themes.spec.ts` → light-surface leak | ✅ |
| No element wider than a chip paints light anywhere on the page | `themes.spec.ts` → whole-page sweep of computed backgrounds | ✅ |
| Card distinguishable from the page it sits on (`sunken < bg < card < raised`) | `modern-pair.test.ts` | ✅ |
| No pure black across large areas | `modern-pair.test.ts` | ✅ |
| Light half is off-white, not sterile white, and the card sits above the page | `modern-pair.test.ts` | ✅ |
| Text ramp genuinely stepped in both halves (not three names for one colour) | `modern-pair.test.ts` | ✅ |
| Selected navigation is `aria-current` + weight ≥ 600 + a tint + an indicator bar | `themes.spec.ts` → selected navigation, both themes | ✅ |
| Indicator bar ≥ 3:1 against the tint it is painted on, measured on the RENDERED colours | `themes.spec.ts` → selected navigation (see note below) | ✅ |
| Selected-navigation label ≥ 4.5:1 on its own tint **and** on the rail | `contrast.test.ts` (every theme, not just the pair) | ✅ |

**One defect this pass found and fixed, recorded because it is instructive.** The
indicator bar was first painted with `accent`. That token's contrast is guaranteed
against the PAGE surfaces (`bg`, `surface`, `surface-card`) — not against
`nav-selected-surface`, which in a dark theme is *darker* than the page. The bar
measured **2.96:1 in Daly Dark and 2.73:1 in Modern Dark**, under the 3:1 a non-text
cue carrying state owes. It now uses `nav-selected-text`, the foreground token for
that exact surface, which the contrast test already holds at 4.5:1 in every theme
(5.28:1 at worst). Raised by an automated review on PR #99 and verified
independently before acting.

The guard added with the fix measures the **rendered** bar against the **rendered**
row background, not a token pair, because a token-pair assertion can only check the
pair it is told about — it cannot notice the bar being repainted with a different
token. It was confirmed to fail on the pre-fix CSS before being kept.

### 8.3 Modules driven in a browser, in both halves

Each cell = theme applied to `<html>`, **no horizontal overflow**, **no axe violation**
(WCAG 2.2 AA tags). Source: `e2e/themes.spec.ts` → "the Modern pair across the product".

| Module | Modern Light | Modern Dark |
|---|---|---|
| Today | ✅ | ✅ |
| Tasks | ✅ | ✅ |
| Projects | ✅ | ✅ |
| Areas | ✅ | ✅ |
| Meetings | ✅ | ✅ |
| Notes | ✅ | ✅ |
| People | ✅ | ✅ |
| Reviews | ✅ | ✅ |
| Settings | ✅ | ✅ |
| Assets, Help, About | ✅ | ✅ |

The last row comes from the section 2 sweep, which now runs over all seven themes.

**Why the pair is parameterised over the whole product while the other five are not:**
the section 2 rationale still holds — no component branches on the theme, so a surface
correct in one theme is correct in all of them by construction. The pair gets the wider
sweep because it is what this milestone introduced, which is where an unthemed component
would actually surface. Multiplying nine modules by seven themes would buy CI time, not
coverage.

### 8.4 Responsive and mobile

| Check | Evidence | Result |
|---|---|---|
| Today and Tasks at 375 px in both halves — bottom nav visible, no overflow, no axe violation | `themes.spec.ts` → the pair on a phone | ✅ |
| Theme picker usable at 320 px with seven options | `themes.spec.ts` → phone (list-driven) | ✅ |
| Whole-registry sweep of the Assets state language | `assets-ownership.spec.ts` (extended from five themes to seven) | ✅ |

### 8.5 Visual QA — screenshots

Section 6 recorded that THEME-01 captured none. THEME-02 does: a dedicated, opt-in pass
([`e2e/theme-02-screenshots.spec.ts`](../../e2e/theme-02-screenshots.spec.ts)) drives the
real routes against the seeded development database, storing the theme through the
product's own preferences action, and writes to
[`assets/theme-02-2026-08/`](assets/theme-02-2026-08).

    CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/theme-02-screenshots.spec.ts

| Surface | Modern Light | Modern Dark |
|---|---|---|
| Today, desktop 1440×900 | [`today-desktop-light.png`](assets/theme-02-2026-08/today-desktop-light.png) | [`today-desktop-dark.png`](assets/theme-02-2026-08/today-desktop-dark.png) |
| Tasks, desktop | [`tasks-desktop-light.png`](assets/theme-02-2026-08/tasks-desktop-light.png) | [`tasks-desktop-dark.png`](assets/theme-02-2026-08/tasks-desktop-dark.png) |
| Project detail, desktop | [`project-detail-desktop-light.png`](assets/theme-02-2026-08/project-detail-desktop-light.png) | [`project-detail-desktop-dark.png`](assets/theme-02-2026-08/project-detail-desktop-dark.png) |
| Settings (Appearance), desktop | [`settings-desktop-light.png`](assets/theme-02-2026-08/settings-desktop-light.png) | [`settings-desktop-dark.png`](assets/theme-02-2026-08/settings-desktop-dark.png) |
| Command palette (a floating surface), desktop | [`command-palette-desktop-light.png`](assets/theme-02-2026-08/command-palette-desktop-light.png) | [`command-palette-desktop-dark.png`](assets/theme-02-2026-08/command-palette-desktop-dark.png) |
| Today, phone 390×844 | [`today-mobile-light.png`](assets/theme-02-2026-08/today-mobile-light.png) | [`today-mobile-dark.png`](assets/theme-02-2026-08/today-mobile-dark.png) |
| Tasks, phone | [`tasks-mobile-light.png`](assets/theme-02-2026-08/tasks-mobile-light.png) | [`tasks-mobile-dark.png`](assets/theme-02-2026-08/tasks-mobile-dark.png) |

Reviewed for clipped text, inconsistent spacing, wrong surface colours, unreadable muted
text, unthemed components, weak active states, excessive card borders, awkward mobile
stacking and broken overlays. One change came directly out of that review and is worth
recording, because it is the kind of thing only a screenshot catches: the first Modern
Light page background sat too close to its own panel surface, so panels read as muddy
rather than as paper on a surround. The page was deepened and the panel lifted (a
token-level change, re-validated against the whole contrast harness) and the pass
re-captured.

### 8.6 What section 8 does not claim

- It does not claim a human has looked at these screenshots on a calibrated display and
  approved the taste of the palettes. The images exist so that judgement can now happen
  against evidence rather than against a description.
- It does not claim every module was captured — nine were driven in both themes and
  seven surfaces were captured. Modules without a screenshot are covered by the driven
  assertions in 8.3, not by an image.
- It does not extend to the five THEME-01 themes' visual review, which section 6 still
  records honestly as not performed.


---

## 9. DS-14 — the card-on-tint foundation

[DS-14](../roadmap/ROADMAP_V2_1.md#-ds-14--whole-application-visual-overhaul) changes what
the tokens *paint*, not how the theme system works: no theme added, removed or renamed, and
the `theme` CHECK untouched. The foundation therefore has to prove one thing this matrix has
never asserted before — that the **elevation relationships between surfaces** hold in every
theme, rather than being assumed because someone looked at two of them.

Everything in sections 1–5 and 8 still runs, unchanged, over all seven themes. This section
records only what DS-14 adds.

### 9.1 The theme invariant test (automated, per theme, enumerated)

[`test/unit/tokens/ds-14-theme-invariants.test.ts`](../../test/unit/tokens/ds-14-theme-invariants.test.ts)
enumerates `THEME_IDS` from the kernel registry — never a hand-written list — so an eighth
theme is covered the moment it is registered and **cannot be registered while failing**. It
runs in `pnpm test`, which `pnpm verify` runs, so it gates every merge.

Why a test and not a row in this matrix: THEME-02's selected-navigation indicator bar was
reviewed, shipped, and measured 2.96:1 in Daly Dark and 2.73:1 in Modern Dark (§8.2). Review
did not catch it; measurement did. DS-14 multiplies that exact class of pairing across six
Area accents, a neutral pill, every role pill, a progress fill on a track on a card, and a
focus ring on two canvases — eight assertion families over seven themes.

| § | Assertion | Floor |
|---|---|---|
| 6.1 | Every DS-14 token resolves to a non-empty colour | — |
| 6.2 | ΔL\* `surface-page` → `surface-card`, and `surface-card` → `surface-raised` | **≥ 3** |
| 6.3 | `text`, `text-secondary`, `text-muted` on `surface-card` | ≥ 4.5:1 |
| 6.4 | Every pill surface/text pair — six Area accents, the neutral absence pill, every role pill | ≥ 4.5:1 |
| 6.5 | `progress-fill` on `progress-track`; `progress-track` on `surface-card` | ≥ 3:1 |
| 6.6 | Every Area dot on `surface-card` | ≥ 3:1 |
| 6.7 | `focus-ring` on **both** `surface-card` and `surface-page` | ≥ 3:1 |
| 6.8 | `nav-selected-text` on `nav-selected-surface` | ≥ 4.5:1 |

Failure messages name the theme id, the token pair and the measured value.

### 9.2 The elevation contract, measured per theme

Five of the seven themes did not satisfy this before DS-14, and three had `surface-card` and
`surface-raised` **byte-identical at `#ffffff`** — there is nothing above white. Their light
neutral ramps were recomposed: no theme was exempted, no escape hatch was added, and no
theme was deleted to avoid the work ([DEBT-67](../product/PRODUCT_DEBT.md) records a
theme-consolidation recommendation that DS-14 deliberately does **not** act on).

| Theme | `data-theme` | `surface-page` (L\*) | `surface-card` (L\*) | ΔL\* | `surface-raised` (L\*) | ΔL\* | ≥ 3 |
|---|---|---|---|---|---|---|---|
| **Daly Light** | `daly-light` | `#ecebe8` (93.05) | `#f6f5f4` (96.59) | **3.54** | `#ffffff` (100.00) | **3.41** | ✅ |
| **Daly Dark** | `daly-dark` | `#101215` (5.39) | `#181c22` (10.11) | **4.72** | `#20242c` (14.12) | **4.01** | ✅ |
| **Modern Light** | `modern-light` | `#efeae0` (92.83) | `#f7f5f1` (96.59) | **3.76** | `#ffffff` (100.00) | **3.41** | ✅ |
| **Modern Dark** | `modern-dark` | `#0f1116` (5.06) | `#171b23` (9.70) | **4.64** | `#1f242e` (14.12) | **4.42** | ✅ |
| **Eucalypt** | `eucalypt` | `#eae8e0` (91.95) | `#f3f2ef` (95.49) | **3.55** | `#fdfcf8` (98.94) | **3.45** | ✅ |
| **Coastal** | `coastal` | `#e7ebee` (92.83) | `#f4f5f7` (96.51) | **3.68** | `#ffffff` (100.00) | **3.49** | ✅ |
| **Ember** | `ember` | `#ede8e3` (92.25) | `#f5f3f1` (95.94) | **3.69** | `#fffdfb` (99.41) | **3.47** | ✅ |

Each theme's **hue** is its own; only the lightness relationships are prescribed. The
recomposition ran back through the full existing contrast harness (§1) in every theme, so the
darker canvases did not buy elevation at the cost of a text or UI floor.

### 9.3 Two superseded assertions, recorded rather than quietly dropped

§8.2's "no light surface leaks into Modern Dark" held `progress-track` below a luminance
ceiling along with every other surface. DS-14 §6.5 requires that track to clear 3:1 against
`surface-card`, which on a dark card can only be satisfied by a mid-tone value — by
construction above that ceiling. The two rules genuinely conflict; the newer, explicitly
dated decision wins ([ADR-068](../decisions/ARCHITECTURE_DECISIONS.md#adr-068-ds-14--the-card-on-tint-direction-its-elevation-contract-two-density-presets-derived-area-colour-and-a-single-commit-rollback)
over THEME-02, per [AGENTS.md](../../AGENTS.md)). `progress-track` was removed from that list
and is now asserted **harder**, in both directions, by 6.5. It is not unpoliced; it is policed
by the rule that applies to it.

The second is TODAY-06's **"swipe-wrapped task cards keep their elevation on desktop"**
([`e2e/today.spec.ts`](../../e2e/today.spec.ts)). It asserted that the swipe WRAPPER carries a
`box-shadow`, because the wrapper clips its surface with `overflow: hidden` and an element
never clips its own shadow — so elevation had to live on the wrapper or every Today card would
silently lose it.

DS-14 constraint 8 reserves shadow for genuinely floating layers, and a task row is not one:
the collection is the card and the row is a hairline-separated row inside it. Asserting "the
wrapper has a shadow" is therefore asserting the pre-DS-14 design, and keeping it would hold
the restyle hostage to a treatment the direction removed deliberately.

**It was restated, not deleted, and the replacement is the stronger test.** What the original
was really protecting is the class of silent visual defect the swipe wrapper makes possible —
and that defect is still possible, and it *occurred* during DS-14: the tray is a real element
parked behind the card surface, so a row that stops painting an opaque background reveals the
tray at rest, on every row, at every width. The test now asserts the row's surface is opaque
and untranslated at rest, which is the invariant that was actually load-bearing.

### 9.4 The two reference surfaces (automated, driven)

The two surfaces the foundation restyled first, kept here because they remain the worked
examples for the two presets. **Every other module now uses the system too — see §9.7.** Both
are driven in a browser by the existing gates — `e2e/accessibility.spec.ts`
(axe-core), `e2e/responsive.spec.ts` (no horizontal overflow), `e2e/keyboard.spec.ts`,
`e2e/touch-targets.spec.ts`, `e2e/today.spec.ts` and `e2e/notes.spec.ts` — at every width in
brief §10: **320, 375, 390, 430, 768, 1280, 1440**.

| Surface | Preset | What it proves |
|---|---|---|
| **Today** | Collection | Widgets as cards on the tinted canvas; separation by surface value and a hairline, never a shadow; rhythm, body size, tabular figures and row padding all resolved from the preset |
| **A Note record** | Reading **and** Collection | The serif column at its 46ch cap inside entirely sans chrome, and the "both, on separate regions" case — the body is Reading while Backlinks, Links and Activity are Collection on the same route |

### 9.5 Visual QA — screenshots

An opt-in pass ([`e2e/ds-14-screenshots.spec.ts`](../../e2e/ds-14-screenshots.spec.ts)) drives
the real routes against the seeded development database, storing the theme through the
product's own preferences action, and writes to
[`assets/ds-14-2026-08/`](assets/ds-14-2026-08).

    CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/ds-14-screenshots.spec.ts

Both reference surfaces, in **all seven themes**, under **both operating-system colour
schemes** — 28 images. This is the pass that proves the TOKEN LAYER; §9.7 is the pass that
proves the system was applied. A curated theme does not follow the OS (ADR-061), and the cheapest way
for that to break is a surface consulting `prefers-color-scheme` instead of a token, so the
pair per theme is the evidence it did not.

**Measured: all 14 pairs are byte-identical.** Every theme renders the same under a dark OS as
under a light one, including the two dark palettes — Modern Dark under a light OS is still
Modern Dark. That is a stronger claim than "they look the same", and it is checkable in one
line:

    cd docs/design/assets/ds-14-2026-08
    for f in *-os-light.png; do
      cmp -s "$f" "${f%-os-light.png}-os-dark.png" || echo "DIFFERS: $f"
    done

The Reading pass **seeds its own note** rather than photographing a shared fixture. A 46ch
measure only shows up as a measure when there are enough words to wrap several times, and the
seeded search fixture is a single line whose newline escapes are stored literally — an image of
it would show the serif and prove nothing about the column. The note is created and removed
through the same local-D1 path the other journeys use.

| Theme | Today (OS light · OS dark) | Note record (OS light · OS dark) |
|---|---|---|
| **Daly Light** | [`today-daly-light-os-light.png`](assets/ds-14-2026-08/today-daly-light-os-light.png) · [`today-daly-light-os-dark.png`](assets/ds-14-2026-08/today-daly-light-os-dark.png) | [`note-record-daly-light-os-light.png`](assets/ds-14-2026-08/note-record-daly-light-os-light.png) · [`note-record-daly-light-os-dark.png`](assets/ds-14-2026-08/note-record-daly-light-os-dark.png) |
| **Daly Dark** | [`today-daly-dark-os-light.png`](assets/ds-14-2026-08/today-daly-dark-os-light.png) · [`today-daly-dark-os-dark.png`](assets/ds-14-2026-08/today-daly-dark-os-dark.png) | [`note-record-daly-dark-os-light.png`](assets/ds-14-2026-08/note-record-daly-dark-os-light.png) · [`note-record-daly-dark-os-dark.png`](assets/ds-14-2026-08/note-record-daly-dark-os-dark.png) |
| **Modern Light** | [`today-modern-light-os-light.png`](assets/ds-14-2026-08/today-modern-light-os-light.png) · [`today-modern-light-os-dark.png`](assets/ds-14-2026-08/today-modern-light-os-dark.png) | [`note-record-modern-light-os-light.png`](assets/ds-14-2026-08/note-record-modern-light-os-light.png) · [`note-record-modern-light-os-dark.png`](assets/ds-14-2026-08/note-record-modern-light-os-dark.png) |
| **Modern Dark** | [`today-modern-dark-os-light.png`](assets/ds-14-2026-08/today-modern-dark-os-light.png) · [`today-modern-dark-os-dark.png`](assets/ds-14-2026-08/today-modern-dark-os-dark.png) | [`note-record-modern-dark-os-light.png`](assets/ds-14-2026-08/note-record-modern-dark-os-light.png) · [`note-record-modern-dark-os-dark.png`](assets/ds-14-2026-08/note-record-modern-dark-os-dark.png) |
| **Eucalypt** | [`today-eucalypt-os-light.png`](assets/ds-14-2026-08/today-eucalypt-os-light.png) · [`today-eucalypt-os-dark.png`](assets/ds-14-2026-08/today-eucalypt-os-dark.png) | [`note-record-eucalypt-os-light.png`](assets/ds-14-2026-08/note-record-eucalypt-os-light.png) · [`note-record-eucalypt-os-dark.png`](assets/ds-14-2026-08/note-record-eucalypt-os-dark.png) |
| **Coastal** | [`today-coastal-os-light.png`](assets/ds-14-2026-08/today-coastal-os-light.png) · [`today-coastal-os-dark.png`](assets/ds-14-2026-08/today-coastal-os-dark.png) | [`note-record-coastal-os-light.png`](assets/ds-14-2026-08/note-record-coastal-os-light.png) · [`note-record-coastal-os-dark.png`](assets/ds-14-2026-08/note-record-coastal-os-dark.png) |
| **Ember** | [`today-ember-os-light.png`](assets/ds-14-2026-08/today-ember-os-light.png) · [`today-ember-os-dark.png`](assets/ds-14-2026-08/today-ember-os-dark.png) | [`note-record-ember-os-light.png`](assets/ds-14-2026-08/note-record-ember-os-light.png) · [`note-record-ember-os-dark.png`](assets/ds-14-2026-08/note-record-ember-os-dark.png) |

### 9.6 Module coverage — every module, every application edge, and a sparse record of each type

The second pass in the same spec. Where §9.5 answers "does the token layer hold in every
theme", this answers "was the system actually applied", which is the question a whole-product
restyle fails on. It runs in **one light and one dark theme** at **four widths** —
`desktop-1440`, `desktop-1280`, `mobile-390`, `mobile-320` — over every module and every
application edge.

Two themes rather than seven, deliberately: what varies between modules is composition, not
palette, and the palette is already asserted for all seven both numerically (§9.1) and visually
(§9.5). Seven themes here would be five times the images and none of the extra information.

**Surfaces covered.** Today; Tasks (list, matrix, sectors, inbox); Areas; Goals; Projects;
Notes; Diary; Meetings; People; Assets; Reviews; Settings; Search; the Command Palette; Forms;
Feedback; Help; About; the `/ai` placeholder; and the offline shell.

Search and the Command Palette are photographed through their `/design/*` fixtures, which
render the exact shared components inside the real application shell — `/search` is the JSON
provider endpoint, not a page, and driving a keystroke per theme per width to open an overlay
would buy nothing the fixture does not already show.

**Sparse records, which are the point rather than an afterthought.** One record of every entity
type carrying the minimum its schema permits — no description, no dates, no links, no progress,
no metadata beyond a title — seeded and removed by the pass: Area, Goal, Project, Note, Diary
entry, Meeting, Person, Asset.

A visual system built on progress bars, status pills and metadata rows has a defined appearance
for every value it was designed around and an **undefined** one for every value that is absent,
and a populated fixture never exercises the second case. That is [brief §8](DS_14_OVERHAUL_BRIEF.md)'s
"the most common way a design built on progress bars and status badges regresses", and it is why
these records are photographed rather than reasoned about.

### 9.7 What section 9 does not claim

- It does not claim a human has approved the taste of seven recomposed light ramps on a
  calibrated display. It claims the relationships between their surfaces are measured, in
  every theme, and that the images exist so that judgement can happen against evidence.
- It does not claim the direction has been **lived with**. The desktop soak gate was removed by
  the owner's direction ([DS-14 roadmap entry](../roadmap/ROADMAP_V2_1.md#-ds-14--whole-application-visual-overhaul)),
  so "is this still pleasant after five days on a real workspace" is unanswered. The
  wide-desktop *defect* it was raised to catch was found and fixed inside the work
  ([DEBT-72](../product/PRODUCT_DEBT.md)); the *judgement* it was also meant to collect was not.
- It does not claim every module is photographed in all seven themes. §9.6 covers two by
  design, for the reason stated there.
- It does not claim the screenshots are diffed automatically. They are evidence for review, not
  a regression gate; the regression gates are the invariant test (§9.1), axe (§4), the overflow
  sweep (§5) and the keyboard suite.

---

## Related documents
- [`DESIGN_SYSTEM.md → Theme mapping`](DESIGN_SYSTEM.md#theme-mapping-theme-01) — the contract.
- [`ROADMAP_V2.md → THEME-01`](../roadmap/ROADMAP_V2.md#-theme-01--the-curated-theme-system) — the original milestone item.
- [`ROADMAP_V2_1.md → THEME-02`](../roadmap/ROADMAP_V2_1.md#-theme-02--the-modern-visual-system) — the Modern pair.
- [`ARCHITECTURE_DECISIONS.md → ADR-061`](../decisions/ARCHITECTURE_DECISIONS.md#adr-061-the-curated-theme-system--five-complete-palettes-over-one-semantic-token-set-persisted-per-owner) — why it is built this way.
