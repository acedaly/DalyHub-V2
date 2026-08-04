/**
 * IDENT-01 Identity kernel — public surface.
 *
 * The ONE place actor identity is defined. Everything that names an actor —
 * the request boundary, the workspace composition, every activity route, the
 * React-free presentation model and the production repair script — imports the
 * rule from here rather than writing its own fallback.
 */

export type {
  ActorRef,
  ActorKind,
  ActorIdentity,
  ActorIdentitySource,
  WorkspaceMember,
  AuthenticatedActorFacts,
} from "./identity";

export {
  SYSTEM_ACTOR_LABEL,
  UNKNOWN_ACTOR_LABEL,
  AI_ACTOR_LABEL,
  IMPORT_ACTOR_LABEL,
  INTEGRATION_ACTOR_LABEL,
  USER_ACTOR_TYPE,
  SYSTEM_ACTOR_TYPE,
  actorInitials,
  actorKey,
  resolveActorIdentity,
} from "./identity";

export {
  IdentityValidationError,
  IdentityStorageError,
  type IdentityValidationField,
} from "./identity-errors";

export {
  MEMBER_SUBJECT_MAX_LENGTH,
  MEMBER_DISPLAY_NAME_MAX_LENGTH,
  MEMBER_PERSON_ID_MAX_LENGTH,
  validateMemberSubject,
  normaliseMemberEmail,
  normaliseMemberDisplayName,
  normaliseMemberPersonId,
} from "./identity-validation";

export type {
  ActorDirectory,
  EnsureWorkspaceMemberInput,
  WorkspaceMemberRepository,
} from "./identity-repository";
