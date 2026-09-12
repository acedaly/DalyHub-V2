/**
 * The Area record — a working space for one standing part of a life.
 *
 * ── UNTITLED-05 (the current design) ────────────────────────────────────────
 *
 * The record's question is "how is this Area going, and what currently matters
 * inside it?". Before this pass the Overview answered it with three counts —
 * every one of which the tab strip immediately above already carried as a badge
 * — and then an activity feed:
 *
 *     ┌──────────────────────────────────────────────────────────────┐
 *     │ ● Needs attention                                            │
 *     │ 1 active project is at risk. · 2 completed projects kept …   │
 *     ├─ Overview ─ Goals 2 ─ Projects 17 ─ Linked ─ Activity ─ … ───┤
 *     │  2              9                 44                         │
 *     │  open Goals     active Projects   open tasks in this Area    │
 *     │  View Goals     View Projects                                │
 *     │                                                              │
 *     │  Recent activity …                                           │
 *     └──────────────────────────────────────────────────────────────┘
 *
 * So the band said "1 active project is at risk" and the tab beneath it would
 * not say WHICH — the one question an owner opens an Area to answer was three
 * clicks and seventeen rows away, and the space in between was spent restating
 * the tab badges as large figures. That is the "six meaningless stat widgets"
 * the brief warns about, arrived at from the opposite direction: not too many
 * tiles, but tiles where the records themselves belonged.
 *
 * The Overview is now the Area's STEWARDSHIP view, from facts the route already
 * loads — no new read, no new derivation:
 *
 *   1. **Active work.** The Projects genuinely being worked, attention FIRST,
 *    so the Project the summary band is talking about is the first row on the
 *    page. Five of them, then a door to the rest.
 *   2. **Goals.** The same shared `GoalStoryRow` `/goals` draws, three of them,
 *    then a door.
 *   3. **Habits**, as context. A Habit is not a Goal, a Project or a Task and
 *    is counted in none of the Area's figures.
 *   4. **Recent activity**, the same feed the Activity tab renders.
 *
 * The counts did not vanish; they moved to where they were already stated. The
 * tab strip carries the Goals and Projects totals as badges, and the summary
 * band carries the momentum and its reasons. What the Overview adds is the
 * records.
 *
 * ── What must not change ────────────────────────────────────────────────────
 *
 *   - **No completion meter, anywhere on this record.** An Area never completes
 *     (AGENTS.md §4), and its task roll-up spans every Project under it, so a
 *     percentage would move when an unrelated Project finished something and a
 *     mature Area would sit near 100% for ever — reading as "nearly done" about
 *     a part of someone's life.
 *   - **No second Project design.** Projects inside an Area are drawn by the
 *     shared `ProjectSummaryList`, whose column vocabulary is the one
 *     `/projects?present=table` uses.
 *   - **No second Goal measure.** Goals are the shared `GoalStoryRow` from the
 *     shared story (STEER-03/DEBT-206).
 *   - **Momentum is stated once**, in the summary band, from the kernel
 *     evaluator's complete boundary.
 */

import type { ReactNode } from "react";

import { ProgressRowList } from "~/shared/card";
import { DrawerTrigger } from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import { AccentIcon } from "~/shared/entity";
import { ProjectSummaryList } from "~/shared/project-list";
import type { ProjectSummaryItem } from "~/shared/project-list";
import { healthReasonText } from "~/shared/project-health";
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
import { SectionLabel } from "~/shared/ui/untitled/application/section-headers/section-label";
import { ButtonLink } from "~/shared/ui";
import { buttonClassName } from "~/shared/ui";
import type { AreaMomentum } from "~/kernel/areas";

import {
  areaStateLabel,
  projectStateLabel,
  type SerializedAreaGoalItem,
  type SerializedAreaOverview,
  type SerializedAreaProjectItem,
  type SerializedAreaRollup,
} from "./area-view";

/** The Drawer key that opens the AREA-02 "New Goal" create form. */
export const NEW_GOAL_KEY = "new-goal";

/** How many records the Overview shows before handing over to a section. */
const OVERVIEW_PROJECT_LIMIT = 5;
const OVERVIEW_GOAL_LIMIT = 3;

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
 * A section head inside a record tab: the Untitled `section-headers` label,
 * with the section's one door opposite it.
 *
 * `SectionLabel.Root` is the genuine vendored component, so the heading rung,
 * the description rung and the token colours are Untitled's rather than a
 * fourth hand-written heading style. Its heading is an `h3`, which is the right
 * level under a tab panel's own `h2`.
 */
function AreaSection({
  title,
  description,
  action,
  children,
  ...rest
}: {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly "data-testid"?: string;
}) {
  return (
    <section
      className="flex min-w-0 flex-col gap-3"
      aria-label={title}
      data-testid={rest["data-testid"]}
    >
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <SectionLabel.Root
          className="min-w-0"
          title={title}
          description={description}
          data-untitled-source="application/section-headers:section-label"
        />
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Untitled's bounded panel, for an Overview section whose content does not
 * bring its own surface.
 *
 * `rounded-xl bg-primary shadow-xs ring-1 ring-secondary` is the boundary
 * `application/table`'s `TableCard.Root` declares and that every Untitled
 * Application UI panel uses — the SAME one `RecordTabs` draws around a
 * `surface="panel"` tab, so a section that supplies its own and a tab that
 * supplies one are visibly the same object.
 *
 * The Overview's own tab is `surface="plain"` precisely so these can exist:
 * three sections inside one panel would be a frame inside a frame, and a run of
 * bordered sections is what lets the eye find the seam between the Area's work,
 * its Goals and its history.
 */
function AreaPanel({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={[
        "min-w-0 overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-untitled-source="application/table:table-card"
    >
      {children}
    </div>
  );
}

/**
 * STEER-03 (DEBT-206) — an Area's Goal, told through the SHARED Goal story.
 *
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
 * AREA-02's target date, kept. Only shown when SET, so an Area whose Goals carry
 * no target dates never reads a column of "No target date" — an ordinary
 * absence must not be drawn as a problem.
 */
function areaGoalTargetNote(goal: SerializedAreaGoalItem): string | null {
  if (!goal.targetDate) return null;
  const formatted = formatCalendarDate(goal.targetDate);
  return formatted ? `Target ${formatted}` : null;
}

/**
 * The story a Goal with no readable story still tells.
 *
 * The story read is its own failure domain (see the Area loader), so a Goal can
 * arrive without one. It keeps its identity, its title and its structure; what
 * it loses is the derived facts, and it says so by showing none of them rather
 * than by showing zeros.
 */
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

/**
 * One Area Project, as the SHARED summary row needs it.
 *
 * Every value is already derived by the loader or by the shared evaluators; the
 * row computes nothing, so a Project cannot read one way here and another on
 * `/projects`.
 *
 * `signal` is drawn only where `healthVisible` says the shared rule considers
 * this Project actively worked. A Planned, on-hold, completed or archived
 * Project has no health to report and says nothing rather than "On track",
 * which would be a judgement the evaluator did not make.
 */
function toProjectSummary(
  project: SerializedAreaProjectItem,
): ProjectSummaryItem {
  const hasTasks = project.taskTotal > 0;
  const percent = hasTasks
    ? Math.round((project.taskCompleted / project.taskTotal) * 100)
    : 0;
  const primaryReason = project.health.reasons[0];
  return {
    id: project.id,
    title: project.title,
    status: projectStateLabel(project),
    progress: hasTasks
      ? {
          percent,
          summary: `${project.taskCompleted} of ${project.taskTotal} ${
            project.taskTotal === 1 ? "task" : "tasks"
          }`,
          // The bar takes the HEALTH tone, never the identity hue, so a card
          // can never draw a calm bar over the words "3 overdue" (POLISH-01).
          tone: project.healthVisible
            ? meterToneFromHealth(project.health.tone)
            : "neutral",
        }
      : null,
    signal: project.healthVisible
      ? {
          label: project.health.label,
          tone: project.health.tone,
          /*
           * The reason, only when it SAYS something the badge does not. A
           * Project with no tasks reports the state "No tasks yet" and the
           * reason "No tasks yet", and printing both is the label ladder twice
           * in one cell — the same guard `HealthIndicator` has always applied.
           */
          detail:
            primaryReason &&
            healthReasonText(primaryReason) !== project.health.label
              ? healthReasonText(primaryReason)
              : null,
        }
      : null,
    iconKey: project.iconKey,
    colourSlot: project.colourSlot,
    colourRank: project.colourRank,
    context:
      project.parent.kind === "goal"
        ? {
            label: `Goal: ${project.parent.goal.title}`,
            href: `/goals/${encodeURIComponent(project.parent.goal.id)}`,
          }
        : { label: "Directly in this Area" },
    muted: project.archivedAt !== null,
  };
}

/** The health evaluator's tone, in the shared Untitled bar's tone vocabulary. */
function meterToneFromHealth(
  tone: SerializedAreaProjectItem["health"]["tone"],
): "neutral" | "positive" | "caution" | "critical" {
  switch (tone) {
    case "success":
      return "positive";
    case "warning":
      return "caution";
    case "danger":
      return "critical";
    default:
      return "neutral";
  }
}

/**
 * How loudly a Project is asking for the owner, as a sort key — highest first.
 *
 * The summary band says "1 active project is at risk"; this is what puts that
 * Project at the top of the page rather than seventeen rows into a tab. It is a
 * presentation ORDER over facts the evaluator already decided, never a second
 * judgement: the states and their severity are `ProjectHealthState`'s, and a
 * Project with no visible health sorts last because it has nothing to report.
 */
const ATTENTION_RANK: Record<string, number> = {
  at_risk: 4,
  blocked: 3,
  stale: 2,
  on_track: 1,
};

function attentionRank(project: SerializedAreaProjectItem): number {
  if (!project.healthVisible) return 0;
  return ATTENTION_RANK[project.health.state] ?? 0;
}

/**
 * The Area's ACTIVE Projects, attention first.
 *
 * "Active" is the shared `isProjectHealthVisible` rule the loader already
 * applied (`healthVisible`), which is the same rule every other surface uses to
 * decide whether a Project is genuinely being worked — so this list and the
 * momentum band above it can never disagree about what "active" means.
 *
 * The relative order of two Projects with the same standing is the loader's,
 * which is the repository's own ordering: a sort must not shuffle records that
 * have nothing to choose between them.
 */
export function activeAreaProjects(
  projects: readonly SerializedAreaProjectItem[],
): readonly SerializedAreaProjectItem[] {
  return projects
    .filter((project) => project.healthVisible)
    .map((project, index) => ({ project, index }))
    .sort(
      (a, b) =>
        attentionRank(b.project) - attentionRank(a.project) ||
        a.index - b.index,
    )
    .map((entry) => entry.project);
}

/**
 * The Area Overview tab — what is going on in this part of life.
 *
 * Everything here is drawn from the record's OWN loader payload. The bounded
 * page it draws from is stated honestly wherever the complete total is larger:
 * a record never presents a bounded page as a total.
 */
function AreaOverviewTab({
  goals,
  projects,
  activeProjectTotal,
  goalTotal,
  onSelectTab,
  activityTab,
  habitsSlot,
  overview,
  archived,
}: {
  readonly goals: readonly SerializedAreaGoalItem[];
  readonly projects: readonly SerializedAreaProjectItem[];
  /**
   * The COMPLETE count of actively-worked Projects, from the loader.
   *
   * Not derived from the displayed page: that page is bounded at 50, so an Area
   * running more than that would undercount here while the tab badge beside it
   * showed the true total.
   */
  readonly activeProjectTotal: number;
  /** The Area's COMPLETE Goal total, from its roll-up. */
  readonly goalTotal: number;
  readonly onSelectTab?: (tabId: string) => void;
  readonly activityTab: ReactNode;
  /**
   * HABITS-01 — the behaviours the owner practises in this part of life.
   *
   * A SLOT, so the Areas module stays unaware of what a Habit is. It sits after
   * the work and before the activity feed, because it is current context
   * ("these are the routines that live here") rather than history — and it is
   * deliberately not counted in any of the Area's figures: a Habit is not a
   * Goal, a Project or a Task, and folding it into one of those would be the
   * exact conflation this module exists to prevent.
   */
  readonly habitsSlot?: ReactNode;
  readonly overview: SerializedAreaOverview;
  readonly archived: boolean;
}) {
  const active = activeAreaProjects(projects);
  const shown = active.slice(0, OVERVIEW_PROJECT_LIMIT);
  const openGoals = goals.filter((goal) => goal.completedAt === null);
  const shownGoals = openGoals.slice(0, OVERVIEW_GOAL_LIMIT);
  /*
   * The empty state is decided by what is genuinely RUNNING, not by the
   * roll-up's historical totals. An Area whose Goals are all met and whose
   * Projects are all finished has non-zero totals, so keying off those would
   * render two headings over two absences — which is the "an absence is never
   * drawn as a state" rule broken by the surface that cites it.
   */
  const empty = shown.length === 0 && openGoals.length === 0;

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <h2 className="dh-visually-hidden">Overview</h2>

      {empty ? (
        /*
         * A quiet Area gets one sentence and one door, not two empty sections.
         * The door is the thing that stops it being a dead end (AGENTS.md §6),
         * and it is absent on an archived Area because creating inside one is
         * refused server-side — a control that can only fail is worse than no
         * control at all.
         */
        <EmptyState
          size="inline"
          headingLevel={3}
          title="Nothing running in this Area yet."
          description="Give it a Goal to aim at, or a Project to move — whatever you file here will show up in this overview."
          primaryAction={
            archived ? undefined : (
              <DrawerTrigger
                drawerKey={NEW_GOAL_KEY}
                className={buttonClassName({ variant: "primary" })}
              >
                New Goal
              </DrawerTrigger>
            )
          }
        />
      ) : null}

      {shown.length > 0 ? (
        <AreaSection
          title="Active work"
          description={
            /*
             * The section states its own bound. "5 of 9" is the honest reading
             * of a capped list, and the door beside it goes to all of them.
             */
            activeProjectTotal > shown.length
              ? `${shown.length} of ${activeProjectTotal} active Projects, the ones asking for you first.`
              : "The Projects being worked in this Area."
          }
          action={
            activeProjectTotal > shown.length ? (
              <ButtonLink
                href={`/areas/${encodeURIComponent(overview.id)}?tab=projects`}
                variant="subtle"
                size="sm"
                onClick={(event) => {
                  /*
                   * A real link — deep-linkable, middle-clickable and correct
                   * with no JavaScript — that ALSO moves the record's own tab
                   * state in place when it is followed normally, so the page
                   * does not scroll back to the top of a re-rendered record.
                   */
                  if (
                    onSelectTab &&
                    !event.metaKey &&
                    !event.ctrlKey &&
                    !event.shiftKey &&
                    event.button === 0
                  ) {
                    event.preventDefault();
                    onSelectTab("projects");
                  }
                }}
              >
                View all {activeProjectTotal}
              </ButtonLink>
            ) : undefined
          }
          data-testid="area-active-work"
        >
          <ProjectSummaryList
            projects={shown.map(toProjectSummary)}
            label="The Projects being actively worked in this Area, with their status, progress and health signal."
            showSignal
            showContext
            contextLabel="Sits under"
            data-testid="area-overview-projects"
          />
        </AreaSection>
      ) : null}

      {shownGoals.length > 0 ? (
        <AreaSection
          title="Goals"
          description={
            openGoals.length > shownGoals.length
              ? `${shownGoals.length} of ${openGoals.length} open Goals.`
              : "What this Area is aiming at."
          }
          action={
            goalTotal > shownGoals.length ? (
              <ButtonLink
                href={`/areas/${encodeURIComponent(overview.id)}?tab=goals`}
                variant="subtle"
                size="sm"
                onClick={(event) => {
                  if (
                    onSelectTab &&
                    !event.metaKey &&
                    !event.ctrlKey &&
                    !event.shiftKey &&
                    event.button === 0
                  ) {
                    event.preventDefault();
                    onSelectTab("goals");
                  }
                }}
              >
                View all {goalTotal}
              </ButtonLink>
            ) : undefined
          }
          data-testid="area-overview-goals"
        >
          <AreaPanel>
            <AreaGoalRows goals={shownGoals} overview={overview} />
          </AreaPanel>
        </AreaSection>
      ) : null}

      {habitsSlot}

      {/*
       * The activity feed itself, not a second copy of it: the same component
       * the Activity tab renders. An Area's recent events are among the most
       * useful things an overview can carry, and rendering them here rather
       * than summarising them means there is one implementation to keep honest.
       */}
      <AreaSection
        title="Recent activity"
        description="What has happened in this part of life lately."
      >
        <AreaPanel className="p-2">{activityTab}</AreaPanel>
      </AreaSection>
    </div>
  );
}

/**
 * The Area's Goals, as the SHARED `GoalStoryRow`.
 *
 * Not a card that resembles the one `/goals` draws: the same component from the
 * same shared story, so there is nothing here that can drift. `showAlignment`
 * is true because this surface has no detail pane beside it — on `/goals`,
 * REDESIGN-04 §6.2 put ADR-040's indicator on the pane and left the row's
 * accessible name to carry it. Where the indicator is DRAWN is a per-surface
 * density decision; the VALUE is the same one.
 */
function AreaGoalRows({
  goals,
  overview,
}: {
  readonly goals: readonly SerializedAreaGoalItem[];
  readonly overview: SerializedAreaOverview;
}) {
  return (
    <ProgressRowList label="Area Goals" data-testid="area-goals-list">
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
          notes={[areaGoalStructureNote(goal), areaGoalTargetNote(goal)]}
          showAlignment
        />
      ))}
    </ProgressRowList>
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
    <p className="m-0 text-sm text-tertiary" role="note">
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
  /*
   * The quiet Area. An Area with nothing active does not need a momentum chip
   * and a reason list — the audit found the same absence stated four times on
   * one screen. It gets one sentence.
   */
  const dormant = momentum.state === "empty";

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
         * that Area had no identity.
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
         * fact about Areas rather than about this Area. What remains is
         * "Archived", which is genuinely exceptional and the one state that
         * changes what the owner can do here.
         */
        status={archived ? { label: state.label, tone: state.tone } : undefined}
        overflowActions={lifecycle.overflowActions}
        /*
         * UIX-02 — the Area's band carries NO progress meter.
         *
         * It used to open with "Tasks — 3 of 6 tasks complete" over a full-width
         * bar: a COMPLETION PROPORTION, on the one entity in the spine that by
         * definition never completes (AGENTS.md §4). It was also, quietly, a
         * fabricated figure — an Area's task roll-up spans every Project under
         * it, so it moved whenever an unrelated Project finished something and a
         * mature Area would sit near 100% for ever.
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
           * An Area's question is "what is going on here?", and the answer to
           * that is the shape of the whole thing rather than any one of its
           * sections. UNTITLED-05 makes the answer the RECORDS rather than a
           * restatement of the tab badges above it.
           */
          {
            id: "overview",
            label: "Overview",
            /*
             * The Overview brings its OWN surfaces — a bordered panel per
             * section — so the tab must not draw a second one around them. See
             * `RecordTab.surface`: it is a property of the content.
             */
            surface: "plain" as const,
            content: (
              <AreaOverviewTab
                goals={goals}
                projects={projects}
                activeProjectTotal={activeProjectTotal}
                goalTotal={rollup.goals.total}
                onSelectTab={onTabChange}
                activityTab={activityTab}
                habitsSlot={habitsSlot}
                overview={overview}
                archived={archived}
              />
            ),
          },
          {
            id: "goals",
            label: "Goals",
            badge: rollup.goals.total,
            // The Goal rows sit in their own bounded panel, exactly as they do
            // on the Overview, so the two readings of the same records are one
            // object rather than two.
            surface: "plain" as const,
            content:
              (
                /*
                 * RECORD-01 — the toolbar is unconditional, so "New Goal" is in
                 * the SAME place whether the Area has Goals or not, and the empty
                 * state no longer has to carry its own copy of the action.
                 *
                 * The local action stays (rather than deferring to the global +)
                 * because it passes the route-param test: the Drawer form already
                 * receives this Area's id, so a Goal created here needs no picker.
                 */
                <div className="flex min-w-0 flex-col gap-4">
                  <h2 className="dh-visually-hidden">Goals</h2>
                  {archived ? null : (
                    <div className="dh-record-toolbar">
                      <DrawerTrigger
                        drawerKey={NEW_GOAL_KEY}
                        className={buttonClassName({ variant: "subtle" })}
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
                      <AreaPanel>
                        <AreaGoalRows goals={goals} overview={overview} />
                      </AreaPanel>
                      <BoundedNote kind="Goals" nextCursor={goalsNextCursor} />
                    </>
                  )}
                </div>
              ),
          },
          {
            id: "projects",
            label: "Projects",
            badge: rollup.projects.total,
            // The shared `ProjectSummaryList` IS a bounded Untitled table card.
            surface: "plain" as const,
            content:
              projects.length === 0 ? (
                <EmptyState
                  size="inline"
                  headingLevel={3}
                  title="No Projects in this Area yet."
                  description="Direct Projects, and Projects advancing this Area’s Goals, appear here."
                />
              ) : (
                <div className="flex min-w-0 flex-col gap-4">
                  <h2 className="dh-visually-hidden">Projects</h2>
                  {/*
                   * UNTITLED-05 — the SHARED Project summary table, whose
                   * column vocabulary is the one `/projects?present=table`
                   * uses. Not a second Project design inside Areas: the same
                   * component, so a Project looks like a Project wherever it is
                   * reached from.
                   *
                   * Attention leads here too, for the same reason it does on
                   * the Overview: the summary band names a count of Projects
                   * needing the owner, and the tab it points at should not bury
                   * them behind fourteen Planned ones.
                   */}
                  <ProjectSummaryList
                    projects={orderedAreaProjects(projects).map(
                      toProjectSummary,
                    )}
                    label="Projects in this Area — those directly under it and those advancing its Goals — with status, progress, health signal and what each sits under."
                    showSignal
                    showContext
                    contextLabel="Sits under"
                    data-testid="area-projects-table"
                  />
                  <BoundedNote
                    kind="Projects"
                    nextCursor={projectsNextCursor}
                  />
                </div>
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

/**
 * Every Project in the Area, with the ones asking for the owner first and the
 * finished ones last.
 *
 * The Projects tab used to render the loader's order directly, which interleaved
 * two completed and one archived Project among the fourteen live ones and put
 * the single at-risk Project fifth. This is a presentation ORDER over facts the
 * evaluator and the lifecycle already decided — never a second judgement — and
 * records with nothing to choose between them keep the loader's order.
 */
export function orderedAreaProjects(
  projects: readonly SerializedAreaProjectItem[],
): readonly SerializedAreaProjectItem[] {
  return projects
    .map((project, index) => ({ project, index }))
    .sort(
      (a, b) =>
        lifecycleRank(a.project) - lifecycleRank(b.project) ||
        attentionRank(b.project) - attentionRank(a.project) ||
        a.index - b.index,
    )
    .map((entry) => entry.project);
}

/** Live Projects, then finished ones, then archived. Lowest sorts first. */
function lifecycleRank(project: SerializedAreaProjectItem): number {
  if (project.archivedAt !== null) return 2;
  if (project.completedAt !== null) return 1;
  return 0;
}
