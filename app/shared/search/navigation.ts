/**
 * DS-08 Shared Search — result → destination mapping (pure, React-free).
 *
 * Turns a validated {@link SearchResultTarget} into an in-app destination the UI
 * navigates to. A `drawer` target opens the record in the existing DS-03 Drawer by
 * appending the module-owned Drawer key to the route that hosts that module's
 * `DrawerProvider` (its `canonicalPath`, or the current path when omitted),
 * PRESERVING unrelated query parameters via the Drawer's own pure URL helper
 * (`withDrawerPushed`) — so opening a result never discards filters or other state
 * (ADR-018 §18.1, ADR-019 §19.2). A `route` target navigates directly.
 *
 * It imports only the Drawer's framework-free URL helpers — never the Drawer React
 * components — so it stays pure and testable.
 */

import { withDrawerPushed } from "~/shared/drawer/drawer-url";

import type { SearchResultTarget } from "./types";

/** A same-origin, in-app destination expressed as pathname + search. */
export type ResultDestination = {
  readonly pathname: string;
  readonly search: string;
};

/** A minimal view of the current location the mapping needs. */
export type CurrentLocation = {
  readonly pathname: string;
  readonly search: string;
};

function splitPathAndQuery(to: string): { pathname: string; query: string } {
  const hashIndex = to.indexOf("#");
  const withoutHash = hashIndex === -1 ? to : to.slice(0, hashIndex);
  const queryIndex = withoutHash.indexOf("?");
  if (queryIndex === -1) {
    return { pathname: withoutHash, query: "" };
  }
  return {
    pathname: withoutHash.slice(0, queryIndex),
    query: withoutHash.slice(queryIndex + 1),
  };
}

/**
 * Build the in-app destination for a result target relative to the current
 * location. Deterministic and pure.
 */
export function buildResultDestination(
  target: SearchResultTarget,
  current: CurrentLocation,
): ResultDestination {
  if (target.kind === "route") {
    const { pathname, query } = splitPathAndQuery(target.to);
    return { pathname, search: query.length > 0 ? `?${query}` : "" };
  }

  // A canonicalPath may carry its own query string (isSafeInAppPath allows it),
  // so split it before appending the drawer key — otherwise "/today?view=focus"
  // would yield a double "?" and the browser would never see the drawer param.
  const { pathname: canonicalPathname, query: canonicalQuery } =
    target.canonicalPath !== undefined
      ? splitPathAndQuery(target.canonicalPath)
      : { pathname: current.pathname, query: "" };
  const onCanonicalRoute = canonicalPathname === current.pathname;
  // On the canonical route, preserve the user's live params; navigating fresh,
  // seed from the canonicalPath's own query.
  const baseParams = new URLSearchParams(
    onCanonicalRoute ? current.search : canonicalQuery,
  );
  const nextParams = withDrawerPushed(baseParams, target.drawerKey);
  const search = nextParams.toString();
  return {
    pathname: canonicalPathname,
    search: search.length > 0 ? `?${search}` : "",
  };
}

/** Render a destination as an href string for a real `<a href>`. */
export function destinationHref(destination: ResultDestination): string {
  return `${destination.pathname}${destination.search}`;
}
