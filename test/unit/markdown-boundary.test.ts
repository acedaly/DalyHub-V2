/**
 * FND-08 architecture test — one controlled HTML sink.
 *
 * `dangerouslySetInnerHTML` is permitted in EXACTLY ONE place: the shared
 * `MarkdownContent` rendering boundary (ADR-015 §4.5, §15). This test scans all
 * application source and fails if the sink appears anywhere else, so a future
 * change cannot quietly introduce a second, unreviewed HTML injection point.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SINK = "dangerouslySetInnerHTML";
const APP_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "app",
);
/**
 * The sink is permitted in exactly two places, and the second is not a markdown
 * sink at all:
 *
 *   - the shared `MarkdownContent` boundary, which is what this test exists for;
 *   - PWA-11's `/offline` route, which inlines a fixed, source-literal one-line
 *     script to normalise the launch url before hydration. It interpolates
 *     NOTHING — there is no value from a request, a loader or a record anywhere
 *     near it — so it cannot carry injected content, and it has to be inline
 *     because a module would be a network fetch on the one page whose entire
 *     premise is that the network is gone.
 *
 * Anything else appearing here is a real second HTML injection point.
 */
const ALLOWED = [
  path.join("routes", "offline.tsx"),
  path.join("shared", "markdown", "MarkdownContent.tsx"),
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("dangerouslySetInnerHTML boundary", () => {
  it("appears only in the shared MarkdownContent component", () => {
    const offenders = sourceFiles(APP_DIR)
      .filter((file) => readFileSync(file, "utf8").includes(SINK))
      .map((file) => path.relative(APP_DIR, file));

    expect(offenders.sort()).toEqual(ALLOWED);
  });
});
