/**
 * NOTES-01C — viewport-width detection for the desktop split editor.
 *
 * Mirrors `~/shared/inspector/use-compact-viewport.ts` exactly (a `matchMedia`
 * listener, SSR-safe default). SSR renders `false` (narrow/Source-first) and
 * the real value resolves after mount — the split layout only ever engages on
 * the client, so there is no hydration mismatch.
 */

import { useEffect, useState } from "react";

export function useIsWideViewport(query: string): boolean {
  const [wide, setWide] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const mql = window.matchMedia(query);
    const update = () => setWide(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);

  return wide;
}
