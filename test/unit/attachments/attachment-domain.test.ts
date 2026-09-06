/**
 * V2.11 FILE-00 — the pure attachment domain.
 *
 * Everything here is a rule that must hold before a byte is written anywhere:
 * the object key cannot be influenced by a filename, the header cannot be
 * injected into, the allow-list is an allow-list, and the two active-content
 * types are refused rather than defended against.
 *
 * The hostile filenames in `HOSTILE_NAMES` are the release's own list from
 * `ROADMAP_V2_11.md`, and they are asserted against BOTH ends: the key never
 * changes shape, and the header never gains a line.
 */

import { describe, expect, it } from "vitest";

import {
  ATTACHMENT_ACCEPT_ATTRIBUTE,
  ATTACHMENT_MEDIA_TYPES,
  ATTACHMENT_REFUSED_MEDIA_TYPES,
  AttachmentValidationError,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_RECORD,
  MAX_ATTACHMENT_FILENAME_LENGTH,
  asciiFilenameFallback,
  assertDeclaredSizeWithinBound,
  assertRecordHasRoom,
  attachmentMediaType,
  attachmentStorageKey,
  attachmentView,
  attachmentWorkspacePrefix,
  contentDispositionHeader,
  createInMemoryObjectStore,
  filenameExtension,
  formatAttachmentSize,
  keyBelongsToWorkspace,
  matchesSignature,
  normaliseMediaType,
  validateAttachmentFilename,
  validateAttachmentUpload,
  validateUploadOperationId,
  type AttachmentRecord,
} from "~/kernel/attachments";
import { objectStoreContract } from "../../support/object-store-contract";

const PDF_BYTES = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34,
]);
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

/**
 * Names that must not be able to reach a path, a header or a key. Every one is
 * either accepted as an ordinary (if odd) name or refused — never silently
 * rewritten into something the owner cannot find again.
 */
const HOSTILE_NAMES = [
  "../../secret.pdf",
  "/absolute.pdf",
  "..\\windows.pdf",
  "a/b/c.pdf",
  "with\ttab.pdf",
  'quote".pdf',
  "semi;colon.pdf",
  "новый.pdf",
  "🧾 receipt.pdf",
];

describe("the object key cannot be influenced by anything an owner writes", () => {
  it("is built from the workspace and the attachment id, and nothing else", () => {
    expect(
      attachmentStorageKey({
        workspaceId: "ws-1",
        attachmentId: "0198ab-cd",
      }),
    ).toBe("workspaces/ws-1/attachments/0198ab-cd");
  });

  it("has no parameter a filename could reach", () => {
    // The signature is the assertion: there is no `filename` to pass. A test
    // that tried to pass one would not compile, which is the point of stating
    // it here rather than only in a comment.
    const key = attachmentStorageKey({
      workspaceId: "ws-1",
      attachmentId: "att-1",
    });
    for (const name of HOSTILE_NAMES) {
      expect(key).not.toContain(name);
    }
    expect(key.split("/")).toHaveLength(4);
  });

  it("refuses a workspace or attachment id that is not a safe segment", () => {
    for (const bad of ["../other", "ws/1", "ws 1", "", ".hidden", "ws%2f"]) {
      expect(() =>
        attachmentStorageKey({ workspaceId: bad, attachmentId: "att-1" }),
      ).toThrow(AttachmentValidationError);
      expect(() =>
        attachmentStorageKey({ workspaceId: "ws-1", attachmentId: bad }),
      ).toThrow(AttachmentValidationError);
    }
  });

  it("scopes a workspace's objects under one prefix, and says whose a key is", () => {
    const prefix = attachmentWorkspacePrefix("ws-1");
    const mine = attachmentStorageKey({
      workspaceId: "ws-1",
      attachmentId: "att-1",
    });
    const theirs = attachmentStorageKey({
      workspaceId: "ws-2",
      attachmentId: "att-1",
    });
    expect(mine.startsWith(prefix)).toBe(true);
    expect(theirs.startsWith(prefix)).toBe(false);
    expect(keyBelongsToWorkspace(mine, "ws-1")).toBe(true);
    expect(keyBelongsToWorkspace(theirs, "ws-1")).toBe(false);
    // A workspace id that is not a safe segment owns nothing rather than
    // matching by accident.
    expect(keyBelongsToWorkspace(mine, "../ws-1")).toBe(false);
  });

  it("gives two workspaces different keys for the same attachment id", () => {
    expect(
      attachmentStorageKey({ workspaceId: "ws-1", attachmentId: "att-1" }),
    ).not.toBe(
      attachmentStorageKey({ workspaceId: "ws-2", attachmentId: "att-1" }),
    );
  });
});

describe("filenames", () => {
  it("keeps the owner's own name, normalised but not mangled", () => {
    expect(validateAttachmentFilename("Rego renewal — Hilux.pdf")).toBe(
      "Rego renewal — Hilux.pdf",
    );
    expect(validateAttachmentFilename("  Receipt.PDF  ")).toBe("Receipt.PDF");
    // NFC, so a decomposed macOS name and a composed Linux one are one name.
    expect(validateAttachmentFilename("café.pdf")).toBe("café.pdf");
    expect(validateAttachmentFilename("🧾 receipt.pdf")).toBe("🧾 receipt.pdf");
  });

  it("refuses a name that could become a path segment", () => {
    for (const name of [
      "../../secret.pdf",
      "/absolute.pdf",
      "..\\win.pdf",
      "a/b.pdf",
    ]) {
      expect(() => validateAttachmentFilename(name)).toThrow(
        AttachmentValidationError,
      );
    }
  });

  it("refuses a name carrying a control character or a line break", () => {
    for (const name of [
      "a\nb.pdf",
      "a\rb.pdf",
      "a\u0000b.pdf",
      "a\u0007b.pdf",
      "a\u2028b.pdf",
    ]) {
      expect(() => validateAttachmentFilename(name)).toThrow(
        AttachmentValidationError,
      );
    }
  });

  it("refuses an empty name, a bare dot and an over-long one", () => {
    expect(() => validateAttachmentFilename("   ")).toThrow(
      AttachmentValidationError,
    );
    expect(() => validateAttachmentFilename(".")).toThrow(
      AttachmentValidationError,
    );
    expect(() => validateAttachmentFilename("..")).toThrow(
      AttachmentValidationError,
    );
    expect(() =>
      validateAttachmentFilename(
        `${"a".repeat(MAX_ATTACHMENT_FILENAME_LENGTH)}.pdf`,
      ),
    ).toThrow(AttachmentValidationError);
  });

  it("reads an extension, or says there is none", () => {
    expect(filenameExtension("a.PDF")).toBe(".pdf");
    expect(filenameExtension("a.tar.gz")).toBe(".gz");
    expect(filenameExtension("noextension")).toBe("");
    expect(filenameExtension(".hidden")).toBe("");
    expect(filenameExtension("trailing.")).toBe("");
  });
});

describe("Content-Disposition cannot be injected into", () => {
  it("folds every non-printable-ASCII character out of the quoted half", () => {
    expect(asciiFilenameFallback('a"b\\c.pdf')).toBe("a_b_c.pdf");
    expect(asciiFilenameFallback("café.pdf")).toBe("caf_.pdf");
    // Folded by CODE POINT, so an astral character is one underscore, not two.
    expect(asciiFilenameFallback("🧾.pdf")).toBe("_.pdf");
    // A name that folds away entirely still yields something serveable.
    expect(asciiFilenameFallback(" ".repeat(3))).toBe("attachment");
  });

  it("never emits a header value containing a line break, for any name", () => {
    for (const name of [
      ...HOSTILE_NAMES,
      "a\r\nX-Injected: yes",
      "a\nSet-Cookie: nope",
    ]) {
      const header = contentDispositionHeader("attachment", name);
      expect(header).not.toContain("\r");
      expect(header).not.toContain("\n");
      // Exactly two quotes: the ones that delimit the ASCII fallback.
      expect(header.split('"')).toHaveLength(3);
    }
  });

  it("carries the real name in the RFC 5987 half", () => {
    const header = contentDispositionHeader("attachment", "café ‘x’.pdf");
    expect(header.startsWith('attachment; filename="')).toBe(true);
    expect(header).toContain("filename*=UTF-8''");
    // `'` is not an attr-char and must be encoded, or the parameter terminates
    // early.
    expect(header).not.toMatch(/filename\*=UTF-8''[^;]*'/);
  });
});

describe("the media-type allow-list is an allow-list", () => {
  it("accepts a PDF that is a PDF", () => {
    const validated = validateAttachmentUpload({
      filename: "policy.pdf",
      declaredMediaType: "application/pdf",
      bytes: PDF_BYTES,
    });
    expect(validated.mediaType).toBe("application/pdf");
    expect(validated.media.disposition).toBe("download");
  });

  it("accepts a PNG and marks it inline-servable", () => {
    const validated = validateAttachmentUpload({
      filename: "receipt.png",
      declaredMediaType: "image/png",
      bytes: PNG_BYTES,
    });
    expect(validated.media.disposition).toBe("image");
  });

  it("drops a charset parameter rather than treating it as a new type", () => {
    expect(normaliseMediaType("text/plain; charset=utf-8")).toBe("text/plain");
    expect(
      validateAttachmentUpload({
        filename: "notes.txt",
        declaredMediaType: "text/plain; charset=utf-8",
        bytes: new TextEncoder().encode("hello"),
      }).mediaType,
    ).toBe("text/plain");
  });

  it("refuses HTML and SVG with their own sentence", () => {
    for (const type of Object.keys(ATTACHMENT_REFUSED_MEDIA_TYPES)) {
      expect(() =>
        validateAttachmentUpload({
          filename: type.includes("svg") ? "logo.svg" : "page.html",
          declaredMediaType: type,
          bytes: new TextEncoder().encode("<svg/>"),
        }),
      ).toThrow(/run code/);
    }
    // And they are not on the allow-list at all, which is the stronger claim.
    expect(attachmentMediaType("text/html")).toBeNull();
    expect(attachmentMediaType("image/svg+xml")).toBeNull();
    expect(ATTACHMENT_ACCEPT_ATTRIBUTE).not.toContain("svg");
    expect(ATTACHMENT_ACCEPT_ATTRIBUTE).not.toContain("html");
  });

  it("refuses a type nobody has heard of", () => {
    expect(() =>
      validateAttachmentUpload({
        filename: "thing.exe",
        declaredMediaType: "application/x-msdownload",
        bytes: new Uint8Array([0x4d, 0x5a]),
      }),
    ).toThrow(/doesn’t accept that kind of file/);
  });

  it("refuses a name and a type that disagree", () => {
    expect(() =>
      validateAttachmentUpload({
        filename: "policy.png",
        declaredMediaType: "application/pdf",
        bytes: PDF_BYTES,
      }),
    ).toThrow(/doesn’t end in/);
  });

  it("refuses a file whose leading bytes contradict its name and type", () => {
    expect(() =>
      validateAttachmentUpload({
        filename: "notreally.pdf",
        declaredMediaType: "application/pdf",
        bytes: new TextEncoder().encode("<html><script>alert(1)</script>"),
      }),
    ).toThrow(/doesn’t start like one/);
  });

  it("falls back to the extension only for an unhelpful declaration", () => {
    // A browser that sends nothing for a HEIC still gets a HEIC.
    expect(
      validateAttachmentUpload({
        filename: "IMG_0001.heic",
        declaredMediaType: "",
        bytes: new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]),
      }).mediaType,
    ).toBe("image/heic");
    // But an unknown extension is still refused, so the fallback is not a hole.
    expect(() =>
      validateAttachmentUpload({
        filename: "thing.zip",
        declaredMediaType: "application/octet-stream",
        bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      }),
    ).toThrow(/doesn’t accept that kind of file/);
  });

  it("checks the WEBP marker, not just the RIFF container", () => {
    const webp = attachmentMediaType("image/webp")!;
    const riffOnly = new Uint8Array(16);
    riffOnly.set([0x52, 0x49, 0x46, 0x46], 0);
    expect(matchesSignature(webp, riffOnly)).toBe(false);
    riffOnly.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(matchesSignature(webp, riffOnly)).toBe(true);
  });

  it("every accepted type has at least one extension and a label", () => {
    for (const type of ATTACHMENT_MEDIA_TYPES) {
      expect(type.extensions.length).toBeGreaterThan(0);
      expect(type.label.length).toBeGreaterThan(0);
      for (const extension of type.extensions) {
        expect(extension.startsWith(".")).toBe(true);
        expect(extension).toBe(extension.toLowerCase());
      }
    }
  });

  it("only raster images are ever inline-servable", () => {
    const inline = ATTACHMENT_MEDIA_TYPES.filter(
      (type) => type.disposition === "image",
    ).map((type) => type.value);
    expect(inline).toEqual([
      "image/gif",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });
});

describe("bounds", () => {
  it("refuses a declared length over the ceiling before any body is read", () => {
    expect(() =>
      assertDeclaredSizeWithinBound(MAX_ATTACHMENT_BYTES + 1),
    ).toThrow(AttachmentValidationError);
    expect(() =>
      assertDeclaredSizeWithinBound(MAX_ATTACHMENT_BYTES),
    ).not.toThrow();
    // An absent or nonsensical header is not a refusal; the real byte length is.
    expect(() => assertDeclaredSizeWithinBound(Number.NaN)).not.toThrow();
  });

  it("refuses an empty file", () => {
    expect(() =>
      validateAttachmentUpload({
        filename: "empty.txt",
        declaredMediaType: "text/plain",
        bytes: new Uint8Array(0),
      }),
    ).toThrow(/empty/);
  });

  it("refuses a record that is already at its evidence bound", () => {
    expect(() =>
      assertRecordHasRoom(MAX_ATTACHMENTS_PER_RECORD - 1),
    ).not.toThrow();
    expect(() => assertRecordHasRoom(MAX_ATTACHMENTS_PER_RECORD)).toThrow(
      AttachmentValidationError,
    );
  });

  it("formats a size the way every surface will show it", () => {
    expect(formatAttachmentSize(1)).toBe("1 byte");
    expect(formatAttachmentSize(948)).toBe("948 bytes");
    expect(formatAttachmentSize(2048)).toBe("2.0 KB");
    expect(formatAttachmentSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("the upload operation id", () => {
  it("accepts a UUID and rejects anything that could smuggle content", () => {
    expect(
      validateUploadOperationId("6b1b2b0e-0000-4000-8000-000000000000"),
    ).toBe("6b1b2b0e-0000-4000-8000-000000000000");
    for (const bad of [
      "",
      "short",
      "a".repeat(129),
      "has space",
      "semi;colon",
      42,
    ]) {
      expect(() => validateUploadOperationId(bad)).toThrow(
        AttachmentValidationError,
      );
    }
  });
});

describe("what a surface receives", () => {
  const record: AttachmentRecord = {
    id: "att-1",
    workspaceId: "ws-1",
    ownerEntityId: "obl-1",
    filename: "Rego renewal.pdf",
    mediaType: "application/pdf",
    byteSize: 2048,
    checksumSha256: "a".repeat(64),
    storageKey: "workspaces/ws-1/attachments/att-1",
    uploadOperationId: "6b1b2b0e-0000-4000-8000-000000000000",
    uploadedBy: "owner-subject",
    createdAt: new Date("2026-09-06T01:02:03.000Z"),
  };

  it("carries no storage key, checksum, workspace id or operation id", () => {
    const view = attachmentView(record);
    const serialised = JSON.stringify(view);
    expect(serialised).not.toContain(record.storageKey);
    expect(serialised).not.toContain(record.checksumSha256);
    expect(serialised).not.toContain(record.workspaceId);
    expect(serialised).not.toContain(record.uploadOperationId);
    expect(serialised).not.toContain("owner-subject");
  });

  it("offers a download for everything and a preview only for a raster image", () => {
    expect(attachmentView(record).downloadHref).toBe("/attachments/att-1");
    expect(attachmentView(record).previewHref).toBeNull();
    expect(
      attachmentView({ ...record, mediaType: "image/png" }).previewHref,
    ).toBe("/attachments/att-1/preview");
  });

  it("formats the size and the date once, server-side", () => {
    const view = attachmentView(record);
    expect(view.sizeLabel).toBe("2.0 KB");
    expect(view.createdLabel).toBe("6 September 2026");
    expect(view.kindLabel).toBe("PDF");
  });
});

/*
 * The port contract, against the FAKE. The same block runs against the real
 * bucket in `test/kernel/attachments.test.ts`, which is the only thing that
 * makes `createInMemoryObjectStore` safe to reason with: a fake nothing checks
 * is a fake that drifts.
 */
objectStoreContract(
  "in-memory fake",
  () => createInMemoryObjectStore(),
  "workspaces/ws_contract/attachments/",
);
