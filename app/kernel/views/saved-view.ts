/**
 * X-02 — the ONE saved-view model, generalised from TASKS-03.
 *
 * A saved view is a NAME plus a validated declarative CONFIG of a known KIND. It
 * stores no records, no query text and no cached result — re-opening a saved view
 * re-runs the ordinary bounded workspace query, so a saved view can never drift
 * from the data or bypass a workspace boundary.
 *
 * DalyHub deliberately has ONE saved-view system, not one per module. The Tasks
 * saved views shipped by TASKS-03 and the cross-module views X-02 adds are the same
 * record, in the same table, behind the same repository contract; only the CODEC
 * that reads and writes the config differs. That is what stops "cross-module saved
 * views" from becoming a second, parallel persistence architecture.
 *
 * The SYSTEM (built-in) views of either kind are deliberately NOT rows: they are
 * DERIVED in code from the same config vocabulary, so they cannot be deleted,
 * cannot silently mutate and cost no storage.
 */

import type { WorkspaceId } from "~/kernel/workspaces";

/**
 * Which configuration vocabulary a stored row speaks.
 *
 * `tasks` is TASKS-03's `TaskViewConfig` — every row written before X-02, which is
 * exactly why `tasks` is the column DEFAULT. `cross` is X-02's `CrossViewConfig`.
 * A row of an unrecognised kind is never decoded under another kind's rules.
 */
export const SAVED_VIEW_KINDS = ["tasks", "cross"] as const;
export type SavedViewKind = (typeof SAVED_VIEW_KINDS)[number];

/** Narrow an untrusted string to a saved-view kind. */
export function isSavedViewKind(value: unknown): value is SavedViewKind {
  return (
    typeof value === "string" &&
    (SAVED_VIEW_KINDS as readonly string[]).includes(value)
  );
}

/** The maximum length of a saved-view name (mirrors the column CHECK). */
export const SAVED_VIEW_NAME_MAX_LENGTH = 80;

/** The maximum number of saved views one owner may hold, per kind, per workspace. */
export const MAX_SAVED_VIEWS_PER_KIND = 50;

/** A persisted, user-created view of one kind. */
export interface SavedView<TConfig> {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly ownerId: string;
  readonly kind: SavedViewKind;
  readonly name: string;
  /** The format version the row was WRITTEN with (may exceed this build's). */
  readonly configVersion: number;
  readonly config: TConfig;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Create a saved view from the current configuration. */
export interface NewSavedView<TConfig> {
  readonly name: string;
  readonly config: TConfig;
}

/** Patch an existing saved view. An omitted field is left unchanged. */
export interface SavedViewPatch<TConfig> {
  readonly name?: string;
  readonly config?: TConfig;
}

/** The outcome of a saved-view write: the fresh record and whether it changed. */
export interface SavedViewChangeResult<TConfig> {
  readonly view: SavedView<TConfig>;
  readonly changed: boolean;
}

/**
 * The workspace-bound saved-view repository, parameterised by the config it holds.
 * Every method is scoped to the bound workspace AND to the authenticated owner AND
 * to one kind — a view saved by one owner in one workspace is invisible and
 * unreachable from any other.
 */
export interface SavedViewRepository<TConfig> {
  /** All of the owner's saved views of this kind, ordered by name then id. */
  readonly list: (ownerId: string) => Promise<readonly SavedView<TConfig>[]>;
  /** One saved view, or null when it does not exist for this owner/workspace/kind. */
  readonly get: (
    ownerId: string,
    viewId: string,
  ) => Promise<SavedView<TConfig> | null>;
  readonly create: (
    ownerId: string,
    input: NewSavedView<TConfig>,
  ) => Promise<SavedView<TConfig>>;
  readonly update: (
    ownerId: string,
    viewId: string,
    patch: SavedViewPatch<TConfig>,
  ) => Promise<SavedViewChangeResult<TConfig>>;
  /** Copy a view under a new name. Fails if the source is missing. */
  readonly duplicate: (
    ownerId: string,
    viewId: string,
    name: string,
  ) => Promise<SavedView<TConfig>>;
  /** Delete a view. Returns false when there was nothing to delete (idempotent). */
  readonly remove: (ownerId: string, viewId: string) => Promise<boolean>;
}

/**
 * How one kind's configuration is read, written and compared.
 *
 * The storage adapter knows nothing about any particular config: it holds a codec,
 * so adding a kind never means a new table, a new repository or a new SQL path.
 * `parse` must be TOTAL (never throw), `validateForWrite` must throw on input that
 * is not a configuration at all, and `serialise` must be CANONICAL so two
 * equivalent configs compare equal as text.
 */
export interface SavedViewCodec<TConfig> {
  readonly kind: SavedViewKind;
  /** The config format version rows are written with by this build. */
  readonly version: number;
  readonly parse: (raw: unknown) => TConfig;
  readonly validateForWrite: (raw: unknown) => TConfig;
  readonly serialise: (config: TConfig) => string;
  readonly equals: (a: TConfig, b: TConfig) => boolean;
}
