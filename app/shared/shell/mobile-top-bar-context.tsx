/**
 * MOBILE-01 — the phone top bar's route-published contents.
 *
 * A route names itself once; the shell renders it. This keeps the phone bar
 * honest (it always says where you are) without every module re-implementing a
 * header, and without the bar duplicating a title the page already shows — the
 * route decides which of the two carries the name at phone width.
 *
 * Deliberately tiny: a title, an optional Back target, and a node for the route's
 * contextual actions. Anything richer belongs in the page, not in the chrome.
 */

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type MobileTopBarState = {
  /** The current route's title, or null to fall back to the workspace name. */
  readonly title: string | null;
  /** A contextual Back target, or null when the route has no parent. */
  readonly backTo: string | null;
  /** The route's contextual actions (rendered before Search). */
  readonly actions: ReactNode;
};

export type MobileTopBarContextValue = MobileTopBarState & {
  readonly publish: (state: Partial<MobileTopBarState>) => void;
};

const EMPTY: MobileTopBarState = { title: null, backTo: null, actions: null };

const MobileTopBarContext = createContext<MobileTopBarContextValue | null>(
  null,
);

/** Read the currently-published top-bar state (used by the shell's bar). */
export function useMobileTopBar(): MobileTopBarState {
  return useContext(MobileTopBarContext) ?? EMPTY;
}

/**
 * Publish this route's phone top-bar identity for as long as it is mounted, and
 * clear it on unmount so a stale title can never outlive its route.
 *
 * Desktop is unaffected: the bar it feeds is `display: none` above `md`.
 */
export function useSetMobileTopBar(state: Partial<MobileTopBarState>): void {
  const context = useContext(MobileTopBarContext);
  const publish = context?.publish;
  const { title = null, backTo = null, actions = null } = state;

  useEffect(() => {
    if (!publish) {
      return;
    }
    publish({ title, backTo, actions });
    return () => publish(EMPTY);
  }, [publish, title, backTo, actions]);
}

export function MobileTopBarProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [state, setState] = useState<MobileTopBarState>(EMPTY);

  const value = useMemo<MobileTopBarContextValue>(
    () => ({
      ...state,
      publish: (next) => setState((prev) => ({ ...prev, ...next })),
    }),
    [state],
  );

  return (
    <MobileTopBarContext.Provider value={value}>
      {children}
    </MobileTopBarContext.Provider>
  );
}
