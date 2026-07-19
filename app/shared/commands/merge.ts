/**
 * DS-09 Command Palette — merging commands with DS-08 Search results (pure).
 *
 * The palette shows three things in one list without confusing them (ADR-024
 * §24.6, §24.9): contextual actions and registered commands (grouped by the
 * command grouper) and DS-08 record Search results (grouped by entity type by
 * DS-08). This module lays them out in a single deterministic display order —
 * commands first, then Search results — and assigns each selectable option a flat
 * index, so keyboard selection can reuse DS-08's selection maths over one index
 * space. Search results keep DS-08's own ranking; commands keep the command
 * ranker's. Neither system's scores bleed into the other.
 */

import type {
  RankedSearchResult,
  SearchResultGroup,
} from "~/shared/search/model";

import type { CommandGroup, RankedCommand } from "./types";

/** A single selectable option in the merged palette list. */
export type PaletteOption =
  | {
      readonly kind: "command";
      /** Flat selection index (aria-activedescendant / arrow-key space). */
      readonly index: number;
      readonly ranked: RankedCommand;
    }
  | {
      readonly kind: "result";
      readonly index: number;
      readonly result: RankedSearchResult;
    };

/** A labelled section of the merged palette list (a command or result group). */
export type PaletteSection = {
  /** Stable key for React and tests. */
  readonly key: string;
  /** Safe default display label (never colour-only). */
  readonly label: string;
  /** Whether this section holds commands or Search records. */
  readonly kind: "command" | "result";
  /**
   * The entity type of a record section, when known — so the UI can upgrade the
   * default slug label to the entity's plural via entity identity (the model
   * stays React-free and never resolves identity itself).
   */
  readonly entityType?: string;
  readonly options: readonly PaletteOption[];
};

/** The fully-merged palette view: sections to render + the flat option list. */
export type PaletteView = {
  readonly sections: readonly PaletteSection[];
  /** Every option in display order; each carries its own flat `index`. */
  readonly options: readonly PaletteOption[];
  /** Total number of selectable options (the selection-maths `count`). */
  readonly count: number;
};

/**
 * Merge grouped commands and grouped Search results into one deterministic view.
 * Commands come first (contextual/actions/navigation, already ordered by the
 * grouper), then Search results grouped by entity type. Flat indices are assigned
 * in that display order.
 */
export function buildPaletteView(
  commandGroups: readonly CommandGroup[],
  searchGroups: readonly SearchResultGroup[],
): PaletteView {
  const sections: PaletteSection[] = [];
  const options: PaletteOption[] = [];
  let index = 0;

  for (const group of commandGroups) {
    const groupOptions: PaletteOption[] = [];
    for (const ranked of group.commands) {
      const option: PaletteOption = { kind: "command", index, ranked };
      groupOptions.push(option);
      options.push(option);
      index += 1;
    }
    if (groupOptions.length > 0) {
      sections.push({
        key: `command:${group.key}`,
        label: group.label,
        kind: "command",
        options: groupOptions,
      });
    }
  }

  for (const group of searchGroups) {
    const groupOptions: PaletteOption[] = [];
    for (const result of group.results) {
      const option: PaletteOption = { kind: "result", index, result };
      groupOptions.push(option);
      options.push(option);
      index += 1;
    }
    if (groupOptions.length > 0) {
      sections.push({
        key: `result:${group.id}`,
        label: group.label,
        kind: "result",
        ...(group.entityType === undefined
          ? {}
          : { entityType: group.entityType }),
        options: groupOptions,
      });
    }
  }

  return { sections, options, count: options.length };
}

/** The option at a flat selection index, or null when out of range. */
export function optionAtIndex(
  view: PaletteView,
  index: number,
): PaletteOption | null {
  if (index < 0 || index >= view.options.length) {
    return null;
  }
  return view.options[index];
}
