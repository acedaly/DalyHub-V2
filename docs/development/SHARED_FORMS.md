# SHARED_FORMS.md — The Shared Forms & field controls

> One entity-agnostic system for every create/edit surface: shared field controls, layered validation, a **declared** save model (explicit or autosave), and the entity-agnostic entity-link picker that creates real FND-04 EntityLinks.
>
> Decision & rationale: [ADR-022](../decisions/ARCHITECTURE_DECISIONS.md#adr-022-shared-forms--field-controls--declared-save-model-validation-boundary-and-the-entity-link-picker) ·
> Roadmap item: [DS-06](../roadmap/ROADMAP_V2.md#-ds-06--shared-forms--field-controls) ·
> Patterns: [DESIGN_SYSTEM.md → Forms](../design/DESIGN_SYSTEM.md#forms) and [→ Shared Forms (DS-06)](../design/DESIGN_SYSTEM.md#shared-forms--field-controls-ds-06) ·
> Links kernel: [FND-04 EntityLinks](../decisions/ARCHITECTURE_DECISIONS.md#adr-011-entitylink-persistence-and-lifecycle) · Markdown: [FND-08](../decisions/ARCHITECTURE_DECISIONS.md#adr-015-markdown-source-and-safe-rendering-pipeline)

## What it is

`app/shared/forms` is ONE reusable, entity-agnostic forms system. There is no `TaskForm`/`ProjectForm`/`NoteForm`. A consumer supplies typed values, per-field validation and a persistence callback, and composes shared controls with a form host. The shared UI never imports D1, repositories, workspace selection, routes or product modules; server loaders/actions keep the trusted workspace scope.

It resolves the "which forms save how?" uncertainty ([DEBT-03](../product/PRODUCT_DEBT.md)) by making the **save mode a declared, visible part of the contract**, and it turns the entity-link picker into a real [FND-04](../decisions/ARCHITECTURE_DECISIONS.md#adr-011-entitylink-persistence-and-lifecycle) relationship creator ([DEBT-08](../product/PRODUCT_DEBT.md)).

## The layers

| Layer | Location | Responsibility |
|---|---|---|
| Pure model (React-free) | [`~/shared/forms/model`](../../app/shared/forms/model.ts) | Validation combinators, dirty comparison, tags rules, deterministic date model, the explicit-save reducer, the autosave coordinator, entity-link option filtering. Import from here in non-UI code. |
| Controls & hosts | [`app/shared/forms`](../../app/shared/forms) | `Field` anatomy, the field controls, `useForm`/`useAutosaveField`, composition primitives, `EntityLinkPicker`. |
| Server service | [`app/platform/entity-links`](../../app/platform/entity-links) | Entity-agnostic glue that maps the picker's operations to the FND-04 repository (workspace scope stays server-side). |

An import-guard test (`test/unit/forms/react-free.test.ts`) fails if any pure-model file imports React — the same boundary discipline as DS-05/DS-07.

## The field contract

Every control accepts the same anatomy + binding props, so it is usable standalone or bound to a form host:

```tsx
<TextField label="Title" value={value} onChange={setValue} error={error} required />
// …or bound to a form host, which supplies id/value/error/onChange/onBlur/controlRef:
<TextField label="Title" {...form.field("title")} />
```

`Field` builds the accessible layout: a visible label, an explicit required/optional cue (words, not colour), optional help, the current validation message, and correct `aria-describedby`/`aria-invalid`/`aria-errormessage`. Disabled and read-only are distinct. Input is never trimmed/mutated unless the field contract asks for it.

**Controls:** `TextField` (single/multi-line, length, autocomplete), `MarkdownField` (source + safe preview), `DateField` (`kind="date" | "datetime"`), `SelectField` (single or `multiple`, `onSearch`/`loading` for async), `TagsField` (constraints), `BooleanField` (`variant="checkbox" | "switch"`), `EntityLinkPicker`.

## Explicit-save forms

```tsx
const form = useForm<Draft>({
  initialValues,
  fieldOrder: ["title", "due"],
  fields: {
    title: {
      validate: composeValidators(required("Give it a title."), maxLength(80, "Too long.")),
      validateAsync: async (value, signal) => checkUnique(value, signal), // server check
    },
    due: { validate: (v) => validateDateOnly(v) },
  },
  onSubmit: async (values) => {
    const res = await fetch(...); // your loader/action
    return res.ok ? { status: "success" } : { status: "error", fieldErrors: await res.json() };
  },
});

return (
  <Form onSubmit={form.handleSubmit} busy={form.isSubmitting}>
    <FormErrorSummary {...form} order={form.fieldOrder as string[]} onFocusField={form.focusField} />
    <TextField label="Title" {...form.field("title")} required />
    <DateField label="Due" {...form.field("due")} />
    <FormActions>
      <FormButton type="submit" variant="primary" pending={form.isSubmitting}>Save</FormButton>
      <FormButton type="button" onClick={form.reset}>Cancel</FormButton>
    </FormActions>
    <UnsavedChangesGuard when={form.isDirty && !form.isSubmitting} />
  </Form>
);
```

Guarantees: validation on blur and submit; submit blocked while invalid; first invalid field focused on failed submit; the complete draft preserved on any failure; server errors authoritative; duplicate submits prevented; Cancel restores the baseline; dirty comparison honours per-field `isEqual`. A submission commits its own **immutable snapshot** as the baseline, so an edit made while the save is in flight stays dirty and is never silently discarded.

For a form hosted in a DS-03 Drawer, pass the drawer key so the guard intercepts drawer close/replace/Back (same-pathname `drawer`-param navigations), not just pathname changes:

```tsx
<UnsavedChangesGuard when={form.isDirty && !form.isSubmitting} drawerKey={myDrawerKey} />
```

The confirm is a real modal (focus-trapped, inert background, Escape = Stay, focus restored to the initiating control on Stay).

## Autosaving fields

```tsx
const field = useAutosaveField<string>({
  initialValue,
  validate: required("Required."),
  onSave: async (value, signal) => { await persist(value, signal); }, // throw to fail
});

<TextField label="Title" value={field.value} onChange={field.onChange} onBlur={field.onBlur} error={field.validationError} />
<SaveStatusIndicator status={field.status} error={field.error} onRetry={field.retry} />
```

The trigger is documented and deterministic (a restrained debounce and a valid blur). The pure coordinator guarantees one save in flight, coalesce-to-latest, stale-response rejection, input preservation on failure, and no save while invalid. No per-keystroke toast — the quiet inline `SaveStatusIndicator` is the whole feedback.

## Dates

`DateField kind="date"` stores the literal ISO `YYYY-MM-DD` — validated/compared as integers, never routed through `Date`, so it cannot shift by timezone. `kind="datetime"` stores an ISO-8601 **UTC** instant; the control edits the UTC wall-clock explicitly (labelled). Use the model's `validateDateOnly` / `validateDateTimeLocal` as field validators. A zone-less wall-clock time is deliberately not a field type.

## Markdown

`MarkdownField` edits FND-08 **source** (preserved byte-for-byte) and previews only through the shared `renderMarkdownSource` → `MarkdownContent` pipeline. It adds no second parser and no HTML sink of its own (the single sanctioned sink stays in `MarkdownContent`); the `unified` renderer is lazy-loaded only when the preview opens. It is not the Notes editor.

## The entity-link picker (FND-04)

The picker UI is entity-agnostic and callback-driven — it never imports D1 or a repository. Wire it to a loader/action that uses the server service:

The picker's client configuration is **presentation only**. Link CREATION is authorised by a **server-supplied policy** — never by the client's submitted type/direction/target:

```ts
// server (loader/action)
import { resolveWorkspaceScope } from "~/platform/workspaces";
import {
  searchLinkTargets,
  listActiveLinks,
  createLinkWithPolicy,
  unlinkLink,
  type EntityLinkPickerPolicy,
} from "~/platform/entity-links";

const scope = await resolveWorkspaceScope(env);
const deps = { entities: scope.entities, entityLinks: scope.entityLinks };

// The authoritative policy, built from TRUSTED server context:
const policy: EntityLinkPickerPolicy = {
  anchorId,
  allowedDirections: ["outgoing"],
  linkTypes: [
    { type: "project.supporting_note", allowedTargetTypes: ["note"] },
  ],
  multiple: true,
};

// search: searchLinkTargets(deps, { anchorId, query, targetTypes })
// list:   listActiveLinks(deps, { anchorId, direction, linkTypes })
// create: const result = await createLinkWithPolicy(deps, policy, { targetId, linkType, direction })
//         → result.ok ? … : show result.message (typed, safe — never a raw error)
// remove: unlinkLink(deps, linkId)
```

`createLinkWithPolicy` validates every untrusted attribute against the policy — direction allowed, link type permitted, target type allowed, no self-link, anchor/target accessible, single-selection limit — before delegating to the FND-04 repository (which enforces workspace scope, reserved spine types and duplicate uniqueness). It returns `{ok:true,…}` or `{ok:false, reason, message}` — translate `message` into calm UI text.

```tsx
// client
<EntityLinkPicker
  label="Related items"
  anchorId={anchor.id}
  linkTypes={[{ type: "project.supporting_note", label: "Supporting note" }]}
  direction="outgoing"
  existingLinks={links}
  searchTargets={(q, signal) => fetchTargets(q, signal)}
  onLink={({ target, linkType, direction }) => postLink(...)}
  onUnlink={(link) => postUnlink(link.linkId)}
  renderTargetIcon={(type) => <EntityIcon type={getEntityIdentity(type)!.type} size={16} />}
/>
```

Direction is honoured exactly (`outgoing` → anchor is the source; `incoming` reverses the endpoints). The service creates/removes links through the existing repository only — no second relationship table, no migration. The picker excludes the anchor, prevents duplicate active links, bounds results, and never leaks an inaccessible entity's title. The `searchTargets` contract lets [DS-08](../roadmap/ROADMAP_V2.md#-ds-08--shared-search) supply real search later without replacing the picker.

## Accessibility

Every field has an accessible name; errors and save-status changes are announced through live regions; all controls are keyboard-complete (combobox/listbox via `useCombobox`; tags add/remove without a mouse); the first invalid field is focused on failed submit; 44px touch targets; no colour-only state; disabled vs read-only are semantically distinct; no horizontal overflow at 320px; usable at 200% zoom; light/dark; reduced motion honoured. Prefer native HTML; use ARIA only where native semantics are insufficient.

## Development demonstration

`/design/forms` (dev-only, excluded from production by the `NODE_ENV` guard in `app/routes.ts`) demonstrates the explicit-create and autosaving forms, every control, blur/submit validation, a server failure that preserves the draft, retry, Markdown preview, dirty-navigation protection, duplicate-submit protection, and entity-link search/create/remove. Fixtures never become production records or navigation. The real FND-04 integration is proven by `test/kernel/entity-link-picker-service.test.ts` against a real D1 database.

## What DS-06 deliberately does NOT do

- No product CRUD screens (Areas/Goals/Projects/Tasks/Notes/People/Diary), no full Notes/Markdown editor, no DS-08 global search, no DS-09 command palette, no DS-10 Inspector/Settings.
- No second EntityLink model, no tags persistence model, no new dependency, no migration.
- No product-specific validation rules — those live in the module that adopts DS-06.

## Related documents

- [ADR-022](../decisions/ARCHITECTURE_DECISIONS.md#adr-022-shared-forms--field-controls--declared-save-model-validation-boundary-and-the-entity-link-picker) — the decision & rationale.
- [DESIGN_SYSTEM.md → Shared Forms (DS-06)](../design/DESIGN_SYSTEM.md#shared-forms--field-controls-ds-06) — the pattern contract.
- [MARKDOWN_PIPELINE.md](MARKDOWN_PIPELINE.md) — the FND-08 source/render boundary the Markdown control uses.
- [DATA_KERNEL.md](DATA_KERNEL.md) — the entity/EntityLink repositories the picker service composes.
- [docs/README.md](../README.md) — the documentation index.
