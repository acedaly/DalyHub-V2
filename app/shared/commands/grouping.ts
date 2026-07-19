/**
 * DS-09 Command Palette — deterministic command grouping (pure, React-free).
 *
 * Partitions ranked commands into the palette's canonical groups so the three
 * concepts never blur (ADR-024 §24.6): "Current context" (contextual actions),
 * "Actions" (registered executables) and "Navigation" (registered navigations).
 * With an empty query the palette instead shows a restrained "Suggested" group
 * (recent + suggested navigation) plus the current context. Group order is always
 * a subset of: Suggested → Current context → Actions → Navigation. Module labels
 * come from the catalogue, never a hard-coded product list.
 */

import { MAX_COMMAND_RESULTS, MAX_SUGGESTED_COMMANDS } from "./limits";
import type { CommandGroup, CommandGroupKey, RankedCommand } from "./types";

const GROUP_LABELS: Record<CommandGroupKey, string> = {
  suggested: "Suggested",
  context: "Current context",
  actions: "Actions",
  navigation: "Navigation",
};

/** The group a ranked command belongs to when a query is present. */
function queryGroupOf(command: RankedCommand): CommandGroupKey {
  if (command.command.source === "contextual") {
    return "context";
  }
  return command.command.kind === "navigate" ? "navigation" : "actions";
}

/** Options controlling how commands are grouped. */
export type GroupCommandsOptions = {
  /** Whether a query is present (empty → suggested view). */
  readonly hasQuery: boolean;
  /** Recent command ids, most-recent first (empty-query suggestions). */
  readonly recentIds?: readonly string[];
  /** Maximum suggested commands for an empty query. */
  readonly suggestedLimit?: number;
  /** Maximum total ranked command results for a query. */
  readonly resultLimit?: number;
};

/**
 * Group ranked commands into the palette's canonical, ordered groups. Empty
 * groups are dropped. Deterministic for identical inputs.
 */
export function groupCommands(
  ranked: readonly RankedCommand[],
  options: GroupCommandsOptions,
): CommandGroup[] {
  if (!options.hasQuery) {
    return groupSuggested(ranked, options);
  }

  const limit = options.resultLimit ?? MAX_COMMAND_RESULTS;
  const buckets: Record<CommandGroupKey, RankedCommand[]> = {
    suggested: [],
    context: [],
    actions: [],
    navigation: [],
  };
  let total = 0;
  for (const command of ranked) {
    if (total >= limit) {
      break;
    }
    buckets[queryGroupOf(command)].push(command);
    total += 1;
  }

  const order: CommandGroupKey[] = ["context", "actions", "navigation"];
  return order
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({ key, label: GROUP_LABELS[key], commands: buckets[key] }));
}

/** Build the empty-query view: a Suggested group plus the current context. */
function groupSuggested(
  ranked: readonly RankedCommand[],
  options: GroupCommandsOptions,
): CommandGroup[] {
  const contextual = ranked.filter((r) => r.command.source === "contextual");
  const registered = ranked.filter((r) => r.command.source === "registered");

  const recentIds = options.recentIds ?? [];
  const recentRank = new Map<string, number>();
  recentIds.forEach((id, index) => recentRank.set(id, index));

  const suggested = [...registered]
    .sort((a, b) => {
      const ra = recentRank.get(a.command.id) ?? Number.POSITIVE_INFINITY;
      const rb = recentRank.get(b.command.id) ?? Number.POSITIVE_INFINITY;
      if (ra !== rb) {
        return ra - rb;
      }
      return 0; // preserve the incoming (context-then-title) order otherwise
    })
    .slice(0, options.suggestedLimit ?? MAX_SUGGESTED_COMMANDS);

  const groups: CommandGroup[] = [];
  if (suggested.length > 0) {
    groups.push({
      key: "suggested",
      label: GROUP_LABELS.suggested,
      commands: suggested,
    });
  }
  if (contextual.length > 0) {
    groups.push({
      key: "context",
      label: GROUP_LABELS.context,
      commands: contextual,
    });
  }
  return groups;
}

/** Flatten grouped commands into the display-ordered flat list. */
export function flattenCommandGroups(
  groups: readonly CommandGroup[],
): RankedCommand[] {
  return groups.flatMap((group) => [...group.commands]);
}
