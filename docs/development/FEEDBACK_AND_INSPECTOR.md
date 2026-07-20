# FEEDBACK_AND_INSPECTOR.md — The Global Interaction Layer (DS-10)

> The product-wide interaction layer every module inherits: the **Notification
> framework**, the **Undo framework**, the **Operation lifecycle** (one shared
> Feedback platform) and the **Global Inspector**. There is ONE implementation for
> the entire application — no module renders a toast or builds its own edit drawer.
>
> Decision & rationale: [ADR-025](../decisions/ARCHITECTURE_DECISIONS.md#adr-025-the-global-interaction-layer--feedback-platform-notifications-undo-background-operations-and-the-shared-inspector).
> Roadmap item: [DS-10](../roadmap/ROADMAP_V2.md#-ds-10--inspector-settings-and-feedback-states).
> Design patterns: [`DESIGN_SYSTEM.md → Global Interaction Layer`](../design/DESIGN_SYSTEM.md#global-interaction-layer-ds-10).

---

## Why this exists

Every earlier design-system item deferred one common need: telling the user what
happened. DalyHub's [interaction philosophy](../../AGENTS.md#7-interaction-philosophy)
demands actions that are *optimistic and reversible* ("prefer undo over
confirmation"), the [UX philosophy](../../AGENTS.md#6-ux-philosophy) demands *no
dead ends* and *calm defaults*, and the [Inspector pattern](../design/DESIGN_SYSTEM.md#inspector)
promised one depth-editing surface every module reuses. DS-10 delivers that layer
so that **every module built after it automatically inherits**: calm
notifications, platform Undo, a unified background-operation lifecycle, and the
standard record-editing Inspector.

The overriding constraints (from the roadmap brief and the design principles):
one implementation, entity-agnostic, calm (no toast spam, no modal overload),
keyboard-friendly, WCAG 2.2 AA, mobile-adapted, and **reusing the existing DS-03
modal machinery** rather than growing a second focus-trap or overlay system.

## The layers

| Layer | Location | Responsibility |
| ----- | -------- | -------------- |
| **Feedback model (React-free)** | `app/shared/feedback/model.ts` (+ `types.ts`, `config.ts`, `notifications.ts`, `operations.ts`) | Pure, deterministic reducers: the notification queue and the background-operation state machine. No React, DOM, clock or timers. Import-guarded by `test/unit/feedback/react-free.test.ts`. |
| **Feedback runtime (React)** | `app/shared/feedback/FeedbackProvider.tsx`, `NotificationCenter.tsx`, `feedback-context.ts` | The single provider (mounted once at AppShell): id/clock seams, dismissal timers + pause, `AbortController`s, live regions, and the hidden `useFeedback()` API. |
| **Inspector model (React-free)** | `app/shared/inspector/model.ts` (+ `inspector-url.ts`, `types.ts`) | The URL contract and value types/bounds. Import-guarded by `test/unit/inspector/react-free.test.ts`. |
| **Inspector runtime (React)** | `app/shared/inspector/InspectorProvider.tsx`, `Inspector.tsx`, `use-inspector-resize.ts`, `use-compact-viewport.ts` | The per-surface provider, the responsive panel, resize and compact-detection. Reuses the DS-03 hooks. |

DS-10 is a pure client interaction layer: **no migration, no persistence, no
server route, no new dependency** (the zero-dependency precedent of ADR-018–024
holds).

---

## Notification framework

### Using it

```tsx
import { useFeedback } from "~/shared/feedback";

function Example() {
  const feedback = useFeedback();
  feedback.notifySuccess("Task completed", { message: "“Draft plan” is done." });
  feedback.notifyInfo("Sync scheduled");
  feedback.notifyWarning("Storage almost full", { message: "92% used." });
  feedback.notifyError("Couldn’t save", { message: "You’re offline." });
}
```

`notify(kind, title, options?)` and the four tone helpers return a
`NotificationId`. Options: `message`, `duration` (`ms` or `null` for sticky),
`action` (`{ label, onSelect, dismissOnSelect? }`), `dedupeKey`.

### Behaviour (the calm rules)

- **Intelligent stacking.** A notification with a `dedupeKey` matching one already
  present **coalesces** onto it (count bumps, fields refresh, timer restarts, it
  moves to front) instead of stacking a duplicate. This is the antidote to toast
  spam — noisy repeats become one calm toast with a count.
- **Auto-dismiss appropriately.** Per-tone defaults ([`config.ts`](../../app/shared/feedback/config.ts)):
  success/info 5s, warnings 8s, **errors sticky** (dismiss only on demand — a
  failure is never yanked away before it is read).
- **Bounded stack.** At most `MAX_NOTIFICATIONS`; on overflow the **oldest
  auto-dismissing** entry is retired first, so a sticky error is never dropped by
  a burst of successes.
- **Pause on hover/focus.** Hovering or focusing anywhere in the centre freezes
  every dismissal timer; leaving resumes with the remaining time.
- **Placement.** Bottom-right on desktop, bottom full-width (safe-area aware) on
  mobile — anchored so it never covers primary UI.

### Accessibility

Tone is carried by an icon **and** text, never colour alone. Two always-mounted,
visually-hidden ARIA live regions announce feedback — **polite** for
success/info, **assertive** for warning/error — kept separate from the visible
toasts so screen readers announce once. They use **bare `aria-live`, not
`role="status"`/`role="alert"`**, so an app-global region never shadows another
loading/error region for `getByRole` or assistive tech. Actions and dismiss are
real buttons with text names and ≥44px targets; motion is disabled under
`prefers-reduced-motion`.

---

## Undo framework

Undo is a **platform capability, not per-module logic**. Any reversible action —
delete, archive, complete, move, close, dismiss — becomes undoable with one call:

```tsx
onDelete(record.id); // apply optimistically FIRST
feedback.notifyUndo(`Deleted “${record.title}”`, {
  onUndo: () => onRestore(record, index), // reverse it
  onExpire: () => commitDelete(record.id), // optional: finalise on the server
});
```

- **Choosing Undo** runs `onUndo` and opts out of commit.
- **Letting the window elapse** (default `UNDO_WINDOW_MS`) runs `onExpire`.
- **Dismissing the toast early** also runs `onExpire` — dismissing an
  optimistically-applied action commits it (the Gmail model).
- Pause-on-hover freezes the undo window so it is never yanked away mid-read.

Prefer this over a confirmation dialog ([interaction philosophy](../../AGENTS.md#7-interaction-philosophy)).
There is no delete-specific or archive-specific undo code anywhere — one method
covers them all.

---

## Operation lifecycle

One shared execution model for long-running work (AI, imports, exports, sync,
future integrations):

```tsx
const result = await feedback.runOperation({
  label: "Importing from Todoist",
  cancellable: true,
  retryable: true,
  successMessage: "Import complete",
  run: async ({ signal }) => importer.run({ signal }),
});
```

- **States:** `pending → running → success | failure` ([`operations.ts`](../../app/shared/feedback/operations.ts)).
  A row appears in the operations tray with a spinner while active.
- **Cancellation.** With `cancellable`, a Cancel button aborts the `AbortSignal`
  passed to `run`; the row is retired. `run` should observe `signal`.
- **Retry.** With `retryable`, a failure shows Retry, which re-invokes `run` as a
  new attempt (the attempt counter increments). Without it, a failure raises an
  error notification instead.
- **Return value.** `runOperation` resolves with the work's result or rejects with
  its error (after surfacing failure/retry), so callers can still `await` it.
- Success auto-clears the tray row after a short delay; a `successMessage` also
  raises a calm success toast.

> The `pending` status is modelled for a future queue/scheduler; today
> `runOperation` starts at `pending` and transitions to `running` immediately.

---

## Global Inspector

The **standard depth-editing surface** for any record (Task, Project, Person,
Note, Meeting, Goal, …). No module builds its own edit drawer after DS-10.

### Wiring a surface

```tsx
import { InspectorProvider, useInspector } from "~/shared/inspector";

function Surface() {
  return (
    <InspectorProvider renderInspector={renderInspector}>
      <List /> {/* a descendant calls useInspector().openInspector("task:123") */}
    </InspectorProvider>
  );
}

function renderInspector({ key }) {
  const record = lookup(key);
  if (!record) return null; // → a graceful not-found panel
  return {
    title: record.title,
    description: "Edit — changes save as you type",
    children: <RecordForm record={record} />, // DS-06 controls, optimistic save
  };
}
```

- **URL-driven.** Open state lives in `?inspector=<key>` (a single value — not the
  Drawer's stack), so an editing surface is deep-linkable, refresh-proof and
  Back/Forward-correct. `renderInspector(entry)` is exactly the DS-03
  `renderDrawer` contract.
- **Two presentations.** Desktop: a **non-modal, resizable** right-side
  `complementary` panel — the surrounding content reflows via padding so it is
  never covered, and the page stays interactive (bulk/multi-select possible).
  Mobile (below `md`): a **modal sheet** — focus-trapped, inert background,
  scroll-locked. The mode resolves after mount (SSR renders the docked form), so
  modal behaviour only engages on the client.
- **Reuses the DS-03 machinery.** The panel calls `useDrawerFocus` /
  `useBodyScrollLock` / `useInertBackground` (ADR-020 §20.9). Focus moves in on
  open and restores on close in both presentations; the Tab trap, scroll lock and
  inert walk engage ONLY in the compact sheet — **there is no second focus-trap**.
- **Resizing.** The docked panel's edge is a WAI-ARIA `separator` with pointer AND
  keyboard control (Left/Right widen/narrow, Home/End to bounds), clamped to
  `[INSPECTOR_MIN_WIDTH, INSPECTOR_MAX_WIDTH]` and persisted to `localStorage`.
- **Edits via DS-06.** The body is built from shared form controls with optimistic
  field-by-field autosave. Depth in the Inspector; essentials in the
  Summary/Drawer — never duplicate the control. `preventClose` (bool or predicate)
  guards Escape/close while there is unsaved work.

---

## Integration points

- **AppShell.** `FeedbackProvider` wraps the shell once
  ([`app/shared/shell/AppShell.tsx`](../../app/shared/shell/AppShell.tsx)), so
  `useFeedback()` works from any route (including the dev fixtures). The Inspector
  provider is mounted **per surface** (like the Drawer), because each surface
  knows how to render its own records.
- **DS-09 Command Palette.** DS-10 provides the pending/success/failure surface
  [ADR-024 §24.13](../decisions/ARCHITECTURE_DECISIONS.md#adr-024-command-palette--quick-actions--command-kinds-trusted-catalogue-authenticated-execution-and-one-shared-action)
  named as the prerequisite for **global executable-command shortcut dispatch**.
  Routing an executable command's shortcut through `runOperation` is a small,
  now-unblocked follow-up (kept out of DS-10 to stay one coherent change).
- **Selection / bulk actions.** The Inspector attaches to the same selection model
  the future bulk-action bar uses ([PRODUCT_EXPERIENCE #13](../design/PRODUCT_EXPERIENCE.md)).

## Testing

- **Pure model:** `test/unit/feedback/notifications.test.ts`,
  `operations.test.ts`, `test/unit/inspector/inspector-url.test.ts` — queue
  coalescing/bounds/sticky, the operation state machine, the URL contract.
- **React-free guards:** `test/unit/feedback/react-free.test.ts`,
  `test/unit/inspector/react-free.test.ts`.
- **Component:** `test/unit/feedback/FeedbackProvider.test.tsx` (timers,
  pause-on-hover, undo commit-vs-reverse, live-region tone, operation
  success/cancel/retry) and `test/unit/inspector/InspectorProvider.test.tsx`
  (open/close via URL, deep link, focus-in, keyboard resize, not-found,
  `preventClose`).
- **End-to-end:** `e2e/feedback.spec.ts` — desktop, 320px mobile (the sheet), and
  reduced-motion journeys, plus no-horizontal-overflow checks.
- **Development fixture:** `/design/feedback` (dev-only) exercises every tone,
  coalescing, undo restore, the operation lifecycle and the Inspector.

## Open-source review

Radix UI Toast, React-Aria/React-Spectrum, Ariakit, Sonner and `react-hot-toast`
(notifications) and Radix Dialog / React-Aria (Inspector) were reviewed —
**build, add no dependency**. DS-03 already owns the accessible modal machinery
the Inspector reuses, and the calm queue/undo/operation semantics are DalyHub
policy a general toast library does not encode; a dependency would add a second
overlay/z-index/portal system. See [`REFERENCE_PRODUCTS.md`](../reference/REFERENCE_PRODUCTS.md).

## Related documents

- [ADR-025](../decisions/ARCHITECTURE_DECISIONS.md#adr-025-the-global-interaction-layer--feedback-platform-notifications-undo-background-operations-and-the-shared-inspector) — the decision & rationale.
- [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md#global-interaction-layer-ds-10) — the pattern catalogue entries.
- [`SHARED_FORMS.md`](SHARED_FORMS.md) — the DS-06 controls the Inspector edits with.
- [`DESIGN_SYSTEM.md → Shared Drawer`](../design/DESIGN_SYSTEM.md#shared-drawer-ds-03) — the modal machinery the Inspector reuses.
