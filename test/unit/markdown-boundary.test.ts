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
const ALLOWED = path.join("shared", "markdown", "MarkdownContent.tsx");

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

    expect(offenders).toEqual([ALLOWED]);
  });
});
