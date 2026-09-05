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
  ProgressRowList,
  MetricRow,
  MetricRowItem,
  MetricTile,
  type CardMetaItem,
  type CardProps,
} from "~/shared/card";
import { DrawerTrigger } from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import { AccentIcon, EntityIcon } from "~/shared/entity";
import { HealthIndicator } from "~/shared/project-health";
/*
 * STEER-03 — the shared Goal story. The Areas module reaches it through
 * `~/shared`, not through `~/modules/goals`: a module may not import another
 * module's internals, and a rule that has to be the same on every surface has
 * to live where every surface can reach it.
 */
import {
  GoalStoryRow,
  goalIdentitySource,
  type GoalStory,
} from "~/shared/goal-progress";
import { UNMEASURED_GOAL_PROGRESS } from "~/kernel/goals";
import { RecordLayout } from "~/shared/record-layout";
import { TITLE_MAX_LENGTH } from "~/kernel/entities";
import { InlineTextField, type InlineSaveOutcome } from "~/shared/inline-edit";
import { useRecordLifecycle } from "~/shared/record-lifecycle";
import { formatCalendarDate } from "~/shared/task-record/task-view";
import type { AreaMomentum } from "~/kernel/areas";

import {
  areaStateLabel,
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
  /**
   * UIX-02 — the COMPLETE count of actively-worked Projects in this Area, from
   * the loader's own complete momentum boundary rather than from the bounded
   * `projects` card page above.
   */
  readonly activeProjectTotal: number;
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
  /*
   * STEER-03 — `onOpenGoal` is GONE.
   *
   * It existed because the Goal CARD's primary open target was a callback the
   * route turned into a `navigate()`. The shared `GoalStoryRow` opens through a
   * react-router `<Link>`, which is the same client-side navigation with a real
   * href behind it — so the callback was a second way to say the same thing,
   * and one of them was not middle-clickable.
   */
  readonly onOpenProject: (projectId: string) => void;
  readonly activityTab: ReactNode;
  /** The shared Universal Relationship System Linked Items section. */
  readonly linkedTab: ReactNode;
  /** AREA-05: the lifecycle & danger section (Archive/Restore + permanent delete). */
  readonly settingsTab?: ReactNode;
  /** HABITS-01 — the Area's active Habits, as contextual support. */
  readonly habitsSlot?: ReactNode;
  /** PX-04: the shared lifecycle actions, also surfaced in the header overflow. */
  readonly onArchive?: () => Promise<void>;
  readonly onRestore?: () => Promise<void>;
  readonly onDelete?: () => Promise<void>;
  /** Whether this Area is empty enough to delete permanently (spine child guard). */
  readonly deletable?: boolean;
  readonly activeTabId?: string;
  readonly onTabChange?: (tabId: string) => void;
}

/**
 * RECORD-01 — the Area's momentum, as the summary band's state chip.
 *
 * The pill alone. It used to head an outlined card nested inside the summary
 * card, above a duplicate of its own summary sentence and a bulleted list of
 * its reasons — three statements of one thing inside two containers. The
 * sentence and the reasons now reach the band directly, as its note and its
 * signal line.
 */
function MomentumChip({ momentum }: { readonly momentum: AreaMomentum }) {
  return (
    <span className="dh-health__pill" data-tone={momentum.tone}>
      <span className="dh-health__dot" aria-hidden="true" />
      {momentum.label}
    </span>
  );
}

/**
 * STEER-03 (DEBT-206) — an Area's Goal, told through the SHARED Goal story.
 *
 * ── What this replaced ─────────────────────────────────────────────────────
 * A hand-built Card whose progress bar was the Area's Task ROLL-UP
 * (`taskCompleted / taskTotal`), captioned "Task roll-up", with no measurement,
 * no movement, no alignment and no owner condition. It was a third measure of a
 * Goal that no other surface in the product showed: the same Goal read
 * *"53% · Ahead"* on Today and an unrelated task-count percentage on its own
 * Area, with nothing on either surface saying they were different questions.
 *
 * ── What it is now ─────────────────────────────────────────────────────────
 * The SAME `GoalStoryRow` `/goals` renders, from the same shared evaluators —
 * so the bar is GOAL-02's measurement (absent, not zero, on an unmeasured
 * Goal), the sentence beneath is FOLLOW-02's movement, the indicator is
 * ADR-040's alignment and the word beside them is STEER-02's owner condition.
 * The mark is `goalIdentitySource`'s one identity rule, with the AREA's own
 * identity as the inherited rung — this record knows it, so a Goal with no
 * colour of its own is drawn in its Area's, exactly as `/goals` draws it.
 *
 * ── The roll-up is kept, and worded as what it is ──────────────────────────
 * The Projects and Tasks counts are real structural facts, and the Area record
 * is where structure is read. They stay, on the row's CONTEXT line, phrased as
 * counts of Projects and Tasks — never as a percentage, never as a bar, and
 * never as the Goal's progress answer.
 */
function areaGoalStructureNote(goal: SerializedAreaGoalItem): string | null {
  const parts: string[] = [];
  if (goal.projectTotal > 0) {
    parts.push(
      `${goal.projectCompleted} of ${goal.projectTotal} ${
        goal.projectTotal === 1 ? "Project" : "Projects"
      } complete`,
    );
  } else {
    parts.push("No Projects yet");
  }
  if (goal.taskTotal > 0) {
    parts.push(
      `${goal.taskCompleted} of ${goal.taskTotal} ${
        goal.taskTotal === 1 ? "Task" : "Tasks"
      } complete`,
    );
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * The story a Goal with no readable story still tells.
 *
 * The story read is its own failure domain (see the Area loader), so a Goal can
 * arrive without one. It keeps its identity, its title and its structure; what
 * it loses is the derived facts, and it says so by showing none of them rather
 * than by showing zeros.
 */
/**
 * AREA-02's target date, kept. Only shown when SET, so an Area whose Goals carry
 * no target dates never reads a column of "No target date" — an ordinary
 * absence must not be drawn as a problem.
 */
function areaGoalTargetNote(goal: SerializedAreaGoalItem): string | null {
  if (!goal.targetDate) return null;
  const formatted = formatCalendarDate(goal.targetDate);
  return formatted ? `Target ${formatted}` : null;
}

function areaGoalStory(goal: SerializedAreaGoalItem): GoalStory {
  return (
    goal.story ?? {
      id: goal.id,
      title: goal.title,
      progress: { ...UNMEASURED_GOAL_PROGRESS, targetDate: goal.targetDate },
      alignment: null,
      movement: null,
      condition: null,
      targetDate: goal.targetDate,
      contribution: null,
      // This surface does not read the snapshot series — see `GoalStory`.
      contributionAcrossReviews: null,
    }
  );
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

/**
 * UIX-02 — the Area Overview tab.
 *
 * Three counts and the recent activity. That is the whole budget, and the
 * restraint is the design: the brief's own warning about this surface is that
 * an overview becomes "six meaningless stat widgets", and an Area is precisely
 * the record where a dashboard would be least honest.
 *
 * Every figure is a COUNT OF LIVING THINGS — open Goals, active Projects, open
 * Tasks — never a proportion, a score or a health rating. An Area does not
 * complete, so there is nothing here to express as a percentage, and the one
 * derived judgement the product does make about an Area (its momentum) is
 * already stated once in the band above rather than repeated as a tile.
 *
 * Each tile is a way into the section that holds those records, so the overview
 * answers "what is here?" and then hands the owner somewhere to go.
 */
function AreaOverviewTab({
  rollup,
  activeProjects,
  openTasks,
  onSelectTab,
  activityTab,
  habitsSlot,
}: {
  readonly rollup: SerializedAreaRollup;
  /**
   * The COMPLETE count of actively-worked Projects, from the loader.
   *
   * Not derived from the displayed card page: that page is bounded at 50, so an
   * Area running more than that would have undercounted here while the tab
   * badge beside it showed the true total. A record never presents a bounded
   * page as a total.
   */
  readonly activeProjects: number;
  readonly openTasks: number;
  readonly onSelectTab?: (tabId: string) => void;
  readonly activityTab: ReactNode;
  /**
   * HABITS-01 — the behaviours the owner practises in this part of life.
   *
   * A SLOT, so the Areas module stays unaware of what a Habit is. It sits ABOVE
   * the activity feed and below the counts, because it is current context
   * ("these are the routines that live here") rather than history — and it is
   * deliberately not counted in any of the three tiles: a Habit is not a Goal,
   * a Project or a Task, and folding it into one of those figures would be the
   * exact conflation this module exists to prevent.
   */
  readonly habitsSlot?: ReactNode;
}) {
  const openGoals = Math.max(0, rollup.goals.total - rollup.goals.completed);
  /*
   * The empty state is decided by the SAME three figures the tiles draw, not by
   * the roll-up's historical totals.
   *
   * An Area whose Goals are all met and whose Projects are all finished has
   * `goals.total > 0` and `projects.total > 0`, so keying off those rendered
   * three tiles reading zero — which is the "an absence is never drawn as a
   * state" rule broken by the very component that cites it. What the owner
   * should see there is the one sentence.
   */
  const empty = openGoals === 0 && activeProjects === 0 && openTasks === 0;

  return (
    <div className="dh-area-overview">
      <h2 className="dh-visually-hidden">Overview</h2>

      {empty ? (
        /*
         * A brand-new Area gets one sentence, not three tiles reading zero.
         * "An absence is never drawn as a state" is the design system's rule
         * for Goals and it holds just as well here.
         */
        <EmptyState
          size="inline"
          headingLevel={3}
          title="Nothing running in this Area yet."
          description="Goals, Projects and Tasks you file here will show up in this overview."
        />
      ) : (
        <MetricRow data-testid="area-overview-metrics">
          <MetricRowItem>
            <MetricTile
              value={String(openGoals)}
              label={openGoals === 1 ? "open Goal" : "open Goals"}
              supporting={
                <button
                  type="button"
                  className="dh-btn dh-btn--ghost dh-btn--sm"
                  onClick={() => onSelectTab?.("goals")}
                >
                  View Goals
                </button>
              }
            />
          </MetricRowItem>
          <MetricRowItem>
            <MetricTile
              value={String(activeProjects)}
              label={
                activeProjects === 1 ? "active Project" : "active Projects"
              }
              supporting={
                <button
                  type="button"
                  className="dh-btn dh-btn--ghost dh-btn--sm"
                  onClick={() => onSelectTab?.("projects")}
                >
                  View Projects
                </button>
              }
            />
          </MetricRowItem>
          <MetricRowItem>
            <MetricTile
              value={String(openTasks)}
              // Across this Area's Projects AND its direct tasks — the SAME
              // roll-up definition the spine uses everywhere else, in the label
              // itself so the figure cannot be misread as "tasks I filed here".
              // It is not a `supporting` line because that slot is drawn as a
              // link, and this is a scope note with nowhere to go: an Area has
              // no Tasks tab to send anyone to.
              label={
                openTasks === 1
                  ? "open task in this Area"
                  : "open tasks in this Area"
              }
            />
          </MetricRowItem>
        </MetricRow>
      )}

      {habitsSlot}

      {/*
       * The activity feed itself, not a second copy of it: the same component
       * the Activity tab renders. An Area's recent events are the most useful
       * thing an overview can carry, and rendering them here rather than
       * summarising them means there is one implementation to keep honest.
       */}
      <section
        className="dh-area-overview__activity"
        aria-label="Recent activity"
      >
        <h3 className="dh-area-overview__heading">Recent activity</h3>
        {activityTab}
      </section>
    </div>
  );
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
  activeProjectTotal,
  archived = false,
  onRename,
  onOpenProject,
  activityTab,
  linkedTab,
  settingsTab,
  habitsSlot,
  onArchive,
  onRestore,
  onDelete,
  deletable = false,
  activeTabId,
  onTabChange,
}: AreaOverviewViewProps) {
  const state = areaStateLabel(archived);
  const tasksProgress = rollupProgress(rollup.tasks, "task");
  /*
   * Open tasks across the Area — its Projects' and its own. The SAME roll-up
   * definition the spine uses everywhere else, expressed as a count of what is
   * outstanding rather than as a proportion of what is finished. See the
   * summary band below for why the proportion is gone.
   */
  const openTasks = Math.max(0, rollup.tasks.total - rollup.tasks.completed);
  /*
   * RECORD-01 — an Area's header carries NO context line.
   *
   * It used to carry "Goals 1 of 3 · Projects 2 of 5 · Tasks 9 of 24" — every
   * number of which the tab strip immediately below already shows as a badge,
   * and the task roll-up of which the summary band states again as a meter. An
   * Area sits at the top of the spine and has no parent to place it against, so
   * with the duplication removed there is genuinely nothing left to say here,
   * and the header simply ends after the title.
   *
   * Created, Updated and State moved to Settings → Record details.
   */

  /*
   * The quiet Area. An Area with nothing active does not need a progress meter
   * measuring nothing, a momentum chip, and a reason list — the audit found the
   * same absence stated four times on one screen. It gets one sentence.
   */
  const dormant = momentum.state === "empty" && !tasksProgress.has;

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
        /*
         * RECORD-01 — no `typeLabel`: the breadcrumb above already says "Areas".
         *
         * UIX-02 — the record's own icon on the record's own ACCENT, at the
         * same geometry the gallery draws. It was a bare monochrome glyph, so
         * the one screen dedicated to a single Area was the one screen where
         * that Area had no identity: an owner arriving from a list of coloured
         * marks landed on a grey outline of the same shape. `AccentIcon` is the
         * component the Areas list uses, resolving the same stored key and the
         * same stable rank — recognition survives the navigation.
         */
        icon={
          <AccentIcon
            entityType="area"
            iconKey={overview.iconKey}
            colourSlot={overview.colourSlot}
            colourRank={overview.colourRank}
            size="md"
          />
        }
        breadcrumb={[{ id: "areas", label: "Areas", href: "/areas" }]}
        /*
         * UIX-02 — a chip only when there is an EXCEPTION to report.
         *
         * The header carried "● Permanent" on every active Area, which is a
         * fact about Areas rather than about this Area — the same reasoning the
         * Areas gallery used when it dropped the chip in AREA-01, applied to
         * the record that kept it. What remains is "Archived", which is
         * genuinely exceptional, genuinely about this record, and the one state
         * that changes what the owner can do here.
         */
        status={archived ? { label: state.label, tone: state.tone } : undefined}
        overflowActions={lifecycle.overflowActions}
        /*
         * RECORD-01 — the momentum card becomes the summary band, and a dormant
         * Area gets a single line instead of a dashboard measuring nothing.
         *
         * Before: a "Roll-up progress: No active tasks yet." line, then an
         * outlined card nested in the summary card carrying a "No active work"
         * chip and the sentence "This Area has no active goals, projects or
         * tasks yet.", then a bullet inside THAT repeating it a third way — with
         * the header above having already said "Goals: No goals yet · Projects:
         * No Projects yet". After: one sentence.
         */
        /*
         * UIX-02 — the Area's band carries NO progress meter.
         *
         * It used to open with "Tasks — 3 of 6 tasks complete" over a full-width
         * violet bar: a COMPLETION PROPORTION, on the one entity in the spine
         * that by definition never completes (AGENTS.md §4). The Areas gallery
         * had never drawn one, and its own source file explains at length why —
         * but the record did, so the product said both things about the same
         * entity on two screens.
         *
         * It was also, quietly, a fabricated figure. An Area's task roll-up
         * spans every Project under it plus its direct tasks, so "50%" moved
         * whenever an unrelated Project finished something, and a mature Area
         * with years of completed work would sit near 100% for ever — reading
         * as "nearly done" about a part of someone's life.
         *
         * What survives is the momentum the kernel actually evaluates: a state
         * in one word, and the reasons behind it. Those are real, and they are
         * about activity rather than about completeness.
         */
        summaryBar={{
          note: archived
            ? "This Area is archived. It is hidden from your active Areas and creation pickers and is read-only. Restore it from the Settings tab to make changes."
            : undefined,
          state: <MomentumChip momentum={momentum} />,
          signals: dormant
            ? [{ id: "dormant", text: momentum.summary }]
            : momentum.reasons.map((reason) => ({
                id: `${reason.code}-${reason.count ?? "none"}`,
                text: reason.summary,
              })),
        }}
        activeTabId={activeTabId}
        onTabChange={onTabChange}
        tabs={[
          /*
           * UIX-02 — an Area record opens on an OVERVIEW.
           *
           * It used to open on Goals, so the first thing an owner saw when they
           * opened a part of their life was one of its five sections, chosen
           * because it happened to be first in the list. An Area's question is
           * "what is going on here?", and the answer to that is the shape of
           * the whole thing rather than any one of its children.
           *
           * The tab holds exactly what the Area already knows: the counts its
           * own roll-up carries, and the activity its own feed records. No
           * score, no percentage, no traffic light — every figure here is a
           * count of living things, and each one links to the section that
           * holds them so the overview is a way IN rather than a dead end.
           */
          {
            id: "overview",
            label: "Overview",
            content: (
              <AreaOverviewTab
                rollup={rollup}
                activeProjects={activeProjectTotal}
                openTasks={openTasks}
                onSelectTab={onTabChange}
                activityTab={activityTab}
                habitsSlot={habitsSlot}
              />
            ),
          },
          {
            id: "goals",
            label: "Goals",
            badge: rollup.goals.total,
            content:
              (
                /*
                 * RECORD-01 — the toolbar is unconditional, so "New Goal" is in
                 * the SAME place whether the Area has Goals or not, and the empty
                 * state no longer has to carry its own copy of the action. That
                 * removes the duplicate button and lets the absence be one line.
                 *
                 * The local action stays (rather than deferring to the global +)
                 * because it passes the route-param test: the Drawer form already
                 * receives this Area's id, so a Goal created here needs no picker.
                 */
                <>
                  <h2 className="dh-visually-hidden">Goals</h2>
                  {archived ? null : (
                    <div className="dh-record-toolbar">
                      <DrawerTrigger
                        drawerKey={NEW_GOAL_KEY}
                        className="dh-btn dh-btn--ghost"
                      >
                        New Goal
                      </DrawerTrigger>
                    </div>
                  )}
                  {goals.length === 0 ? (
                    <EmptyState
                      size="inline"
                      headingLevel={3}
                      title={
                        archived
                          ? "No Goals in this Area. Restore it to add one."
                          : "No Goals in this Area yet."
                      }
                    />
                  ) : (
                    <>
                      {/*
                       * STEER-03 — the SAME row `/goals` draws, from the same
                       * shared story. Not a card that resembles it: the same
                       * component, so there is nothing here that can drift.
                       *
                       * `showAlignment` is true because this surface has no
                       * detail pane beside it — on `/goals`, REDESIGN-04 §6.2
                       * put ADR-040's indicator on the pane and left the row's
                       * accessible name to carry it. Where the indicator is
                       * DRAWN is a per-surface density decision; the VALUE is
                       * the same one, which is what the parity attributes on
                       * every row prove.
                       */}
                      <ProgressRowList
                        label="Area Goals"
                        data-testid="area-goals-list"
                      >
                        {goals.map((goal) => (
                          <GoalStoryRow
                            key={goal.id}
                            data-testid="area-goal-row"
                            story={areaGoalStory(goal)}
                            identity={goalIdentitySource({
                              own: goal.story
                                ? {
                                    iconKey: goal.story.iconKey,
                                    colourSlot: goal.story.colourSlot,
                                  }
                                : null,
                              area: {
                                iconKey: overview.iconKey,
                                colourSlot: overview.colourSlot,
                                colourRank: overview.colourRank,
                              },
                            })}
                            href={`/goals/${encodeURIComponent(goal.id)}`}
                            notes={[
                              areaGoalStructureNote(goal),
                              areaGoalTargetNote(goal),
                            ]}
                            showAlignment
                          />
                        ))}
                      </ProgressRowList>
                      <BoundedNote kind="Goals" nextCursor={goalsNextCursor} />
                    </>
                  )}
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
                  size="inline"
                  headingLevel={3}
                  title="No Projects in this Area yet."
                  description="Direct Projects, and Projects advancing this Area’s Goals, appear here."
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
