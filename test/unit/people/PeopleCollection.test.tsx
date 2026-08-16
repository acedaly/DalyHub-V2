import { RouterProvider, createMemoryRouter } from "react-router";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  PeopleCollectionView,
  type PeopleView,
} from "~/modules/people/PeopleCollection";
import { FeedbackProvider } from "~/shared/feedback";
import type { SerializedPersonListItem } from "~/modules/people/person-view";

function personItem(
  over: Partial<SerializedPersonListItem> = {},
): SerializedPersonListItem {
  return {
    id: "p1",
    title: "Ada Lovelace",
    preferredName: null,
    organisation: "Analytical Engines",
    role: "Mathematician",
    relationship: "colleague",
    relationshipLabel: "Colleague",
    favouriteContactMethod: null,
    favouriteContactMethodLabel: null,
    reach: [],
    tags: [],
    lastInteraction: null,
    nextFollowUp: null,
    photoUrl: null,
    initials: "AL",
    archived: false,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
    ...over,
  };
}

function renderCollection(
  people: readonly SerializedPersonListItem[],
  opts: { view?: PeopleView; failed?: boolean; entry?: string } = {},
) {
  const router = createMemoryRouter(
    [
      {
        path: "/people",
        element: (
          <FeedbackProvider>
            <PeopleCollectionView
              people={people}
              nextCursor={null}
              failed={opts.failed ?? false}
              view={opts.view ?? "all"}
            />
          </FeedbackProvider>
        ),
      },
    ],
    { initialEntries: [opts.entry ?? "/people"] },
  );
  return render(
    <FeedbackProvider>
      <RouterProvider router={router} />
    </FeedbackProvider>,
  );
}

describe("People collection", () => {
  it("renders a person row as a canonical link with role and organisation", () => {
    renderCollection([personItem({ title: "Ada Lovelace" })]);
    const row = screen.getByRole("article", { name: /Ada Lovelace/ });
    expect(
      within(row).getByRole("link", { name: /Open Ada Lovelace/ }),
    ).toHaveAttribute("href", "/person/p1");
    expect(within(row).getByText(/Mathematician/)).toBeInTheDocument();
  });

  it("filters instantly by the search box", () => {
    renderCollection([
      personItem({ id: "p1", title: "Ada Lovelace" }),
      personItem({ id: "p2", title: "Grace Hopper", organisation: "Navy" }),
    ]);
    expect(screen.getByRole("article", { name: /Ada/ })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Search name/), {
      target: { value: "grace" },
    });
    expect(
      screen.queryByRole("article", { name: /Ada/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: /Grace/ })).toBeInTheDocument();
  });

  // UIX-05 — the circle rail is the collection's ONE view switcher.
  it("offers the circle rail, with All active by default", () => {
    renderCollection([personItem()]);
    const group = screen.getByRole("group", { name: "People circles" });
    expect(within(group).getByRole("link", { name: /All/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(within(group).getByRole("link", { name: /Work/ })).toHaveAttribute(
      "href",
      "/people?circle=work",
    );
  });

  it("narrows to a circle derived from the relationship", () => {
    renderCollection(
      [
        personItem({
          id: "p1",
          title: "Ada Lovelace",
          relationship: "colleague",
        }),
        personItem({ id: "p2", title: "Grace Hopper", relationship: "family" }),
      ],
      { entry: "/people?circle=personal" },
    );
    expect(
      screen.queryByRole("article", { name: /Ada/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: /Grace/ })).toBeInTheDocument();
  });

  // "Other" is a real choice and is deliberately not a circle.
  it("keeps an unclassified person out of every circle but All", () => {
    renderCollection(
      [personItem({ relationship: "other", relationshipLabel: "Other" })],
      { entry: "/people?circle=work" },
    );
    expect(
      screen.queryByRole("article", { name: /Ada/ }),
    ).not.toBeInTheDocument();
  });

  it("shows a warm empty state on /people", () => {
    renderCollection([]);
    expect(screen.getByText("No People yet")).toBeInTheDocument();
  });

  // PEOPLE-03 — the derived stay-in-touch signal, now the row's trailing column.
  it("shows the derived stay-in-touch state as text on the row", () => {
    renderCollection([
      personItem({
        stayInTouch: {
          state: "due_for_follow_up",
          label: "Due for follow-up",
          tone: "info",
          reasons: [],
          lastInteractionDate: "2026-05-01",
          daysSinceLastInteraction: 60,
        },
      }),
    ]);
    const row = screen.getByRole("article", { name: /Ada Lovelace/ });
    expect(within(row).getByText("Due for follow-up")).toBeInTheDocument();
  });

  it("escalates an overdue rhythm to the attention tone, with the words beside it", () => {
    renderCollection([
      personItem({
        stayInTouch: {
          state: "out_of_touch",
          label: "Out of touch",
          tone: "neutral",
          reasons: [],
          lastInteractionDate: "2025-01-01",
          daysSinceLastInteraction: 400,
        },
      }),
    ]);
    const rhythm = screen.getByTestId("person-row-rhythm");
    expect(rhythm).toHaveAttribute("data-tone", "warning");
    expect(rhythm).toHaveTextContent("Out of touch");
  });

  it("prefers the DERIVED last interaction over the hand-entered field", () => {
    renderCollection([
      personItem({
        lastInteraction: "2020-01-01",
        stayInTouch: {
          state: "recently_connected",
          label: "Recently connected",
          tone: "success",
          reasons: [],
          lastInteractionDate: "2026-07-25",
          daysSinceLastInteraction: 3,
        },
      }),
    ]);
    const row = screen.getByRole("article", { name: /Ada Lovelace/ });
    expect(
      within(row).getByText("Last spoke 25 July 2026"),
    ).toBeInTheDocument();
    expect(within(row).queryByText(/1 January 2020/)).not.toBeInTheDocument();
  });

  it("falls back to the hand-entered date when nothing has been recorded", () => {
    renderCollection([
      personItem({
        lastInteraction: "2020-01-01",
        stayInTouch: {
          state: "no_history",
          label: "No shared history yet",
          tone: "neutral",
          reasons: [],
          lastInteractionDate: null,
          daysSinceLastInteraction: null,
        },
      }),
    ]);
    const row = screen.getByRole("article", { name: /Ada Lovelace/ });
    expect(
      within(row).getByText("Last spoke 1 January 2020"),
    ).toBeInTheDocument();
  });

  // UIX-05 — the row can reach the person without opening the record.
  it("renders the preferred contact as a real mailto link named for the person", () => {
    renderCollection([
      personItem({
        reach: [
          {
            kind: "Email",
            value: "ada@example.com",
            href: "mailto:ada@example.com",
          },
        ],
      }),
    ]);
    const row = screen.getByRole("article", { name: /Ada Lovelace/ });
    expect(
      within(row).getByRole("link", { name: /Email Ada Lovelace/ }),
    ).toHaveAttribute("href", "mailto:ada@example.com");
  });

  it("adds no extra tab stop inside the row for the signal", () => {
    renderCollection([
      personItem({
        stayInTouch: {
          state: "in_touch",
          label: "In touch",
          tone: "neutral",
          reasons: [],
          lastInteractionDate: "2026-06-01",
          daysSinceLastInteraction: 40,
        },
      }),
    ]);
    const row = screen.getByRole("article", { name: /Ada Lovelace/ });
    expect(within(row).getAllByRole("link")).toHaveLength(1);
  });

  // The catch-up filter is the module's own question, and states its own count.
  it("filters to the people whose rhythm has slipped", () => {
    renderCollection([
      personItem({
        id: "p1",
        title: "Ada Lovelace",
        stayInTouch: {
          state: "in_touch",
          label: "In touch",
          tone: "neutral",
          reasons: [],
          lastInteractionDate: "2026-07-01",
          daysSinceLastInteraction: 10,
        },
      }),
      personItem({
        id: "p2",
        title: "Grace Hopper",
        stayInTouch: {
          state: "out_of_touch",
          label: "Out of touch",
          tone: "neutral",
          reasons: [],
          lastInteractionDate: "2025-01-01",
          daysSinceLastInteraction: 400,
        },
      }),
    ]);
    const toggle = screen.getByRole("button", { name: /Needs a catch-up/ });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(
      screen.queryByRole("article", { name: /Ada/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: /Grace/ })).toBeInTheDocument();
  });

  /*
   * Codex review, PR #156 — every narrowing here runs over the LOADED page, so
   * hiding Load more made matching People on later pages unreachable and let the
   * empty state claim the workspace.
   */
  it("keeps Load more available while a circle is selected", () => {
    render(
      <FeedbackProvider>
        <RouterProvider
          router={createMemoryRouter(
            [
              {
                path: "/people",
                element: (
                  <PeopleCollectionView
                    people={[personItem({ relationship: "family" })]}
                    nextCursor="cursor-2"
                    failed={false}
                    view="all"
                  />
                ),
              },
            ],
            { initialEntries: ["/people?circle=work"] },
          )}
        />
      </FeedbackProvider>,
    );
    expect(
      screen.getByRole("button", { name: /Load more people/ }),
    ).toBeInTheDocument();
    // …and the empty state says what it actually knows, not "Nobody in Work yet".
    expect(
      screen.getByText(/No matches in the 1 loaded so far/),
    ).toBeInTheDocument();
  });

  /*
   * Codex review, PR #156 — the archived loader deliberately serializes every
   * Person WITHOUT a stay-in-touch signal, so offering the catch-up filter there
   * would empty the list every time whatever the stored relationships say.
   */
  it("omits the catch-up filter on the Archived view, in the sheet as well", () => {
    renderCollection([personItem({ archived: true })], { view: "archived" });
    expect(
      screen.queryByRole("button", { name: /Needs a catch-up/ }),
    ).toBeNull();
    fireEvent.click(screen.getByTestId("collection-filter-trigger"));
    /*
     * CONTROL-01 — the CONTROL SURFACE, whichever presentation this environment
     * gets. `useCompactViewport` is false without a matching `matchMedia`, so
     * the test renders the desktop popover; the assertion is about which
     * controls are offered, which is the half that must not depend on the
     * device.
     */
    const controls = screen.getByTestId("collection-popover");
    expect(within(controls).queryByText("Needs a catch-up")).toBeNull();
    // The sort is still offered — it is the group that has data behind it.
    expect(within(controls).getByText("Sort")).toBeInTheDocument();
  });

  it("offers the catch-up filter on the active views", () => {
    renderCollection([personItem()]);
    fireEvent.click(screen.getByTestId("collection-filter-trigger"));
    const controls = screen.getByTestId("collection-popover");
    expect(within(controls).getByText("Needs a catch-up")).toBeInTheDocument();
  });

  it("shows a Restore action for an archived person in the Archived view", () => {
    renderCollection([personItem({ archived: true })], { view: "archived" });
    const row = screen.getByRole("article", { name: /Ada Lovelace/ });
    fireEvent.click(
      within(row).getByRole("button", { name: /Actions for Ada Lovelace/ }),
    );
    expect(
      screen.getByRole("menuitem", { name: /Restore/ }),
    ).toBeInTheDocument();
  });
});
