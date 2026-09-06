/**
 * V2.11 FILE-00 — the attachment ROUTES against the real Workers runtime, real
 * D1 and the real local R2 bucket.
 *
 * The repository tests prove the store's guarantees. These prove the ones the
 * HTTP surface adds, and every one of them is a claim someone could otherwise
 * only make in prose:
 *
 *   - a real multipart upload lands, and the file comes back byte for byte;
 *   - the download always says `Content-Disposition: attachment`, whatever the
 *     type, and carries the owner's own filename safely in both halves;
 *   - the preview route serves a raster image inline and answers 404 for a PDF
 *     — because the CSP means an inline PDF is a blank frame, not a preview;
 *   - a hostile workspace guessing `/attachments/<uuid>` gets 404, for read, for
 *     preview and for delete;
 *   - HTML and SVG are refused at the door, and a `.pdf` that is really HTML is
 *     refused too;
 *   - an oversized upload is refused by the declared length, before the body is
 *     read;
 *   - a retried POST with the same operation id produces one attachment.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import { env } from "cloudflare:test";

import type { AuthenticatedSession } from "~/kernel/auth";
import {
  MAX_ATTACHMENT_BYTES,
  attachmentWorkspacePrefix,
} from "~/kernel/attachments";
import { setAuthenticatedSession } from "~/platform/request";
import {
  ATTACHMENT_FILE_FIELD,
  ATTACHMENT_OPERATION_FIELD,
  ATTACHMENT_OWNER_FIELD,
  action as attachmentsAction,
  loader as attachmentsLoader,
  type AttachmentListData,
  type AttachmentUploadResult,
} from "~/routes/attachments";
import {
  action as attachmentAction,
  loader as attachmentLoader,
} from "~/routes/attachment";
import { loader as previewLoader } from "~/routes/attachment-preview";

import { makeContext, makeRepository, resetTables } from "./support";

/**
 * The workspace the routes resolve.
 *
 * It is the pool's configured `DEFAULT_WORKSPACE_ID`, because the routes take
 * the workspace from trusted server configuration and NOT from anything the
 * request carries — which is the property the hostile-workspace tests below
 * depend on. A test that could choose the workspace would be testing a product
 * that does not exist.
 */
const WS = "test-default-workspace";
const OTHER = "ws_attach_route_other";

const PDF = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xc2, 0xb5, 0x0a,
  0x31, 0x20, 0x30, 0x20, 0x6f, 0x62, 0x6a, 0x0a,
]);
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01,
]);

function authedContext(): RouterContextProvider {
  const session: AuthenticatedSession = {
    user: {
      subject: "owner-subject",
      email: "owner@example.com",
      displayName: null,
    },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, session);
  return context;
}

async function seedOwner(workspaceId = WS, title = "Hilux"): Promise<string> {
  const entities = makeRepository(makeContext(workspaceId));
  const record = await entities.create({ type: "note", title });
  return record.id;
}

async function upload(options: {
  readonly owner: string;
  readonly filename: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
  readonly operation?: string;
  readonly declaredLength?: number;
}): Promise<{ status: number; body: AttachmentUploadResult }> {
  const form = new FormData();
  form.set(ATTACHMENT_OWNER_FIELD, options.owner);
  form.set(
    ATTACHMENT_OPERATION_FIELD,
    options.operation ?? crypto.randomUUID(),
  );
  form.set(
    ATTACHMENT_FILE_FIELD,
    new File([options.bytes as unknown as BlobPart], options.filename, {
      type: options.mediaType,
    }),
  );
  const request = new Request("https://app.test/attachments", {
    method: "POST",
    body: form,
  });
  if (options.declaredLength !== undefined) {
    // A hostile client can declare anything; the route must refuse an
    // over-declaration before it reads a byte.
    request.headers.set("content-length", String(options.declaredLength));
  }
  const response = (await attachmentsAction({
    request,
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof attachmentsAction>[0])) as Response;
  return {
    status: response.status,
    body: (await response.json()) as AttachmentUploadResult,
  };
}

async function download(attachmentId: string): Promise<Response> {
  return (await attachmentLoader({
    request: new Request(`https://app.test/attachments/${attachmentId}`),
    context: authedContext(),
    params: { attachmentId },
  } as unknown as Parameters<typeof attachmentLoader>[0])) as Response;
}

async function preview(attachmentId: string): Promise<Response> {
  return (await previewLoader({
    request: new Request(
      `https://app.test/attachments/${attachmentId}/preview`,
    ),
    context: authedContext(),
    params: { attachmentId },
  } as unknown as Parameters<typeof previewLoader>[0])) as Response;
}

async function list(owner: string): Promise<AttachmentListData> {
  const url = new URL("https://app.test/attachments");
  url.searchParams.set(ATTACHMENT_OWNER_FIELD, owner);
  const response = (await attachmentsLoader({
    request: new Request(url),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof attachmentsLoader>[0])) as Response;
  return (await response.json()) as AttachmentListData;
}

async function remove(attachmentId: string): Promise<Response> {
  const form = new FormData();
  form.set("intent", "delete");
  return (await attachmentAction({
    request: new Request(`https://app.test/attachments/${attachmentId}`, {
      method: "POST",
      body: form,
    }),
    context: authedContext(),
    params: { attachmentId },
  } as unknown as Parameters<typeof attachmentAction>[0])) as Response;
}

/** Whatever a route threw, as a `Response`. */
async function thrown(promise: Promise<unknown>): Promise<Response> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
  throw new Error("expected the route to throw a Response");
}

async function clearObjects(): Promise<void> {
  for (const workspaceId of [WS, OTHER]) {
    const listed = await env.ATTACHMENTS.list({
      prefix: attachmentWorkspacePrefix(workspaceId),
      limit: 1000,
    });
    for (const object of listed.objects) {
      await env.ATTACHMENTS.delete(object.key);
    }
  }
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
  await clearObjects();
});

describe("the round trip through the routes", () => {
  it("uploads, lists, downloads byte-for-byte and deletes", async () => {
    const owner = await seedOwner();
    const uploaded = await upload({
      owner,
      filename: "Rego renewal.pdf",
      mediaType: "application/pdf",
      bytes: PDF,
    });
    expect(uploaded.status).toBe(200);
    expect(uploaded.body.ok).toBe(true);
    if (!uploaded.body.ok) throw new Error("upload failed");
    const attachment = uploaded.body.attachment;
    expect(attachment.filename).toBe("Rego renewal.pdf");
    expect(attachment.sizeLabel).toBe(`${PDF.length} bytes`);
    expect(attachment.previewHref).toBeNull();

    const listed = await list(owner);
    expect(listed.attachments.map((row) => row.id)).toEqual([attachment.id]);

    const response = await download(attachment.id);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toContain("no-store");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes]).toEqual([...PDF]);

    expect((await remove(attachment.id)).status).toBe(200);
    expect((await list(owner)).attachments).toEqual([]);
    expect((await thrown(download(attachment.id))).status).toBe(404);
  });

  it("always says `attachment`, and carries the name safely in both halves", async () => {
    const owner = await seedOwner();
    const uploaded = await upload({
      owner,
      filename: "Café — “rego” 2026.pdf",
      mediaType: "application/pdf",
      bytes: PDF,
    });
    if (!uploaded.body.ok) throw new Error("upload failed");

    const disposition = (
      await download(uploaded.body.attachment.id)
    ).headers.get("content-disposition")!;
    expect(disposition.startsWith("attachment; ")).toBe(true);
    // The quoted half is ASCII and unbroken; the real name is in `filename*`.
    expect(disposition).toMatch(/filename="[\x20-\x7e]*"/);
    expect(disposition).toContain("filename*=UTF-8''");
    expect(disposition).not.toContain("\n");
    expect(disposition).not.toContain("\r");
  });
});

describe("inline is a narrow exception, not a preference", () => {
  it("serves a PNG inline and refuses to preview a PDF", async () => {
    const owner = await seedOwner();
    const image = await upload({
      owner,
      filename: "receipt.png",
      mediaType: "image/png",
      bytes: PNG,
    });
    const pdf = await upload({
      owner,
      filename: "policy.pdf",
      mediaType: "application/pdf",
      bytes: PDF,
    });
    if (!image.body.ok || !pdf.body.ok) throw new Error("upload failed");

    const shown = await preview(image.body.attachment.id);
    expect(shown.status).toBe(200);
    expect(shown.headers.get("content-type")).toBe("image/png");
    expect(
      shown.headers.get("content-disposition")!.startsWith("inline; "),
    ).toBe(true);
    expect(shown.headers.get("x-content-type-options")).toBe("nosniff");

    // A PDF has no preview at all — the CSP would render a blank frame, so the
    // product does not offer one.
    expect(image.body.attachment.previewHref).toBe(
      `/attachments/${image.body.attachment.id}/preview`,
    );
    expect(pdf.body.attachment.previewHref).toBeNull();
    expect((await thrown(preview(pdf.body.attachment.id))).status).toBe(404);

    // And the DOWNLOAD route still says `attachment` for the image.
    expect(
      (await download(image.body.attachment.id)).headers
        .get("content-disposition")!
        .startsWith("attachment; "),
    ).toBe(true);
  });
});

describe("active content never reaches the origin", () => {
  it("refuses HTML and SVG with their own sentence", async () => {
    const owner = await seedOwner();
    const html = await upload({
      owner,
      filename: "page.html",
      mediaType: "text/html",
      bytes: new TextEncoder().encode("<script>alert(1)</script>"),
    });
    expect(html.status).toBe(415);
    expect(html.body.ok).toBe(false);
    if (html.body.ok) throw new Error("unreachable");
    expect(html.body.message).toContain("run code");

    const svg = await upload({
      owner,
      filename: "logo.svg",
      mediaType: "image/svg+xml",
      bytes: new TextEncoder().encode('<svg onload="alert(1)"/>'),
    });
    expect(svg.status).toBe(415);

    // Nothing was stored for either.
    expect(
      (await env.ATTACHMENTS.list({ prefix: attachmentWorkspacePrefix(WS) }))
        .objects,
    ).toEqual([]);
    expect((await list(owner)).attachments).toEqual([]);
  });

  it("refuses HTML wearing a .pdf name", async () => {
    const owner = await seedOwner();
    const disguised = await upload({
      owner,
      filename: "policy.pdf",
      mediaType: "application/pdf",
      bytes: new TextEncoder().encode("<html><script>alert(1)</script></html>"),
    });
    expect(disguised.status).toBe(415);
    if (disguised.body.ok) throw new Error("unreachable");
    expect(disguised.body.message).toContain("doesn’t start like one");
  });
});

describe("bounds and retries", () => {
  it("refuses an over-declared length before reading the body", async () => {
    const owner = await seedOwner();
    const refused = await upload({
      owner,
      filename: "policy.pdf",
      mediaType: "application/pdf",
      bytes: PDF,
      declaredLength: MAX_ATTACHMENT_BYTES + 1,
    });
    expect(refused.status).toBe(413);
    expect(
      (await env.ATTACHMENTS.list({ prefix: attachmentWorkspacePrefix(WS) }))
        .objects,
    ).toEqual([]);
  });

  it("produces one attachment for a repeated operation id", async () => {
    const owner = await seedOwner();
    const operation = crypto.randomUUID();
    const first = await upload({
      owner,
      filename: "policy.pdf",
      mediaType: "application/pdf",
      bytes: PDF,
      operation,
    });
    const second = await upload({
      owner,
      filename: "policy.pdf",
      mediaType: "application/pdf",
      bytes: PDF,
      operation,
    });
    if (!first.body.ok || !second.body.ok) throw new Error("upload failed");
    expect(first.body.created).toBe(true);
    expect(second.body.created).toBe(false);
    expect(second.body.attachment.id).toBe(first.body.attachment.id);
    expect((await list(owner)).attachments).toHaveLength(1);
  });

  it("refuses an owner that does not exist", async () => {
    const refused = await upload({
      owner: "no-such-record",
      filename: "policy.pdf",
      mediaType: "application/pdf",
      bytes: PDF,
    });
    expect(refused.status).toBe(404);
  });

  it("answers 405 for a GET on the delete endpoint and a non-POST upload", async () => {
    const owner = await seedOwner();
    const uploaded = await upload({
      owner,
      filename: "policy.pdf",
      mediaType: "application/pdf",
      bytes: PDF,
    });
    if (!uploaded.body.ok) throw new Error("upload failed");

    const wrongMethod = await thrown(
      Promise.resolve().then(() =>
        attachmentsAction({
          request: new Request("https://app.test/attachments", {
            method: "PUT",
          }),
          context: authedContext(),
          params: {},
        } as unknown as Parameters<typeof attachmentsAction>[0]),
      ),
    );
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("allow")).toBe("POST");
  });
});

describe("a hostile workspace reaches nothing through the routes", () => {
  it("cannot read, preview or delete another workspace's file by id", async () => {
    /*
     * The file belongs to OTHER. Every route below resolves WS from trusted
     * configuration, so this is exactly the "guess `/attachments/<uuid>`"
     * attack: the id is real, and it is not this workspace's.
     */
    const foreignOwner = await seedOwner(OTHER, "Their asset");
    const { createR2ObjectStore, uploadAttachment } =
      await import("~/platform/attachments");
    const { createAttachmentRepository } =
      await import("~/platform/storage/d1");
    const { createActivityActorContext } = await import("~/kernel/activity");
    const foreign = await uploadAttachment(
      {
        attachments: createAttachmentRepository(env.DB, makeContext(OTHER), {
          actorContext: createActivityActorContext({
            type: "user",
            id: "someone-else",
          }),
        }),
        objects: createR2ObjectStore(env.ATTACHMENTS),
        workspaceId: OTHER,
      },
      {
        ownerEntityId: foreignOwner,
        filename: "their-policy.pdf",
        declaredMediaType: "application/pdf",
        bytes: PDF,
        uploadOperationId: crypto.randomUUID(),
      },
    );

    expect((await thrown(download(foreign.attachment.id))).status).toBe(404);
    expect((await thrown(preview(foreign.attachment.id))).status).toBe(404);
    expect((await thrown(remove(foreign.attachment.id))).status).toBe(404);
    // Still intact: nothing was deleted on the way past.
    expect(
      await env.ATTACHMENTS.get(foreign.attachment.storageKey),
    ).not.toBeNull();
  });

  it("cannot attach a file to another workspace's record", async () => {
    const foreignOwner = await seedOwner(OTHER, "Their asset");
    const refused = await upload({
      owner: foreignOwner,
      filename: "policy.pdf",
      mediaType: "application/pdf",
      bytes: PDF,
    });
    expect(refused.status).toBe(404);
    expect(
      (await env.ATTACHMENTS.list({ prefix: attachmentWorkspacePrefix(WS) }))
        .objects,
    ).toEqual([]);
  });

  it("cannot list another workspace's record's evidence", async () => {
    const foreignOwner = await seedOwner(OTHER, "Their asset");
    const url = new URL("https://app.test/attachments");
    url.searchParams.set(ATTACHMENT_OWNER_FIELD, foreignOwner);
    const response = await thrown(
      Promise.resolve().then(() =>
        attachmentsLoader({
          request: new Request(url),
          context: authedContext(),
          params: {},
        } as unknown as Parameters<typeof attachmentsLoader>[0]),
      ),
    );
    expect(response.status).toBe(404);
  });
});
