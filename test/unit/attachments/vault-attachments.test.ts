/**
 * V2.11 FILE-03 — where a file lands in the vault, and what a hostile name
 * cannot do to it.
 *
 * The structured archive names entries by attachment ID, so a filename never
 * reaches a path there at all. The VAULT is the opposite by design — it exists
 * to be opened by a person in a tool that is not DalyHub, so the owner's own
 * filename IS the path — and that makes it the one place in this release where a
 * filename is laid out on a filesystem.
 *
 * So every hostile name the release names is asserted here: a traversal, an
 * absolute path, a Windows separator, a reserved device name, a name that is
 * nothing but dots, a duplicate, a very long one, Unicode and emoji. None may
 * escape its folder, overwrite a sibling, or produce a name a filesystem
 * refuses — and the ones that are merely unusual rather than dangerous must
 * survive READABLE, because a vault of mangled filenames is a worse export.
 */

import { describe, expect, it } from "vitest";

import {
  VAULT_FILES_FOLDER,
  buildVaultAttachmentIndex,
} from "~/platform/export/vault/vault-attachments";
import { buildVaultFilenameIndex } from "~/platform/export/vault/vault-filenames";
import type { SnapshotAttachment } from "~/kernel/export";

const OWNER = "e-owner";
const OTHER = "e-other";

const records = buildVaultFilenameIndex([
  { id: OWNER, title: "Hilux", folder: "Assets" },
  { id: OTHER, title: "Camper", folder: "Assets" },
]);

function attachment(
  id: string,
  filename: string,
  ownerEntityId = OWNER,
): SnapshotAttachment {
  return {
    id,
    ownerEntityId,
    filename,
    mediaType: "application/pdf",
    byteSize: 10,
    checksumSha256: "a".repeat(64),
    uploadOperationId: `op-${id}`,
    uploadedBy: null,
    createdAt: "2026-09-06T00:00:00.000Z",
  };
}

function place(...rows: readonly SnapshotAttachment[]) {
  return buildVaultAttachmentIndex(rows, records);
}

function pathOf(id: string, ...rows: readonly SnapshotAttachment[]): string {
  return place(...rows).get(id)!.path;
}

describe("a file lands beside its record", () => {
  it("is filed under Files/<folder>/<record>/<filename>", () => {
    expect(pathOf("a1", attachment("a1", "receipt.pdf"))).toBe(
      `${VAULT_FILES_FOLDER}/Assets/Hilux/receipt.pdf`,
    );
  });

  it("follows its record's own collision suffix", () => {
    const colliding = buildVaultFilenameIndex([
      { id: OWNER, title: "Hilux", folder: "Assets" },
      { id: OTHER, title: "Hilux", folder: "Assets" },
    ]);
    const located = buildVaultAttachmentIndex(
      [attachment("a1", "receipt.pdf"), attachment("a2", "receipt.pdf", OTHER)],
      colliding,
    );
    // Two records called Hilux get two suffixed folders, so the two identically
    // named files do not collide at all.
    expect(located.get("a1")!.path).not.toBe(located.get("a2")!.path);
    expect(located.get("a1")!.filename).toBe("receipt.pdf");
    expect(located.get("a2")!.filename).toBe("receipt.pdf");
  });

  it("skips an attachment whose owner is not in the vault", () => {
    expect(place(attachment("a1", "x.pdf", "not-a-record")).size).toBe(0);
  });
});

describe("a hostile filename cannot escape its folder", () => {
  const hostile: readonly [string, string][] = [
    ["../../secret.pdf", "traversal"],
    ["/absolute.pdf", "absolute path"],
    ["..\\windows.pdf", "windows separator"],
    ["a/b/c.pdf", "embedded separators"],
    ["..", "bare dots"],
    [".", "single dot"],
    ["CON.pdf", "a Windows device name"],
    ["  spaced  .pdf", "outer whitespace"],
    ["trailing...", "trailing dots"],
  ];

  for (const [filename, why] of hostile) {
    it(`contains ${why}`, () => {
      const path = pathOf("a1", attachment("a1", filename));
      const prefix = `${VAULT_FILES_FOLDER}/Assets/Hilux/`;
      // Inside its folder, and exactly one level deep.
      expect(path.startsWith(prefix)).toBe(true);
      const name = path.slice(prefix.length);
      /*
       * The property that matters is that the name is ONE PATH SEGMENT. A
       * literal `..` surviving INSIDE a name (`-..-secret.pdf`, which is what
       * `../../secret.pdf` becomes once the separators are gone) is a perfectly
       * ordinary filename and not a traversal: traversal needs a separator, and
       * there is none left. Asserting the segment is what asserts the safety;
       * asserting the absence of two dots would only assert cosmetics.
       */
      expect(name).not.toContain("/");
      expect(name).not.toContain("\\");
      expect(name).not.toBe("..");
      expect(name).not.toBe(".");
      // Never a name a filesystem refuses.
      expect(name.length).toBeGreaterThan(0);
      expect(name.startsWith(".")).toBe(false);
      expect(name.endsWith(".")).toBe(false);
      expect(name.endsWith(" ")).toBe(false);
    });
  }

  it("keeps a Windows device name usable rather than refusing it", () => {
    // `CON.pdf` cannot be created on Windows at all, so the vault's own stem
    // rule prefixes it — the same treatment a record titled `CON` gets.
    const name = pathOf("a1", attachment("a1", "CON.pdf")).split("/").pop()!;
    expect(name.toLowerCase()).not.toBe("con.pdf");
    expect(name.endsWith(".pdf")).toBe(true);
  });
});

describe("names that are merely unusual stay readable", () => {
  it("keeps Unicode, an em dash and an emoji", () => {
    expect(pathOf("a1", attachment("a1", "Café — rego 🧾.pdf"))).toBe(
      `${VAULT_FILES_FOLDER}/Assets/Hilux/Café — rego 🧾.pdf`,
    );
  });

  it("keeps the extension, and keeps it lowercase", () => {
    expect(pathOf("a1", attachment("a1", "Receipt.PDF")).endsWith(".pdf")).toBe(
      true,
    );
  });

  it("bounds a very long name without losing its extension", () => {
    const name = pathOf("a1", attachment("a1", `${"receipt ".repeat(40)}.pdf`))
      .split("/")
      .pop()!;
    expect(name.length).toBeLessThan(120);
    expect(name.endsWith(".pdf")).toBe(true);
  });

  it("handles a file with no extension at all", () => {
    expect(pathOf("a1", attachment("a1", "LICENCE"))).toBe(
      `${VAULT_FILES_FOLDER}/Assets/Hilux/LICENCE`,
    );
  });
});

describe("two files with the same name on ONE record", () => {
  it("suffixes every member of the colliding group", () => {
    const located = place(
      attachment("a1", "receipt.pdf"),
      attachment("a2", "receipt.pdf"),
      attachment("a3", "warranty.pdf"),
    );
    const first = located.get("a1")!;
    const second = located.get("a2")!;
    const alone = located.get("a3")!;

    expect(first.path).not.toBe(second.path);
    // BOTH are suffixed, not just the later one — so a filename is a function
    // of its own attachment rather than of what else happens to exist, and two
    // exports of unchanged data place every file identically.
    expect(first.filename).toMatch(/^receipt \([0-9a-z]+\)\.pdf$/i);
    expect(second.filename).toMatch(/^receipt \([0-9a-z]+\)\.pdf$/i);
    // The one that does not collide keeps its plain name.
    expect(alone.filename).toBe("warranty.pdf");
  });

  it("is deterministic — the same input places files identically twice", () => {
    const rows = [
      attachment("a2", "receipt.pdf"),
      attachment("a1", "receipt.pdf"),
    ];
    const once = place(...rows);
    const twice = place(...[...rows].reverse());
    expect(once.get("a1")!.path).toBe(twice.get("a1")!.path);
    expect(once.get("a2")!.path).toBe(twice.get("a2")!.path);
  });

  it("treats a case-only difference as a collision", () => {
    // macOS and Windows are case-insensitive; `Receipt.pdf` and `receipt.pdf`
    // would overwrite each other there.
    const located = place(
      attachment("a1", "Receipt.pdf"),
      attachment("a2", "receipt.pdf"),
    );
    expect(located.get("a1")!.path.toLowerCase()).not.toBe(
      located.get("a2")!.path.toLowerCase(),
    );
  });
});
