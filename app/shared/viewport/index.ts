/**
 * MOBILE-01 — public entry for the shared phone-viewport utilities.
 *
 * `useKeyboardInset` is mounted ONCE by the AppShell and is the only Visual
 * Viewport listener in the product; surfaces consume its published
 * `--dh-keyboard-inset` custom property from CSS.
 */

export {
  KEYBOARD_INSET_PROPERTY,
  KEYBOARD_INSET_NOISE_THRESHOLD,
  resolveKeyboardInset,
} from "./keyboard-inset";
export type { KeyboardInsetInput } from "./keyboard-inset";
export { useKeyboardInset } from "./use-keyboard-inset";
export {
  COMPACT_VIEWPORT_QUERY,
  useCompactViewport,
} from "./use-compact-viewport";
