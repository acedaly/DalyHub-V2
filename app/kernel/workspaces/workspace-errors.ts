/**
 * FND-03 Workspace kernel — domain errors.
 *
 * Workspace operations signal failure with these explicit, typed errors rather
 * than leaking storage or configuration internals. Public messages are safe to
 * surface: they never include SQL text, D1 internals, environment dumps,
 * account identifiers, database paths or stack traces (see AGENTS.md §17 and
 * ADR-010). Raw causes are attached via `cause` for server-side logging only and
 * are never rendered into the public message.
 *
 * A note on `WorkspaceNotFoundError`: a cross-workspace lookup should generally
 * appear as "not found". It must NOT reveal that an entity exists in another
 * workspace — the entity kernel returns `null`/`EntityNotFoundError` for that,
 * and this error is reserved for the workspace record itself being absent.
 */

/** Discriminator so callers can branch on error kind without `instanceof`. */
export type WorkspaceErrorCode =
  | "validation"
  | "not_found"
  | "conflict"
  | "configuration"
  | "resolution"
  | "storage";

/** Base class for every workspace kernel error. */
export abstract class WorkspaceError extends Error {
  abstract readonly code: WorkspaceErrorCode;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** A supplied workspace id failed structural validation. */
export class WorkspaceValidationError extends WorkspaceError {
  readonly code = "validation" as const;

  constructor(message: string) {
    super(`Invalid workspace id: ${message}`);
  }
}

/** No workspace with the given id exists. */
export class WorkspaceNotFoundError extends WorkspaceError {
  readonly code = "not_found" as const;

  constructor(message = "Workspace not found") {
    super(message);
  }
}

/** An attempt to create a workspace whose id already exists. */
export class WorkspaceConflictError extends WorkspaceError {
  readonly code = "conflict" as const;

  constructor(message = "Workspace already exists") {
    super(message);
  }
}

/**
 * The server-side workspace configuration is missing or blank. Distinct from
 * `WorkspaceValidationError` (present but malformed) so operators can tell an
 * unset binding apart from a bad value. The message never echoes the binding
 * value or names the environment.
 */
export class WorkspaceConfigurationError extends WorkspaceError {
  readonly code = "configuration" as const;

  constructor(message = "Workspace is not configured") {
    super(message);
  }
}

/**
 * Establishing the workspace context failed for a reason that is not a plain
 * validation/configuration/not-found case (or a wrapper the resolver chooses to
 * surface). Carries the underlying cause for logging without exposing it.
 */
export class WorkspaceContextResolutionError extends WorkspaceError {
  readonly code = "resolution" as const;

  constructor(
    message = "Could not resolve the workspace context",
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/**
 * The underlying storage failed. The original cause is attached (via `cause`)
 * for server-side logging but is never rendered into the public message, so raw
 * database details do not escape the kernel boundary.
 */
export class WorkspaceStorageError extends WorkspaceError {
  readonly code = "storage" as const;

  constructor(
    message = "A storage error occurred",
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}
