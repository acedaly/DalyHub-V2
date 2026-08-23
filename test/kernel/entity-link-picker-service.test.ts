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
  unlinkWithPolicy,
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

  it("enforces workspace isolation — B cannot see or link A’s entities", async () => {
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

  it("finds a record created BEYOND the ascending scan horizon", async () => {
    /*
     * DEBT-201 / V2.4-GATE-01 — the ascending scan is bounded at five pages of
     * 100 and `list` orders `(createdAt, id)` ASC, so it only ever saw a
     * workspace's 500 OLDEST entities. Past that count a record created seconds
     * ago was invisible, and the picker presented an unreachable record exactly
     * like a nonexistent one.
     *
     * MEASURED before this test existed: one complete sequential gate run
     * crosses the threshold at partition p09 — 558 active entities — and FIVE
     * journeys then fail on `getByRole("option", …)` for a record they had just
     * created. CI could not see it, because every partition gets a fresh
     * container and a fresh database.
     *
     * 520 filler rows put the target past the horizon. The timestamps ascend so
     * the target really is the NEWEST row rather than merely a late one, which
     * is what makes this a horizon test rather than an ordering coincidence.
     */
    const base = Date.parse("2026-07-18T00:00:00.000Z");
    for (let i = 0; i < 520; i += 1) {
      await seedEntity(WS_A, `filler-${String(i).padStart(4, "0")}`, {
        type: "note",
        title: `Filler note ${i}`,
        at: new Date(base + i * 1000).toISOString(),
      });
    }
    await seedEntity(WS_A, "n-just-made", {
      type: "note",
      title: "Just made this one",
      at: new Date(base + 520 * 1000).toISOString(),
    });

    const found = await searchLinkTargets(depsA, {
      anchorId: ANCHOR,
      query: "Just made this one",
      targetTypes: ["note"],
    });
    expect(found.map((t) => t.id)).toContain("n-just-made");
  });

  it("policy-authorised unlink removes the link and touches only entity_links", async () => {
    const created = await createLinkWithPolicy(depsA, policy(), {
      targetId: NOTE,
      linkType: "project.supporting_note",
      direction: "outgoing",
    });
    if (!created.ok) throw new Error("expected ok");
    const result = await unlinkWithPolicy(depsA, policy(), created.link.id);
    expect(result).toMatchObject({ ok: true, changed: true });
    expect(await listActiveLinks(depsA, { anchorId: ANCHOR })).toHaveLength(0);
    expect(await countLinkRows()).toBe(1); // soft-deleted, single table
  });

  it("refuses a crafted unlink of a link not anchored to the policy anchor", async () => {
    // A link between NOTE and PERSON (not involving the p-anchor project).
    await seedEntity(WS_A, "n-other", { type: "note", title: "Other" });
    const foreign = await createLinkWithPolicy(
      depsA,
      { ...policy(), anchorId: NOTE },
      {
        targetId: "n-other",
        linkType: "project.supporting_note",
        direction: "outgoing",
      },
    );
    if (!foreign.ok) throw new Error("expected ok");
    // The p-anchor policy must not be able to remove a link it does not anchor.
    const result = await unlinkWithPolicy(depsA, policy(), foreign.link.id);
    expect(result).toMatchObject({ ok: false, reason: "not_permitted" });
    // The link is still active.
    expect(await listActiveLinks(depsA, { anchorId: NOTE })).toHaveLength(1);
  });

  it("refuses a crafted unlink of a link type the policy does not allow", async () => {
    const created = await createLinkWithPolicy(depsA, policy(), {
      targetId: NOTE,
      linkType: "project.supporting_note",
      direction: "outgoing",
    });
    if (!created.ok) throw new Error("expected ok");
    // A policy that no longer permits that link type must not remove it.
    const narrowed = policy({
      linkTypes: [
        { type: "project.involves_person", allowedTargetTypes: ["person"] },
      ],
    });
    const result = await unlinkWithPolicy(depsA, narrowed, created.link.id);
    expect(result).toMatchObject({ ok: false, reason: "not_permitted" });
    expect(await listActiveLinks(depsA, { anchorId: ANCHOR })).toHaveLength(1);
  });

  it("refuses an unknown or cross-workspace link id", async () => {
    expect(await unlinkWithPolicy(depsA, policy(), "nope")).toMatchObject({
      ok: false,
      reason: "not_found",
    });
    const created = await createLinkWithPolicy(depsA, policy(), {
      targetId: NOTE,
      linkType: "project.supporting_note",
      direction: "outgoing",
    });
    if (!created.ok) throw new Error("expected ok");
    // Workspace B cannot see (and so cannot unlink) A's link.
    const crossWs = await unlinkWithPolicy(
      depsB,
      { ...policy(), anchorId: ANCHOR },
      created.link.id,
    );
    expect(crossWs).toMatchObject({ ok: false, reason: "not_found" });
    expect(await listActiveLinks(depsA, { anchorId: ANCHOR })).toHaveLength(1);
  });

  it("keeps multiple:false concurrency-safe — two concurrent creates leave one link", async () => {
    const single = policy({ multiple: false });
    const [a, b] = await Promise.all([
      createLinkWithPolicy(depsA, single, {
        targetId: NOTE,
        linkType: "project.supporting_note",
        direction: "outgoing",
      }),
      createLinkWithPolicy(depsA, single, {
        targetId: PERSON,
        linkType: "project.involves_person",
        direction: "outgoing",
      }),
    ]);
    // Exactly one survives; the loser is rolled back and reported.
    const active = await listActiveLinks(depsA, { anchorId: ANCHOR });
    expect(active).toHaveLength(1);
    const oks = [a, b].filter((r) => r.ok).length;
    const limited = [a, b].filter(
      (r) => !r.ok && r.reason === "single_link_limit",
    ).length;
    expect(oks).toBe(1);
    expect(limited).toBe(1);
  });
});
