/**
 * BACKUP-01 — the D1 export client.
 *
 * The theme of every test here is the same: a backup pipeline must never carry
 * on with a half-understood response. Each malformed shape is refused
 * explicitly, and each refusal is classified as permanent or transient, because
 * that classification is what stops the Workflow retrying a bad token for hours
 * or giving up on a five-second network blip.
 */

import { describe, expect, it, vi } from "vitest";

import {
  D1ExportError,
  MAX_DUMP_BYTES,
  downloadExport,
  exportEndpoint,
  parseExportResponse,
  pollD1Export,
} from "../../../infra/backup/src/d1-export";

const TARGET = {
  accountId: "0123456789abcdef0123456789abcdef",
  databaseId: "00000000-0000-4000-8000-000000000000",
  apiToken: "test-token-value-never-logged",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("exportEndpoint", () => {
  it("builds the documented D1 export URL", () => {
    expect(exportEndpoint(TARGET)).toBe(
      "https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/d1/database/00000000-0000-4000-8000-000000000000/export",
    );
  });
});

describe("parseExportResponse", () => {
  /*
   * The two fixtures below are the REAL response bodies from the live D1 export
   * API, captured against the production database on 2026-08-13 (identifiers
   * replaced with fakes, signed URL replaced).
   *
   * They exist because the first live backup FAILED on the documented shape: the
   * REST API reference describes the running state as `"in-progress"`, and the
   * deployed API returns `"active"`. The strict parser refused it, which is what
   * it is for — but the lesson is that the documentation is not the contract, so
   * the contract is pinned here from observation.
   */
  const LIVE_ACTIVE = {
    result: {
      success: true,
      type: "export",
      at_bookmark:
        "0000020e-0000000c-000050c6-471c485345f9b637a0062f78cbe60934",
      status: "active",
      messages: [
        "Generating 00000000-0000-4000-8000-000000000000-0000020e.sql",
      ],
    },
    success: true,
    messages: [],
    errors: [],
  };

  const LIVE_COMPLETE = {
    result: {
      success: true,
      type: "export",
      at_bookmark:
        "0000020e-0000000c-000050c6-471c485345f9b637a0062f78cbe60934",
      status: "complete",
      result: {
        filename: "00000000-0000-4000-8000-000000000000-0000020e.sql",
        signed_url: "https://example.invalid/r2-presigned",
      },
      messages: ["Uploaded part 1", "Finished uploading … in 1 parts."],
    },
    success: true,
    messages: [],
    errors: [],
  };

  it('reads the live API\'s "active" running state', () => {
    const parsed = parseExportResponse(LIVE_ACTIVE);
    expect(parsed.status).toBe("in-progress");
    expect(parsed.bookmark).toBe(
      "0000020e-0000000c-000050c6-471c485345f9b637a0062f78cbe60934",
    );
  });

  it("reads the live API's completed response", () => {
    const parsed = parseExportResponse(LIVE_COMPLETE);
    expect(parsed.status).toBe("complete");
    if (parsed.status !== "complete") throw new Error("unreachable");
    expect(parsed.signedUrl).toBe("https://example.invalid/r2-presigned");
    expect(parsed.filename).toBe(
      "00000000-0000-4000-8000-000000000000-0000020e.sql",
    );
  });

  it('also reads the documented "in-progress" state', () => {
    // The reference documents this spelling. Accepting both means neither the
    // docs changing nor the API changing breaks the nightly backup.
    const parsed = parseExportResponse({
      success: true,
      result: {
        at_bookmark: "0000000a-0000000b",
        status: "in-progress",
        messages: ["Generating export"],
      },
    });
    expect(parsed.status).toBe("in-progress");
    expect(parsed.bookmark).toBe("0000000a-0000000b");
    expect(parsed.messages).toEqual(["Generating export"]);
  });

  it("reads the completed response and surfaces the signed URL and filename", () => {
    const parsed = parseExportResponse({
      success: true,
      result: {
        at_bookmark: "0000000a-0000000b",
        status: "complete",
        result: {
          filename: "dalyhub-v2-export.sql",
          signed_url: "https://example.invalid/signed",
        },
      },
    });
    expect(parsed.status).toBe("complete");
    if (parsed.status !== "complete") throw new Error("unreachable");
    expect(parsed.signedUrl).toBe("https://example.invalid/signed");
    expect(parsed.filename).toBe("dalyhub-v2-export.sql");
  });

  it("refuses a body that is not an object", () => {
    for (const body of [null, "a string", 42, ["array"]]) {
      expect(() => parseExportResponse(body)).toThrow(D1ExportError);
    }
  });

  it("refuses an explicit API failure, permanently", () => {
    try {
      parseExportResponse({
        success: false,
        errors: [{ code: 7403, message: "Unauthorized" }],
      });
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(D1ExportError);
      expect((error as D1ExportError).permanent).toBe(true);
      expect((error as Error).message).toContain("7403");
    }
  });

  it("refuses a response with no result object", () => {
    expect(() => parseExportResponse({ success: true })).toThrow(
      /no result object/i,
    );
  });

  it("refuses a response with a missing bookmark", () => {
    // Without a bookmark the export cannot be polled to completion, so there is
    // no way to reach the dump even though the export may have started.
    expect(() =>
      parseExportResponse({
        success: true,
        result: { status: "in-progress", messages: [] },
      }),
    ).toThrow(/no export bookmark/i);
  });

  it("refuses a completion with no signed URL", () => {
    expect(() =>
      parseExportResponse({
        success: true,
        result: {
          at_bookmark: "abc",
          status: "complete",
          result: { filename: "x.sql" },
        },
      }),
    ).toThrow(/no signed download URL/i);
  });

  it("refuses a completion with no inner result payload", () => {
    expect(() =>
      parseExportResponse({
        success: true,
        result: { at_bookmark: "abc", status: "complete" },
      }),
    ).toThrow(/no result payload/i);
  });

  it("refuses a status nobody has seen before", () => {
    // Deliberately NOT treated as "keep waiting". A future server-side failure
    // status must fail the run rather than poll until the step times out.
    for (const status of ["mostly-done", "error", "failed", "", null, 7]) {
      expect(() =>
        parseExportResponse({
          success: true,
          result: { at_bookmark: "abc", status },
        }),
      ).toThrow(/unrecognised status/i);
    }
  });
});

describe("pollD1Export", () => {
  it("initiates an export with no bookmark and polls with one", async () => {
    // A fresh Response each call: a body can only be read once, so reusing one
    // instance would make the second poll look like a malformed response.
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () =>
      jsonResponse({
        success: true,
        result: { at_bookmark: "bm-1", status: "in-progress", messages: [] },
      }),
    );

    await pollD1Export(TARGET, undefined, fetchImpl);
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual({
      output_format: "polling",
    });

    await pollD1Export(TARGET, "bm-1", fetchImpl);
    expect(JSON.parse(String(fetchImpl.mock.calls[1][1]?.body))).toEqual({
      output_format: "polling",
      current_bookmark: "bm-1",
    });
  });

  it("classifies an authentication failure as permanent and names the fix", async () => {
    for (const status of [401, 403]) {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("nope", { status }));
      const error = await pollD1Export(TARGET, undefined, fetchImpl).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(D1ExportError);
      expect((error as D1ExportError).permanent).toBe(true);
      expect((error as Error).message).toContain("D1_REST_API_TOKEN");
      expect((error as Error).message).toContain("D1 Edit");
    }
  });

  it("classifies a missing database as permanent", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("nope", { status: 404 }));
    const error = await pollD1Export(TARGET, undefined, fetchImpl).catch(
      (e: unknown) => e,
    );
    expect((error as D1ExportError).permanent).toBe(true);
  });

  it("classifies rate limiting and server errors as transient", async () => {
    for (const status of [429, 500, 502, 503]) {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("later", { status }));
      const error = await pollD1Export(TARGET, undefined, fetchImpl).catch(
        (e: unknown) => e,
      );
      expect((error as D1ExportError).permanent).toBe(false);
    }
  });

  it("classifies a network failure as transient", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("connection reset"));
    const error = await pollD1Export(TARGET, undefined, fetchImpl).catch(
      (e: unknown) => e,
    );
    expect((error as D1ExportError).permanent).toBe(false);
    expect((error as Error).message).toContain("connection reset");
  });

  it("refuses a 200 response carrying a non-JSON body", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("<html>proxy error</html>", { status: 200 }),
      );
    await expect(pollD1Export(TARGET, undefined, fetchImpl)).rejects.toThrow(
      /non-JSON body/i,
    );
  });

  it("sends the token only as a bearer header", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        success: true,
        result: { at_bookmark: "bm", status: "in-progress" },
      }),
    );
    await pollD1Export(TARGET, undefined, fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).not.toContain(TARGET.apiToken);
    expect(String(init?.body)).not.toContain(TARGET.apiToken);
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${TARGET.apiToken}`,
    );
  });
});

describe("downloadExport", () => {
  it("returns the dump text", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("CREATE TABLE entities (id TEXT);"));
    await expect(
      downloadExport("https://signed.invalid/x", fetchImpl),
    ).resolves.toContain("CREATE TABLE entities");
  });

  it("treats a failed download as transient so the step re-polls for a fresh URL", async () => {
    // An expired signed URL reads as 403 here. Retrying the whole step obtains a
    // new URL, so giving up permanently would be wrong.
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("gone", { status: 403 }));
    const error = await downloadExport(
      "https://signed.invalid/x",
      fetchImpl,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(D1ExportError);
    expect((error as D1ExportError).permanent).toBe(false);
    expect((error as Error).message).toContain("403");
  });

  it("refuses a zero-byte download", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(""));
    await expect(
      downloadExport("https://signed.invalid/x", fetchImpl),
    ).rejects.toThrow(/zero bytes/i);
  });

  it("refuses a download larger than the Worker buffers, with an instruction", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("x", {
        headers: { "content-length": String(MAX_DUMP_BYTES + 1) },
      }),
    );
    const error = await downloadExport(
      "https://signed.invalid/x",
      fetchImpl,
    ).catch((e: unknown) => e);
    expect((error as D1ExportError).permanent).toBe(true);
    expect((error as Error).message).toContain("streaming upload");
  });

  it("never puts the signed URL into the error it throws", async () => {
    const signed = "https://signed.invalid/secret-token-abc123";
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("gone", { status: 500 }));
    const error = await downloadExport(signed, fetchImpl).catch(
      (e: unknown) => e,
    );
    expect((error as Error).message).not.toContain("secret-token-abc123");
  });
});
