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

**Controls:** `TextField` (single/multi-line, length, autocomplete), `DateField` (`kind="date" | "datetime"`), `SelectField` (single or `multiple`, `onSearch`/`loading` for async), `TagsField` (constraints), `BooleanField` (`variant="checkbox" | "switch"`), `EntityLinkPicker`. **Long-form Markdown is not here** — see below.

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

**Where an error is SHOWN depends on how it was produced (HARDEN-02).** A blur (or
an async check answering after one) puts the message on the FIELD, beside the
control it is about, and nowhere else. `FormErrorSummary` — the assertive live
region that lists every problem and offers a jump to each — belongs to an attempt
the owner made, so it appears after a failed **submit** and not before. That is
what its own contract has always said, and it is not cosmetic: the summary is
inserted above the whole form, so growing one on a blur moves every control below
it, and a control that moves between `pointerdown` and `pointerup` receives no
click at all.

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

### Reconciling a server-side change (NOTES-05, closing DEBT-47)

A field can change on the SERVER while an editor is mounted — another tab, another device, another surface writing the same field. Pass the field's current server value and the coordinator applies one documented contract:

```tsx
const field = useAutosaveField<string>({
  initialValue: content,
  serverValue: content,   // the loader revalidates, so this IS the server's value
  onSave,
});

{field.remoteValue !== null ? (
  <RemoteChangeBanner
    what="This note"
    saving={field.status === "saving"}
    onAdopt={field.adoptRemote}
    onDismiss={field.dismissRemote}
  />
) : null}
```

| Field state | Behaviour |
| --- | --- |
| **Clean** — no pending edit, no save in flight, no failed save | The external value is **adopted silently**. There is no draft to lose, so asking would be noise. |
| **Dirty** | **Nothing visible changes.** The draft is untouched and the newer value is parked in `remoteValue` for the UI to offer. |

`adoptRemote` takes the server's version (discarding the draft — destructive, so never automatic, and refused while a save is in flight because that save would land afterwards); `dismissRemote` keeps the draft and stops offering. "Keep mine" IS last-write-wins, but a **deliberate** one the user asked for.

**Deliberately not built: automatic merging.** There is no deterministic safe merge for prose, and a wrong merge produces content neither person wrote — worse than either version. An honest banner beats a clever guess.

**It is opt-in.** Omit `serverValue` and behaviour is exactly as before: `initialValue` seeds the draft once and the hook owns it. Adopt the contract per field, as each field's workflow needs it.

### When the SERVER refuses the save (AUDIT-08)

The contract above only fires when the caller NOTICES the server-side change and feeds it in. Two tabs left open on one record need not revalidate before one of them saves, so the server is the backstop: a field whose write carries a base-version precondition can be refused outright. That is a third outcome, and `onSave` reports it as one:

```tsx
onSave: async (value, signal) => {
  const result = await post(value, signal);      // throw to fail
  if (result.conflict) {
    setServerValue(result.serverContent);        // fed back in as `serverValue`
    return { outcome: "conflict" };              // NOT a success, NOT an error
  }
},
```

| Outcome | What the coordinator does |
| --- | --- |
| resolve with nothing | The sent value is committed. Unchanged. |
| **resolve with `{ outcome: "conflict" }`** | **Nothing is committed.** The draft stays exactly as typed, the status returns to `unsaved` (never `error` — nothing malfunctioned, so there is nothing useful to retry), and the newer server value arrives through `serverValue` and is parked for the same banner. |
| reject | The save failed. `error` status, draft preserved, Retry offered. Unchanged. |

Two rules the caller owns, and both matter:

- **Hold the quoted base version until the owner answers the banner.** Advancing it on the refusal makes the very next save — a stray blur, the debounce — succeed silently, which is the overwrite the precondition exists to stop. Advance it on `adoptRemote` / `dismissRemote`.
- **Do not save while a change is parked.** Such a save is certain to be refused, and it disables the banner's own buttons for the round trip, right as the owner reaches for them. `NoteContentForm` suppresses its blur-save while `remoteValue !== null`.

Worked example: [`NoteContentForm.tsx`](../../app/modules/notes/NoteContentForm.tsx).

## Dates

`DateField kind="date"` stores the literal ISO `YYYY-MM-DD` — validated/compared as integers, never routed through `Date`, so it cannot shift by timezone. `kind="datetime"` stores an ISO-8601 **UTC** instant; the control edits the UTC wall-clock explicitly (labelled). Use the model's `validateDateOnly` / `validateDateTimeLocal` as field validators. A zone-less wall-clock time is deliberately not a field type.

## Markdown

**There is no Markdown control in this package, and that is deliberate (DOC-EDITOR-01 / [ADR-084](../decisions/ARCHITECTURE_DECISIONS.md#adr-084-long-form-markdown-is-edited-on-a-permanent-shared-writing-surface--there-is-no-read-then-activate-variant)).** A form that needs a long-form field uses **`MarkdownEditorField`** from [`~/shared/markdown-editor`](../design/DESIGN_SYSTEM.md#shared-writing-surface-edit-01) — the shared writing surface wearing this package's field anatomy (a real visible label row with the required/optional cue, help text, an error slot), so it stands in a `<Form>` beside `TextField` without looking like a transplant. It edits FND-08 **source**, preserved byte for byte, and renders only through the shared `renderMarkdownSource` → `MarkdownContent` pipeline.

It is outside this barrel for two reasons. `~/shared/forms` is imported by nearly every route, and re-exporting the editor from it would pull the writing surface into bundles that only render a text input. And a Markdown control sitting in the barrel is what re-opens the divergence EDIT-02 closed: the earlier `MarkdownField` — a source textarea plus a "Show preview" disclosure — outlived its last product consumer by a whole release, and was found still exported with one importer, the design fixture documenting it. It is deleted, and a repository test fails if anything Markdown is exported from here again.

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
  unlinkWithPolicy,
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
// remove: const r = await unlinkWithPolicy(deps, policy, linkId)
//         → r.ok ? … : show r.message
```

`createLinkWithPolicy` validates every untrusted attribute against the policy — direction allowed, link type permitted, target type allowed, no self-link, anchor/target accessible, single-selection limit — before delegating to the FND-04 repository (which enforces workspace scope, reserved spine types and duplicate uniqueness). `unlinkWithPolicy` is likewise authorised: it verifies the link exists in the workspace, is actually anchored to `policy.anchorId`, and its type + direction are permitted, before removing it — a crafted id (another anchor, an un-offered type, another workspace) is refused. Both return `{ok:true,…}` or `{ok:false, reason, message}` — translate `message` into calm UI text. The `multiple:false` limit is **concurrency-safe**: because a pre-check + create is a TOCTOU race, `createLinkWithPolicy` reconciles after creating (keeping the deterministically-earliest link and rolling back its own if it lost), so two concurrent creates converge on exactly one active link.

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

### Navigable existing links

Each **existing link's title is an accessible link to the related record** via the ONE shared entity-destination helper (`entityDestination` in [`app/shared/entity/destination.ts`](../../app/shared/entity/destination.ts), rendered by [`EntityLink`](../../app/shared/entity/EntityLink.tsx)):

- Area / Goal / Project / Note → their canonical record route; Task → the shared Task Drawer (`task:<id>`) opened over the current context, restoring focus to the link on close; every other type (person, meeting, …) → **plain, non-interactive text** (no genuine destination yet — never a "Coming Soon" link).
- The title link and the **Remove** button are SEPARATE, independently-focusable controls (no nested interactivity): activating the title navigates and never unlinks; Remove never navigates. Archived / read-only records (Remove hidden) stay navigable. The accessible name carries the record TYPE + title ("Project: Website relaunch"); the id is never exposed in visible text; long titles wrap.
- The helper is **storage-independent and maps identity → destination only — it never infers access.** Only records already resolved by a trusted server loader reach the picker, and a missing / inaccessible / unsupported target degrades to text.

Structural relationship rows on the record surfaces (Project record Area/Goal, Task Drawer Area/Goal/Project) use the SAME `EntityLink`, so a visible relationship is a navigation path wherever a destination exists.

## Accessibility

Every field has an accessible name; errors and save-status changes are announced through live regions; all controls are keyboard-complete (combobox/listbox via `useCombobox`; tags add/remove without a mouse); the first invalid field is focused on failed submit; 44px touch targets; no colour-only state; disabled vs read-only are semantically distinct; no horizontal overflow at 320px; usable at 200% zoom; light/dark; reduced motion honoured. On touch/coarse-pointer devices, text inputs, comboboxes, clear/remove buttons, link-picker controls and retry buttons lift to the shared touch-target floor while preserving the same DOM and keyboard behaviour. Prefer native HTML; use ARIA only where native semantics are insufficient.

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
