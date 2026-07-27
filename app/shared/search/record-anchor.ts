/**
 * DS-08 Search — the record-anchor helper (pure, React-free).
 *
 * When Search is opened from a record's page, that record is the "anchor": the
 * server boosts its directly-linked entities (the Universal Relationship System).
 * This helper derives the anchor entity id from the current pathname, so the
 * browser can carry it to the `/search` endpoint (`boostLinkedTo`) without any
 * component owning a route table. It is the inverse of the canonical record routes
 * in `~/shared/entity/destination` (Area/Goal/Project/Note/Person/Meeting/Asset/Review); a task
 * has no standalone record path (it opens in a Drawer), so it has no anchor here.
 *
 * It only recognises a bare `/<segment>/<id>` record path — never a nested,
 * sub-view or collection path (e.g. `/notes`, `/notes/new`, `/notes/:id/mutate`),
 * so a non-record surface yields no anchor and Search runs unboosted, exactly as
 * before.
 */

/** The canonical record path prefixes and the entity id segment that follows. */
const RECORD_PATH_PREFIXES: readonly string[] = [
  "/areas/",
  "/goals/",
  "/projects/",
  "/notes/",
  "/person/",
  "/meeting/",
  "/asset/",
  "/reviews/",
];

/**
 * Reserved sub-segments that are NOT a record id: a static create route or a
 * resource action appended to a record path. If the id segment matches one of
 * these (for the single-segment create routes) or the path has extra segments,
 * there is no record anchor.
 */
const NON_ID_SEGMENTS: ReadonlySet<string> = new Set([
  "new",
  "create",
  "resolve",
]);

/**
 * The anchor entity id for a record pathname, or `null` when the path is not a
 * single canonical record page. Decodes the id segment (paths are encoded by the
 * destination builder). Never throws.
 */
export function recordAnchorFromPath(pathname: string): string | null {
  if (typeof pathname !== "string" || pathname.length === 0) return null;
  for (const prefix of RECORD_PATH_PREFIXES) {
    if (!pathname.startsWith(prefix)) continue;
    const rest = pathname.slice(prefix.length);
    if (rest.length === 0) return null;
    // A record page is exactly one segment after the prefix — reject a nested
    // path (`/notes/:id/activity`) or a trailing slash.
    if (rest.includes("/")) return null;
    if (NON_ID_SEGMENTS.has(rest)) return null;
    try {
      const id = decodeURIComponent(rest);
      return id.length > 0 ? id : null;
    } catch {
      // A malformed percent-encoding is not a usable anchor.
      return null;
    }
  }
  return null;
}
