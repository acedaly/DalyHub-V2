import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";

import SearchSurface from "~/shared/search/SearchSurface";
import { assembleOutcome, type SearchOutcome } from "~/shared/search/model";
import type { SearchFn } from "~/shared/search/client";
import { recentRecordsOutcome } from "~/shared/search/recent-outcome";

import type { SearchResultItem } from "~/shared/search/model";

const TASK_ITEMS: readonly SearchResultItem[] = [
  {
    id: "t1",
    title: "Finish PX-02",
    subtitle: "DalyHub V2",
    entityType: "task",
    signals: [
      {
        id: "priority",
        kind: "priority",
        label: "P1",
        value: "p1",
        tone: "neutral",
        accessibleLabel: "P1 priority",
      },
      {
        id: "urgency",
        kind: "urgency",
        label: "Due today",
        value: "due_today",
        tone: "warning",
        accessibleLabel: "Due today",
      },
    ],
    target: { kind: "drawer", drawerKey: "task:t1", canonicalPath: "/today" },
  },
  {
    id: "t2",
    title: "Finish the report",
    subtitle: "Finance",
    entityType: "task",
    target: { kind: "drawer", drawerKey: "task:t2", canonicalPath: "/today" },
  },
];
const PROJECT_ITEMS: readonly SearchResultItem[] = [
  {
    id: "p1",
    title: "Finish line project",
    subtitle: "Career",
    entityType: "project",
    target: { kind: "route", to: "/projects/p1" },
  },
];

function matches(item: SearchResultItem, query: string): boolean {
  const q = query.toLowerCase();
  return (
    item.title.toLowerCase().includes(q) ||
    (item.subtitle?.toLowerCase().includes(q) ?? false)
  );
}

/** A fake provider fan-out that filters by the query, like real providers do. */
function healthyOutcome(query: string): SearchOutcome {
  return assembleOutcome(query, [
    {
      providerId: "tasks.search",
      moduleId: "tasks",
      moduleLabel: "Tasks",
      ok: true,
      items: TASK_ITEMS.filter((item) => matches(item, query)),
    },
    {
      providerId: "projects.search",
      moduleId: "projects",
      moduleLabel: "Projects",
      ok: true,
      items: PROJECT_ITEMS.filter((item) => matches(item, query)),
    },
  ]);
}

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">{`${location.pathname}${location.search}`}</div>
  );
}

function renderSurface(
  search: SearchFn,
  options: { opener?: HTMLElement | null } = {},
) {
  const onClose = vi.fn();
  const view = render(
    <MemoryRouter initialEntries={["/home"]}>
      <LocationProbe />
      <SearchSurface
        search={search}
        onClose={onClose}
        opener={options.opener ?? null}
        debounceMs={0}
      />
    </MemoryRouter>,
  );
  return { onClose, view };
}

/**
 * FIND-01 — the empty query is answered by the RECENCY read, not by providers,
 * so the stub answers it the way the server does: through the real
 * `recentRecordsOutcome` builder over real records. Using the genuine builder
 * rather than a hand-made outcome means these tests exercise the same group
 * kind, the same destinations and the same absence of subtitles the product
 * ships.
 */
const RECENT_RECORDS = [
  {
    id: "p-1",
    type: "project" as const,
    title: "Kitchen renovation",
    lastWorkedAt: "2026-08-29T09:00:00.000Z",
    createdAt: "2026-08-01T09:00:00.000Z",
  },
  {
    id: "t-9",
    type: "task" as const,
    title: "Call the plumber",
    lastWorkedAt: "2026-08-29T08:00:00.000Z",
    createdAt: "2026-08-02T09:00:00.000Z",
  },
];

function searchOutcomeFor(query: string): SearchOutcome {
  return query.trim() === ""
    ? recentRecordsOutcome(RECENT_RECORDS)
    : healthyOutcome(query);
}

const healthySearch: SearchFn = async (q) => searchOutcomeFor(q);

function typeQuery(value: string): void {
  fireEvent.change(screen.getByRole("combobox"), { target: { value } });
}

describe("SearchSurface", () => {
  it("renders an accessible dialog, heading and combobox, and focuses the input", async () => {
    renderSurface(healthySearch);
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Search" }),
    ).toBeVisible();
    const input = screen.getByRole("combobox", { name: "Search everything" });
    await waitFor(() => expect(input).toHaveFocus());
  });

  it("restores focus to its opener on close", async () => {
    const opener = document.createElement("button");
    opener.textContent = "Search";
    document.body.appendChild(opener);
    const { view } = renderSurface(healthySearch, { opener });
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveFocus());
    view.unmount();
    await waitFor(() => expect(opener).toHaveFocus());
    opener.remove();
  });

  /*
   * FIND-01 replaced the idle hint. The sentence this test used to assert —
   * "Search across everything in your workspace." — restated the input's own
   * placeholder directly above it and offered nothing to open, which is what
   * [DEBT-195] recorded. The empty query now lists the workspace's recently
   * worked-on records, and states the one privacy rule that applies to them.
   */
  it("answers the empty query with recent records, not a restated placeholder", async () => {
    renderSurface(healthySearch);
    await waitFor(() =>
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0),
    );
    expect(screen.getByText(/Recently worked on/i)).toBeVisible();
    expect(
      screen.getByText(/Diary entries are never listed here/i),
    ).toBeVisible();
    expect(screen.queryByText(/Search across everything/i)).toBeNull();
  });

  it("searches on input and groups results by entity type", async () => {
    renderSurface(healthySearch);
    typeQuery("Finish");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3));
    expect(screen.getByRole("listbox")).toBeVisible();
    expect(screen.getByText("Tasks")).toBeVisible();
    expect(screen.getByText("Projects")).toBeVisible();
  });

  /*
   * PROJECT-02 — the first entity type with no visual identity of its own. The
   * heading comes from the label its module declared (assembled server-side);
   * the row's trailing type chip speaks the identity vocabulary, so it is simply
   * absent rather than showing the raw `project_template` slug.
   */
  it("never renders a raw entity-type slug for a type with no identity", async () => {
    const templateSearch: SearchFn = async (query) =>
      assembleOutcome(
        query,
        [
          {
            providerId: "projects.template_search",
            moduleId: "projects",
            moduleLabel: "Project templates",
            ok: true,
            items: [
              {
                id: "project_template:tpl1",
                title: "Finish-line launch template",
                subtitle: "Template · 4 tasks",
                entityType: "project_template",
                target: { kind: "route", to: "/projects/templates/tpl1" },
              },
            ],
          },
        ],
        { entityLabels: new Map([["project_template", "Project templates"]]) },
      );
    const { view } = renderSurface(templateSearch);
    typeQuery("Finish");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    expect(screen.getByText("Project templates")).toBeVisible();
    expect(view.container.textContent).not.toContain("project_template");
  });

  it("renders generic result signals as shared task presentation", async () => {
    renderSurface(healthySearch);
    typeQuery("PX-02");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    expect(screen.getByText("P1")).toBeVisible();
    expect(screen.getByText("Due today")).toBeVisible();
  });

  it("highlights the matched text with <mark> and no raw HTML", async () => {
    const { view } = renderSurface(healthySearch);
    typeQuery("Finish");
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(3));
    const marks = view.container.querySelectorAll("mark.dh-search__mark");
    expect(marks.length).toBeGreaterThan(0);
    expect(marks[0]?.textContent?.toLowerCase()).toContain("finish");
  });

  it("navigates result selection with the keyboard and reports the active option", async () => {
    renderSurface(healthySearch);
    const input = screen.getByRole("combobox");
    typeQuery("Finish");
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(3));

    fireEvent.keyDown(input, { key: "ArrowDown" });
    await waitFor(() =>
      expect(input.getAttribute("aria-activedescendant")).toBeTruthy(),
    );
    expect(
      screen
        .getAllByRole("option")
        .some((o) => o.getAttribute("aria-selected") === "true"),
    ).toBe(true);

    fireEvent.keyDown(input, { key: "End" });
    const options = screen.getAllByRole("option");
    expect(options[options.length - 1]?.getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  it("opens the active result on Enter — the DS-03 Drawer target, preserving context", async () => {
    const { onClose } = renderSurface(healthySearch);
    const input = screen.getByRole("combobox");
    typeQuery("Finish");
    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(3));
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toContain("drawer="),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape and on the close button", async () => {
    const { onClose } = renderSurface(healthySearch);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close search" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("shows a no-results state for a query that matches nothing", async () => {
    renderSurface(healthySearch);
    typeQuery("zzzznope");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "No results" })).toBeVisible(),
    );
  });

  it("shows a calm partial-results note when some providers fail", async () => {
    const partial: SearchFn = async (q) =>
      assembleOutcome(q, [
        {
          providerId: "a.search",
          moduleId: "a",
          moduleLabel: "A",
          ok: true,
          items: [
            {
              id: "1",
              title: `Finish ${q}`,
              entityType: "task",
              target: { kind: "route", to: "/x" },
            },
          ],
        },
        {
          providerId: "b.search",
          moduleId: "b",
          moduleLabel: "B",
          ok: false,
          items: [],
        },
      ]);
    renderSurface(partial);
    typeQuery("Finish");
    await waitFor(() =>
      expect(screen.getByText(/didn’t respond/i)).toBeVisible(),
    );
    expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
  });

  it("shows a retryable error state and recovers", async () => {
    let mode: "fail" | "ok" = "fail";
    const search: SearchFn = async (q) => {
      if (mode === "fail") throw new Error("down");
      return healthyOutcome(q);
    };
    renderSurface(search);
    typeQuery("Finish");
    await waitFor(() =>
      expect(screen.getByText("Search is unavailable")).toBeVisible(),
    );
    mode = "ok";
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(screen.getByRole("listbox")).toBeVisible());
  });

  it("keeps a live status region for announcements", async () => {
    renderSurface(healthySearch);
    typeQuery("Finish");
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toMatch(/results/i),
    );
  });
});

describe("SearchSurface — modal-root inertness and scrim", () => {
  function renderWithBackground(search: SearchFn) {
    const onClose = vi.fn();
    const view = render(
      <MemoryRouter initialEntries={["/home"]}>
        <button data-testid="bg">Background</button>
        <SearchSurface
          search={search}
          onClose={onClose}
          opener={null}
          debounceMs={0}
        />
      </MemoryRouter>,
    );
    return { onClose, view };
  }

  it("makes background siblings inert but keeps the scrim interactive", async () => {
    const { view } = renderWithBackground(healthySearch);
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveFocus());
    // The modal ROOT is the exclusion boundary: a sibling is inert...
    expect(screen.getByTestId("bg")).toHaveAttribute("inert");
    // ...but the scrim (a CHILD of the root) is NOT inert, so it stays clickable.
    const scrim = view.container.querySelector(".dh-search__scrim");
    expect(scrim).not.toBeNull();
    expect(scrim).not.toHaveAttribute("inert");
  });

  it("closes when the scrim is clicked", async () => {
    const { onClose, view } = renderWithBackground(healthySearch);
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveFocus());
    const scrim = view.container.querySelector(".dh-search__scrim");
    fireEvent.click(scrim as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when clicking inside the panel", async () => {
    const { onClose } = renderWithBackground(healthySearch);
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveFocus());
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("SearchSurface — provider identity and stale-result inertness", () => {
  it("renders two same-module different-provider results as two distinct options", async () => {
    const twoProviders: SearchFn = async (q) =>
      assembleOutcome(q, [
        {
          providerId: "projects.records",
          moduleId: "projects",
          moduleLabel: "Projects",
          ok: true,
          items: [
            {
              id: "1",
              title: `${q} record`,
              entityType: "project",
              target: { kind: "route", to: "/records/1" },
            },
          ],
        },
        {
          providerId: "projects.archived",
          moduleId: "projects",
          moduleLabel: "Projects",
          ok: true,
          items: [
            {
              id: "1",
              title: `${q} archived`,
              entityType: "project",
              target: { kind: "route", to: "/archived/1" },
            },
          ],
        },
      ]);
    renderSurface(twoProviders);
    typeQuery("Alpha");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
    const options = screen.getAllByRole("option");
    const ids = options.map((o) => o.id);
    expect(new Set(ids).size).toBe(2); // distinct DOM option ids
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(new Set(hrefs).size).toBe(2); // each opens its own target
  });

  it("makes stale results during loading inert (no keyboard/pointer activation, no activedescendant)", async () => {
    let calls = 0;
    const pending = new Promise<SearchOutcome>(() => {}); // never resolves
    // FIND-01 — the surface asks for the recency list when it opens. That
    // request is not what this test is about, so it is answered separately and
    // the counter measures TYPED queries only.
    const search: SearchFn = (q) => {
      if (q === "") return Promise.resolve(searchOutcomeFor(""));
      calls += 1;
      return calls === 1 ? Promise.resolve(healthyOutcome(q)) : pending;
    };
    const { onClose } = renderSurface(search);
    const input = screen.getByRole("combobox");
    await waitFor(() =>
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0),
    );
    typeQuery("Finish");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3));
    fireEvent.keyDown(input, { key: "ArrowDown" });
    await waitFor(() =>
      expect(input.getAttribute("aria-activedescendant")).toBeTruthy(),
    );

    // Type a new query — the surface enters loading with the prior results still
    // visible, but they must become inert.
    typeQuery("Report");
    await waitFor(() =>
      expect(input.getAttribute("aria-activedescendant")).toBeFalsy(),
    );
    const staleOptions = screen.getAllByRole("option");
    expect(staleOptions.length).toBeGreaterThan(0);
    expect(
      staleOptions.every((o) => o.getAttribute("aria-selected") === "false"),
    ).toBe(true);
    // No links while stale → neither plain nor modified click can open them.
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    // Enter does nothing: no navigation, surface stays open.
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("location").textContent).toBe("/home");
    expect(onClose).not.toHaveBeenCalled();
  });
});
