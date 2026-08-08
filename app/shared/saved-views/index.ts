/**
 * X-02 — public entry for the shared saved-view switcher.
 *
 * One control for every collection that has saved views (Tasks, cross-module
 * Views). A module supplies its own base path, action path, copy and BEM/test-id
 * prefixes; it never builds a second switcher.
 */

export {
  SavedViewSwitcher,
  type SavedViewSwitcherProps,
  type SavedViewOption,
  type SavedViewActionResult,
} from "./SavedViewSwitcher";
