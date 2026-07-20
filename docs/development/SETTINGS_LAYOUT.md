# SETTINGS_LAYOUT.md — The Shared Settings layout (DS-10b)

> ONE entity-agnostic Settings surface every DalyHub module composes for
> application, workspace, module and record-level settings, and for the final
> **Settings** tab/section of a record Inspector or Drawer. There is no bespoke
> settings screen: a module supplies typed values, async apply/confirm callbacks
> and copy, and composes these primitives over DS-06 controls and the DS-10
> Feedback platform.
>
> Decision & rationale: [ADR-026](../decisions/ARCHITECTURE_DECISIONS.md#adr-026-shared-settings-layout--composition-primitives-declared-change-behaviour-and-the-dangerous-action-contract) ·
> Roadmap item: [DS-10b](../roadmap/ROADMAP_V2.md#-ds-10b--settings-layout) ·
> Patterns: [DESIGN_SYSTEM.md → Settings (DS-10b)](../design/DESIGN_SYSTEM.md#settings-layout-ds-10b) ·
> Builds on: [DS-06 Forms](SHARED_FORMS.md), the [DS-10 Feedback platform & Inspector](FEEDBACK_AND_INSPECTOR.md) and the [DS-03 Drawer](../design/DESIGN_SYSTEM.md#shared-drawer-ds-03) modal machinery.

## What it is

`app/shared/settings` is the ONE Settings system. It is **presentation +
interaction contract only** — it encodes no product rule (no Project/Task/Person
deletion or archival logic, no persistence, no migration). It reuses, and does not
re-implement, the existing platform:

- **explicit-save** settings use DS-06's `useForm` (dirty tracking, validation,
  Save/Cancel, duplicate-submit prevention, first-invalid focus);
- **autosave** settings use DS-06's `useAutosaveField` + `SaveStatusIndicator`;
- **immediate** settings use `useImmediateSetting`, a thin coordinator that
  composes the pure immediate model with the DS-10 `useFeedback` platform;
- **dangerous** actions reuse the DS-03 modal machinery (`useDrawerFocus` /
  `useBodyScrollLock` / `useInertBackground`) — no second focus-trap or overlay;
- **feedback** is always the DS-10 platform — no bespoke toast.

## The layers

| Layer | Location | Responsibility |
|---|---|---|
| Pure model (React-free) | [`~/shared/settings/model`](../../app/shared/settings/model.ts) | The dangerous-confirmation rules (`confirmation.ts`) and the immediate-apply coordinator (`immediate.ts`). Import from here in non-UI code. |
| Layout primitives | [`app/shared/settings`](../../app/shared/settings) | `SettingsLayout`, `SettingsGroup`, `SettingsRow`. |
| Dangerous actions | same | `ConfirmationDialog`, `DangerousAction`. |
| Immediate hook | same | `useImmediateSetting`. |

An import-guard test (`test/unit/settings/react-free.test.ts`) fails if any
pure-model file imports React — the same boundary discipline as DS-05/DS-06/DS-07.

## Structure primitives

```tsx
import {
  SettingsLayout,
  SettingsGroup,
  SettingsRow,
} from "~/shared/settings";

<SettingsLayout title="Workspace settings" description="…">
  <SettingsGroup title="General" description="…">
    <SettingsRow label="…" description="…" control={…} />
  </SettingsGroup>
  <SettingsGroup title="Danger zone" tone="danger">
    {/* DangerousAction rows */}
  </SettingsGroup>
</SettingsLayout>
```

- **`SettingsLayout`** — the surface root: an accessible `region`, an optional
  heading + description (omit the heading when the host supplies it — a Drawer
  title, an Inspector title, or a record tab), and consistent rhythm between
  groups. It is a **container query** surface: it adapts to its own width, so the
  same layout is correct in a full route and in a 320px Drawer.
- **`SettingsGroup`** — a labelled section (`title`, optional `description`,
  `headingLevel`). `tone="danger"` renders the visually-separated dangerous region
  (bordered, tinted card + a warning glyph). The differentiation is **never
  colour-only**: the heading text, the icon and the border all carry it.
- **`SettingsRow`** — one setting: a text block (label · supporting description ·
  optional status/help line) beside a control area. Label/description and control
  sit side-by-side when there is room and stack cleanly when narrow — no
  horizontal overflow, no clipped text.

### Which naming pattern for a row?

`SettingsRow` supports both accessible-naming patterns, no double-labelling:

1. **Row-owned name** (recommended for bare controls — a native switch/select):
   pass `label`; use the render-prop `control` and wire the ids onto the bare
   control:

   ```tsx
   <SettingsRow
     label="Compact mode"
     description="Denser lists and cards."
     control={(ids) => (
       <input
         id={ids.controlId}
         type="checkbox"
         role="switch"
         className="dh-settings-switch"
         aria-labelledby={ids.labelId}
         aria-describedby={ids.describedById}
         checked={value}
         onChange={(e) => apply(e.target.checked)}
       />
     )}
   />
   ```

2. **Self-named control** (a DS-06 field with its own label, or a button): render
   it directly as `control`. Do **not** also pass a row `label` for a self-labelled
   DS-06 field — the field owns its label/description/error.

## Change behaviours

### Immediate settings (apply on change)

```tsx
import { SettingsRow, useImmediateSetting } from "~/shared/settings";

const setting = useImmediateSetting<boolean>({
  initialValue: false,
  successMessage: "Preference saved",
  onApply: async (value, signal) => persist(value, signal), // throw to fail
});
// control: setting.value (optimistic), setting.pending, setting.apply(next)
```

The pure coordinator (`immediate.ts`) guarantees an **optimistic** value,
**single-flight with coalesce-to-latest**, **stale-response rejection** and
**revert-on-failure** — a toggle that fails to save flips back. Success/error are
confirmed through the shared DS-10 Feedback platform (a `dedupeKey` coalesces
repeats). This is deliberately different from DS-06 autosave, which keeps the draft
on failure; use autosave for a text field that saves quietly with an inline status,
and immediate for a toggle/select that applies at once with a toast.

### Explicit-save settings (dirty draft + Save/Cancel)

Use DS-06's `useForm` directly — DS-10b adds no second form engine:

```tsx
const form = useForm<Draft>({ initialValues, fields: { name: { validate } }, onSubmit });
return (
  <Form onSubmit={form.handleSubmit} busy={form.isSubmitting}>
    <FormErrorSummary … />
    <SettingsRow control={<TextField label="Display name" {...form.field("name")} />} />
    <FormActions>
      <FormButton type="submit" variant="primary" pending={form.isSubmitting}>Save</FormButton>
      <FormButton type="button" onClick={form.reset} disabled={!form.isDirty}>Cancel</FormButton>
    </FormActions>
  </Form>
);
```

The DS-06 states cover the required behaviour end-to-end: **pristine** (`!isDirty`),
**dirty** (`isDirty`), **validating** (async validators in flight), **saving**
(`isSubmitting`), **saved** (success commits the snapshot as the new baseline),
**save failed** (`submit.status === "error"`, draft preserved, server errors
authoritative), **retry** (submit again), **reset/revert** (`form.reset`). Duplicate
submissions are prevented synchronously by the form host.

## Dangerous actions

```tsx
import { DangerousAction } from "~/shared/settings";

<SettingsGroup title="Danger zone" tone="danger">
  <DangerousAction
    label="Delete this workspace"
    description="Permanently delete the workspace and everything in it."
    actionLabel="Delete workspace…"
    confirmTitle="Delete workspace?"
    confirmBody={<>This permanently deletes <strong>…</strong>. It cannot be undone.</>}
    confirmLabel="Delete workspace"
    busyLabel="Deleting…"
    typedConfirmation={{ phrase: "DELETE" }}   // optional
    successMessage="Workspace deleted"
    onConfirm={async () => { /* your action; throw to show an inline error + retry */ }}
  />
</SettingsGroup>
```

`DangerousAction` composes a `SettingsRow` (label + consequence) with a destructive
button that opens the shared `ConfirmationDialog`. The dialog:

- is a WAI-ARIA **modal** (`role="dialog"`, `aria-modal`), reusing the DS-03 focus
  hooks — **no second focus-trap**;
- places **initial focus** on the typed-confirmation input when present, else the
  safe **Cancel** button — never the destructive one;
- **restores focus** to the trigger on close (a post-close safety net mirrors the
  Drawer/Inspector, so it is deterministic across browsers);
- gates **Confirm** behind an optional **typed confirmation** (an exact, case- and
  whitespace-significant phrase — e.g. `DELETE`);
- **prevents duplicate submissions** while a confirmation is in flight (Confirm and
  Cancel are disabled);
- surfaces a failure as an inline **`role="alert"`**, keeping the dialog open so the
  user can **retry**;
- raises the success through the shared DS-10 **Feedback** platform;
- is cancellable by Cancel, Escape and the scrim; honours reduced motion and the
  mobile safe area.

For a bespoke confirmation (not a settings row), use `ConfirmationDialog` directly.
The component provides the interaction contract only — it encodes no product rule
about what gets deleted; the consumer's `onConfirm` does.

## Where Settings fits

- **A full settings route / workspace pane:** render `SettingsLayout` with a
  heading in the pane.
- **A Drawer or the shared Inspector:** render `SettingsLayout` **without** a
  heading (the host supplies the title); the container query handles the narrow
  width.
- **The last record tab/section:** "Settings" is always the last tab
  ([DESIGN_SYSTEM.md → Tabs](../design/DESIGN_SYSTEM.md#tabs)); render
  `SettingsLayout` (heading omitted or lowered) as its content.

## Accessibility

Meets **WCAG 2.2 AA**: semantic headings and grouping (`region`/`group`, real
headings); labels/descriptions associated via `aria-labelledby`/`aria-describedby`;
keyboard-complete (every control, the dialog, the danger button); visible focus;
status/errors announced (the dialog error is a live `alert`; a row status may be a
polite live region using bare `aria-live`, never `role="status"`); no colour-only
meaning (the danger region and status tones carry icon/shape + text); ≥44px targets
(switch, buttons, inputs); correct focus placement + restoration for confirmations;
reduced motion honoured; no 320px horizontal overflow; usable at 200% zoom; light &
dark.

## Development demonstration

`/design/settings` (dev-only, excluded from production by the `NODE_ENV` guard in
`app/routes.ts`) demonstrates grouped ordinary settings, an immediate toggle and
select, an explicit-save text setting with validation, save success, simulated
failure + retry and dirty cancel/revert, a dangerous action with typed confirmation
and failure/retry, long labels/descriptions, disabled and loading controls, and the
layout embedded in a constrained container. Fixtures are in-memory only — no
repositories, D1, bindings, migration or persistence.

## What DS-10b deliberately does NOT do

- No product settings (Projects/Tasks/People/…), no record deletion or archival
  rules, no application preferences, workspace administration, account, auth,
  billing or integrations.
- No second form engine, validation system, autosave hook, dirty-state model, toast
  system, overlay or focus-trap; no central switch statement; no settings registry.
- No new dependency, no D1 migration, no persistence.

## Related documents

- [ADR-026](../decisions/ARCHITECTURE_DECISIONS.md#adr-026-shared-settings-layout--composition-primitives-declared-change-behaviour-and-the-dangerous-action-contract) — the decision & rationale.
- [DESIGN_SYSTEM.md → Settings (DS-10b)](../design/DESIGN_SYSTEM.md#settings-layout-ds-10b) — the pattern contract.
- [SHARED_FORMS.md](SHARED_FORMS.md) — the DS-06 controls and save models Settings reuses.
- [FEEDBACK_AND_INSPECTOR.md](FEEDBACK_AND_INSPECTOR.md) — the DS-10 Feedback platform and the modal machinery Settings reuses.
- [docs/README.md](../README.md) — the documentation index.
