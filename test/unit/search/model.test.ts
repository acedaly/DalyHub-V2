import { describe, expect, it } from "vitest";

import {
  MAX_QUERY_LENGTH,
  MAX_TOTAL_RESULTS,
  assembleOutcome,
  clampIndex,
  dedupeTagged,
  emptyOutcome,
  firstIndex,
  fuzzyMatch,
  foldText,
  groupRankedResults,
  isExecutableQuery,
  isSafeInAppPath,
  lastIndex,
  nextIndex,
  normaliseQuery,
  previousIndex,
  rankResults,
  resultIdentity,
  validateResultItem,
  validateTarget,
  type ProviderResultBatch,
  type SearchResultItem,
  type TaggedResult,
} from "~/shared/search/model";

const drawerTarget = {
  kind: "drawer" as const,
  drawerKey: "task:1",
  canonicalPath: "/today",
};

function item(overrides: Partial<SearchResultItem> = {}): SearchResultItem {
  return {
    id: "1",
    title: "Finish PX-02",
    target: drawerTarget,
    ...overrides,
  };
}

function tagged(overrides: Partial<TaggedResult> = {}): TaggedResult {
  return {
    itemId: "1",
    providerId: "today.search",
    moduleId: "today",
    title: "Finish PX-02",
    target: drawerTarget,
    ...overrides,
  };
}

describe("normaliseQuery", () => {
  it("collapses whitespace and trims", () => {
    expect(normaliseQuery("  finish   px  ")).toBe("finish px");
  });

  it("returns empty for whitespace-only or non-string", () => {
    expect(normaliseQuery("   ")).toBe("");
    expect(normaliseQuery("")).toBe("");
    expect(normaliseQuery(undefined as unknown as string)).toBe("");
  });

  it("caps length to the code-point limit without splitting surrogate pairs", () => {
    const emoji = "😀"; // one code point, two UTF-16 units
    const query = normaliseQuery(emoji.repeat(MAX_QUERY_LENGTH + 10));
    expect(Array.from(query)).toHaveLength(MAX_QUERY_LENGTH);
    // No lone surrogate: re-normalising is a no-op.
    expect(normaliseQuery(query)).toBe(query);
  });

  it("NFC-normalises unicode", () => {
    const decomposed = "é"; // e + combining acute
    expect(normaliseQuery(decomposed)).toBe("é".normalize("NFC"));
  });

  it("is case-preserving", () => {
    expect(normaliseQuery("Finish")).toBe("Finish");
  });
});

describe("isExecutableQuery", () => {
  it("rejects empty and accepts a single character", () => {
    expect(isExecutableQuery("")).toBe(false);
    expect(isExecutableQuery("a")).toBe(true);
  });
});

describe("validateTarget", () => {
  it("accepts safe drawer and route targets", () => {
    expect(validateTarget(drawerTarget)).toEqual(drawerTarget);
    expect(validateTarget({ kind: "route", to: "/projects/a" })).toEqual({
      kind: "route",
      to: "/projects/a",
    });
  });

  it("rejects javascript, protocol-relative, external and backslash targets", () => {
    expect(
      validateTarget({ kind: "route", to: "javascript:alert(1)" }),
    ).toBeNull();
    expect(validateTarget({ kind: "route", to: "//evil.example" })).toBeNull();
    expect(
      validateTarget({ kind: "route", to: "https://evil.example" }),
    ).toBeNull();
    expect(validateTarget({ kind: "route", to: "/a\\b" })).toBeNull();
    expect(
      validateTarget({ kind: "drawer", drawerKey: "k", canonicalPath: "//x" }),
    ).toBeNull();
  });

  it("rejects unknown kinds, empty keys and non-objects", () => {
    expect(validateTarget({ kind: "modal", to: "/x" })).toBeNull();
    expect(validateTarget({ kind: "drawer", drawerKey: "   " })).toBeNull();
    expect(validateTarget(null)).toBeNull();
    expect(validateTarget("/x")).toBeNull();
  });

  it("strips extra properties", () => {
    const dirty = { kind: "route", to: "/x", danger: "y" } as unknown;
    expect(validateTarget(dirty)).toEqual({ kind: "route", to: "/x" });
  });
});

describe("isSafeInAppPath", () => {
  it("accepts app-relative and rejects everything else", () => {
    expect(isSafeInAppPath("/today")).toBe(true);
    expect(isSafeInAppPath("/today?drawer=x")).toBe(true);
    expect(isSafeInAppPath("today")).toBe(false);
    expect(isSafeInAppPath("")).toBe(false);
    expect(isSafeInAppPath(42)).toBe(false);
  });
});

describe("validateResultItem", () => {
  it("validates a good item and namespaces identity", () => {
    const result = validateResultItem(item(), "today", "today.search");
    expect(result).not.toBeNull();
    expect(resultIdentity(result!)).toBe("today::1");
  });

  it("drops empty titles, malformed ids and unsafe targets", () => {
    expect(
      validateResultItem(item({ title: "   " }), "today", "today.search"),
    ).toBeNull();
    expect(
      validateResultItem(item({ id: "" }), "today", "today.search"),
    ).toBeNull();
    expect(
      validateResultItem(
        item({ target: { kind: "route", to: "javascript:1" } as never }),
        "today",
        "today.search",
      ),
    ).toBeNull();
  });

  it("degrades an invalid entity type and a non-finite score instead of dropping", () => {
    const result = validateResultItem(
      item({ entityType: "Not A Slug" as never, score: Number.NaN }),
      "today",
      "today.search",
    );
    expect(result).not.toBeNull();
    expect(result!.entityType).toBeUndefined();
    expect(result!.providerScore).toBeUndefined();
  });

  it("clamps a provider score to [0,1] and truncates oversized fields", () => {
    const result = validateResultItem(
      item({ score: 5, title: "x".repeat(500) }),
      "today",
      "today.search",
    );
    expect(result!.providerScore).toBe(1);
    expect(result!.title.length).toBeLessThanOrEqual(200);
  });
});

describe("dedupeTagged", () => {
  it("keeps the first occurrence of a duplicate identity", () => {
    const a = tagged({ title: "First" });
    const b = tagged({ title: "Second" });
    expect(dedupeTagged([a, b])).toEqual([a]);
  });

  it("keeps different modules with the same item id", () => {
    const a = tagged({ moduleId: "today" });
    const b = tagged({ moduleId: "projects" });
    expect(dedupeTagged([a, b])).toHaveLength(2);
  });
});

describe("fuzzyMatch", () => {
  it("matches a subsequence and returns merged ranges", () => {
    const match = fuzzyMatch(foldText("px"), foldText("Finish PX-02"));
    expect(match).not.toBeNull();
    expect(match!.ranges.length).toBeGreaterThan(0);
  });

  it("returns null for a non-subsequence", () => {
    expect(fuzzyMatch(foldText("zzz"), foldText("Finish PX-02"))).toBeNull();
  });
});

describe("rankResults", () => {
  it("orders exact > prefix > token > fuzzy > subtitle", () => {
    const results: TaggedResult[] = [
      tagged({ itemId: "fuzzy", title: "Fedora exploration ... x" }),
      tagged({
        itemId: "subtitle",
        title: "Unrelated",
        subtitle: "contains fx here",
      }),
      tagged({ itemId: "exact", title: "fx" }),
      tagged({ itemId: "prefix", title: "fxtate report" }),
      tagged({ itemId: "token", title: "Report fx summary" }),
    ];
    const ranked = rankResults("fx", results);
    expect(
      ranked.map((r) => (r.providerId ? r.id.split("::")[1] : "")),
    ).toEqual(["exact", "prefix", "token", "fuzzy", "subtitle"]);
  });

  it("is deterministic and stable for equal tiers (title then id)", () => {
    const results: TaggedResult[] = [
      tagged({ itemId: "b", title: "Alpha" }),
      tagged({ itemId: "a", title: "Alpha" }),
    ];
    const ranked = rankResults("alpha", results);
    expect(ranked.map((r) => r.id)).toEqual(["today::a", "today::b"]);
  });

  it("uses a normalised provider score only as a tie-breaker", () => {
    const results: TaggedResult[] = [
      tagged({ itemId: "low", title: "Match", providerScore: 0.1 }),
      tagged({ itemId: "high", title: "Match", providerScore: 0.9 }),
    ];
    const ranked = rankResults("match", results);
    expect(ranked[0]!.id).toBe("today::high");
  });

  it("produces title match ranges for highlighting", () => {
    const [only] = rankResults("px", [tagged({ title: "Finish PX-02" })]);
    expect(only!.titleMatches.length).toBeGreaterThan(0);
  });
});

describe("groupRankedResults", () => {
  it("groups by entity type in first-seen order, module fallback last", () => {
    const ranked = rankResults("a", [
      tagged({ itemId: "1", title: "a1", entityType: "task" }),
      tagged({ itemId: "2", title: "a2", entityType: "project" }),
      tagged({ itemId: "3", title: "a3" }),
    ]);
    const groups = groupRankedResults(ranked, new Map([["today", "Today"]]));
    expect(groups.map((g) => g.id)).toContain("entity:task");
    expect(groups.map((g) => g.id)).toContain("module:today");
    const moduleGroup = groups.find((g) => g.kind === "module");
    expect(moduleGroup!.label).toBe("Today");
  });
});

describe("assembleOutcome", () => {
  function batch(
    overrides: Partial<ProviderResultBatch> = {},
  ): ProviderResultBatch {
    return {
      providerId: "today.search",
      moduleId: "today",
      moduleLabel: "Today",
      ok: true,
      items: [item()],
      ...overrides,
    };
  }

  it("returns ok with grouped results when all providers succeed", () => {
    const outcome = assembleOutcome("finish", [batch()]);
    expect(outcome.status).toBe("ok");
    expect(outcome.totalCount).toBe(1);
    expect(outcome.groups).toHaveLength(1);
  });

  it("returns partial when some providers fail", () => {
    const outcome = assembleOutcome("finish", [
      batch(),
      batch({ providerId: "x.search", moduleId: "x", ok: false, items: [] }),
    ]);
    expect(outcome.status).toBe("partial");
    expect(outcome.providers.some((p) => !p.ok)).toBe(true);
  });

  it("returns error when every provider fails", () => {
    const outcome = assembleOutcome("finish", [
      batch({ ok: false, items: [] }),
    ]);
    expect(outcome.status).toBe("error");
    expect(outcome.totalCount).toBe(0);
  });

  it("enforces the per-provider limit", () => {
    const items = Array.from({ length: 100 }, (_, i) =>
      item({ id: `i${i}`, title: `Match ${i}` }),
    );
    const outcome = assembleOutcome("match", [batch({ items })], {
      maxResultsPerProvider: 3,
    });
    expect(outcome.totalCount).toBe(3);
  });

  it("enforces the total limit and flags truncation", () => {
    const items = Array.from({ length: MAX_TOTAL_RESULTS + 20 }, (_, i) =>
      item({ id: `i${i}`, title: `Match ${i}` }),
    );
    const outcome = assembleOutcome(
      "match",
      [batch({ items, moduleLabel: "Today" })],
      { maxResultsPerProvider: 1000 },
    );
    expect(outcome.totalCount).toBe(MAX_TOTAL_RESULTS);
    expect(outcome.truncated).toBe(true);
  });

  it("empty and failure helpers are safe", () => {
    expect(emptyOutcome("x").status).toBe("ok");
    expect(emptyOutcome("x").groups).toEqual([]);
  });
});

describe("selection maths", () => {
  it("wraps arrows and clamps home/end", () => {
    expect(nextIndex(-1, 3)).toBe(0);
    expect(nextIndex(2, 3)).toBe(0);
    expect(previousIndex(0, 3)).toBe(2);
    expect(previousIndex(-1, 3)).toBe(2);
    expect(firstIndex(3)).toBe(0);
    expect(lastIndex(3)).toBe(2);
    expect(clampIndex(9, 3)).toBe(2);
  });

  it("has no active option for an empty list", () => {
    expect(nextIndex(-1, 0)).toBe(-1);
    expect(firstIndex(0)).toBe(-1);
    expect(lastIndex(0)).toBe(-1);
  });
});

describe("entity type validation reuses the FND-02 contract", () => {
  // Import the authoritative kernel validator so this test cannot drift.
  it("accepts every kernel-valid entity type (dotted/underscored)", async () => {
    const { validateEntityType } = await import("~/kernel/entities");
    for (const type of ["task", "meeting.follow_up", "project.sub_project"]) {
      // Sanity: the value really is valid under the kernel contract.
      expect(() => validateEntityType(type)).not.toThrow();
      const result = validateResultItem(
        item({ entityType: type as never }),
        "m",
        "m.search",
      );
      expect(result?.entityType).toBe(type);
    }
  });

  it("drops (degrades) values the kernel contract rejects — never crashes", async () => {
    const { validateEntityType } = await import("~/kernel/entities");
    for (const type of [
      "NotValid",
      "meeting-follow-up",
      "meeting..follow_up",
    ]) {
      // Sanity: the value really is invalid under the kernel contract.
      expect(() => validateEntityType(type)).toThrow();
      const result = validateResultItem(
        item({ entityType: type as never }),
        "m",
        "m.search",
      );
      expect(result).not.toBeNull(); // the result survives...
      expect(result?.entityType).toBeUndefined(); // ...only the field is dropped
    }
  });
});
