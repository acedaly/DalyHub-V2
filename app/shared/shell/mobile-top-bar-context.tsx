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

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
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
  /** Register/replace this publisher's entry; `null` removes it. */
  readonly publish: (id: string, state: MobileTopBarState | null) => void;
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
 * Publish this surface's phone top-bar identity for as long as it is mounted, and
 * withdraw it on unmount so a stale title can never outlive its route.
 *
 * Publishers STACK. A collection publishes its name; a record opened over it
 * publishes the record's, and closing the record reveals the collection's again.
 * A single slot would have the record's unmount blank the bar instead — which is
 * exactly the state a phone user would be left staring at after closing a drawer.
 *
 * Desktop is unaffected: the bar it feeds is `display: none` above `md`.
 */
export function useSetMobileTopBar(state: Partial<MobileTopBarState>): void {
  const context = useContext(MobileTopBarContext);
  const publish = context?.publish;
  const id = useId();
  const { title = null, backTo = null, actions = null } = state;

  useEffect(() => {
    if (!publish) {
      return;
    }
    publish(id, { title, backTo, actions });
    return () => publish(id, null);
  }, [publish, id, title, backTo, actions]);
}

export function MobileTopBarProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  // Insertion-ordered, so "the most recently mounted publisher" is simply the
  // last entry, and withdrawing one restores the one beneath it.
  const [entries, setEntries] = useState<
    readonly (readonly [string, MobileTopBarState])[]
  >([]);

  const publish = useCallback((id: string, next: MobileTopBarState | null) => {
    setEntries((prev) => {
      const without = prev.filter(([key]) => key !== id);
      return next === null ? without : [...without, [id, next] as const];
    });
  }, []);

  const value = useMemo<MobileTopBarContextValue>(
    () => ({
      ...(entries.length > 0 ? entries[entries.length - 1][1] : EMPTY),
      publish,
    }),
    [entries, publish],
  );

  return (
    <MobileTopBarContext.Provider value={value}>
      {children}
    </MobileTopBarContext.Provider>
  );
}
