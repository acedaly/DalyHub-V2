/**
 * ASSET-02 — the Obligations tab as BEHAVIOUR.
 *
 * What an owner must be able to do and see: overdue work first, every state
 * carried by a WORD as well as a tone, only the actions that make sense for a
 * given state, a filter that answers a real question, a first-run empty state that
 * teaches the next action, and — the load-bearing one — the honest sentence that
 * appears when a linked Task is done but the work has not been recorded.
 */

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FeedbackProvider } from "~/shared/feedback";

import { AssetObligationsTab } from "~/modules/assets/AssetObligationsTab";
import type { SerializedAssetObligation } from "~/modules/assets/asset-history-view";

const ASSET_ID = "asset-1";

function obligation(
  overrides: Partial<SerializedAssetObligation> = {},
): SerializedAssetObligation {
  return {
    id: "o-1",
    assetId: ASSET_ID,
    category: "registration",
    categoryLabel: "Registration renewal",
    title: "Renew registration",
    description: null,
    dueDate: "2026-09-30",
    dueDateLabel: "30 September 2026",
    leadDays: 14,
    recurrenceLabel: "Every year",
    recurrenceKind: "years",
    recurrenceInterval: 1,
    meterThreshold: null,
    meterInterval: null,
    meterUnit: null,
    meterDisplay: null,
    status: "open",
    state: "due",
    stateLabel: "Due soon",
    stateText: "Due in 9 days",
    needsAttention: true,
    taskId: null,
    taskTitle: null,
    taskOpen: false,
    completedEventId: null,
    completedDate: null,
    seriesId: "s-1",
    sequence: 0,
    ...overrides,
  };
}

function renderTab(
  obligations: readonly SerializedAssetObligation[],
  overrides: Partial<Parameters<typeof AssetObligationsTab>[0]> = {},
) {
  const handlers = {
    onAdd: vi.fn(),
    onEdit: vi.fn(),
    onComplete: vi.fn(),
    onChanged: vi.fn(),
  };
  render(
    <FeedbackProvider>
      <AssetObligationsTab
        assetId={ASSET_ID}
        obligations={obligations}
        readOnly={false}
        {...handlers}
        {...overrides}
      />
    </FeedbackProvider>,
  );
  return handlers;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("empty state", () => {
  it("teaches the next action rather than showing a bare list", () => {
    const handlers = renderTab([]);
    expect(screen.getByText("Nothing scheduled yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add obligation" }));
    expect(handlers.onAdd).toHaveBeenCalled();
  });

  it("offers no write actions on an archived record", () => {
    renderTab([], { readOnly: true });
    expect(
      screen.queryByRole("button", { name: "Add obligation" }),
    ).not.toBeInTheDocument();
  });
});

describe("grouping and state", () => {
  it("groups overdue, due soon and later, most urgent first", () => {
    renderTab([
      obligation({ id: "o-later", state: "upcoming", title: "Later thing" }),
      obligation({ id: "o-overdue", state: "overdue", title: "Overdue thing" }),
      obligation({ id: "o-due", state: "due", title: "Due thing" }),
    ]);
    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(headings[0]).toContain("Overdue");
    expect(headings[1]).toContain("Due soon");
    expect(headings[2]).toContain("Later");
  });

  it("carries every state as a WORD, never colour alone", () => {
    renderTab([
      obligation({ id: "a", state: "overdue", stateLabel: "Overdue" }),
      obligation({ id: "b", state: "unknown", stateLabel: "Reading needed" }),
    ]);
    // The word appears on the row's own badge, not only in the group heading —
    // so the state survives being read out of context.
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText("Overdue")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Reading needed")).toBeInTheDocument();
  });

  it("shows the recurrence and the state sentence together", () => {
    renderTab([obligation()]);
    expect(screen.getByText(/Due in 9 days/)).toBeInTheDocument();
    expect(screen.getByText(/Every year/)).toBeInTheDocument();
  });

  it("groups a meter obligation with no reading under Due soon, not Overdue", () => {
    renderTab([
      obligation({
        state: "unknown",
        stateLabel: "Reading needed",
        stateText: "Current meter reading needed",
      }),
    ]);
    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(headings.some((h) => h?.includes("Overdue"))).toBe(false);
    expect(headings[0]).toContain("Due soon");
  });
});

describe("the Task authority contract, said plainly", () => {
  it("offers 'Open task' while the linked Task is still open", () => {
    renderTab([obligation({ taskId: "t-1", taskOpen: true })]);
    expect(screen.getByRole("link", { name: "Open task" })).toHaveAttribute(
      "href",
      "/task/t-1",
    );
    // No "Create task" — one already exists.
    expect(
      screen.queryByRole("button", { name: /Create task/ }),
    ).not.toBeInTheDocument();
  });

  it("asks for the actual work once the linked Task is done", () => {
    renderTab([obligation({ taskId: "t-1", taskOpen: false })]);
    expect(
      screen.getByText(/Record what actually happened to complete/),
    ).toBeInTheDocument();
  });

  it("offers to create a Task only when there is none", () => {
    const handlers = renderTab([obligation({ taskId: null })]);
    expect(
      screen.getByRole("button", { name: /Create task/ }),
    ).toBeInTheDocument();
    expect(handlers.onAdd).not.toHaveBeenCalled();
  });
});

describe("actions", () => {
  it("names each action's obligation, so identical buttons are distinguishable", () => {
    renderTab([
      obligation({ id: "a", title: "Renew registration" }),
      obligation({ id: "b", title: "Service the ute" }),
    ]);
    expect(
      screen.getByRole("button", { name: "Complete Renew registration" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Complete Service the ute" }),
    ).toBeInTheDocument();
  });

  it("hands Complete and Edit back to the record, which owns the drawer", () => {
    const handlers = renderTab([obligation()]);
    fireEvent.click(
      screen.getByRole("button", { name: /^Complete Renew registration/ }),
    );
    expect(handlers.onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ id: "o-1" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^Edit Renew registration/ }),
    );
    expect(handlers.onEdit).toHaveBeenCalled();
  });

  it("posts Hold to the canonical endpoint and revalidates on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ kind: "ok", ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const handlers = renderTab([obligation()]);
    fireEvent.click(
      screen.getByRole("button", { name: /^Hold Renew registration/ }),
    );

    await waitFor(() => expect(handlers.onChanged).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/asset/${ASSET_ID}/history`);
    const body = init.body as FormData;
    expect(body.get("intent")).toBe("hold-obligation");
    expect(body.get("obligationId")).toBe("o-1");
  });

  it("recovers from a server refusal without losing the list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          kind: "ok",
          ok: false,
          formError: "That couldn’t be saved.",
        }),
      }),
    );
    const handlers = renderTab([obligation()]);
    fireEvent.click(
      screen.getByRole("button", { name: /^Dismiss Renew registration/ }),
    );
    // The shared feedback surface renders the message in both the toast and the
    // assertive live region, which is exactly what a screen reader needs.
    await waitFor(() =>
      expect(
        screen.getAllByText("That couldn’t be saved.").length,
      ).toBeGreaterThan(0),
    );
    expect(handlers.onChanged).not.toHaveBeenCalled();
    // The row survived the failure — an error never empties the list. Scoped to
    // the obligations list, since the feedback toast is a list of its own.
    const list = screen.getByRole("list", { name: "Due soon obligations" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(list).toHaveTextContent("Renew registration");
  });

  it("offers only Reopen for an obligation that is on hold", () => {
    renderTab([obligation({ status: "on_hold", state: "on_hold" })]);
    // Settled work is behind the disclosure; open it first.
    fireEvent.click(screen.getByText(/Completed and set aside/));
    expect(screen.getByRole("button", { name: /^Reopen/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Complete/ }),
    ).not.toBeInTheDocument();
  });

  it("offers no actions at all on a completed occurrence", () => {
    renderTab([obligation({ status: "completed", state: "completed" })]);
    fireEvent.click(screen.getByText(/Completed and set aside/));
    expect(
      screen.queryByRole("button", { name: /^Complete/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Reopen/ }),
    ).not.toBeInTheDocument();
  });
});

describe("filtering", () => {
  it("filters by category and reports honestly when nothing matches", () => {
    renderTab([
      obligation({ id: "a", category: "registration" }),
      obligation({
        id: "b",
        category: "service",
        categoryLabel: "Scheduled service",
        title: "Service the ute",
      }),
    ]);
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "service" },
    });
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Service the ute");
    expect(screen.queryByText("Renew registration")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "insurance" },
    });
    expect(
      screen.getByText("Nothing outstanding in this view."),
    ).toBeInTheDocument();
  });
});

describe("completed history", () => {
  it("keeps settled work out of the way but never destroys it", () => {
    renderTab([
      obligation({ id: "open", title: "Renew registration" }),
      obligation({
        id: "done",
        title: "Last year’s rego",
        status: "completed",
        state: "completed",
      }),
    ]);
    const disclosure = screen.getByText(/Completed and set aside \(1\)/);
    expect(disclosure).toBeInTheDocument();
    fireEvent.click(disclosure);
    expect(screen.getByText("Last year’s rego")).toBeInTheDocument();
  });
});

describe("read-only (archived asset)", () => {
  it("still shows the obligations, but offers no way to change them", () => {
    renderTab([obligation()], { readOnly: true });
    expect(screen.getByText("Renew registration")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Due soon obligations" });
    expect(
      within(list).queryByRole("button", { name: /Complete/ }),
    ).not.toBeInTheDocument();
  });
});
