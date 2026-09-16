# MOBILE_WEB_EXPERIENCE.md — the DalyHub mobile web contract

**Authoritative for DalyHub's phone behaviour.** Where this document and a
general responsive-design instinct disagree, this document wins.

> ## The standard this document exists to protect
>
> DalyHub installed to an iPhone Home Screen is a **mobile application**, not a
> website that fits. The question to ask of any phone change is not "does it work
> at 390px" — it is:
>
> **"If DalyHub were the only client on my phone for the next six months, would I
> enjoy using it?"**
>
> Native feeling comes from speed, predictable navigation, touch geometry,
> keyboard handling, persistence and offline capability. It does not come from
> looking like iOS. See [§12](#12-what-this-is-not).

---

## 1. What is measured, and what is inherited

Everything in this document that states a number was measured at 390×844 against
the local Worker, and says so. Where a claim is inherited from an earlier pass it
names that pass (MOBILE-01, MOBILE-02, CAPTURE-02, PWA-05, PWA-12, UIX-01) rather
than restating its evidence.

Test widths, in priority order: **390/393px** (the physical target), then 320,
375 and 430. Desktop must not regress, but it is not the authority for this
surface.

---

## 2. The priority order

When phone work has to be cut, it is cut from the bottom:

1. Quick Capture
2. Today
3. Tasks
4. The Meeting workspace
5. Session friction
6. Offline Meeting capture
7. Keyboard, sheets, safe areas
8. Launch and navigation latency
9. Notes/Diary quick capture
10. Supporting-module polish

Finish a coherent vertical slice rather than starting two.

---

## 3. Navigation

**The bottom bar is for high-frequency action, not for completeness.** Five
controls is the budget — the platform convention and the most a thumb hits
reliably at 320px. Today · Tasks · **Add** · Projects · More.

Nothing in that list is hard-coded. A module earns a slot by declaring
`meta.mobilePrimaryOrder` in its own route manifest, and the bar is derived from
the same registry-driven navigation model the desktop rail renders
(`mobile-navigation.ts`). `MOBILE_PRIMARY_DESTINATION_LIMIT` is 3; a fourth
opt-in stays behind More rather than shrinking every target below 44px.

**More opens the complete navigation**, so every module including any future one
is one tap away and nothing appears in a second, drifting list. Do not build a
phone-specific navigation list.

The bar sits above the home indicator (`--dh-safe-bottom`) and translates
off-screen exactly while the keyboard covers that space
(`--app-keyboard-inset`), so it can never cover a focused field. It is
`display: none` at `md` and above.

---

## 4. Capture

**Capture is a navigation slot, not a page.** The centre control opens the shared
Quick Capture sheet; it never navigates to a form.

### The contract

- **The sheet opens on a Task and does not ask.** It used to render a chooser —
  a tap, a screen and a decision spent on a question that already had an answer.
  The other types are a compact chip row, so an uncommon one costs one tap rather
  than one tap plus a screen (MOBILE-02).
- **The field is focused on open**, so the keyboard is up before the sheet has
  finished rising.
- **Return submits** a one-line capture. It does not add a newline.
- **Create first, enrich later.** A capture asks for the least that can work — a
  Task is a title — with classification behind progressive disclosure.
- **Every capture posts to the module's canonical creation route.** There is no
  capture-only store, no second validator and no second create path. Adding a
  capture type means pointing at an existing authority, never building one.
- **A failure never costs the words.** The text stays on screen.

MEASURED at 390×844: **1 tap from launch to a focused capture field** (`INPUT`
focused, `font-size: 16px`), 2 taps for any other type. Tap-to-field-focused
median **427ms** over three runs.

### Context is reused, never re-asked

Capturing from a Project defaults the parent to that Project; an action captured
from a Meeting links to that Meeting. If DalyHub already knows something, the
phone does not ask for it again.

---

## 5. Today is the phone's home screen

Today leads with **Now**, then the plan, then habits. Context follows. It does not
lead with dashboards, analytics or summaries.

At 390×844 the first screen is: greeting → day switcher → **Now** (with a real
task and its completion control at y≈293) → Today's plan → Habits. A useful next
action is visible and completable without scrolling.

**A Task on Today completes in one tap**, and the tap is immediate — the checkbox
draws at 20×20 inside a **45×45** hit area (measured), which clears the 44px
coarse-pointer floor.

---

## 6. The Meeting workspace

A meeting is the strongest reason DalyHub has to work well on a phone: it is
where the product is most in use and the connection is least reliable.

**One capture bar, pinned, covering everything a meeting produces:**

    Agenda · Note · Action · Decision · Outcome

Choosing a type focuses the field; submitting saves through that type's canonical
authority and leaves the owner exactly where they were, field cleared and still
focused. No drawer opens, no tab changes, nothing nests. MEASURED: **1 tap to a
focused field for each of the five types.**

**The bar opens on the type the meeting is actually at** — Agenda before it has
been held, Note once it is under way or behind us. Nothing is hidden either way.

Agenda was deliberately absent until MOBILE-03, on the reasoning that an agenda is
written before a meeting rather than during one. That is right about *when* and
wrong about *where*: writing it is itself a phone-in-hand job. MEASURED: the
section's own "+Add agenda item" sits at y=904 in a 2967px page on an 844px
viewport — below the fold, so the old path was a scroll plus a tap.

---

## 7. Offline is a daily-driver property, not a feature

The offline model is one model. **Do not build a second one.** The snapshot, the
queue, the mutation receipts, idempotency, conflict arbitration and the sync
status are `PWA_AND_OFFLINE.md`'s, and every extension goes through them.

### What is writable offline, and why that list is short

| Record | Offline write | Why |
| :--- | :--- | :--- |
| Task | complete, reopen, title, priority, due, planned, one checklist tick | Each is ONE field with a comparable base value, so `decideConflict` can arbitrate it (PWA-12, TASKS-13) |
| Meeting | add agenda item, decision, outcome, action | An append overwrites nothing, so it cannot conflict; its only duplicate risk is a lost response, which the receipt already answers (MOBILE-03) |
| Capture | Task, Note, Diary | The PWA-05 capture queue |
| Meeting **notes body** | ❌ never | `notesMarkdown` is one long string saved whole under a version precondition; two devices appending offline would each send a document that discards the other's paragraph ([`DALYHUB_MOBILE_FOUNDATION.md`](../architecture/DALYHUB_MOBILE_FOUNDATION.md) §4.7) |
| Everything else | ❌ | Online only, deliberately |

**The rule for adding one.** An operation may join the queue only if it has a
clear idempotency key AND either one comparable field or no field at all. If
answering "did this conflict?" needs a merge, it does not go in the queue; it
needs an ADR first.

### What offline feels like

- **Keep working.** No blocking "you are offline" page when the workflow is
  supported locally.
- **Say where it is, quietly.** "Saved on this device — it will sync when
  connected". Not a warning, not an error, and never "try again" for something
  that is safe.
- **Reconnect is silent.** Successful sync produces no toast. Interrupt only for
  a conflict that needs a decision, a permanent failure, or authentication.
- **Nothing is discarded.** A queue that cannot send waits. See §9.

**One honest limitation.** Offline Meeting capture works from a workspace already
open — the meeting you are in when the signal drops. Navigating to a meeting
while offline reaches the read-only snapshot, because the route's loader needs
the network. That is the shape of the feature, not a bug to be surprised by.

---

## 8. Keyboard, sheets, safe areas

**The keyboard is part of the layout.** There is exactly ONE Visual Viewport
listener in DalyHub (`use-keyboard-inset.ts`, mounted by the AppShell); it
publishes `--app-keyboard-inset` and every keyboard-aware surface styles against
that token. Adding a second resize listener to a form is the layout-thrashing
pattern this exists to prevent. Surfaces opt in by using the token, never by
measuring.

**Phone overlays are sheets.** Bottom sheet by default, full-height when the
content needs it, a popover only where one genuinely works in a thumb's reach.
Not a centred desktop modal, not a dropdown pinned to a screen edge. There is one
`Sheet` and one focus trap; do not add a second of either.

**Never nest sheet → popover → dialog for a common action.** Flatten it.

**Inputs are ≥16px** so iOS does not zoom on focus (measured: the capture field
is 16px). Never disable user zoom.

**Safe areas** are `--dh-safe-bottom`/`--dh-safe-top` on the top bar, bottom
navigation, sheets, sticky composers and status surfaces. No control sits behind
the home indicator.

**Return-key semantics split by surface.** A one-line capture submits on Return.
A writing surface — Notes, Diary, meeting notes — inserts a line. Do not apply
quick-submit to prose.

**Text stays selectable.** Do not make the application unselectable to feel
native.

---

## 9. Session and state

**Authentication is not weakened for mobile, ever.** The Worker validates the
signed Access assertion and independently enforces the owner on every request. No
mobile bypass, no client-supplied email, no long-lived bearer token for
convenience, no credential in `localStorage`.

Session *duration* is Cloudflare dashboard configuration and lives nowhere in this
repository. The audit, the four lifetimes that compose into it, how to read the
current one from Settings → Account & security without the dashboard, and the
exact owner procedure are in
[`APP_SHELL_AUTH.md` § Session lifetime on a trusted personal phone](../development/APP_SHELL_AUTH.md#session-lifetime-on-a-trusted-personal-phone-mobile-06-2026-09-16).

**Two guarantees hold when it expires anyway**, both by test:

- **Local unsynced work survives.** A `401`/`403`/opaque redirect resolves as
  `blocked`, the pass stops after one request, and nothing is discarded.
- **Re-authentication returns to the workflow.** The error boundary offers "Sign
  in and continue" — a document navigation to the current URL, which is what
  makes Access redirect and return the owner here. A control they press, never an
  automatic reload (PWA-11: an unbounded self-navigation is how an installed PWA
  reaches the restart loop WebKit terminates).

**Reopening feels continuous.** Route, scroll position and view choice are
restored. Scroll restoration is keyed by PATH, not by history entry, so opening a
drawer or switching a tab does not move the page underneath (ADR-018 §18.6), and
the page freeze that backs it captures the offset once, before anything is
frozen — see `use-body-scroll-lock.ts` for the measured reason that matters.

---

## 10. Speed

Targets, as product intent rather than as guarantees:

| Journey | Intent |
| :--- | :--- |
| Warm launch | effectively immediate |
| Cached cold launch | under ~2s to meaningful UI in normal conditions |
| High-frequency route change | no whole-page-loading sensation |
| Capture feedback | immediate |

**Prefetch is `intent`, and only `intent`** (`navigation-prefetch.ts`). `render`
would download the whole application on first paint; `viewport` degenerates into
`render` on both the desktop rail and the phone navigation sheet. On touch,
`intent` fires on `touchstart` for the one destination a finger has landed on — a
tap warms that route and no other.

Do not add a global state-management framework, and do not add a second
revalidation scheme, to make navigation feel faster.

---

## 11. Accessibility on a phone

Non-negotiable, and not separate from the rest of this document:

- coarse-pointer targets ≥44px;
- meaning never carried by colour alone — a state says itself in words;
- sheets trap focus, name themselves, and restore focus to their opener;
- 200% text and increased system text reflow rather than clip; do not hardcode
  heights that cut content off;
- `prefers-reduced-motion` respected;
- screen-reader names and focus order verified on the surfaces that changed.

Motion communicates state — a sheet entering, a press, a row completing, shell
continuity across a route change — and does nothing else.

---

## 12. What this is not

**Do not build a fake iOS theme.** No Cupertino clones, no SF Symbols as a second
icon system, no frosted iOS navigation bars, no platform cosplay. DalyHub still
looks like DalyHub. [`UNTITLED_UI_IMPLEMENTATION.md`](UNTITLED_UI_IMPLEMENTATION.md)
remains the implementation authority for generic UI, on a phone as everywhere
else: search the Untitled source before building a control, and check the generic
UI inventory before concluding one does not exist.

**Do not treat this as a migration.** There is no phase to join. Phone work is
product evolution and named maintenance, the same as everything else after 3.0.

**Do not regress this into responsive desktop.** The failure mode this document
exists to prevent is a future change that makes a phone surface "consistent with
desktop" by giving it desktop's composition — a table squeezed into 390px, a
centred modal, a form that asks for six fields before it will create anything.
Consistency is in the tokens and the grammar, not in the layout.

---

## 13. The real-device checklist

**Emulation is not enough for this class of thing, and nothing below may be
ticked by a Playwright run.** A headless Chromium at 390×844 is a good model of
layout and a poor model of iOS: it has no Safari view-transition behaviour, no
real software keyboard, no Home Screen install, no WebKit service-worker
lifetime, no low-power mode and no Cloudflare Access in front of it. Everything
here needs a person with an iPhone.

Do not mark an item verified unless someone actually performed it. An unticked
box is information; a ticked one that nobody did is a lie the next person builds
on.

### Safari, then the installed app

| # | Check | Done |
| :-- | :--- | :--- |
| 1 | DalyHub loads and is usable in mobile Safari | ⏳ |
| 2 | Add to Home Screen works, and the icon and name are right | ⏳ |
| 3 | Launched from the Home Screen it opens **standalone** — no Safari chrome | ⏳ |

### Launch and lifecycle

| # | Check | Done |
| :-- | :--- | :--- |
| 4 | Cold launch (after a reboot) reaches a useful Today in about two seconds | ⏳ |
| 5 | Warm launch (reopened minutes later) feels immediate | ⏳ |
| 6 | Switch to another app and back: the same screen, the same scroll position, no reload | ⏳ |
| 7 | Lock and unlock: the same, and no sign-in | ⏳ |
| 8 | Left for a day and reopened: still signed in (this is the §9 session question, answered by use) | ⏳ |
| 9 | After a deploy, the service worker updates without the app getting stuck or looping | ⏳ |

### Capture and keyboard

| # | Check | Done |
| :-- | :--- | :--- |
| 10 | Tap **Add**: the keyboard comes up on its own and the field is ready | ⏳ |
| 11 | Typing does not zoom the page | ⏳ |
| 12 | Return saves, and the new Task is there | ⏳ |
| 13 | In a Note or Diary entry, Return adds a line and does not submit | ⏳ |
| 14 | With the keyboard up, the Save control and any error are visible — nothing is behind it | ⏳ |

### Meeting, which is the one to do in a real meeting

| # | Check | Done |
| :-- | :--- | :--- |
| 15 | The capture bar is reachable one-handed and sits above the keyboard | ⏳ |
| 16 | Capture an agenda item, a decision and an action in a row without losing the keyboard | ⏳ |
| 17 | Turn on Aeroplane Mode mid-meeting and keep capturing: it says "saved on this device" | ⏳ |
| 18 | Turn it off: the items appear, exactly once each, with no toast | ⏳ |
| 19 | Lock the phone with captures still queued, unlock later: they are still there | ⏳ |

### Geometry

| # | Check | Done |
| :-- | :--- | :--- |
| 20 | No control sits under the home indicator, on Today, Tasks, a Meeting and an open sheet | ⏳ |
| 21 | Nothing scrolls sideways anywhere | ⏳ |
| 22 | In landscape, the notch side does not clip content | ⏳ |
| 23 | With system text at its largest, Today and a Task still read and nothing is cut off | ⏳ |

### Where to record the answers

In the pull request that changed the behaviour, or in
[`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) if an item fails and the fix is
not immediate. Not here — this is the checklist, not its results.

---

## 14. Related

- [`PWA_AND_OFFLINE.md`](../development/PWA_AND_OFFLINE.md) — the snapshot, queue, receipts and conflict protocol
- [`APP_SHELL_AUTH.md`](../development/APP_SHELL_AUTH.md) — the request boundary, the phone bar's registry capability, and the session audit
- [`DALYHUB_MOBILE_FOUNDATION.md`](../architecture/DALYHUB_MOBILE_FOUNDATION.md) — what a future native client would ask of this architecture, and the long-form-text question §7 defers to
- [`ACCESSIBILITY_RESPONSIVE.md`](../development/ACCESSIBILITY_RESPONSIVE.md) — the shared accessibility and responsive contract
- [`UNTITLED_UI_IMPLEMENTATION.md`](UNTITLED_UI_IMPLEMENTATION.md) — the frontend implementation authority
