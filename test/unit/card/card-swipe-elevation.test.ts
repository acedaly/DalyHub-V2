/**
 * DS-04 (TODAY-06) — regression guard for the swipe wrapper's elevation.
 *
 * The swipe wrapper clips the moving surface + tray with `overflow: hidden`. An
 * element never clips its OWN box-shadow (overflow only clips descendants), so the
 * card elevation MUST live on the wrapper — never on the clipped `.dh-card` inside,
 * whose shadow would be swallowed by the clip, silently flattening every Today task
 * card (including on desktop, where swipe is inactive). This source-level guard
 * prevents that structure from returning; the visible shadow is additionally proven
 * in a real browser by `e2e/today.spec.ts`.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const cardCss = readFileSync(
  path.join(process.cwd(), "app/styles/card.css"),
  "utf8",
);

/** Extract the declarations of the first rule whose selector list matches exactly. */
function ruleBody(selector: string): string {
  const re = new RegExp(
    `${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
  );
  const match = re.exec(cardCss);
  return match ? match[1] : "";
}

describe("swipe wrapper elevation (regression)", () => {
  it("clips the surface with overflow:hidden on the wrapper", () => {
    expect(ruleBody(".dh-card-swipe")).toMatch(/overflow:\s*hidden/);
  });

  it("puts the card elevation shadow on the WRAPPER (not the clipped article)", () => {
    // The wrapper owns the resting shadow so it is not clipped by its own overflow.
    expect(ruleBody(".dh-card-swipe")).toMatch(
      /box-shadow:\s*var\(--dh-shadow/,
    );
    // And a hover elevation on the wrapper.
    expect(cardCss).toMatch(
      /\.dh-card-swipe:hover\s*\{[^}]*box-shadow:\s*var\(--dh-shadow/,
    );
  });

  it("suppresses the clipped article's own shadow so it never renders clipped", () => {
    // The `.dh-card` inside the wrapper must not paint a shadow that the clip eats.
    expect(cardCss).toMatch(
      /\.dh-card-swipe\s*>\s*\.dh-card[^{]*\{[^}]*box-shadow:\s*none/,
    );
  });
});
