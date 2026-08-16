/**
 * The controlled vocabulary of icon keys an Area, a Project or a Goal may carry.
 *
 * This lives in the KERNEL, not in the UI, because it is the thing the write
 * boundary validates: a key arrives from an untrusted form, is checked against
 * this list server-side, and is persisted. The mapping from key to a drawn glyph
 * is a UI concern and lives in `app/shared/entity/entity-icon-catalogue.tsx` —
 * which is what lets the drawing change without the data changing.
 *
 * WHAT A KEY IS. A stable semantic name: `travel`, `property`, `finance`. Never
 * SVG, never HTML, never an icon-font codepoint, never a React component name,
 * never a URL, never arbitrary text, never an emoji. A key survives a redraw of
 * the icon it names; a component name would not, and markup would be a hole
 * straight into a rendered page.
 *
 * WHY THIS LIST AND NOT A LONGER ONE. Every key here resolves to an icon DalyHub
 * already exports through `createIcon`. A key with no icon behind it is a
 * catalogue entry that renders nothing, so the vocabulary is bounded by the icon
 * set rather than by imagination: adding `fitness` means adding a fitness glyph
 * first, in the same generated icon pipeline as every other, and then adding the
 * key here and in the catalogue. `test/unit/entity-icons` fails if the two ever
 * disagree, so the pair cannot drift.
 *
 * Keys are append-only in practice. Removing one does not corrupt anything — an
 * unrecognised stored key renders the entity's default icon — but it does
 * silently change what an owner chose, so removal is a deliberate act, not a
 * tidy-up.
 */

/**
 * Every icon key an Area, Project or Goal may carry.
 *
 * ORDER IS APPEND-ONLY, not catalogue order. The first thirty-four are the keys
 * PX-02/0032 shipped, in the order they shipped in; IDENTITY-01's sixty-seven
 * follow. The picker groups by CATEGORY and reads its order from the catalogue,
 * so this list never has to be re-sorted — and a list that is never re-sorted is
 * a list a stored value can never fall out of.
 */
export const ENTITY_ICON_KEYS = [
  // General
  "folder",
  "task",
  "target",
  "checklist",
  "board",
  "grid",
  "inbox",
  "tag",
  "archive",
  // Work and projects
  "document",
  "licence",
  "subscription",
  "software",
  "equipment",
  "tool",
  // Home and property
  "property",
  "appliance",
  "electronics",
  // People and communication
  "person",
  "chat",
  "meeting",
  // Time
  "calendar",
  "today",
  // Learning and thinking
  "note",
  "idea",
  "decision",
  "observation",
  "reflection",
  "diary",
  "review",
  // Travel
  "travel",
  "vehicle",
  "trailer",
  // Safety
  "shield",

  /* ---------------------------------------------------------------------- */
  /* IDENTITY-01 — the vocabulary grows to cover a whole life                */
  /* ---------------------------------------------------------------------- */
  /*
   * Thirty-four keys covered the parts of a life this product happened to have
   * built modules for, which is not the same as the parts of a life an owner
   * actually runs. There was no heart, no book, no plane, no coffee — nothing
   * for health, money, learning, leisure or the outdoors, which between them are
   * most of what Areas are FOR.
   *
   * Every key below resolves to a glyph in `entity-glyphs.tsx`, drawn in one
   * stroke idiom at one weight, because a vocabulary is only as useful as its
   * consistency: ninety glyphs that do not look like one another are a worse
   * picker than thirty that do.
   *
   * Nothing above is renamed or removed. A key an owner already chose still
   * means exactly what it meant.
   */

  // Things and containers
  "box",

  // Work and money
  "briefcase",
  "presentation",
  "chart",
  "handshake",
  "award",
  "finance",
  "savings",
  "receipt",
  "bank",

  // Home and garden
  "furniture",
  "cleaning",
  "key",
  "garden",
  "plant",

  // Health and fitness
  "heart",
  "fitness",
  "running",
  "cycling",
  "swimming",
  "yoga",
  "sleep",
  "nutrition",
  "medical",

  // Technology and making
  "monitor",
  "server",
  "camera",
  "robot",
  "rocket",

  // People
  "baby",
  "ring",

  // Learning
  "book",
  "graduation",
  "language",
  "science",
  "puzzle",

  // Life and leisure
  "music",
  "guitar",
  "film",
  "game",
  "art",
  "gift",
  "celebration",
  "coffee",
  "food",
  "wine",
  "paw",

  // Travel and outdoors
  "plane",
  "map",
  "compass",
  "camping",
  "hiking",
  "beach",
  "mountain",

  // Time and nature
  "clock",
  "sun",
  "moon",
  "star",
  "leaf",
  "fire",
  "water",
  "lightning",
  "globe",
  "flag",
  "anchor",
  "lock",
  "bell",
] as const;

/** An icon key an Area, Project or Goal may carry. */
export type EntityIconKey = (typeof ENTITY_ICON_KEYS)[number];

const ENTITY_ICON_KEY_SET: ReadonlySet<string> = new Set(ENTITY_ICON_KEYS);

/** True when `value` is a key this build recognises. */
export function isEntityIconKey(value: unknown): value is EntityIconKey {
  return typeof value === "string" && ENTITY_ICON_KEY_SET.has(value);
}

/**
 * Normalise an icon key arriving from an untrusted boundary — a form field, an
 * import, a snapshot.
 *
 * Returns the key when it is recognised and `null` otherwise. `null` is the
 * meaningful value, not an error: it is what "no chosen icon, use the entity
 * default" is stored as, and it is what an empty form field means.
 *
 * A key this build does not recognise is REJECTED here rather than stored,
 * because storing it would let a typo or a hostile payload sit in the database
 * pretending to be a choice. A key already IN the database that this build does
 * not recognise is a different case and is handled in the UI, where it falls back
 * to the default rather than throwing — see the catalogue's resolver.
 */
export function normaliseEntityIconKey(value: unknown): EntityIconKey | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return isEntityIconKey(trimmed) ? trimmed : null;
}

/**
 * Whether a non-empty value was supplied that is NOT a valid key.
 *
 * `normaliseEntityIconKey` folds "absent" and "invalid" together into `null`,
 * which is the right behaviour for storage but the wrong behaviour for
 * validation: a form that silently discards a bad value tells the owner their
 * choice was saved when it was not. A write path that wants to REFUSE a bad key
 * asks this first.
 */
export function isRejectedEntityIconKey(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value !== "string") {
    return true;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 && !isEntityIconKey(trimmed);
}
