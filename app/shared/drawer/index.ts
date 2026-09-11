/**
 * DS-03 — public entry for the Shared Drawer.
 *
 * The workhorse of DalyHub navigation: open any record over the current page
 * without losing the user's place, deep-linkable and stackable, hosting the DS-02
 * Record Layout (DESIGN_SYSTEM.md → Drawer). The API is small and entity-agnostic
 * — mount one `DrawerProvider`, map a key to content, and open/close with
 * `useDrawer` or `DrawerTrigger`. Focus, background inertness, body-scroll locking,
 * the URL/history contract and z-index stacking are all handled for you.
 *
 * The internal panel, stack, focus-trap, scroll-lock and inert helpers are
 * deliberately NOT exported — consumers never manage those concerns.
 */

export { DrawerProvider } from "./DrawerProvider";
export type { DrawerProviderProps } from "./DrawerProvider";
export { DrawerTrigger } from "./DrawerTrigger";
export type { DrawerTriggerProps } from "./DrawerTrigger";
export { DrawerButton } from "./DrawerButton";
export type { DrawerButtonProps } from "./DrawerButton";
export { DrawerClose } from "./DrawerClose";
export type { DrawerCloseProps } from "./DrawerClose";
export { useDrawer } from "./use-drawer";

// URL-contract helpers, for consumers that build drawer deep links or assert the
// stack in tests. Pure functions with no React/router dependency.
export {
  DEFAULT_DRAWER_PARAM,
  MAX_DRAWER_DEPTH,
  readDrawerStack,
  withAllDrawersRemoved,
  withDrawerPushed,
  withTopDrawerRemoved,
  withTopDrawerReplaced,
} from "./drawer-url";

export type {
  DrawerController,
  DrawerEntry,
  DrawerKey,
  DrawerRenderResult,
  DrawerSize,
} from "./types";
