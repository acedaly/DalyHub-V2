import { describe, expect, it } from "vitest";

import {
  groupLinkedItems,
  linkedTargetIds,
  type LinkedItem,
} from "~/shared/linked-items/linked-items-model";

function item(id: string, type: string, removable = true): LinkedItem {
  return {
    linkId: `link-${id}`,
    target: { id, type, title: `${type} ${id}` },
    linkType: removable ? "link.related" : "meeting.attendee",
    direction: "outgoing",
    removable,
  };
}

describe("groupLinkedItems", () => {
  it("groups by counterpart type in the canonical order, unknown types last", () => {
    const groups = groupLinkedItems([
      item("1", "note"),
      item("2", "area"),
      item("3", "note"),
      item("4", "widget"),
      item("5", "person"),
    ]);
    expect(groups.map((g) => g.type)).toEqual([
      "area",
      "note",
      "person",
      "widget",
    ]);
    // Within a group the input order is preserved.
    const notes = groups.find((g) => g.type === "note");
    expect(notes?.items.map((i) => i.target.id)).toEqual(["1", "3"]);
  });

  it("omits empty groups and returns [] for no items", () => {
    expect(groupLinkedItems([])).toEqual([]);
  });
});

describe("linkedTargetIds", () => {
  it("collects every counterpart id regardless of type or direction", () => {
    const ids = linkedTargetIds([item("a", "note"), item("b", "area", false)]);
    expect([...ids].sort()).toEqual(["a", "b"]);
  });
});
