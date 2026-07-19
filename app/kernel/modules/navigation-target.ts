/**
 * FND-06 Module Registry kernel — navigation-target validation (pure, React-free).
 *
 * A module describes how a navigation command (or a search result — DS-08) opens
 * with a typed {@link SearchResultTarget}. Because a target is data a manifest (or
 * a provider) produces, it is treated as UNTRUSTED and validated at the boundary
 * before it ever reaches a link or a navigation:
 *
 *   - in-app paths must be app-relative (`/today`), never external;
 *   - `javascript:` (and any other scheme) is rejected — a scheme has no leading
 *     `/`, so the app-relative rule already excludes it;
 *   - protocol-relative URLs (`//evil.example`) are rejected;
 *   - backslash and control characters are rejected;
 *   - the opaque Drawer key is length-bounded but never parsed.
 *
 * DS-08 introduced this validation for search results (ADR-023 §23.3, then in
 * `app/shared/search/target.ts`). DS-09 needs the SAME rules to validate the
 * navigation targets a module declares STATICALLY on a `kind: "navigate"` command
 * at registry-construction time. Rather than duplicate the logic, the single
 * implementation lives here — colocated with the `SearchResultTarget` type it
 * validates (which the kernel already owns, ADR-023 §23.3) — and DS-08's
 * `target.ts` re-exports it (ADR-024). It imports only a type, so this file has no
 * runtime dependency and is safe to bundle wherever the kernel contract is used.
 */

import type { SearchResultTarget } from "./module-capabilities";

/**
 * Maximum length of an app-relative navigation path, in characters. Matches the
 * DS-08 bound (`MAX_PATH_LENGTH`) so the relocation changes no behaviour.
 */
export const MAX_NAVIGATION_PATH_LENGTH = 2048;

/**
 * Maximum length of an opaque Drawer key, in characters. Matches the DS-08 bound
 * (`MAX_DRAWER_KEY_LENGTH`); the key is bounded but never parsed by shared code.
 */
export const MAX_NAVIGATION_DRAWER_KEY_LENGTH = 256;

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
  if (path.length === 0 || path.length > MAX_NAVIGATION_PATH_LENGTH) {
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
 * Validate an untrusted navigation target. Returns a fresh, minimal, safe target
 * or null. Never mutates the input and never returns an object carrying extra
 * properties, so a later mutation of the source can never reach a consumer.
 */
export function validateNavigationTarget(
  target: unknown,
): SearchResultTarget | null {
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
      drawerKey.length > MAX_NAVIGATION_DRAWER_KEY_LENGTH
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
