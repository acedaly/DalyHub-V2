import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  NotesFilterBar,
  hasActiveFilters,
} from "~/modules/notes/NotesFilterBar";
import { NoteBacklinksTab, NoteLinksTab } from "~/modules/notes/NoteReferences";
import { ProjectKnowledgeTab } from "~/modules/projects/ProjectKnowledgeTab";
import { FeedbackProvider } from "~/shared/feedback";
import type { NoteFilterValues } from "~/modules/notes/note-view";
import type { RecordReference } from "~/shared/references";

/**
 * NOTES-02/03 + PROJ-03 — the knowledge surfaces' behaviour and accessibility.
 *
 * These assert what a user (and a screen-reader user) actually gets: labelled
 * native filter controls that put their state in the URL, two DISTINCT link
 * directions rather than one ambiguous list, and a Project Knowledge tab whose
 * remove action is worded — and behaves — as an unlink, never a delete.
 */
const NO_FILTERS: NoteFilterValues = {
  q: "",
  tag: "",
  project: "",
  area: "",
  links: "all",
  sort: "created",
};

function renderAt(node: React.ReactElement, initialEntry = "/notes") {
  const router = createMemoryRouter(
    [
      { path: "/notes", element: node },
      { path: "/projects/:projectId", element: node },
      { path: "/notes/:noteId", element: <div>Note record</div> },
    ],
    { initialEntries: [initialEntry] },
  );
  return render(
    <FeedbackProvider>
      <RouterProvider router={router} />
    </FeedbackProvider>,
  );
}

describe("NotesFilterBar", () => {
  it("is a real search form whose controls are all labelled", () => {
    renderAt(
      <NotesFilterBar
        state="active"
        filters={NO_FILTERS}
        tags={[{ value: "reading", label: "reading (2)" }]}
        projects={[{ value: "p1", label: "Atlas" }]}
        areas={[{ value: "a1", label: "Home" }]}
      />,
    );
    const form = screen.getByRole("search", {
      name: "Filter and search notes",
    });
    expect(within(form).getByLabelText("Search notes")).toBeInTheDocument();
    for (const label of ["Tag", "Project", "Area", "Links", "Sort"]) {
      expect(within(form).getByLabelText(label)).toBeInTheDocument();
    }
    // A GET form puts every filter in the URL, so a filtered view is shareable.
    expect(form).toHaveAttribute("method", "get");
    expect(
      within(form).getByRole("button", { name: "Apply" }),
    ).toBeInTheDocument();
  });

  it("offers the workspace's real tag, project and area options", () => {
    renderAt(
      <NotesFilterBar
        state="active"
        filters={NO_FILTERS}
        tags={[{ value: "reading", label: "reading (2)" }]}
        projects={[{ value: "p1", label: "Atlas" }]}
        areas={[{ value: "a1", label: "Home" }]}
      />,
    );
    expect(
      within(screen.getByLabelText("Tag")).getByRole("option", {
        name: "reading (2)",
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Project")).getByRole("option", {
        name: "Atlas",
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Area")).getByRole("option", {
        name: "Home",
      }),
    ).toBeInTheDocument();
  });

  it("keeps the three lifecycle states as one shared segmented filter", () => {
    renderAt(
      <NotesFilterBar
        state="archived"
        filters={NO_FILTERS}
        tags={[]}
        projects={[]}
        areas={[]}
      />,
    );
    const group = screen.getByRole("group", { name: "Filter notes by state" });
    expect(
      within(group)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Active", "Archived", "Deleted"]);
    expect(
      within(group).getByRole("link", { name: "Archived" }),
    ).toHaveAttribute("aria-current", "true");
  });

  it("carries a non-default state through the form so applying a filter never resets it", () => {
    const { container } = renderAt(
      <NotesFilterBar
        state="archived"
        filters={NO_FILTERS}
        tags={[]}
        projects={[]}
        areas={[]}
      />,
    );
    expect(
      container.querySelector('input[type="hidden"][name="state"]'),
    ).toHaveValue("archived");
  });

  it("follows the loader's filters after a navigation, never showing stale values", () => {
    // Regression (PR #80 review): the controls are deliberately UNCONTROLLED so
    // the form works with no JavaScript, and React applies `defaultValue` only
    // on mount. Without remounting on a scope change, Clear/Back/Forward would
    // leave the previous values on screen and re-applying would silently restore
    // filters the URL had already moved past.
    // The props must change on the SAME mounted tree — that is what a loader
    // revalidation does, and it is the case a fresh `render` would not exercise.
    let applyFilters!: (next: NoteFilterValues) => void;
    function Harness() {
      const [filters, setFilters] = useState<NoteFilterValues>({
        ...NO_FILTERS,
        q: "hydroponics",
        sort: "recent",
      });
      applyFilters = setFilters;
      return (
        <NotesFilterBar
          state="active"
          filters={filters}
          tags={[]}
          projects={[]}
          areas={[]}
        />
      );
    }

    renderAt(<Harness />);
    expect(screen.getByLabelText("Search notes")).toHaveValue("hydroponics");
    expect(screen.getByLabelText("Sort")).toHaveValue("recent");

    act(() => applyFilters(NO_FILTERS));
    expect(screen.getByLabelText("Search notes")).toHaveValue("");
    expect(screen.getByLabelText("Sort")).toHaveValue("");
  });

  it("offers Clear only when a filter is actually set", () => {
    const { rerender } = renderAt(
      <NotesFilterBar
        state="active"
        filters={NO_FILTERS}
        tags={[]}
        projects={[]}
        areas={[]}
      />,
    );
    expect(screen.queryByRole("link", { name: "Clear filters" })).toBeNull();
    rerender(
      <FeedbackProvider>
        <NotesFilterBarInRouter filters={{ ...NO_FILTERS, tag: "reading" }} />
      </FeedbackProvider>,
    );
    expect(hasActiveFilters({ ...NO_FILTERS, tag: "reading" })).toBe(true);
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
  });
});

function NotesFilterBarInRouter({ filters }: { filters: NoteFilterValues }) {
  const router = createMemoryRouter(
    [
      {
        path: "/notes",
        element: (
          <NotesFilterBar
            state="active"
            filters={filters}
            tags={[]}
            projects={[]}
            areas={[]}
          />
        ),
      },
    ],
    { initialEntries: ["/notes"] },
  );
  return <RouterProvider router={router} />;
}

function reference(over: Partial<RecordReference> = {}): RecordReference {
  return {
    linkId: "l1",
    direction: "incoming",
    record: { id: "n2", type: "note", title: "Source", archived: false },
    linkType: "note.references",
    relationshipLabel: "Mentioned in note",
    context: "The roadmap for Atlas is agreed.",
    linkedAt: "2026-07-20T10:00:00.000Z",
    ...over,
  };
}

describe("Note relationship tabs", () => {
  it("labels backlinks as 'Referenced by' and explains what does NOT count as one", () => {
    renderAt(
      <NoteBacklinksTab
        noteId="n1"
        page={{ items: [reference()], nextCursor: null }}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Referenced by" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Simply mentioning this note’s title in prose is not a link/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The roadmap for Atlas is agreed."),
    ).toBeInTheDocument();
  });

  it("separates linked Projects, outgoing links and the editable relationships surface", () => {
    renderAt(
      <NoteLinksTab
        noteId="n1"
        page={{
          items: [
            reference({
              direction: "outgoing",
              record: {
                id: "p1",
                type: "project",
                title: "Atlas",
                archived: false,
              },
            }),
          ],
          nextCursor: null,
        }}
        linkedItems={<div>Linked items picker</div>}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Projects this note documents" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Referenced in this note" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Manage relationships" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Linked items picker")).toBeInTheDocument();
  });

  it("teaches the next step when nothing links here yet", () => {
    renderAt(
      <NoteBacklinksTab noteId="n1" page={{ items: [], nextCursor: null }} />,
    );
    expect(
      screen.getByRole("heading", { name: "Nothing links here yet" }),
    ).toBeInTheDocument();
  });
});

describe("ProjectKnowledgeTab", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("op=search")) {
        return new Response(
          JSON.stringify({
            options: [{ id: "n9", type: "note", title: "Found note" }],
          }),
        );
      }
      return new Response(JSON.stringify({ notes: [], nextCursor: null }));
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("lists linked notes with an open target and an unlink-worded remove action", () => {
    renderAt(
      <ProjectKnowledgeTab
        projectId="p1"
        page={{
          notes: [
            {
              id: "n1",
              title: "Research",
              archived: false,
              excerpt: "Some findings.",
              linkedAt: "2026-07-20T10:00:00.000Z",
            },
          ],
          nextCursor: null,
        }}
        onOpenNote={() => {}}
      />,
      "/projects/p1",
    );
    expect(screen.getByRole("link", { name: "Open Research" })).toHaveAttribute(
      "href",
      "/notes/n1",
    );
    expect(
      screen.getByRole("button", { name: "Remove from project" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the note itself is never deleted or archived/i),
    ).toBeInTheDocument();
  });

  it("names an archived linked note's state in words", () => {
    renderAt(
      <ProjectKnowledgeTab
        projectId="p1"
        page={{
          notes: [
            {
              id: "n1",
              title: "Old research",
              archived: true,
              excerpt: "",
              linkedAt: "2026-07-20T10:00:00.000Z",
            },
          ],
          nextCursor: null,
        }}
        onOpenNote={() => {}}
      />,
      "/projects/p1",
    );
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("removes the ASSOCIATION and says the note is unchanged", async () => {
    globalThis.fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Response(JSON.stringify({ kind: "remove", ok: true }));
        }
        return new Response(JSON.stringify({ notes: [], nextCursor: null }));
      },
    ) as typeof fetch;

    renderAt(
      <ProjectKnowledgeTab
        projectId="p1"
        page={{
          notes: [
            {
              id: "n1",
              title: "Research",
              archived: false,
              excerpt: "",
              linkedAt: "2026-07-20T10:00:00.000Z",
            },
          ],
          nextCursor: null,
        }}
        onOpenNote={() => {}}
      />,
      "/projects/p1",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Remove from project" }),
    );
    await waitFor(() =>
      expect(
        screen.getAllByText(
          /removed from this project. The note itself is unchanged/i,
        ).length,
      ).toBeGreaterThan(0),
    );
    expect(screen.queryByRole("link", { name: "Open Research" })).toBeNull();
  });

  it("surfaces an honest message when a note was created but could not be linked", async () => {
    // Regression (PR #80 review): the create and the link are separate writes.
    // If the link fails and the compensating delete ALSO fails, the server says
    // so rather than claiming nothing happened — otherwise a retry would mint
    // another orphan note each time.
    globalThis.fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({
              kind: "create",
              ok: false,
              formError:
                "The note was created, but we couldn’t link it to this project. You’ll find it in Notes.",
            }),
          );
        }
        return new Response(JSON.stringify({ notes: [], nextCursor: null }));
      },
    ) as typeof fetch;

    renderAt(
      <ProjectKnowledgeTab
        projectId="p1"
        page={{ notes: [], nextCursor: null }}
        onOpenNote={() => {}}
      />,
      "/projects/p1",
    );

    fireEvent.change(screen.getByRole("textbox", { name: /New note title/ }), {
      target: { value: "Kick-off" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create note" }));

    await waitFor(() =>
      expect(
        screen.getAllByText(/You’ll find it in Notes/).length,
      ).toBeGreaterThan(0),
    );
  });

  it("hides the add and remove affordances on an archived, read-only project", () => {
    renderAt(
      <ProjectKnowledgeTab
        projectId="p1"
        readOnly
        page={{
          notes: [
            {
              id: "n1",
              title: "Research",
              archived: false,
              excerpt: "",
              linkedAt: "2026-07-20T10:00:00.000Z",
            },
          ],
          nextCursor: null,
        }}
        onOpenNote={() => {}}
      />,
      "/projects/p1",
    );
    expect(
      screen.queryByRole("button", { name: "Remove from project" }),
    ).toBeNull();
    expect(
      screen.queryByRole("combobox", { name: /Add an existing note/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("textbox", { name: /New note title/ }),
    ).toBeNull();
  });

  it("teaches the next action when the project has no knowledge yet", () => {
    renderAt(
      <ProjectKnowledgeTab
        projectId="p1"
        page={{ notes: [], nextCursor: null }}
        onOpenNote={() => {}}
      />,
      "/projects/p1",
    );
    expect(
      screen.getByRole("heading", { name: "No knowledge linked yet" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: /New note title/ }),
    ).toBeInTheDocument();
  });
});
