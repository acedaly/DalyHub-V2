/**
 * DS-05 — activity filtering via the ONE shared DS-07 filter model (React-free).
 *
 * DS-05 does NOT build a timeline-only filter UI. It builds DS-07
 * `FilterFieldDefinition`s over the `ActivityItem` view-model and hands them to the
 * shared `FilterBar`; the DS-07 evaluator does the matching. At minimum it filters
 * by activity/event type, and — within the generic DS-07 contract, adding no
 * product-specific operator — also by actor type, referenced entity type and date
 * range. Nothing here expands DS-07 with product behaviour.
 */

import type { FilterFieldRegistry, FilterOption } from "~/shared/filters/model";

import type { ActivityDescriptorMap, ActivityItem } from "./types";

/** The stable field ids the activity filter contributes. */
export const ACTIVITY_FILTER_FIELD_IDS = {
  eventType: "activityType",
  actorType: "actorType",
  entityType: "entityType",
  date: "occurredAt",
} as const;

/** Build DS-07 enum options for event types from a descriptor map's labels. */
export function activityTypeOptions(
  descriptors: ActivityDescriptorMap,
): FilterOption[] {
  return Object.entries(descriptors)
    .map(([value, descriptor]) => ({ value, label: descriptor.label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** The distinct, resolved referenced entity types on one item (for filtering). */
export function referencedEntityTypes(item: ActivityItem): string[] {
  const out = new Set<string>();
  for (const subject of item.subjects) {
    const type = subject.entity?.entityType;
    if (type) {
      out.add(type);
    }
  }
  return [...out];
}

/** Options controlling which activity filter fields are offered. */
export interface ActivityFilterFieldsOptions {
  readonly eventTypeOptions: readonly FilterOption[];
  readonly actorTypeOptions?: readonly FilterOption[];
  readonly entityTypeOptions?: readonly FilterOption[];
  /** Omit the date field (e.g. a short record Timeline). Default: included. */
  readonly includeDate?: boolean;
}

/**
 * Build the DS-07 field registry for an activity stream. The accessors read the
 * `ActivityItem` view-model — no kernel record, repository or React is involved —
 * so the same registry works for both Timeline and Activity Feed.
 */
export function createActivityFilterFields(
  options: ActivityFilterFieldsOptions,
): FilterFieldRegistry {
  const fields: FilterFieldRegistry = [
    {
      id: ACTIVITY_FILTER_FIELD_IDS.eventType,
      label: "Event type",
      type: "enum",
      options: options.eventTypeOptions,
      accessor: (record: unknown) => (record as ActivityItem).type,
    },
    ...(options.actorTypeOptions && options.actorTypeOptions.length > 0
      ? ([
          {
            id: ACTIVITY_FILTER_FIELD_IDS.actorType,
            label: "Actor",
            type: "enum",
            options: options.actorTypeOptions,
            accessor: (record: unknown) => (record as ActivityItem).actor.type,
          },
        ] as const)
      : []),
    ...(options.entityTypeOptions && options.entityTypeOptions.length > 0
      ? ([
          {
            id: ACTIVITY_FILTER_FIELD_IDS.entityType,
            label: "Referenced entity",
            type: "multi-enum",
            options: options.entityTypeOptions,
            allowMultipleClauses: true,
            accessor: (record: unknown) =>
              referencedEntityTypes(record as ActivityItem),
          },
        ] as const)
      : []),
    ...(options.includeDate !== false
      ? ([
          {
            id: ACTIVITY_FILTER_FIELD_IDS.date,
            label: "Date",
            type: "date",
            accessor: (record: unknown) => (record as ActivityItem).occurredAt,
          },
        ] as const)
      : []),
  ];
  return fields;
}
