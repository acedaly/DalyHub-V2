/**
 * PEOPLE-02 — the Person relationship Timeline's pure presentation model.
 *
 * The Person Timeline is the ONE Person history surface (there is no second
 * timeline and no People-specific history table): it renders the shared FND-05
 * Activity stream read across the Person AND the records they are linked to, so a
 * task promised to someone, a note written about them, a diary entry that mentions
 * them or a meeting they attended appears in one chronological history — always by
 * reference to the canonical record, never by copying its content.
 *
 * This file is deliberately PURE and client-safe: it maps an already-rendered
 * `ActivityItem` to a coarse relationship CATEGORY and builds the DS-07 filter
 * fields over it. It resolves no repository, no registry and no React, so both the
 * tab component and the unit tests can use it directly.
 *
 * Categories are a *reading aid*, not a second taxonomy: they are derived from
 * facts already on the item (the event type's domain and the resolved entity type
 * of the referenced record), never stored, never persisted and never sent over the
 * wire.
 */

import type { ActivityItem } from "~/shared/activity-feed/model";
import { ACTIVITY_FILTER_FIELD_IDS } from "~/shared/activity-feed/model";
import type { FilterFieldRegistry, FilterOption } from "~/shared/filters/model";

/** The coarse categories the Person Timeline groups its events into. */
export type PersonTimelineCategoryId =
  "person" | "relationship" | "task" | "meeting" | "note" | "diary" | "other";

/**
 * The category filter's options, in a stable display order. The labels are the
 * product's own nouns (AGENTS.md §7) and describe the RELATIONSHIP, not a CRM
 * pipeline (§5) — "Commitments" for Tasks, "Conversations" for Meetings.
 */
export const PERSON_TIMELINE_CATEGORY_OPTIONS: readonly FilterOption[] = [
  { value: "person", label: "Person record" },
  { value: "relationship", label: "Connections" },
  { value: "task", label: "Commitments" },
  { value: "meeting", label: "Conversations" },
  { value: "note", label: "Notes" },
  { value: "diary", label: "Diary" },
  { value: "other", label: "Other records" },
];

/** Event-type domain (the text before the first dot) → category. */
const DOMAIN_CATEGORIES: Readonly<Record<string, PersonTimelineCategoryId>> = {
  person: "person",
  task: "task",
  meeting: "meeting",
  note: "note",
  diary_entry: "diary",
};

/** Resolved entity type of the referenced record → category. */
const ENTITY_CATEGORIES: Readonly<Record<string, PersonTimelineCategoryId>> = {
  person: "person",
  task: "task",
  meeting: "meeting",
  note: "note",
  diary: "diary",
};

/**
 * Classify one timeline event. Pure and TOTAL — it never throws on an unfamiliar
 * event type, an unregistered module or an unresolved subject, and it reads only
 * the item, so a newly-added module's events classify sensibly (as "Other
 * records") with no change here.
 *
 * Precedence:
 *   1. every `entity_link.*` event is a CONNECTION, whichever records it joins;
 *   2. otherwise the event type's own domain wins (`task.completed` → a
 *      commitment) — this is what makes a module-owned event classify correctly
 *      even when its subjects cannot be resolved;
 *   3. otherwise — the generic `entity.*` lifecycle types, and any module whose
 *      domain is not one of the relationship-bearing ones — the referenced record
 *      that is NOT the anchor Person decides;
 *   4. an event with only the Person as a subject is a Person-record event.
 */
export function personTimelineCategory(
  item: ActivityItem,
): PersonTimelineCategoryId {
  if (item.type.startsWith("entity_link.")) {
    return "relationship";
  }

  const domain = item.type.split(".", 1)[0] ?? "";
  const byDomain = DOMAIN_CATEGORIES[domain];
  if (byDomain) {
    return byDomain;
  }

  const referenced = item.subjects.find(
    (subject) => !subject.isAnchor && subject.entity?.entityType,
  );
  const entityType = referenced?.entity?.entityType;
  if (entityType) {
    return ENTITY_CATEGORIES[entityType] ?? "other";
  }
  if (item.subjects.some((subject) => !subject.isAnchor)) {
    return "other";
  }
  return item.subjects.some((subject) => subject.isAnchor) ? "person" : "other";
}

/** The stable DS-07 field id of the People-owned category filter. */
export const PERSON_TIMELINE_CATEGORY_FIELD_ID = "personTimelineCategory";

/**
 * The DS-07 field registry for the Person Timeline: the People-owned relationship
 * CATEGORY plus the shared date field. It adds no operator and no product
 * behaviour to DS-07 — the shared evaluator does the matching and the shared
 * `FilterBar` renders the controls.
 *
 * A per-event-type filter is deliberately NOT offered here. The unified timeline
 * carries the event types of every module that can be linked to a Person, so a
 * flat list of several dozen machine types would be a worse control than seven
 * relationship-shaped categories — and it could not be built client-side without
 * shipping every module's manifest to the browser.
 */
export const PERSON_TIMELINE_FILTER_FIELDS: FilterFieldRegistry = [
  {
    id: PERSON_TIMELINE_CATEGORY_FIELD_ID,
    label: "Activity",
    type: "enum",
    options: PERSON_TIMELINE_CATEGORY_OPTIONS,
    accessor: (record: unknown) =>
      personTimelineCategory(record as ActivityItem),
  },
  {
    id: ACTIVITY_FILTER_FIELD_IDS.date,
    label: "Date",
    type: "date",
    accessor: (record: unknown) => (record as ActivityItem).occurredAt,
  },
];
