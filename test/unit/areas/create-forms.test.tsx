import { RouterProvider, createMemoryRouter } from "react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { NewAreaForm } from "~/modules/areas/NewAreaForm";
import { RenameAreaForm } from "~/modules/areas/RenameAreaForm";

function renderInRouter(node: ReactElement) {
  const router = createMemoryRouter([{ path: "/", element: node }], {
    initialEntries: ["/"],
  });
  return render(<RouterProvider router={router} />);
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("Area forms", () => {
  it("requires a title before creating an Area", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderInRouter(<NewAreaForm onCreated={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Create Area" }));
    await waitFor(() =>
      expect(screen.getAllByText("A title is required").length).toBeGreaterThan(
        0,
      ),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to /areas/new and preserves server errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ ok: false, fieldErrors: { title: "Too short" } }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true, areaId: "a-new" }));
    vi.stubGlobal("fetch", fetchMock);
    const onCreated = vi.fn();
    renderInRouter(<NewAreaForm onCreated={onCreated} onCancel={() => {}} />);

    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: "Health" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Area" }));
    await waitFor(() =>
      expect(screen.getAllByText("Too short").length).toBeGreaterThan(0),
    );

    fireEvent.click(screen.getByRole("button", { name: "Create Area" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("a-new"));
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/areas/new");
  });

  it("renames through /areas/:id/mutate", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ kind: "rename", ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const onDone = vi.fn();
    renderInRouter(
      <RenameAreaForm
        areaId="a1"
        currentTitle="Career"
        onDone={onDone}
        onCancel={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: "Career and craft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/areas/a1/mutate");
  });
});
