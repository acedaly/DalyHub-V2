/**
 * DS-03 — the drawer stack renderer (internal).
 *
 * Rendered only while at least one drawer is open. It owns the concerns that are
 * per-stack rather than per-panel: body-scroll locking, making the whole
 * background inert, the single restrained backdrop beneath the top panel, and
 * evaluating the top drawer's `preventClose` guard before any close is honoured.
 *
 * Each panel is keyed by BOTH its stack depth AND its record key. Depth keeps a
 * lower drawer mounted when a higher one is pushed above it (its identity is
 * unchanged), while the key ensures that REPLACING the record at a depth (same
 * depth, new key) remounts that level — so record-local state (uncontrolled tabs,
 * local/scroll state, mount-only initial focus) never leaks from the replaced
 * record into its replacement. The same record key may legitimately appear at
 * different depths and stays uniquely keyed. The single backdrop carries its own
 * stable key so a top replace does not needlessly re-create it.
 *
 * The stack renders inline (no portal) so it server-renders for direct deep links
 * and degrades coherently without JavaScript; z-index layering uses DS-01 tokens.
 */

import { useRef } from "react";
import type { ReactNode, RefObject } from "react";

import { Drawer } from "./Drawer";
import { useBodyScrollLock } from "./use-body-scroll-lock";
import { useInertBackground } from "./use-inert-background";
import type { DrawerEntry, DrawerRenderResult } from "./types";

export interface DrawerStackProps {
  readonly entries: readonly DrawerEntry[];
  readonly renderDrawer: (entry: DrawerEntry) => DrawerRenderResult | null;
  /** Per-depth opener elements captured at open time, for focus restoration. */
  readonly openers: RefObject<(HTMLElement | null)[]>;
  /** Close the top drawer via the controller (Back-aware). */
  readonly onRequestClose: () => void;
}

/** Evaluate a `preventClose` value (boolean or predicate). */
function isCloseBlocked(result: DrawerRenderResult | null): boolean {
  const preventClose = result?.preventClose;
  if (typeof preventClose === "function") {
    return preventClose();
  }
  return preventClose === true;
}

export function DrawerStack({
  entries,
  renderDrawer,
  openers,
  onRequestClose,
}: DrawerStackProps) {
  const stackRef = useRef<HTMLDivElement>(null);

  // Per-stack effects: lock the page and isolate everything behind the stack.
  useBodyScrollLock(true);
  useInertBackground(stackRef, true);

  // Resolve content once so the backdrop guard and the panels agree.
  const rendered = entries.map((entry) => ({
    entry,
    result: renderDrawer(entry),
  }));
  const top = rendered[rendered.length - 1];

  // A guarded close honoured by Escape, the header button and the backdrop.
  const attemptClose = () => {
    if (top && isCloseBlocked(top.result)) {
      return;
    }
    onRequestClose();
  };

  // Build a flat child list so the backdrop keeps a stable identity independent of
  // the panels: the backdrop sits directly beneath the top panel (dimming lower
  // levels, under the top), and each panel is keyed by `depth:key`.
  const children: ReactNode[] = [];
  for (const { entry, result } of rendered) {
    if (entry.isTop) {
      children.push(
        <div
          key="drawer-backdrop"
          className="drawer-backdrop"
          data-drawer-backdrop="true"
          // The backdrop is a convenience click target; keyboard users close via
          // Escape or the labelled close button, so it needs no role.
          aria-hidden="true"
          onClick={attemptClose}
        />,
      );
    }
    children.push(
      <Drawer
        key={`drawer-${entry.depth}:${entry.key}`}
        entry={entry}
        result={result}
        opener={openers.current[entry.depth] ?? null}
        onClose={attemptClose}
      />,
    );
  }

  return (
    <div className="drawer-stack" ref={stackRef} data-drawer-stack="true">
      {children}
    </div>
  );
}
