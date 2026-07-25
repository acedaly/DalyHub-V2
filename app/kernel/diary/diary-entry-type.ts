/**
 * DIARY-01A Diary kernel — the extensible Entry-type vocabulary.
 *
 * A Diary Entry always has a TYPE — the kind of moment it records (a Meeting, a
 * Reflection, a Decision …). The vocabulary is deliberately OPEN and
 * registration-based, never a database enum or a closed TypeScript union:
 *
 *   - At PERSISTENCE, an entry type is an ordinary validated string (a branded
 *     {@link DiaryEntryType}) constrained only by an identifier syntax. So a
 *     future custom type (`custom.workout`) can be stored and round-tripped with
 *     NO migration and NO code change — exactly the future-proofing DIARY-01A
 *     must guarantee (AI-assisted classification, custom user types, imported
 *     types).
 *   - At PRESENTATION, a {@link DiaryEntryTypeRegistry} maps a type to a human
 *     label + description. The kernel ships the nine built-in types; modules and
 *     future features register their own. Registration is a vocabulary concern,
 *     never a storage gate: an entry whose type is not (yet) registered still
 *     reads back and renders via a safe fallback (the caller's job), never a
 *     crash.
 *
 * Dependency-light: plain strings, sets and small classes — no D1, React or
 * Cloudflare types. Labels live here, NEVER in the database (mirrors the module
 * registry's Activity-label rule, ADR-013 §11).
 */

import { DiaryValidationError } from "./diary-errors";

/**
 * A validated Diary entry type identifier. Branded so a raw string cannot be
 * used where a validated type is required — parse it through
 * {@link parseDiaryEntryType} at the boundary.
 */
export type DiaryEntryType = string & { readonly __brand: "DiaryEntryType" };

/** Maximum length of an entry-type identifier, in UTF-16 code units. */
export const DIARY_ENTRY_TYPE_MAX_LENGTH = 64;

/**
 * The identifier syntax for an entry type: lowercase, must start with a letter,
 * then letters/digits/underscores, optionally dot-namespaced (e.g.
 * `reflection`, `custom.workout`). Dots enable future namespaced custom types
 * without colliding with the built-ins. Deliberately the same restrained shape
 * the Activity/EntityLink identifiers use.
 */
export const DIARY_ENTRY_TYPE_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;

/**
 * Validate and brand a raw entry-type string. Accepts ANY syntactically valid
 * identifier (open vocabulary) — it does NOT require the type to be registered,
 * so custom/imported/AI-proposed types persist without a code change. Throws
 * {@link DiaryValidationError} for a non-string, an empty string, an
 * over-length value or one that violates the identifier syntax.
 */
export function parseDiaryEntryType(value: unknown): DiaryEntryType {
  if (typeof value !== "string") {
    throw new DiaryValidationError("entryType", "must be a string");
  }
  if (value.length === 0) {
    throw new DiaryValidationError("entryType", "must not be empty");
  }
  if (value.length > DIARY_ENTRY_TYPE_MAX_LENGTH) {
    throw new DiaryValidationError(
      "entryType",
      `must be at most ${DIARY_ENTRY_TYPE_MAX_LENGTH} characters`,
    );
  }
  if (!DIARY_ENTRY_TYPE_PATTERN.test(value)) {
    throw new DiaryValidationError(
      "entryType",
      "must be a lowercase, optionally dot-namespaced identifier",
    );
  }
  return value as DiaryEntryType;
}

/* -------------------------------------------------------------------------- */
/* Built-in vocabulary                                                        */
/* -------------------------------------------------------------------------- */

/** A registered entry type's presentation metadata. */
export type DiaryEntryTypeDescriptor = {
  /** The validated, branded entry type. */
  readonly type: DiaryEntryType;
  /** Concise human label for future capture/Timeline UI (never stored). */
  readonly label: string;
  /** Optional longer description of what the type records. */
  readonly description?: string;
};

/** The stable identifiers of the nine built-in entry types. */
export const NOTE_ENTRY = parseDiaryEntryType("note");
export const CONVERSATION_ENTRY = parseDiaryEntryType("conversation");
export const MEETING_ENTRY = parseDiaryEntryType("meeting");
export const DECISION_ENTRY = parseDiaryEntryType("decision");
export const IDEA_ENTRY = parseDiaryEntryType("idea");
export const REFLECTION_ENTRY = parseDiaryEntryType("reflection");
export const EVENT_ENTRY = parseDiaryEntryType("event");
export const TRAVEL_ENTRY = parseDiaryEntryType("travel");
export const OBSERVATION_ENTRY = parseDiaryEntryType("observation");

/**
 * The nine built-in entry types, in a stable, product-meaningful order. This is
 * the INITIAL vocabulary (DIARY-01A); it is not exhaustive and is not a
 * closed set — custom types register at runtime.
 */
export const BUILT_IN_DIARY_ENTRY_TYPES: readonly DiaryEntryTypeDescriptor[] = [
  { type: NOTE_ENTRY, label: "Note", description: "A quick captured note." },
  {
    type: CONVERSATION_ENTRY,
    label: "Conversation",
    description: "A conversation had, in person, by phone or online.",
  },
  {
    type: MEETING_ENTRY,
    label: "Meeting",
    description: "A meeting attended.",
  },
  {
    type: DECISION_ENTRY,
    label: "Decision",
    description: "A decision made and the reasoning behind it.",
  },
  {
    type: IDEA_ENTRY,
    label: "Idea",
    description: "An idea worth remembering.",
  },
  {
    type: REFLECTION_ENTRY,
    label: "Reflection",
    description: "A moment of reflection.",
  },
  {
    type: EVENT_ENTRY,
    label: "Event",
    description: "Something that happened.",
  },
  {
    type: TRAVEL_ENTRY,
    label: "Travel",
    description: "A journey or a place visited.",
  },
  {
    type: OBSERVATION_ENTRY,
    label: "Observation",
    description: "Something noticed or observed.",
  },
];

/** The built-in type identifiers as a set for fast membership checks. */
const BUILT_IN_TYPE_SET: ReadonlySet<string> = new Set(
  BUILT_IN_DIARY_ENTRY_TYPES.map((descriptor) => descriptor.type),
);

/** True when `type` is one of the nine built-in entry types. */
export function isBuiltInDiaryEntryType(type: string): boolean {
  return BUILT_IN_TYPE_SET.has(type);
}

/* -------------------------------------------------------------------------- */
/* Registry                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * An immutable, extensible registry of entry-type descriptors. The kernel builds
 * one seeded with the built-ins ({@link createDiaryEntryTypeRegistry}); a caller
 * may derive an extended registry with {@link DiaryEntryTypeRegistry.register}
 * to add custom types. Registration NEVER mutates in place (each `register`
 * returns a fresh registry) and NEVER gates persistence — it only supplies
 * labels for known types. Unknown types resolve to `null` from {@link get},
 * which the presentation layer renders via a safe fallback.
 */
export class DiaryEntryTypeRegistry {
  readonly #byType: ReadonlyMap<string, DiaryEntryTypeDescriptor>;

  constructor(descriptors: readonly DiaryEntryTypeDescriptor[]) {
    const map = new Map<string, DiaryEntryTypeDescriptor>();
    for (const descriptor of descriptors) {
      map.set(descriptor.type, descriptor);
    }
    this.#byType = map;
  }

  /** True when `type` has a registered descriptor. */
  has(type: string): boolean {
    return this.#byType.has(type);
  }

  /** The descriptor for `type`, or `null` when it is not registered. */
  get(type: string): DiaryEntryTypeDescriptor | null {
    return this.#byType.get(type) ?? null;
  }

  /** All registered descriptors, in insertion order. */
  list(): readonly DiaryEntryTypeDescriptor[] {
    return [...this.#byType.values()];
  }

  /**
   * Return a NEW registry with `descriptor` added (or replacing an existing one
   * of the same type). The entry type is re-validated, so a malformed custom
   * type is rejected at registration. The receiver is left unchanged.
   */
  register(descriptor: {
    readonly type: string;
    readonly label: string;
    readonly description?: string;
  }): DiaryEntryTypeRegistry {
    const type = parseDiaryEntryType(descriptor.type);
    if (typeof descriptor.label !== "string" || descriptor.label.length === 0) {
      throw new DiaryValidationError("entryType", "a label is required");
    }
    const next: DiaryEntryTypeDescriptor = {
      type,
      label: descriptor.label,
      ...(descriptor.description !== undefined
        ? { description: descriptor.description }
        : {}),
    };
    return new DiaryEntryTypeRegistry([...this.#byType.values(), next]);
  }
}

/** Build the default registry seeded with the nine built-in entry types. */
export function createDiaryEntryTypeRegistry(): DiaryEntryTypeRegistry {
  return new DiaryEntryTypeRegistry(BUILT_IN_DIARY_ENTRY_TYPES);
}
