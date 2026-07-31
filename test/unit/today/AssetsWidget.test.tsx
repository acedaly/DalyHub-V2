/**
 * ASSET-02 — the Today Assets widget as BEHAVIOUR.
 *
 * Today's job is to say what needs the owner now without shouting. These assert
 * the two things that make that true: every row states its urgency in a WORD and
 * links to the obligation it is about, and the deduplication is VISIBLE — an
 * obligation suppressed because its Task already carries it is counted in a
 * sentence, never silently dropped.
 */

import { MemoryRouter } from "react-router";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AssetsTodayData } from "~/kernel/assets";
import { AssetsWidget } from "~/modules/today/landing/widgets";

function row(id: string, overrides: Record<string, unknown> = {}) {
  return {
    obligationId: id,
    assetId: `asset-${id}`,
    assetTitle: `Asset ${id}`,
    assetType: "vehicle",
    title: "Renew registration",
    categoryLabel: "Registration renewal",
    state: "due" as const,
    stateLabel: "Due soon",
    text: "Due in 9 days",
    href: `/asset/asset-${id}?tab=obligations`,
    ...overrides,
  };
}

function renderWidget(data: AssetsTodayData) {
  render(
    <MemoryRouter>
      <AssetsWidget data={data} />
    </MemoryRouter>,
  );
}

describe("rows", () => {
  it("names the asset, states the urgency in a word, and links to it", () => {
    renderWidget({
      items: [row("a")],
      trackedAsTasksCount: 0,
      overdueCount: 0,
    });
    const list = screen.getByRole("list", {
      name: "Assets needing attention",
    });
    const item = within(list).getByRole("listitem");
    expect(item).toHaveTextContent("Asset a");
    expect(item).toHaveTextContent("Due soon");
    expect(item).toHaveTextContent("Due in 9 days");
    expect(within(item).getByRole("link")).toHaveAttribute(
      "href",
      "/asset/asset-a?tab=obligations",
    );
  });

  it("carries an overdue state as a word, not only a colour", () => {
    renderWidget({
      items: [
        row("a", {
          state: "overdue",
          stateLabel: "Overdue",
          text: "Overdue by 3 days",
        }),
      ],
      trackedAsTasksCount: 0,
      overdueCount: 1,
    });
    expect(screen.getByText("Overdue")).toBeInTheDocument();
  });

  it("says 'reading needed' for a meter obligation we cannot evaluate", () => {
    renderWidget({
      items: [
        row("a", {
          state: "unknown",
          stateLabel: "Reading needed",
          text: "Current meter reading needed",
        }),
      ],
      trackedAsTasksCount: 0,
      overdueCount: 0,
    });
    expect(screen.getByText("Reading needed")).toBeInTheDocument();
    expect(
      screen.getByText("Current meter reading needed"),
    ).toBeInTheDocument();
  });
});

describe("deduplication is visible, never silent", () => {
  it("states how many obligations their tasks are already carrying", () => {
    renderWidget({
      items: [row("a")],
      trackedAsTasksCount: 2,
      overdueCount: 0,
    });
    expect(
      screen.getByText("2 more are tracked as tasks in My day."),
    ).toBeInTheDocument();
  });

  it("uses the singular for one", () => {
    renderWidget({
      items: [row("a")],
      trackedAsTasksCount: 1,
      overdueCount: 0,
    });
    expect(
      screen.getByText("1 more is tracked as a task in My day."),
    ).toBeInTheDocument();
  });

  it("says nothing about tasks when nothing was suppressed", () => {
    renderWidget({
      items: [row("a")],
      trackedAsTasksCount: 0,
      overdueCount: 0,
    });
    expect(screen.queryByText(/tracked as/)).not.toBeInTheDocument();
  });
});

describe("empty states", () => {
  it("teaches Assets when nothing is due and nothing is tracked", () => {
    renderWidget({ items: [], trackedAsTasksCount: 0, overdueCount: 0 });
    expect(screen.getByText("Nothing due soon")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Assets" })).toHaveAttribute(
      "href",
      "/assets",
    );
  });

  it("explains an empty section caused ENTIRELY by deduplication", () => {
    // Otherwise a section that is empty because the tasks exist would read as
    // "nothing to do", which is the opposite of the truth.
    renderWidget({ items: [], trackedAsTasksCount: 3, overdueCount: 0 });
    expect(screen.getByText("Nothing outstanding here")).toBeInTheDocument();
    expect(
      screen.getByText(/3 asset obligations are already tracked as tasks/),
    ).toBeInTheDocument();
  });
});
