import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type {
  ChiefOfStaffActor,
  ChiefOfStaffRequest,
  ChiefOfStaffResult,
} from "~/kernel/chief-of-staff";

export const MCP_TOOL_NAMES = [
  "get_chief_of_staff_context",
  "get_weekly_review_context",
  "get_today",
  "get_projects",
  "get_project",
  "get_note",
  "search_dalyhub",
  "capture_item",
  "create_task",
  "update_task",
  "complete_task",
  "create_project",
  "update_project",
  "create_note",
  "update_note",
  "record_decision",
  "create_waiting_for",
  "resolve_waiting_for",
] as const;

type Invoke = (request: ChiefOfStaffRequest) => Promise<ChiefOfStaffResult>;

const id = z.string().trim().min(1).max(128);
const text = z.string().trim().min(1).max(512);
const longText = z.string().trim().max(8_000).nullable().optional();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();
const priority = z.enum(["p1", "p2", "p3", "p4"]).nullable().optional();
const status = z
  .enum(["todo", "in_progress", "on_hold", "cancelled"])
  .optional();
const projectStatus = z.enum(["planned", "active", "on_hold"]).optional();
/** A Note body. Bounded well below the kernel's 1 MiB Markdown limit. */
const noteContent = z.string().max(20_000).nullable().optional();
const noteTags = z
  .array(z.string().trim().min(1).max(40))
  .max(20)
  .optional()
  .describe("Replaces the Note's whole tag set; omit to leave tags unchanged.");
const references = {
  projectId: id
    .nullable()
    .optional()
    .describe("Exact existing Project ID; never a fuzzy title."),
  areaId: id
    .nullable()
    .optional()
    .describe("Exact existing Area ID; never a fuzzy title."),
};
/**
 * Where a Note is filed: the task references plus a Goal, because a Note may
 * document any of the three. Each id must be an EXACT existing record of that
 * NAMED type — a Project id passed as `areaId` is rejected, never silently
 * mis-filed — and each one supplied becomes its own relationship.
 */
const noteReferences = {
  ...references,
  goalId: id
    .nullable()
    .optional()
    .describe("Exact existing Goal ID; never a fuzzy title."),
};

function result(value: ChiefOfStaffResult) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

function failure(error: unknown) {
  const detail = error instanceof Error ? error.message : "";
  const message =
    detail.length <= 256 &&
    /(?:not found|does not exist|must |required|invalid|choose either|cannot |already )/i.test(
      detail,
    )
      ? detail
      : "DalyHub could not complete that request";
  return {
    isError: true,
    content: [
      { type: "text" as const, text: JSON.stringify({ error: message }) },
    ],
  };
}

export function createDalyHubMcpServer(
  invoke: Invoke,
  actorSubject: string,
): McpServer {
  const server = new McpServer({
    name: "dalyhub-chief-of-staff",
    version: "1.0.0",
  });
  const read = <T extends ChiefOfStaffRequest>(request: T) =>
    invoke(request).then(result).catch(failure);
  const write = <T extends Omit<ChiefOfStaffRequest, "actor">>(request: T) => {
    const actor: ChiefOfStaffActor = {
      subject: actorSubject,
      requestId: crypto.randomUUID(),
    };
    return invoke({ ...request, actor } as ChiefOfStaffRequest)
      .then(result)
      .catch(failure);
  };

  server.registerTool(
    "get_chief_of_staff_context",
    {
      description:
        "Read a bounded, actionable DalyHub snapshot for a daily Chief of Staff briefing: today, overdue/upcoming commitments, project next actions and stale projects, waiting items, open decisions, recent captures/completions, deadlines and goals. Read-only; use this first for broad briefing questions, not repeated granular searches.",
      inputSchema: {},
    },
    () => read({ action: "get_chief_of_staff_context" }),
  );
  server.registerTool(
    "get_weekly_review_context",
    {
      description:
        "Read the bounded facts needed for a weekly review: seven-day creates/completions, open commitments, overdue and waiting work, open decisions, project health/staleness, next-14-day deadlines and carry-over. Read-only and deterministic; Claude supplies judgement.",
      inputSchema: {},
    },
    () => read({ action: "get_weekly_review_context" }),
  );
  server.registerTool(
    "get_today",
    {
      description:
        "Read today's tasks plus overdue work and waiting follow-ups due, using DalyHub's configured owner timezone. Read-only. Use when the question is specifically about today's execution list rather than a full briefing.",
      inputSchema: {},
    },
    () => read({ action: "get_today" }),
  );
  server.registerTool(
    "get_projects",
    {
      description:
        "Read active/open Projects with concise progress, derived health and canonical next actions. Read-only. IDs are DalyHub entity IDs and should be reused in later write tools; do not guess an ID from a title.",
      inputSchema: {
        status: z.enum(["active", "planned", "on_hold"]).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    (input) => read({ action: "get_projects", input }),
  );
  server.registerTool(
    "get_project",
    {
      description:
        "Read one Project's title, status, health, canonical next action, open/waiting tasks, related Decisions, a bounded set of its linked Notes, deadlines, recent Activity and its Goal/Area. Read-only. Requires the exact Project ID returned by DalyHub.",
      inputSchema: { projectId: id },
    },
    (input) => read({ action: "get_project", input }),
  );
  server.registerTool(
    "get_note",
    {
      description:
        'Read one Note in full: title, Markdown body (bounded), tags and archive state. Read-only. Use it after search_dalyhub or get_project returns a Note ID and the excerpt is not enough — for example to answer "what context have I already captured about this?" from the owner\'s own words.',
      inputSchema: { noteId: id },
    },
    (input) => read({ action: "get_note", input }),
  );
  server.registerTool(
    "search_dalyhub",
    {
      description:
        "Search bounded user-facing DalyHub content across Tasks, Projects, Goals, Areas, Notes and Decisions. Every result carries its entity type, its exact ID and a short title/excerpt. Read-only. Call it BEFORE any write that links or that might duplicate something the owner already has; it does not accept SQL, field names or arbitrary filters.",
      inputSchema: {
        query: z.string().trim().min(1).max(200),
        limit: z.number().int().min(1).max(20).optional(),
      },
    },
    (input) => read({ action: "search_dalyhub", input }),
  );
  server.registerTool(
    "capture_item",
    {
      description:
        'WRITE: quick INTAKE of one bounded inbox item when the owner has not named a domain — "just capture this". task/reminder create Tasks; idea/note create Notes; decision captures an OPEN decision still to be made; waiting creates a waiting Task. When the owner explicitly means a Note, a Project or a recorded decision, prefer the dedicated tool (create_note, create_project, record_decision), which exposes that domain\'s own fields. Link only with exact existing IDs. It never creates a Project, Area or Goal, and never deletes data.',
      inputSchema: {
        type: z.enum([
          "task",
          "idea",
          "note",
          "decision",
          "waiting",
          "reminder",
        ]),
        title: text,
        text: longText,
        dueDate: date,
        person: z.string().trim().max(200).nullable().optional(),
        followUpDate: date,
        source: z.string().trim().max(200).nullable().optional(),
        context: longText,
        ...references,
      },
    },
    (input) => write({ action: "capture_item", input }),
  );
  server.registerTool(
    "create_task",
    {
      description:
        "WRITE: create one ordinary actionable Task, optionally under one exact existing Project or Area. Never creates a parent from a fuzzy name; search first when the ID is unknown. Does not complete or delete anything.",
      inputSchema: {
        title: text,
        notes: longText,
        dueDate: date,
        scheduledDate: date,
        priority,
        status,
        ...references,
      },
    },
    (input) => write({ action: "create_task", input }),
  );
  server.registerTool(
    "update_task",
    {
      description:
        "WRITE: make ordinary non-destructive edits to one existing Task. Omitted fields stay unchanged; explicit null clears nullable fields. Supplying projectId/areaId moves the Task to that exact parent; null for both makes it unassigned. Never deletes a Task.",
      inputSchema: {
        taskId: id,
        title: text.optional(),
        notes: longText,
        dueDate: date,
        scheduledDate: date,
        priority,
        status,
        ...references,
      },
    },
    (input) => write({ action: "update_task", input }),
  );
  server.registerTool(
    "complete_task",
    {
      description:
        "WRITE: mark one Task complete through DalyHub's canonical completion path. Idempotent: repeating the call returns changed=false and creates no duplicate completion or audit event. Does not delete the Task.",
      inputSchema: { taskId: id },
    },
    (input) => write({ action: "complete_task", input }),
  );
  server.registerTool(
    "create_project",
    {
      description:
        "WRITE: create one Project — an OUTCOME that needs several actions. Do NOT use it for a single errand (use create_task), and do NOT create a Project the owner may already have: search_dalyhub first and reuse the exact returned ID rather than making a near-duplicate because the wording differs. A Project needs exactly one parent, supplied as an exact existing areaId OR goalId. DalyHub Projects carry no outcome/description field — state the outcome as a Note with create_note(projectId=…). Never merges, links fuzzily, or deletes anything.",
      inputSchema: {
        title: text,
        areaId: id
          .optional()
          .describe("Exact existing Area ID. Supply this OR goalId, not both."),
        goalId: id
          .optional()
          .describe("Exact existing Goal ID. Supply this OR areaId, not both."),
        status: projectStatus,
      },
    },
    (input) => write({ action: "create_project", input }),
  );
  server.registerTool(
    "update_project",
    {
      description:
        "WRITE: make ordinary non-destructive edits to one existing Project: rename it, change its status, move it to an exact existing Area or Goal, complete/reopen it, or archive/restore it. Omitted fields stay unchanged; archiving and completion are both reversible here. Requires the exact Project ID. Never deletes a Project and never merges two Projects.",
      inputSchema: {
        projectId: id,
        title: text.optional(),
        status: projectStatus,
        areaId: id
          .optional()
          .describe("Move under this exact Area. Supply this OR goalId."),
        goalId: id
          .optional()
          .describe("Move under this exact Goal. Supply this OR areaId."),
        completed: z
          .boolean()
          .optional()
          .describe("true completes the Project; false reopens it."),
        archived: z
          .boolean()
          .optional()
          .describe(
            "true archives the Project; false restores it. Reversible.",
          ),
      },
    },
    (input) => write({ action: "update_project", input }),
  );
  server.registerTool(
    "create_note",
    {
      description:
        "WRITE: create one Note — retained CONTEXT or reference the owner should keep without it becoming an action: project background, meeting context, an observation, rationale, research, an explanation. Use it instead of create_task whenever nothing needs doing. File it under exact existing Project/Area/Goal IDs; search_dalyhub first when an ID is unknown. Notes are never deleted through this interface.",
      inputSchema: {
        title: text,
        content: noteContent.describe(
          "The Note's Markdown body. Plain prose; never a command, SQL, file path or URL to fetch.",
        ),
        tags: noteTags,
        ...noteReferences,
      },
    },
    (input) => write({ action: "create_note", input }),
  );
  server.registerTool(
    "update_note",
    {
      description:
        "WRITE: edit one existing Note — retitle it, REPLACE its body, replace its tag set, file it under further exact existing records, or archive/restore it. The body is replaced wholesale, so send the full intended text: read it with get_note first when you mean to add to it. Archiving puts a Note away reversibly; nothing here deletes a Note or removes an existing relationship.",
      inputSchema: {
        noteId: id,
        title: text.optional(),
        content: noteContent,
        tags: noteTags,
        archived: z
          .boolean()
          .optional()
          .describe("true puts the Note away; false brings it back."),
        ...noteReferences,
      },
    },
    (input) => write({ action: "update_note", input }),
  );
  server.registerTool(
    "record_decision",
    {
      description:
        "WRITE: record a decision and its rationale as a first-class DalyHub Decision, optionally related to one exact Project or Area, with decision/review dates. Use only after a choice has actually been made; use capture_item(type=decision) for an unresolved decision to make.",
      inputSchema: {
        decision: text,
        rationale: longText,
        decisionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reviewDate: date,
        ...references,
      },
    },
    (input) => write({ action: "record_decision", input }),
  );
  server.registerTool(
    "create_waiting_for",
    {
      description:
        "WRITE: create an active Task in DalyHub's canonical waiting state, preserving who/what is expected, optional follow-up date, notes and exact Project/Area relationship. Use for something the owner is waiting on; use create_task for work the owner must do.",
      inputSchema: {
        what: text,
        personOrSource: z.string().trim().min(1).max(200),
        createdDate: date,
        followUpDate: date,
        notes: longText,
        ...references,
      },
    },
    (input) => write({ action: "create_waiting_for", input }),
  );
  server.registerTool(
    "resolve_waiting_for",
    {
      description:
        "WRITE: clear one Task's active waiting state while retaining the Task and its full Activity history. Idempotent: an already-resolved item returns changed=false. This does not complete or delete the Task.",
      inputSchema: { taskId: id },
    },
    (input) => write({ action: "resolve_waiting_for", input }),
  );

  return server;
}
