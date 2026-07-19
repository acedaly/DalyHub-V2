/**
 * DS-08 Shared Search — navigation-target validation (pure, React-free).
 *
 * A module describes how a result opens with a typed {@link SearchResultTarget}.
 * Because a target is data a provider produces, Search treats it as untrusted and
 * validates it at the boundary before it ever reaches a link or a navigation:
 *
 *   - in-app paths must be app-relative (`/today`), never external;
 *   - `javascript:` (and any other scheme) is rejected — a scheme has no leading
 *     `/`, so the app-relative rule already excludes it;
 *   - protocol-relative URLs (`//evil.example`) are rejected;
 *   - backslash and control characters are rejected;
 *   - the opaque Drawer key is length-bounded but never parsed.
 *
 * Rejecting a target drops the result (the caller degrades gracefully); Search
 * never navigates to an unvalidated destination.
 */

import { MAX_DRAWER_KEY_LENGTH, MAX_PATH_LENGTH } from "./limits";
import type { SearchResultTarget } from "./types";

/** True when a string contains any C0/C1 control character or DEL. */
function hasControlCharacter(value: string): boolean {
  for (const cp of value) {
    const code = cp.codePointAt(0) ?? 0;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
      return true;
    }
  }
  return false;
}

/**
 * True when `path` is a safe in-app, app-relative navigation path. Rejects
 * external URLs, schemes (`javascript:`, `data:`, `https:`), protocol-relative
 * `//…`, backslashes and control characters.
 */
export function isSafeInAppPath(path: unknown): path is string {
  if (typeof path !== "string") {
    return false;
  }
  if (path.length === 0 || path.length > MAX_PATH_LENGTH) {
    return false;
  }
  if (!path.startsWith("/")) {
    return false; // must be app-relative — excludes every scheme and bare host
  }
  if (path.startsWith("//")) {
    return false; // protocol-relative
  }
  if (path.includes("\\")) {
    return false; // backslash smuggling
  }
  if (hasControlCharacter(path)) {
    return false;
  }
  return true;
}

/**
 * Validate an untrusted target. Returns a fresh, minimal, safe target or null.
 * Never mutates the input and never returns an object carrying extra properties.
 */
export function validateTarget(target: unknown): SearchResultTarget | null {
  if (target === null || typeof target !== "object") {
    return null;
  }
  const candidate = target as { readonly kind?: unknown };

  if (candidate.kind === "drawer") {
    const { drawerKey, canonicalPath } = target as {
      readonly drawerKey?: unknown;
      readonly canonicalPath?: unknown;
    };
    if (
      typeof drawerKey !== "string" ||
      drawerKey.trim().length === 0 ||
      drawerKey.length > MAX_DRAWER_KEY_LENGTH
    ) {
      return null;
    }
    if (canonicalPath === undefined) {
      return { kind: "drawer", drawerKey };
    }
    if (!isSafeInAppPath(canonicalPath)) {
      return null;
    }
    return { kind: "drawer", drawerKey, canonicalPath };
  }

  if (candidate.kind === "route") {
    const { to } = target as { readonly to?: unknown };
    if (!isSafeInAppPath(to)) {
      return null;
    }
    return { kind: "route", to };
  }

  return null;
}
