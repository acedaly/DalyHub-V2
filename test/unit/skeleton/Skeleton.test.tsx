import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  CardSkeleton,
  CollectionSkeleton,
  PaneSkeleton,
  Skeleton,
} from "~/shared/skeleton";

describe("PX-02 Skeleton system", () => {
  it("renders a decorative shimmer block sized from props", () => {
    const { container } = render(<Skeleton width={120} height="1rem" />);
    const block = container.querySelector(".dh-skeleton") as HTMLElement;
    expect(block).not.toBeNull();
    expect(block).toHaveAttribute("aria-hidden", "true");
    expect(block.style.inlineSize).toBe("120px");
    expect(block.style.blockSize).toBe("1rem");
  });

  it("renders a density-aware card skeleton", () => {
    const { container } = render(<CardSkeleton density="compact" />);
    expect(
      container.querySelector(".dh-card-skeleton--compact"),
    ).not.toBeNull();
  });

  it("renders the requested number of card skeletons in a collection", () => {
    const { container } = render(<CollectionSkeleton count={3} />);
    expect(container.querySelectorAll(".dh-card-skeleton")).toHaveLength(3);
    // The whole ghost group is hidden from assistive tech.
    expect(container.querySelector(".dh-collection-skeleton")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("renders at least one card skeleton even for a non-positive count", () => {
    const { container } = render(<CollectionSkeleton count={0} />);
    expect(
      container.querySelectorAll(".dh-card-skeleton").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("renders a pane skeleton", () => {
    const { container } = render(<PaneSkeleton />);
    expect(container.querySelector(".dh-pane-skeleton")).not.toBeNull();
  });
});
