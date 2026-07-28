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

  it("keeps the mobile stack bottom-anchored inside the safe area", () => {
    // The region overlays content on a phone too; the safe-area inset keeps it
    // clear of the home indicator rather than pushing it further over controls.
    expect(feedbackCss).toMatch(/env\(safe-area-inset-bottom,\s*0px\)/);
  });
});
