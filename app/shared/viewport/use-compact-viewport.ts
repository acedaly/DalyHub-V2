/**
 * The shared compact-viewport signal (promoted from DS-10's Inspector by
 * MOBILE-01, so there is one implementation rather than one per surface).
 *
 * A few behaviours genuinely cannot be expressed in CSS because they change the
 * DOM, not just its presentation — the Inspector becoming a modal sheet (focus
 * trap, scroll lock, inert background) and the Record Layout moving surplus tabs
 * into a "More sections" menu. Those need a boolean, and this is the ONE place
 * that boolean is derived.
 *
 * It is deliberately desktop-first on the server: SSR renders `false`, so the
 * first byte is the full desktop structure and the client narrows after mount.
 * That means no hydration mismatch, and a browser without `matchMedia` (or with
 * JavaScript unavailable) gets the complete, non-collapsed markup rather than a
 * phone layout it cannot undo.
 *
 * Anything that is purely presentational must stay in CSS — a media or container
 * query — rather than being routed through this hook.
 */

import { useEffect, useState } from "react";

/** The DS-01 `md` breakpoint (48rem = 768px), mirrored from the token. */
export const COMPACT_VIEWPORT_QUERY = "(max-width: 48rem)";

export function useCompactViewport(
  query: string = COMPACT_VIEWPORT_QUERY,
): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const mql = window.matchMedia(query);
    const update = () => setCompact(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);

  return compact;
}
