/**
 * DS-06 Shared Forms — the pure tags model.
 *
 * **V2.6 FIND-02 PROMOTED this module into the kernel, and this file is now its
 * re-export.** The rules did not change; what changed is who needs them. A tag
 * is no longer only an in-memory string array a control edits: it is a
 * workspace vocabulary that the repositories, migration `0049`, the Tasks
 * filter and the quick-capture grammar all resolve against, and a rule three
 * layers depend on cannot live inside the forms layer.
 *
 * The file stays so that no call site changed (`~/shared/forms` and every
 * consumer import the same names from the same path), and re-exports rather
 * than re-implements so there is still exactly one implementation — the
 * "promoted, not forked" requirement ADR-112 decision 4 states in so many
 * words. A second `normaliseTag` anywhere in the product is a bug.
 *
 * The rules themselves, and the reasoning behind the ASCII-only case fold, are
 * documented at {@link file://../../kernel/tags/tag-normalisation.ts}.
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
} from "~/kernel/tags";
