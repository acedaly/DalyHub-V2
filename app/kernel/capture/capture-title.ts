/**
 * CAPTURE-01 Capture kernel — deterministic title derivation.
 *
 * A captured Note still needs an identity, and a Note captured by voice or from
 * a Share Sheet often arrives with a body and no title. So DalyHub derives one —
 * with a pure, total, testable function and NEVER with an AI call (CAPTURE-01 §41). A model
 * would produce a nicer title and a capture that fails when the provider does.
 *
 * The rules, in order:
 *   1. an explicitly supplied title wins, always;
 *   2. then the shared page's title, when the capture came from the Share Sheet
 *      and the owner supplied no title of their own — the page's own `<title>`
 *      is the best name anyone has for it;
 *   3. then the first meaningful line of the text, truncated on a WORD boundary
 *      with an ellipsis, so the title reads as a phrase rather than a cut;
 *   4. then the source URL's host, for a bare shared link;
 *   5. then a fixed fallback, so the function is total and capture cannot fail
 *      for want of a title.
 *
 * A derived title strips a leading Markdown heading marker and any leading list
 * bullet, because "# Meeting notes" and "- Meeting notes" are the body's syntax
 * rather than the Note's name.
 */

import {
  CAPTURE_DERIVED_TITLE_MAX_LENGTH,
  type CaptureRequest,
} from "./capture";
import { codePointLength, normaliseCaptureLine } from "./capture-validation";

/** The name a capture gets when it carries nothing a title can be made from. */
export const CAPTURE_UNTITLED = "Captured note";

/** Strip the Markdown a first line uses as structure rather than as its name. */
function stripLeadingSyntax(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^>\s+/, "")
    .replace(/^\d{1,3}[.)]\s+/, "")
    .trim();
}

/**
 * Truncate to at most `limit` code points, preferring the last word boundary in
 * the final quarter of the budget so a title ends on a word. An ellipsis is
 * appended only when something was actually removed.
 */
export function truncateCaptureTitle(
  value: string,
  limit: number = CAPTURE_DERIVED_TITLE_MAX_LENGTH,
): string {
  const points = Array.from(value);
  if (points.length <= limit) return value;
  const budget = points.slice(0, limit).join("");
  const lastSpace = budget.lastIndexOf(" ");
  const cut =
    lastSpace >= Math.floor(limit * 0.6) ? budget.slice(0, lastSpace) : budget;
  return `${cut.trimEnd()}…`;
}

/**
 * Derive the title of a captured Note. Pure, total and deterministic: the same
 * capture always produces the same title.
 */
export function deriveCaptureTitle(request: CaptureRequest): string {
  if (request.title !== null && request.title.length > 0) {
    return truncateCaptureTitle(request.title);
  }

  if (request.sourceTitle !== null && request.sourceTitle.length > 0) {
    return truncateCaptureTitle(normaliseCaptureLine(request.sourceTitle));
  }

  for (const rawLine of request.text.split("\n")) {
    const line = stripLeadingSyntax(normaliseCaptureLine(rawLine));
    if (codePointLength(line) > 0) {
      return truncateCaptureTitle(line);
    }
  }

  if (request.sourceUrl !== null) {
    try {
      const { hostname } = new URL(request.sourceUrl);
      const host = hostname.replace(/^www\./, "");
      if (host.length > 0) return truncateCaptureTitle(`Link from ${host}`);
    } catch {
      // The URL was validated at the boundary; this is belt-and-braces so a
      // title can never be the thing that fails a capture.
    }
  }

  return CAPTURE_UNTITLED;
}

/**
 * Compose the Markdown body a captured Note is created with.
 *
 * Source metadata is represented as ordinary Markdown, not as JSON stuffed into
 * a field and not as a new bespoke attachment model (CAPTURE-01 §24): Notes already own
 * durable Markdown, the shared FND-08 renderer already sanitises it, and a link
 * in a note is exactly what a link in a note should look like.
 *
 * The body is deliberately assembled from ALREADY-VALIDATED pieces: the URL has
 * passed `parseCaptureUrl` (so it is an absolute `http(s)` address and can carry
 * no active scheme), and the link TEXT has its Markdown delimiters escaped, so a
 * hostile `sourceTitle` cannot close the link and inject syntax of its own.
 */
export function composeCaptureNoteBody(request: CaptureRequest): string {
  const parts: string[] = [];
  if (request.text.length > 0) parts.push(request.text);
  if (request.sourceUrl !== null) {
    const label =
      request.sourceTitle !== null && request.sourceTitle.length > 0
        ? escapeMarkdownLinkText(request.sourceTitle)
        : escapeMarkdownLinkText(request.sourceUrl);
    parts.push(
      `Source: [${label}](${encodeMarkdownLinkDestination(request.sourceUrl)})`,
    );
  }
  return parts.join("\n\n");
}

/**
 * Compose the Markdown description a captured Task is created with, or null when
 * there is nothing worth writing.
 *
 * A Task's identity is its title, so the description exists only to hold what did
 * not belong in the title: the source link, and any remaining body text when the
 * capture supplied a separate title. A URL is NEVER appended to a Task title
 * (CAPTURE-01 §24) — a title full of query strings is unreadable in every list it appears in.
 *
 * `titleUsed` is the text the title was derived FROM. When the body opens with
 * exactly that line, the line is dropped rather than repeated: a dictated
 * multi-line capture should not have its first sentence appear twice, once as the
 * task's name and once as the first line of its description.
 */
export function composeCaptureTaskDescription(
  request: CaptureRequest,
  titleUsed: string,
): string | null {
  const parts: string[] = [];
  let body = request.text.trim();
  if (body === titleUsed) {
    body = "";
  } else if (body.startsWith(`${titleUsed}\n`)) {
    body = body.slice(titleUsed.length).trim();
  }
  if (body.length > 0) parts.push(body);
  if (request.sourceUrl !== null) {
    const label =
      request.sourceTitle !== null && request.sourceTitle.length > 0
        ? escapeMarkdownLinkText(request.sourceTitle)
        : escapeMarkdownLinkText(request.sourceUrl);
    parts.push(
      `Source: [${label}](${encodeMarkdownLinkDestination(request.sourceUrl)})`,
    );
  }
  return parts.length === 0 ? null : parts.join("\n\n");
}

/** Escape the characters that would let link text break out of its brackets. */
export function escapeMarkdownLinkText(value: string): string {
  return value.replace(/([\\[\]<>`])/g, "\\$1");
}

/**
 * Percent-encode the characters that would let a destination break out of its
 * parentheses. The URL has already been parsed and re-serialised by `URL`, so
 * this only closes the residual Markdown-syntax hole.
 */
export function encodeMarkdownLinkDestination(value: string): string {
  return value.replace(/[()\s]/g, (character) =>
    character === "(" ? "%28" : character === ")" ? "%29" : "%20",
  );
}
