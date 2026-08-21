/**
 * X-02 — the `/views` control groups, in the owner's words.
 *
 * DalyHub is a personal productivity application, not a query console. What the
 * owner sees is "Show · Tasks + Projects", "Where · Area is Health", "And · Needs
 * attention" — plain sentences built from the SHARED control model every other
 * DalyHub collection already uses (`~/shared/collection-layout`). The declarative,
 * typed configuration underneath is never exposed as `field + operator + value`.
 *
 * Only groups whose dimension the CURRENT scope selection can actually answer are
 * offered, so the sheet never presents a filter that would silently remove the very
 * records the owner selected.
 */

import { GOAL_ALIGNMENT_STATES } from "~/kernel/alignment";
import { PROJECT_HEALTH_STATES } from "~/kernel/project-health";
import { REVIEW_TYPES } from "~/kernel/reviews";
import {
  SHARED_DIMENSION_SUPPORT,
  type CrossViewConfig,
  type ViewScope,
} from "~/kernel/views";
import type { CollectionControlGroup } from "~/shared/collection-layout";

import { TASK_PRIORITY_OPTIONS } from "~/shared/task-record/priority-options";

import { VIEWS_PARAMS } from "./views-url-state";

const HEALTH_LABELS: Record<string, string> = {
  on_track: "On track",
  stale: "No recent movement",
  blocked: "Blocked",
  at_risk: "At risk",
  completed: "Completed",
};

const ALIGNMENT_LABELS: Record<string, string> = {
  completed: "Completed",
  no_structure: "No Projects yet",
  unreachable: "Nothing moving",
  active: "Moving",
  neglected: "Neglected",
};

const REVIEW_TYPE_LABELS: Record<string, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
  custom: "Custom",
};

function supports(
  scopes: readonly ViewScope[],
  dimension: keyof typeof SHARED_DIMENSION_SUPPORT,
): boolean {
  const support = SHARED_DIMENSION_SUPPORT[dimension];
  return scopes.some((scope) => support.includes(scope));
}

/**
 * The control groups for the current configuration. Each is a single-select group
 * bound to one URL parameter, exactly like every other DalyHub collection's.
 */
export function viewsControlGroups(
  config: CrossViewConfig,
): readonly CollectionControlGroup[] {
  const scopes = config.scopes;
  const groups: CollectionControlGroup[] = [];

  if (supports(scopes, "attention")) {
    groups.push({
      id: "attention",
      label: "Needs attention",
      param: VIEWS_PARAMS.attention,
      options: [
        { value: "", label: "Everything" },
        {
          value: "1",
          label: "Only what needs attention",
          description:
            "Overdue and waiting work, at-risk Projects, off-track Goals, Meetings with open actions, Reviews still to finish.",
        },
      ],
    });
  }

  if (supports(scopes, "state")) {
    groups.push({
      id: "state",
      label: "State",
      param: VIEWS_PARAMS.state,
      options: [
        { value: "", label: "Any" },
        { value: "open", label: "Still open" },
        { value: "closed", label: "Finished" },
      ],
    });
  }

  if (supports(scopes, "dueWithin")) {
    groups.push({
      id: "due",
      label: "Due",
      param: VIEWS_PARAMS.due,
      options: [
        { value: "", label: "Any time" },
        { value: "overdue", label: "Overdue" },
        { value: "today", label: "Today" },
        { value: "this_week", label: "This week" },
        { value: "next_7_days", label: "Next 7 days" },
      ],
    });
  }

  groups.push({
    id: "updated",
    label: "Changed",
    param: VIEWS_PARAMS.updated,
    options: [
      { value: "", label: "Any time" },
      { value: "today", label: "Today" },
      { value: "this_week", label: "This week" },
      { value: "last_7_days", label: "Last 7 days" },
      { value: "last_30_days", label: "Last 30 days" },
    ],
  });

  groups.push({
    id: "changed-since",
    label: "Since my last Review",
    param: VIEWS_PARAMS.changed,
    options: [
      { value: "", label: "No Review boundary" },
      {
        value: "last_review",
        label: "Changed since my last Review",
        description:
          "Uses the period your most recent completed Review closed, from that Review's own record.",
      },
    ],
  });

  groups.push({
    id: "archived",
    label: "Archived records",
    param: VIEWS_PARAMS.archived,
    options: [
      { value: "", label: "Hide archived" },
      { value: "include", label: "Include archived" },
      { value: "only", label: "Only archived" },
    ],
  });

  if (scopes.includes("task")) {
    groups.push({
      id: "task-priority",
      label: "Task priority",
      param: VIEWS_PARAMS.taskPriority,
      /*
       * DHDS-09 — the CANONICAL priority vocabulary.
       *
       * This list said `P1`/`P2`/`P3`/`P4` while `/tasks`, the Task row, the
       * Task record, Quick Capture and the bulk bar all said `Priority 1`…
       * `Priority 4`. A code where the rest of the product uses a name is
       * exactly the drift §10 of the DHDS-09 brief rules out: the same four
       * choices must read the same way in every picker that offers them.
       *
       * The applied CHIP still prints the short tag, because a chip already
       * says "Priority:" and "Priority: Priority 1" reads twice.
       */
      options: [
        { value: "", label: "Any" },
        ...TASK_PRIORITY_OPTIONS.map(({ value, label, tag }) => ({
          value,
          label,
          chipLabel: tag,
          mark: { kind: "priority" as const, value },
        })),
        { value: "__none", label: "Not triaged" },
      ],
    });
    groups.push({
      id: "task-waiting",
      label: "Waiting Tasks",
      param: VIEWS_PARAMS.taskWaiting,
      options: [
        { value: "", label: "Any Task" },
        { value: "1", label: "Only what I am waiting on" },
      ],
    });
  }

  if (scopes.includes("project")) {
    groups.push({
      id: "project-health",
      label: "Project health",
      param: VIEWS_PARAMS.projectHealth,
      options: [
        { value: "", label: "Any" },
        ...PROJECT_HEALTH_STATES.map((state) => ({
          value: state,
          label: HEALTH_LABELS[state] ?? state,
        })),
      ],
    });
    groups.push({
      id: "project-moved",
      label: "Project health movement",
      param: VIEWS_PARAMS.projectMoved,
      options: [
        { value: "", label: "Any" },
        {
          value: "1",
          label: "Moved since my last Review",
          description:
            "Compares today's health with the health your last completed Review recorded.",
        },
      ],
    });
  }

  if (scopes.includes("goal")) {
    groups.push({
      id: "goal-alignment",
      label: "Goal alignment",
      param: VIEWS_PARAMS.goalAlignment,
      options: [
        { value: "", label: "Any" },
        ...GOAL_ALIGNMENT_STATES.map((state) => ({
          value: state,
          label: ALIGNMENT_LABELS[state] ?? state,
        })),
      ],
    });
  }

  if (scopes.includes("meeting")) {
    groups.push({
      id: "meeting-when",
      label: "Meetings",
      param: VIEWS_PARAMS.meetingWhen,
      options: [
        { value: "", label: "Any" },
        { value: "upcoming", label: "Upcoming" },
        { value: "past", label: "Already held" },
      ],
    });
  }

  if (scopes.includes("review")) {
    groups.push({
      id: "review-type",
      label: "Review type",
      param: VIEWS_PARAMS.reviewType,
      options: [
        { value: "", label: "Any" },
        ...REVIEW_TYPES.map((type) => ({
          value: type,
          label: REVIEW_TYPE_LABELS[type] ?? type,
        })),
      ],
    });
  }

  groups.push({
    id: "sort",
    label: "Sort by",
    param: VIEWS_PARAMS.sort,
    kind: "sort",
    options: [
      { value: "", label: "Last changed" },
      { value: "due", label: "Due date" },
      { value: "created", label: "Created" },
      { value: "title", label: "Title" },
    ],
  });

  groups.push({
    id: "direction",
    label: "Order",
    param: VIEWS_PARAMS.direction,
    kind: "sort",
    options: [
      { value: "", label: "Newest first" },
      { value: "asc", label: "Oldest first" },
    ],
  });

  groups.push({
    id: "group",
    label: "Group by",
    param: VIEWS_PARAMS.group,
    kind: "group",
    options: [
      { value: "", label: "Record type" },
      { value: "none", label: "No grouping" },
    ],
  });

  return groups;
}

/** Every parameter the sheet manages, cleared together on Reset. */
export function viewsResetParams(): readonly string[] {
  return [
    VIEWS_PARAMS.view,
    VIEWS_PARAMS.area,
    VIEWS_PARAMS.goal,
    VIEWS_PARAMS.project,
    VIEWS_PARAMS.linked,
    VIEWS_PARAMS.created,
    VIEWS_PARAMS.taskSector,
    VIEWS_PARAMS.taskStatus,
    VIEWS_PARAMS.taskDelegated,
    VIEWS_PARAMS.taskSomeday,
    VIEWS_PARAMS.projectStatus,
    VIEWS_PARAMS.noteTag,
    VIEWS_PARAMS.meetingStatus,
    VIEWS_PARAMS.reviewStatus,
  ];
}
