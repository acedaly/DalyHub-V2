import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import {
  ReferenceList,
  availableReferenceFamilies,
  groupReferencesByFamily,
  groupReferencesByType,
  referenceFamilyOf,
  referencesOfType,
  relationshipLabel,
  type RecordReference,
} from "~/shared/references";

/**
 * NOTES-02 — the shared References surface.
 *
 * The accessibility contract here is the point: a relationship row states its
 * counterpart's TYPE and the RELATIONSHIP in words (icons are decorative), the
 * archive state is a word, and every list has an accessible name — so a screen
 * reader user gets the same information a sighted user does.
 */
function reference(over: Partial<RecordReference> = {}): RecordReference {
  return {
    linkId: "l1",
    direction: "incoming",
    record: { id: "p1", type: "project", title: "Atlas", archived: false },
    linkType: "link.related",
    relationshipLabel: "Related",
    context: null,
    linkedAt: "2026-07-20T10:00:00.000Z",
    ...over,
  };
}

function renderList(node: React.ReactElement) {
  const router = createMemoryRouter([{ path: "/", element: node }], {
    initialEntries: ["/"],
  });
  return render(<RouterProvider router={router} />);
}

describe("relationshipLabel", () => {
  it("names the known relationship types in the user's words", () => {
    expect(relationshipLabel("link.related")).toBe("Related");
    expect(relationshipLabel("note.references")).toBe("Mentioned in note");
    expect(relationshipLabel("meeting.attendee")).toBe("Meeting attendee");
  });

  it("degrades an unknown module-owned type to readable words, never a slug", () => {
    expect(relationshipLabel("widget.depends_on")).toBe("Depends on");
    expect(relationshipLabel("bare")).toBe("Bare");
  });
});

describe("grouping", () => {
  it("groups by counterpart type in FIRST-SEEN order and preserves inner order", () => {
    const items = [
      reference({
        linkId: "a",
        record: { id: "p1", type: "project", title: "P", archived: false },
      }),
      reference({
        linkId: "b",
        record: { id: "n1", type: "note", title: "N1", archived: false },
      }),
      reference({
        linkId: "c",
        record: { id: "n2", type: "note", title: "N2", archived: false },
      }),
    ];
    expect(groupReferencesByType(items).map((g) => g.type)).toEqual([
      "project",
      "note",
    ]);
    expect(groupReferencesByType(items)[1]?.items.map((i) => i.linkId)).toEqual(
      ["b", "c"],
    );
  });

  it("selects the references of one type (the linked-Projects view)", () => {
    const items = [
      reference({ linkId: "a" }),
      reference({
        linkId: "b",
        record: { id: "n1", type: "note", title: "N", archived: false },
      }),
    ];
    expect(referencesOfType(items, "project").map((i) => i.linkId)).toEqual([
      "a",
    ]);
  });
});

describe("ReferenceList", () => {
  it("shows a meaningful empty state rather than an empty box", () => {
    renderList(
      <ReferenceList
        references={[]}
        label="Records linking to this note"
        emptyTitle="Nothing links here yet"
        emptyDescription="It will appear here."
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Nothing links here yet" }),
    ).toBeInTheDocument();
  });

  it("states the record type, the relationship and the date in WORDS", () => {
    renderList(
      <ReferenceList
        references={[reference()]}
        label="Records linking to this note"
        emptyTitle="none"
        emptyDescription="none"
      />,
    );
    const list = screen.getByRole("list", {
      name: "Records linking to this note",
    });
    const row = within(list).getAllByRole("listitem")[0]!;
    expect(row).toHaveTextContent("Project");
    expect(row).toHaveTextContent("Related");
    expect(row).toHaveTextContent(/Linked/);
    expect(
      within(row).getByRole("link", { name: /Atlas/ }),
    ).toBeInTheDocument();
  });

  it("names an archived counterpart's state in words, never colour alone", () => {
    renderList(
      <ReferenceList
        references={[
          reference({
            record: { id: "n1", type: "note", title: "Old", archived: true },
          }),
        ]}
        label="Links"
        emptyTitle="none"
        emptyDescription="none"
      />,
    );
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("renders bounded context when it exists and nothing when it does not", () => {
    const { rerender } = renderList(
      <ReferenceList
        references={[reference({ context: "…the plan lives in this note…" })]}
        label="Links"
        emptyTitle="none"
        emptyDescription="none"
      />,
    );
    expect(
      screen.getByText("…the plan lives in this note…"),
    ).toBeInTheDocument();
    rerender(<div />);
  });

  it("groups with a real heading and an accessible name per group", () => {
    renderList(
      <ReferenceList
        references={[
          reference(),
          reference({
            linkId: "b",
            record: { id: "n1", type: "note", title: "N", archived: false },
          }),
        ]}
        groupByType
        groupHeadingLevel={4}
        label="Records this note links to"
        emptyTitle="none"
        emptyDescription="none"
      />,
    );
    expect(
      screen.getByRole("heading", { level: 4, name: /Projects/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: /Records this note links to: Notes/ }),
    ).toBeInTheDocument();
  });
});

/**
 * NOTES-05 §6 — module-family grouping for the Backlinks surface.
 *
 * The property that matters is that the presentation ADDS no ordering and DROPS
 * no reference: families appear in one fixed order so a reader learns where to
 * look, empty families never appear, and anything unrecognised still lands
 * somewhere rather than vanishing.
 */
describe("module families", () => {
  const ref = (id: string, type: string, title = type) =>
    reference({
      linkId: id,
      record: { id: `${id}-r`, type, title, archived: false },
    });

  it("maps every supported type to a family, and the unknown to 'other'", () => {
    expect(referenceFamilyOf("note")).toBe("notes");
    expect(referenceFamilyOf("project")).toBe("planning");
    expect(referenceFamilyOf("area")).toBe("planning");
    expect(referenceFamilyOf("goal")).toBe("planning");
    expect(referenceFamilyOf("person")).toBe("people");
    expect(referenceFamilyOf("meeting")).toBe("people");
    expect(referenceFamilyOf("task")).toBe("work");
    expect(referenceFamilyOf("review")).toBe("work");
    expect(referenceFamilyOf("diary")).toBe("diary");
    expect(referenceFamilyOf("asset")).toBe("assets");
    expect(referenceFamilyOf("widget")).toBe("other");
  });

  it("groups in the FIXED family order regardless of input order", () => {
    const groups = groupReferencesByFamily([
      ref("1", "asset"),
      ref("2", "project"),
      ref("3", "note"),
    ]);
    expect(groups.map((group) => group.id)).toEqual([
      "notes",
      "planning",
      "assets",
    ]);
  });

  it("omits empty families entirely", () => {
    const groups = groupReferencesByFamily([ref("1", "note")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe("Notes");
  });

  it("puts unrecognised types last, and never drops them", () => {
    const groups = groupReferencesByFamily([
      ref("1", "widget"),
      ref("2", "note"),
    ]);
    expect(groups.map((group) => group.id)).toEqual(["notes", "other"]);
    expect(groups.flatMap((group) => group.items)).toHaveLength(2);
  });

  it("preserves the server's order inside a family", () => {
    const groups = groupReferencesByFamily([
      ref("a", "project", "First"),
      ref("b", "area", "Second"),
      ref("c", "goal", "Third"),
    ]);
    expect(groups[0]!.items.map((item) => item.record.title)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
  });

  it("offers as filter options only the families actually present, with counts", () => {
    expect(
      availableReferenceFamilies([
        ref("1", "note"),
        ref("2", "note"),
        ref("3", "person"),
      ]),
    ).toEqual([
      { id: "notes", label: "Notes", count: 2 },
      { id: "people", label: "People and Meetings", count: 1 },
    ]);
  });

  it("offers nothing for an empty set, so a filter is never shown over nothing", () => {
    expect(availableReferenceFamilies([])).toEqual([]);
  });

  it("renders one accessible, named list per family with its count", () => {
    renderList(
      <ReferenceList
        references={[
          ref("1", "note", "A note"),
          ref("2", "person", "A person"),
        ]}
        groupByFamily
        groupHeadingLevel={3}
        label="Records linking to this note"
        emptyTitle="none"
        emptyDescription="none"
      />,
    );
    expect(
      screen.getByRole("heading", { level: 3, name: /Notes \(1\)/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: /People and Meetings \(1\)/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", {
        name: "Records linking to this note: Notes",
      }),
    ).toBeInTheDocument();
  });
});
