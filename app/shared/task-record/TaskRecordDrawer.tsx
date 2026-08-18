/**
 * TODAY-02 / PROJ-01 — the shared Task record Drawer content.
 *
 * The re-homed, module-agnostic task record surface: given a task id, it loads the
 * task from the `/tasks/:id` resource route, renders the shared DS-02 Record Layout
 * (Header + Summary + Details / Links / Activity tabs, Activity last), and drives
 * every mutation (edit, completion, link/unlink, waiting, planning) back through
 * that route — so the user stays on their current surface (Today OR a Project) while
 * opening, editing, completing and reopening the task. A successful mutation
 * refreshes the Drawer AND revalidates the current route loader, so edits appear on
 * the host surface (e.g. a project's rollup + task list) with no hard reload. A
 * missing/deleted/cross-workspace id renders the calm not-found state.
 *
 * This is the ONE task record Drawer, task action route and completion path (ADR-028
 * / ADR-033). It knows nothing of Today's keyboard workflow: it exposes its live task
 * state and mutation handlers through the optional `onApiChange` seam so the Today
 * module can register its contextual keyboard commands (TODAY-05) around it without a
 * second drawer, form, action route or completion path.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRevalidator } from "react-router";

import {
  TASK_PRIORITIES,
  TIME_SECTORS,
  type TaskRecurrenceInput,
} from "~/kernel/tasks";
import { TITLE_MAX_LENGTH } from "~/kernel/entities";
import { useDrawer } from "~/shared/drawer";
import { useCapture } from "~/shared/capture";
import type { CaptureContextContract } from "~/shared/capture/capture-context";
import { EntityIcon } from "~/shared/entity";
import { EmptyState } from "~/shared/empty-state";
import { useFeedback } from "~/shared/feedback";
import { FormButton, SelectField, type SubmitOutcome } from "~/shared/forms";
import type {
  EntityLinkSelection,
  EntityLinkTargetOption,
} from "~/shared/forms/model";
import {
  InlineSelectField,
  InlineTextField,
  type InlineSaveOutcome,
} from "~/shared/inline-edit";
import { RecordLayout, type RecordMetaItem } from "~/shared/record-layout";
import { CollectionSkeleton } from "~/shared/skeleton";

import type { TaskActionData, TaskDetailData } from "./contract";
import { TaskChecklistSection } from "./TaskChecklistSection";
import { TaskDetailsTab, type TaskDetailsValues } from "./TaskDetailsTab";
import { TaskLinksTab } from "./TaskLinksTab";
import { TaskTimelineTab } from "./TaskTimelineTab";
import {
  TaskPlanningSection,
  type PlanningActionOutcome,
} from "./TaskPlanningSection";
import {
  TaskWaitingSection,
  type WaitingActionOutcome,
} from "./TaskWaitingSection";
import { PriorityFlag } from "./PriorityIndicator";
import { recurrenceFormFields } from "./recurrence-authoring";
import { TaskRecurrenceEditor } from "./TaskRecurrenceEditor";
import { UrgencyChip } from "./UrgencyChip";
import { useTaskChecklist } from "./use-task-checklist";
import { useTaskParentSearch } from "./use-task-parent-search";
import {
  isTaskComplete,
  taskDisplayState,
  taskPriorityLabel,
  taskRecurrenceLabel,
  timeSectorLabel,
  type SerializedChecklistItem,
  type SerializedTaskView,
} from "./task-view";

/**
 * EDIT-02 — the Task record's three most-changed values, edited where they are
 * shown.
 *
 * A Task's priority and dates were reachable only through the Details FORM (open
 * the tab, press "Edit details", change one control among twelve, press "Save
 * changes") or through the quick-edit panel on another surface entirely. Both
 * are heavier than the change deserves, and neither matches how the same values
 * are changed on an Area or a Project. The title, the priority and the two dates
 * now use the shared DS-16 fields; the form stays for the rest, because
 * delegation, recurrence and status genuinely interact and belong together.
 *
 * The priority menu carries REAL priorities only. "No priority" was an option in
 * the list, which made an untriaged Task read as though someone had chosen that
 * — so it is now the field's EMPTY state, and unsetting is one separated Clear
 * command that appears only when a priority is actually set.
 */
const PRIORITY_OPTIONS = TASK_PRIORITIES.map((priority) => ({
  value: priority,
  label: taskPriorityLabel(priority),
}));

/**
 * CONTROL-01 §4 — the horizon, in the owner's words.
 *
 * The persisted field is `timeSector` and the stored values are unchanged; what
 * changes is the WORD on the label. "Time Sector" is DalyHub's internal name for
 * it — capitalised like a proper noun, and meaningless to anyone who has not
 * read the schema — while every value it holds ("This Week", "Next Month",
 * "Long Term") is plainly a HORIZON. The audit called this out by name, and the
 * rule it gave is the one followed here: rename the language, never the
 * persisted value or the API field.
 */
const HORIZON_LABEL = "Horizon";

const HORIZON_OPTIONS = TIME_SECTORS.map((sector) => ({
  value: sector,
  label: timeSectorLabel(sector),
}));

/**
 * …and the same for `commitmentState`, whose two values are "active" and
 * "someday". "Commitment" names the column; it does not name the question the
 * owner is answering, which is whether this is something they are actually
 * doing or something parked. The values already speak plainly, so only the
 * field's own label moves.
 */
const COMMITMENT_LABEL = "Doing this";

const COMMITMENT_OPTIONS = [
  { value: "active", label: "Yes — active" },
  { value: "someday", label: "Someday / Maybe" },
];

/**
 * The live task-record API a host module can observe to add behaviour AROUND the
 * shared Drawer (e.g. Today's contextual keyboard commands) without duplicating any
 * of its state, mutations or routes. `null` while the task is loading.
 */
export interface TaskRecordDrawerApi {
  readonly task: SerializedTaskView | null;
  /**
   * AUDIT-14 — the OWNER's calendar day, exactly as the record route resolved it
   * from their stored timezone. Published so a host composing behaviour around
   * this drawer (the Today module's keyboard plan commands) plans against the
   * same day the drawer shows, instead of re-deriving one in the browser.
   * `null` until the record has loaded.
   */
  readonly todayIso: string | null;
  /** The effective completed state (optimistic override applied). */
  readonly completed: boolean;
  /** Whether the task is actively waiting (and not completed). */
  readonly waitingActive: boolean;
  readonly toggleCompletion: (complete: boolean) => void;
  readonly planTask: (scheduledDate: string) => Promise<PlanningActionOutcome>;
  readonly clearPlan: () => Promise<PlanningActionOutcome>;
  readonly clearWaiting: () => Promise<WaitingActionOutcome>;
  readonly close: () => void;
}

interface TaskRecordDrawerProps {
  readonly taskId: string;
  /**
   * The base path of the task resource route. Defaults to `/tasks` — the canonical
   * re-homed endpoint. Exposed only for tests; product code uses the default.
   */
  readonly basePath?: string;
  /**
   * Optional seam: called with the live task API whenever it changes, so a host
   * module can compose behaviour around the shared Drawer (TODAY-05 keyboard
   * commands). Omitted by consumers (e.g. Projects) that need no extra behaviour.
   */
  readonly onApiChange?: (api: TaskRecordDrawerApi) => void;
}

type DetailResponse = TaskDetailData | { readonly error: string };

/**
 * The stable empty checklist used while the record is loading or missing.
 *
 * A module constant rather than a fresh `[]` per render, because
 * `useTaskChecklist` re-seeds its state when the array IDENTITY changes — a new
 * literal every render would reset it on every render.
 */
const NO_CHECKLIST: readonly SerializedChecklistItem[] = [];

export function TaskRecordDrawer({
  taskId,
  basePath = "/tasks",
  onApiChange,
}: TaskRecordDrawerProps) {
  const detailUrl = `${basePath}/${encodeURIComponent(taskId)}`;
  const revalidator = useRevalidator();
  const { closeDrawer } = useDrawer();
  const capture = useCapture();
  const { notifySuccess, notifyError } = useFeedback();
  /*
   * CONTROL-01 §4 — the parent picker's option source, the SAME bounded,
   * workspace-scoped `/tasks/parent-options` endpoint the row's project editor
   * and the create form already use. Not a second parent model.
   */
  const parentSearch = useTaskParentSearch();

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [isEditing, setEditing] = useState(false);
  const [completionPending, setCompletionPending] = useState(false);
  /*
   * CONTROL-01 §4 — the parent's OWN pending value and in-flight lock.
   *
   * `SelectField` closes on selection and re-syncs its input from `props.value`.
   * Driving it straight from the last LOADED record therefore snaps the input
   * back to the previous parent for as long as the mutation and the reload take
   * — the owner picks "Kitchen renovation" and watches it revert to "Home". And
   * with no lock, two quick changes race: whichever response lands last wins,
   * which may not be the one the owner chose last.
   *
   * The retired `TaskQuickEditPanel` solved both with local state plus
   * `disabled={busy}`, and that behaviour is preserved here rather than lost in
   * the merge. `null` means "no pending choice — show what the record says".
   */
  const [pendingParent, setPendingParent] = useState<string | null>(null);
  const [parentPending, setParentPending] = useState(false);
  const [optimisticComplete, setOptimisticComplete] = useState<boolean | null>(
    null,
  );
  const loadedFor = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(detailUrl, {
        headers: { accept: "application/json" },
      });
      const body = (await response.json()) as DetailResponse;
      setData(body);
      setLoadError(false);
      setOptimisticComplete(null);
    } catch {
      setLoadError(true);
    }
  }, [detailUrl]);

  // Load once per task, and expose `load` for refreshes after a mutation.
  useEffect(() => {
    if (loadedFor.current !== detailUrl) {
      loadedFor.current = detailUrl;
      void load();
    }
  });

  /*
   * A different task: whatever parent choice was pending belonged to the
   * PREVIOUS one and must not be shown against this one.
   *
   * Its own effect, keyed on the task, rather than a line inside the loader
   * above — that one deliberately runs on every render behind a ref guard, and a
   * state setter in a dependency-less effect is the shape of an update loop even
   * when this particular guard prevents it.
   */
  useEffect(() => {
    setPendingParent(null);
    setParentPending(false);
  }, [detailUrl]);

  /*
   * Retire the pending parent once the RECORD agrees with it.
   *
   * The local value exists only to bridge the round trip; leaving it set after
   * the reload would make it a second source of truth, and a parent changed
   * elsewhere (the row's inline editor, a bulk move) would then be overridden on
   * this surface by a value the server has already superseded.
   */
  useEffect(() => {
    if (pendingParent === null || data === null || "error" in data) return;
    const settled = data.task.project?.id ?? data.task.area?.id ?? "";
    if (settled === pendingParent) setPendingParent(null);
  }, [data, pendingParent]);

  const postAction = useCallback(
    async (form: FormData): Promise<TaskActionData> => {
      const response = await fetch(detailUrl, { method: "POST", body: form });
      return (await response.json()) as TaskActionData;
    },
    [detailUrl],
  );

  const refresh = useCallback(() => {
    void load();
    revalidator.revalidate();
  }, [load, revalidator]);

  /*
   * TASKS-13 — the Task's checklist.
   *
   * Called unconditionally, above every early return, because it is a hook. It
   * is seeded from the loader payload (a stable empty array while the record is
   * loading or missing, so the seeding effect does not re-run on every render)
   * and re-seeds itself whenever the record delivers a different one.
   *
   * `revalidate` — not `refresh` — is the change callback: `refresh` reloads THIS
   * record, and the checklist already has the server's fresh answer in the
   * mutation's own response, so reloading it would be a second request for data
   * the section is already holding. What DOES need re-reading is the surface
   * BEHIND the drawer, whose row draws the "2 of 4".
   */
  const loadedChecklist =
    // `?? NO_CHECKLIST` is not belt-and-braces: this is a parsed JSON response,
    // so the type is a claim about the server rather than a guarantee, and a
    // record served by an older Worker mid-deploy must render rather than throw.
    data !== null && !("error" in data)
      ? (data.checklist ?? NO_CHECKLIST)
      : NO_CHECKLIST;
  const checklist = useTaskChecklist(
    taskId,
    loadedChecklist,
    basePath,
    revalidator.revalidate,
  );

  const submitUpdate = useCallback(
    async (
      values: TaskDetailsValues,
    ): Promise<SubmitOutcome<TaskDetailsValues>> => {
      const form = new FormData();
      form.set("intent", "update");
      // EDIT-02 — the title, the priority and the two dates are NOT submitted
      // here any more: they are edited on the record, and carrying them would
      // let this Save revert a change made in the Summary while the form was
      // open. The action treats an absent key as unchanged.
      //
      // CONTROL-01 §4 — the horizon and the Someday/Maybe state join them, for
      // the identical reason: both became pressable controls in the Summary when
      // the second Task drawer was merged into this one, so submitting the
      // form's stale copy of either would revert an edit made beside it.
      form.set("status", values.status);
      form.set("delegateTo", values.delegateTo);
      form.set("delegatedOn", values.delegatedOn);
      form.set("followUpOn", values.followUpOn);
      form.set("delegateNote", values.delegateNote);
      form.set("description", values.description);
      const result = await postAction(form);
      if (result.kind === "update" && result.status === "success") {
        notifySuccess("Task saved.");
        refresh();
        return { status: "success" };
      }
      if (result.kind === "update" && result.status === "error") {
        return {
          status: "error",
          formError: result.formError,
          fieldErrors: result.fieldErrors as
            | Partial<Record<keyof TaskDetailsValues & string, string>>
            | undefined,
        };
      }
      return {
        status: "error",
        formError: "Your changes couldn’t be saved. Please try again.",
      };
    },
    [postAction, notifySuccess, refresh],
  );

  /**
   * A single-id `/tasks/bulk` field change — the SAME trusted authority the bulk
   * bar and the quick-edit panel already use, so priority and due-date edits
   * from the record go through one server path rather than a third one. It
   * returns the DS-16 outcome shape: a refusal keeps the field's own message
   * beside the value and never applies anything optimistically.
   */
  const postBulkField = useCallback(
    async (fields: Record<string, string>): Promise<InlineSaveOutcome> => {
      const body = new FormData();
      body.append("id", taskId);
      for (const [key, value] of Object.entries(fields)) body.set(key, value);
      try {
        const response = await fetch(`${basePath}/bulk`, {
          method: "POST",
          body,
        });
        const result = (await response.json()) as {
          readonly ok?: boolean;
          readonly formError?: string;
        };
        if (result.ok) {
          refresh();
          return { ok: true };
        }
        return {
          ok: false,
          message:
            result.formError ??
            "That couldn’t be saved. Nothing was changed — try again.",
        };
      } catch {
        return {
          ok: false,
          message: "That couldn’t be saved. Nothing was changed — try again.",
        };
      }
    },
    [basePath, refresh, taskId],
  );

  const renameTask = useCallback(
    async (title: string): Promise<InlineSaveOutcome> => {
      const form = new FormData();
      form.set("intent", "rename");
      form.set("title", title);
      try {
        const result = await postAction(form);
        if (result.kind === "update" && result.status === "success") {
          refresh();
          return { ok: true };
        }
        return {
          ok: false,
          message:
            (result.kind === "update" && result.status === "error"
              ? (result.fieldErrors?.title ?? result.formError)
              : undefined) ??
            "That couldn’t be saved. Your text is safe — try again.",
        };
      } catch {
        return {
          ok: false,
          message: "That couldn’t be saved. Your text is safe — try again.",
        };
      }
    },
    [postAction, refresh],
  );

  const setPriority = useCallback(
    (priority: string) => postBulkField({ intent: "set_priority", priority }),
    [postBulkField],
  );

  // TASKS-03: the DUE date is a deadline, distinct from the scheduled date —
  // setting one never touches the other. An empty value clears it.
  const setDueDate = useCallback(
    (dueDate: string | null) =>
      postBulkField({ intent: "set_due", dueDate: dueDate ?? "" }),
    [postBulkField],
  );

  /*
   * CONTROL-01 §4 — the three properties that used to live ONLY in the second
   * drawer.
   *
   * `TaskQuickEditPanel` was a competing editor for this same object: the row's
   * overflow opened `task-quick:<id>` for the parent, the horizon, the
   * Someday/Maybe state and the repeat, while the title link opened
   * `task:<id>` for everything else. Two drawers over one record is two places
   * to look and two places for the two of them to disagree.
   *
   * They post through the SAME `/tasks/bulk` single-id path the priority and
   * the due date already use, so folding them in adds no fourth server path.
   */
  const setSector = useCallback(
    (sector: string) => postBulkField({ intent: "set_sector", sector }),
    [postBulkField],
  );

  const setCommitment = useCallback(
    (commitment: string) =>
      postBulkField({ intent: "set_commitment", commitment }),
    [postBulkField],
  );

  /**
   * The parent goes through the canonical `/tasks/:id` `set_parent` intent
   * rather than the bulk path, because it carries a KIND alongside the id — a
   * Task's one parent is an Area or a Project and the route is told which.
   * Clearing it is Inbox, stated in those words.
   */
  const setParent = useCallback(
    async (parentId: string): Promise<InlineSaveOutcome> => {
      // Show the owner's choice immediately and hold it until the record has
      // reloaded with the server's answer.
      setPendingParent(parentId);
      setParentPending(true);
      /*
       * The KIND comes from the picker's own index, and falls back to the task's
       * CURRENT parent — because that one option is synthesised from the record
       * rather than fetched (see `parentOptions` below), so the index has never
       * seen it. Without the fallback, re-selecting the parent a task already has
       * would be refused as "not in the list".
       */
      const loaded = data !== null && !("error" in data) ? data.task : null;
      const kind =
        parentId.length === 0
          ? ""
          : parentId === loaded?.project?.id
            ? "project"
            : parentId === loaded?.area?.id
              ? "area"
              : parentSearch.kindOf(parentId);
      if (kind === null) {
        setPendingParent(null);
        setParentPending(false);
        return {
          ok: false,
          message: "Choose a Project or an Area from the list.",
        };
      }
      const form = new FormData();
      form.set("intent", "set_parent");
      form.set("parentId", parentId);
      form.set("parentKind", kind);
      try {
        const result = await postAction(form);
        if (result.kind === "update" && result.status === "success") {
          // Announced like every other mutation on this record, and in the
          // product's own words for the two outcomes this control has.
          notifySuccess(
            parentId.length === 0
              ? "Moved to Inbox."
              : `Filed under the chosen ${kind}.`,
          );
          refresh();
          setParentPending(false);
          return { ok: true };
        }
        // Refused: drop the optimistic value so the control returns to the
        // parent the record actually has, rather than showing a move that did
        // not happen.
        setPendingParent(null);
        setParentPending(false);
        return {
          ok: false,
          message:
            (result.kind === "update" && result.status === "error"
              ? (result.fieldErrors?.parentId ?? result.formError)
              : undefined) ??
            "That couldn’t be saved. Nothing was changed — try again.",
        };
      } catch {
        setPendingParent(null);
        setParentPending(false);
        return {
          ok: false,
          message: "That couldn’t be saved. Nothing was changed — try again.",
        };
      }
    },
    [data, notifySuccess, parentSearch, postAction, refresh],
  );

  const toggleCompletion = useCallback(
    async (complete: boolean) => {
      setCompletionPending(true);
      setOptimisticComplete(complete);
      const form = new FormData();
      form.set("intent", complete ? "complete" : "reopen");
      try {
        const result = await postAction(form);
        if (result.kind === "completion" && result.ok) {
          notifySuccess(complete ? "Task completed." : "Task reopened.");
          refresh();
        } else {
          setOptimisticComplete(null);
          notifyError(
            result.kind === "completion" && !result.ok
              ? result.message
              : "That couldn’t be saved. Please try again.",
          );
        }
      } catch {
        setOptimisticComplete(null);
        notifyError("That couldn’t be saved. Please try again.");
      } finally {
        setCompletionPending(false);
      }
    },
    [postAction, notifySuccess, notifyError, refresh],
  );

  const searchTargets = useCallback(
    async (
      query: string,
      signal: AbortSignal,
    ): Promise<readonly EntityLinkTargetOption[]> => {
      const url = new URL(`${detailUrl}/link-targets`, window.location.origin);
      url.searchParams.set("q", query);
      const response = await fetch(url, {
        signal,
        headers: { accept: "application/json" },
      });
      if (!response.ok) return [];
      const body = (await response.json()) as {
        readonly options?: readonly EntityLinkTargetOption[];
      };
      return body.options ?? [];
    },
    [detailUrl],
  );

  const linkTarget = useCallback(
    async (params: {
      readonly target: EntityLinkTargetOption;
      readonly linkType: string;
      readonly direction: "outgoing" | "incoming";
    }) => {
      const form = new FormData();
      form.set("intent", "link");
      form.set("targetId", params.target.id);
      form.set("linkType", params.linkType);
      form.set("direction", params.direction);
      const result = await postAction(form);
      if (!(result.kind === "link" && result.ok)) {
        throw new Error(
          result.kind === "link" && result.message
            ? result.message
            : "That link couldn’t be created.",
        );
      }
      refresh();
    },
    [postAction, refresh],
  );

  const unlinkTarget = useCallback(
    async (link: EntityLinkSelection) => {
      const form = new FormData();
      form.set("intent", "unlink");
      form.set("linkId", link.linkId);
      const result = await postAction(form);
      if (!(result.kind === "unlink" && result.ok)) {
        throw new Error("That link couldn’t be removed.");
      }
      refresh();
    },
    [postAction, refresh],
  );

  const searchWaitingTargets = useCallback(
    async (
      query: string,
      signal: AbortSignal,
    ): Promise<readonly EntityLinkTargetOption[]> => {
      const url = new URL(
        `${detailUrl}/waiting-targets`,
        window.location.origin,
      );
      url.searchParams.set("q", query);
      const response = await fetch(url, {
        signal,
        headers: { accept: "application/json" },
      });
      if (!response.ok) return [];
      const body = (await response.json()) as {
        readonly options?: readonly EntityLinkTargetOption[];
      };
      return body.options ?? [];
    },
    [detailUrl],
  );

  /**
   * CONTROL-01 §4 — authoring a REPEAT, on the record.
   *
   * `TaskRecurrenceEditor` had exactly one host: the quick-edit panel. Pointing
   * the row's overflow at the record without bringing the editor with it would
   * have made a custom interval or a weekday-pinned rule authorable nowhere but
   * quick capture — DEBT-66 reopened, and the "merge preserves existing Task
   * functionality" clause broken by the merge itself.
   *
   * It posts the SAME canonical `intent=set_recurrence` the row's overflow
   * series operations use, so the kernel still validates the rule against the
   * task's own anchor date and still refuses one that could never compute a
   * successor.
   */
  const saveRecurrence = useCallback(
    async (
      rule: TaskRecurrenceInput | null,
    ): Promise<{ ok: boolean; message?: string }> => {
      const form = new FormData();
      for (const [key, value] of Object.entries(recurrenceFormFields(rule))) {
        form.set(key, value);
      }
      /*
       * The rejection path is caught HERE, and that is load-bearing rather than
       * defensive habit. `TaskRecurrenceEditor.commit()` sets `saving = true` and
       * only clears it once this promise SETTLES with a value — so a network
       * failure or a non-JSON response would reject, leave the editor disabled
       * with no way back, and surface as an unhandled rejection. Every other
       * inline mutation on this record already answers with `{ ok: false }`
       * instead of throwing; this one was the odd one out.
       */
      try {
        const result = await postAction(form);
        if (result.kind === "update" && result.status === "success") {
          notifySuccess(
            rule === null
              ? "This task no longer repeats."
              : "This task now repeats.",
          );
          refresh();
          return { ok: true };
        }
        return {
          ok: false,
          message:
            (result.kind === "update" && result.status === "error"
              ? (result.fieldErrors?.recurrence ?? result.formError)
              : undefined) ??
            "That couldn’t be saved. Nothing was changed — try again.",
        };
      } catch {
        return {
          ok: false,
          message: "That couldn’t be saved. Nothing was changed — try again.",
        };
      }
    },
    [notifySuccess, postAction, refresh],
  );

  const setWaiting = useCallback(
    async (
      payload:
        | { readonly mode: "entity"; readonly targetId: string }
        | { readonly mode: "text"; readonly note: string },
    ): Promise<WaitingActionOutcome> => {
      const form = new FormData();
      form.set("intent", "set_waiting");
      form.set("waitingMode", payload.mode);
      if (payload.mode === "entity") {
        form.set("waitingTargetId", payload.targetId);
      } else {
        form.set("waitingNote", payload.note);
      }
      const result = await postAction(form);
      if (result.kind === "waiting" && result.status === "success") {
        notifySuccess("Marked as waiting.");
        refresh();
        return { ok: true };
      }
      if (result.kind === "waiting" && result.status === "error") {
        return {
          ok: false,
          formError: result.formError,
          fieldErrors: result.fieldErrors,
        };
      }
      return {
        ok: false,
        formError: "That couldn’t be saved. Please try again.",
      };
    },
    [postAction, notifySuccess, refresh],
  );

  const clearWaiting = useCallback(async (): Promise<WaitingActionOutcome> => {
    const form = new FormData();
    form.set("intent", "clear_waiting");
    const result = await postAction(form);
    if (result.kind === "waiting" && result.status === "success") {
      notifySuccess("No longer waiting.");
      refresh();
      return { ok: true };
    }
    if (result.kind === "waiting" && result.status === "error") {
      return { ok: false, formError: result.formError };
    }
    return {
      ok: false,
      formError: "That couldn’t be saved. Please try again.",
    };
  }, [postAction, notifySuccess, refresh]);

  const planTask = useCallback(
    async (scheduledDate: string): Promise<PlanningActionOutcome> => {
      const form = new FormData();
      form.set("intent", "plan");
      form.set("scheduledDate", scheduledDate);
      const result = await postAction(form);
      if (result.kind === "planning" && result.status === "success") {
        notifySuccess("Plan updated.");
        refresh();
        return { ok: true };
      }
      if (result.kind === "planning" && result.status === "error") {
        return {
          ok: false,
          formError: result.formError,
          fieldErrors: result.fieldErrors,
        };
      }
      return {
        ok: false,
        formError: "That couldn’t be saved. Please try again.",
      };
    },
    [postAction, notifySuccess, refresh],
  );

  const clearPlan = useCallback(async (): Promise<PlanningActionOutcome> => {
    const form = new FormData();
    form.set("intent", "clear_plan");
    const result = await postAction(form);
    if (result.kind === "planning" && result.status === "success") {
      notifySuccess("Plan cleared.");
      refresh();
      return { ok: true };
    }
    if (result.kind === "planning" && result.status === "error") {
      return { ok: false, formError: result.formError };
    }
    return {
      ok: false,
      formError: "That couldn’t be saved. Please try again.",
    };
  }, [postAction, notifySuccess, refresh]);

  const activeTask = data !== null && !("error" in data) ? data.task : null;
  const activeTodayIso =
    data !== null && !("error" in data) ? data.todayIso : null;
  const activeCompleted = activeTask
    ? optimisticComplete !== null
      ? optimisticComplete
      : isTaskComplete(activeTask)
    : false;
  const activeWaiting =
    activeTask !== null && activeTask.waiting !== null && !activeCompleted;

  // Publish the live task API to an optional host (TODAY-05 keyboard commands). The
  // memo is keyed on the observable state + the stable mutation handlers, so it fires
  // only when something a host would care about changes — never on every render.
  const api = useMemo<TaskRecordDrawerApi>(
    () => ({
      task: activeTask,
      todayIso: activeTodayIso,
      completed: activeCompleted,
      waitingActive: activeWaiting,
      toggleCompletion: (complete) => void toggleCompletion(complete),
      planTask,
      clearPlan,
      clearWaiting,
      close: () => closeDrawer(),
    }),
    [
      activeTask,
      activeTodayIso,
      activeCompleted,
      activeWaiting,
      toggleCompletion,
      planTask,
      clearPlan,
      clearWaiting,
      closeDrawer,
    ],
  );
  useEffect(() => {
    onApiChange?.(api);
  }, [api, onApiChange]);

  if (loadError) {
    return (
      <EmptyState
        title="We couldn’t load this task"
        description="Something went wrong. Please try again."
        primaryAction={
          <FormButton
            type="button"
            variant="secondary"
            onClick={() => void load()}
          >
            Retry
          </FormButton>
        }
      />
    );
  }

  if (data === null) {
    return <CollectionSkeleton count={3} />;
  }

  if ("error" in data) {
    return (
      <EmptyState
        title="We couldn’t find that task"
        description="It may have been deleted, or the link is out of date."
      />
    );
  }

  const task = data.task;
  const completed =
    optimisticComplete !== null ? optimisticComplete : isTaskComplete(task);
  const waitingActive = task.waiting !== null && !completed;
  const displayState = taskDisplayState({
    deletedAt: task.deletedAt,
    completedAt: completed ? (task.completedAt ?? task.updatedAt) : null,
    status: task.status,
    commitmentState: task.commitmentState,
    timeSector: task.timeSector,
    scheduledDate: task.scheduledDate,
    waiting: waitingActive ? task.waiting : null,
  });
  const status = { label: displayState.label, tone: displayState.tone };
  /*
   * The Task's ONE structural parent, whichever kind it is — the owner's PENDING
   * choice while one is in flight, and the record's own answer otherwise.
   *
   * The pending value is cleared by the effect below once the reloaded record
   * agrees with it, so the local state is a bridge across the round trip rather
   * than a second source of truth that could drift from the server.
   */
  const recordParent = task.project?.id ?? task.area?.id ?? "";
  const parentValue = pendingParent ?? recordParent;
  /*
   * The picker's options, with the CURRENT parent guaranteed to be among them.
   *
   * `/tasks/parent-options` is bounded — it returns a page, and typing searches
   * the rest — so on a workspace with more Projects than one page the task's own
   * parent may simply not be in the list. `withSelected` can only re-offer an
   * option the endpoint has already returned once, so the field would have shown
   * an EMPTY parent for a task that has one, which is worse than not offering the
   * control at all. The record already knows the parent's id AND its title, so it
   * supplies that one option itself.
   */
  const parentOptions =
    parentValue === "" ||
    parentSearch
      .withSelected(parentValue)
      .some((option) => option.value === parentValue)
      ? parentSearch.withSelected(parentValue)
      : [
          {
            value: parentValue,
            label:
              parentValue === recordParent
                ? (task.project?.title ?? task.area?.title ?? parentValue)
                : parentValue,
          },
          ...parentSearch.withSelected(parentValue),
        ];

  // Scheduled + Due are shown by the Planning section (TODAY-04), so they are not
  // duplicated here; the summary metadata carries the remaining task facts.
  const metadata: RecordMetaItem[] = [];
  // The shared coloured PriorityIndicator (TASKS-02). An untriaged task reads
  // "Priority 4" here, because that is what an untriaged task is (CONTROL-01).
  metadata.push({
    id: "priority",
    label: "Priority",
    // DS-16 — direct change, no clearing step: the current priority is the
    // trigger, every other priority is one press away in the menu, and the
    // separated Clear command appears only when there is one to clear.
    value: (
      <InlineSelectField
        label="Priority"
        // CONTROL-01 — `null` IS Priority 4, so it selects P4 rather than
        // falling through to an empty state that then has to be labelled
        // "Priority 4" anyway. One state, one rendering, one option checked.
        value={task.priority ?? "p4"}
        options={PRIORITY_OPTIONS}
        onSave={setPriority}
        renderValue={(option) =>
          option ? (
            <PriorityFlag
              priority={option.value as SerializedTaskView["priority"]}
              size="md"
              showLabel
            />
          ) : null
        }
        renderOption={(option) => (
          <PriorityFlag
            priority={option.value as SerializedTaskView["priority"]}
            size="md"
            showLabel
          />
        )}
        data-testid="task-priority-edit"
      />
    ),
  });
  if (task.dueDate || task.scheduledDate) {
    metadata.push({
      id: "urgency",
      label: "When",
      value: <UrgencyChip task={task} todayIso={data.todayIso} />,
    });
  }
  /*
   * CONTROL-01 §4 — every one of these is now PRESSABLE.
   *
   * They were a static property sheet: the record told you the Time Sector, the
   * commitment and the parent and gave you nowhere to change them, so changing
   * any of the three meant closing this drawer and opening the *other* one from
   * the row's overflow. A record that states a value it will not let you edit is
   * a record that sends you somewhere else — which is exactly the second editor
   * this pass removes.
   */
  metadata.push({
    id: "sector",
    label: HORIZON_LABEL,
    value: (
      <InlineSelectField
        label={HORIZON_LABEL}
        value={task.timeSector ?? ""}
        options={HORIZON_OPTIONS}
        onSave={setSector}
        emptyLabel="No horizon"
        clearable
        clearLabel="Clear horizon"
        data-testid="task-horizon-edit"
      />
    ),
  });
  metadata.push({
    id: "commitment",
    label: COMMITMENT_LABEL,
    value: (
      <InlineSelectField
        label={COMMITMENT_LABEL}
        // A Task with no stored commitment IS active — the same "null is not a
        // fifth state" rule the priority contract settled.
        value={task.commitmentState === "someday" ? "someday" : "active"}
        options={COMMITMENT_OPTIONS}
        onSave={setCommitment}
        data-testid="task-commitment-edit"
      />
    ),
  });
  if (task.delegation) {
    metadata.push({
      id: "delegated",
      label: "Delegated to",
      value: task.delegation.to,
    });
  }
  /*
   * The parent is NOT in this metadata list.
   *
   * It is a server-backed searchable picker in the summary's control column
   * below, because a Task's parent is the one property whose option set is the
   * whole workspace: the record used to print up to three separate facts here
   * (Project, Goal, Area) plus a fourth "Parent: Unassigned" row when it had
   * none — four labels for a field the model says holds exactly one value — and
   * the only way to CHANGE it was the second drawer this pass retired.
   *
   * The Goal stays here, read-only, because a Goal is the PROJECT's goal and not
   * a parent this control could set.
   */
  if (task.goal) {
    metadata.push({ id: "goal", label: "Goal", value: task.goal.title });
  }
  // A stored recurrence rule is a fact about the task, so it is reported here in the
  // same restrained vocabulary the parser and the Repeat control use.
  const recurrenceLabel = taskRecurrenceLabel(task.recurrence);
  if (recurrenceLabel !== null) {
    metadata.push({ id: "repeats", label: "Repeats", value: recurrenceLabel });
  }
  const taskCaptureContext: CaptureContextContract = {
    sourceEntityId: task.id,
    sourceEntityType: "task",
    sourceEntityTitle: task.title,
    sourceModule: "tasks",
    originatingRoute: `/tasks?drawer=task:${task.id}`,
    mode: "removable",
    relationshipMeaning: "related",
    returnTo: `/tasks?drawer=task:${task.id}`,
  };
  const contextualActions = [
    {
      id: "capture-note",
      label: "New linked note",
      onSelect: () => capture?.openCapture("note", null, taskCaptureContext),
    },
    {
      id: "capture-meeting",
      label: "New meeting",
      onSelect: () => capture?.openCapture("meeting", null, taskCaptureContext),
    },
    {
      id: "capture-diary",
      label: "New diary entry",
      onSelect: () => capture?.openCapture("diary", null, taskCaptureContext),
    },
  ];

  return (
    /*
     * DS-04 — the Task record's own scope hook.
     *
     * `RecordLayout` and `RecordSummary` are shared by every record type, and
     * DS-04 redesigns the TASK Drawer only (§27, §61). The wrapper is the
     * narrowest way to say "this one": the shared components are untouched, a
     * Project's or a Person's record keeps exactly what it had, and the rules
     * that de-card this panel cannot reach them.
     */
    <div className="dh-task-record">
      <RecordLayout
        title={task.title}
        titleSlot={
          <InlineTextField
            label="Task title"
            value={task.title}
            onSave={renameTask}
            variant="heading"
            maxLength={TITLE_MAX_LENGTH}
            data-testid="task-title-edit"
          />
        }
        headingLevel={3}
        /*
         * RECORD-01 — no `typeLabel`. This record has no breadcrumb because it is
         * hosted in the Drawer, whose own panel header says "Task" and "Task
         * record" directly above the title — so the eyebrow was the third
         * statement of the same word in the first 100px of the panel.
         */
        icon={<EntityIcon type="task" />}
        status={status}
        /*
         * CONTROL-01 §4 — completion is the Task record's FIRST-CLASS action.
         *
         * It was a checkbox in the middle of the summary column, at the same
         * visual rank as the horizon and the repeat rule, so the one act the
         * record exists to let you perform sat among its properties. It is now
         * the header's action, in the slot every other record in DalyHub already
         * puts its lifecycle act in, and in the SAME words a Project uses
         * ("Complete project" / "Reopen project") so one vocabulary covers both.
         *
         * `secondary` rather than filled, for the reason RECORD-01 recorded for
         * the Project: finishing a task is a lifecycle act, not the next thing
         * the owner came to this surface to do, and the loudest control on a
         * record should not be the one that ends it. The current state is not
         * inferred from the button — the header's status chip beside it says
         * "Completed" in words.
         */
        primaryAction={{
          id: completed ? "reopen" : "complete",
          label: completed ? "Reopen task" : "Complete task",
          variant: "secondary",
          disabled: completionPending,
          onSelect: () => toggleCompletion(!completed),
        }}
        /*
         * TASKS-13 — the checklist is the record's FEATURE region.
         *
         * `RecordLayout` places `feature` directly under the header and above
         * the summary band, and describes that slot as the region that IS the
         * record's subject. For a Task with steps, the steps are what the owner
         * opened the record to work through — so it sits above the parent, the
         * waiting state, the dates and the repeat rule rather than below all
         * four of them. The Task record's stylesheet already de-cards this
         * region (DS-04), so it costs no container.
         *
         * A Task with NO checklist pays one subtle button for it.
         */
        featureLabel="Checklist"
        feature={
          <TaskChecklistSection
            checklist={checklist}
            /*
             * DELETED, not completed — the same test every other control in
             * this record makes. A completed Task keeps its steps editable
             * because "finished it, forgot to tick the last one" is an ordinary
             * correction, and because a completed occurrence of a recurring
             * Task would otherwise carry a mis-ticked step for good. The one
             * control completion does disable is the repeat rule above, which
             * has already produced its successor.
             */
            readOnly={task.deletedAt !== null}
          />
        }
        summary={{
          description: (
            <div className="dh-task-drawer__summary-controls">
              {/*
               * CONTROL-01 §4 — the parent, where it can be SEARCHED.
               *
               * The shared server-backed picker over `/tasks/parent-options`,
               * the same control the retired quick-edit panel carried and the
               * same endpoint the row's inline editor uses. It is in the control
               * column rather than the metadata list because it is the one Task
               * property whose options are the whole workspace: a bounded menu
               * of the first page would have quietly turned "move this task
               * anywhere" into "move it somewhere near the top of the list".
               */}
              <SelectField
                label="Project or Area"
                /*
                 * TASKS-04 — an Inbox task has NO structural parent, and the
                 * record STATES that rather than leaving an empty control the
                 * reader has to interpret. Silence here reads as "we lost it";
                 * an instruction ("leave blank to…") tells the owner what to do
                 * without telling them where the task currently is. So the help
                 * line is the FACT when there is no parent, and the instruction
                 * only once there is one to clear.
                 */
                help={
                  parentValue === ""
                    ? "Unassigned — this task is in Inbox."
                    : "Clear it to move this task back to Inbox."
                }
                showOptionalCue={false}
                placeholder="Search Projects and Areas"
                value={parentValue}
                options={parentOptions}
                onSearch={parentSearch.search}
                loading={parentSearch.loading}
                emptyMessage="No matching Projects or Areas"
                // Serialised, not queued: a second change cannot be started
                // until the first has been answered, so the record can never
                // settle on whichever response happened to land last.
                disabled={parentPending}
                /*
                 * A refusal is REPORTED, never swallowed. `SelectField` has no
                 * per-field error slot on this surface, so a rejected parent
                 * change goes through the same feedback channel every other
                 * mutation on this record uses — the alternative is a control
                 * that appears to have moved the task and has not.
                 */
                onChange={(value) => {
                  void setParent(value).then((outcome) => {
                    if (!outcome.ok) {
                      notifyError(
                        outcome.message ??
                          "That couldn’t be saved. Nothing was changed — try again.",
                      );
                    }
                  });
                }}
              />
              <TaskWaitingSection
                waiting={task.waiting}
                completed={completed}
                searchTargets={searchWaitingTargets}
                onSetWaiting={setWaiting}
                onClear={clearWaiting}
              />
              <TaskPlanningSection
                scheduledDate={task.scheduledDate}
                dueDate={task.dueDate}
                todayIso={data.todayIso}
                completed={completed}
                onPlan={planTask}
                onClear={clearPlan}
                onSetDue={setDueDate}
              />
              {/*
               * CONTROL-01 §4 — the repeat rule, beside the plan it advances.
               *
               * The shared editor, moved here from the retired second drawer. It
               * sits after Planning because a rule needs an anchor that exists
               * and the anchor is the plan directly above it.
               */}
              <TaskRecurrenceEditor
                task={{
                  recurrence: task.recurrence ?? null,
                  scheduledDate: task.scheduledDate,
                  dueDate: task.dueDate,
                }}
                onSave={saveRecurrence}
                disabled={completed}
              />
            </div>
          ),
          metadata,
        }}
        tabs={[
          {
            id: "details",
            label: "Details",
            content: (
              <TaskDetailsTab
                task={task}
                isEditing={isEditing}
                onEdit={() => setEditing(true)}
                onCancel={() => setEditing(false)}
                onSubmit={submitUpdate}
                onSaved={() => setEditing(false)}
              />
            ),
          },
          {
            id: "linked",
            label: "Linked",
            content: (
              <TaskLinksTab
                task={task}
                links={data.links}
                searchTargets={searchTargets}
                onLink={linkTarget}
                onUnlink={unlinkTarget}
                contextualActions={contextualActions}
              />
            ),
          },
          {
            id: "activity",
            label: "Activity",
            content: <TaskTimelineTab taskId={taskId} basePath={basePath} />,
          },
        ]}
      />
    </div>
  );
}
