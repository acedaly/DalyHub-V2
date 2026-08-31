/**
 * TODAY-DAY — the attention rail's inclusion rules, caps and ordering, and the
 * activity-recency ranking behind "Continue working".
 *
 * The rail's whole definition is "what the timeline does not show", so the most
 * important assertion here is a NEGATIVE one: overdue tasks never reach it.
 */

import { describe, expect, it } from "vitest";

import {
  buildAttention,
  rankContinueProjects,
  type AttentionInput,
  type ContinueProject,
} from "~/modules/today/day/attention-view";

function input(overrides: Partial<AttentionInput> = {}): AttentionInput {
  return {
    inboxCount: 0,
    waiting: { count: 0, oldestDays: null, followUpDue: 0 },
    assets: { visibleCount: 0, trackedAsTasksCount: 0, first: null },
    projects: [],
    goals: [],
    ...overrides,
  };
}

function project(overrides: Partial<ContinueProject> = {}): ContinueProject {
  return {
    id: "p1",
    title: "Project one",
    openCount: 3,
    taskTotal: 6,
    taskCompleted: 3,
    statusLabel: "On track",
    needsAttention: false,
    lastActivityIso: "2026-08-01T00:00:00.000Z",
    iconKey: null,
    colourSlot: null,
    colourRank: 0,
    nextAction: null,
    ...overrides,
  };
}

describe("inclusion — an item type appears only when its condition holds", () => {
  it("renders nothing when nothing qualifies", () => {
    expect(buildAttention(input())).toEqual([]);
  });

  it("includes the inbox only when something is unfiled", () => {
    expect(buildAttention(input({ inboxCount: 0 }))).toHaveLength(0);
    const rail = buildAttention(input({ inboxCount: 4 }));
    expect(rail[0]?.kind).toBe("inbox");
    expect(rail[0]?.detail).toBe("4 unfiled tasks");
  });

  it("ages the oldest waiting item, because a bare count is noise", () => {
    const rail = buildAttention(
      input({ waiting: { count: 2, oldestDays: 9, followUpDue: 0 } }),
    );
    expect(rail[0]?.detail).toBe("2 waiting items · oldest 9 days");
  });

  it("falls back to the count alone when no age is known", () => {
    const rail = buildAttention(
      input({ waiting: { count: 1, oldestDays: null, followUpDue: 0 } }),
    );
    expect(rail[0]?.detail).toBe("1 waiting item");
  });

  /* ------------------------------------------------------------------ */
  /* V2.7 RECALL-03 — the follow-up fact on the EXISTING waiting row      */
  /* ------------------------------------------------------------------ */

  it("adds the follow-up fact to the waiting row, with its own filtered link", () => {
    const rail = buildAttention(
      input({ waiting: { count: 3, oldestDays: 4, followUpDue: 1 } }),
    );
    // ONE row, the one that already existed: no new card, no new band, no new
    // attention kind (ADR-114 decision 5).
    expect(rail).toHaveLength(1);
    expect(rail[0]?.kind).toBe("waiting");
    // The two machine facts stay DISTINCT: the row's own detail is still the
    // waiting fact, and the follow-up count is its own labelled segment.
    expect(rail[0]?.detail).toBe("3 waiting items · oldest 4 days");
    expect(rail[0]?.href).toBe("/today/waiting");
    expect(rail[0]?.detailAction).toEqual({
      label: "1 follow-up due",
      href: "/today/waiting?followUp=due",
    });
  });

  it("pluralises the follow-up count and never states zero", () => {
    expect(
      buildAttention(
        input({ waiting: { count: 5, oldestDays: 2, followUpDue: 3 } }),
      )[0]?.detailAction?.label,
    ).toBe("3 follow-ups due");
    // The rail has no "0 waiting" row and gains no "0 follow-ups" segment: a
    // surface that speaks when there is nothing to report teaches the owner to
    // stop reading it.
    expect(
      buildAttention(
        input({ waiting: { count: 5, oldestDays: 2, followUpDue: 0 } }),
      )[0]?.detailAction,
    ).toBeUndefined();
  });

  /**
   * FALSIFICATION — the follow-up count must not link to the unfiltered list.
   *
   * A segment that STATES a filtered number while OPENING the whole waiting
   * collection is the same class of untruth as a truncated count presented as a
   * total. The destination is the declarative filter's own address, and this is
   * what stops it quietly becoming `/today/waiting`.
   */
  it("never links a filtered count at the unfiltered collection", () => {
    const rail = buildAttention(
      input({ waiting: { count: 8, oldestDays: 20, followUpDue: 2 } }),
    );
    expect(rail[0]?.detailAction?.href).not.toBe(rail[0]?.href);
    expect(rail[0]?.detailAction?.href).toContain("followUp=due");
  });

  it("carries no follow-up segment on any other row kind", () => {
    const rail = buildAttention(
      input({
        inboxCount: 2,
        waiting: { count: 1, oldestDays: 1, followUpDue: 1 },
        projects: [{ id: "p1", title: "Kitchen", statusLabel: "At risk" }],
        goals: [
          { id: "g1", title: "Fitness", statusLabel: "No recent action" },
        ],
      }),
    );
    for (const item of rail) {
      if (item.kind === "waiting") continue;
      expect(item.detailAction).toBeUndefined();
    }
  });

  it("includes asset obligations only when one is not already represented by an open task", () => {
    expect(
      buildAttention(
        input({
          assets: { visibleCount: 0, trackedAsTasksCount: 2, first: null },
        }),
      ),
    ).toEqual([]);

    const rail = buildAttention(
      input({
        assets: {
          visibleCount: 1,
          trackedAsTasksCount: 1,
          first: {
            assetTitle: "Hilux",
            text: "Registration expires tomorrow",
            href: "/asset/a1?tab=obligations",
          },
        },
      }),
    );
    expect(rail[0]).toMatchObject({
      kind: "asset",
      label: "Hilux",
      detail: "Registration expires tomorrow · 1 tracked as a task",
      href: "/asset/a1?tab=obligations",
    });
  });

  it("navigates every row to its own subject", () => {
    const rail = buildAttention(
      input({
        projects: [{ id: "p 1", title: "Migration", statusLabel: "At risk" }],
        goals: [
          { id: "g1", title: "Ship it", statusLabel: "No recent action" },
        ],
      }),
    );
    expect(rail.map((item) => item.href)).toEqual([
      "/projects/p%201",
      "/goals/g1",
    ]);
  });
});

describe("caps and priority", () => {
  const crowded = input({
    inboxCount: 2,
    waiting: { count: 3, oldestDays: 4, followUpDue: 0 },
    assets: {
      visibleCount: 2,
      trackedAsTasksCount: 0,
      first: {
        assetTitle: "Hilux",
        text: "Registration expires tomorrow",
        href: "/asset/a1?tab=obligations",
      },
    },
    projects: [
      { id: "p1", title: "One", statusLabel: "At risk" },
      { id: "p2", title: "Two", statusLabel: "Stale" },
      { id: "p3", title: "Three", statusLabel: "Blocked" },
    ],
    goals: [
      { id: "g1", title: "Alpha", statusLabel: "No recent action" },
      { id: "g2", title: "Beta", statusLabel: "No recent action" },
    ],
  });

  it("orders inbox, waiting, assets, projects, goals", () => {
    expect(buildAttention(crowded).map((item) => item.kind)).toEqual([
      "inbox",
      "waiting",
      "asset",
      "project",
      "project",
    ]);
  });

  it("caps projects at two and the whole rail at five", () => {
    const rail = buildAttention(crowded);
    expect(rail).toHaveLength(5);
    expect(rail.filter((item) => item.kind === "project")).toHaveLength(2);
  });
});

describe("Continue working", () => {
  it("ranks by real activity recency, not by title or id", () => {
    const ranked = rankContinueProjects([
      project({
        id: "old",
        title: "Aardvark",
        lastActivityIso: "2026-07-01T00:00:00.000Z",
      }),
      project({
        id: "new",
        title: "Zebra",
        lastActivityIso: "2026-08-08T09:00:00.000Z",
      }),
      project({
        id: "mid",
        title: "Middle",
        lastActivityIso: "2026-08-05T09:00:00.000Z",
      }),
    ]);
    expect(ranked.map((item) => item.id)).toEqual(["new", "mid", "old"]);
  });

  it("sorts a project with no recorded activity LAST, never first", () => {
    const ranked = rankContinueProjects([
      project({ id: "unknown", lastActivityIso: null }),
      project({ id: "known", lastActivityIso: "2026-01-01T00:00:00.000Z" }),
    ]);
    expect(ranked.map((item) => item.id)).toEqual(["known", "unknown"]);
  });

  it("excludes projects with no open work — the section can be empty", () => {
    expect(rankContinueProjects([project({ openCount: 0 })])).toEqual([]);
  });

  it("shows at most three", () => {
    const ranked = rankContinueProjects(
      Array.from({ length: 6 }, (_, index) =>
        project({
          id: `p${index}`,
          lastActivityIso: `2026-08-0${index + 1}T00:00:00.000Z`,
        }),
      ),
    );
    expect(ranked).toHaveLength(3);
    expect(ranked[0]?.id).toBe("p5");
  });
});
