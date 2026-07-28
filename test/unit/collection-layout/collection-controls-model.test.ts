/**
 * MOBILE-01 — the shared mobile collection-controls model.
 *
 * The contract this asserts is what makes the phone filter sheet trustworthy:
 * draft edits commit nothing, Apply is exactly one URL update, Reset is complete
 * and explicit, unmanaged params survive, and the Filter badge counts only things
 * that actually narrow the collection.
 */

import { describe, expect, it } from "vitest";

import {
  activeFilterCount,
  activeSummary,
  applyDraft,
  currentValue,
  draftFromParams,
  draftIsDirty,
  emptyDraft,
  withDraftValue,
  type CollectionControlGroup,
} from "~/shared/collection-layout/collection-controls-model";

const GROUPS: readonly CollectionControlGroup[] = [
  {
    id: "priority",
    label: "Priority",
    param: "priority",
    options: [
      { value: "", label: "Any" },
      { value: "p1", label: "P1 · Urgent" },
      { value: "p2", label: "P2 · High" },
    ],
  },
  {
    id: "sector",
    label: "Sector",
    param: "sector",
    options: [
      { value: "", label: "Any" },
      { value: "this_week", label: "This week" },
    ],
  },
  {
    id: "sort",
    label: "Sort",
    param: "sort",
    kind: "sort",
    defaultValue: "smart",
    options: [
      { value: "smart", label: "Smart" },
      { value: "due_date", label: "Due date" },
    ],
  },
];

const params = (query: string) => new URLSearchParams(query);

describe("currentValue", () => {
  it("is null for an absent, empty or default value", () => {
    expect(currentValue(GROUPS[0], params(""))).toBeNull();
    expect(currentValue(GROUPS[0], params("priority="))).toBeNull();
    expect(currentValue(GROUPS[2], params("sort=smart"))).toBeNull();
  });

  it("returns a set, non-default value", () => {
    expect(currentValue(GROUPS[0], params("priority=p1"))).toBe("p1");
    expect(currentValue(GROUPS[2], params("sort=due_date"))).toBe("due_date");
  });
});

describe("draft editing", () => {
  it("seeds from the committed URL state", () => {
    expect(
      draftFromParams(GROUPS, params("priority=p1&sort=due_date")),
    ).toEqual({ priority: "p1", sector: null, sort: "due_date" });
  });

  it("selecting the active value clears it (a toggle)", () => {
    const seeded = draftFromParams(GROUPS, params("priority=p1"));
    expect(withDraftValue(seeded, GROUPS[0], "p1").priority).toBeNull();
  });

  it("selecting the default clears it rather than writing the default to the URL", () => {
    const seeded = draftFromParams(GROUPS, params("sort=due_date"));
    expect(withDraftValue(seeded, GROUPS[2], "smart").sort).toBeNull();
  });

  it("reports dirtiness against what is committed, not against empty", () => {
    const committed = params("priority=p1");
    const seeded = draftFromParams(GROUPS, committed);
    expect(draftIsDirty(GROUPS, committed, seeded)).toBe(false);
    expect(
      draftIsDirty(
        GROUPS,
        committed,
        withDraftValue(seeded, GROUPS[1], "this_week"),
      ),
    ).toBe(true);
  });

  it("empties every managed control on Reset", () => {
    expect(emptyDraft(GROUPS)).toEqual({
      priority: null,
      sector: null,
      sort: null,
    });
  });
});

describe("applyDraft", () => {
  it("writes set values and removes cleared ones in one result", () => {
    const committed = params("priority=p1&sector=this_week");
    const draft = { priority: "p2", sector: null, sort: "due_date" };
    const next = applyDraft(GROUPS, committed, draft);
    expect(next.get("priority")).toBe("p2");
    expect(next.has("sector")).toBe(false);
    expect(next.get("sort")).toBe("due_date");
  });

  it("preserves params the sheet does not manage", () => {
    const committed = params("drawer=task:abc&view=matrix&priority=p1");
    const next = applyDraft(GROUPS, committed, emptyDraft(GROUPS));
    expect(next.get("drawer")).toBe("task:abc");
    expect(next.get("view")).toBe("matrix");
    expect(next.has("priority")).toBe(false);
  });

  it("clears pagination, because the result set changed", () => {
    const committed = params("cursor=abc123&priority=p1");
    const next = applyDraft(GROUPS, committed, emptyDraft(GROUPS));
    expect(next.has("cursor")).toBe(false);
  });

  it("clears any extra params the collection nominates", () => {
    const committed = params("cursor=a&page=3&priority=p1");
    const next = applyDraft(GROUPS, committed, emptyDraft(GROUPS), {
      resetParams: ["cursor", "page"],
    });
    expect(next.has("page")).toBe(false);
  });
});

describe("activeFilterCount", () => {
  it("counts only controls that narrow the collection", () => {
    // Sorting differently does not make a list filtered — the badge must not lie.
    expect(activeFilterCount(GROUPS, params("sort=due_date"))).toBe(0);
    expect(activeFilterCount(GROUPS, params("priority=p1"))).toBe(1);
    expect(
      activeFilterCount(
        GROUPS,
        params("priority=p1&sector=this_week&sort=title"),
      ),
    ).toBe(2);
  });

  it("is zero when nothing is applied", () => {
    expect(activeFilterCount(GROUPS, params(""))).toBe(0);
  });
});

describe("activeSummary", () => {
  it("names what is applied in human labels", () => {
    expect(activeSummary(GROUPS, params("priority=p1&sort=due_date"))).toEqual([
      "Priority: P1 · Urgent",
      "Sort: Due date",
    ]);
  });

  it("is empty when nothing is applied", () => {
    expect(activeSummary(GROUPS, params("sort=smart"))).toEqual([]);
  });

  it("falls back to the raw value for an unknown option rather than dropping it", () => {
    expect(activeSummary(GROUPS, params("priority=p9"))).toEqual([
      "Priority: p9",
    ]);
  });
});
