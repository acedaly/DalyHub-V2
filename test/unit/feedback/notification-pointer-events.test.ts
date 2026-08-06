/**
 * DS-10 / DEBT-38 — regression guard for the notification region's pointer contract.
 *
 * The feedback region is `position: fixed` over the bottom-right of every page —
 * exactly where a record's lifecycle controls (Archive / Restore / Delete) sit.
 * Before this guard, the region's dismiss-all row and every toast surface carried
 * `pointer-events: auto` across their full width, so a stack of transient
 * confirmations silently absorbed the next click aimed at the page beneath it.
 *
 * The contract is: NOTHING in the region takes pointer input except its real
 * controls. This is a source-level guard on that rule set; the behaviour itself is
 * proven by hit-testing in a real browser in `e2e/feedback.spec.ts`, and end to end
 * through the Reviews archive/restore journey in `e2e/reviews.spec.ts`.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const feedbackCss = readFileSync(
  path.join(process.cwd(), "app/styles/feedback.css"),
  "utf8",
);

/** Declarations of the first rule whose selector list matches exactly. */
function ruleBody(selector: string): string {
  const re = new RegExp(
    `(?:^|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
    "m",
  );
  const match = re.exec(feedbackCss);
  return match ? match[1] : "";
}

/** Every selector that must be click-through, and every one that must not be. */
const CLICK_THROUGH = [".dh-feedback", ".dh-feedback__toolbar", ".dh-toast"];
const INTERACTIVE = [
  ".dh-feedback__dismiss-all",
  ".dh-toast__action",
  ".dh-toast__close",
];

describe("notification region pointer contract (DEBT-38)", () => {
  for (const selector of CLICK_THROUGH) {
    it(`${selector} never absorbs pointer input`, () => {
      const body = ruleBody(selector);
      expect(body, `${selector} rule should exist`).not.toBe("");
      expect(body).toMatch(/pointer-events:\s*none/);
      expect(body).not.toMatch(/pointer-events:\s*auto/);
    });
  }

  for (const selector of INTERACTIVE) {
    it(`${selector} opts back in, so the control stays operable`, () => {
      expect(ruleBody(selector)).toMatch(/pointer-events:\s*auto/);
    });
  }

  it("declares no other pointer-events:auto in the region", () => {
    // Any future `pointer-events: auto` must be a deliberate control, listed
    // above — otherwise it is a new way for the stack to eat a click.
    const optIns = feedbackCss.match(/pointer-events:\s*auto/g) ?? [];
    expect(optIns).toHaveLength(INTERACTIVE.length);
  });

  it("anchors the stack above the FAB band, not inside it", () => {
    // The region overlays content on a phone too, and the bottom-right corner it
    // occupies is also the floating action button's. Overlapping a 56px control
    // leaves it a sliver of unobscured height, which the target-size audit fails
    // (e2e/touch-targets.spec.ts). `--app-fab-band` is the shared expression: it
    // folds in the phone navigation bar AND the home indicator's safe-area inset
    // (see `--app-bottomnav-height` in shell.css), so the region clears the bar,
    // the indicator and the FAB in one term — and collapses to the FAB's own band
    // on desktop, where the navigation bar height is `0px`.
    expect(ruleBody(".dh-feedback")).toMatch(
      /bottom:\s*calc\([^;]*--app-fab-band/,
    );
    // Both the desktop rule and the phone override, so neither can drift back
    // over the button on its own.
    const anchored = feedbackCss.match(/bottom:\s*calc\([^;]*--app-fab-band/g);
    expect(anchored).toHaveLength(2);
  });
});
