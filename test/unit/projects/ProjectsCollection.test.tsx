import { RouterProvider, createMemoryRouter } from "react-router";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DERIVED_IDENTITY_SLOTS } from "~/kernel/entities/identity-colour-slots";
import { FeedbackProvider } from "~/shared/feedback";

import { ProjectsCollectionView } from "~/modules/projects/ProjectsCollection";
import type { SerializedProjectListItem } from "~/modules/projects/project-view";

import { stubHealth } from "../../support/project-health";

/**
 * PROJ-01 — the Projects collection as behaviour: cards render with Area/Goal and
 * roll-up progress, the state segment is present, the empty vs filtered-empty
 * states are calm and distinct, and the keyset "Load more" affordance appends the
 * next page without duplicating cards or claiming a false total.
 */

type LoaderData = {
  projects: readonly SerializedProjectListItem[];
  nextCursor: string | null;
  parentOptions: readonly { value: string; label: string }[];
  parentOptionsFailed?: boolean;
  state: "open" | "completed" | "archived" | "all";
  failed: boolean;
};

function project(
  over: Partial<SerializedProjectListItem> = {},
): SerializedProjectListItem {
  return {
    id: "p1",
    title: "DalyHub V2",
    createdAt: "2026-07-18T09:00:00.000Z",
    updatedAt: "2026-07-20T10:00:00.000Z",
    completedAt: null,
    status: "active",
    archivedAt: null,
    area: { kind: "area", id: "a1", title: "Career" },
    goal: null,
    areaColourRank: 0,
    colourRank: 0,
    iconKey: null,
    colourSlot: null,
    taskTotal: 4,
    taskCompleted: 1,
    health: stubHealth({ taskTotal: 4, taskCompleted: 1 }),
    healthVisible: true,
    ...over,
  };
}

function renderCollection(
  data: LoaderData,
  loader?: (request: Request) => unknown,
) {
  const router = createMemoryRouter(
    [
      {
        path: "/projects",
        ...(loader ? { loader: ({ request }) => loader(request) } : {}),
        element: (
          <ProjectsCollectionView
            projects={data.projects}
            nextCursor={data.nextCursor}
            parentOptions={data.parentOptions as never}
            parentOptionsFailed={data.parentOptionsFailed}
            state={data.state}
            failed={data.failed}
          />
        ),
      },
    ],
    { initialEntries: ["/projects"] },
  );
  return render(
    <FeedbackProvider>
      <RouterProvider router={router} />
    </FeedbackProvider>,
  );
}

describe("Projects collection", () => {
  it("renders project cards with Area context and roll-up progress", () => {
    renderCollection({
      projects: [
        project(),
        project({
          id: "p2",
          title: "Half-marathon plan",
          goal: { kind: "goal", id: "g1", title: "Run a half" },
          taskTotal: 0,
          taskCompleted: 0,
        }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });

    expect(screen.getByText("DalyHub V2")).toBeInTheDocument();
    expect(screen.getAllByText("Career").length).toBeGreaterThan(0);
    /*
     * A Project with no tasks draws NO progress bar — an empty track at 0%
     * reads as "nothing done" when the truth is "nothing planned".
     *
     * UIX-02 revisited the other half of M3X-02's decision here. That pass also
     * removed the words "No tasks yet", on the grounds that the honest
     * expression of "nothing to measure" is a SHORTER card. The card's foot is
     * now pinned so every bar in a gallery row lands on one baseline, which
     * means the space is reserved whether or not anything is drawn in it — so
     * the choice is no longer "words or a shorter card" but "words or a gap",
     * and the words explain why the bar beside its neighbours is missing.
     */
    const empty = screen.getByRole("article", { name: "Half-marathon plan" });
    expect(within(empty).queryByRole("progressbar")).not.toBeInTheDocument();
    expect(within(empty).getByText("No tasks yet")).toBeInTheDocument();
    // The subtitle reflects the count.
    expect(screen.getByText("2 Projects")).toBeInTheDocument();
    // UIX-02 — the lifecycle mode is a tab RAIL of links under the title, not
    // a segmented capsule beside it, so it announces as navigation.
    expect(
      screen.getByRole("navigation", { name: "Project views" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("New project").length).toBeGreaterThan(0);
  });

  it("keeps project cards as honest links with no mobile swipe accelerator", () => {
    const { container } = renderCollection({
      projects: [
        project({
          id: "long",
          title:
            "A very long translated-like project title that should wrap without needing a gesture",
          area: {
            kind: "area",
            id: "a-long",
            title:
              "An unusually long Area name that still belongs in card context",
          },
          goal: {
            kind: "goal",
            id: "g-long",
            title:
              "A deeply specific Goal title that is allowed to wrap across lines",
          },
        }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });

    const card = screen.getByRole("article", {
      name: /A very long translated-like project title/,
    });
    expect(
      within(card).getByRole("link", {
        name: /Open A very long translated-like project title/,
      }),
    ).toHaveAttribute("href", "/projects/long");
    expect(
      within(card).queryByRole("button", { name: /archive|complete/i }),
    ).not.toBeInTheDocument();
    expect(container.querySelector(".dh-card-swipe")).toBeNull();
  });

  it("shows the derived health state and its primary reason on a card", () => {
    renderCollection({
      projects: [
        project({
          id: "at-risk",
          title: "Overdue project",
          health: stubHealth({
            taskTotal: 4,
            taskCompleted: 0,
            overdueOpen: 2,
          }),
        }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    /*
     * REDESIGN-04 §5.6 — attention survives as SIGNAL, not as a sentence.
     *
     * The visible line is now the reference's meta line ("4 tasks · 2 due this
     * week"); the health state is the dot's tone, and the evaluator's own full
     * sentence is still on the line for assistive tech. Nothing is carried by
     * colour alone, and nothing the evaluator said has been lost.
     */
    const card = screen.getByRole("article", { name: "Overdue project" });
    const meta = card.querySelector(".dh-pcard__meta");
    expect(meta).toHaveAttribute("data-tone", "danger");
    // The dot is decorative; the sentence beside it is the fact.
    expect(meta?.querySelector(".dh-pcard__dot")).not.toBeNull();
    expect(meta).toHaveTextContent("2 tasks past their due date");
    // And the visible meta line states volume, from the same rollup the bar uses.
    expect(within(card).getByText("4 tasks")).toBeInTheDocument();
  });

  it("does not falsely label a completed project as actively at risk", () => {
    renderCollection({
      projects: [
        project({
          id: "done",
          title: "Shipped",
          completedAt: "2026-07-20T00:00:00.000Z",
          taskTotal: 4,
          taskCompleted: 4,
          healthVisible: false,
          health: stubHealth({
            taskTotal: 4,
            taskCompleted: 4,
            completedAt: new Date("2026-07-20T00:00:00.000Z"),
          }),
        }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    expect(screen.queryByText("At risk")).not.toBeInTheDocument();
    // A completed project never shows an active-work health pill (PROJ-05 §8).
    expect(screen.queryByText(/^Health/)).not.toBeInTheDocument();
  });

  it("hides the Health metadata for Planned, On-hold and Archived cards", () => {
    renderCollection({
      projects: [
        project({ id: "planned", title: "Planned", healthVisible: false }),
        project({ id: "on-hold", title: "On hold", healthVisible: false }),
        project({
          id: "archived",
          title: "Archived one",
          archivedAt: "2026-07-21T00:00:00.000Z",
          healthVisible: false,
        }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    expect(screen.queryByText(/^Health/)).not.toBeInTheDocument();
  });

  it("carries ONE status treatment, never a lifecycle chip beside a health chip", () => {
    renderCollection({
      projects: [
        project({
          id: "at-risk",
          title: "Overdue project",
          health: stubHealth({
            taskTotal: 4,
            taskCompleted: 0,
            overdueOpen: 2,
          }),
        }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    const card = screen.getByRole("article", { name: "Overdue project" });
    // Exactly ONE line beneath the bar, and it carries the health signal — the
    // workflow word it replaces must not also be present.
    expect(card.querySelectorAll(".dh-pcard__meta")).toHaveLength(1);
    expect(card.querySelector(".dh-pcard__meta")).toHaveAttribute(
      "data-tone",
      "danger",
    );
    expect(within(card).queryByText("Active")).not.toBeInTheDocument();
    // And no filled status chip anywhere on it.
    expect(card.querySelectorAll(".dh-pill")).toHaveLength(0);
  });

  it("keeps the workflow word when health has nothing to say", () => {
    renderCollection({
      projects: [
        project({
          id: "healthy",
          title: "Healthy project",
          health: stubHealth({ taskTotal: 4, taskCompleted: 2 }),
        }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    const card = screen.getByRole("article", { name: "Healthy project" });
    expect(card.querySelectorAll(".dh-pcard__meta")).toHaveLength(1);
    // The evaluator's own sentence for a healthy Project, still announced in
    // full — the visible line states volume, and neither is fabricated.
    expect(card.querySelector(".dh-pcard__meta")).toHaveTextContent(
      "Progressing with no attention signals.",
    );
    expect(within(card).getByText("4 tasks")).toBeInTheDocument();
  });

  it("states progress once, with the bar and the text agreeing", () => {
    renderCollection({
      projects: [
        project({
          id: "partial",
          title: "Partial",
          taskTotal: 4,
          taskCompleted: 1,
        }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    const card = screen.getByRole("article", { name: "Partial" });
    const bar = within(card).getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "25");
    // The accessible value says more than the visible "25%", and both are
    // derived from the same completed/total pair.
    expect(bar).toHaveAttribute(
      "aria-valuetext",
      "25% — 1 of 4 tasks complete",
    );
    expect(within(card).getByText("25%")).toBeInTheDocument();
    /*
     * M3X-02 — the open/done fact pair is GONE from the card, and the bar is the
     * whole story. Two counts the reader has to subtract said the same thing the
     * proportion above them already says, at the same weight, on every card in
     * the gallery. The complete phrasing survives where it is genuinely needed:
     * on the progress bar's `aria-valuetext`, which is what assistive tech reads.
     */
    expect(within(card).queryByText("open tasks")).not.toBeInTheDocument();
    expect(within(card).queryByText("done")).not.toBeInTheDocument();
    expect(within(card).getByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      "25% — 1 of 4 tasks complete",
    );
  });

  it("never implies 0% progress for a Project with no tasks", () => {
    renderCollection({
      projects: [
        project({
          id: "empty",
          title: "Nothing planned",
          taskTotal: 0,
          taskCompleted: 0,
        }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    const card = screen.getByRole("article", { name: "Nothing planned" });
    // No bar and no percentage — "nothing planned" is not "0% done".
    expect(within(card).queryByRole("progressbar")).not.toBeInTheDocument();
    // UIX-02 — the reserved foot says WHY there is no bar rather than sitting
    // empty. See the note on the first test in this file.
    expect(within(card).getByText("No tasks yet")).toBeInTheDocument();
  });

  it("shows a fully completed roll-up accurately", () => {
    renderCollection({
      projects: [
        project({
          id: "done",
          title: "All done",
          taskTotal: 6,
          taskCompleted: 6,
          completedAt: "2026-07-21T00:00:00.000Z",
          healthVisible: false,
          health: stubHealth({ taskTotal: 6, taskCompleted: 6 }),
        }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    const card = screen.getByRole("article", { name: "All done" });
    expect(within(card).getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
    // The proportion carries the story on its own — 100% and a full bar.
    expect(within(card).getByText("100%")).toBeInTheDocument();
    expect(within(card).queryByText("open tasks")).not.toBeInTheDocument();
    expect(within(card).getByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      "100% — 6 of 6 tasks complete",
    );
  });

  it("names the Area first so it stays discoverable, then the Goal", () => {
    renderCollection({
      projects: [
        project({
          id: "via-goal",
          title: "Goal-backed",
          area: { kind: "area", id: "a1", title: "DalyHub V2" },
          goal: { kind: "goal", id: "g1", title: "Launch the site" },
        }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    const card = screen.getByRole("article", { name: "Goal-backed" });
    expect(
      within(card).getByText("DalyHub V2 · Launch the site"),
    ).toBeInTheDocument();
  });

  // #130 — the accent is the PROJECT's own stable rank, not its Area's. A
  // Project is recognisable as itself, and one with no Area still has an
  // identity where it previously fell back to the neutral container.
  it("renders a chosen icon on the Project's own accent, and the default without one", () => {
    const { container } = renderCollection({
      projects: [
        project({
          id: "with-icon",
          title: "Has icon",
          iconKey: "travel",
          colourSlot: null,
          areaColourRank: 2,
          colourRank: 1,
        }),
        project({
          id: "no-icon",
          title: "No icon",
          iconKey: null,
          colourSlot: null,
          areaColourRank: null,
          colourRank: 2,
        }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    expect(container.querySelector('[data-icon-key="travel"]')).not.toBeNull();
    // The Project's OWN rank drives the identity: rank 1 -> the ramp's second
    // slot, rank 2 -> its third. The Area's rank (2) is deliberately NOT what
    // the first card wears — REDESIGN-03/#130, reconciled in `resolveIdentity`
    // so the tile and the bar cannot disagree.
    expect(
      screen
        .getByRole("article", { name: "Has icon" })
        .querySelector(".dh-accent-icon")
        ?.getAttribute("data-identity"),
    ).toBe(DERIVED_IDENTITY_SLOTS[1]);
    // Two consecutively-created Projects take adjacent ranks and therefore
    // different colours — the whole point of giving a Project its own identity.
    expect(
      screen
        .getByRole("article", { name: "No icon" })
        .querySelector(".dh-accent-icon")
        ?.getAttribute("data-identity"),
    ).toBe(DERIVED_IDENTITY_SLOTS[2]);
  });

  it("derives the muted treatment from the archived FACT, not the chip's word", () => {
    renderCollection({
      projects: [
        project({
          id: "archived",
          title: "Put away",
          archivedAt: "2026-07-21T00:00:00.000Z",
          healthVisible: false,
        }),
        project({ id: "live", title: "Still going" }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    expect(screen.getByRole("article", { name: "Put away" })).toHaveClass(
      "dh-pcard--muted",
    );
    expect(
      screen.getByRole("article", { name: "Still going" }),
    ).not.toHaveClass("dh-ecard--muted");
  });

  it("gives each lifecycle and health state exactly one chip", () => {
    const cases = [
      {
        id: "planned",
        title: "Planned one",
        over: { status: "planned" as const, healthVisible: false },
        label: "This Project is planned.",
      },
      {
        id: "onhold",
        title: "On-hold one",
        over: { status: "on_hold" as const, healthVisible: false },
        label: "This Project is on hold.",
      },
      /*
       * UIX-02 — an actively-worked Project with nothing wrong reads "On
       * track" rather than "Active". The card's one line is now the HEALTH
       * signal wherever health is speaking, and `on_track` is the thing it has
       * to say; "Active" is the workflow status, which is only the most useful
       * word when health is deliberately not evaluated (Planned, On hold).
       */
      {
        id: "active",
        title: "Active one",
        over: {},
        label: "Progressing with no attention signals.",
      },
      {
        id: "completed",
        title: "Completed one",
        over: {
          completedAt: "2026-07-20T00:00:00.000Z",
          healthVisible: false,
        },
        label: "This Project is complete.",
      },
      {
        id: "archived",
        title: "Archived one",
        over: { archivedAt: "2026-07-21T00:00:00.000Z", healthVisible: false },
        label: "This Project is archived.",
      },
      {
        id: "warning",
        title: "Warning one",
        over: {
          health: stubHealth({
            taskTotal: 4,
            taskCompleted: 0,
            overdueOpen: 2,
          }),
        },
        // REDESIGN-04 §5.6 — the evaluator's own full sentence, which is what
        // the meta line carries for assistive tech now that the compact
        // wording has given its place to volume and urgency.
        label: "2 tasks past their due date",
      },
    ];

    renderCollection({
      projects: cases.map((c) =>
        project({ id: c.id, title: c.title, ...c.over }),
      ),
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });

    for (const c of cases) {
      const card = screen.getByRole("article", { name: c.title });
      /*
       * Exactly ONE line beneath the bar per card, and it says the right thing.
       *
       * REDESIGN-04 §5.6 moved the state from the line's visible words to its
       * dot plus its accessible sentence, so this asserts the sentence — which
       * is a STRONGER check than the compact form it replaces: the compact
       * wording was derived, the sentence is the evaluator's own.
       */
      expect(card.querySelectorAll(".dh-pcard__meta")).toHaveLength(1);
      expect(card.querySelector(".dh-pcard__meta")).toHaveTextContent(c.label);
    }
  });

  it("navigates from the title link through the router, not a full page load", async () => {
    /*
     * Only the LINK's own activation can be proven here. Whether a click on the
     * status chip or the metadata row reaches that link is CSS hit-testing —
     * stacking order against the link's `::after` overlay — which jsdom does
     * not do at all: `fireEvent.click` dispatches on the node you name, so this
     * file would report a pass whatever the z-index said. That contract is
     * asserted in the browser, in `e2e/projects.spec.ts`.
     */
    const seen: string[] = [];
    const router = createMemoryRouter(
      [
        {
          path: "/projects",
          element: (
            <ProjectsCollectionView
              projects={[project({ id: "p1", title: "Website relaunch" })]}
              nextCursor={null}
              parentOptions={[]}
              state="all"
              failed={false}
            />
          ),
        },
        {
          path: "/projects/:id",
          element: <p>record</p>,
          loader: ({ params }) => {
            seen.push(params.id ?? "");
            return null;
          },
        },
      ],
      { initialEntries: ["/projects"] },
    );
    render(
      <FeedbackProvider>
        <RouterProvider router={router} />
      </FeedbackProvider>,
    );

    const card = screen.getByRole("article", { name: "Website relaunch" });
    const link = within(card).getByRole("link", {
      name: "Open Website relaunch",
    });
    // A real href, so command-click, middle-click and copy-link-address all
    // behave; the router handles the ordinary click.
    expect(link).toHaveAttribute("href", "/projects/p1");
    fireEvent.click(link, { button: 0 });
    await waitFor(() => expect(seen).toEqual(["p1"]));
  });

  it("shows a genuinely-empty state when there are no projects at all", () => {
    renderCollection({
      projects: [],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    expect(screen.getByText("No Projects yet")).toBeInTheDocument();
  });

  it("distinguishes a filtered-empty state from genuinely empty", () => {
    renderCollection({
      projects: [],
      nextCursor: null,
      parentOptions: [],
      state: "open",
      failed: false,
    });
    expect(screen.getByText("No active projects")).toBeInTheDocument();
  });

  describe("Archived collection (PROJ-05 §7)", () => {
    it("offers Archived as a fourth, dedicated segment (Open/Completed/All unchanged)", () => {
      renderCollection({
        projects: [],
        nextCursor: null,
        parentOptions: [],
        state: "all",
        failed: false,
      });
      const group = screen.getByRole("navigation", {
        name: "Project views",
      });
      /*
       * REDESIGN-04 — `mockup3.png`'s order and its word for `open`
       * ("Active"), with the product's fourth real bucket kept. The VALUES are
       * untouched, which is what the href assertion below proves: every
       * `?state=open` link, bookmark and test in the product still resolves.
       */
      const links = within(group).getAllByRole("link");
      expect(links.map((link) => link.textContent?.trim())).toEqual([
        "Active",
        "All",
        "Completed",
        "Archived",
      ]);
      expect(links[0]).toHaveAttribute(
        "href",
        expect.stringContaining("state=open"),
      );
    });

    it("renders archived cards with the Archived state and no health metadata", () => {
      renderCollection({
        projects: [
          project({
            id: "archived-1",
            title: "Sunset project",
            archivedAt: "2026-07-21T00:00:00.000Z",
            healthVisible: false,
          }),
        ],
        nextCursor: null,
        parentOptions: [],
        state: "archived",
        failed: false,
      });
      expect(screen.getByText("Sunset project")).toBeInTheDocument();
      expect(screen.getAllByText("Archived").length).toBeGreaterThan(0);
      expect(screen.queryByText(/^Health/)).not.toBeInTheDocument();
      // A real link to the canonical record, like every other card.
      const link = screen.getByRole("link", { name: "Open Sunset project" });
      expect(link).toHaveAttribute("href", "/projects/archived-1");
    });

    it("shows a distinct, honest empty state for the Archived filter with no 'New project' CTA", () => {
      renderCollection({
        projects: [],
        nextCursor: null,
        parentOptions: [],
        state: "archived",
        failed: false,
      });
      expect(screen.getByText("No archived projects")).toBeInTheDocument();
      // Only the persistent header "New project" trigger renders — the
      // Archived empty state deliberately omits a SECOND create CTA (creating
      // a project doesn't address "no archived projects").
      expect(screen.getAllByText("New project")).toHaveLength(1);
    });
  });

  it("opens a project via a real link (accessible, not a div onClick)", () => {
    renderCollection({
      projects: [project()],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    const link = screen.getByRole("link", { name: "Open DalyHub V2" });
    expect(link).toHaveAttribute("href", "/projects/p1");
  });

  it("distinguishes a parent-options load failure from a confirmed-empty workspace in the create form", () => {
    renderCollection({
      projects: [project()],
      nextCursor: null,
      parentOptions: [],
      parentOptionsFailed: true,
      state: "all",
      failed: false,
    });

    fireEvent.click(screen.getAllByText("New project")[0]!);

    // The load-failure message renders, never the false "no Areas or Goals
    // exist" domain claim a generic empty-array fallback would otherwise show.
    expect(
      screen.getByText("Couldn’t load Areas and Goals."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/doesn.t have either yet/),
    ).not.toBeInTheDocument();
  });

  it("does not claim a total, then appends the next keyset page without duplicates", async () => {
    renderCollection(
      {
        projects: [project({ id: "p1", title: "Alpha" })],
        nextCursor: "CURSOR_1",
        parentOptions: [],
        state: "all",
        failed: false,
      },
      (request) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        // The second page. It overlaps p1 defensively to prove de-duplication.
        if (cursor === "CURSOR_1") {
          return {
            projects: [
              project({ id: "p1", title: "Alpha" }),
              project({ id: "p2", title: "Bravo" }),
            ],
            nextCursor: null,
            parentOptions: [],
            state: "all",
            failed: false,
          };
        }
        return {
          projects: [],
          nextCursor: null,
          parentOptions: [],
          state: "all",
          failed: false,
        };
      },
    );

    // While a page remains, the subtitle must NOT present the loaded count as total.
    await screen.findByText("1 Project loaded");
    expect(screen.queryByText("1 Project")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load more projects" }));

    await waitFor(() => expect(screen.getByText("Bravo")).toBeInTheDocument());

    // p1 (Alpha) appears exactly once despite the overlapping page boundary.
    const list = screen.getByRole("list", { name: "Projects" });
    expect(within(list).getAllByText("Alpha")).toHaveLength(1);
    // The cursor is exhausted, so the affordance is gone and the count is final.
    expect(
      screen.queryByRole("button", { name: "Load more projects" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("2 Projects")).toBeInTheDocument();
  });

  it("shows a retryable error when a page fails to load", async () => {
    let failedOnce = false;
    renderCollection(
      {
        projects: [project({ id: "p1", title: "Alpha" })],
        nextCursor: "CURSOR_1",
        parentOptions: [],
        state: "all",
        failed: false,
      },
      (request) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        // Ignore the initial (cursor-less) route navigation entirely.
        if (cursor !== "CURSOR_1") {
          return {
            projects: [],
            nextCursor: null,
            parentOptions: [],
            state: "all",
            failed: false,
          };
        }
        // Fail the first load-more, succeed on retry.
        if (!failedOnce) {
          failedOnce = true;
          return {
            projects: [],
            nextCursor: "CURSOR_1",
            parentOptions: [],
            state: "all",
            failed: true,
          };
        }
        return {
          projects: [project({ id: "p2", title: "Bravo" })],
          nextCursor: null,
          parentOptions: [],
          state: "all",
          failed: false,
        };
      },
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Load more projects" }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/We couldn.t load more\. Please try again\./),
      ).toBeInTheDocument(),
    );

    // The same control retries and recovers.
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("Bravo")).toBeInTheDocument());
  });
});

/**
 * DS-16 — the Projects gallery, on the SAME shared grid foundation as Areas.
 *
 * The most important assertion in this block is the sparse one: a Project with
 * nothing filled in must still produce a polished card, because that is the
 * state a workspace is in for its first week.
 */
describe("Projects gallery grid (DS-16)", () => {
  it("renders the shared gallery grid, not a second implementation", () => {
    const { container } = renderCollection({
      projects: [project(), project({ id: "p2", title: "Second" })],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    const grid = container.querySelector(".dh-ecard-grid");
    expect(grid?.tagName).toBe("UL");
    expect(grid?.getAttribute("aria-label")).toBe("Projects");
    expect(grid?.querySelectorAll(":scope > li").length).toBe(2);
  });

  it("stays polished for a Project with no Area, no tasks and no health", () => {
    renderCollection({
      projects: [
        project({
          id: "sparse",
          title: "Just started",
          area: null,
          goal: null,
          areaColourRank: null,
          colourRank: 3,
          taskTotal: 0,
          taskCompleted: 0,
          healthVisible: false,
          health: stubHealth({ taskTotal: 0, taskCompleted: 0 }),
        }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    const card = screen.getByRole("article", { name: "Just started" });
    // Absent values are ABSENT — no empty placeholder rows, no 0% bar.
    expect(within(card).queryByRole("progressbar")).not.toBeInTheDocument();
    expect(
      within(card).queryByTestId("entity-card-fact"),
    ).not.toBeInTheDocument();
    // No parent context line either, because this Project genuinely has no
    // Area and no Goal.
    expect(card.querySelectorAll(".dh-pcard__context")).toHaveLength(0);
    // And it is still a complete, navigable card.
    expect(
      within(card).getByRole("link", { name: "Open Just started" }),
    ).toHaveAttribute("href", "/projects/sparse");
  });

  it("offers lifecycle actions from the card without navigating it", () => {
    renderCollection({
      projects: [project({ title: "DalyHub V2" })],
      nextCursor: null,
      parentOptions: [],
      state: "all",
      failed: false,
    });
    const card = screen.getByRole("article", { name: "DalyHub V2" });
    fireEvent.click(
      within(card).getByRole("button", { name: "More actions for DalyHub V2" }),
    );
    /*
     * DHDS-09 — the menu is queried from the DOCUMENT, not from inside the card.
     *
     * Every floating surface in DalyHub is portalled into the overlay layer, so
     * a menu opened from a card is no longer a descendant of it. That is the
     * point rather than an inconvenience: a card clips its own overflow, and an
     * absolutely-positioned panel inside one is clipped with it. What this test
     * asserts — that the card's own ⋯ offers the lifecycle actions — is
     * unchanged; only where the panel is rendered has moved.
     */
    const menu = screen.getByRole("menu", {
      name: "More actions for DalyHub V2",
    });
    expect(
      within(menu).getByRole("menuitem", { name: /Archive/ }),
    ).toBeInTheDocument();
    // The card's own primary link is unaffected: it was never in the menu.
    expect(
      within(card).getByRole("link", { name: "Open DalyHub V2" }),
    ).toHaveAttribute("href", "/projects/p1");
  });

  it("offers Restore rather than Archive on an archived Project", () => {
    renderCollection({
      projects: [
        project({
          id: "arch",
          title: "Old work",
          archivedAt: "2026-07-01T00:00:00.000Z",
          healthVisible: false,
        }),
      ],
      nextCursor: null,
      parentOptions: [],
      state: "archived",
      failed: false,
    });
    const card = screen.getByRole("article", { name: "Old work" });
    fireEvent.click(
      within(card).getByRole("button", { name: "More actions for Old work" }),
    );
    // The panel lives in the overlay layer — see the note above.
    const menu = screen.getByRole("menu", {
      name: "More actions for Old work",
    });
    expect(
      within(menu).getByRole("menuitem", { name: /Restore/ }),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole("menuitem", { name: /^Archive/ }),
    ).not.toBeInTheDocument();
  });
});
