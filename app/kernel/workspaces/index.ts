/**
 * FND-03 Workspace kernel — public surface.
 *
 * The server composition boundary imports the workspace kernel from here. This
 * barrel exposes the storage-independent contract: the `WorkspaceId`/record
 * types, the `WorkspaceContext` and its resolver interface, the low-level
 * `WorkspaceRepository` contract, id helpers and domain errors. The D1 workspace
 * adapter and the configured resolver are NOT re-exported — they live in
 * `app/platform` so the dependency direction points at the contract, not the
 * store (mirrors the entity kernel barrel, ADR-009/ADR-010).
 */

export {
  WORKSPACE_ID_MAX_LENGTH,
  isWorkspaceId,
  parseWorkspaceId,
  newWorkspaceId,
  type WorkspaceId,
  type WorkspaceRecord,
} from "./workspace";

export {
  createWorkspaceContext,
  workspaceContextFromId,
  type WorkspaceContext,
  type WorkspaceContextResolver,
} from "./workspace-context";

export {
  type WorkspaceRepository,
  type CreateWorkspaceInput,
} from "./workspace-repository";

export {
  WorkspaceError,
  WorkspaceValidationError,
  WorkspaceNotFoundError,
  WorkspaceConflictError,
  WorkspaceConfigurationError,
  WorkspaceContextResolutionError,
  WorkspaceStorageError,
  type WorkspaceErrorCode,
} from "./workspace-errors";
