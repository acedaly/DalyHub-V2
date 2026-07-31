/**
 * ASSET-02 — the History tab as BEHAVIOUR.
 *
 * The Asset's life, newest first, with the quick actions that put entries there.
 * The assertions that matter: fast capture is offered as named actions rather than
 * one generic form, an entry shows the facts that apply and omits the ones that do
 * not, the list is PAGED rather than loading a decade of servicing at once,
 * filtering replaces the list instead of appending to a page from another query,
 * and an archived record is read-only.
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

import { AssetHistoryTab } from "~/modules/assets/AssetHistoryTab";
import type { SerializedAssetEvent } from "~/modules/assets/asset-history-view";

const ASSET_ID = "asset-1";

function event(
  overrides: Partial<SerializedAssetEvent> = {},
): SerializedAssetEvent {
  return {
    id: "e-1",
    category: "service",
    categoryLabel: "Service",
    title: "60,000 km service",
    eventDate: "2026-07-01",
    dateLabel: "1 July 2026",
    description: null,
    provider: "Northside Auto",
    personId: null,
    personName: null,
    costDisplay: "$489.50",
    valueDisplay: null,
    currencyCode: "AUD",
    meterDisplay: "61,200 km",
    warrantyExpiry: null,
    nextDueDate: "2027-01-01",
    taskId: null,
    taskTitle: null,
    noteId: null,
    noteTitle: null,
    obligationId: null,
    archived: false,
    ...overrides,
  };
}

function renderTab(
  events: readonly SerializedAssetEvent[],
  overrides: Partial<Parameters<typeof AssetHistoryTab>[0]> = {},
) {
  const handlers = {
    onQuickAction: vi.fn(),
    onEditEvent: vi.fn(),
    onChanged: vi.fn(),
  };
  render(
    <FeedbackProvider>
      <AssetHistoryTab
        assetId={ASSET_ID}
        initialEvents={events}
        initialCursor={null}
        initialHasMore={false}
        readOnly={false}
        reloadKey="1"
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

describe("fast capture", () => {
  it("offers named actions, not one generic form", () => {
    renderTab([event()]);
    const group = screen.getByRole("group", { name: "Record an entry" });
    for (const label of [
      "Record service",
      "Record repair",
      "Update meter",
      "Record renewal",
      "Record valuation",
      "Add history entry",
    ]) {
      expect(
        within(group).getByRole("button", { name: label }),
      ).toBeInTheDocument();
    }
  });

  it("hands each action back to the record, which owns the drawer", () => {
    const handlers = renderTab([event()]);
    fireEvent.click(screen.getByRole("button", { name: "Update meter" }));
    expect(handlers.onQuickAction).toHaveBeenCalledWith("meter");
    fireEvent.click(screen.getByRole("button", { name: "Record repair" }));
    expect(handlers.onQuickAction).toHaveBeenCalledWith("repair");
  });
});

describe("an entry shows what applies", () => {
  it("shows the category, date, provider, cost and meter reading", () => {
    renderTab([event()]);
    const row = screen.getByRole("listitem");
    expect(row).toHaveTextContent("Service");
    expect(row).toHaveTextContent("1 July 2026");
    expect(row).toHaveTextContent("Northside Auto · $489.50 · 61,200 km");
  });

  it("omits the facts that do not apply rather than showing empty rows", () => {
    renderTab([
      event({
        id: "e-2",
        category: "inspection",
        categoryLabel: "Inspection",
        title: "Annual inspection",
        provider: null,
        costDisplay: null,
        meterDisplay: null,
        nextDueDate: null,
      }),
    ]);
    const row = screen.getByRole("listitem");
    expect(row).toHaveTextContent("Annual inspection");
    expect(row.textContent).not.toContain("$");
    expect(row.textContent).not.toContain("km");
  });

  it("links a related Task and Note by their canonical titles", () => {
    renderTab([
      event({
        taskId: "t-1",
        taskTitle: "Book the service",
        noteId: "n-1",
        noteTitle: "Service report",
      }),
    ]);
    expect(
      screen.getByRole("link", { name: "Book the service" }),
    ).toHaveAttribute("href", "/tasks?drawer=task%3At-1");
    expect(
      screen.getByRole("link", { name: "Service report" }),
    ).toHaveAttribute("href", "/notes/n-1");
  });

  it("names each entry's row actions, so identical buttons are distinguishable", () => {
    renderTab([
      event({ id: "a", title: "Service" }),
      event({ id: "b", title: "Repair" }),
    ]);
    expect(
      screen.getByRole("button", { name: "Edit Service" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Repair" }),
    ).toBeInTheDocument();
  });
});

describe("empty states", () => {
  it("teaches the first entry with ONE set of controls, not two", () => {
    const handlers = renderTab([]);
    expect(screen.getByText("No history recorded yet")).toBeInTheDocument();
    // The empty state teaches; the quick-action row is the only place with
    // controls, so a first-run screen never shows the same button twice.
    const group = screen.getByRole("group", { name: "Record an entry" });
    expect(
      screen.getAllByRole("button", { name: "Record service" }),
    ).toHaveLength(1);
    fireEvent.click(
      within(group).getByRole("button", { name: "Record service" }),
    );
    expect(handlers.onQuickAction).toHaveBeenCalledWith("service");
  });

  it("distinguishes 'nothing yet' from 'nothing of that kind'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [], nextCursor: null, hasMore: false }),
      }),
    );
    renderTab([event()]);
    fireEvent.change(screen.getByLabelText("Show"), {
      target: { value: "valuation" },
    });
    await waitFor(() =>
      expect(screen.getByText("Nothing of that kind yet")).toBeInTheDocument(),
    );
  });
});

describe("paging", () => {
  it("offers Load more only when there is more, and appends the next page", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [event({ id: "e-2", title: "Older service" })],
        nextCursor: null,
        hasMore: false,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderTab([event()], { initialCursor: "cursor-1", initialHasMore: true });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() =>
      expect(screen.getAllByRole("listitem")).toHaveLength(2),
    );
    // The first page is still there — paging appends, it does not replace.
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("60,000 km service");
    expect(rows[1]).toHaveTextContent("Older service");
    const url = new URL(fetchMock.mock.calls[0][0] as URL);
    expect(url.pathname).toBe(`/asset/${ASSET_ID}/history`);
    expect(url.searchParams.get("cursor")).toBe("cursor-1");
    // Load more is gone once the server says there is nothing after it.
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer Load more when the first page is the whole history", () => {
    renderTab([event()]);
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
  });
});

describe("filtering", () => {
  it("REPLACES the list rather than appending to another query's page", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [event({ id: "e-9", title: "Alternator", category: "repair" })],
        nextCursor: null,
        hasMore: false,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderTab([event()]);
    fireEvent.change(screen.getByLabelText("Show"), {
      target: { value: "repair" },
    });

    await waitFor(() =>
      expect(screen.getByRole("listitem")).toHaveTextContent("Alternator"),
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    const url = new URL(fetchMock.mock.calls[0][0] as URL);
    expect(url.searchParams.get("category")).toBe("repair");
    expect(url.searchParams.get("cursor")).toBeNull();
  });

  it("restores the server-rendered page when the filter is cleared, with no fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], nextCursor: null, hasMore: false }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderTab([event()]);
    fireEvent.change(screen.getByLabelText("Show"), {
      target: { value: "repair" },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "" } });
    expect(screen.getByRole("listitem")).toHaveTextContent("60,000 km service");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("recovers from a failed filter without blanking the tab", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    renderTab([event()]);
    fireEvent.change(screen.getByLabelText("Show"), {
      target: { value: "repair" },
    });
    await waitFor(() =>
      expect(
        screen.getAllByText(/Couldn’t load history/).length,
      ).toBeGreaterThan(0),
    );
    const list = screen.getByRole("list", { name: "Asset history" });
    expect(list).toHaveTextContent("60,000 km service");
  });
});

describe("removing an entry", () => {
  it("posts the canonical intent and revalidates on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ kind: "ok", ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const handlers = renderTab([event()]);
    fireEvent.click(
      screen.getByRole("button", { name: /^Remove 60,000 km service/ }),
    );

    await waitFor(() => expect(handlers.onChanged).toHaveBeenCalled());
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get("intent")).toBe("delete-event");
    expect(body.get("eventId")).toBe("e-1");
  });
});

describe("read-only (archived asset)", () => {
  it("shows the history but offers no capture or row actions", () => {
    renderTab([event()], { readOnly: true });
    expect(screen.getByRole("listitem")).toHaveTextContent("60,000 km service");
    expect(
      screen.queryByRole("group", { name: "Record an entry" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Remove/ }),
    ).not.toBeInTheDocument();
  });
});
