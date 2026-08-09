# End-to-end regression audit — 9 August 2026

> A full-system review of DalyHub's browser suite after ten merges in three days
> ([#133](https://github.com/acedaly/DalyHub-V2/pull/133)–[#142](https://github.com/acedaly/DalyHub-V2/pull/142)),
> and the record of what was repaired. It grades the repository by what is on
> `main`, not by what the roadmap claims.
>
> **Base commit.** `aa83b8a` (`wip: TASKS-05..08 implementation (#142)`), with
> `main` and `origin/main` both at that commit, verified.
>
> This audit exists because [DEBT-106](PRODUCT_DEBT.md) had made the E2E gate
> useless: with 36 journeys red on `main` for reasons unrelated to whatever change
> found them, no PR could say anything true about its own effect on CI. Every
> change here is either a defect the audit confirmed or a test whose assertion had
> been superseded. **Nothing was weakened to obtain green.**

---

## 1. Method

1. **Baseline first, no edits.** The complete suite was run against `aa83b8a`
   before anything changed — one process, `workers: 1`, `retries: 0`, the
   repository's own `playwright.config.ts`, no spec excluded.
2. **Every failure classified** before any of them was touched, into: product
   defect · E2E test defect · stale test (intentional product change) ·
   fixture/data defect · timing/race · environment.
3. **Shared causes fixed at the shared component**, never patched per call site
   ([AGENTS.md §24](../../AGENTS.md)). Where five failures had one cause, one
   thing changed.
4. **A stale test was never made to pass by restoring removed behaviour**, and a
   real defect was never hidden by rewriting its test. Where the two disagreed,
   the audit decided which was wrong and said so.

**The baseline.** `1402 passed · 47 failed · 87 skipped`, in one process over 2.2
hours. Every one of the 87 skips is an opt-in screenshot-capture test
(`CAPTURE_SCREENSHOTS=1`); they were skipped before this change too.

---

## 2. What the baseline found

47 failures across 25 spec files. They are not 47 problems — they are **eight
causes**, and the largest single one accounts for nine of them.

| Cause | Failures | Class |
|---|---|---|
| Page-scoped inline-field locators (TASKS-05 put the same shared fields on every task row, and the Tasks collection is what sits behind the Drawer these specs open) | 9 | Test defect |
| Today has no Assets section, and `asset-today.ts` has no consumer | 4 | **Product regression** → [DEBT-111](PRODUCT_DEBT.md) |
| A select field putting one accessible name on two nested elements | 3 | **Product a11y defect** |
| Surfaces the Today redesign replaced (greeting `h1`, no pane header, no capture widget, rows not cards) | 7 | Stale test |
| A shared section hard-coding its heading levels into an axe `heading-order` failure | 2 | **Product a11y defect** |
| RECORD-01 renames and re-homings (roll-up meter, health panel, stay-in-touch pill, collection filter group) | 7 | Stale test |
| A concealed action rail driven cold | 2 | Test defect |
| Fixtures: no `SQLITE_BUSY` retry, a `count()` raced against its own panel, an Inbox assumed empty, a seed that aged out of a bounded read, records left behind | 7 | Fixture / timing |
| Everything else (bulk selection now mode-gated, `role="switch"`, a `display:none` second brand mark, a template id the product never prints, a grid card's elevation) | 6 | Stale test |

**Three of the census's own diagnoses in [DEBT-106](PRODUCT_DEBT.md) were wrong**,
and each would have sent the next reader down the wrong path. They are corrected
in that entry rather than quietly rewritten: the roll-up progress bar was renamed,
not missing; Today's overdue cap works and the *"+n more"* link was being counted
as a task; and the "shared-Card layering problem" is the deliberately
`pointer-events: none` action rail.

**Two rows of that census are closed by the work that recorded them**, confirmed
by this run on `main`: all eight `meetings-follow-up` journeys and all five
`tasks-daily-driver` journeys pass.

---

## 3. The shared causes

### 3.1 A select field named itself twice

`SelectField` wrapped every select in `role="group"` labelled by the same element
as the combobox inside it. One field, two elements, one accessible name: a screen
reader announced *"Owner timezone group, Owner timezone combobox"*, and any query
by that name — `getByLabelText`, Playwright's `getByLabel` — matched both and
failed as ambiguous before it could touch the control.

`Field.tsx`'s own documentation already stated the correct rule: a labelled group
is for **composite** controls "that contain several interactive parts and have no
single labelable element". A single select is not one. The group is now rendered
only for the multi-select, where it genuinely wraps a chip list *and* a combobox;
`SelectSheetControl` (single by construction) drops it entirely.

This is the largest single cause in the audit: it is why `settings.spec.ts` could
not set a preference at all, and why the Settings-page half of the V2.2 default-view
work had never actually been exercised end to end.

### 3.2 A meeting item's field and its button shared one name

`MeetingFollowUp` labelled the text field *"Add action item"* and gave the submit
button `aria-label="Add action item"`. `meetings-follow-up.spec.ts` had already
worked around it in a comment — *"the field and its submit button share the
accessible name, so ask for the textbox by role"* — which is a test carrying a
product defect rather than reporting it.

The field now names the **noun** (*"New action item"*) and the button names the
**act** (*"Add action item"*). Two controls, two names.

### 3.3 Today's remainder row was counted as a task

The Today timeline caps the overdue list at three and adds a *"+n more overdue"*
row. That row was rendered with the same class as a task row, so anything counting
the day's overdue tasks counted the link that says how many were left out —
including `today.spec.ts`, which filtered on a `dh-day-row--more` modifier that
existed nowhere in the application. The cap was never broken; the row was
mislabelled. It now carries the modifier, and it is not a task row in CSS, in the
accessibility tree, or in a count.

### 3.4 Fifteen fixtures could open the database; ten could survive contention

The suite drives one dev server against one local SQLite file while its fixtures
open the same file from a separate process, so a teardown `DELETE` issued while
the server is mid-write gets `SQLITE_BUSY`. Ten specs had noticed and carried
their own copy of a retry loop. Five had not — and `ai-assistance.spec.ts` failed
the baseline on exactly that: a whole AI-acceptance journey reported red because
a cleanup statement lost a race.

Whether a fixture survived contention was decided by which file it happened to
live in. There is now ONE `e2e/d1.ts` — the retry, the transient-error rule and
the SQL literal escape in one place — and every call site goes through it. That
removed 659 lines of duplicated boilerplate.

### 3.5 A shared section hard-coded its heading levels

`LinkedItemsSection` rendered a fixed `h2` with `h3` groups. That is right on a
record's Linked TAB, where the section is a top-level region of the record, and
wrong anywhere nested: a Diary entry mounts it under an `h4` "Related", so the
outline went 4 → 2 → 3 and axe reported a **real WCAG 2.2 AA `heading-order`
failure** — on two specs, in both appearances. The section now takes a
`headingLevel`, groups always sit one below it, and the Diary panel passes the
level that fits under the heading it already renders.

### 3.6 A concealed action rail, driven cold

Two "Restore" journeys — Notes' Deleted view and People's Archived collection —
failed with *"…intercepts pointer events"*, naming the card's title in one case
and its `Archived` status chip in the other. The DEBT-106 census recorded that as
"a shared-Card layering problem". It is not.

On a hover-capable pointer a card's action rail is `opacity: 0` **and**
`pointer-events: none` until the pointer arrives over the card (UIQ-002) —
deliberately, so a click in a row's empty trailing space cannot fire an unseen
action. Playwright's visibility check ignores `opacity`, so the button reports
"visible, enabled and stable", and the hit test at its centre then returns
whatever sits under the transparent rail. Which element gets named is an
accident of layout, which is why the two failures looked like different bugs.

The V2.2 Tasks programme diagnosed this once already and fixed it with a local
helper. That helper is now `clickCardAction` in the shared helpers, with the
reasoning attached, so the next spec to meet it does not diagnose it a third
time.

### 3.7 Four specs pinned CSS structure that had moved

`.dh-health-panel` (replaced by the shared record summary band), `.dh-card` inside
Today's *My day* (replaced by plain rows), `.dh-topbar__utility` `.first()` (which
became Search when a control was added ahead of it), and the `dh-day-row--more`
class above. Each was repaired by asking for the thing by **role and accessible
name** rather than by class ([AGENTS.md §23](../../AGENTS.md)); the tooltip case is
the clearest — three tests had been hovering the wrong button and asserting the
right tooltip name, and only failed once the cluster's order changed.

A fifth, found while confirming the repairs: `visual-system.spec.ts` measured the
card plane on `.dh-card` in the Projects grid. `CardCollection` is now only ever
constructed with `presentation="list"`, and Projects, Goals and Areas all render
`EntityCard` instead — so `.dh-card-collection--grid` and `--board` govern nothing,
and `/projects` carries no `.dh-card` at all. The test now measures `.dh-ecard` and
pins the treatment `card-family.css` actually decides on ("the generated card
surface, `corner-large`, one hairline, and elevation 1") rather than the retired
grid rule's. The orphaned CSS is [DEBT-113](PRODUCT_DEBT.md).

### 3.8 The one shared switch cannot be driven by `check()`

M3-INT's `Switch` is a real `<input type="checkbox" role="switch">` whose 44px
pointer target is the `<label>` around the track; the input itself carries
`pointer-events: none` so the target is the label and not the 32px graphic. That is
correct, and it means Playwright's `check()`/`uncheck()` can never reach the input:
the hit test resolves to the label, the call retries, and the test times out on a
true statement about pointers. Two specs met it independently. `e2e/helpers.ts` now
exports `setSwitch`, which drives the control the way its other real input method
does — focus, Space — and reads the state back off the input.

### 3.9 A fixture leak only a single-process run can see

`mobile-capture-journeys.spec.ts` files real Diary entries **on today** and removed
only the Tasks it created. `diary.spec.ts` opens the workspace anchored on today and
asserts "Nothing recorded on this day"; its own cleanup reaches only titles prefixed
`Diary e2e `. CI's 18-way shard split hides this completely — the two files land in
different shards, each against a freshly seeded database — so it surfaces only in
the single-process run this audit used. The describe now removes its own entries.

---

## 4. Stale tests: what the product deliberately changed

| Superseded assertion | What the product does now | Decided by |
|---|---|---|
| Today's `h1` is `"Today"` | The `h1` is the owner's greeting; the screen has no pane header. The suite now asserts the *My day* landmark through one shared `expectOnToday` helper. | [#131](https://github.com/acedaly/DalyHub-V2/pull/131) |
| A `"Focus Quick Capture"` palette command | Retired with Today's capture widget; capture is the global `+` alone. The test now proves the command is **gone** rather than that it works. | [#131](https://github.com/acedaly/DalyHub-V2/pull/131) |
| The Project roll-up bar is named `"Roll-up progress"` | RECORD-01 folded it into the summary band, labelled `"Tasks"`. | RECORD-01 |
| Tasks' bulk bar appears on a bare checkbox click and cancels with `"Cancel"` | TASKS-06 made selection an explicit **mode**; the bar is `"Bulk task actions"` and its trailing control is `"Done"`. | [#142](https://github.com/acedaly/DalyHub-V2/pull/142) |
| Settings preferences are native `<select>`s | Every Settings select is the shared DS-06 combobox. `selectOption` had been failing before it reached the field. | DS-16 |
| An asset obligation reaches **Today** | It does not — see §5. Asserted on the Assets collection's obligation signal instead. | [#131](https://github.com/acedaly/DalyHub-V2/pull/131), unintentionally |

---

## 5. The one regression this audit did NOT fix, and why

**Today lost its Assets section.** [ADR-063](../decisions/ARCHITECTURE_DECISIONS.md)
decisions 8 and 10 and [`ASSETS_MODULE.md` §2e](../development/ASSETS_MODULE.md)
describe a Today Assets widget with a deduplication rule. The Today redesign
rebuilt the screen with a four-kind attention rail and no asset row, and
`app/kernel/assets/asset-today.ts` — the kernel module that owns the rule — now has
**no consumer at all**. Five `assets-ownership.spec.ts` journeys had been red on
`main` ever since, with no cause recorded against them in the DEBT-106 census.

Rebuilding a section of a deliberately redesigned screen is product work, not test
repair. The rail's four kinds and its five-row cap are a stated design, and adding
a fifth kind belongs to whoever owns Today. So the audit did three things instead:
asserted the obligation where the product genuinely surfaces it now, corrected the
documentation that claimed otherwise, and raised
[DEBT-111](PRODUCT_DEBT.md) with the evidence and a closing condition. Nothing was
deleted — the kernel rule, its tests and the documented design all stand, so
restoring it is a rail row and a loader call.

---

## 6. Coverage added

Focused browser coverage for behaviour that shipped in the last ten merges and had
none, chosen by risk rather than by module:

| Area | What is now proved in a browser |
|---|---|
| **Cross-module views (X-02)** | A **hidden module leaks nothing**, even when the URL names its scope explicitly: the scope says "module hidden", the view says why it contributed nothing, and no record of that type is in the results. Unhiding restores it. |
| **Owner timezone (ADR-080)** | Today, Tasks, overdue and Diary all name the **owner's** calendar day. The zone is chosen from the current UTC hour (UTC+14 or UTC−11) so the owner's day is *guaranteed* to differ from the runner's at any hour the suite runs — a test that could otherwise pass against the very bug it hunts. |
| **Note concurrency (AUDIT-08)** | A **second real browser context** as the other writer, not a `fetch`: both tabs hold the same version, one saves, the other is refused, and neither loses its words. Plus the malformed-precondition guard, from the browser, with the stored content read back to prove the write did not happen. |
| **Preference concurrency (AUDIT-07)** | Two contexts holding the same version change two different settings; both survive on both devices. |
| **CSP (AUDIT-10)** | The Tasks daily driver's **dynamic** chrome — anchored inline menus, the bulk bar, and the phone Sheet — raises no violation. The existing sweep proved pages *load* cleanly; it could say nothing about chrome that only exists once a person starts working, which is where V2.2 put most of DalyHub's newest UI. |

<!-- ADDITIONAL-COVERAGE -->

---

## 7. Verification

<!-- VERIFICATION -->

---

## 8. Related

- [DEBT-106](PRODUCT_DEBT.md) — the census this audit was raised to clear.
- [DEBT-111](PRODUCT_DEBT.md) — raised here.
- [`END_TO_END_AUDIT_2026_08_05.md`](END_TO_END_AUDIT_2026_08_05.md) — the previous
  whole-system audit, four days earlier.
