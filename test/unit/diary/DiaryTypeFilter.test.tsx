import { RouterProvider, createMemoryRouter } from "react-router";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DiaryTypeFilter } from "~/modules/diary/DiaryTypeFilter";

/**
 * DIARY-01B — the compact type filter: URL-backed with `aria-current`, dropping the
 * scope-bound cursor on any change, and showing counts ONLY when the loader passed
 * honest (fully-loaded, unfiltered) tallies.
 */

function renderFilter(
  activeType: string | null,
  typeCounts: Record<string, number> | null,
  url: string,
) {
  const router = createMemoryRouter(
    [
      {
        path: "/diary",
        element: (
          <DiaryTypeFilter activeType={activeType} typeCounts={typeCounts} />
        ),
      },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />);
  return screen.getByRole("group", { name: "Filter by type" });
}

describe("Diary type filter", () => {
  it("marks the active type and drops the cursor when changing scope", () => {
    const group = renderFilter(
      "meeting",
      null,
      "/diary?cursor=abc&type=meeting",
    );
    expect(
      within(group).getByRole("link", { name: /Meeting/ }),
    ).toHaveAttribute("aria-current", "true");

    const idea = within(group)
      .getByRole("link", { name: /Idea/ })
      .getAttribute("href")!;
    expect(idea).toContain("type=idea");
    expect(idea).not.toContain("cursor");

    const all = within(group)
      .getByRole("link", { name: /All/ })
      .getAttribute("href")!;
    expect(all).not.toContain("type");
    expect(all).not.toContain("cursor");
  });

  it("shows honest counts when provided and omits them otherwise", () => {
    const withCounts = renderFilter(null, { meeting: 2, note: 8 }, "/diary");
    // "All" shows the total; each type shows its loaded count.
    expect(
      within(withCounts).getByRole("link", { name: /All 10/ }),
    ).toBeInTheDocument();
    expect(
      within(withCounts).getByRole("link", { name: /Note 8/ }),
    ).toBeInTheDocument();
  });

  it("omits counts entirely when the loader passed none", () => {
    const noCounts = renderFilter(null, null, "/diary");
    expect(
      within(noCounts).getByRole("link", { name: "All" }),
    ).toBeInTheDocument();
  });
});
