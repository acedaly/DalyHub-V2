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
  "get_notes",
  "get_people",
  "get_person",
  "get_areas",
  "get_area",
  "get_goals",
  "get_goal",
  "get_decisions",
  "get_waiting_for",
  "search_dalyhub",
  "capture_item",
  "create_task",
  "update_task",
  "complete_task",
  "reopen_task",
  "create_project",
  "update_project",
  "create_person",
  "update_person",
  "create_area",
  "update_area",
  "create_goal",
  "update_goal",
  "create_note",
  "update_note",
  "record_decision",
  "create_waiting_for",
  "resolve_waiting_for",
] as const;

type Invoke = (request: ChiefOfStaffRequest) => Promise<ChiefOfStaffResult>;

/**
 * A reference to ONE existing DalyHub record: its exact id, or a name the owner
 * would use for it.
 *
 * The application layer resolves it (`reference-resolution`): an exact id wins;
 * otherwise an exact name, or a single unambiguous partial match, resolves; and
 * several plausible matches return an `ambiguous_reference` result naming the
 * candidates instead of writing anything. A reference never creates a record.
 */
const reference = z.string().trim().min(1).max(200);
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
const limit = (maximum: number) =>
  z.number().int().min(1).max(maximum).optional();
/** A Note body. Bounded well below the kernel's 1 MiB Markdown limit. */
const noteContent = z.string().max(20_000).nullable().optional();
const noteTags = z
  .array(z.string().trim().min(1).max(40))
  .max(20)
  .optional()
  .describe("Replaces the Note's whole tag set; omit to leave tags unchanged.");
const referenceList = (what: string) =>
  z
    .array(reference)
    .max(10)
    .optional()
    .describe(
      `${what} Each entry is an exact id or an unambiguous name. Supplying a list ADDS those relationships; it never removes one.`,
    );
const allowDuplicate = z
  .boolean()
  .optional()
  .describe(
    "Create even when DalyHub already holds a record with effectively the same name. Send it only after the owner has confirmed a second one is wanted.",
  );

const references = {
  projectId: reference
    .nullable()
    .optional()
    .describe("An existing Project, by exact id or unambiguous name."),
  areaId: reference
    .nullable()
    .optional()
    .describe("An existing Area, by exact id or unambiguous name."),
};
/**
 * Where a Note is filed: the task references plus a Goal and a Person, because
 * a Note may document any of the four. Each reference must resolve to a record
 * of the NAMED type — a Project supplied as `areaId` is rejected, never
 * silently mis-filed — and each one becomes its own relationship.
 */
const noteReferences = {
  ...references,
  goalId: reference
    .nullable()
    .optional()
    .describe("An existing Goal, by exact id or unambiguous name."),
  personId: reference
    .nullable()
    .optional()
    .describe(
      "An existing Person, by exact id or unambiguous name. Use this for “add a note to John's record”.",
    ),
};

/** The Person detail fields this interface writes. All optional; null clears. */
const personFields = {
  preferredName: z.string().trim().max(200).nullable().optional(),
  firstName: z.string().trim().max(200).nullable().optional(),
  lastName: z.string().trim().max(200).nullable().optional(),
  pronouns: z.string().trim().max(64).nullable().optional(),
  organisation: z.string().trim().max(200).nullable().optional(),
  role: z.string().trim().max(200).nullable().optional(),
  department: z.string().trim().max(200).nullable().optional(),
  email: z.string().trim().max(320).nullable().optional(),
  secondaryEmail: z.string().trim().max(320).nullable().optional(),
  mobile: z.string().trim().max(64).nullable().optional(),
  workPhone: z.string().trim().max(64).nullable().optional(),
  website: z.string().trim().max(4_096).nullable().optional(),
  birthday: date,
  relationship: z
    .enum([
      "friend",
      "family",
      "colleague",
      "volunteer",
      "customer",
      "supplier",
      "manager",
      "direct_report",
      "mentor",
      "mentee",
      "professional",
      "government",
      "emergency",
      "other",
    ])
    .nullable()
    .optional()
    .describe(
      "How the owner relates to this person. DalyHub's own vocabulary.",
    ),
  tags: z
    .array(z.string().trim().min(1).max(64))
    .max(50)
    .optional()
    .describe("Replaces the Person's whole tag set; omit to leave it alone."),
  notes: z.string().trim().max(20_000).nullable().optional(),
  followUpFrequency: z
    .enum([
      "weekly",
      "fortnightly",
      "monthly",
      "quarterly",
      "biannually",
      "annually",
    ])
    .nullable()
    .optional()
    .describe("How often the owner wants to stay in touch."),
  nextFollowUp: date,
  lastInteraction: date,
};

const personRelationships = {
  areaIds: referenceList("Areas this person is relevant to."),
  projectIds: referenceList("Projects this person is involved in."),
  goalIds: referenceList("Goals this person is relevant to."),
};

function result(value: ChiefOfStaffResult) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

/**
 * Pass a DOMAIN refusal through verbatim, and nothing else.
 *
 * "No project in DalyHub matches projectId: …" tells Claude exactly what to do
 * next; a storage error's text tells it nothing and could carry internals. So
 * the allowlist is a set of phrasings the domain layer owns, and everything
 * else becomes one flat sentence. An ambiguity or a possible duplicate never
 * arrives here — the service returns those as ordinary results.
 */
function failure(error: unknown) {
  const detail = error instanceof Error ? error.message : "";
  const message =
    detail.length <= 512 &&
    /(?:not found|does not exist|no [a-z]+ in dalyhub matches|must |required|invalid|choose either|cannot |already )/i.test(
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
    version: "1.1.0",
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

  /* ---------------------------------------------------------------------- */
  /* Briefings and search                                                    */
  /* ---------------------------------------------------------------------- */

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
    "search_dalyhub",
    {
      description:
        "Search bounded user-facing DalyHub content across Tasks, Projects, Goals, Areas, People, Notes and Decisions. Every result carries its entity type, its exact ID and a short title/excerpt. Read-only. Use it when a name is vague or several records might match; the write tools resolve an unambiguous name themselves. It does not accept SQL, field names or arbitrary filters.",
      inputSchema: {
        query: z.string().trim().min(1).max(200),
        limit: limit(20),
      },
    },
    (input) => read({ action: "search_dalyhub", input }),
  );

  /* ---------------------------------------------------------------------- */
  /* Projects                                                                */
  /* ---------------------------------------------------------------------- */

  server.registerTool(
    "get_projects",
    {
      description:
        "Read active/open Projects with concise progress, derived health and canonical next actions. Read-only. IDs are DalyHub entity IDs and are the safest thing to reuse in a later write tool.",
      inputSchema: {
        status: z.enum(["active", "planned", "on_hold"]).optional(),
        limit: limit(50),
      },
    },
    (input) => read({ action: "get_projects", input }),
  );
  server.registerTool(
    "get_project",
    {
      description:
        "Read one Project's title, status, health, canonical next action, open/waiting tasks, related Decisions, a bounded set of its linked Notes, deadlines, recent Activity and its Goal/Area. Read-only. Accepts the Project's exact ID or an unambiguous name.",
      inputSchema: { projectId: reference },
    },
    (input) => read({ action: "get_project", input }),
  );
  server.registerTool(
    "create_project",
    {
      description:
        'WRITE: create a finite OUTCOME or body of work — something with an end state, needing several actions. Do NOT use it for a single errand (create_task) or for an ongoing responsibility with no end (create_area). Associate it with an Area, or with a Goal it contributes to, by exact id or unambiguous name — exactly one parent. If DalyHub already has a Project with effectively this name the tool returns status "possible_duplicate" and writes nothing; reuse the existing one, or resend with allowDuplicate: true. DalyHub Projects carry no outcome/description field — state the outcome as a Note with create_note(projectId=…).',
      inputSchema: {
        title: text,
        areaId: reference
          .optional()
          .describe("The parent Area. Supply this OR goalId, not both."),
        goalId: reference
          .optional()
          .describe("The Goal this Project advances. Supply this OR areaId."),
        status: projectStatus,
        personIds: referenceList("People involved in this Project."),
        allowDuplicate,
      },
    },
    (input) => write({ action: "create_project", input }),
  );
  server.registerTool(
    "update_project",
    {
      description:
        "WRITE: make ordinary non-destructive edits to one existing Project: rename it, change its status, move it to an Area or Goal, relate People to it, complete/reopen it, or archive/restore it. PATCH semantics — omitted fields stay unchanged. Archiving and completion are both reversible here. Never deletes a Project and never merges two Projects.",
      inputSchema: {
        projectId: reference,
        title: text.optional(),
        status: projectStatus,
        areaId: reference
          .optional()
          .describe("Move under this Area. Supply this OR goalId."),
        goalId: reference
          .optional()
          .describe("Move under this Goal. Supply this OR areaId."),
        personIds: referenceList("People involved in this Project."),
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

  /* ---------------------------------------------------------------------- */
  /* Areas                                                                   */
  /* ---------------------------------------------------------------------- */

  server.registerTool(
    "get_areas",
    {
      description:
        "Read the owner's Areas — their long-running responsibilities — with goal, project and task roll-ups. Read-only. Use it to find the right Area before filing work, and to answer “what am I responsible for?”.",
      inputSchema: {
        query: z
          .string()
          .trim()
          .max(200)
          .optional()
          .describe("Optional case-insensitive filter on the Area's name."),
        limit: limit(50),
      },
    },
    (input) => read({ action: "get_areas", input }),
  );
  server.registerTool(
    "get_area",
    {
      description:
        "Read one Area's full Chief-of-Staff context: its Goals, the Projects aligned to it, its open direct tasks, its waiting items, its People, its Notes and its Decisions — each list bounded. Read-only. Accepts the Area's exact ID or an unambiguous name.",
      inputSchema: { areaId: reference },
    },
    (input) => read({ action: "get_area", input }),
  );
  server.registerTool(
    "create_area",
    {
      description:
        "WRITE: create a new long-running AREA OF RESPONSIBILITY in DalyHub — an ongoing part of the owner's life that is maintained rather than finished (Work, Health, Finances, Home, a specific programme). Do NOT use it for a finite outcome, which belongs as a Project: if the thing can be completed, it is not an Area. An Area is the top of DalyHub's hierarchy and has no parent. If an Area with effectively this name already exists the tool returns status \"possible_duplicate\" and writes nothing.",
      inputSchema: {
        title: text.describe(
          "The Area's name. DalyHub Areas carry no description, purpose or review-cadence field; put that context in a Note filed under the Area.",
        ),
        allowDuplicate,
      },
    },
    (input) => write({ action: "create_area", input }),
  );
  server.registerTool(
    "update_area",
    {
      description:
        "WRITE: rename an Area, or archive/restore it. PATCH semantics — omitted fields stay unchanged. Archiving hides the Area from active collections and pickers while keeping every Goal, Project, Task, relationship and history row intact, and is reversible through this same tool. There is no Area deletion on this interface.",
      inputSchema: {
        areaId: reference,
        title: text.optional(),
        archived: z
          .boolean()
          .optional()
          .describe("true archives the Area; false restores it. Reversible."),
      },
    },
    (input) => write({ action: "update_area", input }),
  );

  /* ---------------------------------------------------------------------- */
  /* Goals                                                                   */
  /* ---------------------------------------------------------------------- */

  server.registerTool(
    "get_goals",
    {
      description:
        "Read the owner's Goals with their Area, target date, condition and completion state. Read-only. Filter to one Area to answer “what am I aiming at in Career?”.",
      inputSchema: {
        areaId: reference
          .optional()
          .describe(
            "Only Goals in this Area, by exact id or unambiguous name.",
          ),
        state: z.enum(["open", "completed", "all"]).optional(),
        limit: limit(50),
      },
    },
    (input) => read({ action: "get_goals", input }),
  );
  server.registerTool(
    "get_goal",
    {
      description:
        "Read one Goal: its Area, target date, definition of done, condition, the exact contribution of the Projects advancing it, and its related People and Notes. Read-only. Accepts the Goal's exact ID or an unambiguous name.",
      inputSchema: { goalId: reference },
    },
    (input) => read({ action: "get_goal", input }),
  );
  server.registerTool(
    "create_goal",
    {
      description:
        'WRITE: create a desired measurable OUTCOME the owner is aiming at — “reach 70 kg”, “secure a substantive 10/11 role”. Projects contribute toward a Goal; a Goal itself is not a body of work, so do not use it for something with a task list (create_project) or for an ongoing responsibility (create_area). A Goal always belongs to exactly one Area. If a Goal with effectively this name exists the tool returns status "possible_duplicate" and writes nothing.',
      inputSchema: {
        title: text,
        areaId: reference.describe(
          "The Area this Goal belongs to, by exact id or unambiguous name. Required.",
        ),
        targetDate: date.describe(
          "An owner-calendar target date (YYYY-MM-DD). A deadline the owner is aiming for — never an automatic completion trigger.",
        ),
        definitionOfDone: z
          .string()
          .trim()
          .max(8_000)
          .nullable()
          .optional()
          .describe("Plain text (not Markdown): what finished looks like."),
        projectIds: referenceList(
          "Existing Projects to attach to this Goal, by moving them under it.",
        ),
        allowDuplicate,
      },
    },
    (input) => write({ action: "create_goal", input }),
  );
  server.registerTool(
    "update_goal",
    {
      description:
        "WRITE: rename a Goal, move it to another Area, set its target date or definition of done, set it aside or resume pursuing it, or complete/reopen it. PATCH semantics — omitted fields stay unchanged; an explicit null clears a nullable field. Never deletes a Goal. To move a Project onto a Goal, use update_project(goalId=…).",
      inputSchema: {
        goalId: reference,
        title: text.optional(),
        areaId: reference.optional().describe("Move the Goal to this Area."),
        targetDate: date,
        definitionOfDone: z.string().trim().max(8_000).nullable().optional(),
        condition: z
          .enum(["pursuing", "set_aside"])
          .optional()
          .describe(
            "The owner's own intent. “set_aside” means deliberately put down for now — it is not a verdict on progress, and it is not archiving.",
          ),
        completed: z
          .boolean()
          .optional()
          .describe("true completes the Goal; false reopens it."),
      },
    },
    (input) => write({ action: "update_goal", input }),
  );

  /* ---------------------------------------------------------------------- */
  /* People                                                                  */
  /* ---------------------------------------------------------------------- */

  server.registerTool(
    "get_people",
    {
      description:
        "List or search the People the owner knows, returning compact summaries. Read-only. Filter by free text, by lifecycle status, or to the People related to one Project or Area. Use it before create_person so an existing contact is reused rather than duplicated.",
      inputSchema: {
        query: z
          .string()
          .trim()
          .max(200)
          .optional()
          .describe(
            "Matches name, preferred name, organisation, role, email and tags.",
          ),
        status: z.enum(["active", "archived", "all"]).optional(),
        areaId: reference
          .optional()
          .describe("Only People related to this Area."),
        projectId: reference
          .optional()
          .describe("Only People related to this Project."),
        limit: limit(50),
      },
    },
    (input) => read({ action: "get_people", input }),
  );
  server.registerTool(
    "get_person",
    {
      description:
        "Read one Person and the Chief-of-Staff context around them: who they are, their contact details and context notes, the Areas/Goals/Projects/Notes/Meetings they are related to, their open tasks, what the owner is waiting on them for, and the shape of the shared history. Read-only and bounded. Accepts the Person's exact ID or an unambiguous name; two people with the same name return an ambiguity response rather than a guess.",
      inputSchema: { personId: reference },
    },
    (input) => read({ action: "get_person", input }),
  );
  server.registerTool(
    "create_person",
    {
      description:
        'WRITE: create a person/contact known to the owner, so DalyHub can associate work, notes and follow-ups with them. Use it whenever the owner names someone to remember — “add Sarah as a person”, “create John Smith, District Manager at Orana” — rather than capturing the sentence as a note. Check get_people first: if an existing Person has effectively the same name or the same email, the tool returns status "possible_duplicate" and writes nothing, so reuse that record or resend with allowDuplicate: true. Relationships to Areas, Projects and Goals can be set here in the same call.',
      inputSchema: {
        name: text.describe("The person's display name. Required."),
        ...personFields,
        ...personRelationships,
        allowDuplicate,
      },
    },
    (input) => write({ action: "create_person", input }),
  );
  server.registerTool(
    "update_person",
    {
      description:
        "WRITE: update one Person — their role, organisation, contact details, context notes, tags, follow-up cadence or relationships — or archive/restore them. PATCH semantics: an omitted field is left exactly as it is, and an explicit null clears that one field. Tags are the exception and replace the whole set. Never deletes a Person.",
      inputSchema: {
        personId: reference,
        name: text.optional().describe("Rename the person's display name."),
        ...personFields,
        ...personRelationships,
        archived: z
          .boolean()
          .optional()
          .describe("true archives the Person; false restores them."),
      },
    },
    (input) => write({ action: "update_person", input }),
  );

  /* ---------------------------------------------------------------------- */
  /* Tasks                                                                   */
  /* ---------------------------------------------------------------------- */

  server.registerTool(
    "create_task",
    {
      description:
        "WRITE: create one ordinary actionable Task — a single thing to be done. Optionally file it under a Project or an Area (one, not both) and relate it to a Person. Parents are resolved by exact id or unambiguous name; a name matching several records returns an ambiguity response and writes nothing. It never creates a Project or Area, and never completes or deletes anything.",
      inputSchema: {
        title: text,
        notes: longText,
        dueDate: date.describe("When it is DUE (YYYY-MM-DD)."),
        scheduledDate: date.describe(
          "When the owner plans to DO it (YYYY-MM-DD) — DalyHub's defer/plan date, distinct from the due date.",
        ),
        priority,
        status,
        personId: reference
          .nullable()
          .optional()
          .describe("A Person this Task concerns."),
        ...references,
      },
    },
    (input) => write({ action: "create_task", input }),
  );
  server.registerTool(
    "update_task",
    {
      description:
        "WRITE: make ordinary non-destructive edits to one existing Task. PATCH semantics — omitted fields stay unchanged; an explicit null clears a nullable field. Supplying projectId/areaId MOVES the Task to that parent; null for both makes it unassigned. Never deletes a Task. To finish one use complete_task; to un-finish one use reopen_task.",
      inputSchema: {
        taskId: reference,
        title: text.optional(),
        notes: longText,
        dueDate: date,
        scheduledDate: date,
        priority,
        status,
        personId: reference
          .nullable()
          .optional()
          .describe("A Person this Task concerns."),
        ...references,
      },
    },
    (input) => write({ action: "update_task", input }),
  );
  server.registerTool(
    "complete_task",
    {
      description:
        "WRITE: mark one Task complete through DalyHub's canonical completion path. Accepts the Task's exact ID or an unambiguous title. Idempotent: repeating the call returns changed=false and creates no duplicate completion or audit event. Does not delete the Task.",
      inputSchema: { taskId: reference },
    },
    (input) => write({ action: "complete_task", input }),
  );
  server.registerTool(
    "reopen_task",
    {
      description:
        "WRITE: reopen one completed Task, clearing its completion through the same canonical path that set it. Idempotent: an already-open Task returns changed=false. Use it when something was marked done too early; it is the exact reverse of complete_task.",
      inputSchema: { taskId: reference },
    },
    (input) => write({ action: "reopen_task", input }),
  );

  /* ---------------------------------------------------------------------- */
  /* Notes                                                                   */
  /* ---------------------------------------------------------------------- */

  server.registerTool(
    "get_notes",
    {
      description:
        "List the owner's Notes with a bounded excerpt each, optionally filtered by text, tag, Project or Area. Read-only. Use it to see what context already exists; use get_note when the excerpt is not enough.",
      inputSchema: {
        query: z.string().trim().max(200).optional(),
        tag: z.string().trim().max(64).optional(),
        projectId: reference.optional(),
        areaId: reference.optional(),
        state: z
          .enum(["active", "archived"])
          .optional()
          .describe("One lifecycle bucket at a time. Defaults to active."),
        limit: limit(50),
      },
    },
    (input) => read({ action: "get_notes", input }),
  );
  server.registerTool(
    "get_note",
    {
      description:
        'Read one Note in full: title, Markdown body (bounded), tags and archive state. Read-only. Use it after search_dalyhub, get_notes or get_project returns a Note and the excerpt is not enough — for example to answer "what context have I already captured about this?" from the owner\'s own words.',
      inputSchema: { noteId: reference },
    },
    (input) => read({ action: "get_note", input }),
  );
  server.registerTool(
    "create_note",
    {
      description:
        "WRITE: create one Note — retained CONTEXT or reference the owner should keep without it becoming an action: project background, meeting context, an observation, rationale, research, an explanation. Use it instead of create_task whenever nothing needs doing. File it under a Project, Area, Goal and/or Person by exact id or unambiguous name; each becomes a real relationship visible on both records. Notes are never deleted through this interface.",
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
        "WRITE: edit one existing Note — retitle it, REPLACE its body, replace its tag set, file it under further records, or archive/restore it. The body is replaced wholesale, so send the full intended text: read it with get_note first when you mean to add to it. Archiving puts a Note away reversibly; nothing here deletes a Note or removes an existing relationship.",
      inputSchema: {
        noteId: reference,
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

  /* ---------------------------------------------------------------------- */
  /* Capture, decisions and waiting                                          */
  /* ---------------------------------------------------------------------- */

  server.registerTool(
    "capture_item",
    {
      description:
        'WRITE: capture unstructured information when it does not yet have a clear typed destination — "just capture this". PREFER the typed creation tool whenever the owner names the object: a person is create_person, an area is create_area, a project is create_project, a goal is create_goal, a note is create_note, a recorded choice is record_decision. task/reminder create Tasks; idea/note create Notes; decision captures an OPEN decision still to be made; waiting creates a waiting Task. It never creates a Person, Project, Area or Goal, and never deletes data.',
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
    "get_decisions",
    {
      description:
        "Read recorded and open Decisions, optionally narrowed to one status or to the Project or Area they relate to. Read-only. Use it to answer “what did we decide about X, and why?” and to surface decisions still to be made during a review.",
      inputSchema: {
        status: z
          .enum(["open", "decided"])
          .optional()
          .describe(
            "open = still to be made; decided = the outcome was recorded.",
          ),
        projectId: reference.optional(),
        areaId: reference.optional(),
        limit: limit(50),
      },
    },
    (input) => read({ action: "get_decisions", input }),
  );
  server.registerTool(
    "record_decision",
    {
      description:
        "WRITE: record a decision and its rationale as a first-class DalyHub Decision, optionally related to one Project or Area, with decision/review dates. Use only after a choice has actually been made; use capture_item(type=decision) for an unresolved decision to make.",
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
    "get_waiting_for",
    {
      description:
        "Read what the owner is waiting on other people for, newest chase first, optionally narrowed by follow-up state or to one Person, Project or Area. Read-only. Use it during a review, or to answer “what am I waiting on John for?”.",
      inputSchema: {
        followUp: z
          .enum(["due", "due_today", "overdue", "upcoming", "none"])
          .optional(),
        personId: reference.optional(),
        projectId: reference.optional(),
        areaId: reference.optional(),
        limit: limit(50),
      },
    },
    (input) => read({ action: "get_waiting_for", input }),
  );
  server.registerTool(
    "create_waiting_for",
    {
      description:
        "WRITE: record something the owner is waiting on someone else for — “waiting on Andrew to confirm the finance presenter”. Creates a Task in DalyHub's canonical waiting state with the follow-up date, notes and Project/Area relationship. Name the person with personId when they have a DalyHub record (the item then appears on their record and survives a rename); use personOrSource for a party with no record. Use create_task instead for work the owner must do.",
      inputSchema: {
        what: text.describe("What is owed."),
        personId: reference
          .nullable()
          .optional()
          .describe(
            "The Person waited on, by exact id or unambiguous name. Preferred over personOrSource.",
          ),
        personOrSource: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .optional()
          .describe(
            "Who or what is owed, as free text, when there is no Person record. Supply this OR personId.",
          ),
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
      inputSchema: { taskId: reference },
    },
    (input) => write({ action: "resolve_waiting_for", input }),
  );

  return server;
}
