/**
 * The owner's DISPLAY identity, derived from the facts an authenticated session
 * already carries. Pure string helpers — no React, no DOM, no storage — so both a
 * client component (the shell's User menu) and a server loader (Today's hero
 * greeting) can share ONE derivation instead of each inventing its own.
 *
 * They were previously private to `UserMenu.tsx`. Today's loader needs the same
 * "what do we call this person?" answer to greet the owner by name, and importing a
 * React component module into a loader to reach a pure function is the kind of
 * accidental coupling that makes a second, drifting copy look reasonable. The
 * component re-exports these, so every existing import path still resolves.
 */

/** Derive a friendly display name from an email local part ("aidan" → "Aidan"). */
export function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const words = local.split(/[._-]+/).filter(Boolean);
  if (words.length === 0) {
    return email;
  }
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Derive up-to-two-letter initials for the avatar. */
export function initialsFromName(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  if (words.length === 1) {
    return words[0]!.slice(0, 2).toUpperCase();
  }
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}

/**
 * The name to GREET the owner with: their first name.
 *
 * A greeting is the one place the product speaks to the owner rather than about
 * them, so it uses the short form ("Good morning, Aidan") — never the full display
 * name, and never the email. Returns `null` when no usable name can be derived, so
 * the caller falls back to the plain greeting rather than to a placeholder.
 */
export function greetingNameFor(
  displayName: string | null | undefined,
  email: string | null | undefined,
): string | null {
  const source =
    displayName?.trim() ||
    (email && email.trim() !== "" ? displayNameFromEmail(email) : "");
  const first = source.split(/\s+/).filter(Boolean)[0];
  if (first === undefined || first === "") {
    return null;
  }
  // An email-derived name can still be an address-shaped token; never greet with
  // something that reads like an identifier.
  return first.includes("@") ? null : first;
}
