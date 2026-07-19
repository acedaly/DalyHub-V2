/**
 * DS-09 Command Palette — the presentation context (pure, React-free).
 *
 * A small, typed bag of SAFE UI facts about the current surface that the palette
 * uses to decide relevance and ordering. It is deliberately weak: it carries no
 * workspace id, no session/JWT claims, no D1 handle, no repository and no arbitrary
 * product blob (ADR-024 §24.6). The Drawer key is opaque DATA — the shared model
 * never parses it (it never learns what `task:<id>` means). Context influences
 * WHICH commands show and their ORDER; it NEVER authorises server execution — an
 * executable handler independently enforces its trusted workspace and domain
 * rules at the server boundary.
 */

import type { PaletteCommand } from "./types";

/** The safe presentation facts the palette may use for relevance. */
export type PaletteContext = {
  /** The current in-app pathname (e.g. `/today`). */
  readonly pathname: string;
  /** The current route's owning module id, when known. */
  readonly moduleId?: string;
  /** Whether a DS-03 Drawer is currently open. */
  readonly drawerOpen: boolean;
  /** The top Drawer key as OPAQUE data — never parsed by shared code. */
  readonly topDrawerKey?: string;
  /** The current entity type, when the owning surface supplies it. */
  readonly entityType?: string;
  /** The number of currently selected items. */
  readonly selectionCount: number;
};

/** A neutral context: nothing known, nothing selected, no drawer. */
export const EMPTY_PALETTE_CONTEXT: PaletteContext = {
  pathname: "/",
  drawerOpen: false,
  selectionCount: 0,
};

/**
 * A small, bounded relevance boost for a command given the current context. It
 * only nudges ordering (a command on the current module surfaces a little
 * higher); it never hides a global command and never grants authority. Returns 0
 * when the context offers no signal.
 */
export function contextBoost(
  command: PaletteCommand,
  context: PaletteContext,
): number {
  // Contextual actions are, by definition, relevant to the current surface — the
  // surface mounted them — so they always earn the boost.
  if (command.source === "contextual") {
    return 2;
  }
  // A registered command whose module owns the current route is more relevant
  // here than one from an unrelated module.
  if (
    command.moduleId !== undefined &&
    context.moduleId !== undefined &&
    command.moduleId === context.moduleId
  ) {
    return 1;
  }
  return 0;
}
