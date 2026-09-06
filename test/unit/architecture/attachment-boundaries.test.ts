import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { EVIDENCE_KINDS } from "~/kernel/ai";
import {
  ATTACHMENT_ACTIVITY_TYPES,
  ATTACHMENT_ADDED,
  ATTACHMENT_REMOVED,
} from "~/kernel/attachments";

/**
 * V2.11 — the three boundaries the release promises, asserted rather than
 * described.
 *
 * Each of these is a sentence in `ROADMAP_V2_11.md` and in ADR-119 decision 9,
 * and each of them is the kind of promise that decays silently. Nobody removes
 * "AI cannot read attachments" on purpose; someone adds an evidence kind, or a
 * retrieval path, or a filename to a payload, eighteen months from now, and the
 * document goes on saying the old thing.
 *
 *   1. **AI.** Attachments are not an evidence kind, and no AI path reads the
 *      attachments table or the object store. Keeping bytes away from a model
 *      is NOT ADDING A KIND — the vocabulary is closed, so the assertion is
 *      that it stays closed.
 *   2. **Search.** There is no attachment search provider, so a filename cannot
 *      reach an empty-query recency list.
 *   3. **Activity.** No attachment event payload carries a filename, a storage
 *      key or a checksum.
 *
 * Read as source with comments stripped, so prose about a rule can neither
 * satisfy nor trip it.
 */

const ROOT = process.cwd();

function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function filesUnder(dir: string, extensions = [".ts", ".tsx"]): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesUnder(path.join(dir, entry.name), extensions)
      : extensions.some((ext) => entry.name.endsWith(ext))
        ? [path.join(dir, entry.name)]
        : [],
  );
}

const AI_FILES = [
  ...filesUnder(path.join(ROOT, "app", "kernel", "ai")),
  ...filesUnder(path.join(ROOT, "app", "platform", "ai")),
  ...filesUnder(path.join(ROOT, "app", "modules", "ai")),
];

describe("the AI platform cannot reach an attachment", () => {
  it("has no attachment evidence kind", () => {
    /*
     * The vocabulary is a closed `as const` tuple, and every evidence item is
     * built from a named repository. There is therefore nothing to filter: an
     * attachment is not a shape the evidence layer can hold.
     */
    expect(EVIDENCE_KINDS as readonly string[]).not.toContain("attachment");
    expect(EVIDENCE_KINDS as readonly string[]).not.toContain("file");
    expect(EVIDENCE_KINDS as readonly string[]).not.toContain("document");
  });

  it("reads no attachment repository, table or object store anywhere", () => {
    const offenders: string[] = [];
    for (const file of AI_FILES) {
      const source = code(readFileSync(file, "utf8"));
      if (
        /\bscope\.attachments\b/.test(source) ||
        /\bFROM\s+attachments\b/i.test(source) ||
        /\bATTACHMENTS\b/.test(source) ||
        /~\/kernel\/attachments/.test(source) ||
        /~\/platform\/attachments/.test(source)
      ) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has no attachment-shaped prompt or schema field", () => {
    /*
     * Belt to the braces above: even a FIELD NAME suggesting a file would be a
     * place a future change could start putting one. V3 may add a sanitising
     * extraction layer; when it does, this test is the thing it has to change
     * deliberately.
     */
    const offenders: string[] = [];
    for (const file of AI_FILES) {
      const source = code(readFileSync(file, "utf8"));
      if (
        /\battachmentContent\b|\bfileContent\b|\bdocumentText\b/.test(source)
      ) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("Search never carries a filename", () => {
  it("registers no attachment search provider", () => {
    const manifests = readdirSync(path.join(ROOT, "app", "modules"), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        path.join(ROOT, "app", "modules", entry.name, "module.ts"),
      )
      .filter((file) => {
        try {
          readFileSync(file, "utf8");
          return true;
        } catch {
          return false;
        }
      });

    const offenders = manifests
      .filter((file) => /attachment/i.test(code(readFileSync(file, "utf8"))))
      .map((file) => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  it("has no search executor that reads attachments", () => {
    const searchFiles = filesUnder(path.join(ROOT, "app", "modules")).filter(
      (file) => path.basename(file) === "search.ts",
    );
    const offenders = searchFiles
      .filter((file) =>
        /\battachments\b/i.test(code(readFileSync(file, "utf8"))),
      )
      .map((file) => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });
});

describe("an Activity payload carries no filename", () => {
  it("appends exactly two event types", () => {
    expect(ATTACHMENT_ACTIVITY_TYPES).toEqual([
      ATTACHMENT_ADDED,
      ATTACHMENT_REMOVED,
    ]);
  });

  it("builds its payload from the media CLASS and nothing else", () => {
    /*
     * The repository is the only place an attachment event is constructed, and
     * `#kindLabel` is the only value it puts in a payload. A payload built from
     * `filename`, `storageKey` or `checksumSha256` would be this test's finding
     * — and it is the finding that matters, because a filename
     * (`MRI results.pdf`) is at least as revealing as the amount the Assets and
     * Obligations providers have refused to print since ASSET-03.
     */
    const source = code(
      readFileSync(
        path.join(
          ROOT,
          "app",
          "platform",
          "storage",
          "d1",
          "d1-attachment-repository.ts",
        ),
        "utf8",
      ),
    );
    const payloads = [
      ...source.matchAll(/\{\s*kind:\s*this\.#kindLabel\([^)]*\)\s*\}/g),
    ];
    // One for `attachment.added`, one for `attachment.removed`.
    expect(payloads).toHaveLength(2);

    // And no other value reaches an event: the append helper takes exactly the
    // payload it is given, so a filename would have to appear beside `kind`.
    expect(source).not.toMatch(/payload[^;]*filename/);
    expect(source).not.toMatch(/payload[^;]*storageKey/);
    expect(source).not.toMatch(/payload[^;]*checksum/i);
  });

  it("names no filename in the shared activity descriptors", () => {
    const descriptors = filesUnder(
      path.join(ROOT, "app", "shared", "activity-feed"),
    );
    const offenders = descriptors
      .filter((file) =>
        /attachment\.(added|removed)/.test(readFileSync(file, "utf8")),
      )
      .filter((file) => /filename/i.test(code(readFileSync(file, "utf8"))))
      .map((file) => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });
});
