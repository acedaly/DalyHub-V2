/**
 * DS-06 — Shared Forms & field controls demonstration route (development only).
 *
 * A FIXTURE, not a product surface. It is added to the route tree only when NOT
 * building for production (the `NODE_ENV` guard in `app/routes.ts`), so it never
 * reaches a deployed Worker, and it is not a module — it never appears in
 * registry-driven navigation. It composes ENTIRELY from the shared DS-06 forms
 * system over DS-01 tokens; there is no bespoke form logic here.
 *
 * All data is in-memory fixture data (no production repositories, D1 or bindings).
 * The entity-link picker is driven by an in-memory target search and link store so
 * the journey is deterministic; the REAL FND-04 integration (creating a queryable
 * EntityLink through the kernel repository) is proven separately by the Workers
 * integration test `test/kernel/entity-link-picker-service.test.ts`, which drives
 * the same `app/platform/entity-links` service against a real D1 database.
 */

import { useEffect, useMemo, useState } from "react";

import { DrawerProvider } from "~/shared/drawer";
import { EntityIcon, getEntityIdentity } from "~/shared/entity";
import {
  BooleanField,
  DateField,
  EntityLinkPicker,
  Form,
  FormActions,
  FormButton,
  FormErrorSummary,
  FormSection,
  SaveStatusIndicator,
  SelectField,
  TagsField,
  TextField,
  UnsavedChangesGuard,
  composeValidators,
  maxLength,
  minLength,
  required,
  useAutosaveField,
  useForm,
  validateDateOnly,
  validateDateTimeLocal,
  type EntityLinkSelection,
  type EntityLinkTargetOption,
  type SubmitOutcome,
} from "~/shared/forms";
import { MarkdownEditorField } from "~/shared/markdown-editor";

import "~/styles/forms-demo.css";

export function meta() {
  return [{ title: "Shared Forms · DalyHub design fixtures" }];
}

// ---------------------------------------------------------------- fixture data

interface DemoEntity {
  readonly id: string;
  readonly type: string;
  readonly title: string;
}

const DEMO_ANCHOR: DemoEntity = {
  id: "demo-anchor-project",
  type: "project",
  title: "Website relaunch",
};

const DEMO_TARGETS: readonly DemoEntity[] = [
  { id: "demo-note-brief", type: "note", title: "Creative brief" },
  { id: "demo-note-audit", type: "note", title: "Content audit" },
  { id: "demo-person-mel", type: "person", title: "Mel Okoye" },
  { id: "demo-person-sam", type: "person", title: "Sam Rivera" },
  { id: "demo-goal-brand", type: "goal", title: "Refresh the brand" },
  { id: "demo-task-copy", type: "task", title: "Write homepage copy" },
  { id: "demo-meeting-kick", type: "meeting", title: "Kickoff meeting" },
];

const STATUS_OPTIONS = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked", description: "Waiting on something" },
  { value: "done", label: "Done" },
];

const LABEL_OPTIONS = [
  { value: "priority", label: "Priority" },
  { value: "design", label: "Design" },
  { value: "content", label: "Content" },
  { value: "eng", label: "Engineering" },
];

const LINK_TYPES = [
  { type: "project.supporting_note", label: "Supporting note" },
  { type: "project.involves_person", label: "Involves person" },
];

// ---------------------------------------------------------------- explicit form

type ProjectDraft = {
  readonly title: string;
  readonly description: string;
  readonly due: string;
  readonly startsAt: string;
  readonly status: string;
  readonly labels: readonly string[];
  readonly tags: readonly string[];
  readonly pinned: boolean;
  readonly notify: boolean;
};

const INITIAL_DRAFT: ProjectDraft = {
  title: "",
  description: "",
  due: "",
  startsAt: "",
  status: "todo",
  labels: [],
  tags: [],
  pinned: false,
  notify: false,
};

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  description: "Description",
  due: "Due date",
  startsAt: "Starts at",
  status: "Status",
  labels: "Labels",
  tags: "Tags",
};

function ExplicitFormDemo() {
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [saved, setSaved] = useState<ProjectDraft | null>(null);

  const form = useForm<ProjectDraft>({
    initialValues: INITIAL_DRAFT,
    fieldOrder: [
      "title",
      "description",
      "due",
      "startsAt",
      "status",
      "labels",
      "tags",
    ],
    fields: {
      title: {
        validate: composeValidators(
          required("Give the project a title."),
          minLength(3, "Use at least 3 characters."),
          maxLength(80, "Keep the title under 80 characters."),
        ),
        // Async/server-style check: "taken" is already in use.
        validateAsync: async (value) => {
          await new Promise((resolve) => setTimeout(resolve, 150));
          return value.trim().toLocaleLowerCase() === "taken"
            ? { ok: false, message: "That title is already taken." }
            : { ok: true };
        },
      },
      due: { validate: (value) => validateDateOnly(value) },
      startsAt: { validate: (value) => validateDateTimeLocal(value) },
      status: { validate: required("Choose a status.") },
    },
    onSubmit: async (values): Promise<SubmitOutcome<ProjectDraft>> => {
      // Simulate latency so duplicate-submit protection is observable.
      await new Promise((resolve) => setTimeout(resolve, 400));
      if (simulateFailure) {
        return {
          status: "error",
          formError:
            "The server couldn’t save this project right now. Your draft is safe — try again.",
        };
      }
      setSaved(values);
      return { status: "success" };
    },
  });

  const [links, setLinks] = useState<readonly EntityLinkSelection[]>([]);

  const searchTargets = async (
    query: string,
    signal: AbortSignal,
  ): Promise<readonly EntityLinkTargetOption[]> => {
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (signal.aborted) return [];
    const needle = query.trim().toLocaleLowerCase();
    return DEMO_TARGETS.filter(
      (target) =>
        needle.length === 0 ||
        target.title.toLocaleLowerCase().includes(needle),
    ).map((target) => ({
      id: target.id,
      type: target.type,
      title: target.title,
    }));
  };

  return (
    <section className="forms-demo__panel" data-testid="explicit-form">
      <h2>Explicit-create form</h2>
      <p className="forms-demo__note">
        A form where commitment matters: Save and Cancel, dirty tracking,
        validation on blur and submit, first-invalid focus, and a draft that
        survives a server failure.
      </p>

      <UnsavedChangesGuard when={form.isDirty && !form.isSubmitting} />

      <Form
        aria-label="Create project"
        busy={form.isSubmitting}
        onSubmit={form.handleSubmit}
      >
        <FormErrorSummary
          formError={form.formError}
          fieldErrors={form.fieldErrors}
          order={form.fieldOrder as string[]}
          labels={FIELD_LABELS}
          onFocusField={form.focusField}
        />

        <FormSection title="Basics">
          <TextField
            label="Title"
            help='Try "taken" to see async validation reject it.'
            required
            maxLength={80}
            showLength
            autoComplete="off"
            {...form.field("title")}
          />
          <MarkdownEditorField
            label="Description"
            help="Markdown — headings, lists, quotes and tables format as you type."
            {...form.field("description")}
          />
        </FormSection>

        <FormSection title="Schedule">
          <DateField label="Due date" {...form.field("due")} />
          <DateField
            label="Starts at"
            kind="datetime"
            {...form.field("startsAt")}
          />
        </FormSection>

        <FormSection title="Classification">
          <SelectField
            label="Status"
            required
            options={STATUS_OPTIONS}
            {...form.field("status")}
          />
          <SelectField
            label="Labels"
            multiple
            options={LABEL_OPTIONS}
            placeholder="Add labels…"
            {...form.field("labels")}
          />
          <TagsField
            label="Tags"
            constraints={{ maxTags: 6, caseInsensitive: true }}
            {...form.field("tags")}
          />
        </FormSection>

        <FormSection title="Options">
          <BooleanField label="Pin to top" {...form.field("pinned")} />
          <BooleanField
            label="Notify collaborators"
            variant="switch"
            {...form.field("notify")}
          />
        </FormSection>

        <FormSection title="Related">
          <EntityLinkPicker
            label="Related items"
            help="Search to link notes and people to this project."
            anchorId={DEMO_ANCHOR.id}
            linkTypes={LINK_TYPES}
            existingLinks={links}
            searchTargets={searchTargets}
            renderTargetIcon={(type) =>
              getEntityIdentity(type) ? (
                <EntityIcon type={getEntityIdentity(type)!.type} size={16} />
              ) : null
            }
            onLink={async ({ target, linkType, direction }) => {
              await new Promise((resolve) => setTimeout(resolve, 120));
              setLinks((current) => [
                ...current,
                {
                  linkId: `demo-link-${target.id}-${linkType}`,
                  target,
                  linkType,
                  direction,
                },
              ]);
            }}
            onUnlink={async (link) => {
              await new Promise((resolve) => setTimeout(resolve, 80));
              setLinks((current) =>
                current.filter((l) => l.linkId !== link.linkId),
              );
            }}
          />
        </FormSection>

        <BooleanField
          label="Simulate a server failure on save"
          value={simulateFailure}
          onChange={setSimulateFailure}
        />

        <FormActions>
          <FormButton
            type="submit"
            variant="primary"
            pending={form.isSubmitting}
            pendingLabel="Saving…"
          >
            Save
          </FormButton>
          <FormButton
            type="button"
            variant="ghost"
            disabled={form.isSubmitting}
            onClick={form.reset}
          >
            Cancel
          </FormButton>
          <span className="forms-demo__dirty" data-testid="dirty-state">
            {form.isDirty ? "Unsaved changes" : "No changes"}
          </span>
        </FormActions>
      </Form>

      {saved ? (
        <p className="forms-demo__saved" data-testid="explicit-saved">
          Saved “{saved.title}”.
        </p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- autosave form

function AutosaveFieldDemo({
  label,
  initial,
  failOn,
}: {
  readonly label: string;
  readonly initial: string;
  readonly failOn?: string;
}) {
  const field = useAutosaveField<string>({
    initialValue: initial,
    debounceMs: 400,
    validate: required("This can’t be empty."),
    onSave: async (value) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (failOn && value.toLocaleLowerCase().includes(failOn)) {
        throw new Error("simulated failure");
      }
    },
  });

  return (
    <div className="forms-demo__autosave-row">
      <TextField
        label={label}
        value={field.value}
        onChange={field.onChange}
        onBlur={field.onBlur}
        error={field.validationError}
        help={
          failOn
            ? `Type "${failOn}" to see a save failure and retry.`
            : "Saves on blur or a short pause."
        }
      />
      <SaveStatusIndicator
        status={field.status}
        error={field.error}
        onRetry={field.retry}
      />
    </div>
  );
}

function AutosaveFormDemo() {
  return (
    <section className="forms-demo__panel" data-testid="autosave-form">
      <h2>Autosaving edit form</h2>
      <p className="forms-demo__note">
        Field-by-field editing with a documented trigger and calm status. Stale
        responses can’t overwrite newer edits; a failed save keeps your input
        and offers Retry.
      </p>
      <AutosaveFieldDemo label="Note title" initial="Weekly review" />
      <AutosaveFieldDemo
        label="Note title (fails on “fail”)"
        initial="Draft"
        failOn="fail"
      />
    </section>
  );
}

// ---------------------------------------------------------------- states demo

function StatesDemo() {
  const [readOnlyValue] = useState("This value is read-only.");
  return (
    <section className="forms-demo__panel" data-testid="states">
      <h2>States, long content & controls gallery</h2>
      <div className="forms-demo__grid">
        <TextField
          label="Disabled"
          value="Can’t edit this"
          onChange={() => {}}
          disabled
        />
        <TextField
          label="Read-only"
          value={readOnlyValue}
          onChange={() => {}}
          readOnly
        />
        <TextField
          label="With an error"
          value="oops"
          onChange={() => {}}
          error="This value isn’t allowed."
        />
        <TextField
          label={
            "A deliberately very long field label that should wrap gracefully " +
            "within a narrow container without causing horizontal overflow"
          }
          value=""
          onChange={() => {}}
          help="Long labels wrap; the layout stays 320px-safe."
        />
        <SelectField
          label="Select with a stale value"
          value="ghost-option"
          onChange={() => {}}
          options={STATUS_OPTIONS}
        />
        <TagsField
          label="Read-only tags"
          value={["design", "content"]}
          onChange={() => {}}
          readOnly
        />
      </div>

      {/*
        The gallery documented every DISABLED field and no disabled BUTTON,
        which is the one control whose disabled appearance is a rule rather
        than a colour: a disabled control is inert, so it carries no state
        layer at all — not a fainter one (DS-02, and `interaction-consistency`
        asserts it). These are unconditionally disabled because that is the
        state being shown; the submitting-form case is already demonstrated
        above, where Cancel disables itself while Save is pending.
      */}
      <FormActions>
        <FormButton type="button" variant="primary" disabled>
          Disabled primary
        </FormButton>
        <FormButton type="button" variant="secondary" disabled>
          Disabled secondary
        </FormButton>
        <FormButton type="button" variant="ghost" disabled>
          Disabled ghost
        </FormButton>
      </FormActions>
    </section>
  );
}

// ---------------------------------------------------------------- route

export default function DesignFormsRoute() {
  const anchorIdentity = useMemo(() => getEntityIdentity(DEMO_ANCHOR.type), []);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  return (
    // The EntityLinkPicker's existing links are now navigable (deliverable 4). A
    // linked Task opens the shared Drawer, so the demo is hosted in a
    // DrawerProvider — otherwise activating a Task link would have no drawer host.
    // Unknown keys fall through to the built-in calm not-found panel.
    <DrawerProvider renderDrawer={() => null}>
      <div className="forms-demo" data-hydrated={hydrated ? "true" : "false"}>
        <header className="forms-demo__header">
          <h1>Shared Forms &amp; field controls (DS-06)</h1>
          <p>
            One entity-agnostic forms system: shared field controls, inline
            validation, a predictable save model, and the entity-agnostic
            entity-link picker. Anchor:{" "}
            {anchorIdentity ? (
              <EntityIcon type={anchorIdentity.type} size={14} />
            ) : null}{" "}
            {DEMO_ANCHOR.title}.
          </p>
        </header>

        <ExplicitFormDemo />
        <AutosaveFormDemo />
        <StatesDemo />

        <div data-testid="page-bottom" aria-hidden="true" />
      </div>
    </DrawerProvider>
  );
}
