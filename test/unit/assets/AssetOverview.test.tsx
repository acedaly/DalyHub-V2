/**
 * ASSET-02 — the Asset Overview as BEHAVIOUR.
 *
 * The one screen that answers "what is this, and does it need me?". The assertions
 * that matter: it leads with the most urgent obligation, it never shows a field
 * that does not apply to this kind of asset, it labels money as RECORDED rather
 * than as a total cost of ownership, it never states the same commitment twice,
 * and the depth is behind progressive disclosure.
 */

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AssetOverview } from "~/modules/assets/AssetOverview";
import type { AssetOverviewData } from "~/modules/assets/AssetOverview";
import type {
  SerializedAssetEvent,
  SerializedAssetObligation,
} from "~/modules/assets/asset-history-view";
import type { SerializedAsset } from "~/modules/assets/asset-view";

const TODAY = "2026-07-01";

function asset(overrides: Partial<SerializedAsset> = {}): SerializedAsset {
  return {
    id: "asset-1",
    title: "Ute",
    assetType: "vehicle",
    assetTypeLabel: "Vehicle",
    status: "active",
    statusLabel: "Active",
    description: null,
    manufacturer: "Toyota",
    model: "HiLux",
    serialNumber: null,
    referenceCode: null,
    tags: [],
    ownerPersonId: null,
    responsiblePersonId: null,
    location: null,
    areaId: null,
    acquisitionDate: null,
    purchasePriceMinor: null,
    purchasePriceDisplay: null,
    purchasePriceInput: "",
    currencyCode: "AUD",
    supplier: null,
    replacementValueMinor: null,
    replacementValueDisplay: null,
    replacementValueInput: "",
    disposalDate: null,
    disposalNotes: null,
    warrantyExpiry: null,
    serviceInterval: null,
    lastServiceDate: null,
    nextServiceDate: null,
    serviceProvider: null,
    maintenanceNotes: null,
    issuer: null,
    referenceNumber: null,
    issueDate: null,
    renewalDate: null,
    url: null,
    documentNotes: null,
    currentMeterValue: null,
    currentMeterUnit: null,
    currentMeterDate: null,
    archived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function obligation(
  overrides: Partial<SerializedAssetObligation> = {},
): SerializedAssetObligation {
  return {
    id: "o-1",
    assetId: "asset-1",
    category: "registration",
    categoryLabel: "Registration renewal",
    title: "Renew registration",
    description: null,
    dueDate: "2026-07-10",
    dueDateLabel: "10 July 2026",
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

const EMPTY_COSTS = {
  currencyCode: "AUD",
  lines: [],
  ongoingTotal: null,
  purchasePrice: null,
  lifetimeTotal: null,
  costedEventCount: 0,
  mixedCurrency: false,
  excludedCurrencies: [],
  isEmpty: true,
};

function data(overrides: Partial<AssetOverviewData> = {}): AssetOverviewData {
  return {
    obligations: [],
    recentEvents: [],
    costs: EMPTY_COSTS,
    values: { points: [], currentAmount: null, hasTrend: false, summary: null },
    meterDisplay: null,
    meterDateLabel: null,
    openTaskCount: 0,
    ...overrides,
  };
}

function renderOverview(
  a: SerializedAsset = asset(),
  d: AssetOverviewData = data(),
) {
  const handlers = {
    onEditDetails: vi.fn(),
    onOpenObligations: vi.fn(),
    onOpenHistory: vi.fn(),
  };
  render(
    <AssetOverview
      asset={a}
      names={{ ownerName: null, responsibleName: null, areaName: null }}
      data={d}
      today={TODAY}
      {...handlers}
    />,
  );
  return handlers;
}

describe("the lead line", () => {
  it("leads with the next open obligation, in words", () => {
    renderOverview(asset(), data({ obligations: [obligation()] }));
    const next = screen.getByTestId("asset-next-obligation");
    expect(next).toHaveTextContent("Due soon");
    expect(next).toHaveTextContent("Renew registration");
    expect(next).toHaveTextContent("Due in 9 days");
  });

  it("counts the overdue ones so the scale is visible without opening the tab", () => {
    renderOverview(
      asset(),
      data({
        obligations: [
          obligation({ id: "a", state: "overdue", stateLabel: "Overdue" }),
          obligation({ id: "b", state: "overdue", stateLabel: "Overdue" }),
          obligation({ id: "c", state: "upcoming" }),
        ],
      }),
    );
    expect(
      screen.getByText(/2 of 3 obligations are overdue/),
    ).toBeInTheDocument();
  });

  it("never states the same commitment twice", () => {
    // The asset has a canonical renewal date AND an obligation. Only the
    // obligation is shown — otherwise the rego would appear twice (§10).
    renderOverview(
      asset({ renewalDate: "2026-07-10" }),
      data({ obligations: [obligation()] }),
    );
    expect(screen.getAllByText(/Due in 9 days/)).toHaveLength(1);
    expect(screen.queryByText(/Renewal due in/)).not.toBeInTheDocument();
  });

  it("falls back to the canonical date when there is no obligation yet", () => {
    renderOverview(asset({ renewalDate: "2026-07-10" }), data());
    expect(screen.getByText("Renewal due in 9 days")).toBeInTheDocument();
  });

  it("teaches the next action when there is nothing tracked at all", () => {
    const handlers = renderOverview();
    expect(
      screen.getByText(/No maintenance or renewals tracked yet/),
    ).toBeInTheDocument();
    screen.getByRole("button", { name: "Add one" }).click();
    expect(handlers.onOpenObligations).toHaveBeenCalled();
  });
});

describe("facts that apply", () => {
  it("shows the meter only when the asset has one", () => {
    const { container } = render(<div />);
    void container;
    renderOverview(asset(), data());
    expect(screen.queryByText("Current meter")).not.toBeInTheDocument();
  });

  it("shows the meter reading and when it was taken", () => {
    renderOverview(
      asset(),
      data({ meterDisplay: "61,200 km", meterDateLabel: "1 July 2026" }),
    );
    expect(screen.getByText("Current meter")).toBeInTheDocument();
    expect(
      screen.getByText("61,200 km · read 1 July 2026"),
    ).toBeInTheDocument();
  });

  it("shows the most recent service or repair when one exists", () => {
    const event: SerializedAssetEvent = {
      id: "e-1",
      category: "service",
      categoryLabel: "Service",
      title: "60,000 km service",
      eventDate: "2026-06-01",
      dateLabel: "1 June 2026",
      description: null,
      provider: "Northside Auto",
      personId: null,
      personName: null,
      costDisplay: null,
      valueDisplay: null,
      currencyCode: null,
      meterDisplay: null,
      warrantyExpiry: null,
      nextDueDate: null,
      taskId: null,
      taskTitle: null,
      noteId: null,
      noteTitle: null,
      obligationId: null,
      archived: false,
    };
    renderOverview(asset(), data({ recentEvents: [event] }));
    expect(screen.getByText("Last service")).toBeInTheDocument();
    expect(
      screen.getByText("1 June 2026 · Northside Auto"),
    ).toBeInTheDocument();
  });

  it("reports linked open tasks, in the singular when there is one", () => {
    renderOverview(asset(), data({ openTaskCount: 1 }));
    expect(
      screen.getByText("1 open task is linked to this asset."),
    ).toBeInTheDocument();
  });
});

describe("recorded costs", () => {
  const costs = {
    currencyCode: "AUD",
    lines: [
      {
        group: "service" as const,
        label: "Service and maintenance",
        amount: "$400.00",
        minor: 40_000,
      },
    ],
    ongoingTotal: "$400.00",
    purchasePrice: "$42,000.00",
    lifetimeTotal: "$42,400.00",
    costedEventCount: 1,
    mixedCurrency: false,
    excludedCurrencies: [],
    isEmpty: false,
  };

  it("is hidden entirely when nothing is recorded", () => {
    renderOverview();
    expect(screen.queryByText("Recorded costs")).not.toBeInTheDocument();
  });

  it("labels totals as RECORDED and disclaims completeness", () => {
    renderOverview(asset(), data({ costs }));
    const disclosure = screen.getByText("Recorded costs").closest("details")!;
    expect(disclosure).toHaveTextContent(
      "They are not a complete cost of ownership",
    );
    expect(
      within(disclosure).getByText("Recorded ongoing cost"),
    ).toBeInTheDocument();
    // The purchase price is stated separately from the ongoing cost (§15).
    expect(within(disclosure).getByText("Purchase price")).toBeInTheDocument();
    expect(
      within(disclosure).getByText("Recorded lifetime total"),
    ).toBeInTheDocument();
  });

  it("says which currencies were left out rather than converting them", () => {
    renderOverview(
      asset(),
      data({
        costs: {
          ...costs,
          mixedCurrency: true,
          excludedCurrencies: ["USD"],
        },
      }),
    );
    expect(
      screen.getByText(/DalyHub never converts between currencies/),
    ).toBeInTheDocument();
  });
});

describe("progressive disclosure", () => {
  it("puts the depth behind disclosures rather than on the first screen", () => {
    renderOverview(asset({ acquisitionDate: "2024-01-01" }), data());
    const dates = screen.getByText("All dates").closest("details")!;
    // Closed by default: a glance stays a glance.
    expect(dates.open).toBe(false);
  });

  it("hides the value history entirely when nothing is recorded", () => {
    renderOverview();
    expect(screen.queryByText("Value history")).not.toBeInTheDocument();
  });

  it("shows the value history once valuations exist", () => {
    renderOverview(
      asset(),
      data({
        values: {
          points: [
            {
              eventId: "e-1",
              date: "2026-01-01",
              dateLabel: "1 January 2026",
              amount: "$38,000.00",
              minor: 3_800_000,
              source: "AAMI",
            },
          ],
          currentAmount: "$38,000.00",
          hasTrend: false,
          summary: "One valuation recorded: $38,000.00 on 1 January 2026.",
        },
      }),
    );
    const disclosure = screen.getByText("Value history").closest("details")!;
    expect(disclosure).toHaveTextContent("Current recorded value");
    expect(disclosure).toHaveTextContent("One valuation recorded");
  });
});
