/**
 * DS-09 Command Palette — the shared action model + Card/Header adapters.
 *
 * ONE `AppAction` identity is the single source of truth for an action, so the
 * same instance can appear as a Command Palette command, a DS-04 Card action, a
 * DS-02 Record Header action and a direct keyboard action — with ONE execution
 * path, no duplicated business logic and consistent pointer/keyboard behaviour
 * (ADR-024 §24.12/§24.14). The adapters DO NOT create new Card/Header components;
 * they only project an `AppAction` into the existing `CardAction` / `RecordAction`
 * contracts.
 *
 * An action either navigates (a validated target) or runs a client callback that
 * returns a typed outcome — for a persistent mutation, that callback calls an
 * authorised server action; the client context is never treated as authority.
 */

import type { ReactNode } from "react";

import type { CardAction } from "~/shared/card";
import type { RecordAction } from "~/shared/record-layout";

import type {
  CommandExecutionOutcome,
  CommandShortcut,
  PaletteCommand,
  SearchResultTarget,
} from "./types";
import type { ShortcutBinding } from "./useCommandShortcuts";

/** How an action is carried out. */
export type AppActionActivation =
  | { readonly kind: "navigate"; readonly target: SearchResultTarget }
  | {
      readonly kind: "run";
      /** A client callback returning a typed outcome (or void / a promise). */
      readonly run: () =>
        | CommandExecutionOutcome
        | void
        | Promise<CommandExecutionOutcome | void>;
    };

/** A single shared action — one identity, one execution path. */
export type AppAction = {
  /** Stable identity, unique within its surface/registration. */
  readonly id: string;
  /** The visible label and accessible name. */
  readonly title: string;
  /** Optional secondary text (palette subtitle / tooltip). */
  readonly subtitle?: string;
  /** Optional keywords for palette matching. */
  readonly keywords?: readonly string[];
  /** Optional declarative keyboard-shortcut metadata. */
  readonly shortcut?: CommandShortcut;
  /** Optional icon for Card/Header rendering (decorative). */
  readonly icon?: ReactNode;
  /** Disabled: shown but not activatable (distinct from omitted/unavailable). */
  readonly disabled?: boolean;
} & AppActionActivation;

/** Project a shared action into a normalised palette command (for ranking). */
export function appActionToPaletteCommand(action: AppAction): PaletteCommand {
  return {
    id: action.id,
    source: "contextual",
    kind: action.kind === "navigate" ? "navigate" : "execute",
    title: action.title,
    ...(action.subtitle === undefined ? {} : { subtitle: action.subtitle }),
    keywords: action.keywords ?? [],
    ...(action.shortcut === undefined ? {} : { shortcut: action.shortcut }),
    ...(action.disabled ? { disabled: true } : {}),
  };
}

/**
 * Project a shared action into a keyboard {@link ShortcutBinding} for the shared
 * dispatcher — the SAME identity that becomes a Card action, a Record action and a
 * palette command (ADR-024 §24.12/§24.14). Returns `null` when the action declares
 * no shortcut. A DISABLED action still yields a binding but with `enabled: false`,
 * so the one shared dispatcher never invokes it — disabled means the same thing
 * across every surface, keyboard included. Collision/precedence are the
 * dispatcher's concern and are unchanged.
 */
export function appActionToShortcutBinding(
  action: AppAction,
  onTrigger: () => void,
): ShortcutBinding | null {
  if (action.shortcut === undefined) {
    return null;
  }
  return {
    shortcut: action.shortcut,
    onTrigger,
    enabled: action.disabled !== true,
  };
}

/**
 * Project a shared action into a DS-04 {@link CardAction}. `onActivate` is the ONE
 * execution path (the surface passes the same activator the palette uses), so a
 * Card click and a palette activation run identical logic. `pending` blocks a
 * duplicate activation and shows a busy state; the accessible name is always the
 * action title.
 */
export function toCardAction(
  action: AppAction,
  options: {
    readonly onActivate: (action: AppAction) => void;
    readonly pending?: boolean;
    readonly iconOnly?: boolean;
  },
): CardAction {
  return {
    id: action.id,
    label: action.title,
    ...(action.subtitle === undefined ? {} : { description: action.subtitle }),
    ...(action.icon === undefined ? {} : { icon: action.icon }),
    ...(options.iconOnly ? { iconOnly: true, ariaLabel: action.title } : {}),
    ...(action.disabled ? { disabled: true } : {}),
    ...(options.pending ? { pending: true } : {}),
    onSelect: () => options.onActivate(action),
  };
}

/**
 * Project a shared action into a DS-02 {@link RecordAction}. Same single execution
 * path as the palette and the Card; disabled and unavailable stay distinct (omit
 * the action entirely to make it unavailable).
 */
export function toRecordAction(
  action: AppAction,
  options: {
    readonly onActivate: (action: AppAction) => void;
    readonly variant?: "primary" | "secondary";
    readonly disabled?: boolean;
  },
): RecordAction {
  return {
    id: action.id,
    label: action.title,
    ...(options.variant === undefined ? {} : { variant: options.variant }),
    ...(action.disabled || options.disabled ? { disabled: true } : {}),
    ariaLabel: action.title,
    onSelect: () => options.onActivate(action),
  };
}
