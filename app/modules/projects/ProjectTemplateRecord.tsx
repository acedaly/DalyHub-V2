/**
 * PROJECT-02 — the template record (`/projects/templates/:templateId`).
 *
 * ── Why the Project record is NOT reused ─────────────────────────────────────
 * A Project record's header carries Complete/Reopen, its summary band carries
 * health and progress, and its tabs are Tasks / Knowledge / Links / Activity /
 * Settings. Every one of those is a statement about work being DONE, and a
 * template has no work being done — no completion, no health, no progress, no
 * links, no history. Reusing the record would have meant hiding most of it, and
 * a surface defined by what it hides is the thing AGENTS.md §6 calls a dead end.
 *
 * What IS reused is the shared record LAYOUT and every editing primitive in it:
 * the same `RecordLayout` header, the same `InlineTextField` grammar (click,
 * Enter, Escape, blur) the Task and Project records use, the same `Menu`, the
 * same `Button`. So the page is new, and nothing on it is.
 *
 * ── The editing model ────────────────────────────────────────────────────────
 * Modelled on the TASKS-13 checklist, because the interaction is the same
 * shape: one "Add" affordance that opens an input in place, Enter to save and
 * immediately open the next, Escape to close a BLANK input only, inline rename,
 * and reorder as two ordinary commands in the row's menu. There is no
 * drag-and-drop: "Move up" works identically with a mouse, a keyboard and a
 * thumb, which no drag gesture does — and this repository has no drag
 * dependency to add one from.
 *
 * ── What is NOT offered, and why ─────────────────────────────────────────────
 * No due date, no planned date, no status, no completion tick, no recurrence.
 * A template holds no plan and no execution state, so a control for any of them
 * would be a control that writes to nothing.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useNavigate, useRevalidator } from "react-router";

import {
  MAX_TEMPLATE_CHECKLIST_ITEMS_PER_TASK,
  MAX_TEMPLATE_TASKS,
  TEMPLATE_DESCRIPTION_MAX_LENGTH,
  TEMPLATE_NAME_MAX_LENGTH,
  TEMPLATE_TASK_TITLE_MAX_LENGTH,
  templateContentsLabel,
} from "~/kernel/project-templates";
import { CHECKLIST_TITLE_MAX_LENGTH, TASK_PRIORITIES } from "~/kernel/tasks";
import {
  DrawerProvider,
  useDrawer,
  type DrawerEntry,
  type DrawerRenderResult,
} from "~/shared/drawer";
import { AccentIcon } from "~/shared/entity";
import { useFeedback } from "~/shared/feedback";
import type { SelectOption } from "~/shared/forms/types";
import {
  InlineSelectField,
  InlineTextField,
  type InlineSaveOutcome,
} from "~/shared/inline-edit";
import { RecordLayout } from "~/shared/record-layout";
import { Button, ConfirmationDialog, Menu } from "~/shared/ui";

import { CreateFromTemplateForm } from "./CreateFromTemplateForm";
import type { TemplateMutationResult } from "./routes/template-mutate";
import type {
  SerializedTemplateDetail,
  SerializedTemplateTask,
} from "./template-view";

const CREATE_FROM_TEMPLATE_KEY = "create-from-template";

/** The calm fallback when a refusal carried no message of its own. */
const GENERIC_SAVE_ERROR = "That couldn\u2019t be saved. Please try again.";

/** The priority choices, in the product's one vocabulary. */
const PRIORITY_OPTIONS = TASK_PRIORITIES.map((value) => ({
  value,
  label: value.toUpperCase(),
}));

export interface ProjectTemplateRecordViewProps {
  readonly template: SerializedTemplateDetail;
  readonly parentOptions: readonly SelectOption[];
}

export function ProjectTemplateRecordView({
  template,
  parentOptions,
}: ProjectTemplateRecordViewProps) {
  const navigate = useNavigate();
  const renderDrawer = useCallback(
    (entry: DrawerEntry): DrawerRenderResult | null => {
      if (entry.key !== CREATE_FROM_TEMPLATE_KEY) return null;
      return {
        title: "Create from template",
        description: template.name,
        children: (
          <CreateFromTemplateHost
            template={template}
            parentOptions={parentOptions}
            onCreated={(projectId) =>
              navigate(`/projects/${encodeURIComponent(projectId)}`)
            }
          />
        ),
      };
    },
    [navigate, parentOptions, template],
  );
  return (
    <DrawerProvider renderDrawer={renderDrawer}>
      <TemplateRecord template={template} parentOptions={parentOptions} />
    </DrawerProvider>
  );
}

/**
 * The record itself, INSIDE the drawer provider.
 *
 * Split from the provider for one reason: the header's primary action opens the
 * create drawer, and `useDrawer` can only be called by a descendant of the
 * provider. The alternative was a hidden trigger the header clicked through,
 * which is a second entry point pretending to be one.
 */
function TemplateRecord({
  template,
  parentOptions,
}: ProjectTemplateRecordViewProps) {
  const navigate = useNavigate();
  const { openDrawer } = useDrawer();
  const revalidator = useRevalidator();
  const { notifyError } = useFeedback();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  /**
   * The ONE way this surface writes.
   *
   * Every control below posts an intent to the trusted template action route;
   * nothing here touches storage, and nothing here decides what a template may
   * hold. A refusal (a bound, a validation failure, a template deleted on
   * another device) comes back as a message and is surfaced verbatim, so the
   * owner reads the actual limit rather than "something went wrong".
   */
  const post = useCallback(
    async (
      fields: Record<string, string> | FormData,
    ): Promise<{ ok: boolean; message?: string; projectId?: string }> => {
      const body =
        fields instanceof FormData
          ? fields
          : (() => {
              const form = new FormData();
              for (const [key, value] of Object.entries(fields)) {
                form.set(key, value);
              }
              return form;
            })();
      let data: TemplateMutationResult;
      try {
        const response = await fetch(
          `/projects/templates/${encodeURIComponent(template.id)}/mutate`,
          { method: "POST", body },
        );
        data = (await response.json()) as TemplateMutationResult;
      } catch {
        return {
          ok: false,
          message: "That couldn’t be saved. Please try again.",
        };
      }
      if (data.ok) return { ok: true, projectId: data.projectId };
      const fieldError = data.fieldErrors
        ? Object.values(data.fieldErrors)[0]
        : undefined;
      return {
        ok: false,
        message:
          data.formError ??
          fieldError ??
          "That couldn’t be saved. Please try again.",
      };
    },
    [template.id],
  );

  const save = useCallback(
    async (fields: Record<string, string>): Promise<InlineSaveOutcome> => {
      const result = await post(fields);
      if (!result.ok) {
        // The inline field keeps the typed value and shows this, so a refusal
        // never costs the owner their words.
        return { ok: false, message: result.message ?? GENERIC_SAVE_ERROR };
      }
      revalidator.revalidate();
      return { ok: true };
    },
    [post, revalidator],
  );

  return (
    <>
      <RecordLayout
        title={template.name}
        titleSlot={
          <InlineTextField
            label="Template name"
            value={template.name}
            variant="heading"
            maxLength={TEMPLATE_NAME_MAX_LENGTH}
            onSave={(next) => save({ intent: "rename", name: next })}
            data-testid="template-name"
          />
        }
        typeLabel="Template"
        icon={
          <AccentIcon
            /*
             * The PROJECT glyph, deliberately. A template's icon and colour are
             * the identity it hands to the Project it creates, so painting them
             * with the Project mark is literally what they mean — and it avoids
             * inventing a second visual identity for a record the owner only
             * ever meets on its way to making a Project.
             */
            entityType="project"
            iconKey={template.iconKey}
            colourSlot={template.colourSlot}
            colourRank={template.colourRank}
            size="md"
          />
        }
        breadcrumb={[
          { id: "projects", label: "Projects", href: "/projects" },
          {
            id: "templates",
            label: "Templates",
            href: "/projects/templates",
          },
          { id: template.id, label: template.name },
        ]}
        primaryAction={{
          id: "use",
          label: "Use template",
          ariaLabel: `Create a project from ${template.name}`,
          onSelect: () => openDrawer(CREATE_FROM_TEMPLATE_KEY),
          variant: "primary",
        }}
        overflowActions={[
          {
            id: "delete",
            label: "Delete template",
            tone: "danger",
            onSelect: () => setConfirmingDelete(true),
          },
        ]}
        overflowLabel={`More actions for ${template.name}`}
        summaryBar={{
          description: (
            <InlineTextField
              label="What this template is for"
              value={template.description ?? ""}
              emptyLabel="Add a description"
              multiline
              rows={3}
              maxLength={TEMPLATE_DESCRIPTION_MAX_LENGTH}
              onSave={(next) => save({ intent: "describe", description: next })}
              data-testid="template-description"
            />
          ),
          facts: [
            {
              id: "contents",
              label: "Creates",
              value: templateContentsLabel(
                template.taskCount,
                template.checklistCount,
              ),
            },
            {
              id: "parent",
              label: "Usually under",
              value: (
                <InlineSelectField
                  label="Default Area or Goal"
                  value={template.parentId ?? ""}
                  options={parentOptions.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  emptyLabel="No default"
                  clearable
                  clearLabel="Clear default"
                  onSave={(next) =>
                    save({ intent: "setDefaultParent", parentId: next })
                  }
                />
              ),
            },
          ],
        }}
      >
        {/*
         * The task list is the record's CONTENT, not its `feature`.
         *
         * `RecordLayout` draws a declared feature ABOVE the summary band, which
         * is right for a record whose subject dwarfs its summary (a measurable
         * Goal's chart). Here the summary is what the owner reads FIRST — what
         * this template is for, what it creates, where it usually goes — and
         * the steps are what they read next. The content region puts them in
         * that order, on the shared contained surface, with no second card.
         */}
        <TemplateTaskList
          template={template}
          post={post}
          onChanged={() => revalidator.revalidate()}
          notifyError={notifyError}
        />
      </RecordLayout>
      <ConfirmationDialog
        open={confirmingDelete}
        title={`Delete “${template.name}”?`}
        confirmLabel="Delete template"
        tone="danger"
        onClose={() => setConfirmingDelete(false)}
        onConfirm={async () => {
          const result = await post({ intent: "delete" });
          // Thrown, not swallowed: the dialog shows it inline and stays open to
          // retry, which is what its contract asks for.
          if (!result.ok) throw new Error(result.message ?? GENERIC_SAVE_ERROR);
          navigate("/projects/templates");
        }}
      >
        {/*
         * Says exactly what SURVIVES. A template is configuration, and the one
         * thing an owner needs to know before deleting it is that the Projects
         * it already produced keep every task and are not touched.
         */}
        The template is removed. Projects already created from it keep every
        task and are not changed.
      </ConfirmationDialog>
    </>
  );
}

function CreateFromTemplateHost({
  template,
  parentOptions,
  onCreated,
}: {
  readonly template: SerializedTemplateDetail;
  readonly parentOptions: readonly SelectOption[];
  readonly onCreated: (projectId: string) => void;
}) {
  const { closeDrawer } = useDrawer();
  return (
    <CreateFromTemplateForm
      template={template}
      parentOptions={parentOptions}
      onCreated={onCreated}
      onCancel={closeDrawer}
    />
  );
}

type PostFn = (
  fields: Record<string, string> | FormData,
) => Promise<{ ok: boolean; message?: string; projectId?: string }>;

/** The ordered tasks a template will create, and the steps inside them. */
function TemplateTaskList({
  template,
  post,
  onChanged,
  notifyError,
}: {
  readonly template: SerializedTemplateDetail;
  readonly post: PostFn;
  readonly onChanged: () => void;
  readonly notifyError: (label: string, options?: { message?: string }) => void;
}) {
  const headingId = `template-tasks-${useId()}`;
  const full = template.tasks.length >= MAX_TEMPLATE_TASKS;

  /**
   * Perform one template mutation and reconcile.
   *
   * Returns the shared `InlineSaveOutcome`, so an inline field can keep the
   * owner's typed value on a refusal AND a menu command can ignore the value
   * and rely on the toast. One helper, two call shapes, no second error path.
   */
  const run = useCallback(
    async (
      fields: Record<string, string> | FormData,
      label: string,
    ): Promise<InlineSaveOutcome> => {
      const result = await post(fields);
      if (!result.ok) {
        const message = result.message ?? GENERIC_SAVE_ERROR;
        notifyError(label, { message });
        return { ok: false, message };
      }
      onChanged();
      return { ok: true };
    },
    [notifyError, onChanged, post],
  );

  const move = useCallback(
    async (taskId: string, delta: number) => {
      const order = template.tasks.map((task) => task.id);
      const from = order.indexOf(taskId);
      const to = Math.min(Math.max(from + delta, 0), order.length - 1);
      if (from < 0 || to === from) return;
      const next = [...order];
      next.splice(from, 1);
      next.splice(to, 0, taskId);
      const body = new FormData();
      body.set("intent", "reorderTasks");
      for (const id of next) body.append("taskId", id);
      await run(body, "Reorder tasks");
    },
    [run, template.tasks],
  );

  return (
    <section className="dh-template-tasks" aria-labelledby={headingId}>
      <h2 id={headingId} className="dh-template-tasks__heading">
        Tasks
        <span className="dh-template-tasks__count">
          {template.tasks.length} of {MAX_TEMPLATE_TASKS}
        </span>
      </h2>
      {template.tasks.length === 0 ? (
        <p className="dh-template-tasks__empty">
          This template creates no tasks yet. Add the steps a project like this
          always starts with.
        </p>
      ) : (
        <ol className="dh-template-tasks__list">
          {template.tasks.map((task, index) => (
            <TemplateTaskRow
              key={task.id}
              task={task}
              index={index}
              total={template.tasks.length}
              run={run}
              onMove={move}
            />
          ))}
        </ol>
      )}
      <AddRow
        label="Add task"
        placeholder="What has to happen?"
        maxLength={TEMPLATE_TASK_TITLE_MAX_LENGTH}
        disabled={full}
        disabledMessage={`A template holds at most ${MAX_TEMPLATE_TASKS} tasks.`}
        onAdd={(title) => run({ intent: "addTask", title }, "Add task")}
      />
      {/*
       * The ONE non-obvious fact about a template, at the FOOT of the thing it
       * is about rather than as a banner over it.
       *
       * The other two things an owner might wonder are already answered where
       * they arise: the save confirmation says what was captured, and the
       * create drawer says nothing is scheduled. This is the one that has no
       * other moment — an owner editing a template has no way to tell, from the
       * screen, whether they are about to rewrite last month's project.
       */}
      <p className="dh-template-tasks__note">
        Editing a template never changes a project already created from it.
      </p>
    </section>
  );
}

function TemplateTaskRow({
  task,
  index,
  total,
  run,
  onMove,
}: {
  readonly task: SerializedTemplateTask;
  readonly index: number;
  readonly total: number;
  readonly run: (
    fields: Record<string, string> | FormData,
    label: string,
  ) => Promise<InlineSaveOutcome>;
  readonly onMove: (taskId: string, delta: number) => Promise<void>;
}) {
  const checklistFull =
    task.checklist.length >= MAX_TEMPLATE_CHECKLIST_ITEMS_PER_TASK;

  const moveChecklist = useCallback(
    async (itemId: string, delta: number) => {
      const order = task.checklist.map((item) => item.id);
      const from = order.indexOf(itemId);
      const to = Math.min(Math.max(from + delta, 0), order.length - 1);
      if (from < 0 || to === from) return;
      const next = [...order];
      next.splice(from, 1);
      next.splice(to, 0, itemId);
      const body = new FormData();
      body.set("intent", "reorderChecklist");
      body.set("taskId", task.id);
      for (const id of next) body.append("itemId", id);
      await run(body, "Reorder checklist");
    },
    [run, task.checklist, task.id],
  );

  return (
    <li className="dh-template-task">
      <div className="dh-template-task__head">
        <span className="dh-template-task__index" aria-hidden="true">
          {index + 1}
        </span>
        <div className="dh-template-task__title">
          <InlineTextField
            label={`Task ${index + 1}`}
            value={task.title}
            maxLength={TEMPLATE_TASK_TITLE_MAX_LENGTH}
            onSave={(next) =>
              run(
                { intent: "renameTask", taskId: task.id, title: next },
                "Rename task",
              )
            }
          />
        </div>
        <div className="dh-template-task__priority">
          <InlineSelectField
            label={`Priority for ${task.title}`}
            value={task.priority ?? ""}
            options={PRIORITY_OPTIONS}
            emptyLabel="No priority"
            clearable
            clearLabel="Clear priority"
            onSave={(next) =>
              run(
                {
                  intent: "setTaskPriority",
                  taskId: task.id,
                  priority: next,
                },
                "Set priority",
              )
            }
          />
        </div>
        <Menu
          label={`More actions for ${task.title}`}
          items={[
            {
              id: "up",
              label: "Move up",
              disabled: index === 0,
              onSelect: () => void onMove(task.id, -1),
            },
            {
              id: "down",
              label: "Move down",
              disabled: index === total - 1,
              onSelect: () => void onMove(task.id, 1),
            },
            {
              id: "delete",
              label: "Delete task",
              tone: "danger",
              onSelect: () =>
                void run(
                  { intent: "deleteTask", taskId: task.id },
                  "Delete task",
                ),
            },
          ]}
        />
      </div>
      {task.checklist.length > 0 ? (
        <ul className="dh-template-task__checklist">
          {task.checklist.map((item, itemIndex) => (
            <li key={item.id} className="dh-template-task__step">
              <InlineTextField
                label={`Step ${itemIndex + 1} of ${task.title}`}
                value={item.title}
                maxLength={CHECKLIST_TITLE_MAX_LENGTH}
                onSave={(next) =>
                  run(
                    {
                      intent: "renameChecklistItem",
                      itemId: item.id,
                      title: next,
                    },
                    "Rename step",
                  )
                }
              />
              <Menu
                label={`More actions for ${item.title}`}
                items={[
                  {
                    id: "up",
                    label: "Move up",
                    disabled: itemIndex === 0,
                    onSelect: () => void moveChecklist(item.id, -1),
                  },
                  {
                    id: "down",
                    label: "Move down",
                    disabled: itemIndex === task.checklist.length - 1,
                    onSelect: () => void moveChecklist(item.id, 1),
                  },
                  {
                    id: "delete",
                    label: "Delete step",
                    tone: "danger",
                    onSelect: () =>
                      void run(
                        { intent: "deleteChecklistItem", itemId: item.id },
                        "Delete step",
                      ),
                  },
                ]}
              />
            </li>
          ))}
        </ul>
      ) : null}
      <AddRow
        label="Add step"
        placeholder="A step inside this task"
        maxLength={CHECKLIST_TITLE_MAX_LENGTH}
        disabled={checklistFull}
        disabledMessage={`A task holds at most ${MAX_TEMPLATE_CHECKLIST_ITEMS_PER_TASK} steps.`}
        onAdd={(title) =>
          run(
            { intent: "addChecklistItem", taskId: task.id, title },
            "Add step",
          )
        }
      />
    </li>
  );
}

/**
 * The shared "add one, then keep going" affordance.
 *
 * The TASKS-13 checklist interaction, reused rather than re-decided: one button
 * that opens an input in place; Enter saves and immediately reopens a blank one
 * so a list is typed in one flow; Escape closes a BLANK input only, because
 * Escape must never be able to discard typed words.
 */
function AddRow({
  label,
  placeholder,
  maxLength,
  disabled,
  disabledMessage,
  onAdd,
}: {
  readonly label: string;
  readonly placeholder: string;
  readonly maxLength: number;
  readonly disabled: boolean;
  readonly disabledMessage: string;
  readonly onAdd: (title: string) => Promise<InlineSaveOutcome>;
}) {
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const messageId = `${useId()}-limit`;

  useEffect(() => {
    if (composing) inputRef.current?.focus();
  }, [composing]);

  if (disabled) {
    return (
      <p className="dh-template-add__limit" role="status">
        {disabledMessage}
      </p>
    );
  }

  if (!composing) {
    return (
      <Button
        type="button"
        variant="subtle"
        size="sm"
        onClick={() => setComposing(true)}
      >
        {label}
      </Button>
    );
  }

  const commit = async () => {
    const title = draft.trim();
    if (title.length === 0) {
      setComposing(false);
      setDraft("");
      return;
    }
    setSaving(true);
    const outcome = await onAdd(title);
    setSaving(false);
    if (outcome.ok) {
      setDraft("");
      // Stay open, so the next step is one keystroke away.
      inputRef.current?.focus();
    }
  };

  return (
    <div className="dh-template-add">
      <input
        ref={inputRef}
        className="dh-input"
        type="text"
        aria-label={label}
        aria-describedby={messageId}
        placeholder={placeholder}
        maxLength={maxLength}
        value={draft}
        disabled={saving}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void commit();
            return;
          }
          if (event.key === "Escape" && draft.length === 0) {
            event.preventDefault();
            event.stopPropagation();
            setComposing(false);
          }
        }}
        onBlur={() => {
          if (draft.trim().length === 0) {
            setComposing(false);
            setDraft("");
          }
        }}
      />
      <span id={messageId} className="dh-visually-hidden">
        Press Enter to add. Escape closes an empty field.
      </span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => void commit()}
        disabled={saving}
      >
        Add
      </Button>
    </div>
  );
}
