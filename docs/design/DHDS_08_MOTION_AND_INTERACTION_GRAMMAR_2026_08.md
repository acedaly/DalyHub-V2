# DHDS-08 — Motion and interaction grammar

**Status:** implemented. Branch `ui/dhds-08-motion-interaction-grammar`.
**Date:** August 2026.
**Extends:** [`DHDS_01_WORK_PACKAGE.md`](DHDS_01_WORK_PACKAGE.md) — it does not
replace the direction DHDS-01 through DHDS-07 established.

---

## 1. Philosophy

> **Motion explains what changed, where something came from, where it went, or
> what currently has focus. Motion is never decoration for its own sake.**

DalyHub is a calm, premium personal operating system. Its interface is mostly
quiet, and expression is reserved for useful moments. A user should mostly stop
noticing the animation itself and instead perceive that the product is
exceptionally well made.

The references are Things, Todoist, Craft and Apple productivity software. They
are not playful consumer apps, animated marketing sites, stock Material motion,
spring-heavy interfaces, or dashboards whose widgets are always moving.

The interaction posture DHDS-01 set is unchanged and motion serves it:

```
scan → understand → act
```

not

```
open → inspect → configure → save → close
```

### What DHDS-08 found

The repository was in better shape than a greenfield motion pass would assume:
`--dh-motion-*` and `--dh-ease-*` already existed and most transitions already
named them. The problem was one level up.

**The vocabulary was degenerate.** `--dh-motion-instant` and `--dh-motion-fast`
were both `120ms`. All four "different" easing curves resolved to the same
`cubic-bezier(0.2, 0.8, 0.2, 1)`. There was no exit rung at all.

A vocabulary whose words are synonyms cannot express the distinctions its
components need — so every component that wanted a real difference invented one
privately. That is exactly the drift a semantic layer exists to prevent, and it
is what the audit found: **twenty-five `@keyframes` across the product**, among
them six separate ways to fade a scrim in and four near-identical ways to rise a
panel.

---

## 2. The motion hierarchy

Four levels. Every animation in DalyHub belongs to exactly one, and the level
decides the rung.

### Level 0 — no motion

Ordinary text updates, data corrections, continuous autosave, background
refreshes, routine metadata updates, and dense information that would become
distracting. **Not everything deserves animation**, and `motion.css` deliberately
publishes no class for any of it.

### Level 1 — interaction feedback · `--dh-motion-instant` (90ms)

Hover, press, focus, selected state, checkbox state, toggle state, button
response. Owned by the components themselves (`ui.css`, `task-signals.css`),
because what changes is a colour on a specific control.

### Level 2 — contextual reveal · `--dh-motion-fast` (150ms) / `--dh-motion-base` (200ms)

Menus, popovers, tooltips, inline editors, disclosure regions, contextual action
reveal, toasts, short sheets. These visually relate to the control or region that
caused them.

### Level 3 — meaningful structural transition · `--dh-motion-deliberate` (260ms)

Completing a task, opening or closing contextual depth, a disclosure opening, the
next Today task taking the Now position. Used sparingly; these communicate
continuity.

---

## 3. Semantic durations

Authored once, in [`app/styles/tokens.css`](../../app/styles/tokens.css).

| Token | Value | What it is FOR |
|---|---|---|
| `--dh-motion-none` | `0ms` | The reduced-motion resolution; the deliberate-static rung |
| `--dh-motion-instant` | `90ms` | Level 1 — hover, press, focus, checked, selected |
| `--dh-motion-fast` | `150ms` | Level 2 — a menu, a tooltip, a caret, a row affordance |
| `--dh-motion-base` | `200ms` | The standard interface transition; panels, scrims, sheets |
| `--dh-motion-deliberate` | `260ms` | Level 3 — meaningful structural movement. **The ceiling** |
| `--dh-motion-exit` | `140ms` | Leaving. Shorter than the entrance it reverses |

Two **periods**, deliberately outside the ramp, because a loop's rhythm is a
different quantity from a transition's length:

| Token | Value | What it is FOR |
|---|---|---|
| `--dh-motion-spinner` | `900ms` | The in-flight spinner's rotation |
| `--dh-motion-shimmer` | `1200ms` | The skeleton shimmer's sweep |

Three **distances**, so the travel is as governed as the timing:

| Token | Value | What it is FOR |
|---|---|---|
| `--dh-motion-travel` | `4px` | An anchored surface — menu, popover, tooltip, hover card |
| `--dh-motion-travel-modal` | `8px` | A centred modal, which has no trigger to appear at |
| `--dh-motion-scale` | `0.98` | The scale an anchored surface enters from |

And two **contextual** machinery properties each edge-anchored host sets for
itself — `--app-motion-edge-from` and `--app-motion-edge-fade`. They carry the
`--app-` prefix precisely because hosts override them: the `--dh-` layer is
closed (defined in `tokens.css` and nowhere else, asserted by test), and a role
every panel redefines locally is machinery rather than vocabulary.

### The layer aliases; it does not author

`AGENTS.md` §9: *"nothing in the layer is authored (every value is a `var()` onto
an existing token)"*. Every role in the tables above is a `var()` alias; the
authored numbers live in an `--app-motion-*` machinery block beside the
contextual pair.

They are `--app-` rather than `--md-sys-` because the prefix table means what it
says — `--app-` owns "structural values M3 does not own", and M3 genuinely does
not own these: its ramp contains no 90ms, no 140ms and no 260ms, and its curve
set contains no `cubic-bezier(0.3, 0, 0, 1)`. Pinning DalyHub's five rungs to
positions in M3's twelve-rung ramp would make the vocabulary M3's again by the
back door, which is the thing DHDS-08 exists to undo. Three of the four curves
happen to coincide with an M3 curve to the digit; they are still authored here,
because the agreement is a coincidence of good taste rather than a dependency.

**This was caught in review.** The first version of DHDS-08 replaced the old
(degenerate) aliases with literal durations and curves, putting a second source
of truth for motion values inside the public vocabulary. Two tests now ratchet
it: every motion role must *declare* a `var()` onto `--app-` or `--md-`, and
every one must *resolve* to a real authored value.

### Why five rungs and not the M3 ramp

M3 publishes twelve durations from 50ms to 600ms. Twelve rungs is not a
vocabulary, it is a number line: an author picks the one that feels right and
the product ends up with eleven different opening speeds. Five, each with one
job, is a vocabulary — and the whole of it lives inside 90–260ms, because past
roughly 300ms an interface stops feeling responsive and starts feeling like it is
performing.

**Retired:** `--ease`, `--dur-hover`, `--dur-complete`, `--dur-panel`,
`--dur-progress`. They were the pre-semantic vocabulary; two parallel motion
vocabularies is the second design system the direction forbids.

---

## 4. Easing grammar

| Token | Curve | Meaning |
|---|---|---|
| `--dh-ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | A value changing in place |
| `--dh-ease-enter` | `cubic-bezier(0.05, 0.7, 0.1, 1)` | An object arriving; decelerates into rest |
| `--dh-ease-exit` | `cubic-bezier(0.3, 0, 0.8, 0.15)` | An object leaving; accelerates away |
| `--dh-ease-emphasized` | `cubic-bezier(0.3, 0, 0, 1)` | Structural movement that must read as deliberate |

**No spring, no overshoot, no bounce anywhere.** A cubic-bezier overshoots when a
control point's Y leaves `[0, 1]`; a test asserts that none of the four does. An
interface that wobbles is one asking to be watched, and DalyHub's job is to be
looked *through*.

**Leaving is faster than arriving**, everywhere: exits run at `--dh-motion-exit`
(140ms) against entrances of `--dh-motion-base` (200ms), on `--dh-ease-exit`
rather than `--dh-ease-enter`. An object going away should be gone slightly
before you finish thinking about it; the alternative reads as a surface reluctant
to leave.

---

## 5. The shared motion layer

[`app/styles/motion.css`](../../app/styles/motion.css), imported directly after
`base.css` so every component stylesheet can adjust a shared motion without
`!important`.

`tokens.css` publishes the **vocabulary**; `motion.css` publishes the
**grammar** — the handful of named behaviours the whole product animates with, so
a surface adopts a motion by naming it rather than authoring a keyframe.

### Canonical keyframes

| Keyframe pair | For |
|---|---|
| `dh-fade-in` / `dh-fade-out` | A scrim, a crossfade, a value appearing in place |
| `dh-reveal-in` / `dh-reveal-out` | An anchored surface — menu, popover, tooltip, hover card |
| `dh-lift-in` / `dh-lift-out` | A centred modal — dialog, command palette, search |
| `dh-edge-inline-in` / `-out` | An edge-anchored panel on the inline axis |
| `dh-edge-block-in` / `-out` | The same on the block axis — a bottom sheet, a toast |
| `dh-spin` | The one in-flight spinner |
| `dh-shimmer` | The one skeleton sweep |

### Classes a surface adopts

`.dh-motion-scrim` · `.dh-motion-reveal` · `.dh-motion-lift` ·
`.dh-motion-edge-inline` · `.dh-motion-edge-block` · `.dh-action-reveal` ·
`.dh-disclosure` + `.dh-disclosure-marker` · `.dh-complete-strike` +
`.dh-complete-recede` · `.dh-motion-succeed`.

Every exit is driven by `data-dh-exit="true"` placed on the element while React
keeps it mounted for exactly `--dh-motion-exit`.

### Keyframe count: 25 → 3

Only three `@keyframes` remain outside the motion layer, each documented at its
rule and asserted by test:

| Where | Why it is legitimate |
|---|---|
| `sheet.css` — `dh-sheet-dialog-in` / `-out` | At tablet width the sheet is a centred dialog whose **resting transform is itself** `translate(-50%, -50%)`. A shared keyframe animating `translateY` would discard the centring. The alternative is a wrapper element around every sheet purely so a shared class has an untransformed box |
| `offline.css` — `dh-offline-stalled-reveal` | Not motion: a `visibility` flip on an 8s delay, used as a **timer** for the "this page never hydrated" notice |

---

## 6. Reduced-motion contract

`base.css` zeroes every `transition-duration` and `animation-duration` under
`prefers-reduced-motion: reduce`. That global rule is the **floor**, and on its
own it is not the contract: zeroing a keyframe whose `from` is `opacity: 0` is
fine, but zeroing one whose `from` is a `translate` makes the displacement
instantaneous rather than absent, and a `forwards`-filled exit can strand an
element invisible.

So `motion.css` states the contract positively. Reduced motion in DalyHub is
**not "the same choreography, faster"**:

- **structural sliding is REMOVED, not accelerated** — a panel does not travel
  at all, it is simply there;
- transforms that exist only to add physicality are removed outright;
- **opacity is KEPT**, because a near-instant fade is how a surface still reads
  as arriving rather than teleporting — and because removing it is what would
  leave an exiting element stuck at `opacity: 0`;
- every state a motion communicated is still communicated.

The travelling grammars have their keyframe swapped for `dh-fade-in` /
`dh-fade-out`, so an exiting surface is filled to a state that actually describes
a fade.

**Verified in a real engine** (`e2e/motion.spec.ts`): completion still visibly
completes, panels still clearly open with no displacement, disclosures still show
their state, and no transition anywhere has a duration.

JavaScript honours it too. `usePresence` and `useLeavingRecords` skip the exit
hold entirely under reduced motion, because **the wait is real even when the
motion is not**.

---

## 7. Completion behaviour

Task completion happens constantly, so it gets the most care — and the least
theatre.

**The sequence:**

1. the control responds — `task-signals.css`, instant, already painted;
2. the title and metadata recede — `.dh-complete-recede`, `--dh-motion-base`;
3. the strike-through draws — `.dh-complete-strike`, same duration;
4. a short perceptual acknowledgement;
5. the row leaves, **on surfaces that remove completed work** — see §12;
6. Undo remains available through the existing canonical toast.

Total perceived: **~260ms**. An acknowledgement, not a celebration. No confetti,
no bounce, no scale, and no colour change beyond receding — a completed task in
DalyHub goes *quiet*; it does not turn green.

**The mutation is not waiting for any of this.** The optimistic write is posted
the moment the control is ticked; nothing here is ever awaited.

### The strike is a colour, not a decoration

`text-decoration-line` cannot be interpolated — it is present or it is not, and
the change reads as a glitch on the most repeated act in the product.
`text-decoration-color` **can** be. So the rule is always present and transparent
at rest, and completing transitions a colour.

The obvious alternative — an absolutely-positioned `::after` scaled on X — was
tried and rejected: a task title **wraps**, routinely, on a phone, and a single
positioned bar strikes the middle of the box rather than each line of the text.
`text-decoration` follows the text at every width for free, and reserves no
space, so the title does not move when a task is completed or reopened.

### A defect this repaired

Hovering a completed task **replaced its strike with an underline**, because the
hover rule used the `text-decoration` shorthand — which resets
`text-decoration-color`. Pointing at a finished task made it look unfinished.
Every rule that touches a decoration on a title carrying `.dh-complete-strike`
now uses longhands, and a completed title keeps its strike while hovered.

### Adopted by

`TaskRow` (`/tasks`, Today, Project task lists), `RecordRow` (the DHDS-02 shared
row) and `Card` — every canonical surface a Task title is drawn on.

---

## 8. Row behaviour

One reveal contract, product-wide: `data-dh-action-context="true"` on the row,
`dh-action-reveal` on the trailing affordance. Introduced by DHDS-02 in
`base.css`; DHDS-08 moved it into `motion.css` unchanged, because it is motion.

The four rules that make it safe:

1. **It fades.** `opacity` only — never appears, grows or slides, because all
   three move the row's other content.
2. **It occupies its geometry at rest**, so the title and metadata are laid out
   against the space it will occupy and nothing shifts horizontally.
3. **It is never unavailable to anyone who cannot hover.** `opacity` does not
   remove it from the accessibility tree, `:focus-within` reveals it for the
   keyboard, an open menu holds it open, and the reveal is wrapped in
   `(hover: hover)` so a touch device is simply given it.
4. **It cannot be clicked while invisible** — `pointer-events` follows the
   opacity.

**A defect this repaired.** Card-presentation task rows had re-implemented the
contract by hand — the same selector list, the same touch and forced-colours
escapes — and, being a copy rather than the contract, **had no transition at
all**. The `…` popped in and out instantly while the identical control on the
same component's list rows faded.

**Verified in a real engine:** hovering a row does not move its title by a pixel
on either axis, and the affordance is reachable by keyboard.

**One known gap, recorded rather than papered over.** Rule 4 has a cost nobody
had measured: because the unrevealed trigger is `pointer-events: none` while its
`.dh-overflow-menu` wrapper is `pointer-events: auto` over the *same* 32px box,
the hit test at the trigger's centre resolves to the wrapper. A person is
unaffected — hovering the row reveals the affordance before the click lands —
but Playwright hit-tests before it moves the mouse, so it can never perform the
hover that would make the element hittable. `e2e/motion.spec.ts` opens the menu
from the keyboard for this reason. The behaviour predates DHDS-08 (the
`pointer-events` half came from `base.css` unchanged) and the fix is a decision
between two behaviour changes rather than a motion one, so it is recorded as
DEBT-180 rather than taken here.

---

## 9. Contextual depth behaviour

| Surface | Grammar | Displacement |
|---|---|---|
| Drawer | `.dh-motion-edge-inline` | `100%` — fully off the inline edge |
| Drawer (phone) | swaps to the block-axis keyframe | `100%` from the bottom |
| Inspector (docked) | `.dh-motion-edge-inline` | `--dh-space-2` **with a fade** — it is *attached* to the workspace and settles into it; the page behind it never moves |
| Inspector (phone) | swaps to the block-axis keyframe | `100%` — a proper bottom sheet, not the 16px nudge it used before |
| Sheet | `.dh-motion-edge-block` | `100%` from the bottom; no overshoot, no bounce |
| Sheet (tablet+) | the centred-dialog pair | a small rise |
| Dialog | `.dh-motion-lift` | `--dh-motion-travel-modal` |
| Command palette | `.dh-motion-lift` | **rises** — it used to arrive from above, which read as a notification falling on the page rather than a surface the owner summoned |
| Search | `.dh-motion-lift` | same object, different contents |
| Mobile navigation | `.dh-motion-edge-inline` | `-100%` — the leading edge it lives on |
| Every scrim | `.dh-motion-scrim` | softer and faster than its panel, in both directions |

Same keyframe, different amplitude, which is what a shared displacement property
is for. No page content animates; no two of these compete.

---

## 10. Menus, popovers and tooltips

DHDS-09 will expand the floating-surface system. DHDS-08 establishes the grammar
it must use, and the existing surfaces adopt it: tooltip and hover card take
`.dh-motion-reveal`, and the shared anchored layer (`.dh-anchored` — inline
select, inline date, the collection controls popover) gained a reveal it never
had.

**Why the anchored layer is a transition, not the shared animation.** Every other
floating surface is placed by CSS, so its entrance can be a one-shot animation
starting at mount. This one is placed by a **measurement**: it mounts
unpositioned, is measured, and is moved into place on the following commit. An
animation would have run — and finished — while the surface was still at the
viewport's corner with nothing to see. The `data-positioned` flip is the real
"it is here now" event, so the reveal hangs off that, using the same distances,
duration and curve as the shared grammar.

`transform-origin` follows the placement solver's own flip, so a menu grows from
the edge nearest its trigger. Pointer interaction is never delayed:
`pointer-events` returns on the same commit the transition starts, and focus has
already moved onto the menu's current item.

Tooltips take the reveal rung and nothing else — readability over animation.

---

## 11. Toast behaviour

The toast takes `.dh-motion-edge-block` at a small amplitude, so it reads as
transient feedback rising into view rather than an announcement being presented.

**Interactivity is never gated on the entrance.** The animation is `opacity` and
`transform` on an element already in the tree, already focusable, already
carrying `pointer-events`. Undo is usable immediately.

**A dismissed toast now leaves** rather than vanishing.
[`useLeavingRecords`](../../app/shared/feedback/use-leaving-notifications.ts)
keeps a removed record in the *rendered* list for one exit animation, marked
`data-dh-exit` and `inert`.

The queue is untouched. `FeedbackProvider` owns Undo windows, commit handlers,
coalescing and bounded eviction — the semantics — and none of that learns what an
animation is. A leaving toast is already gone as far as the provider is
concerned; only its pixels remain, and `inert` means its Undo cannot be clicked
or tabbed into after the dismissal has been taken.

Errors are unaffected: they remain sticky and do not disappear because a
success-style timer expired.

---

## 12. Today continuity

When the Now task is completed and another becomes the next recommended action,
the replacement **crossfades into the same position** rather than the composition
re-rendering. The panel, its heading and everything around it hold still; only
the task inside changes.

The reading is: *I finished that. This is what comes next.*

It is a fade and deliberately **not** a slide — the position carries the meaning,
so the position must not move. No carousel; the transition is shorter than the
task action itself.

`key` on the task's id is what makes it honest: React remounts the subtree only
when the Now task **actually changed**, so the crossfade can never replay on an
incidental re-render. A revalidation returning the same task re-renders it in
place with no motion at all.

---

## 13. Disclosure behaviour

`.dh-disclosure` transitions `grid-template-rows: 0fr → 1fr` — the one stable way
to transition to **intrinsic** height in CSS. The alternative the product would
otherwise reach for is a `max-height` guess, which is wrong twice: too small and
the content is clipped, too large and closing is a long pause followed by a snap.

`min-block-size: 0` on the content is load-bearing: a grid item's default `auto`
minimum refuses to shrink, and the region would never close.

**The indicator and the region are one interaction.** `.dh-disclosure-marker`
turns over the same duration and curve. Before DHDS-08 the task-group chevron
turned at a different duration on a raw `ease` keyword — the last literal easing
left in the product's module CSS.

**The accessibility and performance end state is preserved.** A collapsed group's
body is still `hidden` — out of the accessibility tree and out of layout on a
long list. It simply arrives when the transition finishes, which is exactly the
removal-timing problem [`usePresence`](../../app/shared/motion/use-presence.ts)
exists for. Under reduced motion it arrives immediately and the behaviour is
identical to before.

**Interaction goes on the click; only the pixels wait.** Painting the rows for
200ms so the region can close opened a window in which `aria-expanded` and
`data-dh-open` both said `false` while the subtree was still focusable and still
in the accessibility tree — so tabbing straight after a collapse landed inside
content the control had just declared closed. `inert` is therefore keyed on
`collapsed` rather than on the end of the transition. **This was caught in
review**, and is covered by a browser test that asserts focus is refused *while
the region is still painted*, so it genuinely exercises the transition window.
Motion may never delay or obscure what a control has already reported.

Cost, stated honestly: this animates a grid track, which is layout, not
composite. It is bounded — one region at a time, at 200ms — and the comprehension
it buys is the Level 3 test. Repeated opening and closing stays fast.

---

## 14. Loading and route behaviour

**Skeleton → content is not animated**, and that was audited before it was
decided. React Router keeps the current page rendered while the next one's data
is in flight, so an ordinary navigation never blanks and never replays a
skeleton; the skeleton shows on a genuine first load, where there is nothing to
crossfade *from*. Adding a fade there would delay content the owner is waiting
for in order to animate its absence.

Absent and staying absent: staggered row entrances, cascading dashboard reveals,
and blanking useful UI to replay a loading animation.

**No route or page transitions.** Module navigation is immediate. A test asserts
that `startViewTransition` and `@view-transition` appear nowhere in `app/`, and a
browser test asserts the page frame carries no animation after a navigation.

---

## 15. Things deliberately NOT animated

Each is a decision with a reason recorded at the code:

| Thing | Why |
|---|---|
| **Route and page transitions** | §15 of the direction. Navigation is not an object changing state |
| **Skeleton → content** | Nothing to crossfade from; the architecture already avoids the flash (§14) |
| **A pressed transform** | Every DalyHub control answers a press with a value change. There is no shared `.dh-press` scale, and the generic `scale(0.95)` is what DalyHub must not look like |
| **The checkbox tick's stroke-draw** | Completing and selecting are high-frequency repeated acts; an animation on one is a tax paid once per item forever (`ui.css`) |
| **Today's Completed `<details>`** | A native `<details>` cannot animate its content open without the `height: auto` machinery this phase rules out. Its marker turns at the shared duration; the region opens instantly, honestly |
| **A ripple** | Pre-existing decision, ADR-077. Unchanged |
| **Row departure on completion** | Deferred — see §19 |

---

## 16. Module adoption

**Shared primitives:** Drawer · Inspector · Sheet · ConfirmationDialog ·
CommandPalette · SearchSurface · Tooltip · HoverCard · NotificationCenter ·
MobileNav · AnchoredSurface · TaskRow · TaskList · RecordRow · Card.

**Stylesheets migrated:** `tokens.css` · `motion.css` *(new)* · `base.css` ·
`ui.css` · `drawer.css` · `inspector.css` · `sheet.css` · `feedback.css` ·
`command.css` · `search.css` · `tooltip.css` · `linked-items.css` ·
`settings.css` · `shell.css` · `anchored.css` · `task-list.css` ·
`task-signals.css` · `card.css` · `card-family.css` · `skeleton.css` ·
`record-layout.css` · `progress.css` · `today.css`.

**Modules reached through those:** Today, Tasks, Inbox, Plan/Schedule, Projects,
Areas, Goals, Notes, Diary, Meetings, People, Assets, Reviews, Analytics,
Settings, Habits — every surface using the shared row, panel, sheet, toast,
dialog and menu primitives.

---

## 17. Repairs found on the way

Small defects, each of the class that heavily affects perceived quality:

- a **record skeleton shimmering on a 360ms loop** — frantic, because it borrowed
  a transition rung for a period;
- the **button spinner** doing the same;
- the **card-mode row affordance** popping instead of fading (§8);
- a **completed title losing its strike on hover** (§7);
- the **task-group chevron** on a literal `ease` at the wrong duration;
- the **command palette arriving from above** rather than rising;
- the **phone Inspector** nudging 16px instead of rising from the bottom edge;
- **two duplicate loop keyframes** (`dh-button-spin`/`dh-spin`,
  `record-skeleton-shimmer`/`dh-skeleton-shimmer`).

---

## 18. Testing

### `test/unit/motion/motion-grammar.test.ts` — 28 assertions

Contract tests over the stylesheets. What is worth protecting is not any
particular 4px; it is that there is exactly **one** place a duration, a curve, a
keyframe or a reveal behaviour comes from. Every regression this phase repaired
was a copy.

- every rung is a literal duration, and **no two are synonyms**;
- the rungs are ordered by the weight of what they describe;
- exit is shorter than entrance; the whole ramp is inside 320ms;
- the loop periods are outside the transition ramp;
- four curves that genuinely differ, and **none overshoots**;
- **no module declares a keyframe** bar the two documented exceptions;
- **no module writes down a duration or a curve**;
- the reveal contract exists in exactly one file, and does not use `display: none`;
- reduced motion removes travel and supplies the fade;
- the completion strike is a transitioning colour, is worn by all three canonical
  title surfaces, and no host uses the `text-decoration` shorthand on one;
- disclosure opens to intrinsic height with no `max-height`, and the canonical
  grouped section uses it;
- every motion role **aliases** rather than authors, and every one resolves to a
  real value;
- the JavaScript duration mirror matches the stylesheet and mirrors **only** the
  durations that drive removal;
- **no animation dependency** (Framer Motion, Motion One, react-spring, GSAP,
  anime.js, react-transition-group);
- **no `will-change`** anywhere;
- **no route transition** anywhere.

### `e2e/motion.spec.ts` — 14 tests, all passing

State- and event-driven; no sleeps, because nothing in DalyHub is gated on an
animation. Covers the vocabulary resolving in a real engine, the state rung on a
control with no resting scale, the row title not moving when the `…` appears,
keyboard reach, the strike's resting state, completion not resizing the row,
disclosure both ways, a collapsing region refusing focus *while it is still
painted*, the palette and anchored layer naming the shared grammar and being
operable at once, the full reduced-motion contract, and navigation playing no
page transition.

### Existing coverage preserved

`FeedbackProvider.test.tsx` gained a `settleExit()` helper before five
"the toast is gone" assertions. **No assertion was weakened** — each is unchanged;
the helper lets the pixels finish before the DOM is queried. In a real browser
the wait would not be needed at all: `inert` removes the subtree from the
accessibility tree, so `getByRole` would already miss it. The test DOM does not
implement that, so the wait is explicit.

`row-surface-convergence.test.ts` was repointed at `motion.css` and now also
asserts the contract is **not** in `base.css` — a second copy is how the two
drift apart.

---

## 19. Validation actually run

| Gate | Result |
|---|---|
| `pnpm run format:check` | pass |
| `pnpm run lint` | pass |
| `pnpm run typecheck` | pass |
| `pnpm run scheme:check` | pass |
| `pnpm run icons:check` | pass |
| `pnpm run dhds:check` | pass — 0 direct machinery references |
| `pnpm run build` | pass |
| `pnpm run test:unit` | **6234 passed**, 0 failed |
| `pnpm run test:kernel` | pass |
| `pnpm run e2e:partitions:check` | pass — 113 spec files, 12 partitions |
| `e2e/motion.spec.ts` | **14 passed** |
| `e2e/dhds-08-motion-screenshots.spec.ts` | **22 passed**, 48 frames |
| `e2e/drawer` `feedback` `tooltip` `command-palette` | 61 passed, 1 failed *(pre-existing)* |
| `e2e/today` `today-focus` `today-mobile` `tasks` | 32 passed, 6 failed *(pre-existing)* |

### The E2E gate: 19 pre-existing failures, every one verified

The full twelve-partition gate ran in CI on this branch (runs 32424290783,
32428461587, 32430980151 and 32432512935). **Static, Scope, Build and Unit are
green in every one.** Eight E2E partitions are red, carrying **19 failing tests**
at their widest — **eighteen of which are constant across every run**, with three
more moving in and out (below). Nothing in this branch moves the stable
eighteen.

**`main`'s own gate fails exactly the same nineteen** (run 32409611083, at
`157a3f4`) — the same list, test for test. That is stronger than the local
base-tree reproduction and settles the question of ownership.

**The set is not stable, and an earlier revision of this record wrongly said it
was.** Four runs of this branch produced **19, 19, 18 and 20**. Eighteen are
constant; three tests move — `tasks-collection.spec.ts:298` (fail, fail,
**pass**, fail), and `identity.spec.ts:124` and `notes.spec.ts:382`, which
appeared once, on a commit that changes **two markdown files and nothing
else**.

Both of the newcomers were investigated rather than assumed, because one of them
— a failed save showing an error state with Retry — is exactly the kind of thing
this phase could have broken (DHDS-08 §12 governs error feedback, and the branch
does touch the toast path). It could not have:

- the Retry control is the editor's **inline save-status indicator**, not a
  toast; every file implementing it (`SaveStatusIndicator.tsx`,
  `use-autosave-field.ts`) is untouched by this branch;
- no colour-scheme source file is touched either, and `scheme:check` is green;
- both specs pass locally on this branch against a fresh database, 23/23;
- they failed in one run out of four, on a markdown-only commit.

So the two newcomers are not DHDS-08's. **They are also not attributed to
anything else**, and that restraint is deliberate. `tasks-collection.spec.ts:298`
*is* DEBT-173 — it passes in isolation and fails only after another spec, which
is the accumulated-state signature. The other two are not: `notes.spec.ts:382`
builds its own uniquely-titled Note before it does anything
(`e2e/notes.spec.ts:385-386`), so "passes in isolation" says nothing about shared
fixtures, and one failure in four runs is not a reproducer. Filing them under
DEBT-173 would point the next investigation at fixture isolation on no evidence,
so they are recorded as **unexplained and unclassified** instead.

The useful lesson is the one the churn teaches: while the gate is red for
unrelated reasons, "the set changed" cannot by itself distinguish a regression
from contamination. Only a mechanism can — and the absence of one is a reason to
stop, not a licence to pick a cause.

Every one of the nineteen was checked individually by restoring `app/` to
`157a3f4` (the merge-base), reseeding the local database and re-running the same
spec. **All nineteen fail identically on the base tree.** None is a DHDS-08
regression.

| Spec | Tests | Verified pre-existing |
|---|---|---|
| `today.spec.ts` | 4 | ✓ |
| `today-task-convergence.spec.ts` | 2 | ✓ |
| `today-focus.spec.ts` | 2 | ✓ |
| `inline-editor-overlay.spec.ts` | 2 | ✓ |
| `visual-system.spec.ts` | 2 | ✓ |
| `command-palette.spec.ts` | 1 | ✓ |
| `plan-weekly-planning.spec.ts` | 1 | ✓ |
| `tasks-collection.spec.ts` | 1 | ✓ |
| `record-anatomy.spec.ts` | 1 | ✓ |
| `non-diary-audit.spec.ts` | 1 | ✓ |
| `goal-measurement.spec.ts` | 1 | ✓ |
| `iphone-daily-driver.spec.ts` | 1 | ✓ |

Four of these sit squarely in this phase's blast radius and were therefore
checked FIRST rather than last — `inline-editor-overlay` (the anchored layer
DHDS-08 gave a reveal to) and `today-task-convergence` (the completion grammar).
All four fail on the base tree too.

Most share one signature: `locator.check()` clicks a completion checkbox, the
checkbox never becomes checked, and Playwright retries to timeout. Two are
different and were investigated separately — `tasks-collection.spec.ts:298`
passes in isolation and fails only after another spec (DEBT-173's
accumulated-state signature), and `plan-weekly-planning.spec.ts:233` is the
hit-testing gap now recorded as DEBT-180.

**The base branch is redder still.** `main` at `157a3f4` (run 32409611083) fails
**ten** jobs, including **Unit** — `test/kernel/calendar-security.test.ts:94`, a
network-dependent test — plus eight E2E partitions. This branch's Unit job is
green. None of this is fixed here: a failure that is red on base is not this
PR's to repair, and widening a grammar pass to chase nineteen unrelated tests is
how a reviewable branch stops being one.

The **full** E2E gate was not run in this environment — it is a 176-minute,
twelve-partition suite. The partitions manifest was regenerated from a real
measurement of the new spec (44.3s, 13 tests) rather than the 120s default guess.

---

## 20. Visual evidence

48 frames in [`assets/dhds-08-2026-08/`](assets/dhds-08-2026-08/), captured
through the repository's canonical mechanism
(`CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/dhds-08-motion-screenshots.spec.ts`)
against the real product at `localhost:4173` with the seeded workspace.

The capture deliberately photographs the **pairs the grammar moves between**,
because those are what a reviewer can judge from a still: if the "after" shows
the title in a different place from the "before", the motion between them was
wrong however smooth it looked. Two frames are taken mid-flight on purpose and
are named `during`.

**Desktop (1280×900), light and dark:** Today · Tasks · Projects · Goals · Notes ·
row at rest vs revealed · completion before/during/after · disclosure open vs
closed · command palette · anchored popover · panel mid-entrance and settled ·
toast.

**Phone (393×852), light and dark:** Today · Tasks · completion before/after ·
bottom sheet · navigation sheet · toast · contextual actions without hover.

**Inspected, not merely captured.** The completion frames confirm the row holds
its place and geometry while the strike draws and the Undo toast arrives; the
row-rest/row-revealed pair confirms no horizontal shift; the phone frames confirm
the toast clears the bottom navigation and the safe area, and that contextual
actions are drawn outright on a coarse pointer.

---

## 21. Known debt and deferred work

### Deferred with reasons, in this phase

**Row departure on completion (steps 5–6 of §7).** A completed row on a surface
that removes it disappears on the next revalidation, as before; the Undo toast
carries the continuity. The mechanism is not the hard part — the grid-track
collapse is the disclosure transition and `useLeavingRecords` already does the
list bookkeeping. Two other things are:

1. **Focus.** The control the owner just clicked is inside the row about to go.
   Holding it 260ms while `inert` moves focus to `<body>` for a quarter of a
   second, and deciding where it should land instead (the next row? the list? the
   toast's Undo?) is an interaction decision, not a motion one.
2. **The surfaces disagree about what completion means.** `/tasks` in All-active
   removes the row; a Completed section keeps it; a Project's history keeps it
   forever. Animating a row out of existence on a surface that did not remove it
   would be a lie about what happened, so the departure has to be opted into per
   surface — a wider change than a grammar pass should make alone.

**Exit motion on focus-trapping panels.** The Drawer, Inspector, Sheet and mobile
navigation restore focus to their opener **on unmount** (`useDrawerFocus`).
Holding them mounted for the exit would delay the focus restoration with it,
which §19 rules out. Their entrances are the shared grammar; their exits are
instant, which is at least *faster* than their entrance. Closing them correctly
with an exit needs the focus restoration decoupled from unmount — a change to the
DS-03 focus contract, not to motion. The grammar and `usePresence` are in place
for when that happens; the toast (which has no focus contract) demonstrates the
mechanism today.

**Two `ease-in-out` keywords** remain on the shimmer loops in `skeleton.css` and
`record-layout.css`. A loop's timing function is a symmetric sweep rather than a
transition curve, and none of the four semantic curves is the right answer.

### Belonging to later phases

| Phase | Scope | What DHDS-08 did and did not do |
|---|---|---|
| **DHDS-09** | Floating surfaces and contextual choice architecture | DHDS-08 **established the motion grammar** floating surfaces must use, and existing menus, popovers and tooltips adopt it. It did **not** restructure the floating-surface system, its placement model or its choice architecture |
| **DHDS-10** | Inline manipulation | DHDS-08 gave inline editors the shared reveal rung. It did **not** change what inline editing does |
| **DHDS-11** | Drag, reorder and deeper object continuity | DHDS-08 **defined the future grammar** (a dragged object is Level 3 structural movement; the preview follows the pointer with no transition, and the release settles at `--dh-motion-base` on `--dh-ease-emphasized` — which is what `card.css` already does) and corrected nothing else. It did **not** build a drag-and-drop architecture. **Row departure on completion belongs here** |

**These phases must not be implemented through bespoke one-offs.** A module that
grows its own floating surface, its own inline editor or its own drag preview is
the divergence this sequence exists to end.

---

## 22. The rule for future work

> **A duration, a curve, a distance or an entrance in a module stylesheet is a
> bug.**

Name a role from `tokens.css`; adopt a class from `motion.css`. If neither
expresses what a surface needs, the vocabulary is wrong — extend it there, in one
place, with the reason written down. Do not extend it locally.

Four tests enforce this mechanically: no module may declare a keyframe, write
down a duration, write down a curve, or define a second copy of the reveal
contract.
