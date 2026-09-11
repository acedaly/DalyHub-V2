import { RouterProvider, createMemoryRouter } from "react-router";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DiaryModeTabs } from "~/modules/diary/DiaryModeTabs";
import type { DiaryMode } from "~/modules/diary/routes/index";

/**
 * DIARY-01B — the Day/Timeline mode switch: two REAL modes (no dead Week/Month),
 * URL-backed with `aria-selected`, dropping the scope-bound cursor and (leaving Day)
 * the now-irrelevant date.
 */

function renderTabs(mode: DiaryMode, url: string) {
  const router = createMemoryRouter(
    [{ path: "/diary", element: <DiaryModeTabs mode={mode} /> }],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />);
  return screen.getByRole("tablist", { name: "Diary views" });
}

describe("Diary mode tabs", () => {
  it("offers exactly Day and Timeline (no placeholder Week/Month)", () => {
    const group = renderTabs("day", "/diary");
    const links = within(group).getAllByRole("tab");
    expect(links.map((l) => l.textContent)).toEqual(["Day", "Timeline"]);
  });

  it("marks the active mode", () => {
    const group = renderTabs("timeline", "/diary?mode=timeline");
    expect(
      within(group).getByRole("tab", { name: "Timeline" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("dropping to Day clears mode; Timeline drops date; both drop cursor", () => {
    const group = renderTabs("day", "/diary?date=2026-07-01&cursor=abc");
    const timeline = within(group)
      .getByRole("tab", { name: "Timeline" })
      .getAttribute("href")!;
    expect(timeline).toContain("mode=timeline");
    expect(timeline).not.toContain("date=");
    expect(timeline).not.toContain("cursor");

    const day = within(group)
      .getByRole("tab", { name: "Day" })
      .getAttribute("href")!;
    expect(day).not.toContain("mode=");
    expect(day).not.toContain("cursor");
    // Day keeps the selected date.
    expect(day).toContain("date=2026-07-01");
  });
});
