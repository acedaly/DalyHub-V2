/**
 * RELEASE-01 — build metadata agrees with the running application.
 *
 * `app/lib/version.ts` stays the ONE authority the Worker reads: the bundle has no
 * reliable way to read `package.json` at runtime, and adding one would create a
 * second authority that can silently disagree. But `package.json` is what build
 * tooling, tarballs and `pnpm` report, so a release where the two differ still has
 * two answers to "which version is this?".
 *
 * This test is the seam that keeps them equal without a runtime read: the constant
 * is authoritative, and `package.json` must match it. Bumping one and forgetting
 * the other fails here rather than at a production incident.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { APP_VERSION } from "~/lib/version";

const packageJson: { readonly version?: unknown; readonly name?: unknown } =
  JSON.parse(
    readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
  ) as never;

describe("RELEASE-01 package metadata", () => {
  it("declares the SAME version as the application authority", () => {
    expect(packageJson.version).toBe(APP_VERSION);
  });

  it("is not the pre-release placeholder", () => {
    expect(packageJson.version).not.toBe("0.0.0");
  });
});
