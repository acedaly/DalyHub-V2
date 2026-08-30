/**
 * X-04 — the derived index the Obsidian vault is written from.
 *
 * The snapshot is a set of flat, ordered collections; a vault is a graph of
 * files that link to each other. This module is the one place that turns the
 * former into the latter, so every writer below it works from the SAME
 * relationships, parents, children and file locations. Building it once also
 * keeps vault generation linear: no writer scans a collection looking for its
 * own rows.
 *
 * It is PURE — a function of the snapshot alone. No database, no clock, no
 * randomness, so the same snapshot always produces the same vault.
 */

import {
  GOAL_BELONGS_TO_AREA,
  PROJECT_ADVANCES_GOAL,
  PROJECT_BELONGS_TO_AREA,
  RESERVED_SPINE_LINK_TYPES,
  TASK_BELONGS_TO_AREA,
  TASK_BELONGS_TO_PROJECT,
} from "~/kernel/spine";
import type {
  SnapshotActivity,
  SnapshotAreaDetail,
  SnapshotAssetDetail,
  SnapshotAssetEvent,
  SnapshotAssetObligation,
  SnapshotDiaryEntryDetail,
  SnapshotEntity,
  SnapshotEntityLink,
  SnapshotGoalDetail,
  SnapshotHabitCompletion,
  SnapshotHabitDetail,
  SnapshotHabitSchedule,
  SnapshotMeetingDetail,
  SnapshotMeetingItem,
  SnapshotMeetingItemTask,
  SnapshotNoteDetail,
  SnapshotPersonDetail,
  SnapshotProjectDetail,
  SnapshotReviewDetail,
  SnapshotReviewSection,
  SnapshotSpineRecord,
  SnapshotTaskDetail,
  SnapshotTaskRecurrenceRule,
  WorkspaceSnapshotV1,
} from "~/kernel/export";

import { ownerCalendarIso } from "~/shared/datetime";

import {
  buildVaultFilenameIndex,
  type VaultFileLocation,
} from "./vault-filenames";

/**
 * The vault folder each entity type is written to.
 *
 * A type with no entry lands in `Other` rather than being dropped: a future
 * module's records must appear in an export written before this map knew about
 * them, even if their presentation is generic.
 */
export const VAULT_FOLDER_BY_TYPE: Readonly<Record<string, string>> = {
  area: "Areas",
  goal: "Goals",
  habit: "Habits",
  project: "Projects",
  task: "Tasks",
  note: "Notes",
  diary: "Diary",
  meeting: "Meetings",
  person: "People",
  asset: "Assets",
  review: "Reviews",
};

/** The fallback folder for an entity type this build does not know. */
export const VAULT_OTHER_FOLDER = "Other";

/** The folders listed on `Home.md`, in reading order. */
export const VAULT_FOLDER_ORDER: readonly string[] = [
  "Areas",
  "Goals",
  "Habits",
  "Projects",
  "Tasks",
  "Notes",
  "Diary",
  "Meetings",
  "People",
  "Assets",
  "Reviews",
  VAULT_OTHER_FOLDER,
];

export function vaultFolderForType(type: string): string {
  return VAULT_FOLDER_BY_TYPE[type] ?? VAULT_OTHER_FOLDER;
}

/** A grouped multimap helper. */
function group<T>(
  rows: readonly T[],
  key: (row: T) => string,
): ReadonlyMap<string, readonly T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const bucket = out.get(k);
    if (bucket) bucket.push(row);
    else out.set(k, [row]);
  }
  return out;
}

function byId<T>(
  rows: readonly T[],
  key: (row: T) => string,
): ReadonlyMap<string, T> {
  const out = new Map<string, T>();
  for (const row of rows) out.set(key(row), row);
  return out;
}

/** The structural parents a spine record can have. */
export interface SpineParents {
  readonly areaId: string | null;
  readonly goalId: string | null;
  readonly projectId: string | null;
}

const EMPTY_PARENTS: SpineParents = {
  areaId: null,
  goalId: null,
  projectId: null,
};

/** Everything a vault writer needs, indexed for direct lookup. */
export interface VaultIndex {
  readonly snapshot: WorkspaceSnapshotV1;
  readonly entities: readonly SnapshotEntity[];
  readonly entityById: ReadonlyMap<string, SnapshotEntity>;
  readonly location: ReadonlyMap<string, VaultFileLocation>;

  readonly spine: ReadonlyMap<string, SnapshotSpineRecord>;
  readonly areaDetail: ReadonlyMap<string, SnapshotAreaDetail>;
  readonly goalDetail: ReadonlyMap<string, SnapshotGoalDetail>;
  readonly projectDetail: ReadonlyMap<string, SnapshotProjectDetail>;
  readonly taskDetail: ReadonlyMap<string, SnapshotTaskDetail>;
  readonly recurrence: ReadonlyMap<string, SnapshotTaskRecurrenceRule>;
  readonly noteDetail: ReadonlyMap<string, SnapshotNoteDetail>;
  readonly diaryDetail: ReadonlyMap<string, SnapshotDiaryEntryDetail>;
  readonly personDetail: ReadonlyMap<string, SnapshotPersonDetail>;
  readonly meetingDetail: ReadonlyMap<string, SnapshotMeetingDetail>;
  readonly assetDetail: ReadonlyMap<string, SnapshotAssetDetail>;
  readonly habitDetail: ReadonlyMap<string, SnapshotHabitDetail>;
  readonly reviewDetail: ReadonlyMap<string, SnapshotReviewDetail>;

  /**
   * V2.6 FIND-02/03 — every entity's tags, as the DISPLAY labels, sorted by the
   * canonical key so a vault file is byte-stable between exports.
   *
   * Built from the two tag collections rather than from a detail row, because
   * since FIND-02 that is where a tag lives — and because a Task has no `tags`
   * column to read, which is how Task tags came to be missing from the vault
   * entirely (found in review on PR #238).
   */
  readonly tags: ReadonlyMap<string, readonly string[]>;

  readonly meetingItems: ReadonlyMap<string, readonly SnapshotMeetingItem[]>;
  readonly meetingFollowUps: ReadonlyMap<
    string,
    readonly SnapshotMeetingItemTask[]
  >;
  readonly assetEvents: ReadonlyMap<string, readonly SnapshotAssetEvent[]>;
  readonly assetObligations: ReadonlyMap<
    string,
    readonly SnapshotAssetObligation[]
  >;
  readonly reviewSections: ReadonlyMap<
    string,
    readonly SnapshotReviewSection[]
  >;
  /** A Habit's WHOLE schedule chain, oldest first — its history of expectation. */
  readonly habitSchedules: ReadonlyMap<
    string,
    readonly SnapshotHabitSchedule[]
  >;
  readonly habitCompletions: ReadonlyMap<
    string,
    readonly SnapshotHabitCompletion[]
  >;

  /** Active, NON-structural outgoing links (the record's own references). */
  readonly outgoingLinks: ReadonlyMap<string, readonly SnapshotEntityLink[]>;
  /** Active, NON-structural incoming links (backlinks). */
  readonly incomingLinks: ReadonlyMap<string, readonly SnapshotEntityLink[]>;

  readonly parents: ReadonlyMap<string, SpineParents>;
  /** Active child ids of an Area, by kind. */
  readonly areaChildren: ReadonlyMap<
    string,
    {
      readonly goals: readonly string[];
      readonly projects: readonly string[];
      readonly tasks: readonly string[];
    }
  >;
  readonly goalProjects: ReadonlyMap<string, readonly string[]>;
  readonly projectTasks: ReadonlyMap<string, readonly string[]>;

  /** Activity events naming an entity as a subject, oldest first. */
  readonly activityByEntity: ReadonlyMap<string, readonly SnapshotActivity[]>;

  /** Resolve a `[[Wiki Link]]` title to an entity id, mirroring NOTES-02. */
  readonly resolveTitle: (title: string) => string | null;
}

/**
 * Every entity's tag LABELS, keyed by entity id.
 *
 * The vocabulary supplies the spelling and the attachments supply the
 * membership, so a vault file shows the tag the owner sees in the product
 * rather than its folded key. Ordered by that key, which is what makes two
 * exports of an unchanged workspace produce identical files.
 *
 * Both collections are optional on read (an archive written before the tag
 * migration has neither), so this is empty rather than absent for an old
 * snapshot — the per-record arrays such an archive carries are what its own
 * writers already read.
 */
function tagsByEntity(
  records: WorkspaceSnapshotV1["records"],
): ReadonlyMap<string, readonly string[]> {
  const labels = new Map<string, string>();
  for (const tag of records.workspaceTags ?? []) {
    labels.set(tag.key, tag.label);
  }
  const byEntity = new Map<string, { key: string; label: string }[]>();
  for (const attachment of records.entityTags ?? []) {
    const label = labels.get(attachment.tagKey);
    if (label === undefined) continue;
    const list = byEntity.get(attachment.entityId) ?? [];
    list.push({ key: attachment.tagKey, label });
    byEntity.set(attachment.entityId, list);
  }
  const out = new Map<string, readonly string[]>();
  for (const [entityId, list] of byEntity) {
    out.set(
      entityId,
      list.sort((a, b) => (a.key < b.key ? -1 : 1)).map((tag) => tag.label),
    );
  }
  /*
   * An archive written BEFORE the tag migration has no tag collections at all,
   * and carries its tags on the per-record rows instead. Reading those as the
   * fallback is the same rule restore applies, and it is what keeps a vault
   * built from an old backup as complete as one built from a new export — the
   * alternative would have quietly emptied `tags:` on every Note, Person and
   * Asset in a legacy vault, which is the failure this whole file exists to
   * prevent.
   */
  for (const rows of [
    records.personDetails,
    records.assetDetails,
    records.noteDetails,
  ]) {
    for (const row of rows ?? []) {
      if (out.has(row.entityId)) continue;
      if (row.tags.length === 0) continue;
      out.set(row.entityId, [...row.tags]);
    }
  }
  return out;
}

/**
 * Build the index.
 *
 * Structural parentage and children come from the SAME five reserved spine link
 * types the product uses (`goal.belongs_to_area`, `project.belongs_to_area`,
 * `project.advances_goal`, `task.belongs_to_area`, `task.belongs_to_project`),
 * read from ACTIVE links only. A soft-deleted record keeps its structural link
 * (so a restore is faithful), which is why the child lists below filter on the
 * child entity's own `deletedAt` rather than on the link.
 */
export function buildVaultIndex(snapshot: WorkspaceSnapshotV1): VaultIndex {
  const { records } = snapshot;
  const entities = records.entities;
  const entityById = byId(entities, (entity) => entity.id);

  // Diary entries are the one record type whose natural order is the calendar,
  // not the alphabet. Prefixing each file with the day it records makes the
  // folder chronological in every file browser and in Obsidian's sidebar — the
  // same convention a daily-note vault uses — without inventing a folder
  // hierarchy the owner did not ask for. The date is the entry's OWN timezone's
  // calendar day, so an entry written late at night files under the day it was
  // written, not the UTC day.
  const diaryByEntity = byId(records.diaryEntryDetails, (row) => row.entityId);
  const fileTitle = (entity: SnapshotEntity): string => {
    if (entity.type !== "diary") return entity.title;
    const detail = diaryByEntity.get(entity.id);
    if (!detail) return entity.title;
    const day = ownerCalendarIso(new Date(detail.occurredAt), detail.timezone);
    return `${day} ${entity.title}`;
  };

  const location = buildVaultFilenameIndex(
    entities.map((entity) => ({
      id: entity.id,
      title: fileTitle(entity),
      folder: vaultFolderForType(entity.type),
    })),
  );

  const activeLinks = records.entityLinks.filter(
    (link) => link.deletedAt === null,
  );
  const structural = activeLinks.filter((link) =>
    RESERVED_SPINE_LINK_TYPES.has(link.type),
  );
  const referential = activeLinks.filter(
    (link) => !RESERVED_SPINE_LINK_TYPES.has(link.type),
  );

  const parents = new Map<string, SpineParents>();
  const areaGoals = new Map<string, string[]>();
  const areaProjects = new Map<string, string[]>();
  const areaTasks = new Map<string, string[]>();
  const goalProjects = new Map<string, string[]>();
  const projectTasks = new Map<string, string[]>();

  const setParent = (childId: string, patch: Partial<SpineParents>): void => {
    const current = parents.get(childId) ?? EMPTY_PARENTS;
    parents.set(childId, { ...current, ...patch });
  };
  const push = (
    map: Map<string, string[]>,
    key: string,
    value: string,
  ): void => {
    const bucket = map.get(key);
    if (bucket) bucket.push(value);
    else map.set(key, [value]);
  };
  const childIsPresent = (id: string): boolean => {
    const entity = entityById.get(id);
    return entity !== undefined && entity.deletedAt === null;
  };

  for (const link of structural) {
    const child = link.sourceEntityId;
    const parent = link.targetEntityId;
    switch (link.type) {
      case GOAL_BELONGS_TO_AREA:
        setParent(child, { areaId: parent });
        if (childIsPresent(child)) push(areaGoals, parent, child);
        break;
      case PROJECT_BELONGS_TO_AREA:
        setParent(child, { areaId: parent });
        if (childIsPresent(child)) push(areaProjects, parent, child);
        break;
      case PROJECT_ADVANCES_GOAL:
        setParent(child, { goalId: parent });
        if (childIsPresent(child)) push(goalProjects, parent, child);
        break;
      case TASK_BELONGS_TO_AREA:
        setParent(child, { areaId: parent });
        if (childIsPresent(child)) push(areaTasks, parent, child);
        break;
      case TASK_BELONGS_TO_PROJECT:
        setParent(child, { projectId: parent });
        if (childIsPresent(child)) push(projectTasks, parent, child);
        break;
      default:
        break;
    }
  }

  const areaChildren = new Map<
    string,
    {
      goals: readonly string[];
      projects: readonly string[];
      tasks: readonly string[];
    }
  >();
  for (const areaId of new Set([
    ...areaGoals.keys(),
    ...areaProjects.keys(),
    ...areaTasks.keys(),
  ])) {
    areaChildren.set(areaId, {
      goals: areaGoals.get(areaId) ?? [],
      projects: areaProjects.get(areaId) ?? [],
      tasks: areaTasks.get(areaId) ?? [],
    });
  }

  // Activity: one pass over subjects, then attach events in chronological order.
  // `records.activities` is already ordered by (occurredAt, id), so the buckets
  // inherit that ordering with no second sort.
  const activityByEntity = new Map<string, SnapshotActivity[]>();
  const subjectsByActivity = group(
    records.activitySubjects,
    (subject) => subject.activityId,
  );
  for (const activity of records.activities) {
    for (const subject of subjectsByActivity.get(activity.id) ?? []) {
      const bucket = activityByEntity.get(subject.entityId);
      if (bucket) bucket.push(activity);
      else activityByEntity.set(subject.entityId, [activity]);
    }
  }

  /**
   * Title resolution for `[[Wiki Links]]`, mirroring NOTES-02's rule: match
   * case-insensitively, prefer a Note, then the earliest-created record. Only
   * ACTIVE records are candidates, exactly as the product's resolver requires —
   * a wiki link to a deleted record is genuinely unresolved, and the vault says
   * so rather than linking to a tombstone.
   */
  const titleIndex = new Map<string, SnapshotEntity>();
  for (const entity of entities) {
    if (entity.deletedAt !== null) continue;
    const key = entity.title.trim().toLocaleLowerCase();
    if (key === "") continue;
    const existing = titleIndex.get(key);
    if (existing === undefined) {
      titleIndex.set(key, entity);
      continue;
    }
    const existingIsNote = existing.type === "note";
    const candidateIsNote = entity.type === "note";
    if (candidateIsNote && !existingIsNote) {
      titleIndex.set(key, entity);
    } else if (candidateIsNote === existingIsNote) {
      if (
        entity.createdAt < existing.createdAt ||
        (entity.createdAt === existing.createdAt && entity.id < existing.id)
      ) {
        titleIndex.set(key, entity);
      }
    }
  }

  return {
    snapshot,
    entities,
    entityById,
    location,
    spine: byId(records.spineRecords, (row) => row.entityId),
    areaDetail: byId(records.areaDetails, (row) => row.entityId),
    goalDetail: byId(records.goalDetails, (row) => row.entityId),
    projectDetail: byId(records.projectDetails, (row) => row.entityId),
    taskDetail: byId(records.taskDetails, (row) => row.entityId),
    recurrence: byId(records.taskRecurrenceRules, (row) => row.entityId),
    noteDetail: byId(records.noteDetails, (row) => row.entityId),
    diaryDetail: byId(records.diaryEntryDetails, (row) => row.entityId),
    personDetail: byId(records.personDetails, (row) => row.entityId),
    meetingDetail: byId(records.meetingDetails, (row) => row.entityId),
    assetDetail: byId(records.assetDetails, (row) => row.entityId),
    habitDetail: byId(records.habitDetails, (row) => row.entityId),
    reviewDetail: byId(records.reviewDetails, (row) => row.entityId),
    tags: tagsByEntity(records),
    meetingItems: group(records.meetingItems, (row) => row.meetingId),
    meetingFollowUps: group(records.meetingItemTasks, (row) => row.meetingId),
    assetEvents: group(records.assetEvents, (row) => row.assetId),
    assetObligations: group(records.assetObligations, (row) => row.assetId),
    reviewSections: group(records.reviewSections, (row) => row.reviewId),
    habitSchedules: group(records.habitSchedules, (row) => row.habitId),
    habitCompletions: group(records.habitCompletions, (row) => row.habitId),
    outgoingLinks: group(referential, (link) => link.sourceEntityId),
    incomingLinks: group(referential, (link) => link.targetEntityId),
    parents,
    areaChildren,
    goalProjects,
    projectTasks,
    activityByEntity,
    resolveTitle: (title) => {
      const match = titleIndex.get(title.trim().toLocaleLowerCase());
      return match ? match.id : null;
    },
  };
}
