/**
 * PROJ-05 Slice 3 — the project record's Settings tab.
 *
 * The final record tab (Tasks · Key links · Activity · Settings, per the shared
 * tab vocabulary), composed ENTIRELY from the shared DS-10b Settings system
 * (`~/shared/settings`) over DS-06 controls and the DS-10 Feedback platform —
 * there is no bespoke settings screen, form engine, confirmation dialog or
 * notification system here. This module supplies only typed values, the async
 * apply/confirm callbacks (which post to the existing, trusted
 * `/projects/:projectId/mutate` action) and the copy.
 *
 * Three settings, three declared change behaviours (ADR-026 §26.3):
 *   - **Area/Goal (organisation)** — an IMMEDIATE `SelectField` (composed through
 *     a self-naming `SettingsRow`, per DS-10b's row anatomy), server-backed and
 *     searchable via the SAME `/projects/parent-options` endpoint the create form
 *     uses (`useParentOptionsSearch`). The seed is the CURRENT parent only
 *     (derived from the already-loaded overview, not a fetched catalogue) — the
 *     Project record loader never fetches the whole Area/Goal catalogue just to
 *     seed this picker; every OTHER eligible parent is discovered by searching.
 *     Submits the existing `move` intent, which resolves to `SpineRepository.move`
 *     server-side — the client never asserts a parent's kind. `useImmediateSetting`
 *     gives optimistic apply + revert-on-failure for free.
 *   - **Workflow status** — an IMMEDIATE native `<select>` (Planned/Active/On
 *     hold), submitted via the existing `set_status` intent, with the SAME
 *     revert-on-failure coordinator.
 *   - **Archive** — a `DangerousAction` in a `tone="danger"` group, submitted via
 *     the existing `archive` intent. A blocked archive (an unfinished direct
 *     Task) surfaces the typed `ProjectArchiveBlockedError` message INLINE in the
 *     confirmation dialog (never claims success, never mutates anything, never
 *     appends Activity) with retry available. Reversible, so no typed
 *     confirmation phrase is required (DS-10b's declared friction for a
 *     reversible action).
 *
 * An ARCHIVED project renders read-only: ordinary/restorative "Restore" (via the
 * existing `restore` intent, deliberately NOT styled as a dangerous action) plus
 * the preserved Area/Goal and workflow status as plain read-only text — no
 * mutation control that would only fail against an archived project is ever
 * rendered (not merely disabled).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ConfirmationDialog,
  DangerousAction,
  SettingsGroup,
  SettingsLayout,
  SettingsRow,
  useImmediateSetting,
} from "~/shared/settings";
import { SelectField } from "~/shared/forms";
import { useFeedback } from "~/shared/feedback";
import {
  PROJECT_WORKFLOW_STATUSES,
  projectWorkflowStatusLabel,
  type ProjectWorkflowStatus,
} from "~/kernel/project-settings";

import {
  isProjectArchived,
  type SerializedProjectOverview,
} from "./project-view";
import { useParentOptionsSearch } from "./use-parent-options-search";
import type { SelectOption } from "~/shared/forms/types";

export interface ProjectSettingsTabProps {
  readonly overview: SerializedProjectOverview;
  /** Apply a workflow-status change (`set_status`). Reject to fail (reverts). */
  readonly onSetStatus: (
    status: ProjectWorkflowStatus,
    signal: AbortSignal,
  ) => Promise<void>;
  /** Move the project under a different Area/Goal (`move`). Reject to fail. */
  readonly onMove: (parentId: string, signal: AbortSignal) => Promise<void>;
  /** Archive the project (`archive`). Reject (typed message) to fail. */
  readonly onArchive: () => Promise<void>;
  /** Restore an archived project (`restore`). Reject to fail. */
  readonly onRestore: () => Promise<void>;
}

/** The current structural parent (goal takes precedence — a project advancing a
 * Goal has the Goal, not its derived Area, as its actual structural parent). */
function currentParent(overview: SerializedProjectOverview): {
  readonly id: string;
  readonly title: string;
  readonly kind: "area" | "goal";
} | null {
  if (overview.goal) {
    return { id: overview.goal.id, title: overview.goal.title, kind: "goal" };
  }
  if (overview.area) {
    return { id: overview.area.id, title: overview.area.title, kind: "area" };
  }
  return null;
}

function OrganisationRow({
  overview,
  onMove,
}: {
  readonly overview: SerializedProjectOverview;
  readonly onMove: (parentId: string, signal: AbortSignal) => Promise<void>;
}) {
  const parent = currentParent(overview);
  // Seed with the CURRENT parent only — never the whole Area/Goal catalogue.
  // Every other eligible parent is discovered by searching `/projects/parent-
  // options?q=`; this keeps the Project record loader independent of catalogue
  // size (it doesn't fetch Areas/Goals at all), while the current parent's
  // label always resolves even before the user types anything.
  const seed: readonly SelectOption[] = parent
    ? [
        {
          value: parent.id,
          label: parent.title,
          description: parent.kind === "goal" ? "Goal" : "Area",
        },
      ]
    : [];
  const search = useParentOptionsSearch(seed);

  const setting = useImmediateSetting<string>({
    initialValue: parent?.id ?? "",
    successMessage: "Organisation updated",
    feedbackKey: `project-parent-${overview.id}`,
    onApply: onMove,
  });

  return (
    <SettingsRow
      control={
        <SelectField
          label="Area or Goal"
          help="Move this project under a different Area, or to advance a Goal."
          placeholder="Search Areas and Goals"
          required
          disabled={setting.pending}
          options={search.withSelected(setting.value)}
          onSearch={search.onSearch}
          loading={search.loading}
          emptyMessage="No matching Areas or Goals"
          value={setting.value}
          onBlur={() => {}}
          onChange={(next) => {
            // A no-op reselection of the current parent applies neither a
            // mutation nor a success toast — the server already treats it as
            // unchanged, but skipping the round-trip here keeps the interaction
            // calm (DS-10b §26.3 "no-op" — no Activity churn either way).
            if (next.length === 0 || next === setting.value) {
              return;
            }
            setting.apply(next);
          }}
        />
      }
    />
  );
}

function WorkflowStatusRow({
  overview,
  onSetStatus,
}: {
  readonly overview: SerializedProjectOverview;
  readonly onSetStatus: (
    status: ProjectWorkflowStatus,
    signal: AbortSignal,
  ) => Promise<void>;
}) {
  const setting = useImmediateSetting<ProjectWorkflowStatus>({
    initialValue: overview.status,
    successMessage: "Workflow status saved",
    feedbackKey: `project-status-${overview.id}`,
    onApply: onSetStatus,
  });

  return (
    <SettingsRow
      label="Workflow status"
      description="Where this project sits in your active work."
      status={setting.pending ? "Saving…" : undefined}
      statusLive
      control={(ids) => (
        <select
          id={ids.controlId}
          className="dh-settings-select"
          aria-labelledby={ids.labelId}
          aria-describedby={ids.describedById}
          value={setting.value}
          disabled={setting.pending}
          onChange={(event) => {
            const next = event.target.value as ProjectWorkflowStatus;
            if (next === setting.value) {
              return;
            }
            setting.apply(next);
          }}
        >
          {PROJECT_WORKFLOW_STATUSES.map((status) => (
            <option key={status} value={status}>
              {projectWorkflowStatusLabel(status)}
            </option>
          ))}
        </select>
      )}
    />
  );
}

function ArchiveGroup({
  overview,
  onArchive,
}: {
  readonly overview: SerializedProjectOverview;
  readonly onArchive: () => Promise<void>;
}) {
  return (
    <SettingsGroup
      title="Archive"
      description="Move this project out of your normal views. It can be restored at any time."
      tone="danger"
    >
      <DangerousAction
        label="Archive this project"
        description="The project and its tasks become read-only until restored."
        actionLabel="Archive project…"
        confirmTitle="Archive this project?"
        confirmBody={
          <>
            <p>
              Archiving <strong>{overview.title}</strong> moves it out of your
              normal Projects views.
            </p>
            <ul>
              <li>
                The project and its tasks become read-only until you restore it.
              </li>
              <li>
                You can restore it at any time from the Archived Projects
                collection.
              </li>
              <li>
                If it has unfinished tasks directly under it, complete or move
                them first — archiving is blocked while any remain.
              </li>
            </ul>
          </>
        }
        confirmLabel="Archive project"
        busyLabel="Archiving…"
        successMessage="Project archived"
        onConfirm={onArchive}
      />
    </SettingsGroup>
  );
}

function RestoreGroup({
  onRestore,
}: {
  readonly onRestore: () => Promise<void>;
}) {
  const feedback = useFeedback();
  const [open, setOpen] = useState(false);
  const [opener, setOpener] = useState<HTMLElement | null>(null);

  const confirm = useCallback(async () => {
    await onRestore();
    feedback.notifySuccess("Project restored");
  }, [onRestore, feedback]);

  return (
    <>
      <SettingsRow
        label="Restore this project"
        description="Bring it back into your normal Projects views. Its workflow status is preserved."
        control={
          <button
            type="button"
            className="dh-btn dh-btn--secondary"
            onClick={(event) => {
              setOpener(event.currentTarget);
              setOpen(true);
            }}
          >
            Restore project…
          </button>
        }
      />
      <ConfirmationDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={confirm}
        title="Restore this project?"
        confirmLabel="Restore project"
        busyLabel="Restoring…"
        tone="default"
        opener={opener}
      >
        <p>
          This brings it back into your normal Projects views. Its workflow
          status is preserved; its tasks and links are unaffected.
        </p>
      </ConfirmationDialog>
    </>
  );
}

export function ProjectSettingsTab({
  overview,
  onSetStatus,
  onMove,
  onArchive,
  onRestore,
}: ProjectSettingsTabProps) {
  const archived = isProjectArchived(overview);
  const parent = currentParent(overview);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const previousArchived = useRef(archived);

  useEffect(() => {
    if (previousArchived.current === archived) {
      return;
    }
    previousArchived.current = archived;
    const frame = requestAnimationFrame(() => {
      const settings = rootRef.current?.querySelector<HTMLElement>(
        ".dh-settings[aria-label='Project settings']",
      );
      settings?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [archived]);

  return (
    <div className="dh-project-settings" ref={rootRef}>
      <h2 className="dh-visually-hidden">Settings</h2>
      <SettingsLayout aria-label="Project settings">
        {archived ? (
          <>
            <SettingsGroup
              title="Archived"
              description="This project is archived and read-only. Restore it to make changes."
            >
              <RestoreGroup onRestore={onRestore} />
            </SettingsGroup>
            <SettingsGroup
              title="Preserved details"
              description="Read-only while archived — these are unchanged from before archiving."
            >
              <SettingsRow
                label="Area or Goal"
                control={
                  <span className="dh-settings-readonly-value">
                    {parent ? parent.title : "None"}
                  </span>
                }
              />
              <SettingsRow
                label="Workflow status"
                control={
                  <span className="dh-settings-readonly-value">
                    {projectWorkflowStatusLabel(overview.status)}
                  </span>
                }
              />
            </SettingsGroup>
          </>
        ) : (
          <>
            <SettingsGroup
              title="Organisation"
              description="Move this project under a different Area, or to advance a Goal."
            >
              <OrganisationRow overview={overview} onMove={onMove} />
            </SettingsGroup>
            <SettingsGroup
              title="Workflow"
              description="Track where this project sits in your active work."
            >
              <WorkflowStatusRow
                overview={overview}
                onSetStatus={onSetStatus}
              />
            </SettingsGroup>
            <ArchiveGroup overview={overview} onArchive={onArchive} />
          </>
        )}
      </SettingsLayout>
    </div>
  );
}
