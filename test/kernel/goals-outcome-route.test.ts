/**
 * STEER-01 — the `/goals` route composition, driven through the REAL loader.
 *
 * Three of the item's acceptance criteria are route-level claims rather than
 * repository ones, and this is where they are proved:
 *
 *  - **The route loads nothing it does not render** (DEBT-207). Asserted over
 *    the loader's returned SHAPE: the sparkline series, the unrendered
 *    definition of done and the unrendered alignment-evidence rows are gone,
 *    with their plumbing.
 *  - **Every count beside a lens is workspace-true** (DEBT-121), and the
 *    filtered page is the workspace's answer rather than the page's.
 *  - **One identity rule** (DEBT-208): the row and the pane resolve the SAME
 *    mark for the same Goal — proven for a Goal with its own identity AND for
 *    one that inherits its Area's, by reading the same machine value from both
 *    rather than by comparing what was drawn.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { loader as indexLoader } from "~/modules/goals/routes/index";
import { goalIdentitySource } from "~/modules/goals/goal-view";
import { resolveIdentity } from "~/shared/entity/identity-resolution";

import {
  FakeClock,
  makeContext,
  makeGoalDetailsRepository,
  makeGoalMeasurementRepository,
  makeSpineRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const OTHER = "ws_goals_outcome_route_other";
const nextEntityId = sequentialIds("goutent");
const nextActivityId = sequentialIds("goutact");

function sessionFor(subject = "owner-subject"): AuthenticatedSession {
  return {
    user: { subject, email: "owner@example.com", displayName: null },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
}

function authedContext(): RouterContextProvider {
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, sessionFor());
  return context;
}

function spine(ws = WS) {
  return makeSpineRepository(makeContext(ws), {
    clock: () => new Date(),
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

/*
 * ONE id generator per repository kind, hoisted to module scope.
 *
 * A generator built inside the helper restarts its sequence on every call, so
 * the second measurement written in a test collides with the first — a
 * UNIQUE-constraint failure that reads like a product bug and is a fixture bug.
 */
const nextDetailsId = sequentialIds("goutgd");
const nextMeasurementId = sequentialIds("goutgm");

function details(ws = WS) {
  return makeGoalDetailsRepository(makeContext(ws), {
    clock: () => new Date(),
    idGenerator: nextDetailsId,
  });
}

function measurements(ws = WS) {
  return makeGoalMeasurementRepository(makeContext(ws), {
    clock: new FakeClock().now,
    idGenerator: nextMeasurementId,
  });
}

function runIndex(url = "https://app.test/goals") {
  return indexLoader({
    request: new Request(url),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof indexLoader>[0]);
}

/** Yesterday and a month ahead, relative to the real clock the loader reads. */
function isoDaysFromToday(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("the /goals loader reads nothing it does not render (DEBT-207)", () => {
  it("carries no sparkline series, no unrendered definition of done and no evidence rows", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Health" });
    const goal = await s.createGoal({ title: "Reach 70 kg", areaId: area.id });
    await details().update(goal.id, {
      measurement: { type: "target_value", baselineValue: 85, targetValue: 70 },
      // A definition of done EXISTS: the assertion below is that the collection
      // does not carry it, not that there was nothing to carry.
      definitionOfDone: "Weigh 70 kg for two consecutive weeks.",
    });
    for (const [value, offset] of [
      [85, -60],
      [82, -30],
      [79, -2],
    ] as const) {
      await measurements().createMeasurement(goal.id, {
        value,
        measuredOn: isoDaysFromToday(offset),
      });
    }

    const result = await runIndex();
    const item = result.goals.find((entry) => entry.id === goal.id)!;
    expect(item).toBeDefined();

    /*
     * The three reads REDESIGN-04 left behind. Each was transferred and typed
     * on every page and every revalidation, and rendered nowhere.
     */
    expect("series" in item).toBe(false);
    expect("definitionOfDone" in item).toBe(false);
    // The pane's detail read no longer carries the five alignment-evidence rows
    // either: the workspace pane never rendered them (the record's Summary
    // does, from its own read).
    expect(result.selected).not.toBeNull();
    expect("alignmentEvidence" in result.selected!).toBe(false);
    expect("alignmentEvidenceHasMore" in result.selected!).toBe(false);

    /*
     * …and every field that REMAINS has a renderer. This is the other half of
     * DEBT-207's closing condition, and it is stated as an explicit list so a
     * field added without a renderer fails here rather than in an audit.
     */
    expect(Object.keys(item).sort()).toEqual(
      [
        "alignment", // the row's accessible name and the pane's indicator
        "area", // the row's context line and its identity fallback
        "colourSlot", // the row's mark (the one identity projection)
        "completedAt", // the lens partition
        "condition", // STEER-02 — the owner's condition, on the row and pane
        "contribution", // the pane's Project chips
        "createdAt",
        "iconKey", // the row's mark
        "id",
        "movement", // the row's signal slot
        "progress", // the row's bar, value and status word
        "title",
        "updatedAt",
      ].sort(),
    );
  });
});

describe("the lens counts the route hands the client are workspace-true (DEBT-121)", () => {
  it("counts the workspace, not the loaded page", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Health" });
    // Six Goals: two behind their own target date, four not.
    for (let index = 0; index < 6; index += 1) {
      const goal = await s.createGoal({
        title: `Goal ${index}`,
        areaId: area.id,
      });
      const overdue = index < 2;
      await details().update(goal.id, {
        measurement: { type: "accumulation", targetValue: 100 },
        targetDate: isoDaysFromToday(overdue ? -5 : 120),
      });
      await measurements().createMeasurement(goal.id, {
        value: 1,
        measuredOn: isoDaysFromToday(-3),
      });
    }

    const result = await runIndex();
    expect(result.lensCounts).not.toBeNull();
    expect(result.lensCounts!.total).toBe(6);
    expect(result.lensCounts!.attention).toBe(2);

    // Under the "Needs attention" lens the loaded page IS the lens's whole
    // answer, and the count still describes the workspace rather than the page.
    const filtered = await runIndex("https://app.test/goals?view=attention");
    expect(filtered.goals).toHaveLength(2);
    expect(filtered.lensCounts!.attention).toBe(2);
    expect(filtered.lensCounts!.total).toBe(6);
  });

  it("shows no counts at all on the Deleted scope, rather than the active ones", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Health" });
    await s.createGoal({ title: "Alive", areaId: area.id });

    const deleted = await runIndex("https://app.test/goals?state=deleted");
    // DEBT-121's rule: a count is true of the set its label names, or absent.
    // Four numbers about the ACTIVE collection beside a list of deleted Goals
    // would be exactly the mismatch this closed.
    expect(deleted.lensCounts).toBeNull();
  });
});

describe("one identity rule paints the row and the pane (DEBT-208)", () => {
  it("resolves the SAME mark for a Goal that has its OWN identity", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Health" });
    const goal = await s.createGoal({ title: "Reach 70 kg", areaId: area.id });
    await details().update(goal.id, { iconKey: "running", colourSlot: "pink" });

    const result = await runIndex(
      `https://app.test/goals?goal=${encodeURIComponent(goal.id)}`,
    );
    const row = result.goals.find((entry) => entry.id === goal.id)!;
    const pane = result.selected!;

    const rowIdentity = resolveIdentity(
      goalIdentitySource({
        own: { iconKey: row.iconKey, colourSlot: row.colourSlot },
        area: row.area,
      }),
    );
    const paneIdentity = resolveIdentity(
      goalIdentitySource({
        own: {
          iconKey: pane.details.iconKey,
          colourSlot: pane.details.colourSlot,
        },
        area: pane.overview.area,
      }),
    );

    // The Goal's OWN choice, on both surfaces — the case that used to disagree:
    // the row resolved the Goal's identity and the pane resolved only the
    // Area's, so one record wore two marks side by side.
    expect(rowIdentity).toEqual({ slot: "pink", iconKey: "running" });
    expect(paneIdentity).toEqual(rowIdentity);
  });

  it("resolves the SAME mark for a Goal that INHERITS its Area's", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Health" });
    const goal = await s.createGoal({ title: "Reach 70 kg", areaId: area.id });

    const result = await runIndex(
      `https://app.test/goals?goal=${encodeURIComponent(goal.id)}`,
    );
    const row = result.goals.find((entry) => entry.id === goal.id)!;
    const pane = result.selected!;

    const rowIdentity = resolveIdentity(
      goalIdentitySource({
        own: { iconKey: row.iconKey, colourSlot: row.colourSlot },
        area: row.area,
      }),
    );
    const paneIdentity = resolveIdentity(
      goalIdentitySource({
        own: {
          iconKey: pane.details.iconKey,
          colourSlot: pane.details.colourSlot,
        },
        area: pane.overview.area,
      }),
    );

    // The deliberate FALLBACK is preserved — and it is preserved by the same
    // one rule, so it cannot drift on one surface and not the other.
    expect(rowIdentity.slot).not.toBeNull();
    expect(paneIdentity).toEqual(rowIdentity);
  });
});

describe("the collection answers the OUTCOME question end to end", () => {
  it("orders the workspace by outcome, with the lens applied in the read", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Health" });
    // Created FIRST and healthy; created LAST and overdue. Creation order
    // alone (or the alignment order, which ranks a Goal with no structure
    // above one with recent activity) would put them the other way round.
    const healthy = await s.createGoal({ title: "Healthy", areaId: area.id });
    await details().update(healthy.id, {
      measurement: { type: "accumulation", targetValue: 10 },
      targetDate: isoDaysFromToday(200),
    });
    await measurements().createMeasurement(healthy.id, {
      value: 9,
      measuredOn: isoDaysFromToday(-1),
    });
    const late = await s.createGoal({ title: "Late", areaId: area.id });
    await details().update(late.id, {
      measurement: { type: "accumulation", targetValue: 10 },
      targetDate: isoDaysFromToday(-10),
    });
    await measurements().createMeasurement(late.id, {
      value: 1,
      measuredOn: isoDaysFromToday(-1),
    });

    const result = await runIndex();
    expect(result.goals.map((goal) => goal.id)).toEqual([late.id, healthy.id]);
    // The selection defaults to the collection's own leader — the Goal the
    // surface says most needs a decision.
    expect(result.selectedId).toBe(late.id);
  });

  it("resets a stale cursor calmly to the first page rather than failing", async () => {
    const s = spine();
    const area = await s.createArea({ title: "Health" });
    await s.createGoal({ title: "One", areaId: area.id });
    await s.createGoal({ title: "Two", areaId: area.id });

    // A cursor from another sort's vocabulary — the case an owner reaches by
    // keeping a tab open across a day rollover, or by editing the URL.
    const result = await runIndex(
      "https://app.test/goals?cursor=not-a-real-cursor",
    );
    expect(result.failed).toBe(false);
    expect(result.goals).toHaveLength(2);
  });
});
