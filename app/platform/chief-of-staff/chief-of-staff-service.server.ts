import { addCalendarDays } from "~/kernel/datetime";
import {
  buildActivityWriteModel,
  createActivityActorContext,
  secureIdGenerator,
} from "~/kernel/activity";
import {
  evaluateProjectHealth,
  type ProjectHealth,
} from "~/kernel/project-health";
import type {
  ChiefGoalCondition,
  ChiefOfStaffActor,
  ChiefOfStaffRequest,
  ChiefOfStaffResult,
  CompactArea,
  CompactDecision,
  CompactGoal,
  CompactNote,
  CompactPerson,
  CompactProject,
  CompactTask,
  CreateChiefAreaInput,
  CreateChiefGoalInput,
  CreateChiefNoteInput,
  CreateChiefPersonInput,
  CreateChiefProjectInput,
  CreateChiefTaskInput,
  CreateWaitingForInput,
  ListChiefPeopleInput,
  NoteReferenceInput,
  ReferenceMatch,
  TaskReferenceInput,
  UpdateChiefAreaInput,
  UpdateChiefGoalInput,
  UpdateChiefNoteInput,
  UpdateChiefPersonInput,
  UpdateChiefProjectInput,
  UpdateChiefTaskInput,
} from "~/kernel/chief-of-staff";
import type { Person, PersonDetailsInput } from "~/kernel/people";
import type { AreaListItem } from "~/kernel/areas";
import type { DecisionStatus } from "~/kernel/decisions";
import type { TaskFollowUpState } from "~/kernel/tasks";
import type { DecisionRecord } from "~/kernel/decisions";
import type { ProjectOverview } from "~/kernel/projects";
import { parseProjectWorkflowStatus } from "~/kernel/project-settings";
import { isReservedSpineLinkType } from "~/kernel/spine";
import type {
  TaskListItem,
  TaskView,
  WaitingTaskListItem,
} from "~/kernel/tasks";
import { ownerCalendarIso } from "~/shared/datetime";
import {
  bindWorkspaceRepositories,
  createWorkspaceContextResolver,
  type WorkspaceScope,
  type WorkspaceScopeEnv,
} from "~/platform/workspaces/composition";
import { D1ActivityRecorder } from "~/platform/storage/d1/d1-activity-recorder";
import { loadProjectKnowledge } from "~/platform/entity-links/project-knowledge";
import { reconcileNoteReferences } from "~/platform/entity-links/note-references";
import { UNIVERSAL_RELATED_LINK } from "~/platform/entity-links/universal-links";
import { excerptAroundMatch } from "~/platform/markdown/note-document";
import {
  AmbiguousReferenceError,
  duplicateCandidates,
  guardDuplicate,
  PossibleDuplicateError,
  requireReference,
  requireReferences,
  type ReferenceCandidate,
} from "./reference-resolution";

const READ_LIMIT = 50;
const SEARCH_LIMIT = 20;
/** The most relationships one record's context read ever walks. Bounded. */
const RELATED_LINK_LIMIT = 100;
/** The most rows any one list inside a Person/Area/Goal context returns. */
const PERSON_CONTEXT_LIMIT = 20;
const AREA_CONTEXT_LIMIT = 20;

/** DalyHub stores "pursuing" as the absence of a condition (STEER-02). */
function chiefGoalCondition(stored: string | null): ChiefGoalCondition {
  return stored === "set_aside" ? "set_aside" : "pursuing";
}

function matchesGoalState(
  completedAt: Date | null,
  state: "open" | "completed" | "all",
): boolean {
  if (state === "all") return true;
  return state === "completed" ? completedAt !== null : completedAt === null;
}

function compactTask(
  task: TaskListItem | TaskView | WaitingTaskListItem,
): CompactTask {
  const parent = "parent" in task ? task.parent : null;
  const waitingOn =
    task.waiting?.subject.kind === "text"
      ? task.waiting.subject.note
      : (task.waiting?.subject.title ?? null);
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    due: task.dueDate,
    scheduled: task.scheduledDate,
    completedAt: task.completedAt?.toISOString() ?? null,
    project:
      "project" in task && task.project
        ? { id: task.project.id, title: task.project.title }
        : parent?.kind === "project"
          ? { id: parent.id, title: parent.title }
          : null,
    area:
      "area" in task && task.area
        ? { id: task.area.id, title: task.area.title }
        : parent?.kind === "area"
          ? { id: parent.id, title: parent.title }
          : null,
    ...(task.waiting
      ? {
          waitingOn,
          waitingSince: task.waiting.since.toISOString(),
          followUpOn: task.delegation?.followUpOn ?? null,
        }
      : {}),
  };
}

function compactDecision(decision: DecisionRecord): CompactDecision {
  return {
    id: decision.id,
    decision: decision.decision,
    status: decision.status,
    rationale: decision.rationale,
    decisionDate: decision.decisionDate,
    reviewDate: decision.reviewDate,
    related: decision.related,
  };
}

function compactProject(project: ProjectOverview): CompactProject {
  return {
    id: project.id,
    title: project.title,
    status: project.status,
    area: project.area
      ? { id: project.area.id, title: project.area.title }
      : null,
    goal: project.goal
      ? { id: project.goal.id, title: project.goal.title }
      : null,
    completedAt: project.completedAt?.toISOString() ?? null,
    archivedAt: project.archivedAt?.toISOString() ?? null,
  };
}

function compactPerson(person: Person): CompactPerson {
  return {
    id: person.id,
    name: person.title,
    preferredName: person.preferredName,
    role: person.role,
    organisation: person.organisation,
    relationship: person.relationship,
    email: person.email,
    mobile: person.mobile,
    tags: person.tags,
    archived: person.archivedAt !== null,
    nextFollowUp: person.nextFollowUp,
    lastInteraction: person.lastInteraction,
    updatedAt: person.updatedAt.toISOString(),
  };
}

function compactArea(area: AreaListItem): CompactArea {
  return {
    id: area.id,
    title: area.title,
    archived: false,
    goals: {
      total: area.rollup.goals.total,
      completed: area.rollup.goals.completed,
    },
    projects: {
      total: area.rollup.projects.total,
      completed: area.rollup.projects.completed,
      active: area.activeProjectCount,
    },
    tasks: {
      total: area.rollup.tasks.total,
      completed: area.rollup.tasks.completed,
    },
  };
}

/** One (expected entity type, exact id) pair a Note should be filed under. */
type NoteReference = {
  readonly kind: "project" | "area" | "goal" | "person";
  readonly id: string;
  readonly title: string;
};

/**
 * The exact records a Note should be filed under, as (expected type, id) pairs.
 *
 * Every reference is NAMED by the type it must be, so a Project id supplied as
 * `areaId` is a validation failure rather than a silently mis-filed Note. The
 * ids themselves stay untrusted here — {@link resolveNoteReferences} is what
 * proves each one is an active record of that type in this workspace.
 */
type NoteReferenceField = {
  readonly kind: NoteReference["kind"];
  readonly field: string;
  readonly reference: string;
};

function noteReferenceFields(
  input: NoteReferenceInput,
): readonly NoteReferenceField[] {
  const supplied: readonly {
    readonly kind: NoteReference["kind"];
    readonly field: string;
    readonly value: string | null | undefined;
  }[] = [
    { kind: "project", field: "projectId", value: input.projectId },
    { kind: "area", field: "areaId", value: input.areaId },
    { kind: "goal", field: "goalId", value: input.goalId },
    { kind: "person", field: "personId", value: input.personId },
  ];
  return supplied
    .filter((entry) => (entry.value ?? "").trim().length > 0)
    .map(({ kind, field, value }) => ({ kind, field, reference: value! }));
}

/**
 * A Note's EFFECTIVE last-updated moment: the later of its entity timestamp and
 * its content write. The Notes collection computes the same thing; a Note whose
 * only change was its body would otherwise look untouched.
 */
function effectiveNoteUpdatedAt(
  entityUpdatedAt: Date,
  contentUpdatedAt: Date | null,
): Date {
  return contentUpdatedAt !== null && contentUpdatedAt > entityUpdatedAt
    ? contentUpdatedAt
    : entityUpdatedAt;
}

/** The most Notes `get_project` returns as Project knowledge. Bounded on purpose. */
const PROJECT_NOTE_LIMIT = 10;
/** The most Note body characters `get_note` returns. Bounded on purpose. */
const NOTE_CONTENT_LIMIT = 20_000;

/**
 * One mixed search hit. Every row names its entity type, its exact id and a
 * title; the rest is whatever that type usefully adds.
 */
type SearchResultRow = {
  readonly type: string;
  readonly id: string;
  readonly title: string;
  readonly [key: string]: unknown;
};

/**
 * Fill a bounded result set by taking one hit from each entity type in turn.
 *
 * Concatenating the per-type lists and truncating would let one prolific type
 * eat the whole budget — ten matching Tasks would hide every matching Note and
 * Decision — which is exactly the failure that makes Claude create a duplicate
 * of something the owner already has. Round-robin keeps each type represented
 * while the cap stays hard, and ordering stays deterministic: the per-type
 * queries are each deterministically ordered and consumed in a fixed order.
 */
function interleaveByType(
  groups: readonly (readonly SearchResultRow[])[],
  total: number,
): readonly SearchResultRow[] {
  const results: SearchResultRow[] = [];
  const longest = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < longest && results.length < total; index += 1) {
    for (const group of groups) {
      if (results.length >= total) break;
      const hit = group[index];
      if (hit !== undefined) results.push(hit);
    }
  }
  return results;
}

function boundedLimit(value: number | undefined, maximum = READ_LIMIT): number {
  if (value === undefined) return Math.min(25, maximum);
  if (!Number.isInteger(value) || value < 1)
    throw new Error("limit must be a positive integer");
  return Math.min(value, maximum);
}

/**
 * Resolve a Project/Area reference to the exact record it names.
 *
 * Both fields accept an exact id OR a human-readable name (see
 * `reference-resolution`), so "the OpO project" no longer has to be turned into
 * an id by a separate round trip. What has NOT changed is the guarantee: an
 * unresolvable or ambiguous reference writes nothing at all.
 */
async function resolveRelation(
  scope: WorkspaceScope,
  input: TaskReferenceInput,
): Promise<{ readonly kind: "project" | "area"; readonly id: string } | null> {
  if (input.projectId && input.areaId)
    throw new Error("Choose either projectId or areaId, not both");
  if (input.projectId) {
    const match = await requireReference(
      scope,
      "project",
      "projectId",
      input.projectId,
    );
    return { kind: "project", id: match.id };
  }
  if (input.areaId) {
    const match = await requireReference(scope, "area", "areaId", input.areaId);
    return { kind: "area", id: match.id };
  }
  return null;
}

/** De-duplicate candidate records by id, preserving first-seen order. */
function uniqueCandidates(
  groups: readonly (readonly ReferenceCandidate[])[],
): readonly ReferenceCandidate[] {
  const seen = new Set<string>();
  const result: ReferenceCandidate[] = [];
  for (const group of groups) {
    for (const candidate of group) {
      if (seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      result.push(candidate);
    }
  }
  return result;
}

function captureBody(input: {
  readonly text?: string | null;
  readonly source?: string | null;
  readonly context?: string | null;
}): string | null {
  const lines = [
    input.text?.trim(),
    input.context?.trim(),
    input.source?.trim() ? `Source: ${input.source.trim()}` : null,
  ].filter((value): value is string => Boolean(value));
  return lines.length === 0 ? null : lines.join("\n\n");
}

class McpActivityAudit {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #recorder: D1ActivityRecorder;

  constructor(db: D1Database, workspaceId: string) {
    this.#db = db;
    this.#workspaceId = workspaceId;
    this.#recorder = new D1ActivityRecorder(db);
  }

  async record(input: {
    readonly actor: ChiefOfStaffActor;
    readonly action: string;
    readonly entityType: string;
    readonly entityId: string;
    readonly summary: string;
  }): Promise<void> {
    const actor = createActivityActorContext({
      type: "mcp",
      id: input.actor.subject,
    });
    const now = new Date();
    const model = buildActivityWriteModel(
      {
        type: "mcp.mutation",
        subjects: [{ entityId: input.entityId, role: "subject" }],
        payload: {
          source: "claude_mcp",
          action: input.action,
          entityType: input.entityType,
          summary: input.summary.slice(0, 512),
          requestId: input.actor.requestId.slice(0, 128),
        },
      },
      actor.actor,
      secureIdGenerator(),
      now,
    );
    await this.#db.batch(
      this.#recorder.buildStandaloneAppendStatements(this.#workspaceId, model),
    );
  }
}

export class DalyHubChiefOfStaffService {
  readonly #scope: WorkspaceScope;
  readonly #audit: McpActivityAudit;
  readonly #now: Date;

  constructor(scope: WorkspaceScope, db: D1Database, now = new Date()) {
    this.#scope = scope;
    this.#audit = new McpActivityAudit(db, scope.context.workspaceId);
    this.#now = now;
  }

  async invoke(request: ChiefOfStaffRequest): Promise<ChiefOfStaffResult> {
    switch (request.action) {
      case "get_chief_of_staff_context":
        return this.getChiefOfStaffContext();
      case "get_weekly_review_context":
        return this.getWeeklyReviewContext();
      case "get_today":
        return this.getToday();
      case "get_projects":
        return this.getProjects(request.input);
      case "get_project":
        return this.getProject(request.input.projectId);
      case "search_dalyhub":
        return this.search(request.input.query, request.input.limit);
      case "capture_item":
        throw new Error(
          "capture_item must be invoked through invokeChiefOfStaff",
        );
      case "get_note":
        return this.getNote(request.input.noteId);
      case "create_task":
        return this.createTask(request.input, request.actor, "create_task");
      case "update_task":
        return this.updateTask(request.input, request.actor);
      case "complete_task":
        return this.completeTask(request.input.taskId, request.actor);
      case "create_project":
        return this.createProject(request.input, request.actor);
      case "update_project":
        return this.updateProject(request.input, request.actor);
      case "create_note":
        return this.createNote(request.input, request.actor);
      case "update_note":
        return this.updateNote(request.input, request.actor);
      case "record_decision":
        return this.recordDecision(request.input, request.actor);
      case "create_waiting_for":
        return this.createWaitingFor(
          request.input,
          request.actor,
          "create_waiting_for",
        );
      case "resolve_waiting_for":
        return this.resolveWaitingFor(request.input.taskId, request.actor);
      case "reopen_task":
        return this.reopenTask(request.input.taskId, request.actor);
      case "get_people":
        return this.getPeople(request.input);
      case "get_person":
        return this.getPerson(request.input.personId);
      case "create_person":
        return this.createPerson(request.input, request.actor);
      case "update_person":
        return this.updatePerson(request.input, request.actor);
      case "get_areas":
        return this.getAreas(request.input);
      case "get_area":
        return this.getArea(request.input.areaId);
      case "create_area":
        return this.createArea(request.input, request.actor);
      case "update_area":
        return this.updateArea(request.input, request.actor);
      case "get_goals":
        return this.getGoals(request.input);
      case "get_goal":
        return this.getGoal(request.input.goalId);
      case "create_goal":
        return this.createGoal(request.input, request.actor);
      case "update_goal":
        return this.updateGoal(request.input, request.actor);
      case "get_notes":
        return this.getNotes(request.input);
      case "get_decisions":
        return this.getDecisions(request.input);
      case "get_waiting_for":
        return this.getWaitingFor(request.input);
    }
  }

  async #dateContext() {
    const [todayIso, timezone] = await Promise.all([
      this.#scope.ownerTodayIso(this.#now),
      this.#scope.ownerTimeZone(),
    ]);
    return { todayIso, timezone };
  }

  async getToday(): Promise<ChiefOfStaffResult> {
    const { todayIso, timezone } = await this.#dateContext();
    const [today, overdue, waiting] = await Promise.all([
      this.#scope.tasks.listWorkspaceTasks({
        view: "today",
        todayIso,
        timezone,
        limit: READ_LIMIT,
      }),
      this.#scope.tasks.listWorkspaceTasks({
        view: "overdue",
        todayIso,
        timezone,
        limit: READ_LIMIT,
      }),
      this.#scope.tasks.listWaitingTasks({
        todayIso,
        followUp: "due",
        limit: READ_LIMIT,
      }),
    ]);
    return {
      asOf: this.#now.toISOString(),
      timezone,
      today: today.items.map(compactTask),
      overdue: overdue.items.map(compactTask),
      waitingFollowUpsDue: waiting.items.map(compactTask),
      truncated: {
        today: today.nextCursor !== null,
        overdue: overdue.nextCursor !== null,
        waiting: waiting.nextCursor !== null,
      },
    };
  }

  async #projectSummaries(limit = READ_LIMIT) {
    const { todayIso, timezone } = await this.#dateContext();
    const page = await this.#scope.projects.listProjects({
      state: "open",
      limit,
    });
    const facts = await this.#scope.projectHealth.listProjectHealthFacts(
      page.items.map((project) => project.id),
      todayIso,
    );
    const next = await this.#scope.tasks.listProjectNextActions({
      projectIds: page.items.map((project) => project.id),
      todayIso,
      timezone,
    });
    return page.items.map((project) => {
      const projectFacts = facts.get(project.id);
      const health: ProjectHealth | null = projectFacts
        ? evaluateProjectHealth(projectFacts, {
            now: this.#now,
            todayIso,
            calendarIsoOf: (instant) => ownerCalendarIso(instant, timezone),
          })
        : null;
      return {
        id: project.id,
        title: project.title,
        status: project.status,
        area: project.area,
        goal: project.goal,
        progress: {
          completed: project.taskCompleted,
          total: project.taskTotal,
        },
        health: health
          ? {
              state: health.state,
              reasons: health.reasons.map((reason) => reason.summary),
              lastActivityDate: health.summary.lastActivityDate,
            }
          : null,
        nextActions: next.has(project.id)
          ? [compactTask(next.get(project.id)!)]
          : [],
      };
    });
  }

  async getChiefOfStaffContext(): Promise<ChiefOfStaffResult> {
    const { todayIso, timezone } = await this.#dateContext();
    const fourteenDays = addCalendarDays(todayIso, 14);
    const [
      today,
      overdue,
      upcoming,
      waiting,
      decisions,
      projects,
      goals,
      recentCompleted,
      recentActivity,
      recentNotes,
    ] = await Promise.all([
      this.#scope.tasks.listWorkspaceTasks({
        view: "today",
        todayIso,
        timezone,
        limit: READ_LIMIT,
      }),
      this.#scope.tasks.listWorkspaceTasks({
        view: "overdue",
        todayIso,
        timezone,
        limit: READ_LIMIT,
      }),
      this.#scope.tasks.listWorkspaceTasks({
        view: "open",
        filters: { dueFrom: addCalendarDays(todayIso, 1), dueTo: fourteenDays },
        todayIso,
        timezone,
        limit: READ_LIMIT,
      }),
      this.#scope.tasks.listWaitingTasks({ todayIso, limit: READ_LIMIT }),
      this.#scope.decisions.list({ status: "open", limit: 25 }),
      this.#projectSummaries(),
      this.#scope.goals.listGoals({ limit: 25 }),
      this.#scope.tasks.listWorkspaceTasks({
        view: "completed",
        filters: { completedWithin: "7d" },
        sort: "completed",
        todayIso,
        timezone,
        limit: 25,
      }),
      this.#scope.activity.listForWorkspace({ limit: 50 }),
      this.#scope.entities.listRecentByType("note", 10),
    ]);
    const staleProjects = projects.filter((project) => {
      const health = project.health as { readonly state?: string } | null;
      return health?.state === "stale";
    });
    const mcpCaptures = recentActivity.items
      .filter(
        (event) => event.actor.type === "mcp" && event.type === "mcp.mutation",
      )
      .filter((event) => event.payload.action === "capture_item")
      .slice(0, 10)
      .map((event) => ({
        id:
          event.subjects.find((subject) => subject.role === "subject")
            ?.entityId ?? null,
        at: event.occurredAt.toISOString(),
        type:
          typeof event.payload.entityType === "string"
            ? event.payload.entityType
            : "capture",
        summary:
          typeof event.payload.summary === "string"
            ? event.payload.summary
            : "Captured in DalyHub",
      }));
    const capturedIds = new Set(
      mcpCaptures.map((capture) => capture.id).filter(Boolean),
    );
    return {
      asOf: this.#now.toISOString(),
      timezone,
      today: today.items.map(compactTask),
      overdue: overdue.items.map(compactTask),
      upcoming: upcoming.items.map(compactTask),
      activeProjects: projects,
      staleProjects,
      waitingFor: waiting.items.map(compactTask),
      // The current kernel models outbound waiting/delegation, not inbound
      // assignees. An empty answer is more truthful than reversing that meaning.
      peopleWaitingOnMe: [],
      unresolvedDecisions: decisions.map(compactDecision),
      recentCaptures: [
        ...mcpCaptures,
        ...recentNotes
          .filter((note) => !capturedIds.has(note.id))
          .map((note) => ({
            id: note.id,
            type: "note",
            summary: note.title,
            at: note.createdAt.toISOString(),
          })),
      ]
        .sort((left, right) => right.at.localeCompare(left.at))
        .slice(0, 10),
      recentlyCompleted: recentCompleted.items.map(compactTask),
      importantDeadlines: [...overdue.items, ...upcoming.items]
        .filter((task) => task.dueDate !== null)
        .slice(0, 30)
        .map(compactTask),
      relevantGoals: goals.items
        .filter((goal) => goal.completedAt === null)
        .map((goal) => ({
          id: goal.id,
          title: goal.title,
          area: goal.area,
          updatedAt: goal.updatedAt.toISOString(),
        })),
    };
  }

  async getWeeklyReviewContext(): Promise<ChiefOfStaffResult> {
    const { todayIso, timezone } = await this.#dateContext();
    const weekStart = addCalendarDays(todayIso, -6);
    const [
      completed,
      created,
      commitments,
      overdue,
      waiting,
      decisions,
      projects,
      upcoming,
    ] = await Promise.all([
      this.#scope.tasks.listWorkspaceTasks({
        view: "completed",
        filters: { completedFrom: weekStart, completedTo: todayIso },
        sort: "completed",
        todayIso,
        timezone,
        limit: READ_LIMIT,
      }),
      this.#scope.tasks.listWorkspaceTasks({
        view: "all",
        filters: { createdWithin: "7d" },
        sort: "created",
        direction: "desc",
        todayIso,
        timezone,
        limit: READ_LIMIT,
      }),
      this.#scope.tasks.listWorkspaceTasks({
        view: "open",
        todayIso,
        timezone,
        limit: READ_LIMIT,
      }),
      this.#scope.tasks.listWorkspaceTasks({
        view: "overdue",
        todayIso,
        timezone,
        limit: READ_LIMIT,
      }),
      this.#scope.tasks.listWaitingTasks({ todayIso, limit: READ_LIMIT }),
      this.#scope.decisions.list({ status: "open", limit: 25 }),
      this.#projectSummaries(),
      this.#scope.tasks.listWorkspaceTasks({
        view: "open",
        filters: {
          dueFrom: addCalendarDays(todayIso, 1),
          dueTo: addCalendarDays(todayIso, 14),
        },
        todayIso,
        timezone,
        limit: READ_LIMIT,
      }),
    ]);
    return {
      asOf: this.#now.toISOString(),
      timezone,
      window: { from: weekStart, to: todayIso },
      completed: completed.items.map(compactTask),
      created: created.items.map(compactTask),
      incompleteCommitments: commitments.items.map(compactTask),
      overdue: overdue.items.map(compactTask),
      waiting: waiting.items.map(compactTask),
      unresolvedDecisions: decisions.map(compactDecision),
      activeProjects: projects,
      staleProjects: projects.filter(
        (project) =>
          (project.health as { readonly state?: string } | null)?.state ===
          "stale",
      ),
      upcoming14Days: upcoming.items.map(compactTask),
      carriedOver: commitments.items
        .filter(
          (task) =>
            task.scheduledDate !== null && task.scheduledDate < weekStart,
        )
        .map(compactTask),
    };
  }

  async getProjects(input?: {
    readonly status?: "active" | "planned" | "on_hold";
    readonly limit?: number;
  }) {
    const projects = await this.#projectSummaries(boundedLimit(input?.limit));
    return {
      projects: input?.status
        ? projects.filter((project) => project.status === input.status)
        : projects,
    };
  }

  async getProject(reference: string): Promise<ChiefOfStaffResult> {
    const match = await requireReference(
      this.#scope,
      "project",
      "projectId",
      reference,
    );
    const projectId = match.id;
    const project = await this.#scope.projects.getProjectOverview(projectId);
    if (project === null) throw new Error("Project not found");
    const { todayIso, timezone } = await this.#dateContext();
    const [tasks, facts, activity, decisions, next, knowledge] =
      await Promise.all([
        this.#scope.tasks.listProjectTasks(projectId, {
          state: "open",
          limit: READ_LIMIT,
        }),
        this.#scope.projectHealth.getProjectHealthFacts(projectId, todayIso),
        this.#scope.activity.listForEntity(projectId, { limit: 20 }),
        this.#scope.decisions.list({
          relatedEntityId: projectId,
          limit: READ_LIMIT,
        }),
        this.#scope.tasks.listProjectNextActions({
          projectIds: [projectId],
          todayIso,
          timezone,
        }),
        // PROJ-03 Project Knowledge: the Notes explicitly linked to this
        // Project, bounded — never a whole note history.
        loadProjectKnowledge(this.#scope, projectId, {
          limit: PROJECT_NOTE_LIMIT,
        }),
      ]);
    const health = facts
      ? evaluateProjectHealth(facts, {
          now: this.#now,
          todayIso,
          calendarIsoOf: (instant) => ownerCalendarIso(instant, timezone),
        })
      : null;
    const open = tasks.items.map(compactTask);
    return {
      project: {
        id: project.id,
        title: project.title,
        status: project.status,
        area: project.area,
        goal: project.goal,
        health,
      },
      nextActions: next.has(projectId)
        ? [compactTask(next.get(projectId)!)]
        : [],
      openTasks: open,
      waiting: open.filter((task) => task.waitingSince !== undefined),
      decisions: decisions
        .filter(
          (decision) =>
            decision.related?.kind === "project" &&
            decision.related.id === projectId,
        )
        .map(compactDecision),
      notes: knowledge.notes.slice(0, PROJECT_NOTE_LIMIT).map((note) => ({
        id: note.id,
        title: note.title,
        archived: note.archived,
        excerpt: note.excerpt,
        linkedAt: note.linkedAt,
      })),
      deadlines: open.filter((task) => task.due !== null),
      recentActivity: activity.items.map((event) => ({
        type: event.type,
        at: event.occurredAt.toISOString(),
        // The kernel's own contract keeps a payload small and structured —
        // "only the information needed to describe the change". It is named for
        // what it is rather than passed off as a prose summary.
        details: event.payload,
      })),
      truncated: {
        tasks: tasks.nextCursor !== null,
        activity: activity.hasMore,
        notes:
          knowledge.nextCursor !== null ||
          knowledge.notes.length > PROJECT_NOTE_LIMIT,
      },
    };
  }

  async search(query: string, limit?: number): Promise<ChiefOfStaffResult> {
    const text = query.trim();
    if (text.length === 0 || text.length > 200)
      throw new Error("query must be 1-200 characters");
    const total = boundedLimit(limit, SEARCH_LIMIT);
    const each = Math.max(1, Math.min(10, total));
    const [tasks, projects, goals, areas, notes, decisions, people] =
      await Promise.all([
        this.#scope.tasks.searchTasks({ text, limit: each }),
        this.#scope.projects.searchProjects({ text, limit: each }),
        this.#scope.goals.searchGoals({ text, limit: each }),
        this.#scope.areas.searchAreas({ text, limit: each }),
        this.#scope.notes.search({ text, limit: each }),
        this.#scope.decisions.search({ text, limit: each }),
        this.#scope.people.list({ query: text, status: "active", limit: each }),
      ]);
    return {
      query: text,
      results: interleaveByType(
        [
          tasks.map((item) => ({
            type: "task",
            ...compactTask(item),
            match: item.matchSource,
            excerpt: item.excerpt,
          })),
          projects.map((item) => ({
            type: "project",
            id: item.id,
            title: item.title,
            status: item.status,
            area: item.area,
            goal: item.goal,
          })),
          goals.map((item) => ({
            type: "goal",
            id: item.id,
            title: item.title,
            area: item.area,
            targetDate: item.targetDate,
          })),
          areas.map((item) => ({
            type: "area",
            id: item.id,
            title: item.title,
            matchedOn: "name",
          })),
          // People join the one search because the whole point of a
          // Chief of Staff naming a Person is being able to find them: an
          // interface that can file a Note on John but cannot find John makes
          // the owner do the lookup. Archived People are excluded, as archived
          // Projects and Areas already are.
          people.items.map((item) => ({
            type: "person",
            id: item.id,
            title: item.title,
            subtitle: item.organisation ?? item.role ?? null,
            matchedOn: "name",
          })),
          notes.map((item) => ({
            type: "note",
            id: item.id,
            title: item.title,
            match: item.matchSource,
            excerpt: item.excerpt,
          })),
          decisions.map((item) => ({
            type: "decision",
            // `title` so every row in the mixed result set answers the same
            // three questions — what kind, which exact id, what is it called.
            title: item.decision,
            ...compactDecision(item),
          })),
        ] satisfies readonly (readonly SearchResultRow[])[],
        total,
      ),
    };
  }

  async createTask(
    input: CreateChiefTaskInput,
    actor: ChiefOfStaffActor,
    action: string,
  ) {
    const parent = await this.#relation(input);
    const person = input.personId
      ? await requireReference(
          this.#scope,
          "person",
          "personId",
          input.personId,
        )
      : null;
    const task = await this.#scope.tasks.createTask({
      title: input.title,
      parent,
      priority: input.priority,
      dueDate: input.dueDate,
      scheduledDate: input.scheduledDate,
      status: input.status,
      description: input.notes,
    });
    if (person !== null) await this.#relatePerson(task.id, person.id);
    await this.#audit.record({
      actor,
      action,
      entityType: "task",
      entityId: task.id,
      summary: `Created task: ${task.title}`,
    });
    return {
      task: compactTask(task),
      ...(person === null
        ? {}
        : { person: { id: person.id, name: person.title } }),
    };
  }

  async updateTask(input: UpdateChiefTaskInput, actor: ChiefOfStaffActor) {
    const { id: taskId } = await requireReference(
      this.#scope,
      "task",
      "taskId",
      input.taskId,
    );
    const result = await this.#scope.tasks.updateTask(taskId, {
      title: input.title,
      description: input.notes,
      dueDate: input.dueDate,
      scheduledDate: input.scheduledDate,
      priority: input.priority,
      status: input.status,
    });
    const parentSpecified =
      input.projectId !== undefined || input.areaId !== undefined;
    const parentResult = parentSpecified
      ? await this.#scope.tasks.setTaskParent(
          taskId,
          await this.#relation(input),
        )
      : null;
    const task = parentResult?.task ?? result.task;
    let changed = result.changed || (parentResult?.changed ?? false);
    if (input.personId) {
      const person = await requireReference(
        this.#scope,
        "person",
        "personId",
        input.personId,
      );
      changed = (await this.#relatePerson(task.id, person.id)) || changed;
    }
    if (changed) {
      await this.#audit.record({
        actor,
        action: "update_task",
        entityType: "task",
        entityId: task.id,
        summary: `Updated task: ${task.title}`,
      });
    }
    return { task: compactTask(task), changed };
  }

  async completeTask(reference: string, actor: ChiefOfStaffActor) {
    const { id: taskId } = await requireReference(
      this.#scope,
      "task",
      "taskId",
      reference,
    );
    const result = await this.#scope.tasks.completeTask(taskId, {
      ownerTodayIso: await this.#scope.ownerTodayIso(this.#now),
    });
    if (result.changed) {
      await this.#audit.record({
        actor,
        action: "complete_task",
        entityType: "task",
        entityId: taskId,
        summary: `Completed task: ${result.task.title}`,
      });
    }
    return { task: compactTask(result.task), changed: result.changed };
  }

  /**
   * Prove every supplied Note reference is an ACTIVE record of the NAMED type in
   * this workspace, BEFORE anything is written. A missing, soft-deleted,
   * wrong-type or cross-workspace id is refused here; `entities.getById` is
   * workspace-bound, so a cross-workspace id is indistinguishable from absent
   * and nothing about it is disclosed.
   */
  async #resolveNoteReferences(
    input: NoteReferenceInput,
  ): Promise<readonly NoteReference[]> {
    const resolved: NoteReference[] = [];
    for (const { kind, field, reference } of noteReferenceFields(input)) {
      const match = await requireReference(this.#scope, kind, field, reference);
      resolved.push({ kind, id: match.id, title: match.title });
    }
    return resolved;
  }

  /** Resolve a Project/Area reference pair against this workspace. */
  async #relation(input: TaskReferenceInput) {
    return resolveRelation(this.#scope, input);
  }

  /**
   * Relate a Person to a record through the ONE universal relationship.
   *
   * `link.related` with the WORK record as the source is what the shared Linked
   * Items surface already draws on both sides, and what PEOPLE-03's
   * relationship facts already count — so a Person related here is related in
   * the app, not in a private MCP association. Idempotent by the kernel's
   * `(workspace, source, target, type)` identity.
   */
  async #relatePerson(recordId: string, personId: string): Promise<boolean> {
    const result = await this.#scope.entityLinks.create({
      sourceEntityId: recordId,
      targetEntityId: personId,
      type: UNIVERSAL_RELATED_LINK,
    });
    return result.outcome !== "already_exists";
  }

  /**
   * File a Note against each resolved reference using the module-agnostic
   * `link.related` type — the SAME relationship `linkNoteToProject` (PROJ-03)
   * and the shared Linked Items picker create, with the record as the source.
   * Deliberately NOT `note.references`, which is DERIVED from the note's body
   * and reconciled away on the owner's next save in the app.
   *
   * Idempotent by the kernel's `(workspace, source, target, type)` identity: a
   * repeated call returns the existing link, or restores a removed one in place.
   */
  async #linkNote(
    noteId: string,
    references: readonly NoteReference[],
  ): Promise<boolean> {
    let changed = false;
    for (const reference of references) {
      const result = await this.#scope.entityLinks.create({
        sourceEntityId: reference.id,
        targetEntityId: noteId,
        type: UNIVERSAL_RELATED_LINK,
      });
      // `already_exists` is the kernel's idempotent no-op; only a genuinely new
      // or restored relationship is a change worth reporting or auditing.
      if (result.outcome !== "already_exists") changed = true;
    }
    return changed;
  }

  /** One Note's compact summary: identity, tags, archive state and an excerpt. */
  async #noteSummary(noteId: string): Promise<CompactNote | null> {
    const [entity, details, windows] = await Promise.all([
      this.#scope.entities.getById(noteId),
      this.#scope.noteDetails.get(noteId),
      this.#scope.notes.loadContextWindows([noteId], ""),
    ]);
    if (entity === null || entity.type !== "note") return null;
    return {
      id: noteId,
      title: entity.title,
      tags: details?.tags ?? [],
      archived: details?.archivedAt != null,
      excerpt: excerptAroundMatch(windows.get(noteId)?.window ?? "", ""),
      updatedAt: effectiveNoteUpdatedAt(
        entity.updatedAt,
        details?.contentUpdatedAt ?? null,
      ).toISOString(),
    };
  }

  async getNote(reference: string): Promise<ChiefOfStaffResult> {
    const { id: noteId } = await requireReference(
      this.#scope,
      "note",
      "noteId",
      reference,
    );
    const entity = await this.#scope.entities.getById(noteId);
    const details = await this.#scope.noteDetails.get(noteId);
    if (entity === null || entity.type !== "note" || details === null) {
      throw new Error("Note not found");
    }
    const content = details.content;
    return {
      note: {
        id: noteId,
        title: entity.title,
        tags: details.tags,
        archived: details.archivedAt !== null,
        content: content.slice(0, NOTE_CONTENT_LIMIT),
        contentTruncated: content.length > NOTE_CONTENT_LIMIT,
        createdAt: entity.createdAt.toISOString(),
        updatedAt: effectiveNoteUpdatedAt(
          entity.updatedAt,
          details.contentUpdatedAt,
        ).toISOString(),
      },
    };
  }

  async createProject(
    input: CreateChiefProjectInput,
    actor: ChiefOfStaffActor,
  ): Promise<ChiefOfStaffResult> {
    if (Boolean(input.areaId) === Boolean(input.goalId)) {
      throw new Error(
        "A Project needs exactly one parent: supply either areaId or goalId",
      );
    }
    const parentMatch = input.goalId
      ? await requireReference(this.#scope, "goal", "goalId", input.goalId)
      : await requireReference(this.#scope, "area", "areaId", input.areaId!);
    const parent = input.goalId
      ? ({ kind: "goal", id: parentMatch.id } as const)
      : ({ kind: "area", id: parentMatch.id } as const);
    const people = await requireReferences(
      this.#scope,
      "person",
      "personIds",
      input.personIds,
    );
    guardDuplicate(
      "project",
      input.title,
      await duplicateCandidates(this.#scope, "project", input.title),
      { allowDuplicate: input.allowDuplicate },
    );
    const created = await this.#scope.spine.createProject({
      title: input.title,
      parent,
    });
    for (const person of people)
      await this.#relatePerson(created.id, person.id);
    if (input.status !== undefined) {
      await this.#scope.projectSettings.setStatus(
        created.id,
        parseProjectWorkflowStatus(input.status),
      );
    }
    await this.#audit.record({
      actor,
      action: "create_project",
      entityType: "project",
      entityId: created.id,
      summary: `Created project: ${created.title}`,
    });
    const overview = await this.#scope.projects.getProjectOverview(created.id);
    return {
      project: overview
        ? compactProject(overview)
        : { id: created.id, title: created.title },
    };
  }

  async updateProject(
    input: UpdateChiefProjectInput,
    actor: ChiefOfStaffActor,
  ): Promise<ChiefOfStaffResult> {
    if (input.areaId && input.goalId) {
      throw new Error("Choose either areaId or goalId, not both");
    }
    // Fail closed on an unknown/cross-workspace/non-project reference BEFORE any
    // write, so a wrong one can never rename or restatus another kind of record.
    const target = await requireReference(
      this.#scope,
      "project",
      "projectId",
      input.projectId,
    );
    const projectId = target.id;
    const destination = input.goalId
      ? await requireReference(this.#scope, "goal", "goalId", input.goalId)
      : input.areaId
        ? await requireReference(this.#scope, "area", "areaId", input.areaId)
        : null;
    const people = await requireReferences(
      this.#scope,
      "person",
      "personIds",
      input.personIds,
    );
    const existing = await this.#scope.projects.getProjectOverview(projectId);
    if (existing === null) throw new Error("Project not found");

    let changed = false;
    if (input.title !== undefined) {
      const renamed = await this.#scope.spine.rename(projectId, input.title);
      changed = changed || renamed.title !== existing.title;
    }
    if (input.status !== undefined) {
      const result = await this.#scope.projectSettings.setStatus(
        projectId,
        parseProjectWorkflowStatus(input.status),
      );
      changed = changed || result.changed;
    }
    if (destination !== null) {
      const moved = await this.#scope.spine.move(projectId, {
        kind: input.goalId ? "goal" : "area",
        id: destination.id,
      });
      changed = changed || moved.changed;
    }
    if (input.completed !== undefined) {
      const result = input.completed
        ? await this.#scope.spine.complete(projectId)
        : await this.#scope.spine.reopen(projectId);
      changed = changed || result.changed;
    }
    if (input.archived !== undefined) {
      const result = input.archived
        ? await this.#scope.projectSettings.archive(projectId)
        : await this.#scope.projectSettings.restore(projectId);
      changed = changed || result.changed;
    }
    for (const person of people) {
      changed = (await this.#relatePerson(projectId, person.id)) || changed;
    }
    if (changed) {
      await this.#audit.record({
        actor,
        action: "update_project",
        entityType: "project",
        entityId: projectId,
        summary: `Updated project: ${input.title ?? existing.title}`,
      });
    }
    const overview = await this.#scope.projects.getProjectOverview(projectId);
    return {
      project: overview ? compactProject(overview) : compactProject(existing),
      changed,
    };
  }

  async createNote(
    input: CreateChiefNoteInput,
    actor: ChiefOfStaffActor,
  ): Promise<ChiefOfStaffResult> {
    const references = await this.#resolveNoteReferences(input);
    const note = await this.#scope.entities.create({
      type: "note",
      title: input.title,
    });
    try {
      const body = input.content?.trim() ?? "";
      if (body.length > 0) {
        await this.#scope.noteDetails.update(note.id, body);
        await this.#reconcileBody(note.id, body);
      }
      if (input.tags !== undefined && input.tags.length > 0) {
        await this.#scope.noteDetails.setTags(note.id, input.tags);
      }
      await this.#linkNote(note.id, references);
    } catch (cause) {
      // A half-written Note is worse than none: the owner would be left with an
      // empty, unfiled record they never asked for. Undo the identity we made.
      await this.#scope.entities.softDelete(note.id).catch(() => undefined);
      throw cause;
    }
    await this.#audit.record({
      actor,
      action: "create_note",
      entityType: "note",
      entityId: note.id,
      summary: `Created note: ${note.title}`,
    });
    return { note: (await this.#noteSummary(note.id)) ?? { id: note.id } };
  }

  async updateNote(
    input: UpdateChiefNoteInput,
    actor: ChiefOfStaffActor,
  ): Promise<ChiefOfStaffResult> {
    const { id: noteId } = await requireReference(
      this.#scope,
      "note",
      "noteId",
      input.noteId,
    );
    const existing = await this.#scope.noteDetails.get(noteId);
    const entity = await this.#scope.entities.getById(noteId);
    if (existing === null || entity === null || entity.type !== "note") {
      throw new Error("Note not found");
    }
    const references = await this.#resolveNoteReferences(input);

    let changed = false;
    if (input.title !== undefined) {
      const renamed = await this.#scope.entities.update(noteId, {
        title: input.title,
      });
      changed = changed || renamed.title !== entity.title;
    }
    if (input.content !== undefined && input.content !== null) {
      const result = await this.#scope.noteDetails.update(
        noteId,
        input.content,
      );
      changed = changed || result.changed;
      if (result.changed) await this.#reconcileBody(noteId, input.content);
    }
    if (input.tags !== undefined) {
      const result = await this.#scope.noteDetails.setTags(noteId, input.tags);
      changed = changed || result.changed;
    }
    if (input.archived !== undefined) {
      const result = await this.#scope.noteDetails.setArchived(
        noteId,
        input.archived,
      );
      changed = changed || result.changed;
    }
    if (references.length > 0) {
      const linked = await this.#linkNote(noteId, references);
      changed = changed || linked;
    }
    if (changed) {
      await this.#audit.record({
        actor,
        action: "update_note",
        entityType: "note",
        entityId: noteId,
        summary: `Updated note: ${input.title ?? entity.title}`,
      });
    }
    return {
      note: (await this.#noteSummary(noteId)) ?? { id: noteId },
      changed,
    };
  }

  /**
   * NOTES-02 — turn any `[[Wiki Links]]` in the written body into the same real
   * `note.references` relationships an in-app save would create, so a Note
   * written through MCP is indistinguishable from one written in DalyHub.
   *
   * Best-effort exactly as the Notes route is: the Markdown source is the
   * canonical record, and a hiccup writing DERIVED relationships must not cost
   * the owner their text. The next save reconciles from the same source.
   */
  async #reconcileBody(noteId: string, content: string): Promise<void> {
    try {
      await reconcileNoteReferences(this.#scope, noteId, content);
    } catch {
      // Intentionally swallowed — see above.
    }
  }

  async recordDecision(
    input: {
      readonly decision: string;
      readonly rationale?: string | null;
      readonly projectId?: string | null;
      readonly areaId?: string | null;
      readonly decisionDate: string;
      readonly reviewDate?: string | null;
    },
    actor: ChiefOfStaffActor,
  ) {
    const decided = await this.#scope.decisions.create({
      decision: input.decision,
      rationale: input.rationale,
      decisionDate: input.decisionDate,
      reviewDate: input.reviewDate,
      related: await this.#relation(input),
      status: "decided",
    });
    await this.#audit.record({
      actor,
      action: "record_decision",
      entityType: "decision",
      entityId: decided.id,
      summary: `Recorded decision: ${decided.decision}`,
    });
    return { decision: compactDecision(decided) };
  }

  async createWaitingFor(
    input: CreateWaitingForInput,
    actor: ChiefOfStaffActor,
    action: string,
  ) {
    /*
     * A waiting item names WHOM it waits on, and DalyHub can hold that two
     * ways: as an entity subject (`task.waiting_on`, resolved to the record's
     * current title) or as free text, for a party with no record. The kernel
     * allows exactly one of the two, so this does too.
     *
     * `personId` is preferred where it is given, because an entity subject is
     * what makes the item show on the Person's own record and survive a rename
     * — the free-text form is for "waiting on the council".
     */
    const person = input.personId
      ? await requireReference(
          this.#scope,
          "person",
          "personId",
          input.personId,
        )
      : null;
    const delegate = person?.title ?? input.personOrSource?.trim();
    if (!delegate) {
      throw new Error(
        "A waiting item must name who it waits on: supply personId or personOrSource",
      );
    }
    const today = await this.#scope.ownerTodayIso(this.#now);
    const task = await this.#scope.tasks.createTask({
      title: input.what,
      parent: await this.#relation(input),
      description: input.notes,
      delegation: {
        to: delegate,
        delegatedOn: input.createdDate ?? today,
        followUpOn: input.followUpDate ?? null,
        note: input.notes ?? null,
      },
    });
    const waiting = await this.#scope.tasks.setWaiting(
      task.id,
      person === null
        ? { target: { kind: "text", note: delegate } }
        : { target: { kind: "entity", targetId: person.id } },
    );
    await this.#audit.record({
      actor,
      action,
      entityType: "task",
      entityId: task.id,
      summary: `Waiting for ${delegate}: ${task.title}`,
    });
    return {
      waiting: compactTask(waiting.task),
      ...(person === null
        ? {}
        : { person: { id: person.id, name: person.title } }),
    };
  }

  async resolveWaitingFor(reference: string, actor: ChiefOfStaffActor) {
    const { id: taskId } = await requireReference(
      this.#scope,
      "task",
      "taskId",
      reference,
    );
    const result = await this.#scope.tasks.clearWaiting(taskId);
    if (result.changed) {
      await this.#audit.record({
        actor,
        action: "resolve_waiting_for",
        entityType: "task",
        entityId: taskId,
        summary: `Resolved waiting item: ${result.task.title}`,
      });
    }
    return { waiting: compactTask(result.task), changed: result.changed };
  }

  /* ---------------------------------------------------------------------- */
  /* Tasks — reopening                                                       */
  /* ---------------------------------------------------------------------- */

  async reopenTask(reference: string, actor: ChiefOfStaffActor) {
    const { id: taskId } = await requireReference(
      this.#scope,
      "task",
      "taskId",
      reference,
    );
    const result = await this.#scope.tasks.reopenTask(taskId);
    if (result.changed) {
      await this.#audit.record({
        actor,
        action: "reopen_task",
        entityType: "task",
        entityId: taskId,
        summary: `Reopened task: ${result.task.title}`,
      });
    }
    return { task: compactTask(result.task), changed: result.changed };
  }

  /* ---------------------------------------------------------------------- */
  /* People                                                                  */
  /* ---------------------------------------------------------------------- */

  /**
   * The bounded set of records one entity is related to, grouped by kind.
   *
   * ONE workspace-scoped query through the FND-04 kernel, in both directions,
   * with the structural spine links filtered out — the hierarchy is already
   * shown by the record's own parentage, and repeating it here would make a
   * Project's own Tasks look like ad-hoc relationships.
   */
  async #relatedRecords(entityId: string) {
    const page = await this.#scope.entityLinks.listForEntity(entityId, {
      limit: RELATED_LINK_LIMIT,
    });
    const byType = new Map<string, { id: string; title: string }[]>();
    for (const view of page.items) {
      if (isReservedSpineLinkType(view.link.type)) continue;
      const bucket = byType.get(view.counterpart.type) ?? [];
      if (bucket.some((record) => record.id === view.counterpart.id)) continue;
      bucket.push({ id: view.counterpart.id, title: view.counterpart.title });
      byType.set(view.counterpart.type, bucket);
    }
    return {
      byType,
      of: (type: string) => byType.get(type) ?? [],
      truncated: page.nextCursor !== null,
    };
  }

  async getPeople(input?: ListChiefPeopleInput): Promise<ChiefOfStaffResult> {
    const limit = boundedLimit(input?.limit);
    const scopeReference = input?.projectId
      ? (["project", "projectId", input.projectId] as const)
      : input?.areaId
        ? (["area", "areaId", input.areaId] as const)
        : null;

    if (scopeReference !== null) {
      const [kind, field, value] = scopeReference;
      const match = await requireReference(this.#scope, kind, field, value);
      const related = await this.#relatedRecords(match.id);
      const ids = related.of("person").slice(0, limit);
      const people = await Promise.all(
        ids.map((record) => this.#scope.people.get(record.id)),
      );
      return {
        relatedTo: { type: kind, id: match.id, title: match.title },
        people: people
          .filter((person): person is Person => person !== null)
          .map(compactPerson),
        truncated: related.truncated,
      };
    }

    const page = await this.#scope.people.list({
      query: input?.query,
      status: input?.status ?? "active",
      limit,
    });
    return {
      people: page.items.map(compactPerson),
      truncated: page.hasMore,
    };
  }

  /**
   * One Person and the Chief-of-Staff context around them: who they are, the
   * work they are attached to, what is open, what is owed, and how long it has
   * been. Every list is bounded; nothing here expands a graph.
   */
  async getPerson(reference: string): Promise<ChiefOfStaffResult> {
    const match = await requireReference(
      this.#scope,
      "person",
      "personId",
      reference,
    );
    const person = await this.#scope.people.get(match.id);
    if (person === null) throw new Error("Person not found");

    const { todayIso, timezone } = await this.#dateContext();
    const related = await this.#relatedRecords(person.id);
    const linkedTaskIds = related.of("task").map((record) => record.id);
    const [tasks, facts, delegated] = await Promise.all([
      linkedTaskIds.length > 0
        ? this.#scope.tasks.getTasksByIds(linkedTaskIds)
        : Promise.resolve(new Map<string, TaskView>()),
      this.#scope.relationships.getPersonRelationshipFacts(person.id),
      // The free-text waiting form carries the delegate's NAME rather than a
      // link, so an item recorded as "waiting on John" before John had a record
      // is still their item. Both forms are gathered; the ids de-duplicate them.
      this.#scope.tasks.listWorkspaceTasks({
        view: "all",
        filters: { waitingOnly: true, delegatedTo: person.title },
        todayIso,
        timezone,
        limit: PERSON_CONTEXT_LIMIT,
      }),
    ]);

    const linkedTasks = linkedTaskIds
      .map((id) => tasks.get(id))
      .filter((task): task is TaskView => task !== undefined);
    const waitingById = new Map<string, CompactTask>();
    for (const task of linkedTasks) {
      if (task.waiting !== null) waitingById.set(task.id, compactTask(task));
    }
    for (const task of delegated.items) {
      waitingById.set(task.id, compactTask(task));
    }

    return {
      person: compactPerson(person),
      detail: {
        pronouns: person.pronouns,
        department: person.department,
        secondaryEmail: person.secondaryEmail,
        workPhone: person.workPhone,
        website: person.website,
        birthday: person.birthday,
        followUpFrequency: person.followUpFrequency,
        notes: person.notes,
      },
      areas: related.of("area"),
      goals: related.of("goal"),
      projects: related.of("project"),
      notes: related.of("note"),
      meetings: related.of("meeting"),
      openTasks: linkedTasks
        .filter((task) => task.completedAt === null)
        .slice(0, PERSON_CONTEXT_LIMIT)
        .map(compactTask),
      waitingFor: [...waitingById.values()].slice(0, PERSON_CONTEXT_LIMIT),
      history: {
        totalInteractions: facts.totalInteractions,
        firstInteractionAt: facts.firstInteractionAt?.toISOString() ?? null,
        lastInteractionAt: facts.lastInteractionAt?.toISOString() ?? null,
        sharedRecords: facts.records,
      },
      truncated: { relationships: related.truncated },
    };
  }

  /**
   * The Person detail patch — and PATCH is the load-bearing word.
   *
   * A key that is merely PRESENT with an undefined value is not the same as an
   * absent key: the detail repository writes every field it is handed, so
   * passing the whole shape through would make "change the role" also erase
   * the organisation, the mobile and the tags. Undefined keys are therefore
   * dropped here, and only an EXPLICIT null reaches the repository as "clear
   * this one field".
   */
  #personDetails(input: CreateChiefPersonInput | UpdateChiefPersonInput) {
    const supplied = {
      preferredName: input.preferredName,
      firstName: input.firstName,
      lastName: input.lastName,
      pronouns: input.pronouns,
      organisation: input.organisation,
      role: input.role,
      department: input.department,
      email: input.email,
      secondaryEmail: input.secondaryEmail,
      mobile: input.mobile,
      workPhone: input.workPhone,
      website: input.website,
      birthday: input.birthday,
      relationship: input.relationship,
      tags: input.tags,
      notes: input.notes,
      followUpFrequency: input.followUpFrequency,
      nextFollowUp: input.nextFollowUp,
      lastInteraction: input.lastInteraction,
    };
    return Object.fromEntries(
      Object.entries(supplied).filter(([, value]) => value !== undefined),
    ) as PersonDetailsInput;
  }

  /** Resolve a Person's Area/Project/Goal relationships before anything writes. */
  async #personRelationships(
    input: CreateChiefPersonInput | UpdateChiefPersonInput,
  ): Promise<readonly ReferenceMatch[]> {
    const areas = await requireReferences(
      this.#scope,
      "area",
      "areaIds",
      input.areaIds,
    );
    const projects = await requireReferences(
      this.#scope,
      "project",
      "projectIds",
      input.projectIds,
    );
    const goals = await requireReferences(
      this.#scope,
      "goal",
      "goalIds",
      input.goalIds,
    );
    return [...areas, ...projects, ...goals];
  }

  async createPerson(
    input: CreateChiefPersonInput,
    actor: ChiefOfStaffActor,
  ): Promise<ChiefOfStaffResult> {
    const relationships = await this.#personRelationships(input);
    /*
     * Two people can legitimately share a name, so the duplicate check is not
     * a uniqueness rule — it is a pause. It looks for an EXACT normalised name
     * or a shared email, and hands the candidates back rather than choosing;
     * `allowDuplicate` is how the owner says "yes, a second one".
     */
    const candidates = uniqueCandidates([
      await duplicateCandidates(this.#scope, "person", input.name),
      input.email
        ? await duplicateCandidates(this.#scope, "person", input.email)
        : [],
    ]);
    guardDuplicate("person", input.name, candidates, {
      allowDuplicate: input.allowDuplicate,
      aliases: [input.preferredName, input.email].filter(
        (value): value is string => typeof value === "string",
      ),
    });

    const person = await this.#scope.people.create({
      title: input.name,
      ...this.#personDetails(input),
    });
    for (const record of relationships)
      await this.#relatePerson(record.id, person.id);
    await this.#audit.record({
      actor,
      action: "create_person",
      entityType: "person",
      entityId: person.id,
      summary: `Created person: ${person.title}`,
    });
    return {
      person: compactPerson(person),
      relatedTo: relationships.map((record) => ({
        type: record.type,
        id: record.id,
        title: record.title,
      })),
    };
  }

  async updatePerson(
    input: UpdateChiefPersonInput,
    actor: ChiefOfStaffActor,
  ): Promise<ChiefOfStaffResult> {
    const match = await requireReference(
      this.#scope,
      "person",
      "personId",
      input.personId,
    );
    const existing = await this.#scope.people.get(match.id);
    if (existing === null) throw new Error("Person not found");
    const relationships = await this.#personRelationships(input);

    let changed = false;
    if (input.name !== undefined) {
      // The display name is the shared entity title, so it is renamed the same
      // way every other record is; `people.update` owns the detail slice only.
      const renamed = await this.#scope.entities.update(match.id, {
        title: input.name,
      });
      changed = changed || renamed.title !== existing.title;
    }
    const result = await this.#scope.people.update(
      match.id,
      this.#personDetails(input),
    );
    changed = changed || result.changed;
    if (input.archived !== undefined) {
      const lifecycle = input.archived
        ? await this.#scope.people.archive(match.id)
        : await this.#scope.people.restore(match.id);
      changed = changed || lifecycle.changed;
    }
    for (const record of relationships) {
      changed = (await this.#relatePerson(record.id, match.id)) || changed;
    }
    if (changed) {
      await this.#audit.record({
        actor,
        action: "update_person",
        entityType: "person",
        entityId: match.id,
        summary: `Updated person: ${input.name ?? existing.title}`,
      });
    }
    const person = await this.#scope.people.get(match.id);
    return {
      person: compactPerson(person ?? existing),
      changed,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Areas                                                                   */
  /* ---------------------------------------------------------------------- */

  async getAreas(input?: {
    readonly query?: string;
    readonly limit?: number;
  }): Promise<ChiefOfStaffResult> {
    const limit = boundedLimit(input?.limit);
    const page = await this.#scope.areas.listAreas({ limit });
    const wanted = input?.query?.trim().toLocaleLowerCase();
    const areas = page.items
      .filter(
        (area) =>
          wanted === undefined ||
          wanted.length === 0 ||
          area.title.toLocaleLowerCase().includes(wanted),
      )
      .map(compactArea);
    return { areas, truncated: page.nextCursor !== null };
  }

  /**
   * One Area and everything hanging off it, each list bounded: its Goals, the
   * Projects aligned to it (directly or through one of its Goals), its open
   * direct work, its People, its Notes, its waiting items and its Decisions.
   */
  async getArea(reference: string): Promise<ChiefOfStaffResult> {
    const match = await requireReference(
      this.#scope,
      "area",
      "areaId",
      reference,
    );
    const area = await this.#scope.areas.getAreaOverview(match.id);
    if (area === null) throw new Error("Area not found");
    const { todayIso, timezone } = await this.#dateContext();
    const [goals, projects, openTasks, waiting, notes, decisions, related] =
      await Promise.all([
        this.#scope.areas.listAreaGoals({
          areaId: area.id,
          limit: AREA_CONTEXT_LIMIT,
        }),
        this.#scope.areas.listAreaProjects({
          areaId: area.id,
          limit: AREA_CONTEXT_LIMIT,
        }),
        this.#scope.tasks.listWorkspaceTasks({
          view: "open",
          filters: { areaId: area.id },
          todayIso,
          timezone,
          limit: AREA_CONTEXT_LIMIT,
        }),
        this.#scope.tasks.listWorkspaceTasks({
          view: "all",
          filters: { areaId: area.id, waitingOnly: true },
          todayIso,
          timezone,
          limit: AREA_CONTEXT_LIMIT,
        }),
        this.#scope.notes.list({ areaId: area.id, limit: AREA_CONTEXT_LIMIT }),
        this.#scope.decisions.list({
          relatedEntityId: area.id,
          limit: AREA_CONTEXT_LIMIT,
        }),
        this.#relatedRecords(area.id),
      ]);
    return {
      area: {
        id: area.id,
        title: area.title,
        archived: area.archivedAt !== null,
        createdAt: area.createdAt.toISOString(),
        updatedAt: area.updatedAt.toISOString(),
      },
      goals: goals.items.map((goal) => ({
        id: goal.id,
        title: goal.title,
        targetDate: goal.targetDate,
        completedAt: goal.completedAt?.toISOString() ?? null,
        projects: {
          total: goal.projectTotal,
          completed: goal.projectCompleted,
        },
      })),
      projects: projects.items.map((project) => ({
        id: project.id,
        title: project.title,
        status: project.status,
        completedAt: project.completedAt?.toISOString() ?? null,
        archivedAt: project.archivedAt?.toISOString() ?? null,
        tasks: { total: project.taskTotal, completed: project.taskCompleted },
      })),
      openTasks: openTasks.items.map(compactTask),
      waitingFor: waiting.items.map(compactTask),
      people: related.of("person"),
      notes: notes.items.map((note) => ({
        id: note.id,
        title: note.title,
        excerpt: note.excerpt,
        archived: note.archivedAt !== null,
      })),
      decisions: decisions.map(compactDecision),
      truncated: {
        goals: goals.nextCursor !== null,
        projects: projects.nextCursor !== null,
        openTasks: openTasks.nextCursor !== null,
        notes: notes.hasMore,
      },
    };
  }

  async createArea(
    input: CreateChiefAreaInput,
    actor: ChiefOfStaffActor,
  ): Promise<ChiefOfStaffResult> {
    guardDuplicate(
      "area",
      input.title,
      await duplicateCandidates(this.#scope, "area", input.title),
      { allowDuplicate: input.allowDuplicate },
    );
    const created = await this.#scope.spine.createArea({ title: input.title });
    await this.#audit.record({
      actor,
      action: "create_area",
      entityType: "area",
      entityId: created.id,
      summary: `Created area: ${created.title}`,
    });
    return {
      area: { id: created.id, title: created.title, archived: false },
    };
  }

  async updateArea(
    input: UpdateChiefAreaInput,
    actor: ChiefOfStaffActor,
  ): Promise<ChiefOfStaffResult> {
    const match = await requireReference(
      this.#scope,
      "area",
      "areaId",
      input.areaId,
    );
    const existing = await this.#scope.areas.getAreaOverview(match.id);
    if (existing === null) throw new Error("Area not found");

    let changed = false;
    if (input.title !== undefined) {
      const renamed = await this.#scope.spine.rename(match.id, input.title);
      changed = changed || renamed.title !== existing.title;
    }
    if (input.archived !== undefined) {
      // Archiving an Area preserves every Goal, Project, Task, link and
      // Activity row it holds (AREA-05) and is reversible through this same
      // field. There is no Area deletion on this interface at all.
      const result = input.archived
        ? await this.#scope.areaSettings.archive(match.id)
        : await this.#scope.areaSettings.restore(match.id);
      changed = changed || result.changed;
    }
    if (changed) {
      await this.#audit.record({
        actor,
        action: "update_area",
        entityType: "area",
        entityId: match.id,
        summary: `Updated area: ${input.title ?? existing.title}`,
      });
    }
    const area = await this.#scope.areas.getAreaOverview(match.id);
    return {
      area: {
        id: match.id,
        title: area?.title ?? existing.title,
        archived: (area ?? existing).archivedAt !== null,
      },
      changed,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Goals                                                                   */
  /* ---------------------------------------------------------------------- */

  async getGoals(input?: {
    readonly areaId?: string;
    readonly state?: "open" | "completed" | "all";
    readonly limit?: number;
  }): Promise<ChiefOfStaffResult> {
    const limit = boundedLimit(input?.limit);
    const state = input?.state ?? "open";
    if (input?.areaId) {
      const match = await requireReference(
        this.#scope,
        "area",
        "areaId",
        input.areaId,
      );
      const page = await this.#scope.areas.listAreaGoals({
        areaId: match.id,
        limit,
      });
      return {
        area: { id: match.id, title: match.title },
        goals: page.items
          .filter((goal) => matchesGoalState(goal.completedAt, state))
          .map((goal) => ({
            id: goal.id,
            title: goal.title,
            area: { id: match.id, title: match.title },
            targetDate: goal.targetDate,
            completedAt: goal.completedAt?.toISOString() ?? null,
            projects: {
              total: goal.projectTotal,
              completed: goal.projectCompleted,
            },
          })),
        truncated: page.nextCursor !== null,
      };
    }
    const page = await this.#scope.goals.listGoals({ limit });
    const wanted = page.items.filter((goal) =>
      matchesGoalState(goal.completedAt, state),
    );
    const details = await this.#scope.goalDetails.listMany(
      wanted.map((goal) => goal.id),
    );
    return {
      goals: wanted.map((goal) => {
        const detail = details.get(goal.id);
        return {
          id: goal.id,
          title: goal.title,
          area: { id: goal.area.id, title: goal.area.title },
          targetDate: detail?.targetDate ?? null,
          condition: chiefGoalCondition(detail?.condition ?? null),
          definitionOfDone: detail?.definitionOfDone ?? null,
          completedAt: goal.completedAt?.toISOString() ?? null,
        } satisfies CompactGoal;
      }),
      truncated: page.nextCursor !== null,
    };
  }

  async getGoal(reference: string): Promise<ChiefOfStaffResult> {
    const match = await requireReference(
      this.#scope,
      "goal",
      "goalId",
      reference,
    );
    const goal = await this.#scope.goals.getGoalOverview(match.id);
    if (goal === null) throw new Error("Goal not found");
    const [details, projects, contribution, related] = await Promise.all([
      this.#scope.goalDetails.get(goal.id),
      this.#scope.goals.listGoalProjects({
        goalId: goal.id,
        limit: AREA_CONTEXT_LIMIT,
      }),
      this.#scope.goals.getGoalProjectContribution(goal.id),
      this.#relatedRecords(goal.id),
    ]);
    return {
      goal: {
        id: goal.id,
        title: goal.title,
        area: { id: goal.area.id, title: goal.area.title },
        targetDate: details?.targetDate ?? null,
        definitionOfDone: details?.definitionOfDone ?? null,
        condition: chiefGoalCondition(details?.condition ?? null),
        completedAt: goal.completedAt?.toISOString() ?? null,
      } satisfies CompactGoal,
      contribution,
      projects: projects.items.map((project) => ({
        id: project.id,
        title: project.title,
        status: project.status,
        completedAt: project.completedAt?.toISOString() ?? null,
        archivedAt: project.archivedAt?.toISOString() ?? null,
        tasks: { total: project.taskTotal, completed: project.taskCompleted },
      })),
      people: related.of("person"),
      notes: related.of("note"),
      truncated: { projects: projects.nextCursor !== null },
    };
  }

  async createGoal(
    input: CreateChiefGoalInput,
    actor: ChiefOfStaffActor,
  ): Promise<ChiefOfStaffResult> {
    const area = await requireReference(
      this.#scope,
      "area",
      "areaId",
      input.areaId,
    );
    const projects = await requireReferences(
      this.#scope,
      "project",
      "projectIds",
      input.projectIds,
    );
    guardDuplicate(
      "goal",
      input.title,
      await duplicateCandidates(this.#scope, "goal", input.title),
      { allowDuplicate: input.allowDuplicate },
    );
    const created = await this.#scope.spine.createGoal({
      title: input.title,
      areaId: area.id,
    });
    if (
      input.targetDate !== undefined ||
      input.definitionOfDone !== undefined
    ) {
      await this.#scope.goalDetails.update(created.id, {
        targetDate: input.targetDate,
        definitionOfDone: input.definitionOfDone,
      });
    }
    // A Project "contributes to" a Goal by BEING under it — the spine's own
    // `project.advances_goal` parentage (FND-07), not a second association.
    for (const project of projects) {
      await this.#scope.spine.move(project.id, {
        kind: "goal",
        id: created.id,
      });
    }
    await this.#audit.record({
      actor,
      action: "create_goal",
      entityType: "goal",
      entityId: created.id,
      summary: `Created goal: ${created.title}`,
    });
    return {
      goal: {
        id: created.id,
        title: created.title,
        area: { id: area.id, title: area.title },
        targetDate: input.targetDate ?? null,
        definitionOfDone: input.definitionOfDone ?? null,
        condition: "pursuing",
        completedAt: null,
      } satisfies CompactGoal,
      projectsAttached: projects.map((project) => ({
        id: project.id,
        title: project.title,
      })),
    };
  }

  async updateGoal(
    input: UpdateChiefGoalInput,
    actor: ChiefOfStaffActor,
  ): Promise<ChiefOfStaffResult> {
    const match = await requireReference(
      this.#scope,
      "goal",
      "goalId",
      input.goalId,
    );
    const existing = await this.#scope.goals.getGoalOverview(match.id);
    if (existing === null) throw new Error("Goal not found");
    const area = input.areaId
      ? await requireReference(this.#scope, "area", "areaId", input.areaId)
      : null;

    let changed = false;
    if (input.title !== undefined) {
      const renamed = await this.#scope.spine.rename(match.id, input.title);
      changed = changed || renamed.title !== existing.title;
    }
    if (area !== null) {
      const moved = await this.#scope.spine.move(match.id, {
        kind: "area",
        id: area.id,
      });
      changed = changed || moved.changed;
    }
    if (
      input.targetDate !== undefined ||
      input.definitionOfDone !== undefined ||
      input.condition !== undefined
    ) {
      const result = await this.#scope.goalDetails.update(match.id, {
        targetDate: input.targetDate,
        definitionOfDone: input.definitionOfDone,
        ...(input.condition === undefined
          ? {}
          : {
              condition: input.condition === "set_aside" ? "set_aside" : null,
            }),
      });
      changed = changed || result.changed;
    }
    if (input.completed !== undefined) {
      const result = input.completed
        ? await this.#scope.spine.complete(match.id)
        : await this.#scope.spine.reopen(match.id);
      changed = changed || result.changed;
    }
    if (changed) {
      await this.#audit.record({
        actor,
        action: "update_goal",
        entityType: "goal",
        entityId: match.id,
        summary: `Updated goal: ${input.title ?? existing.title}`,
      });
    }
    const goal = await this.#scope.goals.getGoalOverview(match.id);
    const details = await this.#scope.goalDetails.get(match.id);
    return {
      goal: {
        id: match.id,
        title: goal?.title ?? existing.title,
        area: {
          id: (goal ?? existing).area.id,
          title: (goal ?? existing).area.title,
        },
        targetDate: details?.targetDate ?? null,
        definitionOfDone: details?.definitionOfDone ?? null,
        condition: chiefGoalCondition(details?.condition ?? null),
        completedAt: (goal ?? existing).completedAt?.toISOString() ?? null,
      } satisfies CompactGoal,
      changed,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Notes, Decisions and waiting — bounded reads                            */
  /* ---------------------------------------------------------------------- */

  async getNotes(input?: {
    readonly query?: string;
    readonly tag?: string;
    readonly projectId?: string;
    readonly areaId?: string;
    readonly state?: "active" | "archived";
    readonly limit?: number;
  }): Promise<ChiefOfStaffResult> {
    const project = input?.projectId
      ? await requireReference(
          this.#scope,
          "project",
          "projectId",
          input.projectId,
        )
      : null;
    const area = input?.areaId
      ? await requireReference(this.#scope, "area", "areaId", input.areaId)
      : null;
    const page = await this.#scope.notes.list({
      /*
       * The Notes collection answers ONE lifecycle bucket at a time — its
       * third, `deleted`, is not readable here at all — so this offers the two
       * it can answer rather than an "all" it would silently render as
       * "active".
       */
      state: input?.state ?? "active",
      query: input?.query,
      tag: input?.tag,
      projectId: project?.id,
      areaId: area?.id,
      limit: boundedLimit(input?.limit),
    });
    return {
      notes: page.items.map(
        (note) =>
          ({
            id: note.id,
            title: note.title,
            tags: note.tags,
            archived: note.archivedAt !== null,
            excerpt: note.excerpt,
            updatedAt: note.effectiveUpdatedAt.toISOString(),
          }) satisfies CompactNote,
      ),
      truncated: page.hasMore,
    };
  }

  async getDecisions(input?: {
    readonly status?: DecisionStatus;
    readonly projectId?: string;
    readonly areaId?: string;
    readonly limit?: number;
  }): Promise<ChiefOfStaffResult> {
    const related = await this.#relation({
      projectId: input?.projectId,
      areaId: input?.areaId,
    });
    const decisions = await this.#scope.decisions.list({
      status: input?.status,
      relatedEntityId: related?.id,
      limit: boundedLimit(input?.limit),
    });
    return { decisions: decisions.map(compactDecision) };
  }

  async getWaitingFor(input?: {
    readonly followUp?: TaskFollowUpState;
    readonly personId?: string;
    readonly projectId?: string;
    readonly areaId?: string;
    readonly limit?: number;
  }): Promise<ChiefOfStaffResult> {
    const { todayIso, timezone } = await this.#dateContext();
    const limit = boundedLimit(input?.limit);
    const person = input?.personId
      ? await requireReference(
          this.#scope,
          "person",
          "personId",
          input.personId,
        )
      : null;
    const related = await this.#relation({
      projectId: input?.projectId,
      areaId: input?.areaId,
    });

    /*
     * The dedicated waiting read owns the follow-up vocabulary and the
     * overdue-first order, so it is used whenever nothing narrows the
     * population. A person/project/area filter is a Tasks-collection question,
     * and the collection already answers it — so that branch asks the
     * collection rather than filtering a page in application code.
     */
    if (person === null && related === null) {
      const page = await this.#scope.tasks.listWaitingTasks({
        todayIso,
        followUp: input?.followUp,
        limit,
      });
      return {
        waitingFor: page.items.map(compactTask),
        truncated: page.nextCursor !== null,
      };
    }
    const page = await this.#scope.tasks.listWorkspaceTasks({
      view: "all",
      filters: {
        waitingOnly: true,
        // The collection takes the SAME follow-up dimension the dedicated
        // waiting read does, so narrowing by person or project does not
        // quietly drop the filter the caller asked for.
        ...(input?.followUp === undefined ? {} : { followUp: input.followUp }),
        ...(person === null ? {} : { delegatedTo: person.title }),
        ...(related?.kind === "project" ? { projectId: related.id } : {}),
        ...(related?.kind === "area" ? { areaId: related.id } : {}),
      },
      todayIso,
      timezone,
      limit,
    });
    return {
      waitingFor: page.items.map(compactTask),
      ...(person === null
        ? {}
        : { person: { id: person.id, name: person.title } }),
      truncated: page.nextCursor !== null,
    };
  }
}

/**
 * The ONE boundary that turns a stopped write into an answerable question.
 *
 * `AmbiguousReferenceError` and `PossibleDuplicateError` are not failures —
 * they are the tool declining to guess, and they carry the candidates Claude
 * needs in order to ask. Reaching the transport as an error would flatten both
 * into "DalyHub could not complete that request", so they are unwrapped into
 * their structured payload here. Every other error keeps failing.
 */
export async function invokeChiefOfStaff(
  env: WorkspaceScopeEnv,
  request: ChiefOfStaffRequest,
  now = new Date(),
): Promise<ChiefOfStaffResult> {
  try {
    return await runChiefOfStaff(env, request, now);
  } catch (error) {
    if (error instanceof AmbiguousReferenceError) return error.payload;
    if (error instanceof PossibleDuplicateError) return error.payload;
    throw error;
  }
}

// Kept outside the class to preserve the request union's exact capture input type.
async function runChiefOfStaff(
  env: WorkspaceScopeEnv,
  request: ChiefOfStaffRequest,
  now = new Date(),
): Promise<ChiefOfStaffResult> {
  const actor =
    "actor" in request
      ? createActivityActorContext({ type: "mcp", id: request.actor.subject })
      : createActivityActorContext({ type: "mcp", id: "read_only" });
  const context = await createWorkspaceContextResolver(env).resolve();
  const scope = bindWorkspaceRepositories(env, context, actor);
  const service = new DalyHubChiefOfStaffService(scope, env.DB, now);
  if (request.action !== "capture_item") return service.invoke(request);

  const input = request.input;
  const contextText = captureBody(input);
  if (input.type === "task" || input.type === "reminder") {
    return service.createTask(
      {
        title: input.title,
        notes: contextText,
        dueDate: input.dueDate,
        projectId: input.projectId,
        areaId: input.areaId,
      },
      request.actor,
      "capture_item",
    );
  }
  if (input.type === "waiting") {
    if (!input.person?.trim())
      throw new Error("person is required for a waiting capture");
    return service.createWaitingFor(
      {
        what: input.title,
        personOrSource: input.person,
        projectId: input.projectId,
        areaId: input.areaId,
        followUpDate: input.followUpDate,
        notes: contextText,
      },
      request.actor,
      "capture_item",
    );
  }
  if (input.type === "decision") {
    const decision = await scope.decisions.create({
      decision: input.title,
      status: "open",
      rationale: contextText,
      related: await resolveRelation(scope, input),
    });
    await new McpActivityAudit(env.DB, scope.context.workspaceId).record({
      actor: request.actor,
      action: "capture_item",
      entityType: "decision",
      entityId: decision.id,
      summary: `Captured open decision: ${decision.decision}`,
    });
    return { decision: compactDecision(decision) };
  }

  const note = await scope.entities.create({
    type: "note",
    title: input.title,
  });
  try {
    const body = contextText ?? "";
    if (body.length > 0) {
      await scope.noteDetails.update(note.id, body);
      // NOTES-02, as `create_note` does: any `[[Wiki Links]]` in the captured
      // text become the same real relationships an in-app save would create.
      // Best-effort — the Markdown source is the canonical record.
      await reconcileNoteReferences(scope, note.id, body).catch(
        () => undefined,
      );
    }
    const target = await resolveRelation(scope, input);
    if (target !== null) {
      // PROJ-03 / the shared Linked Items surface: `link.related` with the
      // record as the source is the ONE relationship DalyHub already uses to
      // file a Note under a Project or Area. An MCP capture must join that same
      // relationship rather than introduce a second, unlabelled link type.
      await scope.entityLinks.create({
        sourceEntityId: target.id,
        targetEntityId: note.id,
        type: UNIVERSAL_RELATED_LINK,
      });
    }
  } catch (cause) {
    await scope.entities.softDelete(note.id).catch(() => undefined);
    throw cause;
  }
  await new McpActivityAudit(env.DB, scope.context.workspaceId).record({
    actor: request.actor,
    action: "capture_item",
    entityType: "note",
    entityId: note.id,
    summary: `Captured ${input.type}: ${note.title}`,
  });
  return { item: { id: note.id, type: input.type, title: note.title } };
}
