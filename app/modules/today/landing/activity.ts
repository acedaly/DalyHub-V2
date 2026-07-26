/**
 * TODAY-08 — the pure model for Today's workspace-wide Recent Activity widget.
 *
 * The widget renders the ONE shared DS-05 Activity Feed over the SINGLE FND-05
 * Activity stream (`activity.listForWorkspace(…)`) — it is the first product
 * consumer of the workspace-wide feed. It invents no second history model.
 *
 * Because a workspace feed spans every module's events, this file assembles ONE
 * descriptor map that gives calm labels to the cross-module event types. It imports
 * only the KERNEL activity-type CONSTANTS (`~/kernel/*` — shared, not modules) and
 * the shared activity model, so Today never reaches into another module's internals
 * (the module import boundary holds); every type without a specialised label falls
 * through to the shared safe generic fallback, never a raw payload dump.
 */

import {
  GOAL_COMPLETED,
  GOAL_REOPENED,
  PROJECT_COMPLETED,
  PROJECT_REOPENED,
  TASK_COMPLETED,
  TASK_REOPENED,
} from "~/kernel/spine";
import {
  TASK_PLANNED,
  TASK_PLAN_CLEARED,
  TASK_RESCHEDULED,
  TASK_WAITING_CHANGED,
  TASK_WAITING_CLEARED,
  TASK_WAITING_STARTED,
} from "~/kernel/tasks";
import { NOTE_CONTENT_UPDATED } from "~/kernel/notes";
import { GOAL_DETAILS_UPDATED } from "~/kernel/goals";
import {
  PROJECT_ARCHIVED,
  PROJECT_RESTORED,
  PROJECT_STATUS_CHANGED,
} from "~/kernel/project-settings";
import { DIARY_ENTRY_CREATED, DIARY_ENTRY_UPDATED } from "~/kernel/diary";
import {
  createActivityDescriptorMap,
  type ActivityItem,
  type ActivityTypeDescriptor,
} from "~/shared/activity-feed/model";
import type { FilterOption } from "~/shared/filters/model";

/** How many events one page of the Today feed loads. Bounded; the client pages. */
export const TODAY_ACTIVITY_PAGE_SIZE = 30;

/**
 * Calm cross-module descriptors, layered over the seven kernel lifecycle defaults
 * (`entity.created/updated/deleted/restored`, `entity_link.*`). Each sets a plain
 * label, the subject's entity type (for its identity glyph) and a restrained tone;
 * the shared mapper renders the standard `actor · label — subject` line.
 */
export const TODAY_ACTIVITY_DESCRIPTORS: Record<
  string,
  ActivityTypeDescriptor
> = {
  [TASK_COMPLETED]: {
    label: "Completed task",
    entityType: "task",
    tone: "success",
  },
  [TASK_REOPENED]: { label: "Reopened task", entityType: "task" },
  [TASK_PLANNED]: { label: "Planned task", entityType: "task" },
  [TASK_RESCHEDULED]: { label: "Rescheduled task", entityType: "task" },
  [TASK_PLAN_CLEARED]: { label: "Cleared task plan", entityType: "task" },
  [TASK_WAITING_STARTED]: { label: "Started waiting", entityType: "task" },
  [TASK_WAITING_CHANGED]: { label: "Changed waiting", entityType: "task" },
  [TASK_WAITING_CLEARED]: { label: "Cleared waiting", entityType: "task" },
  [PROJECT_COMPLETED]: {
    label: "Completed project",
    entityType: "project",
    tone: "success",
  },
  [PROJECT_REOPENED]: { label: "Reopened project", entityType: "project" },
  [PROJECT_STATUS_CHANGED]: {
    label: "Changed project status",
    entityType: "project",
  },
  [PROJECT_ARCHIVED]: { label: "Archived project", entityType: "project" },
  [PROJECT_RESTORED]: { label: "Restored project", entityType: "project" },
  [GOAL_COMPLETED]: {
    label: "Completed goal",
    entityType: "goal",
    tone: "success",
  },
  [GOAL_REOPENED]: { label: "Reopened goal", entityType: "goal" },
  [GOAL_DETAILS_UPDATED]: { label: "Updated goal", entityType: "goal" },
  [NOTE_CONTENT_UPDATED]: { label: "Updated note", entityType: "note" },
  [DIARY_ENTRY_CREATED]: { label: "Added diary entry", entityType: "diary" },
  [DIARY_ENTRY_UPDATED]: { label: "Edited diary entry", entityType: "diary" },
};

/** The frozen descriptor map the Today feed resolves against (defaults + above). */
export const TODAY_ACTIVITY_DESCRIPTOR_MAP = createActivityDescriptorMap(
  TODAY_ACTIVITY_DESCRIPTORS,
);

/**
 * The "Referenced entity" filter options for the DS-07 FilterBar — filter the feed
 * to the records that matter (tasks, notes, diary, projects, goals, areas). Uses the
 * shared entity vocabulary, no colour-only cues.
 */
export const TODAY_ACTIVITY_ENTITY_OPTIONS: readonly FilterOption[] = [
  { value: "task", label: "Tasks" },
  { value: "project", label: "Projects" },
  { value: "goal", label: "Goals" },
  { value: "area", label: "Areas" },
  { value: "note", label: "Notes" },
  { value: "diary", label: "Diary" },
];

/**
 * A curated "Event type" filter set for the DS-07 FilterBar — the events most worth
 * filtering the feed to. Values are the SAME branded type strings the kernel emits
 * (validated), so the DS-07 enum accessor matches `ActivityItem.type` exactly.
 */
export const TODAY_ACTIVITY_EVENT_OPTIONS: readonly FilterOption[] = [
  { value: "entity.created", label: "Created" },
  { value: "entity.updated", label: "Updated" },
  { value: TASK_COMPLETED, label: "Task completed" },
  { value: TASK_PLANNED, label: "Task planned" },
  { value: PROJECT_COMPLETED, label: "Project completed" },
  { value: GOAL_COMPLETED, label: "Goal completed" },
  { value: NOTE_CONTENT_UPDATED, label: "Note updated" },
  { value: DIARY_ENTRY_CREATED, label: "Diary entry" },
];

/** The JSON-safe shape of an `ActivityItem` (its only `Date` → ISO string). */
export type SerializedTodayActivityItem = Omit<ActivityItem, "occurredAt"> & {
  readonly occurredAt: string;
};

/** One bounded page of the Today feed (the `/today/activity` resource payload). */
export interface TodayActivityPage {
  readonly items: readonly SerializedTodayActivityItem[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}
