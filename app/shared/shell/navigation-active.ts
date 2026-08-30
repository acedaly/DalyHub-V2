/**
 * UX-01 / RECALL-00-E — the ONE rule for "which navigation destination am I
 * inside?".
 *
 * Both navigation surfaces render the SAME registry-derived model, so they must
 * agree about which row is current. Before UX-01 they did not: the phone bottom
 * bar matched nested paths (`/tasks/tk-1` kept **Tasks** current), while the
 * desktop rail and the "More" sheet used `NavLink`'s exact-match `end` prop — so
 * opening any record (`/projects/pr-1`, `/notes/n-2`, `/asset/a-3`) left the rail
 * with NO current row at all. The owner lost their "you are here" anchor on the
 * screens they spend the most time on, and the two surfaces disagreed about one
 * concept derived from one model.
 *
 * This module is that one rule, kept pure and React-free so it is unit-testable
 * and cannot drift between the rail, the sheet and the phone bar.
 *
 * The rule, and why each clause exists:
 *   - a destination matches its own path OR any path nested beneath it, so a
 *     record keeps its module current;
 *   - **a destination ALSO matches inside its module's declared route-path
 *     prefixes** (`NavigationItem.activePathPrefixes`, derived from the module
 *     manifests by the navigation adapter — RECALL-00-E / DEBT-226). Path
 *     nesting alone left People, Meetings and Assets with no current row on
 *     exactly their most-opened pages: their collections are plural (`/people`)
 *     while their record and create routes are singular (`/person/:id`,
 *     `/new/person`). The truth "a record route belongs to its module's
 *     collection destination" is DATA the registry already holds, so it is
 *     contributed once per module there — never patched per route and never
 *     switched per consumer;
 *   - `/` matches only `/`, so the home destination never claims every route;
 *   - matching is segment-aware (`/today` does not match `/todayish`);
 *   - when several destinations match, the LONGEST matched path (href or
 *     prefix) wins, so a nested destination beats its ancestor and exactly one
 *     row is ever current.
 */

/** What the rule needs to know about a destination: its href, and optionally
 * its module's out-of-nesting route prefixes. `NavigationItem` satisfies it. */
export interface NavigationDestinationInput {
  readonly href: string;
  readonly activePathPrefixes?: readonly string[];
}

/** Whether `href` is the destination the given `pathname` sits inside. */
export function isNavigationDestinationActive(
  href: string,
  pathname: string,
): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  const normalised = href.endsWith("/") ? href.slice(0, -1) : href;
  return pathname === normalised || pathname.startsWith(`${normalised}/`);
}

/**
 * The length of the longest declared path (href or module route prefix) the
 * pathname sits inside, or null when it sits inside none — the destination's
 * ranking key for the longest-match rule.
 */
function matchLength(
  destination: NavigationDestinationInput,
  pathname: string,
): number | null {
  let best: number | null = null;
  if (isNavigationDestinationActive(destination.href, pathname)) {
    best = destination.href.length;
  }
  for (const prefix of destination.activePathPrefixes ?? []) {
    if (!isNavigationDestinationActive(prefix, pathname)) continue;
    if (best === null || prefix.length > best) {
      best = prefix.length;
    }
  }
  return best;
}

/**
 * The href of the single current destination for `pathname`, or `null` when the
 * route sits under none of them (hrefs and declared prefixes alike). Longest
 * match wins, so exactly one navigation row is ever marked current. Accepts
 * bare hrefs so the pre-RECALL-00-E callers and fixtures read unchanged.
 */
export function activeNavigationHref(
  destinations: readonly (string | NavigationDestinationInput)[],
  pathname: string,
): string | null {
  let bestHref: string | null = null;
  let bestLength = -1;
  for (const entry of destinations) {
    const destination = typeof entry === "string" ? { href: entry } : entry;
    const length = matchLength(destination, pathname);
    if (length === null) {
      continue;
    }
    if (length > bestLength) {
      bestHref = destination.href;
      bestLength = length;
    }
  }
  return bestHref;
}
