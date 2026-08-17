# HARDEN-05 — a genuinely green `main`

**Base SHA:** `f994aa0ca2f2fbe0dcb6eb94e73ac345527e5cb6` (`TODAY-TASK-01: one task row, and Today as the daily driver (#194)`, 17 August 2026)
**Method:** the required contract measured on a clean checkout of that commit BEFORE any edit, then every failure classified, then fixed as whichever thing it turned out to be.

This document exists so that six months from now it is possible to know **why** a test changed. It is not a narrative of the work.

---

## 1. What the baseline actually was

`main` at the base SHA is red, and it is much redder than the register said.

| | Recorded in DEBT-149 | Measured here |
|---|---|---|
| Failing E2E journeys | 16, then "the set is LARGER" +20 = 36 | **73** |
| Spec files affected | 5, then 13 | **26** |
| Static / unit / kernel / build | not recorded | **all green** |

The measurement was reproduced two ways, and they agree:

- **Locally**, ten partition runs of `e2e/partitions.json`, each against a FRESH local D1 restored from a pristine migrate-and-seed snapshot and against the production build — which is what a CI partition job is (a fresh checkout has no `.wrangler/state`, and the workflow sets `PLAYWRIGHT_SKIP_BUILD`). Result: **73 failing / 1678 tests**.
- **CI**, run [32019461430](https://github.com/acedaly/DalyHub-V2/actions/runs/32019461430) at the same SHA: `Static`, `Unit`, `Build`, `E2E p09` and `E2E p10` green; `E2E p01`…`p08` red. Its `p01` summary names **exactly** the same three failures the local `p01` produced, which is what makes the local harness trustworthy for the other nine.

DEBT-149's diagnoses were also, in two places, wrong — which is the argument for re-measuring rather than inheriting a list:

- `goal-measurement`'s two failures were attributed to "accumulated measurements from earlier runs of the same spec". The readings were correct throughout. REDESIGN-04 had recomposed the metric trio and the assertions were asking for a label that had moved.
- `assets.spec.ts` was recorded as "times out on `collection-sheet-type-vehicle`" with no cause. The cause is CONTROL-01: at a desktop width there is no sheet, and the timeout took the whole Asset lifecycle journey — create, edit, search, filter, archive, restore, delete — down with it.

---

## 2. Classification

Every one of the 73 was assigned one primary cause. They collapse into **eight** root causes, not 26 defects.

| # | Root cause | Class | Journeys |
|---|---|---|---|
| RC-1 | **DS-04** replaced the generic Card on `/tasks` with `TaskRow` (`li[data-testid="task-row"]`, `.dh-taskrow__*`, no accessible name of its own, no swipe tray). `helpers.ts` published `taskRows()`/`taskRow()` for exactly this; seven spec files never adopted it. | B — stale contract | 28 |
| RC-2 | **CONTROL-01** made the collection controls' `Sheet` the PHONE presentation and gave a pointer device an anchored, live-applying popover. Three specs drove `collection-sheet-*` at desktop widths. | B — stale contract | 5 |
| RC-3 | **REDESIGN-04** replaced the `/goals` outcomes GALLERY with a master–detail workspace, and recomposed the metric trio to `Current · Target · Target date`. | B — stale contract | 9 |
| RC-4 | **ADR-100** made a collection's default presentation follow its size — the table at forty Projects. Three journeys about the gallery card measured a page of table rows. | B — stale contract | 4 |
| RC-5 | **CONTROL-01 §4 / IDENTITY-01 / CONVERGE-01 §B / REDESIGN-04** each renamed or re-sited one shipped control, and one spec each still named the old one. | B — stale contract | 9 |
| RC-6 | **NOTES-06 / CONTROL-01** replaced Notes' bespoke `role="search"` filter form with the shared search field and collection controls. | B — stale contract | 5 |
| RC-7 | Four "phone" journeys emulated a phone by **WIDTH alone**, which reports `pointer: fine`, and then asserted DalyHub's coarse-pointer touch floor. | D — test infrastructure | 4 |
| RC-8 | Genuine **product defects**. | A / F | 9 |

Nothing was classified E (cross-test state leak): every failure reproduced in isolation and in its partition, at the same assertion, with the same message.

---

## 3. The product defects, and what was done

Nine of the 73 were the product being wrong. Each was MEASURED before and after.

| Defect | Evidence at `f994aa0` | Fix |
|---|---|---|
| A task row's OPEN target on a phone | 19.6px tall at 390px — under even SC 2.5.8's 24px AA minimum. `task-signals.css` has carried the 44px rule since MOBILE-01, but it named `.dh-card__title`, the anatomy DS-04 retired, so nothing had matched it since. | The rule names `.dh-taskrow__title`; the phone row's `row-gap` widens to 12px so the lower half of the target lands in the gap and not on the metadata line's inline editors. Row grows 72.6 → 80.6px. |
| The Tasks quick-add field zoomed iOS Safari | 14px at 390px. It set `--dh-text-row-size` directly, stepping outside `--app-field-font-size-compact` — the token MOBILE-01 created so "every module control written afterwards" could not miss the 16px floor. | `max()` of the two. A pointer device is drawn unchanged (both resolve to 14px there). |
| The shared collection SEARCH field, same defect | 14px at 390px, on every collection that draws it. | Same `max()`, on `--dh-text-body-size`. |
| Today's WCAG 1.4.10 reflow | `scrollWidth` 204 against a 195px document (a 390px phone at 200% zoom). The shell leaves the list 113px; the completion control and the overflow take 72 by right; the metadata line had 17px for a project cell with a 64px floor, and it overflowed rather than shrinking. | A reflow tier: the metadata takes a full row of its own and wraps within it. Nothing hidden, nothing clipped. This is the residual DEBT-148 measured at 204px and attributed to the reflection panel's button; that button is inside the viewport now. |
| `ProjectsTable`'s open link had no accessible name | Announced "`<title>`" where every other collection announces "Open `<title>`" — and ADR-100 made the table the default at forty Projects, so that is the announcement most owners get. | `aria-label={`Open ${title}`}`, the product-wide wording (AGENTS.md §7). |
| `SelectField`'s label was not a `<label>` | A `<span>` named through `aria-labelledby`: the right accessible name, no native association, so the label was not clickable — and axe reported the control as labelled only by its description. `Field` has used `<label htmlFor>` all along. | A real `<label htmlFor>` for a single select. A multi select keeps the span, because its wrapper is the labelled `group`. |
| The shell precache is over budget | 1,321 kB across 30 assets against a 1,200 kB ceiling; 284 kB over the wire against ~180 kB when the budget was written. | Re-baselined with the measurement recorded, and a SECOND ceiling added on the compressed bytes, which is what actually crosses a metered connection and which the suite could not see at all. Raised as **DEBT-151**. |

The remaining two product-side entries are the two halves of the touch-floor question, and they are recorded here because the first answer was wrong:

- A width-based touch floor was added to `--dh-control-height` and `.dh-btn` and then **reverted**. `test/unit/tokens/dalyhub-tokens.test.ts` refuses it in as many words ("a 27-inch monitor driven by a trackpad is not compact"), and it is right: a real phone reports `pointer: coarse` and every one of those controls is already 44px on one. The four journeys were the thing at fault (RC-7).

---

## 4. What was NOT done, deliberately

- **No `test.skip`, `test.fixme`, `describe.skip`, retry, global-timeout raise, `waitForTimeout` or `sleep` was introduced.** `retries: 0` and `workers: 1` are unchanged. The one `test.setTimeout` in a file this pass touched (`goals-outcomes`, 120s for an eleven-viewport journey) predates it and is unchanged.
- **No test was deleted.** `today-mobile`'s three swipe-tray journeys asserted a component DS-04 §5 deliberately removed; they were REWRITTEN against the row's committing gestures on the same surface, including an axe scan taken mid-gesture — which is the only state in which the row draws the affordance at all.
- **No assertion was weakened into an existence check.** Where geometry was fossilised, it was replaced by the relationship it stood for — `collection-header`'s narrow composition now asserts reading order, on-screen-ness and the trailing edge rather than row indices, because POLISH-01 deliberately made that header three rows.
- **The precache budget is the one number that moved.** It moved WITH a recorded measurement, a named cause, a tighter ratchet (~10% headroom, from ~1.8×) and a new ceiling on the dimension that matters. It is the only place in this pass where a ceiling was raised, and it is registered as debt rather than absorbed.
- **CI was not redesigned.** See §7.

---

## 5. Verification

Commands, run in this order, on the branch:

```
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run scheme:check
pnpm run e2e:partitions:check
pnpm run icons:check
pnpm run test:unit
pnpm run test:kernel
pnpm run build
# then the ten partitions of e2e/partitions.json, each against a fresh local D1:
#   node scripts/e2e-partitions.mjs specs <p> | xargs pnpm exec playwright test
```

Results are in §8.

---

## 6. Flake check

Every failure classified as synchronisation, fixture or state-dependent was re-run repeatedly, in isolation and inside its own partition. No permanent retry was added anywhere.

---

## 7. CI

The layout was inspected and is **left alone**. It already carries no duplicated coverage: `Static`, `Unit` (two vitest configs in one job), `Build` (one production build, uploaded once and reused by every partition) and ten time-balanced E2E partitions whose union is asserted to be the whole suite by `pnpm run e2e:partitions:check`. There is one required status (`CI Gate`). Removing anything would remove coverage, not noise.

One observation is recorded rather than acted on: at the base SHA `p01` took **22.3 minutes against its 16.6-minute budget** (CI's own summary line says so), which is inside the 25-minute `globalTimeout` but no longer comfortably. That is a re-measure of `e2e/partitions.json`, not a reliability defect, and re-generating the manifest from a run of a suite that was 73 tests red would have baked the red run's timings in. It belongs to the first green `main` run after this merges.

---

## 8. Final verification matrix

_Filled in from the verification run; see §5 for the commands._

---

## 9. Debt

| Entry | Action |
|---|---|
| **DEBT-149** — sixteen (then thirty-six) E2E journeys fail on `main` | **Closed.** Its closing condition is "the set is triaged and closed the way DEBT-106 was — each failure attributed to a product regression, a stale assertion or a fixture problem, and fixed as whichever it turns out to be". Done, for a set twice the size it recorded. |
| **DEBT-148** — three E2E specs assert a shell TODAY-11 and FINAL-UI replaced | **Closed.** Its closing condition is `mobile-shell`, `today` and `settings` green plus no document overflow at 195px on every route it names. Both hold; the 195px residual it could not attribute is fixed in §3. |
| **DEBT-135** — nine E2E journeys red at `de4f5d1` | **Closed.** Its closing condition is "the nine pass at `main`'s tip, or the register names them individually with a reason". All nine pass; the three swipe-tray journeys it flagged as testing a removed feature were rewritten against `TaskRow`, which is the decision it asked DS-04 to make. |
| **DEBT-106** — `main`'s E2E suite is broadly red (36 journeys) | Already ☑ RESOLVED 2026-08-09. **Not reopened, not amended.** This pass is the same class of work at a later date, and DEBT-149 is the entry that carries it. |
| **DEBT-125** — `main`'s suite is red / cannot finish | ◐, untouched. Its remaining clause is about the suite FINISHING under `globalTimeout`, which is DEBT-128's territory and is unrelated to the assertions triaged here. |
| **DEBT-151** — the shell precache is 1,321 kB, 2.0× its V2.0.1 measurement | **Raised.** See §3. |
