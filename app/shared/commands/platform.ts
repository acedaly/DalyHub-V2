/**
 * DS-09 Command Palette — platform detection for shortcut display/matching.
 *
 * Resolves whether `mod` should read as Meta (macOS) or Control (everywhere else).
 * SSR-safe: returns `"other"` when there is no `navigator`. Runtime-only (DOM), so
 * it lives outside the React-free model.
 */

import type { ShortcutPlatform } from "./model";

/** Detect the current platform for `mod` resolution and shortcut display. */
export function detectShortcutPlatform(): ShortcutPlatform {
  if (typeof navigator === "undefined") {
    return "other";
  }
  const haystack = `${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`;
  return /Mac|iPhone|iPad|iPod/i.test(haystack) ? "mac" : "other";
}
