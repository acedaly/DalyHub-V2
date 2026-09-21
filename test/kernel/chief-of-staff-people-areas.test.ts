import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import type {
  ChiefOfStaffActor,
  ChiefOfStaffResult,
} from "~/kernel/chief-of-staff";
import { invokeChiefOfStaff } from "~/platform/chief-of-staff/chief-of-staff-service.server";

import { makeContext, makeSpineRepository, resetTables } from "./support";

const WS = "ws_chief_people";
const actor: ChiefOfStaffActor = {
  subject: "access-subject-people",
  requestId: "request-people",
};
const serviceEnv = () => ({ DB: env.DB, DEFAULT_WORKSPACE_ID: WS });

function record<T>(result: ChiefOfStaffResult, key: string): T {
  return result[key] as T;
}

function rows<T>(result: ChiefOfStaffResult, key: string): readonly T[] {
  return (result[key] ?? []) as readonly T[];
}

async function auditActions(): Promise<readonly string[]> {
  const result = await env.DB.prepare(
    `SELECT payload_json FROM activities
     WHERE workspace_id = ? AND type = 'mcp.mutation'
     ORDER BY occurred_at, id`,
  )
    .bind(WS)
    .all<{ payload_json: string }>();
  return result.results.map(
    (row) => JSON.parse(row.payload_json).action as string,
  );
}

beforeEach(async () => {
  await resetTables([WS]);
});

describe("Chief of Staff People", () => {
  it("adds a person against work named in plain English, then reads them back with that context", async () => {
    // "Add Vaughn as a person. He is relevant to the OpO3 finance sessions."
    const spine = makeSpineRepository(makeContext(WS));
    const area = await spine.createArea({ title: "Work" });
    await spine.createProject({
      title: "OpO3 Finance Sessions",
      parent: { kind: "area", id: area.id },
    });

    const created = await invokeChiefOfStaff(serviceEnv(), {
      action: "create_person",
      actor,
      input: {
        name: "Vaughn Ellis",
        role: "Finance Manager",
        organisation: "Orana",
        // Named, not id'd — the point of the whole exercise.
        projectIds: ["OpO3 Finance Sessions"],
        areaIds: ["Work"],
      },
    });
    const person = record<{ id: string; name: string; role: string }>(
      created,
      "person",
    );
    expect(person).toMatchObject({
      name: "Vaughn Ellis",
      role: "Finance Manager",
      organisation: "Orana",
    });

    // Retrieved later BY NAME, and the relationship is there.
    const read = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_person",
      input: { personId: "Vaughn" },
    });
    expect(
      rows<{ title: string }>(read, "projects").map((item) => item.title),
    ).toEqual(["OpO3 Finance Sessions"]);
    expect(
      rows<{ title: string }>(read, "areas").map((item) => item.title),
    ).toEqual(["Work"]);

    // And the Project's own People list is the same relationship, from the
    // other end — not a private MCP association.
    const people = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_people",
      input: { projectId: "OpO3 Finance Sessions" },
    });
    expect(
      rows<{ name: string }>(people, "people").map((item) => item.name),
    ).toEqual(["Vaughn Ellis"]);
  });

  it("declines to create a second copy of someone it already has", async () => {
    await invokeChiefOfStaff(serviceEnv(), {
      action: "create_person",
      actor,
      input: { name: "Sarah Beale", email: "sarah@example.com" },
    });

    // Different capitalisation and spacing is the SAME person.
    const again = await invokeChiefOfStaff(serviceEnv(), {
      action: "create_person",
      actor,
      input: { name: "sarah  beale" },
    });
    expect(again.status).toBe("possible_duplicate");
    expect(rows<{ title: string }>(again, "matches")).toHaveLength(1);

    // So is a different name on the same email address.
    const byEmail = await invokeChiefOfStaff(serviceEnv(), {
      action: "create_person",
      actor,
      input: { name: "S. Beale", email: "sarah@example.com" },
    });
    expect(byEmail.status).toBe("possible_duplicate");

    // Nothing was written by either refusal.
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM entities WHERE workspace_id = ? AND type = 'person'",
    )
      .bind(WS)
      .first<{ n: number }>();
    expect(count?.n).toBe(1);

    // The owner can still say "yes, a second one".
    const confirmed = await invokeChiefOfStaff(serviceEnv(), {
      action: "create_person",
      actor,
      input: { name: "Sarah Beale", allowDuplicate: true },
    });
    expect(confirmed.status).toBeUndefined();
    expect(record<{ name: string }>(confirmed, "person").name).toBe(
      "Sarah Beale",
    );
  });

  it("retrieves and deduplicates names through punctuation, spacing, case and accents", async () => {
    await invokeChiefOfStaff(serviceEnv(), {
      action: "create_area",
      actor,
      input: { title: "Career Development" },
    });

    for (const reference of [
      "Career Development",
      "career  development",
      "Career-Development",
    ]) {
      const result = await invokeChiefOfStaff(serviceEnv(), {
        action: "get_area",
        input: { areaId: reference },
      });
      expect(record<{ title: string }>(result, "area").title).toBe(
        "Career Development",
      );
    }

    await invokeChiefOfStaff(serviceEnv(), {
      action: "create_person",
      actor,
      input: { name: "Renée O'Brien" },
    });
    const accentFolded = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_person",
      input: { personId: "renee obrien" },
    });
    expect(record<{ name: string }>(accentFolded, "person").name).toBe(
      "Renée O'Brien",
    );

    const duplicate = await invokeChiefOfStaff(serviceEnv(), {
      action: "create_area",
      actor,
      input: { title: "career-development" },
    });
    expect(duplicate.status).toBe("possible_duplicate");
  });

  it("returns ambiguity when distinct records normalise to the same name", async () => {
    await invokeChiefOfStaff(serviceEnv(), {
      action: "create_area",
      actor,
      input: { title: "Career Development" },
    });
    await invokeChiefOfStaff(serviceEnv(), {
      action: "create_area",
      actor,
      input: { title: "Career-Development", allowDuplicate: true },
    });

    const result = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_area",
      input: { areaId: "career  development" },
    });
    expect(result.status).toBe("ambiguous_reference");
    expect(rows(result, "matches")).toHaveLength(2);
  });

  it("refuses to guess which John, and writes nothing while it asks", async () => {
    for (const organisation of ["Finance", "Orana"]) {
      await invokeChiefOfStaff(serviceEnv(), {
        action: "create_person",
        actor,
        input: { name: "John Smith", organisation, allowDuplicate: true },
      });
    }

    const ambiguous = await invokeChiefOfStaff(serviceEnv(), {
      action: "create_note",
      actor,
      input: { title: "Discussed OpO3 finance delivery", personId: "John" },
    });
    expect(ambiguous).toMatchObject({
      status: "ambiguous_reference",
      field: "personId",
      expected: "person",
    });
    expect(rows<{ subtitle: string }>(ambiguous, "matches")).toHaveLength(2);
    expect(
      rows<{ subtitle: string }>(ambiguous, "matches").map(
        (match) => match.subtitle,
      ),
    ).toEqual(expect.arrayContaining(["Finance", "Orana"]));

    // The Note was NOT created while the question is outstanding.
    const notes = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM entities WHERE workspace_id = ? AND type = 'note'",
    )
      .bind(WS)
      .first<{ n: number }>();
    expect(notes?.n).toBe(0);
  });

  it("files a note on a person's record and shows it on both", async () => {
    const created = await invokeChiefOfStaff(serviceEnv(), {
      action: "create_person",
      actor,
      input: { name: "John Reid", organisation: "Finance" },
    });
    const personId = record<{ id: string }>(created, "person").id;

    await invokeChiefOfStaff(serviceEnv(), {
      action: "create_note",
      actor,
      input: {
        title: "OpO3 finance delivery",
        content: "We agreed he would present the 2027 session.",
        personId: "John Reid",
      },
    });

    const context = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_person",
      input: { personId },
    });
    expect(
      rows<{ title: string }>(context, "notes").map((note) => note.title),
    ).toEqual(["OpO3 finance delivery"]);
  });

  it("patches a person without clearing what it was not told about", async () => {
    const created = await invokeChiefOfStaff(serviceEnv(), {
      action: "create_person",
      actor,
      input: {
        name: "Kate Nguyen",
        role: "Analyst",
        organisation: "Finance",
        mobile: "0400 000 000",
        tags: ["opo"],
        notes: "Met at the 2026 session.",
      },
    });
    const personId = record<{ id: string }>(created, "person").id;

    const promoted = await invokeChiefOfStaff(serviceEnv(), {
      action: "update_person",
      actor,
      input: { personId, role: "Director" },
    });
    expect(promoted.changed).toBe(true);
    expect(record<Record<string, unknown>>(promoted, "person")).toMatchObject({
      role: "Director",
      // Untouched fields survive: a patch is not a replacement.
      organisation: "Finance",
      mobile: "0400 000 000",
      tags: ["opo"],
    });

    // An EXPLICIT null is how a field is cleared — and only that field.
    const cleared = await invokeChiefOfStaff(serviceEnv(), {
      action: "update_person",
      actor,
      input: { personId, mobile: null },
    });
    expect(record<Record<string, unknown>>(cleared, "person")).toMatchObject({
      mobile: null,
      role: "Director",
      organisation: "Finance",
    });

    // A repeat of the same patch changes nothing and audits nothing.
    const repeat = await invokeChiefOfStaff(serviceEnv(), {
      action: "update_person",
      actor,
      input: { personId, role: "Director" },
    });
    expect(repeat.changed).toBe(false);

    // The display name is the shared entity title, and renaming it leaves the
    // detail slice alone.
    const renamed = await invokeChiefOfStaff(serviceEnv(), {
      action: "update_person",
      actor,
      input: { personId, name: "Kate Nguyen-Hall" },
    });
    expect(record<Record<string, unknown>>(renamed, "person")).toMatchObject({
      name: "Kate Nguyen-Hall",
      role: "Director",
    });
    // The context note is not part of the compact summary, so it is checked
    // where it IS returned — and it survived both the patch and the rename.
    const full = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_person",
      input: { personId },
    });
    expect(record<{ notes: string }>(full, "detail").notes).toBe(
      "Met at the 2026 session.",
    );
  });

  it("archives and restores a person rather than offering a delete", async () => {
    const created = await invokeChiefOfStaff(serviceEnv(), {
      action: "create_person",
      actor,
      input: { name: "Former Colleague" },
    });
    const personId = record<{ id: string }>(created, "person").id;

    const archived = await invokeChiefOfStaff(serviceEnv(), {
      action: "update_person",
      actor,
      input: { personId, archived: true },
    });
    expect(record<{ archived: boolean }>(archived, "person").archived).toBe(
      true,
    );

    const active = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_people",
      input: {},
    });
    expect(rows(active, "people")).toHaveLength(0);

    const restored = await invokeChiefOfStaff(serviceEnv(), {
      action: "update_person",
      actor,
      input: { personId, archived: false },
    });
    expect(record<{ archived: boolean }>(restored, "person").archived).toBe(
      false,
    );
    // The record was never removed: archiving is "put away", not deletion.
    const stillThere = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM person_details WHERE workspace_id = ?",
    )
      .bind(WS)
      .first<{ n: number }>();
    expect(stillThere?.n).toBe(1);
  });

  it("keeps an archived person addressable by name, so they can be read and restored", async () => {
    const created = await invokeChiefOfStaff(serviceEnv(), {
      action: "create_person",
      actor,
      input: { name: "Kate Nguyen" },
    });
    await invokeChiefOfStaff(serviceEnv(), {
      action: "update_person",
      actor,
      input: {
        personId: record<{ id: string }>(created, "person").id,
        archived: true,
      },
    });

    // "What do I have on Kate?" and "restore Kate" both still work — archive
    // is the only put-away this interface has, so a name has to survive it.
    const read = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_person",
      input: { personId: "Kate Nguyen" },
    });
    expect(record<{ archived: boolean }>(read, "person").archived).toBe(true);

    const restored = await invokeChiefOfStaff(serviceEnv(), {
      action: "update_person",
      actor,
      input: { personId: "Kate Nguyen", archived: false },
    });
    expect(record<{ archived: boolean }>(restored, "person").archived).toBe(
      false,
    );
  });

  it("cannot reach a Person in another workspace", async () => {
    const other = "ws_chief_people_other";
    await resetTables([WS, other]);
    const elsewhere = await invokeChiefOfStaff(
      { DB: env.DB, DEFAULT_WORKSPACE_ID: other },
      {
        action: "create_person",
        actor,
        input: { name: "Not Yours" },
      },
    );
    const foreignId = record<{ id: string }>(elsewhere, "person").id;

    await expect(
      invokeChiefOfStaff(serviceEnv(), {
        action: "get_person",
        input: { personId: foreignId },
      }),
    ).rejects.toThrow(/no person in dalyhub matches/i);
    await expect(
      invokeChiefOfStaff(serviceEnv(), {
        action: "update_person",
        actor,
        input: { personId: foreignId, role: "Renamed" },
      }),
    ).rejects.toThrow(/no person in dalyhub matches/i);
    // Its name is equally unreachable — scope is not a matter of which id form
    // was used.
    await expect(
      invokeChiefOfStaff(serviceEnv(), {
        action: "get_person",
        input: { personId: "Not Yours" },
      }),
    ).rejects.toThrow(/no person in dalyhub matches/i);
  });
});

describe("Chief of Staff search", () => {
  it("finds a Person alongside every other record type, each naming its type and id", async () => {
    const spine = makeSpineRepository(makeContext(WS));
    const area = await spine.createArea({ title: "Orana Work" });
    await spine.createProject({
      title: "Orana Program",
      parent: { kind: "area", id: area.id },
    });
    await invokeChiefOfStaff(serviceEnv(), {
      action: "create_person",
      actor,
      input: { name: "Orana Contact", organisation: "Orana" },
    });

    const found = await invokeChiefOfStaff(serviceEnv(), {
      action: "search_dalyhub",
      input: { query: "Orana" },
    });
    const results = rows<{
      type: string;
      id: string;
      title: string;
      matchedOn?: string;
    }>(found, "results");
    expect(results.map((row) => row.type)).toEqual(
      expect.arrayContaining(["area", "project", "person"]),
    );
    for (const row of results) {
      expect(row.id).toBeTruthy();
      expect(row.title).toBeTruthy();
    }
    const person = results.find((row) => row.type === "person");
    expect(person).toMatchObject({
      title: "Orana Contact",
      matchedOn: "name",
    });
  });
});

describe("Chief of Staff workspace scoping for the new domains", () => {
  const other = "ws_chief_people_other";
  const otherEnv = () => ({ DB: env.DB, DEFAULT_WORKSPACE_ID: other });

  it("cannot read, reference or mutate another workspace's Area or Goal", async () => {
    await resetTables([WS, other]);
    const spine = makeSpineRepository(makeContext(other));
    const foreignArea = await spine.createArea({ title: "Elsewhere" });
    const foreignGoal = await spine.createGoal({
      title: "Their Goal",
      areaId: foreignArea.id,
    });

    for (const request of [
      { action: "get_area", input: { areaId: foreignArea.id } },
      { action: "get_area", input: { areaId: "Elsewhere" } },
      { action: "get_goal", input: { goalId: foreignGoal.id } },
      {
        action: "update_area",
        actor,
        input: { areaId: foreignArea.id, title: "Renamed" },
      },
      {
        action: "update_goal",
        actor,
        input: { goalId: foreignGoal.id, completed: true },
      },
      {
        action: "create_project",
        actor,
        input: { title: "Sneaky", areaId: foreignArea.id },
      },
      {
        action: "create_goal",
        actor,
        input: { title: "Sneaky goal", areaId: foreignArea.id },
      },
    ] as const) {
      await expect(invokeChiefOfStaff(serviceEnv(), request)).rejects.toThrow(
        /no (area|goal) in dalyhub matches/i,
      );
    }

    // Untouched, and still theirs.
    const stillArea = await spine.getById(foreignArea.id);
    expect(stillArea?.title).toBe("Elsewhere");
    const stillGoal = await spine.getById(foreignGoal.id);
    expect(stillGoal?.completedAt).toBeNull();

    // Nothing was created in EITHER workspace by the refused writes.
    for (const workspace of [WS, other]) {
      const projects = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM entities WHERE workspace_id = ? AND type = 'project'",
      )
        .bind(workspace)
        .first<{ n: number }>();
      expect(projects?.n).toBe(0);
    }
  });

  it("keeps two workspaces' identically-named Areas entirely separate", async () => {
    await resetTables([WS, other]);
    await invokeChiefOfStaff(otherEnv(), {
      action: "create_area",
      actor,
      input: { title: "Work" },
    });
    // The same name in this workspace is NOT a duplicate of theirs.
    const mine = await invokeChiefOfStaff(serviceEnv(), {
      action: "create_area",
      actor,
      input: { title: "Work" },
    });
    expect(mine.status).toBeUndefined();

    const areas = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_areas",
      input: {},
    });
    expect(rows(areas, "areas")).toHaveLength(1);
  });
});

describe("Chief of Staff Areas and Goals", () => {
  it("applies Area text and Project workflow filters before the limit", async () => {
    const spine = makeSpineRepository(makeContext(WS));
    await spine.createArea({ title: "Earlier unrelated area" });
    const work = await spine.createArea({ title: "Later Work Area" });

    const areas = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_areas",
      input: { query: "Work", limit: 1 },
    });
    expect(
      rows<{ title: string }>(areas, "areas").map((area) => area.title),
    ).toEqual(["Later Work Area"]);

    await invokeChiefOfStaff(serviceEnv(), {
      action: "create_project",
      actor,
      input: { title: "Earlier planned", areaId: work.id, status: "planned" },
    });
    await invokeChiefOfStaff(serviceEnv(), {
      action: "create_project",
      actor,
      input: { title: "Later active", areaId: work.id, status: "active" },
    });
    const projects = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_projects",
      input: { status: "active", limit: 1 },
    });
    expect(
      rows<{ title: string }>(projects, "projects").map(
        (project) => project.title,
      ),
    ).toEqual(["Later active"]);
  });

  it("creates an Area, a Project under it and a Task on that Project, all by name", async () => {
    const area = await invokeChiefOfStaff(serviceEnv(), {
      action: "create_area",
      actor,
      input: { title: "Career Development" },
    });
    expect(record<{ title: string }>(area, "area").title).toBe(
      "Career Development",
    );

    const project = await invokeChiefOfStaff(serviceEnv(), {
      action: "create_project",
      actor,
      input: {
        title: "Capability 10/11 Application Preparation",
        areaId: "Career Development",
        status: "active",
      },
    });
    const projectId = record<{ id: string; area: { title: string } }>(
      project,
      "project",
    );
    expect(projectId.area.title).toBe("Career Development");

    const task = await invokeChiefOfStaff(serviceEnv(), {
      action: "create_task",
      actor,
      input: {
        title: "Update my resume",
        projectId: "Capability 10/11 Application Preparation",
      },
    });
    expect(
      record<{ project: { title: string } }>(task, "task").project.title,
    ).toBe("Capability 10/11 Application Preparation");

    // The Area's own context read shows all of it, through the real hierarchy.
    const context = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_area",
      input: { areaId: "Career Development" },
    });
    expect(
      rows<{ title: string }>(context, "projects").map((item) => item.title),
    ).toEqual(["Capability 10/11 Application Preparation"]);
  });

  it("declines to create an Area it already has, however it is spelled", async () => {
    await invokeChiefOfStaff(serviceEnv(), {
      action: "create_area",
      actor,
      input: { title: "Career Development" },
    });
    const again = await invokeChiefOfStaff(serviceEnv(), {
      action: "create_area",
      actor,
      input: { title: "career development" },
    });
    expect(again.status).toBe("possible_duplicate");

    // A genuinely different Area is NOT blocked by a similar name.
    const different = await invokeChiefOfStaff(serviceEnv(), {
      action: "create_area",
      actor,
      input: { title: "Career Development 2027" },
    });
    expect(different.status).toBeUndefined();

    const areas = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_areas",
      input: {},
    });
    expect(rows(areas, "areas")).toHaveLength(2);
  });

  it("renames and archives an Area reversibly, and never deletes one", async () => {
    const created = await invokeChiefOfStaff(serviceEnv(), {
      action: "create_area",
      actor,
      input: { title: "Vehicle" },
    });
    const areaId = record<{ id: string }>(created, "area").id;

    const renamed = await invokeChiefOfStaff(serviceEnv(), {
      action: "update_area",
      actor,
      input: { areaId, title: "Vehicle / Camping" },
    });
    expect(record<{ title: string }>(renamed, "area").title).toBe(
      "Vehicle / Camping",
    );

    await invokeChiefOfStaff(serviceEnv(), {
      action: "update_area",
      actor,
      input: { areaId, archived: true },
    });
    const active = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_areas",
      input: {},
    });
    expect(rows(active, "areas")).toHaveLength(0);

    const restored = await invokeChiefOfStaff(serviceEnv(), {
      action: "update_area",
      actor,
      input: { areaId, archived: false },
    });
    expect(record<{ archived: boolean }>(restored, "area").archived).toBe(
      false,
    );
  });

  it("creates a Goal with a target, attaches a Project to it, then sets it aside and completes it", async () => {
    await invokeChiefOfStaff(serviceEnv(), {
      action: "create_area",
      actor,
      input: { title: "Career Development" },
    });
    await invokeChiefOfStaff(serviceEnv(), {
      action: "create_project",
      actor,
      input: {
        title: "Capability Application Preparation",
        areaId: "Career Development",
      },
    });

    const goal = await invokeChiefOfStaff(serviceEnv(), {
      action: "create_goal",
      actor,
      input: {
        title: "Secure Capability 10/11 Role",
        areaId: "Career Development",
        targetDate: "2027-03-31",
        definitionOfDone: "Substantive appointment at 10/11.",
        projectIds: ["Capability Application Preparation"],
      },
    });
    const goalId = record<{ id: string; targetDate: string }>(goal, "goal");
    expect(goalId.targetDate).toBe("2027-03-31");

    const read = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_goal",
      input: { goalId: "Secure Capability 10/11 Role" },
    });
    expect(
      rows<{ title: string }>(read, "projects").map((item) => item.title),
    ).toEqual(["Capability Application Preparation"]);
    expect(record<{ total: number }>(read, "contribution").total).toBe(1);

    const setAside = await invokeChiefOfStaff(serviceEnv(), {
      action: "update_goal",
      actor,
      input: { goalId: goalId.id, condition: "set_aside" },
    });
    expect(record<{ condition: string }>(setAside, "goal").condition).toBe(
      "set_aside",
    );

    const completed = await invokeChiefOfStaff(serviceEnv(), {
      action: "update_goal",
      actor,
      input: { goalId: goalId.id, completed: true },
    });
    expect(
      record<{ completedAt: string | null }>(completed, "goal").completedAt,
    ).not.toBeNull();

    const open = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_goals",
      input: { state: "open" },
    });
    expect(rows(open, "goals")).toHaveLength(0);
  });

  it("declines a Goal that repeats one the owner already has", async () => {
    await invokeChiefOfStaff(serviceEnv(), {
      action: "create_area",
      actor,
      input: { title: "Health" },
    });
    await invokeChiefOfStaff(serviceEnv(), {
      action: "create_goal",
      actor,
      input: { title: "Reach 70 kg", areaId: "Health" },
    });
    const again = await invokeChiefOfStaff(serviceEnv(), {
      action: "create_goal",
      actor,
      input: { title: "reach 70kg", areaId: "Health" },
    });
    expect(again.status).toBe("possible_duplicate");
  });

  it("filters Goal lifecycle before applying the requested limit", async () => {
    const spine = makeSpineRepository(makeContext(WS));
    const area = await spine.createArea({ title: "Career" });
    const completed = await spine.createGoal({
      title: "Earlier completed goal",
      areaId: area.id,
    });
    await spine.complete(completed.id);
    await spine.createGoal({ title: "Later open goal", areaId: area.id });

    const workspace = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_goals",
      input: { state: "open", limit: 1 },
    });
    expect(
      rows<{ title: string }>(workspace, "goals").map((goal) => goal.title),
    ).toEqual(["Later open goal"]);

    const inArea = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_goals",
      input: { areaId: area.id, state: "open", limit: 1 },
    });
    expect(
      rows<{ title: string }>(inArea, "goals").map((goal) => goal.title),
    ).toEqual(["Later open goal"]);
  });
});

describe("Chief of Staff waiting, task lifecycle and audit", () => {
  it("records what the owner is waiting on a named person for, and finds it again", async () => {
    const spine = makeSpineRepository(makeContext(WS));
    const area = await spine.createArea({ title: "Work" });
    await spine.createProject({
      title: "OpO Program",
      parent: { kind: "area", id: area.id },
    });
    const person = await invokeChiefOfStaff(serviceEnv(), {
      action: "create_person",
      actor,
      input: { name: "John Reid", organisation: "Finance" },
    });
    const personId = record<{ id: string }>(person, "person").id;

    await invokeChiefOfStaff(serviceEnv(), {
      action: "create_waiting_for",
      actor,
      input: {
        what: "Confirmation of the finance session presenter",
        personId: "John Reid",
        projectId: "OpO Program",
        followUpDate: "2026-10-01",
      },
    });

    // 1. The waiting review finds it.
    const waiting = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_waiting_for",
      input: {},
    });
    expect(
      rows<{ waitingOn: string }>(waiting, "waitingFor").map(
        (item) => item.waitingOn,
      ),
    ).toEqual(["John Reid"]);

    // 2. John's own context does too.
    const context = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_person",
      input: { personId },
    });
    expect(rows(context, "waitingFor")).toHaveLength(1);

    // 3. And so does the Project's.
    const project = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_waiting_for",
      input: { projectId: "OpO Program" },
    });
    expect(rows(project, "waitingFor")).toHaveLength(1);

    // The relationship is the canonical task.waiting_on link, not a comparison
    // against the historical free-text delegation label.
    await invokeChiefOfStaff(serviceEnv(), {
      action: "update_person",
      actor,
      input: { personId, name: "Jonathan Reid" },
    });
    const afterRename = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_waiting_for",
      input: { personId: "Jonathan Reid" },
    });
    expect(rows(afterRename, "waitingFor")).toHaveLength(1);
  });

  it("still accepts a waiting item for a party with no DalyHub record", async () => {
    const created = await invokeChiefOfStaff(serviceEnv(), {
      action: "create_waiting_for",
      actor,
      input: { what: "Rego renewal notice", personOrSource: "Service NSW" },
    });
    expect(record<{ waitingOn: string }>(created, "waiting").waitingOn).toBe(
      "Service NSW",
    );

    await expect(
      invokeChiefOfStaff(serviceEnv(), {
        action: "create_waiting_for",
        actor,
        input: { what: "Something owed by nobody" },
      }),
    ).rejects.toThrow(/must name who it waits on/i);
  });

  it("completes and reopens a Task named in plain English, idempotently", async () => {
    const spine = makeSpineRepository(makeContext(WS));
    const area = await spine.createArea({ title: "Work" });
    await invokeChiefOfStaff(serviceEnv(), {
      action: "create_task",
      actor,
      input: { title: "Safety Advisor prerequisite", areaId: area.id },
    });

    const done = await invokeChiefOfStaff(serviceEnv(), {
      action: "complete_task",
      actor,
      input: { taskId: "Safety Advisor prerequisite" },
    });
    expect(done.changed).toBe(true);

    const reopened = await invokeChiefOfStaff(serviceEnv(), {
      action: "reopen_task",
      actor,
      input: { taskId: "Safety Advisor prerequisite" },
    });
    expect(reopened.changed).toBe(true);
    const again = await invokeChiefOfStaff(serviceEnv(), {
      action: "reopen_task",
      actor,
      input: { taskId: "Safety Advisor prerequisite" },
    });
    expect(again.changed).toBe(false);
  });

  it("moves a task between projects named in plain English, and relates a person to it", async () => {
    const spine = makeSpineRepository(makeContext(WS));
    const area = await spine.createArea({ title: "Work" });
    for (const title of ["OpO Program", "Finance"]) {
      await spine.createProject({
        title,
        parent: { kind: "area", id: area.id },
      });
    }
    await invokeChiefOfStaff(serviceEnv(), {
      action: "create_person",
      actor,
      input: { name: "Vaughn Ellis" },
    });

    const created = await invokeChiefOfStaff(serviceEnv(), {
      action: "create_task",
      actor,
      input: {
        title: "Email Finance about the 2027 session",
        projectId: "OpO Program",
      },
    });
    const taskId = record<{ id: string }>(created, "task").id;

    const moved = await invokeChiefOfStaff(serviceEnv(), {
      action: "update_task",
      actor,
      input: {
        taskId: "Email Finance about the 2027 session",
        projectId: "Finance",
        personId: "Vaughn Ellis",
        dueDate: "2026-11-02",
        priority: "p2",
      },
    });
    expect(moved.changed).toBe(true);
    expect(record<Record<string, unknown>>(moved, "task")).toMatchObject({
      id: taskId,
      project: expect.objectContaining({ title: "Finance" }),
      due: "2026-11-02",
      priority: "p2",
    });

    // The Person now carries that task in their own context.
    const context = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_person",
      input: { personId: "Vaughn Ellis" },
    });
    expect(
      rows<{ id: string }>(context, "openTasks").map((task) => task.id),
    ).toEqual([taskId]);
  });

  it("changes nothing when update_task cannot resolve its supplied Person", async () => {
    const spine = makeSpineRepository(makeContext(WS));
    const area = await spine.createArea({ title: "Work" });
    const created = await invokeChiefOfStaff(serviceEnv(), {
      action: "create_task",
      actor,
      input: { title: "Original task", areaId: area.id, dueDate: "2026-10-01" },
    });
    const taskId = record<{ id: string }>(created, "task").id;
    for (const organisation of ["Finance", "Orana"]) {
      await invokeChiefOfStaff(serviceEnv(), {
        action: "create_person",
        actor,
        input: { name: "John Smith", organisation, allowDuplicate: true },
      });
    }
    const auditsBefore = await auditActions();

    const ambiguous = await invokeChiefOfStaff(serviceEnv(), {
      action: "update_task",
      actor,
      input: {
        taskId,
        title: "Should never persist",
        dueDate: "2026-12-31",
        personId: "John",
      },
    });
    expect(ambiguous.status).toBe("ambiguous_reference");

    const stored = await env.DB.prepare(
      `SELECT e.title, td.due_date
       FROM entities e
       LEFT JOIN task_details td
         ON td.workspace_id = e.workspace_id AND td.entity_id = e.id
       WHERE e.workspace_id = ? AND e.id = ?`,
    )
      .bind(WS, taskId)
      .first<{ title: string; due_date: string | null }>();
    expect(stored).toEqual({ title: "Original task", due_date: "2026-10-01" });
    expect(await auditActions()).toEqual(auditsBefore);

    await expect(
      invokeChiefOfStaff(serviceEnv(), {
        action: "update_task",
        actor,
        input: {
          taskId,
          title: "Still must not persist",
          personId: "Nobody in DalyHub",
        },
      }),
    ).rejects.toThrow(/No person/i);
    const title = await env.DB.prepare(
      "SELECT title FROM entities WHERE workspace_id = ? AND id = ?",
    )
      .bind(WS, taskId)
      .first<{ title: string }>();
    expect(title?.title).toBe("Original task");
  });

  it("does not turn a body/checklist-only full-text hit into a Task reference", async () => {
    const spine = makeSpineRepository(makeContext(WS));
    const area = await spine.createArea({ title: "Home" });
    const created = await invokeChiefOfStaff(serviceEnv(), {
      action: "create_task",
      actor,
      input: {
        title: "Prepare camper",
        areaId: area.id,
        notes: "Check tyre pressures before leaving.",
      },
    });
    const taskId = record<{ id: string }>(created, "task").id;

    await expect(
      invokeChiefOfStaff(serviceEnv(), {
        action: "complete_task",
        actor,
        input: { taskId: "tyre pressures" },
      }),
    ).rejects.toThrow(/No task/i);
    const stored = await env.DB.prepare(
      "SELECT completed_at FROM spine_records WHERE workspace_id = ? AND entity_id = ?",
    )
      .bind(WS, taskId)
      .first<{ completed_at: string | null }>();
    expect(stored?.completed_at).toBeNull();
  });

  it("reads Decisions and Notes back, narrowed by the record they belong to", async () => {
    const spine = makeSpineRepository(makeContext(WS));
    const area = await spine.createArea({ title: "Work" });
    const project = await spine.createProject({
      title: "OpO Program",
      parent: { kind: "area", id: area.id },
    });

    await invokeChiefOfStaff(serviceEnv(), {
      action: "record_decision",
      actor,
      input: {
        decision: "Run the finance session in February",
        rationale: "It clears the end-of-year crunch.",
        decisionDate: "2026-09-21",
        projectId: "OpO Program",
      },
    });
    await invokeChiefOfStaff(serviceEnv(), {
      action: "capture_item",
      actor,
      input: { type: "decision", title: "Who presents session three?" },
    });
    await invokeChiefOfStaff(serviceEnv(), {
      action: "create_note",
      actor,
      input: {
        title: "Session outline",
        content: "Three parts, ninety minutes.",
        projectId: "OpO Program",
        tags: ["opo"],
      },
    });

    const decided = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_decisions",
      input: { status: "decided" },
    });
    expect(
      rows<{ decision: string }>(decided, "decisions").map(
        (item) => item.decision,
      ),
    ).toEqual(["Run the finance session in February"]);

    // The open/decided distinction the Decisions work established is intact.
    const open = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_decisions",
      input: { status: "open" },
    });
    expect(
      rows<{ decision: string }>(open, "decisions").map(
        (item) => item.decision,
      ),
    ).toEqual(["Who presents session three?"]);

    const byProject = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_decisions",
      input: { projectId: "OpO Program" },
    });
    expect(rows(byProject, "decisions")).toHaveLength(1);

    const notes = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_notes",
      input: { projectId: project.id },
    });
    expect(
      rows<{ title: string }>(notes, "notes").map((note) => note.title),
    ).toEqual(["Session outline"]);
    const tagged = await invokeChiefOfStaff(serviceEnv(), {
      action: "get_notes",
      input: { tag: "opo" },
    });
    expect(rows(tagged, "notes")).toHaveLength(1);
  });

  it("audits every People/Area/Goal mutation with the verified subject and the entity it touched", async () => {
    await invokeChiefOfStaff(serviceEnv(), {
      action: "create_area",
      actor,
      input: { title: "Wedding" },
    });
    const person = await invokeChiefOfStaff(serviceEnv(), {
      action: "create_person",
      actor,
      input: { name: "Celebrant" },
    });
    await invokeChiefOfStaff(serviceEnv(), {
      action: "update_person",
      actor,
      input: {
        personId: record<{ id: string }>(person, "person").id,
        role: "Celebrant",
      },
    });
    await invokeChiefOfStaff(serviceEnv(), {
      action: "create_goal",
      actor,
      input: { title: "Book the venue", areaId: "Wedding" },
    });

    expect(await auditActions()).toEqual([
      "create_area",
      "create_person",
      "update_person",
      "create_goal",
    ]);

    const rowsRead = await env.DB.prepare(
      `SELECT a.actor_type, a.actor_id, a.payload_json, s.entity_id
       FROM activities a
       JOIN activity_subjects s ON s.activity_id = a.id
       WHERE a.workspace_id = ? AND a.type = 'mcp.mutation'
       ORDER BY a.occurred_at, a.id`,
    )
      .bind(WS)
      .all<{
        actor_type: string;
        actor_id: string;
        payload_json: string;
        entity_id: string;
      }>();
    for (const row of rowsRead.results) {
      expect(row.actor_type).toBe("mcp");
      expect(row.actor_id).toBe(actor.subject);
      expect(row.entity_id).toBeTruthy();
      const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
      expect(payload.source).toBe("claude_mcp");
      expect(payload.entityType).toBeTruthy();
      expect(payload.requestId).toBe(actor.requestId);
      // No contact detail, note body or other content rides along in the audit
      // payload — only what it takes to identify the change.
      expect(JSON.stringify(payload)).not.toMatch(/@|mobile|phone/i);
    }
    expect(
      rowsRead.results.map(
        (row) => JSON.parse(row.payload_json).entityType as string,
      ),
    ).toEqual(["area", "person", "person", "goal"]);
  });

  it("refuses a possible-duplicate creation without auditing anything", async () => {
    await invokeChiefOfStaff(serviceEnv(), {
      action: "create_area",
      actor,
      input: { title: "Home" },
    });
    await invokeChiefOfStaff(serviceEnv(), {
      action: "create_area",
      actor,
      input: { title: "home" },
    });
    // The refusal is not a mutation, so it leaves no audit row behind.
    expect(await auditActions()).toEqual(["create_area"]);
  });
});
