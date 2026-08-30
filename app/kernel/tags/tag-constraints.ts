/**
 * The bounds and comparison behaviour a tag collection is edited under.
 *
 * Declared beside the normalisation rule rather than in `~/shared/forms/types.ts`
 * so the kernel does not depend on a UI module for its own contract. The forms
 * layer re-exports this exact type, so `TagsFieldProps` is unchanged.
 */
export interface TagConstraints {
  /** Maximum number of tags. Defaults to a safe ceiling. */
  readonly maxTags?: number;
  /** Maximum length of a single tag, in characters. Defaults to a safe ceiling. */
  readonly maxTagLength?: number;
  /** When true, tags are compared case-insensitively for duplicate detection. */
  readonly caseInsensitive?: boolean;
}
