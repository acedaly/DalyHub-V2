import { RouterProvider, createMemoryRouter } from "react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { NewProjectForm } from "~/modules/projects/NewProjectForm";
import { NewTaskForm } from "~/modules/projects/NewTaskForm";

/**
 * PROJ-01 — the DS-06 create forms as behaviour: required-field validation,
 * duplicate-submit prevention, server-authoritative errors, and the success path.
 */

function renderInRouter(node: ReactElement) {
  const router = createMemoryRouter([{ path: "/", element: node }], {
    initialEntries: ["/"],
  });
  return render(<RouterProvider router={router} />);
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("NewProjectForm", () => {
  const parentOptions = [
    { value: "a1", label: "Career", description: "Area" },
    { value: "g1", label: "Ship v2", description: "Goal" },
  ];

  it("requires a title and a parent before it will submit", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderInRouter(
      <NewProjectForm
        parentOptions={parentOptions}
        onCreated={() => {}}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    await waitFor(() =>
      expect(screen.getAllByText("A title is required").length).toBeGreaterThan(
        0,
      ),
    );
    // Nothing was posted — validation blocked the submit.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  async function chooseParent(label: string) {
    const combo = screen.getByRole("combobox", { name: /Area or Goal/ });
    fireEvent.focus(combo);
    fireEvent.change(combo, { target: { value: label } });
    const option = await screen.findByRole("option", {
      name: new RegExp(label),
    });
    fireEvent.click(option);
  }

  /**
   * The parent picker is server-backed: an `onSearch` hits `/projects/parent-options`.
   * This mock answers that endpoint with options and answers the create POST
   * separately, so tests exercise the real (searchable) picker path.
   */
  function stubProjectFetch(createResult: unknown) {
    const fetchMock = vi.fn(async (url: unknown, _init?: RequestInit) => {
      if (String(url).includes("/projects/parent-options")) {
        return jsonResponse({ options: parentOptions });
      }
      return jsonResponse(createResult);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  function createCall(fetchMock: ReturnType<typeof vi.fn>) {
    return fetchMock.mock.calls.find((call) =>
      String(call[0]).endsWith("/projects/new"),
    );
  }

  it("posts to /projects/new and reports the new project id on success", async () => {
    const fetchMock = stubProjectFetch({ ok: true, projectId: "p-new" });
    const onCreated = vi.fn();
    renderInRouter(
      <NewProjectForm
        parentOptions={parentOptions}
        onCreated={onCreated}
        onCancel={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: "DalyHub V2" },
    });
    // Choose a parent through the combobox listbox.
    await chooseParent("Career");
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("p-new"));
    const call = createCall(fetchMock);
    expect(call).toBeDefined();
    expect(String(call![0])).toBe("/projects/new");
    expect((call![1] as RequestInit | undefined)?.method).toBe("POST");
  });

  it("surfaces a server field error against the parent", async () => {
    stubProjectFetch({
      ok: false,
      fieldErrors: { parentId: "Choose an Area or a Goal for this project." },
    });
    renderInRouter(
      <NewProjectForm
        parentOptions={parentOptions}
        onCreated={() => {}}
        onCancel={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: "X" },
    });
    await chooseParent("Career");
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    await waitFor(() =>
      expect(
        screen.getAllByText("Choose an Area or a Goal for this project.")
          .length,
      ).toBeGreaterThan(0),
    );
  });

  describe("creation discoverability (PROJ-05 §8)", () => {
    it("explains why a project can't be created when no Area/Goal exists, without an unusable picker or a link to an unbuilt route", () => {
      const onCancel = vi.fn();
      renderInRouter(
        <NewProjectForm
          parentOptions={[]}
          onCreated={() => {}}
          onCancel={onCancel}
        />,
      );
      // No silently-empty, unusable picker — an honest explanation instead.
      expect(
        screen.queryByRole("combobox", { name: /Area or Goal/ }),
      ).not.toBeInTheDocument();
      expect(screen.getByText(/doesn.t have either yet/)).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Create an Area" }),
      ).toHaveAttribute("href", "/areas?drawer=new-area");
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(onCancel).toHaveBeenCalled();
    });

    it("keeps the picker usable when at least one Area/Goal exists", () => {
      renderInRouter(
        <NewProjectForm
          parentOptions={parentOptions}
          onCreated={() => {}}
          onCancel={() => {}}
        />,
      );
      expect(
        screen.getByRole("combobox", { name: /Area or Goal/ }),
      ).toBeInTheDocument();
    });

    it("distinguishes a parent-options load failure from a confirmed-empty workspace", () => {
      const onRetry = vi.fn();
      renderInRouter(
        <NewProjectForm
          parentOptions={[]}
          parentOptionsFailed
          onRetryParentOptions={onRetry}
          onCreated={() => {}}
          onCancel={() => {}}
        />,
      );
      // The load-failure message renders, NOT the confirmed-empty domain claim.
      expect(
        screen.getByText("Couldn’t load Areas and Goals."),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/doesn.t have either yet/),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("combobox", { name: /Area or Goal/ }),
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });
});

describe("NewTaskForm", () => {
  it("requires a title and posts create_task to the project mutate route", async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) =>
      jsonResponse({ kind: "create_task", ok: true, taskId: "t-new" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onCreated = vi.fn();
    renderInRouter(
      <NewTaskForm projectId="p1" onCreated={onCreated} onCancel={() => {}} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    await waitFor(() =>
      expect(screen.getAllByText("A title is required").length).toBeGreaterThan(
        0,
      ),
    );
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: "Do the thing" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("t-new"));
    expect(String(fetchMock.mock.calls[0]![0])).toBe("/projects/p1/mutate");
  });
});
