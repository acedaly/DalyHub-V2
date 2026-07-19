/**
 * DS-09 Command Palette — the single global shortcut dispatcher (React hook).
 *
 * ONE document listener drives every DalyHub keyboard shortcut — there is never a
 * listener per command (ADR-024 §24.13). It: normalises `mod` to Meta on macOS and
 * Control elsewhere; ignores ordinary character shortcuts while typing in an input,
 * textarea, select or editable element (but permits reserved/`allowInInput`
 * bindings such as `Mod+K`); ignores browser auto-repeat so one physical press
 * fires once; resolves collisions deterministically by precedence (a matching
 * binding earlier in the list wins) so ONE key event triggers at most ONE action;
 * respects each binding's `enabled` flag; and calls `preventDefault` ONLY when a
 * binding actually claims the event. Everything is cleaned up on unmount.
 */

import { useEffect, useRef } from "react";

// Import the specific pure modules (not the `./model` barrel, which pulls the
// whole DS-08 + command model), so the always-on shell dispatcher stays tiny.
import { matchesShortcut, type ShortcutPlatform } from "./shortcut";
import type { CommandShortcut } from "./types";
import { detectShortcutPlatform } from "./platform";

/** One shortcut binding the dispatcher may fire. */
export type ShortcutBinding = {
  readonly shortcut: CommandShortcut;
  readonly onTrigger: () => void;
  /** Whether this binding is currently active (default true). */
  readonly enabled?: boolean;
  /**
   * Whether this binding fires even while the user is typing in a field. Reserved
   * global shortcuts (`Mod+K`) set this; ordinary character shortcuts do not.
   */
  readonly allowInInput?: boolean;
};

/** Options for the dispatcher. */
export type UseCommandShortcutsOptions = {
  /** The platform for `mod` resolution (auto-detected when omitted). */
  readonly platform?: ShortcutPlatform;
  /** Master switch — when false, no shortcut fires (default true). */
  readonly enabled?: boolean;
};

/** True when the event target is a text-entry or editable element. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }
  return target.isContentEditable;
}

/**
 * Attach the shared shortcut dispatcher. Bindings are matched in order, so put
 * higher-precedence bindings (contextual, then registered) first; reserved global
 * bindings should set `allowInInput`.
 */
export function useCommandShortcuts(
  bindings: readonly ShortcutBinding[],
  options: UseCommandShortcutsOptions = {},
): void {
  // Keep the latest bindings/options in a ref so the single listener never needs
  // to re-attach when they change (stable listener, no per-command churn).
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const opts = optionsRef.current;
      if (opts.enabled === false) {
        return;
      }
      // Ignore browser auto-repeat so a held key fires exactly once.
      if (event.repeat || event.defaultPrevented) {
        return;
      }
      const platform = opts.platform ?? detectShortcutPlatform();
      const typing = isTypingTarget(event.target);

      for (const binding of bindingsRef.current) {
        if (binding.enabled === false) {
          continue;
        }
        if (typing && binding.allowInInput !== true) {
          continue;
        }
        if (!matchesShortcut(binding.shortcut, event, platform)) {
          continue;
        }
        // A DalyHub binding claims this event: prevent default and fire exactly
        // one action, then stop — one event never triggers two commands.
        event.preventDefault();
        binding.onTrigger();
        return;
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
