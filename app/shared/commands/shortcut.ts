/**
 * DS-09 Command Palette — keyboard-shortcut model (pure, React-free).
 *
 * Shortcuts are declared as data (`CommandShortcut`) and this module turns them
 * into: a canonical comparison form, a platform-correct display string, a match
 * predicate over a plain key-event descriptor (no DOM needed, so it is unit
 * testable), a deterministic collision resolver, and the reserved-vocabulary
 * guard. `mod` is symbolic here; it resolves to Meta on macOS and Control
 * elsewhere only at match/display time (ADR-024 §24.11). No listener is attached
 * here — the shared dispatcher hook owns that.
 */

import type { CommandShortcut } from "./types";

/** The platform whose modifier conventions apply. */
export type ShortcutPlatform = "mac" | "other";

/** The modifiers a shortcut may require. */
export type ShortcutModifier = "mod" | "shift" | "alt" | "ctrl" | "meta";

const MODIFIER_ORDER: readonly ShortcutModifier[] = [
  "mod",
  "meta",
  "ctrl",
  "alt",
  "shift",
];

/** A shortcut in canonical comparison form: lowercased key + sorted modifiers. */
export type NormalisedShortcut = {
  readonly key: string;
  readonly modifiers: readonly ShortcutModifier[];
};

/** Normalise a declared shortcut to its canonical comparison form. */
export function normaliseShortcut(
  shortcut: CommandShortcut,
): NormalisedShortcut {
  const seen = new Set<ShortcutModifier>();
  for (const modifier of shortcut.modifiers ?? []) {
    seen.add(modifier);
  }
  const modifiers = MODIFIER_ORDER.filter((modifier) => seen.has(modifier));
  return { key: shortcut.key.toLowerCase(), modifiers };
}

/** A stable string key for a shortcut, for use in maps and collision detection. */
export function shortcutSignature(shortcut: CommandShortcut): string {
  const normalised = normaliseShortcut(shortcut);
  return [...normalised.modifiers, normalised.key].join("+");
}

/**
 * Reserved GLOBAL shortcuts owned by the app shell: `Mod+K` (Command Palette) and
 * a bare `/` (Search). A module command may never claim one (the kernel refuses
 * it at construction); the dispatcher also refuses to let anything else bind them.
 */
export const RESERVED_SHORTCUTS: readonly NormalisedShortcut[] = [
  { key: "k", modifiers: ["mod"] },
  { key: "/", modifiers: [] },
];

/** True when a shortcut matches a reserved global shortcut. */
export function isReservedShortcut(shortcut: CommandShortcut): boolean {
  const normalised = normaliseShortcut(shortcut);
  return RESERVED_SHORTCUTS.some(
    (reserved) =>
      reserved.key === normalised.key &&
      reserved.modifiers.length === normalised.modifiers.length &&
      reserved.modifiers.every((m, i) => m === normalised.modifiers[i]),
  );
}

const DISPLAY_GLYPHS_MAC: Record<ShortcutModifier, string> = {
  mod: "⌘", // ⌘
  meta: "⌘",
  ctrl: "⌃", // ⌃
  alt: "⌥", // ⌥
  shift: "⇧", // ⇧
};

const DISPLAY_LABELS_OTHER: Record<ShortcutModifier, string> = {
  mod: "Ctrl",
  meta: "Win",
  ctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
};

/** Display a key nicely (uppercase single letters; spell common named keys). */
function displayKey(key: string): string {
  const named: Record<string, string> = {
    enter: "↵",
    escape: "Esc",
    arrowup: "↑",
    arrowdown: "↓",
    " ": "Space",
  };
  const lower = key.toLowerCase();
  if (lower in named) {
    return named[lower];
  }
  return key.length === 1 ? key.toUpperCase() : key;
}

/**
 * A platform-correct display string for a shortcut (e.g. `⌘⇧P` on macOS,
 * `Ctrl+Shift+P` elsewhere). Decorative only — the accessible label already
 * explains the action, so the hint is `aria-hidden` in the UI.
 */
export function formatShortcut(
  shortcut: CommandShortcut,
  platform: ShortcutPlatform,
): string {
  const normalised = normaliseShortcut(shortcut);
  if (platform === "mac") {
    return (
      normalised.modifiers.map((m) => DISPLAY_GLYPHS_MAC[m]).join("") +
      displayKey(normalised.key)
    );
  }
  return [
    ...normalised.modifiers.map((m) => DISPLAY_LABELS_OTHER[m]),
    displayKey(normalised.key),
  ].join("+");
}

/** The minimal key-event facts the matcher needs (no DOM dependency). */
export type ShortcutKeyEvent = {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
};

/**
 * True when a key event exactly matches a shortcut on the given platform. `mod`
 * resolves to Meta on macOS and Control elsewhere. The match is EXACT: every
 * required modifier must be pressed and no unrequired modifier may be — so
 * `Mod+K` never fires on `Mod+Shift+K`, and one event maps to at most one binding.
 */
export function matchesShortcut(
  shortcut: CommandShortcut,
  event: ShortcutKeyEvent,
  platform: ShortcutPlatform,
): boolean {
  const normalised = normaliseShortcut(shortcut);
  if (event.key.toLowerCase() !== normalised.key) {
    return false;
  }
  const wantMeta = normalised.modifiers.includes("meta");
  const wantCtrl = normalised.modifiers.includes("ctrl");
  const wantAlt = normalised.modifiers.includes("alt");
  const wantShift = normalised.modifiers.includes("shift");
  const wantMod = normalised.modifiers.includes("mod");

  const modIsMeta = platform === "mac";
  const needMeta = wantMeta || (wantMod && modIsMeta);
  const needCtrl = wantCtrl || (wantMod && !modIsMeta);

  return (
    event.metaKey === needMeta &&
    event.ctrlKey === needCtrl &&
    event.altKey === wantAlt &&
    event.shiftKey === wantShift
  );
}

/** One command's shortcut claim, for collision resolution. */
export type ShortcutClaim = {
  readonly id: string;
  readonly shortcut: CommandShortcut;
};

/** The deterministic outcome of resolving shortcut collisions. */
export type ShortcutResolution = {
  /** Shortcut signature → the command id that owns it (first claimant wins). */
  readonly assignments: ReadonlyMap<string, string>;
  /** Later claims that lost to an earlier one, in input order. */
  readonly conflicts: readonly {
    readonly signature: string;
    readonly keptCommandId: string;
    readonly droppedCommandId: string;
  }[];
};

/**
 * Resolve shortcut collisions deterministically: iterate claims in the given
 * (already-deterministic) order; the FIRST command to claim a signature owns it,
 * and every later claim on that signature is recorded as a conflict and dropped.
 * A reserved global shortcut is never assignable and always conflicts. This means
 * one key event can only ever trigger one command.
 */
export function resolveShortcutCollisions(
  claims: readonly ShortcutClaim[],
): ShortcutResolution {
  const assignments = new Map<string, string>();
  const conflicts: ShortcutResolution["conflicts"] = [];
  const mutableConflicts = conflicts as {
    signature: string;
    keptCommandId: string;
    droppedCommandId: string;
  }[];

  for (const claim of claims) {
    const signature = shortcutSignature(claim.shortcut);
    if (isReservedShortcut(claim.shortcut)) {
      mutableConflicts.push({
        signature,
        keptCommandId: "@reserved",
        droppedCommandId: claim.id,
      });
      continue;
    }
    const existing = assignments.get(signature);
    if (existing !== undefined) {
      mutableConflicts.push({
        signature,
        keptCommandId: existing,
        droppedCommandId: claim.id,
      });
      continue;
    }
    assignments.set(signature, claim.id);
  }

  return { assignments, conflicts };
}
