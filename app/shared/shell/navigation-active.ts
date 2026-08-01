/**
 * UX-01 — the ONE rule for "which navigation destination am I inside?".
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
 *   - `/` matches only `/`, so the home destination never claims every route;
 *   - matching is segment-aware (`/today` does not match `/todayish`);
 *   - when several destinations match, the LONGEST href wins, so a nested
 *     destination beats its ancestor and exactly one row is ever current.
 */

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
 * The href of the single current destination for `pathname`, or `null` when the
 * route sits under none of them. Longest match wins, so exactly one navigation
 * row is ever marked current.
 */
export function activeNavigationHref(
  hrefs: readonly string[],
  pathname: string,
): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (!isNavigationDestinationActive(href, pathname)) {
      continue;
    }
    if (best === null || href.length > best.length) {
      best = href;
    }
  }
  return best;
}
