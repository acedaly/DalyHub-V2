import { describe, expect, it } from "vitest";

import { decodeSearchOutcome, type SearchOutcome } from "~/shared/search/model";

function validOutcome(): SearchOutcome {
  return {
    query: "finish",
    status: "ok",
    groups: [
      {
        id: "entity:task",
        kind: "entity",
        label: "task",
        entityType: "task",
        results: [
          {
            id: "today::t1",
            providerId: "today.search",
            moduleId: "today",
            title: "Finish PX-02",
            subtitle: "DalyHub V2",
            entityType: "task",
            target: {
              kind: "drawer",
              drawerKey: "task:t1",
              canonicalPath: "/today",
            },
            score: 0.8,
            titleMatches: [{ start: 0, end: 6 }],
            subtitleMatches: [],
          },
        ],
      },
    ],
    totalCount: 1,
    truncated: false,
    providers: [{ providerId: "today.search", moduleId: "today", ok: true }],
  };
}

describe("decodeSearchOutcome", () => {
  it("round-trips a valid outcome and recomputes the count from validated groups", () => {
    const decoded = decodeSearchOutcome(
      JSON.parse(JSON.stringify(validOutcome())),
    );
    expect(decoded).not.toBeNull();
    expect(decoded!.totalCount).toBe(1);
    expect(decoded!.groups[0]?.results[0]?.title).toBe("Finish PX-02");
  });

  it("returns null for structurally unusable responses", () => {
    expect(decodeSearchOutcome(null)).toBeNull();
    expect(decodeSearchOutcome("nope")).toBeNull();
    expect(decodeSearchOutcome({})).toBeNull(); // no status/groups
    expect(
      decodeSearchOutcome({
        query: "x",
        status: "weird",
        groups: [],
        providers: [],
      }),
    ).toBeNull();
    expect(
      decodeSearchOutcome({
        query: "x",
        status: "ok",
        groups: {},
        providers: [],
      }),
    ).toBeNull();
  });

  it("drops a result carrying an unsafe navigation target", () => {
    const bad = validOutcome() as unknown as {
      groups: { results: { target: unknown }[] }[];
      totalCount: number;
    };
    bad.groups[0].results[0].target = {
      kind: "route",
      to: "javascript:alert(1)",
    };
    const decoded = decodeSearchOutcome(bad);
    expect(decoded).not.toBeNull();
    // The unsafe result is dropped; its now-empty group is dropped too.
    expect(decoded!.totalCount).toBe(0);
    expect(decoded!.groups).toHaveLength(0);
  });

  it("drops results with empty titles or malformed ids but keeps the response", () => {
    const partial = {
      query: "x",
      status: "ok",
      groups: [
        {
          id: "entity:task",
          kind: "entity",
          label: "task",
          results: [
            {
              id: "m::ok",
              providerId: "m.search",
              moduleId: "m",
              title: "Kept",
              target: { kind: "route", to: "/x" },
            },
            {
              id: "m::bad",
              providerId: "m.search",
              moduleId: "m",
              title: "   ",
              target: { kind: "route", to: "/x" },
            },
          ],
        },
      ],
      providers: [],
    };
    const decoded = decodeSearchOutcome(partial);
    expect(decoded!.totalCount).toBe(1);
    expect(decoded!.groups[0]?.results[0]?.title).toBe("Kept");
  });

  it("sanitises malformed match ranges to empty", () => {
    const withBadRanges = validOutcome();
    (
      withBadRanges.groups[0].results[0] as { titleMatches: unknown }
    ).titleMatches = [{ start: 2, end: 1 }, "nope", { start: 1.5, end: 3 }];
    const decoded = decodeSearchOutcome(
      JSON.parse(JSON.stringify(withBadRanges)),
    );
    expect(decoded!.groups[0]?.results[0]?.titleMatches).toEqual([]);
  });

  it("bounds oversized entity types and unknown group kinds", () => {
    const weird = {
      query: "x",
      status: "partial",
      groups: [
        { id: "g", kind: "banana", label: "g", results: [] }, // invalid kind → dropped
      ],
      providers: [{ providerId: "a.search", moduleId: "a", ok: false }],
    };
    const decoded = decodeSearchOutcome(weird);
    expect(decoded).not.toBeNull();
    expect(decoded!.groups).toHaveLength(0);
    expect(decoded!.status).toBe("partial");
  });
});
