/**
 * DS-10 Inspector — compact-viewport detection.
 *
 * Below the DS-01 `md` breakpoint the Inspector becomes a modal sheet; above it,
 * a docked, resizable side panel. SSR renders the docked (desktop-first) form and
 * the real value is resolved after mount, so there is no hydration mismatch — the
 * sheet-only modal behaviour (focus trap, scroll lock, inert background) is gated
 * on this and only ever engages on the client.
 */

import { useEffect, useState } from "react";

/** The DS-01 `md` breakpoint (48rem = 768px). */
export const INSPECTOR_COMPACT_QUERY = "(max-width: 48rem)";

export function useCompactViewport(): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const mql = window.matchMedia(INSPECTOR_COMPACT_QUERY);
    const update = () => setCompact(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  return compact;
}
