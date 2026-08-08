/**
 * ASSET-03 — Quick Capture's Asset panel.
 *
 * Two things must stay true, and they are the whole point of the panel:
 *
 *   1. capture renders the module's CANONICAL New Asset form — the same fields,
 *      the same progressive reveal, the same `/assets/create` authority — rather
 *      than a second, thinner Asset form that would drift from it;
 *   2. after a create it offers the shared next steps every other capture type
 *      offers, and "Add another" genuinely clears the form for the next thing.
 */

import { RouterProvider, createMemoryRouter } from "react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";

import AssetCapturePanel from "~/modules/assets/AssetCapturePanel";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ ok: true, assetId: "asset-7" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderPanel(onClose = () => {}) {
  const firstFieldRef = createRef<HTMLElement | null>() as {
    current: HTMLElement | null;
  };
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <AssetCapturePanel
            firstFieldRef={firstFieldRef}
            onClose={onClose}
            captureContext={null}
          />
        ),
      },
    ],
    { initialEntries: ["/"] },
  );
  render(<RouterProvider router={router} />);
  return firstFieldRef;
}

async function captureAsset(name: string) {
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: name } });
  fireEvent.focus(screen.getByRole("combobox", { name: "Type" }));
  fireEvent.click(screen.getByRole("option", { name: /Trailer or camper/ }));
  fireEvent.click(screen.getByRole("button", { name: "Create asset" }));
}

describe("Quick Capture — Asset", () => {
  it("is the canonical New Asset form, not a copy of it", () => {
    renderPanel();
    expect(screen.getByRole("form", { name: "New Asset" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Type" })).toBeInTheDocument();
    // Progressive disclosure survives the sheet: no type-specific field yet.
    expect(screen.queryByLabelText(/Manufacturer/)).toBeNull();
  });

  it("points the sheet's initial focus at the Name field", () => {
    const firstFieldRef = renderPanel();
    expect(firstFieldRef.current).toBe(screen.getByLabelText(/^Name/));
  });

  it("posts to the ONE create authority", async () => {
    renderPanel();
    await captureAsset("Cub Frontier");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/assets/create");
  });

  it("offers the shared next steps, and opens the real record", async () => {
    renderPanel();
    await captureAsset("Cub Frontier");
    expect(await screen.findByTestId("capture-result")).toHaveTextContent(
      "Asset created.",
    );
    expect(screen.getByTestId("capture-open-record")).toHaveAttribute(
      "href",
      "/asset/asset-7",
    );
  });

  it("clears the form for the next capture on Add another", async () => {
    renderPanel();
    await captureAsset("Cub Frontier");
    fireEvent.click(await screen.findByTestId("capture-add-another"));
    expect(screen.getByLabelText(/^Name/)).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveValue("");
  });

  it("closes the sheet on Done", async () => {
    const onClose = vi.fn();
    renderPanel(onClose);
    await captureAsset("Cub Frontier");
    fireEvent.click(await screen.findByTestId("capture-done"));
    expect(onClose).toHaveBeenCalled();
  });
});
