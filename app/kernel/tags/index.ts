/**
 * V2.6 FIND-02 — the ONE tag vocabulary authority.
 *
 * Every surface in DalyHub that reads or writes a tag resolves through this
 * module. That is the structural form of FIND-02's first acceptance criterion:
 * "one vocabulary source, asserted structurally … proven by import path rather
 * than by behaviour agreeing today", and
 * `test/unit/tags/vocabulary-singularity.test.ts` fails if a tag-writing surface
 * reaches around it.
 *
 * `~/shared/forms/tags.ts` re-exports the normalisation half of this module, so
 * DS-06's forms contract is unchanged and there is still exactly one
 * implementation of the rule.
 */

export {
  DEFAULT_MAX_TAGS,
  DEFAULT_MAX_TAG_LENGTH,
  addTag,
  canonicalTagKey,
  normaliseTag,
  normaliseTagList,
  removeTagAt,
  resolveTagConstraints,
  type AddTagResult,
  type TagRejectionReason,
} from "./tag-normalisation";

export type { TagConstraints } from "./tag-constraints";

export {
  MAX_ENTITY_TAGS,
  MAX_TAG_FILTER_MEMBERS,
  MAX_TAG_LENGTH,
  TAG_VOCABULARY_READ_LIMIT,
  TagValidationError,
  parseEntityTagInput,
  parseTagFilterKeys,
  tagKeys,
  tagLabels,
  validateEntityTags,
  type WorkspaceTag,
  type WorkspaceTagUsage,
} from "./tag-vocabulary";

export type { TagVocabularyRepository } from "./tag-repository";
