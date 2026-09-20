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
  ChiefOfStaffActor,
  ChiefOfStaffRequest,
  ChiefOfStaffResult,
  CompactDecision,
  CompactNote,
  CompactProject,
  CompactTask,
  CreateChiefNoteInput,
  CreateChiefProjectInput,
  CreateChiefTaskInput,
  CreateWaitingForInput,
  NoteReferenceInput,
  TaskReferenceInput,
  UpdateChiefNoteInput,
  UpdateChiefProjectInput,
  UpdateChiefTaskInput,
} from "~/kernel/chief-of-staff";
import type { DecisionRecord } from "~/kernel/decisions";
import type { ProjectOverview } from "~/kernel/projects";
import { parseProjectWorkflowStatus } from "~/kernel/project-settings";
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

const READ_LIMIT = 50;
const SEARCH_LIMIT = 20;

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

/** One (expected entity type, exact id) pair a Note should be filed under. */
type NoteReference = {
  readonly kind: "project" | "area" | "goal";
  readonly id: string;
};

/**
 * The exact records a Note should be filed under, as (expected type, id) pairs.
 *
 * Every reference is NAMED by the type it must be, so a Project id supplied as
 * `areaId` is a validation failure rather than a silently mis-filed Note. The
 * ids themselves stay untrusted here — {@link resolveNoteReferences} is what
 * proves each one is an active record of that type in this workspace.
 */
function noteReferencePairs(
  input: NoteReferenceInput,
): readonly NoteReference[] {
  const pairs: NoteReference[] = [];
  const supplied = [
    ["project", input.projectId],
    ["area", input.areaId],
    ["goal", input.goalId],
  ] as const;
  for (const [kind, value] of supplied) {
    if (typeof value === "string" && value.length > 0)
      pairs.push({ kind, id: value });
  }
  return pairs;
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

function relation(input: TaskReferenceInput) {
  if (input.projectId && input.areaId)
    throw new Error("Choose either projectId or areaId, not both");
  if (input.projectId) return { kind: "project" as const, id: input.projectId };
  if (input.areaId) return { kind: "area" as const, id: input.areaId };
  return null;
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

  async getProject(projectId: string): Promise<ChiefOfStaffResult> {
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
    const [tasks, projects, goals, areas, notes, decisions] = await Promise.all(
      [
        this.#scope.tasks.searchTasks({ text, limit: each }),
        this.#scope.projects.searchProjects({ text, limit: each }),
        this.#scope.goals.searchGoals({ text, limit: each }),
        this.#scope.areas.searchAreas({ text, limit: each }),
        this.#scope.notes.search({ text, limit: each }),
        this.#scope.decisions.search({ text, limit: each }),
      ],
    );
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
    const task = await this.#scope.tasks.createTask({
      title: input.title,
      parent: relation(input),
      priority: input.priority,
      dueDate: input.dueDate,
      scheduledDate: input.scheduledDate,
      status: input.status,
      description: input.notes,
    });
    await this.#audit.record({
      actor,
      action,
      entityType: "task",
      entityId: task.id,
      summary: `Created task: ${task.title}`,
    });
    return { task: compactTask(task) };
  }

  async updateTask(input: UpdateChiefTaskInput, actor: ChiefOfStaffActor) {
    const result = await this.#scope.tasks.updateTask(input.taskId, {
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
      ? await this.#scope.tasks.setTaskParent(input.taskId, relation(input))
      : null;
    const task = parentResult?.task ?? result.task;
    const changed = result.changed || (parentResult?.changed ?? false);
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

  async completeTask(taskId: string, actor: ChiefOfStaffActor) {
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
    const pairs = noteReferencePairs(input);
    for (const pair of pairs) {
      const entity = await this.#scope.entities.getById(pair.id);
      if (entity === null || entity.type !== pair.kind) {
        throw new Error(`No ${pair.kind} exists with that id`);
      }
    }
    return pairs;
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

  async getNote(noteId: string): Promise<ChiefOfStaffResult> {
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
    const parent = input.goalId
      ? ({ kind: "goal", id: input.goalId } as const)
      : ({ kind: "area", id: input.areaId! } as const);
    const created = await this.#scope.spine.createProject({
      title: input.title,
      parent,
    });
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
    // Fail closed on an unknown/cross-workspace/non-project id BEFORE any write,
    // so a wrong id can never rename or restatus another kind of record.
    const existing = await this.#scope.projects.getProjectOverview(
      input.projectId,
    );
    if (existing === null) throw new Error("Project not found");

    let changed = false;
    if (input.title !== undefined) {
      const renamed = await this.#scope.spine.rename(
        input.projectId,
        input.title,
      );
      changed = changed || renamed.title !== existing.title;
    }
    if (input.status !== undefined) {
      const result = await this.#scope.projectSettings.setStatus(
        input.projectId,
        parseProjectWorkflowStatus(input.status),
      );
      changed = changed || result.changed;
    }
    if (input.areaId || input.goalId) {
      const moved = await this.#scope.spine.move(
        input.projectId,
        input.goalId
          ? { kind: "goal", id: input.goalId }
          : { kind: "area", id: input.areaId! },
      );
      changed = changed || moved.changed;
    }
    if (input.completed !== undefined) {
      const result = input.completed
        ? await this.#scope.spine.complete(input.projectId)
        : await this.#scope.spine.reopen(input.projectId);
      changed = changed || result.changed;
    }
    if (input.archived !== undefined) {
      const result = input.archived
        ? await this.#scope.projectSettings.archive(input.projectId)
        : await this.#scope.projectSettings.restore(input.projectId);
      changed = changed || result.changed;
    }
    if (changed) {
      await this.#audit.record({
        actor,
        action: "update_project",
        entityType: "project",
        entityId: input.projectId,
        summary: `Updated project: ${input.title ?? existing.title}`,
      });
    }
    const overview = await this.#scope.projects.getProjectOverview(
      input.projectId,
    );
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
    const existing = await this.#scope.noteDetails.get(input.noteId);
    const entity = await this.#scope.entities.getById(input.noteId);
    if (existing === null || entity === null || entity.type !== "note") {
      throw new Error("Note not found");
    }
    const references = await this.#resolveNoteReferences(input);

    let changed = false;
    if (input.title !== undefined) {
      const renamed = await this.#scope.entities.update(input.noteId, {
        title: input.title,
      });
      changed = changed || renamed.title !== entity.title;
    }
    if (input.content !== undefined && input.content !== null) {
      const result = await this.#scope.noteDetails.update(
        input.noteId,
        input.content,
      );
      changed = changed || result.changed;
      if (result.changed)
        await this.#reconcileBody(input.noteId, input.content);
    }
    if (input.tags !== undefined) {
      const result = await this.#scope.noteDetails.setTags(
        input.noteId,
        input.tags,
      );
      changed = changed || result.changed;
    }
    if (input.archived !== undefined) {
      const result = await this.#scope.noteDetails.setArchived(
        input.noteId,
        input.archived,
      );
      changed = changed || result.changed;
    }
    if (references.length > 0) {
      const linked = await this.#linkNote(input.noteId, references);
      changed = changed || linked;
    }
    if (changed) {
      await this.#audit.record({
        actor,
        action: "update_note",
        entityType: "note",
        entityId: input.noteId,
        summary: `Updated note: ${input.title ?? entity.title}`,
      });
    }
    return {
      note: (await this.#noteSummary(input.noteId)) ?? { id: input.noteId },
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
      related: relation(input),
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
    const today = await this.#scope.ownerTodayIso(this.#now);
    const task = await this.#scope.tasks.createTask({
      title: input.what,
      parent: relation(input),
      description: input.notes,
      delegation: {
        to: input.personOrSource,
        delegatedOn: input.createdDate ?? today,
        followUpOn: input.followUpDate ?? null,
        note: input.notes ?? null,
      },
    });
    const waiting = await this.#scope.tasks.setWaiting(task.id, {
      target: { kind: "text", note: input.personOrSource },
    });
    await this.#audit.record({
      actor,
      action,
      entityType: "task",
      entityId: task.id,
      summary: `Waiting for ${input.personOrSource}: ${task.title}`,
    });
    return { waiting: compactTask(waiting.task) };
  }

  async resolveWaitingFor(taskId: string, actor: ChiefOfStaffActor) {
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
}

// Kept outside the class to preserve the request union's exact capture input type.
export async function invokeChiefOfStaff(
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
      related: relation(input),
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
    const targetId = input.projectId ?? input.areaId;
    if (targetId) {
      // PROJ-03 / the shared Linked Items surface: `link.related` with the
      // record as the source is the ONE relationship DalyHub already uses to
      // file a Note under a Project or Area. An MCP capture must join that same
      // relationship rather than introduce a second, unlabelled link type.
      await scope.entityLinks.create({
        sourceEntityId: targetId,
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
