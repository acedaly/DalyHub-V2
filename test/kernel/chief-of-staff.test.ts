import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import type {
  ChiefOfStaffActor,
  ChiefOfStaffResult,
} from "~/kernel/chief-of-staff";
import { invokeChiefOfStaff } from "~/platform/chief-of-staff/chief-of-staff-service.server";

import { makeContext, makeSpineRepository, resetTables } from "./support";

const WS = "ws_chief_of_staff";
const actor: ChiefOfStaffActor = {
  subject: "access-subject-123",
  requestId: "request-123",
};
const serviceEnv = () => ({ DB: env.DB, DEFAULT_WORKSPACE_ID: WS });

function rows<T>(result: ChiefOfStaffResult, key: string): readonly T[] {
  return result[key] as readonly T[];
}

beforeEach(async () => {
  await resetTables([WS]);
});

describe("Chief of Staff service boundary", () => {
  it("creates, updates and idempotently completes Tasks while appending MCP audit events", async () => {
    const spine = makeSpineRepository(makeContext(WS));
    const area = await spine.createArea({ title: "Work" });
    const project = await spine.createProject({
      title: "OpO project",
      parent: { kind: "area", id: area.id },
    });

    const created = await invokeChiefOfStaff(serviceEnv(), {
      action: "create_task",
      actor,
      input: {
        title: "Confirm finance dates",
        projectId: project.id,
        dueDate: "2026-09-25",
        priority: "p1",
      },
    });
    const taskId = (created.task as { id: string }).id;

    const updated = await invokeChiefOfStaff(serviceEnv(), {
      action: "update_task",
      actor,
      input: { taskId, title: "Confirm delivery dates", notes: "Ask finance." },
    });
    expect(updated.changed).toBe(true);

    const first = await invokeChiefOfStaff(serviceEnv(), {
      action: "complete_task",
      actor,
      input: { taskId },
    });
    const second = await invokeChiefOfStaff(serviceEnv(), {
      action: "complete_task",
      actor,
      input: { taskId },
    });
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);

    const audit = await env.DB.prepare(
      `SELECT actor_type, actor_id, payload_json
       FROM activities
       WHERE workspace_id = ? AND type = 'mcp.mutation'
       ORDER BY occurred_at, id`,
    )
      .bind(WS)
      .all<{ actor_type: string; actor_id: string; payload_json: string }>();
    expect(audit.results).toHaveLength(3);
    expect(audit.results.map((row) => row.actor_type)).toEqual([
      "mcp",
      "mcp",
      "mcp",
    ]);
    expect(audit.results.map((row) => row.actor_id)).toEqual([
      actor.subject,
      actor.subject,
      actor.subject,
    ]);
    expect(
      audit.results.map((row) => JSON.parse(row.payload_json).action),
    ).toEqual(["create_task", "update_task", "complete_task"]);
  });

  it("captures Notes and Decisions and creates/resolves canonical waiting items", async () => {
    const captured = await invokeChiefOfStaff(serviceEnv(), {
      action: "capture_item",
      actor,
      input: {
        type: "idea",
        title: "Explore a quarterly planning template",
        text: "Keep this as reference, not an action.",
        source: "Claude conversation",
      },
    });
    expect(captured.item).toMatchObject({ type: "idea" });

    const decision = await invokeChiefOfStaff(serviceEnv(), {
      action: "record_decision",
      actor,
      input: {
        decision: "Use a private Service Binding",
        rationale: "Claude should never receive D1 access.",
        decisionDate: "2026-09-20",
        reviewDate: "2026-12-20",
      },
    });
    expect(decision.decision).toMatchObject({ status: "decided" });

    const waiting = await invokeChiefOfStaff(serviceEnv(), {
      action: "create_waiting_for",
      actor,
      input: {
        what: "Finance delivery dates",
        personOrSource: "John",
        followUpDate: "2026-09-23",
      },
    });
    const waitingId = (waiting.waiting as { id: string }).id;
    expect(waiting.waiting).toMatchObject({
      waitingOn: "John",
      followUpOn: "2026-09-23",
    });

    const first = await invokeChiefOfStaff(serviceEnv(), {
      action: "resolve_waiting_for",
      actor,
      input: { taskId: waitingId },
    });
    const second = await invokeChiefOfStaff(serviceEnv(), {
      action: "resolve_waiting_for",
      actor,
      input: { taskId: waitingId },
    });
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);

    const search = await invokeChiefOfStaff(serviceEnv(), {
      action: "search_dalyhub",
      input: { query: "Service Binding" },
    });
    expect(rows<{ type: string }>(search, "results")).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "decision" })]),
    );
  });

  it("builds bounded daily and weekly contexts using Australia/Sydney calendar dates across DST", async () => {
    await invokeChiefOfStaff(
      serviceEnv(),
      {
        action: "create_task",
        actor,
        input: { title: "Sunday boundary", dueDate: "2026-10-04" },
      },
      new Date("2026-10-03T14:30:00.000Z"),
    );
    await invokeChiefOfStaff(
      serviceEnv(),
      {
        action: "create_task",
        actor,
        input: { title: "Monday boundary", dueDate: "2026-10-05" },
      },
      new Date("2026-10-04T13:30:00.000Z"),
    );
    await invokeChiefOfStaff(serviceEnv(), {
      action: "capture_item",
      actor,
      input: { type: "decision", title: "Choose the review cadence" },
    });

    const sunday = await invokeChiefOfStaff(
      serviceEnv(),
      { action: "get_today" },
      new Date("2026-10-03T14:30:00.000Z"),
    );
    expect(sunday.timezone).toBe("Australia/Sydney");
    expect(
      rows<{ title: string }>(sunday, "today").map((item) => item.title),
    ).toContain("Sunday boundary");
    expect(
      rows<{ title: string }>(sunday, "today").map((item) => item.title),
    ).not.toContain("Monday boundary");

    const monday = await invokeChiefOfStaff(
      serviceEnv(),
      { action: "get_chief_of_staff_context" },
      new Date("2026-10-04T13:30:00.000Z"),
    );
    expect(
      rows<{ title: string }>(monday, "today").map((item) => item.title),
    ).toContain("Monday boundary");
    expect(rows(monday, "unresolvedDecisions")).toHaveLength(1);

    const weekly = await invokeChiefOfStaff(
      serviceEnv(),
      { action: "get_weekly_review_context" },
      new Date("2026-10-04T13:30:00.000Z"),
    );
    expect(weekly.window).toEqual({ from: "2026-09-29", to: "2026-10-05" });
    expect(rows(weekly, "incompleteCommitments")).toHaveLength(2);
    expect(rows(weekly, "unresolvedDecisions")).toHaveLength(1);
  });
});

describe("Chief of Staff Projects and Notes", () => {
  it("creates and maintains a Project through DalyHub's own spine and settings", async () => {
    const spine = makeSpineRepository(makeContext(WS));
    const area = await spine.createArea({ title: "Work" });
    const goal = await spine.createGoal({
      title: "Ship 3.1",
      areaId: area.id,
    });

    const created = await invokeChiefOfStaff(serviceEnv(), {
      action: "create_project",
      actor,
      input: { title: "DalyHub Chief of Staff", areaId: area.id },
    });
    const project = created.project as {
      id: string;
      title: string;
      status: string;
      area: { id: string } | null;
    };
    expect(project).toMatchObject({
      title: "DalyHub Chief of Staff",
      status: "planned",
      area: { id: area.id },
    });

    const updated = await invokeChiefOfStaff(serviceEnv(), {
      action: "update_project",
      actor,
      input: {
        projectId: project.id,
        title: "Chief of Staff MCP",
        status: "active",
        goalId: goal.id,
      },
    });
    expect(updated.changed).toBe(true);
    expect(updated.project).toMatchObject({
      title: "Chief of Staff MCP",
      status: "active",
      goal: { id: goal.id },
    });

    // An update that changes nothing is an honest no-op, not a second audit row.
    const again = await invokeChiefOfStaff(serviceEnv(), {
      action: "update_project",
      actor,
      input: { projectId: project.id, status: "active" },
    });
    expect(again.changed).toBe(false);

    const audit = await env.DB.prepare(
      `SELECT payload_json FROM activities
       WHERE workspace_id = ? AND type = 'mcp.mutation'
       ORDER BY occurred_at, id`,
    )
      .bind(WS)
      .all<{ payload_json: string }>();
    expect(
      audit.results.map((row) => JSON.parse(row.payload_json).action),
    ).toEqual(["create_project", "update_project"]);
    expect(JSON.parse(audit.results[0]!.payload_json)).toMatchObject({
      source: "claude_mcp",
      entityType: "project",
    });
  });

  it("refuses a Project without exactly one parent, and an unknown Project id", async () => {
    const spine = makeSpineRepository(makeContext(WS));
    const area = await spine.createArea({ title: "Work" });
    const goal = await spine.createGoal({
      title: "Ship 3.1",
      areaId: area.id,
    });

    await expect(
      invokeChiefOfStaff(serviceEnv(), {
        action: "create_project",
        actor,
        input: { title: "No parent" },
      }),
    ).rejects.toThrow(/exactly one parent/i);
    await expect(
      invokeChiefOfStaff(serviceEnv(), {
        action: "create_project",
        actor,
        input: { title: "Two parents", areaId: area.id, goalId: goal.id },
      }),
    ).rejects.toThrow(/exactly one parent/i);
    await expect(
      invokeChiefOfStaff(serviceEnv(), {
        action: "create_project",
        actor,
        input: { title: "Missing area", areaId: "does-not-exist" },
      }),
    ).rejects.toThrow();
    await expect(
      invokeChiefOfStaff(serviceEnv(), {
        action: "update_project",
        actor,
        input: { projectId: "does-not-exist", title: "Nope" },
      }),
    ).rejects.toThrow(/not found/i);

    // Nothing was written by any refused call.
    const projects = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM entities WHERE workspace_id = ? AND type = 'project'",
    )
      .bind(WS)
      .first<{ n: number }>();
    expect(projects?.n).toBe(0);
  });

  it("cannot reach a Project in another workspace", async () => {
    const other = "ws_chief_of_staff_other";
    await resetTables([WS, other]);
    const otherSpine = makeSpineRepository(makeContext(other));
    const otherArea = await otherSpine.createArea({ title: "Elsewhere" });
    const otherProject = await otherSpine.createProject({
      title: "Not yours",
      parent: { kind: "area", id: otherArea.id },
    });

    await expect(
      invokeChiefOfStaff(serviceEnv(), {
        action: "update_project",
        actor,
        input: { projectId: otherProject.id, title: "Renamed" },
      }),
    ).rejects.toThrow(/not found/i);
    await expect(
      invokeChiefOfStaff(serviceEnv(), {
        action: "create_note",
        actor,
        input: { title: "Cross-workspace", projectId: otherProject.id },
      }),
    ).rejects.toThrow(/no project exists/i);

    const still = await otherSpine.getById(otherProject.id);
    expect(still?.title).toBe("Not yours");
  });

  it("creates, retrieves and updates a Note filed under a Project", async () => {
    const spine = makeSpineRepository(makeContext(WS));
    const area = await spine.createArea({ title: "Work" });
    const project = await spine.createProject({
      title: "OpO3",
      parent: { kind: "area", id: area.id },
    });

    const created = await invokeChiefOfStaff(serviceEnv(), {
      action: "create_note",
      actor,
      input: {
        title: "Why Control 2 stayed in OpO3",
        content:
          "Candidates at that level are moving toward 2IC/acting management responsibilities.",
        tags: ["opo", "assessment"],
        projectId: project.id,
      },
    });
    const note = created.note as { id: string; tags: readonly string[] };
    expect(note.tags).toEqual(["assessment", "opo"]);

    const read = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_note",
      input: { noteId: note.id },
    });
    expect(read.note).toMatchObject({
      title: "Why Control 2 stayed in OpO3",
      contentTruncated: false,
    });
    expect((read.note as { content: string }).content).toContain("2IC");

    // The Note is filed as PROJ-03 Project Knowledge — the SAME `link.related`
    // relationship the app's Linked Items surface shows, not a private type.
    const link = await env.DB.prepare(
      `SELECT type, source_entity_id, target_entity_id FROM entity_links
       WHERE workspace_id = ? AND deleted_at IS NULL`,
    )
      .bind(WS)
      .all<{
        type: string;
        source_entity_id: string;
        target_entity_id: string;
      }>();
    expect(link.results).toEqual(
      expect.arrayContaining([
        {
          type: "link.related",
          source_entity_id: project.id,
          target_entity_id: note.id,
        },
      ]),
    );

    const context = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_project",
      input: { projectId: project.id },
    });
    expect(rows<{ id: string }>(context, "notes").map((row) => row.id)).toEqual(
      [note.id],
    );

    const updated = await invokeChiefOfStaff(serviceEnv(), {
      action: "update_note",
      actor,
      input: {
        noteId: note.id,
        title: "Control 2 rationale",
        content: "Revised rationale.",
        archived: true,
      },
    });
    expect(updated.changed).toBe(true);
    expect(updated.note).toMatchObject({
      title: "Control 2 rationale",
      archived: true,
    });

    const unchanged = await invokeChiefOfStaff(serviceEnv(), {
      action: "update_note",
      actor,
      input: { noteId: note.id, content: "Revised rationale." },
    });
    expect(unchanged.changed).toBe(false);

    const audit = await env.DB.prepare(
      `SELECT payload_json FROM activities
       WHERE workspace_id = ? AND type = 'mcp.mutation'
       ORDER BY occurred_at, id`,
    )
      .bind(WS)
      .all<{ payload_json: string }>();
    expect(
      audit.results.map((row) => JSON.parse(row.payload_json).action),
    ).toEqual(["create_note", "update_note"]);
    expect(JSON.parse(audit.results[0]!.payload_json)).toMatchObject({
      entityType: "note",
      source: "claude_mcp",
    });
  });

  it("refuses a Note filed against the wrong kind of record, writing nothing", async () => {
    const spine = makeSpineRepository(makeContext(WS));
    const area = await spine.createArea({ title: "Work" });
    const project = await spine.createProject({
      title: "OpO3",
      parent: { kind: "area", id: area.id },
    });

    // A Project id supplied as `areaId` is a validation failure, never a
    // silently mis-filed Note.
    await expect(
      invokeChiefOfStaff(serviceEnv(), {
        action: "create_note",
        actor,
        input: { title: "Mis-filed", areaId: project.id },
      }),
    ).rejects.toThrow(/no area exists/i);
    await expect(
      invokeChiefOfStaff(serviceEnv(), {
        action: "create_note",
        actor,
        input: { title: "Missing goal", goalId: "does-not-exist" },
      }),
    ).rejects.toThrow(/no goal exists/i);
    await expect(
      invokeChiefOfStaff(serviceEnv(), {
        action: "update_note",
        actor,
        input: { noteId: project.id, title: "Not a note" },
      }),
    ).rejects.toThrow(/not found/i);

    const notes = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM entities WHERE workspace_id = ? AND type = 'note' AND deleted_at IS NULL",
    )
      .bind(WS)
      .first<{ n: number }>();
    expect(notes?.n).toBe(0);
  });

  it("gives every entity type a share of the bounded result set", async () => {
    const spine = makeSpineRepository(makeContext(WS));
    const area = await spine.createArea({ title: "Reporting" });
    // Enough matching Tasks to eat a naive concatenate-then-truncate budget.
    for (let index = 0; index < 12; index += 1) {
      await invokeChiefOfStaff(serviceEnv(), {
        action: "create_task",
        actor,
        input: { title: `Reporting task ${index}`, areaId: area.id },
      });
    }
    const note = (
      await invokeChiefOfStaff(serviceEnv(), {
        action: "create_note",
        actor,
        input: { title: "Reporting background", areaId: area.id },
      })
    ).note as { id: string };

    const found = await invokeChiefOfStaff(serviceEnv(), {
      action: "search_dalyhub",
      input: { query: "reporting" },
    });
    const results = rows<{ type: string; id: string }>(found, "results");
    expect(results.length).toBeLessThanOrEqual(20);
    expect(results.map((row) => row.id)).toContain(note.id);
    expect(results.map((row) => row.type)).toContain("area");
  });

  it("does not re-audit a Note relationship that already exists", async () => {
    const spine = makeSpineRepository(makeContext(WS));
    const area = await spine.createArea({ title: "Work" });
    const project = await spine.createProject({
      title: "OpO3",
      parent: { kind: "area", id: area.id },
    });
    const note = (
      await invokeChiefOfStaff(serviceEnv(), {
        action: "create_note",
        actor,
        input: { title: "Background", projectId: project.id },
      })
    ).note as { id: string };

    const again = await invokeChiefOfStaff(serviceEnv(), {
      action: "update_note",
      actor,
      input: { noteId: note.id, projectId: project.id },
    });
    expect(again.changed).toBe(false);

    const audit = await env.DB.prepare(
      `SELECT payload_json FROM activities
       WHERE workspace_id = ? AND type = 'mcp.mutation'`,
    )
      .bind(WS)
      .all<{ payload_json: string }>();
    expect(
      audit.results.map((row) => JSON.parse(row.payload_json).action),
    ).toEqual(["create_note"]);
  });

  it("returns Projects and Notes from search with their type, exact id and context", async () => {
    const spine = makeSpineRepository(makeContext(WS));
    const area = await spine.createArea({ title: "Work" });
    const project = (
      await invokeChiefOfStaff(serviceEnv(), {
        action: "create_project",
        actor,
        input: { title: "Quarterly reporting overhaul", areaId: area.id },
      })
    ).project as { id: string };
    const note = (
      await invokeChiefOfStaff(serviceEnv(), {
        action: "create_note",
        actor,
        input: {
          title: "Reporting background",
          content: "The quarterly reporting cadence was set in 2024.",
          projectId: project.id,
        },
      })
    ).note as { id: string };

    const found = await invokeChiefOfStaff(serviceEnv(), {
      action: "search_dalyhub",
      input: { query: "reporting" },
    });
    const results = rows<{ type: string; id: string; title: string }>(
      found,
      "results",
    );
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "project",
          id: project.id,
          title: "Quarterly reporting overhaul",
        }),
        expect.objectContaining({
          type: "note",
          id: note.id,
          title: "Reporting background",
        }),
      ]),
    );
  });
});
