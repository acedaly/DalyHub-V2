/**
 * V2.6 FIND-02 — the ONE tag normalisation rule, promoted into the kernel.
 *
 * This module IS `~/shared/forms/tags.ts`. DS-06 wrote it as the framework-free
 * rules the shared Tags control applies — normalisation, duplicate prevention
 * and bounded limits — and it stayed correct; what changed is that it is no
 * longer only a UI concern. A tag is now a workspace vocabulary that the
 * repositories, the migration, the Tasks filter and the capture grammar all
 * resolve against, and every one of them has to fold a raw string the same way.
 *
 * So it was PROMOTED rather than forked (ADR-112 decision 4, ADR-113):
 * `~/shared/forms/tags.ts` re-exports this file verbatim, so no call site
 * changed and there is exactly one implementation. A second `normaliseTag`
 * anywhere in the product is a bug.
 *
 * ── The two forms a tag has ──────────────────────────────────────────────────
 *
 *   - the **label**, produced by {@link normaliseTag}: whitespace tidied, the
 *     owner's casing preserved. This is what is stored for display and what the
 *     owner sees.
 *   - the **canonical key**, produced by {@link canonicalTagKey}: the label,
 *     case-folded. This is the tag's IDENTITY — `Errand`, `errand` and `ERRAND`
 *     are one tag, which is the whole of what DEBT-182 asked for.
 *
 * Every operation returns a NEW array (the input is never mutated) and reports
 * enough for a control to explain what happened (a rejected duplicate, a hit
 * limit), so the UI can stay calm and specific.
 */

import type { TagConstraints } from "./tag-constraints";

/** Safe defaults so an untrusted paste can never create an unbounded collection. */
export const DEFAULT_MAX_TAGS = 50;
export const DEFAULT_MAX_TAG_LENGTH = 64;

/** Why an attempt to add a tag did not add a new entry. */
export type TagRejectionReason = "empty" | "duplicate" | "limit" | "too-long";

/** The result of attempting to add one tag to a collection. */
export type AddTagResult = {
  /** The resulting collection (unchanged when `added` is false). */
  readonly tags: readonly string[];
  /** Whether a new tag was actually appended. */
  readonly added: boolean;
  /** When `added` is false, why — so the control can show a specific message. */
  readonly reason: TagRejectionReason | null;
};

/**
 * Normalise raw tag input: trim surrounding whitespace and collapse internal runs
 * of whitespace to a single space. Case is preserved (display fidelity); folding
 * for identity is {@link canonicalTagKey}, so the stored label keeps the casing
 * the user typed.
 */
export function normaliseTag(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * The canonical IDENTITY of a tag: {@link normaliseTag}, then ASCII case-folded.
 *
 * **Only `A`–`Z` are folded, and that is the decision rather than an oversight**
 * (ADR-113). Three engines have to agree on this value or the vocabulary
 * silently grows a second row for a tag that already exists:
 *
 *   - the application, here;
 *   - migration `0049`, which converges three legacy columns in SQL;
 *   - the `workspace_tags` CHECK constraints, which assert `tag_key =
 *     lower(tag_key)` in the database itself.
 *
 * SQLite's `lower()` folds ASCII and nothing else, and there is no portable way
 * to make it fold the rest of Unicode. `String.prototype.toLowerCase` would fold
 * more — and would therefore DISAGREE with the migration and the constraint on
 * exactly the inputs where agreement matters. `toLocaleLowerCase` would be worse
 * still: it makes a stored identity depend on the locale of whichever device
 * happened to write it (Turkish `I` is the standing example).
 *
 * The consequence is stated rather than hidden: `Café` and `café` remain two
 * tags. That is the conservative failure — the product keeps two spellings apart
 * rather than merging two things the owner may have meant to keep separate,
 * which is the direction ADR-112 asks a tag migration to fail in.
 */
export function canonicalTagKey(raw: string): string {
  return normaliseTag(raw).replace(/[A-Z]/g, (letter) =>
    String.fromCharCode(letter.charCodeAt(0) + 32),
  );
}

/** The comparison key for duplicate detection, honouring case sensitivity. */
function comparisonKey(tag: string, caseInsensitive: boolean): string {
  return caseInsensitive ? canonicalTagKey(tag) : tag;
}

/**
 * Resolve constraints against the safe defaults, clamping caller values to
 * sensible floors so a zero/negative limit cannot disable the collection or a
 * single tag.
 */
export function resolveTagConstraints(
  constraints: TagConstraints | undefined,
): Required<TagConstraints> {
  return {
    maxTags: Math.max(1, constraints?.maxTags ?? DEFAULT_MAX_TAGS),
    maxTagLength: Math.max(
      1,
      constraints?.maxTagLength ?? DEFAULT_MAX_TAG_LENGTH,
    ),
    caseInsensitive: constraints?.caseInsensitive ?? false,
  };
}

/**
 * Attempt to add one raw tag to `tags`, applying normalisation, the length limit,
 * duplicate prevention and the count limit — in that order. Returns the resulting
 * collection and whether/why the add was refused. Never mutates the input.
 */
export function addTag(
  tags: readonly string[],
  raw: string,
  constraints?: TagConstraints,
): AddTagResult {
  const resolved = resolveTagConstraints(constraints);
  const normalised = normaliseTag(raw);

  if (normalised.length === 0) {
    return { tags, added: false, reason: "empty" };
  }
  if (normalised.length > resolved.maxTagLength) {
    return { tags, added: false, reason: "too-long" };
  }

  const key = comparisonKey(normalised, resolved.caseInsensitive);
  const exists = tags.some(
    (tag) => comparisonKey(tag, resolved.caseInsensitive) === key,
  );
  if (exists) {
    return { tags, added: false, reason: "duplicate" };
  }
  if (tags.length >= resolved.maxTags) {
    return { tags, added: false, reason: "limit" };
  }

  return { tags: [...tags, normalised], added: true, reason: null };
}

/**
 * Remove the tag at `index`, returning a new collection. An out-of-range index
 * returns the collection unchanged, so a stale keyboard/paste event cannot throw.
 */
export function removeTagAt(
  tags: readonly string[],
  index: number,
): readonly string[] {
  if (index < 0 || index >= tags.length) return tags;
  return [...tags.slice(0, index), ...tags.slice(index + 1)];
}

/**
 * Normalise and de-duplicate an incoming collection (e.g. an initial value or a
 * multi-token paste), applying the same rules `addTag` would, and enforcing the
 * count limit by dropping the overflow. Deterministic: earlier entries win.
 */
export function normaliseTagList(
  raw: readonly string[],
  constraints?: TagConstraints,
): readonly string[] {
  let result: readonly string[] = [];
  for (const candidate of raw) {
    const outcome = addTag(result, candidate, constraints);
    if (outcome.added) result = outcome.tags;
  }
  return result;
}
