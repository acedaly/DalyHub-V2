/**
 * DS-06 — entity-link picker server service public surface.
 *
 * Server loaders/actions import the entity-agnostic picker service from here and
 * inject workspace-scoped kernel repositories (from `resolveWorkspaceScope`). The
 * service translates the DS-06 picker's operations into FND-04 repository calls
 * without exposing D1, bindings or the adapter. Link CREATION goes through
 * `createLinkWithPolicy`, which enforces a trusted, server-supplied policy on the
 * untrusted request — the picker's client configuration is presentation only.
 */

export {
  searchLinkTargets,
  listActiveLinks,
  createLinkWithPolicy,
  unlinkLink,
  entityToTargetOption,
  DEFAULT_TARGET_LIMIT,
  MAX_TARGET_LIMIT,
  type EntityLinkPickerDeps,
  type SearchLinkTargetsParams,
  type ListActiveLinksParams,
  type EntityLinkTypePolicy,
  type EntityLinkPickerPolicy,
  type CreateLinkRequest,
  type CreateLinkRejectionReason,
  type CreateLinkResult,
} from "./entity-link-picker-service";
