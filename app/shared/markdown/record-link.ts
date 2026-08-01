/**
 * NOTES-05 §5 — the `dalyhub://` RECORD-LINK wire format (pure, React-free,
 * storage-free).
 *
 * A record link is the second, complementary half of DalyHub's internal-link
 * story, and it exists because `[[Wiki Links]]` cannot answer one question
 * honestly: *which* record did the author mean? A wiki link carries a TITLE, so
 * it is resolved by title (with a tie-break) every time it is saved or followed.
 * That is the right trade for writing prose quickly, and the wrong one when the
 * author has already chosen a specific record from a picker.
 *
 *   `[Project: DalyHub V2](dalyhub://project/9f1c…)`
 *
 * This form is:
 *
 *   - **stable** — the destination is the record's id, so renaming the target
 *     never breaks the link and never rewrites the author's prose (§23);
 *   - **unambiguous** — two records sharing a title cannot be confused;
 *   - **readable outside DalyHub** — an ordinary Markdown link with an ordinary
 *     label, so an exported `.md` reads correctly in any editor (unlike bare
 *     `[[…]]`, which is a DalyHub-ism);
 *   - **deployment-independent** — it names a record, not a host, so it does not
 *     rot when the deployment moves (as a `https://…` self-link would).
 *
 * ## Why this lives in the shared layer
 *
 * The format has three consumers in three layers: the FND-08 remark transform
 * (platform), the export transformer (platform), and the editor's record picker
 * (a component, which must not depend on platform). Putting the pure format here
 * and importing it *upward* is exactly the direction `references-model.ts`
 * already established — one authority, no duplicated string template, and no
 * component reaching into the platform layer to get it.
 *
 * This module deliberately contains NO parsing of Markdown and NO resolution. It
 * turns a `(type, id)` pair into a URL and back, and nothing else.
 */

/** The URL scheme DalyHub writes for an internal record reference. */
export const RECORD_LINK_SCHEME = "dalyhub:";

/** The resolver route a record link points at, by stable id. */
export const RECORD_LINK_RESOLVE_PATH = "/notes/resolve";

/**
 * An entity-type slug, matching the lowercase strings the kernel uses for
 * `entities.type`. Deliberately validated by SHAPE rather than against the
 * `ENTITY_TYPES` list: that list lives in the Design System's identity module,
 * which imports React icon components, and neither the FND-08 renderer nor this
 * pure format module should grow a dependency on the UI to describe a URL. The
 * resolver route performs the real, semantic check with `entityDestination`, so
 * an unknown-but-well-shaped type simply resolves to nothing.
 */
const TYPE_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * A record id. Entity ids are `crypto.randomUUID()` values; this accepts the
 * slightly wider conservative token set (alphanumerics, `.`, `_`, `-`) so the
 * contract does not silently break if id generation is ever changed. It excludes
 * `/`, `?`, `#`, `%`, `:`, `@` and every whitespace/control character, so a
 * parsed id can never carry a path segment, a query, a fragment, an authority or
 * an encoded escape into the resolver href.
 */
const ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

/** A parsed record link: an entity type and a stable record id. */
export interface RecordLinkTarget {
  readonly type: string;
  readonly id: string;
}

/**
 * The stable, explicit reference DalyHub writes into Markdown for a record.
 *
 * The ONE place the `dalyhub://` form is constructed. The export transformer,
 * the editor's record picker and the tests all call it, so the written form and
 * {@link parseRecordLink}'s accepted form cannot drift apart.
 */
export function formatRecordLink(type: string, id: string): string {
  return `${RECORD_LINK_SCHEME}//${type}/${id}`;
}

/**
 * Parse a `dalyhub://type/id` URL, or return `null` when it is not one.
 *
 * Strict and total by design — every rejection below is a case where guessing
 * would be worse than declining:
 *
 *   - the scheme is compared case-insensitively (`DalyHub://` is the same link),
 *     because that is how a browser compares schemes;
 *   - tab/newline/CR are stripped first, mirroring `isSafeMarkdownUrl` and how a
 *     browser resolves an `href`, so `daly\nhub://…` cannot present one form to
 *     this check and another to the browser;
 *   - exactly two path segments are required, so `dalyhub://project/a/b`,
 *     `dalyhub://project/` and `dalyhub://project` are rejected rather than
 *     silently truncated to something plausible;
 *   - a query or fragment is rejected outright — a record reference has no
 *     parameters, and accepting them would open a second, unvalidated channel
 *     into the resolver href;
 *   - the type and id must match the conservative patterns above, so nothing
 *     reaching {@link recordLinkHref} needs escaping to be safe.
 */
export function parseRecordLink(raw: unknown): RecordLinkTarget | null {
  if (typeof raw !== "string") return null;

  // Browsers delete tab/newline/CR from an href entirely before parsing; do the
  // same, so an obfuscated scheme cannot look different here than it resolves.
  const url = raw.replace(/[\t\n\r]/g, "").trim();

  const prefix = `${RECORD_LINK_SCHEME}//`;
  if (url.length <= prefix.length) return null;
  if (url.slice(0, prefix.length).toLowerCase() !== prefix) return null;

  const rest = url.slice(prefix.length);
  // A record reference carries no query and no fragment. Reject rather than trim.
  if (rest.includes("?") || rest.includes("#")) return null;

  const segments = rest.split("/");
  if (segments.length !== 2) return null;

  const [type, id] = segments as [string, string];
  if (!TYPE_PATTERN.test(type)) return null;
  if (!ID_PATTERN.test(id)) return null;

  return { type, id };
}

/**
 * The internal resolver href for a record link.
 *
 * A RELATIVE path — the only form the FND-08 URL policy permits without change.
 * Both components are re-encoded even though the patterns above already restrict
 * them to a safe charset: encoding at the point of construction makes the safety
 * property local to this function, rather than a standing obligation that those
 * patterns must never be loosened.
 */
export function recordLinkHref(type: string, id: string): string {
  const params = new URLSearchParams({ type, id });
  return `${RECORD_LINK_RESOLVE_PATH}?${params.toString()}`;
}
