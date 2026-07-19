/**
 * DS-06 Shared Forms — unsaved-changes navigation protection.
 *
 * A draft the user has not committed must never be discarded silently. This hook
 * intercepts BOTH kinds of departure while a form is dirty:
 *   - in-app navigation (a link, a Back button, or a DS-03 Drawer close/replace)
 *     via React Router's `useBlocker`, surfaced as a `blocked` state the UI turns
 *     into an explicit confirm;
 *   - a full-page unload (tab close, reload) via `beforeunload`, which shows the
 *     browser's native "leave site?" prompt.
 *
 * DS-03's Drawer stack lives ENTIRELY in the URL's repeated `drawer` search
 * parameter, and closing/replacing a drawer is a same-pathname, search-param-only
 * navigation. A pathname-only guard would therefore miss a drawer close that
 * unmounts a dirty form. So a form hosted in a drawer passes its `drawerKey`: the
 * guard then also blocks any navigation that removes THAT drawer level from the
 * stack (close, Escape, Back, `closeDrawer`, `replaceDrawer`, removing the active
 * `drawer` param, or navigating to another record at the same depth) — while
 * allowing harmless changes that provably keep the form mounted (a deeper drawer
 * pushed on top, an unrelated filter param, the same URL).
 */

import { useEffect } from "react";
import { useBeforeUnload, useBlocker } from "react-router";

import { DEFAULT_DRAWER_PARAM, readDrawerStack } from "~/shared/drawer";

export interface UnsavedChangesOptions {
  /**
   * When the form is hosted inside a DS-03 Drawer, its drawer key. The guard then
   * blocks any navigation whose next drawer stack no longer contains this key.
   */
  readonly drawerKey?: string;
  /** The drawer search-param name (defaults to DS-03's `drawer`). */
  readonly drawerParam?: string;
}

export interface UnsavedChangesPrompt {
  /** True when an in-app navigation is currently held pending confirmation. */
  readonly blocked: boolean;
  /** Allow the held navigation to continue (discard the draft). */
  readonly proceed: () => void;
  /** Cancel the held navigation and stay on the form. */
  readonly stay: () => void;
}

/**
 * Arm unsaved-changes protection while `when` is true. Returns the current
 * blocked state and the two resolutions (proceed / stay) for the confirm UI.
 */
export function useUnsavedChangesPrompt(
  when: boolean,
  options: UnsavedChangesOptions = {},
): UnsavedChangesPrompt {
  const { drawerKey, drawerParam = DEFAULT_DRAWER_PARAM } = options;

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (!when) return false;
    // Leaving the page entirely always risks the draft.
    if (currentLocation.pathname !== nextLocation.pathname) return true;
    // For a drawer-hosted form, block only when the form's own drawer level would
    // be removed/replaced (i.e. the key is gone from the next stack). A deeper
    // drawer pushed on top, or an unrelated param change, keeps the form mounted.
    if (drawerKey) {
      const nextStack = readDrawerStack(
        new URLSearchParams(nextLocation.search),
        drawerParam,
      );
      if (!nextStack.includes(drawerKey)) return true;
    }
    return false;
  });

  useBeforeUnload(
    (event) => {
      if (!when) return;
      event.preventDefault();
      // Legacy browsers require a returnValue to trigger the native prompt.
      event.returnValue = "";
    },
    { capture: true },
  );

  // If the guard disarms (e.g. after a successful save) while a navigation is
  // held, release it so the user is not stranded.
  useEffect(() => {
    if (!when && blocker.state === "blocked") {
      blocker.proceed();
    }
  }, [when, blocker]);

  return {
    blocked: blocker.state === "blocked",
    proceed: () => {
      if (blocker.state === "blocked") blocker.proceed();
    },
    stay: () => {
      if (blocker.state === "blocked") blocker.reset();
    },
  };
}
