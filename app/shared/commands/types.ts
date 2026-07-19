/**
 * DS-09 Command Palette — the React-free model types.
 *
 * These describe the palette's data: the serialisable command catalogue (metadata
 * ONLY — never a handler function), the normalised palette command the ranker and
 * grouper operate on, ranked/grouped results, the presentation context, and the
 * execution state machine. Nothing here is entity-aware: there is no Task, Project
 * or Today concept, no Drawer-key parsing and no product data (ADR-024 §24.1).
 *
 * It reuses the kernel command/target contracts and DS-08's `MatchRange`, so the
 * palette shares one navigation-target type and one highlight-range type with the
 * rest of the app rather than inventing parallels.
 */

import type { MatchRange } from "~/shared/search/model";
import type {
  CommandExecutionOutcome,
  CommandShortcut,
  SearchResultTarget,
} from "~/kernel/modules";

export type { CommandExecutionOutcome, CommandShortcut, SearchResultTarget };
export type { MatchRange };

/** A command is either a declarative navigation or a server-executed action. */
export type CommandKind = "navigate" | "execute";

/** Where a palette command came from. */
export type CommandSource = "registered" | "contextual";

/* -------------------------------------------------------------------------- */
/* Serialisable catalogue (browser transport)                                 */
/* -------------------------------------------------------------------------- */

/** Fields every serialised catalogue entry carries — never the handler. */
type CommandCatalogueEntryBase = {
  /** Stable, module-namespaced command id. */
  readonly id: string;
  /** The id of the module that owns the command. */
  readonly moduleId: string;
  /** The owning module's display label (from the registry, never hard-coded). */
  readonly moduleLabel: string;
  /** Palette title. */
  readonly title: string;
  /** Optional palette subtitle. */
  readonly subtitle?: string;
  /** Search keywords (possibly empty). */
  readonly keywords: readonly string[];
  /** Optional declarative keyboard-shortcut metadata. */
  readonly shortcut?: CommandShortcut;
};

/**
 * A registered command as it crosses to the browser: pure, bounded metadata with
 * NO `run` handler. A navigation command carries its validated target; an
 * executable command carries only its kind (it is run by id through the
 * authenticated server boundary — ADR-024 §24.7/§24.8).
 */
export type CommandCatalogueEntry = CommandCatalogueEntryBase &
  (
    | { readonly kind: "navigate"; readonly target: SearchResultTarget }
    | { readonly kind: "execute" }
  );

/** The whole trusted command catalogue transported to the browser. */
export type CommandCatalogue = {
  readonly commands: readonly CommandCatalogueEntry[];
};

/* -------------------------------------------------------------------------- */
/* Normalised palette command (ranker/grouper input)                          */
/* -------------------------------------------------------------------------- */

/**
 * A command as the palette ranks, groups and renders it. Both registered commands
 * (from the catalogue) and transient contextual actions normalise to this shape,
 * so the pure model treats them uniformly WITHOUT knowing how either is executed
 * (that binding lives in the React controller, keyed by `id`). Entity-agnostic:
 * it carries presentation, not a handler and not product data.
 */
export type PaletteCommand = {
  /** Stable identity, unique within the merged command set. */
  readonly id: string;
  /** Whether it came from the registry catalogue or the current surface. */
  readonly source: CommandSource;
  /** Whether it navigates or executes. */
  readonly kind: CommandKind;
  /** Display title (also the accessible name). */
  readonly title: string;
  /** Optional secondary text. */
  readonly subtitle?: string;
  /** Keywords the ranker matches against (possibly empty). */
  readonly keywords: readonly string[];
  /** Optional declarative keyboard-shortcut metadata. */
  readonly shortcut?: CommandShortcut;
  /** Owning module id (registered commands only). */
  readonly moduleId?: string;
  /** Owning module display label (registered commands only). */
  readonly moduleLabel?: string;
  /**
   * Whether the command is currently unavailable. A disabled command still renders
   * (so the surface stays legible) but cannot be activated — the palette skips it
   * on Enter/click and marks it `aria-disabled`, mirroring the Card/Header adapters.
   * Only contextual actions carry this; registered commands are never disabled.
   */
  readonly disabled?: boolean;
};

/** A palette command with its match tier and title highlight ranges. */
export type RankedCommand = {
  readonly command: PaletteCommand;
  /** Match tier — higher is a stronger match; 0 means no local match. */
  readonly tier: number;
  /** Half-open ranges of the title that matched the query (for `<mark>`). */
  readonly titleMatches: readonly MatchRange[];
};

/* -------------------------------------------------------------------------- */
/* Deterministic grouping                                                     */
/* -------------------------------------------------------------------------- */

/** The stable command group keys, in their canonical display order. */
export type CommandGroupKey =
  "suggested" | "context" | "actions" | "navigation";

/** A rendered group of ranked commands. */
export type CommandGroup = {
  readonly key: CommandGroupKey;
  readonly label: string;
  readonly commands: readonly RankedCommand[];
};

/* -------------------------------------------------------------------------- */
/* Execution state machine                                                    */
/* -------------------------------------------------------------------------- */

/** The lifecycle phase of a command activation in the palette. */
export type CommandExecutionPhase = "idle" | "pending" | "success" | "error";

/** The recovery class of a failed execution (mirrors the kernel outcome). */
export type CommandFailureReason = "unavailable" | "conflict" | "failed";

/**
 * The palette's execution state. A monotonic `token` guards against a stale
 * response settling a state that a newer activation has already replaced
 * (ADR-024 §24.9); the client also blocks a second activation while `phase` is
 * `pending`, so a command is never double-invoked from one intent.
 */
export type CommandExecutionState = {
  readonly phase: CommandExecutionPhase;
  /** The command currently or last executed, or null when idle. */
  readonly commandId: string | null;
  /** Monotonic generation for stale-response protection. */
  readonly token: number;
  /** Display-ready message for success or failure, or null. */
  readonly message: string | null;
  /** The failure recovery class, or null when not a failure. */
  readonly reason: CommandFailureReason | null;
  /** Whether a failed execution may be explicitly retried. */
  readonly retryable: boolean;
};
