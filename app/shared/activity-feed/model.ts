/**
 * DS-05 — the React-free model entry point.
 *
 * Mirrors `~/shared/filters/model`: everything re-exported here is pure and imports
 * no React, DOM, D1 or Cloudflare types, so a server-side surface (or a test) can
 * map, group, order, page, window and build filter fields for activity WITHOUT
 * resolving any React or UI code. An import-guard test enforces the boundary.
 *
 * The React components and hooks live in the sibling files and are exported from
 * `~/shared/activity-feed` (the UI barrel) — never from here.
 */

export type {
  ActivityBaseItem,
  ActivityDateFormatter,
  ActivityDayGroup,
  ActivityDescriptionSegment,
  ActivityDescriptorContext,
  ActivityDescriptorMap,
  ActivityItem,
  ActivityItemActor,
  ActivityItemMetadatum,
  ActivityItemPresentation,
  ActivityItemSubject,
  ActivityMapOptions,
  ActivityPageLoader,
  ActivityRow,
  ActivityStreamPage,
  ActivityTone,
  ActivityTypeDescriptor,
  ActorLabelResolver,
  EntityResolver,
  ResolvedEntity,
} from "./types";

export {
  createActivityDateFormatter,
  defaultActivityDateFormatter,
  utcDayKey,
  type ActivityDateFormatterOptions,
} from "./activity-dates";

export {
  DEFAULT_ACTIVITY_DESCRIPTORS,
  buildFallbackPresentation,
  createActivityDescriptorMap,
  humanizeActivityType,
  resolveActivityDescriptor,
  summarizeActivityPayload,
  type ResolvedActivityDescriptor,
} from "./activity-type-registry";

export { toActivityItem, toActivityItems } from "./activity-item-model";

export {
  buildActivityRows,
  compareActivityItemsNewestFirst,
  flattenGroupsToRows,
  groupActivityItemsByDay,
  sortActivityItemsNewestFirst,
} from "./activity-grouping";

export {
  dedupeActivityItems,
  mergeActivityPage,
  type MergeResult,
} from "./activity-paging";

export {
  buildRowOffsets,
  computeWindow,
  type ComputeWindowInput,
  type RowOffsets,
  type WindowResult,
} from "./activity-window";

export {
  ACTIVITY_FILTER_FIELD_IDS,
  activityTypeOptions,
  createActivityFilterFields,
  referencedEntityTypes,
  type ActivityFilterFieldsOptions,
} from "./activity-filter-fields";
