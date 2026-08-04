/**
 * BRAND-01 — the in-application brand mark.
 *
 * The claim worth testing is not "an SVG renders". It is that the glyph in the
 * sidebar is the SAME DRAWING as the icon on a home screen: both come from
 * `scripts/icons/geometry.mjs`, one through the rasteriser and one through the
 * generated module this component consumes. So these tests compare the rendered
 * DOM against the canonical geometry directly.
 *
 * The rest pins the contract the mark has to keep with the icon set it lives in:
 * decorative unless named, sized in `em` like every other icon, and carrying its
 * own gradient rather than `currentColor` — because a fixed brand identity must
 * not change colour with the theme it happens to sit on.
 */

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  BRAND_MARK_SHAPES,
  BRAND_MARK_VIEWBOX,
} from "~/shared/icons/brand-mark.generated";
import { BrandMark } from "~/shared/icons";

import { CANVAS, markShapes } from "../../../scripts/icons/geometry.mjs";

type CanonicalShape = { kind: string; r?: number; width?: number };

describe("the generated geometry", () => {
  it("is the canonical mark, shape for shape", () => {
    // The drift guard. If someone edits the generated module by hand, or
    // regenerates the icons without it (or the other way round), this fails
    // alongside `pnpm run icons:check`.
    const canonical = markShapes() as CanonicalShape[];
    expect(BRAND_MARK_SHAPES).toHaveLength(canonical.length);
    canonical.forEach((shape, index) => {
      const rendered = BRAND_MARK_SHAPES[index];
      if (shape.kind === "circle") {
        expect(rendered.kind).toBe("disc");
        if (rendered.kind === "disc") {
          expect(rendered.r).toBeCloseTo(shape.r as number, 2);
        }
      } else {
        expect(rendered.kind).toBe("stroke");
        if (rendered.kind === "stroke") {
          expect(rendered.width).toBeCloseTo(shape.width as number, 2);
        }
      }
    });
  });

  it("uses the canonical canvas as its viewBox", () => {
    expect(BRAND_MARK_VIEWBOX).toBe(`0 0 ${CANVAS} ${CANVAS}`);
  });

  it("carries the D and the three-node network", () => {
    // One arc (the D's bowl), two bars (top and stem), three spokes, and four
    // discs (junction + three nodes).
    expect(
      BRAND_MARK_SHAPES.filter((shape) => shape.kind === "disc"),
    ).toHaveLength(4);
    expect(
      BRAND_MARK_SHAPES.filter((shape) => shape.kind === "stroke"),
    ).toHaveLength(6);
  });
});

describe("BrandMark", () => {
  it("is decorative by default", () => {
    // Every surface that shows it writes "DalyHub" beside it, so an accessible
    // name here would make a screen reader say the product name twice.
    const { container } = render(<BrandMark />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).not.toHaveAttribute("role");
    expect(container.querySelector("title")).toBeNull();
  });

  it("takes an accessible name when the mark stands alone", () => {
    const { container } = render(<BrandMark title="DalyHub" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("role", "img");
    expect(svg).toHaveAttribute("aria-label", "DalyHub");
    expect(container.querySelector("title")?.textContent).toBe("DalyHub");
  });

  it("follows the surrounding font size, like every other icon", () => {
    const { container } = render(<BrandMark />);
    expect(container.querySelector("svg")).toHaveAttribute("width", "1em");
  });

  it("paints the brand gradient rather than currentColor", () => {
    const { container } = render(<BrandMark />);
    const stops = [...container.querySelectorAll("stop")].map((stop) =>
      stop.getAttribute("stop-color"),
    );
    expect(stops).toEqual(["#1c5ce0", "#0e9268"]);
    for (const disc of container.querySelectorAll("circle")) {
      expect(disc.getAttribute("fill")).toMatch(/^url\(#dh-brand-mark-/);
    }
  });

  it("gives each instance its own gradient id", () => {
    // Two marks on one document sharing a hard-coded id would make the second
    // silently reference the first one's paint server, which breaks the moment
    // one of them unmounts.
    const { container } = render(
      <>
        <BrandMark />
        <BrandMark />
      </>,
    );
    const ids = [...container.querySelectorAll("linearGradient")].map((node) =>
      node.getAttribute("id"),
    );
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it("renders every canonical shape and no tile", () => {
    const { container } = render(<BrandMark />);
    expect(container.querySelectorAll("circle")).toHaveLength(4);
    expect(container.querySelectorAll("path")).toHaveLength(6);
    // A rounded square would be a `<rect>`. The in-app form has none.
    expect(container.querySelectorAll("rect")).toHaveLength(0);
  });
});
