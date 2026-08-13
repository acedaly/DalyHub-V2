/**
 * BACKUP-01 — a small, strict client for the Cloudflare D1 export REST API.
 *
 * ── Why the REST export, and not something clever ─────────────────────────────
 * D1 has a supported export endpoint that produces the same SQL dump
 * `wrangler d1 export` produces. BACKUP-01 uses it and nothing else. It
 * deliberately does NOT reconstruct a backup by walking tables, reading through
 * the application's own APIs, or serialising the kernel's models: every one of
 * those produces a file that is a snapshot of DalyHub's *understanding* of the
 * database rather than of the database, and drifts silently the first time a
 * migration adds something the exporter did not know about.
 *
 * ── The protocol ──────────────────────────────────────────────────────────────
 * The endpoint is a POST that is polled with its own bookmark:
 *
 *   POST /accounts/{account}/d1/database/{db}/export
 *   { "output_format": "polling" }
 *        → { result: { at_bookmark, status: "in-progress", messages: [...] } }
 *
 *   POST … { "output_format": "polling", "current_bookmark": at_bookmark }
 *        → { result: { at_bookmark, status: "complete",
 *                      result: { filename, signed_url } } }
 *
 * `at_bookmark` is constant for the life of one export and identifies the point
 * in the database's history the dump represents — which is why it is retained as
 * R2 object metadata. The signed URL expires within the hour.
 *
 * ── Strictness is the point ───────────────────────────────────────────────────
 * Every response is parsed against the shape above and REFUSED if it does not
 * match. A backup pipeline that "handles" a malformed API response by carrying
 * on with `undefined` is how a zero-byte file gets stored under a name that
 * promises a database. There is no best-effort path here.
 *
 * ── Secrecy ───────────────────────────────────────────────────────────────────
 * The API token is only ever an `Authorization` header value. The signed URL is
 * returned to the caller for immediate use and is NEVER logged, never persisted
 * into Workflow step state, and never written to object metadata — it is a
 * bearer credential for the owner's entire database.
 */

/** The one API base. Named so a test can assert the URL that gets built. */
export const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";

/**
 * An error from the export path, carrying whether retrying could ever help.
 *
 * This distinction is load-bearing for §15 "fail closed": a transient 500 or a
 * dropped connection SHOULD be retried by the Workflow, while a bad token or a
 * missing database never will be, and retrying those for hours only delays the
 * moment the owner finds out their backups have been failing.
 */
export class D1ExportError extends Error {
  readonly permanent: boolean;

  constructor(message: string, options: { permanent: boolean }) {
    super(message);
    this.name = "D1ExportError";
    this.permanent = options.permanent;
  }
}

/** The parsed result of one poll of the export endpoint. */
export type D1ExportPoll =
  | { status: "in-progress"; bookmark: string; messages: string[] }
  | {
      status: "complete";
      bookmark: string;
      messages: string[];
      filename: string;
      signedUrl: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/**
 * Summarise the `errors` array Cloudflare returns on a failed call, for a log
 * line. Codes and messages only — the request carried a token, the response
 * does not, and nothing here is echoed back into the error unfiltered.
 */
function describeApiErrors(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "no error detail";
  return value
    .map((entry) => {
      if (!isRecord(entry)) return "unparseable error entry";
      const code = typeof entry.code === "number" ? entry.code : "?";
      const message =
        typeof entry.message === "string" ? entry.message : "no message";
      return `${code}: ${message}`;
    })
    .join("; ");
}

/**
 * Parse an export API response body. PURE, and deliberately unforgiving.
 *
 * Exported separately from the fetch so every branch — in-progress, complete,
 * an error envelope, a truncated body, a `status` nobody has seen before — is
 * unit-tested without a network.
 */
export function parseExportResponse(body: unknown): D1ExportPoll {
  if (!isRecord(body)) {
    throw new D1ExportError(
      "The D1 export API returned a body that is not a JSON object.",
      { permanent: true },
    );
  }

  if (body.success !== true) {
    throw new D1ExportError(
      `The D1 export API reported failure (${describeApiErrors(body.errors)}).`,
      // A well-formed refusal is a statement about the request, not the moment.
      { permanent: true },
    );
  }

  const result = body.result;
  if (!isRecord(result)) {
    throw new D1ExportError("The D1 export API returned no result object.", {
      permanent: true,
    });
  }

  const bookmark = result.at_bookmark;
  if (typeof bookmark !== "string" || bookmark.length === 0) {
    // Without a bookmark there is nothing to poll with, so the export cannot be
    // followed to completion even though it may have started.
    throw new D1ExportError("The D1 export API returned no export bookmark.", {
      permanent: true,
    });
  }

  const messages = readStringArray(result.messages);
  const status = result.status;

  if (status === "in-progress") {
    return { status: "in-progress", bookmark, messages };
  }

  if (status === "complete") {
    const inner = result.result;
    if (!isRecord(inner)) {
      throw new D1ExportError(
        "The D1 export API reported completion with no result payload.",
        { permanent: true },
      );
    }
    const signedUrl = inner.signed_url;
    const filename = inner.filename;
    if (typeof signedUrl !== "string" || signedUrl.length === 0) {
      throw new D1ExportError(
        "The D1 export API reported completion with no signed download URL.",
        { permanent: true },
      );
    }
    if (typeof filename !== "string" || filename.length === 0) {
      throw new D1ExportError(
        "The D1 export API reported completion with no filename.",
        { permanent: true },
      );
    }
    return { status: "complete", bookmark, messages, filename, signedUrl };
  }

  throw new D1ExportError(
    `The D1 export API returned an unrecognised status: ${JSON.stringify(status)}.`,
    { permanent: true },
  );
}

/** Everything the client needs to talk to one database. */
export interface D1ExportTarget {
  accountId: string;
  databaseId: string;
  apiToken: string;
}

/** The export endpoint URL for a target. Separate so a test can assert it. */
export function exportEndpoint(target: {
  accountId: string;
  databaseId: string;
}): string {
  return `${CLOUDFLARE_API_BASE}/accounts/${target.accountId}/d1/database/${target.databaseId}/export`;
}

/**
 * Call the export endpoint once.
 *
 * @param currentBookmark omitted to INITIATE an export, supplied to POLL one.
 *
 * HTTP status is classified before the body is parsed, because the two carry
 * different information: a 401/403/404 is a configuration fact that will still
 * be true in six hours, while a 429/5xx is a moment. Note that a NON-JSON body
 * on a failing status is common (a proxy error page), so the status is checked
 * first and the body is only required to be JSON when the call succeeded.
 */
export async function pollD1Export(
  target: D1ExportTarget,
  currentBookmark?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<D1ExportPoll> {
  const payload: Record<string, unknown> = { output_format: "polling" };
  if (currentBookmark !== undefined) {
    payload.current_bookmark = currentBookmark;
  }

  let response: Response;
  try {
    response = await fetchImpl(exportEndpoint(target), {
      method: "POST",
      headers: {
        // The only place the token ever appears.
        Authorization: `Bearer ${target.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (cause) {
    // A network failure is the archetypal transient condition.
    throw new D1ExportError(
      `The D1 export request could not be sent (${cause instanceof Error ? cause.message : "unknown network error"}).`,
      { permanent: false },
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new D1ExportError(
      `The D1 export API rejected the API token (HTTP ${response.status}). The D1_REST_API_TOKEN secret is missing, expired, or lacks the "D1 Edit" permission on this account.`,
      { permanent: true },
    );
  }
  if (response.status === 404) {
    throw new D1ExportError(
      `The D1 export API returned HTTP 404. The configured account id or database id does not name a database this token can reach.`,
      { permanent: true },
    );
  }
  if (response.status === 429 || response.status >= 500) {
    throw new D1ExportError(
      `The D1 export API returned HTTP ${response.status}.`,
      { permanent: false },
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new D1ExportError(
      `The D1 export API returned a non-JSON body (HTTP ${response.status}).`,
      { permanent: response.status < 500 },
    );
  }

  return parseExportResponse(body);
}

/**
 * Download a completed export from its signed URL.
 *
 * Returns TEXT rather than a stream, and that is a considered choice. Streaming
 * straight into R2 would avoid buffering, but it would also make it impossible
 * to validate the dump or know its size before it is stored — and BACKUP-01's
 * whole claim is that a bad backup fails instead of being filed. The production
 * database is ~1.35 MB against a Worker's 128 MB of memory, so buffering is not
 * close to a constraint. `MAX_DUMP_BYTES` exists so that if that ever stops
 * being true, the run fails with an instruction rather than an out-of-memory
 * crash that looks like a platform fault.
 *
 * The URL is never logged, and never appears in a thrown message.
 */
export const MAX_DUMP_BYTES = 96 * 1024 * 1024;

export async function downloadExport(
  signedUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  let response: Response;
  try {
    response = await fetchImpl(signedUrl);
  } catch (cause) {
    throw new D1ExportError(
      `The export download failed (${cause instanceof Error ? cause.message : "unknown network error"}).`,
      { permanent: false },
    );
  }

  if (!response.ok) {
    // A signed URL that has expired reads as 403 here. Retrying the whole step
    // re-polls and obtains a fresh URL, so this is transient by design.
    throw new D1ExportError(
      `The export download returned HTTP ${response.status}.`,
      { permanent: false },
    );
  }

  const declared = response.headers.get("content-length");
  if (declared !== null && Number(declared) > MAX_DUMP_BYTES) {
    throw new D1ExportError(
      `The export is larger than this Worker buffers (${declared} bytes > ${MAX_DUMP_BYTES}). Switch the backup to a streaming upload before it can succeed again.`,
      { permanent: true },
    );
  }

  const text = await response.text();

  if (text.length === 0) {
    throw new D1ExportError("The export download was zero bytes.", {
      permanent: false,
    });
  }

  return text;
}
