/**
 * DS-03 — the Drawer URL contract (pure, framework-free).
 *
 * The open drawer stack lives ENTIRELY in the URL query string: a repeated
 * search parameter (default `drawer`) whose ordered values are the stack, backmost
 * first. For example:
 *
 *   /projects?status=active&drawer=project%3Aalpha&drawer=goal%3Anorth-star
 *
 * is the Projects page (with its own `status` filter preserved) showing a Project
 * drawer with a Goal drawer stacked on top. Encoding the stack in the URL — rather
 * than in ephemeral React Router location state — is what makes drawers
 * deep-linkable, shareable, refresh-proof and Back/Forward-correct: the rendered
 * stack is a pure function of the URL, so history navigation and a copied link
 * restore the same state (ADR-018).
 *
 * These helpers are pure `URLSearchParams` transforms with no React/router
 * dependency, so they are unit-testable in isolation and reused by both the
 * runtime provider and the tests. Every transform PRESERVES unrelated query
 * parameters; only the drawer parameter is touched.
 */

/** The default search-parameter name carrying the drawer stack. */
export const DEFAULT_DRAWER_PARAM = "drawer";

/**
 * `history.state` key under which the provider tags a history entry it created via
 * `openDrawer()`. Paired with a provider-owned, session-scoped token set, it lets
 * `closeDrawer()` tell a level it genuinely pushed (→ Back, so Forward can restore)
 * from a deep-linked/refreshed level (→ remove the top parameter in place). Reading
 * a bare `history.state.idx` is NOT sufficient: it only proves an earlier entry
 * exists, not that the entry preceding this drawer belongs to the same page
 * (ADR-018 §18.2).
 */
export const DRAWER_PUSH_STATE_KEY = "__dhDrawerPush";

/**
 * A generous stack-depth ceiling. Normal use never approaches it; it exists only
 * to stop a pathological open-loop from growing history and DOM without bound.
 * When reached, opening replaces the top level instead of pushing a new one.
 */
export const MAX_DRAWER_DEPTH = 12;

/** Read the ordered, sanitised drawer stack (backmost first) from the URL. */
export function readDrawerStack(
  params: URLSearchParams,
  param: string = DEFAULT_DRAWER_PARAM,
): string[] {
  return params
    .getAll(param)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

/**
 * Rebuild the search params with a fresh drawer stack, preserving every other
 * parameter's value and relative order. The drawer parameter is re-emitted at the
 * position of its first previous occurrence (or appended when previously absent),
 * so URLs stay deterministic across transforms.
 */
function withDrawerStack(
  params: URLSearchParams,
  stack: readonly string[],
  param: string,
): URLSearchParams {
  const next = new URLSearchParams();
  let drawerEmitted = false;
  const emitDrawer = () => {
    for (const key of stack) {
      next.append(param, key);
    }
    drawerEmitted = true;
  };

  for (const [name, value] of params.entries()) {
    if (name === param) {
      if (!drawerEmitted) {
        emitDrawer();
      }
      continue;
    }
    next.append(name, value);
  }
  if (!drawerEmitted) {
    emitDrawer();
  }
  return next;
}

/** Push a new drawer key onto the top of the stack. */
export function withDrawerPushed(
  params: URLSearchParams,
  key: string,
  param: string = DEFAULT_DRAWER_PARAM,
): URLSearchParams {
  const stack = readDrawerStack(params, param);
  return withDrawerStack(params, [...stack, key], param);
}

/** Replace the top drawer key in place (open one if the stack is empty). */
export function withTopDrawerReplaced(
  params: URLSearchParams,
  key: string,
  param: string = DEFAULT_DRAWER_PARAM,
): URLSearchParams {
  const stack = readDrawerStack(params, param);
  const nextStack = stack.length === 0 ? [key] : [...stack.slice(0, -1), key];
  return withDrawerStack(params, nextStack, param);
}

/** Remove the top drawer, revealing the level beneath. */
export function withTopDrawerRemoved(
  params: URLSearchParams,
  param: string = DEFAULT_DRAWER_PARAM,
): URLSearchParams {
  const stack = readDrawerStack(params, param);
  return withDrawerStack(params, stack.slice(0, -1), param);
}

/** Remove every drawer, revealing the underlying page. */
export function withAllDrawersRemoved(
  params: URLSearchParams,
  param: string = DEFAULT_DRAWER_PARAM,
): URLSearchParams {
  return withDrawerStack(params, [], param);
}
