import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CollectionLayout } from "~/shared/collection-layout";

describe("PX-02 CollectionLayout — state precedence", () => {
  const slots = {
    emptySlot: <div>EMPTY</div>,
    filteredEmptySlot: <div>FILTERED-EMPTY</div>,
    children: <div>CONTENT</div>,
  };

  it("renders the pane header with title and count", () => {
    render(
      <CollectionLayout title="Projects" subtitle="14 active">
        <div>CONTENT</div>
      </CollectionLayout>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Projects" }),
    ).toBeInTheDocument();
    expect(screen.getByText("14 active")).toBeInTheDocument();
  });

  it("shows content by default", () => {
    render(<CollectionLayout title="P" {...slots} />);
    expect(screen.getByText("CONTENT")).toBeInTheDocument();
    expect(screen.queryByText("EMPTY")).not.toBeInTheDocument();
  });

  it("shows the empty slot when isEmpty", () => {
    render(<CollectionLayout title="P" isEmpty {...slots} />);
    expect(screen.getByText("EMPTY")).toBeInTheDocument();
    expect(screen.queryByText("CONTENT")).not.toBeInTheDocument();
  });

  it("shows the filtered-empty slot when isFilteredEmpty", () => {
    render(<CollectionLayout title="P" isFilteredEmpty {...slots} />);
    expect(screen.getByText("FILTERED-EMPTY")).toBeInTheDocument();
    expect(screen.queryByText("CONTENT")).not.toBeInTheDocument();
  });

  it("shows a loading skeleton and marks the region busy when isLoading", () => {
    const { container } = render(
      <CollectionLayout title="P" isLoading {...slots} />,
    );
    const region = container.querySelector(".dh-collection__content");
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(container.querySelector(".dh-collection-skeleton")).not.toBeNull();
    expect(screen.queryByText("CONTENT")).not.toBeInTheDocument();
  });

  it("prioritises error over loading, empty and content", () => {
    render(
      <CollectionLayout
        title="P"
        error={<div>ERROR</div>}
        isLoading
        isEmpty
        isFilteredEmpty
        {...slots}
      />,
    );
    // error beats all other states in precedence.
    expect(screen.getByText("ERROR")).toBeInTheDocument();
    expect(screen.queryByText("EMPTY")).not.toBeInTheDocument();
    expect(document.querySelector(".dh-collection-skeleton")).toBeNull();
  });

  it("renders a filter bar slot and a selection slot when provided", () => {
    render(
      <CollectionLayout
        title="P"
        filterBar={<div>FILTERS</div>}
        selection={<div>BULK</div>}
      >
        <div>CONTENT</div>
      </CollectionLayout>,
    );
    expect(screen.getByText("FILTERS")).toBeInTheDocument();
    expect(screen.getByText("BULK")).toBeInTheDocument();
  });

  it("labels the collection region by its heading", () => {
    render(
      <CollectionLayout title="Projects">
        <div>CONTENT</div>
      </CollectionLayout>,
    );
    const region = screen.getByRole("region", { name: "Projects" });
    expect(region).toBeInTheDocument();
  });
});
