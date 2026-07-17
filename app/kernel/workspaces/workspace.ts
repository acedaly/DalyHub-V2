/**
 * FND-03 Workspace kernel — the workspace contract and identifier type.
 *
 * A Workspace is DalyHub's top-level isolation and security boundary
 * (ADR-003 / ADR-010). It is a SEPARATE kernel/security record, NOT an ordinary
 * row in the `entities` table: entities *belong to* a workspace through a
 * database foreign key, they are not workspaces themselves.
 *
 * This module is storage-independent — nothing here imports D1 or Cloudflare
 * types. The D1 adapter (`app/platform/storage/d1`) persists workspaces; the
 * server composition boundary (`app/platform/workspaces`) resolves a
 * `WorkspaceContext` and hands module code a workspace-scoped repository.
 *
 * See ADR-010 (Server-side Workspace Context) and ADR-003 (Workspace Isolation).
 */

import { WorkspaceValidationError } from "./workspace-errors";

/**
 * Maximum length of a workspace id, in characters. Matches the entity kernel's
 * `ID_MAX_LENGTH` so a workspace id is always a legal `entities.workspace_id`.
 */
export const WORKSPACE_ID_MAX_LENGTH = 128;

/**
 * A validated workspace identifier. The unique brand means a plain `string`
 * cannot be used where a `WorkspaceId` is required: an id only becomes a
 * `WorkspaceId` by passing {@link parseWorkspaceId} (or {@link newWorkspaceId}),
 * so unchecked strings cannot drift through the kernel.
 *
 * The validation rules are intentionally identical to the FND-02 entity kernel's
 * `validateWorkspaceId` (`entity-validation.ts`): a non-empty string, at most
 * `WORKSPACE_ID_MAX_LENGTH` characters, used verbatim (not trimmed, no charset
 * restriction). This preserves compatibility with EVERY workspace id FND-02
 * accepted — migration 0002 back-fills those ids unchanged, so a legacy id such
 * as `personal.v1`, `personal workspace` or `personal/work` must still validate,
 * resolve and be usable. A workspace id is a SCOPE identifier, not an
 * authentication secret (ADR-010); it is only ever bound as a SQL parameter or
 * carried as opaque data, never interpolated, so a narrower charset would buy no
 * safety while breaking existing scopes.
 */
declare const workspaceIdBrand: unique symbol;
export type WorkspaceId = string & { readonly [workspaceIdBrand]: true };

/** True when `value` is a structurally valid workspace id. */
export function isWorkspaceId(value: unknown): value is WorkspaceId {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= WORKSPACE_ID_MAX_LENGTH
  );
}

/**
 * Validate an untrusted value as a `WorkspaceId`, returning the branded id or
 * throwing `WorkspaceValidationError`. This is the ONLY sanctioned way to turn a
 * raw string (e.g. configuration, or an id crossing the repository boundary)
 * into a `WorkspaceId`.
 */
export function parseWorkspaceId(value: unknown): WorkspaceId {
  if (typeof value !== "string") {
    throw new WorkspaceValidationError("must be a string");
  }
  if (value.length === 0) {
    throw new WorkspaceValidationError("must not be empty");
  }
  if (value.length > WORKSPACE_ID_MAX_LENGTH) {
    throw new WorkspaceValidationError(
      `must be at most ${WORKSPACE_ID_MAX_LENGTH} characters`,
    );
  }
  return value as WorkspaceId;
}

/**
 * Generate a fresh workspace id. Uses `crypto.randomUUID()` — globally unique
 * and Workers-native. The result is always a valid `WorkspaceId`.
 */
export function newWorkspaceId(): WorkspaceId {
  return crypto.randomUUID() as WorkspaceId;
}

/**
 * A persisted workspace: the minimal security-boundary record. It carries ONLY
 * the fields justified for the boundary — identity and lifecycle timestamps.
 * There is deliberately no name, membership, role, billing, theme or settings
 * field here; FND-03 establishes isolation, not workspace management (ADR-010).
 *
 * Timestamps are UTC, following the same convention as entities.
 */
export type WorkspaceRecord = {
  readonly id: WorkspaceId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
