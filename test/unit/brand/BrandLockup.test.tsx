/**
 * BRAND-01 — the full product lockup.
 *
 * The claim these tests defend is "the wordmark and the tagline are LIVE TEXT,
 * not artwork". That is not a stylistic preference: baked-in type does not scale
 * with the owner's OS text size, does not reflow, is invisible to a screen reader
 * and to find-in-page, and cannot follow a theme. If someone ever replaces the
 * words with an image, every assertion below fails.
 *
 * The rest pins the document-outline contract — the lockup must be able to sit
 * above a page's own `h1` without becoming a second one.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BrandLockup, PRODUCT_NAME, PRODUCT_TAGLINE } from "~/shared/brand";

describe("BrandLockup", () => {
  it("renders the product name and tagline as text", () => {
    render(<BrandLockup />);
    expect(screen.getByText(PRODUCT_NAME)).toBeInTheDocument();
    expect(screen.getByText(PRODUCT_TAGLINE)).toBeInTheDocument();
  });

  it("states the approved wording exactly", () => {
    // One spelling, one place. A surface that hand-writes "Dalyhub" or drops the
    // full stops in the tagline has stopped using the constants.
    expect(PRODUCT_NAME).toBe("DalyHub");
    expect(PRODUCT_TAGLINE).toBe("Your life. Connected.");
  });

  it("renders NO image — the words are text and the mark is inline SVG", () => {
    const { container } = render(<BrandLockup />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("adds no heading by default, so a page keeps its own outline", () => {
    render(
      <>
        <BrandLockup />
        <h1>About DalyHub</h1>
      </>,
    );
    expect(screen.getAllByRole("heading")).toHaveLength(1);
  });

  it("becomes a heading only when a surface asks for one", () => {
    render(<BrandLockup as="h1" />);
    expect(
      screen.getByRole("heading", { level: 1, name: PRODUCT_NAME }),
    ).toBeInTheDocument();
  });

  it("omits the tagline in the wordmark variant", () => {
    render(<BrandLockup variant="wordmark" />);
    expect(screen.getByText(PRODUCT_NAME)).toBeInTheDocument();
    expect(screen.queryByText(PRODUCT_TAGLINE)).toBeNull();
  });

  it("keeps the mark decorative", () => {
    // The product name is beside it as real text, so naming the mark too would
    // make a screen reader announce "DalyHub DalyHub".
    const { container } = render(<BrandLockup />);
    expect(container.querySelector(".dh-brand-lockup__mark")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
