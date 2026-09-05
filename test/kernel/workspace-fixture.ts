/**
 * The realistic workspace both the X-04 export suite and the SET-02
 * backup/restore suite are proved against.
 *
 * It is ONE fixture on purpose. The export test asks "does everything come out?"
 * and the restore test asks "does everything go back in, identically?" — two
 * halves of the same claim, and they are only meaningful together if they are
 * about the same workspace. Seeding it here, once, is what stops the round-trip
 * proof quietly drifting onto an easier workspace than the export proof.
 *
 * Deliberately seeded THROUGH THE PRODUCTION REPOSITORIES, not with direct SQL:
 * the point is that backup and restore see what the product actually writes,
 * including the atomic Activity every mutation appends and the structural links
 * the spine creates for itself. The two exceptions (Area archival, workspace
 * membership) are written directly because no repository in scope owns them, and
 * both are commented where they happen.
 */

import { env } from "cloudflare:test";

import {
  ensureWorkspace,
  makeAppPreferencesRepository,
  makeAssetHistoryRepository,
  makeObligationRepository,
  makeAssetRepository,
  makeContext,
  makeCrossViewRepository,
  makeDiaryRepository,
  makeLinkRepository,
  makeMeetingRepository,
  makeMeetingTaskConversionRepository,
  makeNoteDetailsRepository,
  makePersonRepository,
  makeRepository,
  makeReviewRepository,
  makeGoalDetailsRepository,
  makeProjectTemplateRepository,
  makeSpineRepository,
  makeTaskRepository,
  makeTaskViewRepository,
} from "./support";
import { parseTaskViewConfig } from "~/kernel/task-views";
import { parseCrossViewConfig } from "~/kernel/views";

/** The workspace the fixture seeds. */
export const FIXTURE_WORKSPACE = "test-default-workspace";
/** A SECOND workspace, seeded so isolation can be proved rather than assumed. */
export const FIXTURE_OTHER_WORKSPACE = "other-workspace";
/** The authenticated owner the fixture attributes owner-scoped rows to. */
export const FIXTURE_OWNER = "owner-subject";

const WS = FIXTURE_WORKSPACE;
const OTHER_WS = FIXTURE_OTHER_WORKSPACE;
const OWNER = FIXTURE_OWNER;

export interface Seeded {
  readonly areaId: string;
  readonly archivedAreaId: string;
  readonly goalId: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly recurringTaskId: string;
  /**
   * TASKS-12 — a Task carrying an ADVANCED recurrence rule (nth-weekday, a
   * weekend rule and an end condition) AND a dependency, so both survive the
   * export/restore round trip on the same workspace every other proof uses.
   */
  readonly advancedRecurringTaskId: string;
  readonly deletedTaskId: string;
  readonly noteId: string;
  readonly linkingNoteId: string;
  readonly archivedNoteId: string;
  readonly diaryId: string;
  readonly personId: string;
  readonly meetingId: string;
  readonly meetingItemId: string;
  /** The Task the meeting decision was CONVERTED into (AUDIT-13, one operation). */
  readonly followUpTaskId: string;
  readonly assetId: string;
  readonly assetEventId: string;
  readonly obligationId: string;
  readonly reviewId: string;
  /**
   * PROJECT-02 — a Project template, captured from the seeded Project. Present
   * so the export proof and the restore round-trip proof both cover a template
   * and its ordered tasks and steps, rather than proving them separately on an
   * easier workspace.
   */
  readonly templateId: string;
  readonly unlinkedLinkId: string;
  readonly otherWorkspaceEntityId: string;
}

/**
 * Seed a realistic workspace through the production repositories.
 *
 * Deliberately NOT direct SQL: the point of this suite is that the export sees
 * what the product actually writes, including the atomic Activity every mutation
 * appends and the structural links the spine creates for itself.
 */
export async function seedWorkspace(): Promise<Seeded> {
  const context = makeContext(WS);
  const entities = makeRepository(context);
  const spine = makeSpineRepository(context);
  const tasks = makeTaskRepository(context);
  const links = makeLinkRepository(context);
  const noteDetails = makeNoteDetailsRepository(context);
  const diary = makeDiaryRepository(context);
  const people = makePersonRepository(context);
  const meetings = makeMeetingRepository(context);
  const assets = makeAssetRepository(context);
  const assetHistory = makeAssetHistoryRepository(context);
  // V2.10 LIFE-01 — obligations are the shared store's, so the fixture that
  // proves export and restore seeds one there rather than under Assets.
  const obligations = makeObligationRepository(context);
  const reviews = makeReviewRepository(context);
  const preferences = makeAppPreferencesRepository(context);
  const projectTemplates = makeProjectTemplateRepository(context);
  const goalDetails = makeGoalDetailsRepository(context);

  /* The spine ----------------------------------------------------------- */
  const area = await spine.createArea({ title: "Health" });
  const archivedArea = await spine.createArea({ title: "Old side venture" });
  const goal = await spine.createGoal({
    title: "Run a half marathon",
    areaId: area.id,
  });
  /*
   * The Goal-OWNED slice, written through its repository.
   *
   * The fixture created a Goal and no `goal_details` row, so
   * `records.goalDetails` was empty and the restore suite's equality assertion
   * over that collection could never fail — the GOAL-02 measurement columns and
   * IDENTITY-01's identity had no end-to-end D1 export→restore coverage at all.
   * STEER-02 seeds a real row (its own measurement, its own identity and the
   * OWNER's condition) so the round trip is proved rather than assumed, and so
   * dropping a column from the snapshot read fails here.
   */
  await goalDetails.update(goal.id, {
    targetDate: "2026-12-31",
    definitionOfDone: "Cross the line under two hours.",
    measurement: { type: "target_value", baselineValue: 85, targetValue: 70 },
    iconKey: "running",
    colourSlot: "pink",
    condition: "set_aside",
  });
  const project = await spine.createProject({
    title: "12-week training block",
    parent: { kind: "goal", id: goal.id },
  });
  const task = await tasks.createTask({
    title: "Monday: 5km easy run",
    parent: { kind: "project", id: project.id },
    priority: "p2",
    dueDate: "2026-08-03",
    scheduledDate: "2026-08-03",
    timeSector: "this_week",
    /*
     * V2.6 FIND-03 — a TAGGED Task, so the export proof and the restore round
     * trip cover a Task's tags rather than comparing two empty sets.
     *
     * `Running` deliberately shares its identity with the Person's `running`
     * and the Note's `Running`: one vocabulary entry, three record types, which
     * is the claim FIND-02 makes and the one a per-type fixture could not test.
     */
    tags: ["Running", "Errand"],
  });
  const recurringTask = await tasks.createTask({
    title: "Weekly long run",
    parent: { kind: "area", id: area.id },
    scheduledDate: "2026-08-02",
    recurrence: { frequency: "week", dateKind: "scheduled", interval: 1 },
  });
  const deletedTask = await tasks.createTask({
    title: "Abandoned task",
    parent: { kind: "area", id: area.id },
  });
  /*
   * TASKS-13 — a checklist on the recurring Task, one step ticked and one not.
   *
   * Present so the export proof AND the restore round-trip proof both cover
   * `task_checklist_items` with both completion states. Added by PROJECT-02,
   * which found that the restore repository had no `stageRows` branch for this
   * collection at all: every checklist item in an archive was exported
   * faithfully and silently dropped on the way back in. This fixture is the
   * regression coverage for that fix — without a checklist here, the round trip
   * compared two empty collections and passed.
   */
  await tasks.createChecklistItem(recurringTask.id, {
    title: "Lay out kit the night before",
  });
  const secondStep = await tasks.createChecklistItem(recurringTask.id, {
    title: "Fill water bottles",
  });
  await tasks.setChecklistItemCompleted(recurringTask.id, secondStep.id, true);

  /*
   * TASKS-12 — an ADVANCED recurrence rule and a DEPENDENCY, so the export proof
   * and the restore round trip both cover them.
   *
   * The recurrence carries all four TASKS-12 columns plus TASKS-07's mode, which
   * is what catches a snapshot reader that selects the old column list: without a
   * rule that USES them, the round trip compares two sets of nulls and passes
   * while an owner's "last Friday, twelve times" comes back as "every month,
   * forever". (TASKS-07's own two columns were missing from the snapshot for
   * exactly that reason until TASKS-12 added them.)
   */
  const monthlyReview = await tasks.createTask({
    title: "Last Friday review",
    parent: { kind: "area", id: area.id },
    scheduledDate: "2026-08-28",
  });
  await tasks.setTaskRecurrence(monthlyReview.id, {
    frequency: "month",
    dateKind: "scheduled",
    interval: 1,
    weekdays: [5],
    ordinal: "last",
    weekendRule: "before",
    endsAfterCount: 12,
  });
  // A dependency between two Tasks in this workspace: one directed EntityLink,
  // which the archive carries as an ordinary link row.
  await tasks.addTaskDependency(monthlyReview.id, recurringTask.id);

  await spine.complete(task.id);
  await spine.softDelete(deletedTask.id);

  /* Notes ---------------------------------------------------------------- */
  const note = await entities.create({ type: "note", title: "Training notes" });
  await noteDetails.update(note.id, "Base building weeks 1-4.\n");
  await noteDetails.setTags(note.id, ["running"]);

  const linkingNote = await entities.create({
    type: "note",
    title: "Knowledge hub",
  });
  await noteDetails.update(
    linkingNote.id,
    [
      "The plan is [[12-week training block]].",
      "",
      `Stable link: [the goal](dalyhub://goal/${goal.id}).`,
      "",
      "Missing: [[No such record]].",
    ].join("\n"),
  );

  /*
   * V2.6 FIND-02 — two tag facts the export/restore round trip has to carry, and
   * neither of them exists unless this fixture writes it.
   *
   *   1. an ORPHAN vocabulary entry: `Filing` is created here and then removed
   *      from the only Note that carried it, so the workspace holds a word with
   *      no record behind it. A round trip that dropped it would quietly shorten
   *      the owner's tag list every time they emptied a tag, and no assertion
   *      over a per-record `tags` array could ever see it.
   *   2. a SPELLING that differs from another record's: this Note asks for
   *      `Running` where the Person above asked for `running`. One tag, one
   *      identity, and the first spelling wins — which is a claim about the
   *      vocabulary, not about either record.
   *
   * V2.5's STEER-02 review found a deliberate falsifier surviving 210 export
   * tests because this file never wrote the row the assertion compared. These
   * two lines are that lesson applied before the fact.
   */
  await noteDetails.setTags(linkingNote.id, ["Filing", "Running"]);
  await noteDetails.setTags(linkingNote.id, ["Running"]);

  const archivedNote = await entities.create({
    type: "note",
    title: "Put away",
  });
  await noteDetails.update(archivedNote.id, "Archived body.\n");
  await noteDetails.setArchived(archivedNote.id, true);

  /* Diary ---------------------------------------------------------------- */
  const diaryEntry = await diary.create({
    entryType: "reflection",
    title: "Morning reflection",
    body: "Slept badly, ran anyway.\n",
    timezone: "Australia/Sydney",
  });

  /* People and Meetings --------------------------------------------------- */
  const person = await people.create({
    title: "Jamie Rivers",
    firstName: "Jamie",
    lastName: "Rivers",
    pronouns: "they/them",
    email: "jamie@example.test",
    relationship: "mentor",
    tags: ["running"],
    notes: "Prefers a message the night before.",
  });
  const meeting = await meetings.create({
    title: "Coaching catch-up",
    startsAt: "2026-08-01T00:00:00.000Z",
    endsAt: "2026-08-01T01:00:00.000Z",
    timezone: "Australia/Sydney",
    location: "Track",
    mode: "in_person",
    agendaMarkdown: "- Review the week\n",
  });
  await meetings.update(meeting.id, {
    notesMarkdown: "Discussed pacing. See [[Training notes]].\n",
  });
  const decision = await meetings.addItem(
    meeting.id,
    "decision",
    "Move the long run to Sunday.",
  );
  await links.create({
    sourceEntityId: meeting.id,
    targetEntityId: person.id,
    type: "meeting.attendee",
  });
  await meetings.markHeld(meeting.id);
  // AUDIT-13 — the conversion is one atomic operation, so the fixture converts
  // rather than hand-assembling a Task and a mapping row. The Task it produces is
  // a real converted follow-up, exactly as a request would create it.
  const followUp = await makeMeetingTaskConversionRepository(context).convert({
    meetingId: meeting.id,
    itemId: decision.id,
    task: { title: "Move the long run to Sunday", parent: null },
  });

  /* Assets ---------------------------------------------------------------- */
  const asset = await assets.create({
    title: "Road bike",
    assetType: "equipment",
    description: "Carbon road bike.",
    manufacturer: "Example",
    serialNumber: "SN-123",
    currencyCode: "AUD",
    tags: ["cycling"],
  });
  const assetEvent = await assetHistory.recordEvent(asset.id, {
    category: "service",
    title: "Annual service",
    eventDate: "2026-02-01",
    description: "New chain and cassette.",
    cost: "180.00",
    currencyCode: "AUD",
    meterValue: 3800,
    meterUnit: "km",
  });
  const obligation = await obligations.create({
    subjectEntityId: asset.id,
    category: "service",
    title: "Next service",
    dueDate: "2026-09-01",
    recurrenceKind: "months",
    recurrenceInterval: 6,
  });

  /* Reviews --------------------------------------------------------------- */
  const review = await reviews.create({
    type: "weekly",
    periodStart: "2026-07-27",
    periodEnd: "2026-08-02",
  });
  await reviews.updateSection(
    review.review.id,
    "summary.overall",
    "A steady week.",
  );
  // REVIEW-02 — the guided flow's own state: a resume bookmark and one step the
  // owner deliberately marked reviewed. Both must survive the export.
  await reviews.setWorkflowStep(review.review.id, "reflection");
  await reviews.setStepAcknowledged(review.review.id, "inbox", true);
  await reviews.complete(review.review.id);

  /* PROJECT-02 — a Project template ---------------------------------------- */
  /*
   * Built explicitly rather than captured from the seeded Project, because that
   * Project's only Task is COMPLETED and a capture correctly leaves completed
   * work behind — so capturing it would seed an empty template and prove
   * nothing about ordered tasks or steps. Written through the production
   * repository all the same, so the fixture holds exactly the rows the product
   * writes, in the order it writes them.
   */
  const template = await projectTemplates.createTemplate({
    name: "12-week training block",
    description: "The training block, ready to run again.",
    defaultParent: { id: area.id },
  });
  const templateFirst = await projectTemplates.addTask(template.id, {
    title: "Book the race",
    priority: "p2",
  });
  await projectTemplates.addTask(template.id, {
    title: "Plan the long-run days",
  });
  await projectTemplates.addChecklistItem(template.id, templateFirst.id, {
    title: "Check the shoes",
  });

  /* Relationships --------------------------------------------------------- */
  await links.create({
    sourceEntityId: project.id,
    targetEntityId: note.id,
    type: "link.related",
  });
  await links.create({
    sourceEntityId: review.review.id,
    targetEntityId: project.id,
    type: "link.related",
  });
  const unlinked = await links.create({
    sourceEntityId: asset.id,
    targetEntityId: task.id,
    type: "link.related",
  });
  await links.unlink(unlinked.link.id);

  /* Archive the second area ------------------------------------------------ */
  // Area archival lives in `area_details`, which the AreaSettings repository owns.
  await env.DB.prepare(
    `INSERT INTO area_details (workspace_id, entity_id, entity_type, archived_at, updated_at)
     VALUES (?, ?, 'area', ?, ?)
     ON CONFLICT (workspace_id, entity_id) DO UPDATE SET archived_at = excluded.archived_at`,
  )
    .bind(
      WS,
      archivedArea.id,
      "2026-07-20T00:00:00.000Z",
      "2026-07-20T00:00:00.000Z",
    )
    .run();

  /* Owner preferences ------------------------------------------------------ */
  await preferences.update(OWNER, {
    timezone: "Australia/Sydney",
  });

  /* Saved views, of BOTH kinds -------------------------------------------
   * They share one table (X-02), so a fixture holding only one kind would let
   * a restore silently rewrite a cross-module view as a Tasks view and still
   * pass the round trip. One of each makes the `kind` column load-bearing. */
  await makeTaskViewRepository(context).create(OWNER, {
    name: "Overdue P1 work",
    config: parseTaskViewConfig({
      version: 1,
      presentation: "list",
      systemView: "active",
      sort: "due_date",
      direction: "asc",
      groupBy: "parent",
      density: "comfortable",
      filters: { priority: "p1", dueState: "overdue" },
    }),
  });
  await makeCrossViewRepository(context).create(OWNER, {
    name: "Needs a look this week",
    config: parseCrossViewConfig({
      scopes: ["task", "project", "meeting"],
      shared: { attention: true, updatedWithin: "this_week" },
      modules: { project: { health: "at_risk" } },
      sort: "due",
      direction: "asc",
    }),
  });

  /* A SECOND workspace, whose records must never appear ------------------- */
  await ensureWorkspace(OTHER_WS);
  const otherEntities = makeRepository(makeContext(OTHER_WS));
  const other = await otherEntities.create({
    type: "note",
    title: "Another workspace's private note",
  });

  return {
    areaId: area.id,
    archivedAreaId: archivedArea.id,
    goalId: goal.id,
    projectId: project.id,
    taskId: task.id,
    recurringTaskId: recurringTask.id,
    advancedRecurringTaskId: monthlyReview.id,
    deletedTaskId: deletedTask.id,
    noteId: note.id,
    linkingNoteId: linkingNote.id,
    archivedNoteId: archivedNote.id,
    diaryId: diaryEntry.id,
    personId: person.id,
    meetingId: meeting.id,
    meetingItemId: decision.id,
    followUpTaskId: followUp.taskId,
    assetId: asset.id,
    assetEventId: assetEvent.id,
    obligationId: obligation.id,
    reviewId: review.review.id,
    templateId: template.id,
    unlinkedLinkId: unlinked.link.id,
    otherWorkspaceEntityId: other.id,
  };
}
