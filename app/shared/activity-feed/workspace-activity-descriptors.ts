/**
 * DS-05 / IDENT-01 — the SHARED cross-module activity descriptor set.
 *
 * The workspace Activity Feed spans every module's events, and so does a Person's
 * relationship Timeline. Before this file each such surface carried its own
 * partial descriptor map, so an event owned by a module the surface did not know
 * about fell through to the generic fallback and was flagged as unrecognised —
 * even though the type was fully registered, persisted and understood.
 *
 * This is the ONE place a persisted event type gets its cross-module line. It
 * imports only KERNEL identifier constants (`~/kernel/*`), never a module, so the
 * module import boundary holds (AGENTS.md §9.1): a shared surface no longer needs
 * to reach into Meetings or Assets to name their events.
 *
 * Two layers, and a module surface adds a third:
 *
 *   kernel lifecycle defaults          (`DEFAULT_ACTIVITY_DESCRIPTORS`)
 *     → registry-declared labels       (every module manifest's `activityTypes`)
 *       → THIS curated cross-module set
 *         → the module's own record-scoped descriptors, where it has them
 *
 * The registry layer is the safety net: a module that adds an event type and
 * declares it in its manifest is readable everywhere with no edit here. This file
 * exists on top of it to give the frequent cross-module events genuinely good
 * English — an actor, the affected record, and the source/destination records
 * where the event joins two.
 *
 * React-free (it lives in the `model` surface) and pure. Every `describe` is
 * total: it never throws on an unfamiliar payload, never renders a raw payload,
 * and degrades gracefully when a referenced record is deleted or unresolvable
 * (the shared item renders "an unavailable item").
 *
 * ONE narrow, deliberate exception to "a curated `describe` never reads the
 * payload" (AUDIT-FIX-03): the three permanent-deletion tombstones —
 * `area.deleted`, `asset.deleted`, `review.deleted`. These are SUBJECT-LESS by
 * construction (the entity row is removed by the batch that appends them), so
 * there is nothing for `selectReferenceSubject` to resolve and a subject-based
 * line degrades to "permanently deleted an area" — an audit event that cannot say
 * what it is about, on the very surface that has to carry it once the record's
 * own page is gone. They read exactly ONE payload key, `title`, through the
 * shared `purgeTombstoneDescriptor`.
 *
 * That does not widen the privacy boundary this file protects. A title is the
 * record's own name, and it is already what every other line here shows: `record()`
 * emits an entity segment that the UI resolves to the entity's title. The
 * tombstone shows the same information, sourced from the payload only because the
 * entity no longer exists to resolve. No other payload field is read by any
 * descriptor here, and a tombstone emits no payload metadata.
 */

import {
  AREA_ARCHIVED,
  AREA_DELETED,
  AREA_RESTORED,
} from "~/kernel/area-settings";
import {
  ASSET_ARCHIVED,
  ASSET_CREATED,
  ASSET_DELETED,
  ASSET_DISPOSED,
  ASSET_EVENT_ARCHIVED,
  ASSET_EVENT_CREATED,
  ASSET_EVENT_DELETED,
  ASSET_EVENT_RESTORED,
  ASSET_EVENT_UPDATED,
  ASSET_METER_UPDATED,
  ASSET_OBLIGATION_COMPLETED,
  ASSET_OBLIGATION_CREATED,
  ASSET_OBLIGATION_DISMISSED,
  ASSET_OBLIGATION_REOPENED,
  ASSET_OBLIGATION_RESCHEDULED,
  ASSET_RESTORED,
  ASSET_STATUS_CHANGED,
  ASSET_TASK_LINKED,
  ASSET_UPDATED,
} from "~/kernel/assets";
import {
  SECURITY_LOCAL_DATA_CLEARED,
  SECURITY_SIGNED_OUT,
} from "~/kernel/account-security";
import { DIARY_ENTRY_CREATED, DIARY_ENTRY_UPDATED } from "~/kernel/diary";
import { GOAL_DETAILS_UPDATED } from "~/kernel/goals";
import {
  MEETING_ARCHIVED,
  MEETING_CREATED,
  MEETING_FOLLOW_UP_CREATED,
  MEETING_HELD,
  MEETING_ITEM_CONVERTED_TO_TASK,
  MEETING_RESTORED,
  MEETING_UPDATED,
} from "~/kernel/meetings";
import {
  NOTE_ARCHIVED,
  NOTE_CONTENT_UPDATED,
  NOTE_TAGS_UPDATED,
  NOTE_UNARCHIVED,
} from "~/kernel/notes";
import {
  PERSON_ARCHIVED,
  PERSON_CREATED,
  PERSON_RESTORED,
  PERSON_UPDATED,
} from "~/kernel/people";
import { APP_PREFERENCES_CHANGED } from "~/kernel/preferences";
import {
  PROJECT_ARCHIVED,
  PROJECT_RESTORED,
  PROJECT_STATUS_CHANGED,
} from "~/kernel/project-settings";
import {
  REVIEW_ARCHIVED,
  REVIEW_COMPLETED,
  REVIEW_CREATED,
  REVIEW_DELETED,
  REVIEW_REOPENED,
  REVIEW_RESTORED,
  REVIEW_STATUS_CHANGED,
  REVIEW_UPDATED,
} from "~/kernel/reviews";
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
  TASK_RECURRENCE_OCCURRENCE_CREATED,
  TASK_RECURRENCE_OCCURRENCE_SKIPPED,
  TASK_RECURRENCE_OCCURRENCE_WITHDRAWN,
  TASK_RESCHEDULED,
  TASK_WAITING_CHANGED,
  TASK_WAITING_CLEARED,
  TASK_WAITING_STARTED,
} from "~/kernel/tasks";

import { createActivityDescriptorMap } from "./activity-type-registry";
import { purgeTombstoneDescriptor } from "./purge-tombstone";
import type {
  ActivityDescriptionSegment,
  ActivityDescriptorMap,
  ActivityItemSubject,
  ActivityTone,
  ActivityTypeDescriptor,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Descriptor builders                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A calm, label-shaped descriptor: the shared mapper renders
 * `actor · label — record`, linking the record the event is ABOUT.
 */
function event(
  label: string,
  entityType: string,
  tone?: ActivityTone,
): ActivityTypeDescriptor {
  return tone === undefined
    ? { label, entityType }
    : { label, entityType, tone };
}

/** A segment for a subject, or a calm noun when it cannot be resolved. */
function record(
  subject: ActivityItemSubject | null,
  fallback: string,
): ActivityDescriptionSegment {
  return subject
    ? { kind: "entity", entityId: subject.entityId }
    : { kind: "emphasis", text: fallback };
}

/**
 * A descriptor for an event that JOINS two records — "<actor> <verb> <source>
 * <joiner> <target>". Used for the conversion and derivation events whose whole
 * meaning is the relationship between two records; a label-only line would drop
 * the destination and read as a dead end.
 */
function joins(
  label: string,
  verb: string,
  joiner: string,
  sourceRole: string,
  targetRole: string,
  entityType: string,
  tone?: ActivityTone,
): ActivityTypeDescriptor {
  return {
    label,
    entityType,
    ...(tone === undefined ? {} : { tone }),
    describe: (_base, context) => {
      const source =
        context.subjectByRole(sourceRole) ?? context.primarySubject ?? null;
      const target =
        context.subjectByRole(targetRole) ??
        context.subjects.find((s) => s.entityId !== source?.entityId) ??
        null;
      const segments: ActivityDescriptionSegment[] = [
        { kind: "actor" },
        { kind: "text", text: ` ${verb} ` },
        record(source, "a record"),
      ];
      if (target) {
        segments.push({ kind: "text", text: ` ${joiner} ` });
        segments.push(record(target, "a record"));
      }
      return { segments, entityType, ...(tone === undefined ? {} : { tone }) };
    },
  };
}

/**
 * SET-03 — a descriptor for a WORKSPACE-SCOPED event: something the owner did to
 * their account or to a device, which relates to no record at all.
 *
 * It renders "<actor> <verb>" and stops. There is no `record()` segment because
 * there is no entity to name, and no `entityType` because an entity marker beside
 * an event about no entity would be a small lie. Like every other curated
 * descriptor here it reads ONLY the actor — never the payload — so the counts and
 * booleans these events carry stay out of the feed.
 */
function ownerAction(label: string, verb: string): ActivityTypeDescriptor {
  return {
    label,
    describe: () => ({
      segments: [{ kind: "actor" }, { kind: "text", text: ` ${verb}` }],
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* The curated cross-module set                                               */
/* -------------------------------------------------------------------------- */

/**
 * Every persisted event type in the current schema that is NOT one of the seven
 * kernel lifecycle types, with a readable, grammatically correct description.
 *
 * A test asserts this map plus the kernel defaults covers every activity type the
 * module registry declares, so adding a module event without a line here fails
 * the build rather than silently reaching the generic fallback in production.
 */
export const WORKSPACE_ACTIVITY_DESCRIPTORS: Record<
  string,
  ActivityTypeDescriptor
> = {
  /* Tasks ------------------------------------------------------------------ */
  [TASK_COMPLETED]: event("Completed task", "task", "success"),
  [TASK_REOPENED]: event("Reopened task", "task"),
  [TASK_PLANNED]: event("Planned task", "task"),
  [TASK_RESCHEDULED]: event("Rescheduled task", "task"),
  [TASK_PLAN_CLEARED]: event("Cleared task plan", "task"),
  [TASK_WAITING_STARTED]: event("Started waiting on task", "task", "warning"),
  [TASK_WAITING_CHANGED]: event("Changed what a task waits on", "task"),
  [TASK_WAITING_CLEARED]: event("Stopped waiting on task", "task"),
  // The whole point of a recurrence event is the pair of occurrences, so both
  // the completed occurrence and its successor are named.
  [TASK_RECURRENCE_OCCURRENCE_CREATED]: joins(
    "Created the next occurrence",
    "completed",
    "and scheduled",
    "subject",
    "successor",
    "task",
    "success",
  ),
  [TASK_RECURRENCE_OCCURRENCE_WITHDRAWN]: joins(
    "Withdrew the next occurrence",
    "reopened",
    "and withdrew",
    "subject",
    "successor",
    "task",
    "warning",
  ),
  [TASK_RECURRENCE_OCCURRENCE_SKIPPED]: event(
    "Skipped an occurrence",
    "task",
    "warning",
  ),

  /* Projects --------------------------------------------------------------- */
  [PROJECT_COMPLETED]: event("Completed project", "project", "success"),
  [PROJECT_REOPENED]: event("Reopened project", "project"),
  [PROJECT_STATUS_CHANGED]: event("Changed project status", "project"),
  [PROJECT_ARCHIVED]: event("Archived project", "project", "warning"),
  [PROJECT_RESTORED]: event("Restored project", "project", "info"),

  /* Goals ------------------------------------------------------------------ */
  [GOAL_COMPLETED]: event("Completed goal", "goal", "success"),
  [GOAL_REOPENED]: event("Reopened goal", "goal"),
  [GOAL_DETAILS_UPDATED]: event("Updated goal", "goal"),

  /* Account & security (SET-03) --------------------------------------------- */
  [SECURITY_SIGNED_OUT]: ownerAction("Signed out", "signed out of DalyHub"),
  [SECURITY_LOCAL_DATA_CLEARED]: ownerAction(
    "Cleared local data",
    "cleared DalyHub's data on a device",
  ),

  /* Areas ------------------------------------------------------------------ */
  [AREA_ARCHIVED]: event("Archived area", "area", "warning"),
  [AREA_RESTORED]: event("Restored area", "area", "info"),
  [AREA_DELETED]: purgeTombstoneDescriptor({
    label: "Deleted area permanently",
    verb: "permanently deleted",
    titleKey: "title",
    fallbackText: "an area",
    entityType: "area",
  }),

  /* Notes ------------------------------------------------------------------ */
  [NOTE_CONTENT_UPDATED]: event("Updated note", "note"),
  [NOTE_TAGS_UPDATED]: event("Updated note tags", "note"),
  [NOTE_ARCHIVED]: event("Archived note", "note", "warning"),
  [NOTE_UNARCHIVED]: event("Restored note", "note", "info"),

  /* Diary ------------------------------------------------------------------ */
  [DIARY_ENTRY_CREATED]: event("Added diary entry", "diary", "success"),
  [DIARY_ENTRY_UPDATED]: event("Edited diary entry", "diary"),

  /* Meetings --------------------------------------------------------------- */
  [MEETING_CREATED]: event("Created meeting", "meeting", "success"),
  [MEETING_UPDATED]: event("Updated meeting", "meeting"),
  [MEETING_ARCHIVED]: event("Archived meeting", "meeting", "warning"),
  [MEETING_RESTORED]: event("Restored meeting", "meeting", "info"),
  [MEETING_HELD]: event("Recorded meeting as held", "meeting", "success"),
  // These two are the events that read as nonsense without their destination:
  // the follow-up TASK is the point, and the meeting is where it came from.
  [MEETING_ITEM_CONVERTED_TO_TASK]: joins(
    "Converted meeting item to task",
    "converted a meeting item from",
    "into",
    "subject",
    "target",
    "task",
    "success",
  ),
  [MEETING_FOLLOW_UP_CREATED]: joins(
    "Created follow-up task",
    "created a follow-up task from",
    "as",
    "subject",
    "target",
    "task",
    "success",
  ),

  /* People ----------------------------------------------------------------- */
  [PERSON_CREATED]: event("Added person", "person", "success"),
  [PERSON_UPDATED]: event("Updated person", "person"),
  [PERSON_ARCHIVED]: event("Archived person", "person", "warning"),
  [PERSON_RESTORED]: event("Restored person", "person", "info"),

  /* Assets ----------------------------------------------------------------- */
  [ASSET_CREATED]: event("Added asset", "asset", "success"),
  [ASSET_UPDATED]: event("Updated asset", "asset"),
  [ASSET_STATUS_CHANGED]: event("Changed asset status", "asset"),
  [ASSET_ARCHIVED]: event("Archived asset", "asset", "warning"),
  [ASSET_RESTORED]: event("Restored asset", "asset", "info"),
  [ASSET_DISPOSED]: event("Disposed of asset", "asset", "warning"),
  [ASSET_EVENT_CREATED]: event("Recorded asset history", "asset", "success"),
  [ASSET_EVENT_UPDATED]: event("Updated asset history", "asset"),
  [ASSET_EVENT_ARCHIVED]: event("Archived asset history", "asset", "warning"),
  [ASSET_EVENT_RESTORED]: event("Restored asset history", "asset", "info"),
  [ASSET_EVENT_DELETED]: event("Deleted asset history", "asset", "danger"),
  [ASSET_OBLIGATION_CREATED]: event("Added asset obligation", "asset"),
  [ASSET_OBLIGATION_RESCHEDULED]: event(
    "Rescheduled asset obligation",
    "asset",
  ),
  [ASSET_OBLIGATION_COMPLETED]: event(
    "Completed asset obligation",
    "asset",
    "success",
  ),
  [ASSET_OBLIGATION_DISMISSED]: event(
    "Dismissed asset obligation",
    "asset",
    "warning",
  ),
  [ASSET_OBLIGATION_REOPENED]: event("Reopened asset obligation", "asset"),
  [ASSET_DELETED]: purgeTombstoneDescriptor({
    label: "Deleted asset permanently",
    verb: "permanently deleted",
    titleKey: "title",
    fallbackText: "an asset",
    entityType: "asset",
  }),
  [ASSET_TASK_LINKED]: joins(
    "Linked asset obligation to task",
    "linked",
    "to",
    "subject",
    "target",
    "asset",
  ),
  [ASSET_METER_UPDATED]: event("Updated asset meter reading", "asset"),

  /* Reviews ---------------------------------------------------------------- */
  [REVIEW_CREATED]: event("Started review", "review", "success"),
  [REVIEW_UPDATED]: event("Updated review", "review"),
  [REVIEW_STATUS_CHANGED]: event("Changed review status", "review"),
  [REVIEW_COMPLETED]: event("Completed review", "review", "success"),
  [REVIEW_REOPENED]: event("Reopened review", "review"),
  [REVIEW_ARCHIVED]: event("Archived review", "review", "warning"),
  [REVIEW_RESTORED]: event("Restored review", "review", "info"),
  [REVIEW_DELETED]: purgeTombstoneDescriptor({
    label: "Deleted review permanently",
    verb: "permanently deleted",
    titleKey: "title",
    fallbackText: "a review",
    entityType: "review",
  }),

  /* Settings --------------------------------------------------------------- */
  [APP_PREFERENCES_CHANGED]: {
    label: "Changed preferences",
    describe: () => ({
      segments: [
        { kind: "actor" },
        { kind: "text", text: " changed " },
        { kind: "emphasis", text: "application preferences" },
      ],
    }),
  },
};

/**
 * The minimum a registered activity-type contribution has to offer to be given a
 * readable line. Structurally compatible with the FND-06 registry's
 * `RegisteredActivityType`, stated narrowly so this stays a pure function over
 * plain data — a caller passes `registry.listActivityTypes()`.
 */
export interface DeclaredActivityType {
  readonly type: string;
  readonly label: string;
}

/**
 * Build the descriptor map a CROSS-MODULE surface renders with:
 *
 *   kernel lifecycle defaults → every module's declared labels → this curated set
 *
 * A registry-derived descriptor carries a label but no `describe`, so it renders
 * the calm default line and emits NO payload metadata — which is also the privacy
 * boundary a shared surface needs (AGENTS.md §17).
 *
 * `overrides` is applied last, for a surface that legitimately reads differently
 * on its own record (a Meeting's own Timeline says "this meeting").
 */
export function buildWorkspaceActivityDescriptors(
  contributions: readonly DeclaredActivityType[] = [],
  overrides: ActivityDescriptorMap = {},
): ActivityDescriptorMap {
  const merged: Record<string, ActivityTypeDescriptor> = {
    ...WORKSPACE_ACTIVITY_DESCRIPTORS,
  };

  for (const contribution of contributions) {
    if (
      typeof contribution?.type !== "string" ||
      contribution.type.length === 0 ||
      typeof contribution.label !== "string" ||
      contribution.label.length === 0
    ) {
      // A malformed contribution is skipped, never allowed to crash a feed.
      continue;
    }
    const curated = merged[contribution.type];
    // The MODULE owns its vocabulary (FND-06: every module declares its event
    // labels), so a declared label always wins. What the curated entry adds is
    // structure the manifest cannot express — the entity marker, the tone, and,
    // for the events that join two records, the sentence that names both. That
    // split keeps the privacy boundary a cross-module surface relies on: a
    // curated `describe` reads ONLY the actor and the resolved subjects, never
    // the payload, so no module's payload fields can reach another's timeline.
    merged[contribution.type] = curated
      ? { ...curated, label: contribution.label }
      : { label: contribution.label };
  }

  return createActivityDescriptorMap(merged, overrides);
}
