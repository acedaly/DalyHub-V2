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
 *   - **Workflow status** — an IMMEDIATE `SelectField` (Planned/Active/On hold),
 *     submitted via the existing `set_status` intent, with the SAME
 *     revert-on-failure coordinator. (It was a native `<select>` until M3-INT
 *     converged the product's application-style selects on one control.)
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
import type { EntityIconKey } from "~/kernel/entities/entity-icon-keys";
import {
  identityForRank,
  type IdentityColourSlot,
} from "~/kernel/entities/identity-colour-slots";
import { EntityIdentityPicker } from "~/shared/entity";
import type { ProjectHealth } from "~/shared/project-health";
import { RecordDetails, type RecordMetaItem } from "~/shared/record-layout";
import { formatCalendarDate } from "~/shared/task-record/task-view";
import { SelectField } from "~/shared/forms";
import { useFeedback } from "~/shared/feedback";
import {
  PROJECT_WORKFLOW_STATUSES,
  projectWorkflowStatusLabel,
  type ProjectWorkflowStatus,
} from "~/kernel/project-settings";

import {
  isProjectArchived,
  projectStateLabel,
  type SerializedProjectOverview,
} from "./project-view";
import { useParentOptionsSearch } from "./use-parent-options-search";
import type { SelectOption } from "~/shared/forms/types";

export interface ProjectSettingsTabProps {
  readonly overview: SerializedProjectOverview;
  /**
   * RECORD-01 — the derived health, for the one fact its reasons do not carry:
   * when the project last saw meaningful activity. Optional so a caller without
   * it simply omits that row rather than inventing one.
   */
  readonly health?: ProjectHealth;
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
  /** Choose or clear the project's icon (`set_icon`). Reject to fail. */
  /**
   * Choose or clear the Project's IDENTITY — icon and colour together
   * (`setIdentity`). Reject to fail.
   */
  readonly onSetIdentity?: (identity: {
    readonly iconKey: EntityIconKey | null;
    readonly colourSlot: IdentityColourSlot | null;
  }) => Promise<void>;
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
      /* M3-INT — converged on the shared `SelectField` (audit finding 6). This
       * row rendered a native `<select>` two rows below the Area/Goal picker's
       * combobox, in the same panel, which is the same "two select
       * presentations, adjacent" divergence the audit found in Settings. The
       * change behaviour is untouched: still immediate, still the `set_status`
       * intent, still revert-on-failure through `useImmediateSetting`. */
      control={(ids) => (
        <SelectField
          id={ids.controlId}
          label="Workflow status"
          labelledBy={ids.labelId}
          describedBy={ids.describedById}
          showOptionalCue={false}
          value={setting.value}
          disabled={setting.pending}
          options={PROJECT_WORKFLOW_STATUSES.map((status) => ({
            value: status,
            label: projectWorkflowStatusLabel(status),
          }))}
          onChange={(next) => {
            if (next === setting.value || next.length === 0) {
              return;
            }
            setting.apply(next as ProjectWorkflowStatus);
          }}
        />
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

/**
 * The icon group. Commits on Apply — the picker has already staged the choice,
 * and a second Save button for a single value would be ceremony. A failure is
 * reported inline and the stored icon is unchanged, because the loader value is
 * the truth and the write did not land.
 */
function ProjectAppearanceGroup({
  iconKey,
  colourSlot,
  derivedSlot,
  onSetIdentity,
}: {
  readonly iconKey: string | null;
  readonly colourSlot: string | null;
  readonly derivedSlot: IdentityColourSlot | null;
  readonly onSetIdentity: (identity: {
    readonly iconKey: EntityIconKey | null;
    readonly colourSlot: IdentityColourSlot | null;
  }) => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <SettingsGroup
      title="Appearance"
      description="The colour and icon this project wears in collections, records and search."
    >
      <EntityIdentityPicker
        entityType="project"
        value={{ iconKey, colourSlot }}
        derivedSlot={derivedSlot}
        error={error}
        help="Optional. Projects that choose neither use the standard Project icon and the colour their position gives them."
        onChange={(next) => {
          setError(null);
          void onSetIdentity(next).catch((cause: unknown) => {
            setError(
              cause instanceof Error
                ? cause.message
                : "That couldn’t be saved. Please try again.",
            );
          });
        }}
      />
    </SettingsGroup>
  );
}

/**
 * RECORD-01 — the project's administrative history, demoted here from the record
 * header and the roll-up card.
 *
 * Created, Updated and the raw workflow State were competing for space with the
 * project's actual work at the top of the record; "last activity" was the one
 * fact the roll-up card's key/value grid carried that its own reason list did
 * not. None of it is deleted — this is where a reader goes for a record's
 * paperwork, and it is the same shared list on every record that has one.
 */
function ProjectRecordDetailsGroup({
  overview,
  health,
}: {
  readonly overview: SerializedProjectOverview;
  readonly health?: ProjectHealth;
}) {
  const items: RecordMetaItem[] = [];
  const created = formatCalendarDate(overview.createdAt.slice(0, 10));
  const updated = formatCalendarDate(overview.updatedAt.slice(0, 10));
  const state = projectStateLabel({
    completedAt: overview.completedAt,
    archivedAt: overview.archivedAt,
    status: overview.status,
  });

  items.push({ id: "d-state", label: "State", value: state.label });
  if (health) {
    items.push({
      id: "d-activity",
      label: "Last activity",
      value: health.summary.lastActivityDate
        ? (formatCalendarDate(health.summary.lastActivityDate) ?? "—")
        : "No recorded activity",
    });
  }
  if (created) {
    items.push({ id: "d-created", label: "Created", value: created });
  }
  if (updated) {
    items.push({ id: "d-updated", label: "Updated", value: updated });
  }

  return (
    <SettingsGroup
      title="Record details"
      description="When this project was created and last changed."
    >
      <RecordDetails items={items} label="Project record details" />
    </SettingsGroup>
  );
}

export function ProjectSettingsTab({
  overview,
  health,
  onSetStatus,
  onMove,
  onArchive,
  onRestore,
  onSetIdentity,
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
        {/* Hidden while archived rather than shown disabled: the route refuses
            every non-restore intent on an archived Project, so an operable-
            looking control here would be a lie. */}
        {onSetIdentity && !archived ? (
          <ProjectAppearanceGroup
            iconKey={overview.iconKey}
            colourSlot={overview.colourSlot}
            derivedSlot={
              overview.colourRank === null
                ? null
                : identityForRank(overview.colourRank)
            }
            onSetIdentity={onSetIdentity}
          />
        ) : null}
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
        <ProjectRecordDetailsGroup overview={overview} health={health} />
      </SettingsLayout>
    </div>
  );
}
