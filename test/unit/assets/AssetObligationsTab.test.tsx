/**
 * ASSET-02 / V2.10 LIFE-02 — the Obligations tab as BEHAVIOUR.
 *
 * What an owner must be able to do and see: overdue work first, every state
 * carried by a WORD as well as a tone, only the actions that make sense for a
 * given state, a filter that answers a real question, a first-run empty state
 * that teaches the next action, and — the load-bearing one — the honest sentence
 * that appears when a linked Task is done but the work has not been recorded.
 *
 * LIFE-02 changed two things underneath and neither may change what an owner
 * sees: the rows are now the SHARED obligation row, and the one-press actions
 * post to the obligation's own endpoint rather than to the Asset's history
 * route. The band headings replaced "Due soon" with the calendar bands Life
 * Admin prints, so the two surfaces group one record the same way.
 */

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryRouter } from "react-router";

import { FeedbackProvider } from "~/shared/feedback";

import { AssetObligationsTab } from "~/modules/assets/AssetObligationsTab";
import type { ObligationBandCounts } from "~/kernel/obligations";
import type { SerializedObligation } from "~/shared/obligations";

const ASSET_ID = "asset-1";

function obligation(
  overrides: Partial<SerializedObligation> = {},
): SerializedObligation {
  return {
    id: "o-1",
    subject: {
      id: ASSET_ID,
      type: "asset",
      subtype: "vehicle",
      title: "The ute",
      href: `/asset/${ASSET_ID}`,
    },
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
    band: "this_week",
    taskId: null,
    taskTitle: null,
    taskOpen: false,
    expectedAmountDisplay: null,
    completedAmountDisplay: null,
    currencyCode: null,
    expectedAmountInput: "",
    completedEventId: null,
    completedDate: null,
    completedDateLabel: null,
    seriesId: "s-1",
    sequence: 0,
    href: "/obligations/o-1",
    ...overrides,
  };
}

/** Counts derived from the rows, which is what the loader supplies in practice. */
function countsFor(
  obligations: readonly SerializedObligation[],
): ObligationBandCounts {
  const counts: ObligationBandCounts = {
    overdue: 0,
    this_week: 0,
    this_month: 0,
    later: 0,
    done: 0,
  };
  const mutable = counts as unknown as Record<string, number>;
  for (const item of obligations) {
    if (item.status === "open") mutable[item.band] += 1;
  }
  return counts;
}

function renderTab(
  obligations: readonly SerializedObligation[],
  overrides: Partial<Parameters<typeof AssetObligationsTab>[0]> = {},
) {
  const handlers = {
    onAdd: vi.fn(),
    onEdit: vi.fn(),
    onComplete: vi.fn(),
    onChanged: vi.fn(),
  };
  render(
    // The shared row links to the obligation's own record, so it needs a router.
    <MemoryRouter>
      <FeedbackProvider>
        <AssetObligationsTab
          obligations={obligations}
          counts={countsFor(obligations)}
          readOnly={false}
          {...handlers}
          {...overrides}
        />
      </FeedbackProvider>
    </MemoryRouter>,
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
  it("groups by band, most urgent first", () => {
    renderTab([
      obligation({
        id: "o-later",
        band: "later",
        state: "upcoming",
        title: "Later thing",
      }),
      obligation({
        id: "o-overdue",
        band: "overdue",
        state: "overdue",
        title: "Overdue thing",
      }),
      obligation({
        id: "o-week",
        band: "this_week",
        state: "due",
        title: "Due thing",
      }),
    ]);
    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(headings[0]).toContain("Overdue");
    expect(headings[1]).toContain("This week");
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

  /*
   * The band rule puts a meter obligation awaiting a reading with OVERDUE, and
   * that is deliberate (D10): it cannot be placed on a calendar at all, and
   * burying it further down would hide the one row that needs the owner to go
   * and read a number. The tab renders whichever band the shared rule assigned.
   */
  it("keeps a meter obligation with no reading at the top, in words", () => {
    renderTab([
      obligation({
        band: "overdue",
        state: "unknown",
        stateLabel: "Reading needed",
        stateText: "Current meter reading needed",
      }),
    ]);
    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(headings[0]).toContain("Overdue");
    expect(screen.getByText("Reading needed")).toBeInTheDocument();
  });
});

describe("the Task authority contract, said plainly", () => {
  it("offers 'Open task' while the linked Task is still open", () => {
    renderTab([obligation({ taskId: "t-1", taskOpen: true })]);
    expect(screen.getByRole("link", { name: "Open task" })).toHaveAttribute(
      "href",
      "/tasks?drawer=task%3At-1",
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
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const handlers = renderTab([obligation()]);
    fireEvent.click(
      screen.getByRole("button", { name: /^Hold Renew registration/ }),
    );

    await waitFor(() => expect(handlers.onChanged).toHaveBeenCalled());
    /*
     * The obligation's OWN endpoint, not the Asset's history route. That is the
     * convergence: this tab and Life Admin hold an obligation through one door.
     */
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/obligations/o-1/mutate");
    const body = init.body as FormData;
    expect(body.get("intent")).toBe("hold");
  });

  it("recovers from a server refusal without losing the list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
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
    const list = screen.getByRole("list", { name: "This week obligations" });
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
    const list = screen.getByRole("list", { name: "This week obligations" });
    expect(
      within(list).queryByRole("button", { name: /Complete/ }),
    ).not.toBeInTheDocument();
  });
});
