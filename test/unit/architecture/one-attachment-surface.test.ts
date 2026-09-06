import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * V2.11 FILE-01 — the ONE attachment surface, as a registry rather than a
 * convention.
 *
 * The product rule the whole release rests on is that there is **one attachment
 * primitive**, and the failure mode is never a broken test. It is an
 * `AssetAttachmentList`, an `ObligationFiles`, a `MeetingDocumentRow` or a
 * Finance receipt widget appearing eight months from now because the shared one
 * was slightly inconvenient for a surface with a different shape — which is
 * precisely what happened to the Task row before V2.8 CONV-01 pinned it, and to
 * the obligation row before V2.10 LIFE-02 did.
 *
 * So this states what is true today and fails when it stops being:
 *
 *   1. No MODULE defines an attachment row, list, picker or section component of
 *      its own. Consumers import the shared one.
 *   2. No MODULE fetches an attachment endpoint directly. Every upload, list and
 *      delete goes through `~/shared/attachments`.
 *   3. `attachments` and `attachment_object_purges` are written by exactly ONE
 *      adapter. A second writer is a second authority, whatever it is called.
 *   4. The object store is constructed in exactly one place, and no module
 *      resolves the `ATTACHMENTS` binding itself.
 *   5. A `SerializedAttachment` never carries a storage key or a checksum — the
 *      two facts a surface must not receive.
 *   6. No attachment CSS lives in a module stylesheet.
 *
 * Read as source with comments stripped, so prose about a rule can neither
 * satisfy nor trip it. The technique is CONV-01's
 * `test/unit/task-record/shared-row-consumers.test.ts`.
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

const MODULE_FILES = filesUnder(path.join(ROOT, "app", "modules"));
const APP_FILES = filesUnder(path.join(ROOT, "app"));

function relative(file: string): string {
  return path.relative(ROOT, file);
}

describe("no module builds an attachment component of its own", () => {
  it("declares no attachment row, list, picker or section", () => {
    /*
     * A component DECLARATION, not a usage: `function AssetAttachmentList(` or
     * `const MeetingFileRow = (`. Importing and rendering the shared one is the
     * whole point and must stay free.
     */
    const declaration =
      /(?:function|const|class)\s+\w*(?:Attachment|File|Document)\w*(?:Row|List|Picker|Section|Upload|Uploader|Dropzone)\b/;
    const offenders = MODULE_FILES.filter((file) =>
      declaration.test(code(readFileSync(file, "utf8"))),
    ).map(relative);
    expect(offenders).toEqual([]);
  });

  it("declares no attachment stylesheet block", () => {
    const offenders = filesUnder(path.join(ROOT, "app", "styles"), [".css"])
      .filter((file) => path.basename(file) !== "attachments.css")
      .filter((file) => /\.dh-attachment/.test(readFileSync(file, "utf8")))
      .map(relative);
    expect(offenders).toEqual([]);
  });
});

describe("no module reaches the attachment endpoints directly", () => {
  it("fetches `/attachments` from nowhere but the shared client", () => {
    const offenders = APP_FILES.filter((file) => {
      const relativePath = relative(file);
      // The shared client owns the fetches; the routes ARE the endpoints.
      if (relativePath.startsWith("app/shared/attachments/")) return false;
      if (relativePath.startsWith("app/routes/attachment")) return false;
      return /fetch\(\s*[`"']\/attachments/.test(
        code(readFileSync(file, "utf8")),
      );
    }).map(relative);
    expect(offenders).toEqual([]);
  });
});

describe("one writer, one store", () => {
  it("writes `attachments` from exactly one adapter", () => {
    const writers = APP_FILES.filter((file) =>
      /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+attachments\b/i.test(
        code(readFileSync(file, "utf8")),
      ),
    ).map(relative);
    expect(writers).toEqual([
      "app/platform/storage/d1/d1-attachment-repository.ts",
    ]);
  });

  it("writes the purge ledger from exactly one adapter", () => {
    const writers = APP_FILES.filter((file) =>
      /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+attachment_object_purges\b/i.test(
        code(readFileSync(file, "utf8")),
      ),
    ).map(relative);
    expect(writers).toEqual([
      "app/platform/storage/d1/d1-attachment-repository.ts",
    ]);
  });

  it("resolves the ATTACHMENTS binding in exactly one place", () => {
    /*
     * `env.ATTACHMENTS` is the binding read. It belongs to the R2 adapter and to
     * nothing else: a module that resolved its own binding would be a module
     * that could bypass the workspace-scoped key derivation.
     */
    const readers = APP_FILES.filter((file) =>
      /\benv\.ATTACHMENTS\b|\bATTACHMENTS\?\s*:/.test(
        code(readFileSync(file, "utf8")),
      ),
    ).map(relative);
    expect(readers.sort()).toEqual([
      "app/platform/attachments/r2-object-store.ts",
      "app/platform/workspaces/composition.ts",
    ]);
  });

  it("constructs an R2 object store in exactly one place", () => {
    const constructors = APP_FILES.filter((file) =>
      /new\s+R2|createR2ObjectStore\s*\(/.test(
        code(readFileSync(file, "utf8")),
      ),
    )
      .map(relative)
      .filter((file) => file !== "app/platform/attachments/index.ts");
    expect(constructors).toEqual([
      "app/platform/attachments/r2-object-store.ts",
    ]);
  });
});

describe("what a surface receives", () => {
  it("has no storage key and no checksum on the serialised shape", () => {
    const source = code(
      readFileSync(
        path.join(ROOT, "app", "kernel", "attachments", "attachment.ts"),
        "utf8",
      ),
    );
    const serialised = source.slice(
      source.indexOf("export interface SerializedAttachment"),
    );
    const body = serialised.slice(0, serialised.indexOf("\n}"));
    expect(body).not.toMatch(/storageKey/);
    expect(body).not.toMatch(/checksum/i);
    expect(body).not.toMatch(/workspaceId/);
    expect(body).not.toMatch(/uploadOperationId/);
    expect(body).not.toMatch(/uploadedBy/);
  });
});

describe("every consumer uses the shared surface", () => {
  it("names the modules that carry evidence, so adding one is a decision", () => {
    /*
     * The registry. A module that starts rendering the shared section without
     * appearing here fails this test — which is the prompt to decide whether it
     * SHOULD carry evidence, not merely to update a list.
     *
     * Goals and Tasks are deliberately absent, and their absence is the
     * decision: a Goal is a statement of an outcome and a Task is a unit of
     * action, so the paper that proves either belongs to the Project or the
     * Obligation that does the work. Adding them later is a product decision
     * with a place to be recorded rather than an oversight to be discovered.
     */
    const consumers = MODULE_FILES.filter((file) =>
      /AttachmentsSection|attachmentsTab/.test(
        code(readFileSync(file, "utf8")),
      ),
    )
      .map((file) => relative(file).split("/")[2]!)
      .filter((module, index, all) => all.indexOf(module) === index)
      .sort();

    expect(consumers).toEqual([
      "assets",
      "meetings",
      "notes",
      "obligations",
      "people",
      "projects",
    ]);
  });
});
