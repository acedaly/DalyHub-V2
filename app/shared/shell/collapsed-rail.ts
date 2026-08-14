/**
 * DS-03 — the ONE statement of "the rail is currently collapsed to glyphs".
 *
 * The rail collapses between DS-01's `md` (768) and `lg` (1024). Below that band
 * the rail is not rendered at all (the phone bar takes over); above it the labels
 * are visible.
 *
 * **The layout is the media query in `shell.css`, which is the authority.** This
 * module exists because two components need one DOM-affecting consequence of it —
 * whether a control's label is currently readable, and therefore whether the
 * shared tooltip has to supply it. `PrimaryNavigation` asks for the fourteen
 * destinations; `UserMenu` asks for the account trigger, whose name is hidden by
 * the same rule.
 *
 * It is a module rather than a constant exported from whichever component
 * happened to need it first, because the alternative is a cycle: the rail's own
 * component (`Sidebar`) composes both of them, so it cannot own the value they
 * share. `shell-anatomy.test.ts` asserts the query here is character-identical to
 * the one in the stylesheet — a rail that collapsed at one width while its
 * tooltips appeared at another would leave unnamed glyphs across the difference,
 * and nothing would fail.
 */

import { useCompactViewport } from "~/shared/viewport";

/** The width band at which the rail shows glyphs and hides labels. */
export const COLLAPSED_RAIL_QUERY =
  "(min-width: 48rem) and (max-width: 63.9375rem)";

/**
 * A query that cannot match, for a caller that never collapses.
 *
 * `useCompactViewport` takes a query rather than a boolean, so opting out means
 * handing it something unmatchable. `not all` is the CSS idiom for exactly that
 * and is what `matchMedia` returns for an unparseable query anyway, so it is the
 * honest spelling of "this instance is never collapsed".
 */
const NEVER_QUERY = "not all";

/**
 * Whether the rail is currently drawn as glyphs.
 *
 * SSR renders `false`, so the first byte is the labelled rail and a tooltip is
 * only ever added after mount. Nothing about the LAYOUT depends on this — the
 * width is decided by the media query, which the server and the browser resolve
 * identically — so there is no hydration shift.
 *
 * `collapsible: false` opts out entirely and never installs the listener, which
 * is what the phone's navigation sheet does: it is full-width at every viewport
 * it exists at.
 */
export function useCollapsedRail(collapsible: boolean): boolean {
  return useCompactViewport(collapsible ? COLLAPSED_RAIL_QUERY : NEVER_QUERY);
}
