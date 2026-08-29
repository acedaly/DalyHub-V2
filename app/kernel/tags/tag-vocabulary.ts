/**
 * V2.6 FIND-02 — the tag vocabulary domain (pure, storage-free, React-free).
 *
 * **A tag is a VOCABULARY, never a second structure** (ADR-112 decision 4). It
 * labels a record; it never parents one, never carries progress, never orders a
 * collection and never reaches the kernel next-action rule. Areas, Goals and
 * Projects are structure; tags are words. The two are not interchangeable and
 * this module deliberately offers nothing that would let them become so — no
 * parent, no colour, no rank, no rule, no hierarchy.
 *
 * ── What a tag is, exactly ───────────────────────────────────────────────────
 *
 * One row in the workspace's vocabulary, identified by its canonical
 * {@link canonicalTagKey} and displayed with the casing the owner typed. Any
 * entity may carry any number of them, up to {@link MAX_ENTITY_TAGS}. The
 * attachment is not an EntityLink and the tag is not an entity: a tag has no
 * record page, no timeline and no Activity of its own, and making it an entity
 * would hand it all three by construction (ADR-113).
 *
 * ── Where validation lives ───────────────────────────────────────────────────
 *
 * Here, once, for every entity type. People, Assets and Notes each had their own
 * validator with its own case rule before FIND-02; the divergence between them
 * IS DEBT-182. {@link validateEntityTags} replaces all three.
 */

import {
  DEFAULT_MAX_TAG_LENGTH,
  DEFAULT_MAX_TAGS,
  canonicalTagKey,
  normaliseTag,
} from "./tag-normalisation";

/** The most tags one entity may carry. */
export const MAX_ENTITY_TAGS = DEFAULT_MAX_TAGS;

/** The longest a single tag may be, in characters. */
export const MAX_TAG_LENGTH = DEFAULT_MAX_TAG_LENGTH;

/**
 * The ceiling on ONE vocabulary read.
 *
 * FIND-02 acceptance criterion 5: the vocabulary is one query with a STATED
 * ceiling, flat in workspace size. This is that number. It bounds the rows the
 * statement may return; it is not a cap on how many tags a workspace may hold.
 */
export const TAG_VOCABULARY_READ_LIMIT = 200;

/**
 * How many tags one filter may name. Bounded so a Tasks query stays inside D1's
 * 100-bound-parameter ceiling with every other dimension present at once.
 */
export const MAX_TAG_FILTER_MEMBERS = 10;

/** Control characters, which a tag may never contain. */
// eslint-disable-next-line no-control-regex -- reject C0/C1 control characters.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/;

/** A tag as the workspace vocabulary holds it. */
export interface WorkspaceTag {
  /** The canonical identity — folded, whitespace-normalised. */
  readonly key: string;
  /** The display form: the casing the owner typed when the tag first appeared. */
  readonly label: string;
}

/** A vocabulary entry with the number of records currently carrying it. */
export interface WorkspaceTagUsage extends WorkspaceTag {
  readonly count: number;
}

/** A tag value that failed validation, and why. */
export class TagValidationError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(`${field} ${message}`);
    this.name = "TagValidationError";
    this.field = field;
  }
}

/** Count code points, so an emoji or an astral character costs one, not two. */
function codePointLength(value: string): number {
  return [...value].length;
}

/**
 * Validate and canonicalise one entity's whole tag set.
 *
 * The ONE validator, for every entity type. Each entry is normalised, bounded
 * and de-duplicated **by canonical key** — so `Errand` and `errand` in one
 * submission collapse to one tag, first spelling winning, exactly as they
 * collapse across two records in the vocabulary.
 *
 * The result is ordered by canonical key so a stored set is CANONICAL: an
 * unchanged set compares equal without a set-difference helper, which is what
 * lets a repository decide "nothing changed" and append no Activity event.
 *
 * `field` names the caller's field so a message reads in the caller's own terms.
 */
export function validateEntityTags(
  value: unknown,
  field = "tags",
): readonly WorkspaceTag[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new TagValidationError(field, "must be a list of tags");
  }
  const byKey = new Map<string, WorkspaceTag>();
  for (const raw of value) {
    if (typeof raw !== "string") {
      throw new TagValidationError(field, "must be a list of tags");
    }
    const label = normaliseTag(raw);
    if (label.length === 0) continue;
    if (codePointLength(label) > MAX_TAG_LENGTH) {
      throw new TagValidationError(
        field,
        `must each be ${MAX_TAG_LENGTH} characters or fewer`,
      );
    }
    // A control character would survive JSON, break the `char(31)`-delimited
    // projection every tagged read uses, and make a token unquotable in the
    // capture grammar. Refused at the door rather than escaped downstream.
    if (CONTROL_CHARACTERS.test(label)) {
      throw new TagValidationError(
        field,
        "must not contain control characters",
      );
    }
    const key = canonicalTagKey(label);
    if (byKey.has(key)) continue;
    byKey.set(key, { key, label });
  }
  if (byKey.size > MAX_ENTITY_TAGS) {
    throw new TagValidationError(
      field,
      `must be ${MAX_ENTITY_TAGS} tags or fewer`,
    );
  }
  return [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

/**
 * Parse the wire form of a tag set into a validated set.
 *
 * Accepts the JSON array every shared form posts and, defensively, a
 * comma-separated string — so a no-JavaScript submission or a hand-written
 * request behaves rather than silently dropping the owner's tags. Kept here so
 * no route invents its own splitting rule.
 */
export function parseEntityTagInput(
  value: unknown,
  field = "tags",
): readonly WorkspaceTag[] {
  if (typeof value !== "string") return validateEntityTags(value, field);
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new TagValidationError(field, "must be a list of tags");
    }
    return validateEntityTags(parsed, field);
  }
  return validateEntityTags(trimmed === "" ? [] : trimmed.split(","), field);
}

/** The display labels of a validated set, in canonical order. */
export function tagLabels(tags: readonly WorkspaceTag[]): readonly string[] {
  return tags.map((tag) => tag.label);
}

/** The canonical keys of a validated set, in canonical order. */
export function tagKeys(tags: readonly WorkspaceTag[]): readonly string[] {
  return tags.map((tag) => tag.key);
}

/**
 * Canonicalise a set of tag KEYS a filter or a URL supplied.
 *
 * Total and lenient, matching the declarative view configuration's own parsing
 * rule: anything unusable is dropped rather than thrown, duplicates collapse,
 * the result is ordered, and the set is bounded by
 * {@link MAX_TAG_FILTER_MEMBERS} so a crafted URL cannot widen a query.
 */
export function parseTagFilterKeys(value: unknown): readonly string[] {
  const raw: unknown[] = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const key = canonicalTagKey(entry);
    if (key.length === 0 || codePointLength(key) > MAX_TAG_LENGTH) continue;
    if (CONTROL_CHARACTERS.test(key)) continue;
    seen.add(key);
    if (seen.size >= MAX_TAG_FILTER_MEMBERS) break;
  }
  return [...seen].sort();
}
