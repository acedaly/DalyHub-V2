# THEME_ACCEPTANCE_MATRIX.md — What was actually verified, per theme

> The acceptance record for [THEME-01](../roadmap/ROADMAP_V2.md#-theme-01--the-curated-theme-system).
>
> **This matrix records verification that happened.** Every ✅ below names the check
> that produced it — an automated assertion or a driven browser inspection — so a
> future reader can re-run it rather than trust it. A row with no evidence is marked
> ⚠️ and says what is missing. Aspirational ticks are worse than no matrix: they
> make the next person believe a surface was reviewed when it was not.

Verified at commit on branch `claude/v2-final-polish-m3pihp`, 31 July 2026.

---

## The five themes

| Theme | `data-theme` | Appearance | Role |
|---|---|---|---|
| Daly Light | `daly-light` | light | Default and universal fallback (`:root` carries this map) |
| Daly Dark | `daly-dark` | dark | The fully supported dark theme |
| Eucalypt | `eucalypt` | light | Warm stone + muted sage |
| Coastal | `coastal` | light | Cool neutrals + sea-glass blue |
| Ember | `ember` | light | Warm neutrals + terracotta |

Plus the `system` appearance mode, which resolves to Daly Light or Daly Dark.

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

## Related documents
- [`DESIGN_SYSTEM.md → Theme mapping`](DESIGN_SYSTEM.md#theme-mapping-theme-01) — the contract.
- [`ROADMAP_V2.md → THEME-01`](../roadmap/ROADMAP_V2.md#-theme-01--the-curated-theme-system) — the milestone item.
- [`ARCHITECTURE_DECISIONS.md → ADR-061`](../decisions/ARCHITECTURE_DECISIONS.md#adr-061-the-curated-theme-system--five-complete-palettes-over-one-semantic-token-set-persisted-per-owner) — why it is built this way.
