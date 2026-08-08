/**
 * RECORD-01 — the shared record-screen anatomy contract.
 *
 * These assert the SHARED primitives the convergence introduced, so a module
 * cannot quietly reintroduce the shapes it removed: a detached metadata band, a
 * roll-up dashboard card, administrative timestamps in a header, or a frame
 * inside a frame around a writing surface.
 *
 * The browser-level half of the contract — the fold anchor, tab wrapping, the
 * Meeting capture strip and the Person action hierarchy — lives in
 * `e2e/record-anatomy.spec.ts`, because those are questions about real layout.
 */

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  RecordDetails,
  RecordHeader,
  RecordLayout,
  RecordSummaryBar,
  recordTimestampItems,
} from "~/shared/record-layout";

describe("RecordHeader — identity is one block", () => {
  it("puts the glyph, the title and the status on ONE row", () => {
    const { container } = render(
      <RecordHeader
        title="Kitchen fit-out"
        icon={<span data-testid="glyph" />}
        status={{ label: "Active", tone: "accent" }}
      />,
    );

    const row = container.querySelector(".record-header__titlerow");
    expect(row).not.toBeNull();
    // All three are children of the SAME row — the type line above the title,
    // which cost a band of header height and repeated the breadcrumb, is gone.
    expect(within(row as HTMLElement).getByTestId("glyph")).toBeInTheDocument();
    expect(
      within(row as HTMLElement).getByRole("heading", {
        name: "Kitchen fit-out",
      }),
    ).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("Active")).toBeInTheDocument();
  });

  it("keeps the icon's `record-type__icon` hook where #130 put the identity colour", () => {
    const { container } = render(
      <RecordHeader title="Kitchen fit-out" icon={<span id="chosen" />} />,
    );
    expect(
      container.querySelector(".record-type__icon #chosen"),
    ).not.toBeNull();
  });

  it("renders metadata as ONE context line, not a detached band", () => {
    render(
      <RecordHeader
        title="Kitchen fit-out"
        metadata={[
          { id: "area", label: "Area", value: "Home & Property" },
          { id: "goal", label: "Goal", value: "Renovation" },
        ]}
      />,
    );
    const context = screen.getByRole("list", { name: "Record context" });
    expect(within(context).getAllByRole("listitem")).toHaveLength(2);
    expect(context).toHaveTextContent("Area");
    expect(context).toHaveTextContent("Home & Property");
  });

  it("renders a surviving subtype label first in the context line", () => {
    render(
      <RecordHeader
        title="Hilux SR5"
        typeLabel="Vehicle"
        metadata={[{ id: "model", label: "Make & model", value: "Toyota" }]}
      />,
    );
    const items = within(
      screen.getByRole("list", { name: "Record context" }),
    ).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Vehicle");
    expect(items[1]).toHaveTextContent("Toyota");
  });

  it("omits the label span when a caller deliberately passes an empty label", () => {
    // Some context reads as a phrase rather than a field ("Site foreman ·
    // Whitfield Building Co."); an empty span would leave a stray gap.
    const { container } = render(
      <RecordHeader
        title="Dan Whitfield"
        metadata={[{ id: "role", label: "", value: "Site foreman" }]}
      />,
    );
    expect(container.querySelector(".record-context-item__label")).toBeNull();
    expect(screen.getByText("Site foreman")).toBeInTheDocument();
  });

  it("renders no context line at all when there is nothing to say", () => {
    render(<RecordHeader title="Personal Admin" />);
    expect(
      screen.queryByRole("list", { name: "Record context" }),
    ).not.toBeInTheDocument();
  });
});

describe("RecordSummaryBar — the compact derived-state band", () => {
  it("renders nothing when it has nothing to state", () => {
    const { container } = render(<RecordSummaryBar />);
    expect(container.firstChild).toBeNull();
  });

  it("states progress, state and each signal exactly once", () => {
    render(
      <RecordSummaryBar
        progress={{
          label: "Tasks",
          percent: 38,
          summary: "9 of 24 tasks complete",
        }}
        state={<span>At risk</span>}
        signals={[
          {
            id: "overdue",
            text: "3 tasks past their due date",
            tone: "danger",
          },
          { id: "waiting", text: "2 of 15 open tasks waiting" },
        ]}
      />,
    );

    const meter = screen.getByRole("progressbar", { name: "Tasks" });
    expect(meter).toHaveAttribute("aria-valuenow", "38");
    expect(screen.getAllByText("9 of 24 tasks complete")).toHaveLength(1);
    expect(screen.getAllByText("At risk")).toHaveLength(1);
    expect(screen.getAllByText("3 tasks past their due date")).toHaveLength(1);
  });

  it("stays on the page canvas for derived state, and takes a card for prose", () => {
    // The DS-02 "a container is earned" rule: a band of derived state is a line
    // of context; a band carrying a Goal's definition of done is a region.
    const { container: sparse } = render(
      <RecordSummaryBar state={<span>On track</span>} />,
    );
    expect(sparse.querySelector(".dh-record-summary-bar")).toHaveAttribute(
      "data-density",
      "sparse",
    );

    const { container: full } = render(
      <RecordSummaryBar
        description={<p>Kitchen, laundry and hallway are finished.</p>}
        state={<span>On track</span>}
      />,
    );
    expect(full.querySelector(".dh-record-summary-bar")).toHaveAttribute(
      "data-density",
      "full",
    );
  });

  it("is a labelled region, so a summary is announced either way", () => {
    render(<RecordSummaryBar note="This Area has no active work yet." />);
    expect(screen.getByRole("region", { name: "Summary" })).toHaveTextContent(
      "This Area has no active work yet.",
    );
  });
});

describe("RecordDetails — demoted, never deleted", () => {
  it("omits a timestamp that is absent rather than rendering an em dash", () => {
    expect(recordTimestampItems(null, "2026-08-06T22:15:00.000Z")).toEqual([
      expect.objectContaining({ id: "updated", label: "Updated" }),
    ]);
    expect(recordTimestampItems(null, null)).toEqual([]);
  });

  it("renders the administrative facts as one labelled list", () => {
    render(
      <RecordDetails
        items={recordTimestampItems(
          "2026-03-02T00:00:00.000Z",
          "2026-08-06T22:15:00.000Z",
        )}
        label="Project record details"
      />,
    );
    const list = screen.getByLabelText("Project record details");
    expect(within(list).getByText("Created")).toBeInTheDocument();
    expect(within(list).getByText("Updated")).toBeInTheDocument();
  });

  it("renders nothing at all when there is no paperwork to show", () => {
    const { container } = render(<RecordDetails items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("RecordLayout — one summary region, and the plain-surface tab", () => {
  it("prefers the compact band when a caller supplies both summary regions", () => {
    // Two summary regions above one tab strip is the stacked-containers problem
    // the convergence removes, so the layout renders one.
    render(
      <RecordLayout
        title="Kitchen fit-out"
        summary={{ description: <p>the card</p> }}
        summaryBar={{ note: "the band" }}
      />,
    );
    expect(screen.getByText("the band")).toBeInTheDocument();
    expect(screen.queryByText("the card")).not.toBeInTheDocument();
  });

  it("marks a tab whose content brings its own surface as plain", () => {
    const { container } = render(
      <RecordLayout
        title="Kitchen fit-out brief"
        tabs={[
          { id: "note", label: "Note", surface: "plain", content: <p>body</p> },
          { id: "linked", label: "Links", content: <p>links</p> },
        ]}
      />,
    );
    const panels = container.querySelectorAll(".record-tabs__panel");
    expect(panels[0]).toHaveAttribute("data-surface", "plain");
    // A tab that does NOT declare it keeps the contained record surface.
    expect(panels[1]).toHaveAttribute("data-surface", "panel");
  });
});
