/**
 * DS-09 Command Palette — the presentation-context hook.
 *
 * Assembles the small, safe {@link PaletteContext} from the router location and the
 * DS-03 Drawer URL — pathname, the owning module (the first path segment, which is
 * the module's route base by convention), whether a Drawer is open, and the top
 * Drawer key as OPAQUE data (never parsed here). It carries no workspace id, no
 * session claims and no product data (ADR-024 §24.6). It reuses the Drawer's pure
 * URL helper, never the Drawer React barrel.
 */

import { useMemo } from "react";
import { useLocation } from "react-router";

import { readDrawerStack } from "~/shared/drawer/drawer-url";

import type { PaletteContext } from "./model";

/** Derive the current palette presentation context. */
export function useCommandContext(): PaletteContext {
  const location = useLocation();
  return useMemo(() => {
    const params = new URLSearchParams(location.search);
    const stack = readDrawerStack(params);
    const firstSegment = location.pathname.split("/").filter(Boolean)[0];
    const topKey = stack.length > 0 ? stack[stack.length - 1] : undefined;
    return {
      pathname: location.pathname,
      ...(firstSegment === undefined ? {} : { moduleId: firstSegment }),
      drawerOpen: stack.length > 0,
      ...(topKey === undefined ? {} : { topDrawerKey: topKey }),
      selectionCount: 0,
    };
  }, [location.pathname, location.search]);
}
