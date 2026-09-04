# MOBILE-01 — iPhone daily-driver polish (2026-08)

> **Status.** Delivered 2026-08-12.
> **Scope.** A focused polish pass over the existing product, at 320 / 375 / 390 / 430px.
> **Not in scope.** A redesign, a new information architecture, a second design
> system, a second overlay architecture, or any new product capability.

DalyHub already had a phone *platform*: the first MOBILE-01 pass (2026-07-28,
[`ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md#-mobile-01--fast-mobile-first-daily-experience))
built the bottom navigation bar, the shared `Sheet`, the keyboard inset, the
full-screen phone Drawer and the 44px target floor. The question this pass asks is
different and narrower:

> Does DalyHub feel **deliberately designed for an iPhone**, or like a desktop
> application that responds down to a narrow viewport successfully?

The answer, measured rather than felt, was **mostly the former with a small number
of real defects** — and the defects clustered, which is the useful finding. Almost
every one of them was a shared rule that had been written as an *enumerated list of
consumers* rather than as a value or a default. A list cannot be missed on purpose;
it is missed by everything written after it. So most of the fixes below move a rule
from a selector list into a token or a default, and the module code that had drifted
outside the list is pulled back in rather than patched in place.

---

## 1. How the audit was run

A headless Chromium in iPhone emulation (`isMobile`, `hasTouch`, 2× DPR, iOS Safari
user-agent, so `hover: none` / `pointer: coarse` resolve as they do on a device)
was driven over 29 routes at each of 320, 375, 390 and 430px, against the seeded
development workspace (93 Tasks, 83 Projects, 6 Goals, long-title fixtures, a
Project with 24 Tasks). For each route it recorded:

- `documentElement.scrollWidth - clientWidth` — true horizontal overflow;
- every element whose box exceeded the viewport **and was not clipped by an
  ancestor**, so an intentional ellipsis is not reported as an overflow;
- every interactive control's **effective hit area**, probed with
  `elementFromPoint` outwards from the control's centre, so a 20px glyph inside a
  44px label passes and a 20px glyph inside nothing fails;
- every text-entry control's computed `font-size` (the iOS auto-zoom trigger);
- sticky/fixed chrome heights and the offset of the first useful content.

Installed/standalone PWA behaviour is represented by the existing infrastructure:
`viewport-fit=cover` is already set, so the audit exercised the safe-area paths
through the same `env()` variables the installed app resolves, and
`e2e/pwa-offline*.spec.ts` continues to cover the offline/replay surfaces.

**Routes reviewed.** Today · Tasks (Inbox / Today / Upcoming / All active) · Task
Drawer · global Capture · Projects collection and record · Areas collection and
record · Goals collection and record · Notes collection and editor · Diary ·
Meetings collection and record · People collection and record · Assets collection
and record · Reviews collection and record · Analytics · Settings · Search ·
Help · About · empty states · form/validation states.

---

## 2. What the audit found, and what was done

Each entry states the observed problem, the widths it was observed at, the current
behaviour, and the intended fix. Measurements are from the harness above.

### 2.1 Horizontal overflow on the Project record — **P1, fixed**

| | |
|---|---|
| **Observed** | The whole page scrolled sideways. `documentElement.scrollWidth − clientWidth` = **79px at 320**, 9px at 390, 1px at 430. |
| **Viewports** | 320, 375, 390 |
| **Route** | `/projects/pr-rc-kitchen` (any task list holding a Task with a long *Waiting for* subject) |
| **Current behaviour** | A phone-narrow task row pins its metadata run with `flex: none` so the *title* absorbs the shrink rather than the date spilling over the overflow button. The narrow tiers drop the `low` and `quiet` fact tiers, but `waiting-for` is authored `high` and survived. With `flex: none` it could not compress: "Waiting for: Lodged 15 July; 20 business days quoted." forced the run to **287px inside a 320px viewport**. The fixed bottom navigation measured 399px wide, i.e. it stretched with the document. |
| **Fix** | `waiting-for` joins priority and repeat in the phone row's drop list, honouring the row's own stated contract ("CIRCLE · TITLE · DATE, and nothing else"). The fact remains on the Task record and in the row's overflow sheet. Separately, the run takes `max-inline-size: 60%`, so *no* future high-tier field can take the page wide — the row's ellipsis becomes the failure mode instead of the page. |
| **Verified** | 0px overflow at all four widths; `e2e/iphone-daily-driver.spec.ts` pins all four. |

### 2.2 Every native form control triggered iOS auto-zoom — **P1, fixed**

| | |
|---|---|
| **Observed** | Computed `font-size: 14px` on the Notes search + its five filter selects, the People search and sort, and both Reviews selects. |
| **Viewports** | All four (it is an input-mechanism property, not a width one) |
| **Current behaviour** | iOS Safari zooms the page whenever a focused field computes below 16px, and does not zoom back out — the page is left horizontally scrolled with its collection header and Save button off-screen. `forms.css` had carried an anti-zoom floor since the first MOBILE-01 pass, but as `@media (hover: none) { .dh-input, .dh-combobox__input, .dh-tags__input { … } }` — **an enumerated list of three shared classes**. Every module control written afterwards fell outside it. |
| **Fix** | The floor moved out of the selector list and into the **value**: `--app-field-font-size` / `--app-field-font-size-compact`, redefined under `@media (hover: none)` as `max(<design size>, 1rem)`. The shared native-control baseline in `base.css` — which *every* `input`/`select`/`textarea` in the product already inherits — consumes the compact token, and `.dh-input` / `.dh-tags__input` consume the other. The three-class list in `forms.css` is deleted, not extended. |
| **Verified** | No text-entry control computes below 16px on any audited route. Four routes pinned in E2E. |

### 2.3 The overflow (⋯) menu was a 208px popover on a phone — **P1, fixed**

| | |
|---|---|
| **Observed** | Opening a Tasks row's ⋯ at 390px produced a **208px-wide** anchored box floating in the middle of the list, with six actions whose rows measured 45 / 45 / **75** / 45 / 45 / **62** px — three of them wrapping onto two and three lines inside the narrow column. The page kept scrolling behind it. |
| **Viewports** | All four; worst at 320 |
| **Current behaviour** | `OverflowMenu` is the one shared secondary-action surface in the product (record headers, every card, every task row), and it was `position: absolute` with a measured flip/clamp at every width. That is right on a pointer device and is precisely the "tiny popover floating inside a 320–430px layout" the mobile rules forbid. |
| **Fix** | Below `md` the **same items**, in the same order, with the same ids and the same `role="menu"` / `role="menuitem"` semantics, render inside the existing shared `Sheet`. No second overlay architecture, no module-specific sheet, and no change to the WAI-ARIA menu-button pattern or the roving tabindex — a `menu` inside a `dialog` is valid, and keeping it is what lets one implementation serve both presentations. The trigger's `aria-haspopup` follows the presentation (`dialog` on a phone). The two behaviours that belong to the *anchored* presentation — measured placement and outside-pointer dismissal — are switched off in sheet mode; the second would otherwise have been a live defect, because the sheet is portalled to `<body>` and every tap inside it registers as "outside the trigger's container". |
| **Result** | 358px-wide rows at 56px each on a 390px phone, every action on screen, scrim + obvious Close + focus restored to the ⋯ trigger. |
| **Verified** | E2E asserts sheet presentation, row geometry, Escape + focus restoration on a phone, **and that the desktop path is still an anchored menu with no dialog introduced**. |

### 2.4 Save was off-screen on twenty-six of twenty-nine forms — **P1, fixed**

| | |
|---|---|
| **Observed** | On `/new/person` at 390×844, "Create person" sat at **y ≈ 1,160** in a 844px viewport. |
| **Viewports** | All four |
| **Current behaviour** | `FormActions` gained an opt-in `sticky` prop in the first MOBILE-01 pass, with a note warning against setting it on short forms. **Three of twenty-nine** call sites had opted in. Everywhere else — a new Person, a new Project, a new Note, Note tags, an Asset obligation, a Diary entry, a Person's contact details — committing meant dismissing the keyboard, scrolling to the end of a column, and only then reaching the button. |
| **Fix** | `sticky` becomes `boolean \| "phone"`, defaulting to `"phone"`: sticky below `md`, static above it. The treatment is keyboard-safe and bottom-navigation-safe by construction (`--app-keyboard-inset` + `--app-bottomnav-height` + `--app-safe-area-bottom`). The phone variant deliberately does **not** inherit the always-on variant's negative inline margin — that margin is written for one known container, and applied blind to twenty-six unknown ones it would have been a horizontal-overflow defect rather than a full bleed. The two `FormActions` that already live inside a `Sheet` footer opt out explicitly. |
| **Verified** | "Create person" is inside the first viewport with no scrolling; desktop `position` is still `static`. |

### 2.5 Today's completion circle had a 20×20 hit area — **P1, fixed**

| | |
|---|---|
| **Observed** | Effective hit area **20×20px** on `.dh-day-row` completion circles. The same control on `/tasks` measured 45×45. |
| **Viewports** | All four |
| **Current behaviour** | The shared 44px hit area is a `label.dh-check-circle-target` wrapping the 20px input, and it pulls its own padding back out of the row's rhythm. The Tasks collection and the Project tasks tab both use it. Today's Focus rows rendered the bare `input`. So the single most-used control in the product, on the surface a phone opens first, was a fifth of the target area of the identical control one screen away. |
| **Fix** | Today's rows wrap the circle in the shared label. The circle is still 20px; only the target changed, and no row grew. |

### 2.6 A row's "open" link was a 20–22px strip inside a 45px row — **fixed**

| | |
|---|---|
| **Observed** | `.dh-card__open` measured 22px tall and `.dh-day-row__title` 20px tall inside 45px rows, on `/tasks`, `/` and every Project record. |
| **Viewports** | All four |
| **Current behaviour** | A row has two actions — complete it, and open it. The circle got its hit area in the first pass; the title link never did, so under half the row a thumb aims at actually opened anything, and a miss landed on inert padding, which reads as an unresponsive list rather than as a missed target. |
| **Fix** | Symmetric block padding up to the target floor, given back as negative margin, under `@media (hover: none)` only. Padding rather than an absolutely positioned overlay **because both links sit inside an ancestor with `overflow: hidden`** — that clip is what draws their ellipsis, and hit testing respects it, so an overlay would have looked right and done nothing. No list grew by a pixel; a pointer device is unchanged. |

### 2.7 The Diary week hid two of its seven days — **fixed**

| | |
|---|---|
| **Observed** | **Five of seven** days on screen at 390 and **six of seven** at 320; the rest scrolled out of an inner track with no affordance saying so. Visible days measured **26–36px wide** against a 45px floor. |
| **Viewports** | 320, 375, 390 |
| **Current behaviour** | The phone rule put the arrows, the seven days, the date picker and "Today" on one row and let the day track scroll. The arithmetic is not available: seven 45px days plus those controls need 372px of a 358px content box at 390, and of 288px at 320. |
| **Fix** | The row splits, using `display: contents` on the existing bar so its children join the week's own flex line: the arrows move onto the **control line that already existed**, and the seven days take a full line of their own at equal width. |
| **Result** | 7/7 days visible at every width, all equal width, 48px tall: **51px at 390**, 57 at 430, 41 at 320. First content offset unchanged at y=377 — the split cost no vertical space. |
| **Residual, stated** | 41px at 320 is short of the 45px floor. Seven equal targets in a 288px content box cannot each be 45px; this is the same arithmetic the phone navigation bar already records for itself at deep zoom. It is 58% larger than what the strip drew before, and the same day is reachable from the full-size date picker beside it. |

### 2.8 A record tab rendered as one letter — **fixed**

| | |
|---|---|
| **Observed** | The Meeting record's tab strip read `Notebook Details Follow-up AI Activity S ⋯` at 390px. A two-character tab ("AI") measured **27×45**. |
| **Viewports** | All four |
| **Fix** | Two changes, both small. Tabs take `min-inline-size: var(--app-touch-target-min)` on the inline axis only, so a short label gets a target and a long one is untouched. And the strip's scroll is *said* rather than implied, with the classic pure-CSS scroll shadow (two cover layers that travel with the content, two shadow layers pinned to the box), so the cue appears only on the side that has more to show and disappears when the strip fits. Nothing was ever unreachable — every surplus tab is in the More menu — it just did not look scrollable. |

### 2.9 Today's empty prose rendered as three columns — **fixed**

| | |
|---|---|
| **Observed** | "No measurable Goals yet. Add a target to a **Goal** and your progress shows up here." rendered at 390px as three side-by-side columns, each wrapping internally, so the visible reading order was `No measurable Goals yet. Add a target to a` · `Goal` · `and your progress` / `shows up here.` |
| **Viewports** | All four |
| **Current behaviour** | `.dh-today__quiet` is a flex container, which is right for its two glyph uses ("All clear" beside a tick) and wrong for its two prose uses: a sentence containing an inline link is three flex items. A previous pass had noticed the *symptom* at 240px and patched it with `flex-wrap` under `@media (max-width: 15rem)`. |
| **Fix** | The prose uses take a `--prose` modifier that is `display: block`. The glyph uses keep the flex line. |

### 2.10 The phone quick-add introduced itself with a broken sentence — **fixed**

| | |
|---|---|
| **Observed** | `Add a task to Inbox — press Enter` cut mid-word to `Add a task to Inbox — press` at 390px; at 320 with a real Project name the *destination* was lost too. |
| **Fix** | The phone placeholder keeps the half that carries meaning — where the task will land — and drops the keystroke hint, because there is no Enter key to teach. The visible "Add" button beside it says how to commit. The accessible name is unchanged at every width. |

### 2.11 Goal cards were mostly air — **fixed**

| | |
|---|---|
| **Observed** | 188px for an unmeasured Goal and 272px for a measured one at 390px, of which ~80px was gap and padding; the identity mark was a 64px tile, the largest object on the screen. Fewer than two Goals visible under 297px of collection chrome. |
| **Fix** | At phone widths the card takes the design system's own compact rungs (`--app-card-padding-compact`, `space-3` gaps) and the mark steps down to the same rung the Project card already takes at that width — because "Projects and Areas are distinct" is a rule about what a card *says*, never about how large its glyph is. Nothing is removed: mark, title, context, reading, bar and state line all remain. |

### 2.12 Safe areas were correct but written fifty-three times — **fixed (hygiene)**

`env(safe-area-inset-*)` was respected, but by **53 declarations across 11
stylesheets** (14 of them in `drawer.css`, 10 in `shell.css`, 8 in `sheet.css`),
some with the `0px` fallback and some without — and the bare form resolves to
*nothing* rather than to zero inside `calc()`, which voids the whole expression on
a browser without the variable. Four tokens (`--app-safe-area-{top,right,bottom,left}`)
now state it once, always as a length, and every consumer was migrated. No rule may
write a raw `env(safe-area-inset-*)` again, and none may write a device pixel value
for a notch or a home indicator.

---

## 2b. Visual evidence

`assets/mobile-01-iphone-2026-08/`, at 390px unless the name says otherwise.
Deliberately a small curated set, not a route dump: the pass photographs what it
**materially changed**, plus the two surfaces whose non-change is a claim the
document makes.

The captures were taken during the pass and were not committed to the repository.
The filenames are kept so the opt-in spec's output can be matched against them, and
the last column records what each pair showed, with the §2 entry that holds the
measurements.

| Surface | Before | After | What the pair showed |
|---|---|---|---|
| A task row's ⋯ menu (the complex sheet) | `before-overflow-menu-390.png` | `after-overflow-sheet-390.png` · dark: `after-overflow-sheet-390-dark.png` | §2.3 — a 208px anchored popover with wrapping rows floating mid-list, then the same six actions as full-width 56px sheet rows behind a scrim, in both appearances |
| Diary | `before-diary-390.png` | `after-diary-390.png` | §2.7 — five of seven days visible in a scrolling strip, then all seven on their own line at equal width |
| Goals collection | `before-goals-collection-390.png` | `after-goals-collection-390.png` | §2.11 — 188–272px cards that were mostly padding and a 64px mark, then compact rungs with the mark at the Project card's size |
| Project record | `before-project-record-390.png` | `after-project-record-390.png` · 320: `after-project-record-320.png` | §2.1 — the page scrolled sideways behind a stretched bottom bar, then 0px overflow, the 320 capture confirming the tightest width |
| Tasks | `before-tasks-390.png` | `after-tasks-390.png` | §2.6, §2.10 — the same 45px rows; the quick-add placeholder no longer cut mid-word |
| A form's commitment row | — (Save sat at y≈1,160) | `after-form-sticky-commitment-390.png` | §2.4 — the commitment row pinned inside the first viewport, above the bottom navigation |
| Today *(deliberate non-change)* | `before-today-390.png` | `after-today-390.png` | §3 — header, glance cards and Focus panel at the same positions before and after; only the completion circle's hit area grew (§2.5) |
| Note editor *(deliberate non-change)* | `before-note-editor-390.png` | `after-note-editor-390.png` | §3 — the editor and its toolbar identical before and after |
| Goal record | `before-goal-record-390.png` | `after-goal-record-390.png` | §2.8 — the record tab strip with the per-tab target floor and scroll-shadow cue |
| Task Drawer | — | `after-task-drawer-390.png` | the full-screen phone Drawer with its commitment row reachable (§2.4) |

The "before" images were taken against the pre-change build at 2× device pixel
ratio during the audit; the "after" set is re-capturable at any time with

```
CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/iphone-daily-driver-screenshots.spec.ts
```

which is opt-in and is never collected by an ordinary run.

---

## 3. Deliberate non-changes

These were audited, measured, and left alone. Recording them matters as much as
recording the fixes: the brief's own rule is that something differing from desktop
is not thereby a defect.

| Surface | Measurement | Why it was not changed |
|---|---|---|
| **Today's header and glance cards** | Top bar 64px, page padding 16, header 56, gap 16, stat row 80, gap 16 → **Focus panel at y=248** of 844, first task row at y=320. | This is already a strong mobile home screen: the greeting has stepped down a type rung, the stat cards are 80px, and the day begins in the first third of the viewport. Compacting further would have spent shared-component churn to recover ~16px. The information architecture and the TODAY-10 Focus contract (Overdue · Due today · Planned today) are untouched. |
| **The central bottom-bar Capture action** | — | It works, it is the product-wide capture entry point, and no evidence contradicted it. No floating action button was reintroduced. |
| **Swipe and long-press on task rows** | — | They remain accelerators, never requirements: every action they reach is also in the row's overflow sheet and on the record. |
| **The Tasks one-line row** | 45px rows, CIRCLE · TITLE · DATE | Not converted to a card stack. The row's trailing signal, its ellipsis and its priority semantics are unchanged. |
| **The Notes editor toolbar** | 7 always-visible controls + Read toggle, ~54px | Already a reasonable share of the viewport with secondary formatting behind the existing More mechanism. No editor was invented. |
| **A record's title appearing in both the phone top bar and the record header** | ~64px of duplication per record | Real, and *not* fixed here. Collapsing it means a scroll-linked title — a behaviour change to the shared shell, not a polish. Recorded as debt (§6). |
| **Goal progress arithmetic, Task recurrence, Area semantics** | — | Untouched, as required. No forecasting, no new measurement model, no new metric anywhere. |
| **Native `<select>` at phone widths** | — | Left native. It opens the platform picker (a sheet by any other name), keeps native keyboard behaviour, and submits without JavaScript. Replacing it would have been a new picker, not a polish. |

---

## 4. Shared primitives changed

Everything in this pass that is not a two-line module fix is a change to a shared
rule, which is the point:

| Primitive | Change | Consumers migrated |
|---|---|---|
| `tokens.css` | **New**: `--app-safe-area-{top,right,bottom,left}` | 53 declarations across 11 stylesheets |
| `tokens.css` | **New**: `--app-field-font-size`, `--app-field-font-size-compact`, with a `1rem` touch floor | `base.css` native-control baseline, `.dh-input`, `.dh-tags__input`; the three-class list in `forms.css` deleted |
| `tokens.css` | **New**: `--app-surface-current` — what a sticky child paints over, declared by the container rather than guessed from an ancestor list | `:root` (page), `.dh-card`, `.drawer__body`, `.dh-inspector__body`; consumed by the phone commitment row and the tab strip's scroll covers |
| `OverflowMenu` | Phone presentation is the shared `Sheet` | Every ⋯ in the product |
| `FormActions` | `sticky` defaults to `"phone"` | 26 forms gained a reachable commitment row |
| `.dh-check-circle-target` | — (existing) | Today's Focus rows now use it |
| `record-tab` | Inline target floor + scroll-shadow affordance | Every record tab strip |
| `.dh-gcard` | Phone density rungs, matching `.dh-pcard` | Goals collection |

No new design system, no CSS framework, no `--dh-*` revival, no device-model
breakpoint, and no module-specific sheet.

---

## 5. Viewport acceptance

| Width | Horizontal overflow | Undersized effective targets | Sub-16px text entry |
|---|---|---|---|
| 320 | none on any audited route | Diary day cells at 41px (stated residual, §2.7) | none |
| 375 | none | none | none |
| 390 | none | none | none |
| 430 | none | none | none |

Both appearances and all five colour schemes are unaffected by construction: every
change is spacing, sizing, layout or a token that carries no colour, and
`pnpm run scheme:check` plus `test/unit/tokens` (246 assertions, including WCAG
contrast in both appearances over all five generated schemes) pass unchanged.

---

## 5b. Perceived performance — what was measured

The brief's rule is "do not optimise by intuition", so nothing here was optimised
on a hunch and nothing was optimised that the numbers did not ask for. Measured on
the **production build** (`pnpm run build` + `vite preview`, not the dev server —
see the note below), iPhone emulation at 390×844, warm-up discarded:

| Interaction | p50 | p95 | Budget ([AGENTS.md §16](../../AGENTS.md#16-performance-expectations)) |
|---|---|---|---|
| Overflow **sheet** open → painted (the interaction this pass changed) | 56.5ms | 59.4ms | <100ms ✅ |
| Overflow **anchored menu** open → painted (desktop, for comparison) | 29.1ms | 29.8ms | <100ms ✅ |
| Complete a Task from Today → repaint | 18.0ms | 26.0ms | <100ms ✅ |
| Today → Tasks, client navigation | 389ms | 435ms | <200ms ❌ |
| Task Drawer open → surface present | 372ms | 658ms | <200ms ❌ |

Three things follow, and only one of them is this pass's business.

**The sheet costs ~27ms more than the anchored menu, and that is the real number.**
It buys the portal, the focus trap, the background inerting and the scroll lock —
the machinery that makes it a modal rather than a floating box — and it lands
comfortably inside the interaction budget. It is also not a *new* cost to the
product: Quick Capture, the collection sheet and the navigation sheet have all been
paying it since the first MOBILE-01 pass. One more surface now shares one
implementation, which is the point.

**Measure the built application, not the dev server.** The same sheet measures
**181ms p50** under `react-router dev` — three times the production figure, and
over the budget. Every number in this table was taken twice for that reason. A
performance claim made against an unminified, HMR-instrumented bundle is not a
claim about the product.

**The two figures over budget are pre-existing and were not touched.** Both are
dominated by a server round-trip for the route's data, not by rendering, and
nothing in this pass changed routing, loading or any query. Making them faster
means caching or prefetching, which is exactly what
[§22 of the brief](../roadmap/ROADMAP_V2_2.md) rules out adding speculatively
inside a polish pass. They are recorded as debt below with their measurements
rather than half-addressed here.

---

## 6. Remaining mobile debt

Recorded, not fixed, and deliberately **not** turned into features:

1. **A record's title is printed twice on a phone** — once in the sticky top bar
   and once as the record's `h1`, costing ~64px on every record. The fix is a
   scroll-linked top-bar title (the title appears in the bar once the `h1` leaves
   the viewport), which is a behaviour change to the shared shell and deserves its
   own item with its own tests.
2. **The Goals collection carries two stacked segmented rows** — lifecycle
   (Active / Deleted) and status (All / On track / Needs attention) — putting the
   first Goal card at y=297 on a 390px phone. Tasks solves the equivalent problem
   by moving secondary dimensions into the shared collection sheet; Goals should,
   but that is a change to which filters are primary, not a layout tightening.
3. **41px Diary day cells at 320px** (§2.7), bounded by arithmetic.
4. **The Diary offers "New Diary entry" twice on an empty day** — once in the
   toolbar and once inside the empty state. Harmless, but it is the duplicated
   primary action the density rules discourage.
5. **Route transition and Drawer-open latency exceed the 200ms navigation
   budget** on a phone — 389ms and 372ms at p50 on the production build (§5b).
   Both are server round-trip bound rather than render bound, so the answer is a
   loading/prefetch change, which is a deliberate piece of work with its own
   risk profile and not something to slip into a polish pass.

---

## 7. Related documents

- [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) — the shared patterns, including safe
  areas, the touch target floor and the sheet contract.
- [`ACCESSIBILITY_RESPONSIVE.md`](../development/ACCESSIBILITY_RESPONSIVE.md) — the
  responsive matrix and the accessibility baseline this pass sits on.
- [`ROADMAP_V2_2.md`](../roadmap/ROADMAP_V2_2.md) — the delivered item.
- `e2e/iphone-daily-driver.spec.ts` — the regressions above, pinned.
