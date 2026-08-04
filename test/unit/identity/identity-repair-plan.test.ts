/**
 * IDENT-01 — the production identity repair planner.
 *
 * The repair must be safe before it is useful: additive, idempotent, evidence-led
 * and honest about what it cannot attribute. These tests hold those properties.
 */

import { describe, expect, it } from "vitest";

import {
  UNRESOLVED_REASONS,
  planIdentityRepair,
} from "../../../scripts/identity-repair-plan.mjs";
import {
  renderStatement,
  sqlLiteral,
} from "../../../scripts/repair-activity-identity.mjs";

const WS = "dalyhub-production";
const SUB = "access-sub-aidan";
const NOW = "2026-08-04T10:00:00.000Z";

const base = {
  actors: [
    {
      actor_type: "user",
      actor_id: SUB,
      events: 42,
      first_at: "2026-07-20T00:00:00.000Z",
      last_at: "2026-08-03T00:00:00.000Z",
    },
  ],
  members: [],
  preferenceOwners: [{ owner_id: SUB }],
  people: [],
  options: { workspaceId: WS, ownerEmail: "aidan@daly.id.au", now: NOW },
};

describe("planning the identity repair", () => {
  it("provisions membership from the actor id already on the events", () => {
    const plan = planIdentityRepair(base);
    expect(plan.counts.member_from_activity_actor).toBe(1);
    expect(plan.statements).toHaveLength(1);
    // Additive only: it writes membership, never activity.
    expect(plan.statements[0].sql).toContain("INSERT INTO workspace_members");
    for (const statement of plan.statements) {
      expect(statement.sql).not.toMatch(/DELETE|DROP/);
    }
    expect(plan.summary.userEvents).toBe(42);
  });

  it("is idempotent: re-planning against the repaired state does nothing", () => {
    const repaired = planIdentityRepair({
      ...base,
      members: [
        {
          subject: SUB,
          email: "aidan@daly.id.au",
          display_name: "Aidan Daly",
          auth_display_name: null,
          person_entity_id: null,
        },
      ],
      people: [],
    });
    expect(repaired.statements).toHaveLength(0);
    expect(repaired.unresolved).toHaveLength(0);
  });

  it("writes only idempotent statements, so a re-run is a no-op", () => {
    const plan = planIdentityRepair({
      ...base,
      members: [
        {
          subject: SUB,
          email: null,
          display_name: null,
          auth_display_name: null,
          person_entity_id: null,
        },
      ],
      people: [
        { id: "person-1", title: "Aidan Daly", email: "aidan@daly.id.au" },
      ],
      options: { ...base.options, subject: SUB, displayName: "Aidan Daly" },
    });
    for (const statement of plan.statements) {
      const sql = statement.sql;
      expect(
        /ON CONFLICT .* DO NOTHING/.test(sql) ||
          /WHERE .* IS NULL/.test(sql) ||
          /SET display_name/.test(sql),
      ).toBe(true);
    }
  });

  it("recovers a subject from the recorded preferences owner alone", () => {
    const plan = planIdentityRepair({
      ...base,
      actors: [],
      preferenceOwners: [{ owner_id: "owner-only-sub" }],
    });
    expect(plan.counts.member_from_preferences_owner).toBe(1);
  });

  it("links the Person record when the verified email matches exactly one", () => {
    const plan = planIdentityRepair({
      ...base,
      members: [
        {
          subject: SUB,
          email: "aidan@daly.id.au",
          display_name: null,
          auth_display_name: null,
          person_entity_id: null,
        },
      ],
      people: [
        { id: "person-1", title: "Aidan Daly", email: "AIDAN@Daly.id.au" },
        { id: "person-2", title: "Vaughn Reed", email: "vaughn@example.com" },
      ],
    });
    expect(plan.counts.person_link_by_email).toBe(1);
    expect(renderStatement(plan.statements[0])).toContain("'person-1'");
  });

  it("refuses to guess when several People share the email", () => {
    const plan = planIdentityRepair({
      ...base,
      members: [
        {
          subject: SUB,
          email: "aidan@daly.id.au",
          display_name: null,
          auth_display_name: null,
          person_entity_id: null,
        },
      ],
      people: [
        { id: "person-1", title: "Aidan Daly", email: "aidan@daly.id.au" },
        { id: "person-2", title: "A. Daly", email: "aidan@daly.id.au" },
      ],
    });
    expect(plan.counts.person_link_by_email).toBe(0);
    expect(plan.notes.join(" ")).toContain("share the email");
  });

  it("does NOT apply the owner email when more than one subject exists", () => {
    const plan = planIdentityRepair({
      ...base,
      actors: [
        {
          actor_type: "user",
          actor_id: "sub-a",
          events: 3,
          first_at: "a",
          last_at: "a",
        },
        {
          actor_type: "user",
          actor_id: "sub-b",
          events: 5,
          first_at: "a",
          last_at: "a",
        },
      ],
      preferenceOwners: [],
    });
    for (const statement of plan.statements) {
      expect(renderStatement(statement)).not.toContain("aidan@daly.id.au");
    }
    expect(plan.notes.join(" ")).toContain("not applied automatically");
    // Both remain unattributable and will read as "Unknown user", not a name.
    expect(
      plan.unresolved.filter(
        (u) => u.reason === UNRESOLVED_REASONS.NO_IDENTITY_EVIDENCE,
      ),
    ).toHaveLength(2);
  });

  it("reports pre-authentication system events and leaves them alone", () => {
    const plan = planIdentityRepair({
      ...base,
      actors: [
        ...base.actors,
        {
          actor_type: "system",
          actor_id: null,
          events: 7,
          first_at: "2026-07-01T00:00:00.000Z",
          last_at: "2026-07-10T00:00:00.000Z",
        },
      ],
    });
    expect(plan.summary.legacySystemEvents).toBe(7);
    expect(plan.counts.legacy_system_attribution).toBe(0);
    for (const statement of plan.statements) {
      expect(statement.sql).not.toContain("UPDATE activities");
    }
    expect(
      plan.unresolved.some(
        (u) => u.reason === UNRESOLVED_REASONS.LEGACY_SYSTEM,
      ),
    ).toBe(true);
  });

  it("re-attributes legacy system events only when explicitly asked AND unambiguous", () => {
    const legacy = {
      actor_type: "system",
      actor_id: null,
      events: 7,
      first_at: "2026-07-01T00:00:00.000Z",
      last_at: "2026-07-10T00:00:00.000Z",
    };

    const opted = planIdentityRepair({
      ...base,
      actors: [...base.actors, legacy],
      options: { ...base.options, attributeLegacySystem: true },
    });
    const update = opted.statements.find((s) =>
      s.sql.includes("UPDATE activities"),
    );
    expect(update).toBeDefined();
    // Bounded: only actor-less system rows, in this workspace, strictly BEFORE
    // the first authenticated event. Genuine later system activity is untouched.
    const sql = renderStatement(update!);
    expect(sql).toContain("actor_id IS NULL");
    expect(sql).toContain("occurred_at < '2026-07-20T00:00:00.000Z'");
    expect(sql).toContain(`workspace_id = '${WS}'`);

    // With two possible subjects it refuses, even when explicitly asked.
    const ambiguous = planIdentityRepair({
      ...base,
      actors: [
        {
          actor_type: "user",
          actor_id: "sub-a",
          events: 1,
          first_at: "2026-07-20T00:00:00.000Z",
          last_at: "x",
        },
        {
          actor_type: "user",
          actor_id: "sub-b",
          events: 1,
          first_at: "2026-07-21T00:00:00.000Z",
          last_at: "x",
        },
        legacy,
      ],
      preferenceOwners: [],
      options: { ...base.options, attributeLegacySystem: true },
    });
    expect(
      ambiguous.statements.some((s) => s.sql.includes("UPDATE activities")),
    ).toBe(false);
    expect(
      ambiguous.unresolved.find(
        (u) => u.reason === UNRESOLVED_REASONS.LEGACY_SYSTEM,
      )?.detail,
    ).toContain("refusing to guess");
  });

  it("reports a subject it holds no identity evidence for", () => {
    const plan = planIdentityRepair({
      ...base,
      actors: [
        {
          actor_type: "user",
          actor_id: "sub-a",
          events: 2,
          first_at: "a",
          last_at: "a",
        },
        {
          actor_type: "user",
          actor_id: "sub-b",
          events: 2,
          first_at: "a",
          last_at: "a",
        },
      ],
      preferenceOwners: [],
      options: { workspaceId: WS, now: NOW },
    });
    const unresolved = plan.unresolved.filter(
      (u) => u.reason === UNRESOLVED_REASONS.NO_IDENTITY_EVIDENCE,
    );
    expect(unresolved.map((u) => u.subject).sort()).toEqual(["sub-a", "sub-b"]);
    expect(unresolved[0].detail).toContain("Unknown user");
  });
});

describe("statement rendering", () => {
  it("escapes values safely and refuses control characters", () => {
    expect(sqlLiteral("O'Brien")).toBe("'O''Brien'");
    expect(sqlLiteral(null)).toBe("NULL");
    expect(sqlLiteral(7)).toBe("7");
    expect(() => sqlLiteral("a\u0000b")).toThrow();
  });

  it("binds every placeholder exactly once", () => {
    const plan = planIdentityRepair(base);
    const sql = renderStatement(plan.statements[0]);
    expect(sql).not.toContain("?");
    expect(sql).toContain(`'${SUB}'`);
  });
});
