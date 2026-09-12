import { RouterProvider, createMemoryRouter } from "react-router";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FeedbackProvider } from "~/shared/feedback";

import { AreasCollectionView } from "~/modules/areas/AreasCollection";
import { DERIVED_IDENTITY_SLOTS } from "~/kernel/entities/identity-colour-slots";
import type { CollectionPresentation } from "~/shared/collection-layout";
import type { SerializedAreaListItem } from "~/modules/areas/area-view";

function area(
  over: Partial<SerializedAreaListItem> = {},
): SerializedAreaListItem {
  return {
    id: "a1",
    title: "Career",
    createdAt: "2026-07-18T09:00:00.000Z",
    updatedAt: "2026-07-20T10:00:00.000Z",
    colourRank: 0,
    iconKey: null,
    colourSlot: null,
    activeProjectCount: 1,
    completedProjectCount: 0,
    rollup: {
      kind: "area",
      goals: { total: 1, completed: 0, ratio: 0 },
      projects: { total: 2, completed: 1, ratio: 0.5 },
      tasks: { total: 4, completed: 1, ratio: 0.25 },
    },
    ...over,
  };
}

function renderCollection(
  areas: readonly SerializedAreaListItem[],
  opts: {
    nextCursor?: string | null;
    failed?: boolean;
    /** Omitted means the product's own default, which is the GALLERY. */
    presentation?: CollectionPresentation;
  } = {},
) {
  const router = createMemoryRouter(
    [
      {
        path: "/areas",
        element: (
          <AreasCollectionView
            areas={areas}
            nextCursor={opts.nextCursor ?? null}
            presentation={opts.presentation}
            failed={opts.failed ?? false}
          />
        ),
      },
    ],
    { initialEntries: ["/areas"] },
  );
  return render(
    <FeedbackProvider>
      <RouterProvider router={router} />
    </FeedbackProvider>,
  );
}

describe("Areas collection", () => {
  it("renders real Area cards as canonical links with exact work-state context", () => {
    renderCollection([
      area({
        title:
          "A very long Area title that should wrap safely without resizing the layout",
      }),
    ]);

    const card = screen.getByRole("article", {
      name: /A very long Area title/,
    });
    expect(
      within(card).getByRole("link", { name: /Open A very long Area title/ }),
    ).toHaveAttribute("href", "/areas/a1");
    /*
     * UNTITLED-05 — the relationships are a FACT STRIP, not a run-on line.
     *
     * The counts used to be joined into one string ("1 Project · 1 Goal") in a
     * flexible cell where nothing lined up. Each is now a figure with its noun
     * beneath it, so a gallery is comparable straight down each column — but
     * the product rule is unchanged and is what this asserts: every count
     * carries its noun, and a count is never a bare number.
     */
    // Two facts share the figure "1" (one Project, one Goal), so the assertion
    // is that the figure and BOTH nouns are drawn rather than that either is
    // unique.
    expect(within(card).getAllByText("1")).toHaveLength(2);
    expect(within(card).getByText("Project")).toBeInTheDocument();
    expect(within(card).getByText("Goal")).toBeInTheDocument();
    /*
     * 4 total tasks, 1 completed -> 3 open, stated with its NOUN so it is never
     * a bare number — and never a proportion, because an Area does not
     * complete.
     */
    expect(within(card).getByText("3")).toBeInTheDocument();
    expect(within(card).getByText("open tasks")).toBeInTheDocument();
    expect(within(card).queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText("1 Area")).toBeInTheDocument();
    /*
     * UNTITLED-05 — the PERMANENCE line, the one fact a Project card can never
     * carry and an Area always can. A Project says how far through it is; an
     * Area says how long it has been tended.
     */
    expect(
      within(card).getByText("Ongoing since Jul 2026"),
    ).toBeInTheDocument();
  });

  it("drops the Permanent chip that said nothing about any particular Area", () => {
    renderCollection([area()]);
    expect(screen.queryByText("Permanent")).not.toBeInTheDocument();
  });

  it("collapses an Area with nothing in flight to ONE state and a next step", () => {
    renderCollection([
      area({
        activeProjectCount: 0,
        rollup: {
          kind: "area",
          goals: { total: 0, completed: 0, ratio: null },
          projects: { total: 0, completed: 0, ratio: null },
          tasks: { total: 0, completed: 0, ratio: null },
        },
      }),
    ]);
    const card = screen.getByRole("article", { name: "Career" });
    /*
     * UNTITLED-05 — the state, in the RECORD's own word, and the next step.
     *
     * "No active work" is `evaluateAreaMomentum`'s label for its `empty`
     * branch, and this card's state is derived from exactly the three counts
     * that imply it — so the collection and the record say one thing about one
     * state rather than inventing a second vocabulary for it.
     *
     * The actionable line stays beside it, because an Area with nothing in it
     * is an Area waiting for its first Project and saying so is how the
     * collection avoids a dead end (AGENTS.md §6). UIX-02 dropped it to one
     * line because both lines then sat in the SAME slot and read as two
     * statements of the same nothing; here the state is a chip and the line
     * beneath it is the invitation.
     */
    expect(within(card).getByText("No active work")).toBeInTheDocument();
    expect(
      within(card).getByText("Ready for its first Project"),
    ).toBeInTheDocument();
    // The three absence messages the audit found are gone.
    expect(within(card).queryByText(/No goals yet/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/No Projects yet/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/No tasks yet/)).not.toBeInTheDocument();
    // And still no fabricated Area score: the ONLY state a bounded collection
    // page can state honestly is the absence.
    expect(within(card).queryByText(/At risk/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/On track/)).not.toBeInTheDocument();
  });

  it("does not repeat the task count as both summary and metric", () => {
    // An Area holding loose tasks and NO Projects or Goals. The first Gate D
    // capture caught this rendering "1 open task" twice, one line above the
    // other.
    renderCollection([
      area({
        activeProjectCount: 0,
        rollup: {
          kind: "area",
          goals: { total: 0, completed: 0, ratio: null },
          projects: { total: 0, completed: 0, ratio: null },
          tasks: { total: 1, completed: 0, ratio: 0 },
        },
      }),
    ]);
    const card = screen.getByRole("article", { name: "Career" });
    expect(within(card).getAllByText(/open task/)).toHaveLength(1);
    // …and it is NOT described as idle, because it is not.
    expect(within(card).queryByText("No active work")).not.toBeInTheDocument();
    expect(
      within(card).queryByText("Ready for its first Project"),
    ).not.toBeInTheDocument();
  });

  it("renders a chosen icon, and the Area default when there is none", () => {
    const { container } = renderCollection([
      area({ id: "a-icon", title: "Health", iconKey: "shield" }),
      area({ id: "a-plain", title: "Career", iconKey: null }),
    ]);
    // The chosen key reaches the resolver; the Area without one falls back to
    // its entity glyph rather than rendering nothing.
    expect(container.querySelector('[data-icon-key="shield"]')).not.toBeNull();
    expect(
      container.querySelectorAll('.dh-accent-icon [data-entity="area"]').length,
    ).toBeGreaterThan(0);
  });

  it("gives every Area card its Area's own identity, not a shared one", () => {
    const { container } = renderCollection([
      area({ id: "a1", title: "Health", colourRank: 0 }),
      area({ id: "a2", title: "Career", colourRank: 1 }),
    ]);
    // IDENTITY-01 — the slot is carried by NAME, so the assertion is about the
    // ramp's first two slots rather than about two array indices.
    const identities = Array.from(
      container.querySelectorAll(".dh-accent-icon"),
    ).map((node) => node.getAttribute("data-identity"));
    expect(identities).toEqual([
      DERIVED_IDENTITY_SLOTS[0],
      DERIVED_IDENTITY_SLOTS[1],
    ]);
  });

  it("lets an Area's CHOSEN colour beat the one its rank derives", () => {
    // The whole point of IDENTITY-01: an owner who picks a colour gets it, and
    // an Area that picked nothing is untouched by the fact that its neighbour
    // did.
    const { container } = renderCollection([
      area({ id: "a1", title: "Health", colourRank: 0, colourSlot: "amber" }),
      area({ id: "a2", title: "Career", colourRank: 1 }),
    ]);
    const identities = Array.from(
      container.querySelectorAll(".dh-accent-icon"),
    ).map((node) => node.getAttribute("data-identity"));
    expect(identities).toEqual(["amber", DERIVED_IDENTITY_SLOTS[1]]);
  });

  it("shows an empty state with a real New area action", () => {
    renderCollection([]);
    expect(screen.getByText("No Areas yet")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "New area" }).length,
    ).toBeGreaterThan(0);
  });

  it("shows retryable failure state without fabricated totals", () => {
    renderCollection([], { failed: true });
    expect(screen.getByText("We couldn’t load your Areas")).toBeInTheDocument();
    expect(
      screen.getByText("We couldn’t load your Areas."),
    ).toBeInTheDocument();
  });

  it("says loaded count, not total, when another page exists", () => {
    renderCollection([area()], { nextCursor: "cursor-next" });
    expect(screen.getByText("1 Area loaded")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Load more Areas" }),
    ).toBeInTheDocument();
  });
});

/**
 * The Areas collection's two PRESENTATIONS.
 *
 * The assertions are about what the collection PRESENTS and how its controls
 * behave, not about pixel geometry: a layout test that pins column widths breaks
 * on every refinement and proves nothing about whether the grid works.
 *
 * UNTITLED-05 settles the ordering UIX-02 and IDENTITY-01 went back and forth
 * on. UIX-02 made Areas a row list on two arguments: an Area card was a Project
 * card with renamed fields, and the cards were mostly empty. The first stopped
 * being true when Projects got `ProjectCard`; the second stopped being true
 * when Areas got `AreaCard`, which is built around what an Area actually has —
 * permanence, and what is living in it. So the GALLERY is the default, an Area
 * being the record most often reached by recognition rather than by reading,
 * and the dense reading is the genuine Untitled table the row list was always
 * reaching for.
 */
describe("Areas presentations", () => {
  it("DEFAULTS to the identity-led gallery", () => {
    const { container } = renderCollection([area(), area({ id: "a2" })]);
    expect(container.querySelector("[data-testid='areas-table']")).toBeNull();
    const grid = container.querySelector(".dh-areacard-grid");
    expect(grid).not.toBeNull();
    // A labelled list, so a screen reader is told what it is before reading it.
    expect(grid?.tagName).toBe("UL");
    expect(grid?.getAttribute("aria-label")).toBe("Areas");
    expect(grid?.querySelectorAll(":scope > li").length).toBe(2);
  });

  it("draws NO progress bar in either presentation, because Areas never complete", () => {
    // The one rule UIX-02 set that survives every re-ordering of the
    // presentations. An Area has no completion, so a bar would answer a
    // question the entity does not have (AGENTS.md §4).
    for (const presentation of ["grid", "table"] as const) {
      const { container, unmount } = renderCollection([area()], {
        presentation,
      });
      expect(
        container.querySelectorAll("[role='progressbar']").length,
        presentation,
      ).toBe(0);
      unmount();
    }
  });

  it("renders a real table when the table presentation is asked for", () => {
    renderCollection([area(), area({ id: "a2", title: "Health" })], {
      presentation: "table",
    });
    /*
     * A genuine React Aria table from the vendored Untitled
     * `application/table` source — so the row grammar, the header association
     * and the keyboard navigation are the library's rather than a hand-rolled
     * set of `role` attributes. The columns are the nouns the row list used to
     * repeat on every row.
     */
    const table = screen.getByRole("grid", { name: /^Areas,/ });
    expect(
      within(table).getByRole("columnheader", { name: "Projects" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", { name: "Open tasks" }),
    ).toBeInTheDocument();
    // Two records, plus the header row.
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(
      within(table).getByRole("link", { name: "Open Career" }),
    ).toHaveAttribute("href", "/areas/a1");
  });

  it("offers the two presentations as ONE view switcher, never as a filter", () => {
    renderCollection([area()]);
    /*
     * Both options are always reachable, and both are real ANCHORS carrying the
     * `present` param — deep-linkable, middle-clickable, Back/Forward-correct,
     * no JavaScript required. Neither changes WHICH records are shown.
     */
    const grid = screen.getByRole("link", { name: /Grid/ });
    const table = screen.getByRole("link", { name: /Table/ });
    expect(grid).toHaveAttribute("aria-current", "page");
    expect(table).not.toHaveAttribute("aria-current");
    expect(table.tagName).toBe("A");
    expect(table.getAttribute("href")).toContain("present=table");
  });

  it("states the same counts with their nouns in both presentations", () => {
    const career = area({
      title: "Career",
      activeProjectCount: 2,
      rollup: {
        kind: "area",
        goals: { total: 3, completed: 1, ratio: 1 / 3 },
        projects: { total: 2, completed: 0, ratio: 0 },
        tasks: { total: 5, completed: 1, ratio: 0.2 },
      },
    });
    // The same facts in both drawings — a presentation never changes what a
    // record says about itself, only how it is laid out. The gallery states the
    // noun on the card; the table states it once, as a column heading.
    const gallery = renderCollection([career], { presentation: "grid" });
    const card = screen.getByRole("article", { name: "Career" });
    // Two facts share the figure "2" (two Projects, two open Goals).
    expect(within(card).getAllByText("2")).toHaveLength(2);
    expect(within(card).getByText("Projects")).toBeInTheDocument();
    expect(within(card).getByText("Goals")).toBeInTheDocument();
    expect(within(card).getByText("4")).toBeInTheDocument();
    expect(within(card).getByText("open tasks")).toBeInTheDocument();
    gallery.unmount();

    renderCollection([career], { presentation: "table" });
    const row = screen.getByTestId("area-table-row");
    expect(within(row).getAllByText("2").length).toBeGreaterThan(0);
    expect(within(row).getAllByText("4").length).toBeGreaterThan(0);
    const table = screen.getByRole("grid", { name: /^Areas,/ });
    expect(
      within(table).getByRole("columnheader", { name: "Goals" }),
    ).toBeInTheDocument();
  });

  it("omits an absent dimension instead of rendering a zero row", () => {
    renderCollection([
      area({
        title: "Fresh start",
        activeProjectCount: 0,
        rollup: {
          kind: "area",
          goals: { total: 0, completed: 0, ratio: null },
          projects: { total: 0, completed: 0, ratio: null },
          tasks: { total: 0, completed: 0, ratio: null },
        },
      }),
    ]);
    const card = screen.getByRole("article", { name: "Fresh start" });
    expect(within(card).queryByText("Projects")).not.toBeInTheDocument();
    expect(within(card).queryByText("Goals")).not.toBeInTheDocument();
    expect(within(card).queryByText("0")).not.toBeInTheDocument();
    expect(
      within(card).getByText("Ready for its first Project"),
    ).toBeInTheDocument();
  });

  /*
   * The same rule in the table: a zero is drawn as an ABSENCE, because a column
   * of zeros reads as eleven warnings and the fact is "there are none yet". The
   * dash is for the eye; the words are for assistive technology.
   */
  it("draws an absent count as an absence in the table, never as a zero", () => {
    renderCollection(
      [
        area({
          title: "Fresh start",
          activeProjectCount: 0,
          rollup: {
            kind: "area",
            goals: { total: 0, completed: 0, ratio: null },
            projects: { total: 0, completed: 0, ratio: null },
            tasks: { total: 0, completed: 0, ratio: null },
          },
        }),
      ],
      { presentation: "table" },
    );
    const row = screen.getByTestId("area-table-row");
    expect(within(row).queryByText("0")).not.toBeInTheDocument();
    expect(within(row).getByText("No Projects yet")).toBeInTheDocument();
    expect(within(row).getByText("No open tasks")).toBeInTheDocument();
  });

  it("carries an accessible overflow menu that does not navigate the card", () => {
    renderCollection([area({ title: "Career" })]);
    const card = screen.getByRole("article", { name: "Career" });
    const trigger = within(card).getByRole("button", {
      name: "More actions for Career",
    });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    fireEvent.click(trigger);
    /*
     * The menu opened and the whole-card link did not fire.
     *
     * DHDS-09 — the panel is portalled into the overlay layer, so it is queried
     * from the document rather than from inside the card. A card clips its own
     * overflow; a panel rendered inside one is clipped with it, which is the
     * defect the shared anchored layer exists to remove.
     */
    expect(
      screen.getByRole("menu", { name: "More actions for Career" }),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole("link", { name: "Open Career" }),
    ).toHaveAttribute("href", "/areas/a1");
  });
});
