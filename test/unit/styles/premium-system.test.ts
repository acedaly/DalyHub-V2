import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const appCss = readFileSync(join(process.cwd(), "app", "app.css"), "utf8");
const premiumCss = readFileSync(
  join(process.cwd(), "app", "styles", "premium.css"),
  "utf8",
);

describe("PREMIUM-01 shared product finish", () => {
  it("loads after modules and before print", () => {
    const premium = appCss.indexOf('@import "./styles/premium.css"');
    const analytics = appCss.indexOf('@import "./styles/analytics.css"');
    const print = appCss.indexOf('@import "./styles/print.css"');

    expect(premium).toBeGreaterThan(analytics);
    expect(premium).toBeLessThan(print);
  });

  it("stays shared rather than accumulating module exceptions", () => {
    for (const privatePrefix of [
      ".dh-projects",
      ".dh-goals",
      ".dh-areas",
      ".dh-notes",
      ".dh-people",
      ".dh-assets",
      ".dh-reviews",
      ".dh-analytics",
    ]) {
      expect(premiumCss).not.toContain(privatePrefix);
    }
  });

  it("does not define a second token layer or author colour values", () => {
    expect(premiumCss).not.toMatch(/(^|[^\w-(])--dh-[\w-]+\s*:/m);
    expect(premiumCss).not.toMatch(/#[\da-f]{3,8}\b/i);
  });
});
