/**
 * DS-06 — the entity-link picker server service against real D1 (FND-04).
 *
 * Proves the integration path the picker uses AND that the server-supplied policy
 * is the authoritative boundary: a crafted submission that violates the policy
 * (bad link type, disallowed target type, disallowed direction, single-link limit,
 * self-link, missing/deleted target, reserved spine type) is rejected with a typed,
 * safe outcome, while a valid configured relationship creates a REAL EntityLink
 * queryable from BOTH directions. Also proves workspace isolation, unlink and that
 * NO alternative relationship persistence is introduced (only `entity_links`).
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  createLinkWithPolicy,
  listActiveLinks,
  searchLinkTargets,
  unlinkLink,
  type EntityLinkPickerDeps,
  type EntityLinkPickerPolicy,
} from "~/platform/entity-links";

import {
  countLinkRows,
  makeContext,
  makeLinkRepository,
  makeRepository,
  resetTables,
  seedEntity,
  sequentialIds,
} from "./support";

const WS_A = "ws-forms-a";
const WS_B = "ws-forms-b";
const CTX_A = makeContext(WS_A);
const CTX_B = makeContext(WS_B);

const ANCHOR = "p-anchor";
const NOTE = "n-brief";
const PERSON = "pe-mel";

/** A permissive-but-typed policy: supporting_note → note, involves_person → person. */
function policy(
  overrides: Partial<EntityLinkPickerPolicy> = {},
): EntityLinkPickerPolicy {
  return {
    anchorId: ANCHOR,
    allowedDirections: ["outgoing"],
    linkTypes: [
      { type: "project.supporting_note", allowedTargetTypes: ["note"] },
      { type: "project.involves_person", allowedTargetTypes: ["person"] },
    ],
    multiple: true,
    ...overrides,
  };
}

describe("DS-06 entity-link picker service (FND-04 policy integration)", () => {
  let depsA: EntityLinkPickerDeps;
  let depsB: EntityLinkPickerDeps;

  beforeEach(async () => {
    await resetTables([WS_A, WS_B]);
    depsA = {
      entities: makeRepository(CTX_A, { idGenerator: sequentialIds("a") }),
      entityLinks: makeLinkRepository(CTX_A, {
        idGenerator: sequentialIds("la"),
      }),
    };
    depsB = {
      entities: makeRepository(CTX_B, { idGenerator: sequentialIds("b") }),
      entityLinks: makeLinkRepository(CTX_B, {
        idGenerator: sequentialIds("lb"),
      }),
    };
    // Spine entity types are reserved on the entity repository, so seed directly.
    await seedEntity(WS_A, ANCHOR, {
      type: "project",
      title: "Website relaunch",
    });
    await seedEntity(WS_A, NOTE, { type: "note", title: "Creative brief" });
    await seedEntity(WS_A, PERSON, { type: "person", title: "Mel Okoye" });
  });

  it("creates a real, bidirectionally-queryable link for a valid request", async () => {
    const result = await createLinkWithPolicy(depsA, policy(), {
      targetId: NOTE,
      linkType: "project.supporting_note",
      direction: "outgoing",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.created).toBe(true);
    expect(result.link.sourceEntityId).toBe(ANCHOR);
    expect(result.link.targetEntityId).toBe(NOTE);

    const fromAnchor = await listActiveLinks(depsA, { anchorId: ANCHOR });
    expect(fromAnchor).toHaveLength(1);
    expect(fromAnchor[0]!.direction).toBe("outgoing");
    expect(fromAnchor[0]!.target.id).toBe(NOTE);

    const fromNote = await listActiveLinks(depsA, { anchorId: NOTE });
    expect(fromNote[0]!.direction).toBe("incoming");
    expect(fromNote[0]!.target.id).toBe(ANCHOR);
    expect(fromNote[0]!.linkId).toBe(fromAnchor[0]!.linkId);
  });

  it("honours an allowed incoming direction by reversing endpoints", async () => {
    const result = await createLinkWithPolicy(
      depsA,
      policy({ allowedDirections: ["incoming"] }),
      {
        targetId: PERSON,
        linkType: "project.involves_person",
        direction: "incoming",
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.link.sourceEntityId).toBe(PERSON);
    expect(result.link.targetEntityId).toBe(ANCHOR);
  });

  it("rejects a link type the policy does not configure", async () => {
    const result = await createLinkWithPolicy(depsA, policy(), {
      targetId: NOTE,
      linkType: "project.secret_backdoor",
      direction: "outgoing",
    });
    expect(result).toMatchObject({
      ok: false,
      reason: "link_type_not_allowed",
    });
    expect(await countLinkRows()).toBe(0);
  });

  it("rejects a target whose entity type is not allowed for the link type", async () => {
    // person is not an allowed target for supporting_note.
    const result = await createLinkWithPolicy(depsA, policy(), {
      targetId: PERSON,
      linkType: "project.supporting_note",
      direction: "outgoing",
    });
    expect(result).toMatchObject({
      ok: false,
      reason: "target_type_not_allowed",
    });
    expect(await countLinkRows()).toBe(0);
  });

  it("rejects a disallowed direction", async () => {
    const result = await createLinkWithPolicy(
      depsA,
      policy({ allowedDirections: ["outgoing"] }),
      {
        targetId: NOTE,
        linkType: "project.supporting_note",
        direction: "incoming",
      },
    );
    expect(result).toMatchObject({
      ok: false,
      reason: "direction_not_allowed",
    });
  });

  it("rejects a malformed direction value", async () => {
    const result = await createLinkWithPolicy(depsA, policy(), {
      targetId: NOTE,
      linkType: "project.supporting_note",
      direction: "sideways",
    });
    expect(result).toMatchObject({ ok: false, reason: "invalid_request" });
  });

  it("enforces the single-link limit", async () => {
    const single = policy({ multiple: false });
    const first = await createLinkWithPolicy(depsA, single, {
      targetId: NOTE,
      linkType: "project.supporting_note",
      direction: "outgoing",
    });
    expect(first.ok).toBe(true);
    const second = await createLinkWithPolicy(depsA, single, {
      targetId: PERSON,
      linkType: "project.involves_person",
      direction: "outgoing",
    });
    expect(second).toMatchObject({ ok: false, reason: "single_link_limit" });
    expect(await listActiveLinks(depsA, { anchorId: ANCHOR })).toHaveLength(1);
  });

  it("rejects a self-link", async () => {
    const result = await createLinkWithPolicy(depsA, policy(), {
      targetId: ANCHOR,
      linkType: "project.supporting_note",
      direction: "outgoing",
    });
    expect(result).toMatchObject({ ok: false, reason: "self_link" });
  });

  it("rejects a missing target", async () => {
    const result = await createLinkWithPolicy(depsA, policy(), {
      targetId: "does-not-exist",
      linkType: "project.supporting_note",
      direction: "outgoing",
    });
    expect(result).toMatchObject({ ok: false, reason: "target_unavailable" });
  });

  it("rejects a soft-deleted (inaccessible) target", async () => {
    await seedEntity(WS_A, "n-deleted", {
      type: "note",
      title: "Gone",
      deletedAt: "2026-07-18T00:00:00.000Z",
    });
    const result = await createLinkWithPolicy(depsA, policy(), {
      targetId: "n-deleted",
      linkType: "project.supporting_note",
      direction: "outgoing",
    });
    expect(result).toMatchObject({ ok: false, reason: "target_unavailable" });
  });

  it("refuses a reserved structural (spine) link type even if the policy lists it", async () => {
    const result = await createLinkWithPolicy(
      depsA,
      policy({
        linkTypes: [
          { type: "project.belongs_to_area", allowedTargetTypes: ["note"] },
        ],
      }),
      {
        targetId: NOTE,
        linkType: "project.belongs_to_area",
        direction: "outgoing",
      },
    );
    // Guarded by the kernel repository and surfaced as a safe reason.
    expect(result).toMatchObject({ ok: false, reason: "reserved_type" });
    expect(await countLinkRows()).toBe(0);
  });

  it("is idempotent — a duplicate valid create makes no second row", async () => {
    const p = policy();
    const req = {
      targetId: NOTE,
      linkType: "project.supporting_note",
      direction: "outgoing",
    };
    const first = await createLinkWithPolicy(depsA, p, req);
    const second = await createLinkWithPolicy(depsA, p, req);
    expect(first.ok && first.created).toBe(true);
    expect(second.ok && !second.created).toBe(true);
    expect(await listActiveLinks(depsA, { anchorId: ANCHOR })).toHaveLength(1);
  });

  it("enforces workspace isolation — B cannot see or link A's entities", async () => {
    const result = await createLinkWithPolicy(depsB, policy(), {
      targetId: NOTE,
      linkType: "project.supporting_note",
      direction: "outgoing",
    });
    // A's anchor is invisible in workspace B → anchor unavailable.
    expect(result).toMatchObject({ ok: false, reason: "anchor_unavailable" });
    const bResults = await searchLinkTargets(depsB, {
      anchorId: "whatever",
      query: "brief",
    });
    expect(bResults).toHaveLength(0);
  });

  it("searches accessible targets by title and excludes the anchor", async () => {
    const all = await searchLinkTargets(depsA, { anchorId: ANCHOR, query: "" });
    expect(all.map((t) => t.id)).not.toContain(ANCHOR);
    const byTitle = await searchLinkTargets(depsA, {
      anchorId: ANCHOR,
      query: "brief",
    });
    expect(byTitle.map((t) => t.title)).toEqual(["Creative brief"]);
  });

  it("unlinks through the FND-04 repository and touches only entity_links", async () => {
    const created = await createLinkWithPolicy(depsA, policy(), {
      targetId: NOTE,
      linkType: "project.supporting_note",
      direction: "outgoing",
    });
    if (!created.ok) throw new Error("expected ok");
    const result = await unlinkLink(depsA, created.link.id);
    expect(result.changed).toBe(true);
    expect(await listActiveLinks(depsA, { anchorId: ANCHOR })).toHaveLength(0);
    expect(await countLinkRows()).toBe(1); // soft-deleted, single table
  });
});
