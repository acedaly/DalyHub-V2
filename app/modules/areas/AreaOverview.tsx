/**
 * AREA-01/AREA-02 — canonical Area record, composed through the shared DS-02
 * Record Layout. AREA-02 upgrades the Goals tab: each card links to the
 * canonical `/goals/:goalId` record, shows its target date when set (batched,
 * never a per-Goal read), and the tab gains a "New Goal" action — the exact
 * roll-up totals and bounded-card-page honesty AREA-01 established are
 * unchanged.
 */

import type { ReactNode } from "react";

import {
  Card,
  CardCollection,
  type CardMetaItem,
  type CardProps,
} from "~/shared/card";
import { DrawerTrigger } from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon, RecordIcon } from "~/shared/entity";
import { HealthIndicator } from "~/shared/project-health";
import { RecordLayout, type RecordMetaItem } from "~/shared/record-layout";
import { TITLE_MAX_LENGTH } from "~/kernel/entities";
import { InlineTextField, type InlineSaveOutcome } from "~/shared/inline-edit";
import { useRecordLifecycle } from "~/shared/record-lifecycle";
import { formatCalendarDate } from "~/shared/task-record/task-view";
import type { AreaMomentum } from "~/kernel/areas";

import {
  areaStateLabel,
  goalStateLabel,
  projectStateLabel,
  rollupProgress,
  type SerializedAreaGoalItem,
  type SerializedAreaOverview,
  type SerializedAreaProjectItem,
  type SerializedAreaRollup,
} from "./area-view";

/** The Drawer key that opens the AREA-02 "New Goal" create form. */
export const NEW_GOAL_KEY = "new-goal";

interface AreaOverviewViewProps {
  readonly overview: SerializedAreaOverview;
  readonly rollup: SerializedAreaRollup;
  readonly momentum: AreaMomentum;
  readonly goals: readonly SerializedAreaGoalItem[];
  readonly goalsNextCursor: string | null;
  readonly projects: readonly SerializedAreaProjectItem[];
  readonly projectsNextCursor: string | null;
  /** AREA-05: whether this Area is archived — drives the status label and guards
   * the non-lifecycle actions (Rename, New Goal) that are invalid while archived. */
  readonly archived?: boolean;
  /**
   * DS-16 — rename the Area from the record heading itself.
   *
   * Replaces the AREA-01 Drawer form: a one-line rename does not deserve a
   * panel, a form and a round trip through a second surface. Returns an outcome
   * rather than throwing, so a refusal keeps the typed name in the field with
   * the server's own message beside it.
   */
  readonly onRename: (title: string) => Promise<InlineSaveOutcome>;
  readonly onOpenGoal: (goalId: string) => void;
  readonly onOpenProject: (projectId: string) => void;
  readonly activityTab: ReactNode;
  /** The shared Universal Relationship System Linked Items section. */
  readonly linkedTab: ReactNode;
  /** AREA-05: the lifecycle & danger section (Archive/Restore + permanent delete). */
  readonly settingsTab?: ReactNode;
  /** PX-04: the shared lifecycle actions, also surfaced in the header overflow. */
  readonly onArchive?: () => Promise<void>;
  readonly onRestore?: () => Promise<void>;
  readonly onDelete?: () => Promise<void>;
  /** Whether this Area is empty enough to delete permanently (spine child guard). */
  readonly deletable?: boolean;
  readonly activeTabId?: string;
  readonly onTabChange?: (tabId: string) => void;
}

function dateLabel(iso: string): string | null {
  return formatCalendarDate(iso.slice(0, 10));
}

function MomentumPanel({ momentum }: { readonly momentum: AreaMomentum }) {
  return (
    <section className="dh-area-momentum" data-state={momentum.state}>
      <div className="dh-area-momentum__header">
        <span className="dh-health__pill" data-tone={momentum.tone}>
          <span className="dh-health__dot" aria-hidden="true" />
          {momentum.label}
        </span>
        <p>{momentum.summary}</p>
      </div>
      <ul className="dh-area-momentum__reasons">
        {momentum.reasons.map((reason) => (
          <li key={`${reason.code}-${reason.count ?? "none"}`}>
            {reason.summary}
          </li>
        ))}
      </ul>
    </section>
  );
}

function goalCard(
  goal: SerializedAreaGoalItem,
  onOpenGoal: (goalId: string) => void,
): CardProps {
  const projects = rollupProgress(
    {
      total: goal.projectTotal,
      completed: goal.projectCompleted,
      ratio:
        goal.projectTotal === 0
          ? null
          : goal.projectCompleted / goal.projectTotal,
    },
    "project",
  );
  const tasks = rollupProgress(
    {
      total: goal.taskTotal,
      completed: goal.taskCompleted,
      ratio: goal.taskTotal === 0 ? null : goal.taskCompleted / goal.taskTotal,
    },
    "task",
  );
  const metadata: CardMetaItem[] = [
    {
      id: "projects",
      label: "Projects",
      value: projects.has ? projects.summary : "No Projects yet",
    },
  ];
  if (!tasks.has) {
    metadata.push({ id: "tasks", label: "Tasks", value: "No tasks yet" });
  }
  // AREA-02: only shown when set, so an Area with no Goal target dates yet
  // never overcrowds the card with an empty field.
  if (goal.targetDate) {
    const formatted = formatCalendarDate(goal.targetDate);
    if (formatted) {
      metadata.push({ id: "target", label: "Target", value: formatted });
    }
  }

  return {
    id: goal.id,
    title: goal.title,
    typeLabel: "Goal",
    icon: <EntityIcon type="goal" />,
    headingLevel: 3,
    status: goalStateLabel(goal),
    metadata,
    progress: tasks.has
      ? {
          value: tasks.completed,
          max: tasks.total,
          label: `Task roll-up: ${tasks.summary}`,
        }
      : undefined,
    density: "comfortable",
    presentation: "list",
    href: `/goals/${encodeURIComponent(goal.id)}`,
    onOpen: () => onOpenGoal(goal.id),
    openAriaLabel: `Open ${goal.title}`,
  };
}

function projectCard(
  project: SerializedAreaProjectItem,
  onOpenProject: (projectId: string) => void,
): CardProps {
  const tasks = rollupProgress(
    {
      total: project.taskTotal,
      completed: project.taskCompleted,
      ratio:
        project.taskTotal === 0
          ? null
          : project.taskCompleted / project.taskTotal,
    },
    "task",
  );
  const metadata: CardMetaItem[] = [];
  if (project.healthVisible) {
    metadata.push({
      id: "health",
      label: "Health",
      value: <HealthIndicator health={project.health} showReason />,
    });
  }
  if (!tasks.has) {
    metadata.push({ id: "tasks", label: "Tasks", value: "No tasks yet" });
  }
  const parentLabel =
    project.parent.kind === "goal"
      ? `Goal: ${project.parent.goal.title}`
      : "Directly in this Area";
  // When the Project advances a Goal, its parent-Goal context is a real link to
  // the canonical Goal record — a separate link from the card's primary open
  // target (the Project), so no nested interactivity is created.
  const parentHref =
    project.parent.kind === "goal"
      ? `/goals/${encodeURIComponent(project.parent.goal.id)}`
      : undefined;

  return {
    id: project.id,
    title: project.title,
    typeLabel: "Project",
    icon: <EntityIcon type="project" />,
    headingLevel: 3,
    status: projectStateLabel(project),
    context: { label: parentLabel, href: parentHref },
    metadata,
    progress: tasks.has
      ? {
          value: tasks.completed,
          max: tasks.total,
          label: `Task roll-up: ${tasks.summary}`,
        }
      : undefined,
    density: "comfortable",
    presentation: "list",
    href: `/projects/${encodeURIComponent(project.id)}`,
    onOpen: () => onOpenProject(project.id),
    openAriaLabel: `Open ${project.title}`,
  };
}

function BoundedNote({
  kind,
  nextCursor,
}: {
  readonly kind: "Goals" | "Projects";
  readonly nextCursor: string | null;
}) {
  if (!nextCursor) {
    return null;
  }
  return (
    <p className="dh-area-bounded-note" role="note">
      More {kind.toLowerCase()} exist for this Area. This record shows the first
      bounded page.
    </p>
  );
}

export function AreaOverviewView({
  overview,
  rollup,
  momentum,
  goals,
  goalsNextCursor,
  projects,
  projectsNextCursor,
  archived = false,
  onRename,
  onOpenGoal,
  onOpenProject,
  activityTab,
  linkedTab,
  settingsTab,
  onArchive,
  onRestore,
  onDelete,
  deletable = false,
  activeTabId,
  onTabChange,
}: AreaOverviewViewProps) {
  const state = areaStateLabel(archived);
  const goalsProgress = rollupProgress(rollup.goals, "goal");
  const projectsProgress = rollupProgress(rollup.projects, "project");
  const tasksProgress = rollupProgress(rollup.tasks, "task");
  const created = dateLabel(overview.createdAt);
  const updated = dateLabel(overview.updatedAt);
  const headerMetadata: RecordMetaItem[] = [
    {
      id: "goals",
      label: "Goals",
      value: goalsProgress.has ? goalsProgress.summary : "No goals yet",
    },
    {
      id: "projects",
      label: "Projects",
      value: projectsProgress.has
        ? projectsProgress.summary
        : "No Projects yet",
    },
  ];
  if (tasksProgress.has) {
    headerMetadata.push({
      id: "tasks",
      label: "Tasks",
      value: tasksProgress.summary,
    });
  }
  const summaryMetadata: RecordMetaItem[] = [];
  if (created) {
    summaryMetadata.push({ id: "created", label: "Created", value: created });
  }
  if (updated) {
    summaryMetadata.push({ id: "updated", label: "Updated", value: updated });
  }
  summaryMetadata.push({
    id: "state",
    label: "State",
    value: state.label,
  });

  // AREA-05: an archived Area is read-only, so the heading renders as plain
  // text rather than as an editable control — a value that cannot be changed
  // must not look like one that can. The mutation is refused server-side too.

  // PX-04: Archive/Restore/Delete now ALSO live in the shared header overflow, in
  // the same place and wording as every other record. The Settings tab keeps the
  // full explanation and the dependency detail; the overflow is the discoverable
  // entry point the audit found missing (UXA-06).
  const lifecycle = useRecordLifecycle({
    entityType: "area",
    title: overview.title,
    archived,
    onArchive,
    onRestore,
    onDelete,
    deleteBlockedReason: deletable
      ? undefined
      : "Move or remove everything inside this Area first.",
  });

  return (
    <>
      <RecordLayout
        title={overview.title}
        titleSlot={
          <InlineTextField
            label="Area name"
            value={overview.title}
            onSave={onRename}
            readOnly={archived}
            variant="heading"
            maxLength={TITLE_MAX_LENGTH}
            data-testid="area-title-edit"
          />
        }
        typeLabel="Area"
        // The record's OWN icon, not merely its type's: `RecordIcon` renders
        // the chosen glyph and falls back to the Area default when there is
        // none (or when the stored key is one this build cannot resolve).
        icon={<RecordIcon entityType="area" iconKey={overview.iconKey} />}
        breadcrumb={[{ id: "areas", label: "Areas", href: "/areas" }]}
        status={{ label: state.label, tone: state.tone }}
        metadata={headerMetadata}
        overflowActions={lifecycle.overflowActions}
        summary={{
          description: (
            <div className="dh-area-overview__summary">
              {archived ? (
                <p className="dh-area-archived-notice" role="note">
                  <strong>This Area is archived.</strong> It’s hidden from your
                  active Areas and creation pickers and is read-only. Restore it
                  from the Settings tab to make changes.
                </p>
              ) : null}
              <p className="dh-area-overview__progress">
                <span className="dh-area-overview__progress-label">
                  Roll-up progress:
                </span>{" "}
                {tasksProgress.has
                  ? `${tasksProgress.percent}% — ${tasksProgress.summary} complete`
                  : "No active tasks yet."}
              </p>
              <MomentumPanel momentum={momentum} />
            </div>
          ),
          metadata: summaryMetadata,
        }}
        activeTabId={activeTabId}
        onTabChange={onTabChange}
        tabs={[
          {
            id: "goals",
            label: "Goals",
            badge: rollup.goals.total,
            content:
              goals.length === 0 ? (
                <EmptyState
                  icon={<EntityIcon type="goal" />}
                  title="No Goals in this Area"
                  description={
                    archived
                      ? "This Area is archived. Restore it to add Goals."
                      : "Goals give this Area a direction and a definition of done."
                  }
                  primaryAction={
                    archived ? undefined : (
                      <DrawerTrigger
                        drawerKey={NEW_GOAL_KEY}
                        className="dh-btn dh-btn--primary"
                      >
                        New Goal
                      </DrawerTrigger>
                    )
                  }
                />
              ) : (
                <>
                  <h2 className="dh-visually-hidden">Goals</h2>
                  {archived ? null : (
                    <div className="dh-area-tab-toolbar">
                      <DrawerTrigger
                        drawerKey={NEW_GOAL_KEY}
                        className="dh-btn dh-btn--secondary"
                      >
                        New Goal
                      </DrawerTrigger>
                    </div>
                  )}
                  <CardCollection
                    items={goals}
                    getItemId={(goal) => goal.id}
                    ariaLabel="Area Goals"
                    presentation="list"
                    density="comfortable"
                    renderCard={(goal) => (
                      <Card {...goalCard(goal, onOpenGoal)} />
                    )}
                  />
                  <BoundedNote kind="Goals" nextCursor={goalsNextCursor} />
                </>
              ),
          },
          {
            id: "projects",
            label: "Projects",
            badge: rollup.projects.total,
            content:
              projects.length === 0 ? (
                <EmptyState
                  icon={<EntityIcon type="project" />}
                  title="No Projects in this Area"
                  description="Direct Projects and Projects advancing this Area’s Goals will appear here."
                />
              ) : (
                <>
                  <h2 className="dh-visually-hidden">Projects</h2>
                  <CardCollection
                    items={projects}
                    getItemId={(project) => project.id}
                    ariaLabel="Area Projects"
                    presentation="list"
                    density="comfortable"
                    renderCard={(project) => (
                      <Card {...projectCard(project, onOpenProject)} />
                    )}
                  />
                  <BoundedNote
                    kind="Projects"
                    nextCursor={projectsNextCursor}
                  />
                </>
              ),
          },
          { id: "linked", label: "Linked", content: linkedTab },
          { id: "activity", label: "Activity", content: activityTab },
          ...(settingsTab
            ? [{ id: "settings", label: "Settings", content: settingsTab }]
            : []),
        ]}
      />
      {lifecycle.dialogs}
    </>
  );
}
