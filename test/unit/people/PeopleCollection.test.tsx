import { RouterProvider, createMemoryRouter } from "react-router";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  PeopleCollectionView,
  type PeopleView,
} from "~/modules/people/PeopleCollection";
import { FeedbackProvider } from "~/shared/feedback";
import type {
  SerializedPersonListItem,
  SerializedPersonStayInTouch,
} from "~/modules/people/person-view";

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

/**
 * A stay-in-touch signal with the honest zero shape for the two connection
 * counts, so a test names only the fields it is actually about.
 */
function signal(
  over: Partial<SerializedPersonStayInTouch> &
    Pick<SerializedPersonStayInTouch, "state" | "label" | "tone">,
): SerializedPersonStayInTouch {
  return {
    reasons: [],
    lastInteractionDate: null,
    daysSinceLastInteraction: null,
    openTasks: 0,
    activeProjects: 0,
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
    const group = screen.getByRole("navigation", { name: "People circles" });
    expect(within(group).getByRole("link", { name: /All/ })).toHaveAttribute(
      "aria-current",
      "page",
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

  /*
   * UNTITLED-13 — the phone keeps its SEARCH, and says so through the layout.
   *
   * The behaviour itself is a media query and cannot be asserted in jsdom; the
   * opt-in can. It matters because the first draft of this pass reached for
   * `persistentControls` by its name, which makes the SHEET the control surface
   * at every width and leaves the hide rule in force — so at 393px the band,
   * the toggle, the sort and the search all disappeared together, which is the
   * exact defect HARDEN-02 fixed.
   */
  it("opts the filter band out of the phone hide rule", () => {
    const { container } = renderCollection([personItem()]);
    expect(
      container.querySelector(".dh-collection--keep-filters"),
    ).not.toBeNull();
  });

  it("shows a warm empty state on /people", () => {
    renderCollection([]);
    expect(screen.getByText("No People yet")).toBeInTheDocument();
  });

  // PEOPLE-03 — the derived stay-in-touch signal, now the row's trailing column.
  it("shows the derived stay-in-touch state as text on the row", () => {
    renderCollection([
      personItem({
        stayInTouch: signal({
          state: "due_for_follow_up",
          label: "Due for follow-up",
          tone: "info",
          reasons: [],
          lastInteractionDate: "2026-05-01",
          daysSinceLastInteraction: 60,
        }),
      }),
    ]);
    const row = screen.getByRole("article", { name: /Ada Lovelace/ });
    expect(within(row).getByText("Due for follow-up")).toBeInTheDocument();
  });

  /*
   * UNTITLED-13 — this assertion PINNED A DEFECT, and the defect is the reason
   * the pass touched it.
   *
   * UIX-05 escalated `out_of_touch` and `due_for_follow_up` from the kernel's
   * `neutral` to the row's `warning`, and `card-family.css` painted `warning`
   * with `--dh-color-overdue` — the product's OVERDUE colour, the one a Task
   * wears when its due date has passed. On a fourteen-person fixture that is
   * four red dots down a People list, on the surface whose whole brief is that
   * it is not a CRM. AGENTS.md §5 and `person-relationship.ts` both rule it out
   * in as many words ("no red 'overdue' relationship"), and `RelationshipTone`
   * has no `warning` member precisely so that this could not be expressed.
   *
   * The emphasis the escalation wanted is real and is still there: the rhythm is
   * the last column, where the eye lands and stays, and these rows are FIRST
   * under the default sort. What is gone is the colour that said a friend you
   * have not rung is an overdue task.
   */
  it("states a long silence in words, and never as an overdue warning", () => {
    renderCollection([
      personItem({
        stayInTouch: signal({
          state: "out_of_touch",
          label: "Out of touch",
          tone: "neutral",
          reasons: [],
          lastInteractionDate: "2025-01-01",
          daysSinceLastInteraction: 400,
        }),
      }),
    ]);
    const rhythm = screen.getByTestId("person-row-rhythm");
    expect(rhythm).toHaveTextContent("Out of touch");
    // The kernel's own tone, unescalated — and never the attention tone.
    expect(rhythm).toHaveAttribute("data-tone", "neutral");
  });

  it("sorts the quiet relationships to the top instead of colouring them", () => {
    renderCollection([
      personItem({
        id: "p-recent",
        title: "Recently Seen",
        stayInTouch: signal({
          state: "recently_connected",
          label: "Recently connected",
          tone: "success",
          daysSinceLastInteraction: 2,
        }),
      }),
      personItem({
        id: "p-quiet",
        title: "Long Silence",
        stayInTouch: signal({
          state: "out_of_touch",
          label: "Out of touch",
          tone: "neutral",
          daysSinceLastInteraction: 400,
        }),
      }),
    ]);
    // The default sort is "Needs attention first", which is where the emphasis
    // the colour used to carry actually lives.
    const names = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(names[0]).toBe("Long Silence");
    expect(names[1]).toBe("Recently Seen");
  });

  /* ------------------------------------------------------------------------ */
  /* CONVERGE-01 §7 — the row leads with connection                            */
  /* ------------------------------------------------------------------------ */

  it("leads the supporting line with what connects, in the audit's order", () => {
    renderCollection([
      personItem({
        stayInTouch: signal({
          state: "in_touch",
          label: "In touch",
          tone: "neutral",
          lastInteractionDate: "2026-07-25",
          daysSinceLastInteraction: 3,
          openTasks: 2,
          activeProjects: 1,
        }),
      }),
    ]);
    const row = screen.getByRole("article", { name: /Ada Lovelace/ });
    // Last interaction, then open commitments, then Projects, then who they
    // are — the identity context follows rather than leads.
    expect(row.querySelector(".dh-prow__context")?.textContent).toBe(
      "Last spoke 25 July 2026 · 2 open Tasks · 1 Project · Colleague · Mathematician · Analytical Engines",
    );
  });

  it("omits what does not exist rather than drawing a zero", () => {
    renderCollection([
      personItem({
        stayInTouch: signal({
          state: "in_touch",
          label: "In touch",
          tone: "neutral",
          lastInteractionDate: "2026-07-25",
          daysSinceLastInteraction: 3,
        }),
      }),
    ]);
    const line = screen
      .getByRole("article", { name: /Ada Lovelace/ })
      .querySelector(".dh-prow__context")?.textContent;
    expect(line).not.toMatch(/0 open Tasks|0 Projects/);
    expect(line).toBe(
      "Last spoke 25 July 2026 · Colleague · Mathematician · Analytical Engines",
    );
  });

  it("says nothing at all for a Person with nothing shared and no context", () => {
    renderCollection([
      personItem({
        role: null,
        organisation: null,
        relationship: null,
        relationshipLabel: null,
        stayInTouch: signal({
          state: "no_history",
          label: "No shared history yet",
          tone: "neutral",
        }),
      }),
    ]);
    const row = screen.getByRole("article", { name: /Ada Lovelace/ });
    expect(row.querySelector(".dh-prow__context")).toBeNull();
  });

  /*
   * The audit's actual finding: every row ENDED in an absence. The words stay —
   * deleting them would lose a true fact — but they stop being the loudest
   * thing on a row about a relationship, and they lose the dot, which exists to
   * agree with a state and has nothing to agree with here.
   */
  it("demotes 'No shared history yet' instead of deleting it", () => {
    renderCollection([
      personItem({
        stayInTouch: signal({
          state: "no_history",
          label: "No shared history yet",
          tone: "neutral",
        }),
      }),
    ]);
    const rhythm = screen.getByTestId("person-row-rhythm");
    expect(rhythm).toHaveTextContent("No shared history yet");
    expect(rhythm).toHaveAttribute("data-quiet", "true");
    expect(rhythm.querySelector(".dh-prow__dot")).toBeNull();
  });

  it("keeps a real state loud, with its dot", () => {
    renderCollection([
      personItem({
        stayInTouch: signal({
          state: "out_of_touch",
          label: "Out of touch",
          tone: "neutral",
          daysSinceLastInteraction: 400,
        }),
      }),
    ]);
    const rhythm = screen.getByTestId("person-row-rhythm");
    expect(rhythm).not.toHaveAttribute("data-quiet");
    expect(rhythm.querySelector(".dh-prow__dot")).not.toBeNull();
  });

  /*
   * UIQ-011 — "a control that can never do anything is not a control". The rule
   * was written for the Person RECORD and holds identically on the row: a dash
   * where an address would be is a target that cannot be pressed.
   */
  it("renders no reach control at all for a Person with nothing to reach", () => {
    renderCollection([personItem({ reach: [] })]);
    const row = screen.getByRole("article", { name: /Ada Lovelace/ });
    expect(
      within(row).queryByRole("link", { name: /Email|Mobile/ }),
    ).not.toBeInTheDocument();
    // …and the cell itself still holds its track, so the columns stay aligned.
    expect(row.querySelector(".dh-prow__reach")).not.toBeNull();
    expect(row.querySelector(".dh-prow__reach")?.textContent).toBe("");
  });

  it("renders both reach controls when both exist", () => {
    renderCollection([
      personItem({
        reach: [
          {
            kind: "Email",
            value: "ada@example.com",
            href: "mailto:ada@example.com",
          },
          { kind: "Mobile", value: "0412 345 678", href: "tel:0412345678" },
        ],
      }),
    ]);
    const row = screen.getByRole("article", { name: /Ada Lovelace/ });
    expect(
      within(row).getByRole("link", { name: /Email Ada Lovelace/ }),
    ).toHaveAttribute("href", "mailto:ada@example.com");
    expect(
      within(row).getByRole("link", { name: /Mobile Ada Lovelace/ }),
    ).toHaveAttribute("href", "tel:0412345678");
  });

  // PersonAvatar carries identity colour, and it is the row's own mark.
  it("draws the identity avatar on every row", () => {
    renderCollection([personItem()]);
    const row = screen.getByRole("article", { name: /Ada Lovelace/ });
    expect(row.querySelector(".dh-prow__face")?.textContent).toContain("AL");
  });

  it("prefers the DERIVED last interaction over the hand-entered field", () => {
    renderCollection([
      personItem({
        lastInteraction: "2020-01-01",
        stayInTouch: signal({
          state: "recently_connected",
          label: "Recently connected",
          tone: "success",
          reasons: [],
          lastInteractionDate: "2026-07-25",
          daysSinceLastInteraction: 3,
        }),
      }),
    ]);
    // CONVERGE-01 §7 — the last shared moment now LEADS the row's connection
    // line rather than trailing the rhythm column, so it is asserted as the
    // start of that line rather than as a standalone element.
    const row = screen.getByRole("article", { name: /Ada Lovelace/ });
    expect(row.querySelector(".dh-prow__context")?.textContent).toMatch(
      /^Last spoke 25 July 2026/,
    );
    expect(within(row).queryByText(/1 January 2020/)).not.toBeInTheDocument();
  });

  /*
   * UNTITLED-13 — the fallback says "(noted)".
   *
   * The row prints the DERIVED state beside this line, and for a Person with
   * nothing linked that state reads "No shared history yet" — so an unqualified
   * "Last spoke 1 January 2020" made the row contradict itself. Both are true
   * and they are about different things: what the owner typed, and what the
   * workspace can see. The record has always distinguished them ("Last
   * interaction (noted)"); the row now does too.
   */
  it("falls back to the hand-entered date, and says it was noted", () => {
    renderCollection([
      personItem({
        lastInteraction: "2020-01-01",
        stayInTouch: signal({
          state: "no_history",
          label: "No shared history yet",
          tone: "neutral",
          reasons: [],
          lastInteractionDate: null,
          daysSinceLastInteraction: null,
        }),
      }),
    ]);
    const row = screen.getByRole("article", { name: /Ada Lovelace/ });
    expect(row.querySelector(".dh-prow__context")?.textContent).toMatch(
      /^Last spoke 1 January 2020 \(noted\)/,
    );
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
        stayInTouch: signal({
          state: "in_touch",
          label: "In touch",
          tone: "neutral",
          reasons: [],
          lastInteractionDate: "2026-06-01",
          daysSinceLastInteraction: 40,
        }),
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
        stayInTouch: signal({
          state: "in_touch",
          label: "In touch",
          tone: "neutral",
          reasons: [],
          lastInteractionDate: "2026-07-01",
          daysSinceLastInteraction: 10,
        }),
      }),
      personItem({
        id: "p2",
        title: "Grace Hopper",
        stayInTouch: signal({
          state: "out_of_touch",
          label: "Out of touch",
          tone: "neutral",
          reasons: [],
          lastInteractionDate: "2025-01-01",
          daysSinceLastInteraction: 400,
        }),
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
