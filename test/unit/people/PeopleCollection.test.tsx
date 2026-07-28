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
  opts: { view?: PeopleView; failed?: boolean } = {},
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
    { initialEntries: ["/people"] },
  );
  return render(
    <FeedbackProvider>
      <RouterProvider router={router} />
    </FeedbackProvider>,
  );
}

describe("People collection", () => {
  it("renders a person card as a canonical link with role and organisation", () => {
    renderCollection([personItem({ title: "Ada Lovelace" })]);
    const card = screen.getByRole("article", { name: /Ada Lovelace/ });
    expect(
      within(card).getByRole("link", { name: /Open Ada Lovelace/ }),
    ).toHaveAttribute("href", "/person/p1");
    expect(within(card).getByText(/Mathematician/)).toBeInTheDocument();
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

  it("offers a list/grid view switch", () => {
    renderCollection([personItem()]);
    const group = screen.getByRole("group", { name: "Card layout" });
    expect(
      within(group).getByRole("button", { name: /List view/ }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(group).getByRole("button", { name: /Grid view/ }));
    expect(
      within(group).getByRole("button", { name: /Grid view/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("shows a warm empty state on /people", () => {
    renderCollection([]);
    expect(screen.getByText("No People yet")).toBeInTheDocument();
  });

  // PEOPLE-03 — the derived stay-in-touch signal on a collection card, rendered
  // through the SAME shared indicator the Person record uses.
  it("shows the derived stay-in-touch state as text on the card", () => {
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
    const card = screen.getByRole("article", { name: /Ada Lovelace/ });
    expect(within(card).getByText("Due for follow-up")).toBeInTheDocument();
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
    const card = screen.getByRole("article", { name: /Ada Lovelace/ });
    expect(within(card).getByText("25 July 2026")).toBeInTheDocument();
    expect(within(card).queryByText(/1 January 2020/)).not.toBeInTheDocument();
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
    const card = screen.getByRole("article", { name: /Ada Lovelace/ });
    expect(within(card).getByText("1 January 2020")).toBeInTheDocument();
  });

  it("adds no extra tab stop inside the card for the signal", () => {
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
    const card = screen.getByRole("article", { name: /Ada Lovelace/ });
    expect(within(card).getAllByRole("link")).toHaveLength(1);
  });

  it("shows a Restore action for an archived person in the Archived view", () => {
    renderCollection([personItem({ archived: true })], { view: "archived" });
    const card = screen.getByRole("article", { name: /Ada Lovelace/ });
    expect(within(card).getByText("Archived")).toBeInTheDocument();
    expect(
      within(card).getByRole("button", { name: /Restore/ }),
    ).toBeInTheDocument();
  });
});
