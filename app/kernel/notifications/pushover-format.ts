/**
 * NOTIFY-01 — the Pushover message format. Pure, and the only place that knows
 * what Pushover's fields are called or how long they may be.
 *
 * Formatting is per-channel and pure by design: the digest renderer decides what
 * is SAID, and this decides how Pushover is told. Keeping the two apart is what
 * lets a second channel exist without the digest growing a `channel` parameter.
 *
 * ── The bounds are real, and truncation is deliberate ───────────────────────
 * Pushover documents `title` at 250 characters and `message` at 1024, and it
 * REJECTS an over-long message rather than trimming it. A digest on a busy day
 * can genuinely reach that, so the message is clamped here — an ellipsis, with
 * the in-app inbox holding the complete text, is a far better outcome than the
 * day's digest failing to send at all. (`url` is 512 and `url_title` 100; both
 * are short by construction.)
 *
 * ── html=1, so everything interpolated is escaped ───────────────────────────
 * The message is sent with `html=1`, which is what gives the digest readable
 * line breaks on a phone. That makes every character of the body untrusted
 * markup input — a Task called `<b>` or an Asset called `A & B` must arrive as
 * text — so the escape below runs over the WHOLE body before the only tag this
 * module adds. Nothing from a record is ever interpolated raw.
 *
 * The bound is measured on the ESCAPED string, not on the owner's words: `&`
 * becomes five characters and a newline becomes four, so clamping the plain text
 * to 1024 and then escaping it can still produce a message Pushover refuses. The
 * loop below shrinks the source until what will actually be SENT fits.
 */

/** Pushover's documented field bounds. */
export const PUSHOVER_TITLE_MAX = 250;
export const PUSHOVER_MESSAGE_MAX = 1024;
export const PUSHOVER_URL_MAX = 512;
export const PUSHOVER_URL_TITLE_MAX = 100;

/** The message body Pushover is handed, and nothing else. */
export interface PushoverMessage {
  readonly title: string;
  /** HTML-safe, with `<br>` for line breaks. Sent with `html=1`. */
  readonly message: string;
  /** The absolute deep link, or undefined when no origin is configured. */
  readonly url?: string;
  readonly urlTitle?: string;
  readonly priority: 0 | 1;
}

/** Escape the five characters that can change the meaning of HTML. */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Clamp plain text at a word boundary where one is near enough. */
function clampPlain(value: string, max: number): string {
  if (max <= 1) return "…";
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max - 24 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** The only markup this module emits: escaped text with `<br>` line breaks. */
function renderMessage(plain: string): string {
  return escapeHtml(plain).replaceAll("\n", "<br>");
}

/** Shrink the SOURCE until the rendered result fits the wire bound. */
function renderWithinBound(body: string, max: number): string {
  let budget = max;
  for (;;) {
    const rendered = renderMessage(clampPlain(body, budget));
    if (rendered.length <= max) return rendered;
    // Never slice the rendered string: a cut can land inside `&amp;` or `<br>`.
    // Shrink the plain source by at least the overshoot and render again.
    const next = budget - Math.max(1, rendered.length - max);
    if (next <= 1) return "…";
    budget = next;
  }
}

/**
 * Format one notification for Pushover.
 *
 * The title is NOT escaped, because Pushover's `html` flag applies to the
 * message only — an escaped title would show `&amp;` to the owner.
 */
export function formatPushoverMessage(input: {
  readonly title: string;
  readonly body: string;
  readonly href: string;
  /** The workspace's public origin, when one is known. */
  readonly origin: string | null;
  readonly priority?: 0 | 1;
}): PushoverMessage {
  const url =
    input.origin === null
      ? undefined
      : clampPlain(
          `${input.origin.replace(/\/+$/, "")}${input.href}`,
          PUSHOVER_URL_MAX,
        );
  return {
    title: clampPlain(input.title, PUSHOVER_TITLE_MAX),
    message: renderWithinBound(input.body, PUSHOVER_MESSAGE_MAX),
    ...(url === undefined
      ? {}
      : {
          url,
          urlTitle: clampPlain("Open in DalyHub", PUSHOVER_URL_TITLE_MAX),
        }),
    priority: input.priority ?? 0,
  };
}
