/**
 * DS-04 (TODAY-06) — regression guard for the swipe wrapper's surface treatment.
 *
 * The swipe wrapper clips the moving surface + tray with `overflow: hidden`.
 * In-flow cards are no longer raised surfaces, so neither the wrapper nor the
 * clipped `.dh-card` inside may paint a resting or hover shadow. The focus ring is
 * asserted in the browser suites.
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

describe("swipe wrapper surface treatment (regression)", () => {
  it("clips the surface with overflow:hidden on the wrapper", () => {
    expect(ruleBody(".dh-card-swipe")).toMatch(/overflow:\s*hidden/);
  });

  it("keeps swipe wrappers shadowless at rest and on hover", () => {
    expect(ruleBody(".dh-card-swipe")).toMatch(/box-shadow:\s*none/);
    expect(cardCss).toMatch(
      /\.dh-card-swipe:hover\s*\{[^}]*box-shadow:\s*none/,
    );
  });

  it("suppresses the clipped article’s own shadow so it never renders clipped", () => {
    // The `.dh-card` inside the wrapper must not paint a shadow that the clip eats.
    expect(cardCss).toMatch(
      /\.dh-card-swipe\s*>\s*\.dh-card[^{]*\{[^}]*box-shadow:\s*none/,
    );
  });
});
