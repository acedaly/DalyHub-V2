/**
 * CAPTURE-01 Capture kernel — bounded, defensive MIME extraction.
 *
 * ── Why this exists at all ──────────────────────────────────────────────────
 * Forwarding an email to DalyHub should produce something readable, not a wall
 * of `Content-Transfer-Encoding` headers and base64 (CAPTURE-01 §28). That means parsing
 * MIME. MIME parsing is also, historically, an excellent way to build a
 * denial-of-service vector, so every loop here is bounded:
 *
 *   - the raw message is size-capped BEFORE it reaches this module;
 *   - recursion into nested multiparts stops at a fixed depth;
 *   - the number of parts examined is capped;
 *   - the extracted text is truncated to the capture text bound;
 *   - a malformed message never throws: it degrades to whatever text could be
 *     recovered, because a mangled forward should still capture the thought.
 *
 * ── Why it is hand-rolled ───────────────────────────────────────────────────
 * DalyHub needs a fraction of MIME: find the readable body, decode two transfer
 * encodings, honour a charset. A general-purpose parser would bring a dependency
 * and a much larger attack surface for capability nobody asked for, and the OSS
 * policy's reuse test (AGENTS.md CAPTURE-01 §10) is about not reinventing SOLVED problems
 * at scale, not about importing a library to read one text part. Attachments are
 * explicitly out of scope, so nothing here decodes or stores binary content.
 *
 * ── The security posture ────────────────────────────────────────────────────
 * HTML is never stored. When only an HTML part exists it is converted to PLAIN
 * TEXT here — scripts, styles and every tag removed — so no active markup ever
 * reaches `note_details`, the Markdown pipeline or a rendered page (CAPTURE-01 §28).
 */

/** The deepest nesting of multiparts that is walked. */
export const MIME_MAX_DEPTH = 5;

/** The most parts examined in one message, across all nesting levels. */
export const MIME_MAX_PARTS = 40;

/** The most header lines read before the header block is abandoned. */
const MAX_HEADER_LINES = 400;

/* -------------------------------------------------------------------------- */
/* Bytes                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Decode bytes into a byte-transparent "binary string" (one code unit per byte).
 *
 * The message is parsed at the BYTE level and each part is decoded with its own
 * charset at the end, which is the only way `Content-Transfer-Encoding` and
 * `charset` can both be honoured. Chunked so a large message cannot blow the
 * argument limit of `String.fromCharCode`.
 */
export function bytesToBinaryString(bytes: Uint8Array): string {
  let out = "";
  const CHUNK = 8_192;
  for (let index = 0; index < bytes.length; index += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  }
  return out;
}

/** The inverse of {@link bytesToBinaryString}. */
export function binaryStringToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 0xff;
  }
  return bytes;
}

/** Decode bytes with a named charset, falling back to UTF-8 for unknown labels. */
export function decodeCharset(
  bytes: Uint8Array,
  charset: string | null,
): string {
  const label = (charset ?? "utf-8").trim().toLowerCase();
  try {
    return new TextDecoder(label, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

/* -------------------------------------------------------------------------- */
/* Transfer encodings                                                         */
/* -------------------------------------------------------------------------- */

/** Decode quoted-printable, honouring soft line breaks. Never throws. */
export function decodeQuotedPrintable(value: string): string {
  return value
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_match, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
}

/** Decode base64, ignoring the line breaks MIME wraps it in. Never throws. */
export function decodeBase64(value: string): string {
  const compact = value.replace(/[^A-Za-z0-9+/=]/g, "");
  if (compact.length === 0) return "";
  try {
    return atob(compact);
  } catch {
    // A truncated or corrupt part: recover what decodes cleanly rather than
    // losing the whole message to one bad chunk.
    const trimmed = compact.slice(0, compact.length - (compact.length % 4));
    try {
      return atob(trimmed);
    } catch {
      return "";
    }
  }
}

/** Apply a part's `Content-Transfer-Encoding`. Unknown encodings pass through. */
export function decodeTransferEncoding(
  body: string,
  encoding: string | null,
): string {
  switch ((encoding ?? "").trim().toLowerCase()) {
    case "quoted-printable":
      return decodeQuotedPrintable(body);
    case "base64":
      return decodeBase64(body);
    default:
      return body;
  }
}

/* -------------------------------------------------------------------------- */
/* Headers                                                                    */
/* -------------------------------------------------------------------------- */

/** A parsed header block: lowercase names to their values, in order. */
export type MimeHeaders = ReadonlyMap<string, readonly string[]>;

/** A message or part: its headers and its still-encoded body. */
export type MimePart = {
  readonly headers: MimeHeaders;
  readonly body: string;
};

/** Read one header value, or null. */
export function headerValue(headers: MimeHeaders, name: string): string | null {
  const values = headers.get(name.toLowerCase());
  return values === undefined || values.length === 0
    ? null
    : (values[0] ?? null);
}

/**
 * Split a message into headers and body, unfolding continuation lines. A message
 * with no blank line is treated as all-headers-no-body rather than as an error.
 */
export function splitMimePart(raw: string): MimePart {
  const normalised = raw.replace(/\r\n/g, "\n");
  const separator = normalised.indexOf("\n\n");
  const headerBlock =
    separator === -1 ? normalised : normalised.slice(0, separator);
  const body = separator === -1 ? "" : normalised.slice(separator + 2);

  const headers = new Map<string, string[]>();
  const lines = headerBlock.split("\n");
  let currentName: string | null = null;
  let currentValue = "";
  const commit = (): void => {
    if (currentName === null) return;
    const existing = headers.get(currentName);
    if (existing === undefined) headers.set(currentName, [currentValue.trim()]);
    else existing.push(currentValue.trim());
    currentName = null;
    currentValue = "";
  };
  for (
    let index = 0;
    index < lines.length && index < MAX_HEADER_LINES;
    index += 1
  ) {
    const line = lines[index] ?? "";
    if (/^[ \t]/.test(line) && currentName !== null) {
      currentValue += ` ${line.trim()}`;
      continue;
    }
    commit();
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    currentName = line.slice(0, colon).trim().toLowerCase();
    currentValue = line.slice(colon + 1).trim();
  }
  commit();

  return { headers, body };
}

/** A parsed `Content-Type`: the lowercase media type and its parameters. */
export type ContentType = {
  readonly type: string;
  readonly parameters: ReadonlyMap<string, string>;
};

/** Parse a `Content-Type` (or `Content-Disposition`) header value. */
export function parseContentType(value: string | null): ContentType {
  const raw = (value ?? "").trim();
  if (raw.length === 0) {
    return { type: "text/plain", parameters: new Map() };
  }
  const segments = raw.split(";");
  const type = (segments[0] ?? "").trim().toLowerCase();
  const parameters = new Map<string, string>();
  for (const segment of segments.slice(1)) {
    const equals = segment.indexOf("=");
    if (equals <= 0) continue;
    const name = segment.slice(0, equals).trim().toLowerCase();
    let parameterValue = segment.slice(equals + 1).trim();
    if (parameterValue.startsWith('"') && parameterValue.endsWith('"')) {
      parameterValue = parameterValue.slice(1, -1);
    }
    parameters.set(name, parameterValue);
  }
  return { type: type.length === 0 ? "text/plain" : type, parameters };
}

/**
 * Decode RFC 2047 encoded-words in a header value ("=?utf-8?B?…?="), which is how
 * a Subject carrying anything but ASCII arrives. Unknown or malformed words are
 * left verbatim rather than dropped — a header nobody can decode is still more
 * useful to the owner than an empty one.
 */
export function decodeEncodedWords(value: string): string {
  return value.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (match, charset: string, encoding: string, text: string) => {
      try {
        const binary =
          encoding.toLowerCase() === "b"
            ? decodeBase64(text)
            : decodeQuotedPrintable(text.replace(/_/g, " "));
        return decodeCharset(binaryStringToBytes(binary), charset);
      } catch {
        return match;
      }
    },
  );
}

/* -------------------------------------------------------------------------- */
/* HTML → text                                                                */
/* -------------------------------------------------------------------------- */

/** The named entities worth decoding. A closed list, not a general decoder. */
const HTML_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
};

/**
 * Convert an HTML email body to plain text.
 *
 * This is NOT a sanitiser producing safe HTML — it produces no HTML at all. That
 * is the stronger guarantee and the right one here: DalyHub stores the text, so
 * there is nothing left that could ever execute, load a remote tracking pixel or
 * be re-rendered as markup (CAPTURE-01 §28).
 *
 * `<script>` and `<style>` blocks are removed WITH their contents (otherwise the
 * CSS would become "text"); block-level tags become line breaks so paragraphs
 * survive; everything else is dropped.
 */
export function htmlToPlainText(html: string): string {
  const withoutHidden = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1\s*>/gi, " ")
    // An unterminated <script> must not leave its contents behind as "text".
    .replace(/<(script|style)\b[\s\S]*$/gi, " ");
  const withBreaks = withoutHidden
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(
      /<\s*\/\s*(p|div|tr|li|h[1-6]|blockquote|table|section)\s*>/gi,
      "\n\n",
    )
    .replace(/<\s*(p|div|tr|li|h[1-6]|blockquote|section)\b[^>]*>/gi, "\n");
  const withoutTags = withBreaks.replace(/<[^>]*>/g, " ");
  const decoded = withoutTags
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) =>
      safeFromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_m, digits: string) =>
      safeFromCodePoint(Number.parseInt(digits, 10)),
    )
    .replace(/&([a-z]+);/gi, (match, name: string) => {
      const replacement = HTML_ENTITIES[name.toLowerCase()];
      return replacement === undefined ? match : replacement;
    });
  return decoded
    .replace(/[ \t\u00A0]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeFromCodePoint(value: number): string {
  if (!Number.isFinite(value) || value < 0 || value > 0x10ffff) return "";
  try {
    return String.fromCodePoint(value);
  } catch {
    return "";
  }
}

/* -------------------------------------------------------------------------- */
/* Extraction                                                                 */
/* -------------------------------------------------------------------------- */

/** The readable content recovered from a message. */
export type ExtractedEmail = {
  /** The decoded Subject, or the empty string. */
  readonly subject: string;
  /** The readable body — the plain-text part, or the HTML part converted. */
  readonly text: string;
  /** True when the body came from an HTML part with no plain-text alternative. */
  readonly fromHtml: boolean;
  /** The decoded `From` header. Presentation only — NEVER an authorisation input. */
  readonly fromHeader: string;
  /** The `Message-ID`, used to make repeated delivery idempotent. */
  readonly messageId: string | null;
};

/** Walk a part tree, preferring `text/plain`, then `text/html`. */
function collectBodies(
  part: MimePart,
  depth: number,
  budget: { parts: number },
  found: { plain: string | null; html: string | null },
): void {
  if (depth > MIME_MAX_DEPTH || budget.parts <= 0) return;
  budget.parts -= 1;

  const contentType = parseContentType(
    headerValue(part.headers, "content-type"),
  );
  const disposition = parseContentType(
    headerValue(part.headers, "content-disposition"),
  );

  if (contentType.type.startsWith("multipart/")) {
    const boundary = contentType.parameters.get("boundary");
    if (boundary === undefined || boundary.length === 0) return;
    const marker = `--${boundary}`;
    const segments = part.body.split(marker);
    // The first segment is the preamble and the last the epilogue; neither is a part.
    for (const segment of segments.slice(1)) {
      if (segment.startsWith("--")) break;
      if (budget.parts <= 0) return;
      const child = splitMimePart(segment.replace(/^\n/, ""));
      collectBodies(child, depth + 1, budget, found);
    }
    return;
  }

  // Attachments are out of scope for CAPTURE-01: an attached text file is not
  // the message, and treating it as one would let a forward smuggle content in.
  if (disposition.type === "attachment") return;

  if (contentType.type !== "text/plain" && contentType.type !== "text/html") {
    return;
  }
  const decoded = decodeTransferEncoding(
    part.body,
    headerValue(part.headers, "content-transfer-encoding"),
  );
  const text = decodeCharset(
    binaryStringToBytes(decoded),
    contentType.parameters.get("charset") ?? null,
  );
  if (contentType.type === "text/plain") {
    if (found.plain === null) found.plain = text;
  } else if (found.html === null) {
    found.html = text;
  }
}

/**
 * Extract the readable content of a raw message. Total: a message this cannot
 * make sense of yields empty strings rather than an exception, so the caller
 * decides what an unreadable email means (it becomes an Inbox capture carrying
 * whatever the subject said).
 */
export function extractEmailContent(rawBinary: string): ExtractedEmail {
  const root = splitMimePart(rawBinary);
  const found: { plain: string | null; html: string | null } = {
    plain: null,
    html: null,
  };
  collectBodies(root, 0, { parts: MIME_MAX_PARTS }, found);

  const fromHtml = found.plain === null && found.html !== null;
  const text = fromHtml
    ? htmlToPlainText(found.html ?? "")
    : (found.plain ?? "").replace(/\r/g, "");

  return {
    subject: decodeEncodedWords(
      headerValue(root.headers, "subject") ?? "",
    ).trim(),
    text: text.trim(),
    fromHtml,
    fromHeader: decodeEncodedWords(
      headerValue(root.headers, "from") ?? "",
    ).trim(),
    messageId: headerValue(root.headers, "message-id"),
  };
}
