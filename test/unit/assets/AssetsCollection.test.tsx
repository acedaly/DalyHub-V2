import { RouterProvider, createMemoryRouter } from "react-router";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AssetsCollectionView } from "~/modules/assets/AssetsCollection";
import type { AssetsCollectionData } from "~/modules/assets/assets-collection-data";
import type { SerializedAssetListItem } from "~/modules/assets/asset-view";

function asset(
  over: Partial<SerializedAssetListItem> = {},
): SerializedAssetListItem {
  return {
    id: "a1",
    title: "Hilux",
    assetType: "vehicle",
    assetTypeLabel: "Vehicle",
    status: "active",
    statusLabel: "Active",
    manufacturer: "Toyota",
    model: "HiLux SR5",
    location: "Garage",
    tags: [],
    warrantyExpiry: null,
    renewalDate: null,
    nextServiceDate: null,
    archived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...over,
  };
}

function data(
  assets: readonly SerializedAssetListItem[],
  over: Partial<AssetsCollectionData> = {},
): AssetsCollectionData {
  return {
    assets,
    obligationSignals: {},
    nextCursor: null,
    view: "all",
    sort: "recent",
    filters: {},
    query: "",
    today: "2026-08-10",
    obligations: "any",
    people: [],
    areas: [],
    failed: false,
    ...over,
  };
}

function renderCollection(value: AssetsCollectionData, entry = "/assets") {
  const router = createMemoryRouter(
    [{ path: "/assets", element: <AssetsCollectionView data={value} /> }],
    { initialEntries: [entry] },
  );
  return render(<RouterProvider router={router} />);
}

describe("Assets collection (UIX-05)", () => {
  it("renders an Asset card led by the thing, with its type and model", () => {
    renderCollection(data([asset()]));
    const card = screen.getByRole("article", { name: "Hilux" });
    expect(
      within(card).getByRole("link", { name: "Open Hilux" }),
    ).toHaveAttribute("href", "/asset/a1");
    expect(
      within(card).getByText("Vehicle · Toyota HiLux SR5"),
    ).toBeInTheDocument();
    expect(within(card).getByText("Active · Garage")).toBeInTheDocument();
  });

  // The card's measure is TIME: the next commitment, and when.
  it("pins the next canonical date as the commitment, in words and in full", () => {
    renderCollection(data([asset({ nextServiceDate: "2026-08-03" })]));
    const due = screen.getByTestId("asset-card-due");
    expect(due).toHaveAttribute("data-tone", "danger");
    expect(due).toHaveTextContent("Service overdue");
    expect(due).toHaveTextContent("3 August 2026");
  });

  it("reads a date inside the due-soon threshold as attention, not overdue", () => {
    renderCollection(data([asset({ renewalDate: "2026-08-20" })]));
    const due = screen.getByTestId("asset-card-due");
    expect(due).toHaveAttribute("data-tone", "warning");
    expect(due).toHaveTextContent("Renewal due in 10 days");
  });

  // An obligation is a live commitment the owner created; it wins.
  it("prefers the obligation signal over the canonical date, and shows only one", () => {
    renderCollection(
      data([asset({ nextServiceDate: "2026-08-03" })], {
        obligationSignals: {
          a1: {
            openCount: 2,
            overdueCount: 1,
            dueSoonCount: 0,
            text: "1 obligation overdue",
            tone: "danger",
            dueLabel: "3 August 2026",
          },
        },
      }),
    );
    const due = screen.getByTestId("asset-card-due");
    expect(due).toHaveTextContent("1 obligation overdue");
    expect(due).not.toHaveTextContent("Service overdue");
  });

  // An absence is drawn as an absence, in the space the date would have taken.
  it("says nothing is scheduled rather than leaving a gap", () => {
    renderCollection(data([asset()]));
    expect(screen.getByText("Nothing scheduled")).toBeInTheDocument();
  });

  // The seven filter dimensions moved into the ONE shared sheet at every width.
  it("keeps search visible and puts the rest behind the shared control sheet", () => {
    renderCollection(data([asset()]));
    expect(screen.getByLabelText("Search assets")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Filter & sort/ }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Type")).toBeNull();
  });

  // A narrowed gallery has to explain itself without reopening a control.
  it("shows a removable chip for an active filter", () => {
    renderCollection(
      data([asset()], { filters: { type: "vehicle" } }),
      "/assets?type=vehicle",
    );
    expect(screen.getByTestId("collection-filter-chips")).toHaveTextContent(
      "Vehicle",
    );
  });

  /*
   * Codex review, PR #156 — the loader still honours `?tag=`, so dropping the
   * control left a bookmarked tag URL narrowing the gallery with nothing showing
   * it and no way to clear it: a filtered list that cannot explain itself.
   */
  it("keeps the free-text tag filter visible beside search", () => {
    renderCollection(
      data([asset()], { filters: { tag: "shed" } }),
      "/assets?tag=shed",
    );
    const tag = screen.getByLabelText("Filter by tag");
    expect(tag).toHaveValue("shed");
  });

  it("shows a warm empty state on an empty workspace", () => {
    renderCollection(data([]));
    expect(screen.getByText("No Assets yet")).toBeInTheDocument();
  });
});
