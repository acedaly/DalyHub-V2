/**
 * X-04 — a realistic, hand-built workspace snapshot for the pure export tests.
 *
 * It deliberately covers EVERY shipped module and every awkward case the export
 * has to survive, so a unit test never has to invent its own half-workspace:
 *
 *   - the full Area → Goal → Project → Task spine, with structural links;
 *   - two notes with the SAME title (a filename collision), one of which also
 *     collides case-insensitively;
 *   - a note whose body carries a `[[Wiki Link]]`, a `dalyhub://` record link, a
 *     link to a DELETED record and a link to a record that does not exist;
 *   - an archived record, a soft-deleted record and a completed record;
 *   - a title that is nothing but path separators and reserved characters;
 *   - a Unicode title and a very long title;
 *   - meetings with items and a follow-up mapping, a person, an asset with an
 *     event and an obligation, a review with sections, a diary entry;
 *   - unlinked (soft-deleted) EntityLinks and multi-subject Activity.
 *
 * The kernel/D1 suite proves the same shapes come out of the real database; this
 * fixture is what lets the pure tests stay fast and exhaustive.
 */

import {
  SNAPSHOT_CONSISTENCY,
  SNAPSHOT_ORDER_KEYS,
  SNAPSHOT_SCHEMA_NAME,
  SNAPSHOT_SCHEMA_VERSION,
  type SnapshotCollection,
  type SnapshotRecords,
  type WorkspaceSnapshotV1,
} from "~/kernel/export";

const T = (n: number): string =>
  new Date(Date.UTC(2026, 6, 1, 0, 0, n)).toISOString();

/** Ids are lexically ordered so the fixture already satisfies the ordering rule. */
export const IDS = {
  area: "e-01-area-health",
  areaArchived: "e-02-area-archived",
  goal: "e-03-goal",
  project: "e-04-project",
  projectDeleted: "e-05-project-deleted",
  task: "e-06-task",
  taskRecurring: "e-07-task-recurring",
  noteA: "e-08-note-duplicate-a",
  noteB: "e-09-note-duplicate-b",
  noteCase: "e-10-note-duplicate-c",
  noteLinks: "e-11-note-links",
  noteAwkward: "e-12-note-awkward",
  noteUnicode: "e-13-note-unicode",
  noteLong: "e-14-note-long",
  noteArchived: "e-15-note-archived",
  noteDeleted: "e-16-note-deleted",
  diary: "e-17-diary",
  meeting: "e-18-meeting",
  person: "e-19-person",
  asset: "e-20-asset",
  review: "e-21-review",
  future: "e-22-future-type",
} as const;

/** A record id that is NOT in the snapshot, for the broken-link case. */
export const MISSING_ID = "e-99-never-existed";

const LONG_TITLE = `Reading list ${"very ".repeat(60)}long`;

interface Entity {
  id: string;
  type: string;
  title: string;
  deletedAt?: string | null;
}

const ENTITIES: readonly Entity[] = [
  { id: IDS.area, type: "area", title: "Health" },
  { id: IDS.areaArchived, type: "area", title: "Old side venture" },
  { id: IDS.goal, type: "goal", title: "Run a half marathon" },
  { id: IDS.project, type: "project", title: "12-week training block" },
  {
    id: IDS.projectDeleted,
    type: "project",
    title: "Abandoned plan",
    deletedAt: T(40),
  },
  { id: IDS.task, type: "task", title: "Monday: 5km easy run" },
  { id: IDS.taskRecurring, type: "task", title: "Weekly long run" },
  { id: IDS.noteA, type: "note", title: "Training notes" },
  { id: IDS.noteB, type: "note", title: "Training notes" },
  { id: IDS.noteCase, type: "note", title: "TRAINING NOTES" },
  { id: IDS.noteLinks, type: "note", title: "Knowledge hub" },
  { id: IDS.noteAwkward, type: "note", title: '///\\<>:"|?*' },
  { id: IDS.noteUnicode, type: "note", title: "Café résumé — 日本語 🌱" },
  { id: IDS.noteLong, type: "note", title: LONG_TITLE },
  { id: IDS.noteArchived, type: "note", title: "Put away" },
  {
    id: IDS.noteDeleted,
    type: "note",
    title: "Deleted note",
    deletedAt: T(41),
  },
  { id: IDS.diary, type: "diary", title: "Morning reflection" },
  { id: IDS.meeting, type: "meeting", title: "Coaching catch-up" },
  { id: IDS.person, type: "person", title: "Jamie Rivers" },
  { id: IDS.asset, type: "asset", title: "Road bike" },
  { id: IDS.review, type: "review", title: "Week 27 review" },
  { id: IDS.future, type: "widget", title: "A type this build does not know" },
];

/**
 * A note body exercising every internal-link case at once — including one inside
 * a code fence, which must be left exactly as written.
 */
export const LINKED_NOTE_BODY = [
  "# Knowledge hub",
  "",
  "The plan lives in [[12-week training block]] and the goal is",
  "[the half](dalyhub://goal/e-03-goal).",
  "",
  "This one is gone: [gone](dalyhub://note/e-16-note-deleted).",
  "This one never existed: [missing](dalyhub://note/e-99-never-existed).",
  "And this title matches nothing: [[No such record]].",
  "",
  "```md",
  "[[Not a link]] and [nor this](dalyhub://note/e-08-note-duplicate-a)",
  "```",
  "",
  "Trailing text.  ",
].join("\n");

function sortCollections(records: SnapshotRecords): SnapshotRecords {
  const out: Record<string, unknown[]> = {};
  for (const [collection, rows] of Object.entries(records)) {
    const key = SNAPSHOT_ORDER_KEYS[collection as SnapshotCollection] as (
      row: unknown,
    ) => string;
    out[collection] = [...(rows as readonly unknown[])].sort((a, b) => {
      const left = key(a);
      const right = key(b);
      return left < right ? -1 : left > right ? 1 : 0;
    });
  }
  return out as unknown as SnapshotRecords;
}

/** Build the fixture snapshot. Accepts a patch so a test can vary one field. */
export function makeSnapshot(
  patch: Partial<WorkspaceSnapshotV1> = {},
): WorkspaceSnapshotV1 {
  const records: SnapshotRecords = sortCollections({
    entities: ENTITIES.map((entity) => ({
      id: entity.id,
      type: entity.type,
      title: entity.title,
      createdAt: T(1),
      updatedAt: T(2),
      deletedAt: entity.deletedAt ?? null,
    })),
    spineRecords: [
      { entityId: IDS.area, kind: "area", completedAt: null },
      { entityId: IDS.areaArchived, kind: "area", completedAt: null },
      { entityId: IDS.goal, kind: "goal", completedAt: null },
      { entityId: IDS.project, kind: "project", completedAt: null },
      { entityId: IDS.projectDeleted, kind: "project", completedAt: null },
      { entityId: IDS.task, kind: "task", completedAt: T(30) },
      { entityId: IDS.taskRecurring, kind: "task", completedAt: null },
    ],
    areaDetails: [
      // One Area has chosen an icon and one has not, so both halves of the
      // nullable column are exercised by every consumer of this fixture.
      {
        entityId: IDS.area,
        archivedAt: null,
        iconKey: "shield",
        updatedAt: T(2),
      },
      {
        entityId: IDS.areaArchived,
        archivedAt: T(20),
        iconKey: null,
        updatedAt: T(20),
      },
    ],
    goalDetails: [
      {
        entityId: IDS.goal,
        targetDate: "2026-12-01",
        definitionOfDone: "Finish under two hours.",
        updatedAt: T(2),
      },
    ],
    projectDetails: [
      {
        entityId: IDS.project,
        status: "active",
        archivedAt: null,
        iconKey: "travel",
        updatedAt: T(2),
      },
      {
        entityId: IDS.projectDeleted,
        status: "on_hold",
        archivedAt: null,
        iconKey: null,
        updatedAt: T(2),
      },
    ],
    taskDetails: [
      {
        entityId: IDS.task,
        status: "todo",
        priority: "p2",
        dueDate: "2026-07-06",
        scheduledDate: "2026-07-06",
        timeSector: "this_week",
        commitmentState: "active",
        delegateTo: null,
        delegatedOn: null,
        followUpOn: null,
        delegateNote: null,
        description: "Easy pace. See [[Training notes]] for the plan.",
        waitingSince: null,
        waitingNote: null,
        updatedAt: T(2),
      },
      {
        entityId: IDS.taskRecurring,
        status: "todo",
        priority: null,
        dueDate: null,
        scheduledDate: "2026-07-05",
        timeSector: null,
        commitmentState: "active",
        delegateTo: null,
        delegatedOn: null,
        followUpOn: null,
        delegateNote: null,
        description: null,
        waitingSince: null,
        waitingNote: null,
        updatedAt: T(2),
      },
    ],
    taskRecurrenceRules: [
      {
        entityId: IDS.taskRecurring,
        dateKind: "scheduled",
        frequency: "week",
        interval: 1,
        weekdays: "sun",
        anchorDay: null,
        anchorMonth: null,
        seriesId: "series-long-run",
        sequence: 3,
        createdAt: T(1),
        updatedAt: T(2),
      },
    ],
    noteDetails: [
      {
        entityId: IDS.noteA,
        content: "First note about training.\n",
        tags: ["running"],
        archivedAt: null,
        updatedAt: T(2),
      },
      {
        entityId: IDS.noteB,
        content: "Second note, same title.\n",
        tags: [],
        archivedAt: null,
        updatedAt: T(2),
      },
      {
        entityId: IDS.noteCase,
        content: "Third note, same title in caps.\n",
        tags: [],
        archivedAt: null,
        updatedAt: T(2),
      },
      {
        entityId: IDS.noteLinks,
        content: LINKED_NOTE_BODY,
        tags: ["index", "knowledge"],
        archivedAt: null,
        updatedAt: T(2),
      },
      {
        entityId: IDS.noteAwkward,
        content: "A title made only of reserved characters.\n",
        tags: [],
        archivedAt: null,
        updatedAt: T(2),
      },
      {
        entityId: IDS.noteUnicode,
        content: "Unicode title.\n",
        tags: [],
        archivedAt: null,
        updatedAt: T(2),
      },
      {
        entityId: IDS.noteLong,
        content: "A very long title.\n",
        tags: [],
        archivedAt: null,
        updatedAt: T(2),
      },
      {
        entityId: IDS.noteArchived,
        content: "Archived body.\n",
        tags: [],
        archivedAt: T(21),
        updatedAt: T(21),
      },
      {
        entityId: IDS.noteDeleted,
        content: "Deleted body.\n",
        tags: [],
        archivedAt: null,
        updatedAt: T(2),
      },
    ],
    diaryEntryDetails: [
      {
        entityId: IDS.diary,
        entryType: "reflection",
        body: "Slept badly, ran anyway.\n",
        occurredAt: T(10),
        timezone: "Australia/Sydney",
        sourceChannel: "manual",
        sourceReference: null,
        updatedAt: T(10),
      },
    ],
    personDetails: [
      {
        entityId: IDS.person,
        preferredName: "Jamie",
        firstName: "Jamie",
        middleName: null,
        lastName: "Rivers",
        pronouns: "they/them",
        organisation: "Runners Club",
        role: "Coach",
        department: null,
        email: "jamie@example.test",
        secondaryEmail: null,
        mobile: "+61 400 000 000",
        workPhone: null,
        address: null,
        website: null,
        birthday: "1990-03-04",
        relationship: "Coach",
        tags: ["running"],
        notes: "Prefers a message the night before.",
        favouriteContactMethod: "message",
        followUpFrequency: "monthly",
        nextFollowUp: "2026-08-01",
        lastInteraction: T(10),
        photoUrl: null,
        archivedAt: null,
        updatedAt: T(2),
      },
    ],
    meetingDetails: [
      {
        entityId: IDS.meeting,
        startsAt: T(11),
        endsAt: T(12),
        timezone: "Australia/Sydney",
        location: "Track",
        mode: "in_person",
        meetingUrl: null,
        status: "completed",
        agendaMarkdown: "- Review week\n",
        notesMarkdown: "Discussed pacing. See [[Training notes]].\n",
        heldAt: T(12),
        archivedAt: null,
        updatedAt: T(12),
      },
    ],
    meetingItems: [
      {
        id: "mi-01",
        meetingId: IDS.meeting,
        kind: "decision",
        bodyMarkdown: "Move the long run to Sunday.",
        position: 0,
        createdAt: T(12),
        updatedAt: T(12),
      },
      {
        id: "mi-02",
        meetingId: IDS.meeting,
        kind: "action",
        bodyMarkdown: "Book a gait analysis.",
        position: 0,
        createdAt: T(12),
        updatedAt: T(12),
      },
    ],
    meetingItemTasks: [
      {
        meetingId: IDS.meeting,
        itemId: "mi-02",
        taskId: IDS.task,
        createdAt: T(12),
      },
    ],
    assetDetails: [
      {
        entityId: IDS.asset,
        assetType: "equipment",
        status: "active",
        description: "Carbon road bike.",
        manufacturer: "Example",
        model: "R1",
        serialNumber: "SN-123",
        referenceCode: null,
        tags: ["cycling"],
        ownerPersonId: IDS.person,
        responsiblePersonId: null,
        location: "Garage",
        areaId: IDS.area,
        acquisitionDate: "2025-01-10",
        purchasePriceMinor: 450000,
        currencyCode: "AUD",
        supplier: "Local shop",
        replacementValueMinor: 500000,
        disposalDate: null,
        disposalNotes: null,
        warrantyExpiry: "2027-01-10",
        serviceInterval: "6 months",
        lastServiceDate: "2026-02-01",
        nextServiceDate: "2026-08-01",
        serviceProvider: "Local shop",
        maintenanceNotes: "Chain wear checked each service.",
        issuer: null,
        referenceNumber: null,
        issueDate: null,
        renewalDate: null,
        url: null,
        documentNotes: null,
        currentMeterValue: 4200,
        currentMeterUnit: "km",
        currentMeterDate: "2026-07-01",
        archivedAt: null,
        updatedAt: T(2),
      },
    ],
    assetEvents: [
      {
        id: "ae-01",
        assetId: IDS.asset,
        category: "service",
        title: "Annual service",
        eventDate: "2026-02-01",
        completedAt: T(13),
        description: "New chain and cassette.",
        provider: "Local shop",
        personId: null,
        costMinor: 18000,
        valueMinor: null,
        currencyCode: "AUD",
        meterValue: 3800,
        meterUnit: "km",
        warrantyExpiry: null,
        nextDueDate: "2026-08-01",
        taskId: null,
        noteId: null,
        obligationId: "ao-01",
        createdAt: T(13),
        updatedAt: T(13),
        archivedAt: null,
        deletedAt: null,
      },
    ],
    assetObligations: [
      {
        id: "ao-01",
        assetId: IDS.asset,
        category: "service",
        title: "Next service",
        description: "Six-monthly service.",
        dueDate: "2026-08-01",
        leadDays: 14,
        recurrenceKind: "months",
        recurrenceInterval: 6,
        meterThreshold: null,
        meterInterval: null,
        meterUnit: null,
        status: "open",
        taskId: null,
        completedEventId: null,
        completedAt: null,
        nextObligationId: null,
        seriesId: "series-service",
        sequence: 1,
        createdAt: T(13),
        updatedAt: T(13),
        archivedAt: null,
        deletedAt: null,
      },
    ],
    reviewDetails: [
      {
        entityId: IDS.review,
        reviewType: "weekly",
        periodStart: "2026-06-29",
        periodEnd: "2026-07-05",
        status: "completed",
        templateId: "review.weekly.v1",
        completedAt: T(14),
        archivedAt: null,
        updatedAt: T(14),
      },
    ],
    reviewSections: [
      {
        reviewId: IDS.review,
        sectionId: "summary.overall",
        bodyMarkdown: "A steady week. See [[Training notes]].",
        updatedAt: T(14),
      },
      {
        reviewId: IDS.review,
        sectionId: "summary.next_focus",
        bodyMarkdown: "",
        updatedAt: T(14),
      },
    ],
    // REVIEW-02 — the guided flow's own rows: a resume bookmark and one step the
    // owner deliberately marked reviewed even though its derived rule was not
    // satisfied. Both must survive an export/restore round trip.
    reviewWorkflowState: [
      {
        reviewId: IDS.review,
        currentStep: "reflection",
        revision: 3,
        updatedAt: T(14),
      },
    ],
    reviewStepAcknowledgements: [
      {
        reviewId: IDS.review,
        stepId: "inbox",
        acknowledgedAt: T(14),
      },
    ],
    // REVIEW-03 — the derived facts a completed Review captured. It cannot be
    // recomputed after the fact, so it must survive a round trip verbatim.
    reviewInsightSnapshots: [
      {
        reviewId: IDS.review,
        version: 1,
        periodStart: "2026-07-27",
        periodEnd: "2026-08-02",
        capturedAt: T(14),
        factsJson:
          '{"version":1,"periodStart":"2026-07-27","periodEnd":"2026-08-02","tasksCompleted":3,"projectsCompleted":0,"goalsCompleted":0,"overdueCarryOver":1,"waitingCarryOver":0,"projects":[],"projectsBounded":false,"goals":[],"goalsBounded":false,"areas":[],"areasBounded":false,"carryOverTaskIds":[],"carryOverTaskIdsBounded":false}',
      },
    ],
    entityLinks: [
      {
        id: "l-01",
        sourceEntityId: IDS.goal,
        targetEntityId: IDS.area,
        type: "goal.belongs_to_area",
        createdAt: T(3),
        updatedAt: T(3),
        deletedAt: null,
      },
      {
        id: "l-02",
        sourceEntityId: IDS.project,
        targetEntityId: IDS.area,
        type: "project.belongs_to_area",
        createdAt: T(3),
        updatedAt: T(3),
        deletedAt: null,
      },
      {
        id: "l-03",
        sourceEntityId: IDS.project,
        targetEntityId: IDS.goal,
        type: "project.advances_goal",
        createdAt: T(3),
        updatedAt: T(3),
        deletedAt: null,
      },
      {
        id: "l-04",
        sourceEntityId: IDS.task,
        targetEntityId: IDS.project,
        type: "task.belongs_to_project",
        createdAt: T(3),
        updatedAt: T(3),
        deletedAt: null,
      },
      {
        id: "l-05",
        sourceEntityId: IDS.taskRecurring,
        targetEntityId: IDS.area,
        type: "task.belongs_to_area",
        createdAt: T(3),
        updatedAt: T(3),
        deletedAt: null,
      },
      {
        id: "l-06",
        sourceEntityId: IDS.meeting,
        targetEntityId: IDS.person,
        type: "meeting.attendee",
        createdAt: T(4),
        updatedAt: T(4),
        deletedAt: null,
      },
      {
        id: "l-07",
        sourceEntityId: IDS.noteLinks,
        targetEntityId: IDS.project,
        type: "note.references",
        createdAt: T(4),
        updatedAt: T(4),
        deletedAt: null,
      },
      {
        id: "l-08",
        sourceEntityId: IDS.project,
        targetEntityId: IDS.noteA,
        type: "link.related",
        createdAt: T(4),
        updatedAt: T(4),
        deletedAt: null,
      },
      {
        // An UNLINKED relationship: exported, marked, and not shown as active.
        id: "l-09",
        sourceEntityId: IDS.noteB,
        targetEntityId: IDS.person,
        type: "link.related",
        createdAt: T(4),
        updatedAt: T(5),
        deletedAt: T(5),
      },
      {
        id: "l-10",
        sourceEntityId: IDS.review,
        targetEntityId: IDS.project,
        type: "link.related",
        createdAt: T(4),
        updatedAt: T(4),
        deletedAt: null,
      },
      {
        id: "l-11",
        sourceEntityId: IDS.asset,
        targetEntityId: IDS.task,
        type: "link.related",
        createdAt: T(4),
        updatedAt: T(4),
        deletedAt: null,
      },
    ],
    activities: [
      {
        id: "a-01",
        type: "entity.created",
        actorType: "user",
        actorId: "owner-subject",
        occurredAt: T(1),
        payload: { entityType: "area" },
      },
      {
        id: "a-02",
        type: "entity_link.created",
        actorType: "user",
        actorId: "owner-subject",
        occurredAt: T(3),
        payload: { linkType: "project.advances_goal" },
      },
      {
        id: "a-03",
        type: "meeting.held",
        actorType: "user",
        actorId: "owner-subject",
        occurredAt: T(12),
        payload: { attendeeCount: 1 },
      },
      {
        id: "a-04",
        type: "task.completed",
        actorType: "system",
        actorId: null,
        occurredAt: T(30),
        payload: {},
      },
    ],
    activitySubjects: [
      { activityId: "a-01", entityId: IDS.area, role: "primary" },
      { activityId: "a-02", entityId: IDS.project, role: "source" },
      { activityId: "a-02", entityId: IDS.goal, role: "target" },
      { activityId: "a-03", entityId: IDS.meeting, role: "primary" },
      { activityId: "a-03", entityId: IDS.person, role: "attendee" },
      { activityId: "a-04", entityId: IDS.task, role: "primary" },
    ],
  });

  return {
    meta: {
      schema: SNAPSHOT_SCHEMA_NAME,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      application: {
        name: "DalyHub",
        version: "2.0.0",
        releaseName: "V2",
        environment: "development",
        buildCommit: null,
      },
      exportedAt: T(100),
      consistency: SNAPSHOT_CONSISTENCY,
    },
    workspace: {
      id: "test-workspace",
      createdAt: T(0),
      updatedAt: T(0),
    },
    owner: {
      preferences: {
        timezone: "Australia/Sydney",
        dateFormat: "d_mmm_yyyy",
        firstDayOfWeek: "monday",
        defaultLandingDestination: "today",
        defaultTasksView: "focus",
        defaultTaskViewId: null,
        defaultTaskDestination: "inbox",
        defaultTaskCaptureParentId: null,
        defaultTaskCaptureParentKind: null,
        defaultDiaryMode: "day",
        navigationConfig: { version: 1, hiddenModuleIds: [] },
        version: 3,
        createdAt: T(0),
        updatedAt: T(2),
      },
      taskSavedViews: [
        {
          id: "sv-01",
          name: "This week",
          configVersion: 1,
          config: { filters: [] },
          createdAt: T(2),
          updatedAt: T(2),
        },
      ],
    },
    records,
    limitations: [],
    ...patch,
  };
}
