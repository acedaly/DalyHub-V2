/**
 * V2.9 INS-04 — the pure model for Insight's "What changed" feed.
 *
 * **Moved here from `today/landing/activity.ts` in the same change that gave it
 * a consumer.** TODAY-08 built this for a Today widget the redesign later
 * removed, leaving a resource route nothing rendered (DEBT-103). It now belongs
 * to the module that asks "what happened over this period?", and the Today
 * route went with the move rather than being left stranded — one owner, no
 * second door onto the same stream.
 *
 * The panel renders the ONE shared DS-05 Activity Feed over the SINGLE FND-05
 * Activity stream, now through `listInWindow` so the events shown are the
 * events inside the window the page is about. It invents no second history
 * model.
 *
 * Because a workspace feed spans EVERY module's events, its descriptors come from
 * the SHARED cross-module set plus the FND-06 module registry
 * (`buildWorkspaceActivityDescriptors`), not from a partial list maintained here.
 * That is what fixed the feed rendering registered-but-undescribed events (a
 * Meeting item conversion, a Person or Asset change) as unrecognised: every type a
 * module declares now has a readable line, and Analytics never imports another
 * module's internals — the registry and the kernel constants are shared surfaces,
 * so the module import boundary holds.
 */

import { DIARY_ENTRY_CREATED } from "~/kernel/diary";
import {
  MEETING_HELD,
  MEETING_ITEM_CONVERTED_TO_TASK,
} from "~/kernel/meetings";
import { NOTE_CONTENT_UPDATED } from "~/kernel/notes";
import { PERSON_UPDATED } from "~/kernel/people";
import {
  GOAL_COMPLETED,
  PROJECT_COMPLETED,
  TASK_COMPLETED,
} from "~/kernel/spine";
import { TASK_PLANNED } from "~/kernel/tasks";
import { discoverModuleRegistry } from "~/modules/discover-modules";
import {
  buildWorkspaceActivityDescriptors,
  type ActivityDescriptorMap,
  type ActivityItem,
} from "~/shared/activity-feed/model";
import type { FilterOption } from "~/shared/filters/model";

/** How many events one page of the feed loads. Bounded; the client pages. */
export const INSIGHT_ACTIVITY_PAGE_SIZE = 30;

/**
 * The descriptor map the feed resolves against, built ONCE per isolate:
 *
 *   kernel lifecycle defaults → every module's declared labels → the shared
 *   curated cross-module set
 *
 * The registry is build-time data, identical for every request and workspace, so
 * it is resolved once rather than per page read.
 */
let cachedDescriptors: ActivityDescriptorMap | null = null;

export function insightActivityDescriptors(): ActivityDescriptorMap {
  cachedDescriptors ??= buildWorkspaceActivityDescriptors(
    discoverModuleRegistry().listActivityTypes(),
  );
  return cachedDescriptors;
}

/**
 * The "Referenced entity" filter options for the DS-07 FilterBar — filter the feed
 * to the records that matter (tasks, notes, diary, projects, goals, areas). Uses the
 * shared entity vocabulary, no colour-only cues.
 */
export const INSIGHT_ACTIVITY_ENTITY_OPTIONS: readonly FilterOption[] = [
  { value: "task", label: "Tasks" },
  { value: "project", label: "Projects" },
  { value: "goal", label: "Goals" },
  { value: "area", label: "Areas" },
  { value: "note", label: "Notes" },
  { value: "diary", label: "Diary" },
  { value: "meeting", label: "Meetings" },
  { value: "person", label: "People" },
  { value: "asset", label: "Assets" },
];

/**
 * A curated "Event type" filter set for the DS-07 FilterBar — the events most worth
 * filtering the feed to. Values are the SAME branded type strings the kernel emits
 * (validated), so the DS-07 enum accessor matches `ActivityItem.type` exactly.
 */
export const INSIGHT_ACTIVITY_EVENT_OPTIONS: readonly FilterOption[] = [
  { value: "entity.created", label: "Created" },
  { value: "entity.updated", label: "Updated" },
  { value: TASK_COMPLETED, label: "Task completed" },
  { value: TASK_PLANNED, label: "Task planned" },
  { value: PROJECT_COMPLETED, label: "Project completed" },
  { value: GOAL_COMPLETED, label: "Goal completed" },
  { value: NOTE_CONTENT_UPDATED, label: "Note updated" },
  { value: DIARY_ENTRY_CREATED, label: "Diary entry" },
  { value: MEETING_HELD, label: "Meeting held" },
  { value: MEETING_ITEM_CONVERTED_TO_TASK, label: "Meeting item converted" },
  { value: PERSON_UPDATED, label: "Person updated" },
];

/** The JSON-safe shape of an `ActivityItem` (its only `Date` → ISO string). */
export type SerializedActivityItem = Omit<ActivityItem, "occurredAt"> & {
  readonly occurredAt: string;
};

/** One bounded page of the feed (the `/analytics/activity` resource payload). */
export interface InsightActivityPage {
  readonly items: readonly SerializedActivityItem[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}
